import { describe, expect, it } from 'vitest';
import { SharedHookGate, mapWithConcurrencyLimit } from '../src/helpers/concurrency';
import { getRequestWorkState } from '../src/helpers/request-work';
import { AccessRuntime } from '../src/runtime';
import { deferred, HookProbe, turn } from './hook-admission-fixture';

describe('ARL-07 bounded reentrant hook chains', () => {
  it('transfers root permits FIFO through throws/rejections and preserves indexed output', async () => {
    const gate = new SharedHookGate(2);
    const jobs = Array.from({ length: 5 }, () => deferred<number>());
    const starts: number[] = [];
    const completions: number[] = [];
    const run = (i: number) =>
      gate.run(async () => {
        starts.push(i);
        const value = await jobs[i].promise;
        completions.push(i);
        return value;
      });
    const error = new Error('hook rejected');
    const first = run(0).catch((e: unknown) => e);
    const result = mapWithConcurrencyLimit([1, 2, 3], 3, run);
    const last = run(4);
    expect(starts).toEqual([0, 1]);
    jobs[0].reject(error);
    expect(await first).toBe(error);
    expect(starts).toEqual([0, 1, 2]);
    jobs[2].resolve(20);
    await turn();
    expect(starts).toEqual([0, 1, 2, 3]);
    jobs[3].resolve(30);
    await turn();
    expect(starts).toEqual([0, 1, 2, 3, 4]);
    jobs[4].resolve(40);
    jobs[1].resolve(10);
    expect(await result).toEqual([10, 20, 30]);
    expect(await last).toBe(40);
    expect(completions).toEqual([2, 3, 4, 1]);
    await expect(
      gate.run(() => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(await gate.run(() => 99)).toBe(99);
  });

  it.each([1, 2])('bounds sibling fan-out at every recursive frame (limit %i)', async (limit) => {
    const gate = new SharedHookGate(limit);
    const probe = new HookProbe();
    const barrier = deferred();
    probe.barrier = barrier.promise;
    let frames = 0;
    let framePeak = 0;
    const frame = async <T>(body: () => Promise<T>) => {
      framePeak = Math.max(framePeak, ++frames);
      try {
        return await body();
      } finally {
        frames--;
      }
    };
    const leaves = (root: number, child: number) =>
      Promise.all(
        [0, 1, 2].map((leaf) =>
          gate.run(() => frame(() => probe.run(`${root}/${child}/${leaf}`, () => `${root}/${child}/${leaf}`))),
        ),
      );
    const children = (root: number) =>
      Promise.all([0, 1, 2].map((child) => gate.run(() => frame(() => leaves(root, child)))));
    const work = Promise.all(Array.from({ length: 3 }, (_, root) => gate.run(() => frame(() => children(root)))));
    try {
      await turn();
      // A plain shared semaphore deadlocks before even the first leaf starts.
      expect(probe.active).toBe(limit);
      expect(framePeak).toBe(3 * limit);
    } finally {
      barrier.resolve();
    }
    const result = await work;
    expect(result).toEqual(
      Array.from({ length: 3 }, (_, root) =>
        [0, 1, 2].map((child) => [0, 1, 2].map((leaf) => `${root}/${child}/${leaf}`)),
      ),
    );
    expect(probe.peak).toBe(limit);
    expect(probe.calls).toHaveLength(27);
    expect(frames).toBe(0);
  });

  it('drains admitted children on parent failure and makes stale async contexts reacquire FIFO', async () => {
    const gate = new SharedHookGate(1);
    const childRelease = deferred();
    const lateRelease = deferred();
    const outsideRelease = deferred();
    const starts: string[] = [];
    const error = new Error('parent failed');
    let late!: Promise<string>;
    let children!: Promise<unknown[]>;
    let grandchild!: Promise<unknown>;
    let parentSettled = false;
    const parent = gate
      .run(() => {
        children = Promise.all([
          gate
            .run(() => {
              starts.push('child-1');
              grandchild = gate
                .run(async () => {
                  starts.push('grandchild');
                  await childRelease.promise;
                  throw error;
                })
                .catch((e: unknown) => e);
              throw error;
            })
            .catch((e: unknown) => e),
          gate.run(() => {
            starts.push('child-2');
            return 2;
          }),
        ]);
        late = (async () => {
          await lateRelease.promise;
          return gate.run(() => {
            starts.push('late');
            return 'late';
          });
        })();
        throw error;
      })
      .catch((e: unknown) => {
        parentSettled = true;
        return e;
      });
    const outside = gate.run(async () => {
      starts.push('outside');
      await outsideRelease.promise;
      return 'outside';
    });
    try {
      await turn();
      expect(starts).toEqual(['child-1', 'grandchild']);
      expect(parentSettled).toBe(false);
      childRelease.resolve();
      expect(await parent).toBe(error);
      expect(await children).toEqual([error, 2]);
      expect(await grandchild).toBe(error);
      expect(starts).toEqual(['child-1', 'grandchild', 'child-2', 'outside']);
      lateRelease.resolve();
      await turn();
      expect(starts).toEqual(['child-1', 'grandchild', 'child-2', 'outside']);
    } finally {
      childRelease.resolve();
      lateRelease.resolve();
      outsideRelease.resolve();
    }
    expect(await outside).toBe('outside');
    expect(await late).toBe('late');
    expect(await gate.run(() => 'recovered')).toBe('recovered');
  });

  it('rejects beyond 64 admission scopes and releases the chain for queued work', async () => {
    const gate = new SharedHookGate(1);
    let entered = 0;
    const recurse = (): Promise<void> =>
      gate.run(async () => {
        entered++;
        await recurse();
      });
    const failure = recurse().catch((error: unknown) => error);
    await turn();
    expect(entered).toBe(64);
    expect(await failure).toEqual(new RangeError('Maximum reentrant hook depth of 64 exceeded'));
    expect(await gate.run(() => 'next')).toBe('next');
  });

  it('captures normalized hook/persistence limits together per request/runtime', () => {
    const a = new AccessRuntime();
    const b = new AccessRuntime();
    const request = {};
    a.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 2, maxBulkConcurrency: 3 } });
    b.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 } });
    const first = getRequestWorkState(request, a);
    a.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 4, maxBulkConcurrency: 5 } });
    expect(getRequestWorkState(request, a)).toBe(first);
    expect(first.hookGate.limit).toBe(2);
    expect(first.scheduler.limit).toBe(3);
    expect(getRequestWorkState(request, b).hookGate.limit).toBe(1);
    expect(getRequestWorkState({}, a).hookGate.limit).toBe(4);
    expect(getRequestWorkState({}, a).scheduler.limit).toBe(5);
    b.setGlobalOptions({ requestComplexity: { maxHookConcurrency: Infinity, maxBulkConcurrency: NaN } });
    const normalized = getRequestWorkState({}, b);
    expect(normalized.hookGate.limit).toBe(10);
    expect(normalized.scheduler.limit).toBe(10);
  });
});
