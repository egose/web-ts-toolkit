import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkWorkflowFile,
  createCiTestModel,
  isTestEligible,
  jobIdForWorkspace,
  loadWorkspaces,
  mainWorkflowJobs,
  parseStrictYaml,
  reviewedTestPlan,
  testSuccessOverrides,
} from './ci-test-plan.mjs';
import { evaluateCiResults, expectedCiJobs, expectedSkippedDescendants, runCli } from './ci-test-results.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const workspaces = loadWorkspaces();
const model = createCiTestModel(workspaces);
const expected = expectedCiJobs(model);
const jobIds = expected.map(({ jobId }) => jobId);
const workspaceFor = new Map(expected.map(({ jobId, workspace }) => [jobId, workspace]));
const serialize = (needs) => JSON.stringify(needs);
const allSuccess = () => Object.fromEntries(jobIds.map((jobId) => [jobId, { result: 'success', outputs: {} }]));
const evaluate = (needs) => evaluateCiResults(serialize(needs), model);
const problems = (result) => result.problems.join('\n');
const accessRouterDescendants = [
  'test-access-router-client',
  'test-access-router-deco',
  'test-access-router-react',
  'test-access-router-runtime',
  'test-create-access-router-mongo-starter',
  'test-react-vite',
];
const utilsDescendants = [
  'test-access-router',
  'test-access-router-client',
  'test-access-router-deco',
  'test-access-router-react',
  'test-access-router-runtime',
  'test-create-access-router-mongo-starter',
  'test-express-json-router',
  'test-express-response-handler',
  'test-http-errors',
  'test-message-service',
  'test-moo',
  'test-react-vite',
];
const expressJsonRouterDescendants = [
  'test-access-router',
  'test-access-router-client',
  'test-access-router-deco',
  'test-access-router-react',
  'test-access-router-runtime',
  'test-create-access-router-mongo-starter',
  'test-message-service',
  'test-react-vite',
];
const vaultDescendants = [
  'test-express-oidc-vault-memory-store',
  'test-express-oidc-vault-mongodb-store',
  'test-express-oidc-vault-redis-store',
  'test-oidc-vault-dpop-client',
  'test-oidc-vault-dpop-example',
];

function skipDescendants(needs, jobId) {
  for (const descendant of expectedSkippedDescendants(model, jobId)) needs[descendant].result = 'skipped';
}

function failWithDescendants(jobId, result = 'failure') {
  const needs = allSuccess();
  needs[jobId].result = result;
  skipDescendants(needs, jobId);
  return needs;
}

function cli(source) {
  const output = [];
  const errors = [];
  const status = runCli([], {
    env: { CI_TEST_NEEDS: source },
    model,
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
  });
  return { status, output, errors };
}

test('expected results are exactly the checked aggregate needs and every model test job', () => {
  const generated = mainWorkflowJobs(model);
  assert.deepEqual(jobIds, generated['unit-test'].needs);
  assert.equal(jobIds.length, 27);
  assert.equal(new Set(jobIds).size, jobIds.length);
  assert.deepEqual([...jobIds].sort(), ['ci-prepare', 'ci-validate', ...model.nodes.map(({ jobId }) => jobId)].sort());
  assert.equal(workspaceFor.get('ci-validate'), null);
  assert.equal(workspaceFor.get('ci-prepare'), null);
  assert.deepEqual(
    expected
      .filter(({ workspace }) => workspace)
      .map(({ workspace }) => workspace)
      .sort(),
    model.nodes.map(({ workspace }) => workspace).sort(),
  );
});

test('all-success results pass with the exact required coverage', () => {
  const needs = allSuccess();
  const result = evaluate(needs);
  assert.deepEqual(result, {
    ok: true,
    message: 'All 27 required CI jobs succeeded (25 package tests plus ci-validate and ci-prepare).',
  });
  const run = cli(serialize(needs));
  assert.deepEqual(run, {
    status: 0,
    output: [result.message],
    errors: [],
  });
});

test('access-router failure reports the package and exact descendants while unrelated branches stay eligible', () => {
  const needs = failWithDescendants('test-access-router');
  const descendants = expectedSkippedDescendants(model, 'test-access-router');
  assert.deepEqual(descendants, accessRouterDescendants);
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  const text = problems(result);
  const parentLine = text
    .split('\n')
    .find((line) => line.startsWith('test-access-router (@web-ts-toolkit/access-router):'));
  assert.equal(
    parentLine,
    `test-access-router (@web-ts-toolkit/access-router): result=failure; expected skipped descendants: ${accessRouterDescendants.join(', ')}`,
  );
  assert.doesNotMatch(parentLine, /test-message-service|test-express-oidc-vault|test-pdf-reader/);
  for (const jobId of accessRouterDescendants) {
    assert.ok(text.includes(`${jobId} (${workspaceFor.get(jobId)}): result=skipped`), `${jobId} skipped line`);
  }
  for (const [jobId, workspace] of [
    ['test-message-service', '@web-ts-toolkit/message-service'],
    ['test-express-oidc-vault', '@web-ts-toolkit/express-oidc-vault'],
    ['test-express-oidc-vault-memory-store', '@web-ts-toolkit/express-oidc-vault-memory-store'],
    ['test-oidc-vault-dpop-client', '@web-ts-toolkit/oidc-vault-dpop-client'],
    ['test-oidc-vault-dpop-example', 'oidc-vault-dpop-example'],
    ['test-express-request-attestation', '@web-ts-toolkit/express-request-attestation'],
    ['test-pdf-reader', '@web-ts-toolkit/pdf-reader'],
  ]) {
    assert.equal(needs[jobId].result, 'success');
    assert.equal(isTestEligible(model, workspace, needs), true, `${jobId} should stay eligible`);
  }
  assert.equal(isTestEligible(model, '@web-ts-toolkit/access-router-client', needs), false);
  assert.doesNotMatch(text, /CI job test-message-service succeeded despite/);
});

for (const [jobId, workspace, descendants] of [
  ['test-express-json-router', '@web-ts-toolkit/express-json-router', expressJsonRouterDescendants],
  ['test-utils', '@web-ts-toolkit/utils', utilsDescendants],
]) {
  test(`${jobId} mid-graph failure reports every transitive skipped descendant`, () => {
    const needs = failWithDescendants(jobId);
    assert.deepEqual(expectedSkippedDescendants(model, jobId), descendants);
    const result = evaluate(needs);
    assert.equal(result.ok, false);
    const text = problems(result);
    assert.ok(
      text.includes(`${jobId} (${workspace}): result=failure; expected skipped descendants: ${descendants.join(', ')}`),
      'failure line with exact descendants',
    );
    for (const descendant of descendants) {
      assert.ok(
        text.includes(`${descendant} (${workspaceFor.get(descendant)}): result=skipped`),
        `${descendant} skipped line`,
      );
    }
  });
}

test('access-router-runtime requires both of its multi-parent prerequisites', () => {
  const workspace = '@web-ts-toolkit/access-router-runtime';
  const runtime = model.nodes.find((node) => node.workspace === workspace);
  const parents = runtime.testPrerequisites.map(jobIdForWorkspace);
  assert.deepEqual(parents, ['test-access-router', 'test-express-runtime']);
  for (const parent of parents) {
    const masked = allSuccess();
    masked[parent].result = 'failure';
    const result = evaluate(masked);
    assert.equal(result.ok, false, parent);
    assert.ok(
      problems(result).includes(
        `CI job test-access-router-runtime succeeded despite non-success prerequisite(s): ${parent}`,
      ),
      parent,
    );
    assert.equal(isTestEligible(model, workspace, masked), false, parent);
  }
});

test('access-router-runtime failure reports only the fixture-gated starter descendant', () => {
  const descendants = expectedSkippedDescendants(model, 'test-access-router-runtime');
  assert.deepEqual(descendants, ['test-create-access-router-mongo-starter']);
  const needs = failWithDescendants('test-access-router-runtime');
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  const text = problems(result);
  assert.ok(
    text.includes(
      'test-access-router-runtime (@web-ts-toolkit/access-router-runtime): result=failure; expected skipped descendants: test-create-access-router-mongo-starter',
    ),
  );
  assert.ok(
    text.includes('test-create-access-router-mongo-starter (create-access-router-mongo-starter): result=skipped'),
  );
  assert.equal(result.problems.length, 2);
});

test('express-oidc-vault failure skips its stores, client, and example without cancelling core branches', () => {
  const descendants = expectedSkippedDescendants(model, 'test-express-oidc-vault');
  assert.deepEqual(descendants, vaultDescendants);
  const needs = failWithDescendants('test-express-oidc-vault');
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  const text = problems(result);
  assert.ok(
    text.includes(
      `test-express-oidc-vault (@web-ts-toolkit/express-oidc-vault): result=failure; expected skipped descendants: ${vaultDescendants.join(', ')}`,
    ),
  );
  for (const [jobId, workspace] of [
    ['test-access-router', '@web-ts-toolkit/access-router'],
    ['test-utils', '@web-ts-toolkit/utils'],
    ['test-express-json-router', '@web-ts-toolkit/express-json-router'],
    ['test-react-vite', 'react-vite'],
    ['test-pdf-reader', '@web-ts-toolkit/pdf-reader'],
  ]) {
    assert.equal(needs[jobId].result, 'success');
    assert.equal(isTestEligible(model, workspace, needs), true);
  }
});

for (const parent of ['test-express-oidc-vault-memory-store', 'test-oidc-vault-dpop-client']) {
  test(`${parent} failure skips the multi-parent DPoP example and a false success is rejected`, () => {
    const example = model.nodes.find(({ workspace }) => workspace === 'oidc-vault-dpop-example');
    assert.deepEqual(example.needs, [
      'ci-prepare',
      'test-express-oidc-vault',
      'test-express-oidc-vault-memory-store',
      'test-oidc-vault-dpop-client',
    ]);
    const masked = allSuccess();
    masked[parent].result = 'failure';
    const maskedResult = evaluate(masked);
    assert.equal(maskedResult.ok, false);
    assert.ok(
      problems(maskedResult).includes(
        `CI job test-oidc-vault-dpop-example succeeded despite non-success prerequisite(s): ${parent}`,
      ),
    );
    assert.equal(isTestEligible(model, 'oidc-vault-dpop-example', masked), false);

    assert.deepEqual(expectedSkippedDescendants(model, parent), ['test-oidc-vault-dpop-example']);
    const skipped = failWithDescendants(parent);
    const skippedResult = evaluate(skipped);
    assert.equal(skippedResult.ok, false);
    assert.ok(
      problems(skippedResult).includes(
        `${parent} (${workspaceFor.get(parent)}): result=failure; expected skipped descendants: test-oidc-vault-dpop-example`,
      ),
    );
    assert.ok(
      problems(skippedResult).includes('test-oidc-vault-dpop-example (oidc-vault-dpop-example): result=skipped'),
    );
  });
}

test('ci-prepare failure fails the aggregate and names every package test as an expected skip', () => {
  const needs = allSuccess();
  needs['ci-prepare'].result = 'failure';
  for (const { jobId } of model.nodes) needs[jobId].result = 'skipped';
  const descendants = expectedSkippedDescendants(model, 'ci-prepare');
  assert.deepEqual(descendants, model.nodes.map(({ jobId }) => jobId).sort());
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  const text = problems(result);
  assert.ok(text.includes(`ci-prepare: result=failure; expected skipped descendants: ${descendants.join(', ')}`));
  for (const { jobId, workspace } of model.nodes) {
    assert.ok(text.includes(`${jobId} (${workspace}): result=skipped`), `${jobId} skipped`);
    assert.ok(mainWorkflowJobs(model)[jobId].needs.includes('ci-prepare'));
  }
  assert.equal(result.problems.length, 26);
});

test('ci-validate failure reports preparation and every package test as expected skips', () => {
  const needs = allSuccess();
  needs['ci-validate'].result = 'failure';
  needs['ci-prepare'].result = 'skipped';
  for (const { jobId } of model.nodes) needs[jobId].result = 'skipped';
  const descendants = expectedSkippedDescendants(model, 'ci-validate');
  assert.deepEqual(descendants, ['ci-prepare', ...model.nodes.map(({ jobId }) => jobId)].sort());
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  const text = problems(result);
  assert.ok(text.includes(`ci-validate: result=failure; expected skipped descendants: ${descendants.join(', ')}`));
  assert.ok(
    text.includes(
      `ci-prepare: result=skipped; expected skipped descendants: ${model.nodes
        .map(({ jobId }) => jobId)
        .sort()
        .join(', ')}`,
    ),
  );
  assert.equal(result.problems.length, 27);
});

test('skipped descendants never mask failed, cancelled, or missing required parents', () => {
  for (const state of ['failure', 'cancelled']) {
    const needs = allSuccess();
    needs['test-access-router'].result = state;
    needs['test-access-router-client'].result = 'skipped';
    const result = evaluate(needs);
    assert.equal(result.ok, false);
    const text = problems(result);
    assert.ok(text.includes(`test-access-router (@web-ts-toolkit/access-router): result=${state}`));
    assert.ok(text.includes('test-access-router-client (@web-ts-toolkit/access-router-client): result=skipped'));
  }

  const missing = allSuccess();
  delete missing['test-access-router'];
  missing['test-access-router-client'].result = 'skipped';
  const result = evaluate(missing);
  assert.equal(result.ok, false);
  const text = problems(result);
  assert.ok(text.includes('test-access-router (@web-ts-toolkit/access-router): result=missing'));
  assert.ok(text.includes('test-access-router-client (@web-ts-toolkit/access-router-client): result=skipped'));
});

test('an unexpected skipped required job fails even when every prerequisite succeeded', () => {
  const needs = allSuccess();
  needs['test-utils'].result = 'skipped';
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  const text = problems(result);
  assert.ok(text.includes('CI job test-utils was skipped without a non-success prerequisite'));
  assert.ok(text.includes('test-utils (@web-ts-toolkit/utils): result=skipped'));
});

test('a success result cannot contradict a failed prerequisite', () => {
  const needs = allSuccess();
  needs['test-express-oidc-vault'].result = 'failure';
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  assert.ok(
    problems(result).includes(
      'CI job test-express-oidc-vault-memory-store succeeded despite non-success prerequisite(s): test-express-oidc-vault',
    ),
  );
});

test('a missing required result fails closed and names the job and workspace', () => {
  const needs = allSuccess();
  delete needs['test-asset-inliner'];
  const result = evaluate(needs);
  assert.equal(result.ok, false);
  assert.ok(problems(result).includes('test-asset-inliner (@web-ts-toolkit/asset-inliner): result=missing'));
});

test('extra jobs fail closed even when every required result succeeded', () => {
  for (const extra of ['test-extra', 'unit-test', 'lint', 'access-router-minimum-node-smoke']) {
    const needs = allSuccess();
    needs[extra] = { result: 'success' };
    const result = evaluate(needs);
    assert.equal(result.ok, false, extra);
    assert.deepEqual(result.problems, [`Unexpected CI job in CI_TEST_NEEDS: ${extra}`]);
  }
});

test('an empty needs object reports every required job missing', () => {
  const result = evaluateCiResults('{}', model);
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 27);
  for (const { jobId, workspace } of expected) {
    const label = workspace ? `${jobId} (${workspace})` : jobId;
    assert.ok(
      result.problems.some((problem) => problem.startsWith(`${label}: result=missing;`)),
      `${jobId} missing`,
    );
  }
});

const malformedCases = [
  ['missing environment', undefined, /Missing CI_TEST_NEEDS/],
  ['blank environment', '   ', /Missing CI_TEST_NEEDS/],
  ['invalid JSON', '{', /not valid JSON/],
  ['null payload', 'null', /must be a JSON object/],
  ['array payload', '[]', /must be a JSON object/],
  ['scalar payload', '1', /must be a JSON object/],
  ['null record', JSON.stringify({ ...allSuccess(), 'test-utils': null }), /test-utils has a malformed result record/],
  ['array record', JSON.stringify({ ...allSuccess(), 'test-utils': [] }), /test-utils has a malformed result record/],
  [
    'missing result',
    JSON.stringify({ ...allSuccess(), 'test-utils': { result: '' } }),
    /test-utils is missing its result/,
  ],
  [
    'non-string result',
    JSON.stringify({ ...allSuccess(), 'test-utils': { result: 1 } }),
    /test-utils is missing its result/,
  ],
  [
    'unknown result',
    JSON.stringify({ ...allSuccess(), 'test-utils': { result: 'neutral' } }),
    /test-utils has an unknown result: neutral/,
  ],
];

for (const [name, source, pattern] of malformedCases) {
  test(`malformed ${name} fails closed through evaluation and the CLI`, () => {
    assert.throws(() => evaluateCiResults(source, model), pattern);
    const run = cli(source);
    assert.equal(run.status, 1);
    assert.deepEqual(run.output, []);
    assert.equal(run.errors.length, 1);
    assert.match(run.errors[0], pattern);
  });
}

test('CLI aggregate exits nonzero for failure, cancellation, skip, missing, extra, malformed, and empty states', () => {
  const cases = [];
  const failure = allSuccess();
  failure['test-access-router'].result = 'failure';
  cases.push(serialize(failure));
  const cancelled = allSuccess();
  cancelled['ci-validate'].result = 'cancelled';
  cases.push(serialize(cancelled));
  const skipped = allSuccess();
  skipped['test-utils'].result = 'skipped';
  cases.push(serialize(skipped));
  const missing = allSuccess();
  delete missing['ci-prepare'];
  cases.push(serialize(missing));
  const extra = allSuccess();
  extra['test-extra'] = { result: 'success' };
  cases.push(serialize(extra));
  cases.push('{}', '[]');
  for (const source of cases) {
    const run = cli(source);
    assert.equal(run.status, 1);
    assert.deepEqual(run.output, []);
    assert.ok(run.errors.length > 0);
  }
});

for (const state of ['failure', 'cancelled', 'skipped']) {
  test(`aggregate rejects ${state} in every required job`, () => {
    for (const jobId of jobIds) {
      const needs = allSuccess();
      needs[jobId].result = state;
      const result = evaluate(needs);
      assert.equal(result.ok, false, `${jobId} ${state}`);
      assert.match(problems(result), new RegExp(`${jobId}(?: \\([^)]*\\))?: result=${state}`));
    }
  });
}

test('evaluator rejects checked-model drift for a removed package test in both directions', () => {
  const reducedWorkspaces = new Map(workspaces);
  reducedWorkspaces.delete('@web-ts-toolkit/asset-inliner');
  const reducedPlan = reviewedTestPlan.filter(({ workspace }) => workspace !== '@web-ts-toolkit/asset-inliner');
  const reduced = createCiTestModel(reducedWorkspaces, reducedPlan, testSuccessOverrides);
  const stale = evaluateCiResults(serialize(allSuccess()), reduced);
  assert.equal(stale.ok, false);
  assert.ok(problems(stale).includes('Unexpected CI job in CI_TEST_NEEDS: test-asset-inliner'));

  const reducedNeeds = Object.fromEntries(expectedCiJobs(reduced).map(({ jobId }) => [jobId, { result: 'success' }]));
  const missing = evaluateCiResults(serialize(reducedNeeds), model);
  assert.equal(missing.ok, false);
  assert.ok(problems(missing).includes('test-asset-inliner (@web-ts-toolkit/asset-inliner): result=missing'));
});

test('result CLI accepts no arguments or hidden bypass flags', () => {
  for (const args of [['--allow-failure'], ['--skip'], ['--check'], ['x']]) {
    const output = [];
    const errors = [];
    const status = runCli(args, {
      env: { CI_TEST_NEEDS: serialize(allSuccess()) },
      model,
      log: (line) => output.push(line),
      error: (line) => errors.push(line),
    });
    assert.equal(status, 1);
    assert.deepEqual(output, []);
    assert.deepEqual(errors, ['Usage: node scripts/ci-test-results.mjs']);
  }
});

test('checked-in workflow is accepted only with generated jobs and exact evaluator wiring', () => {
  assert.doesNotThrow(() => checkWorkflowFile('.github/workflows/test.yml', model));
  const active = parseStrictYaml(
    readFileSync(resolve(repositoryRoot, '.github/workflows/test.yml'), 'utf8'),
    'Workflow',
  );
  assert.deepEqual(active.on, {
    pull_request: { 'paths-ignore': ['**.md'] },
    push: { 'paths-ignore': ['**.md'] },
  });
  const generated = mainWorkflowJobs(model);
  assert.equal(Object.keys(active.jobs).length, 31);
  assert.deepEqual(
    Object.keys(active.jobs).filter((id) => !(id in generated)),
    ['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node'],
  );
  for (const [jobId, job] of Object.entries(generated)) {
    assert.deepEqual(active.jobs[jobId], job, jobId);
    assert.equal(job['continue-on-error'], undefined, jobId);
    assert.equal(job.strategy, undefined, jobId);
  }
  for (const node of model.nodes) {
    const job = active.jobs[node.jobId];
    assert.equal(job.name, node.jobId);
    assert.deepEqual(job.needs, node.needs);
    assert.ok(job.needs.includes('ci-prepare'));
    assert.deepEqual(job.needs.slice(1), node.needs.slice(1));
    assert.deepEqual(job.steps[1], { id: 'source', uses: './.github/actions/ci-checkout' });
    assert.equal(job.steps[2].with.workspace, node.workspace);
  }
  const aggregate = active.jobs['unit-test'];
  assert.equal(aggregate.name, 'unit-test');
  assert.equal(aggregate.if, '${{ always() }}');
  assert.deepEqual([...aggregate.needs].sort(), [...jobIds].sort());
  assert.deepEqual(aggregate.steps.at(-1), {
    run: 'node scripts/ci-test-results.mjs',
    'working-directory': '${{ steps.source.outputs.root }}',
    env: { TMPDIR: '${{ steps.source.outputs.tmpdir }}', CI_TEST_NEEDS: '${{ toJSON(needs) }}' },
  });

  for (const id of ['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node']) {
    assert.equal(active.jobs[id].needs, undefined, id);
    assert.ok(!aggregate.needs.includes(id), id);
    assert.ok(
      !active.jobs[id].steps.some((step) => step.uses === './.github/actions/ci-test' || step.with?.workspace),
      id,
    );
  }
  assert.equal(active.jobs.lint.steps.at(-1).run, 'pnpm lint');
  assert.deepEqual(active.jobs['access-router-react-minimum-node'].strategy, {
    'fail-fast': false,
    matrix: { lane: ['supported', 'floating'] },
  });
  assert.equal(
    active.jobs['access-router-react-minimum-node']['continue-on-error'],
    "${{ matrix.lane == 'floating' }}",
  );
});
