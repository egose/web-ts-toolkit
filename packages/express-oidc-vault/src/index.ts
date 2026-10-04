import { createHash, randomBytes } from 'node:crypto';

import express from 'express';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';

import {
  assertAuthorizationTransactionIdentity,
  assertAuthorizationTransactionMatches,
  createTransactionProviderMetadata,
  invalidAuthorizationState,
  snapshotAuthorizationTransaction,
} from './authorization-transaction';
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
  assertDeviceBindingPolicy,
  assertDeviceBindingStoreCapabilities,
  resolveDeviceBindingOptions,
  resolveDeviceBindingOrigin,
  snapshotDpopBinding,
  withSessionDeviceBinding,
  type ResolvedOidcVaultOptions,
} from './device-binding-policy';
import { OidcVaultHttpError, getRequiredString, isBodyParserError, toBodyParserErrorPayload } from './errors';
import { computeExpiresAt, isUsableEpochMs, validateLifetimeOptions } from './lifetime-policy';
import {
  FINGERPRINT_RECOGNITION_METADATA_KEY,
  assertFingerprintRecognition,
  captureFingerprintRecognition,
  fingerprintRecognitionMatches,
  resolveFingerprintRecognitionOptions,
  snapshotFingerprintRecognition,
  withFingerprintRecognitionMetadata,
} from './fingerprint-recognition';
import {
  assertTrustedOrigin,
  captureTrustedOriginGuard,
  resolveBackendOrigin,
  resolveFrontendRedirectUri as normalizeFrontendRedirectUri,
  resolveTrustedOrigins,
  validatePostLogoutRedirectUri,
} from './origins';
import type { TrustedOrigins } from './origins';
import type { OidcProviderMetadata } from './provider-client';
import {
  fetchUserInfo,
  requestToken,
  resolveProviderMetadata,
  validateCallbackTokenResponse,
  validateRefreshTokenResponse,
} from './provider-client';
import { createExchangeResponse, withIssuedToken } from './token-issuance';
import {
  assertUserInfoSubject,
  composeRefreshedUserProfile,
  mergeUserProfile,
  verifyBackchannelLogoutToken,
  verifyIdToken,
} from './token-validation';
import {
  authenticateTransactionCookie,
  clearTransactionCookie,
  createTransactionBrowserBinding,
  resolveTransactionCookieOptions,
  setTransactionCookie,
} from './transaction-cookie';
import { OidcVaultStoreConflictError } from './types';
import type {
  AuthorizationTransaction,
  OidcVaultBackchannelLogoutResult,
  OidcVaultHookContext,
  OidcVaultLoginInitiationResult,
  OidcVaultLogoutResult,
  OidcVaultOptions,
  OidcVaultRouteName,
  OidcVaultSession,
} from './types';
import { getBody, isString } from './utils';
import {
  captureVaultRouteProof,
  createVaultRouteProofVerifier,
  sendVaultRoutePolicyResponse,
  toVaultRouteErrorResponse,
  type VaultRouteProofVerifier,
} from './vault-route-proof';
import {
  assertVaultExchangeCodeMatches,
  assertVaultExchangeSessionBinding,
  assertVaultRevocationContextMatches,
  assertVaultSessionIdentity,
  assertVaultSessionMatches,
  copyVaultSession,
  copyVaultUserProfile,
  invalidExchangeCode,
  invalidVaultSession,
  snapshotVaultExchangeCode,
  snapshotVaultRevocationContext,
  snapshotVaultSession,
} from './vault-session';

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

/**
 * Credential-response cache policy (BOV-16).
 *
 * Every vault route response carries `Cache-Control: no-store` so shared and
 * private caches do not retain session/access credentials, one-time exchange
 * codes, or authorization/logout redirects. The policy is applied once at the
 * vault `baseRouter` boundary plus defensively in both error emitters, so
 * success, redirect, and error paths share one contract without touching
 * route logic (BOV-10 ordering preserved).
 *
 * Deliberately not emitted: legacy `Pragma: no-cache` / `Expires` headers.
 * `no-store` is the authoritative RFC 9111 directive; the legacy headers add
 * no retention protection once `no-store` is present and would widen the
 * contract without evidence. Deliberately not emitted: `Referrer-Policy`.
 * Redirect targets (`Location`) intentionally expose protocol-required values
 * (provider authorization URL, frontend `?code=`, upstream `id_token_hint`)
 * to the navigation target; a referrer policy cannot hide that target and
 * subsequent-navigation referrer behavior belongs to frontend/provider pages.
 *
 * Non-goals (not claimed): these headers do not clear browser history,
 * disable reverse-proxy request logging, strip `?code=` from frontend URLs
 * or history (frontend must still clean up the callback URL), or hide the
 * intentional provider redirect exposure described above.
 */
const CREDENTIAL_RESPONSE_CACHE_CONTROL = 'no-store';

const applyCredentialResponseCachePolicy = (res: Response): void => {
  res.setHeader('Cache-Control', CREDENTIAL_RESPONSE_CACHE_CONTROL);
};

const createOpaqueId = (prefix: string): string => `${prefix}_${randomBytes(16).toString('base64url')}`;

const createPkceVerifier = (): string => randomBytes(32).toString('base64url');

const createPkceChallenge = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

const getCallbackUri = (backendOrigin: string, basePath: string): string =>
  `${backendOrigin}${basePath}${OIDC_VAULT_ROUTE_PATHS.callback}`;

const validateOidcVaultOptions = (
  options: OidcVaultOptions,
): {
  backendOrigin: string;
  config: OidcVaultResolvedConfig;
  trustedOrigins: TrustedOrigins;
  resolvedOptions: ResolvedOidcVaultOptions;
} => {
  const {
    deviceBinding: configuredDeviceBinding,
    fingerprintRecognition: configuredFingerprintRecognition,
    transactionCookie: configuredTransactionCookie,
    ...otherOptions
  } = options;
  // Cookie getters are captured once: name collision checks and actual session
  // serialization must use the same construction-time cookie configuration.
  const cookie = otherOptions.cookie ? { ...otherOptions.cookie } : undefined;
  const cookieOptions = { ...otherOptions, cookie };
  validateLifetimeOptions(options, getNow(options));
  const deviceBinding = resolveDeviceBindingOptions(configuredDeviceBinding);
  const fingerprintRecognition = resolveFingerprintRecognitionOptions(configuredFingerprintRecognition);
  const backendOrigin =
    deviceBinding === undefined ? resolveBackendOrigin(options) : resolveDeviceBindingOrigin(options.backendOrigin);
  if (deviceBinding !== undefined) assertDeviceBindingStoreCapabilities(options.storeProvider);
  if (fingerprintRecognition !== undefined)
    assertDeviceBindingStoreCapabilities(options.storeProvider, 'fingerprintRecognition');
  const frontendRedirectUri = normalizeFrontendRedirectUri(options);
  validatePostLogoutRedirectUri(options);
  validateCookieOptions(cookieOptions);
  const transactionCookie = resolveTransactionCookieOptions(
    {
      ...cookieOptions,
      deviceBinding: configuredDeviceBinding,
      fingerprintRecognition,
      transactionCookie: configuredTransactionCookie,
    },
    backendOrigin,
  );
  const config = resolveOidcVaultConfig(options.config ? { ...options.config } : undefined);
  const configuredTrustedOrigins = resolveTrustedOrigins(options);

  if (usesCrossSiteCookieTransport(cookieOptions) && configuredTrustedOrigins.size === 0) {
    throw new Error('trustedOrigins is required when using cross-site cookie transport.');
  }

  const trustedOrigins = new Set(configuredTrustedOrigins);
  trustedOrigins.add(backendOrigin);

  // Internal resolved snapshot (BOV-15): never mutate the caller object so
  // frozen inputs work and reused inputs cannot cross-contaminate instances.
  // Plain-data containers are shallow-copied for stable behavior; service
  // references (storeProvider, hooks, tokenIssuer, now) are retained by
  // reference and never deep-cloned. Post-construction mutation or
  // replacement of the caller object (including its cookie/trustedOrigins/
  // config containers) has no effect on this instance. The device-binding
  // policy/algorithm containers are frozen and nonce bytes privately copied.
  const resolvedOptions: ResolvedOidcVaultOptions = {
    ...otherOptions,
    deviceBinding,
    fingerprintRecognition,
    transactionCookie,
    ...(frontendRedirectUri !== undefined ? { frontendRedirectUri } : {}),
    ...(options.trustedOrigins ? { trustedOrigins: [...options.trustedOrigins] } : {}),
    ...(cookie === undefined ? {} : { cookie }),
    ...(options.config ? { config: { ...options.config } } : {}),
  };

  return { backendOrigin, config, trustedOrigins, resolvedOptions };
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

/**
 * Build the replay-reservation key for a backchannel logout token.
 *
 * The key namespaces the raw logout-token `jti` by issuer and client ID so
 * two middleware instances (or two providers) that share one store cannot
 * suppress each other's revocations when they happen to issue the same `jti`.
 * Components are base64url-encoded so the `:` separator cannot collide with
 * URL or client-ID characters. The `v2:` prefix distinguishes these keys from
 * pre-BOV-01 raw-`jti` records, which expire naturally with the logout-token
 * `exp` and are never matched by the new keys.
 *
 * Retry-safe delivery policy (BOV-01):
 *
 * - Verification runs before any durable work, so invalid or expired tokens
 *   never allocate replay state.
 * - The first request to present a namespaced key atomically reserves it
 *   (single-key `consumeBackchannelLogoutTokenJti`, the smallest enforceable
 *   store boundary) and becomes the revocation owner: it performs the
 *   idempotent session deletion and always emits `onLogout`.
 * - Duplicate presentations of a valid token perform silent idempotent
 *   catch-up deletion of the same `sid`/`sub` target (scoped by issuer and
 *   client ID) without emitting `onLogout`, unless the catch-up actually
 *   removed sessions. A duplicate that removes at least one session emits
 *   `onLogout` so a retry after an owner-side deletion failure still delivers
 *   the hook (at-least-once under failure/concurrency).
 * - A sequential replay after completed revocation deletes zero sessions and
 *   emits no hook (`revokedSessions: 0`).
 * - Crash between durable deletion and hook delivery can lose that delivery:
 *   a later duplicate finds no remaining sessions and stays silent. Hooks are
 *   therefore at-most-once across that narrow crash window and at-least-once
 *   otherwise; never exactly-once under concurrency.
 */
const buildBackchannelLogoutReplayKey = (input: { issuer?: string; clientId?: string; jti: string }): string => {
  const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

  return `v2:${encode(input.issuer ?? '')}:${encode(input.clientId ?? '')}:${encode(input.jti)}`;
};

const createHookContext = (
  route: OidcVaultRouteName,
  req: Request,
  res: Response,
  session?: OidcVaultSession,
  metadata?: Record<string, unknown>,
): OidcVaultHookContext => ({ route, req, res, session, metadata });

const resolveLoginReturnTo = (rawReturnTo: unknown, options: OidcVaultOptions): string | undefined => {
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

const resolveReturnTo = (req: Request, options: OidcVaultOptions): string | undefined =>
  resolveLoginReturnTo(req.query.returnTo, options);

const appendCodeToRedirectUri = (redirectUri: string, code: string): string => {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  return url.toString();
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
  options: ResolvedOidcVaultOptions,
  error: unknown,
): Promise<void> {
  // Keep response authority detached before a mutable observer can touch the
  // error or challenge headers. No raw claims/provider diagnostics enter JSON.
  const response = toVaultRouteErrorResponse(error, options.deviceBinding);
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

  sendVaultRoutePolicyResponse(res, response);
}

function createAsyncHandler(
  route: OidcVaultRouteName,
  options: ResolvedOidcVaultOptions,
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

    applyCredentialResponseCachePolicy(res);
    const payload = toBodyParserErrorPayload(error);
    res.status(payload.status).json({
      code: payload.code,
      message: payload.message,
    });
  };
}

const createLoginHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  backendOrigin: string,
  basePath: string,
): RequestHandler =>
  createAsyncHandler('login', options, async (req, res) => {
    // GET is always the legacy unbound navigation, even with a DPoP header.
    assertDeviceBindingPolicy(options.deviceBinding, undefined);
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
      expiresAt: computeExpiresAt(
        now,
        options.authorizationTransactionTtlMs ?? DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS,
        'authorizationTransactionTtlMs',
      ),
    };

    await options.storeProvider.createAuthorizationTransaction(transaction);

    const authorizationUrl = buildAuthorizationUrl(metadata, transaction, getCallbackUri(backendOrigin, basePath));

    await callHook('login', options.hooks?.onAuthorizationUrl, req, res, undefined, {
      authorizationUrl,
      state: transaction.state,
    });

    res.redirect(302, authorizationUrl);
  });

const createLoginInitiationHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
  backendOrigin: string,
  basePath: string,
  proofVerifier: VaultRouteProofVerifier | undefined,
): RequestHandler =>
  createAsyncHandler('login', options, async (req, res) => {
    const capturedProof = captureVaultRouteProof(req);
    const fingerprintRecognition = captureFingerprintRecognition(req, options.fingerprintRecognition);
    assertLoginInitiationRequest(req, options, trustedOrigins);
    const body = getBody(req);
    if (Array.isArray(req.body) || (body.returnTo !== undefined && !isString(body.returnTo))) {
      throw new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_REQUEST_BODY', 'Login initiation request body is invalid.');
    }
    const returnTo = resolveLoginReturnTo(body.returnTo, options);
    // No provider discovery, hook, transaction or browser cookie until the
    // shared signature/target/time/nonce/replay admission has actually passed.
    if (proofVerifier === undefined && capturedProof.header.count !== 0) {
      throw new OidcVaultHttpError(
        401,
        'OIDC_VAULT_INVALID_DPOP_PROOF',
        'DPoP login initiation is not enabled.',
        'DPoP proof validation failed.',
      );
    }
    const verifiedBinding = await proofVerifier?.initiate(capturedProof);
    const binding = snapshotDpopBinding(verifiedBinding);
    const metadata = await resolveProviderMetadata(config, options);
    // New POST hooks get owned metadata; they cannot alter provider URL/client
    // authority or the initiating key captured above.
    await callHook('login', options.hooks?.onLoginStart, req, res, undefined, { provider: { ...metadata } });
    const now = getNow(options);
    const browserBinding = createTransactionBrowserBinding();
    const pkceVerifier = createPkceVerifier();
    const transaction: AuthorizationTransaction = {
      state: createOpaqueId('state'),
      nonce: createOpaqueId('nonce'),
      pkceVerifier,
      codeChallenge: createPkceChallenge(pkceVerifier),
      returnTo,
      ...(binding === undefined ? {} : { deviceBinding: binding }),
      browserBindingHash: browserBinding.browserBindingHash,
      createdAt: now,
      expiresAt: computeExpiresAt(
        now,
        options.authorizationTransactionTtlMs ?? DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS,
        'authorizationTransactionTtlMs',
      ),
      metadata: Object.freeze({
        ...createTransactionProviderMetadata(config),
        ...(fingerprintRecognition === undefined
          ? {}
          : { [FINGERPRINT_RECOGNITION_METADATA_KEY]: fingerprintRecognition }),
      }),
    };
    // Build from private original authority before passing an input to an
    // asynchronous store. Hooks receive copied URL/state metadata, never the
    // transaction, proof context or cookie secret.
    const authorizationUrl = buildAuthorizationUrl(metadata, transaction, getCallbackUri(backendOrigin, basePath));
    const { state, expiresAt } = transaction;
    await options.storeProvider.createAuthorizationTransaction(transaction);
    await callHook('login', options.hooks?.onAuthorizationUrl, req, res, undefined, { authorizationUrl, state });
    setTransactionCookie(res, options.transactionCookie!, browserBinding.secret, expiresAt, getNow(options));
    applyCredentialResponseCachePolicy(res);
    res.status(200).json({ authorizationUrl } satisfies OidcVaultLoginInitiationResult);
  });

const createCallbackHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  backendOrigin: string,
  basePath: string,
): RequestHandler =>
  createAsyncHandler('callback', options, async (req, res) => {
    // Capture navigation/cookie authority before any async store/provider/hook.
    // The callback is headerless and intentionally invokes no DPoP policy.
    const providerError = isString(req.query.error) ? req.query.error : undefined;
    const code =
      providerError === undefined
        ? getRequiredString(
            req.query.code,
            'OIDC callback is missing the authorization code.',
            'OIDC_VAULT_MISSING_CODE',
          )
        : undefined;
    const state = getRequiredString(req.query.state, 'OIDC callback is missing state.', 'OIDC_VAULT_MISSING_STATE');
    const cookieHeader = req.headers.cookie;
    const store = options.storeProvider;
    const preflight =
      typeof store.getAuthorizationTransaction === 'function'
        ? await store.getAuthorizationTransaction(state)
        : await store.consumeAuthorizationTransaction(state);
    if (!preflight) throw invalidAuthorizationState();
    const transaction = snapshotAuthorizationTransaction(preflight, state, getNow(options));
    assertAuthorizationTransactionIdentity(transaction, config);
    assertDeviceBindingPolicy(options.deviceBinding, transaction.deviceBinding);
    const cookie = options.transactionCookie!;
    const cookieSecret = authenticateTransactionCookie(cookieHeader, cookie, transaction.match);
    // BOV-10 destination preflight also precedes the new atomic consume.
    const frontendDestination =
      providerError === undefined ? resolveFrontendRedirectUri(transaction, options) : undefined;
    if (typeof store.getAuthorizationTransaction === 'function') {
      let consumed: AuthorizationTransaction | null;
      if (typeof store.consumeAuthorizationTransactionIfMatches === 'function') {
        consumed = await store.consumeAuthorizationTransactionIfMatches({ state, match: transaction.match });
      } else {
        if (transaction.browserBindingHash !== undefined) {
          throw new TypeError('Guarded callbacks require storeProvider.consumeAuthorizationTransactionIfMatches.');
        }
        consumed = await store.consumeAuthorizationTransaction(state);
      }
      if (!consumed) throw invalidAuthorizationState();
      const returned = snapshotAuthorizationTransaction(consumed, state, getNow(options));
      assertAuthorizationTransactionIdentity(returned, config);
      assertDeviceBindingPolicy(options.deviceBinding, returned.deviceBinding);
      assertAuthorizationTransactionMatches(returned, transaction);
    }
    // Only an authenticated matching consume owns terminal cleanup. Missing/
    // wrong cookie, policy/identity/race mismatch never spends or clears here.
    try {
      if (providerError !== undefined) {
        throw new OidcVaultHttpError(400, 'OIDC_VAULT_CALLBACK_ERROR', providerError, 'OIDC callback failed.');
      }
      const metadata = await resolveProviderMetadata(config, options);
      const tokenResponse = await requestToken(
        metadata,
        {
          grant_type: 'authorization_code',
          code: code!,
          code_verifier: transaction.pkceVerifier,
          redirect_uri: getCallbackUri(backendOrigin, basePath),
        },
        options,
      );
      // Callback requires id_token + refresh_token; preserve all provider checks.
      validateCallbackTokenResponse(tokenResponse);
      await callHook('callback', options.hooks?.onCallbackTokens, req, res, undefined, {
        hasAccessToken: Boolean(tokenResponse.access_token),
        hasRefreshToken: true,
        hasIdToken: true,
      });
      const claims = await verifyIdToken(metadata, tokenResponse.id_token as string, transaction.nonce, options);
      const subject = getRequiredString(
        claims.sub,
        'OIDC id_token is missing sub.',
        'OIDC_VAULT_INVALID_ID_TOKEN',
        502,
      );
      const userInfo =
        shouldFetchUserInfo(options, metadata) && isString(tokenResponse.access_token)
          ? await fetchUserInfo(metadata, tokenResponse.access_token, options)
          : undefined;
      if (userInfo !== undefined) {
        assertUserInfoSubject(userInfo, subject);
        await callHook('callback', options.hooks?.onUserInfo, req, res, undefined, { subject });
      }
      const now = getNow(options);
      const sessionExpiresAt =
        options.sessionTtlMs === undefined ? undefined : computeExpiresAt(now, options.sessionTtlMs, 'sessionTtlMs');
      const exchangeExpiresAt = computeExpiresAt(
        now,
        options.exchangeCodeTtlMs ?? DEFAULT_EXCHANGE_CODE_TTL_MS,
        'exchangeCodeTtlMs',
      );
      const sessionId = createOpaqueId('sess');
      const provider = Object.freeze({
        issuer: metadata.issuer ?? (typeof claims.iss === 'string' ? claims.iss : undefined),
        clientId: metadata.clientId,
      });
      const sessionBinding = transaction.deviceBinding;
      const recognition = transaction.fingerprintRecognition;
      const session: OidcVaultSession = {
        sessionId,
        logicalSessionId: sessionId,
        subject,
        providerSessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
        provider: { ...provider },
        ...(sessionBinding === undefined ? {} : { deviceBinding: { ...sessionBinding } }),
        refreshToken: tokenResponse.refresh_token as string,
        idToken: tokenResponse.id_token as string,
        accessToken: isString(tokenResponse.access_token) ? tokenResponse.access_token : undefined,
        scope: typeof tokenResponse.scope === 'string' ? tokenResponse.scope : metadata.scopes,
        createdAt: now,
        updatedAt: now,
        ...(sessionExpiresAt === undefined ? {} : { expiresAt: sessionExpiresAt }),
        user: copyVaultUserProfile(mergeUserProfile(subject, claims, userInfo)),
        metadata: withFingerprintRecognitionMetadata({ tokenType: tokenResponse.token_type }, recognition),
      };
      await callHook('callback', options.hooks?.onBeforeSessionCreate, req, res, session, { subject });
      if (sessionExpiresAt !== undefined) {
        // Hook delay/createdAt mutation cannot move the absolute cap.
        session.expiresAt = isUsableEpochMs(session.expiresAt)
          ? Math.min(session.expiresAt, sessionExpiresAt)
          : sessionExpiresAt;
      }
      const guarded = transaction.browserBindingHash !== undefined;
      const restoredBinding = guarded
        ? withSessionDeviceBinding(
            {
              ...copySessionApplicationFields(session),
              sessionId,
              logicalSessionId: sessionId,
              provider: { ...provider },
            },
            sessionBinding,
          )
        : withSessionDeviceBinding(session, sessionBinding);
      const restored = {
        ...restoredBinding,
        user: copyVaultUserProfile(restoredBinding.user),
        metadata: withFingerprintRecognitionMetadata(restoredBinding.metadata, recognition),
      };
      const createdSession = await store.createSession(restored);
      const createdSessionId = guarded ? sessionId : createdSession.sessionId;
      const logicalSessionId = guarded ? sessionId : (createdSession.logicalSessionId ?? createdSessionId);
      const exchangeCode = createOpaqueId('code');
      try {
        const returnedBinding = snapshotDpopBinding(createdSession.deviceBinding);
        if (returnedBinding?.jkt !== sessionBinding?.jkt) throw invalidAuthorizationState();
        if (!fingerprintRecognitionMatches(snapshotFingerprintRecognition(createdSession.metadata), recognition))
          throw invalidAuthorizationState();
        if (
          guarded &&
          (createdSession.sessionId !== sessionId ||
            createdSession.logicalSessionId !== sessionId ||
            createdSession.provider?.issuer !== provider.issuer ||
            createdSession.provider?.clientId !== provider.clientId)
        ) {
          throw invalidAuthorizationState();
        }
        await store.createExchangeCode({
          code: exchangeCode,
          sessionId: createdSessionId,
          returnTo: transaction.returnTo,
          ...(sessionBinding === undefined ? {} : { deviceBinding: sessionBinding }),
          ...(transaction.browserBindingHash === undefined
            ? {}
            : { browserBindingHash: transaction.browserBindingHash }),
          createdAt: now,
          expiresAt: exchangeExpiresAt,
        });
      } catch (error) {
        await store.deleteSessionsByLogicalSessionId({ logicalSessionId });
        throw error;
      }
      await callPostCommitHook(
        'callback',
        options,
        options.hooks?.onSessionCreated,
        req,
        res,
        withSessionDeviceBinding(copyVaultSession(createdSession), sessionBinding),
        { subject },
      );
      if (cookieSecret !== undefined) {
        setTransactionCookie(res, cookie, cookieSecret, exchangeExpiresAt, getNow(options));
      }
      applyCredentialResponseCachePolicy(res);
      res.redirect(302, appendCodeToRedirectUri(frontendDestination!, exchangeCode));
    } catch (error) {
      if (cookieSecret !== undefined) clearTransactionCookie(res, cookie);
      throw error;
    }
  });

const assertLoginInitiationRequest = (
  req: Request,
  options: OidcVaultOptions,
  trustedOrigins: TrustedOrigins,
): void => {
  assertTrustedOrigin(req, options, trustedOrigins, 'login');
  if (!req.is('application/json')) {
    throw new OidcVaultHttpError(
      415,
      'OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE',
      'Login initiation requires a JSON request body.',
    );
  }
};

/** Skip hook-replaced authority (even getters); restore only private original IDs/provider/key. */
const copySessionApplicationFields = (session: OidcVaultSession): Omit<OidcVaultSession, 'sessionId'> => {
  const result = {} as Omit<OidcVaultSession, 'sessionId'>;
  for (const key of Object.keys(session)) {
    if (['deviceBinding', 'browserBindingHash', 'sessionId', 'logicalSessionId', 'provider'].includes(key)) continue;
    Object.defineProperty(result, key, {
      value: Reflect.get(session, key),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
};

const createExchangeHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
  proofVerifier: VaultRouteProofVerifier | undefined,
): RequestHandler =>
  createAsyncHandler('exchange', options, async (req, res) => {
    const capturedProof = proofVerifier === undefined ? undefined : captureVaultRouteProof(req);
    const capturedRecognition = captureFingerprintRecognition(req, options.fingerprintRecognition);
    const assertExchangeOrigin = captureTrustedOriginGuard(req, options, trustedOrigins, 'exchange');
    const cookieHeader = req.headers.cookie;
    const body = getBody(req);
    const code = getRequiredString(body.code, 'Exchange request is missing code.', 'OIDC_VAULT_MISSING_EXCHANGE_CODE');
    const store = options.storeProvider;
    const canPreflight = typeof store.getExchangeCode === 'function';
    if (
      (proofVerifier !== undefined || options.fingerprintRecognition !== undefined) &&
      (!canPreflight || typeof store.consumeExchangeCodeIfMatches !== 'function')
    ) {
      throw new TypeError('Device-bound exchange requires guarded store reads and atomic consumption.');
    }
    const rawCode = canPreflight ? await store.getExchangeCode!(code) : await store.consumeExchangeCode(code);
    if (!rawCode) throw invalidExchangeCode();
    const record = snapshotVaultExchangeCode(rawCode, code, getNow(options));
    const guarded = record.browserBindingHash !== undefined;
    if (guarded) assertExchangeOrigin();
    assertDeviceBindingPolicy(options.deviceBinding, record.deviceBinding);
    const rawSession = await store.getSession(record.sessionId);
    if (!rawSession) throw invalidVaultSession();
    const session = snapshotVaultSession(rawSession, record.sessionId, getNow(options));
    assertDeviceBindingPolicy(options.deviceBinding, session.deviceBinding);
    assertVaultExchangeSessionBinding(record, session);
    // Disabled, genuinely legacy bearer exchange retains its historical code
    // consumption/identity ordering. Every opted-in or guarded flow preflights
    // immutable identity before consuming or admitting a proof.
    const protectedExchange = proofVerifier !== undefined || options.fingerprintRecognition !== undefined || guarded;
    if (protectedExchange && typeof store.consumeExchangeCodeIfMatches !== 'function') {
      throw new TypeError('Guarded exchange requires storeProvider.consumeExchangeCodeIfMatches.');
    }
    if (protectedExchange) assertVaultSessionIdentity(session, config);
    const cookieSecret = authenticateTransactionCookie(cookieHeader, options.transactionCookie!, record.match);
    const recognition =
      options.fingerprintRecognition === undefined ? undefined : snapshotFingerprintRecognition(session.metadata);
    assertFingerprintRecognition(options.fingerprintRecognition, recognition, capturedRecognition);
    const verifiedBinding =
      proofVerifier === undefined ? undefined : await proofVerifier.verify(capturedProof!, session.deviceBinding);
    if (canPreflight) {
      const consumed = protectedExchange
        ? await store.consumeExchangeCodeIfMatches!({
            code,
            expectedSessionId: record.sessionId,
            match: record.match,
          })
        : await store.consumeExchangeCode(code);
      if (!consumed) throw invalidExchangeCode();
      const returned = snapshotVaultExchangeCode(consumed, code, getNow(options));
      assertVaultExchangeCodeMatches(returned, record);
      const returnedSession = await store.getSession(record.sessionId);
      if (!returnedSession) throw invalidVaultSession();
      const checkedSession = snapshotVaultSession(returnedSession, record.sessionId, getNow(options));
      assertVaultSessionIdentity(checkedSession, config);
      assertVaultExchangeSessionBinding(returned, checkedSession);
      assertVaultSessionMatches(checkedSession, session);
      if (
        options.fingerprintRecognition !== undefined &&
        !fingerprintRecognitionMatches(snapshotFingerprintRecognition(checkedSession.metadata), recognition)
      )
        throw invalidVaultSession();
    }
    assertVaultSessionIdentity(session, config);
    // Only a verified, matching consume owns terminal temporary-cookie cleanup.
    // Policy/cookie/proof/nonce/atomic-return mismatches never clear it.
    try {
      const issuedToken = await withIssuedToken(req, res, options, session, verifiedBinding);
      if (usesCookieTransport(options)) setSessionCookie(res, options, session.sessionId);
      if (cookieSecret !== undefined) clearTransactionCookie(res, options.transactionCookie!);
      applyCredentialResponseCachePolicy(res);
      res.status(200).json(createExchangeResponse(options, session, issuedToken));
    } catch (error) {
      if (cookieSecret !== undefined) clearTransactionCookie(res, options.transactionCookie!);
      throw error;
    }
  });

const createRefreshHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
  proofVerifier: VaultRouteProofVerifier | undefined,
): RequestHandler =>
  createAsyncHandler('refresh', options, async (req, res) => {
    const capturedRecognition = captureFingerprintRecognition(req, options.fingerprintRecognition);
    assertTrustedOrigin(req, options, trustedOrigins, 'refresh');
    const capturedProof = proofVerifier === undefined ? undefined : captureVaultRouteProof(req);
    const sessionId = getSessionIdFromRequest(req, options, 'refresh');
    const currentRecord = await options.storeProvider.getSession(sessionId);

    if (!currentRecord) {
      if (usesCookieTransport(options)) {
        clearSessionCookie(res, options);
      }

      throw new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_SESSION', 'Session is missing or expired.');
    }

    const currentSession = snapshotVaultSession(currentRecord, sessionId, getNow(options));
    assertVaultSessionIdentity(currentSession, config);
    assertDeviceBindingPolicy(options.deviceBinding, currentSession.deviceBinding);
    const recognition =
      options.fingerprintRecognition === undefined
        ? undefined
        : snapshotFingerprintRecognition(currentSession.metadata);
    assertFingerprintRecognition(options.fingerprintRecognition, recognition, capturedRecognition);
    const verifiedBinding =
      proofVerifier === undefined
        ? undefined
        : await proofVerifier.verify(capturedProof!, currentSession.deviceBinding);
    const metadata = await resolveProviderMetadata(config, options);
    if (proofVerifier !== undefined || options.fingerprintRecognition !== undefined) {
      // Discovery may await network work. Recheck immediately before using the
      // captured upstream credential, rather than relying on the earlier read.
      const latest = await options.storeProvider.getSession(sessionId);
      if (!latest) throw invalidVaultSession();
      const latestSession = snapshotVaultSession(latest, sessionId, getNow(options));
      assertVaultSessionMatches(latestSession, currentSession);
      if (
        options.fingerprintRecognition !== undefined &&
        !fingerprintRecognitionMatches(snapshotFingerprintRecognition(latestSession.metadata), recognition)
      )
        throw invalidVaultSession();
    }

    const tokenResponse = await requestToken(
      metadata,
      {
        grant_type: 'refresh_token',
        refresh_token: currentSession.refreshToken,
      },
      options,
    );
    // Refresh allows every credential field to be omitted (documented
    // retention behavior); present fields were type-checked above so a
    // malformed value cannot silently retain the old credential. No rotation
    // happens until all provider checks pass.
    validateRefreshTokenResponse(tokenResponse);

    const newIdToken = isString(tokenResponse.id_token) ? tokenResponse.id_token : undefined;
    // The stored ID token is never revalidated: without a new ID token it
    // serves only as previously verified identity evidence while the retained
    // profile is kept verbatim.
    const idToken = newIdToken ?? currentSession.idToken;
    const freshClaims = newIdToken ? await verifyIdToken(metadata, newIdToken, undefined, options) : undefined;
    const subject = freshClaims
      ? getRequiredString(freshClaims.sub, 'OIDC id_token is missing sub.', 'OIDC_VAULT_INVALID_ID_TOKEN', 502)
      : currentSession.subject;

    if (newIdToken && subject !== currentSession.subject) {
      throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC refreshed id_token sub changed.');
    }

    const userInfo =
      shouldFetchUserInfo(options, metadata) && isString(tokenResponse.access_token)
        ? await fetchUserInfo(metadata, tokenResponse.access_token, options)
        : undefined;

    if (userInfo !== undefined) {
      assertUserInfoSubject(userInfo, subject);
    }

    const now = getNow(options);
    const logicalSessionId = currentSession.logicalSessionId ?? currentSession.sessionId;
    const nextSession: OidcVaultSession = {
      ...copyVaultSession(currentSession),
      sessionId: createOpaqueId('sess'),
      logicalSessionId,
      subject,
      providerSessionId:
        freshClaims && typeof freshClaims.sid === 'string' ? freshClaims.sid : currentSession.providerSessionId,
      refreshToken: isString(tokenResponse.refresh_token) ? tokenResponse.refresh_token : currentSession.refreshToken,
      idToken,
      accessToken: isString(tokenResponse.access_token) ? tokenResponse.access_token : currentSession.accessToken,
      scope: typeof tokenResponse.scope === 'string' ? tokenResponse.scope : currentSession.scope,
      expiresAt: currentSession.expiresAt,
      updatedAt: now,
      user: copyVaultUserProfile(composeRefreshedUserProfile(subject, currentSession.user, freshClaims, userInfo)),
    };

    const expectedSession = snapshotVaultSession(nextSession, nextSession.sessionId, getNow(options));
    let rotatedRecord: OidcVaultSession;

    try {
      rotatedRecord = await options.storeProvider.rotateSession({
        sessionId: currentSession.sessionId,
        nextSession: copyVaultSession(expectedSession),
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

    try {
      const returnedSession = snapshotVaultSession(rotatedRecord, expectedSession.sessionId, getNow(options));
      assertVaultSessionIdentity(returnedSession, config);
      assertVaultSessionMatches(returnedSession, expectedSession);
      if (
        options.fingerprintRecognition !== undefined &&
        !fingerprintRecognitionMatches(snapshotFingerprintRecognition(returnedSession.metadata), recognition)
      )
        throw invalidVaultSession();
    } catch (error) {
      // Rotation is already committed. Cleanup uses the captured ORIGINAL
      // lineage, never a changed return/input record supplied by the store.
      await options.storeProvider.deleteSessionsByLogicalSessionId({ logicalSessionId });
      if (usesCookieTransport(options)) clearSessionCookie(res, options);
      throw error;
    }
    // Returned authority must agree, but profile/metadata precedence remains
    // the privately composed original, just as exchange uses its preflight
    // snapshot rather than a mutable second store return.
    const rotatedSession = expectedSession;
    const issuedToken = await withIssuedToken(req, res, options, rotatedSession, verifiedBinding);

    await callPostCommitHook(
      'refresh',
      options,
      options.hooks?.onSessionRefreshed,
      req,
      res,
      copyVaultSession(rotatedSession),
      {
        previousSessionId: currentSession.sessionId,
      },
    );

    if (usesCookieTransport(options)) {
      setSessionCookie(res, options, rotatedSession.sessionId);
    }

    const response = createExchangeResponse(options, rotatedSession, issuedToken);

    applyCredentialResponseCachePolicy(res);
    res.status(200).json(response);
  });

const createLogoutHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
  proofVerifier: VaultRouteProofVerifier | undefined,
): RequestHandler =>
  createAsyncHandler('logout', options, async (req, res) => {
    assertTrustedOrigin(req, options, trustedOrigins, 'logout');
    const capturedProof = proofVerifier === undefined ? undefined : captureVaultRouteProof(req);
    const body = getBody(req);
    const sessionId = getSessionIdFromRequest(req, options, 'logout');
    const redirect = body.redirect === true;
    const store = options.storeProvider;
    const hasContext = typeof store.getSessionRevocationContext === 'function';
    if (proofVerifier !== undefined && !hasContext) {
      throw new TypeError('Device-bound logout requires storeProvider.getSessionRevocationContext.');
    }
    // Built-ins ALWAYS resolve context, including feature-disabled aliases.
    // Old custom bearer-only stores without that capability keep their legacy
    // no-config path; they cannot opt into sender-constrained sessions.
    const rawContext = hasContext ? await store.getSessionRevocationContext!(sessionId) : undefined;
    const context = rawContext ? snapshotVaultRevocationContext(rawContext) : undefined;
    const rawSession = await store.getSession(sessionId);
    const session = rawSession ? snapshotVaultSession(rawSession, sessionId, getNow(options)) : undefined;
    const finishLocalLogout = () => {
      if (usesCookieTransport(options)) clearSessionCookie(res, options);
      applyCredentialResponseCachePolicy(res);
      res.status(200).json({ loggedOut: true } satisfies OidcVaultLogoutResult);
    };
    if (hasContext && context === undefined) {
      if (session !== undefined) {
        assertDeviceBindingPolicy(options.deviceBinding, session.deviceBinding);
        throw invalidVaultSession();
      }
      // No currently live target: no deletion, proof reservation, or hooks.
      finishLocalLogout();
      return;
    }
    const authority =
      context ??
      (session === undefined
        ? undefined
        : snapshotVaultRevocationContext({
            logicalSessionId: session.logicalSessionId ?? session.sessionId,
            provider: session.provider,
            deviceBinding: session.deviceBinding,
          }));
    if (authority === undefined) {
      // Only the legacy custom bearer-store branch lacks alias introspection.
      // Opt-in construction requires context; a capable store never uses this.
      await store.deleteSession(sessionId);
      finishLocalLogout();
      return;
    }
    assertVaultSessionIdentity(authority, config);
    assertDeviceBindingPolicy(options.deviceBinding, authority.deviceBinding);
    if (session !== undefined)
      assertVaultRevocationContextMatches(
        snapshotVaultRevocationContext({
          logicalSessionId: session.logicalSessionId ?? session.sessionId,
          provider: session.provider,
          deviceBinding: session.deviceBinding,
        }),
        authority,
      );
    if (proofVerifier !== undefined) await proofVerifier.verify(capturedProof!, authority.deviceBinding);
    if (hasContext) {
      const latest = await store.getSessionRevocationContext!(sessionId);
      if (!latest) {
        finishLocalLogout();
        return;
      }
      assertVaultRevocationContextMatches(snapshotVaultRevocationContext(latest), authority);
    }
    if (session !== undefined)
      await callHook('logout', options.hooks?.onBeforeLogout, req, res, copyVaultSession(session));
    await store.deleteSessionsByLogicalSessionId({ logicalSessionId: authority.logicalSessionId });

    if (usesCookieTransport(options)) {
      clearSessionCookie(res, options);
    }
    if (session === undefined) {
      // Aliases grant revocation only, never credentials/upstream redirect.
      applyCredentialResponseCachePolicy(res);
      res.status(200).json({ loggedOut: true } satisfies OidcVaultLogoutResult);
      return;
    }

    // BOV-10: local logout is independent of provider discovery. The durable
    // revocation above is committed before any upstream work; discovery (and
    // URL building) only runs for redirected logout and its failure never
    // undoes the revocation or skips the onLogout notification. A redirected
    // logout whose upstream metadata/endpoint is unavailable falls back to the
    // local 200 success so the response reports the local durable state
    // accurately; the upstream failure is surfaced via onError only.
    if (!redirect) {
      await callPostCommitHook('logout', options, options.hooks?.onLogout, req, res, copyVaultSession(session));

      applyCredentialResponseCachePolicy(res);
      res.status(200).json({ loggedOut: true } satisfies OidcVaultLogoutResult);
      return;
    }

    let upstreamLogoutUrl: string | undefined;

    try {
      const metadata = await resolveProviderMetadata(config, options);

      upstreamLogoutUrl = metadata.endSessionEndpoint
        ? buildLogoutUrl(metadata.endSessionEndpoint, session.idToken, options.postLogoutRedirectUri)
        : undefined;
    } catch (error) {
      try {
        await options.hooks?.onError?.({
          ...createHookContext('logout', req, res, copyVaultSession(session)),
          error,
        });
      } catch {
        // Prefer the committed local logout outcome over observer failures.
      }
    }

    await callPostCommitHook('logout', options, options.hooks?.onLogout, req, res, copyVaultSession(session));
    applyCredentialResponseCachePolicy(res);

    if (redirect && upstreamLogoutUrl) {
      res.redirect(302, upstreamLogoutUrl);
      return;
    }

    res.status(200).json({
      loggedOut: true,
    } satisfies OidcVaultLogoutResult);
  });

const createBackchannelLogoutHandler = (
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
): RequestHandler =>
  createAsyncHandler('backchannel-logout', options, async (req, res) => {
    const metadata = await resolveProviderMetadata(config, options);
    const logoutToken = getLogoutTokenFromRequest(req);
    const claims = await verifyBackchannelLogoutToken(metadata, logoutToken, options);
    const replayKey = buildBackchannelLogoutReplayKey({
      issuer: metadata.issuer,
      clientId: metadata.clientId,
      jti: claims.jti as string,
    });
    const firstUse = await options.storeProvider.consumeBackchannelLogoutTokenJti({
      jti: replayKey,
      expiresAt: (claims.exp as number) * 1000,
    });

    const revokeMatchingSessions = (): Promise<number> =>
      isString(claims.sid)
        ? options.storeProvider.deleteSessionsByProviderSessionId({
            providerSessionId: claims.sid,
            issuer: metadata.issuer,
            clientId: metadata.clientId,
          })
        : options.storeProvider.deleteSessionsBySubject({
            subject: String(claims.sub),
            issuer: metadata.issuer,
            clientId: metadata.clientId,
          });

    if (!firstUse) {
      const catchUpRevokedSessions = await revokeMatchingSessions();

      if (catchUpRevokedSessions > 0) {
        await callPostCommitHook('backchannel-logout', options, options.hooks?.onLogout, req, res, undefined, {
          providerSessionId: claims.sid,
          subject: claims.sub,
          revokedSessions: catchUpRevokedSessions,
        });
      }

      res.status(200).json({
        loggedOut: true,
        revokedSessions: catchUpRevokedSessions,
      } satisfies OidcVaultBackchannelLogoutResult);
      return;
    }

    const revokedSessions = await revokeMatchingSessions();

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
  options: ResolvedOidcVaultOptions,
  config: OidcVaultResolvedConfig,
  trustedOrigins: TrustedOrigins,
  backendOrigin: string,
  basePath: string,
): void {
  const proofVerifier = createVaultRouteProofVerifier(options, config, backendOrigin, basePath);
  router.get(OIDC_VAULT_ROUTE_PATHS.login, createLoginHandler(options, config, backendOrigin, basePath));
  if (proofVerifier !== undefined || options.fingerprintRecognition !== undefined) {
    router.post(
      OIDC_VAULT_ROUTE_PATHS.login,
      createLoginInitiationHandler(options, config, trustedOrigins, backendOrigin, basePath, proofVerifier),
    );
  }
  router.get(OIDC_VAULT_ROUTE_PATHS.callback, createCallbackHandler(options, config, backendOrigin, basePath));
  router.post(OIDC_VAULT_ROUTE_PATHS.exchange, createExchangeHandler(options, config, trustedOrigins, proofVerifier));
  router.post(OIDC_VAULT_ROUTE_PATHS.refresh, createRefreshHandler(options, config, trustedOrigins, proofVerifier));
  router.post(OIDC_VAULT_ROUTE_PATHS.logout, createLogoutHandler(options, config, trustedOrigins, proofVerifier));
  router.post(OIDC_VAULT_ROUTE_PATHS['backchannel-logout'], createBackchannelLogoutHandler(options, config));
}

/**
 * Create the OIDC lifecycle router using a named package-root import.
 * The default mount is /auth/oidc and default transport is body. Configure
 * issuer/clientId (or complete manual endpoints), a pinned backendOrigin,
 * frontendRedirectUri for callback completion, and a storeProvider.
 *
 * With deviceBinding enabled, JSON POST login selects a verified persistent
 * browser key, callback authenticates the temporary HttpOnly cookie, and
 * exchange/refresh/logout enforce the original key before credential work.
 * A local tokenIssuer must emit exact DPoP and matching cnf.jkt from its verified
 * input. Protect every accepting API separately with
 * createOidcVaultAccessTokenMiddleware and a request-aware validator/replay store.
 * Vault refresh/logout need no access token or ath and work after JWT expiry.
 * All vault responses carry no-store; logout does not revoke stateless JWTs.
 *
 * Construction takes an internal resolved snapshot of `options` without
 * mutating the caller object: normalized values (such as
 * `frontendRedirectUri`) are stored on the snapshot, plain-data containers
 * (`cookie`, `trustedOrigins`, `config`) are shallow-copied, `transactionCookie`
 * is resolved into a detached/frozen security configuration, and service
 * references (`storeProvider`, `hooks`, `tokenIssuer`, `now`) are retained
 * by reference, never deep-cloned. Mutating or replacing the caller options
 * after this call has no effect on the created router. Post-commit hooks
 * (`onSessionCreated`, `onSessionRefreshed`, `onLogout`) are notifications
 * whose failures are reported to `onError` without undoing committed state;
 * other hooks run pre-commit and can veto the operation by throwing.
 * Opt-in `deviceBinding` policy/algorithm containers are frozen snapshots;
 * an enabled nonce secret is copied into private owned storage. Separate opt-in
 * `fingerprintRecognition` settings are detached/frozen; recognition enrolls
 * only at POST login and checks exchange/refresh before credential mutation.
 */
export function createOidcVaultMiddleware(options: OidcVaultOptions): Router {
  const { backendOrigin, config, trustedOrigins, resolvedOptions } = validateOidcVaultOptions(options);
  const rootRouter = express.Router();
  const baseRouter = express.Router();
  const basePath = normalizeOidcVaultBasePath(resolvedOptions.basePath);

  const requestBodyLimit = resolvedOptions.requestBodyLimit ?? DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT;

  // BOV-16: smallest shared credential-response boundary. Setting no-store
  // here covers every vault success/redirect response; the error emitters
  // above re-apply it defensively so error JSON shares the same contract.
  baseRouter.use((_req, res, next) => {
    applyCredentialResponseCachePolicy(res);
    next();
  });
  if (resolvedOptions.deviceBinding !== undefined || resolvedOptions.fingerprintRecognition !== undefined) {
    // Reject other media types before the general form parser: even oversized/
    // many-parameter forms keep POST login's exact JSON-only 415 contract.
    baseRouter.post(
      OIDC_VAULT_ROUTE_PATHS.login,
      createAsyncHandler('login', resolvedOptions, async (req, res, next) => {
        assertLoginInitiationRequest(req, resolvedOptions, trustedOrigins);
        next();
      }),
    );
  }
  baseRouter.use(express.json({ limit: requestBodyLimit }));
  baseRouter.use(
    express.urlencoded({
      extended: false,
      limit: requestBodyLimit,
      parameterLimit: OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT,
    }),
  );
  baseRouter.use(createBodyParserErrorHandler());
  registerRoutes(baseRouter, resolvedOptions, config, trustedOrigins, backendOrigin, basePath);
  rootRouter.use(basePath, baseRouter);

  return rootRouter;
}
