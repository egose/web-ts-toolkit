import { mongo } from 'mongoose';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmailAdmin,
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  createSmtpAcceptanceResult,
  type EmailProvider,
  type SmtpCapacity,
  type SmtpSnapshot,
} from '../../src';
import { activityDigest, activityFor } from '../../src/internal/activity-codecs';
import { smtpMessageId } from '../../src/internal/attempt-codecs';
import { readCapacityOption } from '../../src/internal/smtp-capacity';
import { createMongooseEmailStore } from '../../src/mongoose';
import { activityBson, activityKey, jobBson, readJobBson } from '../../src/stores/mongoose/records';
import {
  capacity,
  capacityCommand,
  capacityTemplate,
  COUNTS,
  driveCapacityLedger,
  expectOperationFence,
  expectRedacted,
  fillCapacityPage,
  laneCall,
  stageMaximum,
} from '../conformance/smtp-capacity-fixture';
import { A, B, CALL, claimData, DAY, fixtureId, SMTP } from '../conformance/store-fixtures';
import { latch } from '../smtp/loopback';
import { ACTIVITIES, commandTrace, dbOf, DURABLE, fixture, intercept, JOBS, replicaSet, waitForTime } from './fixture';

let repl: MongoMemoryReplSet;
let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  repl = await replicaSet(1);
});
beforeEach(async () => {
  // This is a healthy single-node fixture, not a failover case. Use Mongoose's normal
  // heartbeat interval rather than the suite's fast failover monitor: Mongoose reports
  // disconnected after two missed intervals, including on large synchronous DTO assertions.
  f = await fixture(repl, { heartbeatFrequencyMS: 10_000 });
});
afterEach(async () => f?.close());
afterAll(async () => repl?.stop());

function names({ namespace }: SmtpCapacity) {
  return { jobs: `email_smtp_v2.${namespace}.jobs`, activities: `email_smtp_v2.${namespace}.activities` };
}

it('installs only matching definitions, races jobs-first and fences every primitive before driver I/O', async () => {
  const smtpCapacity = capacity();
  const { jobs, activities } = names(smtpCapacity);
  const store = createMongooseEmailStore(f.first, { smtpCapacity });
  const peer = createMongooseEmailStore(f.second, { smtpCapacity: { ...smtpCapacity } });
  const mismatch = { ...smtpCapacity, maxRecipients: 51 };
  const wrong = createMongooseEmailStore(f.second, { smtpCapacity: mismatch });
  const db = dbOf(f.second);
  expect(() => createMongooseEmailStore(f.first, { smtpCapacity, jobsCollection: JOBS })).toThrow(
    expect.objectContaining({ code: 'invalid_config' }),
  );
  expect(() => createMongooseEmailStore(f.first, { jobsCollection: jobs })).toThrow(
    expect.objectContaining({ code: 'invalid_config' }),
  );

  // Interrupt the second half. A competing cap must not initialize it; the original exact cap can resume.
  const pause = intercept(
    dbOf(f.first),
    (cmd) => cmd.create === activities,
    async () => {
      throw new Error('Synthetic setup interruption');
    },
  );
  try {
    await expect(store.ready()).rejects.toMatchObject({ code: 'write_unconfirmed' });
  } finally {
    pause.mockRestore();
  }
  await expect(store.findJob(A, fixtureId(1), laneCall(smtpCapacity))).rejects.toMatchObject({
    code: 'store_unavailable',
  });
  await expect(wrong.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
  expect((await db.listCollections().toArray()).map(({ name }) => name)).toEqual([jobs]);
  await Promise.all([store.ready(), peer.ready()]);

  const registry = capacityTemplate(smtpCapacity).registry;
  const service = createEmailService({ smtpCapacity, scope: A, store, registry });
  const { job } = await service.enqueue(capacityCommand('small-v2', 1));
  const rows = db.collection(jobs);
  const before = await rows.findOne({ jobId: job.jobId });
  expect(before).toMatchObject({ state: 'queued', smtpCapacity });
  const trace = commandTrace(f.first);
  const clockTrace = commandTrace(f.first, 'admin');
  try {
    for (const call of [
      CALL,
      laneCall(mismatch),
      laneCall(capacity()),
      { ...CALL, smtpCapacity: { ...smtpCapacity, format: 'legacy' } } as never,
    ]) {
      await expectOperationFence(store, call);
    }
    await expect(store.claimNext(A, claimData(), CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(store.recoverNext(A, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(store.expireNext(A, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(trace.commands).toHaveLength(0);
    expect(clockTrace.commands).toHaveLength(0);
  } finally {
    trace.close();
    clockTrace.close();
  }
  expect(await rows.findOne({ jobId: job.jobId })).toEqual(before);
  expect(await peer.findJob(B, job.jobId, laneCall(smtpCapacity))).toBeNull();
  const range = commandTrace(f.second);
  try {
    expect(await peer.claimNext(B, claimData(), laneCall(smtpCapacity))).toEqual({ status: 'none' });
    expect(range.commands).toHaveLength(1);
    expect(range.commands[0]?.command).toMatchObject({
      find: jobs,
      hint: 'v2_due_claim',
      limit: 4,
      batchSize: 4,
      singleBatch: true,
      projection: { _id: 0, jobId: 1 },
    });
  } finally {
    range.close();
  }

  const entered = latch<void>();
  const resume = latch<void>();
  let reads = 0;
  const held = intercept(
    dbOf(f.first),
    (cmd) => cmd.find === activities,
    async (send) => {
      if (++reads === 4) entered.release();
      await resume.reached;
      return send();
    },
  );
  const inFlight = Array.from({ length: 4 }, () => store.listActivities(A, {}, laneCall(smtpCapacity)));
  try {
    await Promise.race([
      entered.reached,
      Promise.race(inFlight).then(() => {
        throw new Error('A parked primitive returned before reaching the barrier');
      }),
    ]);
    await expect(store.listActivities(B, {}, laneCall(smtpCapacity))).rejects.toMatchObject({ code: 'busy' });
    expect(reads).toBe(4);
  } finally {
    resume.release();
    const settled = await Promise.allSettled(inFlight);
    held.mockRestore();
    expect(settled).toEqual(Array.from({ length: 4 }, () => ({ status: 'fulfilled', value: { items: [] } })));
  }

  // A second namespace can initialize independently, but a race in that namespace may only pick one cap.
  const first = capacity();
  const second = capacity(51, first.namespace);
  const racers = [
    createMongooseEmailStore(f.first, { smtpCapacity: first }),
    createMongooseEmailStore(f.second, { smtpCapacity: second }),
  ];
  const raced = await Promise.allSettled(racers.map((candidate) => candidate.ready()));
  expect(raced.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  expect(raced.find(({ status }) => status === 'rejected')).toMatchObject({
    reason: { code: 'store_incompatible' },
  });
  const winner = raced[0]?.status === 'fulfilled' ? first : second;
  await createMongooseEmailStore(f.first, { smtpCapacity: winner }).ready(); // Both validators match the winner.
  expect(await createEmailAdmin({ smtpCapacity, scope: A, store: peer }).getJob(job.jobId)).toEqual(job);
  expect((await db.listCollections().toArray()).map(({ name }) => name).sort()).toEqual(
    [jobs, activities, ...Object.values(names(winner))].sort(),
  );
});

it('validates both existing counterparts before creating a missing definition', async () => {
  const smtpCapacity = capacity();
  const { jobs, activities } = names(smtpCapacity);
  const db = dbOf(f.second);
  await db.createCollection(activities, { writeConcern: DURABLE }); // Unrelated/incompatible existing collection.
  const before = await db.listCollections().toArray();
  await expect(createMongooseEmailStore(f.first, { smtpCapacity }).ready()).rejects.toMatchObject({
    code: 'store_incompatible',
  });
  expect(await db.listCollections().toArray()).toEqual(before);
  expect(await db.listCollections({ name: jobs }).toArray()).toEqual([]);
});

it('persists a 2 MiB snapshot and the complete 11-commit ledger, and returns bounded redacted keyset pages', async () => {
  const smtpCapacity = capacity();
  const lanes = { smtpCapacity };
  const { jobs, activities } = names(smtpCapacity);
  const store = createMongooseEmailStore(f.first, lanes);
  const peer = createMongooseEmailStore(f.second, lanes);
  await store.ready();
  await peer.ready();
  const maximum = await stageMaximum(smtpCapacity, await f.now());
  const lifecycle = await driveCapacityLedger(store, peer, smtpCapacity, maximum, (time) =>
    waitForTime(f.second, time),
  );
  const { admin, jobId, last, commits } = lifecycle;
  const db = dbOf(f.second);
  const identity = { scope: A, jobId };
  const jobRows = db.collection(jobs);
  const activityRows = db.collection<{ _id: string } & mongo.Document>(activities);
  const durable = await jobRows.findOne(identity);
  if (!durable) throw new Error('Expected authoritative job');
  expect(durable).toMatchObject({
    smtpCapacity,
    intentHash: maximum.staged.intentHash,
    snapshotHash: maximum.staged.snapshotHash,
  });
  expect(durable.snapshot).toEqual(maximum.staged.snapshot);
  expect(durable.attempts.map(({ commit }: { commit: unknown }) => commit)).toEqual(commits);
  const jobSize = mongo.BSON.calculateObjectSize(durable);
  expect(jobSize).toBeGreaterThan(1_700_000);
  expect(jobSize).toBeLessThanOrEqual(4 * 1_024 * 1_024);
  const activity = await activityRows.findOne({ ...identity, attemptId: last.attemptId });
  if (!activity) throw new Error('Expected projected activity');
  expect(activity).toMatchObject({ smtpCapacity, recipientCounts: COUNTS, result: last.result });
  const activitySize = mongo.BSON.calculateObjectSize(activity);
  expect(activitySize).toBeGreaterThan(50_000);
  expect(activitySize).toBeLessThanOrEqual(128 * 1_024);
  // Schema-valid shapes in all other respects. Mongo itself rejects actual BSON over the ceilings.
  await expect(
    jobRows.updateOne(identity, { $set: { 'snapshot.html': 'x'.repeat(4 * 1_024 * 1_024) } }),
  ).rejects.toMatchObject({ code: 121 });
  await expect(
    activityRows.updateOne({ _id: activity._id }, { $set: { 'correlation.trace': 'x'.repeat(128 * 1_024) } }),
  ).rejects.toMatchObject({ code: 121 });
  await expect(jobRows.updateOne(identity, { $set: { 'smtpCapacity.maxRecipients': 51 } })).rejects.toMatchObject({
    code: 121,
  });
  // A physically valid change still breaks the canonical snapshot hash on an authoritative read.
  await jobRows.updateOne(identity, { $set: { 'snapshot.text': 'synthetic corruption' } }, { writeConcern: DURABLE });
  await expect(admin.getJob(jobId)).rejects.toMatchObject({ code: 'store_incompatible' });
  await jobRows.updateOne(
    identity,
    { $set: { 'snapshot.text': maximum.staged.snapshot.text } },
    { writeConcern: DURABLE },
  );
  const stub = { _id: fixtureId(2), ...identity, attemptId: fixtureId(1), stubDeleteAt: new Date(Date.now() + 60_000) };
  await expect(activityRows.insertOne(stub)).rejects.toMatchObject({ code: 121 });
  await expect(activityRows.insertOne({ ...stub, smtpCapacity: capacity() })).rejects.toMatchObject({ code: 121 });
  const stubId = (await activityRows.insertOne({ ...stub, smtpCapacity })).insertedId;
  try {
    await lifecycle.prune();
    expect(await jobRows.findOne(identity)).not.toHaveProperty('snapshot');
    // A correct-looking hash must still be verified against the retained frozen identity.
    await jobRows.updateOne(identity, { $set: { fingerprint: '0'.repeat(64) } }, { writeConcern: DURABLE });
    await expect(admin.getJob(jobId)).rejects.toMatchObject({ code: 'store_incompatible' });
    await jobRows.updateOne(identity, { $set: { fingerprint: maximum.staged.fingerprint } }, { writeConcern: DURABLE });
    await fillCapacityPage(store, smtpCapacity);

    const trace = commandTrace(f.second);
    try {
      const page = await admin.listActivities({ limit: 16 });
      expect(page.items).toHaveLength(16);
      expect(
        page.items.some(({ attemptId, result }) => attemptId === last.attemptId && result.recipients?.length === 1_000),
      ).toBe(true);
      expect(page.nextCursor).toEqual(expect.any(String));
      expectRedacted(page);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(1_024 * 1_024 + 1_024);
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['find']);
      expect(trace.commands[0]?.command).toMatchObject({
        find: activities,
        limit: 17,
        batchSize: 17,
        singleBatch: true,
      });
      trace.commands.length = 0;
      const tail = await admin.listActivities({ limit: 16, cursor: page.nextCursor! });
      expect(tail.items).toHaveLength(2);
      expect(tail.nextCursor).toBeUndefined();
      expect(new Set([...page.items, ...tail.items].map(({ attemptId }) => attemptId)).size).toBe(18);
      expect(trace.commands.length).toBeLessThanOrEqual(3);
      expect(
        trace.commands.every(
          ({ commandName, command }) => commandName === 'find' && command.singleBatch === true && command.limit <= 17,
        ),
      ).toBe(true);
      expect((await admin.listActivities()).items).toHaveLength(8);
      await expect(admin.listActivities({ limit: 17 })).rejects.toMatchObject({ code: 'invalid_command' });
      const foreign = createEmailAdmin({ scope: B, smtpCapacity, store: peer });
      await expect(foreign.listActivities({ cursor: page.nextCursor! })).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
      await expect(admin.listActivities({ jobId, cursor: page.nextCursor! })).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
      expect(await foreign.listActivities()).toEqual({ items: [] });
      // Preserve physical schema validity but tamper with the redacted context; the reader must fail closed.
      await activityRows.updateOne({ _id: activity._id }, { $set: { 'recipientCounts.to': COUNTS.to - 1 } });
      await expect(admin.listActivities({ jobId })).rejects.toMatchObject({ code: 'store_incompatible' });
    } finally {
      trace.close();
    }
  } finally {
    await activityRows.deleteOne({ _id: stubId });
  }
}, 120_000);

it('rolls back new routing to V1 without reusing staged V2 work or uncertain ACKs, then drains and retains on the original lane', async () => {
  const smtpCapacity = capacity();
  const { jobs, activities } = names(smtpCapacity);
  const { registry } = capacityTemplate(smtpCapacity);
  const db = dbOf(f.second);
  await f.primary.ready();
  const v1Catalog = await db.listCollections({ name: { $in: [JOBS, ACTIVITIES] } }).toArray();
  const v1Indexes = await Promise.all([db.collection(JOBS).indexes(), db.collection(ACTIVITIES).indexes()]);
  const v1Template = capacityTemplate();
  const v1Service = createEmailService({ scope: A, store: f.primary, registry: v1Template.registry });
  const v1Admin = createEmailAdmin({ scope: A, store: f.primary });
  const primary = createMongooseEmailStore(f.first, { smtpCapacity });
  await primary.ready();
  const service = createEmailService({
    scope: A,
    smtpCapacity,
    store: primary,
    registry,
    retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY },
  });
  const command = capacityCommand('same-scoped-key', 1);
  const staged = await registry.prepare(A, command);
  const conflict = await registry.prepare(A, { ...command, intent: { input: 2 } });
  const parked = await registry.prepare(A, capacityCommand('staged-only', 1));
  const v1Equivalent = await v1Template.registry.prepare(A, command);
  expect(v1Equivalent.intentHash).toBe(staged.intentHash);
  expect(v1Equivalent.fingerprint).not.toBe(staged.fingerprint);

  let writeCount = 0;
  const lose = intercept(
    dbOf(f.first),
    (cmd) => cmd.insert === jobs || (writeCount > 0 && cmd.find === jobs),
    async (send, cmd) => {
      if (cmd.insert === jobs) {
        await send();
        writeCount++;
      }
      throw new Error('Synthetic loss of committed insert ACK and exact proof');
    },
  );
  try {
    await expect(service.enqueuePrepared(staged)).rejects.toMatchObject({ code: 'write_unconfirmed' });
    expect(writeCount).toBe(1);
  } finally {
    lose.mockRestore();
  }
  const queued = await db.collection(jobs).findOne({ scope: A });
  expect(queued).toMatchObject({ state: 'queued', smtpCapacity, snapshotHash: staged.snapshotHash });
  expect(await db.collection(jobs).countDocuments()).toBe(1);
  // Host stops V2 routing. Fresh compatible work follows V1; no translation of staged commands.
  await expect(v1Service.enqueuePrepared(staged)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  await expect(v1Service.enqueuePrepared(parked)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  await expect(service.enqueuePrepared(v1Equivalent)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  const v1Staged = await v1Template.registry.prepare(A, { ...command, intent: { input: 1, event: 'new-v1-intent' } });
  const v1 = await v1Service.enqueuePrepared(v1Staged);
  const v1Submit = vi.fn(async (attemptId: string, envelope: SmtpSnapshot['envelope']) =>
    createSmtpAcceptanceResult(
      (['to', 'cc', 'bcc'] as const).flatMap((group) =>
        envelope[group].map((_, index) => ({ group, index, status: 'accepted' as const })),
      ),
      smtpMessageId(attemptId),
    ),
  );
  function provider(binding?: SmtpCapacity): EmailProvider<SmtpSnapshot> {
    return {
      ref: SMTP,
      ...(binding ? { smtpCapacity: binding } : {}),
      prepare({ attemptId, snapshot }) {
        return { submit: () => v1Submit(attemptId, snapshot.envelope) };
      },
    };
  }
  const v1Worker = createEmailWorker({ scope: A, store: f.primary, providers: [provider()] });
  try {
    const report = await v1Worker.run();
    expect(report.items).toEqual([expect.objectContaining({ jobId: v1.job.jobId, status: 'accepted' })]);
  } finally {
    await v1Worker.shutdown();
  }
  expect(await v1Admin.reconcile()).toMatchObject({ acknowledged: 1 });
  expect(await db.collection(jobs).findOne({ scope: A })).toEqual(queued);
  expect(await v1Admin.getJob(queued!.jobId)).toBeNull();

  // Resume through a new handle on the other connection, still the original route and intent.
  const resumed = createMongooseEmailStore(f.second, { smtpCapacity });
  await resumed.ready();
  const emptyRegistry = createEmailTemplateRegistry({}, { smtpCapacity });
  const relay = createEmailService({ scope: A, smtpCapacity, store: resumed, registry: emptyRegistry });
  const admin = createEmailAdmin({ scope: A, smtpCapacity, store: resumed });
  const replay = await relay.enqueuePrepared(staged);
  expect(replay).toMatchObject({ status: 'replayed', job: { jobId: queued!.jobId } });
  await expect(relay.enqueuePrepared(conflict)).rejects.toMatchObject({ code: 'idempotency_conflict' });
  expect(await relay.enqueuePrepared(parked)).toMatchObject({ status: 'enqueued' });
  const resumedWorker = createEmailWorker({
    scope: A,
    smtpCapacity,
    store: resumed,
    providers: [provider(smtpCapacity)],
  });
  try {
    expect((await resumedWorker.run()).counts).toMatchObject({ providerCalls: 2, accepted: 2 });
  } finally {
    await resumedWorker.shutdown();
  }
  expect(await admin.reconcile()).toMatchObject({ acknowledged: 2 });
  expect(await admin.cleanup()).toMatchObject({ payloadsPruned: 1, jobsPurged: 0 });
  expect((await admin.listActivities({ jobId: replay.job.jobId })).items).toHaveLength(1);
  expect(await relay.enqueuePrepared(staged)).toMatchObject({ status: 'replayed' });
  await agePrunedJob(smtpCapacity, replay.job.jobId);
  expect(await admin.cleanup({ limit: 1 })).toMatchObject({ retirementsStarted: 1, jobsPurged: 0 });
  expect(await relay.enqueuePrepared(staged)).toMatchObject({ status: 'replayed' });
  expect(await admin.cleanup({ limit: 1 })).toMatchObject({ jobsPurged: 1 });
  expect(await admin.getJob(replay.job.jobId)).toBeNull();
  expect(await admin.listActivities({ jobId: replay.job.jobId })).toEqual({ items: [] });
  expect(await v1Admin.getJob(v1.job.jobId)).toMatchObject({ disposition: 'accepted' });
  expect((await v1Admin.listActivities()).items).toHaveLength(1);
  expect(await db.listCollections({ name: { $in: [JOBS, ACTIVITIES] } }).toArray()).toEqual(v1Catalog);
  expect(await Promise.all([db.collection(JOBS).indexes(), db.collection(ACTIVITIES).indexes()])).toEqual(v1Indexes);
  expect(await db.listCollections({ name: { $in: [jobs, activities] } }).toArray()).toHaveLength(2);
});

/** Age one already pruned test job through time only; actual retention reads/guards/purge use real Mongo time. */
async function agePrunedJob(smtpCapacity: SmtpCapacity, jobId: string) {
  const context = readCapacityOption({ smtpCapacity });
  const { jobs, activities } = names(smtpCapacity);
  const db = dbOf(f.second);
  const identity = { scope: A, jobId };
  const raw = await db.collection(jobs).findOne(identity);
  const row = readJobBson(A, raw, context);
  const { state, projectionPermitUntil } = row;
  const [entry] = row.attempts;
  if (
    row.snapshot ||
    row.scheduleAt !== null ||
    state.state !== 'terminal' ||
    state.settledAt === undefined ||
    projectionPermitUntil === undefined ||
    entry?.permitUntil === undefined ||
    entry.projectionAckAt === undefined ||
    entry.commit.handedOffAt === undefined
  ) {
    throw new Error('Expected one settled, projected and pruned test attempt');
  }
  const shift = (time: number) => time - DAY - 120_000;
  const commit = {
    ...entry.commit,
    startedAt: shift(entry.commit.startedAt),
    handedOffAt: shift(entry.commit.handedOffAt),
    finishedAt: shift(entry.commit.finishedAt),
  };
  const activity = activityFor(row, commit, context);
  const digest = activityDigest(activity, context);
  const permitUntil = shift(entry.permitUntil);
  const newJob = jobBson({
    ...row,
    createdAt: shift(row.createdAt),
    updatedAt: shift(row.updatedAt),
    expiresAt: shift(row.expiresAt),
    projectionPermitUntil: shift(projectionPermitUntil),
    state: { ...state, terminalAt: shift(state.terminalAt), settledAt: shift(state.settledAt) },
    attempts: [{ ...entry, commit, digest, permitUntil, projectionAckAt: shift(entry.projectionAckAt) }],
  });
  const key = activityKey(activity);
  await db
    .collection(activities)
    .replaceOne(key, activityBson({ activity, digest, permitUntil }), { writeConcern: DURABLE });
  await db.collection(jobs).replaceOne(identity, newJob, { writeConcern: DURABLE });
}
