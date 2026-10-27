import mongoose, { Schema, Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import {
  defineDerivedField,
  derivedFieldsPlugin,
  DerivedFieldsDependencyError,
  type DerivedFieldGetter,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Person = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string;
  note?: string;
};

const fullName: DerivedFieldGetter<Person, string> = (person) =>
  [person.firstName, person.lastName].filter((part) => part != null && part !== '').join(' ');

const modelName = () => `DerivedFields${mongoose.modelNames().length}`;
const personModel = (
  options: {
    get?: DerivedFieldGetter<Person, string>;
    hiddenLastName?: boolean;
    lastNameDefault?: string;
    hiddenTarget?: boolean;
    required?: boolean;
  } = {},
) => {
  const get = vi.fn(options.get ?? fullName);
  const schema = new Schema<Person>({
    firstName: String,
    lastName: { type: String, select: options.hiddenLastName ? false : undefined, default: options.lastNameDefault },
    fullName: {
      type: String,
      index: true,
      required: options.required,
      select: options.hiddenTarget ? false : undefined,
      derived: defineDerivedField<Person, 'fullName'>({ dependsOn: ['firstName', 'lastName'], get }),
    },
    note: String,
  });
  schema.plugin(derivedFieldsPlugin);
  return { Person: mongoose.model(modelName(), schema), get };
};

describe('derivedFieldsPlugin persisted document lifecycle', () => {
  it('persists Model.create/new save results that are searchable, sortable, and usable with an ordinary index', async () => {
    const { Person, get } = personModel({
      lastNameDefault: 'Lovelace',
      get: async (person) => {
        await Promise.resolve();
        return fullName(person);
      },
    });
    await Person.init();
    const ada = new Person({ firstName: 'Ada' });
    expect(ada.fullName).toBeUndefined();
    await ada.save();
    const [grace, alan] = await Person.create([
      { firstName: 'Grace', lastName: 'Hopper' },
      { firstName: 'Alan', lastName: 'Turing' },
    ]);
    expect(get).toHaveBeenCalledTimes(3);
    expect(await Person.collection.findOne({ _id: ada._id })).toMatchObject({ fullName: 'Ada Lovelace' });
    expect(
      (await Person.find({ fullName: /^A/ }).hint({ fullName: 1 }).sort({ fullName: -1 })).map((p) => p._id),
    ).toEqual([alan._id, ada._id]);
    expect((await Person.findOne({ fullName: 'Grace Hopper' }))?._id).toEqual(grace._id);

    get.mockClear();
    const loaded = await Person.findById(ada._id).orFail();
    expect(loaded.fullName).toBe('Ada Lovelace');
    expect(loaded.toObject().fullName).toBe('Ada Lovelace');
    expect(get).not.toHaveBeenCalled();
  });

  it('computes before required/custom validation, including standalone validation without a write', async () => {
    const validate = vi.fn((value: string) => value === 'Ada Lovelace');
    const schema = new Schema<Person>({
      firstName: String,
      lastName: String,
      fullName: {
        type: String,
        required: true,
        validate,
        derived: defineDerivedField<Person, 'fullName'>({ dependsOn: ['firstName', 'lastName'], get: fullName }),
      },
    });
    schema.plugin(derivedFieldsPlugin);
    const Person = mongoose.model(modelName(), schema);
    const person = new Person({ firstName: 'Ada', lastName: 'Lovelace', fullName: 'caller override' });
    await person.validate();
    expect(person.fullName).toBe('Ada Lovelace');
    expect(validate).toHaveBeenLastCalledWith('Ada Lovelace');
    expect(await Person.countDocuments()).toBe(0);
    await person.save();
    expect(validate).toHaveBeenCalledTimes(2);
    expect((await Person.findById(person._id))?.fullName).toBe('Ada Lovelace');
  });

  it('recomputes modified dependencies and explicit target overrides through normal setters', async () => {
    const { Person, get } = personModel();
    const person = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    get.mockClear();
    person.firstName = 'Grace';
    await person.save();
    expect(get).toHaveBeenCalledTimes(1);
    expect(person.fullName).toBe('Grace Lovelace');
    person.fullName = 'arbitrary override';
    await person.save();
    expect(get).toHaveBeenCalledTimes(2);
    expect((await Person.findById(person._id))?.fullName).toBe('Grace Lovelace');
  });

  it('clears a persisted target when the getter returns undefined', async () => {
    const { Person } = personModel({ get: (person) => (person.firstName ? fullName(person) : undefined) });
    const person = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    person.firstName = undefined;
    await person.save();
    expect(person.fullName).toBeUndefined();
    expect(await Person.collection.findOne({ _id: person._id })).not.toHaveProperty('fullName');
  });

  it('repeats validate/save coherently without duplicate getters inside a normal save', async () => {
    const { Person, get } = personModel();
    const person = new Person({ firstName: 'Ada', lastName: 'Lovelace' });
    await person.validate();
    await person.validate();
    expect(get).toHaveBeenCalledTimes(2);
    await person.save();
    expect(get).toHaveBeenCalledTimes(3);
    await person.save();
    await person.validate();
    expect(get).toHaveBeenCalledTimes(3);
    person.firstName = 'Grace';
    await person.validate();
    expect(get).toHaveBeenCalledTimes(4);
    await person.save();
    expect(get).toHaveBeenCalledTimes(5);
    await person.save();
    expect(get).toHaveBeenCalledTimes(5);
    expect((await Person.findById(person._id))?.fullName).toBe('Grace Lovelace');
  });
});

describe('derivedFieldsPlugin real query projections', () => {
  it('allows unrelated changes, rejects a changed source with missing inputs before I/O, and retains assignments', async () => {
    const { Person, get } = personModel();
    const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    const person = await Person.findById(saved._id).select('firstName fullName note').orFail();
    get.mockClear();
    person.note = 'allowed unrelated update';
    await person.save();
    expect(get).not.toHaveBeenCalled();
    person.firstName = 'Grace';
    person.note = 'unsaved assignment';
    const read = vi.spyOn(Person.collection, 'findOne');
    const write = vi.spyOn(Person.collection, 'updateOne');
    try {
      await expect(person.save()).rejects.toMatchObject({
        code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES',
        issues: [{ targetPath: 'fullName', missingPaths: ['lastName'] }],
      });
      expect(read).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
    expect(get).not.toHaveBeenCalled();
    expect(person.firstName).toBe('Grace');
    expect(person.note).toBe('unsaved assignment');
    expect(person.isModified('firstName')).toBe(true);
    expect(person.fullName).toBe('Ada Lovelace');
    expect(await Person.collection.findOne({ _id: saved._id })).toMatchObject({
      firstName: 'Ada',
      fullName: 'Ada Lovelace',
      note: 'allowed unrelated update',
    });
    person.lastName = 'Hopper';
    await person.save();
    expect((await Person.findById(saved._id))?.fullName).toBe('Grace Hopper');
  });

  it.each(['fullName note', 'note'])(
    'skips unchanged wholly excluded dependencies with selection %s',
    async (selection) => {
      const { Person, get } = personModel({ required: true });
      const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
      const person = await Person.findById(saved._id).select(selection).orFail();
      get.mockClear();
      await person.validate();
      person.note = 'unrelated';
      await person.save();
      await person.save();
      expect(get).not.toHaveBeenCalled();
      expect((await Person.findById(saved._id))?.fullName).toBe('Ada Lovelace');
      if (selection === 'note') expect(person.fullName).toBeUndefined();
    },
  );

  it.each(['Hopper', undefined, null])(
    'accepts excluded full replacement %j and retains availability across saves',
    async (lastName) => {
      const { Person, get } = personModel();
      const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
      const person = await Person.findById(saved._id).select('firstName').orFail();
      get.mockClear();
      person.firstName = 'Grace';
      person.lastName = lastName;
      await person.save();
      expect(person.isModified()).toBe(false);
      person.firstName = 'Admiral';
      await person.validate();
      await person.save();
      expect(get).toHaveBeenCalledTimes(3);
      expect(get.mock.calls.at(-1)?.[0]).toHaveProperty('lastName', lastName);
      expect((await Person.findById(saved._id))?.fullName).toBe(lastName ? 'Admiral Hopper' : 'Admiral');
    },
  );

  it.each([true, false])(
    'persists an excluded undefined replacement after an earlier save (validation %s)',
    async (validateBeforeSave) => {
      const { Person, get } = personModel();
      const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
      const person = await Person.findById(saved._id).select('firstName note').orFail();
      person.note = 'first save without sources changing';
      await person.save();
      get.mockClear();

      person.lastName = undefined;
      person.firstName = 'Grace';
      await person.save({ validateBeforeSave });
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0][0]).toHaveProperty('lastName', undefined);
      expect(await Person.collection.findOne({ _id: saved._id })).toMatchObject({
        firstName: 'Grace',
        fullName: 'Grace',
      });
      expect(await Person.collection.findOne({ _id: saved._id })).not.toHaveProperty('lastName');

      person.firstName = 'Admiral';
      await person.save({ validateBeforeSave });
      expect(get).toHaveBeenCalledTimes(2);
      expect((await Person.findById(saved._id))?.fullName).toBe('Admiral');
    },
  );

  it('honors an explicit same-default replacement after an earlier save without treating default application as a replacement', async () => {
    const { Person, get } = personModel({ lastNameDefault: 'manufactured' });
    const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    const person = await Person.findById(saved._id).select('firstName note').orFail();
    person.note = 'initial unrelated save';
    await person.save();
    Person.applyDefaults(person);
    expect(person.lastName).toBe('manufactured');
    get.mockClear();
    person.firstName = 'Grace';
    await expect(person.save()).rejects.toBeInstanceOf(DerivedFieldsDependencyError);
    expect(get).not.toHaveBeenCalled();
    person.lastName = 'manufactured';
    await person.save();
    expect(get).toHaveBeenCalledTimes(1);
    expect(await Person.collection.findOne({ _id: saved._id })).toMatchObject({
      lastName: 'manufactured',
      fullName: 'Grace manufactured',
    });
  });

  it.each([undefined, 'Lovelace'])(
    'retains new-document input availability after saving with projection metadata (default %j)',
    async (lastNameDefault) => {
      const { Person, get } = personModel({ lastNameDefault });
      const person = new Person({ firstName: 'Ada' }, { firstName: 1 });
      Person.applyDefaults(person);
      await person.save();
      get.mockClear();
      person.firstName = 'Grace';
      await person.save();
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0][0]).toHaveProperty('lastName', lastNameDefault);
      expect((await Person.findById(person._id))?.fullName).toBe(lastNameDefault ? 'Grace Lovelace' : 'Grace');
    },
  );

  it.each([undefined, null])('passes selected genuine absence/null %j as a known value', async (lastName) => {
    const { Person, get } = personModel();
    const _id = new Types.ObjectId();
    await Person.collection.insertOne({ _id, firstName: 'Ada', ...(lastName === null ? { lastName } : {}) });
    const person = await Person.findById(_id).select('firstName lastName').orFail();
    person.firstName = 'Grace';
    await person.save();
    expect(get.mock.calls[0][0]).toHaveProperty('lastName', lastName);
    expect(person.fullName).toBe('Grace');
    expect((await Person.findById(_id))?.fullName).toBe('Grace');
  });

  it('does not trust hidden/excluded defaults; explicit same-default assignments and +selection are available', async () => {
    const { Person, get } = personModel({ hiddenLastName: true, lastNameDefault: 'default name' });
    const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    const hidden = await Person.findById(saved._id).orFail();
    expect(hidden.lastName).toBeUndefined();
    get.mockClear();
    hidden.note = 'unrelated';
    await hidden.save();
    expect(get).not.toHaveBeenCalled();
    hidden.firstName = 'Grace';
    await expect(hidden.save()).rejects.toBeInstanceOf(DerivedFieldsDependencyError);
    expect(get).not.toHaveBeenCalled();

    // An inclusive projection also lets applyDefaults manufacture the omitted
    // value without Mongoose 9.9.2's exclusion-projection applyDefaults bug.
    const manufactured = await Person.findById(saved._id).select('firstName fullName note').orFail();
    Person.applyDefaults(manufactured);
    expect(manufactured.lastName).toBe('default name');
    manufactured.firstName = 'Grace';
    await expect(manufactured.save()).rejects.toBeInstanceOf(DerivedFieldsDependencyError);
    expect(get).not.toHaveBeenCalled();
    manufactured.lastName = 'default name';
    await manufactured.save();
    expect(manufactured.fullName).toBe('Grace default name');

    const selected = await Person.findById(saved._id).select('+lastName').orFail();
    selected.firstName = 'Admiral';
    await selected.save();
    expect(selected.fullName).toBe('Admiral default name');
  });

  it('does not recompute an unselected target alone, but overwrites explicit assignments with complete sources', async () => {
    const { Person, get } = personModel({ hiddenTarget: true });
    const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    const person = await Person.findById(saved._id).orFail();
    expect(person.fullName).toBeUndefined();
    get.mockClear();
    person.note = 'unrelated';
    await person.save();
    expect(get).not.toHaveBeenCalled();
    person.fullName = 'override';
    await person.save();
    expect(person.fullName).toBe('Ada Lovelace');
    person.firstName = 'Grace';
    await person.save();
    expect(get).toHaveBeenCalledTimes(2);
    expect((await Person.findById(saved._id).select('+fullName'))?.fullName).toBe('Grace Lovelace');
  });

  it('rejects target assignments with excluded sources and preserves the caller assignment', async () => {
    const { Person, get } = personModel();
    const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    const person = await Person.findById(saved._id).select('fullName').orFail();
    get.mockClear();
    person.fullName = 'caller override';
    await expect(person.save()).rejects.toMatchObject({
      issues: [{ targetPath: 'fullName', missingPaths: ['firstName', 'lastName'] }],
    });
    expect(person.fullName).toBe('caller override');
    expect(person.isModified('fullName')).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect((await Person.findById(saved._id))?.fullName).toBe('Ada Lovelace');
  });

  it('preflights an excluded undefined target assignment after an earlier unrelated save', async () => {
    const { Person, get } = personModel();
    const saved = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    const person = await Person.findById(saved._id).select('note').orFail();
    person.note = 'unrelated';
    await person.save();
    get.mockClear();
    person.fullName = undefined;
    await expect(person.save()).rejects.toMatchObject({
      issues: [{ targetPath: 'fullName', missingPaths: ['firstName', 'lastName'] }],
    });
    expect(get).not.toHaveBeenCalled();
    expect((await Person.findById(saved._id))?.fullName).toBe('Ada Lovelace');
    person.firstName = 'Grace';
    person.lastName = 'Hopper';
    await person.save();
    expect(get).toHaveBeenCalledTimes(1);
    expect((await Person.findById(saved._id))?.fullName).toBe('Grace Hopper');
  });

  it('preflights every scheduled field before invoking even a ready getter', async () => {
    const ready = vi.fn(() => 'ready');
    const missing = vi.fn(() => 'missing');
    const schema = new Schema({
      first: String,
      second: String,
      third: String,
      ready: { type: String, derived: { dependsOn: ['first'], get: ready } },
      missingA: { type: String, derived: { dependsOn: ['first', 'second'], get: missing } },
      missingB: { type: String, derived: { dependsOn: ['first', 'third'], get: missing } },
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const saved = await Model.create({ first: 'one', second: 'two', third: 'three' });
    const person = await Model.findById(saved._id).select('first').orFail();
    ready.mockClear();
    missing.mockClear();
    person.first = 'changed';
    await expect(person.save()).rejects.toMatchObject({
      issues: [
        { targetPath: 'missingA', missingPaths: ['second'] },
        { targetPath: 'missingB', missingPaths: ['third'] },
      ],
    });
    expect(ready).not.toHaveBeenCalled();
    expect(missing).not.toHaveBeenCalled();
    expect((await Model.findById(saved._id))?.first).toBe('one');
  });
});

describe('derivedFieldsPlugin pending default writes', () => {
  it.each([
    [String, 'new-default', true],
    [String, 'new-default', false],
    [String, '', true],
    [String, '', false],
    [Number, 0, true],
    [Number, 0, false],
    [Boolean, false, true],
    [Boolean, false, false],
  ] as const)(
    'derives a selected %s source default %j queued without modification (validation %s)',
    async (type, value, validateBeforeSave) => {
      const get = vi.fn((view: Readonly<Record<string, unknown>>) => `derived:${view.source}`);
      const propertyGetter = vi.fn(() => 'not the raw value');
      const schema = new Schema({
        source: { type, default: value, get: propertyGetter },
        note: String,
        result: { type: String, derived: { dependsOn: ['source'], get } },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const _id = new Types.ObjectId();
      await Model.collection.insertOne({ _id, note: 'old', result: 'derived:old' });
      const document = await Model.findById(_id).orFail();
      expect(document.$isDefault('source')).toBe(true);
      expect(document.isModified('source')).toBe(false);
      document.note = 'unrelated';
      await document.save({ validateBeforeSave });
      expect(await Model.collection.findOne({ _id })).toMatchObject({
        source: value,
        result: `derived:${value}`,
        note: 'unrelated',
      });
      expect(get).toHaveBeenCalledTimes(1);
      expect(propertyGetter).not.toHaveBeenCalled();

      await document.validate();
      await document.save({ validateBeforeSave });
      document.note = 'another unrelated change';
      await document.save({ validateBeforeSave });
      expect(get).toHaveBeenCalledTimes(1);
      expect(await Model.collection.findOne({ _id })).toMatchObject({ source: value, result: `derived:${value}` });
    },
  );

  it.each([
    [undefined, true],
    [undefined, false],
    ['source note', true],
    ['source note', false],
  ] as const)(
    'derives a pending target default with selection %j (validation %s)',
    async (selection, validateBeforeSave) => {
      const get = vi.fn((view: Readonly<Record<string, unknown>>) => `derived:${view.source}`);
      const schema = new Schema({
        source: String,
        note: String,
        result: { type: String, default: 'fallback', derived: { dependsOn: ['source'], get } },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const _id = new Types.ObjectId();
      await Model.collection.insertOne({ _id, source: 'original', note: 'old' });
      const document = await Model.findById(_id)
        .select(selection ?? '')
        .orFail();
      if (selection) Model.applyDefaults(document);
      expect(document.$isDefault('result')).toBe(true);
      expect(document.isModified('result')).toBe(false);
      document.note = 'unrelated';
      await document.save({ validateBeforeSave });
      expect(await Model.collection.findOne({ _id })).toMatchObject({
        source: 'original',
        result: 'derived:original',
        note: 'unrelated',
      });
      expect(get).toHaveBeenCalledTimes(1);
      await document.validate();
      await document.save({ validateBeforeSave });
      expect(get).toHaveBeenCalledTimes(1);
    },
  );

  it.each([true, false])(
    'preflights an excluded source default on an unrelated save (validation %s)',
    async (validateBeforeSave) => {
      const get = vi.fn((view: Readonly<Record<string, unknown>>) => `derived:${view.source}`);
      const schema = new Schema({
        source: { type: String, default: 'manufactured' },
        note: String,
        result: { type: String, derived: { dependsOn: ['source'], get } },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const _id = new Types.ObjectId();
      await Model.collection.insertOne({ _id, source: 'original', result: 'derived:original', note: 'old' });
      const document = await Model.findById(_id).select('result note').orFail();
      Model.applyDefaults(document);
      expect(document.source).toBe('manufactured');
      expect(document.$isDefault('source')).toBe(true);
      expect(document.isModified('source')).toBe(false);
      document.note = 'unrelated';
      const outcome = await document.save({ validateBeforeSave }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(await Model.collection.findOne({ _id })).toMatchObject({
        source: 'original',
        result: 'derived:original',
        note: 'old',
      });
      expect(outcome).toMatchObject({
        code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES',
        issues: [{ targetPath: 'result', missingPaths: ['source'] }],
      });
      expect(get).not.toHaveBeenCalled();
      await expect(document.validate()).rejects.toBeInstanceOf(DerivedFieldsDependencyError);
      document.source = 'manufactured';
      await document.save({ validateBeforeSave });
      expect(get).toHaveBeenCalledTimes(1);
      expect(await Model.collection.findOne({ _id })).toMatchObject({
        source: 'manufactured',
        result: 'derived:manufactured',
        note: 'unrelated',
      });
    },
  );

  it.each([true, false])(
    'preflights a target default with an excluded source (validation %s)',
    async (validateBeforeSave) => {
      const get = vi.fn((view: Readonly<Record<string, unknown>>) => `derived:${view.source}`);
      const schema = new Schema({
        source: String,
        note: String,
        result: { type: String, default: 'fallback', derived: { dependsOn: ['source'], get } },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const _id = new Types.ObjectId();
      await Model.collection.insertOne({ _id, source: 'original', note: 'old' });
      const document = await Model.findById(_id).select('result note').orFail();
      document.note = 'unrelated';
      const outcome = await document.save({ validateBeforeSave }).then(
        () => null,
        (error: unknown) => error,
      );
      const stored = await Model.collection.findOne({ _id });
      expect(stored).not.toHaveProperty('result');
      expect(stored?.note).toBe('old');
      expect(outcome).toMatchObject({ issues: [{ targetPath: 'result', missingPaths: ['source'] }] });
      expect(get).not.toHaveBeenCalled();
    },
  );

  it.each([
    [null, true],
    [null, false],
    [undefined, true],
    [undefined, false],
  ] as const)('preserves results for inert source defaults %j (validation %s)', async (value, validateBeforeSave) => {
    const get = vi.fn(() => 'must not run');
    const schema = new Schema({
      source: { type: String, default: value },
      note: String,
      result: { type: String, derived: { dependsOn: ['source'], get } },
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    for (const excluded of [false, true]) {
      const _id = new Types.ObjectId();
      await Model.collection.insertOne({ _id, result: 'preserved', ...(excluded ? { source: 'stored' } : {}) });
      const document = await Model.findById(_id)
        .select(excluded ? 'result note' : '')
        .orFail();
      if (excluded) Model.applyDefaults(document);
      expect(document.source).toBe(value);
      expect(document.isModified('source')).toBe(false);
      document.note = 'unrelated';
      await document.save({ validateBeforeSave });
      await document.save({ validateBeforeSave });
      const stored = await Model.collection.findOne({ _id });
      expect(stored).toMatchObject({ result: 'preserved', note: 'unrelated' });
      if (excluded) expect(stored?.source).toBe('stored');
      else expect(stored).not.toHaveProperty('source');
    }
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    [null, true],
    [null, false],
    [undefined, true],
    [undefined, false],
  ] as const)(
    'does not repair missing targets with inert defaults %j (validation %s)',
    async (value, validateBeforeSave) => {
      const get = vi.fn(() => 'must not run');
      const schema = new Schema({
        source: String,
        note: String,
        result: { type: String, default: value, derived: { dependsOn: ['source'], get } },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      for (const excluded of [false, true]) {
        const _id = new Types.ObjectId();
        await Model.collection.insertOne({ _id, source: 'original' });
        const document = await Model.findById(_id)
          .select(excluded ? 'result note' : '')
          .orFail();
        expect(document.result).toBe(value);
        document.note = 'unrelated';
        await document.save({ validateBeforeSave });
        await document.save({ validateBeforeSave });
        expect(await Model.collection.findOne({ _id })).not.toHaveProperty('result');
      }
      expect(get).not.toHaveBeenCalled();
    },
  );
});

describe('derivedFieldsPlugin isolated scalar views', () => {
  it('bypasses getters/virtuals/transforms and gives each getter independent Date/ObjectId/Decimal128 storage', async () => {
    const Author = mongoose.model(modelName(), new Schema({ name: String }));
    const author = await Author.create({ name: 'private populated data' });
    const propertyGetter = vi.fn(() => 'manufactured by getter');
    const virtual = vi.fn(() => 'virtual value');
    const transform = vi.fn(() => ({ transformed: true }));
    const defaultValue = vi.fn(() => 'manufactured default');
    const views: Readonly<Record<string, unknown>>[] = [];
    let attack = false;
    const schema = new Schema(
      {
        name: { type: String, get: propertyGetter },
        date: Date,
        owner: { type: Schema.Types.ObjectId, ref: Author.modelName },
        amount: Schema.Types.Decimal128,
        count: Schema.Types.BigInt,
        active: Boolean,
        number: Number,
        hidden: { type: String, select: false, default: defaultValue },
        tags: [String],
        profile: { city: String },
        mixed: Schema.Types.Mixed,
        first: {
          type: String,
          derived: {
            dependsOn: ['name'],
            get: (view: Readonly<Record<string, unknown>>) => {
              views.push(view);
              expect(Object.getPrototypeOf(view)).toBe(Object.prototype);
              expect(Object.isFrozen(view)).toBe(true);
              expect(() => {
                (view as Record<string, unknown>).name = 'mutation';
              }).toThrow(TypeError);
              if (attack) {
                (view.date as Date).setTime(0);
                (view.owner as Types.ObjectId).id.fill(0);
                (view.amount as Types.Decimal128).bytes.fill(0);
              }
              return view.name;
            },
          },
        },
        second: {
          type: String,
          derived: {
            dependsOn: ['name'],
            get: async (view: Readonly<Record<string, unknown>>) => {
              await Promise.resolve();
              views.push(view);
              return `${view.name}:${(view.date as Date).toISOString()}:${view.owner}:${view.amount}:${view.count}:${view.active}:${view.number}`;
            },
          },
        },
      },
      { toObject: { getters: true, virtuals: true, transform }, toJSON: { transform } },
    );
    schema.virtual('virtualValue').get(virtual);
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const date = new Date('2026-10-26T12:00:00Z');
    const saved = await Model.create({
      name: 'original',
      date,
      owner: author._id,
      amount: '12.50',
      count: BigInt('9007199254740993'),
      active: false,
      number: 0,
      tags: ['not an input'],
      profile: { city: 'not an input' },
      mixed: { secret: true },
    });
    const document = await Model.findById(saved._id)
      .select('name date owner amount count active number first second')
      .populate('owner')
      .orFail();
    expect(document.populated('owner')).toEqual(author._id);
    Model.applyDefaults(document);
    document.name = 'changed';
    views.length = 0;
    propertyGetter.mockClear();
    virtual.mockClear();
    transform.mockClear();
    defaultValue.mockClear();
    attack = true;
    await document.save();
    expect(views).toHaveLength(2);
    expect(views[0]).not.toBe(views[1]);
    for (const view of views) {
      expect(Object.keys(view).sort()).toEqual(['_id', 'active', 'amount', 'count', 'date', 'name', 'number', 'owner']);
      expect(view.owner).toBeInstanceOf(Types.ObjectId);
      expect(view.owner).not.toBe(author._id);
      expect(view).not.toHaveProperty('save');
      expect(view).not.toHaveProperty('first');
      expect(view).not.toHaveProperty('second');
    }
    expect(views[1].date).toEqual(date);
    expect(views[1].owner).toEqual(author._id);
    expect(String(views[1].amount)).toBe('12.50');
    expect(document.get('date', undefined, { getters: false })).toEqual(date);
    expect(document.get('amount', undefined, { getters: false })?.toString()).toBe('12.50');
    expect(document.populated('owner')).toEqual(author._id);
    expect(document.first).toBe('changed');
    expect(document.second).toBe(`changed:${date.toISOString()}:${author._id}:12.50:9007199254740993:false:0`);
    expect(propertyGetter).not.toHaveBeenCalled();
    expect(virtual).not.toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    expect(defaultValue).not.toHaveBeenCalled();
    expect((await Model.collection.findOne({ _id: saved._id }))?.second).toBe(document.second);
  });

  it.each([
    ['ObjectId', Schema.Types.ObjectId, new Types.ObjectId()],
    ['String', String, 'string-reference'],
    ['Number', Number, 42],
  ] as const)('uses the original %s ref id even when population returns null', async (_label, type, id) => {
    const Related = mongoose.model(modelName(), new Schema({ _id: { type }, name: String }));
    const get = vi.fn((view: Readonly<Record<string, unknown>>) => String(view.owner));
    const schema = new Schema({
      owner: { type, ref: Related.modelName },
      label: { type: String, derived: { dependsOn: ['owner'], get } },
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const saved = await Model.create({ owner: id });
    const document = await Model.findById(saved._id).populate('owner').orFail();
    expect(document.owner).toBeNull();
    document.label = 'recompute';
    await document.save();
    expect(get.mock.calls.at(-1)?.[0].owner).toEqual(id);
    expect(document.label).toBe(String(id));
    expect((await Model.collection.findOne({ _id: saved._id }))?.owner).toEqual(id);
  });

  it.each(['Date', 'ObjectId', 'Decimal128'] as const)(
    'also isolates a returned %s from a retained getter input',
    async (kind) => {
      const types = { Date, ObjectId: Schema.Types.ObjectId, Decimal128: Schema.Types.Decimal128 };
      const values = {
        Date: new Date('2026-10-26'),
        ObjectId: new Types.ObjectId(),
        Decimal128: Types.Decimal128.fromString('12.5'),
      };
      let retained: unknown;
      const schema = new Schema({
        source: { type: types[kind] },
        result: {
          type: types[kind],
          derived: {
            dependsOn: ['source'],
            get: (view: Readonly<Record<string, unknown>>) => {
              retained = view.source;
              return retained;
            },
          },
        },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const document = await Model.create({ source: values[kind] });
      const before = String(document.result);
      if (retained instanceof Date) retained.setTime(0);
      if (retained instanceof Types.ObjectId) retained.id.fill(0);
      if (retained instanceof Types.Decimal128) retained.bytes.fill(0);
      expect(String(document.result)).toBe(before);
      expect(String(document.source)).toBe(before);
    },
  );
});

describe('derivedFieldsPlugin failure and validation behavior', () => {
  it.each(['sync', 'async'] as const)(
    'propagates a %s getter error without applying any staged result or writing',
    async (mode) => {
      const failure = new Error('getter failed');
      let fail = false;
      const first = vi.fn((view: Readonly<Record<string, unknown>>) => `first:${view.source}`);
      const second = () => {
        if (fail) throw failure;
        return 'second';
      };
      const schema = new Schema({
        source: String,
        first: { type: String, derived: { dependsOn: ['source'], get: first } },
        second: {
          type: String,
          derived: { dependsOn: ['source'], get: mode === 'async' ? async () => second() : second },
        },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const document = await Model.create({ source: 'old' });
      first.mockClear();
      fail = true;
      document.source = 'assigned';
      await expect(document.save()).rejects.toBe(failure);
      expect(first).toHaveBeenCalledTimes(1);
      expect(document.source).toBe('assigned');
      expect(document.isModified('source')).toBe(true);
      expect(document.first).toBe('first:old');
      expect(document.second).toBe('second');
      expect(await Model.collection.findOne({ _id: document._id })).toMatchObject({
        source: 'old',
        first: 'first:old',
      });
      fail = false;
      await document.save();
      expect((await Model.findById(document._id))?.first).toBe('first:assigned');
    },
  );

  it('casts using doc.set, runs target setters, and validates the computed cast result', async () => {
    const validate = vi.fn((value: number) => typeof value === 'number' && value > 0);
    const schema = new Schema({
      source: Number,
      score: {
        type: Number,
        required: true,
        validate,
        derived: {
          dependsOn: ['source'],
          get: (view: Readonly<Record<string, unknown>>) => String(Number(view.source) * 2),
        },
      },
      label: {
        type: String,
        set: (value: string) => value.toUpperCase(),
        validate: /^LABEL:/,
        derived: {
          dependsOn: ['source'],
          get: (view: Readonly<Record<string, unknown>>) => `label:${view.source}`,
        },
      },
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const document = await Model.create({ source: 3 });
    expect(document.score).toBe(6);
    expect(validate).toHaveBeenLastCalledWith(6);
    expect((await Model.findById(document._id))?.label).toBe('LABEL:3');
  });

  it.each([
    ['casting', 'not-a-number', 'CastError', undefined],
    ['required', undefined, 'ValidatorError', 'required'],
    ['custom validation', -1, 'ValidatorError', 'user defined'],
  ])(
    'rejects %s errors before writing, retaining source assignments and allowing correction',
    async (_label, bad, name, kind) => {
      let result: unknown = 2;
      const schema = new Schema({
        source: Number,
        score: {
          type: Number,
          required: true,
          validate: (value: number) => value >= 0,
          derived: { dependsOn: ['source'], get: () => result },
        },
      });
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const document = await Model.create({ source: 1 });
      result = bad;
      document.source = 3;
      await expect(document.save()).rejects.toMatchObject({
        name: 'ValidationError',
        errors: { score: { name, ...(kind ? { kind } : {}) } },
      });
      expect(document.source).toBe(3);
      expect(document.isModified('source')).toBe(true);
      expect(await Model.collection.findOne({ _id: document._id })).toMatchObject({ source: 1, score: 2 });
      result = 6;
      await document.save();
      expect(await Model.collection.findOne({ _id: document._id })).toMatchObject({ source: 3, score: 6 });
    },
  );
});

describe('derivedFieldsPlugin shorthand and validation-disabled saves', () => {
  it('runs a bare getter once per validation/save, even without modifications', async () => {
    const get = vi.fn((view: Readonly<Record<string, unknown>>) => `${view.source}:${get.mock.calls.length}`);
    const schema = new Schema({ source: String, label: { type: String, derived: get } });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const document = new Model({ source: 'value' });
    await document.validate();
    await document.validate();
    expect(get).toHaveBeenCalledTimes(2);
    await document.save();
    expect(get).toHaveBeenCalledTimes(3);
    await document.save();
    expect(get).toHaveBeenCalledTimes(4);
    await document.validate();
    await document.save({ validateBeforeSave: false });
    expect(get).toHaveBeenCalledTimes(6);
    expect((await Model.findById(document._id))?.label).toBe('value:6');
  });

  it('requires all supported inputs for shorthand, including hidden inputs, without requiring containers/targets', async () => {
    const get = vi.fn((view: Readonly<Record<string, unknown>>) => `${view.source}:${view.hidden}`);
    const schema = new Schema({
      source: String,
      hidden: { type: String, select: false },
      tags: [String],
      label: { type: String, derived: get },
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const saved = await Model.create({ source: 'value', hidden: 'secret', tags: ['not required'] });
    const document = await Model.findById(saved._id).select('source').orFail();
    get.mockClear();
    await expect(document.validate()).rejects.toMatchObject({
      issues: [{ targetPath: 'label', missingPaths: ['hidden'] }],
    });
    await expect(document.save({ validateBeforeSave: false })).rejects.toBeInstanceOf(DerivedFieldsDependencyError);
    expect(get).not.toHaveBeenCalled();
    document.hidden = 'replacement';
    await document.save();
    await document.save();
    expect(get).toHaveBeenCalledTimes(2);
    expect((await Model.findById(saved._id))?.label).toBe('value:replacement');
  });

  it.each(['option', 'schema'] as const)(
    'computes with validation disabled by %s, but skips required/custom validators',
    async (mode) => {
      const validate = vi.fn(() => false);
      const get = vi.fn((view: Readonly<Record<string, unknown>>) =>
        view.source === 0 ? undefined : String(view.source),
      );
      const schema = new Schema(
        {
          source: Number,
          label: { type: String, required: true, validate, derived: { dependsOn: ['source'], get } },
        },
        { validateBeforeSave: mode === 'schema' ? false : true },
      );
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const options = mode === 'option' ? { validateBeforeSave: false } : undefined;
      const document = new Model({ source: 1 });
      await document.save(options);
      expect(document.label).toBe('1');
      document.source = 0;
      await document.save(options);
      expect(await Model.collection.findOne({ _id: document._id })).not.toHaveProperty('label');
      expect(validate).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledTimes(2);
      await expect(document.validate()).rejects.toMatchObject({ errors: { label: { kind: 'required' } } });
    },
  );

  it('still rejects getter/casting failures on validation-disabled saves', async () => {
    const failure = new Error('failed without validation');
    let fail = false;
    let result: unknown = '2';
    const schema = new Schema({
      source: Number,
      score: {
        type: Number,
        derived: {
          dependsOn: ['source'],
          get: () => {
            if (fail) throw failure;
            return result;
          },
        },
      },
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const document = await Model.create({ source: 1 });
    document.source = 3;
    fail = true;
    await expect(document.save({ validateBeforeSave: false })).rejects.toBe(failure);
    fail = false;
    result = 'invalid';
    await expect(document.save({ validateBeforeSave: false })).rejects.toMatchObject({
      name: 'ValidationError',
      errors: { score: { name: 'CastError' } },
    });
    expect(document.source).toBe(3);
    expect(await Model.collection.findOne({ _id: document._id })).toMatchObject({ source: 1, score: 2 });
    result = 6;
    await document.save({ validateBeforeSave: false });
    expect((await Model.findById(document._id))?.score).toBe(6);
  });
});

describe('derivedFieldsPlugin middleware ordering', () => {
  it('sees source-changing pre-validation hooks registered before the plugin, including standalone validate()', async () => {
    const get = vi.fn(fullName);
    const schema = new Schema<Person>({
      firstName: String,
      lastName: String,
      fullName: {
        type: String,
        required: true,
        validate: /^Ada /,
        derived: { dependsOn: ['firstName', 'lastName'], get },
      },
    });
    schema.pre('validate', function () {
      this.firstName = this.firstName?.trim();
    });
    schema.plugin(derivedFieldsPlugin);
    const Person = mongoose.model(modelName(), schema);
    const person = new Person({ firstName: '  Ada  ', lastName: 'Lovelace' });
    await person.validate();
    expect(person.fullName).toBe('Ada Lovelace');
    await person.save();
    expect(get).toHaveBeenCalledTimes(2);
    expect((await Person.findById(person._id))?.fullName).toBe('Ada Lovelace');
  });

  it.each([true, false])(
    'handles source changes in preceding pre-save hooks (validation %s)',
    async (validateBeforeSave) => {
      const get = vi.fn(fullName);
      const validate = vi.fn((value: string) => !value.startsWith('Invalid'));
      const schema = new Schema<Person>({
        firstName: String,
        lastName: String,
        fullName: { type: String, required: true, validate, derived: { dependsOn: ['firstName', 'lastName'], get } },
      });
      schema.pre('save', function () {
        if (this.$locals.nextFirstName) this.firstName = this.$locals.nextFirstName as string;
      });
      schema.plugin(derivedFieldsPlugin);
      const Person = mongoose.model(modelName(), schema);
      const person = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
      get.mockClear();
      validate.mockClear();
      person.$locals.nextFirstName = 'Grace';
      await person.save({ validateBeforeSave });
      expect(get).toHaveBeenCalledTimes(1);
      expect(person.fullName).toBe('Grace Lovelace');
      if (validateBeforeSave) expect(validate).toHaveBeenLastCalledWith('Grace Lovelace');
      else expect(validate).not.toHaveBeenCalled();

      person.$locals.nextFirstName = 'Invalid';
      if (validateBeforeSave) {
        await expect(person.save()).rejects.toMatchObject({ errors: { fullName: { kind: 'user defined' } } });
        expect((await Person.findById(person._id))?.fullName).toBe('Grace Lovelace');
        expect(person.firstName).toBe('Invalid');
      } else {
        await person.save({ validateBeforeSave: false });
        expect((await Person.findById(person._id))?.fullName).toBe('Invalid Lovelace');
      }
    },
  );

  it('recomputes a new document again if a preceding pre-save hook changed its already-validated source', async () => {
    const get = vi.fn(fullName);
    const schema = new Schema<Person>({
      firstName: String,
      lastName: String,
      fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get } },
    });
    schema.pre('save', function () {
      this.firstName = this.firstName?.trim();
    });
    schema.plugin(derivedFieldsPlugin);
    const Person = mongoose.model(modelName(), schema);
    const person = await Person.create({ firstName: ' Ada ', lastName: 'Lovelace' });
    expect(get).toHaveBeenCalledTimes(2);
    expect((await Person.findById(person._id))?.fullName).toBe('Ada Lovelace');
  });

  it('observes Mongoose timestamp source changes from its earlier pre-save hook', async () => {
    const get = vi.fn((view: Readonly<Record<string, unknown>>) =>
      view.updatedAt instanceof Date ? view.updatedAt.toISOString() : 'not timestamped yet',
    );
    let now = new Date('2026-10-26T12:00:00Z');
    const schema = new Schema(
      {
        note: String,
        label: { type: String, required: true, derived: { dependsOn: ['updatedAt'], get } },
      },
      { timestamps: { currentTime: () => now } },
    );
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const document = await Model.create({ note: 'original' });
    // Timestamps are assigned after normal validation. That real input change
    // requires a second computation, rather than reusing the validation result.
    expect(get).toHaveBeenCalledTimes(2);
    expect(document.label).toBe(now.toISOString());
    get.mockClear();
    now = new Date('2026-10-26T13:00:00Z');
    document.note = 'changed';
    await document.save();
    expect(get).toHaveBeenCalledTimes(1);
    expect(await Model.collection.findOne({ _id: document._id })).toMatchObject({
      updatedAt: now,
      label: now.toISOString(),
    });
  });

  it('replaces an arbitrary target assigned by a preceding pre-save hook', async () => {
    const get = vi.fn(fullName);
    const schema = new Schema<Person>({
      firstName: String,
      lastName: String,
      fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get } },
    });
    schema.pre('save', function () {
      this.fullName = 'hook override';
    });
    schema.plugin(derivedFieldsPlugin);
    const Person = mongoose.model(modelName(), schema);
    const person = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    get.mockClear();
    await person.save();
    expect(get).toHaveBeenCalledTimes(1);
    expect((await Person.findById(person._id))?.fullName).toBe('Ada Lovelace');
  });

  it('preserves validateModifiedOnly when an earlier save hook requires revalidation', async () => {
    const schema = new Schema({
      source: String,
      unrelatedRequired: { type: String, required: true },
      label: {
        type: String,
        required: true,
        derived: {
          dependsOn: ['source'],
          get: (view: Readonly<Record<string, unknown>>) => view.source,
        },
      },
    });
    schema.pre('save', function () {
      this.source = 'from hook';
    });
    schema.plugin(derivedFieldsPlugin);
    const Model = mongoose.model(modelName(), schema);
    const _id = new Types.ObjectId();
    await Model.collection.insertOne({ _id, source: 'old', label: 'old' });
    const document = await Model.findById(_id).orFail();
    await document.save({ validateModifiedOnly: true });
    expect(await Model.collection.findOne({ _id })).toMatchObject({ source: 'from hook', label: 'from hook' });
    await expect(document.validate()).rejects.toMatchObject({ errors: { unrelatedRequired: { kind: 'required' } } });
  });

  it.each(['pre', 'post'] as const)(
    'rejects unstable %s-validation source mutations after computation before writing',
    async (phase) => {
      const get = vi.fn(fullName);
      const schema = new Schema<Person>({
        firstName: String,
        lastName: String,
        fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get } },
      });
      schema.plugin(derivedFieldsPlugin);
      const mutate = function (this: mongoose.HydratedDocument<Person>) {
        this.firstName += '!';
      };
      if (phase === 'pre') schema.pre('validate', mutate);
      else schema.post('validate', mutate);
      const Person = mongoose.model(modelName(), schema);
      const person = new Person({ firstName: 'Ada', lastName: 'Lovelace' });
      await expect(person.save()).rejects.toThrow('register source-mutating validation hooks before the plugin');
      expect(get).toHaveBeenCalledTimes(2);
      expect(person.firstName).toBe('Ada!!');
      expect(await Person.countDocuments()).toBe(0);
    },
  );

  it('makes the later pre-save hook boundary explicit: source mutators must precede the plugin', async () => {
    const schema = new Schema<Person>({
      firstName: String,
      lastName: String,
      fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get: fullName } },
    });
    schema.plugin(derivedFieldsPlugin);
    schema.pre('save', function () {
      this.firstName = 'Later hook';
    });
    const Person = mongoose.model(modelName(), schema);
    const person = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(await Person.collection.findOne({ _id: person._id })).toMatchObject({
      firstName: 'Later hook',
      fullName: 'Ada Lovelace',
    });
  });
});

describe('derivedFieldsPlugin version key boundaries', () => {
  it.each(['__v', 'revision'])(
    'omits the managed version key %s from shorthand inputs across real saves',
    async (key) => {
      const get = vi.fn((view: Readonly<Record<string, unknown>>) => {
        expect(view).not.toHaveProperty(key);
        return view.source;
      });
      const schema = new Schema<{ source: string; __v?: number; revision?: number; result?: string }>(
        {
          source: String,
          [key]: Number,
          result: { type: String, derived: get },
        },
        { versionKey: key, optimisticConcurrency: true },
      );
      schema.plugin(derivedFieldsPlugin);
      const Model = mongoose.model(modelName(), schema);
      const saved = await Model.create({ source: 'original' });
      expect(await Model.collection.findOne({ _id: saved._id })).toMatchObject({ [key]: 0, result: 'original' });
      const document = await Model.findById(saved._id).select('source').orFail();
      document.source = 'changed';
      await document.save();
      expect(get).toHaveBeenCalledTimes(2);
      expect(await Model.collection.findOne({ _id: saved._id })).toMatchObject({
        source: 'changed',
        result: 'changed',
      });
    },
  );

  it.each(['__v', 'revision'])(
    'supports %s as an ordinary target/dependency when versioning is disabled',
    async (key) => {
      const targetSchema = new Schema<{ source: number; __v?: number; revision?: number }>(
        {
          source: Number,
          [key]: {
            type: Number,
            derived: {
              dependsOn: ['source'],
              get: (view: Readonly<Record<string, unknown>>) => Number(view.source) * 2,
            },
          },
        },
        { versionKey: false },
      );
      targetSchema.plugin(derivedFieldsPlugin);
      const Target = mongoose.model(modelName(), targetSchema);
      const target = await Target.create({ source: 7 });
      expect(await Target.collection.findOne({ _id: target._id })).toMatchObject({ [key]: 14 });
      target.set('source', 8);
      await target.save({ validateBeforeSave: false });
      expect(await Target.collection.findOne({ _id: target._id })).toMatchObject({ [key]: 16 });

      const inputSchema = new Schema<{ __v?: number; revision?: number; result?: string }>(
        {
          [key]: Number,
          result: {
            type: String,
            derived: { dependsOn: [key], get: (view: Readonly<Record<string, unknown>>) => `derived:${view[key]}` },
          },
        },
        { versionKey: false },
      );
      inputSchema.plugin(derivedFieldsPlugin);
      const Input = mongoose.model(modelName(), inputSchema);
      const input = await Input.create({ [key]: 3 });
      expect(await Input.collection.findOne({ _id: input._id })).toMatchObject({ [key]: 3, result: 'derived:3' });
      input.set(key, 4);
      await input.save();
      expect(await Input.collection.findOne({ _id: input._id })).toMatchObject({ [key]: 4, result: 'derived:4' });
    },
  );
});

describe('derivedFieldsPlugin supported operation boundaries', () => {
  it('does not compute for query updates/replacements or raw-driver writes', async () => {
    const { Person, get } = personModel();
    const person = await Person.create({ firstName: 'Ada', lastName: 'Lovelace' });
    get.mockClear();
    await Person.updateOne({ _id: person._id }, { $set: { firstName: 'query update' } });
    expect((await Person.findById(person._id))?.fullName).toBe('Ada Lovelace');
    await Person.findOneAndUpdate({ _id: person._id }, { firstName: 'findOneAndUpdate' }, { runValidators: true });
    expect((await Person.findById(person._id))?.fullName).toBe('Ada Lovelace');
    await Person.replaceOne({ _id: person._id }, { firstName: 'replacement', fullName: 'caller-owned value' });
    expect((await Person.findById(person._id))?.fullName).toBe('caller-owned value');
    await Person.collection.updateOne({ _id: person._id }, { $unset: { fullName: '' } });
    expect((await Person.findById(person._id))?.fullName).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('computes incidentally through insertMany async validation, while its lean fast path bypasses computation', async () => {
    const { Person, get } = personModel();
    const [validated] = await Person.insertMany([{ firstName: 'Ada', lastName: 'Lovelace' }]);
    expect((await Person.findById(validated._id))?.fullName).toBe('Ada Lovelace');
    expect(get).toHaveBeenCalledTimes(1);
    get.mockClear();
    const _id = new Types.ObjectId();
    await Person.insertMany([{ _id, firstName: 'Grace', lastName: 'Hopper' }], { lean: true });
    expect((await Person.findById(_id))?.fullName).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('does not provide bulkWrite consistency: validation can compute inserts, but skipped validation and updates bypass it', async () => {
    const { Person, get } = personModel();
    const validatedId = new Types.ObjectId();
    await Person.bulkWrite([{ insertOne: { document: { _id: validatedId, firstName: 'Ada', lastName: 'Lovelace' } } }]);
    expect((await Person.findById(validatedId))?.fullName).toBe('Ada Lovelace');
    expect(get).toHaveBeenCalledTimes(1);
    get.mockClear();
    const bypassId = new Types.ObjectId();
    await Person.bulkWrite([{ insertOne: { document: { _id: bypassId, firstName: 'Grace', lastName: 'Hopper' } } }], {
      skipValidation: true,
    });
    await Person.bulkWrite([
      { updateOne: { filter: { _id: validatedId }, update: { $set: { firstName: 'bulk update' } } } },
    ]);
    expect((await Person.findById(bypassId))?.fullName).toBeUndefined();
    expect((await Person.findById(validatedId))?.fullName).toBe('Ada Lovelace');
    expect(get).not.toHaveBeenCalled();
  });

  it('does not run asynchronous derivation for validateSync()', async () => {
    const { Person, get } = personModel({ required: true });
    const person = new Person({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(person.validateSync()?.errors.fullName).toMatchObject({ kind: 'required' });
    expect(person.fullName).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    await person.validate();
    expect(person.fullName).toBe('Ada Lovelace');
    expect(get).toHaveBeenCalledTimes(1);
    expect(await Person.countDocuments()).toBe(0);
  });
});
