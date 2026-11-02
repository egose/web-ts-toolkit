import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  authorizationModeCandidates,
  authorizationModeOptions,
  authorizationFastPathCandidates,
  initialOutputCopyCandidates,
  snapshotCandidates,
  integer,
  fingerprint,
  summarize,
  UNSAFE_SNAPSHOT_FLAGS,
  UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
  UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
} from './access-router-core.mjs';

export const SERIES = 'checked-each-response-v1';
export const PRIMARY = Object.freeze(['plain-wide', 'document-rules', 'embedded']);
export const GUARDS = Object.freeze([
  'plain-narrow',
  'hydrated',
  'global-rules',
  'large-config',
  'populate',
  'virtuals',
]);
export const PROFILES = Object.freeze(['current-default', 'current-active', 'isolated', 'trusted']);
export const LIMITS = Object.freeze({ fields: 24, bytes: 32, concurrency: 1, hookConcurrency: 10, warmup: 5 });
export const GATES = Object.freeze({
  benefit: { medianMs: [10, 1], cpuMsPerRequest: [10, 0.5] },
  adverse: { medianMs: [10, 1], p95Ms: [15, 2], cpuMsPerRequest: [10, 0.5] },
  repeatPairs: 2,
  retained: { percent: 15, bytes: 1048576 },
});

export function profileTarget(build, profile) {
  if (!PROFILES.includes(profile)) throw new Error('Unknown profile.');
  let target;
  if (['isolated', 'trusted'].includes(profile)) target = authorizationModeCandidates(build, profile)[0];
  else {
    if (build.supportedAuthorizationModes?.length) throw new Error('Historical profiles require historical bytes.');
    const on = profile === 'current-active' ? 'on' : 'off';
    // Both profiles require all ten declarations, even when configuring OFF.
    snapshotCandidates(build, 'on');
    initialOutputCopyCandidates(snapshotCandidates(build, 'on')[0], 'on');
    authorizationFastPathCandidates(initialOutputCopyCandidates(snapshotCandidates(build, 'on')[0], 'on')[0], 'on');
    target = authorizationFastPathCandidates(
      initialOutputCopyCandidates(snapshotCandidates(build, on)[0], on)[0],
      on,
    )[0];
  }
  return { ...target, id: profile, profile };
}

/** Fixed executable workload catalog. Original LIST fixtures/parameters are not edited. */
export function workloads() {
  const cases = [];
  const add = (family, scenario, rows = 100, extra = {}) =>
    cases.push({
      id: `${family}/${scenario}/${rows}`,
      family,
      scenario,
      rows,
      samples: family === 'guard' ? 50 : 100,
      ...LIMITS,
      validationSeries: SERIES,
      ...extra,
    });
  for (const s of PRIMARY) add('primary', s);
  for (const rows of [10, 100]) for (const s of GUARDS) add('guard', s, rows);
  for (const api of ['http-id', 'http-filter'])
    for (const s of [...PRIMARY, 'hydrated', 'virtuals']) add('read', s, 100, { api, id: `read/${api}/${s}/100` });
  for (const recipe of ['H0', 'H1', 'H1-scoped', 'H2', 'H2-query', 'H2-global', 'H4']) add('helper', recipe);
  for (const rows of [10, 100]) for (const recipe of ['H3', 'H3-query', 'H3-global']) add('helper', recipe, rows);
  for (const api of ['direct-read', 'direct-list'])
    add('native-adapter', 'supported', 100, { api, id: `native-adapter/${api}/100` });
  for (const s of ['owner-only', 'unused-checksum']) add('facts', s);
  for (const fields of [4, 24, 48])
    add('retention', 'held-released', 100, { fields, id: `retention/held-released/100/${fields}` });
  return cases;
}

export function validateJob(job) {
  if (!job || !PROFILES.includes(job.target?.profile)) throw new Error('Explicit known profile required.');
  if (!workloads().some((entry) => entry.id === job.id)) throw new Error('Unknown workload ID.');
  for (const [key, min, max] of [
    ['rows', 1, 100],
    ['fields', 4, 48],
    ['bytes', 1, 32],
    ['samples', 1, 100],
    ['warmup', 0, 5],
    ['concurrency', 1, 1],
    ['hookConcurrency', 1, 10],
  ])
    assert.equal(job[key], integer(job[key], min, max), `${key} must be an integer`);
  if (job.validationSeries !== SERIES) throw new Error('Full response validation required in this separate series.');
  const preset = workloads().find((entry) => entry.id === job.id);
  if (
    fingerprint({ ...preset, samples: job.samples, warmup: job.warmup }) !==
    fingerprint(Object.fromEntries(Object.keys(preset).map((key) => [key, job[key]])))
  )
    throw new Error('Workload semantics/settings changed. Only smoke samples/warmup may shrink.');
  if (!job.smoke && (job.samples !== preset.samples || job.warmup !== preset.warmup))
    throw new Error('Fixed campaign settings required; smoke is NOT retention evidence.');
  if (!/^access_router_bench_[a-f0-9]{12}_\d+$/.test(job.database)) throw new Error('Not an owned benchmark database.');
  if (['isolated', 'trusted'].includes(job.target.profile)) authorizationModeOptions(job.target);
  if (job.target.profile.startsWith('current-')) {
    const mode = job.target.profile === 'current-active' ? 'on' : 'off';
    for (const key of ['snapshotSkips', 'initialOutputCopySkips', 'authorizationFastPaths'])
      if (job.target[key] !== mode) throw new Error('Historical profile label does not match all ten controls.');
  } else
    for (const key of ['readAuthorizationMode', 'listAuthorizationMode'])
      if (job.target[key] !== job.target.profile) throw new Error('Owned profile label does not match actual mode.');
  return job;
}

export function expectedCounts(job) {
  const hooks =
    job.scenario === 'document-rules' || job.family === 'facts' ? (job.family === 'read' ? 1 : job.rows) : 0;
  if (job.family === 'primary' || job.family === 'guard')
    return {
      reads: job.scenario === 'populate' ? 2 : 1,
      hooks,
      getters: job.scenario === 'virtuals' ? 2 * job.rows : 0,
    };
  if (job.family === 'read')
    return { reads: 1, hooks, getters: job.scenario === 'virtuals' ? 2 : 0, callbacks: hooks * job.fields };
  if (job.family === 'facts')
    return {
      reads: 1,
      hooks: job.rows,
      getters: 0,
      expensive: job.scenario === 'unused-checksum' ? job.rows : 0,
      callbacks: job.rows * job.fields,
    };
  if (job.family === 'native-adapter')
    return {
      reads: 0,
      hooks: job.api === 'direct-list' ? job.rows : 1,
      getters: 0,
      adapterReads: 1,
      callbacks: (job.api === 'direct-list' ? job.rows : 1) * job.fields,
    };
  if (job.family === 'retention') return { reads: 1, hooks: job.rows, getters: 0, callbacks: job.rows * job.fields };
  const old = job.target.profile.startsWith('current-');
  const recipe = job.scenario;
  const batch = recipe.startsWith('H3');
  const queries = ['H1', 'H1-scoped'].includes(recipe) ? 0 : ['H2', 'H3'].includes(recipe) && !old ? 2 : 1;
  return {
    reads: queries,
    hooks: ['H0', 'H1', 'H1-scoped', 'H2-global', 'H3-global'].includes(recipe) ? 0 : queries * (batch ? job.rows : 1),
    getters: 0,
    callbacks:
      recipe === 'H1'
        ? 3
        : ['H2', 'H2-query', 'H3', 'H3-query'].includes(recipe)
          ? queries * (batch ? job.rows : 1) * job.fields
          : recipe === 'H4' && !old
            ? job.fields
            : 0,
  };
}

export function verifyCounts(job, counts, operations = job.samples) {
  for (const [key, value] of Object.entries(expectedCounts(job)))
    assert.equal(counts[key] ?? 0, value * operations, `${job.id}: actual ${key} count mismatch`);
}

export function verifyResult(job, row) {
  assert.equal(row.status, 'ok', row.error);
  assert.equal(row.distSha256, job.target.distSha256);
  assert.equal(row.validationSeries, SERIES);
  assert.match(row.outputFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(row.responseFingerprints?.length, job.samples, 'Every measured response must have a fingerprint');
  for (const value of row.responseFingerprints) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(row.responseFingerprints[0], row.outputFingerprint, 'First measured response differs from preflight');
  const cyclesRows =
    job.family === 'read' ||
    (job.family === 'native-adapter' && job.api === 'direct-read') ||
    (job.family === 'helper' && ['H0', 'H2', 'H2-query', 'H2-global'].includes(job.scenario));
  if (!cyclesRows)
    assert.ok(
      row.responseFingerprints.every((value) => value === row.outputFingerprint),
      'Fixed response changed',
    );
  verifyCounts(job, row.counts);
  assert.equal(row.samplesMs.length, job.samples);
  assert.ok(row.samplesMs.every((x) => Number.isFinite(x) && x >= 0));
  for (const key of ['user', 'system'])
    assert.ok(Number.isFinite(row.cpuMicroseconds?.[key]) && row.cpuMicroseconds[key] >= 0, `Invalid CPU ${key}`);
  assert.ok(Number.isFinite(row.stats?.elapsedMs) && row.stats.elapsedMs > 0, 'Invalid measured elapsed time');
  if (job.family === 'retention') {
    const r = row.retention;
    assert.equal(r?.gcPerObservation, 3);
    assert.equal(r?.cycles, 4);
    assert.equal(r?.operationsPerCycle, 5);
    assert.equal(r?.heldRows, job.rows);
    assert.equal(r?.fields, job.fields);
    assert.equal(r?.warmup, job.warmup);
    assert.equal(r?.heldAtLastObservation, false);
    assert.equal(r?.allocationCount, null);
    assert.ok(Number.isFinite(r?.before) && r.before > 0);
    for (const phase of ['held', 'released']) {
      assert.equal(r[phase]?.length, 4);
      assert.ok(r[phase].every((bytes) => Number.isFinite(bytes) && bytes > 0));
    }
    verifyCounts(job, r.extraWork, 20);
  }
  const expected = job.target.profile.startsWith('current-')
    ? Object.fromEntries(
        [...UNSAFE_SNAPSHOT_FLAGS, ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS, ...UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS].map(
          (key) => [key, job.target.profile === 'current-active'],
        ),
      )
    : authorizationModeOptions(job.target);
  const proof =
    row.authorizationVerification ?? row.authorizationModeVerification ?? row.authorizationFastPathVerification;
  assert.equal(proof?.kind, 'server-option-getters', 'Actual getter proof required');
  for (const role of ['source', 'target']) {
    assert.ok(proof.models?.[role]?.modelName);
    for (const getter of ['getModelOption', 'getModelOptions'])
      for (const [key, value] of Object.entries(expected))
        assert.equal(proof.models[role][getter]?.[key], value, `${role}/${getter}/${key} was not verified`);
  }
  const stats = summarize(row.samplesMs, row.stats.elapsedMs, row.cpuMicroseconds.user + row.cpuMicroseconds.system);
  for (const key of ['medianMs', 'p95Ms', 'cpuMsPerRequest'])
    assert.equal(row.stats[key], stats[key], `Invalid raw ${key}`);
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b),
    n = s.length;
  if (!n) throw new Error('No pairs.');
  return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
export function pairedDeltas(pairs, { primary = false, component = false } = {}) {
  if (![2, 4].includes(pairs.length)) throw new Error('Exactly two initial or four total pairs required.');
  const deltas = pairs.map(({ baseline, candidate, freshQuery }) => {
    assert.equal(baseline.outputFingerprint, candidate.outputFingerprint, 'Paired output mismatch');
    assert.ok(Array.isArray(baseline.responseFingerprints) && Array.isArray(candidate.responseFingerprints));
    assert.deepEqual(
      baseline.responseFingerprints,
      candidate.responseFingerprints,
      'Measured response fingerprints differ',
    );
    const keys = component ? ['medianMs', 'cpuMsPerRequest'] : Object.keys(GATES.adverse);
    return Object.fromEntries(
      keys.map((key) => {
        const before = baseline.stats[key] + (component ? freshQuery.stats[key] : 0);
        const after = candidate.stats[key];
        if (!(before > 0 && Number.isFinite(after))) throw new Error('Invalid paired metric.');
        return [key, { ms: after - before, percent: (100 * (after - before)) / before }];
      }),
    );
  });
  const metrics = Object.fromEntries(
    Object.keys(deltas[0]).map((key) => [
      key,
      {
        ms: median(deltas.map((row) => row[key].ms)),
        percent: median(deltas.map((row) => row[key].percent)),
      },
    ]),
  );
  const crosses = (d, [p, ms], sign = 1) => sign * d.percent > p && sign * d.ms > ms;
  const adverse = (d) =>
    Object.entries(GATES.adverse)
      .filter(([key]) => key in d)
      .some(([key, gate]) => crosses(d[key], gate));
  const benefit = (d) =>
    Object.entries(GATES.benefit).every(([key, [p, ms]]) => -d[key].percent >= p && -d[key].ms >= ms);
  const aligned = (key) => Math.max(...[-1, 1].map((sign) => deltas.filter((d) => sign * d[key].ms > 0).length));
  const signDisagreement = Object.keys(metrics).some((key) => aligned(key) < pairs.length);
  const improves = (d) => d.medianMs.ms < 0 && d.cpuMsPerRequest.ms < 0;
  const trigger =
    (primary && (!benefit(metrics) || !deltas.every(improves))) || signDisagreement || deltas.some(adverse);
  const unstable = Object.keys(metrics).some((key) => aligned(key) < (pairs.length === 4 ? 3 : 2));
  const confirmedAdverse = Object.entries(GATES.adverse)
    .filter(([key]) => key in metrics)
    .some(([key, gate]) => crosses(metrics[key], gate) && deltas.filter((d) => crosses(d[key], gate)).length >= 3);
  return {
    deltas,
    metrics,
    primary,
    component,
    repeatRequired: pairs.length === 2 && trigger,
    pass:
      !unstable &&
      !confirmedAdverse &&
      !(pairs.length === 2 && trigger) &&
      (!primary || (benefit(metrics) && deltas.filter(improves).length >= (pairs.length === 4 ? 3 : 2))),
    aggregation: 'median-of-paired-deltas; no pooling/CI/significance; no synthetic component p95',
  };
}

export function pairOrder(round) {
  integer(round, 1, 4);
  return round % 2
    ? [
        ['current-default', 'isolated'],
        ['current-active', 'trusted'],
      ]
    : [
        ['trusted', 'current-active'],
        ['isolated', 'current-default'],
      ];
}

export function retainedComparison(pairs) {
  const cycles = pairs.map(({ baseline, candidate }) => {
    for (const row of [baseline, candidate]) {
      assert.equal(row.retention?.gcPerObservation, 3);
      assert.equal(row.retention?.cycles, 4);
      assert.equal(row.retention?.allocationCount, null);
    }
    return Object.fromEntries(
      ['held', 'released'].map((phase) => [
        phase,
        candidate.retention[phase].map((value, index) => {
          const a = Math.max(0, value - candidate.retention.before);
          const b = Math.max(0, baseline.retention[phase][index] - baseline.retention.before);
          const bytes = a - b,
            percent = b > 0 ? (bytes * 100) / b : bytes > 0 ? Infinity : 0;
          return {
            bytes,
            percent: Number.isFinite(percent) ? percent : 'unbounded-from-zero',
            adverse: bytes > GATES.retained.bytes && (b === 0 || percent > GATES.retained.percent),
          };
        }),
      ]),
    );
  });
  return {
    cycles,
    blocking: ['held', 'released'].some(
      (phase) =>
        cycles.filter((round) => round[phase].filter((cycle) => cycle.adverse).length >= 3).length >=
        (pairs.length === 4 ? 3 : 2),
    ),
    label: 'held AND released retained heap growth above own forced-GC starting heap; NOT allocation counts',
  };
}

export function resolveRoot(root) {
  return resolve(root);
}
