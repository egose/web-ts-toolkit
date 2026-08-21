import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * ARC-18 + ARC-20 shared packed-tarball harness.
 *
 * The packed-consumer compatibility test (ARC-18) and the documentation
 * compile test (ARC-20) both need to stage the access-router-client npm
 * tarball through the real `@repo-toolkit/publish-package` release
 * transformation, install it (plus its internal `@web-ts-toolkit/utils`
 * dependency closure) into a fresh external-consumer tree under `/tmp`, and
 * run `tsc` against the installed declarations via the export map (no
 * `tsconfig.json` `paths` override). Centralizing the staging + install
 * plumbing here keeps the two test files from drifting on the staging
 * contract.
 *
 * `preparePackedWorkspace()` is memoized per test process — both tests
 * reuse the same staged tarballs so we do not pay the pack/pack cost twice.
 */

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

export type PackageJson = {
  name: string;
  version: string;
  license?: string;
  repository?: string | { type?: string; url?: string };
  sideEffects?: string[] | boolean;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  bin?: Record<string, string> | string;
  exports?: Record<string, unknown>;
  engines?: Record<string, string>;
  browserslist?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

export type PackedWorkspace = {
  tempRoot: string;
  tarballs: Record<string, string>;
  manifests: Record<string, PackageJson>;
};

export const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
export const packageRoot = path.resolve(__dirname, '..');

export const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  version: string;
  license: string;
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};

/**
 * Test version stamped into every packed tarball and the resolved manifest.
 * A non-released sentinel version is used so an accidental registry lookup of
 * these tarballs (e.g. via a leaked lockfile entry) cannot collide with a
 * published release.
 */
export const testVersion = '0.99.0-test';
export const rootLicensePath = path.resolve(workspaceRoot, 'LICENSE');
export const typescriptVersion = rootPackageJson.devDependencies.typescript;
export const nodeTypesVersion = rootPackageJson.devDependencies['@types/node'];
export const axiosVersion = '^1.18.1';

export const clientPackage = { name: '@web-ts-toolkit/access-router-client', dir: packageRoot };
export const internalDependencyPackages = [
  { name: '@web-ts-toolkit/utils', dir: path.resolve(workspaceRoot, 'packages/utils') },
] as const;

export const workspacePackages = [clientPackage, ...internalDependencyPackages] as const;

const tempRoots: string[] = [];

/**
 * Register a temp root for teardown. Each consumer test file calls
 * `afterAll(() => cleanupTempRoots())` so the temp roots actually get
 * released. Calling `cleanupTempRoots()` more than once is safe —
 * `rmSync(..., { force: true })` ignores a missing dir and the array is
 * idempotently drained.
 */
export function trackTempRoot(dir: string): string {
  tempRoots.push(dir);
  return dir;
}

export function cleanupTempRoots(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop() as string;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore — best-effort cleanup
    }
  }
}

export function run(command: string, args: string[], cwd: string): string {
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

/**
 * Seed an asdf `.tool-versions` into a temp directory so spawned `pnpm` /
 * `node` / `tsc` processes (started from a consumer tree under `/tmp`)
 * resolve the same runtime versions the workspace pins. Without this, asdf
 * walks up from the consumer dir to `/` and `pnpm` falls back to "no version
 * is set", failing the install. Keeps the test self-contained rather than
 * relying on ambient `/tmp/.tool-versions` state.
 */
export function seedToolVersions(dir: string): string {
  const workspaceToolVersions = path.resolve(workspaceRoot, '.tool-versions');
  if (!existsSync(workspaceToolVersions)) {
    return dir;
  }
  const targetToolVersions = path.resolve(dir, '.tool-versions');
  if (!existsSync(targetToolVersions)) {
    cpSync(workspaceToolVersions, targetToolVersions);
  }
  return dir;
}

function mergeRootRepository(
  rootRepository: { type?: string; url?: string } | undefined,
  packageDirRelative: string,
): { type?: string; url?: string; directory?: string } | undefined {
  if (!rootRepository || (typeof rootRepository !== 'object' && typeof rootRepository !== 'string')) {
    return undefined;
  }
  if (typeof rootRepository === 'string') {
    return rootRepository as unknown as { type?: string; url?: string };
  }
  return { ...rootRepository, directory: packageDirRelative };
}

/**
 * Compute the real production-rewritten manifest for a workspace package using
 * `createPublishPackageJson` from `@repo-toolkit/publish-package`. This is the
 * exact transformation `repo-toolkit-publish-package` performs at release
 * time: it strips `dist/` prefixes from `main`/`module`/`types`/`bin`/
 * `exports`, replaces the version placeholder, rewrites `workspace:` ranges
 * on internal dependencies to the target version, drops `devDependencies`/
 * `scripts`/`private`, copies `author`/`bugs`/`engines`/`license`/
 * `repository` metadata from the workspace root, and sets the publish files
 * allowlist to all non-sourcemap files. A regression in any of those steps
 * will surface as a mismatch in the assertions in the consumer tests.
 */
function buildPublishedManifest(
  sourceManifest: PackageJson,
  internalPackageNames: Set<string>,
  packageDirRelative: string,
): PackageJson {
  const rootMetadata = {
    author: rootPackageJson.author,
    bugs: rootPackageJson.bugs,
    engines: rootPackageJson.engines,
    license: rootPackageJson.license,
    repository: mergeRootRepository(rootPackageJson.repository, packageDirRelative),
  };
  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames,
    rootMetadata,
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

/**
 * Stage a package exactly as `repo-toolkit-publish-package` would stage its
 * publish directory: copy the existing built `dist/` outputs as the package
 * root, copy package files (README.md, llms.txt, CHANGELOG.md if present) and
 * root files (LICENSE) flattened into the staging root, and write the
 * production-rewritten `package.json`. The staged tree matches the layout
 * `npm publish` would pack.
 */
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

  if (existsSync(rootLicensePath)) {
    cpSync(rootLicensePath, path.resolve(stageDir, 'LICENSE'));
  }

  writeFileSync(path.resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

let packedWorkspaceCache: PackedWorkspace | undefined;

/**
 * Stage and `pnpm pack` the access-router-client and its internal
 * `@web-ts-toolkit/utils` dependency closure so the produced tarballs mirror
 * exactly what `repo-toolkit-publish-package` ships at release time. Result
 * is memoized per test process; both ARC-18 and ARC-20 reuse the same staged
 * tarballs rather than paying the pack/pack cost twice.
 *
 * Re-run the package `build` before invoking this so the staged `dist/`
 * reflects the current source.
 */
export function preparePackedWorkspace(): PackedWorkspace {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const internalPackageNames = new Set(workspacePackages.map((pkg) => pkg.name));
  const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'access-router-client-arc18-')));
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
    // NOTE: do NOT seed `.tool-versions` into the stage dir. `pnpm pack`
    // resolves node/pnpm by walking up toward `/` and finds the workspace
    // `.tool-versions`, but seeding the stage dir would include `.tool-versions`
    // in the published tarball (the `files` allowlist is `['**/*', '!**/*.map']`
    // and pathlib includes dotfiles), which would break the "only intended
    // files" assertion and is never part of the real released tree.
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const resolvedTarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(resolvedTarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${resolvedTarball}`);
    }
    tarballs[pkg.name] = resolvedTarball;
    manifests[pkg.name] = manifest;
  }

  packedWorkspaceCache = { tempRoot, tarballs, manifests };
  return packedWorkspaceCache;
}

/**
 * Install the staged client tarball + internal dependency closure into a
 * fresh external consumer tree under `/tmp`. External runtime deps (`axios`)
 * resolve from the npm registry exactly how an external consumer resolves
 * them. Returns the consumer directory.
 */
export function installPackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'access-router-client-consumer-')));
  seedToolVersions(consumerDir);

  // Pin every internal workspace package to the prepared local source via a
  // `pnpm-workspace.yaml` override so pnpm resolves the local closure rather
  // than recursing into the npm registry for the sentinel `0.99.0-test`
  // version (which would silently defeat the point of staging a local
  // release closure). External runtime deps (`axios`) come from the registry
  // exactly how an external consumer resolves them.
  const internalDeps = Object.fromEntries(
    workspacePackages.map((pkg) => [pkg.name, `file:${packed.tarballs[pkg.name]}`]),
  );

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'access-router-client-consumer',
        private: true,
        type: 'module',
        dependencies: {
          ...internalDeps,
          axios: axiosVersion,
        },
        devDependencies: {
          typescript: typescriptVersion,
          '@types/node': nodeTypesVersion,
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

export function containsDisallowedPublishedValue(value: unknown): boolean {
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

/**
 * Unpack a packed tarball into a fresh temp directory and return the
 * `package/`-rooted path inside it (the layout `npm pack` produces). The
 * returned directory is registered for teardown. Both the ARC-18 packed
 * compatibility test and the ARC-20 documentation compile test use this to
 * inspect the packed tree without polluting the shared stage.
 */
export function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'access-router-client-arc18-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

export function unpackTarball(tarballPath: string): PackageJson {
  return JSON.parse(readFileSync(path.resolve(unpackTarballToDir(tarballPath), 'package.json'), 'utf8')) as PackageJson;
}
