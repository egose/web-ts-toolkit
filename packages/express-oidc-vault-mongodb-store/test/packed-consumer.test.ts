import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createReplicaSetHarness } from './mongo-memory';

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
  exports?: Record<string, unknown>;
  engines?: Record<string, string>;
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
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
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

// DBJWT-13 harness-only handshake hardening (no product semantic, packed
// artifact, or assertion change). Root cause of the MDB-09 live-subprocess
// failures: a blocking spawn while the disposable replica set is live wedges
// mongod (see runAsync below), surfacing as MongoNetworkTimeoutError with
// beforeHandshake → PoolClearedError/ServerSelectionError before any
// guarded-replay/capacity assertion executes. Fixed by (a) async spawn so the
// harness keeps draining mongod's pipes, (b) an explicit bounded handshake
// budget in the temp consumers, and (c) at most ONE retry per consumer, only
// when the failure signature matches that driver handshake/pool-cleared flake.
// Product assertion failures never match this signature and are never retried.
const PACKED_MONGO_HANDSHAKE_FLAKE =
  /MongoNetworkTimeoutError|MongoPoolClearedError|PoolClearedError|beforeHandshake|HandshakeError/i;

function isPackedMongoHandshakeFlake(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return PACKED_MONGO_HANDSHAKE_FLAKE.test(message);
}

function runPackedConsumerWithHandshakeRetry(args: string[], cwd: string): Promise<string> {
  return runAsync('node', args, cwd).catch((error) => {
    if (!isPackedMongoHandshakeFlake(error)) throw error;
    return runAsync('node', args, cwd);
  });
}

// DBJWT-13: the live packed consumers MUST be spawned asynchronously. The
// replica-set harness (`mongodb-memory-server`) holds the disposable mongod's
// piped stdout/stderr; a blocking spawn (execFileSync) stalls this event loop
// while mongod is live, mongod's log output (connection accept/end churn from
// handshake retries under load) fills the OS pipe buffer, mongod blocks on
// write, and the whole server wedges: fresh handshakes time out with
// beforeHandshake → PoolClearedError/ServerSelectionError, CLOSE-WAITs pile
// up, and even a bounded retry fails because the loop is still blocked
// (reproduced 8/8 with sync spawn vs 0 failures with async spawn, same host,
// same mongod setup). Async spawn keeps the loop draining the pipes; the
// consumer passes in ~1s. Sync `run()` stays for every step that has no live
// mongod (pack/install/tsc/npm pack).
function runAsync(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            [`Command failed: ${command} ${args.join(' ')}`, stdout, stderr, error.message].filter(Boolean).join('\n'),
            { cause: error },
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
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
  | {
      tarballs: Record<string, string>;
      manifests: Record<string, PackageJson>;
      contents: Record<string, string[]>;
      stages: Record<string, string>;
    }
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
  const stages: Record<string, string> = {};

  for (const pkg of workspacePackages) {
    const rawManifest = JSON.parse(readFileSync(path.resolve(pkg.dir, 'package.json'), 'utf8')) as PackageJson;
    const manifest = buildPublishedManifest(pkg.dir, rawManifest);
    const stageDir = path.resolve(tempRoot, pkg.name.replace(/[@/]/g, '_'));
    stagePublishedPackage(stageDir, pkg.dir, manifest);
    stages[pkg.name] = stageDir;
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

  packedWorkspaceCache = { tarballs, manifests, contents, stages };
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
      '.': {
        types: { import: './index.d.mts', require: './index.d.ts', default: './index.d.ts' },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
    });
    expect(manifest.engines).toEqual({ node: '>=22.12.0' });
    expect(manifest.dependencies).toMatchObject({
      '@web-ts-toolkit/express-oidc-vault': testVersion,
      mongodb: '^6.20.0',
    });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.files).toEqual(['**/*', '!**/*.map']);

    const expected = [
      'LICENSE',
      'README.md',
      'package.json',
      'index.js',
      'index.mjs',
      'index.d.ts',
      'index.d.mts',
    ].sort();
    expect(contents).toEqual(expected.map((file) => `package/${file}`));
    const report = JSON.parse(
      run('npm', ['pack', '--dry-run', '--json'], packed.stages['@web-ts-toolkit/express-oidc-vault-mongodb-store']),
    ) as Array<{ files: Array<{ path: string }>; entryCount: number }>;
    expect(report[0].files.map((file) => file.path).sort()).toEqual(expected);
    expect(report[0].entryCount).toBe(7);
    for (const declaration of ['index.d.ts', 'index.d.mts']) {
      expect(
        readFileSync(
          path.resolve(packed.stages['@web-ts-toolkit/express-oidc-vault-mongodb-store'], declaration),
          'utf8',
        ),
      ).not.toMatch(/from ['"]\.|\/src\/|reference path=/);
    }
  });

  it('loads packed CJS/ESM roots and exercises live guarded replay/capacity across independent Mongo clients', async () => {
    const consumerDir = stagePackedConsumer();

    writeFileSync(
      path.resolve(consumerDir, 'consumer.mjs'),
      `import * as api from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

if (typeof api.createMongoOidcVaultStore !== 'function') throw new Error('ESM factory export missing');
if (api.DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS !== 300000) throw new Error('ESM default alias retention export missing');
if ('MongoOidcVaultStore' in api || 'resolveCollectionNames' in api) throw new Error('ESM internal export leaked');
import { MongoClient } from 'mongodb';
import { OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import { assertDeviceBindingStore } from './store-contract.mjs';
// DBJWT-13: bounded handshake budget for the ephemeral replica set on loaded
// hosts — 60s server selection across fresh sockets, 30s per-socket connect.
// Both are finite (never zero/infinite) and fit the 180s test timeout.
// socketTimeoutMS stays at the driver default: only handshake/selection is
// extended, operation semantics are unchanged.
const client = new MongoClient(process.argv[2], { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000 });
const peer = new MongoClient(process.argv[2], { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000 });
await client.connect(); await peer.connect();
try {
  const options = { dpopReplayMaxEntries: 1, dpopProofsCollectionName: 'packed_proofs', dpopReplayCapacityCollectionName: 'packed_capacity' };
  await assertDeviceBindingStore(api.createMongoOidcVaultStore({ ...options, db: client.db(process.argv[3]) }),
    OidcVaultDpopReplayCapacityError, api.createMongoOidcVaultStore({ ...options, db: peer.db(process.argv[3]) }));
} finally { await peer.close(); await client.close(); }
`,
    );
    writeFileSync(
      path.resolve(consumerDir, 'consumer.cjs'),
      `const api = require('@web-ts-toolkit/express-oidc-vault-mongodb-store');

if (typeof api.createMongoOidcVaultStore !== 'function') throw new Error('CJS factory export missing');
if (api.DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS !== 300000) throw new Error('CJS default alias retention export missing');
if ('MongoOidcVaultStore' in api || 'resolveCollectionNames' in api) throw new Error('CJS internal export leaked');
(async () => {
  const { MongoClient } = require('mongodb');
  const { OidcVaultDpopReplayCapacityError } = require('@web-ts-toolkit/express-oidc-vault');
  const { assertDeviceBindingStore } = await import('./store-contract.mjs');
  // DBJWT-13: same bounded handshake budget as the ESM temp consumer above.
  const client = new MongoClient(process.argv[2], { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000 });
  const peer = new MongoClient(process.argv[2], { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000 });
  await client.connect(); await peer.connect();
  try {
    const options = { dpopReplayMaxEntries: 1, dpopProofsCollectionName: 'packed_proofs', dpopReplayCapacityCollectionName: 'packed_capacity' };
    await assertDeviceBindingStore(api.createMongoOidcVaultStore({ ...options, db: client.db(process.argv[3]) }),
      OidcVaultDpopReplayCapacityError, api.createMongoOidcVaultStore({ ...options, db: peer.db(process.argv[3]) }));
  } finally { await peer.close(); await client.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
    );

    cpSync(
      path.resolve(workspaceRoot, 'packages/express-oidc-vault/test-packed-consumer/consumer/store-contract.mjs'),
      path.resolve(consumerDir, 'store-contract.mjs'),
    );
    const harness = await createReplicaSetHarness();
    try {
      // DBJWT-13: async spawn (never blocking) + at most one retry per
      // consumer, handshake-flake only.
      await runPackedConsumerWithHandshakeRetry(
        ['consumer.mjs', harness.uri, harness.createDb('packed-esm').databaseName],
        consumerDir,
      );
      await runPackedConsumerWithHandshakeRetry(
        ['consumer.cjs', harness.uri, harness.createDb('packed-cjs').databaseName],
        consumerDir,
      );
    } finally {
      await harness.stop();
    }
  }, 180_000);

  it('compiles ESM/CJS public types and installed README under strict NodeNext/Bundler with correct declaration conditions', () => {
    const consumerDir = stagePackedConsumer();

    writeFileSync(
      path.resolve(consumerDir, 'consumer-types.ts'),
      `import { createMongoOidcVaultStore, DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';
import type { MongoOidcVaultStoreOptions, OidcVaultMongoStoreProvider } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';
import { OidcVaultDpopReplayCapacityError, type OidcVaultStoreProvider, type OidcVaultDeviceBindingStoreProvider } from '@web-ts-toolkit/express-oidc-vault';
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
  dpopProofsCollectionName: 'auth_dpop_proofs',
  dpopReplayCapacityCollectionName: 'auth_dpop_capacity',
  dpopReplayMaxEntries: 100000,
  now: () => Date.now(),
};

const provider: OidcVaultMongoStoreProvider = createMongoOidcVaultStore(options);
const baseProvider: OidcVaultStoreProvider = provider;
const strongerProvider: OidcVaultDeviceBindingStoreProvider = provider;
void strongerProvider.getAuthorizationTransaction('state');
void strongerProvider.getExchangeCode('code');
void strongerProvider.consumeAuthorizationTransactionIfMatches({ state: 'state', match: { deviceBinding: null, browserBindingHash: null } });
void strongerProvider.consumeExchangeCodeIfMatches({ code: 'code', expectedSessionId: 'session', match: { deviceBinding: null, browserBindingHash: null } });
void strongerProvider.getSessionRevocationContext('session');
void strongerProvider.reserveDpopProof({ replayKey: 'opaque', expiresAt: Date.now() + 60000 });
new OidcVaultDpopReplayCapacityError() satisfies Error;
// @ts-expect-error Exchange consume requires the preflight session ID.
void strongerProvider.consumeExchangeCodeIfMatches({ code: 'code', match: { deviceBinding: null, browserBindingHash: null } });
// @ts-expect-error Capacity is numeric.
createMongoOidcVaultStore({ db, dpopReplayMaxEntries: '100000' });

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
          include: ['consumer-types.ts', 'consumer-types.cts', 'readme-quick-start.ts'],
        },
        null,
        2,
      )}\n`,
    );

    cpSync(path.resolve(consumerDir, 'consumer-types.ts'), path.resolve(consumerDir, 'consumer-types.cts'));
    const readme = readFileSync(
      path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/express-oidc-vault-mongodb-store/README.md'),
      'utf8',
    );
    const snippet = readme.slice(readme.indexOf('## Quick Start')).match(/```ts\n([\s\S]*?)\n```/)?.[1];
    if (!snippet) throw new Error('Installed Mongo README quickstart missing.');
    writeFileSync(path.resolve(consumerDir, 'readme-quick-start.ts'), snippet);
    writeFileSync(
      path.resolve(consumerDir, 'tsconfig-bundler.json'),
      JSON.stringify({
        extends: './tsconfig-nodenext.json',
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['consumer-types.ts', 'readme-quick-start.ts'],
      }),
    );
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
    const trace = run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json', '--traceResolution'], consumerDir);
    expect(trace).toMatch(
      /Resolving in ESM mode with conditions 'import'[\s\S]*?express-oidc-vault-mongodb-store\/index\.d\.mts'/,
    );
    expect(trace).toMatch(
      /Resolving in CJS mode with conditions 'require'[\s\S]*?express-oidc-vault-mongodb-store\/index\.d\.ts'/,
    );
  }, 180_000);
});
