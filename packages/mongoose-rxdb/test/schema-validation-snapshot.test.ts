import { afterEach, describe, expect, it } from 'vitest';
import { Connection, Document, Schema, ValidationError, convertToRxJsonSchema } from '../src/index';
import type { SchemaTypeOptions } from '../src/types';
import { castDocumentToSchema, documentToStorage, storageToDocument } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';

type Location = 'root' | 'nested' | 'subdocument-array' | 'primitive-array';
type RequiredRule = NonNullable<SchemaTypeOptions['required']>;
const locations: Location[] = ['root', 'nested', 'subdocument-array', 'primitive-array'];
const connections: Connection[] = [];
let counter = 0;

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.disconnect()));
});

async function modelFor(schema: Schema<any>) {
  const connection = new Connection();
  connections.push(connection);
  await connection.connect(() => createMemoryDatabase({ name: `rule_snapshot_${++counter}` }));
  return connection.model('RuleSnapshot', schema);
}

function fixture(
  location: Location,
  required: RequiredRule,
  validate: SchemaTypeOptions['validate'] = { validator: (value: number) => value > 0, message: 'must be positive' },
) {
  const config: SchemaTypeOptions = {
    type: Number,
    required,
    validate,
  };
  const child = new Schema({ need: Boolean, value: config });
  const schema = new Schema<any>(
    location === 'root'
      ? { need: Boolean, value: config }
      : location === 'primitive-array'
        ? { need: Boolean, values: [config] }
        : { need: Boolean, child: location === 'nested' ? child : [child] },
  );
  const options = (owner: Schema<any>): SchemaTypeOptions => {
    if (location === 'root') return owner.path('value')!.options;
    if (location === 'primitive-array') return owner.path('values')!.arrayItemOptions!;
    return (owner.path('child')!.subSchema as Schema).path('value')!.options;
  };
  const data = (value: unknown, need = true) => {
    if (location === 'root') return { need, value };
    if (location === 'primitive-array') return { need, values: [value] };
    // Deliberately different root/child context for dynamic required.
    return { need: !need, child: location === 'nested' ? { need, value } : [{ need, value }] };
  };
  const errorPath =
    location === 'root'
      ? 'value'
      : location === 'primitive-array'
        ? 'values.0'
        : location === 'nested'
          ? 'child.value'
          : 'child.0.value';
  const metadata = (json: any) =>
    location === 'root'
      ? json
      : location === 'primitive-array'
        ? json.properties.values.items
        : location === 'nested'
          ? json.properties.child
          : json.properties.child.items;
  return { schema, config, options, data, errorPath, metadata };
}

async function expectValidation(doc: Document<any>, path: string, kind?: string, message?: string) {
  if (!kind) {
    expect(doc.validateSync()).toBeUndefined();
    await expect(doc.validate()).resolves.toBeUndefined();
    return;
  }
  expect(doc.validateSync()?.errors[path]).toMatchObject({ kind, message });
  await expect(doc.validate()).rejects.toMatchObject({ errors: { [path]: { kind, message } } });
}

describe('RMRX-05 compiled validation rule ownership', () => {
  for (const location of locations) {
    for (const rule of ['static-true', 'static-false', 'dynamic'] as const) {
      it(`seals ${rule} required and custom validation at ${location}`, async () => {
        const required: RequiredRule = [
          rule === 'dynamic'
            ? function (this: any) {
                return this.need;
              }
            : rule === 'static-true',
          'original required message',
        ];
        const { schema, config, options, data, errorPath, metadata } = fixture(location, required);
        // Retain live source references before compilation, not just model lookups afterward.
        const sourceOptions = options(schema);
        const sourceRequired = sourceOptions.required as [unknown, string];
        const sourceValidate = sourceOptions.validate as { validator: (value: number) => boolean; message: string };
        const Model = await modelFor(schema);
        const baselinePublic = Model.schema.toJSONSchema();
        const baselineRx = convertToRxJsonSchema('rules', Model.schema);
        const expectedRequired = rule === 'static-true' && location !== 'primitive-array' ? ['value'] : [];
        expect(metadata(baselinePublic).required ?? []).toEqual(expectedRequired);
        expect(metadata(baselineRx).required ?? []).toEqual(expectedRequired);

        const modelOptions = options(Model.schema);
        expect(modelOptions.required).not.toBe(sourceRequired);
        expect(modelOptions.validate).not.toBe(sourceValidate);
        for (const opts of [sourceOptions, modelOptions]) {
          const tuple = opts.required as [unknown, string];
          const validation = opts.validate as object;
          // Reflect avoids strict-mode-dependent throws and lets the behavioral checks run on old code.
          expect.soft(Reflect.set(tuple, '0', rule === 'static-false')).toBe(false);
          expect.soft(Reflect.set(tuple, '1', 'corrupted required message')).toBe(false);
          expect.soft(Reflect.set(validation, 'validator', () => true)).toBe(false);
          expect.soft(Reflect.set(validation, 'message', 'corrupted validator message')).toBe(false);
        }

        // Caller-owned input remains editable, but is no longer runtime authority.
        expect.soft(Object.isFrozen(config)).toBe(false);
        expect.soft(Object.isFrozen(required)).toBe(false);
        required[0] = rule === 'static-false';
        required[1] = 'caller required message';
        const callerValidate = config.validate as { validator: (value: number) => boolean; message: string };
        callerValidate.validator = () => true;
        callerValidate.message = 'caller validator message';

        for (const owner of [schema, Model.schema]) {
          expect(owner.getCompiledSchema().paths).toBe(owner.paths);
          expect(options(owner).required).toEqual([
            rule === 'dynamic' ? expect.any(Function) : rule === 'static-true',
            'original required message',
          ]);
          expect((options(owner).validate as { message: string }).message).toBe('must be positive');
          expect(owner.toJSONSchema()).toEqual(baselinePublic);
          expect(convertToRxJsonSchema('rules', owner)).toEqual(baselineRx);
          // Recompute through an editable clone too: cached metadata must not mask live-rule corruption.
          expect(owner.clone().toJSONSchema()).toEqual(baselinePublic);
          const casted = castDocumentToSchema(data('2'), owner);
          expect(casted).toEqual(data(2));
          expect(storageToDocument(documentToStorage(casted, owner, {}), owner)).toEqual(casted);
          await expectValidation(new Document(data('-1'), owner, {}), errorPath, 'validate', 'must be positive');
          await expectValidation(new Document(data('2'), owner, {}), errorPath);
          await expectValidation(
            new Document(data(null), owner, {}),
            errorPath,
            rule === 'static-false' ? undefined : 'required',
            `Path \`${errorPath}\` is required.`,
          );
          await expectValidation(
            new Document(data(null, false), owner, {}),
            errorPath,
            rule === 'static-true' ? 'required' : undefined,
            `Path \`${errorPath}\` is required.`,
          );
        }
        await expect(Model.create(data('-1'))).rejects.toBeInstanceOf(ValidationError);
        if (rule !== 'static-false') {
          await expect(Model.create(data(null))).rejects.toBeInstanceOf(ValidationError);
        }
        const saved = await Model.create(data('2'));
        await expect(
          Model.updateOne({ _id: saved._id }, { $set: data('-1') }, { runValidators: true }),
        ).rejects.toMatchObject({ errors: { [errorPath]: { kind: 'validate', message: 'must be positive' } } });
        expect((await Model.findById(saved._id))!.toObject()).toMatchObject(data(2));
        expect(await Model.countDocuments()).toBe(1);
      });
    }

    it(`keeps compiled clones independently editable at ${location}`, async () => {
      const { schema, options, data, errorPath, metadata } = fixture(location, [true, 'original required message']);
      const Model = await modelFor(schema);
      for (const original of [schema, Model.schema]) {
        const clone = original.clone();
        const opts = options(clone);
        (opts.required as [boolean, string])[0] = false;
        (opts.required as [boolean, string])[1] = 'clone required message';
        const validator = opts.validate as { validator: (value: number) => boolean; message: string };
        validator.validator = (value) => value < 0;
        validator.message = 'must be negative';
        clone.add({ extra: String });
        const compiledClone = clone.compileForModel();
        expect(metadata(compiledClone.toJSONSchema()).required ?? []).toEqual([]);
        await expectValidation(new Document(data(null), compiledClone, {}), errorPath);
        await expectValidation(new Document(data('-1'), compiledClone, {}), errorPath);
        await expectValidation(new Document(data('2'), compiledClone, {}), errorPath, 'validate', 'must be negative');
        await expectValidation(new Document(data('-1'), original, {}), errorPath, 'validate', 'must be positive');
        await expectValidation(
          new Document(data(null), original, {}),
          errorPath,
          'required',
          `Path \`${errorPath}\` is required.`,
        );
        expect(options(original).required).toEqual([true, 'original required message']);
        expect(original.path('extra')).toBeUndefined();
      }
    });

    it(`preserves async custom validator configuration and context at ${location}`, async () => {
      const validate = {
        async validator(this: any, value: number) {
          return this.need && value > 0;
        },
        message: 'async rule failed',
      };
      const { schema, options, data, errorPath } = fixture(location, false, validate);
      const Model = await modelFor(schema);
      validate.validator = async () => true;
      validate.message = 'caller replacement';
      for (const owner of [schema, Model.schema]) {
        expect(Reflect.set(options(owner).validate as object, 'validator', () => true)).toBe(false);
        expect(Reflect.set(options(owner).validate as object, 'message', 'corrupted')).toBe(false);
        await expect(new Document(data('2'), owner, {}).validate()).resolves.toBeUndefined();
        await expect(new Document(data('2', false), owner, {}).validate()).rejects.toMatchObject({
          errors: { [errorPath]: { kind: 'validate', message: 'async rule failed' } },
        });
      }
    });
  }

  it('isolates caller rules before model compilation and through Schema.add()', async () => {
    const config: SchemaTypeOptions = {
      type: Number,
      required: [true, 'required'],
      enum: [2],
      validate: { validator: (value: number) => value === 2, message: 'only two' },
    };
    const schema = new Schema({ value: config });
    schema.add({ values: [config] });
    (config.required as [boolean, string])[0] = false;
    config.enum!.push(3);
    (config.validate as { validator: (value: number) => boolean }).validator = () => true;
    const Model = await modelFor(schema);
    await expectValidation(new (Model as any)({ values: [2] }), 'value', 'required', 'Path `value` is required.');
    const error = new (Model as any)({ value: 3, values: [3] }).validateSync();
    expect(error.errors.value).toMatchObject({ kind: 'validate', message: 'only two' });
    expect(error.errors['values.0']).toMatchObject({ kind: 'validate', message: 'only two' });
    expect(schema.path('value')!.options.enum).toEqual([2]);
    expect(Model.schema.path('values')!.arrayItemOptions!.enum).toEqual([2]);
  });

  it('keeps late hook/method registration mutable and independent on nested compiled schemas and clones', async () => {
    const child = new Schema({ value: { type: Number, required: [true, 'required'] } });
    const schema = new Schema({ child: { type: child }, children: [child] });
    const Model = await modelFor(schema);
    const clone = Model.schema.clone();
    const calls: string[] = [];
    for (const [label, owner] of [
      ['source', schema],
      ['model', Model.schema],
      ['clone', clone],
    ] as const) {
      owner.pre('validate', () => {
        calls.push(label);
      });
      owner.post('validate', () => {
        calls.push(`${label}:post`);
      });
      owner.method('label', () => label);
      owner.static('label', () => label);
      owner.queryHelpers.label = () => label;
      const nested = owner.path('child')!.subSchema as Schema;
      nested.pre('validate', () => undefined);
      nested.method('label', () => label);
      expect(nested.methods.label()).toBe(label);
      const doc = new Document({ child: { value: '2' }, children: [{ value: '3' }] }, owner, {});
      expect((doc as any).label()).toBe(label);
      await doc.validate();
      expect(owner.statics.label()).toBe(label);
      expect(owner.queryHelpers.label()).toBe(label);
    }
    expect(calls).toEqual(['source', 'source:post', 'model', 'model:post', 'clone', 'clone:post']);
  });

  for (const flags of ['g', 'y']) {
    it(`preserves writable RegExp execution state for compiled /${flags} match and custom validators`, async () => {
      const pattern = new RegExp('^ab+$', flags);
      const validator = (value: string) => {
        pattern.lastIndex = 0;
        return pattern.test(value);
      };
      const config = { type: String, match: pattern, validate: { validator, message: 'bad pattern' } };
      const child = new Schema({ value: config });
      const schema = new Schema({ value: config, child, children: [child], values: [config] });
      const Model = await modelFor(schema);
      for (const owner of [schema, Model.schema, Model.schema.clone().compileForModel()]) {
        for (const opts of [
          owner.path('value')!.options,
          owner.path('values')!.arrayItemOptions!,
          (owner.path('child')!.subSchema as Schema).path('value')!.options,
          (owner.path('children')!.subSchema as Schema).path('value')!.options,
        ]) {
          expect(Object.isFrozen(opts.match)).toBe(false);
          opts.match!.lastIndex = 2;
          expect(Object.isFrozen(validator)).toBe(false);
        }
        const good = new Document(
          { value: 'abb', child: { value: 'abb' }, children: [{ value: 'abb' }], values: ['abb'] },
          owner,
          {},
        );
        const bad = new Document({ value: 'bad' }, owner, {});
        for (let i = 0; i < 3; i++) {
          await expectValidation(good, 'value');
          await expectValidation(bad, 'value', 'validate', 'bad pattern');
        }
      }
      pattern.lastIndex = 0;
      expect(pattern.test('abb')).toBe(true);
    });
  }
});
