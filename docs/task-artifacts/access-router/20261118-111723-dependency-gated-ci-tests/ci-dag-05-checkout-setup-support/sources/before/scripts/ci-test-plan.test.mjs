import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import {
  checkWorkflowFile,
  ciActions,
  createCiTestModel,
  dependencyFields,
  generateWorkflowJobs,
  inspectWorkspaceDependencies,
  isTestEligible,
  jobIdForWorkspace,
  loadWorkspaces,
  mainWorkflowJobs,
  parseCliArgs,
  parseStrictYaml,
  resolveTestWorkspace,
  reviewedTestPlan,
  runCli,
  testSuccessOverrides,
  validateHelperContracts,
  validateWorkflowContract,
} from './ci-test-plan.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const unscoped = ['create-access-router-mongo-starter', 'oidc-vault-dpop-example', 'react-vite'];
const exact = (name) => (unscoped.includes(name) ? name : `@web-ts-toolkit/${name}`);
const short = (name) => name.slice(name.lastIndexOf('/') + 1);
const row = (workspace, dependencies = {}) => ({ workspace, dependencies });
const yaml = (value) => stringify(value, { aliasDuplicateObjects: false, lineWidth: 0 });
const success = { result: 'success' };

function workspace(name, fields = {}, directory = `packages/${short(name)}`) {
  return [
    name,
    { directory, manifest: { name, scripts: { build: 'tsup', test: 'pnpm build && vitest run' }, ...fields } },
  ];
}

let currentWorkspaces;
let currentModel;
const actualWorkspaces = () => (currentWorkspaces ??= loadWorkspaces());
const actualModel = () => (currentModel ??= createCiTestModel(actualWorkspaces()));

function scratch(t) {
  const root = mkdtempSync(resolve(repositoryRoot, '_tmp-ci-test-plan-fixture-'));
  assert.equal(spawnSync('git', ['check-ignore', root], { cwd: repositoryRoot }).status, 0);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, path, contents) {
  const target = resolve(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, contents);
}

// Independently written helper fixtures, not generated from the checker schema.
// The independent fixtures check the CI-DAG-03 helpers; they do not run builds.
function helperFixtures() {
  return {
    [ciActions.setup]: `name: CI setup fixture
runs:
  using: composite
  steps:
    - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
      with:
        node-version-file: .tool-versions
        package-manager-cache: false
    - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1
      with:
        package_json_file: package.json
        run_install: false
        cache: false
    - id: install
      run: pnpm install --frozen-lockfile --ignore-scripts
      shell: bash
    - id: tools
      shell: bash
      run: node scripts/ci-test-workspace.mjs setup
`,
    [ciActions.prepare]: `name: CI preparation fixture
outputs:
  artifact-name:
    value: \${{ steps.prepare.outputs.artifact-name }}
  artifact-digest:
    value: \${{ steps.prepare.outputs.artifact-digest }}
runs:
  using: composite
  steps:
    - uses: ./.github/actions/ci-setup
    - id: prepare
      shell: bash
      run: node scripts/ci-test-artifacts.mjs prepare
    - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
      with:
        name: \${{ steps.prepare.outputs.artifact-name }}
        path: \${{ steps.prepare.outputs.artifact-path }}
        if-no-files-found: error
        compression-level: 0
`,
    [ciActions.test]: `name: CI complete test fixture
inputs:
  workspace:
    description: Exact allowlisted manifest name
    required: true
  artifact-name:
    required: true
  artifact-digest:
    required: true
runs:
  using: composite
  steps:
    - uses: ./.github/actions/ci-setup
    - id: artifacts
      uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093
      with:
        name: \${{ inputs.artifact-name }}
        path: \${{ runner.temp }}/ci-test-artifacts
    - id: restore
      shell: bash
      run: node scripts/ci-test-workspace.mjs restore
      env:
        CI_TEST_WORKSPACE: \${{ inputs.workspace }}
        CI_TEST_ARTIFACT_NAME: \${{ inputs.artifact-name }}
        CI_TEST_ARTIFACT_DIGEST: \${{ inputs.artifact-digest }}
        CI_TEST_ARTIFACT_DIR: \${{ steps.artifacts.outputs.download-path }}
    - id: browser-cache
      if: \${{ steps.restore.outputs.browser == 'true' }}
      uses: actions/cache@5a3ec84eff668545956fd18022155c47e93e2684
      with:
        path: \${{ steps.restore.outputs.browser-path }}
        key: \${{ steps.restore.outputs.browser-key }}
    - id: mongo-cache
      if: \${{ steps.restore.outputs.mongo == 'true' }}
      uses: actions/cache@5a3ec84eff668545956fd18022155c47e93e2684
      with:
        path: |
          \${{ steps.restore.outputs.mongo-path }}
          \${{ steps.restore.outputs.mongo-path }}.md5
        key: \${{ steps.restore.outputs.mongo-key }}
    - id: test
      shell: bash
      run: node scripts/ci-test-workspace.mjs
      env:
        CI_TEST_WORKSPACE: \${{ inputs.workspace }}
        CI_TEST_ARTIFACT_NAME: \${{ inputs.artifact-name }}
        CI_TEST_ARTIFACT_DIGEST: \${{ inputs.artifact-digest }}
        CI_TEST_ARTIFACT_DIR: \${{ steps.artifacts.outputs.download-path }}
        CI_TEST_RESOURCE_DIR: \${{ steps.restore.outputs.resource-directory }}
        CI_TEST_BROWSER_CACHE_HIT: \${{ steps.browser-cache.outputs.cache-hit }}
        CI_TEST_MONGO_CACHE_HIT: \${{ steps.mongo-cache.outputs.cache-hit }}
`,
  };
}

function workflowFixture() {
  return {
    name: 'Contract fixture',
    on: { push: { 'paths-ignore': ['**.md'] }, pull_request: { 'paths-ignore': ['**.md'] } },
    jobs: mainWorkflowJobs(actualModel()),
  };
}

test('pnpm discovery includes apps/custom patterns, excludes root and pnpm exclusions, and is sorted', (t) => {
  const root = scratch(t);
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'ci-plan-fixture', private: true, scripts: { test: 'must-not-run' } }),
  );
  write(root, 'pnpm-workspace.yaml', "packages:\n- lib/*\n- apps/*\n- tools/**\n- '!lib/excluded'\n");
  for (const [path, name, scripts] of [
    ['lib/core', 'core', { test: 'must-not-run' }],
    ['apps/consumer', 'consumer', { test: 'must-not-run' }],
    ['apps/build-only', 'build-only', { build: 'must-not-run' }],
    ['tools/nested/helper', 'helper', { build: 'must-not-run' }],
    ['lib/excluded', 'excluded', { test: 'must-not-run' }],
    ['website', 'website', { test: 'must-not-run' }],
  ])
    write(root, `${path}/package.json`, JSON.stringify({ name, private: true, scripts }));
  const discovered = loadWorkspaces(root, (command, args, options) => {
    assert.equal(command, 'pnpm');
    assert.deepEqual(args, ['-r', 'list', '--depth', '-1', '--json']);
    return spawnSync(command, args, { ...options, env: { ...process.env, TMPDIR: root } });
  });
  assert.deepEqual([...discovered.keys()], ['build-only', 'consumer', 'core', 'helper']);
  assert.equal(discovered.get('consumer').directory, 'apps/consumer');
  createCiTestModel(discovered, [row('consumer'), row('core')], []);
});

test('discovery rejects duplicates, manifest name drift, outside paths, and pnpm failures', (t) => {
  const root = scratch(t);
  write(root, 'a/package.json', JSON.stringify({ name: 'a' }));
  write(root, 'b/package.json', JSON.stringify({ name: 'a' }));
  const a = { name: 'a', path: resolve(root, 'a') };
  const fake = (entries) => () => ({ status: 0, stdout: JSON.stringify(entries) });
  assert.throws(
    () => loadWorkspaces(root, fake([a, { name: 'a', path: resolve(root, 'b') }])),
    /Duplicate workspace name: a/,
  );
  assert.throws(() => loadWorkspaces(root, fake([{ ...a, name: 'changed' }])), /Workspace name mismatch in a/);
  assert.throws(
    () => loadWorkspaces(root, fake([{ name: 'outside', path: resolve(root, '..') }])),
    /outside the checkout/,
  );
  assert.throws(() => loadWorkspaces(root, () => ({ error: new Error('spawn failed') })), /spawn failed/);
  assert.throws(() => loadWorkspaces(root, () => ({ status: 42 })), /exit 42/);
  assert.throws(() => loadWorkspaces(root, () => ({ status: null })), /exit signal/);
  assert.throws(() => loadWorkspaces(root, fake({})), /Expected a pnpm workspace list/);
});

for (const field of dependencyFields) {
  test(`direct test gates and provenance include ${field}, including non-workspace: versions`, () => {
    const workspaces = new Map([
      workspace('base'),
      workspace('child', { [field]: { base: '^1.0.0', external: '^2.0.0' } }),
    ]);
    const model = createCiTestModel(workspaces, [row('base'), row('child', { base: [field] })], []);
    assert.deepEqual(resolveTestWorkspace(model, 'child').needs, ['ci-prepare', 'test-base']);
    assert.deepEqual(model.declaredEdges, [
      {
        workspace: 'child',
        upstream: 'base',
        fields: [field],
        declarations: [{ field, dependency: 'base', specifier: '^1.0.0' }],
      },
    ]);
    workspaces.get('child').manifest[field].missing = 'workspace:*';
    assert.throws(
      () => createCiTestModel(workspaces, [row('base'), row('child', { base: [field] })], []),
      /Unknown workspace dependency missing/,
    );
  });
}

test('deduplicates gates while preserving every declaration, field, alias, and relative workspace reference', () => {
  const workspaces = new Map([
    workspace('@fixture/core', {}, 'lib/core'),
    workspace(
      'consumer',
      {
        dependencies: { '@fixture/core': 'workspace:*' },
        devDependencies: { alias: 'workspace:@fixture/core@*', secondAlias: 'workspace:@fixture/core@^' },
        peerDependencies: { '@fixture/core': '^1.0.0' },
        optionalDependencies: { relative: 'workspace:../../lib/core' },
      },
      'apps/consumer',
    ),
  ]);
  const model = createCiTestModel(
    workspaces,
    [row('@fixture/core'), row('consumer', { '@fixture/core': dependencyFields })],
    [],
  );
  const node = resolveTestWorkspace(model, 'consumer');
  assert.deepEqual(node.needs, ['ci-prepare', 'test-core']);
  assert.equal(model.declaredEdges.length, 1);
  assert.equal(model.declaredEdges[0].declarations.length, 5);
  assert.deepEqual(model.declaredEdges[0].fields, [...dependencyFields].sort());
  workspaces.get('consumer').manifest.devDependencies.alias = 'workspace:@fixture/missing@*';
  assert.throws(() => inspectWorkspaceDependencies(workspaces), /Unknown workspace dependency alias/);
  workspaces.get('consumer').manifest.devDependencies.alias = 'workspace:@fixture/core@*';
  workspaces.get('consumer').manifest.optionalDependencies.relative = 'workspace:../../lib/missing';
  assert.throws(() => inspectWorkspaceDependencies(workspaces), /Unknown workspace dependency relative/);
});

test('unknown workspace: declarations in build-only workspaces are not ignored', () => {
  const workspaces = new Map([
    workspace('a'),
    workspace('build-only', { scripts: { build: 'tsup' }, optionalDependencies: { missing: 'workspace:*' } }),
  ]);
  assert.throws(
    () => createCiTestModel(workspaces, [row('a')], []),
    /Unknown workspace dependency missing.*build-only.optionalDependencies/,
  );
});

test('build-only prerequisites are reviewed build availability, never fabricated or transitively promoted test jobs', () => {
  const workspaces = new Map([
    workspace('tested-base'),
    workspace('fixture', { scripts: { build: 'tsup' }, dependencies: { 'tested-base': 'workspace:*' } }),
    workspace('consumer', { dependencies: { fixture: 'workspace:*' } }),
  ]);
  const plan = [row('tested-base'), row('consumer', { fixture: ['dependencies'] })];
  const model = createCiTestModel(workspaces, plan, []);
  assert.deepEqual(
    model.nodes.map((node) => node.jobId),
    ['test-consumer', 'test-tested-base'],
  );
  assert.deepEqual(resolveTestWorkspace(model, 'consumer').needs, ['ci-prepare']);
  assert.deepEqual(resolveTestWorkspace(model, 'consumer').buildOnlyPrerequisites, ['fixture']);
  assert.deepEqual(model.buildOnlyWorkspaces, ['fixture']);
  assert.equal(model.workspaceDependencies.get('fixture')[0].workspace, 'tested-base');
  assert.equal(
    isTestEligible(model, 'consumer', { 'ci-prepare': success, 'test-tested-base': { result: 'failure' } }),
    true,
  );
  assert.equal(Object.hasOwn(mainWorkflowJobs(model), 'test-fixture'), false);
  assert.equal(mainWorkflowJobs(model)['unit-test'].needs.includes('test-fixture'), false);
  const override = { workspace: 'consumer', upstream: 'fixture', reason: 'invalid fabricated test result' };
  assert.throws(() => createCiTestModel(workspaces, plan, [override]), /Unknown\/stale test-success override/);
  delete workspaces.get('consumer').manifest.dependencies.fixture;
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Review workspace dependencies.*missing \[fixture\]/);
});

test('new tests, removed tests/workspaces, duplicate coverage, and stale reviewed prerequisites require plan review', () => {
  const workspaces = new Map([workspace('a'), workspace('b')]);
  const plan = [row('a'), row('b')];
  assert.throws(() => createCiTestModel(workspaces, [row('a')], []), /coverage: missing \[b\]/);
  assert.throws(() => createCiTestModel(workspaces, [...plan, row('a')], []), /Duplicate CI test coverage: a/);
  assert.throws(
    () => createCiTestModel(workspaces, [...plan, row('unknown')], []),
    /Unknown\/stale tested workspace.*unknown/,
  );
  workspaces.set('new-app', workspace('new-app')[1]);
  assert.throws(() => createCiTestModel(workspaces, plan, []), /coverage: missing \[new-app\]/);
  workspaces.delete('new-app');
  delete workspaces.get('b').manifest.scripts.test;
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Unknown\/stale tested workspace.*b/);
  workspaces.delete('b');
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Unknown\/stale tested workspace.*b/);
  assert.throws(
    () => createCiTestModel(workspaces, [row('a', { removed: ['dependencies'] })], []),
    /Unknown reviewed prerequisite removed/,
  );
});

test('new build-only test scripts and changed dependency targets/fields fail until explicitly reviewed', () => {
  const workspaces = new Map([
    workspace('base'),
    workspace('child', { dependencies: { base: 'workspace:*' } }),
    workspace('fixture', { scripts: { build: 'tsup' } }),
  ]);
  const plan = [row('base'), row('child', { base: ['dependencies'] })];
  createCiTestModel(workspaces, plan, []);
  workspaces.get('fixture').manifest.scripts.test = 'vitest run';
  assert.throws(() => createCiTestModel(workspaces, plan, []), /coverage: missing \[fixture\]/);
  delete workspaces.get('fixture').manifest.scripts.test;
  workspaces.get('child').manifest.devDependencies = workspaces.get('child').manifest.dependencies;
  delete workspaces.get('child').manifest.dependencies;
  assert.throws(
    () => createCiTestModel(workspaces, plan, []),
    /Review dependency provenance.*missing \[dependencies\]; extra \[devDependencies\]/,
  );
  workspaces.get('child').manifest.devDependencies = { fixture: 'workspace:*' };
  assert.throws(
    () => createCiTestModel(workspaces, plan, []),
    /Review workspace dependencies.*missing \[base\]; extra \[fixture\]/,
  );
  const reviewed = createCiTestModel(workspaces, [row('base'), row('child', { fixture: ['devDependencies'] })], []);
  assert.deepEqual(resolveTestWorkspace(reviewed, 'child').needs, ['ci-prepare']);
});

test('rejects unknown/stale/duplicate/undocumented test-success overrides and already-declared overrides', () => {
  const workspaces = new Map([workspace('a'), workspace('b', { dependencies: { a: 'workspace:*' } })]);
  const plan = [row('a'), row('b', { a: ['dependencies'] })];
  const override = { workspace: 'a', upstream: 'b', reason: 'fixture success' };
  for (const edge of [
    { ...override, workspace: 'removed' },
    { ...override, upstream: 'removed' },
  ]) {
    assert.throws(() => createCiTestModel(workspaces, plan, [edge]), /Unknown\/stale test-success override/);
  }
  assert.throws(() => createCiTestModel(workspaces, plan, [override, override]), /Duplicate test-success override/);
  assert.throws(
    () => createCiTestModel(workspaces, plan, [{ workspace: 'b', upstream: 'a', reason: 'redundant' }]),
    /already declared/,
  );
  assert.throws(() => createCiTestModel(workspaces, plan, [{ ...override, reason: '' }]), /documented reason/);
  assert.throws(() => createCiTestModel(workspaces, plan, [{ ...override, reads: ['b'] }]), /documented reason/);
});

test('declared, build-only, and explicit test-success cycles fail with useful paths', () => {
  const workspaces = new Map([workspace('a', { dependencies: { b: 'workspace:*' } }), workspace('b')]);
  const plan = [row('a', { b: ['dependencies'] }), row('b')];
  assert.throws(
    () => createCiTestModel(workspaces, plan, [{ workspace: 'b', upstream: 'a', reason: 'bad reverse fixture gate' }]),
    /CI test-success cycle: a -> b -> a/,
  );
  workspaces.get('b').manifest.optionalDependencies = { a: 'workspace:*' };
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Workspace dependency cycle: a -> b -> a/);
  delete workspaces.get('b').manifest.scripts.test;
  assert.throws(() => createCiTestModel(workspaces, [plan[0]], []), /Workspace dependency cycle: a -> b -> a/);
});

test('job IDs are deterministic, scope/dot collisions fail, and shell-like/filter inputs are rejected', () => {
  assert.equal(jobIdForWorkspace('@fixture/a'), 'test-a');
  assert.equal(jobIdForWorkspace('a.b'), 'test-a-b');
  for (const names of [
    ['@one/a', '@two/a'],
    ['a.b', 'a-b'],
  ]) {
    assert.throws(
      () =>
        createCiTestModel(
          new Map(names.map((name) => workspace(name))),
          names.map((name) => row(name)),
          [],
        ),
      /job-ID collision/,
    );
  }
  for (const name of ['a... --filter b', 'a...', '...a', '@fixture/a...', '.', '..', '../a', 'a;true', 'a test:unit']) {
    assert.throws(() => jobIdForWorkspace(name), /Invalid exact workspace name/);
    assert.throws(() => createCiTestModel(new Map([workspace(name)]), [row(name)], []), /Invalid exact workspace name/);
  }
  for (const name of [
    'access-router',
    '@web-ts-toolkit/access-router...',
    '*',
    '@web-ts-toolkit/access-router test:unit',
  ]) {
    assert.throws(() => resolveTestWorkspace(actualModel(), name), /not allowlisted/);
  }
});

test('invalid manifests, specifiers, test scripts, and reviewed provenance do not silently disappear', () => {
  const workspaces = new Map([workspace('a')]);
  const plan = [row('a')];
  workspaces.get('a').manifest.name = 'other';
  assert.throws(() => createCiTestModel(workspaces, plan, []), /manifest\/key mismatch/);
  workspaces.get('a').manifest.name = 'a';
  workspaces.get('a').manifest.dependencies = [];
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Invalid dependencies/);
  workspaces.get('a').manifest.dependencies = { external: 1 };
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Invalid dependencies specifier/);
  workspaces.get('a').manifest.dependencies = { a: 'workspace:unknown' };
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Unknown workspace dependency/);
  delete workspaces.get('a').manifest.dependencies;
  workspaces.get('a').manifest.scripts.test = true;
  assert.throws(() => createCiTestModel(workspaces, plan, []), /Invalid test script/);
  workspaces.get('a').manifest.scripts.test = 'vitest run';
  workspaces.set('b', workspace('b')[1]);
  for (const fields of [[], ['dependencies', 'dependencies'], ['unsupported']]) {
    assert.throws(
      () => createCiTestModel(workspaces, [row('a', { b: fields }), row('b')], []),
      /Invalid reviewed dependency provenance/,
    );
  }
});

const golden = {
  'access-router': ['express-json-router', 'utils'],
  'access-router-client': ['access-router', 'utils'],
  'access-router-deco': ['access-router'],
  'access-router-react': ['access-router-client'],
  'access-router-runtime': ['access-router', 'express-runtime'],
  'asset-inliner': [],
  'create-access-router-mongo-starter': ['access-router-runtime'],
  'express-json-router': ['express-response-handler', 'http-errors', 'utils'],
  'express-oidc-vault': [],
  'express-oidc-vault-memory-store': ['express-oidc-vault'],
  'express-oidc-vault-mongodb-store': ['express-oidc-vault'],
  'express-oidc-vault-redis-store': ['express-oidc-vault'],
  'express-request-attestation': [],
  'express-response-handler': ['http-errors', 'utils'],
  'express-runtime': [],
  'http-errors': ['utils'],
  'json-frame': [],
  'message-service': ['express-json-router', 'utils'],
  'mongoose-rxdb': [],
  moo: ['utils'],
  'oidc-vault-dpop-client': ['express-oidc-vault'],
  'oidc-vault-dpop-example': ['express-oidc-vault', 'express-oidc-vault-memory-store', 'oidc-vault-dpop-client'],
  'pdf-reader': [],
  'react-vite': ['access-router-client', 'access-router-react'],
  utils: [],
};

test('actual pnpm graph matches all 25 golden rows, 26 declared edges + one fixture, and all-four-field counts', () => {
  const model = actualModel();
  assert.equal(actualWorkspaces().size, 31);
  assert.equal(model.nodes.length, 25);
  assert.equal(model.declaredEdges.length, 26);
  assert.equal(model.overrideEdges.length, 1);
  assert.deepEqual(
    Object.fromEntries(model.nodes.map((node) => [short(node.workspace), node.testPrerequisites.map(short)])),
    golden,
  );
  assert.equal(model.buildWorkspaces.length, 31);
  assert.deepEqual(model.buildOnlyWorkspaces, [
    'access-router-runtime-example',
    'mongoose-rxdb-example',
    'oidc-vault-dpop-angular-example',
    'oidc-vault-dpop-react-example',
    'oidc-vault-dpop-vue-example',
    'org-access-nodejs-example',
  ]);
  const counts = Object.fromEntries(dependencyFields.map((field) => [field, 0]));
  for (const deps of model.workspaceDependencies.values())
    for (const dep of deps) for (const declaration of dep.declarations) counts[declaration.field] += 1;
  assert.deepEqual(counts, { dependencies: 30, devDependencies: 4, peerDependencies: 2, optionalDependencies: 0 });
  for (const name of ['access-router-deco', 'access-router-react']) {
    assert.deepEqual(model.declaredEdges.find((edge) => edge.workspace === exact(name)).fields, [
      'devDependencies',
      'peerDependencies',
    ]);
  }
  for (const node of model.nodes) {
    assert.deepEqual(node.command, ['pnpm', '--filter', node.workspace, 'test']);
    assert.equal(node.testScript, actualWorkspaces().get(node.workspace).manifest.scripts.test);
  }
  assert.equal(resolveTestWorkspace(model, 'react-vite').directory, 'apps/react-vite');
  assert.equal(resolveTestWorkspace(model, 'oidc-vault-dpop-example').directory, 'apps/oidc-vault-dpop-example');
});

test('reverse local fixture accesses are not gates; runtime/starter has no router cycle', () => {
  const model = actualModel();
  assert.deepEqual(resolveTestWorkspace(model, exact('access-router')).testPrerequisites, [
    exact('express-json-router'),
    exact('utils'),
  ]);
  assert.deepEqual(resolveTestWorkspace(model, exact('express-oidc-vault')).testPrerequisites, []);
  assert.deepEqual(model.overrideEdges, testSuccessOverrides);
  assert.deepEqual(resolveTestWorkspace(model, 'create-access-router-mongo-starter').testPrerequisites, [
    exact('access-router-runtime'),
  ]);
  assert.throws(
    () =>
      createCiTestModel(actualWorkspaces(), reviewedTestPlan, [
        ...testSuccessOverrides,
        {
          workspace: exact('access-router'),
          upstream: exact('access-router-runtime'),
          reason: 'incorrect read-as-success override',
        },
      ]),
    /CI test-success cycle: @web-ts-toolkit\/access-router -> @web-ts-toolkit\/access-router-runtime -> @web-ts-toolkit\/access-router/,
  );
});

function simulateFailures(failures) {
  const model = actualModel();
  const results = { 'ci-validate': success, 'ci-prepare': success };
  for (const workspace of model.executionOrder) {
    results[resolveTestWorkspace(model, workspace).jobId] = {
      result: isTestEligible(model, workspace, results)
        ? failures.has(short(workspace))
          ? 'failure'
          : 'success'
        : 'skipped',
    };
  }
  return results;
}

function skipped(results) {
  return actualModel()
    .nodes.filter((node) => results[node.jobId].result === 'skipped')
    .map((node) => short(node.workspace));
}

test('router failure blocks only deco/client/runtime/React/react-vite/starter, not message/OIDC/independent branches', () => {
  const results = simulateFailures(new Set(['access-router']));
  assert.deepEqual(skipped(results), [
    'access-router-client',
    'access-router-deco',
    'access-router-react',
    'access-router-runtime',
    'create-access-router-mongo-starter',
    'react-vite',
  ]);
  for (const name of [
    'message-service',
    'express-oidc-vault',
    'oidc-vault-dpop-example',
    'pdf-reader',
    'asset-inliner',
    'json-frame',
    'mongoose-rxdb',
    'express-request-attestation',
  ]) {
    assert.equal(results[jobIdForWorkspace(exact(name))].result, 'success', name);
  }
});

test('vault failure leaves core/independent jobs running and gates only its stores/client/example', () => {
  const results = simulateFailures(new Set(['express-oidc-vault']));
  assert.deepEqual(skipped(results), [
    'express-oidc-vault-memory-store',
    'express-oidc-vault-mongodb-store',
    'express-oidc-vault-redis-store',
    'oidc-vault-dpop-client',
    'oidc-vault-dpop-example',
  ]);
  for (const name of ['access-router', 'access-router-runtime', 'react-vite', 'message-service', 'pdf-reader'])
    assert.equal(results[jobIdForWorkspace(exact(name))].result, 'success');
});

test('memory and DPoP-client results plus the direct vault gate are all required; sibling stores stay independent', () => {
  const model = actualModel();
  const results = { 'ci-prepare': success, 'test-express-oidc-vault': success };
  for (const missing of ['test-express-oidc-vault-memory-store', 'test-oidc-vault-dpop-client']) {
    const state = {
      ...results,
      'test-express-oidc-vault-memory-store': success,
      'test-oidc-vault-dpop-client': success,
    };
    delete state[missing];
    assert.equal(isTestEligible(model, 'oidc-vault-dpop-example', state), false);
    state[missing] = { result: 'failure' };
    assert.equal(isTestEligible(model, 'oidc-vault-dpop-example', state), false);
    state[missing] = success;
    assert.equal(isTestEligible(model, 'oidc-vault-dpop-example', state), true);
    delete state['test-express-oidc-vault'];
    assert.equal(isTestEligible(model, 'oidc-vault-dpop-example', state), false);
  }
  for (const failure of ['express-oidc-vault-memory-store', 'oidc-vault-dpop-client']) {
    assert.deepEqual(skipped(simulateFailures(new Set([failure]))), ['oidc-vault-dpop-example']);
  }
});

test('client/runtime multi-parent gates are exact and fixture-built router is not blocked by starter/runtime failure', () => {
  assert.deepEqual(skipped(simulateFailures(new Set(['access-router-client']))), ['access-router-react', 'react-vite']);
  assert.deepEqual(skipped(simulateFailures(new Set(['express-runtime']))), [
    'access-router-runtime',
    'create-access-router-mongo-starter',
  ]);
  assert.deepEqual(skipped(simulateFailures(new Set(['access-router-runtime']))), [
    'create-access-router-mongo-starter',
  ]);
  assert.deepEqual(skipped(simulateFailures(new Set(['create-access-router-mongo-starter']))), []);
  const model = actualModel();
  const results = simulateFailures(new Set());
  for (const job of ['test-access-router-client', 'test-access-router-react']) {
    const state = { ...results, [job]: { result: 'cancelled' } };
    assert.equal(isTestEligible(model, 'react-vite', state), false);
  }
  for (const job of ['test-access-router', 'test-express-runtime']) {
    const state = { ...results, [job]: { result: 'failure' } };
    assert.equal(isTestEligible(model, exact('access-router-runtime'), state), false);
  }
});

test('missing/cancelled/skipped/non-success preparation or upstream roots are never eligible', () => {
  const model = actualModel();
  for (const result of [undefined, 'failure', 'cancelled', 'skipped', 'neutral']) {
    const results = result === undefined ? {} : { 'ci-prepare': { result } };
    assert.equal(
      model.nodes.some((node) => isTestEligible(model, node.workspace, results)),
      false,
    );
    const roots = { 'ci-prepare': success, 'test-utils': { result } };
    assert.equal(isTestEligible(model, exact('http-errors'), roots), false);
    assert.equal(isTestEligible(model, exact('express-oidc-vault'), roots), true);
  }
  const inherited = Object.create({ 'ci-prepare': success, 'test-utils': success });
  assert.equal(isTestEligible(model, exact('http-errors'), inherited), false);
});

test('generation is stable across repeated calls and all workspace/plan/dependency/provenance orderings', () => {
  const workspaces = new Map(
    [...actualWorkspaces()].reverse().map(([name, value]) => {
      const copy = structuredClone(value);
      for (const field of dependencyFields)
        if (copy.manifest[field])
          copy.manifest[field] = Object.fromEntries(Object.entries(copy.manifest[field]).reverse());
      return [name, copy];
    }),
  );
  const plan = structuredClone(reviewedTestPlan)
    .reverse()
    .map((item) => ({
      ...item,
      dependencies: Object.fromEntries(
        Object.entries(item.dependencies)
          .reverse()
          .map(([name, fields]) => [name, fields.reverse()]),
      ),
    }));
  const shuffled = createCiTestModel(workspaces, plan, [...testSuccessOverrides].reverse());
  assert.equal(generateWorkflowJobs(shuffled), generateWorkflowJobs(actualModel()));
  assert.equal(generateWorkflowJobs(actualModel()), generateWorkflowJobs(actualModel()));
  const generated = parseStrictYaml(generateWorkflowJobs(actualModel()));
  assert.equal(Object.keys(generated.jobs).length, 28);
  assert.deepEqual(generated.jobs['unit-test'].needs, [
    'ci-validate',
    'ci-prepare',
    ...Object.keys(golden).map((name) => `test-${name}`),
  ]);
  assert.deepEqual(generated.jobs['test-access-router-client'].needs, [
    'ci-prepare',
    'test-access-router',
    'test-utils',
  ]);
  assert.deepEqual(generated.jobs['test-react-vite'].needs, [
    'ci-prepare',
    'test-access-router-client',
    'test-access-router-react',
  ]);
  validateWorkflowContract(generateWorkflowJobs(shuffled), shuffled, helperFixtures());
});

test('workflow contract permits YAML mapping/needs ordering, block-final newlines, step display names, and preserved independent lanes', () => {
  const fixture = workflowFixture();
  fixture.jobs = Object.fromEntries(Object.entries(fixture.jobs).reverse());
  for (const job of Object.values(fixture.jobs)) {
    if (job.needs) job.needs.reverse();
    job.steps.forEach((step, index) => {
      step.name = `Display ${index}`;
      if (step.run) step.run += '\n';
    });
  }
  fixture.jobs['unit-test'].if = 'always()';
  fixture.jobs['ci-prepare'].needs = 'ci-validate';
  fixture.jobs.lint = { 'runs-on': 'ubuntu-24.04', steps: [{ run: 'pnpm lint' }] };
  fixture.jobs['access-router-minimum-node-smoke'] = {
    steps: [{ run: 'pnpm --filter @web-ts-toolkit/access-router... build' }],
  };
  fixture.jobs['access-router-react-minimum-node'] = {
    strategy: { 'fail-fast': false, matrix: { lane: ['supported', 'floating'] } },
    'continue-on-error': "${{ matrix.lane == 'floating' }}",
  };
  validateWorkflowContract(yaml(fixture), actualModel(), helperFixtures());
});

const workflowMutations = [
  [
    'missing tested job',
    (f) => {
      delete f.jobs['test-utils'];
    },
    /Main workflow job coverage.*missing \[test-utils\]/,
  ],
  [
    'extra duplicate test job',
    (f) => {
      f.jobs['test-copy'] = structuredClone(f.jobs['test-utils']);
    },
    /coverage.*extra \[test-copy\]/,
  ],
  [
    'renamed job',
    (f) => {
      f.jobs.renamed = f.jobs['test-utils'];
      delete f.jobs['test-utils'];
    },
    /coverage.*missing \[test-utils\].*extra \[renamed\]/,
  ],
  [
    'wrong exact workspace / duplicate input coverage',
    (f) => {
      f.jobs['test-access-router-deco'].steps[1].with.workspace = exact('access-router');
    },
    /with.workspace: expected/,
  ],
  [
    'missing validation',
    (f) => {
      delete f.jobs['ci-validate'];
    },
    /coverage.*missing \[ci-validate\]/,
  ],
  [
    'missing preparation',
    (f) => {
      delete f.jobs['ci-prepare'];
    },
    /coverage.*missing \[ci-prepare\]/,
  ],
  [
    'missing aggregate',
    (f) => {
      delete f.jobs['unit-test'];
    },
    /coverage.*missing \[unit-test\]/,
  ],
  [
    'preparation missing validation gate',
    (f) => {
      f.jobs['ci-prepare'].needs = [];
    },
    /ci-prepare.needs.*missing \[ci-validate\]/,
  ],
  [
    'preparation extra gate',
    (f) => {
      f.jobs.lint = { steps: [] };
      f.jobs['ci-prepare'].needs.push('lint');
    },
    /ci-prepare.needs.*extra \[lint\]/,
  ],
  [
    'final missing validation gate',
    (f) => {
      f.jobs['unit-test'].needs = f.jobs['unit-test'].needs.filter((id) => id !== 'ci-validate');
    },
    /unit-test.needs.*missing \[ci-validate\]/,
  ],
  [
    'final missing preparation gate',
    (f) => {
      f.jobs['unit-test'].needs = f.jobs['unit-test'].needs.filter((id) => id !== 'ci-prepare');
    },
    /unit-test.needs.*missing \[ci-prepare\]/,
  ],
  [
    'final missing tested result',
    (f) => {
      f.jobs['unit-test'].needs = f.jobs['unit-test'].needs.filter((id) => id !== 'test-utils');
    },
    /unit-test.needs.*missing \[test-utils\]/,
  ],
  [
    'final extra gate',
    (f) => {
      f.jobs.lint = { steps: [] };
      f.jobs['unit-test'].needs.push('lint');
    },
    /unit-test.needs.*extra \[lint\]/,
  ],
  [
    'missing required router gate',
    (f) => {
      f.jobs['test-access-router-client'].needs = ['ci-prepare', 'test-utils'];
    },
    /test-access-router-client.needs.*missing \[test-access-router\]/,
  ],
  [
    'missing redundant declared gate',
    (f) => {
      f.jobs['test-express-json-router'].needs.pop();
    },
    /test-express-json-router.needs.*missing \[test-utils\]/,
  ],
  [
    'extra unrelated gate',
    (f) => {
      f.jobs['test-access-router-deco'].needs.push('test-message-service');
    },
    /test-access-router-deco.needs.*extra \[test-message-service\]/,
  ],
  [
    'missing preparation test gate',
    (f) => {
      f.jobs['test-utils'].needs = [];
    },
    /test-utils.needs.*missing \[ci-prepare\]/,
  ],
  [
    'extra validation test gate',
    (f) => {
      f.jobs['test-utils'].needs.push('ci-validate');
    },
    /test-utils.needs.*extra \[ci-validate\]/,
  ],
  [
    'gate bypass if',
    (f) => {
      f.jobs['test-utils'].if = '${{ always() }}';
    },
    /test-utils keys.*extra \[if\]/,
  ],
  [
    'continue-on-error true',
    (f) => {
      f.jobs['test-utils']['continue-on-error'] = true;
    },
    /extra \[continue-on-error\]/,
  ],
  [
    'continue-on-error expression',
    (f) => {
      f.jobs['ci-prepare']['continue-on-error'] = '${{ true }}';
    },
    /extra \[continue-on-error\]/,
  ],
  [
    'matrix/fail-fast barrier',
    (f) => {
      f.jobs['test-utils'].strategy = { 'fail-fast': true, matrix: { workspace: ['a', 'b'] } };
    },
    /extra \[strategy\]/,
  ],
  [
    'job cancellation semaphore',
    (f) => {
      f.jobs['test-utils'].concurrency = { group: 'test-slots', 'cancel-in-progress': true };
    },
    /extra \[concurrency\]/,
  ],
  [
    'workflow cancellation',
    (f) => {
      f.concurrency = { group: 'tests', 'cancel-in-progress': true };
    },
    /top-level keys: concurrency/,
  ],
  [
    'workflow queue semaphore',
    (f) => {
      f.concurrency = { group: 'tests', 'cancel-in-progress': false };
    },
    /top-level keys: concurrency/,
  ],
  [
    'inherited working directory',
    (f) => {
      f.defaults = { run: { 'working-directory': 'packages/other' } };
    },
    /top-level keys: defaults/,
  ],
  [
    'inherited environment',
    (f) => {
      f.env = { NODE_OPTIONS: '--require bypass.cjs' };
    },
    /top-level keys: env/,
  ],
  [
    'test step condition',
    (f) => {
      f.jobs['test-utils'].steps[1].if = '${{ false }}';
    },
    /steps\[1\] keys.*extra \[if\]/,
  ],
  [
    'test step continue-on-error',
    (f) => {
      f.jobs['test-utils'].steps[1]['continue-on-error'] = true;
    },
    /steps\[1\] keys.*extra \[continue-on-error\]/,
  ],
  [
    'wrong helper',
    (f) => {
      f.jobs['test-utils'].steps[1].uses = './.github/actions/setup-npm';
    },
    /steps\[1\].uses: expected/,
  ],
  [
    'subset command replaces helper',
    (f) => {
      f.jobs['test-utils'].steps[1] = { run: 'pnpm --filter @web-ts-toolkit/utils test:unit' };
    },
    /steps\[1\] keys.*extra \[run\]/,
  ],
  [
    'checkout omitted revision',
    (f) => {
      delete f.jobs['test-utils'].steps[0].with.ref;
    },
    /with keys.*missing \[ref\]/,
  ],
  [
    'wrong checkout revision',
    (f) => {
      f.jobs['ci-prepare'].steps[0].with.ref = '${{ github.event.pull_request.head.sha }}';
    },
    /with.ref: expected/,
  ],
  [
    'unpinned checkout',
    (f) => {
      f.jobs['test-utils'].steps[0].uses = 'actions/checkout@main';
    },
    /steps\[0\].uses: expected/,
  ],
  [
    'missing preparation digest output',
    (f) => {
      delete f.jobs['ci-prepare'].outputs['artifact-digest'];
    },
    /outputs keys.*missing \[artifact-digest\]/,
  ],
  [
    'preparation output mismatch',
    (f) => {
      f.jobs['ci-prepare'].outputs['artifact-name'] = '${{ steps.other.outputs.artifact-name }}';
    },
    /outputs.artifact-name: expected/,
  ],
  [
    'artifact from other job',
    (f) => {
      f.jobs['test-utils'].steps[1].with['artifact-name'] = '${{ needs.lint.outputs.artifact-name }}';
    },
    /with.artifact-name: expected/,
  ],
  [
    'missing artifact digest input',
    (f) => {
      delete f.jobs['test-utils'].steps[1].with['artifact-digest'];
    },
    /with keys.*missing \[artifact-digest\]/,
  ],
  [
    'extra arbitrary test input',
    (f) => {
      f.jobs['test-utils'].steps[1].with.command = 'true';
    },
    /with keys.*extra \[command\]/,
  ],
  [
    'final not always-running',
    (f) => {
      f.jobs['unit-test'].if = '${{ success() }}';
    },
    /unit-test.if: expected/,
  ],
  [
    'final cancelled-only condition',
    (f) => {
      f.jobs['unit-test'].if = '${{ !cancelled() }}';
    },
    /unit-test.if: expected/,
  ],
  [
    'final evaluator omitted',
    (f) => {
      f.jobs['unit-test'].steps.pop();
    },
    /unit-test.steps: expected 3 entries/,
  ],
  [
    'final success shell replacement',
    (f) => {
      f.jobs['unit-test'].steps[2].run = 'echo success';
    },
    /steps\[2\].run: expected/,
  ],
  [
    'final shell-interpolated needs',
    (f) => {
      f.jobs['unit-test'].steps[2].run += " '${{ toJSON(needs) }}'";
    },
    /steps\[2\].run: expected/,
  ],
  [
    'final missing result data',
    (f) => {
      delete f.jobs['unit-test'].steps[2].env.CI_TEST_NEEDS;
    },
    /env keys.*missing \[CI_TEST_NEEDS\]/,
  ],
  [
    'final result-data mismatch',
    (f) => {
      f.jobs['unit-test'].steps[2].env.CI_TEST_NEEDS = '{}';
    },
    /CI_TEST_NEEDS: expected/,
  ],
  [
    'final continue-on-error',
    (f) => {
      f.jobs['unit-test']['continue-on-error'] = true;
    },
    /unit-test keys.*extra \[continue-on-error\]/,
  ],
  [
    'dynamic needs expression',
    (f) => {
      f.jobs['test-utils'].needs = '${{ inputs.jobs }}';
    },
    /needs must be static job IDs/,
  ],
  [
    'duplicate needs',
    (f) => {
      f.jobs['test-access-router-client'].needs.push('test-utils');
    },
    /duplicate needs/,
  ],
  [
    'unknown prerequisite',
    (f) => {
      f.jobs['test-utils'].needs.push('unknown');
    },
    /Unknown Workflow needs prerequisite: unknown/,
  ],
  [
    'actual workflow cycle',
    (f) => {
      f.jobs['test-access-router'].needs.push('test-access-router-runtime');
    },
    /Workflow needs cycle: test-access-router -> test-access-router-runtime -> test-access-router/,
  ],
  [
    'independent lane duplicates main tests',
    (f) => {
      f.jobs.lint = { steps: [structuredClone(f.jobs['test-utils'].steps[1])] };
    },
    /must not duplicate CI workspace test coverage/,
  ],
];

for (const [name, mutate, pattern] of workflowMutations) {
  test(`strict workflow contract rejects ${name}`, () => {
    const fixture = workflowFixture();
    mutate(fixture);
    assert.throws(() => validateWorkflowContract(yaml(fixture), actualModel(), helperFixtures()), pattern);
  });
}

const helperMutations = [
  [
    'missing workspace input',
    ciActions.test,
    (a) => {
      delete a.inputs.workspace;
    },
    /inputs.*missing \[workspace\]/,
  ],
  [
    'workspace input default',
    ciActions.test,
    (a) => {
      a.inputs.workspace.default = exact('utils');
    },
    /inputs.workspace keys.*extra \[default\]/,
  ],
  [
    'optional artifact digest',
    ciActions.test,
    (a) => {
      a.inputs['artifact-digest'].required = false;
    },
    /artifact-digest.required: expected true/,
  ],
  [
    'extra command input',
    ciActions.test,
    (a) => {
      a.inputs.command = { required: true };
    },
    /inputs.*extra \[command\]/,
  ],
  [
    'non-composite helper',
    ciActions.test,
    (a) => {
      a.runs.using = 'node24';
    },
    /expected a nonempty composite action/,
  ],
  [
    'wrong complete-test command',
    ciActions.test,
    (a) => {
      a.runs.steps[5].run = 'pnpm --filter @web-ts-toolkit/utils test:unit';
    },
    /steps\[5\].run: expected/,
  ],
  [
    'dependency-closure test filter',
    ciActions.test,
    (a) => {
      a.runs.steps[5].run = 'pnpm --filter @web-ts-toolkit/utils... test';
    },
    /steps\[5\].run: expected/,
  ],
  [
    'multiple test filters',
    ciActions.test,
    (a) => {
      a.runs.steps[5].run = 'pnpm --filter a --filter b test';
    },
    /steps\[5\].run: expected/,
  ],
  [
    'swallowed runner failure',
    ciActions.test,
    (a) => {
      a.runs.steps[5].run += ' || true';
    },
    /steps\[5\].run: expected/,
  ],
  [
    'workspace environment mismatch',
    ciActions.test,
    (a) => {
      a.runs.steps[5].env.CI_TEST_WORKSPACE = '*';
    },
    /CI_TEST_WORKSPACE: expected/,
  ],
  [
    'digest not forwarded',
    ciActions.test,
    (a) => {
      delete a.runs.steps[5].env.CI_TEST_ARTIFACT_DIGEST;
    },
    /env keys.*missing \[CI_TEST_ARTIFACT_DIGEST\]/,
  ],
  [
    'download directory mismatch',
    ciActions.test,
    (a) => {
      a.runs.steps[5].env.CI_TEST_ARTIFACT_DIR = '.';
    },
    /CI_TEST_ARTIFACT_DIR: expected/,
  ],
  [
    'download artifact-name mismatch',
    ciActions.test,
    (a) => {
      a.runs.steps[1].with.name = 'previous-run';
    },
    /with.name: expected/,
  ],
  [
    'unpinned artifact download',
    ciActions.test,
    (a) => {
      a.runs.steps[1].uses = 'actions/download-artifact@main';
    },
    /steps\[1\].uses: expected/,
  ],
  [
    'old shared setup instead of CI setup',
    ciActions.test,
    (a) => {
      a.runs.steps[0].uses = './.github/actions/setup-npm';
    },
    /steps\[0\].uses: expected/,
  ],
  [
    'conditionally skipped runner',
    ciActions.test,
    (a) => {
      a.runs.steps[5].if = '${{ false }}';
    },
    /steps\[5\] keys.*extra \[if\]/,
  ],
  [
    'ignored runner failure',
    ciActions.test,
    (a) => {
      a.runs.steps[5]['continue-on-error'] = true;
    },
    /steps\[5\] keys.*extra \[continue-on-error\]/,
  ],
  [
    'additional test step',
    ciActions.test,
    (a) => {
      a.runs.steps.push({ shell: 'bash', run: 'pnpm test' });
    },
    /steps: expected 6 entries/,
  ],
  [
    'omitted verified restore',
    ciActions.test,
    (a) => {
      a.runs.steps.splice(2, 1);
    },
    /steps: expected 6 entries/,
  ],
  [
    'restore digest not forwarded',
    ciActions.test,
    (a) => {
      delete a.runs.steps[2].env.CI_TEST_ARTIFACT_DIGEST;
    },
    /env keys.*missing \[CI_TEST_ARTIFACT_DIGEST\]/,
  ],
  [
    'conditionally skipped restore',
    ciActions.test,
    (a) => {
      a.runs.steps[2].if = '${{ false }}';
    },
    /steps\[2\] keys.*extra \[if\]/,
  ],
  [
    'unverified resource directory',
    ciActions.test,
    (a) => {
      a.runs.steps[5].env.CI_TEST_RESOURCE_DIR = '${{ runner.temp }}';
    },
    /CI_TEST_RESOURCE_DIR: expected/,
  ],
  [
    'unconditional browser cache',
    ciActions.test,
    (a) => {
      a.runs.steps[3].if = '${{ always() }}';
    },
    /steps\[3\].if: expected/,
  ],
  [
    'unpinned browser cache',
    ciActions.test,
    (a) => {
      a.runs.steps[3].uses = 'actions/cache@main';
    },
    /steps\[3\].uses: expected/,
  ],
  [
    'browser cache includes dependencies',
    ciActions.test,
    (a) => {
      a.runs.steps[3].with.path = 'node_modules';
    },
    /steps\[3\].with.path: expected/,
  ],
  [
    'browser cache broad fallback',
    ciActions.test,
    (a) => {
      a.runs.steps[3].with['restore-keys'] = 'ci-playwright-';
    },
    /with keys.*extra \[restore-keys\]/,
  ],
  [
    'Mongo cache includes database state',
    ciActions.test,
    (a) => {
      a.runs.steps[4].with.path = '${{ steps.restore.outputs.resource-directory }}';
    },
    /steps\[4\].with.path: expected/,
  ],
  [
    'Mongo cache key omits resolved resource contract',
    ciActions.test,
    (a) => {
      a.runs.steps[4].with.key = 'mongodb';
    },
    /steps\[4\].with.key: expected/,
  ],
  [
    'Mongo cache ignored failure',
    ciActions.test,
    (a) => {
      a.runs.steps[4]['continue-on-error'] = true;
    },
    /steps\[4\] keys.*extra \[continue-on-error\]/,
  ],
  [
    'browser cache hit hardcoded',
    ciActions.test,
    (a) => {
      a.runs.steps[5].env.CI_TEST_BROWSER_CACHE_HIT = 'true';
    },
    /CI_TEST_BROWSER_CACHE_HIT: expected/,
  ],
  [
    'Mongo cache hit hardcoded',
    ciActions.test,
    (a) => {
      a.runs.steps[5].env.CI_TEST_MONGO_CACHE_HIT = 'true';
    },
    /CI_TEST_MONGO_CACHE_HIT: expected/,
  ],
  [
    'missing preparation digest',
    ciActions.prepare,
    (a) => {
      delete a.outputs['artifact-digest'];
    },
    /outputs.*missing \[artifact-digest\]/,
  ],
  [
    'wrong preparation output binding',
    ciActions.prepare,
    (a) => {
      a.outputs['artifact-name'].value = '${{ steps.other.outputs.artifact-name }}';
    },
    /outputs.artifact-name.value: expected/,
  ],
  [
    'subset preparation command',
    ciActions.prepare,
    (a) => {
      a.runs.steps[1].run = 'pnpm --filter @web-ts-toolkit/utils build';
    },
    /steps\[1\].run: expected/,
  ],
  [
    'preparation skip condition',
    ciActions.prepare,
    (a) => {
      a.runs.steps[1].if = '${{ false }}';
    },
    /steps\[1\] keys.*extra \[if\]/,
  ],
  [
    'upload fail-open omission',
    ciActions.prepare,
    (a) => {
      a.runs.steps[2].with['if-no-files-found'] = 'warn';
    },
    /if-no-files-found: expected/,
  ],
  [
    'upload name mismatch',
    ciActions.prepare,
    (a) => {
      a.runs.steps[2].with.name = 'old-build';
    },
    /with.name: expected/,
  ],
  [
    'conditionally skipped upload',
    ciActions.prepare,
    (a) => {
      a.runs.steps[2].if = '${{ false }}';
    },
    /steps\[2\] keys.*extra \[if\]/,
  ],
  [
    'setup non-frozen install',
    ciActions.setup,
    (a) => {
      a.runs.steps[2].run = 'pnpm install --ignore-scripts';
    },
    /steps\[2\].run: expected/,
  ],
  [
    'setup lifecycle-enabled install',
    ciActions.setup,
    (a) => {
      a.runs.steps[2].run = 'pnpm install --frozen-lockfile';
    },
    /steps\[2\].run: expected/,
  ],
  [
    'setup skipped frozen install',
    ciActions.setup,
    (a) => {
      a.runs.steps[2].if = '${{ false }}';
    },
    /steps\[2\] keys.*extra \[if\]/,
  ],
  [
    'setup install in another directory',
    ciActions.setup,
    (a) => {
      a.runs.steps[2]['working-directory'] = 'website';
    },
    /steps\[2\] keys.*extra \[working-directory\]/,
  ],
  [
    'setup ignored failure',
    ciActions.setup,
    (a) => {
      a.runs.steps[0]['continue-on-error'] = true;
    },
    /steps\[0\] keys.*extra \[continue-on-error\]/,
  ],
  [
    'setup duplicate install',
    ciActions.setup,
    (a) => {
      a.runs.steps.push(structuredClone(a.runs.steps[2]));
    },
    /steps: expected 4 entries/,
  ],
  [
    'setup skipped Node selection',
    ciActions.setup,
    (a) => {
      a.runs.steps[0].if = '${{ false }}';
    },
    /steps\[0\] keys.*extra \[if\]/,
  ],
  [
    'setup skipped pnpm selection',
    ciActions.setup,
    (a) => {
      a.runs.steps[1].if = '${{ false }}';
    },
    /steps\[1\] keys.*extra \[if\]/,
  ],
  [
    'setup unpinned Node action',
    ciActions.setup,
    (a) => {
      a.runs.steps[0].uses = 'actions/setup-node@main';
    },
    /steps\[0\].uses: expected/,
  ],
  [
    'setup wrong Node version source',
    ciActions.setup,
    (a) => {
      a.runs.steps[0].with['node-version-file'] = 'website/package.json';
    },
    /node-version-file: expected/,
  ],
  [
    'setup extra Node version override',
    ciActions.setup,
    (a) => {
      a.runs.steps[0].with['node-version'] = '24';
    },
    /with keys.*extra \[node-version\]/,
  ],
  [
    'setup unpinned pnpm action',
    ciActions.setup,
    (a) => {
      a.runs.steps[1].uses = 'pnpm/action-setup@main';
    },
    /steps\[1\].uses: expected/,
  ],
  [
    'setup wrong package-manager source',
    ciActions.setup,
    (a) => {
      a.runs.steps[1].with.package_json_file = 'website/package.json';
    },
    /package_json_file: expected/,
  ],
  [
    'setup extra pnpm version override',
    ciActions.setup,
    (a) => {
      a.runs.steps[1].with.version = '11.24.0';
    },
    /with keys.*extra \[version\]/,
  ],
  [
    'setup implicit extra install',
    ciActions.setup,
    (a) => {
      a.runs.steps[1].with.run_install = true;
    },
    /run_install: expected false/,
  ],
  [
    'setup extra subset/full test command',
    ciActions.setup,
    (a) => {
      a.runs.steps.push({ shell: 'bash', run: 'pnpm test:grouped' });
    },
    /steps: expected 4 entries/,
  ],
  [
    'setup missing subprocess tool probes',
    ciActions.setup,
    (a) => {
      a.runs.steps.pop();
    },
    /steps: expected 4 entries/,
  ],
  [
    'setup skipped subprocess tool probes',
    ciActions.setup,
    (a) => {
      a.runs.steps[3].if = '${{ false }}';
    },
    /steps\[3\] keys.*extra \[if\]/,
  ],
  [
    'setup package-manager enforcement bypass',
    ciActions.setup,
    (a) => {
      a.runs.steps[3].env = { COREPACK_ENABLE_PROJECT_SPEC: '0' };
    },
    /steps\[3\] keys.*extra \[env\]/,
  ],
  [
    'setup injected environment',
    ciActions.setup,
    (a) => {
      a.runs.steps[0].env = { NODE_OPTIONS: '--require bypass.cjs' };
    },
    /steps\[0\] keys.*extra \[env\]/,
  ],
  [
    'setup undeclared input',
    ciActions.setup,
    (a) => {
      a.inputs = { command: { required: true } };
    },
    /inputs.*extra \[command\]/,
  ],
  [
    'setup invalid input mapping',
    ciActions.setup,
    (a) => {
      a.inputs = [];
    },
    /inputs: expected a mapping/,
  ],
  [
    'setup invalid output mapping',
    ciActions.setup,
    (a) => {
      a.outputs = [];
    },
    /outputs: expected a mapping/,
  ],
];

for (const [name, helper, mutate, pattern] of helperMutations) {
  test(`strict referenced helper contract rejects ${name}`, () => {
    const fixtures = helperFixtures();
    const action = parseStrictYaml(fixtures[helper]);
    mutate(action);
    fixtures[helper] = yaml(action);
    assert.throws(() => validateWorkflowContract(yaml(workflowFixture()), actualModel(), fixtures), pattern);
  });
}

test('referenced helpers are mandatory, not an optional drift bypass', () => {
  for (const missing of [ciActions.setup, ciActions.prepare, ciActions.test]) {
    const fixtures = helperFixtures();
    delete fixtures[missing];
    assert.throws(
      () => validateWorkflowContract(yaml(workflowFixture()), actualModel(), fixtures),
      /Missing CI helper contract/,
    );
  }
  assert.throws(() => validateWorkflowContract(yaml(workflowFixture()), actualModel()), /Missing CI helper contract/);
  validateHelperContracts(helperFixtures());
});

for (const [name, source] of [
  ['duplicate root keys', 'jobs: {}\njobs: {}\n'],
  ['duplicate job keys', 'jobs:\n  test-a: {}\n  test-a: {}\n'],
  ['duplicate nested inputs', 'inputs:\n  workspace:\n    required: true\n    required: false\n'],
  ['duplicate run keys', 'run: node test.mjs\nrun: true\n'],
  ['multiple documents', 'jobs: {}\n---\njobs: {}\n'],
  ['unknown tags', 'jobs: !include elsewhere.yml\n'],
  ['aliases', 'a: &job { run: true }\nb: *job\n'],
  ['merges', 'jobs: { <<: { test-a: {} } }\n'],
  ['non-string mapping keys', '1: value\n'],
]) {
  test(`strict YAML parsing rejects ${name}`, () => assert.throws(() => parseStrictYaml(source), /YAML:/));
}

test('YAML 1.2 preserves GitHub on and duplicate keys fail through workflow/helper validators', () => {
  assert.deepEqual(parseStrictYaml('on: { push: {} }\n'), { on: { push: {} } });
  assert.throws(
    () => validateWorkflowContract('jobs: {}\njobs: {}\n', actualModel(), helperFixtures()),
    /Map keys must be unique/,
  );
  const fixtures = helperFixtures();
  fixtures[ciActions.test] = fixtures[ciActions.test].replace('required: true', 'required: true\n    required: false');
  assert.throws(
    () => validateWorkflowContract(yaml(workflowFixture()), actualModel(), fixtures),
    /Map keys must be unique/,
  );
});

test('legacy grouped workflow is rejected without an allow-legacy path', () => {
  const legacy =
    'jobs:\n  unit-test:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: |\n          pnpm build\n          pnpm test:grouped\n';
  assert.throws(
    () => validateWorkflowContract(legacy, actualModel(), helperFixtures()),
    /Main workflow job coverage: missing/,
  );
  assert.throws(() => parseCliArgs(['--check-workflow', 'workflow.yml', '--allow-legacy']), /Usage:/);
});

test('the mandatory CLI mode accepts the checked-in workflow and rejects a legacy workflow file', (t) => {
  const cli = (path) =>
    spawnSync(process.execPath, ['scripts/ci-test-plan.mjs', '--check-workflow', path], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
    });
  const active = cli('.github/workflows/test.yml');
  assert.equal(active.status, 0, active.stderr);
  assert.equal(
    active.stdout,
    'Validated workflow and CI helper contracts: .github/workflows/test.yml (25 tested workspaces).\n',
  );
  assert.equal(active.stderr, '');

  const root = scratch(t);
  write(
    root,
    'legacy.yml',
    'jobs:\n  unit-test:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: |\n          pnpm build\n          pnpm test:grouped\n',
  );
  const legacy = cli(relative(repositoryRoot, resolve(root, 'legacy.yml')));
  assert.equal(legacy.status, 1);
  assert.equal(legacy.stdout, '');
  assert.match(legacy.stderr, /Main workflow job coverage: missing/);
});

test('file checking reads actual referenced helper YAML and fails missing or edited files', (t) => {
  const root = scratch(t);
  write(root, 'workflow.yml', yaml(workflowFixture()));
  assert.throws(() => checkWorkflowFile('workflow.yml', actualModel(), root), /Cannot read CI helper/);
  const fixtures = helperFixtures();
  for (const [path, contents] of Object.entries(fixtures)) write(root, `${path}/action.yml`, contents);
  checkWorkflowFile('workflow.yml', actualModel(), root);
  write(
    root,
    `${ciActions.test}/action.yml`,
    fixtures[ciActions.test].replace('node scripts/ci-test-workspace.mjs', 'echo success'),
  );
  assert.throws(() => checkWorkflowFile('workflow.yml', actualModel(), root), /steps\[2\].run: expected/);
  assert.throws(() => checkWorkflowFile('missing.yml', actualModel(), root), /Cannot read workflow: missing.yml/);
});

test('CLI argument parsing is exclusive and deterministic, including no hidden drift flags', () => {
  assert.deepEqual(parseCliArgs(['--check']), { mode: '--check' });
  assert.deepEqual(parseCliArgs(['--generate']), { mode: '--generate' });
  assert.deepEqual(parseCliArgs(['--check-workflow', '.github/workflows/test.yml']), {
    mode: '--check-workflow',
    path: '.github/workflows/test.yml',
  });
  for (const args of [
    [],
    ['--help'],
    ['--check', '--generate'],
    ['--generate', 'file.yml'],
    ['--check-workflow'],
    ['--check-workflow', '--check'],
    ['--check-workflow', ''],
    ['--check-workflow', 'a', 'b'],
    ['--allow-legacy'],
  ]) {
    assert.throws(
      () => parseCliArgs(args),
      /^Error: Usage: node scripts\/ci-test-plan.mjs --check \| --generate \| --check-workflow <path>$/,
    );
  }
});

test('real CLI check/generate and parsing failures have deterministic output and nonzero errors', () => {
  const cli = (args) =>
    spawnSync(process.execPath, ['scripts/ci-test-plan.mjs', ...args], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
    });
  const checked = cli(['--check']);
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(
    checked.stdout.trim(),
    'Validated CI model: 25 tested workspaces, 26 declared gates + 1 fixture gates, 6 build-only workspaces. Workflow agreement is a separate --check-workflow check.',
  );
  assert.equal(checked.stderr, '');
  const generated = cli(['--generate']);
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(generated.stdout, generateWorkflowJobs(actualModel()));
  const invalid = cli(['--check', '--generate']);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /^Usage:.*\n$/);
  const missing = cli(['--check-workflow', '_tmp-ci-test-plan-missing-workflow.yml']);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.equal(missing.stderr, 'Cannot read workflow: _tmp-ci-test-plan-missing-workflow.yml\n');
});

test('CLI workflow mode succeeds only for an agreeing pnpm model and real helper fixtures; model drift exits nonzero', (t) => {
  const root = scratch(t);
  write(root, 'package.json', JSON.stringify({ name: 'ci-cli-fixture', private: true }));
  write(root, 'pnpm-workspace.yaml', 'packages:\n- members/*\n');
  let index = 0;
  for (const { manifest } of actualWorkspaces().values())
    write(root, `members/workspace-${index++}/package.json`, JSON.stringify(manifest));
  for (const [path, contents] of Object.entries(helperFixtures())) write(root, `${path}/action.yml`, contents);
  write(root, 'workflow.yml', yaml(workflowFixture()));
  const output = [];
  const errors = [];
  const options = { root, log: (line) => output.push(line), error: (line) => errors.push(line) };
  assert.equal(runCli(['--check-workflow', 'workflow.yml'], options), 0);
  assert.deepEqual(output, ['Validated workflow and CI helper contracts: workflow.yml (25 tested workspaces).']);
  assert.deepEqual(errors, []);
  write(
    root,
    'members/new-test/package.json',
    JSON.stringify({ name: 'unreviewed-app', private: true, scripts: { test: 'must-not-run' } }),
  );
  assert.equal(runCli(['--check'], options), 1);
  assert.match(errors[0], /coverage: missing \[unreviewed-app\]/);
});

test('new root check is staged honestly, preserves serial/local group commands, and YAML is a direct pinned dependency', () => {
  const root = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(
    root.scripts['test:ci:check'],
    'node --test --test-concurrency=1 scripts/ci-test-plan.test.mjs scripts/ci-test-artifacts.test.mjs scripts/ci-test-workspace.test.mjs scripts/ci-test-results.test.mjs && node scripts/ci-test-plan.mjs --check && node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml',
  );
  assert.ok(
    root.scripts['test:ci:check'].endsWith('node scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml'),
  );
  assert.doesNotMatch(root.scripts['test:ci:check'], /allow-legacy|--staged|optional/);
  assert.equal(root.scripts.test, 'pnpm -r --if-present --workspace-concurrency=1 test');
  assert.equal(root.scripts['test:grouped'], 'pnpm test:groups:check && node scripts/test-groups.mjs');
  assert.equal(
    root.scripts['test:groups:check'],
    'node --test scripts/test-groups.test.mjs && node scripts/test-groups.mjs --check',
  );
  for (let group = 1; group <= 12; group += 1)
    assert.equal(root.scripts[`test:group:${group}`], `node scripts/test-groups.mjs ${group}`);
  assert.equal(root.devDependencies.yaml, '2.9.0');
  const lock = parseStrictYaml(readFileSync(resolve(repositoryRoot, 'pnpm-lock.yaml'), 'utf8'), 'Lockfile');
  assert.deepEqual(lock.importers['.'].devDependencies.yaml, { specifier: '2.9.0', version: '2.9.0' });
});

test('existing full scripts and package worker/file-serialization safety controls are preserved', () => {
  assert.match(resolveTestWorkspace(actualModel(), exact('message-service')).testScript, /--fileParallelism=false/);
  assert.match(resolveTestWorkspace(actualModel(), exact('moo')).testScript, /--maxWorkers=1/);
  assert.equal(resolveTestWorkspace(actualModel(), 'react-vite').testScript, 'vitest run');
  assert.equal(
    resolveTestWorkspace(actualModel(), exact('express-request-attestation')).testScript,
    'pnpm build && pnpm test:node && pnpm test:redis && pnpm test:mongo && pnpm test:browser && pnpm test:packed-consumer',
  );
  for (const path of [
    'packages/pdf-reader/vitest.browser.config.mts',
    'apps/oidc-vault-dpop-example/vitest.browser.config.ts',
  ]) {
    assert.match(readFileSync(resolve(repositoryRoot, path), 'utf8'), /fileParallelism:\s*false/);
  }
});
