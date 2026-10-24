import type { Db } from 'mongodb';
import type {
  OidcVaultDeviceBindingStoreProvider,
  OidcVaultLogoutNavigationStoreProvider,
} from '@web-ts-toolkit/express-oidc-vault';

/**
 * Options for `createMongoOidcVaultStore`.
 *
 * Pass a `Db` from an already-connected caller-owned `MongoClient`. The store
 * validates collection names, creates indexes, and verifies transaction support
 * from `ready()`, so applications should await readiness before accepting
 * traffic. Rotation and shared replay admission require transactions; standalone servers
 * fail closed instead of using non-atomic multi-write fallback behavior.
 *
 * Store-owned collection reads (including readiness) and all store transactions
 * use primary, overriding URI/client/Db secondary preferences only for vault work.
 * The supplied Db, namespaces, unrelated collections, BSON options and existing
 * read/write concerns are retained; no extra client is created. An unavailable
 * primary causes an error, never secondary or memory fallback. Primary selection
 * does not add linearizable reads, cross-call causal sessions or failover durability.
 */
export interface MongoOidcVaultStoreOptions {
  /** Connected caller-owned database; vault handles/transactions use primary without changing its defaults or client lifecycle. */
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
  /** Unique replay IDs + TTL expiry. Default `oidc_vault_dpop_proofs`. Must be distinct from all other collections. */
  dpopProofsCollectionName?: string;
  /** Serialized capacity and indexed non-TTL expiry accounting. Default `oidc_vault_dpop_replay_capacity`; readiness rejects TTL indexes here. */
  dpopReplayCapacityCollectionName?: string;
  /** Positive safe integer shared by both replay collections; default 100000. All clients must configure the same limit. */
  dpopReplayMaxEntries?: number;
  /** TTL payloads; default `oidc_vault_logout_navigation_tickets`. Distinct from every other role. */
  logoutNavigationTicketsCollectionName?: string;
  /** Non-TTL serialization/expiry ledger; default `oidc_vault_logout_navigation_capacity`. */
  logoutNavigationCapacityCollectionName?: string;
  /** Independent ticket cap across namespaces in the paired collections; positive safe integer, default 10000. */
  logoutNavigationMaxEntries?: number;
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
 * including shutdown. Vault reads/transactions require primary without changing
 * caller defaults or strengthening read/write concerns.
 */
export interface OidcVaultMongoStoreProvider extends OidcVaultDeviceBindingStoreProvider {
  createLogoutNavigationTicket: OidcVaultLogoutNavigationStoreProvider['createLogoutNavigationTicket'];
  consumeLogoutNavigationTicket: OidcVaultLogoutNavigationStoreProvider['consumeLogoutNavigationTicket'];
  /**
   * Waits for startup validation to complete.
   *
   * Readiness validates collection names, creates required indexes, and verifies
   * the MongoDB deployment supports rotation/replay transactions and matching
   * shared replay/ticket-capacity configuration and ticket collection pairing.
   * Index/configuration reads use primary even if caller defaults prefer secondaries.
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
  dpopProofs: 'oidc_vault_dpop_proofs',
  dpopReplayCapacity: 'oidc_vault_dpop_replay_capacity',
  logoutNavigationTickets: 'oidc_vault_logout_navigation_tickets',
  logoutNavigationCapacity: 'oidc_vault_logout_navigation_capacity',
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
    dpopProofs: options.dpopProofsCollectionName ?? DEFAULT_COLLECTION_NAMES.dpopProofs,
    dpopReplayCapacity: options.dpopReplayCapacityCollectionName ?? DEFAULT_COLLECTION_NAMES.dpopReplayCapacity,
    logoutNavigationTickets:
      options.logoutNavigationTicketsCollectionName ?? DEFAULT_COLLECTION_NAMES.logoutNavigationTickets,
    logoutNavigationCapacity:
      options.logoutNavigationCapacityCollectionName ?? DEFAULT_COLLECTION_NAMES.logoutNavigationCapacity,
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
