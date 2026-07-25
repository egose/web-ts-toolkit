import {
  buildRuntime,
  buildServerless,
  createServerlessAdapterApp,
  loadApp,
  loadBuiltApp,
  loadEnvFiles,
  loadHandler,
  parseArgs,
  preloadModules,
  runWithWatch,
} from './cli-utils';
import { startLocalServer } from './index';

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (!parsedArgs) {
    return;
  }

  if (parsedArgs.subcommand === 'dev') {
    const { dev } = parsedArgs;

    // Watch mode: fork a child and restart on file changes.
    if (dev.watch.length > 0) {
      runWithWatch(dev);
      return;
    }

    // Normal mode: load env, preload modules, then start the server.
    if (dev.env.length > 0) {
      loadEnvFiles(dev.env);
    }
    await preloadModules(dev.require);
    const app = await loadApp(dev.appPath);
    startLocalServer(app, { ...dev.options, exitAfterShutdown: true });
  } else if (parsedArgs.subcommand === 'start') {
    const { start } = parsedArgs;

    if (start.env.length > 0) {
      loadEnvFiles(start.env);
    }
    await preloadModules(start.require);
    const { app, init } = await loadBuiltApp(start.appPath);
    startLocalServer(app, { ...start.options, init, exitAfterShutdown: true });
  } else if (parsedArgs.subcommand === 'build') {
    await buildRuntime(parsedArgs.build);
  } else if (parsedArgs.subcommand === 'start-serverless') {
    const { startServerless } = parsedArgs;

    if (startServerless.env.length > 0) {
      loadEnvFiles(startServerless.env);
    }
    await preloadModules(startServerless.require);
    const handler = await loadHandler(startServerless.handlerPath);
    const app = createServerlessAdapterApp(handler);
    startLocalServer(app, { ...startServerless.options, exitAfterShutdown: true });
  } else {
    await buildServerless(parsedArgs.buildServerless);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
