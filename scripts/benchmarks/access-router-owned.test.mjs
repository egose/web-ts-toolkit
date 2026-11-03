import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  inspectSnapshotDeclarations,
  authorizationModeCandidates,
  authorizationModeOptions,
  AUTHORIZATION_MODE_OPTIONS,
  summarize,
  UNSAFE_SNAPSHOT_FLAGS,
  UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
  UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
} from './access-router-core.mjs';
import {
  workloads,
  profileTarget,
  validateJob,
  expectedCounts,
  verifyCounts,
  verifyResult,
  pairOrder,
  pairedDeltas,
  retainedComparison,
  SERIES,
  GATES,
  verifyCountContract,
  GUARD_COUNT_REVISION,
} from './access-router-owned-core.mjs';
import { parseArgs, inspectBuild, initialJobs, repeatJobs, verifyCandidateContext } from './access-router-owned.mjs';
import { instrumentBundle } from './access-router-owned-structure.mjs';
import { checksum, verifyNativeResponse } from './access-router-owned-worker.mjs';
import { runLogged } from './access-router-core.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const home = await mkdtemp(resolve(process.env.WTT_BENCH_TMP ?? '/tmp/opencode', 'owned-bench-tests-'));
const fake = async (name, source, esm = source) => {
  const directory = resolve(home, name, 'packages/access-router/dist');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.d.ts'), source);
  if (esm !== null) await writeFile(resolve(directory, 'index.d.mts'), esm);
  return inspectSnapshotDeclarations(resolve(home, name));
};
const declaration = (body) => `type Mode = 'isolated' | 'trusted';
export interface DefaultModelRouterOptions { ${body} }
export interface ModelRouterOptions extends DefaultModelRouterOptions {}`;
const valid = declaration(AUTHORIZATION_MODE_OPTIONS.map((key) => `${key}?: Mode;`).join('\n'));

test('new profiles resolve real exported optional literal unions/aliases in BOTH declaration conditions', async () => {
  const info = await fake('valid', valid);
  assert.deepEqual(info.supportedAuthorizationModes, AUTHORIZATION_MODE_OPTIONS);
  assert.deepEqual(info.supportedSnapshotFlags, []);
  const modes = authorizationModeCandidates({ id: 'new', label: 'New', ...info }, 'both');
  assert.equal(modes.length, 2);
  assert.notEqual(modes[0].id, modes[1].id);
  for (const [index, mode] of modes.entries())
    assert.deepEqual(authorizationModeOptions(mode), {
      readAuthorizationMode: index ? 'trusted' : 'isolated',
      listAuthorizationMode: index ? 'trusted' : 'isolated',
    });
  assert.throws(
    () => authorizationModeCandidates({ id: 'old', supportedAuthorizationModes: [] }, 'isolated'),
    /no legacy fallback/,
  );
  assert.throws(() => authorizationModeOptions({ ...modes[0], snapshotSkips: 'off' }), /historical flag/);
  const mixed = { ...modes[0], readAuthorizationMode: 'trusted' };
  assert.equal(authorizationModeOptions(mixed).listAuthorizationMode, 'isolated');
});
test('comments/private names/malformed/required/any/missing or mismatching module conditions cannot invent modes', async () => {
  let index = 0;
  for (const body of [
    '// readAuthorizationMode?: Mode;\n listAuthorizationMode?: Mode;',
    'readAuthorizationMode: Mode; listAuthorizationMode: Mode;',
    'readAuthorizationMode?: any; listAuthorizationMode?: any;',
    'readAuthorizationMode?: string; listAuthorizationMode?: string;',
    "readAuthorizationMode?: Mode | 'other'; listAuthorizationMode?: Mode | 'other';",
    'readAuthorizationMode?: Mode; readAuthorizationMode?: Mode; listAuthorizationMode?: Mode; listAuthorizationMode?: Mode;',
    'readAuthorizationMode?: Mode | ; listAuthorizationMode?: Mode | ;',
  ]) {
    const info = await fake(`bad${index++}`, declaration(body));
    assert.ok(!info.supportedAuthorizationModes.includes('readAuthorizationMode'));
    assert.throws(() => authorizationModeCandidates({ id: 'bad', ...info }, 'isolated'), /no legacy fallback/);
  }
  assert.deepEqual((await fake('no-esm', valid, null)).supportedAuthorizationModes, []);
  assert.deepEqual((await fake('private', valid.replaceAll('export ', ''))).supportedAuthorizationModes, []);
  assert.deepEqual((await fake('mismatch', valid, declaration(''))).supportedAuthorizationModes, []);
});
test('catalog IDs and fixed settings retain three primary/six 10/100 guards and real separate families', () => {
  const cases = workloads();
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  assert.equal(cases.filter((c) => c.family === 'primary').length, 3);
  assert.equal(cases.filter((c) => c.family === 'guard').length, 12);
  assert.equal(cases.filter((c) => c.family === 'read').length, 10);
  for (const c of cases) {
    assert.equal(c.concurrency, 1);
    assert.equal(c.hookConcurrency, 10);
    assert.equal(c.warmup, 5);
    assert.equal(c.samples, c.family === 'guard' ? 50 : 100);
    assert.equal(c.validationSeries, SERIES);
  }
  assert.equal(cases.find((c) => c.id === 'facts/unused-checksum/100').rows, 100);
  assert.deepEqual(pairOrder(1), [
    ['current-default', 'isolated'],
    ['current-active', 'trusted'],
  ]);
  assert.deepEqual(pairOrder(2), [
    ['trusted', 'current-active'],
    ['isolated', 'current-default'],
  ]);
  assert.deepEqual(pairOrder(3), pairOrder(1));
  assert.deepEqual(pairOrder(4), pairOrder(2));
  assert.throws(() => pairOrder(5));
});

test('executable scheduler reverses case/profile order and repeats EXACTLY two original-setting pairs only', () => {
  const cases = workloads().slice(0, 3),
    jobs = initialJobs(cases);
  assert.equal(jobs.length, 24);
  assert.deepEqual(
    jobs.slice(0, 4).map((j) => j.profile),
    ['current-default', 'isolated', 'current-active', 'trusted'],
  );
  assert.equal(jobs[12].preset.id, cases[2].id);
  assert.equal(jobs[12].profile, 'trusted');
  assert.equal(initialJobs(cases, true).length, 12);
  const repeated = repeatJobs(cases[0], 'isolated', cases);
  assert.deepEqual(
    repeated.map((j) => [j.round, j.profile]),
    [
      [3, 'current-default'],
      [3, 'isolated'],
      [4, 'isolated'],
      [4, 'current-default'],
    ],
  );
  assert.ok(repeated.every((j) => j.preset.samples === 100 && j.preset.warmup === 5));
  const batch = workloads().find((j) => j.id === 'helper/H3/100');
  const withCost = repeatJobs(batch, 'trusted', workloads());
  assert.equal(withCost.length, 6);
  assert.equal(withCost.filter((j) => j.preset.id === 'helper/H3-query/100').length, 2);
});
const target = {
  profile: 'current-default',
  snapshotSkips: 'off',
  initialOutputCopySkips: 'off',
  authorizationFastPaths: 'off',
  distSha256: 'a'.repeat(64),
};
const job = () => ({ ...workloads()[0], target, database: 'access_router_bench_abcdef123456_1' });
test('jobs bound iterations, reject changed workloads/unknown IDs/count lies and never relabel smoke as final', () => {
  assert.doesNotThrow(() => validateJob(job()));
  assert.doesNotThrow(() => validateJob({ ...job(), smoke: true, samples: 2, warmup: 1 }));
  for (const patch of [
    { id: 'fake' },
    { rows: 1 },
    { fields: 4 },
    { samples: 101 },
    { warmup: 6 },
    { concurrency: 2 },
    { bytes: 31 },
    { samples: 2 },
    { samples: 0 },
    { validationSeries: 'old' },
    { database: 'production' },
  ])
    assert.throws(() => validateJob({ ...job(), ...patch }));
  assert.throws(() => verifyCounts(job(), { reads: 99, hooks: 0, getters: 0 }), /count mismatch/);
  const h2 = { ...job(), ...workloads().find((c) => c.id === 'helper/H2/100') };
  assert.equal(expectedCounts(h2).reads, 1);
  assert.equal(expectedCounts({ ...h2, target: { profile: 'isolated' } }).reads, 2);
  const h3 = { ...h2, ...workloads().find((c) => c.id === 'helper/H3/100'), target: { profile: 'trusted' } };
  assert.deepEqual(expectedCounts(h3), { reads: 2, hooks: 200, getters: 0, callbacks: 4800 });
});
const row = (median = 20, cpu = 10, p95 = 30) => ({
  outputFingerprint: 'same',
  responseFingerprints: ['same'],
  stats: { medianMs: median, cpuMsPerRequest: cpu, p95Ms: p95 },
});
test('paired reports use medians OF PAIRS, raw CPU, exact gates and fixed two additional pairs', () => {
  const pairs = [
    { baseline: row(), candidate: row(16, 8, 27) },
    { baseline: row(200, 100, 300), candidate: row(170, 85, 280) },
  ];
  const result = pairedDeltas(pairs, { primary: true });
  assert.equal(result.metrics.medianMs.ms, -17);
  assert.equal(result.metrics.medianMs.percent, -17.5);
  assert.equal(result.pass, true);
  assert.equal(result.repeatRequired, false);
  const miss = [
    { baseline: row(), candidate: row(19, 9.9) },
    { baseline: row(), candidate: row(18, 9) },
  ];
  assert.equal(pairedDeltas(miss, { primary: true }).repeatRequired, true);
  assert.equal(
    pairedDeltas([
      { baseline: row(), candidate: row(22, 11, 32) },
      { baseline: row(), candidate: row(22, 11, 32) },
    ]).repeatRequired,
    false,
    'exact 10% is not >10% adverse',
  );
  const adverse = { baseline: row(), candidate: row(23, 12, 35) };
  assert.equal(pairedDeltas([adverse, adverse]).repeatRequired, true);
  assert.equal(pairedDeltas([adverse, adverse, adverse, adverse]).pass, false);
  assert.throws(() => pairedDeltas([adverse]));
  assert.throws(() => pairedDeltas([adverse, adverse, adverse]));
  assert.throws(
    () => pairedDeltas([{ ...adverse, candidate: { ...adverse.candidate, outputFingerprint: 'DIFF' } }, adverse]),
    /output mismatch/,
  );
  assert.equal(GATES.repeatPairs, 2);
  assert.deepEqual(GATES.benefit, { medianMs: [10, 1], cpuMsPerRequest: [10, 0.5] });
});
test('extra-read allowance uses old flow PLUS matching query, without synthesizing a p95 distribution', () => {
  const pair = { baseline: row(20, 10), candidate: row(38, 19), freshQuery: row(20, 10) };
  const result = pairedDeltas([pair, pair], { component: true });
  assert.equal(result.metrics.medianMs.ms, -2);
  assert.equal('p95Ms' in result.metrics, false);
  assert.equal(result.pass, true);
});
test('retained GC observations are not allocation counts; repeated growth gate uses >15% AND >1MiB', () => {
  const retention = (growth) => ({
    before: 10000000,
    released: Array(4).fill(10000000 + growth),
    held: Array(4).fill(10000000 + growth),
    gcPerObservation: 3,
    cycles: 4,
    allocationCount: null,
  });
  const pair = { baseline: { retention: retention(1000000) }, candidate: { retention: retention(3000000) } };
  assert.equal(retainedComparison([pair, pair]).blocking, true);
  assert.equal(retainedComparison([{ ...pair, candidate: { retention: retention(1100000) } }, pair]).blocking, false);
  const heldOnly = {
    ...pair,
    candidate: { retention: { ...retention(3000000), released: retention(1000000).released } },
  };
  assert.equal(
    retainedComparison([heldOnly, heldOnly]).blocking,
    true,
    'Held result graphs must not escape the retained gate',
  );
  const healthy = { baseline: pair.baseline, candidate: pair.baseline };
  assert.equal(
    retainedComparison([pair, pair, healthy, healthy]).blocking,
    false,
    'Two adverse rounds out of four is not three aligned rounds',
  );
});
test('raw JSON results reject forged fingerprints/counts/statistics and persist process totals', () => {
  const j = { ...job(), smoke: true, samples: 2, warmup: 1 };
  const options = Object.fromEntries(
    [...UNSAFE_SNAPSHOT_FLAGS, ...UNSAFE_INITIAL_OUTPUT_COPY_FLAGS, ...UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS].map(
      (key) => [key, false],
    ),
  );
  const record = { modelName: 'ActualModel', getModelOption: options, getModelOptions: options };
  const result = {
    status: 'ok',
    distSha256: target.distSha256,
    validationSeries: SERIES,
    outputFingerprint: 'b'.repeat(64),
    responseFingerprints: Array(2).fill('b'.repeat(64)),
    authorizationVerification: { kind: 'server-option-getters', models: { source: record, target: record } },
    counts: { reads: 2, hooks: 0, getters: 0 },
    samplesMs: [1, 3],
    cpuMicroseconds: { user: 4000, system: 2000 },
    stats: summarize([1, 3], 5, 6000),
  };
  assert.doesNotThrow(() => verifyResult(j, result));
  for (const patch of [
    { outputFingerprint: 'bad' },
    { responseFingerprints: undefined },
    { responseFingerprints: ['b'.repeat(64)] },
    { responseFingerprints: ['b'.repeat(64), 'c'.repeat(64)] },
    { responseFingerprints: ['c'.repeat(64), 'c'.repeat(64)] },
    { distSha256: 'bad' },
    { counts: { reads: 1 } },
    { cpuMicroseconds: { user: NaN, system: 2 } },
    { cpuMicroseconds: { user: -1, system: 2 } },
    { stats: { ...result.stats, cpuMsPerRequest: 1 } },
    { validationSeries: 'old' },
    { authorizationVerification: undefined },
  ])
    assert.throws(() => verifyResult(j, { ...result, ...patch }));
  // Single-document helper workflows cycle the same persisted IDs as READ. Do not
  // mistake an expected row change for an authorization/fingerprint difference.
  for (const scenario of ['H0', 'H2', 'H2-query', 'H2-global']) {
    const rotating = { ...j, ...workloads().find((c) => c.id === `helper/${scenario}/100`), samples: 2, warmup: 1 };
    const counts = Object.fromEntries(Object.entries(expectedCounts(rotating)).map(([k, v]) => [k, v * 2]));
    assert.doesNotThrow(() =>
      verifyResult(rotating, { ...result, counts, responseFingerprints: ['b'.repeat(64), 'c'.repeat(64)] }),
    );
  }
});
test('native direct LIST validation rejects missing, duplicated, reordered or leaked rows; READ checks the full row', () => {
  const rows = [
    { ordinal: 0, value: { date: '1970-01-01' } },
    { ordinal: 1, value: { date: '1970-01-02' } },
  ];
  assert.doesNotThrow(() => verifyNativeResponse(rows, rows, true));
  assert.doesNotThrow(() => verifyNativeResponse(rows[0], rows, false));
  for (const value of [
    [],
    rows.slice(0, 1),
    [...rows].reverse(),
    [rows[0], rows[0]],
    [...rows, rows[0]],
    [{ ...rows[0], hidden: 'leak' }, rows[1]],
  ])
    assert.throws(() => verifyNativeResponse(value, rows, true));
  assert.throws(() => verifyNativeResponse(rows[1], rows, false));
});
test('candidate context rejects runtime substitution before launching any measured worker', async () => {
  await assert.rejects(
    () => verifyCandidateContext({ node: 'fake' }, {}, {}, 'missing'),
    /Sealed Node version changed/,
  );
  await assert.rejects(
    () => verifyCandidateContext({ node: process.version, versions: {} }, {}, {}, 'missing'),
    /Sealed Node runtime changed/,
  );
});
test('CLI validation/help is deterministic and plan cannot launch builds/Mongo or change thresholds', async () => {
  assert.deepEqual(parseArgs(['--help']), { help: true });
  for (const args of [[], ['--run'], ['--run', 'a', 'b', 'c'], ['--change-gates', 'a', 'b']])
    assert.throws(() => parseArgs(args));
  const { stdout } = await promisify(execFile)(process.execPath, [
    resolve(root, 'scripts/benchmarks/access-router-owned.mjs'),
    '--help',
  ]);
  assert.match(stdout, /NOT retention/);
  assert.match(stdout, /exactly two repeats/);
  assert.match(stdout, /ZERO Mongo/);
  const config = resolve(home, 'plan-config.json'),
    out = resolve(home, 'plan');
  await writeFile(config, '{}');
  await promisify(execFile)(process.execPath, [
    resolve(root, 'scripts/benchmarks/access-router-owned.mjs'),
    '--plan',
    config,
    out,
  ]);
  assert.equal(JSON.parse(await readFile(resolve(out, 'plan.json'), 'utf8')).cases.length, workloads().length);
});
test('checksum workload is fixed, deterministic, used as a boolean unused fact and not field-proportional', () => {
  assert.equal(checksum(), checksum());
  assert.ok(Number.isInteger(checksum()));
  const fact = { ...job(), ...workloads().find((c) => c.id === 'facts/unused-checksum/100') };
  assert.equal(expectedCounts(fact).expensive, 100);
  assert.equal(expectedCounts({ ...fact, fields: 48 }).expensive, 100);
});
test('structural instrumentation fails closed when real function seams disappear', () => {
  assert.throws(() => instrumentBundle('export {};', false), /exactly one real/);
});
test('facts-only count contracts require an exact artifact hash, never public mode/declaration inference or 0-or-24 tolerance', () => {
  const candidate = {
    profile: 'isolated',
    distSha256: 'c'.repeat(64),
    countContract: { revision: GUARD_COUNT_REVISION, artifactSha256: 'c'.repeat(64) },
  };
  assert.deepEqual(verifyCountContract(candidate), candidate.countContract);
  for (const patch of [
    { countContract: undefined },
    { countContract: { ...candidate.countContract, revision: 'full-dto-v1' } },
    { countContract: { ...candidate.countContract, artifactSha256: 'd'.repeat(64) } },
    { countContract: { ...candidate.countContract, callbacks: 24 } },
  ])
    assert.throws(() => verifyCountContract({ ...candidate, ...patch }));
  const h4 = { ...job(), ...workloads().find((c) => c.id === 'helper/H4/100'), target: candidate, samples: 1 };
  assert.deepEqual(expectedCounts(h4), { reads: 1, hooks: 1, getters: 0, callbacks: 0 });
  assert.doesNotThrow(() => verifyCounts(h4, { reads: 1, hooks: 1, getters: 0, callbacks: 0 }));
  assert.throws(() => verifyCounts(h4, { reads: 1, hooks: 1, getters: 0 }), /missing actual callbacks counter/);
  assert.throws(
    () => verifyCounts(h4, { reads: 1, hooks: 1, getters: 0, callbacks: 24 }),
    /actual callbacks count mismatch/,
  );
  assert.throws(
    () => verifyCounts({ ...h4, target: { ...candidate, countContract: undefined } }, { reads: 1, hooks: 1 }),
    /contract required/,
  );
  const historical = { ...h4, target };
  assert.deepEqual(expectedCounts(historical), { reads: 1, hooks: 1, getters: 0, callbacks: 0 });
  assert.equal(verifyCountContract(target), null);
  assert.throws(
    () => verifyCountContract({ ...target, countContract: candidate.countContract }),
    /Historical artifacts/,
  );
});
test(
  'public correctness and structural probes run against both actual artifact families (NO timing acceptance)',
  { timeout: 600000 },
  async () => {
    const oldRoot = process.env.WTT_BENCH_LEGACY_ROOT;
    assert.ok(oldRoot, 'WTT_BENCH_LEGACY_ROOT must name the sealed old build for historical compatibility tests');
    const old = await inspectBuild(oldRoot),
      current = await inspectBuild(process.env.WTT_BENCH_CANDIDATE_ROOT ?? root);
    // Explicit test contract, validated by actual guard counts in the child, not inferred from modes.
    current.countContract = { revision: GUARD_COUNT_REVISION, artifactSha256: current.distSha256 };
    for (const profile of ['current-default', 'isolated', 'current-active', 'trusted']) {
      const selected = profileTarget(profile.startsWith('current-') ? old : current, profile);
      const input = resolve(home, profile + '.json'),
        output = resolve(home, profile + '-probe.json');
      await writeFile(input, JSON.stringify(selected));
      await runLogged(
        process.execPath,
        [resolve(root, 'scripts/benchmarks/access-router-owned-probes.mjs'), input, output],
        { cwd: root, logFile: resolve(home, profile + '-probe.log'), timeoutMs: 120000 },
      );
      const probe = JSON.parse(await readFile(output, 'utf8'));
      assert.equal(probe.status, 'ok', probe.error);
      assert.ok(probe.observations.some((o) => o.kind === 'admitted READ retry'));
      for (const code of [400, 403]) {
        const denial = probe.observations.find((o) => o.kind === `terminal ${code}`);
        assert.equal(denial.adapterReads, 0);
        assert.match(denial.outputFingerprint, /^[a-f0-9]{64}$/);
      }
      if (!profile.startsWith('current-')) {
        assert.deepEqual(probe.conditionProof.contract, current.countContract);
        assert.equal(probe.conditionProof.observations.length, 2);
        for (const proof of probe.conditionProof.observations) {
          assert.deepEqual(proof.guardCounts, { reads: 1, hooks: 1, callbacks: 0, decorations: 0 });
          assert.equal(proof.normalDtoCallbacks, 24);
          assert.equal(proof.negativeStatus, 401);
          assert.equal(proof.invalidFactsStatus, 400);
        }
        const modes = probe.observations.filter((o) => o.kind === 'source/target actual callback mutation');
        assert.equal(modes.length, 4);
        assert.ok(modes.every((o) => o.embeddedInheritedOwnerMode && o.independentReadListModes));
        assert.ok(probe.observations.some((o) => o.kind === 'negative EMPTY predicate'));
      }
      const structural = resolve(home, profile + '-structural.json');
      await runLogged(
        process.execPath,
        [
          resolve(root, 'scripts/benchmarks/access-router-owned-structure.mjs'),
          input,
          resolve(home, profile + '-instrumented'),
          structural,
        ],
        { cwd: root, logFile: resolve(home, profile + '-structural.log'), timeoutMs: 120000 },
      );
      const result = JSON.parse(await readFile(structural, 'utf8'));
      assert.equal(result.status, 'ok', result.error);
      const exact = result.measurements.find((m) => m.fields === 24);
      assert.equal(exact.callbacks, 144);
      assert.equal(exact.hooks, 6);
      if (!profile.startsWith('current-')) {
        const helper = result.helpers.find((m) => m.helpers === 100);
        assert.equal(helper.counts.evaluateAuthorizedOutputField, 2400);
        assert.equal(helper.counts.captureOutputHelperConfiguration, 100);
        assert.equal(helper.counts.selectCatalogOutputShape, 100);
        assert.equal(helper.counts.copyDocumentView, 100);
        assert.equal(helper.counts.captureReferenceOrigins ?? 0, 0);
        assert.equal(helper.clearedRecords, 100);
      }
    }
  },
);
