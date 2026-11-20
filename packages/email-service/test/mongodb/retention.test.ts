import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { mongo } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createEmailAdmin, type EmailActivity } from '../../src';
import { ACTIVITY_STUB_TTL_MS, PROJECTION_DRAIN_MS, PROJECTION_PERMIT_MS } from '../../src/constants';
import { activityDigest, activityFor } from '../../src/internal/activity-codecs';
import type { LedgerAttempt } from '../../src/internal/job-record';
import { activityBson, activityKey, jobBson, readActivityBson, readJobBson } from '../../src/stores/mongoose/records';
import {
  A,
  B,
  accepted,
  admission,
  applied,
  CALL,
  claim,
  claimData,
  DAY,
  finishClaim,
  finishData,
  insert,
  LIVE_LEASE,
  AMBIGUOUS,
  TRANSIENT,
} from '../conformance/store-fixtures';
import {
  ACTIVITIES,
  commandTrace,
  dbOf,
  DURABLE,
  fixture,
  intercept,
  JOBS,
  replicaSet,
  waitForTime,
  withFailPoint,
} from './fixture';

let repl: MongoMemoryReplSet;
let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  repl = await replicaSet(1);
});
beforeEach(async () => {
  f = await fixture(repl);
  await f.primary.ready();
  await f.peer.ready();
});
afterEach(async () => f?.close());
afterAll(async () => repl?.stop());

async function finalize(scope: string, unknown = false) {
  const input = admission(scope, await f.now(), { retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY } });
  await insert(f.primary, input);
  const owned = await claim(f.peer, scope);
  await f.primary.markHandoff(scope, owned.fence, LIVE_LEASE, CALL);
  await finishClaim(f.peer, scope, finishData(owned, unknown ? AMBIGUOUS : accepted(owned.fence.attemptId)));
  return { input, owned };
}

it('keeps immutable digest and append-only ACK under concurrent projectors; does not rebuild corrupt history', async () => {
  await finalize(A);
  const first = applied(await f.primary.reserveProjection(A, CALL));
  const second = applied(await f.peer.reserveProjection(A, CALL));
  expect(await Promise.all([f.primary.putActivity(A, first, CALL), f.peer.putActivity(A, second, CALL)])).toEqual([
    'present',
    'present',
  ]);
  const collection = dbOf(f.second).collection(ACTIVITIES);
  expect(await collection.countDocuments()).toBe(1);
  const identity = activityKey(first.activity);
  const complete = await collection.findOne(identity);
  expect(complete).toEqual({ ...activityBson(first), _id: expect.any(String) });
  expect(JSON.stringify(complete)).not.toContain('example.invalid/token');
  const acks = await Promise.all([f.primary.ackProjection(A, first, CALL), f.peer.ackProjection(A, second, CALL)]);
  expect(acks.sort()).toEqual(['acknowledged', 'already_acknowledged']);
  expect(await f.primary.reserveProjection(A, CALL)).toEqual({ status: 'none' });
  const changed: EmailActivity = { ...first.activity, correlation: { other: 'changed' } };
  await collection.replaceOne(identity, activityBson({ ...first, activity: changed, digest: activityDigest(changed) }));
  await expect(f.peer.putActivity(A, first, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
  await expect(f.peer.ackProjection(A, first, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
  await collection.deleteOne(identity);
  await expect(f.peer.putActivity(A, second, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
  expect(await collection.countDocuments()).toBe(0);
  expect(await f.peer.findJob(A, identity.jobId, CALL)).toMatchObject({ disposition: 'accepted' });
});

it('checks real $$NOW when a validly planned put arrives after its permit; makes only a TTL stub, then promotes it', async () => {
  await finalize(A);
  const permit = applied(await f.primary.reserveProjection(A, CALL));
  const { jobId } = permit.activity;
  const jobs = dbOf(f.second).collection(JOBS);
  // Synthetic, coherent old finish and permit: shorten the *remaining* live interval
  // without changing the protocol or clock. The server crosses it during the barrier.
  const now = await f.now();
  const finishedAt = now - PROJECTION_PERMIT_MS + 1_800;
  const permitUntil = finishedAt + PROJECTION_PERMIT_MS;
  const old = await jobs.findOne({ scope: A, jobId });
  if (!old) throw new Error('Expected seeded job');
  const activity = { ...permit.activity, startedAt: finishedAt, handedOffAt: finishedAt, finishedAt };
  const short = { activity, digest: activityDigest(activity), permitUntil };
  await jobs.updateOne(
    { scope: A, jobId },
    {
      $set: {
        createdAt: finishedAt,
        updatedAt: finishedAt,
        pendingAt: finishedAt,
        projectionPermitUntil: permitUntil,
        'lifecycle.terminalAt': finishedAt,
        'lifecycle.settledAt': finishedAt,
        'attempts.0.permitUntil': permitUntil,
        'attempts.0.digest': short.digest,
        'attempts.0.commit.startedAt': finishedAt,
        'attempts.0.commit.handedOffAt': finishedAt,
        'attempts.0.commit.finishedAt': finishedAt,
      },
    },
    { writeConcern: DURABLE },
  );
  let sent = 0;
  let lateCommand: mongo.Document | undefined;
  const pause = intercept(
    dbOf(f.first),
    (cmd) => cmd.findAndModify === ACTIVITIES,
    async (send, command) => {
      sent++;
      lateCommand = command;
      expect(await f.now()).toBeLessThan(permitUntil);
      await waitForTime(f.second, permitUntil);
      return send();
    },
  );
  try {
    expect(await f.primary.putActivity(A, short, CALL)).toBe('permit_expired');
    expect(sent).toBe(1);
  } finally {
    pause.mockRestore();
  }
  const collection = dbOf(f.second).collection(ACTIVITIES);
  const identity = activityKey(activity);
  const stub = await collection.findOne(identity);
  expect(stub).toEqual({ ...identity, _id: expect.any(String), stubDeleteAt: expect.any(Date) });
  expect(stub?.stubDeleteAt.getTime()).toBeGreaterThanOrEqual(permitUntil + ACTIVITY_STUB_TTL_MS);
  const admin = createEmailAdmin({ scope: A, store: f.peer });
  expect(await admin.listActivities()).toEqual({ items: [] });
  expect(await f.peer.ackProjection(A, short, CALL)).toBe('stale');
  const next = applied(await f.peer.reserveProjection(A, CALL));
  expect(next.digest).toBe(short.digest);
  expect(await f.primary.putActivity(A, next, CALL)).toBe('present');
  expect(await collection.findOne(identity)).toEqual({ ...activityBson(next), _id: stub?._id });
  await expect(collection.updateOne(identity, { $set: { stubDeleteAt: new Date(0) } })).rejects.toMatchObject({
    code: 121,
  });
  expect(await f.peer.ackProjection(A, short, CALL)).toBe('acknowledged');
  expect(await f.peer.putActivity(A, short, CALL)).toBe('present');

  await ageTerminal(A, jobId, -1);
  expect(applied(await f.peer.cleanupNext(A, CALL))).toBe('retirement_started');
  expect(applied(await f.peer.cleanupNext(A, CALL))).toBe('purged');
  // Force a wire replay of the already captured old command after both collections
  // were purged. The adapter would reject the permit before dispatch at this point.
  await dbOf(f.second).command({ ...lateCommand, maxTimeMS: 1_000 });
  expect(await collection.findOne(identity)).toEqual({
    ...identity,
    _id: expect.any(String),
    stubDeleteAt: expect.any(Date),
  });
  expect(await admin.listActivities()).toEqual({ items: [] });
  expect(await admin.getJob(jobId)).toBeNull();
}, 20_000);

it('bounds a real server-side projection command and checks interruption before the update', async () => {
  await finalize(A);
  const permit = applied(await f.primary.reserveProjection(A, CALL));
  const admin = f.second.getClient().db('admin');
  const rejected: unknown[] = [];
  const recording = intercept(
    dbOf(f.first),
    (cmd) => cmd.findAndModify === ACTIVITIES,
    async (send, command) => {
      // Shorten only the wire bound so the server timeout is observable separately from the driver watchdog.
      expect(command.maxTimeMS).toBeGreaterThan(500);
      command.maxTimeMS = 75;
      try {
        return await send();
      } catch (error) {
        rejected.push(error);
        throw error;
      }
    },
  );
  try {
    await withFailPoint(
      admin,
      'failCommand',
      async (entered) => {
        const result = expect(f.primary.putActivity(A, permit, CALL)).rejects.toMatchObject({
          code: 'write_unconfirmed',
        });
        await entered();
        await result;
      },
      { mode: { times: 1 }, data: { failCommands: ['findAndModify'], blockConnection: true, blockTimeMS: 500 } },
    );
    expect(rejected).toEqual([expect.objectContaining({ code: 50 })]);
    expect(await f.peer.listActivities(A, {}, CALL)).toEqual({ items: [] });
    expect(await f.peer.ackProjection(A, permit, CALL)).toBe('stale');
    expect(await f.peer.putActivity(A, permit, CALL)).toBe('present');
  } finally {
    recording.mockRestore();
  }
});

/** Seed old but logically valid terminal data. Time checks and all cleanup writes still run on real MongoDB. */
async function ageTerminal(scope: string, jobId: string, beforeDrainMs: number) {
  const jobs = dbOf(f.second).collection(JOBS);
  const { now } = f;
  const base = await now();
  const permitUntil = base - PROJECTION_DRAIN_MS + beforeDrainMs;
  const settledAt = base - DAY - 120_000;
  const ackAt = permitUntil - PROJECTION_PERMIT_MS;
  const raw = await jobs.findOne({ scope, jobId });
  if (!raw?.snapshot) throw new Error('Expected persisted snapshot');
  // Use the real admission/transition reducer for the live path and move the settled row
  // (not the server clock) for otherwise one-day retention. Preserve the original snapshot/hash.
  const { createdAt } = raw;
  const startedAt = settledAt - 5;
  const finishedAt = settledAt;
  const owner = raw.attempts[0];
  const current = await dbOf(f.second).collection(ACTIVITIES).findOne({ scope, jobId });
  const stored = current && readActivityBson(scope, current);
  if (!stored) throw new Error('Expected a complete activity');
  const activity = {
    ...stored.activity,
    startedAt,
    handedOffAt: startedAt,
    finishedAt,
  };
  const digest = activityDigest(activity);
  // An exact original snapshot has a later preparedAt, so drop it only after the real prune.
  expect(raw.snapshot).toBeDefined();
  expect(await f.primary.cleanupNext(scope, CALL)).toMatchObject({ status: 'applied', value: 'payload_pruned' });
  const revision = (await jobs.findOne({ scope, jobId }))?.revision;
  await jobs.updateOne(
    { scope, jobId, revision },
    {
      $set: {
        createdAt: Math.min(createdAt, startedAt),
        updatedAt: ackAt,
        messageExpiresAt: ackAt + 60_000,
        projectionPermitUntil: permitUntil,
        lifecycle: { ...raw.lifecycle, terminalAt: settledAt, settledAt },
        attempts: [
          {
            ...owner,
            digest,
            permitUntil,
            projectionAckAt: ackAt,
            commit: { ...owner.commit, startedAt, handedOffAt: startedAt, finishedAt },
          },
        ],
        nextCleanupAt: Math.max(settledAt + DAY, permitUntil + PROJECTION_DRAIN_MS),
      },
    },
    { writeConcern: DURABLE },
  );
  const aged = { activity, digest, permitUntil };
  const identity = activityKey(activity);
  await dbOf(f.second).collection(ACTIVITIES).replaceOne(identity, activityBson(aged), { writeConcern: DURABLE });
  return aged;
}

it('holds unknown/pending rows; waits for drain, repeats partial purge, and cannot resurrect complete history', async () => {
  const admin = createEmailAdmin({ scope: A, store: f.primary });
  const reader = createEmailAdmin({ scope: A, store: f.peer });
  const foreign = createEmailAdmin({ scope: B, store: f.peer });
  const { input } = await finalize(A);
  const unknown = await finalize(B, true);
  expect(await reader.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
  expect(await foreign.reconcile()).toMatchObject({ stop: 'idle', acknowledged: 1 });
  expect(await foreign.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
  const unresolved = await foreign.listActivities();
  expect(unresolved.items).toHaveLength(1);
  expect(await admin.reconcile()).toMatchObject({ stop: 'idle', acknowledged: 1 });
  const old = await ageTerminal(A, input.jobId, 1_500);
  expect(await reader.cleanup()).toMatchObject({ stop: 'idle', retirementsStarted: 0 });
  await waitForTime(f.second, old.permitUntil + PROJECTION_DRAIN_MS);
  expect(await reader.cleanup({ limit: 1 })).toMatchObject({ stop: 'limit', retirementsStarted: 1, jobsPurged: 0 });
  expect(await f.primary.findAdmission(A, input.command.key, CALL)).toMatchObject({ job: { disposition: 'accepted' } });

  const trace = commandTrace(f.first);
  const stop = intercept(
    dbOf(f.first),
    (cmd) => cmd.delete === ACTIVITIES,
    async (send) => {
      await send();
      throw new Error('test only: activity delete ACK not available to caller');
    },
  );
  try {
    expect(await admin.cleanup()).toEqual({
      stop: 'store_error',
      payloadsPruned: 0,
      retirementsStarted: 0,
      jobsPurged: 0,
      persistenceFailures: 1,
    });
    expect(
      trace.commands.filter(({ commandName }) => commandName === 'delete').map(({ command }) => command.delete),
    ).toEqual([ACTIVITIES]);
    expect(await reader.listActivities()).toEqual({ items: [] });
    expect(await reader.getJob(input.jobId)).toMatchObject({ disposition: 'accepted' });
    expect(await f.peer.findAdmission(A, input.command.key, CALL)).not.toBeNull();
    expect(await f.peer.reserveProjection(A, CALL)).toEqual({ status: 'none' });
  } finally {
    stop.mockRestore();
    trace.close();
  }
  expect(await reader.cleanup()).toMatchObject({ stop: 'idle', jobsPurged: 1, persistenceFailures: 0 });
  expect(await admin.getJob(input.jobId)).toBeNull();
  expect(await f.peer.findAdmission(A, input.command.key, CALL)).toBeNull();
  expect(await f.peer.putActivity(A, old, CALL)).toBe('permit_expired');
  expect(await f.peer.ackProjection(A, old, CALL)).toBe('stale');
  expect(await dbOf(f.second).collection(ACTIVITIES).countDocuments({ scope: A })).toBe(0);
  expect(await foreign.getJob(unknown.input.jobId)).toMatchObject({ unknownOpen: true });
  expect(await foreign.listActivities()).toEqual(unresolved);
});

it('does not let a delayed cleaner delete a re-admitted activity with the same logical IDs', async () => {
  const { input, owned } = await finalize(A);
  const permit = applied(await f.peer.reserveProjection(A, CALL));
  await f.peer.putActivity(A, permit, CALL);
  await f.peer.ackProjection(A, permit, CALL);
  await ageTerminal(A, input.jobId, -1);
  expect(applied(await f.peer.cleanupNext(A, CALL))).toBe('retirement_started');

  let reAdmitted;
  const pause = intercept(
    dbOf(f.first),
    (cmd) => cmd.delete === ACTIVITIES,
    async (send) => {
      expect(applied(await f.peer.cleanupNext(A, CALL))).toBe('purged');
      await insert(f.peer, admission(A, await f.now(), { jobId: input.jobId, key: input.command.key }));
      const next = await claim(f.peer, A, claimData(LIVE_LEASE, owned.fence.attemptId));
      await f.peer.markHandoff(A, next.fence, LIVE_LEASE, CALL);
      await finishClaim(f.peer, A, finishData(next, accepted(next.fence.attemptId)));
      reAdmitted = applied(await f.peer.reserveProjection(A, CALL));
      await f.peer.putActivity(A, reAdmitted, CALL);
      await f.peer.ackProjection(A, reAdmitted, CALL);
      return send();
    },
  );
  try {
    expect(await f.primary.cleanupNext(A, CALL)).toEqual({ status: 'contended' });
    expect(pause).toHaveBeenCalled();
  } finally {
    pause.mockRestore();
  }
  expect(reAdmitted).toBeDefined();
  expect(await f.peer.listActivities(A, {}, CALL)).toEqual({ items: [reAdmitted!.activity] });
  expect(await f.peer.findAdmission(A, input.command.key, CALL)).toMatchObject({ job: { disposition: 'accepted' } });
});

/** Age an already pruned history without waiting a day or rewriting the server clock. */
async function agePrunedLedger(jobId: string) {
  const db = dbOf(f.second);
  const identity = { scope: A, jobId };
  const row = readJobBson(A, await db.collection(JOBS).findOne(identity));
  const { state, projectionPermitUntil } = row;
  if (
    row.snapshot ||
    row.scheduleAt !== null ||
    state.state !== 'terminal' ||
    state.settledAt === undefined ||
    projectionPermitUntil === undefined
  ) {
    throw new Error('Expected a settled, fully projected and pruned test ledger');
  }
  const shift = (timestamp: number) => timestamp - DAY - 120_000;
  const attempts = [];
  for (const { commit, ownerDigest, permitUntil, projectionAckAt } of row.attempts) {
    if (permitUntil === undefined || projectionAckAt === undefined)
      throw new Error('Expected a projected test attempt');
    const aged = {
      ...commit,
      startedAt: shift(commit.startedAt),
      finishedAt: shift(commit.finishedAt),
      ...(commit.handedOffAt === undefined ? {} : { handedOffAt: shift(commit.handedOffAt) }),
      ...(commit.retryAt === undefined ? {} : { retryAt: shift(commit.retryAt) }),
    };
    const activity = activityFor(row, aged);
    const permit = { activity, digest: activityDigest(activity), permitUntil: shift(permitUntil) };
    const replaced = await db
      .collection(ACTIVITIES)
      .replaceOne(activityKey(activity), activityBson(permit), { writeConcern: DURABLE });
    expect(replaced.modifiedCount).toBe(1);
    attempts.push({
      commit: aged,
      digest: permit.digest,
      permitUntil: permit.permitUntil,
      projectionAckAt: shift(projectionAckAt),
      ...(ownerDigest === undefined ? {} : { ownerDigest }),
    });
  }
  const aged = jobBson({
    ...row,
    createdAt: shift(row.createdAt),
    updatedAt: shift(row.updatedAt),
    expiresAt: shift(row.expiresAt),
    projectionPermitUntil: shift(projectionPermitUntil),
    state: { ...state, terminalAt: shift(state.terminalAt), settledAt: shift(state.settledAt) },
    resolutions: row.resolutions.map((entry) => ({ ...entry, at: shift(entry.at) })),
    attempts,
  });
  expect((await db.collection(JOBS).replaceOne(identity, aged, { writeConcern: DURABLE })).modifiedCount).toBe(1);
}

it('projects a full eleven-attempt ledger in finite steps and purges only eleven exact activity identities', async () => {
  const { primary, peer } = f;
  const admin = createEmailAdmin({ scope: A, store: primary });
  const reader = createEmailAdmin({ scope: A, store: peer });
  const foreign = createEmailAdmin({ scope: B, store: peer });
  const value = admission(A, await f.now(), {
    retry: { maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 100 },
    retention: { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY },
  });
  const { jobId, key } = await insert(primary, value);
  const ids: string[] = [];
  for (let count = 1; count <= 11; count++) {
    const owned = await claim(peer, A);
    expect(owned).toMatchObject({ ordinal: count, manual: count === 11 });
    const { attemptId } = owned.fence;
    await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
    const result = count < 10 ? TRANSIENT : count === 10 ? AMBIGUOUS : accepted(attemptId);
    const commit = await finishClaim(primary, A, finishData(owned, result));
    ids.push(attemptId);
    if (count < 10) await waitForTime(f.second, commit.retryAt!);
    if (count === 10) {
      await reader.resolveUnknown({ jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true });
    }
  }
  expect(await reader.getJob(jobId)).toMatchObject({ disposition: 'accepted', attemptCount: 11 });
  const jobs = dbOf(f.second).collection<{ scope: string; jobId: string; attempts: readonly LedgerAttempt[] }>(JOBS);
  const ledger = readJobBson(A, await jobs.findOne({ scope: A, jobId })).attempts;
  expect(ledger.map(({ commit }) => commit.attemptId)).toEqual(ids);
  await expect(jobs.updateOne({ scope: A, jobId }, { $push: { attempts: ledger[0]! } })).rejects.toMatchObject({
    code: 121,
  });
  expect(await admin.reconcile({ limit: 3 })).toMatchObject({ stop: 'limit', reserved: 3, acknowledged: 3 });
  expect(await reader.cleanup({ limit: 1 })).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
  expect(await admin.reconcile({ limit: 8 })).toMatchObject({ stop: 'limit', reserved: 8, acknowledged: 8 });
  expect(await reader.reconcile({ limit: 1 })).toMatchObject({ stop: 'idle', reserved: 0 });
  const projected = (await reader.listActivities({ jobId })).items;
  expect(projected.toSorted((a, b) => a.ordinal - b.ordinal).map(({ attemptId }) => attemptId)).toEqual(ids);

  await insert(peer, admission(B, await f.now(), { jobId, key }));
  const other = await claim(peer, B, claimData(LIVE_LEASE, ids[0]));
  await peer.markHandoff(B, other.fence, LIVE_LEASE, CALL);
  await finishClaim(peer, B, finishData(other, accepted(ids[0]!)));
  expect(await foreign.reconcile({ limit: 1 })).toMatchObject({ acknowledged: 1 });
  const foreignHistory = await foreign.listActivities({ jobId });
  expect(foreignHistory.items).toHaveLength(1);

  expect(await admin.cleanup({ limit: 1 })).toMatchObject({ stop: 'limit', payloadsPruned: 1 });
  await agePrunedLedger(jobId);
  expect(await admin.cleanup({ limit: 1 })).toMatchObject({ stop: 'limit', retirementsStarted: 1 });
  expect(await peer.findAdmission(A, key, CALL)).not.toBeNull();
  const trace = commandTrace(f.first);
  try {
    expect(await admin.cleanup({ limit: 1 })).toMatchObject({ stop: 'limit', jobsPurged: 1, persistenceFailures: 0 });
    const { commands } = trace;
    const activityProofs = commands.filter(({ command }) => command.find === ACTIVITIES);
    expect(activityProofs.map(({ command }) => command.filter)).toEqual(
      [...ids, ...ids].map((attemptId) => ({ scope: A, jobId, attemptId })),
    );
    for (const { command } of activityProofs) {
      expect(command).toMatchObject({ limit: 1, singleBatch: true, readConcern: { level: 'linearizable' } });
    }
    const deletes = commands.filter(({ commandName }) => commandName === 'delete').map(({ command }) => command);
    expect(deletes.map(({ delete: name }) => name)).toEqual([ACTIVITIES, JOBS]);
    expect(deletes[0]?.deletes).toEqual(
      ids.map((attemptId) => ({
        q: { scope: A, jobId, attemptId, _id: expect.any(String), $expr: expect.any(Object) },
        limit: 1,
        hint: 'v1_activity_identity',
        collation: { locale: 'simple' },
      })),
    );
    expect(deletes[1]?.deletes).toEqual([
      expect.objectContaining({ limit: 1, q: expect.objectContaining({ scope: A, jobId, retiring: true }) }),
    ]);
  } finally {
    trace.close();
  }
  expect(await reader.listActivities({ jobId })).toEqual({ items: [] });
  expect(await peer.findAdmission(A, key, CALL)).toBeNull();
  expect(await foreign.listActivities({ jobId })).toEqual(foreignHistory);
  expect(await peer.findAdmission(B, key, CALL)).not.toBeNull();
});
