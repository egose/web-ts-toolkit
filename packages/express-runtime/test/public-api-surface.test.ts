import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

const packageRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const rootTypeExportNames = [
  'ErrorRequestHandler',
  'Express',
  'ExpressAppOptions',
  'LocalServer',
  'LocalServerOptions',
  'LocalServerState',
  'Logger',
  'RawServerlessHttpOptions',
  'RequestHandler',
  'RouterMount',
  'ServerlessHandler',
  'ServerlessHandlerOptions',
  'ServerlessHttpOptions',
  'ServerlessRequest',
  'ServerlessRequestHook',
  'ServerlessResponse',
  'ServerlessResponseHook',
  'createExpressApp',
  'createServerlessHandler',
  'defaultRequestHook',
  'normalizePort',
  'parsePortValue',
  'startLocalServer',
  'validateFiniteInteger',
];

const rootRuntimeExportNames = [
  'createExpressApp',
  'createServerlessHandler',
  'defaultRequestHook',
  'normalizePort',
  'parsePortValue',
  'startLocalServer',
  'validateFiniteInteger',
];

const cliTypeExportNames = [
  'ApiGatewayRestEvent',
  'BuildArgs',
  'BuildEntryCommandOptions',
  'BuildEntryContentArgs',
  'CLI_VERSION',
  'DEFAULT_ADAPTER_MAX_BODY_BYTES',
  'DevArgs',
  'DevCommandRunner',
  'GenericHandler',
  'ParsedArgs',
  'RuntimeCliCommand',
  'RuntimeModuleInit',
  'RuntimeModuleShutdown',
  'ServerlessAdapterOptions',
  'ServerlessResult',
  'StartArgs',
  'StartServerlessArgs',
  'Subcommand',
  'TEMP_BUILD_ENTRY_FILENAME',
  'TEMP_SERVERLESS_ENTRY_FILENAME',
  'applyServerlessResult',
  'buildBundleFromEntryContent',
  'buildChildArgs',
  'buildRuntime',
  'buildServerless',
  'collectBody',
  'createServerlessAdapterApp',
  'extractExport',
  'generateRuntimeEntry',
  'generateServerlessEntry',
  'isExpressApp',
  'loadApp',
  'loadBuiltApp',
  'loadEnvFiles',
  'loadHandler',
  'parseArgs',
  'parseEnvFile',
  'preloadModules',
  'printHelp',
  'readValue',
  'resolveExport',
  'runBuildEntryCommand',
  'runCliCommand',
  'runDevCommand',
  'runExpressDevCommand',
  'runWithWatch',
  'toServerlessEvent',
  'validateMaxBodyBytes',
  'validateOutDirForClean',
];

const cliRuntimeExportNames = cliTypeExportNames.filter(
  (name) =>
    ![
      'ApiGatewayRestEvent',
      'BuildArgs',
      'BuildEntryCommandOptions',
      'BuildEntryContentArgs',
      'DevArgs',
      'DevCommandRunner',
      'GenericHandler',
      'ParsedArgs',
      'RuntimeCliCommand',
      'RuntimeModuleInit',
      'RuntimeModuleShutdown',
      'ServerlessAdapterOptions',
      'ServerlessResult',
      'StartArgs',
      'StartServerlessArgs',
      'Subcommand',
    ].includes(name),
);

function getModuleExportNames(entryFile: string): string[] {
  const configPath = path.resolve(packageRoot, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot);
  const program = ts.createProgram({
    rootNames: [path.resolve(packageRoot, entryFile)],
    options: parsed.options,
  });
  const sourceFile = program.getSourceFile(path.resolve(packageRoot, entryFile));
  if (!sourceFile) {
    throw new Error(`Unable to load source file: ${entryFile}`);
  }

  const symbol = program.getTypeChecker().getSymbolAtLocation(sourceFile);
  if (!symbol) {
    throw new Error(`Unable to resolve module symbol: ${entryFile}`);
  }

  return program
    .getTypeChecker()
    .getExportsOfModule(symbol)
    .map((exported) => exported.name)
    .sort();
}

describe('public API export surface', () => {
  it('keeps the root package type exports exact', () => {
    expect(getModuleExportNames('src/index.ts')).toEqual(rootTypeExportNames);
  });

  it('keeps the /cli subpath type exports exact', () => {
    expect(getModuleExportNames('src/cli-api.ts')).toEqual(cliTypeExportNames);
  });

  it('keeps root runtime exports exact for ESM and CommonJS builds', async () => {
    const esm = await import(pathToFileURL(path.resolve(packageRoot, 'dist/index.mjs')).href);
    const cjs = require(path.resolve(packageRoot, 'dist/index.js')) as Record<string, unknown>;

    expect(Object.keys(esm).sort()).toEqual(rootRuntimeExportNames);
    expect(Object.keys(cjs).sort()).toEqual(rootRuntimeExportNames);
  });

  it('keeps /cli runtime exports exact for ESM and CommonJS builds', async () => {
    const esm = await import(pathToFileURL(path.resolve(packageRoot, 'dist/cli-api.mjs')).href);
    const cjs = require(path.resolve(packageRoot, 'dist/cli-api.js')) as Record<string, unknown>;

    expect(Object.keys(esm).sort()).toEqual(cliRuntimeExportNames);
    expect(Object.keys(cjs).sort()).toEqual(cliRuntimeExportNames);
  });
});
