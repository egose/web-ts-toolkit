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
   * owns session lifetime through another policy.
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
   * alias on memory/Redis, while MongoDB retains the stale alias row until its
   * lineage is deleted (FU-SVH-05b).
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
   * one, retain the old public session ID as a finite in-flight-request
   * revocation alias (not whole-lineage revocation), and throw
   * `OidcVaultStoreConflictError` without changing source or target data when
   * the source is missing, the target already exists, or the target ID equals
   * the source ID.
   *
   * Each alias expires with its immediate successor session's `expiresAt` and is
   * not extended by later rotations, so an earlier alias can stop working while
   * the lineage is still live. A rotation that assigns an explicitly different
   * logical session ID moves the alias to the new lineage; earlier aliases keep
   * the old lineage. Sessions without `expiresAt` have provider-specific
   * retention: memory and Redis aliases persist until lineage termination, while
   * MongoDB applies its finite `rotatedSessionAliasRetentionMs` fallback
   * (default 5 minutes). Generic callers must treat an expired alias as a hint,
   * not a revocation channel; core refresh rotates the live session directly and
   * preserves `expiresAt`, so it does not depend on alias lifetime (SVH-05).
   */
  rotateSession(input: RotateSessionInput): Promise<OidcVaultSession>;
  deleteSession(sessionId: string): Promise<void>;
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
  deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number>;
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
  error: unknown;
}

export interface OidcVaultHooks {
  onLoginStart?(context: OidcVaultHookContext): void | Promise<void>;
  onAuthorizationUrl?(context: OidcVaultHookContext): void | Promise<void>;
  onCallbackTokens?(context: OidcVaultHookContext): void | Promise<void>;
  onUserInfo?(context: OidcVaultHookContext): void | Promise<void>;
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

export interface OidcVaultTokenIssueResult {
  accessToken: string;
  expiresIn: number;
  tokenType?: 'Bearer';
}

export interface OidcVaultTokenIssuer {
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
   * providers. Required in both discovery mode (issuer only) and manual mode
   * (issuer plus endpoints); when any manual endpoint is configured, manual
   * endpoints are used and discovery is not performed. Discovery responses
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
   * Local logout always commits before any upstream work: `loggedOut: true`
   * means the local session lineage is revoked (and the session cookie is
   * cleared under cookie transport). Local-only logout (`redirect` unset or
   * `false`) never contacts the provider. Redirected logout (`redirect: true`)
   * treats the upstream end-session redirect as best-effort: when provider
   * discovery fails or no `endSessionEndpoint` is available, the route still
   * returns this local success and reports the upstream failure via `onError`
   * instead of undoing the revocation or skipping `onLogout`.
   */
  loggedOut: true;
}

export interface OidcVaultBackchannelLogoutResult {
  loggedOut: true;
  revokedSessions: number;
}

export interface OidcVaultExchangeResult extends Partial<OidcVaultTokenIssueResult> {
  sessionId?: string;
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
   * metadata/endpoint failures as best-effort (local `200 { loggedOut: true }`
   * plus `onError`, with `onLogout` still delivered).
   */
  postLogoutRedirectUri?: string;
  fetchUserInfo?: boolean;
  authorizationTransactionTtlMs?: number;
  exchangeCodeTtlMs?: number;
  sessionTransport?: OidcVaultSessionTransport;
  cookie?: OidcVaultCookieOptions;
  trustedOrigins?: string[];
  requestBodyLimit?: string | number;
  /**
   * Overall deadline in milliseconds for a single upstream provider HTTP
   * exchange, covering DNS/connect/TLS, response headers, and complete
   * success/error body consumption plus stream cleanup.
   *
   * Successful discovery metadata is shared across timeout policies, but an
   * in-flight discovery fetch honors each joining caller's own deadline
   * without aborting the shared fetch. Remote JWKS resolvers are isolated by
   * `(jwks_uri, providerRequestTimeoutMs)` because JOSE fixes the fetch
   * timeout at resolver creation; the package JWKS transport additionally
   * bounds JWKS bodies (1 MiB, 100 keys) that JOSE leaves unbounded.
   */
  providerRequestTimeoutMs?: number;
  now?: () => number;
}
