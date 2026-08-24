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

const trackedChildren = new Set<ChildProcess>();

export function trackChildProcess(child: ChildProcess): ChildProcess {
  trackedChildren.add(child);
  child.once('exit', () => {
    trackedChildren.delete(child);
  });
  child.once('error', () => {
    trackedChildren.delete(child);
  });
  return child;
}

export async function runSubprocess(
  command: string,
  args: ReadonlyArray<string>,
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  const { cwd, env = process.env, timeoutMs = 10_000, killSignal = 'SIGTERM' } = options;
  const child = trackChildProcess(
    spawn(command, [...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const exit = createDeferred<{ code: number | null; signal: NodeJS.Signals | null }>();

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.once('exit', (code, signal) => {
    trackedChildren.delete(child);
    exit.resolve({ code, signal });
  });
  child.once('error', (error) => {
    trackedChildren.delete(child);
    exit.reject(error);
  });

  if (timeoutMs !== Infinity) {
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill(killSignal);
    }, timeoutMs);
    timeout.unref?.();
  }

  try {
    const { code, signal } = await exit.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { exitCode: code, signal, stdout, stderr, timedOut };
  } finally {
    if (timeout) clearTimeout(timeout);
    child.removeAllListeners('exit');
    child.removeAllListeners('error');
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    trackedChildren.delete(child);
  }
}

export function assertSubprocessResult(
  result: SubprocessResult,
  expected: {
    exitCode?: number | null;
    signal?: NodeJS.Signals | null;
    stdoutIncludes?: string;
    stderrIncludes?: string;
    timedOut?: boolean;
  },
): void {
  if (expected.exitCode !== undefined && result.exitCode !== expected.exitCode) {
    throw new Error(`Expected exit code ${expected.exitCode}, got ${result.exitCode}. stderr: ${result.stderr}`);
  }
  if (expected.signal !== undefined && result.signal !== expected.signal) {
    throw new Error(`Expected signal ${expected.signal}, got ${result.signal}. stderr: ${result.stderr}`);
  }
  if (expected.stdoutIncludes !== undefined && !result.stdout.includes(expected.stdoutIncludes)) {
    throw new Error(`Expected stdout to include ${JSON.stringify(expected.stdoutIncludes)}, got: ${result.stdout}`);
  }
  if (expected.stderrIncludes !== undefined && !result.stderr.includes(expected.stderrIncludes)) {
    throw new Error(`Expected stderr to include ${JSON.stringify(expected.stderrIncludes)}, got: ${result.stderr}`);
  }
  if (expected.timedOut !== undefined && result.timedOut !== expected.timedOut) {
    throw new Error(`Expected timedOut ${expected.timedOut}, got ${result.timedOut}. stderr: ${result.stderr}`);
  }
}

export async function cleanupTrackedChildren(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  const children = [...trackedChildren];

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }

  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }

          const timeout = setTimeout(resolve, 3_000);
          timeout.unref?.();
          child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
          child.once('error', () => {
            clearTimeout(timeout);
            resolve();
          });
        }),
    ),
  );

  trackedChildren.clear();
}
