import { execFileSync } from 'node:child_process';

export const PACK_TIMEOUT_MS = 60_000;
export const INSTALL_TIMEOUT_MS = 180_000;
export const NODE_TIMEOUT_MS = 30_000;
export const TSC_TIMEOUT_MS = 90_000;

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const OUTPUT_TAIL_CHARS = 4_000;

export type BoundedRunOptions = {
  timeoutMs: number;
  maxBufferBytes?: number;
};

function tail(text: unknown, limit: number): string {
  if (typeof text !== 'string' || text.length === 0) {
    return '<empty>';
  }
  if (text.length <= limit) {
    return text;
  }
  return `…(truncated to last ${limit} chars)…\n${text.slice(-limit)}`;
}

/**
 * Runs a subprocess with an enforceable finite deadline. `execFileSync`
 * blocks the Vitest worker, so the deadline must come from the child-wait
 * itself (`timeout` + `SIGKILL`), not from a Vitest timer that cannot
 * interrupt a synchronously blocked worker.
 *
 * Failures throw an `Error` carrying command, cwd, deadline, exit
 * status/signal, and stdout/stderr tails with the original error as `cause`.
 */
export function run(command: string, args: string[], cwd: string, options: BoundedRunOptions): string {
  const commandLine = [command, ...args].join(' ');
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: options.timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
    });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      status?: number | null;
      signal?: string | null;
      stdout?: unknown;
      stderr?: unknown;
    };
    const timedOut = failure.code === 'ETIMEDOUT' || failure.signal === 'SIGKILL' || failure.signal === 'SIGTERM';
    const reason = timedOut
      ? `did not exit within ${options.timeoutMs}ms and was killed`
      : `exited with status ${String(failure.status)} signal ${String(failure.signal)} code ${String(failure.code)}`;
    throw new Error(
      `command "${commandLine}" in ${cwd} ${reason} (timeoutMs=${options.timeoutMs}).\n` +
        `stdout:\n${tail(failure.stdout, OUTPUT_TAIL_CHARS)}\n` +
        `stderr:\n${tail(failure.stderr, OUTPUT_TAIL_CHARS)}`,
      { cause: error },
    );
  }
}
