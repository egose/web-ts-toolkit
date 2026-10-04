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
  type OidcVaultFingerprintRecognitionOptions,
  type OidcVaultHooks,
  type OidcVaultOptions,
  type OidcVaultSession,
  type OidcVaultSessionTransport,
} from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';
import { captureFingerprintRecognition, resolveFingerprintRecognitionOptions } from '../src/fingerprint-recognition';

const BACKEND = 'https://api.example.com';
const FRONTEND = 'https://frontend.example.com';
const BASE = '/auth/oidc';
const TRANSACTION_COOKIE = '__Host-oidc_vault_transaction';
const SESSION_COOKIE = 'oidc_vault_session';
const HEADER = 'X-Device-Fingerprint';
const METADATA_KEY = 'oidcVaultFingerprintRecognition';
const SIGNAL = 'generic-browser-recognition:original';
const CHANGED_SIGNAL = 'generic-browser-recognition:changed';
const HASH = createHash('sha256').update(SIGNAL, 'ascii').digest('base64url');
const NOW = 1_800_000_000_123;
const TRANSPORTS = ['body', 'cookie'] as const;
const POLICIES = ['fingerprint-only', 'optional DPoP', 'required DPoP'] as const;
const REAUTH = {
  code: 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED',
  message: 'Browser recognition changed; sign in again.',
};
const INVALID = { code: 'OIDC_VAULT_INVALID_FINGERPRINT', message: 'Fingerprint signal is invalid.' };
const REQUIRED = { code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', message: 'A device-bound login is required.' };

interface ProofKey {
  privateKey: KeyObject;
  jwk: JWK;
  jkt: string;
}
let key: ProofKey;
let providerKey: KeyObject;
let localSecret: Uint8Array;
let issuer: string;
let providerServer: http.Server;
let providerRequests: Array<{ path: string; body?: Record<string, unknown>; headers: http.IncomingHttpHeaders }> = [];
let refreshTokens = new Map<string, string>();
let accessSubjects = new Map<string, string>();
let spentCodes = new Set<string>();
let sequence = 0;
let providerClaims: Record<string, unknown> = {};
let userInfoClaims: Record<string, unknown> = {};

const proofFor = (route: string, claims: Record<string, unknown> = {}, accessToken?: string): string => {
  const input = [
    { typ: 'dpop+jwt', alg: 'ES256', jwk: key.jwk },
    {
      htm: route === 'api' ? 'GET' : 'POST',
      htu: `${BACKEND}${route === 'api' ? '/api/profile' : `${BASE}/${route}`}`,
      iat: Math.floor(NOW / 1000),
      jti: randomUUID(),
      ...(accessToken === undefined
        ? {}
        : { ath: createHash('sha256').update(accessToken, 'ascii').digest('base64url') }),
      ...claims,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${input}.${sign('sha256', Buffer.from(input), { key: key.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};

const registerRefresh = (subject: string): string => {
  const token = `private-refresh:${++sequence}`;
  refreshTokens.set(token, subject);
  return token;
};

beforeAll(async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = await exportJWK(pair.publicKey);
  key = { privateKey: pair.privateKey, jwk, jkt: await calculateJwkThumbprint(jwk) };
  localSecret = randomBytes(32);
  const providerPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  providerKey = providerPair.privateKey;
  const providerJwk = { ...(await exportJWK(providerPair.publicKey)), kid: 'dbjwt-09-provider' };
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  provider.use((req, _res, next) => {
    providerRequests.push({
      path: req.path,
      headers: { ...req.headers },
      ...(req.method === 'POST' ? { body: { ...req.body } } : {}),
    });
    next();
  });
  provider.get('/issuer/.well-known/openid-configuration', (_req, res) =>
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      userinfo_endpoint: `${issuer}/userinfo`,
      end_session_endpoint: `${issuer}/logout`,
    }),
  );
  provider.get('/issuer/jwks', (_req, res) => res.json({ keys: [providerJwk] }));
  provider.post('/issuer/token', async (req, res) => {
    let subject: string;
    let nonce: string | undefined;
    if (req.body.grant_type === 'authorization_code') {
      const code = String(req.body.code);
      if (spentCodes.has(code)) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      spentCodes.add(code);
      [, nonce, subject = 'recognized-user'] = code.split(':');
    } else {
      const refreshToken = String(req.body.refresh_token);
      const found = refreshTokens.get(refreshToken);
      if (!found) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      refreshTokens.delete(refreshToken); // Single-use provider token exposes premature refresh burn.
      subject = found;
    }
    const accessToken = `private-access:${++sequence}`;
    accessSubjects.set(accessToken, subject);
    const idToken = await new SignJWT({
      ...providerClaims,
      sub: subject,
      sid: 'provider-session',
      ...(nonce ? { nonce } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: providerJwk.kid })
      .setIssuer(issuer)
      .setAudience('client_1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(providerKey);
    res.json({
      token_type: 'Bearer',
      access_token: accessToken,
      refresh_token: registerRefresh(subject),
      id_token: idToken,
      expires_in: 3600,
    });
  });
  provider.get('/issuer/userinfo', (req, res) =>
    res.json({
      ...userInfoClaims,
      sub: accessSubjects.get(req.get('authorization')?.slice('Bearer '.length) ?? ''),
      name: 'Verified User',
    }),
  );
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
  sequence = 0;
  providerClaims = {};
  userInfoClaims = {};
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => providerServer.close((error) => (error ? reject(error) : resolve())));
});

const cookieLines = (response: request.Response): string[] => {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
};
const browserFor = (app: express.Express) => {
  const jar = new Map<string, string>();
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const cookies = (call: request.Test) => (jar.size ? call.set('Cookie', cookieHeader()) : call);
  return {
    get: (path: string) => cookies(request(app).get(path)),
    post: (path: string) => cookies(request(app).post(path)),
    cookieHeader,
    sessionId: () => jar.get(SESSION_COOKIE),
    setCookie: (name: string, value: string) => jar.set(name, value),
    capture(response: request.Response) {
      for (const line of cookieLines(response)) {
        const [pair] = line.split(';', 1);
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (!value || line.includes('Max-Age=0;')) jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
};
type Browser = ReturnType<typeof browserFor>;

const localIssue = async ({ session, deviceBinding }: IssueTokenInput) => ({
  accessToken: await new SignJWT({
    sub: session.subject,
    sid: session.sessionId,
    ...(deviceBinding ? { cnf: { jkt: deviceBinding.jkt } } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(BACKEND)
    .setAudience('recognition-api')
    .setExpirationTime('15m')
    .sign(localSecret),
  expiresIn: 900,
  tokenType: deviceBinding ? ('DPoP' as const) : ('Bearer' as const),
});

const fixture = (
  transport: OidcVaultSessionTransport,
  policy: (typeof POLICIES)[number] = 'fingerprint-only',
  overrides: Partial<OidcVaultOptions> = {},
  sharedStore?: ReturnType<typeof createMemoryOidcVaultStore>,
) => {
  const store = sharedStore ?? createMemoryOidcVaultStore({ now: () => NOW });
  const originals = {
    getSession: store.getSession.bind(store),
    getTransaction: store.getAuthorizationTransaction.bind(store),
    createTransaction: store.createAuthorizationTransaction.bind(store),
    consumeTransaction: store.consumeAuthorizationTransactionIfMatches.bind(store),
    consumeCode: store.consumeExchangeCodeIfMatches.bind(store),
    createSession: store.createSession.bind(store),
    rotate: store.rotateSession.bind(store),
    reserve: store.reserveDpopProof.bind(store),
  };
  const calls = {
    transaction: vi.spyOn(store, 'createAuthorizationTransaction'),
    consumeTransaction: vi.spyOn(store, 'consumeAuthorizationTransactionIfMatches'),
    legacyTransaction: vi.spyOn(store, 'consumeAuthorizationTransaction'),
    createSession: vi.spyOn(store, 'createSession'),
    code: vi.spyOn(store, 'createExchangeCode'),
    consumeCode: vi.spyOn(store, 'consumeExchangeCodeIfMatches'),
    legacyCode: vi.spyOn(store, 'consumeExchangeCode'),
    getSession: vi.spyOn(store, 'getSession'),
    rotate: vi.spyOn(store, 'rotateSession'),
    reserve: vi.spyOn(store, 'reserveDpopProof'),
    revoke: vi.spyOn(store, 'deleteSessionsByLogicalSessionId'),
    delete: vi.spyOn(store, 'deleteSession'),
  };
  const hooks = {
    ...overrides.hooks,
    onLoginStart: vi.fn<NonNullable<OidcVaultHooks['onLoginStart']>>(overrides.hooks?.onLoginStart ?? (() => {})),
    onSessionCreated: vi.fn<NonNullable<OidcVaultHooks['onSessionCreated']>>(
      overrides.hooks?.onSessionCreated ?? (() => {}),
    ),
    onSessionRefreshed: vi.fn<NonNullable<OidcVaultHooks['onSessionRefreshed']>>(
      overrides.hooks?.onSessionRefreshed ?? (() => {}),
    ),
    onError: vi.fn<NonNullable<OidcVaultHooks['onError']>>(overrides.hooks?.onError ?? (() => {})),
  };
  const issue = vi.fn(overrides.tokenIssuer?.issue ?? localIssue);
  const options: OidcVaultOptions = {
    backendOrigin: BACKEND,
    basePath: BASE,
    frontendRedirectUri: `${FRONTEND}/callback`,
    config: { issuer, clientId: 'client_1' },
    storeProvider: store,
    trustedOrigins: [FRONTEND],
    sessionTransport: transport,
    now: () => NOW,
    sessionTtlMs: 120_000,
    fingerprintRecognition: {},
    ...(policy === 'fingerprint-only'
      ? {}
      : { deviceBinding: { mode: policy === 'required DPoP' ? 'required' : 'optional' } }),
    ...overrides,
    hooks,
    tokenIssuer: Object.hasOwn(overrides, 'tokenIssuer') && overrides.tokenIssuer === undefined ? undefined : { issue },
  };
  const app = express();
  const requests: express.Request[] = [];
  app.use((req, _res, next) => {
    requests.push(req);
    next();
  });
  app.use(createOidcVaultMiddleware(options));
  app.get(
    '/api/profile',
    createOidcVaultAccessTokenMiddleware({
      validator: createOidcVaultJwtAccessTokenValidator({
        key: localSecret,
        issuer: BACKEND,
        audience: 'recognition-api',
        algorithms: ['HS256'],
      }),
      ...(options.deviceBinding === undefined
        ? {}
        : {
            deviceBinding: {
              ...options.deviceBinding,
              publicOrigin: BACKEND,
              replayNamespace: 'recognition-api',
              replayStore: store,
              now: () => NOW,
            },
          }),
    }),
    (req, res) => res.json({ subject: req.auth?.subject }),
  );
  return { app, store, originals, calls, hooks, issue, options, transport, policy, requests };
};
type Fixture = ReturnType<typeof fixture>;

const startLogin = async (f: Fixture, signal: string | null = SIGNAL, browser = browserFor(f.app), legacy = false) => {
  const call = legacy ? browser.get(`${BASE}/login`) : browser.post(`${BASE}/login`).set('Origin', FRONTEND);
  if (signal !== null) call.set(f.options.fingerprintRecognition?.headerName ?? HEADER, signal);
  if (!legacy && f.options.deviceBinding !== undefined) call.set('DPoP', proofFor('login'));
  const response = await (legacy ? call : call.send({}));
  expect(response.status).toBe(legacy ? 302 : 200);
  browser.capture(response);
  const url = new URL(legacy ? (response.headers.location as string) : (response.body.authorizationUrl as string));
  const state = url.searchParams.get('state')!;
  return { browser, response, url, state, transaction: (await f.store.getAuthorizationTransaction(state))! };
};
type Login = Awaited<ReturnType<typeof startLogin>>;
const completeCallback = async (f: Fixture, login: Login) => {
  const response = await login.browser
    .get(`${BASE}/callback`)
    .query({ state: login.state, code: `authcode:${login.url.searchParams.get('nonce')}:recognized-user` });
  expect(response.status).toBe(302);
  login.browser.capture(response);
  const code = new URL(response.headers.location as string).searchParams.get('code')!;
  const record = (await f.store.getExchangeCode(code))!;
  const session = (await f.store.getSession(record.sessionId))!;
  return { ...login, callback: response, code, record, session };
};
type Flow = Awaited<ReturnType<typeof completeCallback>>;
const postExchange = (
  f: Fixture,
  flow: Pick<Flow, 'browser' | 'code'>,
  signal?: string,
  proof?: string,
  encoding: 'json' | 'form' = 'json',
) => {
  const call = flow.browser.post(`${BASE}/exchange`).set('Origin', FRONTEND);
  if (signal !== undefined) call.set(f.options.fingerprintRecognition?.headerName ?? HEADER, signal);
  if (proof !== undefined) call.set('DPoP', proof);
  return (encoding === 'form' ? call.type('form') : call).send({ code: flow.code });
};
const postSession = (
  f: Fixture,
  browser: Browser,
  sessionId: string,
  route: 'refresh' | 'logout',
  signal?: string,
  proof?: string,
) => {
  const call = browser.post(`${BASE}/${route}`).set('Origin', FRONTEND);
  if (signal !== undefined) call.set(f.options.fingerprintRecognition?.headerName ?? HEADER, signal);
  if (proof !== undefined) call.set('DPoP', proof);
  return call.send(f.transport === 'body' ? { sessionId } : {});
};
const routeProof = (f: Fixture, route: string) => (f.options.deviceBinding === undefined ? undefined : proofFor(route));
const clearCalls = (f: Fixture) => {
  for (const call of Object.values(f.calls)) call.mockClear();
  for (const hook of [f.hooks.onLoginStart, f.hooks.onSessionCreated, f.hooks.onSessionRefreshed, f.hooks.onError])
    hook.mockClear();
  f.issue.mockClear();
  providerRequests = [];
  __resetProviderClientCachesForTests();
};
const expectNoWork = (f: Fixture, response: request.Response) => {
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.headers.location).toBeUndefined();
  expect(response.headers['dpop-nonce']).toBeUndefined();
  expect(providerRequests).toEqual([]);
  for (const name of [
    'transaction',
    'consumeTransaction',
    'legacyTransaction',
    'createSession',
    'code',
    'consumeCode',
    'legacyCode',
    'rotate',
    'reserve',
    'revoke',
    'delete',
  ] as const)
    expect(f.calls[name]).not.toHaveBeenCalled();
  expect(f.issue).not.toHaveBeenCalled();
  expect(f.hooks.onLoginStart).not.toHaveBeenCalled();
  expect(f.hooks.onSessionCreated).not.toHaveBeenCalled();
  expect(f.hooks.onSessionRefreshed).not.toHaveBeenCalled();
};

const expectNoPublicRecognition = (value: unknown) => {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SIGNAL);
  expect(text).not.toContain(CHANGED_SIGNAL);
  expect(text).not.toContain(HASH);
  expect(text).not.toContain(METADATA_KEY);
};
const credentials = (
  f: Fixture,
  browser: Browser,
  response: request.Response,
  bound = f.policy !== 'fingerprint-only',
) => {
  expect(response.status).toBe(200);
  browser.capture(response);
  const sessionId = f.transport === 'body' ? (response.body.sessionId as string) : browser.sessionId()!;
  expect(sessionId).toMatch(/^sess_/);
  expect(response.body.tokenType).toBe(bound ? 'DPoP' : 'Bearer');
  expect(response.body.user).toMatchObject({ sub: 'recognized-user' });
  if (f.transport === 'cookie') expect(response.body).not.toHaveProperty('sessionId');
  const token = response.body.accessToken as string;
  expect(response.text).not.toContain(SIGNAL);
  expect(response.text).not.toContain(HASH);
  expect(response.text).not.toContain(METADATA_KEY);
  expect(response.text).not.toContain('private-refresh:');
  expect(JSON.stringify(decodeJwt(token))).not.toContain(HASH);
  return { sessionId, token };
};

describe.each(TRANSPORTS)('DBJWT-09 fingerprint recognition lifecycle (%s)', (transport) => {
  it.each(POLICIES)(
    '%s captures only at POST login and preserves recognition through callback/exchange/refresh',
    async (policy) => {
      const f = fixture(transport, policy);
      const login = await startLogin(f);
      expect(login.transaction.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
      expect(login.transaction.browserBindingHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(JSON.stringify(login.transaction)).not.toContain(SIGNAL);
      expect(login.response.headers['set-cookie']).toHaveLength(1);
      expect(cookieLines(login.response)[0]).toContain('Path=/; SameSite=Lax; HttpOnly; Secure; Max-Age=600;');
      const flow = await completeCallback(f, login); // Headerless callback authenticates the temporary cookie.
      expect(flow.session.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
      expect(flow.record.browserBindingHash).toBe(login.transaction.browserBindingHash);
      expect(flow.record).not.toHaveProperty('metadata');
      const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, routeProof(f, 'exchange')));
      expect(flow.browser.cookieHeader()).not.toContain(TRANSACTION_COOKIE);
      expect(await f.store.getExchangeCode(flow.code)).toBeNull();
      const next = credentials(
        f,
        flow.browser,
        await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL, routeProof(f, 'refresh')),
      );
      const stored = (await f.store.getSession(next.sessionId))!;
      expect(stored.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
      expect(stored.logicalSessionId).toBe(flow.session.logicalSessionId);
      expect(stored.expiresAt).toBe(flow.session.expiresAt);
      expect(stored.deviceBinding).toEqual(flow.session.deviceBinding);
      expect(f.calls.createSession).toHaveBeenCalledTimes(1); // No duplicate createSession enrollment/upsert at exchange or refresh.
      expect(providerRequests.filter((entry) => entry.body?.grant_type === 'refresh_token')).toHaveLength(1);
      expect(refreshTokens.has(flow.session.refreshToken)).toBe(false);
      expect(
        providerRequests.every(
          (entry) => entry.headers[HEADER.toLowerCase()] === undefined && entry.headers.dpop === undefined,
        ),
      ).toBe(true);
      // Recognition is not an API sender constraint. The existing Bearer/DPoP API policy alone applies.
      const api = flow.browser
        .get('/api/profile')
        .set(HEADER, 'bad\tignored')
        .set('Authorization', `${policy === 'fingerprint-only' ? 'Bearer' : 'DPoP'} ${next.token}`);
      if (policy !== 'fingerprint-only') api.set('DPoP', proofFor('api', {}, next.token));
      expect((await api).status).toBe(200);
    },
  );

  describe.each(POLICIES)('%s precommit checks', (policy) => {
    it.each(['missing', 'changed'] as const)(
      '%s signal cannot consume a guarded code; honest retry succeeds',
      async (kind) => {
        const f = fixture(transport, policy);
        const flow = await completeCallback(f, await startLogin(f));
        clearCalls(f);
        const proof = routeProof(f, 'exchange');
        const response = await postExchange(f, flow, kind === 'missing' ? undefined : CHANGED_SIGNAL, proof, 'form');
        expect(response.status).toBe(403);
        expect(response.body).toEqual(REAUTH);
        expectNoWork(f, response);
        expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
        expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
        credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, proof)); // Even the rejected proof remains unspent.
      },
    );

    it.each(['missing', 'changed'] as const)(
      '%s signal cannot burn a single-use upstream refresh token or mutate a cookie; honest retry succeeds',
      async (kind) => {
        const f = fixture(transport, policy);
        const flow = await completeCallback(f, await startLogin(f));
        const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, routeProof(f, 'exchange')));
        clearCalls(f);
        const proof = routeProof(f, 'refresh');
        const response = await postSession(
          f,
          flow.browser,
          first.sessionId,
          'refresh',
          kind === 'missing' ? undefined : CHANGED_SIGNAL,
          proof,
        );
        expect(response.status).toBe(403);
        expect(response.body).toEqual(REAUTH);
        expectNoWork(f, response);
        expect(await f.store.getSession(first.sessionId)).toEqual(flow.session);
        expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
        credentials(f, flow.browser, await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL, proof));
        expect(providerRequests.filter((entry) => entry.body?.grant_type === 'refresh_token')).toHaveLength(1);
      },
    );
  });

  it.each(['absent POST', 'legacy GET'] as const)(
    '%s stays intentionally unenrolled even when later exchange/refresh signals are supplied',
    async (kind) => {
      const f = fixture(transport);
      const login = await startLogin(f, kind === 'legacy GET' ? SIGNAL : null, undefined, kind === 'legacy GET');
      expect(login.transaction.metadata?.[METADATA_KEY]).toBeUndefined();
      const flow = await completeCallback(f, login);
      expect(flow.session.metadata?.[METADATA_KEY]).toBeUndefined();
      const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
      const next = credentials(
        f,
        flow.browser,
        await postSession(f, flow.browser, first.sessionId, 'refresh', CHANGED_SIGNAL),
      );
      expect((await f.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toBeUndefined();
      expect(f.calls.createSession).toHaveBeenCalledTimes(1);
    },
  );

  it('fingerprint cannot satisfy required DPoP and supplied proof is rejected on fingerprint-only initiation', async () => {
    const required = fixture(transport, 'required DPoP');
    const response = await request(required.app)
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set(HEADER, SIGNAL)
      .send({ jkt: key.jkt });
    expect(response.status).toBe(401);
    expect(response.body).toEqual(REQUIRED);
    expectNoWork(required, response);
    const only = fixture(transport);
    const rejected = await request(only.app)
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set(HEADER, SIGNAL)
      .set('DPoP', proofFor('login'))
      .send({});
    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ code: 'OIDC_VAULT_INVALID_DPOP_PROOF', message: 'DPoP proof validation failed.' });
    expectNoWork(only, rejected);
  });
});

describe.each(TRANSPORTS)('DBJWT-09 opted-in malformed wire signal (%s)', (transport) => {
  it.each(['login', 'exchange', 'refresh'] as const)(
    'empty/oversized/non-ASCII/tab %s header returns fixed 400 before credential work',
    async (route) => {
      const f = fixture(transport);
      const flow = route === 'login' ? undefined : await completeCallback(f, await startLogin(f));
      if (flow && route === 'refresh') credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
      clearCalls(f);
      for (const signal of ['', 'x'.repeat(257), 'caf\u00e9', 'bad\tvalue']) {
        const response = await (route === 'login'
          ? request(f.app).post(`${BASE}/login`).set('Origin', FRONTEND).set(HEADER, signal).send({})
          : route === 'exchange'
            ? postExchange(f, flow!, signal)
            : postSession(f, flow!.browser, flow!.session.sessionId, 'refresh', signal));
        expect(response.status).toBe(400);
        expect(response.body).toEqual(INVALID);
        expectNoWork(f, response);
        expect(f.hooks.onError.mock.calls.at(-1)?.[0].error).toMatchObject({ message: INVALID.message });
        if (flow) expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
      }
      if (flow && route === 'exchange') expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      if (flow) expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
    },
  );
});

const rawPost = async (app: express.Express, route: string, headers: string[], body: Record<string, unknown>) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing raw-header fixture address.');
  const encoded = JSON.stringify(body);
  try {
    return await new Promise<request.Response>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          method: 'POST',
          path: `${BASE}/${route}`,
          agent: false,
          headers: [
            'Host',
            `127.0.0.1:${address.port}`,
            'Connection',
            'close',
            'Content-Type',
            'application/json',
            'Content-Length',
            String(Buffer.byteLength(encoded)),
            ...headers,
          ],
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => {
            try {
              const text = Buffer.concat(chunks).toString();
              resolve({
                status: res.statusCode!,
                headers: res.headers,
                body: JSON.parse(text),
                text,
              } as request.Response);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on('error', reject);
      req.end(encoded);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

describe.each(TRANSPORTS)('DBJWT-09 raw-header multiplicity and boundaries (%s)', (transport) => {
  describe.each(['fingerprint-only', 'required DPoP'] as const)('%s', (policy) => {
    it.each(['login', 'exchange', 'refresh'] as const)(
      '%s rejects duplicate raw fields even if identical/case-varied before proof or credential work',
      async (route) => {
        const f = fixture(transport, policy);
        const flow = route === 'login' ? undefined : await completeCallback(f, await startLogin(f));
        if (flow && route === 'refresh')
          credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, routeProof(f, 'exchange')));
        clearCalls(f);
        const proof = routeProof(f, route);
        const body =
          route === 'login'
            ? {}
            : route === 'exchange'
              ? { code: flow!.code }
              : transport === 'body'
                ? { sessionId: flow!.session.sessionId }
                : {};
        const response = await rawPost(
          f.app,
          route,
          [
            'Origin',
            FRONTEND,
            ...(flow ? ['Cookie', flow.browser.cookieHeader()] : []),
            ...(proof ? ['DPoP', proof] : []),
            HEADER,
            SIGNAL,
            'x-DeViCe-FiNgErPrInT',
            SIGNAL,
          ],
          body,
        );
        expect(response.status).toBe(400);
        expect(response.body).toEqual(INVALID);
        expectNoWork(f, response);
        expectNoPublicRecognition({ response: response.body, error: f.hooks.onError.mock.calls[0]?.[0].error });
        if (flow) {
          expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
          expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
          if (route === 'exchange') expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
        }
      },
    );
  });

  it.each(['x', 'x'.repeat(256), 'one opaque value,with/+punctuation='])(
    'one valid raw printable-ASCII signal (%#) is hashed exactly and case-sensitive',
    async (signal) => {
      const f = fixture(transport);
      const flow = await completeCallback(f, await startLogin(f, signal));
      const hash = createHash('sha256').update(signal, 'ascii').digest('base64url');
      expect(flow.session.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash });
      expect(flow.record).not.toHaveProperty(METADATA_KEY);
      const mismatch = await postExchange(f, flow, signal.toUpperCase());
      expect(mismatch.body).toEqual(REAUTH);
      const response = await postExchange(f, flow, signal);
      expect(response.status).toBe(200);
      expect(response.text).not.toContain(hash);
    },
  );

  it('selects only the configured field, ignores unrelated malformed values, and captures before mutable login hooks', async () => {
    const f = fixture(transport, 'fingerprint-only', {
      fingerprintRecognition: { headerName: 'X-App-Browser' },
      hooks: {
        onLoginStart({ req }) {
          req.rawHeaders = ['X-App-Browser', CHANGED_SIGNAL];
          req.headers['x-app-browser'] = CHANGED_SIGNAL;
        },
      },
    });
    const browser = browserFor(f.app);
    const response = await browser
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set('x-aPP-bROWSER', SIGNAL)
      .set(HEADER, 'bad\tignored')
      .send({ fingerprint: CHANGED_SIGNAL, [METADATA_KEY]: { version: 1, hash: 'A'.repeat(43) } });
    expect(response.status).toBe(200);
    browser.capture(response);
    const state = new URL(response.body.authorizationUrl as string).searchParams.get('state')!;
    expect((await f.store.getAuthorizationTransaction(state))?.metadata?.[METADATA_KEY]).toEqual({
      version: 1,
      hash: HASH,
    });
  });
});

describe('DBJWT-09 header configuration and fixed signal policy', () => {
  const options = (): OidcVaultOptions => ({
    backendOrigin: BACKEND,
    config: { issuer, clientId: 'client_1' },
    storeProvider: createMemoryOidcVaultStore({ now: () => NOW }),
    now: () => NOW,
    fingerprintRecognition: {},
  });

  it.each(['', 'bad name', ' bad', 'bad ', 'bad:name', 'bad\r', 'bad\n', 'bad\r\n', 'caf\u00e9', '\u007f', null, 0])(
    'rejects invalid HTTP field name %# at construction',
    (headerName) => {
      expect(() =>
        createOidcVaultMiddleware({
          ...options(),
          fingerprintRecognition: { headerName } as OidcVaultFingerprintRecognitionOptions,
        }),
      ).toThrow('fingerprintRecognition.headerName must be a valid HTTP field name.');
    },
  );

  it.each([
    'Authorization',
    'Proxy-Authorization',
    'WWW-Authenticate',
    'Authentication-Info',
    'DPoP',
    'DPoP-Nonce',
    'Cookie',
    'Set-Cookie',
    'Origin',
    'Referer',
    'Content-Type',
    'Content-Length',
    'Content-Encoding',
    'Accept',
    'Host',
    'Forwarded',
    'X-Forwarded-Host',
    'Access-Control-Allow-Origin',
    'Sec-Fetch-Site',
    'Connection',
    'Transfer-Encoding',
  ])('rejects collision %s case-insensitively at construction', (headerName) => {
    expect(() =>
      createOidcVaultMiddleware({ ...options(), fingerprintRecognition: { headerName: headerName.toLowerCase() } }),
    ).toThrow(/must not collide/);
  });

  it.each([null, false, true, [], 'enabled', 1, new Date(), () => {}])(
    'rejects non-plain recognition option %#',
    (value) => {
      expect(() =>
        createOidcVaultMiddleware({
          ...options(),
          fingerprintRecognition: value as OidcVaultFingerprintRecognitionOptions,
        }),
      ).toThrow('fingerprintRecognition must be a plain options object.');
    },
  );

  it.each([
    'getAuthorizationTransaction',
    'consumeAuthorizationTransactionIfMatches',
    'getExchangeCode',
    'consumeExchangeCodeIfMatches',
    'getSessionRevocationContext',
    'reserveDpopProof',
  ] as const)('fingerprint-only requires store capability %s without invoking it', (name) => {
    const configured = options();
    Object.defineProperty(configured.storeProvider, name, { value: undefined });
    expect(() => createOidcVaultMiddleware(configured)).toThrow(
      `fingerprintRecognition requires storeProvider.${name}.`,
    );
  });

  it('fingerprint-only activates transaction-cookie name collision and explicit cookie security validation', () => {
    expect(() => createOidcVaultMiddleware({ ...options(), cookie: { name: TRANSACTION_COOKIE } })).toThrow(
      /must be distinct/,
    );
    expect(() =>
      createOidcVaultMiddleware({
        ...options(),
        transactionCookie: { sameSite: 'strict' } as unknown as OidcVaultOptions['transactionCookie'],
      }),
    ).toThrow(/must be lax or none/);
    expect(() =>
      createOidcVaultMiddleware({
        ...options(),
        backendOrigin: 'http://localhost:3000',
        transactionCookie: { sameSite: 'none' },
      }),
    ).toThrow(/requires HTTPS/);
  });

  it('plain/null-prototype/frozen options are detached/frozen and getter fields are sampled only once', () => {
    let reads = 0;
    const source = Object.freeze({
      get headerName() {
        reads++;
        return reads === 1 ? 'X-App-Recognition' : 'Authorization';
      },
    });
    const resolved = resolveFingerprintRecognitionOptions(source)!;
    expect(reads).toBe(1);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved.headerName).toBe('X-App-Recognition');
    expect(
      resolveFingerprintRecognitionOptions(
        Object.freeze(
          Object.assign(Object.create(null) as OidcVaultFingerprintRecognitionOptions, { headerName: 'X-App-Other' }),
        ),
      ),
    ).toEqual({ headerName: 'X-App-Other' });
  });

  it.each([
    '\u0000',
    'bad\rvalue',
    'bad\nvalue',
    'bad\tvalue',
    '\u001f',
    '\u007f',
    'caf\u00e9',
    '\ud83d\ude00',
    '',
    'x'.repeat(257),
  ])('rejects forbidden raw signal %# with no value/cause in either private or browser error', (value) => {
    const policy = resolveFingerprintRecognitionOptions({})!;
    const error = (() => {
      try {
        captureFingerprintRecognition({ rawHeaders: [HEADER, value] }, policy);
      } catch (error) {
        return error;
      }
    })();
    expect(error).toMatchObject({
      status: 400,
      code: INVALID.code,
      message: INVALID.message,
      clientMessage: INVALID.message,
    });
    expect(error).not.toHaveProperty('cause');
  });

  it('disabled policy does not even read raw headers; selected absence is undefined', () => {
    const req = {
      get rawHeaders(): string[] {
        throw new Error('Disabled recognition must not inspect raw headers.');
      },
    };
    expect(captureFingerprintRecognition(req, undefined)).toBeUndefined();
    expect(
      captureFingerprintRecognition(
        { rawHeaders: ['Unrelated', 'bad\tvalue'] },
        resolveFingerprintRecognitionOptions({}),
      ),
    ).toBeUndefined();
  });
});

describe.each(TRANSPORTS)('DBJWT-09 original metadata, hooks and profile privacy (%s)', (transport) => {
  const hookMutations = [
    [
      'remove',
      (session: OidcVaultSession) => {
        delete session.metadata![METADATA_KEY];
      },
    ],
    [
      'rebind hash',
      (session: OidcVaultSession) => {
        (session.metadata![METADATA_KEY] as Record<string, unknown>).hash = 'A'.repeat(43);
      },
    ],
    [
      'replace value',
      (session: OidcVaultSession) => {
        session.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
      },
    ],
    [
      'null',
      (session: OidcVaultSession) => {
        session.metadata![METADATA_KEY] = null;
      },
    ],
    [
      'replacement getter',
      (session: OidcVaultSession) => {
        Object.defineProperty(session.metadata!, METADATA_KEY, {
          enumerable: true,
          get() {
            throw new Error('Replacement recognition getter must not run.');
          },
        });
      },
    ],
    [
      'replace metadata',
      (session: OidcVaultSession) => {
        session.metadata = { application: { theme: 'dark' } };
      },
    ],
    [
      'remove metadata',
      (session: OidcVaultSession) => {
        session.metadata = undefined;
      },
    ],
  ] as const;

  it.each(hookMutations)(
    'precreate %s cannot strip/rebind the original enrollment; other application metadata remains mutable',
    async (_name, mutate) => {
      const f = fixture(transport, 'required DPoP', {
        hooks: {
          onBeforeSessionCreate({ session }) {
            mutate(session!);
            session!.metadata ??= {};
            session!.metadata.application = { theme: 'dark' };
            session!.user![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
          },
        },
      });
      const flow = await completeCallback(f, await startLogin(f));
      expect(flow.session.metadata).toMatchObject({
        [METADATA_KEY]: { version: 1, hash: HASH },
        application: { theme: 'dark' },
      });
      expect(flow.session.user).not.toHaveProperty(METADATA_KEY);
      const wrong = await postExchange(f, flow, CHANGED_SIGNAL, proofFor('exchange'));
      expect(wrong.body).toEqual(REAUTH);
      credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, proofFor('exchange')));
    },
  );

  it.each(['absent POST', 'GET', 'disabled DPoP recognition'] as const)(
    'precreate/profile forgery cannot enroll %s',
    async (kind) => {
      providerClaims = {
        [METADATA_KEY]: { version: 1, hash: HASH },
        nested: { [METADATA_KEY]: { version: 1, hash: HASH } },
      };
      userInfoClaims = { [METADATA_KEY]: { version: 1, hash: HASH } };
      const f = fixture(transport, 'optional DPoP', {
        ...(kind === 'disabled DPoP recognition' ? { fingerprintRecognition: undefined } : {}),
        hooks: {
          onBeforeSessionCreate({ session }) {
            session!.metadata ??= {};
            session!.metadata[METADATA_KEY] = { version: 1, hash: HASH };
            session!.user![METADATA_KEY] = { version: 1, hash: HASH };
          },
        },
      });
      const flow = await completeCallback(f, await startLogin(f, null, undefined, kind === 'GET'));
      expect(flow.session.metadata?.[METADATA_KEY]).toBeUndefined();
      expectNoPublicRecognition(flow.session.user);
      const first = credentials(
        f,
        flow.browser,
        await postExchange(f, flow, CHANGED_SIGNAL, routeProof(f, 'exchange')),
        kind !== 'GET',
      );
      const next = credentials(
        f,
        flow.browser,
        await postSession(f, flow.browser, first.sessionId, 'refresh', undefined, routeProof(f, 'refresh')),
        kind !== 'GET',
      );
      expect((await f.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toBeUndefined();
    },
  );

  it('fresh ID/UserInfo reserved claims cannot change enrollment or escape through a profile/JWT during refresh', async () => {
    const f = fixture(transport);
    const flow = await completeCallback(f, await startLogin(f));
    const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
    providerClaims = {
      [METADATA_KEY]: { version: 1, hash: HASH },
      profile: { [METADATA_KEY]: { version: 1, hash: HASH }, ordinary: 'claim' },
    };
    userInfoClaims = { [METADATA_KEY]: { version: 1, hash: 'A'.repeat(43) }, name: 'New Name' };
    const next = credentials(f, flow.browser, await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL));
    const session = (await f.store.getSession(next.sessionId))!;
    expect(session.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    expect(session.user?.profile).toEqual({ ordinary: 'claim' });
    expectNoPublicRecognition(session.user);
  });

  it('issuer gets no recognition evidence even when it signs all profile/metadata; its mutations and extra output cannot leak/rebind enrollment', async () => {
    const f = fixture(transport, 'required DPoP', {
      tokenIssuer: {
        async issue(input) {
          expectNoPublicRecognition(input.session.metadata);
          expectNoPublicRecognition(input.session.user);
          const result = {
            accessToken: await new SignJWT({
              sub: input.session.subject,
              sid: input.session.sessionId,
              metadata: input.session.metadata,
              profile: input.session.user,
              cnf: { jkt: input.deviceBinding!.jkt },
            })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuer(BACKEND)
              .setAudience('recognition-api')
              .setExpirationTime('15m')
              .sign(localSecret),
            expiresIn: 900,
            tokenType: 'DPoP' as const,
            metadata: { [METADATA_KEY]: { version: 1, hash: HASH } },
          };
          input.session.metadata ??= {};
          input.session.metadata[METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
          input.session.user![METADATA_KEY] = { version: 1, hash: HASH };
          input.session.sessionId = 'changed-issuer-id';
          return result;
        },
      },
    });
    const flow = await completeCallback(f, await startLogin(f));
    const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, proofFor('exchange')));
    expectNoPublicRecognition(decodeJwt(first.token));
    const next = credentials(
      f,
      flow.browser,
      await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL, proofFor('refresh')),
    );
    expectNoPublicRecognition(decodeJwt(next.token));
    expect((await f.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    expect(f.issue).toHaveBeenCalledTimes(2);
  });

  it('postcommit create/refresh notifications get owned metadata; mutating it cannot affect persisted or response authority', async () => {
    const mutate = ({ session }: { session?: OidcVaultSession }) => {
      session!.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
      session!.user![METADATA_KEY] = { version: 1, hash: HASH };
      session!.sessionId = 'notification-id';
    };
    const f = fixture(transport, 'fingerprint-only', {
      hooks: { onSessionCreated: mutate, onSessionRefreshed: mutate },
    });
    const flow = await completeCallback(f, await startLogin(f));
    expect(flow.session.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
    const next = credentials(f, flow.browser, await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL));
    expect((await f.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    expectNoPublicRecognition((await f.store.getSession(next.sessionId))?.user);
  });
});

describe.each(TRANSPORTS)('DBJWT-09 immutable store preflight and generation (%s)', (transport) => {
  it('POST transaction metadata and original recognition evidence are frozen before provider handoff', async () => {
    const f = fixture(transport);
    f.calls.transaction.mockImplementation(async (input) => {
      expect(Object.isFrozen(input.metadata)).toBe(true);
      const recognition = input.metadata![METADATA_KEY] as object;
      expect(Object.isFrozen(recognition)).toBe(true);
      expect(Reflect.set(recognition, 'hash', 'A'.repeat(43))).toBe(false);
      expect(Reflect.deleteProperty(input.metadata!, METADATA_KEY)).toBe(false);
      await f.originals.createTransaction(input);
    });
    const flow = await completeCallback(f, await startLogin(f));
    expect(flow.session.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
  });

  it('recognition metadata on an unguarded legacy transaction cannot enroll a session through GET callback', async () => {
    const f = fixture(transport);
    const legacy = {
      state: `legacy-state-${randomUUID()}`,
      nonce: 'legacy-nonce',
      pkceVerifier: 'verifier',
      codeChallenge: 'challenge',
      createdAt: NOW,
      expiresAt: NOW + 60_000,
      metadata: { [METADATA_KEY]: { version: 1, hash: HASH } },
    };
    await f.store.createAuthorizationTransaction(legacy);
    clearCalls(f);
    const response = await request(f.app)
      .get(`${BASE}/callback`)
      .query({ state: legacy.state, code: 'authcode:legacy-nonce:recognized-user' });
    expect(response.body.code).toBe('OIDC_VAULT_INVALID_STATE');
    expectNoWork(f, response);
    expect(await f.store.getAuthorizationTransaction(legacy.state)).toEqual(legacy);
  });

  it.each(['exchange', 'refresh'] as const)(
    '%s captures the fingerprint/proof before an awaited store changes request headers',
    async (route) => {
      const f = fixture(transport, 'required DPoP');
      const flow = await completeCallback(f, await startLogin(f));
      if (route === 'refresh') credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, proofFor('exchange')));
      f.calls.getSession.mockImplementationOnce(async (sessionId) => {
        const session = await f.originals.getSession(sessionId);
        const req = f.requests.at(-1)!;
        req.rawHeaders = [HEADER, CHANGED_SIGNAL, 'DPoP', 'changed-proof'];
        req.headers[HEADER.toLowerCase()] = CHANGED_SIGNAL;
        req.headers.dpop = 'changed-proof';
        return session;
      });
      const response = await (route === 'exchange'
        ? postExchange(f, flow, SIGNAL, proofFor(route))
        : postSession(f, flow.browser, flow.session.sessionId, 'refresh', SIGNAL, proofFor(route)));
      credentials(f, flow.browser, response);
      const nextId = transport === 'body' ? (response.body.sessionId as string) : flow.browser.sessionId()!;
      expect((await f.store.getSession(nextId))?.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    },
  );

  it.each(['removed', 'rebound'] as const)(
    'callback atomic returned %s transaction recognition fails before upstream/session/code work',
    async (kind) => {
      const f = fixture(transport);
      const login = await startLogin(f);
      f.calls.consumeTransaction.mockImplementation(async (input) => {
        const returned = (await f.originals.consumeTransaction(input))!;
        if (kind === 'removed') delete returned.metadata![METADATA_KEY];
        else returned.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
        return returned;
      });
      clearCalls(f);
      const response = await login.browser
        .get(`${BASE}/callback`)
        .query({ state: login.state, code: `authcode:${login.url.searchParams.get('nonce')}:recognized-user` });
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_STATE');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(providerRequests).toEqual([]);
      expect(f.calls.createSession).not.toHaveBeenCalled();
      expect(f.calls.code).not.toHaveBeenCalled();
    },
  );

  it('exchange compares the original snapshot, not a mutable raw store object, before consumption', async () => {
    const f = fixture(transport);
    const flow = await completeCallback(f, await startLogin(f));
    const raw = structuredClone(flow.session);
    f.calls.getSession.mockImplementationOnce(async () => raw);
    // A changing getter is copied once during snapshot. It must not replace
    // recognition authority on the later validation/issuer reads.
    let reads = 0;
    Object.defineProperty(raw.metadata!, METADATA_KEY, {
      enumerable: true,
      get() {
        reads++;
        return { version: 1, hash: reads === 1 ? HASH : 'A'.repeat(43) };
      },
    });
    clearCalls(f);
    const response = await postExchange(f, flow, CHANGED_SIGNAL);
    expect(response.body).toEqual(REAUTH);
    expectNoWork(f, response);
    expect(reads).toBe(1);
    expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
  });

  it.each(['removed', 'rebound'] as const)(
    'created session store return %s recognition cannot produce a code; original fresh lineage is cleaned up',
    async (kind) => {
      const f = fixture(transport);
      const login = await startLogin(f);
      f.calls.createSession.mockImplementation(async (input) => {
        const returned = await f.originals.createSession(input);
        if (kind === 'removed') delete returned.metadata![METADATA_KEY];
        else returned.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
        return returned;
      });
      clearCalls(f);
      const response = await login.browser
        .get(`${BASE}/callback`)
        .query({ state: login.state, code: `authcode:${login.url.searchParams.get('nonce')}:recognized-user` });
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_STATE');
      expect(f.calls.code).not.toHaveBeenCalled();
      expect(f.issue).not.toHaveBeenCalled();
      const originalId = f.calls.createSession.mock.calls[0][0].sessionId;
      expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: originalId });
      expect(await f.store.getSession(originalId)).toBeNull();
    },
  );

  it.each(['removed', 'rebound'] as const)(
    'exchange returned session %s recognition cannot issue credentials from a changed generation',
    async (kind) => {
      const f = fixture(transport);
      const flow = await completeCallback(f, await startLogin(f));
      f.calls.getSession.mockImplementationOnce(f.originals.getSession).mockImplementationOnce(async (sessionId) => {
        const returned = (await f.originals.getSession(sessionId))!;
        if (kind === 'removed') delete returned.metadata![METADATA_KEY];
        else returned.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
        return returned;
      });
      clearCalls(f);
      const response = await postExchange(f, flow, SIGNAL);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_SESSION');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.calls.revoke).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
      expect(await f.store.getSession(flow.session.sessionId)).toEqual(flow.session);
    },
  );

  it.each(['stripped', 'rebound', 'enrolled an absent session'] as const)(
    'refresh generation %s while discovery awaits rejects before upstream token burn',
    async (kind) => {
      const f = fixture(transport);
      const flow = await completeCallback(
        f,
        await startLogin(f, kind === 'enrolled an absent session' ? null : SIGNAL),
      );
      credentials(
        f,
        flow.browser,
        await postExchange(f, flow, kind === 'enrolled an absent session' ? undefined : SIGNAL),
      );
      f.calls.getSession.mockImplementationOnce(async (sessionId) => {
        const original = (await f.originals.getSession(sessionId))!;
        const replacement = structuredClone(original);
        if (kind === 'stripped') delete replacement.metadata![METADATA_KEY];
        else replacement.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
        await f.originals.createSession(replacement); // Independent application upsert, not a core write/lease.
        return original;
      });
      clearCalls(f);
      const response = await postSession(f, flow.browser, flow.session.sessionId, 'refresh', SIGNAL);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_SESSION');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(providerRequests.filter((entry) => entry.path.endsWith('/token'))).toEqual([]);
      expect(f.calls.rotate).not.toHaveBeenCalled();
      expect(f.issue).not.toHaveBeenCalled();
      expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
    },
  );

  it.each(['removed', 'rebound'] as const)(
    'rotated store return %s recognition is rejected with original-lineage cleanup and no issuer credentials',
    async (kind) => {
      const f = fixture(transport);
      const flow = await completeCallback(f, await startLogin(f));
      credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
      f.calls.rotate.mockImplementation(async (input) => {
        const returned = await f.originals.rotate(input);
        if (kind === 'removed') delete returned.metadata![METADATA_KEY];
        else returned.metadata![METADATA_KEY] = { version: 1, hash: 'A'.repeat(43) };
        return returned;
      });
      clearCalls(f);
      const response = await postSession(f, flow.browser, flow.session.sessionId, 'refresh', SIGNAL);
      expect(response.status).toBe(401);
      expect(f.issue).not.toHaveBeenCalled();
      expect(f.calls.revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: flow.session.logicalSessionId });
      expect(await f.store.getSession(flow.session.sessionId)).toBeNull();
      const nextId = f.calls.rotate.mock.calls[0][0].nextSession.sessionId;
      expect(await f.store.getSession(nextId)).toBeNull();
    },
  );

  it.each([null, {}, { version: 2, hash: HASH }, { version: 1, hash: 'bad' }, { version: 1, hash: HASH, raw: SIGNAL }])(
    'malformed persisted recognition %# cannot become unenrolled or burn a token',
    async (value) => {
      const f = fixture(transport);
      const flow = await completeCallback(f, await startLogin(f));
      await f.store.createSession({ ...flow.session, metadata: { [METADATA_KEY]: value } });
      flow.browser.setCookie(SESSION_COOKIE, flow.session.sessionId);
      clearCalls(f);
      for (const route of ['exchange', 'refresh'] as const) {
        const response = await (route === 'exchange'
          ? postExchange(f, flow, SIGNAL)
          : postSession(f, flow.browser, flow.session.sessionId, 'refresh', SIGNAL));
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' });
        expectNoWork(f, response);
        expectNoPublicRecognition(response.body);
      }
      expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
      expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
    },
  );
});

describe.each(TRANSPORTS)('DBJWT-09 compatibility, logout and fresh-login policy (%s)', (transport) => {
  it('fingerprint-only HTTP development uses its default non-Secure temporary cookie through the whole guarded flow', async () => {
    const f = fixture(transport, 'fingerprint-only', { backendOrigin: 'http://localhost:3000' });
    const login = await startLogin(f);
    const cookie = cookieLines(login.response)[0];
    expect(cookie).toMatch(/^oidc_vault_transaction=[A-Za-z0-9_-]{43}; Path=\/; SameSite=Lax; HttpOnly;/);
    expect(cookie).not.toContain('; Secure');
    const flow = await completeCallback(f, login);
    const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
    expect(flow.browser.cookieHeader()).not.toContain('oidc_vault_transaction=');
    const next = credentials(f, flow.browser, await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL));
    expect((await f.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
  });

  it('seeded pre-feature unbound legacy session/code stays unenrolled with recognition enabled and never enrolls from later proofs/signals', async () => {
    const f = fixture(transport, 'optional DPoP');
    const session = await f.store.createSession({
      sessionId: `sess_legacy_${randomUUID()}`,
      subject: 'recognized-user',
      refreshToken: registerRefresh('recognized-user'),
      idToken: 'previously-verified-id',
      user: { sub: 'recognized-user' },
      expiresAt: NOW + 120_000,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const code = `code_legacy_${randomUUID()}`;
    await f.store.createExchangeCode({ code, sessionId: session.sessionId, createdAt: NOW, expiresAt: NOW + 30_000 });
    const browser = browserFor(f.app);
    const first = credentials(
      f,
      browser,
      await postExchange(f, { browser, code }, SIGNAL, proofFor('exchange')),
      false,
    );
    const next = credentials(
      f,
      browser,
      await postSession(f, browser, first.sessionId, 'refresh', CHANGED_SIGNAL, proofFor('refresh')),
      false,
    );
    const stored = (await f.store.getSession(next.sessionId))!;
    expect(stored.metadata?.[METADATA_KEY]).toBeUndefined();
    expect(stored.deviceBinding).toBeUndefined();
    expect(stored.provider).toBeUndefined();
    expect(stored.expiresAt).toBe(session.expiresAt);
    expect(stored.logicalSessionId).toBe(session.logicalSessionId);
    expect(f.calls.consumeCode.mock.calls[0][0].match).toEqual({ deviceBinding: null, browserBindingHash: null });
  });

  it.each(['fingerprint-only', 'required DPoP'] as const)(
    'signed backchannel logout of %s sessions ignores fingerprint and needs no browser proof',
    async (policy) => {
      const f = fixture(transport, policy);
      const flow = await completeCallback(f, await startLogin(f));
      credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, routeProof(f, 'exchange')));
      const logoutToken = await new SignJWT({
        sid: 'provider-session',
        jti: randomUUID(),
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'dbjwt-09-provider', typ: 'logout+jwt' })
        .setIssuer(issuer)
        .setAudience('client_1')
        .setIssuedAt()
        .setExpirationTime('1m')
        .sign(providerKey);
      clearCalls(f);
      const response = await request(f.app)
        .post(`${BASE}/backchannel-logout`)
        .set(HEADER, 'bad\tignored')
        .type('form')
        .send({ logout_token: logoutToken });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ loggedOut: true, revokedSessions: 1 });
      expect(await f.store.getSession(flow.session.sessionId)).toBeNull();
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expectNoPublicRecognition(response.body);
    },
  );

  it('optional DPoP without a login proof can enroll recognition while remaining unbound; later proofs never bind it', async () => {
    const f = fixture(transport, 'optional DPoP');
    const browser = browserFor(f.app);
    const started = await browser.post(`${BASE}/login`).set('Origin', FRONTEND).set(HEADER, SIGNAL).send({});
    expect(started.status).toBe(200);
    browser.capture(started);
    const url = new URL(started.body.authorizationUrl as string);
    const transaction = (await f.store.getAuthorizationTransaction(url.searchParams.get('state')!))!;
    expect(transaction.deviceBinding).toBeUndefined();
    expect(transaction.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    const flow = await completeCallback(f, { browser, response: started, url, state: transaction.state, transaction });
    const first = credentials(f, browser, await postExchange(f, flow, SIGNAL, proofFor('exchange')), false);
    const next = credentials(
      f,
      browser,
      await postSession(f, browser, first.sessionId, 'refresh', SIGNAL, proofFor('refresh')),
      false,
    );
    const stored = (await f.store.getSession(next.sessionId))!;
    expect(stored.deviceBinding).toBeUndefined();
    expect(stored.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
  });

  it.each(['exchange', 'refresh'] as const)(
    'correct recognition cannot replace a missing required DPoP proof on %s',
    async (route) => {
      const f = fixture(transport, 'required DPoP');
      const flow = await completeCallback(f, await startLogin(f));
      if (route === 'refresh') credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, proofFor('exchange')));
      clearCalls(f);
      const response = await (route === 'exchange'
        ? postExchange(f, flow, SIGNAL)
        : postSession(f, flow.browser, flow.session.sessionId, 'refresh', SIGNAL));
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('OIDC_VAULT_DPOP_REQUIRED');
      expectNoWork(f, response);
      expect(refreshTokens.has(flow.session.refreshToken)).toBe(true);
      if (route === 'exchange') expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    },
  );

  it.each(['fingerprint-only', 'required DPoP'] as const)(
    'disabled recognition preserves %s stored sessions and never inspects malformed signal',
    async (policy) => {
      const owner = fixture(transport, policy);
      const flow = await completeCallback(owner, await startLogin(owner));
      const off = fixture(transport, policy, { fingerprintRecognition: undefined }, owner.store);
      const browser = browserFor(off.app);
      const transactionPair = flow.browser
        .cookieHeader()
        .split('; ')
        .find((pair) => pair.startsWith(`${TRANSACTION_COOKIE}=`))!;
      browser.setCookie(TRANSACTION_COOKIE, transactionPair.slice(transactionPair.indexOf('=') + 1));
      const first = credentials(
        off,
        browser,
        await postExchange(off, { browser, code: flow.code }, 'bad\tignored', routeProof(off, 'exchange')),
      );
      const next = credentials(
        off,
        browser,
        await postSession(off, browser, first.sessionId, 'refresh', undefined, routeProof(off, 'refresh')),
      );
      expect((await off.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toEqual({
        version: 1,
        hash: HASH,
      });
      if (policy === 'required DPoP') {
        clearCalls(off);
        const missing = await postSession(off, browser, next.sessionId, 'refresh', SIGNAL);
        expect(missing.body.code).toBe('OIDC_VAULT_DPOP_REQUIRED');
        expectNoWork(off, missing);
      }
    },
  );

  it('all features off preserve legacy GET/Bearer behavior and no POST initiation; signal headers are ignored', async () => {
    const f = fixture(transport, 'fingerprint-only', { fingerprintRecognition: undefined });
    const post = await request(f.app)
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set(HEADER, 'bad\tignored')
      .send({});
    expect(post.status).toBe(404);
    const flow = await completeCallback(f, await startLogin(f, SIGNAL, undefined, true));
    const first = credentials(f, flow.browser, await postExchange(f, flow, 'bad\tignored'));
    const next = credentials(
      f,
      flow.browser,
      await postSession(f, flow.browser, first.sessionId, 'refresh', 'x'.repeat(257)),
    );
    expect((await f.store.getSession(next.sessionId))?.metadata?.[METADATA_KEY]).toBeUndefined();
  });

  it('mutating/replacing reused recognition options after construction cannot disable enrollment/checks or select another header', async () => {
    const recognition = { headerName: 'X-Initial-Browser' };
    const f = fixture(transport, 'fingerprint-only', { fingerprintRecognition: recognition });
    recognition.headerName = 'X-Later-Browser';
    f.options.fingerprintRecognition = undefined;
    const browser = browserFor(f.app);
    const started = await browser
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set('X-Initial-Browser', SIGNAL)
      .send({});
    expect(started.status).toBe(200);
    browser.capture(started);
    const url = new URL(started.body.authorizationUrl as string);
    const transaction = (await f.store.getAuthorizationTransaction(url.searchParams.get('state')!))!;
    const flow = await completeCallback(f, { browser, response: started, url, state: transaction.state, transaction });
    expect(flow.session.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    const wrongHeader = await browser
      .post(`${BASE}/exchange`)
      .set('Origin', FRONTEND)
      .set('X-Later-Browser', SIGNAL)
      .send({ code: flow.code });
    expect(wrongHeader.body).toEqual(REAUTH);
    const accepted = await browser
      .post(`${BASE}/exchange`)
      .set('Origin', FRONTEND)
      .set('X-Initial-Browser', SIGNAL)
      .send({ code: flow.code });
    expect(accepted.status).toBe(200);
  });

  describe.each(POLICIES)('%s logout contract', (policy) => {
    it.each(['live', 'alias'] as const)(
      '%s logout needs no fingerprint and ignores malformed/mismatched recognition while retaining existing DPoP rules',
      async (kind) => {
        const f = fixture(transport, policy);
        const flow = await completeCallback(f, await startLogin(f));
        const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL, routeProof(f, 'exchange')));
        let currentId = first.sessionId;
        if (kind === 'alias')
          currentId = credentials(
            f,
            flow.browser,
            await postSession(f, flow.browser, first.sessionId, 'refresh', SIGNAL, routeProof(f, 'refresh')),
          ).sessionId;
        if (transport === 'cookie' && kind === 'alias') flow.browser.setCookie(SESSION_COOKIE, first.sessionId);
        const response = await postSession(
          f,
          flow.browser,
          first.sessionId,
          'logout',
          'bad\tignored',
          routeProof(f, 'logout'),
        );
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ loggedOut: true });
        expect(await f.store.getSession(currentId)).toBeNull();
      },
    );
  });

  it('recognition mismatch cannot trigger a DPoP nonce challenge/reservation; a matching signal reaches the existing nonce policy', async () => {
    const f = fixture(transport, 'required DPoP', {
      deviceBinding: { mode: 'required', nonce: { secret: randomBytes(32) } },
    });
    const browser = browserFor(f.app);
    const firstLogin = await browser
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set(HEADER, SIGNAL)
      .set('DPoP', proofFor('login'))
      .send({});
    expect(firstLogin.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    const started = await browser
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set(HEADER, SIGNAL)
      .set('DPoP', proofFor('login', { nonce: firstLogin.headers['dpop-nonce'] }))
      .send({});
    expect(started.status).toBe(200);
    browser.capture(started);
    const url = new URL(started.body.authorizationUrl as string);
    const transaction = (await f.store.getAuthorizationTransaction(url.searchParams.get('state')!))!;
    const flow = await completeCallback(f, { browser, response: started, url, state: transaction.state, transaction });
    clearCalls(f);
    const mismatch = await postExchange(f, flow, CHANGED_SIGNAL, proofFor('exchange'));
    expect(mismatch.body).toEqual(REAUTH);
    expectNoWork(f, mismatch);
    const challenge = await postExchange(f, flow, SIGNAL, proofFor('exchange'));
    expect(challenge.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expect(f.calls.consumeCode).not.toHaveBeenCalled();
    expect(f.calls.reserve).not.toHaveBeenCalled();
    credentials(
      f,
      browser,
      await postExchange(f, flow, SIGNAL, proofFor('exchange', { nonce: challenge.headers['dpop-nonce'] })),
    );
  });

  it('a new POST login establishes changed recognition without enrolling/rewriting/rotating the earlier session', async () => {
    const f = fixture(transport);
    const flow = await completeCallback(f, await startLogin(f));
    const first = credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
    const changedFlow = await completeCallback(f, await startLogin(f, CHANGED_SIGNAL, flow.browser));
    expect(changedFlow.session.metadata?.[METADATA_KEY]).toEqual({
      version: 1,
      hash: createHash('sha256').update(CHANGED_SIGNAL, 'ascii').digest('base64url'),
    });
    credentials(f, flow.browser, await postExchange(f, changedFlow, CHANGED_SIGNAL));
    expect((await f.store.getSession(first.sessionId))?.metadata?.[METADATA_KEY]).toEqual({ version: 1, hash: HASH });
    expect(f.calls.rotate).not.toHaveBeenCalled();
    expect(f.calls.createSession).toHaveBeenCalledTimes(2);
  });

  it('fingerprint-only POST still rejects missing/untrusted source and form login before provider/allocation', async () => {
    const f = fixture(transport);
    for (const origin of [undefined, 'null', 'https://evil.example']) {
      const call = request(f.app).post(`${BASE}/login`).set(HEADER, SIGNAL);
      if (origin !== undefined) call.set('Origin', origin);
      const response = await call.send({});
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('OIDC_VAULT_UNTRUSTED_ORIGIN');
      expectNoWork(f, response);
    }
    const form = await request(f.app)
      .post(`${BASE}/login`)
      .set('Origin', FRONTEND)
      .set(HEADER, SIGNAL)
      .type('form')
      .send({});
    expect(form.status).toBe(415);
    expect(form.body.code).toBe('OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE');
    expectNoWork(f, form);
  });

  it('fingerprint-only wrong callback cookie and stolen exchange without cookie preserve state before upstream/consume', async () => {
    const f = fixture(transport);
    const login = await startLogin(f);
    clearCalls(f);
    const transferred = await request(f.app)
      .get(`${BASE}/callback`)
      .query({ state: login.state, code: `authcode:${login.url.searchParams.get('nonce')}:recognized-user` });
    expect(transferred.body.code).toBe('OIDC_VAULT_INVALID_BROWSER_BINDING');
    expectNoWork(f, transferred);
    expect(await f.store.getAuthorizationTransaction(login.state)).toEqual(login.transaction);
    const flow = await completeCallback(f, login);
    clearCalls(f);
    const stolen = await request(f.app)
      .post(`${BASE}/exchange`)
      .set('Origin', FRONTEND)
      .set(HEADER, SIGNAL)
      .send({ code: flow.code });
    expect(stolen.body.code).toBe('OIDC_VAULT_INVALID_BROWSER_BINDING');
    expectNoWork(f, stolen);
    expect(await f.store.getExchangeCode(flow.code)).toEqual(flow.record);
    credentials(f, flow.browser, await postExchange(f, flow, SIGNAL));
  });

  it('no fingerprint data is logged; observer mutation cannot replace a fixed recognition error response', async () => {
    const logs = ['log', 'info', 'warn', 'error'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => {}),
    );
    const f = fixture(transport, 'fingerprint-only', {
      hooks: {
        onError({ error, res }) {
          expect(error).toMatchObject({ message: REAUTH.message });
          expect(error).not.toHaveProperty('cause');
          (error as Error).message = `${SIGNAL} ${HASH}`;
          res.setHeader('WWW-Authenticate', HASH);
          res.setHeader('DPoP-Nonce', SIGNAL);
        },
      },
    });
    const flow = await completeCallback(f, await startLogin(f));
    clearCalls(f);
    const response = await postExchange(f, flow, CHANGED_SIGNAL);
    expect(response.body).toEqual(REAUTH);
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(response.headers['dpop-nonce']).toBeUndefined();
    expectNoWork(f, response);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    expectNoPublicRecognition(response.body);
  });

  it('omitted local issuer still enforces enrolled exchange/refresh with no local token fields', async () => {
    const f = fixture(transport, 'fingerprint-only', { tokenIssuer: undefined });
    const flow = await completeCallback(f, await startLogin(f));
    const rejected = await postExchange(f, flow);
    expect(rejected.body).toEqual(REAUTH);
    const first = await postExchange(f, flow, SIGNAL);
    expect(first.status).toBe(200);
    flow.browser.capture(first);
    const next = await postSession(f, flow.browser, flow.session.sessionId, 'refresh', SIGNAL);
    expect(next.status).toBe(200);
    for (const response of [first, next]) {
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('expiresIn');
      expect(response.body).not.toHaveProperty('tokenType');
      expectNoPublicRecognition(response.body);
    }
  });
});
