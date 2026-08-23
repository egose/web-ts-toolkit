import { pathToFileURL } from 'node:url';
import {
  dirname,
  resolve as pathResolve,
  extname,
  join as pathJoin,
  normalize as pathNormalize,
  parse as pathParse,
  sep as pathSep,
} from 'node:path';
import {
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  realpathSync,
  watch,
  mkdtempSync,
  lstatSync,
  chmodSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { fork, type ChildProcess } from 'node:child_process';
import { validateHeaderName, validateHeaderValue } from 'node:http';
import type { Express, Request, Response } from 'express';
import { createExpressApp, type LocalServerOptions } from './index';
import { MAX_INTEGER_OPTION_VALUE, parsePortValue, validateFiniteInteger } from './numeric-validation';

function readPackageVersion(candidatePath: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(candidatePath, 'utf8')) as { version?: unknown };
    return typeof manifest.version === 'string' && manifest.version.length > 0 ? manifest.version : undefined;
  } catch (_error) {
    void _error;
    return undefined;
  }
}

export function resolveCliVersion(executablePath = process.argv[1]): string {
  let resolvedExecutable: string | undefined;
  try {
    resolvedExecutable = executablePath ? realpathSync(executablePath) : undefined;
  } catch (_error) {
    void _error;
  }
  const executableDir = resolvedExecutable ? dirname(resolvedExecutable) : undefined;
  const candidates = executableDir
    ? [pathJoin(executableDir, 'package.json'), pathJoin(executableDir, '..', 'package.json')]
    : [];
  for (const candidate of candidates) {
    const version = readPackageVersion(candidate);
    if (version) return version;
  }
  return '0.0.0-dev';
}

export const CLI_VERSION = resolveCliVersion();

/**
 * Read the next argv value after a flag, throwing if it is missing, empty, or
 * looks like another flag.
 */
export function readValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`Missing value for argument: ${name}`);
  }
  return value;
}

function readInlineValue(arg: string, prefix: string, name: string): string {
  const value = arg.slice(prefix.length);
  if (value === '') {
    throw new Error(`Missing value for argument: ${name}`);
  }
  return value;
}

function parseIntegerFlag(raw: string, name: string, min = 0, max = MAX_INTEGER_OPTION_VALUE): number {
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`Invalid ${name}: ${raw}. Must be a finite integer in ${min}..${max}.`);
  }
  return validateFiniteInteger(Number(raw), { name, min, max });
}

function parsePortFlag(raw: string, name = '--port'): number | string {
  try {
    return parsePortValue(raw, name);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`Invalid ${name}:`)) {
      throw error;
    }
    throw new Error(`Invalid ${name}: ${raw}. Must be a port number in 0..65535 or a named pipe path.`, {
      cause: error,
    });
  }
}

function parseCsvFlagValue(raw: string, name: string): string[] {
  const values = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(`Missing value for argument: ${name}`);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Subcommand = 'dev' | 'build' | 'start' | 'build-serverless' | 'start-serverless';

export interface DevArgs {
  appPath: string;
  options: Omit<LocalServerOptions, 'init' | 'onShutdown'>;
  /** Optional tsconfig path for consumers that need TS path resolution. */
  tsconfigPath?: string;
  /** Modules to preload before loading the app (repeatable `--require`). */
  require: string[];
  /** Env files to load before loading the app (repeatable `--env`). */
  env: string[];
  /** Directories to watch for changes (repeatable `--watch`). */
  watch: string[];
  /** File extensions to watch (default: ts,js,mjs,cjs,json). */
  watchExt: string[];
  /** Debounce delay (ms) before restarting on file change (default: 500). */
  watchDelay: number;
}

export interface BuildArgs {
  appPath: string;
  initPath?: string;
  tsconfigPath?: string;
  outDir: string;
  outName: string;
  format: 'cjs' | 'esm';
  target: string;
  external: string[];
  clean: boolean;
}

export interface BuildEntryContentArgs {
  entryContent: string;
  tsconfigPath?: string;
  outDir: string;
  outName: string;
  format: 'cjs' | 'esm';
  target: string;
  external: string[];
  clean: boolean;
}

export interface StartArgs {
  appPath: string;
  options: Omit<LocalServerOptions, 'onShutdown'>;
  /** Modules to preload before loading the app bundle (repeatable `--require`). */
  require: string[];
  /** Env files to load before loading the app bundle (repeatable `--env`). */
  env: string[];
}

export interface StartServerlessArgs {
  handlerPath: string;
  options: Omit<LocalServerOptions, 'init' | 'onShutdown'>;
  /** Maximum bytes to buffer for request bodies via the local adapter. Default: 1048576. */
  maxBodyBytes?: number;
  /** Modules to preload before loading the handler (repeatable `--require`). */
  require: string[];
  /** Env files to load before loading the handler (repeatable `--env`). */
  env: string[];
}

export type ParsedArgs =
  | { subcommand: 'dev'; dev: DevArgs }
  | { subcommand: 'build'; build: BuildArgs }
  | { subcommand: 'build-serverless'; buildServerless: BuildArgs }
  | { subcommand: 'start'; start: StartArgs }
  | { subcommand: 'start-serverless'; startServerless: StartServerlessArgs }
  | null;

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printHelp(): void {
  console.log(`wtt-express-runtime

Run an Express app locally, bundle it for local or serverless runtimes, or run the bundle.

Usage:
  wtt-express-runtime <command> <app-module> [options]
  wtt-express-runtime <app-module> [options]   (alias for dev)

Commands:
  dev                           Run the Express app as a local dev server
  build                         Bundle the Express app as a local app module
  start                         Run a bundled local app module
  build-serverless              Bundle the Express app as a serverless handler
  start-serverless              Run a bundled serverless handler locally

Dev options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000)
  --require <module>            Module(s) to preload before app load (repeatable)
  --env <path>                  Env file(s) to load (repeatable; existing env vars are not overridden)
  --tsconfig <path>             Tsconfig used by config-aware consumers for TS path resolution
  --watch <paths>               Comma-separated paths to watch for restart (repeatable; dev only)
  --ext <extensions>            Comma-separated extensions to watch (default: ts,js,mjs,cjs,json)
  --delay <ms>                  Debounce ms before restarting on change (default: 500)

Build options:
  --init <path>                 Init hook module (default export, async function)
  --tsconfig <path>             Use a custom tsconfig for bundling
  --out-dir <path>              Output directory (default: dist)
  --out-name <name>             Output filename without extension (default: app)
  --format <cjs|esm>            Output format (default: cjs)
  --target <target>             Compilation target (default: node22)
  --external <pkg>              Mark package as external (repeatable; express always external)
  --no-clean                    Don't clean the output directory before building

Start options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000)
  --require <module>            Module(s) to preload before app load (repeatable)
  --env <path>                  Env file(s) to load (repeatable; existing env vars are not overridden)

Build-serverless options:
  --init <path>                 Init hook module (default export, async function)
  --tsconfig <path>             Use a custom tsconfig for bundling
  --out-dir <path>              Output directory (default: dist)
  --out-name <name>             Output filename without extension (default: handler)
  --format <cjs|esm>            Output format (default: cjs)
  --target <target>             Compilation target (default: node22)
  --external <pkg>              Mark package as external (repeatable; express always external)
  --no-clean                    Don't clean the output directory before building

Start-serverless options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000)
  --max-body-bytes <bytes>      Max request body bytes for adapter (default: 1048576; 0 disallows bodies)
  --require <module>            Module(s) to preload before handler load (repeatable)
  --env <path>                  Env file(s) to load (repeatable; existing env vars are not overridden)

Global options:
  -V, --version                 Show version
  -h, --help                    Show this help message

Examples:
  wtt-express-runtime dev ./dist/app.js
  wtt-express-runtime dev ./dist/app.js --port 3000 --host localhost
  wtt-express-runtime dev ./src/app.ts --env .env --require tsconfig-paths/register --watch ./src,./shared
  wtt-express-runtime build ./src/app.ts --out-dir dist
  wtt-express-runtime start ./dist/app.js --port 3000 --env .env
  wtt-express-runtime build-serverless ./src/app.ts --out-dir netlify/functions
  wtt-express-runtime build-serverless ./src/app.ts --init ./src/init.ts --format esm
  wtt-express-runtime start-serverless ./netlify/functions/handler.js --port 9000 --env .env
  wtt-express-runtime build-serverless ./src/app.ts && wtt-express-runtime start-serverless ./dist/handler.js

Notes:
  - In dev mode, the CLI evaluates arbitrary code from <app-module> in the current process.
  - TypeScript app modules in dev mode require a TS loader. Run via tsx:
      npx tsx ./node_modules/@web-ts-toolkit/express-runtime/cli.js dev ./src/app.ts
    Or use --require with a TS-aware loader module.
  - --env files are parsed as KEY=VALUE; existing process.env entries are never overridden.
    For advanced dotenv features (multiline, expansion), --require dotenv/config instead.
  - --watch forks one child process running the same CLI without --watch. File changes
    are serialized into one restart at a time: SIGTERM, SIGKILL after 5000 ms if needed,
    then respawn after the debounce delay. Shutdown closes owned watchers and signal handlers.
  - In build/build-serverless mode, express is always external. Add more externals with --external.
  - In start mode, the bundled app file must default-export an Express app (or export it as "app").
    If the bundle exports "init", it runs before the server starts listening.
  - In start-serverless mode, the bundled handler file must be a JS/CJS module whose
    "handler" export (or default export) is a function: (event, context) => Promise<result>.
  - The start-serverless adapter buffers at most --max-body-bytes per request (default 1 MiB, 0 = empty bodies only);
    larger declared Content-Length or chunked bodies receive 413 without invoking the handler.
  - Use -- before a positional path that starts with a dash, e.g. dev -- --app.js.
  - Numeric flag values are validated before env/preload/app loading, watching, or binding.
  - Init logic for dev mode (DB connections, etc.): add at the top level of your app module.
`);
}

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

function isVersion(arg: string): boolean {
  return arg === '-V' || arg === '--version';
}

function isHelp(arg: string): boolean {
  return arg === '-h' || arg === '--help';
}

function isSubcommand(arg: string): arg is Subcommand {
  return (
    arg === 'dev' || arg === 'build' || arg === 'start' || arg === 'build-serverless' || arg === 'start-serverless'
  );
}

const DEFAULT_WATCH_EXTENSIONS = ['ts', 'js', 'mjs', 'cjs', 'json'];
const DEFAULT_WATCH_DELAY = 500;

function parseRepeatable(argv: string[], index: number, arg: string, list: string[]): number {
  list.push(...parseCsvFlagValue(readValue(argv, index, arg), arg));
  return index + 1;
}

function addPositional(arg: string, current: string | undefined, label: string): string {
  if (current) {
    throw new Error(`Unexpected positional argument: ${arg}. ${label} already set to ${current}`);
  }
  return arg;
}

function optionArgs(argv: string[]): string[] {
  const terminator = argv.indexOf('--');
  return terminator === -1 ? argv : argv.slice(0, terminator);
}

function parseDevArgs(argv: string[]): DevArgs {
  const options: Omit<LocalServerOptions, 'init' | 'onShutdown'> = {};
  const requireModules: string[] = [];
  const envFiles: string[] = [];
  const watchPaths: string[] = [];
  let watchExt: string[] | undefined;
  let watchDelay: number | undefined;
  let tsconfigPath: string | undefined;
  let appPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      for (const positional of argv.slice(index + 1)) {
        appPath = addPositional(positional, appPath, 'App module');
      }
      break;
    }

    if (isHelp(arg) || isVersion(arg)) {
      continue;
    }

    if (arg === '--port') {
      options.port = parsePortFlag(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--port=')) {
      options.port = parsePortFlag(readInlineValue(arg, '--port=', '--port'));
      continue;
    }

    if (arg === '--host') {
      options.host = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--host=')) {
      options.host = readInlineValue(arg, '--host=', '--host');
      continue;
    }

    if (arg === '--no-signals') {
      options.signals = false;
      continue;
    }

    if (arg === '--shutdown-timeout') {
      options.shutdownTimeout = parseIntegerFlag(readValue(argv, index, arg), '--shutdown-timeout');
      index += 1;
      continue;
    }
    if (arg.startsWith('--shutdown-timeout=')) {
      options.shutdownTimeout = parseIntegerFlag(
        readInlineValue(arg, '--shutdown-timeout=', '--shutdown-timeout'),
        '--shutdown-timeout',
      );
      continue;
    }

    if (arg === '--require') {
      index = parseRepeatable(argv, index, arg, requireModules);
      continue;
    }
    if (arg.startsWith('--require=')) {
      requireModules.push(...parseCsvFlagValue(readInlineValue(arg, '--require=', '--require'), '--require'));
      continue;
    }

    if (arg === '--env') {
      index = parseRepeatable(argv, index, arg, envFiles);
      continue;
    }
    if (arg.startsWith('--env=')) {
      envFiles.push(...parseCsvFlagValue(readInlineValue(arg, '--env=', '--env'), '--env'));
      continue;
    }

    if (arg === '--tsconfig') {
      tsconfigPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--tsconfig=')) {
      tsconfigPath = readInlineValue(arg, '--tsconfig=', '--tsconfig');
      continue;
    }

    if (arg === '--watch') {
      index = parseRepeatable(argv, index, arg, watchPaths);
      continue;
    }
    if (arg.startsWith('--watch=')) {
      watchPaths.push(...parseCsvFlagValue(readInlineValue(arg, '--watch=', '--watch'), '--watch'));
      continue;
    }

    if (arg === '--ext') {
      watchExt = [];
      index = parseRepeatable(argv, index, arg, watchExt);
      continue;
    }
    if (arg.startsWith('--ext=')) {
      watchExt = [];
      watchExt.push(...parseCsvFlagValue(readInlineValue(arg, '--ext=', '--ext'), '--ext'));
      continue;
    }

    if (arg === '--delay') {
      watchDelay = parseIntegerFlag(readValue(argv, index, arg), '--delay');
      index += 1;
      continue;
    }
    if (arg.startsWith('--delay=')) {
      watchDelay = parseIntegerFlag(readInlineValue(arg, '--delay=', '--delay'), '--delay');
      continue;
    }

    if (!arg.startsWith('--')) {
      appPath = addPositional(arg, appPath, 'App module');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!appPath) {
    printHelp();
    throw new Error('Missing required argument: <app-module>');
  }

  return {
    appPath,
    options,
    tsconfigPath,
    require: requireModules,
    env: envFiles,
    watch: watchPaths,
    watchExt: watchExt ?? DEFAULT_WATCH_EXTENSIONS,
    watchDelay: watchDelay ?? DEFAULT_WATCH_DELAY,
  };
}

function parseStartLikeArgs(argv: string[], subcommandName: 'start' | 'start-serverless'): DevArgs {
  // start/start-serverless share the same option set as dev (port, host,
  // signals, etc.) but reject watch-mode flags.
  for (const arg of optionArgs(argv)) {
    if (
      arg === '--watch' ||
      arg.startsWith('--watch=') ||
      arg === '--tsconfig' ||
      arg.startsWith('--tsconfig=') ||
      arg === '--ext' ||
      arg.startsWith('--ext=') ||
      arg === '--delay' ||
      arg.startsWith('--delay=')
    ) {
      throw new Error(`--watch/--tsconfig/--ext/--delay are not supported with the ${subcommandName} subcommand`);
    }
  }

  return parseDevArgs(argv);
}

function parseStartArgs(argv: string[]): StartArgs {
  const result = parseStartLikeArgs(argv, 'start');
  return {
    appPath: result.appPath,
    options: result.options,
    require: result.require,
    env: result.env,
  };
}

function parseStartServerlessArgs(argv: string[]): StartServerlessArgs {
  let maxBodyBytes: number | undefined;
  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      filtered.push(...argv.slice(i));
      break;
    }
    if (arg === '--max-body-bytes') {
      maxBodyBytes = parseIntegerFlag(readValue(argv, i, arg), '--max-body-bytes');
      validateMaxBodyBytes(maxBodyBytes);
      i += 1;
      continue;
    }
    if (arg.startsWith('--max-body-bytes=')) {
      maxBodyBytes = parseIntegerFlag(
        readInlineValue(arg, '--max-body-bytes=', '--max-body-bytes'),
        '--max-body-bytes',
      );
      validateMaxBodyBytes(maxBodyBytes);
      continue;
    }
    filtered.push(arg);
  }
  const result = parseStartLikeArgs(filtered, 'start-serverless');
  return {
    handlerPath: result.appPath,
    options: result.options,
    maxBodyBytes,
    require: result.require,
    env: result.env,
  };
}

function parseBuildArgs(argv: string[], outNameDefault: string): BuildArgs {
  let appPath: string | undefined;
  const external: string[] = [];
  const result: Omit<BuildArgs, 'appPath'> = {
    initPath: undefined,
    tsconfigPath: undefined,
    outDir: 'dist',
    outName: outNameDefault,
    format: 'cjs',
    target: 'node22',
    external,
    clean: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      for (const positional of argv.slice(index + 1)) {
        appPath = addPositional(positional, appPath, 'App module');
      }
      break;
    }

    if (isHelp(arg) || isVersion(arg)) {
      continue;
    }

    if (arg === '--init') {
      result.initPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--init=')) {
      result.initPath = readInlineValue(arg, '--init=', '--init');
      continue;
    }

    if (arg === '--tsconfig') {
      result.tsconfigPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--tsconfig=')) {
      result.tsconfigPath = readInlineValue(arg, '--tsconfig=', '--tsconfig');
      continue;
    }

    if (arg === '--out-dir') {
      result.outDir = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--out-dir=')) {
      result.outDir = readInlineValue(arg, '--out-dir=', '--out-dir');
      continue;
    }

    if (arg === '--out-name') {
      result.outName = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--out-name=')) {
      result.outName = readInlineValue(arg, '--out-name=', '--out-name');
      continue;
    }

    if (arg === '--format') {
      const fmt = readValue(argv, index, arg);
      if (fmt !== 'cjs' && fmt !== 'esm') {
        throw new Error(`Invalid --format: ${fmt}. Must be 'cjs' or 'esm'.`);
      }
      result.format = fmt;
      index += 1;
      continue;
    }
    if (arg.startsWith('--format=')) {
      const fmt = readInlineValue(arg, '--format=', '--format');
      if (fmt !== 'cjs' && fmt !== 'esm') {
        throw new Error(`Invalid --format: ${fmt}. Must be 'cjs' or 'esm'.`);
      }
      result.format = fmt;
      continue;
    }

    if (arg === '--target') {
      result.target = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--target=')) {
      result.target = readInlineValue(arg, '--target=', '--target');
      continue;
    }

    if (arg === '--external') {
      external.push(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--external=')) {
      external.push(readInlineValue(arg, '--external=', '--external'));
      continue;
    }

    if (arg === '--no-clean') {
      result.clean = false;
      continue;
    }

    if (!arg.startsWith('--')) {
      appPath = addPositional(arg, appPath, 'App module');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!appPath) {
    printHelp();
    throw new Error('Missing required argument: <app-module>');
  }

  return { appPath, ...result };
}

function parseLocalBuildArgs(argv: string[]): BuildArgs {
  return parseBuildArgs(argv, 'app');
}

function parseBuildServerlessArgs(argv: string[]): BuildArgs {
  return parseBuildArgs(argv, 'handler');
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Empty argv → help
  if (argv.length === 0) {
    printHelp();
    return null;
  }

  // Global flags take precedence before standard `--` option termination.
  const globalArgs = optionArgs(argv);
  if (globalArgs.some((a) => isHelp(a))) {
    printHelp();
    return null;
  }
  if (globalArgs.some((a) => isVersion(a))) {
    console.log(CLI_VERSION);
    return null;
  }

  // Determine subcommand (first arg), default to 'dev' for backward compat
  const first = argv[0];
  if (isSubcommand(first)) {
    const rest = argv.slice(1);
    if (first === 'dev') {
      return { subcommand: 'dev', dev: parseDevArgs(rest) };
    }
    if (first === 'build') {
      return { subcommand: 'build', build: parseLocalBuildArgs(rest) };
    }
    if (first === 'start') {
      return { subcommand: 'start', start: parseStartArgs(rest) };
    }
    if (first === 'build-serverless') {
      return { subcommand: 'build-serverless', buildServerless: parseBuildServerlessArgs(rest) };
    }
    return { subcommand: 'start-serverless', startServerless: parseStartServerlessArgs(rest) };
  }

  // Backward compat: no subcommand → dev mode with all args
  return { subcommand: 'dev', dev: parseDevArgs(argv) };
}

// ---------------------------------------------------------------------------
// Export resolution helpers (dev mode)
// ---------------------------------------------------------------------------

/**
 * Type-guard: an Express app is a function with `listen` and `use` methods.
 */
export function isExpressApp(x: unknown): x is Express {
  if (x === null || x === undefined) return false;
  const t = typeof x;
  if (t !== 'object' && t !== 'function') return false;
  return typeof (x as Express).listen === 'function' && typeof (x as Express).use === 'function';
}

/**
 * Extract the primary export from a loaded module: prefer `default`, fall back
 * to a named `app`.
 */
export function extractExport(mod: Record<string, unknown>): unknown {
  return mod.default ?? mod.app;
}

/**
 * Resolve a raw export into an Express app, awaiting an async factory if
 * needed. Throws with a friendly message on incompatible exports.
 */
export async function resolveExport(exported: unknown, appPath: string): Promise<Express> {
  if (isExpressApp(exported)) {
    return exported;
  }
  if (typeof exported === 'function') {
    const result = await (exported as () => Promise<Express> | Express)();
    if (!isExpressApp(result)) {
      throw new Error(`Function in "${appPath}" did not return an Express app.`);
    }
    return result;
  }
  throw new Error(`Default export of "${appPath}" is not an Express app or an async function returning one.`);
}

/**
 * Dynamically import a module and resolve its primary export to an Express app.
 */
export async function loadApp(appPath: string): Promise<Express> {
  const fullPath = pathResolve(process.cwd(), appPath);
  const moduleUrl = pathToFileURL(fullPath).href;
  const mod = (await import(moduleUrl)) as Record<string, unknown>;
  const exported = extractExport(mod);
  if (!exported) {
    throw new Error(
      `Module "${appPath}" must default-export an Express app or an async function returning one. Exports: ${Object.keys(mod).join(', ')}`,
    );
  }
  return resolveExport(exported, appPath);
}

// ---------------------------------------------------------------------------
// Preload helpers (env files + --require modules)
// ---------------------------------------------------------------------------

/**
 * Parse env file content as KEY=VALUE lines. Supports `export` prefix,
 * single/double-quoted values, and `#` comments. Returns parsed entries.
 *
 * Public helper for packages that reuse the CLI's env-file parsing without
 * shelling out to the binary.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Strip optional `export ` prefix
    if (trimmed.startsWith('export ')) trimmed = trimmed.slice('export '.length).trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove surrounding quotes (single or double)
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    result[key] = value;
  }
  return result;
}

/**
 * Load env files into `process.env`. Existing environment variables are
 * **not** overridden (consistent with dotenv's default behavior). Missing
 * files throw with a friendly message.
 *
 * Public helper for programmatic CLI integrations. Mutates `process.env` by
 * design and never overwrites existing environment variables.
 */
export function loadEnvFiles(paths: string[]): void {
  for (const p of paths) {
    const absPath = pathResolve(process.cwd(), p);
    if (!existsSync(absPath)) {
      throw new Error(`Env file not found: ${p}`);
    }
    const content = readFileSync(absPath, 'utf8');
    const parsed = parseEnvFile(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

const moduleRequire: NodeRequire = createRequire(
  pathToFileURL(pathResolve(process.cwd(), '__wtt_runtime_preload__.js')),
);

/**
 * Preload modules (e.g. `tsconfig-paths/register`, `dotenv/config`) before
 * loading the app module. Each module is `require()`-ed, running its
 * side effects (registering hooks, loading configs, etc.).
 *
 * Public helper for programmatic CLI integrations that need the same preload
 * behavior as the binary before loading an app or handler module.
 */
export async function preloadModules(modules: string[]): Promise<void> {
  for (const mod of modules) {
    moduleRequire(mod);
  }
}

// ---------------------------------------------------------------------------
// Watch mode (dev only) — injectable seams for deterministic tests
// ---------------------------------------------------------------------------

/**
 * Dependencies for watch supervision, injectable for tests.
 * Not part of the documented public API; exposed for deterministic testing
 * without expanding the supported consumer contract.
 */
export interface WatchSupervisorDeps {
  fork?: typeof fork;
  watch?: typeof watch;
  existsSync?: typeof existsSync;
  logger?: Pick<Console, 'error'>;
  killTimeoutMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  exit?: (code: number) => void;
  installSignalHandlers?: boolean;
}

/**
 * Controller returned by the injectable supervisor factory.
 * Allows tests to observe and deterministically shut down watchers/children.
 */
export interface WatchSupervisorController {
  /** Stop watching and terminate child, idempotent. */
  shutdown: () => Promise<void>;
  /** Currently tracked child, if any. */
  getChild: () => ChildProcess | null;
  /** Active watchers (FSWatcher handles). */
  getWatchers: () => ReturnType<typeof watch>[];
  /** Whether shutdown has been initiated. */
  isShuttingDown: () => boolean;
}

export const DEFAULT_WATCH_KILL_TIMEOUT_MS = 5_000;

type WatcherHandle = ReturnType<typeof watch>;
type TimerHandle = ReturnType<typeof setTimeout>;

function toDiagnosticMessage(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${message}`;
}

/**
 * Create a watch supervisor with injectable dependencies.
 * This is the test-observable seam; production `runWithWatch` delegates here
 * with real `fork`/`watch`.
 */
export function createWatchSupervisor(args: DevArgs, deps: WatchSupervisorDeps = {}): WatchSupervisorController {
  const forkImpl = deps.fork ?? fork;
  const watchImpl = deps.watch ?? watch;
  const existsSyncImpl = deps.existsSync ?? existsSync;
  const logger = deps.logger ?? console;
  const setTimeoutImpl = deps.setTimeout ?? setTimeout;
  const clearTimeoutImpl = deps.clearTimeout ?? clearTimeout;
  const killTimeoutMs = deps.killTimeoutMs ?? DEFAULT_WATCH_KILL_TIMEOUT_MS;

  const cliPath = process.argv[1];
  const childArgv = buildChildArgs(args);
  let child: ChildProcess | null = null;
  let restartTimer: TimerHandle | null = null;
  let killTimer: TimerHandle | null = null;
  let isShuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;
  let restartInFlight: Promise<void> | null = null;
  let terminatingChild: ChildProcess | null = null;
  let failureHandled = false;
  const restartDelay = args.watchDelay;
  const watchers: WatcherHandle[] = [];

  const clearRestartTimer = (): void => {
    if (restartTimer) {
      clearTimeoutImpl(restartTimer);
      restartTimer = null;
    }
  };

  const clearKillTimer = (): void => {
    if (killTimer) {
      clearTimeoutImpl(killTimer);
      killTimer = null;
    }
  };

  const closeWatchers = (): void => {
    for (const watcher of watchers.splice(0)) {
      try {
        watcher.close();
      } catch (_error) {
        void _error;
      }
    }
  };

  const completeWithExit = async (code: number): Promise<void> => {
    await shutdown();
    deps.exit?.(code);
  };

  const fail = (message: string, code = 1): void => {
    if (failureHandled) return;
    failureHandled = true;
    logger.error(message);
    void completeWithExit(code).catch(() => {
      deps.exit?.(code);
    });
  };

  const spawnChild = (): void => {
    if (isShuttingDown) return;

    let nextChild: ChildProcess;
    try {
      nextChild = forkImpl(cliPath, childArgv, { stdio: 'inherit' });
    } catch (error) {
      fail(toDiagnosticMessage('Watch child failed to spawn', error));
      return;
    }

    child = nextChild;
    nextChild.once('error', (error) => {
      if (child === nextChild) {
        child = null;
      }
      fail(toDiagnosticMessage('Watch child process error', error));
    });
    nextChild.once('exit', (code, signal) => {
      if (child === nextChild) {
        child = null;
      }
      if (terminatingChild === nextChild || isShuttingDown || failureHandled) {
        return;
      }
      const exitCode = typeof code === 'number' && code > 0 ? code : 1;
      fail(`Watch child exited unexpectedly${signal ? ` from ${signal}` : ` with code ${String(code)}`}`, exitCode);
    });
  };

  const killChild = async (target = child): Promise<void> => {
    if (!target || !target.pid) {
      if (target && child === target) child = null;
      return;
    }

    terminatingChild = target;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearKillTimer();
        target.removeListener('exit', onExit);
        target.removeListener('error', onError);
        if (child === target) child = null;
        if (terminatingChild === target) terminatingChild = null;
        if (error) reject(error);
        else resolve();
      };
      const onExit = (): void => settle();
      const onError = (error: Error): void => settle(error);

      target.once('exit', onExit);
      target.once('error', onError);

      try {
        const signaled = target.kill('SIGTERM');
        if (!signaled) {
          throw new Error('child.kill("SIGTERM") returned false');
        }
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (!settled) {
        killTimer = setTimeoutImpl(() => {
          try {
            const signaled = target.kill('SIGKILL');
            if (!signaled) {
              settle(new Error('child.kill("SIGKILL") returned false'));
            }
          } catch (error) {
            settle(error instanceof Error ? error : new Error(String(error)));
          }
        }, killTimeoutMs);
      }
    });
  };

  const restart = async (): Promise<void> => {
    if (isShuttingDown) return;
    if (restartInFlight) {
      await restartInFlight;
      return;
    }

    restartInFlight = (async () => {
      if (isShuttingDown) return;
      await killChild();
      if (isShuttingDown) return;
      spawnChild();
    })();

    try {
      await restartInFlight;
    } finally {
      restartInFlight = null;
    }
  };

  const debouncedRestart = (): void => {
    if (isShuttingDown) return;
    clearRestartTimer();
    restartTimer = setTimeoutImpl(() => {
      restartTimer = null;
      void restart().catch((error) => {
        fail(toDiagnosticMessage('Watch restart failed', error));
      });
    }, restartDelay);
  };

  // Validate all paths before opening any watcher (prevents leaking watchers on partial failure)
  for (const watchPath of args.watch) {
    const absPath = pathResolve(process.cwd(), watchPath);
    if (!existsSyncImpl(absPath)) {
      throw new Error(`Watch path not found: ${watchPath}`);
    }
  }

  const shutdown = async (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    isShuttingDown = true;
    clearRestartTimer();
    closeWatchers();
    shutdownPromise = (async () => {
      const activeRestart = restartInFlight;
      if (activeRestart) {
        await activeRestart.catch(() => undefined);
      }
      const activeChild = child;
      if (activeChild) {
        await killChild(activeChild).catch((error) => {
          if (!failureHandled) {
            fail(toDiagnosticMessage('Watch child termination failed', error));
          }
        });
      }
    })();
    return shutdownPromise;
  };

  try {
    // Open watchers after validation; roll back every opened watcher on setup failure.
    for (const watchPath of args.watch) {
      const absPath = pathResolve(process.cwd(), watchPath);
      const watcher = watchImpl(absPath, { recursive: true }, (_eventType, filename) => {
        if (isShuttingDown) return;
        if (!filename) return;
        const ext = extname(filename as string)
          .slice(1)
          .toLowerCase();
        if (args.watchExt.includes(ext)) {
          debouncedRestart();
        }
      });
      (watcher as unknown as { on?: (event: 'error', listener: (error: Error) => void) => void }).on?.(
        'error',
        (error) => {
          fail(toDiagnosticMessage('Watch path runtime error', error));
        },
      );
      watchers.push(watcher);
    }

    spawnChild();
  } catch (error) {
    clearRestartTimer();
    closeWatchers();
    if (child) {
      void killChild(child).catch(() => undefined);
    }
    throw error;
  }

  return {
    shutdown,
    getChild: () => child,
    getWatchers: () => [...watchers],
    isShuttingDown: () => isShuttingDown,
  };
}

/**
 * Reconstruct the argv for the child process, stripping --watch/--ext/--delay
 * flags (the child runs without watch mode).
 *
 * Public helper for CLI wrappers that supervise watch mode themselves and need
 * the same child argv reconstruction as `runWithWatch`.
 */
export function buildChildArgs(args: DevArgs): string[] {
  const result: string[] = ['dev', args.appPath];
  if (args.options.port !== undefined) result.push('--port', String(args.options.port));
  if (args.options.host !== undefined) result.push('--host', args.options.host);
  if (args.options.signals === false) result.push('--no-signals');
  if (args.options.shutdownTimeout !== undefined)
    result.push('--shutdown-timeout', String(args.options.shutdownTimeout));
  if (args.tsconfigPath !== undefined) result.push('--tsconfig', args.tsconfigPath);
  for (const r of args.require) result.push('--require', r);
  for (const e of args.env) result.push('--env', e);
  return result;
}

/**
 * Run the CLI in watch mode. Forks a child process running the same CLI
 * without --watch, watches the specified paths for file changes, and
 * restarts the child (SIGTERM, then SIGKILL after 5 seconds) on changes
 * matching the given extensions. Uses Node 20+'s `fs.watch` with
 * `{ recursive: true }`.
 *
 * Production entry point that delegates to `createWatchSupervisor` with real
 * dependencies and installs signal handlers that exit the process.
 */
export function runWithWatch(args: DevArgs, deps: WatchSupervisorDeps = {}): WatchSupervisorController {
  const usingInjectedDeps = Object.keys(deps).length > 0;
  const installSignalHandlers = deps.installSignalHandlers ?? !usingInjectedDeps;
  const exitImpl = deps.exit ?? (usingInjectedDeps ? undefined : (code: number) => process.exit(code));
  const controller = createWatchSupervisor(args, {
    ...deps,
    exit: exitImpl,
  });
  let shutdownStarted = false;
  const ownedHandlers: Array<[NodeJS.Signals, () => void]> = [];
  const removeOwnedHandlers = (): void => {
    for (const [signal, handler] of ownedHandlers.splice(0)) {
      process.removeListener(signal, handler);
    }
  };
  const shutdown = async (): Promise<void> => {
    removeOwnedHandlers();
    await controller.shutdown();
  };
  const wrappedController: WatchSupervisorController = {
    shutdown,
    getChild: controller.getChild,
    getWatchers: controller.getWatchers,
    isShuttingDown: controller.isShuttingDown,
  };

  // In injected test mode, caller manages shutdown unless it explicitly opts in
  // to signal handlers. In production, exit after child terminates.
  if (installSignalHandlers) {
    const shutdownAndExit = (): void => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      void shutdown().then(() => exitImpl?.(0));
    };
    ownedHandlers.push(['SIGINT', shutdownAndExit], ['SIGTERM', shutdownAndExit]);
    process.on('SIGINT', shutdownAndExit);
    process.on('SIGTERM', shutdownAndExit);
  }

  return wrappedController;
}

// ---------------------------------------------------------------------------
// build / build-serverless
// ---------------------------------------------------------------------------

/** Legacy fixed staging filenames — no longer written, but retained for regression tests that verify they are not overwritten. */
export const TEMP_BUILD_ENTRY_FILENAME = '.express-runtime-build-entry.ts';
export const TEMP_SERVERLESS_ENTRY_FILENAME = '.express-runtime-build-serverless-entry.ts';
const STAGING_DIR_PREFIX = '.wtt-build-';

export type RuntimeModuleInit = () => Promise<void> | void;

/**
 * Generate the temporary entry file content that wires the user's app and
 * optional init hook into a serverless handler.
 *
 * Public build-entry generator used by programmatic CLI integrations.
 */
export function generateServerlessEntry(appPath: string, initPath?: string): string {
  const absAppPath = pathResolve(process.cwd(), appPath);
  const absInitPath = initPath ? pathResolve(process.cwd(), initPath) : undefined;

  const lines: string[] = [
    '// Auto-generated by @web-ts-toolkit/express-runtime CLI — do not edit.',
    `import { createServerlessHandler } from '@web-ts-toolkit/express-runtime';`,
    `import app from ${JSON.stringify(absAppPath)};`,
  ];

  if (absInitPath) {
    lines.push(`import init from ${JSON.stringify(absInitPath)};`);
    lines.push(`const handler = createServerlessHandler(app, { init });`);
  } else {
    lines.push(`const handler = createServerlessHandler(app);`);
  }

  lines.push(`export { handler };`);
  return lines.join('\n') + '\n';
}

/**
 * Generate the temporary entry file content that wires the user's app and
 * optional init hook into a local runtime bundle.
 *
 * Public build-entry generator used by programmatic CLI integrations.
 */
export function generateRuntimeEntry(appPath: string, initPath?: string): string {
  const absAppPath = pathResolve(process.cwd(), appPath);
  const absInitPath = initPath ? pathResolve(process.cwd(), initPath) : undefined;

  const lines: string[] = [
    '// Auto-generated by @web-ts-toolkit/express-runtime CLI — do not edit.',
    `import app from ${JSON.stringify(absAppPath)};`,
    'export default app;',
    'export { app };',
  ];

  if (absInitPath) {
    lines.push(`export { default as init } from ${JSON.stringify(absInitPath)};`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Validate that `outDir` is safe to clean before invoking tsup.
 * Prevents destructive `clean: true` combinations:
 *  - filesystem root
 *  - project cwd itself (repository root)
 *  - symlinked output directories
 *  - output that contains input files (appPath/initPath)
 *
 * Public safety check for programmatic build integrations before invoking
 * `buildBundleFromEntryContent()` with `clean: true`.
 */
export function validateOutDirForClean(outDir: string, clean: boolean, appPath?: string, initPath?: string): void {
  if (!clean) return;
  const cwd = process.cwd();
  const outAbs = pathResolve(cwd, outDir);
  const normalized = pathNormalize(outAbs);
  const root = pathParse(normalized).root;
  if (normalized === root) {
    throw new Error(`Refusing to clean filesystem root: ${outDir} resolves to ${normalized}`);
  }
  if (normalized === pathNormalize(cwd)) {
    throw new Error(`Refusing to clean project directory: ${outDir} resolves to cwd ${cwd}`);
  }
  // Forbid cleaning an ancestor of cwd (e.g. outDir = ".." cleaning parent)
  if (cwd !== root && (cwd === normalized || cwd.startsWith(normalized + pathSep))) {
    throw new Error(
      `Refusing to clean ancestor of project directory: ${outDir} resolves to ${normalized} which contains cwd ${cwd}`,
    );
  }
  // Symlinked output directory
  try {
    if (existsSync(outAbs)) {
      const st = lstatSync(outAbs);
      if (st.isSymbolicLink()) {
        throw new Error(`Refusing to clean symlinked outDir: ${outDir} resolves to symlink ${outAbs}`);
      }
      // Also check realpath differs dangerously (e.g. symlink inside)
      // We already rejected direct symlink; realpath check for nested symlink is best-effort
    }
  } catch (e) {
    if ((e as Error).message.startsWith('Refusing to clean')) throw e;
    // otherwise ignore lstat errors (file may not exist yet)
  }
  // Input overlap: appPath or initPath inside outDir
  const checkOverlap = (inputPath: string | undefined, label: string) => {
    if (!inputPath) return;
    const inputAbs = pathResolve(cwd, inputPath);
    const inputNorm = pathNormalize(inputAbs);
    if (inputNorm === normalized) {
      throw new Error(`Refusing to clean outDir that is the same as ${label}: ${outDir} == ${inputPath}`);
    }
    if (inputNorm.startsWith(normalized + pathSep)) {
      throw new Error(`Refusing to clean outDir that contains ${label}: ${outDir} contains ${inputPath}`);
    }
  };
  checkOverlap(appPath, 'appPath');
  checkOverlap(initPath, 'initPath');
}

function createUniqueStagingDir(): string {
  const cwd = process.cwd();
  const prefix = pathJoin(cwd, STAGING_DIR_PREFIX);
  const dir = mkdtempSync(prefix);
  // Ensure private permissions and not a symlink
  try {
    const st = lstatSync(dir);
    if (st.isSymbolicLink()) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`Staging directory is a symlink: ${dir}`);
    }
  } catch (e) {
    if ((e as Error).message.includes('Staging directory is a symlink')) throw e;
    // lstat failure is unexpected but rethrow
    throw e;
  }
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best effort on non-POSIX
  }
  return dir;
}

function writeStagingEntry(dir: string, content: string): string {
  const entryPath = pathJoin(dir, 'entry.ts');
  // Defensive: ensure entryPath is not a symlink and doesn't exist
  try {
    if (existsSync(entryPath)) {
      const st = lstatSync(entryPath);
      if (st.isSymbolicLink()) {
        throw new Error(`Refusing to overwrite symlink at staging path: ${entryPath}`);
      }
      throw new Error(`Staging file already exists: ${entryPath}`);
    }
  } catch (e) {
    if (
      (e as Error).message.startsWith('Refusing to') ||
      (e as Error).message.startsWith('Staging file already exists')
    )
      throw e;
    // existsSync false or lstat failure for non-existent is fine
  }
  // Exclusive creation (wx), private perms 0600
  writeFileSync(entryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  // Verify not symlink after write
  try {
    const st = lstatSync(entryPath);
    if (st.isSymbolicLink()) {
      rmSync(entryPath, { force: true });
      throw new Error(`Staging file is a symlink after write: ${entryPath}`);
    }
  } catch (e) {
    if ((e as Error).message.includes('Staging file is a symlink')) throw e;
  }
  return entryPath;
}

export async function buildBundleFromEntryContent(args: BuildEntryContentArgs): Promise<void> {
  // Validate outDir early when clean is true; without appPath we only check root/cwd/symlink
  validateOutDirForClean(args.outDir, args.clean);
  const tsupModule: typeof import('tsup') = await import('tsup');
  const { build } = tsupModule;
  const stagingDir = createUniqueStagingDir();
  const tempEntryPath = writeStagingEntry(stagingDir, args.entryContent);
  const absOutDir = pathResolve(process.cwd(), args.outDir);

  try {
    await build({
      config: false,
      entry: { [args.outName]: tempEntryPath },
      tsconfig: args.tsconfigPath,
      format: [args.format],
      target: args.target,
      outDir: absOutDir,
      clean: args.clean,
      external: ['express', '@web-ts-toolkit/express-runtime', ...args.external],
      sourcemap: false,
      dts: false,
      splitting: false,
    });
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

/**
 * Bundle an Express app as a local runtime module. The output default-exports
 * the app and may additionally export an `init` hook for the `start` command.
 */
export async function buildRuntime(args: BuildArgs): Promise<void> {
  const { runBuildEntryCommand } = await import('./cli-api');
  await runBuildEntryCommand(args, {
    generateEntry: generateRuntimeEntry,
  });
}

/**
 * Bundle an Express app as a serverless handler. Writes a temporary entry file
 * to the user's cwd (for node_modules resolution), lazy-loads the bundled
 * build tool, then cleans up.
 *
 * `express` is always external; additional externals can be passed via
 * `BuildArgs.external`.
 */
export async function buildServerless(args: BuildArgs): Promise<void> {
  const { runBuildEntryCommand } = await import('./cli-api');
  await runBuildEntryCommand(args, {
    generateEntry: generateServerlessEntry,
  });
}

// ---------------------------------------------------------------------------
// start-serverless adapter helpers
// ---------------------------------------------------------------------------

/**
 * A platform-agnostic serverless handler function (the output of
 * `build-serverless`).
 */
export type GenericHandler = (event: unknown, context: unknown) => Promise<unknown>;

/** AWS API Gateway REST API v1 / Lambda proxy event shape emitted by the local adapter. */
export interface ApiGatewayRestEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
  queryStringParameters: Record<string, string> | null;
  multiValueQueryStringParameters: Record<string, string[]> | null;
  body: string;
  isBase64Encoded: boolean;
  requestContext: {
    identity: {
      sourceIp: string;
    };
  };
}

/**
 * AWS API Gateway REST API v1 / Lambda proxy result shape returned by `serverless-http`.
 */
export interface ServerlessResult {
  statusCode?: number;
  headers?: Record<string, string | undefined>;
  multiValueHeaders?: Record<string, string[] | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

export const DEFAULT_ADAPTER_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB conservative default

export interface ServerlessAdapterOptions {
  /**
   * Maximum bytes to buffer for a single request body.
   * Default: 1048576 (1 MiB). Must be a finite non-negative integer.
   * When `0`, no body is allowed — any non-empty body receives `413`.
   * The adapter never retains more than this limit plus at most one incoming chunk.
   */
  maxBodyBytes?: number;
}

/**
 * Validate `maxBodyBytes` — finite non-negative integer. Zero means no body allowed (empty bodies only).
 * Public validator shared by CLI parsing and programmatic adapter callers.
 */
export function validateMaxBodyBytes(value: unknown): number {
  try {
    return validateFiniteInteger(value, { name: '--max-body-bytes', min: 0, max: MAX_INTEGER_OPTION_VALUE });
  } catch (_error) {
    void _error;
    throw new Error(
      `Invalid --max-body-bytes: ${String(value)}. Must be a finite integer in 0..${MAX_INTEGER_OPTION_VALUE}. Use 0 to disallow bodies (empty bodies only).`,
      { cause: _error },
    );
  }
}

/**
 * Read the raw request body into a Buffer with bounded memory.
 * Since `createExpressApp` is called with `json: false, urlencoded: false` in the adapter,
 * no body parser has consumed the stream yet. Rejects oversized declared or incremental
 * bodies with a `LIMIT_EXCEEDED` error (413), stops retaining chunks after the limit,
 * removes owned listeners, and drains the request.
 * Distinguishes client aborts (`CLIENT_ABORT`) and stream errors from oversize.
 */
export function collectBody(req: Request, maxBytes: number): Promise<Buffer> {
  validateMaxBodyBytes(maxBytes);
  return new Promise((resolve, reject) => {
    const rawLength = req.headers['content-length'] as string | string[] | undefined;
    if (rawLength !== undefined) {
      const raw = Array.isArray(rawLength) ? rawLength[0] : rawLength;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0) {
        if (parsed > maxBytes) {
          try {
            (req as unknown as { resume?: () => void }).resume?.();
          } catch (_e) {
            void _e;
          }
          const err: Error & { code?: string; statusCode?: number } = new Error(
            `Request body too large: Content-Length ${parsed} exceeds limit ${maxBytes}`,
          );
          err.code = 'LIMIT_EXCEEDED';
          err.statusCode = 413;
          reject(err);
          return;
        }
      }
    }

    const chunks: Buffer[] = [];
    let total = 0;
    let finished = false;

    const cleanup = (): void => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('close', onClose);
      try {
        (req as unknown as { removeListener?: (...args: unknown[]) => void }).removeListener?.(
          'aborted' as unknown as string,
          onClose as unknown as (...args: unknown[]) => void,
        );
      } catch (_e) {
        void _e;
      }
    };

    const fail = (err: Error & { code?: string; statusCode?: number }): void => {
      if (finished) return;
      finished = true;
      cleanup();
      if (err.code === 'LIMIT_EXCEEDED') {
        try {
          (req as unknown as { resume?: () => void }).resume?.();
        } catch (_e) {
          void _e;
        }
      }
      reject(err);
    };

    const onData = (chunk: Buffer): void => {
      if (finished) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as string);
      total += buf.length;
      if (total > maxBytes) {
        const err: Error & { code?: string; statusCode?: number } = new Error(
          `Request body too large: received ${total} bytes exceeds limit ${maxBytes}`,
        );
        err.code = 'LIMIT_EXCEEDED';
        err.statusCode = 413;
        fail(err);
        return;
      }
      chunks.push(buf);
    };

    const onEnd = (): void => {
      if (finished) return;
      finished = true;
      cleanup();
      try {
        resolve(Buffer.concat(chunks, total));
      } catch (e) {
        fail(e as Error);
      }
    };

    const onError = (err: Error): void => {
      const e = err as Error & { code?: string };
      if (!e.code) e.code = 'STREAM_ERROR';
      fail(e);
    };

    const onClose = (): void => {
      if (finished) return;
      const e: Error & { code?: string } = new Error('Request aborted by client');
      e.code = 'CLIENT_ABORT';
      fail(e);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
    try {
      (req as unknown as { on?: (...args: unknown[]) => void }).on?.('aborted', onClose);
    } catch (_e) {
      void _e;
    }
  });
}

/**
 * Build an AWS API Gateway REST API v1 / Lambda proxy event from HTTP request components.
 *
 * Public helper for adapters that need the same AWS REST API v1 event shape as
 * the `start-serverless` command.
 */
export function toServerlessEvent(
  method: string,
  url: string,
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
): ApiGatewayRestEvent {
  const parsedUrl = new URL(url, 'http://localhost');
  const { queryStringParameters, multiValueQueryStringParameters } = parseAwsRestQuery(parsedUrl.search);
  const { singleValueHeaders, multiValueHeaders } = normalizeAwsRestHeaders(headers);

  return {
    httpMethod: method,
    path: parsedUrl.pathname,
    headers: singleValueHeaders,
    multiValueHeaders,
    queryStringParameters,
    multiValueQueryStringParameters,
    body: body.length > 0 ? body.toString('base64') : '',
    isBase64Encoded: body.length > 0,
    requestContext: {
      identity: {
        // Minimal field required by serverless-http's AWS v1 request adapter.
        sourceIp: '',
      },
    },
  };
}

function parseAwsRestQuery(
  search: string,
): Pick<ApiGatewayRestEvent, 'queryStringParameters' | 'multiValueQueryStringParameters'> {
  if (search === '' || search === '?') {
    return { queryStringParameters: null, multiValueQueryStringParameters: null };
  }

  const single: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
  const query = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? '' : pair.slice(separator + 1);
    const key = decodeQueryComponent(rawKey);
    const value = decodeQueryComponent(rawValue);
    single[key] = value;
    (multi[key] ??= []).push(value);
  }

  return {
    queryStringParameters: Object.keys(single).length > 0 ? single : null,
    multiValueQueryStringParameters: Object.keys(multi).length > 0 ? multi : null,
  };
}

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    void _error;
    return value;
  }
}

function normalizeAwsRestHeaders(headers: Record<string, string | string[] | undefined>): {
  singleValueHeaders: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
} {
  const singleValueHeaders: Record<string, string> = {};
  const multiValueHeaders: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value.map(String) : [String(value)];
    multiValueHeaders[key] = values;
    singleValueHeaders[key] = values.join(', ');
  }

  return { singleValueHeaders, multiValueHeaders };
}

/**
 * Write a serverless handler result to an Express response.
 * Validates the complete AWS API Gateway REST API v1 / Lambda proxy result before writing anything.
 * `multiValueHeaders` wins over `headers` when the same header appears in both maps.
 *
 * Public helper for adapters that need the same AWS REST API v1 result-to-HTTP
 * translation as the `start-serverless` command.
 */
export function applyServerlessResult(result: unknown, res: Response): void {
  const response = validateServerlessResult(result);

  res.status(response.statusCode);

  for (const [key, value] of Object.entries(response.headers)) {
    res.setHeader(key, value);
  }
  for (const [key, values] of Object.entries(response.multiValueHeaders)) {
    if (key.toLowerCase() === 'set-cookie') {
      res.setHeader(key, values);
    } else {
      res.setHeader(key, values.join(','));
    }
  }

  if (response.isBase64Encoded) {
    res.end(response.decodedBody);
  } else {
    res.end(response.body);
  }
}

interface ValidatedServerlessResult {
  statusCode: number;
  headers: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
  body: string;
  decodedBody?: Buffer;
  isBase64Encoded: boolean;
}

function validateServerlessResult(result: unknown): ValidatedServerlessResult {
  if (!isPlainRecord(result)) {
    throw new Error(
      'Invalid serverless result: expected an object with an optional statusCode, headers, multiValueHeaders, body, and isBase64Encoded.',
    );
  }

  const rawStatus = result.statusCode;
  if (
    rawStatus !== undefined &&
    (typeof rawStatus !== 'number' || !Number.isInteger(rawStatus) || rawStatus < 100 || rawStatus > 599)
  ) {
    throw new Error(`Invalid serverless result statusCode: ${String(rawStatus)}. Expected an integer in 100..599.`);
  }

  const rawIsBase64Encoded = result.isBase64Encoded;
  if (rawIsBase64Encoded !== undefined && typeof rawIsBase64Encoded !== 'boolean') {
    throw new Error('Invalid serverless result isBase64Encoded: expected a boolean when provided.');
  }

  const rawBody = result.body;
  if (rawBody !== undefined && typeof rawBody !== 'string') {
    throw new Error(`Invalid serverless result body: expected a string when provided, received ${typeof rawBody}.`);
  }

  const headers = validateSingleValueHeaders(result.headers, 'headers');
  const multiValueHeaders = validateMultiValueHeaders(result.multiValueHeaders, 'multiValueHeaders');
  const multiHeaderKeys = new Set(Object.keys(multiValueHeaders).map((key) => key.toLowerCase()));
  for (const key of Object.keys(headers)) {
    if (multiHeaderKeys.has(key.toLowerCase())) {
      delete headers[key];
    }
  }

  const isBase64Encoded = rawIsBase64Encoded ?? false;
  const body = rawBody ?? '';
  let decodedBody: Buffer | undefined;
  if (isBase64Encoded) {
    if (!isValidBase64(body)) {
      throw new Error('Invalid serverless result body: isBase64Encoded is true but body is not valid standard base64.');
    }
    decodedBody = Buffer.from(body, 'base64');
  }

  return {
    statusCode: rawStatus ?? 200,
    headers,
    multiValueHeaders,
    body,
    decodedBody,
    isBase64Encoded,
  };
}

function validateSingleValueHeaders(value: unknown, name: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) {
    throw new Error(`Invalid serverless result ${name}: expected an object of string header values.`);
  }

  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined) continue;
    if (typeof headerValue !== 'string') {
      throw new Error(`Invalid serverless result ${name}.${key}: expected a string header value.`);
    }
    validateServerlessHeader(key, headerValue, `${name}.${key}`);
    headers[key] = headerValue;
  }
  return headers;
}

function validateMultiValueHeaders(value: unknown, name: string): Record<string, string[]> {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) {
    throw new Error(`Invalid serverless result ${name}: expected an object of string-array header values.`);
  }

  const headers: Record<string, string[]> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined) continue;
    if (!Array.isArray(headerValue) || headerValue.some((entry) => typeof entry !== 'string')) {
      throw new Error(`Invalid serverless result ${name}.${key}: expected an array of string header values.`);
    }
    for (const entry of headerValue) {
      validateServerlessHeader(key, entry, `${name}.${key}`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

function validateServerlessHeader(key: string, value: string, label: string): void {
  try {
    validateHeaderName(key);
    validateHeaderValue(key, value);
  } catch (error) {
    throw new Error(`Invalid serverless result header ${label}: ${(error as Error).message}`, { cause: error });
  }
}

function isValidBase64(value: string): boolean {
  if (value === '') return true;
  if (value.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Create an Express app that proxies all requests to a serverless handler.
 * Each HTTP request is translated into a serverless event, the handler is
 * invoked, and the result is written back to the response.
 *
 * Express body parsers are disabled; the raw request body is read directly
 * from the stream and passed as a Buffer (so the serverless handler's request
 * hook — including the #305 workaround — works identically to production).
 * Bodies exceeding `maxBodyBytes` (default 1 MiB, 0 = empty bodies only) receive
 * `413 Payload Too Large` without invoking the handler; the request is drained
 * and retained memory is bounded to the limit plus at most one chunk.
 */
export function createServerlessAdapterApp(handler: GenericHandler, options: ServerlessAdapterOptions = {}): Express {
  const maxBytes = options.maxBodyBytes ?? DEFAULT_ADAPTER_MAX_BODY_BYTES;
  validateMaxBodyBytes(maxBytes);
  return createExpressApp({
    json: false,
    urlencoded: false,
    finalize: (app) => {
      // Use middleware (not app.all) to catch all routes — Express 5's
      // path-to-regexp rejects the '*' wildcard.
      app.use(async (req: Request, res: Response) => {
        let body: Buffer;
        try {
          body = await collectBody(req, maxBytes);
        } catch (err: unknown) {
          const e = err as Error & { code?: string; statusCode?: number };
          if (e?.code === 'LIMIT_EXCEEDED' || e?.statusCode === 413) {
            if (!res.headersSent && !res.writableEnded) {
              res.status(413).end('Payload Too Large');
            } else {
              try {
                res.end();
              } catch (_e) {
                void _e;
              }
            }
            return;
          }
          if (e?.code === 'CLIENT_ABORT') {
            return;
          }
          console.error('Serverless adapter error:', e);
          if (!res.headersSent && !res.writableEnded) {
            res.status(500).end('Internal server error');
          } else {
            try {
              res.end();
            } catch (_e) {
              void _e;
            }
          }
          return;
        }
        let result: unknown;
        try {
          const event = toServerlessEvent(req.method, req.url, req.headers, body);
          result = await handler(event, {});
        } catch (e) {
          console.error('Serverless adapter error:', e);
          if (!res.headersSent && !res.writableEnded) res.status(500).end('Internal server error');
          return;
        }
        try {
          applyServerlessResult(result, res);
        } catch (e) {
          console.error('Invalid serverless handler result:', e);
          if (!res.headersSent && !res.writableEnded) res.status(500).end('Internal server error');
        }
      });
    },
    errorHandler: (error: unknown, _req: Request, res: Response, _next: unknown) => {
      console.error('Serverless adapter error:', error);
      res.status(500).end('Internal server error');
    },
  });
}

/**
 * Load a bundled app module from the `build` output.
 */
export async function loadBuiltApp(appPath: string): Promise<{ app: Express; init?: RuntimeModuleInit }> {
  const fullPath = pathResolve(process.cwd(), appPath);
  const moduleUrl = pathToFileURL(fullPath).href;
  const mod = (await import(moduleUrl)) as Record<string, unknown>;
  const exported = extractExport(mod);
  if (!exported) {
    throw new Error(
      `Module "${appPath}" must default-export an Express app or export it as "app". Exports: ${Object.keys(mod).join(', ')}`,
    );
  }

  const init = mod.init;
  if (init !== undefined && typeof init !== 'function') {
    throw new Error(`Module "${appPath}" must export "init" as a function when present.`);
  }

  return {
    app: await resolveExport(exported, appPath),
    init: init as RuntimeModuleInit | undefined,
  };
}

/**
 * Load a bundled serverless handler from a JS/CJS module. The module must
 * export a `handler` function (or use `default` export).
 */
export async function loadHandler(handlerPath: string): Promise<GenericHandler> {
  const fullPath = pathResolve(process.cwd(), handlerPath);
  const moduleUrl = pathToFileURL(fullPath).href;
  const mod = (await import(moduleUrl)) as Record<string, unknown>;
  const exported = mod.handler ?? mod.default;
  if (typeof exported !== 'function') {
    throw new Error(
      `Module "${handlerPath}" must export a "handler" function. Exports: ${Object.keys(mod).join(', ')}`,
    );
  }
  return exported as GenericHandler;
}
