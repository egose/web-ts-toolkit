/** B1 is a descriptive supplement. Nothing here is an OAR retention gate. */
import assert from 'node:assert/strict';
import {
  fingerprint,
  summarize,
  authorizationModeOptions,
  UNSAFE_SNAPSHOT_FLAGS,
  UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
  UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
} from './access-router-core.mjs';
import { SERIES, verifyCountContract } from './access-router-owned-core.mjs';

export const BATCH_SERIES = 'B1-report-only-v1';
export const BATCH_SETTINGS = Object.freeze({
  fields: 24,
  bytes: 32,
  concurrency: 1,
  hookConcurrency: 10,
  warmup: 5,
  samples: 100,
  validationSeries: SERIES,
  supplement: BATCH_SERIES,
});
// Numerical flags control bounded descriptive resampling ONLY, never acceptance.
export const DESCRIPTIVE_FLAGS = Object.freeze({
  medianMs: [10, 1],
  p95Ms: [15, 2],
  cpuMsPerRequest: [10, 0.5],
});
export const BATCH_JOB_CAP = Object.freeze({ smoke: 32, initial: 64, additional: 64, total: 128 });

export function batchComparisons() {
  return [10, 100].flatMap((rows) =>
    ['raw-only', 'query-plus-helper'].flatMap((workflow) =>
      ['isolated', 'trusted'].flatMap((profile) =>
        ['current-independent', 'historical'].map((comparator) => ({
          id: `helper/B1-global-many/${rows}/${workflow}/${profile}/${comparator}`,
          caseId: `helper/B1-global-many/${rows}`,
          rows,
          workflow,
          profile,
          comparator,
          strategies: {
            candidate: { strategy: 'many', profile },
            comparator: {
              strategy:
                comparator === 'current-independent'
                  ? 'independent'
                  : workflow === 'raw-only'
                    ? 'old-raw'
                    : 'old-query-handles',
              profile:
                comparator === 'current-independent'
                  ? profile
                  : profile === 'isolated'
                    ? 'current-default'
                    : 'current-active',
            },
          },
          ...BATCH_SETTINGS,
        })),
      ),
    ),
  );
}

export function batchPair(comparison, round) {
  assert.ok([1, 2, 3, 4].includes(round), 'Only the four predeclared rounds exist');
  const c = batchComparisons().find((entry) => entry.id === comparison.id);
  assert.deepEqual(comparison, c, 'Unknown or modified B1 comparison');
  return (round % 2 ? ['comparator', 'candidate'] : ['candidate', 'comparator']).map((side) => ({
    comparison: c,
    round,
    side,
    ...c.strategies[side],
  }));
}

export function batchJobs(smoke = false) {
  return (smoke ? [1] : [1, 2]).flatMap((round) => {
    const cases = batchComparisons();
    return (round % 2 ? cases : cases.reverse()).flatMap((c) => batchPair(c, round));
  });
}

export function validateBatchConfig(config) {
  assert.deepEqual(
    Object.keys(config).sort(),
    ['baselineRoot', 'baselineSeal', 'candidateRoot', 'candidateSeal', 'dependencySeal'].sort(),
    'B1 has no subset, gate, sample, strategy, or repeat overrides',
  );
  for (const value of Object.values(config)) assert.ok(typeof value === 'string' && value.length);
  return config;
}

export function validateBatchJob(job) {
  assert.deepEqual(
    Object.keys(job).sort(),
    ['comparison', 'round', 'side', 'strategy', 'profile', 'target', 'smoke', 'uri', 'database'].sort(),
    'Unknown B1 job setting',
  );
  assert.equal(typeof job.smoke, 'boolean');
  const preset = batchComparisons().find((c) => c.id === job.comparison?.id);
  assert.deepEqual(job.comparison, preset, 'Fixed complete B1 settings required');
  assert.ok(preset, 'Unknown B1 case');
  const pair = batchPair(preset, job.round).find((entry) => entry.side === job.side);
  assert.ok(pair);
  for (const key of ['strategy', 'profile']) assert.equal(job[key], pair[key]);
  assert.equal(job.target.profile, job.profile);
  assert.match(job.database, /^access_router_bench_[a-f0-9]{12}_\d+$/);
  if (job.profile.startsWith('current-')) {
    assert.ok(['old-raw', 'old-query-handles'].includes(job.strategy), 'No historical Many API');
    assert.equal(job.target.countContract, undefined);
    for (const key of ['snapshotSkips', 'initialOutputCopySkips', 'authorizationFastPaths'])
      assert.equal(job.target[key], job.profile === 'current-active' ? 'on' : 'off');
  } else {
    assert.ok(['many', 'independent'].includes(job.strategy));
    verifyCountContract(job.target);
    for (const key of ['readAuthorizationMode', 'listAuthorizationMode']) assert.equal(job.target[key], job.profile);
  }
  return job;
}

export function batchRows(rows) {
  return Array.from({ length: rows }, (_, index) => ({
    ordinal: index,
    ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`field${i}`, `${index}:${i}:${'x'.repeat(32)}`])),
  }));
}

export function batchCounts(job) {
  const n = job.comparison.rows;
  return {
    reads: job.comparison.workflow === 'query-plus-helper' ? 1 : 0,
    hooks: 0,
    getters: 0,
    callbacks: 0,
    manyCalls: job.strategy === 'many' ? 1 : 0,
    independentCalls: job.strategy === 'independent' || job.strategy === 'old-raw' ? n : 0,
    handleCalls: job.strategy === 'old-query-handles' ? n : 0,
  };
}

export function verifyBatchResult(job, result) {
  validateBatchJob(job);
  assert.equal(result.status, 'ok', result.error);
  assert.equal(result.supplement, BATCH_SERIES);
  assert.equal(result.acceptanceGate, false);
  assert.equal(result.validationSeries, SERIES);
  assert.equal(result.distSha256, job.target.distSha256);
  const n = job.smoke ? 2 : 100;
  const expected = batchRows(job.comparison.rows);
  assert.deepEqual(result.fullResponseBefore, expected, 'Full B1 output/order/private-field mismatch');
  assert.deepEqual(result.fullResponseAfter, expected);
  assert.equal(result.outputFingerprint, fingerprint(expected));
  assert.equal(result.responseFingerprints?.length, n);
  for (const hash of result.responseFingerprints) assert.equal(hash, fingerprint(expected));
  assert.equal(result.samplesMs?.length, n);
  assert.ok(result.samplesMs.every((value) => Number.isFinite(value) && value >= 0));
  for (const key of ['user', 'system'])
    assert.ok(Number.isFinite(result.cpuMicroseconds?.[key]) && result.cpuMicroseconds[key] >= 0);
  assert.ok(Number.isFinite(result.stats?.elapsedMs) && result.stats.elapsedMs > 0);
  const stats = summarize(
    result.samplesMs,
    result.stats.elapsedMs,
    result.cpuMicroseconds.user + result.cpuMicroseconds.system,
  );
  for (const key of ['medianMs', 'p95Ms', 'cpuMsPerRequest']) assert.equal(result.stats[key], stats[key]);
  assert.deepEqual(Object.keys(result.counts).sort(), Object.keys(batchCounts(job)).sort());
  for (const [key, value] of Object.entries(batchCounts(job)))
    assert.equal(result.counts[key], value * n, `Actual ${key} mismatch`);
  assert.deepEqual(result.hydration, job.comparison.workflow === 'query-plus-helper' ? ['lean'] : []);
  assert.equal(result.authorizationVerification?.kind, 'server-option-getters');
  const expectedFlags = job.profile.startsWith('current-')
    ? Object.fromEntries(
        [...UNSAFE_SNAPSHOT_FLAGS, ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS, ...UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS].map(
          (key) => [key, job.profile === 'current-active'],
        ),
      )
    : authorizationModeOptions(job.target);
  for (const role of ['source', 'target']) {
    assert.ok(result.authorizationVerification.models[role]?.modelName);
    for (const getter of ['getModelOption', 'getModelOptions'])
      assert.deepEqual(
        result.authorizationVerification.models[role][getter],
        expectedFlags,
        'Actual exact/bulk getter proof required',
      );
  }
  assert.ok(result.mongoVersion);
}

const median = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

export function describeBatchPairs(pairs) {
  assert.ok([2, 4].includes(pairs.length), 'Exactly two initial or four total descriptive pairs');
  const deltas = pairs.map(({ candidate, comparator }) => {
    assert.deepEqual(candidate.responseFingerprints, comparator.responseFingerprints);
    return Object.fromEntries(
      Object.keys(DESCRIPTIVE_FLAGS).map((key) => {
        const before = comparator.stats[key],
          after = candidate.stats[key];
        assert.ok(before > 0 && Number.isFinite(after));
        return [key, { ms: after - before, percent: (100 * (after - before)) / before }];
      }),
    );
  });
  const aligned = (key) => Math.max(...[-1, 1].map((sign) => deltas.filter((d) => sign * d[key].ms > 0).length));
  const material = deltas.some((d) =>
    Object.entries(DESCRIPTIVE_FLAGS).some(
      ([key, [percent, ms]]) => Math.abs(d[key].percent) > percent && Math.abs(d[key].ms) > ms,
    ),
  );
  const signDisagreement = Object.keys(DESCRIPTIVE_FLAGS).some((key) => aligned(key) < deltas.length);
  return {
    acceptanceGate: false,
    deltas,
    metrics: Object.fromEntries(
      Object.keys(DESCRIPTIVE_FLAGS).map((key) => [
        key,
        {
          ms: median(deltas.map((d) => d[key].ms)),
          percent: median(deltas.map((d) => d[key].percent)),
          alignedPairs: aligned(key),
        },
      ]),
    ),
    descriptiveTriggers: { materialAbsoluteDelta: material, signDisagreement },
    repeatRequired: pairs.length === 2 && (material || signDisagreement),
    label:
      'REPORT ONLY; directly observed workflow p95, median paired deltas; no acceptance/significance or freshness equivalence',
  };
}
