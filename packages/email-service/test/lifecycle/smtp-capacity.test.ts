import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  createEmailAdmin,
  createEmailBatchService,
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  createMemoryEmailStore,
  createSmtpAcceptanceResult,
  defineSendGridTemplate,
  type EmailProvider,
  type SmtpSnapshot,
} from '../../src';
import { assertEvidenceContext, readProviderResult, recipientCounts } from '../../src/internal/attempt-codecs';
import { systemEmailClock } from '../../src/internal/budget';
import { canonicalJson, sha256 } from '../../src/internal/canonical-json';
import { readCapacityOption } from '../../src/internal/smtp-capacity';
import { createSmtpProvider } from '../../src/smtp';
import {
  capacity,
  capacityCommand,
  capacityItem,
  capacityTemplate,
  COUNTS,
  driveCapacityLedger,
  expectOperationFence,
  expectRedacted,
  fillCapacityPage,
  laneCall,
  partialEvidence,
  PRIVATE_BODY,
  refusalEvidence,
  SNAPSHOT_BYTES,
  stageMaximum,
} from '../conformance/smtp-capacity-fixture';
import { A, B, CALL, claimData, DAY, GRID, SMTP } from '../conformance/store-fixtures';

const config = expect.objectContaining({ code: 'invalid_config' });

it('isolates explicit trusted bindings, 50/51 recipient policies, scope, and batch commands', async () => {
  const supplied = capacity(51);
  const high = capacity();
  const low = capacity(51, supplied.namespace);
  const registry = capacityTemplate(supplied).registry;
  const store = createMemoryEmailStore({ smtpCapacity: supplied });
  const v1Store = createMemoryEmailStore();
  const v1Registry = capacityTemplate().registry;
  // Changing the original tuple after configuration does not widen or move either port.
  Object.assign(supplied, { maxRecipients: 1_000, namespace: high.namespace });
  expect(store.smtpCapacity).toEqual(low);
  expect(registry.smtpCapacity).toEqual(low);
  expect(Object.isFrozen(store.smtpCapacity)).toBe(true);
  expect(store.smtpCapacity).not.toBe(supplied);

  const service = createEmailService({ scope: A, smtpCapacity: low, registry, store });
  const v1Service = createEmailService({ scope: A, registry: v1Registry, store: v1Store });
  const lowProvider = createSmtpProvider({ ...SMTP_OPTIONS, smtpCapacity: low });
  const worker = createEmailWorker({ scope: A, smtpCapacity: low, store, providers: [lowProvider] });
  const foreignWorker = createEmailWorker({ scope: B, smtpCapacity: low, store, providers: [lowProvider] });
  expect(() => createEmailBatchService({ service, worker })).toThrow(config);
  expect(() => createEmailBatchService({ smtpCapacity: low, service, worker: foreignWorker })).toThrow(config);
  expect(() => createEmailBatchService({ smtpCapacity: low, service: v1Service, worker })).toThrow(config);
  expect(() => createEmailBatchService({ smtpCapacity: high, service, worker })).toThrow(config);
  expect(() => createEmailService({ scope: A, registry, store })).toThrow(config);
  expect(() => createEmailService({ scope: A, smtpCapacity: low, registry, store: v1Store })).toThrow(config);
  expect(() => createEmailService({ scope: A, smtpCapacity: low, registry: v1Registry, store })).toThrow(config);
  expect(() => createEmailAdmin({ scope: A, smtpCapacity: high, store })).toThrow(config);
  expect(() => createEmailWorker({ scope: A, smtpCapacity: low, store, providers: [] })).toThrow(config);
  expect(() =>
    createEmailWorker({
      scope: A,
      smtpCapacity: low,
      store,
      providers: [createSmtpProvider(SMTP_OPTIONS)],
    }),
  ).toThrow(config);

  await Promise.all([store.ready(), v1Store.ready()]);
  const fifty = capacityCommand('equal-key', 50);
  const legacy = await v1Service.enqueue(fifty);
  const opted = await service.enqueue(fifty);
  expect(legacy.job.jobId).not.toBe(opted.job.jobId);
  expect(legacy.job).not.toHaveProperty('smtpCapacity');
  expect(opted.job.smtpCapacity).toEqual(low);
  await expect(v1Service.enqueue(capacityCommand('v1-over', 51))).rejects.toMatchObject({ code: 'invalid_snapshot' });
  const fiftyOne = capacityCommand('v2-limit', 51);
  const prepared = await registry.prepare(A, fiftyOne);
  expect(prepared).toMatchObject({ smtpCapacity: low, snapshot: { smtpCapacity: low } });
  const { job } = await service.enqueuePrepared(prepared);
  expect((await service.enqueue(fiftyOne)).job.jobId).toBe(job.jobId);
  await expect(service.enqueue({ ...fiftyOne, intent: { input: 52 } })).rejects.toMatchObject({
    code: 'idempotency_conflict',
  });
  await expect(service.enqueue(capacityCommand('over-low', 52))).rejects.toMatchObject({ code: 'invalid_snapshot' });
  await expect(service.enqueue({ ...fifty, provider: GRID } as never)).rejects.toMatchObject({
    code: 'provider_mismatch',
  });
  await expect(v1Service.enqueuePrepared(prepared)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  const untagged = await v1Registry.prepare(A, fifty);
  await expect(service.enqueuePrepared(untagged)).rejects.toMatchObject({ code: 'invalid_snapshot' });

  const foreign = createEmailService({ scope: B, smtpCapacity: low, registry, store });
  await expect(foreign.enqueuePrepared(prepared)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  expect((await foreign.enqueue(fiftyOne)).job.jobId).not.toBe(job.jobId);
  expect(await store.findJob(B, job.jobId, laneCall(low))).toBeNull();
  const highRegistry = capacityTemplate(high).registry;
  const other = createMemoryEmailStore({ smtpCapacity: high });
  await other.ready();
  const big = createEmailService({ scope: A, smtpCapacity: high, registry: highRegistry, store: other });
  await expect(big.enqueuePrepared(prepared)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  expect((await big.enqueue(fiftyOne)).job.jobId).not.toBe(job.jobId);
  const wrongCap = { ...low, maxRecipients: 1_000 };
  await expect(service.enqueuePrepared({ ...prepared, smtpCapacity: wrongCap })).rejects.toMatchObject({
    code: 'invalid_snapshot',
  });
  await expect(
    service.enqueuePrepared({ ...prepared, snapshot: { ...prepared.snapshot, smtpCapacity: wrongCap } } as never),
  ).rejects.toMatchObject({ code: 'invalid_snapshot' });

  const batch = createEmailBatchService({ smtpCapacity: low, service, worker });
  const params = {
    batchId: 'bounded-batch',
    items: [
      { itemId: 'small', command: capacityItem(51) },
      { itemId: 'large', command: capacityItem(52) },
    ],
  } as const;
  expect(await batch.enqueueBatch(params)).toMatchObject({
    items: [
      { status: 'enqueued', job: { smtpCapacity: low } },
      { status: 'failed', code: 'invalid_snapshot' },
    ],
  });
  expect(await batch.enqueueBatch(params)).toMatchObject({ counts: { replayed: 1, failed: 1 } });
  const duplicate = { batchId: 'bad', items: [params.items[0], params.items[0]] };
  await expect(batch.enqueueBatch(duplicate)).rejects.toMatchObject({ code: 'invalid_command' });
  await expect(batch.run({ limit: 17 })).rejects.toMatchObject({ code: 'invalid_config' });
  await Promise.all([worker.shutdown(), foreignWorker.shutdown()]); // No provider submit on this test.
});

const SMTP_OPTIONS = { key: SMTP.key, host: 'relay.example.invalid', tls: 'implicit' } as const;

it('rejects malformed configuration without evaluating accessors and fences all memory primitives before the clock', async () => {
  const smtpCapacity = capacity(1_000, 'deadbeef-0000-4000-8000-000000000001');
  const get = vi.fn(() => smtpCapacity.format);
  for (const invalid of [
    undefined,
    null,
    { ...smtpCapacity, format: 'smtp-v1' },
    { ...smtpCapacity, namespace: smtpCapacity.namespace.toUpperCase() },
    { ...smtpCapacity, namespace: '00000000-0000-1000-8000-000000000000' },
    { ...smtpCapacity, maxRecipients: 50 },
    { ...smtpCapacity, maxRecipients: 1_001 },
    { ...smtpCapacity, maxRecipients: 51.5 },
    { ...smtpCapacity, unexpected: true },
    Object.defineProperty({ ...smtpCapacity }, 'format', { get }),
    new Proxy(smtpCapacity, {}),
  ]) {
    expect(() => createMemoryEmailStore({ smtpCapacity: invalid } as never)).toThrow(config);
    expect(() => createSmtpProvider({ ...SMTP_OPTIONS, smtpCapacity: invalid } as never)).toThrow(config);
  }
  expect(get).not.toHaveBeenCalled();
  expect(() => createMemoryEmailStore({ smtpCapacity, maxJobs: 17 })).toThrow(config);
  expect(() => createEmailTemplateRegistry({}, { smtpCapacity, maxPending: 5 })).toThrow(config);
  expect(() => createEmailTemplateRegistry({}, { smtpCapacity, cacheEntries: 17 })).toThrow(config);
  const remote = defineSendGridTemplate({
    kind: 'sendgrid',
    revision: 'fixture',
    templateId: `d-${'0'.repeat(32)}`,
    parseInput: () => ({}),
    parseData: () => ({}),
    prepare: () => ({ from: { address: 'from@example.invalid' }, values: {} }),
  });
  expect(() => createEmailTemplateRegistry({ remote }, { smtpCapacity })).toThrow(config);

  const clock = { ...systemEmailClock, now: vi.fn(Date.now), monotonicNow: vi.fn(systemEmailClock.monotonicNow) };
  const store = createMemoryEmailStore({ smtpCapacity, clock });
  await expect(store.findJob(A, randomUUID(), laneCall(smtpCapacity))).rejects.toMatchObject({
    code: 'store_unavailable',
  });
  for (const invalid of [CALL, laneCall(capacity()), laneCall(capacity(51, smtpCapacity.namespace))]) {
    await expectOperationFence(store, invalid);
  }
  expect(clock.now).not.toHaveBeenCalled();
  expect(clock.monotonicNow).not.toHaveBeenCalled();
  await store.ready();
  const provider = createSmtpProvider({ ...SMTP_OPTIONS, smtpCapacity });
  expect(() =>
    createEmailWorker({ smtpCapacity, scope: A, store, providers: [provider], limits: { maxConcurrency: 3 } }),
  ).toThrow(config);
  const admin = createEmailAdmin({ smtpCapacity, scope: A, store });
  await expect(admin.reconcile({ limit: 17 })).rejects.toMatchObject({ code: 'invalid_config' });
});

it('rejects count+1, byte+1, tagged-context/hash and provider mismatches without reaching the store or wire', async () => {
  const smtpCapacity = capacity();
  const fixed = 1_800_000_000_000;
  const maximum = await stageMaximum(smtpCapacity, fixed);
  const { registry, command, staged } = maximum;
  await expect(registry.prepare(A, capacityCommand('over-count', 1_001))).rejects.toMatchObject({
    code: 'invalid_snapshot',
  });
  const html = staged.snapshot.html!;
  const biggerHtml = `${PRIVATE_BODY}\\${html.slice(PRIVATE_BODY.length + 1)}`;
  maximum.setHtml(biggerHtml);
  await expect(registry.prepare(A, command)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  const snapshot = { ...staged.snapshot, html: biggerHtml };
  const context = readCapacityOption({ smtpCapacity })!;
  // Produce the true hash of the otherwise valid oversized DTO, bypassing the production size ceiling in the fixture.
  const oversized = {
    ...staged,
    snapshot,
    snapshotHash: sha256(
      canonicalJson(snapshot, SNAPSHOT_BYTES + 1, 'invalid_snapshot', context.limits.snapshotTree).encoded,
    ),
  };
  expect(Buffer.byteLength(JSON.stringify(snapshot))).toBe(SNAPSHOT_BYTES + 1);
  const store = createMemoryEmailStore({ smtpCapacity });
  await store.ready();
  const find = vi.fn(store.findAdmission);
  const insert = vi.fn(store.insert);
  const service = createEmailService({
    smtpCapacity,
    scope: A,
    registry,
    store: { ...store, findAdmission: find, insert },
  });
  for (const invalid of [
    oversized,
    { ...staged, snapshotHash: '0'.repeat(64) },
    { ...staged, fingerprint: '0'.repeat(64) },
    { ...staged, smtpCapacity: capacity() },
  ]) {
    await expect(service.enqueuePrepared(invalid)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  }
  expect(find).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
  await expect(service.enqueue(command)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  expect(insert).not.toHaveBeenCalled();

  const provider = createSmtpProvider({ ...SMTP_OPTIONS, smtpCapacity });
  const input = {
    snapshot: staged.snapshot,
    attachments: maximum.resolved,
    attemptId: randomUUID(),
    jobId: randomUUID(),
  };
  expect(provider.prepare(input).submit).toEqual(expect.any(Function));
  const v1 = createSmtpProvider(SMTP_OPTIONS);
  for (const invalid of [
    { ...input, snapshot },
    { ...input, attachments: input.attachments.slice(1) },
    { ...input, snapshot: { ...input.snapshot, smtpCapacity: capacity() } },
  ]) {
    expect(() => provider.prepare(invalid)).toThrow(expect.objectContaining({ code: 'invalid_snapshot' }));
  }
  expect(() => v1.prepare(input)).toThrow(expect.objectContaining({ code: 'invalid_snapshot' }));
  expect(() =>
    provider.prepare({ ...input, snapshot: { ...input.snapshot, provider: { ...SMTP, key: 'other' } } }),
  ).toThrow(expect.objectContaining({ code: 'provider_mismatch' }));
});

it('rejects unordered, incomplete, foreign-group and over-cap evidence; invalid provider evidence cannot authorize retry', async () => {
  const smtpCapacity = capacity();
  const { registry } = capacityTemplate(smtpCapacity);
  const staged = await registry.prepare(A, capacityCommand());
  const { envelope } = staged.snapshot;
  const attemptId = randomUUID();
  const complete = partialEvidence(attemptId);
  const context = readCapacityOption({ smtpCapacity })!;
  const recipients = complete.recipients;
  const first = recipients[0];
  const second = recipients[1]!;
  const badEvidence = [
    [...recipients, first],
    [second, first, ...recipients.slice(2)],
    [first, first, ...recipients.slice(2)],
    recipients.slice(1),
    [
      ...recipients.slice(0, 334),
      { group: 'to' as const, index: 334, status: 'rejected' as const },
      ...recipients.slice(335),
    ],
  ];
  expect(readProviderResult(complete, SMTP, attemptId, envelope, context)).toEqual(complete);
  for (const invalid of badEvidence) {
    expect(() => readProviderResult({ ...complete, recipients: invalid }, SMTP, attemptId, envelope, context)).toThrow(
      expect.objectContaining({ code: 'invalid_command' }),
    );
  }
  const refused = refusalEvidence();
  expect(readProviderResult(refused, SMTP, attemptId, envelope, context)).toEqual(refused);
  const negativeData = { ...refused, stage: 'data', recipients: refused.recipients.slice(1, 3) } as const;
  expect(readProviderResult(negativeData, SMTP, attemptId, envelope, context)).toEqual(negativeData);
  expect(() =>
    assertEvidenceContext(refused, SMTP, attemptId, { ...recipientCounts(envelope), bcc: 332 }, 'store_incompatible'),
  ).toThrow(expect.objectContaining({ code: 'store_incompatible' }));
  const onlyBcc = { ...envelope, to: [], cc: [], bcc: [...envelope.to, ...envelope.cc, ...envelope.bcc] };
  const accepted = createSmtpAcceptanceResult(
    onlyBcc.bcc.map((_, index) => ({ group: 'bcc', index, status: 'accepted' })),
    complete.messageId,
  );
  expect(readProviderResult(accepted, SMTP, attemptId, onlyBcc, context).recipients?.at(-1)).toEqual({
    group: 'bcc',
    index: 999,
    status: 'accepted',
  });

  const store = createMemoryEmailStore({ smtpCapacity });
  await store.ready();
  const service = createEmailService({ smtpCapacity, scope: A, registry, store });
  const queued = await service.enqueuePrepared(staged);
  const submit = vi.fn(async () => ({ ...refused, recipients: refused.recipients.slice(0, -1) }));
  const provider: EmailProvider<SmtpSnapshot> = { ref: SMTP, smtpCapacity, prepare: () => ({ submit }) };
  const worker = createEmailWorker({ smtpCapacity, scope: A, store, providers: [provider] });
  try {
    expect((await worker.run({ limit: 1 })).items).toMatchObject([
      { jobId: queued.job.jobId, status: 'unknown', reason: 'transport_uncertain', providerInvoked: true },
    ]);
    expect(await worker.run()).toMatchObject({ stop: 'idle', counts: { providerCalls: 0 } });
    expect(submit).toHaveBeenCalledTimes(1);
  } finally {
    await worker.shutdown();
  }
});

it('preserves complete attempts, history, and namespace/cap-bound redacted pages in the memory state machine', async () => {
  let now = Date.now();
  const storeClock = { ...systemEmailClock, now: () => now };
  const smtpCapacity = capacity();
  const store = createMemoryEmailStore({ smtpCapacity, clock: storeClock });
  await store.ready();
  const maximum = await stageMaximum(smtpCapacity, now);
  const ledger = await driveCapacityLedger(store, store, smtpCapacity, maximum, (time) => {
    now = time;
  });
  const { admin, commits, jobId, last } = ledger;
  await ledger.prune();
  await fillCapacityPage(store, smtpCapacity);
  const registry = capacityTemplate(smtpCapacity).registry;
  const service = createEmailService({ scope: A, smtpCapacity, store, registry });
  await expect(service.enqueue(capacityCommand('memory-capacity-overflow', 1))).rejects.toMatchObject({
    code: 'store_capacity',
  });
  const { items, nextCursor } = await admin.listActivities({ jobId });
  expect(items).toHaveLength(8);
  expect(items.find(({ attemptId }) => attemptId === last.attemptId)).toMatchObject({
    smtpCapacity,
    ordinal: 11,
    recipientCounts: COUNTS,
    result: last.result,
  });
  expectRedacted(items);
  expect(nextCursor).toEqual(expect.any(String));
  const tail = await admin.listActivities({ jobId, cursor: nextCursor! });
  expect(new Set([...items, ...tail.items].map(({ attemptId }) => attemptId))).toEqual(
    new Set(commits.map(({ attemptId }) => attemptId)),
  );
  await expect(admin.listActivities({ limit: 17 })).rejects.toMatchObject({ code: 'invalid_command' });
  const foreign = capacity();
  const otherStore = createMemoryEmailStore({ smtpCapacity: foreign });
  await otherStore.ready();
  const other = createEmailAdmin({ scope: A, smtpCapacity: foreign, store: otherStore });
  await expect(other.listActivities({ jobId, cursor: nextCursor! })).rejects.toMatchObject({ code: 'invalid_cursor' });
  const payload = JSON.parse(Buffer.from(nextCursor!, 'base64url').toString());
  payload.c[2] = 51;
  const wrongCapCursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
  await expect(admin.listActivities({ jobId, cursor: wrongCapCursor })).rejects.toMatchObject({
    code: 'invalid_cursor',
  });
  const v1 = createEmailAdmin({ scope: A, store: createMemoryEmailStore() });
  await expect(v1.listActivities({ jobId, cursor: nextCursor! })).rejects.toMatchObject({ code: 'invalid_cursor' });
  expect(await otherStore.claimNext(A, claimData(), laneCall(foreign))).toEqual({ status: 'none' });
  now += 31 * DAY;
  const firstSweep = await admin.cleanup({ limit: 16 });
  const secondSweep = await admin.cleanup({ limit: 16 });
  expect(firstSweep).toMatchObject({ stop: 'limit', persistenceFailures: 0 });
  expect(secondSweep).toMatchObject({ stop: 'idle', persistenceFailures: 0 });
  expect(firstSweep.jobsPurged + secondSweep.jobsPurged).toBe(8);
  expect(await admin.getJob(jobId)).toBeNull();
  expect(await admin.listActivities({ jobId })).toEqual({ items: [] });
});
