import { randomUUID } from 'node:crypto';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEmailAdmin, type EmailActivity } from '../../src';
import { activityDigest } from '../../src/internal/activity-codecs';
import { activityBson } from '../../src/stores/mongoose/records';
import { registerAdminConformance } from '../conformance/admin-suite';
import {
  A,
  B,
  accepted,
  admission,
  CALL,
  claim,
  finishClaim,
  finishData,
  fixtureId,
  GRID,
  insert,
  LIVE_LEASE,
} from '../conformance/store-fixtures';
import { ACTIVITIES, commandTrace, dbOf, DURABLE, fixture, intercept, JOBS, replicaSet } from './fixture';

let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await replicaSet(1);
});
afterAll(async () => repl?.stop());

registerAdminConformance('MongoDB on separate Mongoose connections', () => fixture(repl));

describe('MongoDB admin work bounds', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture(repl);
    await f.primary.ready();
    await f.peer.ready();
  });
  afterEach(async () => f?.close());

  it('bounds real projection under backlog and contention without touching another scope', async () => {
    const jobs = dbOf(f.second).collection(JOBS);
    const activities = dbOf(f.second).collection(ACTIVITIES);
    for (const scope of [B, ...Array<string>(19).fill(A)]) {
      await insert(f.peer, admission(scope, await f.now()));
      const owned = await claim(f.peer, scope);
      await f.peer.markHandoff(scope, owned.fence, LIVE_LEASE, CALL);
      await finishClaim(f.peer, scope, finishData(owned, accepted(owned.fence.attemptId)));
    }
    const admin = createEmailAdmin({ scope: A, store: f.primary });
    const trace = commandTrace(f.first);
    const scans = () =>
      trace.commands.filter(
        ({ commandName, command }) => commandName === 'find' && command.hint === 'v1_due_projection',
      );
    function checkScans(count: number) {
      const commands = scans().map(({ command }) => command);
      expect(commands).toHaveLength(count);
      for (const command of commands) {
        expect(command).toMatchObject({
          find: JOBS,
          filter: { scope: A, pendingAt: { $exists: true, $lte: expect.any(Number) } },
          sort: { pendingAt: 1, jobId: 1 },
          projection: { _id: 0, jobId: 1 },
          readConcern: { level: 'majority' },
          limit: 16,
          batchSize: 16,
          singleBatch: true,
        });
      }
    }
    try {
      expect(await admin.reconcile({ limit: 2 })).toMatchObject({
        stop: 'limit',
        reserved: 2,
        acknowledged: 2,
        persistenceFailures: 0,
      });
      checkScans(2);
      expect(trace.commands.filter(({ command }) => command.findAndModify === ACTIVITIES)).toHaveLength(2);
      expect(await jobs.countDocuments({ scope: A, pendingAt: { $exists: true } })).toBe(17);
      expect(await jobs.countDocuments({ scope: B, pendingAt: { $exists: true } })).toBe(1);
      expect(await activities.countDocuments({ scope: A, complete: true })).toBe(2);

      trace.commands.length = 0;
      const forceMiss = intercept(
        dbOf(f.first),
        (cmd) => cmd.findAndModify === JOBS,
        async (send, cmd) => {
          // Create a real competing revision on the second client. The measured CAS still runs on MongoDB.
          const { scope, jobId, revision } = cmd.query;
          expect(scope).toBe(A);
          expect(
            (await jobs.updateOne({ scope, jobId, revision }, { $set: { revision: randomUUID() } })).modifiedCount,
          ).toBe(1);
          return send();
        },
      );
      try {
        expect(await admin.reconcile({ limit: 100 })).toMatchObject({
          stop: 'contended',
          reserved: 0,
          acknowledged: 0,
          persistenceFailures: 0,
        });
        checkScans(1);
        expect(trace.commands.filter(({ command }) => command.findAndModify === JOBS)).toHaveLength(3);
        expect(trace.commands.filter(({ command }) => command.findAndModify === ACTIVITIES)).toHaveLength(0);
      } finally {
        forceMiss.mockRestore();
      }
      expect(await activities.countDocuments()).toBe(2);
      expect(await jobs.countDocuments({ pendingAt: { $exists: true } })).toBe(18);
    } finally {
      trace.close();
    }
  });

  it('uses bounded index ranges for scoped pages across a large timestamp tie and the older tail', async () => {
    const client = dbOf(f.second);
    const collection = client.collection<{
      _id: string;
      scope: string;
      jobId: string;
      attemptId: string;
      stubDeleteAt?: Date;
    }>(ACTIVITIES);
    const tie = 1_700_000_000_000;
    function row(job: number, n: number, finishedAt = tie, scope = A) {
      const unknown = n === 1;
      const activity = {
        version: 1,
        scope,
        jobId: fixtureId(job),
        attemptId: fixtureId(job * 10 + n),
        ordinal: n,
        provider: GRID,
        template: { key: 'remote', revision: 'v1' },
        correlation: {},
        startedAt: finishedAt,
        handedOffAt: finishedAt,
        finishedAt,
        result: unknown
          ? { outcome: 'unknown', retry: 'never', stage: 'http', reason: 'transport_uncertain' }
          : { outcome: 'accepted', retry: 'never', stage: 'http', reason: 'sendgrid_accepted' },
        disposition: unknown ? 'unknown' : 'accepted',
      } satisfies EmailActivity;
      return {
        _id: randomUUID(),
        ...activityBson({ activity, digest: activityDigest(activity), permitUntil: finishedAt + 60_000 }),
      };
    }
    const sortedTies = Array.from({ length: 60 }, (_, i) => [row(i + 1, 1), row(i + 1, 2)]).flat();
    const older = [row(61, 2, tie - 1), row(62, 2, tie - 1), row(63, 2, tie - 1), row(66, 2, tie - 2)];
    // Seed a read-only index corpus directly: no fake clock, accidental dependence on same-ms RPCs,
    // or reliance on an optimizer estimate instead of actual explain execution statistics.
    await collection.insertMany(
      [
        ...sortedTies.toReversed(),
        ...older.toReversed(),
        row(64, 2, tie + 1), // outside the exclusive upper bound
        row(65, 2, tie - 3), // outside the inclusive lower bound
        row(60, 2, tie, B), // same tuple, other scope
        {
          _id: randomUUID(),
          scope: A,
          jobId: fixtureId(60),
          attemptId: fixtureId(603),
          stubDeleteAt: new Date((await f.now()) + 60_000),
        },
      ],
      { writeConcern: DURABLE },
    );
    const admin = createEmailAdmin({ scope: A, store: f.primary });
    const trace = commandTrace(f.first);
    async function assertRanges(hint: string, limits: readonly number[], totalReturned: number) {
      const commands = trace.commands.splice(0);
      expect(commands.map(({ commandName }) => commandName)).toEqual(limits.map(() => 'find'));
      let rowsRead = 0;
      for (const [i, { command }] of commands.entries()) {
        const { find, filter, sort, collation, limit } = command;
        expect(command).toMatchObject({
          find: ACTIVITIES,
          filter: { scope: A, complete: true },
          hint,
          collation: { locale: 'simple' },
          limit: limits[i],
          batchSize: limits[i],
          singleBatch: true,
          readConcern: { level: 'majority' },
        });
        const { executionStats, queryPlanner } = await client.command({
          explain: { find, filter, sort, collation, hint, limit },
          verbosity: 'executionStats',
          maxTimeMS: 2_000,
        });
        const plan = JSON.stringify(queryPlanner.winningPlan);
        expect(plan).toContain(`"indexName":"${hint}"`);
        expect(plan).not.toMatch(/"stage":"(?:COLLSCAN|SORT)"/);
        expect(executionStats.totalDocsExamined).toBe(executionStats.nReturned);
        expect(executionStats.totalKeysExamined).toBeLessThanOrEqual((limits[i] ?? 0) + 1);
        rowsRead += Number(executionStats.nReturned);
      }
      expect(rowsRead).toBe(totalReturned);
    }
    try {
      const window = { from: tie - 2, before: tie + 1 };
      const first = await admin.listActivities({ ...window, limit: 100 });
      expect(first.items.map(({ attemptId }) => attemptId)).toEqual(
        sortedTies.slice(0, 100).map(({ attemptId }) => attemptId),
      );
      await assertRanges('v1_activity_page', [101], 101);

      const second = await admin.listActivities({ ...window, limit: 18, cursor: first.nextCursor! });
      expect(second.items.map(({ attemptId }) => attemptId)).toEqual(
        sortedTies.slice(100, 118).map(({ attemptId }) => attemptId),
      );
      await assertRanges('v1_activity_page', [19, 19], 19);

      const third = await admin.listActivities({ ...window, limit: 3, cursor: second.nextCursor! });
      expect(third.items.map(({ attemptId }) => attemptId)).toEqual([
        fixtureId(601),
        fixtureId(602),
        older[0]!.attemptId,
      ]);
      await assertRanges('v1_activity_page', [4, 4, 2], 4);
      const last = await admin.listActivities({ ...window, limit: 3, cursor: third.nextCursor! });
      expect(last.items.map(({ attemptId }) => attemptId)).toEqual(older.slice(1).map(({ attemptId }) => attemptId));
      expect(last).not.toHaveProperty('nextCursor');
      await assertRanges('v1_activity_page', [4, 4, 2], 3);

      const exact = { ...window, jobId: fixtureId(60), limit: 1 };
      const head = await admin.listActivities(exact);
      expect(head.items.map(({ attemptId }) => attemptId)).toEqual([fixtureId(601)]);
      await assertRanges('v1_job_activity_page', [2], 2);
      const tail = await admin.listActivities({ ...exact, cursor: head.nextCursor! });
      expect(tail.items.map(({ attemptId }) => attemptId)).toEqual([fixtureId(602)]);
      expect(tail).not.toHaveProperty('nextCursor');
      await assertRanges('v1_job_activity_page', [2, 1], 1);
    } finally {
      trace.close();
    }
  });
});
