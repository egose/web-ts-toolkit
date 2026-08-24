import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

const packageRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const rootTypeExportNames = [
  'AccessRouterRuntimeAppConfig',
  'AccessRouterRuntimeConfig',
  'AccessRouterRuntimeConfigLoadOptions',
  'AccessRouterRuntimeContext',
  'AccessRouterRuntimeCustomRoute',
  'AccessRouterRuntimeCustomRouteHandler',
  'AccessRouterRuntimeCustomRouteMethod',
  'AccessRouterRuntimeDataDefinition',
  'AccessRouterRuntimeDbConfig',
  'AccessRouterRuntimeDevOptions',
  'AccessRouterRuntimeExistingModelDefinition',
  'AccessRouterRuntimeInstance',
  'AccessRouterRuntimeModelDefinition',
  'AccessRouterRuntimeSchemaModelDefinition',
  'CombinedRouteInput',
  'DataRouterOptions',
  'GlobalOptions',
  'LocalServerOptions',
  'ModelRouterOptions',
  'OpenApiRouterOptions',
  'RootRouterOptions',
  'ServerlessHandlerOptions',
  'createAccessRouterRuntime',
  'createAccessRouterRuntimeApp',
  'createAccessRouterRuntimeServerlessHandler',
  'defineRuntimeConfig',
  'loadAccessRouterRuntime',
  'loadAccessRouterRuntimeConfigSync',
  'normalizeAccessRouterRuntimeConfigExport',
  'validateAccessRouterRuntimeConfig',
];

const rootRuntimeExportNames = [
  'createAccessRouterRuntime',
  'createAccessRouterRuntimeApp',
  'createAccessRouterRuntimeServerlessHandler',
  'defineRuntimeConfig',
  'loadAccessRouterRuntime',
  'loadAccessRouterRuntimeConfigSync',
  'normalizeAccessRouterRuntimeConfigExport',
  'validateAccessRouterRuntimeConfig',
];

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

describe('access-router-runtime public API export surface', () => {
  it('keeps the root package type exports exact', () => {
    expect(getModuleExportNames('src/index.ts')).toEqual(rootTypeExportNames);
  });

  it('keeps root runtime exports exact for ESM and CommonJS builds', async () => {
    const esm = await import(pathToFileURL(path.resolve(packageRoot, 'dist/index.mjs')).href);
    const cjs = require(path.resolve(packageRoot, 'dist/index.js')) as Record<string, unknown>;

    expect(Object.keys(esm).sort()).toEqual(rootRuntimeExportNames);
    expect(Object.keys(cjs).sort()).toEqual(rootRuntimeExportNames);
  });
});
