import { describe, expect, it } from 'vitest';
import { Connection, Schema, SchemaConfigurationError, ValidationError, convertToRxJsonSchema } from '../src/index';
import { castDocumentToSchema, documentToStorage, storageToDocument } from '../src/converter';
import { validateObjectAgainstSchema } from '../src/document';
import { createMemoryDatabase } from '../src/storage/index';

let counter = 0;

async function isolatedConnection() {
  counter += 1;
  const connection = new Connection();
  await connection.connect(() => createMemoryDatabase({ name: `bmrx14_${counter}_${Date.now()}` }));
  return connection;
}

describe('BMRX-14 nested schema forms and required metadata', () => {
  it('rejects inline nested plain-object definitions before collection creation', () => {
    expect(() => new Schema({ profile: { name: String, age: Number } } as any)).toThrow(SchemaConfigurationError);
    expect(() => new Schema({ profile: { type: { name: String } } } as any)).toThrow(SchemaConfigurationError);
    expect(() => new Schema({ items: [{ name: String }] } as any)).toThrow(SchemaConfigurationError);
    expect(() => new Schema({ 'profile.name': String } as any)).toThrow(SchemaConfigurationError);
  });

  it('rejects prefixed Schema.add before collection creation', () => {
    const schema = new Schema({ a: String });
    expect(() => schema.add({ name: String } as any, 'profile')).toThrow(SchemaConfigurationError);
    // Unprefixed add still works.
    schema.add({ b: Number });
    expect(schema.path('b')).toBeDefined();
    expect(schema.path('profile.name' as any)).toBeUndefined();
  });

  it('keeps explicit child Schema forms consistent across schema output, casting, validation, and storage', async () => {
    const child = new Schema({ label: { type: String, required: true } });
    const schema = new Schema({
      name: { type: String, required: true },
      child,
      children: [child],
    });

    // Schema output agrees.
    const publicSchema = schema.toJSONSchema();
    expect(publicSchema.properties.child.properties.label).toEqual({ type: 'string' });
    expect(publicSchema.properties.child.required).toEqual(['label']);
    expect(publicSchema.required).toEqual(['name']);
    const rxSchema = convertToRxJsonSchema('bmrx14', schema);
    expect(rxSchema.properties.child.properties.label).toEqual({ type: 'string' });
    expect(rxSchema.properties.child.required).toEqual(['label']);
    expect(rxSchema.required).toEqual(['name']);

    // Casting applies child casts.
    const casted = castDocumentToSchema({ name: 'Ada', child: { label: 42 } }, schema);
    expect(casted.child.label).toBe('42');

    // Validation enforces child required.
    await expect(
      validateObjectAgainstSchema({ name: 'Ada', child: {} }, schema, { name: 'Ada', child: {} }),
    ).rejects.toBeInstanceOf(ValidationError);
    await validateObjectAgainstSchema({ name: 'Ada', child: { label: 'x' } }, schema, {
      name: 'Ada',
      child: { label: 'x' },
    });

    // Storage round-trip preserves nested shape.
    const stored = documentToStorage({ name: 'Ada', child: { label: 'x' } }, schema, {});
    expect(stored.child).toEqual({ label: 'x' });
    expect(storageToDocument({ _id: 'id1', name: 'Ada', child: { label: 'x' } }, schema).child).toEqual({
      label: 'x',
    });
  });

  it('retained child Schema forms agree across hydration and updates on real storage', async () => {
    const connection = await isolatedConnection();
    try {
      const child = new Schema({ label: { type: String, required: true } });
      const Model = connection.model(
        'Bmrx14Nested',
        new Schema({ name: { type: String, required: true }, child } as any),
        `bmrx14_nested_${counter}`,
      );
      const created = await Model.create({ name: 'Ada', child: { label: 'x' } } as any);
      expect((created.toObject() as any).child.label).toBe('x');
      const reloaded = await Model.findById(created._id);
      expect((reloaded!.toObject() as any).child.label).toBe('x');
      await Model.updateOne({ _id: created._id }, { $set: { 'child.label': 'y' } });
      const updated = await Model.findById(created._id);
      expect((updated!.toObject() as any).child.label).toBe('y');
      // Child required still enforced on writes missing the nested field.
      await expect(Model.create({ name: 'NoChild', child: {} } as any)).rejects.toBeInstanceOf(ValidationError);
    } finally {
      await connection.disconnect();
    }
  });

  it('does not encode dynamic required functions as unconditional storage requirements', async () => {
    const rootFalse = new Schema({
      nick: {
        type: String,
        required(this: any) {
          return false;
        },
      },
    } as any);
    const rootTrue = new Schema({
      nick: {
        type: String,
        required(this: any) {
          return true;
        },
      },
    } as any);
    expect(rootFalse.toJSONSchema().required ?? []).not.toContain('nick');
    expect(rootTrue.toJSONSchema().required ?? []).not.toContain('nick');
    expect(convertToRxJsonSchema('bmrx14f', rootFalse).required ?? []).not.toContain('nick');
    expect(convertToRxJsonSchema('bmrx14t', rootTrue).required ?? []).not.toContain('nick');

    // Validation still decides dynamically at root level.
    await validateObjectAgainstSchema({}, rootFalse as any, {});
    await expect(validateObjectAgainstSchema({}, rootTrue as any, {})).rejects.toBeInstanceOf(ValidationError);

    // Nested conditional-required agrees between validation and both schemas.
    const child = new Schema({
      label: {
        type: String,
        required(this: any) {
          return (this as any)?.need === true;
        },
      },
    } as any);
    const parent = new Schema({ child } as any);
    expect(parent.toJSONSchema().properties.child.required ?? []).not.toContain('label');
    expect(convertToRxJsonSchema('bmrx14n', parent).properties.child.required ?? []).not.toContain('label');
    await validateObjectAgainstSchema({ child: { need: false } }, parent as any, { child: { need: false } });
    await expect(
      validateObjectAgainstSchema({ child: { need: true } }, parent as any, { child: { need: true } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await validateObjectAgainstSchema({ child: { need: true, label: 'x' } }, parent as any, {
      child: { need: true, label: 'x' },
    });

    // Array [fn, message] form is dynamic too, not a static requirement.
    const arrayForm = new Schema({
      nick: {
        type: String,
        required: [
          function (this: any) {
            return false;
          },
          'need nick',
        ],
      },
    } as any);
    expect(arrayForm.toJSONSchema().required ?? []).not.toContain('nick');
    await validateObjectAgainstSchema({}, arrayForm as any, {});

    // Static boolean and [true, message] forms remain unconditional in both schemas.
    const staticBool = new Schema({ nick: { type: String, required: true } });
    const staticTuple = new Schema({ nick: { type: String, required: [true, 'need nick'] } } as any);
    expect(staticBool.toJSONSchema().required).toContain('nick');
    expect(staticTuple.toJSONSchema().required).toContain('nick');
    expect(convertToRxJsonSchema('bmrx14b', staticBool).required).toContain('nick');
    expect(convertToRxJsonSchema('bmrx14u', staticTuple).required).toContain('nick');
  });

  it('conditional-required true/false cases persist consistently on real storage', async () => {
    const connection = await isolatedConnection();
    try {
      const Model = connection.model(
        'Bmrx14Cond',
        new Schema({
          kind: String,
          nick: {
            type: String,
            required(this: any) {
              return (this as any)?.kind === 'named';
            },
          },
        } as any),
        `bmrx14_cond_${counter}`,
      );
      // kind !== 'named': nick absence allowed.
      const anon = await Model.create({ kind: 'anon' } as any);
      expect((anon.toObject() as any).nick).toBeUndefined();
      // kind === 'named': nick absence rejected.
      await expect(Model.create({ kind: 'named' } as any)).rejects.toBeInstanceOf(ValidationError);
      const named = await Model.create({ kind: 'named', nick: 'Ada' } as any);
      expect((named.toObject() as any).nick).toBe('Ada');
    } finally {
      await connection.disconnect();
    }
  });
});
