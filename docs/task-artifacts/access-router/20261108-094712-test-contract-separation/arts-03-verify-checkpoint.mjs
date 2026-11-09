// One-off migration checkpoint, NOT a maintained contract/hash gate.
// Run from any cwd after the normal filtered access-router build.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.dirname(fileURLToPath(import.meta.url));
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const digest = (records) => sha256(records.map((record) => `${record.path}\0${record.sha256}\n`).sort().join(''));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

export async function verifyCheckpoint() {
  const baseline = readJson(path.join(bundle, 'identities.json'));
  const manifest = readJson(path.join(bundle, 'arts-03-manifest.json'));
  const moved = readFileSync(path.join(bundle, 'arts-02-preservation.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), baseline.revision);
  assert.equal(moved.length, 248);
  for (const record of moved) {
    assert.equal(sha256(readFileSync(path.join(root, record.to))), record.relocatedSha256, `ARTS-02 bytes changed: ${record.to}`);
  }
  const exceptions = new Set(['packages/access-router/package.json', 'packages/access-router/vitest.config.ts']);
  const protectedInputs = baseline.files.filter((record) => !record.path.startsWith('packages/access-router/test/'));
  assert.equal(protectedInputs.length, 186);
  for (const record of protectedInputs) {
    if (exceptions.has(record.path)) continue;
    assert.equal(sha256(readFileSync(path.join(root, record.path))), record.sha256, `protected input changed: ${record.path}`);
  }
  const sources = baseline.files.filter((record) => record.path.startsWith('packages/access-router/src/'));
  assert.equal(sources.length, 152);
  assert.deepEqual(walk(path.join(root, 'packages/access-router/src')).map(relative).sort(), sources.map((record) => record.path).sort());

  const packageFile = 'packages/access-router/package.json';
  const original = JSON.parse(execFileSync('git', ['show', `${baseline.revision}:${packageFile}`], { cwd: root, encoding: 'utf8' }));
  const current = readJson(path.join(root, packageFile));
  const build = 'pnpm --filter @web-ts-toolkit/access-router... build';
  const gate = 'node scripts/check-test-layers.mjs';
  const expectedScripts = { ...original.scripts, test: `${build} && ${gate} && vitest run --config vitest.config.ts` };
  for (const layer of ['contracts', 'invariants', 'internal']) {
    expectedScripts[`test:${layer}`] = `${build} && ${gate} && vitest run --config vitest.${layer}.config.ts`;
  }
  expectedScripts['test:layers:check'] = gate;
  assert.deepEqual(current.scripts, expectedScripts, 'Only the exact reviewed test script changes are allowed');
  assert.deepEqual({ ...current, scripts: original.scripts }, original, 'Non-script package/API/export/dependency metadata changed');
  // The sole old config edit is sealed along with all new tooling, not excused
  // by a blanket non-test exemption. No old verifier or record is modified.
  assert.ok(manifest.deliveredFiles.some((record) => record.path === 'packages/access-router/vitest.config.ts'));
  for (const record of [...manifest.deliveredFiles, ...manifest.priorEvidence]) {
    assert.equal(sha256(readFileSync(path.join(root, record.path))), record.sha256, `checkpoint identity changed: ${record.path}`);
  }
  for (const record of manifest.artifacts ?? []) {
    assert.equal(sha256(readFileSync(path.join(bundle, record.path))), record.sha256, `ARTS-03 evidence changed: ${record.path}`);
  }

  const declarations = readJson(path.join(bundle, 'declarations.json')).inventory;
  const currentDeclarations = walk(path.join(root, 'packages/access-router/dist')).filter((file) => /\.d\.[cm]?ts$/.test(file)).map(relative).sort();
  assert.deepEqual(currentDeclarations, declarations.map((record) => record.path).sort());
  for (const record of declarations) {
    assert.equal(sha256(readFileSync(path.join(root, record.path))), record.sha256, `declaration changed: ${record.path}`);
  }
  const expectedExports = readJson(path.join(bundle, 'public-surfaces.json')).runtime;
  const require = createRequire(import.meta.url);
  const runtimeExports = {};
  for (const entry of ['index', 'advanced', 'processors']) {
    const esm = await import(pathToFileURL(path.join(root, `packages/access-router/dist/${entry}.mjs`)).href);
    const cjs = require(path.join(root, `packages/access-router/dist/${entry}.js`));
    assert.deepEqual(Object.keys(esm).sort(), [...expectedExports[entry]].sort(), `${entry} ESM export names changed`);
    assert.deepEqual(Object.keys(cjs).sort(), [...expectedExports[entry]].sort(), `${entry} CJS export names changed`);
    runtimeExports[entry] = Object.keys(esm).length;
  }
  return {
    revision: baseline.revision,
    originalMigratedFiles: moved.length,
    migratedBytesDigest: digest(moved.map((record) => ({ path: record.to, sha256: record.relocatedSha256 }))),
    preservation: 'Exact ARTS-02 bytes imply its sealed full AST, assertions, expected values, tables, negative directives and cleanup remain identical; no recount substitution.',
    protectedNonTestInputs: 186,
    unchangedNonTestInputs: 184,
    exactApprovedExceptions: [...exceptions],
    sourceFiles: sources.length,
    sourceDigest: digest(sources),
    priorEvidenceFiles: manifest.priorEvidence.length,
    priorEvidenceDigest: digest(manifest.priorEvidence),
    declarationFiles: declarations.length,
    declarationDigest: digest(declarations),
    runtimeExports,
    packageMetadataExceptScriptsUnchanged: true,
    deliveredFilesVerified: manifest.deliveredFiles.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyCheckpoint(), null, 2));
}
