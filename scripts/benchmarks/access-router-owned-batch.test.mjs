import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fingerprint, summarize } from './access-router-core.mjs';
import { workloads, GATES, SERIES } from './access-router-owned-core.mjs';
import { initialJobs } from './access-router-owned.mjs';
import {
  BATCH_JOB_CAP,
  BATCH_SERIES,
  batchComparisons,
  batchJobs,
  batchPair,
  batchRows,
  batchCounts,
  validateBatchJob,
  validateBatchConfig,
  verifyBatchResult,
  describeBatchPairs,
} from './access-router-owned-batch-core.mjs';
import { parseBatchArgs } from './access-router-owned-batch.mjs';
import { instrumentBatchBundle } from './access-router-owned-batch-probes.mjs';

const hash = 'a'.repeat(64);
const config = {
  baselineRoot: 'old',
  baselineSeal: 'old.json',
  candidateRoot: 'new',
  candidateSeal: 'new.json',
  dependencySeal: 'deps.json',
};
const job = () => ({
  ...batchPair(batchComparisons()[0], 1)[1],
  target: {
    profile: 'isolated',
    supportedAuthorizationModes: ['readAuthorizationMode', 'listAuthorizationMode'],
    distSha256: hash,
    countContract: { revision: 'facts-only-v1', artifactSha256: hash },
    readAuthorizationMode: 'isolated',
    listAuthorizationMode: 'isolated',
  },
  smoke: true,
  uri: 'mongodb://localhost',
  database: 'access_router_bench_0123456789ab_1',
});
const result = (j = job()) => ({
  status: 'ok',
  supplement: BATCH_SERIES,
  acceptanceGate: false,
  validationSeries: SERIES,
  distSha256: hash,
  samplesMs: [2, 3],
  responseFingerprints: Array(2).fill(fingerprint(batchRows(j.comparison.rows))),
  outputFingerprint: fingerprint(batchRows(j.comparison.rows)),
  fullResponseBefore: batchRows(j.comparison.rows),
  fullResponseAfter: batchRows(j.comparison.rows),
  counts: Object.fromEntries(Object.entries(batchCounts(j)).map(([k, v]) => [k, v * 2])),
  hydration: [],
  cpuMicroseconds: { user: 1000, system: 1000 },
  stats: summarize([2, 3], 5, 2000),
  mongoVersion: '8.2.6',
  authorizationVerification: {
    kind: 'server-option-getters',
    models: Object.fromEntries(
      ['source', 'target'].map((role) => [
        role,
        {
          modelName: role,
          getModelOption: { readAuthorizationMode: 'isolated', listAuthorizationMode: 'isolated' },
          getModelOptions: { readAuthorizationMode: 'isolated', listAuthorizationMode: 'isolated' },
        },
      ]),
    ),
  },
});

test('original 45 cases / 90 comparisons / 360 initial jobs and settings stay separate', () => {
  assert.equal(workloads().length, 45);
  assert.equal(initialJobs(workloads()).length, 360);
  assert.ok(workloads().every((c) => !c.id.includes('B1')));
  assert.equal(GATES.repeatPairs, 2);
  assert.deepEqual(GATES.benefit, { medianMs: [10, 1], cpuMsPerRequest: [10, 0.5] });
});
test('complete fixed B1 matrix and bounded job counts', () => {
  const cases = batchComparisons();
  assert.equal(cases.length, 16);
  assert.equal(new Set(cases.map((c) => c.id)).size, 16);
  assert.equal(batchJobs().length, 64);
  assert.equal(batchJobs(true).length, 32);
  assert.equal(BATCH_JOB_CAP.total, 128);
  for (const c of cases) {
    assert.equal(c.samples, 100);
    assert.equal(c.warmup, 5);
    assert.equal(c.fields, 24);
    assert.equal(c.bytes, 32);
    assert.equal(c.concurrency, 1);
    assert.equal(c.hookConcurrency, 10);
  }
});
test('both case and paired strategy order reverse, including rounds 3/4', () => {
  const cases = batchComparisons();
  for (const round of [1, 2, 3, 4])
    assert.deepEqual(
      batchPair(cases[0], round).map((j) => j.side),
      round % 2 ? ['comparator', 'candidate'] : ['candidate', 'comparator'],
    );
  const jobs = batchJobs();
  assert.equal(jobs[0].comparison.id, cases[0].id);
  assert.equal(jobs[32].comparison.id, cases.at(-1).id);
  assert.throws(() => batchPair(cases[0], 5));
});
test('unknown CLI flags, subset/sample/gate/repeat/strategy overrides fail', () => {
  assert.deepEqual(validateBatchConfig(config), config);
  for (const key of ['cases', 'samples', 'gates', 'repeatPairs', 'strategy', 'unknown'])
    assert.throws(() => validateBatchConfig({ ...config, [key]: [] }));
  for (const args of [[], ['--run', 'c', 'd', '--samples=1'], ['--subset', 'c', 'd']])
    assert.throws(() => parseBatchArgs(args));
});
test('no historical Many API or fabricated handles/strategy', () => {
  const j = job();
  validateBatchJob(j);
  assert.throws(() => validateBatchJob({ ...j, strategy: 'old-many' }));
  assert.throws(() => validateBatchJob({ ...j, profile: 'current-default', target: { profile: 'current-default' } }));
  assert.throws(() => validateBatchJob({ ...j, samples: 2 }));
  assert.throws(() => validateBatchJob({ ...j, comparison: { ...j.comparison, samples: 2 } }));
  assert.throws(() => validateBatchJob({ ...j, target: { ...j.target, readAuthorizationMode: 'trusted' } }));
  assert.throws(() =>
    validateBatchJob({
      ...j,
      target: { ...j.target, countContract: { revision: 'facts-only-v1', artifactSha256: 'b'.repeat(64) } },
    }),
  );
});
test('full outputs/fingerprints/counts/getter proofs are mandatory, not labels', () => {
  const j = job();
  verifyBatchResult(j, result(j));
  for (const mutate of [
    (r) => (r.fullResponseBefore[0].field23 = 'wrong'),
    (r) => (r.fullResponseAfter[0].private = 'leak'),
    (r) => (r.responseFingerprints[1] = 'b'.repeat(64)),
    (r) => r.counts.reads++,
    (r) => delete r.counts.hooks,
    (r) => r.counts.callbacks++,
    (r) => (r.authorizationVerification.models.source.getModelOptions.readAuthorizationMode = 'trusted'),
    (r) => r.stats.p95Ms++,
    (r) => (r.acceptanceGate = true),
  ]) {
    const r = result(j);
    mutate(r);
    assert.throws(() => verifyBatchResult(j, r));
  }
});
const pair = (median, p95 = median, cpu = median) => ({
  candidate: { responseFingerprints: [hash], stats: { medianMs: median, p95Ms: p95, cpuMsPerRequest: cpu } },
  comparator: { responseFingerprints: [hash], stats: { medianMs: 20, p95Ms: 20, cpuMsPerRequest: 20 } },
});
test('descriptive sign/material triggers permit exactly two extra pairs, never gates', () => {
  assert.equal(describeBatchPairs([pair(19.9), pair(19.8)]).repeatRequired, false);
  assert.equal(describeBatchPairs([pair(19.9), pair(20.1)]).repeatRequired, true);
  assert.equal(describeBatchPairs([pair(0.1), pair(0.2)]).repeatRequired, true); // large benefit also descriptive
  assert.equal(describeBatchPairs([pair(40), pair(41)]).repeatRequired, true);
  const last = describeBatchPairs([pair(19), pair(21), pair(19), pair(21)]);
  assert.equal(last.repeatRequired, false);
  assert.equal(last.acceptanceGate, false);
  assert.ok(!('pass' in last));
  assert.throws(() => describeBatchPairs([pair(20)]));
  assert.throws(() => describeBatchPairs(Array(6).fill(pair(20))));
});
test('instrumentation fails closed when a real seam is absent', () => {
  assert.throws(() => instrumentBatchBundle('export {};'), /instrumentation seam/);
});
test('timed B1 worker uses actual API and handle calls, no compiler/private debug imports', async () => {
  const source = await readFile(new URL('./access-router-owned-batch-worker.mjs', import.meta.url), 'utf8');
  assert.match(source, /svc\.pickAllowedFieldsMany\(rows/);
  assert.match(source, /first\.contexts\[i\]\.documentAuthorization/);
  assert.ok(!source.includes("require('typescript')"));
  assert.ok(!source.includes('instrumentBatchBundle('));
  assert.match(source, /freshness:/);
});
