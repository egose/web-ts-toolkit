import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { delimiter } from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { assertSubprocessResult, runSubprocess, type SubprocessResult } from './subprocess';
import { createTempProject, writeProjectFile } from './tmp';

export interface RelocatedAccessRouterArtifactProbeResult {
  sourceDir: string;
  artifactDir: string;
  localWithMutatedSourceResult: SubprocessResult;
  localAfterSourceRemovalResult: SubprocessResult;
  serverlessAfterSourceRemovalResult: SubprocessResult;
  coldStartResults: SubprocessResult[];
  localOutput: string;
  serverlessOutput: string;
  cleanup: () => void;
}

function parseJsonLine(result: SubprocessResult): unknown {
  const line = result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);

  return line ? JSON.parse(line) : undefined;
}

export function parseArtifactProbeJson(result: SubprocessResult): unknown {
  return parseJsonLine(result);
}

function createNodePath(packageDir: string, artifactDir: string): string {
  return [
    join(artifactDir, 'node_modules'),
    join(packageDir, 'node_modules'),
    join(packageDir, '..', '..', 'node_modules'),
  ]
    .filter(existsSync)
    .join(delimiter);
}

function writeFixtureProject(sourceDir: string, configRelativePath: string, value: string): void {
  writeProjectFile(
    sourceDir,
    'tsconfig runtime.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          baseUrl: '.',
          paths: {
            '@fixture/*': ['src/*'],
          },
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
      },
      null,
      2,
    ),
  );
  writeProjectFile(sourceDir, 'src/value.ts', `export const value = ${JSON.stringify(value)};\n`);
  writeProjectFile(
    sourceDir,
    configRelativePath,
    [
      "import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';",
      "import { value } from '@fixture/value';",
      'export default defineRuntimeConfig({',
      '  express: {',
      '    finalize(app) {',
      "      app.get('/value', (_req, res) => res.json({ value }));",
      '    },',
      '  },',
      '});',
      '',
    ].join('\n'),
  );
}

function localProbeScript(): string {
  return [
    "const http = require('node:http');",
    "const mod = require('./dist-local/app.js');",
    'const app = mod.default ?? mod.app ?? mod;',
    "const server = app.listen(0, '127.0.0.1', () => {",
    '  const address = server.address();',
    "  const request = http.get({ hostname: '127.0.0.1', port: address.port, path: '/value' }, (response) => {",
    "    let body = '';",
    "    response.on('data', (chunk) => { body += chunk; });",
    "    response.on('end', () => {",
    '      console.log(JSON.stringify({ statusCode: response.statusCode, body: JSON.parse(body) }));',
    '      server.close(() => process.exit(response.statusCode === 200 ? 0 : 1));',
    '    });',
    '  });',
    "  request.on('error', (error) => { console.error(error.stack || error.message); server.close(() => process.exit(1)); });",
    '});',
    "setTimeout(() => { console.error('local probe timed out'); server.close(() => process.exit(1)); }, 5000).unref();",
  ].join('\n');
}

function serverlessProbeScript(): string {
  return [
    "const { handler } = require('./dist-serverless/handler.js');",
    "handler({ httpMethod: 'GET', path: '/value', headers: {}, body: undefined }, {})",
    '  .then((result) => {',
    '    console.log(JSON.stringify({ statusCode: result.statusCode, body: JSON.parse(result.body) }));',
    '  })',
    '  .catch((error) => { console.error(error.stack || error.message); process.exit(1); });',
  ].join('\n');
}

function instrumentedColdStartProbeScript(kind: 'local' | 'serverless', sourceDir: string): string {
  const appPath = kind === 'local' ? './dist-local/app.js' : './dist-serverless/handler.js';
  const invoke =
    kind === 'local'
      ? [
          "const http = require('node:http');",
          `const mod = require(${JSON.stringify(appPath)});`,
          'const app = mod.default ?? mod.app ?? mod;',
          "const server = app.listen(0, '127.0.0.1', () => {",
          '  const address = server.address();',
          "  const request = http.get({ hostname: '127.0.0.1', port: address.port, path: '/value' }, (response) => {",
          "    response.on('end', async () => {",
          "      await (typeof mod.shutdown === 'function' ? mod.shutdown() : undefined);",
          '      server.close(() => report(response.statusCode));',
          '    });',
          '    response.resume();',
          '  });',
          "  request.on('error', async (error) => { console.error(error.stack || error.message); await (typeof mod.shutdown === 'function' ? mod.shutdown() : undefined); server.close(() => process.exit(1)); });",
          '});',
          "setTimeout(() => { console.error('local cold start probe timed out'); server.close(() => process.exit(1)); }, 5000).unref();",
        ]
      : [
          `const { handler } = require(${JSON.stringify(appPath)});`,
          "handler({ httpMethod: 'GET', path: '/value', headers: {}, body: undefined }, {})",
          '  .then((result) => report(result.statusCode))',
          '  .catch((error) => { console.error(error.stack || error.message); process.exit(1); });',
        ];

  return [
    "const fs = require('node:fs');",
    "const Module = require('node:module');",
    `const sourceDir = ${JSON.stringify(sourceDir)};`,
    'const originalLoad = Module._load;',
    "const fsSyncMethods = ['existsSync', 'readFileSync', 'openSync', 'statSync'];",
    'let jitiLoads = 0;',
    'let sourceFsSyncCalls = 0;',
    'Module._load = function patchedLoad(request, parent, isMain) {',
    "  if (String(request).includes('jiti')) jitiLoads += 1;",
    '  return originalLoad.call(this, request, parent, isMain);',
    '};',
    'for (const method of fsSyncMethods) {',
    '  const original = fs[method];',
    '  fs[method] = function patchedFsMethod(pathLike, ...args) {',
    "    const pathValue = typeof pathLike === 'string' ? pathLike : Buffer.isBuffer(pathLike) ? pathLike.toString() : '';",
    '    if (pathValue.startsWith(sourceDir)) sourceFsSyncCalls += 1;',
    '    return original.call(this, pathLike, ...args);',
    '  };',
    '}',
    'const start = process.hrtime.bigint();',
    'function report(statusCode) {',
    '  const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;',
    '  console.log(JSON.stringify({ statusCode, jitiLoads, sourceFsSyncCalls, elapsedMs }));',
    '  process.exit(statusCode === 200 && jitiLoads === 0 && sourceFsSyncCalls === 0 ? 0 : 1);',
    '}',
    ...invoke,
  ].join('\n');
}

export async function probeRelocatedAccessRouterArtifacts(
  cliPath: string,
): Promise<RelocatedAccessRouterArtifactProbeResult> {
  const packageDir = resolve(dirname(cliPath), '..');
  const source = createTempProject('access router runtime artifact source é-');
  const artifact = createTempProject('access router runtime artifact relocated é-');
  const configRelativePath = 'access config "é".ts';
  const configPath = join(source.dir, configRelativePath);
  const tsconfigPath = join(source.dir, 'tsconfig runtime.json');
  const scopedModulesDir = join(source.dir, 'node_modules', '@web-ts-toolkit');
  const artifactScopedModulesDir = join(artifact.dir, 'node_modules', '@web-ts-toolkit');

  mkdirSync(scopedModulesDir, { recursive: true });
  mkdirSync(artifactScopedModulesDir, { recursive: true });
  symlinkSync(packageDir, join(scopedModulesDir, 'access-router-runtime'), 'dir');
  symlinkSync(packageDir, join(artifactScopedModulesDir, 'access-router-runtime'), 'dir');
  const nodePath = createNodePath(packageDir, artifact.dir);
  const env = nodePath ? { ...process.env, NODE_PATH: nodePath } : process.env;

  writeFixtureProject(source.dir, configRelativePath, 'original');

  const localBuildResult = await runSubprocess(
    process.execPath,
    [
      cliPath,
      'build',
      `./${configRelativePath}`,
      '--tsconfig',
      './tsconfig runtime.json',
      '--out-dir',
      './dist-local',
      '--out-name',
      'app',
      '--format',
      'cjs',
    ],
    { cwd: source.dir, timeoutMs: 30_000 },
  );
  assertSubprocessResult(localBuildResult, { exitCode: 0, timedOut: false });

  const serverlessBuildResult = await runSubprocess(
    process.execPath,
    [
      cliPath,
      'build-serverless',
      `./${configRelativePath}`,
      '--tsconfig',
      './tsconfig runtime.json',
      '--out-dir',
      './dist-serverless',
      '--out-name',
      'handler',
      '--format',
      'cjs',
    ],
    { cwd: source.dir, timeoutMs: 30_000 },
  );
  assertSubprocessResult(serverlessBuildResult, { exitCode: 0, timedOut: false });

  cpSync(join(source.dir, 'dist-local'), join(artifact.dir, 'dist-local'), { recursive: true });
  cpSync(join(source.dir, 'dist-serverless'), join(artifact.dir, 'dist-serverless'), { recursive: true });
  const localOutput = readFileSync(join(artifact.dir, 'dist-local', 'app.js'), 'utf8');
  const serverlessOutput = readFileSync(join(artifact.dir, 'dist-serverless', 'handler.js'), 'utf8');
  writeFixtureProject(source.dir, configRelativePath, 'mutated');

  const localWithMutatedSourceResult = await runSubprocess(process.execPath, ['-e', localProbeScript()], {
    cwd: artifact.dir,
    env,
    timeoutMs: 10_000,
  });

  rmSync(configPath, { force: true });
  rmSync(tsconfigPath, { force: true });
  rmSync(join(source.dir, 'src'), { recursive: true, force: true });

  const localAfterSourceRemovalResult = await runSubprocess(process.execPath, ['-e', localProbeScript()], {
    cwd: artifact.dir,
    env,
    timeoutMs: 10_000,
  });
  const serverlessAfterSourceRemovalResult = await runSubprocess(process.execPath, ['-e', serverlessProbeScript()], {
    cwd: artifact.dir,
    env,
    timeoutMs: 10_000,
  });
  const coldStartResults = [
    await runSubprocess(process.execPath, ['-e', instrumentedColdStartProbeScript('local', source.dir)], {
      cwd: artifact.dir,
      env,
      timeoutMs: 10_000,
    }),
    await runSubprocess(process.execPath, ['-e', instrumentedColdStartProbeScript('local', source.dir)], {
      cwd: artifact.dir,
      env,
      timeoutMs: 10_000,
    }),
    await runSubprocess(process.execPath, ['-e', instrumentedColdStartProbeScript('serverless', source.dir)], {
      cwd: artifact.dir,
      env,
      timeoutMs: 10_000,
    }),
    await runSubprocess(process.execPath, ['-e', instrumentedColdStartProbeScript('serverless', source.dir)], {
      cwd: artifact.dir,
      env,
      timeoutMs: 10_000,
    }),
  ];

  return {
    sourceDir: source.dir,
    artifactDir: artifact.dir,
    localWithMutatedSourceResult,
    localAfterSourceRemovalResult,
    serverlessAfterSourceRemovalResult,
    coldStartResults,
    localOutput,
    serverlessOutput,
    cleanup: () => {
      artifact.cleanup();
      source.cleanup();
    },
  };
}
