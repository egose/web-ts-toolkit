import { openDB } from 'idb';
import { calculateJwkThumbprint } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOrCreateDpopKey, getOrCreateLoginDpopKey } from '../src/dpop-key-store';
import { DPOP_DATABASE_NAME, type StoredDpopKey } from '../src/key-database';
import { resolveDpopScope } from '../src/scope';
import { createSessionLifecycle } from '../src/session-lifecycle';

vi.mock('idb', () => ({ openDB: vi.fn() }));

const scope = {
  frontendOrigin: 'https://app.example.com',
  backendOrigin: 'https://api.example.com',
  basePath: '/auth/oidc',
};
const scopeId = resolveDpopScope(scope).id;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const makeKey = async (): Promise<StoredDpopKey> => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x!, y: jwk.y! };
  return { version: 1, scopeId, privateKey: pair.privateKey, publicJwk, jkt: await calculateJwkThumbprint(publicJwk) };
};
let key: StoredDpopKey;
let other: StoredDpopKey;
beforeAll(async () => {
  key = await makeKey();
  other = await makeKey();
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('indexedDB', {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const fixture = (existing?: unknown) => {
  const get = vi.fn(async () => existing);
  const add = vi.fn(async (_value: StoredDpopKey, id: string) => id);
  const stored = vi.fn(async (): Promise<StoredDpopKey | undefined> => undefined);
  const abort = vi.fn();
  const transaction = vi.fn(() => ({ store: { get: stored, add }, done: Promise.resolve(), abort }));
  const close = vi.fn();
  const db = { get, transaction, close } as unknown as Awaited<ReturnType<typeof openDB>>;
  vi.mocked(openDB).mockResolvedValue(db);
  return { db, get, add, stored, abort, transaction, close };
};

describe('DPH-06 persisted key recovery boundaries', () => {
  it.each([false, true])(
    'rejects a mismatched public/private pair with create=%s without replacing the record',
    async (create) => {
      const f = fixture({ ...key, privateKey: other.privateKey });
      const generate = vi.spyOn(crypto.subtle, 'generateKey');
      await expect(getOrCreateDpopKey(scope, { create })).rejects.toMatchObject({
        code: 'DPOP_KEY_LOST',
        requiresLogin: true,
      });
      expect(generate).not.toHaveBeenCalled();
      expect(f.transaction).not.toHaveBeenCalled();
      expect(f.add).not.toHaveBeenCalled();
    },
  );

  it.each(['version', 'scopeId', 'publicJwk', 'privateKey', 'jkt'] as const)(
    'does not silently replace a corrupt %s record on login',
    async (field) => {
      const f = fixture({ ...key, [field]: null });
      const generate = vi.spyOn(crypto.subtle, 'generateKey');
      await expect(getOrCreateDpopKey(scope)).rejects.toMatchObject({ code: 'DPOP_KEY_LOST' });
      expect(generate).not.toHaveBeenCalled();
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );

  it('retains installed valid keys in the existing version-1 database', async () => {
    const f = fixture(key);
    const generate = vi.spyOn(crypto.subtle, 'generateKey');
    expect((await getOrCreateDpopKey(scope)).jkt).toBe(key.jkt);
    expect(openDB).toHaveBeenCalledWith(DPOP_DATABASE_NAME, 1, expect.any(Object));
    expect(generate).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('an absent key in a credential read never starts generation or a write', async () => {
    const f = fixture();
    const generate = vi.spyOn(crypto.subtle, 'generateKey');
    await expect(getOrCreateDpopKey(scope, { create: false })).rejects.toMatchObject({ code: 'DPOP_KEY_LOST' });
    expect(generate).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('creates a non-extractable replacement only at login, keeping a concurrent first-key winner', async () => {
    const f = fixture();
    const first = await getOrCreateLoginDpopKey(scope, createSessionLifecycle().capture());
    expect(first.jkt).not.toBe(key.jkt);
    expect(first.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('jwk', first.privateKey)).rejects.toThrow();
    expect(f.add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ jkt: first.jkt, scopeId }), scopeId);
    f.stored.mockResolvedValue(key);
    f.add.mockClear();
    const winner = await getOrCreateLoginDpopKey(scope, createSessionLifecycle().capture());
    expect(winner.jkt).toBe(key.jkt);
    expect(f.add).not.toHaveBeenCalled();
  });

  it.each(['invalidate', 'dispose'] as const)(
    'does not open a persistence transaction after %s during key generation',
    async (action) => {
      const f = fixture();
      const entered = deferred<void>();
      const generated = deferred<CryptoKeyPair>();
      vi.spyOn(crypto.subtle, 'generateKey').mockImplementationOnce(() => {
        entered.resolve();
        return generated.promise;
      });
      const lifecycle = createSessionLifecycle();
      const creating = getOrCreateLoginDpopKey(scope, lifecycle.capture()).catch((error: unknown) => error);
      await entered.promise;
      lifecycle[action]();
      generated.resolve({
        privateKey: other.privateKey,
        publicKey: await crypto.subtle.importKey('jwk', other.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
          'verify',
        ]),
      });
      expect(await creating).toMatchObject({
        code: action === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED',
      });
      expect(openDB).toHaveBeenCalledOnce();
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['invalidate', 'dispose'] as const)('rechecks %s after the candidate database open', async (action) => {
    const f = fixture();
    const entered = deferred<void>();
    const opened = deferred<typeof f.db>();
    vi.mocked(openDB)
      .mockResolvedValueOnce(f.db)
      .mockImplementationOnce(() => {
        entered.resolve();
        return opened.promise;
      });
    const lifecycle = createSessionLifecycle();
    const creating = getOrCreateLoginDpopKey(scope, lifecycle.capture()).catch((error: unknown) => error);
    await entered.promise;
    lifecycle[action]();
    opened.resolve(f.db);
    expect(await creating).toMatchObject({
      code: action === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED',
    });
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(2);
  });

  it('aborts a session-owned candidate add invalidated before commit', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const added = deferred<string>();
    const done = deferred<void>();
    f.add.mockImplementationOnce(() => {
      entered.resolve();
      return added.promise;
    });
    f.abort.mockImplementation(() => {
      const error = new DOMException('Transaction aborted', 'AbortError');
      added.reject(error);
      done.reject(error);
    });
    f.transaction.mockReturnValueOnce({ store: { get: f.stored, add: f.add }, done: done.promise, abort: f.abort });
    const lifecycle = createSessionLifecycle();
    const creating = getOrCreateLoginDpopKey(scope, lifecycle.capture()).catch((error: unknown) => error);
    await entered.promise;
    lifecycle.invalidate();
    expect(await creating).toMatchObject({ code: 'DPOP_OPERATION_SUPERSEDED' });
    expect(f.abort).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledTimes(2);
  });
});
