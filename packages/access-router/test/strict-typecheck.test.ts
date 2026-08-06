import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');

describe('ARF-14 package strict typecheck', () => {
  it('enables noImplicitAny in the package tsconfig', () => {
    const tsconfig = JSON.parse(readFileSync(path.resolve(packageRoot, 'tsconfig.json'), 'utf8')) as {
      compilerOptions?: { noImplicitAny?: boolean };
    };

    expect(tsconfig.compilerOptions?.noImplicitAny).toBe(true);
  });

  it('declares and passes the dedicated package typecheck command', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.typecheck).toBe(
      'pnpm --filter @web-ts-toolkit/access-router... build && tsc --noEmit -p tsconfig.typecheck.json',
    );

    expect(() =>
      execFileSync('pnpm', ['run', 'typecheck'], {
        cwd: packageRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow();
  }, 60000);
});
