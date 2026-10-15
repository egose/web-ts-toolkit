import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';

import { OidcVaultDpopClientError } from './errors';
import type { SessionAuthority } from './session-lifecycle';

// Preserve installed keys: the historical name is a persistence contract.
export const DPOP_DATABASE_NAME = 'oidc-vault-dpop-example-v1';

/** Public-only P-256 JWK carried in proof headers. */
export interface PublicDpopJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}
/** Validated persistent signing key and its canonical RFC 7638 thumbprint. */
export interface DpopKey {
  /** Non-extractable ES256 signing key; possession does not itself imply a live session. */
  readonly privateKey: CryptoKey;
  readonly publicJwk: Readonly<PublicDpopJwk>;
  readonly jkt: string;
  readonly scopeId: string;
}
export interface StoredDpopKey extends DpopKey {
  readonly version: 1;
}

// Coordination metadata is not a credential. No token or cookie/session handle
// is ever written to this store; only a key binding and opaque response version.
export interface CookieSessionVersion {
  jkt: string;
  generation: string;
  active: boolean;
}
interface DpopDatabase extends DBSchema {
  keys: { key: string; value: StoredDpopKey };
  cookieSessions: { key: string; value: CookieSessionVersion };
}

export const withDpopDatabase = async <T>(operation: (db: IDBPDatabase<DpopDatabase>) => Promise<T>): Promise<T> => {
  let db: IDBPDatabase<DpopDatabase>;
  try {
    db = await openDB<DpopDatabase>(DPOP_DATABASE_NAME, 1, {
      upgrade(database) {
        database.createObjectStore('keys');
        database.createObjectStore('cookieSessions');
      },
      blocked() {
        /* All database handles close after each operation. */
      },
    });
  } catch {
    throw new OidcVaultDpopClientError(
      'DPOP_KEY_STORAGE_UNAVAILABLE',
      'IndexedDB key persistence is unavailable.',
      true,
    );
  }
  try {
    return await operation(db);
  } finally {
    db.close();
  }
};

export const readCookieSessionVersion = (scopeId: string): Promise<CookieSessionVersion | undefined> =>
  withDpopDatabase((db) => db.get('cookieSessions', scopeId));

/** Internal guard shared by metadata, scoped reset, and session-owned key creation. */
export const guardDpopTransaction = async <T>(
  transaction: { readonly done: Promise<unknown>; abort(): void },
  authority: SessionAuthority | undefined,
  run: () => Promise<T>,
): Promise<T> => {
  let aborted = false;
  const abort = () => {
    if (aborted) return;
    aborted = true;
    try {
      transaction.abort();
    } catch {
      // An already committed transaction predates the invalidation.
    }
  };
  authority?.signal.addEventListener('abort', abort, { once: true });
  try {
    // Observe both rejections, including a synchronous request failure. Only
    // IDB requests/microtasks belong in run(), never crypto or network awaits.
    const [result] = await Promise.all([
      Promise.resolve().then(() => {
        authority?.assertCurrent();
        return run();
      }),
      transaction.done,
    ]);
    authority?.assertCurrent();
    return result;
  } catch (error) {
    abort();
    throw error;
  } finally {
    authority?.signal.removeEventListener('abort', abort);
  }
};

export const writeCookieSessionVersion = async (
  scopeId: string,
  value: CookieSessionVersion,
  authority: SessionAuthority,
): Promise<void> => {
  authority.assertCurrent();
  await withDpopDatabase(async (db) => {
    // Opening IndexedDB is asynchronous too. A pre-open check alone permits a
    // disposed/cleared operation to start a new active-generation transaction.
    authority.assertCurrent();
    const transaction = db.transaction('cookieSessions', 'readwrite');
    await guardDpopTransaction(transaction, authority, () => transaction.store.put(value, scopeId));
  });
};

export interface DpopScopeState {
  keyPresent: boolean;
  keyJkt?: string;
  cookiePresent: boolean;
  version?: CookieSessionVersion;
}

const scopeState = async (
  transaction: IDBPTransaction<DpopDatabase, ('keys' | 'cookieSessions')[], 'readonly' | 'readwrite'>,
  scopeId: string,
): Promise<DpopScopeState> => {
  const keys = transaction.objectStore('keys');
  const cookies = transaction.objectStore('cookieSessions');
  const [keyId, key, cookieId, cookie] = await Promise.all([
    Promise.resolve().then(() => keys.getKey(scopeId)),
    Promise.resolve().then(() => keys.get(scopeId)),
    Promise.resolve().then(() => cookies.getKey(scopeId)),
    Promise.resolve().then(() => cookies.get(scopeId)),
  ]);
  // These are coordination hints, not key validation. getKey distinguishes
  // absence from even a corrupt record whose stored value is undefined/null.
  return {
    keyPresent: keyId !== undefined,
    keyJkt: typeof key?.jkt === 'string' ? key.jkt : undefined,
    cookiePresent: cookieId !== undefined,
    version:
      cookie &&
      typeof cookie.jkt === 'string' &&
      typeof cookie.generation === 'string' &&
      typeof cookie.active === 'boolean'
        ? { jkt: cookie.jkt, generation: cookie.generation, active: cookie.active }
        : undefined,
  };
};

export const readDpopScopeState = async (scopeId: string, authority: SessionAuthority): Promise<DpopScopeState> => {
  authority.assertCurrent();
  return withDpopDatabase(async (db) => {
    authority.assertCurrent();
    const transaction = db.transaction(['keys', 'cookieSessions'], 'readonly');
    return guardDpopTransaction(transaction, authority, () => scopeState(transaction, scopeId));
  });
};

/** Explicit local recovery only: delete both scoped records, even when corrupt. */
export const removeDpopScope = async (scopeId: string, authority: SessionAuthority): Promise<DpopScopeState> => {
  authority.assertCurrent();
  try {
    return await withDpopDatabase(async (db) => {
      authority.assertCurrent();
      const transaction = db.transaction(['keys', 'cookieSessions'], 'readwrite');
      return guardDpopTransaction(transaction, authority, async () => {
        const previous = await scopeState(transaction, scopeId);
        authority.assertCurrent();
        const remove = async (store: 'keys' | 'cookieSessions') => {
          authority.assertCurrent();
          await transaction.objectStore(store).delete(scopeId);
        };
        await Promise.all([remove('keys'), remove('cookieSessions')]);
        return previous;
      });
    });
  } catch (error) {
    authority.assertCurrent();
    if (error instanceof OidcVaultDpopClientError) throw error;
    throw new OidcVaultDpopClientError(
      'DPOP_KEY_STORAGE_UNAVAILABLE',
      'IndexedDB key persistence is unavailable.',
      true,
    );
  }
};
