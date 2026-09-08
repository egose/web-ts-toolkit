import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './helpers/packed-subprocess';

describe('packed subprocess bounds (B-ERH-09)', () => {
  it('passes through successful output', () => {
    const output = run(process.execPath, ['-e', 'process.stdout.write("bounded-ok")'], process.cwd(), {
      timeoutMs: 10_000,
    });
    expect(output).toContain('bounded-ok');
  });

  it('reports non-zero exits with command, cwd, and output diagnostics', () => {
    const cwd = process.cwd();
    let error: unknown;
    try {
      run(
        process.execPath,
        ['-e', 'process.stdout.write("out-marker"); process.stderr.write("err-marker"); process.exit(3)'],
        cwd,
        { timeoutMs: 10_000 },
      );
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain(process.execPath);
    expect(message).toContain(cwd);
    expect(message).toContain('out-marker');
    expect(message).toContain('err-marker');
    expect((error as Error).cause).toBeDefined();
  });

  it('stops a child that does not exit within the configured budget', () => {
    const timeoutMs = 2_000;
    const startedAt = Date.now();
    let error: unknown;
    try {
      run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], process.cwd(), { timeoutMs });
    } catch (err) {
      error = err;
    }
    const elapsedMs = Date.now() - startedAt;
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('did not exit within 2000ms');
    expect(message).toContain(process.execPath);
    expect(message).toContain(process.cwd());
    expect(message).toContain('timeoutMs=2000');
    // Enforceable deadline: the synchronously blocked worker returns soon
    // after the kill, not indefinitely. Upper bound is generous to avoid
    // flakes on loaded CI; the point is finiteness, not exact timing.
    expect(elapsedMs).toBeLessThan(timeoutMs + 30_000);
    // Worker stays usable after the kill: no wedged child handle.
    const probe = run(process.execPath, ['-e', 'process.stdout.write("alive")'], process.cwd(), {
      timeoutMs: 10_000,
    });
    expect(probe).toContain('alive');
  }, 60_000);

  it('leaves no temp consumer behind on the timeout path', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'erh09-harness-'));
    try {
      expect(() =>
        run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], tempDir, { timeoutMs: 2_000 }),
      ).toThrowError(/did not exit within 2000ms/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
    expect(existsSync(tempDir)).toBe(false);
  }, 60_000);
});
