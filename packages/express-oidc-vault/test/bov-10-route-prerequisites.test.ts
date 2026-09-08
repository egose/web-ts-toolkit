import http from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

const BACKEND_ORIGIN = 'https://api.example.com';
const FRONTEND_ORIGIN = 'https://frontend.example.com';

type StartedServer = {
  server: http.Server;
  baseUrl: string;
  tokenRequests: number;
  discoveryRequests: number;
};

const startFaultServer = async (): Promise<StartedServer> => {
  const state = { tokenRequests: 0, discoveryRequests: 0 };
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  // Injected metadata failure: sanitized 502 OIDC_VAULT_DISCOVERY_FAILED.
  app.get('/issuer-down/.well-known/openid-configuration', (_req, res) => {
    state.discoveryRequests += 1;
    res.status(503).send('transient discovery failure');
  });
  app.post('/token', (_req, res) => {
    state.tokenRequests += 1;
    res.json({ token_type: 'Bearer', expires_in: 3600 });
  });

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
    get tokenRequests() {
      return state.tokenRequests;
    },
    get discoveryRequests() {
      return state.discoveryRequests;
    },
  };
};

describe('BOV-10 route prerequisites', () => {
  let tokenServer: StartedServer | undefined;

  beforeAll(async () => {
    tokenServer = await startFaultServer();
  });

  beforeEach(() => {
    __resetProviderClientCachesForTests();
  });

  afterAll(async () => {
    if (!tokenServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      tokenServer?.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('fails the callback before session/code creation when no frontend destination is configured', async () => {
    if (!tokenServer) {
      throw new Error('Token counting server is not initialized.');
    }

    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const createSessionSpy = vi.spyOn(storeProvider, 'createSession');
    const createExchangeCodeSpy = vi.spyOn(storeProvider, 'createExchangeCode');
    const tokenRequestsBefore = tokenServer.tokenRequests;

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: {
          issuer: 'https://issuer.example.com',
          clientId: 'client_1',
          authorizationEndpoint: 'https://issuer.example.com/auth',
          // Reachable counting endpoint: a late destination check would hit it.
          tokenEndpoint: `${tokenServer.baseUrl}/token`,
          jwksUri: 'https://issuer.example.com/jwks',
        },
        // No frontendRedirectUri, so neither branch of the destination exists.
        storeProvider,
      }),
    );

    const loginResponse = await request(app).get('/auth/oidc/login');

    expect(loginResponse.status).toBe(302);

    const state = new URL(loginResponse.headers.location as string).searchParams.get('state');

    expect(state).toBeTruthy();

    const callbackResponse = await request(app).get('/auth/oidc/callback').query({
      state,
      code: 'authcode:unused',
    });

    expect(callbackResponse.status).toBe(500);
    expect(callbackResponse.body).toMatchObject({ code: 'OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI' });
    // No durable callback state was created and the provider was never called.
    expect(createSessionSpy).not.toHaveBeenCalled();
    expect(createExchangeCodeSpy).not.toHaveBeenCalled();
    expect(tokenServer.tokenRequests).toBe(tokenRequestsBefore);
  });

  it('completes local-only logout without provider discovery when discovery fails', async () => {
    if (!tokenServer) {
      throw new Error('Fault server is not initialized.');
    }

    const failingIssuer = `${tokenServer.baseUrl}/issuer-down`;
    const discoveryRequestsBefore = tokenServer.discoveryRequests;
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const onLogout = vi.fn();
    const onError = vi.fn();

    await storeProvider.createSession({
      sessionId: 'sess_bov10_local',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
      provider: { issuer: failingIssuer, clientId: 'client_1' },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: { issuer: failingIssuer, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
        storeProvider,
        hooks: { onLogout, onError },
      }),
    );

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: 'sess_bov10_local',
    });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toMatchObject({ loggedOut: true });
    expect(await storeProvider.getSession('sess_bov10_local')).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    // Local success reports no discovery error to the client or onError.
    expect(onError).not.toHaveBeenCalled();
    // Local-only logout never contacts the provider.
    expect(tokenServer.discoveryRequests).toBe(discoveryRequestsBefore);
  });

  it('clears the session cookie on local-only logout with cookie transport while discovery fails', async () => {
    if (!tokenServer) {
      throw new Error('Fault server is not initialized.');
    }

    const failingIssuer = `${tokenServer.baseUrl}/issuer-down`;
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const onLogout = vi.fn();

    await storeProvider.createSession({
      sessionId: 'sess_bov10_cookie',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
      provider: { issuer: failingIssuer, clientId: 'client_1' },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: { issuer: failingIssuer, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
        sessionTransport: 'cookie',
        trustedOrigins: [FRONTEND_ORIGIN],
        storeProvider,
        hooks: { onLogout },
      }),
    );

    const logoutResponse = await request(app)
      .post('/auth/oidc/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', 'oidc_vault_session=sess_bov10_cookie');

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toMatchObject({ loggedOut: true });
    expect(await storeProvider.getSession('sess_bov10_cookie')).toBeNull();
    expect(logoutResponse.headers['set-cookie']?.join(';')).toMatch(/Max-Age=0/);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps local revocation and notification on redirected logout when discovery fails', async () => {
    if (!tokenServer) {
      throw new Error('Fault server is not initialized.');
    }

    const failingIssuer = `${tokenServer.baseUrl}/issuer-down`;
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const onLogout = vi.fn();
    const onError = vi.fn();

    await storeProvider.createSession({
      sessionId: 'sess_bov10_redirect_fail',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
      provider: { issuer: failingIssuer, clientId: 'client_1' },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: { issuer: failingIssuer, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
        storeProvider,
        hooks: { onLogout, onError },
      }),
    );

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: 'sess_bov10_redirect_fail',
      redirect: true,
    });

    // Explicit upstream-failure semantics: the local durable outcome is still
    // reported accurately (revoked == loggedOut) instead of a 5xx that would
    // imply local logout failed. The upstream failure goes to onError only.
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toMatchObject({ loggedOut: true });
    expect(logoutResponse.headers.location).toBeUndefined();
    expect(await storeProvider.getSession('sess_bov10_redirect_fail')).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      route: 'logout',
      error: expect.objectContaining({ code: expect.stringMatching(/^OIDC_VAULT_DISCOVERY_/) }),
    });
  });

  it('still redirects on redirected logout when upstream metadata is available', async () => {
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const onLogout = vi.fn();
    const onError = vi.fn();

    await storeProvider.createSession({
      sessionId: 'sess_bov10_redirect_ok',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
      provider: { issuer: 'https://issuer.example.com', clientId: 'client_1' },
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: {
          issuer: 'https://issuer.example.com',
          clientId: 'client_1',
          authorizationEndpoint: 'https://issuer.example.com/auth',
          tokenEndpoint: 'https://issuer.example.com/token',
          jwksUri: 'https://issuer.example.com/jwks',
          endSessionEndpoint: 'https://issuer.example.com/logout',
        },
        frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
        postLogoutRedirectUri: `${FRONTEND_ORIGIN}/logged-out`,
        storeProvider,
        hooks: { onLogout, onError },
      }),
    );

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({
      sessionId: 'sess_bov10_redirect_ok',
      redirect: true,
    });

    expect(logoutResponse.status).toBe(302);

    const logoutUrl = new URL(logoutResponse.headers.location as string);

    expect(logoutUrl.origin).toBe('https://issuer.example.com');
    expect(logoutUrl.pathname).toBe('/logout');
    expect(logoutUrl.searchParams.get('id_token_hint')).toBe('stored-id-token');
    expect(logoutUrl.searchParams.get('post_logout_redirect_uri')).toBe(`${FRONTEND_ORIGIN}/logged-out`);
    expect(await storeProvider.getSession('sess_bov10_redirect_ok')).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
