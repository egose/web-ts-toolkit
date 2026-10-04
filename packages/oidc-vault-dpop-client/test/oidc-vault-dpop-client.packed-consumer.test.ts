import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  cleanupTempRoots,
  installPackedConsumer,
  packageRoot,
  preparePackedTarball,
  run,
  unpackTarballToDir,
} from './packed-consumer-harness';

/**
 * CLIENT-06: Test the packed CJS, ESM, and declaration surface of
 * `@web-ts-toolkit/oidc-vault-dpop-client`.
 *
 * The repository's unit suite imports package *source* (`../src`) or the
 * workspace `dist/` via the package name, so breakages in the `npm pack`
 * file allowlist, the export map, or the declaration conditions never
 * surface during local development. This file packs the real tarball (`npm
 * pack`, honoring `files: ["README.md", "llms.txt", "dist"]`), installs it in a fresh
 * consumer, then executes CJS `require`, ESM `import`, NodeNext typecheck,
 * and Bundler typecheck with `strict: true` and `skipLibCheck: false`.
 * Manifest and packed-file assertions prove no `src/*` leakage and that
 * every `exports` target resolves inside the packed tree.
 *
 * The pack/install plumbing lives in `./packed-consumer-harness.ts` and is
 * shared with the docs compile test so the two files do not drift on the
 * pack contract.
 */

// CLIENT-08: DpopNonceCache is a root runtime export (shared nonce state for
// fetchWithDpop); llms.txt ships in the tarball alongside README.md + dist.
const EXPECTED_RUNTIME_EXPORTS = [
  'DpopNonceCache',
  'OidcVaultDpopClientError',
  'createDeviceFingerprint',
  'createDpopProof',
  'createOidcVaultDpopSession',
  'fetchWithDpop',
  'fingerprintJsSignalSource',
  'getOrCreateDpopKey',
] as const;

const CONSUMER_CJS = `/* Consumer CJS entry: require() resolves the packed tarball via exports.require (no workspace mapping). */
const assert = require('node:assert');

const pkg = require('@web-ts-toolkit/oidc-vault-dpop-client');

const expected = ${JSON.stringify([...EXPECTED_RUNTIME_EXPORTS].sort())};
assert.deepStrictEqual(Object.keys(pkg).sort(), expected, 'CJS runtime export surface mismatch');
assert.strictEqual(typeof pkg.createOidcVaultDpopSession, 'function');
assert.strictEqual(typeof pkg.fetchWithDpop, 'function');
assert.strictEqual(typeof pkg.createDpopProof, 'function');
assert.strictEqual(typeof pkg.getOrCreateDpopKey, 'function');
assert.ok(pkg.OidcVaultDpopClientError.prototype instanceof Error);
assert.strictEqual(new pkg.OidcVaultDpopClientError('DPOP_KEY_LOST', 'x', true).name, 'OidcVaultDpopClientError');
`;

const CONSUMER_MJS = `/* Consumer ESM entry: import resolves the packed tarball via exports.import (no workspace mapping). */
import assert from 'node:assert';

import {
  OidcVaultDpopClientError,
  createDeviceFingerprint,
  createDpopProof,
  createOidcVaultDpopSession,
  DpopNonceCache,
  fetchWithDpop,
  fingerprintJsSignalSource,
  getOrCreateDpopKey,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const expected = ${JSON.stringify([...EXPECTED_RUNTIME_EXPORTS].sort())};
const actual = Object.keys(await import('@web-ts-toolkit/oidc-vault-dpop-client')).sort();
assert.deepStrictEqual(actual, expected, 'ESM runtime export surface mismatch');
assert.strictEqual(typeof createOidcVaultDpopSession, 'function');
assert.strictEqual(typeof fetchWithDpop, 'function');
assert.strictEqual(typeof createDpopProof, 'function');
assert.strictEqual(typeof getOrCreateDpopKey, 'function');
assert.strictEqual(typeof createDeviceFingerprint, 'function');
assert.strictEqual(typeof fingerprintJsSignalSource, 'function');
assert.ok(OidcVaultDpopClientError.prototype instanceof Error);
`;

const CONSUMER_TYPES = `/**
 * Consumer TS source typechecked under both NodeNext and Bundler resolution
 * with \`strict: true\`, \`skipLibCheck: false\`, \`noEmit: true\`.
 * Declarations resolve from the installed packed tarball via the real export
 * map (no \`paths\` override), using named root imports only — no \`src/\`
 * deep import is needed or used.
 */
import {
  createOidcVaultDpopSession,
  DpopNonceCache,
  fetchWithDpop,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import type {
  DeviceFingerprint,
  DpopAccessToken,
  DpopFetchContext,
  OidcVaultDpopSession,
  OidcVaultDpopSessionOptions,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const options: OidcVaultDpopSessionOptions = {
  backendOrigin: 'https://auth.example.com',
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
};
const session = createOidcVaultDpopSession(options);
session satisfies OidcVaultDpopSession;

const context: DpopFetchContext = {
  session,
  apis: [{ origin: 'https://api.example.com', replayNamespace: 'vault-api' }],
  nonces: new DpopNonceCache(),
};
const response: Promise<Response> = fetchWithDpop(context, 'https://api.example.com/things');
void response;

// CLIENT-08 root type exports resolve from the packed declarations.
declare const fingerprint: DeviceFingerprint;
declare const issued: DpopAccessToken | undefined;
void fingerprint;
void issued?.jkt;

// @ts-expect-error — only 'body' | 'cookie' are valid transports.
createOidcVaultDpopSession({ backendOrigin: 'https://auth.example.com', sessionTransport: 'header' });
`;

const TSCONFIG_NODENEXT = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["consumer-types.ts"]
}
`;

const TSCONFIG_BUNDLER = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["consumer-types.ts"]
}
`;

function writeConsumerSources(consumerDir: string): void {
  writeFileSync(path.resolve(consumerDir, 'consumer.cjs'), CONSUMER_CJS);
  writeFileSync(path.resolve(consumerDir, 'consumer.mjs'), CONSUMER_MJS);
  writeFileSync(path.resolve(consumerDir, 'consumer-types.ts'), CONSUMER_TYPES);
  writeFileSync(path.resolve(consumerDir, 'tsconfig-nodenext.json'), TSCONFIG_NODENEXT);
  writeFileSync(path.resolve(consumerDir, 'tsconfig-bundler.json'), TSCONFIG_BUNDLER);
}

afterAll(() => {
  cleanupTempRoots();
});

describe('CLIENT-06 packed-package compatibility', () => {
  it('`npm pack --dry-run --json` lists only README.md + llms.txt + dist/* + package.json', () => {
    const stdout = run('npm', ['pack', '--dry-run', '--json'], packageRoot);
    const report = JSON.parse(stdout) as Array<{
      entryCount: number;
      bundled: unknown[];
      files: Array<{ path: string }>;
    }>;
    expect(report).toHaveLength(1);
    const [entry] = report;
    expect(entry.bundled).toEqual([]);
    const paths = entry.files.map((f: { path: string }) => f.path).sort();
    const expectedFiles = [
      'README.md',
      'dist/index.d.mts',
      'dist/index.d.ts',
      'dist/index.js',
      'dist/index.mjs',
      'llms.txt',
      'package.json',
    ].sort();
    expect(paths).toEqual(expectedFiles);
    expect(entry.entryCount).toBe(expectedFiles.length);
    // No stray build artifacts (sourcemaps, tsbuildinfo, src, test, etc.).
    const disallowed = paths.filter((p) => !expectedFiles.includes(p));
    expect(disallowed).toEqual([]);
  });

  it('packs an exports-consistent tree with no src/ leakage and no server-runtime leak in the bundle', () => {
    const unpackRoot = unpackTarballToDir(preparePackedTarball());
    const packedManifest = JSON.parse(readFileSync(path.resolve(unpackRoot, 'package.json'), 'utf8')) as {
      exports: { '.': { types: { import: string; require: string }; import: string; require: string } };
      dependencies: Record<string, string>;
    };

    // Every exports target resolves inside the packed tree; README ships.
    expect(existsSync(path.resolve(unpackRoot, 'README.md'))).toBe(true);
    for (const target of [
      packedManifest.exports['.'].types.import,
      packedManifest.exports['.'].types.require,
      packedManifest.exports['.'].import,
      packedManifest.exports['.'].require,
    ]) {
      expect(existsSync(path.resolve(unpackRoot, target)), `exports target missing: ${target}`).toBe(true);
    }

    // No src/, test/, or config leakage into the packed tree.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [path.relative(unpackRoot, full).replace(/\\/g, '/')];
      });
    const allFiles = walk(unpackRoot);
    expect(allFiles.some((p) => p.startsWith('src/') || p === 'src')).toBe(false);
    expect(allFiles.some((p) => p.startsWith('test/') || p === 'test')).toBe(false);
    expect(allFiles.some((p) => p.endsWith('.map'))).toBe(false);

    // The wire-DTO dependency on `@web-ts-toolkit/express-oidc-vault` is
    // type-only (CLIENT-03): no runtime import may survive in the bundle,
    // and no Node builtin may leak into the browser artifact.
    for (const bundle of ['dist/index.mjs', 'dist/index.js']) {
      const content = readFileSync(path.resolve(unpackRoot, bundle), 'utf8');
      expect(content.includes('express-oidc-vault')).toBe(false);
      expect(/from\s+['"]node:/.test(content)).toBe(false);
      expect(/require\(\s*['"]node:/.test(content)).toBe(false);
    }

    // Runtime deps stay external requires/imports, not bundled server code.
    expect(packedManifest.dependencies).toMatchObject({ jose: expect.any(String), idb: expect.any(String) });
  });

  it('installs the packed tarball and runs packed CJS/ESM runtime plus strict NodeNext/Bundler type consumers', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerSources(consumerDir);

    // CJS require resolves from the fresh install via `exports.require`.
    run('node', ['consumer.cjs'], consumerDir);

    // ESM import resolves via `exports.import`. `node` picks
    // `type: "module"` from the consumer package.json.
    run('node', ['consumer.mjs'], consumerDir);

    // Strict NodeNext typecheck against the installed declarations through
    // the export map's per-condition `types.import` (`./dist/index.d.mts`).
    // `skipLibCheck: false` so the package's own declaration surface is
    // fully checked.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);

    // Strict Bundler typecheck — same consumer source, Bundler resolution.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);

    // Sanity: the installed consumer holds a real packed package in its
    // node_modules (no workspace path mapping, no source symlink).
    const installedDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'oidc-vault-dpop-client');
    expect(existsSync(path.resolve(installedDir, 'package.json'))).toBe(true);
    for (const emitted of ['dist/index.js', 'dist/index.mjs', 'dist/index.d.ts', 'dist/index.d.mts']) {
      expect(existsSync(path.resolve(installedDir, emitted))).toBe(true);
    }
  }, 240_000);
});
