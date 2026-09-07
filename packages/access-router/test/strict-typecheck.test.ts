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

    // Coordinator follow-up FH-01: run `tsc` directly instead of `pnpm run
    // typecheck` here. The `typecheck` script rebuilds `dist/` (tsup cleans
    // the output folder), and this test runs in parallel with sibling tests
    // that copy/import `dist/` (packed/strict consumers), so relaunching the
    // build mid-suite intermittently wipes `dist` and flakes those tests
    // (`Cannot find module '../dist/index.mjs'`, missing `.d.mts`). The outer
    // `pnpm ... test` script already built `dist/` before vitest started, and
    // the script-string contract above is still asserted unchanged.
    expect(() =>
      execFileSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.typecheck.json'], {
        cwd: packageRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow();
  }, 60000);
});
