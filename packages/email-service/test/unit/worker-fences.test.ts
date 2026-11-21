import { describe, expect, it, vi } from 'vitest';
import {
  createSmtpAcceptanceResult,
  type ClaimedEmail,
  type EmailProvider,
  type EmailRateLimiter,
  type EmailStore,
  type HandoffGrant,
  type LeaseGrant,
  type ProviderResult,
  type SendGridSnapshot,
  type StoreCall,
} from '../../src';
import { A, AMBIGUOUS, CALL, GRID, SANDBOX, TRANSIENT, fixtureId, lostAck } from '../conformance/store-fixtures';
import { ATTACHMENT, deferred } from './template-fixtures';
import { smtpEvidence, smtpFixture, workerFixture } from './worker-fixtures';

describe('only exact, timely owner acknowledgements authorize work', () => {
  for (const mode of ['before_commit', 'after_commit'] as const) {
    it(`does no work after a lost claim ACK (${mode})`, async () => {
      const f = await workerFixture();
      const job = await f.add();
      const claimNext = vi.fn<EmailStore['claimNext']>((...args) => lostAck(mode, () => f.store.claimNext(...args)));
      const read = vi.fn(f.store.findAttempt);
      const worker = f.worker({ store: { ...f.store, claimNext, findAttempt: read } });
      expect(await worker.run()).toMatchObject({
        stop: 'store_error',
        items: [],
        counts: { claimed: 0, persistenceFailures: 1 },
      });
      expect(await f.job(job.jobId)).toMatchObject(
        mode === 'after_commit'
          ? { state: 'leased', phase: 'pre_handoff', attemptCount: 1 }
          : { state: 'queued', attemptCount: 0 },
      );
      expect(claimNext).toHaveBeenCalledOnce();
      expect(read).not.toHaveBeenCalled();
      expect(f.smtp.prepare).not.toHaveBeenCalled();
      if (mode === 'after_commit') {
        f.elapse(5_000);
        expect(await f.worker().run()).toMatchObject({ items: [{ operation: 'recover', status: 'retry_scheduled' }] });
        expect(await f.commit(job.jobId, claimNext.mock.calls[0]![1].attemptId)).toMatchObject({
          result: { reason: 'pre_handoff_lease_expired' },
        });
      }
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      expect(f.clock.timers.size).toBe(0);
    });

    it(`does no work after a lost renewal ACK (${mode})`, async () => {
      const f = await workerFixture();
      const job = await f.add({ attachments: [ATTACHMENT] });
      const resolverEntered = deferred<AbortSignal>();
      const release = deferred<{ status: 'found'; bytes: Uint8Array }>();
      const renew = vi.fn<EmailStore['renew']>((...args) => lostAck(mode, () => f.store.renew(...args)));
      const finish = vi.fn(f.store.finish);
      const markHandoff = vi.fn(f.store.markHandoff);
      const worker = f.worker({
        store: { ...f.store, renew, finish, markHandoff },
        attachmentResolvers: {
          files: (_ref, { signal }) => {
            resolverEntered.resolve(signal);
            return release.promise;
          },
        },
      });
      const pending = worker.run({ limit: 1, maintenanceLimit: 0 });
      const signal = await resolverEntered.promise;
      f.elapse(1_666);
      const report = await pending;
      expect(signal.aborted).toBe(true);
      expect(report).toMatchObject({
        stop: 'store_error',
        items: [{ status: 'unconfirmed', providerInvoked: false }],
        counts: { persistenceFailures: 1 },
      });
      expect(renew).toHaveBeenCalledOnce();
      expect(finish).not.toHaveBeenCalled();
      expect(markHandoff).not.toHaveBeenCalled();
      expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
      expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toBeNull();
      release.resolve({ status: 'found', bytes: Buffer.from('abc') });
      await release.promise;
      f.elapse(5_000 - 1_666);
      const recovered = await f.worker().run();
      expect(recovered.counts.recovered).toBe(mode === 'before_commit' ? 1 : 0);
      if (mode === 'after_commit') {
        f.elapse(1_666);
        expect((await f.worker().run()).counts.recovered).toBe(1);
      }
      expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({
        result: { reason: 'pre_handoff_lease_expired' },
      });
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      expect(f.clock.timers.size).toBe(0);
    });

    it(`does not authorize submit by inspecting a lost marker ACK (${mode})`, async () => {
      const f = await workerFixture();
      const job = await f.add();
      const markHandoff = vi.fn<EmailStore['markHandoff']>((...args) =>
        lostAck(mode, () => f.store.markHandoff(...args)),
      );
      const finish = vi.fn(f.store.finish);
      const findJob = vi.fn(f.store.findJob);
      const findAttempt = vi.fn(f.store.findAttempt);
      const worker = f.worker({ store: { ...f.store, markHandoff, finish, findJob, findAttempt } });
      const report = await worker.run({ limit: 1 });
      expect(report).toMatchObject({
        stop: 'store_error',
        items: [{ jobId: job.jobId, status: 'unconfirmed', providerInvoked: false }],
        counts: { claimed: 1, persistenceFailures: 1 },
      });
      const id = report.items[0]!.attemptId!;
      expect(await f.job(job.jobId)).toMatchObject({
        state: 'leased',
        phase: mode === 'after_commit' ? 'handed_off' : 'pre_handoff',
      });
      expect(findJob).not.toHaveBeenCalled();
      expect(findAttempt.mock.calls.map(([scope, jobId, attemptId]) => [scope, jobId, attemptId])).toEqual([
        [A, job.jobId, id],
      ]);
      expect(finish).not.toHaveBeenCalled();
      expect(markHandoff).toHaveBeenCalledOnce();
      expect(f.smtp.prepare).toHaveBeenCalledOnce();
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      expect(JSON.stringify(report)).not.toContain(markHandoff.mock.calls[0]![1].token);
      f.elapse(5_000);
      await f.worker().run();
      expect(await f.commit(job.jobId, id)).toMatchObject({
        result: { reason: mode === 'after_commit' ? 'post_handoff_lease_expired' : 'pre_handoff_lease_expired' },
        disposition: mode === 'after_commit' ? 'unknown' : 'retry_scheduled',
      });
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      expect(f.clock.timers.size).toBe(0);
    });
  }

  it.each([
    ['wrong claim attempt', (ok: ClaimedEmail) => ({ ...ok, fence: { ...ok.fence, attemptId: fixtureId(99) } })],
    ['wrong token', (ok: ClaimedEmail) => ({ ...ok, fence: { ...ok.fence, token: 'a'.repeat(24) } })],
    [
      'misdated grant',
      (ok: ClaimedEmail) => ({
        ...ok,
        lease: { grantedAt: ok.lease.grantedAt + 1, leaseEndsAt: ok.lease.leaseEndsAt + 1 },
      }),
    ],
    ['mismatched snapshot', (ok: ClaimedEmail) => ({ ...ok, snapshot: { ...ok.snapshot, priority: 9 } })],
  ] as const)('does not accept a corrupt claim (%s)', async (_label, change) => {
    const f = await workerFixture();
    const job = await f.add();
    const claimNext: EmailStore['claimNext'] = async (...args) => {
      const received = await f.store.claimNext(...args);
      if (received.status !== 'applied') return received;
      return { status: 'applied', value: change(received.value) };
    };
    expect(await f.worker({ store: { ...f.store, claimNext } }).run()).toMatchObject({
      stop: 'store_error',
      items: [],
      counts: { claimed: 0, persistenceFailures: 1 },
    });
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    expect(f.smtp.prepare).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong duration', (grant: HandoffGrant) => ({ ...grant, leaseEndsAt: grant.leaseEndsAt + 1 })],
    ['wrong marker time', (grant: HandoffGrant) => ({ ...grant, handoffAt: grant.grantedAt - 1 })],
    [
      'future clock',
      (grant: HandoffGrant) => ({
        handoffAt: grant.handoffAt + 1_001,
        grantedAt: grant.grantedAt + 1_001,
        leaseEndsAt: grant.leaseEndsAt + 1_001,
      }),
    ],
    ['extra fields', (grant: HandoffGrant) => ({ ...grant, token: 'synthetic-do-not-report' })],
  ] as const)('withholds launch on a forged marker ACK (%s)', async (_label, change) => {
    const f = await workerFixture();
    const job = await f.add();
    const markHandoff: EmailStore['markHandoff'] = async (...args) => {
      const actual = await f.store.markHandoff(...args);
      return actual && change(actual);
    };
    const report = await f.worker({ store: { ...f.store, markHandoff } }).run();
    expect(report).toMatchObject({
      stop: 'store_error',
      items: [{ status: 'unconfirmed', providerInvoked: false }],
      counts: { persistenceFailures: 1 },
    });
    expect(JSON.stringify(report)).not.toContain('synthetic-do-not-report');
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
    expect(f.smtp.transmit).not.toHaveBeenCalled();
  });

  it('does not use an echoed renewal to extend a launch window', async () => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT] });
    const enter = deferred<void>();
    const release = deferred<{ status: 'found'; bytes: Uint8Array }>();
    let original: LeaseGrant | undefined;
    const claimNext: EmailStore['claimNext'] = async (...args) => {
      const answer = await f.store.claimNext(...args);
      if (answer.status === 'applied') original = answer.value.lease;
      return answer;
    };
    const renew = vi.fn(async () => original!);
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({
      store: { ...f.store, claimNext, renew, markHandoff },
      attachmentResolvers: {
        files: () => {
          enter.resolve();
          return release.promise;
        },
      },
    });
    const pending = worker.run({ maintenanceLimit: 0 });
    await enter.promise;
    f.elapse(1_666);
    expect(await pending).toMatchObject({ stop: 'store_error', counts: { persistenceFailures: 1, unconfirmed: 1 } });
    release.resolve({ status: 'found', bytes: Buffer.from('abc') });
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    expect(markHandoff).not.toHaveBeenCalled();
    expect(f.smtp.transmit).not.toHaveBeenCalled();
  });

  it('inspects the stored winner after cancellation wins a definite marker miss', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const entered = deferred<void>();
    const rate = deferred<{ status: 'granted' }>();
    const limiter: EmailRateLimiter = {
      scope: 'worker',
      tryAcquire() {
        entered.resolve();
        return rate.promise;
      },
    };
    const finish = vi.fn(f.store.finish);
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({ rateLimiter: limiter, store: { ...f.store, markHandoff, finish } });
    const pending = worker.run({ limit: 1 });
    await entered.promise;
    expect(await f.store.cancel(A, job.jobId, CALL)).toMatchObject({ status: 'cancelled' });
    rate.resolve({ status: 'granted' });
    const report = await pending;
    expect(report).toMatchObject({
      stop: 'limit',
      items: [{ status: 'cancelled', providerInvoked: false }],
      counts: { persistenceFailures: 0 },
    });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ result: { reason: 'cancelled' } });
    expect(markHandoff).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
    expect(f.smtp.transmit).not.toHaveBeenCalled();
  });
});

describe('post-handoff evidence and finish recovery', () => {
  it.each([
    'throw',
    'missing recipients',
    'empty acceptance',
    'same-status partial acceptance',
    'incompatible retry',
    'short partition',
    'partial RCPT-only refusal',
    'wrong index',
    'wrong message id',
    'wrong provider',
    'hidden fields',
  ] as const)('records unknown rather than automatic retry on provider %s', async (kind) => {
    const f = await workerFixture();
    const job = await f.add();
    const smtp = smtpFixture((input) => {
      const result = smtpEvidence(input);
      const cases: Record<Exclude<typeof kind, 'throw'>, ProviderResult> = {
        // @ts-expect-error simulate a JS provider that returns acceptance without recipient evidence
        'missing recipients': { outcome: 'accepted', retry: 'never', stage: 'data', reason: 'smtp_accepted' },
        // @ts-expect-error malformed JS can still return explicit empty evidence
        'empty acceptance': { ...result, recipients: [] },
        // @ts-expect-error a full envelope of accepted recipients does not prove partial acceptance
        'same-status partial acceptance': { ...result, reason: 'smtp_partial', outcome: 'partially_accepted' },
        // @ts-expect-error simulate a JS provider that contradicts its acceptance with a safe retry
        'incompatible retry': { ...result, retry: 'safe_transient' },
        'short partition': createSmtpAcceptanceResult(result.recipients.slice(1), result.messageId),
        'partial RCPT-only refusal': {
          ...TRANSIENT,
          stage: 'envelope',
          recipients: [{ group: 'to', index: 0, status: 'rejected' }],
        },
        'wrong index': {
          ...result,
          recipients: [{ group: 'cc', index: 1, status: 'accepted' }, ...result.recipients.slice(1)],
        },
        'wrong message id': { ...result, messageId: `<${fixtureId(1)}@email.invalid>` },
        'wrong provider': { outcome: 'accepted', retry: 'never', stage: 'http', reason: 'sendgrid_accepted' },
        'hidden fields': Object.defineProperty({ ...result }, 'raw', { value: 'synthetic private' }),
      };
      if (kind === 'throw') throw new Error('synthetic private provider failure');
      return Promise.resolve(cases[kind]);
    });
    const worker = f.worker({ providers: [smtp.provider] });
    const report = await worker.run();
    expect(report).toMatchObject({
      items: [{ status: 'unknown', reason: 'transport_uncertain', providerInvoked: true }],
      counts: { unknown: 1, retryScheduled: 0, persistenceFailures: 0, providerCalls: 1 },
    });
    const commit = await f.commit(job.jobId, report.items[0]!.attemptId!);
    expect(commit).toMatchObject({ result: { outcome: 'unknown', retry: 'never', reason: 'transport_uncertain' } });
    expect(commit).toHaveProperty('handedOffAt');
    expect(await f.job(job.jobId)).toMatchObject({ state: 'terminal', unknownOpen: true });
    expect(JSON.stringify(report)).not.toContain('synthetic private');
    f.elapse(5_000); // Past any transient retry floor in this fixture.
    expect((await worker.run()).items).toEqual([]);
    expect(smtp.transmit).toHaveBeenCalledOnce();
  });

  it.each([
    { ref: GRID, evidence: { outcome: 'validated', retry: 'never', stage: 'http', reason: 'sendgrid_validated' } },
    { ref: SANDBOX, evidence: { outcome: 'accepted', retry: 'never', stage: 'http', reason: 'sendgrid_accepted' } },
  ] as const)(
    'records unknown for well-shaped SendGrid evidence in the wrong mode ($ref.mode)',
    async ({ ref, evidence }) => {
      const f = await workerFixture();
      const job = await f.add({ provider: ref });
      const submit = vi.fn(async () => evidence);
      const provider: EmailProvider<SendGridSnapshot> = { ref, prepare: () => ({ submit }) };
      const worker = f.worker({ providers: [provider] });
      const report = await worker.run();
      expect(report).toMatchObject({
        items: [{ status: 'unknown', reason: 'transport_uncertain', providerInvoked: true }],
        counts: { unknown: 1, retryScheduled: 0, persistenceFailures: 0 },
      });
      expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({
        result: { outcome: 'unknown', retry: 'never', stage: 'http', reason: 'transport_uncertain' },
      });
      expect((await worker.run()).items).toEqual([]);
      expect(submit).toHaveBeenCalledOnce();
    },
  );

  it('never automatically retries an unknown; explicit redrive is one non-retrying claim of the same snapshot', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const smtp = smtpFixture(async () => AMBIGUOUS);
    smtp.transmit.mockResolvedValueOnce(AMBIGUOUS).mockResolvedValueOnce(TRANSIENT);
    const worker = f.worker({ providers: [smtp.provider] });
    const initial = await worker.run();
    const attemptId = initial.items[0]!.attemptId!;
    expect((await worker.run()).items).toEqual([]);
    expect(smtp.transmit).toHaveBeenCalledOnce();
    const original = await f.commit(job.jobId, attemptId);
    expect(original).toMatchObject({ disposition: 'unknown', ordinal: 1 });
    await expect(
      f.store.resolveUnknown(
        A,
        { jobId: job.jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true },
        CALL,
      ),
    ).resolves.toMatchObject({ status: 'resolved' });
    const retry = await worker.run();
    const second = retry.items[0]!;
    expect(second.attemptId).not.toBe(attemptId);
    expect(second).toMatchObject({ status: 'rejected', reason: 'attempts_exhausted', providerInvoked: true });
    expect(await f.commit(job.jobId, second.attemptId!)).toMatchObject({ ordinal: 2, result: TRANSIENT });
    expect(smtp.transmit.mock.calls[1]![0].snapshot).toEqual(smtp.transmit.mock.calls[0]![0].snapshot);
    expect(await f.commit(job.jobId, attemptId)).toEqual(original);
    expect((await worker.run()).items).toEqual([]);
    expect(smtp.transmit).toHaveBeenCalledTimes(2);
  });

  it.each(['before_commit', 'after_commit'] as const)(
    'confirms a lost finish ACK with no second send (%s)',
    async (mode) => {
      const f = await workerFixture();
      const job = await f.add();
      const later = await f.add({ scheduleAt: f.clock.wall + 1 });
      const finish = vi
        .fn(f.store.finish)
        .mockImplementationOnce((...args) => lostAck(mode, () => f.store.finish(...args)));
      const findAttempt = vi.fn(f.store.findAttempt);
      const worker = f.worker({ store: { ...f.store, finish, findAttempt } });
      const report = await worker.run({ limit: 1 });
      expect(report).toMatchObject({
        stop: 'store_error',
        items: [{ jobId: job.jobId, status: 'accepted' }],
        counts: { accepted: 1, persistenceFailures: 1, providerCalls: 1 },
      });
      expect(finish).toHaveBeenCalledTimes(mode === 'before_commit' ? 2 : 1);
      const request = finish.mock.calls[0]![1];
      if (mode === 'before_commit') expect(finish.mock.calls[1]![1]).toBe(request);
      expect(
        Object.isFrozen(request) && Object.isFrozen(request.fence) && Object.isFrozen(request.result.recipients),
      ).toBe(true);
      expect(findAttempt.mock.calls[0]?.slice(0, 3)).toEqual([A, job.jobId, request.fence.attemptId]);
      expect(await f.commit(job.jobId, request.fence.attemptId)).toMatchObject({
        operationId: request.operationId,
        disposition: 'accepted',
      });
      expect(await f.job(later.jobId)).toMatchObject({ state: 'queued', attemptCount: 0 });
      expect(JSON.stringify(report)).not.toContain(request.fence.token);
      expect(JSON.stringify(report)).not.toContain('email.invalid>');
      expect(f.smtp.transmit).toHaveBeenCalledOnce();
      expect(f.clock.timers.size).toBe(0);
    },
  );

  it('treats malformed finish ACK and wrong-attempt read as no confirmation, then uses the exact same operation', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const finish = vi.fn(f.store.finish).mockImplementationOnce(async (...args) => {
      const committed = await f.store.finish(...args);
      return committed && { ...committed, handedOffAt: committed.startedAt + 1 };
    });
    const findAttempt = vi.fn<EmailStore['findAttempt']>(async (...args) => {
      const committed = await f.store.findAttempt(...args);
      return committed && { ...committed, attemptId: fixtureId(123) };
    });
    const report = await f.worker({ store: { ...f.store, finish, findAttempt } }).run();
    expect(report).toMatchObject({
      stop: 'store_error',
      counts: { accepted: 1, persistenceFailures: 2, providerCalls: 1 },
    });
    expect(finish).toHaveBeenCalledTimes(2);
    expect(finish.mock.calls[1]![1]).toBe(finish.mock.calls[0]![1]);
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
  });

  it('reports the expiry recovery winner rather than earlier local acceptance', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const started = deferred<Parameters<EmailStore['finish']>>();
    const resume = deferred<void>();
    const finish = vi.fn<EmailStore['finish']>(async (...args) => {
      started.resolve(args);
      await resume.promise;
      return f.store.finish(...args);
    });
    const worker = f.worker({ store: { ...f.store, finish } });
    const pending = worker.run({ limit: 1 });
    const [, request] = await started.promise;
    // Advance the injected store wall independently to simulate peer takeover before the worker obtains proof.
    f.clock.wall += 5_000;
    const recovered = await f.worker().run();
    expect(recovered).toMatchObject({ items: [{ status: 'unknown', operation: 'recover' }] });
    resume.resolve();
    const report = await pending;
    expect(report).toMatchObject({
      stop: 'limit',
      items: [{ status: 'unknown', reason: 'post_handoff_lease_expired', providerInvoked: true }],
      counts: { submitted: 0 },
    });
    expect(await f.commit(job.jobId, request.fence.attemptId)).toMatchObject({ disposition: 'unknown' });
    expect(finish).toHaveBeenCalledOnce();
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
  });

  it('latches a store fault before a later marker ACK can launch without abandoning an already active provider', async () => {
    const f = await workerFixture();
    const a = await f.add({ jobId: fixtureId(1) });
    const b = await f.add({ jobId: fixtureId(2) });
    const c = await f.add({ jobId: fixtureId(3) });
    const firstSubmit = deferred<StoreCall>();
    const releaseProvider = deferred<void>();
    const smtp = smtpFixture(async (input, call) => {
      firstSubmit.resolve(call);
      await releaseProvider.promise;
      return smtpEvidence(input);
    });
    const marked = deferred<void>();
    const releaseMark = deferred<void>();
    const markHandoff: EmailStore['markHandoff'] = async (...args) => {
      const grant = await f.store.markHandoff(...args);
      if (args[1].jobId === b.jobId) {
        marked.resolve();
        await releaseMark.promise;
      }
      return grant;
    };
    const claimNext = vi.fn(f.store.claimNext);
    claimNext.mockImplementationOnce((...args) => f.store.claimNext(...args));
    claimNext.mockImplementationOnce((...args) => f.store.claimNext(...args));
    const failedClaim = deferred<Awaited<ReturnType<EmailStore['claimNext']>>>();
    claimNext.mockReturnValueOnce(failedClaim.promise);
    const finishStarted = deferred<void>();
    const finish = vi.fn<EmailStore['finish']>((...args) => {
      if (args[1].fence.jobId === b.jobId) finishStarted.resolve();
      return f.store.finish(...args);
    });
    const pending = f
      .worker({
        limits: { maxConcurrency: 3 },
        providers: [smtp.provider],
        store: { ...f.store, claimNext, markHandoff, finish },
      })
      .run({ maintenanceLimit: 0 });
    const call = await firstSubmit.promise;
    await marked.promise;
    // The store fault observer runs before the released marker acknowledgement is observed.
    failedClaim.reject({ code: 'store_unavailable' });
    releaseMark.resolve();
    await finishStarted.promise;
    expect(call.signal.aborted).toBe(false);
    releaseProvider.resolve();
    const result = await pending;
    expect(result).toMatchObject({
      stop: 'store_error',
      counts: { claimed: 2, providerCalls: 1, accepted: 1, retryScheduled: 1, persistenceFailures: 1 },
    });
    expect(await f.commit(a.jobId, result.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
    expect(await f.commit(b.jobId, result.items[1]!.attemptId!)).toMatchObject({
      result: { reason: 'launch_window_closed' },
      disposition: 'retry_scheduled',
    });
    expect(await f.job(c.jobId)).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect(smtp.transmit).toHaveBeenCalledOnce();
    expect(claimNext).toHaveBeenCalledTimes(3);
  });
});
