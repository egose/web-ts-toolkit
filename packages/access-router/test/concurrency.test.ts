import { describe, expect, it, vi } from 'vitest';
import { RequestConcurrencyScheduler } from '../src/helpers/concurrency';
import { getRequestWorkState } from '../src/helpers/request-work';
import { admitModelPersistence, type ModelAdapter } from '../src/model';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import type { ModelRequest } from '../src/interfaces';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T = number>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function runtime(limit: number) {
  const owner = new AccessRuntime();
  owner.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: limit, maxCorrelatedQueries: 1 } });
  return owner;
}

describe('persistence permits versus orchestration', () => {
  it('nested maps complete at limit 1 without holding permits across descendants', async () => {
    const scheduler = new RequestConcurrencyScheduler(1);
    const result = await scheduler.map([1, 2], async (parent) => {
      const value = await scheduler.work(() => Promise.resolve(parent));
      return scheduler.map([3, 4], (child) => scheduler.work(() => Promise.resolve(value * child)));
    });
    expect(result).toEqual([
      [3, 4],
      [6, 8],
    ]);
  });

  it('shares FIFO slots, releases on rejection/synchronous throw, preserves map ordering', async () => {
    const scheduler = new RequestConcurrencyScheduler(2);
    const jobs = Array.from({ length: 5 }, () => deferred());
    const started: number[] = [];
    const completion: number[] = [];
    const call = (i: number) =>
      scheduler.work(async () => {
        started.push(i);
        const value = await jobs[i].promise;
        completion.push(i);
        return value;
      });
    const failed = call(0).catch((error) => error);
    const values = scheduler.map([1, 2, 3], call);
    const last = call(4);
    expect(started).toEqual([0, 1]);
    const error = new Error('persistence failed');
    jobs[0].reject(error);
    expect(await failed).toBe(error);
    await turn();
    expect(started).toEqual([0, 1, 2]);
    jobs[2].resolve(20);
    await turn();
    expect(started).toEqual([0, 1, 2, 4]);
    jobs[4].resolve(40);
    await turn();
    expect(started).toEqual([0, 1, 2, 4, 3]);
    jobs[3].resolve(30);
    jobs[1].resolve(10);
    expect(await values).toEqual([10, 20, 30]);
    expect(await last).toBe(40);
    expect(completion).toEqual([2, 4, 3, 1]);
    await expect(
      scheduler.work(() => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(await scheduler.work(() => 99)).toBe(99);
  });

  it('captures service request/runtime ownership across ambient changes and separate requests', async () => {
    const a = runtime(1);
    const b = runtime(2);
    const sameRequest = { macl: {} } as ModelRequest;
    const otherRequest = { macl: {} } as ModelRequest;
    const started: string[] = [];
    const pending = new Map<string, ReturnType<typeof deferred>>();
    const make = (req: ModelRequest, owner: AccessRuntime) =>
      runWithRuntime(
        owner,
        () =>
          new (class extends Service {
            protected createModelAdapter() {
              return {
                countDocuments: ({ id }: { id: string }) => {
                  started.push(id);
                  const job = deferred();
                  pending.set(id, job);
                  return job.promise;
                },
              };
            }
            protected getModelRouterOptions() {
              return { documentPermissionField: '_permissions' };
            }
            claim() {
              this.claimCorrelatedQuerySlot();
            }
          })(req, 'SharedName'),
      );
    const first = make(sameRequest, a);
    const sibling = make(sameRequest, a);
    const secondRuntime = make(sameRequest, b);
    const secondRequest = make(otherRequest, a);
    // Deliberately invoke A's services while B is ambient. Admission belongs to A.
    const tasks = runWithRuntime(b, () => [
      first.countTrusted({ id: 'a1' }),
      sibling.countTrusted({ id: 'a2' }),
      secondRuntime.countTrusted({ id: 'b1' }),
      secondRuntime.countTrusted({ id: 'b2' }),
      secondRuntime.countTrusted({ id: 'b3' }),
      secondRequest.countTrusted({ id: 'other' }),
    ]);
    expect(started).toEqual(['a1', 'b1', 'b2', 'other']);
    pending.get('b2')!.resolve(2);
    await turn();
    expect(started).toEqual(['a1', 'b1', 'b2', 'other', 'b3']);
    pending.get('a1')!.resolve(1);
    await turn();
    expect(started.at(-1)).toBe('a2');
    for (const job of pending.values()) job.resolve(7);
    expect((await Promise.all(tasks)).every((result) => result.success)).toBe(true);
    // Correlated totals share the same ownership, not a process/request-only key.
    runWithRuntime(a, () => first.claim());
    expect(() => runWithRuntime(a, () => sibling.claim())).toThrow('bad_request');
    expect(() => runWithRuntime(b, () => secondRuntime.claim())).not.toThrow();
    expect(() => runWithRuntime(a, () => secondRequest.claim())).not.toThrow();
    expect(getRequestWorkState(sameRequest, a).totalQueries).toBe(1);
    expect(getRequestWorkState(sameRequest, b).totalQueries).toBe(1);
  });

  it('admits lazy adapter queries through settlement and retains receivers/metadata/new', async () => {
    const scheduler = new RequestConcurrencyScheduler(1);
    const job = deferred();
    const started: string[] = [];
    const raw = {
      modelName: 'Test',
      mongooseModel: {},
      new: () => ({ unsaved: true }),
      find() {
        expect(this).toBe(raw);
        return {
          then: (resolve: (value: number) => void, reject: (reason: unknown) => void) => {
            started.push('exec');
            return job.promise.then(resolve, reject);
          },
        };
      },
      countDocuments() {
        started.push('count');
        return 4;
      },
    } as unknown as ModelAdapter;
    const adapter = admitModelPersistence(raw, scheduler);
    expect(adapter.mongooseModel).toBe(raw.mongooseModel);
    expect(adapter.new()).toEqual({ unsaved: true });
    const find = adapter.find({ filter: {} });
    const count = adapter.countDocuments();
    await turn();
    expect(started).toEqual(['exec']);
    job.resolve(3);
    expect(await find).toBe(3);
    expect(await count).toBe(4);
    expect(started).toEqual(['exec', 'count']);
  });

  it('bounds bulk create persistence, preserving item order and queued attempts after rejection', async () => {
    const scheduler = new RequestConcurrencyScheduler(1);
    const jobs = [deferred(), deferred(), deferred()];
    const create = vi.fn(async ([index]: number[]) => [await jobs[index].promise]);
    const adapter = admitModelPersistence({ create } as unknown as ModelAdapter, scheduler);
    const result = adapter.create([0, 1, 2]).catch((error: unknown) => error);
    expect(create.mock.calls).toEqual([[[0]]]);
    const error = new Error('insert failed');
    jobs[0].reject(error);
    expect(await result).toBe(error);
    await turn();
    expect(create.mock.calls).toEqual([[[0]], [[1]]]);
    jobs[1].resolve(11);
    await turn();
    jobs[2].resolve(22);
    await turn();
    expect(create.mock.calls).toEqual([[[0]], [[1]], [[2]]]);
    expect(await adapter.create([2, 1])).toEqual([22, 11]);
  });
});
