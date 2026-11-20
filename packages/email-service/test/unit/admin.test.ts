import { describe, expect, it, vi } from 'vitest';
import {
  createEmailAdmin,
  createMemoryEmailStore,
  type EmailActivityQuery,
  type EmailAdminOptions,
  type EmailStore,
  type ProjectionPermit,
  type ResolveUnknownCommand,
} from '../../src';
import { PROJECTION_DRAIN_MS } from '../../src/constants';
import { registerAdminConformance } from '../conformance/admin-suite';
import {
  A,
  AMBIGUOUS,
  B,
  CALL,
  DAY,
  LIVE_LEASE,
  accepted,
  admission,
  applied,
  claim,
  finishClaim,
  finishData,
  fixtureId,
  insert,
} from '../conformance/store-fixtures';
import { ManualClock, NOW, deferred } from './template-fixtures';

function fixture() {
  const clock = new ManualClock();
  const primary = createMemoryEmailStore({ clock });
  return { primary, peer: primary, clock, now: () => clock.wall };
}

registerAdminConformance('memory', fixture);

async function record(
  f: ReturnType<typeof fixture>,
  unknown = false,
  retention = { payloadMs: 0, historyMs: DAY, idempotencyMs: DAY },
) {
  const { primary, clock } = f;
  const value = admission(A, clock.wall, { retention });
  await insert(primary, value);
  const owned = await claim(primary, A);
  await primary.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
  const { attemptId } = owned.fence;
  await finishClaim(primary, A, finishData(owned, unknown ? AMBIGUOUS : accepted(attemptId)));
  return { value, jobId: value.jobId, attemptId };
}

describe('public admin input and output boundaries', () => {
  it('validates the scope, store methods and observer without starting work or calling accessors', () => {
    const store = createMemoryEmailStore();
    const ready = vi.fn(store.ready);
    const options = { scope: A, store: { ...store, ready } };
    const trap = vi.fn(() => store.findJob);
    for (const bad of [
      { ...options, scope: '$unsafe' },
      { ...options, onActivity: {} },
      { ...options, store: { ...store, cleanupNext: undefined } },
      { ...options, store: Object.defineProperty({ ...store }, 'findJob', { get: trap, enumerable: true }) },
      Object.defineProperty({ ...options }, 'onActivity', { get: trap, enumerable: true }),
    ]) {
      expect(() => createEmailAdmin(bad as EmailAdminOptions)).toThrow(
        expect.objectContaining({ code: 'invalid_config' }),
      );
    }
    expect(Object.isFrozen(createEmailAdmin(options))).toBe(true);
    expect(ready).not.toHaveBeenCalled();
    expect(trap).not.toHaveBeenCalled();
  });

  it('rejects invalid selectors, cursors, IDs, actions and limits before any store dispatch', async () => {
    const f = fixture();
    const listActivities = vi.fn(f.primary.listActivities);
    const findJob = vi.fn(f.primary.findJob);
    const cancel = vi.fn(f.primary.cancel);
    const resolveUnknown = vi.fn(f.primary.resolveUnknown);
    const cleanupNext = vi.fn(f.primary.cleanupNext);
    const reserveProjection = vi.fn(f.primary.reserveProjection);
    const store = { ...f.primary, listActivities, findJob, cancel, resolveUnknown, cleanupNext, reserveProjection };
    const admin = createEmailAdmin({ scope: A, store });
    const trap = vi.fn(() => 1);
    for (const query of [
      { $where: 'private string' },
      { jobId: { $ne: null } },
      { jobId: undefined },
      { from: -1 },
      { from: 2, before: 1 },
      { limit: 0 },
      { limit: 101 },
      { limit: 2.5 },
      Object.defineProperty({}, 'limit', { get: trap, enumerable: true }),
    ]) {
      await expect(admin.listActivities(query as EmailActivityQuery)).rejects.toMatchObject({
        code: 'invalid_command',
      });
    }
    for (const cursor of ['not-json', 'a'.repeat(513), 'e30=', 1]) {
      await expect(admin.listActivities({ cursor } as EmailActivityQuery)).rejects.toMatchObject({
        code: 'invalid_cursor',
      });
    }
    await expect(admin.getJob('bad-id')).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(admin.cancel('bad-id')).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(
      admin.resolveUnknown({
        jobId: fixtureId(1),
        attemptId: fixtureId(2),
        action: 'redrive',
        acknowledgeDuplicateRisk: false,
      } as unknown as ResolveUnknownCommand),
    ).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(admin.reconcile({ limit: 101 })).rejects.toMatchObject({ code: 'invalid_config' });
    await expect(admin.cleanup({ limit: 0 })).rejects.toMatchObject({ code: 'invalid_config' });
    await expect(admin.listActivities({}, { timeoutMs: 49 })).rejects.toMatchObject({ code: 'invalid_config' });
    for (const run of [trap, listActivities, findJob, cancel, resolveUnknown, cleanupNext, reserveProjection]) {
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('fails closed on excess, leaking, wrong-scope, unordered, or mismatched store pages', async () => {
    const f = fixture();
    await record(f);
    await record(f);
    const admin = createEmailAdmin({ scope: A, store: f.primary });
    await admin.reconcile();
    const page = await admin.listActivities({ limit: 1 });
    const all = (await admin.listActivities()).items;
    const first = all[0]!;
    const second = all[1]!;
    const listActivities = vi.fn<EmailStore['listActivities']>();
    const boundary = createEmailAdmin({ scope: A, store: { ...f.primary, listActivities } });
    const trap = vi.fn(() => page.nextCursor);
    for (const [value, limit] of [
      [{ items: [first, second] }, 1],
      [{ items: [second, first] }, 2],
      [{ items: [{ ...first, snapshot: 'private payload' }] }, 1],
      [{ items: [{ ...first, scope: B }] }, 1],
      [{ items: [second], nextCursor: page.nextCursor }, 1],
      [{ items: [first], nextCursor: page.nextCursor }, 2],
      [Object.defineProperty({ items: [first] }, 'nextCursor', { get: trap, enumerable: true }), 1],
    ] as const) {
      listActivities.mockResolvedValueOnce(value as Awaited<ReturnType<EmailStore['listActivities']>>);
      await expect(boundary.listActivities({ limit })).rejects.toMatchObject({ code: 'store_incompatible' });
    }
    expect(trap).not.toHaveBeenCalled();
    listActivities.mockResolvedValueOnce(page);
    const decoded = await boundary.listActivities({ limit: 1 });
    expect(decoded).toEqual(page);
    expect(decoded.items[0]).not.toBe(first);
    expect(Object.isFrozen(decoded.items)).toBe(true);
    expect(Object.isFrozen(decoded.items[0]?.result)).toBe(true);
  });

  it('keeps malformed mutation evidence unconfirmed and never forwards store errors or unredacted job fields', async () => {
    const f = fixture();
    const queued = await insert(f.primary, admission(A, NOW));
    const leaked = { ...queued, snapshot: 'private fixture' };
    const findJob = vi
      .fn(f.primary.findJob)
      .mockResolvedValueOnce(leaked)
      .mockRejectedValueOnce(new Error('private fixture'));
    const cancel = vi.fn<EmailStore['cancel']>(async (...args) => {
      const confirmed = await f.primary.cancel(...args);
      return { ...confirmed, raw: 'private fixture' };
    });
    const admin = createEmailAdmin({ scope: A, store: { ...f.primary, findJob, cancel } });
    await expect(admin.getJob(queued.jobId)).rejects.toMatchObject({ code: 'store_incompatible' });
    const error: unknown = await admin.getJob(queued.jobId).catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: 'store_unavailable',
      message: 'Email store is unavailable.',
    });
    expect(error).not.toHaveProperty('cause');
    await expect(admin.cancel(queued.jobId)).rejects.toMatchObject({ code: 'write_unconfirmed' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(await admin.getJob(queued.jobId)).toMatchObject({ disposition: 'cancelled' });
  });
});

describe('bounded admin maintenance', () => {
  it('holds just one unresolved observer across sweeps and drops later events instead of retrying', async () => {
    const f = fixture();
    const pending = deferred<void>();
    const onActivity = vi.fn<NonNullable<EmailAdminOptions['onActivity']>>().mockReturnValueOnce(pending.promise);
    const admin = createEmailAdmin({ scope: A, store: f.primary, onActivity });
    const first = await record(f);
    f.clock.wall++;
    const second = await record(f);
    expect(await admin.reconcile({ limit: 1 })).toMatchObject({
      stop: 'limit',
      acknowledged: 1,
      observerStarted: 1,
      observerSkipped: 0,
    });
    expect(await admin.reconcile()).toMatchObject({
      stop: 'idle',
      acknowledged: 1,
      observerStarted: 0,
      observerSkipped: 1,
    });
    expect((await admin.listActivities()).items.map(({ jobId }) => jobId)).toEqual([second.jobId, first.jobId]);
    pending.reject(new Error('fixture-private observer rejection'));
    await pending.promise.catch(() => {});
    expect(await admin.reconcile()).toMatchObject({ reserved: 0, observerStarted: 0, observerSkipped: 0 });
    const third = await record(f);
    expect(await admin.reconcile()).toMatchObject({ acknowledged: 1, observerStarted: 1, observerSkipped: 0 });
    expect(onActivity.mock.calls.map(([{ jobId }]) => jobId)).toEqual([first.jobId, third.jobId]);
  });

  it('caps the number of sequential reservations and cleanup steps and validates finite page defaults', async () => {
    const f = fixture();
    await record(f);
    const permit = applied(await f.primary.reserveProjection(A, CALL));
    const reserveProjection = vi
      .fn<EmailStore['reserveProjection']>()
      .mockResolvedValue({ status: 'applied', value: permit });
    const putActivity = vi.fn<EmailStore['putActivity']>().mockResolvedValue('present');
    const ackProjection = vi.fn<EmailStore['ackProjection']>().mockResolvedValue('already_acknowledged');
    const cleanupNext = vi.fn<EmailStore['cleanupNext']>().mockResolvedValue({ status: 'applied', value: 'purged' });
    const listActivities = vi.fn(f.primary.listActivities);
    const admin = createEmailAdmin({
      scope: A,
      store: { ...f.primary, reserveProjection, putActivity, ackProjection, cleanupNext, listActivities },
    });
    expect(await admin.reconcile()).toMatchObject({
      stop: 'limit',
      reserved: 20,
      acknowledged: 20,
      observerStarted: 0,
      observerSkipped: 0,
    });
    for (const run of [reserveProjection, putActivity, ackProjection]) expect(run).toHaveBeenCalledTimes(20);
    for (let i = 0; i < 20; i++) {
      expect(reserveProjection.mock.invocationCallOrder[i]).toBeLessThan(putActivity.mock.invocationCallOrder[i]!);
      expect(putActivity.mock.invocationCallOrder[i]).toBeLessThan(ackProjection.mock.invocationCallOrder[i]!);
      if (i < 19) {
        expect(ackProjection.mock.invocationCallOrder[i]).toBeLessThan(
          reserveProjection.mock.invocationCallOrder[i + 1]!,
        );
      }
    }
    expect(await admin.cleanup()).toMatchObject({ stop: 'limit', jobsPurged: 20 });
    expect(await admin.cleanup({ limit: 100 })).toMatchObject({ stop: 'limit', jobsPurged: 100 });
    expect(cleanupNext).toHaveBeenCalledTimes(120);
    expect(await admin.listActivities()).toEqual({ items: [] });
    expect(listActivities.mock.calls[0]?.[1]).toEqual({ limit: 25 });
  });

  it('stops on definite contention or stale ACK without counting failure or advancing to another reservation', async () => {
    const f = fixture();
    await record(f);
    const reserveProjection = vi.fn(f.primary.reserveProjection).mockResolvedValueOnce({ status: 'contended' });
    const ackProjection = vi.fn(f.primary.ackProjection).mockResolvedValueOnce('stale');
    const cleanupNext = vi.fn(f.primary.cleanupNext).mockResolvedValueOnce({ status: 'contended' });
    const admin = createEmailAdmin({
      scope: A,
      store: { ...f.primary, reserveProjection, ackProjection, cleanupNext },
    });
    expect(await admin.reconcile()).toMatchObject({
      stop: 'contended',
      reserved: 0,
      acknowledged: 0,
      persistenceFailures: 0,
    });
    expect(await admin.reconcile()).toMatchObject({
      stop: 'contended',
      reserved: 1,
      acknowledged: 0,
      persistenceFailures: 0,
    });
    expect(reserveProjection).toHaveBeenCalledTimes(2);
    expect(ackProjection).toHaveBeenCalledTimes(1);
    expect(await admin.cleanup()).toMatchObject({ stop: 'contended', jobsPurged: 0, persistenceFailures: 0 });
    expect(await admin.reconcile()).toMatchObject({ stop: 'idle', acknowledged: 1 });
  });

  it('counts only a confirmed expired put, holds pending payloads, and respects the exact projection drain', async () => {
    const f = fixture();
    const { primary, clock } = f;
    const { value, jobId } = await record(f);
    const admin = createEmailAdmin({ scope: A, store: primary });
    clock.wall += DAY;
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0, jobsPurged: 0 });
    const putActivity: EmailStore['putActivity'] = (...args) => {
      clock.wall = args[1].permitUntil; // Half-open write permit enforced by the real memory store.
      return primary.putActivity(...args);
    };
    const expiring = createEmailAdmin({ scope: A, store: { ...primary, putActivity } });
    expect(await expiring.reconcile({ limit: 1 })).toMatchObject({
      stop: 'limit',
      reserved: 1,
      acknowledged: 0,
      permitsExpired: 1,
      persistenceFailures: 0,
    });
    expect(await admin.listActivities()).toEqual({ items: [] });
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
    let permit: ProjectionPermit | undefined;
    const reserveProjection: EmailStore['reserveProjection'] = async (...args) => {
      const next = await primary.reserveProjection(...args);
      permit = applied(next);
      return next;
    };
    const next = createEmailAdmin({ scope: A, store: { ...primary, reserveProjection } });
    expect(await next.reconcile({ limit: 1 })).toMatchObject({ stop: 'limit', acknowledged: 1, permitsExpired: 0 });
    if (!permit) throw new Error('Expected a confirmed projection permit');
    expect(await admin.cleanup({ limit: 1 })).toMatchObject({ stop: 'limit', payloadsPruned: 1 });
    clock.wall = permit.permitUntil + PROJECTION_DRAIN_MS - 1;
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', retirementsStarted: 0, jobsPurged: 0 });
    clock.wall++;
    expect(await admin.cleanup({ limit: 1 })).toMatchObject({ stop: 'limit', retirementsStarted: 1, jobsPurged: 0 });
    expect(await primary.insert(A, value, CALL)).toEqual({ status: 'duplicate' });
    expect(await admin.listActivities()).toEqual({ items: [permit.activity] });
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', retirementsStarted: 0, jobsPurged: 1 });
    expect(await admin.getJob(jobId)).toBeNull();
    expect(await primary.putActivity(A, permit, CALL)).toBe('permit_expired');
    expect(await admin.listActivities()).toEqual({ items: [] });
    expect(await primary.findAdmission(A, value.command.key, CALL)).toBeNull();
  });

  it('holds unresolved outcomes and starts the payload, history and replay windows at dismissal', async () => {
    const f = fixture();
    const { primary, clock } = f;
    const { value, jobId, attemptId } = await record(f, true, {
      payloadMs: 10,
      historyMs: DAY,
      idempotencyMs: 2 * DAY,
    });
    const admin = createEmailAdmin({ scope: A, store: primary });
    await admin.reconcile();
    const saved = await admin.listActivities({ jobId });
    const dismissAt = NOW + 3 * DAY;
    clock.wall = dismissAt;
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0, jobsPurged: 0 });
    await expect(
      admin.resolveUnknown({ jobId, attemptId, action: 'redrive', acknowledgeDuplicateRisk: true }),
    ).rejects.toMatchObject({ code: 'expired' });
    await admin.resolveUnknown({ jobId, attemptId, action: 'dismiss' });
    clock.wall = dismissAt + 9;
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 0 });
    clock.wall++;
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', payloadsPruned: 1 });
    clock.wall = dismissAt + 2 * DAY - 1;
    expect(await admin.cleanup()).toMatchObject({ stop: 'idle', retirementsStarted: 0 });
    expect(await primary.insert(A, value, CALL)).toEqual({ status: 'duplicate' });
    expect(await admin.listActivities({ jobId })).toEqual(saved);
    expect(await admin.getJob(jobId)).toMatchObject({ disposition: 'unknown', terminalAt: NOW, unknownOpen: false });
    clock.wall++;
    expect(await admin.cleanup({ limit: 2 })).toMatchObject({ stop: 'limit', retirementsStarted: 1, jobsPurged: 1 });
    expect(await admin.listActivities()).toEqual({ items: [] });
    expect(await primary.findAdmission(A, value.command.key, CALL)).toBeNull();
  });
});
