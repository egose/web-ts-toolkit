import {
  parseArgs as parseExpressRuntimeArgs,
  runBuildEntryCommand,
  runDevCommand,
  runCliCommand as runExpressRuntimeCliCommand,
} from '@web-ts-toolkit/express-runtime/cli';
import { loadAccessRouterRuntime } from './index';
import {
  CLI_VERSION,
  generateRuntimeEntryFromConfig,
  generateServerlessEntryFromConfig,
  printHelp,
  resolveCliInvocation,
} from './cli-utils';

async function runConfigAwareCommand(invocation: NonNullable<ReturnType<typeof resolveCliInvocation>>): Promise<void> {
  const parsedArgs = parseExpressRuntimeArgs([
    invocation.subcommand,
    invocation.targetPath,
    ...invocation.passthroughArgs,
  ]);
  if (!parsedArgs) {
    return;
  }

  if (parsedArgs.subcommand === 'dev') {
    await runDevCommand(parsedArgs.dev, {
      load: loadAccessRouterRuntime,
      start: (runtime, options) => {
        runtime.startLocalServer(options);
      },
    });
    return;
  }

  if (parsedArgs.subcommand === 'build') {
    await runBuildEntryCommand(parsedArgs.build, {
      generateEntry: (configPath) => generateRuntimeEntryFromConfig(configPath),
      tempEntryFilename: '.access-router-runtime-build-entry.ts',
      allowInit: false,
      initErrorMessage: 'build manages the init hook automatically. Remove --init.',
    });
    return;
  }

  if (parsedArgs.subcommand === 'build-serverless') {
    await runBuildEntryCommand(parsedArgs.buildServerless, {
      generateEntry: (configPath) => generateServerlessEntryFromConfig(configPath),
      tempEntryFilename: '.access-router-runtime-build-serverless-entry.ts',
      allowInit: false,
      initErrorMessage: 'build-serverless manages the init hook automatically. Remove --init.',
    });
    return;
  }

  throw new Error(`Unexpected config-aware subcommand: ${parsedArgs.subcommand}`);
}

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

  if (invocation.configAware) {
    await runConfigAwareCommand(invocation);
    return;
  }

  const parsedArgs = parseExpressRuntimeArgs(argv);
  if (!parsedArgs) {
    return;
  }

  await runExpressRuntimeCliCommand(parsedArgs);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
