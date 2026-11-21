import { describe, expect, it, vi } from 'vitest';
import {
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  createSmtpAcceptanceResult,
  createMemoryEmailStore,
  type EmailProvider,
  type EmailWorkerOptions,
  type SendGridSnapshot,
} from '../../src';
import { A, B, CALL, GRID, SANDBOX, SMTP, claim, claimData, fixtureId, lostAck } from '../conformance/store-fixtures';
import { command, deferred, local, ManualClock } from './template-fixtures';
import { smtpEvidence, smtpFixture, workerFixture } from './worker-fixtures';

describe('worker assembly and bounded queue runs', () => {
  it('copies configuration, rejects malformed options before work, and does not poll', async () => {
    const f = await workerFixture();
    const { ref, prepare } = f.smtp.provider;
    const claimNext = vi.fn(f.store.claimNext);
    const options = { store: { ...f.store, claimNext }, scope: A, providers: [f.smtp.provider], clock: f.clock };
    const create = (settings: unknown) => createEmailWorker(settings as EmailWorkerOptions);
    const accessor = vi.fn(() => SMTP);
    for (const value of [
      { ...options, scope: '..' },
      { ...options, providers: [f.smtp.provider, { ref: { ...GRID, key: ref.key }, prepare }] },
      {
        ...options,
        providers: [
          {
            get ref() {
              return accessor();
            },
            prepare,
          },
        ],
      },
      { ...options, providers: new Array<EmailProvider<SendGridSnapshot>>(1) },
      { ...options, attachmentResolvers: { 'bad key': () => ({ status: 'unavailable' }) } },
      { ...options, rateLimiter: { scope: 'global', tryAcquire() {} } },
      {
        ...options,
        clock: {
          get now() {
            return accessor();
          },
        },
      },
      { ...options, limits: { leaseMs: 5_000, storeTimeoutMs: 1_334, providerTimeoutMs: 50, finalizeGraceMs: 100 } },
      { ...options, limits: { leaseMs: 5_000, storeTimeoutMs: 500, providerTimeoutMs: 3_401, finalizeGraceMs: 100 } },
      { ...options, limits: { maxConcurrency: 17 } },
      { ...options, limits: { extra: true } },
    ]) {
      expect(() => create(value)).toThrow(expect.objectContaining({ code: 'invalid_config' }));
    }
    expect(accessor).not.toHaveBeenCalled();
    const limits = { maxConcurrency: 1 };
    const worker = f.worker({ ...options, limits });
    expect(Object.keys(worker).sort()).toEqual(['run', 'scope', 'shutdown']);
    expect(Object.isFrozen(worker)).toBe(true);
    expect(f.clock.waits).toEqual([]);
    Object.assign(ref, { key: 'other-profile' });
    options.providers.pop();
    options.store.claimNext = vi.fn();
    limits.maxConcurrency = 2;

    for (const opts of [
      { limit: 0 },
      { concurrency: 2 },
      { maintenanceLimit: 101 },
      { timeoutMs: 49 },
      { signal: {} },
    ]) {
      await expect(worker.run(opts as never)).rejects.toMatchObject({ code: 'invalid_config' });
    }
    await expect(worker.shutdown({ timeoutMs: 60_001 })).rejects.toMatchObject({ code: 'invalid_config' });
    expect(claimNext).not.toHaveBeenCalled();
    expect(f.clock.waits).toEqual([]);
    await expect(worker.run({ signal: AbortSignal.abort('synthetic private') })).resolves.toMatchObject({
      stop: 'aborted',
      items: [],
    });
    expect(claimNext).not.toHaveBeenCalled();
    const job = await f.add();
    const result = await worker.run({ limit: 1, maintenanceLimit: 0 });
    expect(result).toMatchObject({ stop: 'limit', items: [{ jobId: job.jobId, status: 'accepted' }] });
    expect(claimNext).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(
      Object.isFrozen(result) &&
        Object.isFrozen(result.items) &&
        Object.isFrozen(result.items[0]) &&
        Object.isFrozen(result.counts),
    ).toBe(true);
    await expect(worker.shutdown()).resolves.toEqual({ status: 'stopped', activeRun: false, pendingCallbacks: 0 });
    await expect(worker.run()).rejects.toMatchObject({ code: 'closed' });
    expect(f.clock.timers.size).toBe(0);
  });

  it.each([
    ['V1', {}],
    ['smtp-v2', { smtpCapacity: { format: 'smtp-v2', namespace: fixtureId(1), maxRecipients: 51 } }],
  ] as const)('rejects an empty %s worker before touching queued work', async (_mode, binding) => {
    const clock = new ManualClock();
    const store = createMemoryEmailStore({ clock, ...binding });
    await store.ready();
    const registry = createEmailTemplateRegistry({ local }, { clock, ...binding });
    const service = createEmailService({ scope: A, store, registry, ...binding });
    const { job } = await service.enqueue(command);
    expect(job).toMatchObject({ state: 'queued', attemptCount: 0 });

    const storeCalls = {
      ready: vi.fn(store.ready),
      recoverNext: vi.fn(store.recoverNext),
      expireNext: vi.fn(store.expireNext),
      claimNext: vi.fn(store.claimNext),
      renew: vi.fn(store.renew),
      markHandoff: vi.fn(store.markHandoff),
      finish: vi.fn(store.finish),
      findAttempt: vi.fn(store.findAttempt),
    };
    const sleep = vi.spyOn(clock, 'sleep');
    const options = { scope: A, store: { ...store, ...storeCalls }, clock, ...binding };
    expect(() => createEmailWorker({ ...options, providers: [] })).toThrow(
      expect.objectContaining({ code: 'invalid_config' }),
    );

    const call = { ...CALL, ...binding };
    expect(await store.findJob(A, job.jobId, call)).toEqual(job);
    for (const operation of Object.values(storeCalls)) expect(operation).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);

    const smtp = smtpFixture();
    const worker = createEmailWorker({ ...options, providers: [{ ...smtp.provider, ...binding }] });
    expect(smtp.prepare).not.toHaveBeenCalled();
    expect(await worker.run({ limit: 1 })).toMatchObject({
      items: [{ jobId: job.jobId, status: 'accepted', providerInvoked: true }],
      counts: { claimed: 1, accepted: 1, providerCalls: 1 },
    });
    expect(await worker.run()).toMatchObject({ stop: 'idle', items: [] });
    expect(smtp.transmit).toHaveBeenCalledOnce();
    expect(await store.findJob(A, job.jobId, call)).toMatchObject({
      state: 'terminal',
      disposition: 'accepted',
      attemptCount: 1,
    });
    await worker.shutdown();
  });

  it('recovers, then expires, then takes the oldest eligible job with bounded sweeps and no other scopes', async () => {
    const f = await workerFixture();
    const job = await f.add({ jobId: fixtureId(1) });
    const owner = await claim(f.store, A, claimData(5_000));
    await f.add({ jobId: fixtureId(2) });
    const marked = await claim(f.store, A, claimData(5_000));
    await f.store.markHandoff(A, marked.fence, 5_000, CALL);
    const stale = await f.add({ jobId: fixtureId(3), expiresAt: f.clock.wall + 5 });
    const stale2 = await f.add({ jobId: fixtureId(4), expiresAt: f.clock.wall + 6 });
    const first = await f.add({ jobId: fixtureId(5), priority: 1 });
    const priority = await f.add({ jobId: fixtureId(6), priority: 9 });
    const tie = await f.add({ jobId: fixtureId(7), priority: 9 });
    const scheduled = await f.add({ jobId: fixtureId(8), scheduleAt: f.clock.wall + 5_001, priority: 9 });
    const other = await f.add({ jobId: fixtureId(9), priority: 9 }, B);
    f.elapse(5_000);

    const worker = f.worker();
    const result = await worker.run({ limit: 3, maintenanceLimit: 1 });
    expect(result.stop).toBe('limit');
    expect(result.items.map(({ operation, jobId, status }) => [operation, jobId, status])).toEqual([
      ['recover', job.jobId, 'retry_scheduled'],
      ['expire', stale.jobId, 'expired'],
      ['claim', priority.jobId, 'accepted'],
      ['claim', tie.jobId, 'accepted'],
      ['claim', first.jobId, 'accepted'],
    ]);
    expect(result.counts).toEqual({
      claimed: 3,
      recovered: 1,
      expiredInSweep: 1,
      providerCalls: 3,
      submitted: 3,
      accepted: 3,
      partiallyAccepted: 0,
      validated: 0,
      rejected: 0,
      unknown: 0,
      failed: 0,
      expired: 1,
      retryScheduled: 1,
      cancelled: 0,
      unconfirmed: 0,
      persistenceFailures: 0,
    });
    expect(await f.commit(job.jobId, owner.fence.attemptId)).toMatchObject({
      result: { reason: 'pre_handoff_lease_expired' },
    });
    expect(await f.job(stale.jobId)).toMatchObject({ state: 'terminal', disposition: 'expired', attemptCount: 0 });
    expect(await f.job(stale2.jobId)).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect(await f.job(scheduled.jobId)).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect(await f.store.findJob(B, other.jobId, CALL)).toMatchObject({ state: 'queued', attemptCount: 0 });
    f.elapse(1);
    const second = await worker.run();
    expect(second).toMatchObject({
      stop: 'idle',
      counts: { recovered: 1, expiredInSweep: 1, claimed: 1, submitted: 1, unknown: 1 },
    });
    expect(await f.commit(marked.fence.jobId, marked.fence.attemptId)).toMatchObject({
      disposition: 'unknown',
      result: { reason: 'post_handoff_lease_expired' },
    });
    expect(await f.job(scheduled.jobId)).toMatchObject({ state: 'terminal', disposition: 'accepted' });
    expect(f.smtp.transmit).toHaveBeenCalledTimes(4);
    expect(f.clock.timers.size).toBe(0);
  });

  for (const primitive of ['recoverNext', 'expireNext', 'claimNext'] as const) {
    it(`reports a bounded ${primitive} scan miss as contention, not idle`, async () => {
      const f = await workerFixture();
      const claimNext = vi.fn(f.store.claimNext);
      const bounded = vi.fn(async () => ({ status: 'contended' }) as const);
      const worker = f.worker({ store: { ...f.store, claimNext, [primitive]: bounded } });
      await expect(worker.run()).resolves.toMatchObject({
        stop: 'contended',
        items: [],
        counts: { persistenceFailures: 0 },
      });
      expect(bounded).toHaveBeenCalledOnce();
      expect(claimNext).not.toHaveBeenCalled();
    });
  }

  it.each([
    ['recoverNext', { status: 'expiry_maintenance_required' }],
    ['expireNext', { status: 'expiry_maintenance_required' }],
    ['claimNext', { status: 'expiry_maintenance_required', value: undefined }],
  ] as const)('rejects an incompatible expiry signal from %s', async (primitive, result) => {
    const f = await workerFixture();
    const job = await f.add();
    const invalidResult = vi.fn(async () => result);
    const store = { ...f.store, [primitive]: invalidResult } as EmailWorkerOptions['store'];
    const report = await f.worker({ store }).run();
    expect(report).toMatchObject({
      stop: 'store_error',
      items: [],
      counts: { claimed: 0, expiredInSweep: 0, persistenceFailures: 1 },
    });
    expect(invalidResult).toHaveBeenCalledOnce();
    expect(await f.job(job.jobId)).toEqual(job);
    expect(f.smtp.prepare).not.toHaveBeenCalled();
  });

  it.each(['recoverNext', 'expireNext'] as const)(
    'does not count a committed %s after its ACK is lost',
    async (primitive) => {
      const f = await workerFixture();
      const recovery = primitive === 'recoverNext';
      const job = await f.add(recovery ? {} : { expiresAt: f.clock.wall + 1 });
      const owned = recovery ? await claim(f.store, A, claimData(5_000)) : undefined;
      if (owned) await f.store.markHandoff(A, owned.fence, 5_000, CALL);
      const later = await f.add();
      f.elapse(5_000);

      const claimNext = vi.fn(f.store.claimNext);
      const sweep = vi.fn((...args: Parameters<typeof f.store.recoverNext>) =>
        lostAck('after_commit', async () => {
          await f.store[primitive](...args);
        }),
      );
      const worker = f.worker({ store: { ...f.store, [primitive]: sweep, claimNext } });
      expect(await worker.run()).toMatchObject({
        stop: 'store_error',
        items: [],
        counts: {
          persistenceFailures: 1,
          recovered: 0,
          expiredInSweep: 0,
          claimed: 0,
          providerCalls: 0,
          unconfirmed: 0,
        },
      });
      expect(sweep).toHaveBeenCalledOnce();
      expect(claimNext).not.toHaveBeenCalled();
      expect(f.smtp.transmit).not.toHaveBeenCalled();
      const disposition = recovery ? 'unknown' : 'expired';
      expect(await f.job(job.jobId)).toMatchObject({ state: 'terminal', disposition, attemptCount: recovery ? 1 : 0 });
      if (owned) {
        expect(await f.commit(job.jobId, owned.fence.attemptId)).toMatchObject({
          disposition,
          result: { reason: 'post_handoff_lease_expired' },
        });
      }
      expect(await f.worker().run()).toMatchObject({
        items: [{ operation: 'claim', jobId: later.jobId, status: 'accepted' }],
        counts: { recovered: 0, expiredInSweep: 0, providerCalls: 1 },
      });
      expect(f.smtp.transmit).toHaveBeenCalledOnce();
    },
  );

  it('allows competing workers, not duplicate active runs, and never exceeds limit or concurrency', async () => {
    const f = await workerFixture();
    for (let i = 1; i <= 4; i++) await f.add({ jobId: fixtureId(i) });
    const bothActive = deferred<void>();
    const third = deferred<void>();
    const initial = [deferred<void>(), deferred<void>()];
    let active = 0;
    let peak = 0;
    let begun = 0;
    const smtp = smtpFixture(async (input) => {
      active++;
      peak = Math.max(peak, active);
      const index = begun++;
      if (index === 1) bothActive.resolve();
      if (index === 2) third.resolve();
      await initial[index]?.promise;
      active--;
      return smtpEvidence(input);
    });
    const claimNext = vi.fn(f.store.claimNext);
    const a = f.worker({ limits: { maxConcurrency: 3 }, providers: [smtp.provider], store: { ...f.store, claimNext } });
    const b = f.worker();
    const first = a.run({ limit: 3, concurrency: 2, maintenanceLimit: 0 });
    await bothActive.promise;
    expect(claimNext).toHaveBeenCalledTimes(2);
    await expect(a.run()).rejects.toMatchObject({ code: 'busy' });
    const second = await b.run({ limit: 1, maintenanceLimit: 0 });
    expect(second.items[0]?.jobId).toBe(fixtureId(3));
    initial[0]!.resolve();
    await third.promise;
    initial[1]!.resolve();
    const report = await first;
    expect(report.items.map(({ jobId }) => jobId)).toEqual([fixtureId(1), fixtureId(2), fixtureId(4)]);
    expect(report).toMatchObject({ stop: 'limit', counts: { claimed: 3, providerCalls: 3, accepted: 3 } });
    expect(peak).toBe(2);
    for (const item of [...report.items, ...second.items]) {
      expect(await f.commit(item.jobId, item.attemptId!)).toMatchObject({ disposition: 'accepted', ordinal: 1 });
    }
    expect(claimNext).toHaveBeenCalledTimes(3);
    expect(f.clock.timers.size).toBe(0);
  });

  it('keeps terminal replay out of both template rendering and provider submission', async () => {
    const f = await workerFixture();
    const load = vi.fn(() => '<p>{{title}}</p>');
    const prepare = vi.fn(local.prepare);
    const registry = createEmailTemplateRegistry(
      { local: { ...local, prepare, html: { kind: 'async', load } } },
      { clock: f.clock },
    );
    const service = createEmailService({ scope: A, store: f.store, registry });
    const first = await service.enqueue(command);
    const worker = f.worker();
    const result = await worker.run();
    const snapshot = f.smtp.prepare.mock.calls[0]?.[0].snapshot;
    expect(snapshot).toMatchObject({ subject: ' Hello <a>&" ', html: '<p>&lt;a&gt;&amp;&quot;</p>' });
    expect(Object.isFrozen(snapshot?.envelope.to[0])).toBe(true);
    expect(await service.enqueue(command)).toMatchObject({
      status: 'replayed',
      job: { jobId: first.job.jobId, disposition: 'accepted' },
    });
    expect(await worker.run()).toMatchObject({ stop: 'idle', items: [] });
    expect(load).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(f.smtp.transmit).toHaveBeenCalledOnce();
    expect(await f.commit(first.job.jobId, result.items[0]!.attemptId!)).toMatchObject({ disposition: 'accepted' });
    expect(await f.store.listActivities(A, {}, CALL)).toEqual({ items: [] });
  });

  it('reports partial acceptance and sandbox validation distinctly and does not reopen either job', async () => {
    const f = await workerFixture();
    const one = await f.add();
    const two = await f.add({ provider: SANDBOX });
    const grid: EmailProvider<SendGridSnapshot> = {
      ref: SANDBOX,
      prepare: () => ({
        submit: async () => ({
          outcome: 'validated',
          reason: 'sendgrid_validated',
          stage: 'http',
          retry: 'never',
        }),
      }),
    };
    const smtp = smtpFixture(async (input) => {
      const evidence = smtpEvidence(input);
      return createSmtpAcceptanceResult(
        evidence.recipients.map((entry) => (entry.group === 'bcc' ? { ...entry, status: 'rejected' } : entry)),
        evidence.messageId,
      );
    });
    const worker = f.worker({ providers: [grid, smtp.provider] });
    const report = await worker.run();
    expect(report.counts).toMatchObject({
      claimed: 2,
      accepted: 0,
      partiallyAccepted: 1,
      validated: 1,
      submitted: 1,
      providerCalls: 2,
    });
    expect(await f.job(one.jobId)).toMatchObject({ state: 'terminal', disposition: 'partially_accepted' });
    expect(await f.job(two.jobId)).toMatchObject({ state: 'terminal', disposition: 'validated' });
    expect((await worker.run()).items).toEqual([]);
    expect(smtp.transmit).toHaveBeenCalledOnce();
  });
});
