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
 * required indexes for nine store collections, validates shared replay/ticket
 * capacity and pairing, and verifies transaction support for rotation/replay/tickets.
 * Store collection reads and transactions use primary even when caller defaults
 * prefer secondaries. Caller defaults/namespaces/concerns are preserved; no extra
 * client or secondary/memory fallback is used. This does not add linearizable
 * reads, cross-call causal sessions or failover durability.
 */
export function createMongoOidcVaultStore(options: MongoOidcVaultStoreOptions): OidcVaultMongoStoreProvider {
  return new MongoOidcVaultStore(options);
}
