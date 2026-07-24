import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

  it('skips a -- delimiter', () => {
    const result = parseArgs(['dev', '--', './app.js']);
    expect(result?.subcommand === 'dev' && result.dev.appPath).toBe('./app.js');
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
  });

  it('parses --init', () => {
    const result = parseArgs(['build', './src/app.ts', '--init', './src/init.ts']);
    expect(result?.subcommand === 'build' && result.build.initPath).toBe('./src/init.ts');
  });

  it('parses --init=', () => {
    const result = parseArgs(['build', './src/app.ts', '--init=./src/init.ts']);
    expect(result?.subcommand === 'build' && result.build.initPath).toBe('./src/init.ts');
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
      '--watch/--ext/--delay are not supported with the start subcommand',
    );
  });

  it('rejects --ext', () => {
    expect(() => parseArgs(['start', './app.js', '--ext', 'ts'])).toThrow(
      '--watch/--ext/--delay are not supported with the start subcommand',
    );
  });

  it('rejects --delay', () => {
    expect(() => parseArgs(['start', './app.js', '--delay', '500'])).toThrow(
      '--watch/--ext/--delay are not supported with the start subcommand',
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
      '--watch/--ext/--delay are not supported with the start-serverless subcommand',
    );
  });
});

// ---------------------------------------------------------------------------
// toServerlessEvent
// ---------------------------------------------------------------------------

describe('toServerlessEvent', () => {
  it('builds an event with method, path, headers, and body', () => {
    const event = toServerlessEvent(
      'POST',
      '/api/echo',
      { 'content-type': 'application/json' },
      Buffer.from('{"hi":1}'),
    );
    expect(event.httpMethod).toBe('POST');
    expect(event.path).toBe('/api/echo');
    expect(event.headers).toEqual({ 'content-type': 'application/json' });
    expect(event.body).toEqual(Buffer.from('{"hi":1}'));
  });

  it('returns undefined body for empty buffers', () => {
    const event = toServerlessEvent('GET', '/api/ping', {}, Buffer.alloc(0));
    expect(event.body).toBeUndefined();
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

  it('handles null/undefined result as 200 empty', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult(null, res);
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

  it('joins array header values', async () => {
    const app = express();
    app.get('/test', (_req, res) => {
      applyServerlessResult({ headers: { 'x-custom': ['a=1', 'b=2'] }, body: '' }, res);
    });

    const res = await request(app).get('/test');
    expect(res.headers['x-custom']).toBe('a=1,b=2');
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

  it('passes the request body as a Buffer to the handler', async () => {
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
    expect(Buffer.isBuffer(event.body)).toBe(true);
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
});

// ---------------------------------------------------------------------------
// buildChildArgs
// ---------------------------------------------------------------------------

describe('buildChildArgs', () => {
  it('builds child argv with subcommand and app path', () => {
    const args = {
      appPath: './app.mts',
      options: {},
      require: [],
      env: [],
      watch: ['./src'],
      watchExt: ['ts'],
      watchDelay: 500,
    };
    expect(buildChildArgs(args)).toEqual(['dev', './app.mts']);
  });

  it('includes port, host, and shutdown options', () => {
    const args = {
      appPath: './app.mts',
      options: { port: 3000, host: 'localhost', shutdownTimeout: 2000, signals: false },
      require: [],
      env: [],
      watch: [],
      watchExt: [],
      watchDelay: 500,
    };
    expect(buildChildArgs(args)).toEqual([
      'dev',
      './app.mts',
      '--port',
      '3000',
      '--host',
      'localhost',
      '--no-signals',
      '--shutdown-timeout',
      '2000',
    ]);
  });

  it('includes require and env flags', () => {
    const args = {
      appPath: './app.mts',
      options: {},
      require: ['tsconfig-paths/register', 'dotenv/config'],
      env: ['./.env'],
      watch: [],
      watchExt: [],
      watchDelay: 500,
    };
    expect(buildChildArgs(args)).toEqual([
      'dev',
      './app.mts',
      '--require',
      'tsconfig-paths/register',
      '--require',
      'dotenv/config',
      '--env',
      './.env',
    ]);
  });

  it('omits watch, ext, and delay from child args', () => {
    const args = {
      appPath: './app.mts',
      options: {},
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
});
