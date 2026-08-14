import { MongoOidcVaultStore } from './store';
import type { MongoOidcVaultStoreOptions, OidcVaultMongoStoreProvider } from './options';

export { DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS } from './options';
export type { MongoOidcVaultStoreOptions, OidcVaultMongoStoreProvider } from './options';

/**
 * Creates a MongoDB-backed store provider.
 *
 * Use the named root import:
 * `import { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store'`.
 * Pass a `Db` from an already-connected caller-owned `MongoClient`, await
 * `store.ready()` before accepting traffic, and close the client from your own
 * shutdown path. Readiness validates all configured collection names, creates
 * required indexes for the five store collections, and verifies that the
 * MongoDB deployment supports transactions required by session rotation.
 */
export function createMongoOidcVaultStore(options: MongoOidcVaultStoreOptions): OidcVaultMongoStoreProvider {
  return new MongoOidcVaultStore(options);
}
