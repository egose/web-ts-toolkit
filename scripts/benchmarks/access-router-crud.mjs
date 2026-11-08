/** Separate CRUD catalog. Does not change the identities/protocols of older LIST drivers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const fixture = 'packages/access-router/test/access-router-crud-fixture.ts';
const worker = path.join(here, 'access-router-crud-worker.mjs');
export const protocol = Object.freeze({
  id: 'access-router-crud-v1', rounds: 7, repeats: 2, warmups: 3, samples: 9,
  concurrency: 1, latency: 'deterministic adapter, NOT database latency',
  rule: 'Per case/metric: noise=max(0.03,p95(abs(paired noise ratio-1))). Noise>0.20 blocks claims. Benefit requires both repeat medians<1-noise and >=6/7 pairs<1 in EACH repeat, plus separately demonstrated reduced work. Both medians>1 and >=6/7 pairs>1 in EACH repeat require investigation even inside noise. Otherwise no detectable change/uncertain, never an aggregate acceptance.',
});
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const digest = (value) => sha(JSON.stringify(value));

function assertScratchDestination(destination) {
  assert.ok(process.env.TMPDIR && path.resolve(process.env.TMPDIR).startsWith(`${repo}/_tmp`), 'set TMPDIR to an ignored repo-local _tmp directory');
  execFileSync('git', ['check-ignore', path.relative(repo, process.env.TMPDIR)], { cwd: repo });
  const relative = path.relative(path.resolve(process.env.TMPDIR), path.resolve(destination));
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'new output must be inside TMPDIR');
}

async function filesUnder(root) {
  const result = [];
  async function visit(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push([path.relative(root, full).split(path.sep).join('/'), sha(await fs.readFile(full))]);
    }
  }
  await visit(root);
  return result;
}

async function packageRoot(entry) {
  let directory = path.dirname(await fs.realpath(entry));
  while (directory !== path.dirname(directory)) {
    try { await fs.access(path.join(directory, 'package.json')); return directory; } catch { directory = path.dirname(directory); }
  }
  throw new Error('Cannot locate dependency package');
}

async function dependencyGraph(entries, root) {
  const seen = new Set();
  const records = [];
  async function visit(entry) {
    if (isBuiltin(entry)) return; // Built-in names such as punycode resolve to Node, sealed separately.
    const directory = await packageRoot(entry);
    if (seen.has(directory)) return;
    seen.add(directory);
    const relative = path.relative(root, directory);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'dependency outside checkout');
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    records.push({ directory: relative, name: pkg.name, version: pkg.version, files: await filesUnder(directory) });
    const require = createRequire(path.join(directory, 'package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).sort()) {
      let resolved;
      try { resolved = require.resolve(name); } catch (error) {
        try { resolved = require.resolve(`${name}/package.json`); } catch {
          if (name in (pkg.optionalDependencies ?? {})) continue;
          throw error;
        }
      }
      await visit(resolved);
    }
  }
  for (const entry of [...entries].sort()) await visit(entry);
  return records.sort((a, b) => a.directory.localeCompare(b.directory, 'en'));
}

/** New destination only; no baseline bundle/source is ever overwritten. */
export async function freeze(root, destination) {
  root = path.resolve(root); destination = path.resolve(destination);
  assertScratchDestination(destination);
  await fs.mkdir(destination); // EEXIST is intentional, including partially prepared seals.
  const sourceFiles = await filesUnder(path.join(root, 'packages/access-router/src'));
  const sourceHash = digest(sourceFiles);
  const fixtureHash = sha(await fs.readFile(path.join(root, fixture)));
  const dependencies = new Set();
  const require = createRequire(path.join(root, 'packages/access-router/package.json'));
  const esbuild = require('esbuild');
  const built = await esbuild.build({
    absWorkingDir: root, bundle: true, platform: 'node', format: 'cjs', target: 'node24', write: false,
    stdin: { contents: `export * from './${fixture}'; export const sourceHash = ${JSON.stringify(sourceHash)};`, resolveDir: root, sourcefile: 'arpc-crud-entry.ts' },
    plugins: [{ name: 'frozen-external-identities', setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (isBuiltin(args.path)) return { path: args.path, external: true };
        const entry = createRequire(path.join(args.resolveDir, 'package.json')).resolve(args.path);
        dependencies.add(entry);
        return { path: entry, external: true };
      });
    } }],
  });
  assert.equal(digest(await filesUnder(path.join(root, 'packages/access-router/src'))), sourceHash, 'source changed while bundling');
  assert.equal(sha(await fs.readFile(path.join(root, fixture))), fixtureHash, 'fixture changed while bundling');
  const bytes = built.outputFiles[0].contents;
  await fs.writeFile(path.join(destination, 'worker.cjs'), bytes, { flag: 'wx' });
  await fs.cp(path.join(root, 'packages/access-router/src'), path.join(destination, 'src'), { recursive: true, errorOnExist: true });
  await fs.copyFile(path.join(root, fixture), path.join(destination, 'fixture.ts'));
  // Dist is provenance only. Timings use the source-selected worker.cjs above, not mutable dist.
  await fs.cp(path.join(root, 'packages/access-router/dist'), path.join(destination, 'dist'), { recursive: true, errorOnExist: true });
  const deps = await dependencyGraph(dependencies, repo);
  const manifest = {
    format: 1, fixtureId: protocol.id, sourceHash, sourceFiles, fixtureHash,
    bundleHash: sha(bytes), distFiles: await filesUnder(path.join(destination, 'dist')),
    dependencies: deps, dependencyHash: digest(deps),
    lockHash: sha(await fs.readFile(path.join(root, 'pnpm-lock.yaml'))),
    node: process.version, nodeBinaryHash: sha(await fs.readFile(process.execPath)), esbuild: esbuild.version,
    pnpm: execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).trim(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    productionDiffHash: sha(execFileSync('git', ['diff', 'HEAD', '--', 'packages/access-router/src'], { cwd: root })),
  };
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx' });
  await verifySeal(destination);
  return identity(manifest);
}

export function identity(m) {
  return Object.fromEntries(['format', 'fixtureId', 'sourceHash', 'fixtureHash', 'bundleHash', 'dependencyHash', 'lockHash', 'node', 'nodeBinaryHash', 'esbuild', 'pnpm', 'revision', 'productionDiffHash'].map((k) => [k, m[k]]));
}

export async function verifySeal(directory, root = repo, dependencies = true) {
  const m = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(m.format, 1, 'seal format');
  assert.equal(m.fixtureId, protocol.id, 'fixture identity');
  assert.equal(m.sourceHash, digest(m.sourceFiles), 'source manifest mismatch');
  assert.equal(m.sourceHash, digest(await filesUnder(path.join(directory, 'src'))), 'frozen source mismatch');
  assert.equal(m.fixtureHash, sha(await fs.readFile(path.join(directory, 'fixture.ts'))), 'frozen fixture mismatch');
  assert.equal(m.bundleHash, sha(await fs.readFile(path.join(directory, 'worker.cjs'))), 'frozen bundle mismatch');
  assert.deepEqual(m.distFiles, await filesUnder(path.join(directory, 'dist')), 'frozen dist mismatch');
  assert.equal(m.dependencyHash, digest(m.dependencies), 'dependency manifest mismatch');
  assert.equal(m.node, process.version, 'Node version mismatch');
  if (dependencies) {
    assert.equal(m.nodeBinaryHash, sha(await fs.readFile(process.execPath)), 'Node binary mismatch');
    assert.equal(m.lockHash, sha(await fs.readFile(path.join(root, 'pnpm-lock.yaml'))), 'lock mismatch');
    for (const dep of m.dependencies) {
      assert.ok(!path.isAbsolute(dep.directory) && !dep.directory.split(path.sep).includes('..'), 'dependency path escapes checkout');
      assert.deepEqual(dep.files, await filesUnder(path.join(root, dep.directory)), `dependency bytes changed: ${dep.name}`);
    }
  }
  return m;
}

export function assertComparison(baseline, candidate, noise = false) {
  for (const key of ['fixtureId', 'fixtureHash', 'dependencyHash', 'lockHash', 'node', 'nodeBinaryHash', 'esbuild', 'pnpm'])
    assert.equal(candidate[key], baseline[key], `comparison ${key} mismatch`);
  if (!noise) {
    assert.notEqual(candidate.sourceHash, baseline.sourceHash, 'candidate must select distinct production source; use noise for baseline-versus-baseline');
    assert.notEqual(candidate.bundleHash, baseline.bundleHash, 'candidate must select a distinct bundle');
  }
}

export const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * .95) - 1];
export function summarize(raw, ids, noiseCases) {
  return ids.map((id, index) => {
    const metrics = {};
    for (const [metric, slot] of [['wall', 0], ['cpu', 1]]) {
      const runs = Array.from({ length: raw.length }, (_, r) => raw[r].map((pair) => pair.candidate.values[index][slot] / pair.baseline.values[index][slot]));
      const bound = noiseCases ? noiseCases[index].metrics[metric].noise : Math.max(.03, p95(runs.flat().map((r) => Math.abs(r - 1))));
      const ratios = runs.map(median);
      const repeatSlowdown = runs.every((rs) => median(rs) > 1 && rs.filter((r) => r > 1).length >= 6);
      const benefit = bound <= .20 && runs.every((rs) => median(rs) < 1 - bound && rs.filter((r) => r < 1).length >= 6);
      const baseline = raw.flat().map((p) => p.baseline.values[index][slot]);
      const candidate = raw.flat().map((p) => p.candidate.values[index][slot]);
      metrics[metric] = {
        baselineMs: median(baseline), candidateMs: median(candidate), baselineP95Ms: p95(baseline), candidateP95Ms: p95(candidate),
        repeatRatios: ratios, noise: bound,
        result: !noiseCases ? 'noise-calibration' : bound > .20 ? 'noisy-claim-blocked' : repeatSlowdown ? 'repeatable-slowdown-investigate' : benefit ? 'benefit-needs-work-proof' : 'no-detectable-change-or-uncertain',
      };
    }
    return { id, requestsPerSecond: 1000 / metrics.wall.candidateMs, metrics };
  });
}

export function validateWorker(actual, expected, ids) {
  assert.equal(actual.sourceHash, expected.sourceHash, 'worker selected wrong source');
  assert.equal(actual.bundleHash, expected.bundleHash, 'worker selected wrong bundle');
  assert.deepEqual(actual.ids, ids, 'worker case/mode/fixture mismatch');
  assert.equal(actual.hashes.length, ids.length, 'worker output coverage mismatch');
  if (actual.values) {
    assert.equal(actual.values.length, ids.length, 'worker timing coverage mismatch');
    for (const row of actual.values) assert.ok(row.length === 2 && row.every((n) => Number.isFinite(n) && n > 0), 'invalid timing');
  }
}

async function child(directory, settings) {
  const args = [worker, directory, JSON.stringify(settings)];
  return new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, args, { env: globalThis.process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, killSignal: 'SIGKILL' });
    let stdout = '', stderr = '';
    process.stdout.on('data', (b) => { stdout += b; });
    process.stderr.on('data', (b) => { stderr += b; });
    process.on('error', reject);
    process.on('close', (code) => {
      if (code !== 0) { reject(new Error(`CRUD worker exit ${code}: ${stderr}`)); return; }
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
  });
}

export async function run(kind, baselineDirectory, candidateDirectory, destination, noiseFile) {
  assert.ok(['noise', 'compare', 'smoke'].includes(kind), 'unknown run kind');
  assertScratchDestination(destination);
  const b = await verifySeal(baselineDirectory), c = await verifySeal(candidateDirectory);
  assertComparison(b, c, kind !== 'compare');
  await fs.mkdir(destination);
  const settings = kind === 'smoke' ? { ...protocol, rounds: 1, repeats: 1, warmups: 1, samples: 1 } : protocol;
  let noise;
  if (kind === 'compare') {
    noise = JSON.parse(await fs.readFile(noiseFile, 'utf8'));
    assert.equal(noise.kind, 'noise', 'noise calibration required');
    assert.deepEqual(noise.protocol, protocol, 'noise protocol mismatch');
    assert.equal(noise.baseline.bundleHash, b.bundleHash, 'noise must calibrate this frozen baseline');
    assert.deepEqual(noise.host, host(), 'noise must use this host/runtime');
  }
  const preregistered = { kind, protocol: settings, baseline: identity(b), candidate: identity(c), host: host(),
    noiseHash: noiseFile ? sha(await fs.readFile(noiseFile)) : null,
    harnessHash: digest(await Promise.all(['access-router-crud.mjs', 'access-router-crud-worker.mjs'].map(async (name) => [name, sha(await fs.readFile(path.join(here, name)))]))),
  };
  if (noise) assert.equal(noise.harnessHash, preregistered.harnessHash, 'noise harness changed; recalibrate in a new packet');
  await fs.writeFile(path.join(destination, 'protocol.json'), JSON.stringify(preregistered), { flag: 'wx' });
  const bd = await child(baselineDirectory, { kind: 'diagnostic' });
  const cd = await child(candidateDirectory, { kind: 'diagnostic' });
  const ids = bd.ids;
  validateWorker(bd, b, ids); validateWorker(cd, c, ids);
  assert.deepEqual(cd.hashes, bd.hashes, 'diagnostic outputs/state differ');
  if (noise) assert.deepEqual(noise.cases.map((c) => c.id), ids, 'noise case coverage mismatch');
  await fs.writeFile(path.join(destination, 'work.json'), JSON.stringify({ ids, baseline: bd, candidate: cd }), { flag: 'wx' });
  const raw = [];
  for (let repeat = 0; repeat < settings.repeats; repeat++) {
    raw[repeat] = [];
    for (let round = 0; round < settings.rounds; round++) {
      const pair = {};
      const order = (round + repeat) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
      for (const side of order) {
        const output = await child(side === 'baseline' ? baselineDirectory : candidateDirectory, {
          kind: 'timing', warmups: settings.warmups, samples: settings.samples, reverse: repeat % 2 === 1,
        });
        validateWorker(output, side === 'baseline' ? b : c, ids);
        assert.deepEqual(output.hashes, bd.hashes, 'timed outputs/state differ');
        pair[side] = { values: output.values };
      }
      raw[repeat].push(pair);
      await fs.writeFile(path.join(destination, 'raw.json'), JSON.stringify({ ids, raw }));
    }
  }
  await verifySeal(baselineDirectory); await verifySeal(candidateDirectory);
  const report = { ...preregistered, cases: summarize(raw, ids, noise?.cases) };
  await fs.writeFile(path.join(destination, 'report.json'), JSON.stringify(report), { flag: 'wx' });
  return { kind, cases: ids.length, workers: settings.rounds * settings.repeats * 2, report: path.relative(repo, path.join(destination, 'report.json')) };
}

function host() {
  return { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'freeze' && args.length >= 1 && args.length <= 2) result = await freeze(args[1] ?? repo, args[0]);
  else if (command === 'noise' && args.length === 2) result = await run(command, args[0], args[0], args[1]);
  else if (command === 'smoke' && args.length === 3) result = await run(command, args[0], args[1], args[2]);
  else if (command === 'compare' && args.length === 4) result = await run(command, args[0], args[1], args[3], args[2]);
  else throw new Error('Usage: freeze NEW_SEAL [ROOT] | noise BASELINE NEW_OUTPUT | smoke BASELINE CANDIDATE NEW_OUTPUT | compare BASELINE CANDIDATE NOISE_REPORT NEW_OUTPUT');
  console.log(JSON.stringify(result));
}
