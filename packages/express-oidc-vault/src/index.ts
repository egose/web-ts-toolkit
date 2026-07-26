import { createHash, randomBytes } from 'node:crypto';

import express from 'express';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { resolveOidcVaultConfig, type OidcVaultResolvedConfig } from './config';
import type {
  AuthorizationTransaction,
  OidcVaultAccessTokenMiddlewareOptions,
  OidcVaultAuthenticatedRequest,
  OidcVaultAuthContext,
  OidcVaultAccessTokenValidationResult,
  OidcVaultBackchannelLogoutResult,
  OidcVaultExchangeResult,
  OidcVaultHookContext,
  OidcVaultJwtAccessTokenValidatorOptions,
  OidcVaultLogoutResult,
  OidcVaultOptions,
  OidcVaultRouteName,
  OidcVaultSession,
  OidcVaultTokenIssueResult,
  OidcVaultUserProfile,
} from './types';

export * from './config';
export * from './types';

export const DEFAULT_OIDC_VAULT_BASE_PATH = '/auth/oidc';
export const DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_EXCHANGE_CODE_TTL_MS = 30 * 1000;
export const DEFAULT_SESSION_COOKIE_NAME = 'oidc_vault_session';

export const OIDC_VAULT_ROUTE_PATHS: Record<OidcVaultRouteName, string> = {
  login: '/login',
  callback: '/callback',
  exchange: '/exchange',
  refresh: '/refresh',
  logout: '/logout',
  'backchannel-logout': '/backchannel-logout',
};

type OidcProviderMetadata = {
  issuer?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userInfoEndpoint?: string;
  endSessionEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string;
};

type OidcTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
  [key: string]: unknown;
};

type OidcUserInfoResponse = Record<string, unknown>;
type OidcBackchannelLogoutClaims = {
  sid?: string;
  sub?: string;
  nonce?: unknown;
  jti?: unknown;
  events?: Record<string, unknown>;
  [key: string]: unknown;
};

type ResolvedCookieOptions = {
  name: string;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  domain?: string;
  path: string;
  httpOnly: boolean;
};

const discoveryCache = new Map<string, Promise<OidcProviderMetadata>>();

class OidcVaultHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Normalize the mounted base path for the OIDC router.
 */
export function normalizeOidcVaultBasePath(value?: string): string {
  if (!value || value === '/') {
    return DEFAULT_OIDC_VAULT_BASE_PATH;
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const getNow = (options: OidcVaultOptions): number => (options.now ?? Date.now)();

const getSessionTransport = (options: OidcVaultOptions): 'body' | 'cookie' => options.sessionTransport ?? 'body';

const usesCookieTransport = (options: OidcVaultOptions): boolean => getSessionTransport(options) === 'cookie';

const createOpaqueId = (prefix: string): string => `${prefix}_${randomBytes(16).toString('base64url')}`;

const createPkceVerifier = (): string => randomBytes(32).toString('base64url');

const createPkceChallenge = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

const toErrorPayload = (error: unknown): { status: number; code: string; message: string } => {
  if (error instanceof OidcVaultHttpError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  return {
    status: 500,
    code: 'OIDC_VAULT_INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected OIDC vault error.',
  };
};

const getRequestOrigin = (req: Request): string => `${req.protocol}://${req.get('host') ?? 'localhost'}`;

const getCallbackUri = (req: Request, basePath: string): string =>
  `${getRequestOrigin(req)}${basePath}${OIDC_VAULT_ROUTE_PATHS.callback}`;

const getRequiredString = (value: unknown, message: string, code: string, status = 400): string => {
  if (!isString(value)) {
    throw new OidcVaultHttpError(status, code, message);
  }

  return value;
};

const parseCookieHeader = (headerValue: string | undefined): Record<string, string> => {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
};

const resolveCookieOptions = (options: OidcVaultOptions): ResolvedCookieOptions => {
  const cookieOptions = options.cookie ?? {};
  const deploymentMode = cookieOptions.deploymentMode ?? 'same-origin';
  const sameSite = cookieOptions.sameSite ?? (deploymentMode === 'cross-site' ? 'none' : 'lax');
  const secure = cookieOptions.secure ?? (sameSite === 'none' || deploymentMode === 'cross-site');

  return {
    name: cookieOptions.name ?? DEFAULT_SESSION_COOKIE_NAME,
    sameSite,
    secure,
    domain: cookieOptions.domain,
    path: cookieOptions.path ?? '/',
    httpOnly: cookieOptions.httpOnly ?? true,
  };
};

const serializeCookie = (
  name: string,
  value: string,
  options: ResolvedCookieOptions,
  overrides?: { expires?: Date; maxAge?: number },
): string => {
  const sameSite = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path}`, `SameSite=${sameSite}`];

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure || options.sameSite === 'none') {
    parts.push('Secure');
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (typeof overrides?.maxAge === 'number') {
    parts.push(`Max-Age=${overrides.maxAge}`);
  }

  if (overrides?.expires) {
    parts.push(`Expires=${overrides.expires.toUTCString()}`);
  }

  return parts.join('; ');
};

const setSessionCookie = (res: Response, options: OidcVaultOptions, sessionId: string): void => {
  const cookieOptions = resolveCookieOptions(options);
  res.append('Set-Cookie', serializeCookie(cookieOptions.name, sessionId, cookieOptions));
};

const clearSessionCookie = (res: Response, options: OidcVaultOptions): void => {
  const cookieOptions = resolveCookieOptions(options);
  res.append(
    'Set-Cookie',
    serializeCookie(cookieOptions.name, '', cookieOptions, {
      maxAge: 0,
      expires: new Date(0),
    }),
  );
};

const getSessionIdFromCookie = (req: Request, options: OidcVaultOptions): string | undefined => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[resolveCookieOptions(options).name];
};

const getSessionIdFromRequest = (req: Request, options: OidcVaultOptions, action: 'refresh' | 'logout'): string => {
  const body = getBody(req);

  if (usesCookieTransport(options)) {
    const cookieSessionId = getSessionIdFromCookie(req, options);

    if (isString(cookieSessionId)) {
      return cookieSessionId;
    }

    if (isString(body.sessionId)) {
      return body.sessionId;
    }

    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_MISSING_SESSION_ID',
      `${action === 'refresh' ? 'Refresh' : 'Logout'} request is missing the session cookie.`,
    );
  }

  return getRequiredString(
    body.sessionId,
    `${action === 'refresh' ? 'Refresh' : 'Logout'} request is missing sessionId.`,
    'OIDC_VAULT_MISSING_SESSION_ID',
  );
};

const createExchangeResponse = (
  options: OidcVaultOptions,
  session: OidcVaultSession,
  issuedToken: Partial<OidcVaultTokenIssueResult>,
): OidcVaultExchangeResult => ({
  sessionId: usesCookieTransport(options) ? undefined : session.sessionId,
  user: session.user,
  ...issuedToken,
});

const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw new OidcVaultHttpError(401, 'OIDC_VAULT_MISSING_BEARER_TOKEN', 'Missing bearer token.');
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
    throw new OidcVaultHttpError(
      401,
      'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER',
      'Authorization header must use the Bearer scheme.',
    );
  }

  return token;
};

const setBearerChallengeHeader = (res: Response): void => {
  res.setHeader('WWW-Authenticate', 'Bearer');
};

const BACKCHANNEL_LOGOUT_EVENT_CLAIM = 'http://schemas.openid.net/event/backchannel-logout';

const defaultJwtClaimsMapper = (claims: Record<string, unknown>): OidcVaultAccessTokenValidationResult => {
  const subject = getRequiredString(
    claims.sub,
    'JWT access token is missing sub.',
    'OIDC_VAULT_INVALID_ACCESS_TOKEN',
    401,
  );

  return {
    subject,
    sessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
    scope: typeof claims.scope === 'string' ? claims.scope : undefined,
    claims,
  };
};

const buildWellKnownUrl = (issuer: string): URL => {
  const normalizedIssuer = issuer.endsWith('/') ? issuer : `${issuer}/`;
  return new URL('.well-known/openid-configuration', normalizedIssuer);
};

const appendQueryParam = (url: URL, name: string, value: string | undefined): void => {
  if (value) {
    url.searchParams.set(name, value);
  }
};

const buildAuthorizationUrl = (
  metadata: OidcProviderMetadata,
  transaction: AuthorizationTransaction,
  redirectUri: string,
): string => {
  const url = new URL(metadata.authorizationEndpoint);

  appendQueryParam(url, 'response_type', 'code');
  appendQueryParam(url, 'client_id', metadata.clientId);
  appendQueryParam(url, 'redirect_uri', redirectUri);
  appendQueryParam(url, 'scope', metadata.scopes);
  appendQueryParam(url, 'state', transaction.state);
  appendQueryParam(url, 'nonce', transaction.nonce);
  appendQueryParam(url, 'code_challenge', transaction.codeChallenge);
  appendQueryParam(url, 'code_challenge_method', 'S256');

  return url.toString();
};

const buildLogoutUrl = (endSessionEndpoint: string, idTokenHint: string, postLogoutRedirectUri?: string): string => {
  const url = new URL(endSessionEndpoint);

  appendQueryParam(url, 'id_token_hint', idTokenHint);
  appendQueryParam(url, 'post_logout_redirect_uri', postLogoutRedirectUri);

  return url.toString();
};

const toBasicAuthorization = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

const readJsonResponse = async (response: globalThis.Response, errorCode: string): Promise<Record<string, unknown>> => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OidcVaultHttpError(response.status, errorCode, text);
  }
};

const getLogoutTokenFromRequest = (req: Request): string => {
  const body = getBody(req);
  return getRequiredString(
    body.logout_token,
    'Backchannel logout request is missing logout_token.',
    'OIDC_VAULT_MISSING_LOGOUT_TOKEN',
  );
};

const createHookContext = (
  route: OidcVaultRouteName,
  req: Request,
  res: Response,
  session?: OidcVaultSession,
  metadata?: Record<string, unknown>,
): OidcVaultHookContext => ({ route, req, res, session, metadata });

const mergeUserProfile = (
  sub: string,
  idTokenClaims: Record<string, unknown>,
  userInfo?: OidcUserInfoResponse,
): OidcVaultUserProfile => ({
  ...idTokenClaims,
  ...(userInfo ?? {}),
  sub,
});

const resolveReturnTo = (req: Request, options: OidcVaultOptions): string | undefined => {
  const rawReturnTo = req.query.returnTo;

  if (!isString(rawReturnTo)) {
    return undefined;
  }

  const configuredFrontendUri = options.frontendRedirectUri;

  if (!configuredFrontendUri) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_RETURN_TO',
      'Custom returnTo requires a configured frontendRedirectUri.',
    );
  }

  const configuredUrl = new URL(configuredFrontendUri);
  const resolvedUrl = rawReturnTo.startsWith('/') ? new URL(rawReturnTo, configuredUrl) : new URL(rawReturnTo);

  if (resolvedUrl.origin !== configuredUrl.origin) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_RETURN_TO',
      'returnTo must stay on the configured frontend origin.',
    );
  }

  return resolvedUrl.toString();
};

const appendCodeToRedirectUri = (redirectUri: string, code: string): string => {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  return url.toString();
};

const getBody = (req: Request): Record<string, unknown> => (isRecord(req.body) ? req.body : {});

const withIssuedToken = async (
  req: Request,
  res: Response,
  options: OidcVaultOptions,
  session: OidcVaultSession,
): Promise<Partial<OidcVaultTokenIssueResult>> => {
  if (!options.tokenIssuer) {
    return {};
  }

  return options.tokenIssuer.issue({ req, res, session });
};

const resolveFrontendRedirectUri = (transaction: AuthorizationTransaction, options: OidcVaultOptions): string => {
  const redirectUri = transaction.returnTo ?? options.frontendRedirectUri;

  if (!redirectUri) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI',
      'A frontendRedirectUri or login returnTo is required to complete the callback flow.',
    );
  }

  return redirectUri;
};

const shouldFetchUserInfo = (options: OidcVaultOptions, metadata: OidcProviderMetadata): boolean =>
  options.fetchUserInfo !== false && Boolean(metadata.userInfoEndpoint);

async function callHook(
  route: OidcVaultRouteName,
  hook: ((context: OidcVaultHookContext) => void | Promise<void>) | undefined,
  req: Request,
  res: Response,
  session?: OidcVaultSession,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!hook) {
    return;
  }

  await hook(createHookContext(route, req, res, session, metadata));
}

async function handleRouteError(
  route: OidcVaultRouteName,
  req: Request,
  res: Response,
  next: NextFunction,
  options: OidcVaultOptions,
  error: unknown,
): Promise<void> {
  try {
    await options.hooks?.onError?.({
      ...createHookContext(route, req, res),
      error,
    });
  } catch {
    // Prefer surfacing the original route error.
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  const payload = toErrorPayload(error);
  res.status(payload.status).json({
    code: payload.code,
    message: payload.message,
  });
}

function createAsyncHandler(
  route: OidcVaultRouteName,
  options: OidcVaultOptions,
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      await handleRouteError(route, req, res, next, options, error);
    }
  };
}

async function discoverProviderMetadata(config: OidcVaultResolvedConfig): Promise<OidcProviderMetadata> {
  if (config.mode === 'manual') {
    return {
      issuer: config.issuer,
      authorizationEndpoint: config.authorizationEndpoint!,
      tokenEndpoint: config.tokenEndpoint!,
      jwksUri: config.jwksUri!,
      userInfoEndpoint: config.userInfoEndpoint,
      endSessionEndpoint: config.endSessionEndpoint,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes: config.scopes,
    };
  }

  const cacheKey = config.issuer;

  if (!cacheKey) {
    throw new OidcVaultHttpError(500, 'OIDC_VAULT_INVALID_CONFIG', 'Issuer discovery requires an issuer URL.');
  }

  let discoveryPromise = discoveryCache.get(cacheKey);

  if (!discoveryPromise) {
    discoveryPromise = (async () => {
      const discoveryUrl = buildWellKnownUrl(cacheKey);
      const response = await fetch(discoveryUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new OidcVaultHttpError(
          502,
          'OIDC_VAULT_DISCOVERY_FAILED',
          errorText || `OIDC discovery failed with status ${response.status}.`,
        );
      }

      const discovered = (await response.json()) as Record<string, unknown>;
      const authorizationEndpoint = getRequiredString(
        discovered.authorization_endpoint,
        'OIDC discovery response is missing authorization_endpoint.',
        'OIDC_VAULT_DISCOVERY_INVALID',
        502,
      );
      const tokenEndpoint = getRequiredString(
        discovered.token_endpoint,
        'OIDC discovery response is missing token_endpoint.',
        'OIDC_VAULT_DISCOVERY_INVALID',
        502,
      );
      const jwksUri = getRequiredString(
        discovered.jwks_uri,
        'OIDC discovery response is missing jwks_uri.',
        'OIDC_VAULT_DISCOVERY_INVALID',
        502,
      );

      return {
        issuer: getRequiredString(
          discovered.issuer,
          'OIDC discovery response is missing issuer.',
          'OIDC_VAULT_DISCOVERY_INVALID',
          502,
        ),
        authorizationEndpoint,
        tokenEndpoint,
        jwksUri,
        userInfoEndpoint: typeof discovered.userinfo_endpoint === 'string' ? discovered.userinfo_endpoint : undefined,
        endSessionEndpoint:
          typeof discovered.end_session_endpoint === 'string' ? discovered.end_session_endpoint : undefined,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.scopes,
      } satisfies OidcProviderMetadata;
    })();

    discoveryCache.set(cacheKey, discoveryPromise);
  }

  return discoveryPromise;
}

async function requestToken(
  metadata: OidcProviderMetadata,
  params: Record<string, string | undefined>,
): Promise<OidcTokenResponse> {
  const clientId = metadata.clientId;

  if (!clientId) {
    throw new OidcVaultHttpError(500, 'OIDC_VAULT_MISSING_CLIENT_ID', 'OIDC clientId is required.');
  }

  const body = new URLSearchParams();

  body.set('client_id', clientId);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      body.set(key, value);
    }
  }

  const headers: HeadersInit = {
    'content-type': 'application/x-www-form-urlencoded',
  };

  if (metadata.clientSecret) {
    headers.authorization = toBasicAuthorization(clientId, metadata.clientSecret);
  }

  const response = await fetch(metadata.tokenEndpoint, {
    method: 'POST',
    headers,
    body,
  });

  const json = await readJsonResponse(response, 'OIDC_VAULT_TOKEN_REQUEST_FAILED');

  if (!response.ok) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      typeof json.error_description === 'string'
        ? json.error_description
        : `OIDC token request failed with status ${response.status}.`,
    );
  }

  return json as OidcTokenResponse;
}

async function fetchUserInfo(metadata: OidcProviderMetadata, accessToken: string): Promise<OidcUserInfoResponse> {
  if (!metadata.userInfoEndpoint) {
    return {};
  }

  const response = await fetch(metadata.userInfoEndpoint, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await readJsonResponse(response, 'OIDC_VAULT_USERINFO_FAILED');

  if (!response.ok) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_USERINFO_FAILED',
      `OIDC userinfo request failed with status ${response.status}.`,
    );
  }

  return json;
}

async function verifyIdToken(
  metadata: OidcProviderMetadata,
  idToken: string,
  nonce?: string,
): Promise<Record<string, unknown>> {
  if (!metadata.jwksUri) {
    throw new OidcVaultHttpError(500, 'OIDC_VAULT_MISSING_JWKS_URI', 'OIDC jwksUri is required to validate id_token.');
  }

  if (!metadata.clientId) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_CLIENT_ID',
      'OIDC clientId is required to validate id_token.',
    );
  }

  const jwks = createRemoteJWKSet(new URL(metadata.jwksUri));
  const result = await jwtVerify(idToken, jwks, {
    audience: metadata.clientId,
    issuer: metadata.issuer,
  });

  if (nonce && result.payload.nonce !== nonce) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC id_token nonce validation failed.');
  }

  return result.payload as Record<string, unknown>;
}

async function verifyBackchannelLogoutToken(
  metadata: OidcProviderMetadata,
  logoutToken: string,
): Promise<OidcBackchannelLogoutClaims> {
  if (!metadata.jwksUri) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_JWKS_URI',
      'OIDC jwksUri is required to validate logout_token.',
    );
  }

  if (!metadata.clientId) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_CLIENT_ID',
      'OIDC clientId is required to validate logout_token.',
    );
  }

  const jwks = createRemoteJWKSet(new URL(metadata.jwksUri));
  const result = await jwtVerify(logoutToken, jwks, {
    audience: metadata.clientId,
    issuer: metadata.issuer,
  });
  const claims = result.payload as OidcBackchannelLogoutClaims;

  if (claims.nonce !== undefined) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token must not contain nonce.',
    );
  }

  if (!isRecord(claims.events) || !(BACKCHANNEL_LOGOUT_EVENT_CLAIM in claims.events)) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token is missing the required event claim.',
    );
  }

  if (!isString(claims.sid) && !isString(claims.sub)) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token must include sid or sub.',
    );
  }

  if (!isString(claims.jti)) {
    throw new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_LOGOUT_TOKEN', 'Backchannel logout token must include jti.');
  }

  return claims;
}

async function resolveProviderMetadata(options: OidcVaultOptions): Promise<OidcProviderMetadata> {
  return discoverProviderMetadata(resolveOidcVaultConfig(options.config));
}

const createLoginHandler = (options: OidcVaultOptions, basePath: string): RequestHandler =>
  createAsyncHandler('login', options, async (req, res) => {
    const metadata = await resolveProviderMetadata(options);
    await callHook('login', options.hooks?.onLoginStart, req, res, undefined, { provider: metadata });

    const now = getNow(options);
    const pkceVerifier = createPkceVerifier();
    const transaction: AuthorizationTransaction = {
      state: createOpaqueId('state'),
      nonce: createOpaqueId('nonce'),
      pkceVerifier,
      codeChallenge: createPkceChallenge(pkceVerifier),
      returnTo: resolveReturnTo(req, options),
      createdAt: now,
      expiresAt: now + (options.authorizationTransactionTtlMs ?? DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS),
    };

    await options.storeProvider.createAuthorizationTransaction(transaction);

    const authorizationUrl = buildAuthorizationUrl(metadata, transaction, getCallbackUri(req, basePath));

    await callHook('login', options.hooks?.onAuthorizationUrl, req, res, undefined, {
      authorizationUrl,
      state: transaction.state,
    });

    res.redirect(302, authorizationUrl);
  });

const createCallbackHandler = (options: OidcVaultOptions, basePath: string): RequestHandler =>
  createAsyncHandler('callback', options, async (req, res) => {
    if (isString(req.query.error)) {
      throw new OidcVaultHttpError(400, 'OIDC_VAULT_CALLBACK_ERROR', req.query.error);
    }

    const code = getRequiredString(
      req.query.code,
      'OIDC callback is missing the authorization code.',
      'OIDC_VAULT_MISSING_CODE',
    );
    const state = getRequiredString(req.query.state, 'OIDC callback is missing state.', 'OIDC_VAULT_MISSING_STATE');
    const transaction = await options.storeProvider.consumeAuthorizationTransaction(state);

    if (!transaction) {
      throw new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_STATE', 'OIDC state is invalid or expired.');
    }

    const metadata = await resolveProviderMetadata(options);
    const tokenResponse = await requestToken(metadata, {
      grant_type: 'authorization_code',
      code,
      code_verifier: transaction.pkceVerifier,
      redirect_uri: getCallbackUri(req, basePath),
    });

    if (!isString(tokenResponse.id_token)) {
      throw new OidcVaultHttpError(502, 'OIDC_VAULT_MISSING_ID_TOKEN', 'OIDC token response is missing id_token.');
    }

    if (!isString(tokenResponse.refresh_token)) {
      throw new OidcVaultHttpError(
        502,
        'OIDC_VAULT_MISSING_REFRESH_TOKEN',
        'OIDC token response is missing refresh_token.',
      );
    }

    await callHook('callback', options.hooks?.onCallbackTokens, req, res, undefined, {
      hasAccessToken: Boolean(tokenResponse.access_token),
      hasRefreshToken: true,
      hasIdToken: true,
    });

    const claims = await verifyIdToken(metadata, tokenResponse.id_token, transaction.nonce);
    const subject = getRequiredString(claims.sub, 'OIDC id_token is missing sub.', 'OIDC_VAULT_INVALID_ID_TOKEN', 502);
    const userInfo =
      shouldFetchUserInfo(options, metadata) && isString(tokenResponse.access_token)
        ? await fetchUserInfo(metadata, tokenResponse.access_token)
        : undefined;

    if (userInfo) {
      await callHook('callback', options.hooks?.onUserInfo, req, res, undefined, { subject });
    }

    const now = getNow(options);
    const sessionId = createOpaqueId('sess');
    const session = {
      sessionId,
      subject,
      providerSessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
      provider: {
        issuer: metadata.issuer ?? (typeof claims.iss === 'string' ? claims.iss : undefined),
        clientId: metadata.clientId,
      },
      refreshToken: tokenResponse.refresh_token,
      idToken: tokenResponse.id_token,
      accessToken: isString(tokenResponse.access_token) ? tokenResponse.access_token : undefined,
      scope: typeof tokenResponse.scope === 'string' ? tokenResponse.scope : metadata.scopes,
      expiresAt: typeof tokenResponse.expires_in === 'number' ? now + tokenResponse.expires_in * 1000 : undefined,
      createdAt: now,
      updatedAt: now,
      user: mergeUserProfile(subject, claims, userInfo),
      metadata: {
        tokenType: tokenResponse.token_type,
      },
    } satisfies OidcVaultSession;

    await callHook('callback', options.hooks?.onBeforeSessionCreate, req, res, session, { subject });
    const createdSession = await options.storeProvider.createSession(session);
    await callHook('callback', options.hooks?.onSessionCreated, req, res, createdSession, { subject });

    const exchangeCode = createOpaqueId('code');

    await options.storeProvider.createExchangeCode({
      code: exchangeCode,
      sessionId: createdSession.sessionId,
      returnTo: transaction.returnTo,
      createdAt: now,
      expiresAt: now + (options.exchangeCodeTtlMs ?? DEFAULT_EXCHANGE_CODE_TTL_MS),
    });

    res.redirect(302, appendCodeToRedirectUri(resolveFrontendRedirectUri(transaction, options), exchangeCode));
  });

const createExchangeHandler = (options: OidcVaultOptions): RequestHandler =>
  createAsyncHandler('exchange', options, async (req, res) => {
    const body = getBody(req);
    const code = getRequiredString(body.code, 'Exchange request is missing code.', 'OIDC_VAULT_MISSING_EXCHANGE_CODE');
    const exchangeRecord = await options.storeProvider.consumeExchangeCode(code);

    if (!exchangeRecord) {
      throw new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_EXCHANGE_CODE', 'Exchange code is invalid or expired.');
    }

    const session = await options.storeProvider.getSession(exchangeRecord.sessionId);

    if (!session) {
      throw new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.');
    }

    const issuedToken = await withIssuedToken(req, res, options, session);

    if (usesCookieTransport(options)) {
      setSessionCookie(res, options, session.sessionId);
    }

    const response = createExchangeResponse(options, session, issuedToken);

    res.status(200).json(response);
  });

const createRefreshHandler = (options: OidcVaultOptions): RequestHandler =>
  createAsyncHandler('refresh', options, async (req, res) => {
    const sessionId = getSessionIdFromRequest(req, options, 'refresh');
    const currentSession = await options.storeProvider.getSession(sessionId);

    if (!currentSession) {
      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      throw new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.');
    }

    const metadata = await resolveProviderMetadata(options);
    const tokenResponse = await requestToken(metadata, {
      grant_type: 'refresh_token',
      refresh_token: currentSession.refreshToken,
    });

    const idToken = isString(tokenResponse.id_token) ? tokenResponse.id_token : currentSession.idToken;
    const claims = await verifyIdToken(metadata, idToken);
    const subject = getRequiredString(claims.sub, 'OIDC id_token is missing sub.', 'OIDC_VAULT_INVALID_ID_TOKEN', 502);
    const userInfo =
      shouldFetchUserInfo(options, metadata) && isString(tokenResponse.access_token)
        ? await fetchUserInfo(metadata, tokenResponse.access_token)
        : undefined;

    const now = getNow(options);
    const nextSession: OidcVaultSession = {
      ...currentSession,
      sessionId: createOpaqueId('sess'),
      subject,
      providerSessionId: typeof claims.sid === 'string' ? claims.sid : currentSession.providerSessionId,
      refreshToken: isString(tokenResponse.refresh_token) ? tokenResponse.refresh_token : currentSession.refreshToken,
      idToken,
      accessToken: isString(tokenResponse.access_token) ? tokenResponse.access_token : currentSession.accessToken,
      scope: typeof tokenResponse.scope === 'string' ? tokenResponse.scope : currentSession.scope,
      expiresAt:
        typeof tokenResponse.expires_in === 'number' ? now + tokenResponse.expires_in * 1000 : currentSession.expiresAt,
      updatedAt: now,
      user: mergeUserProfile(subject, claims, userInfo ?? currentSession.user),
    };

    const rotatedSession = await options.storeProvider.rotateSession({
      sessionId: currentSession.sessionId,
      nextSession,
    });

    await callHook('refresh', options.hooks?.onSessionRefreshed, req, res, rotatedSession, {
      previousSessionId: currentSession.sessionId,
    });

    const issuedToken = await withIssuedToken(req, res, options, rotatedSession);

    if (usesCookieTransport(options)) {
      setSessionCookie(res, options, rotatedSession.sessionId);
    }

    const response = createExchangeResponse(options, rotatedSession, issuedToken);

    res.status(200).json(response);
  });

const createLogoutHandler = (options: OidcVaultOptions): RequestHandler =>
  createAsyncHandler('logout', options, async (req, res) => {
    const body = getBody(req);
    const sessionId = getSessionIdFromRequest(req, options, 'logout');
    const redirect = body.redirect === true;
    const session = await options.storeProvider.getSession(sessionId);

    if (!session) {
      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      res.status(200).json({ loggedOut: true } satisfies OidcVaultLogoutResult);
      return;
    }

    await callHook('logout', options.hooks?.onBeforeLogout, req, res, session, undefined);
    await options.storeProvider.deleteSession(sessionId);

    if (usesCookieTransport(options)) {
      clearSessionCookie(res, options);
    }

    const metadata = await resolveProviderMetadata(options);
    const upstreamLogoutUrl = metadata.endSessionEndpoint
      ? buildLogoutUrl(metadata.endSessionEndpoint, session.idToken, options.postLogoutRedirectUri)
      : undefined;

    await callHook('logout', options.hooks?.onLogout, req, res, session, { upstreamLogoutUrl });

    if (redirect && upstreamLogoutUrl) {
      res.redirect(302, upstreamLogoutUrl);
      return;
    }

    res.status(200).json({
      loggedOut: true,
      upstreamLogoutUrl,
    } satisfies OidcVaultLogoutResult);
  });

const createBackchannelLogoutHandler = (options: OidcVaultOptions): RequestHandler =>
  createAsyncHandler('backchannel-logout', options, async (req, res) => {
    const metadata = await resolveProviderMetadata(options);
    const logoutToken = getLogoutTokenFromRequest(req);
    const claims = await verifyBackchannelLogoutToken(metadata, logoutToken);

    const revokedSessions = isString(claims.sid)
      ? await options.storeProvider.deleteSessionsByProviderSessionId(claims.sid)
      : await options.storeProvider.deleteSessionsBySubject(String(claims.sub));

    await callHook('backchannel-logout', options.hooks?.onLogout, req, res, undefined, {
      providerSessionId: claims.sid,
      subject: claims.sub,
      revokedSessions,
    });

    res.status(200).json({
      loggedOut: true,
      revokedSessions,
    } satisfies OidcVaultBackchannelLogoutResult);
  });

function registerRoutes(router: Router, options: OidcVaultOptions, basePath: string): void {
  router.get(OIDC_VAULT_ROUTE_PATHS.login, createLoginHandler(options, basePath));
  router.get(OIDC_VAULT_ROUTE_PATHS.callback, createCallbackHandler(options, basePath));
  router.post(OIDC_VAULT_ROUTE_PATHS.exchange, createExchangeHandler(options));
  router.post(OIDC_VAULT_ROUTE_PATHS.refresh, createRefreshHandler(options));
  router.post(OIDC_VAULT_ROUTE_PATHS.logout, createLogoutHandler(options));
  router.post(OIDC_VAULT_ROUTE_PATHS['backchannel-logout'], createBackchannelLogoutHandler(options));
}

/**
 * Create a JWT-based access-token validator for use with
 * `createOidcVaultAccessTokenMiddleware(...)`.
 */
export function createOidcVaultJwtAccessTokenValidator(options: OidcVaultJwtAccessTokenValidatorOptions): {
  validate(token: string): Promise<OidcVaultAccessTokenValidationResult>;
} {
  return {
    async validate(token: string): Promise<OidcVaultAccessTokenValidationResult> {
      const result = await jwtVerify(token, options.key, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: options.algorithms,
      });

      const claims = result.payload as Record<string, unknown>;
      return options.mapClaims ? options.mapClaims(claims) : defaultJwtClaimsMapper(claims);
    },
  };
}

/**
 * Create bearer-token validation middleware for app-issued access tokens.
 */
export function createOidcVaultAccessTokenMiddleware(options: OidcVaultAccessTokenMiddlewareOptions): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = extractBearerToken(req.get('authorization'));
      const validationResult = await options.validator.validate(token);

      const auth: OidcVaultAuthContext = {
        token,
        ...validationResult,
      };

      req.auth = auth;
      await options.onAuthContext?.({ req, res, auth });
      next();
    } catch (error) {
      if (error instanceof OidcVaultHttpError) {
        setBearerChallengeHeader(res);
        res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
        return;
      }

      if (error instanceof Error) {
        setBearerChallengeHeader(res);
        res.status(401).json({
          code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
          message: error.message || 'Access token validation failed.',
        });
        return;
      }

      setBearerChallengeHeader(res);
      res.status(401).json({
        code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
        message: 'Access token validation failed.',
      });
    }
  };
}

/**
 * Create the core OIDC vault middleware.
 */
export function createOidcVaultMiddleware(options: OidcVaultOptions): Router {
  const rootRouter = express.Router();
  const baseRouter = express.Router();
  const basePath = normalizeOidcVaultBasePath(options.basePath);

  baseRouter.use(express.json());
  baseRouter.use(express.urlencoded({ extended: false }));
  registerRoutes(baseRouter, options, basePath);
  rootRouter.use(basePath, baseRouter);

  return rootRouter;
}
