import { getEventListeners, once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AdmissionResult, CallOptions, EmailStore, PreparedFields } from '../../src';
import { createEmailBatchServiceWithClock } from '../../src/batch';
import { CALL } from '../conformance/store-fixtures';
import { batchFixture, batchKey, request } from './batch-fixture';
import { deferred, SCOPE, TO } from './template-fixtures';

function watchInsert(f: Awaited<ReturnType<typeof batchFixture>>) {
  const dispatch = deferred<Parameters<EmailStore['insert']>>();
  const reply = deferred<Awaited<ReturnType<EmailStore['insert']>>>();
  f.insert.mockImplementationOnce((...args) => {
    dispatch.resolve(args);
    return reply.promise;
  });
  return { dispatched: dispatch.promise, reply };
}

const STOPS = ['abort', 'deadline'] as const;

describe('batch timing and partial progress', () => {
  it('starts nothing for an already aborted valid call but still rejects an invalid request', async () => {
    const f = await batchFixture();
    const signal = AbortSignal.abort(new Error('private caller reason'));
    await expect(f.batch.enqueueBatch(request('one', 'two'), { signal })).resolves.toMatchObject({
      items: [
        { itemId: 'one', status: 'not_started' },
        { itemId: 'two', status: 'not_started' },
      ],
      counts: { enqueued: 0, replayed: 0, failed: 0, notStarted: 2, persistenceFailures: 0 },
    });
    await expect(f.batch.enqueueBatch(request('duplicate', 'duplicate'), { signal })).rejects.toMatchObject({
      code: 'invalid_command',
    });
    expect(f.findAdmission).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
    expect(f.clock.waits).toEqual([]);
  });

  it('passes one absolute elapsed budget to the same admission path, even below the per-call override floor', async () => {
    const f = await batchFixture();
    f.findAdmission.mockImplementationOnce((...args) => {
      f.clock.advance(30);
      f.clock.wall += 60_000; // Scheduling follows wall time, elapsed budget does not.
      return f.store.findAdmission(...args);
    });
    f.insert.mockImplementationOnce((...args) => {
      f.clock.advance(35);
      return f.store.insert(...args);
    });
    const controller = new AbortController();
    const result = await f.batch.enqueueBatch(request('one', 'two'), { signal: controller.signal, timeoutMs: 80 });
    expect(result.items.map(({ status }) => status)).toEqual(['enqueued', 'enqueued']);
    expect(f.findAdmission.mock.calls.map(([, , call]) => call.timeoutMs)).toEqual([80, 15]);
    expect(f.insert.mock.calls.map(([, , call]) => call.timeoutMs)).toEqual([50, 15]);
    expect(f.clock.timers.size).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    f.clock.waits.length = 0;
    await f.batch.enqueueBatch(request('one'));
    expect(f.clock.waits[0]).toBe(30_000);
    expect(f.clock.timers.size).toBe(0);
  });

  it.each(STOPS)('keeps an acknowledged in-flight write at the %s boundary', async (cause) => {
    const f = await batchFixture();
    const { dispatched, reply } = watchInsert(f);
    const controller = new AbortController();
    const pending = f.batch.enqueueBatch(request('one', 'two'), { signal: controller.signal, timeoutMs: 50 });
    const args = await dispatched;
    reply.resolve(await f.store.insert(...args));
    queueMicrotask(() => {
      if (cause === 'abort') controller.abort();
      else f.clock.advance(50);
    });
    const report = await pending;
    expect(report).toMatchObject({
      items: [
        { itemId: 'one', status: 'enqueued', job: { jobId: args[1].jobId } },
        { itemId: 'two', status: 'not_started' },
      ],
      counts: { enqueued: 1, replayed: 0, failed: 0, notStarted: 1, persistenceFailures: 0 },
    });
    expect(f.findAdmission).toHaveBeenCalledOnce();
    expect(f.clock.timers.size).toBe(0);
  });

  it.each(STOPS)(
    'waits for the invoked write and reports possible commit at %s, without starting later items',
    async (cause) => {
      const f = await batchFixture();
      const { dispatched, reply } = watchInsert(f);
      const controller = new AbortController();
      const pending = f.batch.enqueueBatch(request('one', 'two'), { signal: controller.signal, timeoutMs: 50 });
      const settled = vi.fn();
      void pending.then(settled, settled);
      const args = await dispatched;
      const [scope, dto, call] = args;
      const ack = await f.store.insert(scope, dto, CALL);
      if (cause === 'abort') controller.abort(new Error('private caller reason'));
      else f.clock.advance(50);
      await Promise.resolve();
      expect(call.signal.aborted).toBe(true);
      expect(settled).not.toHaveBeenCalled();
      reply.resolve(ack);
      expect(await pending).toMatchObject({
        items: [
          { itemId: 'one', status: 'failed', code: 'write_unconfirmed' },
          { itemId: 'two', status: 'not_started' },
        ],
        counts: { enqueued: 0, replayed: 0, failed: 1, notStarted: 1, persistenceFailures: 1 },
      });
      expect(f.findAdmission).toHaveBeenCalledOnce(); // No time to confirm on this call.
      expect(f.insert).toHaveBeenCalledOnce();
      expect(f.prepare).toHaveBeenCalledOnce();

      expect(await f.batch.enqueueBatch(request('two', 'one'))).toMatchObject({
        items: [
          { itemId: 'two', status: 'enqueued' },
          { itemId: 'one', status: 'replayed', job: { jobId: dto.jobId } },
        ],
      });
      expect(f.findAdmission.mock.calls.map(([, key]) => key)).toEqual([
        batchKey('one'),
        batchKey('two'),
        batchKey('one'),
      ]);
      expect(f.insert).toHaveBeenCalledTimes(2);
      expect(f.prepare).toHaveBeenCalledTimes(2);
      expect(f.load).toHaveBeenCalledTimes(2);
      expect(f.clock.timers.size).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
  );

  it('does not start later items or persist late preparation, and inherits the shared registry slot limit', async () => {
    const f = await batchFixture({ maxPending: 1 });
    const entered = deferred<AbortSignal>();
    const late = deferred<PreparedFields<{ title: string }>>();
    f.prepare.mockImplementationOnce((_input, { signal }) => {
      entered.resolve(signal);
      return late.promise;
    });
    const controller = new AbortController();
    const pending = f.batch.enqueueBatch(request('held', 'waiting'), { signal: controller.signal });
    const signal = await entered.promise;
    expect(f.findAdmission).toHaveBeenCalledOnce();
    expect(f.prepare).toHaveBeenCalledOnce();
    controller.abort();
    await expect(pending).resolves.toMatchObject({
      items: [
        { itemId: 'held', status: 'failed', code: 'aborted' },
        { itemId: 'waiting', status: 'not_started' },
      ],
      counts: { failed: 1, notStarted: 1, persistenceFailures: 0 },
    });
    expect(signal.aborted).toBe(true);
    const second = createEmailBatchServiceWithClock({ service: f.service, worker: f.worker }, f.clock);
    await expect(second.enqueueBatch(request('other'))).resolves.toMatchObject({
      items: [{ status: 'failed', code: 'busy' }],
    });
    expect(f.prepare).toHaveBeenCalledOnce();
    late.resolve({ values: { title: 'late' }, to: [TO] });
    await late.promise;
    expect(f.parseData).not.toHaveBeenCalled();
    expect(f.load).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
    await expect(second.enqueueBatch(request('other'))).resolves.toMatchObject({ counts: { enqueued: 1 } });
    expect(await f.store.findAdmission(SCOPE, batchKey('held'), CALL)).toBeNull();
    expect(f.clock.timers.size).toBe(0);
  });
});

describe('separately composed service budgets', () => {
  it('passes the reduced whole-call budget and continues after a service-local timeout', async () => {
    const f = await batchFixture();
    const enqueue = vi.fn(f.service.enqueue);
    enqueue.mockImplementationOnce(async () => {
      f.clock.advance(49.5);
      throw { code: 'deadline' };
    });
    const batch = createEmailBatchServiceWithClock({ service: { ...f.service, enqueue }, worker: f.worker }, f.clock);
    expect(await batch.enqueueBatch(request('one', 'two'), { timeoutMs: 220 })).toMatchObject({
      items: [
        { itemId: 'one', status: 'failed', code: 'deadline' },
        { itemId: 'two', status: 'enqueued' },
      ],
      counts: { enqueued: 1, failed: 1, notStarted: 0, persistenceFailures: 0 },
    });
    expect(enqueue.mock.calls.map(([, call]) => call?.timeoutMs)).toEqual([220, 170]);
    expect(f.clock.timers.size).toBe(0);
  });

  it('clamps public timeouts and uses the original absolute signal below the override floor', async () => {
    const f = await batchFixture();
    const second = deferred<CallOptions>();
    const enqueue = vi.fn<typeof f.service.enqueue>();
    enqueue
      .mockImplementationOnce(async (command, call) => {
        const first = await f.service.enqueue(command, call);
        f.clock.advance(119_975);
        return first;
      })
      .mockImplementationOnce(async (_command, call) => {
        const signal = call!.signal!;
        second.resolve(call!);
        if (!signal.aborted) await once(signal, 'abort');
        // A foreign service sees the enclosing deadline as external cancellation before any write.
        throw { code: 'aborted', cause: 'private caller reason' };
      });
    const batch = createEmailBatchServiceWithClock({ service: { ...f.service, enqueue }, worker: f.worker }, f.clock);
    const pending = batch.enqueueBatch(request('one', 'two', 'three'), { timeoutMs: 120_000 });
    const { signal, timeoutMs } = await second.promise;
    expect(enqueue.mock.calls[0]?.[1]).toEqual({ signal, timeoutMs: 60_000 });
    expect(timeoutMs).toBe(50);
    f.clock.advance(24);
    expect(signal?.aborted).toBe(false);
    f.clock.advance(1);
    const result = await pending;
    expect(signal?.aborted).toBe(true);
    expect(result).toMatchObject({
      items: [
        { itemId: 'one', status: 'enqueued' },
        { itemId: 'two', status: 'failed', code: 'deadline' },
        { itemId: 'three', status: 'not_started' },
      ],
      counts: { enqueued: 1, replayed: 0, failed: 1, notStarted: 1, persistenceFailures: 0 },
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(f.clock.timers.size).toBe(0);
  });

  it.each(['replayed', 'write_unconfirmed'] as const)(
    'does not abandon an invoked service or mask its %s following cancellation',
    async (outcome) => {
      const f = await batchFixture();
      await f.batch.enqueueBatch(request('one'));
      const ready = deferred<AdmissionResult>();
      const release = deferred<void>();
      const enqueue = vi.fn<typeof f.service.enqueue>(async (...args) => {
        const evidence = await f.service.enqueue(...args);
        ready.resolve(evidence);
        await release.promise;
        if (outcome === 'write_unconfirmed') throw { code: outcome, cause: 'private' };
        return evidence;
      });
      const batch = createEmailBatchServiceWithClock({ service: { ...f.service, enqueue }, worker: f.worker }, f.clock);
      const controller = new AbortController();
      const pending = batch.enqueueBatch(request('one', 'two'), { signal: controller.signal });
      const settled = vi.fn();
      void pending.then(settled, settled);
      const confirmed = await ready.promise;
      controller.abort();
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      release.resolve();
      expect(await pending).toMatchObject({
        items: [
          outcome === 'replayed'
            ? { itemId: 'one', status: outcome, job: confirmed.job }
            : { itemId: 'one', status: 'failed', code: outcome },
          { itemId: 'two', status: 'not_started' },
        ],
        counts: { notStarted: 1, persistenceFailures: Number(outcome === 'write_unconfirmed') },
      });
      expect(enqueue).toHaveBeenCalledOnce();
      expect(f.clock.timers.size).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
  );
});
