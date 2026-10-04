import { createHash } from 'node:crypto';
import http from 'node:http';

import express from 'express';
import { decodeJwt, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  type IssueTokenInput,
  type OidcVaultHooks,
  type OidcVaultSessionTransport,
} from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

/**
 * DBJWT-01 regression matrix, isolated from the historical BOV investigations.
 *
 * Session             Policy             Exchange / refresh (body + cookie)
 * Legacy unbound      No binding config  Runnable: no proof needed, Bearer JWT works
 * Legacy unbound      Explicit optional  Active legacy/seeded lifecycle in dpop-vault-session
 * Legacy unbound      Required           Active callback/code/session rejection, before mutation
 * Login-bound key A   Optional/required  Active complete login/callback/exchange/refresh/API lifecycle
 * Login-bound key A   Either mode        Active browser-transfer, original-key and replay attacks
 *
 * Section 8 of the DBJWT task plan freezes the approved configuration/protocol.
 * DBJWT-06's API matrix is active in dpop-api.test.ts, dpop-proof.test.ts and
 * dpop-jwt-confirmation.test.ts (exact API regression links below).
 * DBJWT-03 covers construction/policy/issuance primitives in separate tests;
 * DBJWT-04's actual POST initiation/cookie/headerless callback matrix is active
 * in dpop-login-callback.test.ts (exact named links below).
 * DBJWT-05's complete HTTP lifecycle is active in dpop-vault-session.test.ts;
 * the 14 per-transport session/browser references below retain all 28 scenarios.
 * Owner IDs
 * follow the detailed task headings: DBJWT-04 login, DBJWT-05 exchange/refresh,
 * DBJWT-06 API, DBJWT-07 replay, DBJWT-08 stores.
 *
 * The runnable fixture has isolated cookie jars, separate upstream/local JWT
 * signing keys, single-use upstream refresh tokens, provider request records,
 * and store mutation spies. It models HTTP clients,
 * not real browser cookie/CORS enforcement or IndexedDB key persistence.
 */

const BACKEND_ORIGIN = 'https://api.example.com';
const FRONTEND_ORIGIN = 'https://frontend.example.com';
const TRANSPORTS = ['body', 'cookie'] as const;
const SESSION_COOKIE = 'oidc_vault_session';
const SUBJECT = 'legacy_user';
const LOCAL_AUDIENCE = 'dbjwt-regression-api';
const LOCAL_SCOPE = 'read:profile';

const createBrowser = (app: express.Express) => {
  const jar = new Map<string, string>();
  const withCookies = (test: request.Test): request.Test => {
    if (jar.size > 0) {
      test.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    return test;
  };

  return {
    get: (path: string) => withCookies(request(app).get(path)),
    post: (path: string) => withCookies(request(app).post(path)),
    capture(response: request.Response): void {
      const raw = response.headers['set-cookie'] as string[] | string | undefined;
      for (const cookie of raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]) {
        const pair = cookie.split(';', 1)[0] ?? '';
        const separator = pair.indexOf('=');
        if (separator < 1) continue;
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
    },
    sessionId: (): string | undefined => {
      const value = jar.get(SESSION_COOKIE);
      return value ? decodeURIComponent(value) : undefined;
    },
  };
};

type Browser = ReturnType<typeof createBrowser>;

const expectBearerCredentials = (
  response: request.Response,
  browser: Browser,
  transport: OidcVaultSessionTransport,
): { sessionId: string; accessToken: string } => {
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, user: { sub: SUBJECT } });
  expect(response.body.refreshToken).toBeUndefined();
  expect(response.body.idToken).toBeUndefined();
  expect(response.text).not.toContain('upstream_refresh:');
  expect(response.text).not.toContain('upstream_access:');
  browser.capture(response);

  const sessionId = transport === 'body' ? (response.body.sessionId as string) : browser.sessionId();
  expect(sessionId).toMatch(/^sess_/);
  if (transport === 'cookie') {
    expect(response.body).not.toHaveProperty('sessionId');
    const rawCookies: unknown = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies
      : typeof rawCookies === 'string'
        ? [rawCookies]
        : [];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
  } else {
    expect(response.headers['set-cookie']).toBeUndefined();
  }

  const accessToken = response.body.accessToken as string;
  expect(decodeJwt(accessToken)).toMatchObject({
    iss: BACKEND_ORIGIN,
    aud: LOCAL_AUDIENCE,
    sub: SUBJECT,
    sid: sessionId,
    scope: LOCAL_SCOPE,
  });
  expect(decodeJwt(accessToken)).not.toHaveProperty('cnf');
  return { sessionId: sessionId as string, accessToken };
};

const expectBearerApi = async (browser: Browser, credentials: { sessionId: string; accessToken: string }) => {
  const response = await browser.get('/api/profile').set('Authorization', `Bearer ${credentials.accessToken}`);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ subject: SUBJECT, sessionId: credentials.sessionId, scope: LOCAL_SCOPE });
};

const refreshRequest = (browser: Browser, transport: OidcVaultSessionTransport, sessionId: string) => {
  const test = browser.post('/auth/oidc/refresh');
  if (transport === 'cookie') test.set('Origin', FRONTEND_ORIGIN);
  return test.send(transport === 'body' ? { sessionId } : {});
};

describe('DBJWT-01 runnable legacy bearer baseline', () => {
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let providerJwk: JWK;
  let providerPrivateKey: CryptoKey;
  let localPublicKey: CryptoKey;
  let localPrivateKey: CryptoKey;
  let authorizationCodeRequests: Record<string, unknown>[] = [];
  let refreshRequestTokens: string[] = [];
  let refreshTokens = new Map<string, string>();
  let refreshSequence = 0;

  const registerRefreshToken = (subject: string): string => {
    const token = `upstream_refresh:${subject}:${++refreshSequence}`;
    refreshTokens.set(token, subject);
    return token;
  };

  const createIdToken = async (subject: string, nonce?: string): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: subject, sid: `provider_sid_${subject}`, ...(nonce ? { nonce } : {}) })
      .setProtectedHeader({ alg: 'RS256', kid: 'dbjwt-provider-key' })
      .setIssuer(`${issuerBaseUrl}/issuer`)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(providerPrivateKey);
  };

  beforeAll(async () => {
    const providerKeys = await generateKeyPair('RS256');
    providerJwk = { ...(await exportJWK(providerKeys.publicKey)), kid: 'dbjwt-provider-key' };
    providerPrivateKey = providerKeys.privateKey;
    const localKeys = await generateKeyPair('ES256');
    localPublicKey = localKeys.publicKey;
    localPrivateKey = localKeys.privateKey;

    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));
    issuerApp.get('/issuer/.well-known/openid-configuration', (_req, res) => {
      res.json({
        issuer: `${issuerBaseUrl}/issuer`,
        authorization_endpoint: `${issuerBaseUrl}/issuer/authorize`,
        token_endpoint: `${issuerBaseUrl}/issuer/token`,
        userinfo_endpoint: `${issuerBaseUrl}/issuer/userinfo`,
        jwks_uri: `${issuerBaseUrl}/issuer/jwks`,
      });
    });
    issuerApp.get('/issuer/jwks', (_req, res) => res.json({ keys: [providerJwk] }));
    issuerApp.post('/issuer/token', async (req, res) => {
      let subject: string;
      let nonce: string | undefined;
      if (req.body.grant_type === 'authorization_code') {
        authorizationCodeRequests.push({ ...req.body });
        const parts = String(req.body.code ?? '').split(':');
        if (parts[0] !== 'authcode' || !parts[1] || !parts[2]) {
          res.status(400).json({ error: 'invalid_grant' });
          return;
        }
        nonce = parts[1];
        subject = parts[2];
      } else if (req.body.grant_type === 'refresh_token') {
        const token = String(req.body.refresh_token ?? '');
        refreshRequestTokens.push(token);
        const refreshSubject = refreshTokens.get(token);
        if (!refreshSubject) {
          res.status(400).json({ error: 'invalid_grant' });
          return;
        }
        subject = refreshSubject;
        refreshTokens.delete(token);
      } else {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }

      res.json({
        token_type: 'Bearer',
        expires_in: 3600,
        access_token: `upstream_access:${subject}`,
        refresh_token: registerRefreshToken(subject),
        scope: 'openid email profile',
        id_token: await createIdToken(subject, nonce),
      });
    });
    issuerApp.get('/issuer/userinfo', (req, res) => {
      const prefix = 'Bearer upstream_access:';
      const authorization = req.get('authorization') ?? '';
      if (!authorization.startsWith(prefix)) {
        res.status(401).json({ error: 'invalid_token' });
        return;
      }
      res.json({ sub: authorization.slice(prefix.length), name: 'Legacy Vault User' });
    });

    issuerServer = http.createServer(issuerApp);
    await new Promise<void>((resolve) => issuerServer?.listen(0, '127.0.0.1', resolve));
    const address = issuerServer.address();
    if (!address || typeof address === 'string') throw new Error('Failed to determine issuer address.');
    issuerBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    __resetProviderClientCachesForTests();
    authorizationCodeRequests = [];
    refreshRequestTokens = [];
    refreshTokens = new Map();
    refreshSequence = 0;
  });

  afterAll(async () => {
    if (issuerServer) {
      await new Promise<void>((resolve, reject) => {
        issuerServer?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  const buildApp = (
    transport: OidcVaultSessionTransport,
    store = createMemoryOidcVaultStore(),
    hooks: Pick<OidcVaultHooks, 'onBeforeSessionCreate'> = {},
  ) => {
    const app = express();
    const mutations = {
      createSession: vi.spyOn(store, 'createSession'),
      createExchangeCode: vi.spyOn(store, 'createExchangeCode'),
      consumeExchangeCode: vi.spyOn(store, 'consumeExchangeCode'),
      rotateSession: vi.spyOn(store, 'rotateSession'),
      revokeLineage: vi.spyOn(store, 'deleteSessionsByLogicalSessionId'),
    };
    const issue = vi.fn(async ({ session }: IssueTokenInput) => {
      const now = Math.floor(Date.now() / 1000);
      const accessToken = await new SignJWT({ sid: session.sessionId, scope: LOCAL_SCOPE })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer(BACKEND_ORIGIN)
        .setAudience(LOCAL_AUDIENCE)
        .setSubject(session.subject)
        .setIssuedAt(now)
        .setExpirationTime(now + 900)
        .sign(localPrivateKey);
      return { accessToken, expiresIn: 900, tokenType: 'Bearer' as const };
    });
    const onError = vi.fn();
    const api = vi.fn((req: express.Request, res: express.Response) => {
      res.json({ subject: req.auth?.subject, sessionId: req.auth?.sessionId, scope: req.auth?.scope });
    });

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1', // pragma: allowlist secret
        },
        frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
        // Body transport deliberately exercises the no-config default.
        ...(transport === 'cookie' ? { sessionTransport: transport, trustedOrigins: [FRONTEND_ORIGIN] } : {}),
        sessionTtlMs: 60_000,
        storeProvider: store,
        tokenIssuer: { issue },
        hooks: { ...hooks, onError },
      }),
    );
    app.get(
      '/api/profile',
      createOidcVaultAccessTokenMiddleware({
        validator: createOidcVaultJwtAccessTokenValidator({
          key: localPublicKey,
          issuer: BACKEND_ORIGIN,
          audience: LOCAL_AUDIENCE,
          algorithms: ['ES256'],
        }),
        onError,
      }),
      api,
    );
    return { app, store, mutations, issue, onError, api };
  };

  const loginAndCallback = async (browser: Browser) => {
    const login = await browser.get('/auth/oidc/login');
    browser.capture(login);
    expect(login.status).toBe(302);
    expect(login.headers['cache-control']).toBe('no-store');
    const authorizationUrl = new URL(login.headers.location as string);
    const state = authorizationUrl.searchParams.get('state') as string;
    const nonce = authorizationUrl.searchParams.get('nonce') as string;
    expect(state).toBeTruthy();
    expect(nonce).toBeTruthy();
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');

    const callback = await browser.get('/auth/oidc/callback').query({ state, code: `authcode:${nonce}:${SUBJECT}` });
    browser.capture(callback);
    expect(callback.status).toBe(302);
    expect(callback.headers['cache-control']).toBe('no-store');
    const frontendUrl = new URL(callback.headers.location as string);
    expect(`${frontendUrl.origin}${frontendUrl.pathname}`).toBe(`${FRONTEND_ORIGIN}/callback`);
    const code = frontendUrl.searchParams.get('code') as string;
    expect(code).toBeTruthy();
    return { code, state, nonce, authorizationUrl };
  };

  for (const transport of TRANSPORTS) {
    it(`[DBJWT-01] ${transport}: same-browser legacy login -> callback -> exchange -> refresh -> Bearer API passes without proofs`, async () => {
      const { app, store, mutations, issue, onError, api } = buildApp(transport);
      const browser = createBrowser(app);
      const flow = await loginAndCallback(browser);
      expect(authorizationCodeRequests).toHaveLength(1);
      expect(authorizationCodeRequests[0]).toMatchObject({
        code: `authcode:${flow.nonce}:${SUBJECT}`,
        redirect_uri: `${BACKEND_ORIGIN}/auth/oidc/callback`,
      });
      const verifier = authorizationCodeRequests[0]?.code_verifier as string;
      expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
        flow.authorizationUrl.searchParams.get('code_challenge'),
      );

      const exchange = await browser.post('/auth/oidc/exchange').send({ code: flow.code });
      const original = expectBearerCredentials(exchange, browser, transport);
      await expectBearerApi(browser, original);
      const before = await store.getSession(original.sessionId);
      expect(before).toMatchObject({
        subject: SUBJECT,
        provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
      });
      expect(before?.expiresAt).toEqual(expect.any(Number));

      const refresh = await refreshRequest(browser, transport, original.sessionId);
      const rotated = expectBearerCredentials(refresh, browser, transport);
      expect(rotated.sessionId).not.toBe(original.sessionId);
      expect(rotated.accessToken).not.toBe(original.accessToken);
      expect(await store.getSession(original.sessionId)).toBeNull();
      expect(await store.getSession(rotated.sessionId)).toMatchObject({
        subject: SUBJECT,
        logicalSessionId: before?.logicalSessionId,
        expiresAt: before?.expiresAt,
      });
      expect(refreshRequestTokens).toEqual([before?.refreshToken]);
      expect(refreshTokens.has(before?.refreshToken as string)).toBe(false);
      await expectBearerApi(browser, rotated);
      expect(issue).toHaveBeenCalledTimes(2);
      expect(api).toHaveBeenCalledTimes(2);
      expect(mutations.createSession).toHaveBeenCalledTimes(1);
      expect(mutations.createExchangeCode).toHaveBeenCalledTimes(1);
      expect(mutations.rotateSession).toHaveBeenCalledTimes(1);
      expect(mutations.revokeLineage).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      const exchangeReplay = await browser.post('/auth/oidc/exchange').send({ code: flow.code });
      expect(exchangeReplay.status).toBe(400);
      expect(exchangeReplay.body.code).toBe('OIDC_VAULT_INVALID_EXCHANGE_CODE');
      const callbackReplay = await browser
        .get('/auth/oidc/callback')
        .query({ state: flow.state, code: `authcode:${flow.nonce}:${SUBJECT}` });
      expect(callbackReplay.status).toBe(400);
      expect(callbackReplay.body.code).toBe('OIDC_VAULT_INVALID_STATE');
      expect(authorizationCodeRequests).toHaveLength(1);
      expect(issue).toHaveBeenCalledTimes(2);
    });

    it(`[DBJWT-01] ${transport}: pre-existing unbound session/code records remain exchangeable and refreshable without proofs`, async () => {
      const { app, store, mutations, issue, onError } = buildApp(transport);
      const browser = createBrowser(app);
      const now = Date.now();
      // No provider or binding fields: records written before device binding.
      const seeded = await store.createSession({
        sessionId: `sess_dbjwt01_legacy_${transport}`,
        subject: SUBJECT,
        refreshToken: registerRefreshToken(SUBJECT),
        idToken: await createIdToken(SUBJECT),
        user: { sub: SUBJECT, name: 'Legacy Vault User' },
        expiresAt: now + 90_000,
        metadata: { fixture: 'pre-device-binding' },
      });
      const code = `code_dbjwt01_legacy_${transport}`;
      await store.createExchangeCode({ code, sessionId: seeded.sessionId, createdAt: now, expiresAt: now + 30_000 });

      const exchange = await browser.post('/auth/oidc/exchange').send({ code });
      const original = expectBearerCredentials(exchange, browser, transport);
      expect(original.sessionId).toBe(seeded.sessionId);
      await expectBearerApi(browser, original);
      const refresh = await refreshRequest(browser, transport, original.sessionId);
      const rotated = expectBearerCredentials(refresh, browser, transport);
      const stored = await store.getSession(rotated.sessionId);
      expect(stored?.provider).toBeUndefined();
      expect(stored).toMatchObject({
        subject: SUBJECT,
        logicalSessionId: seeded.logicalSessionId,
        expiresAt: seeded.expiresAt,
        metadata: seeded.metadata,
      });
      expect(await store.getSession(seeded.sessionId)).toBeNull();
      await expectBearerApi(browser, rotated);
      expect(authorizationCodeRequests).toHaveLength(0);
      expect(refreshRequestTokens).toEqual([seeded.refreshToken]);
      expect(mutations.consumeExchangeCode).toHaveBeenCalledTimes(1);
      expect(mutations.rotateSession).toHaveBeenCalledTimes(1);
      expect(mutations.revokeLineage).not.toHaveBeenCalled();
      expect(issue).toHaveBeenCalledTimes(2);
      expect(onError).not.toHaveBeenCalled();
    });

    it(`[DBJWT-03] ${transport}: an unbound precreate hook cannot enroll a device binding from an unverified thumbprint`, async () => {
      const injectedJkt = createHash('sha256').update('unproved-hook-key').digest('base64url');
      const beforeCreate = vi.fn<NonNullable<OidcVaultHooks['onBeforeSessionCreate']>>(({ session }) => {
        if (!session) throw new Error('Expected the precreate session.');
        session.deviceBinding = { type: 'dpop', jkt: injectedJkt };
        session.metadata = { ...session.metadata, applicationHook: 'preserved' };
      });
      const { app, store, mutations, issue, onError } = buildApp(transport, createMemoryOidcVaultStore(), {
        onBeforeSessionCreate: beforeCreate,
      });
      const browser = createBrowser(app);
      const { code } = await loginAndCallback(browser);
      expect(beforeCreate).toHaveBeenCalledTimes(1);
      expect(mutations.createSession.mock.calls[0][0]).not.toHaveProperty('deviceBinding');
      const exchange = await browser.post('/auth/oidc/exchange').send({ code });
      const credentials = expectBearerCredentials(exchange, browser, transport);
      expect(issue.mock.calls[0][0]).not.toHaveProperty('deviceBinding');
      const persisted = await store.getSession(credentials.sessionId);
      expect(persisted).not.toHaveProperty('deviceBinding');
      expect(persisted?.metadata).toMatchObject({ applicationHook: 'preserved' });
      await expectBearerApi(browser, credentials);
      expect(onError).not.toHaveBeenCalled();
    });
  }

  it('[DBJWT-01] cookie: legacy Origin rejection preserves the session and single-use upstream refresh token for an honest retry', async () => {
    const { app, store, mutations, issue } = buildApp('cookie');
    const browser = createBrowser(app);
    const { code } = await loginAndCallback(browser);
    const exchange = await browser.post('/auth/oidc/exchange').send({ code });
    const original = expectBearerCredentials(exchange, browser, 'cookie');
    const before = await store.getSession(original.sessionId);

    const rejected = await browser.post('/auth/oidc/refresh').set('Origin', 'https://evil.example').send({});
    expect(rejected.status).toBe(403);
    expect(rejected.body).toEqual({
      code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
      message: 'Refresh request origin is not trusted.',
    });
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect(rejected.headers['set-cookie']).toBeUndefined();
    expect(await store.getSession(original.sessionId)).toEqual(before);
    expect(refreshRequestTokens).toHaveLength(0);
    expect(refreshTokens.has(before?.refreshToken as string)).toBe(true);
    expect(mutations.rotateSession).not.toHaveBeenCalled();
    expect(mutations.revokeLineage).not.toHaveBeenCalled();
    expect(issue).toHaveBeenCalledTimes(1);

    const retry = await refreshRequest(browser, 'cookie', original.sessionId);
    const rotated = expectBearerCredentials(retry, browser, 'cookie');
    await expectBearerApi(browser, rotated);
    expect(refreshRequestTokens).toEqual([before?.refreshToken]);
    expect(mutations.rotateSession).toHaveBeenCalledTimes(1);
  });

  it('[DBJWT-01] legacy custom Bearer validators still receive exactly validate(token) without request context', async () => {
    const app = express();
    const validate = vi.fn(async (token: string) => ({
      subject: SUBJECT,
      sessionId: 'sess_legacy_validator',
      claims: { token },
    }));
    app.get('/api/profile', createOidcVaultAccessTokenMiddleware({ validator: { validate } }), (req, res) => {
      res.json({ subject: req.auth?.subject, sessionId: req.auth?.sessionId });
    });

    const response = await request(app).get('/api/profile').set('Authorization', 'Bearer legacy_opaque_token');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ subject: SUBJECT, sessionId: 'sess_legacy_validator' });
    expect(validate.mock.calls).toEqual([['legacy_opaque_token']]);
  });
});

// DBJWT-01 session/browser matrix: all 14 scenarios now execute independently
// for BOTH body/cookie transports in test/dpop-vault-session.test.ts. These exact
// named regressions retain the intended 28 cases; JSON/form attack matrices,
// real provider single-use refresh tokens and real atomic store methods are used.
// 1. [DBJWT-01; DBJWT-05] explicit optional mode allows 'legacy GET lifecycle' without proofs
//    and explicit optional mode allows 'seeded legacy records' without proofs
// 2. [DBJWT-01; DBJWT-05] required mode rejects legacy unbound exchange/refresh/logout before mutation
// 3. [DBJWT-01; DBJWT-05] 'wrong-key' exchange fails without spending and the original key can redeem
// 4. [DBJWT-01; DBJWT-05] 'wrong-key' refresh fails before upstream use or mutation and a fresh original-key retry works
// 5. [DBJWT-01; DBJWT-05] 'missing-proof' exchange fails without spending and the original key can redeem
// 6. [DBJWT-01; DBJWT-05] 'missing-proof' refresh fails before upstream use or mutation and a fresh original-key retry works
//    plus missing-proof refresh cannot downgrade an already rotated bound session
// 7. [DBJWT-01; DBJWT-05] 'stale-proof' exchange fails without spending and the original key can redeem
// 8. [DBJWT-01; DBJWT-05] 'stale-proof' refresh fails before upstream use or mutation and a fresh original-key retry works
// 9. [DBJWT-01; DBJWT-05] a stolen unconsumed exchange code cannot claim or rebind the victim session
// 10. [DBJWT-01; DBJWT-05] cross-origin urlencoded exchange without browser/key proof cannot claim a bound session
// 11. [DBJWT-01; DBJWT-05] optional bound same-browser login -> callback -> exchange -> refresh -> API passes
// 12. [DBJWT-01; DBJWT-05] required bound same-browser login -> callback -> exchange -> refresh -> API passes
// 13. [DBJWT-01; DBJWT-05] sequential/concurrent exchange proof replay across instances fails with a different live bound code
// 14. [DBJWT-01; DBJWT-05] sequential/concurrent refresh proof replay across instances fails with a different live bound session and no upstream burn
// Replay losers keep a distinct honest target and recover with a fresh proof;
// single-use code/rotation failures cannot masquerade as replay protection.

// DBJWT-01 callback/initiation regressions now execute for BOTH transports in
// test/dpop-login-callback.test.ts (real provider request counts + real store):
// - [DBJWT-01; DBJWT-04] a transferred attacker callback cannot force-login the victim into a bound session
// - [DBJWT-01; DBJWT-04] required GET rejects before provider discovery, hooks, proof reservation or allocation
// - [DBJWT-01; DBJWT-04] required mode rejects a legacy unbound transaction before spending or upstream use
// - [DBJWT-01; DBJWT-04] optional/required proof initiation and same-browser callback preserve the original binding
// Their guarded records/cookies feed DBJWT-05's full active lifecycle above;
// wrong callback browser then stolen exchange code preserve the original browser lifecycle
// also runs in test/dpop-vault-session.test.ts with an honest final API request.

// DBJWT-01 API matrix is executable in test/dpop-api.test.ts. Exact named
// regressions (proof matrix runs independently in both optional/required modes):
// 1. [DBJWT-01; DBJWT-06] bound API rejects a copied JWT without proof and Bearer fallback
// 2. [DBJWT-01; DBJWT-06] bound API rejects a valid proof from a different cnf.jkt key
// 3. [DBJWT-01; DBJWT-06] bound API rejects a proof with an invalid signature
// 4. [DBJWT-01; DBJWT-06] bound API rejects wrong typ, disallowed algorithms and private JWKs
// 5. [DBJWT-01; DBJWT-06] bound API rejects a proof for a different HTTP method
// 6. [DBJWT-01; DBJWT-06] bound API rejects a different public URL despite attacker Host/forwarded headers
// 7. [DBJWT-01; DBJWT-06] bound API rejects ath for a different access token
// 8. [DBJWT-01; DBJWT-06] bound API rejects a stale proof outside the approved window
// 9. [DBJWT-01; DBJWT-06] custom mapClaims cannot strip or forge the bound JWT proof requirement
// 10. [DBJWT-01; DBJWT-06/07/08] sequential and concurrent API replay across instances has exactly one winner
// 11. [DBJWT-01; DBJWT-06/07] fresh original-key proofs recover across instances after replay rejection
// Core scaffold is fully active through these HTTP suites and its original
// eight no-config legacy/anti-enrollment controls. Real browser key persistence,
// redirect/CORS/cookie-policy checks belong to DBJWT-10.
