#!/usr/bin/env node
import * as prompts from '@clack/prompts';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  integer,
  integerList,
  prepareTarget,
  reportRows,
  requireSelection,
  runLogged,
  saveReport,
  SCENARIOS,
  snapshotCandidates,
  UNSAFE_SNAPSHOT_FLAGS,
} from './access-router-core.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const worker = resolve(root, 'scripts/benchmarks/access-router-worker.mjs');
const controller = new AbortController();
class Cancelled extends Error {}
const git = async (args) =>
  (await exec('git', args, { cwd: root, signal: controller.signal, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();

async function ask(promise) {
  const value = await promise;
  if (prompts.isCancel(value)) throw new Cancelled('Cancelled.');
  return value;
}

async function numberPrompt(message, initial, min, max, list = false) {
  const parse = (value) => (list ? integerList(value, min, max) : integer(value, min, max));
  return parse(
    await ask(
      prompts.text({
        message,
        initialValue: String(initial),
        validate(value) {
          try {
            parse(value);
          } catch (error) {
            return error.message;
          }
        },
      }),
    ),
  );
}

async function activity(message, operation) {
  const spin = prompts.spinner();
  spin.start(message);
  try {
    const result = await operation();
    spin.stop(message);
    return result;
  } catch (error) {
    spin.stop(`${message}: failed`);
    throw error;
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: pnpm bench:access-router

Interactive only (Node >=22, Git, tar and pnpm required).
  1. Fetch tags from a selected remote.
  2. Choose tags to prepare; build current dirty sources + isolated tag snapshots.
  3. Multiselect prepared versions (at least one); choose unsafe snapshot skips OFF,
     ON, or BOTH independently for each supported version.
  4. Choose the baseline, scenarios, row sizes, samples and concurrency.
  5. Run all jobs sequentially against disposable MongoDB; show/save JSON + Markdown.

No checkout/reset/worktree changes. Installs historical frozen lockfiles with
install scripts disabled, then explicitly executes each selected tag's build code.
Temporary tag trees are cleaned on completion/cancellation. Logs and reports stay
in .wip/benchmarks/. MongoDB may download a binary on first use. See scripts/benchmarks/README.md.`);
    return;
  }
  if (process.argv.length > 2) throw new Error('Unknown argument; use --help.');
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Run this interactive command in a terminal (see --help).');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node >=22 is required.');
  prompts.intro('access-router · current dist vs Git tags');
  const remotes = (await git(['remote'])).split('\n').filter(Boolean);
  if (!remotes.length) throw new Error('No Git remote configured; cannot fetch tags.');
  const remote =
    remotes.length === 1
      ? remotes[0]
      : await ask(
          prompts.select({ message: 'Fetch tags from which remote?', options: remotes.map((value) => ({ value })) }),
        );
  const reportBase = resolve(root, '.wip/benchmarks');
  await mkdir(reportBase, { recursive: true });
  const reportDirectory = await mkdtemp(resolve(reportBase, 'access-router-'));
  const report = {
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    remote,
    gitStatus: await git(['status', '--porcelain=v1']),
    preparedTargets: [],
    targets: [],
    preparationFailures: [],
    results: [],
    baseline: undefined,
  };
  let scratch;
  let mongo;
  try {
    // Do not detach or animate a spinner over SSH/credential-helper prompts.
    prompts.log.step(`Fetching tags from ${remote} (Git/SSH may prompt in this terminal)`);
    await runLogged('git', ['fetch', '--tags', remote], {
      cwd: root,
      logFile: resolve(reportDirectory, 'fetch.log'),
      signal: controller.signal,
      timeoutMs: 120_000,
      interactive: true,
      env: { GIT_TERMINAL_PROMPT: '1' },
    });
    const tags = (await git(['tag', '--list', '--sort=-version:refname'])).split('\n').filter(Boolean);
    const chosenTags = tags.length
      ? await ask(
          prompts.multiselect({
            message: 'Tags to prepare (Space toggles; Enter accepts; none = current only)',
            options: tags.map((value) => ({ value })),
            required: false,
            initialValues: tags.includes('v0.51.0') ? ['v0.51.0'] : [],
          }),
        )
      : [];
    const agreed = await ask(
      prompts.confirm({
        message: `Build current sources and ${chosenTags.length} isolated tag(s)? Tag builds execute trusted repository code and may install/download dependencies.`,
        initialValue: true,
      }),
    );
    if (!agreed) throw new Cancelled('No builds started.');
    let temporaryBase = process.env.WTT_BENCH_TMP ?? '/tmp/opencode';
    try {
      await access(temporaryBase);
    } catch {
      temporaryBase = tmpdir();
    }
    scratch = await mkdtemp(resolve(temporaryBase, 'access-router-bench-'));
    const candidates = [
      {
        id: 'current',
        label: 'Current working tree (fresh dist)',
        root,
        current: true,
        commit: await git(['rev-parse', 'HEAD']),
      },
      ...(await Promise.all(
        chosenTags.map(async (tag, index) => ({
          id: `tag-${index}`,
          label: tag,
          tag,
          root: resolve(scratch, `tag-${index}`),
          commit: await git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]),
        })),
      )),
    ];
    for (const target of candidates) {
      controller.signal.throwIfAborted();
      const logFile = resolve(reportDirectory, `${target.id}-prepare.log`);
      try {
        const prepared = await activity(`Preparing ${target.label}`, () =>
          prepareTarget({
            ...target,
            repository: root,
            archive: resolve(scratch, `${target.id}.tar`),
            logFile,
            signal: controller.signal,
          }),
        );
        report.preparedTargets.push({ ...target, ...prepared });
      } catch (error) {
        controller.signal.throwIfAborted();
        report.preparationFailures.push({ label: target.label, error: error.message, logFile });
        prompts.log.warn(`Could not prepare ${target.label}; see ${logFile}`);
      }
    }
    if (!report.preparedTargets.length) throw new Error('No usable builds. See preparation logs.');
    const selectedIds = requireSelection(
      await ask(
        prompts.multiselect({
          message: 'Prepared builds to benchmark (select at least one)',
          required: true,
          initialValues: report.preparedTargets.map((target) => target.id),
          options: report.preparedTargets.map((target) => ({
            value: target.id,
            label: target.label,
            hint: `${target.version} · ${target.commit.slice(0, 9)}`,
          })),
        }),
      ),
    );
    const selectedBuilds = report.preparedTargets.filter((target) => selectedIds.includes(target.id));
    const targets = [];
    for (const target of selectedBuilds) {
      const count = target.supportedSnapshotFlags.length;
      let setting = 'off';
      if (count < UNSAFE_SNAPSHOT_FLAGS.length) {
        prompts.log.info(
          `${target.label}: ${count}/${UNSAFE_SNAPSHOT_FLAGS.length} unsafe snapshot flags declared. ON is unavailable; supported flags stay OFF.`,
        );
      } else {
        setting = await ask(
          prompts.select({
            message: `Unsafe snapshot skips for ${target.label}`,
            initialValue: 'off',
            options: [
              { value: 'off', label: 'OFF', hint: 'all six false' },
              { value: 'on', label: 'ON', hint: 'all six true; weakens mutation checks' },
              { value: 'both', label: 'BOTH', hint: 'measure OFF and ON as separate candidates' },
            ],
          }),
        );
      }
      targets.push(...snapshotCandidates(target, setting));
    }
    report.targets = targets;
    if (targets.some((target) => target.snapshotSkips === 'on'))
      prompts.log.warn('Unsafe snapshot skips weaken mutation protection; ON and OFF are not security-equivalent.');
    report.baseline =
      targets.length === 1
        ? targets[0].id
        : await ask(
            prompts.select({
              message: 'Report baseline (ratios below 1.00x mean faster than this build)',
              options: targets.map((target) => ({ value: target.id, label: target.label })),
              initialValue: targets[0].id,
            }),
          );
    const scenarioIds = requireSelection(
      await ask(
        prompts.multiselect({
          message: 'Scenarios to run (select at least one)',
          required: true,
          options: SCENARIOS.map((scenario) => ({ value: scenario.id, label: scenario.label })),
          initialValues: ['plain-narrow', 'plain-wide', 'hydrated', 'document-rules', 'large-config'],
        }),
      ),
    );
    const config = {
      rows: await numberPrompt('Row counts, comma-separated', '10,100', 1, 10000, true),
      fields: await numberPrompt('Persisted string fields per document', 24, 4, 128),
      bytes: await numberPrompt('Repeated ASCII payload bytes per field (plus a small row/field prefix)', 32, 1, 4096),
      samples: await numberPrompt('Measured HTTP requests per job', 25, 5, 1000),
      warmup: await numberPrompt('Warmup HTTP requests per job (plus two output checks)', 5, 0, 100),
      concurrencies: await numberPrompt('Concurrent HTTP clients, comma-separated', '1', 1, 32, true),
      hookConcurrency: await numberPrompt('Per-request hook/bulk concurrency limit', 10, 1, 32),
    };
    if (Math.max(...config.rows) * config.fields * (config.bytes + 64) > 64 * 1024 * 1024)
      throw new Error('Fixture exceeds 64 MiB. Choose fewer rows/fields or a smaller payload.');
    if (config.samples < Math.max(...config.concurrencies))
      throw new Error('Measured request count must be at least the largest concurrent-client count.');
    report.config = {
      ...config,
      scenarios: scenarioIds,
      selectedBuilds: selectedIds,
      selectedTargets: targets.map((target) => target.id),
    };
    const total = targets.length * scenarioIds.length * config.rows.length * config.concurrencies.length;
    if (
      !(await ask(
        prompts.confirm({
          message: `Run ${total} jobs sequentially? Each job has a fresh Node worker and isolated database.`,
          initialValue: true,
        }),
      ))
    )
      throw new Cancelled('Benchmark cancelled before measurement.');
    mongo = await activity('Starting disposable MongoDB', () => MongoMemoryServer.create());
    const prefix = randomBytes(6).toString('hex');
    let index = 0;
    // Interleave builds within a scenario/size to reduce (not eliminate) drift.
    // No parallel jobs or builds. Only configured clients run concurrently inside a job.
    for (const scenario of scenarioIds)
      for (const rows of config.rows)
        for (const concurrency of config.concurrencies)
          for (const target of targets) {
            const id = String(++index).padStart(4, '0');
            const job = {
              ...config,
              scenario,
              rows,
              concurrency,
              target,
              uri: mongo.getUri(),
              database: `access_router_bench_${prefix}_${index}`,
            };
            const jobPath = resolve(scratch, `${id}-job.json`);
            const resultPath = resolve(scratch, `${id}-result.json`);
            const logFile = resolve(reportDirectory, `${id}-${target.id}-${scenario}.log`);
            await writeFile(jobPath, JSON.stringify(job));
            let result;
            try {
              await activity(
                `[${index}/${total}] ${target.label} · ${scenario} · ${rows} rows · ${concurrency} client(s)`,
                () =>
                  runLogged(process.execPath, [worker, jobPath, resultPath], {
                    cwd: root,
                    logFile,
                    signal: controller.signal,
                    timeoutMs: 30 * 60 * 1000,
                  }),
              );
              result = JSON.parse(await readFile(resultPath, 'utf8'));
            } catch (error) {
              controller.signal.throwIfAborted();
              try {
                result = JSON.parse(await readFile(resultPath, 'utf8'));
              } catch {
                result = { status: 'failed', error: error.message };
              }
              prompts.log.warn(`Job failed; continuing. See ${logFile}`);
            }
            report.results.push({ targetId: target.id, scenario, rows, concurrency, ...result, logFile });
            await saveReport(reportDirectory, report);
          }
    const rows = reportRows(report);
    console.table(rows);
    prompts.log.info(
      'Ratios = target median / baseline median (lower is faster). Different outputs never receive a ratio.',
    );
    prompts.log.info(
      'Historical dependency versions differ; small samples and fixed run ordering can bias results. Inspect raw samples before drawing conclusions.',
    );
    if (report.preparationFailures.length || rows.some((result) => result.status !== 'ok')) process.exitCode = 1;
    prompts.outro(`Reports and logs: ${reportDirectory}`);
  } catch (error) {
    report.error = error.message;
    report.cancelled = error instanceof Cancelled || controller.signal.aborted;
    prompts.log.info(`Partial report and logs: ${reportDirectory}`);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.cancelled ||= controller.signal.aborted;
    try {
      await saveReport(reportDirectory, report);
    } finally {
      try {
        if (mongo) await mongo.stop();
      } finally {
        if (scratch) await rm(scratch, { recursive: true, force: true });
      }
    }
  }
}

const interrupt = () => controller.abort(new Cancelled('Interrupted; partial report retained.'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  await main();
} catch (error) {
  if (error instanceof Cancelled || controller.signal.aborted) {
    prompts.cancel(error.message);
    process.exitCode = 130;
  } else {
    prompts.log.error(error.stack ?? String(error));
    process.exitCode = 1;
  }
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
