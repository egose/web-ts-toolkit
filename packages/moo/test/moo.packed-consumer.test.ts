import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanupPackedConsumerTempRoots,
  containsDisallowedPublishedValue,
  installPackedConsumer,
  mooSubpaths,
  packageRoot,
  preparePackedWorkspace,
  rootPackageJson,
  run,
  testVersion,
  type PackageJson,
} from './support/packed-consumer-harness';

const CORE_RUNTIME_EXPORTS: Array<{ subpath: string; names: string[] }> = [
  {
    subpath: '@web-ts-toolkit/moo',
    names: [
      'isObjectId',
      'uniqueNullableString',
      'cascadeDeletePlugin',
      'derivedFieldsPlugin',
      'defineDerivedField',
      'DerivedFieldsDependencyError',
    ],
  },
  { subpath: '@web-ts-toolkit/moo/is', names: ['isObjectId'] },
  { subpath: '@web-ts-toolkit/moo/schema', names: ['uniqueNullableString', 'uniqueEmptiableString'] },
  { subpath: '@web-ts-toolkit/moo/utils', names: ['isSchema', 'isObjectIdType', 'isReference'] },
  {
    subpath: '@web-ts-toolkit/moo/plugins',
    names: [
      'modelFunctionPlugin',
      'cascadeDeletePlugin',
      'derivedFieldsPlugin',
      'defineDerivedField',
      'DerivedFieldsDependencyError',
      'newDocumentPlugin',
    ],
  },
  { subpath: '@web-ts-toolkit/moo/plugins/cascade-delete', names: ['cascadeDeletePlugin'] },
  {
    subpath: '@web-ts-toolkit/moo/plugins/derived-fields',
    names: ['derivedFieldsPlugin', 'defineDerivedField', 'DerivedFieldsDependencyError'],
  },
  { subpath: '@web-ts-toolkit/moo/plugins/model-function', names: ['modelFunctionPlugin'] },
  { subpath: '@web-ts-toolkit/moo/plugins/new-document', names: ['newDocumentPlugin'] },
];

function esmImportLines(): string {
  return `import * as rootEntry from '@web-ts-toolkit/moo';
import * as isEntry from '@web-ts-toolkit/moo/is';
import * as schemaEntry from '@web-ts-toolkit/moo/schema';
import * as utilsEntry from '@web-ts-toolkit/moo/utils';
import * as pluginsEntry from '@web-ts-toolkit/moo/plugins';
import * as cascadeEntry from '@web-ts-toolkit/moo/plugins/cascade-delete';
import * as derivedEntry from '@web-ts-toolkit/moo/plugins/derived-fields';
import * as modelFunctionEntry from '@web-ts-toolkit/moo/plugins/model-function';
import * as newDocumentEntry from '@web-ts-toolkit/moo/plugins/new-document';`;
}

function sanitize(subpath: string): string {
  if (subpath === '@web-ts-toolkit/moo') return 'root';
  return subpath
    .replace('@web-ts-toolkit/moo', '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function writeConsumerFiles(consumerDir: string, includeKeycloak: boolean): void {
  const keycloakEsm = `import { createManagedKeycloakClient, keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';`;
  const keycloakCjs = `const { createManagedKeycloakClient: createManagedKeycloakClientCjs, keycloakUserSyncPlugin: keycloakUserSyncPluginCjs } = require('@web-ts-toolkit/moo/plugins/keycloak-user-sync');`;

  writeFileSync(
    path.resolve(consumerDir, 'core-runtime.mjs'),
    `${esmImportLines()}
import assert from 'node:assert/strict';
import mongoose, { Schema } from 'mongoose';
${includeKeycloak ? keycloakEsm : ''}

if (typeof rootEntry.isObjectId !== 'function') throw new Error('missing root isObjectId');
if (typeof isEntry.isObjectId !== 'function') throw new Error('missing is/isObjectId');
if (typeof rootEntry.uniqueNullableString !== 'function') throw new Error('missing uniqueNullableString');
if (typeof schemaEntry.uniqueNullableString !== 'function') throw new Error('missing schema/uniqueNullableString');
if (typeof schemaEntry.uniqueEmptiableString !== 'function') throw new Error('missing uniqueEmptiableString');
if (typeof utilsEntry.isSchema !== 'function') throw new Error('missing isSchema');
if (typeof utilsEntry.isObjectIdType !== 'function') throw new Error('missing isObjectIdType');
if (typeof utilsEntry.isReference !== 'function') throw new Error('missing isReference');
if (typeof pluginsEntry.modelFunctionPlugin !== 'function') throw new Error('missing plugins/modelFunctionPlugin');
if (typeof modelFunctionEntry.modelFunctionPlugin !== 'function') throw new Error('missing modelFunctionPlugin');
if (typeof pluginsEntry.cascadeDeletePlugin !== 'function') throw new Error('missing plugins/cascadeDeletePlugin');
if (typeof cascadeEntry.cascadeDeletePlugin !== 'function') throw new Error('missing cascadeDeletePlugin');
if (typeof pluginsEntry.newDocumentPlugin !== 'function') throw new Error('missing plugins/newDocumentPlugin');
if (typeof newDocumentEntry.newDocumentPlugin !== 'function') throw new Error('missing newDocumentPlugin');
if (!rootEntry.isObjectId('507f1f77bcf86cd799439011')) throw new Error('isObjectId rejected a canonical id');
if (isEntry.isObjectId('not-an-id')) throw new Error('isObjectId accepted garbage');

// Exercise the shipped plugins against both supported Mongoose majors without a database.
const ownerSchema = new Schema({ name: String });
ownerSchema.plugin(newDocumentEntry.newDocumentPlugin, { fn: async () => {} });
ownerSchema.plugin(modelFunctionEntry.modelFunctionPlugin, { fnName: 'greet', fn: (doc) => String(doc.get('name')) });
ownerSchema.plugin(cascadeEntry.cascadeDeletePlugin, { model: 'MooPackedChild', localField: '_id', foreignField: 'ownerId' });
const childSchema = new Schema({ ownerId: Schema.Types.ObjectId });
mongoose.model('MooPackedChild', childSchema);
mongoose.model('MooPackedOwner', ownerSchema);
${derivedRuntimeChecks()}
await checkDerivedFields([rootEntry, pluginsEntry, derivedEntry]);
${includeKeycloak ? keycloakRuntimeEsm() : ''}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'core-runtime.cjs'),
    `${CORE_RUNTIME_EXPORTS.map(({ subpath }) => `const ns_${sanitize(subpath)} = require('${subpath}');`).join('\n')}
const mongoose = require('mongoose');
const assert = require('node:assert/strict');
${includeKeycloak ? keycloakCjs : ''}
for (const [label, mod, name] of [
${CORE_RUNTIME_EXPORTS.map(({ subpath, names }) => names.map((name) => `  ['${subpath}#${name}', ns_${sanitize(subpath)}, '${name}'],`).join('\n')).join('\n')}
]) {
  if (typeof mod[name] !== 'function') throw new Error('missing ' + label);
}
const { isObjectId, cascadeDeletePlugin, newDocumentPlugin, modelFunctionPlugin } = ns_root;
if (!isObjectId('507f1f77bcf86cd799439011')) throw new Error('isObjectId rejected a canonical id');
const ownerSchema = new mongoose.Schema({ name: String });
ownerSchema.plugin(newDocumentPlugin, { fn: async () => {} });
ownerSchema.plugin(modelFunctionPlugin, { fnName: 'greet', fn: (doc) => String(doc.get('name')) });
ownerSchema.plugin(cascadeDeletePlugin, { model: 'MooPackedChildCjs', localField: '_id', foreignField: 'ownerId' });
mongoose.model('MooPackedChildCjs', new mongoose.Schema({ ownerId: mongoose.Schema.Types.ObjectId }));
mongoose.model('MooPackedOwnerCjs', ownerSchema);
${derivedRuntimeChecks()}
checkDerivedFields([ns_root, ns_plugins, ns_plugins_derived_fields]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
${includeKeycloak ? keycloakRuntimeCjs() : ''}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'keycloak-absent.cjs'),
    `let threw = null;
try {
  require('@web-ts-toolkit/moo/plugins/keycloak-user-sync');
} catch (error) {
  threw = error;
}
if (!threw) throw new Error('expected the Keycloak subpath to require the optional peer');
if (threw.code !== 'MODULE_NOT_FOUND') throw new Error('expected MODULE_NOT_FOUND, got ' + (threw.code || threw.message));
if (!String(threw.message).includes('@egose/keycloak-fluent')) throw new Error('expected the missing optional peer in: ' + threw.message);
`,
  );
  writeFileSync(path.resolve(consumerDir, 'consumer-core.nodenext.mts'), coreTypesEsm());
  writeFileSync(path.resolve(consumerDir, 'consumer-core.nodenext.cts'), coreTypesCjs());
  if (includeKeycloak) {
    writeFileSync(path.resolve(consumerDir, 'consumer-full.nodenext.mts'), fullTypesEsm());
    writeFileSync(path.resolve(consumerDir, 'consumer-full.nodenext.cts'), fullTypesCjs());
    // NOTE (MOO-09): the full consumer uses skipLibCheck:true because
    // @egose/keycloak-fluent's declarations reference extensionless
    // `@keycloak/keycloak-admin-client/lib/*` deep type imports, which
    // NodeNext ESM type-resolution cannot probe (upstream packaging quirk;
    // runtime imports work, as core-runtime.* proves). Module resolution and
    // named-import bindings for moo's own entries are still strictly checked:
    // a removed exports target fails with TS2307 and a removed moo export
    // fails with TS2305 at the (checked) consumer file.
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-full-nodenext.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            skipLibCheck: true,
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            types: ['node'],
          },
          include: ['consumer-full.nodenext.mts', 'consumer-full.nodenext.cts'],
        },
        null,
        2,
      )}\n`,
    );
  }
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-core-nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          types: ['node'],
        },
        include: ['consumer-core.nodenext.mts', 'consumer-core.nodenext.cts'],
      },
      null,
      2,
    )}\n`,
  );
}

/** Run only installed, public APIs against the consumer's own Mongoose metadata. */
function derivedRuntimeChecks(): string {
  return `
async function checkDerivedFields(entries) {
  const { Schema, Types } = mongoose;
  // BSON's ESM and CJS entries provide distinct, valid ObjectId constructors.
  // Mongoose accepts either without copying it during casting.
  const { createRequire } = await import('node:module');
  const { dirname, join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const consumerRequire = createRequire(join(process.cwd(), 'package.json'));
  const mongooseRequire = createRequire(consumerRequire.resolve('mongoose'));
  const foreignBson = await import(pathToFileURL(join(dirname(mongooseRequire.resolve('bson')), 'bson.mjs')).href);
  assert.notEqual(foreignBson.ObjectId, Types.ObjectId);
  for (const [entryIndex, api] of entries.entries()) {
    for (const name of ['derivedFieldsPlugin', 'defineDerivedField', 'DerivedFieldsDependencyError']) {
      assert.equal(typeof api[name], 'function', name);
    }
    let calls = 0;
    const views = [];
    const schema = new Schema({
      firstName: { type: String, get: () => 'not a persisted input' },
      lastName: String,
      note: String,
      fullName: {
        type: String,
        required: true,
        derived: api.defineDerivedField({
          dependsOn: ['firstName', 'lastName'],
          get: async (view) => {
            calls += 1;
            views.push(view);
            await Promise.resolve();
            return [view.firstName, view.lastName].filter((part) => part != null).join(' ');
          },
        }),
      },
    });
    schema.plugin(api.derivedFieldsPlugin);
    // The registration marker must also work across separately bundled entries.
    assert.throws(() => schema.plugin(entries[(entryIndex + 1) % entries.length].derivedFieldsPlugin), /already registered/);
    const User = mongoose.model('PackedDerivedUser' + entryIndex, schema);
    const fresh = new User({ firstName: 'Ada', lastName: 'Lovelace' });
    await fresh.validate();
    assert.equal(fresh.fullName, 'Ada Lovelace'); // required validation sees the result
    assert.equal(calls, 1);
    assert.ok(Object.isFrozen(views[0]));
    assert.equal(views[0].firstName, 'Ada'); // bypass property getters
    assert.equal(views[0].save, undefined);
    assert.equal(Object.hasOwn(views[0], 'fullName'), false);

    const unchanged = User.hydrate({ fullName: 'persisted' }, { fullName: 1 });
    unchanged.note = 'unrelated';
    await unchanged.validate();
    assert.equal(unchanged.fullName, 'persisted');
    assert.equal(calls, 1); // all sources can be omitted when unchanged
    const omittedTarget = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace' }, { firstName: 1, lastName: 1 });
    await omittedTarget.validate();
    assert.equal(omittedTarget.fullName, undefined);
    assert.equal(calls, 1); // an omitted target is not a repair request

    const partial = User.hydrate({ firstName: 'Ada', fullName: 'persisted' }, { firstName: 1, fullName: 1 });
    partial.firstName = 'Grace';
    await assert.rejects(partial.validate(), (error) => {
      assert.ok(error instanceof api.DerivedFieldsDependencyError);
      assert.equal(error.code, 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES');
      assert.deepEqual(error.issues, [{ targetPath: 'fullName', missingPaths: ['lastName'] }]);
      assert.ok(Object.isFrozen(error.issues[0].missingPaths));
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(partial.fullName, 'persisted');
    assert.equal(partial.get('firstName', null, { getters: false }), 'Grace');

    // Selected genuine absence/null is available, unlike an unselected path.
    for (const lastName of [undefined, null]) {
      const selected = User.hydrate({ firstName: 'Ada', ...(lastName === null ? { lastName } : {}) }, { firstName: 1, lastName: 1 });
      selected.firstName = 'Grace';
      await selected.validate();
      assert.equal(selected.fullName, 'Grace');
      assert.equal(Object.hasOwn(views.at(-1), 'lastName'), true);
      assert.equal(views.at(-1).lastName, lastName);
    }
    for (const lastName of ['Hopper', undefined, null]) {
      const replaced = User.hydrate({ firstName: 'Ada' }, { firstName: 1 });
      replaced.firstName = 'Grace';
      replaced.lastName = lastName;
      await replaced.validate();
      assert.equal(replaced.fullName, lastName ? 'Grace Hopper' : 'Grace');
      // Model a successful-save dirty reset, using public modification APIs.
      replaced.unmarkModified('lastName');
      replaced.unmarkModified('fullName');
      replaced.firstName = 'Admiral';
      await replaced.validate();
      assert.equal(replaced.fullName, lastName ? 'Admiral Hopper' : 'Admiral');
    }
    const override = User.hydrate({ fullName: 'persisted' }, { fullName: 1 });
    override.fullName = 'caller override';
    await assert.rejects(override.validate(), (error) => {
      assert.deepEqual(error.issues, [{ targetPath: 'fullName', missingPaths: ['firstName', 'lastName'] }]);
      return true;
    });
    const completeOverride = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace' });
    completeOverride.fullName = 'caller override';
    await completeOverride.validate();
    assert.equal(completeOverride.fullName, 'Ada Lovelace');

    for (const projection of [{ lastName: 0 }, { 'lastName.child': 1, firstName: 1 }, { 'lastName.child': 0 }, { lastName: { $slice: 1 } }]) {
      const projected = User.hydrate({ firstName: 'Ada' }, projection);
      projected.firstName = 'Grace';
      await assert.rejects(projected.validate(), { code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' });
      projected.lastName = 'Hopper';
      await projected.validate();
      assert.equal(projected.fullName, 'Grace Hopper');
    }
    const booleanIdExclusion = User.hydrate({ firstName: 'Ada', lastName: 'Lovelace' }, { _id: false });
    booleanIdExclusion.firstName = 'Grace';
    await booleanIdExclusion.validate();
    assert.equal(booleanIdExclusion.fullName, 'Grace Lovelace');

    const defaultSchema = new Schema({
      firstName: String,
      lastName: { type: String, default: 'manufactured', select: false },
      fullName: { type: String, derived: { dependsOn: ['firstName', 'lastName'], get: (view) => view.firstName + ' ' + view.lastName } },
    });
    defaultSchema.plugin(api.derivedFieldsPlugin);
    const Defaults = mongoose.model('PackedDerivedDefaults' + entryIndex, defaultSchema);
    const withDefault = Defaults.hydrate({ firstName: 'Ada' }, { firstName: 1 });
    Defaults.applyDefaults(withDefault);
    assert.equal(withDefault.lastName, 'manufactured');
    // An actual default write requests preflight even without an explicit source change.
    await assert.rejects(withDefault.validate(), { code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' });
    withDefault.firstName = 'Grace';
    await assert.rejects(withDefault.validate(), { code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' });
    withDefault.lastName = 'manufactured'; // same-default explicit assignment is a replacement
    await withDefault.validate();
    assert.equal(withDefault.fullName, 'Grace manufactured');

    for (const value of ['new-default', '', 0, false, null, undefined]) {
      let defaultCalls = 0;
      const pendingSchema = new Schema({
        source: { type: typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String, default: value },
        note: String,
        result: { type: String, derived: { dependsOn: ['source'], get: (view) => {
          defaultCalls += 1;
          return 'derived:' + view.source;
        } } },
      });
      pendingSchema.plugin(api.derivedFieldsPlugin);
      const Pending = mongoose.model('PackedPendingDefault' + entryIndex + '_' + mongoose.modelNames().length, pendingSchema);
      const pending = Pending.hydrate({ _id: new Types.ObjectId(), result: 'preserved' });
      pending.note = 'unrelated';
      assert.equal(pending.isModified('source'), false);
      await pending.validate();
      assert.equal(pending.result, value == null ? 'preserved' : 'derived:' + value);
      assert.equal(defaultCalls, value == null ? 0 : 1);
    }
    const targetDefaultSchema = new Schema({
      source: String,
      result: { type: String, default: 'fallback', derived: { dependsOn: ['source'], get: (view) => 'derived:' + view.source } },
    });
    targetDefaultSchema.plugin(api.derivedFieldsPlugin);
    const TargetDefault = mongoose.model('PackedTargetDefault' + entryIndex, targetDefaultSchema);
    const targetDefault = TargetDefault.hydrate({ _id: new Types.ObjectId(), source: 'original' });
    await targetDefault.validate();
    assert.equal(targetDefault.result, 'derived:original');
    const missingForDefault = TargetDefault.hydrate({ _id: new Types.ObjectId() }, { result: 1 });
    await assert.rejects(missingForDefault.validate(), { code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' });

    for (const key of ['__v', 'revision']) {
      const versionTarget = new Schema({ [key]: { type: Number, derived: () => 14 } }, { versionKey: key });
      assert.throws(() => versionTarget.plugin(api.derivedFieldsPlugin), /Mongoose-managed version key/);
      const versionInput = new Schema({
        [key]: Number,
        result: { type: String, derived: { dependsOn: [key], get: () => 'value' } },
      }, { versionKey: key });
      assert.throws(() => versionInput.plugin(api.derivedFieldsPlugin), /Mongoose-managed version key/);
      const versionShorthand = new Schema({
        source: String, [key]: Number,
        result: { type: String, derived: (view) => {
          assert.equal(Object.hasOwn(view, key), false);
          return view.source;
        } },
      }, { versionKey: key });
      versionShorthand.plugin(api.derivedFieldsPlugin);
      const VersionShorthand = mongoose.model('PackedVersionShorthand' + entryIndex + key, versionShorthand);
      const noVersionInput = VersionShorthand.hydrate({ _id: new Types.ObjectId(), source: 'ordinary' }, { source: 1 });
      await noVersionInput.validate();
      assert.equal(noVersionInput.result, 'ordinary');

      const disabledSchema = new Schema({
        [key]: Number,
        result: { type: String, derived: { dependsOn: [key], get: (view) => 'derived:' + view[key] } },
      }, { versionKey: false });
      disabledSchema.plugin(api.derivedFieldsPlugin);
      const Disabled = mongoose.model('PackedVersionDisabled' + entryIndex + key, disabledSchema);
      const ordinaryVersionField = new Disabled({ [key]: 3 });
      await ordinaryVersionField.validate();
      assert.equal(ordinaryVersionField.result, 'derived:3');
    }

    const counterSchema = new Schema({
      count: Number,
      doubled: { type: Number, derived: { dependsOn: ['count'], get: (view) => view.count == null ? undefined : view.count * 2 } },
    });
    counterSchema.plugin(api.derivedFieldsPlugin);
    const Counter = mongoose.model('PackedDerivedCounter' + entryIndex, counterSchema);
    const relative = Counter.hydrate({ _id: new Types.ObjectId() }, { _id: 1 });
    relative.$inc('count', 1);
    await assert.rejects(relative.validate(), { code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' });
    relative.count = 10;
    await relative.validate();
    assert.equal(relative.doubled, 20);
    relative.count = undefined;
    await relative.validate();
    assert.equal(relative.doubled, undefined); // undefined clears a target

    const shorthandSchema = new Schema({
      firstName: String,
      hidden: { type: String, select: false },
      label: { type: String, derived: api.defineDerivedField((view) => view.firstName) },
    });
    shorthandSchema.plugin(api.derivedFieldsPlugin);
    const Shorthand = mongoose.model('PackedDerivedShorthand' + entryIndex, shorthandSchema);
    const omitted = Shorthand.hydrate({ firstName: 'Ada' }, { firstName: 1, _id: 0 });
    await assert.rejects(omitted.validate(), (error) => {
      assert.deepEqual(error.issues, [{ targetPath: 'label', missingPaths: ['hidden', '_id'] }]);
      return true;
    });
    const booleanOmitted = Shorthand.hydrate({ firstName: 'Ada' }, { firstName: true, hidden: true, _id: false });
    await assert.rejects(booleanOmitted.validate(), (error) => {
      assert.deepEqual(error.issues, [{ targetPath: 'label', missingPaths: ['_id'] }]);
      return true;
    });

    const foreignId = new foreignBson.ObjectId();
    const originalId = Buffer.from(foreignId.id);
    const returnedId = new foreignBson.ObjectId();
    const originalReturnedId = Buffer.from(returnedId.id);
    const bsonSchema = new Schema({
      owner: Schema.Types.ObjectId,
      attack: { type: String, derived: { dependsOn: ['owner'], get: (view) => {
        view.owner.id = Buffer.alloc(12);
        return 'isolated';
      } } },
      ownerLabel: { type: String, derived: { dependsOn: ['owner'], get: (view) => view.owner.toHexString() } },
      returned: { type: Schema.Types.ObjectId, derived: { dependsOn: ['owner'], get: () => returnedId } },
    });
    bsonSchema.plugin(api.derivedFieldsPlugin);
    const BsonModel = mongoose.model('PackedDerivedForeignBson' + entryIndex, bsonSchema);
    const bsonDocument = new BsonModel({ owner: foreignId });
    assert.equal(bsonDocument.owner, foreignId); // proves the cross-constructor casting case
    await bsonDocument.validate();
    assert.deepEqual(Buffer.from(bsonDocument.owner.id), originalId);
    assert.equal(bsonDocument.ownerLabel, new Types.ObjectId(originalId).toHexString());
    returnedId.id = Buffer.alloc(12);
    assert.deepEqual(Buffer.from(bsonDocument.returned.id), originalReturnedId);
  }
}
`;
}

function keycloakRuntimeEsm(): string {
  return `
if (typeof keycloakUserSyncPlugin !== 'function') throw new Error('missing keycloakUserSyncPlugin');
if (typeof createManagedKeycloakClient !== 'function') throw new Error('missing createManagedKeycloakClient');
const keycloak = createManagedKeycloakClient({
  baseUrl: 'http://127.0.0.1:1',
  authRealm: 'master',
  clientId: 'moo-packed',
  clientSecret: 'packed-secret', // pragma: allowlist secret
});
if (typeof keycloak.realm !== 'function') throw new Error('managed client missing realm()');
const syncedSchema = new Schema({
  providerId: String,
  username: String,
  email: String,
  emailVerified: Boolean,
  firstName: String,
  lastName: String,
  archived: Boolean,
  roles: [String],
  attributes: Schema.Types.Mixed,
});
syncedSchema.plugin(keycloakUserSyncPlugin, { client: keycloak, realm: 'application' });
`;
}

function keycloakRuntimeCjs(): string {
  return `
if (typeof keycloakUserSyncPluginCjs !== 'function') throw new Error('missing keycloakUserSyncPlugin (cjs)');
const keycloakCjs = createManagedKeycloakClientCjs({
  baseUrl: 'http://127.0.0.1:1',
  authRealm: 'master',
  clientId: 'moo-packed',
  clientSecret: 'packed-secret', // pragma: allowlist secret
});
const syncedSchema = new mongoose.Schema({
  providerId: String,
  username: String,
  email: String,
  emailVerified: Boolean,
  firstName: String,
  lastName: String,
  archived: Boolean,
  roles: [String],
  attributes: mongoose.Schema.Types.Mixed,
});
syncedSchema.plugin(keycloakUserSyncPluginCjs, { client: keycloakCjs, realm: 'application' });
`;
}

function coreTypesEsm(): string {
  return `import { Schema } from 'mongoose';
import { cascadeDeletePlugin, isObjectId, modelFunctionPlugin, newDocumentPlugin, uniqueNullableString } from '@web-ts-toolkit/moo';
import { isObjectId as isObjectIdDirect } from '@web-ts-toolkit/moo/is';
import { uniqueEmptiableString } from '@web-ts-toolkit/moo/schema';
import { isReference, isSchema } from '@web-ts-toolkit/moo/utils';
import { cascadeDeletePlugin as cascadeDirect } from '@web-ts-toolkit/moo/plugins/cascade-delete';
import { derivedFieldsPlugin, defineDerivedField, DerivedFieldsDependencyError } from '@web-ts-toolkit/moo/plugins/derived-fields';
import { modelFunctionPlugin as modelFunctionDirect } from '@web-ts-toolkit/moo/plugins/model-function';
import { newDocumentPlugin as newDocumentDirect } from '@web-ts-toolkit/moo/plugins/new-document';
import type { CascadeDeleteDependencyMap } from '@web-ts-toolkit/moo/plugins/cascade-delete';

const schema = new Schema({ email: uniqueNullableString('email'), username: uniqueEmptiableString('username') });
schema.plugin(newDocumentPlugin, { fn: async () => {} });
schema.plugin(newDocumentDirect, { fn: async () => {} });
schema.plugin(modelFunctionPlugin, {
  fnName: 'greet',
  fn: (doc: { get(path: string): unknown }) => String(doc.get('name')),
});
schema.plugin(modelFunctionDirect, {
  fnName: 'greet',
  fn: (doc: { get(path: string): unknown }) => String(doc.get('name')),
});
schema.plugin(cascadeDeletePlugin, { model: 'Child', localField: '_id', foreignField: 'ownerId' });
schema.plugin(cascadeDirect, { model: 'Child', localField: '_id', foreignField: 'ownerId' });

declare const candidate: unknown;
if (isObjectId(candidate) && isObjectIdDirect(candidate)) {
  const narrowed: string | object = candidate;
  void narrowed;
}
if (!isSchema(schema) || !isReference({ type: Schema.Types.ObjectId, ref: 'Child' }, 'Child')) {
  throw new Error('helper mismatch');
}
type Dependents = CascadeDeleteDependencyMap<'Child', { name: string }>;
void (undefined as unknown as Dependents);
type User = { firstName: string; lastName: string; fullName: string };
const userSchema = new Schema<User>({
  firstName: String,
  lastName: String,
  fullName: { type: String, derived: defineDerivedField<User, 'fullName'>({ dependsOn: ['firstName', 'lastName'], get: (doc) => [doc.firstName, doc.lastName].join(' ') }) },
});
userSchema.plugin(derivedFieldsPlugin);
const error = new DerivedFieldsDependencyError([{ targetPath: 'fullName', missingPaths: ['lastName'] }]);
const code: 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' = error.code;
void code;
`;
}

function coreTypesCjs(): string {
  return `import moo = require('@web-ts-toolkit/moo');
import isEntry = require('@web-ts-toolkit/moo/is');
import schemaEntry = require('@web-ts-toolkit/moo/schema');
import utilsEntry = require('@web-ts-toolkit/moo/utils');
import pluginsEntry = require('@web-ts-toolkit/moo/plugins');
import cascadeEntry = require('@web-ts-toolkit/moo/plugins/cascade-delete');
import derivedEntry = require('@web-ts-toolkit/moo/plugins/derived-fields');
import modelFunctionEntry = require('@web-ts-toolkit/moo/plugins/model-function');
import newDocumentEntry = require('@web-ts-toolkit/moo/plugins/new-document');
import mongoose = require('mongoose');

const schema = new (require('mongoose').Schema)({
  email: moo.uniqueNullableString('email'),
  username: schemaEntry.uniqueEmptiableString('username'),
});
schema.plugin(pluginsEntry.newDocumentPlugin, { fn: async () => {} });
schema.plugin(newDocumentEntry.newDocumentPlugin, { fn: async () => {} });
schema.plugin(modelFunctionEntry.modelFunctionPlugin, { fnName: 'greet', fn: (doc: { get(p: string): unknown }) => String(doc.get('name')) });
schema.plugin(cascadeEntry.cascadeDeletePlugin, { model: 'Child', localField: '_id', foreignField: 'ownerId' });

declare const candidate: unknown;
if (moo.isObjectId(candidate) && isEntry.isObjectId(candidate) && utilsEntry.isSchema(schema)) {
  const narrowed: string | object = candidate;
  void narrowed;
}
type User = { firstName: string; lastName: string | null; fullName: string; score: number };
const fullName: derivedEntry.DerivedFieldDescriptor<User, string> = derivedEntry.defineDerivedField<User, 'fullName'>({
  dependsOn: ['firstName', 'lastName'],
  get: async (doc) => [doc.firstName, doc.lastName].join(' '),
});
const getter: pluginsEntry.DerivedFieldGetter<User, string> = (doc) => doc.firstName;
const definition: moo.DerivedFieldDefinition<User, string> = getter;
const input: derivedEntry.DerivedFieldInput<User> = {};
const userSchema = new mongoose.Schema<User>({ firstName: String, lastName: String, fullName: { type: String, derived: fullName }, score: Number });
userSchema.plugin(derivedEntry.derivedFieldsPlugin);
new mongoose.Schema<User>({ fullName: { type: String, derived: definition } }).plugin(pluginsEntry.derivedFieldsPlugin);
new mongoose.Schema<User>({ fullName: String }).plugin(moo.derivedFieldsPlugin);
// @ts-expect-error dependency names must exist
derivedEntry.defineDerivedField<User, 'fullName'>({ dependsOn: ['missing'], get: () => 'x' });
// @ts-expect-error async results must match the target type
moo.defineDerivedField<User, 'fullName'>({ dependsOn: ['firstName'], get: async () => 42 });
// @ts-expect-error shorthand results must match the target type
pluginsEntry.defineDerivedField<User, 'score'>((doc) => doc.firstName);
derivedEntry.defineDerivedField<User, 'fullName'>({ dependsOn: ['firstName'], get(doc) {
  // @ts-expect-error required raw-model paths can be undefined in the partial view
  const required: string = doc.firstName;
  // @ts-expect-error plain partial input does not have hydrated methods
  doc.save();
  // @ts-expect-error inputs are readonly
  doc.firstName = 'mutation';
  return required;
} });
void input;
`;
}

function fullTypesEsm(): string {
  return `${coreTypesEsm()}
import { createManagedKeycloakClient, keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';
import type { KeycloakUserSyncPluginOptions } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';

const keycloak = createManagedKeycloakClient({
  baseUrl: 'http://127.0.0.1:1',
  authRealm: 'master',
  clientId: 'moo-packed',
  clientSecret: 'packed-secret', // pragma: allowlist secret
});
const syncedSchema = new Schema({
  providerId: String,
  username: String,
  email: String,
  emailVerified: Boolean,
  firstName: String,
  lastName: String,
  archived: Boolean,
  roles: [String],
  attributes: Schema.Types.Mixed,
});
const options: KeycloakUserSyncPluginOptions = { client: keycloak, realm: 'application' };
syncedSchema.plugin(keycloakUserSyncPlugin, options);
// @ts-expect-error Keycloak plugin options require a client
syncedSchema.plugin(keycloakUserSyncPlugin, { realm: 'application' });
`;
}

function fullTypesCjs(): string {
  return `import keycloakEntry = require('@web-ts-toolkit/moo/plugins/keycloak-user-sync');

const keycloak = keycloakEntry.createManagedKeycloakClient({
  baseUrl: 'http://127.0.0.1:1',
  authRealm: 'master',
  clientId: 'moo-packed',
  clientSecret: 'packed-secret', // pragma: allowlist secret
});
const schema = new (require('mongoose').Schema)({
  providerId: String,
  username: String,
  email: String,
  emailVerified: Boolean,
  firstName: String,
  lastName: String,
  archived: Boolean,
  roles: [String],
});
schema.plugin(keycloakEntry.keycloakUserSyncPlugin, { client: keycloak, realm: 'application' });
type PluginOptions = Parameters<typeof keycloakEntry.keycloakUserSyncPlugin>[1];
const realmOf: PluginOptions['realm'] = 'application';
void realmOf;
`;
}

afterAll(() => {
  cleanupPackedConsumerTempRoots();
});

describe('Moo packed-package consumer harness (MOO-09)', () => {
  it('packs a release-like manifest covering every public entry with one peer policy', () => {
    const packed = preparePackedWorkspace();
    const manifest = packed.manifests['@web-ts-toolkit/moo'];
    const packageJson = JSON.parse(
      readFileSync(path.resolve(packed.tempRoot, '_web-ts-toolkit_moo', 'package.json'), 'utf8'),
    ) as PackageJson;

    expect(packageJson).toEqual(manifest);
    expect(manifest.version).toBe(testVersion);
    expect(manifest.license).toBe(rootPackageJson.license);
    expect(manifest.repository).toEqual({ ...rootPackageJson.repository, directory: 'packages/moo' });
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([...mooSubpaths].sort());
    for (const subpath of mooSubpaths) {
      expect(manifest.exports?.[subpath]).toMatchObject({ types: expect.any(String), import: expect.any(String) });
    }
    expect(manifest.peerDependencies).toMatchObject({
      '@egose/keycloak-fluent': '>=0.12.1 <0.15.0',
      mongoose: '>=8.0.0',
    });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(manifest)).toBe(false);
    expect(manifest.license).toBe('Apache-2.0');

    const tarballFiles = packed.contents['@web-ts-toolkit/moo'];
    for (const entry of [
      'package/LICENSE',
      'package/README.md',
      'package/llms.txt',
      'package/package.json',
      'package/index.js',
      'package/index.mjs',
      'package/index.d.ts',
      'package/is.js',
      'package/is.mjs',
      'package/is.d.ts',
      'package/schema.js',
      'package/schema.mjs',
      'package/schema.d.ts',
      'package/utils/index.js',
      'package/utils/index.mjs',
      'package/utils/index.d.ts',
      'package/plugins/index.js',
      'package/plugins/index.mjs',
      'package/plugins/index.d.ts',
      'package/plugins/cascade-delete.js',
      'package/plugins/cascade-delete.mjs',
      'package/plugins/cascade-delete.d.ts',
      'package/plugins/derived-fields.js',
      'package/plugins/derived-fields.mjs',
      'package/plugins/derived-fields.d.ts',
      'package/plugins/derived-fields.d.mts',
      'package/plugins/model-function.js',
      'package/plugins/model-function.mjs',
      'package/plugins/model-function.d.ts',
      'package/plugins/new-document.js',
      'package/plugins/new-document.mjs',
      'package/plugins/new-document.d.ts',
      'package/plugins/keycloak-user-sync.js',
      'package/plugins/keycloak-user-sync.mjs',
      'package/plugins/keycloak-user-sync.d.ts',
    ]) {
      expect(tarballFiles).toContain(entry);
    }
  }, 30_000);

  it('runs core-only package-name imports on Mongoose 9 without the optional Keycloak peer', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0' });
    writeConsumerFiles(consumerDir, false);

    run('node', ['core-runtime.mjs'], consumerDir);
    run('node', ['core-runtime.cjs'], consumerDir);
    run('node', ['keycloak-absent.cjs'], consumerDir);
    const version = run('node', ['-p', "require('mongoose').version"], consumerDir).trim();
    expect(version).toMatch(/^9\./);
    console.info(`Packed ESM/CJS core and dependency-selection checks: Mongoose ${version}, no Keycloak peer`);
  }, 180_000);

  it('compiles strict NodeNext core declarations without the optional peer', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0' });
    writeConsumerFiles(consumerDir, false);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-core-nodenext.json', '--noEmit'], consumerDir);
  }, 180_000);

  it('runs every subpath on Mongoose 9 with the current Keycloak peer', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0', keycloakVersion: '^0.14.0' });
    writeConsumerFiles(consumerDir, true);

    run('node', ['core-runtime.mjs'], consumerDir);
    run('node', ['core-runtime.cjs'], consumerDir);
    const installedKeycloak = JSON.parse(
      run(
        'node',
        [
          '-e',
          "const fs = require('fs'); const path = require('path'); const versionOf = (name) => { let dir = path.dirname(require.resolve(name)); for (let depth = 0; depth < 6; depth += 1) { const candidate = path.join(dir, 'package.json'); if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')).version; dir = path.dirname(dir); } throw new Error('no manifest found for ' + name); }; const entry = require.resolve('@egose/keycloak-fluent'); console.log(JSON.stringify(versionOf('@egose/keycloak-fluent')));",
        ],
        consumerDir,
      ),
    ) as string;
    expect(installedKeycloak).toMatch(/^0\.14\./);
  }, 180_000);

  it('compiles strict NodeNext declarations for every subpath with the current Keycloak peer', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0', keycloakVersion: '^0.14.0' });
    writeConsumerFiles(consumerDir, true);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-core-nodenext.json', '--noEmit'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-full-nodenext.json', '--noEmit'], consumerDir);
  }, 180_000);

  it('runs every subpath on Mongoose 8 with the minimum Keycloak peer', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^8.24.0', keycloakVersion: '0.12.1' });
    writeConsumerFiles(consumerDir, true);

    run('node', ['core-runtime.mjs'], consumerDir);
    run('node', ['core-runtime.cjs'], consumerDir);
    const versions = JSON.parse(
      run(
        'node',
        [
          '-e',
          "const fs = require('fs'); const path = require('path'); const versionOf = (name) => { let dir = path.dirname(require.resolve(name)); for (let depth = 0; depth < 6; depth += 1) { const candidate = path.join(dir, 'package.json'); if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')).version; dir = path.dirname(dir); } throw new Error('no manifest found for ' + name); }; console.log(JSON.stringify({ mongoose: versionOf('mongoose'), keycloak: versionOf('@egose/keycloak-fluent') }));",
        ],
        consumerDir,
      ),
    ) as { mongoose: string; keycloak: string };
    expect(versions.mongoose).toMatch(/^8\./);
    expect(versions.keycloak).toBe('0.12.1');
    console.info(
      `Packed ESM/CJS core and dependency-selection checks: Mongoose ${versions.mongoose}, Keycloak ${versions.keycloak}`,
    );
  }, 180_000);

  it('compiles strict NodeNext declarations for every subpath with the minimum Keycloak peer', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^8.24.0', keycloakVersion: '0.12.1' });
    writeConsumerFiles(consumerDir, true);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-core-nodenext.json', '--noEmit'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-full-nodenext.json', '--noEmit'], consumerDir);
  }, 180_000);

  it('keeps documented runtime exports present in the installed package', () => {
    const consumerDir = installPackedConsumer({ mongooseVersion: '^9.8.0', keycloakVersion: '^0.14.0' });
    writeConsumerFiles(consumerDir, true);
    const keys = JSON.parse(
      run(
        'node',
        ['-e', "console.log(JSON.stringify(Object.keys(require('@web-ts-toolkit/moo')).sort()))"],
        consumerDir,
      ),
    ) as string[];

    // Root entrypoint: schema helpers, isObjectId, non-Keycloak plugins.
    for (const exportName of [
      'isObjectId',
      'uniqueNullableString',
      'uniqueEmptiableString',
      'modelFunctionPlugin',
      'cascadeDeletePlugin',
      'derivedFieldsPlugin',
      'defineDerivedField',
      'DerivedFieldsDependencyError',
      'newDocumentPlugin',
    ]) {
      expect(keys).toContain(exportName);
    }
    expect(keys).not.toContain('keycloakUserSyncPlugin');

    // Dedicated subpaths carry the remaining public surface.
    const utilsKeys = JSON.parse(
      run(
        'node',
        ['-e', "console.log(JSON.stringify(Object.keys(require('@web-ts-toolkit/moo/utils')).sort()))"],
        consumerDir,
      ),
    ) as string[];
    for (const exportName of ['isSchema', 'isObjectIdType', 'isReference']) {
      expect(utilsKeys).toContain(exportName);
    }
    const keycloakKeys = JSON.parse(
      run(
        'node',
        [
          '-e',
          "console.log(JSON.stringify(Object.keys(require('@web-ts-toolkit/moo/plugins/keycloak-user-sync')).sort()))",
        ],
        consumerDir,
      ),
    ) as string[];
    for (const exportName of ['keycloakUserSyncPlugin', 'createManagedKeycloakClient']) {
      expect(keycloakKeys).toContain(exportName);
    }
  }, 180_000);

  it('leaves package source fixtures outside the release-like tarball', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, '_web-ts-toolkit_moo');

    expect(existsSync(path.resolve(packageRoot, 'test', 'support'))).toBe(true);
    expect(existsSync(path.resolve(stageDir, 'test'))).toBe(false);
    expect(packed.contents['@web-ts-toolkit/moo'].some((entry) => entry.includes('/test/'))).toBe(false);
  });
});
