import { describe, expect, it, vi } from 'vitest';
import {
  createEmailService,
  createEmailTemplateRegistry,
  createMemoryEmailStore,
  type EmailServiceOptions,
  type EmailStore,
  type EmailTemplateRegistry,
  type PreparedEmailCommand,
  type PreparedFields,
} from '../../src';
import { accepted, applied, CALL, claim, finishClaim, finishData } from '../conformance/store-fixtures';
import {
  command,
  deferred,
  local,
  ManualClock,
  NOW,
  remote,
  remoteCommand,
  SCOPE,
  SMTP,
  TO,
} from './template-fixtures';

const definitions = { local, remote };
type Registry = EmailTemplateRegistry<typeof definitions>;
const DAY = 86_400_000;
const OTHER_SCOPE = 'Tenant-2';
const SECRET = 'synthetic private value@example.invalid';

async function fixture() {
  const clock = new ManualClock();
  const store = createMemoryEmailStore({ clock });
  await store.ready();
  const registry = createEmailTemplateRegistry(definitions, { clock });
  return { clock, store, registry, scope: SCOPE };
}

function rejected(code: string) {
  return { name: 'EmailError', code };
}

describe('scope-bound email admission', () => {
  it('validates options without invoking accessors, readiness, or store/registry methods', async () => {
    const { store, registry } = await fixture();
    const poison = vi.fn(() => {
      throw new Error(SECRET);
    });
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn(store.insert);
    const prepare = vi.fn(registry.prepare);
    const ready = vi.fn(store.ready);
    Object.defineProperty(prepare, 'name', { get: poison });
    const config = {
      scope: SCOPE,
      store: { ...store, ready, findAdmission, insert },
      registry: { ...registry, prepare },
    };
    const make = (config: unknown) => createEmailService(config as EmailServiceOptions<typeof definitions>);
    for (const configValue of [
      null,
      Object.create(config),
      new Proxy(config, { ownKeys: poison }),
      { ...config, scope: 'tenant:$bad' },
      { ...config, scope: 'X'.repeat(65) },
      { ...config, providers: [] },
      { ...config, store: { ...store, insert: null } },
      { ...config, registry: new Proxy(registry, { get: poison, getOwnPropertyDescriptor: poison }) },
      {
        ...config,
        registry: {
          get prepare() {
            return poison();
          },
        },
      },
      { ...config, retry: null },
      { ...config, retry: { maxAttempts: 0 } },
      { ...config, retry: { baseDelayMs: 1_001, maxDelayMs: 1_000 } },
      { ...config, retry: { maxDelayMs: 3_600_001 } },
      { ...config, retention: { payloadMs: -1 } },
      { ...config, retention: { historyMs: DAY - 1 } },
      { ...config, retention: { idempotencyMs: 91 * DAY } },
      { ...config, retention: { unexpected: SECRET } },
      {
        ...config,
        retention: {
          get payloadMs() {
            return poison();
          },
        },
      },
    ]) {
      expect(() => make(configValue)).toThrow(expect.objectContaining(rejected('invalid_config')));
    }
    const service = make(config);
    for (const options of [{ timeoutMs: 49 }, { timeoutMs: 60_001 }, { signal: {} }, { extra: SECRET }]) {
      await expect(service.enqueue(command, options as never)).rejects.toMatchObject(rejected('invalid_config'));
    }
    for (const input of [
      { ...command, key: { ...command.key, itemId: 'ignored' } },
      { ...command, scheduleAt: null },
      { ...command, intent: { ['toJSON']: poison } },
      {
        ...command,
        get input() {
          return poison();
        },
      },
    ]) {
      await expect(service.enqueue(input as typeof command)).rejects.toMatchObject(rejected('invalid_command'));
    }
    await expect(service.enqueue(command, { signal: AbortSignal.abort(new Error(SECRET)) })).rejects.toMatchObject(
      rejected('aborted'),
    );
    expect(service.scope).toBe(SCOPE);
    expect(Object.isFrozen(service)).toBe(true);
    for (const port of [poison, ready, findAdmission, insert, prepare]) expect(port).not.toHaveBeenCalled();
  });

  it('binds the used capabilities and freezes effective partial policies without fingerprinting them', async () => {
    const { store, scope, registry } = await fixture();
    const retry = { maxAttempts: 4, baseDelayMs: 2_000 };
    const retention = { payloadMs: 0 };
    class RegistryPort {
      calls = 0;
      invalidate = registry.invalidate;
      async prepare(...args: Parameters<Registry['prepare']>) {
        this.calls++;
        return registry.prepare(...args);
      }
    }
    const injected = new RegistryPort();
    const insert = vi.fn(store.insert);
    const port = { ...store, insert };
    const service = createEmailService({ scope, store: port, registry: injected, retry, retention });
    port.insert = vi.fn();
    retry.maxAttempts = 0;
    retry.baseDelayMs = 0;
    retention.payloadMs = -1;
    const first = await service.enqueue(command);
    const second = await createEmailService({ scope, store, registry, retry: { maxAttempts: 10 } }).enqueue(command);
    expect(first.status).toBe('enqueued');
    expect(second).toEqual({ status: 'replayed', job: first.job });
    expect(injected.calls).toBe(1);
    expect(port.insert).not.toHaveBeenCalled();
    const [, admission] = insert.mock.calls[0]!;
    expect(admission.retry).toEqual({ maxAttempts: 4, baseDelayMs: 2_000, maxDelayMs: 60_000 });
    expect(admission.retention).toEqual({ payloadMs: 0, historyMs: 30 * DAY, idempotencyMs: 30 * DAY });
    expect(Object.isFrozen(admission.retry)).toBe(true);
    expect(Object.isFrozen(admission.retention)).toBe(true);
  });

  it('parses static metadata and preserves only the opaque input reference before awaiting the lookup', async () => {
    const { clock, store, scope } = await fixture();
    const found = deferred<null>();
    const findAdmission = vi.fn<typeof store.findAdmission>(() => found.promise);
    const insert = vi.fn(store.insert);
    const noSerialization = vi.fn(() => {
      throw new Error(SECRET);
    });
    const input = { label: SECRET, toJSON: noSerialization };
    const parseInput = vi.fn((raw: unknown) => raw as typeof input);
    const registry = createEmailTemplateRegistry(
      {
        local: { ...local, parseInput, prepare: (raw: typeof input) => ({ to: [TO], values: { title: raw.label } }) },
      },
      { clock },
    );
    const service = createEmailService({ scope, store: { ...store, findAdmission, insert }, registry });
    const supplied = {
      ...command,
      key: { ...command.key, idempotencyKey: String(command.key.idempotencyKey) },
      provider: { ...command.provider, key: String(command.provider.key) },
      scheduleAt: NOW + 1_000,
      intent: { nested: { stable: 'declared' } },
      input,
    };
    const pending = service.enqueue(supplied);
    supplied.key.idempotencyKey = 'changed-after-call';
    supplied.provider.key = 'wrong-provider';
    supplied.scheduleAt = NOW + 20_000;
    supplied.intent.nested.stable = 'different-intent';
    Object.assign(supplied, { templateKey: 'wrong', input: { label: 'not the original' } });
    found.resolve(null);
    const first = await pending;
    expect(findAdmission.mock.calls[0]?.slice(0, 2)).toEqual([SCOPE, command.key]);
    expect(parseInput.mock.calls[0]?.[0]).toBe(input);
    expect(noSerialization).not.toHaveBeenCalled();
    expect(first.job).toMatchObject({ key: command.key, provider: SMTP, scheduleAt: NOW + 1_000 });
    expect(JSON.stringify(first)).not.toMatch(/private|@|declared|fingerprint|snapshotHash/);
    expect(Object.keys(insert.mock.calls[0]![1].command).sort()).toEqual([
      'fingerprint',
      'intentHash',
      'key',
      'scheduleAt',
      'scope',
      'snapshot',
      'snapshotHash',
      'version',
    ]);
    const replay = await createEmailService({ scope, store, registry }).enqueue({
      ...command,
      intent: { nested: { stable: 'declared' } },
      scheduleAt: NOW + 1_000,
      input,
    });
    expect(replay).toEqual({ status: 'replayed', job: first.job });
    expect(parseInput).toHaveBeenCalledOnce();
  });

  it('does not rerender committed replay or conflict, including accepted, expired, payload-pruned and retiring jobs', async () => {
    const { clock, store, scope } = await fixture();
    const load = vi.fn(() => '<p>{{title}}</p>');
    const parse = vi.fn(local.parseInput);
    const prepare = vi.fn(local.prepare);
    const registry = createEmailTemplateRegistry(
      {
        local: { ...local, parseInput: parse, prepare, html: { kind: 'async', load } },
      },
      { clock },
    );
    const retention = { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY };
    const service = createEmailService({ scope, store, registry, retention });
    const first = await service.enqueue(command);
    expect(first.job).toMatchObject({ state: 'queued', nextAt: NOW, attemptCount: 0 });
    const claimed = await claim(store, scope);
    expect(claimed.snapshot).toMatchObject({ html: '<p>&lt;a&gt;&amp;&quot;</p>' });
    expect(await store.markHandoff(scope, claimed.fence, 60_000, CALL)).not.toBeNull();
    await finishClaim(
      store,
      scope,
      finishData(claimed, {
        ...accepted(claimed.fence.attemptId),
        recipients: [{ group: 'to', index: 0, status: 'accepted' }],
      }),
    );
    registry.invalidate();
    await expect(service.enqueue({ ...command, input: '' })).resolves.toMatchObject({
      status: 'replayed',
      job: { jobId: first.job.jobId, state: 'terminal', disposition: 'accepted' },
    });
    const permit = applied(await store.reserveProjection(scope, CALL));
    expect(await store.putActivity(scope, permit, CALL)).toBe('present');
    expect(await store.ackProjection(scope, permit, CALL)).toBe('acknowledged');
    expect(applied(await store.cleanupNext(scope, CALL))).toBe('payload_pruned');
    clock.wall = first.job.expiresAt;
    expect(applied(await store.cleanupNext(scope, CALL))).toBe('retirement_started');
    const rolled = createEmailService({ scope, store, registry: createEmailTemplateRegistry({}) });
    const replay = await rolled.enqueue(command as never);
    expect(replay).toMatchObject({
      status: 'replayed',
      job: {
        jobId: first.job.jobId,
        state: 'terminal',
        disposition: 'accepted',
        expiresAt: first.job.expiresAt,
        latestAttempt: { attemptId: claimed.fence.attemptId, outcome: 'accepted' },
        template: { revision: local.revision },
      },
    });
    expect(Object.isFrozen(replay.job.latestAttempt)).toBe(true);
    await expect(rolled.enqueue({ ...command, intent: { changed: true } } as never)).rejects.toMatchObject(
      rejected('idempotency_conflict'),
    );
    for (const call of [prepare, parse, load]) expect(call).toHaveBeenCalledOnce();
    expect(applied(await store.cleanupNext(scope, CALL))).toBe('purged');
    const afterGuard = await service.enqueue(command);
    expect(afterGuard.status).toBe('enqueued');
    expect(afterGuard.job.jobId).not.toBe(first.job.jobId);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])(
    'concurrent misses can both prepare but only one inserts (matching intent: %s)',
    async (matching) => {
      const { clock, store, scope } = await fixture();
      const bothPreparing = deferred<void>();
      const gates = [deferred<PreparedFields<{ title: string }>>(), deferred<PreparedFields<{ title: string }>>()];
      let prepared = 0;
      const prepare = vi.fn(() => {
        const gate = gates[prepared++]!;
        if (prepared === gates.length) bothPreparing.resolve();
        return gate.promise;
      });
      const registry = createEmailTemplateRegistry({ local: { ...local, prepare } }, { clock });
      const insert = vi.fn(store.insert);
      const findAdmission = vi.fn(store.findAdmission);
      const port = { ...store, insert, findAdmission };
      const second = { ...command, input: 'second', intent: { ...command.intent, id: matching ? '1' : '2' } };
      const winner = createEmailService({ scope, store: port, registry }).enqueue(command);
      const loser = createEmailService({ scope, store: port, registry }).enqueue(second);
      const losingResult = matching
        ? expect(loser).resolves.toMatchObject({ status: 'replayed' })
        : expect(loser).rejects.toMatchObject(rejected('idempotency_conflict'));
      await bothPreparing.promise;
      gates[0]!.resolve({ to: [TO], values: { title: 'first' } });
      const first = await winner;
      gates[1]!.resolve({ to: [TO], values: { title: 'second' } });
      await losingResult;
      expect(first.status).toBe('enqueued');
      if (matching) expect(await loser).toEqual({ status: 'replayed', job: first.job });
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(insert).toHaveBeenCalledTimes(2);
      expect(findAdmission.mock.calls.map(([actualScope, key]) => [actualScope, key])).toEqual([
        [scope, command.key],
        [scope, command.key],
        [scope, command.key],
      ]);
      expect((await claim(store, scope)).snapshot).toMatchObject({ subject: ' Hello first ' });
      expect(await store.findJob(scope, insert.mock.calls[1]![1].jobId, CALL)).toBeNull();
    },
  );

  it('scopes tagged keys without conflating a SendGrid profile ref with provider execution', async () => {
    const { scope, store, registry } = await fixture();
    const localService = createEmailService({ scope, store, registry });
    const other = createEmailService({ scope: OTHER_SCOPE, store, registry });
    const batchKey = { kind: 'batch', batchId: 'batch-1', itemId: command.key.idempotencyKey } as const;
    const sameInput = { ...remoteCommand, key: batchKey };
    const results = [
      await localService.enqueue(remoteCommand),
      await other.enqueue(sameInput),
      await localService.enqueue(sameInput),
      await localService.enqueue({ ...sameInput, key: { ...batchKey, batchId: 'batch-2' } }),
    ];
    expect(results.map(({ status }) => status)).toEqual(Array(4).fill('enqueued'));
    expect(new Set(results.map(({ job }) => job.jobId)).size).toBe(4);
    expect((await localService.enqueue(sameInput)).job).toEqual(results[2]!.job);
    expect(results[2]!.job).toMatchObject({ provider: remoteCommand.provider, key: batchKey, scope });
    expect(results[1]!.job.scope).toBe(OTHER_SCOPE);
  });
});

describe('staged and injected DTO boundaries', () => {
  it('copies an outbox value before lookup and relays its exact snapshot without any registry call', async () => {
    const { clock, registry, scope, store } = await fixture();
    const stage = await registry.prepare(scope, { ...remoteCommand, scheduleAt: NOW + 10 });
    const release = deferred<null>();
    const prepare = vi.fn(registry.prepare);
    const insert = vi.fn(store.insert);
    const service = createEmailService({
      scope,
      store: { ...store, insert, findAdmission: vi.fn(store.findAdmission).mockReturnValueOnce(release.promise) },
      registry: { ...registry, prepare },
    });
    const mutable = structuredClone(stage);
    const pending = service.enqueuePrepared(mutable);
    Object.assign(mutable, { fingerprint: 'changed', scope: OTHER_SCOPE, scheduleAt: NOW + DAY });
    Object.assign(mutable.snapshot.envelope.to[0]!, { address: 'changed@example.invalid' });
    clock.wall = NOW + 100;
    release.resolve(null);
    const enqueued = await pending;
    expect(enqueued.job).toMatchObject({
      expiresAt: stage.snapshot.expiresAt,
      scheduleAt: NOW + 10,
      nextAt: NOW + 100,
    });
    const relayed = insert.mock.calls[0]![1].command;
    expect(relayed).toEqual(stage);
    expect(relayed).not.toBe(mutable);
    expect(Object.isFrozen(relayed.snapshot.envelope.to[0])).toBe(true);
    clock.wall = stage.snapshot.expiresAt;
    const changedSnapshot = await registry.prepare(scope, {
      ...remoteCommand,
      input: 'other rendering',
      scheduleAt: NOW + 10,
    });
    expect(changedSnapshot.snapshotHash).not.toBe(stage.snapshotHash);
    await expect(service.enqueuePrepared(changedSnapshot)).resolves.toEqual({ status: 'replayed', job: enqueued.job });
    await expect(service.enqueuePrepared(stage)).resolves.toEqual({ status: 'replayed', job: enqueued.job });
    expect(prepare).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledOnce();
  });

  it('validates staged hashes, version, scope and schedule before any read, and defers freshness to store time', async () => {
    const { clock, registry, scope, store } = await fixture();
    const staged = await registry.prepare(scope, command);
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi.fn(store.insert);
    const service = createEmailService({
      scope,
      store: { ...store, findAdmission, insert },
      registry: createEmailTemplateRegistry({}),
    });
    for (const value of [
      { ...staged, version: 2 },
      { ...staged, scope: OTHER_SCOPE },
      { ...staged, scheduleAt: staged.snapshot.expiresAt },
      { ...staged, intentHash: '1'.repeat(64) },
      { ...staged, fingerprint: '2'.repeat(64) },
      { ...staged, snapshotHash: '3'.repeat(64) },
      { ...staged, snapshot: { ...staged.snapshot, rawInput: SECRET } },
    ]) {
      await expect(service.enqueuePrepared(value as PreparedEmailCommand)).rejects.toMatchObject(
        rejected('invalid_snapshot'),
      );
    }
    expect(findAdmission).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    clock.wall = staged.snapshot.expiresAt;
    await expect(service.enqueuePrepared(staged)).rejects.toMatchObject(rejected('expired'));
    expect(await store.findAdmission(scope, staged.key, CALL)).toBeNull();
    expect(findAdmission).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();

    const stagingClock = new ManualClock();
    stagingClock.wall = clock.wall + 60_001;
    const fastRegistry = createEmailTemplateRegistry(definitions, { clock: stagingClock });
    await expect(service.enqueuePrepared(await fastRegistry.prepare(scope, command))).rejects.toMatchObject(
      rejected('invalid_snapshot'),
    );
    stagingClock.wall--;
    await expect(service.enqueuePrepared(await fastRegistry.prepare(scope, command))).resolves.toMatchObject({
      status: 'enqueued',
    });
  });

  it('rejects partial, invalid or self-consistent-but-different injected preparation results without inserting', async () => {
    const { clock, registry, store, scope } = await fixture();
    const input = { ...command, scheduleAt: NOW + 10 };
    const stage = await registry.prepare(scope, input);
    const withAnotherTemplate = createEmailTemplateRegistry({ alternate: local }, { clock });
    const poison = vi.fn(() => {
      throw new Error(SECRET);
    });
    const badOutputs: unknown[] = [
      undefined,
      { version: 1, snapshot: stage.snapshot },
      {
        ...stage,
        get snapshot() {
          return poison();
        },
      },
      { ...stage, snapshot: { ...stage.snapshot, expiresAt: NOW + DAY - 1 } },
      await registry.prepare(OTHER_SCOPE, input),
      await registry.prepare(scope, { ...input, intent: { hidden: SECRET } }),
      await registry.prepare(scope, {
        ...input,
        key: { kind: 'batch', batchId: 'b1', itemId: input.key.idempotencyKey },
      }),
      await registry.prepare(scope, { ...input, scheduleAt: NOW + 11 }),
      await registry.prepare(scope, { ...input, provider: { ...input.provider, key: 'other-profile' } }),
      await withAnotherTemplate.prepare(scope, { ...input, templateKey: 'alternate' }),
      await registry.prepare(scope, { ...remoteCommand, scheduleAt: input.scheduleAt }),
    ];
    const prepare = vi.fn<Registry['prepare']>();
    const insert = vi.fn(store.insert);
    const service = createEmailService({ scope, store: { ...store, insert }, registry: { ...registry, prepare } });
    for (const output of badOutputs) {
      // An injected JS port can violate the public return type.
      prepare.mockResolvedValueOnce(output as PreparedEmailCommand);
      await expect(service.enqueue(input)).rejects.toMatchObject(rejected('invalid_snapshot'));
    }
    expect(poison).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    const sendgridWithDifferentMode = await registry.prepare(scope, {
      ...remoteCommand,
      provider: { ...remoteCommand.provider, mode: 'live' },
    });
    prepare.mockResolvedValueOnce(sendgridWithDifferentMode);
    await expect(service.enqueue(remoteCommand)).rejects.toMatchObject(rejected('invalid_snapshot'));
    expect(insert).not.toHaveBeenCalled();
  });

  it('captures a detached checked preparation and result in the first fulfillment observer', async () => {
    const { registry, store, scope } = await fixture();
    const staged = structuredClone(await registry.prepare(scope, command));
    const prepared = deferred<PreparedEmailCommand>();
    const preparing = deferred<void>();
    const write = deferred<Awaited<ReturnType<EmailStore['insert']>>>();
    const sentToStore = deferred<Parameters<EmailStore['insert']>>();
    const insert = vi.fn<EmailStore['insert']>((...args) => {
      sentToStore.resolve(args);
      return write.promise;
    });
    const prepare: Registry['prepare'] = () => {
      preparing.resolve();
      return prepared.promise;
    };
    const service = createEmailService({ scope, store: { ...store, insert }, registry: { ...registry, prepare } });
    const pending = service.enqueue(command);
    await preparing.promise;
    prepared.resolve(staged);
    queueMicrotask(() =>
      Object.assign(staged.snapshot.envelope.to[0]!, { address: 'not-the-snapshot@example.invalid' }),
    );
    const args = await sentToStore.promise;
    expect(args[1].command.snapshot.envelope.to).toEqual([TO]);
    const ack = structuredClone(await store.insert(...args));
    if (ack.status !== 'inserted') throw new Error('Expected fresh store identity');
    write.resolve(ack);
    queueMicrotask(() => Object.assign(ack.job.key, { idempotencyKey: 'mutated-after-ack' }));
    const result = await pending;
    expect(result).toMatchObject({ status: 'enqueued', job: { key: command.key } });
    expect(result.job).not.toBe(ack.job);
    expect(result.job.key).not.toBe(ack.job.key);
    for (const value of [
      result,
      result.job,
      result.job.key,
      result.job.provider,
      result.job.template,
      result.job.correlation,
      result.job.resolutions,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it('rejects unproven reads and redacts structural errors from store ports', async () => {
    const { registry, store, scope } = await fixture();
    await createEmailService({ scope, store, registry }).enqueue(command);
    const match = (await store.findAdmission(scope, command.key, CALL))!;
    const poison = vi.fn(() => {
      throw new Error(SECRET);
    });
    const findAdmission = vi.fn<EmailStore['findAdmission']>();
    const insert = vi.fn(store.insert);
    const prepare = vi.fn(registry.prepare);
    const service = createEmailService({
      scope,
      store: { ...store, findAdmission, insert },
      registry: { ...registry, prepare },
    });
    for (const output of [
      undefined,
      { ...match, fingerprint: 'not-a-hash' },
      { ...match, job: { ...match.job, scope: OTHER_SCOPE } },
      { ...match, job: { ...match.job, key: { ...command.key, idempotencyKey: 'different' } } },
      { ...match, job: { ...match.job, provider: { ...SMTP, key: 'not-the-fingerprint-profile' } } },
      { ...match, job: { ...match.job, body: SECRET } },
      {
        ...match,
        get job() {
          return poison();
        },
      },
    ]) {
      findAdmission.mockResolvedValueOnce(output as Awaited<ReturnType<EmailStore['findAdmission']>>);
      await expect(service.enqueue(command)).rejects.toMatchObject(rejected('store_incompatible'));
    }
    for (const error of [
      new Error(SECRET),
      { code: SECRET },
      {
        get code() {
          return poison();
        },
      },
    ]) {
      findAdmission.mockRejectedValueOnce(error);
      const pending = service.enqueue(command);
      await expect(pending).rejects.toMatchObject({
        ...rejected('store_unavailable'),
        message: 'Email store is unavailable.',
      });
      await expect(pending).rejects.not.toHaveProperty('cause');
    }
    expect(poison).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('preserves only stage-appropriate error codes across class boundaries and never forwards their messages', async () => {
    const { registry, store, scope } = await fixture();
    class OtherBuildError extends Error {
      constructor(readonly code: string) {
        super(SECRET, { cause: SECRET });
      }
    }
    const prepare = vi.fn<Registry['prepare']>();
    const insert = vi.fn(store.insert);
    const service = createEmailService({ scope, store: { ...store, insert }, registry: { ...registry, prepare } });
    const poison = vi.fn(() => {
      throw new Error(SECRET);
    });
    for (const [error, code] of [
      [new OtherBuildError('invalid_input'), 'invalid_input'],
      [new OtherBuildError('template_source'), 'template_source'],
      [new OtherBuildError('store_capacity'), 'preparation_failed'],
      [
        {
          get code() {
            return poison();
          },
        },
        'preparation_failed',
      ],
      [new Proxy(new OtherBuildError('invalid_input'), { getOwnPropertyDescriptor: poison }), 'preparation_failed'],
    ] as const) {
      prepare.mockRejectedValueOnce(error);
      const pending = service.enqueue(command);
      await expect(pending).rejects.toMatchObject(rejected(code));
      await pending.catch((reason: Error) => {
        expect(reason).not.toBe(error);
        expect(reason.message).not.toContain(SECRET);
        expect(reason).not.toHaveProperty('cause');
      });
    }
    expect(poison).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    const beforeInsert = createEmailService({
      scope,
      registry,
      store: {
        ...store,
        insert: () => {
          throw new OtherBuildError('store_capacity');
        },
      },
    });
    await expect(beforeInsert.enqueue(command)).rejects.toMatchObject({
      ...rejected('store_capacity'),
      message: 'Email store is at capacity.',
    });
    expect(await store.findAdmission(scope, command.key, CALL)).toBeNull();
  });
});
