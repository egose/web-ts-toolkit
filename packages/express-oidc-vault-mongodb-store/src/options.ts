import type { Db } from 'mongodb';
import type { OidcVaultStoreProvider } from '@web-ts-toolkit/express-oidc-vault';

/**
 * Options for `createMongoOidcVaultStore`.
 *
 * Pass a `Db` from an already-connected caller-owned `MongoClient`. The store
 * validates collection names, creates indexes, and verifies transaction support
 * from `ready()`, so applications should await readiness before accepting
 * traffic. Session rotation requires MongoDB transactions; standalone servers
 * fail closed instead of using non-atomic multi-write fallback behavior.
 */
export interface MongoOidcVaultStoreOptions {
  /** MongoDB database handle. The caller owns the underlying client lifecycle. */
  db: Db;
  /** Collection for authorization transactions, keyed by OIDC `state`. */
  authorizationTransactionsCollectionName?: string;
  /** Collection for short-lived frontend exchange codes. */
  exchangeCodesCollectionName?: string;
  /** Collection for OIDC vault sessions and bearer-equivalent token material. */
  sessionsCollectionName?: string;
  /** Collection for consumed backchannel logout token JTIs. */
  backchannelLogoutTokenJtisCollectionName?: string;
  /** Collection mapping rotated stale session IDs to active logical sessions. */
  rotatedSessionAliasesCollectionName?: string;
  /**
   * Finite alias retention for sessions without explicit expiry, in
   * milliseconds. Defaults to `DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS`.
   */
  rotatedSessionAliasRetentionMs?: number;
  /** Test-only clock override used for deterministic expiry and retention tests. */
  now?: () => number;
}

/**
 * MongoDB-backed OIDC vault store provider.
 *
 * Create the store after connecting the MongoDB client, then await `ready()`
 * before accepting traffic. The application owns the MongoDB client lifecycle,
 * including shutdown.
 */
export interface OidcVaultMongoStoreProvider extends OidcVaultStoreProvider {
  /**
   * Waits for startup validation to complete.
   *
   * Readiness validates collection names, creates required indexes, and verifies
   * the MongoDB deployment supports transactions required by session rotation.
   * If readiness fails, every store operation rejects with the same error.
   */
  ready(): Promise<void>;
}

export const DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS = 5 * 60 * 1000;

export const DEFAULT_COLLECTION_NAMES = {
  authorizationTransactions: 'oidc_vault_authorization_transactions',
  exchangeCodes: 'oidc_vault_exchange_codes',
  sessions: 'oidc_vault_sessions',
  backchannelLogoutTokenJtis: 'oidc_vault_backchannel_logout_token_jtis',
  rotatedSessionAliases: 'oidc_vault_rotated_session_aliases',
} as const;

export type MongoOidcVaultCollectionNames = Record<keyof typeof DEFAULT_COLLECTION_NAMES, string>;

const validateCollectionName = (role: string, name: string): void => {
  if (name.length === 0) {
    throw new TypeError(`OIDC vault MongoDB ${role} collection name must not be empty.`);
  }

  if (name.includes('\0')) {
    throw new TypeError(`OIDC vault MongoDB ${role} collection name must not contain null bytes.`);
  }

  if (name.startsWith('system.')) {
    throw new TypeError(`OIDC vault MongoDB ${role} collection name must not use the reserved system namespace.`);
  }

  if (name.includes('$')) {
    throw new TypeError(`OIDC vault MongoDB ${role} collection name must not contain '$'.`);
  }
};

export const resolveCollectionNames = (options: MongoOidcVaultStoreOptions): MongoOidcVaultCollectionNames => {
  const collectionNames = {
    authorizationTransactions:
      options.authorizationTransactionsCollectionName ?? DEFAULT_COLLECTION_NAMES.authorizationTransactions,
    exchangeCodes: options.exchangeCodesCollectionName ?? DEFAULT_COLLECTION_NAMES.exchangeCodes,
    sessions: options.sessionsCollectionName ?? DEFAULT_COLLECTION_NAMES.sessions,
    backchannelLogoutTokenJtis:
      options.backchannelLogoutTokenJtisCollectionName ?? DEFAULT_COLLECTION_NAMES.backchannelLogoutTokenJtis,
    rotatedSessionAliases:
      options.rotatedSessionAliasesCollectionName ?? DEFAULT_COLLECTION_NAMES.rotatedSessionAliases,
  };

  for (const [role, name] of Object.entries(collectionNames)) {
    validateCollectionName(role, name);
  }

  const seen = new Map<string, string>();

  for (const [role, name] of Object.entries(collectionNames)) {
    const existingRole = seen.get(name);

    if (existingRole !== undefined) {
      throw new TypeError(
        `OIDC vault MongoDB ${role} collection name must be distinct from ${existingRole}; shared collections are not supported.`,
      );
    }

    seen.set(name, role);
  }

  return collectionNames;
};
