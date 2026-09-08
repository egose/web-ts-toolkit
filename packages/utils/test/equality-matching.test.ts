import { describe, expect, it } from 'vitest';
import isEqual from '../src/isEqual.ts';
import isMatch from '../src/isMatch.ts';

/**
 * UTILS-05: bounded deep-equality and partial-match contract.
 *
 * Documented contract under test (aligned with the UTILS-04 clone domain):
 * - Supported: primitives (`NaN` equals itself, `-0` equals `+0` via
 *   SameValueZero), plain objects (own enumerable string/symbol keys only;
 *   inherited state ignored, prototypes not compared), arrays (length +
 *   per-index own-presence + extra own keys), `Date` (by time), `RegExp`
 *   (by source + flags).
 * - Functions and exotic objects (`Map`/`Set`, class instances, etc.) use
 *   identity semantics: distinct references are never equal, even with
 *   identical contents or zero enumerable keys.
 * - Cyclic and repeated-reference supported graphs terminate via
 *   pair-aware bookkeeping. Repeated references compare by content;
 *   aliasing shape is not required to match.
 * - `isMatch` preserves ordinary partial matching but distinguishes
 *   absence from `undefined` (own-key presence is required) and never
 *   lets inherited properties satisfy a source key. Arrays use prefix
 *   semantics.
 */
describe('deep equality boundaries (UTILS-05)', () => {
  it('never equates distinct Maps, even with identical contents', () => {
    expect(isEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    // Conservative identity policy: same contents, distinct references.
    expect(isEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(false);
    const shared = new Map([['a', 1]]);
    expect(isEqual(shared, shared)).toBe(true);
    expect(isEqual(new Map(), {})).toBe(false);
  });

  it('never equates distinct functions via zero enumerable keys', () => {
    const left = () => 1;
    const right = () => 1;
    expect(isEqual(left, right)).toBe(false);
    expect(isEqual(left, left)).toBe(true);
    expect(isEqual(left, {})).toBe(false);
  });

  it('rejects incompatible built-in types (Date vs plain object)', () => {
    expect(isEqual(new Date(1000), {})).toBe(false);
    expect(isEqual({}, new Date(1000))).toBe(false);
    expect(isEqual(new Date(1000), new Date(1000))).toBe(true);
    expect(isEqual(new Date(1000), new Date(2000))).toBe(false);
    expect(isEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
    expect(isEqual(/ab+g/, {})).toBe(false);
    expect(isEqual(/ab+g/, /ab+g/)).toBe(true);
    expect(isEqual(/ab+g/, /ab+i/)).toBe(false);
  });

  it('compares NaN by value, including nested positions', () => {
    expect(isEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(isEqual({ n: Number.NaN }, { n: Number.NaN })).toBe(true);
    expect(isEqual({ n: Number.NaN }, { n: 0 })).toBe(false);
    expect(isEqual([Number.NaN], [Number.NaN])).toBe(true);
  });

  it('detects dirty-state-relevant nested differences', () => {
    const base = { name: 'a', tags: ['x', 'y'], meta: { n: 1 } };
    expect(isEqual(base, { name: 'a', tags: ['x', 'y'], meta: { n: 1 } })).toBe(true);
    expect(isEqual(base, { name: 'a', tags: ['x', 'y'], meta: { n: 2 } })).toBe(false);
    expect(isEqual(base, { name: 'a', tags: ['x', 'z'], meta: { n: 1 } })).toBe(false);
    expect(isEqual(base, { name: 'a', tags: ['x'], meta: { n: 1 } })).toBe(false);
    expect(isEqual({ m: new Map([['a', 1]]) }, { m: new Map([['a', 1]]) })).toBe(false);
  });

  it('terminates on cyclic graphs with documented results', () => {
    const left: Record<string, unknown> = { a: 1 };
    left.self = left;
    const right: Record<string, unknown> = { a: 1 };
    right.self = right;
    expect(isEqual(left, right)).toBe(true);

    const changed: Record<string, unknown> = { a: 2 };
    changed.self = changed;
    expect(isEqual(left, changed)).toBe(false);

    // Cross-linked pair: terminates and compares by content.
    const leftA: Record<string, unknown> = { tag: 'x' };
    const leftB: Record<string, unknown> = { tag: 'x' };
    leftA.peer = leftB;
    leftB.peer = leftA;
    const rightA: Record<string, unknown> = { tag: 'x' };
    const rightB: Record<string, unknown> = { tag: 'x' };
    rightA.peer = rightB;
    rightB.peer = rightA;
    expect(isEqual(leftA, rightA)).toBe(true);
    rightB.tag = 'y';
    expect(isEqual(leftA, rightA)).toBe(false);
  });

  it('compares repeated references by content without requiring aliasing shape', () => {
    const shared = { x: 1 };
    const aliased = { p: shared, q: shared };
    const duplicated = { p: { x: 1 }, q: { x: 1 } };
    expect(isEqual(aliased, duplicated)).toBe(true);
    expect(isEqual(duplicated, aliased)).toBe(true);
    expect(isEqual(aliased, { p: { x: 1 }, q: { x: 2 } })).toBe(false);
  });

  it('does not let inherited properties satisfy own-key comparison', () => {
    expect(isEqual({ a: 1 }, Object.create({ a: 1 }))).toBe(false);
    expect(isEqual(Object.create({ a: 1 }), { a: 1 })).toBe(false);
    // Inherited extras are ignored: only own keys participate.
    const withInherited = Object.assign(Object.create({ ignored: true }), { a: 1 });
    expect(isEqual({ a: 1 }, withInherited)).toBe(true);
  });

  it('compares own symbol keys', () => {
    const sym = Symbol('k');
    const other = Symbol('k');
    expect(isEqual({ [sym]: 1 }, {})).toBe(false);
    expect(isEqual({ [sym]: 1 }, { [sym]: 1 })).toBe(true);
    expect(isEqual({ [sym]: 1 }, { [sym]: 2 })).toBe(false);
    expect(isEqual({ [sym]: 1 }, { [other]: 1 })).toBe(false);
  });

  it('distinguishes holes from explicit undefined and extra array keys', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(isEqual([,], [undefined])).toBe(false);
    const withExtra = [1] as unknown as Record<string, unknown>;
    withExtra.note = 'x';
    expect(isEqual(withExtra, [1])).toBe(false);
    expect(isEqual([1, 2], [1, 2])).toBe(true);
    expect(isEqual([1], { 0: 1, length: 1 })).toBe(false);
  });

  it('compares class instances by identity, not by own-key content', () => {
    class Widget {
      keep = 1;
    }
    const instance = new Widget();
    expect(isEqual(instance, { keep: 1 })).toBe(false);
    expect(isEqual(instance, instance)).toBe(true);
    expect(isEqual(new Widget(), new Widget())).toBe(false);
  });
});

describe('partial matching boundaries (UTILS-05)', () => {
  it('distinguishes absence from undefined', () => {
    expect(isMatch({}, { a: undefined })).toBe(false);
    expect(isMatch({ a: undefined }, { a: undefined })).toBe(true);
    expect(isMatch({ a: 1 }, { a: undefined })).toBe(false);
  });

  it('preserves ordinary partial matching, including nested sources', () => {
    expect(isMatch({ a: 1, b: 2 }, { a: 1 })).toBe(true);
    expect(isMatch({ a: 1, b: 2 }, { a: 2 })).toBe(false);
    expect(isMatch({ a: 1, b: 2 }, {})).toBe(true);
    expect(isMatch({ nested: { x: 1, y: 2 } }, { nested: { x: 1 } })).toBe(true);
    expect(isMatch({ nested: { x: 1, y: 2 } }, { nested: { x: 9 } })).toBe(false);
    expect(isMatch({ nested: { x: 1 } }, { nested: { x: 1, y: 2 } })).toBe(false);
  });

  it('never lets inherited properties satisfy a source key', () => {
    const inherited = Object.create({ a: 1 }) as Record<string, unknown>;
    expect(isMatch(inherited, { a: 1 })).toBe(false);
    const own = { a: 1 } as Record<string, unknown>;
    expect(isMatch(own, { a: 1 })).toBe(true);
  });

  it('uses documented prefix semantics for arrays', () => {
    expect(isMatch([1, 2, 3], [1, 2])).toBe(true);
    expect(isMatch([1, 2], [1, 2, 3])).toBe(false);
    expect(isMatch([1, 2, 3], [1, 9])).toBe(false);
    expect(isMatch([{ x: 1, y: 2 }], [{ x: 1 }])).toBe(true);
    // An explicit source element requires an own element on the object.
    // eslint-disable-next-line no-sparse-arrays
    expect(isMatch([1, ,], [1, undefined])).toBe(false);
  });

  it('falls back to deep equality for Date and opaque sources', () => {
    expect(isMatch(new Date(1000), new Date(1000))).toBe(true);
    expect(isMatch(new Date(1000), new Date(2000))).toBe(false);
    // An empty source imposes no constraints (vacuous match); the
    // incompatible-type case is an empty object against a Date source.
    expect(isMatch(new Date(1000), {})).toBe(true);
    expect(isMatch({}, new Date(1000))).toBe(false);
    const map = new Map([['a', 1]]);
    expect(isMatch(map, map)).toBe(true);
    expect(isMatch(map, new Map([['a', 1]]))).toBe(false);
  });

  it('terminates on cyclic patterns with documented results', () => {
    const pattern: Record<string, unknown> = { a: 1 };
    pattern.self = pattern;
    const object: Record<string, unknown> = { a: 1, extra: true };
    object.self = object;
    expect(isMatch(object, pattern)).toBe(true);

    const other: Record<string, unknown> = { a: 2 };
    other.self = other;
    expect(isMatch(other, pattern)).toBe(false);
  });

  it('matches own symbol keys in the source', () => {
    const sym = Symbol('k');
    expect(isMatch({ [sym]: 1, extra: true }, { [sym]: 1 })).toBe(true);
    expect(isMatch({ extra: true }, { [sym]: 1 })).toBe(false);
    expect(isMatch({ [sym]: 2 }, { [sym]: 1 })).toBe(false);
  });
});
