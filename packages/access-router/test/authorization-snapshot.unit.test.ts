import { isDeepStrictEqual } from 'node:util';
import { mongo } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyAuthorizationValue,
  matchesAuthorizationSnapshot,
  ServiceAuthorizationError,
} from '../src/acl/authorization-snapshot';

const bson = mongo.BSON;
const hex = '0123456789abcdef01234567';
type Leaf = mongo.BSON.ObjectId | mongo.BSON.Decimal128 | mongo.BSON.Long;

function roundTrip(value: unknown): unknown {
  return bson.deserialize(bson.serialize({ value }), { promoteValues: false, bsonRegExp: true }).value;
}

function expectAuthorizationError(run: () => unknown, detail: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceAuthorizationError);
    expect((error as ServiceAuthorizationError).result.errors).toEqual([
      { detail: `Service authorization: ${detail}` },
    ]);
    return;
  }
  expect.unreachable('expected a controlled authorization error');
}

function mutate(value: Leaf): void {
  if (value instanceof bson.ObjectId) {
    const bytes = Buffer.from(value.id);
    bytes[0] ^= 255;
    value.id = bytes;
  } else if (value instanceof bson.Decimal128) value.bytes[0] ^= 255;
  else value.low ^= 1;
}

const canonicalCases: Array<{ name: string; create: () => Leaf }> = [
  ...['000000000000000000000000', hex, 'ffffffffffffffffffffffff'].map((id) => ({
    name: `ObjectId ${id}`,
    create: () => new bson.ObjectId(id),
  })),
  ...[
    '0',
    '-0',
    '1.20',
    '1234567890123456789012345678901234',
    '1E-6176',
    '1E+6111',
    'Infinity',
    '-Infinity',
    'NaN',
  ].map((decimal) => ({ name: `Decimal128 ${decimal}`, create: () => bson.Decimal128.fromString(decimal) })),
  ...[
    Buffer.alloc(16, 255),
    Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    Buffer.alloc(32, 0x7c).subarray(8, 24),
    new Uint8Array(32).fill(0x7e).subarray(8, 24),
  ].map((bytes, index) => ({
    name: `Decimal128 raw bits/view ${index}`,
    create: () => new bson.Decimal128(bytes.subarray()),
  })),
  ...[
    [0, 0],
    [1, 0],
    [-1, -1],
    [-1, 0x7fffffff],
    [0, -0x80000000],
    [-0x80000000, 0x12345678],
    [0x7fffffff, -1],
  ].map(([low, high]) => ({ name: `Long ${low}/${high}`, create: () => new bson.Long(low, high, false) })),
];

beforeEach(() => {
  // The real BSON namespace is frozen. Observe its unchanged functions through
  // the driver's configurable getter, keeping the native constructors identical.
  vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...bson });
});
afterEach(() => vi.restoreAllMocks());

describe('ARCPU-05 canonical BSON snapshots', () => {
  it.each(canonicalCases)(
    'matches wire type/bits and owns each mutable $name clone through serialization',
    ({ create }) => {
      const source = create();
      const expected = roundTrip(source);
      const serialize = vi.spyOn(mongo.BSON, 'serialize');
      const deserialize = vi.spyOn(mongo.BSON, 'deserialize');
      const copies = [
        copyAuthorizationValue(source),
        copyAuthorizationValue(source, true),
        copyAuthorizationValue(source, 'document'),
      ];
      for (const copy of copies) {
        expect(copy).not.toBe(source);
        expect(Object.getPrototypeOf(copy)).toBe(Object.getPrototypeOf(expected));
        expect(isDeepStrictEqual(copy, expected)).toBe(true);
        expect(copy._bsontype).toBe(source._bsontype);
        if (copy instanceof bson.ObjectId || copy instanceof bson.Long) expect(copy.equals(source as never)).toBe(true);
        if (copy instanceof bson.Decimal128) {
          expect(copy.bytes).not.toBe((source as mongo.BSON.Decimal128).bytes);
          expect(Buffer.isBuffer(copy.bytes)).toBe(true); // Deserialization normalizes Uint8Array payloads to Buffer.
        }
      }
      mutate(copies[0]);
      expect(isDeepStrictEqual(copies[0], expected)).toBe(false);
      expect(isDeepStrictEqual(copies[1], expected)).toBe(true);
      expect(matchesAuthorizationSnapshot(source, copies[1])).toBe(true);
      mutate(source);
      expect(matchesAuthorizationSnapshot(source, copies[1])).toBe(false);
      expect(isDeepStrictEqual(copies[2], expected)).toBe(true);
      // Constructor shortcuts are deferred: canonical shape cannot prove that
      // mutable BSON wire hooks are unmodified, including before module import.
      expect(serialize).toHaveBeenCalledTimes(5); // Three copies and two snapshot comparisons.
      expect(deserialize).toHaveBeenCalledTimes(5);
    },
  );

  it('clones repeated canonical leaves separately in nested records, arrays, Maps and Sets', () => {
    const leaves = {
      id: new bson.ObjectId(hex),
      decimal: bson.Decimal128.fromString('1.20'),
      long: new bson.Long(-1, 3),
    };
    const input = { leaves, rows: [leaves, leaves], map: new Map([[leaves.id, leaves]]), set: new Set([leaves]) };
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    const copy = copyAuthorizationValue(input, true);
    const peers = [copy.leaves, ...copy.rows, ...copy.map.values(), ...copy.set];
    for (const peer of peers) {
      expect(Object.isFrozen(peer)).toBe(true);
      expect(peer.id).not.toBe(leaves.id);
      expect(peer.decimal.bytes).not.toBe(leaves.decimal.bytes);
      expect(peer.long).not.toBe(leaves.long);
      expect(peer.id.equals(hex)).toBe(true);
      expect(peer.decimal.toString()).toBe('1.20');
      expect(peer.long.low).toBe(-1);
    }
    expect(new Set(peers.map((peer) => peer.id)).size).toBe(peers.length);
    for (const leaf of Object.values(copy.leaves)) mutate(leaf);
    expect(copy.rows[0].id.equals(hex)).toBe(true);
    expect(copy.rows[0].decimal.toString()).toBe('1.20');
    expect(copy.rows[0].long.low).toBe(-1);
    expect([...copy.map.keys()][0].equals(hex)).toBe(true);
    expect(leaves.id.equals(hex)).toBe(true);
    expect(leaves.decimal.toString()).toBe('1.20');
    expect(leaves.long.low).toBe(-1);
    expect(serialize).toHaveBeenCalledTimes(16); // Each occurrence owns a separate wire-round-tripped leaf.
  });

  it('does not preserve a stale ObjectId hex cache instead of its serialized bits', () => {
    const cache = bson.ObjectId.cacheHexString;
    try {
      bson.ObjectId.cacheHexString = true;
      const source = new bson.ObjectId(hex.toUpperCase());
      source.toHexString();
      // In the byte-backed implementation this mutates bytes without refreshing the hex cache.
      source.id[0] ^= 255;
      const expected = roundTrip(source);
      const serialize = vi.spyOn(mongo.BSON, 'serialize');
      const copy = copyAuthorizationValue(source);
      expect(isDeepStrictEqual(copy, expected)).toBe(true);
      expect(copy.toHexString()).toBe((expected as mongo.BSON.ObjectId).toHexString());
      expect(serialize).toHaveBeenCalledTimes(1);
    } finally {
      bson.ObjectId.cacheHexString = cache;
    }
  });
});

const fallbackCases: Array<{ name: string; create: () => object }> = [
  { name: 'unsigned zero Long', create: () => new bson.Long(0, 0, true) },
  { name: 'unsigned maximum Long normalizes signed', create: () => new bson.Long(-1, -1, true) },
  { name: 'ObjectId subclass', create: () => new (class extends bson.ObjectId {})(hex) },
  { name: 'Decimal128 subclass', create: () => new (class extends bson.Decimal128 {})(Buffer.alloc(16)) },
  { name: 'Long subclass', create: () => new (class extends bson.Long {})(1, 2, false) },
  { name: 'Timestamp remains unsigned', create: () => new bson.Timestamp({ t: 0xffffffff, i: 0x12345678 }) },
  { name: 'Binary old byte-array subtype', create: () => new bson.Binary(Buffer.from([1, 2, 3]), 2) },
  { name: 'Binary custom subtype', create: () => new bson.Binary(Buffer.from([1, 2, 3]), 128) },
  { name: 'UUID subtype', create: () => new bson.UUID('00112233-4455-6677-8899-aabbccddeeff') },
  { name: 'Double NaN', create: () => new bson.Double(NaN) },
  { name: 'Double negative zero', create: () => new bson.Double(-0) },
  { name: 'Int32', create: () => new bson.Int32(-1) },
  { name: 'BSONRegExp', create: () => new bson.BSONRegExp('^abc', 'mi') },
  { name: 'Code with scope', create: () => new bson.Code('return value', { value: new bson.Long(1, 2) }) },
  { name: 'DBRef', create: () => new bson.DBRef('orders', new bson.ObjectId(hex), 'db') },
  { name: 'BSONSymbol', create: () => new bson.BSONSymbol('symbol') },
  { name: 'MinKey', create: () => new bson.MinKey() },
  { name: 'MaxKey', create: () => new bson.MaxKey() },
  ...(['id', 'decimal', 'long'] as const).flatMap((kind) => {
    const create = () =>
      kind === 'id'
        ? new bson.ObjectId(hex)
        : kind === 'decimal'
          ? bson.Decimal128.fromString('1.2')
          : new bson.Long(1, 2);
    return [
      { name: `${kind} extra own field`, create: () => Object.assign(create(), { extra: true }) },
      { name: `${kind} extra symbol`, create: () => Object.assign(create(), { [Symbol('extra')]: true }) },
      { name: `${kind} frozen fields`, create: () => Object.freeze(create()) },
      {
        name: `${kind} own toBSON normalization`,
        create: () => Object.assign(create(), { toBSON: () => new bson.Int32(123) }),
      },
    ];
  }),
  {
    name: 'ObjectId own serialization override',
    create: () =>
      Object.assign(new bson.ObjectId(hex), {
        serializeInto(buffer: Uint8Array, index: number) {
          buffer.set(Buffer.alloc(12, 0x12), index);
          return 12;
        },
      }),
  },
  { name: 'Long own bit getter override', create: () => Object.assign(new bson.Long(1, 2), { getLowBits: () => 123 }) },
  { name: 'Long malformed bit value', create: () => Object.assign(new bson.Long(1, 2), { low: '123' }) },
  { name: 'Long negative-zero bit value', create: () => Object.assign(new bson.Long(1, 2), { high: -0 }) },
  { name: 'Long non-boolean unsigned flag', create: () => Object.assign(new bson.Long(1, 2), { unsigned: 0 }) },
  {
    name: 'Decimal128 short bytes normalize with zeros',
    create: () => Object.assign(bson.Decimal128.fromString('1.2'), { bytes: Buffer.alloc(15, 1) }),
  },
  {
    name: 'Decimal128 oversized bytes normalize to 16',
    create: () => Object.assign(bson.Decimal128.fromString('1.2'), { bytes: Buffer.alloc(17, 1) }),
  },
  { name: 'Decimal128 byte-view subclass', create: () => new bson.Decimal128(new (class extends Uint8Array {})(16)) },
  {
    name: 'Decimal128 null-prototype byte record',
    create: () =>
      Object.assign(bson.Decimal128.fromString('1.2'), {
        bytes: Object.assign(
          Object.create(null),
          Array.from({ length: 16 }, (_, index) => index),
        ),
      }),
  },
  {
    name: 'Decimal128 proxied byte view',
    create: () => Object.assign(bson.Decimal128.fromString('1.2'), { bytes: new Proxy(Buffer.alloc(16), {}) }),
  },
  { name: 'ObjectId proxy', create: () => new Proxy(new bson.ObjectId(hex), {}) },
  { name: 'Decimal128 proxy', create: () => new Proxy(bson.Decimal128.fromString('1.2'), {}) },
  { name: 'Long proxy', create: () => new Proxy(new bson.Long(1, 2), {}) },
];

describe('ARCPU-05 BSON wire compatibility', () => {
  it.each(fallbackCases)('retains serializer normalization/type/subtype for $name', ({ create }) => {
    const source = create();
    const expected = roundTrip(source);
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    const deserialize = vi.spyOn(mongo.BSON, 'deserialize');
    const copy = copyAuthorizationValue(source);
    expect(isDeepStrictEqual(copy, expected)).toBe(true);
    expect(copy === source).toBe(false); // Do not inspect a proxied typed-array payload in assertion diagnostics.
    expect(Object.getPrototypeOf(copy)).toBe(Object.getPrototypeOf(expected));
    expect(serialize).toHaveBeenCalledExactlyOnceWith({ value: source });
    expect(deserialize).toHaveBeenCalledExactlyOnceWith(expect.any(Uint8Array), {
      promoteValues: false,
      bsonRegExp: true,
    });
  });

  it.each([
    { name: 'null Decimal128 bytes', create: () => Object.assign(bson.Decimal128.fromString('1.2'), { bytes: null }) },
    {
      name: 'missing ObjectId serializer',
      create: () => Object.assign(new bson.ObjectId(hex), { serializeInto: null }),
    },
    {
      name: 'wrong BSON version',
      create: () => Object.defineProperty(new bson.Long(1, 2), Symbol.for('@@mdb.bson.version'), { value: -1 }),
    },
  ])('does not bypass serializer rejection of $name', ({ create }) => {
    const source = create();
    expect(() => roundTrip(source)).toThrow();
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    expectAuthorizationError(() => copyAuthorizationValue(source), 'unsupported BSON snapshot');
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  it("retains wire normalization/rejection for malformed ObjectId words or the other BSON version's storage layout", () => {
    const malformed = new bson.ObjectId(hex);
    const words = Object.hasOwn(malformed, 'i0');
    if (words) Object.assign(malformed, { i0: 0x1000000 + 0x123456, i1: 1.5, i2: -1, i3: NaN });
    else Object.assign(malformed, { buffer: Buffer.alloc(11) });
    const otherLayout = new bson.ObjectId(hex);
    for (const key of Reflect.ownKeys(otherLayout)) Reflect.deleteProperty(otherLayout, key);
    Object.assign(otherLayout, words ? { buffer: Buffer.alloc(12, 1) } : { i0: 1, i1: 2, i2: 3, i3: 4 });
    for (const source of [malformed, otherLayout]) {
      let expected: unknown;
      let rejected = false;
      try {
        expected = roundTrip(source);
      } catch {
        rejected = true;
      }
      const serialize = vi.spyOn(mongo.BSON, 'serialize');
      if (rejected) expect(() => copyAuthorizationValue(source)).toThrow(ServiceAuthorizationError);
      else expect(isDeepStrictEqual(copyAuthorizationValue(source), expected)).toBe(true);
      expect(serialize).toHaveBeenCalledTimes(1);
      serialize.mockRestore();
    }
  });

  it.each(['id', 'decimal', 'long'] as const)('invokes %s own accessors only as required by serialization', (kind) => {
    const source =
      kind === 'id'
        ? new bson.ObjectId(hex)
        : kind === 'decimal'
          ? bson.Decimal128.fromString('1.2')
          : new bson.Long(1, 2);
    const key = kind === 'id' ? Reflect.ownKeys(source)[0] : kind === 'decimal' ? 'bytes' : 'low';
    const value = Object.getOwnPropertyDescriptor(source, key)!.value;
    const getter = vi.fn(() => value);
    Object.defineProperty(source, key, { enumerable: true, configurable: true, get: getter });
    const expected = roundTrip(source);
    const calls = getter.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    getter.mockClear();
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    expect(isDeepStrictEqual(copyAuthorizationValue(source), expected)).toBe(true);
    expect(getter).toHaveBeenCalledTimes(calls);
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  it.each(['id', 'decimal', 'long'] as const)('does not inspect extra %s own native getters', (kind) => {
    const source =
      kind === 'id'
        ? new bson.ObjectId(hex)
        : kind === 'decimal'
          ? bson.Decimal128.fromString('1.2')
          : new bson.Long(1, 2);
    const getter = vi.fn(() => {
      throw new Error('must not inspect extra native fields');
    });
    Object.defineProperty(source, 'extra', { get: getter });
    const expected = roundTrip(source);
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    expect(isDeepStrictEqual(copyAuthorizationValue(source), expected)).toBe(true);
    expect(getter).not.toHaveBeenCalled();
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  it('preserves wire semantics without reading an application byteLength accessor', () => {
    const source = bson.Decimal128.fromString('1.2');
    const getter = vi.fn(() => {
      throw new Error('must not inspect byteLength');
    });
    Object.defineProperty(source.bytes, 'byteLength', { get: getter });
    const expected = roundTrip(source);
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    expect(isDeepStrictEqual(copyAuthorizationValue(source), expected)).toBe(true);
    expect(getter).not.toHaveBeenCalled();
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  it('retains inherited toBSON normalization without extra accessor calls', () => {
    const getter = vi.fn(() => () => new bson.Int32(321));
    try {
      Object.defineProperty(bson.Long.prototype, 'toBSON', { configurable: true, get: getter });
      const source = new bson.Long(1, 2);
      const expected = roundTrip(source);
      const calls = getter.mock.calls.length;
      getter.mockClear();
      const serialize = vi.spyOn(mongo.BSON, 'serialize');
      expect(isDeepStrictEqual(copyAuthorizationValue(source), expected)).toBe(true);
      expect(getter).toHaveBeenCalledTimes(calls);
      expect(serialize).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(bson.Long.prototype, 'toBSON');
    }
  });

  it('does not bypass changed prototype wire methods or invoke their accessors twice', () => {
    const descriptor = Object.getOwnPropertyDescriptor(bson.Long.prototype, 'getLowBits')!;
    const getter = vi.fn(() => () => 123);
    try {
      Object.defineProperty(bson.Long.prototype, 'getLowBits', { configurable: true, get: getter });
      const source = new bson.Long(1, 2);
      const expected = roundTrip(source);
      const calls = getter.mock.calls.length;
      getter.mockClear();
      const serialize = vi.spyOn(mongo.BSON, 'serialize');
      expect(isDeepStrictEqual(copyAuthorizationValue(source), expected)).toBe(true);
      expect(getter).toHaveBeenCalledTimes(calls);
      expect(serialize).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(bson.Long.prototype, 'getLowBits', descriptor);
    }
  });

  it('retains serializer validation of a changed inherited BSON version getter', () => {
    const version = Symbol.for('@@mdb.bson.version');
    const descriptor = Object.getOwnPropertyDescriptor(bson.BSONValue.prototype, version)!;
    const getter = vi.fn(() => -1);
    try {
      Object.defineProperty(bson.BSONValue.prototype, version, { configurable: true, get: getter });
      const source = new bson.Long(1, 2);
      expect(() => roundTrip(source)).toThrow();
      const calls = getter.mock.calls.length;
      expect(calls).toBeGreaterThan(0);
      getter.mockClear();
      const serialize = vi.spyOn(mongo.BSON, 'serialize');
      expectAuthorizationError(() => copyAuthorizationValue(source), 'unsupported BSON snapshot');
      expect(getter).toHaveBeenCalledTimes(calls);
      expect(serialize).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(bson.BSONValue.prototype, version, descriptor);
    }
  });

  it.each(['Long bits', 'ObjectId bytes', 'BSON version'] as const)(
    'retains wire overrides installed before the snapshot module loaded: %s',
    async (kind) => {
      const prototype =
        kind === 'Long bits'
          ? bson.Long.prototype
          : kind === 'ObjectId bytes'
            ? bson.ObjectId.prototype
            : bson.BSONValue.prototype;
      const key =
        kind === 'Long bits'
          ? 'getLowBits'
          : kind === 'ObjectId bytes'
            ? 'serializeInto'
            : Symbol.for('@@mdb.bson.version');
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)!;
      try {
        Object.defineProperty(
          prototype,
          key,
          kind === 'BSON version'
            ? { ...descriptor, get: () => -1 }
            : {
                ...descriptor,
                value:
                  kind === 'Long bits'
                    ? () => 123
                    : (buffer: Uint8Array, index: number) => {
                        buffer.set(Buffer.alloc(12, 0x12), index);
                        return 12;
                      },
              },
        );
        vi.resetModules();
        const isolated = await import('../src/acl/authorization-snapshot');
        const source = kind === 'ObjectId bytes' ? new bson.ObjectId(hex) : new bson.Long(1, 2);
        if (kind === 'BSON version') {
          expect(() => roundTrip(source)).toThrow();
          expect(() => isolated.copyAuthorizationValue(source)).toThrow(isolated.ServiceAuthorizationError);
          expect(isolated.matchesAuthorizationSnapshot(source, source)).toBe(false);
        } else {
          const expected = roundTrip(source);
          expect(isDeepStrictEqual(isolated.copyAuthorizationValue(source), expected)).toBe(true);
          expect(isolated.matchesAuthorizationSnapshot({ source }, { source: expected })).toBe(true);
        }
      } finally {
        Object.defineProperty(prototype, key, descriptor);
        vi.resetModules();
      }
    },
  );
});

describe('ARCPU-05 snapshot safeguards remain in force', () => {
  it('handles null/plain records through descriptors, not BSON-looking properties or application accessors', () => {
    const input = Object.assign(Object.create(null), { value: new bson.ObjectId(hex), _bsontype: 'ObjectId' });
    expect(copyAuthorizationValue(input)).toEqual({ value: new bson.ObjectId(hex), _bsontype: 'ObjectId' });
    expect(copyAuthorizationValue(null)).toBeNull();
    const getter = vi.fn(() => new bson.ObjectId(hex));
    for (const mode of [false, true, 'document'] as const) {
      expect(() =>
        copyAuthorizationValue(Object.defineProperty({}, 'value', { enumerable: true, get: getter }), mode),
      ).toThrow(ServiceAuthorizationError);
      expect(() => copyAuthorizationValue({ value: Object.create({ id: new bson.ObjectId(hex) }) }, mode)).toThrow(
        ServiceAuthorizationError,
      );
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('retains non-enumerable data handling, unsafe-key/cycle rejection and structural limits around BSON leaves', () => {
    const hidden = Object.defineProperty({}, 'value', { value: new bson.ObjectId(hex) });
    expectAuthorizationError(() => copyAuthorizationValue(hidden), 'accessor/non-enumerable input');
    expect(copyAuthorizationValue(hidden, 'document')).toEqual({ value: new bson.ObjectId(hex) });
    expectAuthorizationError(() => copyAuthorizationValue(JSON.parse('{"__proto__":{}}')), 'unsafe snapshot key');
    const cyclic: Record<string, unknown> = { id: new bson.ObjectId(hex) };
    cyclic.self = cyclic;
    expectAuthorizationError(() => copyAuthorizationValue(cyclic), 'cyclic input');
    let nested: unknown = new bson.Long(1, 2);
    for (let depth = 0; depth < 101; depth++) nested = { nested };
    expectAuthorizationError(() => copyAuthorizationValue(nested), 'snapshot exceeds structural limits');
    expectAuthorizationError(
      () => copyAuthorizationValue(Array(20001).fill(new bson.Long(1, 2))),
      'snapshot array exceeds structural limits',
    );
    expectAuthorizationError(
      () => copyAuthorizationValue(Array(20000).fill(new bson.Long(1, 2))),
      'snapshot exceeds structural limits',
    );
  });
});
