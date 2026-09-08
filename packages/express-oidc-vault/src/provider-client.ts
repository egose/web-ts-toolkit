import { createRemoteJWKSet, customFetch } from 'jose';

import type { OidcVaultResolvedConfig } from './config';
import { OidcVaultHttpError, getRequiredFiniteNonNegativeInteger, getRequiredString } from './errors';
import type { OidcVaultOptions } from './types';
import type { FetchImplementation } from 'jose/jwks/remote';

export type OidcProviderMetadata = {
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

export type OidcTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
  [key: string]: unknown;
};

export type OidcUserInfoResponse = Record<string, unknown>;

type DiscoveredOidcProviderMetadata = Omit<OidcProviderMetadata, 'clientId' | 'clientSecret' | 'scopes'>;

type DiscoveryCacheEntry = {
  expiresAt: number;
  promise: Promise<DiscoveredOidcProviderMetadata>;
};

export type ProviderRequestOptions = Pick<OidcVaultOptions, 'providerRequestTimeoutMs'>;

const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_DISCOVERY_CACHE_TTL_MS = 10 * 60_000;
const DEFAULT_DISCOVERY_CACHE_CAPACITY = 32;
const DEFAULT_JWKS_CACHE_CAPACITY = 32;
const DEFAULT_PROVIDER_ERROR_BODY_LIMIT = 1_024;
const DEFAULT_PROVIDER_JSON_BODY_LIMIT = 1024 * 1024;
/** Byte-size bound enforced by the package JWKS transport wrapper (JOSE itself has none). */
const DEFAULT_JWKS_BODY_LIMIT = 1024 * 1024;
/**
 * Key-count bound enforced by the package JWKS transport wrapper.
 *
 * JOSE selects keys without limiting how many the document may contain; the
 * byte-size bound alone still permits thousands of tiny keys that cost CPU at
 * import time. 100 comfortably covers production sets while keeping a hostile
 * document bounded.
 */
const DEFAULT_JWKS_MAX_KEYS = 100;

const discoveryCache = new Map<string, DiscoveryCacheEntry>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Require exact discovered-issuer equality under the documented
 * input-whitespace policy.
 *
 * The configured issuer is already trimmed and preserved verbatim by the
 * config resolver (no trailing-slash normalization), so `/tenant`,
 * `/tenant/`, and `/tenant//` are distinct identifiers here. The discovered
 * issuer is compared exactly with no normalization of its own.
 */
const assertDiscoveredIssuerMatchesConfig = (configuredIssuer: string, discoveredIssuer: string): void => {
  let discoveredUrl: URL;

  try {
    discoveredUrl = new URL(discoveredIssuer);
  } catch {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_DISCOVERY_INVALID',
      'OIDC discovery response issuer must be an absolute HTTP(S) URL.',
    );
  }

  if (
    (discoveredUrl.protocol !== 'https:' && discoveredUrl.protocol !== 'http:') ||
    discoveredUrl.origin === 'null' ||
    discoveredUrl.username !== '' ||
    discoveredUrl.password !== '' ||
    discoveredUrl.search !== '' ||
    discoveredUrl.hash !== ''
  ) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_DISCOVERY_INVALID',
      'OIDC discovery response issuer must be an http(s) URL without userinfo, query, or fragment.',
    );
  }

  if (configuredIssuer !== discoveredIssuer) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_DISCOVERY_INVALID',
      'OIDC discovery response issuer does not match the configured issuer.',
    );
  }
};

const validateDiscoveredHttpUrl = (value: string, fieldName: string): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_DISCOVERY_INVALID',
      `OIDC discovery response ${fieldName} must be an absolute HTTP(S) URL.`,
    );
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === 'null') {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_DISCOVERY_INVALID',
      `OIDC discovery response ${fieldName} must use http or https.`,
    );
  }

  return url.toString();
};

export const buildWellKnownUrl = (issuer: string): URL => {
  const normalizedIssuer = issuer.endsWith('/') ? issuer : `${issuer}/`;
  return new URL('.well-known/openid-configuration', normalizedIssuer);
};

const getProviderRequestTimeoutMs = (options: ProviderRequestOptions = {}): number => {
  const timeout = options.providerRequestTimeoutMs ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;

  if (!Number.isFinite(timeout) || !Number.isInteger(timeout) || timeout <= 0) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_INVALID_CONFIG',
      'providerRequestTimeoutMs must be a positive finite integer.',
    );
  }

  return timeout;
};

const evictOldestEntry = <T>(cache: Map<string, T>, capacity: number): void => {
  while (cache.size > capacity) {
    const oldestKey = cache.keys().next().value;

    if (typeof oldestKey !== 'string') {
      return;
    }

    cache.delete(oldestKey);
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

const createProviderTimeoutError = (errorCode: string): OidcVaultHttpError =>
  new OidcVaultHttpError(502, errorCode, 'OIDC provider request timed out.');

type ProviderFetchState = {
  response: Response;
  /** Abort signal armed at the provider deadline; stays active through body consumption. */
  signal: AbortSignal;
  /** Clears the deadline timer. Call exactly once after body consumption/cleanup. */
  done: () => void;
};

const fetchProvider = async (
  input: string | URL,
  init: RequestInit | undefined,
  errorCode: string,
  options: ProviderRequestOptions,
): Promise<ProviderFetchState> => {
  const timeoutMs = getProviderRequestTimeoutMs(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const done = (): void => clearTimeout(timeout);

  try {
    const response = await fetch(input, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    // Timer intentionally stays armed: the caller keeps `signal` active while
    // reading the body and calls `done()` in a finally block after cleanup.
    return { response, signal: controller.signal, done };
  } catch (error) {
    done();

    if (controller.signal.aborted || isAbortError(error)) {
      throw createProviderTimeoutError(errorCode);
    }

    throw error;
  }
};

const throwBoundedReadTimeout = (errorCode: string, timeoutAsTimeoutError: boolean): never => {
  if (timeoutAsTimeoutError) {
    const timeoutError = new Error('JSON Web Key Set request timed out.');
    timeoutError.name = 'TimeoutError';
    throw timeoutError;
  }

  throw createProviderTimeoutError(errorCode);
};

const readBoundedResponseText = async (
  response: Response,
  limit: number,
  errorCode: string,
  options: { truncate?: boolean; signal?: AbortSignal; timeoutAsTimeoutError?: boolean } = {},
): Promise<string> => {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const { signal } = options;
  let size = 0;
  let text = '';

  let onAbort: (() => void) | undefined;
  let abortPromise: Promise<never> | undefined;

  if (signal) {
    if (signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        // Cancel is best-effort cleanup; the timeout error below is authoritative.
      }
      reader.releaseLock();
      throwBoundedReadTimeout(errorCode, options.timeoutAsTimeoutError === true);
    }

    abortPromise = new Promise<never>((_resolve, reject) => {
      onAbort = (): void => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    // Permanent noop handler so a late abort after the read loop settles
    // cannot surface as an unhandled rejection; the race below still observes
    // the rejection while it is pending.
    abortPromise.catch(() => {});
  }

  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;

      try {
        result = abortPromise === undefined ? await reader.read() : await Promise.race([reader.read(), abortPromise]);
      } catch (error) {
        if (signal?.aborted === true || isAbortError(error)) {
          try {
            await reader.cancel();
          } catch {
            // Cancel is best-effort cleanup; the timeout error below is authoritative.
          }
          throwBoundedReadTimeout(errorCode, options.timeoutAsTimeoutError === true);
        }

        throw error;
      }

      if (result.done) {
        break;
      }

      size += result.value.byteLength;

      if (size > limit) {
        try {
          await reader.cancel();
        } catch {
          // Cancel is best-effort cleanup; the size error below is authoritative.
        }

        if (options.truncate === true) {
          return `${text.slice(0, limit)}...`;
        }

        throw new OidcVaultHttpError(502, errorCode, 'OIDC provider response is too large.');
      }

      text += decoder.decode(result.value, { stream: true });
    }
  } finally {
    if (signal !== undefined && onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort);
    }
    reader.releaseLock();
  }

  return `${text}${decoder.decode()}`;
};

export const __resetProviderClientCachesForTests = (): void => {
  discoveryCache.clear();
  jwksCache.clear();
};

export const __getProviderClientCacheSizesForTests = (): { discovery: number; jwks: number } => ({
  discovery: discoveryCache.size,
  jwks: jwksCache.size,
});

/**
 * Package JWKS fetch wrapper: preserves the JOSE timeout signal and manual
 * redirect handling while adding the byte-size and key-count bounds JOSE
 * omits (JOSE reads the body with unbounded `response.json()` and selects
 * keys without limiting the document size).
 */
const createBoundedJwksFetch = (timeoutMs: number): FetchImplementation => {
  void timeoutMs;

  return async (url, { headers, method, redirect, signal }) => {
    let response: Response;

    try {
      response = await fetch(url, { method, headers, redirect, signal });
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        const timeoutError = new Error('JSON Web Key Set request timed out.');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }

      throw error;
    }

    if (response.status !== 200) {
      try {
        await response.body?.cancel();
      } catch {
        // Cleanup is best-effort; JOSE reports the non-200 status below.
      }

      return response;
    }

    const text = await readBoundedResponseText(response, DEFAULT_JWKS_BODY_LIMIT, 'OIDC_VAULT_JWKS_FAILED', {
      signal,
      timeoutAsTimeoutError: true,
    });

    try {
      const parsed = JSON.parse(text) as { keys?: unknown };

      if (Array.isArray(parsed.keys) && parsed.keys.length > DEFAULT_JWKS_MAX_KEYS) {
        throw new OidcVaultHttpError(502, 'OIDC_VAULT_JWKS_FAILED', 'JSON Web Key Set contains too many keys.');
      }
    } catch (error) {
      if (error instanceof OidcVaultHttpError) {
        throw error;
      }
      // Malformed JSON is left for JOSE's own `response.json()` parse error so
      // the failure contract matches an unwrapped resolver.
    }

    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
};

/**
 * Resolve (and cache) a JOSE remote JWKS resolver for `jwksUri`.
 *
 * Resolvers are isolated by `(jwksUri, providerRequestTimeoutMs)`: JOSE fixes
 * the fetch timeout at creation time, so sharing one resolver across
 * differing timeouts would silently apply the first caller's deadline to
 * later callers. Timeout options are validated before the cache lookup so a
 * cached entry can never bypass option validation. The outer map stays
 * bounded (32 entries, oldest-entry eviction); JOSE additionally cools down
 * and revalidates upstream per `cooldownDuration`/`cacheMaxAge`.
 */
export const resolveJwks = (
  jwksUri: string,
  options: ProviderRequestOptions = {},
): ReturnType<typeof createRemoteJWKSet> => {
  const timeoutMs = getProviderRequestTimeoutMs(options);
  const cacheKey = `${jwksUri}\u0000${timeoutMs}`;
  let jwks = jwksCache.get(cacheKey);

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri), {
      timeoutDuration: timeoutMs,
      cacheMaxAge: DEFAULT_DISCOVERY_CACHE_TTL_MS,
      [customFetch]: createBoundedJwksFetch(timeoutMs),
    });
    jwksCache.set(cacheKey, jwks);
    evictOldestEntry(jwksCache, DEFAULT_JWKS_CACHE_CAPACITY);
  }

  return jwks;
};

const formEncodeClientCredential = (value: string): string =>
  new URLSearchParams([[value, '']]).toString().slice(0, -1);

const toBasicAuthorization = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${formEncodeClientCredential(clientId)}:${formEncodeClientCredential(clientSecret)}`).toString('base64')}`;

/**
 * Require a non-null, non-array JSON object at the shared provider boundary.
 *
 * Valid non-object JSON (`null`, arrays, strings, booleans, numbers) is a
 * controlled provider error, not an incidental `TypeError` at the call site.
 */
const isProviderJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readJsonResponse = async (
  response: globalThis.Response,
  errorCode: string,
  invalidJsonMessage = 'OIDC provider returned invalid JSON.',
  readOptions: { signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> => {
  const text = await readBoundedResponseText(response, DEFAULT_PROVIDER_JSON_BODY_LIMIT, errorCode, {
    signal: readOptions.signal,
  });

  if (!text) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // Never forward the upstream status: malformed bodies are a 502 provider
    // failure regardless of the upstream status code.
    throw new OidcVaultHttpError(502, errorCode, invalidJsonMessage, invalidJsonMessage);
  }

  if (!isProviderJsonObject(parsed)) {
    throw new OidcVaultHttpError(502, errorCode, invalidJsonMessage, invalidJsonMessage);
  }

  return parsed;
};

/**
 * Drain a non-success provider body under the live deadline and return a
 * stable upstream-failure error.
 *
 * Success/error bodies share one status policy: non-2xx token/UserInfo
 * responses always surface 502 with a sanitized message, regardless of
 * whether the upstream body is JSON or HTML. Upstream redirects are never
 * followed (`redirect: 'manual'`), so a 302 here must not become a
 * browser-facing 3xx. Bodies and upstream statuses are never leaked.
 */
const drainProviderErrorBody = async (
  response: globalThis.Response,
  signal: AbortSignal,
  errorCode: string,
): Promise<void> => {
  try {
    await readBoundedResponseText(response, DEFAULT_PROVIDER_JSON_BODY_LIMIT, errorCode, { signal });
  } catch (error) {
    // Timeout/size failures already carry the endpoint-specific code; the
    // stable failure below only covers bodies that drain cleanly.
    if (error instanceof OidcVaultHttpError) {
      throw error;
    }

    throw error;
  }
};

async function discoverIssuerMetadata(
  issuer: string,
  options: ProviderRequestOptions,
): Promise<DiscoveredOidcProviderMetadata> {
  // Validate before any cache lookup so cached entries cannot bypass option
  // validation. Fetches are isolated by `(issuer, providerRequestTimeoutMs)`
  // so differing instance policies never inherit each other's deadline in
  // either creation order; a settled success is additionally shared under the
  // bare issuer key for timeout-independent metadata reuse. Failures evict
  // only the owning policy entry, so a later retry can refetch.
  const callerTimeoutMs = getProviderRequestTimeoutMs(options);
  const policyKey = `${issuer}\u0000${callerTimeoutMs}`;
  const now = Date.now();
  const policyCached = discoveryCache.get(policyKey);
  let discoveryPromise = policyCached !== undefined && policyCached.expiresAt > now ? policyCached.promise : undefined;

  if (policyCached !== undefined && discoveryPromise === undefined) {
    discoveryCache.delete(policyKey);
  }

  if (discoveryPromise === undefined) {
    const sharedCached = discoveryCache.get(issuer);
    const sharedPromise = sharedCached !== undefined && sharedCached.expiresAt > now ? sharedCached.promise : undefined;

    if (sharedCached !== undefined && sharedPromise === undefined) {
      discoveryCache.delete(issuer);
    }

    if (sharedPromise !== undefined) {
      return sharedPromise;
    }

    discoveryPromise = (async () => {
      const discoveryUrl = buildWellKnownUrl(issuer);
      const { response, signal, done } = await fetchProvider(
        discoveryUrl,
        undefined,
        'OIDC_VAULT_DISCOVERY_FAILED',
        options,
      );

      try {
        if (!response.ok) {
          const errorText = await readBoundedResponseText(
            response,
            DEFAULT_PROVIDER_ERROR_BODY_LIMIT,
            'OIDC_VAULT_DISCOVERY_FAILED',
            {
              truncate: true,
              signal,
            },
          );
          throw new OidcVaultHttpError(
            502,
            'OIDC_VAULT_DISCOVERY_FAILED',
            errorText || `OIDC discovery failed with status ${response.status}.`,
            'OIDC discovery failed.',
          );
        }

        const discovered = await readJsonResponse(
          response,
          'OIDC_VAULT_DISCOVERY_INVALID',
          'OIDC discovery response is malformed JSON.',
          { signal },
        );

        const authorizationEndpoint = validateDiscoveredHttpUrl(
          getRequiredString(
            discovered.authorization_endpoint,
            'OIDC discovery response is missing authorization_endpoint.',
            'OIDC_VAULT_DISCOVERY_INVALID',
            502,
          ),
          'authorization_endpoint',
        );
        const tokenEndpoint = validateDiscoveredHttpUrl(
          getRequiredString(
            discovered.token_endpoint,
            'OIDC discovery response is missing token_endpoint.',
            'OIDC_VAULT_DISCOVERY_INVALID',
            502,
          ),
          'token_endpoint',
        );
        const jwksUri = validateDiscoveredHttpUrl(
          getRequiredString(
            discovered.jwks_uri,
            'OIDC discovery response is missing jwks_uri.',
            'OIDC_VAULT_DISCOVERY_INVALID',
            502,
          ),
          'jwks_uri',
        );

        const discoveredIssuer = getRequiredString(
          discovered.issuer,
          'OIDC discovery response is missing issuer.',
          'OIDC_VAULT_DISCOVERY_INVALID',
          502,
        );

        assertDiscoveredIssuerMatchesConfig(issuer, discoveredIssuer);

        return {
          issuer: discoveredIssuer,
          authorizationEndpoint,
          tokenEndpoint,
          jwksUri,
          userInfoEndpoint:
            typeof discovered.userinfo_endpoint === 'string'
              ? validateDiscoveredHttpUrl(discovered.userinfo_endpoint, 'userinfo_endpoint')
              : undefined,
          endSessionEndpoint:
            typeof discovered.end_session_endpoint === 'string'
              ? validateDiscoveredHttpUrl(discovered.end_session_endpoint, 'end_session_endpoint')
              : undefined,
        } satisfies DiscoveredOidcProviderMetadata;
      } finally {
        done();
        // Best-effort stream cleanup so a validation failure after headers
        // cannot leave a stalled body holding the socket open.
        try {
          await response.body?.cancel();
        } catch {
          // Cleanup is best-effort; the parsed result or thrown error above wins.
        }
      }
    })();

    discoveryPromise.then(
      () => {
        const fetchedAt = Date.now();
        // Share settled successes across timeout policies; failures never
        // reach here (the catch below evicts the policy entry instead).
        discoveryCache.set(issuer, {
          expiresAt: fetchedAt + DEFAULT_DISCOVERY_CACHE_TTL_MS,
          promise: discoveryPromise as Promise<DiscoveredOidcProviderMetadata>,
        });
        evictOldestEntry(discoveryCache, DEFAULT_DISCOVERY_CACHE_CAPACITY);
      },
      () => {},
    );
    discoveryCache.set(policyKey, {
      expiresAt: now + DEFAULT_DISCOVERY_CACHE_TTL_MS,
      promise: discoveryPromise,
    });
    evictOldestEntry(discoveryCache, DEFAULT_DISCOVERY_CACHE_CAPACITY);
    discoveryPromise.catch(() => {
      if (discoveryCache.get(policyKey)?.promise === discoveryPromise) {
        discoveryCache.delete(policyKey);
      }
    });
  }

  return discoveryPromise as Promise<DiscoveredOidcProviderMetadata>;
}

export async function resolveProviderMetadata(
  config: OidcVaultResolvedConfig,
  options: ProviderRequestOptions = {},
): Promise<OidcProviderMetadata> {
  if (config.mode === 'manual') {
    if (!config.issuer) {
      throw new OidcVaultHttpError(500, 'OIDC_VAULT_INVALID_CONFIG', 'Manual OIDC configuration requires issuer.');
    }

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

  if (!config.issuer) {
    throw new OidcVaultHttpError(500, 'OIDC_VAULT_INVALID_CONFIG', 'Issuer discovery requires an issuer URL.');
  }

  return {
    ...(await discoverIssuerMetadata(config.issuer, options)),
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scopes: config.scopes,
  };
}

export async function requestToken(
  metadata: OidcProviderMetadata,
  params: Record<string, string | undefined>,
  options: ProviderRequestOptions = {},
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

  const { response, signal, done } = await fetchProvider(
    metadata.tokenEndpoint,
    {
      method: 'POST',
      headers,
      body,
    },
    'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    options,
  );

  try {
    if (!response.ok) {
      await drainProviderErrorBody(response, signal, 'OIDC_VAULT_TOKEN_REQUEST_FAILED');
      throw new OidcVaultHttpError(
        502,
        'OIDC_VAULT_TOKEN_REQUEST_FAILED',
        'OIDC token request failed.',
        'OIDC token request failed.',
      );
    }

    const json = await readJsonResponse(response, 'OIDC_VAULT_TOKEN_REQUEST_FAILED', undefined, { signal });

    return json as OidcTokenResponse;
  } finally {
    done();
    try {
      await response.body?.cancel();
    } catch {
      // Cleanup is best-effort; the parsed result or thrown error above wins.
    }
  }
}

const assertPresentTokenStringField = (
  tokenResponse: OidcTokenResponse,
  field: 'access_token' | 'id_token' | 'refresh_token',
): void => {
  const value = tokenResponse[field];

  if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_INVALID_TOKEN_RESPONSE',
      `OIDC token response ${field} must be a non-empty string when present.`,
    );
  }
};

export function validateTokenResponse(tokenResponse: OidcTokenResponse): void {
  if (typeof tokenResponse.token_type !== 'string' || tokenResponse.token_type.toLowerCase() !== 'bearer') {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_INVALID_TOKEN_RESPONSE',
      'OIDC token response token_type must be Bearer.',
    );
  }

  if (tokenResponse.expires_in !== undefined) {
    getRequiredFiniteNonNegativeInteger(
      tokenResponse.expires_in,
      'OIDC token response expires_in must be a finite non-negative integer.',
      'OIDC_VAULT_INVALID_TOKEN_RESPONSE',
    );
  }

  // Present credential fields must have the right type: a malformed
  // `access_token`/`id_token`/`refresh_token` is rejected, never treated as
  // an omission. `undefined` (absent) remains an omission handled per flow.
  assertPresentTokenStringField(tokenResponse, 'access_token');
  assertPresentTokenStringField(tokenResponse, 'id_token');
  assertPresentTokenStringField(tokenResponse, 'refresh_token');

  if (tokenResponse.scope !== undefined && typeof tokenResponse.scope !== 'string') {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_INVALID_TOKEN_RESPONSE',
      'OIDC token response scope must be a string when present.',
    );
  }
}

/**
 * Callback (authorization-code) requirements: a new session is persisted, so
 * `id_token` and `refresh_token` are required. Present optional credentials
 * are still type-checked by the shared base validator.
 */
export function validateCallbackTokenResponse(tokenResponse: OidcTokenResponse): void {
  validateTokenResponse(tokenResponse);

  if (typeof tokenResponse.id_token !== 'string' || tokenResponse.id_token.length === 0) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_MISSING_ID_TOKEN', 'OIDC token response is missing id_token.');
  }

  if (typeof tokenResponse.refresh_token !== 'string' || tokenResponse.refresh_token.length === 0) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_MISSING_REFRESH_TOKEN',
      'OIDC token response is missing refresh_token.',
    );
  }
}

/**
 * Refresh requirements: every credential field may be omitted. Omitted
 * `id_token` retains the existing verified identity, omitted `refresh_token`
 * retains the current upstream refresh token, and omitted
 * `access_token`/`scope` retain their current values. Present fields must
 * still have the right type (enforced by the shared base validator).
 */
export function validateRefreshTokenResponse(tokenResponse: OidcTokenResponse): void {
  validateTokenResponse(tokenResponse);
}

export async function fetchUserInfo(
  metadata: OidcProviderMetadata,
  accessToken: string,
  options: ProviderRequestOptions = {},
): Promise<OidcUserInfoResponse> {
  if (!metadata.userInfoEndpoint) {
    return {};
  }

  const { response, signal, done } = await fetchProvider(
    metadata.userInfoEndpoint,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
    'OIDC_VAULT_USERINFO_FAILED',
    options,
  );

  try {
    if (!response.ok) {
      await drainProviderErrorBody(response, signal, 'OIDC_VAULT_USERINFO_FAILED');
      throw new OidcVaultHttpError(
        502,
        'OIDC_VAULT_USERINFO_FAILED',
        'OIDC userinfo request failed.',
        'OIDC userinfo request failed.',
      );
    }

    const json = await readJsonResponse(response, 'OIDC_VAULT_USERINFO_FAILED', undefined, { signal });

    return json;
  } finally {
    done();
    try {
      await response.body?.cancel();
    } catch {
      // Cleanup is best-effort; the parsed result or thrown error above wins.
    }
  }
}
