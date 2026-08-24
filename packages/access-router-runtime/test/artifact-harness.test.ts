import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArtifactProbeJson, probeRelocatedAccessRouterArtifacts } from './support/artifact';
import { cleanupTrackedChildren } from './support/subprocess';
import { assertNoTrackedTempProjects, cleanupTempProjects } from './support/tmp';

function parseColdStartProbeJson(result: Parameters<typeof parseArtifactProbeJson>[0]) {
  const parsed = parseArtifactProbeJson(result) as {
    statusCode?: number;
    jitiLoads?: number;
    sourceFsSyncCalls?: number;
    elapsedMs?: number;
  };
  expect(parsed.elapsedMs).toEqual(expect.any(Number));
  return parsed;
}

describe('artifact relocation harness', () => {
  afterEach(async () => {
    await cleanupTrackedChildren();
    cleanupTempProjects();
    assertNoTrackedTempProjects();
  });

  it('runs relocated local and serverless artifacts without the original config or tsconfig', async () => {
    const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
    const probe = await probeRelocatedAccessRouterArtifacts(cliPath);

    try {
      expect(probe.localWithMutatedSourceResult).toMatchObject({ exitCode: 0, timedOut: false });
      expect(parseArtifactProbeJson(probe.localWithMutatedSourceResult)).toEqual({
        statusCode: 200,
        body: { value: 'original' },
      });

      expect(probe.localAfterSourceRemovalResult).toMatchObject({ exitCode: 0, timedOut: false });
      expect(parseArtifactProbeJson(probe.localAfterSourceRemovalResult)).toEqual({
        statusCode: 200,
        body: { value: 'original' },
      });

      expect(probe.serverlessAfterSourceRemovalResult).toMatchObject({ exitCode: 0, timedOut: false });
      expect(parseArtifactProbeJson(probe.serverlessAfterSourceRemovalResult)).toEqual({
        statusCode: 200,
        body: { value: 'original' },
      });
      for (const result of probe.coldStartResults) {
        expect(result).toMatchObject({ exitCode: 0, timedOut: false });
        const coldStart = parseColdStartProbeJson(result);
        expect(coldStart).toMatchObject({
          statusCode: 200,
          jitiLoads: 0,
          sourceFsSyncCalls: 0,
        });
        expect(coldStart.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(coldStart.elapsedMs).toBeLessThan(5_000);
      }

      expect(probe.localOutput).not.toContain(probe.sourceDir);
      expect(probe.serverlessOutput).not.toContain(probe.sourceDir);
      expect(`${probe.localOutput}\n${probe.serverlessOutput}`).not.toMatch(
        /loadAccessRouterRuntimeConfigSync|createConfigJiti|createJiti\(/,
      );
    } finally {
      probe.cleanup();
    }

    expect(existsSync(probe.sourceDir)).toBe(false);
    expect(existsSync(probe.artifactDir)).toBe(false);
  }, 45_000);
});
