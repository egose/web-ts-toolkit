import { resolve as pathResolve } from 'node:path';
import type { BuildArgs, DevArgs } from '@web-ts-toolkit/express-runtime/cli';
import type { AccessRouterRuntimeConfig } from './index';

/**
 * Version placeholder rewritten at publish time by `@repo-toolkit/publish-package`.
 */
export const CLI_VERSION = '0.0.0-PLACEHOLDER';

export type AccessRouterRuntimeSubcommand = 'dev' | 'build' | 'start' | 'build-serverless' | 'start-serverless';

export interface ResolvedCliInvocation {
  subcommand: AccessRouterRuntimeSubcommand;
  targetPath: string;
  passthroughArgs: string[];
  configAware: boolean;
}

function isSubcommand(value: string): value is AccessRouterRuntimeSubcommand {
  return (
    value === 'dev' ||
    value === 'build' ||
    value === 'start' ||
    value === 'build-serverless' ||
    value === 'start-serverless'
  );
}

function isFlag(value: string): boolean {
  return value === '-h' || value === '--help' || value === '-V' || value === '--version';
}

export function printHelp(): void {
  console.log(`wtt-access-router-runtime

Generate config-driven access-router resource APIs on top of shared express-runtime CLI helpers.

Usage:
  wtt-access-router-runtime <command> <config-or-module> [options]
  wtt-access-router-runtime <config-file> [options]   (alias for dev)

Commands:
  dev                           Load an access-router-runtime config and run it locally
  build                         Bundle an access-router-runtime config as a local app module
  start                         Pass through to express-runtime start behavior
  build-serverless              Bundle an access-router-runtime config as a serverless handler
  start-serverless              Pass through to express-runtime start-serverless behavior

Config-aware commands:
  dev <config-file>             Supports TypeScript config files directly
  build <config-file>           Bundles the config-driven runtime as a local app module
  build-serverless <config-file>

Pass-through commands:
  start <app-module>            Same arguments as wtt-express-runtime start
  start-serverless <handler-module>

Examples:
  wtt-access-router-runtime ./src/access-router.config.ts --port 3000
  wtt-access-router-runtime ./src/access-router.config.ts --watch
  wtt-access-router-runtime ./src/access-router.config.ts --tsconfig ./tsconfig.json --watch
  wtt-access-router-runtime build ./src/access-router.config.ts --out-dir dist
  wtt-access-router-runtime build-serverless ./src/access-router.config.ts --out-dir netlify/functions
  wtt-access-router-runtime start ./dist/app.js --port 3000
  wtt-access-router-runtime start-serverless ./dist/handler.js --port 9000

Notes:
  - dev, build, and build-serverless expect a config module whose default export is a config object.
  - build and build-serverless manage runtime init automatically; do not pass --init yourself.
  - Remaining flags follow the same semantics as wtt-express-runtime.
  - --tsconfig is respected for config loading and build bundling on config-aware commands.
  - dev config may set watch defaults via { dev: { watch, ext, delay } }.
  - Config watch values do not enable watch mode by themselves; pass --watch to use them.
  - Bare --watch uses config.dev.watch when present, otherwise defaults to .
`);
}

function hasFlag(argv: string[], flag: '--watch' | '--ext' | '--delay'): boolean {
  return argv.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function readTsconfigPath(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--tsconfig') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for argument: --tsconfig');
      }
      return value;
    }

    if (arg.startsWith('--tsconfig=')) {
      return arg.slice('--tsconfig='.length);
    }
  }

  return undefined;
}

function normalizeStringList(value: ReadonlyArray<string> | undefined, field: 'watch' | 'ext'): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Config field "dev.${field}" must be an array of strings.`);
  }

  return [...value];
}

function normalizeDelay(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error('Config field "dev.delay" must be a non-negative number.');
  }

  return value;
}

function readDevConfig(config: AccessRouterRuntimeConfig): { watch?: string[]; ext?: string[]; delay?: number } {
  return {
    watch: normalizeStringList(config.dev?.watch, 'watch'),
    ext: normalizeStringList(config.dev?.ext, 'ext'),
    delay: normalizeDelay(config.dev?.delay),
  };
}

export function buildConfigAwareDevArgv(
  configPath: string,
  passthroughArgs: string[],
  config: AccessRouterRuntimeConfig,
): string[] {
  const argv = [...passthroughArgs];
  const devConfig = readDevConfig(config);
  const defaultWatch = devConfig.watch && devConfig.watch.length > 0 ? devConfig.watch : ['.'];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--watch') {
      continue;
    }

    const nextArg = argv[index + 1];
    if (nextArg !== undefined && !nextArg.startsWith('--')) {
      continue;
    }

    argv[index] = `--watch=${defaultWatch.join(',')}`;
  }

  return ['dev', configPath, ...argv];
}

export function applyConfigDevDefaults(
  args: DevArgs,
  config: AccessRouterRuntimeConfig,
  passthroughArgs: string[],
): DevArgs {
  const devConfig = readDevConfig(config);

  return {
    ...args,
    watchExt: !hasFlag(passthroughArgs, '--ext') && devConfig.ext ? devConfig.ext : args.watchExt,
    watchDelay:
      !hasFlag(passthroughArgs, '--delay') && devConfig.delay !== undefined ? devConfig.delay : args.watchDelay,
  };
}

export function resolveCliInvocation(argv: string[]): ResolvedCliInvocation | null {
  if (argv.length === 0 || argv.every(isFlag)) {
    return null;
  }

  const [firstArg, ...restArgs] = argv;
  const subcommand = isSubcommand(firstArg) ? firstArg : 'dev';
  const targetPath = isSubcommand(firstArg) ? restArgs[0] : firstArg;
  const passthroughArgs = isSubcommand(firstArg) ? restArgs.slice(1) : restArgs;

  if (!targetPath || isFlag(targetPath)) {
    throw new Error(
      `Missing required ${subcommand === 'start-serverless' ? 'handler module' : 'config or app module'} path.`,
    );
  }

  return {
    subcommand,
    targetPath,
    passthroughArgs,
    configAware: subcommand === 'dev' || subcommand === 'build' || subcommand === 'build-serverless',
  };
}

export function assertNoManualInit(subcommand: 'build' | 'build-serverless', args: BuildArgs): void {
  if (args.initPath) {
    throw new Error(`${subcommand} manages the init hook automatically. Remove --init.`);
  }
}

export function generateRuntimeEntryFromConfig(configPath: string, tsconfigPath?: string): string {
  const absoluteConfigPath = pathResolve(process.cwd(), configPath);
  const absoluteTsconfigPath = tsconfigPath ? pathResolve(process.cwd(), tsconfigPath) : undefined;
  const configLoadArgs = absoluteTsconfigPath
    ? `${JSON.stringify(absoluteConfigPath)}, { tsconfigPath: ${JSON.stringify(absoluteTsconfigPath)} }`
    : JSON.stringify(absoluteConfigPath);

  return [
    '// Auto-generated by @web-ts-toolkit/access-router-runtime CLI - do not edit.',
    `import { createAccessRouterRuntime, loadAccessRouterRuntimeConfigSync } from '@web-ts-toolkit/access-router-runtime';`,
    `const config = loadAccessRouterRuntimeConfigSync(${configLoadArgs});`,
    'const runtimeBundle = createAccessRouterRuntime(config);',
    'let signalsRegistered = false;',
    'function registerSignals() {',
    '  if (signalsRegistered) return;',
    '  signalsRegistered = true;',
    '  const shutdown = () => { void runtimeBundle.shutdown(); };',
    "  process.once('SIGINT', shutdown);",
    "  process.once('SIGTERM', shutdown);",
    '}',
    'registerSignals();',
    'const app = runtimeBundle.app;',
    'export default app;',
    'export { app };',
    'export async function init() {',
    '  await runtimeBundle.init();',
    '}',
    '',
  ].join('\n');
}

export function generateServerlessEntryFromConfig(configPath: string, tsconfigPath?: string): string {
  const absoluteConfigPath = pathResolve(process.cwd(), configPath);
  const absoluteTsconfigPath = tsconfigPath ? pathResolve(process.cwd(), tsconfigPath) : undefined;
  const configLoadArgs = absoluteTsconfigPath
    ? `${JSON.stringify(absoluteConfigPath)}, { tsconfigPath: ${JSON.stringify(absoluteTsconfigPath)} }`
    : JSON.stringify(absoluteConfigPath);

  return [
    '// Auto-generated by @web-ts-toolkit/access-router-runtime CLI - do not edit.',
    `import { createAccessRouterRuntimeServerlessHandler, loadAccessRouterRuntimeConfigSync } from '@web-ts-toolkit/access-router-runtime';`,
    `const config = loadAccessRouterRuntimeConfigSync(${configLoadArgs});`,
    'export const handler = createAccessRouterRuntimeServerlessHandler(config);',
    '',
  ].join('\n');
}
