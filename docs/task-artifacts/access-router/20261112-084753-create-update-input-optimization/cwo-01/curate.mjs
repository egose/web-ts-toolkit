/** Curate owned CWO-01 machine observations; never edits a source, seal or old archive. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, identity, sha } from '../../../../../scripts/benchmarks/access-router-crud.mjs';
import { panelSummary } from '../../../../../scripts/benchmarks/access-router-crud-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const scratch = path.resolve(process.argv[2]);
const destination = path.resolve(process.argv[3]);
assert.ok(path.relative(root, scratch).startsWith('_tmp'), 'owned repository-local scratch required');
execFileSync('git', ['check-ignore', scratch], { cwd: root });
await fs.mkdir(destination); // EEXIST fails closed; never overwrite evidence.
const archive = [];
const read = async (relative) => JSON.parse(await fs.readFile(path.join(scratch, relative), 'utf8'));
const write = async (name, value, provenance = {}) => {
  const bytes = Buffer.from(JSON.stringify(value));
  assert.ok(!/\/home\/|\/tmp\/|ses_[A-Za-z0-9]+/.test(bytes.toString()), `privacy: ${name}`);
  await fs.writeFile(path.join(destination, name), bytes, { flag: 'wx' });
  archive.push({ path: name, bytes: bytes.length, archivedHash: sha(bytes), ...provenance });
};

const seal = await read('b/manifest.json');
const toolFiles = [
  'scripts/benchmarks/access-router-crud.mjs',
  'scripts/benchmarks/access-router-crud-worker.mjs',
  'scripts/benchmarks/access-router-crud-v2.mjs',
  'scripts/benchmarks/access-router-crud-v2-worker.mjs',
  'scripts/benchmarks/access-router-input-work.mjs',
  'packages/access-router/test/access-router-crud-fixture.ts',
  'packages/access-router/test/internal/access-router-crud-harness.unit.test.ts',
  'packages/access-router/test/internal/access-router-input-work.unit.test.ts',
  'packages/access-router/test/internal/write-input-parser-scheduling.unit.test.ts',
  'packages/access-router/test/invariants/write-input-native-observations.unit.test.ts',
  'packages/access-router/test/invariants/write-input-lifecycle-observations.unit.test.ts',
];
await write(
  'source.json',
  {
    identity: identity(seal),
    sourceFiles: seal.sourceFiles,
    distFiles: seal.distFiles,
    dependencies: seal.dependencies.map((d) => ({
      name: d.name,
      version: d.version,
      directory: d.directory,
      files: d.files.length,
      treeHash: digest(d.files),
    })),
    toolFiles: await Promise.all(toolFiles.map(async (file) => [file, sha(await fs.readFile(path.join(root, file)))])),
    repositoryToolPins: await fs.readFile(path.join(root, '.tool-versions'), 'utf8'),
    limitation:
      'Source/dist hash lists retained; operational bundles, binaries, dependencies and full dependency file lists omitted. DependencyHash requires the original operational manifest or a newly rebuilt seal; this archive is not relocatable or self-contained.',
  },
  { originalPath: 'b/manifest.json', originalBytesHash: sha(await fs.readFile(path.join(scratch, 'b/manifest.json'))) },
);

const input = await read('iw/work.json');
const countColumns = [...new Set(input.records.flatMap((r) => Object.keys(r.counts)))].sort();
const adapterColumns = [...new Set(input.records.flatMap((r) => Object.keys(r.adapterCounts)))].sort();
const traces = [],
  traceIds = new Map();
const traceId = (trace) => {
  const key = JSON.stringify(trace);
  if (!traceIds.has(key)) {
    traceIds.set(key, traces.length);
    traces.push(trace);
  }
  return traceIds.get(key);
};
const encode = (object, columns) => Object.entries(object).map(([key, value]) => [columns.indexOf(key), value]);
const rows = input.records.map((r) => {
  const modes = r.id
    .split('/')[0]
    .split('')
    .map((c) => (c === 'i' ? 'isolated' : 'trusted'));
  assert.deepEqual(r.configuredModes, modes);
  assert.deepEqual(r.resolvedModes, modes);
  return [
    r.id,
    encode(r.counts, countColumns),
    traceId(r.trace),
    encode(r.adapterCounts, adapterColumns),
    traceId(r.callbackTrace),
    r.fingerprint,
  ];
});
const restored = rows.map(([id, counts, phase, adapters, callbacks, fingerprint]) => ({
  id,
  configuredModes: id
    .split('/')[0]
    .split('')
    .map((c) => (c === 'i' ? 'isolated' : 'trusted')),
  resolvedModes: id
    .split('/')[0]
    .split('')
    .map((c) => (c === 'i' ? 'isolated' : 'trusted')),
  counts: Object.fromEntries(counts.map(([i, value]) => [countColumns[i], value])),
  trace: traces[phase],
  adapterCounts: Object.fromEntries(adapters.map(([i, value]) => [adapterColumns[i], value])),
  callbackTrace: traces[callbacks],
  fingerprint,
}));
assert.deepEqual(restored, input.records, 'work table must reconstruct every observation');
await write(
  'work.json',
  {
    manifest: input.manifest,
    selection: input.selection,
    countColumns,
    adapterColumns,
    traces,
    rowColumns: ['id', 'countPairs', 'phaseTraceIndex', 'adapterPairs', 'callbackTraceIndex', 'fingerprint'],
    rows,
    curation:
      'Lossless dictionary encoding of all 232 records. Pair indices refer to count/adapter columns, trace indices to traces. Four configured/resolved modes derive from the ID prefix after equality checks. Construction sites/PROMISE resources are not allocated bytes or performance benefit.',
  },
  { originalPath: 'iw/work.json', originalBytesHash: sha(await fs.readFile(path.join(scratch, 'iw/work.json'))) },
);

const files = [],
  frames = [],
  categories = [];
const frameIds = new Map();
const index = (values, value) => {
  let i = values.indexOf(value);
  if (i === -1) {
    i = values.length;
    values.push(value);
  }
  return i;
};
const frameId = (frame) => {
  const key = JSON.stringify(frame);
  if (!frameIds.has(key)) {
    frameIds.set(key, frames.length);
    frames.push([frame.function, index(files, frame.file), frame.line]);
  }
  return frameIds.get(key);
};
const profiles = [];
for (const name of ['native', 'functions']) {
  const profile = await read(`cp/${name}-curated.json`);
  const encoded = profile.rows.map((r) => [
    profile.cells.findIndex((c) => c.id === r.id),
    index(categories, r.category),
    r.stack.map(frameId),
    r.samples,
    r.sampledMicros,
  ]);
  const restored = encoded.map(([cell, category, stack, samples, sampledMicros]) => ({
    id: profile.cells[cell].id,
    category: categories[category],
    stack: stack.map((id) => ({ function: frames[id][0], file: files[frames[id][1]], line: frames[id][2] })),
    samples,
    sampledMicros,
  }));
  assert.deepEqual(restored, profile.rows, 'CPU table must reconstruct all in-window rows');
  for (const cell of profile.cells)
    assert.equal(
      profile.rows.filter((r) => r.id === cell.id).reduce((n, r) => n + r.sampledMicros, 0),
      cell.invocationMicros,
    );
  profiles.push({
    name,
    sourceHash: profile.sourceHash,
    bundleHash: profile.bundleHash,
    originalProfileBytesHash: profile.originalProfileBytesHash,
    rawProfileHash: profile.rawProfileHash,
    workerRecordHash: profile.workerRecordHash,
    originalCuratedBytesHash: sha(await fs.readFile(path.join(scratch, `cp/${name}-curated.json`))),
    cells: profile.cells,
    rows: encoded,
    limitations: profile.limitations,
  });
}
await write('cpu.json', {
  files,
  frames,
  frameColumns: ['function', 'fileIndex', 'bundledLine'],
  categories,
  rowColumns: ['cellIndex', 'categoryIndex', 'frameIndices', 'sampleContributions', 'overlapMicros'],
  profiles,
  curation:
    'Lossless encoding of curated in-window stacks and weights, not raw outside-window CPU profiles. Original warmup/reset/assertion samples, absolute clocks and worker CPU means are omitted. Counts and sampling attribution cannot establish CPU, latency, allocation or heap benefit.',
});

const packets = [];
for (const [name, dir] of [
  ['writes', 'nw'],
  ['inputs', 'ni'],
]) {
  const report = await read(`${dir}/report.json`),
    raw = await read(`${dir}/raw.json`),
    plan = await read(`${dir}/plan.json`);
  assert.equal(report.planHash, digest(plan));
  assert.deepEqual(panelSummary(raw, report.panels), report.cases, 'calibration must recalculate exactly');
  const workers = raw.flat().flatMap((round) => Object.values(round).flatMap((panel) => Object.values(panel)));
  const cells = workers.flatMap((w) => w.cells);
  const failed = cells.filter((c) => !c.warmup.stable);
  packets.push({
    name,
    panels: report.panels.length,
    cases: report.cases.length,
    timingWorkers: workers.length,
    diagnosticWorkers: report.panels.length * 2,
    pilotWorkers: report.panels.length,
    measuredOperations: cells.reduce((n, c) => n + c.samples.reduce((a, b) => a + b[0], 0), 0),
    measuredBatches: cells.reduce((n, c) => n + c.samples.length, 0),
    measuredWorkerWarmupOperations: cells.reduce((n, c) => n + c.warmup.operations, 0),
    pilotUnsettled: Object.values(plan)
      .flatMap((p) => p.pilotWarmup)
      .filter((w) => !w.stable).length,
    usableCases: report.cases.filter((c) => c.usable).length,
    noiseWithinCapCases: report.cases.filter((c) => c.metrics.wall.noise <= 0.2 && c.metrics.cpu.noise <= 0.2).length,
    warmupFailures: failed.length,
    shortWindows: report.cases.reduce((n, c) => n + c.quality.shortWindows, 0),
    failedWarmupsWithInsufficientHistory: failed.filter((c) => c.warmup.last.length < 4).length,
    failedWarmupsWithFewerThanFiveBlocks: failed.filter((c) => c.warmup.operations < 320).length,
    planHash: report.planHash,
    harnessHash: report.harnessHash,
    host: report.host,
  });
  await fs.mkdir(path.join(destination, name));
  for (const file of ['protocol.json', 'plan.json', 'work.json', 'raw.json', 'report.json']) {
    const bytes = await fs.readFile(path.join(scratch, dir, file));
    const relative = `${name}/${file}`;
    assert.ok(!/\/home\/|\/tmp\/|ses_[A-Za-z0-9]+/.test(bytes.toString()), `privacy: ${relative}`);
    JSON.parse(bytes);
    await fs.writeFile(path.join(destination, relative), bytes, { flag: 'wx' });
    archive.push({
      path: relative,
      bytes: bytes.length,
      archivedHash: sha(bytes),
      originalPath: `${dir}/${file}`,
      originalBytesHash: sha(bytes),
      curation: 'byte-preserving compact JSON copy; not reformatted',
    });
  }
}
await write('calibration-summary.json', {
  source: identity(seal),
  packets,
  result:
    'Complete calibration, zero of forty usable cells; no candidate timed or retained. The fixed warmup/noise gates block performance retention. No retries, dropped samples, widened caps or historical calibration reused.',
  claimLimitations:
    'Raw/plan/report packets recalculate exactly with the maintained v2 panelSummary. Source/fixture/runtime/tool identities and operation windows are current. Deterministic-adapter service work only; no MongoDB/HTTP latency, allocation or heap benefit.',
});
await write('manifest.json', {
  archive,
  source: identity(seal),
  omitted: [
    'operational source-selected/diagnostic bundles',
    'dependencies/binaries/builds/tarballs/consumers/database trees',
    'full dependency file inventories',
    'CPU samples outside operation windows, absolute clocks and profiled worker CPU means',
    'redundant scratch logs and legacy output-only work packet',
  ],
  reproducibility:
    'Calibrations and curated work/CPU rows reconstruct from this data. Rerunning service workloads requires the maintained fixture/drivers, source revision, compatible installed runtime/dependencies, a fresh build and a new checkout-local seal. The archive does not certify future candidates or relocate operational seals.',
});
console.log(
  JSON.stringify({
    destination: path.relative(root, destination),
    workRecords: rows.length,
    profileRows: profiles.reduce((n, p) => n + p.rows.length, 0),
    packets,
  }),
);
