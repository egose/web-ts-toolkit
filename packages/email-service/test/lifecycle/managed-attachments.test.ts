import { once } from 'node:events';
import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import {
  createEmailRelay,
  createEmailTemplateRegistry,
  createEmailWorker,
  createMemoryEmailStore,
  type AttachmentRef,
  type PreparedEmailCommand,
  type SmtpCapacity,
} from '../../src';
import { checkManagedAttachmentRetention } from '../../src/attachments';
import { createManagedAttachmentOperations } from '../../src/attachments/operations';
import { createManagedAttachmentStore } from '../../src/attachments/store';
import { MANAGED_BINDING, managedInput, MemoryAttachmentBacking } from '../conformance/managed-attachment-fixture';
import { CALL, SMTP } from '../conformance/store-fixtures';
import { ATTACHMENT, command, deferred, local, ManualClock, TO } from '../unit/template-fixtures';
import { smtpFixture } from '../unit/worker-fixtures';

function setup() {
  const clock = new ManualClock();
  const io = new MemoryAttachmentBacking(MANAGED_BINDING.namespace, true);
  const writer = createManagedAttachmentStore(MANAGED_BINDING, io, createManagedAttachmentOperations(clock));
  const input = managedInput(clock.now());
  const { scope } = input;
  async function prepare(
    attachments: readonly AttachmentRef[],
    expiresAt?: number,
    smtpCapacity?: SmtpCapacity,
    scheduleAt?: number,
  ) {
    const prepare = vi.fn((title: string) => ({
      to: [TO],
      values: { title },
      attachments,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    }));
    const registry = createEmailTemplateRegistry(
      { local: { ...local, prepare } },
      { clock, ...(smtpCapacity ? { smtpCapacity } : {}) },
    );
    const staged = await registry.prepare(scope, {
      ...command,
      provider: SMTP,
      ...(scheduleAt === undefined ? {} : { scheduleAt }),
    });
    return { staged, prepare };
  }
  return { clock, io, writer, input, scope, prepare };
}

const retention = expect.objectContaining({ code: 'attachment_retention' });
const badConfig = expect.objectContaining({ code: 'invalid_config' });
const badDTO = expect.objectContaining({ code: 'invalid_snapshot' });

it('checks the actual frozen expiry, preserves every staged field, and needs no proof for a project ref', async () => {
  const f = setup();
  const receipt = await f.writer.put(f.input);
  const options = { scope: f.scope, stores: [f.writer], receipts: [receipt] };
  const { staged } = await f.prepare([receipt.ref, ATTACHMENT, receipt.ref], receipt.deliverBy);
  const detached = JSON.parse(JSON.stringify(staged)) as PreparedEmailCommand;
  const checked = checkManagedAttachmentRetention(detached, options);
  expect(checked).toEqual(staged);
  expect(checked).not.toBe(detached);
  expect(Object.isFrozen(checked) && Object.isFrozen(checked.snapshot)).toBe(true);
  expect(Object.isFrozen(checked.snapshot.attachments) && Object.isFrozen(checked.snapshot.attachments[0])).toBe(true);
  Object.assign(detached.snapshot.attachments[0]!, { id: 'replacement' });
  expect(checked.snapshot.attachments[0]?.id).toBe(f.input.id);

  for (const expiresAt of [undefined, receipt.deliverBy + 1]) {
    const { staged: late } = await f.prepare([receipt.ref], expiresAt);
    expect(late.snapshot.expiresAt).toBeGreaterThan(receipt.deliverBy);
    expect(() => checkManagedAttachmentRetention(late, options)).toThrowError(retention);
  }
  expect(f.io.creates).toBe(1);
  expect(f.io.reads).toBe(1);
});

it('rejects empty, duplicate, missing, foreign, unused or non-synchronous proof without accessing storage', async () => {
  const f = setup();
  const receipt = await f.writer.put(f.input);
  const peer = createManagedAttachmentStore(MANAGED_BINDING, f.io, createManagedAttachmentOperations(f.clock));
  const foreignWriter = await peer.put(f.input);
  const foreignScope = await f.writer.put({ ...f.input, scope: 'Tenant-B' });
  expect(foreignScope.ref).toEqual(receipt.ref); // Scope is not serialized in the ordinary ref.
  const unused = await f.writer.put({ ...f.input, id: 'unused' });
  const { staged } = await f.prepare([receipt.ref], receipt.deliverBy);
  const options = { scope: f.scope, stores: [f.writer], receipts: [receipt] };
  const counts = [f.io.creates, f.io.reads];
  for (const receipts of [
    [],
    [foreignWriter],
    [foreignScope],
    [structuredClone(receipt)],
    [receipt, unused],
    Array(6).fill(receipt),
  ]) {
    expect(() => checkManagedAttachmentRetention(staged, { ...options, receipts })).toThrowError(retention);
  }
  expect(() => checkManagedAttachmentRetention(staged, { ...options, stores: [f.writer, peer] })).toThrowError(
    badConfig,
  );
  expect(() => checkManagedAttachmentRetention(staged, { ...options, stores: [] })).toThrowError(retention);
  expect(() => checkManagedAttachmentRetention(staged, { ...options, scope: 'Tenant-B' })).toThrowError(badDTO);
  const invalidStore = {
    ...f.writer,
    assertReceipt: async () => {
      throw new Error('synthetic async proof');
    },
  };
  expect(() => checkManagedAttachmentRetention(staged, { ...options, stores: [invalidStore] })).toThrowError(retention);
  const accessor = vi.fn();
  const bad = Object.defineProperty({ ...options }, 'stores', { get: accessor });
  expect(() => checkManagedAttachmentRetention(staged, bad)).toThrowError(badConfig);
  expect(accessor).not.toHaveBeenCalled();

  const untrustedBinding = { ...f.writer, resolverKey: ATTACHMENT.resolverKey, assertReceipt: vi.fn() };
  const assertNotCalled = untrustedBinding.assertReceipt;
  const mutations = [
    { id: 'wrong-id' },
    { version: 'wrong-version' },
    { byteLength: 1 },
    { sha256: '0'.repeat(64) },
    { filename: 'wrong-name.pdf' },
    { contentType: 'text/plain' },
    { resolverKey: untrustedBinding.resolverKey },
  ];
  for (const change of mutations) {
    const { staged: altered } = await f.prepare([{ ...receipt.ref, ...change }], receipt.deliverBy);
    expect(() =>
      checkManagedAttachmentRetention(altered, { ...options, stores: [f.writer, untrustedBinding] }),
    ).toThrowError(retention);
  }
  expect(assertNotCalled).not.toHaveBeenCalled();
  expect([f.io.creates, f.io.reads]).toEqual(counts);
});

it('validates the original V1 DTO hashes, scope and trusted SMTP capacity without rewriting them', async () => {
  const f = setup();
  const receipt = await f.writer.put(f.input);
  const smtpCapacity = { format: 'smtp-v2', maxRecipients: 51, namespace: MANAGED_BINDING.namespace } as const;
  const { staged } = await f.prepare([receipt.ref], receipt.deliverBy, smtpCapacity);
  const options = { scope: f.scope, stores: [f.writer], receipts: [receipt] };
  expect(checkManagedAttachmentRetention(staged, { ...options, smtpCapacity })).toEqual(staged);
  expect(() => checkManagedAttachmentRetention(staged, options)).toThrowError(badDTO);
  expect(() =>
    checkManagedAttachmentRetention(staged, { ...options, smtpCapacity: { ...smtpCapacity, maxRecipients: 50 } }),
  ).toThrowError(badConfig);
  for (const tampered of [
    { ...staged, fingerprint: '0'.repeat(64) },
    { ...staged, snapshotHash: '0'.repeat(64) },
    { ...staged, snapshot: { ...staged.snapshot, expiresAt: receipt.deliverBy + 1 } },
    { ...staged, receipt }, // No lifetime proof in a V1 DTO.
  ]) {
    expect(() => checkManagedAttachmentRetention(tampered, { ...options, smtpCapacity })).toThrowError(badDTO);
  }
});

it('relays only the frozen V1 DTO and delivers mixed refs through existing worker preflight once', async () => {
  const f = setup();
  const receipt = await f.writer.put(f.input);
  const started = f.clock.wall;
  const { staged, prepare } = await f.prepare([receipt.ref, ATTACHMENT], receipt.deliverBy, undefined, started + 1_000);
  const outbox = JSON.stringify(
    checkManagedAttachmentRetention(staged, {
      scope: f.scope,
      stores: [f.writer],
      receipts: [receipt],
    }),
  );
  const wire = JSON.parse(outbox) as PreparedEmailCommand;
  expect(wire.snapshot.attachments).toEqual([receipt.ref, ATTACHMENT]);
  expect(outbox).not.toContain('deliverBy');
  expect(outbox).not.toContain(MANAGED_BINDING.namespace);
  const queue = createMemoryEmailStore({ clock: f.clock });
  await queue.ready();
  const relay = createEmailRelay({ scope: f.scope, store: queue });
  f.clock.wall = started + 500;
  const { job } = await relay.enqueuePrepared(wire);
  expect(job.expiresAt).toBe(receipt.deliverBy);
  const smtp = smtpFixture();
  const create = vi.fn(async () => ({ status: 'incompatible' as const }));
  const reader = createManagedAttachmentStore(
    MANAGED_BINDING,
    { create, read: f.io.read.bind(f.io) },
    createManagedAttachmentOperations(f.clock),
  );
  const project = vi.fn(() => ({ status: 'found' as const, bytes: Buffer.from('abc') }));
  const worker = createEmailWorker({
    scope: f.scope,
    store: queue,
    providers: [smtp.provider],
    clock: f.clock,
    attachmentResolvers: { [reader.resolverKey]: reader.resolve, [ATTACHMENT.resolverKey]: project },
  });
  try {
    expect((await worker.run({ maintenanceLimit: 0 })).items).toEqual([]);
    f.clock.wall = started + 1_000;
    expect(await worker.run({ limit: 1, maintenanceLimit: 0 })).toMatchObject({
      items: [{ jobId: job.jobId, status: 'accepted', providerInvoked: true }],
    });
    const value = smtp.prepare.mock.calls[0]![0];
    expect(value.attachments.map(({ ref, bytes }) => [ref.filename, Buffer.from(bytes)])).toEqual([
      [receipt.ref.filename, Buffer.from(f.input.bytes)],
      [ATTACHMENT.filename, Buffer.from('abc')],
    ]);
    f.clock.wall = receipt.deliverBy + 1;
    await expect(relay.enqueuePrepared(wire)).resolves.toMatchObject({ status: 'replayed', job: { jobId: job.jobId } });
    expect((await worker.run({ maintenanceLimit: 0 })).items).toEqual([]);
    expect(await queue.findJob(f.scope, job.jobId, CALL)).not.toHaveProperty('attachments');
    expect(prepare).toHaveBeenCalledOnce();
    expect(project).toHaveBeenCalledOnce();
    expect(smtp.transmit).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect([f.io.creates, f.io.reads]).toEqual([1, 2]); // One creation, one confirmation and one resolution.
  } finally {
    await worker.shutdown();
  }
});

it.each([
  ['unavailable', 'attachment_unavailable', 'retry_scheduled'],
  ['invalid', 'attachment_resolver_error', 'failed'],
] as const)('keeps worker classification unchanged for a managed %s read', async (status, reason, disposition) => {
  const f = setup();
  const receipt = await f.writer.put(f.input);
  const { staged } = await f.prepare([receipt.ref], receipt.deliverBy);
  const queue = createMemoryEmailStore({ clock: f.clock });
  await queue.ready();
  const relay = createEmailRelay({ scope: f.scope, store: queue });
  const { job } = await relay.enqueuePrepared(
    checkManagedAttachmentRetention(staged, { scope: f.scope, stores: [f.writer], receipts: [receipt] }),
  );
  const reader = createManagedAttachmentStore(
    MANAGED_BINDING,
    {
      create: f.io.create.bind(f.io),
      async read(_key, request) {
        request.begin();
        return { status };
      },
    },
    createManagedAttachmentOperations(f.clock),
  );
  const smtp = smtpFixture();
  const worker = createEmailWorker({
    scope: f.scope,
    store: queue,
    providers: [smtp.provider],
    clock: f.clock,
    attachmentResolvers: { [reader.resolverKey]: reader.resolve },
  });
  try {
    const report = await worker.run({ limit: 1, maintenanceLimit: 0 });
    expect(report.items).toMatchObject([{ reason, status: disposition, providerInvoked: false }]);
    expect(smtp.prepare).not.toHaveBeenCalled();
    const commit = await queue.findAttempt(f.scope, job.jobId, report.items[0]!.attemptId!, CALL);
    expect(commit).toMatchObject({ disposition, result: { reason, stage: 'attachment' } });
    expect(commit).not.toHaveProperty('handedOffAt');
    expect(JSON.stringify(report)).not.toContain(receipt.ref.id);
  } finally {
    await worker.shutdown();
  }
});

it('lets the worker stage deadline stop an in-flight managed stream before handoff', async () => {
  const f = setup();
  const receipt = await f.writer.put(f.input);
  const { staged } = await f.prepare([receipt.ref], receipt.deliverBy);
  const queue = createMemoryEmailStore({ clock: f.clock });
  await queue.ready();
  const { job } = await createEmailRelay({ scope: f.scope, store: queue }).enqueuePrepared(
    checkManagedAttachmentRetention(staged, { scope: f.scope, stores: [f.writer], receipts: [receipt] }),
  );
  const pulling = deferred<void>();
  const body = new Readable({ read: () => pulling.resolve() });
  const closed = once(body, 'close');
  const reader = createManagedAttachmentStore(
    MANAGED_BINDING,
    {
      create: f.io.create.bind(f.io),
      async read(key, request) {
        const raw = await f.io.read(key, request);
        return raw.status === 'found' ? { ...raw, body: request.ownStream(body) } : raw;
      },
    },
    createManagedAttachmentOperations(f.clock),
  );
  const smtp = smtpFixture();
  const worker = createEmailWorker({
    scope: f.scope,
    store: queue,
    providers: [smtp.provider],
    clock: f.clock,
    limits: { attachmentTimeoutMs: 50 },
    attachmentResolvers: { [reader.resolverKey]: reader.resolve },
  });
  try {
    const running = worker.run({ limit: 1, maintenanceLimit: 0 });
    await pulling.promise;
    f.clock.advance(50);
    expect(await running).toMatchObject({
      items: [{ jobId: job.jobId, reason: 'attachment_timeout', status: 'retry_scheduled', providerInvoked: false }],
    });
    await closed;
    expect(body.destroyed).toBe(true);
    expect(smtp.prepare).not.toHaveBeenCalled();
  } finally {
    body.destroy();
    await worker.shutdown();
  }
});
