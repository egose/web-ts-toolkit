import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createEmailBatchService, createEmailWorker, type EmailRateLimiter, type EmailStore } from '../../src';
import { AMBIGUOUS, CALL, lostAck } from '../conformance/store-fixtures';
import { batchFixture, batchKey, request } from './batch-fixture';
import { deferred, SCOPE, TO } from './template-fixtures';
import { smtpFixture, WORKER_LIMITS } from './worker-fixtures';

describe('batch run delegation', () => {
  it('inherits configured concurrency, maintenance and claim bounds, and the actual rate decision', async () => {
    const f = await batchFixture();
    const smtp = smtpFixture();
    const tryAcquire = vi
      .fn<EmailRateLimiter['tryAcquire']>()
      .mockReturnValue({ status: 'deferred', retryAfterMs: 500 });
    const recoverNext = vi.fn(f.store.recoverNext);
    const expireNext = vi.fn(f.store.expireNext);
    const claimNext = vi.fn(f.store.claimNext);
    const worker = createEmailWorker({
      scope: SCOPE,
      store: { ...f.store, recoverNext, expireNext, claimNext },
      providers: [smtp.provider],
      rateLimiter: { scope: 'worker', tryAcquire },
      clock: f.clock,
      limits: WORKER_LIMITS,
    });
    const batch = createEmailBatchService({ service: f.service, worker });
    f.prepare.mockImplementation((title, { now }) => ({ to: [TO], values: { title }, expiresAt: now + 100 }));
    await f.batch.enqueueBatch(request('expired-a', 'expired-b'));
    f.clock.wall += 100;
    f.prepare.mockReset();
    await f.batch.enqueueBatch(request('due-a', 'due-b'));

    await expect(batch.run({ concurrency: 2 })).rejects.toMatchObject({ code: 'invalid_config' });
    await expect(batch.run({ batchId: 'not-a-run-filter' } as never)).rejects.toMatchObject({ code: 'invalid_config' });
    expect(recoverNext).not.toHaveBeenCalled();
    expect(claimNext).not.toHaveBeenCalled();
    const report = await batch.run({ concurrency: 1, limit: 1, maintenanceLimit: 1 });
    expect(report).toMatchObject({
      stop: 'limit',
      items: [
        { operation: 'expire', status: 'expired', providerInvoked: false },
        { operation: 'claim', status: 'retry_scheduled', reason: 'rate_deferred', providerInvoked: false },
      ],
      counts: { claimed: 1, expired: 1, expiredInSweep: 1, retryScheduled: 1, submitted: 0, persistenceFailures: 0 },
    });
    expect(recoverNext).toHaveBeenCalledOnce();
    expect(expireNext).toHaveBeenCalledOnce();
    expect(claimNext).toHaveBeenCalledOnce();
    expect(tryAcquire).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ scope: SCOPE, provider: smtp.provider.ref }),
    );
    expect(smtp.transmit).not.toHaveBeenCalled();
    for (const dto of [report, report.counts, report.items, ...report.items]) expect(Object.isFrozen(dto)).toBe(true);
  });

  it('uses the same active worker, keeping confirmed acceptance and persistence counts after abort', async () => {
    const f = await batchFixture();
    await f.batch.enqueueBatch(request('due'));
    const entered = deferred<AbortSignal>();
    const release = deferred<void>();
    const smtp = smtpFixture();
    const finish = vi.fn<EmailStore['finish']>((...args) =>
      lostAck('after_commit', async () => {
        const commit = await f.store.finish(...args);
        entered.resolve(args[2].signal);
        await release.promise;
        return commit;
      }),
    );
    const worker = createEmailWorker({
      scope: SCOPE,
      store: { ...f.store, finish },
      providers: [smtp.provider],
      clock: f.clock,
      limits: WORKER_LIMITS,
    });
    const batch = createEmailBatchService({ service: f.service, worker });
    const controller = new AbortController();
    const pending = batch.run({ limit: 1, maintenanceLimit: 0, signal: controller.signal });
    try {
      const finishing = await entered.promise;
      await expect(worker.run()).rejects.toMatchObject({ code: 'busy' });
      controller.abort(new Error('private caller reason'));
      expect(finishing.aborted).toBe(false);
      release.resolve();
      const result = await pending;
      expect(result).toMatchObject({
        stop: 'aborted',
        items: [{ status: 'accepted', providerInvoked: true }],
        counts: { claimed: 1, accepted: 1, submitted: 1, persistenceFailures: 1, unconfirmed: 0 },
      });
      const { jobId, attemptId } = result.items[0]!;
      expect(await f.store.findAttempt(SCOPE, jobId, attemptId!, CALL)).toMatchObject({ disposition: 'accepted' });
      expect(JSON.stringify(result)).not.toMatch(/private caller reason|@example.invalid|token/i);
      expect(finish).toHaveBeenCalledOnce();
      expect(smtp.transmit).toHaveBeenCalledOnce();
      expect((await batch.run()).items).toEqual([]);
    } finally {
      release.resolve();
      await pending;
      await worker.shutdown();
    }
    await expect(batch.run()).rejects.toMatchObject({ code: 'closed' });
    expect(f.clock.timers.size).toBe(0);
  });

  it('keeps the worker clock and distinguishes terminal unknown at a run deadline from a failed admission', async () => {
    const f = await batchFixture();
    await f.batch.enqueueBatch(request('due'));
    const entered = deferred<AbortSignal>();
    const smtp = smtpFixture(async (_input, { signal }) => {
      entered.resolve(signal);
      if (!signal.aborted) await once(signal, 'abort');
      return AMBIGUOUS;
    });
    const worker = createEmailWorker({
      scope: SCOPE,
      store: f.store,
      providers: [smtp.provider],
      clock: f.clock,
      limits: WORKER_LIMITS,
    });
    const batch = createEmailBatchService({ service: f.service, worker });
    const pending = batch.run({ timeoutMs: 50, limit: 1 });
    const signal = await entered.promise;
    f.clock.advance(50);
    expect(await pending).toMatchObject({
      stop: 'deadline',
      items: [{ status: 'unknown', providerInvoked: true }],
      counts: { unknown: 1, submitted: 0, providerCalls: 1, persistenceFailures: 0 },
    });
    expect(signal.aborted).toBe(true);
    expect(await f.store.findAdmission(SCOPE, batchKey('due'), CALL)).toMatchObject({
      job: { state: 'terminal', disposition: 'unknown', unknownOpen: true },
    });
    expect((await batch.run()).items).toEqual([]);
    expect(smtp.transmit).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
  });

  it('passes through cancellation before handoff and definite rejection as different worker counts', async () => {
    const f = await batchFixture();
    await f.batch.enqueueBatch(request('cancel'));
    const job = (await f.store.findAdmission(SCOPE, batchKey('cancel'), CALL))!.job;
    const smtp = smtpFixture(async () => ({
      outcome: 'rejected',
      retry: 'never',
      stage: 'data',
      reason: 'smtp_permanent_reply',
    }));
    const tryAcquire = vi.fn<EmailRateLimiter['tryAcquire']>(() => ({ status: 'granted' }));
    tryAcquire.mockImplementationOnce(async () => {
      expect(await f.store.cancel(SCOPE, job.jobId, CALL)).toMatchObject({ status: 'cancelled' });
      return { status: 'granted' };
    });
    const worker = createEmailWorker({
      scope: SCOPE,
      store: f.store,
      providers: [smtp.provider],
      rateLimiter: { scope: 'worker', tryAcquire },
      clock: f.clock,
      limits: WORKER_LIMITS,
    });
    const batch = createEmailBatchService({ service: f.service, worker });
    expect(await batch.run({ limit: 1 })).toMatchObject({
      items: [{ jobId: job.jobId, status: 'cancelled', providerInvoked: false }],
      counts: { cancelled: 1, rejected: 0, submitted: 0, persistenceFailures: 0 },
    });
    await batch.enqueueBatch(request('reject'));
    expect(await batch.run({ limit: 1 })).toMatchObject({
      items: [{ status: 'rejected', providerInvoked: true }],
      counts: { cancelled: 0, rejected: 1, submitted: 0, persistenceFailures: 0 },
    });
    expect(smtp.transmit).toHaveBeenCalledOnce();
  });
});
