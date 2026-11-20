import { expect, it } from 'vitest';
import type { AttemptResult, EmailStore, HandoffGrant, OwnerFence } from '../../src';
import { A, B, CALL, RECIPIENTS } from '../conformance/store-fixtures';
import { PROFILE } from '../sendgrid/fixtures';
import { latch } from '../smtp/loopback';
import { atBarrier, GRID_ID, NAME, PRIVATE_REPLY, type Lifecycle } from './fixture';

const acceptedCases = [
  { kind: 'smtp', plan: 'accept', outcome: 'accepted' },
  { kind: 'smtp', plan: 'partial', outcome: 'partially_accepted' },
  { kind: 'sendgrid', plan: 'accept', outcome: 'accepted' },
  { kind: 'sandbox', plan: 'accept', outcome: 'validated' },
] as const;

export function lifecycleOutcomes(fixture: () => Lifecycle) {
  it.each(acceptedCases)('requires the marker ACK for $kind/$plan ($outcome)', async ({ kind, plan, outcome }) => {
    const f = fixture();
    const s = await f.scenario(kind, plan);
    const { primary, peer } = f.queue;
    const admission =
      kind === 'sandbox'
        ? await s.service().enqueuePrepared(await s.registry.prepare(A, s.command))
        : await s.service().enqueue(s.command);
    const { jobId } = admission.job;
    expect(admission).toMatchObject({ status: 'enqueued', job: { state: 'queued', attemptCount: 0 } });
    const other = await s.service(peer, B).enqueue(s.command);
    expect(other).toMatchObject({ status: 'enqueued', job: { scope: B } });
    expect(other.job.jobId).not.toBe(jobId);
    expect(await f.job(jobId, B)).toBeNull();
    s.wire.assertCount(0);

    const bothClaiming = latch<void>();
    const markerCommitted = latch<{ grant: HandoffGrant; fence: OwnerFence; observer: EmailStore }>();
    const returnMarker = latch<void>();
    let claiming = 0;
    function contender(store: EmailStore, observer: EmailStore) {
      const claimNext: EmailStore['claimNext'] = async (...args) => {
        if (++claiming === 2) bothClaiming.release();
        await bothClaiming.reached;
        return store.claimNext(...args);
      };
      const markHandoff: EmailStore['markHandoff'] = async (...args) => {
        const grant = await store.markHandoff(...args);
        if (grant) {
          markerCommitted.release({ grant, fence: args[1], observer });
          // The real store has committed, but the worker has not received the ACK.
          await returnMarker.reached;
        }
        return grant;
      };
      return s.worker({ store: { ...store, claimNext, markHandoff } });
    }
    const first = contender(primary, peer);
    const second = contender(peer, primary);
    const runs = Promise.all([first.run({ limit: 1 }), second.run({ limit: 1 })]);
    let marked: Awaited<typeof markerCommitted.reached>;
    let reports: Awaited<typeof runs>;
    try {
      marked = await atBarrier(
        Promise.race([
          markerCommitted.reached,
          runs.then(() => {
            throw new Error('Both workers ended without committing a marker');
          }),
        ]),
        'a committed marker',
      );
      const { fence, observer } = marked;
      expect(fence.jobId).toBe(jobId);
      expect(claiming).toBe(2);
      expect(await observer.findJob(A, jobId, CALL)).toMatchObject({
        state: 'leased',
        phase: 'handed_off',
        attemptCount: 1,
      });
      expect(await observer.findAttempt(A, jobId, fence.attemptId, CALL)).toBeNull();
      expect((await observer.cancel(A, jobId, CALL)).status).toBe('too_late');
      s.wire.assertCount(0);
    } finally {
      bothClaiming.release();
      returnMarker.release();
      reports = await runs;
    }
    expect(reports.map(({ counts }) => counts.claimed).sort()).toEqual([0, 1]);
    const winner = reports.find(({ counts }) => counts.claimed === 1)!;
    const { attemptId, token } = marked.fence;
    expect(winner.counts).toMatchObject({
      providerCalls: 1,
      submitted: kind === 'sandbox' ? 0 : 1,
      accepted: outcome === 'accepted' ? 1 : 0,
      partiallyAccepted: outcome === 'partially_accepted' ? 1 : 0,
      validated: outcome === 'validated' ? 1 : 0,
      persistenceFailures: 0,
    });
    expect(winner.items).toMatchObject([
      { operation: 'claim', jobId, attemptId, status: outcome, providerInvoked: true },
    ]);
    const result: AttemptResult =
      kind === 'smtp'
        ? {
            outcome,
            retry: 'never',
            stage: 'data',
            reason: plan === 'partial' ? 'smtp_partial' : 'smtp_accepted',
            messageId: `<${attemptId}@email.invalid>`,
            recipients: RECIPIENTS.map((entry) =>
              plan === 'partial' && entry.group === 'cc' ? { ...entry, status: 'rejected' } : entry,
            ),
          }
        : kind === 'sandbox'
          ? { outcome, retry: 'never', stage: 'http', reason: 'sendgrid_validated' }
          : {
              outcome,
              retry: 'never',
              stage: 'http',
              reason: 'sendgrid_accepted',
              providerMessageId: GRID_ID,
            };
    const commit = await f.attempt(jobId, attemptId);
    expect(commit).toMatchObject({
      jobId,
      attemptId,
      disposition: outcome,
      ordinal: 1,
      handedOffAt: marked.grant.handoffAt,
    });
    expect(commit?.result).toEqual(result);
    expect(commit).not.toHaveProperty('retryAt');
    expect(await f.attempt(jobId, attemptId, B)).toBeNull();
    const terminal = await f.job(jobId);
    expect(terminal).toMatchObject({ state: 'terminal', disposition: outcome, attemptCount: 1, unknownOpen: false });
    expect(await f.job(other.job.jobId, B)).toMatchObject({ state: 'queued', attemptCount: 0 });
    for (const privateValue of [token, NAME, 'Example.INVALID', PROFILE.apiKey, PRIVATE_REPLY]) {
      expect(JSON.stringify([terminal, commit, ...reports])).not.toContain(privateValue);
    }
    await s.wire.assertSubmission(attemptId);

    expect(await s.service(peer).enqueue(s.command)).toEqual({ status: 'replayed', job: terminal });
    expect((await second.run()).items).toEqual([]);
    expect(await f.attempt(jobId, attemptId)).toEqual(commit);
    expect(s.prepare).toHaveBeenCalledTimes(2); // One admission in each scope, never on replay.
    expect(s.render).toHaveBeenCalledTimes(kind === 'smtp' ? 2 : 0);
    s.wire.assertCount(1);
  });

  it('uses store time for scheduling and sweeps an unclaimed expired job without wire activity', async () => {
    const f = fixture();
    const now = await f.queue.now();
    const scheduleAt = now + 1_500;
    const expiresAt = now + 2_000;
    const s = await f.scenario('smtp', 'accept', { scheduleAt, expiresAt });
    const { job } = await s.service().enqueue(s.command);
    const worker = s.worker({ store: f.queue.peer });
    expect(job).toMatchObject({ state: 'queued', nextAt: scheduleAt, expiresAt });
    expect(await worker.run()).toMatchObject({ stop: 'idle', items: [] });
    await f.queue.waitFor(expiresAt);
    expect(await worker.run()).toMatchObject({
      items: [{ operation: 'expire', jobId: job.jobId, status: 'expired', providerInvoked: false }],
      counts: { claimed: 0, expiredInSweep: 1, providerCalls: 0 },
    });
    const terminal = await f.job(job.jobId);
    expect(terminal).toMatchObject({
      state: 'terminal',
      disposition: 'expired',
      attemptCount: 0,
      terminalAt: expect.any(Number),
    });
    expect(terminal).not.toHaveProperty('latestAttempt');
    expect(s.prepare).toHaveBeenCalledOnce();
    s.wire.assertCount(0);
  });

  it('retries a real SendGrid 429 only after its stored retry floor and sends the same frozen data', async () => {
    const f = fixture();
    const s = await f.scenario('sendgrid', 'throttle_once');
    const { job } = await s.service().enqueue(s.command);
    const first = await s.worker().run({ limit: 1 });
    const attemptId = first.items[0]!.attemptId!;
    expect(first).toMatchObject({ counts: { retryScheduled: 1, submitted: 0, providerCalls: 1 } });
    const throttled = await f.attempt(job.jobId, attemptId);
    expect(throttled).toMatchObject({
      ordinal: 1,
      disposition: 'retry_scheduled',
      result: {
        outcome: 'rejected',
        retry: 'safe_transient',
        stage: 'http',
        reason: 'sendgrid_throttled',
        retryHint: { delayMs: 2_000 },
      },
    });
    const retryAt = throttled!.finishedAt + 2_000;
    expect(throttled?.retryAt).toBe(retryAt);
    expect(await f.job(job.jobId)).toMatchObject({ state: 'queued', nextAt: retryAt, attemptCount: 1 });
    const second = s.worker({ store: f.queue.peer });
    expect(await second.run()).toMatchObject({ stop: 'idle', items: [] });
    s.wire.assertCount(1);
    await f.queue.waitFor(retryAt);
    const done = await second.run({ limit: 1 });
    expect(done).toMatchObject({ counts: { accepted: 1, submitted: 1, providerCalls: 1 } });
    const nextId = done.items[0]!.attemptId!;
    expect(nextId).not.toBe(attemptId);
    expect(await f.attempt(job.jobId, nextId)).toMatchObject({
      ordinal: 2,
      disposition: 'accepted',
      result: { providerMessageId: GRID_ID },
    });
    expect(await f.attempt(job.jobId, attemptId)).toEqual(throttled);
    expect(await f.job(job.jobId)).toMatchObject({
      disposition: 'accepted',
      attemptCount: 2,
      expiresAt: job.expiresAt,
    });
    await s.wire.assertSubmission(attemptId);
    await s.wire.assertSubmission(nextId, 1);
    expect(s.prepare).toHaveBeenCalledOnce();
    s.wire.assertCount(2);
  });

  it.each(['smtp', 'sendgrid'] as const)('needs explicit redrive after ambiguous %s wire results', async (kind) => {
    const f = fixture();
    const s = await f.scenario(kind, 'ambiguous');
    const { job } = await s.service().enqueue(s.command);
    const first = await s.worker().run({ limit: 1 });
    const { attemptId } = first.items[0]!;
    expect(first.counts).toMatchObject({ providerCalls: 1, unknown: 1, retryScheduled: 0, submitted: 0 });
    const expected = {
      outcome: 'unknown',
      retry: 'never',
      reason: 'transport_uncertain',
      stage: kind === 'smtp' ? 'data' : 'http',
    };
    const original = await f.attempt(job.jobId, attemptId!);
    expect(original).toMatchObject({ ordinal: 1, disposition: 'unknown', result: expected });
    expect(original?.result).not.toHaveProperty('providerMessageId');
    expect(await f.job(job.jobId)).toMatchObject({ disposition: 'unknown', unknownOpen: true, attemptCount: 1 });
    const peer = s.worker({ store: f.queue.peer });
    expect((await peer.run()).items).toEqual([]);
    s.wire.assertCount(1);

    const resolve = {
      jobId: job.jobId,
      attemptId: attemptId!,
      action: 'redrive',
      acknowledgeDuplicateRisk: true,
    } as const;
    expect(await f.queue.peer.resolveUnknown(A, resolve, CALL)).toMatchObject({
      status: 'resolved',
      job: { state: 'queued' },
    });
    expect(await f.queue.peer.resolveUnknown(A, resolve, CALL)).toMatchObject({ status: 'replayed' });
    const manual = await peer.run();
    const nextId = manual.items[0]!.attemptId!;
    expect(nextId).not.toBe(attemptId);
    expect(manual.counts).toMatchObject({ providerCalls: 1, unknown: 1, retryScheduled: 0 });
    expect(await f.attempt(job.jobId, nextId)).toMatchObject({ ordinal: 2, disposition: 'unknown', result: expected });
    expect(await f.attempt(job.jobId, attemptId!)).toEqual(original);
    await expect(f.queue.peer.resolveUnknown(A, { ...resolve, attemptId: nextId }, CALL)).rejects.toMatchObject({
      code: 'resolution_conflict',
    });
    expect(
      await f.queue.peer.resolveUnknown(A, { jobId: job.jobId, attemptId: nextId, action: 'dismiss' }, CALL),
    ).toMatchObject({
      job: { disposition: 'unknown', unknownOpen: false, attemptCount: 2, expiresAt: job.expiresAt },
    });
    expect((await peer.run()).items).toEqual([]);
    await s.wire.assertSubmission(attemptId!);
    await s.wire.assertSubmission(nextId, 1);
    expect(s.prepare).toHaveBeenCalledOnce();
    expect(s.render).toHaveBeenCalledTimes(kind === 'smtp' ? 1 : 0);
    s.wire.assertCount(2);
  });

  it.each([
    { kind: 'smtp', stop: 'shutdown', reason: 'provider_aborted' },
    { kind: 'sendgrid', stop: 'shutdown', reason: 'provider_aborted' },
    { kind: 'smtp', stop: 'deadline', reason: 'provider_timeout' },
    { kind: 'sendgrid', stop: 'deadline', reason: 'provider_timeout' },
  ] as const)('closes the stalled $kind peer on worker $stop and records $reason', async ({ kind, stop, reason }) => {
    const f = fixture();
    const s = await f.scenario(kind, 'stall');
    const { job } = await s.service().enqueue(s.command);
    const worker = s.worker();
    const pending = worker.run({ limit: 1, maintenanceLimit: 0, ...(stop === 'deadline' ? { timeoutMs: 1_500 } : {}) });
    try {
      await atBarrier(s.wire.received, 'a complete stalled SMTP DATA transaction or HTTPS request');
      s.wire.assertCount(1);
      if (stop === 'shutdown') {
        expect(await worker.shutdown()).toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 0 });
        await expect(worker.run()).rejects.toMatchObject({ code: 'closed' });
      }
      const report = await pending;
      const attemptId = report.items[0]!.attemptId!;
      expect(report).toMatchObject({
        stop,
        items: [{ jobId: job.jobId, attemptId, status: 'unknown', reason, providerInvoked: true }],
        counts: { providerCalls: 1, unknown: 1, persistenceFailures: 0 },
      });
      await s.wire.assertSubmission(attemptId); // Wait for the server's socket close before fixture teardown.
      expect(await f.attempt(job.jobId, attemptId)).toMatchObject({
        disposition: 'unknown',
        result: { outcome: 'unknown', retry: 'never', stage: kind === 'smtp' ? 'data' : 'http', reason },
      });
      expect(await f.queue.primary.findJob(A, job.jobId, CALL)).toMatchObject({
        disposition: 'unknown',
        attemptCount: 1,
      });
      expect((await s.worker({ store: f.queue.peer }).run()).items).toEqual([]);
      s.wire.assertCount(1);
    } finally {
      await pending;
    }
  });
}
