/** Read-only, one-off ARTS-02 evidence verifier; not the ARTS-03 maintained layer gate. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const directory = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(directory, '../../../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const readJson = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
export const jsonLines = (name) => fs.readFileSync(path.join(directory, name), 'utf8').trimEnd().split('\n').map(JSON.parse);
export const gitInput = (name) => execFileSync('git', ['show', `${readJson('identities.json').revision}:${name}`],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

function normalized(node, source) {
  if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken)
    return [ts.SyntaxKind[node.kind], node.getText(source)];
  return [ts.SyntaxKind[node.kind], ...node.getChildren(source).map((child) => normalized(child, source))];
}

/** Every token is hashed, including all literals/templates; nothing is blanket-ignored. */
export function analyze(text, filename) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const digest = (node) => hash(JSON.stringify(normalized(node, source)));
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const groups = [], assertions = [], parameters = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (ts.isCallExpression(node.expression) && /^(it|test|describe)\.(each|for)/.test(node.expression.expression.getText(source)))
        parameters.push([line(node), digest(node.expression)]);
      if (/^(it|test|describe)(\.|\(|$)/.test(expression) && node.arguments.length >= 2
        && (ts.isStringLiteralLike(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0])))
        groups.push([line(node), node.arguments[0].getText(source), digest(node),
          digest(node.arguments[1]), expression.startsWith('describe') ? 'suite' : 'case']);
      if (/^(expect\(|assert\.|expectTypeOf\()/.test(expression)
        && !(/^expect\([^]*\)\./.test(expression) === false && expression === 'expect'))
        assertions.push([line(node), digest(node)]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const directives = text.split('\n').flatMap((value, index) => /@ts-(?:expect-error|ignore|nocheck|check)|^\s*\/\/ reject-next\s*$/.test(value)
    ? [[index + 1, hash(value), value.includes('reject-next') ? 'reject-next' : value.match(/@ts-[\w-]+/)[0]]] : []);
  return {
    ast: digest(source), statements: source.statements.map((node) => [line(node), digest(node)]),
    groups, assertions, parameters, directives,
  };
}

/** Inverse only the exact recorded substrings at exact UTF-16 spans, never a global string rule. */
export function restoreOriginal(text, repairs) {
  let previousOldEnd = 0, previousNewEnd = 0, delta = 0;
  for (const repair of repairs) {
    assert(repair.oldStart >= previousOldEnd && repair.newStart >= previousNewEnd, 'Overlapping repairs');
    assert.equal(repair.newStart, repair.oldStart + delta, 'Repair coordinate delta');
    assert.equal(repair.oldEnd - repair.oldStart, repair.before.length);
    assert.equal(repair.newEnd - repair.newStart, repair.after.length);
    assert.equal(text.slice(repair.newStart, repair.newEnd), repair.after, `Changed repair at ${repair.newStart}`);
    assert(repair.reason && repair.before !== repair.after, 'Every repair needs an exact change and reason');
    delta += repair.after.length - repair.before.length;
    previousOldEnd = repair.oldEnd;
    previousNewEnd = repair.newEnd;
  }
  for (const repair of [...repairs].reverse())
    text = text.slice(0, repair.newStart) + repair.before + text.slice(repair.newEnd);
  return text;
}

export function verify() {
  const identity = readJson('identities.json');
  assert.equal(ts.version, identity.toolchain.typescript);
  const ledger = readJson('migration-ledger.json');
  const rows = jsonLines('arts-02-preservation.jsonl');
  const baseline = jsonLines('preservation-ledger.jsonl');
  const verification = readJson('arts-02-verification.json');
  assert.equal(rows.length, 248);
  assert.equal(new Set(rows.map((row) => row.id)).size, 248);
  const totals = { files: 0, groups: 0, staticCases: 0, assertionCallSites: 0, parameterizations: 0, directives: 0, statements: 0, repairs: 0 };
  const layers = { contracts: 0, invariants: 0, internal: 0 };
  for (const row of rows) {
    const file = ledger.files.find((file) => file.id === row.id);
    assert(file);
    assert.equal(row.from, file.from);
    assert.equal(row.to, file.to);
    const oldText = gitInput(row.from);
    const newText = fs.readFileSync(path.join(root, row.to), 'utf8');
    const restored = restoreOriginal(newText, row.repairs);
    assert.equal(hash(oldText), row.originalSha256);
    assert.equal(row.originalSha256, file.identities.sha256);
    assert.equal(hash(newText), row.relocatedSha256, `Relocated bytes ${row.to}`);
    assert.equal(restored, oldText, `Complete file preservation ${row.to}`);
    for (const repair of row.repairs)
      assert.equal(oldText.slice(repair.oldStart, repair.oldEnd), repair.before, `Original repair ${row.id}`);
    const old = analyze(oldText, row.from), actual = analyze(newText, row.to), canonical = analyze(restored, row.from);
    assert.equal(old.ast, row.originalAstSha256);
    assert.equal(old.ast, file.identities.normalizedAstSha256);
    assert.equal(actual.ast, row.relocatedAstSha256);
    assert.equal(canonical.ast, row.normalizedRelocatedAstSha256);
    assert.deepEqual(canonical, old, `All normalized AST/body/table/setup/assertion tokens ${row.id}`);
    assert.deepEqual(actual.directives, old.directives, `Unchanged raw negative directives/lines ${row.id}`);
    assert.deepEqual(actual.groups.map((group) => [group[0], group[1], group[4]]),
      old.groups.map((group) => [group[0], group[1], group[4]]), `Unchanged group identities ${row.id}`);
    const records = baseline.filter((record) => record.file === row.id);
    assert.equal(hash(JSON.stringify(records)), row.baselinePreservationRecordsSha256);
    const recordedFile = records.find((record) => record.kind === 'file');
    assert.equal(canonical.ast, recordedFile.ast);
    assert.deepEqual(canonical.statements, recordedFile.statements, `Top-level setup/cleanup/tables ${row.id}`);
    assert.deepEqual(canonical.groups, records.filter((record) => record.kind === 'group')
      .map((record) => [record.line, record.title, record.sha256, record.bodySha256, record.declarationKind]));
    assert.deepEqual(canonical.assertions, records.filter((record) => record.kind === 'assertion').map((record) => [record.line, record.sha256]));
    assert.deepEqual(canonical.parameters, records.filter((record) => record.kind === 'parameterization').map((record) => [record.line, record.sha256]));
    assert.deepEqual(canonical.directives, records.filter((record) => record.kind === 'directive').map((record) => [record.line, record.sha256, record.marker]));
    if (row.from !== row.to) assert(!fs.existsSync(path.join(root, row.from)), `Duplicate original ${row.from}`);
    if (['F002', 'F060', 'F190', 'F200'].includes(row.id)) assert.equal(newText, oldText, `Stable/dormant bytes ${row.id}`);
    totals.files++;
    totals.groups += canonical.groups.length;
    totals.staticCases += canonical.groups.filter((group) => group[4] === 'case').length;
    totals.assertionCallSites += canonical.assertions.length;
    totals.parameterizations += canonical.parameters.length;
    totals.directives += canonical.directives.length;
    totals.statements += canonical.statements.length;
    totals.repairs += row.repairs.length;
    if (file.kind === 'runnable') layers[file.layer]++;
  }
  assert.deepEqual(layers, ledger.layers);
  assert.deepEqual(totals, verification.preservation);
  const mapped = new Set(ledger.files.map((file) => file.from));
  for (const file of identity.files.filter((file) => !mapped.has(file.path)))
    assert.equal(hash(fs.readFileSync(path.join(root, file.path))), file.sha256, `Protected non-test input ${file.path}`);
  for (const name of execFileSync('git', ['diff', '--name-only', identity.revision], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean))
    assert(mapped.has(name), `Unexpected tracked change ${name}`);
  const actualFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(name); else actualFiles.push(name);
    }
  }
  walk('packages/access-router/test');
  assert.deepEqual(actualFiles.sort(), rows.map((row) => row.to).sort(), 'Exact delivered test/support tree');
  assert.deepEqual(verification.discovery.files, ledger.files.filter((file) => file.kind === 'runnable').map((file) => file.to).sort());
  for (const file of verification.baselineArtifacts)
    assert.equal(hash(fs.readFileSync(path.join(directory, file.path))), file.sha256, `Frozen ARTS-01 evidence ${file.path}`);
  const expectedDeclarations = readJson('declarations.json').inventory;
  const dist = path.join(root, 'packages/access-router/dist');
  assert.deepEqual(fs.readdirSync(dist).filter((file) => /\.d\.(?:ts|mts)$/.test(file)).sort(), expectedDeclarations.map((file) => path.basename(file.path)).sort());
  for (const file of expectedDeclarations)
    assert.equal(hash(fs.readFileSync(path.join(root, file.path))), file.sha256, `Declaration ${file.path}`);
  const cases = jsonLines('arts-02-focused-cases.jsonl');
  const originalCases = new Map(jsonLines('runtime-cases.jsonl').map((row) => [row[1], row]));
  for (const [id, oldId, title, line, column, occurrence, status] of cases) {
    const original = originalCases.get(oldId);
    assert.deepEqual([id, oldId, title, line, column, occurrence, status], original, 'Focused expanded original case retained');
  }
  assert.equal(cases.length, verification.focused.tests);
  assert.equal(new Set(cases.map((row) => row[1])).size, cases.length);
  assert.equal(new Set(cases.map((row) => row[0])).size, verification.focused.files.length);
  return { result: 'passed', ...totals, layers, supportFiles: 37, protectedNonTestInputs: identity.files.length - mapped.size,
    baselineArtifacts: verification.baselineArtifacts.length, declarations: expectedDeclarations.length,
    focusedFiles: verification.focused.files.length, focusedCases: cases.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Usage: node arts-02-verify-preservation.mjs');
  console.log(JSON.stringify(verify(), null, 2));
}
