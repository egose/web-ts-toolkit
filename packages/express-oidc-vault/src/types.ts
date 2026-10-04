import type { KeyObject } from 'node:crypto';

import type { Request, Response } from 'express';
import type {} from 'express-serve-static-core';
import type { JWK } from 'jose';

export type OidcVaultRouteName = 'login' | 'callback' | 'exchange' | 'refresh' | 'logout' | 'backchannel-logout';

/** Enabling the option defaults to `optional`; omitting it keeps bearer behavior. */
export type OidcVaultDeviceBindingMode = 'optional' | 'required';

/** DPoP proof algorithms, independent of the app-local access token's signing algorithm. */
export type OidcVaultDpopAlgorithm = 'ES256' | 'PS256' | 'RS256';

/**
 * Immutable persisted sender constraint. `jkt` is the canonical RFC 7638
 * SHA-256 JWK thumbprint (43 base64url characters). Store no JWK, private key,
 * proof algorithm, or historical enforcement mode in this record.
 */
export interface OidcVaultDpopBinding {
  type: 'dpop';
  jkt: string;
}

/** Verified request context; `alg` is checked against the current proof policy. */
export interface OidcVaultVerifiedDpopBinding extends OidcVaultDpopBinding {
  alg: OidcVaultDpopAlgorithm;
}

/**
 * Optional stateless, key/context-bound DPoP nonce policy. Challenges are issued
 * only after other proof/target checks and before replay reservation. Any
 * authentic live nonce permits parallel fresh proofs; it does not replace the
 * normal iat window or single-use JTI reservation. Shared instances need the
 * same secret; rotation requires a new challenge, with no previous-secret list.
 */
export interface OidcVaultDpopNonceOptions {
  /** Shared random secret of at least 32 bytes, copied at construction. */
  secret: Uint8Array;
  /** Integer lifetime in seconds, 1–300; default 60. */
  lifetimeSeconds?: number;
}

/**
 * Shared RFC 9449 proof profile for vault POSTs and request-aware APIs.
 * Proofs are limited to 8192 wire bytes and 2048 decoded protected-header/JWK
 * bytes, use typ dpop+jwt and public-only asymmetric keys, and require exact
 * method/pinned normalized URL plus a signed printable ASCII JTI (1–128 bytes).
 * Signature verification precedes claims; strict iat validity is
 * nowSeconds - age - skew < iat <= nowSeconds + skew. APIs additionally match
 * original verified cnf.jkt and SHA-256 ath of the ASCII access token.
 */
export interface OidcVaultDpopProofOptions {
  /** Nonempty asymmetric allowlist; default `['ES256']` (P-256). RSA proofs require 2048–4096 bits. */
  algorithms?: readonly OidcVaultDpopAlgorithm[];
  /** Integer maximum proof age in seconds, 1–300; default 60. */
  proofMaxAgeSeconds?: number;
  /** Integer clock tolerance in seconds, 0–30; default 5. */
  clockSkewSeconds?: number;
  /** Off by default. Challenges are at most 512 bytes; retry once with a fresh proof, never reuse its JTI. */
  nonce?: false | OidcVaultDpopNonceOptions;
}

/**
 * Opt-in sender constraint. `optional` permits legacy unbound records without
 * enrolling them from a later proof; `required` rejects unbound use. Persisted
 * bound records never downgrade when the option or a proof is omitted.
 */
export interface OidcVaultDeviceBindingOptions extends OidcVaultDpopProofOptions {
  /** Default optional when configured. Required rejects unbound use; there is no legacy downgrade switch. */
  mode?: OidcVaultDeviceBindingMode;
}

/**
 * Opt-in, vendor-independent browser recognition/change detection, NOT proof of
 * possession. A copyable signal never satisfies required DPoP or constrains API
 * access. POST login alone enrolls a supplied signal; absence is intentionally
 * unenrolled. Callback stores only SHA-256 in reserved session metadata.
 */
export interface OidcVaultFingerprintRecognitionOptions {
  /**
   * HTTP field name; default X-Device-Fingerprint. Must not collide with auth,
   * cookie, origin, content, or transport headers. One raw field with a nonempty
   * printable ASCII value, at most 256 bytes; no trimming or normalization.
   * Malformed/duplicate/oversized opted-in signals return 400
   * OIDC_VAULT_INVALID_FINGERPRINT before credential work.
   */
  headerName?: string;
}

/**
 * Request-aware API sender constraint. Every API accepting bound JWTs must
 * enforce this policy; signature-only validation does not prove possession.
 * Construction snapshots plain options, URLs, algorithms and nonce bytes.
 */
export interface OidcVaultApiDeviceBindingOptions extends OidcVaultDeviceBindingOptions {
  /** Static HTTPS origin (loopback HTTP development allowed); never derived from Host/proxy headers. */
  publicOrigin: string;
  /** External mount prefix stripped by a proxy, normalized at construction; default empty. No query/fragment. */
  publicPathPrefix?: string;
  /** Shared static printable ASCII protection-space label, 1–128 bytes; never a token, route or instance ID. */
  replayNamespace: string;
  /** Explicit shared atomic service, normally the vault store. No per-middleware fallback. */
  replayStore: OidcVaultDpopReplayStore;
  /** Epoch-millisecond clock for proof age/nonce/replay; default Date.now. Shared instances need synchronized clocks. */
  now?: () => number;
}

export interface OidcVaultUserProfile {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  [key: string]: unknown;
}

/**
 * Stored session identity. Exchange, refresh, and logout compare each defined
 * field verbatim against resolved middleware config before use. Opt-in/guarded
 * exchange checks before code consumption; built-in logout also checks the
 * surviving lineage through unexpired aliases before proof or deletion.
 * Known mismatches fail with 401 `OIDC_VAULT_INVALID_SESSION` without changing
 * the session or cookie. Issuer trailing-slash variants are distinct.
 *
 * Omitted fields remain legacy-compatible and are not backfilled by refresh.
 * Use separate session/alias, exchange-code, and transaction namespaces for
 * complete isolation. Disabled legacy bearer exchange retains its historical
 * consume-before-identity ordering; old custom bearer stores without revocation
 * context retain their legacy alias behavior. Missing identifiers are not an
 * isolation guarantee.
 */
export interface OidcVaultProviderMetadata {
  issuer?: string;
  clientId?: string;
}

export interface OidcVaultSession {
  sessionId: string;
  /**
   * Stable identifier for the logical refresh-token-backed session across
   * session ID rotations. Stores use this to revoke a session even while a
   * refresh rotates the public session ID.
   */
  logicalSessionId?: string;
  subject: string;
  providerSessionId?: string;
  provider?: OidcVaultProviderMetadata;
  /** Original login-selected sender constraint, enforced before exchange/refresh/logout (including aliases); never enrolled by a later proof. */
  deviceBinding?: OidcVaultDpopBinding;
  refreshToken: string;
  idToken: string;
  accessToken?: string;
  scope?: string;
  /**
   * Optional vault-session expiry timestamp in epoch milliseconds.
   *
   * This controls the lifetime of the refresh-token-backed server-side session.
   * It is not derived from upstream OAuth `expires_in`, which only describes the
   * upstream access token lifetime. Leave unset when your application or store
   * owns session lifetime through another policy. `sessionTtlMs` assigns an
   * absolute maximum at callback creation; a precreate hook may shorten it.
   * Refresh preserves this timestamp rather than renewing the lifetime.
   */
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
  /**
   * Verified session profile. On refresh with a new `id_token`, the profile
   * is rebuilt from fresh verified ID claims overlaid with freshly fetched
   * matching UserInfo; retained values are never carried forward, so removed
   * provider claims disappear. Application custom attributes belong in
   * `metadata`, not in `user`. Without a new `id_token`, the retained
   * profile is kept verbatim (fresh UserInfo still overlays per key).
   */
  user?: OidcVaultUserProfile;
  /**
   * Store-portable application metadata.
   *
   * Values should be JSON-compatible: strings, finite numbers, booleans, null,
   * arrays, and plain objects. Store providers return owned copies or
   * serialization round-trips, so callers must not rely on object identity,
   * custom prototypes, functions, symbols, Dates, Maps, Sets, undefined object
   * properties, or other runtime-only values surviving persistence.
   * `oidcVaultFingerprintRecognition` is reserved: `{ version: 1, hash }` is
   * immutable login-selected SHA-256 recognition evidence, never raw signal
   * data. Core preserves it through callback/refresh and removes it from token
   * issuer input and public profiles/responses. Disclose collection/retention;
   * it lasts with the transaction/session, not the local access-token lifetime.
   */
  metadata?: Record<string, unknown>;
}

export interface AuthorizationTransactionInput {
  state: string;
  nonce: string;
  pkceVerifier: string;
  codeChallenge: string;
  returnTo?: string;
  /** Login-selected sender constraint, never reconstructed from a later proof. */
  deviceBinding?: OidcVaultDpopBinding;
  /** SHA-256 hash of the temporary HttpOnly browser-binding cookie; never store the cookie secret. */
  browserBindingHash?: string;
  createdAt: number;
  expiresAt: number;
  /**
   * See `OidcVaultSession.metadata` for the portable value domain. POST login
   * reserves `oidcVaultTransactionProvider` for its resolved issuer/clientId;
   * stores must preserve it for callback identity preflight. Opted-in POST login
   * also carries immutable `oidcVaultFingerprintRecognition` for callback
   * session creation; no raw fingerprint signal is stored.
   */
  metadata?: Record<string, unknown>;
}

export type AuthorizationTransaction = AuthorizationTransactionInput;

export interface ExchangeCodeRecordInput {
  code: string;
  sessionId: string;
  returnTo?: string;
  /** Copied from the authenticated login transaction; must agree with the session. */
  deviceBinding?: OidcVaultDpopBinding;
  /** Copied transaction-cookie hash; guarded exchange matches both cookie and key. */
  browserBindingHash?: string;
  createdAt: number;
  expiresAt: number;
}

export type ExchangeCodeRecord = ExchangeCodeRecordInput;

export interface OidcVaultSessionInput extends Omit<OidcVaultSession, 'createdAt' | 'updatedAt'> {
  createdAt?: number;
  updatedAt?: number;
}

export interface RotateSessionInput {
  sessionId: string;
  /** Omitted binding inherits the source; changing its key or enrolling an unbound source is rejected. */
  nextSession: OidcVaultSession;
}

export interface DeleteSessionsBySubjectInput {
  subject: string;
  issuer?: string;
  clientId?: string;
}

export interface DeleteSessionsByProviderSessionIdInput {
  providerSessionId: string;
  issuer?: string;
  clientId?: string;
}

export interface DeleteSessionsByLogicalSessionIdInput {
  logicalSessionId: string;
}

export interface ConsumeBackchannelLogoutTokenJtiInput {
  jti: string;
  /** Finite future epoch-millisecond expiry. Values `<= now` are expired. */
  expiresAt: number;
}

/**
 * Complete guarded-record match. Explicit `null` requires an absent/undefined
 * stored field; it never means ignore the field. Both fields are mandatory.
 * Valid persisted shapes are legacy (neither field), cookie-only (hash), or
 * bound (hash + key). Stored null/malformed fields and a key without a hash
 * are invalid. Both hashes use canonical 43-character SHA-256 base64url.
 */
export interface OidcVaultRecordBindingMatch {
  deviceBinding: OidcVaultDpopBinding | null;
  browserBindingHash: string | null;
}

export interface ConsumeAuthorizationTransactionIfMatchesInput {
  state: string;
  match: OidcVaultRecordBindingMatch;
}

export interface ConsumeExchangeCodeIfMatchesInput {
  code: string;
  /** Session ID from preflight, included in the atomic consume comparison. */
  expectedSessionId: string;
  match: OidcVaultRecordBindingMatch;
}

export interface ReserveDpopProofInput {
  /** Opaque `dpop:v1:` + SHA-256 base64url of JSON([effectiveNamespace, jkt, jti]), supplied after proof/target/nonce checks. */
  replayKey: string;
  /** Future safe-integer epoch milliseconds; maximum remaining TTL 360000 ms. */
  expiresAt: number;
}

/**
 * Shared atomic per-request replay admission; no implicit per-core-instance
 * memory fallback. Independent memory-store objects are not shared protection.
 * Shared instances need identical protection spaces/proof windows and synchronized
 * clocks. Never release a reservation after a later route/issuer failure.
 */
export interface OidcVaultDpopReplayStore {
  /**
   * Reserve once through expiry. Duplicate/invalid/expired input returns false
   * without extending expiry or allocating state. Capacity/provider failures
   * throw; callers must fail closed, never evict live reservations. Built-ins
   * default to 100000 entries per shared namespace. Expired entries awaiting
   * bounded cleanup may conservatively occupy capacity. Duplicate detection
   * precedes capacity rejection; capacity throws `OidcVaultDpopReplayCapacityError`.
   */
  reserveDpopProof(input: ReserveDpopProofInput): Promise<boolean>;
}

/**
 * Detached revocation authority for a currently live lineage, resolved through
 * a live handle or unexpired rotation alias. Never authenticates an alias and
 * contains no tokens, profile, metadata, or provider fields beyond issuer/clientId.
 * Inconsistent/malformed lineage binding or identity throws a private diagnostic.
 */
export interface OidcVaultSessionRevocationContext {
  logicalSessionId: string;
  provider?: OidcVaultProviderMetadata;
  deviceBinding?: OidcVaultDpopBinding;
}

export class OidcVaultStoreConflictError extends Error {
  constructor(message = 'OIDC vault store operation conflicted with concurrent state changes.') {
    super(message);
    this.name = 'OidcVaultStoreConflictError';
  }
}

/**
 * Shared DPoP replay capacity is exhausted. No live reservation is evicted and
 * no proof is admitted without replay state. Handle like any replay-store
 * failure: fail closed; expose only the sanitized replay-unavailable error.
 */
export class OidcVaultDpopReplayCapacityError extends Error {
  constructor(message = 'OIDC vault DPoP replay store capacity is exhausted.') {
    super(message);
    this.name = 'OidcVaultDpopReplayCapacityError';
  }
}

/**
 * Portable store boundary for JSON-compatible plain objects/arrays and scalar
 * values (strings, finite numbers, booleans, null). Built-in providers capture
 * inputs at invocation before asynchronous work; returned portable data is
 * detached from caller input and stored state. Native BSON/JSON/structured-clone
 * values outside that subset retain provider-specific serialization semantics;
 * opaque native objects have no cross-provider mutation-isolation guarantee.
 *
 * Bulk deletion counts primary records removed, never alias cleanup. Memory
 * excludes expired sessions; MongoDB can count expired rows awaiting TTL cleanup;
 * Redis counts actual primary deletions during a cursor traversal. Counts are not
 * proof that no matches remain: concurrent arrivals can survive. MongoDB scoped
 * deletion repeats until an empty query; Redis traverses once. Neither provides
 * a global logout snapshot, and errors can follow earlier committed deletions.
 */
export interface OidcVaultStoreProvider {
  /** Upsert an authorization transaction by `state`. */
  createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void>;
  /** Legacy consume: refuses guarded (cookie/key-bound) records without consuming them. */
  consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null>;
  /** Optional opt-in capability: detached live preflight snapshot, not a lock. */
  getAuthorizationTransaction?(state: string): Promise<AuthorizationTransaction | null>;
  /** Optional opt-in capability: atomic expiry + complete exact/null match + consume; mismatch leaves the record live. */
  consumeAuthorizationTransactionIfMatches?(
    input: ConsumeAuthorizationTransactionIfMatchesInput,
  ): Promise<AuthorizationTransaction | null>;
  /** Upsert an exchange code record by `code`. */
  createExchangeCode(input: ExchangeCodeRecordInput): Promise<void>;
  /** Legacy consume: refuses guarded (cookie/key-bound) records without consuming them. */
  consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null>;
  /** Optional opt-in capability: detached live preflight snapshot, not a lock. */
  getExchangeCode?(code: string): Promise<ExchangeCodeRecord | null>;
  /** Optional opt-in capability: atomically match the session ID and both binding fields before consuming. */
  consumeExchangeCodeIfMatches?(input: ConsumeExchangeCodeIfMatchesInput): Promise<ExchangeCodeRecord | null>;
  /**
   * Create a session by `sessionId`, defaulting timestamps and logical lineage when omitted.
   *
   * Duplicate-ID behavior is provider-specific (SVH-06): the memory and
   * MongoDB providers replace the existing session (upsert), while the Redis
   * provider rejects a live duplicate with `OidcVaultStoreConflictError`
   * without changing the existing record or indexes (create-only, preserving
   * RVR-02 index ownership). A rejected create preserves the original record
   * and its subject/logical/provider-session index memberships; an accepted
   * replacement takes over the ID with its own subject/logical/provider-session
   * scope. Reusing an ID that holds only a stale rotation alias clears that
   * alias on memory/Redis, while MongoDB can retain the stale alias row until
   * expiry or lineage cleanup (FU-SVH-05b).
   *
   * Portable callers must always create sessions with a fresh unused
   * `sessionId` and handle `OidcVaultStoreConflictError`: reusing a live ID is
   * non-portable (it may replace or reject), and concurrent reuse races
   * rotation source checks (SVH-08). The core middleware only creates fresh
   * random IDs, so it never depends on duplicate-create behavior.
   */
  createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession>;
  getSession(sessionId: string): Promise<OidcVaultSession | null>;
  /** Optional opt-in capability: resolve only a currently live lineage, including through unexpired aliases. No upstream tokens. */
  getSessionRevocationContext?(sessionId: string): Promise<OidcVaultSessionRevocationContext | null>;
  /** Optional opt-in capability; see `OidcVaultDpopReplayStore.reserveDpopProof`. */
  reserveDpopProof?(input: ReserveDpopProofInput): Promise<boolean>;
  /**
   * Atomically replace an existing session with a distinct unused `nextSession.sessionId`.
   *
   * Providers preserve the existing logical session ID when the next session omits
   * one, inherit the original device binding when omitted, and reject changing
   * a bound key or adding binding to an unbound source without mutation. Null or
   * malformed security fields are invalid, never legacy. Retain the old public
   * session ID as an in-flight-request revocation alias. Rotation itself does
   * not revoke the lineage. Providers throw
   * `OidcVaultStoreConflictError` without changing source or target data when
   * the source is missing, the target already exists, or the target ID equals
   * the source ID.
   *
   * Each alias expires with its immediate successor session's `expiresAt` and is
   * not extended by later rotations, so an earlier alias can stop working while
   * the lineage is still live. A rotation that assigns an explicitly different
   * logical session ID assigns the new source-ID alias to the new lineage;
   * earlier aliases keep the old lineage and deadline if retained. Memory
   * eagerly retires inactive old-lineage aliases on ownership transitions;
   * MongoDB/Redis can retain them until expiry or explicit cleanup. Use distinct
   * logical IDs for unrelated login families. Sessions without `expiresAt` have
   * provider-specific retention: memory and Redis impose no alias time limit, while
   * MongoDB applies its finite `rotatedSessionAliasRetentionMs` fallback
   * (default 5 minutes). Generic callers must treat an expired alias as a hint,
   * not a revocation channel; core refresh rotates the live session directly and
   * preserves `expiresAt`, so it does not depend on alias lifetime (SVH-05).
   */
  rotateSession(input: RotateSessionInput): Promise<OidcVaultSession>;
  /**
   * Delete a live public-ID record, or revoke the logical lineage through an
   * unexpired alias when no live record exists. Aliases are not readable through
   * `getSession` and have no issuer/client filter. Scoped/direct deletion preserves
   * unexpired aliases while another live member survives, even in another scope.
   */
  deleteSession(sessionId: string): Promise<void>;
  /** Revoke a logical lineage without an issuer/client filter; see provider count/concurrency notes. */
  deleteSessionsByLogicalSessionId(input: string | DeleteSessionsByLogicalSessionIdInput): Promise<number>;
  /**
   * Record a backchannel logout JTI once until its finite future expiry.
   *
   * Returns `false` for duplicate, expired, exact-boundary, `NaN`, or infinite
   * expiries. A JTI rejected for invalid or already-expired expiry is not stored.
   *
   * The core middleware (BOV-01) passes an opaque replay key that already
   * namespaces the raw logout-token `jti` by issuer and client ID, so
   * providers must treat `jti` as an opaque string and need no schema change. Pre-BOV-01 raw-`jti` records use
   * a different key shape and expire naturally with the logout-token `exp`;
   * they are never matched by namespaced keys. Retry safety comes from the
   * atomic single-key reservation plus idempotent catch-up deletion in the
   * route handler, not from a multi-key store transaction.
   */
  consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean>;
  /** Delete matching subject sessions, filtering by each supplied issuer/client; string input is unscoped. */
  deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number>;
  /** Delete matching provider-session IDs, filtering by each supplied issuer/client; string input is unscoped. */
  deleteSessionsByProviderSessionId(input: string | DeleteSessionsByProviderSessionIdInput): Promise<number>;
}

/**
 * Required store capabilities for opt-in device binding or fingerprint
 * recognition. All six methods are checked at vault construction, including
 * fingerprint-only flows (which do not reserve DPoP proofs). Old bearer-only
 * custom stores retain the base interface. Guarded reads are preflight only:
 * providers must compare/consume atomically and preserve original binding and
 * portable reserved recognition metadata through core's rotation inputs.
 */
export interface OidcVaultDeviceBindingStoreProvider extends OidcVaultStoreProvider, OidcVaultDpopReplayStore {
  /** Detached live snapshot, never a lock. Malformed/null binding/hash is invalid, not legacy. */
  getAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null>;
  /** Atomic expiry + full exact/null match + deletion. Mismatch leaves the live record available for an honest retry. */
  consumeAuthorizationTransactionIfMatches(
    input: ConsumeAuthorizationTransactionIfMatchesInput,
  ): Promise<AuthorizationTransaction | null>;
  /** Detached live preflight snapshot, without spending the code. */
  getExchangeCode(code: string): Promise<ExchangeCodeRecord | null>;
  /** Atomic expiry + expectedSessionId + both exact/null binding fields + deletion; no get/unconditional-delete fallback. */
  consumeExchangeCodeIfMatches(input: ConsumeExchangeCodeIfMatchesInput): Promise<ExchangeCodeRecord | null>;
  /** Resolve current lineage authority, never the alias's missing/historical binding; no credentials are returned. */
  getSessionRevocationContext(sessionId: string): Promise<OidcVaultSessionRevocationContext | null>;
  /** Atomic duplicate-first admission; false rejects the proof, capacity/provider errors fail closed with HTTP 503. */
  reserveDpopProof(input: ReserveDpopProofInput): Promise<boolean>;
}

export interface OidcVaultHookContext {
  route: OidcVaultRouteName;
  req: Request;
  res: Response;
  session?: OidcVaultSession;
  metadata?: Record<string, unknown>;
}

export interface OidcVaultErrorContext extends OidcVaultHookContext {
  /**
   * Original private diagnostic, separate from sanitized browser JSON. Narrow
   * before use; provider transport/replay admission errors retain the original failure in
   * `error.cause`, while issuer-result validation supplies a TypeError directly.
   */
  error: unknown;
}

export interface OidcVaultHooks {
  onLoginStart?(context: OidcVaultHookContext): void | Promise<void>;
  onAuthorizationUrl?(context: OidcVaultHookContext): void | Promise<void>;
  onCallbackTokens?(context: OidcVaultHookContext): void | Promise<void>;
  onUserInfo?(context: OidcVaultHookContext): void | Promise<void>;
  /**
   * May mutate the session before persistence or veto creation by throwing.
   * With `sessionTtlMs`, the session already carries the absolute expiry.
   * After this hook, a valid earlier epoch-millisecond expiry is preserved;
   * removal, extension, or an invalid timestamp restores the configured cap.
   * Without `sessionTtlMs`, application/store lifetime policy is unchanged.
   * Security-owned `deviceBinding` is restored from core's private snapshot;
   * the hook cannot enroll, remove, or rebind a sender constraint. Guarded POST
   * callbacks also retain their fresh session/lineage IDs and resolved provider
   * identity independently of hook mutations. Reserved fingerprint recognition
   * metadata is restored from the original transaction, including unenrolled
   * absence; a hook/profile cannot enroll, strip, or rebind it. Other application
   * metadata/profile fields remain mutable; throwing is an authenticated terminal veto.
   */
  onBeforeSessionCreate?(context: OidcVaultHookContext): void | Promise<void>;
  onSessionCreated?(context: OidcVaultHookContext): void | Promise<void>;
  /** Post-rotation notification with owned plain session data; mutation cannot change stored/response authority or profile precedence. */
  onSessionRefreshed?(context: OidcVaultHookContext): void | Promise<void>;
  /** Pre-revocation veto for a live handle, after identity/proof/nonce/replay. Receives owned session data; deletion uses original lineage authority. */
  onBeforeLogout?(context: OidcVaultHookContext): void | Promise<void>;
  onLogout?(context: OidcVaultHookContext): void | Promise<void>;
  onError?(context: OidcVaultErrorContext): void | Promise<void>;
}

export interface IssueTokenInput {
  /** Owned session data; reserved fingerprint recognition evidence is omitted to keep hashes out of application tokens. */
  session: OidcVaultSession;
  req: Request;
  res: Response;
  /**
   * Authoritative verified request/key context, detached and frozen by core.
   * Use this thumbprint for `cnf.jkt`, not mutable session/profile fields.
   * Absent for unbound issuance; a later proof never enrolls a legacy session.
   */
  deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>;
}

/**
 * Local application credentials returned by `OidcVaultTokenIssuer.issue`.
 * Runtime validation copies only these fields into a fresh result; additional
 * properties are ignored and cannot override the response's session ID/user.
 */
export interface OidcVaultTokenIssueResult {
  /** Nonempty opaque token for unbound issuance; bound issuance requires a compact signed JWT with matching `cnf.jkt`. */
  accessToken: string;
  /** Token lifetime in seconds: a finite, nonnegative safe integer (zero is valid). */
  expiresIn: number;
  /** Exact `DPoP` is required when bound. Unbound permits only `Bearer` or omission; omitted/undefined stays absent in JSON. */
  tokenType?: 'Bearer' | 'DPoP';
}

/**
 * Trusted application token issuer for exchange and refresh. Return a non-null,
 * non-array object satisfying `OidcVaultTokenIssueResult`; only its declared
 * credential fields enter the response. This contains accidental extensions,
 * not arbitrary behavior of trusted issuers/hooks with request/response access.
 * Core retains its own binding/lineage snapshots across issuer calls.
 */
export interface OidcVaultTokenIssuer {
  /**
   * Invalid results fail inside issuance rollback: revoke the session lineage
   * (including the rotated refresh session), clear a cookie-transport session
   * cookie, and return sanitized HTTP 500 / `OIDC_VAULT_INTERNAL_ERROR`.
   * Field diagnostics are available privately through `hooks.onError`.
   * Core decodes a bound result only to check this trusted issuer contract;
   * APIs must independently verify signature, issuer, audience, and expiry.
   */
  issue(input: IssueTokenInput): Promise<OidcVaultTokenIssueResult>;
}

export interface OidcVaultAccessTokenValidationResult {
  subject: string;
  sessionId?: string;
  scope?: string;
  claims?: Record<string, unknown>;
  /** Verified sender constraint. Legacy adapters may omit it only for genuinely unbound credentials. */
  confirmation?: OidcVaultAccessTokenConfirmation | null;
}

/** Canonical RFC 7638 SHA-256 thumbprint derived from verified token/introspection data, never from a proof alone. */
export interface OidcVaultAccessTokenConfirmation {
  jkt: string;
}

export interface OidcVaultAccessTokenRequestInput {
  token: string;
  scheme: 'Bearer' | 'DPoP';
  req: Request;
}

/** Mandatory confirmation: null means verified unbound; missing confirmation or malformed/unsupported cnf is invalid. */
export interface OidcVaultRequestAwareAccessTokenValidationResult extends OidcVaultAccessTokenValidationResult {
  confirmation: OidcVaultAccessTokenConfirmation | null;
}

export interface OidcVaultAuthContext extends OidcVaultAccessTokenValidationResult {
  token: string;
  /** Present only after original-key proof, API ath, nonce and shared replay admission all pass. */
  deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>;
}

export interface OidcVaultAccessTokenValidator {
  /** Binding-disabled middleware invokes exactly validate(token), with one argument. Report any known confirmation. */
  validate(token: string): Promise<OidcVaultAccessTokenValidationResult>;
  /** Required at middleware construction when deviceBinding is enabled; called for both Bearer and DPoP. */
  validateWithRequest?(
    input: OidcVaultAccessTokenRequestInput,
  ): Promise<OidcVaultRequestAwareAccessTokenValidationResult>;
}

/**
 * Trusted adapter for verified JWT/introspection data. Faithfully report the
 * original confirmation independently of custom mapping: null is genuinely
 * unbound, never a malformed/unsupported cnf. The middleware owns proof checks.
 */
export interface OidcVaultRequestAwareAccessTokenValidator extends OidcVaultAccessTokenValidator {
  validateWithRequest(
    input: OidcVaultAccessTokenRequestInput,
  ): Promise<OidcVaultRequestAwareAccessTokenValidationResult>;
}

export interface OidcVaultAccessTokenMiddlewareErrorContext {
  error: unknown;
  req: Request;
  res: Response;
  token?: string;
  auth?: OidcVaultAuthContext;
}

export interface OidcVaultAccessTokenMiddlewareOptions {
  validator: OidcVaultAccessTokenValidator;
  /** Opt-in API DPoP enforcement; requires validateWithRequest. Omission preserves the one-argument legacy path. */
  deviceBinding?: OidcVaultApiDeviceBindingOptions;
  /**
   * Pre-`next()` veto hook, not a post-commit notification: when it throws,
   * downstream middleware never runs and `req.auth` is detached before the
   * error response is sent. A valid credential plus a failing hook
   * never surfaces as an invalid-token 401: a controlled package error from the
   * hook keeps its own status/code/client message (a 401 uses the attempted
   * scheme's challenge, other statuses carry no challenge), while any other hook
   * error becomes a sanitized `500 OIDC_VAULT_AUTH_CONTEXT_FAILED` without
   * leaking the original message. The original error is observable via
   * `onError` for private server-side logs. Security-owned token/confirmation/
   * deviceBinding and req.auth authority are restored after mutable hooks;
   * a veto never releases an admitted proof's replay reservation.
   */
  onAuthContext?(input: { req: Request; res: Response; auth: OidcVaultAuthContext }): void | Promise<void>;
  /**
   * Observes the original error for every API-middleware failure
   * (extraction, validator, proof/nonce/replay, and `onAuthContext`) without affecting
   * the sanitized client response. Failures thrown by this observer are
   * swallowed so the original error response is preserved. Replay failures
   * retain the provider diagnostic in non-enumerable error.cause. No request
   * auth context is attached before proof acceptance or after a veto.
   */
  onError?(context: OidcVaultAccessTokenMiddlewareErrorContext): void | Promise<void>;
}

export interface OidcVaultAuthenticatedRequest extends Request {
  auth?: OidcVaultAuthContext;
}

/** Local JWT verification options, independent of the asymmetric DPoP proof policy; captured at construction. */
export interface OidcVaultJwtAccessTokenValidatorOptions {
  key: CryptoKey | KeyObject | JWK | Uint8Array;
  issuer?: string;
  audience?: string | string[];
  algorithms?: string[];
  /** Verified cnf is snapshotted before this mapper; mapper-supplied confirmation/deviceBinding is ignored. */
  mapClaims?(claims: Record<string, unknown>): OidcVaultAccessTokenValidationResult;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: OidcVaultAuthContext;
  }
}

export interface OidcVaultConfig {
  /**
   * OIDC issuer identifier, preserved exactly after surrounding-whitespace
   * trimming (no trailing slash is added, so `/tenant`, `/tenant/`, and
   * `/tenant//` remain distinct). Must be an absolute http(s) URL without
   * userinfo, query, or fragment; `http` is accepted for local-test
   * providers. Required alongside `clientId` in discovery and manual modes.
   * Any nonempty endpoint, including `userInfoEndpoint`/`endSessionEndpoint`,
   * selects manual mode: supply `authorizationEndpoint`, `tokenEndpoint`, and
   * `jwksUri`; no discovery or partial overrides. Blank strings are absent
   * after trimming. Discovery responses
   * must carry an exactly equal issuer, and ID/logout tokens are validated
   * against this exact identifier.
   */
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  jwksUri?: string;
  endSessionEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
}

export interface OidcVaultLogoutResult {
  /**
   * Successful logout commits revocation before upstream work and clears the
   * session cookie under cookie transport. Built-in live handles and unexpired
   * aliases authenticate the surviving lineage's provider/original binding;
   * wrong identity, missing/wrong/stale/replayed proof, or disabled acceptance
   * of a bound lineage fails without deleting or clearing. No currently live
   * target is idempotent success without deletion or proof reservation. Aliases
   * grant revocation only, not refresh authentication or upstream redirects.
   * Old custom bearer stores without revocation context retain legacy alias
   * deletion behavior. Stateless application access tokens are not invalidated.
   * Local-only logout (`redirect` unset or `false`) never contacts the provider.
   * Redirected logout (`redirect: true`)
   * treats the upstream end-session redirect as best-effort: when provider
   * discovery fails or no `endSessionEndpoint` is available, the route still
   * returns this local success. Discovery errors reach `onError` without
   * undoing revocation or skipping the live session's `onLogout` notification.
   */
  loggedOut: true;
}

export interface OidcVaultBackchannelLogoutResult {
  loggedOut: true;
  revokedSessions: number;
}

export interface OidcVaultExchangeResult extends Partial<OidcVaultTokenIssueResult> {
  /** Authoritative vault handle in body transport; omitted from cookie-transport JSON. */
  sessionId?: string;
  /** Session profile; extra token-issuer result properties cannot override it. */
  user?: OidcVaultUserProfile;
}

/** JSON body for opt-in `POST <basePath>/login`; proof/key and recognition signals belong in their configured headers, not the body. */
export interface OidcVaultLoginInitiationInput {
  /** Optional destination on the configured frontend origin. Query-string returnTo is ignored by POST login. */
  returnTo?: string;
}

/**
 * Exact successful POST-login JSON. Navigate to this URL after storing a proof
 * key when DPoP is enabled. Use credentials: 'include' even with body session
 * transport: initiation sets a temporary HttpOnly transaction cookie.
 */
export interface OidcVaultLoginInitiationResult {
  authorizationUrl: string;
}

export type OidcVaultSessionTransport = 'body' | 'cookie';

export type OidcVaultCookieDeploymentMode = 'same-origin' | 'same-site' | 'cross-site';

export type OidcVaultCookieSameSite = 'lax' | 'strict' | 'none';

/**
 * Temporary browser-binding cookie for POST login -> headerless callback ->
 * guarded exchange. Always host-only, Path=/, HttpOnly, and Secure on HTTPS;
 * no Domain/path/security opt-outs. One pending flow per cookie name: a fresh
 * initiation replaces it. Use distinct names for multiple vault mounts.
 */
export interface OidcVaultTransactionCookieOptions {
  /**
   * HTTP cookie token, distinct from the session cookie. HTTPS defaults to
   * __Host-oidc_vault_transaction; loopback HTTP to oidc_vault_transaction.
   * __Host-/__Secure- prefixes require HTTPS.
   */
  name?: string;
  /** Default lax permits the provider's top-level GET callback. Explicit none requires HTTPS for cross-site SPAs. */
  sameSite?: 'lax' | 'none';
}

export interface OidcVaultCookieOptions {
  /**
   * Session cookie name. Must be a valid HTTP cookie name (printable ASCII
   * token). Names with the `__Secure-` prefix require an effectively Secure
   * cookie; names with the `__Host-` prefix additionally require no
   * `cookie.domain` and `cookie.path: '/'`. Checked against effective
   * serialized values, so `sameSite: 'none'` counts as Secure.
   */
  name?: string;
  deploymentMode?: OidcVaultCookieDeploymentMode;
  sameSite?: OidcVaultCookieSameSite;
  /**
   * Explicit `Secure` override. When omitted, defaults to `true` for HTTPS
   * `backendOrigin`, `sameSite: 'none'`, or `deploymentMode: 'cross-site'`;
   * otherwise `false` as an intentional HTTP local-development policy
   * (plaintext backends must opt into `secure: true` when served over HTTPS
   * behind a proxy that reports an `http` origin). `SameSite=None` is always
   * serialized with `Secure` regardless of this flag because browsers reject
   * `SameSite=None` without it.
   */
  secure?: boolean;
  /**
   * Optional cookie `Domain`. Must be a valid cookie domain when set. Must be
   * omitted for `__Host-` prefixed names (host-only requirement).
   */
  domain?: string;
  /**
   * Cookie `Path`. Must start with `/` and contain only header-safe printable
   * ASCII (no CTLs, DEL, non-ASCII/Unicode, or `;`). `__Host-` prefixed names
   * require exactly `'/'`.
   */
  path?: string;
  /**
   * Must be `true` or omitted. Middleware creation rejects
   * `httpOnly: false` for cookie session transport; there is no unsafe
   * compatibility switch.
   */
  httpOnly?: boolean;
}

export interface OidcVaultOptions {
  /** Public router mount; default /auth/oidc. DPoP vault proxies must preserve this externally visible path. */
  basePath?: string;
  /** Pinned public callback/proof origin. DPoP requires a static HTTPS origin, with loopback HTTP allowed for development. */
  backendOrigin: string;
  /** Vault persistence and, when DPoP is enabled, atomic replay admission. All six stronger capabilities are required for either opt-in feature. */
  storeProvider: OidcVaultStoreProvider;
  config?: OidcVaultConfig;
  /**
   * Lifecycle hooks shared by reference (not cloned): pre-commit hooks run
   * before durable state changes and can veto by throwing, while
   * `onSessionCreated`/`onSessionRefreshed`/`onLogout` are post-commit
   * notifications whose failures reach `onError` without undoing state.
   * Replacing the caller options object after middleware creation has no
   * effect; the `hooks` service object itself is retained live.
   */
  hooks?: OidcVaultHooks;
  /** Optional local issuer; when omitted, exchange/refresh return no local token fields. */
  tokenIssuer?: OidcVaultTokenIssuer;
  /**
   * Opt-in DPoP policy; absent preserves unbound bearer behavior. Present with
   * no mode means `optional`. Requires all `OidcVaultDeviceBindingStoreProvider`
   * capabilities and a static HTTPS `backendOrigin` (loopback HTTP development
   * is allowed). Bound exchange/refresh/logout require a fresh original-key
   * DPoP header before code consumption, upstream refresh, hooks or revocation;
   * vault POSTs need no Authorization access token/ath. A supplied optional
   * unbound proof validates/reserves but never enrolls or rebinds. Construction
   * snapshots/freezes plain options and algorithms and copies nonce bytes.
   */
  deviceBinding?: OidcVaultDeviceBindingOptions;
  /**
   * Separate opt-in recognition policy; omission means no signal capture/check.
   * Enables JSON POST login and its temporary HttpOnly cookie in both session
   * transports, even without DPoP; requires all guarded-store capabilities.
   * POST login alone enrolls a supplied signal in reserved metadata. Enrolled
   * exchange/refresh compare before proof admission/code consume/upstream use:
   * missing/mismatch returns 403 OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED without
   * mutation. Legacy/GET/absent-signal sessions remain unenrolled. Refresh never
   * enrolls/rotates recognition; changes require fresh POST login. Logout,
   * rotation aliases, signed backchannel logout and API recognition policy are
   * unaffected. Disclose collection and transaction/session retention, including
   * store cleanup/backups; hashing is not anonymization or theft prevention.
   */
  fingerprintRecognition?: OidcVaultFingerprintRecognitionOptions;
  /**
   * Default browser return target after backend callback completion. Required
   * if login accepts a custom `returnTo`. Remains optional at middleware
   * creation because non-callback routes do not need it; the callback route
   * instead validates its destination (transaction `returnTo` or this value)
   * before any provider call or durable session/code creation and fails with
   * `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI` when neither is configured.
   */
  frontendRedirectUri?: string;
  /**
   * Optional provider-registered HTTP(S) URL used in the upstream end-session
   * redirect. Only consulted for redirected logout (`redirect: true`); local
   * logout never contacts the provider, and redirected logout treats upstream
   * discovery failures or an absent endpoint as best-effort (local
   * `200 { loggedOut: true }`, with `onLogout` still delivered for a live
   * session). Discovery errors also reach `onError`.
   */
  postLogoutRedirectUri?: string;
  /** Default enabled when discovery/manual config has a UserInfo endpoint and the response supplies an access token; false disables it. */
  fetchUserInfo?: boolean;
  /**
   * Authorization transaction lifetime in milliseconds (default: 10 minutes).
   * Must be a positive safe integer; construction and creation require
   * `now() + TTL` to be an integer within JavaScript Date's epoch range.
   */
  authorizationTransactionTtlMs?: number;
  /**
   * One-time exchange code lifetime in milliseconds (default: 30 seconds).
   * Same positive-safe-integer and computed-epoch checks as
   * `authorizationTransactionTtlMs`.
   */
  exchangeCodeTtlMs?: number;
  /**
   * Opt-in absolute server-side session lifetime in milliseconds, measured
   * from callback session creation, not login start. Must be a positive safe
   * integer producing an integer epoch within JavaScript Date's range;
   * checked at construction and again at creation using `now` (or Date.now).
   *
   * Sets `expiresAt` before `onBeforeSessionCreate` and caps it after the hook:
   * hooks may shorten the expiry but cannot extend/remove the maximum (invalid
   * timestamps also restore the cap). Refresh preserves the stored expiry.
   * Independent of upstream OAuth `expires_in`. Unset retains application/
   * store-owned lifetime behavior; no default session expiry is assigned.
   */
  sessionTtlMs?: number;
  /** Default body: JSON sessionId. Cookie mode omits that handle from JSON; POST login/exchange need the temporary cookie in both modes. */
  sessionTransport?: OidcVaultSessionTransport;
  cookie?: OidcVaultCookieOptions;
  /**
   * Detached/frozen transaction-cookie settings, independent of session
   * transport. POST login stores only SHA-256(cookie secret) and the verified
   * initiating jkt when bound; callback authenticates and atomically spends the
   * stored match. Guarded exchange needs this cookie in both session transports
   * plus the original-key proof when bound. Success/authenticated terminal
   * issuance failure clears it; mismatches and nonce challenges do not spend or
   * clear. Cookie lifetime rounds down to the transaction/code deadline.
   */
  transactionCookie?: OidcVaultTransactionCookieOptions;
  /**
   * Allowed browser source origins: POST login uses this policy in both
   * transports; guarded exchange uses the same policy (JSON or form), and
   * cookie refresh/logout retain their source checks. Missing/null/untrusted
   * sources fail closed; POST login/guarded exchange also reject raw source
   * ambiguity. backendOrigin is included internally; a valid Referer is the
   * fallback only when Origin is absent.
   */
  trustedOrigins?: string[];
  requestBodyLimit?: string | number;
  /**
   * Overall deadline in milliseconds for a single upstream provider HTTP
   * exchange, covering DNS/connect/TLS, response headers, and complete
   * success/error body consumption. Cancellation is attempted promptly but
   * never awaited: completion does not guarantee cleanup of custom streams.
   * Defaults to 5000; must be a positive finite integer.
   *
   * Successful discovery metadata is shared across timeout policies, while
   * in-flight fetches are isolated by `(issuer, providerRequestTimeoutMs)`.
   * Remote JWKS resolvers are isolated by
   * `(jwks_uri, providerRequestTimeoutMs)` because JOSE fixes the fetch
   * timeout at resolver creation; the package JWKS transport additionally
   * bounds JWKS bodies (1 MiB, 100 keys) that JOSE leaves unbounded.
   * Network/reset failures are sanitized endpoint-specific 502s; original
   * transport diagnostics are available privately via `hooks.onError`'s
   * `error.cause`. JOSE timeouts retain `ERR_JWKS_TIMEOUT`.
   */
  providerRequestTimeoutMs?: number;
  /** Epoch-millisecond clock, also sampled during construction to validate TTLs. Defaults to Date.now. */
  now?: () => number;
}
