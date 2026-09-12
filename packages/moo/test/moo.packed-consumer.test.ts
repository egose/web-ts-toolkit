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
  { subpath: '@web-ts-toolkit/moo', names: ['isObjectId', 'uniqueNullableString', 'cascadeDeletePlugin'] },
  { subpath: '@web-ts-toolkit/moo/is', names: ['isObjectId'] },
  { subpath: '@web-ts-toolkit/moo/schema', names: ['uniqueNullableString', 'uniqueEmptiableString'] },
  { subpath: '@web-ts-toolkit/moo/utils', names: ['isSchema', 'isObjectIdType', 'isReference'] },
  {
    subpath: '@web-ts-toolkit/moo/plugins',
    names: ['modelFunctionPlugin', 'cascadeDeletePlugin', 'newDocumentPlugin'],
  },
  { subpath: '@web-ts-toolkit/moo/plugins/cascade-delete', names: ['cascadeDeletePlugin'] },
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
${includeKeycloak ? keycloakRuntimeEsm() : ''}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'core-runtime.cjs'),
    `${CORE_RUNTIME_EXPORTS.map(({ subpath }) => `const ns_${sanitize(subpath)} = require('${subpath}');`).join('\n')}
const mongoose = require('mongoose');
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
`;
}

function coreTypesCjs(): string {
  return `import moo = require('@web-ts-toolkit/moo');
import isEntry = require('@web-ts-toolkit/moo/is');
import schemaEntry = require('@web-ts-toolkit/moo/schema');
import utilsEntry = require('@web-ts-toolkit/moo/utils');
import pluginsEntry = require('@web-ts-toolkit/moo/plugins');
import cascadeEntry = require('@web-ts-toolkit/moo/plugins/cascade-delete');
import modelFunctionEntry = require('@web-ts-toolkit/moo/plugins/model-function');
import newDocumentEntry = require('@web-ts-toolkit/moo/plugins/new-document');

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
  it('packs a release-like manifest covering all nine subpaths with one peer policy', () => {
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
