// Test-only Vite module executed inside the actual page. It is not imported by
// src/main.ts or included in the built production app.
//
// CLIENT-08 migration: the application now consumes the published package
// (`@web-ts-toolkit/oidc-vault-dpop-client` dist) instead of the deleted
// `src/auth/` copy. Public session/fetch/fingerprint/key helpers come from the
// package root. Two non-public package internals that this bridge used —
// `resolveDpopScope` (scope-id computation for key surgery) and
// `withDpopDatabase` (raw IndexedDB access for remove/replaceKey) — are
// intentionally NOT imported: the package publishes no deep entrypoints, and
// no test-only subpath was invented for v1. This bridge keeps minimal local
// test-only copies below. Any drift between the copies and the package fails
// loudly in the real-browser suite (wrong scope id => key surgery misses;
// wrong store shape => IndexedDB errors), so the duplication is self-checking.
import {
  createDeviceFingerprint,
  createOidcVaultDpopSession,
  fetchWithDpop,
  getOrCreateDpopKey,
  type DpopFetchOptions,
  type OidcVaultDpopSession,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { calculateJwkThumbprint } from 'jose';

const sessions = new Map<string, OidcVaultDpopSession>();
const signals = new Map<string, string | undefined>();
interface Scope {
  backendOrigin: string;
  basePath: string;
}
let keyGenerationReady = false;
let releaseGeneration: (() => void) | undefined;

// Test-only mirror of the package's internal scope-id computation, valid for
// the exact origin + slash-free basePath inputs this bridge passes (e.g.
// backendOrigin already an origin, basePath '/auth/oidc/body'). It must stay
// in sync with the package's `[frontendOrigin, backendOrigin, basePath]`
// scope or removeKey/replaceKey target the wrong record and tests fail.
const testScopeId = (frontendOrigin: string, backendOrigin: string, basePath: string): string => {
  const normalized = basePath.replace(/\/+$/g, '') || '/';
  return JSON.stringify([
    'oidc-vault-dpop-v1',
    new URL(frontendOrigin).origin,
    new URL(backendOrigin).origin,
    normalized,
  ]);
};

interface TestStoredKey {
  version: 1;
  scopeId: string;
  privateKey: CryptoKey;
  publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  jkt: string;
}
interface TestCookieVersion {
  jkt: string;
  generation: string;
  active: boolean;
}
interface TestDatabase extends DBSchema {
  keys: { key: string; value: TestStoredKey };
  cookieSessions: { key: string; value: TestCookieVersion };
}

// Test-only mirror of the package's internal IndexedDB helper: same database
// name, version, and object stores as the client (see also `dropDatabase`
// below, which already hardcoded this name before the migration).
const withTestDatabase = async <T>(operation: (db: IDBPDatabase<TestDatabase>) => Promise<T>): Promise<T> => {
  const db = await openDB<TestDatabase>('oidc-vault-dpop-example-v1', 1, {
    upgrade(database) {
      database.createObjectStore('keys');
      database.createObjectStore('cookieSessions');
    },
  });
  try {
    return await operation(db);
  } finally {
    db.close();
  }
};

export const gateKeyCreation = async (_input: object) => {
  void _input;
  const realGenerate = crypto.subtle.generateKey.bind(crypto.subtle);
  const gate = new Promise<void>((resolve) => {
    releaseGeneration = resolve;
  });
  Object.defineProperty(crypto.subtle, 'generateKey', {
    configurable: true,
    value: async (...args: Parameters<typeof crypto.subtle.generateKey>) => {
      const realKey = await realGenerate(...args);
      keyGenerationReady = true;
      await gate;
      return realKey;
    },
  });
  return true;
};

export const keyCreationReady = async (_input: object) => {
  void _input;
  return keyGenerationReady;
};
export const releaseKeyCreation = async (_input: object) => {
  void _input;
  releaseGeneration?.();
};

export const inspectKey = async (scope: Scope & { create: boolean }) => {
  const key = await getOrCreateDpopKey({ frontendOrigin: location.origin, ...scope }, { create: scope.create });
  let exportFailed = false;
  try {
    await crypto.subtle.exportKey('jwk', key.privateKey);
  } catch {
    exportFailed = true;
  }
  return {
    jkt: key.jkt,
    extractable: key.privateKey.extractable,
    type: key.privateKey.type,
    algorithm: key.privateKey.algorithm,
    usages: [...key.privateKey.usages],
    jwk: key.publicJwk,
    exportFailed,
  };
};

export const removeKey = async (scope: Scope) => {
  const id = testScopeId(location.origin, scope.backendOrigin, scope.basePath);
  await withTestDatabase(async (db) => {
    await db.delete('keys', id);
  });
};

export const replaceKey = async (scope: Scope) => {
  const id = testScopeId(location.origin, scope.backendOrigin, scope.basePath);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: exported.x!, y: exported.y! };
  const jkt = await calculateJwkThumbprint(publicJwk);
  await withTestDatabase(async (db) => {
    await db.put('keys', { version: 1, scopeId: id, privateKey: pair.privateKey, publicJwk, jkt }, id);
  });
  return jkt;
};

export const dropDatabase = async (_input: object) => {
  void _input;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('oidc-vault-dpop-example-v1');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Unexpected open key database.'));
  });
};

// Test-only mirror of the package's `assertDpopBrowserFeatures`: body mode
// needs a secure context, Web Crypto, and IndexedDB; cookie mode additionally
// needs Web Locks and BroadcastChannel. No fallbacks, same as the package.
export const featureDetection = async (input: { cookie: boolean }) => {
  if (
    globalThis.isSecureContext !== true ||
    !globalThis.crypto?.subtle ||
    typeof globalThis.crypto.randomUUID !== 'function' ||
    typeof globalThis.CryptoKey !== 'function' ||
    !globalThis.indexedDB
  )
    throw new Error('A secure context, Web Crypto and IndexedDB are required.');
  if (input.cookie && (!globalThis.navigator?.locks?.request || typeof globalThis.BroadcastChannel !== 'function'))
    throw new Error('Cookie sessions require Web Locks and BroadcastChannel.');
  return true;
};

export const createSession = async (input: Scope & { name: string; transport: 'body' | 'cookie'; signal?: string }) => {
  sessions.get(input.name)?.dispose();
  signals.set(input.name, input.signal);
  const fingerprint = createDeviceFingerprint(async () => signals.get(input.name));
  const session = createOidcVaultDpopSession({
    backendOrigin: input.backendOrigin,
    basePath: input.basePath,
    sessionTransport: input.transport,
    fingerprint,
  });
  sessions.set(input.name, session);
  return { scopeId: session.scopeId };
};

export const setSignal = async (input: { name: string; signal?: string }) => {
  signals.set(input.name, input.signal);
};

export const refresh = async (input: { name: string; count?: number }) => {
  const session = sessions.get(input.name)!;
  const promises = Array.from({ length: input.count ?? 1 }, () => session.refresh());
  const tokens = await Promise.all(promises);
  return {
    samePromise: promises.every((promise) => promise === promises[0]),
    tokens: tokens.map((token) => ({ ...token })),
  };
};

export const memoryToken = async (input: { name: string }) => sessions.get(input.name)?.getAccessToken();

export const apiFetch = async (input: {
  name: string;
  backendOrigin: string;
  path?: string;
  options?: DpopFetchOptions;
}) => {
  const session = sessions.get(input.name)!;
  const response = await fetchWithDpop(
    { session, apis: [{ origin: input.backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }] },
    `${input.backendOrigin}${input.path ?? '/api/profile'}`,
    input.options,
  );
  return { status: response.status, body: (await response.json()) as unknown };
};

export const disposeSession = async (input: { name: string }) => {
  sessions.get(input.name)?.dispose();
  sessions.delete(input.name);
};
