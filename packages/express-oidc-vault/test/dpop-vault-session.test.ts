import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, type KeyObject } from 'node:crypto';
import http from 'node:http';

import express from 'express';
import { calculateJwkThumbprint, decodeJwt, exportJWK, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  type IssueTokenInput,
  type OidcVaultHooks,
  type OidcVaultOptions,
  type OidcVaultSession,
  type OidcVaultSessionTransport,
} from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';
import { createTransactionBrowserBinding } from '../src/transaction-cookie';

const BACKEND_ORIGIN = 'https://api.example.com';
const FRONTEND_ORIGIN = 'https://frontend.example.com';
const BASE_PATH = '/auth/oidc';
const TRANSACTION_COOKIE = '__Host-oidc_vault_transaction';
const SESSION_COOKIE = 'oidc_vault_session';
const NOW = 1_800_000_000_123;
const SUBJECT = 'honest-user';
const LOCAL_AUDIENCE = 'dbjwt-05-api';
const TRANSPORTS = ['body', 'cookie'] as const;
const MODES = ['optional', 'required'] as const;
const ENCODINGS = ['json', 'form'] as const;
const INVALID_PROOF = { code: 'OIDC_VAULT_INVALID_DPOP_PROOF', message: 'DPoP proof validation failed.' };
const MISSING_PROOF = { code: 'OIDC_VAULT_DPOP_REQUIRED', message: 'DPoP authentication is required.' };
const REQUIRED = { code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', message: 'A device-bound login is required.' };
const INVALID_BROWSER = {
  code: 'OIDC_VAULT_INVALID_BROWSER_BINDING',
  message: 'Login browser binding validation failed.',
};
const INVALID_SESSION = { code: 'OIDC_VAULT_INVALID_SESSION', message: 'Session is missing or expired.' };
const INTERNAL_ERROR = { code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' };

interface ProofKey {
  privateKey: KeyObject;
  jwk: JWK;
  jkt: string;
}
interface ProviderRequest {
  path: string;
  body?: Record<string, unknown>;
  dpop?: string;
}
let keyA: ProofKey;
let keyB: ProofKey;
let providerKey: KeyObject;
let localSecret: Uint8Array;
let issuer = '';
let providerServer: http.Server;
let providerRequests: ProviderRequest[] = [];
let refreshTokens = new Map<string, string>();
let accessSubjects = new Map<string, string>();
let spentCodes = new Set<string>();
let tokenSequence = 0;
let failDiscovery = false;
let refreshOverride: Record<string, unknown> | undefined;
let userInfoOverride: Record<string, unknown> | undefined;

const proofFor = (
  route: string,
  options: {
    key?: ProofKey;
    signingKey?: ProofKey;
    claims?: Record<string, unknown>;
    header?: Record<string, unknown>;
    now?: number;
    accessToken?: string;
  } = {},
): string => {
  const key = options.key ?? keyA;
  const input = [
    { typ: 'dpop+jwt', alg: 'ES256', jwk: key.jwk, ...options.header },
    {
      htm: route.startsWith('/api/') ? 'GET' : 'POST',
      htu: `${BACKEND_ORIGIN}${route.startsWith('/') ? route : `${BASE_PATH}/${route}`}`,
      iat: Math.floor((options.now ?? NOW) / 1000),
      jti: randomUUID(),
      ...(options.accessToken === undefined
        ? {}
        : { ath: createHash('sha256').update(options.accessToken, 'ascii').digest('base64url') }),
      ...options.claims,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${input}.${sign('sha256', Buffer.from(input), {
    key: (options.signingKey ?? key).privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url')}`;
};

const cookieLines = (response: request.Response): string[] => {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};

const createBrowser = (app: express.Express) => {
  const jar = new Map<string, string>();
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const withCookies = (call: request.Test) => (jar.size ? call.set('Cookie', cookieHeader()) : call);
  return {
    get: (path: string) => withCookies(request(app).get(path)),
    post: (path: string) => withCookies(request(app).post(path)),
    cookieHeader,
    setCookie: (name: string, value: string) => jar.set(name, value),
    sessionId: () => jar.get(SESSION_COOKIE),
    capture(response: request.Response) {
      for (const line of cookieLines(response)) {
        const pair = line.split(';', 1)[0];
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (!value || line.includes('Max-Age=0;')) jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
};
type Browser = ReturnType<typeof createBrowser>;

const registerRefreshToken = (subject: string): string => {
  const value = `upstream-refresh:${subject}:${++tokenSequence}`;
  refreshTokens.set(value, subject);
  return value;
};

const idTokenFor = (subject: string, claims: Record<string, unknown> = {}): Promise<string> =>
  new SignJWT({
    sub: subject,
    sid: `provider-${subject}`,
    email: 'id@example.com',
    name: 'ID Name',
    idOnly: 'fresh',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'dbjwt-05-provider' })
    .setIssuer(issuer)
    .setAudience('client_1')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(providerKey);

beforeAll(async () => {
  const makeKey = async (): Promise<ProofKey> => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = await exportJWK(pair.publicKey);
    return { privateKey: pair.privateKey, jwk, jkt: await calculateJwkThumbprint(jwk) };
  };
  [keyA, keyB] = await Promise.all([makeKey(), makeKey()]);
  localSecret = randomBytes(32);
  const providerPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  providerKey = providerPair.privateKey;
  const providerJwk = { ...(await exportJWK(providerPair.publicKey)), kid: 'dbjwt-05-provider' };
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  provider.use((req, _res, next) => {
    providerRequests.push({
      path: req.path,
      ...(req.method === 'POST' ? { body: { ...req.body } } : {}),
      dpop: req.get('dpop'),
    });
    next();
  });
  provider.get('/issuer/.well-known/openid-configuration', (_req, res) => {
    if (failDiscovery) {
      res.status(503).send('private discovery diagnostic');
      return;
    }
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      end_session_endpoint: `${issuer}/logout`,
    });
  });
  provider.get('/issuer/jwks', (_req, res) => res.json({ keys: [providerJwk] }));
  provider.post('/issuer/token', async (req, res) => {
    let subject: string;
    let nonce: string | undefined;
    let override: Record<string, unknown> | undefined;
    if (req.body.grant_type === 'authorization_code') {
      const code = String(req.body.code);
      if (spentCodes.has(code)) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      spentCodes.add(code);
      [, nonce, subject = SUBJECT] = code.split(':');
    } else {
      const token = String(req.body.refresh_token);
      const found = refreshTokens.get(token);
      if (!found) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      refreshTokens.delete(token); // Deliberately single-use: early upstream calls burn the honest family.
      subject = found;
      override = refreshOverride;
      refreshOverride = undefined;
    }
    const accessToken = `upstream-access:${subject}:${++tokenSequence}`;
    accessSubjects.set(accessToken, subject);
    res.json({
      token_type: 'Bearer',
      expires_in: 3600,
      access_token: accessToken,
      refresh_token: registerRefreshToken(subject),
      id_token: await idTokenFor(subject, nonce ? { nonce } : {}),
      scope: 'openid profile',
      ...override,
    });
  });
  provider.get('/issuer/userinfo', (req, res) => {
    const subject = accessSubjects.get(req.get('authorization')?.slice('Bearer '.length) ?? '');
    res.json({
      sub: subject,
      email: 'userinfo@example.com',
      name: 'UserInfo Name',
      preferences: { theme: 'light' },
      ...userInfoOverride,
    });
  });
  providerServer = provider.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => providerServer.once('listening', resolve));
  const address = providerServer.address();
  if (!address || typeof address === 'string') throw new Error('Missing provider fixture address.');
  issuer = `http://127.0.0.1:${address.port}/issuer`;
});

beforeEach(() => {
  vi.restoreAllMocks();
  __resetProviderClientCachesForTests();
  providerRequests = [];
  refreshTokens = new Map();
  accessSubjects = new Map();
  spentCodes = new Set();
  tokenSequence = 0;
  failDiscovery = false;
  refreshOverride = undefined;
  userInfoOverride = undefined;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => providerServer.close((error) => (error ? reject(error) : resolve())));
});

const runtime = (clock = { value: NOW }, maxEntries = 100_000) => {
  const store = createMemoryOidcVaultStore({ now: () => clock.value, dpopReplayMaxEntries: maxEntries });
  const originals = {
    getCode: store.getExchangeCode.bind(store),
    getSession: store.getSession.bind(store),
    getContext: store.getSessionRevocationContext.bind(store),
    consume: store.consumeExchangeCodeIfMatches.bind(store),
    reserve: store.reserveDpopProof.bind(store),
    rotate: store.rotateSession.bind(store),
  };
  const calls = {
    getCode: vi.spyOn(store, 'getExchangeCode'),
    getSession: vi.spyOn(store, 'getSession'),
    getContext: vi.spyOn(store, 'getSessionRevocationContext'),
    consume: vi.spyOn(store, 'consumeExchangeCodeIfMatches'),
    legacyConsume: vi.spyOn(store, 'consumeExchangeCode'),
    rotate: vi.spyOn(store, 'rotateSession'),
    revoke: vi.spyOn(store, 'deleteSessionsByLogicalSessionId'),
    delete: vi.spyOn(store, 'deleteSession'),
    reserve: vi.spyOn(store, 'reserveDpopProof'),
  };
  return { store, calls, originals, clock };
};
const issueLocal = async ({ session, deviceBinding }: IssueTokenInput) => ({
  accessToken: await new SignJWT({
    sid: session.sessionId,
    scope: 'read:profile',
    ...(deviceBinding ? { cnf: { jkt: deviceBinding.jkt } } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(BACKEND_ORIGIN)
    .setAudience(LOCAL_AUDIENCE)
    .setSubject(session.subject)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(localSecret),
  expiresIn: 900,
  tokenType: deviceBinding ? ('DPoP' as const) : ('Bearer' as const),
});

const fixture = (
  transport: OidcVaultSessionTransport,
  overrides: Partial<OidcVaultOptions> = {},
  shared = runtime(),
) => {
  const app = express();
  const requests: express.Request[] = [];
  app.use((req, _res, next) => {
    requests.push(req);
    next();
  });
  const onError = vi.fn<NonNullable<OidcVaultHooks['onError']>>(overrides.hooks?.onError ?? (() => {}));
  const issue = vi.fn(overrides.tokenIssuer?.issue ?? issueLocal);
  const hooks = {
    ...overrides.hooks,
    onError,
    onBeforeLogout: vi.fn<NonNullable<OidcVaultHooks['onBeforeLogout']>>(overrides.hooks?.onBeforeLogout ?? (() => {})),
    onLogout: vi.fn<NonNullable<OidcVaultHooks['onLogout']>>(overrides.hooks?.onLogout ?? (() => {})),
    onSessionRefreshed: vi.fn<NonNullable<OidcVaultHooks['onSessionRefreshed']>>(
      overrides.hooks?.onSessionRefreshed ?? (() => {}),
    ),
  };
  const options: OidcVaultOptions = {
    basePath: BASE_PATH,
    backendOrigin: BACKEND_ORIGIN,
    frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
    trustedOrigins: [FRONTEND_ORIGIN],
    config: { issuer, clientId: 'client_1' },
    sessionTransport: transport,
    storeProvider: shared.store,
    now: () => shared.clock.value,
    sessionTtlMs: 120_000,
    deviceBinding: {},
    ...overrides,
    tokenIssuer: overrides.tokenIssuer === undefined && Object.hasOwn(overrides, 'tokenIssuer') ? undefined : { issue },
    hooks,
  };
  app.use(createOidcVaultMiddleware(options));
  const api = vi.fn((req: express.Request, res: express.Response) =>
    res.json({
      subject: req.auth?.subject,
      sessionId: req.auth?.sessionId,
      scope: req.auth?.scope,
      deviceBinding: req.auth?.deviceBinding,
    }),
  );
  app.get(
    '/api/profile',
    createOidcVaultAccessTokenMiddleware({
      validator: createOidcVaultJwtAccessTokenValidator({
        key: localSecret,
        issuer: BACKEND_ORIGIN,
        audience: LOCAL_AUDIENCE,
        algorithms: ['HS256'],
        // Deliberately omit cnf from mapping: the original verified confirmation must still enforce the key.
        mapClaims: (claims) => ({
          subject: String(claims.sub),
          sessionId: String(claims.sid),
          scope: String(claims.scope),
        }),
      }),
      ...(options.deviceBinding === undefined
        ? {}
        : {
            deviceBinding: {
              ...options.deviceBinding,
              publicOrigin: BACKEND_ORIGIN,
              replayNamespace: LOCAL_AUDIENCE,
              replayStore: shared.store,
              now: () => shared.clock.value,
            },
          }),
      onError,
    }),
    api,
  );
  return { ...shared, app, transport, options, hooks, issue, onError, api, requests };
};
type Fixture = ReturnType<typeof fixture>;

const loginAndCallback = async (
  f: Fixture,
  browser = createBrowser(f.app),
  key: ProofKey | null = keyA,
  legacy = false,
) => {
  const call = legacy
    ? browser.get(`${BASE_PATH}/login`)
    : browser.post(`${BASE_PATH}/login`).set('Origin', FRONTEND_ORIGIN);
  if (!legacy && key) call.set('DPoP', proofFor('login', { key, now: f.clock.value }));
  const login = await (legacy ? call : call.send({}));
  expect(login.status).toBe(legacy ? 302 : 200);
  browser.capture(login);
  const url = new URL(legacy ? (login.headers.location as string) : (login.body.authorizationUrl as string));
  const callback = await browser
    .get(`${BASE_PATH}/callback`)
    .query({ state: url.searchParams.get('state'), code: `authcode:${url.searchParams.get('nonce')}:${SUBJECT}` });
  expect(callback.status).toBe(302);
  browser.capture(callback);
  const code = new URL(callback.headers.location as string).searchParams.get('code')!;
  const record = (await f.store.getExchangeCode(code))!;
  const session = (await f.store.getSession(record.sessionId))!;
  return { browser, code, record, session, login, callback };
};
type Flow = Awaited<ReturnType<typeof loginAndCallback>>;

const seedSession = async (f: Fixture, binding = true, extra: Partial<OidcVaultSession> = {}) => {
  const session = await f.store.createSession({
    sessionId: `sess_seed_${randomUUID()}`,
    subject: SUBJECT,
    provider: { issuer, clientId: 'client_1' },
    refreshToken: registerRefreshToken(SUBJECT),
    idToken: await idTokenFor(SUBJECT),
    expiresAt: f.clock.value + 120_000,
    user: { sub: SUBJECT, email: 'retained@example.com', staleRole: 'old', preferences: { theme: 'dark' } },
    metadata: { application: { theme: 'dark' } },
    ...(binding ? { deviceBinding: { type: 'dpop' as const, jkt: keyA.jkt } } : {}),
    ...extra,
  });
  const browser = createBrowser(f.app);
  if (f.transport === 'cookie') browser.setCookie(SESSION_COOKIE, session.sessionId);
  return { session, browser };
};

const seedCode = async (f: Fixture, bound = true, guarded = true, extra: Partial<OidcVaultSession> = {}) => {
  const { session, browser } = await seedSession(f, bound, extra);
  const cookie = createTransactionBrowserBinding();
  if (guarded) browser.setCookie(TRANSACTION_COOKIE, cookie.secret);
  const code = `code_seed_${randomUUID()}`;
  const record = {
    code,
    sessionId: session.sessionId,
    createdAt: f.clock.value,
    expiresAt: f.clock.value + 30_000,
    ...(guarded ? { browserBindingHash: cookie.browserBindingHash } : {}),
    ...(bound ? { deviceBinding: { type: 'dpop' as const, jkt: keyA.jkt } } : {}),
  };
  await f.store.createExchangeCode(record);
  return { browser, session, code, record, secret: cookie.secret };
};

const exchange = (
  f: Fixture,
  flow: Pick<Flow, 'browser' | 'code'>,
  proof?: string,
  encoding: (typeof ENCODINGS)[number] = 'json',
) => {
  const call = flow.browser.post(`${BASE_PATH}/exchange`).set('Origin', FRONTEND_ORIGIN);
  if (proof !== undefined) call.set('DPoP', proof);
  return (encoding === 'form' ? call.type('form') : call).send({ code: flow.code });
};

const sessionRequest = (
  f: Fixture,
  browser: Browser,
  route: 'refresh' | 'logout',
  sessionId: string,
  proof?: string,
  body: Record<string, unknown> = {},
  encoding: (typeof ENCODINGS)[number] = 'json',
) => {
  const call = browser.post(`${BASE_PATH}/${route}`).set('Origin', FRONTEND_ORIGIN);
  if (proof !== undefined) call.set('DPoP', proof);
  return (encoding === 'form' ? call.type('form') : call).send({
    ...(f.transport === 'body' ? { sessionId } : {}),
    ...body,
  });
};

const clearOperationCalls = (f: Fixture) => {
  for (const call of Object.values(f.calls)) call.mockClear();
  f.issue.mockClear();
  for (const call of [f.hooks.onBeforeLogout, f.hooks.onLogout, f.hooks.onSessionRefreshed, f.onError])
    call.mockClear();
  providerRequests = [];
  __resetProviderClientCachesForTests();
};

const expectNoCredentialWork = (f: Fixture, response: request.Response) => {
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.headers.location).toBeUndefined();
  expect(providerRequests).toEqual([]);
  expect(f.calls.consume).not.toHaveBeenCalled();
  expect(f.calls.legacyConsume).not.toHaveBeenCalled();
  expect(f.calls.rotate).not.toHaveBeenCalled();
  expect(f.calls.revoke).not.toHaveBeenCalled();
  expect(f.calls.delete).not.toHaveBeenCalled();
  expect(f.issue).not.toHaveBeenCalled();
  expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
  expect(f.hooks.onLogout).not.toHaveBeenCalled();
  expect(f.hooks.onSessionRefreshed).not.toHaveBeenCalled();
};

const credentials = (f: Fixture, browser: Browser, response: request.Response, bound = true) => {
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  browser.capture(response);
  const sessionId = f.transport === 'body' ? (response.body.sessionId as string) : browser.sessionId()!;
  expect(sessionId).toMatch(/^sess_/);
  if (f.transport === 'cookie') expect(response.body).not.toHaveProperty('sessionId');
  expect(response.body).toMatchObject({ expiresIn: 900, tokenType: bound ? 'DPoP' : 'Bearer', user: { sub: SUBJECT } });
  const token = response.body.accessToken as string;
  const claims = decodeJwt(token);
  expect(claims).toMatchObject({ sub: SUBJECT, sid: sessionId, aud: LOCAL_AUDIENCE, iss: BACKEND_ORIGIN });
  if (bound) expect(claims.cnf).toEqual({ jkt: keyA.jkt });
  else expect(claims).not.toHaveProperty('cnf');
  expect(response.text).not.toContain('upstream-');
  return { sessionId, token };
};

const expectApi = async (f: Fixture, browser: Browser, value: ReturnType<typeof credentials>, bound = true) => {
  const call = browser.get('/api/profile').set('Authorization', `${bound ? 'DPoP' : 'Bearer'} ${value.token}`);
  if (bound) call.set('DPoP', proofFor('/api/profile', { accessToken: value.token, now: f.clock.value }));
  const response = await call;
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ subject: SUBJECT, sessionId: value.sessionId, scope: 'read:profile' });
  if (bound) expect(response.body.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt, alg: 'ES256' });
};

describe.each(TRANSPORTS)('DBJWT-05 original initiating key lifecycle (%s)', (transport) => {
  it.each(MODES)(
    '[DBJWT-01; DBJWT-05] %s bound same-browser login -> callback -> exchange -> refresh -> API passes',
    async (mode) => {
      const f = fixture(transport, { deviceBinding: { mode } });
      const flow = await loginAndCallback(f);
      const first = credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
      expect(flow.browser.cookieHeader()).not.toContain(`${TRANSACTION_COOKIE}=`);
      expect(await f.store.getExchangeCode(flow.code)).toBeNull();
      expect(f.calls.consume).toHaveBeenCalledExactlyOnceWith({
        code: flow.code,
        expectedSessionId: flow.session.sessionId,
        match: { deviceBinding: { type: 'dpop', jkt: keyA.jkt }, browserBindingHash: flow.record.browserBindingHash },
      });
      await expectApi(f, flow.browser, first);
      const refreshed = await sessionRequest(f, flow.browser, 'refresh', first.sessionId, proofFor('refresh'));
      const next = credentials(f, flow.browser, refreshed);
      expect(next.sessionId).not.toBe(first.sessionId);
      expect(await f.store.getSession(first.sessionId)).toBeNull();
      expect(await f.store.getSession(next.sessionId)).toMatchObject({
        deviceBinding: { type: 'dpop', jkt: keyA.jkt },
        logicalSessionId: flow.session.logicalSessionId,
        expiresAt: flow.session.expiresAt,
        subject: SUBJECT,
        provider: flow.session.provider,
      });
      await expectApi(f, flow.browser, next);
      expect(providerRequests.filter((r) => r.body?.grant_type === 'refresh_token')).toHaveLength(1);
      expect(refreshTokens.has(flow.session.refreshToken)).toBe(false);
      expect(providerRequests.every((r) => r.dpop === undefined)).toBe(true);
      expect(f.issue).toHaveBeenCalledTimes(2);
      for (const [input] of f.issue.mock.calls)
        expect(input.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt, alg: 'ES256' });
      const logout = await sessionRequest(f, flow.browser, 'logout', next.sessionId, proofFor('logout'));
      expect(logout.status).toBe(200);
      expect(await f.store.getSession(next.sessionId)).toBeNull();
      expect(f.onError).not.toHaveBeenCalled();
    },
  );

  it.each(['legacy GET lifecycle', 'seeded legacy records'] as const)(
    '[DBJWT-01; DBJWT-05] explicit optional mode allows %s without proofs',
    async (kind) => {
      const f = fixture(transport, { deviceBinding: { mode: 'optional' } });
      let browser: Browser;
      let code: string;
      let before: OidcVaultSession;
      if (kind === 'legacy GET lifecycle') {
        const flow = await loginAndCallback(f, undefined, undefined, true);
        ({ browser, code, session: before } = flow);
      } else {
        const seeded = await seedSession(f, false, { provider: undefined });
        ({ browser, session: before } = seeded);
        code = `code_legacy_${randomUUID()}`;
        await f.store.createExchangeCode({
          code,
          sessionId: before.sessionId,
          createdAt: NOW,
          expiresAt: NOW + 30_000,
        });
      }
      const first = credentials(f, browser, await exchange(f, { browser, code }), false);
      await expectApi(f, browser, first, false);
      const next = credentials(f, browser, await sessionRequest(f, browser, 'refresh', first.sessionId), false);
      await expectApi(f, browser, next, false);
      const stored = await f.store.getSession(next.sessionId);
      expect(stored?.deviceBinding).toBeUndefined();
      expect(stored?.provider).toEqual(before.provider);
      expect(stored?.logicalSessionId).toBe(before.logicalSessionId);
      expect(stored?.expiresAt).toBe(before.expiresAt);
    },
  );

  it.each(['exchange', 'refresh', 'logout'] as const)(
    '[DBJWT-01; DBJWT-05] required mode rejects legacy unbound %s before mutation',
    async (route) => {
      const f = fixture(transport, { deviceBinding: { mode: 'required' } });
      const { browser, session } = await seedSession(f, false);
      const code = 'legacy-code';
      await f.store.createExchangeCode({ code, sessionId: session.sessionId, createdAt: NOW, expiresAt: NOW + 30_000 });
      clearOperationCalls(f);
      const response = await (route === 'exchange'
        ? exchange(f, { browser, code }, proofFor(route))
        : sessionRequest(f, browser, route, session.sessionId, proofFor(route)));
      expect(response.status).toBe(401);
      expect(response.body).toEqual(REQUIRED);
      expectNoCredentialWork(f, response);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getSession(session.sessionId)).toEqual(session);
      expect(await f.store.getExchangeCode(code)).not.toBeNull();
      expect(refreshTokens.has(session.refreshToken)).toBe(true);
    },
  );

  const attacks = [
    { name: 'wrong-key', make: (route: string) => proofFor(route, { key: keyB }), expected: INVALID_PROOF },
    { name: 'missing-proof', make: () => undefined, expected: MISSING_PROOF },
    {
      name: 'stale-proof',
      make: (route: string) => proofFor(route, { claims: { iat: Math.floor(NOW / 1000) - 65 } }),
      expected: INVALID_PROOF,
    },
  ];
  describe.each(ENCODINGS)('%s entry', (encoding) => {
    it.each(attacks)(
      '[DBJWT-01; DBJWT-05] $name exchange fails without spending and the original key can redeem',
      async ({ make, expected }) => {
        const f = fixture(transport);
        const flow = await loginAndCallback(f);
        clearOperationCalls(f);
        const response = await exchange(f, flow, make('exchange'), encoding);
        expect(response.status).toBe(401);
        expect(response.body).toEqual(expected);
        expectNoCredentialWork(f, response);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
        expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
        credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange'), encoding));
      },
    );

    it.each(attacks)(
      '[DBJWT-01; DBJWT-05] $name refresh fails before upstream use or mutation and a fresh original-key retry works',
      async ({ make, expected }) => {
        const f = fixture(transport);
        const { session, browser } = await seedSession(f);
        clearOperationCalls(f);
        const response = await sessionRequest(f, browser, 'refresh', session.sessionId, make('refresh'), {}, encoding);
        expect(response.status).toBe(401);
        expect(response.body).toEqual(expected);
        expectNoCredentialWork(f, response);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await f.store.getSession(session.sessionId)).toEqual(session);
        expect(refreshTokens.has(session.refreshToken)).toBe(true);
        credentials(
          f,
          browser,
          await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'), {}, encoding),
        );
        expect(providerRequests.filter((r) => r.body?.grant_type === 'refresh_token')).toHaveLength(1);
      },
    );
  });

  it('[DBJWT-01; DBJWT-05] a stolen unconsumed exchange code cannot claim or rebind the victim session', async () => {
    const f = fixture(transport);
    const flow = await loginAndCallback(f);
    const thief = createBrowser(f.app);
    // A thief also owns a perfectly valid independent login cookie/key. It is
    // not allowed to claim the first session by presenting the stolen code.
    const thiefFlow = await loginAndCallback(f, thief, keyB);
    clearOperationCalls(f);
    for (const proof of [undefined, proofFor('exchange', { key: keyB }), proofFor('exchange')]) {
      const response = await exchange(f, { browser: thief, code: flow.code }, proof);
      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_BROWSER);
      expectNoCredentialWork(f, response);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      expect(await f.store.getExchangeCode(thiefFlow.code)).not.toBeNull();
    }
    credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
    expect(await f.store.getSession(flow.session.sessionId)).toMatchObject({
      deviceBinding: { type: 'dpop', jkt: keyA.jkt },
    });
  });

  it('[DBJWT-01; DBJWT-05] cross-origin urlencoded exchange without browser/key proof cannot claim a bound session', async () => {
    const f = fixture(transport);
    const flow = await loginAndCallback(f);
    clearOperationCalls(f);
    const response = await request(f.app)
      .post(`${BASE_PATH}/exchange`)
      .set('Origin', 'https://evil.example')
      .type('form')
      .send({ code: flow.code });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
      message: 'Exchange request origin is not trusted.',
    });
    expectNoCredentialWork(f, response);
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
  });

  it('[DBJWT-01; DBJWT-05] missing-proof refresh cannot downgrade an already rotated bound session', async () => {
    const f = fixture(transport);
    const { session, browser } = await seedSession(f);
    const next = credentials(
      f,
      browser,
      await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh')),
    );
    const before = await f.store.getSession(next.sessionId);
    clearOperationCalls(f);
    const rejected = await sessionRequest(f, browser, 'refresh', next.sessionId);
    expect(rejected.body).toEqual(MISSING_PROOF);
    expectNoCredentialWork(f, rejected);
    expect(await f.store.getSession(next.sessionId)).toEqual(before);
    credentials(f, browser, await sessionRequest(f, browser, 'refresh', next.sessionId, proofFor('refresh')));
    expect(providerRequests.filter((r) => r.body?.grant_type === 'refresh_token')).toHaveLength(1);
  });
});

describe.each(TRANSPORTS)('DBJWT-05 browser/source authority (%s)', (transport) => {
  describe.each(ENCODINGS)('%s entry', (encoding) => {
    it.each(['missing', 'wrong', 'malformed', 'duplicate', 'valueless'] as const)(
      'rejects a %s transaction cookie without spending and preserves an honest retry',
      async (kind) => {
        const f = fixture(transport);
        const flow = await seedCode(f);
        clearOperationCalls(f);
        const cookie =
          kind === 'missing'
            ? ''
            : kind === 'wrong'
              ? `${TRANSACTION_COOKIE}=${'A'.repeat(43)}`
              : kind === 'malformed'
                ? `${TRANSACTION_COOKIE}=%`
                : kind === 'valueless'
                  ? TRANSACTION_COOKIE
                  : `${TRANSACTION_COOKIE}=${flow.secret}; ${TRANSACTION_COOKIE}=${flow.secret}`;
        const call = request(f.app)
          .post(`${BASE_PATH}/exchange`)
          .set('Origin', FRONTEND_ORIGIN)
          .set('DPoP', proofFor('exchange'))
          .set('Cookie', cookie);
        const response = await (encoding === 'form' ? call.type('form') : call).send({ code: flow.code });
        expect(response.status).toBe(400);
        expect(response.body).toEqual(INVALID_BROWSER);
        expectNoCredentialWork(f, response);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
        expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
        credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange'), encoding));
      },
    );

    it.each([
      ['missing source', undefined, undefined],
      ['null Origin', 'null', `${FRONTEND_ORIGIN}/app`],
      ['wrong Origin', 'https://evil.example', `${FRONTEND_ORIGIN}/app`],
      ['malformed Referer', undefined, 'https:/frontend.example.com/app'],
      ['wrong Referer', undefined, 'https://evil.example/app'],
    ])('guarded exchange rejects %s before reservation/consume in both transports', async (_name, origin, referer) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      clearOperationCalls(f);
      const proof = proofFor('exchange');
      const call = flow.browser.post(`${BASE_PATH}/exchange`).set('DPoP', proof);
      if (origin !== undefined) call.set('Origin', origin);
      if (referer !== undefined) call.set('Referer', referer);
      const response = await (encoding === 'form' ? call.type('form') : call).send({ code: flow.code });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
        message: 'Exchange request origin is not trusted.',
      });
      expectNoCredentialWork(f, response);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      // Source rejection cannot spend even this proof: the same original proof
      // remains valid on a correct-origin retry, which consumes the code once.
      credentials(f, flow.browser, await exchange(f, flow, proof, encoding));
    });
  });

  it('guarded exchange accepts backend Origin or a valid Referer fallback and ignores unrelated malformed cookies', async () => {
    const f = fixture(transport);
    for (const source of ['Origin', 'Referer'] as const) {
      const flow = await seedCode(f);
      const response = await flow.browser
        .post(`${BASE_PATH}/exchange`)
        .set(source, source === 'Origin' ? BACKEND_ORIGIN : `${FRONTEND_ORIGIN}/app?query=1`)
        .set('Cookie', `analytics=%; ${flow.browser.cookieHeader()}`)
        .set('DPoP', proofFor('exchange'))
        .send({ code: flow.code });
      credentials(f, flow.browser, response);
      expect(cookieLines(response).find((line) => line.startsWith(`${TRANSACTION_COOKIE}=`))).toMatch(/Max-Age=0;/);
    }
  });

  it('cookie-only POST is guarded even without DPoP binding; wrong browser/Origin cannot spend it', async () => {
    const f = fixture(transport);
    const flow = await loginAndCallback(f, undefined, null);
    expect(flow.record.deviceBinding).toBeUndefined();
    expect(flow.record.browserBindingHash).toBeTruthy();
    clearOperationCalls(f);
    const crossOrigin = await request(f.app)
      .post(`${BASE_PATH}/exchange`)
      .set('Origin', 'https://evil.example')
      .type('form')
      .send({ code: flow.code });
    expect(crossOrigin.status).toBe(403);
    expectNoCredentialWork(f, crossOrigin);
    const wrongCookie = await request(f.app)
      .post(`${BASE_PATH}/exchange`)
      .set('Origin', FRONTEND_ORIGIN)
      .send({ code: flow.code });
    expect(wrongCookie.body).toEqual(INVALID_BROWSER);
    expectNoCredentialWork(f, wrongCookie);
    expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    credentials(f, flow.browser, await exchange(f, flow), false);
    expect(flow.browser.cookieHeader()).not.toContain(`${TRANSACTION_COOKIE}=`);
  });

  it('wrong callback browser then stolen exchange code preserve the original browser lifecycle', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await browser
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor('login'))
      .send({});
    browser.capture(login);
    const url = new URL(login.body.authorizationUrl as string);
    const query = {
      state: url.searchParams.get('state'),
      code: `authcode:${url.searchParams.get('nonce')}:${SUBJECT}`,
    };
    clearOperationCalls(f);
    const transferred = await request(f.app).get(`${BASE_PATH}/callback`).query(query);
    expect(transferred.body).toEqual(INVALID_BROWSER);
    expect(providerRequests).toEqual([]);
    expect(await f.store.getAuthorizationTransaction(query.state!)).not.toBeNull();
    const callback = await browser.get(`${BASE_PATH}/callback`).query(query);
    expect(callback.status).toBe(302);
    browser.capture(callback);
    const code = new URL(callback.headers.location as string).searchParams.get('code')!;
    clearOperationCalls(f);
    const stolen = await exchange(f, { browser: createBrowser(f.app), code }, proofFor('exchange', { key: keyB }));
    expect(stolen.body).toEqual(INVALID_BROWSER);
    expectNoCredentialWork(f, stolen);
    const first = credentials(f, browser, await exchange(f, { browser, code }, proofFor('exchange')));
    const next = credentials(
      f,
      browser,
      await sessionRequest(f, browser, 'refresh', first.sessionId, proofFor('refresh')),
    );
    await expectApi(f, browser, next);
  });
});

describe.each(TRANSPORTS)('DBJWT-05 legacy enrollment/downgrade policy (%s)', (transport) => {
  it.each(['legacy', 'cookie-only POST'] as const)(
    'optional supplied proofs validate on %s exchange/refresh/logout but NEVER enroll a key',
    async (kind) => {
      const f = fixture(transport, { deviceBinding: { mode: 'optional' } });
      const flow = await seedCode(f, false, kind === 'cookie-only POST', { provider: undefined });
      clearOperationCalls(f);
      const bad = await exchange(f, flow, proofFor('exchange', { signingKey: keyB }));
      expect(bad.body).toEqual(INVALID_PROOF);
      expectNoCredentialWork(f, bad);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      const first = credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange', { key: keyB })), false);
      expect(f.calls.reserve).toHaveBeenCalledTimes(1);
      expect(f.issue.mock.calls[0][0].deviceBinding).toBeUndefined();
      expect(await f.store.getSession(first.sessionId)).not.toHaveProperty('deviceBinding');
      const next = credentials(
        f,
        flow.browser,
        await sessionRequest(f, flow.browser, 'refresh', first.sessionId, proofFor('refresh', { key: keyA })),
        false,
      );
      expect(f.calls.reserve).toHaveBeenCalledTimes(2);
      expect(f.calls.rotate.mock.calls[0][0].nextSession).not.toHaveProperty('deviceBinding');
      expect(await f.store.getSession(next.sessionId)).not.toHaveProperty('deviceBinding');
      expect(await f.store.getSession(next.sessionId)).toHaveProperty('provider', undefined);
      const logout = await sessionRequest(f, flow.browser, 'logout', next.sessionId, proofFor('logout', { key: keyB }));
      expect(logout.status).toBe(200);
      expect(f.calls.reserve).toHaveBeenCalledTimes(3);
      expect(await f.store.getSession(next.sessionId)).toBeNull();
    },
  );

  it.each(['refresh', 'logout'] as const)(
    'optional unbound %s rejects an invalid supplied proof before upstream/hooks/state',
    async (route) => {
      const f = fixture(transport);
      const { session, browser } = await seedSession(f, false);
      clearOperationCalls(f);
      const rejected = await sessionRequest(f, browser, route, session.sessionId, 'not-a-proof');
      expect(rejected.body).toEqual(INVALID_PROOF);
      expectNoCredentialWork(f, rejected);
      expect(await f.store.getSession(session.sessionId)).toEqual(session);
      expect(refreshTokens.has(session.refreshToken)).toBe(true);
    },
  );

  it.each(['exchange', 'refresh', 'logout', 'alias logout'] as const)(
    'binding-disabled %s fails closed before mutation even with a correct proof',
    async (route) => {
      const shared = runtime();
      const f = fixture(transport, { deviceBinding: undefined }, shared);
      const flow = await seedCode(f);
      let live = flow.session;
      if (route === 'alias logout') {
        live = await f.store.rotateSession({
          sessionId: flow.session.sessionId,
          nextSession: {
            ...flow.session,
            sessionId: `sess_next_${randomUUID()}`,
            updatedAt: NOW + 1,
          },
        });
      }
      clearOperationCalls(f);
      const response = await (route === 'exchange'
        ? exchange(f, flow, proofFor('exchange'))
        : sessionRequest(
            f,
            flow.browser,
            route === 'refresh' ? 'refresh' : 'logout',
            flow.session.sessionId,
            proofFor(route === 'refresh' ? 'refresh' : 'logout'),
          ));
      expect(response.status).toBe(401);
      expect(response.body).toEqual(MISSING_PROOF);
      expectNoCredentialWork(f, response);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getSession(live.sessionId)).toEqual(live);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    },
  );

  it('required cookie-only code rejects before cookie/nonce/replay; omission cannot become a bound first-presenter claim', async () => {
    const f = fixture(transport, { deviceBinding: { mode: 'required', nonce: { secret: randomBytes(32) } } });
    const flow = await seedCode(f, false, true);
    clearOperationCalls(f);
    const response = await exchange(f, flow, proofFor('exchange'));
    expect(response.body).toEqual(REQUIRED);
    expect(response.headers['dpop-nonce']).toBeUndefined();
    expectNoCredentialWork(f, response);
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
  });
});

describe.each(TRANSPORTS)('DBJWT-05 immutable exchange authority (%s)', (transport) => {
  it('two honest fresh proofs for one guarded code have exactly one atomic consumer/issuer and do not clear the loser cookie', async () => {
    const f = fixture(transport);
    const flow = await seedCode(f);
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.calls.consume.mockImplementation(async (input) => {
      if (++arrivals === 2) release();
      await gate;
      return f.originals.consume(input);
    });
    clearOperationCalls(f);
    const responses = await Promise.all([
      exchange(f, flow, proofFor('exchange')),
      exchange(f, flow, proofFor('exchange')),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(responses.find((r) => r.status === 400)!.headers['set-cookie']).toBeUndefined();
    expect(f.issue).toHaveBeenCalledTimes(1);
    expect(f.calls.reserve).toHaveBeenCalledTimes(2);
    expect(await f.store.getExchangeCode(flow.code)).toBeNull();
    expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
    expect(providerRequests).toEqual([]);
  });

  it.each(['session wrong key', 'unbound session', 'unbound code'] as const)(
    'code/session %s mismatch preflights before reservation or code consumption',
    async (kind) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      if (kind === 'unbound code') await f.store.createExchangeCode({ ...flow.record, deviceBinding: undefined });
      else
        await f.store.createSession({
          ...flow.session,
          deviceBinding: kind === 'unbound session' ? undefined : { type: 'dpop', jkt: keyB.jkt },
        });
      const beforeCode = await f.store.getExchangeCode(flow.code);
      const beforeSession = await f.store.getSession(flow.session.sessionId);
      clearOperationCalls(f);
      const response = await exchange(f, flow, proofFor('exchange'));
      expect(response.body).toEqual(INVALID_SESSION);
      expectNoCredentialWork(f, response);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getExchangeCode(flow.code)).toEqual(beforeCode);
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(beforeSession);
      await f.store.createExchangeCode(flow.record);
      await f.store.createSession(flow.session);
      credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
    },
  );

  it.each(['issuer', 'clientId', 'trailing slash issuer'] as const)(
    'opt-in foreign %s rejects exchange/refresh/logout before proof/replay/state/upstream and leaves an honest code retry',
    async (field) => {
      const shared = runtime();
      const owner = fixture(transport, {}, shared);
      const flow = await seedCode(owner);
      const foreign = fixture(
        transport,
        {
          config: {
            issuer:
              field === 'issuer'
                ? 'https://foreign.example'
                : field === 'trailing slash issuer'
                  ? `${issuer}/`
                  : issuer,
            clientId: field === 'clientId' ? 'foreign-client' : 'client_1',
          },
          deviceBinding: { nonce: { secret: randomBytes(32) } },
        },
        shared,
      );
      const browser = createBrowser(foreign.app);
      browser.setCookie(TRANSACTION_COOKIE, flow.secret);
      browser.setCookie(SESSION_COOKIE, flow.session.sessionId);
      clearOperationCalls(foreign);
      for (const route of ['exchange', 'refresh', 'logout'] as const) {
        const response = await (route === 'exchange'
          ? exchange(foreign, { browser, code: flow.code }, proofFor(route))
          : sessionRequest(foreign, browser, route, flow.session.sessionId, proofFor(route), { redirect: true }));
        expect(response.body).toEqual(INVALID_SESSION);
        expect(response.headers['dpop-nonce']).toBeUndefined();
        expectNoCredentialWork(foreign, response);
        expect(foreign.calls.reserve).not.toHaveBeenCalled();
      }
      expect(await owner.store.getExchangeCode(flow.code)).toEqual(flow.record);
      expect(await owner.store.getSession(flow.session.sessionId)).toEqual(flow.session);
      credentials(owner, flow.browser, await exchange(owner, flow, proofFor('exchange')));
    },
  );

  it.each(['session ID', 'key', 'cookie hash'] as const)(
    'atomic full-match rejects a %s replacement without consuming the replacement',
    async (field) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      const changed = {
        ...flow.record,
        ...(field === 'session ID' ? { sessionId: 'sess_replacement' } : {}),
        ...(field === 'key' ? { deviceBinding: { type: 'dpop' as const, jkt: keyB.jkt } } : {}),
        ...(field === 'cookie hash'
          ? { browserBindingHash: createHash('sha256').update('replacement-secret').digest('base64url') }
          : {}),
      };
      f.calls.consume.mockImplementationOnce(async (input) => {
        await f.store.createExchangeCode(changed);
        return f.originals.consume(input);
      });
      clearOperationCalls(f);
      const response = await exchange(f, flow, proofFor('exchange'));
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_EXCHANGE_CODE');
      expect(f.calls.consume.mock.calls[0][0]).toEqual({
        code: flow.code,
        expectedSessionId: flow.session.sessionId,
        match: { deviceBinding: flow.record.deviceBinding, browserBindingHash: flow.record.browserBindingHash },
      });
      expect(await f.store.getExchangeCode(flow.code)).toEqual(changed);
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
      await f.store.createExchangeCode(flow.record);
      credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
    },
  );

  it.each(['returnTo', 'createdAt', 'expiresAt'] as const)(
    'rechecks atomically returned %s before issuance and never clears on a replacement mismatch',
    async (field) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      f.calls.consume.mockImplementationOnce(async (input) => {
        await f.store.createExchangeCode({
          ...flow.record,
          [field]: field === 'returnTo' ? `${FRONTEND_ORIGIN}/changed` : NOW + 10_000,
        });
        return f.originals.consume(input);
      });
      clearOperationCalls(f);
      const response = await exchange(f, flow, proofFor('exchange'));
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_EXCHANGE_CODE');
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
    },
  );

  it.each(['logicalSessionId', 'subject', 'provider', 'deviceBinding', 'expiresAt', 'refreshToken'] as const)(
    'rechecks session %s after consume before issuance',
    async (field) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      f.calls.consume.mockImplementationOnce(async (input) => {
        const consumed = await f.originals.consume(input);
        const value =
          field === 'provider'
            ? { issuer: 'https://foreign.example', clientId: 'client_1' }
            : field === 'deviceBinding'
              ? { type: 'dpop', jkt: keyB.jkt }
              : field === 'expiresAt'
                ? NOW + 240_000
                : 'changed-authority';
        await f.store.createSession({ ...flow.session, [field]: value });
        return consumed;
      });
      clearOperationCalls(f);
      const response = await exchange(f, flow, proofFor('exchange'));
      expect(response.status).toBe(401);
      expect(response.body).toEqual(INVALID_SESSION);
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('captures proof/method/path/code/cookie/source before an async store mutates request authority', async () => {
    const f = fixture(transport);
    const flow = await seedCode(f);
    f.calls.getCode.mockImplementationOnce(async (code) => {
      const record = await f.originals.getCode(code);
      const req = f.requests.at(-1)!;
      req.headers.cookie = `${TRANSACTION_COOKIE}=${'A'.repeat(43)}`;
      req.headers.origin = 'https://evil.example';
      req.headers.dpop = proofFor('exchange', { key: keyB });
      req.rawHeaders = ['Origin', 'https://evil.example', 'DPoP', req.headers.dpop];
      req.body.code = 'changed-code';
      req.method = 'GET';
      req.originalUrl = '/changed-path';
      return record;
    });
    const first = credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
    expect(first.sessionId).toBe(flow.session.sessionId);
    expect(f.calls.consume.mock.calls[0][0].code).toBe(flow.code);
    expect(f.issue.mock.calls[0][0].deviceBinding?.jkt).toBe(keyA.jkt);
  });
});

describe.each(TRANSPORTS)('DBJWT-05 shared vault proof/replay/nonce admission (%s)', (transport) => {
  it.each(['sequential', 'concurrent'] as const)(
    '[DBJWT-01; DBJWT-05] %s exchange proof replay across instances fails with a different live bound code',
    async (kind) => {
      const shared = runtime();
      const f = fixture(transport, {}, shared);
      const other = fixture(transport, {}, shared);
      const first = await seedCode(f);
      const second = await seedCode(other);
      const proof = proofFor('exchange', { claims: { jti: 'cross-instance-exchange' } });
      clearOperationCalls(f);
      if (kind === 'concurrent') {
        let arrivals = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        f.calls.reserve.mockImplementation(async (input) => {
          if (++arrivals === 2) release();
          if (arrivals <= 2) await gate;
          return f.originals.reserve(input);
        });
      }
      const responses =
        kind === 'concurrent'
          ? await Promise.all([exchange(f, first, proof), exchange(other, second, proof)])
          : [await exchange(f, first, proof), await exchange(other, second, proof)];
      expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
      const loserIndex = responses.findIndex((r) => r.status === 401);
      const loser = loserIndex === 0 ? first : second;
      const context = loserIndex === 0 ? f : other;
      expect(responses[loserIndex].body).toEqual(INVALID_PROOF);
      expect(responses[loserIndex].headers['set-cookie']).toBeUndefined();
      expect(await f.store.getExchangeCode(loser.code)).toEqual(loser.record);
      expect(await f.store.getSession(loser.session.sessionId)).toEqual(loser.session);
      expect(f.calls.consume).toHaveBeenCalledTimes(1);
      expect(f.calls.legacyConsume).not.toHaveBeenCalled();
      expect(f.calls.rotate).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
      credentials(context, loser.browser, await exchange(context, loser, proofFor('exchange')));
      expect(f.calls.consume).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['sequential', 'concurrent'] as const)(
    '[DBJWT-01; DBJWT-05] %s refresh proof replay across instances fails with a different live bound session and no upstream burn',
    async (kind) => {
      const shared = runtime();
      const f = fixture(transport, {}, shared);
      const other = fixture(transport, {}, shared);
      const first = await seedSession(f);
      const second = await seedSession(other);
      const proof = proofFor('refresh', { claims: { jti: 'cross-instance-refresh' } });
      clearOperationCalls(f);
      if (kind === 'concurrent') {
        let arrivals = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        f.calls.reserve.mockImplementation(async (input) => {
          if (++arrivals === 2) release();
          if (arrivals <= 2) await gate;
          return f.originals.reserve(input);
        });
      }
      const call = (context: Fixture, target: typeof first) =>
        sessionRequest(context, target.browser, 'refresh', target.session.sessionId, proof);
      const responses =
        kind === 'concurrent'
          ? await Promise.all([call(f, first), call(other, second)])
          : [await call(f, first), await call(other, second)];
      expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
      const loserIndex = responses.findIndex((r) => r.status === 401);
      const loser = loserIndex === 0 ? first : second;
      const context = loserIndex === 0 ? f : other;
      expect(responses[loserIndex].body).toEqual(INVALID_PROOF);
      expect(responses[loserIndex].headers['set-cookie']).toBeUndefined();
      expect(await f.store.getSession(loser.session.sessionId)).toEqual(loser.session);
      expect(refreshTokens.has(loser.session.refreshToken)).toBe(true);
      expect(providerRequests.filter((r) => r.body?.grant_type === 'refresh_token')).toHaveLength(1);
      expect(f.calls.rotate).toHaveBeenCalledTimes(1);
      expect(f.calls.revoke).not.toHaveBeenCalled();
      credentials(
        context,
        loser.browser,
        await sessionRequest(context, loser.browser, 'refresh', loser.session.sessionId, proofFor('refresh')),
      );
      expect(providerRequests.filter((r) => r.body?.grant_type === 'refresh_token')).toHaveLength(2);
    },
  );

  it.each(['exchange', 'refresh', 'logout'] as const)(
    'waits for successful shared replay reservation before %s consumption/upstream/hooks/mutation',
    async (route) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      let reached!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.calls.reserve.mockImplementation(async (input) => {
        reached();
        await gate;
        return f.originals.reserve(input);
      });
      clearOperationCalls(f);
      const pending = (
        route === 'exchange'
          ? exchange(f, flow, proofFor(route))
          : sessionRequest(f, flow.browser, route, flow.session.sessionId, proofFor(route))
      ).then((r) => r);
      await ready;
      expect(providerRequests).toEqual([]);
      expect(f.calls.consume).not.toHaveBeenCalled();
      expect(f.calls.rotate).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      release();
      expect((await pending).status).toBe(200);
    },
  );

  it('all vault routes share key/JTI replay space rather than partitioning by route/code/session', async () => {
    const f = fixture(transport);
    const first = await seedCode(f);
    const second = await seedSession(f);
    const third = await seedSession(f);
    const jti = 'same-vault-jti-across-routes';
    credentials(f, first.browser, await exchange(f, first, proofFor('exchange', { claims: { jti } })));
    clearOperationCalls(f);
    for (const [route, target] of [
      ['refresh', second],
      ['logout', third],
    ] as const) {
      const response = await sessionRequest(
        f,
        target.browser,
        route,
        target.session.sessionId,
        proofFor(route, { claims: { jti } }),
      );
      expect(response.body).toEqual(INVALID_PROOF);
      expectNoCredentialWork(f, response);
      expect(await f.store.getSession(target.session.sessionId)).toEqual(target.session);
    }
    credentials(
      f,
      second.browser,
      await sessionRequest(f, second.browser, 'refresh', second.session.sessionId, proofFor('refresh')),
    );
    expect((await sessionRequest(f, third.browser, 'logout', third.session.sessionId, proofFor('logout'))).status).toBe(
      200,
    );
  });

  it.each(['exchange', 'refresh', 'logout', 'alias logout'] as const)(
    '%s nonce challenge follows identity/cookie/key checks and precedes reservation/state/upstream',
    async (kind) => {
      const shared = runtime();
      const binding = { nonce: { secret: randomBytes(32), lifetimeSeconds: 60 } };
      const f = fixture(transport, { deviceBinding: binding }, shared);
      const other = fixture(transport, { deviceBinding: binding }, shared);
      const flow = await seedCode(f);
      const otherBrowser = createBrowser(other.app);
      otherBrowser.setCookie(TRANSACTION_COOKIE, flow.secret);
      otherBrowser.setCookie(SESSION_COOKIE, flow.session.sessionId);
      let liveSession = flow.session;
      if (kind === 'alias logout')
        liveSession = await f.store.rotateSession({
          sessionId: flow.session.sessionId,
          nextSession: { ...flow.session, sessionId: `sess_next_${randomUUID()}`, updatedAt: NOW + 1 },
        });
      const route = kind === 'alias logout' ? 'logout' : kind;
      const call = (proof: string, context = f, browser = flow.browser) =>
        route === 'exchange'
          ? exchange(context, { ...flow, browser }, proof)
          : sessionRequest(context, browser, route, flow.session.sessionId, proof);
      clearOperationCalls(f);
      const wrongKey = await call(proofFor(route, { key: keyB }));
      expect(wrongKey.body).toEqual(INVALID_PROOF);
      expect(wrongKey.headers['dpop-nonce']).toBeUndefined();
      const wrongUrl = await call(proofFor(route, { claims: { htu: `${BACKEND_ORIGIN}/wrong` } }));
      expect(wrongUrl.body).toEqual(INVALID_PROOF);
      expect(wrongUrl.headers['dpop-nonce']).toBeUndefined();
      const challenge = await call(proofFor(route));
      expect(challenge.status).toBe(400);
      expect(challenge.body).toEqual({ code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'A fresh DPoP nonce is required.' });
      expectNoCredentialWork(f, challenge);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(challenge.headers['www-authenticate']).toBeUndefined();
      const nonce = challenge.headers['dpop-nonce'] as string;
      expect(Buffer.byteLength(nonce)).toBeLessThanOrEqual(512);
      expect(await f.store.getSession(liveSession.sessionId)).toEqual(liveSession);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      // Another challenge does not invalidate the older live nonce. A different
      // middleware instance accepts that nonce with a new proof/JTI.
      const later = await call(proofFor(route), other, otherBrowser);
      expect(later.headers['dpop-nonce']).not.toBe(nonce);
      const accepted = await call(proofFor(route, { claims: { nonce } }), other, otherBrowser);
      expect(accepted.status).toBe(200);
      expect(f.calls.reserve).toHaveBeenCalledTimes(1);
      expect(accepted.headers['dpop-nonce']).toBeUndefined();
    },
  );

  it.each(['exchange', 'refresh', 'logout'] as const)(
    'optional unbound %s with a supplied proof honors nonce/replay without enrolling',
    async (route) => {
      const f = fixture(transport, { deviceBinding: { nonce: { secret: randomBytes(32) } } });
      const flow = await seedCode(f, false, false);
      clearOperationCalls(f);
      const call = (proof?: string) =>
        route === 'exchange'
          ? exchange(f, flow, proof)
          : sessionRequest(f, flow.browser, route, flow.session.sessionId, proof);
      const challenged = await call(proofFor(route));
      expect(challenged.status).toBe(400);
      expectNoCredentialWork(f, challenged);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      const response = await call(proofFor(route, { claims: { nonce: challenged.headers['dpop-nonce'] } }));
      expect(response.status).toBe(200);
      if (route !== 'logout') {
        const value = credentials(f, flow.browser, response, false);
        expect(await f.store.getSession(value.sessionId)).not.toHaveProperty('deviceBinding');
        expect(f.issue.mock.calls[0][0].deviceBinding).toBeUndefined();
      }
    },
  );

  it.each(['exchange', 'refresh', 'logout'] as const)(
    '%s replay provider failure is sanitized 503 and cannot mutate/burn credentials',
    async (route) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      const diagnostic = new Error('private shared replay error');
      f.calls.reserve.mockRejectedValueOnce(diagnostic);
      clearOperationCalls(f);
      const response = await (route === 'exchange'
        ? exchange(f, flow, proofFor(route))
        : sessionRequest(f, flow.browser, route, flow.session.sessionId, proofFor(route)));
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
        message: 'DPoP replay protection is unavailable.',
      });
      expect(response.headers['www-authenticate']).toBeUndefined();
      expectNoCredentialWork(f, response);
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
      expect(f.onError.mock.calls[0][0].error).toHaveProperty('cause', diagnostic);
    },
  );

  it('real capacity rejects fresh proof before refresh but duplicate precedence and expiry recovery remain correct', async () => {
    const shared = runtime(undefined, 1);
    const f = fixture(transport, {}, shared);
    const first = await seedCode(f);
    const second = await seedSession(f);
    const proof = proofFor('exchange');
    credentials(f, first.browser, await exchange(f, first, proof));
    clearOperationCalls(f);
    const full = await sessionRequest(f, second.browser, 'refresh', second.session.sessionId, proofFor('refresh'));
    expect(full.status).toBe(503);
    expectNoCredentialWork(f, full);
    expect(refreshTokens.has(second.session.refreshToken)).toBe(true);
    // Re-sign with the authenticated first JTI for another route/target. This
    // remains duplicate (401), rather than being hidden by capacity (503).
    const jti = decodeJwt(proof).jti;
    const duplicate = await sessionRequest(
      f,
      second.browser,
      'refresh',
      second.session.sessionId,
      proofFor('refresh', { claims: { jti } }),
    );
    expect(duplicate.body).toEqual(INVALID_PROOF);
    expectNoCredentialWork(f, duplicate);
    f.clock.value += 66_000;
    credentials(
      f,
      second.browser,
      await sessionRequest(
        f,
        second.browser,
        'refresh',
        second.session.sessionId,
        proofFor('refresh', { now: f.clock.value }),
      ),
    );
  });

  it('retains admitted refresh proof after discovery failure; same proof cannot burn upstream on retry', async () => {
    const f = fixture(transport);
    const { session, browser } = await seedSession(f);
    const proof = proofFor('refresh');
    failDiscovery = true;
    const failure = await sessionRequest(f, browser, 'refresh', session.sessionId, proof);
    expect(failure.status).toBe(502);
    expect(f.calls.rotate).not.toHaveBeenCalled();
    expect(refreshTokens.has(session.refreshToken)).toBe(true);
    clearOperationCalls(f);
    failDiscovery = false;
    const replay = await sessionRequest(f, browser, 'refresh', session.sessionId, proof);
    expect(replay.body).toEqual(INVALID_PROOF);
    expectNoCredentialWork(f, replay);
    credentials(f, browser, await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh')));
    expect(providerRequests.filter((r) => r.body?.grant_type === 'refresh_token')).toHaveLength(1);
  });
});

describe.each(TRANSPORTS)('DBJWT-05 logout live/alias original authority (%s)', (transport) => {
  describe.each(['live', 'alias'] as const)('%s handle', (kind) => {
    it.each([
      ['missing proof', (): undefined => undefined, MISSING_PROOF],
      ['wrong key', () => proofFor('logout', { key: keyB }), INVALID_PROOF],
      ['stale proof', () => proofFor('logout', { claims: { iat: Math.floor(NOW / 1000) - 65 } }), INVALID_PROOF],
      ['invalid signature', () => proofFor('logout', { signingKey: keyB }), INVALID_PROOF],
    ] as const)(
      '%s cannot revoke or clear; a fresh original-key proof deletes only the target lineage',
      async (_name, makeProof, expected) => {
        const f = fixture(transport);
        const { session, browser } = await seedSession(f);
        const sibling = await f.store.createSession({ ...session, sessionId: `sess_sibling_${randomUUID()}` });
        const unrelated = await seedSession(f);
        const live =
          kind === 'alias'
            ? await f.store.rotateSession({
                sessionId: session.sessionId,
                nextSession: {
                  ...session,
                  sessionId: `sess_next_${randomUUID()}`,
                  updatedAt: NOW + 1,
                },
              })
            : session;
        clearOperationCalls(f);
        const rejected = await sessionRequest(f, browser, 'logout', session.sessionId, makeProof(), { redirect: true });
        expect(rejected.status).toBe(401);
        expect(rejected.body).toEqual(expected);
        expectNoCredentialWork(f, rejected);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await f.store.getSession(live.sessionId)).toEqual(live);
        expect(await f.store.getSession(sibling.sessionId)).toEqual(sibling);
        expect(await f.store.getSession(unrelated.session.sessionId)).not.toBeNull();
        const accepted = await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'));
        expect(accepted.status).toBe(200);
        expect(accepted.body).toEqual({ loggedOut: true });
        expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: session.logicalSessionId });
        expect(f.calls.delete).not.toHaveBeenCalled();
        expect(await f.store.getSession(live.sessionId)).toBeNull();
        expect(await f.store.getSession(sibling.sessionId)).toBeNull();
        expect(await f.store.getSession(unrelated.session.sessionId)).not.toBeNull();
        expect(providerRequests).toEqual([]);
        if (kind === 'alias') expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
        else expect(f.hooks.onBeforeLogout).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['issuer', 'clientId'] as const)(
      'foreign %s refuses the lineage even with the right key and preserves an honest original-provider retry',
      async (field) => {
        const shared = runtime();
        const owner = fixture(transport, {}, shared);
        const { session } = await seedSession(owner);
        const live =
          kind === 'alias'
            ? await owner.store.rotateSession({
                sessionId: session.sessionId,
                nextSession: {
                  ...session,
                  sessionId: `sess_next_${randomUUID()}`,
                  updatedAt: NOW + 1,
                },
              })
            : session;
        const f = fixture(
          transport,
          {
            config: {
              issuer: field === 'issuer' ? 'https://foreign.example' : issuer,
              clientId: field === 'clientId' ? 'foreign-client' : 'client_1',
            },
          },
          shared,
        );
        const browser = createBrowser(f.app);
        browser.setCookie(SESSION_COOKIE, session.sessionId);
        clearOperationCalls(f);
        const response = await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'));
        expect(response.body).toEqual(INVALID_SESSION);
        expectNoCredentialWork(f, response);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await owner.store.getSession(live.sessionId)).toEqual(live);
        const honest = createBrowser(owner.app);
        honest.setCookie(SESSION_COOKIE, session.sessionId);
        expect((await sessionRequest(owner, honest, 'logout', session.sessionId, proofFor('logout'))).status).toBe(200);
        expect(await owner.store.getSession(live.sessionId)).toBeNull();
      },
    );
  });

  it.each(['missing target', 'expired alias'] as const)(
    '%s is idempotent without deletion/reservation/hooks, even with an invalid proof',
    async (kind) => {
      const f = fixture(transport, { deviceBinding: { mode: 'required' } });
      const { session, browser } = await seedSession(f);
      let target = 'missing-handle';
      let live = session;
      if (kind === 'expired alias') {
        const successor = await f.store.rotateSession({
          sessionId: session.sessionId,
          nextSession: {
            ...session,
            sessionId: `sess_next_${randomUUID()}`,
            expiresAt: NOW + 1000,
            updatedAt: NOW + 1,
          },
        });
        live = await f.store.rotateSession({
          sessionId: successor.sessionId,
          nextSession: {
            ...successor,
            sessionId: `sess_later_${randomUUID()}`,
            expiresAt: NOW + 120_000,
            updatedAt: NOW + 2,
          },
        });
        f.clock.value += 1000;
        target = session.sessionId;
      }
      browser.setCookie(SESSION_COOKIE, target);
      clearOperationCalls(f);
      const response = await sessionRequest(f, browser, 'logout', target, 'not-a-proof');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ loggedOut: true });
      expect(f.calls.delete).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
      expect(f.hooks.onLogout).not.toHaveBeenCalled();
      expect(await f.store.getSession(live.sessionId)).toEqual(live);
      expect(providerRequests).toEqual([]);
    },
  );

  it.each(['optional', 'disabled'] as const)(
    '%s unbound alias remains compatible and uses the resolved lineage without unconditional stale deletion',
    async (mode) => {
      const f = fixture(transport, { deviceBinding: mode === 'disabled' ? undefined : { mode } });
      const { session, browser } = await seedSession(f, false);
      const live = await f.store.rotateSession({
        sessionId: session.sessionId,
        nextSession: {
          ...session,
          sessionId: `sess_next_${randomUUID()}`,
          updatedAt: NOW + 1,
        },
      });
      clearOperationCalls(f);
      const response = await sessionRequest(f, browser, 'logout', session.sessionId);
      expect(response.status).toBe(200);
      expect(f.calls.delete).not.toHaveBeenCalled();
      expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: session.logicalSessionId });
      expect(await f.store.getSession(live.sessionId)).toBeNull();
      expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
    },
  );

  it('required unbound alias rejects before reservation/deletion and cannot be enrolled by a supplied proof', async () => {
    const f = fixture(transport, { deviceBinding: { mode: 'required' } });
    const { session, browser } = await seedSession(f, false);
    const live = await f.store.rotateSession({
      sessionId: session.sessionId,
      nextSession: {
        ...session,
        sessionId: `sess_next_${randomUUID()}`,
        updatedAt: NOW + 1,
      },
    });
    clearOperationCalls(f);
    const response = await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'));
    expect(response.body).toEqual(REQUIRED);
    expectNoCredentialWork(f, response);
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(await f.store.getSession(live.sessionId)).toEqual(live);
  });

  it('replayed logout proof against a different live lineage cannot revoke it across instances', async () => {
    const shared = runtime();
    const f = fixture(transport, {}, shared);
    const other = fixture(transport, {}, shared);
    const first = await seedSession(f);
    const second = await seedSession(other);
    const proof = proofFor('logout');
    expect((await sessionRequest(f, first.browser, 'logout', first.session.sessionId, proof)).status).toBe(200);
    clearOperationCalls(other);
    const response = await sessionRequest(other, second.browser, 'logout', second.session.sessionId, proof);
    expect(response.body).toEqual(INVALID_PROOF);
    expectNoCredentialWork(other, response);
    expect(await other.store.getSession(second.session.sessionId)).toEqual(second.session);
    expect(
      (await sessionRequest(other, second.browser, 'logout', second.session.sessionId, proofFor('logout'))).status,
    ).toBe(200);
  });

  it('captures provider/key/lineage before a logout hook mutates the session and uses original ID token for redirected logout', async () => {
    const f = fixture(transport, {
      postLogoutRedirectUri: `${FRONTEND_ORIGIN}/logged-out`,
      hooks: {
        onBeforeLogout({ session, req }) {
          session!.sessionId = 'changed-session';
          session!.logicalSessionId = 'changed-lineage';
          session!.subject = 'changed-subject';
          session!.provider = { issuer: 'https://foreign.example', clientId: 'foreign-client' };
          session!.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
          session!.idToken = 'changed-id-token';
          req.body.sessionId = 'changed-body';
          req.body.redirect = false;
          req.headers.cookie = `${SESSION_COOKIE}=changed-cookie`;
          Object.defineProperty(session!, 'logicalSessionId', {
            get() {
              throw new Error('Forbidden replacement authority getter');
            },
            enumerable: true,
          });
        },
      },
    });
    const { session, browser } = await seedSession(f);
    const unrelated = await seedSession(f);
    clearOperationCalls(f);
    const response = await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'), {
      redirect: true,
    });
    expect(response.status).toBe(302);
    expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: session.logicalSessionId });
    expect(await f.store.getSession(session.sessionId)).toBeNull();
    expect(await f.store.getSession(unrelated.session.sessionId)).not.toBeNull();
    const url = new URL(response.headers.location as string);
    expect(url.origin).toBe(new URL(issuer).origin);
    expect(url.searchParams.get('id_token_hint')).toBe(session.idToken);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${FRONTEND_ORIGIN}/logged-out`);
    expect(f.hooks.onLogout.mock.calls[0][0].session).toMatchObject({
      subject: SUBJECT,
      provider: session.provider,
      deviceBinding: session.deviceBinding,
    });
  });

  it('logout precommit veto preserves the session/cookie but retains proof reservation; a fresh proof retries', async () => {
    const diagnostic = new Error('private logout veto');
    const f = fixture(transport);
    const { session, browser } = await seedSession(f);
    f.hooks.onBeforeLogout.mockRejectedValueOnce(diagnostic);
    const proof = proofFor('logout');
    clearOperationCalls(f);
    const response = await sessionRequest(f, browser, 'logout', session.sessionId, proof);
    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(f.calls.revoke).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await f.store.getSession(session.sessionId)).toEqual(session);
    expect(f.onError.mock.calls[0][0].error).toBe(diagnostic);
    const replay = await sessionRequest(f, browser, 'logout', session.sessionId, proof);
    expect(replay.body).toEqual(INVALID_PROOF);
    expect((await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'))).status).toBe(200);
  });

  it.each(['provider', 'deviceBinding', 'logicalSessionId'] as const)(
    'logout rechecks changed %s context after proof admission before hooks/revocation',
    async (field) => {
      const f = fixture(transport);
      const { session, browser } = await seedSession(f);
      f.calls.getContext.mockImplementationOnce(f.originals.getContext).mockImplementationOnce(async (id) => {
        const value = (await f.originals.getContext(id))!;
        return {
          ...value,
          [field]:
            field === 'provider'
              ? { issuer: 'https://foreign.example' }
              : field === 'deviceBinding'
                ? { type: 'dpop', jkt: keyB.jkt }
                : 'changed-lineage',
        };
      });
      clearOperationCalls(f);
      const response = await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'));
      expect(response.body).toEqual(INVALID_SESSION);
      expectNoCredentialWork(f, response);
      expect(await f.store.getSession(session.sessionId)).toEqual(session);
    },
  );

  it('signed backchannel logout still revokes bound sessions without a browser proof, including required mode', async () => {
    const f = fixture(transport, { deviceBinding: { mode: 'required' } });
    const { session } = await seedSession(f, true, { providerSessionId: 'signed-backchannel-target' });
    const token = await new SignJWT({
      sid: session.providerSessionId,
      jti: randomUUID(),
      events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'dbjwt-05-provider', typ: 'logout+jwt' })
      .setIssuer(issuer)
      .setAudience('client_1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(providerKey);
    clearOperationCalls(f);
    const response = await request(f.app)
      .post(`${BASE_PATH}/backchannel-logout`)
      .type('form')
      .send({ logout_token: token });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ loggedOut: true, revokedSessions: 1 });
    expect(await f.store.getSession(session.sessionId)).toBeNull();
    expect(f.calls.reserve).not.toHaveBeenCalled();
  });
});

describe('DBJWT-05 cookie refresh/logout source and selected-session authority', () => {
  it.each(['refresh', 'logout'] as const)(
    '%s Origin guard rejects before session/proof/replay/upstream even with the correct key',
    async (route) => {
      const f = fixture('cookie');
      const { session, browser } = await seedSession(f);
      clearOperationCalls(f);
      const response = await browser
        .post(`${BASE_PATH}/${route}`)
        .set('Origin', 'https://evil.example')
        .set('DPoP', proofFor(route))
        .send({});
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
        message: `${route === 'refresh' ? 'Refresh' : 'Logout'} request origin is not trusted.`,
      });
      expectNoCredentialWork(f, response);
      expect(f.calls.getSession).not.toHaveBeenCalled();
      expect(f.calls.getContext).not.toHaveBeenCalled();
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getSession(session.sessionId)).toEqual(session);
      expect(refreshTokens.has(session.refreshToken)).toBe(true);
      expect((await sessionRequest(f, browser, route, session.sessionId, proofFor(route))).status).toBe(200);
    },
  );

  it.each(['refresh', 'logout'] as const)(
    '%s does not accept a body session handle when the session cookie is missing/malformed',
    async (route) => {
      const f = fixture('cookie');
      const { session } = await seedSession(f);
      clearOperationCalls(f);
      for (const cookie of [undefined, `${SESSION_COOKIE}=%`]) {
        const call = request(f.app)
          .post(`${BASE_PATH}/${route}`)
          .set('Origin', FRONTEND_ORIGIN)
          .set('DPoP', proofFor(route));
        if (cookie) call.set('Cookie', cookie);
        const response = await call.send({ sessionId: session.sessionId });
        expect(response.status).toBe(400);
        expectNoCredentialWork(f, response);
        expect(f.calls.getSession).not.toHaveBeenCalled();
        expect(f.calls.getContext).not.toHaveBeenCalled();
        expect(f.calls.reserve).not.toHaveBeenCalled();
      }
      expect(await f.store.getSession(session.sessionId)).toEqual(session);
    },
  );

  it.each(['refresh', 'logout'] as const)(
    '%s uses the selected cookie key/lineage rather than a different body handle',
    async (route) => {
      const f = fixture('cookie');
      const first = await seedSession(f);
      const second = await seedSession(f, true, { deviceBinding: { type: 'dpop', jkt: keyB.jkt } });
      clearOperationCalls(f);
      const response = await sessionRequest(f, second.browser, route, first.session.sessionId, proofFor(route), {
        sessionId: first.session.sessionId,
      });
      expect(response.body).toEqual(INVALID_PROOF);
      expectNoCredentialWork(f, response);
      expect(await f.store.getSession(first.session.sessionId)).toEqual(first.session);
      expect(await f.store.getSession(second.session.sessionId)).toEqual(second.session);
      expect(refreshTokens.has(first.session.refreshToken)).toBe(true);
      expect(refreshTokens.has(second.session.refreshToken)).toBe(true);
    },
  );
});

describe.each(TRANSPORTS)('DBJWT-05 issuance/hook/rotation authority (%s)', (transport) => {
  it.each(['exchange', 'refresh'] as const)(
    'bound %s remains sender-constrained with an omitted local issuer',
    async (route) => {
      const f = fixture(transport, { tokenIssuer: undefined });
      const flow = await seedCode(f);
      clearOperationCalls(f);
      const rejected = await (route === 'exchange'
        ? exchange(f, flow)
        : sessionRequest(f, flow.browser, 'refresh', flow.session.sessionId));
      expect(rejected.body).toEqual(MISSING_PROOF);
      expectNoCredentialWork(f, rejected);
      const response = await (route === 'exchange'
        ? exchange(f, flow, proofFor(route))
        : sessionRequest(f, flow.browser, 'refresh', flow.session.sessionId, proofFor(route)));
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('expiresIn');
      expect(response.body).not.toHaveProperty('tokenType');
      flow.browser.capture(response);
      const sessionId = transport === 'body' ? (response.body.sessionId as string) : flow.browser.sessionId()!;
      expect(await f.store.getSession(sessionId)).toMatchObject({ deviceBinding: { type: 'dpop', jkt: keyA.jkt } });
      expect(f.issue).not.toHaveBeenCalled();
    },
  );

  const invalidIssuerResults = [
    ['Bearer downgrade', (valid: Awaited<ReturnType<typeof issueLocal>>) => ({ ...valid, tokenType: 'Bearer' })],
    ['omitted token type', (valid: Awaited<ReturnType<typeof issueLocal>>) => ({ ...valid, tokenType: undefined })],
    [
      'opaque token',
      (valid: Awaited<ReturnType<typeof issueLocal>>) => ({ ...valid, accessToken: 'opaque-not-a-JWT' }),
    ],
    [
      'wrong cnf',
      async (valid: Awaited<ReturnType<typeof issueLocal>>) => ({
        ...valid,
        accessToken: await new SignJWT({ cnf: { jkt: keyB.jkt } })
          .setProtectedHeader({ alg: 'HS256' })
          .sign(localSecret),
      }),
    ],
    [
      'throwing issuer',
      () => {
        throw new Error('private custom issuer diagnostic');
      },
    ],
  ] as const;
  describe.each(['exchange', 'refresh'] as const)('%s rollback', (route) => {
    it.each(invalidIssuerResults)(
      '%s result revokes only the original lineage and clears the right cookies after issuer authority mutations',
      async (_name, alter) => {
        const f = fixture(transport, {
          tokenIssuer: {
            async issue(input) {
              const valid = await issueLocal(input);
              expect(Object.isFrozen(input.deviceBinding)).toBe(true);
              expect(input.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt, alg: 'ES256' });
              input.session.sessionId = 'issuer-changed-session';
              input.session.logicalSessionId = 'issuer-changed-lineage';
              input.session.provider = { issuer: 'https://changed.example', clientId: 'changed-client' };
              input.session.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
              input.session.subject = 'issuer-changed-subject';
              return (await alter(valid)) as Awaited<ReturnType<typeof issueLocal>>;
            },
          },
        });
        const flow = await seedCode(f);
        const sibling = await f.store.createSession({ ...flow.session, sessionId: `sess_sibling_${randomUUID()}` });
        const unrelated = await seedSession(f, true, { logicalSessionId: 'issuer-changed-lineage' });
        clearOperationCalls(f);
        const response = await (route === 'exchange'
          ? exchange(f, flow, proofFor(route))
          : sessionRequest(f, flow.browser, 'refresh', flow.session.sessionId, proofFor(route)));
        expect(response.status).toBe(500);
        expect(response.body).toEqual(INTERNAL_ERROR);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: flow.session.logicalSessionId });
        expect(await f.store.getSession(flow.session.sessionId)).toBeNull();
        expect(await f.store.getSession(sibling.sessionId)).toBeNull();
        expect(await f.store.getSession(unrelated.session.sessionId)).not.toBeNull();
        if (route === 'refresh') {
          const nextId = f.calls.rotate.mock.calls[0][0].nextSession.sessionId;
          expect(await f.store.getSession(nextId)).toBeNull();
          expect(f.hooks.onSessionRefreshed).not.toHaveBeenCalled();
        } else expect(await f.store.getExchangeCode(flow.code)).toBeNull();
        const lines = cookieLines(response);
        if (transport === 'cookie')
          expect(lines.find((line) => line.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Max-Age=0;/);
        if (route === 'exchange')
          expect(lines.find((line) => line.startsWith(`${TRANSACTION_COOKIE}=`))).toMatch(/Max-Age=0;/);
        else expect(lines.some((line) => line.startsWith(`${TRANSACTION_COOKIE}=`))).toBe(false);
        expect(f.onError).toHaveBeenCalledTimes(1);
        expect(response.text).not.toContain('private custom issuer');
        expect(response.text).not.toContain('issuer-changed');
      },
    );
  });

  it.each(['remove binding', 'rebind', 'throwing security getters', 'throw after mutation'] as const)(
    'refresh postcommit hook tries to %s but cannot change issued/response/stored identity, binding, deadline or profile',
    async (attempt) => {
      const forbidden = vi.fn(() => {
        throw new Error('Forbidden security getter');
      });
      const diagnostic = new Error('private refresh notification diagnostic');
      const f = fixture(transport, {
        hooks: {
          onSessionRefreshed({ session, req, res, metadata }) {
            if (attempt === 'remove binding') delete session!.deviceBinding;
            else session!.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
            session!.sessionId = 'hook-selected-session';
            session!.logicalSessionId = 'hook-selected-lineage';
            session!.subject = 'hook-selected-subject';
            session!.provider = { issuer: 'https://hook.example', clientId: 'hook-client' };
            session!.expiresAt = NOW + 99_000_000;
            session!.user!.email = 'hook@example.com';
            (session!.user!.preferences as Record<string, unknown>).theme = 'hook-theme';
            (session!.metadata!.application as Record<string, unknown>).theme = 'hook-metadata';
            metadata!.previousSessionId = 'hook-selected-previous';
            req.body.sessionId = 'hook-selected-body';
            req.headers.cookie = `${SESSION_COOKIE}=hook-selected-cookie`;
            res.setHeader('Cache-Control', 'public');
            if (attempt === 'throwing security getters')
              for (const field of [
                'sessionId',
                'logicalSessionId',
                'provider',
                'deviceBinding',
                'expiresAt',
                'subject',
              ]) {
                Object.defineProperty(session!, field, { get: forbidden, enumerable: true });
              }
            if (attempt === 'throw after mutation') throw diagnostic;
          },
        },
      });
      const { session, browser } = await seedSession(f);
      const response = await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'));
      const next = credentials(f, browser, response);
      const stored = await f.store.getSession(next.sessionId);
      expect(stored).toMatchObject({
        logicalSessionId: session.logicalSessionId,
        subject: session.subject,
        provider: session.provider,
        deviceBinding: session.deviceBinding,
        expiresAt: session.expiresAt,
        metadata: session.metadata,
      });
      expect(response.body.user.email).toBe('userinfo@example.com');
      expect(response.body.user.preferences).toEqual({ theme: 'light' });
      expect(response.body.user).toEqual(stored?.user);
      expect(next.sessionId).not.toBe('hook-selected-session');
      expect(f.hooks.onSessionRefreshed.mock.calls[0][0].metadata?.previousSessionId).toBe('hook-selected-previous');
      expect(forbidden).not.toHaveBeenCalled();
      await expectApi(f, browser, next);
      clearOperationCalls(f);
      const wrong = await sessionRequest(f, browser, 'refresh', next.sessionId, proofFor('refresh', { key: keyB }));
      expect(wrong.body).toEqual(INVALID_PROOF);
      expectNoCredentialWork(f, wrong);
    },
  );

  it('mutable custom issuer input/profile/metadata cannot corrupt refresh response or the following rotation', async () => {
    const f = fixture(transport, {
      tokenIssuer: {
        async issue(input) {
          const result = await issueLocal(input);
          input.session.user!.email = 'issuer@example.com';
          (input.session.user!.preferences as Record<string, unknown>).theme = 'issuer-theme';
          (input.session.metadata!.application as Record<string, unknown>).theme = 'issuer-metadata';
          input.session.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
          input.session.expiresAt = NOW + 99_000_000;
          return Object.freeze({
            ...result,
            sessionId: 'ignored-session',
            user: { sub: 'ignored-subject' },
            get unused() {
              throw new Error('Forbidden issuer extension getter');
            },
          });
        },
      },
    });
    const { session, browser } = await seedSession(f);
    const next = credentials(
      f,
      browser,
      await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh')),
    );
    expect(await f.store.getSession(next.sessionId)).toMatchObject({
      metadata: session.metadata,
      expiresAt: session.expiresAt,
      deviceBinding: session.deviceBinding,
      user: { email: 'userinfo@example.com', preferences: { theme: 'light' } },
    });
    const again = credentials(
      f,
      browser,
      await sessionRequest(f, browser, 'refresh', next.sessionId, proofFor('refresh')),
    );
    expect(await f.store.getSession(again.sessionId)).toMatchObject({
      metadata: session.metadata,
      expiresAt: session.expiresAt,
      deviceBinding: session.deviceBinding,
    });
    await expectApi(f, browser, again);
  });

  it.each(['logicalSessionId', 'subject', 'provider', 'deviceBinding', 'expiresAt', 'sessionId'] as const)(
    'rejects changed %s returned after committed rotation with original-lineage rollback before issuance',
    async (field) => {
      const f = fixture(transport);
      const { session, browser } = await seedSession(f);
      const unrelated = await seedSession(f, true, { logicalSessionId: 'changed-lineage' });
      f.calls.rotate.mockImplementationOnce(async (input) => {
        const value = await f.originals.rotate(input);
        return {
          ...value,
          [field]:
            field === 'provider'
              ? { issuer: 'https://foreign.example' }
              : field === 'deviceBinding'
                ? { type: 'dpop', jkt: keyB.jkt }
                : field === 'expiresAt'
                  ? NOW + 99_000_000
                  : 'changed-lineage',
        };
      });
      clearOperationCalls(f);
      const response = await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'));
      expect(response.status).toBe(401);
      expect(response.body).toEqual(INVALID_SESSION);
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.hooks.onSessionRefreshed).not.toHaveBeenCalled();
      expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: session.logicalSessionId });
      expect(await f.store.getSession(session.sessionId)).toBeNull();
      expect(await f.store.getSession(unrelated.session.sessionId)).not.toBeNull();
      const newId = f.calls.rotate.mock.calls[0][0].nextSession.sessionId;
      expect(await f.store.getSession(newId)).toBeNull();
      if (transport === 'cookie') expect(cookieLines(response)[0]).toMatch(/Max-Age=0;/);
    },
  );

  it('refresh captures proof/method/path/session handle before a store mutates request fields', async () => {
    const f = fixture(transport);
    const { session, browser } = await seedSession(f);
    f.calls.getSession.mockImplementationOnce(async (id) => {
      const value = await f.originals.getSession(id);
      const req = f.requests.at(-1)!;
      req.rawHeaders = ['DPoP', proofFor('refresh', { key: keyB })];
      req.headers.dpop = req.rawHeaders[1];
      req.headers.cookie = `${SESSION_COOKIE}=changed-cookie`;
      req.body.sessionId = 'changed-session';
      req.originalUrl = '/wrong-target';
      req.method = 'GET';
      return value;
    });
    credentials(f, browser, await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh')));
    expect(providerRequests.find((r) => r.body?.grant_type === 'refresh_token')?.body?.refresh_token).toBe(
      session.refreshToken,
    );
    expect(f.calls.rotate.mock.calls[0][0].sessionId).toBe(session.sessionId);
  });

  it('refresh snapshot and original key survive mutation of an adapter-owned session before replay admission completes', async () => {
    const f = fixture(transport);
    const { session, browser } = await seedSession(f);
    const adapterRecord = structuredClone(session);
    f.calls.getSession.mockResolvedValueOnce(adapterRecord);
    f.calls.reserve.mockImplementationOnce(async (input) => {
      adapterRecord.refreshToken = 'changed-refresh';
      adapterRecord.idToken = 'changed-id-token';
      adapterRecord.subject = 'changed-subject';
      adapterRecord.logicalSessionId = 'changed-lineage';
      adapterRecord.provider!.issuer = 'https://changed.example';
      adapterRecord.deviceBinding!.jkt = keyB.jkt;
      adapterRecord.expiresAt = NOW + 99_000_000;
      (adapterRecord.user!.preferences as Record<string, unknown>).theme = 'changed-theme';
      (adapterRecord.metadata!.application as Record<string, unknown>).theme = 'changed-metadata';
      return f.originals.reserve(input);
    });
    const next = credentials(
      f,
      browser,
      await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh')),
    );
    expect(providerRequests.find((r) => r.body?.grant_type === 'refresh_token')?.body?.refresh_token).toBe(
      session.refreshToken,
    );
    expect(await f.store.getSession(next.sessionId)).toMatchObject({
      subject: session.subject,
      logicalSessionId: session.logicalSessionId,
      provider: session.provider,
      deviceBinding: session.deviceBinding,
      expiresAt: session.expiresAt,
      metadata: session.metadata,
    });
  });

  it.each(['binding', 'provider', 'credential'] as const)(
    'changed source %s after replay admission rejects before upstream refresh-token use',
    async (field) => {
      const f = fixture(transport);
      const { session, browser } = await seedSession(f);
      f.calls.reserve.mockImplementationOnce(async (input) => {
        const admitted = await f.originals.reserve(input);
        await f.store.createSession({
          ...session,
          ...(field === 'binding' ? { deviceBinding: { type: 'dpop', jkt: keyB.jkt } } : {}),
          ...(field === 'provider' ? { provider: { issuer: 'https://changed.example' } } : {}),
          ...(field === 'credential' ? { refreshToken: 'changed-refresh' } : {}),
        });
        return admitted;
      });
      const response = await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'));
      expect(response.body).toEqual(INVALID_SESSION);
      expect(providerRequests.some((r) => r.body?.grant_type === 'refresh_token')).toBe(false);
      expect(f.calls.rotate).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(refreshTokens.has(session.refreshToken)).toBe(true);
    },
  );
});

describe.each(TRANSPORTS)('DBJWT-05 bound refresh profile/subject/expiry (%s)', (transport) => {
  it.each([
    { name: 'fresh ID without UserInfo', id: true, info: false },
    { name: 'fresh ID plus matching UserInfo', id: true, info: true },
    { name: 'retained profile without new ID/UserInfo', id: false, info: false },
    { name: 'retained profile plus fresh matching UserInfo', id: false, info: true },
  ])(
    '$name preserves original lineage/subject/provider/key/deadline with the approved profile precedence',
    async ({ id, info }) => {
      const f = fixture(transport, { fetchUserInfo: info });
      const { session, browser } = await seedSession(f);
      if (!id) refreshOverride = { id_token: undefined };
      const response = await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'));
      const next = credentials(f, browser, response);
      const stored = await f.store.getSession(next.sessionId);
      expect(stored).toMatchObject({
        logicalSessionId: session.logicalSessionId,
        subject: session.subject,
        provider: session.provider,
        deviceBinding: session.deviceBinding,
        expiresAt: session.expiresAt,
        metadata: session.metadata,
      });
      expect(stored?.user).toEqual(response.body.user);
      expect(response.body.user.email).toBe(
        info ? 'userinfo@example.com' : id ? 'id@example.com' : 'retained@example.com',
      );
      if (id) expect(response.body.user).not.toHaveProperty('staleRole');
      else expect(response.body.user.staleRole).toBe('old');
      await expectApi(f, browser, next);
    },
  );

  it.each(['changed ID subject', 'mismatched UserInfo'] as const)(
    '%s fails before rotation/issuance and preserves the original bound session',
    async (kind) => {
      const f = fixture(transport);
      const { session, browser } = await seedSession(f);
      if (kind === 'changed ID subject') refreshOverride = { id_token: await idTokenFor('different-subject') };
      else userInfoOverride = { sub: 'different-subject' };
      const response = await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'));
      expect(response.status).toBe(502);
      expect(response.body.code).toBe(
        kind === 'changed ID subject' ? 'OIDC_VAULT_INVALID_ID_TOKEN' : 'OIDC_VAULT_INVALID_USERINFO',
      );
      expect(f.calls.rotate).not.toHaveBeenCalled();
      expect(f.issue).not.toHaveBeenCalled();
      expect(await f.store.getSession(session.sessionId)).toEqual(session);
    },
  );

  it('refresh works after local JWT/retained ID-token expiry using only a fresh original-key proof', async () => {
    const f = fixture(transport, { fetchUserInfo: false });
    const expiredId = await new SignJWT({ sub: SUBJECT })
      .setProtectedHeader({ alg: 'RS256', kid: 'dbjwt-05-provider' })
      .setIssuer(issuer)
      .setAudience('client_1')
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(providerKey);
    const { session, browser } = await seedSession(f, true, { idToken: expiredId });
    refreshOverride = { id_token: undefined, access_token: undefined, refresh_token: undefined, scope: undefined };
    const expiredAccess = await new SignJWT({ sub: SUBJECT, cnf: { jkt: keyA.jkt } })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(BACKEND_ORIGIN)
      .setAudience(LOCAL_AUDIENCE)
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(localSecret);
    const response = await browser
      .post(`${BASE_PATH}/refresh`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Authorization', `DPoP ${expiredAccess}`)
      .set('DPoP', proofFor('refresh'))
      .send(transport === 'body' ? { sessionId: session.sessionId } : {});
    const next = credentials(f, browser, response);
    expect(await f.store.getSession(next.sessionId)).toMatchObject({
      idToken: expiredId,
      refreshToken: session.refreshToken,
      user: session.user,
      deviceBinding: session.deviceBinding,
    });
    await expectApi(f, browser, next);
  });

  it('exchange code/session and refresh absolute expiry reject at exact deadlines before proof reservation/upstream', async () => {
    const f = fixture(transport);
    const flow = await seedCode(f);
    f.clock.value = flow.record.expiresAt;
    clearOperationCalls(f);
    const exchangeExpired = await exchange(f, flow, proofFor('exchange', { now: f.clock.value }));
    expect(exchangeExpired.status).toBe(400);
    expect(exchangeExpired.body.code).toBe('OIDC_VAULT_INVALID_EXCHANGE_CODE');
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(f.calls.consume).not.toHaveBeenCalled();
    f.clock.value = flow.session.expiresAt!;
    const refreshExpired = await sessionRequest(
      f,
      flow.browser,
      'refresh',
      flow.session.sessionId,
      proofFor('refresh', { now: f.clock.value }),
    );
    expect(refreshExpired.body).toEqual(INVALID_SESSION);
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
    expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
  });
});

const rawPost = async (app: express.Express, route: string, headers: string[], body: Record<string, unknown>) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing raw HTTP fixture address.');
  const encodedBody = JSON.stringify(body);
  try {
    return await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: unknown }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            method: 'POST',
            path: `${BASE_PATH}/${route}`,
            agent: false,
            headers: [
              'Host',
              `127.0.0.1:${address.port}`,
              'Connection',
              'close',
              'Content-Type',
              'application/json',
              'Content-Length',
              String(Buffer.byteLength(encodedBody)),
              ...headers,
            ],
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => {
              try {
                resolve({
                  status: res.statusCode!,
                  headers: res.headers,
                  body: JSON.parse(Buffer.concat(chunks).toString()),
                });
              } catch (error) {
                reject(error);
              }
            });
          },
        );
        req.on('error', reject);
        req.end(encodedBody);
      },
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

describe.each(TRANSPORTS)('DBJWT-05 raw headers/proof wire profile (%s)', (transport) => {
  it.each(['exchange', 'refresh', 'logout'] as const)(
    '%s rejects raw duplicate/comma-joined proof before replay/mutation/upstream',
    async (route) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      clearOperationCalls(f);
      const proof = proofFor(route);
      for (const proofHeaders of [
        ['DPoP', proof, 'dPoP', proof],
        ['DPoP', `${proof}, ${proof}`],
      ]) {
        const response = await rawPost(
          f.app,
          route,
          ['Origin', FRONTEND_ORIGIN, 'Cookie', flow.browser.cookieHeader(), ...proofHeaders],
          route === 'exchange'
            ? { code: flow.code }
            : transport === 'body'
              ? { sessionId: flow.session.sessionId }
              : {},
        );
        expect(response.status).toBe(401);
        expect(response.body).toEqual(INVALID_PROOF);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['cache-control']).toBe('no-store');
      }
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(f.calls.consume).not.toHaveBeenCalled();
      expect(f.calls.rotate).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    },
  );

  it.each(['Origin', 'Referer', 'Cookie'] as const)(
    'guarded exchange rejects duplicate raw %s authority before proof reservation',
    async (field) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      clearOperationCalls(f);
      const source =
        field === 'Origin'
          ? ['Origin', FRONTEND_ORIGIN, 'origin', FRONTEND_ORIGIN]
          : field === 'Referer'
            ? ['Referer', `${FRONTEND_ORIGIN}/one`, 'referer', `${FRONTEND_ORIGIN}/two`]
            : ['Origin', FRONTEND_ORIGIN];
      const cookies =
        field === 'Cookie'
          ? ['Cookie', `${TRANSACTION_COOKIE}=${flow.secret}`, 'Cookie', `${TRANSACTION_COOKIE}=${flow.secret}`]
          : ['Cookie', flow.browser.cookieHeader()];
      const response = await rawPost(f.app, 'exchange', [...source, ...cookies, 'DPoP', proofFor('exchange')], {
        code: flow.code,
      });
      expect(response.status).toBe(field === 'Cookie' ? 400 : 403);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(f.calls.consume).not.toHaveBeenCalled();
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    },
  );

  describe.each(['exchange', 'refresh', 'logout'] as const)('%s verifier reuse', (route) => {
    it.each([
      ['bad signature', (r: string) => proofFor(r, { signingKey: keyB })],
      ['wrong method', (r: string) => proofFor(r, { claims: { htm: 'GET' } })],
      ['wrong pinned URL', (r: string) => proofFor(r, { claims: { htu: `https://evil.example${BASE_PATH}/${r}` } })],
      ['wrong typ', (r: string) => proofFor(r, { header: { typ: 'JWT' } })],
      ['private JWK', (r: string) => proofFor(r, { header: { jwk: { ...keyA.jwk, d: 'private-key' } } })],
      ['disallowed algorithm', (r: string) => proofFor(r, { header: { alg: 'HS256' } })],
    ] as const)(
      'rejects %s with a fixed error before reservation/credentials and allows an honest retry',
      async (_name, makeProof) => {
        const f = fixture(transport);
        const flow = await seedCode(f);
        clearOperationCalls(f);
        const response = await (route === 'exchange'
          ? exchange(f, flow, makeProof(route))
          : sessionRequest(f, flow.browser, route, flow.session.sessionId, makeProof(route)));
        expect(response.status).toBe(401);
        expect(response.body).toEqual(INVALID_PROOF);
        expect(response.headers['www-authenticate']).toBe('DPoP error="invalid_dpop_proof", algs="ES256"');
        expectNoCredentialWork(f, response);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
        expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
        const retry = await (route === 'exchange'
          ? exchange(f, flow, proofFor(route))
          : sessionRequest(f, flow.browser, route, flow.session.sessionId, proofFor(route)));
        expect(retry.status).toBe(200);
      },
    );
  });

  it.each(['exchange', 'refresh', 'logout'] as const)(
    '%s uses pinned externally visible path despite Host/proxy/body/query and ignores API ath',
    async (route) => {
      const f = fixture(transport);
      f.app.set('trust proxy', true);
      const flow = await seedCode(f);
      const response = await flow.browser
        .post(`${BASE_PATH}/${route}?not=signed`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Host', 'evil.example')
        .set('Forwarded', 'host=evil.example;proto=http')
        .set('X-Forwarded-Host', 'evil.example')
        .set('X-Forwarded-Proto', 'http')
        .set('Authorization', 'Bearer irrelevant-expired-token')
        .set(
          'DPoP',
          proofFor(route, {
            claims: {
              ath: 'vault-does-not-require-API-ath',
              htu: `HTTPS://API.EXAMPLE.COM:443${BASE_PATH}/${route}?ignored=query#fragment`,
            },
          }),
        )
        .send(
          route === 'exchange'
            ? { code: flow.code, jkt: keyB.jkt }
            : { sessionId: flow.session.sessionId, jkt: keyB.jkt },
        );
      expect(response.status).toBe(200);
      if (route !== 'logout') credentials(f, flow.browser, response);
      expect(providerRequests.every((r) => r.dpop === undefined)).toBe(true);
    },
  );
});

describe.each(TRANSPORTS)('DBJWT-05 fail-closed admission edge cases (%s)', (transport) => {
  it.each(['exchange', 'refresh', 'logout'] as const)(
    'expired nonce on %s challenges before reservation or credential mutation',
    async (route) => {
      const f = fixture(transport, { deviceBinding: { nonce: { secret: randomBytes(32), lifetimeSeconds: 1 } } });
      const flow = await seedCode(f);
      const call = (proof: string) =>
        route === 'exchange'
          ? exchange(f, flow, proof)
          : sessionRequest(f, flow.browser, route, flow.session.sessionId, proof);
      const challenge = await call(proofFor(route));
      const nonce = challenge.headers['dpop-nonce'] as string;
      f.clock.value += 1000;
      clearOperationCalls(f);
      const expired = await call(proofFor(route, { now: f.clock.value, claims: { nonce } }));
      expect(expired.status).toBe(400);
      expect(expired.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
      expectNoCredentialWork(f, expired);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      expect(
        (await call(proofFor(route, { now: f.clock.value, claims: { nonce: expired.headers['dpop-nonce'] } }))).status,
      ).toBe(200);
    },
  );

  it('wrong browser cookie cannot cause even a nonce challenge or reservation', async () => {
    const f = fixture(transport, { deviceBinding: { nonce: { secret: randomBytes(32) } } });
    const flow = await seedCode(f);
    clearOperationCalls(f);
    const response = await request(f.app)
      .post(`${BASE_PATH}/exchange`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor('exchange'))
      .send({ code: flow.code });
    expect(response.body).toEqual(INVALID_BROWSER);
    expect(response.headers['dpop-nonce']).toBeUndefined();
    expectNoCredentialWork(f, response);
    expect(f.calls.reserve).not.toHaveBeenCalled();
  });

  it('mutable onError cannot change sanitized proof/nonce/no-store response authority', async () => {
    const f = fixture(transport, {
      deviceBinding: { nonce: { secret: randomBytes(32) } },
      hooks: {
        onError({ error, res }) {
          Object.assign(error as object, { status: 299, code: 'PRIVATE', clientMessage: 'private raw error' });
          res.setHeader('Cache-Control', 'public');
          res.setHeader('DPoP-Nonce', 'private raw nonce');
          res.setHeader('WWW-Authenticate', 'private');
        },
      },
    });
    const flow = await seedCode(f);
    const proofFailure = await exchange(f, flow, proofFor('exchange', { key: keyB }));
    expect(proofFailure.status).toBe(401);
    expect(proofFailure.body).toEqual(INVALID_PROOF);
    expect(proofFailure.headers['www-authenticate']).toBe('DPoP error="invalid_dpop_proof", algs="ES256"');
    expect(proofFailure.headers['dpop-nonce']).toBeUndefined();
    const nonce = await exchange(f, flow, proofFor('exchange'));
    expect(nonce.status).toBe(400);
    expect(nonce.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expect(nonce.headers['dpop-nonce']).toMatch(/^v1\./);
    expect(nonce.headers['www-authenticate']).toBeUndefined();
    expect(nonce.headers['cache-control']).toBe('no-store');
    expect(nonce.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consume).not.toHaveBeenCalled();
    expect(f.calls.reserve).not.toHaveBeenCalled();
  });

  it.each(['code read', 'atomic consume', 'revocation context'] as const)(
    'removed %s capability after construction fails closed without legacy consume/deletion fallback',
    async (kind) => {
      const f = fixture(transport);
      const flow = await seedCode(f);
      const property =
        kind === 'code read'
          ? 'getExchangeCode'
          : kind === 'atomic consume'
            ? 'consumeExchangeCodeIfMatches'
            : 'getSessionRevocationContext';
      const method = f.store[property];
      Object.defineProperty(f.store, property, { value: undefined, configurable: true, writable: true });
      clearOperationCalls(f);
      try {
        const response = await (kind === 'revocation context'
          ? sessionRequest(f, flow.browser, 'logout', flow.session.sessionId, proofFor('logout'))
          : exchange(f, flow, proofFor('exchange')));
        expect(response.status).toBe(500);
        expect(response.body).toEqual(INTERNAL_ERROR);
        expectNoCredentialWork(f, response);
        expect(f.calls.reserve).not.toHaveBeenCalled();
        expect(await f.originals.getCode(flow.code)).toEqual(flow.record);
        expect(await f.originals.getSession(flow.session.sessionId)).toEqual(flow.session);
      } finally {
        Object.defineProperty(f.store, property, { value: method, configurable: true, writable: true });
      }
    },
  );

  it.each(['mixed binding', 'mixed provider'] as const)(
    'inconsistent alias lineage %s returns sanitized failure and never uses unconditional deletion',
    async (kind) => {
      const f = fixture(transport);
      const { session, browser } = await seedSession(f);
      const next = await f.store.rotateSession({
        sessionId: session.sessionId,
        nextSession: {
          ...session,
          sessionId: `sess_next_${randomUUID()}`,
          updatedAt: NOW + 1,
        },
      });
      await f.store.createSession({
        ...next,
        sessionId: `sess_sibling_${randomUUID()}`,
        ...(kind === 'mixed binding'
          ? { deviceBinding: undefined }
          : { provider: { issuer: 'https://foreign.example' } }),
      });
      clearOperationCalls(f);
      const response = await sessionRequest(f, browser, 'logout', session.sessionId, proofFor('logout'));
      expect(response.status).toBe(500);
      expect(response.body).toEqual(INTERNAL_ERROR);
      expectNoCredentialWork(f, response);
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(await f.store.getSession(next.sessionId)).toEqual(next);
    },
  );

  it('real lifecycle-issued JWT cannot use missing proof/wrong key/Bearer fallback even when mapClaims omits cnf', async () => {
    const f = fixture(transport);
    const flow = await loginAndCallback(f);
    const first = credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
    for (const [scheme, proof] of [
      ['DPoP', undefined],
      ['DPoP', proofFor('/api/profile', { key: keyB, accessToken: first.token })],
      ['Bearer', proofFor('/api/profile', { accessToken: first.token })],
    ] as const) {
      const call = flow.browser.get('/api/profile').set('Authorization', `${scheme} ${first.token}`);
      if (proof !== undefined) call.set('DPoP', proof);
      expect((await call).status).toBe(401);
      expect(f.api).not.toHaveBeenCalled();
    }
    await expectApi(f, flow.browser, first);
    const next = credentials(
      f,
      flow.browser,
      await sessionRequest(f, flow.browser, 'refresh', first.sessionId, proofFor('refresh')),
    );
    await expectApi(f, flow.browser, next);
  });

  it('precreate/postcreate binding mutations cannot enroll/rebind the key across the complete lifecycle', async () => {
    const f = fixture(transport, {
      deviceBinding: { mode: 'required' },
      hooks: {
        onBeforeSessionCreate({ session }) {
          session!.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
          session!.provider = { issuer: 'https://hook.example', clientId: 'hook-client' };
          session!.sessionId = 'hook-session';
          session!.logicalSessionId = 'hook-lineage';
          session!.metadata = { application: { accepted: true } };
        },
        onSessionCreated({ session }) {
          delete session!.deviceBinding;
          session!.subject = 'postcreate-subject';
        },
      },
    });
    const flow = await loginAndCallback(f);
    expect(flow.session).toMatchObject({
      provider: { issuer, clientId: 'client_1' },
      deviceBinding: { type: 'dpop', jkt: keyA.jkt },
      metadata: { application: { accepted: true } },
    });
    clearOperationCalls(f);
    const wrong = await exchange(f, flow, proofFor('exchange', { key: keyB }));
    expect(wrong.body).toEqual(INVALID_PROOF);
    expectNoCredentialWork(f, wrong);
    const first = credentials(f, flow.browser, await exchange(f, flow, proofFor('exchange')));
    const next = credentials(
      f,
      flow.browser,
      await sessionRequest(f, flow.browser, 'refresh', first.sessionId, proofFor('refresh')),
    );
    await expectApi(f, flow.browser, next);
    expect(await f.store.getSession(next.sessionId)).toMatchObject({
      subject: SUBJECT,
      deviceBinding: { type: 'dpop', jkt: keyA.jkt },
      provider: { issuer, clientId: 'client_1' },
      logicalSessionId: flow.session.logicalSessionId,
      metadata: flow.session.metadata,
    });
  });

  it('refresh response and issuer keep privately composed profile/metadata when a store return mutates them', async () => {
    const f = fixture(transport);
    const { session, browser } = await seedSession(f);
    f.calls.rotate.mockImplementationOnce(async (input) => {
      const result = await f.originals.rotate(input);
      result.user = { sub: 'store-changed-subject', email: 'store@example.com' };
      result.metadata = { application: 'store-changed-metadata' };
      return result;
    });
    const response = await sessionRequest(f, browser, 'refresh', session.sessionId, proofFor('refresh'));
    const next = credentials(f, browser, response);
    expect(response.body.user.email).toBe('userinfo@example.com');
    expect(f.issue.mock.calls[0][0].session).toMatchObject({
      metadata: session.metadata,
      user: { sub: SUBJECT, email: 'userinfo@example.com' },
      provider: session.provider,
      deviceBinding: session.deviceBinding,
    });
    expect(await f.store.getSession(next.sessionId)).toMatchObject({
      metadata: session.metadata,
      user: { sub: SUBJECT, email: 'userinfo@example.com' },
    });
  });
});

describe.each(TRANSPORTS)('DBJWT-05 logout form/JSON parity (%s)', (transport) => {
  describe.each(ENCODINGS)('%s entry', (encoding) => {
    it.each(['live', 'alias'] as const)(
      '%s logout rejects omission/wrong/stale proof then accepts the original key without upstream work',
      async (kind) => {
        const f = fixture(transport);
        const { session, browser } = await seedSession(f);
        const live =
          kind === 'alias'
            ? await f.store.rotateSession({
                sessionId: session.sessionId,
                nextSession: {
                  ...session,
                  sessionId: `sess_next_${randomUUID()}`,
                  updatedAt: NOW + 1,
                },
              })
            : session;
        clearOperationCalls(f);
        for (const proof of [
          undefined,
          proofFor('logout', { key: keyB }),
          proofFor('logout', { claims: { iat: Math.floor(NOW / 1000) - 65 } }),
        ]) {
          const response = await sessionRequest(f, browser, 'logout', session.sessionId, proof, {}, encoding);
          expect(response.status).toBe(401);
          expectNoCredentialWork(f, response);
          expect(await f.store.getSession(live.sessionId)).toEqual(live);
        }
        const response = await sessionRequest(
          f,
          browser,
          'logout',
          session.sessionId,
          proofFor('logout'),
          {},
          encoding,
        );
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ loggedOut: true });
        expect(await f.store.getSession(live.sessionId)).toBeNull();
        expect(providerRequests).toEqual([]);
      },
    );
  });
});
