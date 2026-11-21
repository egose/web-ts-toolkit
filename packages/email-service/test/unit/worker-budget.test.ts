import { describe, expect, it, vi } from 'vitest';
import type { EmailStore, HandoffGrant, LeaseGrant, ProviderCall, ProviderResult, StoreClaimNext } from '../../src';
import { lostAck } from '../conformance/store-fixtures';
import { ATTACHMENT, deferred } from './template-fixtures';
import { smtpEvidence, smtpFixture, workerFixture } from './worker-fixtures';

describe('worker absolute budgets and serialized ownership', () => {
  it('includes the claim dispatch in one pre-handoff deadline and does not use worker wall for timers', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const claimNext = vi.fn<EmailStore['claimNext']>((...args) => {
      f.clock.advance(30); // RPC time, not store time.
      return f.store.claimNext(...args);
    });
    const prepared = f.smtp.prepare.getMockImplementation()!;
    const now = vi.fn(() => f.clock.now() + 60_000);
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({
      limits: { preHandoffTimeoutMs: 50 },
      store: { ...f.store, claimNext, markHandoff },
      clock: { now, monotonicNow: () => f.clock.ticks, sleep: (ms, signal) => f.clock.sleep(ms, signal) },
    });
    f.smtp.prepare.mockImplementation((input) => {
      f.clock.ticks += 20;
      return prepared(input);
    });
    const report = await worker.run({ limit: 1, maintenanceLimit: 0 });
    expect(markHandoff).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    expect(claimNext.mock.calls[0]![2].timeoutMs).toBe(50);
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({
      disposition: 'retry_scheduled',
      result: { reason: 'pre_handoff_timeout' },
    });
    expect(f.clock.timers.size).toBe(0);
  });

  it('rejects a claim ACK at its bound without inventing a claim item', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const entered = deferred<StoreClaimNext>();
    const release = deferred<StoreClaimNext>();
    const claimNext = vi.fn<EmailStore['claimNext']>(async (...args) => {
      entered.resolve(await f.store.claimNext(...args));
      return release.promise;
    });
    const worker = f.worker({ limits: { preHandoffTimeoutMs: 50 }, store: { ...f.store, claimNext } });
    const pending = worker.run({ maintenanceLimit: 0, timeoutMs: 100 });
    const grant = await entered.promise;
    f.clock.ticks += 50; // At equality before the timer callback runs.
    release.resolve(grant);
    expect(await pending).toMatchObject({
      stop: 'store_error',
      items: [],
      counts: { claimed: 0, persistenceFailures: 1 },
    });
    expect(claimNext.mock.calls[0]![2].signal.aborted).toBe(true);
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff', attemptCount: 1 });
    expect(f.smtp.prepare).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });

  it.each([50, 500])('joins renewal before marking and rejects a renewal ACK at its cutoff (%i ms)', async (delay) => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT] });
    const loading = deferred<void>();
    const afterLoading = deferred<{ status: 'found'; bytes: Buffer }>();
    const renewed = deferred<LeaseGrant | null>();
    const releaseRenewal = deferred<LeaseGrant | null>();
    let renewInFlight = false;
    const renew = vi.fn<EmailStore['renew']>(async (...args) => {
      renewInFlight = true;
      renewed.resolve(await f.store.renew(...args));
      const grant = await releaseRenewal.promise;
      renewInFlight = false;
      return grant;
    });
    const preflightReady = deferred<void>();
    const markHandoff = vi.fn<EmailStore['markHandoff']>((...args) => {
      expect(renewInFlight).toBe(false);
      return f.store.markHandoff(...args);
    });
    const worker = f.worker({
      store: { ...f.store, renew, markHandoff },
      attachmentResolvers: {
        files: () => {
          loading.resolve();
          return afterLoading.promise;
        },
      },
      rateLimiter: {
        scope: 'worker',
        tryAcquire: () => {
          preflightReady.resolve();
          return { status: 'granted' };
        },
      },
    });
    const pending = worker.run({ maintenanceLimit: 0, limit: 1 });
    await loading.promise;
    f.elapse(1_665);
    expect(renew).not.toHaveBeenCalled();
    f.elapse(1);
    const grant = await renewed.promise;
    expect(grant?.grantedAt).toBe(f.clock.wall);
    afterLoading.resolve({ status: 'found', bytes: Buffer.from('abc') });
    await preflightReady.promise;
    expect(markHandoff).not.toHaveBeenCalled();
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    f.elapse(delay);
    releaseRenewal.resolve(grant);
    const result = await pending;
    expect(renew).toHaveBeenCalledOnce();
    if (delay === 50) {
      expect(markHandoff).toHaveBeenCalledOnce();
      expect(await f.commit(job.jobId, result.items[0]!.attemptId!)).toMatchObject({
        disposition: 'accepted',
        handedOffAt: f.clock.wall,
      });
    } else {
      expect(markHandoff).not.toHaveBeenCalled();
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      expect(renew.mock.calls[0]![3].signal.aborted).toBe(true);
      expect(result).toMatchObject({ stop: 'store_error', counts: { unconfirmed: 1, persistenceFailures: 1 } });
      expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
      expect(await f.commit(job.jobId, result.items[0]!.attemptId!)).toBeNull();
    }
    expect(f.clock.timers.size).toBe(0);
  });

  it('does not mark after a stale monotonic lease even if the independent store wall still sees it live', async () => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT] });
    const enter = deferred<AbortSignal>();
    const release = deferred<{ status: 'found'; bytes: Uint8Array }>();
    const store = {
      ...f.store,
      renew: vi.fn(f.store.renew),
      markHandoff: vi.fn(f.store.markHandoff),
      finish: vi.fn(f.store.finish),
    };
    const pending = f
      .worker({
        store,
        limits: { attachmentTimeoutMs: 5_000, preHandoffTimeoutMs: 7_000 },
        attachmentResolvers: {
          files: (_ref, { signal }) => {
            enter.resolve(signal);
            return release.promise;
          },
        },
      })
      .run({ limit: 1, maintenanceLimit: 0 });
    const signal = await enter.promise;
    f.clock.advance(4_000); // Old lease minus margin; skipped renewal wake under a simulated event-loop stall.
    expect(await pending).toMatchObject({
      items: [{ status: 'unconfirmed', providerInvoked: false }],
      counts: { persistenceFailures: 0 },
    });
    expect(signal.aborted).toBe(true);
    expect(store.renew).not.toHaveBeenCalled();
    expect(store.markHandoff).not.toHaveBeenCalled();
    expect(store.finish).not.toHaveBeenCalled();
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    release.resolve({ status: 'found', bytes: Buffer.from('abc') });
    expect(f.clock.timers.size).toBe(0);
  });

  it.each([99, 100])(
    'checks the conservative expiry bound measured from marker dispatch (ACK after %i ms)',
    async (delay) => {
      const f = await workerFixture();
      const job = await f.add({ expiresAt: f.clock.wall + 1_100 });
      const marked = deferred<HandoffGrant | null>();
      const ack = deferred<HandoffGrant | null>();
      const markHandoff = vi.fn<EmailStore['markHandoff']>(async (...args) => {
        marked.resolve(await f.store.markHandoff(...args));
        return ack.promise;
      });
      const pending = f.worker({ store: { ...f.store, markHandoff } }).run({ limit: 1, maintenanceLimit: 0 });
      const grant = await marked.promise;
      expect(f.smtp.prepare).toHaveBeenCalledOnce();
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
      f.elapse(delay);
      ack.resolve(grant);
      const report = await pending;
      expect(f.smtp.transmit).toHaveBeenCalledTimes(delay === 99 ? 1 : 0);
      const commit = await f.commit(job.jobId, report.items[0]!.attemptId!);
      expect(commit).toMatchObject({
        handedOffAt: grant!.handoffAt,
        result: { reason: delay === 99 ? 'smtp_accepted' : 'launch_window_closed' },
      });
      expect(f.clock.timers.size).toBe(0);
    },
  );

  it('uses a timely marker grant but withholds at the later preflight launch check', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const marked = deferred<HandoffGrant | null>();
    const ack = deferred<HandoffGrant | null>();
    const markHandoff: EmailStore['markHandoff'] = (...args) => {
      void f.store.markHandoff(...args).then(marked.resolve, marked.reject);
      return ack.promise;
    };
    const pending = f
      .worker({ limits: { preHandoffTimeoutMs: 100 }, store: { ...f.store, markHandoff } })
      .run({ limit: 1 });
    const grant = await marked.promise;
    ack.resolve(grant);
    // Let the store boundary capture success first; then advance before its caller may launch.
    queueMicrotask(() => f.clock.advance(100));
    const result = await pending;
    expect(result).toMatchObject({
      items: [{ status: 'retry_scheduled', reason: 'launch_window_closed', providerInvoked: false }],
      counts: { persistenceFailures: 0 },
    });
    expect(await f.commit(job.jobId, result.items[0]!.attemptId!)).toMatchObject({ handedOffAt: grant!.handoffAt });
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });

  it('aborts a late marker ACK at the preflight deadline without treating it as a definite miss', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const marked = deferred<HandoffGrant | null>();
    const ack = deferred<HandoffGrant | null>();
    const markHandoff = vi.fn<EmailStore['markHandoff']>((...args) => {
      void f.store.markHandoff(...args).then(marked.resolve, marked.reject);
      return ack.promise;
    });
    const finish = vi.fn(f.store.finish);
    const pending = f
      .worker({ limits: { preHandoffTimeoutMs: 100 }, store: { ...f.store, markHandoff, finish } })
      .run();
    const grant = await marked.promise;
    f.elapse(100);
    ack.resolve(grant);
    expect(await pending).toMatchObject({
      stop: 'store_error',
      items: [{ status: 'unconfirmed' }],
      counts: { persistenceFailures: 1 },
    });
    expect(markHandoff.mock.calls[0]?.[3].signal.aborted).toBe(true);
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
    expect(finish).not.toHaveBeenCalled();
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });

  it('clamps provider I/O by remaining monotonic lease minus reserved grace', async () => {
    const f = await workerFixture();
    await f.add();
    const marked = deferred<HandoffGrant | null>();
    const ack = deferred<HandoffGrant | null>();
    const markHandoff: EmailStore['markHandoff'] = (...args) => {
      void f.store.markHandoff(...args).then(marked.resolve, marked.reject);
      return ack.promise;
    };
    const pending = f
      .worker({
        limits: { storeTimeoutMs: 100, providerTimeoutMs: 3_000, finalizeGraceMs: 900 },
        store: { ...f.store, markHandoff },
      })
      .run({ maintenanceLimit: 0, limit: 1 });
    ack.resolve(await marked.promise);
    queueMicrotask(() => f.elapse(2_500)); // Timely ACK, simulated suspension before launch.
    const report = await pending;
    expect(f.smtp.transmit.mock.calls[0]![1].timeoutMs).toBe(600);
    expect(report).toMatchObject({ items: [{ status: 'accepted' }] });
    expect(f.clock.timers.size).toBe(0);
  });

  it('shares one finish grace across ACK loss, a read and a same-operation retry', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const finish = vi
      .fn<EmailStore['finish']>()
      .mockImplementationOnce(async (...args) => {
        f.elapse(60);
        return lostAck('before_commit', () => f.store.finish(...args));
      })
      .mockImplementationOnce(async (...args) => {
        f.elapse(90); // The retry dispatch's shortened deadline is exactly here.
        return f.store.finish(...args);
      });
    const findAttempt = vi.fn<EmailStore['findAttempt']>((...args) => {
      f.elapse(50);
      return f.store.findAttempt(...args);
    });
    const worker = f.worker({ store: { ...f.store, finish, findAttempt } });
    const report = await worker.run({ limit: 1, maintenanceLimit: 0 });
    expect(finish.mock.calls.map(([, , call]) => call.timeoutMs)).toEqual([200, 90]);
    expect(findAttempt.mock.calls.map(([, , , call]) => call.timeoutMs)).toEqual([140]);
    expect(finish.mock.calls[1]![1]).toBe(finish.mock.calls[0]![1]);
    expect(report).toMatchObject({
      stop: 'store_error',
      items: [{ status: 'unconfirmed', providerInvoked: true }],
      counts: { persistenceFailures: 2, submitted: 0 },
    });
    // The injected RPC reached the store before its abort listener ran. The late ACK must not be counted.
    expect(await f.job(job.jobId)).toMatchObject({ state: 'terminal', disposition: 'accepted' });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
  });
});

describe('stop, provider settlement and permanent shutdown', () => {
  it('uses the remaining run budget for I/O and does not erase the final result just because wall expiry passed', async () => {
    const f = await workerFixture();
    const job = await f.add({ expiresAt: f.clock.wall + 1_100 });
    const entered = deferred<ProviderCall>();
    const response = deferred<void>();
    const smtp = smtpFixture(async (input, call) => {
      entered.resolve(call);
      await response.promise;
      return smtpEvidence(input);
    });
    const pending = f
      .worker({ providers: [smtp.provider], limits: { providerTimeoutMs: 2_000 } })
      .run({ timeoutMs: 1_500, limit: 1 });
    const call = await entered.promise;
    expect(call.timeoutMs).toBe(1_500);
    f.elapse(1_100);
    expect(call.signal.aborted).toBe(false);
    response.resolve();
    const report = await pending;
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
  });

  it('captures provider evidence before a later abort and uses an uncancelled finish signal', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const abort = new AbortController();
    const entered = deferred<ProviderResult>();
    const response = deferred<ProviderResult>();
    const smtp = smtpFixture((input) => {
      entered.resolve(smtpEvidence(input));
      return response.promise;
    });
    const finish = vi.fn(f.store.finish);
    const pending = f
      .worker({ providers: [smtp.provider], store: { ...f.store, finish } })
      .run({ signal: abort.signal, limit: 1 });
    response.resolve(await entered.promise);
    queueMicrotask(() => abort.abort(new Error('synthetic private stop')));
    const report = await pending;
    expect(report).toMatchObject({ stop: 'aborted', items: [{ status: 'accepted', providerInvoked: true }] });
    expect(finish.mock.calls[0]![2].signal.aborted).toBe(false);
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
    expect(f.clock.timers.size).toBe(0);
  });

  it('treats an injected late positive at the exact run deadline as unknown', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const entered = deferred<ProviderCall>();
    const response = deferred<void>();
    const smtp = smtpFixture(async (input, call) => {
      entered.resolve(call);
      await response.promise;
      return smtpEvidence(input);
    });
    const pending = f.worker({ providers: [smtp.provider] }).run({ timeoutMs: 50, limit: 1 });
    const call = await entered.promise;
    expect(call.timeoutMs).toBe(50);
    f.elapse(50);
    response.resolve();
    const report = await pending;
    expect(call.signal.aborted).toBe(true);
    expect(report).toMatchObject({ stop: 'deadline', items: [{ status: 'unknown', reason: 'provider_timeout' }] });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ disposition: 'unknown' });
    expect(f.clock.timers.size).toBe(0);
  });

  it('prefers external abort over deadline and uncertainty without counting a late claim', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const abort = new AbortController();
    const committed = deferred<StoreClaimNext>();
    const ack = deferred<StoreClaimNext>();
    const claimNext: EmailStore['claimNext'] = (...args) => {
      void f.store.claimNext(...args).then(committed.resolve, committed.reject);
      return ack.promise;
    };
    const worker = f.worker({ store: { ...f.store, claimNext } });
    const pending = worker.run({ signal: abort.signal, timeoutMs: 50, maintenanceLimit: 0 });
    const grant = await committed.promise;
    f.elapse(50);
    abort.abort();
    ack.resolve(grant);
    expect(await pending).toMatchObject({ stop: 'aborted', items: [], counts: { persistenceFailures: 1 } });
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });

  it('waits for actual provider cancellation settlement and reports deadline while a provider is still active', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const abort = new AbortController();
    const entered = deferred<ProviderCall>();
    const aborted = deferred<void>();
    const close = deferred<void>();
    const smtp = smtpFixture(async (_input, call) => {
      call.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      entered.resolve(call);
      // Model outstanding transport work after receiving cancellation, not a host callback.
      await close.promise;
      return { outcome: 'unknown', retry: 'never', stage: 'data', reason: 'provider_aborted' };
    });
    const worker = f.worker({ providers: [smtp.provider] });
    const pending = worker.run({ signal: abort.signal, timeoutMs: 50 });
    const call = await entered.promise;
    const stopping = worker.shutdown({ timeoutMs: 50 });
    await aborted.promise;
    expect(call.signal.aborted).toBe(true);
    abort.abort();
    f.elapse(50);
    expect(await stopping).toEqual({ status: 'deadline', activeRun: true, pendingCallbacks: 0 });
    await expect(worker.run()).rejects.toMatchObject({ code: 'closed' });
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'handed_off' });
    expect(f.clock.timers.size).toBe(0);
    const retrying = worker.shutdown();
    close.resolve();
    const report = await pending;
    expect(report).toMatchObject({ stop: 'shutdown', items: [{ status: 'unknown', reason: 'provider_aborted' }] });
    expect(await retrying).toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 0 });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ disposition: 'unknown' });
    expect(smtp.transmit).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
  });

  it('stops a preflight with a genuinely stuck host callback while preserving the held slot count', async () => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT] });
    const entered = deferred<AbortSignal>();
    const waitForever = new Promise<never>(() => {});
    const worker = f.worker({
      attachmentResolvers: {
        files: (_ref, { signal }) => {
          entered.resolve(signal);
          return waitForever;
        },
      },
    });
    const pending = worker.run();
    const signal = await entered.promise;
    const closing = worker.shutdown();
    const report = await pending;
    expect(signal.aborted).toBe(true);
    expect(await closing).toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 1 });
    expect(await worker.shutdown()).toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 1 });
    expect(report).toMatchObject({
      stop: 'shutdown',
      items: [{ reason: 'worker_stopped', status: 'retry_scheduled' }],
    });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({
      result: { reason: 'worker_stopped' },
    });
    expect(f.smtp.prepare).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });
});
