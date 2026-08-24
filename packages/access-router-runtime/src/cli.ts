import {
  parseArgs as parseExpressRuntimeArgs,
  runBuildEntryCommand,
  runDevCommand,
  runCliCommand as runExpressRuntimeCliCommand,
  type RuntimeCliCommand,
} from '@web-ts-toolkit/express-runtime/cli';
import { loadAccessRouterRuntime } from './index';
import {
  generateRuntimeEntryFromConfig,
  generateServerlessEntryFromConfig,
  getCliVersion,
  normalizeAccessRouterRuntimeArgv,
  printHelp,
} from './cli-utils';

async function runConfigAwareCommand(parsedArgs: RuntimeCliCommand): Promise<void> {
  if (parsedArgs.subcommand === 'dev') {
    await runDevCommand(parsedArgs.dev, {
      load: (configPath) => loadAccessRouterRuntime(configPath, { tsconfigPath: parsedArgs.dev.tsconfigPath }),
      start: (runtime, options) => {
        return runtime.startLocalServer(options);
      },
    });
    return;
  }

  if (parsedArgs.subcommand === 'build') {
    await runBuildEntryCommand(parsedArgs.build, {
      generateEntry: (configPath) => generateRuntimeEntryFromConfig(configPath, parsedArgs.build.tsconfigPath),
      allowInit: false,
      initErrorMessage: 'build manages the init hook automatically. Remove --init.',
    });
    return;
  }

  if (parsedArgs.subcommand === 'build-serverless') {
    await runBuildEntryCommand(parsedArgs.buildServerless, {
      generateEntry: (configPath) =>
        generateServerlessEntryFromConfig(configPath, parsedArgs.buildServerless.tsconfigPath),
      allowInit: false,
      initErrorMessage: 'build-serverless manages the init hook automatically. Remove --init.',
    });
    return;
  }

  throw new Error(`Unexpected config-aware subcommand: ${parsedArgs.subcommand}`);
}

function optionArgs(argv: string[]): string[] {
  const terminator = argv.indexOf('--');
  return terminator === -1 ? argv : argv.slice(0, terminator);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const globalArgs = optionArgs(argv);

  if (globalArgs.includes('-V') || globalArgs.includes('--version')) {
    console.log(getCliVersion());
    return;
  }

  if (argv.length === 0 || globalArgs.includes('-h') || globalArgs.includes('--help')) {
    printHelp();
    return;
  }

  const parsedArgs = parseExpressRuntimeArgs(normalizeAccessRouterRuntimeArgv(argv));
  if (!parsedArgs) {
    return;
  }

  if (
    parsedArgs.subcommand === 'dev' ||
    parsedArgs.subcommand === 'build' ||
    parsedArgs.subcommand === 'build-serverless'
  ) {
    await runConfigAwareCommand(parsedArgs);
    return;
  }

  await runExpressRuntimeCliCommand(parsedArgs);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
