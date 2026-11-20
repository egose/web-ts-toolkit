import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCiTestModel, jobIdForWorkspace, loadWorkspaces, mainWorkflowJobs } from './ci-test-plan.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sorted = (values) => [...values].sort();
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const knownResults = new Set(['success', 'failure', 'cancelled', 'skipped']);

// The generated aggregate's needs are the single source of truth for the
// required-result contract. Do not duplicate the workspace job IDs here.
export function expectedCiJobs(model) {
  const workspaces = new Map(model.nodes.map((node) => [node.jobId, node.workspace]));
  return mainWorkflowJobs(model)['unit-test'].needs.map((jobId) => ({
    jobId,
    workspace: workspaces.get(jobId) ?? null,
  }));
}

function workflowNeeds(model) {
  const jobs = mainWorkflowJobs(model);
  return new Map(expectedCiJobs(model).map(({ jobId }) => [jobId, jobs[jobId].needs ?? []]));
}

function downstreamTests(model) {
  const downstream = new Map(model.nodes.map((node) => [node.jobId, []]));
  for (const node of model.nodes) {
    for (const prerequisite of node.testPrerequisites) {
      downstream.get(jobIdForWorkspace(prerequisite)).push(node.jobId);
    }
  }
  return downstream;
}

export function expectedSkippedDescendants(model, jobId) {
  const testJobs = model.nodes.map((node) => node.jobId);
  if (jobId === 'ci-prepare') return sorted(testJobs);
  if (jobId === 'ci-validate') return sorted(['ci-prepare', ...testJobs]);
  const downstream = downstreamTests(model);
  if (!downstream.has(jobId)) return [];
  const found = new Set();
  const pending = [...downstream.get(jobId)];
  while (pending.length) {
    const next = pending.shift();
    if (found.has(next)) continue;
    found.add(next);
    pending.push(...downstream.get(next));
  }
  return sorted(found);
}

export function parseCiNeeds(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('Missing CI_TEST_NEEDS; expected the JSON form of ${{ toJSON(needs) }}');
  }
  let needs;
  try {
    needs = JSON.parse(source);
  } catch (cause) {
    throw new Error(`CI_TEST_NEEDS is not valid JSON: ${cause.message}`, { cause });
  }
  if (!record(needs)) throw new Error('CI_TEST_NEEDS must be a JSON object of job result records');
  return needs;
}

function label({ jobId, workspace }) {
  return workspace ? `${jobId} (${workspace})` : jobId;
}

function resultOf(needs, jobId) {
  if (!Object.hasOwn(needs, jobId)) return 'missing';
  const value = needs[jobId];
  if (!record(value)) throw new Error(`CI job ${jobId} has a malformed result record`);
  if (typeof value.result !== 'string' || !value.result) throw new Error(`CI job ${jobId} is missing its result`);
  if (!knownResults.has(value.result)) throw new Error(`CI job ${jobId} has an unknown result: ${value.result}`);
  return value.result;
}

export function evaluateCiResults(source, model) {
  const needs = parseCiNeeds(source);
  const expected = expectedCiJobs(model);
  const expectedIds = expected.map(({ jobId }) => jobId);
  const actualIds = sorted(Object.keys(needs));
  const statuses = new Map(expected.map(({ jobId }) => [jobId, resultOf(needs, jobId)]));
  const problems = [];

  for (const jobId of actualIds.filter((candidate) => !expectedIds.includes(candidate))) {
    problems.push(`Unexpected CI job in CI_TEST_NEEDS: ${jobId}`);
  }

  const needsByJob = workflowNeeds(model);
  for (const { jobId } of expected) {
    const result = statuses.get(jobId);
    const prerequisites = needsByJob.get(jobId);
    if (result === 'success') {
      const blockedBy = prerequisites.filter((candidate) => statuses.get(candidate) !== 'success');
      if (blockedBy.length) {
        problems.push(`CI job ${jobId} succeeded despite non-success prerequisite(s): ${blockedBy.join(', ')}`);
      }
    } else if (result === 'skipped' && prerequisites.every((candidate) => statuses.get(candidate) === 'success')) {
      problems.push(`CI job ${jobId} was skipped without a non-success prerequisite`);
    }
  }

  for (const entry of expected) {
    const result = statuses.get(entry.jobId);
    if (result === 'success') continue;
    const descendants = expectedSkippedDescendants(model, entry.jobId);
    problems.push(
      `${label(entry)}: result=${result}; expected skipped descendants: ${
        descendants.length ? descendants.join(', ') : '(none)'
      }`,
    );
  }

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    message: `All ${expected.length} required CI jobs succeeded (${model.nodes.length} package tests plus ci-validate and ci-prepare).`,
  };
}

export function runCli(
  args,
  { root = repositoryRoot, env = process.env, log = console.log, error = console.error, model } = {},
) {
  try {
    if (args.length) throw new Error('Usage: node scripts/ci-test-results.mjs');
    const activeModel = model ?? createCiTestModel(loadWorkspaces(root));
    const result = evaluateCiResults(env.CI_TEST_NEEDS, activeModel);
    if (!result.ok) {
      for (const problem of result.problems) error(problem);
      return 1;
    }
    log(result.message);
    return 0;
  } catch (cause) {
    error(cause.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
