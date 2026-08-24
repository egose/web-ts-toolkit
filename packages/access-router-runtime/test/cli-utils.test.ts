import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateRuntimeEntryFromConfig,
  generateServerlessEntryFromConfig,
  normalizeAccessRouterRuntimeArgv,
} from '../src/cli-utils';

describe('access-router-runtime CLI utils', () => {
  it('generates a local runtime entry that statically imports and normalizes the config', () => {
    const entry = generateRuntimeEntryFromConfig('./src/access-router.config.ts');

    expect(entry).toContain('createAccessRouterRuntime');
    expect(entry).toContain('import * as configModule from');
    expect(entry).toContain('normalizeAccessRouterRuntimeConfigExport(configModule');
    expect(entry).not.toContain('loadAccessRouterRuntimeConfigSync');
    expect(entry).toContain('runtimeBundle.init()');
    expect(entry).toContain('runtimeBundle.shutdown()');
    expect(entry).not.toContain('process.once');
    expect(entry).toContain('export default app;');
  });

  it('does not embed tsconfig path in the generated local runtime entry', () => {
    const entry = generateRuntimeEntryFromConfig('./src/access-router.config.ts', './tsconfig.runtime.json');

    expect(entry).not.toContain('tsconfigPath');
    expect(entry).not.toContain('tsconfig.runtime.json');
  });

  it('generates a serverless entry that exports a handler directly from config', () => {
    const entry = generateServerlessEntryFromConfig('./src/access-router.config.ts');

    expect(entry).toContain('createAccessRouterRuntimeServerlessHandler');
    expect(entry).toContain('import * as configModule from');
    expect(entry).toContain('normalizeAccessRouterRuntimeConfigExport(configModule');
    expect(entry).not.toContain('loadAccessRouterRuntimeConfigSync');
    expect(entry).toContain('export const handler = createAccessRouterRuntimeServerlessHandler(config);');
  });

  it('does not embed tsconfig path in the generated serverless entry', () => {
    const entry = generateServerlessEntryFromConfig('./src/access-router.config.ts', './tsconfig.runtime.json');

    expect(entry).not.toContain('tsconfigPath');
    expect(entry).not.toContain('tsconfig.runtime.json');
  });

  it('safely represents generated static import paths', () => {
    const entry = generateRuntimeEntryFromConfig('./config dir/access config "é".ts');

    expect(entry).toContain('access config \\"é\\".ts');
    expect(entry).toContain('"./config dir/access config \\"é\\".ts"');
  });

  it('normalizes bare dev --watch to the supervisor default without reading config', () => {
    expect(normalizeAccessRouterRuntimeArgv(['dev', './src/access-router.config.ts', '--watch'])).toEqual([
      'dev',
      './src/access-router.config.ts',
      '--watch=.',
    ]);
    expect(normalizeAccessRouterRuntimeArgv(['./src/access-router.config.ts', '--watch', '--port', '3000'])).toEqual([
      './src/access-router.config.ts',
      '--watch=.',
      '--port',
      '3000',
    ]);
  });

  it('leaves explicit watch values, pass-through commands, and -- terminated args unchanged', () => {
    expect(normalizeAccessRouterRuntimeArgv(['dev', './config.ts', '--watch', './src'])).toEqual([
      'dev',
      './config.ts',
      '--watch',
      './src',
    ]);
    expect(normalizeAccessRouterRuntimeArgv(['start', './dist/app.js', '--watch'])).toEqual([
      'start',
      './dist/app.js',
      '--watch',
    ]);
    expect(normalizeAccessRouterRuntimeArgv(['dev', '--', '--watch'])).toEqual(['dev', '--', '--watch']);
  });

  it('publishes a tsconfig subpath export', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      files: string[];
    };

    expect(packageJson.exports['./tsconfig.json']).toBe('./dist/tsconfig.json');
    expect(packageJson.files).toContain('tsconfig.package.json');
  });
});
