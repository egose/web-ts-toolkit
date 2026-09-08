import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';
import { composeRefreshedUserProfile } from '../src/token-validation';

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

describe('BOV-07 refresh profile precedence', () => {
  const backendOrigin = 'https://api.example.com';
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;
  let refreshTokenResponseOverride: Record<string, unknown> | undefined;
  let userInfoResponseOverride: Record<string, unknown> | undefined;

  const createSignedToken = async (
    payload: Record<string, unknown>,
    options?: { audience?: string | string[]; issuer?: string; expiresIn?: number },
  ): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(options?.issuer ?? `${issuerBaseUrl}/issuer`)
      .setAudience(options?.audience ?? 'client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + (options?.expiresIn ?? 3600));

    return jwt.sign(privateKey);
  };

  const createIdToken = async (payload?: Record<string, unknown>, expiresIn?: number): Promise<string> =>
    createSignedToken(
      {
        sub: 'user_1',
        sid: 'provider_sid_1',
        email: 'user@example.com',
        ...payload,
      },
      expiresIn === undefined ? undefined : { expiresIn },
    );

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));

    const keyPair = await generateKeyPair('RS256');
    publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'test-key';
    privateKey = keyPair.privateKey;

    issuerApp.get('/issuer/.well-known/openid-configuration', (_req, res) => {
      res.json({
        issuer: `${issuerBaseUrl}/issuer`,
        authorization_endpoint: `${issuerBaseUrl}/issuer/authorize`,
        token_endpoint: `${issuerBaseUrl}/issuer/token`,
        userinfo_endpoint: `${issuerBaseUrl}/issuer/userinfo`,
        jwks_uri: `${issuerBaseUrl}/issuer/jwks`,
        end_session_endpoint: `${issuerBaseUrl}/issuer/logout`,
      });
    });

    issuerApp.get('/issuer/jwks', (_req, res) => {
      res.json({ keys: [publicJwk] });
    });

    issuerApp.post('/issuer/token', async (_req, res) => {
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
    });

    issuerApp.get('/issuer/userinfo', (_req, res) => {
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
    refreshTokenResponseOverride = undefined;
    userInfoResponseOverride = undefined;
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

  const createApp = (storeProvider: ReturnType<typeof createMemoryOidcVaultStore>, fetchUserInfo: boolean) => {
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1', // pragma: allowlist secret
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
        fetchUserInfo,
      }),
    );

    return app;
  };

  it('fresh changed ID claims win over retained values when UserInfo is disabled', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_fresh_wins';
    const app = createApp(storeProvider, false);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken({ email: 'old@example.com', name: 'Old Name' }),
      user: { sub: 'user_1', email: 'old@example.com', name: 'Old Name', roles: ['reader'] },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createIdToken({ email: 'new@example.com', name: 'New Name', roles: ['admin'] }),
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      sub: 'user_1',
      email: 'new@example.com',
      name: 'New Name',
      roles: ['admin'],
    });

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toMatchObject({
      sub: 'user_1',
      email: 'new@example.com',
      name: 'New Name',
      roles: ['admin'],
    });
    expect(stored?.user).toEqual(response.body.user);
  });

  it('fresh changed ID claims win when UserInfo is unavailable (no new access_token)', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_no_userinfo';
    const app = createApp(storeProvider, true);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken({ email: 'old@example.com' }),
      user: { sub: 'user_1', email: 'old@example.com', name: 'Old Name' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createIdToken({ email: 'new@example.com', name: 'New Name' }),
      access_token: undefined,
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      sub: 'user_1',
      email: 'new@example.com',
      name: 'New Name',
    });
    // No UserInfo fetch happened, so provider-UserInfo keys are absent.
    expect(response.body.user).not.toHaveProperty('preferredUsername');

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toEqual(response.body.user);
  });

  it('matching fresh UserInfo overlays fresh ID claims', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_userinfo_wins';
    const app = createApp(storeProvider, true);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken({ email: 'old@example.com' }),
      user: { sub: 'user_1', email: 'old@example.com', name: 'Old Name' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createIdToken({ email: 'id@example.com', name: 'ID Name', idOnlyClaim: 'from-id' }),
    };
    userInfoResponseOverride = { sub: 'user_1', email: 'ui@example.com', name: 'UI Name' };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      sub: 'user_1',
      email: 'ui@example.com',
      name: 'UI Name',
      idOnlyClaim: 'from-id',
    });

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toEqual(response.body.user);
  });

  it('retains the verified profile verbatim when refresh omits a new ID token', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_retain';
    const app = createApp(storeProvider, false);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      user: { sub: 'user_1', email: 'retained@example.com', department: 'engineering' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = { id_token: undefined };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.sessionId).not.toBe(sessionId);
    expect(response.body.user).toEqual({ sub: 'user_1', email: 'retained@example.com', department: 'engineering' });

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.subject).toBe('user_1');
    expect(stored?.user).toEqual(response.body.user);
  });

  it('fresh UserInfo overlays the retained base when refresh omits a new ID token', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_retain_plus_userinfo';
    const app = createApp(storeProvider, true);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      user: { sub: 'user_1', email: 'id-old@example.com', department: 'engineering' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = { id_token: undefined };
    userInfoResponseOverride = { sub: 'user_1', email: 'ui-new@example.com' };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      sub: 'user_1',
      email: 'ui-new@example.com',
      department: 'engineering',
    });

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toEqual(response.body.user);
  });

  it('drops removed provider claims when a new ID token omits them', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_removed';
    const app = createApp(storeProvider, false);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      user: { sub: 'user_1', email: 'old@example.com', legacyRole: 'old-role', name: 'Old' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createSignedToken({ sub: 'user_1', sid: 'provider_sid_2' }),
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user.sub).toBe('user_1');
    expect(response.body.user).not.toHaveProperty('email');
    expect(response.body.user).not.toHaveProperty('legacyRole');
    expect(response.body.user).not.toHaveProperty('name');

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toEqual(response.body.user);
  });

  it('does not carry application-added user keys forward when fresh identity arrives', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_app_keys';
    const app = createApp(storeProvider, false);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken({ email: 'old@example.com' }),
      user: { sub: 'user_1', email: 'old@example.com', appTheme: 'dark' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createIdToken({ email: 'new@example.com' }),
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ sub: 'user_1', email: 'new@example.com' });
    expect(response.body.user).not.toHaveProperty('appTheme');

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toEqual(response.body.user);
  });

  it('rejects a refreshed ID token that changes the session subject without rotating', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_sub_mismatch';
    const app = createApp(storeProvider, false);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      user: { sub: 'user_1', email: 'user@example.com' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createSignedToken({ sub: 'user_2', sid: 'provider_sid_1', email: 'other@example.com' }),
    };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'OIDC_VAULT_INVALID_ID_TOKEN' });

    const stored = await storeProvider.getSession(sessionId);
    expect(stored?.subject).toBe('user_1');
    expect(stored?.user).toMatchObject({ sub: 'user_1', email: 'user@example.com' });
  });

  it('refreshes without a new ID token against an expired stored ID token', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_expired_evidence';
    const app = createApp(storeProvider, false);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(undefined, -3600),
      user: { sub: 'user_1', email: 'retained@example.com' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = { id_token: undefined };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ sub: 'user_1', email: 'retained@example.com' });

    const stored = await storeProvider.getSession(response.body.sessionId as string);
    expect(stored?.user).toEqual(response.body.user);
  });

  it('rejects mismatched fresh UserInfo without rotating', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_bov07_userinfo_mismatch';
    const app = createApp(storeProvider, true);

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      user: { sub: 'user_1', email: 'user@example.com' },
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });

    refreshTokenResponseOverride = {
      id_token: await createIdToken({ email: 'new@example.com' }),
    };
    userInfoResponseOverride = { sub: 'user_2', email: 'intruder@example.com' };

    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'OIDC_VAULT_INVALID_USERINFO' });

    const stored = await storeProvider.getSession(sessionId);
    expect(stored?.subject).toBe('user_1');
    expect(stored?.user).toMatchObject({ sub: 'user_1', email: 'user@example.com' });
  });

  it('composeRefreshedUserProfile keeps fresh sources above retained data', () => {
    const retained = { sub: 'user_1', email: 'old@example.com', stale: 'stale-value' };

    expect(
      composeRefreshedUserProfile('user_1', retained, { sub: 'user_1', email: 'new@example.com' }, undefined),
    ).toEqual({ sub: 'user_1', email: 'new@example.com' });

    expect(
      composeRefreshedUserProfile(
        'user_1',
        retained,
        { sub: 'user_1', email: 'id@example.com' },
        { sub: 'user_1', email: 'ui@example.com' },
      ),
    ).toEqual({ sub: 'user_1', email: 'ui@example.com' });

    expect(composeRefreshedUserProfile('user_1', retained, undefined, undefined)).toEqual(retained);
    expect(composeRefreshedUserProfile('user_1', retained, undefined, { sub: 'user_1', name: 'UI' })).toEqual({
      sub: 'user_1',
      email: 'old@example.com',
      stale: 'stale-value',
      name: 'UI',
    });
  });
});
