// Append-only, one-off F1 migration evidence. Not a maintained test/hash gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.dirname(fileURLToPath(import.meta.url));
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const local = (file) => path.join(root, file);
const hashFile = (record) => assert.equal(sha(readFileSync(local(record.path))), record.sha256, `changed identity: ${record.path}`);
const digest = (records) => sha(records.map((record) => `${record.path}\0${record.sha256}\n`).sort().join(''));
const guardFile = 'packages/access-router/test/internal/test-layer-boundaries.unit.test.ts';
const allowedChanges = [
  'packages/access-router/scripts/check-test-layers.mjs',
  'packages/access-router/scripts/test-layer-consumers.mjs',
  guardFile,
];

// Reconstruct only in memory. Do not apply/revert the patch to the checkout.
function reversePatch(patch, files) {
  const lines = patch.split('\n');
  const restored = new Map();
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('--- a/')) { i++; continue; }
    const name = lines[i++].slice('--- a/'.length);
    assert.equal(lines[i++], `+++ b/${name}`);
    const current = files.get(name).split('\n');
    const previous = [];
    let cursor = 0;
    while (i < lines.length && !lines[i].startsWith('--- a/')) {
      const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i++]);
      if (!header) continue;
      const start = Number(header[3]) - 1;
      previous.push(...current.slice(cursor, start));
      cursor = start;
      while (i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('--- a/')) {
        const line = lines[i];
        if (!/^[ +\-]/.test(line)) break;
        i++;
        if (line[0] !== '-') assert.equal(current[cursor++], line.slice(1), `patch mismatch: ${name}`);
        if (line[0] !== '+') previous.push(line.slice(1));
      }
    }
    previous.push(...current.slice(cursor));
    restored.set(name, previous.join('\n'));
  }
  return restored;
}

export async function verifyF1Checkpoint() {
  const manifest = json(path.join(bundle, 'arts-03-f1-manifest.json'));
  const oldTooling = json(path.join(bundle, 'arts-03-manifest.json')).deliveredFiles;
  assert.deepEqual(manifest.deliveredFiles.map((record) => record.path).sort(), [...allowedChanges].sort());
  const current = new Map(manifest.deliveredFiles.map((record) => [record.path, readFileSync(local(record.path), 'utf8')]));
  const restored = reversePatch(readFileSync(path.join(bundle, 'arts-03-f1-changes.patch'), 'utf8'), current);
  assert.deepEqual([...restored.keys()].sort(), [...allowedChanges].sort());
  for (const record of manifest.deliveredFiles) {
    hashFile(record);
    assert.equal(record.beforeSha256, oldTooling.find((old) => old.path === record.path).sha256);
    assert.equal(sha(restored.get(record.path)), record.beforeSha256, `F1 preimage changed: ${record.path}`);
  }
  const previousGuard = Buffer.from(restored.get(guardFile));
  assert.ok(readFileSync(local(guardFile)).subarray(0, previousGuard.length).equals(previousGuard), 'Old guard file must be an exact unchanged prefix');
  const before = ts.createSourceFile(guardFile, previousGuard.toString(), ts.ScriptTarget.Latest, true);
  const after = ts.createSourceFile(guardFile, current.get(guardFile), ts.ScriptTarget.Latest, true);
  const statements = (file, limit) => file.statements.slice(0, limit).map((node) => ({
    kind: node.kind, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    fingerprint: sha(node.getText(file)),
  }));
  const oldStatements = statements(before, before.statements.length);
  assert.deepEqual(statements(after, before.statements.length), oldStatements, 'Old guard statement bodies/locations/expectations changed');

  const migrated = readFileSync(path.join(bundle, 'arts-02-preservation.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const originals = migrated.map((record) => ({ path: record.to, sha256: record.relocatedSha256 }));
  assert.equal(originals.length, 248);
  originals.forEach(hashFile);
  const baseline = json(path.join(bundle, 'identities.json'));
  const sources = baseline.files.filter((record) => record.path.startsWith('packages/access-router/src/'));
  const nonTest = baseline.files.filter((record) => !record.path.startsWith('packages/access-router/test/'));
  const historicalConfigExceptions = new Set(['packages/access-router/package.json', 'packages/access-router/vitest.config.ts']);
  nonTest.filter((record) => !historicalConfigExceptions.has(record.path)).forEach(hashFile);
  assert.equal(nonTest.length, 186);
  assert.equal(sources.length, 152);
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
  assert.deepEqual(walk(local('packages/access-router/src')).map(relative).sort(), sources.map((record) => record.path).sort());
  const untouchedTooling = oldTooling.filter((record) => !allowedChanges.includes(record.path));
  untouchedTooling.forEach(hashFile); // Includes unchanged scripts/config/API metadata.
  assert.equal(untouchedTooling.length, 7);
  const cleanup = json(path.join(bundle, 'arts-04-cleanup-manifest.json'));
  const companions = [...cleanup.deliveredFiles, ...cleanup.unaffectedMaintainedFiles];
  companions.forEach(hashFile);
  assert.equal(companions.length, 10);
  const guide = json(path.join(bundle, 'arts-05-verification.json')).newDocumentIdentities.find((record) => record.path === 'packages/access-router/test/README.md');
  hashFile(guide);
  manifest.priorEvidence.forEach(hashFile);
  assert.equal(manifest.priorEvidence.length, 41);
  for (const record of manifest.artifacts) {
    assert.equal(sha(readFileSync(path.join(bundle, record.path))), record.sha256, `F1 artifact changed: ${record.path}`);
  }
  const declarations = json(path.join(bundle, 'declarations.json')).inventory;
  assert.deepEqual(walk(local('packages/access-router/dist')).filter((file) => /\.d\.[cm]?ts$/.test(file)).map(relative).sort(), declarations.map((record) => record.path).sort());
  declarations.forEach(hashFile);
  const expectedExports = json(path.join(bundle, 'public-surfaces.json')).runtime;
  const require = createRequire(import.meta.url);
  const runtimeExports = {};
  for (const entry of ['index', 'advanced', 'processors']) {
    const esm = await import(pathToFileURL(local(`packages/access-router/dist/${entry}.mjs`)).href);
    const cjs = require(local(`packages/access-router/dist/${entry}.js`));
    assert.deepEqual(Object.keys(esm).sort(), [...expectedExports[entry]].sort());
    assert.deepEqual(Object.keys(cjs).sort(), [...expectedExports[entry]].sort());
    runtimeExports[entry] = Object.keys(esm).length;
  }
  return {
    exactF1ToolingChanges: allowedChanges,
    patchPreimagesEqualSealedARTS03: true,
    oldGuardPrefixBytes: previousGuard.length,
    oldGuardPrefixSha256: sha(previousGuard),
    oldGuardStatements: oldStatements,
    originalMigratedFiles: originals.length,
    migratedBytesDigest: digest(originals),
    sourceFiles: sources.length, sourceDigest: digest(sources),
    unchangedHistoricalToolingFiles: untouchedTooling.length,
    companionFiles: companions.length, companionCasesPreservedNotRerun: 93,
    guidesUnchanged: ['packages/access-router/test/README.md', 'packages/access-router/scripts/README.md'],
    priorEvidenceFiles: manifest.priorEvidence.length, priorEvidenceDigest: digest(manifest.priorEvidence),
    unchangedCapturedInputs: originals.length + untouchedTooling.length + companions.length + 1 + manifest.priorEvidence.length,
    baselineNonTestFiles: nonTest.length, unchangedBaselineNonTestFiles: nonTest.length - historicalConfigExceptions.size,
    historicalNotNewConfigExceptions: [...historicalConfigExceptions],
    declarationFiles: declarations.length, declarationDigest: digest(declarations), runtimeExports,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyF1Checkpoint(), null, 2));
}
