import { getEventListeners } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryEmailStore, type EmailStore } from '../../src';
import { createEmailAdminWithClock } from '../../src/admin';
import {
  A,
  CALL,
  LIVE_LEASE,
  accepted,
  admission,
  claim,
  finishClaim,
  finishData,
  insert,
} from '../conformance/store-fixtures';
import { ManualClock, NOW, deferred } from './template-fixtures';

async function fixture() {
  const clock = new ManualClock();
  const store = createMemoryEmailStore({ clock });
  const { jobId } = await insert(store, admission(A, NOW));
  const owned = await claim(store, A);
  await store.markHandoff(A, owned.fence, LIVE_LEASE, CALL);
  await finishClaim(store, A, finishData(owned, accepted(owned.fence.attemptId)));
  return { clock, store, jobId };
}

describe('admin elapsed budgets and mutation uncertainty', () => {
  it('does not dispatch an already aborted call; the caller reason never escapes', async () => {
    const { clock, store, jobId } = await fixture();
    const findJob = vi.fn(store.findJob);
    const cancel = vi.fn(store.cancel);
    const reserveProjection = vi.fn(store.reserveProjection);
    const cleanupNext = vi.fn(store.cleanupNext);
    const admin = createEmailAdminWithClock(
      { scope: A, store: { ...store, findJob, cancel, reserveProjection, cleanupNext } },
      clock,
    );
    const signal = AbortSignal.abort(new Error('fixture private reason'));
    const shadow = vi.fn(() => {
      throw new Error('fixture private signal property');
    });
    Object.defineProperty(signal, 'aborted', { get: shadow });
    const error: unknown = await admin.getJob(jobId, { signal }).catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: 'aborted',
      message: 'Email operation was aborted.',
    });
    expect(error).not.toHaveProperty('cause');
    await expect(admin.cancel(jobId, { signal })).rejects.toMatchObject({ code: 'aborted' });
    expect(await admin.reconcile({ signal })).toMatchObject({ stop: 'aborted', reserved: 0, persistenceFailures: 0 });
    expect(await admin.cleanup({ signal })).toMatchObject({ stop: 'aborted', jobsPurged: 0, persistenceFailures: 0 });
    for (const operation of [findJob, cancel, reserveProjection, cleanupNext]) expect(operation).not.toHaveBeenCalled();
    expect(shadow).not.toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);
  });

  it('shares one monotonic budget through reserve, put and ACK, below the public override floor', async () => {
    const { clock, store, jobId } = await fixture();
    const reserveProjection = vi.fn<EmailStore['reserveProjection']>(async (...args) => {
      clock.advance(30);
      return store.reserveProjection(...args);
    });
    const putActivity = vi.fn<EmailStore['putActivity']>(async (...args) => {
      clock.wall += 10_000; // A change in wall time does not spend the caller's elapsed budget.
      clock.advance(40);
      return store.putActivity(...args);
    });
    const ackProjection = vi.fn(store.ackProjection);
    const findJob = vi.fn(store.findJob);
    const admin = createEmailAdminWithClock(
      { scope: A, store: { ...store, reserveProjection, putActivity, ackProjection, findJob } },
      clock,
    );
    const controller = new AbortController();
    expect(await admin.reconcile({ timeoutMs: 80, limit: 1, signal: controller.signal })).toMatchObject({
      stop: 'limit',
      reserved: 1,
      acknowledged: 1,
      persistenceFailures: 0,
    });
    expect(reserveProjection.mock.calls[0]?.[1].timeoutMs).toBe(80);
    expect(putActivity.mock.calls[0]?.[2].timeoutMs).toBe(50);
    expect(ackProjection.mock.calls[0]?.[2].timeoutMs).toBe(10);
    clock.waits.length = 0;
    await admin.getJob(jobId);
    expect(clock.waits).toEqual([10_000, 5_000]);
    expect(findJob.mock.calls[0]?.[2].timeoutMs).toBe(5_000);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(clock.timers.size).toBe(0);
  });

  it.each(['aborted', 'deadline'] as const)(
    'stops on %s during a dispatched put without abandoning it or inventing an ACK',
    async (stop) => {
      const { clock, store, jobId } = await fixture();
      const entered = deferred<Parameters<EmailStore['putActivity']>>();
      const result = deferred<'present' | 'permit_expired'>();
      const putActivity = vi.fn<EmailStore['putActivity']>((...args) => {
        entered.resolve(args);
        return result.promise;
      });
      const ackProjection = vi.fn(store.ackProjection);
      const onActivity = vi.fn();
      const controller = new AbortController();
      const admin = createEmailAdminWithClock(
        { scope: A, store: { ...store, putActivity, ackProjection }, onActivity },
        clock,
      );
      const pending = admin.reconcile({ signal: controller.signal, timeoutMs: 80 });
      const settled = vi.fn();
      void pending.then(settled, settled);
      const [scope, permit, call] = await entered.promise;
      const proof = await store.putActivity(scope, permit, CALL);
      if (stop === 'aborted') controller.abort(new Error('fixture private reason'));
      else clock.advance(80);
      await Promise.resolve();
      expect(call.signal.aborted).toBe(true);
      expect(settled).not.toHaveBeenCalled();
      result.resolve(proof);
      expect(await pending).toMatchObject({
        stop,
        reserved: 1,
        acknowledged: 0,
        persistenceFailures: 1,
        observerStarted: 0,
      });
      expect(putActivity).toHaveBeenCalledTimes(1);
      expect(ackProjection).not.toHaveBeenCalled();
      expect(onActivity).not.toHaveBeenCalled();
      const reader = createEmailAdminWithClock({ scope: A, store, onActivity }, clock);
      expect(await reader.listActivities({ jobId })).toEqual({ items: [permit.activity] });
      expect(await reader.reconcile()).toMatchObject({ stop: 'idle', acknowledged: 1, observerStarted: 1 });
      expect(await reader.listActivities({ jobId })).toEqual({ items: [permit.activity] });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(clock.timers.size).toBe(0);
    },
  );

  it('retains an ACK already captured before abort but dispatches no next step', async () => {
    const { clock, store } = await fixture();
    const entered = deferred<Parameters<EmailStore['ackProjection']>>();
    const reply = deferred<Awaited<ReturnType<EmailStore['ackProjection']>>>();
    const ackProjection = vi.fn<EmailStore['ackProjection']>((...args) => {
      entered.resolve(args);
      return reply.promise;
    });
    const reserveProjection = vi.fn(store.reserveProjection);
    const controller = new AbortController();
    const admin = createEmailAdminWithClock({ scope: A, store: { ...store, ackProjection, reserveProjection } }, clock);
    const pending = admin.reconcile({ signal: controller.signal });
    const args = await entered.promise;
    reply.resolve(await store.ackProjection(...args));
    queueMicrotask(() => controller.abort());
    expect(await pending).toMatchObject({ stop: 'aborted', reserved: 1, acknowledged: 1, persistenceFailures: 0 });
    expect(reserveProjection).toHaveBeenCalledTimes(1);
    expect(clock.timers.size).toBe(0);
  });
});
