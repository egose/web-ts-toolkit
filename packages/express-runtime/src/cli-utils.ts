import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import type { Express } from 'express';
import type { LocalServerOptions } from './index';

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

export interface ParsedArgs {
  appPath: string;
  options: Omit<LocalServerOptions, 'init' | 'onShutdown'>;
}

export function printHelp(): void {
  console.log(`web-ts-toolkit-express-runtime

Run an Express app locally with http.createServer + graceful shutdown.

Usage:
  web-ts-toolkit-express-runtime <app-module> [options]

Arguments:
  <app-module>                  Module path whose default export is an Express
                                app or an async function returning one.

Options:
  --port <number>               Port or named pipe (default: process.env.PORT or 8080)
  --host <hostname>             Hostname to bind (default: process.env.HOST or 0.0.0.0)
  --no-signals                  Disable SIGINT/SIGTERM handler registration
  --shutdown-timeout <ms>       Max ms to wait for in-flight requests (default: 5000)
  -V, --version                 Show version
  -h, --help                    Show this help message

Examples:
  web-ts-toolkit-express-runtime ./dist/app.js
  web-ts-toolkit-express-runtime ./dist/app.js --port 3000 --host localhost

Notes:
  - This CLI evaluates arbitrary code from <app-module> in the current process.
  - TypeScript app modules require a TS loader. Either run via tsx:
      npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js ./src/app.ts
    or precompile app modules to JS and point the CLI at the build output.
  - Init logic (DB connections, etc.): add at the top level of your app module
    since the CLI does not expose an init hook.
`);
}

function isVersion(arg: string): boolean {
  return arg === '-V' || arg === '--version';
}

function isHelp(arg: string): boolean {
  return arg === '-h' || arg === '--help';
}

export function parseArgs(argv: string[]): ParsedArgs | null {
  const options: Omit<LocalServerOptions, 'init' | 'onShutdown'> = {};
  let appPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (isHelp(arg)) {
      printHelp();
      return null;
    }

    if (isVersion(arg)) {
      console.log(CLI_VERSION);
      return null;
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

/**
 * Type-guard: an Express app is a function with `listen` and `use` methods.
 */
export function isExpressApp(x: unknown): x is Express {
  // An Express app is itself a function (request handler) that also carries
  // `listen` and `use` methods, so accept both object and function shapes.
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
