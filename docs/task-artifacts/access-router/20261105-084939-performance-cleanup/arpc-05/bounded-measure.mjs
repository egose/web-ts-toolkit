/** One-off ARPC-05 exploratory packet. Not a maintained acceptance benchmark. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.cwd();
const v1 = await import(pathToFileURL(path.join(root, 'scripts/benchmarks/access-router-crud.mjs')));
const v2 = await import(pathToFileURL(path.join(root, 'scripts/benchmarks/access-router-crud-v2.mjs')));
const selectors = ['logging-direct', 'logging-public',
  'iiii/direct/list-single/hooks/1x4', 'tttt/direct/list-single/hooks/1x4',
  'iiii/public/list-single/hooks/1x4', 'tttt/public/list-single/hooks/1x4'];
const cases = v2.selectPanels(selectors).flatMap((p) => p.cases);
const settings = { rounds: 7, repeats: 2, warmups: 16, samples: 32, concurrency: 1, maxSeconds: 300, workerSeconds: 30 };

if (process.argv[2] === '--worker') {
  const directory = process.argv[3];
  const options = JSON.parse(process.argv[4]);
  const seal = await v1.verifySeal(directory, root, false);
  const api = createRequire(import.meta.url)(path.resolve(directory, 'worker.cjs'));
  assert.equal(api.sourceHash, seal.sourceHash);
  const out = { sourceHash: api.sourceHash, bundleHash: seal.bundleHash,
    ids: cases.map((c) => c.id), hashes: [], values: [], work: [] };
  for (const index of options.reverse ? [...cases.keys()].reverse() : [...cases.keys()]) {
    const f = api.createCrudFixture(cases[index], options.kind === 'diagnostic');
    try {
      let expected;
      let wall = 0;
      let cpu = 0;
      const count = options.kind === 'diagnostic' ? 1 : settings.warmups + settings.samples;
      for (let i = 0; i < count; i++) {
        f.reset();
        // No counters or spies in timed fixtures. Reset/assert/hash are outside the interval.
        const beforeCpu = process.cpuUsage();
        const start = performance.now();
        const result = await f.invoke();
        const elapsed = performance.now() - start;
        const used = process.cpuUsage(beforeCpu);
        const hash = v1.digest(f.check(result));
        if (expected) assert.equal(hash, expected);
        expected = hash;
        if (i >= settings.warmups) { wall += elapsed; cpu += (used.user + used.system) / 1000; }
      }
      out.hashes[index] = expected;
      if (options.kind === 'diagnostic') {
        const counts = { ...f.counts }, trace = [...f.trace];
        // Enabled logging is a separate diagnostic invocation, never a timed posture.
        const messages = [];
        f.runtime.setGlobalOptions({ logger: { isLevelEnabled: () => true, debug: (message) => messages.push(message) } });
        f.reset();
        assert.equal(v1.digest(f.check(await f.invoke())), expected);
        assert.deepEqual(f.counts, counts);
        assert.deepEqual(f.trace, trace);
        out.work[index] = { counts, trace, enabledMessages: messages.map((message) => {
          const { startedAt: _start, durationMs: _duration, ...stable } = JSON.parse(message);
          return stable;
        }) };
      } else out.values[index] = [wall / settings.samples, cpu / settings.samples];
    } finally { f.dispose(); }
  }
  if (options.kind === 'diagnostic') delete out.values;
  else delete out.work;
  console.log(JSON.stringify(out));
} else {
  const [baselineDir, candidateDir, destination] = process.argv.slice(2);
  assert.ok(path.resolve(destination).startsWith(`${process.env.TMPDIR}/`));
  const baseline = await v1.verifySeal(baselineDir);
  const candidate = await v1.verifySeal(candidateDir);
  v1.assertComparison(baseline, candidate);
  await fs.mkdir(destination);
  const protocol = { id: 'arpc-05-bounded-exploration', settings, selectors, cases, rule: v1.protocol.rule,
    baseline: v1.identity(baseline), candidate: v1.identity(candidate),
    scriptHash: v1.sha(await fs.readFile(fileURLToPath(import.meta.url))),
    preregistrationHash: v1.sha(await fs.readFile('docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-05/protocol.md')),
    host: { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    acceptance: false, limit: 'Short exploratory samples; no v2 convergence/window evidence or full P control coverage.' };
  await fs.writeFile(path.join(destination, 'protocol.json'), JSON.stringify(protocol), { flag: 'wx' });
  const deadline = Date.now() + settings.maxSeconds * 1000;
  async function child(directory, options) {
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, 'whole-packet budget exhausted');
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', directory, JSON.stringify(options)], {
        env: process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.min(settings.workerSeconds * 1000, remaining), killSignal: 'SIGKILL',
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code !== 0) return reject(new Error(`worker exit ${code}/${signal}: ${stderr}`));
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
    });
  }
  const ids = cases.map((c) => c.id);
  const raw = { noise: [], comparison: [] };
  try {
    const work = {};
    for (const side of ['baseline', 'candidate']) {
      work[side] = await child(side === 'baseline' ? baselineDir : candidateDir, { kind: 'diagnostic' });
      v1.validateWorker(work[side], side === 'baseline' ? baseline : candidate, ids);
    }
    assert.deepEqual(work.baseline.hashes, work.candidate.hashes, 'output/state mismatch');
    assert.deepEqual(work.baseline.work, work.candidate.work, 'enabled messages or non-log counts/traces changed');
    await fs.writeFile(path.join(destination, 'work.json'), JSON.stringify(work), { flag: 'wx' });
    let noise;
    for (const phase of ['noise', 'comparison']) {
      for (let repeat = 0; repeat < settings.repeats; repeat++) {
        raw[phase][repeat] = [];
        for (let round = 0; round < settings.rounds; round++) {
          const pair = {};
          for (const side of (round + repeat) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
            const isCandidate = phase === 'comparison' && side === 'candidate';
            const output = await child(isCandidate ? candidateDir : baselineDir, { kind: 'timing', reverse: repeat % 2 === 1 });
            v1.validateWorker(output, isCandidate ? candidate : baseline, ids);
            assert.deepEqual(output.hashes, work.baseline.hashes, 'timed output/state mismatch');
            pair[side] = output;
          }
          raw[phase][repeat].push(pair);
          await fs.writeFile(path.join(destination, 'raw.json'), JSON.stringify(raw));
        }
      }
      const report = v1.summarize(raw[phase], ids, noise);
      if (phase === 'noise') noise = report;
      await fs.writeFile(path.join(destination, `${phase}.json`), JSON.stringify({ ...protocol, phase, cases: report }), { flag: 'wx' });
    }
    await v1.verifySeal(baselineDir);
    await v1.verifySeal(candidateDir);
    console.log(JSON.stringify({ complete: true, timingWorkers: 56, cells: cases.length, acceptance: false,
      noiseWithinCap: noise.filter((c) => ['wall', 'cpu'].every((m) => c.metrics[m].noise <= .20)).length,
      seconds: (settings.maxSeconds * 1000 - (deadline - Date.now())) / 1000 }));
  } catch (error) {
    await fs.writeFile(path.join(destination, 'failure.json'), JSON.stringify({ complete: false, error: String(error).replaceAll(root, '<repo-root>') }));
    throw error;
  }
}
