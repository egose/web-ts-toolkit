import { describe, expect, it } from 'vitest';
import cloneDeep from '../src/cloneDeep.ts';
import omit from '../src/omit.ts';

/**
 * UTILS-04: bounded clone domain + non-aliasing omit.
 *
 * Documented contract under test:
 * - Supported: primitives, plain objects (null or Object.prototype),
 *   arrays, Date, RegExp. Cycles/repeated refs preserved via memo.
 * - Functions are opaque references (preserved by reference, not cloned).
 *   Exotic values nested in supported containers (class instances such as
 *   BSON `ObjectId`, `Map`/`Set`) are likewise shared by reference, never
 *   traversed. A top-level exotic root throws TypeError.
 * - Class instances, top-level `Map`/`Set`, and other non-plain roots throw
 *   `TypeError` instead of returning an alias that omit would mutate.
 * - Own enumerable string/symbol keys preserved with defineProperty-safe
 *   writes (`__proto__` stays an own key, never replaces the prototype).
 *   Accessors are materialized once as data properties.
 */
describe('clone fallback and omit non-aliasing (UTILS-04)', () => {
  it('rejects class-instance omit without mutating the input', () => {
    class Widget {
      keep = 1;
      other = 2;
    }
    const input = new Widget();

    expect(() => cloneDeep(input)).toThrow(TypeError);
    expect(() => omit(input, ['keep'])).toThrow(TypeError);
    expect(input.keep).toBe(1);
    expect(input.other).toBe(2);
  });

  it('clones cyclic plain objects with the cycle preserved', () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;

    const result = cloneDeep(input);

    expect(result).not.toBe(input);
    expect((result as Record<string, unknown>).a).toBe(1);
    expect((result as Record<string, unknown>).self).toBe(result);
  });

  it('clones function-bearing cyclic graphs without RangeError, keeping function identity', () => {
    const fn = () => 1;
    const input: Record<string, unknown> = { fn };
    input.self = input;

    const result = cloneDeep(input) as Record<string, unknown>;

    expect(result.fn as unknown).toBe(fn);
    expect(result.self).toBe(result);
  });

  it('keeps supported shared references shared within the clone but detached from inputs', () => {
    const shared = { x: 1 };
    const input = { p: shared, q: shared };

    const result = cloneDeep(input);

    expect(result.p).toBe(result.q);
    expect(result.p).not.toBe(shared);
    (result.p as { x: number }).x = 2;
    expect(shared.x).toBe(1);
  });

  it('detaches nested values so omitted results cannot mutate inputs', () => {
    const input = { a: { x: 1 }, b: 2 };

    const result = omit(input, ['b']) as Record<string, unknown>;

    expect(input).toEqual({ a: { x: 1 }, b: 2 });
    ((result.a as Record<string, unknown>).x as number) = 99;
    expect(input.a.x).toBe(1);
    expect(result).not.toBe(input);
  });

  it('omits nested paths without touching the original nested object', () => {
    const input = { a: { x: 1, y: 2 } };

    const result = omit(input, [['a', 'x']]) as Record<string, unknown>;

    expect(input).toEqual({ a: { x: 1, y: 2 } });
    expect(result).toEqual({ a: { y: 2 } });
  });

  it('retains documented array, Date, and RegExp behavior detached from inputs', () => {
    const date = new Date(1700000000000);
    const regex = /ab+gi/;
    const input = { list: [1, { n: 2 }], when: date, re: regex };

    const result = cloneDeep(input);

    expect(result.list).not.toBe(input.list);
    expect(result.list).toEqual([1, { n: 2 }]);
    ((result.list[1] as Record<string, unknown>).n as number) = 99;
    expect((input.list[1] as Record<string, number>).n).toBe(2);
    expect(result.when).not.toBe(date);
    expect(result.when.getTime()).toBe(date.getTime());
    expect(result.re).not.toBe(regex);
    expect(result.re.source).toBe(regex.source);
    expect(result.re.flags).toBe(regex.flags);
  });

  it('preserves an own __proto__ key without replacing the result prototype', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"a":1}') as Record<string, unknown>;

    const result = cloneDeep(input) as Record<string, unknown>;

    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.a).toBe(1);
  });

  it('rejects top-level Map/Set roots while sharing nested exotics by reference', () => {
    expect(() => cloneDeep(new Map([['a', 1]]))).toThrow(TypeError);
    expect(() => cloneDeep(new Set([1]))).toThrow(TypeError);

    // Nested exotics are opaque leaves: the container is detached, the leaf
    // itself is shared, and omitting a sibling path leaves the input intact.
    const shared = new Map([['a', 1]]);
    const holder = { m: shared, drop: 1 };
    const cloned = cloneDeep(holder);
    expect(cloned.m).toBe(shared);
    expect(cloned).not.toBe(holder);

    const result = omit(holder, ['drop']) as Record<string, unknown>;
    expect(result.m).toBe(shared);
    expect(holder).toEqual({ m: shared, drop: 1 });
    expect(shared.get('a')).toBe(1);
  });

  it('preserves ObjectId-like class instances nested in documents without corrupting them', () => {
    // Regression guard for the access-router-client model flow: documents
    // carry BSON ObjectIds. Native cloning strips their prototype (probed:
    // `structuredClone` yields a plain `{i0..i3}` object whose string form
    // differs), so nested exotics stay shared by reference instead.
    class ObjectId {
      constructor(private readonly hex: string) {}
      toString() {
        return this.hex;
      }
    }
    const id = new ObjectId('abc123');
    const doc = { _id: id, name: 'x' };

    const cloned = cloneDeep(doc);
    expect(cloned._id).toBe(id);
    expect(String(cloned._id)).toBe('abc123');
    expect(cloned).not.toBe(doc);

    const result = omit(doc, ['name']) as Record<string, unknown>;
    expect(result._id).toBe(id);
    expect(doc.name).toBe('x');
  });

  it('materializes accessors once as own data properties', () => {
    let calls = 0;
    const input = {
      get value() {
        calls += 1;
        return { n: 1 };
      },
    };

    const result = cloneDeep(input) as Record<string, unknown>;

    expect(calls).toBe(1);
    expect(Object.getOwnPropertyDescriptor(result, 'value')?.get).toBeUndefined();
    expect(result.value).toEqual({ n: 1 });
  });

  it('omits through Object.create ancestors without touching ancestor state (UTILS-02 coordination)', () => {
    const ancestor = { shared: { n: 1 } };
    const input = Object.create(ancestor) as Record<string, unknown>;
    input.own = 'kept';

    const result = omit(input, ['shared.n']) as Record<string, unknown>;

    expect(ancestor.shared).toEqual({ n: 1 });
    expect(result.own).toBe('kept');
    expect(Object.prototype.hasOwnProperty.call(input, 'shared')).toBe(false);
  });
});
