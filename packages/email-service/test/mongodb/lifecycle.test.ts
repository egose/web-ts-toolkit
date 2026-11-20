import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { mongo } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createEmailService, type EmailStore, type OwnerFence } from '../../src';
import { A, CALL } from '../conformance/store-fixtures';
import { lifecycleBatches } from '../lifecycle/batches';
import { lifecycleFences } from '../lifecycle/fences';
import { atBarrier, createLifecycle, readyQueue, SENDGRID_HOST, templates } from '../lifecycle/fixture';
import { lifecycleOutcomes } from '../lifecycle/outcomes';
import { lifecycleScopes } from '../lifecycle/scopes';
import { latch } from '../smtp/loopback';
import { createSmtpTlsFixture } from '../smtp/tls-fixture';
import {
  commandTrace,
  dbOf,
  fixture as mongoFixture,
  intercept,
  JOBS,
  replicaSet,
  waitForTime,
  withFailPoint,
} from './fixture';

let repl: MongoMemoryReplSet;
let tls: ReturnType<typeof createSmtpTlsFixture>;
let current: Awaited<ReturnType<typeof openLifecycle>> | undefined;

async function openLifecycle() {
  const queue = await mongoFixture(repl);
  return createLifecycle(await readyQueue({ ...queue, waitFor: (target) => waitForTime(queue.second, target) }), tls);
}

beforeAll(async () => {
  tls = createSmtpTlsFixture(SENDGRID_HOST);
  repl = await replicaSet(1);
});
beforeEach(async () => {
  current = await openLifecycle();
});
afterEach(async () => {
  const f = current;
  current = undefined;
  await f?.close();
});
afterAll(async () => {
  try {
    await repl?.stop();
  } finally {
    tls?.close();
  }
});

function fixture() {
  if (!current) throw new Error('Lifecycle fixture is not ready');
  return current;
}

lifecycleOutcomes(fixture);
lifecycleFences(fixture);
lifecycleBatches(fixture);
lifecycleScopes(fixture);

it.each([
  { outcome: 'replayed', conflicting: false, readFailures: 1 },
  { outcome: 'idempotency_conflict', conflicting: true, readFailures: 1 },
  { outcome: 'write_unconfirmed', conflicting: false, readFailures: 2 },
] as const)('reports $outcome after a real duplicate followed by $readFailures failed exact read(s)', async (test) => {
  const f = fixture();
  const s = await f.scenario('sendgrid');
  const { first, second, peer } = f.queue;
  expect(first.getClient()).not.toBe(second.getClient());
  const admin = second.getClient().db('admin');
  const winnerRegistry = templates();
  const competingService = createEmailService({ scope: A, store: peer, registry: winnerRegistry.registry });
  const winningCommand = test.conflicting ? { ...s.command, intent: { event: 'different-intent' } } : s.command;
  const trace = commandTrace(first);
  let winner: Awaited<ReturnType<typeof competingService.enqueue>> | undefined;
  let duplicate: unknown;
  const errors: unknown[] = [];
  const race = intercept(
    dbOf(first),
    (cmd) =>
      cmd.insert === JOBS ||
      (duplicate !== undefined &&
        errors.length < test.readFailures &&
        cmd.find === JOBS &&
        Object.hasOwn(cmd.filter, 'admissionKey')),
    async (send, cmd) => {
      if (cmd.insert === JOBS) {
        // Initial lookup and both adapter pre-checks missed. Let the other client insert before the real RPC.
        winner = await competingService.enqueue(winningCommand);
        const reply = await send();
        duplicate = reply;
        return reply;
      }
      return withFailPoint(
        admin,
        'failCommand',
        async () => {
          try {
            return await send();
          } catch (error) {
            errors.push(error);
            throw error;
          }
        },
        { mode: { times: 1 }, data: { failCommands: ['find'], errorCode: 11601 } },
      );
    },
  );
  try {
    const pending = s.service().enqueue(s.command);
    if (test.outcome === 'replayed') {
      const replay = await pending;
      expect(replay).toEqual({ status: 'replayed', job: winner?.job });
    } else {
      await expect(pending).rejects.toMatchObject({ code: test.outcome });
    }
    expect(winner?.status).toBe('enqueued');
    expect(duplicate).toMatchObject({ ok: 1, n: 0, writeErrors: [{ code: 11000 }] });
    expect(errors).toHaveLength(test.readFailures);
    for (const error of errors) expect(error).toMatchObject({ name: 'MongoServerError', code: 11601 });
    expect(trace.commands.map(({ commandName }) => commandName)).toEqual([
      'find',
      'find',
      'find',
      'insert',
      'find',
      'find',
    ]);
    const exact = trace.commands[0]!.command.filter;
    for (const i of [0, 1, 4, 5]) {
      expect(trace.commands[i]!.command).toMatchObject({ filter: exact, readConcern: { level: 'linearizable' } });
    }
    expect(await f.job(winner!.job.jobId)).toEqual(winner!.job);
    expect(await competingService.enqueue(winningCommand)).toEqual({ status: 'replayed', job: winner!.job });
    expect(await dbOf(second).collection(JOBS).countDocuments()).toBe(1);
    expect(s.prepare).toHaveBeenCalledOnce();
    expect(winnerRegistry.prepare).toHaveBeenCalledOnce();
    s.wire.assertCount(0);
  } finally {
    race.mockRestore();
    trace.close();
  }
});

it('does not submit after MongoDB interrupts an actual in-flight worker marker CAS', async () => {
  const f = fixture();
  const s = await f.scenario('smtp');
  const { first, second, primary, peer } = f.queue;
  const { job } = await s.service().enqueue(s.command);
  const admin = second.getClient().db('admin');
  const beforeMarker = latch<OwnerFence>();
  const letMarkerRun = latch<void>();
  const finish = vi.fn(primary.finish);
  const markHandoff = vi.fn<EmailStore['markHandoff']>(async (...args) => {
    beforeMarker.release(args[1]);
    await letMarkerRun.reached;
    return primary.markHandoff(...args);
  });
  const failures: unknown[] = [];
  const client = first.getClient();
  function failed(event: mongo.CommandFailedEvent) {
    if (event.commandName === 'findAndModify') failures.push(event.failure);
  }
  client.on('commandFailed', failed);
  const pending = s
    .worker({ store: { ...primary, markHandoff, finish }, limits: { storeTimeoutMs: 3_000 } })
    .run({ limit: 1, maintenanceLimit: 0 });
  const failpoint = 'hangBeforeFindAndModifyPerformsUpdate';
  try {
    const { attemptId } = await atBarrier(beforeMarker.reached, 'worker waiting to enter Mongo marker CAS');
    await withFailPoint(admin, failpoint, async (entered) => {
      letMarkerRun.release();
      try {
        await entered();
        const commands = await admin
          .aggregate(
            [
              { $currentOp: { allUsers: true } },
              { $match: { 'command.findAndModify': JOBS, 'command.query.jobId': job.jobId } },
            ],
            { maxTimeMS: 1_000 },
          )
          .toArray();
        expect(commands).toHaveLength(1);
        s.wire.assertCount(0);
        await admin.command({ killOp: 1, op: commands[0]!.opid, maxTimeMS: 1_000 });
      } finally {
        // Let the server reach its interrupt point before awaiting the driver reply.
        await admin.command({ configureFailPoint: failpoint, mode: 'off' });
      }
      expect(await pending).toMatchObject({
        stop: 'store_error',
        items: [{ jobId: job.jobId, attemptId, status: 'unconfirmed', providerInvoked: false }],
        counts: { providerCalls: 0, persistenceFailures: 1, unconfirmed: 1 },
      });
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ code: 11601 });
    expect(markHandoff).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
    expect(await f.job(job.jobId)).toMatchObject({ state: 'leased', phase: 'pre_handoff', attemptCount: 1 });
    expect(await f.attempt(job.jobId, attemptId)).toBeNull();
    expect(await peer.cancel(A, job.jobId, CALL)).toMatchObject({ status: 'cancelled' });
    expect(await f.attempt(job.jobId, attemptId)).toMatchObject({
      disposition: 'cancelled',
      result: { outcome: 'unsubmitted', reason: 'cancelled' },
    });
    expect((await s.worker({ store: peer }).run()).items).toEqual([]);
    s.wire.assertCount(0);
  } finally {
    client.off('commandFailed', failed);
    letMarkerRun.release();
    await pending;
  }
});
