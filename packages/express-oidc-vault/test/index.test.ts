import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultMiddleware,
  createOidcVaultJwtAccessTokenValidator,
} from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';
import type { OidcVaultStoreProvider } from '../src/index';

type StartedServer = {
  server: http.Server;
  baseUrl: string;
};

const startServer = async (app: express.Express): Promise<StartedServer> => {
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine server address.');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

describe('createOidcVaultMiddleware', () => {
  type IdTokenInput =
    | string
    | {
        nonce?: string;
        payload?: Record<string, unknown>;
        audience?: string | string[];
        issuer?: string;
        expiresIn?: number;
        omitIssuedAt?: boolean;
        omitExpirationTime?: boolean;
      };

  const backendOrigin = 'https://api.example.com';
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;
  let createIdToken: ((input?: IdTokenInput) => Promise<string>) | undefined;
  let createBackchannelLogoutToken:
    | ((input: {
        sid?: string;
        sub?: string;
        jti?: string;
        events?: Record<string, unknown>;
        typ?: string;
        omitIssuedAt?: boolean;
      }) => Promise<string>)
    | undefined;
  let authorizationCodeTokenRequests: Record<string, unknown>[] = [];
  let retryIssuerDiscoveryFailuresRemaining = 0;
  let authorizationCodeTokenResponseOverride: Record<string, unknown> | undefined;
  let refreshTokenResponseOverride: Record<string, unknown> | undefined;
  let userInfoResponseOverride: Record<string, unknown> | undefined;

  const bindStoreProvider = (storeProvider: OidcVaultStoreProvider): OidcVaultStoreProvider => ({
    createAuthorizationTransaction: storeProvider.createAuthorizationTransaction.bind(storeProvider),
    consumeAuthorizationTransaction: storeProvider.consumeAuthorizationTransaction.bind(storeProvider),
    createExchangeCode: storeProvider.createExchangeCode.bind(storeProvider),
    consumeExchangeCode: storeProvider.consumeExchangeCode.bind(storeProvider),
    createSession: storeProvider.createSession.bind(storeProvider),
    getSession: storeProvider.getSession.bind(storeProvider),
    rotateSession: storeProvider.rotateSession.bind(storeProvider),
    deleteSession: storeProvider.deleteSession.bind(storeProvider),
    deleteSessionsByLogicalSessionId: storeProvider.deleteSessionsByLogicalSessionId.bind(storeProvider),
    consumeBackchannelLogoutTokenJti: storeProvider.consumeBackchannelLogoutTokenJti.bind(storeProvider),
    deleteSessionsBySubject: storeProvider.deleteSessionsBySubject.bind(storeProvider),
    deleteSessionsByProviderSessionId: storeProvider.deleteSessionsByProviderSessionId.bind(storeProvider),
  });

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));

    const keyPair = await generateKeyPair('RS256');
    publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'test-key';
    privateKey = keyPair.privateKey;

    const issuerPrefix = '/issuer';
    const retryIssuerPrefix = '/issuer-retry';

    const createSignedToken = async (
      payload: Record<string, unknown>,
      options?: {
        audience?: string | string[];
        issuer?: string;
        expiresIn?: number;
        omitIssuedAt?: boolean;
        omitExpirationTime?: boolean;
      },
    ): Promise<string> => {
      const now = Math.floor(Date.now() / 1000);
      const typ = typeof payload.__typ === 'string' ? payload.__typ : undefined;
      delete payload.__typ;

      let jwt = new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ })
        .setIssuer(options?.issuer ?? `${issuerBaseUrl}${issuerPrefix}`)
        .setAudience(options?.audience ?? 'client_1');

      if (!options?.omitIssuedAt) {
        jwt = jwt.setIssuedAt(now);
      }

      if (!options?.omitExpirationTime) {
        jwt = jwt.setExpirationTime(now + (options?.expiresIn ?? 3600));
      }

      return jwt.sign(privateKey);
    };

    createIdToken = async (input?: IdTokenInput): Promise<string> => {
      const options = typeof input === 'string' ? { nonce: input } : input;
      const payload: Record<string, unknown> = {
        sub: 'user_1',
        sid: 'provider_sid_1',
        email: 'user@example.com',
        ...options?.payload,
      };

      if (options?.nonce) {
        payload.nonce = options.nonce;
      }

      return createSignedToken(payload, options);
    };

    createBackchannelLogoutToken = async (input: {
      sid?: string;
      sub?: string;
      jti?: string;
      events?: Record<string, unknown>;
      typ?: string;
      omitIssuedAt?: boolean;
    }): Promise<string> =>
      createSignedToken(
        {
          sid: input.sid,
          sub: input.sub,
          jti: input.jti ?? `logout_${Date.now()}`,
          events: input.events ?? {
            'http://schemas.openid.net/event/backchannel-logout': {},
          },
          __typ: input.typ,
        },
        {
          omitIssuedAt: input.omitIssuedAt,
        },
      );

    issuerApp.get(`${issuerPrefix}/.well-known/openid-configuration`, (_req, res) => {
      res.json({
        issuer: `${issuerBaseUrl}${issuerPrefix}`,
        authorization_endpoint: `${issuerBaseUrl}${issuerPrefix}/authorize`,
        token_endpoint: `${issuerBaseUrl}${issuerPrefix}/token`,
        userinfo_endpoint: `${issuerBaseUrl}${issuerPrefix}/userinfo`,
        jwks_uri: `${issuerBaseUrl}${issuerPrefix}/jwks`,
        end_session_endpoint: `${issuerBaseUrl}${issuerPrefix}/logout`,
      });
    });

    issuerApp.get(`${retryIssuerPrefix}/.well-known/openid-configuration`, (_req, res) => {
      if (retryIssuerDiscoveryFailuresRemaining > 0) {
        retryIssuerDiscoveryFailuresRemaining -= 1;
        res.status(503).send('transient discovery failure');
        return;
      }

      res.json({
        issuer: `${issuerBaseUrl}${retryIssuerPrefix}`,
        authorization_endpoint: `${issuerBaseUrl}${retryIssuerPrefix}/authorize`,
        token_endpoint: `${issuerBaseUrl}${retryIssuerPrefix}/token`,
        jwks_uri: `${issuerBaseUrl}${retryIssuerPrefix}/jwks`,
      });
    });

    issuerApp.get('/issuer-mismatch/.well-known/openid-configuration', (_req, res) => {
      res.json({
        issuer: `${issuerBaseUrl}${issuerPrefix}`,
        authorization_endpoint: `${issuerBaseUrl}/issuer-mismatch/authorize`,
        token_endpoint: `${issuerBaseUrl}/issuer-mismatch/token`,
        jwks_uri: `${issuerBaseUrl}/issuer-mismatch/jwks`,
      });
    });

    issuerApp.get('/issuer-malformed/.well-known/openid-configuration', (_req, res) => {
      res.type('application/json').send('client_secret=raw-provider-value');
    });

    issuerApp.get(`${issuerPrefix}/jwks`, (_req, res) => {
      res.json({ keys: [publicJwk] });
    });

    issuerApp.post(`${issuerPrefix}/token`, async (req, res) => {
      const grantType = req.body.grant_type;

      if (grantType === 'authorization_code') {
        authorizationCodeTokenRequests.push(req.body as Record<string, unknown>);
        const code = String(req.body.code ?? '');
        const nonce = code.split(':')[1] ?? undefined;
        const override = authorizationCodeTokenResponseOverride;
        authorizationCodeTokenResponseOverride = undefined;

        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_1',
          refresh_token: 'upstream_refresh_1',
          scope: 'openid email profile',
          id_token: await createIdToken(nonce),
          ...override,
        });
        return;
      }

      if (grantType === 'refresh_token') {
        const override = refreshTokenResponseOverride;
        refreshTokenResponseOverride = undefined;

        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_2',
          refresh_token: 'upstream_refresh_2',
          scope: 'openid email profile',
          id_token: await createIdToken(),
          ...override,
        });
        return;
      }

      res.status(400).json({ error: 'unsupported_grant_type' });
    });

    issuerApp.get(`${issuerPrefix}/userinfo`, (_req, res) => {
      const override = userInfoResponseOverride;
      userInfoResponseOverride = undefined;

      res.json({
        sub: 'user_1',
        preferredUsername: 'vault-user',
        name: 'Vault User',
        ...override,
      });
    });

    const started = await startServer(issuerApp);
    issuerServer = started.server;
    issuerBaseUrl = started.baseUrl;
  });

  beforeEach(() => {
    __resetProviderClientCachesForTests();
  });

  afterAll(async () => {
    if (!issuerServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      issuerServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('completes login, callback, exchange, refresh, and logout using the memory store', async () => {
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        postLogoutRedirectUri: 'https://frontend.example.com/logout-complete',
        storeProvider,
        tokenIssuer: {
          async issue({ session }) {
            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');

    expect(loginResponse.status).toBe(302);

    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    expect(authorizationUrl.origin).toBe(issuerBaseUrl);
    expect(authorizationUrl.pathname).toBe('/issuer/authorize');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('client_1');
    expect(authorizationUrl.searchParams.get('scope')).toBe('openid email profile');
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(state).toBeTruthy();
    expect(nonce).toBeTruthy();

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({
        state,
        code: `authcode:${nonce}`,
      });

    expect(callbackResponse.status).toBe(302);

    const frontendUrl = new URL(callbackResponse.headers.location);
    const exchangeCode = frontendUrl.searchParams.get('code');

    expect(frontendUrl.origin).toBe('https://frontend.example.com');
    expect(frontendUrl.pathname).toBe('/callback');
    expect(exchangeCode).toBeTruthy();

    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });

    expect(exchangeResponse.status).toBe(200);
    expect(exchangeResponse.body).toMatchObject({
      sessionId: expect.stringMatching(/^sess_/),
      accessToken: expect.stringMatching(/^local:sess_/),
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        sub: 'user_1',
        preferredUsername: 'vault-user',
      },
    });

    const originalSessionId = exchangeResponse.body.sessionId as string;
    const originalSession = await storeProvider.getSession(originalSessionId);

    expect(originalSession?.expiresAt).toBeUndefined();

    const refreshResponse = await request(app).post('/auth/oidc/refresh').send({
      sessionId: originalSessionId,
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.sessionId).not.toBe(originalSessionId);
    expect(refreshResponse.body).toMatchObject({
      sessionId: expect.stringMatching(/^sess_/),
      accessToken: expect.stringMatching(/^local:sess_/),
      user: {
        sub: 'user_1',
      },
    });

    const rotatedSessionId = refreshResponse.body.sessionId as string;
    const rotatedSession = await storeProvider.getSession(rotatedSessionId);

    expect(rotatedSession?.expiresAt).toBeUndefined();

    const oldRefreshResponse = await request(app).post('/auth/oidc/refresh').send({
      sessionId: originalSessionId,
    });

    expect(oldRefreshResponse.status).toBe(401);

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: rotatedSessionId,
    });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.loggedOut).toBe(true);
    expect(logoutResponse.body.upstreamLogoutUrl).toBeUndefined();

    await storeProvider.createSession({
      sessionId: 'sess_logout_redirect',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_2',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    const redirectLogoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: 'sess_logout_redirect',
      redirect: true,
    });

    expect(redirectLogoutResponse.status).toBe(302);

    const logoutUrl = new URL(redirectLogoutResponse.headers.location);

    expect(logoutUrl.origin).toBe(issuerBaseUrl);
    expect(logoutUrl.pathname).toBe('/issuer/logout');
    expect(logoutUrl.searchParams.get('post_logout_redirect_uri')).toBe('https://frontend.example.com/logout-complete');
    expect(logoutUrl.searchParams.get('id_token_hint')).toBeTruthy();

    const postLogoutRefreshResponse = await request(app).post('/auth/oidc/refresh').send({
      sessionId: rotatedSessionId,
    });

    expect(postLogoutRefreshResponse.status).toBe(401);
  });

  it('uses backendOrigin for login and callback redirect_uri even when Host differs', async () => {
    const app = express();
    authorizationCodeTokenRequests = [];

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: `${backendOrigin}/ignored/path?ignored=true#ignored`,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const expectedRedirectUri = `${backendOrigin}/auth/oidc/callback`;
    const loginResponse = await request(app).get('/auth/oidc/login').set('Host', 'attacker.example.com');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    expect(loginResponse.status).toBe(302);
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(expectedRedirectUri);

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .set('Host', 'other.example.com')
      .query({ state, code: `authcode:${nonce}` });

    expect(callbackResponse.status).toBe(302);
    expect(authorizationCodeTokenRequests).toHaveLength(1);
    expect(authorizationCodeTokenRequests[0]?.redirect_uri).toBe(expectedRedirectUri);
  });

  it('rejects invalid backendOrigin values during middleware creation', () => {
    expect(() =>
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: 'ftp://api.example.com',
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    ).toThrow('backendOrigin must use http or https');
  });

  it('rejects invalid postLogoutRedirectUri values during middleware creation', () => {
    const baseOptions = {
      basePath: '/auth/oidc',
      backendOrigin,
      config: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
        clientSecret: 'secret_1',
      },
      frontendRedirectUri: 'https://frontend.example.com/callback',
      storeProvider: createMemoryOidcVaultStore(),
    };

    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        postLogoutRedirectUri: '/logged-out',
      }),
    ).toThrow('postLogoutRedirectUri must be an absolute HTTP(S) URL');

    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        postLogoutRedirectUri: 'javascript:alert(1)',
      }),
    ).toThrow('postLogoutRedirectUri must use http or https');
  });

  it('rejects invalid frontendRedirectUri values during middleware creation', () => {
    expect(() =>
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'javascript:alert(1)',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    ).toThrow('frontendRedirectUri must use http or https');
  });

  it('allows omitted and separately hosted HTTP(S) postLogoutRedirectUri values', () => {
    const baseOptions = {
      basePath: '/auth/oidc',
      backendOrigin,
      config: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
        clientSecret: 'secret_1',
      },
      frontendRedirectUri: 'https://frontend.example.com/callback',
      storeProvider: createMemoryOidcVaultStore(),
    };

    expect(() => createOidcVaultMiddleware(baseOptions)).not.toThrow();
    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        postLogoutRedirectUri: 'https://logout.example.net/complete',
      }),
    ).not.toThrow();
  });

  it('rejects unsafe cookie transport options during middleware creation', () => {
    const baseOptions = {
      basePath: '/auth/oidc',
      backendOrigin,
      config: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
        clientSecret: 'secret_1',
      },
      frontendRedirectUri: 'https://frontend.example.com/callback',
      sessionTransport: 'cookie' as const,
      storeProvider: createMemoryOidcVaultStore(),
    };

    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        cookie: { httpOnly: false },
      }),
    ).toThrow('cookie.httpOnly must be true');

    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        cookie: { name: 'bad cookie' },
      }),
    ).toThrow('cookie.name must be a valid HTTP cookie name');

    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        cookie: { path: '/; SameSite=None' },
      }),
    ).toThrow('cookie.path must start with / and cannot contain control characters or semicolons');

    expect(() =>
      createOidcVaultMiddleware({
        ...baseOptions,
        cookie: { domain: 'example.com\r\nSet-Cookie: attacker=1' },
      }),
    ).toThrow('cookie.domain must be a valid cookie domain');
  });

  it('rejects custom returnTo values on a different frontend origin', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const response = await request(app)
      .get('/auth/oidc/login')
      .query({ returnTo: 'https://attacker.example.com/callback' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'OIDC_VAULT_INVALID_RETURN_TO',
    });
  });

  it('rejects malformed custom returnTo values with a stable 400 error', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const response = await request(app).get('/auth/oidc/login?returnTo=%');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'OIDC_VAULT_INVALID_RETURN_TO',
      message: 'returnTo must be a valid URL.',
    });
  });

  it('supports cookie transport so refresh and logout do not require sessionId in the body', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        postLogoutRedirectUri: 'https://frontend.example.com/logout-complete',
        sessionTransport: 'cookie',
        cookie: {
          deploymentMode: 'cross-site',
          domain: '.example.com',
        },
        trustedOrigins: ['https://frontend.example.com'],
        storeProvider: createMemoryOidcVaultStore(),
        tokenIssuer: {
          async issue({ session }) {
            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({
        state,
        code: `authcode:${nonce}`,
      });

    const frontendUrl = new URL(callbackResponse.headers.location);
    const exchangeCode = frontendUrl.searchParams.get('code');

    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });

    expect(exchangeResponse.status).toBe(200);
    expect(exchangeResponse.body).toMatchObject({
      accessToken: expect.stringMatching(/^local:sess_/),
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        sub: 'user_1',
      },
    });
    expect(exchangeResponse.body.sessionId).toBeUndefined();

    const exchangeCookie = (exchangeResponse.headers['set-cookie'] ?? [])[0] as string | undefined;

    expect(exchangeCookie).toContain('oidc_vault_session=');
    expect(exchangeCookie).toContain('HttpOnly');
    expect(exchangeCookie).toContain('SameSite=None');
    expect(exchangeCookie).toContain('Secure');
    expect(exchangeCookie).toContain('Domain=.example.com');

    const sessionCookieHeader = exchangeCookie?.split(';', 1)[0];

    const refreshResponse = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', 'https://frontend.example.com')
      .set('Cookie', sessionCookieHeader ?? '')
      .send({});

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.sessionId).toBeUndefined();
    expect(refreshResponse.body.accessToken).toMatch(/^local:sess_/);

    const refreshCookie = (refreshResponse.headers['set-cookie'] ?? [])[0] as string | undefined;

    expect(refreshCookie).toContain('oidc_vault_session=');
    expect(refreshCookie).toContain('SameSite=None');

    const rotatedSessionCookieHeader = refreshCookie?.split(';', 1)[0];

    const logoutResponse = await request(app)
      .post('/auth/oidc/logout')
      .set('Origin', 'https://frontend.example.com')
      .set('Cookie', rotatedSessionCookieHeader ?? '')
      .send({});

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.loggedOut).toBe(true);

    const clearedCookie = (logoutResponse.headers['set-cookie'] ?? [])[0] as string | undefined;

    expect(clearedCookie).toContain('oidc_vault_session=');
    expect(clearedCookie).toContain('Max-Age=0');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    const postLogoutRefreshResponse = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', 'https://frontend.example.com')
      .send({});

    expect(postLogoutRefreshResponse.status).toBe(400);
    expect(postLogoutRefreshResponse.body).toMatchObject({
      code: 'OIDC_VAULT_MISSING_SESSION_ID',
    });
  });

  it('returns controlled errors for malformed cookie transport session cookies', async () => {
    const app = express();
    const onError = vi.fn();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        sessionTransport: 'cookie',
        trustedOrigins: ['https://frontend.example.com'],
        storeProvider: createMemoryOidcVaultStore(),
        hooks: { onError },
      }),
    );

    for (const route of ['/refresh', '/logout']) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .set('Origin', backendOrigin)
        .set('Cookie', 'oidc_vault_session=%E0%A4%A')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_MALFORMED_SESSION_COOKIE',
        message: 'OIDC vault session cookie is malformed.',
      });
    }

    expect(onError).toHaveBeenCalledTimes(2);

    for (const call of onError.mock.calls) {
      expect(call[0].metadata).toBeUndefined();
      expect(call[0].error).toMatchObject({
        code: 'OIDC_VAULT_MALFORMED_SESSION_COOKIE',
        message: 'OIDC vault session cookie is malformed.',
      });
    }
  });

  it('rejects body session IDs for cookie transport when the session cookie is missing', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        sessionTransport: 'cookie',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    for (const route of ['/refresh', '/logout']) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .set('Origin', backendOrigin)
        .send({ sessionId: 'sess_body_only' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_MISSING_SESSION_ID',
        message: `${route === '/refresh' ? 'Refresh' : 'Logout'} request is missing the session cookie.`,
      });
    }
  });

  it('uses body session IDs for body transport and ignores session cookies', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_body_transport';

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        tokenIssuer: {
          async issue({ session }) {
            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const response = await request(app)
      .post('/auth/oidc/refresh')
      .set('Cookie', 'oidc_vault_session=sess_cookie_transport')
      .send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.sessionId).not.toBe(sessionId);
    expect(response.body.accessToken).toMatch(/^local:sess_/);
  });

  it('decodes encoded cookie transport session IDs', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_with encoded value';

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        sessionTransport: 'cookie',
        cookie: {
          name: 'custom_session_cookie',
        },
        storeProvider,
        tokenIssuer: {
          async issue({ session }) {
            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const refreshResponse = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', backendOrigin)
      .set('Cookie', `custom_session_cookie=${encodeURIComponent(sessionId)}`)
      .send({});

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toMatch(/^local:sess_/);
    expect(refreshResponse.headers['set-cookie']?.[0]).toContain('custom_session_cookie=sess_');
  });

  it('requires trusted source-origin headers for same-site cookie refresh and logout requests', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    for (const sameSite of ['lax', 'strict'] as const) {
      const storeProvider = createMemoryOidcVaultStore();
      const sessionId = `sess_${sameSite}_csrf`;

      await storeProvider.createSession({
        sessionId,
        subject: 'user_1',
        refreshToken: 'upstream_refresh_1',
        idToken: await createIdToken(),
        provider: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
        },
      });

      const app = express();

      app.use(
        createOidcVaultMiddleware({
          basePath: '/auth/oidc',
          backendOrigin,
          config: {
            issuer: `${issuerBaseUrl}/issuer`,
            clientId: 'client_1',
            clientSecret: 'secret_1',
          },
          frontendRedirectUri: 'https://frontend.example.com/callback',
          sessionTransport: 'cookie',
          cookie: { sameSite },
          trustedOrigins: ['https://frontend.example.com'],
          storeProvider,
        }),
      );

      for (const route of ['/refresh', '/logout']) {
        const missingOriginResponse = await request(app)
          .post(`/auth/oidc${route}`)
          .set('Cookie', `oidc_vault_session=${sessionId}`)
          .send({});

        expect(missingOriginResponse.status).toBe(403);
        expect(missingOriginResponse.body).toMatchObject({
          code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
        });

        const siblingOriginResponse = await request(app)
          .post(`/auth/oidc${route}`)
          .set('Origin', 'https://evil.example.com')
          .set('Cookie', `oidc_vault_session=${sessionId}`)
          .send({});

        expect(siblingOriginResponse.status).toBe(403);
        expect(siblingOriginResponse.body).toMatchObject({
          code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
        });
      }
    }
  });

  it('allows trusted backend and frontend origins for same-site cookie refresh requests', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    for (const origin of [backendOrigin, 'https://frontend.example.com']) {
      const app = express();
      const storeProvider = createMemoryOidcVaultStore();
      const sessionId = `sess_trusted_${origin === backendOrigin ? 'backend' : 'frontend'}`;

      await storeProvider.createSession({
        sessionId,
        subject: 'user_1',
        refreshToken: 'upstream_refresh_1',
        idToken: await createIdToken(),
        provider: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
        },
      });

      app.use(
        createOidcVaultMiddleware({
          basePath: '/auth/oidc',
          backendOrigin,
          config: {
            issuer: `${issuerBaseUrl}/issuer`,
            clientId: 'client_1',
            clientSecret: 'secret_1',
          },
          frontendRedirectUri: 'https://frontend.example.com/callback',
          sessionTransport: 'cookie',
          trustedOrigins: ['https://frontend.example.com'],
          storeProvider,
        }),
      );

      const response = await request(app)
        .post('/auth/oidc/refresh')
        .set('Origin', origin)
        .set('Cookie', `oidc_vault_session=${sessionId}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBeUndefined();
    }
  });

  it('rejects untrusted origins for cross-site cookie refresh requests', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        sessionTransport: 'cookie',
        cookie: {
          deploymentMode: 'cross-site',
        },
        trustedOrigins: ['https://frontend.example.com'],
        storeProvider: createMemoryOidcVaultStore(),
        tokenIssuer: {
          async issue({ session }) {
            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}` });
    const frontendUrl = new URL(callbackResponse.headers.location);
    const exchangeCode = frontendUrl.searchParams.get('code');

    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });
    const sessionCookieHeader = ((exchangeResponse.headers['set-cookie'] ?? [])[0] as string | undefined)?.split(
      ';',
      1,
    )[0];

    const refreshResponse = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', 'https://attacker.example.com')
      .set('Cookie', sessionCookieHeader ?? '')
      .send({});

    expect(refreshResponse.status).toBe(403);
    expect(refreshResponse.body).toMatchObject({
      code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
    });
  });

  it('retries issuer discovery after a transient failure instead of caching the rejection', async () => {
    retryIssuerDiscoveryFailuresRemaining = 1;
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer-retry`,
          clientId: 'client_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const firstResponse = await request(app).get('/auth/oidc/login');

    expect(firstResponse.status).toBe(502);
    expect(firstResponse.body).toMatchObject({
      code: 'OIDC_VAULT_DISCOVERY_FAILED',
    });

    const secondResponse = await request(app).get('/auth/oidc/login');

    expect(secondResponse.status).toBe(302);
    expect(new URL(secondResponse.headers.location).pathname).toBe('/issuer-retry/authorize');
  });

  it('rejects discovery metadata when issuer differs from the configured issuer', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer-mismatch`,
          clientId: 'client_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const response = await request(app).get('/auth/oidc/login');

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      code: 'OIDC_VAULT_DISCOVERY_INVALID',
    });
  });

  it('returns sanitized discovery parse errors while onError observes the original error', async () => {
    const app = express();
    const onError = vi.fn();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer-malformed`,
          clientId: 'client_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        hooks: { onError },
      }),
    );

    const response = await request(app).get('/auth/oidc/login');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_DISCOVERY_INVALID',
      message: 'OIDC discovery response is malformed JSON.',
    });
    expect(response.text).not.toContain('raw-provider-value');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toBeInstanceOf(Error);
  });

  it('returns sanitized messages for store and hook failures', async () => {
    const storeApp = express();
    const storeError = new Error('store unavailable: redis://secret@localhost');
    const storeOnError = vi.fn();
    const failingStoreProvider = {
      ...createMemoryOidcVaultStore(),
      async createAuthorizationTransaction() {
        throw storeError;
      },
    };

    storeApp.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: failingStoreProvider,
        hooks: { onError: storeOnError },
      }),
    );

    const storeResponse = await request(storeApp).get('/auth/oidc/login');

    expect(storeResponse.status).toBe(500);
    expect(storeResponse.body).toEqual({
      code: 'OIDC_VAULT_INTERNAL_ERROR',
      message: 'Unexpected OIDC vault error.',
    });
    expect(storeResponse.text).not.toContain('redis://secret');
    expect(storeOnError.mock.calls[0]?.[0].error).toBe(storeError);

    const hookApp = express();
    const hookError = new Error('hook failed: private-user-context');
    const hookOnError = vi.fn();

    hookApp.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        hooks: {
          async onLoginStart() {
            throw hookError;
          },
          onError: hookOnError,
        },
      }),
    );

    const hookResponse = await request(hookApp).get('/auth/oidc/login');

    expect(hookResponse.status).toBe(500);
    expect(hookResponse.body).toEqual({
      code: 'OIDC_VAULT_INTERNAL_ERROR',
      message: 'Unexpected OIDC vault error.',
    });
    expect(hookResponse.text).not.toContain('private-user-context');
    expect(hookOnError.mock.calls[0]?.[0].error).toBe(hookError);
  });

  it('rejects UserInfo responses without a matching sub', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    for (const userInfo of [{ sub: 'user_2' }, { sub: undefined }]) {
      userInfoResponseOverride = userInfo;
      const loginResponse = await request(app).get('/auth/oidc/login');
      const authorizationUrl = new URL(loginResponse.headers.location);
      const response = await request(app)
        .get('/auth/oidc/callback')
        .query({
          state: authorizationUrl.searchParams.get('state'),
          code: `authcode:${authorizationUrl.searchParams.get('nonce')}`,
        });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({
        code: 'OIDC_VAULT_INVALID_USERINFO',
      });
    }
  });

  it('rejects invalid ID token and token response fields during callback', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        fetchUserInfo: false,
      }),
    );

    const cases: Array<{ override: Record<string, unknown>; code: string }> = [
      { override: { token_type: undefined }, code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' },
      { override: { token_type: 'mac' }, code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' },
      { override: { expires_in: -1 }, code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' },
      { override: { expires_in: 1.5 }, code: 'OIDC_VAULT_INVALID_TOKEN_RESPONSE' },
      {
        override: { id_token: await createIdToken({ omitExpirationTime: true }) },
        code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      },
      { override: { id_token: await createIdToken({ omitIssuedAt: true }) }, code: 'OIDC_VAULT_INVALID_ID_TOKEN' },
      {
        override: { id_token: await createIdToken({ payload: { azp: 'other_client' } }) },
        code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      },
      {
        override: { id_token: await createIdToken({ audience: ['client_1', 'client_2'] }) },
        code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      },
    ];

    for (const testCase of cases) {
      authorizationCodeTokenResponseOverride = testCase.override;
      const loginResponse = await request(app).get('/auth/oidc/login');
      const authorizationUrl = new URL(loginResponse.headers.location);
      const response = await request(app)
        .get('/auth/oidc/callback')
        .query({
          state: authorizationUrl.searchParams.get('state'),
          code: `authcode:${authorizationUrl.searchParams.get('nonce')}`,
        });

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({
        code: testCase.code,
      });
    }
  });

  it('rejects refreshed ID tokens that change the session subject', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_subject_change';

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        fetchUserInfo: false,
      }),
    );

    refreshTokenResponseOverride = {
      id_token: await createIdToken({ payload: { sub: 'user_2' } }),
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
    });
    expect(await storeProvider.getSession(sessionId)).toBeTruthy();
  });

  it('retains verified claims when refresh omits a new ID token', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_no_new_id_token';

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      user: {
        sub: 'user_1',
        email: 'retained@example.com',
      },
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        fetchUserInfo: false,
      }),
    );

    refreshTokenResponseOverride = {
      id_token: undefined,
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      sub: 'user_1',
      email: 'retained@example.com',
    });
  });

  it('preserves explicit vault-session expiry across refresh instead of using upstream access-token lifetime', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_explicit_expiry';
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      expiresAt,
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        fetchUserInfo: false,
      }),
    );

    refreshTokenResponseOverride = {
      expires_in: 1,
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);

    const refreshedSession = await storeProvider.getSession(response.body.sessionId as string);

    expect(refreshedSession?.expiresAt).toBe(expiresAt);
  });

  it('allows only one concurrent refresh to mint a local token', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const baseStoreProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_concurrent_refresh';
    const issuedTokens: string[] = [];
    let waitingRotations = 0;
    let releaseRotations: (() => void) | undefined;
    const rotationsReady = new Promise<void>((resolve) => {
      releaseRotations = resolve;
    });

    await baseStoreProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: {
          ...bindStoreProvider(baseStoreProvider),
          async rotateSession(input) {
            waitingRotations += 1;

            if (waitingRotations === 2) {
              releaseRotations?.();
            }

            await rotationsReady;
            return baseStoreProvider.rotateSession(input);
          },
        },
        fetchUserInfo: false,
        tokenIssuer: {
          async issue({ session }) {
            const accessToken = `local:${session.sessionId}`;
            issuedTokens.push(accessToken);
            return {
              accessToken,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const responses = await Promise.all([
      request(app)
        .post('/auth/oidc/refresh')
        .send({ sessionId })
        .then((response) => response),
      request(app)
        .post('/auth/oidc/refresh')
        .send({ sessionId })
        .then((response) => response),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(issuedTokens).toHaveLength(1);
  });

  it('deletes the current logical session when logout races after refresh rotation', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const baseStoreProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_logout_refresh_race';
    let releaseRotationStarted: (() => void) | undefined;
    const rotationStarted = new Promise<void>((resolve) => {
      releaseRotationStarted = resolve;
    });
    let releaseIssuedToken: (() => void) | undefined;
    const issuedTokenCanContinue = new Promise<void>((resolve) => {
      releaseIssuedToken = resolve;
    });

    await baseStoreProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: {
          ...bindStoreProvider(baseStoreProvider),
          async rotateSession(input) {
            const rotated = await baseStoreProvider.rotateSession(input);
            releaseRotationStarted?.();
            return rotated;
          },
        },
        fetchUserInfo: false,
        tokenIssuer: {
          async issue({ session }) {
            if (session.sessionId !== sessionId) {
              await issuedTokenCanContinue;
            }

            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const refreshPromise = request(app)
      .post('/auth/oidc/refresh')
      .send({ sessionId })
      .then((response) => response);
    await rotationStarted;

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({ sessionId });
    releaseIssuedToken?.();
    const refreshResponse = await refreshPromise;

    expect(logoutResponse.status).toBe(200);
    expect(refreshResponse.status).toBe(200);
    expect(await baseStoreProvider.getSession(refreshResponse.body.sessionId as string)).toBeNull();
  });

  it('revokes the logical session when local token issuance fails after rotation', async () => {
    const app = express();
    let issueCalls = 0;
    const onError = vi.fn();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        tokenIssuer: {
          async issue({ session }) {
            issueCalls += 1;

            if (issueCalls === 2) {
              throw new Error('token issuer unavailable');
            }

            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
        hooks: { onError },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}` });
    const exchangeCode = new URL(callbackResponse.headers.location).searchParams.get('code');
    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });
    const originalSessionId = exchangeResponse.body.sessionId as string;

    const failedRefreshResponse = await request(app).post('/auth/oidc/refresh').send({ sessionId: originalSessionId });

    expect(failedRefreshResponse.status).toBe(500);
    expect(failedRefreshResponse.body).toMatchObject({
      message: 'Unexpected OIDC vault error.',
    });
    expect(failedRefreshResponse.text).not.toContain('token issuer unavailable');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toMatchObject({
      message: 'token issuer unavailable',
    });

    const retryRefreshResponse = await request(app).post('/auth/oidc/refresh').send({ sessionId: originalSessionId });

    expect(retryRefreshResponse.status).toBe(401);
  });

  it('compensates the created callback session when exchange-code creation fails', async () => {
    const app = express();
    const baseStoreProvider = createMemoryOidcVaultStore();
    let createdSessionId: string | undefined;

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: {
          ...bindStoreProvider(baseStoreProvider),
          async createSession(input) {
            const session = await baseStoreProvider.createSession(input);
            createdSessionId = session.sessionId;
            return session;
          },
          async createExchangeCode() {
            throw new Error('exchange code store unavailable');
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}` });

    expect(callbackResponse.status).toBe(500);
    expect(createdSessionId).toBeTruthy();
    expect(await baseStoreProvider.getSession(createdSessionId as string)).toBeNull();
  });

  it('revokes the exchange session when local token issuance fails after code consumption', async () => {
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        tokenIssuer: {
          async issue() {
            throw new Error('token issuer unavailable');
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');
    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}` });
    const exchangeCode = new URL(callbackResponse.headers.location).searchParams.get('code');

    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });
    const retryExchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });

    expect(exchangeResponse.status).toBe(500);
    expect(exchangeResponse.body.message).toBe('Unexpected OIDC vault error.');
    expect(retryExchangeResponse.status).toBe(400);
    expect(retryExchangeResponse.body.code).toBe('OIDC_VAULT_INVALID_EXCHANGE_CODE');
  });

  it('treats session-created hook failure as a post-commit notification failure', async () => {
    const app = express();
    const onError = vi.fn();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        hooks: {
          onError,
          async onSessionCreated() {
            throw new Error('audit sink unavailable');
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}` });
    const exchangeCode = new URL(callbackResponse.headers.location).searchParams.get('code');
    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });

    expect(callbackResponse.status).toBe(302);
    expect(exchangeResponse.status).toBe(200);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toMatchObject({ message: 'audit sink unavailable' });
  });

  it('keeps refresh successful when the post-commit refresh hook fails', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const onError = vi.fn();

    await storeProvider.createSession({
      sessionId: 'sess_refresh_hook_failure',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        fetchUserInfo: false,
        hooks: {
          onError,
          async onSessionRefreshed() {
            throw new Error('refresh audit unavailable');
          },
        },
      }),
    );

    const refreshResponse = await request(app).post('/auth/oidc/refresh').send({
      sessionId: 'sess_refresh_hook_failure',
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.sessionId).toMatch(/^sess_/);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toMatchObject({ message: 'refresh audit unavailable' });
  });

  it('keeps logout successful when the post-commit logout hook fails', async () => {
    if (!createIdToken) {
      throw new Error('ID token helper is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const onError = vi.fn();

    await storeProvider.createSession({
      sessionId: 'sess_logout_hook_failure',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: {
        issuer: `${issuerBaseUrl}/issuer`,
        clientId: 'client_1',
      },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        hooks: {
          onError,
          async onLogout({ metadata }) {
            expect(metadata?.upstreamLogoutUrl).toBeUndefined();
            throw new Error('logout audit unavailable');
          },
        },
      }),
    );

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: 'sess_logout_hook_failure',
    });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.loggedOut).toBe(true);
    expect(await storeProvider.getSession('sess_logout_hook_failure')).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toMatchObject({ message: 'logout audit unavailable' });
  });

  it('supports OIDC backchannel logout by upstream sid', async () => {
    if (!createBackchannelLogoutToken) {
      throw new Error('Backchannel logout token helper is not initialized.');
    }

    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        tokenIssuer: {
          async issue({ session }) {
            return {
              accessToken: `local:${session.sessionId}`,
              expiresIn: 900,
              tokenType: 'Bearer',
            };
          },
        },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({
        state,
        code: `authcode:${nonce}`,
      });
    const frontendUrl = new URL(callbackResponse.headers.location);
    const exchangeCode = frontendUrl.searchParams.get('code');

    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });
    const sessionId = exchangeResponse.body.sessionId as string;

    const logoutToken = await createBackchannelLogoutToken({ sid: 'provider_sid_1' });

    const backchannelLogoutResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });

    expect(backchannelLogoutResponse.status).toBe(200);
    expect(backchannelLogoutResponse.body).toMatchObject({
      loggedOut: true,
      revokedSessions: 1,
    });

    const refreshResponse = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(refreshResponse.status).toBe(401);
  });

  it('does not repeat revocation hooks when a backchannel logout token is replayed', async () => {
    if (!createBackchannelLogoutToken) {
      throw new Error('Backchannel logout token helper is not initialized.');
    }

    const app = express();
    const onLogout = vi.fn();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        hooks: { onLogout },
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');
    const authorizationUrl = new URL(loginResponse.headers.location);
    const state = authorizationUrl.searchParams.get('state');
    const nonce = authorizationUrl.searchParams.get('nonce');

    const callbackResponse = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}` });
    const exchangeCode = new URL(callbackResponse.headers.location).searchParams.get('code');

    await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });

    const logoutToken = await createBackchannelLogoutToken({ sid: 'provider_sid_1', jti: 'logout_replay_1' });
    const firstResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });
    const replayResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.revokedSessions).toBe(1);
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.body.revokedSessions).toBe(0);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('rejects hardened invalid backchannel logout tokens', async () => {
    if (!createBackchannelLogoutToken) {
      throw new Error('Backchannel logout token helper is not initialized.');
    }

    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const missingIat = await createBackchannelLogoutToken({ sid: 'provider_sid_1', omitIssuedAt: true });
    const malformedEvents = await createBackchannelLogoutToken({
      sid: 'provider_sid_1',
      events: { 'http://schemas.openid.net/event/backchannel-logout': 'not-an-object' },
    });
    const wrongTyp = await createBackchannelLogoutToken({ sid: 'provider_sid_1', typ: 'JWT' });

    for (const logoutToken of [missingIat, malformedEvents, wrongTyp]) {
      const response = await request(app)
        .post('/auth/oidc/backchannel-logout')
        .type('form')
        .send({ logout_token: logoutToken });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_LOGOUT_TOKEN');
    }
  });

  it('returns controlled errors for oversized JSON route bodies without calling route hooks', async () => {
    const app = express();
    const onError = vi.fn();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        hooks: { onError },
        requestBodyLimit: '32b',
      }),
    );

    for (const route of ['/exchange', '/refresh', '/logout']) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .send({ sessionId: 'sess_1', code: 'code_1', padding: 'x'.repeat(64) });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_REQUEST_BODY_TOO_LARGE',
        message: 'OIDC vault request body exceeds the configured size limit.',
      });
    }

    expect(onError).not.toHaveBeenCalled();
  });

  it('returns controlled errors for malformed JSON and unsupported body encodings', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const malformedResponse = await request(app)
      .post('/auth/oidc/exchange')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(malformedResponse.status).toBe(400);
    expect(malformedResponse.body).toEqual({
      code: 'OIDC_VAULT_MALFORMED_REQUEST_BODY',
      message: 'OIDC vault request body is malformed.',
    });

    const encodedResponse = await request(app)
      .post('/auth/oidc/exchange')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send(JSON.stringify({ code: 'code_1' }));

    expect(encodedResponse.status).toBe(415);
    expect(encodedResponse.body).toEqual({
      code: 'OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_ENCODING',
      message: 'OIDC vault request body encoding is not supported.',
    });
  });

  it('returns controlled errors for oversized form backchannel logout bodies and parameter overflow', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
        requestBodyLimit: '32b',
      }),
    );

    const oversizedResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: 'x'.repeat(64) });

    expect(oversizedResponse.status).toBe(413);
    expect(oversizedResponse.body).toEqual({
      code: 'OIDC_VAULT_REQUEST_BODY_TOO_LARGE',
      message: 'OIDC vault request body exceeds the configured size limit.',
    });

    const parameterLimitApp = express();

    parameterLimitApp.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider: createMemoryOidcVaultStore(),
      }),
    );

    const overflowingForm = new URLSearchParams();

    for (let index = 0; index < 17; index += 1) {
      overflowingForm.set(`param_${index}`, String(index));
    }

    const overflowResponse = await request(parameterLimitApp)
      .post('/auth/oidc/backchannel-logout')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(overflowingForm.toString());

    expect(overflowResponse.status).toBe(413);
    expect(overflowResponse.body).toEqual({
      code: 'OIDC_VAULT_REQUEST_BODY_PARAMETER_LIMIT_EXCEEDED',
      message: 'OIDC vault form request contains too many parameters.',
    });
  });

  it('validates bearer access tokens with a separate middleware and attaches req.auth', async () => {
    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: {
          async validate(token) {
            return {
              subject: 'user_1',
              sessionId: 'sess_1',
              scope: 'read:profile',
              claims: { token },
            };
          },
        },
      }),
      (req, res) => {
        res.json(req.auth ?? null);
      },
    );

    const response = await request(app).get('/protected').set('Authorization', 'Bearer access_token_1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      token: 'access_token_1',
      subject: 'user_1',
      sessionId: 'sess_1',
      scope: 'read:profile',
      claims: {
        token: 'access_token_1',
      },
    });
  });

  it('rejects missing or invalid bearer headers with 401', async () => {
    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: {
          async validate(token) {
            return { subject: token };
          },
        },
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    const missingTokenResponse = await request(app).get('/protected');

    expect(missingTokenResponse.status).toBe(401);
    expect(missingTokenResponse.headers['www-authenticate']).toBe('Bearer');
    expect(missingTokenResponse.body).toMatchObject({
      code: 'OIDC_VAULT_MISSING_BEARER_TOKEN',
    });

    const malformedHeaderResponse = await request(app).get('/protected').set('Authorization', 'Token nope');

    expect(malformedHeaderResponse.status).toBe(401);
    expect(malformedHeaderResponse.body).toMatchObject({
      code: 'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER',
    });
  });

  it('rejects invalid bearer tokens with 401', async () => {
    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: {
          async validate() {
            throw new Error('token expired: raw-token-value');
          },
        },
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    const response = await request(app).get('/protected').set('Authorization', 'Bearer expired_token');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toMatchObject({
      code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
      message: 'Access token validation failed.',
    });
    expect(response.text).not.toContain('raw-token-value');
  });

  it('provides a JWT validator helper for access-token middleware', async () => {
    const app = express();
    const secret = new TextEncoder().encode('jwt-access-secret');

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: createOidcVaultJwtAccessTokenValidator({
          key: secret,
          issuer: 'https://issuer.example.com',
          audience: 'api-audience',
          algorithms: ['HS256'],
        }),
      }),
      (req, res) => {
        res.json(req.auth ?? null);
      },
    );

    const token = await new SignJWT({
      sub: 'user_1',
      sid: 'sess_1',
      scope: 'read:profile',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://issuer.example.com')
      .setAudience('api-audience')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      token,
      subject: 'user_1',
      sessionId: 'sess_1',
      scope: 'read:profile',
      claims: {
        sub: 'user_1',
        sid: 'sess_1',
        scope: 'read:profile',
        role: 'admin',
      },
    });
  });
});
