import { describe, expect, it } from 'vitest';
import { Connection, Document, Schema, WriteNormalizationError } from '../src/index';
import { MAX_STORAGE_DEPTH, MAX_STORAGE_NODES, castDocumentToSchema, documentToStorage } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

function deep(levels: number): any {
  let value: any = {};
  for (let i = 0; i < levels; i++) value = { next: value };
  return value;
}

class CustomValue {
  value = 1;
}
const invalid: Array<[string, () => any]> = [
  ['Map', () => new Map([['a', 1]])],
  ['Set', () => new Set([1])],
  ['class', () => new CustomValue()],
  [
    'cycle',
    () => {
      const value: any = {};
      value.self = value;
      return value;
    },
  ],
  [
    'array cycle',
    () => {
      const value: any[] = [];
      value.push(value);
      return value;
    },
  ],
  ['depth', () => deep(10000)],
  ['nodes', () => Array(MAX_STORAGE_NODES).fill(1)],
  ['nested undefined', () => ({ a: undefined })],
  ['bigint', () => 1n],
  ['function', () => () => 1],
  ['symbol', () => Symbol('bad')],
  ['nonfinite', () => Infinity],
  ['invalid Date', () => new Date(NaN)],
  ['sparse array', () => Array(2)],
  ['symbol key', () => ({ [Symbol('key')]: 1 })],
  [
    'accessor',
    () =>
      Object.defineProperty({}, 'value', {
        enumerable: true,
        get() {
          throw new Error('getter executed');
        },
      }),
  ],
];

function schema() {
  return new Schema<any>({
    name: String,
    count: Number,
    flag: Boolean,
    at: Date,
    meta: Object,
    other: Object,
    profile: new Schema({ count: Number, optional: String }),
    items: [Object],
    numbers: [Number],
  });
}

function harness() {
  const s = schema();
  const seed = { _id: 'one', name: 'before', meta: { good: true }, other: {}, profile: { count: 1 }, items: [] };
  const adapter = new FakePersistenceAdapter([seed]);
  const doc: any = new Document(seed, s, { collection: adapter }, { isNew: false, applyDefaults: false });
  return { s, doc, adapter };
}

describe('RMRX-03 bounded document ingress', () => {
  it.each(invalid)('rejects %s across constructor and setters atomically', (_label, make) => {
    const { s, doc, adapter } = harness();
    expect(() => new Document({ meta: make() }, s, { collection: adapter })).toThrow(WriteNormalizationError);
    const before = doc.toObject();
    for (const assign of [
      () => {
        doc.meta = make();
      },
      () => doc.set('meta', make()),
      () => doc.set('meta.nested', make()),
      () => doc.set({ name: 'changed', 'meta.nested': make() }),
    ]) {
      expect(assign).toThrow(WriteNormalizationError);
      expect(doc.toObject()).toEqual(before);
      expect(doc.modifiedPaths()).toEqual([]);
    }
    expect(adapter.calls.insert).toHaveLength(0);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it.each(invalid)('checks live %s before serialization, dirty comparison, and save', async (_label, make) => {
    const { doc, adapter } = harness();
    doc.meta.bad = make();
    for (const read of [
      () => doc.toObject(),
      () => doc.toJSON(),
      () => doc.isModified('meta'),
      () => doc.modifiedPaths(),
    ]) {
      expect(read).toThrow(WriteNormalizationError);
    }
    await expect(doc.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
    delete doc.meta.bad;
    expect(doc.isModified()).toBe(false);
  });

  it('charges the entire input and candidate rather than each property independently', () => {
    const { s, doc } = harness();
    const many = Array(1100).fill(1);
    expect(() => new Document({ meta: many, other: many }, s, {})).toThrow(WriteNormalizationError);
    expect(() => doc.set({ meta: many, other: many })).toThrow(WriteNormalizationError);
    expect(doc.name).toBe('before');
    doc.meta = many;
    const before = doc.toObject();
    expect(() => {
      doc.other = many;
    }).toThrow(WriteNormalizationError);
    expect(doc.toObject()).toEqual(before);
    const compacting = new Schema({ a: String, b: String });
    expect(() => new Document({ a: many, b: many }, compacting, {})).toThrow(WriteNormalizationError);
  });

  it('checks live data with save validation disabled and permits recovery without writes', async () => {
    const s = new Schema({ meta: Object }, { validateBeforeSave: false });
    const adapter = new FakePersistenceAdapter([{ _id: 'one', meta: {} }]);
    const doc: any = new Document({ _id: 'one', meta: {} }, s, { collection: adapter }, { isNew: false });
    doc.meta.bad = new Map();
    await expect(doc.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
    delete doc.meta.bad;
    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('rejects bad values inside structured and mixed array ingress', () => {
    const s = new Schema({ rows: [new Schema({ meta: Object })], mixed: [Object] });
    for (const [, make] of invalid) {
      expect(() => new Document({ rows: [{ meta: make() }] }, s, {})).toThrow(WriteNormalizationError);
      expect(() => new Document({ mixed: [make()] }, s, {})).toThrow(WriteNormalizationError);
    }
  });

  it('preflights before casts and before creating dotted containers', () => {
    const { doc } = harness();
    const cycle: any[] = [];
    cycle.push(cycle);
    expect(() => {
      doc.name = cycle;
    }).toThrow(WriteNormalizationError);
    expect(() => doc.set('name', deep(10000))).toThrow(WriteNormalizationError);
    const before = doc.toObject();
    expect(() => doc.set({ name: 'changed', 'profile.count.bad': 1 })).toThrow();
    expect(doc.toObject()).toEqual(before);
    expect(doc.modifiedPaths()).toEqual([]);
    expect(() => doc.set(`meta.${Array(100).fill('a').join('.')}`, 1)).toThrow(WriteNormalizationError);
    expect(doc.toObject()).toEqual(before);
    expect(() => doc.set({ name: 'changed', 'items.4000000000': {} })).toThrow(WriteNormalizationError);
    expect(doc.toObject()).toEqual(before);
  });

  it('rejects non-document roots and non-plain setter envelopes', () => {
    const { s, doc } = harness();
    for (const value of [null, [], new Map(), new Set(), new CustomValue(), 1]) {
      expect(() => new Document(value as any, s, {})).toThrow(WriteNormalizationError);
    }
    for (const value of [new Map(), new Set(), new CustomValue()]) {
      expect(() => doc.set(value)).toThrow(WriteNormalizationError);
    }
  });

  it('accepts boundary-sized values, charges shared aliases per occurrence, and bounds live whole records', () => {
    const { s, doc } = harness();
    const exact = new Document({ _id: 'limit', meta: Array(MAX_STORAGE_NODES - 3).fill(1) }, s, {}, { isNew: false });
    expect(exact.toObject().meta).toHaveLength(MAX_STORAGE_NODES - 3);
    expect(() => new Document({ _id: 'limit', meta: Array(MAX_STORAGE_NODES - 2).fill(1) }, s, {})).toThrow(
      WriteNormalizationError,
    );
    const depthLimit = new Document({ meta: deep(MAX_STORAGE_DEPTH - 1) }, s, {});
    expect(depthLimit.toObject().meta).toBeDefined();
    expect(() => new Document({ meta: deep(MAX_STORAGE_DEPTH) }, s, {})).toThrow(WriteNormalizationError);
    const shared = { a: [1, 2] };
    doc.meta = { left: shared, right: shared };
    expect(doc.meta.left).not.toBe(doc.meta.right);
    doc.meta = { values: [] };
    doc.other = { values: [] };
    doc.meta.values.push(...Array(1100).fill(1));
    doc.other.values.push(...Array(1100).fill(1));
    expect(() => doc.toObject()).toThrow(WriteNormalizationError);
  });

  it('preserves converter-supported scalar casts before erasing prototypes', () => {
    class Numeric {
      valueOf() {
        return 7;
      }
      toString() {
        return 'seven';
      }
    }
    const { s, doc } = harness();
    const cases: Array<[string, any]> = [
      ['name', 12n],
      ['name', Infinity],
      ['name', new Numeric()],
      ['name', new String('boxed')],
      ['count', 12n],
      ['count', new Number(4)],
      ['count', new Numeric()],
      ['count', [3]],
      ['flag', Symbol('truthy')],
      ['flag', () => false],
      ['flag', {}],
      ['flag', 'false'],
      ['at', '2024-02-29T00:00:00.000Z'],
      ['at', 0],
      ['numbers', ['3', 4n]],
    ];
    for (const [key, value] of cases) {
      const expected = documentToStorage({ [key]: value }, s)[key];
      const created = new Document({ [key]: value }, s, {});
      expect(documentToStorage(created.toObject(), s, { allowId: true })[key]).toEqual(expected);
      doc.set(key, value);
      expect(documentToStorage(doc.toObject(), s, { allowId: true })[key]).toEqual(expected);
    }
    doc.set('profile.count', 9n);
    expect(doc.profile.count).toBe(9);
  });

  it('bounds typed input before recursive casts, including nested schema arrays and default results', () => {
    const { s, doc } = harness();
    const cyclic: any[] = [];
    cyclic.push(cyclic);
    for (const key of ['name', 'count', 'flag', 'numbers', 'profile']) {
      for (const value of [cyclic, deep(10000), Array(2001).fill('1')]) {
        expect(() => new Document({ [key]: value }, s, {})).toThrow(WriteNormalizationError);
        expect(() => doc.set(key, value)).toThrow(WriteNormalizationError);
      }
    }
    const badDefault = new Schema({ name: { type: String, default: () => deep(10000) } });
    expect(() => new Document({}, badDefault, {})).toThrow(WriteNormalizationError);
  });

  it('retains schema-compatible live nested casts without erasing their prototypes', async () => {
    class Numeric {
      valueOf() {
        return 7;
      }
    }
    const { doc, adapter } = harness();
    doc.profile.count = new Numeric();
    doc.profile.optional = 12n;
    expect(doc.toObject().profile).toEqual({ count: 7, optional: '12' });
    expect(doc.isModified('profile')).toBe(true);
    await doc.save();
    expect(adapter.snapshot()[0].profile).toEqual({ count: 7, optional: '12' });
    expect(doc.isModified()).toBe(false);
  });

  it('keeps live references to unchanged fields and rolls back virtual setter data/dirty changes', () => {
    const { doc } = harness();
    const live = doc.meta;
    doc.name = 'changed';
    live.good = false;
    expect(doc.meta.good).toBe(false);
    const s = schema();
    s.virtual('proxy').set(function (this: any, value: any) {
      this.name = 'changed';
      this.meta = value;
      throw new Error('virtual failed');
    });
    const virtualDoc: any = new Document({ name: 'before', meta: {} }, s, {}, { isNew: false });
    expect(() => virtualDoc.set({ count: 4, proxy: {} })).toThrow('virtual failed');
    expect(virtualDoc.name).toBe('before');
    expect(virtualDoc.count).toBeUndefined();
    expect(virtualDoc.modifiedPaths()).toEqual([]);
  });

  it('preserves supported schema casts, Dates, undefined schema fields, null prototypes and aliases', async () => {
    const { doc, adapter } = harness();
    const at = new Date('2024-01-01T00:00:00.000Z');
    const meta = Object.assign(Object.create(null), { at, nested: [[1, null, true]] });
    doc.set({
      name: 12n,
      count: '3',
      flag: 'false',
      at,
      meta,
      numbers: ['1', '2'],
      profile: { count: '4', optional: undefined },
    });
    expect(doc.name).toBe('12');
    expect(doc.count).toBe(3);
    expect(doc.flag).toBe(false);
    expect(doc.at).toEqual(at);
    expect(doc.numbers).toEqual([1, 2]);
    expect(doc.profile).toEqual({ count: 4, optional: undefined });
    at.setUTCFullYear(2000);
    meta.nested[0].push('outside');
    expect(doc.meta.at.getUTCFullYear()).toBe(2024);
    expect(doc.meta.nested).toEqual([[1, null, true]]);
    await doc.save();
    expect(adapter.snapshot()[0].meta.at).toBe('2024-01-01T00:00:00.000Z');
  });

  it.each(invalid)('checks %s from default factories before cloning or casting', (_label, make) => {
    const s = new Schema({ meta: { type: Object, default: make } });
    expect(() => new Document({}, s, {})).toThrow(WriteNormalizationError);
    expect(() => castDocumentToSchema({}, s)).toThrow(WriteNormalizationError);
  });

  it('bounds combined defaults and avoids evaluating overridden defaults', () => {
    const s = new Schema({
      meta: { type: Object, default: () => Array(1100).fill(1) },
      other: { type: Object, default: () => Array(1100).fill(1) },
    });
    expect(() => new Document({}, s, {})).toThrow(WriteNormalizationError);
    const overridden = new Schema({
      meta: {
        type: Object,
        default: () => {
          throw new Error('unused');
        },
      },
    });
    expect(new Document({ meta: {} }, overridden, {}).toObject().meta).toEqual({});
    const child = new Schema({ text: { type: String, default: () => Array(1100).fill('x') } });
    const combined = new Schema({ left: child, right: child });
    const doc = new Document({}, combined, {}, { isNew: false });
    expect(() => doc.set({ left: {}, right: {} })).toThrow(WriteNormalizationError);
    expect(doc.toObject()).toEqual({});
  });

  it('casts and owns nested default factory results once per missing field', () => {
    let calls = 0;
    const source = { at: new Date('2024-01-01T00:00:00.000Z'), count: 2n };
    const child = new Schema({ at: Date, count: Number, optional: String });
    const s = new Schema({
      profile: {
        type: child,
        default: () => {
          calls++;
          return source;
        },
      },
      items: { type: [child], default: () => [source] },
    });
    const doc = new Document({}, s, {});
    expect(calls).toBe(1);
    source.at.setUTCFullYear(2000);
    expect(doc.toObject().profile).toEqual({ at: new Date('2024-01-01T00:00:00.000Z'), count: 2 });
    expect(doc.toObject().items[0]).toEqual(doc.toObject().profile);
  });

  it('rejects bad create/batch inputs before any native writes', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `rmrx03_${Date.now()}` }));
    try {
      const M = conn.model('Ingress', schema());
      for (const [, make] of invalid) {
        expect(() => new M({ meta: make() })).toThrow(WriteNormalizationError);
        await expect(M.create({ meta: make() })).rejects.toBeInstanceOf(WriteNormalizationError);
        await expect(M.create([{ name: 'valid' }, { meta: make() }])).rejects.toBeInstanceOf(WriteNormalizationError);
        for (const ordered of [true, false]) {
          await expect(M.insertMany([{ name: 'valid' }, { meta: make() }], { ordered })).rejects.toBeInstanceOf(
            WriteNormalizationError,
          );
        }
        expect(await M.countDocuments()).toBe(0);
      }
    } finally {
      await conn.disconnect();
    }
  });
});
