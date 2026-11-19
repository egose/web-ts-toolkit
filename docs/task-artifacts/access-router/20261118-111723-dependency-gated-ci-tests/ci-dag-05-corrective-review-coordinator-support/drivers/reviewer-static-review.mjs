// Reviewer-owned static comparison. Never imports product code or historical drivers.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { parseDocument } from 'yaml';

const bundle = 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests';
const scratch = '_tmp-c5cr-5m91q69w';
const snapshot = JSON.parse(readFileSync(`${bundle}/ci-dag-05-corrective-review-inputs.json`, 'utf8'));
const r2baseline = JSON.parse(readFileSync('_tmp-ci-dag-05-r2-J2LqEF/preflight.json', 'utf8'));
const setupBaseline = JSON.parse(readFileSync('_tmp-c5-setup-stage2-oNPuwiq6/preflight.json', 'utf8'));
const problems = [];
let checks = 0;
const require = (condition, label) => {
  checks += 1;
  if (!condition) problems.push(label);
};
const sha = (data) => createHash('sha256').update(data).digest('hex');
const fingerprint = (path) => {
  const stat = lstatSync(path);
  require(stat.isFile() && !stat.isSymbolicLink(), `Regular static input: ${path}`);
  const bytes = readFileSync(path);
  return { path, mode: (stat.mode & 0o7777).toString(8).padStart(4, '0'), bytes: bytes.length, sha256: sha(bytes) };
};
const parse = (path) => {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true,
    path.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  require(source.parseDiagnostics.length === 0, `TypeScript parser diagnostics: ${path}`);
  return source;
};
// Structural syntax, ignoring source ranges/comments/trailing commas. Retain literal,
// operator and optional-chain information; this is not the implementer's printer audit.
const shape = (node) => {
  if (!node) return null;
  const children = [];
  ts.forEachChild(node, (child) => { children.push(shape(child)); });
  return [node.kind, typeof node.text === 'string' ? node.text : null,
    typeof node.operator === 'number' ? node.operator : null,
    Boolean(node.flags & ts.NodeFlags.OptionalChain), children];
};
const canonical = (node) => JSON.stringify(shape(node));
const rootIdentifier = (node) => {
  while (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    node = node.expression;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
};
const assertions = (source) => {
  const result = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && rootIdentifier(node) === 'expect') {
      const parent = node.parent;
      const continued = (ts.isCallExpression(parent) || ts.isPropertyAccessExpression(parent)
        || ts.isElementAccessExpression(parent)) && parent.expression === node;
      if (!continued) result.push({ syntax: canonical(node), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
};
const initializer = (source, name) => {
  const nodes = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) nodes.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source);
  require(nodes.length === 1, `Exactly one ${name} initializer`);
  return canonical(nodes[0]);
};

const r2paths = Object.keys(snapshot.reviewedMaintainedFingerprints).filter((path) => path.startsWith('packages/express-request-attestation/'));
require(r2paths.length === 8, 'All eight R2 maintained files selected');
const r2 = [];
for (const path of r2paths) {
  const current = parse(path);
  const delivered = fingerprint(path);
  require(delivered.sha256 === snapshot.reviewedMaintainedFingerprints[path].sha256, `Delivered R2 hash: ${path}`);
  const after = assertions(current);
  const record = { delivered, parseDiagnostics: current.parseDiagnostics.length, deliveredExpectChains: after.length };
  if (r2baseline.files[path]) {
    const originalPath = join('_tmp-ci-dag-05-r2-J2LqEF/originals', path);
    record.original = fingerprint(originalPath);
    require(record.original.sha256 === r2baseline.files[path].sha256, `Original R2 hash: ${path}`);
    const original = parse(originalPath);
    const before = assertions(original);
    record.originalExpectChains = before.length;
    let cursor = 0;
    record.retainedOrder = [];
    for (const expected of before) {
      while (cursor < after.length && after[cursor].syntax !== expected.syntax) cursor += 1;
      require(cursor < after.length, `R2 original expect-chain retained: ${path}:${expected.line}`);
      if (cursor < after.length) record.retainedOrder.push({ originalLine: expected.line, deliveredLine: after[cursor].line, deliveredOrdinal: cursor + 1 });
      cursor += 1;
    }
    record.originalAssertionsRetainedInOrder = record.retainedOrder.length === before.length;
    record.originalAssertionSyntaxSha256 = sha(JSON.stringify(before.map(({ syntax }) => syntax)));
    if (path.endsWith('/fetch-client.test.ts')) {
      const retainedStatements = current.statements.filter((node) =>
        !(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
          && node.moduleSpecifier.text === './installed-browser-diagnostics.cases.js')
        && !(ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
          && rootIdentifier(node.expression) === 'runInstalledBrowserDiagnosticsTests'));
      record.existingStatementsUnchangedAfterTwoRegistrationAdditions =
        isDeepStrictEqual(original.statements.map(shape), retainedStatements.map(shape));
      require(record.existingStatementsUnchangedAfterTwoRegistrationAdditions, 'Fetch-client original statements retained unchanged');
      require(before.length === 111 && after.length === 111, 'Independent fetch-client assertion counts 111 -> 111');
    }
    if (path.endsWith('/packed-consumer.test.ts')) {
      const oldScenarios = initializer(original, 'browserScenarios');
      const newScenarios = initializer(current, 'browserScenarios');
      record.browserScenarios = { unchanged: oldScenarios === newScenarios, structuralSha256: sha(newScenarios) };
      require(record.browserScenarios.unchanged, 'Packed-consumer existing browserScenarios initializer unchanged');
      require(before.length === 128 && after.length === 184, 'Independent packed-consumer assertion counts 128 -> 184');
    }
  } else record.original = null;
  r2.push(record);
}

const beforeDirectory = '_tmp-c5-setup-stage2-oNPuwiq6/before';
const oldPlanPath = `${beforeDirectory}/scripts/ci-test-plan.mjs`;
const oldPlan = readFileSync(oldPlanPath, 'utf8');
const currentPlan = readFileSync('scripts/ci-test-plan.mjs', 'utf8');
const planBoundary = 'export const ciActions =';
require(oldPlan.indexOf(planBoundary) > 0 && currentPlan.indexOf(planBoundary) > 0, 'Located graph/policy prefix boundary');
const oldPrefix = oldPlan.slice(0, oldPlan.indexOf(planBoundary));
const currentPrefix = currentPlan.slice(0, currentPlan.indexOf(planBoundary));
require(oldPrefix === currentPrefix, 'Dependency discovery/review/eligibility prefix byte-for-byte unchanged');

const resultTestPath = 'scripts/ci-test-results.test.mjs';
const oldResultTestPath = `${beforeDirectory}/${resultTestPath}`;
let amendedResult = readFileSync(oldResultTestPath, 'utf8');
const replacements = [
  ['    assert.equal(job.steps[1].with.workspace, node.workspace);\n',
    "    assert.deepEqual(job.steps[1], { id: 'source', uses: './.github/actions/ci-checkout' });\n    assert.equal(job.steps[2].with.workspace, node.workspace);\n"],
  ["    env: { CI_TEST_NEEDS: '${{ toJSON(needs) }}' },\n",
    "    'working-directory': '${{ steps.source.outputs.root }}',\n    env: { TMPDIR: '${{ steps.source.outputs.tmpdir }}', CI_TEST_NEEDS: '${{ toJSON(needs) }}' },\n"],
];
for (const [before, after] of replacements) {
  require(amendedResult.split(before).length === 2, 'Exactly one approved result-test replacement');
  amendedResult = amendedResult.replace(before, after);
}
require(amendedResult === readFileSync(resultTestPath, 'utf8'), 'Exactly the two approved result-test amendments; all other bytes unchanged');
const evaluator = fingerprint('scripts/ci-test-results.mjs');
require(evaluator.sha256 === setupBaseline.files[evaluator.path].sha256, 'Evaluator source unchanged at setup preflight');

const yaml = (path) => {
  const document = parseDocument(readFileSync(path, 'utf8'), { version: '1.2', strict: true, uniqueKeys: true, merge: false });
  require(document.errors.length === 0 && document.warnings.length === 0, `Strict YAML diagnostics: ${path}`);
  return document.toJS({ maxAliasCount: 0 });
};
const workflowPath = '.github/workflows/test.yml';
const oldWorkflowPath = `${beforeDirectory}/${workflowPath}`;
const oldWorkflow = yaml(oldWorkflowPath);
const workflow = yaml(workflowPath);
const ids = Object.keys(workflow.jobs);
require(ids.length === 31 && isDeepStrictEqual(ids, Object.keys(oldWorkflow.jobs)), 'All 31 job IDs and order unchanged');
const independentIds = ['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node'];
const rawJob = (text, id) => {
  const start = text.indexOf(`\n  ${id}:\n`);
  require(start >= 0, `Located raw workflow block: ${id}`);
  const next = text.slice(start + 1).search(/\n  [A-Za-z0-9_-]+:\n/);
  return next < 0 ? text.slice(start + 1) : text.slice(start + 1, start + 1 + next + 1);
};
const oldWorkflowText = readFileSync(oldWorkflowPath, 'utf8');
const workflowText = readFileSync(workflowPath, 'utf8');
require(oldWorkflowText.split('\njobs:\n')[0] === workflowText.split('\njobs:\n')[0], 'Workflow triggers/header raw bytes unchanged');
for (const id of ids) {
  const { steps: oldSteps, ...oldMetadata } = oldWorkflow.jobs[id];
  const { steps, ...metadata } = workflow.jobs[id];
  require(isDeepStrictEqual(oldMetadata, metadata), `Job metadata/needs/conditions preserved: ${id}`);
  if (independentIds.includes(id)) {
    require(isDeepStrictEqual(oldSteps, steps), `Independent steps preserved: ${id}`);
    require(rawJob(oldWorkflowText, id) === rawJob(workflowText, id), `Independent raw block preserved: ${id}`);
  } else {
    require(isDeepStrictEqual(steps[0], oldSteps[0]), `Original pinned SHA checkout preserved: ${id}`);
    require(isDeepStrictEqual(steps[1], { id: 'source', uses: './.github/actions/ci-checkout' }), `Top-level source action: ${id}`);
  }
}
const aggregate = workflow.jobs['unit-test'];
require(aggregate.needs.length === 27 && new Set(aggregate.needs).size === 27
  && aggregate.if === '${{ always() }}', 'Stable fail-closed aggregate 27 direct needs / always');
const testedManifests = Object.entries(snapshot.files).filter(([path]) => /^(?:packages|apps)\/[^/]+\/package\.json$/.test(path))
  .map(([path, expected]) => ({ path, expected, manifest: JSON.parse(readFileSync(path, 'utf8')) }))
  .filter(({ manifest }) => typeof manifest.scripts?.test === 'string');
require(testedManifests.length === 25, 'All 25 complete workspace scripts selected without executing them');
const packageScripts = testedManifests.map(({ path, expected, manifest }) => {
  const actual = fingerprint(path);
  require(actual.sha256 === expected.sha256 && actual.sha256 === setupBaseline.files[path].sha256
    && actual.sha256 === r2baseline.files[path].sha256, `Complete workspace script/metadata unchanged: ${manifest.name}`);
  const job = `test-${manifest.name.slice(manifest.name.lastIndexOf('/') + 1).replaceAll('.', '-')}`;
  require(aggregate.needs.includes(job), `Complete-script job remains required: ${manifest.name}`);
  return { ...actual, workspace: manifest.name, completeTestScriptSha256: sha(manifest.scripts.test) };
});
const yamlPaths = [workflowPath, '.github/actions/ci-checkout/action.yml', '.github/actions/ci-setup/action.yml',
  '.github/actions/ci-prepare/action.yml', '.github/actions/ci-test/action.yml'];
for (const path of yamlPaths.slice(1)) yaml(path);

const result = {
  reviewAlias: 'CI-DAG-05 fresh corrective-review session',
  checkedAt: new Date().toISOString(),
  command: ['node', `${scratch}/static-review.mjs`, process.argv[2]], cwd: '.',
  runtimeTmpdir: `'<repo-root>/${scratch}'`,
  method: 'Read-only installed TypeScript structural-syntax comparison and strict YAML parsing; no product imports, fixture execution, historical drivers, source materialization, builds, tests or network.',
  runtime: { node: process.versions.node, v8: process.versions.v8, typescript: ts.version },
  result: problems.length ? 'STATIC DISCREPANCIES' : 'PASS', checks, problems,
  r2: { paths: r2, limitations: 'All eight files parsed and five preimages matched. Expect-chain ordered retention and unchanged scenario inputs do not establish surrounding runtime equivalence, timing neutrality or original causality. New controls were not executed by this auditor.' },
  setup: { graphPrefix: { original: fingerprint(oldPlanPath), current: fingerprint('scripts/ci-test-plan.mjs'), unchangedBytes: Buffer.byteLength(currentPrefix), sha256: sha(currentPrefix) },
    resultTest: { original: fingerprint(oldResultTestPath), current: fingerprint(resultTestPath), exactApprovedReplacementCount: 2 }, evaluator,
    workflow: { original: fingerprint(oldWorkflowPath), current: fingerprint(workflowPath), jobs: ids, independentIds,
      aggregateNeeds: aggregate.needs, preservedOriginalCheckoutSteps: 28, strictYamlFiles: yamlPaths }, packageScripts,
    limitations: 'Static metadata/cwd contracts and retained evaluator are not Actions scheduling, installer, actual main/post or positive native short-root execution evidence.' },
};
writeFileSync(process.argv[2], `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ result: result.result, checks, problems,
  r2: r2.map(({ delivered, originalExpectChains, deliveredExpectChains, originalAssertionsRetainedInOrder }) =>
    ({ path: delivered.path, originalExpectChains, deliveredExpectChains, originalAssertionsRetainedInOrder })) }, null, 2));
process.exitCode = problems.length ? 1 : 0;
