// Test-only Vite module executed inside the actual page. It is not imported by
// src/main.ts or included in the built production app.
import { createOidcVaultDpopSession, type OidcVaultDpopSession } from '../../src/auth/auth-session';
import { fetchWithDpop, type DpopFetchOptions } from '../../src/auth/auth-fetch';
import { createDeviceFingerprint } from '../../src/auth/device-fingerprint';
import { getOrCreateDpopKey } from '../../src/auth/dpop-key-store';
import { withDpopDatabase } from '../../src/auth/key-database';
import { assertDpopBrowserFeatures, resolveDpopScope } from '../../src/auth/scope';
import { calculateJwkThumbprint } from 'jose';

const sessions = new Map<string, OidcVaultDpopSession>();
const signals = new Map<string, string | undefined>();
interface Scope {
  backendOrigin: string;
  basePath: string;
}
let keyGenerationReady = false;
let releaseGeneration: (() => void) | undefined;

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
  const { id } = resolveDpopScope({ frontendOrigin: location.origin, ...scope });
  await withDpopDatabase(async (db) => {
    await db.delete('keys', id);
  });
};

export const replaceKey = async (scope: Scope) => {
  const { id } = resolveDpopScope({ frontendOrigin: location.origin, ...scope });
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: exported.x!, y: exported.y! };
  const jkt = await calculateJwkThumbprint(publicJwk);
  await withDpopDatabase(async (db) => {
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

export const featureDetection = async (input: { cookie: boolean }) => {
  assertDpopBrowserFeatures(input.cookie);
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
