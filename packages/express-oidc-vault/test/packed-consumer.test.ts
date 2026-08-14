import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type PackedWorkspace = {
  tempRoot: string;
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const packageRoot = path.resolve(__dirname, '..');
const consumerSourceDir = path.resolve(packageRoot, 'test-packed-consumer', 'consumer');
const packageName = '@web-ts-toolkit/express-oidc-vault';
const testVersion = '0.99.0-test';
const packageDirRelative = 'packages/express-oidc-vault';

const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  license: string;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};
const sourcePackageJson = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as PackageJson;
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

function buildPublishedManifest(): PackageJson {
  return createPublishPackageJson(sourcePackageJson as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set([packageName]),
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

function stagePublishedPackage(stageDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), stageDir, { recursive: true });
  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(packageRoot, entry);
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

  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-oidc11-')));
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const stageDir = path.resolve(tempRoot, packageName.replace(/[@/]/g, '_'));
  const manifest = buildPublishedManifest();
  stagePublishedPackage(stageDir, manifest);
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

  const tarball = path.resolve(tarballDir, `web-ts-toolkit-express-oidc-vault-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }

  packedWorkspaceCache = {
    tempRoot,
    tarballs: { [packageName]: tarball },
    manifests: { [packageName]: manifest },
  };
  return packedWorkspaceCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-oidc11-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'express-oidc-vault-consumer-')));
  seedToolVersions(consumerDir);
  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'express-oidc-vault-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageName]: `file:${packed.tarballs[packageName]}`,
          express: sourcePackageJson.devDependencies?.express,
        },
        devDependencies: {
          '@types/express': sourcePackageJson.devDependencies?.['@types/express'],
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}

function copyConsumerSources(consumerDir: string): void {
  for (const file of [
    'consumer.cjs',
    'consumer.mjs',
    'consumer-types.ts',
    'tsconfig-nodenext.json',
    'tsconfig-bundler.json',
  ]) {
    cpSync(path.resolve(consumerSourceDir, file), path.resolve(consumerDir, file));
  }
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('OIDC-11 packed-package consumer compatibility', () => {
  it('applies the real publish manifest transformation to the express-oidc-vault tarball', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests[packageName];
    const unpackRoot = unpackTarballToDir(packed.tarballs[packageName]);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    expect(packedManifest).toEqual(stagedManifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: packageDirRelative,
    });
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    expect(packedManifest.main).toBe('./index.js');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.ts');
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
    expect(packedManifest.peerDependencies).toEqual({ express: '>=5.0.0' });
    expect(packedManifest.dependencies).toEqual({ jose: '^6.1.0' });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(unpackRoot, emitted))).toBe(true);
    }
  });

  it('`npm pack --dry-run --json` lists only intended files in the staged express-oidc-vault tree', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, packageName.replace(/[@/]/g, '_'));
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

  it('installs the staged tarball and runs CJS, ESM, NodeNext, and Bundler consumers', () => {
    const consumerDir = installPackedConsumer();
    copyConsumerSources(consumerDir);

    run('node', ['consumer.cjs'], consumerDir);
    run('node', ['consumer.mjs'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);

    const installedPackageDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'express-oidc-vault');
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedPackageDir, 'package.json'), 'utf8'),
    ) as PackageJson;
    expect(installedManifest.version).toBe(testVersion);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(installedPackageDir, emitted))).toBe(true);
    }

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    const allFiles = walk(installedPackageDir).map((p) => path.relative(installedPackageDir, p).replace(/\\/g, '/'));
    expect(allFiles.some((p) => p.endsWith('.map'))).toBe(false);
  }, 180_000);
});
