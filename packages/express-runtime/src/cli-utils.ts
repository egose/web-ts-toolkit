import { pathToFileURL } from 'node:url';
import { resolve as pathResolve, extname } from 'node:path';
import { writeFileSync, rmSync, readFileSync, existsSync, watch } from 'node:fs';
import { createRequire } from 'node:module';
import { fork, type ChildProcess } from 'node:child_process';
import type { Express, Request, Response } from 'express';
import { createExpressApp, type LocalServerOptions } from './index';

/**
 * Version placeholder rewritten at publish time by `@repo-toolkit/publish-package`.
 */
export const CLI_VERSION = '0.0.0-PLACEHOLDER';

/**
 * Read the next argv value after a flag, throwing if it is missing or looks
 * like another flag.
 */
export function readValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for argument: ${name}`);
  }
  return value;
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
  tempEntryFilename: string;
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
      npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts
    Or use --require with a TS-aware loader module.
  - --env files are parsed as KEY=VALUE; existing process.env entries are never overridden.
    For advanced dotenv features (multiline, expansion), --require dotenv/config instead.
  - --watch forks a child process running the same CLI without --watch. On file change,
    the child is killed (SIGTERM) and respawned after the debounce delay.
  - In build/build-serverless mode, express is always external. Add more externals with --external.
  - In start mode, the bundled app file must default-export an Express app (or export it as "app").
    If the bundle exports "init", it runs before the server starts listening.
  - In start-serverless mode, the bundled handler file must be a JS/CJS module whose
    "handler" export (or default export) is a function: (event, context) => Promise<result>.
  - The start-serverless adapter buffers at most --max-body-bytes per request (default 1 MiB, 0 = empty bodies only);
    larger declared Content-Length or chunked bodies receive 413 without invoking the handler.
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
  const value = readValue(argv, index, arg);
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed) list.push(trimmed);
  }
  return index + 1;
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
      continue;
    }

    if (isHelp(arg) || isVersion(arg)) {
      continue;
    }

    if (arg === '--port') {
      const port = readValue(argv, index, arg);
      const portNum = Number(port);
      options.port = Number.isNaN(portNum) ? port : portNum;
      index += 1;
      continue;
    }
    if (arg.startsWith('--port=')) {
      const port = arg.slice('--port='.length);
      const portNum = Number(port);
      options.port = Number.isNaN(portNum) ? port : portNum;
      continue;
    }

    if (arg === '--host') {
      options.host = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--host=')) {
      options.host = arg.slice('--host='.length);
      continue;
    }

    if (arg === '--no-signals') {
      options.signals = false;
      continue;
    }

    if (arg === '--shutdown-timeout') {
      options.shutdownTimeout = Number(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--shutdown-timeout=')) {
      options.shutdownTimeout = Number(arg.slice('--shutdown-timeout='.length));
      continue;
    }

    if (arg === '--require') {
      index = parseRepeatable(argv, index, arg, requireModules);
      continue;
    }
    if (arg.startsWith('--require=')) {
      for (const part of arg.slice('--require='.length).split(',')) {
        const trimmed = part.trim();
        if (trimmed) requireModules.push(trimmed);
      }
      continue;
    }

    if (arg === '--env') {
      index = parseRepeatable(argv, index, arg, envFiles);
      continue;
    }
    if (arg.startsWith('--env=')) {
      for (const part of arg.slice('--env='.length).split(',')) {
        const trimmed = part.trim();
        if (trimmed) envFiles.push(trimmed);
      }
      continue;
    }

    if (arg === '--tsconfig') {
      tsconfigPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--tsconfig=')) {
      tsconfigPath = arg.slice('--tsconfig='.length);
      continue;
    }

    if (arg === '--watch') {
      index = parseRepeatable(argv, index, arg, watchPaths);
      continue;
    }
    if (arg.startsWith('--watch=')) {
      for (const part of arg.slice('--watch='.length).split(',')) {
        const trimmed = part.trim();
        if (trimmed) watchPaths.push(trimmed);
      }
      continue;
    }

    if (arg === '--ext') {
      watchExt = [];
      index = parseRepeatable(argv, index, arg, watchExt);
      continue;
    }
    if (arg.startsWith('--ext=')) {
      watchExt = [];
      for (const part of arg.slice('--ext='.length).split(',')) {
        const trimmed = part.trim();
        if (trimmed) watchExt.push(trimmed);
      }
      continue;
    }

    if (arg === '--delay') {
      watchDelay = Number(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--delay=')) {
      watchDelay = Number(arg.slice('--delay='.length));
      continue;
    }

    if (!arg.startsWith('--')) {
      if (appPath) {
        throw new Error(`Unexpected positional argument: ${arg}. App module already set to ${appPath}`);
      }
      appPath = arg;
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
  for (const arg of argv) {
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
    if (arg === '--max-body-bytes') {
      const raw = readValue(argv, i, arg);
      if (raw.trim() === '') throw new Error('Missing value for argument: --max-body-bytes');
      const num = Number(raw);
      validateMaxBodyBytes(num);
      maxBodyBytes = num;
      i += 1;
      continue;
    }
    if (arg.startsWith('--max-body-bytes=')) {
      const raw = arg.slice('--max-body-bytes='.length);
      if (raw.trim() === '') throw new Error('Missing value for argument: --max-body-bytes');
      const num = Number(raw);
      validateMaxBodyBytes(num);
      maxBodyBytes = num;
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
      continue;
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
      result.initPath = arg.slice('--init='.length);
      continue;
    }

    if (arg === '--tsconfig') {
      result.tsconfigPath = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--tsconfig=')) {
      result.tsconfigPath = arg.slice('--tsconfig='.length);
      continue;
    }

    if (arg === '--out-dir') {
      result.outDir = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--out-dir=')) {
      result.outDir = arg.slice('--out-dir='.length);
      continue;
    }

    if (arg === '--out-name') {
      result.outName = readValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('--out-name=')) {
      result.outName = arg.slice('--out-name='.length);
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
      const fmt = arg.slice('--format='.length);
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
      result.target = arg.slice('--target='.length);
      continue;
    }

    if (arg === '--external') {
      external.push(readValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith('--external=')) {
      external.push(arg.slice('--external='.length));
      continue;
    }

    if (arg === '--no-clean') {
      result.clean = false;
      continue;
    }

    if (!arg.startsWith('--')) {
      if (appPath) {
        throw new Error(`Unexpected positional argument: ${arg}. App module already set to ${appPath}`);
      }
      appPath = arg;
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

  // Global flags take precedence regardless of position
  if (argv.some((a) => isHelp(a))) {
    printHelp();
    return null;
  }
  if (argv.some((a) => isVersion(a))) {
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
 * Exported for direct unit testing.
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
 * Exported for direct unit testing.
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
 * Exported for direct unit testing.
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

/**
 * Create a watch supervisor with injectable dependencies.
 * This is the test-observable seam; production `runWithWatch` delegates here
 * with real `fork`/`watch`.
 */
export function createWatchSupervisor(args: DevArgs, deps: WatchSupervisorDeps = {}): WatchSupervisorController {
  const forkImpl = deps.fork ?? fork;
  const watchImpl = deps.watch ?? watch;
  const existsSyncImpl = deps.existsSync ?? existsSync;

  const cliPath = process.argv[1];
  const childArgv = buildChildArgs(args);
  let child: ChildProcess | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let isShuttingDown = false;
  const restartDelay = args.watchDelay;
  const watchers: ReturnType<typeof watch>[] = [];

  const spawnChild = (): void => {
    if (isShuttingDown) return;
    child = forkImpl(cliPath, childArgv, { stdio: 'inherit' });
    child.on('exit', () => {
      child = null;
    });
  };

  const killChild = (): Promise<void> => {
    return new Promise((resolve) => {
      if (!child || !child.pid) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
      try {
        child.kill('SIGTERM');
      } catch {
        resolve();
      }
    });
  };

  const restart = async (): Promise<void> => {
    await killChild();
    spawnChild();
  };

  const debouncedRestart = (): void => {
    if (isShuttingDown) return;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void restart();
    }, restartDelay);
  };

  // Validate all paths before opening any watcher (prevents leaking watchers on partial failure)
  for (const watchPath of args.watch) {
    const absPath = pathResolve(process.cwd(), watchPath);
    if (!existsSyncImpl(absPath)) {
      throw new Error(`Watch path not found: ${watchPath}`);
    }
  }

  // Open watchers after validation
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
    watchers.push(watcher);
  }

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    for (const w of watchers.splice(0)) {
      try {
        w.close();
      } catch (_e) {
        void _e;
      }
    }
    if (child && child.pid) {
      await killChild();
    }
  };

  spawnChild();

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
 * Exported for direct unit testing.
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
 * restarts the child (SIGTERM → respawn) on changes matching the given
 * extensions. Uses Node 20+'s `fs.watch` with `{ recursive: true }`.
 *
 * Production entry point that delegates to `createWatchSupervisor` with real
 * dependencies and installs signal handlers that exit the process.
 */
export function runWithWatch(args: DevArgs, deps: WatchSupervisorDeps = {}): void {
  const controller = createWatchSupervisor(args, deps);
  const isTestMode = Object.keys(deps).length > 0;

  // In test mode, caller manages shutdown via controller.shutdown(); don't install
  // process-exit handlers. In production, exit after child terminates.
  if (!isTestMode) {
    const shutdownAndExit = (): void => {
      void controller.shutdown().then(() => process.exit(0));
      // If child still alive, ensure SIGTERM was sent (controller already did)
      const child = controller.getChild();
      if (child && child.pid) {
        // controller.shutdown already kills child; just ensure exit after
        child.once('exit', () => process.exit(0));
      } else {
        // No child, exit immediately after watchers closed
        // controller.shutdown already closed watchers
      }
    };
    process.on('SIGINT', shutdownAndExit);
    process.on('SIGTERM', shutdownAndExit);
  }
}

// ---------------------------------------------------------------------------
// build / build-serverless
// ---------------------------------------------------------------------------

const TEMP_BUILD_ENTRY_FILENAME = '.express-runtime-build-entry.ts';
const TEMP_SERVERLESS_ENTRY_FILENAME = '.express-runtime-build-serverless-entry.ts';

export type RuntimeModuleInit = () => Promise<void> | void;

/**
 * Generate the temporary entry file content that wires the user's app and
 * optional init hook into a serverless handler.
 *
 * Exported for direct unit testing.
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
 * Exported for direct unit testing.
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

export async function buildBundleFromEntryContent(args: BuildEntryContentArgs): Promise<void> {
  const tsupModule: typeof import('tsup') = await import('tsup');
  const { build } = tsupModule;
  const tempEntryPath = pathResolve(process.cwd(), args.tempEntryFilename);
  writeFileSync(tempEntryPath, args.entryContent, 'utf8');

  try {
    await build({
      config: false,
      entry: { [args.outName]: tempEntryPath },
      tsconfig: args.tsconfigPath,
      format: [args.format],
      target: args.target,
      outDir: args.outDir,
      clean: args.clean,
      external: ['express', ...args.external],
      sourcemap: false,
      dts: false,
      splitting: false,
    });
  } finally {
    rmSync(tempEntryPath, { force: true });
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
    tempEntryFilename: TEMP_BUILD_ENTRY_FILENAME,
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
    tempEntryFilename: TEMP_SERVERLESS_ENTRY_FILENAME,
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

/**
 * The result shape returned by `serverless-http` (and the `build` output).
 */
export interface ServerlessResult {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
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
 * Exported for direct unit testing and CLI validation.
 */
export function validateMaxBodyBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid --max-body-bytes: ${String(value)}. Must be a finite non-negative integer. Use 0 to disallow bodies (empty bodies only).`,
    );
  }
  return value;
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
 * Build a serverless event from HTTP request components.
 *
 * Exported for direct unit testing.
 */
export function toServerlessEvent(
  method: string,
  url: string,
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
): Record<string, unknown> {
  return {
    httpMethod: method,
    path: url,
    headers: headers as Record<string, string>,
    body: body.length > 0 ? body : undefined,
  };
}

/**
 * Write a serverless handler result to an Express response.
 *
 * Exported for direct unit testing.
 */
export function applyServerlessResult(result: unknown, res: Response): void {
  if (result === null || result === undefined) {
    res.status(200).end();
    return;
  }

  const r = result as ServerlessResult;

  if (typeof r.statusCode === 'number') {
    res.status(r.statusCode);
  }

  if (r.headers && typeof r.headers === 'object') {
    for (const [key, value] of Object.entries(r.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value) && key.toLowerCase() === 'set-cookie') {
          res.setHeader(key, value);
        } else {
          res.setHeader(key, Array.isArray(value) ? value.join(',') : value);
        }
      }
    }
  }

  if (r.isBase64Encoded && typeof r.body === 'string') {
    res.end(Buffer.from(r.body, 'base64'));
  } else if (typeof r.body === 'string') {
    res.end(r.body);
  } else {
    res.end();
  }
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
        applyServerlessResult(result, res);
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
