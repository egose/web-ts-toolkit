import { getEventListeners } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmailTemplateRegistry,
  createMemoryEmailStore,
  type EmailStore,
  type EmailTemplateRegistry,
  type PreparedEmailCommand,
  type PreparedFields,
  type StoreCall,
} from '../../src';
import { createBudget } from '../../src/internal/budget';
import { parseCommandIdentity } from '../../src/internal/command-codecs';
import { createEmailServiceWithClock, findServiceAdmission } from '../../src/service';
import { CALL, lostAck } from '../conformance/store-fixtures';
import { command, deferred, local, ManualClock, SCOPE, TO } from './template-fixtures';

const definitions = { local };
type Registry = EmailTemplateRegistry<typeof definitions>;
const signature = (code: string) => ({ name: 'EmailError', code });

async function fixture() {
  const clock = new ManualClock();
  const store = createMemoryEmailStore({ clock });
  await store.ready();
  const registry = createEmailTemplateRegistry(definitions, { clock });
  // Prepare a fixture once, to make injected preparation time independent of snapshot generation.
  const staged = await registry.prepare(SCOPE, command);
  return { clock, store, registry, staged, scope: SCOPE };
}

describe('admission budget and write evidence', () => {
  it.each(['before_commit', 'after_commit'] as const)(
    'rereads the exact key once after lost insert acknowledgement (%s)',
    async (mode) => {
      const { clock, scope, store, registry } = await fixture();
      const findAdmission = vi.fn(store.findAdmission);
      const insert = vi
        .fn(store.insert)
        .mockImplementationOnce((...args) => lostAck(mode, () => store.insert(...args)));
      const prepare = vi.fn(registry.prepare);
      const service = createEmailServiceWithClock(
        {
          scope,
          registry: { ...registry, prepare },
          store: { ...store, findAdmission, insert },
        },
        clock,
      );
      if (mode === 'after_commit') {
        await expect(service.enqueue(command)).resolves.toMatchObject({ status: 'replayed' });
      } else {
        await expect(service.enqueue(command)).rejects.toMatchObject(signature('write_unconfirmed'));
        expect(await store.findAdmission(scope, command.key, CALL)).toBeNull();
      }
      expect(findAdmission.mock.calls.map(([s, key]) => [s, key])).toEqual(Array(2).fill([scope, command.key]));
      expect(insert).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      const retry = await service.enqueue(command);
      expect(retry.status).toBe(mode === 'after_commit' ? 'replayed' : 'enqueued');
      expect(insert).toHaveBeenCalledTimes(mode === 'after_commit' ? 1 : 2);
      expect(prepare).toHaveBeenCalledTimes(mode === 'after_commit' ? 1 : 2);
      expect(clock.timers.size).toBe(0);
    },
  );

  it('uses one elapsed budget for the lookup, preparation, insert and exact confirmation read', async () => {
    const { clock, store, registry, staged, scope } = await fixture();
    const findAdmission = vi.fn<EmailStore['findAdmission']>((...args) => {
      if (findAdmission.mock.calls.length === 1) clock.advance(30);
      return store.findAdmission(...args);
    });
    const prepare = vi.fn<Registry['prepare']>(async () => {
      clock.advance(20);
      return staged;
    });
    const insert = vi.fn<EmailStore['insert']>((...args) => {
      clock.advance(15);
      return lostAck('after_commit', () => store.insert(...args));
    });
    const service = createEmailServiceWithClock(
      {
        scope,
        registry: { ...registry, prepare },
        store: { ...store, findAdmission, insert },
      },
      clock,
    );
    const controller = new AbortController();
    const enqueued = await service.enqueue(command, { signal: controller.signal, timeoutMs: 100 });
    expect(enqueued.status).toBe('replayed');
    expect(findAdmission.mock.calls.map(([, , call]) => call.timeoutMs)).toEqual([100, 35]);
    expect(prepare.mock.calls[0]?.[2]?.timeoutMs).toBe(70);
    expect(insert.mock.calls[0]?.[2].timeoutMs).toBe(50);
    expect(clock.timers.size).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('treats a confirmation miss as uncertainty even if the dispatched write commits later', async () => {
    const { clock, scope, store, registry } = await fixture();
    const dispatch = deferred<Parameters<EmailStore['insert']>>();
    const findAdmission = vi.fn(store.findAdmission);
    const prepare = vi.fn(registry.prepare);
    const insert = vi.fn<EmailStore['insert']>(async (...args) => {
      dispatch.resolve(args);
      throw { code: 'write_unconfirmed' };
    });
    const service = createEmailServiceWithClock(
      {
        scope,
        store: { ...store, insert, findAdmission },
        registry: { ...registry, prepare },
      },
      clock,
    );
    const pending = service.enqueue(command);
    await expect(pending).rejects.toMatchObject(signature('write_unconfirmed'));
    expect(await store.findAdmission(scope, command.key, CALL)).toBeNull();
    // Model the server completing work already submitted, independently of its lost response.
    const [s, admission] = await dispatch.promise;
    await expect(store.insert(s, admission, CALL)).resolves.toMatchObject({ status: 'inserted' });
    await expect(service.enqueue(command)).resolves.toMatchObject({
      status: 'replayed',
      job: { jobId: admission.jobId },
    });
    expect(findAdmission).toHaveBeenCalledTimes(3);
    expect(insert).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('does not infer rollback at the outer deadline or ignore a write with outstanding I/O', async () => {
    const { clock, scope, store, registry } = await fixture();
    const entered = deferred<Parameters<EmailStore['insert']>>();
    const release = deferred<Awaited<ReturnType<EmailStore['insert']>>>();
    const findAdmission = vi.fn(store.findAdmission);
    const prepare = vi.fn(registry.prepare);
    const insert = vi.fn<EmailStore['insert']>((...args) => {
      entered.resolve(args);
      return release.promise;
    });
    const service = createEmailServiceWithClock(
      {
        scope,
        store: { ...store, findAdmission, insert },
        registry: { ...registry, prepare },
      },
      clock,
    );
    const pending = service.enqueue(command, { timeoutMs: 50 });
    const state = vi.fn();
    void pending.then(state, state);
    const failure = expect(pending).rejects.toMatchObject(signature('write_unconfirmed'));
    const [writeScope, dto, call] = await entered.promise;
    expect(call.timeoutMs).toBe(50);
    const ack = await store.insert(writeScope, dto, CALL);
    clock.advance(50);
    await Promise.resolve();
    expect(call.signal.aborted).toBe(true);
    expect(state).not.toHaveBeenCalled();
    release.resolve(ack);
    await failure;
    expect(findAdmission).toHaveBeenCalledOnce(); // No time left for recovery.
    expect(insert).toHaveBeenCalledOnce();
    await expect(service.enqueue(command)).resolves.toMatchObject({ status: 'replayed', job: { jobId: dto.jobId } });
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('caps store RPCs at five seconds and can still confirm in the remaining admission budget', async () => {
    const { clock, scope, registry, store } = await fixture();
    const dispatched = deferred<StoreCall>();
    const ack = deferred<Awaited<ReturnType<EmailStore['insert']>>>();
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn<EmailStore['insert']>((s, dto, call) => {
      dispatched.resolve(call);
      void store.insert(s, dto, CALL).then(ack.resolve, ack.reject);
      return new Promise((resolve, reject) => {
        call.signal.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('Not a rollback'), { code: 'deadline' })),
          { once: true },
        );
        void ack.promise.catch(reject);
      });
    });
    const service = createEmailServiceWithClock({ scope, registry, store: { ...store, insert, findAdmission } }, clock);
    const result = service.enqueue(command);
    const call = await dispatched.promise;
    await ack.promise;
    expect(call.timeoutMs).toBe(5_000);
    clock.advance(5_000);
    await expect(result).resolves.toMatchObject({ status: 'replayed' });
    expect(call.signal.aborted).toBe(true);
    expect(findAdmission.mock.calls.map(([, , budget]) => budget.timeoutMs)).toEqual([5_000, 5_000]);
    expect(findAdmission.mock.calls[1]?.[2].signal).not.toBe(call.signal);
  });

  it('keeps an insert proved before the boundary when the outer deadline elapses before return', async () => {
    const { clock, scope, registry, store } = await fixture();
    const dispatched = deferred<Parameters<EmailStore['insert']>>();
    const release = deferred<Awaited<ReturnType<EmailStore['insert']>>>();
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn<EmailStore['insert']>((...args) => {
      dispatched.resolve(args);
      return release.promise;
    });
    const service = createEmailServiceWithClock({ scope, registry, store: { ...store, insert, findAdmission } }, clock);
    const pending = service.enqueue(command, { timeoutMs: 50 });
    const args = await dispatched.promise;
    const ack = await store.insert(...args);
    release.resolve(ack);
    queueMicrotask(() => clock.advance(50));
    await expect(pending).resolves.toMatchObject({ status: 'enqueued', job: { jobId: args[1].jobId } });
    expect(findAdmission).toHaveBeenCalledOnce();
  });

  it('maps untrusted insert errors to uncertainty, recovering a matching or conflicting committed winner', async () => {
    const { clock, scope, store, registry } = await fixture();
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn<EmailStore['insert']>(async (s, dto, call) => {
      await store.insert(s, dto, call);
      throw new Error('synthetic private response');
    });
    const service = createEmailServiceWithClock({ scope, registry, store: { ...store, insert, findAdmission } }, clock);
    await expect(service.enqueue(command)).resolves.toMatchObject({ status: 'replayed' });
    const beforeConflictingWinner = { ...command, key: { ...command.key, idempotencyKey: 'later-conflict' } };
    const winner = createEmailServiceWithClock({ scope, registry, store }, clock);
    insert.mockImplementationOnce(async () => {
      await winner.enqueue({ ...beforeConflictingWinner, intent: { version: 2 } });
      throw { code: 'write_unconfirmed', message: 'synthetic private response' };
    });
    await expect(service.enqueue(beforeConflictingWinner)).rejects.toMatchObject(signature('idempotency_conflict'));
    expect(findAdmission.mock.calls.map(([, key]) => key)).toEqual([
      command.key,
      command.key,
      beforeConflictingWinner.key,
      beforeConflictingWinner.key,
    ]);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('does not accept corrupt insert acknowledgements, an absent/unavailable winner, or inconsistent replay metadata', async () => {
    const { clock, scope, store, registry, staged } = await fixture();
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn<EmailStore['insert']>();
    const service = createEmailServiceWithClock({ scope, registry, store: { ...store, insert, findAdmission } }, clock);
    insert.mockResolvedValueOnce({ status: 'duplicate' });
    await expect(service.enqueue(command)).rejects.toMatchObject(signature('write_unconfirmed'));

    insert.mockImplementationOnce(async () => {
      findAdmission.mockRejectedValueOnce({ code: 'store_unavailable', message: 'synthetic private response' });
      throw { code: 'write_unconfirmed' };
    });
    await expect(service.enqueue(command)).rejects.toMatchObject(signature('write_unconfirmed'));

    insert.mockImplementationOnce(async (...args) => {
      const ack = await store.insert(...args);
      if (ack.status !== 'inserted') throw new Error('Expected fresh identity');
      const actual = ack.job;
      findAdmission.mockResolvedValueOnce({
        job: { ...actual, template: { ...actual.template, key: 'not-the-fingerprint-template' } },
        fingerprint: staged.fingerprint,
      });
      return { ...ack, job: { ...actual, expiresAt: actual.expiresAt + 1 } };
    });
    await expect(service.enqueue(command)).rejects.toMatchObject(signature('write_unconfirmed'));
    await expect(service.enqueue(command)).resolves.toMatchObject({ status: 'replayed' });
    expect(insert).toHaveBeenCalledTimes(3);
    expect(findAdmission).toHaveBeenCalledTimes(7);
  });

  it('stops after a failed or late initial lookup without starting preparation', async () => {
    const { clock, scope, store, registry } = await fixture();
    const read = deferred<null>();
    const findAdmission = vi.fn(store.findAdmission).mockReturnValueOnce(read.promise);
    const insert = vi.fn(store.insert);
    const prepare = vi.fn(registry.prepare);
    const service = createEmailServiceWithClock(
      {
        scope,
        registry: { ...registry, prepare },
        store: { ...store, insert, findAdmission },
      },
      clock,
    );
    const result = service.enqueue(command, { timeoutMs: 50 });
    clock.advance(50);
    read.resolve(null);
    await expect(result).rejects.toMatchObject(signature('deadline'));
    expect(findAdmission.mock.calls[0]?.[2].signal.aborted).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('bounded injected preparation and budget reuse', () => {
  it('expires an injected preparation at its own cap even while the outer call still has time', async () => {
    const { clock, scope, registry, store, staged } = await fixture();
    const entered = deferred<AbortSignal>();
    const preparation = deferred<PreparedEmailCommand>();
    const prepare = vi.fn<Registry['prepare']>((_scope, _command, options) => {
      entered.resolve(options!.signal!);
      return preparation.promise;
    });
    const insert = vi.fn(store.insert);
    const service = createEmailServiceWithClock(
      { scope, store: { ...store, insert }, registry: { ...registry, prepare } },
      clock,
    );
    const pending = service.enqueue(command);
    const signal = await entered.promise;
    expect(prepare.mock.calls[0]?.[2]?.timeoutMs).toBe(5_000);
    clock.advance(5_000);
    await expect(pending).rejects.toMatchObject(signature('deadline'));
    expect(signal.aborted).toBe(true);
    preparation.resolve(staged);
    await preparation.promise;
    expect(insert).not.toHaveBeenCalled();
  });

  it('shares pending slots for the same injected registry across facades and retains them after timeout', async () => {
    const { clock, scope, registry, store, staged } = await fixture();
    const insert = vi.fn(store.insert);
    const port = { ...store, insert };
    const started = deferred<void>();
    const gates = Array.from({ length: 8 }, () => deferred<PreparedEmailCommand>());
    let count = 0;
    // The injected registry deliberately ignores cancellation.
    const prepare = vi.fn<Registry['prepare']>(() => {
      const gate = gates[count++]!;
      if (count === gates.length) started.resolve();
      return gate.promise;
    });
    const injected = { ...registry, prepare };
    const a = createEmailServiceWithClock({ scope, store: port, registry: injected }, clock);
    const b = createEmailServiceWithClock({ scope, store: port, registry: injected }, clock);
    const committed = { ...command, key: { ...command.key, idempotencyKey: 'already-committed' } };
    await createEmailServiceWithClock({ scope, store, registry }, clock).enqueue(committed);
    const pending = gates.map(() => a.enqueue(command, { timeoutMs: 50 }));
    const failures = pending.map((promise) => expect(promise).rejects.toMatchObject(signature('deadline')));
    await started.promise;
    await expect(b.enqueue(command)).rejects.toMatchObject(signature('busy'));
    clock.advance(50);
    await Promise.all(failures);
    expect(prepare.mock.calls.every(([, , opts]) => opts?.signal?.aborted)).toBe(true);
    await expect(b.enqueue(command)).rejects.toMatchObject(signature('busy'));
    await expect(b.enqueue(committed)).resolves.toMatchObject({ status: 'replayed' });
    expect(prepare).toHaveBeenCalledTimes(8);
    expect(insert).not.toHaveBeenCalled();
    gates[0]!.resolve(staged);
    await gates[0]!.promise;
    prepare.mockResolvedValueOnce(staged);
    await expect(b.enqueue(command)).resolves.toMatchObject({ status: 'enqueued' });
    for (const gate of gates.slice(1)) gate.reject(new Error('synthetic late callback error'));
    await Promise.allSettled(gates.map(({ promise }) => promise));
    expect(insert).toHaveBeenCalledOnce();
    expect(clock.timers.size).toBe(0);
  });

  it('uses the built-in registry’s original slot and fences subsequent steps after a late validator', async () => {
    const { clock, store, scope } = await fixture();
    const gate = deferred<PreparedFields<{ title: string }>>();
    const entered = deferred<void>();
    const prepare = vi
      .fn<typeof local.prepare>()
      .mockImplementationOnce(() => {
        entered.resolve();
        return gate.promise;
      })
      .mockImplementation(local.prepare);
    const parseData = vi.fn(local.parseData).mockImplementationOnce((raw) => {
      clock.advance(50); // Simulate synchronous work overrunning the outer budget.
      return local.parseData(raw);
    });
    const load = vi.fn(() => '<p>{{title}}</p>');
    const registry = createEmailTemplateRegistry(
      {
        local: { ...local, prepare, parseData, html: { kind: 'async', load } },
      },
      { clock, maxPending: 1 },
    );
    const insert = vi.fn(store.insert);
    const service = createEmailServiceWithClock({ scope, store: { ...store, insert }, registry }, clock);
    const first = service.enqueue(command, { timeoutMs: 50 });
    const failure = expect(first).rejects.toMatchObject(signature('deadline'));
    await entered.promise;
    clock.advance(50);
    await failure;
    await expect(registry.prepare(scope, command)).rejects.toMatchObject(signature('busy'));
    await expect(service.enqueue(command)).rejects.toMatchObject(signature('busy'));
    gate.resolve({ values: { title: 'late' }, to: [TO] });
    await gate.promise;
    expect(parseData).not.toHaveBeenCalled();
    await expect(service.enqueue(command, { timeoutMs: 50 })).rejects.toMatchObject(signature('deadline'));
    expect(parseData).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);
  });

  it('lets batch reuse a validated command and a shortened budget without changing the public service shape', async () => {
    const { clock, store, registry, scope } = await fixture();
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn(store.insert);
    const service = createEmailServiceWithClock({ scope, registry, store: { ...store, findAdmission, insert } }, clock);
    expect(Object.keys(service).sort()).toEqual(['enqueue', 'enqueuePrepared', 'scope']);
    const parent = createBudget(clock, 70);
    const enqueue = findServiceAdmission(service)!;
    const parsed = parseCommandIdentity(scope, command);
    try {
      clock.advance(55);
      const item = await enqueue(parsed, parent);
      expect(item.status).toBe('enqueued');
      expect(findAdmission.mock.calls[0]?.[2].timeoutMs).toBe(15);
      expect(insert.mock.calls[0]?.[2].timeoutMs).toBe(15);
      clock.advance(15);
      await expect(enqueue(parsed, parent)).rejects.toMatchObject(signature('deadline'));
      expect(findAdmission).toHaveBeenCalledOnce();
    } finally {
      parent.close();
    }
    expect(clock.timers.size).toBe(0);
  });
});
