import { isDeepStrictEqual } from 'node:util';
import { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyAuthorizationValue,
  matchesAuthorizationSnapshot,
  ServiceAuthorizationError,
} from '../src/acl/authorization-snapshot';

const bson = mongo.BSON;
const hex = '0123456789abcdef01234567';
type Matcher = typeof matchesAuthorizationSnapshot;

// Retain the reference contract and all observation-order regressions even after
// SNAPCPU-06 withdrew the slower tape. The ownership copier stays unchanged.
const oracle: Matcher = (value, snapshot) => {
  try {
    return isDeepStrictEqual(copyAuthorizationValue(value, 'document'), snapshot);
  } catch {
    return false;
  }
};

function agrees(value: unknown, snapshot: unknown, expected?: boolean): void {
  const previous = oracle(value, snapshot);
  expect(matchesAuthorizationSnapshot(value, snapshot)).toBe(previous);
  if (expected !== undefined) expect(previous).toBe(expected);
}

function nested(depth: number, leaf: unknown = 0): unknown {
  for (let i = 0; i < depth; i++) leaf = { child: leaf };
  return leaf;
}

function hidden(value: unknown): object {
  return Object.defineProperty({}, 'hidden', { value });
}

afterEach(() => vi.restoreAllMocks());

describe('SNAPCPU-04 ordinary snapshot differential', () => {
  it('agrees on 512 deterministic generated graphs, changed sources and changed snapshots', () => {
    const primitives = [null, undefined, false, true, 0, -0, NaN, Infinity, -Infinity, 123n, '', '雪'];
    for (let seed = 1; seed <= 512; seed++) {
      let state = seed;
      const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
      const aliases: unknown[] = [];
      function generate(depth: number): unknown {
        if (!depth || next() % 4 === 0) return primitives[next() % primitives.length];
        if (aliases.length && next() % 7 === 0) return aliases[next() % aliases.length];
        let result: any;
        if (next() % 2) {
          result = Array(next() % 6);
          for (let i = 0; i < result.length; i++) {
            if (next() % 3)
              Object.defineProperty(result, String(i), { value: generate(depth - 1), enumerable: !!(next() % 2) });
          }
        } else {
          result = Object.create(next() % 2 ? Object.prototype : null);
          for (let i = 0, count = next() % 5; i < count; i++) {
            Object.defineProperty(result, `${next() % 2 ? 'field' : '雪'}${i}`, {
              value: generate(depth - 1),
              enumerable: !!(next() % 2),
            });
          }
        }
        if (next() % 3 === 0) Object.freeze(result);
        aliases.push(result); // Only completed nodes: shared aliases, never active cycles.
        return result;
      }
      const source = { payload: generate(4), stable: 'original' };
      const snapshot = copyAuthorizationValue(source, 'document');
      agrees(source, snapshot, true);
      agrees(source, { ...snapshot, stable: 'different' }, false);
      source.stable = 'changed';
      agrees(source, snapshot, false);
    }
  });

  it.each([
    { name: 'NaN', value: NaN, snapshot: NaN, expected: true },
    { name: 'negative zero', value: -0, snapshot: 0, expected: false },
    { name: 'bigint', value: 123n, snapshot: 123n, expected: true },
    { name: 'undefined', value: { value: undefined }, snapshot: { value: undefined }, expected: true },
    { name: 'missing vs undefined', value: {}, snapshot: { value: undefined }, expected: false },
    { name: 'different key order', value: { b: 1, a: 2 }, snapshot: { a: 2, b: 1 }, expected: true },
    { name: 'non-enumerable document data', value: hidden(1), snapshot: { hidden: 1 }, expected: true },
    { name: 'snapshot non-enumerable data is not normalized', value: hidden(1), snapshot: hidden(1), expected: false },
    { name: 'snapshot-only hidden data', value: {}, snapshot: hidden(1), expected: true },
    {
      name: 'null source prototype',
      value: Object.assign(Object.create(null), { a: 1 }),
      snapshot: { a: 1 },
      expected: true,
    },
    {
      name: 'null target prototype',
      value: { a: 1 },
      snapshot: Object.assign(Object.create(null), { a: 1 }),
      expected: false,
    },
    { name: 'array holes', value: Array(3), snapshot: Array(3), expected: true },
    { name: 'holes are not undefined', value: Array(1), snapshot: [undefined], expected: false },
    { name: 'different array length', value: Array(2), snapshot: Array(3), expected: false },
    {
      name: 'hidden array index',
      value: Object.defineProperty(Array(2), '1', { value: 1 }),
      snapshot: Object.assign(Array(2), { 1: 1 }),
      expected: true,
    },
    {
      name: 'hidden target array index',
      value: [1],
      snapshot: Object.defineProperty(Array(1), '0', { value: 1 }),
      expected: true,
    },
    { name: 'null array prototype', value: Object.setPrototypeOf([1], null), snapshot: [1], expected: true },
    { name: 'array subclass', value: new (class extends Array {})(1, 2), snapshot: [1, 2], expected: true },
    {
      name: 'large non-index array property',
      value: Object.assign([], { 4294967295: 1 }),
      snapshot: Object.assign([], { 4294967295: 1 }),
      expected: true,
    },
    {
      name: 'huge numeric array property',
      value: Object.assign([], { ['999999999999999999999']: 1 }),
      snapshot: Object.assign([], { ['999999999999999999999']: 1 }),
      expected: true,
    },
  ])('$name', ({ value, snapshot, expected }) => agrees(value, snapshot, expected));

  it.each(['__proto__', 'constructor', 'prototype', Symbol('own')])(
    'rejects unsafe own key %s, even for identity/frozen targets',
    (key) => {
      const source = Object.freeze(Object.defineProperty({}, key, { value: 1, enumerable: true }));
      expect(() => copyAuthorizationValue(source, 'document')).toThrow(ServiceAuthorizationError);
      agrees(source, source, false);
      agrees({ nested: source }, { nested: source }, false);
    },
  );

  it.each(['01', '-1', '1.0', 'extra', '__proto__', 'constructor', 'prototype', Symbol('array')])(
    'rejects invalid array key %s',
    (key) => {
      const source = Object.defineProperty([], key, { value: 1, enumerable: true });
      agrees(source, source, false);
    },
  );

  it.each([
    () => true,
    Symbol('value'),
    { value: () => true },
    { value: Symbol('nested') },
    Object.create({ value: 1 }),
  ])('rejects unsupported input %#', (source) => {
    expect(() => copyAuthorizationValue(source, 'document')).toThrow(ServiceAuthorizationError);
    agrees(source, source, false);
  });

  it.each([false, true])('rejects %s-enumerable accessors without invoking them', (enumerable) => {
    const getter = vi.fn(() => {
      throw new Error('must not execute');
    });
    for (const source of [
      Object.defineProperty({}, 'value', { get: getter, enumerable }),
      Object.defineProperty([], '0', { get: getter, enumerable }),
    ]) {
      agrees(source, source, false);
      agrees({ nested: source }, {}, false);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('tracks active cycles, not repeated aliases or snapshot identity', () => {
    const shared = { value: [1, NaN, -0] };
    const source = { a: shared, b: shared };
    agrees(source, copyAuthorizationValue(source, 'document'), true);
    agrees(source, source, true);
    const cyclic: any = { a: 1 };
    cyclic.self = cyclic;
    agrees(cyclic, cyclic, false);
    const array: any[] = [];
    array.push(array);
    agrees(array, array, false);
    agrees(source, { a: shared, b: cyclic }, false);
  });

  it.each([
    { name: 'depth 100', source: () => nested(100), expected: true },
    { name: 'depth 101', source: () => nested(101), expected: false },
    { name: '20,000 total nodes', source: () => Array(19999).fill(0), expected: true },
    { name: '20,001 total nodes', source: () => Array(20000).fill(0), expected: false },
    { name: '20,000 sparse length', source: () => Array(20000), expected: true },
    { name: '20,001 sparse length', source: () => Array(20001), expected: false },
    { name: 'repeated aliases within budget', source: () => Array(9999).fill({ value: 0 }), expected: true },
    { name: 'repeated aliases exceed budget', source: () => Array(10000).fill({ value: 0 }), expected: false },
    {
      name: 'Map shares enclosing node budget',
      source: () => ({ prefix: Array(9998).fill(0), map: new Map([[0, Array(9997).fill(0)]]) }),
      expected: true,
    },
    {
      name: 'Map cannot reset enclosing node budget',
      source: () => ({ prefix: Array(9998).fill(0), map: new Map([[0, Array(9998).fill(0)]]) }),
      expected: false,
    },
    {
      name: 'Set shares enclosing node budget',
      source: () => ({ prefix: Array(9999).fill(0), set: new Set([Array(9997).fill(0)]) }),
      expected: true,
    },
    {
      name: 'Set cannot reset enclosing node budget',
      source: () => ({ prefix: Array(9999).fill(0), set: new Set([Array(9998).fill(0)]) }),
      expected: false,
    },
    { name: 'Map cannot reset depth', source: () => nested(100, new Map([[0, 1]])), expected: false },
    { name: 'Set cannot reset depth', source: () => nested(100, new Set([0])), expected: false },
  ])('preserves $name', ({ source: create, expected }) => {
    const source = create();
    if (expected) agrees(source, copyAuthorizationValue(source, 'document'), true);
    else {
      expect(() => copyAuthorizationValue(source, 'document')).toThrow(ServiceAuthorizationError);
      agrees(source, source, false);
    }
  });
});

interface Fixture {
  value: unknown;
  snapshot: unknown;
  events: string[];
  final?: () => unknown;
}

function differentialEffects(create: () => Fixture, expected?: boolean): void {
  function run(match: Matcher) {
    const fixture = create();
    const result = match(fixture.value, fixture.snapshot);
    return { result, events: fixture.events, final: fixture.final?.() };
  }
  // Recent Node versions switch their internal cycle detector permanently after
  // the first equality exception (retrying that first getter once). Warm it with
  // a fresh fixture so both algorithms see the same process-global state.
  run(oracle);
  const previous = run(oracle);
  expect(run(matchesAuthorizationSnapshot)).toEqual(previous);
  if (expected !== undefined) expect(previous.result).toBe(expected);
}

const nonIndexArrayKeys = [
  { name: 'first non-index', key: '4294967295' },
  { name: 'large finite decimal', key: '999999999999999999999' },
  { name: 'Infinity-rounded decimal', key: '9'.repeat(400) },
];

describe('SNAPCPU-04 numeric non-index array fallback', () => {
  it.each(['2147483647', '4294967294'])(
    'keeps actual index %s distinct from non-index properties without large allocation',
    (key) => {
      const snapshot = [1];
      const getter = vi.fn(() => 1);
      Object.defineProperty(snapshot, key, { enumerable: true, get: getter });
      // Defining one sparse index changes length, but does not allocate its holes.
      agrees([1], snapshot, false);
      expect(operations(() => matchesAuthorizationSnapshot([1], snapshot))).toEqual({
        result: false,
        definitions: 1,
        freezes: 1,
      });
      expect(getter).not.toHaveBeenCalled();
      const oversized = Object.defineProperty([], key, { value: 1, enumerable: true });
      expect(() => copyAuthorizationValue(oversized, 'document')).toThrow(ServiceAuthorizationError);
      agrees(oversized, oversized, false); // The original 20,000-length limit remains.
    },
  );

  it.each(
    nonIndexArrayKeys.flatMap(({ name, key }) =>
      ['dense', 'sparse', 'hidden source', 'nested'].map((shape) => ({ name, key, shape })),
    ),
  )('delegates $name extra-property getters before $shape array indices', ({ key, shape }) => {
    differentialEffects(() => {
      const events: string[] = [];
      const index = shape === 'sparse' ? 1 : 0;
      const value = Array(index + 1);
      const snapshot = Array(index + 1);
      value[index] = 1;
      snapshot[index] = 2;
      Object.defineProperty(value, key, { value: 'extra', enumerable: shape !== 'hidden source' });
      Object.defineProperty(snapshot, key, {
        enumerable: true,
        get() {
          events.push('extra');
          snapshot[index] = 1;
          return 'extra';
        },
      });
      return {
        value: shape === 'nested' ? { rows: [{ value }] } : value,
        snapshot: shape === 'nested' ? { rows: [{ value: snapshot }] } : snapshot,
        events,
        final: () => snapshot[index],
      };
    }, true);
  });

  it.each(nonIndexArrayKeys.flatMap(({ name, key }) => [false, true].map((enumerable) => ({ name, key, enumerable }))))(
    'handles a target-only $name extra (enumerable: $enumerable) before any fast index denial',
    ({ key, enumerable }) => {
      for (const matchingIndex of [false, true]) {
        const create = () => {
          const events: string[] = [];
          const snapshot = [matchingIndex ? 1 : 2];
          Object.defineProperty(snapshot, key, {
            enumerable,
            get() {
              events.push('unexpected extra');
              snapshot[0] = 1;
              return 'extra';
            },
          });
          return { value: [1], snapshot, events, final: () => snapshot[0] };
        };
        const expected = !enumerable && matchingIndex;
        differentialEffects(create, expected);
        const fixture = create();
        expect(operations(() => matchesAuthorizationSnapshot(fixture.value, fixture.snapshot))).toEqual({
          result: expected,
          definitions: 1,
          freezes: 1,
        });
        expect(fixture.events).toEqual([]); // Missing/hidden extras do not invoke getters in Node.
      }
    },
  );

  it.each(nonIndexArrayKeys)(
    'normalizes a source-only hidden $name extra before Node checks index getters',
    ({ key }) => {
      differentialEffects(() => {
        const events: string[] = [];
        const value = Object.defineProperty([1], key, { value: 'extra' });
        const snapshot = Object.defineProperty([1], '0', {
          enumerable: true,
          get() {
            events.push('unexpected index');
            return 1;
          },
        });
        return { value, snapshot, events };
      }, false);
    },
  );

  it.each(nonIndexArrayKeys)('does not replay wire normalization when a hook introduces a $name extra', ({ key }) => {
    vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...bson });
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    const deserialize = vi.spyOn(mongo.BSON, 'deserialize');
    function run(match: Matcher) {
      const events: string[] = [];
      const value = [1];
      const snapshot = [2];
      const native = Object.assign(new bson.ObjectId(hex), {
        toBSON() {
          events.push('wire');
          Object.defineProperty(value, key, { value: 'extra', enumerable: true });
          return 'wire';
        },
      });
      Object.defineProperty(snapshot, key, {
        enumerable: true,
        get() {
          events.push('extra');
          snapshot[0] = 1;
          return 'extra';
        },
      });
      serialize.mockClear();
      deserialize.mockClear();
      const result = match({ native, value }, { native: 'wire', value: snapshot });
      return {
        result,
        events,
        first: snapshot[0],
        serializations: serialize.mock.calls.length,
        deserializations: deserialize.mock.calls.length,
      };
    }
    const previous = run(oracle);
    expect(previous).toEqual({
      result: true,
      events: ['wire', 'extra'],
      first: 1,
      serializations: 1,
      deserializations: 1,
    });
    expect(run(matchesAuthorizationSnapshot)).toEqual(previous);
  });

  it.each(nonIndexArrayKeys)('retains the conservative copy cost for a $name extra', ({ key }) => {
    const value = Object.defineProperty([1], key, { value: 'extra', enumerable: true });
    const snapshot = copyAuthorizationValue(value, 'document');
    const previous = operations(() => oracle(value, snapshot));
    expect(previous).toEqual({ result: true, definitions: 2, freezes: 1 });
    expect(operations(() => matchesAuthorizationSnapshot(value, snapshot))).toEqual(previous);
  });

  it.each(['dense', 'sparse'])('retains bounded %s array normalization after tape withdrawal', (shape) => {
    const value = shape === 'dense' ? [1, NaN, -0] : Object.assign(Array(3), { 0: 1, 2: undefined });
    const snapshot = copyAuthorizationValue(value, 'document');
    const allocation = { definitions: shape === 'dense' ? 3 : 2, freezes: 1 };
    expect(operations(() => matchesAuthorizationSnapshot(value, snapshot))).toEqual({
      result: true,
      ...allocation,
    });
    value[0] = 2;
    expect(operations(() => matchesAuthorizationSnapshot(value, snapshot))).toEqual({
      result: false,
      ...allocation,
    });
  });
});

describe('SNAPCPU-04 normalization/equality observation order', () => {
  it.each(['plain', 'array', 'throw', 'constructor', 'tag', 'proxy'] as const)(
    'does not inspect an arbitrary %s target before normalization completes',
    (kind) => {
      differentialEffects(() => {
        const events: string[] = [];
        const id = Object.assign(new bson.ObjectId(hex), {
          toBSON() {
            events.push('wire');
            return 'wire';
          },
        });
        let snapshot: any = kind === 'array' ? ['wire'] : { id: 'wire' };
        if (kind === 'plain' || kind === 'throw') {
          Object.defineProperty(snapshot, 'id', {
            enumerable: true,
            get() {
              events.push('target getter');
              if (kind === 'throw') throw new Error('target');
              return 'wire';
            },
          });
        } else if (kind === 'constructor') {
          Object.defineProperty(snapshot, 'constructor', {
            get() {
              events.push('target constructor');
              return Object;
            },
          });
        } else if (kind === 'tag') {
          Object.defineProperty(snapshot, Symbol.toStringTag, {
            get() {
              events.push('target tag');
              return undefined;
            },
          });
        } else if (kind === 'proxy') {
          snapshot = new Proxy(snapshot, {
            get(target, key, receiver) {
              events.push(`get:${String(key)}`);
              return Reflect.get(target, key, receiver);
            },
            getPrototypeOf(target) {
              events.push('prototype');
              return Reflect.getPrototypeOf(target);
            },
            ownKeys(target) {
              events.push('keys');
              return Reflect.ownKeys(target);
            },
            getOwnPropertyDescriptor(target, key) {
              events.push(`descriptor:${String(key)}`);
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
          });
        }
        return { value: kind === 'array' ? [id] : { id }, snapshot, events };
      });
    },
  );

  it('compares a snapshot-native accessor only during the original equality operation', () => {
    differentialEffects(() => {
      const events: string[] = [];
      const value = new bson.Long(1, 2);
      const snapshot = new bson.Long(1, 2);
      Object.defineProperty(snapshot, 'low', {
        enumerable: true,
        get() {
          events.push('snapshot low');
          return 1;
        },
      });
      return { value: { native: value }, snapshot: { native: snapshot }, events };
    }, true);
  });

  it.each([
    'native allow',
    'native deny',
    'early deny',
    'hidden later data',
    'ignored getter',
    'reordered getter',
  ] as const)('retains equality callback/short-circuit order with %s', (kind) => {
    differentialEffects(() => {
      const events: string[] = [];
      const value = { first: 1, native: new bson.Long(1, 2), last: 1 };
      const snapshot: any = {
        first: kind === 'early deny' ? 2 : 1,
        native: new bson.Long(kind === 'native deny' ? 2 : 1, 2),
        last: 1,
      };
      if (kind === 'hidden later data') {
        Object.defineProperty(snapshot, 'last', { enumerable: false });
        Object.defineProperty(snapshot.native, 'low', {
          enumerable: true,
          get() {
            events.push('native getter');
            return 1;
          },
        });
      } else if (kind === 'ignored getter') {
        Object.defineProperty(snapshot, 'ignored', {
          get() {
            events.push('unexpected hidden getter');
            throw new Error('ignored');
          },
        });
      } else {
        const getter = {
          enumerable: true,
          get() {
            events.push('last getter');
            return 1;
          },
        };
        if (kind === 'reordered getter') {
          delete snapshot.last;
          const reordered: any = {};
          Object.defineProperty(reordered, 'last', getter);
          Object.assign(reordered, snapshot);
          return { value, snapshot: reordered, events };
        }
        Object.defineProperty(snapshot, 'last', getter);
      }
      return { value, snapshot, events };
    }, !['native deny', 'early deny', 'hidden later data'].includes(kind));
  });

  it('performs target constructor observations even when an ordinary field already differs', () => {
    differentialEffects(() => {
      const events: string[] = [];
      const snapshot = { first: 2 };
      Object.defineProperty(snapshot, 'constructor', {
        get() {
          events.push('constructor');
          return Object;
        },
      });
      return { value: { first: 1 }, snapshot, events };
    }, false);
  });

  it('does not inspect array index accessors when Node would reject the length first', () => {
    differentialEffects(() => {
      const events: string[] = [];
      const snapshot = Array(2);
      Object.defineProperty(snapshot, '0', {
        enumerable: true,
        get() {
          events.push('unexpected index getter');
          throw new Error('index');
        },
      });
      return { value: [new bson.Long(1, 2)], snapshot, events };
    }, false);
  });

  it.each(['record', 'array'] as const)('retains exact %s source proxy observations on whole-tree fallback', (kind) => {
    differentialEffects(() => {
      const events: string[] = [];
      const input = kind === 'record' ? { value: 1 } : [1];
      const value = new Proxy(input, {
        get(target, key, receiver) {
          events.push(`get:${String(key)}`);
          return Reflect.get(target, key, receiver);
        },
        getPrototypeOf(target) {
          events.push('prototype');
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          events.push('keys');
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          events.push(`descriptor:${String(key)}`);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      return { value: { nested: value }, snapshot: { nested: input }, events };
    }, true);
  });

  it('does not reread an earlier primitive/record after a later wire hook mutates it', () => {
    differentialEffects(() => {
      const events: string[] = [];
      const value = { before: { value: 'original' }, native: new bson.ObjectId(hex), after: 0 };
      Object.assign(value.native, {
        toBSON() {
          events.push('wire');
          value.before.value = 'changed';
          value.after = 7;
          return 'wire';
        },
      });
      return {
        value,
        snapshot: { before: { value: 'original' }, native: 'wire', after: 7 },
        events,
        final: () => [value.before.value, value.after],
      };
    }, true);
  });

  it('compares earlier snapshot fields only after wire normalization has finished', () => {
    differentialEffects(() => {
      const events: string[] = [];
      const snapshot = { before: 'stale', native: 'wire' };
      const value = { before: 'original', native: new bson.ObjectId(hex) };
      Object.assign(value.native, {
        toBSON() {
          events.push('wire');
          snapshot.before = 'original';
          return 'wire';
        },
      });
      return { value, snapshot, events, final: () => snapshot.before };
    }, true);
  });

  it.each([0, 1, 3, 20001])(
    'retains array length %s assigned by a wire hook after earlier indices were normalized',
    (length) => {
      differentialEffects(() => {
        const events: string[] = [];
        const native = new bson.ObjectId(hex);
        const value = [1, native];
        Object.assign(value, { 4294967295: 'not an array index' });
        Object.assign(native, {
          toBSON() {
            events.push('wire');
            value.length = length;
            return 'wire';
          },
        });
        const snapshot: unknown[] = [1, 'wire'];
        snapshot.length = length;
        Object.assign(snapshot, { 4294967295: 'not an array index' });
        return { value, snapshot, events, final: () => value.length };
      }, true);
    },
  );

  it.each(['coercible', 'invalid', 'string'] as const)(
    'normalizes a proxy array final length (%s) before visiting the next field',
    (kind) => {
      differentialEffects(() => {
        const events: string[] = [];
        let reads = 0;
        const value = { array: [] as unknown[], after: 0, native: new bson.ObjectId(hex) };
        value.array = new Proxy([1], {
          get(target, key, receiver) {
            if (key !== 'length') return Reflect.get(target, key, receiver);
            events.push('length');
            if (++reads === 1) return 1;
            if (kind === 'invalid') return NaN;
            if (kind === 'string') return '0';
            return {
              valueOf() {
                events.push('length coercion');
                value.after = 7;
                return 0;
              },
            };
          },
        });
        Object.assign(value.native, {
          toBSON() {
            events.push('wire');
            return 'wire';
          },
        });
        return { value, snapshot: { array: [], after: kind === 'coercible' ? 7 : 0, native: 'wire' }, events };
      }, kind !== 'invalid');
    },
  );

  it.each(['Map', 'Set', 'Date', 'proxy', 'accessor', 'deleted', 'added', 'cycle'] as const)(
    'handles a wire hook introducing a later %s without replaying earlier hooks',
    (kind) => {
      differentialEffects(() => {
        const events: string[] = [];
        const value: any = { before: 1, native: new bson.ObjectId(hex), after: { value: 1 } };
        let after: unknown = { value: 1 };
        if (kind === 'Map') after = new Map([[{ key: 1 }, { value: 2 }]]);
        else if (kind === 'Set') after = new Set([{ value: 2 }]);
        else if (kind === 'Date') after = new Date(3);
        Object.assign(value.native, {
          toBSON() {
            events.push('wire');
            value.before = 2;
            if (kind === 'proxy')
              value.after = new Proxy(value.after, {
                ownKeys(target) {
                  events.push('source keys');
                  return Reflect.ownKeys(target);
                },
              });
            else if (kind === 'accessor')
              Object.defineProperty(value, 'after', {
                get() {
                  events.push('unexpected getter');
                  return 1;
                },
              });
            else if (kind === 'deleted') delete value.after;
            else if (kind === 'added') value.added = 'not in original ownKeys';
            else if (kind === 'cycle') value.after = value;
            else value.after = after;
            return 'wire';
          },
        });
        return { value, snapshot: { before: 1, native: 'wire', after }, events, final: () => value.before };
      }, !['accessor', 'deleted', 'cycle'].includes(kind));
    },
  );

  it('counts a native-introduced fallback subtree against already-visited nodes', () => {
    differentialEffects(() => {
      const events: string[] = [];
      const after = new Set([Array(10000).fill(0)]);
      const value = { prefix: Array(10000).fill(0), native: new bson.ObjectId(hex), after: new Set<unknown>() };
      Object.assign(value.native, {
        toBSON() {
          events.push('wire');
          value.after = after;
          return 'wire';
        },
      });
      return { value, snapshot: value, events };
    }, false);
  });

  it.each(['Map', 'Set'] as const)(
    'preserves %s eager iteration before entry normalization and unordered equality',
    (kind) => {
      differentialEffects(() => {
        const events: string[] = [];
        const id = new bson.ObjectId(hex);
        const input: Map<unknown, unknown> | Set<unknown> =
          kind === 'Map'
            ? new Map([
                [id, 1],
                ['second', 2],
              ])
            : new Set([id, 'second']);
        Object.assign(id, {
          toBSON() {
            events.push('wire');
            if (input instanceof Map) input.set('late', 3);
            else input.add('late');
            return 'wire';
          },
        });
        const iterator = input[Symbol.iterator].bind(input);
        Object.defineProperty(input, Symbol.iterator, {
          value() {
            events.push('iterate');
            return iterator();
          },
        });
        const snapshot =
          kind === 'Map'
            ? new Map<unknown, unknown>([
                ['second', 2],
                ['wire', 1],
              ])
            : new Set(['second', 'wire']);
        return { value: { input }, snapshot: { input: snapshot }, events, final: () => input.size };
      }, true);
    },
  );

  it.each(['reordered', 'duplicate', 'omitted', 'changed list', 'hidden unsafe key', 'hidden symbol'] as const)(
    'retains live own-key iteration normalization: %s',
    (kind) => {
      function run(match: Matcher) {
        const events: string[] = [];
        const value: Record<PropertyKey, unknown> = { before: 1, middle: 2, after: 3 };
        if (kind === 'hidden unsafe key') {
          delete value.middle;
          Object.defineProperty(value, 'constructor', { value: 2, enumerable: true });
        } else if (kind === 'hidden symbol') {
          delete value.middle;
          value[Symbol('hidden')] = 2;
        }
        const snapshot = kind === 'reordered' ? { ...value } : { before: 1, after: 3 };
        const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)!;
        try {
          Object.defineProperty(Array.prototype, Symbol.iterator, {
            ...descriptor,
            value(this: PropertyKey[]) {
              if (this.length !== 3 || this[0] !== 'before') return descriptor.value.call(this);
              events.push('iterate own keys');
              if (kind === 'changed list') this[1] = 'before';
              const keys =
                kind === 'reordered'
                  ? ['after', 'middle', 'before']
                  : kind === 'duplicate' || kind === 'changed list'
                    ? ['before', 'before', 'after']
                    : ['before', 'after'];
              let index = 0;
              return { next: () => ({ value: keys[index++], done: index > keys.length }) };
            },
          });
          return { result: match(value, snapshot), events };
        } finally {
          Object.defineProperty(Array.prototype, Symbol.iterator, descriptor);
        }
      }
      const previous = run(oracle);
      expect(run(matchesAuthorizationSnapshot)).toEqual(previous);
      expect(previous.result).toBe(true);
    },
  );

  it.each([
    { name: 'Set.has', prototype: Set.prototype, key: 'has' },
    { name: 'WeakSet.has', prototype: WeakSet.prototype, key: 'has' },
    { name: 'WeakSet.add', prototype: WeakSet.prototype, key: 'add' },
    { name: 'WeakSet.delete', prototype: WeakSet.prototype, key: 'delete' },
  ])('does not add $name application callbacks during comparison/fallback eligibility', ({ prototype, key }) => {
    function run(match: Matcher) {
      const events: string[] = [];
      const value = { first: 1, native: new bson.Long(1, 2), last: [1] };
      const snapshot = copyAuthorizationValue(value, 'document');
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)!;
      try {
        Object.defineProperty(prototype, key, {
          ...descriptor,
          value(this: unknown, entry: unknown) {
            events[events.length] = typeof entry === 'string' ? entry : typeof entry;
            return descriptor.value.call(this, entry);
          },
        });
        return { result: match(value, snapshot), events };
      } finally {
        Object.defineProperty(prototype, key, descriptor);
      }
    }
    const previous = run(oracle);
    expect(run(matchesAuthorizationSnapshot)).toEqual(previous);
    expect(previous.result).toBe(true);
  });

  it('retains native normalization to a large opaque wire value, not a reset or extra structural budget', () => {
    const native = Object.assign(new bson.ObjectId(hex), { toBSON: () => Array(20001).fill('value') });
    const value = { native };
    agrees(value, copyAuthorizationValue(value, 'document'), true);
  });

  it.each([
    new Date(1),
    /value/g,
    new Number(1),
    new String('s'),
    new Boolean(true),
    new Error('error'),
    new ArrayBuffer(2),
    new DataView(new ArrayBuffer(2)),
    new Uint8Array(2),
    new Map(),
    new Set(),
    new WeakMap(),
    new WeakSet(),
    Promise.resolve(1),
  ])('retains Node equality for a prototype-replaced exotic target %#', (snapshot) => {
    Object.setPrototypeOf(snapshot, Object.prototype);
    const value: Record<string, unknown> = {};
    for (const key of Object.keys(snapshot)) value[key] = (snapshot as any)[key];
    agrees(value, snapshot);
  });

  it('delegates unusual target prototypes to Node, including its version-specific constructor comparison', () => {
    agrees({ value: 1 }, Object.assign(Object.create({ constructor: Object }), { value: 1 }));
    agrees([1], Object.setPrototypeOf([1], { constructor: Array }));
  });

  it.each([false, true])(
    'delegates a BSON-derived target opposite an ordinary %s-populated record to Node',
    (populated) => {
      const prototype = Object.create(bson.BSONValue.prototype);
      Object.defineProperty(prototype, 'constructor', { value: Object });
      const snapshotValue = Object.create(prototype);
      const sourceValue = populated ? { value: 1 } : {};
      if (populated) snapshotValue.value = 1;
      // The separate real native leaf permits passive BSON equality elsewhere;
      // that does not prove matching prototype semantics for this ordinary slot.
      agrees(
        { native: new bson.Long(1, 2), value: sourceValue },
        { native: new bson.Long(1, 2), value: snapshotValue },
      );
    },
  );
});

describe('SNAPCPU-04 native differential', () => {
  it.each([
    { name: 'ObjectId', create: () => new bson.ObjectId(hex) },
    { name: 'Long', create: () => new bson.Long(1, 2) },
    { name: 'Decimal128', create: () => bson.Decimal128.fromString('1.20') },
  ])('retains exact nested $name proxy/wire observations without replay', ({ create }) => {
    differentialEffects(() => {
      const events: string[] = [];
      const native = create();
      const snapshot = copyAuthorizationValue(native, 'document');
      const value = new Proxy(native, {
        get(target, key, receiver) {
          events.push(`get:${String(key)}`);
          return Reflect.get(target, key, receiver);
        },
        getPrototypeOf(target) {
          events.push('prototype');
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          events.push('keys');
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, key) {
          events.push(`descriptor:${String(key)}`);
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      });
      return { value: { native: value }, snapshot: { native: snapshot }, events };
    }, true);
  });

  it.each([
    { name: 'ObjectId', create: () => new bson.ObjectId(hex) },
    { name: 'ObjectId subclass', create: () => new (class extends bson.ObjectId {})(hex) },
    { name: 'Long subclass', create: () => new (class extends bson.Long {})(1, 2, true) },
    { name: 'Decimal128', create: () => bson.Decimal128.fromString('1.20') },
    { name: 'Double NaN', create: () => new bson.Double(NaN) },
    { name: 'Double -0', create: () => new bson.Double(-0) },
    { name: 'Binary', create: () => new bson.Binary(Buffer.from([1, 2, 3]), 128) },
    { name: 'Code with scope', create: () => new bson.Code('value', { nested: { value: new bson.Long(1, 2) } }) },
    { name: 'BSON RegExp', create: () => new bson.BSONRegExp('value', 'mi') },
    {
      name: 'wire primitive string',
      create: () => Object.assign(new bson.ObjectId(hex), { toBSON: () => 'normalized' }),
    },
    { name: 'wire primitive null', create: () => Object.assign(new bson.ObjectId(hex), { toBSON: () => null }) },
    {
      name: 'wire ordinary object',
      create: () => Object.assign(new bson.ObjectId(hex), { toBSON: () => ({ value: 'normalized' }) }),
    },
    { name: 'Date', create: () => new Date(123) },
    { name: 'invalid Date', create: () => new Date(NaN) },
    { name: 'RegExp lastIndex', create: () => Object.assign(/abc/g, { lastIndex: 2 }) },
    { name: 'Buffer', create: () => Buffer.from([1, 2, 3]) },
    { name: 'Map', create: () => new Map([[{ value: 1 }, { values: [1, undefined] }]]) },
    { name: 'Set', create: () => new Set([{ value: 1 }, { value: 2 }]) },
  ])('matches/mismatches normalized $name without changing ownership copying', ({ name, create }) => {
    const value = { before: 'unchanged', native: create(), after: [NaN, -0] };
    const snapshot = copyAuthorizationValue(value, 'document');
    // Node changed invalid-Date equality; follow the runtime's oracle, not a
    // newer Node's result hardcoded into a package supporting Node 22 as well.
    agrees(value, snapshot, name === 'invalid Date' ? undefined : true);
    agrees(value, { ...snapshot, before: 'changed' }, false);
    agrees(value, { ...snapshot, after: [NaN, 0] }, false);
    agrees(value, { ...snapshot, native: 'wrong' }, false);
  });

  it.each(['Date', 'RegExp', 'Buffer', 'ObjectId', 'Long', 'version rejection', 'malformed ObjectId'] as const)(
    'preserves overridden %s methods/accessors and rejection observations',
    (kind) => {
      differentialEffects(() => {
        const events: string[] = [];
        let value: any;
        let snapshot: unknown;
        if (kind === 'Date') {
          value = new Date(1);
          Object.defineProperty(value, 'getTime', {
            get() {
              events.push('getTime');
              return () => {
                events.push('time');
                return 7;
              };
            },
          });
          snapshot = new Date(7);
        } else if (kind === 'RegExp') {
          value = /original/g;
          Object.defineProperty(value, 'source', {
            get() {
              events.push('source');
              return 'normalized';
            },
          });
          Object.defineProperty(value, 'flags', {
            get() {
              events.push('flags');
              return 'i';
            },
          });
          snapshot = /normalized/i;
        } else if (kind === 'Buffer') {
          value = Buffer.from([1, 2, 3]);
          Object.defineProperty(value, 'valueOf', {
            value() {
              events.push('valueOf');
              return this;
            },
          });
          snapshot = Buffer.from([1, 2, 3]);
        } else if (kind === 'Long') {
          value = new bson.Long(1, 2);
          Object.defineProperty(value, 'getLowBits', {
            get() {
              events.push('getLowBits');
              return () => {
                events.push('bits');
                return 7;
              };
            },
          });
          snapshot = new bson.Long(7, 2);
        } else {
          value = new bson.ObjectId(hex);
          if (kind === 'version rejection')
            Object.defineProperty(value, Symbol.for('@@mdb.bson.version'), {
              get() {
                events.push('version');
                return -1;
              },
            });
          else
            Object.defineProperty(value, 'serializeInto', {
              get() {
                events.push('serializeInto');
                return kind === 'malformed ObjectId'
                  ? null
                  : (buffer: Uint8Array, index: number) => {
                      events.push('bytes');
                      buffer.set(Buffer.alloc(12, 0x12), index);
                      return 12;
                    };
              },
            });
          snapshot = new bson.ObjectId('121212121212121212121212');
        }
        Object.defineProperty(value, 'extra', {
          get() {
            events.push('unexpected extra');
            throw new Error('ignored native property');
          },
        });
        return { value: { value }, snapshot: { value: snapshot }, events };
      }, !['version rejection', 'malformed ObjectId'].includes(kind));
    },
  );

  it('retains unsafe native-constructor normalization behavior rather than inventing a trusted-constructor path', () => {
    const value = Object.assign(Object.create(Date.prototype), { getTime: () => 7 });
    agrees({ value }, { value: new Date(7) }, true);
    agrees(Object.create(Date.prototype), new Date(0), false);
  });

  it.each(['constructor', 'tag'] as const)(
    'delegates native inherited %s accessors without invoking them during eligibility',
    (kind) => {
      const prototype = bson.Long.prototype;
      const key = kind === 'constructor' ? 'constructor' : Symbol.toStringTag;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      let events: string[] = [];
      try {
        Object.defineProperty(prototype, key, {
          configurable: true,
          get() {
            events.push(kind);
            return kind === 'constructor' ? bson.Long : 'Object';
          },
        });
        differentialEffects(() => {
          events = [];
          return { value: { native: new bson.Long(1, 2) }, snapshot: { native: new bson.Long(1, 2) }, events };
        }, true);
      } finally {
        if (descriptor) Object.defineProperty(prototype, key, descriptor);
        else Reflect.deleteProperty(prototype, key);
      }
    },
  );

  it.each([false, true])(
    'does not change acceptance/observations for an overridden BSON hasInstance returning %s',
    (accepted) => {
      const descriptor = Object.getOwnPropertyDescriptor(bson.BSONValue, Symbol.hasInstance);
      let events: string[] = [];
      try {
        Object.defineProperty(bson.BSONValue, Symbol.hasInstance, {
          configurable: true,
          value() {
            events.push('hasInstance');
            return accepted;
          },
        });
        differentialEffects(() => {
          events = [];
          const value = accepted
            ? {
                toBSON() {
                  events.push('wire');
                  return 'normalized';
                },
              }
            : new bson.Long(1, 2);
          return { value, snapshot: 'normalized', events };
        }, accepted);
      } finally {
        if (descriptor) Object.defineProperty(bson.BSONValue, Symbol.hasInstance, descriptor);
        else Reflect.deleteProperty(bson.BSONValue, Symbol.hasInstance);
      }
    },
  );

  it.each(['Map', 'Set'] as const)('rejects active %s cycles but permits repeated aliased entries', (kind) => {
    const cyclic: Map<unknown, unknown> | Set<unknown> = kind === 'Map' ? new Map() : new Set();
    if (cyclic instanceof Map) cyclic.set('self', cyclic);
    else cyclic.add(cyclic);
    agrees(cyclic, cyclic, false);
    const shared = { value: 1 };
    const value = kind === 'Map' ? new Map([[shared, shared]]) : new Set([shared, { shared }]);
    agrees(value, copyAuthorizationValue(value, 'document'), true);
  });
});

function operations(run: () => boolean) {
  const define = vi.spyOn(Object, 'defineProperty');
  const freeze = vi.spyOn(Object, 'freeze');
  define.mockClear(); // Installing the second spy itself defines properties.
  freeze.mockClear();
  try {
    const result = run();
    return { result, definitions: define.mock.calls.length, freezes: freeze.mock.calls.length };
  } finally {
    freeze.mockRestore();
    define.mockRestore();
  }
}

describe('SNAPCPU-06 deliberately retained normalization cost', () => {
  it('restores complete ordinary graph copying on both matches and mismatches', () => {
    const value = {
      rows: Array.from({ length: 24 }, (_, index) => ({ label: String(index), values: [index, NaN, -0, undefined] })),
      meta: { nested: { ok: true } },
    };
    const snapshot = copyAuthorizationValue(value, 'document');
    expect(operations(() => oracle(value, snapshot))).toEqual({ result: true, definitions: 172, freezes: 52 });
    expect(operations(() => matchesAuthorizationSnapshot(value, snapshot))).toEqual({
      result: true,
      definitions: 172,
      freezes: 52,
    });
    const changed = { ...snapshot, meta: { nested: { ok: false } } };
    expect(operations(() => matchesAuthorizationSnapshot(value, changed))).toEqual({
      result: false,
      definitions: 172,
      freezes: 52,
    });
  });

  it.each([
    { name: 'ObjectId', create: () => new bson.ObjectId(hex) },
    { name: 'Long', create: () => new bson.Long(1, 2) },
  ])('keeps one detached $name wire clone per occurrence with the original ordinary copy', ({ create }) => {
    vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...bson });
    const native = create();
    const value = { ids: [native, native], nested: { id: native } };
    const snapshot = copyAuthorizationValue(value, 'document');
    const allocation = { definitions: 5, freezes: 3 };
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    const deserialize = vi.spyOn(mongo.BSON, 'deserialize');
    expect(operations(() => oracle(value, snapshot))).toEqual({ result: true, definitions: 5, freezes: 3 });
    expect(serialize).toHaveBeenCalledTimes(3);
    expect(deserialize).toHaveBeenCalledTimes(3);
    serialize.mockClear();
    deserialize.mockClear();
    expect(operations(() => matchesAuthorizationSnapshot(value, snapshot))).toEqual({
      result: true,
      ...allocation,
    });
    expect(serialize).toHaveBeenCalledTimes(3);
    expect(deserialize).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const cloned = deserialize.mock.results[i].value.value;
      expect(cloned).not.toBe(native);
      expect(isDeepStrictEqual(cloned, snapshot.nested.id)).toBe(true);
    }
    expect(new Set(deserialize.mock.results.map((result) => result.value.value)).size).toBe(3);
    serialize.mockClear();
    deserialize.mockClear();
    expect(operations(() => matchesAuthorizationSnapshot(value, { ids: [], nested: snapshot.nested }))).toEqual({
      result: false,
      ...allocation,
    });
    expect(serialize).toHaveBeenCalledTimes(3); // A mismatch never skips later wire hooks.
    expect(deserialize).toHaveBeenCalledTimes(3);
  });

  it('normalizes a complex graph once without repeating native hooks or resetting limits', () => {
    vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...bson });
    const native = new bson.ObjectId(hex);
    const value = { before: [1], native, complex: new Set([{ value: native }]) };
    const snapshot = copyAuthorizationValue(value, 'document');
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    const previous = operations(() => oracle(value, snapshot));
    expect(serialize).toHaveBeenCalledTimes(2);
    serialize.mockClear();
    expect(operations(() => matchesAuthorizationSnapshot(value, snapshot))).toEqual(previous);
    expect(serialize).toHaveBeenCalledTimes(2);
  });
});
