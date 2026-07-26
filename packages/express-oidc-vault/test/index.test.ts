import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';

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
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));

    const keyPair = await generateKeyPair('RS256');
    publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'test-key';
    privateKey = keyPair.privateKey;

    const issuerPrefix = '/issuer';

    const createIdToken = async (nonce?: string): Promise<string> => {
      const now = Math.floor(Date.now() / 1000);
      const payload: Record<string, unknown> = {
        sub: 'user_1',
        email: 'user@example.com',
      };

      if (nonce) {
        payload.nonce = nonce;
      }

      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(`${issuerBaseUrl}${issuerPrefix}`)
        .setAudience('client_1')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(privateKey);
    };

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

    issuerApp.get(`${issuerPrefix}/jwks`, (_req, res) => {
      res.json({ keys: [publicJwk] });
    });

    issuerApp.post(`${issuerPrefix}/token`, async (req, res) => {
      const grantType = req.body.grant_type;

      if (grantType === 'authorization_code') {
        const code = String(req.body.code ?? '');
        const nonce = code.split(':')[1] ?? undefined;

        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_1',
          refresh_token: 'upstream_refresh_1',
          scope: 'openid email profile',
          id_token: await createIdToken(nonce),
        });
        return;
      }

      if (grantType === 'refresh_token') {
        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_2',
          refresh_token: 'upstream_refresh_2',
          scope: 'openid email profile',
          id_token: await createIdToken(),
        });
        return;
      }

      res.status(400).json({ error: 'unsupported_grant_type' });
    });

    issuerApp.get(`${issuerPrefix}/userinfo`, (_req, res) => {
      res.json({
        preferredUsername: 'vault-user',
        name: 'Vault User',
      });
    });

    const started = await startServer(issuerApp);
    issuerServer = started.server;
    issuerBaseUrl = started.baseUrl;
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

    const oldRefreshResponse = await request(app).post('/auth/oidc/refresh').send({
      sessionId: originalSessionId,
    });

    expect(oldRefreshResponse.status).toBe(401);

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: rotatedSessionId,
    });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.loggedOut).toBe(true);

    const logoutUrl = new URL(logoutResponse.body.upstreamLogoutUrl);

    expect(logoutUrl.origin).toBe(issuerBaseUrl);
    expect(logoutUrl.pathname).toBe('/issuer/logout');
    expect(logoutUrl.searchParams.get('post_logout_redirect_uri')).toBe('https://frontend.example.com/logout-complete');
    expect(logoutUrl.searchParams.get('id_token_hint')).toBeTruthy();

    const postLogoutRefreshResponse = await request(app).post('/auth/oidc/refresh').send({
      sessionId: rotatedSessionId,
    });

    expect(postLogoutRefreshResponse.status).toBe(401);
  });

  it('rejects custom returnTo values on a different frontend origin', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
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

  it('supports cookie transport so refresh and logout do not require sessionId in the body', async () => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
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
      .set('Cookie', rotatedSessionCookieHeader ?? '')
      .send({});

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.loggedOut).toBe(true);

    const clearedCookie = (logoutResponse.headers['set-cookie'] ?? [])[0] as string | undefined;

    expect(clearedCookie).toContain('oidc_vault_session=');
    expect(clearedCookie).toContain('Max-Age=0');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    const postLogoutRefreshResponse = await request(app).post('/auth/oidc/refresh').send({});

    expect(postLogoutRefreshResponse.status).toBe(400);
    expect(postLogoutRefreshResponse.body).toMatchObject({
      code: 'OIDC_VAULT_MISSING_SESSION_ID',
    });
  });
});
