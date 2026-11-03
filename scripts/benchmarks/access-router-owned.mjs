#!/usr/bin/env node
/** Fixed OAR-09 protocol. This CLI never builds/installs/changes artifacts or old evidence. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runLogged } from './access-router-core.mjs';
import {
  profileTarget,
  workloads,
  verifyResult,
  verifyCounts,
  validateJob,
  pairedDeltas,
  retainedComparison,
  pairOrder,
  GATES,
  SERIES,
  verifyCountContract,
} from './access-router-owned-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const sha = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
export async function inspectBuild(root, signal) {
  root = resolve(root);
  const { stdout } = await exec(process.execPath, [resolve(here, 'access-router-declarations.mjs'), root], {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30000,
    signal,
  });
  const entry = resolve(root, 'packages/access-router/dist/index.mjs');
  return {
    root,
    entry,
    id: 'artifact',
    label: 'Sealed artifact',
    ...JSON.parse(stdout),
    distSha256: await sha(entry),
    lockSha256: await sha(resolve(root, 'pnpm-lock.yaml')),
  };
}

export function initialJobs(cases, smoke = false) {
  return (smoke ? [1] : [1, 2]).flatMap((round) =>
    (round % 2 ? cases : [...cases].reverse()).flatMap((preset) =>
      pairOrder(round).flatMap((order) => order.map((profile) => ({ preset, profile, round }))),
    ),
  );
}

export function repeatJobs(preset, profile, cases) {
  if (!['isolated', 'trusted'].includes(profile)) throw new Error('Candidate comparison required');
  const before = profile === 'isolated' ? 'current-default' : 'current-active';
  return [3, 4].flatMap((round) => [
    ...(round % 2 ? [before, profile] : [profile, before]).map((name) => ({ preset, profile: name, round })),
    ...(preset.family === 'helper' && ['H2', 'H3'].includes(preset.scenario)
      ? [
          {
            preset: cases.find((entry) => entry.id === `helper/${preset.scenario}-query/${preset.rows}`),
            profile: before,
            round,
          },
        ]
      : []),
  ]);
}

/** A campaign may not silently substitute tools/runtime after candidate acceptance. */
export async function verifyCandidateContext(seal, baseline, candidate, dependencySeal) {
  assert.equal(seal.node, process.version, 'Sealed Node version changed');
  assert.deepEqual(seal.versions, process.versions, 'Sealed Node runtime changed');
  assert.equal(seal.nodeBinarySha256, await sha(process.execPath), 'Sealed Node binary changed');
  assert.equal(seal.lockSha256, candidate.lockSha256, 'Sealed candidate lock changed');
  assert.equal(seal.baselineRootEsm, baseline.distSha256, 'Sealed baseline identity changed');
  assert.equal(seal.dependencyIdentitiesSha256, await sha(dependencySeal), 'Sealed dependency manifest changed');
  const root = resolve(here, '../..');
  for (const key of ['sourceSha256', 'toolSha256']) {
    assert.ok(Object.keys(seal[key] ?? {}).length, `Missing sealed ${key}`);
    for (const [file, expected] of Object.entries(seal[key]))
      assert.equal(await sha(resolve(root, file)), expected, `Sealed ${key} changed: ${file}`);
  }
  assert.ok(seal.toolDependencies?.length, 'Missing tool dependency identities');
  for (const record of seal.toolDependencies)
    for (const [file, expected] of Object.entries(record.filesSha256))
      assert.equal(
        await sha(resolve(root, record.directory, file)),
        expected,
        `Tool dependency changed: ${record.name}/${file}`,
      );
  assert.equal(await sha(seal.pnpmBinary.path), seal.pnpmBinary.sha256, 'Sealed pnpm binary changed');
  assert.ok(process.env.MONGOMS_SYSTEM_BINARY, 'Use the sealed MongoDB system binary explicitly');
  assert.equal(await sha(process.env.MONGOMS_SYSTEM_BINARY), seal.systemBinary.sha256, 'Sealed MongoDB binary changed');
}

export async function runProtocol(config, directory, { smoke = false, signal } = {}) {
  signal?.throwIfAborted();
  if (
    Object.keys(config).some(
      (key) =>
        !['baselineRoot', 'candidateRoot', 'baselineSeal', 'candidateSeal', 'dependencySeal', 'cases'].includes(key),
    )
  )
    throw new Error('Unknown configuration key. Fixed settings cannot be overridden.');
  const baseline = await inspectBuild(config.baselineRoot, signal),
    candidate = await inspectBuild(config.candidateRoot, signal);
  assert.ok(config.candidateSeal, 'Explicit sealed candidate count contract required, including smoke');
  const candidateMetadata = JSON.parse(await readFile(config.candidateSeal, 'utf8'));
  candidate.countContract = candidateMetadata.countContract;
  verifyCountContract({ ...candidate, profile: 'isolated' });
  assert.equal(baseline.lockSha256, candidate.lockSha256, 'Dependency lock mismatch');
  const profiles = Object.fromEntries(
    ['current-default', 'current-active', 'isolated', 'trusted'].map((profile) => [
      profile,
      profileTarget(profile.startsWith('current-') ? baseline : candidate, profile),
    ]),
  );
  let cases = workloads();
  if (config.cases) {
    if (
      !Array.isArray(config.cases) ||
      !config.cases.length ||
      new Set(config.cases).size !== config.cases.length ||
      config.cases.some((id) => !cases.some((entry) => entry.id === id))
    )
      throw new Error('Unknown/duplicate/empty workload IDs.');
    if (!smoke) throw new Error('Final protocol runs every case; case subsets are smoke only.');
    cases = cases.filter((entry) => config.cases.includes(entry.id));
  }
  await mkdir(directory, { recursive: false }); // exclusive; never overwrite failures or reuse previous batches
  const report = {
    label: smoke ? 'SMOKE ONLY — NOT retention/performance acceptance' : 'OAR-09 fixed campaign',
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    startedAt: new Date().toISOString(),
    settings: { gates: GATES, series: SERIES, smoke, cases, profiles },
    results: [],
    preflight: [],
    comparisons: [],
    factCosts: [],
    failures: [],
  };
  const save = () => writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  let mongo,
    index = 0;
  const prefix = randomBytes(6).toString('hex');
  const one = async (preset, profile, round) => {
    signal?.throwIfAborted();
    const existing = report.results.find(
      (row) => row.id === preset.id && row.profile === profile && row.round === round,
    );
    if (existing) return existing; // a matching component may already have run in the same fixed round
    const target = profiles[profile],
      id = String(++index).padStart(4, '0');
    const job = validateJob({
      ...preset,
      target,
      smoke,
      round,
      ...(smoke ? { samples: 2, warmup: 1 } : {}),
      uri: mongo.getUri(),
      database: `access_router_bench_${prefix}_${index}`,
    });
    const jobPath = resolve(directory, `${id}-job.json`),
      resultPath = resolve(directory, `${id}-result.json`);
    await writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
    let row;
    try {
      const legacy = ['primary', 'guard'].includes(preset.family);
      await runLogged(
        process.execPath,
        [
          ...(preset.family === 'retention' ? ['--expose-gc'] : []),
          resolve(here, legacy ? 'access-router-worker.mjs' : 'access-router-owned-worker.mjs'),
          jobPath,
          resultPath,
        ],
        { cwd: here, logFile: resolve(directory, `${id}.log`), timeoutMs: 30 * 60 * 1000, signal },
      );
      row = JSON.parse(await readFile(resultPath, 'utf8'));
      if (legacy) {
        row.counts = { reads: row.measuredReads, hooks: row.documentHooks, getters: row.getters };
        verifyCounts(job, row.counts);
      }
      verifyResult(job, row);
    } catch (error) {
      try {
        row = JSON.parse(await readFile(resultPath, 'utf8'));
      } catch {
        /* preserved log */
      }
      row = { ...row, status: 'failed', error: row?.error ?? error.stack ?? String(error) };
      report.failures.push({ job: id, error: row.error });
    }
    const result = { ...row, id: preset.id, profile, round, jobPath, resultPath };
    report.results.push(result);
    await save();
    return result;
  };
  const auditSeals = async () => {
    signal?.throwIfAborted();
    if (!smoke && (!config.baselineSeal || !config.candidateSeal || !config.dependencySeal))
      throw new Error('Final campaign requires baseline/candidate/dependency seals. Smoke is NOT acceptance.');
    const identities = [];
    for (const [build, path] of [
      [baseline, config.baselineSeal],
      [candidate, config.candidateSeal],
    ]) {
      if (!path) continue;
      const seal = JSON.parse(await readFile(path, 'utf8'));
      for (const [file, expected] of Object.entries(seal.allFilesSha256))
        assert.equal(await sha(resolve(build.root, file)), expected, `Sealed artifact changed: ${file}`);
      if (build === candidate) await verifyCandidateContext(seal, baseline, candidate, config.dependencySeal);
      identities.push({ seal: path, sha256: await sha(path), files: Object.keys(seal.allFilesSha256).length });
    }
    if (config.dependencySeal) {
      const records = JSON.parse(await readFile(config.dependencySeal, 'utf8'));
      for (const record of records)
        for (const [file, expected] of Object.entries(record.filesSha256))
          assert.equal(
            await sha(resolve(record.directory, file)),
            expected,
            `Dependency bytes changed: ${record.name}/${file}`,
          );
      identities.push({
        seal: config.dependencySeal,
        sha256: await sha(config.dependencySeal),
        packages: records.length,
      });
    }
    return identities;
  };
  try {
    report.sealsBefore = await auditSeals();
    report.toolSha256 = Object.fromEntries(
      await Promise.all(
        [
          'access-router-core.mjs',
          'access-router-worker.mjs',
          'access-router-declarations.mjs',
          'access-router-owned.mjs',
          'access-router-owned-core.mjs',
          'access-router-owned-worker.mjs',
          'access-router-owned-probes.mjs',
          'access-router-owned-structure.mjs',
        ].map(async (name) => [name, await sha(resolve(here, name))]),
      ),
    );
    // Separate correctness heaps finish BEFORE timing/retention. Native overflows are never timed.
    for (const [profile, target] of Object.entries(profiles)) {
      const targetPath = resolve(directory, `preflight-${profile}-target.json`);
      await writeFile(targetPath, JSON.stringify(target));
      for (const kind of ['probes', 'structure']) {
        const resultPath = resolve(directory, `preflight-${profile}-${kind}.json`);
        await runLogged(
          process.execPath,
          [
            resolve(here, `access-router-owned-${kind}.mjs`),
            targetPath,
            ...(kind === 'structure' ? [resolve(directory, `instrumented-${profile}`)] : []),
            resultPath,
          ],
          {
            cwd: process.cwd(),
            logFile: resolve(directory, `preflight-${profile}-${kind}.log`),
            timeoutMs: 120000,
            signal,
          },
        );
        const result = JSON.parse(await readFile(resultPath, 'utf8'));
        assert.equal(result.status, 'ok', result.error);
        report.preflight.push({ profile, kind, resultPath });
        await save();
      }
    }
    mongo = await MongoMemoryServer.create();
    signal?.throwIfAborted();
    // One Mongo, one child, serial foreground. Reverse BOTH case and profile order.
    for (const { preset, profile, round } of initialJobs(cases, smoke)) await one(preset, profile, round);
    if (!smoke && !report.failures.length) {
      const comparison = (preset, candidateProfile) => {
        const baselineProfile = candidateProfile === 'isolated' ? 'current-default' : 'current-active';
        const rows = report.results.filter((row) => row.id === preset.id && row.profile === candidateProfile);
        const component = preset.family === 'helper' && ['H2', 'H3'].includes(preset.scenario);
        const pairs = rows.map((row) => ({
          candidate: row,
          baseline: report.results.find(
            (b) => b.id === row.id && b.profile === baselineProfile && b.round === row.round,
          ),
          freshQuery: component
            ? report.results.find(
                (b) =>
                  b.id === `helper/${preset.scenario}-query/${preset.rows}` &&
                  b.profile === baselineProfile &&
                  b.round === row.round,
              )
            : undefined,
        }));
        const result = pairedDeltas(pairs, {
          primary: preset.family === 'primary' && candidateProfile === 'isolated',
          component,
        });
        if (preset.family === 'retention') {
          result.retained = retainedComparison(pairs);
          result.repeatRequired ||= pairs.length === 2 && result.retained.blocking;
          result.pass &&= !result.retained.blocking;
        }
        return result;
      };
      for (const preset of cases)
        for (const profile of ['isolated', 'trusted']) {
          // Heap comparison is reported independently below; latency/CPU are still real observations.
          const initial = comparison(preset, profile);
          if (initial.repeatRequired) {
            for (const job of repeatJobs(preset, profile, cases)) await one(job.preset, job.profile, job.round);
          }
          report.comparisons.push({ id: preset.id, profile, initial, final: comparison(preset, profile) });
          await save();
        }
    }
    for (const expensive of report.results.filter(
      (row) => row.id === 'facts/unused-checksum/100' && row.status === 'ok',
    )) {
      const own = report.results.find(
        (row) =>
          row.id === 'facts/owner-only/100' && row.profile === expensive.profile && row.round === expensive.round,
      );
      if (own)
        report.factCosts.push({
          profile: expensive.profile,
          round: expensive.round,
          medianMs: expensive.stats.medianMs - own.stats.medianMs,
          cpuMsPerRequest: expensive.stats.cpuMsPerRequest - own.stats.cpuMsPerRequest,
          computationsPerRequest: 100,
          iterationsPerComputation: 10000,
          label: 'unused fact cost versus OWN owner-only fact baseline; not ordinary primary LIST/no synthetic p95',
        });
    }
    report.sealsAfter = await auditSeals();
    const mongoVersions = [
      ...new Set(
        report.results.filter((row) => row.status === 'ok' && row.mongoVersion).map((row) => row.mongoVersion),
      ),
    ];
    assert.ok(mongoVersions.length <= 1, 'All Mongo-backed jobs must observe the same actual server version');
    for (const row of report.results.filter((r) => r.status === 'ok' && !r.id.startsWith('native-adapter/')))
      assert.ok(row.mongoVersion, 'Mongo-backed job must report its actual server version');
    report.mongoVersion = mongoVersions[0] ?? null;
    if (config.candidateSeal && report.mongoVersion) {
      const seal = JSON.parse(await readFile(config.candidateSeal, 'utf8'));
      assert.equal(report.mongoVersion, seal.systemBinary.version, 'Sealed MongoDB server version changed');
    }
    for (const [name, expected] of Object.entries(report.toolSha256))
      assert.equal(await sha(resolve(here, name)), expected, 'Benchmark tooling changed during run');
    return report;
  } catch (error) {
    report.failures.push({ error: error.stack ?? String(error) });
    throw error;
  } finally {
    try {
      if (mongo) await mongo.stop();
    } finally {
      report.finishedAt = new Date().toISOString();
      await save();
    }
  }
}

export function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.length !== 3 || !['--plan', '--smoke', '--run'].includes(args[0]))
    throw new Error('Usage: access-router-owned.mjs --plan|--smoke|--run config.json NEW-output-directory');
  return { action: args[0], configPath: args[1], directory: resolve(args[2]) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Interrupted; partial report retained.'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help)
      console.log(`Usage: node scripts/benchmarks/access-router-owned.mjs --plan|--smoke|--run config.json NEW-output-directory
Config: {"baselineRoot":"sealed-old-artifact","candidateRoot":"sealed-candidate"}
--plan writes the fixed workload/protocol catalog WITHOUT starting Mongo/jobs.
--smoke permits a "cases" ID subset, two samples/one warmup/one pair. NOT retention evidence.
--run runs all fixed initial pairs, reversed case/profile order, exactly two repeats ONLY on fixed triggers.
Every measured response is checked in BOTH artifacts. Historical LIST row-count series stays separate.
No builds/installs/threshold settings. One Mongo + worker serially; failures/raw jobs persist.
READ here uses actual generated HTTP routes; native adapter has ZERO Mongo reads, not Mongo timing.
Retained bytes are NOT allocation counts. CPU is actual Node user+system; DB CPU unavailable.
Reports aggregate median paired deltas, nearest-rank p95; no pooled requests/CI/significance claims.`);
    else {
      const config = JSON.parse(await readFile(options.configPath, 'utf8'));
      if (options.action === '--plan') {
        await mkdir(options.directory);
        await writeFile(
          resolve(options.directory, 'plan.json'),
          JSON.stringify({ config, cases: workloads(), gates: GATES, order: [pairOrder(1), pairOrder(2)] }, null, 2) +
            '\n',
        );
      } else {
        const report = await runProtocol(config, options.directory, {
          smoke: options.action === '--smoke',
          signal: controller.signal,
        });
        if (report.failures.length || report.comparisons.some((c) => !c.final.pass)) process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error.stack ?? String(error));
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
