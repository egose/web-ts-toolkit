import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

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
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, Record<string, string> | string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
};

const testVersion = '0.99.0-mdb09';
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
  { name: '@web-ts-toolkit/express-oidc-vault', dir: path.resolve(workspaceRoot, 'packages', 'express-oidc-vault') },
  { name: '@web-ts-toolkit/express-oidc-vault-mongodb-store', dir: packageRoot },
] as const;

function run(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, failure.stdout, failure.stderr, failure.message]
        .filter(Boolean)
        .join('\n'),
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

  writeFileSync(path.resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

let packedWorkspaceCache:
  | { tarballs: Record<string, string>; manifests: Record<string, PackageJson>; contents: Record<string, string[]> }
  | undefined;

function preparePackedWorkspace() {
  if (packedWorkspaceCache) {
    return packedWorkspaceCache;
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'mdb09-packed-'));
  tempRoots.push(tempRoot);
  seedToolVersions(tempRoot);
  const tarballDir = path.resolve(tempRoot, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  const manifests: Record<string, PackageJson> = {};
  const contents: Record<string, string[]> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = buildPublishedManifest(pkg.dir, rawManifest);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    run('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);

    const tarballName = pkg.name.replace('@web-ts-toolkit/', 'web-ts-toolkit-');
    const tarball = path.resolve(tarballDir, `${tarballName}-${testVersion}.tgz`);
    if (!existsSync(tarball)) {
      throw new Error(`pnpm pack did not produce expected tarball: ${tarball}`);
    }

    tarballs[pkg.name] = tarball;
    manifests[pkg.name] = manifest;
    contents[pkg.name] = run('tar', ['-tzf', tarball], tarballDir).trim().split('\n').sort();
  }

  packedWorkspaceCache = { tarballs, manifests, contents };
  return packedWorkspaceCache;
}

function stagePackedConsumer(): string {
  const packed = preparePackedWorkspace();
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'mdb09-consumer-'));
  tempRoots.push(consumerDir);
  seedToolVersions(consumerDir);

  writeFileSync(
    path.resolve(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@web-ts-toolkit/express-oidc-vault': `file:${packed.tarballs['@web-ts-toolkit/express-oidc-vault']}`,
          '@web-ts-toolkit/express-oidc-vault-mongodb-store': `file:${packed.tarballs['@web-ts-toolkit/express-oidc-vault-mongodb-store']}`,
          express: '^5.2.1',
          mongodb: '^6.20.0',
        },
        devDependencies: {
          '@types/express': '^5.0.6',
          '@types/node': rootPackageJson.devDependencies['@types/node'],
          typescript: rootPackageJson.devDependencies.typescript,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'pnpm-workspace.yaml'),
    `${['packages: []', 'overrides:']
      .concat(workspacePackages.map((pkg) => `  '${pkg.name}': file:${packed.tarballs[pkg.name]}`))
      .join('\n')}\n`,
  );
  run('pnpm', ['install'], consumerDir);

  return consumerDir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('MDB-09 packed MongoDB store contract', () => {
  it('applies release-like metadata and packs only intended package files', () => {
    const packed = preparePackedWorkspace();
    const manifest = packed.manifests['@web-ts-toolkit/express-oidc-vault-mongodb-store'];
    const contents = packed.contents['@web-ts-toolkit/express-oidc-vault-mongodb-store'];

    expect(manifest.version).toBe(testVersion);
    expect(manifest.main).toBe('./index.js');
    expect(manifest.module).toBe('./index.mjs');
    expect(manifest.types).toBe('./index.d.ts');
    expect(manifest.exports).toEqual({
      '.': { types: './index.d.ts', import: './index.mjs', require: './index.js', default: './index.js' },
    });
    expect(manifest.dependencies).toMatchObject({
      '@web-ts-toolkit/express-oidc-vault': testVersion,
      mongodb: '^6.20.0',
    });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.files).toEqual(['**/*', '!**/*.map']);

    expect(contents).toEqual(expect.arrayContaining(['package/LICENSE', 'package/README.md', 'package/package.json']));
    for (const entry of contents) {
      expect(entry).toMatch(/^package\/(?:LICENSE|README\.md|package\.json|index\.(?:js|mjs|d\.ts|d\.mts|d\.cts))$/);
    }
  });

  it('loads the packed root entry from ESM and CJS consumers', () => {
    const consumerDir = stagePackedConsumer();

    writeFileSync(
      path.resolve(consumerDir, 'consumer.mjs'),
      `import * as api from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

if (typeof api.createMongoOidcVaultStore !== 'function') throw new Error('ESM factory export missing');
if (api.DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS !== 300000) throw new Error('ESM default alias retention export missing');
if ('MongoOidcVaultStore' in api || 'resolveCollectionNames' in api) throw new Error('ESM internal export leaked');
`,
    );
    writeFileSync(
      path.resolve(consumerDir, 'consumer.cjs'),
      `const api = require('@web-ts-toolkit/express-oidc-vault-mongodb-store');

if (typeof api.createMongoOidcVaultStore !== 'function') throw new Error('CJS factory export missing');
if (api.DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS !== 300000) throw new Error('CJS default alias retention export missing');
if ('MongoOidcVaultStore' in api || 'resolveCollectionNames' in api) throw new Error('CJS internal export leaked');
`,
    );

    run('node', ['consumer.mjs'], consumerDir);
    run('node', ['consumer.cjs'], consumerDir);
  });

  it('compiles supported public types under strict NodeNext from package-name imports', () => {
    const consumerDir = stagePackedConsumer();

    writeFileSync(
      path.resolve(consumerDir, 'consumer-types.ts'),
      `import { createMongoOidcVaultStore, DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';
import type { MongoOidcVaultStoreOptions, OidcVaultMongoStoreProvider } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';
import type { OidcVaultStoreProvider } from '@web-ts-toolkit/express-oidc-vault';
import type { Db } from 'mongodb';

declare const db: Db;

const options: MongoOidcVaultStoreOptions = {
  db,
  authorizationTransactionsCollectionName: 'auth_oidc_transactions',
  exchangeCodesCollectionName: 'auth_oidc_exchange_codes',
  sessionsCollectionName: 'auth_oidc_sessions',
  backchannelLogoutTokenJtisCollectionName: 'auth_oidc_backchannel_logout_jtis',
  rotatedSessionAliasesCollectionName: 'auth_oidc_rotated_session_aliases',
  rotatedSessionAliasRetentionMs: DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS,
  now: () => Date.now(),
};

const provider: OidcVaultMongoStoreProvider = createMongoOidcVaultStore(options);
const baseProvider: OidcVaultStoreProvider = provider;

void [provider.ready(), baseProvider];
`,
    );
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-nodenext.json'),
      `${JSON.stringify(
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
          include: ['consumer-types.ts'],
        },
        null,
        2,
      )}\n`,
    );

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
  }, 30_000);
});
