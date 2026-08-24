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
    schema.paths.set('forced', {
      name: 'forced',
      type: 'string',
      options: {},
      definition: String,
      nested: false,
      isArray: false,
    });

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
});
