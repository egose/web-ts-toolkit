import { describe, expect, it, vi } from 'vitest';
import {
  createEmailBatchAdmission,
  createEmailBatchService,
  createEmailWorker,
  type AdmissionResult,
  type EmailService,
  type EmailWorker,
} from '../../src';
import { CALL, lostAck } from '../conformance/store-fixtures';
import { BATCH, batchFixture, batchItem, batchKey, request } from './batch-fixture';
import { command, deferred, local, NOW, SCOPE, TO } from './template-fixtures';
import { smtpFixture } from './worker-fixtures';

type Service = EmailService<{ local: typeof local }>;
type Batch = Awaited<ReturnType<typeof batchFixture>>['batch'];
type BatchRequest = Parameters<Batch['enqueueBatch']>[0];
const PRIVATE = 'synthetic private diagnostic';

describe('batch boundary', () => {
  it('requires equal valid bound scopes and data methods without invoking configuration accessors', async () => {
    const { service, store, clock } = await batchFixture();
    const worker = createEmailWorker({ scope: SCOPE, store, clock, providers: [smtpFixture().provider] });
    const access = vi.fn(() => SCOPE);
    const run = vi.fn(worker.run);
    const trap = vi.fn();
    const spoof = new Proxy(service, { getOwnPropertyDescriptor: trap });
    const disconnected = { ...worker, scope: 'foreign', run };
    for (const invalid of [
      { service, worker: disconnected },
      { service: { ...service, scope: 'a'.repeat(65) }, worker },
      {
        service: {
          ...service,
          get scope() {
            return access();
          },
        },
        worker,
      },
      {
        service,
        worker: {
          ...worker,
          get run() {
            access();
            return run;
          },
        },
      },
      { service, worker: { ...worker, run: null } },
      { service: spoof, worker },
      { service, worker, scope: SCOPE },
    ]) {
      expect(() => createEmailBatchService(invalid as { service: Service; worker: EmailWorker })).toThrow(
        expect.objectContaining({ code: 'invalid_config' }),
      );
    }
    expect(access).not.toHaveBeenCalled();
    expect(trap).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('binds structural data methods and fails safely if a host changes either bound scope', async () => {
    const { service: core, store, clock } = await batchFixture();
    const original = createEmailWorker({ scope: SCOPE, store, clock, providers: [smtpFixture().provider] });
    const beforeEnqueue = vi.fn();
    class StructuralService implements Service {
      scope = SCOPE;
      enqueue(...args: Parameters<Service['enqueue']>) {
        beforeEnqueue(this);
        return core.enqueue(...args);
      }
      enqueuePrepared = core.enqueuePrepared;
    }
    const service = new StructuralService();
    const worker = { ...original, run: vi.fn(original.run) };
    const batch = createEmailBatchService({ service, worker });
    service.enqueue = vi.fn();
    await expect(batch.enqueueBatch(request('bound'))).resolves.toMatchObject({ counts: { enqueued: 1 } });
    expect(beforeEnqueue).toHaveBeenCalledExactlyOnceWith(service);
    expect(service.enqueue).not.toHaveBeenCalled();

    service.scope = 'other-scope';
    await expect(batch.enqueueBatch(request('unbound'))).resolves.toMatchObject({
      items: [{ itemId: 'unbound', status: 'failed', code: 'invalid_config' }],
      counts: { persistenceFailures: 0 },
    });
    expect(beforeEnqueue).toHaveBeenCalledOnce();
    worker.scope = 'other-scope';
    await expect(batch.run()).rejects.toMatchObject({ code: 'invalid_config' });
    expect(worker.run).not.toHaveBeenCalled();
  });

  it('validates the whole envelope, dense array and all static metadata before lookup or preparation', async () => {
    const f = await batchFixture();
    const first = batchItem('first');
    const last = batchItem('last');
    const neverRead = vi.fn(() => {
      throw new Error(PRIVATE);
    });
    const traps = { getOwnPropertyDescriptor: neverRead };
    const sparse = [first, last];
    delete sparse[1];
    const withLast = (entry: unknown) => ({ batchId: BATCH, items: [first, entry] });
    const withCommand = (change: object) => withLast({ ...last, command: { ...last.command, ...change } });
    for (const malformed of [
      null,
      { ...request('first'), scope: SCOPE },
      { ...request('first'), batchId: 'bad:batch' },
      {
        get batchId() {
          return neverRead();
        },
        items: [first],
      },
      request(),
      request(...Array.from({ length: 101 }, (_, n) => `item-${n}`)),
      request('first', 'first'),
      withLast({ ...last, itemId: 'a'.repeat(129) }),
      withLast({ ...last, itemId: 'bad/item' }),
      withLast({ ...last, batchId: 'extra' }),
      { batchId: BATCH, items: sparse },
      { batchId: BATCH, items: Object.defineProperty([first, last], '1', { get: neverRead }) },
      { batchId: BATCH, items: Object.assign([first, last], { extra: true }) },
      { batchId: BATCH, items: new Proxy([first, last], traps) },
      withLast({
        ...last,
        command: {
          ...last.command,
          get input() {
            return neverRead();
          },
        },
      }),
      withLast({ ...last, command: new Proxy(last.command, traps) }),
      withCommand({ key: { kind: 'single', idempotencyKey: 'caller-key' } }),
      withCommand({ templateKey: '?' }),
      withCommand({ provider: { ...command.provider, mode: 'sandbox' } }),
      withCommand({ scheduleAt: -1 }),
      withCommand({ intent: { content: 'x'.repeat(16 * 1024) } }),
      withCommand({ intent: { toJSON: neverRead } }),
    ]) {
      await expect(f.batch.enqueueBatch(malformed as BatchRequest)).rejects.toMatchObject({
        name: 'EmailError',
        code: 'invalid_command',
      });
    }
    for (const call of [{ timeoutMs: 49 }, { timeoutMs: 120_001 }, { timeoutMs: 50.5 }, { signal: {} }, { limit: 1 }]) {
      await expect(f.batch.enqueueBatch(request('first'), call as never)).rejects.toMatchObject({
        code: 'invalid_config',
      });
    }
    expect(f.findAdmission).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
    expect(f.parseInput).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.load).not.toHaveBeenCalled();
    expect(neverRead).not.toHaveBeenCalled();
    expect(f.clock.timers.size).toBe(0);
  });

  it('uses detached ordered metadata and preserves the supplied opaque input reference', async () => {
    const f = await batchFixture();
    const resolveLookup = deferred<null>();
    f.findAdmission.mockReturnValueOnce(resolveLookup.promise);
    const ids = request('second', 'first');
    const later = { ...ids.items[1]!, command: { ...ids.items[1]!.command, scheduleAt: NOW + 3_000 } };
    ids.items[1] = later;
    const pending = f.batch.enqueueBatch(ids);
    expect(f.findAdmission).toHaveBeenCalledOnce(); // Admission remains sequential.
    ids.batchId = 'rewritten-batch';
    ids.items.reverse();
    later.itemId = 'rewritten-item';
    later.command.provider.key = 'rewritten-profile';
    later.command.intent.id = 'rewritten-intent';
    later.command.scheduleAt += 1;
    later.command.input = 'rewritten-input';
    ids.items.length = 0;
    resolveLookup.resolve(null);

    const result = await pending;
    expect(result).toMatchObject({
      batchId: BATCH,
      counts: { enqueued: 2, replayed: 0, failed: 0, notStarted: 0, persistenceFailures: 0 },
      items: [
        { itemId: 'second', job: { key: batchKey('second') } },
        { itemId: 'first', job: { key: batchKey('first'), provider: command.provider, scheduleAt: NOW + 3_000 } },
      ],
    });
    expect(f.parseInput.mock.calls).toEqual([[command.input], [command.input]]);
    expect(f.findAdmission.mock.calls.map(([, key]) => key)).toEqual([batchKey('second'), batchKey('first')]);
    const opaque = new Proxy(
      {},
      {
        get() {
          throw new Error(PRIVATE);
        },
        ownKeys() {
          throw new Error(PRIVATE);
        },
      },
    );
    const fallback = vi.fn<Service['enqueue']>().mockRejectedValueOnce({ code: 'invalid_input' });
    const structural = createEmailBatchAdmission({ service: { ...f.service, enqueue: fallback } });
    const next = batchItem('opaque');
    await expect(
      structural.enqueueBatch({
        batchId: BATCH,
        items: [{ ...next, command: { ...next.command, input: opaque as never } }],
      }),
    ).resolves.toMatchObject({ items: [{ status: 'failed', code: 'invalid_input' }] });
    expect(fallback.mock.calls[0]?.[0].input).toBe(opaque);
  });

  it('admits exactly 100 items sequentially, including the identifier byte ceiling', async () => {
    const f = await batchFixture();
    const ids = ['z'.repeat(128), ...Array.from({ length: 99 }, (_, n) => `item-${n}`)];
    const allow = deferred<null>();
    f.findAdmission.mockReturnValueOnce(allow.promise);
    const batchId = 'a'.repeat(128);
    const pending = f.batch.enqueueBatch({ batchId, items: ids.map(batchItem) });
    expect(f.findAdmission).toHaveBeenCalledOnce();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
    allow.resolve(null);
    const result = await pending;
    expect(result.counts).toEqual({ enqueued: 100, replayed: 0, failed: 0, notStarted: 0, persistenceFailures: 0 });
    expect(result.items.map(({ itemId }) => itemId)).toEqual(ids);
    expect(f.findAdmission.mock.calls.map(([scope, key]) => [scope, key])).toEqual(
      ids.map((id) => [SCOPE, batchKey(id, batchId)]),
    );
    expect(f.prepare).toHaveBeenCalledTimes(100);
    expect(f.insert).toHaveBeenCalledTimes(100);
    expect(f.clock.timers.size).toBe(0);
  });

  it('keeps earlier writes, reports independent conflicts and failures, and counts only the persistence subset', async () => {
    const f = await batchFixture({ maxJobs: 4 });
    await f.batch.enqueueBatch(request('conflict'));
    f.findAdmission.mockImplementation((scope, key, call) => {
      if (key.kind === 'batch' && key.itemId === 'read-failed') return Promise.reject(new Error(PRIVATE));
      if (key.kind === 'batch' && key.itemId === 'bad-read') return Promise.resolve({ payload: PRIVATE } as never);
      return f.store.findAdmission(scope, key, call);
    });
    f.insert.mockImplementation((scope, admission, call) => {
      const { key } = admission.command;
      if (key.kind !== 'batch') throw new Error('Unexpected single key');
      if (key.itemId === 'lost') return lostAck('before_commit', () => f.store.insert(scope, admission, call));
      if (key.itemId === 'committed') return lostAck('after_commit', () => f.store.insert(scope, admission, call));
      return f.store.insert(scope, admission, call);
    });
    const input = request(
      'first',
      'conflict',
      'bad-input',
      'read-failed',
      'bad-read',
      'lost',
      'committed',
      'last',
      'full',
    );
    input.items[0]!.command.input = 'private-input-sentinel';
    input.items[1]!.command.intent.event = 'changed-intent';
    input.items[2]!.command.input = '';
    const result = await f.batch.enqueueBatch(input);
    expect(result).toMatchObject({
      items: [
        { itemId: 'first', status: 'enqueued' },
        { itemId: 'conflict', status: 'failed', code: 'idempotency_conflict' },
        { itemId: 'bad-input', status: 'failed', code: 'invalid_input' },
        { itemId: 'read-failed', status: 'failed', code: 'store_unavailable' },
        { itemId: 'bad-read', status: 'failed', code: 'store_incompatible' },
        { itemId: 'lost', status: 'failed', code: 'write_unconfirmed' },
        { itemId: 'committed', status: 'replayed' },
        { itemId: 'last', status: 'enqueued' },
        { itemId: 'full', status: 'failed', code: 'store_capacity' },
      ],
      counts: { enqueued: 2, replayed: 1, failed: 6, notStarted: 0, persistenceFailures: 4 },
    });
    expect(await f.store.findAdmission(SCOPE, batchKey('lost'), CALL)).toBeNull();
    expect(await f.store.findAdmission(SCOPE, batchKey('committed'), CALL)).not.toBeNull();
    const encoded = JSON.stringify(result);
    for (const forbidden of [
      PRIVATE,
      'private-input-sentinel',
      TO.address,
      'snapshot',
      'fingerprint',
      '"input":',
      'cause',
      'message',
    ]) {
      expect(encoded).not.toContain(forbidden);
    }
    const admitted = result.items[0]!;
    if (admitted.status !== 'enqueued') throw new Error('Expected the successful fixture admission');
    for (const dto of [
      result,
      result.counts,
      result.items,
      ...result.items,
      admitted.job,
      admitted.job.key,
      admitted.job.provider,
      admitted.job.template,
      admitted.job.correlation,
      admitted.job.resolutions,
    ]) {
      expect(Object.isFrozen(dto)).toBe(true);
    }
  });
});

describe('structural service replies', () => {
  it('decodes a detached redacted result and permits later-state replays', async () => {
    const { service, store } = await batchFixture();
    const { command } = batchItem('existing');
    const { job } = await service.enqueue({ ...command, key: batchKey('existing') });
    await store.cancel(SCOPE, job.jobId, CALL);
    const saved = structuredClone(await service.enqueue({ ...command, key: batchKey('existing') }));
    const enqueue = vi.fn<Service['enqueue']>().mockResolvedValue(saved);
    const batch = createEmailBatchAdmission({ service: { ...service, enqueue } });

    const result = await batch.enqueueBatch(request('existing'));
    const item = result.items[0]!;
    if (item.status !== 'replayed') throw new Error('Expected the successful fixture replay');
    expect(item.job).toMatchObject({ state: 'terminal', disposition: 'cancelled' });
    expect(item.job).not.toBe(saved.job);
    expect(item.job.key).not.toBe(saved.job.key);
    expect(item.job.provider).not.toBe(saved.job.provider);
    expect(item.job.template).not.toBe(saved.job.template);
    expect(item.job.correlation).not.toBe(saved.job.correlation);
    expect(Object.isFrozen(item.job.resolutions)).toBe(true);
    Object.assign(saved.job.provider, { key: 'changed' });
    Object.assign(saved.job.correlation, { unrelated: 'private' });
    expect(item.job.provider.key).toBe(command.provider.key);
    expect(Object.keys(item.job.correlation)).toEqual([]);
  });

  it('rejects unrelated, malformed or private replies without treating them as proof of noncommit', async () => {
    const { service, store } = await batchFixture();
    const { command } = batchItem('existing');
    const ok = await service.enqueue({ ...command, key: batchKey('existing') });
    await store.cancel(SCOPE, ok.job.jobId, CALL);
    const terminal = await service.enqueue({ ...command, key: batchKey('existing') });
    const privateField = vi.fn(() => {
      throw new Error(PRIVATE);
    });
    const enqueue = vi.fn<Service['enqueue']>();
    const batch = createEmailBatchAdmission({ service: { ...service, enqueue } });
    for (const output of [
      null,
      { ...ok, status: 'sent' },
      { ...ok, rawResponse: PRIVATE },
      {
        status: ok.status,
        get job() {
          return privateField();
        },
      },
      { ...ok, job: { ...ok.job, scope: 'other' } },
      { ...ok, job: { ...ok.job, key: batchKey('other') } },
      { ...ok, job: { ...ok.job, key: batchKey('existing', 'other-batch') } },
      { ...ok, job: { ...ok.job, key: { kind: 'single', idempotencyKey: 'existing' } } },
      { ...ok, job: { ...ok.job, provider: { ...ok.job.provider, key: 'other' } } },
      { ...ok, job: { ...ok.job, template: { ...ok.job.template, key: 'other' } } },
      { ...ok, job: { ...ok.job, scheduleAt: NOW } },
      { ...ok, job: { ...ok.job, jobId: 'not-an-id' } },
      { ...ok, job: { ...ok.job, snapshot: PRIVATE } },
      { ...terminal, status: 'enqueued' },
    ]) {
      enqueue.mockResolvedValueOnce(output as AdmissionResult);
      await expect(batch.enqueueBatch(request('existing'))).resolves.toEqual({
        batchId: BATCH,
        items: [{ itemId: 'existing', status: 'failed', code: 'write_unconfirmed' }],
        counts: { enqueued: 0, replayed: 0, failed: 1, notStarted: 0, persistenceFailures: 1 },
      });
    }
    const notATask = {
      ...ok,
      get then() {
        return privateField();
      },
    };
    enqueue.mockReturnValueOnce(notATask as unknown as Promise<AdmissionResult>);
    await expect(batch.enqueueBatch(request('existing'))).resolves.toMatchObject({
      items: [{ code: 'write_unconfirmed' }],
    });
    expect(privateField).not.toHaveBeenCalled();
  });

  it('allowlists own error codes across builds; arbitrary messages, getters and inherited codes do not escape', async () => {
    const { service } = await batchFixture();
    const enqueue = vi.fn<Service['enqueue']>();
    const privateField = vi.fn(() => {
      throw new Error(PRIVATE);
    });
    const batch = createEmailBatchAdmission({ service: { ...service, enqueue } });
    enqueue
      .mockRejectedValueOnce(Object.assign(new Error(PRIVATE), { code: 'invalid_input', cause: PRIVATE }))
      .mockRejectedValueOnce({ code: 'store_capacity', message: PRIVATE })
      .mockRejectedValueOnce({ code: 'provider_mismatch', response: PRIVATE })
      .mockRejectedValueOnce({ code: 'idempotency_conflict', message: PRIVATE })
      .mockRejectedValueOnce({ code: 'not_found', message: PRIVATE })
      .mockRejectedValueOnce({
        get code() {
          return privateField();
        },
      })
      .mockRejectedValueOnce(Object.create({ code: 'store_unavailable' }))
      .mockRejectedValueOnce(new Proxy({}, { getOwnPropertyDescriptor: privateField }))
      .mockImplementationOnce(() => {
        throw new Error(PRIVATE);
      });
    const result = await batch.enqueueBatch(request(...Array.from({ length: 9 }, (_, n) => `i-${n}`)));
    expect(result.items).toEqual(
      [
        'invalid_input',
        'store_capacity',
        'provider_mismatch',
        'idempotency_conflict',
        ...Array<string>(5).fill('write_unconfirmed'),
      ].map((code, n) => ({ itemId: `i-${n}`, status: 'failed', code })),
    );
    expect(result.counts).toEqual({ enqueued: 0, replayed: 0, failed: 9, notStarted: 0, persistenceFailures: 6 });
    expect(JSON.stringify(result)).not.toContain(PRIVATE);
    expect(privateField).not.toHaveBeenCalled();
  });
});
