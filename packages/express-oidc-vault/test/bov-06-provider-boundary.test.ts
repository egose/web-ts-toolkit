import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { OidcVaultHttpError } from '../src/errors';
import { createOidcVaultMiddleware } from '../src/index';
import {
  __resetProviderClientCachesForTests,
  fetchUserInfo,
  readJsonResponse,
  requestToken,
  resolveProviderMetadata,
  validateCallbackTokenResponse,
  validateRefreshTokenResponse,
  validateTokenResponse,
} from '../src/provider-client';
import type { OidcProviderMetadata } from '../src/provider-client';
import { assertUserInfoSubject } from '../src/token-validation';
import type { OidcVaultStoreProvider } from '../src/types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  __resetProviderClientCachesForTests();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

const ISSUER = 'https://issuer.example.com';

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

const NON_OBJECTS: Array<{ name: string; body: string }> = [
  { name: 'null', body: 'null' },
  { name: 'array', body: '[1,2]' },
  { name: 'string', body: '"provider-string"' },
  { name: 'number', body: '42' },
  { name: 'boolean', body: 'true' },
];

describe('BOV-06 shared JSON boundary', () => {
  it.each(NON_OBJECTS)('rejects valid non-object JSON ($name) as a controlled provider error', async ({ body }) => {
    const response = new Response(body, { status: 200 });

    await expect(readJsonResponse(response, 'OIDC_VAULT_TOKEN_REQUEST_FAILED')).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    });
  });

  it.each(NON_OBJECTS)('rejects discovery success bodies ($name) without TypeError leakage', async ({ body }) => {
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as typeof fetch;

    await expect(
      resolveProviderMetadata({ mode: 'discovery', issuer: ISSUER, clientId: 'client_1', scopes: 'openid' }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it.each(NON_OBJECTS)('rejects token success bodies ($name) as controlled failures', async ({ body }) => {
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as typeof fetch;

    await expect(
      requestToken(tokenMetadata(), { grant_type: 'refresh_token', refresh_token: 'r' }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    });
  });

  it.each(NON_OBJECTS)('rejects UserInfo success bodies ($name) as controlled failures', async ({ body }) => {
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as typeof fetch;

    await expect(fetchUserInfo(tokenMetadata(), 'access_1')).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_USERINFO_FAILED',
    });
  });

  it('rejects non-object JSON on token/UserInfo error paths without forwarding upstream status', async () => {
    for (const body of NON_OBJECTS) {
      globalThis.fetch = vi.fn(async () => new Response(body.body, { status: 400 })) as typeof fetch;
      await expect(requestToken(tokenMetadata(), { grant_type: 'code', code: 'c' })).rejects.toMatchObject({
        status: 502,
        code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
        message: 'OIDC token request failed.',
      });

      globalThis.fetch = vi.fn(async () => new Response(body.body, { status: 401 })) as typeof fetch;
      await expect(fetchUserInfo(tokenMetadata(), 'access_1')).rejects.toMatchObject({
        status: 502,
        code: 'OIDC_VAULT_USERINFO_FAILED',
        message: 'OIDC userinfo request failed.',
      });
    }
  });
});

describe('BOV-06 upstream failure status policy', () => {
  const statuses = [302, 400, 401, 429, 503];

  it.each(statuses)('token %i with JSON body surfaces stable 502 without leaking the body', async (status) => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ error: 'upstream_secret_detail' }, { status }),
    ) as typeof fetch;

    const error = await requestToken(tokenMetadata(), { grant_type: 'code', code: 'c' }).catch((e) => e);

    expect(error).toBeInstanceOf(OidcVaultHttpError);
    expect(error.status).toBe(502);
    expect(error.code).toBe('OIDC_VAULT_TOKEN_REQUEST_FAILED');
    expect(error.message).toBe('OIDC token request failed.');
    expect(error.clientMessage).toBe('OIDC token request failed.');
    expect(error.message).not.toContain('upstream_secret_detail');
    expect(error.message).not.toContain(String(status));
  });

  it.each(statuses)('token %i with HTML body surfaces the same stable 502', async (status) => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('<html><body>upstream html failure</body></html>', {
          status,
          headers: { 'content-type': 'text/html' },
        }),
    ) as typeof fetch;

    await expect(requestToken(tokenMetadata(), { grant_type: 'code', code: 'c' })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      message: 'OIDC token request failed.',
    });
  });

  it.each(statuses)('userinfo %i follows the same policy for JSON and HTML bodies', async (status) => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: 'userinfo_secret' }, { status })) as typeof fetch;
    await expect(fetchUserInfo(tokenMetadata(), 'access_1')).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_USERINFO_FAILED',
      message: 'OIDC userinfo request failed.',
    });

    globalThis.fetch = vi.fn(
      async () => new Response('<html>gateway html</html>', { status, headers: { 'content-type': 'text/html' } }),
    ) as typeof fetch;
    const error = await fetchUserInfo(tokenMetadata(), 'access_1').catch((e) => e);

    expect(error.status).toBe(502);
    expect(error.code).toBe('OIDC_VAULT_USERINFO_FAILED');
    expect(error.message).toBe('OIDC userinfo request failed.');
    expect(error.message).not.toContain('gateway html');
  });

  it('never surfaces a browser-facing 3xx for rejected upstream redirects', async () => {
    globalThis.fetch = vi.fn(async () => new Response('redirect', { status: 302 })) as typeof fetch;

    await expect(requestToken(tokenMetadata(), { grant_type: 'code', code: 'c' })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    });
    await expect(fetchUserInfo(tokenMetadata(), 'access_1')).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_USERINFO_FAILED',
    });
  });

  it('maps malformed error JSON to 502 instead of forwarding the upstream status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not-json{{{', { status: 503 })) as typeof fetch;

    await expect(requestToken(tokenMetadata(), { grant_type: 'code', code: 'c' })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    });
  });
});

describe('BOV-06 token field types and callback/refresh requirements', () => {
  const base = { token_type: 'Bearer' };

  it('rejects wrong-type present credential fields instead of treating them as omission', () => {
    for (const override of [
      { access_token: 123 },
      { access_token: null },
      { access_token: '' },
      { id_token: 42 },
      { id_token: {} },
      { refresh_token: 7 },
      { refresh_token: null },
      { scope: 99 },
      { scope: null },
      { expires_in: '3600' },
      { token_type: 123 },
    ]) {
      expect(() => validateTokenResponse({ ...base, ...override } as never)).toThrow(
        expect.objectContaining({ code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE', status: 502 }),
      );
    }
  });

  it('requires id_token and refresh_token for callback but allows refresh omissions', () => {
    expect(() => validateCallbackTokenResponse({ token_type: 'Bearer' })).toThrow(
      expect.objectContaining({ code: 'OIDC_VAULT_MISSING_ID_TOKEN' }),
    );
    expect(() => validateCallbackTokenResponse({ token_type: 'Bearer', id_token: 'id_1' })).toThrow(
      expect.objectContaining({ code: 'OIDC_VAULT_MISSING_REFRESH_TOKEN' }),
    );
    expect(() =>
      validateCallbackTokenResponse({ token_type: 'Bearer', id_token: 'id_1', refresh_token: 'r_1' }),
    ).not.toThrow();

    // Refresh: documented omissions are retained, not rejected.
    expect(() => validateRefreshTokenResponse({ token_type: 'Bearer' })).not.toThrow();
    expect(() =>
      validateRefreshTokenResponse({ token_type: 'Bearer', access_token: 'a_1', scope: 'openid' }),
    ).not.toThrow();
    // ...but present refresh fields are still type-checked.
    expect(() => validateRefreshTokenResponse({ token_type: 'Bearer', refresh_token: 123 } as never)).toThrow(
      expect.objectContaining({ code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' }),
    );
    expect(() => validateRefreshTokenResponse({ token_type: 'Bearer', access_token: 123 } as never)).toThrow(
      expect.objectContaining({ code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' }),
    );
  });

  it('rejects null/array UserInfo without bypassing the subject check', () => {
    for (const userInfo of [null, []]) {
      expect(() => assertUserInfoSubject(userInfo, 'user_1')).toThrow(
        expect.objectContaining({ code: 'OIDC_VAULT_INVALID_USERINFO', status: 502 }),
      );
    }

    expect(() => assertUserInfoSubject({ sub: 'user_2' }, 'user_1')).toThrow(
      expect.objectContaining({ code: 'OIDC_VAULT_INVALID_USERINFO' }),
    );
    expect(() => assertUserInfoSubject({ sub: 'user_1' }, 'user_1')).not.toThrow();
  });
});

describe('BOV-06 persistence/rotation guards', () => {
  const backendOrigin = 'https://api.example.com';
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;
  let createIdToken: ((nonce?: string) => Promise<string>) | undefined;
  let tokenOverride: Record<string, unknown> | undefined;
  let tokenRaw: { status: number; body: string; contentType: string } | undefined;
  let userInfoRaw: { status: number; body: string; contentType: string } | undefined;

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));
    const keyPair = await generateKeyPair('RS256');
    publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'bov-06-key';
    privateKey = keyPair.privateKey;

    createIdToken = async (nonce?: string) => {
      const payload: Record<string, unknown> = { sub: 'user_1', sid: 'provider_sid_1' };

      if (nonce) {
        payload.nonce = nonce;
      }

      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'bov-06-key' })
        .setIssuer(`${issuerBaseUrl}/issuer`)
        .setAudience('client_1')
        .setIssuedAt(Math.floor(Date.now() / 1000))
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(privateKey);
    };

    issuerApp.get('/issuer/.well-known/openid-configuration', (_req, res) => {
      res.json({
        issuer: `${issuerBaseUrl}/issuer`,
        authorization_endpoint: `${issuerBaseUrl}/issuer/authorize`,
        token_endpoint: `${issuerBaseUrl}/issuer/token`,
        userinfo_endpoint: `${issuerBaseUrl}/issuer/userinfo`,
        jwks_uri: `${issuerBaseUrl}/issuer/jwks`,
      });
    });
    issuerApp.get('/issuer/jwks', (_req, res) => {
      res.json({ keys: [publicJwk] });
    });
    issuerApp.post('/issuer/token', async (req, res) => {
      if (tokenRaw) {
        const raw = tokenRaw;
        tokenRaw = undefined;
        res.status(raw.status).type(raw.contentType).send(raw.body);
        return;
      }

      const grantType = req.body.grant_type;

      if (grantType === 'authorization_code' || grantType === 'refresh_token') {
        const code = String(req.body.code ?? '');
        const nonce = code.includes(':') ? code.split(':')[1] : undefined;
        const override = tokenOverride;
        tokenOverride = undefined;
        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_1',
          refresh_token: 'upstream_refresh_1',
          scope: 'openid email profile',
          id_token: await createIdToken!(nonce),
          ...override,
        });
        return;
      }

      res.status(400).json({ error: 'unsupported_grant_type' });
    });
    issuerApp.get('/issuer/userinfo', (_req, res) => {
      if (userInfoRaw) {
        const raw = userInfoRaw;
        userInfoRaw = undefined;
        res.status(raw.status).type(raw.contentType).send(raw.body);
        return;
      }

      res.json({ sub: 'user_1' });
    });

    await new Promise<void>((resolve) => {
      issuerServer = http.createServer(issuerApp).listen(0, '127.0.0.1', () => resolve());
    });
    const address = issuerServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine server address.');
    }

    issuerBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (issuerServer) {
      await new Promise<void>((resolve, reject) => {
        issuerServer!.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  const loginAndCallback = async (app: express.Express) => {
    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);

    return request(app)
      .get('/auth/oidc/callback')
      .query({
        state: authorizationUrl.searchParams.get('state'),
        code: `authcode:${authorizationUrl.searchParams.get('nonce')}`,
      });
  };

  const countingStore = (base: OidcVaultStoreProvider, counts: Record<string, number>): OidcVaultStoreProvider => ({
    createAuthorizationTransaction: base.createAuthorizationTransaction.bind(base),
    consumeAuthorizationTransaction: base.consumeAuthorizationTransaction.bind(base),
    createExchangeCode: (async (...args: Parameters<OidcVaultStoreProvider['createExchangeCode']>) => {
      counts.createExchangeCode += 1;
      return base.createExchangeCode(...args);
    }) as OidcVaultStoreProvider['createExchangeCode'],
    consumeExchangeCode: base.consumeExchangeCode.bind(base),
    createSession: (async (...args: Parameters<OidcVaultStoreProvider['createSession']>) => {
      counts.createSession += 1;
      return base.createSession(...args);
    }) as OidcVaultStoreProvider['createSession'],
    getSession: base.getSession.bind(base),
    rotateSession: (async (...args: Parameters<OidcVaultStoreProvider['rotateSession']>) => {
      counts.rotateSession += 1;
      return base.rotateSession(...args);
    }) as OidcVaultStoreProvider['rotateSession'],
    deleteSession: base.deleteSession.bind(base),
    deleteSessionsByLogicalSessionId: base.deleteSessionsByLogicalSessionId.bind(base),
    consumeBackchannelLogoutTokenJti: base.consumeBackchannelLogoutTokenJti.bind(base),
    deleteSessionsBySubject: base.deleteSessionsBySubject.bind(base),
    deleteSessionsByProviderSessionId: base.deleteSessionsByProviderSessionId.bind(base),
  });

  it('rejects wrong-type access_token at callback with 502 and persists nothing', async () => {
    const counts = { createSession: 0, rotateSession: 0, createExchangeCode: 0 };
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: countingStore(createMemoryOidcVaultStore(), counts),
        fetchUserInfo: false,
      }),
    );

    tokenOverride = { access_token: 12345 };
    const response = await loginAndCallback(app);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' });
    expect(counts).toEqual({ createSession: 0, rotateSession: 0, createExchangeCode: 0 });
  });

  it('rejects null UserInfo at callback with 502 and persists nothing', async () => {
    const counts = { createSession: 0, rotateSession: 0, createExchangeCode: 0 };
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: countingStore(createMemoryOidcVaultStore(), counts),
      }),
    );

    userInfoRaw = { status: 200, body: 'null', contentType: 'application/json' };
    const response = await loginAndCallback(app);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'OIDC_VAULT_USERINFO_FAILED' });
    expect(counts.createSession).toBe(0);
    expect(counts.createExchangeCode).toBe(0);
  });

  it('maps upstream token HTML failures to stable 502 without leaking the body', async () => {
    const counts = { createSession: 0, rotateSession: 0, createExchangeCode: 0 };
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: countingStore(createMemoryOidcVaultStore(), counts),
        fetchUserInfo: false,
      }),
    );

    tokenRaw = { status: 503, body: '<html>secret upstream outage</html>', contentType: 'text/html' };
    const response = await loginAndCallback(app);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED', message: 'OIDC token request failed.' });
    expect(response.text).not.toContain('secret upstream outage');
    expect(counts.createSession).toBe(0);
  });

  it('rejects wrong-type refresh_token on refresh with 502 and does not rotate', async () => {
    const base = createMemoryOidcVaultStore();
    const counts = { createSession: 0, rotateSession: 0, createExchangeCode: 0 };
    const sessionId = 'sess_bov06_refresh';

    await base.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken!(),
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: countingStore(base, counts),
        fetchUserInfo: false,
      }),
    );

    tokenOverride = { refresh_token: 999 };
    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' });
    expect(counts.rotateSession).toBe(0);
    expect(await base.getSession(sessionId)).toBeTruthy();
  });

  it('retains documented refresh omissions (no new id_token) with rotation', async () => {
    const base = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov06_omit';

    await base.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken!(),
      user: { sub: 'user_1', email: 'retained@example.com' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: base,
        fetchUserInfo: false,
      }),
    );

    tokenOverride = { id_token: undefined, refresh_token: undefined, access_token: undefined };
    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(await base.getSession(sessionId)).toBeNull();
  });
});
