import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertComparison,
  freeze,
  identity,
  run,
  summarize,
  validateWorker,
  verifySeal,
} from '../../../../scripts/benchmarks/access-router-crud.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('CRUD paired driver fail-closed provenance', () => {
  it('rejects same-source candidates, mismatched fixtures/dependencies and misselected worker code', () => {
    const b = {
      sourceHash: 'old',
      bundleHash: 'old-bundle',
      fixtureId: 'v1',
      fixtureHash: 'fixture',
      dependencyHash: 'deps',
    };
    expect(() => assertComparison(b, b)).toThrow(/distinct production source/);
    expect(() => assertComparison(b, b, true)).not.toThrow();
    const c = { ...b, sourceHash: 'new', bundleHash: 'new-bundle' };
    expect(() => assertComparison(b, c)).not.toThrow();
    expect(() => assertComparison(b, { ...c, fixtureHash: 'changed' })).toThrow(/fixtureHash/);
    expect(() => assertComparison(b, { ...c, dependencyHash: 'changed' })).toThrow(/dependencyHash/);
    const good = {
      sourceHash: c.sourceHash,
      bundleHash: c.bundleHash,
      ids: ['case'],
      hashes: ['output'],
      values: [[1, 2]],
    };
    expect(() => validateWorker(good, c, ['case'])).not.toThrow();
    expect(() => validateWorker({ ...good, sourceHash: b.sourceHash }, c, ['case'])).toThrow(/wrong source/);
    expect(() => validateWorker({ ...good, bundleHash: b.bundleHash }, c, ['case'])).toThrow(/wrong bundle/);
    expect(() => validateWorker({ ...good, ids: ['different-mode'] }, c, ['case'])).toThrow(/case\/mode\/fixture/);
    expect(() => validateWorker({ ...good, values: [[NaN, 2]] }, c, ['case'])).toThrow(/invalid timing/);
  });

  it('uses preregistered per-case repeat/sign rules; never averages a slowdown away', () => {
    const raw = (a: number, b: number) =>
      [a, b].map((ratio) =>
        Array.from({ length: 7 }, () => ({
          baseline: {
            values: [
              [1, 1],
              [1, 1],
            ],
          },
          candidate: {
            values: [
              [ratio, ratio],
              [0.5, 0.5],
            ],
          },
        })),
      );
    const noise = summarize(raw(1.01, 0.99), ['slow', 'fast']);
    expect(noise[0].metrics.wall.noise).toBe(0.03);
    const report = summarize(raw(1.01, 1.01), ['slow', 'fast'], noise);
    expect(report[0].metrics.wall.result).toBe('repeatable-slowdown-investigate');
    expect(report[1].metrics.wall.result).toBe('noisy-claim-blocked'); // Deliberately enormous fake calibration.
    const fixed = noise.map((c) => ({ ...c, metrics: { wall: { noise: 0.03 }, cpu: { noise: 0.03 } } }));
    expect(summarize(raw(0.8, 0.8), ['a', 'b'], fixed)[0].metrics.cpu.result).toBe('benefit-needs-work-proof');
    expect(summarize(raw(0.8, 1.1), ['a', 'b'], fixed)[0].metrics.wall.result).toBe(
      'no-detectable-change-or-uncertain',
    );
  });

  it('freezes actual sources without overwrite; two real bundles select distinct source and run matching CRUD outputs', async () => {
    const parent = process.env.TMPDIR?.startsWith(`${root}/_tmp`) ? os.tmpdir() : root;
    const scratch = await fs.mkdtemp(path.join(parent, '_tmp-arpc-crud-driver-'));
    execFileSync('git', ['check-ignore', scratch], { cwd: root });
    const previousTmp = process.env.TMPDIR;
    process.env.TMPDIR = scratch;
    try {
      const baseline = path.join(scratch, 'baseline'),
        candidate = path.join(scratch, 'candidate');
      const sourceRoot = path.join(scratch, 'source');
      await fs.mkdir(path.join(sourceRoot, 'packages/access-router/test'), { recursive: true });
      for (const name of ['src', 'dist'])
        await fs.cp(
          path.join(root, 'packages/access-router', name),
          path.join(sourceRoot, 'packages/access-router', name),
          { recursive: true },
        );
      for (const name of ['package.json', 'test/access-router-crud-fixture.ts'])
        await fs.copyFile(
          path.join(root, 'packages/access-router', name),
          path.join(sourceRoot, 'packages/access-router', name),
        );
      await fs.copyFile(path.join(root, 'pnpm-lock.yaml'), path.join(sourceRoot, 'pnpm-lock.yaml'));
      await fs.symlink(
        path.join(root, 'packages/access-router/node_modules'),
        path.join(sourceRoot, 'packages/access-router/node_modules'),
        'dir',
      );
      const a = await freeze(sourceRoot, baseline);
      expect(identity(await verifySeal(baseline))).toEqual(a);
      await expect(freeze(sourceRoot, baseline)).rejects.toThrow(/EEXIST/);
      const productionFile = path.join(sourceRoot, 'packages/access-router/src/services/service.ts');
      await fs.appendFile(productionFile, '\n;globalThis.__arpcCrudSelectedSource = "candidate-marker";\n');
      const b = await freeze(sourceRoot, candidate);
      expect(() => assertComparison(a, b)).not.toThrow();
      const markerScript =
        'require(process.argv[1]); console.log(globalThis.__arpcCrudSelectedSource ?? "baseline-marker")';
      const marker = execFileSync(process.execPath, ['-e', markerScript, path.join(candidate, 'worker.cjs')], {
        encoding: 'utf8',
      });
      expect(marker.trim()).toBe('candidate-marker');
      const original = execFileSync(process.execPath, ['-e', markerScript, path.join(baseline, 'worker.cjs')], {
        encoding: 'utf8',
      });
      expect(original.trim()).toBe('baseline-marker');
      const smoke = await run('smoke', baseline, candidate, path.join(scratch, 'smoke'));
      expect(smoke.cases).toBe(432);
      expect(smoke.workers).toBe(2);
      const work = JSON.parse(await fs.readFile(path.join(scratch, 'smoke/work.json'), 'utf8'));
      expect(work.baseline.sourceHash).toBe(a.sourceHash);
      expect(work.candidate.sourceHash).toBe(b.sourceHash);
      expect(work.baseline.bundleHash).not.toBe(work.candidate.bundleHash);
      expect(work.baseline.hashes).toEqual(work.candidate.hashes);
      await fs.appendFile(path.join(candidate, 'worker.cjs'), '// corruption');
      await expect(verifySeal(candidate)).rejects.toThrow(/bundle mismatch/);
      // Baseline remains intact and selected even when candidate bytes are corrupted.
      expect((await verifySeal(baseline)).sourceHash).toBe(a.sourceHash);
    } finally {
      if (previousTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmp;
    }
  }, 120_000);
});
