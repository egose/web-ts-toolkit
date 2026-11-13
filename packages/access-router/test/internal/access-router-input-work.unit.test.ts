import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseId, createCrudFixture, type CrudCase } from '../access-router-crud-fixture';
import {
  buildInputProbe,
  collectInputWork,
  summarizeInputProfile,
} from '../../../../scripts/benchmarks/access-router-input-work.mjs';
import { digest } from '../../../../scripts/benchmarks/access-router-crud.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('diagnostic-only input work attribution on actual CRUD workers', () => {
  it('clips CPU samples to actual invocation windows instead of counting reset/fixture construction', () => {
    const profile = {
      startTime: 100,
      endTime: 140,
      nodes: [
        { id: 1, callFrame: { functionName: '(root)' }, children: [2] },
        { id: 2, callFrame: { functionName: 'boundedInputValue' }, children: [3] },
        { id: 3, callFrame: { functionName: 'visit' } },
      ],
      samples: [3, 3, 3, 3],
      timeDeltas: [10, 10, 10, 10],
    };
    const worker = {
      ids: ['one'],
      sourceHash: 'source',
      bundleHash: 'bundle',
      hashes: ['output'],
      profiles: [{ operations: 1, intervals: [[105, 115]] }],
    };
    const result = summarizeInputProfile(profile, worker);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ id: 'one', category: 'input-normalize', samples: 2, sampledMicros: 10 });
    expect(result.cells[0].invocationMicros).toBe(10);
    expect(() =>
      summarizeInputProfile(profile, { ...worker, profiles: [{ operations: 1, intervals: [[0, 200]] }] }),
    ).toThrow(/clock mismatch/);
  });

  it('observes normalization/selected/scrub/parser/rule/conversion work without changing output or source bytes', async () => {
    const scratch = await fs.mkdtemp(path.join(process.env.TMPDIR!, 'iw-'));
    execFileSync('git', ['check-ignore', scratch], { cwd: root });
    const { api, manifest } = await buildInputProbe(root, path.join(scratch, 'probe'));
    const cases: CrudCase[] = ['isolated', 'trusted'].flatMap((mode) =>
      (['create-single', 'update-id'] as const).map((operation) => {
        const spec = {
          modes: Array(4).fill(mode),
          entry: 'public' as const,
          operation,
          shape: 'input-markers' as const,
          rows: 1,
          width: 4,
        };
        return { ...spec, id: caseId(spec) };
      }),
    );
    const records = await collectInputWork(api, cases);
    expect(records).toHaveLength(4);
    expect(manifest.instrumented).toHaveLength(11);
    for (let i = 0; i < cases.length; i++) {
      const f = createCrudFixture(cases[i], true);
      try {
        const fingerprint = digest(f.check(await f.invoke()));
        expect(records[i].fingerprint).toBe(fingerprint);
        const counts = records[i].counts;
        expect(counts['input.preflight.calls']).toBe(2);
        expect(counts['input.normalize.passes.preflight']).toBe(2);
        expect(counts['input.normalize.passes.admission']).toBe(1);
        expect(counts['input.normalize.passes.prepared']).toBe(1);
        expect(counts['input.selected.nodes']).toBeGreaterThan(0);
        expect(counts['input.scrub.passes']).toBe(1);
        expect(counts['parser.dateMarkers']).toBe(3);
        expect(counts['promise.resources']).toBeGreaterThan(counts['parser.entries']);
        expect(counts['rules.create.enumerations'] ?? counts['rules.update.enumerations']).toBe(1);
        // Counts are diagnostic baseline evidence, not a permanent optimization veto.
        // Keep the behavior comparison if future private work counts change.
        expect(counts['lifecycle.finalSnapshot.convert']).toBe(1);
        expect(counts['lifecycle.originalSnapshot.convert'] ?? 0).toBe(cases[i].operation === 'update-id' ? 1 : 0);
        expect(records[i].adapterCounts['adapter.create'] ?? 0).toBe(cases[i].operation === 'create-single' ? 1 : 0);
        expect(records[i].adapterCounts['adapter.save'] ?? 0).toBe(cases[i].operation === 'update-id' ? 1 : 0);
      } finally {
        f.dispose();
      }
    }
    const worker = path.join(root, 'scripts/benchmarks/access-router-crud-v2-worker.mjs');
    // This is a profile-mode wiring check, not an actual profiler or calibration.
    const { freeze } = await import('../../../../scripts/benchmarks/access-router-crud.mjs');
    const seal = path.join(scratch, 'seal');
    await freeze(root, seal);
    const spec = cases[1];
    const profiled = JSON.parse(
      execFileSync(
        process.execPath,
        [
          worker,
          seal,
          JSON.stringify({
            phase: 'profile',
            panel: {
              id: 'input-native-public',
              cases: [
                {
                  ...spec,
                  shape: 'input-native',
                  width: 16,
                  id: caseId({ ...spec, shape: 'input-native', width: 16 }),
                },
              ],
            },
            operations: [2],
          }),
        ],
        { encoding: 'utf8' },
      ),
    );
    expect(profiled.profiles[0].operations).toBe(2);
    expect(profiled.profiles[0].intervals).toHaveLength(2);
    expect(profiled.profiles[0].intervals.every(([a, b]: number[]) => b > a)).toBe(true);
    expect(profiled).not.toHaveProperty('work');
  }, 120_000);
});
