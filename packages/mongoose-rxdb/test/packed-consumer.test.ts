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
  const runtimeContracts = `
async function checkParallelSave() {
  const doc = new api.Document({ name: 'first' }, new api.Schema({ name: String }), {
    collection: { insert: async (data) => data }
  });
  const first = doc.save();
  try {
    await doc.save();
    throw new Error('expected overlapping save rejection');
  } catch (error) {
    if (!(error instanceof api.ParallelSaveError) || error.name !== 'ParallelSaveError') throw error;
  }
  await first;
  if (doc.isNew) throw new Error('first save did not complete');
  await doc.save();
}
async function checkProjection() {
  const assert = await import('node:assert/strict');
  const connection = new api.Connection();
  await connection.connect(() => createMemoryDatabase({ name: 'packed_projection_slots' }));
  try {
    const M = connection.model('ProjectedSlots', new api.Schema({ title: String,
      members: [new api.Schema({ name: String, secret: String })] }));
    const members = [{ secret: 'private-a' }, { name: 'Ada', secret: 'private-b' }, { secret: 'private-c' }]; // pragma: allowlist secret
    await M.create({ title: 'before', members });
    for (const selection of ['title members.1.name', 'title members.name']) {
      const query = M.findOne().select(selection);
      const lean = await query.clone().lean();
      const doc = await query;
      assert.deepEqual(JSON.parse(JSON.stringify(doc)), JSON.parse(JSON.stringify(lean)));
      assert.deepEqual(JSON.parse(JSON.stringify(doc.members)), [null, { name: 'Ada' }, null]);
      assert.equal(Object.hasOwn(doc.members, 0), true);
      await doc.save();
      doc.title = selection;
      await doc.save();
      doc.members[1].name = 'unsafe';
      await assert.rejects(doc.save(), api.WriteNormalizationError);
      assert.deepEqual(JSON.parse(JSON.stringify((await M.findOne().lean()).members)), members);
    }
  } finally { await connection.disconnect(); }
}
checkParallelSave().then(checkProjection).catch((error) => { console.error(error); process.exitCode = 1; });
`;
  writeProjectFile(
    consumerDir,
    'consumer.mjs',
    `import api, { Schema, Connection, ParallelSaveError, model, connect, disconnect } from '@web-ts-toolkit/mongoose-rxdb';
import storageDefault, { createMemoryDatabase, createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

if (api.Schema !== Schema) throw new Error('root default Schema mismatch');
if (api.ParallelSaveError !== ParallelSaveError) throw new Error('root default ParallelSaveError mismatch');
if (typeof Connection !== 'function') throw new Error('missing Connection named export');
if (typeof model !== 'function' || typeof connect !== 'function' || typeof disconnect !== 'function') throw new Error('missing root functions');
if (storageDefault !== createMemoryDatabase) throw new Error('storage default mismatch');
if (typeof createSqliteDatabase !== 'function') throw new Error('missing createSqliteDatabase');
${runtimeContracts}
`,
  );
  writeProjectFile(
    consumerDir,
    'consumer.cjs',
    `const api = require('@web-ts-toolkit/mongoose-rxdb');
const storage = require('@web-ts-toolkit/mongoose-rxdb/storage');
const { createMemoryDatabase } = storage;

if (api.default.Schema !== api.Schema) throw new Error('root default Schema mismatch');
if (api.default.ParallelSaveError !== api.ParallelSaveError) throw new Error('root default ParallelSaveError mismatch');
if (typeof api.Connection !== 'function') throw new Error('missing Connection named export');
if (typeof api.model !== 'function' || typeof api.connect !== 'function' || typeof api.disconnect !== 'function') throw new Error('missing root functions');
if (storage.default !== storage.createMemoryDatabase) throw new Error('storage default mismatch');
if (typeof storage.createSqliteDatabase !== 'function') throw new Error('missing createSqliteDatabase');
${runtimeContracts}
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

function writeLeanErrorContract(consumerDir: string): void {
  writeProjectFile(
    consumerDir,
    'lean-error-contract.mjs',
    `import { BulkWritePartialFailureError, Connection, MutationPartialFailureError, Schema, WriteNormalizationError } from '@web-ts-toolkit/mongoose-rxdb';
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

if (typeof WriteNormalizationError !== 'function') throw new Error('missing WriteNormalizationError root export');
if (typeof MutationPartialFailureError !== 'function') throw new Error('missing MutationPartialFailureError root export');

const conn = new Connection();
await conn.connect(() => createMemoryDatabase({ name: 'packed_bmrx24' }));
const schema = new Schema({ name: String, age: Number });
const M = conn.model('PackedBmrx24', schema);
await M.create({ name: 'Ada', age: 36 });
const lean = await M.find({ name: 'Ada' }).lean(true);
if (typeof lean[0].save !== 'undefined') throw new Error('packed lean result exposes save');
const restored = await M.find({ name: 'Ada' }).lean(true).lean(false);
if (typeof restored[0].save !== 'function') throw new Error('packed lean(false) did not restore hydrated');
const optLean = await M.findOneAndUpdate({ name: 'Ada' }, { $inc: { age: 1 } }, { lean: true, returnDocument: 'after' });
if (optLean === null || typeof optLean.save !== 'undefined') throw new Error('packed option-lean result mismatch');
const missing = await M.findOneAndDelete({ name: 'Nobody' }, { lean: true });
if (missing !== null) throw new Error('packed option-lean nullability mismatch');
await M.updateOne({ name: 'Ada' }, { $set: { age: Number.MAX_VALUE } });
try {
  await M.updateOne({ name: 'Ada' }, { $inc: { age: Number.MAX_VALUE } });
  throw new Error('expected overflow rejection did not occur');
} catch (error) {
  if (error instanceof Error && error.message === 'expected overflow rejection did not occur') throw error;
  if (!(error instanceof WriteNormalizationError)) throw new Error('packed WriteNormalizationError narrowing failed');
}
if (!(new MutationPartialFailureError('updateMany', {}, new Error('x')) instanceof MutationPartialFailureError)) throw new Error('packed MutationPartialFailureError identity failed');
if (!(new BulkWritePartialFailureError('insertMany', false, { insertedCount: 0, insertedIds: [], records: [], errors: [] }) instanceof BulkWritePartialFailureError)) throw new Error('packed BulkWritePartialFailureError identity failed');
await conn.disconnect();
`,
  );
}

function writeReadmeQuickstart(consumerDir: string): void {
  const readme = readFileSync(
    path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'mongoose-rxdb', 'README.md'),
    'utf8',
  );
  const quickstart = readme.match(/## Quick Start\s+```ts\n([\s\S]*?)\n```/);
  if (!quickstart) throw new Error('Packed README is missing the canonical TypeScript quickstart');
  writeProjectFile(consumerDir, 'readme-quickstart.mts', quickstart[1]);
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
    expect(packed.contents[packageName]).toContain('package/README.md');
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
    writeLeanErrorContract(consumerDir);

    await runChecked('node', ['consumer.mjs'], { cwd: consumerDir, timeoutMs: 10_000 });
    await runChecked('node', ['consumer.cjs'], { cwd: consumerDir, timeoutMs: 10_000 });
    await runChecked('node', ['mixed-module-contract.mjs'], { cwd: consumerDir, timeoutMs: 10_000 });
    await runChecked('node', ['lean-error-contract.mjs'], { cwd: consumerDir, timeoutMs: 20_000 });
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

    for (const file of ['index.d.ts', 'index.d.mts']) {
      const declaration = readFileSync(
        path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'mongoose-rxdb', file),
        'utf8',
      );
      // Installed hovers must carry the new error and high-risk behavioral contracts.
      expect(declaration).toContain('class ParallelSaveError extends Error');
      expect(declaration).toContain('Same-instance overlaps reject with ParallelSaveError');
      expect(declaration).toContain('validateSync() reject / return ValidationError');
      expect(declaration).toContain('Retained arrays preserve indexes with null for redacted positions');
      expect(declaration).toContain('Stable IDs do not');
      expect(declaration).toContain('50 levels');
      expect(declaration).toContain('Best-effort conditional delete');
    }

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
