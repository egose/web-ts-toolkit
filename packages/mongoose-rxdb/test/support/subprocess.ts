import { spawn, type ChildProcess } from 'node:child_process';

export interface SubprocessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const children = new Set<ChildProcess>();

export function runSubprocess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : undefined;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      if (timeout) clearTimeout(timeout);
      children.delete(child);
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

export async function runChecked(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<string> {
  const result = await runSubprocess(command, args, options);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, `cwd: ${options.cwd}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout;
}

export async function cleanupTrackedChildren(): Promise<void> {
  await Promise.all(
    Array.from(
      children,
      (child) =>
        new Promise<void>((resolve) => {
          child.once('close', () => resolve());
          child.kill('SIGKILL');
        }),
    ),
  );
  children.clear();
}
