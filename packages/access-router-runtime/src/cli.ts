import {
  CLI_VERSION,
  buildDelegatedArgs,
  createGeneratedRuntimeFiles,
  printHelp,
  resolveCliInvocation,
  runDelegatedCommand,
} from './cli-utils';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes('-V') || argv.includes('--version')) {
    console.log(CLI_VERSION);
    return;
  }

  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return;
  }

  const invocation = resolveCliInvocation(argv);
  if (!invocation) {
    printHelp();
    return;
  }

  let generatedFiles: ReturnType<typeof createGeneratedRuntimeFiles> | undefined;

  try {
    if (invocation.configAware) {
      generatedFiles = createGeneratedRuntimeFiles(invocation.targetPath);
    }

    const exitCode = await runDelegatedCommand(buildDelegatedArgs(invocation, generatedFiles));
    process.exitCode = exitCode;
  } finally {
    generatedFiles?.cleanup();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
