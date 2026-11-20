import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createMongooseEmailStore } from '../../src/mongoose';
import {
  A,
  accepted,
  admission,
  applied,
  B,
  CALL,
  claim,
  claimData,
  finishData,
  insert,
  LEASE,
  LIVE_LEASE,
  STOPPED,
} from '../conformance/store-fixtures';
import {
  ACTIVITIES,
  commandTrace,
  connect,
  dbOf,
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

it('distinguishes a stopped admission from an injected commit with lost ACK at the driver boundary', async () => {
  const stopped = new AbortController();
  stopped.abort();
  const input = admission(A, await f.now());
  const trace = commandTrace(f.first);
  try {
    await expect(f.primary.insert(A, input, { ...CALL, signal: stopped.signal })).rejects.toMatchObject({
      code: 'aborted',
    });
    expect(trace.commands).toHaveLength(0);
    expect(await f.peer.findAdmission(A, input.command.key, CALL)).toBeNull();
    const cut = intercept(
      dbOf(f.first),
      (cmd) => cmd.insert === JOBS,
      async (send) => {
        await send();
        throw new Error('test only: lost insert ACK');
      },
    );
    try {
      await expect(f.primary.insert(A, input, CALL)).rejects.toMatchObject({ code: 'write_unconfirmed' });
    } finally {
      cut.mockRestore();
    }
    expect(trace.commands.filter(({ commandName }) => commandName === 'insert')).toHaveLength(1);
    const winner = await f.peer.findAdmission(A, input.command.key, CALL);
    expect(winner).toMatchObject({
      fingerprint: input.command.fingerprint,
      job: { jobId: input.jobId, attemptCount: 0 },
    });
    expect(await f.peer.insert(A, input, CALL)).toEqual({ status: 'duplicate' });
    expect(await dbOf(f.second).collection(JOBS).countDocuments()).toBe(1);
  } finally {
    trace.close();
  }
});

it.each([
  { collision: 'admission', fail: 'admissionKey', expected: 'write_unconfirmed' },
  { collision: 'jobId', fail: 'jobId', expected: 'write_unconfirmed' },
  { collision: 'jobId', fail: null, expected: 'invalid_command' },
  { collision: 'admission', fail: null, expected: 'duplicate' },
] as const)('confirms a wire duplicate ($collision, failed read: $fail) as $expected', async (test) => {
  const now = await f.now();
  const candidate = admission(A, now);
  const winner = admission(
    A,
    now,
    test.collision === 'admission'
      ? { key: candidate.command.key }
      : { jobId: candidate.jobId, key: { kind: 'single', idempotencyKey: 'unrelated' } },
  );
  const admin = f.second.getClient().db('admin');
  const trace = commandTrace(f.first);
  let reply: unknown;
  let readError: unknown;
  const racingInsert = intercept(
    dbOf(f.first),
    (cmd) =>
      cmd.insert === JOBS ||
      (reply !== undefined && test.fail !== null && cmd.find === JOBS && Object.hasOwn(cmd.filter, test.fail)),
    async (send, cmd) => {
      if (cmd.insert === JOBS) {
        // Both optimistic lookups have already missed. A different client wins before the real insert RPC.
        await insert(f.peer, winner);
        const duplicate = await send();
        reply = duplicate;
        return duplicate;
      }
      return withFailPoint(
        admin,
        'failCommand',
        async () => {
          try {
            return await send();
          } catch (error) {
            readError = error;
            throw error;
          }
        },
        { mode: { times: 1 }, data: { failCommands: ['find'], errorCode: 11601 } },
      );
    },
  );
  try {
    const attempt = f.primary.insert(A, candidate, CALL);
    if (test.expected === 'duplicate') await expect(attempt).resolves.toEqual({ status: 'duplicate' });
    else await expect(attempt).rejects.toMatchObject({ code: test.expected });
    expect(reply).toMatchObject({ ok: 1, n: 0, writeErrors: [{ code: 11000 }] });
    if (test.fail !== null) expect(readError).toMatchObject({ name: 'MongoServerError', code: 11601 });
    expect(trace.commands.map(({ commandName }) => commandName)).toEqual([
      'find',
      'find',
      'insert',
      'find',
      ...(test.collision === 'jobId' ? ['find'] : []),
    ]);
    const confirmed = await f.peer.findAdmission(A, winner.command.key, CALL);
    expect(confirmed).toMatchObject({ job: { jobId: winner.jobId, attemptCount: 0 } });
    expect(await f.peer.findAdmission(A, candidate.command.key, CALL)).toEqual(
      test.collision === 'admission' ? confirmed : null,
    );
    expect(await dbOf(f.second).collection(JOBS).countDocuments()).toBe(1);
  } finally {
    racingInsert.mockRestore();
    trace.close();
  }
});

it('keeps a failed pre-insert read definite and never dispatches the insert', async () => {
  const candidate = admission(A, await f.now());
  const trace = commandTrace(f.first);
  try {
    await withFailPoint(
      f.second.getClient().db('admin'),
      'failCommand',
      async () => {
        await expect(f.primary.insert(A, candidate, CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
      },
      { mode: { times: 1 }, data: { failCommands: ['find'], errorCode: 11601 } },
    );
    expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['find']);
    expect(await f.peer.findAdmission(A, candidate.command.key, CALL)).toBeNull();
  } finally {
    trace.close();
  }
});

it('lets real server-time CAS reject a marker delayed past expiry, without advancing the lease', async () => {
  const now = await f.now();
  const expiresAt = now + 2_500;
  const job = await insert(f.primary, admission(A, now, { expiresAt, retry: { maxAttempts: 1 } }));
  const owned = await claim(f.peer, A, claimData(LEASE));
  const raw = await dbOf(f.second).collection(JOBS).findOne({ scope: A, jobId: job.jobId });
  const hook = intercept(
    dbOf(f.first),
    (cmd) => cmd.findAndModify === JOBS,
    async (send) => {
      expect(await f.now()).toBeLessThan(expiresAt);
      await waitForTime(f.second, expiresAt);
      return send();
    },
  );
  try {
    expect(await f.primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL)).toBeNull();
    expect(hook).toHaveBeenCalled();
  } finally {
    hook.mockRestore();
  }
  expect(await dbOf(f.second).collection(JOBS).findOne({ scope: A, jobId: job.jobId })).toEqual(raw);
  expect(await f.primary.renew(A, owned.fence, LEASE, CALL)).toBeNull();
  await waitForTime(f.second, owned.lease.leaseEndsAt);
  expect(applied(await f.peer.recoverNext(A, CALL))).toMatchObject({
    disposition: 'expired',
    result: { outcome: 'unsubmitted', reason: 'pre_handoff_lease_expired' },
  });
  expect(await f.primary.findAttempt(A, job.jobId, owned.fence.attemptId, CALL)).not.toHaveProperty('handedOffAt');
});

it.each(['claim', 'renew', 'handoff', 'finish'] as const)(
  'preserves uncertainty at the driver boundary for a committed %s with injected ACK loss',
  async (phase) => {
    const { primary, peer, first } = f;
    const row = await insert(primary, admission(A, await f.now(), { retry: { maxAttempts: 1 } }));
    const data = claimData(phase === 'claim' ? LEASE : LIVE_LEASE);
    const owned = phase === 'claim' ? undefined : await claim(peer, A, data);
    if (phase === 'finish') await peer.markHandoff(A, owned!.fence, LIVE_LEASE, CALL);
    const finish = owned && finishData(owned, accepted(data.attemptId));
    let wire: { leaseEndsAt?: number } | undefined;
    const cut = intercept(
      dbOf(first),
      (cmd) => cmd.findAndModify === JOBS,
      async (send, cmd) => {
        wire = cmd.update[0].$replaceWith.$literal;
        await send(); // This injection does not simulate wire loss or disconnect the replica set.
        throw new Error('test only: lost driver response with private content');
      },
    );
    try {
      const run = () => {
        switch (phase) {
          case 'claim':
            return primary.claimNext(A, data, CALL);
          case 'renew':
            return primary.renew(A, owned!.fence, LIVE_LEASE + 1, CALL);
          case 'handoff':
            return primary.markHandoff(A, owned!.fence, LEASE, CALL);
          case 'finish':
            return primary.finish(A, finish!, CALL);
        }
      };
      await expect(run()).rejects.toMatchObject({
        code: 'write_unconfirmed',
        message: 'Email store write not confirmed; it may have committed.',
      });
      expect(cut).toHaveBeenCalled();
    } finally {
      cut.mockRestore();
    }
    const visible = await peer.findJob(A, row.jobId, CALL);
    expect(visible?.attemptCount).toBe(1);
    expect(await peer.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
    if (phase === 'finish') {
      expect(visible).toMatchObject({ disposition: 'accepted' });
      const exact = await peer.findAttempt(A, row.jobId, data.attemptId, CALL);
      expect(exact).toMatchObject({ operationId: finish?.operationId });
      expect(await primary.finish(A, finish!, CALL)).toEqual(exact);
    } else {
      expect(visible).toMatchObject({ phase: phase === 'handoff' ? 'handed_off' : 'pre_handoff' });
      expect(await peer.findAttempt(A, row.jobId, data.attemptId, CALL)).toBeNull();
      if (phase === 'claim' || phase === 'handoff') {
        await waitForTime(f.second, wire?.leaseEndsAt ?? Infinity);
        const recovered = applied(await peer.recoverNext(A, CALL));
        expect(recovered.result.outcome).toBe(phase === 'claim' ? 'unsubmitted' : 'unknown');
        expect(await peer.claimNext(A, claimData(), CALL)).toEqual({ status: 'none' });
      }
    }
  },
);

it('does not reinvoke an unconfirmed projection write; exact peer proof can ACK the committed result', async () => {
  const row = await insert(f.primary, admission(A, await f.now()));
  const owned = await claim(f.peer, A);
  await f.primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
  await f.peer.finish(A, finishData(owned, accepted(owned.fence.attemptId)), CALL);
  const permit = applied(await f.primary.reserveProjection(A, CALL));
  let writes = 0;
  const hook = intercept(
    dbOf(f.first),
    (cmd) => cmd.findAndModify === ACTIVITIES,
    async (send) => {
      writes++;
      await send();
      throw new Error('test only: lost projection ACK');
    },
  );
  try {
    await expect(f.primary.putActivity(A, permit, CALL)).rejects.toMatchObject({ code: 'write_unconfirmed' });
    expect(writes).toBe(1);
  } finally {
    hook.mockRestore();
  }
  expect(await f.peer.listActivities(A, {}, CALL)).toEqual({ items: [permit.activity] });
  expect(await f.peer.ackProjection(A, permit, CALL)).toBe('acknowledged');
  expect(await f.peer.findJob(A, row.jobId, CALL)).toMatchObject({ disposition: 'accepted', attemptCount: 1 });
});

it('uses driver abort on the actual in-flight socket and leaves the caller client usable', async () => {
  const input = admission(A, await f.now());
  const row = await insert(f.primary, input);
  const owned = await claim(f.peer, A);
  const admin = f.second.getClient().db('admin');
  const controller = new AbortController();
  const client = f.first.getClient();
  const failed: string[] = [];
  const closed: string[] = [];
  const off = () => {
    client.off('commandFailed', failure).off('connectionClosed', socket);
  };
  const failure = (event: { commandName: string }) => {
    failed.push(event.commandName);
  };
  const socket = (event: { reason: string }) => {
    closed.push(event.reason);
  };
  client.on('commandFailed', failure).on('connectionClosed', socket);
  try {
    await withFailPoint(admin, 'hangBeforeFindAndModifyPerformsUpdate', async (entered) => {
      const marking = expect(
        f.primary.markHandoff(A, owned.fence, LIVE_LEASE, {
          signal: controller.signal,
          timeoutMs: 5_000,
        }),
      ).rejects.toMatchObject({ code: 'write_unconfirmed' });
      await entered();
      controller.abort(new Error('unsanitized caller error must not escape'));
      await marking;
      expect(failed).toContain('findAndModify');
      expect(closed).toContain('error');
    });
    // Abort does not prove no commit, even here. Observe and fix the job via a new exact read.
    const visible = await f.primary.findJob(A, row.jobId, CALL);
    expect(visible).toMatchObject({ attemptCount: 1 });
    expect(await f.peer.findAttempt(B, row.jobId, owned.fence.attemptId, CALL)).toBeNull();
  } finally {
    off();
  }
});

it('retains bounded slots through driver checkout and aborts a queued operation without sending it', async () => {
  const one = await connect(f.uri, { maxPoolSize: 1 });
  const store = createMongooseEmailStore(one);
  const admin = f.second.getClient().db('admin');
  const trace = commandTrace(one);
  const controller = new AbortController();
  try {
    await store.ready();
    const row = await insert(f.primary, admission(A, await f.now()));
    await withFailPoint(admin, 'hangBeforeLinearizableReadConcern', async (entered) => {
      const leader = store.findJob(A, row.jobId, { signal: controller.signal, timeoutMs: 5_000 });
      const leadResult = expect(leader).rejects.toMatchObject({ code: 'aborted' });
      try {
        await entered();
        const before = trace.commands.length;
        const followers = Array.from({ length: 31 }, () =>
          expect(store.findJob(A, row.jobId, { signal: controller.signal, timeoutMs: 5_000 })).rejects.toMatchObject({
            code: 'aborted',
          }),
        );
        await expect(store.findJob(A, row.jobId, CALL)).rejects.toMatchObject({ code: 'busy' });
        await expect(store.findJob(A, row.jobId, { ...CALL, timeoutMs: 25 })).rejects.toMatchObject({ code: 'busy' });
        expect(trace.commands).toHaveLength(before);
        controller.abort();
        await Promise.all(followers);
        expect(trace.commands).toHaveLength(before);
      } finally {
        controller.abort();
        await leadResult;
      }
    });
    expect(await store.findJob(A, row.jobId, CALL)).toMatchObject({ jobId: row.jobId });
  } finally {
    trace.close();
    await one.destroy();
  }
});

it('reports real interrupted CAS separately from lost-ACK injection and lets only a fresh action make progress', async () => {
  const row = await insert(f.primary, admission(A, await f.now()));
  const owned = await claim(f.peer, A);
  const admin = f.second.getClient().db('admin');
  await withFailPoint(admin, 'hangBeforeFindAndModifyPerformsUpdate', async (entered) => {
    const pending = expect(f.primary.markHandoff(A, owned.fence, LEASE, CALL)).rejects.toMatchObject({
      code: 'write_unconfirmed',
    });
    await entered();
    const ops = await admin
      .aggregate(
        [
          { $currentOp: { allUsers: true } },
          { $match: { 'command.findAndModify': JOBS, 'command.query.jobId': row.jobId } },
        ],
        { maxTimeMS: 1_000 },
      )
      .toArray();
    expect(ops).toHaveLength(1);
    await admin.command({ killOp: 1, op: ops[0]!.opid, maxTimeMS: 1_000 });
    // The failpoint is disabled in the helper's finally. Some server waits only
    // observe interruption at the next interrupt point.
    await admin.command({ configureFailPoint: 'hangBeforeFindAndModifyPerformsUpdate', mode: 'off' });
    await pending;
  });
  expect(await f.peer.findJob(A, row.jobId, CALL)).toMatchObject({ phase: 'pre_handoff', attemptCount: 1 });
  expect(await f.primary.finish(A, finishData(owned, STOPPED, 'pre_handoff'), CALL)).toMatchObject({
    disposition: 'retry_scheduled',
  });
});
