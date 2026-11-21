import { describe, expect, it, vi } from 'vitest';
import {
  createEmailBatchAdmission,
  createEmailRelay,
  createEmailService,
  createEmailTemplateRegistry,
  createMemoryEmailStore,
  type EmailRelayOptions,
  type PreparedEmailCommand,
  type SmtpCapacity,
} from '../../src';
import { lostAck } from '../conformance/store-fixtures';
import { batchKey, request } from './batch-fixture';
import { command, deferred, local, ManualClock, SCOPE } from './template-fixtures';

const smtpCapacity = {
  format: 'smtp-v2',
  namespace: '6d36e018-b27f-4f3d-88d1-9b10ad86aaff',
  maxRecipients: 51,
} satisfies SmtpCapacity;
const otherBinding = { ...smtpCapacity, maxRecipients: 52 };
const otherScope = 'foreign';
const config = { code: 'invalid_config' };
const snapshot = { code: 'invalid_snapshot' };

describe('admission-only factories', () => {
  it('binds a batch to a scoped enqueue port and rechecks a wrapper before admitting', async () => {
    const store = createMemoryEmailStore({ smtpCapacity });
    await store.ready();
    const registry = createEmailTemplateRegistry({ local }, { smtpCapacity });
    const core = createEmailService({ scope: SCOPE, store, registry, smtpCapacity });
    const enqueue = vi.fn(core.enqueue);
    const service = { scope: SCOPE, smtpCapacity, enqueue };
    const scopeGetter = vi.fn(() => SCOPE);
    const withWorker = { service, smtpCapacity, worker: {} };
    expect(() => createEmailBatchAdmission(withWorker)).toThrow(expect.objectContaining(config));
    expect(() => createEmailBatchAdmission({ service })).toThrow(expect.objectContaining(config));
    expect(() => createEmailBatchAdmission({ service, smtpCapacity: otherBinding })).toThrow(
      expect.objectContaining(config),
    );
    expect(() => createEmailBatchAdmission({ service: { ...service, scope: 'bad:scope' }, smtpCapacity })).toThrow(
      expect.objectContaining(config),
    );
    expect(() =>
      createEmailBatchAdmission({
        service: Object.defineProperty({ ...service }, 'scope', { get: scopeGetter }),
        smtpCapacity,
      }),
    ).toThrow(expect.objectContaining(config));
    expect(scopeGetter).not.toHaveBeenCalled();
    const batch = createEmailBatchAdmission({ service, smtpCapacity });
    expect(Object.keys(batch)).toEqual(['enqueueBatch']);
    expect(Object.isFrozen(batch)).toBe(true);

    service.scope = otherScope;
    await expect(batch.enqueueBatch(request('item'))).resolves.toMatchObject({
      items: [{ status: 'failed', code: 'invalid_config' }],
    });
    service.scope = SCOPE;
    service.smtpCapacity = otherBinding;
    await expect(batch.enqueueBatch(request('item'))).resolves.toMatchObject({
      items: [{ status: 'failed', code: 'invalid_config' }],
    });
    expect(enqueue).not.toHaveBeenCalled();

    service.smtpCapacity = smtpCapacity;
    await expect(batch.enqueueBatch(request('item'))).resolves.toMatchObject({
      items: [{ status: 'enqueued', job: { scope: SCOPE, key: batchKey('item'), smtpCapacity } }],
    });
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('keeps one in-flight batch per opted-in admission facade', async () => {
    const store = createMemoryEmailStore({ smtpCapacity });
    await store.ready();
    const gate = deferred<null>();
    const findAdmission = vi.fn(store.findAdmission).mockReturnValueOnce(gate.promise);
    const registry = createEmailTemplateRegistry({ local }, { smtpCapacity });
    const service = createEmailService({ scope: SCOPE, store: { ...store, findAdmission }, registry, smtpCapacity });
    const batch = createEmailBatchAdmission({ service, smtpCapacity });
    const first = batch.enqueueBatch(request('first'));
    try {
      await expect(batch.enqueueBatch(request('first'))).rejects.toMatchObject({ code: 'busy' });
      expect(findAdmission).toHaveBeenCalledOnce();
    } finally {
      gate.resolve(null);
      await first;
    }
    await expect(first).resolves.toMatchObject({ counts: { enqueued: 1 } });
    await expect(batch.enqueueBatch(request('first'))).resolves.toMatchObject({ counts: { replayed: 1 } });
  });

  it('checks serialized scope, binding and hashes first, then confirms and replays before store freshness', async () => {
    const clock = new ManualClock();
    const store = createMemoryEmailStore({ clock, smtpCapacity });
    await store.ready();
    const registry = createEmailTemplateRegistry({ local }, { clock, smtpCapacity });
    const otherRegistry = createEmailTemplateRegistry({ local }, { clock, smtpCapacity: otherBinding });
    const staged = await registry.prepare(SCOPE, command);
    const read = (): PreparedEmailCommand => JSON.parse(JSON.stringify(staged));
    const findAdmission = vi.fn(store.findAdmission);
    const insert = vi
      .fn(store.insert)
      .mockImplementationOnce((...args) => lostAck('after_commit', () => store.insert(...args)));
    const port = { findAdmission, insert, smtpCapacity } satisfies EmailRelayOptions['store'];
    const withRegistry = { scope: SCOPE, store: port, smtpCapacity, registry };
    expect(() => createEmailRelay(withRegistry)).toThrow(expect.objectContaining(config));
    expect(() => createEmailRelay({ scope: SCOPE, store: port })).toThrow(expect.objectContaining(config));
    expect(() => createEmailRelay({ scope: SCOPE, store: port, smtpCapacity: otherBinding })).toThrow(
      expect.objectContaining(config),
    );
    expect(() => createEmailRelay({ scope: 'bad:scope', store: port, smtpCapacity })).toThrow(
      expect.objectContaining(config),
    );
    const relay = createEmailRelay({ scope: SCOPE, store: port, smtpCapacity });
    expect(Object.keys(relay)).toEqual(['enqueuePrepared']);
    expect(Object.isFrozen(relay)).toBe(true);
    for (const value of [
      await registry.prepare(otherScope, command),
      await otherRegistry.prepare(SCOPE, command),
      { ...read(), snapshotHash: '0'.repeat(64) },
    ]) {
      await expect(relay.enqueuePrepared(value)).rejects.toMatchObject(snapshot);
    }
    expect(findAdmission).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    const missing = await registry.prepare(SCOPE, { ...command, key: { ...command.key, idempotencyKey: 'missing' } });
    const confirmed = await relay.enqueuePrepared(read());
    expect(confirmed).toMatchObject({ status: 'replayed', job: { key: staged.key, scope: SCOPE, smtpCapacity } });
    expect(findAdmission.mock.calls.map(([scope, key]) => [scope, key])).toEqual([
      [SCOPE, staged.key], // Initial exact-key miss.
      [SCOPE, staged.key], // Same-key confirmation after the insert lost its acknowledgement.
    ]);
    expect(insert.mock.calls[0]![1].command).toEqual(staged);
    expect(insert).toHaveBeenCalledOnce();

    clock.wall = staged.snapshot.expiresAt;
    await expect(relay.enqueuePrepared({ ...read(), fingerprint: '0'.repeat(64) })).rejects.toMatchObject(snapshot);
    expect(findAdmission).toHaveBeenCalledTimes(2);
    await expect(relay.enqueuePrepared(read())).resolves.toEqual(confirmed);
    const service = createEmailService({ scope: SCOPE, store, registry, smtpCapacity });
    await expect(service.enqueuePrepared(read())).resolves.toEqual(confirmed);
    expect(insert).toHaveBeenCalledOnce();
    await expect(relay.enqueuePrepared(missing)).rejects.toMatchObject({ code: 'expired' });
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
