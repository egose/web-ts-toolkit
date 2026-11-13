import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { digest, median, verifySeal } from './access-router-crud.mjs';
import { catalog, protocol, warmupConverged } from './access-router-crud-v2.mjs';

const [directory, json] = process.argv.slice(2);
const settings = JSON.parse(json),
  panel = settings.panel;
const known = catalog().find((p) => p.id === panel.id);
assert.ok(
  known && panel.cases.length > 0 && panel.cases.length <= protocol.maxCasesPerWorker,
  'unknown/oversized panel',
);
for (const c of panel.cases)
  assert.deepEqual(
    c,
    known.cases.find((entry) => entry.id === c.id),
    'panel/fixture mismatch',
  );
const seal = await verifySeal(directory, undefined, false);
const api = createRequire(import.meta.url)(path.resolve(directory, 'worker.cjs'));
assert.equal(api.fixtureId, seal.fixtureId);
assert.equal(api.sourceHash, seal.sourceHash, 'wrong selected production code');
const result = {
  panel: panel.id,
  sourceHash: api.sourceHash,
  bundleHash: seal.bundleHash,
  ids: panel.cases.map((c) => c.id),
  hashes: [],
  values: [],
  cells: [],
  warmup: [],
  work: [],
};
const profiling = settings.phase === 'profile';
if (profiling) result.profiles = [];

for (const index of settings.reverse ? [...panel.cases.keys()].reverse() : [...panel.cases.keys()]) {
  const c = panel.cases[index];
  api.validateCase(c);
  const diagnostic = settings.phase === 'diagnostic';
  const f = api.createCrudFixture(c, diagnostic);
  const intervals = profiling ? [] : undefined;
  let expected;
  // Summed real-service intervals: reset/new request, checks, hashes and this loop's bookkeeping are outside timing.
  async function batch(count) {
    let wall = 0,
      cpu = 0;
    for (let i = 0; i < count; i++) {
      f.reset();
      const profileStart = intervals ? Number(process.hrtime.bigint() / 1000n) : undefined;
      const beforeCpu = process.cpuUsage(),
        start = performance.now();
      const output = await f.invoke();
      wall += performance.now() - start;
      const used = process.cpuUsage(beforeCpu);
      cpu += (used.user + used.system) / 1000;
      if (intervals) intervals.push([profileStart, Number(process.hrtime.bigint() / 1000n)]);
      const hash = digest(f.check(output));
      if (expected) assert.equal(hash, expected, 'unstable persisted state/output');
      expected = hash;
    }
    return [count, wall, cpu];
  }
  try {
    if (profiling) {
      // Separate CPU-sampling run: never used by noise/compare, no work counters.
      // hrtime windows exclude reset/request construction and assertions. These
      // profiled CPU values are NOT timing acceptance or candidate benefit data.
      await batch(128);
      intervals.length = 0;
      const n = settings.operations[index];
      assert.ok(
        Number.isSafeInteger(n) && n > 0 && n <= protocol.measurement.maxBatchOperations,
        'invalid profile operation count',
      );
      const b = await batch(n);
      result.profiles[index] = { operations: n, intervals };
      result.values[index] = [b[1] / n, b[2] / n];
    } else if (diagnostic) {
      f.reset();
      expected = digest(f.check(await f.invoke()));
      result.work[index] = {
        configuredModes: c.modes,
        resolvedModes: f.resolvedModes(),
        counts: f.counts,
        trace: f.trace,
      };
    } else {
      const blocks = [],
        start = performance.now();
      let operations = 0,
        stableChecks = 0,
        stable = false;
      while (true) {
        const b = await batch(settings.smoke ? 4 : protocol.warmup.blockOperations);
        blocks.push(b);
        operations += b[0];
        if (settings.smoke) break;
        const elapsed = performance.now() - start;
        stableChecks = warmupConverged(blocks, operations, elapsed) ? stableChecks + 1 : 0;
        if (stableChecks >= protocol.warmup.consecutiveStableChecks) {
          stable = true;
          break;
        }
        if (elapsed >= protocol.warmup.maxElapsedMs) break;
      }
      const warmup = {
        operations,
        elapsedMs: performance.now() - start,
        stable,
        last: blocks.slice(-protocol.warmup.historyBlocks),
      };
      result.warmup[index] = warmup;
      if (settings.phase === 'pilot') {
        result.values[index] = [1, 2].map((slot) => median(warmup.last.map((b) => b[slot] / b[0])));
      } else {
        const n = settings.operations[index];
        assert.ok(
          Number.isSafeInteger(n) && n > 0 && n <= protocol.measurement.maxBatchOperations,
          'invalid fixed operation count',
        );
        const samples = [];
        for (let i = 0; i < (settings.smoke ? 1 : protocol.measurement.batches); i++) samples.push(await batch(n));
        result.cells[index] = { warmup, samples };
        result.values[index] = [1, 2].map(
          (slot) => samples.reduce((sum, b) => sum + b[slot], 0) / (samples.length * n),
        );
      }
    }
    result.hashes[index] = expected;
  } finally {
    f.dispose();
  }
}
if (settings.phase === 'diagnostic') {
  delete result.values;
  delete result.cells;
  delete result.warmup;
} else delete result.work;
if (settings.phase === 'pilot') delete result.cells;
console.log(JSON.stringify(result));
