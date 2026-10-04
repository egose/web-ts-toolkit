/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { OidcVaultDpopClientError } from './errors';

export const DPOP_DATABASE_NAME = 'oidc-vault-dpop-example-v1';

export interface PublicDpopJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}
export interface DpopKey {
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
        /* All example handles close after each operation. */
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

export const writeCookieSessionVersion = (scopeId: string, value: CookieSessionVersion): Promise<void> =>
  withDpopDatabase(async (db) => {
    await db.put('cookieSessions', value, scopeId);
  });
