import { afterEach, describe, expect, it } from 'vitest';
import { Connection, Schema, SchemaConfigurationError, ValidationError, convertToRxJsonSchema } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';

let counter = 0;

async function connectedModel(schema: Schema<any>, name = 'SchemaBehavior') {
  counter += 1;
  const connection = new Connection();
  await connection.connect(() => createMemoryDatabase({ name: `schema_behavior_${counter}` }));
  const Model = connection.model(name, schema);
  return { connection, Model };
}

describe('schema compilation behavior', () => {
  const connections: Connection[] = [];

  afterEach(async () => {
    await Promise.all(connections.splice(0).map((connection) => connection.disconnect()));
  });

  it('uses one compiled representation for public JSON Schema and RxDB schema', () => {
    const child = new Schema({ label: { type: String, required: true } });
    const schema = new Schema({
      name: { type: String, required: true, index: true },
      age: Number,
      active: Boolean,
      seenAt: Date,
      child,
      children: [child],
      tags: [String],
      mixed: Object,
    });

    const publicSchema = schema.toJSONSchema();
    const rxSchema = convertToRxJsonSchema('canonical', schema);

    expect(publicSchema.required).toEqual(['name']);
    expect(rxSchema.required).toEqual(['name']);
    expect(publicSchema.properties.name).toEqual({ type: 'string' });
    expect(rxSchema.properties.name).toEqual({ type: 'string' });
    expect(publicSchema.properties.seenAt).toEqual({ type: 'string', format: 'date-time' });
    expect(rxSchema.properties.seenAt).toEqual({ type: 'string', format: 'date-time', maxLength: 50 });
    expect(publicSchema.properties.child.required).toEqual(['label']);
    expect(rxSchema.properties.child.required).toEqual(['label']);
    expect(rxSchema.indexes).toEqual([['name']]);
  });

  it('snapshots schema structure for compiled models and rejects later Schema.add()', async () => {
    const schema = new Schema({ name: String });
    const { connection, Model } = await connectedModel(schema, 'SnapshotUser');
    connections.push(connection);

    expect(() => schema.add({ age: Number })).toThrow(SchemaConfigurationError);
    // BMRX-12: direct structural mutation of the source schema after
    // compilation is rejected (not silently isolated).
    expect(() =>
      schema.paths.set('forced', {
        name: 'forced',
        type: 'string',
        options: {},
        definition: String,
        nested: false,
        isArray: false,
      }),
    ).toThrow(SchemaConfigurationError);
    expect(() =>
      Model.schema.paths.set('forced', {
        name: 'forced',
        type: 'string',
        options: {},
        definition: String,
        nested: false,
        isArray: false,
      }),
    ).toThrow(SchemaConfigurationError);

    const created = await Model.create({ name: 'Ada', forced: 'ignored' } as any);
    expect(created.toObject()).not.toHaveProperty('forced');
    expect(Model.schema.path('forced')).toBeUndefined();
  });

  it('clones mutable structure, hooks, virtuals, child schemas, options, and query helpers independently', () => {
    const child = new Schema({ label: String });
    const schema = new Schema({ child, tags: [child] }, { collection: 'originals' });
    const originalPre = () => undefined;
    schema.pre('save', originalPre);
    schema.virtual('summary').get(function () {
      return 'original';
    });
    schema.queryHelpers.byName = () => 'original';

    const clone = schema.clone();
    clone.add({ added: Number });
    clone.options.collection = 'clones';
    clone.pre('save', () => undefined);
    clone.virtuals.get('summary')!.get(function () {
      return 'clone';
    });
    clone.queryHelpers.byName = () => 'clone';
    (clone.path('child')!.subSchema as Schema).add({ extra: Boolean });

    expect(schema.path('added')).toBeUndefined();
    expect(schema.options.collection).toBe('originals');
    expect(schema.preHooks.get('save')).toHaveLength(1);
    expect(
      schema.virtuals.get('summary')!.getter!.call({} as any, undefined, schema.virtuals.get('summary')!, {}),
    ).toBe('original');
    expect(schema.queryHelpers.byName()).toBe('original');
    expect((schema.path('child')!.subSchema as Schema).path('extra')).toBeUndefined();
  });

  it('keeps only implemented schema options observable', async () => {
    const schema = new Schema(
      {
        name: { type: String, required: true, match: /^A/, index: true },
        age: { type: Number, default: 18, min: 0, max: 150, validate: (value: number) => value % 2 === 0 },
        locked: { type: String, immutable: true },
      },
      { _id: true, collection: 'accepted_options', validateBeforeSave: false },
    );
    const rxSchema = convertToRxJsonSchema('accepted', schema);
    expect(rxSchema.indexes).toEqual([['name']]);
    expect(rxSchema.required).toEqual(['name']);

    const { connection, Model } = await connectedModel(schema, 'AcceptedOption');
    connections.push(connection);
    expect(Model.collectionName).toBe('accepted_options');
    const doc = new (Model as any)({ name: 'bad', age: 151, locked: 'a' });
    await expect(doc.save()).resolves.toBe(doc);
    await expect(doc.validate()).rejects.toBeInstanceOf(ValidationError);
    await expect(Model.updateOne({ _id: doc._id }, { $set: { name: 'Ada', locked: 'b' } })).rejects.toThrow(
      /immutable/,
    );
  });

  it('fails early for unsupported schema and path options', () => {
    expect(() => new Schema({ name: String }, { timestamps: true } as any)).toThrow(SchemaConfigurationError);
    expect(() => new Schema({ name: String }, { versionKey: '__v' } as any)).toThrow(SchemaConfigurationError);

    for (const option of ['get', 'set', 'alias', 'select', 'ref', 'auto', 'unique', 'sparse', 'expires']) {
      expect(() => new Schema({ field: { type: String, [option]: option === 'expires' ? 60 : true } } as any)).toThrow(
        SchemaConfigurationError,
      );
    }
  });

  it('BMRX-12 rejects exposed compiled-schema structural mutation without model effect', async () => {
    const child = new Schema({ label: { type: String, required: true } });
    const schema = new Schema({
      n: { type: Number, required: true },
      name: { type: String, immutable: true },
      child,
      scores: [Number],
    });
    const { connection, Model } = await connectedModel(schema, 'ImmutableBoundary');
    connections.push(connection);

    // Map mutators reject.
    expect(() =>
      Model.schema.paths.set('injected', {
        name: 'injected',
        type: 'string',
        options: {},
        definition: String,
        nested: false,
        isArray: false,
      }),
    ).toThrow(SchemaConfigurationError);
    expect(() => Model.schema.paths.delete('n')).toThrow(SchemaConfigurationError);
    expect(() => Model.schema.paths.clear()).toThrow(SchemaConfigurationError);
    expect(() => Model.schema.add({ late: Number })).toThrow(SchemaConfigurationError);

    // Path entry and path-options mutation rejects (frozen objects throw TypeError in strict ESM).
    expect(() => {
      (Model.schema.path('n') as any).type = 'string';
    }).toThrow();
    expect(() => {
      (Model.schema.path('n') as any).options.required = false;
    }).toThrow();
    expect(() => {
      (Model.schema.options as any).validateBeforeSave = false;
    }).toThrow();
    expect(() => {
      (Model.schema as any).paths = new Map();
    }).toThrow();
    expect(() => {
      (Model.schema as any).options = {};
    }).toThrow();

    // Nested child schema mutation rejects.
    const subSchema = Model.schema.path('child')!.subSchema as Schema;
    expect(() => subSchema.paths.delete('label')).toThrow(SchemaConfigurationError);
    expect(() => {
      (subSchema.path('label') as any).options.required = false;
    }).toThrow();

    // Compiled representation mutation rejects or has no model effect.
    const compiled = Model.schema.getCompiledSchema();
    expect(() => (compiled.paths as Map<string, unknown>).set('x', {} as any)).toThrow(SchemaConfigurationError);
    expect(() => {
      (compiled.jsonSchema.properties.n as any).type = 'string';
    }).toThrow();
    expect(() => {
      (compiled.required as string[]).push('injected');
    }).toThrow();

    // toJSONSchema returns a defensive copy: mutating it has no model effect.
    const publicSchema = Model.schema.toJSONSchema();
    publicSchema.properties.n.type = 'string';
    expect(Model.schema.toJSONSchema().properties.n).toEqual({ type: 'number' });

    // Runtime behavior stays consistent: number casting, required validation,
    // immutable validation, public JSON Schema, and RxDB schema agree.
    const casted = new (Model as any)({ n: '42', child: { label: 'x' }, name: 'a' });
    expect(typeof casted.n).toBe('number');
    expect(casted.n).toBe(42);
    await expect(new (Model as any)({ child: { label: 'x' } }).validate()).rejects.toBeInstanceOf(ValidationError);
    const persisted = await Model.create({ n: 1, child: { label: 'y' }, name: 'orig' } as any);
    await expect(Model.updateOne({ _id: persisted._id }, { $set: { name: 'changed' } })).rejects.toThrow(/immutable/);
    expect(Model.schema.toJSONSchema().properties.n).toEqual({ type: 'number' });
    expect(Model.schema.toJSONSchema().required).toContain('n');
    const rxSchema = convertToRxJsonSchema('immutable_boundary', Model.schema);
    expect(rxSchema.properties.n).toEqual({ type: 'number' });
    expect(rxSchema.required).toContain('n');
    expect(Model.schema.path('injected')).toBeUndefined();
    expect(Model.schema.path('n')!.type).toBe('number');
  });

  it('BMRX-12 keeps compiled clones independently editable and preserves hooks', async () => {
    const schema = new Schema({ n: Number });
    schema.method('greet', function (this: any) {
      return `hi:${this.n}`;
    });
    const hookCalls: string[] = [];
    schema.pre('save', function (this: any, next: () => void) {
      hookCalls.push('pre');
      next();
    });
    const { connection, Model } = await connectedModel(schema, 'ImmutableClone');
    connections.push(connection);

    // Clone of the compiled model schema stays editable.
    const clone = Model.schema.clone();
    clone.add({ extra: String });
    clone.options.collection = 'clones';
    expect(clone.path('extra')).toBeDefined();
    expect(Model.schema.path('extra')).toBeUndefined();

    // Nonstructural method/hook behavior still works on the compiled model.
    const doc = new (Model as any)({ n: 7 });
    expect(doc.greet()).toBe('hi:7');
    await doc.save();
    expect(hookCalls).toEqual(['pre']);
  });
});
