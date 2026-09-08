import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
import type { OidcVaultOptions } from '../src/index';

const BACKEND_ORIGIN = 'https://api.example.com';
const FRONTEND_ORIGIN = 'https://frontend.example.com';

const manualConfig = (clientId = 'client_1'): OidcVaultOptions['config'] => ({
  issuer: 'https://issuer.example.com',
  clientId,
  authorizationEndpoint: 'https://issuer.example.com/auth',
  tokenEndpoint: 'https://issuer.example.com/token',
  jwksUri: 'https://issuer.example.com/jwks',
});

const buildOptions = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions => ({
  basePath: '/auth/oidc',
  backendOrigin: BACKEND_ORIGIN,
  config: manualConfig(),
  frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
  storeProvider: createMemoryOidcVaultStore(),
  ...overrides,
});

describe('BOV-15 options snapshot', () => {
  it('accepts frozen inputs without mutating the caller object', async () => {
    const options = buildOptions({
      frontendRedirectUri: FRONTEND_ORIGIN,
      trustedOrigins: [FRONTEND_ORIGIN],
      cookie: { name: 'oidc_vault_session' },
    });
    const before = JSON.stringify({ ...options, storeProvider: undefined });
    // Freeze caller-owned data containers only: service references
    // (storeProvider/hooks/tokenIssuer/now) stay live by design and are
    // never frozen here.
    Object.freeze(options);
    Object.freeze(options.config);
    Object.freeze(options.cookie);
    Object.freeze(options.trustedOrigins);

    const app = express();
    expect(() => app.use(createOidcVaultMiddleware(options))).not.toThrow();
    expect(JSON.stringify({ ...options, storeProvider: undefined })).toBe(before);

    const loginResponse = await request(app).get('/auth/oidc/login');
    expect(loginResponse.status).toBe(302);
  });

  it('does not write normalized frontendRedirectUri back into caller options', () => {
    const options = buildOptions({ frontendRedirectUri: FRONTEND_ORIGIN });
    createOidcVaultMiddleware(options);
    expect(options.frontendRedirectUri).toBe(FRONTEND_ORIGIN);
  });

  it('creates two isolated instances from one reused input', async () => {
    const storeA = createMemoryOidcVaultStore();
    const storeB = createMemoryOidcVaultStore();
    const shared: OidcVaultOptions = {
      basePath: '/auth/oidc',
      backendOrigin: BACKEND_ORIGIN,
      config: manualConfig(),
      frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
      storeProvider: storeA,
    };
    const before = JSON.stringify({ ...shared, storeProvider: undefined });

    const appA = express();
    appA.use(createOidcVaultMiddleware(shared));
    (shared as { storeProvider: unknown }).storeProvider = storeB;
    const appB = express();
    appB.use(createOidcVaultMiddleware(shared));

    expect(JSON.stringify({ ...shared, storeProvider: undefined })).toBe(before);
    expect(
      await request(appA)
        .get('/auth/oidc/login')
        .then((r) => r.status),
    ).toBe(302);
    expect(
      await request(appB)
        .get('/auth/oidc/login')
        .then((r) => r.status),
    ).toBe(302);
  });

  it('keeps body transport after the caller switches to cookie transport', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const options = buildOptions({ storeProvider });
    const app = express();
    app.use(createOidcVaultMiddleware(options));

    options.sessionTransport = 'cookie';
    options.cookie = { name: 'mutated_name' };

    await storeProvider.createSession({
      sessionId: 'sess_bov15_body',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
    });

    const response = await request(app).post('/auth/oidc/logout').send({ sessionId: 'sess_bov15_body' });
    expect(response.status).toBe(200);
    expect(await storeProvider.getSession('sess_bov15_body')).toBeNull();
  });

  it('keeps the construction-time frontend destination for login returnTo', async () => {
    const options = buildOptions({});
    const app = express();
    app.use(createOidcVaultMiddleware(options));

    options.frontendRedirectUri = 'https://other.example.com/callback';

    const response = await request(app).get('/auth/oidc/login').query({ returnTo: '/custom' });
    expect(response.status).toBe(302);
    expect(response.headers.location as string).toContain('https://issuer.example.com/auth');
  });

  it('keeps cookie name and trusted origins from construction time', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const options = buildOptions({
      storeProvider,
      sessionTransport: 'cookie',
      cookie: { name: 'vault_a' },
      trustedOrigins: [FRONTEND_ORIGIN],
    });
    const app = express();
    app.use(createOidcVaultMiddleware(options));

    await storeProvider.createSession({
      sessionId: 'sess_bov15_cookie',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
    });

    options.cookie = { name: 'mutated_name' };
    options.trustedOrigins?.push('https://evil.example.com');

    const okResponse = await request(app)
      .post('/auth/oidc/logout')
      .set('Cookie', 'vault_a=sess_bov15_cookie')
      .set('Origin', FRONTEND_ORIGIN)
      .send({});
    expect(okResponse.status).toBe(200);

    await storeProvider.createSession({
      sessionId: 'sess_bov15_cookie2',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
    });
    const evilResponse = await request(app)
      .post('/auth/oidc/logout')
      .set('Cookie', 'vault_a=sess_bov15_cookie2')
      .set('Origin', 'https://evil.example.com')
      .send({});
    expect(evilResponse.status).toBe(403);
  });

  it('retains store, hooks, token issuer, and clock identity without cloning', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const now = vi.fn(() => Date.now());
    const onLogout = vi.fn();
    const tokenIssuer = { issue: vi.fn(async () => ({ accessToken: 'local_at', expiresIn: 60 })) };
    const options = buildOptions({ storeProvider, hooks: { onLogout }, tokenIssuer, now });
    const app = express();
    app.use(createOidcVaultMiddleware(options));

    const loginResponse = await request(app).get('/auth/oidc/login');
    expect(loginResponse.status).toBe(302);
    expect(now).toHaveBeenCalled();

    await storeProvider.createSession({
      sessionId: 'sess_bov15_svc',
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'stored-id-token',
    });
    await storeProvider.createExchangeCode({
      code: 'code_bov15',
      sessionId: 'sess_bov15_svc',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30_000,
    });

    const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: 'code_bov15' });
    expect(exchangeResponse.status).toBe(200);
    expect(tokenIssuer.issue).toHaveBeenCalledTimes(1);
    expect(exchangeResponse.body).toMatchObject({ accessToken: 'local_at' });

    const logoutResponse = await request(app).post('/auth/oidc/logout').send({ sessionId: 'sess_bov15_svc' });
    expect(logoutResponse.status).toBe(200);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps public root exports and route behavior intact', async () => {
    const root = await import('../src/index');
    expect(typeof root.createOidcVaultMiddleware).toBe('function');
    expect(typeof root.createOidcVaultAccessTokenMiddleware).toBe('function');
    expect(typeof root.createOidcVaultJwtAccessTokenValidator).toBe('function');
    expect(typeof root.resolveOidcVaultConfig).toBe('function');

    const app = express();
    app.use(createOidcVaultMiddleware(buildOptions({})));
    expect(
      await request(app)
        .get('/auth/oidc/login')
        .then((r) => r.status),
    ).toBe(302);
    expect(
      await request(app)
        .post('/auth/oidc/logout')
        .send({})
        .then((r) => r.body),
    ).toMatchObject({
      code: 'OIDC_VAULT_MISSING_SESSION_ID',
    });
  });
});
