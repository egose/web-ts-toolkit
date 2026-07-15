// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCliScriptPath } from '../src/runtime-paths';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveCliScriptPath', () => {
  it('prefers the current module file path when available', () => {
    expect(resolveCliScriptPath('/pkg/dist/cli.js', '/tmp/bin/create-access-router-mongo-starter')).toBe(
      '/pkg/dist/cli.js',
    );
  });

  it('resolves a symlinked invoked script path back to the real CLI file', () => {
    const sandboxDir = mkdtempSync(join(tmpdir(), 'create-access-router-mongo-starter-'));
    tempDirs.push(sandboxDir);

    const distDir = join(sandboxDir, 'pkg', 'dist');
    mkdirSync(distDir, { recursive: true });

    const cliPath = join(distDir, 'cli.js');
    writeFileSync(cliPath, '#!/usr/bin/env node\n');

    const binDir = join(sandboxDir, 'bin');
    mkdirSync(binDir, { recursive: true });

    const shimPath = join(binDir, 'create-access-router-mongo-starter');
    symlinkSync(cliPath, shimPath);

    expect(resolveCliScriptPath(undefined, shimPath)).toBe(cliPath);
  });

  it('falls back to resolving the invoked path when it does not exist yet', () => {
    expect(resolveCliScriptPath(undefined, './dist/cli.js')).toBe(resolve('./dist/cli.js'));
  });
});
