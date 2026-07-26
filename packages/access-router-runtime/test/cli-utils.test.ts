import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyConfigDevDefaults,
  assertNoManualInit,
  buildConfigAwareDevArgv,
  generateRuntimeEntryFromConfig,
  generateServerlessEntryFromConfig,
  readTsconfigPath,
  resolveCliInvocation,
} from '../src/cli-utils';
import type { AccessRouterRuntimeConfig } from '../src/index';

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

  it('embeds tsconfig path in the generated local runtime entry when provided', () => {
    const entry = generateRuntimeEntryFromConfig('./src/access-router.config.ts', './tsconfig.runtime.json');

    expect(entry).toContain('tsconfigPath');
    expect(entry).toContain('tsconfig.runtime.json');
  });

  it('generates a serverless entry that exports a handler directly from config', () => {
    const entry = generateServerlessEntryFromConfig('./src/access-router.config.ts');

    expect(entry).toContain('createAccessRouterRuntimeServerlessHandler');
    expect(entry).toContain('loadAccessRouterRuntimeConfigSync');
    expect(entry).toContain('export const handler = createAccessRouterRuntimeServerlessHandler(config);');
  });

  it('embeds tsconfig path in the generated serverless entry when provided', () => {
    const entry = generateServerlessEntryFromConfig('./src/access-router.config.ts', './tsconfig.runtime.json');

    expect(entry).toContain('tsconfigPath');
    expect(entry).toContain('tsconfig.runtime.json');
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

  it('uses config watch paths for bare --watch', () => {
    const argv = buildConfigAwareDevArgv('./src/access-router.config.ts', ['--watch', '--port', '3000'], {
      dev: {
        watch: ['./src', './shared'],
      },
    });

    expect(argv).toEqual(['dev', './src/access-router.config.ts', '--watch=./src,./shared', '--port', '3000']);
  });

  it('defaults bare --watch to the current directory when config has no watch paths', () => {
    const argv = buildConfigAwareDevArgv('./src/access-router.config.ts', ['--watch'], {});

    expect(argv).toEqual(['dev', './src/access-router.config.ts', '--watch=.']);
  });

  it('applies config ext and delay defaults without auto-enabling watch mode', () => {
    const config: AccessRouterRuntimeConfig = {
      dev: {
        watch: ['./src'],
        ext: ['ts', 'json'],
        delay: 250,
      },
    };

    const args = applyConfigDevDefaults(
      {
        appPath: './src/access-router.config.ts',
        options: {},
        require: [],
        env: [],
        watch: [],
        watchExt: ['ts', 'js', 'mjs', 'cjs', 'json'],
        watchDelay: 500,
      },
      config,
      [],
    );

    expect(args.watch).toEqual([]);
    expect(args.watchExt).toEqual(['ts', 'json']);
    expect(args.watchDelay).toBe(250);
  });

  it('keeps cli watch settings when they are provided explicitly', () => {
    const config: AccessRouterRuntimeConfig = {
      dev: {
        watch: ['./src'],
        ext: ['ts'],
        delay: 250,
      },
    };

    const args = applyConfigDevDefaults(
      {
        appPath: './src/access-router.config.ts',
        options: {},
        require: [],
        env: [],
        watch: ['./custom'],
        watchExt: ['js'],
        watchDelay: 1000,
      },
      config,
      ['--watch', './custom', '--ext', 'js', '--delay', '1000'],
    );

    expect(args.watch).toEqual(['./custom']);
    expect(args.watchExt).toEqual(['js']);
    expect(args.watchDelay).toBe(1000);
  });

  it('reads --tsconfig from passthrough args', () => {
    expect(readTsconfigPath(['--port', '3000', '--tsconfig', './tsconfig.runtime.json'])).toBe(
      './tsconfig.runtime.json',
    );
    expect(readTsconfigPath(['--tsconfig=./tsconfig.runtime.json'])).toBe('./tsconfig.runtime.json');
  });

  it('publishes a tsconfig subpath export', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      files: string[];
    };

    expect(packageJson.exports['./tsconfig.json']).toBe('./tsconfig.package.json');
    expect(packageJson.files).toContain('tsconfig.package.json');
  });
});
