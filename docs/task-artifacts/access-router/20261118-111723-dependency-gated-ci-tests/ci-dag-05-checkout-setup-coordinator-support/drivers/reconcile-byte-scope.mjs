import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Prepared separately while setup runs. Invoke only after its delivery and idle
// notification, with this explicit confirmation. Never execute product/tests,
// import implementer modules, materialize source, or touch project Git refs.
assert.deepEqual(process.argv.slice(2), ['--setup-idle-delivery']);
const owner = '_tmp-c5f-ovtrnV';
const scratch = mkdtempSync(`${owner}/setup-stage2-reconcile-`);
const root = realpathSync('.');
const env = { ...process.env, TMPDIR: resolve(scratch), NODE_COMPILE_CACHE: resolve(scratch, 'node-compile-cache') };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFileSync(path);
const fingerprint = (path) => {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${path}: expected regular file`);
  const bytes = read(path);
  return { mode: `0${(stat.mode & 0o777).toString(8)}`, bytes: bytes.length, sha256: sha256(bytes) };
};
let invocation = 0;
const git = (args, expectedStatus = 0) => {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync('git', ['--no-optional-locks', ...args], { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const prefix = `${scratch}/command-${String(++invocation).padStart(3, '0')}`;
  const stdout = (result.stdout ?? '').replaceAll(root, '<repo-root>');
  const stderr = (result.stderr ?? '').replaceAll(root, '<repo-root>');
  writeFileSync(`${prefix}.stdout.log`, stdout, { flag: 'wx' });
  writeFileSync(`${prefix}.stderr.log`, stderr, { flag: 'wx' });
  writeFileSync(`${prefix}.json`, JSON.stringify({ command: ['git', '--no-optional-locks', ...args], cwd: '.', tmpdir: scratch, startedAt, durationMs: Date.now() - started, exitCode: result.status, signal: result.signal }, null, 2) + '\n', { flag: 'wx' });
  assert.equal(result.status, expectedStatus, stdout + stderr);
  return result.stdout;
};
git(['check-ignore', scratch]);
const baselinePath = `${owner}/setup-stage2-oLp7U1/baseline.json`;
assert.equal(fingerprint(baselinePath).sha256, 'ed5906c0c6c97b52055bcb9edae0c93120bd379446b7a33b8e2b5ff8fd164c45');
const baseline = JSON.parse(read(baselinePath));
assert.equal(baseline.protectedRegularFiles, 2582);
assert.equal(Object.keys(baseline.files).length, 2582);
assert.equal(baseline.allowedMaintainedPaths.length, 12);
const amendmentPath = 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-checkout-setup-contract-amendment.json';
assert.equal(fingerprint(amendmentPath).sha256, '899234ecfcead72ac7cf4cfa6b32fdc77f90348afbf7dbfce30ef9b56111ea07');
const amendment = JSON.parse(read(amendmentPath));
assert.equal(amendment.originalMaintainedScopeCount, 12);
assert.equal(amendment.amendedMaintainedScopeCount, 13);
assert.deepEqual(baseline.files[amendment.addedMaintainedPath], amendment.protectedPreAmendmentFingerprint);
assert.deepEqual(fingerprint(amendment.historicalSnapshot.path), amendment.protectedPreAmendmentFingerprint, 'Original R1 test preimage snapshot remains unchanged');
const coordinatorDeltasPath = `${owner}/setup-scope-check-vLNj13/coordinator-deltas.json`;
assert.equal(fingerprint(coordinatorDeltasPath).sha256, '4c24f3a6fc7a32b88ff405f8096b4ca9b0ed680c3f0a09aaeb6a03b88f5357e1');
const coordinatorDeltas = JSON.parse(read(coordinatorDeltasPath));
const coordinatorChangedPaths = Object.keys(coordinatorDeltas.coordinatorChangedDocuments).sort();
assert.equal(coordinatorChangedPaths.length, 4);
for (const [path, expected] of Object.entries(coordinatorDeltas.coordinatorChangedDocuments)) {
  assert.deepEqual(fingerprint(path), expected, `${path}: documented coordinator-only amendment delta, outside agent ownership`);
}
assert.deepEqual(fingerprint(amendmentPath), {
  mode: coordinatorDeltas.coordinatorAddedAmendment.mode,
  bytes: coordinatorDeltas.coordinatorAddedAmendment.bytes,
  sha256: coordinatorDeltas.coordinatorAddedAmendment.sha256,
});
const amendedMaintainedPaths = [...baseline.allowedMaintainedPaths, amendment.addedMaintainedPath];
assert.equal(new Set(amendedMaintainedPaths).size, 13);
const sourceReferencesPath = `${owner}/setup-source-refs-6Sukt7/source-references.json`;
const sourceReferences = JSON.parse(read(sourceReferencesPath));
assert.equal(sourceReferences.baselineSha256, fingerprint(baselinePath).sha256);
assert.equal(sourceReferences.exactHistoricalPreimages, 8);
for (const [path, source] of Object.entries(sourceReferences.sources)) {
  assert.deepEqual(fingerprint(source.originalPath), baseline.files[path], `${path}: exact historical preimage remains unchanged`);
}
const head = git(['rev-parse', 'HEAD']).trim();
assert.equal(head, baseline.head, 'No project commit was authorized');
const projectRefsSha256 = sha256(git(['for-each-ref', '--format=%(objectname) %(refname)']));
assert.equal(projectRefsSha256, baseline.projectRefsSha256, 'No project ref change was authorized');
const paths = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();
const current = Object.fromEntries(paths.map((path) => [path, fingerprint(path)]));
const changed = [];
for (const [path, before] of Object.entries(baseline.files)) {
  assert(Object.hasOwn(current, path), `${path}: protected files must not be removed`);
  assert.equal(current[path].mode, before.mode, `${path}: original file mode remains unchanged`);
  if (current[path].sha256 !== before.sha256 || current[path].bytes !== before.bytes) changed.push(path);
}
changed.sort();
const added = paths.filter((path) => !Object.hasOwn(baseline.files, path));
const owned = new Set(amendedMaintainedPaths);
const expectedChanged = amendedMaintainedPaths.filter((path) => Object.hasOwn(baseline.files, path)).sort();
const expectedNewMaintained = amendedMaintainedPaths.filter((path) => !Object.hasOwn(baseline.files, path)).sort();
assert.equal(expectedChanged.length, 10);
assert.equal(expectedNewMaintained.length, 3);
assert.deepEqual(changed, [...expectedChanged, ...coordinatorChangedPaths].sort(), 'Complete delivery changes exactly ten maintained paths plus the four documented coordinator-only deltas');
assert.deepEqual(fingerprint(amendment.addedMaintainedPath), amendment.exactExpectedPostAmendmentFingerprint, 'Thirteenth maintained path has only the exact authorized source-list addition');
assert.deepEqual(added.filter((path) => owned.has(path)), expectedNewMaintained, 'Complete delivery adds exactly the confirmed three new maintained paths');
for (const path of added) {
  assert(owned.has(path) || path === baseline.allowedNewEvidenceFile || path.startsWith(baseline.allowedNewEvidencePrefix) || path === amendmentPath, `${path}: unauthorized addition`);
  assert.equal(current[path].mode, '0644', `${path}: new non-executable maintained/evidence mode`);
  git(['check-ignore', path], 1);
}
assert(Object.hasOwn(current, baseline.allowedNewEvidenceFile), 'Setup delivery report must exist');
const evidenceAdded = added.filter((path) => !owned.has(path) && path !== amendmentPath);
assert(evidenceAdded.some((path) => path.startsWith(baseline.allowedNewEvidencePrefix)), 'Curated setup support must exist');
for (const [path, expected] of Object.entries(baseline.historicalInputsAndSeals)) {
  assert.deepEqual(fingerprint(path), expected, `${path}: original stage-1/historical seal must remain unchanged`);
}
assert.deepEqual(fingerprint(baseline.confirmationDocumentCheck.path), {
  mode: baseline.confirmationDocumentCheck.mode,
  bytes: baseline.confirmationDocumentCheck.bytes,
  sha256: baseline.confirmationDocumentCheck.sha256,
}, 'Pre-continuation coordinator confirmation JSON remains unchanged');

const workflowSource = read('.github/workflows/test.yml').toString('utf8');
for (const [job, expected] of Object.entries(baseline.independentJobBlocks)) {
  const start = workflowSource.indexOf(`\n  ${job}:\n`);
  assert(start >= 0, `${job}: preserved independent block`);
  const tail = workflowSource.slice(start + 1);
  const next = tail.slice(1).search(/\n  [a-z][a-z0-9-]*:\n/);
  const source = next < 0 ? tail : tail.slice(0, next + 1);
  assert.equal(source, expected.source, `${job}: independent raw job block remains byte-exact`);
}
const originalWorkflow = read(sourceReferences.sources['.github/workflows/test.yml'].originalPath).toString('utf8');
const rawJobs = (source) => {
  assert(source.includes('\njobs:\n'), 'Expected explicit top-level jobs mapping');
  return [...source.split('\njobs:\n')[1].matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map(([, job]) => job);
};
assert.deepEqual(rawJobs(workflowSource), rawJobs(originalWorkflow), 'Workflow retains all 31 original job IDs and order');
assert.equal(rawJobs(workflowSource).length, 31);
assert.equal(rawJobs(workflowSource).filter((job) => job.startsWith('test-')).length, 25);
assert.equal(workflowSource.split('\njobs:\n')[0], originalWorkflow.split('\njobs:\n')[0], 'Triggers and all top-level workflow metadata are unchanged');
const manifest = JSON.parse(read('package.json'));
const expectedManifest = structuredClone(baseline.originalRootManifest);
expectedManifest.scripts['test:ci:check'] = baseline.expectedRootValidationScript;
assert.deepEqual(manifest, expectedManifest, 'Root manifest changes only the exact new serial checkout-test filename');

const graphSource = read('scripts/ci-test-plan.mjs').toString('utf8');
const originalGraphSource = read(sourceReferences.sources['scripts/ci-test-plan.mjs'].originalPath).toString('utf8');
const graphBoundary = 'export const ciActions = {';
assert(graphSource.includes(graphBoundary) && originalGraphSource.includes(graphBoundary));
assert.equal(graphSource.split(graphBoundary)[0], originalGraphSource.split(graphBoundary)[0], 'Declared graph, build/test dependency model and eligibility policy remain byte-exact');
const resultsSource = read('scripts/ci-test-results.test.mjs').toString('utf8');
const originalResultsSource = read(sourceReferences.sources['scripts/ci-test-results.test.mjs'].originalPath).toString('utf8');
const resultWiringBoundary = "test('checked-in workflow is accepted only with generated jobs and exact evaluator wiring', () => {";
const resultIndependentBoundary = "  for (const id of ['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node']) {";
assert(resultsSource.includes(resultWiringBoundary) && resultsSource.includes(resultIndependentBoundary));
assert.equal(resultsSource.split(resultWiringBoundary)[0], originalResultsSource.split(resultWiringBoundary)[0], 'All prior evaluator/result negative tests remain byte-exact');
assert.equal(resultsSource.split(resultIndependentBoundary)[1], originalResultsSource.split(resultIndependentBoundary)[1], 'Independent-lane and negative result assertions remain byte-exact');

const protectedAfter = Object.fromEntries(paths.map((path) => [path, fingerprint(path)]));
assert.deepEqual(protectedAfter, current, 'Delivery reconciliation makes no tracked or unignored content/mode changes');
const result = {
  checkedAt: new Date().toISOString(),
  verdict: 'Setup bytes and ownership reconciled after idle delivery; behavior, independent acceptance, bootstrap/runtime and hosted rollout are separate checks',
  ownerAlias: 'CI-DAG-05 remediation coordinator',
  scratch,
  scope: 'Saved-byte and contract-prefix reconciliation only; no module import, test/build/resource/source-materialization/runtime/hosted/publication execution',
  baseline: { path: baselinePath, ...fingerprint(baselinePath), capturedAt: baseline.capturedAt, protectedRegularFiles: baseline.protectedRegularFiles },
  narrowSourceListAmendment: { path: amendmentPath, ...fingerprint(amendmentPath), previousR1TestFingerprint: amendment.protectedPreAmendmentFingerprint, exactAmendedR1TestFingerprint: amendment.exactExpectedPostAmendmentFingerprint, historicalPreimage: amendment.historicalSnapshot },
  coordinatorOnlyDeltas: { path: coordinatorDeltasPath, ...fingerprint(coordinatorDeltasPath), checkedAt: coordinatorDeltas.checkedAt, changedDocuments: coordinatorDeltas.coordinatorChangedDocuments, addedAmendment: coordinatorDeltas.coordinatorAddedAmendment },
  sourceReferences: { path: sourceReferencesPath, ...fingerprint(sourceReferencesPath), exactHistoricalPreimages: sourceReferences.exactHistoricalPreimages, originals: sourceReferences.sources },
  head,
  projectRefsSha256,
  protectedScope: {
    protectedOriginals: 2582,
    unchangedOriginals: 2582 - changed.length,
    changedOriginals: changed,
    maintainedChangedOriginals: expectedChanged,
    separatelyRecordedCoordinatorChangedOriginals: coordinatorChangedPaths,
    newMaintainedPaths: expectedNewMaintained,
    newEvidencePaths: evidenceAdded,
    currentRegularFiles: paths.length,
    originalFileModesUnchanged: true,
    originalStage1InputsAndHistoricalSealsMatched: Object.keys(baseline.historicalInputsAndSeals).length,
    allInheritedR1GuardsAndR2OtherBytesUnchanged: true,
    exactOneLineR1TestAmendmentOnly: true,
    originalIndependentJobBlocks: Object.fromEntries(Object.entries(baseline.independentJobBlocks).map(([job, { source: _source, ...expected }]) => [job, expected])),
    all31JobIdsAndOrderUnchanged: true,
    completePackageJobs: 25,
    topLevelWorkflowMetadataUnchanged: true,
    exactRootValidationFilenameOnly: true,
    dependencyAndEligibilityModelPrefixUnchanged: true,
    protectedEvaluatorNegativeTestsUnchanged: true,
    allCurrentBytesAndModesUnchangedByReconciliation: true,
  },
  deliveryFingerprints: Object.fromEntries([...expectedChanged, ...expectedNewMaintained, ...evidenceAdded].map((path) => [path, current[path]])),
  retainedBlockers: [
    'Independent R1 and setup corrective acceptance remain outstanding; source/bootstrap fixture success is not native selector or actual runner/post-action evidence',
    'Original R2 retry-preparation cause, focused Node abort failure and observer timing neutrality remain undisposed; the sole complete-package allowance is spent and packed-consumer verification is incomplete',
    'R3 authorized live healthy/fault/preparation/validation/cancellation/missing/skipped-result evidence, scheduling/artifacts/required-check, timing/quota/billing and maintainer rollout decisions remain unavailable',
  ],
  noTestsBuildResourcesSourceOperationsHostedOrRepositoryPublication: true,
  coordinatorDriver: { path: `${owner}/reconcile-setup-stage2.mjs`, ...fingerprint(`${owner}/reconcile-setup-stage2.mjs`) },
  limitation: 'No independent review or recertification of saved verification is claimed. Narrow owned result-test/metadata changes, archive/source fingerprints and exact saved commands still require inspection before reviewer assignment.',
};
const outputPath = `${scratch}/coordinator-reconciliation.json`;
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ resultPath: outputPath, ...fingerprint(outputPath), checkedAt: result.checkedAt, protectedScope: result.protectedScope, verdict: result.verdict }, null, 2));
