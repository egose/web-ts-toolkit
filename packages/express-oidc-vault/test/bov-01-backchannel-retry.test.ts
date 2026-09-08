import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
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

describe('BOV-01 backchannel logout retry safety', () => {
  const backendOrigin = 'https://api.example.com';
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;

  type LogoutTokenInput = {
    issuer: string;
    audience: string;
    sid?: string;
    sub?: string;
    jti?: string;
    events?: Record<string, unknown>;
    typ?: string;
    omitIssuedAt?: boolean;
    expiresInSeconds?: number;
  };

  const createLogoutToken = async (input: LogoutTokenInput): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      jti: input.jti ?? `logout_${now}_${Math.random().toString(36).slice(2)}`,
      events: input.events ?? {
        'http://schemas.openid.net/event/backchannel-logout': {},
      },
    };

    if (input.sid !== undefined) {
      payload.sid = input.sid;
    }

    if (input.sub !== undefined) {
      payload.sub = input.sub;
    }

    let jwt = new SignJWT(payload)
      .setProtectedHeader({
        alg: 'RS256',
        kid: 'test-key',
        ...(input.typ !== undefined ? { typ: input.typ } : {}),
      })
      .setIssuer(input.issuer)
      .setAudience(input.audience);

    if (!input.omitIssuedAt) {
      jwt = jwt.setIssuedAt(now);
    }

    jwt = jwt.setExpirationTime(now + (input.expiresInSeconds ?? 3600));

    return jwt.sign(privateKey);
  };

  const seedSession = async (
    store: OidcVaultStoreProvider,
    input: { sessionId: string; subject: string; providerSessionId: string; issuer: string; clientId: string },
  ): Promise<void> => {
    await store.createSession({
      sessionId: input.sessionId,
      subject: input.subject,
      providerSessionId: input.providerSessionId,
      provider: { issuer: input.issuer, clientId: input.clientId },
      refreshToken: `refresh_${input.sessionId}`,
      idToken: `id_${input.sessionId}`,
    });
  };

  const wrapStore = (
    base: OidcVaultStoreProvider,
    overrides: Partial<OidcVaultStoreProvider>,
  ): OidcVaultStoreProvider => ({
    createAuthorizationTransaction: base.createAuthorizationTransaction.bind(base),
    consumeAuthorizationTransaction: base.consumeAuthorizationTransaction.bind(base),
    createExchangeCode: base.createExchangeCode.bind(base),
    consumeExchangeCode: base.consumeExchangeCode.bind(base),
    createSession: base.createSession.bind(base),
    getSession: base.getSession.bind(base),
    rotateSession: base.rotateSession.bind(base),
    deleteSession: base.deleteSession.bind(base),
    deleteSessionsByLogicalSessionId: base.deleteSessionsByLogicalSessionId.bind(base),
    consumeBackchannelLogoutTokenJti: base.consumeBackchannelLogoutTokenJti.bind(base),
    deleteSessionsBySubject: base.deleteSessionsBySubject.bind(base),
    deleteSessionsByProviderSessionId: base.deleteSessionsByProviderSessionId.bind(base),
    ...overrides,
  });

  const createVaultApp = (
    store: OidcVaultStoreProvider,
    issuer: string,
    clientId: string,
    hooks?: {
      onLogout?: (...args: never[]) => void | Promise<void>;
      onError?: (...args: never[]) => void | Promise<void>;
    },
  ): express.Express => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: { issuer, clientId },
        storeProvider: store,
        hooks: hooks as never,
      }),
    );

    return app;
  };

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));

    const keyPair = await generateKeyPair('RS256');
    publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'test-key';
    privateKey = keyPair.privateKey;

    for (const prefix of ['/issuer-a', '/issuer-b']) {
      issuerApp.get(`${prefix}/.well-known/openid-configuration`, (_req, res) => {
        res.json({
          issuer: `${issuerBaseUrl}${prefix}`,
          authorization_endpoint: `${issuerBaseUrl}${prefix}/authorize`,
          token_endpoint: `${issuerBaseUrl}${prefix}/token`,
          userinfo_endpoint: `${issuerBaseUrl}${prefix}/userinfo`,
          jwks_uri: `${issuerBaseUrl}${prefix}/jwks`,
          end_session_endpoint: `${issuerBaseUrl}${prefix}/logout`,
        });
      });

      issuerApp.get(`${prefix}/jwks`, (_req, res) => {
        res.json({ keys: [publicJwk] });
      });
    }

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

  it('retries a valid token after a one-time deletion failure instead of a misleading completed no-op', async () => {
    const issuer = `${issuerBaseUrl}/issuer-a`;
    const baseStore = createMemoryOidcVaultStore();
    const onLogout = vi.fn();
    const onError = vi.fn();
    let failuresRemaining = 1;

    const store: OidcVaultStoreProvider = wrapStore(baseStore, {
      deleteSessionsByProviderSessionId: async (input) => {
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new Error('injected one-time deletion failure');
        }

        return baseStore.deleteSessionsByProviderSessionId(input);
      },
    });

    await seedSession(store, {
      sessionId: 'sess_retry_1',
      subject: 'user_retry',
      providerSessionId: 'provider_sid_retry',
      issuer,
      clientId: 'client_a',
    });

    const app = createVaultApp(store, issuer, 'client_a', { onLogout, onError });
    const logoutToken = await createLogoutToken({
      issuer,
      audience: 'client_a',
      sid: 'provider_sid_retry',
      jti: 'retry_jti_1',
    });

    const firstResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });

    expect(firstResponse.status).toBe(500);
    expect(await baseStore.getSession('sess_retry_1')).not.toBeNull();

    const retryResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });

    expect(retryResponse.status).toBe(200);
    expect(retryResponse.body).toEqual({ loggedOut: true, revokedSessions: 1 });
    expect(await baseStore.getSession('sess_retry_1')).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLogout.mock.calls[0]?.[0]).toMatchObject({
      route: 'backchannel-logout',
      metadata: { revokedSessions: 1 },
    });
  });

  it('concurrent duplicates cannot leave the target lineage active after reported completion', async () => {
    const issuer = `${issuerBaseUrl}/issuer-a`;
    const baseStore = createMemoryOidcVaultStore();
    const onLogout = vi.fn();
    let deleteCalls = 0;

    const store: OidcVaultStoreProvider = wrapStore(baseStore, {
      deleteSessionsByProviderSessionId: async (input) => {
        deleteCalls += 1;

        if (deleteCalls === 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        return baseStore.deleteSessionsByProviderSessionId(input);
      },
    });

    await seedSession(store, {
      sessionId: 'sess_concurrent_1',
      subject: 'user_concurrent',
      providerSessionId: 'provider_sid_concurrent',
      issuer,
      clientId: 'client_a',
    });

    const app = createVaultApp(store, issuer, 'client_a', { onLogout });
    const logoutToken = await createLogoutToken({
      issuer,
      audience: 'client_a',
      sid: 'provider_sid_concurrent',
      jti: 'concurrent_jti_1',
    });

    const sendLogout = (): Promise<{ status: number; body: { revokedSessions: number } }> =>
      request(app)
        .post('/auth/oidc/backchannel-logout')
        .type('form')
        .send({ logout_token: logoutToken })
        .then((response) => ({ status: response.status, body: response.body as { revokedSessions: number } }));

    const [first, second] = await Promise.all([sendLogout(), sendLogout()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.revokedSessions + second.body.revokedSessions).toBe(1);
    expect(await baseStore.getSession('sess_concurrent_1')).toBeNull();
    expect(onLogout.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onLogout.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('keeps sequential replay harmless and scoped to unrelated sessions', async () => {
    const issuer = `${issuerBaseUrl}/issuer-a`;
    const store = createMemoryOidcVaultStore();
    const onLogout = vi.fn();

    await seedSession(store, {
      sessionId: 'sess_replay_target',
      subject: 'user_replay',
      providerSessionId: 'provider_sid_replay',
      issuer,
      clientId: 'client_a',
    });
    await seedSession(store, {
      sessionId: 'sess_replay_unrelated',
      subject: 'user_other',
      providerSessionId: 'provider_sid_other',
      issuer,
      clientId: 'client_a',
    });

    const app = createVaultApp(store, issuer, 'client_a', { onLogout });
    const logoutToken = await createLogoutToken({
      issuer,
      audience: 'client_a',
      sid: 'provider_sid_replay',
      jti: 'replay_jti_1',
    });

    const firstResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body).toEqual({ loggedOut: true, revokedSessions: 1 });

    const replayResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: logoutToken });

    expect(replayResponse.status).toBe(200);
    expect(replayResponse.body).toEqual({ loggedOut: true, revokedSessions: 0 });
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(await store.getSession('sess_replay_unrelated')).not.toBeNull();
  });

  it('isolates independent issuers sharing one store and the same jti', async () => {
    const issuerA = `${issuerBaseUrl}/issuer-a`;
    const issuerB = `${issuerBaseUrl}/issuer-b`;
    const sharedStore = createMemoryOidcVaultStore();
    const onLogoutA = vi.fn();
    const onLogoutB = vi.fn();

    await seedSession(sharedStore, {
      sessionId: 'sess_a_1',
      subject: 'user_a',
      providerSessionId: 'shared_provider_sid',
      issuer: issuerA,
      clientId: 'client_a',
    });
    await seedSession(sharedStore, {
      sessionId: 'sess_b_1',
      subject: 'user_b',
      providerSessionId: 'shared_provider_sid',
      issuer: issuerB,
      clientId: 'client_b',
    });

    const appA = createVaultApp(sharedStore, issuerA, 'client_a', { onLogout: onLogoutA });
    const appB = createVaultApp(sharedStore, issuerB, 'client_b', { onLogout: onLogoutB });

    const tokenA = await createLogoutToken({
      issuer: issuerA,
      audience: 'client_a',
      sid: 'shared_provider_sid',
      jti: 'shared_jti_across_issuers',
    });
    const tokenB = await createLogoutToken({
      issuer: issuerB,
      audience: 'client_b',
      sid: 'shared_provider_sid',
      jti: 'shared_jti_across_issuers',
    });

    const responseA = await request(appA)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: tokenA });

    expect(responseA.status).toBe(200);
    expect(responseA.body).toEqual({ loggedOut: true, revokedSessions: 1 });
    expect(await sharedStore.getSession('sess_a_1')).toBeNull();
    expect(await sharedStore.getSession('sess_b_1')).not.toBeNull();

    const responseB = await request(appB)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: tokenB });

    expect(responseB.status).toBe(200);
    expect(responseB.body).toEqual({ loggedOut: true, revokedSessions: 1 });
    expect(await sharedStore.getSession('sess_b_1')).toBeNull();
    expect(onLogoutA).toHaveBeenCalledTimes(1);
    expect(onLogoutB).toHaveBeenCalledTimes(1);
  });

  it('does not allocate durable work for invalid or expired tokens', async () => {
    const issuer = `${issuerBaseUrl}/issuer-a`;
    const baseStore = createMemoryOidcVaultStore();
    const consumeSpy = vi.spyOn(baseStore, 'consumeBackchannelLogoutTokenJti');
    const deleteSpy = vi.spyOn(baseStore, 'deleteSessionsByProviderSessionId');

    await seedSession(baseStore, {
      sessionId: 'sess_durable_1',
      subject: 'user_durable',
      providerSessionId: 'provider_sid_durable',
      issuer,
      clientId: 'client_a',
    });

    const app = createVaultApp(baseStore, issuer, 'client_a');

    const wrongTypToken = await createLogoutToken({
      issuer,
      audience: 'client_a',
      sid: 'provider_sid_durable',
      jti: 'durable_jti_invalid',
      typ: 'JWT',
    });

    const invalidResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: wrongTypToken });

    expect(invalidResponse.status).toBe(400);
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    const expiredToken = await createLogoutToken({
      issuer,
      audience: 'client_a',
      sid: 'provider_sid_durable',
      jti: 'durable_jti_expired',
      expiresInSeconds: -60,
    });

    const expiredResponse = await request(app)
      .post('/auth/oidc/backchannel-logout')
      .type('form')
      .send({ logout_token: expiredToken });

    expect(expiredResponse.status).toBeGreaterThanOrEqual(400);
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(await baseStore.getSession('sess_durable_1')).not.toBeNull();
  });
});
