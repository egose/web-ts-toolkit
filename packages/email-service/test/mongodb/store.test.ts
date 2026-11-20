import { randomUUID } from 'node:crypto';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMongooseEmailStore } from '../../src/mongoose';
import { ACTIVITY_ID, ADMISSION_ID, JOB_ID } from '../../src/stores/mongoose/schema';
import { registerStoreConformance } from '../conformance/store-suite';
import {
  accepted,
  admission,
  applied,
  A,
  B,
  CALL,
  claim,
  claimData,
  finishClaim,
  finishData,
  fixtureId,
  GRID,
  insert,
  LIVE_LEASE,
} from '../conformance/store-fixtures';
import { ACTIVITIES, commandTrace, dbOf, fixture, intercept, JOBS, replicaSet, waitForTime } from './fixture';

let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await replicaSet(1);
});
afterAll(async () => repl?.stop());
registerStoreConformance('MongoDB on separate Mongoose connections', () => fixture(repl));

describe('MongoDB clock, query and serialization boundaries', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture(repl, { readPreference: 'secondaryPreferred', w: 1, journal: false });
    await Promise.all([f.primary.ready(), f.peer.ready()]);
  });
  afterEach(async () => f?.close());

  it('uses exact bounded primary linearizable finds, indexed majority scans and journaled majority writes', async () => {
    const { primary, peer, first } = f;
    const trace = commandTrace(first);
    try {
      const input = admission(A, await f.now());
      const job = await insert(primary, input);
      await primary.findAdmission(A, input.command.key, CALL);
      await primary.findJob(A, job.jobId, CALL);
      const owned = await claim(primary, A);
      await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
      await finishClaim(primary, A, finishData(owned, accepted(owned.fence.attemptId)));
      await primary.findAttempt(A, owned.job.jobId, owned.fence.attemptId, CALL);
      const permit = applied(await primary.reserveProjection(A, CALL));
      await primary.putActivity(A, permit, CALL);
      await primary.ackProjection(A, permit, CALL);
      expect(await primary.listActivities(A, { limit: 2 }, CALL)).toEqual({ items: [permit.activity] });
      const majority = [];
      const linear = [];
      const writes = [];
      for (const { command, commandName } of trace.commands) {
        expect(command).not.toHaveProperty('$readPreference');
        expect(command.maxTimeMS).toBeGreaterThan(0);
        expect(command.maxTimeMS).toBeLessThanOrEqual(CALL.timeoutMs);
        expect(command).not.toHaveProperty('txnNumber');
        if (commandName === 'find') {
          expect(command.singleBatch).toBe(true);
          expect(command.collation).toEqual({ locale: 'simple' });
          if (command.readConcern.level === 'linearizable') {
            expect(command.limit).toBe(1);
            expect([ACTIVITY_ID, ADMISSION_ID, JOB_ID]).toContain(command.hint);
            expect(command.filter.scope).toBe(A);
            expect(Object.values(command.filter).every((value) => typeof value === 'string')).toBe(true);
            expect(Object.keys(command.filter)).toHaveLength(command.hint === ACTIVITY_ID ? 3 : 2);
            linear.push(command.hint);
          } else {
            expect(command.readConcern).toEqual({ level: 'majority' });
            majority.push([command.hint, command.limit]);
          }
        } else {
          expect(['insert', 'findAndModify']).toContain(commandName);
          expect(command.writeConcern).toEqual({ w: 'majority', j: true, wtimeout: command.maxTimeMS });
          if (commandName === 'findAndModify' && command.findAndModify === JOBS) {
            expect(command.query).toMatchObject({ scope: A, jobId: job.jobId, $expr: expect.any(Object) });
            expect(command.hint).toBe(JOB_ID);
            expect(command.update).toHaveLength(1);
          }
          writes.push(commandName);
        }
      }
      expect(linear).toEqual(expect.arrayContaining([JOB_ID, ADMISSION_ID, ACTIVITY_ID]));
      expect(majority).toEqual([
        ['v1_due_claim', 16],
        ['v1_due_projection', 16],
        ['v1_activity_page', 3],
      ]);
      expect(writes).toEqual(['insert', ...Array.from({ length: 6 }, () => 'findAndModify')]);
      expect(await peer.findAttempt(A, job.jobId, owned.fence.attemptId, CALL)).toMatchObject({
        disposition: 'accepted',
      });
    } finally {
      trace.close();
    }
  });

  it('keeps literal snapshot data and uses binary scope/admission uniqueness', async () => {
    const { primary, peer } = f;
    const now = await f.now();
    const key = { kind: 'single', idempotencyKey: 'CaseKey' } as const;
    const smtp = admission('Case', now, { key, content: '$$NOW' });
    const grid = admission('case', now, { key, provider: GRID, content: '$$ROOT' });
    await insert(primary, smtp);
    await insert(peer, grid);
    await insert(
      peer,
      admission('Case', now, { key: { ...key, idempotencyKey: 'casekey' }, scheduleAt: now + 60_000 }),
    );
    const a = await claim(peer, 'Case');
    const b = await claim(primary, 'case');
    expect(a.snapshot).toEqual(smtp.command.snapshot);
    expect(b.snapshot).toEqual(grid.command.snapshot);
    expect(await peer.renew('Case', a.fence, LIVE_LEASE, CALL)).not.toBeNull();
    const physical = await dbOf(f.second).collection(JOBS).findOne({ scope: 'Case', jobId: a.job.jobId });
    expect(physical?.snapshot.text).toBe('$$NOW');
    expect(await primary.findJob('case', a.job.jobId, CALL)).toBeNull();
    expect(await peer.findAdmission('CASE', key, CALL)).toBeNull();
  });

  it('claims in sorted due order and uses a fresh primary timestamp, not a caller time', async () => {
    const { primary, peer } = f;
    const start = await f.now();
    const due = start + 2_500;
    await insert(primary, admission(A, start, { jobId: fixtureId(3), scheduleAt: due, priority: 1 }));
    await insert(peer, admission(A, start, { jobId: fixtureId(2), scheduleAt: due, priority: 6 }));
    await insert(primary, admission(A, start, { jobId: fixtureId(1), scheduleAt: due, priority: 6 }));
    await insert(peer, admission(A, start, { jobId: fixtureId(4), scheduleAt: due - 1, priority: 0 }));
    await insert(peer, admission(B, start, { jobId: fixtureId(5), scheduleAt: due - 1, priority: 9 }));
    expect(await primary.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
    await waitForTime(f.second, due);
    for (const id of [4, 1, 2, 3]) {
      const owned = await claim(primary, A);
      expect(owned.job.jobId).toBe(fixtureId(id));
      expect(owned.lease.grantedAt).toBeGreaterThanOrEqual(due);
      expect(owned.lease.grantedAt).toBe(owned.job.updatedAt);
      expect(owned.lease.leaseEndsAt).toBe(owned.lease.grantedAt + LIVE_LEASE);
    }
    expect(await peer.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
  });

  it('bounds candidate reads and definitively failed CAS attempts', async () => {
    for (let n = 1; n <= 17; n++) await insert(f.peer, admission(A, await f.now(), { jobId: fixtureId(n) }));
    const { primary, second } = f;
    const trace = commandTrace(f.first);
    const collection = dbOf(second).collection(JOBS);
    const cas = intercept(
      dbOf(f.first),
      (cmd) => cmd.findAndModify === JOBS,
      async (send, cmd) => {
        // Force a real CAS miss by changing only the revision, not the injected result or selector.
        await collection.updateOne({ scope: A, jobId: cmd.query.jobId }, { $set: { revision: randomUUID() } });
        return send();
      },
    );
    try {
      expect(await primary.claimNext(A, claimData(), CALL)).toEqual({ status: 'contended' });
      expect(cas).toHaveBeenCalled();
      expect(trace.commands.filter(({ commandName }) => commandName === 'findAndModify')).toHaveLength(3);
      expect(
        trace.commands
          .filter(({ commandName, command }) => commandName === 'find' && command.readConcern.level === 'majority')
          .map(({ command }) => command.limit),
      ).toEqual([16]);
      expect(await collection.countDocuments({ scope: A, state: 'leased' })).toBe(0);
    } finally {
      cas.mockRestore();
      trace.close();
    }
  });

  it('ready is explicit, never registers models and leaves the connection caller-owned', async () => {
    const store = createMongooseEmailStore(f.first, {
      jobsCollection: 'isolated_jobs',
      activitiesCollection: 'isolated_activities',
      jobsModelName: 'IsolatedJob',
      activitiesModelName: 'IsolatedActivity',
    });
    await expect(store.findJob(A, fixtureId(1), CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
    expect(f.first.modelNames()).toEqual([]);
    await store.ready();
    expect(f.first.modelNames()).toEqual([]);
    expect(f.first.base.modelNames()).toEqual([]);
    const job = await insert(store, admission(A, await f.now()));
    expect(await f.peer.findJob(A, job.jobId, CALL)).toBeNull();
    expect(await dbOf(f.second).collection('isolated_jobs').countDocuments()).toBe(1);
    expect(await dbOf(f.second).collection(ACTIVITIES).countDocuments()).toBe(0);
    await f.first.destroy();
    await expect(store.findJob(A, job.jobId, CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
    expect(await f.now()).toBeGreaterThan(0);
  });
});
