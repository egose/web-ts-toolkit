// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProcess, writeFakeExecutable } from './support/process-harness';
import { createTestWorkspace, withTestWorkspace, workspaceWasRemoved } from './support/temp-workspace';

describe('isolated process harness', () => {
  it('creates isolated directories and removes them after success', async () => {
    let root = '';
    await withTestWorkspace((workspace) => {
      root = workspace.root;
      expect(
        new Set([workspace.source, workspace.target, workspace.sandbox, workspace.bin, workspace.consumer]).size,
      ).toBe(5);
      expect(existsSync(workspace.source)).toBe(true);
    });
    expect(existsSync(root)).toBe(false);
  });

  it('removes temporary files when the test operation fails', async () => {
    let failedRoot = '';
    await expect(
      withTestWorkspace((workspace) => {
        failedRoot = workspace.root;
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');
    expect(existsSync(failedRoot)).toBe(false);

    const failedWorkspace = createTestWorkspace();
    failedWorkspace.cleanup();
    expect(workspaceWasRemoved(failedWorkspace)).toBe(true);
  });

  it('captures status, output, argv, environment, and filesystem changes from a fake executable', async () => {
    await withTestWorkspace((workspace) => {
      const executable = join(workspace.bin, 'fake-tool');
      const captureFile = join(workspace.root, 'invocations.jsonl');
      const outputFile = join(workspace.sandbox, 'sentinel.txt');
      writeFakeExecutable(executable);
      writeFileSync(outputFile, 'unchanged');

      const result = runProcess(executable, ['deploy', '--site', 'example'], {
        cwd: workspace.sandbox,
        captureFile,
        snapshotRoot: workspace.sandbox,
        env: {
          CARMS_FAKE_STDOUT: 'ok',
          CARMS_FAKE_STDERR: 'warning',
          CARMS_FAKE_EXIT_CODE: '7',
          SAFE_CHILD_VALUE: 'visible',
        },
      });

      expect(result.status).toBe(7);
      expect(result.stdout).toBe('ok');
      expect(result.stderr).toBe('warning');
      expect(result.invocations).toHaveLength(1);
      expect(result.invocations[0]).toMatchObject({
        argv: ['deploy', '--site', 'example'],
        cwd: workspace.sandbox,
        env: { SAFE_CHILD_VALUE: 'visible' },
      });
      expect(result.invocations[0].argv).not.toContain('not-for-child');
      expect(result.invocations[0].env.UNRELATED_SECRET).toBeUndefined();
      expect(result.filesystem.changed).toEqual([]);
      expect(readFileSync(outputFile, 'utf8')).toBe('unchanged');
    });
  });
});
