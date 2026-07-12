import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
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

export type Subcommand = 'dev' | 'build' | 'start';

export interface DevArgs {
  appPath: string;
  options: Omit<LocalServerOptions, 'init' | 'onShutdown'>;
}

export interface BuildArgs {
  appPath: string;
  initPath?: string;
  outDir: string;
  outName: string;
  format: 'cjs' | 'esm';
  target: string;
  external: string[];
  clean: boolean;
}

export interface StartArgs {
  handlerPath: string;
  options: Omit<LocalServerOptions, 'init' | 'onShutdown'>;
}

export type ParsedArgs =
  | { subcommand: 'dev'; dev: DevArgs }
  | { subcommand: 'build'; build: BuildArgs }
  | { subcommand: 'start'; start: StartArgs }
  | null;

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printHelp(): void {
  console.log(`wtt-express-runtime

Run an Express app locally, bundle it as a serverless handler, or run the bundle.

Usage:
  wtt-express-runtime <command> <app-module> [options]
  wtt-express-runtime <app-module> [options]   (alias for dev)

Commands:
  dev                           Run the Express app as a local dev server
  build                         Bundle the Express app as a serverless handler
  start                         Run a bundled serverless handler locally

Dev options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000)

Build options:
  --init <path>                 Init hook module (default export, async function)
  --out-dir <path>              Output directory (default: dist)
  --out-name <name>             Output filename without extension (default: handler)
  --format <cjs|esm>            Output format (default: cjs)
  --target <target>             Compilation target (default: node20)
  --external <pkg>              Mark package as external (repeatable; express always external)
  --no-clean                    Don't clean the output directory before building

Start options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000)

Global options:
  -V, --version                 Show version
  -h, --help                    Show this help message

Examples:
  wtt-express-runtime dev ./dist/app.js
  wtt-express-runtime dev ./dist/app.js --port 3000 --host localhost
  wtt-express-runtime build ./src/app.ts --out-dir netlify/functions
  wtt-express-runtime build ./src/app.ts --init ./src/init.ts --format esm
  wtt-express-runtime start ./netlify/functions/handler.js --port 9000
  wtt-express-runtime build ./src/app.ts && wtt-express-runtime start ./dist/handler.js

Notes:
  - In dev mode, the CLI evaluates arbitrary code from <app-module> in the current process.
  - TypeScript app modules in dev mode require a TS loader. Run via tsx:
      npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts
  - In build mode, tsup is required: pnpm add -D tsup
  - In start mode, the bundled handler file must be a JS/CJS module whose "handler"
    export (or default export) is a function: (event, context) => Promise<result>.
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
  return arg === 'dev' || arg === 'build' || arg === 'start';
}

function parseDevArgs(argv: string[]): DevArgs {
  const options: Omit<LocalServerOptions, 'init' | 'onShutdown'> = {};
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

  return { appPath, options };
}

function parseStartArgs(argv: string[]): StartArgs {
  // start shares the same option set as dev (port, host, signals, etc.)
  // but the positional argument is a bundled handler file, not an Express app.
  const result = parseDevArgs(argv);
  return { handlerPath: result.appPath, options: result.options };
}

function parseBuildArgs(argv: string[]): BuildArgs {
  let appPath: string | undefined;
  const external: string[] = [];
  const result: Omit<BuildArgs, 'appPath'> = {
    initPath: undefined,
    outDir: 'dist',
    outName: 'handler',
    format: 'cjs',
    target: 'node20',
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
    if (first === 'start') {
      return { subcommand: 'start', start: parseStartArgs(rest) };
    }
    return { subcommand: 'build', build: parseBuildArgs(rest) };
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
// build (build mode)
// ---------------------------------------------------------------------------

const TEMP_ENTRY_FILENAME = '.express-runtime-build-entry.ts';

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
 * Bundle an Express app as a serverless handler using tsup. Writes a temporary
 * entry file to the user's cwd (for node_modules resolution), runs tsup, then
 * cleans up.
 *
 * `express` is always external; additional externals can be passed via
 * `BuildArgs.external`. `tsup` must be installed (lazy `import('tsup')`).
 */
export async function buildServerless(args: BuildArgs): Promise<void> {
  let tsupModule: typeof import('tsup');
  try {
    tsupModule = await import('tsup');
  } catch {
    throw new Error('`tsup` is required for the `build` command. Install it as a dev dependency:\n  pnpm add -D tsup');
  }

  const { build } = tsupModule;
  const entryContent = generateServerlessEntry(args.appPath, args.initPath);
  const tempEntryPath = pathResolve(process.cwd(), TEMP_ENTRY_FILENAME);
  writeFileSync(tempEntryPath, entryContent, 'utf8');

  try {
    await build({
      config: false, // Don't auto-load tsup.config.ts from cwd
      entry: { [args.outName]: tempEntryPath },
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

// ---------------------------------------------------------------------------
// start (run a bundled serverless handler locally)
// ---------------------------------------------------------------------------

/**
 * A platform-agnostic serverless handler function (the output of `build`).
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

/**
 * Read the raw request body into a Buffer. Since `createExpressApp` is called
 * with `json: false, urlencoded: false` in the adapter, no body parser has
 * consumed the stream yet.
 */
function collectBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
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
        res.setHeader(key, Array.isArray(value) ? value.join(',') : value);
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
 */
export function createServerlessAdapterApp(handler: GenericHandler): Express {
  return createExpressApp({
    json: false,
    urlencoded: false,
    finalize: (app) => {
      // Use middleware (not app.all) to catch all routes — Express 5's
      // path-to-regexp rejects the '*' wildcard.
      app.use(async (req: Request, res: Response) => {
        const body = await collectBody(req);
        const event = toServerlessEvent(req.method, req.url, req.headers, body);
        const result = await handler(event, {});
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
