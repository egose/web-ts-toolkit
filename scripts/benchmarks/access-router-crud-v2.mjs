/** Panel/window protocol; v1 source, seals, catalog and evidence remain unchanged. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertComparison, digest, identity, median, protocol as v1, sha, summarize, validateWorker, verifySeal } from './access-router-crud.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const worker = path.join(here, 'access-router-crud-v2-worker.mjs');
export const protocol = Object.freeze({
  id: 'access-router-crud-panels-v2', rounds: 7, repeats: 2, concurrency: 1,
  maxCasesPerWorker: 4, maxBatchSeconds: 1800, workerTimeoutSeconds: 120,
  warmup: { minOperations: 256, minElapsedMs: 500, maxElapsedMs: 2500, blockOperations: 64, historyBlocks: 4, maxDrift: .10, consecutiveStableChecks: 2 },
  measurement: { batches: 3, targetBatchServiceMs: 75, minBatchOperations: 64, maxBatchOperations: 8192, operationQuantum: 64, minTotalServiceMs: 100 },
  order: 'Fresh worker per side/panel/pair. Alternate side order; reverse panel and case traversal in repeat two. Fixed baseline-pilot operation counts on BOTH sides.',
  latency: 'Real service plus deterministic local adapters, NOT database latency. Reset/request construction/assertions excluded from each timed operation.',
  rule: v1.rule, // Deliberately identical: neither noise cap nor slowdown/benefit rules are relaxed.
});

const modes = [['isolated', 'isolated', 'isolated', 'isolated'], ['trusted', 'trusted', 'trusted', 'trusted']];
const spec = (entry, operation, mode, shape = 'hooks', rows = 1, width = 4) => {
  const c = { modes: modes[mode], entry, operation, shape, rows, width };
  return { ...c, id: `${c.modes.map((m) => m[0]).join('')}/${entry}/${operation}/${shape}/${rows}x${width}` };
};
export function catalog() {
  const panels = [];
  for (const entry of ['direct', 'public']) {
    const add = (family, cases, core = true) => panels.push({ id: `${family}-${entry}`, core, cases });
    const pair = (op, shape = 'hooks', rows = 1, width = 4) => modes.map((_, i) => spec(entry, op, i, shape, rows, width));
    add('read', [...pair('read-hit'), spec(entry, 'read-miss', 0, 'bare', 1, 1), spec(entry, 'list-empty', 0, 'bare', 1, 1)]);
    add('control', [...pair('read-hit', 'bare', 1, 1), ...pair('list-single')]);
    add('single', [...pair('create-single'), ...pair('update-id')]);
    add('upsert', [...pair('upsert-create'), ...pair('upsert-update')]);
    add('scale', [...pair('list-many', 'hooks', 16, 16), ...pair('create-bulk', 'hooks', 16, 16)]);
    for (const shape of ['rich', 'metadata']) add(shape, [...pair('list-many', shape, 16, 16), ...pair('create-bulk', shape, 16, 16)], false);
    add('logging', pair('list-many', 'logging', 16, 16), false);
    add('fallback', pair('read-fallback'), false);
  }
  return panels;
}

/** Exact named panels or exact case IDs; selection is preregistered before the baseline pilot. */
export function selectPanels(selection = ['core']) {
  assert.ok(Array.isArray(selection) && selection.length > 0, 'nonempty selection required');
  assert.equal(new Set(selection).size, selection.length, 'duplicate selection');
  const all = catalog();
  const selected = new Set();
  for (const token of selection) {
    const panel = all.find((p) => p.id === token);
    const matches = token === 'core' ? all.filter((p) => p.core).flatMap((p) => p.cases) : panel?.cases ?? all.flatMap((p) => p.cases).filter((c) => c.id === token);
    assert.ok(matches.length, `unknown panel/case: ${token}`);
    for (const c of matches) { assert.ok(!selected.has(c.id), `overlapping selection: ${c.id}`); selected.add(c.id); }
  }
  return all.map((p) => ({ ...p, cases: p.cases.filter((c) => selected.has(c.id)) })).filter((p) => p.cases.length);
}

export function warmupConverged(blocks, operations, elapsedMs) {
  const w = protocol.warmup;
  if (operations < w.minOperations || elapsedMs < w.minElapsedMs || blocks.length < w.historyBlocks) return false;
  const recent = blocks.slice(-w.historyBlocks);
  return [1, 2].every((slot) => {
    const previous = median(recent.slice(0, 2).map((b) => b[slot] / b[0]));
    const next = median(recent.slice(2).map((b) => b[slot] / b[0]));
    return previous > 0 && Math.abs(next / previous - 1) <= w.maxDrift;
  });
}

export function operationsPerBatch(wallMsPerOperation) {
  assert.ok(Number.isFinite(wallMsPerOperation) && wallMsPerOperation > 0, 'invalid pilot cost');
  const m = protocol.measurement;
  return Math.min(m.maxBatchOperations, Math.max(m.minBatchOperations,
    Math.ceil(m.targetBatchServiceMs / wallMsPerOperation / m.operationQuantum) * m.operationQuantum));
}

export function panelSummary(raw, panels, noiseCases) {
  const cases = panels.flatMap((p) => p.cases);
  const means = raw.map((run) => run.map((round) => {
    const result = { baseline: { values: [] }, candidate: { values: [] } };
    for (const p of panels) for (const side of ['baseline', 'candidate']) {
      for (const cell of round[p.id][side].cells) {
        const count = cell.samples.reduce((sum, b) => sum + b[0], 0);
        result[side].values.push([1, 2].map((slot) => cell.samples.reduce((sum, b) => sum + b[slot], 0) / count));
      }
    }
    return result;
  }));
  const stats = summarize(means, cases.map((c) => c.id), noiseCases);
  let index = 0;
  for (const p of panels) for (let i = 0; i < p.cases.length; i++, index++) {
    const cells = raw.flat().flatMap((r) => ['baseline', 'candidate'].map((side) => r[p.id][side].cells[i]));
    const warmupFailures = cells.filter((c) => !c.warmup.stable).length;
    const shortWindows = cells.filter((c) => c.samples.reduce((sum, b) => sum + b[1], 0) < protocol.measurement.minTotalServiceMs).length;
    stats[index].panel = p.id;
    stats[index].quality = { warmupFailures, shortWindows, workers: cells.length };
    stats[index].usable = warmupFailures === 0 && shortWindows === 0 && (!noiseCases || noiseCases[index].usable) && ['wall', 'cpu'].every((m) => stats[index].metrics[m].noise <= .20);
    if (noiseCases && (warmupFailures || shortWindows)) for (const m of ['wall', 'cpu']) stats[index].metrics[m].result = 'warmup-or-window-claim-blocked';
    else if (noiseCases && !noiseCases[index].usable) for (const m of ['wall', 'cpu']) stats[index].metrics[m].result = 'noise-calibration-claim-blocked';
  }
  return stats;
}

function host() {
  return { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length };
}
function scratch(destination) {
  const tmp = process.env.TMPDIR;
  assert.ok(tmp && path.isAbsolute(tmp) && path.relative(root, tmp).startsWith('_tmp'), 'absolute ignored repo-local TMPDIR required');
  execFileSync('git', ['check-ignore', tmp], { cwd: root });
  const relative = path.relative(tmp, path.resolve(destination));
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'new output must be inside TMPDIR');
}
async function toolHash() {
  return digest(await Promise.all(['access-router-crud-v2.mjs', 'access-router-crud-v2-worker.mjs', 'access-router-crud.mjs'].map(async (name) => [name, sha(await fs.readFile(path.join(here, name)))])));
}
async function child(directory, panel, settings, deadline) {
  const remaining = deadline - Date.now();
  assert.ok(remaining > 0, 'batch runtime budget exceeded; partial packet is not acceptance');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, path.resolve(directory), JSON.stringify({ ...settings, panel })], {
      env: process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.min(protocol.workerTimeoutSeconds * 1000, remaining), killSignal: 'SIGKILL',
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (b) => { stdout += b; }); child.stderr.on('data', (b) => { stderr += b; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) { reject(new Error(`panel ${panel.id}: worker exit ${code}/${signal}: ${stderr}`)); return; }
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
  });
}
export function validatePanel(output, manifest, panel) {
  validateWorker(output, manifest, panel.cases.map((c) => c.id));
  assert.equal(output.panel, panel.id, 'wrong panel');
  assert.ok(panel.cases.length > 0 && panel.cases.length <= protocol.maxCasesPerWorker, 'panel fixture bound');
  if (output.cells) {
    assert.equal(output.cells.length, panel.cases.length, 'missing worker cells');
    for (const c of output.cells) for (const b of c.samples) assert.ok(b.length === 3 && b.every((n) => Number.isFinite(n) && n > 0) && Number.isSafeInteger(b[0]), 'invalid batch');
  }
}

/** No candidate is loaded by noise; it uses the same original sealed production bundle twice. */
export async function run(kind, baselineDirectory, candidateDirectory, destination, noiseDirectory, selection = ['core']) {
  assert.ok(['noise', 'compare', 'smoke'].includes(kind), 'unknown run kind');
  scratch(destination);
  const baseline = await verifySeal(baselineDirectory), candidate = await verifySeal(candidateDirectory);
  assertComparison(baseline, candidate, kind !== 'compare');
  let panels = selectPanels(selection), noise, plan;
  const harnessHash = await toolHash();
  if (kind === 'compare') {
    noise = JSON.parse(await fs.readFile(path.join(noiseDirectory, 'report.json'), 'utf8'));
    assert.equal(noise.kind, 'noise', 'complete v2 noise packet required');
    assert.deepEqual(noise.protocol, protocol, 'noise protocol mismatch');
    assert.equal(noise.harnessHash, harnessHash, 'noise tooling changed');
    assert.equal(noise.baseline.bundleHash, baseline.bundleHash, 'wrong noise baseline');
    assert.deepEqual(noise.host, host(), 'noise host/runtime mismatch');
    panels = noise.panels;
    const all = catalog().flatMap((p) => p.cases);
    for (const p of panels) for (const c of p.cases) assert.deepEqual(c, all.find((entry) => entry.id === c.id), 'noise fixture mismatch');
    plan = JSON.parse(await fs.readFile(path.join(noiseDirectory, 'plan.json'), 'utf8'));
    assert.equal(digest(plan), noise.planHash, 'noise pilot plan mismatch');
  }
  await fs.mkdir(destination);
  const packet = { kind, protocol, baseline: identity(baseline), candidate: identity(candidate), panels, host: host(), harnessHash };
  await fs.writeFile(path.join(destination, 'protocol.json'), JSON.stringify(packet), { flag: 'wx' });
  const deadline = Date.now() + protocol.maxBatchSeconds * 1000;
  const work = {}, raw = [];
  try {
    if (!plan) plan = {};
    for (const panel of panels) {
      const diagnostic = {};
      for (const side of ['baseline', 'candidate']) {
        const out = await child(side === 'baseline' ? baselineDirectory : candidateDirectory, panel, { phase: 'diagnostic' }, deadline);
        validatePanel(out, side === 'baseline' ? baseline : candidate, panel);
        diagnostic[side] = out;
      }
      assert.deepEqual(diagnostic.baseline.hashes, diagnostic.candidate.hashes, 'diagnostic output/state mismatch');
      work[panel.id] = diagnostic;
      if (kind !== 'compare') {
        if (kind === 'smoke') plan[panel.id] = { operations: panel.cases.map(() => 2), smoke: true };
        else {
          const pilot = await child(baselineDirectory, panel, { phase: 'pilot' }, deadline);
          validatePanel(pilot, baseline, panel);
          assert.deepEqual(pilot.hashes, diagnostic.baseline.hashes, 'pilot output/state mismatch');
          plan[panel.id] = { operations: pilot.values.map(([wall]) => operationsPerBatch(wall)), pilotWarmup: pilot.warmup };
        }
      }
    }
    await fs.writeFile(path.join(destination, 'work.json'), JSON.stringify(work), { flag: 'wx' });
    await fs.writeFile(path.join(destination, 'plan.json'), JSON.stringify(plan), { flag: 'wx' });
    const repeats = kind === 'smoke' ? 1 : protocol.repeats, rounds = kind === 'smoke' ? 1 : protocol.rounds;
    for (let repeat = 0; repeat < repeats; repeat++) {
      raw[repeat] = [];
      for (let round = 0; round < rounds; round++) {
        const current = raw[repeat][round] = {};
        for (const panel of repeat % 2 ? [...panels].reverse() : panels) {
          current[panel.id] = {};
          for (const side of (round + repeat) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
            const out = await child(side === 'baseline' ? baselineDirectory : candidateDirectory, panel, {
              phase: 'timing', smoke: kind === 'smoke', operations: plan[panel.id].operations, reverse: repeat % 2 === 1,
            }, deadline);
            validatePanel(out, side === 'baseline' ? baseline : candidate, panel);
            assert.deepEqual(out.hashes, work[panel.id].baseline.hashes, 'timed output/state mismatch');
            assert.deepEqual(out.cells.map((c) => c.samples.map((b) => b[0])), plan[panel.id].operations.map((n) => Array(kind === 'smoke' ? 1 : protocol.measurement.batches).fill(n)), 'worker changed fixed pilot operation counts');
            current[panel.id][side] = { sourceHash: out.sourceHash, bundleHash: out.bundleHash, outputHash: digest(out.hashes), cells: out.cells };
          }
          await fs.writeFile(path.join(destination, 'raw.json'), JSON.stringify(raw));
          process.stderr.write(`${JSON.stringify({ repeat: repeat + 1, round: round + 1, panel: panel.id })}\n`);
        }
      }
    }
    await verifySeal(baselineDirectory); await verifySeal(candidateDirectory);
    const cases = panelSummary(raw, panels, noise?.cases);
    const report = { ...packet, planHash: digest(plan), cases };
    await fs.writeFile(path.join(destination, 'report.json'), JSON.stringify(report), { flag: 'wx' });
    return { kind, panels: panels.length, cases: cases.length, timingWorkers: repeats * rounds * panels.length * 2,
      usableCases: cases.filter((c) => c.usable).length, report: path.relative(root, path.join(destination, 'report.json')) };
  } catch (error) {
    await fs.writeFile(path.join(destination, 'failure.json'), JSON.stringify({ error: String(error).replaceAll(root, '<repo-root>'), complete: false }));
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'plan') result = { protocol, panels: selectPanels(args.length ? args : ['core']) };
  else if (command === 'noise' && args.length >= 2) result = await run('noise', args[0], args[0], args[1], undefined, args.slice(2).length ? args.slice(2) : ['core']);
  else if (command === 'smoke' && args.length >= 2) result = await run('smoke', args[0], args[0], args[1], undefined, args.slice(2).length ? args.slice(2) : ['read-direct']);
  else if (command === 'compare' && args.length === 4) result = await run('compare', args[0], args[1], args[3], args[2]);
  else throw new Error('Usage: plan [PANEL_OR_CASE ...] | noise BASELINE NEW_OUTPUT [PANEL_OR_CASE ...] | smoke BASELINE NEW_OUTPUT [PANEL_OR_CASE ...] | compare BASELINE CANDIDATE NOISE_DIRECTORY NEW_OUTPUT');
  console.log(JSON.stringify(result));
}
