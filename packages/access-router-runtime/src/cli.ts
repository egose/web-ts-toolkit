import {
  buildBundleFromEntryContent,
  loadEnvFiles,
  parseArgs as parseExpressRuntimeArgs,
  preloadModules,
  runCliCommand as runExpressRuntimeCliCommand,
  runWithWatch,
} from '@web-ts-toolkit/express-runtime/cli';
import { loadAccessRouterRuntime } from './index';
import {
  CLI_VERSION,
  assertNoManualInit,
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
    const { dev } = parsedArgs;

    if (dev.watch.length > 0) {
      runWithWatch(dev);
      return;
    }

    if (dev.env.length > 0) {
      loadEnvFiles(dev.env);
    }
    await preloadModules(dev.require);
    const runtime = loadAccessRouterRuntime(dev.appPath);
    runtime.startLocalServer({ ...dev.options, exitAfterShutdown: true });
    return;
  }

  if (parsedArgs.subcommand === 'build') {
    assertNoManualInit('build', parsedArgs.build);
    await buildBundleFromEntryContent({
      entryContent: generateRuntimeEntryFromConfig(parsedArgs.build.appPath),
      tempEntryFilename: '.access-router-runtime-build-entry.ts',
      outDir: parsedArgs.build.outDir,
      outName: parsedArgs.build.outName,
      format: parsedArgs.build.format,
      target: parsedArgs.build.target,
      external: parsedArgs.build.external,
      clean: parsedArgs.build.clean,
    });
    return;
  }

  if (parsedArgs.subcommand === 'build-serverless') {
    assertNoManualInit('build-serverless', parsedArgs.buildServerless);
    await buildBundleFromEntryContent({
      entryContent: generateServerlessEntryFromConfig(parsedArgs.buildServerless.appPath),
      tempEntryFilename: '.access-router-runtime-build-serverless-entry.ts',
      outDir: parsedArgs.buildServerless.outDir,
      outName: parsedArgs.buildServerless.outName,
      format: parsedArgs.buildServerless.format,
      target: parsedArgs.buildServerless.target,
      external: parsedArgs.buildServerless.external,
      clean: parsedArgs.buildServerless.clean,
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
