import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  cleanupTempRoots,
  installPackedConsumer,
  packageRoot,
  preparePackedTarball,
  prepareReleaseTarball,
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

const NAVIGATION_RUNTIME = `
async function navigationConsumer(pkg) {
  globalThis.location = { origin: 'https://app.example.com' };
  globalThis.isSecureContext = true;
  globalThis.indexedDB = {}; // Queued work is disposed before any storage operation.
  const values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  const session = pkg.createOidcVaultDpopSession({ backendOrigin: 'https://api.example.com', navigate: () => assert.fail('stale navigation') });
  assert.strictEqual(typeof session.logoutAndNavigate, 'function');
  const first = session.logoutAndNavigate();
  assert.strictEqual(session.logoutAndNavigate(), first);
  session.dispose();
  await assert.rejects(first, { code: 'DPOP_SESSION_DISPOSED' });
}
`;

// Installed runtime exercise, not just export/type discovery. Body Bearer uses
// actual Web Crypto digest/UUID but deliberately has no IDB/CryptoKey support.
const BEARER_RUNTIME = `
async function bearerConsumer(pkg) {
  globalThis.indexedDB = undefined;
  globalThis.CryptoKey = undefined;
  Object.defineProperty(crypto.subtle, 'generateKey', { configurable: true, value: () => assert.fail('Bearer key creation') });
  Object.defineProperty(crypto.subtle, 'sign', { configurable: true, value: () => assert.fail('Bearer signing') });
  const calls = [];
  const events = [];
  let navigations = 0;
  let rotations = 0;
  const options = {
    backendOrigin: 'https://api.example.com', basePath: '/auth/oidc/body', dpop: false,
    navigate: () => { navigations++; },
    onCredentialsChanged: (token) => events.push(token),
    fetch: async (url, init) => {
      const route = String(url).split('/').at(-1);
      const headers = new Headers(init.headers);
      assert.strictEqual(headers.has('DPoP'), false);
      assert.strictEqual(headers.has('Authorization'), false);
      assert.strictEqual(init.redirect, 'error');
      assert.strictEqual(init.cache, 'no-store');
      assert.strictEqual(init.credentials, route === 'login' || route === 'exchange' ? 'include' : 'omit');
      const body = JSON.parse(init.body);
      calls.push({ route, body });
      let value;
      if (route === 'login') value = { authorizationUrl: 'https://idp.example.com/authorize' };
      else if (route === 'logout') value = { loggedOut: true };
      else {
        if (route === 'refresh') { rotations++; assert.ok(body.sessionId); }
        value = { accessToken: 'opaque-local-' + rotations, expiresIn: 60, sessionId: 'handle-' + rotations };
      }
      return Response.json(value); // Omitted tokenType normalizes only in explicit Bearer.
    },
  };
  const first = pkg.createOidcVaultDpopSession(options);
  assert.strictEqual(first.dpop, false);
  await first.login('/callback');
  assert.strictEqual(navigations, 1);
  const exchanged = await first.exchange('one-time-code');
  assert.strictEqual(exchanged.tokenType, 'Bearer');
  assert.strictEqual('jkt' in exchanged, false);
  first.dispose();
  const session = pkg.createOidcVaultDpopSession(options);
  const refreshed = await session.refresh(); // Same tab's committed body handle survives replacement.
  assert.strictEqual(rotations, 1);
  assert.strictEqual(calls.at(-1).body.sessionId, 'handle-0');
  let attempts = 0;
  const response = await pkg.fetchWithDpop({
    session, apis: [{ origin: options.backendOrigin, pathPrefix: '/api' }],
    fetch: async (_url, init) => {
      attempts++;
      const headers = new Headers(init.headers);
      assert.strictEqual(headers.get('Authorization'), 'Bearer opaque-local-' + rotations);
      assert.strictEqual(headers.has('DPoP'), false);
      assert.strictEqual(init.credentials, 'omit');
      assert.strictEqual(init.redirect, 'error');
      assert.strictEqual(init.cache, 'no-store');
      return attempts === 1
        ? new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"', 'DPoP-Nonce': 'ignored' } })
        : Response.json({ ok: true });
    },
  }, options.backendOrigin + '/api/profile');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(attempts, 2);
  assert.strictEqual(rotations, 2);
  assert.notStrictEqual(session.getAccessToken().accessToken, refreshed.accessToken);
  const before = calls.length;
  for (const method of ['getKey', 'resetKey', 'logoutAndNavigate']) {
    await assert.rejects(session[method](), { code: 'DPOP_OPERATION_UNSUPPORTED', requiresLogin: false });
  }
  assert.strictEqual(calls.length, before);
  await session.logout();
  assert.strictEqual(calls.at(-1).body.sessionId, 'handle-2');
  assert.strictEqual(session.getAccessToken(), undefined);
  assert.ok(events.some((token) => token && token.tokenType === 'Bearer'));
  assert.strictEqual(sessionStorage.getItem('oidc-vault-bearer:handle:' + session.scopeId), null);
  assert.strictEqual(sessionStorage.getItem('oidc-vault-bearer:pending:' + session.scopeId), null);
  session.dispose();
}
`;

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
${NAVIGATION_RUNTIME}
${BEARER_RUNTIME}
(async () => { await navigationConsumer(pkg); await bearerConsumer(pkg); })()
  .catch((error) => { console.error(error); process.exitCode = 1; });
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
${NAVIGATION_RUNTIME}
${BEARER_RUNTIME}
await navigationConsumer({ createOidcVaultDpopSession });
await bearerConsumer({ createOidcVaultDpopSession, fetchWithDpop });
`;

const CONSUMER_TYPES = `/**
 * Consumer TS source typechecked under both NodeNext and Bundler resolution
 * with \`strict: true\`, \`skipLibCheck: false\`, \`noEmit: true\`.
 * Declarations resolve from the installed packed tarball via the real export
 * map (no \`paths\` override), using named root imports only — no \`src/\`
 * deep import is needed or used.
 */
import {
  createDeviceFingerprint,
  createDpopProof,
  createOidcVaultDpopSession,
  DpopNonceCache,
  fetchWithDpop,
  fingerprintJsSignalSource,
  getOrCreateDpopKey,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import type {
  BearerAccessToken,
  BearerApi,
  BearerFetchContext,
  DeviceFingerprint,
  DeviceFingerprintOptions,
  DeviceFingerprintSignalSource,
  DpopAccessToken,
  DpopApi,
  DpopFetchContext,
  DpopFetchOptions,
  DpopKey,
  DpopKeyScope,
  DpopProofInput,
  FingerprintJsAgent,
  OidcVaultDpopSession,
  OidcVaultDpopSessionOptions,
  OidcVaultDpopAutoRefreshOptions,
  OidcVaultAccessToken,
  OidcVaultBearerSession,
  OidcVaultBearerSessionOptions,
  OidcVaultSession,
  OidcVaultSessionOptions,
  OidcVaultFetchContext,
  OidcVaultLogoutNavigationInput,
  OidcVaultLogoutNavigationResult,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const options: OidcVaultDpopSessionOptions = {
  backendOrigin: 'https://auth.example.com',
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
  requestTimeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
  autoRefresh: { refreshBeforeExpiryMs: 60_000, maxRefreshIntervalMs: 20 * 60_000 } satisfies OidcVaultDpopAutoRefreshOptions,
  onAutoRefreshError: (error) => { const failure: unknown = error; void failure; },
  onCredentialsChanged: (credentials) => {
    const snapshot: DpopAccessToken | undefined = credentials;
    void snapshot;
  },
};
const session = createOidcVaultDpopSession(options);
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, autoRefresh: false });
// @ts-expect-error — no boolean-enabled shorthand.
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, autoRefresh: true });
// @ts-expect-error — interval is numeric milliseconds.
const invalidRefresh: OidcVaultDpopAutoRefreshOptions = { maxRefreshIntervalMs: '20m' };
session satisfies OidcVaultDpopSession;
session.dpop satisfies true;
const navigation: Promise<void> = session.logoutAndNavigate();
const navigationInput: OidcVaultLogoutNavigationInput = { sessionId: 'opaque' };
const navigationResult: OidcVaultLogoutNavigationResult = {
  loggedOut: true, navigationUrl: 'https://auth.example.com/auth/oidc/body/logout/navigation',
};
void navigation;
void navigationInput;
void navigationResult;
// @ts-expect-error — no caller-selected redirect authority.
session.logoutAndNavigate('/return');
// @ts-expect-error — only sessionId is a supported wire input.
const invalidNavigationInput: OidcVaultLogoutNavigationInput = { returnTo: '/return' };

// Explicit recovery from a corrupt persisted key, through the installed root interface.
async function recoverKey(): Promise<void> {
  await session.resetKey();
  await session.login('/callback?transport=body');
}
void recoverKey;

// OBEAR-02: additive mode types resolve from installed DOM-only declarations.
createOidcVaultDpopSession({
  backendOrigin: options.backendOrigin,
  dpop: true,
  onCredentialsChanged(credentials) {
    const bound: DpopAccessToken | undefined = credentials;
    credentials?.tokenType satisfies 'DPoP' | undefined;
    void bound;
  },
}).dpop satisfies true;
const bearerOptions: OidcVaultBearerSessionOptions = {
  backendOrigin: options.backendOrigin,
  dpop: false,
  autoRefresh: { refreshBeforeExpiryMs: 60_000 } satisfies OidcVaultDpopAutoRefreshOptions,
  onAutoRefreshError(error) { const failure: unknown = error; void failure; },
  onCredentialsChanged(credentials) {
    const unbound: BearerAccessToken | undefined = credentials;
    credentials?.tokenType satisfies 'Bearer' | undefined;
    // @ts-expect-error — the unbound profile has no thumbprint.
    credentials?.jkt;
    void unbound;
  },
};
const bearer = createOidcVaultDpopSession(bearerOptions);
bearer satisfies OidcVaultBearerSession;
bearer.dpop satisfies false;
bearer.refresh() satisfies Promise<BearerAccessToken>;
createOidcVaultDpopSession({
  backendOrigin: options.backendOrigin,
  dpop: false,
  onCredentialsChanged(credentials) {
    credentials?.tokenType satisfies 'Bearer' | undefined;
    // @ts-expect-error — not an any or a bound credential.
    credentials?.jkt;
  },
}) satisfies OidcVaultBearerSession;
// @ts-expect-error — Bearer cannot satisfy the existing bound-token contract.
const boundFromBearer: DpopAccessToken = bearer.getAccessToken()!;
// @ts-expect-error — no key creation/read on the Bearer interface.
bearer.getKey();
// @ts-expect-error — no deletion of another mode's key.
bearer.resetKey();
// @ts-expect-error — no unbound provider-navigation logout.
bearer.logoutAndNavigate();
// @ts-expect-error — session mode is immutable.
bearer.dpop = false;

declare const enabled: boolean;
const runtimeOptions: OidcVaultSessionOptions = {
  backendOrigin: options.backendOrigin,
  dpop: enabled,
  autoRefresh: { refreshBeforeExpiryMs: 60_000 },
  onCredentialsChanged(credentials) {
    const current: OidcVaultAccessToken | undefined = credentials;
    if (credentials?.tokenType === 'DPoP') credentials.jkt satisfies string;
    if (credentials?.tokenType === 'Bearer') {
      // @ts-expect-error — discriminator removes DPoP-only fields.
      credentials.jkt;
    }
    void current;
  },
};
const runtimeSession = createOidcVaultDpopSession(runtimeOptions);
runtimeSession satisfies OidcVaultSession;
runtimeSession.dpop satisfies boolean;
const inferredRuntime = createOidcVaultDpopSession({
  backendOrigin: options.backendOrigin,
  dpop: enabled,
  onCredentialsChanged(credentials) {
    credentials satisfies OidcVaultAccessToken | undefined;
    // @ts-expect-error — runtime callback cannot assume a DPoP binding.
    credentials?.jkt;
  },
});
inferredRuntime satisfies OidcVaultSession;
const dpopObserver = (value: DpopAccessToken | undefined): void => { void value; };
const bearerObserver = (value: BearerAccessToken | undefined): void => { void value; };
// @ts-expect-error — a false session cannot deliver bound credentials.
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, dpop: false, onCredentialsChanged: dpopObserver });
// @ts-expect-error — runtime booleans require an observer accepting both modes.
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, dpop: enabled, onCredentialsChanged: bearerObserver });
// @ts-expect-error — explicit Bearer uses the same object-or-false scheduler policy.
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, dpop: false, autoRefresh: true });
if (runtimeSession.dpop) {
  runtimeSession.refresh() satisfies Promise<DpopAccessToken>;
  runtimeSession.getKey() satisfies Promise<DpopKey>;
} else {
  runtimeSession.refresh() satisfies Promise<BearerAccessToken>;
  // @ts-expect-error — false selects the keyless interface.
  runtimeSession.getKey();
}
// @ts-expect-error — false is not allowed by the existing DPoP options type.
const invalidDpopOptions: OidcVaultDpopSessionOptions = { backendOrigin: options.backendOrigin, dpop: false };
const { dpop: factoryMode, ...legacyAdapter } = session;
void factoryMode;
legacyAdapter satisfies OidcVaultDpopSession;
fetchWithDpop({ session: legacyAdapter, apis: [{ origin: options.backendOrigin, replayNamespace: 'legacy' }] }, options.backendOrigin);

const context: DpopFetchContext = {
  session,
  apis: [{ origin: 'https://api.example.com', replayNamespace: 'vault-api' }],
  nonces: new DpopNonceCache(),
};
const response: Promise<Response> = fetchWithDpop(context, 'https://api.example.com/things');
void response;

// OBEAR-04: installed contexts preserve DPoP policy and allow keyless Bearer scopes.
const bearerApi: BearerApi = { origin: options.backendOrigin, pathPrefix: '/api', credentials: 'include' };
const bearerContext: BearerFetchContext = { session: bearer, apis: [bearerApi], nonces: new DpopNonceCache() };
fetchWithDpop(bearerContext, options.backendOrigin + '/api') satisfies Promise<Response>;
fetchWithDpop({ session: bearer, apis: [{ origin: options.backendOrigin }] }, options.backendOrigin) satisfies Promise<Response>;
fetchWithDpop({ session: bearer, apis: [{ origin: options.backendOrigin, replayNamespace: 'unused' }] }, options.backendOrigin);
const runtimeContext: OidcVaultFetchContext = { session: runtimeSession, apis: context.apis };
fetchWithDpop(runtimeContext, options.backendOrigin) satisfies Promise<Response>;
// @ts-expect-error — default DPoP config still requires a namespace.
const missingNamespace: DpopApi = { origin: options.backendOrigin };
// @ts-expect-error — namespace is an optional string, not a security-mode boolean.
const invalidBearerApi: BearerApi = { origin: options.backendOrigin, replayNamespace: false };
// @ts-expect-error — definite DPoP cannot use namespace-free scopes via another overload.
fetchWithDpop({ session, apis: [{ origin: options.backendOrigin }] }, options.backendOrigin);
// @ts-expect-error — Bearer sessions cannot satisfy the existing DPoP context type.
const invalidDpopContext: DpopFetchContext = bearerContext;
// @ts-expect-error — runtime-mode contexts require DPoP-compatible namespaces.
const missingRuntimeNamespace: OidcVaultFetchContext = { session: runtimeSession, apis: [{ origin: options.backendOrigin }] };
// @ts-expect-error — runtime mode cannot choose the namespace-free Bearer overload.
fetchWithDpop({ session: runtimeSession, apis: [{ origin: options.backendOrigin }] }, options.backendOrigin);
if (!runtimeSession.dpop) fetchWithDpop({ session: runtimeSession, apis: [{ origin: options.backendOrigin }] }, options.backendOrigin);
// @ts-expect-error — no request-level authentication mode override.
fetchWithDpop(bearerContext, options.backendOrigin, { dpop: true });

// DPH-05: separate services under one public origin, using root-exported types.
const gatewayOrigin = 'https://gateway.example.com';
const gatewayApis = [
  { origin: gatewayOrigin, pathPrefix: '/orders', replayNamespace: 'orders-api' },
  { origin: gatewayOrigin, pathPrefix: '/billing', replayNamespace: 'billing-api', credentials: 'include' },
] as const satisfies readonly DpopApi[];
const gateway: DpopFetchContext = { session, apis: gatewayApis };
const orders: Promise<Response> = fetchWithDpop(gateway, gatewayOrigin + '/orders?limit=20');
const billing: Promise<Response> = fetchWithDpop(gateway, gatewayOrigin + '/billing/invoices');
void orders;
void billing;

// CLIENT-08 root type exports resolve from the packed declarations.
declare const fingerprint: DeviceFingerprint;
declare const issued: DpopAccessToken | undefined;
void fingerprint;
void issued?.jkt;
const profile: string | undefined = issued?.user?.sub;
void profile;

const keyScope: DpopKeyScope = {
  frontendOrigin: 'https://app.example.com', backendOrigin: options.backendOrigin, basePath: '/auth/oidc/body',
};
const existingKey: Promise<DpopKey> = getOrCreateDpopKey(keyScope, { create: false });
declare const agent: FingerprintJsAgent;
const signalSource: DeviceFingerprintSignalSource = fingerprintJsSignalSource(async () => agent);
const fingerprintOptions: DeviceFingerprintOptions = { headerName: 'X-Device-Fingerprint' };
const recognized: DeviceFingerprint = createDeviceFingerprint(signalSource, fingerprintOptions);
void existingKey;
void recognized;

// Cancellation uses DOM AbortSignal in both declaration conditions.
declare const key: DpopKey;
const controller = new AbortController();
const proofInput: DpopProofInput = {
  method: 'GET', url: 'https://api.example.com/things', signal: controller.signal,
};
const proof: Promise<string> = createDpopProof(key, proofInput);
const fetchOptions: DpopFetchOptions = { signal: controller.signal, retry: 'never' };
void proof;
void fetchWithDpop(context, proofInput.url, fetchOptions);

declare const error: unknown;
if (error instanceof OidcVaultDpopClientError) {
  error.code satisfies string;
  error.requiresLogin satisfies boolean;
  error.status satisfies number | undefined;
}

// @ts-expect-error — reset is scoped by the session, not an arbitrary database id.
session.resetKey('other-scope');
// @ts-expect-error — timeouts are milliseconds, not duration strings.
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, requestTimeoutMs: '15s' });
// @ts-expect-error — byte limits are numbers.
createOidcVaultDpopSession({ backendOrigin: options.backendOrigin, maxResponseBytes: '1MiB' });
// @ts-expect-error — proof cancellation takes a DOM signal, not a controller.
createDpopProof(key, { method: 'GET', url: proofInput.url, signal: controller });
// @ts-expect-error — callers cannot override the API credential policy.
fetchWithDpop(context, proofInput.url, { credentials: 'include' });

// Ambient tripwires: types:[] must not borrow Node via a transitive declaration.
// @ts-expect-error — a DOM-only app has no Node process global.
void process;
// @ts-expect-error — a DOM-only app has no Buffer global.
void Buffer;
// @ts-expect-error — a DOM-only app has no NodeJS namespace.
type NodeProcess = NodeJS.Process;
// @ts-expect-error — browser declarations must not create an ambient Express module.
import type { Request as ExpressRequest } from 'express-serve-static-core';

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
    "types": []
  },
  "include": ["consumer-types.ts", "consumer-types.cts"]
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
    "types": []
  },
  "include": ["consumer-types.ts"]
}
`;

function writeConsumerSources(consumerDir: string): void {
  writeFileSync(path.resolve(consumerDir, 'consumer.cjs'), CONSUMER_CJS);
  writeFileSync(path.resolve(consumerDir, 'consumer.mjs'), CONSUMER_MJS);
  writeFileSync(path.resolve(consumerDir, 'consumer-types.ts'), CONSUMER_TYPES);
  writeFileSync(path.resolve(consumerDir, 'consumer-types.cts'), CONSUMER_TYPES);
  writeFileSync(path.resolve(consumerDir, 'tsconfig-nodenext.json'), TSCONFIG_NODENEXT);
  writeFileSync(path.resolve(consumerDir, 'tsconfig-bundler.json'), TSCONFIG_BUNDLER);
}

afterAll(() => {
  cleanupTempRoots();
});

describe('CLIENT-06 packed-package compatibility', () => {
  it('runs navigation/Bearer lifecycle/fetch and strict DOM-only consumers through release-transformed ESM/CJS exports', () => {
    const unpacked = unpackTarballToDir(prepareReleaseTarball());
    const manifest = JSON.parse(readFileSync(path.resolve(unpacked, 'package.json'), 'utf8'));
    expect(manifest.module).toBe('./index.mjs');
    expect(JSON.stringify(manifest)).not.toMatch(/PLACEHOLDER|workspace:/);
    const consumer = installPackedConsumer(true);
    writeConsumerSources(consumer);
    run(process.execPath, ['consumer.cjs'], consumer);
    run(process.execPath, ['consumer.mjs'], consumer);
    for (const config of ['tsconfig-nodenext.json', 'tsconfig-bundler.json']) {
      const files = run('pnpm', ['exec', 'tsc', '-p', config, '--listFiles'], consumer);
      expect(files).not.toMatch(/[/\\]@types[/\\]|express-oidc-vault|express-serve-static-core/);
      expect(files).toContain('/oidc-vault-dpop-client/index.d.mts');
    }
  }, 240_000);

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
      engines: { node: string };
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
    expect(Object.keys(packedManifest.dependencies).sort()).toEqual(['idb', 'jose']);
    expect(packedManifest.engines.node).toBe('>=22.12.0');
  });

  it('packs browser-only declarations without backend auth types or Express augmentation', () => {
    const unpackRoot = unpackTarballToDir(preparePackedTarball());
    for (const declaration of ['dist/index.d.ts', 'dist/index.d.mts']) {
      const text = readFileSync(path.resolve(unpackRoot, declaration), 'utf8');
      const declarations = text.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(/express|node:|NodeJS|\bBuffer\b|OidcVaultAuthContext|declare module/.test(declarations)).toBe(false);
      expect(/from ['"]\.\.?\//.test(declarations)).toBe(false);
      // Editor hover information must survive emission/packing in both conditions.
      expect(text).toContain('Select unbound app-local Bearer explicitly');
      expect(text).toContain('DPOP_OPERATION_UNSUPPORTED before side effects');
      expect(text).toContain('exactly three segments reserve the signed');
      expect(text).toContain('at most two API attempts');
    }
  });

  it('installs the tarball and runs CJS/ESM runtimes plus DOM-only strict NodeNext/Bundler consumers', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerSources(consumerDir);

    // Set DPOP_TEST_NODE to an additional runtime executable (e.g. the advertised
    // minimum) while keeping pnpm/TypeScript on the repository toolchain.
    for (const node of new Set(
      [process.execPath, process.env.DPOP_TEST_NODE].filter((value): value is string => !!value),
    )) {
      run(node, ['consumer.cjs'], consumerDir);
      run(node, ['consumer.mjs'], consumerDir);
    }

    // Strict NodeNext typecheck against the installed declarations through
    // the export map's per-condition `types.import` (`./dist/index.d.mts`).
    // `skipLibCheck: false` so the package's own declaration surface is
    // fully checked.
    for (const config of ['tsconfig-nodenext.json', 'tsconfig-bundler.json']) {
      const files = run('pnpm', ['exec', 'tsc', '-p', config, '--listFiles'], consumerDir);
      // A transitive import must not rescue an accidental Node/Express leak.
      expect(files).not.toMatch(/[/\\]@types[/\\]|express-oidc-vault|express-serve-static-core/);
      expect(files).toContain('/dist/index.d.mts');
      if (config === 'tsconfig-nodenext.json') expect(files).toContain('/dist/index.d.ts');
    }

    // Sanity: the installed consumer holds a real packed package in its
    // node_modules (no workspace path mapping, no source symlink).
    const installedDir = path.resolve(consumerDir, 'node_modules', '@web-ts-toolkit', 'oidc-vault-dpop-client');
    expect(existsSync(path.resolve(installedDir, 'package.json'))).toBe(true);
    for (const emitted of ['dist/index.js', 'dist/index.mjs', 'dist/index.d.ts', 'dist/index.d.mts']) {
      expect(existsSync(path.resolve(installedDir, emitted))).toBe(true);
    }
  }, 240_000);
});
