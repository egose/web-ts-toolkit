import { describe, expect, it } from 'vitest';
import {
  assertNoManualInit,
  generateRuntimeEntryFromConfig,
  generateServerlessEntryFromConfig,
  resolveCliInvocation,
} from '../src/cli-utils';

describe('access-router-runtime CLI utils', () => {
  it('defaults to dev mode when only a config path is provided', () => {
    const invocation = resolveCliInvocation(['./src/access-router.config.ts']);
    expect(invocation).toEqual({
      subcommand: 'dev',
      targetPath: './src/access-router.config.ts',
      passthroughArgs: [],
      configAware: true,
    });
  });

  it('marks start as a non-config-aware passthrough command', () => {
    const invocation = resolveCliInvocation(['start', './dist/app.js', '--port', '3000']);
    expect(invocation).toEqual({
      subcommand: 'start',
      targetPath: './dist/app.js',
      passthroughArgs: ['--port', '3000'],
      configAware: false,
    });
  });

  it('generates a local runtime entry that wires config loading, init, and shutdown signals', () => {
    const entry = generateRuntimeEntryFromConfig('./src/access-router.config.ts');

    expect(entry).toContain('createAccessRouterRuntime');
    expect(entry).toContain('loadAccessRouterRuntimeConfigSync');
    expect(entry).toContain('runtimeBundle.init()');
    expect(entry).toContain("process.once('SIGINT', shutdown);");
    expect(entry).toContain('export default app;');
  });

  it('generates a serverless entry that exports a handler directly from config', () => {
    const entry = generateServerlessEntryFromConfig('./src/access-router.config.ts');

    expect(entry).toContain('createAccessRouterRuntimeServerlessHandler');
    expect(entry).toContain('loadAccessRouterRuntimeConfigSync');
    expect(entry).toContain('export const handler = createAccessRouterRuntimeServerlessHandler(config);');
  });

  it('rejects manual --init on config-aware build commands', () => {
    expect(() =>
      assertNoManualInit('build', {
        appPath: './src/access-router.config.ts',
        initPath: './src/init.ts',
        outDir: 'dist',
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      }),
    ).toThrow('build manages the init hook automatically. Remove --init.');
  });
});
