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
  /** Upsert a session by `sessionId`, defaulting timestamps and logical lineage when omitted. */
  createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession>;
  getSession(sessionId: string): Promise<OidcVaultSession | null>;
  /**
   * Atomically replace an existing session with a distinct unused `nextSession.sessionId`.
   *
   * Providers preserve the existing logical session ID when the next session omits
   * one, retain the old public session ID as a revocation alias while the lineage
   * remains live, and throw `OidcVaultStoreConflictError` without changing source
   * or target data when the source is missing, the target already exists, or the
   * target ID equals the source ID.
   */
  rotateSession(input: RotateSessionInput): Promise<OidcVaultSession>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSessionsByLogicalSessionId(input: string | DeleteSessionsByLogicalSessionIdInput): Promise<number>;
  /**
   * Record a backchannel logout JTI once until its finite future expiry.
   *
   * Returns `false` for duplicate, expired, exact-boundary, `NaN`, or infinite
   * expiries. A JTI rejected for invalid or already-expired expiry is not stored.
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

export interface OidcVaultAccessTokenMiddlewareOptions {
  validator: OidcVaultAccessTokenValidator;
  onAuthContext?(input: { req: Request; res: Response; auth: OidcVaultAuthContext }): void | Promise<void>;
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
  name?: string;
  deploymentMode?: OidcVaultCookieDeploymentMode;
  sameSite?: OidcVaultCookieSameSite;
  secure?: boolean;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
}

export interface OidcVaultOptions {
  basePath?: string;
  backendOrigin: string;
  storeProvider: OidcVaultStoreProvider;
  config?: OidcVaultConfig;
  hooks?: OidcVaultHooks;
  tokenIssuer?: OidcVaultTokenIssuer;
  frontendRedirectUri?: string;
  postLogoutRedirectUri?: string;
  fetchUserInfo?: boolean;
  authorizationTransactionTtlMs?: number;
  exchangeCodeTtlMs?: number;
  sessionTransport?: OidcVaultSessionTransport;
  cookie?: OidcVaultCookieOptions;
  trustedOrigins?: string[];
  requestBodyLimit?: string | number;
  providerRequestTimeoutMs?: number;
  now?: () => number;
}
