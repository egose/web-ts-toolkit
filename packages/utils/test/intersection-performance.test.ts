import { describe, expect, it } from 'vitest';
import difference from '../src/difference.ts';
import intersection from '../src/intersection.ts';
import intersectionBy from '../src/intersectionBy.ts';
import uniq from '../src/uniq.ts';
import uniqBy from '../src/uniqBy.ts';

/**
 * UTILS-08: precomputed secondary membership + Set-based dedup.
 *
 * Documented contract under test:
 * - `intersectionBy` evaluates the iteratee exactly once per element of
 *   each input array (work proportional to total input length). Callback
 *   invocation count intentionally changed vs the old per-candidate
 *   re-mapping (100-by-100 was 10,100 calls, now 200); redundant side
 *   effects are not preserved.
 * - Membership uses `Set` (SameValueZero: NaN equals NaN, +0/-0 equal;
 *   objects by reference), matching the previous linear `sameValueZero`
 *   scans (UTILS-05). First-occurrence order, item references, and input
 *   non-mutation are preserved.
 * - Nullish parity decision (preserved as-is, unification deferred to
 *   UTILS-11): `intersectionBy`/`difference` ignore non-array values
 *   arguments; `intersection` treats any non-array secondary as empty.
 */
describe('intersection performance and set semantics (UTILS-08)', () => {
  it('evaluates the iteratee once per element, not per candidate', () => {
    const first = Array.from({ length: 100 }, (_, index) => index);
    const second = Array.from({ length: 100 }, (_, index) => index);
    let calls = 0;
    const result = intersectionBy(first, second, (value: unknown) => {
      calls += 1;
      return value;
    });
    expect(result).toEqual(first);
    // 100 (first) + 100 (secondary) = 200, vs 10,100 before the fix.
    expect(calls).toBe(200);
  });

  it('scales with total input length across multiple secondaries', () => {
    const first = Array.from({ length: 50 }, (_, index) => index);
    const second = Array.from({ length: 30 }, (_, index) => index);
    const third = Array.from({ length: 20 }, (_, index) => index);
    let calls = 0;
    const result = intersectionBy(first, second, third, (value: unknown) => {
      calls += 1;
      return value;
    });
    expect(result).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(calls).toBe(50 + 30 + 20);
  });

  it('does not re-evaluate secondaries per duplicate candidate', () => {
    const first = [1, 1, 1, 1, 1];
    const second = Array.from({ length: 10 }, (_, index) => index);
    let calls = 0;
    const result = intersectionBy(first, second, (value: unknown) => {
      calls += 1;
      return value;
    });
    expect(result).toEqual([1]);
    expect(calls).toBe(5 + 10);
  });

  it('dedups first-occurrence values and preserves item references', () => {
    const keep = { id: 'a', label: 'first' };
    const dupe = { id: 'a', label: 'second' };
    const other = { id: 'b', label: 'third' };
    const second = [{ id: 'a', label: 'other' }];
    const result = intersectionBy([keep, dupe, other], second, 'id');
    expect(result).toEqual([keep]);
    expect(result[0]).toBe(keep);
  });

  it('matches projected object keys by reference, not content', () => {
    const shared = { key: 1 };
    const left = [{ ref: shared }];
    const rightSameRef = [{ ref: shared }];
    const rightClonedRef = [{ ref: { key: 1 } }];
    expect(intersectionBy(left, rightSameRef, (item) => (item as { ref: unknown }).ref)).toEqual(left);
    expect(intersectionBy(left, rightClonedRef, (item) => (item as { ref: unknown }).ref)).toEqual([]);
  });

  it('treats NaN as equal and signed zeros as equal, preserving first refs', () => {
    expect(intersectionBy([Number.NaN], [Number.NaN], (value: unknown) => value)).toEqual([Number.NaN]);
    const zeroResult = intersectionBy([-0], [0], (value: unknown) => value);
    expect(zeroResult.length).toBe(1);
    expect(Object.is(zeroResult[0], -0)).toBe(true);

    expect(uniq([Number.NaN, Number.NaN, 1])).toEqual([Number.NaN, 1]);
    const uniqZero = uniq([-0, 0]);
    expect(uniqZero.length).toBe(1);
    expect(Object.is(uniqZero[0], -0)).toBe(true);

    expect(uniqBy([Number.NaN, Number.NaN], (value: unknown) => value)).toEqual([Number.NaN]);
    expect(difference([Number.NaN], [Number.NaN])).toEqual([]);
    expect(difference([-0], [0])).toEqual([]);
    expect(intersection([Number.NaN], [Number.NaN])).toEqual([Number.NaN]);
    const interZero = intersection([-0], [0]);
    expect(interZero.length).toBe(1);
    expect(Object.is(interZero[0], -0)).toBe(true);
  });

  it('handles duplicates across helpers with first-occurrence order', () => {
    expect(intersectionBy([1, 1, 2, 2, 3], [1, 2], (value: unknown) => value)).toEqual([1, 2]);
    expect(intersection([1, 1, 2, 2, 3], [1, 2])).toEqual([1, 2]);
    expect(uniq([1, 1, 2, 2, 3])).toEqual([1, 2, 3]);
    expect(
      uniqBy(
        [
          { id: 'a', n: 1 },
          { id: 'a', n: 2 },
          { id: 'b', n: 3 },
        ],
        'id',
      ),
    ).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 3 },
    ]);
    expect(difference([1, 1, 2, 3], [2])).toEqual([1, 1, 3]);
  });

  it('intersects across three arrays by iteratee', () => {
    expect(intersectionBy([1, 2, 3], [2, 3, 4], [3, 4, 5], (value: unknown) => value)).toEqual([3]);
    expect(intersection([1, 2, 3], [2, 3], [3])).toEqual([3]);
    expect(difference([1, 2, 3], [2], [3])).toEqual([1]);
  });

  it('supports property-path iteratees without extra callback args changing results', () => {
    const rows = [
      { id: 1, v: 'a' },
      { id: 2, v: 'b' },
    ];
    const others = [{ id: 2, v: 'z' }];
    expect(intersectionBy(rows, others, 'id')).toEqual([{ id: 2, v: 'b' }]);
  });

  it('preserves chosen nullish semantics and documents the parity split', () => {
    // intersectionBy + difference ignore non-array values arguments.
    expect(intersectionBy([1, 2], null, (value: unknown) => value)).toEqual([1, 2]);
    expect(intersectionBy([1, 2], undefined, (value: unknown) => value)).toEqual([1, 2]);
    expect(difference([1, 2], null)).toEqual([1, 2]);
    expect(difference([1, 2], undefined)).toEqual([1, 2]);
    // intersection treats any non-array secondary as empty.
    expect(intersection([1, 2], null)).toEqual([]);
    expect(intersection([1, 2], undefined)).toEqual([]);
    // Empty and non-array first handling.
    expect(intersectionBy([], [1], (value: unknown) => value)).toEqual([]);
    expect(intersection([], [1])).toEqual([]);
    expect(intersection(null, [1])).toEqual([]);
    expect(uniq(null)).toEqual([]);
    expect(uniqBy(null, 'id')).toEqual([]);
    expect(uniqBy(undefined, (value: unknown) => value)).toEqual([]);
    expect(difference(null, [1])).toEqual([]);
  });

  it('does not mutate inputs and returns fresh arrays', () => {
    const first = [{ id: 1 }, { id: 2 }];
    const second = [{ id: 2 }];
    const firstSnapshot = JSON.parse(JSON.stringify(first));
    const secondSnapshot = JSON.parse(JSON.stringify(second));
    const result = intersectionBy(first, second, 'id');
    expect(first).toEqual(firstSnapshot);
    expect(second).toEqual(secondSnapshot);
    expect(result).not.toBe(first);

    const base = [3, 1, 3, 2];
    const baseSnapshot = [...base];
    const uniqResult = uniq(base);
    expect(base).toEqual(baseSnapshot);
    expect(uniqResult).toEqual([3, 1, 2]);

    const diffBase = [1, 2, 3];
    const diffExcluded = [2];
    const diffResult = difference(diffBase, diffExcluded);
    expect(diffBase).toEqual([1, 2, 3]);
    expect(diffExcluded).toEqual([2]);
    expect(diffResult).toEqual([1, 3]);
  });
});
