import { afterAll, beforeAll, expect, it } from 'vitest';
import { createEmailService, type EmailRunEntry, type EmailWorker } from '../../src';
import { capacity } from '../conformance/smtp-capacity-fixture';
import { A, B } from '../conformance/store-fixtures';
import { intercept, withFailPoint } from '../mongodb/fixture';
import { deliveryFixture, startStorage, type DeliveryFixture } from './fixtures';
import {
  assertPersisted,
  checkStage,
  expectRedacted,
  parseOutbox,
  sendGridCapture,
  sendGridProducer,
  smtpCapture,
  smtpProducer,
  stage,
} from './messages';

const storageLifetime = new AsyncDisposableStack();
let storage: Awaited<ReturnType<typeof startStorage>>;
beforeAll(async () => {
  storage = await startStorage(storageLifetime);
});
afterAll(() => storageLifetime.disposeAsync());

const ONCE = { limit: 1, maintenanceLimit: 0 } as const;
const HOLD = 120_000;

async function idle(worker: EmailWorker) {
  expect(await worker.run(ONCE)).toMatchObject({ stop: 'idle', items: [], counts: { claimed: 0, providerCalls: 0 } });
}

async function attempt(
  worker: EmailWorker,
  jobId: string,
  status: EmailRunEntry['status'],
  providerInvoked = true,
  reason?: EmailRunEntry['reason'],
) {
  const { items, counts } = await worker.run(ONCE);
  expect(items).toMatchObject([
    {
      operation: 'claim',
      jobId,
      attemptId: expect.any(String),
      status,
      providerInvoked,
      ...(reason ? { reason } : {}),
    },
  ]);
  expect(counts).toMatchObject({ claimed: 1, providerCalls: providerInvoked ? 1 : 0 });
  return items[0]!.attemptId!;
}

function jobRpc(f: DeliveryFixture, side: 'writerTrace' | 'readerTrace') {
  return f[side].commands
    .filter(({ commandName, command }) => command[commandName] === f.jobsName)
    .map(({ commandName }) => commandName);
}

it('relays a delayed checked outbox to scheduled capacity SMTP and replays a committed but unconfirmed admission', async () => {
  await using lifetime = new AsyncDisposableStack();
  const smtpCapacity = capacity(51);
  const f = await deliveryFixture(lifetime, storage, smtpCapacity);
  const smtp = await smtpCapture(lifetime, smtpCapacity);
  const worker = f.worker(A, smtp.provider);
  const deliverBy = (await f.now()) + HOLD;
  const invoice = await f.put('mongo', A, deliverBy);
  const slip = await f.put('seaweed', A, deliverBy);
  const files = [invoice, f.project(A), slip];
  const producer = smtpProducer(files, smtpCapacity);
  const scheduleAt = (await f.now()) + 4_000;
  const original = producer.command('scheduled-notice', deliverBy, scheduleAt);
  const { checked, serialized } = await stage(f, producer.registry, A, original, files);
  expect(checked).toMatchObject({ smtpCapacity, scheduleAt, snapshot: { smtpCapacity, expiresAt: deliverBy } });

  // A host-owned outbox value, read back by the relay side without the factory, stores or receipts.
  const outboxName = 'fixture_delivery_outbox';
  const id = 'scheduled';
  await f.firstDb.collection<{ _id: string; serialized: string }>(outboxName).insertOne({ _id: id, serialized });
  await f.waitUntil(checked.snapshot.preparedAt + 200);
  expect(await f.peer.findAdmission(A, original.key, f.call)).toBeNull();
  const row = await f.secondDb.collection<{ _id: string; serialized: string }>(outboxName).findOne({ _id: id });
  expect(row?.serialized).toBe(serialized);
  const replayOutbox = () => parseOutbox(row!.serialized);
  await expect(f.relay(B).enqueuePrepared(replayOutbox())).rejects.toMatchObject({ code: 'invalid_snapshot' });

  let committedAck: unknown;
  let confirmationError: unknown;
  const cut = intercept(
    f.firstDb,
    (cmd) =>
      cmd.insert === f.jobsName ||
      (committedAck !== undefined && cmd.find === f.jobsName && Object.hasOwn(cmd.filter, 'admissionKey')),
    async (send, cmd) => {
      if (cmd.insert === f.jobsName) {
        committedAck = await send(); // Observe the real journaled insert ACK, then hide it from the store.
        throw new Error('synthetic lost queue admission ACK');
      }
      // If confirmation could read its winner the relay would recover in the same call.
      return withFailPoint(
        f.second.getClient().db('admin'),
        'failCommand',
        async () => {
          try {
            return await send();
          } catch (error) {
            confirmationError = error;
            throw error;
          }
        },
        { mode: { times: 1 }, data: { failCommands: ['find'], errorCode: 11601 } },
      );
    },
  );
  const uploadTraffic = f.traffic();
  try {
    await expect(f.relay(A).enqueuePrepared(replayOutbox())).rejects.toMatchObject({ code: 'write_unconfirmed' });
  } finally {
    cut.mockRestore();
  }
  expect(committedAck).toMatchObject({ ok: 1, n: 1 });
  expect(committedAck).not.toHaveProperty('writeConcernError');
  expect(confirmationError).toMatchObject({ code: 11601 });
  expect(jobRpc(f, 'writerTrace')).toEqual(['find', 'find', 'find', 'insert', 'find']);

  const beforeReplay = jobRpc(f, 'readerTrace').length;
  const peerRelay = f.relay(A, f.peer);
  const replay = await peerRelay.enqueuePrepared(replayOutbox());
  expect(replay).toMatchObject({ status: 'replayed', job: { state: 'queued', scheduleAt, expiresAt: deliverBy } });
  const { jobId } = replay.job;
  const service = createEmailService({ scope: A, store: f.peer, registry: producer.registry, smtpCapacity });
  expect(await service.enqueue(original)).toEqual(replay); // Same business intent and key, not a second prepare.
  expect(jobRpc(f, 'readerTrace').slice(beforeReplay)).toEqual(['find', 'find']);
  expect(await f.now()).toBeLessThan(scheduleAt);
  await idle(worker);
  expect(f.traffic()).toEqual(uploadTraffic);
  expect(smtp.relay.peers).toHaveLength(0);

  await f.waitUntil(scheduleAt);
  await attempt(worker, jobId, 'accepted');
  await smtp.assertWire(0, original.input.label, files, checked.snapshot);
  expect(smtp.relay.peers[0]!.secure.filter((line) => line.startsWith('RCPT TO:'))).toHaveLength(51);
  await assertPersisted(f, jobId, checked);
  expect(await f.jobs.countDocuments()).toBe(1);

  const deliveredTraffic = f.traffic();
  expect(await peerRelay.enqueuePrepared(replayOutbox())).toMatchObject({
    status: 'replayed',
    job: { jobId, disposition: 'accepted', attemptCount: 1 },
  });
  await idle(worker);
  expect(f.traffic()).toEqual(deliveredTraffic);
  expect(producer.prepare).toHaveBeenCalledOnce();
  expect(smtp.provider.prepare).toHaveBeenCalledOnce();
  expect(smtp.relay.peers).toHaveLength(1);
  f.expectWrites([invoice, slip]);
  f.expectReads({ scope: A, files });

  const admin = f.admin(A);
  expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
  const activities = (await admin.listActivities({ jobId })).items;
  expect(activities).toMatchObject([
    { disposition: 'accepted', smtpCapacity, recipientCounts: { to: 49, cc: 1, bcc: 1 } },
  ]);
  expectRedacted({ job: await admin.getJob(jobId), activities }, files);
});

it('posts four mixed attachments through SendGrid V1 in separate scopes using the same logical file identities', async () => {
  await using lifetime = new AsyncDisposableStack();
  const f = await deliveryFixture(lifetime, storage);
  const grid = await sendGridCapture(lifetime);
  const deliverBy = (await f.now()) + HOLD;
  const groups = [];
  for (const scope of [A, B]) {
    const invoice = await f.put('mongo', scope, deliverBy);
    const slip = await f.put('seaweed', scope, deliverBy);
    const azure = await f.put('azure', scope, deliverBy);
    const files = [slip, azure, f.project(scope), invoice];
    const producer = sendGridProducer(files);
    const command = producer.command('grid-same-key', deliverBy);
    const staged = await stage(f, producer.registry, scope, command, files);
    expect(staged.outbox).not.toHaveProperty('smtpCapacity');
    expect(staged.outbox.snapshot).not.toHaveProperty('smtpCapacity');
    groups.push({ ...staged, scope, files, invoice, slip, azure, producer });
  }
  const [alpha, beta] = groups;
  if (!alpha || !beta) throw new Error('Expected the two independent producer scopes');
  for (const [i, { ref }] of alpha.files.entries()) {
    expect(beta.files[i]!.ref).toMatchObject({ id: ref.id, version: ref.version, byteLength: ref.byteLength });
    expect(beta.files[i]!.ref.sha256).not.toBe(ref.sha256);
  }
  expect(alpha.outbox.key).toEqual(beta.outbox.key);
  const workerB = f.worker(B, grid.provider);
  const first = await f.relay(A).enqueuePrepared(alpha.outbox);
  const uploaded = f.traffic();
  await idle(workerB);
  expect(grid.capture.peers).toHaveLength(0);
  expect(f.traffic()).toEqual(uploaded);
  const second = await f.relay(B).enqueuePrepared(beta.outbox);
  expect(first.status).toBe('enqueued');
  expect(second.status).toBe('enqueued');
  expect(second.job.jobId).not.toBe(first.job.jobId);
  expect(await f.admin(B).getJob(first.job.jobId)).toBeNull();

  await attempt(f.worker(A, grid.provider), first.job.jobId, 'accepted');
  await grid.assertWire(0, 'grid-same-key', alpha.files);
  await attempt(workerB, second.job.jobId, 'accepted');
  await grid.assertWire(1, 'grid-same-key', beta.files);
  expect(grid.capture.posts).toHaveLength(2);
  expect(grid.trace.requests).toHaveLength(2);
  f.expectWrites(groups.flatMap(({ invoice, slip, azure }) => [invoice, slip, azure]));
  f.expectReads(...groups);
  for (const [group, result] of [
    [alpha, first],
    [beta, second],
  ] as const) {
    expect(group.producer.prepare).toHaveBeenCalledOnce();
    const jobId = result.job.jobId;
    await assertPersisted(f, jobId, group.checked);
    const admin = f.admin(group.scope);
    expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
    const activities = (await admin.listActivities({ jobId })).items;
    const stored = await f.secondDb.collection(f.activitiesName).find({ scope: group.scope, jobId }).toArray();
    expect(stored).toHaveLength(1);
    expect(activities).toMatchObject([{ disposition: 'accepted', result: { reason: 'sendgrid_accepted' } }]);
    expectRedacted({ job: await admin.getJob(jobId), activities, stored }, group.files);
  }
});

it('prunes one job and purges a distinct orphan without touching a shared file needed for delivery and manual redrive', async () => {
  await using lifetime = new AsyncDisposableStack();
  const f = await deliveryFixture(lifetime, storage);
  const smtp = await smtpCapture(lifetime, undefined, 2);
  const worker = f.worker(A, smtp.provider);
  const admin = f.admin(A);
  const relay = f.relay(A);
  const deliverBy = (await f.now()) + HOLD;
  const invoice = await f.put('mongo', A, deliverBy);
  const slip = await f.put('seaweed', A, deliverBy);
  const orphan = await f.put('seaweed', A, deliverBy, 'distinct-unreferenced-orphan');
  const files = [invoice, slip, f.project(A)];
  const producer = smtpProducer(files);
  const first = await stage(f, producer.registry, A, producer.command('first-share', deliverBy), files);
  const second = await stage(f, producer.registry, A, producer.command('second-share', deliverBy), files);
  const firstId = (await relay.enqueuePrepared(first.outbox)).job.jobId;
  await attempt(worker, firstId, 'accepted');
  await smtp.assertWire(0, 'first-share', files, first.checked.snapshot);
  const secondId = (await relay.enqueuePrepared(second.outbox)).job.jobId;
  expect(secondId).not.toBe(firstId);
  expect(await admin.getJob(secondId)).toMatchObject({ state: 'queued', expiresAt: deliverBy });
  await assertPersisted(f, firstId, first.checked);
  await assertPersisted(f, secondId, second.checked);

  expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
  const afterFirstDelivery = f.traffic();
  expect(await admin.cleanup()).toMatchObject({ payloadsPruned: 1, jobsPurged: 0, persistenceFailures: 0 });
  const pruned = await f.jobs.findOne({ scope: A, jobId: firstId });
  expect(pruned?.snapshotHash).toBe(first.checked.snapshotHash);
  expect(pruned).not.toHaveProperty('snapshot');
  await assertPersisted(f, secondId, second.checked);
  expect(orphan.ref.id).not.toBe(slip.ref.id);
  // This exact-key privileged deletion simulates lifecycle selection of a known orphan, not catalog inference or elapsed policy.
  await f.purgeS3Orphan(orphan);
  expect(await f.relay(A, f.peer).enqueuePrepared(first.outbox)).toMatchObject({
    status: 'replayed',
    job: { jobId: firstId, disposition: 'accepted', attemptCount: 1 },
  });
  expect(f.traffic()).toEqual(afterFirstDelivery);
  expect(smtp.relay.peers).toHaveLength(1);

  const uncertain = await attempt(worker, secondId, 'unknown', true, 'transport_uncertain');
  await smtp.assertWire(1, 'second-share', files, second.checked.snapshot);
  await idle(worker);
  expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
  expect(await admin.cleanup()).toMatchObject({ payloadsPruned: 0, jobsPurged: 0 });
  await assertPersisted(f, secondId, second.checked);
  const redrive = { jobId: secondId, attemptId: uncertain, action: 'redrive', acknowledgeDuplicateRisk: true } as const;
  const resolved = await admin.resolveUnknown(redrive);
  expect(resolved).toMatchObject({
    status: 'resolved',
    job: { state: 'queued', attemptCount: 1, expiresAt: deliverBy },
  });
  expect(await admin.resolveUnknown(redrive)).toEqual({ status: 'replayed', job: resolved.job });
  const accepted = await attempt(worker, secondId, 'accepted');
  expect(accepted).not.toBe(uncertain);
  await smtp.assertWire(2, 'second-share', files, second.checked.snapshot);
  expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
  const history = (await admin.listActivities({ jobId: secondId })).items.toSorted((a, b) => a.ordinal - b.ordinal);
  expect(history).toMatchObject([
    { attemptId: uncertain, ordinal: 1, disposition: 'unknown', handedOffAt: expect.any(Number) },
    { attemptId: accepted, ordinal: 2, disposition: 'accepted', handedOffAt: expect.any(Number) },
  ]);
  expectRedacted({ history, job: await admin.getJob(secondId) }, files);
  expect(producer.prepare).toHaveBeenCalledTimes(2);
  expect(smtp.relay.peers).toHaveLength(3);
  f.expectWrites([invoice, slip, orphan]);
  f.expectReads(...Array.from({ length: 3 }, () => ({ scope: A, files })));

  // Only an explicit producer retry calls the backing again; it confirms the same immutable object.
  const same = await f.writers.seaweed.put(slip.input);
  expect(same.ref).toEqual(slip.ref);
  expect(same.deliverBy).toBe(slip.receipt.deliverBy);
  f.expectWrites([invoice, slip, orphan], slip);
});

it('does not prepare the provider or hand off when a real Azure attachment is missing', async () => {
  await using lifetime = new AsyncDisposableStack();
  const f = await deliveryFixture(lifetime, storage);
  const grid = await sendGridCapture(lifetime);
  const deliverBy = (await f.now()) + HOLD;
  const invoice = await f.put('mongo', A, deliverBy);
  const missing = await f.put('azure', A, deliverBy);
  const slip = await f.put('seaweed', A, deliverBy);
  const files = [invoice, missing, slip, f.project(A)];
  const producer = sendGridProducer(files);
  const { outbox } = await stage(f, producer.registry, A, producer.command('missing-azure', deliverBy), files);
  const { job } = await f.relay(A).enqueuePrepared(outbox);
  await f.removeAzureBytes(missing); // Deliberate fixture damage to an admitted payload, not a cleanup policy.

  const attemptId = await attempt(
    f.worker(A, grid.provider),
    job.jobId,
    'retry_scheduled',
    false,
    'attachment_unavailable',
  );
  const commit = await f.peer.findAttempt(A, job.jobId, attemptId, f.call);
  expect(commit).toMatchObject({
    disposition: 'retry_scheduled',
    result: { reason: 'attachment_unavailable', stage: 'attachment', outcome: 'unsubmitted', retry: 'safe_transient' },
  });
  expect(commit).not.toHaveProperty('handedOffAt');
  expect(grid.provider.prepare).not.toHaveBeenCalled();
  expect(grid.trace.dns.names).toEqual([]);
  expect(grid.capture.peers).toHaveLength(0);
  expect(grid.capture.posts).toHaveLength(0);
  f.expectWrites([invoice, missing, slip]);
  f.expectReads({ scope: A, files: [invoice, missing], missing });
  const admin = f.admin(A);
  expect(await admin.reconcile()).toMatchObject({ acknowledged: 1 });
  const history = (await admin.listActivities({ jobId: job.jobId })).items;
  expect(history).toMatchObject([{ attemptId, result: { reason: 'attachment_unavailable' } }]);
  expect(history[0]).not.toHaveProperty('handedOffAt');
  expectRedacted({ history, job: await admin.getJob(job.jobId) }, files);
});

it('uses queue expiry, not the longer file hold, to reject late admission, expire queued work and refuse redrive', async () => {
  await using lifetime = new AsyncDisposableStack();
  const f = await deliveryFixture(lifetime, storage);
  const grid = await sendGridCapture(lifetime, [503]); // Real unclassified HTTP response after full POST.
  const worker = f.worker(A, grid.provider);
  const admin = f.admin(A);
  const relay = f.relay(A);
  const deliverBy = (await f.now()) + HOLD;
  const invoice = await f.put('mongo', A, deliverBy);
  const slip = await f.put('seaweed', A, deliverBy);
  const files = [invoice, slip, f.project(A)];
  const producer = sendGridProducer(files);

  const over = await producer.registry.prepare(A, producer.command('outside-hold', deliverBy + 1));
  expect(over.snapshot.expiresAt).toBe(deliverBy + 1);
  const beforeCheck = f.traffic();
  expect(() => checkStage(f, over, files)).toThrowError(expect.objectContaining({ code: 'attachment_retention' }));
  expect(f.traffic()).toEqual(beforeCheck);

  const expiresAt = (await f.now()) + 4_500;
  const open = await stage(f, producer.registry, A, producer.command('open-short', expiresAt), files);
  const queued = await stage(f, producer.registry, A, producer.command('queued-short', expiresAt), files);
  const delayed = await stage(f, producer.registry, A, producer.command('delayed-short', expiresAt), files);
  const future = await stage(f, producer.registry, A, producer.command('eligible-long', deliverBy), files);
  const openId = (await relay.enqueuePrepared(open.outbox)).job.jobId;
  const unknown = await attempt(worker, openId, 'unknown', true, 'transport_uncertain');
  await grid.assertWire(0, 'open-short', files);
  const queuedId = (await relay.enqueuePrepared(queued.outbox)).job.jobId;
  const liveId = (await relay.enqueuePrepared(future.outbox)).job.jobId;

  await f.waitUntil(expiresAt);
  const beforeLate = jobRpc(f, 'writerTrace').length;
  const afterUnknown = f.traffic();
  await expect(relay.enqueuePrepared(parseOutbox(delayed.serialized))).rejects.toMatchObject({ code: 'expired' });
  expect(jobRpc(f, 'writerTrace').slice(beforeLate)).toEqual(['find', 'find', 'find']);
  expect(await f.peer.findAdmission(A, delayed.outbox.key, f.call)).toBeNull();
  await expect(
    admin.resolveUnknown({
      jobId: openId,
      attemptId: unknown,
      action: 'redrive',
      acknowledgeDuplicateRisk: true,
    }),
  ).rejects.toMatchObject({ code: 'expired' });
  expect(await admin.getJob(openId)).toMatchObject({
    disposition: 'unknown',
    unknownOpen: true,
    expiresAt,
    resolutions: [],
  });
  expect(await relay.enqueuePrepared(open.outbox)).toMatchObject({
    status: 'replayed',
    job: { jobId: openId, disposition: 'unknown', attemptCount: 1 },
  });
  expect(f.traffic()).toEqual(afterUnknown);
  expect(grid.capture.posts).toHaveLength(1);

  const sweep = await worker.run({ limit: 1, maintenanceLimit: 1 });
  expect(sweep.items).toMatchObject([
    { operation: 'expire', jobId: queuedId, status: 'expired', providerInvoked: false },
    { operation: 'claim', jobId: liveId, status: 'accepted', providerInvoked: true },
  ]);
  expect(sweep.counts).toMatchObject({ expiredInSweep: 1, claimed: 1, providerCalls: 1 });
  expect(await admin.getJob(queuedId)).toMatchObject({ disposition: 'expired', attemptCount: 0, expiresAt });
  await grid.assertWire(1, 'eligible-long', files);
  expect(grid.capture.posts).toHaveLength(2);
  expect(producer.prepare).toHaveBeenCalledTimes(5);
  f.expectWrites([invoice, slip]);
  f.expectReads({ scope: A, files }, { scope: A, files });
});
