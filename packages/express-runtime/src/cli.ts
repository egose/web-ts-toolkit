import { parseArgs, runCliCommand } from './cli-api';

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (!parsedArgs) {
    return;
  }

  await runCliCommand(parsedArgs);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
