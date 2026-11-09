/** One-off, read-only ARTS-01 evidence verifier. Not the future test-layer checker. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../..');
const args = new Set(process.argv.slice(2));
assert([...args].every((arg) => ['--git-baseline', '--declarations'].includes(arg)),
  'Usage: node verify-baseline.mjs [--git-baseline] [--declarations]');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
const jsonLines = (file) => fs.readFileSync(path.join(directory, file), 'utf8').trimEnd().split('\n').map(JSON.parse);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const identity = readJson('identities.json');
const ledger = readJson('migration-ledger.json');
const preservation = jsonLines('preservation-ledger.jsonl');
const cases = jsonLines('runtime-cases.jsonl');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const ts = requireFromRoot('typescript');
assert.equal(ts.version, identity.toolchain.typescript, 'Use the recorded TypeScript version for AST hashes');
const cache = new Map();
const readInput = (file) => {
  if (!cache.has(file)) cache.set(file, args.has('--git-baseline')
    ? execFileSync('git', ['show', `${identity.revision}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    : fs.readFileSync(path.join(root, file)));
  return cache.get(file);
};
const patch = fs.readFileSync(path.join(directory, identity.baselineReconstruction.patch));
assert.equal(hash(patch), identity.baselineReconstruction.patchSha256);
assert.equal(patch.length, 0, 'This verifier reconstructs the recorded zero-diff baseline, not arbitrary patches');
for (const file of identity.files) assert.equal(hash(readInput(file.path)), file.sha256, `Protected bytes changed: ${file.path}`);

function normalized(node, source) {
  if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken)
    return [ts.SyntaxKind[node.kind], node.getText(source)];
  return [ts.SyntaxKind[node.kind], ...node.getChildren(source).map((child) => normalized(child, source))];
}
const digest = (node, source) => hash(JSON.stringify(normalized(node, source)));
const counts = { files: 0, groups: 0, staticCases: 0, assertionCallSites: 0, parameterizations: 0, directives: 0 };
const fromPaths = new Set(), toPaths = new Set(), fileIds = new Set();
for (const file of ledger.files) {
  assert(!fromPaths.has(file.from) && !toPaths.has(file.to) && !fileIds.has(file.id), `Duplicate mapping ${file.id}`);
  fromPaths.add(file.from);
  toPaths.add(file.to);
  fileIds.add(file.id);
  const records = preservation.filter((row) => row.file === file.id);
  const fileRecord = records.filter((row) => row.kind === 'file');
  assert.equal(fileRecord.length, 1);
  const text = readInput(file.from).toString('utf8');
  const source = ts.createSourceFile(file.from, text, ts.ScriptTarget.Latest, true);
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  assert.equal(hash(text), fileRecord[0].sha256, `File hash ${file.from}`);
  assert.equal(digest(source, source), fileRecord[0].ast, `File AST ${file.from}`);
  assert.deepEqual(source.statements.map((node) => [line(node), digest(node, source)]), fileRecord[0].statements,
    `Top-level setup/cleanup/table/import statements ${file.from}`);
  const groups = [], assertions = [], parameters = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (ts.isCallExpression(node.expression) && /^(it|test|describe)\.(each|for)/.test(node.expression.expression.getText(source)))
        parameters.push([line(node), digest(node.expression, source)]);
      if (/^(it|test|describe)(\.|\(|$)/.test(expression) && node.arguments.length >= 2
        && (ts.isStringLiteralLike(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0]))) {
        groups.push([line(node), node.arguments[0].getText(source), digest(node, source),
          digest(node.arguments[1], source), expression.startsWith('describe') ? 'suite' : 'case']);
      }
      if (/^(expect\(|assert\.|expectTypeOf\()/.test(expression)
        && !(/^expect\([^]*\)\./.test(expression) === false && expression === 'expect'))
        assertions.push([line(node), digest(node, source)]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const directives = text.split('\n').flatMap((value, index) => /@ts-(?:expect-error|ignore|nocheck|check)|^\s*\/\/ reject-next\s*$/.test(value)
    ? [[index + 1, hash(value), value.includes('reject-next') ? 'reject-next' : value.match(/@ts-[\w-]+/)[0]]] : []);
  assert.deepEqual(groups, records.filter((row) => row.kind === 'group')
    .map((row) => [row.line, row.title, row.sha256, row.bodySha256, row.declarationKind]), `Groups/bodies ${file.from}`);
  assert.deepEqual(assertions, records.filter((row) => row.kind === 'assertion').map((row) => [row.line, row.sha256]),
    `Assertion payloads ${file.from}`);
  assert.deepEqual(parameters, records.filter((row) => row.kind === 'parameterization').map((row) => [row.line, row.sha256]),
    `Parameter expressions ${file.from}`);
  assert.deepEqual(directives, records.filter((row) => row.kind === 'directive').map((row) => [row.line, row.sha256, row.marker]),
    `Negative directives/diagnostic markers ${file.from}`);
  const actualCounts = { groups: groups.length, cases: groups.filter((row) => row[4] === 'case').length,
    assertionCallSites: assertions.length, parameterizations: parameters.length, directives: directives.length };
  assert.deepEqual(actualCounts, file.staticCounts, `Static totals ${file.from}`);
  counts.files++;
  counts.groups += groups.length;
  counts.staticCases += actualCounts.cases;
  counts.assertionCallSites += assertions.length;
  counts.parameterizations += parameters.length;
  counts.directives += directives.length;
}
const runtimeIds = new Set(), titleOccurrences = new Map(), runtimePerFile = new Map();
for (const [fileId, id, title, line, column, occurrence, status] of cases) {
  const file = ledger.files.find((row) => row.id === fileId);
  assert(file && file.kind === 'runnable', `Unknown runtime file ${fileId}`);
  assert.equal(status, 'passed');
  const key = JSON.stringify([fileId, title]);
  const expectedOccurrence = (titleOccurrences.get(key) ?? 0) + 1;
  assert.equal(occurrence, expectedOccurrence, 'Duplicate-title occurrence must be collision-safe');
  titleOccurrences.set(key, occurrence);
  assert.equal(id, hash(JSON.stringify([file.from, title, line, column, occurrence])), `Case ID ${file.from}`);
  assert(!runtimeIds.has(id), `Case-ID collision ${id}`);
  runtimeIds.add(id);
  runtimePerFile.set(fileId, (runtimePerFile.get(fileId) ?? 0) + 1);
}
const layers = { contracts: 0, invariants: 0, internal: 0 }, layerCases = { contracts: 0, invariants: 0, internal: 0 };
for (const file of ledger.files.filter((row) => row.kind === 'runnable')) {
  assert.equal(runtimePerFile.get(file.id), file.baselineCases, `Per-file results ${file.from}`);
  assert(Object.hasOwn(layers, file.layer), `Unknown layer ${file.layer}`);
  layers[file.layer]++;
  layerCases[file.layer] += file.baselineCases;
}
assert.deepEqual(layers, ledger.layers);
assert.deepEqual(layerCases, ledger.runtimeCounts);
assert.equal(runtimeIds.size, identity.baselineResult.tests);
assert.equal(runtimePerFile.size, identity.baselineResult.files);
assert.equal(titleOccurrences.size, identity.baselineResult.uniqueFileFullTitles);
assert.deepEqual([...runtimePerFile.keys()].map((id) => ledger.files.find((row) => row.id === id).from).sort(), identity.discovery.files);
const callers = readJson('support-callers.json');
assert.equal(callers.files.length, 37);
assert.equal(callers.stableExceptions.length, 3);
for (const file of callers.files) {
  assert(fileIds.has(file.file));
  for (const caller of file.callers) {
    const lines = readInput(caller.file).toString('utf8').split('\n');
    assert(caller.line > 0 && caller.line <= lines.length, `Caller location ${caller.file}:${caller.line}`);
  }
}
if (args.has('--declarations')) {
  const expected = readJson('declarations.json').inventory;
  const dist = path.join(root, 'packages/access-router/dist');
  const names = fs.readdirSync(dist).filter((file) => /\.d\.(?:ts|mts)$/.test(file)).sort();
  assert.deepEqual(names, expected.map((file) => path.basename(file.path)).sort(), 'Complete declaration file inventory');
  for (const file of expected) assert.equal(hash(fs.readFileSync(path.join(root, file.path))), file.sha256, `Declaration ${file.path}`);
}
const manifestPath = path.join(directory, 'bundle-manifest.json');
if (fs.existsSync(manifestPath)) {
  for (const file of readJson('bundle-manifest.json').files)
    assert.equal(hash(fs.readFileSync(path.join(directory, file.path))), file.sha256, `Bundle integrity ${file.path}`);
}
console.log(JSON.stringify({ result: 'passed', mode: args.has('--git-baseline') ? 'recorded Git baseline' : 'unchanged working-tree baseline',
  protectedFiles: identity.files.length, ...counts, runtimeFiles: runtimePerFile.size, runtimeCases: cases.length,
  layers, layerCases, supportFiles: callers.files.length, declarationsChecked: args.has('--declarations') }, null, 2));
