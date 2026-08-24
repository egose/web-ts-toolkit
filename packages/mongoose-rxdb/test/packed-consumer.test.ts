import { afterAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  cleanupPackedConsumerHarness,
  containsDisallowedPublishedValue,
  installPackedConsumer,
  packageName,
  packageRoot,
  preparePackedWorkspace,
  testVersion,
  workspaceRoot,
  type PackageJson,
} from './support/packed-consumer';
import { cleanupTrackedChildren, runChecked } from './support/subprocess';
import { writeProjectFile } from './support/temp';

afterAll(async () => {
  await cleanupTrackedChildren();
  cleanupPackedConsumerHarness();
});

function writeRuntimeConsumers(consumerDir: string): void {
  writeProjectFile(
    consumerDir,
    'consumer.mjs',
    `import api, { Schema, Connection, model, connect, disconnect } from '@web-ts-toolkit/mongoose-rxdb';
import storageDefault, { createMemoryDatabase, createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

if (api.Schema !== Schema) throw new Error('root default Schema mismatch');
if (typeof Connection !== 'function') throw new Error('missing Connection named export');
if (typeof model !== 'function' || typeof connect !== 'function' || typeof disconnect !== 'function') throw new Error('missing root functions');
if (storageDefault !== createMemoryDatabase) throw new Error('storage default mismatch');
if (typeof createSqliteDatabase !== 'function') throw new Error('missing createSqliteDatabase');
`,
  );
  writeProjectFile(
    consumerDir,
    'consumer.cjs',
    `const api = require('@web-ts-toolkit/mongoose-rxdb');
const storage = require('@web-ts-toolkit/mongoose-rxdb/storage');

if (api.default.Schema !== api.Schema) throw new Error('root default Schema mismatch');
if (typeof api.Connection !== 'function') throw new Error('missing Connection named export');
if (typeof api.model !== 'function' || typeof api.connect !== 'function' || typeof api.disconnect !== 'function') throw new Error('missing root functions');
if (storage.default !== storage.createMemoryDatabase) throw new Error('storage default mismatch');
if (typeof storage.createSqliteDatabase !== 'function') throw new Error('missing createSqliteDatabase');
`,
  );
  writeProjectFile(
    consumerDir,
    'mixed-module-contract.mjs',
    `import { createRequire } from 'node:module';
import * as esm from '@web-ts-toolkit/mongoose-rxdb';

const require = createRequire(import.meta.url);
const cjs = require('@web-ts-toolkit/mongoose-rxdb');

if (esm.Schema === cjs.Schema) throw new Error('mixed ESM/CJS Schema identity unexpectedly shared');
if (esm.Connection === cjs.Connection) throw new Error('mixed ESM/CJS Connection identity unexpectedly shared');
if (esm.defaultConnection === cjs.defaultConnection) throw new Error('mixed ESM/CJS defaultConnection unexpectedly shared');
`,
  );
}

function writeReadmeQuickstart(consumerDir: string): void {
  writeProjectFile(
    consumerDir,
    'readme-quickstart.mts',
    `import { Connection, Schema, type HookNext, type HydratedDocument } from '@web-ts-toolkit/mongoose-rxdb';
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

interface User {
  name: string;
  age: number;
  role: 'admin' | 'user';
  tags: string[];
}

interface UserMethods {
  addTag(tag: string): string[];
}

interface UserVirtuals {
  isAdmin: boolean;
}

type UserDocument = HydratedDocument<User, UserMethods, UserVirtuals>;

const conn = new Connection();
await conn.connect(() => createMemoryDatabase({ name: 'quickstart' }));

const userSchema = new Schema<User, UserMethods, {}, UserVirtuals>({
  name: { type: String, required: true },
  age: { type: Number, default: 0, min: 0, max: 150 },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  tags: [String],
});

userSchema.pre('save', function (this: UserDocument, next: HookNext) {
  console.log('about to save', this.name);
  next();
});

userSchema.virtual('isAdmin').get(function (this: UserDocument) {
  return this.role === 'admin';
});

userSchema.method('addTag', function (this: UserDocument, tag: string) {
  this.tags.push(tag);
  return this.tags;
});

const User = conn.model('User', userSchema);

const ada = await User.create({ name: 'Ada', age: 36, role: 'admin', tags: [] });
console.log(ada.isAdmin);
ada.addTag('math');

const admins = await User.find({ role: 'admin' }).sort({ age: 1 });
await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
await User.deleteOne({ name: 'Ada' });
console.log(admins.map((user) => user.name));
await conn.disconnect();
`,
  );
}

function copyDeclConsumers(consumerDir: string): void {
  for (const file of [
    'decl-consumer.nodenext.mts',
    'decl-consumer.nodenext.cts',
    'decl-consumer.nodenext.ts',
    'decl-consumer.bundler.mts',
    'decl-consumer.bundler.cts',
    'decl-consumer.bundler.ts',
    'tsconfig-nodenext.json',
    'tsconfig-bundler.json',
  ]) {
    writeProjectFile(consumerDir, file, readFileSync(path.resolve(packageRoot, 'test-decl-consumer', file), 'utf8'));
  }
}

describe('MRX-01 packed consumer harness', () => {
  it('packs with the release manifest rewrite path and keeps harness files private', async () => {
    const packed = await preparePackedWorkspace();
    const manifest = packed.manifests[packageName];
    const rootManifest = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as PackageJson;

    expect(manifest.version).toBe(testVersion);
    expect(manifest.license).toBe(rootManifest.license);
    expect(manifest.repository).toEqual({ ...rootManifest.repository, directory: 'packages/mongoose-rxdb' });
    expect(manifest.main).toBe('./index.js');
    expect(manifest.module).toBe('./index.mjs');
    expect(manifest.types).toBe('./index.d.ts');
    expect(manifest.exports).toMatchObject({
      '.': {
        types: { import: './index.d.mts', require: './index.d.ts', default: './index.d.ts' },
        import: './index.mjs',
        require: './index.js',
      },
      './storage': {
        types: { import: './storage/index.d.mts', require: './storage/index.d.ts', default: './storage/index.d.ts' },
        import: './storage/index.mjs',
        require: './storage/index.js',
      },
    });
    expect(manifest.dependencies?.['@web-ts-toolkit/utils']).toBeUndefined();
    expect(manifest.peerDependencies).toMatchObject({
      rxdb: '>=17.4.0 <18',
      'rxdb-premium': '>=17.4.0 <18',
      rxjs: '>=7.8.0 <8',
      sqlite3: '>=5 <6',
    });
    expect(manifest.peerDependenciesMeta).toEqual({
      'rxdb-premium': { optional: true },
      sqlite3: { optional: true },
    });
    expect(containsDisallowedPublishedValue(manifest)).toBe(false);
    expect(packed.contents[packageName]).toContain('package/package.json');
    expect(packed.contents[packageName]).toContain('package/index.js');
    expect(packed.contents[packageName]).toContain('package/index.mjs');
    expect(packed.contents[packageName]).toContain('package/index.d.ts');
    expect(packed.contents[packageName]).toContain('package/index.d.mts');
    expect(packed.contents[packageName]).toContain('package/storage/index.js');
    expect(packed.contents[packageName]).toContain('package/storage/index.mjs');
    expect(packed.contents[packageName]).toContain('package/storage/index.d.ts');
    expect(packed.contents[packageName]).toContain('package/storage/index.d.mts');
    expect(packed.contents[packageName].some((entry) => entry.includes('/test/'))).toBe(false);
  }, 45_000);

  it('executes root and storage named/default imports in ESM and CommonJS from a clean install', async () => {
    const consumerDir = await installPackedConsumer();
    writeRuntimeConsumers(consumerDir);

    await runChecked('node', ['consumer.mjs'], { cwd: consumerDir, timeoutMs: 10_000 });
    await runChecked('node', ['consumer.cjs'], { cwd: consumerDir, timeoutMs: 10_000 });
    await runChecked('node', ['mixed-module-contract.mjs'], { cwd: consumerDir, timeoutMs: 10_000 });
  }, 90_000);

  it('compiles and executes the README quickstart from the packed package', async () => {
    const consumerDir = await installPackedConsumer();
    writeReadmeQuickstart(consumerDir);

    await runChecked(
      'pnpm',
      [
        'exec',
        'tsc',
        'readme-quickstart.mts',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2022',
        '--strict',
        '--skipLibCheck',
        'false',
        '--outDir',
        'out',
      ],
      { cwd: consumerDir, timeoutMs: 30_000 },
    );
    await runChecked('node', ['out/readme-quickstart.mjs'], { cwd: consumerDir, timeoutMs: 20_000 });
  }, 90_000);

  it('executes root and storage named/default imports from a clean npm install', async () => {
    const consumerDir = await installPackedConsumer('npm');
    writeRuntimeConsumers(consumerDir);

    await runChecked('node', ['consumer.mjs'], { cwd: consumerDir, timeoutMs: 10_000 });
    await runChecked('node', ['consumer.cjs'], { cwd: consumerDir, timeoutMs: 10_000 });
  }, 90_000);

  it('compiles strict NodeNext and Bundler installed-consumer fixtures with skipLibCheck disabled', async () => {
    const consumerDir = await installPackedConsumer();
    copyDeclConsumers(consumerDir);

    await runChecked('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json', '--noEmit'], {
      cwd: consumerDir,
      timeoutMs: 30_000,
    });
    await runChecked('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json', '--noEmit'], {
      cwd: consumerDir,
      timeoutMs: 30_000,
    });
    expect(existsSync(path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'mongoose-rxdb'))).toBe(true);
  }, 90_000);
});
