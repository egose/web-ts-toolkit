import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  type PackageJson,
  cleanupTempRoots,
  containsDisallowedPublishedValue,
  installPackedConsumer,
  packageRoot,
  preparePackedWorkspace,
  reactPackage,
  rootPackageJson,
  run,
  testVersion,
  unpackTarball,
  unpackTarballToDir,
  workspacePackages,
} from './packed-consumer-harness';

/**
 * ARR-10: Test the packed CJS, ESM, and declaration surface of
 * `@web-ts-toolkit/access-router-react`.
 *
 * The repository's existing test suite imports package *source* (`../src`)
 * rather than the published artifact, so breakages in the export map,
 * declaration conditions, production release transformation, or
 * `workspace:*` / `0.0.0-PLACEHOLDER` rewriting never surface during local
 * development. This file exercises the *real* `@repo-toolkit/publish-package`
 * release transformation (`createPublishPackageJson`) — the exact transform
 * `repo-toolkit-publish-package` / `repo-toolkit-publish-packages` applies at
 * release time — to stage and pack the access-router-react package, install
 * the staged tarball plus its internal `@web-ts-toolkit/access-router-client`
 * + `@web-ts-toolkit/utils` dependency closure (and the external React peer
 * deps) in a fresh consumer, then execute CJS `require`, ESM `import`,
 * NodeNext typecheck, and Bundler typecheck with `strict: true` and
 * `skipLibCheck: false`. Manifest and packed-file assertions prove version /
 * license / repository rewriting, `workspace:*` resolution, `sideEffects:
 * false` inclusion, and the deliberate ESM/CJS declaration-condition mapping
 * (so the emitted `.d.mts` is reachable rather than shipped as unreachable
 * dead weight).
 *
 * The install/staging plumbing lives in `./packed-consumer-harness.ts` and
 * is shared with the ARR-10 documentation compile test so the two files do
 * not drift on the staging contract.
 */

const consumerSourceDir = path.resolve(packageRoot, 'test-packed-consumer', 'consumer');

function copyConsumerSources(consumerDir: string): void {
  for (const file of [
    'consumer.cjs',
    'consumer.mjs',
    'consumer-types.ts',
    'tsconfig-nodenext.json',
    'tsconfig-bundler.json',
  ]) {
    const source = path.resolve(consumerSourceDir, file);
    if (!existsSync(source)) {
      throw new Error(`missing consumer source fixture: ${source}`);
    }
    cpSync(source, path.resolve(consumerDir, file));
  }
}

afterAll(() => {
  cleanupTempRoots();
});

describe('ARR-10 packed-package compatibility using the real release transformation', () => {
  it('applies the real `@repo-toolkit/publish-package` manifest transformation to the access-router-react tarball', () => {
    const packed = preparePackedWorkspace();
    const stagedManifest = packed.manifests[reactPackage.name];
    const unpackRoot = unpackTarballToDir(packed.tarballs[reactPackage.name]);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    // The packed manifest equals the staged one — proves the staging +
    // `pnpm pack` round-trips the same fields the publisher wrote.
    expect(packedManifest).toEqual(stagedManifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(rootPackageJson.engines).toEqual({ node: '>=20' });
    expect(packedManifest.engines).toEqual({ node: '>=20' });
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: 'packages/access-router-react',
    });
    // The publish files allowlist is the default `**/*` minus sourcemaps.
    expect(packedManifest.files).toEqual(['**/*', '!**/*.map']);
    // `dist/` prefixes stripped — `main`/`module`/`types` point at the
    // tarball root after the publish transformation flattens `dist/` away.
    expect(packedManifest.main).toBe('./index.js');
    expect(packedManifest.module).toBe('./index.mjs');
    expect(packedManifest.types).toBe('./index.d.ts');
    // Per-condition declaration mapping — ESM picks `.d.mts`, CJS picks
    // `.d.ts`, so the emitted `.d.mts` is reachable (ARR-10 requirement #1:
    // do not ship an unreachable `.d.mts` without rationale).
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
    // ARR-10 requirement #2 — `sideEffects: false` survives the publish
    // rewrite so bundlers can dead-code-eliminate the published React
    // helpers when tree-shaking an app that imports only `requestKeyFor`.
    expect(packedManifest.sideEffects).toBe(false);
    // The React peer dep range (`react ^18 || ^19`) is preserved through the
    // publish rewrite; the internal `@web-ts-toolkit/access-router-client`
    // workspace range is rewritten to the published test version.
    expect(packedManifest.peerDependencies).toMatchObject({
      '@web-ts-toolkit/access-router-client': testVersion,
      react: '^18.0.0 || ^19.0.0',
    });
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(unpackRoot, emitted))).toBe(true);
    }
  });

  it('rewrites every internal workspace dependency to the test version in all packed tarballs', () => {
    const packed = preparePackedWorkspace();
    for (const pkg of workspacePackages) {
      const manifest = unpackTarball(packed.tarballs[pkg.name]);
      expect(manifest.version).toBe(testVersion);
      expect(containsDisallowedPublishedValue(manifest)).toBe(false);
      for (const blockField of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
        const block = manifest[blockField];
        if (block) {
          for (const [name, range] of Object.entries(block)) {
            if (name.startsWith('@web-ts-toolkit/')) {
              expect(range).toBe(testVersion);
            }
          }
        }
      }
    }
  });

  it('`npm pack --dry-run --json` lists only intended files in the staged access-router-react tree', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, reactPackage.name.replace(/[@/]/g, '_'));
    const stdout = run('npm', ['pack', '--dry-run', '--json'], stageDir);
    const report = JSON.parse(stdout) as Array<{
      entryCount: number;
      bundled: unknown[];
      files: Array<{ path: string }>;
    }>;
    expect(report).toHaveLength(1);
    const [entry] = report;
    expect(entry.bundled).toEqual([]);
    const paths = entry.files.map((f: { path: string }) => f.path).sort();
    // LICENSE + README.md + four dist outputs + package.json. The React
    // package publishes no `llms.txt` (the website docs are the canonical
    // source per ARR-11), so the file set is one fewer than the client.
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
    // No stray build artifacts (sourcemaps, tsbuildinfo, src, test, etc.).
    const disallowed = paths.filter((p) => !expectedFiles.includes(p));
    expect(disallowed).toEqual([]);
  });

  it('installs the staged tarball + internal dependency closure + React peer deps and runs CJS, ESM, NodeNext, and Bundler consumers', () => {
    const consumerDir = installPackedConsumer();
    copyConsumerSources(consumerDir);

    // CJS require resolves from the fresh install via the `exports.require`
    // map — exercises the published `./index.js` entry and its runtime
    // export surface (matched against the curated runtime contract).
    run('node', ['consumer.cjs'], consumerDir);

    // ESM import resolves via `exports.import` (`./index.mjs`). `node`
    // picks `type: "module"` from the consumer package.json so `node
    // consumer.mjs` runs as native ESM.
    run('node', ['consumer.mjs'], consumerDir);

    // Strict NodeNext typecheck against the installed declarations,
    // resolved through the export map's per-condition `types.import`
    // (`./index.d.mts`). `skipLibCheck: false` so the package's own
    // declaration surface is fully checked.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);

    // Strict Bundler typecheck — same consumer source, Bundler resolution
    // through the export map's `types` field. `skipLibCheck: false`.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);

    // Sanity: the installed consumer has a real
    // `@web-ts-toolkit/access-router-react` in its node_modules (no workspace
    // path mapping, no source symlink).
    const installedReactDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'access-router-react');
    expect(existsSync(path.resolve(installedReactDir, 'package.json'))).toBe(true);
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedReactDir, 'package.json'), 'utf8'),
    ) as PackageJson;
    expect(installedManifest.version).toBe(testVersion);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(installedReactDir, emitted))).toBe(true);
    }
    // No source maps in the published tree (the publish `files` allowlist
    // excludes `**/*.map`).
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    const allFiles = walk(installedReactDir).map((p) => path.relative(installedReactDir, p).replace(/\\/g, '/'));
    expect(allFiles.some((p) => p.endsWith('.map'))).toBe(false);
  }, 240_000);
});
