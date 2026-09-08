import { describe, expect, it } from 'vitest';
import flattenDeep from '../src/flattenDeep.ts';

/**
 * UTILS-06: flatten wide and deep arrays without argument/call-stack overflow.
 *
 * Documented contract under test:
 * - Iterative traversal: no unbounded spread into `push`, no call-stack
 *   recursion; left-to-right order and current leaf behavior preserved
 *   (non-array values appended as-is, holes read as `undefined`,
 *   non-array input yields `[]`). No size limits.
 * - Cycles (self- or transitively self-containing arrays) throw a
 *   `TypeError`; repeated/shared non-ancestor subarrays flatten once per
 *   occurrence.
 */
describe('flattenDeep wide/deep/cyclic boundaries (UTILS-06)', () => {
  it('returns [] for non-array input', () => {
    expect(flattenDeep(null as unknown as unknown[])).toEqual([]);
    expect(flattenDeep(undefined as unknown as unknown[])).toEqual([]);
    expect(flattenDeep('a,b' as unknown as unknown[])).toEqual([]);
  });

  it('preserves left-to-right order on nested input', () => {
    expect(flattenDeep<number>([1, [2, [3, 4]], 5])).toEqual([1, 2, 3, 4, 5]);
    expect(flattenDeep<number>([[], [[], []], []])).toEqual([]);
  });

  it('flattens the 150,000-leaf case in order without RangeError', () => {
    const wide: unknown[] = [Array(150000).fill(1)];
    const out = flattenDeep<number>(wide);
    expect(out.length).toBe(150000);
    expect(out[0]).toBe(1);
    expect(out[149999]).toBe(1);
    expect(out.every((v) => v === 1)).toBe(true);
  });

  it('flattens a deeply nested fixture in order without RangeError', () => {
    const depth = 100000;
    let nested: unknown[] = [1];
    for (let i = 0; i < depth; i++) {
      nested = [nested];
    }
    const out = flattenDeep<number>(nested);
    expect(out).toEqual([1]);
  });

  it('repeats leaves for repeated (shared, non-cyclic) subarrays', () => {
    const sub = [1, 2];
    expect(flattenDeep<number>([sub, sub])).toEqual([1, 2, 1, 2]);
    const inner = [3];
    expect(flattenDeep<number>([[inner], [inner]])).toEqual([3, 3]);
  });

  it('rejects direct self-cycles with a controlled error', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => flattenDeep(cyclic)).toThrow(TypeError);
  });

  it('rejects indirect cycles with a controlled error', () => {
    const a: unknown[] = [];
    const b: unknown[] = [a];
    a.push(b);
    expect(() => flattenDeep(a)).toThrow(TypeError);
    expect(() => flattenDeep([a])).toThrow(TypeError);
  });

  it('documents empty and sparse-array behavior', () => {
    expect(flattenDeep([])).toEqual([]);
    // Holes are read as `undefined` (indexed access), matching pre-fix leaf
    // behavior; sparse input yields dense `undefined` leaves.
    const sparse = Array(3);
    expect(flattenDeep(sparse).length).toBe(3);
    expect(flattenDeep(sparse)).toEqual([undefined, undefined, undefined]);
    // `delete` creates real holes (a sparse literal would trip no-sparse-arrays).
    const holed: unknown[] = [1, undefined, [2, undefined, 3]];
    delete holed[1];
    delete (holed[2] as unknown[])[1];
    expect(flattenDeep(holed)).toEqual([1, undefined, 2, undefined, 3]);
  });

  it('does not mutate its input', () => {
    const input = [1, [2, [3]]];
    const snapshot = JSON.stringify(input);
    flattenDeep<number>(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
