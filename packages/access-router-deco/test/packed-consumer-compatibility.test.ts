import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const publisherRequire = createRequire(require.resolve('@repo-toolkit/release-artifact')) as NodeRequire;
const { createPublishPackageJson, DEFAULT_PACKAGE_FILES, DEFAULT_VERSION_PLACEHOLDER } = publisherRequire(
  '@repo-toolkit/publish-package',
) as {
  createPublishPackageJson: (
    packageJson: Record<string, unknown>,
    options: {
      version: string;
      internalPackageNames: Set<string>;
      rootMetadata?: {
        author?: unknown;
        bugs?: unknown;
        engines?: unknown;
        license?: unknown;
        repository?: unknown;
      };
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
  sideEffects?: string[] | boolean;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PackedWorkspace = {
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  version: string;
  license: string;
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};

const testVersion = '0.99.0-test';
const rootLicensePath = path.resolve(workspaceRoot, 'LICENSE');
const typescriptVersion = rootPackageJson.devDependencies.typescript;
const nodeTypesVersion = rootPackageJson.devDependencies['@types/node'];

const workspacePackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages/utils') },
  { name: '@web-ts-toolkit/http-errors', dir: path.resolve(workspaceRoot, 'packages/http-errors') },
  {
    name: '@web-ts-toolkit/express-response-handler',
    dir: path.resolve(workspaceRoot, 'packages/express-response-handler'),
  },
  { name: '@web-ts-toolkit/express-json-router', dir: path.resolve(workspaceRoot, 'packages/express-json-router') },
  { name: '@web-ts-toolkit/access-router', dir: path.resolve(workspaceRoot, 'packages/access-router') },
  { name: '@web-ts-toolkit/access-router-deco', dir: packageRoot },
] as const;

const tempRoots: string[] = [];

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const caught = error as { stdout?: string; stderr?: string; status?: number; message?: string };
    const detail = [caught.stdout, caught.stderr].filter(Boolean).join('\n');
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (cwd: ${cwd}, status: ${caught.status})\n${detail}\n${caught.message ?? ''}`,
      { cause: error },
    );
  }
}

function seedToolVersions(dir: string): void {
  const workspaceToolVersions = path.resolve(workspaceRoot, '.tool-versions');
  if (existsSync(workspaceToolVersions)) {
    cpSync(workspaceToolVersions, path.resolve(dir, '.tool-versions'));
  }
}

function mergeRootRepository(
  rootRepository: { type?: string; url?: string } | undefined,
  packageDirRelative: string,
): { type?: string; url?: string; directory?: string } | undefined {
  return rootRepository ? { ...rootRepository, directory: packageDirRelative } : undefined;
}

function buildPublishedManifest(
  sourceManifest: PackageJson,
  internalPackageNames: Set<string>,
  packageDirRelative: string,
): PackageJson {
  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames,
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: mergeRootRepository(rootPackageJson.repository, packageDirRelative),
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(stageDir: string, sourceDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(sourceDir, 'dist'), stageDir, { recursive: true });

  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(sourceDir, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
  }

  if (existsSync(rootLicensePath)) {
    cpSync(rootLicensePath, path.resolve(stageDir, 'LICENSE'));
  }

  writeFileSync(path.resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function containsDisallowedPublishedValue(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('PLACEHOLDER') || value.includes('workspace:');
  if (Array.isArray(value)) return value.some((entry) => containsDisallowedPublishedValue(entry));
  if (value && typeof value === 'object')
    return Object.values(value).some((entry) => containsDisallowedPublishedValue(entry));
  return false;
}

let packedWorkspaceCache: PackedWorkspace | undefined;

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) return packedWorkspaceCache;

  const internalPackageNames = new Set(workspacePackages.map((pkg) => pkg.name));
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-deco-deco15-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const packageDirRelative = path.relative(workspaceRoot, pkg.dir).replace(/\\/g, '/');
    const manifest = buildPublishedManifest(rawManifest, internalPackageNames, packageDirRelative);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const resolvedTarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(resolvedTarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${resolvedTarball}`);
    }
    tarballs[pkg.name] = resolvedTarball;
    manifests[pkg.name] = manifest;
  }

  packedWorkspaceCache = { tarballs, manifests };
  return packedWorkspaceCache;
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-deco-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);
  const internalDeps = Object.fromEntries(
    workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`]),
  );

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'access-router-deco-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...internalDeps,
          express: '^5.2.1',
          mongoose: '^9.8.0',
          'reflect-metadata': '^0.2.2',
        },
        devDependencies: {
          typescript: typescriptVersion,
          '@types/node': nodeTypesVersion,
          '@types/express': '^5.0.6',
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    `${['packages: []', 'overrides:']
      .concat(Object.entries(internalDeps).map(([name, source]) => `  '${name}': ${source}`))
      .join('\n')}\n`,
  );
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'access-router-deco-deco15-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function writeConsumerFiles(consumerDir: string): void {
  writeFileSync(
    path.resolve(consumerDir, 'esm.mjs'),
    `import {
  AfterDelete,
  AfterPersist,
  BaseFilter,
  BeforeDelete,
  Context,
  Decorate,
  DecorateAll,
  DefaultModelOption,
  DocPermissions,
  Document,
  EgoseFactory,
  EgoseFactoryStatic,
  Filter,
  GlobalOption,
  GlobalPermissions,
  Id,
  Identifier,
  ModelOption,
  Module,
  Option,
  OverrideFilter,
  Permissions,
  Prepare,
  Request,
  RouteGuard,
  Router,
  RouterOptions,
  Transform,
  Validate,
} from '@web-ts-toolkit/access-router-deco';

class UserRouter {
}
Router('PackedUser', { basePath: '/users' })(UserRouter);

class AppModule {}
Module({ routers: [UserRouter] })(AppModule);

if (typeof EgoseFactoryStatic.create !== 'function') throw new Error('missing factory export');
if (typeof EgoseFactory.bootstrap !== 'function') throw new Error('missing singleton factory export');
if (typeof Module !== 'function') throw new Error('missing Module export');
for (const exported of [
  AfterDelete,
  AfterPersist,
  BaseFilter,
  BeforeDelete,
  Context,
  Decorate,
  DecorateAll,
  DefaultModelOption,
  DocPermissions,
  Document,
  Filter,
  GlobalOption,
  GlobalPermissions,
  Id,
  Identifier,
  ModelOption,
  Option,
  OverrideFilter,
  Permissions,
  Prepare,
  Request,
  RouteGuard,
  Router,
  RouterOptions,
  Transform,
  Validate,
]) {
  if (typeof exported !== 'function') throw new Error('missing documented decorator export');
}
if (Reflect.getMetadata(Symbol.for('@web-ts-toolkit/access-router-deco:module.routers'), AppModule)?.[0] !== UserRouter) {
  throw new Error('decorators did not write metadata');
}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'cjs.cjs'),
    `const deco = require('@web-ts-toolkit/access-router-deco');

class UserRouter {}
deco.Router('PackedCjsUser', { basePath: '/users' })(UserRouter);

class AppModule {}
deco.Module({ routers: [UserRouter] })(AppModule);

if (typeof deco.EgoseFactory.bootstrap !== 'function') throw new Error('missing EgoseFactory export');
if (Reflect.getMetadata(Symbol.for('@web-ts-toolkit/access-router-deco:module.routers'), AppModule)?.[0] !== UserRouter) {
  throw new Error('CJS decorators did not write metadata');
}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import express from 'express';
import mongoose from 'mongoose';
import { BaseFilter, EgoseFactoryStatic, Module, Permissions, Router, type BootstrapResult } from '@web-ts-toolkit/access-router-deco';

type User = { name: string; public: boolean };
mongoose.model<User>('PackedTypeUser', new mongoose.Schema<User>({ name: String, public: Boolean }));

@Router('PackedTypeUser', { basePath: '/users' })
class UserRouter {
  @BaseFilter('read')
  canRead(@Permissions() permissions: { has(permission: string): boolean }) {
    return permissions.has('admin') ? true : { public: true };
  }
}

@Module({ routers: [UserRouter] })
class AppModule {}

const app = express();
const result: BootstrapResult = EgoseFactoryStatic.create().bootstrap(AppModule, app);
void result;
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import express from 'express';
import mongoose from 'mongoose';
import { BaseFilter, EgoseFactoryStatic, Module, Permissions, Router, type BootstrapResult } from '@web-ts-toolkit/access-router-deco';

type User = { active: boolean };
mongoose.model<User>('PackedCtsUser', new mongoose.Schema<User>({ active: Boolean }));

@Router('PackedCtsUser', { basePath: '/users' })
class UserRouter {
  @BaseFilter('list')
  listFilter(@Permissions() permissions: { has(permission: string): boolean }) {
    return permissions.has('admin') ? true : { active: true };
  }
}

@Module({ routers: [UserRouter] })
class AppModule {}

const result: BootstrapResult = EgoseFactoryStatic.create().bootstrap(AppModule, express());
void result;
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import express from 'express';
import mongoose from 'mongoose';
import { EgoseFactoryStatic, Filter, Module, OverrideFilter, Router } from '@web-ts-toolkit/access-router-deco';

type User = { name: string };
mongoose.model<User>('PackedBundlerUser', new mongoose.Schema<User>({ name: String }));

@Router('PackedBundlerUser')
class UserRouter {
  @OverrideFilter('read')
  byFilter(@Filter() filter: Partial<User>) {
    return { ...filter, name: filter.name ?? 'public' };
  }
}

@Module({ routers: [UserRouter] })
class AppModule {}

void EgoseFactoryStatic.create().bootstrap(AppModule, express());
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        include: ['consumer.nodenext.mts', 'consumer.nodenext.cts'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig.bundler.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          types: ['node'],
          lib: ['ES2022', 'DOM'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    )}\n`,
  );
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('DECO-15 packed package consumer compatibility', () => {
  it('packs the production-transformed package without placeholder metadata or unexpected files', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests['@web-ts-toolkit/access-router-deco'];
    const packageDir = unpackTarballToDir(packed.tarballs['@web-ts-toolkit/access-router-deco']);
    const manifest = JSON.parse(readFileSync(path.resolve(packageDir, 'package.json'), 'utf8')) as PackageJson;
    const filePaths = run('tar', ['-tzf', packed.tarballs['@web-ts-toolkit/access-router-deco']], workspaceRoot)
      .trim()
      .split('\n')
      .map((file) => file.replace(/^package\//, ''))
      .sort();

    expect(manifest).toEqual(stagedManifest);
    expect(manifest.version).toBe(testVersion);
    expect(manifest.license).toBe(rootPackageJson.license);
    expect(manifest.repository).toEqual({ ...rootPackageJson.repository, directory: 'packages/access-router-deco' });
    expect(manifest.files).toEqual(['**/*', '!**/*.map']);
    expect(manifest.main).toBe('./index.js');
    expect(manifest.module).toBe('./index.mjs');
    expect(manifest.types).toBe('./index.d.ts');
    expect(manifest.exports).toEqual({
      '.': {
        types: './index.d.ts',
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
    });
    expect(manifest.peerDependencies).toMatchObject({
      '@web-ts-toolkit/access-router': testVersion,
      express: '>=5.0.0',
      mongoose: '>=8.0.0',
      'reflect-metadata': '^0.1.13 || ^0.2.0',
    });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(manifest)).toBe(false);
    expect(filePaths).toEqual([
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'package.json',
    ]);
  });

  it('loads ESM/CJS consumers and compiles strict decorated NodeNext and Bundler consumers from installed tarballs', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('node', ['esm.mjs'], consumerDir);
    run('node', ['cjs.cjs'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);
  }, 60000);
});
