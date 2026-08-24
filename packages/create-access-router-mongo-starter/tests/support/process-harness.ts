import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

export interface ChildInvocation {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface ProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  invocations: ChildInvocation[];
  filesystem: {
    before: Record<string, string>;
    after: Record<string, string>;
    changed: string[];
  };
}

export interface RunProcessOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  captureFile?: string;
  snapshotRoot?: string;
}

export function writeFakeExecutable(path: string): void {
  writeFileSync(
    path,
    `#!/usr/bin/env node
const fs = require('node:fs');
const record = { argv: process.argv.slice(2), cwd: process.cwd(), env: process.env };
if (process.env.CARMS_CAPTURE_FILE) fs.appendFileSync(process.env.CARMS_CAPTURE_FILE, JSON.stringify(record) + '\\n');
if (process.env.CARMS_FAKE_STDOUT) process.stdout.write(process.env.CARMS_FAKE_STDOUT);
if (process.env.CARMS_FAKE_STDERR) process.stderr.write(process.env.CARMS_FAKE_STDERR);
process.exitCode = Number(process.env.CARMS_FAKE_EXIT_CODE || 0);
`,
  );
  chmodSync(path, 0o755);
}

export function snapshotTree(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};

  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = join(path, entry.name);
      const relativePath = relative(root, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        snapshot[`${relativePath}/`] = 'directory';
        visit(fullPath);
      } else if (entry.isSymbolicLink()) {
        snapshot[relativePath] = `symlink:${readlinkSync(fullPath)}`;
      } else {
        const stat = lstatSync(fullPath);
        const hash = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
        snapshot[relativePath] = `file:${stat.mode & 0o777}:${hash}`;
      }
    }
  }

  visit(root);
  return snapshot;
}

export function runProcess(command: string, args: string[], options: RunProcessOptions): ProcessResult {
  const before = options.snapshotRoot ? snapshotTree(options.snapshotRoot) : {};
  const env = { ...process.env, ...options.env };
  if (options.captureFile) env.CARMS_CAPTURE_FILE = options.captureFile;

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env,
    encoding: 'utf8',
    shell: false,
  });
  const after = options.snapshotRoot ? snapshotTree(options.snapshotRoot) : {};
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (path) => before[path] !== after[path],
  );
  const capture = options.captureFile
    ? (() => {
        try {
          return readFileSync(options.captureFile, 'utf8');
        } catch {
          return '';
        }
      })()
    : '';

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    invocations: capture
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChildInvocation),
    filesystem: { before, after, changed },
  };
}
