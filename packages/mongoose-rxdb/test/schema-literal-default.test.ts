import { afterEach, describe, expect, it, vi } from 'vitest';
import { Connection, Document, Schema, WriteNormalizationError } from '../src/index';
import { documentToStorage, MAX_STORAGE_NODES } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

const connections: Connection[] = [];
let sequence = 0;
afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.disconnect()));
});
async function connectionFor() {
  const connection = new Connection();
  connections.push(connection);
  await connection.connect(() => createMemoryDatabase({ name: `literal_defaults_${++sequence}` }));
  return connection;
}

const locations = [
  'root',
  'nested',
  'subdocument-array',
  'nested-literal',
  'array-literal',
  'mixed-array',
  'primitive-array',
] as const;
function fixture(location: (typeof locations)[number], value: any) {
  const child = new Schema({ value: { type: Object, default: value } });
  const plainChild = new Schema({ value: Object });
  switch (location) {
    case 'root':
      return { schema: child, input: {} };
    case 'nested':
      return { schema: new Schema({ child }), input: { child: {} } };
    case 'subdocument-array':
      return { schema: new Schema({ children: [child] }), input: { children: [{}] } };
    case 'nested-literal':
      return { schema: new Schema({ child: { type: plainChild, default: { value } } }), input: {} };
    case 'array-literal':
      return { schema: new Schema({ children: { type: [plainChild], default: [{ value }] } }), input: {} };
    case 'mixed-array':
      return { schema: new Schema({ values: { type: [Object], default: [value] } }), input: {} };
    case 'primitive-array':
      return { schema: new Schema({ values: { type: [Number], default: [value] } }), input: {} };
  }
}

class Custom {
  important = 1;
}
const unsupported: Array<[string, () => any]> = [
  ['Map', () => new Map([['important', 1]])],
  ['Set', () => new Set([1])],
  ['class', () => new Custom()],
];
function deep(levels: number): any {
  let value: any = {};
  for (let i = 0; i < levels; i++) value = { next: value };
  return value;
}
const hostile: Array<[string, () => any]> = [
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
  ['work', () => Array(MAX_STORAGE_NODES).fill(1)],
  ['sparse', () => Array(2)],
  [
    'accessor',
    () =>
      Object.defineProperty({}, 'value', {
        enumerable: true,
        get() {
          throw new Error('getter ran');
        },
      }),
  ],
];

describe('RMRX-10 literal defaults across schema copying', () => {
  for (const location of locations) {
    it.each(unsupported)(
      `keeps %s rejected at ${location} through originals, clones and models`,
      async (_label, make) => {
        const { schema, input } = fixture(location, make());
        const connection = await connectionFor();
        const Model = connection.model('Original', schema);
        const clone = schema.clone();
        const modelClone = Model.schema.clone();
        const adapter = new FakePersistenceAdapter();
        for (const owner of [schema, clone, Model.schema, modelClone]) {
          expect(() => new Document(input, owner, { collection: adapter })).toThrow(WriteNormalizationError);
          expect(() => documentToStorage(input, owner, { applyDefaults: true })).toThrow(WriteNormalizationError);
        }
        expect(adapter.calls.insert).toEqual([]);
        for (const model of [Model, connection.model('Cloned', clone), connection.model('ModelCloned', modelClone)]) {
          await (model as any).resolveCollection();
          const native = connection.db!.collections[(model as any).collectionKey];
          const insert = vi.spyOn(native, 'insert');
          const bulkInsert = vi.spyOn(native, 'bulkInsert');
          expect(() => new (model as any)(input)).toThrow(WriteNormalizationError);
          await expect(model.create(input as any)).rejects.toBeInstanceOf(WriteNormalizationError);
          await expect(model.create([input, input] as any)).rejects.toBeInstanceOf(WriteNormalizationError);
          for (const ordered of [true, false]) {
            await expect(model.insertMany([input, input] as any, { ordered })).rejects.toBeInstanceOf(
              WriteNormalizationError,
            );
          }
          expect(insert).not.toHaveBeenCalled();
          expect(bulkInsert).not.toHaveBeenCalled();
          expect(await model.countDocuments()).toBe(0);
        }
      },
    );
  }

  it.each(hostile)('preflights literal %s before initial ownership and later clone recursion', (_label, make) => {
    for (const type of [Object, String, [Number]]) {
      expect(() => new Schema({ value: { type, default: make() } })).toThrow(WriteNormalizationError);
      const added = new Schema();
      expect(() => added.add({ value: { type, default: make() } })).toThrow(WriteNormalizationError);
      for (const target of ['definition', 'path', 'item'] as const) {
        const config = { type, default: 1 as any };
        const schema = new Schema<any>(target === 'item' ? { values: [config] } : { value: config });
        const options =
          target === 'definition'
            ? config
            : target === 'item'
              ? schema.path('values')!.arrayItemOptions!
              : schema.path('value')!.options;
        options.default = make();
        expect(() => schema.clone()).toThrow(WriteNormalizationError);
        expect(() => schema.compileForModel()).toThrow(WriteNormalizationError);
      }
    }
  });

  it('preserves primitive-array item default kinds without treating item options as document data', () => {
    for (const [, make] of unsupported) {
      const value = make();
      const schema = new Schema({ values: [{ type: Object, default: value, validate: () => true }] });
      const compiled = schema.compileForModel();
      for (const owner of [schema, schema.clone(), compiled, compiled.clone()]) {
        const item = owner.path('values')!.arrayItemOptions!;
        expect(item.default).toBeInstanceOf(value.constructor);
        // Item defaults do not fill array holes or undefined elements.
        expect(() => new Document({ values: [undefined] }, owner, {})).toThrow(WriteNormalizationError);
        expect(new Document({ values: [] }, owner, {}).toObject().values).toEqual([]);
      }
    }
  });

  it('owns Date/plain/null-prototype literal graphs independently at every schema and document boundary', async () => {
    const nullObject = Object.assign(Object.create(null), { default: { type: 'data', n: 1 } });
    const value = { plain: { n: 1 }, nullObject, date: new Date('2024-01-01'), array: [{ n: 1 }] };
    const config = { type: Object, default: value };
    const schema = new Schema({ value: config });
    const connection = await connectionFor();
    const Model = connection.model('Owned', schema);
    const owners = [schema, schema.clone(), Model.schema, Model.schema.clone()];
    const defaults = owners.map((owner) => owner.path('value')!.options.default as typeof value);
    for (const item of defaults) {
      expect(item).not.toBe(value);
      expect(item.plain).not.toBe(value.plain);
      expect(item.date).not.toBe(value.date);
      expect(Object.getPrototypeOf(item.nullObject)).toBe(null);
      expect(item.nullObject.default).toEqual({ type: 'data', n: 1 });
    }
    value.plain.n = 9;
    value.nullObject.default.n = 9;
    value.date.setUTCFullYear(1999);
    value.array[0].n = 9;
    expect(Object.isFrozen(config)).toBe(false);
    expect(Object.isFrozen(value)).toBe(false);
    for (const item of defaults) {
      expect(item.plain.n).toBe(1);
      expect(item.date.getUTCFullYear()).toBe(2024);
      expect(item.array[0].n).toBe(1);
      expect(item.nullObject.default.n).toBe(1);
    }
    defaults[1].plain.n = 2;
    defaults[1].date.setUTCFullYear(2020);
    defaults[3].array[0].n = 3;
    expect(defaults[0].plain.n).toBe(1);
    expect(defaults[2].date.getUTCFullYear()).toBe(2024);
    expect(defaults[2].array[0].n).toBe(1);
    const first: any = await Model.create({});
    first.value.plain.n = 10;
    first.value.date.setUTCFullYear(2000);
    const second: any = await Model.create({});
    expect(second.value.plain.n).toBe(1);
    expect(second.value.date.getUTCFullYear()).toBe(2024);
    expect((await Model.findById(second._id))!.toObject().value).toEqual({
      ...defaults[2],
      date: defaults[2].date.toISOString(),
    });
  });

  it('retains nonplain scalar coercions (including private state) without pre-casting away raw budgets', async () => {
    const convert = vi.fn();
    class Text {
      #text = 'legitimate';
      toString() {
        convert();
        return this.#text;
      }
    }
    class Numeric {
      #number = 42;
      valueOf() {
        convert();
        return this.#number;
      }
    }
    const schema = new Schema({
      text: { type: String, default: new Text() },
      number: { type: Number, default: new Numeric() },
    });
    const connection = await connectionFor();
    const Model = connection.model('Casts', schema);
    const owners = [schema, schema.clone(), Model.schema, Model.schema.clone()];
    expect(convert).not.toHaveBeenCalled();
    for (const owner of owners) {
      expect(new Document({}, owner, {}).toObject()).toMatchObject({ text: 'legitimate', number: 42 });
    }
    const doc = await Model.create({});
    expect((await Model.findById(doc._id))!.toObject()).toMatchObject({ text: 'legitimate', number: 42 });
    class Compact {
      payload = Array(1100).fill(1);
      toString() {
        convert();
        return 'small';
      }
    }
    const large = new Schema({
      a: { type: String, default: new Compact() },
      b: { type: String, default: new Compact() },
    });
    for (const owner of [large, large.clone(), large.compileForModel(), large.clone()]) {
      expect(() => new Document({}, owner, {})).toThrow(WriteNormalizationError);
      expect(() => documentToStorage({}, owner, { applyDefaults: true })).toThrow(WriteNormalizationError);
    }
  });

  it.each(locations)('preserves valid literal values and independent defaults at %s', async (location) => {
    const literal = location === 'primitive-array' ? '7' : { count: 1, at: new Date('2024-01-01') };
    const { schema, input } = fixture(location, literal);
    const connection = await connectionFor();
    const Model = connection.model('Valid', schema);
    const expected = new Document(input, schema, {}).toObject();
    delete expected._id;
    for (const owner of [schema, schema.clone(), Model.schema, Model.schema.clone()]) {
      const first = new Document(input, owner, {}).toObject();
      delete first._id;
      expect(first).toEqual(expected);
      expect(first).not.toBe(expected);
      const model = connection.model(`Valid${++sequence}`, owner.clone());
      const created = await model.create(input as any);
      const stored = documentToStorage(created.toObject(), owner, { allowId: true });
      expect(await model.findOne({ _id: created._id }).lean()).toEqual(stored);
      expect((await model.findById(created._id))!.toObject()).toEqual(stored);
    }
  });

  it.each(['nodes', 'depth'] as const)(
    'preserves exact document %s limits through literal copies and reloads',
    async (limit) => {
      const literal = limit === 'nodes' ? Array(MAX_STORAGE_NODES - 3).fill(1) : deep(49);
      const schema = new Schema({ value: { type: limit === 'nodes' ? [Number] : Object, default: literal } });
      const connection = await connectionFor();
      const compiled = connection.model('Exact', schema);
      for (const owner of [schema, schema.clone(), compiled.schema, compiled.schema.clone()]) {
        const model = connection.model(`Exact${++sequence}`, owner.clone());
        const created = await model.create({});
        expect((await model.findById(created._id))!.toObject().value).toEqual(literal);
        for (const ordered of [true, false]) {
          const [inserted] = await model.insertMany([{}], { ordered });
          expect((await model.findById(inserted._id))!.toObject().value).toEqual(literal);
        }
      }
      // This default alone fits the copy limit but not a document envelope.
      const over = new Schema({
        value: { type: Object, default: limit === 'nodes' ? Array(MAX_STORAGE_NODES - 2).fill(1) : deep(50) },
      });
      for (const owner of [over, over.clone(), over.compileForModel(), over.clone()]) {
        expect(() => documentToStorage({ _id: 'one' }, owner, { applyDefaults: true, allowId: true })).toThrow(
          WriteNormalizationError,
        );
      }
    },
  );

  it('keeps factories and rule callbacks out of the literal-data copier', async () => {
    const factory = vi.fn(() => ({ type: 'literal', default: { n: 1 } }));
    Object.assign(factory, { cycle: factory });
    const required = function () {
      return true;
    };
    const validator = vi.fn(() => true);
    const regexp = /ok/g;
    const child = new Schema({
      value: { type: Object, default: factory, required: [required, 'needed'], validate: { validator } },
    });
    const schema = new Schema({
      child: { type: child, default: {} },
      label: { type: String, default: 'ok', match: regexp },
    });
    const before = vi.fn();
    schema.pre('save', before);
    const connection = await connectionFor();
    const Model = connection.model('Callbacks', schema);
    const clone = Model.schema.clone();
    expect(factory).not.toHaveBeenCalled();
    const late = vi.fn();
    Model.schema.pre('save', late);
    const created = await Model.create({});
    expect(created.toObject().child).toEqual({ value: { type: 'literal', default: { n: 1 } } });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(before).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalled();
    const rule = (Model.schema.path('child')!.subSchema as Schema).path('value')!.options;
    expect(Object.isFrozen(rule.required)).toBe(true);
    expect(Object.isFrozen(rule.validate)).toBe(true);
    expect(Object.isFrozen((clone.path('child')!.subSchema as Schema).path('value')!.options.required)).toBe(false);
    expect(Object.isFrozen(regexp)).toBe(false);
  });

  it('rechecks mutable literal graphs before clone or persistence, without native writes', async () => {
    const schema = new Schema({ value: { type: Object, default: { n: 1 } } });
    const connection = await connectionFor();
    const Model = connection.model('Mutated', schema);
    await (Model as any).resolveCollection();
    const native = connection.db!.collections[(Model as any).collectionKey];
    const insert = vi.spyOn(native, 'insert');
    const bulkInsert = vi.spyOn(native, 'bulkInsert');
    const value: any = Model.schema.path('value')!.options.default;
    for (const [, make] of hostile) {
      value.bad = make();
      expect(() => Model.schema.clone()).toThrow(WriteNormalizationError);
      await expect(Model.create({})).rejects.toBeInstanceOf(WriteNormalizationError);
      for (const ordered of [true, false])
        await expect(Model.insertMany([{}], { ordered })).rejects.toBeInstanceOf(WriteNormalizationError);
      delete value.bad;
    }
    expect(insert).not.toHaveBeenCalled();
    expect(bulkInsert).not.toHaveBeenCalled();
    expect(await Model.countDocuments()).toBe(0);
  });
});
