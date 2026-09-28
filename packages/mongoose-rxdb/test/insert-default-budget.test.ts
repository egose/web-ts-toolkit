import { describe, expect, it, vi } from 'vitest';
import { Connection, Document, Query, Schema, WriteNormalizationError } from '../src/index';
import { documentToStorage, MAX_STORAGE_DEPTH, MAX_STORAGE_NODES } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

function deep(levels: number): any {
  let value: any = {};
  for (let i = 0; i < levels; i++) value = { next: value };
  return value;
}

const many = () => Array(1100).fill(1);
const cases: Array<[string, () => Schema<any>, () => any]> = [
  ['typed array', () => new Schema({ values: { type: [Number], default: () => Array(2100).fill(1) } }), () => ({})],
  [
    'combined typed defaults',
    () =>
      new Schema({
        left: { type: [Number], default: many },
        right: { type: [Number], default: many },
      }),
    () => ({}),
  ],
  [
    'raw input plus compacting default',
    () =>
      new Schema({
        raw: String,
        text: { type: String, default: many },
      }),
    () => ({ raw: many() }),
  ],
  [
    'combined compacting defaults',
    () =>
      new Schema({
        left: { type: String, default: many },
        right: { type: String, default: many },
      }),
    () => ({}),
  ],
  [
    'structured subdocument defaults',
    () => {
      const child = new Schema({ values: { type: [Number], default: many } });
      return new Schema({ rows: { type: [child], default: () => [{}, {}] } });
    },
    () => ({}),
  ],
  [
    'nested object defaults',
    () => {
      const child = new Schema({ values: { type: [Number], default: many } });
      return new Schema({ left: { type: child, default: () => ({}) }, right: { type: child, default: () => ({}) } });
    },
    () => ({}),
  ],
  [
    'output expansion',
    () => {
      const fields = Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [`v${i}`, { type: [Number], default: () => 1 }]),
      );
      return new Schema(fields);
    },
    () => ({}),
  ],
  [
    'cycle before scalar coercion',
    () =>
      new Schema({
        text: {
          type: String,
          default: () => {
            const value: any[] = [];
            value.push(value);
            return value;
          },
        },
      }),
    () => ({}),
  ],
  ['deep before scalar coercion', () => new Schema({ text: { type: String, default: () => deep(10000) } }), () => ({})],
  ['deep mixed factory', () => new Schema({ value: { type: Object, default: () => deep(10000) } }), () => ({})],
  [
    'accessor factory',
    () =>
      new Schema({
        value: {
          type: Object,
          default: () =>
            Object.defineProperty({}, 'bad', {
              enumerable: true,
              get() {
                throw new Error('getter executed');
              },
            }),
        },
      }),
    () => ({}),
  ],
  [
    'typed array accessor',
    () =>
      new Schema({
        values: {
          type: [Number],
          default: () => {
            const values = [1];
            Object.defineProperty(values, '0', {
              enumerable: true,
              get() {
                throw new Error('array getter executed');
              },
            });
            return values;
          },
        },
      }),
    () => ({}),
  ],
  [
    'mixed Map factory',
    () => new Schema({ value: { type: Object, default: () => new Map([['key', 1]]) } }),
    () => ({}),
  ],
  ['mixed Set factory', () => new Schema({ value: { type: Object, default: () => new Set([1]) } }), () => ({})],
  [
    'mixed class factory',
    () =>
      new Schema({
        value: {
          type: Object,
          default: () =>
            new (class {
              important = 1;
            })(),
        },
      }),
    () => ({}),
  ],
];

function undefinedDefaults(schema: Schema<any>) {
  return Object.fromEntries(
    [...schema.paths].filter(([, path]) => path.options.default !== undefined).map(([key]) => [key, undefined]),
  );
}

describe('RMRX-09 insert conversion default budgets', () => {
  it.each(cases)('bounds %s as one raw/default/output operation', (_label, makeSchema, input) => {
    const schema = makeSchema();
    expect(() => new Document(input(), schema, {})).toThrow(WriteNormalizationError);
    expect(() => documentToStorage(input(), schema, { applyDefaults: true })).toThrow(WriteNormalizationError);
  });

  it.each([true, false])(
    'rejects late defaults before fake save insertion, validation=%s',
    async (validateBeforeSave) => {
      for (const [label, makeSchema] of cases.filter(([name]) => name !== 'raw input plus compacting default')) {
        const schema = makeSchema();
        schema.options.validateBeforeSave = validateBeforeSave;
        const adapter = new FakePersistenceAdapter();
        const doc = new Document(undefinedDefaults(schema), schema, { collection: adapter });
        await expect(doc.save(), label).rejects.toBeInstanceOf(WriteNormalizationError);
        expect(doc.isNew).toBe(true);
        expect(adapter.calls.insert, label).toEqual([]);
        expect(adapter.snapshot(), label).toEqual([]);
      }
    },
  );

  it.each(['updateOne', 'findOneAndUpdate'] as const)(
    'rejects every late default shape before fake %s upsert insertion',
    async (op) => {
      for (const [label, makeSchema] of cases.filter(([name]) => name !== 'raw input plus compacting default')) {
        const schema = makeSchema();
        const adapter = new FakePersistenceAdapter();
        const runtime = { schema, collection: adapter, resolveCollection: async () => adapter };
        const query = new Query(runtime, schema, adapter).setOperationDescriptor({
          op,
          filter: { _id: 'upsert' },
          update: {},
          options: { upsert: true, setDefaultsOnInsert: true },
        });
        await expect(query.exec(), label).rejects.toBeInstanceOf(WriteNormalizationError);
        expect(adapter.calls.insert, label).toEqual([]);
        expect(adapter.snapshot(), label).toEqual([]);
      }
    },
  );

  it('preflights typed defaults before mapping or invoking scalar coercion', () => {
    const coercion = vi.fn(() => 1);
    class Numeric {
      payload = many();
      valueOf() {
        return coercion();
      }
    }
    const schema = new Schema({ value: { type: Number, default: () => new Numeric() }, raw: Object });
    expect(() => documentToStorage({ raw: many() }, schema, { applyDefaults: true })).toThrow(WriteNormalizationError);
    expect(coercion).not.toHaveBeenCalled();
    const mapped = vi.fn();
    class Values extends Array<number> {
      override map<U>(fn: (value: number, index: number, array: number[]) => U): U[] {
        mapped();
        return super.map(fn);
      }
    }
    const arraySchema = new Schema({ values: { type: [Number], default: () => new Values(2100).fill(1) } });
    expect(() => documentToStorage({}, arraySchema, { applyDefaults: true })).toThrow(WriteNormalizationError);
    expect(mapped).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'checks defaults introduced after pre-save hooks once, validation=%s',
    async (validateBeforeSave) => {
      const events: string[] = [];
      const schema = new Schema(
        { values: { type: [Number], default: () => Array(2100).fill(1) } },
        { validateBeforeSave },
      );
      schema.pre('validate', function () {
        events.push('validate');
      });
      schema.pre('save', function (this: any) {
        events.push('save');
        this.values = undefined;
      });
      schema.post('save', function (_doc: any) {
        events.push('success');
      });
      schema.post('save', { errorHandler: true }, function () {
        events.push('error');
      });
      const adapter = new FakePersistenceAdapter();
      const doc = new Document({ values: [] }, schema, { collection: adapter });
      await expect(doc.save()).rejects.toBeInstanceOf(WriteNormalizationError);
      expect(events).toEqual(validateBeforeSave ? ['validate', 'save', 'error'] : ['save', 'error']);
      expect(adapter.calls.insert).toEqual([]);
    },
  );

  it('preserves scalar casts, Date ownership, undefined omission and once-per-conversion factories', () => {
    class Numeric {
      valueOf() {
        return 7;
      }
    }
    const at = new Date('2024-01-01T00:00:00.000Z');
    const source = Object.assign(Object.create(null), { at, nested: [[1]] });
    const factory = vi.fn(() => source);
    const schema = new Schema({
      value: { type: Object, default: factory },
      num: { type: Number, default: () => new Numeric() },
      str: { type: String, default: () => 12n },
      at: { type: Date, default: () => at },
      values: { type: [Number], default: () => ['1', 2n] },
      optional: String,
    });
    const stored = documentToStorage({ optional: undefined }, schema, { applyDefaults: true });
    expect(stored).toEqual({
      value: { at: at.toISOString(), nested: [[1]] },
      num: 7,
      str: '12',
      at: at.toISOString(),
      values: [1, 2],
    });
    expect(factory).toHaveBeenCalledTimes(1);
    source.nested[0].push(2);
    expect(stored.value.nested).toEqual([[1]]);
    expect(documentToStorage({ value: undefined }, schema, { applyDefaults: false })).toEqual({});
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('accepts exact raw-plus-default and output limits and rejects one beyond', () => {
    for (const extra of [0, 1]) {
      const schema = new Schema({ raw: String, text: { type: String, default: () => Array(997 + extra).fill('x') } });
      const convert = () => documentToStorage({ raw: Array(1000).fill('y') }, schema, { applyDefaults: true });
      // root + raw array + 1000 entries + default array + 997 entries = 2000.
      if (extra) expect(convert).toThrow(WriteNormalizationError);
      else expect(convert().text).toBe(Array(997).fill('x').join(','));
    }
    const fields = Object.fromEntries(
      Array.from({ length: 999 }, (_, i) => [`v${i}`, { type: [Number], default: () => 1 }]),
    );
    const schema = new Schema({ scalar: Number, ...fields });
    expect(Object.keys(documentToStorage({ scalar: 1 }, schema, { applyDefaults: true }))).toHaveLength(1000);
    expect(() =>
      documentToStorage({ scalar: 1, _id: 'extra' }, schema, { applyDefaults: true, allowId: true }),
    ).toThrow(WriteNormalizationError);
  });

  it.each([
    'save',
    'save validation off',
    'create',
    'create array',
    'ordered',
    'unordered',
    'updateOne',
    'findOneAndUpdate',
  ])('rejects late defaults in %s before real-memory native writes', async (operation) => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `rmrx09_reject_${Date.now()}` }));
    try {
      const M = connection.model(
        'LateDefaults',
        new Schema(
          {
            key: String,
            values: { type: [Number], default: () => Array(2100).fill(1) },
          },
          { validateBeforeSave: operation !== 'save validation off' },
        ),
      );
      const adapter = await M.resolveCollection();
      const insert = vi.spyOn(adapter, 'insert');
      const insertMany = vi.spyOn(adapter, 'insertMany');
      expect(() => new M({})).toThrow(WriteNormalizationError);
      const invalid = { key: 'invalid', values: undefined };
      const valid = { key: 'valid', values: [] };
      const actions: Record<string, () => PromiseLike<any>> = {
        save: () => new M(invalid).save(),
        'save validation off': () => new M(invalid).save(),
        create: () => M.create(invalid),
        'create array': () => M.create([valid, invalid]),
        ordered: () => M.insertMany([valid, invalid], { ordered: true }),
        unordered: () => M.insertMany([valid, invalid], { ordered: false }),
        updateOne: () => M.updateOne({ key: 'upsert' }, {}, { upsert: true, setDefaultsOnInsert: true }),
        findOneAndUpdate: () =>
          M.findOneAndUpdate({ key: 'upsert' }, {}, { upsert: true, setDefaultsOnInsert: true, new: true }),
      };
      await expect(actions[operation]()).rejects.toBeInstanceOf(WriteNormalizationError);
      expect(insert).not.toHaveBeenCalled();
      expect(insertMany).not.toHaveBeenCalled();
      expect(await M.countDocuments()).toBe(0);
    } finally {
      await connection.disconnect();
    }
  });

  it.each([true, false])(
    'bounds defaults introduced by insertMany hooks before ordered=%s native writes',
    async (ordered) => {
      const connection = new Connection();
      await connection.connect(() => createMemoryDatabase({ name: `rmrx09_hook_${ordered}_${Date.now()}` }));
      try {
        const schema = new Schema({ values: { type: [Number], default: () => Array(2100).fill(1) } });
        const hook = vi.fn();
        schema.pre('insertMany', function (docs: any[]) {
          hook();
          docs[1].values = undefined;
        });
        const M = connection.model('HookDefaults', schema);
        const adapter = await M.resolveCollection();
        const insert = vi.spyOn(adapter, 'insertMany');
        await expect(M.insertMany([{ values: [] }, { values: [] }], { ordered })).rejects.toBeInstanceOf(
          WriteNormalizationError,
        );
        expect(hook).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        expect(await M.countDocuments()).toBe(0);
      } finally {
        await connection.disconnect();
      }
    },
  );

  it.each(['nodes', 'depth'] as const)(
    'persists and reloads exact %s-limit defaults across all insert paths',
    async (limit) => {
      const connection = new Connection();
      await connection.connect(() => createMemoryDatabase({ name: `rmrx09_limit_${limit}_${Date.now()}` }));
      try {
        const make = () => (limit === 'nodes' ? Array(MAX_STORAGE_NODES - 3).fill(1) : deep(MAX_STORAGE_DEPTH - 1));
        const M = connection.model(
          'ExactDefaults',
          new Schema<any>({ value: { type: limit === 'nodes' ? [Number] : Object, default: make } }),
        );
        const late = { value: undefined };
        await new M(late).save();
        await M.create(late);
        await M.create([{ value: limit === 'nodes' ? [] : {} }, late]);
        for (const ordered of [true, false]) await M.insertMany([late], { ordered });
        await M.updateOne({ _id: 'upsert-one' }, {}, { upsert: true, setDefaultsOnInsert: true });
        await M.findOneAndUpdate({ _id: 'upsert-two' }, {}, { upsert: true, setDefaultsOnInsert: true, new: true });
        const records = await M.find();
        expect(records).toHaveLength(8);
        for (const doc of records) {
          if (Object.keys(doc.toObject().value).length) expect(doc.toObject().value).toEqual(make());
          await doc.save();
        }
      } finally {
        await connection.disconnect();
      }
    },
  );

  it('retains prepared create-array defaults, Dates and once-per-save hooks without rerunning factories', async () => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `rmrx09_prepare_${Date.now()}` }));
    try {
      const at = new Date('2024-01-01T00:00:00.000Z');
      const factory = vi.fn(() => at);
      const pre = vi.fn();
      const post = vi.fn();
      const schema = new Schema({ at: { type: Date, default: factory } });
      schema.pre('save', function (this: any) {
        expect(this.at).toEqual(at);
        pre();
      });
      schema.post('save', function () {
        post();
      });
      const M = connection.model('PreparedDefaults', schema);
      const docs = await M.create([{ at: undefined }, { at: undefined }]);
      expect(factory).toHaveBeenCalledTimes(2);
      expect(pre).toHaveBeenCalledTimes(2);
      expect(post).toHaveBeenCalledTimes(2);
      for (const doc of docs) {
        expect(doc.toObject().at).toEqual(at);
        expect(doc.toObject().at).not.toBe(at);
        expect((await M.findById(doc._id))!.toObject().at).toEqual(at);
      }
    } finally {
      await connection.disconnect();
    }
  });

  it('preserves explicit undefined in subdocuments while preparing late create-array defaults', async () => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `rmrx09_undefined_${Date.now()}` }));
    try {
      const factory = vi.fn(() => {
        throw new Error('overridden nested default');
      });
      const child = new Schema({ optional: { type: String, default: factory }, count: Number });
      const M = connection.model(
        'UndefinedDefaults',
        new Schema({
          profile: child,
          late: { type: child, default: () => ({ optional: undefined, count: 1 }) },
        }),
      );
      const docs = await M.create([{ profile: { optional: undefined, count: 2 }, late: undefined }]);
      expect(factory).not.toHaveBeenCalled();
      expect(docs[0].toObject()).toMatchObject({
        profile: { optional: undefined, count: 2 },
        late: { optional: undefined, count: 1 },
      });
      expect((await M.findById(docs[0]._id))!.toObject()).toEqual({
        _id: docs[0]._id,
        profile: { count: 2 },
        late: { count: 1 },
      });
    } finally {
      await connection.disconnect();
    }
  });

  it('keeps hostile defaults unevaluated for default-disabled upserts and subsequent loaded/projected saves', async () => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `rmrx09_disabled_${Date.now()}` }));
    try {
      const factory = vi.fn(() => Array(2100).fill(1));
      const M = connection.model(
        'DisabledDefaults',
        new Schema({ key: String, values: { type: [Number], default: factory } }),
      );
      await M.updateOne({ _id: 'disabled' }, { $set: { key: 'before' } }, { upsert: true, setDefaultsOnInsert: false });
      const loaded = await M.findById('disabled');
      loaded!.set('key', 'full');
      await loaded!.save();
      const selected = await M.findOne({ _id: 'disabled' }).select('key');
      selected!.set('key', 'selected');
      await selected!.save();
      expect((await M.findById('disabled'))!.toObject()).toEqual({ _id: 'disabled', key: 'selected' });
      expect(factory).not.toHaveBeenCalled();
    } finally {
      await connection.disconnect();
    }
  });
});
