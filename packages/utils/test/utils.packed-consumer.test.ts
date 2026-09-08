import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
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
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
  sideEffects?: boolean | string[];
};

/**
 * UTILS-10 requirements 2-3: utils-owned release-transformed
 * packed-consumer fixture.
 *
 * Reuses the proven approach from
 * `packages/http-errors/test/strict-consumer-types.test.ts` (real
 * `@repo-toolkit/publish-package` `createPublishPackageJson` release
 * transformation, `pnpm pack` of the staged tree, fresh `/tmp` consumer
 * install, ESM + CJS runtime plus strict NodeNext + Bundler typechecks with
 * `skipLibCheck: false`), scoped to the single `@web-ts-toolkit/utils`
 * package. Only this file's own temp directories are removed in `afterAll`;
 * no workspace state (including the ignored `src/*.js` siblings) is touched.
 * Broad inference assertions are deliberately left to UTILS-09: the consumer
 * types below check named-import declaration resolution, not generic result
 * inference.
 */

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const testVersion = '0.99.0-utils-ut10';
const tempRoots: string[] = [];
const utilsPackage = { name: '@web-ts-toolkit/utils', dir: packageRoot };
const rootPackageJson = JSON.parse(readFileSync(path.resolve(workspaceRoot, 'package.json'), 'utf8')) as {
  license: string;
  author?: string;
  bugs?: unknown;
  engines?: Record<string, string>;
  repository: { type?: string; url?: string };
  devDependencies: Record<string, string>;
};

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const details = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error([details.message, details.stdout, details.stderr].filter(Boolean).join('\n'), { cause: error });
  }
}

function seedToolVersions(dir: string): void {
  const workspaceToolVersions = path.resolve(workspaceRoot, '.tool-versions');
  if (existsSync(workspaceToolVersions)) {
    cpSync(workspaceToolVersions, path.resolve(dir, '.tool-versions'));
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

/** Named root exports parsed from `src/index.ts` — the source contract the installed artifact must match. */
function readSourceExportNames(): string[] {
  const indexSource = readFileSync(path.resolve(packageRoot, 'src', 'index.ts'), 'utf8');
  const names = [...indexSource.matchAll(/export\s+\{\s+default\s+as\s+(\w+)\s+\}/g)].map((match) => match[1]);
  const unique = [...new Set(names)].sort();
  if (unique.length === 0) {
    throw new Error('no named exports parsed from src/index.ts');
  }
  return unique;
}

function buildPublishedManifest(sourceManifest: PackageJson): PackageJson {
  return createPublishPackageJson(sourceManifest as Record<string, unknown>, {
    version: testVersion,
    internalPackageNames: new Set([utilsPackage.name]),
    rootMetadata: {
      author: rootPackageJson.author,
      bugs: rootPackageJson.bugs,
      engines: rootPackageJson.engines,
      license: rootPackageJson.license,
      repository: { ...rootPackageJson.repository, directory: 'packages/utils' },
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  }) as PackageJson;
}

function stagePublishedPackage(stageDir: string, manifest: PackageJson): void {
  mkdirSync(stageDir, { recursive: true });
  // Stage exactly as the publisher would: built `dist/` outputs flattened to
  // the package root, plus shipped package files and the root LICENSE.
  cpSync(path.resolve(packageRoot, 'dist'), stageDir, { recursive: true });
  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = path.resolve(packageRoot, entry);
    if (existsSync(source)) {
      cpSync(source, path.resolve(stageDir, path.basename(entry)));
    }
  }
  const licenseSource = path.resolve(workspaceRoot, 'LICENSE');
  if (existsSync(licenseSource)) {
    cpSync(licenseSource, path.resolve(stageDir, 'LICENSE'));
  }
  writeFileSync(path.resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

let packedCache: { tarball: string; manifest: PackageJson; tempRoot: string } | undefined;

function preparePackedPackage() {
  if (packedCache) {
    return packedCache;
  }
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'utils-ut10-packed-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const rawManifest = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as PackageJson;
  const manifest = buildPublishedManifest(rawManifest);
  const stageDir = path.resolve(tempRoot, utilsPackage.name.replace(/[@/]/g, '_'));
  stagePublishedPackage(stageDir, manifest);
  // NOTE: do not seed `.tool-versions` into the stage dir — the publish
  // `files` allowlist covers dotfiles and it would leak into the tarball.
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
  const tarball = path.resolve(tarballDir, `web-ts-toolkit-utils-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }
  packedCache = { tarball, manifest, tempRoot };
  return packedCache;
}

function unpackTarballToDir(tarballPath: string): string {
  const unpackRoot = mkdtempSync(path.join(os.tmpdir(), 'utils-ut10-unpack-'));
  tempRoots.push(unpackRoot);
  run('tar', ['-xzf', tarballPath, '-C', unpackRoot], workspaceRoot);
  return path.resolve(unpackRoot, 'package');
}

function stagePackedConsumer(): string {
  const packed = preparePackedPackage();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'utils-ut10-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: { [utilsPackage.name]: `file:${packed.tarball}` },
        devDependencies: {
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    ),
  );
  // Pin the staged tarball via an override so pnpm never reaches the
  // registry for the sentinel test version.
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    `packages: []\noverrides:\n  '${utilsPackage.name}': file:${packed.tarball}\n`,
  );
  run('pnpm', ['install'], consumerDir);
  return consumerDir;
}

function writeConsumerFiles(consumerDir: string, expectedExports: string[]): void {
  const expectedLiteral = JSON.stringify(expectedExports);

  writeFileSync(
    path.resolve(consumerDir, 'esm.mjs'),
    `import assert from 'node:assert';
import * as utils from '@web-ts-toolkit/utils';
import { cloneDeep, flattenDeep, get, groupBy, hasOwn, isEqual, set } from '@web-ts-toolkit/utils';

const entry = import.meta.resolve('@web-ts-toolkit/utils');
assert.ok(entry.endsWith('/index.mjs'), 'ESM entry resolves to published ./index.mjs, got ' + entry);

const expected = ${expectedLiteral};
assert.deepStrictEqual(Object.keys(utils).sort(), expected, 'ESM export surface matches src/index.ts');

assert.strictEqual(get({ user: { profile: { name: 'Ada' } } }, 'user.profile.name'), 'Ada');
assert.strictEqual(hasOwn({ name: 'Ada' }, 'name'), true);
assert.strictEqual(hasOwn(Object.create({ name: 'Ada' }), 'name'), false);
const target = {};
assert.strictEqual(set(target, 'a.b', 1), target);
assert.strictEqual(get(target, 'a.b'), 1);
assert.deepStrictEqual(
  groupBy(
    [
      { type: 'fruit', name: 'apple' },
      { type: 'vegetable', name: 'carrot' },
      { type: 'fruit', name: 'banana' },
    ],
    'type',
  ),
  {
    fruit: [
      { type: 'fruit', name: 'apple' },
      { type: 'fruit', name: 'banana' },
    ],
    vegetable: [{ type: 'vegetable', name: 'carrot' }],
  },
);
const original = { nested: { value: 1 } };
const copy = cloneDeep(original);
assert.strictEqual(isEqual(original, copy), true);
assert.notStrictEqual(copy, original);
copy.nested.value = 2;
assert.strictEqual(original.nested.value, 1);
assert.deepStrictEqual(flattenDeep([1, [2, [3]]]), [1, 2, 3]);
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'cjs.cjs'),
    `const assert = require('node:assert');
const utils = require('@web-ts-toolkit/utils');

const entry = require.resolve('@web-ts-toolkit/utils');
assert.ok(entry.endsWith('/index.js'), 'CJS entry resolves to published ./index.js, got ' + entry);

const expected = ${expectedLiteral};
assert.deepStrictEqual(Object.keys(utils).sort(), expected, 'CJS export surface matches src/index.ts');

assert.strictEqual(utils.get({ user: { profile: { name: 'Ada' } } }, 'user.profile.name'), 'Ada');
assert.strictEqual(utils.hasOwn({ name: 'Ada' }, 'name'), true);
const target = {};
utils.set(target, 'a.b', 1);
assert.strictEqual(utils.get(target, 'a.b'), 1);
assert.deepStrictEqual(utils.flattenDeep([1, [2, [3]]]), [1, 2, 3]);
assert.strictEqual(utils.isEqual({ a: 1 }, { a: 1 }), true);
assert.strictEqual(utils.isEqual({ a: 1 }, { a: 2 }), false);
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import { cloneDeep, get, groupBy, hasOwn, isEqual } from '@web-ts-toolkit/utils';

// @ts-expect-error no such export: proves declarations are really checked, not skipped
import { __noSuchExport__ } from '@web-ts-toolkit/utils';

const name: unknown = get({ user: { name: 'Ada' } }, 'user.name');
const flag: boolean = hasOwn({ name: 'Ada' }, 'name');
const grouped: Record<string, Array<{ type: string; name: string }>> = groupBy(
  [{ type: 'fruit', name: 'apple' }],
  'type',
);
const copy: { nested: { value: number } } = cloneDeep({ nested: { value: 1 } });
const equal: boolean = isEqual({ a: 1 }, { a: 1 });
void [name, flag, grouped, copy, equal, __noSuchExport__];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import utils = require('@web-ts-toolkit/utils');

const name: unknown = utils.get({ user: { name: 'Ada' } }, 'user.name');
const flag: boolean = utils.hasOwn({ name: 'Ada' }, 'name');
void [name, flag];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import { normalizeUrlPath, startCase, sumBy } from '@web-ts-toolkit/utils';

const pathValue: string = normalizeUrlPath('api//users');
const title: string = startCase('api_response_time');
const total: number = sumBy([{ hours: 2 }, { hours: 3 }], 'hours');
void [pathValue, title, total];
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
          types: ['node'],
        },
        include: ['consumer.nodenext.mts', 'consumer.nodenext.cts'],
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
          types: ['node'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    ),
  );
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('UTILS-10 packed consumer compatibility using the real release transformation', () => {
  it('applies the real `@repo-toolkit/publish-package` manifest transformation to the utils tarball', () => {
    const packed = preparePackedPackage();
    const unpackRoot = unpackTarballToDir(packed.tarball);
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as PackageJson;

    // The packed manifest equals the staged one — proves staging + `pnpm
    // pack` round-trips exactly what the publisher wrote. All field
    // expectations below therefore come from the production transformer,
    // not hand-guessed placeholder replacement.
    expect(packedManifest).toEqual(packed.manifest);
    expect(packedManifest.version).toBe(testVersion);
    expect(packedManifest.license).toBe(rootPackageJson.license);
    expect(packedManifest.repository).toEqual({
      ...rootPackageJson.repository,
      directory: 'packages/utils',
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
    expect(packedManifest.dependencies ?? {}).toEqual({});
    expect(packedManifest.devDependencies).toBeUndefined();
    expect(packedManifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(packedManifest)).toBe(false);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(unpackRoot, emitted))).toBe(true);
    }
  }, 120_000);

  it('packs only intended files with no source/test leakage', () => {
    const packed = preparePackedPackage();
    const unpackRoot = unpackTarballToDir(packed.tarball);
    const entries = readdirSync(unpackRoot).sort();
    // LICENSE + shipped README.md + four dist outputs + rewritten manifest.
    expect(entries).toEqual([
      'LICENSE',
      'README.md',
      'index.d.mts',
      'index.d.ts',
      'index.js',
      'index.mjs',
      'package.json',
    ]);
    expect(entries.some((entry) => entry === 'src' || entry === 'test')).toBe(false);
    expect(entries.some((entry) => entry.endsWith('.map'))).toBe(false);
    // The shipped README documents the installed package name.
    expect(readFileSync(path.resolve(unpackRoot, 'README.md'), 'utf8')).toContain("from '@web-ts-toolkit/utils'");
  }, 120_000);

  it('installs the staged tarball and runs ESM, CJS, NodeNext, and Bundler consumers with no source aliases', () => {
    const expectedExports = readSourceExportNames();
    const consumerDir = stagePackedConsumer();
    writeConsumerFiles(consumerDir, expectedExports);

    // Named ESM package import resolves through `exports.import`.
    run('node', ['esm.mjs'], consumerDir);
    // Named CJS package import resolves through `exports.require`.
    run('node', ['cjs.cjs'], consumerDir);
    // Strict NodeNext typechecks against the installed declarations via the
    // per-condition `types.import` (`./index.d.mts`) and `types.require`
    // (`./index.d.ts`) map. `skipLibCheck: false`.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
    // Strict Bundler typecheck — same installed declarations, no `paths`.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);

    // The installed consumer carries a real packed `@web-ts-toolkit/utils`
    // (no workspace path mapping, no source symlink to `packages/utils`).
    const installedDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'utils');
    expect(existsSync(path.resolve(installedDir, 'package.json'))).toBe(true);
    const installedManifest = JSON.parse(
      readFileSync(path.resolve(installedDir, 'package.json'), 'utf8'),
    ) as PackageJson;
    expect(installedManifest.version).toBe(testVersion);
    for (const emitted of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts']) {
      expect(existsSync(path.resolve(installedDir, emitted))).toBe(true);
    }
    expect(existsSync(path.resolve(installedDir, 'src'))).toBe(false);
    expect(existsSync(path.resolve(installedDir, 'test'))).toBe(false);
    expect(readFileSync(path.resolve(installedDir, 'README.md'), 'utf8')).toContain("from '@web-ts-toolkit/utils'");
  }, 180_000);
});
