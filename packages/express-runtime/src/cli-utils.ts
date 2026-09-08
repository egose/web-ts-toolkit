import { pathToFileURL } from 'node:url';
import {
  dirname,
  basename,
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
import {
  MAX_INTEGER_OPTION_VALUE,
  MAX_TIMER_DURATION_MS,
  parsePortValue,
  validateFiniteInteger,
  validateTimerDuration,
} from './numeric-validation';

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

function parseTimerFlag(raw: string, name: string): number {
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`Invalid ${name}: ${raw}. Must be a finite integer in 0..${MAX_TIMER_DURATION_MS}.`);
  }
  return validateTimerDuration(Number(raw), name);
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
  /** Debounce delay (ms) before restarting on file change (default: 500). Must be a finite integer in `0..2147483647` (Node timer limit); `0` restarts without debouncing. */
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
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000; 0..2147483647)
  --require <module>            Module(s) to preload before app load (repeatable)
  --env <path>                  Env file(s) to load (repeatable; existing env vars are not overridden)
  --tsconfig <path>             Tsconfig used by config-aware consumers for TS path resolution
  --watch <paths>               Comma-separated paths to watch for restart (repeatable; dev only)
  --ext <extensions>            Comma-separated extensions to watch (default: ts,js,mjs,cjs,json)
  --delay <ms>                  Debounce ms before restarting on change (default: 500; 0..2147483647)

Build options:
  --init <path>                 Init hook module (default export, async function)
  --tsconfig <path>             Use a custom tsconfig for bundling
  --out-dir <path>              Output directory (default: dist)
  --out-name <name>             Output filename without extension (default: app)
  --format <cjs|esm>            Output format (default: cjs)
  --target <target>             Compilation target (default: node22)
  --external <pkg>              Mark package as external (repeatable; express and @web-ts-toolkit/express-runtime always external)
  --no-clean                    Don't clean the output directory before building

Start options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000; 0..2147483647)
  --require <module>            Module(s) to preload before app load (repeatable)
  --env <path>                  Env file(s) to load (repeatable; existing env vars are not overridden)

Build-serverless options:
  --init <path>                 Init hook module (default export, async function)
  --tsconfig <path>             Use a custom tsconfig for bundling
  --out-dir <path>              Output directory (default: dist)
  --out-name <name>             Output filename without extension (default: handler)
  --format <cjs|esm>            Output format (default: cjs)
  --target <target>             Compilation target (default: node22)
  --external <pkg>              Mark package as external (repeatable; express and @web-ts-toolkit/express-runtime always external)
  --no-clean                    Don't clean the output directory before building

Start-serverless options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000; 0..2147483647)
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
  - In build/build-serverless mode, express and @web-ts-toolkit/express-runtime are always external. Add more externals with --external.
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

function setTsconfigPath(current: string | undefined, next: string): string {
  if (current !== undefined && current !== next) {
    throw new Error(`Conflicting --tsconfig values: ${current} and ${next}`);
  }
  return next;
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
      options.shutdownTimeout = parseTimerFlag(readValue(argv, index, arg), '--shutdown-timeout');
      index += 1;
      continue;
    }
    if (arg.startsWith('--shutdown-timeout=')) {
      options.shutdownTimeout = parseTimerFlag(
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
      tsconfigPath = setTsconfigPath(tsconfigPath, readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--tsconfig=')) {
      tsconfigPath = setTsconfigPath(tsconfigPath, readInlineValue(arg, '--tsconfig=', '--tsconfig'));
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
      watchDelay = parseTimerFlag(readValue(argv, index, arg), '--delay');
      index += 1;
      continue;
    }
    if (arg.startsWith('--delay=')) {
      watchDelay = parseTimerFlag(readInlineValue(arg, '--delay=', '--delay'), '--delay');
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
      result.tsconfigPath = setTsconfigPath(result.tsconfigPath, readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--tsconfig=')) {
      result.tsconfigPath = setTsconfigPath(result.tsconfigPath, readInlineValue(arg, '--tsconfig=', '--tsconfig'));
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

/**
 * Preload modules (e.g. `tsconfig-paths/register`, `dotenv/config`) before
 * loading the app module. Each module is `require()`-ed, running its
 * side effects (registering hooks, loading configs, etc.).
 *
 * Resolution uses the current working directory captured when preloading
 * starts, so programmatic consumers that change cwd between invocations
 * resolve relative preloads (and bare dependencies) against the current
 * invocation — consistent with call-time `loadEnvFiles`/`loadApp` — rather
 * than the directory that was current when this module was first evaluated.
 * Preloads run sequentially in list order. No sandbox is applied.
 *
 * Public helper for programmatic CLI integrations that need the same preload
 * behavior as the binary before loading an app or handler module.
 */
export async function preloadModules(modules: string[]): Promise<void> {
  const invocationRequire: NodeRequire = createRequire(
    pathToFileURL(pathResolve(process.cwd(), '__wtt_runtime_preload__.js')),
  );
  for (const mod of modules) {
    invocationRequire(mod);
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
  /** Ms before SIGTERM escalates to SIGKILL. Must be a finite integer in `0..2147483647` (Node timer limit). */
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
 * True when the child process is confirmed gone (exited or never spawned).
 * A live child retains a pid with no exit/signal code yet. Fake/legacy
 * handles without exitCode fields fall back to the pid check so live-child
 * `error` events and failed kills do not silently drop ownership.
 */
function isChildGone(proc: ChildProcess): boolean {
  const exitCode = (proc as unknown as { exitCode?: number | null }).exitCode;
  const signalCode = (proc as unknown as { signalCode?: NodeJS.Signals | null }).signalCode;
  if (exitCode != null || signalCode != null) return true;
  return proc.pid === undefined;
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
  // Reject overflowing timer durations before creating watchers, children, or
  // timers: Node would otherwise clamp them with a TimeoutOverflowWarning
  // (e.g. 2147483648 becomes 1 ms) and restart/terminate near-immediately.
  validateTimerDuration(args.watchDelay, '--delay');
  validateTimerDuration(killTimeoutMs, 'killTimeoutMs');
  if (args.options.shutdownTimeout !== undefined) {
    validateTimerDuration(args.options.shutdownTimeout, '--shutdown-timeout');
  }

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
      // Distinguish spawn failure (confirmed gone, no pid/exit) from errors on
      // a live child. A live child keeps ownership so shutdown can terminate
      // it; only a confirmed-gone process releases ownership here.
      if (isChildGone(nextChild) && child === nextChild) {
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
        if (error) {
          // Failed kill: retain ownership of a live child so shutdown/restarts
          // can retry and diagnostics do not pretend success. Clear only the
          // termination intent; keep `child` unless absence is confirmed.
          if (terminatingChild === target) terminatingChild = null;
          if (child === target && isChildGone(target)) child = null;
          reject(error);
        } else {
          if (child === target) child = null;
          if (terminatingChild === target) terminatingChild = null;
          resolve();
        }
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
      const watchListener = (_eventType: string, filename: string | Buffer | null): void => {
        if (isShuttingDown) return;
        if (!filename) return;
        const ext = extname(filename as string)
          .slice(1)
          .toLowerCase();
        if (args.watchExt.includes(ext)) {
          debouncedRestart();
        }
      };
      let watcher: WatcherHandle;
      try {
        watcher = watchImpl(absPath, { recursive: true }, watchListener);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
          throw error;
        }
        watcher = watchImpl(absPath, watchListener);
      }
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
 * Generated options are placed before `--`, with the positional app module
 * after it, so leading-dash module paths (e.g. `--app.js`, `--help`) parsed
 * via `dev --watch ./src -- --app.js` keep their `--` protection and are not
 * reinterpreted as flags (or help/version requests) by the child parser.
 *
 * Public helper for CLI wrappers that supervise watch mode themselves and need
 * the same child argv reconstruction as `runWithWatch`.
 */
export function buildChildArgs(args: DevArgs): string[] {
  const result: string[] = ['dev'];
  if (args.options.port !== undefined) result.push('--port', String(args.options.port));
  if (args.options.host !== undefined) result.push('--host', args.options.host);
  if (args.options.signals === false) result.push('--no-signals');
  if (args.options.shutdownTimeout !== undefined)
    result.push('--shutdown-timeout', String(args.options.shutdownTimeout));
  if (args.tsconfigPath !== undefined) result.push('--tsconfig', args.tsconfigPath);
  for (const r of args.require) result.push('--require', r);
  for (const e of args.env) result.push('--env', e);
  result.push('--', args.appPath);
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
  // Single-flight exit: controller failures already exit nonzero via `fail`;
  // the signal path must not override that with a second exit(0).
  let exited = false;
  const exitOnce = (code: number): void => {
    if (exited) return;
    exited = true;
    exitImpl?.(code);
  };
  const controller = createWatchSupervisor(args, {
    ...deps,
    exit: exitOnce,
  });
  const ownedHandlers: Array<[NodeJS.Signals, () => void]> = [];
  const removeOwnedHandlers = (): void => {
    for (const [signal, handler] of ownedHandlers.splice(0)) {
      process.removeListener(signal, handler);
    }
  };
  const shutdown = async (): Promise<void> => {
    // Keep guarded signal handling until cleanup settles so a second OS
    // signal cannot restore Node's default terminate action mid-escalation.
    // Only owned listeners are removed, and only after settle.
    try {
      await controller.shutdown();
    } finally {
      removeOwnedHandlers();
    }
  };
  const wrappedController: WatchSupervisorController = {
    shutdown,
    getChild: controller.getChild,
    getWatchers: controller.getWatchers,
    isShuttingDown: controller.isShuttingDown,
  };

  // In injected test mode, caller manages shutdown unless it explicitly opts in
  // to signal handlers. In production, exit after child terminates.
  //
  // Bounded repeated-signal policy (handlers stay installed until shutdown
  // settles, so Node's default action is never restored mid-cleanup):
  // - 1st signal starts single-flight graceful shutdown (SIGTERM, then SIGKILL
  //   after the kill timeout via the supervisor);
  // - 2nd signal while shutdown is pending best-effort escalates the live
  //   child to SIGKILL immediately and otherwise keeps waiting;
  // - further signals are coalesced (counted, no new shutdown, no forced
  //   default termination) until cleanup settles.
  if (installSignalHandlers) {
    let signalCount = 0;
    const shutdownAndExit = (signal: NodeJS.Signals): void => {
      signalCount += 1;
      if (signalCount === 1) {
        void shutdown().then(
          () => exitOnce(0),
          () => exitOnce(1),
        );
        return;
      }
      if (signalCount === 2) {
        try {
          const live = controller.getChild();
          if (live?.pid) {
            try {
              live.kill('SIGKILL');
            } catch (_error) {
              void _error;
            }
          }
        } catch (_error) {
          void _error;
        }
        void signal;
        return;
      }
      // signalCount >= 3: coalesced; remain guarded until shutdown settles.
    };
    const onSigint = (): void => shutdownAndExit('SIGINT');
    const onSigterm = (): void => shutdownAndExit('SIGTERM');
    ownedHandlers.push(['SIGINT', onSigint], ['SIGTERM', onSigterm]);
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
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
export type RuntimeModuleShutdown = () => Promise<void> | void;

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
/**
 * Validate that `outDir` is safe to clean before invoking tsup.
 * Prevents destructive `clean: true` combinations:
 *  - filesystem root (physical)
 *  - project cwd itself (physical)
 *  - ancestors of the project cwd (physical, through symlinked aliases)
 *  - symlinked output directories
 *  - output that physically contains input files (appPath/initPath), or is
 *    physically nested inside an input path
 *
 * Physical comparison canonicalizes cwd, outDir (via its nearest existing
 * ancestor when it does not exist yet), and supplied input paths with
 * `realpath`. Unexpected filesystem errors fail closed. Only `clean: false`
 * skips validation.
 *
 * Public safety check for programmatic build integrations before invoking
 * `buildBundleFromEntryContent()` with `clean: true`.
 */
export function validateOutDirForClean(outDir: string, clean: boolean, appPath?: string, initPath?: string): void {
  if (!clean) return;
  const cwd = process.cwd();
  const canonicalCwd = canonicalizeCwd(cwd);
  const outAbs = pathResolve(cwd, outDir);
  const canonicalOut = canonicalizePhysicalPath(outAbs, 'outDir');
  const root = pathParse(canonicalOut).root;
  if (canonicalOut === root) {
    throw new Error(`Refusing to clean filesystem root: ${outDir} resolves to ${canonicalOut}`);
  }
  if (canonicalOut === canonicalCwd) {
    throw new Error(`Refusing to clean project directory: ${outDir} resolves to cwd ${cwd}`);
  }
  // Forbid cleaning an ancestor of cwd (e.g. outDir = ".." cleaning parent),
  // compared physically so symlinked aliases of cwd/parents are also rejected.
  if (canonicalCwd === canonicalOut || canonicalCwd.startsWith(canonicalOut + pathSep)) {
    throw new Error(
      `Refusing to clean ancestor of project directory: ${outDir} resolves to ${canonicalOut} which contains cwd ${cwd}`,
    );
  }
  // Symlinked output directory: fail closed on unexpected inspection errors,
  // allow only confirmed-missing paths to proceed.
  try {
    const st = lstatSync(outAbs);
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing to clean symlinked outDir: ${outDir} resolves to symlink ${outAbs}`);
    }
  } catch (e) {
    if ((e as Error).message.startsWith('Refusing to clean')) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw new Error(
        `Refusing to clean outDir with unresolvable state: ${outDir} (${outAbs}): ${(e as Error).message}`,
        { cause: e },
      );
    }
    // Missing path: safe to proceed to canonical checks already performed.
  }
  // Input overlap: appPath or initPath physically inside outDir (or equal),
  // or outDir physically nested inside an input path. Both directions fail
  // closed so symlinked input directories cannot be cleaned.
  const checkOverlap = (inputPath: string | undefined, label: string) => {
    if (!inputPath) return;
    const inputAbs = pathResolve(cwd, inputPath);
    const canonicalInput = canonicalizePhysicalPath(inputAbs, label);
    if (canonicalInput === canonicalOut) {
      throw new Error(`Refusing to clean outDir that is the same as ${label}: ${outDir} == ${inputPath}`);
    }
    if (canonicalInput.startsWith(canonicalOut + pathSep)) {
      throw new Error(`Refusing to clean outDir that contains ${label}: ${outDir} contains ${inputPath}`);
    }
    if (canonicalOut.startsWith(canonicalInput + pathSep)) {
      throw new Error(`Refusing to clean outDir inside ${label}: ${outDir} is inside ${inputPath}`);
    }
  };
  checkOverlap(appPath, 'appPath');
  checkOverlap(initPath, 'initPath');
}

/**
 * Resolve the canonical physical path for validation: `realpath` of the
 * nearest existing ancestor joined with any non-existent trailing segments.
 * `ENOENT`/`ENOTDIR` walks upward; every other filesystem error fails closed.
 */
function canonicalizePhysicalPath(absPath: string, label: string): string {
  const normalizedStart = pathNormalize(absPath);
  let current = normalizedStart;
  const suffixParts: string[] = [];
  while (true) {
    try {
      const real = realpathSync(current);
      if (suffixParts.length === 0) return pathNormalize(real);
      return pathNormalize(pathJoin(real, ...suffixParts.slice().reverse()));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        const parent = dirname(current);
        if (parent === current) {
          throw new Error(`Refusing to clean ${label}: unable to resolve existing ancestor of ${absPath}`, {
            cause: error,
          });
        }
        suffixParts.push(basename(current));
        current = parent;
        continue;
      }
      throw new Error(`Refusing to clean ${label}: unable to resolve ${absPath}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
}

/** Canonicalize cwd via `realpath`; any failure fails closed. */
function canonicalizeCwd(cwd: string): string {
  try {
    return pathNormalize(realpathSync(cwd));
  } catch (error) {
    throw new Error(`Refusing to clean: unable to resolve project directory ${cwd}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/** Injectable filesystem/build seams for deterministic staging-failure tests. */
export interface BuildStagingDeps {
  mkdtempSyncImpl?: typeof mkdtempSync;
  lstatSyncImpl?: typeof lstatSync;
  writeFileSyncImpl?: typeof writeFileSync;
  rmSyncImpl?: typeof rmSync;
  buildImpl?: (options: {
    config: false;
    entry: Record<string, string>;
    tsconfig?: string;
    format: string[];
    target: string;
    outDir: string;
    clean: boolean;
    external: string[];
    sourcemap: boolean;
    dts: boolean;
    splitting: boolean;
  }) => Promise<void>;
}

function createUniqueStagingDir(deps: BuildStagingDeps = {}): string {
  const cwd = process.cwd();
  const prefix = pathJoin(cwd, STAGING_DIR_PREFIX);
  const mkdtemp = deps.mkdtempSyncImpl ?? mkdtempSync;
  const lstat = deps.lstatSyncImpl ?? lstatSync;
  const rm = deps.rmSyncImpl ?? rmSync;
  const dir = mkdtemp(prefix);
  // Ensure private staging is not a symlink; any post-acquisition failure
  // removes the owned directory so callers never leak it.
  try {
    const st = lstat(dir);
    if (st.isSymbolicLink()) {
      throw new Error(`Staging directory is a symlink: ${dir}`);
    }
  } catch (e) {
    try {
      rm(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
    throw e;
  }
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best effort on non-POSIX
  }
  return dir;
}

function writeStagingEntry(dir: string, content: string, deps: BuildStagingDeps = {}): string {
  const entryPath = pathJoin(dir, 'entry.ts');
  const lstat = deps.lstatSyncImpl ?? lstatSync;
  const writeFile = deps.writeFileSyncImpl ?? writeFileSync;
  const rm = deps.rmSyncImpl ?? rmSync;
  // Defensive: ensure entryPath is not a symlink and doesn't exist. Only a
  // confirmed-missing path proceeds; unexpected inspection errors fail closed.
  try {
    const st = lstat(entryPath);
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlink at staging path: ${entryPath}`);
    }
    throw new Error(`Staging file already exists: ${entryPath}`);
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith('Refusing to') || message.startsWith('Staging file already exists')) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      throw new Error(`Refusing to use staging path with unresolvable state: ${entryPath}: ${message}`, {
        cause: e,
      });
    }
    // Confirmed missing: proceed to exclusive creation.
  }
  // Exclusive creation (wx), private perms 0600
  writeFile(entryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  // Verify not symlink after write; any inspection failure fails closed and
  // removes the entry best-effort (the caller still removes the staging dir).
  try {
    const st = lstat(entryPath);
    if (st.isSymbolicLink()) {
      try {
        rm(entryPath, { force: true });
      } catch {
        /* best-effort cleanup */
      }
      throw new Error(`Staging file is a symlink after write: ${entryPath}`);
    }
  } catch (e) {
    if ((e as Error).message.includes('Staging file is a symlink')) throw e;
    try {
      rm(entryPath, { force: true });
    } catch {
      /* best-effort cleanup */
    }
    throw new Error(`Refusing to use staging file with unresolvable state: ${entryPath}: ${(e as Error).message}`, {
      cause: e,
    });
  }
  return entryPath;
}

export async function buildBundleFromEntryContent(
  args: BuildEntryContentArgs,
  deps: BuildStagingDeps = {},
): Promise<void> {
  // Validate outDir early when clean is true; without appPath we only check root/cwd/symlink
  validateOutDirForClean(args.outDir, args.clean);
  // Lazy-load the bundler only for real builds so validation/mocked-build
  // assertions in temporary cwds never pull bundler cwd state into the process.
  const buildImpl = deps.buildImpl ?? ((await import('tsup')).build as NonNullable<BuildStagingDeps['buildImpl']>);
  const rm = deps.rmSyncImpl ?? rmSync;
  // Every operation after staging acquisition (entry write, inspection, and
  // the bundled build itself) runs inside the protected region so an
  // injected or real failure cannot leak the owned staging directory.
  const stagingDir = createUniqueStagingDir(deps);
  try {
    const tempEntryPath = writeStagingEntry(stagingDir, args.entryContent, deps);
    const absOutDir = pathResolve(process.cwd(), args.outDir);

    await buildImpl({
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
    try {
      rm(stagingDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup must not mask the original error */
    }
  }
}

/**
 * Bundle an Express app as a local runtime module. The output default-exports
 * the app and may additionally export an `init` hook for the `start` command.
 *
 * `express` and `@web-ts-toolkit/express-runtime` are always external, so the
 * bundle must be deployed with both packages installed (`express` is a peer
 * dependency). Additional externals can be passed via `BuildArgs.external`.
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
 * `express` and `@web-ts-toolkit/express-runtime` (imported by the generated
 * entry) are always external; additional externals can be passed via
 * `BuildArgs.external`. Deploy the bundle together with both packages
 * installed (`express` is a peer dependency; `serverless-http` ships with the
 * runtime package).
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
 * A serverless handler callable as invoked by the local `start-serverless`
 * adapter. The adapter supplies an AWS API Gateway REST API v1 event (see
 * `ApiGatewayRestEvent`) and an empty record context (`{}`), then validates
 * the unknown result via `applyServerlessResult`.
 *
 * Keep the parameters narrow: handlers requiring provider-specific event
 * fields or rich Lambda-like contexts must not typecheck here, since the
 * local adapter cannot supply them. The default
 * `ServerlessHandler<Record<string, unknown>, Record<string, unknown>>` from
 * `createServerlessHandler(app)` remains assignable, so cast-free
 * `createServerlessAdapterApp(createServerlessHandler(app))` composition
 * compiles.
 */
export type GenericHandler = (event: ApiGatewayRestEvent, context: Record<string, unknown>) => Promise<unknown>;

/**
 * AWS API Gateway REST API v1 / Lambda proxy event shape emitted by the local adapter.
 *
 * Declared as a type alias (not an interface) so the implicit index signature
 * lets the default provider-generic `ServerlessHandler` (`Record<string,
 * unknown>` event) accept it without casts.
 */
export type ApiGatewayRestEvent = {
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
};

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
   * Collection retains O(limit) chunk bytes: appending stops once the running
   * total would exceed the limit (at most one chunk over the limit is observed
   * before rejection). `Buffer.concat` then holds the chunks plus one output
   * Buffer, and event translation adds a transient base64 copy (~4/3 of the
   * body), so peak transient memory is a small multiple of the limit rather
   * than an exact limit-plus-chunk ceiling.
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
 *
 * Memory phases (no unmeasured total-memory ceiling is claimed): chunk
 * retention is O(limit) — appending stops once the running total would exceed
 * `maxBytes`, so at most one chunk over the limit is observed before
 * rejection; `Buffer.concat` then retains the chunks plus one output Buffer of
 * the accepted size; `toServerlessEvent` adds a transient base64 copy (~4/3 of
 * the body). Peak transient memory is therefore a small multiple of the limit.
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
      let body: Buffer;
      try {
        body = Buffer.concat(chunks, total);
      } catch (e) {
        // Finalization failure: `finished` is already set and owned listeners
        // are removed, so reject directly (fail() would early-return).
        reject(e as Error);
        return;
      }
      resolve(body);
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
 * Path contract (origin-form request targets are preserved verbatim):
 *
 * - `url` is normally the raw origin-form target from `req.url`
 *   (`/path?query`). The path is everything before the first literal `?`
 *   (or `#`); it is never dot-segment-resolved, slash-collapsed, or
 *   percent-decoded. `//admin/users`, `/a/../private`, `/a/./b`,
 *   `/%2E%2E/private`, and `/a%2Fb` all reach the handler unchanged, so
 *   wrapped routing sees the same target the client sent. Query splitting
 *   and single-decode semantics are unchanged, and only a literal `?`
 *   starts the query (an encoded `%3F` stays in the path).
 * - A `#fragment`, never part of a real HTTP request target, is stripped
 *   when present.
 * - Absolute-form targets (`scheme://authority/path?query`, as sent to
 *   proxies) are supported by stripping the scheme and authority and
 *   preserving the raw path remainder (`http://h//a/../b?x=1` yields path
 *   `//a/../b`); a missing remainder maps to `/`. Userinfo, host, and port
 *   are ignored, not validated.
 * - Asterisk-form (`*`, used by `OPTIONS *`) is supported with path `*`.
 * - The empty string maps to `/` for backwards compatibility. Any other
 *   target that is neither origin-form, absolute-form, nor asterisk-form
 *   (e.g. `foo/bar`) is rejected with an `Error` (the local adapter turns
 *   this into a 500 without invoking the handler).
 *
 * Intentional behavior change: this helper previously split the target via
 * the WHATWG `URL` parser, which rewrote origin-form paths before routing
 * (`//admin/users` was parsed as host `admin` plus path `/users`,
 * `/a/../private` resolved to `/private`, and even encoded `%2E%2E` was
 * decoded and then resolved). Those rewrites silently selected a different
 * route; they are no longer performed.
 *
 * Header contract (HTTP boundary fidelity):
 *
 * - When the Node `rawHeaders` list (`[name, value, ...]` from
 *   `IncomingMessage.rawHeaders`, optionally passed as the fifth argument)
 *   is available, both header maps are derived from it. Names are
 *   lowercased (HTTP names are case-insensitive, so `X-Repeat` and
 *   `x-repeat` merge); values are preserved verbatim in wire order and
 *   never split on commas (`"one, with comma"` stays one entry).
 * - Otherwise the `headers` map (e.g. `req.headers` or `headersDistinct`)
 *   is used as-is: array values are preserved entry-wise, string values
 *   become single entries, and commas inside values are never split. Note
 *   that `req.headers` has already joined duplicates (`"one, two"`), so
 *   callers at the real HTTP boundary should pass `rawHeaders` (the local
 *   adapter does) to keep repeated headers distinct.
 * - The single-value map joins each multi-value entry with `", "`; the
 *   multi-value map keeps every value in order. Response `set-cookie`
 *   handling is unchanged (`applyServerlessResult` still emits each
 *   `set-cookie` value as its own header and joins other multi-values
 *   with `","`).
 *
 * Public helper for adapters that need the same AWS REST API v1 event shape as
 * the `start-serverless` command.
 */
export function toServerlessEvent(
  method: string,
  url: string,
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
  rawHeaders?: unknown,
): ApiGatewayRestEvent {
  const { path, search } = splitRequestTarget(url);
  const { queryStringParameters, multiValueQueryStringParameters } = parseAwsRestQuery(search);
  const { singleValueHeaders, multiValueHeaders } = buildAwsRestHeaders(headers, rawHeaders);

  return {
    httpMethod: method,
    path,
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

/**
 * Split an HTTP request target into a verbatim path and a `?`-prefixed
 * search string without WHATWG normalization. See `toServerlessEvent` for
 * the supported forms and contract.
 */
function splitRequestTarget(target: string): { path: string; search: string } {
  if (target === '') {
    return { path: '/', search: '' };
  }

  let remainder = target;
  const absoluteMatch = remainder.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//);
  if (absoluteMatch) {
    const afterScheme = remainder.slice(absoluteMatch[0].length);
    const boundary = afterScheme.search(/[/?#]/);
    if (boundary === -1) {
      return { path: '/', search: '' };
    }
    remainder = afterScheme.slice(boundary);
    if (remainder.startsWith('?') || remainder.startsWith('#')) {
      // Absolute URI without a path, e.g. `http://host?x=1`.
      remainder = `/${remainder}`;
    }
  } else if (remainder === '*' || remainder.startsWith('*?') || remainder.startsWith('*#')) {
    remainder = remainder.slice(1);
    if (remainder === '') {
      return { path: '*', search: '' };
    }
    // remainder now starts with `?` or `#`; fall through to fragment/query split.
    const hashIndex = remainder.indexOf('#');
    const withoutFragment = hashIndex === -1 ? remainder : remainder.slice(0, hashIndex);
    return { path: '*', search: withoutFragment };
  } else if (!remainder.startsWith('/')) {
    throw new Error(
      `Unsupported request target: ${JSON.stringify(target)}. Expected an origin-form path ("/path?query"), an absolute-form URI ("scheme://authority/path?query"), or "*"`,
    );
  }

  const hashIndex = remainder.indexOf('#');
  const withoutFragment = hashIndex === -1 ? remainder : remainder.slice(0, hashIndex);
  const queryIndex = withoutFragment.indexOf('?');
  if (queryIndex === -1) {
    return { path: withoutFragment, search: '' };
  }
  return { path: withoutFragment.slice(0, queryIndex), search: withoutFragment.slice(queryIndex) };
}

function parseAwsRestQuery(
  search: string,
): Pick<ApiGatewayRestEvent, 'queryStringParameters' | 'multiValueQueryStringParameters'> {
  if (search === '' || search === '?') {
    return { queryStringParameters: null, multiValueQueryStringParameters: null };
  }

  // Null-prototype dictionaries so request-controlled keys such as
  // `constructor`, `toString`, or `__proto__` are stored as own keys instead
  // of colliding with inherited members. This is a local key-safety boundary;
  // it makes no claim about global prototype pollution.
  const single: Record<string, string> = Object.create(null);
  const multi: Record<string, string[]> = Object.create(null);
  const query = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? '' : pair.slice(separator + 1);
    const key = decodeQueryComponent(rawKey);
    const value = decodeQueryComponent(rawValue);
    single[key] = value;
    if (Object.prototype.hasOwnProperty.call(multi, key)) {
      (multi[key] as string[]).push(value);
    } else {
      multi[key] = [value];
    }
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
  // Null-prototype maps: header names are request-controlled at this shared
  // boundary, so avoid inherited-key collisions the same way as query maps.
  const singleValueHeaders: Record<string, string> = Object.create(null);
  const multiValueHeaders: Record<string, string[]> = Object.create(null);

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value.map(String) : [String(value)];
    multiValueHeaders[key] = values;
    singleValueHeaders[key] = values.join(', ');
  }

  return { singleValueHeaders, multiValueHeaders };
}

/**
 * Derive AWS REST v1 header maps, preferring the verbatim `rawHeaders` wire
 * list when one is supplied. Never splits values on commas; repeated headers
 * stay distinct in `multiValueHeaders` while `headers` joins them with `", "`.
 */
function buildAwsRestHeaders(
  headers: Record<string, string | string[] | undefined>,
  rawHeaders: unknown,
): { singleValueHeaders: Record<string, string>; multiValueHeaders: Record<string, string[]> } {
  const fromRaw = headersFromRawHeadersList(rawHeaders);
  if (fromRaw) return fromRaw;
  if (isPlainRecord(rawHeaders)) {
    // Accept a `headersDistinct`-shaped map when supplied as the fifth
    // argument; it already keeps duplicates as arrays.
    return normalizeAwsRestHeaders(rawHeaders as Record<string, string | string[] | undefined>);
  }
  return normalizeAwsRestHeaders(headers);
}

/**
 * Group a Node `rawHeaders` flat list (`[name, value, ...]`) into
 * single/multi header maps. Names are lowercased so differently cased
 * repeats merge; values are kept verbatim in wire order. Returns `null`
 * when the input is not a usable raw list so callers fall back to the
 * merged headers map.
 */
function headersFromRawHeadersList(rawHeaders: unknown): {
  singleValueHeaders: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
} | null {
  if (!Array.isArray(rawHeaders)) return null;
  if (rawHeaders.length % 2 !== 0) return null;
  for (const entry of rawHeaders) {
    if (typeof entry !== 'string') return null;
  }
  const singleValueHeaders: Record<string, string> = Object.create(null);
  const multiValueHeaders: Record<string, string[]> = Object.create(null);
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = (rawHeaders[index] as string).toLowerCase();
    const value = rawHeaders[index + 1] as string;
    if (Object.prototype.hasOwnProperty.call(multiValueHeaders, name)) {
      (multiValueHeaders[name] as string[]).push(value);
    } else {
      multiValueHeaders[name] = [value];
    }
  }
  for (const key of Object.keys(multiValueHeaders)) {
    singleValueHeaders[key] = (multiValueHeaders[key] as string[]).join(', ');
  }
  return { singleValueHeaders, multiValueHeaders };
}

/**
 * Write a serverless handler result to an Express response.
 * Validates the complete AWS API Gateway REST API v1 / Lambda proxy result before writing anything.
 * `multiValueHeaders` wins over `headers` when the same header appears in both maps.
 * An empty `multiValueHeaders` array is omitted (no header is emitted), but its
 * name is still validated so invalid names fail closed even with zero values.
 * If header/body application fails before headers are sent, any headers staged
 * by this call are removed before the error propagates so a fallback 500 stays clean.
 *
 * Public helper for adapters that need the same AWS REST API v1 result-to-HTTP
 * translation as the `start-serverless` command.
 */
export function applyServerlessResult(result: unknown, res: Response): void {
  const response = validateServerlessResult(result);

  res.status(response.statusCode);

  // Snapshot pre-existing headers so a mid-application failure can roll back
  // to a clean response instead of leaking a partially staged 200 framing.
  let baseline: Set<string> | undefined;
  try {
    baseline = new Set(Object.keys(res.getHeaders()).map((name) => name.toLowerCase()));
  } catch (_e) {
    void _e;
    baseline = undefined;
  }
  try {
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
  } catch (error) {
    if (!res.headersSent) {
      try {
        if (baseline !== undefined) {
          for (const name of Object.keys(res.getHeaders())) {
            if (!baseline.has(name.toLowerCase())) {
              res.removeHeader(name);
            }
          }
        } else {
          for (const [key] of Object.entries(response.headers)) {
            try {
              res.removeHeader(key);
            } catch (_e) {
              void _e;
            }
          }
          for (const [key] of Object.entries(response.multiValueHeaders)) {
            try {
              res.removeHeader(key);
            } catch (_e) {
              void _e;
            }
          }
        }
      } catch (_e) {
        void _e;
      }
    }
    throw error;
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

  const headers: Record<string, string> = Object.create(null);
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

  const headers: Record<string, string[]> = Object.create(null);
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined) continue;
    if (!Array.isArray(headerValue) || headerValue.some((entry) => typeof entry !== 'string')) {
      throw new Error(`Invalid serverless result ${name}.${key}: expected an array of string header values.`);
    }
    if (headerValue.length === 0) {
      // Empty arrays emit no header, but the name is still validated so an
      // invalid name fails closed instead of leaking earlier headers at
      // `setHeader` time. Omitted empties also do not shadow `headers`.
      validateServerlessHeaderName(key, `${name}.${key}`);
      continue;
    }
    for (const entry of headerValue) {
      validateServerlessHeader(key, entry, `${name}.${key}`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

function validateServerlessHeaderName(key: string, label: string): void {
  try {
    validateHeaderName(key);
  } catch (error) {
    throw new Error(`Invalid serverless result header ${label}: ${(error as Error).message}`, { cause: error });
  }
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
 * invoked as `handler(event, {})` where `event` is an `ApiGatewayRestEvent`
 * and the context is an empty record, and the result is written back to the
 * response.
 *
 * Express body parsers are disabled; the raw request body is buffered with
 * `collectBody` and then base64-encoded into the AWS v1 string `body` field
 * (`isBase64Encoded` is true for non-empty bodies, false with `body: ''` for
 * empty ones), so `serverless-http` replays the decoded bytes through the
 * Express request stream identically to production.
 * Bodies exceeding `maxBodyBytes` (default 1 MiB, 0 = empty bodies only) receive
 * `413 Payload Too Large` without invoking the handler; the request is drained
 * and chunk retention is O(limit) — appending stops once the running total
 * would exceed the limit, so at most one chunk over the limit is observed
 * before rejection. `Buffer.concat` retains the chunks plus one output Buffer
 * and event translation adds a transient base64 copy (~4/3 of the body), so
 * peak transient memory is a small multiple of the limit.
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
          // Pass the verbatim wire list so repeated headers stay distinct in
          // `multiValueHeaders` (req.headers has already joined them); fall
          // back to headersDistinct when rawHeaders is unavailable.
          const raw =
            (req as { rawHeaders?: unknown }).rawHeaders ?? (req as { headersDistinct?: unknown }).headersDistinct;
          const event = toServerlessEvent(req.method, req.url, req.headers, body, raw);
          result = await handler(event, {});
        } catch (e) {
          console.error('Serverless adapter error:', e);
          if (!res.headersSent && !res.writableEnded) res.status(500).end('Internal server error');
          return;
        }
        let baselineHeaders: Set<string> | undefined;
        try {
          baselineHeaders = new Set(Object.keys(res.getHeaders()).map((name) => name.toLowerCase()));
        } catch (_e) {
          void _e;
          baselineHeaders = undefined;
        }
        try {
          applyServerlessResult(result, res);
        } catch (e) {
          console.error('Invalid serverless handler result:', e);
          if (!res.headersSent && !res.writableEnded) {
            // Defense in depth: `applyServerlessResult` already rolls back
            // headers it staged, but clear anything still staged so the
            // fallback 500 never carries a partial 200 framing. Baseline
            // headers (e.g. Express defaults) are preserved.
            try {
              for (const name of Object.keys(res.getHeaders())) {
                const lower = name.toLowerCase();
                if (lower === 'content-length') continue;
                if (baselineHeaders !== undefined && baselineHeaders.has(lower)) continue;
                try {
                  res.removeHeader(name);
                } catch (_e) {
                  void _e;
                }
              }
            } catch (_e) {
              void _e;
            }
            res.status(500).end('Internal server error');
          }
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
export async function loadBuiltApp(
  appPath: string,
): Promise<{ app: Express; init?: RuntimeModuleInit; shutdown?: RuntimeModuleShutdown }> {
  const fullPath = pathResolve(process.cwd(), appPath);
  const moduleUrl = pathToFileURL(fullPath).href;
  const mod = (await import(moduleUrl)) as Record<string, unknown>;
  const exported = mod.app ?? mod.default;
  if (!exported) {
    throw new Error(
      `Module "${appPath}" must default-export an Express app or export it as "app". Exports: ${Object.keys(mod).join(', ')}`,
    );
  }

  const init = mod.init;
  if (init !== undefined && typeof init !== 'function') {
    throw new Error(`Module "${appPath}" must export "init" as a function when present.`);
  }
  const shutdown = mod.shutdown;
  if (shutdown !== undefined && typeof shutdown !== 'function') {
    throw new Error(`Module "${appPath}" must export "shutdown" as a function when present.`);
  }

  return {
    app: await resolveExport(exported, appPath),
    init: init as RuntimeModuleInit | undefined,
    shutdown: shutdown as RuntimeModuleShutdown | undefined,
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
