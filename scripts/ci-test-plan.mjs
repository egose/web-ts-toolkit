import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAlias, isMap, parseDocument, stringify, visit } from 'yaml';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const sorted = (values) => [...values].sort();
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const entry = (workspace, dependencies = {}) => ({ workspace, dependencies });

// Reviewed coverage AND direct declarations, not a second workspace-discovery
// glob. A new/removed test or changed workspace target/provenance requires review.
// Keep redundant direct edges; build-only declarations belong here too if added.
export const reviewedTestPlan = [
  entry('@web-ts-toolkit/access-router', {
    '@web-ts-toolkit/express-json-router': ['dependencies'],
    '@web-ts-toolkit/utils': ['dependencies'],
  }),
  entry('@web-ts-toolkit/access-router-client', {
    '@web-ts-toolkit/access-router': ['devDependencies'],
    '@web-ts-toolkit/utils': ['dependencies'],
  }),
  entry('@web-ts-toolkit/access-router-deco', {
    '@web-ts-toolkit/access-router': ['devDependencies', 'peerDependencies'],
  }),
  entry('@web-ts-toolkit/access-router-react', {
    '@web-ts-toolkit/access-router-client': ['devDependencies', 'peerDependencies'],
  }),
  entry('@web-ts-toolkit/access-router-runtime', {
    '@web-ts-toolkit/access-router': ['dependencies'],
    '@web-ts-toolkit/express-runtime': ['dependencies'],
  }),
  entry('@web-ts-toolkit/asset-inliner'),
  entry('@web-ts-toolkit/email-service'),
  entry('@web-ts-toolkit/express-json-router', {
    '@web-ts-toolkit/express-response-handler': ['dependencies'],
    '@web-ts-toolkit/http-errors': ['dependencies'],
    '@web-ts-toolkit/utils': ['dependencies'],
  }),
  entry('@web-ts-toolkit/express-oidc-vault'),
  entry('@web-ts-toolkit/express-oidc-vault-memory-store', {
    '@web-ts-toolkit/express-oidc-vault': ['dependencies'],
  }),
  entry('@web-ts-toolkit/express-oidc-vault-mongodb-store', {
    '@web-ts-toolkit/express-oidc-vault': ['dependencies'],
  }),
  entry('@web-ts-toolkit/express-oidc-vault-redis-store', {
    '@web-ts-toolkit/express-oidc-vault': ['dependencies'],
  }),
  entry('@web-ts-toolkit/express-request-attestation'),
  entry('@web-ts-toolkit/express-response-handler', {
    '@web-ts-toolkit/http-errors': ['dependencies'],
    '@web-ts-toolkit/utils': ['dependencies'],
  }),
  entry('@web-ts-toolkit/express-runtime'),
  entry('@web-ts-toolkit/http-errors', { '@web-ts-toolkit/utils': ['dependencies'] }),
  entry('@web-ts-toolkit/json-frame'),
  entry('@web-ts-toolkit/message-service', {
    '@web-ts-toolkit/express-json-router': ['dependencies'],
    '@web-ts-toolkit/utils': ['dependencies'],
  }),
  entry('@web-ts-toolkit/mongoose-rxdb'),
  entry('@web-ts-toolkit/moo', { '@web-ts-toolkit/utils': ['dependencies'] }),
  entry('@web-ts-toolkit/oidc-vault-dpop-client', { '@web-ts-toolkit/express-oidc-vault': ['devDependencies'] }),
  entry('@web-ts-toolkit/pdf-reader'),
  entry('@web-ts-toolkit/utils'),
  entry('create-access-router-mongo-starter'),
  entry('oidc-vault-dpop-example', {
    '@web-ts-toolkit/express-oidc-vault': ['dependencies'],
    '@web-ts-toolkit/express-oidc-vault-memory-store': ['dependencies'],
    '@web-ts-toolkit/oidc-vault-dpop-client': ['dependencies'],
  }),
  entry('react-vite', {
    '@web-ts-toolkit/access-router-client': ['dependencies'],
    '@web-ts-toolkit/access-router-react': ['dependencies'],
  }),
];

// Test SUCCESS overrides only. Never import the local build/read overrides:
// router reads runtime/starter builds and vault builds stores, not their results.
export const testSuccessOverrides = [
  {
    workspace: 'create-access-router-mongo-starter',
    upstream: '@web-ts-toolkit/access-router-runtime',
    reason: 'tests/generated-tooling.test.ts imports runtime dist/index.mjs and executes dist/cli.js under watch',
  },
];

export function loadWorkspaces(root = repositoryRoot, run = spawnSync) {
  const result = run('pnpm', ['-r', 'list', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Unable to list pnpm workspaces: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Unable to list pnpm workspaces (exit ${result.status ?? 'signal'})`);
  const discovered = JSON.parse(result.stdout);
  if (!Array.isArray(discovered)) throw new Error('Expected a pnpm workspace list');
  const workspaces = new Map();
  for (const workspace of discovered) {
    if (!record(workspace) || typeof workspace.path !== 'string') throw new Error('Invalid pnpm workspace entry');
    const directory = relative(resolve(root), resolve(workspace.path)).split(sep).join('/');
    if (!directory) continue; // Root scripts are not a workspace test node.
    if (directory === '..' || directory.startsWith('../') || isAbsolute(directory)) {
      throw new Error('Pnpm discovered a workspace outside the checkout');
    }
    const manifest = JSON.parse(readFileSync(resolve(workspace.path, 'package.json'), 'utf8'));
    if (!manifest.name || manifest.name !== workspace.name) throw new Error(`Workspace name mismatch in ${directory}`);
    if (workspaces.has(manifest.name)) throw new Error(`Duplicate workspace name: ${manifest.name}`);
    workspaces.set(manifest.name, { manifest, directory });
  }
  return new Map(sorted(workspaces.keys()).map((name) => [name, workspaces.get(name)]));
}

export function jobIdForWorkspace(name) {
  if (
    typeof name !== 'string' ||
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) ||
    name.includes('...')
  ) {
    throw new Error(`Invalid exact workspace name: ${name}`);
  }
  return `test-${name.slice(name.lastIndexOf('/') + 1).replaceAll('.', '-')}`;
}

function workspaceTarget(consumer, dependency, specifier, field, workspaces) {
  if (typeof specifier !== 'string') throw new Error(`Invalid ${field} specifier for ${dependency} in ${consumer}`);
  if (!specifier.startsWith('workspace:')) return workspaces.has(dependency) ? dependency : undefined;
  const reference = specifier.slice('workspace:'.length);
  let target;
  if (reference.startsWith('.')) {
    const directory = workspaces.get(consumer).directory;
    if (!directory) throw new Error(`Cannot resolve relative workspace dependency ${dependency} in ${consumer}`);
    const targetDirectory = posix.normalize(posix.join(directory, reference));
    target = [...workspaces].find(([, value]) => value.directory === targetDirectory)?.[0];
  } else {
    // Pnpm also permits aliases, e.g. alias: workspace:@scope/package@*.
    const alias = /^((?:@[^/]+\/)?[^@]+)@.+$/.exec(reference);
    if (!alias && !/^(?:\*|[~^<>=]|\d)/.test(reference)) {
      throw new Error(`Unknown workspace dependency ${dependency} (${specifier}) in ${consumer}.${field}`);
    }
    target = alias?.[1] ?? dependency;
  }
  if (!reference || !workspaces.has(target)) {
    throw new Error(`Unknown workspace dependency ${dependency} (${specifier}) in ${consumer}.${field}`);
  }
  return target;
}

export function inspectWorkspaceDependencies(workspaces) {
  const graph = new Map();
  for (const name of sorted(workspaces.keys())) {
    const value = workspaces.get(name);
    if (!record(value) || !record(value.manifest) || value.manifest.name !== name) {
      throw new Error(`Workspace manifest/key mismatch: ${name}`);
    }
    jobIdForWorkspace(name);
    const dependencies = new Map();
    for (const field of dependencyFields) {
      const declarations = value.manifest[field] ?? {};
      if (!record(declarations)) throw new Error(`Invalid ${field} in ${name}`);
      for (const dependency of sorted(Object.keys(declarations))) {
        const specifier = declarations[dependency];
        const target = workspaceTarget(name, dependency, specifier, field, workspaces);
        if (!target) continue;
        if (!dependencies.has(target)) dependencies.set(target, []);
        dependencies.get(target).push({ field, dependency, specifier });
      }
    }
    graph.set(
      name,
      sorted(dependencies.keys()).map((workspace) => ({
        workspace,
        fields: sorted(new Set(dependencies.get(workspace).map(({ field }) => field))),
        declarations: dependencies.get(workspace),
      })),
    );
  }
  return graph;
}

function assertAcyclic(graph, label) {
  const done = new Set();
  const active = [];
  const order = [];
  const traverse = (name) => {
    const start = active.indexOf(name);
    if (start !== -1) throw new Error(`${label} cycle: ${[...active.slice(start), name].join(' -> ')}`);
    if (done.has(name)) return;
    if (!graph.has(name)) throw new Error(`Unknown ${label} prerequisite: ${name}`);
    active.push(name);
    for (const upstream of sorted(graph.get(name))) traverse(upstream);
    active.pop();
    done.add(name);
    order.push(name);
  };
  for (const name of sorted(graph.keys())) traverse(name);
  return order;
}

function assertSet(actual, expected, label) {
  const missing = sorted(expected.filter((name) => !actual.includes(name)));
  const extra = sorted(actual.filter((name) => !expected.includes(name)));
  if (missing.length || extra.length) {
    throw new Error(`${label}: missing [${missing.join(', ')}]; extra [${extra.join(', ')}]`);
  }
}

export function createCiTestModel(workspaces, plan = reviewedTestPlan, overrides = testSuccessOverrides) {
  const workspaceDependencies = inspectWorkspaceDependencies(workspaces);
  assertAcyclic(
    new Map([...workspaceDependencies].map(([name, deps]) => [name, deps.map((dep) => dep.workspace)])),
    'Workspace dependency',
  );
  const tested = sorted([...workspaces].filter(([, { manifest }]) => manifest.scripts?.test).map(([name]) => name));
  for (const name of tested) {
    if (typeof workspaces.get(name).manifest.scripts.test !== 'string') throw new Error(`Invalid test script: ${name}`);
  }
  if (!Array.isArray(plan) || !plan.length) throw new Error('The reviewed CI test plan must be nonempty');
  const reviewed = new Map();
  for (const row of plan) {
    if (!record(row) || !record(row.dependencies) || typeof row.workspace !== 'string')
      throw new Error('Invalid reviewed CI test row');
    if (reviewed.has(row.workspace)) throw new Error(`Duplicate CI test coverage: ${row.workspace}`);
    if (!tested.includes(row.workspace)) throw new Error(`Unknown/stale tested workspace in CI plan: ${row.workspace}`);
    reviewed.set(row.workspace, row.dependencies);
    for (const [dependency, fields] of Object.entries(row.dependencies)) {
      if (!workspaces.has(dependency))
        throw new Error(`Unknown reviewed prerequisite ${dependency} in ${row.workspace}`);
      if (
        !Array.isArray(fields) ||
        !fields.length ||
        new Set(fields).size !== fields.length ||
        fields.some((field) => !dependencyFields.includes(field))
      ) {
        throw new Error(`Invalid reviewed dependency provenance for ${row.workspace} -> ${dependency}`);
      }
    }
    const actual = Object.fromEntries(
      workspaceDependencies.get(row.workspace).map((dep) => [dep.workspace, dep.fields]),
    );
    assertSet(Object.keys(actual), Object.keys(row.dependencies), `Review workspace dependencies for ${row.workspace}`);
    for (const dependency of sorted(Object.keys(actual))) {
      assertSet(
        actual[dependency],
        row.dependencies[dependency],
        `Review dependency provenance for ${row.workspace} -> ${dependency}`,
      );
    }
  }
  assertSet([...reviewed.keys()], tested, 'CI tested-workspace coverage');
  const fixtureEdges = new Map(tested.map((name) => [name, []]));
  if (!Array.isArray(overrides)) throw new Error('Expected a list of test-success overrides');
  for (const override of overrides) {
    if (
      !record(override) ||
      sorted(Object.keys(override)).join(',') !== 'reason,upstream,workspace' ||
      typeof override.reason !== 'string' ||
      !override.reason.trim()
    ) {
      throw new Error('A test-success override needs workspace, upstream, and a documented reason');
    }
    const { workspace, upstream } = override;
    if (!tested.includes(workspace) || !tested.includes(upstream))
      throw new Error(`Unknown/stale test-success override: ${workspace} -> ${upstream}`);
    if (fixtureEdges.get(workspace).some((edge) => edge.upstream === upstream))
      throw new Error(`Duplicate test-success override: ${workspace} -> ${upstream}`);
    if (workspaceDependencies.get(workspace).some((dep) => dep.workspace === upstream))
      throw new Error(`Stale test-success override already declared: ${workspace} -> ${upstream}`);
    fixtureEdges.get(workspace).push(override);
  }
  const jobIds = new Map();
  const declaredEdges = [];
  const overrideEdges = [];
  const nodes = tested
    .map((workspace) => {
      const jobId = jobIdForWorkspace(workspace);
      if (jobIds.has(jobId)) throw new Error(`CI job-ID collision ${jobId}: ${jobIds.get(jobId)} and ${workspace}`);
      jobIds.set(jobId, workspace);
      const dependencies = workspaceDependencies.get(workspace);
      const declaredTests = dependencies.filter((dep) => tested.includes(dep.workspace));
      for (const dep of declaredTests)
        declaredEdges.push({ workspace, upstream: dep.workspace, fields: dep.fields, declarations: dep.declarations });
      const fixtures = fixtureEdges
        .get(workspace)
        .sort((a, b) => (a.upstream < b.upstream ? -1 : a.upstream > b.upstream ? 1 : 0));
      overrideEdges.push(...fixtures);
      const testPrerequisites = sorted([
        ...declaredTests.map((dep) => dep.workspace),
        ...fixtures.map((dep) => dep.upstream),
      ]);
      return {
        workspace,
        directory: workspaces.get(workspace).directory,
        jobId,
        command: ['pnpm', '--filter', workspace, 'test'],
        testScript: workspaces.get(workspace).manifest.scripts.test,
        declaredDependencies: dependencies,
        buildOnlyPrerequisites: dependencies
          .filter((dep) => !tested.includes(dep.workspace))
          .map((dep) => dep.workspace),
        testPrerequisites,
        needs: ['ci-prepare', ...sorted(testPrerequisites.map(jobIdForWorkspace))],
      };
    })
    .sort((a, b) => (a.jobId < b.jobId ? -1 : 1));
  const executionOrder = assertAcyclic(
    new Map(nodes.map((node) => [node.workspace, node.testPrerequisites])),
    'CI test-success',
  );
  const buildWorkspaces = sorted(
    [...workspaces].filter(([, { manifest }]) => manifest.scripts?.build).map(([name]) => name),
  );
  return {
    nodes,
    declaredEdges,
    overrideEdges,
    workspaceDependencies,
    executionOrder,
    buildWorkspaces,
    buildOnlyWorkspaces: buildWorkspaces.filter((name) => !tested.includes(name)),
  };
}

// CI-DAG-03's runner must resolve this allowlist and spawn command as argv,
// never interpolate the action's workspace input into a shell test command.
export function resolveTestWorkspace(model, workspace) {
  const node = model.nodes.find((candidate) => candidate.workspace === workspace);
  if (!node) throw new Error(`Workspace is not allowlisted for CI tests: ${workspace}`);
  return node;
}

export function isTestEligible(model, workspace, results) {
  return resolveTestWorkspace(model, workspace).needs.every(
    (job) => Object.hasOwn(results, job) && results[job]?.result === 'success',
  );
}

export const ciActions = {
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  download: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  upload: 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  cache: 'actions/cache@5a3ec84eff668545956fd18022155c47e93e2684',
  node: 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
  pnpm: 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
  source: './.github/actions/ci-checkout',
  setup: './.github/actions/ci-setup',
  prepare: './.github/actions/ci-prepare',
  test: './.github/actions/ci-test',
};
const checkout = () => ({ uses: ciActions.checkout, with: { ref: '${{ github.sha }}' } });
const source = () => ({ id: 'source', uses: ciActions.source });
const sourceInputs = {
  'checkout-root': '${{ steps.source.outputs.root }}',
  'checkout-relative': '${{ steps.source.outputs.relative-root }}',
  'pnpm-dest': '${{ steps.source.outputs.pnpm-dest }}',
};
const sourceEnv = () => ({ TMPDIR: '${{ steps.source.outputs.tmpdir }}' });
const sourceShell = (run, env = {}) => ({
  run,
  'working-directory': '${{ steps.source.outputs.root }}',
  env: { ...sourceEnv(), ...env },
});
const sourceSetup = () => ({ uses: ciActions.setup, with: { ...sourceInputs }, env: sourceEnv() });
const preparationOutputs = {
  'artifact-name': '${{ steps.prepare.outputs.artifact-name }}',
  'artifact-digest': '${{ steps.prepare.outputs.artifact-digest }}',
};

export function mainWorkflowJobs(model) {
  const jobs = {
    'ci-validate': {
      name: 'ci-validate',
      'runs-on': 'ubuntu-24.04',
      steps: [
        checkout(),
        source(),
        sourceSetup(),
        sourceShell('pnpm test:groups:check'),
        sourceShell('pnpm test:ci:check'),
      ],
    },
    'ci-prepare': {
      name: 'ci-prepare',
      'runs-on': 'ubuntu-24.04',
      needs: ['ci-validate'],
      outputs: { ...preparationOutputs },
      steps: [
        checkout(),
        source(),
        { id: 'prepare', uses: ciActions.prepare, with: { ...sourceInputs }, env: sourceEnv() },
      ],
    },
  };
  for (const node of model.nodes) {
    jobs[node.jobId] = {
      name: node.jobId,
      'runs-on': 'ubuntu-24.04',
      needs: [...node.needs],
      steps: [
        checkout(),
        source(),
        {
          uses: ciActions.test,
          with: {
            ...sourceInputs,
            workspace: node.workspace,
            'artifact-name': '${{ needs.ci-prepare.outputs.artifact-name }}',
            'artifact-digest': '${{ needs.ci-prepare.outputs.artifact-digest }}',
          },
          env: sourceEnv(),
        },
      ],
    };
  }
  jobs['unit-test'] = {
    name: 'unit-test',
    'runs-on': 'ubuntu-24.04',
    needs: ['ci-validate', 'ci-prepare', ...model.nodes.map((node) => node.jobId)],
    if: '${{ always() }}',
    steps: [
      checkout(),
      source(),
      sourceSetup(),
      sourceShell('node scripts/ci-test-results.mjs', { CI_TEST_NEEDS: '${{ toJSON(needs) }}' }),
    ],
  };
  return jobs;
}

export function generateWorkflowJobs(model) {
  return (
    '# Generated main jobs only; preserve lint/minimum-Node jobs when integrating.\n' +
    stringify({ jobs: mainWorkflowJobs(model) }, { aliasDuplicateObjects: false, lineWidth: 0 })
  );
}

export function parseStrictYaml(source, label = 'YAML') {
  const document = parseDocument(source, {
    version: '1.2',
    strict: true,
    uniqueKeys: true,
    merge: false,
    prettyErrors: false,
  });
  if (document.errors.length || document.warnings.length) {
    throw new Error(`${label}: ${[...document.errors, ...document.warnings].map((error) => error.message).join('; ')}`);
  }
  visit(document, (_key, node) => {
    if (isAlias(node) || node?.anchor)
      throw new Error(`${label}: YAML anchors/aliases are not supported in the explicit CI contract`);
    if (isMap(node)) {
      for (const pair of node.items) {
        if (typeof pair.key?.value !== 'string' || pair.key.value === '<<')
          throw new Error(`${label}: expected explicit string mapping keys (no merges)`);
      }
    }
  });
  return document.toJS({ maxAliasCount: 0 });
}

function needsList(value, label) {
  const needs = value === undefined ? [] : typeof value === 'string' ? [value] : value;
  if (
    !Array.isArray(needs) ||
    needs.some((name) => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name))
  ) {
    throw new Error(`${label}: needs must be static job IDs`);
  }
  if (new Set(needs).size !== needs.length) throw new Error(`${label}: duplicate needs`);
  return needs;
}

// Compare parsed structure, not source text. Mapping/needs order, optional step
// display names, and a block scalar's final newline are semantically irrelevant.
// All other keys are checked, including if/strategy/concurrency/continue-on-error.
function assertContract(actual, expected, path) {
  if (path.endsWith('.needs')) {
    assertSet(needsList(actual, path), expected, path);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length)
      throw new Error(`${path}: expected ${expected.length} entries`);
    expected.forEach((value, index) => assertContract(actual[index], value, `${path}[${index}]`));
  } else if (record(expected)) {
    if (!record(actual)) throw new Error(`${path}: expected a mapping`);
    const step = /\.steps(?:\[\d+\]|\.install)$/.test(path);
    const keys = Object.keys(actual).filter((key) => !(step && key === 'name'));
    assertSet(keys, Object.keys(expected), `${path} keys`);
    for (const key of Object.keys(expected)) assertContract(actual[key], expected[key], `${path}.${key}`);
  } else {
    const normalized = path.endsWith('.run') && typeof actual === 'string' ? actual.trimEnd() : actual;
    const condition = path.endsWith('.if') && normalized === 'always()' ? '${{ always() }}' : normalized;
    if (condition !== expected)
      throw new Error(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const preservedIndependentJobs = ['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node'];

function validateWorkflowJobs(source, model) {
  const workflow = parseStrictYaml(source, 'Workflow');
  if (!record(workflow) || !record(workflow.jobs)) throw new Error('Workflow must contain a jobs mapping');
  const topKeys = ['name', 'on', 'jobs', 'permissions', 'run-name'];
  const unsupported = sorted(Object.keys(workflow).filter((key) => !topKeys.includes(key)));
  if (unsupported.length) throw new Error(`Workflow contract forbids top-level keys: ${unsupported.join(', ')}`);
  const expected = mainWorkflowJobs(model);
  const mainIds = Object.keys(expected);
  const actualIds = Object.keys(workflow.jobs);
  assertSet(
    actualIds.filter((id) => !preservedIndependentJobs.includes(id)),
    mainIds,
    'Main workflow job coverage',
  );
  for (const id of preservedIndependentJobs.filter((name) => actualIds.includes(name))) {
    if (workflow.jobs[id].steps?.some((step) => step.uses === ciActions.test || step.with?.workspace)) {
      throw new Error(`Independent job ${id} must not duplicate CI workspace test coverage`);
    }
  }
  const graph = new Map(actualIds.map((id) => [id, needsList(workflow.jobs[id]?.needs, `jobs.${id}.needs`)]));
  assertAcyclic(graph, 'Workflow needs');
  for (const id of mainIds) assertContract(workflow.jobs[id], expected[id], `jobs.${id}`);
  return workflow;
}

// Small concrete CI-DAG-03 contract. Resource selection/verified restore and
// exact argv execution belong to ci-test-workspace.mjs, with their own tests.
// The preparation script builds serially, packs, and emits name/path/digest.
export const helperStepContracts = {
  [ciActions.setup]: [
    {
      uses: ciActions.node,
      with: { 'node-version-file': '${{ inputs.checkout-relative }}/.tool-versions', 'package-manager-cache': false },
    },
    {
      id: 'installer-boundary',
      shell: 'bash',
      'working-directory': '${{ inputs.checkout-root }}',
      run: 'node .github/actions/ci-checkout/index.mjs --check-install',
    },
    {
      uses: ciActions.pnpm,
      env: { npm_config_shared_workspace_lockfile: 'false' },
      with: {
        package_json_file: '${{ inputs.checkout-relative }}/package.json',
        dest: '${{ inputs.pnpm-dest }}',
        run_install: false,
        cache: false,
      },
    },
    {
      id: 'install',
      shell: 'bash',
      'working-directory': '${{ inputs.checkout-root }}',
      run: 'pnpm install --frozen-lockfile --ignore-scripts',
    },
    {
      id: 'tools',
      shell: 'bash',
      'working-directory': '${{ inputs.checkout-root }}',
      run: 'node scripts/ci-test-workspace.mjs setup',
    },
  ],
  [ciActions.test]: [
    {
      uses: ciActions.setup,
      with: {
        'checkout-root': '${{ inputs.checkout-root }}',
        'checkout-relative': '${{ inputs.checkout-relative }}',
        'pnpm-dest': '${{ inputs.pnpm-dest }}',
      },
    },
    {
      id: 'artifacts',
      uses: ciActions.download,
      with: { name: '${{ inputs.artifact-name }}', path: '${{ runner.temp }}/ci-test-artifacts' },
    },
    {
      id: 'restore',
      shell: 'bash',
      'working-directory': '${{ inputs.checkout-root }}',
      run: 'node scripts/ci-test-workspace.mjs restore',
      env: {
        CI_TEST_WORKSPACE: '${{ inputs.workspace }}',
        CI_TEST_ARTIFACT_NAME: '${{ inputs.artifact-name }}',
        CI_TEST_ARTIFACT_DIGEST: '${{ inputs.artifact-digest }}',
        CI_TEST_ARTIFACT_DIR: '${{ steps.artifacts.outputs.download-path }}',
      },
    },
    {
      id: 'browser-cache',
      if: "${{ steps.restore.outputs.browser == 'true' }}",
      uses: ciActions.cache,
      with: { path: '${{ steps.restore.outputs.browser-path }}', key: '${{ steps.restore.outputs.browser-key }}' },
    },
    {
      id: 'mongo-cache',
      if: "${{ steps.restore.outputs.mongo == 'true' }}",
      uses: ciActions.cache,
      with: {
        path: '${{ steps.restore.outputs.mongo-path }}\n${{ steps.restore.outputs.mongo-path }}.md5\n',
        key: '${{ steps.restore.outputs.mongo-key }}',
      },
    },
    {
      id: 'test',
      shell: 'bash',
      'working-directory': '${{ inputs.checkout-root }}',
      run: 'node scripts/ci-test-workspace.mjs',
      env: {
        CI_TEST_WORKSPACE: '${{ inputs.workspace }}',
        CI_TEST_ARTIFACT_NAME: '${{ inputs.artifact-name }}',
        CI_TEST_ARTIFACT_DIGEST: '${{ inputs.artifact-digest }}',
        CI_TEST_ARTIFACT_DIR: '${{ steps.artifacts.outputs.download-path }}',
        CI_TEST_RESOURCE_DIR: '${{ steps.restore.outputs.resource-directory }}',
        CI_TEST_BROWSER_CACHE_HIT: '${{ steps.browser-cache.outputs.cache-hit }}',
        CI_TEST_MONGO_CACHE_HIT: '${{ steps.mongo-cache.outputs.cache-hit }}',
      },
    },
  ],
  [ciActions.prepare]: [
    {
      uses: ciActions.setup,
      with: {
        'checkout-root': '${{ inputs.checkout-root }}',
        'checkout-relative': '${{ inputs.checkout-relative }}',
        'pnpm-dest': '${{ inputs.pnpm-dest }}',
      },
    },
    {
      id: 'prepare',
      shell: 'bash',
      'working-directory': '${{ inputs.checkout-root }}',
      run: 'node scripts/ci-test-artifacts.mjs prepare',
    },
    {
      uses: ciActions.upload,
      with: {
        name: '${{ steps.prepare.outputs.artifact-name }}',
        path: '${{ steps.prepare.outputs.artifact-path }}',
        'if-no-files-found': 'error',
        'compression-level': 0,
      },
    },
  ],
};

function composite(source, name) {
  const action = parseStrictYaml(source, name);
  if (
    !record(action) ||
    !record(action.runs) ||
    action.runs.using !== 'composite' ||
    !Array.isArray(action.runs.steps) ||
    !action.runs.steps.length
  ) {
    throw new Error(`${name}: expected a nonempty composite action`);
  }
  assertSet(
    Object.keys(action).filter((key) => !['name', 'description', 'inputs', 'outputs'].includes(key)),
    ['runs'],
    `${name} keys`,
  );
  assertSet(Object.keys(action.runs), ['using', 'steps'], `${name}.runs keys`);
  return action;
}

export function validateHelperContracts(sources) {
  for (const name of [ciActions.source, ciActions.setup, ciActions.prepare, ciActions.test]) {
    if (typeof sources?.[name] !== 'string') throw new Error(`Missing CI helper contract: ${name}/action.yml`);
  }
  const bootstrap = parseStrictYaml(sources[ciActions.source], ciActions.source);
  if (!record(bootstrap)) throw new Error(`${ciActions.source}: expected a JavaScript action mapping`);
  const bootstrapContract = Object.fromEntries(
    Object.entries(bootstrap).filter(([key]) => !['name', 'description'].includes(key)),
  );
  if (record(bootstrap.outputs)) {
    bootstrapContract.outputs = Object.fromEntries(
      Object.entries(bootstrap.outputs).map(([key, value]) => [
        key,
        record(value) ? Object.fromEntries(Object.entries(value).filter(([field]) => field !== 'description')) : value,
      ]),
    );
  }
  assertContract(
    bootstrapContract,
    {
      outputs: {
        root: {},
        'relative-root': {},
        tmpdir: {},
        'pnpm-dest': {},
      },
      runs: { using: 'node20', main: 'index.mjs', post: 'index.mjs', 'post-if': 'always()' },
    },
    ciActions.source,
  );
  for (const name of [ciActions.setup, ciActions.test, ciActions.prepare]) {
    const action = composite(sources[name], name);
    const inputs = [
      'checkout-root',
      'checkout-relative',
      'pnpm-dest',
      ...(name === ciActions.test ? ['workspace', 'artifact-name', 'artifact-digest'] : []),
    ];
    if (!record(action.inputs ?? {})) throw new Error(`${name}.inputs: expected a mapping`);
    assertSet(Object.keys(action.inputs ?? {}), inputs, `${name}.inputs`);
    for (const input of inputs) {
      const value = action.inputs[input];
      if (!record(value)) throw new Error(`${name}.inputs.${input}: expected a mapping`);
      assertContract(
        Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description')),
        { required: true },
        `${name}.inputs.${input}`,
      );
    }
    const outputs = name === ciActions.prepare ? preparationOutputs : {};
    if (!record(action.outputs ?? {})) throw new Error(`${name}.outputs: expected a mapping`);
    assertSet(Object.keys(action.outputs ?? {}), Object.keys(outputs), `${name}.outputs`);
    for (const [output, value] of Object.entries(outputs)) {
      if (!record(action.outputs[output])) throw new Error(`${name}.outputs.${output}: expected a mapping`);
      assertContract(
        Object.fromEntries(Object.entries(action.outputs[output]).filter(([key]) => key !== 'description')),
        { value },
        `${name}.outputs.${output}`,
      );
    }
    assertContract(action.runs.steps, helperStepContracts[name], `${name}.runs.steps`);
  }
}

export function validateWorkflowContract(source, model, helperSources) {
  validateWorkflowJobs(source, model);
  validateHelperContracts(helperSources);
}

export function checkWorkflowFile(path, model, root = repositoryRoot) {
  let source;
  try {
    source = readFileSync(resolve(root, path), 'utf8');
  } catch {
    throw new Error(`Cannot read workflow: ${path}`);
  }
  validateWorkflowJobs(source, model);
  const helpers = {};
  for (const name of [ciActions.source, ciActions.setup, ciActions.prepare, ciActions.test]) {
    try {
      helpers[name] = readFileSync(resolve(root, name, 'action.yml'), 'utf8');
    } catch {
      throw new Error(`Cannot read CI helper: ${name}/action.yml`);
    }
  }
  validateHelperContracts(helpers);
}

const usage = 'Usage: node scripts/ci-test-plan.mjs --check | --generate | --check-workflow <path>';

export function parseCliArgs(args) {
  if (args.length === 1 && ['--check', '--generate'].includes(args[0])) return { mode: args[0] };
  if (args.length === 2 && args[0] === '--check-workflow' && args[1] && !args[1].startsWith('-'))
    return { mode: args[0], path: args[1] };
  throw new Error(usage);
}

export function runCli(args, { root = repositoryRoot, log = console.log, error = console.error } = {}) {
  try {
    const command = parseCliArgs(args);
    const model = createCiTestModel(loadWorkspaces(root));
    if (command.mode === '--generate') {
      log(generateWorkflowJobs(model).trimEnd());
    } else if (command.mode === '--check-workflow') {
      checkWorkflowFile(command.path, model, root);
      log(`Validated workflow and CI helper contracts: ${command.path} (${model.nodes.length} tested workspaces).`);
    } else {
      log(
        `Validated CI model: ${model.nodes.length} tested workspaces, ${model.declaredEdges.length} declared gates + ${model.overrideEdges.length} fixture gates, ${model.buildOnlyWorkspaces.length} build-only workspaces. Workflow agreement is a separate --check-workflow check.`,
      );
    }
    return 0;
  } catch (cause) {
    error(cause.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
