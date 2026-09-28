import type { KeyObject } from 'node:crypto';

import type { Request, Response } from 'express';
import type {} from 'express-serve-static-core';
import type { JWK } from 'jose';

export type OidcVaultRouteName = 'login' | 'callback' | 'exchange' | 'refresh' | 'logout' | 'backchannel-logout';

export interface OidcVaultUserProfile {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  [key: string]: unknown;
}

/**
 * Stored session identity. Exchange, refresh, and live-session logout compare
 * each defined field verbatim against resolved middleware config before use.
 * Known mismatches fail with 401 `OIDC_VAULT_INVALID_SESSION` without changing
 * the session or cookie. Issuer trailing-slash variants are distinct.
 *
 * Omitted fields remain legacy-compatible and are not backfilled by refresh.
 * Complete isolation requires separate session/alias, exchange-code, and
 * transaction namespaces: exchange spends its code before this check, and
 * logout's stale-alias path has no live identity to check.
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
   */
  metadata?: Record<string, unknown>;
}

export interface AuthorizationTransactionInput {
  state: string;
  nonce: string;
  pkceVerifier: string;
  codeChallenge: string;
  returnTo?: string;
  createdAt: number;
  expiresAt: number;
  /** See `OidcVaultSession.metadata` for the portable metadata value domain. */
  metadata?: Record<string, unknown>;
}

export type AuthorizationTransaction = AuthorizationTransactionInput;

export interface ExchangeCodeRecordInput {
  code: string;
  sessionId: string;
  returnTo?: string;
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

export class OidcVaultStoreConflictError extends Error {
  constructor(message = 'OIDC vault store operation conflicted with concurrent state changes.') {
    super(message);
    this.name = 'OidcVaultStoreConflictError';
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
  consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null>;
  /** Upsert an exchange code record by `code`. */
  createExchangeCode(input: ExchangeCodeRecordInput): Promise<void>;
  consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null>;
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
  /**
   * Atomically replace an existing session with a distinct unused `nextSession.sessionId`.
   *
   * Providers preserve the existing logical session ID when the next session omits
   * one and retain the old public session ID as an in-flight-request revocation
   * alias. Rotation itself does not revoke the lineage. Providers throw
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
   * before use; provider transport errors retain the original failure in
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
   */
  onBeforeSessionCreate?(context: OidcVaultHookContext): void | Promise<void>;
  onSessionCreated?(context: OidcVaultHookContext): void | Promise<void>;
  onSessionRefreshed?(context: OidcVaultHookContext): void | Promise<void>;
  onBeforeLogout?(context: OidcVaultHookContext): void | Promise<void>;
  onLogout?(context: OidcVaultHookContext): void | Promise<void>;
  onError?(context: OidcVaultErrorContext): void | Promise<void>;
}

export interface IssueTokenInput {
  session: OidcVaultSession;
  req: Request;
  res: Response;
}

/**
 * Local application credentials returned by `OidcVaultTokenIssuer.issue`.
 * Runtime validation copies only these fields into a fresh result; additional
 * properties are ignored and cannot override the response's session ID/user.
 */
export interface OidcVaultTokenIssueResult {
  /** Nonempty opaque token string, returned verbatim without trimming. */
  accessToken: string;
  /** Token lifetime in seconds: a finite, nonnegative safe integer (zero is valid). */
  expiresIn: number;
  /** Optional exact literal `Bearer`; omitted/undefined stays absent in JSON. */
  tokenType?: 'Bearer';
}

/**
 * Trusted application token issuer for exchange and refresh. Return a non-null,
 * non-array object satisfying `OidcVaultTokenIssueResult`; only its declared
 * credential fields enter the response. This contains accidental extensions,
 * not arbitrary behavior of trusted issuers/hooks with session/request/response access.
 */
export interface OidcVaultTokenIssuer {
  /**
   * Invalid results fail inside issuance rollback: revoke the session lineage
   * (including the rotated refresh session), clear a cookie-transport session
   * cookie, and return sanitized HTTP 500 / `OIDC_VAULT_INTERNAL_ERROR`.
   * Field diagnostics are available privately through `hooks.onError`.
   */
  issue(input: IssueTokenInput): Promise<OidcVaultTokenIssueResult>;
}

export interface OidcVaultAccessTokenValidationResult {
  subject: string;
  sessionId?: string;
  scope?: string;
  claims?: Record<string, unknown>;
}

export interface OidcVaultAuthContext extends OidcVaultAccessTokenValidationResult {
  token: string;
}

export interface OidcVaultAccessTokenValidator {
  validate(token: string): Promise<OidcVaultAccessTokenValidationResult>;
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
  /**
   * Pre-`next()` veto hook, not a post-commit notification: when it throws,
   * downstream middleware never runs and `req.auth` is detached before the
   * error response is sent. A valid bearer credential plus a failing hook
   * never surfaces as an invalid-token 401: an `OidcVaultHttpError` from the
   * hook keeps its own status/code/client message (a 401 keeps the `Bearer`
   * challenge, other statuses carry no challenge), while any other hook
   * error becomes a sanitized `500 OIDC_VAULT_AUTH_CONTEXT_FAILED` without
   * leaking the original message. The original error is observable via
   * `onError` for private server-side logs.
   */
  onAuthContext?(input: { req: Request; res: Response; auth: OidcVaultAuthContext }): void | Promise<void>;
  /**
   * Observes the original error for every bearer-middleware failure
   * (extraction, validator, and `onAuthContext` failures) without affecting
   * the sanitized client response. Failures thrown by this observer are
   * swallowed so the original error response is preserved.
   */
  onError?(context: OidcVaultAccessTokenMiddlewareErrorContext): void | Promise<void>;
}

export interface OidcVaultAuthenticatedRequest extends Request {
  auth?: OidcVaultAuthContext;
}

export interface OidcVaultJwtAccessTokenValidatorOptions {
  key: CryptoKey | KeyObject | JWK | Uint8Array;
  issuer?: string;
  audience?: string | string[];
  algorithms?: string[];
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
   * Successful live-session logout commits revocation before upstream work
   * (and clears the session cookie under cookie transport). Known foreign
   * live sessions instead fail with 401. Without a live session, success means
   * stale-alias deletion was attempted; an expired alias may no longer revoke
   * a live lineage. Stateless application access tokens are not invalidated.
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

export type OidcVaultSessionTransport = 'body' | 'cookie';

export type OidcVaultCookieDeploymentMode = 'same-origin' | 'same-site' | 'cross-site';

export type OidcVaultCookieSameSite = 'lax' | 'strict' | 'none';

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
  basePath?: string;
  backendOrigin: string;
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
  sessionTransport?: OidcVaultSessionTransport;
  cookie?: OidcVaultCookieOptions;
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
