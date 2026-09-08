import { describe, expect, it, vi } from 'vitest';
import toAsyncFn from '../src/toAsyncFn.ts';
import isPromise from '../src/isPromise.ts';
import mapValuesAsync from '../src/mapValuesAsync.ts';

/**
 * UTILS-07: async adapter contract evidence.
 *
 * Locks the CURRENT (docs-only, no behavior change) contract:
 * - `toAsyncFn` does NOT establish a real Promise/rejection boundary: sync
 *   throws escape synchronously, and thenables are returned unchanged
 *   (identity preserved, not a native Promise).
 * - `mapValuesAsync` starts all callbacks eagerly with unbounded parallelism.
 */
describe('toAsyncFn current contract (UTILS-07)', () => {
  it('wraps sync success in a native Promise', async () => {
    const fn = toAsyncFn((x: number) => x * 2);
    const ret = fn(21);
    expect(ret).toBeInstanceOf(Promise);
    await expect(ret).resolves.toBe(42);
  });

  it('lets sync throws escape synchronously (no rejection boundary)', () => {
    const fn = toAsyncFn(() => {
      throw new Error('boom');
    });
    expect(() => fn()).toThrow('boom');
  });

  it('propagates native rejections as rejections', async () => {
    const fn = toAsyncFn(async () => {
      throw new Error('rej');
    });
    await expect(fn()).rejects.toThrow('rej');
  });

  it('returns custom thenables unchanged (identity preserved)', async () => {
    const thenable = { then: (res: (v: number) => void) => res(42) };
    const fn = toAsyncFn(() => thenable);
    const ret = fn() as unknown;
    expect(ret).toBe(thenable);
    expect(ret).not.toBeInstanceOf(Promise);
    await expect(ret).resolves.toBe(42);
  });

  it('throws synchronously when the then accessor throws', () => {
    const evil = {};
    Object.defineProperty(evil, 'then', {
      get() {
        throw new Error('then-getter');
      },
      enumerable: true,
    });
    const fn = toAsyncFn(() => evil as unknown as PromiseLike<unknown>);
    expect(() => (fn as () => unknown)()).toThrow('then-getter');
  });

  it('resolves the default value when fn is absent', async () => {
    const withDefault = toAsyncFn(undefined, 7);
    await expect(withDefault()).resolves.toBe(7);
    expect(withDefault()).toBeInstanceOf(Promise);
    const nullFn = toAsyncFn(null);
    await expect(nullFn()).resolves.toBeUndefined();
  });

  it('forwards this to the wrapped function', async () => {
    const ctx = { n: 5 };
    function getN(this: unknown) {
      return (this as typeof ctx).n;
    }
    await expect(toAsyncFn<[never], number>(getN as never).call(ctx)).resolves.toBe(5);
  });
});

describe('isPromise current contract (UTILS-07)', () => {
  it('accepts native promises and function-then thenables only', () => {
    expect(isPromise(Promise.resolve(1))).toBe(true);
    expect(isPromise({ then: () => {} })).toBe(true);
    expect(isPromise({ then: 1 })).toBe(false);
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
  });
});

describe('mapValuesAsync current contract (UTILS-07)', () => {
  it('starts all callbacks eagerly (unbounded parallelism)', async () => {
    let active = 0;
    let maxActive = 0;
    const res = await mapValuesAsync({ a: 1, b: 2, c: 3, d: 4 }, async (v) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return (v as number) * 10;
    });
    expect(res).toEqual({ a: 10, b: 20, c: 30, d: 40 });
    expect(maxActive).toBe(4);
  });

  it('rejects on sync callback throw or single-key rejection', async () => {
    await expect(
      mapValuesAsync({ a: 1 }, () => {
        throw new Error('cb-boom');
      }),
    ).rejects.toThrow('cb-boom');
    await expect(
      mapValuesAsync({ a: 1, b: 2 }, async (v) => {
        if (v === 2) throw new Error('b-fail');
        return v;
      }),
    ).rejects.toThrow('b-fail');
  });

  it('resolves {} for empty input without invoking the callback', async () => {
    const spy = vi.fn();
    await expect(mapValuesAsync({}, spy)).resolves.toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });
});
