import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseCookieHeader, resolveCookieOptions, serializeCookie } from '../src/cookies';
import { OidcVaultHttpError } from '../src/errors';
import { resolveBackendOrigin, resolveTrustedOrigins, validatePostLogoutRedirectUri } from '../src/origins';
import {
  __getProviderClientCacheSizesForTests,
  __resetProviderClientCachesForTests,
  readJsonResponse,
  requestToken,
  resolveJwks,
  resolveProviderMetadata,
  validateTokenResponse,
} from '../src/provider-client';
import type { OidcVaultOptions } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  __resetProviderClientCachesForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

const createOptions = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions => ({
  backendOrigin: 'https://api.example.com',
  storeProvider: {} as OidcVaultOptions['storeProvider'],
  config: {
    issuer: 'https://issuer.example.com',
    clientId: 'client_1',
  },
  ...overrides,
});

describe('cookie helpers', () => {
  it('parses encoded cookies and ignores malformed segments', () => {
    expect(parseCookieHeader(' sid = sess_1 ; theme=dark%20mode; no-value; =ignored ')).toEqual({
      sid: 'sess_1',
      theme: 'dark mode',
    });
  });

  it('throws a typed error for malformed encoded cookie values', () => {
    expect(() => parseCookieHeader('sid=%E0%A4%A')).toThrow(OidcVaultHttpError);
  });

  it('resolves cross-site cookie defaults and serializes secure cookies', () => {
    const cookieOptions = resolveCookieOptions(
      createOptions({
        cookie: {
          deploymentMode: 'cross-site',
          name: 'vault',
          domain: '.example.com',
        },
      }),
    );

    expect(cookieOptions).toMatchObject({
      name: 'vault',
      sameSite: 'none',
      secure: true,
      domain: '.example.com',
      path: '/',
      httpOnly: true,
    });
    expect(serializeCookie(cookieOptions.name, 'sess 1', cookieOptions)).toBe(
      'vault=sess%201; Path=/; SameSite=None; HttpOnly; Secure; Domain=.example.com',
    );
  });
});

describe('origin helpers', () => {
  it('normalizes backend and trusted origins', () => {
    expect(resolveBackendOrigin(createOptions({ backendOrigin: 'https://api.example.com/path?x=1' }))).toBe(
      'https://api.example.com',
    );
    expect(
      Array.from(
        resolveTrustedOrigins(
          createOptions({ trustedOrigins: ['https://app.example.com/path', 'https://app.example.com/other'] }),
        ),
      ),
    ).toEqual(['https://app.example.com']);
  });

  it('rejects invalid trusted origins', () => {
    expect(() => resolveTrustedOrigins(createOptions({ trustedOrigins: ['javascript:alert(1)'] }))).toThrow(
      'trustedOrigins entries must use http or https',
    );
  });

  it('rejects invalid post logout redirect URIs', () => {
    expect(() =>
      validatePostLogoutRedirectUri(createOptions({ postLogoutRedirectUri: 'mailto:user@example.com' })),
    ).toThrow('postLogoutRedirectUri must use http or https');
  });
});

describe('token response validation', () => {
  it('accepts bearer token responses with integer expires_in', () => {
    expect(() => validateTokenResponse({ token_type: 'Bearer', expires_in: 300 })).not.toThrow();
  });

  it('rejects invalid token_type and expires_in values', () => {
    expect(() => validateTokenResponse({ token_type: 'mac' })).toThrow(OidcVaultHttpError);
    expect(() => validateTokenResponse({ token_type: 'Bearer', expires_in: 1.5 })).toThrow(OidcVaultHttpError);
  });
});

describe('provider client resource bounds', () => {
  const createDiscoveryResponse = (issuer: string): Response =>
    Response.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
    });

  it('caches successful discovery while retrying failures', async () => {
    const issuer = 'https://issuer.example.com';
    let discoveryRequests = 0;

    globalThis.fetch = vi.fn(async () => {
      discoveryRequests += 1;

      if (discoveryRequests === 1) {
        return new Response('temporary failure', { status: 503 });
      }

      return createDiscoveryResponse(issuer);
    }) as typeof fetch;

    await expect(
      resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' }),
    ).rejects.toThrow(OidcVaultHttpError);
    await resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' });
    await resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' });

    expect(discoveryRequests).toBe(2);
  });

  it('rejects malformed discovered endpoint URLs without caching success', async () => {
    const issuer = 'https://issuer.example.com';
    let discoveryRequests = 0;

    globalThis.fetch = vi.fn(async () => {
      discoveryRequests += 1;

      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: 'not a url',
        jwks_uri: `${issuer}/jwks`,
      });
    }) as typeof fetch;

    await expect(
      resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' }),
    ).rejects.toMatchObject({
      code: 'OIDC_VAULT_DISCOVERY_INVALID',
      message: 'OIDC discovery response token_endpoint must be an absolute HTTP(S) URL.',
    });
    await expect(
      resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' }),
    ).rejects.toMatchObject({
      code: 'OIDC_VAULT_DISCOVERY_INVALID',
    });

    expect(discoveryRequests).toBe(2);
  });

  it('bounds discovery and JWKS resolver cache growth', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const issuer = new URL(input as string).origin;

      return createDiscoveryResponse(issuer);
    }) as typeof fetch;

    for (let index = 0; index < 40; index += 1) {
      const issuer = `https://issuer-${index}.example.com`;
      await resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' });
      resolveJwks(`${issuer}/jwks`);
    }

    expect(__getProviderClientCacheSizesForTests()).toEqual({ discovery: 32, jwks: 32 });
  });

  it('times out provider token requests within the configured bound', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    ) as typeof fetch;

    const result = expect(
      requestToken(
        {
          issuer: 'https://issuer.example.com',
          authorizationEndpoint: 'https://issuer.example.com/authorize',
          tokenEndpoint: 'https://issuer.example.com/token',
          jwksUri: 'https://issuer.example.com/jwks',
          clientId: 'client_1',
          scopes: 'openid',
        },
        { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
        { providerRequestTimeoutMs: 25 },
      ),
    ).rejects.toMatchObject({
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      message: 'OIDC provider request timed out.',
    });

    await vi.advanceTimersByTimeAsync(25);
    await result;
  });

  it('applies provider request timeout validation to JWKS resolution', () => {
    expect(() => resolveJwks('https://issuer.example.com/jwks', { providerRequestTimeoutMs: 0 })).toThrow(
      'providerRequestTimeoutMs must be a positive finite integer.',
    );
  });

  it('uses manual redirect handling for provider requests', async () => {
    let redirectMode: RequestRedirect | undefined;

    globalThis.fetch = vi.fn(async (_input, init) => {
      redirectMode = init?.redirect;

      return new Response('redirect', { status: 302 });
    }) as typeof fetch;

    await expect(
      requestToken(
        {
          issuer: 'https://issuer.example.com',
          authorizationEndpoint: 'https://issuer.example.com/authorize',
          tokenEndpoint: 'https://issuer.example.com/token',
          jwksUri: 'https://issuer.example.com/jwks',
          clientId: 'client_1',
          scopes: 'openid',
        },
        { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
      ),
    ).rejects.toMatchObject({
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    });
    expect(redirectMode).toBe('manual');
  });

  it('form-encodes client credentials before building HTTP Basic authorization', async () => {
    let authorizationHeader: string | undefined;

    globalThis.fetch = vi.fn(async (_input, init) => {
      authorizationHeader = new Headers(init?.headers).get('authorization') ?? undefined;

      return Response.json({ token_type: 'Bearer' });
    }) as typeof fetch;

    await requestToken(
      {
        issuer: 'https://issuer.example.com',
        authorizationEndpoint: 'https://issuer.example.com/authorize',
        tokenEndpoint: 'https://issuer.example.com/token',
        jwksUri: 'https://issuer.example.com/jwks',
        clientId: 'client:id',
        clientSecret: 'secret/value?x=y&z', // pragma: allowlist secret
        scopes: 'openid',
      },
      { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
    );

    expect(authorizationHeader).toBe(
      `Basic ${Buffer.from('client%3Aid:secret%2Fvalue%3Fx%3Dy%26z').toString('base64')}`,
    );
  });

  it('does not include invalid JSON provider bodies in errors', async () => {
    const response = new Response('x'.repeat(4_096), { status: 502 });

    await expect(readJsonResponse(response, 'OIDC_VAULT_TOKEN_REQUEST_FAILED')).rejects.toMatchObject({
      clientMessage: 'OIDC provider returned invalid JSON.',
      message: 'OIDC provider returned invalid JSON.',
    });
  });

  it('rejects oversized provider JSON responses without reading the full body into memory', async () => {
    const chunk = new Uint8Array(1024);
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        controller.enqueue(chunk);
      },
    });

    await expect(readJsonResponse(new Response(body), 'OIDC_VAULT_TOKEN_REQUEST_FAILED')).rejects.toMatchObject({
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      message: 'OIDC provider response is too large.',
    });
    expect(reads).toBeLessThan(1_030);
  });
});
