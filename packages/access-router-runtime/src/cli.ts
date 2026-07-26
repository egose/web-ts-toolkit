import {
  parseArgs as parseExpressRuntimeArgs,
  runBuildEntryCommand,
  runDevCommand,
  runCliCommand as runExpressRuntimeCliCommand,
} from '@web-ts-toolkit/express-runtime/cli';
import { createAccessRouterRuntime, loadAccessRouterRuntime, loadAccessRouterRuntimeConfigSync } from './index';
import {
  applyConfigDevDefaults,
  buildConfigAwareDevArgv,
  CLI_VERSION,
  generateRuntimeEntryFromConfig,
  generateServerlessEntryFromConfig,
  printHelp,
  readTsconfigPath,
  resolveCliInvocation,
} from './cli-utils';

async function runConfigAwareCommand(invocation: NonNullable<ReturnType<typeof resolveCliInvocation>>): Promise<void> {
  const tsconfigPath = invocation.configAware ? readTsconfigPath(invocation.passthroughArgs) : undefined;
  const config =
    invocation.subcommand === 'dev'
      ? loadAccessRouterRuntimeConfigSync(invocation.targetPath, { tsconfigPath })
      : undefined;
  const parsedArgs = parseExpressRuntimeArgs(
    invocation.subcommand === 'dev' && config
      ? buildConfigAwareDevArgv(invocation.targetPath, invocation.passthroughArgs, config)
      : [invocation.subcommand, invocation.targetPath, ...invocation.passthroughArgs],
  );
  if (!parsedArgs) {
    return;
  }

  if (parsedArgs.subcommand === 'dev') {
    await runDevCommand(
      config ? applyConfigDevDefaults(parsedArgs.dev, config, invocation.passthroughArgs) : parsedArgs.dev,
      {
        load: config
          ? () => createAccessRouterRuntime(config)
          : (configPath) => loadAccessRouterRuntime(configPath, { tsconfigPath }),
        start: (runtime, options) => {
          runtime.startLocalServer(options);
        },
      },
    );
    return;
  }

  if (parsedArgs.subcommand === 'build') {
    await runBuildEntryCommand(parsedArgs.build, {
      generateEntry: (configPath) => generateRuntimeEntryFromConfig(configPath, parsedArgs.build.tsconfigPath),
      tempEntryFilename: '.access-router-runtime-build-entry.ts',
      allowInit: false,
      initErrorMessage: 'build manages the init hook automatically. Remove --init.',
    });
    return;
  }

  if (parsedArgs.subcommand === 'build-serverless') {
    await runBuildEntryCommand(parsedArgs.buildServerless, {
      generateEntry: (configPath) =>
        generateServerlessEntryFromConfig(configPath, parsedArgs.buildServerless.tsconfigPath),
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
