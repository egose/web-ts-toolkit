import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import { benchmark } from './access-router-worker.mjs';
import {
  canonicalJson,
  fingerprint,
  integer,
  integerList,
  mapBounded,
  pnpmEnvironment,
  prepareTarget,
  reportRows,
  requireSelection,
  runLogged,
  saveReport,
  SCENARIOS,
  summarize,
} from './access-router-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryBase = process.env.WTT_BENCH_TMP ?? '/tmp/opencode';
await mkdir(temporaryBase, { recursive: true });
const temporary = await mkdtemp(resolve(temporaryBase, 'access-router-runner-tests-'));
after(() => rm(temporary, { recursive: true, force: true }));

test('numeric prompts reject invalid bounds/empty values and deduplicate matrices', () => {
  assert.equal(integer(' 24 ', 1, 100), 24);
  for (const value of ['', ' ', '-1', '1.2', 'Infinity', '1e3', '101', '0', '9007199254740993'])
    assert.throws(() => integer(value, 1, 100));
  assert.deepEqual(integerList('100, 1,10,100', 1, 1000), [1, 10, 100]);
  assert.throws(() => integerList('1,', 1, 100));
  assert.throws(() => integerList('1,2,3,4,5,6,7,8,9', 1, 100));
  assert.throws(() => requireSelection([]), /at least one/);
  assert.deepEqual(requireSelection(['current']), ['current']);
});

test('all advertised scenarios are uniquely selectable and include no-virtual paths', () => {
  assert.equal(new Set(SCENARIOS.map((scenario) => scenario.id)).size, SCENARIOS.length);
  for (const id of [
    'plain-narrow',
    'plain-wide',
    'hydrated',
    'global-rules',
    'document-rules',
    'large-config',
    'embedded',
    'populate',
    'virtuals',
  ])
    assert.ok(SCENARIOS.some((scenario) => scenario.id === id));
});

test('statistics include correct even median, nearest-rank p95, throughput and CPU', () => {
  const result = summarize([4, 1, 3, 2], 2000, 8000);
  assert.equal(result.medianMs, 2.5);
  assert.equal(result.p95Ms, 4);
  assert.equal(result.meanMs, 2.5);
  assert.equal(result.requestsPerSecond, 2);
  assert.equal(result.cpuMsPerRequest, 2);
  assert.throws(() => summarize([], 1, 1));
  assert.throws(() => summarize([NaN], 1, 1));
});

test('output hashes ignore object-key order but not array order or denied-field leaks', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }));
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint([1, 2]), fingerprint([2, 1]));
  assert.notEqual(fingerprint({ name: 'yes' }), fingerprint({ name: 'yes', hidden: 'no' }));
});

test('request workers are bounded, ordered and drained before the next phase', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapBounded(9, 2, async (index) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return index;
  });
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.deepEqual(
    results,
    Array.from({ length: 9 }, (_, index) => index),
  );
  await assert.rejects(
    mapBounded(10, 2, async (index) => {
      if (index === 0) throw new Error('expected failure');
      active++;
      await new Promise((done) => setTimeout(done, 5));
      active--;
    }),
    /expected failure/,
  );
  assert.equal(active, 0);
});

test('preparation builds current sources without checkout/install; tags use independent frozen installs', async () => {
  const calls = [];
  const fakeRoot = resolve(temporary, 'snapshot');
  await mkdir(resolve(fakeRoot, 'packages/access-router/dist'), { recursive: true });
  await writeFile(resolve(fakeRoot, 'VERSION'), '0.51.0\n');
  await writeFile(resolve(fakeRoot, 'pnpm-lock.yaml'), 'fixture');
  await writeFile(resolve(fakeRoot, 'packages/access-router/dist/index.mjs'), 'export {};');
  const options = {
    root: fakeRoot,
    repository: root,
    commit: 'a'.repeat(40),
    archive: resolve(temporary, 'tag.tar'),
    logFile: resolve(temporary, 'prepare.log'),
    run: async (command, args, config) => {
      calls.push({ command, args, config });
    },
  };
  const current = await prepareTarget({ ...options, current: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'pnpm');
  assert.ok(calls[0].args.includes('build'));
  assert.ok(calls[0].args.includes('--workspace-concurrency=1'));
  assert.match(current.distSha256, /^[a-f0-9]{64}$/);
  calls.length = 0;
  await prepareTarget(options);
  assert.deepEqual(
    calls.map((call) => call.command),
    ['git', 'tar', 'pnpm', 'pnpm'],
  );
  assert.deepEqual(calls[0].args, ['archive', '--format=tar', '--output', options.archive, options.commit]);
  assert.ok(calls[2].args.includes('--frozen-lockfile'));
  assert.ok(calls[2].args.includes('--ignore-scripts'));
  assert.equal(calls[2].config.cwd, fakeRoot);
  assert.deepEqual(calls[2].config.env, pnpmEnvironment);
  assert.ok(!calls.some((call) => call.args.some((arg) => /checkout|reset|clean|worktree/.test(arg))));
});

test('commands use argv, log failures and terminate on timeout/cancellation', async () => {
  const logFile = resolve(temporary, 'command.log');
  const marker = 'literal; $(not-a-shell)';
  await runLogged(process.execPath, ['-e', 'console.log(process.argv[1])', marker], { cwd: root, logFile });
  assert.ok((await readFile(logFile, 'utf8')).includes(marker));
  await assert.rejects(runLogged(process.execPath, ['-e', 'process.exit(7)'], { cwd: root, logFile }), /Exited 7/);
  await assert.rejects(
    runLogged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: root, logFile, timeoutMs: 50 }),
    /Timed out/,
  );
  const controller = new AbortController();
  const pending = runLogged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: root,
    logFile,
    signal: controller.signal,
  });
  const timer = setTimeout(() => controller.abort(new Error('test cancelled')), 50);
  try {
    await assert.rejects(pending, /test cancelled/);
  } finally {
    clearTimeout(timer);
  }
});

test('interactive commands keep terminal I/O out of logs and preserve failures/cancellation', async () => {
  const logFile = resolve(temporary, 'interactive.log');
  await runLogged(process.execPath, ['-e', 'process.stdout.write("terminal-only-output\\n")'], {
    cwd: root,
    logFile,
    interactive: true,
  });
  const contents = await readFile(logFile, 'utf8');
  assert.match(contents, /authentication prompts go to the terminal/);
  assert.match(contents, /\[exit: 0\]/);
  // The argv is logged, but the command's actual stdout must not be appended.
  assert.ok(!contents.includes('\nterminal-only-output\n'));
  await assert.rejects(
    runLogged(process.execPath, ['-e', 'process.exit(9)'], {
      cwd: root,
      logFile,
      interactive: true,
    }),
    /Exited 9/,
  );
  const controller = new AbortController();
  const pending = runLogged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: root,
    logFile,
    interactive: true,
    signal: controller.signal,
  });
  const timer = setTimeout(() => controller.abort(new Error('interactive cancelled')), 50);
  try {
    await assert.rejects(pending, /interactive cancelled/);
  } finally {
    clearTimeout(timer);
  }
});

test(
  'interactive children retain the parent session; build workers stay detached',
  {
    skip: process.platform !== 'linux',
  },
  async () => {
    const readSession = (text) => {
      const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
      return { group: fields[2], session: fields[3] };
    };
    const parent = readSession(await readFile('/proc/self/stat', 'utf8'));
    for (const interactive of [true, false]) {
      const resultPath = resolve(temporary, `session-${interactive}.txt`);
      await runLogged(
        process.execPath,
        [
          '-e',
          'const fs = require("node:fs"); fs.writeFileSync(process.argv[1], fs.readFileSync("/proc/self/stat"));',
          resultPath,
        ],
        { cwd: root, logFile: resolve(temporary, 'sessions.log'), interactive },
      );
      const child = readSession(await readFile(resultPath, 'utf8'));
      if (interactive) assert.deepEqual(child, parent);
      else {
        assert.notEqual(child.session, parent.session);
        assert.notEqual(child.group, parent.group);
      }
    }
  },
);

test('reports never compare failed/mismatched outputs and persist raw samples', async () => {
  const result = {
    targetId: 'old',
    scenario: 'plain-wide',
    rows: 10,
    concurrency: 1,
    status: 'ok',
    stats: summarize([1, 3], 5, 1000),
    outputFingerprint: 'same',
    readsPerRequest: 1,
    samplesMs: [1, 3],
  };
  const report = {
    startedAt: 'test',
    node: process.version,
    platform: process.platform,
    baseline: 'old',
    targets: [
      { id: 'old', label: 'v0.51.0' },
      { id: 'current', label: 'Current' },
    ],
    preparationFailures: [],
    results: [result, { ...result, targetId: 'current', stats: summarize([2, 6], 10, 2000) }],
  };
  assert.equal(reportRows(report)[1]['vs baseline'], '2.00x');
  report.results.push({ ...result, targetId: 'current', outputFingerprint: 'different' });
  report.results.push({ ...result, targetId: 'current', status: 'failed', error: 'test failure', stats: undefined });
  assert.equal(reportRows(report)[2].status, 'OUTPUT DIFF');
  assert.equal(reportRows(report)[2]['vs baseline'], '-');
  assert.equal(reportRows(report)[3]['vs baseline'], '-');
  const directory = resolve(temporary, 'report');
  await saveReport(directory, report);
  assert.deepEqual(JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8')).results[0].samplesMs, [1, 3]);
  assert.match(await readFile(resolve(directory, 'report.md'), 'utf8'), /OUTPUT DIFF/);
  assert.match(await readFile(resolve(directory, 'report.md'), 'utf8'), /test failure/);
});

test('CLI help is noninteractive and does not start builds or fetches', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    resolve(root, 'scripts/benchmarks/access-router.mjs'),
    '--help',
  ]);
  assert.match(stdout, /Fetch tags/);
  assert.match(stdout, /at least one/);
});

test('worker refuses oversized fixtures, foreign databases and modified builds before opening MongoDB', async () => {
  const entry = resolve(temporary, 'modified.mjs');
  await writeFile(entry, 'export {};');
  const job = {
    scenario: 'plain-wide',
    rows: 1,
    fields: 4,
    bytes: 1,
    samples: 1,
    warmup: 0,
    concurrency: 1,
    hookConcurrency: 1,
    database: 'access_router_bench_abcdef012345_1',
    target: { root, entry, distSha256: '0'.repeat(64) },
  };
  await assert.rejects(benchmark({ ...job, rows: 10000, fields: 128, bytes: 4096 }), /safety budget/);
  await assert.rejects(benchmark({ ...job, database: 'production' }), /owned benchmark database/);
  await assert.rejects(benchmark(job), /Prepared dist changed/);
});
