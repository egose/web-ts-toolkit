import { Mongoose, Schema, Types, type ProjectionType } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { DerivedFieldsDependencyError } from '../src/plugins/derived-fields';
import { planDerivedFields } from '../src/plugins/derived-fields/planner';
import { registerDerivedFields } from '../src/plugins/derived-fields/registration';

type User = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string;
  note?: string;
};

const fixture = (options: { lastNameDefault?: string; hiddenLastName?: boolean } = {}) => {
  const mongoose = new Mongoose();
  const get = vi.fn(() => 'computed');
  const schema = new Schema<User>({
    firstName: String,
    lastName: { type: String, default: options.lastNameDefault, select: options.hiddenLastName ? false : undefined },
    fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get } },
    note: String,
  });
  const registration = registerDerivedFields(schema);
  const User = mongoose.model('DerivedFieldsPlannerUser', schema);
  return { User, registration, get };
};

const plannedTargets = (plan: ReturnType<typeof planDerivedFields>) => plan.fields.map((field) => field.targetPath);

describe('derived fields dependency planner with Mongoose documents', () => {
  it('plans new documents using supplied/defaulted values even when selection metadata omits them', () => {
    const { User, registration, get } = fixture({ lastNameDefault: 'default last name', hiddenLastName: true });
    const document = new User({ firstName: 'Ada' });
    expect(document.isNew).toBe(true);
    expect(document.lastName).toBe('default last name');
    const plan = planDerivedFields(registration, document);
    expect(plannedTargets(plan)).toEqual(['fullName']);
    expect(plan.availablePaths).toEqual(registration.inputPaths);
    expect(get).not.toHaveBeenCalled();

    const withProjection = new User({ firstName: 'Ada' }, { firstName: 1 });
    expect(withProjection.isDirectSelected('lastName')).toBe(false);
    expect(plannedTargets(planDerivedFields(registration, withProjection))).toEqual(['fullName']);
  });

  it.each([undefined, { fullName: 1 }, { _id: 1 }, { firstName: 0, lastName: 0 }])(
    'skips unchanged existing dependencies with projection %j, even if neither dependency is selected',
    (projection) => {
      const { User, registration, get } = fixture();
      const document = User.hydrate({ _id: new Types.ObjectId(), fullName: 'persisted' }, projection);
      expect(document.isNew).toBe(false);
      document.note = 'unrelated change';
      expect(plannedTargets(planDerivedFields(registration, document))).toEqual([]);
      expect(get).not.toHaveBeenCalled();
      if (document.isDirectSelected('fullName')) expect(document.fullName).toBe('persisted');
    },
  );

  it.each([
    { firstName: 1, lastName: 1 },
    { firstName: true, lastName: true, _id: false },
    { note: 0 },
    { _id: 0 },
    { _id: false },
    undefined,
  ])('recomputes when a dependency changes and all dependencies are selected (%j)', (projection) => {
    const { User, registration } = fixture();
    const document = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace', fullName: 'persisted' }, projection);
    document.firstName = 'Grace';
    expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['fullName']);
  });

  it('preflights missing dependencies without invoking getters or changing the document', () => {
    const { User, registration, get } = fixture();
    const document = User.hydrate({ firstName: 'Ada', fullName: 'persisted' }, { firstName: 1, fullName: 1 });
    document.firstName = 'private source value';
    let thrown: unknown;
    try {
      planDerivedFields(registration, document);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DerivedFieldsDependencyError);
    const error = thrown as DerivedFieldsDependencyError;
    expect(error.issues).toEqual([{ targetPath: 'fullName', missingPaths: ['lastName'] }]);
    expect(error.message).not.toContain('private source value');
    expect(error).not.toHaveProperty('document');
    expect(get).not.toHaveBeenCalled();
    expect(document.firstName).toBe('private source value');
    expect(document.fullName).toBe('persisted');
    expect(document.directModifiedPaths()).toEqual(['firstName']);
  });

  it.each(['Lovelace', undefined, null])(
    'accepts a full replacement of an excluded dependency with %j',
    (replacement) => {
      const { User, registration } = fixture();
      const document = User.hydrate({ firstName: 'Ada' }, { firstName: 1 });
      document.firstName = 'Grace';
      document.lastName = replacement;
      expect(document.isDirectSelected('lastName')).toBe(false);
      expect(document.isDirectModified('lastName')).toBe(true);
      const plan = planDerivedFields(registration, document);
      expect(plannedTargets(plan)).toEqual(['fullName']);
      expect(plan.availablePaths).toContain('lastName');
      expect(plan.replacedPaths).toEqual(['firstName', 'lastName']);
    },
  );

  it.each([undefined, null])('treats selected genuinely absent/null dependency %j as available', (lastName) => {
    const { User, registration } = fixture();
    const raw = lastName === undefined ? { firstName: 'Ada' } : { firstName: 'Ada', lastName };
    const document = User.hydrate(raw, { firstName: 1, lastName: 1 });
    document.firstName = 'Grace';
    expect(document.lastName).toBe(lastName);
    expect(document.isDirectSelected('lastName')).toBe(true);
    expect(document.isInit('lastName')).toBe(lastName !== undefined);
    expect(planDerivedFields(registration, document).availablePaths).toContain('lastName');
  });

  it('does not accept defaults manufactured for a projected-out dependency', () => {
    const { User, registration } = fixture({ lastNameDefault: 'manufactured default' });
    const document = User.hydrate({ firstName: 'Ada' }, { firstName: 1 });
    expect(document.lastName).toBeUndefined();
    User.applyDefaults(document);
    expect(document.lastName).toBe('manufactured default');
    expect(document.$isDefault('lastName')).toBe(true);
    expect(document.isDirectModified('lastName')).toBe(false);
    document.firstName = 'Grace';
    expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);

    // A real assignment of that very same value is a full replacement.
    document.lastName = 'manufactured default';
    expect(document.isDirectModified('lastName')).toBe(true);
    expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['fullName']);
  });

  it('honors actual schema-hidden query projection metadata and explicit re-selection', () => {
    const { User, registration } = fixture({ hiddenLastName: true });
    const document = User.hydrate({ firstName: 'Ada' }, { lastName: 0 });
    document.firstName = 'Grace';
    expect(document.isDirectSelected('lastName')).toBe(false);
    expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);

    const selected = User.hydrate({ firstName: 'Ada', lastName: null }, { firstName: 1, lastName: 1 });
    selected.firstName = 'Grace';
    expect(plannedTargets(planDerivedFields(registration, selected))).toEqual(['fullName']);
  });

  it.each([undefined, { firstName: 1, lastName: 1 }, { fullName: 0 }])(
    'does not repair missing/projected-out targets just because they are absent (%j)',
    (projection) => {
      const { User, registration } = fixture();
      const document = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace' }, projection);
      expect(document.fullName).toBeUndefined();
      expect(plannedTargets(planDerivedFields(registration, document))).toEqual([]);
    },
  );

  it('recomputes an explicitly modified target with complete dependencies', () => {
    const { User, registration } = fixture();
    const document = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace' }, { firstName: 1, lastName: 1 });
    document.fullName = 'arbitrary override';
    expect(document.isDirectModified('fullName')).toBe(true);
    expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['fullName']);
    // Planning does not apply or accept that value; DF-02 must run the getter.
    expect(document.fullName).toBe('arbitrary override');
  });

  it('rejects target overrides when unchanged dependencies were projected out', () => {
    const { User, registration } = fixture();
    const document = User.hydrate({ fullName: 'persisted' }, { fullName: 1 });
    document.fullName = 'arbitrary override';
    expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);
    try {
      planDerivedFields(registration, document);
    } catch (error) {
      expect((error as DerivedFieldsDependencyError).issues).toEqual([
        { targetPath: 'fullName', missingPaths: ['firstName', 'lastName'] },
      ]);
    }
  });

  it('does not confuse an excluded scalar child modification with a whole replacement', () => {
    const { User, registration } = fixture();
    const document = User.hydrate({ firstName: 'Ada' }, { firstName: 1 });
    document.firstName = 'Grace';
    document.markModified('lastName.child');
    expect(document.isModified('lastName')).toBe(true);
    expect(document.isDirectModified('lastName')).toBe(false);
    expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);
  });

  it.each([{ 'lastName.child': 1, firstName: 1 }, { 'lastName.child': 0 }, { lastName: { $slice: 1 } }])(
    'does not silently accept partial/operator projections as full input (%j)',
    (projection) => {
      const { User, registration } = fixture();
      // Deliberately unsupported scalar/operator projections must fail safely.
      const document = User.hydrate({ firstName: 'Ada' }, projection as unknown as ProjectionType<User>);
      document.firstName = 'Grace';
      expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);
      document.lastName = 'explicit replacement';
      expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['fullName']);
    },
  );

  it('does not treat an excluded numeric $inc as a full replacement', () => {
    const mongoose = new Mongoose();
    const schema = new Schema({
      count: Number,
      doubled: { type: Number, derived: { dependsOn: ['count'], get: vi.fn(() => 2) } },
    });
    const registration = registerDerivedFields(schema);
    const Counter = mongoose.model('DerivedPlannerCounter', schema);
    const document = Counter.hydrate({ _id: new Types.ObjectId() }, { _id: 1 });
    document.$inc('count', 1);
    expect(document.count).toBe(1);
    expect(document.isDirectModified('count')).toBe(true);
    expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);
    document.count = 10;
    expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['doubled']);

    const selected = Counter.hydrate({ count: 4 });
    selected.$inc('count', 1);
    expect(plannedTargets(planDerivedFields(registration, selected))).toEqual(['doubled']);
  });

  it('supports lifecycle-retained replacement availability after dirty flags are cleared', () => {
    const { User, registration } = fixture();
    const document = User.hydrate({ firstName: 'Ada' }, { firstName: 1 });
    document.lastName = 'Lovelace';
    const first = planDerivedFields(registration, document);
    // Save resets this flag; emulate that state without a database or hooks.
    document.unmarkModified('lastName');
    document.firstName = 'Grace';
    expect(() => planDerivedFields(registration, document)).toThrow(DerivedFieldsDependencyError);
    const repeat = planDerivedFields(registration, document, { knownReplacedPaths: new Set(first.replacedPaths) });
    expect(plannedTargets(repeat)).toEqual(['fullName']);
    expect(repeat.availablePaths).toContain('lastName');
    expect(repeat.replacedPaths).toContain('lastName');
  });

  it('schedules pending writes without treating them as full replacements or repairing mere absence', () => {
    const { User, registration, get } = fixture({ lastNameDefault: 'default' });
    const selected = User.hydrate({ _id: new Types.ObjectId(), firstName: 'Ada' });
    expect(selected.isModified('lastName')).toBe(false);
    const sourceWrite = planDerivedFields(registration, selected, { pendingWritePaths: new Set(['lastName']) });
    expect(plannedTargets(sourceWrite)).toEqual(['fullName']);
    expect(sourceWrite.availablePaths).toContain('lastName');
    expect(sourceWrite.replacedPaths).toEqual([]);
    const targetWrite = planDerivedFields(registration, selected, { pendingWritePaths: new Set(['fullName']) });
    expect(plannedTargets(targetWrite)).toEqual(['fullName']);
    expect(plannedTargets(planDerivedFields(registration, selected))).toEqual([]);

    const excluded = User.hydrate({ _id: new Types.ObjectId(), firstName: 'Ada' }, { firstName: 1 });
    User.applyDefaults(excluded);
    expect(plannedTargets(planDerivedFields(registration, excluded))).toEqual([]);
    for (const path of ['lastName', 'fullName']) {
      expect(() => planDerivedFields(registration, excluded, { pendingWritePaths: new Set([path]) })).toThrow(
        DerivedFieldsDependencyError,
      );
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('aggregates all scheduled missing dependencies before any getter can run', () => {
    const mongoose = new Mongoose();
    const ready = vi.fn(() => 'ready');
    const missing = vi.fn(() => 'missing');
    const schema = new Schema({
      firstName: String,
      lastName: String,
      otherInput: String,
      ready: { type: String, derived: { dependsOn: ['firstName'], get: ready } },
      fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get: missing } },
      label: { type: String, derived: { dependsOn: ['firstName', 'otherInput'], get: missing } },
    });
    const registration = registerDerivedFields(schema);
    const Model = mongoose.model('DerivedPlannerPreflight', schema);
    const document = Model.hydrate({ firstName: 'Ada' }, { firstName: 1 });
    document.firstName = 'Grace';
    expect.assertions(3);
    try {
      planDerivedFields(registration, document);
    } catch (error) {
      expect((error as DerivedFieldsDependencyError).issues).toEqual([
        { targetPath: 'fullName', missingPaths: ['lastName'] },
        { targetPath: 'label', missingPaths: ['otherInput'] },
      ]);
    }
    expect(ready).not.toHaveBeenCalled();
    expect(missing).not.toHaveBeenCalled();
  });

  it('repeats side-effect-free planning without running getters or clearing modifications', () => {
    const { User, registration, get } = fixture();
    const document = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace' });
    document.firstName = 'Grace';
    const first = planDerivedFields(registration, document);
    const second = planDerivedFields(registration, document);
    expect(second).toEqual(first);
    expect(document.directModifiedPaths()).toEqual(['firstName']);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('derived fields shorthand planning', () => {
  const shorthandFixture = () => {
    const mongoose = new Mongoose();
    const get = vi.fn(() => 'computed');
    const schema = new Schema({
      firstName: String,
      hidden: { type: String, select: false },
      tags: [String],
      mixed: Schema.Types.Mixed,
      profile: { name: String },
      explicit: { type: String, derived: { dependsOn: ['firstName'], get } },
      label: { type: String, derived: get },
    });
    const registration = registerDerivedFields(schema);
    const Model = mongoose.model('DerivedPlannerShorthand', schema);
    return { Model, registration, get };
  };

  it('schedules the bare function on every plan even when nothing changed', () => {
    const { Model, registration, get } = shorthandFixture();
    const document = Model.hydrate({ firstName: 'Ada' });
    expect(document.isModified()).toBe(false);
    expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['label']);
    expect(plannedTargets(planDerivedFields(registration, document))).toEqual(['label']);
    expect(get).not.toHaveBeenCalled();
    expect(registration.inputPaths).toEqual(['firstName', 'hidden', '_id']);
  });

  it('requires all supported non-derived inputs, including hidden paths and _id', () => {
    const { Model, registration } = shorthandFixture();
    const document = Model.hydrate({ firstName: 'Ada' }, { firstName: 1, _id: 0 });
    expect.assertions(1);
    try {
      planDerivedFields(registration, document);
    } catch (error) {
      expect((error as DerivedFieldsDependencyError).issues).toEqual([
        { targetPath: 'label', missingPaths: ['hidden', '_id'] },
      ]);
    }
  });

  it('does not trust Mongoose boolean _id exclusion metadata as availability', () => {
    const { Model, registration } = shorthandFixture();
    const document = Model.hydrate(
      { _id: new Types.ObjectId(), firstName: 'Ada' },
      { firstName: true, hidden: true, _id: false },
    );
    // Mongoose 9 treats this as selected despite the explicit false projection.
    expect(document.isDirectSelected('_id')).toBe(true);
    expect.assertions(2);
    try {
      planDerivedFields(registration, document);
    } catch (error) {
      expect((error as DerivedFieldsDependencyError).issues).toEqual([{ targetPath: 'label', missingPaths: ['_id'] }]);
    }
  });

  it('accepts selected absent inputs and full replacements without requiring derived targets or containers', () => {
    const { Model, registration } = shorthandFixture();
    const document = Model.hydrate({ _id: new Types.ObjectId(), firstName: 'Ada' }, { firstName: 1 });
    document.hidden = undefined;
    const plan = planDerivedFields(registration, document);
    expect(plannedTargets(plan)).toEqual(['label']);
    expect(plan.availablePaths).toEqual(['firstName', 'hidden', '_id']);
  });
});
