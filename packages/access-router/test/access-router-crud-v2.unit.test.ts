import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createCrudFixture, type CrudCase } from './access-router-crud-fixture';
import * as stages from '../src/acl/document-stage';
import { readServiceAuthorizationMode } from '../src/acl/service-authorization';
import { freeze } from '../../../scripts/benchmarks/access-router-crud.mjs';
import {
  catalog,
  operationsPerBatch,
  panelSummary,
  protocol,
  run,
  selectPanels,
  validatePanel,
  warmupConverged,
} from '../../../scripts/benchmarks/access-router-crud-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('v2 bounded real-CRUD timing panels', () => {
  it('keeps both active modes on every CRUD/upsert entry; only empty/miss controls deduplicate mode', () => {
    const panels = selectPanels();
    expect(panels).toHaveLength(10);
    const cases = panels.flatMap((p) => p.cases);
    expect(cases).toHaveLength(40);
    expect(new Set(cases.map((c) => c.id)).size).toBe(40);
    for (const p of catalog()) expect(p.cases.length).toBeLessThanOrEqual(protocol.maxCasesPerWorker);
    for (const entry of ['direct', 'public'])
      for (const operation of [
        'read-hit',
        'list-single',
        'list-many',
        'create-single',
        'create-bulk',
        'update-id',
        'upsert-create',
        'upsert-update',
      ]) {
        expect(
          cases.filter((c) => c.entry === entry && c.operation === operation).map((c) => c.modes.join('/')),
        ).toEqual(expect.arrayContaining([Array(4).fill('isolated').join('/'), Array(4).fill('trusted').join('/')]));
      }
    expect(cases.filter((c) => ['read-miss', 'list-empty'].includes(c.operation))).toHaveLength(4);
    expect(selectPanels(['scale-direct', 'metadata-public'])).toHaveLength(2);
    const exact = cases[0].id;
    expect(
      selectPanels([exact])
        .flatMap((p) => p.cases)
        .map((c) => c.id),
    ).toEqual([exact]);
    for (const invalid of [[], ['missing'], ['read-direct', 'read-direct'], ['core', 'read-direct']])
      expect(() => selectPanels(invalid)).toThrow();
  });

  it.each(catalog().flatMap((p) => p.cases))(
    '$id uses actual workers, resolved stage modes and equivalent write state',
    async (spec) => {
      const admitted = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const c = spec as CrudCase,
        f = createCrudFixture(c, true);
      try {
        const first = f.check(await f.invoke());
        expect(f.resolvedModes()).toEqual(c.modes);
        const creating = c.operation.startsWith('create') || c.operation === 'upsert-create';
        const updating = c.operation.startsWith('update') || c.operation === 'upsert-update';
        const selected = c.modes[creating ? 2 : updating ? 3 : c.operation.startsWith('list') ? 1 : 0];
        for (const [call, binding] of admitted.mock.calls)
          expect(readServiceAuthorizationMode(call, binding)).toBe(selected);
        f.reset();
        expect(f.check(await f.invoke())).toEqual(first);
      } finally {
        vi.restoreAllMocks();
        f.dispose();
      }
    },
  );

  it('requires minimum warmup time/work and detects wall OR CPU JIT drift before convergence', () => {
    const flat = Array.from({ length: 4 }, () => [64, 64, 64]);
    expect(warmupConverged(flat, 256, 500)).toBe(true);
    expect(warmupConverged(flat, 255, 500)).toBe(false);
    expect(warmupConverged(flat, 256, 499)).toBe(false);
    expect(warmupConverged(flat.slice(1), 256, 500)).toBe(false);
    expect(
      warmupConverged(
        [128, 100, 70, 50].map((n) => [64, n, n]),
        512,
        1000,
      ),
    ).toBe(false);
    expect(
      warmupConverged(
        [128, 100, 70, 50].map((n) => [64, 64, n]),
        512,
        1000,
      ),
    ).toBe(false);
    expect(operationsPerBatch(0.1)).toBe(768);
    expect(operationsPerBatch(100)).toBe(64);
    expect(operationsPerBatch(0.0001)).toBe(8192);
    for (const cost of [0, -1, NaN, Infinity]) expect(() => operationsPerBatch(cost)).toThrow();
  });

  it('retains the v1 cap/rule and does not hide noisy, unsettled or too-short windows', () => {
    const panels = selectPanels(['iiii/direct/read-hit/hooks/1x4']);
    const packet = (ratio = 1, stable = true, duration = 300) =>
      Array.from({ length: 2 }, () =>
        Array.from({ length: 7 }, () => ({
          'read-direct': Object.fromEntries(
            ['baseline', 'candidate'].map((side) => [
              side,
              {
                cells: [
                  {
                    warmup: { stable },
                    samples: [
                      [
                        300,
                        duration * (side === 'candidate' ? ratio : 1),
                        duration * (side === 'candidate' ? ratio : 1),
                      ],
                    ],
                  },
                ],
              },
            ]),
          ),
        })),
      );
    const noise = panelSummary(packet(), panels);
    expect(noise[0].usable).toBe(true);
    expect(noise[0].metrics.cpu.noise).toBe(0.03);
    expect(panelSummary(packet(1.01), panels, noise)[0].metrics.wall.result).toBe('repeatable-slowdown-investigate');
    expect(panelSummary(packet(0.8), panels, noise)[0].metrics.wall.result).toBe('benefit-needs-work-proof');
    expect(panelSummary(packet(1.4), panels)[0].usable).toBe(false);
    expect(panelSummary(packet(1, false), panels)[0].quality.warmupFailures).toBe(28);
    expect(panelSummary(packet(1, true, 10), panels)[0].quality.shortWindows).toBe(28);
    const invalidCalibration = panelSummary(packet(1, false), panels);
    expect(panelSummary(packet(), panels, invalidCalibration)[0].usable).toBe(false);
    const valid = {
      panel: 'read-direct',
      sourceHash: 'source',
      bundleHash: 'bundle',
      ids: [panels[0].cases[0].id],
      hashes: ['output'],
      values: [[1, 1]],
    };
    expect(() => validatePanel(valid, valid, panels[0])).not.toThrow();
    expect(() => validatePanel({ ...valid, ids: ['wrong-mode'] }, valid, panels[0])).toThrow(/case\/mode\/fixture/);
  });

  it('executes fixed multi-operation CREATE/UPDATE windows in fresh panel workers without counters in timing', async () => {
    const parent = process.env.TMPDIR?.startsWith(`${root}/_tmp`) ? process.env.TMPDIR : root;
    const scratch = await fs.mkdtemp(path.join(parent, '_tmp-arpc-crud-v2-'));
    execFileSync('git', ['check-ignore', scratch], { cwd: root });
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = scratch;
    try {
      const seal = path.join(scratch, 'seal'),
        out = path.join(scratch, 'smoke');
      await freeze(root, seal);
      const result = await run('smoke', seal, seal, out, undefined, ['single-public']);
      expect(result.cases).toBe(4);
      expect(result.timingWorkers).toBe(2);
      const raw = JSON.parse(await fs.readFile(path.join(out, 'raw.json'), 'utf8'));
      for (const side of ['baseline', 'candidate'])
        for (const cell of raw[0][0]['single-public'][side].cells) {
          expect(cell.samples).toHaveLength(1);
          expect(cell.samples[0][0]).toBe(2);
          expect(cell.warmup.operations).toBe(4);
        }
      const work = JSON.parse(await fs.readFile(path.join(out, 'work.json'), 'utf8'))['single-public'];
      expect(work.baseline.hashes).toEqual(work.candidate.hashes);
      expect(work.baseline.work[0].counts['adapter.create']).toBe(1);
      expect(work.baseline.work[2].counts['adapter.save']).toBe(1);
      expect(Object.hasOwn(raw[0][0]['single-public'].baseline.cells[0], 'work')).toBe(false);
      const report = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8'));
      expect(report.kind).toBe('smoke');
      expect(report.cases.every((c: any) => !c.usable)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
  }, 120_000);
});
