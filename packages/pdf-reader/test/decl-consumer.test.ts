import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');

function run(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      cwd: packageRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60_000,
    });
  } catch (error) {
    const caught = error as { stdout?: string; stderr?: string; status?: number; message?: string };
    const detail = [caught.stdout, caught.stderr].filter(Boolean).join('\n');
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (cwd: ${packageRoot}, status: ${caught.status})\n${detail}\n${caught.message ?? ''}`,
      { cause: error },
    );
  }
}

describe('PDFR-02 strict declaration consumers', () => {
  // Two real compiler subprocesses exceeded 15s even with successful exits on
  // the loaded host. Match packed-consumer's bounded harness, not page timers.
  it('compile against the built package root under NodeNext and Bundler', () => {
    run('pnpm', ['exec', 'tsc', '-p', 'test-decl-consumer/tsconfig-nodenext.json']);
    run('pnpm', ['exec', 'tsc', '-p', 'test-decl-consumer/tsconfig-bundler.json']);
  }, 180_000);
});
