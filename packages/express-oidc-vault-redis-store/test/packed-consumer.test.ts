import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRedisHarness } from './redis-harness';

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
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PackageSpec = {
  name: string;
  root: string;
  directory: string;
  tarballName: string;
};

type PackedWorkspace = {
  tempRoot: string;
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const corePackageRoot = path.resolve(workspaceRoot, 'packages', 'express-oidc-vault');
const consumerSourceDir = path.resolve(packageRoot, 'test-packed-consumer', 'consumer');
const redisStorePackageName = '@web-ts-toolkit/express-oidc-vault-redis-store';
const corePackageName = '@web-ts-toolkit/express-oidc-vault';
const testVersion = '0.99.0-rvr10';
const packageSpecs: PackageSpec[] = [
  {
    name: corePackageName,
    root: corePackageRoot,
    directory: 'packages/express-oidc-vault',
    tarballName: `web-ts-toolkit-express-oidc-vault-${testVersion}.tgz`,
  },
  {
    name: redisStorePackageName,
    root: packageRoot,
    directory: 'packages/express-oidc-vault-redis-store',
    tarballName: `web-ts-toolkit-express-oidc-vault-redis-store-${testVersion}.tgz`,
  },
];

const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  license: string;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const sourcePackageJsons = Object.fromEntries(
  packageSpecs.map((spec) => [
    spec.name,
    JSON.parse(readFileSync(path.resolve(spec.root, 'package.json'), 'utf8')) as PackageJson,
  ]),
) as Record<string, PackageJson>;
const tempRoots: string[] = [];
let packedWorkspaceCache: PackedWorkspace | undefined;

function trackTempRoot(dir: string): string {
  tempRoots.push(dir);
  return dir;
}

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 16 * 1024 * 1024,
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
  const source = path.resolve(workspaceRoot, '.tool-versions');
  if (existsSync(source)) {
    cpSync(source, path.resolve(dir, '.tool-versions'));
  }
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

function buildPublishedManifest(spec: PackageSpec): PackageJson {
  return createPublishPackageJson(sourcePackageJsons[spec.name] as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set(packageSpecs.map((entry) => entry.name)),
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: { ...rootPackageJson.repository, directory: spec.directory },
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(spec: PackageSpec, stageDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(spec.root, 'dist'), stageDir, { recursive: true });
  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(spec.root, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
  }
  cpSync(path.resolve(workspaceRoot, 'LICENSE'), path.resolve(stageDir, 'LICENSE'));
  writeFileSync(path.resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-redis-store-rvr10-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};

  for (const spec of packageSpecs) {
    const stageDir = path.resolve(tempRoot, spec.name.replace(/[@/]/g, '_'));
    const manifest = buildPublishedManifest(spec);
    stagePublishedPackage(spec, stageDir, manifest);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

    const tarball = path.resolve(tarballDir, spec.tarballName);
    if (!existsSync(tarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
    }
    tarballs[spec.name] = tarball;
    manifests[spec.name] = manifest;
  }

  packedWorkspaceCache = { tempRoot, tarballs, manifests };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-redis-store-rvr10-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const redisStoreSourcePackageJson = sourcePackageJsons[redisStorePackageName];
  const coreSourcePackageJson = sourcePackageJsons[corePackageName];
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-redis-store-consumer-')));
  seedToolVersions(consumerDir);
  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'express-oidc-vault-redis-store-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [corePackageName]: `file:${packed.tarballs[corePackageName]}`,
          [redisStorePackageName]: `file:${packed.tarballs[redisStorePackageName]}`,
          // Core OIDC vault types transitively reference express; include it so
          // strict NodeNext lib check resolves the core package declarations
          // without forcing the redis store to depend on express at runtime.
          express: coreSourcePackageJson.devDependencies?.express,
          redis: redisStoreSourcePackageJson.devDependencies?.redis,
        },
        devDependencies: {
          '@types/express': coreSourcePackageJson.devDependencies?.['@types/express'],
          '@types/node': redisStoreSourcePackageJson.devDependencies?.['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    `overrides:\n  '${corePackageName}': file:${packed.tarballs[corePackageName]}\n`,
  );
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function copyConsumerSources(consumerDir: string): void {
  for (const file of ['consumer.cjs', 'consumer.mjs', 'consumer-types.ts', 'tsconfig-nodenext.json']) {
    cpSync(path.resolve(consumerSourceDir, file), path.resolve(consumerDir, file));
  }
  cpSync(
    path.resolve(corePackageRoot, 'test-packed-consumer/consumer/store-contract.mjs'),
    path.resolve(consumerDir, 'store-contract.mjs'),
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-bundler.json'),
    JSON.stringify({
      extends: './tsconfig-nodenext.json',
      compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
      include: ['consumer-types.ts', 'readme-quick-start.ts'],
    }),
  );
  const readme = readFileSync(path.resolve(consumerDir, 'node_modules', redisStorePackageName, 'README.md'), 'utf8');
  const quickStart = readme.slice(readme.indexOf('## Quick Start')).match(/```ts\n([\s\S]*?)\n```/)?.[1];
  if (!quickStart) throw new Error('Installed Redis README quickstart is missing.');
  writeFileSync(path.resolve(consumerDir, 'readme-quick-start.ts'), quickStart);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('RVR-10 packed-package redis store consumer compatibility', () => {
  it('applies the real publish manifest transformation to the redis-store tarball', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests[redisStorePackageName];
    const unpackRoot = unpackTarballToDir(packed.tarballs[redisStorePackageName]);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(stagedManifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: 'packages/express-oidc-vault-redis-store',
    });
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(packedManifest.main).toBe('./index.js');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.ts');
    // Conditional types.import/.require mapping is what RVR-10 introduced.
    expect(packedManifest.exports).toEqual({
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
    });
    expect(packedManifest.sideEffects).toBe(false);
    expect(packedManifest.engines).toEqual({ node: '>=22.12.0' });
    // redis moved from dependencies to devDependencies at source. It must NOT
    // appear as a runtime dependency in the published manifest.
    expect(packedManifest.dependencies).toEqual({ [corePackageName]: testVersion });
    expect(packedManifest.dependencies?.redis).toBeUndefined();
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(unpackRoot, emitted))).toBe(true);
    }
    for (const declaration of ['index.d.ts', 'index.d.mts']) {
      expect(readFileSync(path.resolve(unpackRoot, declaration), 'utf8')).not.toMatch(
        /from ['"]\.|\/src\/|reference path=/,
      );
    }
  });

  it('`npm pack --dry-run --json` lists only intended files in the staged redis-store tree', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, redisStorePackageName.replace(/[@/]/g, '_'));
    const stdout = run('npm', ['pack', '--dry-run', '--json'], stageDir);
    const report = JSON.parse(stdout) as Array<{
      entryCount: number;
      bundled: unknown[];
      files: Array<{ path: string }>;
    }>;
    expect(report).toHaveLength(1);
    const [entry] = report;
    expect(entry.bundled).toEqual([]);
    const paths = entry.files.map((f) => f.path).sort();
    const expectedFiles = [
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'package.json',
    ].sort();
    expect(paths).toEqual(expectedFiles);
    expect(entry.entryCount).toBe(expectedFiles.length);
  });

  it('installs staged tarballs and runs CJS/ESM guarded replay plus strict NodeNext/Bundler consumers', async () => {
    const consumerDir = installPackedConsumer();
    copyConsumerSources(consumerDir);
    // Exercise the require declaration branch with the same public API checks.
    cpSync(path.resolve(consumerDir, 'consumer-types.ts'), path.resolve(consumerDir, 'consumer-types.cts'));

    const harness = await createRedisHarness('redis:7.2-alpine');
    try {
      run('node', ['consumer.cjs', harness.url, harness.createKeyPrefix('packed-cjs')], consumerDir);
      run('node', ['consumer.mjs', harness.url, harness.createKeyPrefix('packed-esm')], consumerDir);
    } finally {
      await harness.stop();
    }
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
    const trace = run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json', '--traceResolution'], consumerDir);
    expect(trace).toMatch(
      /Resolving in ESM mode with conditions 'import'[\s\S]*?express-oidc-vault-redis-store\/index\.d\.mts'/,
    );
    expect(trace).toMatch(
      /Resolving in CJS mode with conditions 'require'[\s\S]*?express-oidc-vault-redis-store\/index\.d\.ts'/,
    );

    const installedPackageDir = path.resolve(
      consumerDir,
      'node_modules',
      '@web-ts-toolkit',
      'express-oidc-vault-redis-store',
    );
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedPackageDir, 'package.json'), 'utf8'),
    ) as PackageJson;
    expect(installedManifest.version).toBe(testVersion);
    expect(installedManifest.dependencies).toEqual({ [corePackageName]: testVersion });
    // The packed consumer must NOT need the redis package as a runtime dep.
    expect(installedManifest.dependencies?.redis).toBeUndefined();
    expect(existsSync(path.resolve(installedPackageDir, 'node_modules', 'redis'))).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(installedPackageDir, emitted))).toBe(true);
    }
    const allFiles = listFiles(installedPackageDir).map((p) =>
      path.relative(installedPackageDir, p).replace(/\\/g, '/'),
    );
    expect(allFiles.some((p) => p.endsWith('.map'))).toBe(false);
  }, 180_000);
});
