import type { KeyObject } from 'node:crypto';

import type { Request, Response } from 'express';
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
  subject: string;
  providerSessionId?: string;
  provider?: OidcVaultProviderMetadata;
  refreshToken: string;
  idToken: string;
  accessToken?: string;
  scope?: string;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
  user?: OidcVaultUserProfile;
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
  metadata?: Record<string, unknown>;
}

export interface AuthorizationTransaction extends AuthorizationTransactionInput {}

export interface ExchangeCodeRecordInput {
  code: string;
  sessionId: string;
  returnTo?: string;
  createdAt: number;
  expiresAt: number;
}

export interface ExchangeCodeRecord extends ExchangeCodeRecordInput {}

export interface OidcVaultSessionInput extends Omit<OidcVaultSession, 'createdAt' | 'updatedAt'> {
  createdAt?: number;
  updatedAt?: number;
}

export interface RotateSessionInput {
  sessionId: string;
  nextSession: OidcVaultSession;
}

export interface OidcVaultStoreProvider {
  createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void>;
  consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null>;
  createExchangeCode(input: ExchangeCodeRecordInput): Promise<void>;
  consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null>;
  createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession>;
  getSession(sessionId: string): Promise<OidcVaultSession | null>;
  rotateSession(input: RotateSessionInput): Promise<OidcVaultSession>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSessionsBySubject(subject: string): Promise<number>;
  deleteSessionsByProviderSessionId(providerSessionId: string): Promise<number>;
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

declare global {
  namespace Express {
    interface Request {
      auth?: OidcVaultAuthContext;
    }
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
  upstreamLogoutUrl?: string;
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
  now?: () => number;
}
