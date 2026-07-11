import { buildServerless, createServerlessAdapterApp, loadApp, loadHandler, parseArgs } from './cli-utils';
import { startLocalServer } from './index';

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (!parsedArgs) {
    return;
  }

  if (parsedArgs.subcommand === 'dev') {
    const app = await loadApp(parsedArgs.dev.appPath);
    startLocalServer(app, { ...parsedArgs.dev.options, exitAfterShutdown: true });
  } else if (parsedArgs.subcommand === 'start') {
    const handler = await loadHandler(parsedArgs.start.handlerPath);
    const app = createServerlessAdapterApp(handler);
    startLocalServer(app, { ...parsedArgs.start.options, exitAfterShutdown: true });
  } else {
    await buildServerless(parsedArgs.build);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
