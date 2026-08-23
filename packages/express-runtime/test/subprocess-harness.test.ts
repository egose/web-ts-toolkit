import { describe, it, expect, afterEach } from 'vitest';
import { runSubprocess, cleanupTrackedChildren } from './support/subprocess';
import { createTempDir } from './support/tmp';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('subprocess harness — deterministic exit, stderr, timeout, no hanging handles', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await cleanupTrackedChildren();
    for (const d of tempDirs.splice(0)) {
      try {
        const { rmSync } = await import('node:fs');
        rmSync(d, { recursive: true, force: true });
      } catch (_e) {
        void _e;
      }
    }
  });

  it('asserts exit code and stderr via subprocess helper', async () => {
    const result = await runSubprocess(process.execPath, ['-e', "console.error('boom'); process.exit(42)"], {
      timeoutMs: 3000,
    });
    expect(result.exitCode).toBe(42);
    expect(result.stderr).toContain('boom');
    expect(result.timedOut).toBe(false);
  });

  it('asserts stdout and exit 0', async () => {
    const result = await runSubprocess(process.execPath, ['-e', "console.log('hello');"], {
      timeoutMs: 3000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.timedOut).toBe(false);
  });

  it('times out and kills hanging child without hanging handles', async () => {
    const result = await runSubprocess(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], { timeoutMs: 500 });
    // Should have timed out and killed the child
    expect(result.timedOut).toBe(true);
    // exitCode may be null & signal SIGTERM
    expect(result.signal).toBe('SIGTERM');
  });

  it('captures CLI --help output via subprocess without hanging', async () => {
    // Use the built CLI via node dist/cli.js --help as subprocess; ensures no unhandled rejection
    const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
    const result = await runSubprocess(process.execPath, [cliPath, '--help'], { timeoutMs: 3000 });
    expect(result.exitCode).toBe(0);
    // Help output goes to stdout
    expect(result.stdout).toContain('wtt-express-runtime');
  });

  it('captures version and help via --version', async () => {
    const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
    const result = await runSubprocess(process.execPath, [cliPath, '--version'], { timeoutMs: 3000 });
    expect(result.exitCode).toBe(0);
    // Version may be placeholder in dev, but should be printed
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('ensures temporary directory cleanup even after subprocess', async () => {
    const { dir, cleanup } = createTempDir('wtt-subproc-');
    tempDirs.push(dir);
    const file = join(dir, 'marker.txt');
    writeFileSync(file, 'ok', 'utf8');
    const result = await runSubprocess(
      process.execPath,
      ['-e', `require('fs').readFileSync('${file.replace(/'/g, "\\'")}', 'utf8'); console.log('read ok')`],
      {
        timeoutMs: 3000,
      },
    );
    expect(result.stdout).toContain('read ok');
    cleanup();
    // After cleanup, dir should not exist
    const { existsSync } = await import('node:fs');
    expect(existsSync(dir)).toBe(false);
  });

  it('exits nonzero for invalid numeric CLI input before env loading or app import', async () => {
    const { dir, cleanup } = createTempDir('wtt-invalid-cli-');
    tempDirs.push(dir);
    const marker = join(dir, 'loaded.txt');
    writeFileSync(
      join(dir, 'app.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'loaded');\nexport default {};\n`,
    );
    const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;

    const result = await runSubprocess(
      process.execPath,
      [cliPath, 'dev', './app.mjs', '--env', './missing.env', '--shutdown-timeout=NaN'],
      { cwd: dir, timeoutMs: 3000 },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --shutdown-timeout');
    expect(result.stderr).not.toContain('Env file not found');
    expect(existsSync(marker)).toBe(false);
    cleanup();
  });
});
