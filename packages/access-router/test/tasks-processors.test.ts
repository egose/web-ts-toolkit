import { describe, expect, it } from 'vitest';

import { Core } from '../src/core.ts';
import { countPaths, copyPaths, maskPaths, movePaths, sliceArrays } from '../dist/processors.mjs';

describe('tasks/processors', () => {
  describe('copyPaths', () => {
    it('copies src to dest without modifying src', () => {
      const data = { a: { x: 1 }, b: 2 };
      const result = copyPaths(data, [{ src: 'a', dest: 'c' }]) as Record<string, unknown>;
      expect(result).toBe(data);
      expect(result.c).toEqual({ x: 1 });
      expect(result.a).toEqual({ x: 1 });
    });

    it('deep-clones the copied value so dest does not alias src', () => {
      const data = { a: { x: 1 } };
      const result = copyPaths(data, [{ src: 'a', dest: 'c' }]) as { a: { x: number }; c: { x: number } };
      result.c.x = 99;
      expect(result.a.x).toBe(1);
    });

    it('fans out across intermediate arrays', () => {
      const data = { items: [{ v: 1 }, { v: 2 }] };
      const result = copyPaths(data, [{ src: 'items.v', dest: 'w' }]) as {
        items: Array<{ v: number; w: number }>;
      };
      expect(result.items).toEqual([
        { v: 1, w: 1 },
        { v: 2, w: 2 },
      ]);
    });

    it('treats missing src and self-copy as no-ops', () => {
      expect(copyPaths({ a: 1 }, [{ src: 'missing', dest: 'x' }])).toEqual({ a: 1 });
      const data = { a: { x: 1 } };
      expect(copyPaths(data, [{ src: 'a', dest: 'a' }])).toBe(data);
    });

    it('clones in immutable mode and rejects unsafe paths', () => {
      const data = { a: { x: 1 } };
      const result = copyPaths(data, [{ src: 'a', dest: 'c' }], { mutable: false }) as Record<string, unknown>;
      expect(result).not.toBe(data);
      expect(result.c).toEqual({ x: 1 });
      expect(() => copyPaths({}, [{ src: '__proto__', dest: 'x' }])).toThrowError(/refusing path '__proto__'/);
      expect(() => copyPaths({ a: 1 }, [{ src: 'a', dest: 'x.__proto__' }])).toThrowError(
        /refusing path 'x.__proto__'/,
      );
    });
  });

  describe('movePaths', () => {
    it('moves src to dest and deletes src', () => {
      const data = { a: { x: 1 }, b: 2 } as Record<string, unknown>;
      const result = movePaths(data, [{ src: 'a', dest: 'c' }]) as Record<string, unknown>;
      expect(result).toBe(data);
      expect(result.c).toEqual({ x: 1 });
      expect('a' in result).toBe(false);
    });

    it('treats missing src and self-move as no-ops', () => {
      expect(movePaths({ a: 1 }, [{ src: 'missing', dest: 'x' }])).toEqual({ a: 1 });
      const data = { a: 1 };
      expect(movePaths(data, [{ src: 'a', dest: 'a' }])).toBe(data);
    });

    it('copies without deleting when dest is nested under src', () => {
      const data = { a: { x: 1 } } as Record<string, Record<string, unknown>>;
      const result = movePaths(data, [{ src: 'a', dest: 'a.b' }]) as Record<string, Record<string, unknown>>;
      expect(result.a.x).toBe(1);
      expect(result.a.b).toEqual({ x: 1 });
    });

    it('rejects unsafe paths', () => {
      expect(() => movePaths({ a: 1 }, [{ src: 'a', dest: '__proto__' }])).toThrowError(/refusing path '__proto__'/);
    });
  });

  describe('sliceArrays', () => {
    it('slices in place by default', () => {
      const data = { list: [1, 2, 3, 4] };
      const result = sliceArrays(data, [{ src: 'list', skip: 1, limit: 2 }]) as { list: number[] };
      expect(result.list).toEqual([2, 3]);
    });

    it('writes to dest when provided and keeps the original', () => {
      const data = { list: [1, 2, 3, 4] };
      const result = sliceArrays(data, [{ src: 'list', dest: 'page', skip: 2, limit: 2 }]) as {
        list: number[];
        page: number[];
      };
      expect(result.list).toEqual([1, 2, 3, 4]);
      expect(result.page).toEqual([3, 4]);
    });

    it('keeps the tail when limit is omitted', () => {
      expect(sliceArrays({ list: [1, 2, 3] }, [{ src: 'list', skip: 1 }])).toEqual({ list: [2, 3] });
    });

    it('clamps limit to maxSlice', () => {
      const list = Array.from({ length: 10 }, (_, i) => i);
      const result = sliceArrays({ list }, [{ src: 'list', limit: 10 }], { maxSlice: 3 }) as { list: number[] };
      expect(result.list).toEqual([0, 1, 2]);
      const big = Array.from({ length: 2000 }, (_, i) => i);
      const defaulted = sliceArrays({ list: big }, [{ src: 'list', limit: 2000 }]) as { list: number[] };
      expect(defaulted.list).toHaveLength(1000);
    });

    it('treats non-arrays and missing paths as no-ops and validates bounds', () => {
      expect(sliceArrays({ a: 1 }, [{ src: 'a', limit: 2 }])).toEqual({ a: 1 });
      expect(sliceArrays({ a: 1 }, [{ src: 'missing', limit: 2 }])).toEqual({ a: 1 });
      expect(() => sliceArrays({ list: [1] }, [{ src: 'list', skip: -1 }])).toThrowError(/'skip' must be/);
      expect(() => sliceArrays({ list: [1] }, [{ src: 'list', limit: 1.5 }])).toThrowError(/'limit' must be/);
      expect(() => sliceArrays({ list: [1] }, [{ src: 'list' }], { maxSlice: -1 })).toThrowError(/'maxSlice' must be/);
    });
  });

  describe('countPaths', () => {
    it('counts arrays, objects, scalars, and nulls', () => {
      const result = countPaths({ arr: [1, 2, 3], obj: { a: 1, b: 2 }, s: 'x', n: null }, [
        { src: 'arr', dest: 'arrCount' },
        { src: 'obj', dest: 'objCount' },
        { src: 's', dest: 'sCount' },
        { src: 'n', dest: 'nCount' },
      ]) as Record<string, unknown>;
      expect(result).toMatchObject({ arrCount: 3, objCount: 2, sCount: 1, nCount: 0 });
    });

    it('treats missing src as a no-op', () => {
      expect(countPaths({ a: 1 }, [{ src: 'missing', dest: 'c' }])).toEqual({ a: 1 });
    });

    it('rejects unsafe paths', () => {
      expect(() => countPaths({ a: [1] }, [{ src: 'a', dest: '__proto__' }])).toThrowError(/refusing path '__proto__'/);
    });
  });

  describe('maskPaths', () => {
    it('redacts with *** by default and honors custom replacements', () => {
      const result = maskPaths({ secret: 's3cret', other: 1 }, [{ src: 'secret' }]) as Record<string, unknown>;
      expect(result.secret).toBe('***');
      const nulled = maskPaths({ secret: 's3cret' }, [{ src: 'secret', replacement: null }]) as Record<string, unknown>;
      expect(nulled.secret).toBeNull();
    });

    it('fans out across arrays and skips missing leaves', () => {
      const data = { users: [{ ssn: '1' }, { ssn: '2' }] };
      const result = maskPaths(data, [{ src: 'users.ssn', replacement: 'x' }]) as {
        users: Array<{ ssn: string }>;
      };
      expect(result.users).toEqual([{ ssn: 'x' }, { ssn: 'x' }]);
      expect(maskPaths({ a: 1 }, [{ src: 'missing' }])).toEqual({ a: 1 });
    });

    it('rejects unsafe paths', () => {
      expect(() => maskPaths({ a: 1 }, [{ src: '__proto__' }])).toThrowError(/refusing path '__proto__'/);
    });
  });

  describe('Core.runTasks dispatch', () => {
    const core = new Core({} as never);

    it('dispatches each new task type', () => {
      expect(core.runTasks('m', { a: { x: 1 } }, { type: 'COPY', args: [{ src: 'a', dest: 'b' }] })).toEqual({
        a: { x: 1 },
        b: { x: 1 },
      });
      expect(
        core.runTasks('m', { a: { x: 1 } } as Record<string, unknown>, {
          type: 'MOVE',
          args: [{ src: 'a', dest: 'b' }],
        }),
      ).toEqual({ b: { x: 1 } });
      expect(core.runTasks('m', { list: [1, 2, 3] }, { type: 'SLICE', args: [{ src: 'list', limit: 2 }] })).toEqual({
        list: [1, 2],
      });
      expect(core.runTasks('m', { list: [1, 2, 3] }, { type: 'COUNT', args: [{ src: 'list', dest: 'n' }] })).toEqual({
        list: [1, 2, 3],
        n: 3,
      });
      expect(core.runTasks('m', { s: 'x' }, { type: 'MASK', args: [{ src: 's' }] })).toEqual({ s: '***' });
    });

    it('ignores unknown task types', () => {
      const doc = { a: 1 };
      expect(core.runTasks('m', doc, { type: 'NOPE', args: [] })).toBe(doc);
    });
  });
});
