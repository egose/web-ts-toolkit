#!/usr/bin/env node
/** Separate bounded B1 report-only campaign. Original runProtocol/catalog untouched. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runLogged } from './access-router-core.mjs';
import { inspectBuild, verifyCandidateContext } from './access-router-owned.mjs';
import { profileTarget, verifyCountContract } from './access-router-owned-core.mjs';
import {
  BATCH_SERIES,
  BATCH_JOB_CAP,
  DESCRIPTIVE_FLAGS,
  batchComparisons,
  batchJobs,
  batchPair,
  describeBatchPairs,
  validateBatchConfig,
  verifyBatchResult,
} from './access-router-owned-batch-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sha = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

export async function auditBatchContext(config, signal) {
  validateBatchConfig(config);
  signal?.throwIfAborted();
  const baseline = await inspectBuild(config.baselineRoot, signal),
    candidate = await inspectBuild(config.candidateRoot, signal);
  const seal = JSON.parse(await readFile(config.candidateSeal, 'utf8'));
  candidate.countContract = seal.countContract;
  verifyCountContract({ ...candidate, profile: 'isolated' });
  assert.equal(candidate.lockSha256, baseline.lockSha256);
  await verifyCandidateContext(seal, baseline, candidate, config.dependencySeal);
  for (const [build, path] of [
    [baseline, config.baselineSeal],
    [candidate, config.candidateSeal],
  ]) {
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    for (const [file, hash] of Object.entries(metadata.allFilesSha256))
      assert.equal(await sha(resolve(build.root, file)), hash, `Artifact mismatch: ${file}`);
  }
  const deps = JSON.parse(await readFile(config.dependencySeal, 'utf8'));
  for (const record of deps)
    for (const [file, hash] of Object.entries(record.filesSha256))
      assert.equal(await sha(resolve(record.directory, file)), hash, `Dependency mismatch: ${record.name}/${file}`);
  return {
    baseline,
    candidate,
    profiles: Object.fromEntries(
      ['current-default', 'current-active', 'isolated', 'trusted'].map((profile) => [
        profile,
        profileTarget(profile.startsWith('current-') ? baseline : candidate, profile),
      ]),
    ),
    sealSha256: await sha(config.candidateSeal),
    dependencySealSha256: await sha(config.dependencySeal),
  };
}

export async function runBatchProtocol(config, directory, { smoke = false, signal } = {}) {
  validateBatchConfig(config);
  await mkdir(directory); // Exclusive, including failed attempts.
  const report = {
    label: smoke ? 'B1 CORRECTNESS SMOKE ONLY — NOT PERFORMANCE' : 'B1 REPORT-ONLY descriptive supplement',
    supplement: BATCH_SERIES,
    acceptanceGate: false,
    startedAt: new Date().toISOString(),
    config,
    comparisons: batchComparisons(),
    jobCaps: BATCH_JOB_CAP,
    descriptiveFlags: DESCRIPTIVE_FLAGS,
    results: [],
    descriptions: [],
    preflight: [],
    failures: [],
  };
  const save = () => writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  let mongo,
    index = 0;
  const prefix = randomBytes(6).toString('hex');
  try {
    const context = await auditBatchContext(config, signal);
    report.before = { candidateSealSha256: context.sealSha256, dependencySealSha256: context.dependencySealSha256 };
    await runLogged(
      process.execPath,
      [resolve(here, 'access-router-owned-batch-declarations.mjs'), context.candidate.root],
      { cwd: process.cwd(), logFile: resolve(directory, 'declarations.log'), timeoutMs: 120000, signal },
    );
    for (const profile of ['isolated', 'trusted']) {
      const targetPath = resolve(directory, `${profile}-target.json`),
        resultPath = resolve(directory, `${profile}-probes.json`);
      await writeFile(targetPath, JSON.stringify(context.profiles[profile], null, 2) + '\n');
      await runLogged(
        process.execPath,
        [
          resolve(here, 'access-router-owned-batch-probes.mjs'),
          targetPath,
          resolve(directory, `${profile}-instrumented`),
          resultPath,
        ],
        { cwd: process.cwd(), logFile: resolve(directory, `${profile}-probes.log`), timeoutMs: 120000, signal },
      );
      const proof = JSON.parse(await readFile(resultPath, 'utf8'));
      assert.equal(proof.status, 'ok', proof.error);
      report.preflight.push({ profile, resultPath });
      await save();
    }
    mongo = await MongoMemoryServer.create();
    const one = async (entry) => {
      signal?.throwIfAborted();
      assert.ok(index < (smoke ? BATCH_JOB_CAP.smoke : BATCH_JOB_CAP.total), 'Bounded B1 job cap');
      const id = String(++index).padStart(4, '0');
      const job = {
        ...entry,
        target: context.profiles[entry.profile],
        smoke,
        uri: mongo.getUri(),
        database: `access_router_bench_${prefix}_${index}`,
      };
      const jobPath = resolve(directory, `${id}-job.json`),
        resultPath = resolve(directory, `${id}-result.json`);
      await writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
      let result;
      try {
        await runLogged(
          process.execPath,
          [resolve(here, 'access-router-owned-batch-worker.mjs'), jobPath, resultPath],
          { cwd: process.cwd(), logFile: resolve(directory, `${id}.log`), timeoutMs: 30 * 60 * 1000, signal },
        );
        result = JSON.parse(await readFile(resultPath, 'utf8'));
        verifyBatchResult(job, result);
      } catch (error) {
        try {
          result = JSON.parse(await readFile(resultPath, 'utf8'));
        } catch {
          /* log retained */
        }
        result = { ...result, status: 'failed', error: result?.error ?? error.stack ?? String(error) };
        report.failures.push({ job: id, error: result.error });
      }
      report.results.push({
        ...result,
        comparisonId: entry.comparison.id,
        round: entry.round,
        side: entry.side,
        jobPath,
        resultPath,
      });
      await save();
    };
    for (const entry of batchJobs(smoke)) await one(entry);
    if (!smoke && !report.failures.length)
      for (const comparison of batchComparisons()) {
        const describe = () =>
          describeBatchPairs(
            [
              1,
              2,
              ...(report.results.some((r) => r.comparisonId === comparison.id && r.round === 3) ? [3, 4] : []),
            ].map((round) => ({
              candidate: report.results.find(
                (r) => r.comparisonId === comparison.id && r.round === round && r.side === 'candidate',
              ),
              comparator: report.results.find(
                (r) => r.comparisonId === comparison.id && r.round === round && r.side === 'comparator',
              ),
            })),
          );
        const initial = describe();
        if (initial.repeatRequired)
          for (const round of [3, 4]) for (const entry of batchPair(comparison, round)) await one(entry);
        if (report.failures.length) break;
        report.descriptions.push({ id: comparison.id, initial, final: describe(), acceptanceGate: false });
        await save();
      }
    const after = await auditBatchContext(config, signal);
    assert.equal(after.sealSha256, context.sealSha256);
    assert.equal(after.dependencySealSha256, context.dependencySealSha256);
    report.after = { candidateSealSha256: after.sealSha256, dependencySealSha256: after.dependencySealSha256 };
    const versions = [...new Set(report.results.filter((r) => r.status === 'ok').map((r) => r.mongoVersion))];
    assert.deepEqual(versions, [JSON.parse(await readFile(config.candidateSeal, 'utf8')).systemBinary.version]);
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

export function parseBatchArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  assert.ok(
    args.length === 3 && ['--plan', '--smoke', '--run'].includes(args[0]),
    'Usage: access-router-owned-batch.mjs --plan|--smoke|--run config.json NEW-directory',
  );
  return { action: args[0], configPath: args[1], directory: resolve(args[2]) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController(),
    interrupt = () => controller.abort(new Error('Interrupted; B1 partial evidence retained'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const options = parseBatchArgs(process.argv.slice(2));
    if (options.help)
      console.log(
        'B1 REPORT ONLY. --plan|--smoke|--run config.json NEW-directory. Fixed 16 comparisons, 64 initial/128 maximum jobs; no subset/setting/gate overrides. --run belongs to the separately accepted fresh measurement owner.',
      );
    else {
      const config = validateBatchConfig(JSON.parse(await readFile(options.configPath, 'utf8')));
      if (options.action === '--plan') {
        await mkdir(options.directory);
        await writeFile(
          resolve(options.directory, 'plan.json'),
          JSON.stringify(
            {
              config,
              supplement: BATCH_SERIES,
              acceptanceGate: false,
              comparisons: batchComparisons(),
              initialJobs: batchJobs(),
              jobCaps: BATCH_JOB_CAP,
              descriptiveFlags: DESCRIPTIVE_FLAGS,
              repeats:
                'Exactly rounds 3 and 4 for the entire comparison on any initial sign disagreement or absolute material metric delta; never selective resampling or acceptance',
            },
            null,
            2,
          ) + '\n',
        );
      } else {
        const result = await runBatchProtocol(config, options.directory, {
          smoke: options.action === '--smoke',
          signal: controller.signal,
        });
        if (result.failures.length) process.exitCode = 1;
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
