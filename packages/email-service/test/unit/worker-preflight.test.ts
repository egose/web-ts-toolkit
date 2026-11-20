import { describe, expect, it, vi } from 'vitest';
import type {
  AttachmentResolver,
  AttachmentResolution,
  EmailProvider,
  EmailRateLimiter,
  EmailStore,
  PreparedEmailSubmission,
  SmtpSnapshot,
} from '../../src';
import { MESSAGE_LIMITS } from '../../src/constants';
import { A, CALL, GRID, SANDBOX } from '../conformance/store-fixtures';
import { ATTACHMENT, deferred } from './template-fixtures';
import { workerFixture } from './worker-fixtures';

describe('strict bounded preflight before the durable marker', () => {
  it('resolves versions sequentially, copies exact bytes and captures submit before acquiring rate permission', async () => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT, { ...ATTACHMENT, id: 'report.2', version: 'v2' }] });
    const first = deferred<{ status: 'found'; bytes: Buffer }>();
    const second = deferred<{ status: 'found'; bytes: Buffer }>();
    const ref1 = deferred<void>();
    const ref2 = deferred<void>();
    const bytes = Buffer.from('abc');
    const resolver = vi
      .fn<AttachmentResolver>()
      .mockImplementationOnce(() => {
        ref1.resolve();
        return first.promise;
      })
      .mockImplementationOnce(() => {
        ref2.resolve();
        return second.promise;
      });
    const config = { files: resolver };
    const rateEntered = deferred<void>();
    const permit = deferred<{ status: 'granted' }>();
    const prepared: PreparedEmailSubmission = { submit: vi.fn() };
    const originalPrepare = f.smtp.prepare.getMockImplementation()!;
    f.smtp.prepare.mockImplementation((input) => {
      prepared.submit = originalPrepare(input).submit;
      return prepared;
    });
    const rogue = vi.fn<PreparedEmailSubmission['submit']>();
    const limit = vi.fn<EmailRateLimiter['tryAcquire']>(() => {
      rateEntered.resolve();
      return permit.promise;
    });
    const limiter: EmailRateLimiter = { scope: 'worker', tryAcquire: limit };
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({ rateLimiter: limiter, attachmentResolvers: config, store: { ...f.store, markHandoff } });
    config.files = vi.fn();
    limiter.tryAcquire = vi.fn();

    const pending = worker.run({ limit: 1, maintenanceLimit: 0 });
    await ref1.promise;
    expect(resolver).toHaveBeenCalledOnce();
    expect(f.smtp.prepare).not.toHaveBeenCalled();
    expect(markHandoff).not.toHaveBeenCalled();
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    first.resolve({ status: 'found', bytes });
    await ref2.promise;
    bytes.fill(0);
    expect(resolver.mock.calls.map(([ref]) => [ref.id, ref.version])).toEqual([
      ['report.1', 'v1'],
      ['report.2', 'v2'],
    ]);
    expect(resolver.mock.calls[0]?.[1].signal).toBe(resolver.mock.calls[1]?.[1].signal);
    expect(Object.isFrozen(resolver.mock.calls[0]?.[0])).toBe(true);
    second.resolve({ status: 'found', bytes: Buffer.from('abc') });
    await rateEntered.promise;
    expect(f.smtp.prepare).toHaveBeenCalledOnce();
    expect(markHandoff).not.toHaveBeenCalled();
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    const value = f.smtp.prepare.mock.calls[0]![0];
    expect(value.attachments.map(({ bytes }) => Buffer.from(bytes).toString())).toEqual(['abc', 'abc']);
    expect(Object.isFrozen(value) && Object.isFrozen(value.attachments) && Object.isFrozen(value.attachments[0])).toBe(
      true,
    );
    expect(limit.mock.calls[0]?.[0]).toMatchObject({ scope: A, provider: value.snapshot.provider });
    expect(Object.isFrozen(limit.mock.calls[0]?.[0].provider)).toBe(true);
    prepared.submit = rogue;
    permit.resolve({ status: 'granted' });
    const result = await pending;
    expect(rogue).not.toHaveBeenCalled();
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
    expect(await f.commit(job.jobId, result.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
    expect(JSON.stringify(result)).not.toContain('report.1');
    expect(f.clock.timers.size).toBe(0);
  });

  it.each([
    ['missing', 'attachment_invalid'],
    ['malformed', 'attachment_invalid'],
    ['length', 'attachment_invalid'],
    ['hash', 'attachment_invalid'],
    ['shared', 'attachment_invalid'],
    ['unavailable', 'attachment_unavailable'],
    ['throw', 'attachment_resolver_error'],
  ] as const)('fails closed for an attachment that is %s', async (kind, reason) => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT] });
    const files = vi.fn<AttachmentResolver>(() => {
      switch (kind) {
        case 'unavailable':
          return { status: 'unavailable' };
        case 'malformed':
          return { status: 'unavailable', bytes: Buffer.from('abc') } as never;
        case 'length':
          return { status: 'found', bytes: Buffer.from('abcd') };
        case 'hash':
          return { status: 'found', bytes: Buffer.from('abd') };
        case 'shared':
          return { status: 'found', bytes: new Uint8Array(new SharedArrayBuffer(3)) };
        default:
          throw { code: 'deadline', note: 'synthetic host error' };
      }
    });
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({
      store: { ...f.store, markHandoff },
      attachmentResolvers: kind === 'missing' ? {} : { files },
    });
    const report = await worker.run({ limit: 1 });
    expect(report.items[0]).toMatchObject({ reason, providerInvoked: false });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({
      disposition: kind === 'unavailable' ? 'retry_scheduled' : 'failed',
      result: { reason, stage: 'attachment' },
    });
    expect(f.smtp.prepare).not.toHaveBeenCalled();
    expect(markHandoff).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain('synthetic host error');
  });

  it.each([
    ['count', 6, 3],
    ['total', 3, MESSAGE_LIMITS.attachmentBytes],
  ] as const)(
    'rejects injected snapshots exceeding the attachment %s ceiling before resolution',
    async (_label, length, byteLength) => {
      const f = await workerFixture();
      const job = await f.add();
      const claimNext: EmailStore['claimNext'] = async (...args) => {
        const claim = await f.store.claimNext(...args);
        return claim.status === 'applied'
          ? {
              status: 'applied',
              value: {
                ...claim.value,
                snapshot: {
                  ...claim.value.snapshot,
                  attachments: Array.from({ length }, (_, i) => ({ ...ATTACHMENT, id: `ref-${i}`, byteLength })),
                },
              },
            }
          : claim;
      };
      const files = vi.fn<AttachmentResolver>();
      const report = await f.worker({ store: { ...f.store, claimNext }, attachmentResolvers: { files } }).run();
      expect(report).toMatchObject({ stop: 'store_error', items: [], counts: { persistenceFailures: 1 } });
      expect(files).not.toHaveBeenCalled();
      expect(f.smtp.prepare).not.toHaveBeenCalled();
      expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    },
  );

  it('shares one attachment-stage deadline across references and holds capacity across runs until settlement', async () => {
    const f = await workerFixture();
    const job = await f.add({ attachments: [ATTACHMENT, { ...ATTACHMENT, id: 'report.2' }] });
    const second = await f.add({ scheduleAt: f.clock.wall + 1, attachments: [ATTACHMENT] });
    const more = deferred<{ status: 'found'; bytes: Buffer }>();
    const entered = deferred<AbortSignal>();
    const files = vi
      .fn<AttachmentResolver>()
      .mockImplementationOnce(() => {
        f.elapse(30);
        return { status: 'found', bytes: Buffer.from('abc') };
      })
      .mockImplementationOnce((_ref, { signal }) => {
        entered.resolve(signal);
        return more.promise;
      })
      .mockImplementation(() => ({ status: 'found', bytes: Buffer.from('abc') }));
    const claimNext = vi.fn(f.store.claimNext);
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({
      limits: { attachmentTimeoutMs: 50 },
      store: { ...f.store, claimNext, markHandoff },
      attachmentResolvers: { files },
    });
    const pending = worker.run({ maintenanceLimit: 0, limit: 1 });
    const signal = await entered.promise;
    f.elapse(19);
    expect(signal.aborted).toBe(false);
    f.elapse(1);
    const report = await pending;
    expect(report).toMatchObject({
      stop: 'callback_capacity',
      items: [{ reason: 'attachment_timeout', status: 'retry_scheduled' }],
    });
    expect(signal.aborted).toBe(true);
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({
      result: { reason: 'attachment_timeout' },
    });
    expect(await worker.run({ maintenanceLimit: 0 })).toMatchObject({ stop: 'callback_capacity', items: [] });
    expect(await f.job(second.jobId)).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect(markHandoff).not.toHaveBeenCalled();
    expect(claimNext).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
    more.resolve({ status: 'found', bytes: Buffer.from('abc') });
    await more.promise;
    expect(await worker.run({ limit: 1 })).toMatchObject({ items: [{ jobId: second.jobId, status: 'accepted' }] });
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
  });

  it('keeps two abandoned resolver slots across runs and frees only the slot whose callback settles', async () => {
    const f = await workerFixture();
    const jobs = [];
    for (const priority of [9, 8, 7]) jobs.push(await f.add({ priority, attachments: [ATTACHMENT] }));
    const entered = deferred<void>();
    const signals: AbortSignal[] = [];
    const fulfillers: ((value: AttachmentResolution) => void)[] = [];
    const files = vi.fn<AttachmentResolver>((_ref, { signal }) => {
      if (signals.length === 2) return { status: 'found', bytes: Buffer.from('abc') };
      signals.push(signal);
      return {
        then(fulfill: (value: AttachmentResolution) => void) {
          fulfillers.push(fulfill);
          if (fulfillers.length === 2) entered.resolve();
        },
      } as unknown as PromiseLike<AttachmentResolution>;
    });
    const claimNext = vi.fn(f.store.claimNext);
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({
      limits: { maxConcurrency: 2, attachmentTimeoutMs: 50 },
      store: { ...f.store, claimNext, markHandoff },
      attachmentResolvers: { files },
    });
    const running = worker.run({ limit: 3, maintenanceLimit: 0 });
    await entered.promise;
    f.elapse(50);
    const stopped = await running;
    expect(stopped).toMatchObject({
      stop: 'callback_capacity',
      items: jobs.slice(0, 2).map(({ jobId }) => ({
        jobId,
        status: 'retry_scheduled',
        reason: 'attachment_timeout',
        providerInvoked: false,
      })),
      counts: { claimed: 2, providerCalls: 0, retryScheduled: 2 },
    });
    expect(signals.map(({ aborted }) => aborted)).toEqual([true, true]);
    expect(await worker.run({ maintenanceLimit: 0 })).toMatchObject({ stop: 'callback_capacity', items: [] });
    expect(await f.job(jobs[2]!.jobId)).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect(claimNext).toHaveBeenCalledTimes(2);
    expect(markHandoff).not.toHaveBeenCalled();

    const then = vi.fn();
    fulfillers[0]!(Object.defineProperty({ status: 'found', bytes: Buffer.from('abc') }, 'then', { get: then }));
    await Promise.resolve(); // Let the first held slot observe actual settlement.
    expect(then).not.toHaveBeenCalled();
    expect(await worker.run({ limit: 1, maintenanceLimit: 0 })).toMatchObject({
      items: [{ jobId: jobs[2]!.jobId, status: 'accepted', providerInvoked: true }],
    });
    expect(await worker.shutdown()).toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 1 });
    fulfillers[1]!({ status: 'unavailable' });
    await Promise.resolve();
    expect(await worker.shutdown()).toMatchObject({ pendingCallbacks: 0 });
    for (const { jobId, attemptId } of stopped.items) {
      const commit = await f.commit(jobId, attemptId!);
      expect(commit).toMatchObject({ disposition: 'retry_scheduled', result: { reason: 'attachment_timeout' } });
      expect(commit).not.toHaveProperty('handedOffAt');
    }
    expect(files).toHaveBeenCalledTimes(3);
    expect(claimNext).toHaveBeenCalledTimes(3);
    expect(markHandoff).toHaveBeenCalledOnce();
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
  });

  it('never substitutes a provider with the same key but a different mode', async () => {
    const f = await workerFixture();
    const job = await f.add({ provider: { ...GRID, key: SANDBOX.key }, attachments: [ATTACHMENT] });
    const prepare = vi.fn();
    const files = vi.fn<AttachmentResolver>();
    const rate = vi.fn<EmailRateLimiter['tryAcquire']>();
    const worker = f.worker({
      providers: [{ ref: SANDBOX, prepare }],
      attachmentResolvers: { files },
      rateLimiter: { scope: 'worker', tryAcquire: rate },
    });
    const result = await worker.run();
    expect(result).toMatchObject({
      items: [{ status: 'failed', reason: 'profile_unavailable', providerInvoked: false }],
    });
    expect(await f.commit(job.jobId, result.items[0]!.attemptId!)).toMatchObject({
      result: { reason: 'profile_unavailable' },
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(files).not.toHaveBeenCalled();
    expect(rate).not.toHaveBeenCalled();
  });

  it('rejects an asynchronous provider prepare and holds its native promise without handing off', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const invalid = deferred<PreparedEmailSubmission>();
    const prepare = vi.fn<EmailProvider<SmtpSnapshot>['prepare']>(() => invalid.promise as never);
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({ providers: [{ ...f.smtp.provider, prepare }], store: { ...f.store, markHandoff } });
    const report = await worker.run();
    expect(report).toMatchObject({
      stop: 'callback_capacity',
      items: [{ reason: 'provider_preflight_error', status: 'failed' }],
    });
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).not.toHaveProperty('handedOffAt');
    expect(markHandoff).not.toHaveBeenCalled();
    expect(await worker.shutdown()).toMatchObject({ status: 'stopped', pendingCallbacks: 1 });
    invalid.reject(new Error('synthetic late prepare rejection'));
    await invalid.promise.catch(() => undefined);
    expect(await worker.shutdown()).toMatchObject({ status: 'stopped', pendingCallbacks: 0 });
    expect(f.smtp.transmit).not.toHaveBeenCalled();
  });
});

describe('rate permits belong to the supplied limiter', () => {
  class Quota implements EmailRateLimiter {
    remaining = 1;
    readonly requests: Parameters<EmailRateLimiter['tryAcquire']>[0][] = [];
    constructor(readonly scope: EmailRateLimiter['scope']) {}

    tryAcquire(request: Parameters<EmailRateLimiter['tryAcquire']>[0]) {
      this.requests.push(request);
      return this.remaining-- > 0
        ? { status: 'granted' as const }
        : { status: 'deferred' as const, retryAfterMs: 3_000 };
    }
  }

  it('coordinates via a supplied shared limiter, does not refund an uncertain marker, and uses the reducer for retry', async () => {
    const f = await workerFixture();
    const first = await f.add({ priority: 9 });
    const second = await f.add({ retry: { maxAttempts: 2 } });
    const shared = new Quota('shared');
    const a = f.worker({
      rateLimiter: shared,
      store: {
        ...f.store,
        markHandoff: async () => {
          throw { code: 'write_unconfirmed' };
        },
      },
    });
    const b = f.worker({ rateLimiter: shared });
    expect((await a.run({ limit: 1, maintenanceLimit: 0 })).stop).toBe('store_error');
    expect(await f.job(first.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff' });
    const report = await b.run({ limit: 1, maintenanceLimit: 0 });
    expect(shared.requests).toHaveLength(2);
    expect(report).toMatchObject({
      items: [{ jobId: second.jobId, status: 'retry_scheduled', reason: 'rate_deferred' }],
    });
    expect(await f.commit(second.jobId, report.items[0]!.attemptId!)).toMatchObject({
      retryAt: f.clock.wall + 3_000,
      result: { retryHint: { delayMs: 3_000 } },
    });
    f.elapse(2_999);
    expect((await b.run({ maintenanceLimit: 0 })).items).toEqual([]);
    f.elapse(1);
    const exhausted = await b.run({ maintenanceLimit: 0, limit: 1 });
    expect(exhausted).toMatchObject({ items: [{ status: 'failed', reason: 'attempts_exhausted' }] });
    expect(await f.job(second.jobId)).toMatchObject({
      state: 'terminal',
      terminalReason: 'attempts_exhausted',
      attemptCount: 2,
    });
    expect(shared.requests).toHaveLength(3);
    expect(f.smtp.transmit).not.toHaveBeenCalled();
  });

  it('does not couple distinct worker limiters', async () => {
    const f = await workerFixture();
    await f.add();
    await f.add();
    const qa = new Quota('worker');
    const qb = new Quota('worker');
    const reports = await Promise.all([
      f.worker({ rateLimiter: qa }).run({ limit: 1 }),
      f.worker({ rateLimiter: qb }).run({ limit: 1 }),
    ]);
    expect(qa.requests).toHaveLength(1);
    expect(qb.requests).toHaveLength(1);
    expect(reports.flatMap(({ items }) => items).map(({ status }) => status)).toEqual(['accepted', 'accepted']);
    expect(f.smtp.transmit).toHaveBeenCalledTimes(2);
  });

  it.each([0, 2_592_000_001, 5.5])('does not use a malformed deferral of %d ms', async (retryAfterMs) => {
    const f = await workerFixture();
    const job = await f.add();
    const worker = f.worker({
      rateLimiter: { scope: 'worker', tryAcquire: () => ({ status: 'deferred', retryAfterMs }) },
    });
    const report = await worker.run();
    expect(report.items).toMatchObject([{ status: 'failed', reason: 'rate_error' }]);
    expect(await f.commit(job.jobId, report.items[0]!.attemptId!)).toMatchObject({ result: { reason: 'rate_error' } });
    expect(f.smtp.transmit).not.toHaveBeenCalled();
  });

  it('times out rate policy without accepting a late grant or waiting past shutdown', async () => {
    const f = await workerFixture();
    const job = await f.add();
    const entered = deferred<AbortSignal>();
    const gate = deferred<{ status: 'granted' }>();
    const markHandoff = vi.fn(f.store.markHandoff);
    const worker = f.worker({
      limits: { rateTimeoutMs: 10 },
      store: { ...f.store, markHandoff },
      rateLimiter: {
        scope: 'worker',
        tryAcquire: ({ signal }) => {
          entered.resolve(signal);
          return gate.promise;
        },
      },
    });
    const pending = worker.run({ limit: 1 });
    const signal = await entered.promise;
    f.elapse(10);
    const report = await pending;
    expect(report).toMatchObject({
      stop: 'callback_capacity',
      items: [{ status: 'retry_scheduled', reason: 'rate_timeout' }],
    });
    expect(await worker.shutdown()).toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 1 });
    expect(signal.aborted).toBe(true);
    gate.resolve({ status: 'granted' });
    await gate.promise;
    expect(await worker.shutdown()).toMatchObject({ status: 'stopped', pendingCallbacks: 0 });
    expect(markHandoff).not.toHaveBeenCalled();
    expect((await f.store.findJob(A, job.jobId, CALL))?.state).toBe('queued');
    expect(f.smtp.transmit).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });
});
