import { loadApp, parseArgs } from './cli-utils';
import { startLocalServer } from './index';

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (!parsedArgs) {
    return;
  }

  const app = await loadApp(parsedArgs.appPath);
  // CLI runs the server with exit-after-shutdown so SIGINT/SIGTERM cleanly exit.
  startLocalServer(app, { ...parsedArgs.options, exitAfterShutdown: true });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
