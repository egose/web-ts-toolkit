import { setTimeout as sleep } from 'node:timers/promises';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  A,
  accepted,
  admission,
  applied,
  CALL,
  claim,
  claimData,
  finishClaim,
  finishData,
  insert,
  LIVE_LEASE,
  STOPPED,
} from '../conformance/store-fixtures';
import { commandTrace, connect, dbOf, fixture, JOBS, replicaSet, withFailPoint } from './fixture';

let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await replicaSet(3);
});
afterAll(async () => repl?.stop());

it('preserves committed handoff and finalization across a real three-member election that interrupts an in-flight marker', async () => {
  const f = await fixture(repl, {
    readPreference: 'secondaryPreferred',
    w: 1,
    journal: false,
    serverSelectionTimeoutMS: 15_000,
  });
  const admin = f.second.getClient().db('admin');
  const trace = commandTrace(f.first);
  try {
    await f.primary.ready();
    await f.peer.ready();
    const before = await admin.command({ hello: 1, maxTimeMS: 1_000 }, { readPreference: 'primary' });
    expect(before.hosts).toHaveLength(3);
    const direct = await connect(`mongodb://${before.primary}/admin?directConnection=true`);
    const oldPrimary = direct.getClient().db('admin');
    try {
      const durableInput = admission(A, await f.now());
      const durableJob = await insert(f.primary, durableInput);
      const durableOwner = await claim(f.peer, A);
      expect(await f.peer.markHandoff(A, durableOwner.fence, LIVE_LEASE, CALL)).not.toBeNull();

      const finalJob = await insert(f.primary, admission(A, await f.now()));
      const finalizedOwner = await claim(f.peer, A);
      await f.primary.markHandoff(A, finalizedOwner.fence, LIVE_LEASE, CALL);
      const originalFinal = finishData(finalizedOwner, accepted(finalizedOwner.fence.attemptId));
      const originalCommit = await finishClaim(f.peer, A, originalFinal);
      const permit = applied(await f.primary.reserveProjection(A, CALL));
      expect(await f.peer.putActivity(A, permit, CALL)).toBe('present');
      expect(await f.primary.ackProjection(A, permit, CALL)).toBe('acknowledged');

      const uncertainJob = await insert(f.primary, admission(A, await f.now()));
      const uncertainOwner = await claim(f.peer, A);
      expect(uncertainOwner.job.jobId).toBe(uncertainJob.jobId);
      const start = trace.commands.length;
      await withFailPoint(oldPrimary, 'hangBeforeFindAndModifyPerformsUpdate', async (entered) => {
        const pending = expect(f.primary.markHandoff(A, uncertainOwner.fence, LIVE_LEASE, CALL)).rejects.toMatchObject({
          code: 'write_unconfirmed',
        });
        try {
          await entered();
          // Unpause only after this server has transitioned out of writable primary.
          const stepping = oldPrimary
            .command({ replSetStepDown: 15, force: true, maxTimeMS: 3_000 })
            .catch((error: unknown) => {
              // SDAM can close the stepping-down socket even when the command did take effect.
              if (!(error instanceof Error) || !error.name.startsWith('Mongo')) throw error;
            });
          await expect
            .poll(
              async () => {
                try {
                  return (await oldPrimary.command({ hello: 1, maxTimeMS: 500 })).isWritablePrimary;
                } catch {
                  return true;
                }
              },
              { timeout: 3_500, interval: 50 },
            )
            .toBe(false);
          await stepping;
        } finally {
          await oldPrimary.command({ configureFailPoint: 'hangBeforeFindAndModifyPerformsUpdate', mode: 'off' });
          await pending;
        }
      });
      const attemptedWrites = trace.commands.slice(start).filter(({ commandName }) => commandName === 'findAndModify');
      expect(attemptedWrites).toHaveLength(1);
      expect(attemptedWrites[0]?.address).toBe(before.primary);

      let newPrimary: unknown;
      const deadline = performance.now() + 12_000;
      while (performance.now() < deadline) {
        try {
          const hello = await admin.command({ hello: 1, maxTimeMS: 700 }, { readPreference: 'primary' });
          if (hello.isWritablePrimary && hello.primary !== before.primary) {
            newPrimary = hello.primary;
            break;
          }
        } catch {
          // Election has not finished yet. The bounded adapter operations below run only
          // once a different real member reports itself as the writable primary.
        }
        await sleep(75);
      }
      expect(typeof newPrimary).toBe('string');
      expect(newPrimary).not.toBe(before.primary);

      const next = trace.commands.length;
      expect(await f.primary.findAdmission(A, durableInput.command.key, CALL)).toMatchObject({
        job: { jobId: durableJob.jobId, phase: 'handed_off', attemptCount: 1 },
      });
      expect(await f.primary.findJob(A, uncertainJob.jobId, CALL)).toMatchObject({
        phase: 'pre_handoff',
        attemptCount: 1,
      });
      expect(await f.primary.findAttempt(A, uncertainJob.jobId, uncertainOwner.fence.attemptId, CALL)).toBeNull();
      expect(await f.primary.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
      const postElection = trace.commands.slice(next).filter(({ commandName }) => commandName === 'find');
      expect(postElection).toHaveLength(4);
      expect(postElection.every(({ address }) => address === newPrimary)).toBe(true);
      expect(postElection.map(({ command }) => command.readConcern.level)).toEqual([
        'linearizable',
        'linearizable',
        'linearizable',
        'majority',
      ]);

      // A deliberately pinned read on the actual former primary cannot return a
      // current proof with linearizable, even when it can serve majority data.
      const point = postElection[0]!.command;
      const former = direct.getClient().db(dbOf(f.first).databaseName);
      const exact = {
        find: point.find,
        filter: point.filter,
        hint: point.hint,
        collation: point.collation,
        limit: 1,
        singleBatch: true,
        maxTimeMS: 1_000,
      };
      await expect(former.command({ ...exact, readConcern: point.readConcern })).rejects.toMatchObject({
        name: 'MongoServerError',
      });
      await expect(former.command({ ...exact, readConcern: { level: 'majority' } })).resolves.toMatchObject({
        cursor: { firstBatch: [{ jobId: durableJob.jobId }] },
      });

      expect(await f.primary.findAttempt(A, finalJob.jobId, finalizedOwner.fence.attemptId, CALL)).toEqual(
        originalCommit,
      );
      expect(await f.peer.finish(A, originalFinal, CALL)).toEqual(originalCommit);
      expect(await f.primary.listActivities(A, { jobId: finalJob.jobId }, CALL)).toEqual({ items: [permit.activity] });
      expect(await f.peer.ackProjection(A, permit, CALL)).toBe('already_acknowledged');

      const final = finishData(durableOwner, accepted(durableOwner.fence.attemptId));
      const commit = await finishClaim(f.primary, A, final);
      expect(await f.peer.findAttempt(A, durableJob.jobId, durableOwner.fence.attemptId, CALL)).toEqual(commit);
      expect(await f.peer.finish(A, final, CALL)).toEqual(commit);
      expect(await dbOf(f.second).collection(JOBS).findOne({ scope: A, jobId: durableJob.jobId })).toMatchObject({
        lifecycle: { disposition: 'accepted' },
        attempts: [{ commit: { operationId: final.operationId } }],
      });
      await finishClaim(f.peer, A, finishData(uncertainOwner, STOPPED, 'pre_handoff'));
    } finally {
      await direct.destroy();
    }
  } finally {
    trace.close();
    await f.close();
  }
});
