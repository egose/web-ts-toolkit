import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * CLIENT-06 shared packed-tarball harness for
 * `@web-ts-toolkit/oidc-vault-dpop-client`.
 *
 * The packed-consumer test and the documentation compile test both need the
 * real `npm pack` tarball of this package (whose `files` allowlist is
 * `["README.md", "llms.txt", "dist"]`, so the tarball keeps the `dist/` prefix the
 * `exports` map points at), an extracted view of that tarball, and a fresh
 * external-consumer tree under `/tmp` that installs the tarball via a
 * `file:` dependency and runs `tsc` against the installed declarations via
 * the export map (no `tsconfig.json` `paths` override). Centralizing the
 * pack + install plumbing here keeps the two test files from drifting on
 * the staging contract — mirroring the access-router-client/react
 * `packed-consumer-harness.ts` layout (without the publish-transformation
 * staging, which is CLIENT-09 release territory: this package packs
 * `dist/` as-is).
 *
 * `preparePackedTarball()` is memoized per test process so both test files
 * reuse the same tarball rather than paying the pack cost twice.
 */

export const packageRoot = path.resolve(__dirname, '..');
export const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

export const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
};

export const typescriptVersion = rootPackageJson.devDependencies.typescript;
export const nodeTypesVersion = rootPackageJson.devDependencies['@types/node'];

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
 * `node` processes (started from a consumer tree under `/tmp`) resolve the
 * same runtime versions the workspace pins. Without this, asdf walks up
 * from the consumer dir to `/` and `pnpm` falls back to "no version is
 * set", failing the install. Keeps the test self-contained rather than
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

let packedTarballCache: string | undefined;

/**
 * Run the real `npm pack` in the package directory (honoring the `files:
 * ["README.md", "llms.txt", "dist"]` allowlist) into a fresh temp directory and return
 * the produced tarball path.
 *
 * Re-run the package `build` before invoking this so the packed `dist/`
 * reflects the current source (the package `test` script builds first, and
 * workspace builds stay serialized per `AGENTS.md`).
 */
export function preparePackedTarball(): string {
  if (packedTarballCache) {
    return packedTarballCache;
  }
  const packDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'oidc-vault-dpop-client-pack-')));
  seedToolVersions(packDir);
  run('npm', ['pack', '--pack-destination', packDir], packageRoot);
  const tarballs = readdirSync(packDir).filter((entry) => entry.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`npm pack produced an unexpected tarball set in ${packDir}: ${tarballs.join(', ')}`);
  }
  packedTarballCache = path.resolve(packDir, tarballs[0] as string);
  return packedTarballCache;
}

/**
 * Unpack a packed tarball into a fresh temp directory and return the
 * `package/`-rooted path inside it (the layout `npm pack` produces). The
 * returned directory is registered for teardown.
 */
export function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'oidc-vault-dpop-client-unpack-')));
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

/**
 * Install the packed tarball into a fresh external consumer tree under
 * `/tmp` via a `file:` dependency (plus `typescript` + `@types/node` from
 * the registry for the strict typecheck lanes, exactly how an external
 * consumer resolves them). Returns the consumer directory.
 */
export function installPackedConsumer(): string {
  const tarball = preparePackedTarball();
  const consumerDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'oidc-vault-dpop-client-consumer-')));
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'oidc-vault-dpop-client-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@web-ts-toolkit/oidc-vault-dpop-client': `file:${tarball}`,
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

  writeFileSync(path.resolve(consumerDir, 'pnpm-workspace.yaml'), 'packages: []\n');

  run('pnpm', ['install', '--no-frozen-lockfile'], consumerDir);
  return consumerDir;
}
