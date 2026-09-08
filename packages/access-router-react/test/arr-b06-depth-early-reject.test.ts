import { describe, it, expect, vi } from 'vitest';
import { requestKeyFor, sortKeyFor, RequestKeyError } from '../src/fetch';

function makeNestedArray(depth: number): unknown {
  let value: unknown = 0;
  for (let i = 0; i < depth; i++) {
    value = [value];
  }
  return value;
}

function wrapInArrays(inner: unknown, wrappers: number): unknown {
  let value: unknown = inner;
  for (let i = 0; i < wrappers; i++) {
    value = [value];
  }
  return value;
}

describe('ARR-B06: depth on cached subtrees + early oversize rejection', () => {
  it('shared over-depth throws when shallow visit comes first (cache-hit depth)', () => {
    const inner = makeNestedArray(40);
    // 'a' sorts before 'b': shallow occurrence caches `inner`, deep reuse must revalidate.
    const outer = { a: inner, b: wrapInArrays(inner, 30) };
    expect(() => requestKeyFor(outer)).toThrow(RequestKeyError);
  });

  it('shared over-depth throws independent of visitation order (deep first)', () => {
    const inner = makeNestedArray(40);
    // 'a' sorts first and holds the deep occurrence, so the depth breach
    // is hit during first traversal even without cache reuse.
    const outer = { a: wrapInArrays(inner, 30), b: inner };
    expect(() => requestKeyFor(outer)).toThrow(RequestKeyError);
  });

  it('copied over-depth with equivalent shape also throws (shared/copied consistent)', () => {
    const innerA = makeNestedArray(40);
    const innerB = makeNestedArray(40);
    const outer = { a: innerA, b: wrapInArrays(innerB, 30) };
    expect(() => requestKeyFor(outer)).toThrow(RequestKeyError);
  });

  it('within-limit shared reuse stays deterministic and matches copied shape', () => {
    const inner = makeNestedArray(10);
    const sharedOuter = { a: inner, b: wrapInArrays(inner, 10) };
    const copiedOuter = {
      a: makeNestedArray(10),
      b: wrapInArrays(makeNestedArray(10), 10),
    };
    expect(() => requestKeyFor(sharedOuter)).not.toThrow();
    expect(requestKeyFor(sharedOuter)).toBe(requestKeyFor(copiedOuter));
    // Repeated calls remain deterministic (per-call memoization, no global retention).
    expect(requestKeyFor(sharedOuter)).toBe(requestKeyFor(sharedOuter));
  });

  it('sortKeyFor enforces cached-subtree depth consistently with requestKeyFor', () => {
    const inner = makeNestedArray(40);
    const outer = { a: inner, b: wrapInArrays(inner, 30) };
    expect(() => sortKeyFor(outer)).toThrow(RequestKeyError);
  });

  it('oversized string fails before full JSON encoding', () => {
    const big = 'a'.repeat(250_000);
    const spy = vi.spyOn(JSON, 'stringify');
    try {
      spy.mockClear();
      expect(() => requestKeyFor(big)).toThrow(/maximum serialized key length/);
      // Preflight must throw before encoding the oversized payload itself.
      expect(spy.mock.calls.every((c) => c[0] !== big)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('oversized property name fails before full encoding without huge diagnostics', () => {
    const hugeKey = 'k'.repeat(250_000);
    const input: Record<string, unknown> = {};
    input[hugeKey] = 1;
    const spy = vi.spyOn(JSON, 'stringify');
    try {
      spy.mockClear();
      let caught: unknown;
      try {
        requestKeyFor(input);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(RequestKeyError);
      expect(spy.mock.calls.every((c) => c[0] !== hugeKey)).toBe(true);
      // Diagnostics must not embed the full huge key.
      const msg = (caught as Error).message;
      expect(msg.length).toBeLessThan(2000);
      expect(msg.includes(hugeKey)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('wide object fails before sorting (node-budget preflight)', () => {
    const width = 20_001;
    const input: Record<string, number> = {};
    for (let i = 0; i < width; i++) {
      input[`k${i}`] = i;
    }
    const sortSpy = vi.spyOn(Array.prototype, 'sort');
    try {
      sortSpy.mockClear();
      expect(() => requestKeyFor(input)).toThrow(/maximum (traversal budget|serialized key length)/);
      expect(sortSpy).not.toHaveBeenCalled();
    } finally {
      sortSpy.mockRestore();
    }
  });

  it('normal small-key determinism / collision / accessor behavior preserved', () => {
    expect(requestKeyFor({ a: 1, b: 2 })).toBe(requestKeyFor({ b: 2, a: 1 }));
    expect(requestKeyFor(['name'])).not.toBe(requestKeyFor(['name', 'status']));
    expect(requestKeyFor(new Date('2026-01-01T00:00:00.000Z'))).not.toBe(requestKeyFor('2026-01-01T00:00:00.000Z'));
    let calls = 0;
    const obj: object = {};
    Object.defineProperty(obj, 'count', {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    expect(() => requestKeyFor(obj)).toThrow(RequestKeyError);
    expect(calls).toBe(0);
  });
});
