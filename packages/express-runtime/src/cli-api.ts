import { startLocalServer, type Express } from './index';
import {
  CLI_VERSION,
  DEFAULT_ADAPTER_MAX_BODY_BYTES,
  TEMP_BUILD_ENTRY_FILENAME,
  TEMP_SERVERLESS_ENTRY_FILENAME,
  applyServerlessResult,
  buildChildArgs,
  buildRuntime,
  buildServerless,
  buildBundleFromEntryContent,
  collectBody,
  createServerlessAdapterApp,
  extractExport,
  generateRuntimeEntry,
  generateServerlessEntry,
  isExpressApp,
  loadApp,
  loadBuiltApp,
  loadEnvFiles,
  loadHandler,
  parseArgs,
  parseEnvFile,
  preloadModules,
  printHelp,
  readValue,
  resolveExport,
  runWithWatch,
  toServerlessEvent,
  validateMaxBodyBytes,
  validateOutDirForClean,
  type ApiGatewayRestEvent,
  type BuildArgs,
  type BuildEntryContentArgs,
  type DevArgs,
  type GenericHandler,
  type ParsedArgs,
  type RuntimeModuleInit,
  type ServerlessResult,
  type ServerlessAdapterOptions,
  type StartArgs,
  type StartServerlessArgs,
  type Subcommand,
  type WatchSupervisorController,
} from './cli-utils';

export type RuntimeCliCommand = Exclude<ParsedArgs, null>;

export interface DevCommandRunner<TLoaded> {
  load: (appPath: string) => Promise<TLoaded> | TLoaded;
  start: (loaded: TLoaded, options: DevArgs['options'] & { exitAfterShutdown: true }) => void;
  watch?: (args: DevArgs) => void | WatchSupervisorController;
}

export interface BuildEntryCommandOptions {
  generateEntry: (appPath: string, initPath?: string) => string;
  /** @deprecated staging is now uniquely created; this is ignored if provided */
  tempEntryFilename?: string;
  allowInit?: boolean;
  initErrorMessage?: string;
}

export async function runDevCommand<TLoaded>(args: DevArgs, runner: DevCommandRunner<TLoaded>): Promise<void> {
  if (args.watch.length > 0) {
    (runner.watch ?? runWithWatch)(args);
    return;
  }

  if (args.env.length > 0) {
    loadEnvFiles(args.env);
  }
  await preloadModules(args.require);

  const loaded = await runner.load(args.appPath);
  runner.start(loaded, { ...args.options, exitAfterShutdown: true });
}

export async function runExpressDevCommand(args: DevArgs): Promise<void> {
  await runDevCommand<Express>(args, {
    load: loadApp,
    start: (app, options) => {
      startLocalServer(app, options);
    },
  });
}

export async function runBuildEntryCommand(args: BuildArgs, options: BuildEntryCommandOptions): Promise<void> {
  if (options.allowInit === false && args.initPath) {
    throw new Error(options.initErrorMessage ?? 'This build command manages init automatically. Remove --init.');
  }
  // Validate outDir with input awareness before staging, so we fail before touching filesystem
  const { validateOutDirForClean } = await import('./cli-utils');
  validateOutDirForClean(args.outDir, args.clean, args.appPath, args.initPath);

  await buildBundleFromEntryContent({
    entryContent: options.generateEntry(args.appPath, args.initPath),
    tsconfigPath: args.tsconfigPath,
    outDir: args.outDir,
    outName: args.outName,
    format: args.format,
    target: args.target,
    external: args.external,
    clean: args.clean,
  });
}

export async function runCliCommand(parsedArgs: RuntimeCliCommand): Promise<void> {
  if (parsedArgs.subcommand === 'dev') {
    await runExpressDevCommand(parsedArgs.dev);
    return;
  }

  if (parsedArgs.subcommand === 'start') {
    const { start } = parsedArgs;

    if (start.env.length > 0) {
      loadEnvFiles(start.env);
    }
    await preloadModules(start.require);
    const { app, init } = await loadBuiltApp(start.appPath);
    startLocalServer(app, {
      ...start.options,
      init: init
        ? async () => {
            await init();
          }
        : undefined,
      exitAfterShutdown: true,
    });
    return;
  }

  if (parsedArgs.subcommand === 'build') {
    await buildRuntime(parsedArgs.build);
    return;
  }

  if (parsedArgs.subcommand === 'start-serverless') {
    const { startServerless } = parsedArgs;

    if (startServerless.env.length > 0) {
      loadEnvFiles(startServerless.env);
    }
    await preloadModules(startServerless.require);
    const handler = await loadHandler(startServerless.handlerPath);
    const app = createServerlessAdapterApp(handler, { maxBodyBytes: startServerless.maxBodyBytes });
    startLocalServer(app, { ...startServerless.options, exitAfterShutdown: true });
    return;
  }

  await buildServerless(parsedArgs.buildServerless);
}

export {
  CLI_VERSION,
  DEFAULT_ADAPTER_MAX_BODY_BYTES,
  TEMP_BUILD_ENTRY_FILENAME,
  TEMP_SERVERLESS_ENTRY_FILENAME,
  applyServerlessResult,
  buildChildArgs,
  buildRuntime,
  buildServerless,
  buildBundleFromEntryContent,
  collectBody,
  createServerlessAdapterApp,
  extractExport,
  generateRuntimeEntry,
  generateServerlessEntry,
  isExpressApp,
  loadApp,
  loadBuiltApp,
  loadEnvFiles,
  loadHandler,
  parseArgs,
  parseEnvFile,
  preloadModules,
  printHelp,
  readValue,
  resolveExport,
  runWithWatch,
  toServerlessEvent,
  validateMaxBodyBytes,
  validateOutDirForClean,
};

export type {
  ApiGatewayRestEvent,
  BuildArgs,
  BuildEntryContentArgs,
  DevArgs,
  GenericHandler,
  ParsedArgs,
  RuntimeModuleInit,
  ServerlessAdapterOptions,
  ServerlessResult,
  StartArgs,
  StartServerlessArgs,
  Subcommand,
};
