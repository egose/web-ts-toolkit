import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * UTILS-09 verification (V3 source gate + V4 installed declarations).
 *
 * The strict contract fixture `test/types/strict-contracts.ts` is the single
 * source of truth: positive assignments must hold and every
 * `@ts-expect-error` line must fail. `tsc` rejects unused directives, so a
 * passing run proves the negatives are real (boxed guards, callback/property
 * map, intersectionBy, flattenDeep, reduce with/without initial, the approved
 * async contract, and the `PropertyPath` export).
 *
 * - V3: the package `tsconfig.json` gate plus the source fixture checked
 *   against workspace source with strict `noEmit`.
 * - V4: the same fixture rewritten to package-name imports, checked against
 *   the real release-transformed packed artifact under strict NodeNext
 *   (`.mts` import condition + `.cts` require condition) and Bundler (`.ts`),
 *   all with `skipLibCheck: false`, plus ESM/CJS runtime smokes. No
 *   workspace source aliases anywhere in the consumer.
 *
 * Broad manifest/allowlist assertions belong to UTILS-10's harness; this
 * file only stages what its own checks need and cleans only its own temp
 * directories.
 */

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const testVersion = '0.99.0-utils-ut09';
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

function readSourceFixture(): string {
  return readFileSync(path.resolve(packageRoot, 'test', 'types', 'strict-contracts.ts'), 'utf8');
}

function toInstalledFixture(source: string): string {
  if (!source.includes("from '../../src/index'")) {
    throw new Error('strict-contracts.ts no longer imports from ../../src/index; update the installed rewrite');
  }
  return source.replaceAll("from '../../src/index'", `from '${utilsPackage.name}'`);
}

let packedCache: { tarball: string; tempRoot: string } | undefined;

function preparePackedPackage() {
  if (packedCache) {
    return packedCache;
  }
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'utils-ut09-packed-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const rawManifest = JSON.parse(readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const manifest = createPublishPackageJson(rawManifest, {
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
  });
  const stageDir = path.resolve(tempRoot, utilsPackage.name.replace(/[@/]/g, '_'));
  mkdirSync(stageDir, { recursive: true });
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
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
  const tarball = path.resolve(tarballDir, `web-ts-toolkit-utils-${testVersion}.tgz`);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
  }
  packedCache = { tarball, tempRoot };
  return packedCache;
}

function stageInstalledConsumer(): string {
  const packed = preparePackedPackage();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'utils-ut09-consumer-'));
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
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    `packages: []\noverrides:\n  '${utilsPackage.name}': file:${packed.tarball}\n`,
  );
  run('pnpm', ['install'], consumerDir);

  const installedFixture = toInstalledFixture(readSourceFixture());
  writeFileSync(path.resolve(consumerDir, 'contracts.nodenext.mts'), installedFixture);
  writeFileSync(path.resolve(consumerDir, 'contracts.bundler.ts'), installedFixture);
  writeFileSync(
    path.resolve(consumerDir, 'contracts.require.cts'),
    `import utils = require('@web-ts-toolkit/utils');
import type { PropertyPath } from '@web-ts-toolkit/utils';

const names: string[] = utils.map([{ name: 'Ada' }], 'name');
const total: number = utils.reduce([1, 2], (acc, value) => acc + value, 0);
const flat: number[] = utils.flattenDeep<number>([1, [2]]);
const path: PropertyPath = ['a', 0];
// @ts-expect-error strict require-condition declarations are really checked, not skipped.
const bad: number = names;
void [names, total, flat, path, bad];
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'runtime.mjs'),
    `import assert from 'node:assert';
import {
  flattenDeep, get, intersectionBy, isBoolean, isNumber, isString, map, omit,
  pick, reduce, set, toAsyncFn,
} from '@web-ts-toolkit/utils';

// Boxed guards: primitive-only (UTILS-09 contract change).
assert.strictEqual(isBoolean(true), true);
assert.strictEqual(isBoolean(new Boolean(false)), false);
assert.strictEqual(isNumber(1), true);
assert.strictEqual(isNumber(new Number(1)), false);
assert.strictEqual(isString('x'), true);
assert.strictEqual(isString(new String('x')), false);

// map: callback + known-key shorthand.
assert.deepStrictEqual(map([{ name: 'Ada' }], 'name'), ['Ada']);
assert.deepStrictEqual(map([1, 2], (v) => v * 2), [2, 4]);

// intersectionBy: first-array inference, property iteratee.
assert.deepStrictEqual(intersectionBy([1, 2, 3], [2, 3], (v) => v), [2, 3]);
assert.deepStrictEqual(intersectionBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], 'id'), [{ id: 2 }]);

// flattenDeep: explicit assertion, non-array yields [].
assert.deepStrictEqual(flattenDeep([1, [2, [3]]]), [1, 2, 3]);
assert.deepStrictEqual(flattenDeep('nope'), []);

// reduce: with/without initial; empty without initial throws.
assert.strictEqual(reduce([1, 2, 3], (acc, v) => acc + v, 0), 6);
assert.strictEqual(reduce([1, 2, 3], (acc, v) => acc + v), 6);
assert.throws(() => reduce([], (acc, v) => acc + v), TypeError);

// toAsyncFn: approved UTILS-07 semantics (sync lift, thenable identity, default).
const lifted = toAsyncFn((v) => v * 2);
assert.ok(lifted(21) instanceof Promise);
assert.strictEqual(await lifted(21), 42);
const thenable = { then: (resolve) => resolve('kept') };
const adapted = toAsyncFn(() => thenable);
assert.strictEqual(await adapted(), 'kept');
const fallback = toAsyncFn(undefined, 'dflt');
assert.strictEqual(await fallback(), 'dflt');

// PropertyPath-driven helpers.
const target = {};
set(target, 'a.b', 1);
assert.strictEqual(get(target, 'a.b'), 1);
assert.deepStrictEqual(pick(target, ['a']), { a: { b: 1 } });
assert.deepStrictEqual(omit(target, [['a']]), {});
`,
  );

  writeFileSync(
    path.resolve(consumerDir, 'runtime.cjs'),
    `const assert = require('node:assert');
const utils = require('@web-ts-toolkit/utils');

assert.strictEqual(utils.isString('x'), true);
assert.strictEqual(utils.isString(new String('x')), false);
assert.strictEqual(utils.isBoolean(new Boolean(true)), false);
assert.deepStrictEqual(utils.map([{ name: 'Ada' }], 'name'), ['Ada']);
assert.deepStrictEqual(utils.intersectionBy([1, 2], [2], (v) => v), [2]);
assert.deepStrictEqual(utils.flattenDeep([1, [2]]), [1, 2]);
assert.strictEqual(utils.reduce([1, 2], (acc, v) => acc + v, 10), 13);
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
        include: ['contracts.nodenext.mts', 'contracts.require.cts'],
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
        include: ['contracts.bundler.ts'],
      },
      null,
      2,
    ),
  );

  return consumerDir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('UTILS-09 strict signatures and declaration conditions', () => {
  it('passes the strict no-emit source gate (V3)', () => {
    run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'packages/utils/tsconfig.json', '--strict'], workspaceRoot);
  }, 180_000);

  it('typechecks the strict source contract fixture against workspace source (V3)', () => {
    run(
      'pnpm',
      [
        'exec',
        'tsc',
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--target',
        'es2022',
        '--module',
        'esnext',
        '--moduleResolution',
        'bundler',
        '--types',
        'node',
        'test/types/strict-contracts.ts',
      ],
      packageRoot,
    );
  }, 180_000);

  it('checks installed declarations under strict NodeNext, Bundler, and both runtimes (V4)', () => {
    const consumerDir = stageInstalledConsumer();
    run('node', ['runtime.mjs'], consumerDir);
    run('node', ['runtime.cjs'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.bundler.json'], consumerDir);

    const installedDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'utils');
    expect(existsSync(path.resolve(installedDir, 'index.d.ts'))).toBe(true);
    expect(existsSync(path.resolve(installedDir, 'index.d.mts'))).toBe(true);
  }, 240_000);
});
