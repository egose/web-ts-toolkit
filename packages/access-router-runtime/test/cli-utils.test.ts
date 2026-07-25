import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDelegatedArgs, createGeneratedRuntimeFiles, resolveCliInvocation } from '../src/cli-utils';

describe('access-router-runtime CLI utils', () => {
  const previousCwd = process.cwd();
  const tempDirs: string[] = [];

  afterEach(() => {
    process.chdir(previousCwd);
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('defaults to dev mode when only a config path is provided', () => {
    const invocation = resolveCliInvocation(['./src/access-router.config.ts']);
    expect(invocation).toEqual({
      subcommand: 'dev',
      targetPath: './src/access-router.config.ts',
      passthroughArgs: [],
      configAware: true,
    });
  });

  it('injects generated app and init modules for build delegation', () => {
    const invocation = resolveCliInvocation(['build', './src/access-router.config.ts', '--out-dir', 'dist']);
    expect(invocation).not.toBeNull();

    const delegatedArgs = buildDelegatedArgs(invocation!, {
      appModulePath: '/tmp/app.mjs',
      initModulePath: '/tmp/init.mjs',
    });

    expect(delegatedArgs).toEqual(['build', '/tmp/app.mjs', '--init', '/tmp/init.mjs', '--out-dir', 'dist']);
  });

  it('writes generated wrapper modules that load the runtime config', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'access-router-runtime-'));
    tempDirs.push(tempDir);
    const previousCwd = process.cwd();
    process.chdir(tempDir);

    const generated = createGeneratedRuntimeFiles('./access-router.config.ts');

    const appContent = readFileSync(generated.appModulePath, 'utf8');
    const initContent = readFileSync(generated.initModulePath, 'utf8');

    expect(appContent).toContain('runtimeBundle.app');
    expect(appContent).toContain('runtimeBundle.init()');
    expect(initContent).toContain('runtimeBundle.init()');

    generated.cleanup();
    process.chdir(previousCwd);
  });

  it('rejects manual --init on config-aware build commands', () => {
    const invocation = resolveCliInvocation(['build', './src/access-router.config.ts', '--init', './src/init.ts']);
    expect(() =>
      buildDelegatedArgs(invocation!, {
        appModulePath: '/tmp/app.mjs',
        initModulePath: '/tmp/init.mjs',
      }),
    ).toThrow('build manages the init hook automatically. Remove --init.');
  });
});
