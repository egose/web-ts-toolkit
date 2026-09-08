import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readValue,
  parseArgs,
  isExpressApp,
  extractExport,
  resolveExport,
  generateRuntimeEntry,
  generateServerlessEntry,
  toServerlessEvent,
  applyServerlessResult,
  createServerlessAdapterApp,
  loadBuiltApp,
  loadHandler,
  loadEnvFiles,
  parseEnvFile,
  preloadModules,
  buildChildArgs,
  CLI_VERSION,
} from '../src/cli-utils';
import { createExpressApp } from '../src/index';

// ---------------------------------------------------------------------------
// readValue
// ---------------------------------------------------------------------------

describe('readValue', () => {
  it('returns the next argv value', () => {
    expect(readValue(['--port', '3000'], 0, '--port')).toBe('3000');
  });

  it('throws when the value is missing', () => {
    expect(() => readValue(['--port'], 0, '--port')).toThrow('Missing value for argument: --port');
  });

  it('throws when the next arg looks like a flag', () => {
    expect(() => readValue(['--port', '--host'], 0, '--port')).toThrow('Missing value for argument: --port');
  });
});

// ---------------------------------------------------------------------------
// parseArgs — subcommand dispatch
// ---------------------------------------------------------------------------

describe('parseArgs — dispatch', () => {
  it('returns null for empty argv and prints help', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs([])).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns null for --help anywhere in argv', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['dev', './app.js', '--help'])).toBeNull();
    spy.mockRestore();
  });

  it('returns null for -h anywhere in argv', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['build', '--port', '3000', '-h'])).toBeNull();
    spy.mockRestore();
  });

  it('returns null for --version anywhere in argv', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['--version'])).toBeNull();
    expect(spy).toHaveBeenCalledWith(CLI_VERSION);
    spy.mockRestore();
  });

  it('returns null for -V anywhere in argv', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['-V'])).toBeNull();
    spy.mockRestore();
  });

  it('does not treat help or version after -- as global options', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = parseArgs(['dev', '--', '--help']);
    expect(result?.subcommand === 'dev' && result.dev.appPath).toBe('--help');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parseArgs — dev subcommand
// ---------------------------------------------------------------------------

describe('parseArgs — dev', () => {
  it('defaults to dev when no subcommand is given (backward compat)', () => {
    const result = parseArgs(['./app.js']);
    expect(result?.subcommand).toBe('dev');
    expect(result?.subcommand === 'dev' && result.dev.appPath).toBe('./app.js');
  });

  it('explicitly accepts dev subcommand', () => {
    const result = parseArgs(['dev', './app.js']);
    expect(result?.subcommand).toBe('dev');
    expect(result?.subcommand === 'dev' && result.dev.appPath).toBe('./app.js');
  });

  it('parses --port as a number', () => {
    const result = parseArgs(['dev', './app.js', '--port', '3000']);
    expect(result?.subcommand === 'dev' && result.dev.options.port).toBe(3000);
  });

  it('parses --port= form', () => {
    const result = parseArgs(['dev', './app.js', '--port=3000']);
    expect(result?.subcommand === 'dev' && result.dev.options.port).toBe(3000);
  });

  it('keeps --port as a string when it is non-numeric (named pipe)', () => {
    const result = parseArgs(['dev', './app.js', '--port', '\\\\.\\pipe\\test']);
    expect(result?.subcommand === 'dev' && result.dev.options.port).toBe('\\\\.\\pipe\\test');
  });

  it('parses --host', () => {
    const result = parseArgs(['dev', './app.js', '--host', 'localhost']);
    expect(result?.subcommand === 'dev' && result.dev.options.host).toBe('localhost');
  });

  it('parses --host=', () => {
    const result = parseArgs(['dev', './app.js', '--host=localhost']);
    expect(result?.subcommand === 'dev' && result.dev.options.host).toBe('localhost');
  });

  it('parses --no-signals', () => {
    const result = parseArgs(['dev', './app.js', '--no-signals']);
    expect(result?.subcommand === 'dev' && result.dev.options.signals).toBe(false);
  });

  it('parses --shutdown-timeout', () => {
    const result = parseArgs(['dev', './app.js', '--shutdown-timeout', '2000']);
    expect(result?.subcommand === 'dev' && result.dev.options.shutdownTimeout).toBe(2000);
  });

  it('parses --shutdown-timeout=', () => {
    const result = parseArgs(['dev', './app.js', '--shutdown-timeout=2000']);
    expect(result?.subcommand === 'dev' && result.dev.options.shutdownTimeout).toBe(2000);
  });

  it('terminates option parsing at --', () => {
    const result = parseArgs(['dev', '--', './app.js']);
    expect(result?.subcommand === 'dev' && result.dev.appPath).toBe('./app.js');
  });

  it('treats leading-dash paths after -- as positional', () => {
    const result = parseArgs(['dev', '--', '--app.js']);
    expect(result?.subcommand === 'dev' && result.dev.appPath).toBe('--app.js');
  });

  it('rejects invalid --port values with flag-specific messages', () => {
    for (const value of ['NaN', 'Infinity', '-1', '1.5', '  ', '03000', '1e3']) {
      expect(() => parseArgs(['dev', './app.js', '--port', value])).toThrow('Invalid --port');
      expect(() => parseArgs(['dev', './app.js', `--port=${value}`])).toThrow('Invalid --port');
    }
    expect(() => parseArgs(['dev', './app.js', '--port='])).toThrow('Missing value for argument: --port');
  });

  it('accepts --port boundary values', () => {
    const low = parseArgs(['dev', './app.js', '--port=0']);
    expect(low?.subcommand === 'dev' && low.dev.options.port).toBe(0);
    const high = parseArgs(['dev', './app.js', '--port', '65535']);
    expect(high?.subcommand === 'dev' && high.dev.options.port).toBe(65535);
  });

  it('rejects invalid --shutdown-timeout values with flag-specific messages', () => {
    for (const value of ['NaN', 'Infinity', '-1', '1.5', '  ']) {
      expect(() => parseArgs(['dev', './app.js', '--shutdown-timeout', value])).toThrow('Invalid --shutdown-timeout');
      expect(() => parseArgs(['dev', './app.js', `--shutdown-timeout=${value}`])).toThrow('Invalid --shutdown-timeout');
    }
    expect(() => parseArgs(['dev', './app.js', '--shutdown-timeout='])).toThrow(
      'Missing value for argument: --shutdown-timeout',
    );
  });

  it('accepts --shutdown-timeout boundary values', () => {
    const zero = parseArgs(['dev', './app.js', '--shutdown-timeout=0']);
    expect(zero?.subcommand === 'dev' && zero.dev.options.shutdownTimeout).toBe(0);
    const max = parseArgs(['dev', './app.js', '--shutdown-timeout=2147483647']);
    expect(max?.subcommand === 'dev' && max.dev.options.shutdownTimeout).toBe(2147483647);
  });

  it('rejects --shutdown-timeout above the Node timer limit in both forms', () => {
    for (const value of ['2147483648', String(Number.MAX_SAFE_INTEGER)]) {
      expect(() => parseArgs(['dev', './app.js', '--shutdown-timeout', value])).toThrow('Invalid --shutdown-timeout');
      expect(() => parseArgs(['dev', './app.js', `--shutdown-timeout=${value}`])).toThrow('Invalid --shutdown-timeout');
    }
  });

  it('throws on unknown argument', () => {
    expect(() => parseArgs(['dev', './app.js', '--bogus'])).toThrow('Unknown argument');
  });

  it('throws on missing app path', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => parseArgs(['dev'])).toThrow('Missing required argument');
    spy.mockRestore();
  });

  it('throws on duplicate positional argument', () => {
    expect(() => parseArgs(['dev', './a.js', './b.js'])).toThrow('Unexpected positional argument');
  });

  it('parses --require (repeatable)', () => {
    const result = parseArgs(['dev', './app.js', '--require', 'tsconfig-paths/register', '--require', 'dotenv/config']);
    expect(result?.subcommand === 'dev' && result.dev.require).toEqual(['tsconfig-paths/register', 'dotenv/config']);
  });

  it('parses --require=', () => {
    const result = parseArgs(['dev', './app.js', '--require=tsconfig-paths/register']);
    expect(result?.subcommand === 'dev' && result.dev.require).toEqual(['tsconfig-paths/register']);
  });

  it('parses --require with comma-separated values', () => {
    const result = parseArgs(['dev', './app.js', '--require', 'tsconfig-paths/register,dotenv/config']);
    expect(result?.subcommand === 'dev' && result.dev.require).toEqual(['tsconfig-paths/register', 'dotenv/config']);
  });

  it('parses --env (repeatable)', () => {
    const result = parseArgs(['dev', './app.js', '--env', './.env', '--env', './.env.local']);
    expect(result?.subcommand === 'dev' && result.dev.env).toEqual(['./.env', './.env.local']);
  });

  it('parses --env=', () => {
    const result = parseArgs(['dev', './app.js', '--env=./.env']);
    expect(result?.subcommand === 'dev' && result.dev.env).toEqual(['./.env']);
  });

  it('parses --env with comma-separated values', () => {
    const result = parseArgs(['dev', './app.js', '--env', './.env,./.env.local']);
    expect(result?.subcommand === 'dev' && result.dev.env).toEqual(['./.env', './.env.local']);
  });

  it('parses --tsconfig', () => {
    const result = parseArgs(['dev', './app.js', '--tsconfig', './tsconfig.runtime.json']);
    expect(result?.subcommand === 'dev' && result.dev.tsconfigPath).toBe('./tsconfig.runtime.json');
  });

  it('parses --tsconfig=', () => {
    const result = parseArgs(['dev', './app.js', '--tsconfig=./tsconfig.runtime.json']);
    expect(result?.subcommand === 'dev' && result.dev.tsconfigPath).toBe('./tsconfig.runtime.json');
  });

  it('rejects conflicting repeated --tsconfig values', () => {
    expect(() => parseArgs(['dev', './app.js', '--tsconfig', './a.json', '--tsconfig=./b.json'])).toThrow(
      'Conflicting --tsconfig values',
    );
  });

  it('parses --watch', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src']);
    expect(result?.subcommand === 'dev' && result.dev.watch).toEqual(['./src']);
  });

  it('parses --watch with comma-separated paths', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src,./shared']);
    expect(result?.subcommand === 'dev' && result.dev.watch).toEqual(['./src', './shared']);
  });

  it('parses repeatable --watch', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src', '--watch', './shared']);
    expect(result?.subcommand === 'dev' && result.dev.watch).toEqual(['./src', './shared']);
  });

  it('parses --watch=', () => {
    const result = parseArgs(['dev', './app.js', '--watch=./src']);
    expect(result?.subcommand === 'dev' && result.dev.watch).toEqual(['./src']);
  });

  it('defaults watchExt to ts,js,mjs,cjs,json', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src']);
    expect(result?.subcommand === 'dev' && result.dev.watchExt).toEqual(['ts', 'js', 'mjs', 'cjs', 'json']);
  });

  it('parses --ext', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src', '--ext', 'ts,json']);
    expect(result?.subcommand === 'dev' && result.dev.watchExt).toEqual(['ts', 'json']);
  });

  it('parses --ext=', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src', '--ext=ts,mjs']);
    expect(result?.subcommand === 'dev' && result.dev.watchExt).toEqual(['ts', 'mjs']);
  });

  it('parses --delay', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src', '--delay', '1000']);
    expect(result?.subcommand === 'dev' && result.dev.watchDelay).toBe(1000);
  });

  it('parses --delay=', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src', '--delay=200']);
    expect(result?.subcommand === 'dev' && result.dev.watchDelay).toBe(200);
  });

  it('rejects invalid --delay values with flag-specific messages', () => {
    for (const value of ['NaN', 'Infinity', '-1', '1.5', '  ']) {
      expect(() => parseArgs(['dev', './app.js', '--watch', './src', '--delay', value])).toThrow('Invalid --delay');
      expect(() => parseArgs(['dev', './app.js', '--watch', './src', `--delay=${value}`])).toThrow('Invalid --delay');
    }
    expect(() => parseArgs(['dev', './app.js', '--watch', './src', '--delay='])).toThrow(
      'Missing value for argument: --delay',
    );
  });

  it('accepts --delay boundary values', () => {
    const zero = parseArgs(['dev', './app.js', '--watch', './src', '--delay=0']);
    expect(zero?.subcommand === 'dev' && zero.dev.watchDelay).toBe(0);
    const max = parseArgs(['dev', './app.js', '--watch', './src', '--delay=2147483647']);
    expect(max?.subcommand === 'dev' && max.dev.watchDelay).toBe(2147483647);
  });

  it('rejects --delay above the Node timer limit in both forms', () => {
    for (const value of ['2147483648', String(Number.MAX_SAFE_INTEGER)]) {
      expect(() => parseArgs(['dev', './app.js', '--watch', './src', '--delay', value])).toThrow('Invalid --delay');
      expect(() => parseArgs(['dev', './app.js', '--watch', './src', `--delay=${value}`])).toThrow('Invalid --delay');
    }
  });

  it('defaults watchDelay to 500', () => {
    const result = parseArgs(['dev', './app.js', '--watch', './src']);
    expect(result?.subcommand === 'dev' && result.dev.watchDelay).toBe(500);
  });

  it('defaults require and env to empty arrays', () => {
    const result = parseArgs(['dev', './app.js']);
    expect(result?.subcommand === 'dev' && result.dev.require).toEqual([]);
    expect(result?.subcommand === 'dev' && result.dev.env).toEqual([]);
  });

  it('defaults watch to empty array', () => {
    const result = parseArgs(['dev', './app.js']);
    expect(result?.subcommand === 'dev' && result.dev.watch).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — build subcommand
// ---------------------------------------------------------------------------

describe('parseArgs — build', () => {
  it('parses subcommand and app path', () => {
    const result = parseArgs(['build', './src/app.ts']);
    expect(result?.subcommand).toBe('build');
    expect(result?.subcommand === 'build' && result.build.appPath).toBe('./src/app.ts');
  });

  it('applies default build options', () => {
    const result = parseArgs(['build', './src/app.ts']);
    if (result?.subcommand !== 'build') throw new Error('expected build subcommand');
    expect(result.build.outDir).toBe('dist');
    expect(result.build.outName).toBe('app');
    expect(result.build.format).toBe('cjs');
    expect(result.build.target).toBe('node22');
    expect(result.build.external).toEqual([]);
    expect(result.build.clean).toBe(true);
    expect(result.build.initPath).toBeUndefined();
    expect(result.build.tsconfigPath).toBeUndefined();
  });

  it('parses --init', () => {
    const result = parseArgs(['build', './src/app.ts', '--init', './src/init.ts']);
    expect(result?.subcommand === 'build' && result.build.initPath).toBe('./src/init.ts');
  });

  it('parses --init=', () => {
    const result = parseArgs(['build', './src/app.ts', '--init=./src/init.ts']);
    expect(result?.subcommand === 'build' && result.build.initPath).toBe('./src/init.ts');
  });

  it('parses --tsconfig', () => {
    const result = parseArgs(['build', './src/app.ts', '--tsconfig', './tsconfig.runtime.json']);
    expect(result?.subcommand === 'build' && result.build.tsconfigPath).toBe('./tsconfig.runtime.json');
  });

  it('parses --tsconfig=', () => {
    const result = parseArgs(['build', './src/app.ts', '--tsconfig=./tsconfig.runtime.json']);
    expect(result?.subcommand === 'build' && result.build.tsconfigPath).toBe('./tsconfig.runtime.json');
  });

  it('rejects conflicting repeated --tsconfig values', () => {
    expect(() => parseArgs(['build', './src/app.ts', '--tsconfig', './a.json', '--tsconfig=./b.json'])).toThrow(
      'Conflicting --tsconfig values',
    );
  });

  it('parses --out-dir', () => {
    const result = parseArgs(['build', './src/app.ts', '--out-dir', 'netlify/functions']);
    expect(result?.subcommand === 'build' && result.build.outDir).toBe('netlify/functions');
  });

  it('parses --out-dir=', () => {
    const result = parseArgs(['build', './src/app.ts', '--out-dir=build']);
    expect(result?.subcommand === 'build' && result.build.outDir).toBe('build');
  });

  it('parses --out-name', () => {
    const result = parseArgs(['build', './src/app.ts', '--out-name', 'main']);
    expect(result?.subcommand === 'build' && result.build.outName).toBe('main');
  });

  it('parses --out-name=', () => {
    const result = parseArgs(['build', './src/app.ts', '--out-name=main']);
    expect(result?.subcommand === 'build' && result.build.outName).toBe('main');
  });

  it('parses --format cjs', () => {
    const result = parseArgs(['build', './src/app.ts', '--format', 'cjs']);
    expect(result?.subcommand === 'build' && result.build.format).toBe('cjs');
  });

  it('parses --format esm', () => {
    const result = parseArgs(['build', './src/app.ts', '--format', 'esm']);
    expect(result?.subcommand === 'build' && result.build.format).toBe('esm');
  });

  it('parses --format=esm', () => {
    const result = parseArgs(['build', './src/app.ts', '--format=esm']);
    expect(result?.subcommand === 'build' && result.build.format).toBe('esm');
  });

  it('rejects invalid --format', () => {
    expect(() => parseArgs(['build', './src/app.ts', '--format', 'umd'])).toThrow('Invalid --format');
  });

  it('parses --target', () => {
    const result = parseArgs(['build', './src/app.ts', '--target', 'es2022']);
    expect(result?.subcommand === 'build' && result.build.target).toBe('es2022');
  });

  it('parses --target=', () => {
    const result = parseArgs(['build', './src/app.ts', '--target=node18']);
    expect(result?.subcommand === 'build' && result.build.target).toBe('node18');
  });

  it('parses --external (repeatable)', () => {
    const result = parseArgs(['build', './src/app.ts', '--external', 'mongoose', '--external', 'winston']);
    expect(result?.subcommand === 'build' && result.build.external).toEqual(['mongoose', 'winston']);
  });

  it('parses --external=', () => {
    const result = parseArgs(['build', './src/app.ts', '--external=mongoose']);
    expect(result?.subcommand === 'build' && result.build.external).toEqual(['mongoose']);
  });

  it('parses --no-clean', () => {
    const result = parseArgs(['build', './src/app.ts', '--no-clean']);
    expect(result?.subcommand === 'build' && result.build.clean).toBe(false);
  });

  it('throws on missing app path', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => parseArgs(['build'])).toThrow('Missing required argument');
    spy.mockRestore();
  });

  it('throws on unknown argument', () => {
    expect(() => parseArgs(['build', './app.ts', '--bogus'])).toThrow('Unknown argument');
  });

  it('throws on duplicate positional argument', () => {
    expect(() => parseArgs(['build', './a.ts', './b.ts'])).toThrow('Unexpected positional argument');
  });

  it('treats leading-dash paths after -- as positional', () => {
    const result = parseArgs(['build', '--', '--app.ts']);
    expect(result?.subcommand === 'build' && result.build.appPath).toBe('--app.ts');
  });

  it('rejects empty equal-form build option values', () => {
    expect(() => parseArgs(['build', './src/app.ts', '--init='])).toThrow('Missing value for argument: --init');
    expect(() => parseArgs(['build', './src/app.ts', '--out-dir='])).toThrow('Missing value for argument: --out-dir');
    expect(() => parseArgs(['build', './src/app.ts', '--external='])).toThrow('Missing value for argument: --external');
  });
});

// ---------------------------------------------------------------------------
// parseArgs — build-serverless subcommand
// ---------------------------------------------------------------------------

describe('parseArgs — build-serverless', () => {
  it('parses subcommand and app path', () => {
    const result = parseArgs(['build-serverless', './src/app.ts']);
    expect(result?.subcommand).toBe('build-serverless');
    expect(result?.subcommand === 'build-serverless' && result.buildServerless.appPath).toBe('./src/app.ts');
  });

  it('uses serverless defaults', () => {
    const result = parseArgs(['build-serverless', './src/app.ts']);
    if (result?.subcommand !== 'build-serverless') throw new Error('expected build-serverless subcommand');
    expect(result.buildServerless.outDir).toBe('dist');
    expect(result.buildServerless.outName).toBe('handler');
    expect(result.buildServerless.initPath).toBeUndefined();
    expect(result.buildServerless.tsconfigPath).toBeUndefined();
  });

  it('parses --tsconfig for build-serverless', () => {
    const result = parseArgs(['build-serverless', './src/app.ts', '--tsconfig', './tsconfig.runtime.json']);
    expect(result?.subcommand === 'build-serverless' && result.buildServerless.tsconfigPath).toBe(
      './tsconfig.runtime.json',
    );
  });
});

// ---------------------------------------------------------------------------
// generateRuntimeEntry
// ---------------------------------------------------------------------------

describe('generateRuntimeEntry', () => {
  it('generates entry without init hook', () => {
    const content = generateRuntimeEntry('./src/app.ts');
    expect(content).toContain('export default app');
    expect(content).toContain('export { app }');
    expect(content).not.toContain('export { default as init }');
  });

  it('generates entry with init hook', () => {
    const content = generateRuntimeEntry('./src/app.ts', './src/init.ts');
    expect(content).toContain('export { default as init }');
  });

  it('resolves paths to absolute', () => {
    const content = generateRuntimeEntry('./src/app.ts', './src/init.ts');
    const cwd = process.cwd();
    expect(content).toContain(JSON.stringify(`${cwd}/src/app.ts`));
    expect(content).toContain(JSON.stringify(`${cwd}/src/init.ts`));
  });
});

// ---------------------------------------------------------------------------
// generateServerlessEntry
// ---------------------------------------------------------------------------

describe('generateServerlessEntry', () => {
  it('generates entry without init hook', () => {
    const content = generateServerlessEntry('./src/app.ts');
    expect(content).toContain("from '@web-ts-toolkit/express-runtime'");
    expect(content).toContain('createServerlessHandler(app)');
    expect(content).toContain('export { handler }');
    expect(content).not.toContain('init');
  });

  it('generates entry with init hook', () => {
    const content = generateServerlessEntry('./src/app.ts', './src/init.ts');
    expect(content).toContain('import init from ');
    expect(content).toContain('createServerlessHandler(app, { init })');
    expect(content).toContain('export { handler }');
  });

  it('resolves paths to absolute', () => {
    const content = generateServerlessEntry('./src/app.ts');
    const cwd = process.cwd();
    expect(content).toContain(JSON.stringify(`${cwd}/src/app.ts`));
  });

  it('resolves init path to absolute', () => {
    const content = generateServerlessEntry('./src/app.ts', './src/init.ts');
    const cwd = process.cwd();
    expect(content).toContain(JSON.stringify(`${cwd}/src/init.ts`));
  });

  it('includes a do-not-edit header', () => {
    const content = generateServerlessEntry('./src/app.ts');
    expect(content).toContain('Auto-generated');
    expect(content).toContain('do not edit');
  });
});

// ---------------------------------------------------------------------------
// isExpressApp
// ---------------------------------------------------------------------------

describe('isExpressApp', () => {
  it('recognizes an Express app instance', () => {
    expect(isExpressApp(createExpressApp())).toBe(true);
  });

  it('recognizes an express() instance', () => {
    expect(isExpressApp(express())).toBe(true);
  });

  it('rejects null and undefined', () => {
    expect(isExpressApp(null)).toBe(false);
    expect(isExpressApp(undefined)).toBe(false);
  });

  it('rejects plain objects', () => {
    expect(isExpressApp({})).toBe(false);
  });

  it('rejects objects missing Express methods', () => {
    expect(isExpressApp({ listen: () => false })).toBe(false);
    expect(isExpressApp({ use: () => false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractExport
// ---------------------------------------------------------------------------

describe('extractExport', () => {
  it('prefers default export', () => {
    expect(extractExport({ default: 'A', app: 'B' })).toBe('A');
  });

  it('falls back to named app export', () => {
    expect(extractExport({ app: 'B' })).toBe('B');
  });

  it('returns undefined when nothing is exported', () => {
    expect(extractExport({})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveExport
// ---------------------------------------------------------------------------

describe('resolveExport', () => {
  it('returns an Express app directly', async () => {
    const app = createExpressApp();
    expect(await resolveExport(app, 'x.ts')).toBe(app);
  });

  it('awaits an async function returning an Express app', async () => {
    const app = createExpressApp();
    const factory = async () => app;
    expect(await resolveExport(factory, 'x.ts')).toBe(app);
  });

  it('awaits a sync function returning an Express app', async () => {
    const app = createExpressApp();
    const factory = () => app;
    expect(await resolveExport(factory, 'x.ts')).toBe(app);
  });

  it('throws if a function does not return an Express app', async () => {
    const factory = async () => ({ not: 'express' });
    await expect(resolveExport(factory, 'x.ts')).rejects.toThrow('did not return an Express app');
  });

  it('throws if the export is neither an app nor a function', async () => {
    await expect(resolveExport(42, 'x.ts')).rejects.toThrow('not an Express app');
    await expect(resolveExport('hello', 'x.ts')).rejects.toThrow('not an Express app');
    await expect(resolveExport(null, 'x.ts')).rejects.toThrow('not an Express app');
  });
});

// ---------------------------------------------------------------------------
// parseArgs — start subcommand
// ---------------------------------------------------------------------------

describe('parseArgs — start', () => {
  it('parses subcommand and app path', () => {
    const result = parseArgs(['start', './dist/app.js']);
    expect(result?.subcommand).toBe('start');
    expect(result?.subcommand === 'start' && result.start.appPath).toBe('./dist/app.js');
  });

  it('parses --port as a number', () => {
    const result = parseArgs(['start', './app.js', '--port', '9000']);
    expect(result?.subcommand === 'start' && result.start.options.port).toBe(9000);
  });

  it('parses --port= form', () => {
    const result = parseArgs(['start', './app.js', '--port=9000']);
    expect(result?.subcommand === 'start' && result.start.options.port).toBe(9000);
  });

  it('parses --host', () => {
    const result = parseArgs(['start', './app.js', '--host', 'localhost']);
    expect(result?.subcommand === 'start' && result.start.options.host).toBe('localhost');
  });

  it('parses --no-signals', () => {
    const result = parseArgs(['start', './app.js', '--no-signals']);
    expect(result?.subcommand === 'start' && result.start.options.signals).toBe(false);
  });

  it('parses --shutdown-timeout', () => {
    const result = parseArgs(['start', './app.js', '--shutdown-timeout', '3000']);
    expect(result?.subcommand === 'start' && result.start.options.shutdownTimeout).toBe(3000);
  });

  it('throws on missing handler path', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => parseArgs(['start'])).toThrow('Missing required argument');
    spy.mockRestore();
  });

  it('throws on unknown argument', () => {
    expect(() => parseArgs(['start', './app.js', '--bogus'])).toThrow('Unknown argument');
  });

  it('throws on duplicate positional argument', () => {
    expect(() => parseArgs(['start', './a.js', './b.js'])).toThrow('Unexpected positional argument');
  });

  it('parses --require (repeatable)', () => {
    const result = parseArgs(['start', './app.js', '--require', 'dotenv/config']);
    expect(result?.subcommand === 'start' && result.start.require).toEqual(['dotenv/config']);
  });

  it('parses --env', () => {
    const result = parseArgs(['start', './app.js', '--env', './.env']);
    expect(result?.subcommand === 'start' && result.start.env).toEqual(['./.env']);
  });

  it('rejects --watch', () => {
    expect(() => parseArgs(['start', './app.js', '--watch', './src'])).toThrow(
      '--watch/--tsconfig/--ext/--delay are not supported with the start subcommand',
    );
  });

  it('rejects --tsconfig', () => {
    expect(() => parseArgs(['start', './app.js', '--tsconfig', './tsconfig.runtime.json'])).toThrow(
      '--watch/--tsconfig/--ext/--delay are not supported with the start subcommand',
    );
  });

  it('rejects --ext', () => {
    expect(() => parseArgs(['start', './app.js', '--ext', 'ts'])).toThrow(
      '--watch/--tsconfig/--ext/--delay are not supported with the start subcommand',
    );
  });

  it('rejects --delay', () => {
    expect(() => parseArgs(['start', './app.js', '--delay', '500'])).toThrow(
      '--watch/--tsconfig/--ext/--delay are not supported with the start subcommand',
    );
  });
});

// ---------------------------------------------------------------------------
// parseArgs — start-serverless subcommand
// ---------------------------------------------------------------------------

describe('parseArgs — start-serverless', () => {
  it('parses subcommand and handler path', () => {
    const result = parseArgs(['start-serverless', './dist/handler.js']);
    expect(result?.subcommand).toBe('start-serverless');
    expect(result?.subcommand === 'start-serverless' && result.startServerless.handlerPath).toBe('./dist/handler.js');
  });

  it('rejects watch flags with a serverless-specific message', () => {
    expect(() => parseArgs(['start-serverless', './handler.js', '--watch', './src'])).toThrow(
      '--watch/--tsconfig/--ext/--delay are not supported with the start-serverless subcommand',
    );
  });
});

// ---------------------------------------------------------------------------
// toServerlessEvent
// ---------------------------------------------------------------------------

describe('toServerlessEvent', () => {
  it('builds an AWS REST API v1 event with method, path, headers, and base64 body', () => {
    const event = toServerlessEvent(
      'POST',
      '/api/echo?a=1&a=2&empty=',
      { 'content-type': 'application/json', 'x-repeat': ['one', 'two'] },
      Buffer.from('{"hi":1}'),
    );
    expect(event.httpMethod).toBe('POST');
    expect(event.path).toBe('/api/echo');
    expect(event.headers).toEqual({ 'content-type': 'application/json', 'x-repeat': 'one, two' });
    expect(event.multiValueHeaders).toEqual({ 'content-type': ['application/json'], 'x-repeat': ['one', 'two'] });
    expect(event.queryStringParameters).toEqual({ a: '2', empty: '' });
    expect(event.multiValueQueryStringParameters).toEqual({ a: ['1', '2'], empty: [''] });
    expect(event.body).toBe(Buffer.from('{"hi":1}').toString('base64'));
    expect(event.isBase64Encoded).toBe(true);
    expect(event.requestContext).toEqual({ identity: { sourceIp: '' } });
  });

  it('uses an empty non-base64 string body for empty buffers', () => {
    const event = toServerlessEvent('GET', '/api/ping', {}, Buffer.alloc(0));
    expect(event.body).toBe('');
    expect(event.isBase64Encoded).toBe(false);
  });

  it('decodes query components once without treating plus as space', () => {
    const event = toServerlessEvent(
      'GET',
      '/edge?plus=a+b&space=a%20b&encodedDelimiter=a%26b%3Dc&unicode=%E2%9C%93&already=%2526',
      {},
      Buffer.alloc(0),
    );
    expect(event.path).toBe('/edge');
    expect(event.queryStringParameters).toEqual({
      plus: 'a+b',
      space: 'a b',
      encodedDelimiter: 'a&b=c',
      unicode: '✓',
      already: '%26',
    });
    expect(event.multiValueQueryStringParameters).toEqual({
      plus: ['a+b'],
      space: ['a b'],
      encodedDelimiter: ['a&b=c'],
      unicode: ['✓'],
      already: ['%26'],
    });
  });

  // ERT-B03: origin-form paths must survive verbatim. The old WHATWG
  // `URL` split rewrote `//admin/users` to `/users` (host split),
  // resolved `/a/../private` to `/private`, and even decoded `%2E%2E`
  // before resolving dots — silently selecting a different route.
  it('preserves double slashes and literal dot segments in the event path', () => {
    for (const rawPath of ['//admin/users', '/a/../private', '/a/./b', '/a/b/../../c', '//']) {
      const event = toServerlessEvent('GET', rawPath, {}, Buffer.alloc(0));
      expect(event.path).toBe(rawPath);
    }
  });

  it('preserves encoded delimiters in the path and splits queries only on literal delimiters', () => {
    const cases: Array<{ url: string; path: string; query: Record<string, string> | null }> = [
      { url: '/%2E%2E/private', path: '/%2E%2E/private', query: null },
      { url: '/a%2Fb', path: '/a%2Fb', query: null },
      // Encoded `?` stays in the path; only the literal `?` starts the query.
      { url: '/a%3Fb', path: '/a%3Fb', query: null },
      { url: '/a%3Fb?x=1', path: '/a%3Fb', query: { x: '1' } },
      // A literal `?` inside the query value is preserved, not re-split.
      { url: '/x?a=1?b=2', path: '/x', query: { a: '1?b=2' } },
    ];
    for (const { url, path, query } of cases) {
      const event = toServerlessEvent('GET', url, {}, Buffer.alloc(0));
      expect(event.path).toBe(path);
      expect(event.queryStringParameters).toEqual(query);
    }
  });

  it('strips fragments, supports absolute-form and asterisk-form, and rejects other targets', () => {
    const withFragment = toServerlessEvent('GET', '/x?a=1#frag', {}, Buffer.alloc(0));
    expect(withFragment.path).toBe('/x');
    expect(withFragment.queryStringParameters).toEqual({ a: '1' });

    const fragmentOnly = toServerlessEvent('GET', '/x#frag', {}, Buffer.alloc(0));
    expect(fragmentOnly.path).toBe('/x');
    expect(fragmentOnly.queryStringParameters).toBeNull();

    const absolute = toServerlessEvent('GET', 'http://example.com//admin/users?a=1', {}, Buffer.alloc(0));
    expect(absolute.path).toBe('//admin/users');
    expect(absolute.queryStringParameters).toEqual({ a: '1' });

    const absoluteBare = toServerlessEvent('GET', 'http://example.com', {}, Buffer.alloc(0));
    expect(absoluteBare.path).toBe('/');
    expect(absoluteBare.queryStringParameters).toBeNull();

    const asterisk = toServerlessEvent('GET', '*', {}, Buffer.alloc(0));
    expect(asterisk.path).toBe('*');

    const empty = toServerlessEvent('GET', '', {}, Buffer.alloc(0));
    expect(empty.path).toBe('/');

    for (const bad of ['foo/bar', '?x=1', 'http:/foo']) {
      expect(() => toServerlessEvent('GET', bad, {}, Buffer.alloc(0))).toThrow(/Unsupported request target/);
    }
  });

  // ERT-B02: prototype-named query keys must survive as own keys (old code
  // threw `multi[key].push is not a function` on inherited members).
  it('preserves literal prototype-named query keys with duplicates in both maps', () => {
    const event = toServerlessEvent(
      'GET',
      '/x?constructor=one&constructor=two&toString=a&toString=b&__proto__=p1&__proto__=p2&hasOwnProperty=h&valueOf=v&plain=ok',
      {},
      Buffer.alloc(0),
    );
    // NOTE: expected maps are built via JSON.parse so `__proto__` is an own
    // key (an object literal would set the prototype instead).
    const expectedSingle = JSON.parse(
      '{"constructor":"two","toString":"b","__proto__":"p2","hasOwnProperty":"h","valueOf":"v","plain":"ok"}',
    ) as Record<string, string>;
    const expectedMulti = JSON.parse(
      '{"constructor":["one","two"],"toString":["a","b"],"__proto__":["p1","p2"],"hasOwnProperty":["h"],"valueOf":["v"],"plain":["ok"]}',
    ) as Record<string, string[]>;
    expect(event.queryStringParameters).toEqual(expectedSingle);
    expect(event.multiValueQueryStringParameters).toEqual(expectedMulti);
    // Own keys, not prototype mutation: `__proto__` must be an own property.
    expect(Object.prototype.hasOwnProperty.call(event.queryStringParameters, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(event.multiValueQueryStringParameters, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
    expect(typeof ({} as Record<string, unknown>).toString).toBe('function');
    expect(Object.prototype.hasOwnProperty.call({}, '__proto__')).toBe(false);
  });

  it('preserves percent-encoded prototype-named query keys and duplicate order', () => {
    const event = toServerlessEvent(
      'GET',
      '/x?%63onstructor=first&constructor=second&%74oString=x&toString=y&__proto__=plain&%5F%5Fproto%5F%5F=encoded',
      {},
      Buffer.alloc(0),
    );
    const expectedSingle = JSON.parse('{"constructor":"second","toString":"y","__proto__":"encoded"}') as Record<
      string,
      string
    >;
    const expectedMulti = JSON.parse(
      '{"constructor":["first","second"],"toString":["x","y"],"__proto__":["plain","encoded"]}',
    ) as Record<string, string[]>;
    expect(event.queryStringParameters).toEqual(expectedSingle);
    expect(event.multiValueQueryStringParameters).toEqual(expectedMulti);
  });

  it('keeps prototype-named header keys as own keys in both header maps', () => {
    const headers = JSON.parse('{"constructor":"c","__proto__":"p","x-ok":"yes"}') as Record<string, string>;
    const event = toServerlessEvent('GET', '/x?a=1', headers, Buffer.alloc(0));
    const expectedMulti = JSON.parse('{"constructor":["c"],"__proto__":["p"],"x-ok":["yes"]}') as Record<
      string,
      string[]
    >;
    const expectedSingle = JSON.parse('{"constructor":"c","__proto__":"p","x-ok":"yes"}') as Record<string, string>;
    expect(event.multiValueHeaders).toEqual(expectedMulti);
    expect(event.headers).toEqual(expectedSingle);
    expect(Object.prototype.hasOwnProperty.call(event.headers, '__proto__')).toBe(true);
    // Ordinary queries/headers still round-trip alongside prototype keys.
    expect(event.queryStringParameters).toEqual({ a: '1' });
  });

  it('writes prototype-named result headers without key loss', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult(
        {
          headers: { constructor: 'single', plain: 'yes' },
          multiValueHeaders: { toString: ['m1', 'm2'] },
          body: 'ok',
        },
        res,
      );
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['constructor']).toBe('single');
    expect(res.headers['tostring']).toBe('m1,m2');
    expect(res.headers['plain']).toBe('yes');
    expect(res.text).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// applyServerlessResult
// ---------------------------------------------------------------------------

describe('applyServerlessResult', () => {
  it('writes status, headers, and body', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult({ statusCode: 201, headers: { 'x-custom': 'yes' }, body: 'created' }, res);
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(201);
    expect(res.headers['x-custom']).toBe('yes');
    expect(res.text).toBe('created');
  });

  it('defaults to 200 when statusCode is missing', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult({ body: 'ok' }, res);
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  it('defaults an empty object result to 200 empty', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult({}, res);
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
  });

  it('decodes base64 bodies when isBase64Encoded is true', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      const payload = Buffer.from('hello world').toString('base64');
      applyServerlessResult({ isBase64Encoded: true, body: payload }, res);
    });

    const res = await request(app).get('/test');
    expect(res.text).toBe('hello world');
  });

  it('joins multi-value header values', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult({ multiValueHeaders: { 'x-custom': ['a=1', 'b=2'] }, body: '' }, res);
    });

    const res = await request(app).get('/test');
    expect(res.headers['x-custom']).toBe('a=1,b=2');
  });

  it('preserves multiple Set-Cookie headers', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult({ multiValueHeaders: { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] }, body: '' }, res);
    });

    const res = await request(app).get('/test');
    expect(res.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('lets multiValueHeaders win over headers on collision', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult(
        { headers: { 'x-custom': 'single' }, multiValueHeaders: { 'x-custom': ['multi'] }, body: '' },
        res,
      );
    });

    const res = await request(app).get('/test');
    expect(res.headers['x-custom']).toBe('multi');
  });

  it('throws before writing when the result contract is invalid', () => {
    const app = express();
    app.get('/test', (_req, res) => {
      expect(() => applyServerlessResult({ statusCode: 99, headers: { 'x-before': 'no' }, body: 'no' }, res)).toThrow(
        'Invalid serverless result statusCode',
      );
      expect(res.headersSent).toBe(false);
      res.status(500).end('safe');
    });

    return request(app)
      .get('/test')
      .expect(500, 'safe')
      .expect((res) => {
        expect(res.headers['x-before']).toBeUndefined();
      });
  });

  it('rejects invalid header values and base64 bodies', () => {
    expect(() => applyServerlessResult({ headers: { 'x-bad': ['a', 'b'] }, body: '' }, express.response)).toThrow(
      'Invalid serverless result headers.x-bad',
    );
    expect(() => applyServerlessResult({ isBase64Encoded: true, body: 'not base64!' }, express.response)).toThrow(
      'not valid standard base64',
    );
    expect(() => applyServerlessResult(null, express.response)).toThrow('Invalid serverless result');
  });

  // ERT-B05: invalid multi-value names must fail during validation even with
  // an empty array (old code only checked names inside the value loop), and
  // nothing may be staged on the response before the throw.
  it('rejects invalid empty-array header names before mutating the response', () => {
    const app = express();
    app.get('/test', (_req, res) => {
      expect(() =>
        applyServerlessResult(
          { headers: { 'x-before': 'leak' }, multiValueHeaders: { 'bad header': [] }, body: 'leak' },
          res,
        ),
      ).toThrow('Invalid serverless result header multiValueHeaders.bad header');
      expect(res.headersSent).toBe(false);
      expect(res.getHeader('x-before')).toBeUndefined();
      res.status(500).end('safe');
    });

    return request(app)
      .get('/test')
      .expect(500, 'safe')
      .expect((res) => {
        expect(res.headers['x-before']).toBeUndefined();
      });
  });

  // ERT-B05: rollback — if application fails mid-write, staged headers are
  // removed so a fallback stays clean (covers setHeader failures beyond
  // validation, e.g. a hostile res double).
  it('rolls back staged headers when header application fails mid-write', () => {
    const app = express();
    app.get('/test', (_req, res) => {
      const original = res.setHeader.bind(res);
      let calls = 0;
      (res as unknown as { setHeader: (...args: unknown[]) => unknown }).setHeader = (...args: unknown[]) => {
        calls += 1;
        if (calls === 2) throw new Error('injected setHeader failure');
        return (original as (...a: unknown[]) => unknown)(...args);
      };
      expect(() =>
        applyServerlessResult(
          { headers: { 'x-first': 'one' }, multiValueHeaders: { 'x-second': ['two'] }, body: 'x' },
          res,
        ),
      ).toThrow('injected setHeader failure');
      expect(res.headersSent).toBe(false);
      expect(res.getHeader('x-first')).toBeUndefined();
      expect(res.getHeader('x-second')).toBeUndefined();
      res.status(500).end('safe');
    });

    return request(app)
      .get('/test')
      .expect(500, 'safe')
      .expect((res) => {
        expect(res.headers['x-first']).toBeUndefined();
        expect(res.headers['x-second']).toBeUndefined();
      });
  });

  // ERT-B05: valid empty arrays are omitted; an empty multi entry does not
  // shadow the single-value map, and set-cookie precedence still works.
  it('omits valid empty multi-value arrays without shadowing single headers', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult(
        {
          headers: { 'x-keep': 'yes', 'x-shadowed': 'single' },
          multiValueHeaders: { 'x-empty': [], 'x-shadowed': ['multi'] },
          body: 'ok',
        },
        res,
      );
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(res.headers['x-keep']).toBe('yes');
    expect(res.headers['x-empty']).toBeUndefined();
    expect(res.headers['x-shadowed']).toBe('multi');
  });
});

// ---------------------------------------------------------------------------
// createServerlessAdapterApp
// ---------------------------------------------------------------------------

describe('createServerlessAdapterApp', () => {
  it('proxies HTTP requests through a serverless handler', async () => {
    const handler = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pong: true }),
    });
    const app = createServerlessAdapterApp(handler);

    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });

    // Verify the handler received a proper serverless event
    expect(handler).toHaveBeenCalledOnce();
    const [[event]] = handler.mock.calls as [[Record<string, unknown>]];
    expect(event.httpMethod).toBe('GET');
    expect(event.path).toBe('/api/ping');
  });

  it('passes the request body as a base64 AWS v1 event string to the handler', async () => {
    const handler = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ received: true }),
    });
    const app = createServerlessAdapterApp(handler);

    const res = await request(app).post('/echo').send({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const [[event]] = handler.mock.calls as [[Record<string, unknown>]];
    expect(event.httpMethod).toBe('POST');
    expect(event.body).toBe(Buffer.from('{"hello":"world"}').toString('base64'));
    expect(event.isBase64Encoded).toBe(true);
  });

  it('returns 500 if the handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler crashed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createServerlessAdapterApp(handler);

    const res = await request(app).get('/crash');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Internal server error');
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// loadBuiltApp / loadHandler
// ---------------------------------------------------------------------------

describe('loadBuiltApp', () => {
  it('loads a built app bundle and optional init hook', async () => {
    const path = new URL('../test/fixtures/built-app-module.mjs', import.meta.url).pathname;
    const loaded = await loadBuiltApp(path);
    expect(isExpressApp(loaded.app)).toBe(true);
    expect(typeof loaded.init).toBe('function');
  });

  it('throws when init is present but not a function', async () => {
    const path = new URL('../test/fixtures/built-app-invalid-init.mjs', import.meta.url).pathname;
    await expect(loadBuiltApp(path)).rejects.toThrow('must export "init" as a function');
  });
});

describe('loadHandler', () => {
  it('throws when the module has no "handler" function export', async () => {
    const path = new URL('../src/index.js', import.meta.url).pathname;
    await expect(loadHandler(path)).rejects.toThrow('must export a "handler" function');
  });
});

// ---------------------------------------------------------------------------
// parseEnvFile
// ---------------------------------------------------------------------------

describe('parseEnvFile', () => {
  it('parses simple KEY=VALUE lines', () => {
    expect(parseEnvFile('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores empty lines and comments', () => {
    expect(parseEnvFile('# comment\n\nFOO=bar\n  # indented comment\n')).toEqual({ FOO: 'bar' });
  });

  it('strips surrounding double quotes', () => {
    expect(parseEnvFile('FOO="hello world"')).toEqual({ FOO: 'hello world' });
  });

  it('strips surrounding single quotes', () => {
    expect(parseEnvFile("FOO='hello world'")).toEqual({ FOO: 'hello world' });
  });

  it('handles export prefix', () => {
    expect(parseEnvFile('export FOO=bar')).toEqual({ FOO: 'bar' });
  });

  it('handles empty value', () => {
    expect(parseEnvFile('FOO=')).toEqual({ FOO: '' });
  });

  it('skips lines without =', () => {
    expect(parseEnvFile('FOO\nBAR=baz')).toEqual({ BAR: 'baz' });
  });
});

// ---------------------------------------------------------------------------
// loadEnvFiles
// ---------------------------------------------------------------------------

describe('loadEnvFiles', () => {
  const tmpDir = join(tmpdir(), `wtt-env-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  it('loads env vars into process.env', () => {
    mkdirSync(tmpDir, { recursive: true });
    const envPath = join(tmpDir, 'test.env');
    writeFileSync(envPath, 'WTT_TEST_KEY=value123');
    loadEnvFiles([envPath]);
    expect(process.env.WTT_TEST_KEY).toBe('value123');
    delete process.env.WTT_TEST_KEY;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not override existing env vars', () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.WTT_EXISTING = 'original';
    const envPath = join(tmpDir, 'override.env');
    writeFileSync(envPath, 'WTT_EXISTING=overridden');
    loadEnvFiles([envPath]);
    expect(process.env.WTT_EXISTING).toBe('original');
    delete process.env.WTT_EXISTING;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws on missing file', () => {
    expect(() => loadEnvFiles(['./nonexistent.env'])).toThrow('Env file not found');
  });
});

// ---------------------------------------------------------------------------
// preloadModules
// ---------------------------------------------------------------------------

describe('preloadModules', () => {
  it('requires modules without error', async () => {
    await expect(preloadModules(['node:events'])).resolves.toBeUndefined();
  });

  it('is a no-op for empty list', async () => {
    await expect(preloadModules([])).resolves.toBeUndefined();
  });

  it('throws on missing module', async () => {
    await expect(preloadModules(['non-existent-pkg-xyz_123'])).rejects.toThrow();
  });

  // ERT-B10: relative preloads must resolve against the cwd captured when
  // preloading starts (like loadEnvFiles/loadApp), not the cwd at module
  // evaluation. Old code created `moduleRequire` once at import time, so a
  // cwd change from A to B still resolved `./register.cjs` in A.
  it('resolves same-named relative preloads against the current cwd after chdir (A/B isolation)', async () => {
    const marker = '__WTT_ERT_B10_PRELOAD__';
    const root = mkdtempSync(join(tmpdir(), 'wtt-ert-b10-'));
    const dirA = join(root, 'a');
    const dirB = join(root, 'b');
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirA, 'register.cjs'), `globalThis[${JSON.stringify(marker)}] = 'A';\n`);
    writeFileSync(join(dirB, 'register.cjs'), `globalThis[${JSON.stringify(marker)}] = 'B';\n`);
    const originalCwd = process.cwd();
    const globalRef = globalThis as Record<string, unknown>;
    const priorMarker = globalRef[marker];
    delete globalRef[marker];
    try {
      // Simulate the reported sequence: invocation in A, then cwd moves to B.
      process.chdir(dirA);
      process.chdir(dirB);
      await preloadModules(['./register.cjs']);
      expect(globalRef[marker]).toBe('B');
    } finally {
      process.chdir(originalCwd);
      if (priorMarker === undefined) delete globalRef[marker];
      else globalRef[marker] = priorMarker;
      for (const file of [join(dirA, 'register.cjs'), join(dirB, 'register.cjs')]) {
        try {
          delete require.cache[require.resolve(file)];
        } catch {
          // ignore unresolvable cache keys
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ERT-B10: sequential order is preserved (CJS side effects run in list
  // order) and builtins plus invocation-local bare dependencies still
  // resolve after a cwd change. No sandbox semantics are introduced.
  it('preserves sequential order and resolves builtins plus invocation-local bare deps', async () => {
    const orderMarker = '__WTT_ERT_B10_ORDER__';
    const bareMarker = '__WTT_ERT_B10_BARE__';
    const root = mkdtempSync(join(tmpdir(), 'wtt-ert-b10-order-'));
    const proj = join(root, 'proj');
    const barePkgDir = join(proj, 'node_modules', 'ert-b10-bare-pkg');
    mkdirSync(barePkgDir, { recursive: true });
    writeFileSync(
      join(proj, 'first.cjs'),
      `globalThis[${JSON.stringify(orderMarker)}] = [...(globalThis[${JSON.stringify(orderMarker)}] ?? []), 'first'];\n`,
    );
    writeFileSync(
      join(proj, 'second.cjs'),
      `globalThis[${JSON.stringify(orderMarker)}] = [...(globalThis[${JSON.stringify(orderMarker)}] ?? []), 'second'];\n`,
    );
    writeFileSync(
      join(barePkgDir, 'package.json'),
      JSON.stringify({ name: 'ert-b10-bare-pkg', version: '1.0.0', main: 'index.cjs' }),
    );
    writeFileSync(join(barePkgDir, 'index.cjs'), `globalThis[${JSON.stringify(bareMarker)}] = 'bare-ok';\n`);
    const originalCwd = process.cwd();
    const globalRef = globalThis as Record<string, unknown>;
    const priorOrder = globalRef[orderMarker];
    const priorBare = globalRef[bareMarker];
    delete globalRef[orderMarker];
    delete globalRef[bareMarker];
    try {
      process.chdir(proj);
      await preloadModules(['./first.cjs', './second.cjs', 'node:events', 'ert-b10-bare-pkg']);
      expect(globalRef[orderMarker]).toEqual(['first', 'second']);
      expect(globalRef[bareMarker]).toBe('bare-ok');
    } finally {
      process.chdir(originalCwd);
      if (priorOrder === undefined) delete globalRef[orderMarker];
      else globalRef[orderMarker] = priorOrder;
      if (priorBare === undefined) delete globalRef[bareMarker];
      else globalRef[bareMarker] = priorBare;
      for (const file of [join(proj, 'first.cjs'), join(proj, 'second.cjs'), join(barePkgDir, 'index.cjs')]) {
        try {
          delete require.cache[require.resolve(file)];
        } catch {
          // ignore unresolvable cache keys
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// buildChildArgs
// ---------------------------------------------------------------------------

describe('buildChildArgs', () => {
  it('builds child argv with subcommand and app path', () => {
    const args = {
      appPath: './app.mts',
      options: {},
      tsconfigPath: undefined,
      require: [],
      env: [],
      watch: ['./src'],
      watchExt: ['ts'],
      watchDelay: 500,
    };
    expect(buildChildArgs(args)).toEqual(['dev', '--', './app.mts']);
  });

  it('includes port, host, and shutdown options', () => {
    const args = {
      appPath: './app.mts',
      options: { port: 3000, host: 'localhost', shutdownTimeout: 2000, signals: false },
      tsconfigPath: undefined,
      require: [],
      env: [],
      watch: [],
      watchExt: [],
      watchDelay: 500,
    };
    expect(buildChildArgs(args)).toEqual([
      'dev',
      '--port',
      '3000',
      '--host',
      'localhost',
      '--no-signals',
      '--shutdown-timeout',
      '2000',
      '--',
      './app.mts',
    ]);
  });

  it('includes require and env flags', () => {
    const args = {
      appPath: './app.mts',
      options: {},
      tsconfigPath: './tsconfig.runtime.json',
      require: ['tsconfig-paths/register', 'dotenv/config'],
      env: ['./.env'],
      watch: [],
      watchExt: [],
      watchDelay: 500,
    };
    expect(buildChildArgs(args)).toEqual([
      'dev',
      '--tsconfig',
      './tsconfig.runtime.json',
      '--require',
      'tsconfig-paths/register',
      '--require',
      'dotenv/config',
      '--env',
      './.env',
      '--',
      './app.mts',
    ]);
  });

  it('omits watch, ext, and delay from child args', () => {
    const args = {
      appPath: './app.mts',
      options: {},
      tsconfigPath: './tsconfig.runtime.json',
      require: [],
      env: [],
      watch: ['./src', './shared'],
      watchExt: ['ts', 'json'],
      watchDelay: 1000,
    };
    const childArgv = buildChildArgs(args);
    expect(childArgv).not.toContain('--watch');
    expect(childArgv).not.toContain('./src');
    expect(childArgv).not.toContain('--ext');
    expect(childArgv).not.toContain('--delay');
  });

  // ERT-B09: parse/reconstruct/parse round trips preserve `--` protection.
  describe('ERT-B09 positional escaping round trips', () => {
    const parseDev = (argv: string[]) => {
      const parsed = parseArgs(argv);
      expect(parsed).not.toBeNull();
      if (parsed === null || parsed.subcommand !== 'dev') throw new Error('expected dev args');
      return parsed.dev;
    };

    it.each(['--app.js', '--help', '--version', 'my app.mts', './app.mts'])(
      'round-trips positional %s through watch reconstruction',
      (appPath) => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
          const parent = parseDev(['dev', '--watch', './src', '--', appPath]);
          expect(parent.appPath).toBe(appPath);
          const childArgv = buildChildArgs(parent);
          // Generated options (none here) precede `--`; positional stays protected.
          expect(childArgv).toEqual(['dev', '--', appPath]);
          const child = parseDev(childArgv);
          expect(child.appPath).toBe(appPath);
        } finally {
          logSpy.mockRestore();
        }
      },
    );

    it('retains env/preload/start options and drops watch-only flags on reconstruct', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const parent = parseDev([
          'dev',
          '--watch',
          './src',
          '--ext',
          'ts,json',
          '--delay',
          '1000',
          '--port',
          '3000',
          '--host',
          'localhost',
          '--no-signals',
          '--shutdown-timeout',
          '2000',
          '--tsconfig',
          './tsconfig.runtime.json',
          '--require',
          'tsconfig-paths/register',
          '--env',
          './.env',
          '--',
          '--app.js',
        ]);
        const childArgv = buildChildArgs(parent);
        expect(childArgv).toEqual([
          'dev',
          '--port',
          '3000',
          '--host',
          'localhost',
          '--no-signals',
          '--shutdown-timeout',
          '2000',
          '--tsconfig',
          './tsconfig.runtime.json',
          '--require',
          'tsconfig-paths/register',
          '--env',
          './.env',
          '--',
          '--app.js',
        ]);
        const child = parseDev(childArgv);
        expect(child.appPath).toBe('--app.js');
        expect(child.options).toEqual(parent.options);
        expect(child.require).toEqual(['tsconfig-paths/register']);
        expect(child.env).toEqual(['./.env']);
        expect(child.tsconfigPath).toBe('./tsconfig.runtime.json');
        expect(child.watch).toEqual([]);
      } finally {
        logSpy.mockRestore();
      }
    });

    it('watched leading-dash fixtures start instead of help/unknown-option errors', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        for (const appPath of ['--app.js', '--help', '--version']) {
          const parent = parseDev(['dev', '--watch', './src', '--', appPath]);
          const childArgv = buildChildArgs(parent);
          let child: ReturnType<typeof parseArgs>;
          expect(() => {
            child = parseArgs(childArgv);
          }).not.toThrow();
          expect(child!).not.toBeNull();
          if (child === null || child.subcommand !== 'dev') throw new Error('expected dev args');
          expect(child.dev.appPath).toBe(appPath);
        }
        // `--help`/`--version` as positionals must not trigger the help/version screen.
        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
      }
    });
  });
});
