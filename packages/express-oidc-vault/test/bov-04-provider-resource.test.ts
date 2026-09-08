import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';

import { OidcVaultHttpError } from '../src/errors';
import {
  __getProviderClientCacheSizesForTests,
  __resetProviderClientCachesForTests,
  fetchUserInfo,
  requestToken,
  resolveJwks,
  resolveProviderMetadata,
} from '../src/provider-client';
import type { OidcProviderMetadata } from '../src/provider-client';

const originalFetch = globalThis.fetch;
const unhandledRejections: unknown[] = [];

const onUnhandledRejection = (reason: unknown): void => {
  unhandledRejections.push(reason);
};

beforeAll(() => {
  process.on('unhandledRejection', onUnhandledRejection);
});

afterAll(() => {
  process.off('unhandledRejection', onUnhandledRejection);
});

afterEach(() => {
  __resetProviderClientCachesForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  expect(unhandledRejections).toEqual([]);
});

const ISSUER = 'https://issuer.example.com';

const discoveryDocument = (issuer: string): Record<string, string> => ({
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
});

const tokenMetadata = (overrides: Partial<OidcProviderMetadata> = {}): OidcProviderMetadata => ({
  issuer: ISSUER,
  authorizationEndpoint: `${ISSUER}/authorize`,
  tokenEndpoint: `${ISSUER}/token`,
  jwksUri: `${ISSUER}/jwks`,
  userInfoEndpoint: `${ISSUER}/userinfo`,
  clientId: 'client_1',
  scopes: 'openid',
  ...overrides,
});

const createStalledResponse = (status: number): { response: Response; cancelled: { current: boolean } } => {
  const cancelled = { current: false };
  const stream = new ReadableStream<Uint8Array>({
    start() {
      // Headers are available immediately; the body never produces a chunk.
    },
    cancel() {
      cancelled.current = true;
      return Promise.resolve();
    },
  });

  return { response: new Response(stream, { status }), cancelled };
};

/** First body chunk arrives immediately, then the stream stalls forever. */
const createTricklingResponse = (status: number): { response: Response; cancelled: { current: boolean } } => {
  const cancelled = { current: false };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"incomplete": '));
    },
    pull() {
      // Stall forever on the next read; never resolve, never close.
      return new Promise<void>(() => {});
    },
    cancel() {
      cancelled.current = true;
      return Promise.resolve();
    },
  });

  return { response: new Response(stream, { status }), cancelled };
};

const mockStalledFetch = (
  status: number,
  onCall?: () => void,
): { cancelled: { current: boolean }[]; calls: { count: number } } => {
  const cancelled: { current: boolean }[] = [];
  const calls = { count: 0 };

  globalThis.fetch = vi.fn(async () => {
    calls.count += 1;
    onCall?.();
    const stalled = createStalledResponse(status);
    cancelled.push(stalled.cancelled);

    return stalled.response;
  }) as typeof fetch;

  return { cancelled, calls };
};

describe('BOV-04 provider body deadlines', () => {
  it('fails stalled discovery success bodies within the configured bound and cancels the reader', async () => {
    const { cancelled, calls } = mockStalledFetch(200);
    const startedAt = Date.now();

    await expect(
      resolveProviderMetadata(
        { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' },
        { providerRequestTimeoutMs: 50 },
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_DISCOVERY_INVALID',
      message: 'OIDC provider request timed out.',
    });

    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(1_500);
    expect(calls.count).toBe(1);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]?.current).toBe(true);
  });

  it('fails stalled discovery error bodies with the sanitized discovery timeout', async () => {
    mockStalledFetch(500);
    const startedAt = Date.now();

    await expect(
      resolveProviderMetadata(
        { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' },
        { providerRequestTimeoutMs: 50 },
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_DISCOVERY_FAILED',
      message: 'OIDC provider request timed out.',
    });

    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it('fails stalled token success and error bodies within the bound', async () => {
    mockStalledFetch(200);
    const startedAt = Date.now();

    await expect(
      requestToken(
        tokenMetadata(),
        { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
        {
          providerRequestTimeoutMs: 50,
        },
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      message: 'OIDC provider request timed out.',
    });
    expect(Date.now() - startedAt).toBeLessThan(1_500);

    __resetProviderClientCachesForTests();
    mockStalledFetch(400);

    await expect(
      requestToken(
        tokenMetadata(),
        { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
        {
          providerRequestTimeoutMs: 50,
        },
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      message: 'OIDC provider request timed out.',
    });
  });

  it('fails stalled UserInfo success and error bodies within the bound', async () => {
    mockStalledFetch(200);

    await expect(fetchUserInfo(tokenMetadata(), 'access_1', { providerRequestTimeoutMs: 50 })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_USERINFO_FAILED',
      message: 'OIDC provider request timed out.',
    });

    mockStalledFetch(401);

    await expect(fetchUserInfo(tokenMetadata(), 'access_1', { providerRequestTimeoutMs: 50 })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_USERINFO_FAILED',
      message: 'OIDC provider request timed out.',
    });
  });

  it('fails slow-trickle token bodies within the bound and leaves later requests usable', async () => {
    const trickling = createTricklingResponse(200);
    const cancelled = [trickling.cancelled];
    globalThis.fetch = vi.fn(async () => trickling.response) as typeof fetch;
    const startedAt = Date.now();

    await expect(
      requestToken(
        tokenMetadata(),
        { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
        {
          providerRequestTimeoutMs: 60,
        },
      ),
    ).rejects.toMatchObject({ code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED' });
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(cancelled[0]?.current).toBe(true);

    // No leaked timer/reader may poison the next exchange.
    globalThis.fetch = vi.fn(async () =>
      Response.json({ access_token: 'access_2', token_type: 'Bearer' }),
    ) as typeof fetch;

    const json = await requestToken(
      tokenMetadata(),
      { grant_type: 'refresh_token', refresh_token: 'refresh_1' },
      { providerRequestTimeoutMs: 1_000 },
    );
    expect(json).toMatchObject({ access_token: 'access_2' });
  });
});

describe('BOV-04 timeout validation and policy isolation', () => {
  it('validates timeout options before cached discovery lookups', async () => {
    let discoveryRequests = 0;
    globalThis.fetch = vi.fn(async () => {
      discoveryRequests += 1;

      return Response.json(discoveryDocument(ISSUER));
    }) as typeof fetch;

    await resolveProviderMetadata(
      { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' },
      { providerRequestTimeoutMs: 1_000 },
    );
    expect(discoveryRequests).toBe(1);

    await expect(
      resolveProviderMetadata(
        { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' },
        { providerRequestTimeoutMs: 0 },
      ),
    ).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_CONFIG',
      message: 'providerRequestTimeoutMs must be a positive finite integer.',
    });
    expect(discoveryRequests).toBe(1);
  });

  it('validates timeout options before cached JWKS lookups', () => {
    resolveJwks(`${ISSUER}/jwks`, { providerRequestTimeoutMs: 1_000 });

    expect(() => resolveJwks(`${ISSUER}/jwks`, { providerRequestTimeoutMs: 0 })).toThrow(
      'providerRequestTimeoutMs must be a positive finite integer.',
    );
  });

  it('isolates JWKS resolvers by timeout in either creation order', () => {
    const uri = `${ISSUER}/jwks`;

    const shortFirst = resolveJwks(uri, { providerRequestTimeoutMs: 50 });
    const longAfter = resolveJwks(uri, { providerRequestTimeoutMs: 5_000 });
    expect(shortFirst).not.toBe(longAfter);
    expect(resolveJwks(uri, { providerRequestTimeoutMs: 50 })).toBe(shortFirst);
    expect(resolveJwks(uri, { providerRequestTimeoutMs: 5_000 })).toBe(longAfter);

    __resetProviderClientCachesForTests();

    const longFirst = resolveJwks(uri, { providerRequestTimeoutMs: 5_000 });
    const shortAfter = resolveJwks(uri, { providerRequestTimeoutMs: 50 });
    expect(longFirst).not.toBe(shortAfter);
    expect(resolveJwks(uri, { providerRequestTimeoutMs: 5_000 })).toBe(longFirst);
    expect(resolveJwks(uri, { providerRequestTimeoutMs: 50 })).toBe(shortAfter);
  });

  it('honors differing discovery deadlines in either creation order with isolated fetches', async () => {
    for (const order of ['short-first', 'long-first'] as const) {
      __resetProviderClientCachesForTests();
      let calls = 0;

      globalThis.fetch = vi.fn(
        (input, init) =>
          new Promise<Response>((resolve, reject) => {
            calls += 1;
            const timer = setTimeout(() => resolve(Response.json(discoveryDocument(ISSUER))), 150);
            init?.signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
              },
              { once: true },
            );
            void input;
          }),
      ) as typeof fetch;

      const shortOptions = { providerRequestTimeoutMs: 60 };
      const longOptions = { providerRequestTimeoutMs: 2_000 };
      const config = { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' } as const;

      const first =
        order === 'short-first'
          ? resolveProviderMetadata(config, shortOptions)
          : resolveProviderMetadata(config, longOptions);
      const second =
        order === 'short-first'
          ? resolveProviderMetadata(config, longOptions)
          : resolveProviderMetadata(config, shortOptions);

      const [firstResult, secondResult] = await Promise.allSettled([first, second]);
      const shortResult = order === 'short-first' ? firstResult : secondResult;
      const longResult = order === 'short-first' ? secondResult : firstResult;

      expect(shortResult.status).toBe('rejected');
      expect((shortResult as PromiseRejectedResult).reason).toMatchObject({
        code: 'OIDC_VAULT_DISCOVERY_FAILED',
        message: 'OIDC provider request timed out.',
      });
      expect(longResult.status).toBe('fulfilled');
      // Isolated per-policy fetches: one per timeout, regardless of start order.
      expect(calls).toBe(2);
    }
  });

  it('shares settled discovery successes across timeouts without extra requests', async () => {
    let discoveryRequests = 0;
    globalThis.fetch = vi.fn(async () => {
      discoveryRequests += 1;

      return Response.json(discoveryDocument(ISSUER));
    }) as typeof fetch;

    const config = { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' } as const;
    await resolveProviderMetadata(config, { providerRequestTimeoutMs: 1_000 });
    await resolveProviderMetadata(config, { providerRequestTimeoutMs: 100 });
    await resolveProviderMetadata(config, { providerRequestTimeoutMs: 1_000 });

    expect(discoveryRequests).toBe(1);
  });

  it('shares in-flight discovery within one policy and evicts failures for retry', async () => {
    let discoveryRequests = 0;
    globalThis.fetch = vi.fn(async () => {
      discoveryRequests += 1;

      if (discoveryRequests === 1) {
        return new Response('temporary failure', { status: 503 });
      }

      return Response.json(discoveryDocument(ISSUER));
    }) as typeof fetch;

    const config = { mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' } as const;
    const options = { providerRequestTimeoutMs: 1_000 };

    await expect(resolveProviderMetadata(config, options)).rejects.toMatchObject({
      code: 'OIDC_VAULT_DISCOVERY_FAILED',
    });
    await resolveProviderMetadata(config, options);
    await resolveProviderMetadata(config, options);

    expect(discoveryRequests).toBe(2);

    // Concurrent same-policy callers share one in-flight fetch.
    __resetProviderClientCachesForTests();
    discoveryRequests = 0;
    globalThis.fetch = vi.fn(async () => {
      discoveryRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));

      return Response.json(discoveryDocument(ISSUER));
    }) as typeof fetch;

    await Promise.all([resolveProviderMetadata(config, options), resolveProviderMetadata(config, options)]);
    expect(discoveryRequests).toBe(1);
  });

  it('keeps cache capacities bounded', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const issuer = new URL(input as string).origin;

      return Response.json(discoveryDocument(issuer));
    }) as typeof fetch;

    for (let index = 0; index < 40; index += 1) {
      const issuer = `https://issuer-${index}.example.com`;
      await resolveProviderMetadata({ mode: 'discovery', issuer, clientId: 'client_1', scopes: 'openid' });
      resolveJwks(`${issuer}/jwks`);
    }

    const sizes = __getProviderClientCacheSizesForTests();
    expect(sizes.discovery).toBeLessThanOrEqual(32);
    expect(sizes.jwks).toBe(32);
  });
});

describe('BOV-04 real JWKS fetch bounds (JOSE transport evidence)', () => {
  type RouteState = {
    hits: Record<string, number>;
    closedStalledResponse: boolean;
  };

  const startServer = async (
    handler: (req: IncomingMessage, res: ServerResponse, state: RouteState) => void,
  ): Promise<{ baseUrl: string; state: RouteState; close: () => Promise<void> }> => {
    const state: RouteState = { hits: {}, closedStalledResponse: false };
    const server: Server = createServer((req, res) => handler(req, res, state));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (typeof address !== 'object' || address === null) {
      throw new Error('Test server did not bind to a port.');
    }

    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      state,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    };
  };

  it('times out a stalled JWKS body, uses manual redirects, and bounds oversized/many-key documents', async () => {
    const { publicKey } = await generateKeyPair('RS256');
    const exported = await exportJWK(publicKey);
    const honestJwks = { keys: [{ ...exported, kid: 'honest-key', use: 'sig' }] };
    const manyKeys = {
      keys: Array.from({ length: 101 }, (_, index) => ({ kty: 'RSA', kid: `key-${index}` })),
    };

    const server = await startServer((req, res, state) => {
      const url = req.url ?? '/';
      state.hits[url] = (state.hits[url] ?? 0) + 1;

      if (url === '/stalled') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.flushHeaders();
        res.on('close', () => {
          state.closedStalledResponse = true;
        });

        return;
      }

      if (url === '/redirect') {
        res.writeHead(302, { location: '/honest' });
        res.end();

        return;
      }

      if (url === '/honest') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(honestJwks));

        return;
      }

      if (url === '/oversized') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(`{"keys":[],"padding":"${'x'.repeat(1_100_000)}"}`);

        return;
      }

      if (url === '/many-keys') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(manyKeys));

        return;
      }

      res.writeHead(404);
      res.end();
    });

    try {
      // JOSE finding: `timeoutDuration` (AbortSignal.timeout) covers headers
      // plus body; `redirect: 'manual'` with a 200-only check bounds
      // redirects; byte-size and key-count are unbounded in JOSE and enforced
      // by the package customFetch wrapper.
      const stalledStartedAt = Date.now();
      const stalled = resolveJwks(`${server.baseUrl}/stalled`, { providerRequestTimeoutMs: 100 });
      const stalledError = await stalled.reload().then(
        () => {
          throw new Error('Expected stalled JWKS reload to reject.');
        },
        (error: unknown) => error,
      );
      const stalledIsBounded =
        (stalledError instanceof OidcVaultHttpError && stalledError.code === 'OIDC_VAULT_JWKS_FAILED') ||
        (stalledError instanceof Error &&
          (stalledError.name === 'JWKSTimeout' || stalledError.name === 'TimeoutError'));
      expect(stalledIsBounded).toBe(true);
      expect(Date.now() - stalledStartedAt).toBeLessThan(2_000);
      for (let attempt = 0; attempt < 50 && !server.state.closedStalledResponse; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(server.state.closedStalledResponse).toBe(true);

      const redirect = resolveJwks(`${server.baseUrl}/redirect`, { providerRequestTimeoutMs: 2_000 });
      await expect(redirect.reload()).rejects.toThrow(/Expected 200 OK/);
      expect(server.state.hits['/honest'] ?? 0).toBe(0);

      const oversized = resolveJwks(`${server.baseUrl}/oversized`, { providerRequestTimeoutMs: 2_000 });
      await expect(oversized.reload()).rejects.toMatchObject({
        code: 'OIDC_VAULT_JWKS_FAILED',
      });

      const many = resolveJwks(`${server.baseUrl}/many-keys`, { providerRequestTimeoutMs: 2_000 });
      await expect(many.reload()).rejects.toMatchObject({
        code: 'OIDC_VAULT_JWKS_FAILED',
        message: 'JSON Web Key Set contains too many keys.',
      });

      const honest = resolveJwks(`${server.baseUrl}/honest`, { providerRequestTimeoutMs: 2_000 });
      await honest.reload();
      expect(honest.jwks()?.keys).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});
