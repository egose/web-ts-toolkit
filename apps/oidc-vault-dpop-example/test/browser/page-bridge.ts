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
  OidcVaultDpopClientError,
  type DpopAccessToken,
  type BearerAccessToken,
  type OidcVaultAccessToken,
  type OidcVaultSession,
  type DpopFetchOptions,
  type OidcVaultDpopSession,
  type OidcVaultDpopAutoRefreshOptions,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { calculateJwkThumbprint } from 'jose';

const sessions = new Map<string, OidcVaultSession>();
const signals = new Map<string, string | undefined>();
const observedCredentials = new Map<string, Array<OidcVaultAccessToken | undefined>>();
const maintenanceFailures = new Map<string, Array<{ code: string; requiresLogin: boolean }>>();
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
  mode?: 'dpop' | 'bearer';
  jkt?: string;
  generation: string;
  active: boolean;
  refreshedAt?: number;
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

// DPH-06: keep the public JWK/thumbprint but replace the signing key, producing
// a genuinely persisted, non-extractable pair that validation must reject.
export const corruptKey = async (scope: Scope) => {
  const id = testScopeId(location.origin, scope.backendOrigin, scope.basePath);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  return withTestDatabase(async (db) => {
    const previous = await db.get('keys', id);
    if (!previous) throw new Error('Missing key to corrupt.');
    await db.put('keys', { ...previous, privateKey: pair.privateKey }, id);
    return previous.jkt;
  });
};

export const inspectScopeRecords = async (scope: Scope) =>
  withTestDatabase(async (db) => {
    const id = testScopeId(location.origin, scope.backendOrigin, scope.basePath);
    const transaction = db.transaction(['keys', 'cookieSessions'], 'readonly');
    const [keyId, key, cookieVersion] = await Promise.all([
      transaction.objectStore('keys').getKey(id),
      transaction.objectStore('keys').get(id),
      transaction.objectStore('cookieSessions').get(id),
    ]);
    await transaction.done;
    return {
      keyPresent: keyId !== undefined,
      keyJkt: key?.jkt,
      cookieVersion,
      version: db.version,
      stores: [...db.objectStoreNames],
    };
  });

export const seedCookieVersion = async (input: Scope & { version: TestCookieVersion }) =>
  withTestDatabase(async (db) => {
    await db.put('cookieSessions', input.version, testScopeId(location.origin, input.backendOrigin, input.basePath));
  });

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

export const createSession = async (
  input: Scope & {
    name: string;
    dpop?: boolean;
    transport: 'body' | 'cookie';
    signal?: string;
    captureNavigation?: boolean;
    observeCredentials?: boolean;
    autoRefresh?: false | OidcVaultDpopAutoRefreshOptions;
  },
) => {
  sessions.get(input.name)?.dispose();
  signals.set(input.name, input.signal);
  const observed: Array<OidcVaultAccessToken | undefined> = [];
  observedCredentials.set(input.name, observed);
  const failures: Array<{ code: string; requiresLogin: boolean }> = [];
  maintenanceFailures.set(input.name, failures);
  const fingerprint = createDeviceFingerprint(async () => signals.get(input.name));
  const session = createOidcVaultDpopSession({
    backendOrigin: input.backendOrigin,
    basePath: input.basePath,
    sessionTransport: input.transport,
    dpop: input.dpop ?? true,
    fingerprint,
    autoRefresh: input.autoRefresh,
    onAutoRefreshError: (error) => {
      failures.push(
        error instanceof OidcVaultDpopClientError
          ? { code: error.code, requiresLogin: error.requiresLogin }
          : { code: 'unclassified', requiresLogin: false },
      );
    },
    ...(input.observeCredentials
      ? {
          onCredentialsChanged: (value: OidcVaultAccessToken | undefined) => {
            observed.push(value);
          },
        }
      : {}),
    fetch: async (...args) => {
      const response = await fetch(...args);
      const held = heldResponses.get(input.name);
      if (response.ok && held && String(args[0]).endsWith(`/${held.route}`)) {
        heldResponses.delete(input.name);
        heldResponseValues.set(input.name, (await response.clone().json()) as unknown);
        await waitAtGate(held.gate);
      }
      return response;
    },
    ...(input.captureNavigation
      ? { navigate: () => navigations.set(input.name, (navigations.get(input.name) ?? 0) + 1) }
      : {}),
  });
  sessions.set(input.name, session);
  return { scopeId: session.scopeId };
};

export const setSignal = async (input: { name: string; signal?: string }) => {
  signals.set(input.name, input.signal);
};

const dpopSession = (name: string): OidcVaultDpopSession => {
  const session = sessions.get(name)!;
  if (!session.dpop) throw new Error('Expected the default DPoP test session.');
  return session;
};

const refreshBatch = async <T extends OidcVaultAccessToken>(
  session: { refresh(options?: { rejectedToken?: string }): Promise<T> },
  input: { count?: number; rejectedToken?: string },
) => {
  const promises = Array.from({ length: input.count ?? 1 }, () =>
    session.refresh({ rejectedToken: input.rejectedToken }),
  );
  const tokens = await Promise.all(promises);
  return {
    samePromise: promises.every((promise) => promise === promises[0]),
    tokens: tokens.map((token) => ({ ...token })),
  };
};

// Preserve exact default-mode return types for the existing DPoP suites.
export const refresh = async (input: { name: string; count?: number; rejectedToken?: string }) =>
  refreshBatch<DpopAccessToken>(dpopSession(input.name), input);

export const refreshBearer = async (input: { name: string; count?: number; rejectedToken?: string }) => {
  const session = sessions.get(input.name)!;
  if (session.dpop) throw new Error('Expected an explicit Bearer test session.');
  return refreshBatch<BearerAccessToken>(session, input);
};

export const login = async (input: { name: string; returnTo: string }) =>
  sessions.get(input.name)!.login(input.returnTo);
export const exchange = async (input: { name: string; code: string }) => sessions.get(input.name)!.exchange(input.code);
export const logout = async (input: { name: string }) => sessions.get(input.name)!.logout();

export const memoryToken = async (input: { name: string }) => sessions.get(input.name)?.getAccessToken();
export const credentialEvents = async (input: { name: string }) => observedCredentials.get(input.name) ?? [];
export const maintenanceErrors = async (input: { name: string }) => maintenanceFailures.get(input.name) ?? [];

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

// DPH-02 barriers retain the real browser's key/IDB/HTTP implementations. Only
// delivery to a session is paused, or invalidation is injected after a native
// IDB put has started, so the tests can choose interleavings without sleeps.
interface Gate {
  ready: boolean;
  whenReady: Promise<void>;
  markReady(): void;
  promise: Promise<void>;
  release(): void;
}
const gates = new Map<string, Gate>();
const heldResponses = new Map<string, { route: 'login' | 'refresh' | 'logout/navigation'; gate: string }>();
const heldResponseValues = new Map<string, unknown>();
const navigations = new Map<string, number>();
const operations = new Map<string, Promise<{ ok: boolean; code?: string }>>();
const createGate = (id: string): void => {
  let release!: () => void;
  let markReady!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const whenReady = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  gates.set(id, { ready: false, whenReady, markReady, promise, release });
};
const waitAtGate = async (id: string): Promise<void> => {
  const gate = gates.get(id)!;
  gate.ready = true;
  gate.markReady();
  await gate.promise;
};
const trackOperation = (id: string, run: () => unknown): void => {
  operations.set(
    id,
    (async () => {
      try {
        await run();
        return { ok: true };
      } catch (error) {
        return { ok: false, code: error instanceof OidcVaultDpopClientError ? error.code : 'UNEXPECTED_FAILURE' };
      }
    })(),
  );
};

export const beginSessionOperation = async (input: {
  name: string;
  id: string;
  operation: 'login' | 'refresh' | 'logout' | 'logoutAndNavigate' | 'clear' | 'resetKey' | 'getKey';
}) => {
  // Intentional runtime probing of DPoP-only stubs on a Bearer object is test-only.
  trackOperation(input.id, () => (sessions.get(input.name)! as OidcVaultDpopSession)[input.operation]());
};
export const finishSessionOperation = async (input: { id: string }) => operations.get(input.id)!;
export const gateReady = async (input: { id: string }) => gates.get(input.id)?.ready === true;
export const waitForOperationGate = async (input: { gate: string; id: string }) => {
  const gate = gates.get(input.gate)!;
  // Native crypto/HTTP/Response.clone completion is not guaranteed within
  // expect.poll's short default. Await the actual barrier, but surface an
  // operation that settles without reaching it instead of masking a failure.
  await Promise.race([
    gate.whenReady,
    operations.get(input.id)!.then((outcome) => {
      throw new Error(`Session operation settled before its response gate: ${outcome.code ?? 'success'}`);
    }),
  ]);
  return gate.ready;
};
export const releaseGate = async (input: { id: string }) => {
  gates.get(input.id)!.release();
};
export const navigationCount = async (input: { name: string }) => navigations.get(input.name) ?? 0;
export const heldResponseValue = async (input: { name: string }) => heldResponseValues.get(input.name);

export const holdSessionResponse = async (input: {
  name: string;
  route: 'login' | 'refresh' | 'logout/navigation';
  gate: string;
}) => {
  createGate(input.gate);
  heldResponses.set(input.name, input);
};

export const beginNavigationClicks = async (input: { name: string; id: string }) => {
  const session = dpopSession(input.name);
  const first = session.logoutAndNavigate();
  const second = session.logoutAndNavigate();
  trackOperation(input.id, () => first);
  return { samePromise: first === second };
};

export const holdKeyLookup = async (input: { gate: string }) => {
  createGate(input.gate);
  const verify = crypto.subtle.verify.bind(crypto.subtle);
  Object.defineProperty(crypto.subtle, 'verify', {
    configurable: true,
    value: async (...args: Parameters<SubtleCrypto['verify']>) => {
      const result = await verify(...args);
      Object.defineProperty(crypto.subtle, 'verify', { configurable: true, value: verify });
      await waitAtGate(input.gate);
      return result;
    },
  });
};

interface CookieWriteEvidence {
  started: boolean;
  clearedImmediately: boolean;
  requestSucceeded: boolean;
  requestError?: string;
}
const cookieWrites = new Map<string, CookieWriteEvidence>();
export const invalidateDuringCookieWrite = async (input: {
  name: string;
  id: string;
  action: 'clear' | 'resetKey' | 'dispose';
}) => {
  const session = sessions.get(input.name)!;
  const evidence: CookieWriteEvidence = { started: false, clearedImmediately: false, requestSucceeded: false };
  cookieWrites.set(input.id, evidence);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    const request = put.call(this, value, key);
    if (this.name === 'cookieSessions' && key === session.scopeId && (value as TestCookieVersion).active) {
      IDBObjectStore.prototype.put = put;
      evidence.started = true;
      request.addEventListener('success', () => {
        evidence.requestSucceeded = true;
      });
      request.addEventListener('error', () => {
        evidence.requestError = request.error?.name;
      });
      trackOperation(input.id, () => (session as OidcVaultDpopSession)[input.action]());
      evidence.clearedImmediately = session.getAccessToken() === undefined;
    }
    return request;
  };
};
export const cookieWriteEvidence = async (input: { id: string }) => cookieWrites.get(input.id)!;

export const disposeDuringKeyDelete = async (input: { name: string; id: string }) => {
  const session = sessions.get(input.name)!;
  const evidence: CookieWriteEvidence = { started: false, clearedImmediately: false, requestSucceeded: false };
  cookieWrites.set(input.id, evidence);
  const remove = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
    const request = remove.call(this, key);
    if (this.name === 'keys' && key === session.scopeId) {
      IDBObjectStore.prototype.delete = remove;
      evidence.started = true;
      request.addEventListener('success', () => {
        evidence.requestSucceeded = true;
      });
      request.addEventListener('error', () => {
        evidence.requestError = request.error?.name;
      });
      session.dispose();
      evidence.clearedImmediately = session.getAccessToken() === undefined;
    }
    return request;
  };
};
export const readCookieVersion = async (input: Scope) =>
  withTestDatabase((db) => db.get('cookieSessions', testScopeId(location.origin, input.backendOrigin, input.basePath)));

export const holdCookieLock = async (input: { scopeId: string; gate: string }) => {
  createGate(input.gate);
  trackOperation(input.gate, () =>
    navigator.locks.request(`oidc-vault-dpop:cookie:${input.scopeId}`, () => waitAtGate(input.gate)),
  );
};
export const cookieLockQueue = async (input: { scopeId: string }) => {
  const state = await navigator.locks.query();
  const name = `oidc-vault-dpop:cookie:${input.scopeId}`;
  return {
    held: state.held?.filter((lock) => lock.name === name).length,
    pending: state.pending?.filter((lock) => lock.name === name).length,
  };
};

// DPH-10: replay an actual emitted envelope over the native channel. The
// observer closes after its first match; it does not invoke session callbacks.
interface TestPeerMessage {
  type: 'clear' | 'token';
  sender: string;
  mode?: 'dpop' | 'bearer';
  jkt?: string;
  generation: string;
  recognition?: string;
  token?: unknown;
}
const peerMessages = new Map<string, TestPeerMessage>();
export const capturePeerMessage = async (input: { scopeId: string; id: string; type: TestPeerMessage['type'] }) => {
  const channel = new BroadcastChannel(`oidc-vault-dpop:cookie:${input.scopeId}`);
  channel.onmessage = (event: MessageEvent<TestPeerMessage>) => {
    if (event.data.type !== input.type) return;
    peerMessages.set(input.id, event.data);
    channel.close();
  };
};
export const capturedPeerMessage = async (input: { id: string }) => peerMessages.get(input.id);
export const broadcastCookieMessage = async (input: { scopeId: string; message: TestPeerMessage }) => {
  const channel = new BroadcastChannel(`oidc-vault-dpop:cookie:${input.scopeId}`);
  channel.postMessage(input.message);
  channel.close();
};

// Abort the native readonly transaction after its cookie lookup has started.
// Only this scope's next get is affected; key reads and subsequent explicit
// operations keep the actual IndexedDB implementation.
const cookieReads = new Map<string, { started: boolean; error?: string }>();
export const failNextCookieLookup = async (input: { scopeId: string; id: string }) => {
  const evidence: { started: boolean; error?: string } = { started: false };
  cookieReads.set(input.id, evidence);
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (query: IDBValidKey | IDBKeyRange) {
    const request = get.call(this, query);
    if (this.name === 'cookieSessions' && query === input.scopeId) {
      IDBObjectStore.prototype.get = get;
      evidence.started = true;
      request.addEventListener('error', () => {
        evidence.error = request.error?.name;
      });
      this.transaction.abort();
    }
    return request;
  };
};
export const cookieLookupEvidence = async (input: { id: string }) => cookieReads.get(input.id);

let databaseOpens = 0;
export const watchDatabaseOpens = async (_input: object) => {
  void _input;
  const open = indexedDB.open.bind(indexedDB);
  Object.defineProperty(indexedDB, 'open', {
    configurable: true,
    value: (...args: Parameters<IDBFactory['open']>) => {
      databaseOpens++;
      return open(...args);
    },
  });
};
export const databaseOpenCount = async (_input: object) => {
  void _input;
  return databaseOpens;
};

export const keyUseAudit = async (_input: object) => {
  void _input;
  return (
    globalThis as typeof globalThis & {
      __BEARER_KEY_AUDIT__: {
        generatedKeys: number;
        signatures: number;
        keyStoreAccesses: number;
        databaseOpens: number;
      };
    }
  ).__BEARER_KEY_AUDIT__;
};
