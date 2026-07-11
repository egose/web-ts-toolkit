import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { readValue, parseArgs, isExpressApp, extractExport, resolveExport, CLI_VERSION } from '../src/cli-utils';
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
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('returns null for --help and prints usage', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['--help'])).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns null for -h', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['-h'])).toBeNull();
    spy.mockRestore();
  });

  it('returns null for --version and prints version', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['--version'])).toBeNull();
    expect(spy).toHaveBeenCalledWith(CLI_VERSION);
    spy.mockRestore();
  });

  it('returns null for -V', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseArgs(['-V'])).toBeNull();
    spy.mockRestore();
  });

  it('parses a positional app path', () => {
    expect(parseArgs(['./app.js'])?.appPath).toBe('./app.js');
  });

  it('parses --port as a number', () => {
    expect(parseArgs(['./app.js', '--port', '3000'])?.options.port).toBe(3000);
  });

  it('parses --port= form', () => {
    expect(parseArgs(['./app.js', '--port=3000'])?.options.port).toBe(3000);
  });

  it('keeps --port as a string when it is non-numeric (named pipe)', () => {
    expect(parseArgs(['./app.js', '--port', '\\\\.\\pipe\\test'])?.options.port).toBe('\\\\.\\pipe\\test');
  });

  it('parses --host', () => {
    expect(parseArgs(['./app.js', '--host', 'localhost'])?.options.host).toBe('localhost');
  });

  it('parses --host=', () => {
    expect(parseArgs(['./app.js', '--host=localhost'])?.options.host).toBe('localhost');
  });

  it('parses --no-signals', () => {
    expect(parseArgs(['./app.js', '--no-signals'])?.options.signals).toBe(false);
  });

  it('parses --shutdown-timeout', () => {
    expect(parseArgs(['./app.js', '--shutdown-timeout', '2000'])?.options.shutdownTimeout).toBe(2000);
  });

  it('parses --shutdown-timeout=', () => {
    expect(parseArgs(['./app.js', '--shutdown-timeout=2000'])?.options.shutdownTimeout).toBe(2000);
  });

  it('skips a -- delimiter', () => {
    expect(parseArgs(['--', './app.js'])?.appPath).toBe('./app.js');
  });

  it('throws on unknown argument', () => {
    expect(() => parseArgs(['./app.js', '--bogus'])).toThrow('Unknown argument');
  });

  it('throws on missing app path', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => parseArgs([])).toThrow('Missing required argument');
    spy.mockRestore();
  });

  it('throws on duplicate positional argument', () => {
    expect(() => parseArgs(['./a.js', './b.js'])).toThrow('Unexpected positional argument');
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
