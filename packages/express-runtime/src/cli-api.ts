import { startLocalServer } from './index';
import {
  CLI_VERSION,
  applyServerlessResult,
  buildChildArgs,
  buildRuntime,
  buildServerless,
  buildBundleFromEntryContent,
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
  type BuildArgs,
  type BuildEntryContentArgs,
  type DevArgs,
  type GenericHandler,
  type ParsedArgs,
  type RuntimeModuleInit,
  type ServerlessResult,
  type StartArgs,
  type StartServerlessArgs,
  type Subcommand,
} from './cli-utils';

export type RuntimeCliCommand = Exclude<ParsedArgs, null>;

export async function runCliCommand(parsedArgs: RuntimeCliCommand): Promise<void> {
  if (parsedArgs.subcommand === 'dev') {
    const { dev } = parsedArgs;

    if (dev.watch.length > 0) {
      runWithWatch(dev);
      return;
    }

    if (dev.env.length > 0) {
      loadEnvFiles(dev.env);
    }
    await preloadModules(dev.require);
    const app = await loadApp(dev.appPath);
    startLocalServer(app, { ...dev.options, exitAfterShutdown: true });
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
    const app = createServerlessAdapterApp(handler);
    startLocalServer(app, { ...startServerless.options, exitAfterShutdown: true });
    return;
  }

  await buildServerless(parsedArgs.buildServerless);
}

export {
  CLI_VERSION,
  applyServerlessResult,
  buildChildArgs,
  buildRuntime,
  buildServerless,
  buildBundleFromEntryContent,
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
};

export type {
  BuildArgs,
  BuildEntryContentArgs,
  DevArgs,
  GenericHandler,
  ParsedArgs,
  RuntimeModuleInit,
  ServerlessResult,
  StartArgs,
  StartServerlessArgs,
  Subcommand,
};
