import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const publisherRequire = createRequire(require.resolve('@repo-toolkit/release-artifact')) as NodeRequire;
const { createPublishPackageJson, DEFAULT_PACKAGE_FILES, DEFAULT_VERSION_PLACEHOLDER } = publisherRequire(
  '@repo-toolkit/publish-package',
) as {
  createPublishPackageJson: (
    packageJson: Record<string, unknown>,
    options: {
      version: string;
      internalPackageNames: Set<string>;
      rootMetadata?: Record<string, unknown>;
      rewrite?: { versionPlaceholder?: string; publishDir?: string };
    },
  ) => Record<string, unknown>;
  DEFAULT_PACKAGE_FILES: string[];
  DEFAULT_VERSION_PLACEHOLDER: string;
};

type PackageJson = {
  name: string;
  version: string;
  license?: string;
  repository?: string | { type?: string; url?: string; directory?: string };
  sideEffects?: boolean | string[];
  main?: string;
  module?: string;
  types?: string;
  bin?: Record<string, string> | string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
};

type PackedWorkspace = {
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

const testVersion = '0.99.0-arrt10';
const tempRoots: string[] = [];
const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  license: string;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const workspacePackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages/utils') },
  { name: '@web-ts-toolkit/http-errors', dir: path.resolve(workspaceRoot, 'packages/http-errors') },
  {
    name: '@web-ts-toolkit/express-response-handler',
    dir: path.resolve(workspaceRoot, 'packages/express-response-handler'),
  },
  { name: '@web-ts-toolkit/express-json-router', dir: path.resolve(workspaceRoot, 'packages/express-json-router') },
  { name: '@web-ts-toolkit/access-router', dir: path.resolve(workspaceRoot, 'packages/access-router') },
  { name: '@web-ts-toolkit/express-runtime', dir: path.resolve(workspaceRoot, 'packages/express-runtime') },
  { name: '@web-ts-toolkit/access-router-runtime', dir: packageRoot },
] as const;

let packedWorkspaceCache: PackedWorkspace | undefined;

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\n${error.stdout ?? ''}${error.stderr ?? error.message ?? ''}`,
      {
        cause: err,
      },
    );
  }
}

function seedToolVersions(dir: string): void {
  const workspaceToolVersions = path.resolve(workspaceRoot, '.tool-versions');
  if (existsSync(workspaceToolVersions)) {
    cpSync(workspaceToolVersions, path.resolve(dir, '.tool-versions'));
  }
}

function buildPublishedManifest(sourceDir: string, sourceManifest: PackageJson): PackageJson {
  const packageDirRelative = path.relative(workspaceRoot, sourceDir).replace(/\\/g, '/');

  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set(workspacePackages.map((pkg) => pkg.name)),
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: { ...rootPackageJson.repository, directory: packageDirRelative },
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(stageDir: string, sourceDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });

  const distSource = path.resolve(sourceDir, 'dist');
  if (existsSync(distSource)) {
    cpSync(distSource, stageDir, { recursive: true });
  }

  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(sourceDir, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
  }

  const licenseSource = path.resolve(workspaceRoot, 'LICENSE');
  if (existsSync(licenseSource)) {
    cpSync(licenseSource, path.resolve(stageDir, 'LICENSE'));
  }

  writeFileSync(path.resolve(stageDir, 'package.json'), JSON.stringify(manifest, null, 2));
}

function containsDisallowedPublishedValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('PLACEHOLDER') || value.includes('workspace:');
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsDisallowedPublishedValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsDisallowedPublishedValue(entry));
  }
  return false;
}

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) return packedWorkspaceCache;

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-runtime-arrt10-packed-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = buildPublishedManifest(pkg.dir, rawManifest);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    seedToolVersions(stageDir);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const tarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(tarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
    }
    tarballs[pkg.name] = tarball;
    manifests[pkg.name] = manifest;
  }

  packedWorkspaceCache = { tarballs, manifests };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-runtime-arrt10-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(mongooseRange: string): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-runtime-arrt10-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  const internalDependencies = Object.fromEntries(
    workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`]),
  );

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'access-router-runtime-packed-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...internalDependencies,
          express: '^5.2.1',
          mongoose: mongooseRange,
        },
        devDependencies: {
          '@types/express': '^5.0.6',
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    ['packages: []', 'overrides:']
      .concat(Object.entries(internalDependencies).map(([name, source]) => `  '${name}': ${source}`))
      .join('\n') + '\n',
  );
  run('pnpm', ['install', '--ignore-scripts'], consumerDir);

  return consumerDir;
}

function writeConsumerRuntimeFiles(consumerDir: string, expectedMongooseMajor: number): void {
  writeFileSync(
    path.resolve(consumerDir, 'esm.mjs'),
    `import { createAccessRouterRuntime, defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

const runtime = createAccessRouterRuntime(defineRuntimeConfig({
  data: [{ name: 'status', router: { idField: 'id', operationAccess: false, data: [{ id: 'ok', healthy: true }] } }],
}));

if (!runtime.app || typeof runtime.init !== 'function' || typeof runtime.shutdown !== 'function') {
  throw new Error('ESM root import did not expose the runtime API');
}
await runtime.shutdown();
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'cjs.cjs'),
    `const api = require('@web-ts-toolkit/access-router-runtime');
const runtime = api.createAccessRouterRuntime(api.defineRuntimeConfig({}));

if (!runtime.app || typeof runtime.createServerlessHandler !== 'function') {
  throw new Error('CommonJS root require did not expose the runtime API');
}
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'ownership-lifecycle.mjs'),
    `import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { createAccessRouterRuntime, defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

const require = createRequire(import.meta.url);
const version = require('mongoose/package.json').version;
if (!version.startsWith('${expectedMongooseMajor}.')) {
  throw new Error(\`expected mongoose ${expectedMongooseMajor}.x, got \${version}\`);
}

const schemaA = new mongoose.Schema({ name: String });
const schemaB = new mongoose.Schema({ name: String });
const connectionA = mongoose.createConnection();
const connectionB = mongoose.createConnection();
const events = [];

const runtimeA = createAccessRouterRuntime(defineRuntimeConfig({
  db: { connection: connectionA },
  models: [{ name: 'SharedUser', schema: schemaA, collection: 'users_a', router: { operationAccess: false } }],
  init() { events.push('a:init'); },
  shutdown() { events.push('a:shutdown'); },
}));
const runtimeB = createAccessRouterRuntime(defineRuntimeConfig({
  db: { connection: connectionB },
  models: [{ name: 'SharedUser', schema: schemaB, collection: 'users_b', router: { operationAccess: false } }],
  init() { events.push('b:init'); },
  shutdown() { events.push('b:shutdown'); },
}));

if (runtimeA.models.SharedUser.db !== connectionA) throw new Error('runtime A model used the wrong connection');
if (runtimeB.models.SharedUser.db !== connectionB) throw new Error('runtime B model used the wrong connection');
if (runtimeA.models.SharedUser === runtimeB.models.SharedUser) throw new Error('runtimes shared a generated model');

await runtimeA.init();
await runtimeB.init();
await runtimeA.shutdown();

if (connectionA.models.SharedUser) throw new Error('runtime A generated model was not cleaned up');
if (!connectionB.models.SharedUser) throw new Error('runtime A shutdown removed runtime B model');
if (connectionB.readyState !== 0) throw new Error('external runtime B connection was closed');

await runtimeB.shutdown();
if (connectionB.models.SharedUser) throw new Error('runtime B generated model was not cleaned up');
if (events.join(',') !== 'a:init,b:init,a:shutdown,b:shutdown') throw new Error(\`unexpected lifecycle order: \${events.join(',')}\`);
`,
  );
}

function writeConsumerTypeFiles(consumerDir: string): void {
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import mongoose from 'mongoose';
import {
  createAccessRouterRuntime,
  defineRuntimeConfig,
  type AccessRouterRuntimeInstance,
  type AccessRouterRuntimeConfig,
} from '@web-ts-toolkit/access-router-runtime';

type User = { name: string };
const userSchema = new mongoose.Schema<User>({ name: { type: String, required: true } });
const config = defineRuntimeConfig({
  models: [{ name: 'User' as const, schema: userSchema, router: { operationAccess: false } }],
} satisfies AccessRouterRuntimeConfig);
const runtime: AccessRouterRuntimeInstance<typeof config> = createAccessRouterRuntime(config);
const userModel: mongoose.Model<User> = runtime.models.User;
void [runtime, userModel];
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.require.cts'),
    `import runtimePackage = require('@web-ts-toolkit/access-router-runtime');

const config = runtimePackage.defineRuntimeConfig({
  data: [{ name: 'status' as const, router: { idField: 'id', operationAccess: false, data: [{ id: 'ok' }] } }],
});
const runtime = runtimePackage.createAccessRouterRuntime(config);
const dataName: string = runtime.dataRouters[0]!.dataName;
void [runtime, dataName];
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import mongoose from 'mongoose';
import { createAccessRouterRuntime, defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

const schema = new mongoose.Schema<{ name: string }>({ name: String });
const runtime = createAccessRouterRuntime(defineRuntimeConfig({
  models: [{ name: 'User' as const, schema, router: { operationAccess: false } }],
}));
const userModel: mongoose.Model<{ name: string }> = runtime.models.User;
void [runtime.app, userModel];
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-consumer.ts'),
    `import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

export default defineRuntimeConfig({
  dev: { watch: ['src'], ext: ['ts'], delay: 25 },
});
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.nodenext.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        include: ['consumer.nodenext.mts', 'consumer.require.cts'],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.bundler.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          esModuleInterop: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.extends.json'),
    JSON.stringify(
      {
        extends: '@web-ts-toolkit/access-router-runtime/tsconfig.json',
        compilerOptions: {
          noEmit: true,
          skipLibCheck: false,
          lib: ['ES2022', 'DOM'],
        },
        include: ['tsconfig-consumer.ts'],
      },
      null,
      2,
    ),
  );
}

function runConsumerMatrix(consumerDir: string, expectedMongooseMajor: number): void {
  writeConsumerRuntimeFiles(consumerDir, expectedMongooseMajor);
  writeConsumerTypeFiles(consumerDir);

  run('node', ['esm.mjs'], consumerDir);
  run('node', ['cjs.cjs'], consumerDir);
  run('node', ['ownership-lifecycle.mjs'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.extends.json'], consumerDir);
}

function runCliChecks(consumerDir: string): void {
  const help = run('pnpm', ['exec', 'wtt-access-router-runtime', '--help'], consumerDir);
  expect(help).toContain('wtt-access-router-runtime');
  expect(help).toContain('build-serverless');

  const version = run('pnpm', ['exec', 'wtt-access-router-runtime', '--version'], consumerDir).trim();
  expect(version).toBe(testVersion);

  writeFileSync(
    path.resolve(consumerDir, 'runtime.config.mjs'),
    `import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

export default defineRuntimeConfig({
  data: [{ name: 'status', router: { idField: 'id', operationAccess: false, data: [{ id: 'ok', healthy: true }] } }],
});
`,
  );
  run(
    'pnpm',
    [
      'exec',
      'wtt-access-router-runtime',
      'build',
      './runtime.config.mjs',
      '--out-dir',
      './built',
      '--out-name',
      'app',
      '--format',
      'cjs',
      '--target',
      'node22',
    ],
    consumerDir,
  );
  expect(
    existsSync(path.resolve(consumerDir, 'built/app.js')) || existsSync(path.resolve(consumerDir, 'built/app.cjs')),
  ).toBe(true);
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ARRT-10 packed consumers and declarations', () => {
  beforeAll(() => {
    preparePackedWorkspace();
  }, 120_000);

  it('packs the production-transformed manifest, declarations, tsconfig, and README', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests['@web-ts-toolkit/access-router-runtime'];
    const unpackedRoot = unpackTarballToDir(packed.tarballs['@web-ts-toolkit/access-router-runtime']);
    const unpackedManifest = JSON.parse(
      readFileSync(path.resolve(unpackedRoot, 'package.json'), 'utf8'),
    ) as PackageJson;
    const readme = readFileSync(path.resolve(unpackedRoot, 'README.md'), 'utf8');

    expect(unpackedManifest).toEqual(stagedManifest);
    expect(unpackedManifest.version).toBe(testVersion);
    expect(unpackedManifest.main).toBe('./index.js');
    expect(unpackedManifest.module).toBe('./index.mjs');
    expect(unpackedManifest.types).toBe('./index.d.ts');
    expect(unpackedManifest.bin).toEqual({ 'wtt-access-router-runtime': './cli.js' });
    expect(unpackedManifest.exports).toEqual({
      '.': {
        types: {
          import: './index.d.mts',
          require: './index.d.ts',
          default: './index.d.ts',
        },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
      './tsconfig.json': './tsconfig.json',
    });
    expect(unpackedManifest.sideEffects).toBe(false);
    expect(unpackedManifest.peerDependencies).toMatchObject({ express: '>=5.0.0', mongoose: '>=8.0.0 <10' });
    expect(unpackedManifest.dependencies).toMatchObject({
      '@web-ts-toolkit/access-router': testVersion,
      '@web-ts-toolkit/express-runtime': testVersion,
    });
    expect(unpackedManifest.devDependencies).toBeUndefined();
    expect(unpackedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(unpackedManifest)).toBe(false);
    for (const emitted of [
      'index.js',
      'index.mjs',
      'index.d.ts',
      'index.d.mts',
      'cli.js',
      'tsconfig.package.json',
      'tsconfig.json',
    ]) {
      expect(existsSync(path.resolve(unpackedRoot, emitted))).toBe(true);
    }
    expect(readme).toContain(
      'https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts',
    );
    expect(readme).not.toContain('`examples/basic/access-router.config.ts`');
  });

  it.each([
    ['mongoose 8', '^8.0.0', 8],
    ['mongoose 9', '^9.0.0', 9],
  ])(
    'runs and compiles packed consumers with %s',
    (_label, mongooseRange, expectedMajor) => {
      const consumerDir = installPackedConsumer(mongooseRange);

      runConsumerMatrix(consumerDir, expectedMajor);
    },
    120_000,
  );

  it('runs the packed CLI help, version, and a config-aware build command', () => {
    const consumerDir = installPackedConsumer('^9.0.0');

    runCliChecks(consumerDir);
  }, 120_000);
});
