import { performance } from 'node:perf_hooks';
import { expect, it, vi } from 'vitest';
import { EmailError, type ClaimedEmail, type EmailRunReport, type EmailStore, type HandoffGrant } from '../../src';
import { COUNTS, expectRedacted } from '../conformance/smtp-capacity-fixture';
import { A, applied, lostAck } from '../conformance/store-fixtures';
import {
  assertMime,
  attemptId,
  closedPeer,
  COUNT,
  evidence,
  FINAL_250,
  fixedStoreTime,
  idle,
  ONE,
  PRIVATE_REPLY,
  scenario,
  wire,
} from './capacity-fixture';
import { atBarrier, latch, type LoopbackSmtpPeer } from './loopback';

const TIMING = process.env.SMTP_CAPACITY_TIMING === '1';
const TRANSIENT_451 = `451 ${PRIVATE_REPLY}\r\n`;
const MIXED_CODES = [250, 450, 251, 550] as const;
const SHORT_IO_MS = 2_000;

function printSample(sample: Record<string, string | number>) {
  if (TIMING) process.stdout.write(`SMTP_CAPACITY_SAMPLE ${JSON.stringify(sample)}\n`);
}

/** A real delayed wire write, never a worker/provider mock or timer against a fake clock. */
function defer(peer: LoopbackSmtpPeer, ms: number, write: () => void) {
  const timer = setTimeout(write, ms);
  void peer.closed.then(() => clearTimeout(timer));
}

function serialRcpt(delayMs: number, codes: readonly number[]) {
  let commands = 0;
  let replies = 0;
  let early = 0;
  let replyWaitMs = 0;
  return {
    rcpt(peer: LoopbackSmtpPeer) {
      if (commands !== replies) early++;
      const code = codes[commands++ % codes.length];
      const start = performance.now();
      defer(peer, delayMs, () => {
        replyWaitMs += performance.now() - start;
        replies++;
        peer.write(`${code} ${PRIVATE_REPLY}\r\n`);
      });
      return null;
    },
    data() {
      if (replies !== COUNT) early++;
    },
    sample: () => ({ delayMs, commands, replies, early, replyWaitMs }),
  };
}

function duringRun<T>(event: Promise<T>, run: Promise<EmailRunReport>, label: string, diagnosticMs?: number) {
  return atBarrier(
    Promise.race([
      event,
      run.then(({ stop, items }) => {
        throw new Error(`Run stopped (${stop}/${items[0]?.reason}) before ${label}`);
      }),
    ]),
    label,
    diagnosticMs,
  );
}

async function qualify(mode: 'starttls' | 'implicit', delayMs: number) {
  const extended = delayMs > 5;
  const providerTimeoutMs = extended ? 60_000 : 15_000;
  const runTimeoutMs = extended ? 75_000 : 30_000;
  const sRcpt = serialRcpt(delayMs, MIXED_CODES);
  const final = latch<() => void>();
  let finalWaitMs = 0;
  const s = await scenario({
    mode,
    large: true,
    plan: {
      reply(step, peer) {
        if (step === 'rcpt') return sRcpt.rcpt(peer);
        if (step === 'data') sRcpt.data();
        if (step === 'final') {
          const at = performance.now();
          final.release(() =>
            defer(peer, 30, () => {
              finalWaitMs = performance.now() - at;
              peer.write(FINAL_250);
            }),
          );
          return null;
        }
      },
    },
  });
  const marked = latch<HandoffGrant>();
  const ack = latch<void>();
  const backing: EmailStore = {
    ...s.store,
    async markHandoff(...args) {
      const grant = await s.store.markHandoff(...args);
      if (!grant) throw new Error('Expected a committed handoff');
      marked.release(grant);
      await ack.reached;
      return grant;
    },
  };
  const worker = s.worker({ backing, ...(extended ? { limits: { providerTimeoutMs, leaseMs: 90_000 } } : {}) });
  const runStart = performance.now();
  const pending = worker.run(extended ? { ...ONE, timeoutMs: runTimeoutMs } : ONE);
  let marker: HandoffGrant;
  try {
    marker = await duringRun(marked.reached, pending, 'handoff before ACK');
    expect(await s.admin.getJob(s.job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
    expect(s.submissions).toHaveLength(0);
    expect(s.relay.peers).toHaveLength(0);
  } finally {
    ack.release();
  }
  const complete = await duringRun(final.reached, pending, 'DATA terminator before final reply', providerTimeoutMs);
  expect(await s.admin.getJob(s.job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
  complete();
  const report = await pending;
  const runMs = performance.now() - runStart;
  const id = attemptId(report, s, 'partially_accepted');
  expect(report).toMatchObject({ stop: 'limit', counts: { providerCalls: 1, submitted: 1, persistenceFailures: 0 } });
  const peer = await wire(s);
  const data = peer.messages[0]!;
  assertMime(data, s.snapshot, s.resolved, id);
  expect(finalWaitMs).toBeGreaterThanOrEqual(25);
  const serial = sRcpt.sample();
  expect(serial).toMatchObject({ commands: COUNT, replies: COUNT, early: 0 });
  expect(serial.replyWaitMs).toBeGreaterThan(COUNT * (delayMs - 1));

  const recipients = evidence(s.snapshot, (ordinal) => (ordinal % 2 === 0 ? 'accepted' : 'rejected'));
  expect(recipients.filter(({ status }) => status === 'accepted')).toHaveLength(500);
  const result = {
    outcome: 'partially_accepted',
    retry: 'never',
    stage: 'data',
    reason: 'smtp_partial',
    messageId: `<${id}@email.invalid>`,
    recipients,
  };
  const [submission] = s.submissions;
  expect(submission?.result).toEqual(result);
  expect(submission?.timeoutMs).toBeLessThanOrEqual(providerTimeoutMs);
  expect(submission?.timeoutMs).toBeGreaterThan(providerTimeoutMs - 100);
  const stored = await s.readAttempt(id);
  expect(stored).toMatchObject({ ordinal: 1, handedOffAt: marker.handoffAt, disposition: 'partially_accepted' });
  expect(stored?.result).toEqual(result);
  expect(stored).not.toHaveProperty('retryAt');
  const job = await s.admin.getJob(s.job.jobId);
  expect(job).toMatchObject({
    smtpCapacity: s.smtpCapacity,
    state: 'terminal',
    disposition: 'partially_accepted',
    attemptCount: 1,
    unknownOpen: false,
  });
  expect(await s.admin.reconcile({ limit: 2 })).toMatchObject({ stop: 'idle', acknowledged: 1 });
  const { items } = await s.admin.listActivities({ jobId: s.job.jobId });
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ smtpCapacity: s.smtpCapacity, attemptId: id, recipientCounts: COUNTS });
  expect(items[0]?.result).toEqual(result);
  const redacted = [report, job, stored, items];
  expectRedacted(redacted);
  expect(JSON.stringify(redacted)).not.toContain(PRIVATE_REPLY);
  await idle(s, 1);
  printSample({
    mode,
    target: COUNT,
    runTimeoutMs,
    providerTimeoutMs,
    effectiveMs: submission!.timeoutMs,
    submitMs: submission!.elapsedMs!,
    runMs,
    ...serial,
    finalWaitMs,
    dataBytes: Buffer.byteLength(data, 'latin1'),
    tlsVersion: peer.protocol!,
    outcome: result.outcome,
  });
}

it(
  'qualifies a full, serial 1,000-recipient STARTTLS envelope with 5 ms replies under default limits',
  () => qualify('starttls', 5),
  20_000,
);

it.skipIf(!TIMING).each([25, 50])(
  'measures the full 1,000-recipient implicit TLS envelope with %d ms replies under the 60 s provider limit',
  (delayMs) => qualify('implicit', delayMs),
  85_000,
);

it.each(['untrusted CA', 'wrong name'])('fails closed at 1,000 with a %s before credentials or MAIL', async (fault) => {
  const s = await scenario({
    mode: 'starttls',
    ...(fault === 'untrusted CA' ? { trustFixture: false } : { servername: 'different.loopback.invalid' }),
  });
  const report = await s.worker().run(ONE);
  const id = attemptId(report, s, 'failed');
  expect((await s.readAttempt(id))?.result).toEqual({
    outcome: 'unsubmitted',
    retry: 'never',
    stage: 'tls',
    reason: 'provider_configuration',
  });
  const peer = await closedPeer(s);
  expect(peer.secure).toEqual([]);
  expect(peer.messages).toEqual([]);
  await idle(s, 1);
});

it('closes an in-flight RCPT at 60 ms/reply when a shorter run clips the provider deadline, without DATA or retry', async () => {
  const sRcpt = serialRcpt(60, [250]);
  const s = await scenario({
    plan: {
      reply(step, peer) {
        if (step === 'rcpt') return sRcpt.rcpt(peer);
        if (step === 'data') sRcpt.data();
      },
    },
  });
  const start = performance.now();
  const report = await s.worker().run({ ...ONE, timeoutMs: SHORT_IO_MS });
  const runMs = performance.now() - start;
  const id = attemptId(report, s, 'unknown');
  const submission = s.submissions[0]!;
  expect(submission.timeoutMs).toBeLessThan(SHORT_IO_MS);
  expect(submission.result).toMatchObject({ outcome: 'unknown', retry: 'never', stage: 'envelope' });
  // The provider timer or the (clipping) worker run timer can fire first.
  expect(['provider_timeout', 'provider_aborted']).toContain(submission.result?.reason);
  const stored = await s.readAttempt(id);
  expect(stored?.result).toMatchObject({ outcome: 'unknown', retry: 'never', reason: 'provider_timeout' });
  expect(stored).not.toHaveProperty('retryAt');
  await closedPeer(s);
  const serial = sRcpt.sample();
  expect(serial.commands).toBeGreaterThan(1);
  expect(serial.commands).toBeLessThan(COUNT);
  expect(serial.early).toBe(0);
  expect(serial.commands - serial.replies).toBeLessThanOrEqual(1);
  const peer = await wire(s, { rcpts: serial.commands, data: false });
  await idle(s, 1);
  printSample({
    mode: s.mode,
    target: COUNT,
    runTimeoutMs: SHORT_IO_MS,
    providerTimeoutMs: 15_000,
    effectiveMs: submission.timeoutMs,
    submitMs: submission.elapsedMs!,
    runMs,
    ...serial,
    finalWaitMs: 0,
    dataBytes: 0,
    tlsVersion: peer.protocol!,
    outcome: stored!.result.reason,
  });
});

it.each(['missing', 'late', 'truncated negative'] as const)(
  'does not infer nonacceptance after a %s final reply at 1,000',
  async (fault) => {
    let pulses: (() => number) | undefined;
    const s = await scenario({
      plan: {
        reply(step, peer) {
          if (step !== 'final') return;
          if (fault === 'late') {
            peer.write('250-acknowledgement pending\r\n');
            pulses = peer.pulse('250-still pending\r\n', 30);
          }
          if (fault === 'truncated negative') peer.end('451 incomplete negative without CRLF');
          return null;
        },
      },
    });
    const report = await s.worker({ limits: { providerTimeoutMs: SHORT_IO_MS } }).run(ONE);
    const id = attemptId(report, s, 'unknown');
    const peer = await wire(s);
    if (fault === 'late') {
      expect(pulses?.()).toBeGreaterThan(1);
      peer.write(FINAL_250); // Attempt completion only after the client has torn down real I/O.
    }
    const commit = await s.readAttempt(id);
    expect(commit?.result).toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'data',
      reason: fault === 'truncated negative' ? 'transport_uncertain' : 'provider_timeout',
    });
    expect(commit).not.toHaveProperty('retryAt');
    expect(await s.admin.getJob(s.job.jobId)).toMatchObject({ disposition: 'unknown', unknownOpen: true });
    await idle(s, 1);
  },
);

it('aborts real DATA I/O at 1,000 before the terminator rather than returning while the stream sends', async () => {
  const controller = new AbortController();
  let bodyLines = 0;
  const s = await scenario({
    large: true,
    plan: {
      bodyLine() {
        if (++bodyLines === 1) controller.abort();
      },
    },
  });
  const report = await s.worker().run({ ...ONE, signal: controller.signal });
  const id = attemptId(report, s, 'unknown');
  expect(report).toMatchObject({ stop: 'aborted', counts: { providerCalls: 1, retryScheduled: 0, unknown: 1 } });
  expect(bodyLines).toBeGreaterThan(0);
  const result = {
    outcome: 'unknown',
    retry: 'never',
    stage: 'data',
    reason: 'provider_aborted',
  };
  expect(s.submissions[0]?.result).toEqual(result);
  expect((await s.readAttempt(id))?.result).toEqual(result);
  await wire(s, { messages: 0 });
  await idle(s, 1);
});

it('retries the same envelope only after explicit transient all-RCPT and post-DATA refusals at 1,000', async () => {
  const clock = fixedStoreTime();
  let transaction = 0;
  const s = await scenario({
    clock,
    plan: {
      reply(step) {
        if (step === 'mail') transaction++;
        if ((step === 'rcpt' && transaction === 1) || (step === 'final' && transaction === 2)) return TRANSIENT_451;
      },
    },
  });
  s.setHtml('replacement content must not be rendered on retry');
  const worker = s.worker();
  const ids: string[] = [];
  for (const [peerIndex, stage] of ['envelope', 'data'].entries()) {
    const report = await worker.run(ONE);
    const id = attemptId(report, s, 'retry_scheduled');
    ids.push(id);
    expect(report.counts).toMatchObject({ providerCalls: 1, submitted: 0 });
    const commit = await s.readAttempt(id);
    expect(commit).toMatchObject({ disposition: 'retry_scheduled', ordinal: peerIndex + 1 });
    expect(commit?.result).toEqual({
      outcome: 'rejected',
      retry: 'safe_transient',
      stage,
      reason: 'smtp_transient_reply',
      ...(stage === 'envelope' ? { recipients: evidence(s.snapshot, () => 'rejected') } : {}),
    });
    const peer = await wire(s, { peerIndex, data: stage === 'data' });
    if (stage === 'data') assertMime(peer.messages[0]!, s.snapshot, s.resolved, id);
    expect(await s.admin.getJob(s.job.jobId)).toMatchObject({
      state: 'queued',
      nextAt: commit?.retryAt,
      attemptCount: peerIndex + 1,
    });
    await idle(s, peerIndex + 1);
    clock.advanceTo(commit!.retryAt!);
  }
  const report = await worker.run(ONE);
  const id = attemptId(report, s, 'accepted');
  expect(new Set([...ids, id]).size).toBe(3);
  const accepted = await s.readAttempt(id);
  expect(accepted).toMatchObject({ ordinal: 3, disposition: 'accepted' });
  expect(accepted?.result.recipients).toEqual(evidence(s.snapshot, () => 'accepted'));
  const peer = await wire(s, { peerIndex: 2 });
  assertMime(peer.messages[0]!, s.snapshot, s.resolved, id);
  expect(s.prepare).toHaveBeenCalledTimes(1);
  await idle(s, 3);
});

const ACK_LOSS = ['before_commit', 'after_commit'] as const;

it.each(ACK_LOSS)('recovers the 1,000-recipient job after handoff ACK loss: %s', async (side) => {
  const clock = fixedStoreTime();
  const s = await scenario({ clock });
  const claimNext = vi.fn(s.store.claimNext);
  const marked: { grant?: HandoffGrant } = {};
  const markHandoff = vi.fn<EmailStore['markHandoff']>((...args) =>
    lostAck(side, async () => {
      const grant = await s.store.markHandoff(...args);
      if (!grant) throw new Error('Expected a real handoff before losing its ACK');
      marked.grant = grant;
      return grant;
    }),
  );
  const report = await s.worker({ backing: { ...s.store, claimNext, markHandoff } }).run(ONE);
  const id = attemptId(report, s, 'unconfirmed');
  expect(report).toMatchObject({ stop: 'store_error', counts: { providerCalls: 0, persistenceFailures: 1 } });
  expect(markHandoff).toHaveBeenCalledOnce();
  const claim = applied<ClaimedEmail>(await claimNext.mock.results[0]!.value);
  const handedOff = side === 'after_commit';
  expect(await s.admin.getJob(s.job.jobId)).toMatchObject({
    state: 'leased',
    phase: handedOff ? 'handed_off' : 'pre_handoff',
  });
  expect(await s.readAttempt(id)).toBeNull();
  await idle(s, 0);

  const grant = marked.grant ?? claim.lease;
  clock.advanceTo(grant.leaseEndsAt);
  const leaseMs = grant.leaseEndsAt - grant.grantedAt;
  expect(await s.store.markHandoff(A, claim.fence, leaseMs, s.call)).toBeNull();
  expect(await s.store.renew(A, claim.fence, leaseMs, s.call)).toBeNull();
  const successor = s.worker();
  const recovered = await successor.run({ ...ONE, maintenanceLimit: 1 });
  expect(recovered).toMatchObject({
    items: [
      {
        operation: 'recover',
        attemptId: id,
        status: handedOff ? 'unknown' : 'retry_scheduled',
        providerInvoked: false,
      },
    ],
    counts: { recovered: 1, claimed: 0, providerCalls: 0 },
  });
  const commit = await s.readAttempt(id);
  expect(commit?.handedOffAt).toBe(marked.grant?.handoffAt);
  expect(commit?.result).toEqual({
    outcome: handedOff ? 'unknown' : 'unsubmitted',
    retry: handedOff ? 'never' : 'safe_transient',
    stage: 'pre_handoff',
    reason: handedOff ? 'post_handoff_lease_expired' : 'pre_handoff_lease_expired',
  });
  await idle(s, 0);
  if (handedOff) {
    expect(commit).not.toHaveProperty('retryAt');
    expect(await s.admin.getJob(s.job.jobId)).toMatchObject({ disposition: 'unknown', unknownOpen: true });
  } else {
    clock.advanceTo(commit!.retryAt!);
    const nextId = attemptId(await successor.run(ONE), s, 'accepted');
    expect(nextId).not.toBe(id);
    expect(await s.readAttempt(nextId)).toMatchObject({ ordinal: 2, disposition: 'accepted' });
    expect(await s.readAttempt(id)).toEqual(commit);
    await wire(s);
    await idle(s, 1);
  }
});

it('closes the launch window near expiry despite a real handoff ACK for 1,000', async () => {
  const clock = fixedStoreTime();
  // Inside the 1 s launch margin, and before the earliest possible retry (50 ms).
  const s = await scenario({ clock, expiresAt: clock.now() + 40 });
  const report = await s.worker().run(ONE);
  const id = attemptId(report, s, 'expired');
  expect(report.counts).toMatchObject({ providerCalls: 0, expired: 1 });
  expect(await s.readAttempt(id)).toMatchObject({
    disposition: 'expired',
    handedOffAt: clock.now(),
    result: { outcome: 'unsubmitted', retry: 'safe_transient', reason: 'launch_window_closed', stage: 'pre_handoff' },
  });
  await idle(s, 0);
});

it.each(ACK_LOSS)('never repeats SMTP after real acceptance and an unconfirmed finish at 1,000: %s', async (side) => {
  const clock = fixedStoreTime();
  const s = await scenario({ clock });
  const markHandoff = vi.fn(s.store.markHandoff);
  const finish = vi.fn<EmailStore['finish']>((...args) => lostAck(side, () => s.store.finish(...args)));
  const findAttempt = vi.fn<EmailStore['findAttempt']>(async () => {
    throw new EmailError('store_unavailable'); // Hide both exact proofs from this worker only.
  });
  const report = await s.worker({ backing: { ...s.store, markHandoff, finish, findAttempt } }).run(ONE);
  const id = attemptId(report, s, 'unconfirmed');
  expect(report).toMatchObject({
    stop: 'store_error',
    items: [{ providerInvoked: true }],
    counts: { providerCalls: 1, unconfirmed: 1, submitted: 0, persistenceFailures: 4 },
  });
  const peer = await wire(s);
  const request = finish.mock.calls[0]![1];
  expect(finish).toHaveBeenCalledTimes(2);
  expect(finish.mock.calls[1]![1]).toBe(request); // Same immutable fence, operation ID and full evidence.
  expect(findAttempt.mock.calls.map(([scope, jobId, attempt]) => [scope, jobId, attempt])).toEqual([
    [A, s.job.jobId, id],
    [A, s.job.jobId, id],
  ]);
  expect(request.result).toEqual({
    outcome: 'accepted',
    retry: 'never',
    stage: 'data',
    reason: 'smtp_accepted',
    messageId: `<${id}@email.invalid>`,
    recipients: evidence(s.snapshot, () => 'accepted'),
  });
  assertMime(peer.messages[0]!, s.snapshot, s.resolved, id);
  await idle(s, 1);
  const grant = await markHandoff.mock.results[0]!.value;
  if (!grant) throw new Error('Expected the acknowledged handoff before the SMTP submission');
  clock.advanceTo(grant.leaseEndsAt);
  if (side === 'after_commit') {
    expect(await s.readAttempt(id)).toMatchObject({
      operationId: request.operationId,
      result: request.result,
      disposition: 'accepted',
      ordinal: 1,
    });
    expect(await s.admin.getJob(s.job.jobId)).toMatchObject({ disposition: 'accepted', attemptCount: 1 });
  } else {
    expect(await s.readAttempt(id)).toBeNull();
    expect(await s.admin.getJob(s.job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
    const recovered = await s.worker().run({ ...ONE, maintenanceLimit: 1 });
    expect(recovered).toMatchObject({
      items: [{ operation: 'recover', attemptId: id, status: 'unknown', providerInvoked: false }],
      counts: { recovered: 1, claimed: 0, submitted: 0, providerCalls: 0 },
    });
    const stored = await s.readAttempt(id);
    expect(stored).toMatchObject({
      handedOffAt: grant.handoffAt,
      disposition: 'unknown',
      result: { outcome: 'unknown', retry: 'never', reason: 'post_handoff_lease_expired' },
    });
    expect(stored?.operationId).not.toBe(request.operationId);
    expect(await s.store.finish(A, request, s.call)).toBeNull();
    expect(await s.readAttempt(id)).toEqual(stored);
  }
  await idle(s, 1);
});
