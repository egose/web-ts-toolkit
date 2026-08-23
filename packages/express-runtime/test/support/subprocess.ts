import { spawn, type ChildProcess } from 'node:child_process';
import { createDeferred } from './deferred';

export interface SubprocessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SubprocessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  killSignal?: NodeJS.Signals;
}

/**
 * Run a subprocess deterministically, capturing stdout/stderr, handling timeout,
 * and ensuring cleanup (no hanging handles). Always kills child on timeout or
 * if caller discards the result.
 */
export async function runSubprocess(
  command: string,
  args: string[],
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  const { cwd, env, timeoutMs = 10000, killSignal = 'SIGTERM' } = options;

  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitDeferred = createDeferred<{ code: number | null; signal: NodeJS.Signals | null }>();
  child.once('exit', (code, signal) => exitDeferred.resolve({ code, signal }));
  child.once('error', (err) => exitDeferred.reject(err));

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== Infinity) {
    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill(killSignal);
      } catch (_e) {
        void _e;
      }
      // Escalate to SIGKILL after 2s if still not exited
      setTimeout(() => {
        try {
          if (exitDeferred.settled() === false) child.kill('SIGKILL');
        } catch (_e) {
          void _e;
        }
      }, 2000).unref?.();
    }, timeoutMs);
    timer.unref?.();
  }

  try {
    const { code, signal } = await exitDeferred.promise;
    if (timer) clearTimeout(timer);
    // Small grace to flush stdout/stderr after exit
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { exitCode: code, signal, stdout, stderr, timedOut };
  } catch (e) {
    if (timer) clearTimeout(timer);
    try {
      child.kill('SIGKILL');
    } catch (_e) {
      void _e;
    }
    throw e;
  } finally {
    // Ensure no hanging handles: remove listeners and unref
    child.removeAllListeners('exit');
    child.removeAllListeners('error');
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    if (timer) clearTimeout(timer);
  }
}

/**
 * Tracked child process helper that ensures cleanup in test teardown.
 * Use `trackedSpawn` to collect children and `cleanupTrackedChildren` in afterEach.
 */
const trackedChildren = new Set<ChildProcess>();

export function trackedSpawn(command: string, args: string[], options: Parameters<typeof spawn>[2]): ChildProcess {
  const child = spawn(command, args, options);
  trackedChildren.add(child);
  child.once('exit', () => trackedChildren.delete(child));
  child.once('error', () => trackedChildren.delete(child));
  return child;
}

export async function cleanupTrackedChildren(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  const children = [...trackedChildren];
  for (const child of children) {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    } catch (_e) {
      void _e;
    }
  }
  // Wait for all to exit, bounded
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          const timer = setTimeout(() => resolve(), 3000);
          timer.unref?.();
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          child.once('error', () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
  trackedChildren.clear();
}

/**
 * Helper to assert subprocess behavior without hanging handles.
 * Waits for exit with timeout and checks stderr.
 */
export async function assertSubprocessExitsWith(
  command: string,
  args: string[],
  expectations: {
    exitCode?: number | null;
    stderrContains?: string;
    stdoutContains?: string;
    timeoutMs?: number;
  } = {},
): Promise<SubprocessResult> {
  const result = await runSubprocess(command, args, { timeoutMs: expectations.timeoutMs ?? 10000 });
  if (expectations.exitCode !== undefined) {
    if (result.exitCode !== expectations.exitCode) {
      throw new Error(
        `Expected exit code ${expectations.exitCode} but got ${result.exitCode}. stderr: ${result.stderr} stdout: ${result.stdout}`,
      );
    }
  }
  if (expectations.stderrContains && !result.stderr.includes(expectations.stderrContains)) {
    throw new Error(`Expected stderr to contain "${expectations.stderrContains}" but got: ${result.stderr}`);
  }
  if (expectations.stdoutContains && !result.stdout.includes(expectations.stdoutContains)) {
    throw new Error(`Expected stdout to contain "${expectations.stdoutContains}" but got: ${result.stdout}`);
  }
  return result;
}
