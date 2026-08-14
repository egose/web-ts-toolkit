import { createRemoteJWKSet } from 'jose';

import type { OidcVaultResolvedConfig } from './config';
import { OidcVaultHttpError, getRequiredFiniteNonNegativeInteger, getRequiredString } from './errors';
import type { OidcVaultOptions } from './types';

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

const discoveryCache = new Map<string, DiscoveryCacheEntry>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const normalizeIssuerForDiscoveryComparison = (issuer: string): string => issuer.replace(/\/+$/g, '');

const assertDiscoveredIssuerMatchesConfig = (configuredIssuer: string, discoveredIssuer: string): void => {
  if (
    normalizeIssuerForDiscoveryComparison(configuredIssuer) !== normalizeIssuerForDiscoveryComparison(discoveredIssuer)
  ) {
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

const fetchProvider = async (
  input: string | URL,
  init: RequestInit | undefined,
  errorCode: string,
  options: ProviderRequestOptions,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProviderRequestTimeoutMs(options));

  try {
    return await fetch(input, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OidcVaultHttpError(502, errorCode, 'OIDC provider request timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const readBoundedResponseText = async (
  response: Response,
  limit: number,
  errorCode: string,
  options: { truncate?: boolean } = {},
): Promise<string> => {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';

  try {
    for (;;) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      size += result.value.byteLength;

      if (size > limit) {
        await reader.cancel();

        if (options.truncate) {
          return `${text.slice(0, limit)}...`;
        }

        throw new OidcVaultHttpError(502, errorCode, 'OIDC provider response is too large.');
      }

      text += decoder.decode(result.value, { stream: true });
    }
  } finally {
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

export const resolveJwks = (
  jwksUri: string,
  options: ProviderRequestOptions = {},
): ReturnType<typeof createRemoteJWKSet> => {
  let jwks = jwksCache.get(jwksUri);

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri), {
      timeoutDuration: getProviderRequestTimeoutMs(options),
      cacheMaxAge: DEFAULT_DISCOVERY_CACHE_TTL_MS,
    });
    jwksCache.set(jwksUri, jwks);
    evictOldestEntry(jwksCache, DEFAULT_JWKS_CACHE_CAPACITY);
  }

  return jwks;
};

const formEncodeClientCredential = (value: string): string =>
  new URLSearchParams([[value, '']]).toString().slice(0, -1);

const toBasicAuthorization = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${formEncodeClientCredential(clientId)}:${formEncodeClientCredential(clientSecret)}`).toString('base64')}`;

export const readJsonResponse = async (
  response: globalThis.Response,
  errorCode: string,
  invalidJsonMessage = 'OIDC provider returned invalid JSON.',
): Promise<Record<string, unknown>> => {
  const text = await readBoundedResponseText(response, DEFAULT_PROVIDER_JSON_BODY_LIMIT, errorCode);

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OidcVaultHttpError(
      response.ok ? 502 : response.status,
      errorCode,
      invalidJsonMessage,
      invalidJsonMessage,
    );
  }
};

async function discoverIssuerMetadata(
  issuer: string,
  options: ProviderRequestOptions,
): Promise<DiscoveredOidcProviderMetadata> {
  const now = Date.now();
  const cached = discoveryCache.get(issuer);
  let discoveryPromise = cached && cached.expiresAt > now ? cached.promise : undefined;

  if (cached && !discoveryPromise) {
    discoveryCache.delete(issuer);
  }

  if (!discoveryPromise) {
    discoveryPromise = (async () => {
      const discoveryUrl = buildWellKnownUrl(issuer);
      const response = await fetchProvider(discoveryUrl, undefined, 'OIDC_VAULT_DISCOVERY_FAILED', options);

      if (!response.ok) {
        const errorText = await readBoundedResponseText(
          response,
          DEFAULT_PROVIDER_ERROR_BODY_LIMIT,
          'OIDC_VAULT_DISCOVERY_FAILED',
          {
            truncate: true,
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
    })();

    discoveryCache.set(issuer, {
      expiresAt: now + DEFAULT_DISCOVERY_CACHE_TTL_MS,
      promise: discoveryPromise,
    });
    evictOldestEntry(discoveryCache, DEFAULT_DISCOVERY_CACHE_CAPACITY);
    discoveryPromise.catch(() => {
      if (discoveryCache.get(issuer)?.promise === discoveryPromise) {
        discoveryCache.delete(issuer);
      }
    });
  }

  return discoveryPromise;
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

  const response = await fetchProvider(
    metadata.tokenEndpoint,
    {
      method: 'POST',
      headers,
      body,
    },
    'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    options,
  );

  const json = await readJsonResponse(response, 'OIDC_VAULT_TOKEN_REQUEST_FAILED');

  if (!response.ok) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      typeof json.error_description === 'string'
        ? json.error_description
        : `OIDC token request failed with status ${response.status}.`,
      'OIDC token request failed.',
    );
  }

  return json as OidcTokenResponse;
}

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
}

export async function fetchUserInfo(
  metadata: OidcProviderMetadata,
  accessToken: string,
  options: ProviderRequestOptions = {},
): Promise<OidcUserInfoResponse> {
  if (!metadata.userInfoEndpoint) {
    return {};
  }

  const response = await fetchProvider(
    metadata.userInfoEndpoint,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
    'OIDC_VAULT_USERINFO_FAILED',
    options,
  );

  const json = await readJsonResponse(response, 'OIDC_VAULT_USERINFO_FAILED');

  if (!response.ok) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_USERINFO_FAILED',
      `OIDC userinfo request failed with status ${response.status}.`,
      'OIDC userinfo request failed.',
    );
  }

  return json;
}
