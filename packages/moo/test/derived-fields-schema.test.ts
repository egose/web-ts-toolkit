import { Schema, SchemaType, type SchemaDefinition } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { defineDerivedField, DerivedFieldsDependencyError } from '../src/plugins/derived-fields';
import { registerDerivedFields, supportedDerivedFieldTypes } from '../src/plugins/derived-fields/registration';

describe('derived fields schema registration', () => {
  it('discovers descriptor and shorthand fields without invoking getters', () => {
    const getName = vi.fn(() => 'name');
    const getLabel = vi.fn(async () => 'label');
    const schema = new Schema({
      firstName: { type: String, immutable: true },
      lastName: String,
      fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get: getName } },
      label: { type: String, derived: getLabel },
      profile: { city: String },
      tags: [String],
      metadata: Schema.Types.Mixed,
    });
    schema.virtual('displayName').get(() => 'virtual');
    const registration = registerDerivedFields(schema);

    expect(registration.fields).toEqual([
      { targetPath: 'fullName', mode: 'dependencies', dependsOn: ['firstName', 'lastName'], get: getName },
      { targetPath: 'label', mode: 'always', dependsOn: [], get: getLabel },
    ]);
    expect(registration.inputPaths).toEqual(['firstName', 'lastName', '_id']);
    expect(getName).not.toHaveBeenCalled();
    expect(getLabel).not.toHaveBeenCalled();
  });

  it('snapshots descriptors, getter references, and the supported input registry', () => {
    const originalGet = () => 'original';
    const schema = new Schema({
      firstName: String,
      lastName: String,
      fullName: { type: String, derived: { dependsOn: ['firstName'], get: originalGet } },
    });
    const registration = registerDerivedFields(schema);
    const option = schema.path('fullName').options.derived;
    option.dependsOn.push('lastName');
    option.get = () => 'replacement';
    schema.path('fullName').options.derived = () => 'another';
    schema.add({ addedLater: String });

    expect(registration.fields[0].dependsOn).toEqual(['firstName']);
    expect(registration.fields[0].get).toBe(originalGet);
    expect(registration.inputPaths).toEqual(['firstName', 'lastName', '_id']);
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.isFrozen(registration.fields)).toBe(true);
    expect(Object.isFrozen(registration.fields[0])).toBe(true);
    expect(Object.isFrozen(registration.fields[0].dependsOn)).toBe(true);
    expect(Object.isFrozen(registration.inputPaths)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['boolean', false],
    ['number', 4],
    ['string', 'getter'],
    ['array', []],
    ['date', new Date()],
    ['empty descriptor', {}],
    ['missing dependsOn', { get: () => 'name' }],
    ['missing get', { dependsOn: ['firstName'] }],
    ['extra option', { dependsOn: ['firstName'], get: () => 'name', extra: true }],
    ['non-array dependencies', { dependsOn: 'firstName', get: () => 'name' }],
    ['non-function getter', { dependsOn: ['firstName'], get: 'name' }],
    ['non-string dependency', { dependsOn: [1], get: () => 'name' }],
    ['sparse dependencies', { dependsOn: new Array(1), get: () => 'name' }],
    ['empty dependency', { dependsOn: [''], get: () => 'name' }],
    ['whitespace dependency', { dependsOn: [' firstName'], get: () => 'name' }],
    ['nested dependency', { dependsOn: ['profile.name'], get: () => 'name' }],
    ['positional dependency', { dependsOn: ['$firstName'], get: () => 'name' }],
    ['duplicate dependency', { dependsOn: ['firstName', 'firstName'], get: () => 'name' }],
  ])('rejects malformed %s options with the target path', (_label, derived) => {
    const schema = new Schema({ firstName: String, fullName: { type: String, derived } });
    expect(() => registerDerivedFields(schema)).toThrow(TypeError);
    expect(() => registerDerivedFields(schema)).toThrow('target "fullName"');
  });

  it('accepts explicit empty dependencies for a new-document/target-change constant', () => {
    const schema = new Schema({ constant: { type: String, derived: { dependsOn: [], get: () => 'constant' } } });
    expect(registerDerivedFields(schema).fields[0].dependsOn).toEqual([]);
  });

  it.each(['unknown', 'displayName', 'aliasName'])('rejects non-persisted dependency %s', (dependency) => {
    const schema = new Schema({
      firstName: { type: String, alias: 'aliasName' },
      fullName: { type: String, derived: { dependsOn: [dependency], get: () => 'name' } },
    });
    schema.virtual('displayName').get(() => 'virtual');
    expect(() => registerDerivedFields(schema)).toThrow(`unknown or non-persisted dependency path "${dependency}"`);
  });

  it.each(['fullName', 'label'])('rejects self/other-derived dependency %s regardless of order', (dependency) => {
    const schema = new Schema({
      fullName: { type: String, derived: { dependsOn: [dependency], get: () => 'name' } },
      label: { type: String, derived: () => 'label' },
    });
    expect(() => registerDerivedFields(schema)).toThrow(`dependency path "${dependency}" is itself a derived target`);
  });

  const unsupportedTypes = [
    ['Mixed', Schema.Types.Mixed],
    ['Array', [String]],
    ['Map', { type: Map, of: String }],
    ['Subdocument', new Schema({ name: String })],
    ['Buffer', Buffer],
    ['UUID', Schema.Types.UUID],
    ['Double', Schema.Types.Double],
    ['Int32', Schema.Types.Int32],
  ] as const;

  it.each(unsupportedTypes)('rejects unsupported %s targets and dependencies', (_name, type) => {
    // A dynamic table intentionally exercises runtime configuration validation.
    const options = typeof type === 'object' && 'type' in type ? type : { type };
    const target = new Schema({ value: { ...options, derived: () => 'value' } } as SchemaDefinition);
    expect(() => registerDerivedFields(target)).toThrow('only root scalar persisted paths are supported');

    const dependency = new Schema({
      source: type,
      value: { type: String, derived: { dependsOn: ['source'], get: () => 'value' } },
    } as SchemaDefinition);
    expect(() => registerDerivedFields(dependency)).toThrow('dependency path "source" must be a supported root scalar');
  });

  it('rejects ordinary nested-object dependencies', () => {
    const schema = new Schema({
      profile: { name: String },
      fullName: { type: String, derived: { dependsOn: ['profile'], get: () => 'name' } },
    });
    expect(() => registerDerivedFields(schema)).toThrow('dependency path "profile"');
  });

  it.each([undefined, '__v', 'revision'] as const)(
    'rejects managed version key targets/dependencies (%j)',
    (versionKey) => {
      const key = versionKey ?? '__v';
      const options = versionKey ? { versionKey } : {};
      const targetSchema = new Schema(
        {
          source: Number,
          [key]: { type: Number, derived: { dependsOn: ['source'], get: () => 14 } },
        },
        options,
      );
      expect(() => registerDerivedFields(targetSchema)).toThrow(`Mongoose-managed version key "${key}"`);

      for (const declared of [false, true]) {
        const inputSchema = new Schema(
          {
            ...(declared ? { [key]: Number } : {}),
            result: { type: String, derived: { dependsOn: [key], get: () => 'value' } },
          },
          options,
        );
        expect(() => registerDerivedFields(inputSchema)).toThrow(`Mongoose-managed version key "${key}"`);
      }
    },
  );

  it.each([undefined, '__v', 'revision'] as const)(
    'excludes the managed version key from the input registry (%j)',
    (versionKey) => {
      const key = versionKey ?? '__v';
      const schema = new Schema(
        {
          source: String,
          [key]: Number,
          result: { type: String, derived: () => 'value' },
        },
        versionKey ? { versionKey } : {},
      );
      expect(registerDerivedFields(schema).inputPaths).toEqual(['source', '_id']);
    },
  );

  it('includes explicitly declared version-like ordinary fields when versioning is disabled', () => {
    const schema = new Schema(
      {
        __v: Number,
        revision: Number,
        result: { type: String, derived: { dependsOn: ['__v', 'revision'], get: () => 'value' } },
      },
      { versionKey: false },
    );
    expect(registerDerivedFields(schema).inputPaths).toEqual(['__v', 'revision', '_id']);
  });

  it.each([
    ['String', String],
    ['Number', Number],
    ['Boolean', Boolean],
    ['Date', Date],
    ['ObjectId', Schema.Types.ObjectId],
    ['Decimal128', Schema.Types.Decimal128],
    ['BigInt', Schema.Types.BigInt],
  ] as const)('accepts supported %s targets and dependencies', (name, type) => {
    const schema = new Schema({
      source: { type },
      value: { type, derived: { dependsOn: ['source'], get: () => undefined } },
    });
    const registration = registerDerivedFields(schema);
    expect(supportedDerivedFieldTypes).toContain(name);
    expect(registration.inputPaths).toContain('source');
    expect(registration.fields[0].targetPath).toBe('value');
  });

  it('rejects unknown custom schema kinds', () => {
    const source = new SchemaType('source', {}, 'CustomScalar');
    const schema = new Schema({
      source,
      value: { type: String, derived: { dependsOn: ['source'], get: () => 'x' } },
    } as unknown as SchemaDefinition);
    expect(() => registerDerivedFields(schema)).toThrow('dependency path "source" must be a supported root scalar');
  });

  it.each([true, () => false])('rejects immutable target metadata without evaluating it', (immutable) => {
    const schema = new Schema({ value: { type: String, immutable, derived: () => 'value' } });
    expect(() => registerDerivedFields(schema)).toThrow('immutable targets are not supported');
  });

  it('uses effective path immutability, including .immutable() calls and the MongoDB _id path', () => {
    const schema = new Schema({ value: { type: String, derived: () => 'value' } });
    schema.path('value').immutable(true);
    expect(() => registerDerivedFields(schema)).toThrow('immutable targets');
    schema.path('value').immutable(false);
    expect(() => registerDerivedFields(schema)).not.toThrow();

    const idSchema = new Schema({ _id: { type: String, immutable: false, derived: () => 'id' } });
    expect(() => registerDerivedFields(idSchema)).toThrow('immutable targets');
  });

  it.each([
    ['nested POJO', () => new Schema({ profile: { value: { type: String, derived: () => 'value' } } })],
    [
      'single nested schema',
      () => new Schema({ profile: new Schema({ value: { type: String, derived: () => 'value' } }) }),
    ],
    [
      'document array',
      () => new Schema({ profile: [new Schema({ value: { type: String, derived: () => 'value' } })] }),
    ],
    ['array element', () => new Schema({ profile: [{ type: String, derived: () => 'value' }] })],
    ['nested array element', () => new Schema({ profile: [[{ type: String, derived: () => 'value' }]] })],
    ['map value', () => new Schema({ profile: { type: Map, of: { type: String, derived: () => 'value' } } })],
  ] as const)('finds and rejects derived targets inside a %s', (_name, makeSchema) => {
    expect(() => registerDerivedFields(makeSchema())).toThrow(/target "profile\./);
  });

  it('does not loop or silently permit nested derived fields in recursive schemas', () => {
    const recursive = new Schema({ source: String });
    recursive.add({ children: [recursive] });
    expect(() => registerDerivedFields(recursive)).not.toThrow();

    const withDerived = new Schema({ value: { type: String, derived: () => 'value' } });
    withDerived.add({ children: [withDerived] });
    expect(() => registerDerivedFields(withDerived)).toThrow('target "children.value"');
  });

  it('rejects derived metadata on virtual targets', () => {
    const schema = new Schema({ source: String });
    schema.virtual('computed', { derived: () => 'virtual' });
    expect(() => registerDerivedFields(schema)).toThrow('must be persisted schema paths, not virtuals');
  });

  it('finds unsupported metadata inside Mongoose 9 Union members', () => {
    const schema = new Schema({
      value: { type: Schema.Types.Union, of: [{ type: String, derived: () => 'value' }, Number] },
    });
    expect(() => registerDerivedFields(schema)).toThrow('derived targets inside union containers are not supported');
  });

  it('rejects duplicate successful registrations, including schemas with no derived paths', () => {
    for (const schema of [
      new Schema({ source: String }),
      new Schema({ value: { type: String, derived: () => 'x' } }),
    ]) {
      registerDerivedFields(schema);
      expect(() => registerDerivedFields(schema)).toThrow('already registered on this schema');
    }
  });

  it('does not poison registration when malformed configuration is corrected', () => {
    const schema = new Schema({ source: String, value: { type: String, derived: false } });
    expect(() => registerDerivedFields(schema)).toThrow(TypeError);
    schema.path('value').options.derived = { dependsOn: ['source'], get: () => 'value' };
    expect(registerDerivedFields(schema).fields).toHaveLength(1);
  });
});

describe('derived field public definitions', () => {
  it('uses a type-only authoring helper without changing descriptors or getters', () => {
    type User = { firstName: string; fullName: string };
    const descriptor = { dependsOn: ['firstName'] as const, get: () => 'name' };
    expect(defineDerivedField<User, 'fullName'>(descriptor)).toBe(descriptor);
    const get = async () => undefined;
    expect(defineDerivedField<User, 'fullName'>(get)).toBe(get);
  });

  it('snapshots structured dependency issues without retaining source state', () => {
    const issues = [{ targetPath: 'fullName', missingPaths: ['lastName'] }];
    const error = new DerivedFieldsDependencyError(issues);
    issues[0].missingPaths.push('later');
    issues[0].targetPath = 'changed';
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DerivedFieldsDependencyError');
    expect(error.code).toBe('MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES');
    expect(error.issues).toEqual([{ targetPath: 'fullName', missingPaths: ['lastName'] }]);
    expect(error.message).toBe('derivedFieldsPlugin missing dependencies: "fullName" requires "lastName"');
    expect(Object.isFrozen(error.issues)).toBe(true);
    expect(Object.isFrozen(error.issues[0])).toBe(true);
    expect(Object.isFrozen(error.issues[0].missingPaths)).toBe(true);
  });
});
