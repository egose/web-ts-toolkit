import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { cleanupTempDirs, copyIfExists, createTempDir, writeProjectFile } from './temp';
import { runChecked } from './subprocess';

const localRequire = createRequire(import.meta.url);
const publisherRequire = createRequire(localRequire.resolve('@repo-toolkit/release-artifact')) as NodeRequire;
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

export type PackageJson = Record<string, any> & { name: string; version: string };

export const packageRoot = path.resolve(__dirname, '..', '..');
export const workspaceRoot = path.resolve(packageRoot, '..', '..');
export const packageName = '@web-ts-toolkit/mongoose-rxdb';
export const testVersion = '0.99.0-mrx01';

const workspacePackages = [{ name: packageName, dir: packageRoot }] as const;

let cache:
  | {
      tempRoot: string;
      tarballs: Record<string, string>;
      manifests: Record<string, PackageJson>;
      contents: Record<string, string[]>;
    }
  | undefined;

export function cleanupPackedConsumerHarness(): void {
  cleanupTempDirs();
  cache = undefined;
}

export async function preparePackedWorkspace() {
  if (cache) return cache;

  const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as PackageJson;
  const tempRoot = createTempDir('mongoose-rxdb-mrx01-packed-');
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};
  const contents: Record<string, string[]> = {};

  for (const pkg of workspacePackages) {
    const raw = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = createPublishPackageJson(raw, {
      version: testVersion,
      internalPackageNames: new Set(workspacePackages.map((entry) => entry.name)),
      rootMetadata: {
        author: rootPackageJson.author,
        bugs: rootPackageJson.bugs,
        engines: rootPackageJson.engines,
        license: rootPackageJson.license,
        repository: {
          ...rootPackageJson.repository,
          directory: path.relative(workspaceRoot, pkg.dir).replace(/\\/g, '/'),
        },
      },
      rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
    }) as PackageJson;
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePackage(pkg.dir, stageDir, manifest);
    await runChecked('pnpm', ['pack', '--pack-destination', tarballDir], { cwd: stageDir, timeoutMs: 30_000 });
    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const tarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(tarball)) throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
    tarballs[pkg.name] = tarball;
    manifests[pkg.name] = manifest;
    contents[pkg.name] = (await runChecked('tar', ['-tzf', tarball], { cwd: tarballDir, timeoutMs: 10_000 }))
      .trim()
      .split('\n')
      .sort();
  }

  cache = { tempRoot, tarballs, manifests, contents };
  return cache;
}

export async function installPackedConsumer(packageManager: 'pnpm' | 'npm' = 'pnpm'): Promise<string> {
  const packed = await preparePackedWorkspace();
  const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as PackageJson;
  const consumerDir = createTempDir(`mongoose-rxdb-mrx01-${packageManager}-consumer-`);
  seedToolVersions(consumerDir);

  writeProjectFile(
    consumerDir,
    'package.json',
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`]),
        ),
        devDependencies: {
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  if (packageManager === 'pnpm') {
    writeProjectFile(
      consumerDir,
      'pnpm-workspace.yaml',
      `${['packages: []', 'overrides:']
        .concat(workspacePackages.map((pkg) => `  '${pkg.name}': file:${packed.tarballs[pkg.name]}`))
        .join('\n')}\n`,
    );
    await runChecked('pnpm', ['install', '--no-frozen-lockfile'], { cwd: consumerDir, timeoutMs: 60_000 });
  } else {
    await runChecked('npm', ['install', '--ignore-scripts'], { cwd: consumerDir, timeoutMs: 60_000 });
  }
  return consumerDir;
}

export function containsDisallowedPublishedValue(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('PLACEHOLDER') || value.includes('workspace:');
  if (Array.isArray(value)) return value.some(containsDisallowedPublishedValue);
  if (value && typeof value === 'object') return Object.values(value).some(containsDisallowedPublishedValue);
  return false;
}

function stagePackage(sourceDir: string, stageDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  copyIfExists(path.resolve(sourceDir, 'dist'), stageDir);
  for (const entry of DEFAULT_PACKAGE_FILES)
    copyIfExists(path.resolve(sourceDir, entry), path.resolve(stageDir, path.basename(entry)));
  copyIfExists(path.resolve(workspaceRoot, 'LICENSE'), path.resolve(stageDir, 'LICENSE'));
  writeProjectFile(stageDir, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

function seedToolVersions(dir: string): void {
  copyIfExists(path.resolve(workspaceRoot, '.tool-versions'), path.resolve(dir, '.tool-versions'));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
