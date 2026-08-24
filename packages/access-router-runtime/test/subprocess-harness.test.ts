import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertSubprocessResult, cleanupTrackedChildren, runSubprocess } from './support/subprocess';
import {
  assertNoTrackedTempProjects,
  cleanupTempProjects,
  createTempProject,
  withTempProject,
  writeProjectFile,
} from './support/tmp';

describe('subprocess harness', () => {
  afterEach(async () => {
    await cleanupTrackedChildren();
    cleanupTempProjects();
    assertNoTrackedTempProjects();
  });

  it('asserts exit code, stdout, stderr, and timeout state', async () => {
    const result = await runSubprocess(
      process.execPath,
      ['-e', "console.log('ready'); console.error('failed'); process.exit(7);"],
      { timeoutMs: 3_000 },
    );

    assertSubprocessResult(result, {
      exitCode: 7,
      stdoutIncludes: 'ready',
      stderrIncludes: 'failed',
      timedOut: false,
    });
  });

  it('times out and cleans up a hanging child process', async () => {
    const result = await runSubprocess(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
      timeoutMs: 250,
    });

    assertSubprocessResult(result, { signal: 'SIGTERM', timedOut: true });
  });

  it('executes the built access-router-runtime CLI', async () => {
    const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
    const result = await runSubprocess(process.execPath, [cliPath, '--help'], { timeoutMs: 3_000 });

    assertSubprocessResult(result, {
      exitCode: 0,
      stdoutIncludes: 'wtt-access-router-runtime',
      timedOut: false,
    });
  });

  it('removes suite-owned temporary directories after subprocess use', async () => {
    const { dir, cleanup } = createTempProject('access-router-runtime-subprocess-');
    const filePath = writeProjectFile(dir, 'marker.txt', 'ok');
    const result = await runSubprocess(
      process.execPath,
      ['-e', `console.log(require('node:fs').readFileSync(${JSON.stringify(filePath)}, 'utf8'));`],
      { timeoutMs: 3_000 },
    );

    assertSubprocessResult(result, { exitCode: 0, stdoutIncludes: 'ok', timedOut: false });

    cleanup();
    expect(existsSync(dir)).toBe(false);
  });

  it('restores cwd even when a temp-project callback changes it', async () => {
    const originalCwd = process.cwd();

    await withTempProject(async (dir) => {
      process.chdir(dir);
      expect(process.cwd()).toBe(dir);
    }, 'access-router-runtime-cwd-');

    expect(process.cwd()).toBe(originalCwd);
    expect(existsSync(join(originalCwd, 'package.json'))).toBe(true);
  });
});
