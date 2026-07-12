import {
  buildServerless,
  createServerlessAdapterApp,
  loadApp,
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
    const handler = await loadHandler(start.handlerPath);
    const app = createServerlessAdapterApp(handler);
    startLocalServer(app, { ...start.options, exitAfterShutdown: true });
  } else {
    await buildServerless(parsedArgs.build);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
