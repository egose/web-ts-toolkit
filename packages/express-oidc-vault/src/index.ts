import { createHash, randomBytes } from 'node:crypto';

import express from 'express';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';

import { resolveOidcVaultConfig, type OidcVaultResolvedConfig } from './config';
import {
  DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS,
  DEFAULT_EXCHANGE_CODE_TTL_MS,
  DEFAULT_OIDC_VAULT_BASE_PATH,
  DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT,
  OIDC_VAULT_ROUTE_PATHS,
  OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT,
} from './constants';
import {
  clearSessionCookie,
  getSessionIdFromCookie,
  setSessionCookie,
  validateCookieOptions,
  usesCookieTransport,
  usesCrossSiteCookieTransport,
} from './cookies';
import {
  OidcVaultHttpError,
  getRequiredString,
  isBodyParserError,
  toBodyParserErrorPayload,
  toErrorPayload,
} from './errors';
import {
  assertTrustedOrigin,
  resolveBackendOrigin,
  resolveFrontendRedirectUri as normalizeFrontendRedirectUri,
  resolveTrustedOrigins,
  validatePostLogoutRedirectUri,
} from './origins';
import type { TrustedOrigins } from './origins';
import type { OidcProviderMetadata } from './provider-client';
import { fetchUserInfo, requestToken, resolveProviderMetadata, validateTokenResponse } from './provider-client';
import {
  assertUserInfoSubject,
  mergeUserProfile,
  verifyBackchannelLogoutToken,
  verifyIdToken,
} from './token-validation';
import { OidcVaultStoreConflictError } from './types';
import type {
  AuthorizationTransaction,
  OidcVaultBackchannelLogoutResult,
  OidcVaultExchangeResult,
  OidcVaultHookContext,
  OidcVaultLogoutResult,
  OidcVaultOptions,
  OidcVaultRouteName,
  OidcVaultSession,
  OidcVaultTokenIssueResult,
} from './types';
import { getBody, isString } from './utils';

export * from './config';
export * from './types';

export {
  DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS,
  DEFAULT_EXCHANGE_CODE_TTL_MS,
  DEFAULT_OIDC_VAULT_BASE_PATH,
  DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT,
  OIDC_VAULT_ROUTE_PATHS,
  OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT,
} from './constants';
export { createOidcVaultAccessTokenMiddleware } from './access-token-middleware';
export { createOidcVaultJwtAccessTokenValidator } from './token-validation';

/**
 * Normalize the mounted base path for the OIDC router.
 */
export function normalizeOidcVaultBasePath(value?: string): string {
  if (!value || value === '/') {
    return DEFAULT_OIDC_VAULT_BASE_PATH;
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

const getNow = (options: OidcVaultOptions): number => (options.now ?? Date.now)();

const createOpaqueId = (prefix: string): string => `${prefix}_${randomBytes(16).toString('base64url')}`;

const createPkceVerifier = (): string => randomBytes(32).toString('base64url');

const createPkceChallenge = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

const getCallbackUri = (backendOrigin: string, basePath: string): string =>
  `${backendOrigin}${basePath}${OIDC_VAULT_ROUTE_PATHS.callback}`;

const validateOidcVaultOptions = (
  options: OidcVaultOptions,
): { backendOrigin: string; config: OidcVaultResolvedConfig; trustedOrigins: TrustedOrigins } => {
  const backendOrigin = resolveBackendOrigin(options);
  const frontendRedirectUri = normalizeFrontendRedirectUri(options);
  validatePostLogoutRedirectUri(options);
  validateCookieOptions(options);
  const config = resolveOidcVaultConfig(options.config);
  const configuredTrustedOrigins = resolveTrustedOrigins(options);

  if (usesCrossSiteCookieTransport(options) && configuredTrustedOrigins.size === 0) {
    throw new Error('trustedOrigins is required when using cross-site cookie transport.');
  }

  const trustedOrigins = new Set(configuredTrustedOrigins);
  trustedOrigins.add(backendOrigin);

  if (frontendRedirectUri) {
    options.frontendRedirectUri = frontendRedirectUri;
  }

  return { backendOrigin, config, trustedOrigins };
};

const isStoreConflictError = (error: unknown): error is OidcVaultStoreConflictError =>
  error instanceof OidcVaultStoreConflictError ||
  (typeof error === 'object' && error !== null && 'name' in error && error.name === 'OidcVaultStoreConflictError');

const getSessionIdFromRequest = (req: Request, options: OidcVaultOptions, action: 'refresh' | 'logout'): string => {
  if (usesCookieTransport(options)) {
    const cookieSessionId = getSessionIdFromCookie(req, options);

    if (isString(cookieSessionId)) {
      return cookieSessionId;
    }

    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_MISSING_SESSION_ID',
      `${action === 'refresh' ? 'Refresh' : 'Logout'} request is missing the session cookie.`,
    );
  }

  const body = getBody(req);

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
  let resolvedUrl: URL;

  try {
    resolvedUrl = rawReturnTo.startsWith('/') ? new URL(rawReturnTo, configuredUrl) : new URL(rawReturnTo);
  } catch {
    throw new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_RETURN_TO', 'returnTo must be a valid URL.');
  }

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

async function callPostCommitHook(
  route: OidcVaultRouteName,
  options: OidcVaultOptions,
  hook: ((context: OidcVaultHookContext) => void | Promise<void>) | undefined,
  req: Request,
  res: Response,
  session?: OidcVaultSession,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!hook) {
    return;
  }

  try {
    await hook(createHookContext(route, req, res, session, metadata));
  } catch (error) {
    try {
      await options.hooks?.onError?.({
        ...createHookContext(route, req, res, session, metadata),
        error,
      });
    } catch {
      // Post-commit notification failures must not override the completed state change.
    }
  }
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

function createBodyParserErrorHandler(): express.ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (!isBodyParserError(error)) {
      next(error);
      return;
    }

    const payload = toBodyParserErrorPayload(error);
    res.status(payload.status).json({
      code: payload.code,
      message: payload.message,
    });
  };
}

const createLoginHandler = (
  options: OidcVaultOptions,
  config: OidcVaultResolvedConfig,
  backendOrigin: string,
  basePath: string,
): RequestHandler =>
  createAsyncHandler('login', options, async (req, res) => {
    const metadata = await resolveProviderMetadata(config, options);
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

    const authorizationUrl = buildAuthorizationUrl(metadata, transaction, getCallbackUri(backendOrigin, basePath));

    await callHook('login', options.hooks?.onAuthorizationUrl, req, res, undefined, {
      authorizationUrl,
      state: transaction.state,
    });

    res.redirect(302, authorizationUrl);
  });

const createCallbackHandler = (
  options: OidcVaultOptions,
  config: OidcVaultResolvedConfig,
  backendOrigin: string,
  basePath: string,
): RequestHandler =>
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

    const metadata = await resolveProviderMetadata(config, options);
    const tokenResponse = await requestToken(
      metadata,
      {
        grant_type: 'authorization_code',
        code,
        code_verifier: transaction.pkceVerifier,
        redirect_uri: getCallbackUri(backendOrigin, basePath),
      },
      options,
    );
    validateTokenResponse(tokenResponse);

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

    const claims = await verifyIdToken(metadata, tokenResponse.id_token, transaction.nonce, options);
    const subject = getRequiredString(claims.sub, 'OIDC id_token is missing sub.', 'OIDC_VAULT_INVALID_ID_TOKEN', 502);
    const userInfo =
      shouldFetchUserInfo(options, metadata) && isString(tokenResponse.access_token)
        ? await fetchUserInfo(metadata, tokenResponse.access_token, options)
        : undefined;

    if (userInfo) {
      assertUserInfoSubject(userInfo, subject);
    }

    if (userInfo) {
      await callHook('callback', options.hooks?.onUserInfo, req, res, undefined, { subject });
    }

    const now = getNow(options);
    const sessionId = createOpaqueId('sess');
    const session = {
      sessionId,
      logicalSessionId: sessionId,
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
      createdAt: now,
      updatedAt: now,
      user: mergeUserProfile(subject, claims, userInfo),
      metadata: {
        tokenType: tokenResponse.token_type,
      },
    } satisfies OidcVaultSession;

    await callHook('callback', options.hooks?.onBeforeSessionCreate, req, res, session, { subject });
    const createdSession = await options.storeProvider.createSession(session);

    const exchangeCode = createOpaqueId('code');

    try {
      await options.storeProvider.createExchangeCode({
        code: exchangeCode,
        sessionId: createdSession.sessionId,
        returnTo: transaction.returnTo,
        createdAt: now,
        expiresAt: now + (options.exchangeCodeTtlMs ?? DEFAULT_EXCHANGE_CODE_TTL_MS),
      });
    } catch (error) {
      await options.storeProvider.deleteSessionsByLogicalSessionId({
        logicalSessionId: createdSession.logicalSessionId ?? createdSession.sessionId,
      });

      throw error;
    }

    await callPostCommitHook('callback', options, options.hooks?.onSessionCreated, req, res, createdSession, {
      subject,
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

    let issuedToken: Partial<OidcVaultTokenIssueResult>;

    try {
      issuedToken = await withIssuedToken(req, res, options, session);
    } catch (error) {
      await options.storeProvider.deleteSessionsByLogicalSessionId({
        logicalSessionId: session.logicalSessionId ?? session.sessionId,
      });

      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      throw error;
    }

    if (usesCookieTransport(options)) {
      setSessionCookie(res, options, session.sessionId);
    }

    const response = createExchangeResponse(options, session, issuedToken);

    res.status(200).json(response);
  });

const createRefreshHandler = (
  options: OidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
): RequestHandler =>
  createAsyncHandler('refresh', options, async (req, res) => {
    assertTrustedOrigin(req, options, trustedOrigins, 'refresh');
    const sessionId = getSessionIdFromRequest(req, options, 'refresh');
    const currentSession = await options.storeProvider.getSession(sessionId);

    if (!currentSession) {
      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      throw new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.');
    }

    const metadata = await resolveProviderMetadata(config, options);
    const tokenResponse = await requestToken(
      metadata,
      {
        grant_type: 'refresh_token',
        refresh_token: currentSession.refreshToken,
      },
      options,
    );
    validateTokenResponse(tokenResponse);

    const newIdToken = isString(tokenResponse.id_token) ? tokenResponse.id_token : undefined;
    const idToken = newIdToken ?? currentSession.idToken;
    const claims = newIdToken
      ? await verifyIdToken(metadata, newIdToken, undefined, options)
      : (currentSession.user ?? { sub: currentSession.subject });
    const subject = newIdToken
      ? getRequiredString(claims.sub, 'OIDC id_token is missing sub.', 'OIDC_VAULT_INVALID_ID_TOKEN', 502)
      : currentSession.subject;

    if (newIdToken && subject !== currentSession.subject) {
      throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC refreshed id_token sub changed.');
    }

    const userInfo =
      shouldFetchUserInfo(options, metadata) && isString(tokenResponse.access_token)
        ? await fetchUserInfo(metadata, tokenResponse.access_token, options)
        : undefined;

    if (userInfo) {
      assertUserInfoSubject(userInfo, subject);
    }

    const now = getNow(options);
    const logicalSessionId = currentSession.logicalSessionId ?? currentSession.sessionId;
    const nextSession: OidcVaultSession = {
      ...currentSession,
      sessionId: createOpaqueId('sess'),
      logicalSessionId,
      subject,
      providerSessionId: typeof claims.sid === 'string' ? claims.sid : currentSession.providerSessionId,
      refreshToken: isString(tokenResponse.refresh_token) ? tokenResponse.refresh_token : currentSession.refreshToken,
      idToken,
      accessToken: isString(tokenResponse.access_token) ? tokenResponse.access_token : currentSession.accessToken,
      scope: typeof tokenResponse.scope === 'string' ? tokenResponse.scope : currentSession.scope,
      expiresAt: currentSession.expiresAt,
      updatedAt: now,
      user: mergeUserProfile(subject, claims, userInfo ?? currentSession.user),
    };

    let rotatedSession: OidcVaultSession;

    try {
      rotatedSession = await options.storeProvider.rotateSession({
        sessionId: currentSession.sessionId,
        nextSession,
      });
    } catch (error) {
      if (isStoreConflictError(error)) {
        if (usesCookieTransport(options)) {
          clearSessionCookie(res, options);
        }

        throw new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.');
      }

      throw error;
    }

    let issuedToken: Partial<OidcVaultTokenIssueResult>;

    try {
      issuedToken = await withIssuedToken(req, res, options, rotatedSession);
    } catch (error) {
      await options.storeProvider.deleteSessionsByLogicalSessionId({
        logicalSessionId: rotatedSession.logicalSessionId ?? rotatedSession.sessionId,
      });

      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      throw error;
    }

    await callPostCommitHook('refresh', options, options.hooks?.onSessionRefreshed, req, res, rotatedSession, {
      previousSessionId: currentSession.sessionId,
    });

    if (usesCookieTransport(options)) {
      setSessionCookie(res, options, rotatedSession.sessionId);
    }

    const response = createExchangeResponse(options, rotatedSession, issuedToken);

    res.status(200).json(response);
  });

const createLogoutHandler = (
  options: OidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
): RequestHandler =>
  createAsyncHandler('logout', options, async (req, res) => {
    assertTrustedOrigin(req, options, trustedOrigins, 'logout');
    const body = getBody(req);
    const sessionId = getSessionIdFromRequest(req, options, 'logout');
    const redirect = body.redirect === true;
    const session = await options.storeProvider.getSession(sessionId);

    if (!session) {
      await options.storeProvider.deleteSession(sessionId);

      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      res.status(200).json({ loggedOut: true } satisfies OidcVaultLogoutResult);
      return;
    }

    await callHook('logout', options.hooks?.onBeforeLogout, req, res, session, undefined);
    await options.storeProvider.deleteSessionsByLogicalSessionId({
      logicalSessionId: session.logicalSessionId ?? session.sessionId,
    });

    if (usesCookieTransport(options)) {
      clearSessionCookie(res, options);
    }

    const metadata = await resolveProviderMetadata(config, options);
    const upstreamLogoutUrl = metadata.endSessionEndpoint
      ? buildLogoutUrl(metadata.endSessionEndpoint, session.idToken, options.postLogoutRedirectUri)
      : undefined;

    await callPostCommitHook('logout', options, options.hooks?.onLogout, req, res, session);

    if (redirect && upstreamLogoutUrl) {
      res.redirect(302, upstreamLogoutUrl);
      return;
    }

    res.status(200).json({
      loggedOut: true,
    } satisfies OidcVaultLogoutResult);
  });

const createBackchannelLogoutHandler = (options: OidcVaultOptions, config: OidcVaultResolvedConfig): RequestHandler =>
  createAsyncHandler('backchannel-logout', options, async (req, res) => {
    const metadata = await resolveProviderMetadata(config, options);
    const logoutToken = getLogoutTokenFromRequest(req);
    const claims = await verifyBackchannelLogoutToken(metadata, logoutToken, options);
    const firstUse = await options.storeProvider.consumeBackchannelLogoutTokenJti({
      jti: claims.jti as string,
      expiresAt: (claims.exp as number) * 1000,
    });

    if (!firstUse) {
      res.status(200).json({
        loggedOut: true,
        revokedSessions: 0,
      } satisfies OidcVaultBackchannelLogoutResult);
      return;
    }

    const revokedSessions = isString(claims.sid)
      ? await options.storeProvider.deleteSessionsByProviderSessionId({
          providerSessionId: claims.sid,
          issuer: metadata.issuer,
          clientId: metadata.clientId,
        })
      : await options.storeProvider.deleteSessionsBySubject({
          subject: String(claims.sub),
          issuer: metadata.issuer,
          clientId: metadata.clientId,
        });

    await callPostCommitHook('backchannel-logout', options, options.hooks?.onLogout, req, res, undefined, {
      providerSessionId: claims.sid,
      subject: claims.sub,
      revokedSessions,
    });

    res.status(200).json({
      loggedOut: true,
      revokedSessions,
    } satisfies OidcVaultBackchannelLogoutResult);
  });

function registerRoutes(
  router: Router,
  options: OidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
  backendOrigin: string,
  basePath: string,
): void {
  router.get(OIDC_VAULT_ROUTE_PATHS.login, createLoginHandler(options, config, backendOrigin, basePath));
  router.get(OIDC_VAULT_ROUTE_PATHS.callback, createCallbackHandler(options, config, backendOrigin, basePath));
  router.post(OIDC_VAULT_ROUTE_PATHS.exchange, createExchangeHandler(options));
  router.post(OIDC_VAULT_ROUTE_PATHS.refresh, createRefreshHandler(options, config, trustedOrigins));
  router.post(OIDC_VAULT_ROUTE_PATHS.logout, createLogoutHandler(options, config, trustedOrigins));
  router.post(OIDC_VAULT_ROUTE_PATHS['backchannel-logout'], createBackchannelLogoutHandler(options, config));
}

/**
 * Create the core OIDC vault middleware.
 */
export function createOidcVaultMiddleware(options: OidcVaultOptions): Router {
  const { backendOrigin, config, trustedOrigins } = validateOidcVaultOptions(options);
  const rootRouter = express.Router();
  const baseRouter = express.Router();
  const basePath = normalizeOidcVaultBasePath(options.basePath);

  const requestBodyLimit = options.requestBodyLimit ?? DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT;

  baseRouter.use(express.json({ limit: requestBodyLimit }));
  baseRouter.use(
    express.urlencoded({
      extended: false,
      limit: requestBodyLimit,
      parameterLimit: OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT,
    }),
  );
  baseRouter.use(createBodyParserErrorHandler());
  registerRoutes(baseRouter, options, config, trustedOrigins, backendOrigin, basePath);
  rootRouter.use(basePath, baseRouter);

  return rootRouter;
}
