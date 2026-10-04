import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, type KeyObject } from 'node:crypto';
import http from 'node:http';

import express from 'express';
import { calculateJwkThumbprint, exportJWK, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  createOidcVaultMiddleware,
  type AuthorizationTransaction,
  type OidcVaultHooks,
  type OidcVaultOptions,
  type OidcVaultSessionTransport,
  type OidcVaultTransactionCookieOptions,
} from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';
import { createDpopReplayKey, resolveDpopEffectiveNamespace } from '../src/dpop-replay';

const BACKEND_ORIGIN = 'https://api.example.com';
const FRONTEND_ORIGIN = 'https://frontend.example.com';
const BASE_PATH = '/auth/oidc';
const COOKIE_NAME = '__Host-oidc_vault_transaction';
const NOW = 1_800_000_000_123;
const TRANSPORTS = ['body', 'cookie'] as const;
const INVALID_BROWSER = {
  code: 'OIDC_VAULT_INVALID_BROWSER_BINDING',
  message: 'Login browser binding validation failed.',
};
const INVALID_PROOF = { code: 'OIDC_VAULT_INVALID_DPOP_PROOF', message: 'DPoP proof validation failed.' };
const REQUIRED = { code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', message: 'A device-bound login is required.' };

interface ProofKey {
  privateKey: KeyObject;
  jwk: JWK;
  jkt: string;
}
let keyA: ProofKey;
let keyB: ProofKey;
let issuer = '';
let providerServer: http.Server;
let providerRequests: Array<{ path: string; body?: Record<string, unknown>; dpop?: string }> = [];
let spentProviderCodes = new Set<string>();
let failDiscovery = false;
let invalidIdNonce = false;

const proofFor = (
  options: {
    key?: ProofKey;
    signingKey?: ProofKey;
    claims?: Record<string, unknown>;
    header?: Record<string, unknown>;
  } = {},
): string => {
  const key = options.key ?? keyA;
  const input = [
    { typ: 'dpop+jwt', alg: 'ES256', jwk: key.jwk, ...options.header },
    {
      htm: 'POST',
      htu: `${BACKEND_ORIGIN}${BASE_PATH}/login`,
      iat: Math.floor(NOW / 1000),
      jti: randomUUID(),
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
  const raw: unknown = response.headers['set-cookie'];
  return Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
};

const createBrowser = (app: express.Express) => {
  const jar = new Map<string, string>();
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const withCookies = (test: request.Test): request.Test => (jar.size ? test.set('Cookie', cookieHeader()) : test);
  return {
    get: (path: string) => withCookies(request(app).get(path)),
    post: (path: string) => withCookies(request(app).post(path)),
    cookieHeader,
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

beforeAll(async () => {
  const makeKey = async (): Promise<ProofKey> => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = await exportJWK(pair.publicKey);
    return { privateKey: pair.privateKey, jwk, jkt: await calculateJwkThumbprint(jwk) };
  };
  [keyA, keyB] = await Promise.all([makeKey(), makeKey()]);
  const providerPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const providerJwk = { ...(await exportJWK(providerPair.publicKey)), kid: 'dbjwt-04-provider' };
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
      jwks_uri: `${issuer}/jwks`,
      userinfo_endpoint: `${issuer}/userinfo`,
    });
  });
  provider.get('/issuer/jwks', (_req, res) => res.json({ keys: [providerJwk] }));
  provider.post('/issuer/token', async (req, res) => {
    const code = String(req.body.code ?? '');
    if (spentProviderCodes.has(code)) {
      res.status(400).json({ error: 'invalid_grant' });
      return;
    }
    spentProviderCodes.add(code);
    const [, nonce, subject = 'honest-user'] = code.split(':');
    const idToken = await new SignJWT({
      sub: subject,
      sid: `provider-${subject}`,
      nonce: invalidIdNonce ? 'wrong-nonce' : nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: providerJwk.kid })
      .setIssuer(issuer)
      .setAudience('client_1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(providerPair.privateKey);
    res.json({
      token_type: 'Bearer',
      access_token: `upstream-access:${subject}`,
      refresh_token: `upstream-refresh:${subject}`,
      id_token: idToken,
      scope: 'openid profile',
      expires_in: 3600,
    });
  });
  provider.get('/issuer/userinfo', (req, res) => {
    res.json({
      sub: req.get('authorization')?.slice('Bearer upstream-access:'.length),
      name: 'Verified Provider User',
    });
  });
  providerServer = provider.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => providerServer.once('listening', resolve));
  const address = providerServer.address();
  if (!address || typeof address === 'string') throw new Error('Missing test provider address.');
  issuer = `http://127.0.0.1:${address.port}/issuer`;
});

beforeEach(() => {
  vi.restoreAllMocks();
  __resetProviderClientCachesForTests();
  providerRequests = [];
  spentProviderCodes = new Set();
  failDiscovery = false;
  invalidIdNonce = false;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => providerServer.close((error) => (error ? reject(error) : resolve())));
});

const fixture = (
  transport: OidcVaultSessionTransport = 'body',
  overrides: Partial<OidcVaultOptions> = {},
  configuredStore?: ReturnType<typeof createMemoryOidcVaultStore>,
  clock = { value: NOW },
) => {
  const app = express();
  const store = configuredStore ?? createMemoryOidcVaultStore({ now: () => clock.value });
  const originals = {
    reserve: store.reserveDpopProof.bind(store),
    consumeTransaction: store.consumeAuthorizationTransactionIfMatches.bind(store),
  };
  const calls = {
    createTransaction: vi.spyOn(store, 'createAuthorizationTransaction'),
    consumeLegacyTransaction: vi.spyOn(store, 'consumeAuthorizationTransaction'),
    consumeTransaction: vi.spyOn(store, 'consumeAuthorizationTransactionIfMatches'),
    createSession: vi.spyOn(store, 'createSession'),
    createCode: vi.spyOn(store, 'createExchangeCode'),
    consumeCode: vi.spyOn(store, 'consumeExchangeCodeIfMatches'),
    rotate: vi.spyOn(store, 'rotateSession'),
    revoke: vi.spyOn(store, 'deleteSessionsByLogicalSessionId'),
    reserve: vi.spyOn(store, 'reserveDpopProof'),
  };
  const onError = vi.fn(overrides.hooks?.onError ?? (() => {}));
  const options: OidcVaultOptions = {
    backendOrigin: BACKEND_ORIGIN,
    basePath: BASE_PATH,
    frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
    config: { issuer, clientId: 'client_1' },
    storeProvider: store,
    sessionTransport: transport,
    trustedOrigins: [FRONTEND_ORIGIN],
    deviceBinding: {},
    sessionTtlMs: 90_000,
    now: () => clock.value,
    ...overrides,
    hooks: { ...overrides.hooks, onError },
  };
  app.use(createOidcVaultMiddleware(options));
  return { app, store, options, calls, originals, onError, clock };
};
type Fixture = ReturnType<typeof fixture>;

const startLogin = async (
  f: Fixture,
  browser: Browser,
  proof: string | undefined = proofFor(),
  body: Record<string, unknown> = {},
) => {
  const call = browser.post(`${BASE_PATH}/login`).set('Origin', FRONTEND_ORIGIN);
  if (proof !== undefined) call.set('DPoP', proof);
  const response = await call.send(body);
  expect(response.status).toBe(200);
  expect(Object.keys(response.body)).toEqual(['authorizationUrl']);
  expect(response.headers.location).toBeUndefined();
  expect(response.headers['cache-control']).toBe('no-store');
  browser.capture(response);
  const url = new URL(response.body.authorizationUrl as string);
  const state = url.searchParams.get('state')!;
  const nonce = url.searchParams.get('nonce')!;
  const line = cookieLines(response)[0];
  const secret = line.split(';', 1)[0].slice(line.indexOf('=') + 1);
  return { response, url, state, nonce, secret, line };
};
type Login = Awaited<ReturnType<typeof startLogin>>;

const callback = (browser: Browser, login: Login, subject = 'honest-user') =>
  browser.get(`${BASE_PATH}/callback`).query({ state: login.state, code: `authcode:${login.nonce}:${subject}` });

const expectNoCallbackWork = (f: Fixture): void => {
  expect(f.calls.createSession).not.toHaveBeenCalled();
  expect(f.calls.createCode).not.toHaveBeenCalled();
  expect(f.calls.rotate).not.toHaveBeenCalled();
  expect(f.calls.revoke).not.toHaveBeenCalled();
  expect(providerRequests).toEqual([]);
};

describe.each(TRANSPORTS)('DBJWT-04 initiation and headerless callback (%s)', (transport) => {
  it.each(['optional', 'required'] as const)(
    '[DBJWT-01; DBJWT-04] %s proof initiation and same-browser callback preserve the original binding',
    async (mode) => {
      const f = fixture(transport, { deviceBinding: { mode } });
      const browser = createBrowser(f.app);
      const login = await startLogin(f, browser);
      const transaction = await f.store.getAuthorizationTransaction(login.state);
      expect(transaction).toMatchObject({
        state: login.state,
        nonce: login.nonce,
        deviceBinding: { type: 'dpop', jkt: keyA.jkt },
        browserBindingHash: createHash('sha256').update(login.secret, 'ascii').digest('base64url'),
        createdAt: NOW,
        expiresAt: NOW + 600_000,
      });
      expect(Buffer.from(login.secret, 'base64url')).toHaveLength(32);
      expect(JSON.stringify(transaction)).not.toContain(login.secret);
      expect(JSON.stringify(transaction)).not.toContain(keyA.jwk.x);
      expect(transaction?.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt });
      expect(login.url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(login.url.searchParams.get('code_challenge')).toBe(
        createHash('sha256').update(transaction!.pkceVerifier).digest('base64url'),
      );
      expect(login.line).toContain('Path=/; SameSite=Lax; HttpOnly; Secure');
      expect(login.line).toContain('Max-Age=600');
      expect(login.line).not.toContain('Domain=');
      expect(f.calls.reserve).toHaveBeenCalledTimes(1);
      providerRequests = [];
      const response = await callback(browser, login);
      expect(response.status).toBe(302);
      expect(response.headers['cache-control']).toBe('no-store');
      const code = new URL(response.headers.location as string).searchParams.get('code')!;
      const record = await f.store.getExchangeCode(code);
      expect(record).toMatchObject({
        code,
        deviceBinding: transaction?.deviceBinding,
        browserBindingHash: transaction?.browserBindingHash,
        expiresAt: NOW + 30_000,
      });
      expect(await f.store.getSession(record!.sessionId)).toMatchObject({
        deviceBinding: transaction?.deviceBinding,
        subject: 'honest-user',
        provider: { issuer, clientId: 'client_1' },
        user: { name: 'Verified Provider User' },
        expiresAt: NOW + 90_000,
      });
      expect(f.calls.consumeTransaction.mock.calls[0][0]).toEqual({
        state: login.state,
        match: { deviceBinding: transaction?.deviceBinding, browserBindingHash: transaction?.browserBindingHash },
      });
      expect(f.calls.consumeLegacyTransaction).not.toHaveBeenCalled();
      expect(await f.store.getAuthorizationTransaction(login.state)).toBeNull();
      const tokenRequest = providerRequests.find((entry) => entry.path.endsWith('/token'));
      expect(tokenRequest?.body).toMatchObject({
        grant_type: 'authorization_code',
        code_verifier: transaction?.pkceVerifier,
        redirect_uri: `${BACKEND_ORIGIN}${BASE_PATH}/callback`,
      });
      expect(providerRequests.every((entry) => entry.dpop === undefined)).toBe(true);
      expect(f.calls.reserve).toHaveBeenCalledTimes(1); // Navigation never invents a proof/nonce/replay step.
      expect(cookieLines(response)).toHaveLength(1);
      expect(cookieLines(response)[0]).toContain(`${COOKIE_NAME}=${login.secret};`);
      expect(cookieLines(response)[0]).toContain('Max-Age=30');
      expect(cookieLines(response)[0]).not.toContain('oidc_vault_session=');
      expect(f.calls.consumeCode).not.toHaveBeenCalled(); // Guarded exchange belongs to DBJWT-05.
    },
  );

  it('[DBJWT-01; DBJWT-04] a transferred attacker callback cannot force-login the victim into a bound session', async () => {
    const f = fixture(transport);
    const attacker = createBrowser(f.app);
    const victim = createBrowser(f.app);
    const attackerLogin = await startLogin(f, attacker);
    const victimLogin = await startLogin(f, victim, proofFor({ key: keyB }));
    const before = await f.store.getAuthorizationTransaction(attackerLogin.state);
    const victimCookies = victim.cookieHeader();
    __resetProviderClientCachesForTests();
    providerRequests = [];
    const transferred = await callback(victim, attackerLogin, 'attacker');
    expect(transferred.status).toBe(400);
    expect(transferred.body).toEqual(INVALID_BROWSER);
    expect(transferred.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(attackerLogin.state)).toEqual(before);
    expect(await f.store.getAuthorizationTransaction(victimLogin.state)).not.toBeNull();
    expect(victim.cookieHeader()).toBe(victimCookies);
    expectNoCallbackWork(f);
    expect((await callback(attacker, attackerLogin, 'attacker')).status).toBe(302);
    expect((await callback(victim, victimLogin, 'victim')).status).toBe(302);
    expect(providerRequests.filter((entry) => entry.path.endsWith('/token'))).toHaveLength(2);
  });

  it.each([
    ['missing', undefined],
    ['malformed percent escape', '%'],
    ['empty', ''],
    ['too long', 'A'.repeat(44)],
    ['noncanonical bits', `${'A'.repeat(42)}B`],
    ['padding', `${'A'.repeat(43)}=`],
    ['quoted', `"${'A'.repeat(43)}"`],
    ['leading whitespace', ` ${'A'.repeat(43)}`],
    ['percent-encoded canonical bytes', `%41${'A'.repeat(42)}`],
    ['wrong canonical secret', 'A'.repeat(43)],
  ])('rejects %s selected cookie without spending or clearing the transaction', async (_name, value) => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const before = await f.store.getAuthorizationTransaction(login.state);
    __resetProviderClientCachesForTests();
    providerRequests = [];
    const call = request(f.app)
      .get(`${BASE_PATH}/callback`)
      .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
    if (value !== undefined) call.set('Cookie', `analytics=%; ${COOKIE_NAME}=${value}`);
    const response = await call;
    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_BROWSER);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(login.state)).toEqual(before);
    expectNoCallbackWork(f);
    expect((await callback(browser, login)).status).toBe(302);
  });

  it('rejects duplicate selected cookies even when both values are correct, but ignores malformed unrelated cookies', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    providerRequests = [];
    const duplicate = await browser
      .get(`${BASE_PATH}/callback`)
      .set('Cookie', `${COOKIE_NAME}=${login.secret}; analytics=%; ${COOKIE_NAME}=${login.secret}`)
      .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
    expect(duplicate.body).toEqual(INVALID_BROWSER);
    expect(duplicate.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expectNoCallbackWork(f);
    const honest = await browser
      .get(`${BASE_PATH}/callback`)
      .set('Cookie', `analytics=%; ${COOKIE_NAME}=${login.secret}; ${COOKIE_NAME}X=%; OIDC_VAULT_TRANSACTION=%`)
      .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
    expect(honest.status).toBe(302);
  });

  it('rejects a valueless selected name and selected duplicate suffix without affecting unrelated cookie names', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    providerRequests = [];
    for (const cookie of [
      COOKIE_NAME,
      `${COOKIE_NAME}=${login.secret}; ${COOKIE_NAME}`,
      `${COOKIE_NAME}=malformed; ${COOKIE_NAME}=${login.secret}`,
    ]) {
      const response = await browser
        .get(`${BASE_PATH}/callback`)
        .set('Cookie', cookie)
        .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
      expect(response.body).toEqual(INVALID_BROWSER);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(login.state)).not.toBeNull();
    expectNoCallbackWork(f);
  });

  it('omitted feature configuration exposes no POST login and preserves the legacy GET redirect', async () => {
    // With no transaction feature/option there is no cookie-name collision:
    // an existing bearer application's historical session name remains valid.
    const f = fixture(transport, { deviceBinding: undefined, cookie: { name: COOKIE_NAME } });
    const post = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({});
    expect(post.status).toBe(404);
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
    const get = await request(f.app).get(`${BASE_PATH}/login`);
    expect(get.status).toBe(302);
    expect(get.headers['set-cookie']).toBeUndefined();
  });

  it('[DBJWT-01; DBJWT-04] required GET rejects before provider discovery, hooks, proof reservation or allocation', async () => {
    const onLoginStart = vi.fn();
    const f = fixture(transport, { deviceBinding: { mode: 'required' }, hooks: { onLoginStart } });
    const response = await request(f.app).get(`${BASE_PATH}/login`).set('DPoP', proofFor()).query({ jkt: keyA.jkt });
    expect(response.status).toBe(401);
    expect(response.body).toEqual(REQUIRED);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(onLoginStart).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
  });

  it('[DBJWT-01; DBJWT-04] required mode rejects a legacy unbound transaction before spending or upstream use', async () => {
    const f = fixture(transport, { deviceBinding: { mode: 'required' } });
    const legacy: AuthorizationTransaction = {
      state: 'legacy-state',
      nonce: 'legacy-nonce',
      pkceVerifier: 'legacy-verifier',
      codeChallenge: 'legacy-challenge',
      createdAt: NOW,
      expiresAt: NOW + 60_000,
    };
    await f.store.createAuthorizationTransaction(legacy);
    const response = await request(f.app)
      .get(`${BASE_PATH}/callback`)
      .query({ state: legacy.state, code: 'legacy-code' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual(REQUIRED);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expect(f.calls.consumeLegacyTransaction).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(legacy.state)).toEqual(legacy);
    expectNoCallbackWork(f);
  });

  it('optional legacy GET stays unbound despite proof/header/query shortcuts and creates an unguarded code', async () => {
    const f = fixture(transport);
    const login = await request(f.app)
      .get(`${BASE_PATH}/login`)
      .set('DPoP', 'not-a-proof')
      .query({ jkt: keyA.jkt, returnTo: '/legacy-target' });
    expect(login.status).toBe(302);
    expect(login.headers['set-cookie']).toBeUndefined();
    const url = new URL(login.headers.location as string);
    const state = url.searchParams.get('state')!;
    expect(await f.store.getAuthorizationTransaction(state)).not.toHaveProperty('deviceBinding');
    expect(await f.store.getAuthorizationTransaction(state)).not.toHaveProperty('browserBindingHash');
    const response = await request(f.app)
      .get(`${BASE_PATH}/callback`)
      .query({ state, code: `authcode:${url.searchParams.get('nonce')}:legacy` });
    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeUndefined();
    const destination = new URL(response.headers.location as string);
    expect(destination.pathname).toBe('/legacy-target');
    const record = await f.store.getExchangeCode(destination.searchParams.get('code')!);
    expect(record).not.toHaveProperty('deviceBinding');
    expect(record).not.toHaveProperty('browserBindingHash');
    expect(f.calls.consumeTransaction.mock.calls[0][0].match).toEqual({
      deviceBinding: null,
      browserBindingHash: null,
    });
    expect(f.calls.reserve).not.toHaveBeenCalled();
  });
});

describe.each(TRANSPORTS)('DBJWT-04 POST admission guards (%s)', (transport) => {
  it.each([
    ['missing origin', undefined, undefined],
    ['null origin', 'null', `${FRONTEND_ORIGIN}/trusted`],
    ['untrusted origin', 'https://evil.example', `${FRONTEND_ORIGIN}/trusted`],
    ['invalid referer', undefined, 'not-a-url'],
    ['untrusted referer', undefined, 'https://evil.example/path'],
    ['userinfo referer', undefined, `https://user:password@frontend.example.com/path`], // pragma: allowlist secret
    ['malformed slash referer', undefined, 'https:/frontend.example.com/path'],
  ])('rejects %s before proof, provider, hooks, allocation or cookie writes', async (_name, origin, referer) => {
    const onLoginStart = vi.fn();
    const f = fixture(transport, { hooks: { onLoginStart } });
    const call = request(f.app).post(`${BASE_PATH}/login`).set('DPoP', proofFor());
    if (origin !== undefined) call.set('Origin', origin);
    if (referer !== undefined) call.set('Referer', referer);
    const response = await call.send({});
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_UNTRUSTED_ORIGIN',
      message: 'Login request origin is not trusted.',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(onLoginStart).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
  });

  it.each(['application/x-www-form-urlencoded', 'text/plain', 'application/problem+json'])(
    'rejects %s login bodies with the exact 415 JSON contract',
    async (contentType) => {
      const f = fixture(transport);
      const response = await request(f.app)
        .post(`${BASE_PATH}/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('DPoP', proofFor())
        .set('Content-Type', contentType)
        .send('returnTo=%');
      expect(response.status).toBe(415);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE',
        message: 'Login initiation requires a JSON request body.',
      });
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(f.calls.createTransaction).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
    },
  );

  it('accepts the valid Referer fallback and backend Origin in both transports', async () => {
    const f = fixture(transport);
    const referer = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Referer', `${FRONTEND_ORIGIN}/app/path?query=1`)
      .set('DPoP', proofFor())
      .send({});
    expect(referer.status).toBe(200);
    const backend = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', BACKEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({});
    expect(backend.status).toBe(200);
  });

  it.each([
    ['bad signature', () => proofFor({ signingKey: keyB })],
    ['wrong method', () => proofFor({ claims: { htm: 'GET' } })],
    ['wrong public URL', () => proofFor({ claims: { htu: `https://evil.example${BASE_PATH}/login` } })],
    ['stale proof', () => proofFor({ claims: { iat: Math.floor(NOW / 1000) - 65 } })],
    ['private JWK', () => proofFor({ header: { jwk: { ...keyA.jwk, d: 'private' } } })],
    ['wrong typ', () => proofFor({ header: { typ: 'JWT' } })],
  ])('rejects %s before replay reservation, discovery and allocation', async (_name, makeProof) => {
    const f = fixture(transport);
    const response = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', makeProof())
      .send({});
    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_PROOF);
    expect(response.headers['www-authenticate']).toBe('DPoP error="invalid_dpop_proof", algs="ES256"');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
  });

  it('takes returnTo only from JSON and validates it before proof/state work', async () => {
    const f = fixture(transport);
    const response = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .query({ returnTo: 'https://evil.example/query' })
      .send({ returnTo: '/body-target' });
    expect(response.status).toBe(200);
    const state = new URL(response.body.authorizationUrl as string).searchParams.get('state')!;
    expect((await f.store.getAuthorizationTransaction(state))?.returnTo).toBe(`${FRONTEND_ORIGIN}/body-target`);
    const invalid = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({ returnTo: 'https://evil.example/body' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('OIDC_VAULT_INVALID_RETURN_TO');
    expect(f.calls.reserve).toHaveBeenCalledTimes(1);
    expect(f.calls.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('optional POST without a proof creates a cookie-only transaction and cannot enroll a key from JSON', async () => {
    const f = fixture(transport);
    const response = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .send({ jkt: keyA.jkt, jwk: keyA.jwk });
    expect(response.status).toBe(200);
    const state = new URL(response.body.authorizationUrl as string).searchParams.get('state')!;
    const transaction = await f.store.getAuthorizationTransaction(state);
    expect(transaction).not.toHaveProperty('deviceBinding');
    expect(transaction?.browserBindingHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.calls.reserve).not.toHaveBeenCalled();
    const browser = createBrowser(f.app);
    browser.capture(response);
    const result = await browser
      .get(`${BASE_PATH}/callback`)
      .query({ state, code: `authcode:${transaction!.nonce}:unbound` });
    expect(result.status).toBe(302);
    const record = await f.store.getExchangeCode(new URL(result.headers.location as string).searchParams.get('code')!);
    expect(record).not.toHaveProperty('deviceBinding');
    expect(record?.browserBindingHash).toBe(transaction?.browserBindingHash);
    expect(f.calls.consumeTransaction.mock.calls[0][0].match).toEqual({
      deviceBinding: null,
      browserBindingHash: transaction?.browserBindingHash,
    });
  });

  it('required POST omission and body-only key selection fail before discovery/allocation', async () => {
    const f = fixture(transport, { deviceBinding: { mode: 'required' } });
    const response = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .send({ jkt: keyA.jkt, jwk: keyA.jwk });
    expect(response.status).toBe(401);
    expect(response.body).toEqual(REQUIRED);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
  });

  it('accepts only a pinned externally visible proof URL despite Host/proxy headers and body/query differences', async () => {
    const f = fixture(transport);
    f.app.set('trust proxy', true);
    const response = await request(f.app)
      .post(`${BASE_PATH}/login?returnTo=https://evil.example/query`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Host', 'evil.example')
      .set('Forwarded', 'host=evil.example;proto=http')
      .set('X-Forwarded-Host', 'evil.example')
      .set('X-Forwarded-Proto', 'http')
      .set('Authorization', 'Bearer not-used-by-vault')
      .set(
        'DPoP',
        proofFor({
          claims: {
            htu: `HTTPS://API.EXAMPLE.COM:443${BASE_PATH}/login?ignored=1#ignored`,
          },
        }),
      )
      .send({ returnTo: '/real-body-target' });
    expect(response.status).toBe(200);
    const url = new URL(response.body.authorizationUrl as string);
    expect(url.searchParams.get('redirect_uri')).toBe(`${BACKEND_ORIGIN}${BASE_PATH}/callback`);
    expect((await f.store.getAuthorizationTransaction(url.searchParams.get('state')!))?.returnTo).toBe(
      `${FRONTEND_ORIGIN}/real-body-target`,
    );
  });

  it.each([[], { returnTo: null }, { returnTo: 1 }, { returnTo: '' }])(
    'rejects invalid JSON DTO %j before proof or allocation',
    async (body) => {
      const f = fixture(transport);
      const response = await request(f.app)
        .post(`${BASE_PATH}/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('DPoP', proofFor())
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_REQUEST_BODY');
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(f.calls.createTransaction).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
    },
  );

  it('rejects malformed JSON and many-parameter urlencoded login before proof/provider work', async () => {
    const f = fixture(transport);
    const malformed = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('DPoP', proofFor())
      .send('{ broken');
    expect(malformed.body.code).toBe('OIDC_VAULT_MALFORMED_REQUEST_BODY');
    const form = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('DPoP', proofFor())
      .send(Array.from({ length: 100 }, (_, index) => `p${index}=value`).join('&'));
    expect(form.status).toBe(415);
    expect(form.body.code).toBe('OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE');
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
  });
});

describe.each(TRANSPORTS)('DBJWT-04 replay/nonce admission (%s)', (transport) => {
  it('waits for successful shared replay admission before discovery, hooks and transaction allocation', async () => {
    const onLoginStart = vi.fn();
    const f = fixture(transport, { hooks: { onLoginStart } });
    let reached!: () => void;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.calls.reserve.mockImplementation(async (input) => {
      reached();
      await gate;
      return f.originals.reserve(input);
    });
    const pending = request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({})
      .then((r) => r);
    await ready;
    expect(providerRequests).toEqual([]);
    expect(onLoginStart).not.toHaveBeenCalled();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    release();
    expect((await pending).status).toBe(200);
    expect(onLoginStart).toHaveBeenCalledTimes(1);
  });

  it('shared instances admit one concurrent proof, reject replay without replacing a cookie/transaction, then accept a fresh proof', async () => {
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const f = fixture(transport, {}, store);
    const other = fixture(transport, {}, store);
    // Wrap the real atomic provider, delaying only to ensure overlap before the
    // shared operation; each proof still goes through the real verifier/store.
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.calls.reserve.mockImplementation(async (input) => {
      if (++arrivals === 4) release();
      if (arrivals <= 4) await gate;
      return f.originals.reserve(input);
    });
    const proof = proofFor({ claims: { jti: 'shared-initiation-proof' } });
    const call = (context: Fixture) =>
      request(context.app).post(`${BASE_PATH}/login`).set('Origin', FRONTEND_ORIGIN).set('DPoP', proof).send({});
    const responses = await Promise.all([call(f), call(other), call(f), call(other)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401, 401, 401]);
    for (const response of responses.filter((r) => r.status === 401)) {
      expect(response.body).toEqual(INVALID_PROOF);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const winner = responses.find((r) => r.status === 200)!;
    const state = new URL(winner.body.authorizationUrl as string).searchParams.get('state')!;
    const before = await store.getAuthorizationTransaction(state);
    providerRequests = [];
    const replay = await call(other);
    expect(replay.body).toEqual(INVALID_PROOF);
    expect(replay.headers['set-cookie']).toBeUndefined();
    expect(await store.getAuthorizationTransaction(state)).toEqual(before);
    expect(providerRequests).toEqual([]);
    const fresh = await request(other.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({});
    expect(fresh.status).toBe(200);
    expect(new URL(fresh.body.authorizationUrl as string).searchParams.get('state')).not.toBe(state);
  });

  it('retains a reservation after discovery failure; a retry needs a freshly signed proof', async () => {
    const f = fixture(transport);
    const proof = proofFor();
    failDiscovery = true;
    const call = (value = proof) =>
      request(f.app).post(`${BASE_PATH}/login`).set('Origin', FRONTEND_ORIGIN).set('DPoP', value).send({});
    const failed = await call();
    expect(failed.status).toBe(502);
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(f.calls.reserve).toHaveBeenCalledTimes(1);
    providerRequests = [];
    failDiscovery = false;
    expect((await call()).body).toEqual(INVALID_PROOF);
    expect(providerRequests).toEqual([]);
    expect((await call(proofFor())).status).toBe(200);
  });

  it('nonce challenges come after other proof checks but before replay/provider/allocation, and old live parallel nonces work across instances', async () => {
    const clock = { value: NOW };
    const store = createMemoryOidcVaultStore({ now: () => clock.value });
    const binding = { nonce: { secret: randomBytes(32), lifetimeSeconds: 60 } };
    const f = fixture(transport, { deviceBinding: binding }, store, clock);
    const other = fixture(transport, { deviceBinding: binding }, store, clock);
    const call = (proof: string, context = f) =>
      request(context.app).post(`${BASE_PATH}/login`).set('Origin', FRONTEND_ORIGIN).set('DPoP', proof).send({});
    const wrongTarget = await call(proofFor({ claims: { htu: `${BACKEND_ORIGIN}/different` } }));
    expect(wrongTarget.body).toEqual(INVALID_PROOF);
    expect(wrongTarget.headers['dpop-nonce']).toBeUndefined();
    const first = await call(proofFor());
    const second = await call(proofFor(), other);
    expect(first.status).toBe(400);
    expect(first.body).toEqual({ code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'A fresh DPoP nonce is required.' });
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['www-authenticate']).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();
    const nonce = first.headers['dpop-nonce'] as string;
    expect(Buffer.byteLength(nonce)).toBeLessThanOrEqual(512);
    expect(second.headers['dpop-nonce']).not.toBe(nonce);
    expect(f.calls.reserve).not.toHaveBeenCalled();
    expect(f.calls.createTransaction).not.toHaveBeenCalled();
    expect(providerRequests).toEqual([]);
    const accepted = await call(proofFor({ claims: { nonce } }), other);
    expect(accepted.status).toBe(200);
    expect(accepted.headers['dpop-nonce']).toBeUndefined();
    expect((await call(proofFor({ claims: { nonce } }))).status).toBe(200);
    const wrongKey = await call(proofFor({ key: keyB, claims: { nonce } }));
    expect(wrongKey.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    clock.value += 60_000;
    const expired = await call(proofFor({ claims: { nonce, iat: Math.floor(clock.value / 1000) } }));
    expect(expired.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expect(expired.headers['set-cookie']).toBeUndefined();
    expect(f.calls.reserve).toHaveBeenCalledTimes(2);
    expect(f.calls.createTransaction).toHaveBeenCalledTimes(2);
  });

  it.each(['provider error', 'capacity'] as const)(
    'replay %s fails closed with sanitized 503 and no discovery/allocation',
    async (failure) => {
      const store = createMemoryOidcVaultStore({ now: () => NOW, dpopReplayMaxEntries: 1 });
      const f = fixture(transport, {}, store);
      const diagnostic = new Error('private replay provider diagnostic');
      if (failure === 'provider error') f.calls.reserve.mockRejectedValue(diagnostic);
      else {
        const namespace = resolveDpopEffectiveNamespace({
          type: 'vault',
          backendOrigin: BACKEND_ORIGIN,
          basePath: BASE_PATH,
          issuer,
          clientId: 'client_1',
        });
        await store.reserveDpopProof({
          replayKey: createDpopReplayKey(namespace, keyA.jkt, 'already-full'),
          expiresAt: NOW + 60_000,
        });
      }
      const response = await request(f.app)
        .post(`${BASE_PATH}/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('DPoP', proofFor())
        .send({});
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
        message: 'DPoP replay protection is unavailable.',
      });
      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(f.calls.createTransaction).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
      if (failure === 'provider error') expect(f.onError.mock.calls[0][0].error).toHaveProperty('cause', diagnostic);
    },
  );
});

describe.each(TRANSPORTS)('DBJWT-04 callback authority/terminal cleanup (%s)', (transport) => {
  it('feature-disabled middleware rejects a stored bound transaction without spending or clearing its cookie', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const before = await f.store.getAuthorizationTransaction(login.state);
    const disabled = fixture(transport, { deviceBinding: undefined }, f.store);
    providerRequests = [];
    const response = await request(disabled.app)
      .get(`${BASE_PATH}/callback`)
      .set('Cookie', browser.cookieHeader())
      .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'OIDC_VAULT_DPOP_REQUIRED', message: 'DPoP authentication is required.' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(login.state)).toEqual(before);
    expectNoCallbackWork(f);
    expect((await callback(browser, login)).status).toBe(302);
  });

  it.each(['issuer', 'clientId'] as const)(
    'foreign transaction %s fails identity preflight before consume or provider calls',
    async (field) => {
      const f = fixture(transport);
      const browser = createBrowser(f.app);
      const login = await startLogin(f, browser);
      const before = await f.store.getAuthorizationTransaction(login.state);
      await f.store.createAuthorizationTransaction({
        ...before!,
        metadata: {
          ...before?.metadata,
          oidcVaultTransactionProvider: { issuer, clientId: 'client_1', [field]: `${field}-foreign` },
        },
      });
      providerRequests = [];
      const response = await callback(browser, login);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_STATE');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
      expect(await f.store.getAuthorizationTransaction(login.state)).not.toBeNull();
      expectNoCallbackWork(f);
    },
  );

  it('provider error callbacks authenticate state/cookie before consuming and clearing, with a fixed sanitized message', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const before = await f.store.getAuthorizationTransaction(login.state);
    providerRequests = [];
    const wrong = await request(f.app)
      .get(`${BASE_PATH}/callback`)
      .query({ state: login.state, error: 'private-upstream-denial' });
    expect(wrong.body).toEqual(INVALID_BROWSER);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(await f.store.getAuthorizationTransaction(login.state)).toEqual(before);
    const honest = await browser
      .get(`${BASE_PATH}/callback`)
      .query({ state: login.state, error: 'private-upstream-denial' });
    expect(honest.status).toBe(400);
    expect(honest.body).toEqual({ code: 'OIDC_VAULT_CALLBACK_ERROR', message: 'OIDC callback failed.' });
    expect(honest.text).not.toContain('private-upstream-denial');
    expect(cookieLines(honest)).toHaveLength(1);
    expect(cookieLines(honest)[0]).toContain(`${COOKIE_NAME}=; Path=/; SameSite=Lax; HttpOnly; Secure; Max-Age=0;`);
    expect(await f.store.getAuthorizationTransaction(login.state)).toBeNull();
    expect(f.calls.consumeTransaction).toHaveBeenCalledTimes(1);
    expectNoCallbackWork(f);
    expect(f.onError.mock.calls.at(-1)![0].error).toHaveProperty('message', 'private-upstream-denial');
    const replay = await browser
      .get(`${BASE_PATH}/callback`)
      .query({ state: login.state, error: 'private-upstream-denial' });
    expect(replay.body.code).toBe('OIDC_VAULT_INVALID_STATE');
    expect(replay.headers['set-cookie']).toBeUndefined();
  });

  it('callback proof headers are ignored; only state/cookie authenticate a navigation and matching callbacks have one atomic winner', async () => {
    const f = fixture(transport, { deviceBinding: { mode: 'required' } });
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    providerRequests = [];
    const call = () =>
      browser
        .get(`${BASE_PATH}/callback`)
        .set('DPoP', 'invalid-navigation-header')
        .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
    const responses = await Promise.all([call(), call()]);
    expect(responses.map((r) => r.status).sort()).toEqual([302, 400]);
    expect(providerRequests.filter((entry) => entry.path.endsWith('/token'))).toHaveLength(1);
    expect(f.calls.createSession).toHaveBeenCalledTimes(1);
    expect(f.calls.createCode).toHaveBeenCalledTimes(1);
    expect(f.calls.reserve).toHaveBeenCalledTimes(1);
    expect(responses.find((r) => r.status === 400)!.headers['set-cookie']).toBeUndefined();
  });

  it.each(['cookie hash', 'key', 'nonce', 'provider'] as const)(
    'rechecks atomic return after a concurrent %s replacement before upstream use',
    async (field) => {
      const f = fixture(transport);
      const browser = createBrowser(f.app);
      const login = await startLogin(f, browser);
      f.calls.consumeTransaction.mockImplementation(async (input) => {
        const original = (await f.store.getAuthorizationTransaction(input.state))!;
        const replacement = { ...original };
        if (field === 'cookie hash')
          replacement.browserBindingHash = createHash('sha256').update('changed-cookie').digest('base64url');
        if (field === 'key') replacement.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
        if (field === 'nonce') replacement.nonce = 'changed-nonce';
        if (field === 'provider')
          replacement.metadata = {
            oidcVaultTransactionProvider: { issuer: 'https://foreign.example', clientId: 'client_1' },
          };
        await f.store.createAuthorizationTransaction(replacement);
        return f.originals.consumeTransaction(input);
      });
      providerRequests = [];
      const response = await callback(browser, login);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_STATE');
      expect(response.headers['set-cookie']).toBeUndefined();
      expectNoCallbackWork(f);
      if (field === 'key' || field === 'cookie hash')
        expect(await f.store.getAuthorizationTransaction(login.state)).not.toBeNull();
    },
  );

  it('invalid upstream nonce is an authenticated terminal failure: clear the temporary cookie, create no credentials, never reuse state', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    invalidIdNonce = true;
    const response = await callback(browser, login);
    expect(response.status).toBe(502);
    expect(response.body.code).toBe('OIDC_VAULT_INVALID_ID_TOKEN');
    expect(cookieLines(response)[0]).toContain('Max-Age=0');
    expect(f.calls.createSession).not.toHaveBeenCalled();
    expect(f.calls.createCode).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(login.state)).toBeNull();
    invalidIdNonce = false;
    expect((await callback(browser, login)).body.code).toBe('OIDC_VAULT_INVALID_STATE');
    expect(providerRequests.filter((entry) => entry.path.endsWith('/token'))).toHaveLength(1);
  });

  it('a missing frontend destination preflights before guarded consumption/upstream calls', async () => {
    const f = fixture(transport, { frontendRedirectUri: undefined });
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const before = await f.store.getAuthorizationTransaction(login.state);
    providerRequests = [];
    const response = await callback(browser, login);
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expect(await f.store.getAuthorizationTransaction(login.state)).toEqual(before);
    expectNoCallbackWork(f);
  });

  it.each(['remove', 'rebind', 'nested mutation', 'throwing getter'] as const)(
    'restores the initiating binding after a precreate hook tries to %s',
    async (attempt) => {
      const forbidden = vi.fn(() => {
        throw new Error('private forbidden security getter');
      });
      const beforeCreate: NonNullable<OidcVaultHooks['onBeforeSessionCreate']> = ({ session }) => {
        if (!session) throw new Error('Expected session');
        expect(session.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt });
        if (attempt === 'remove') delete session.deviceBinding;
        if (attempt === 'rebind') session.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
        if (attempt === 'nested mutation') session.deviceBinding!.jkt = keyB.jkt;
        if (attempt === 'throwing getter')
          Object.defineProperty(session, 'deviceBinding', { get: forbidden, enumerable: true });
        session.metadata = { application: 'kept' };
        session.sessionId = 'attacker-selected-session';
        session.logicalSessionId = 'attacker-selected-lineage';
        session.provider = { issuer: 'https://foreign.example', clientId: 'foreign-client' };
      };
      const f = fixture(transport, { hooks: { onBeforeSessionCreate: beforeCreate } });
      const browser = createBrowser(f.app);
      const login = await startLogin(f, browser);
      const response = await callback(browser, login);
      expect(response.status).toBe(302);
      const record = await f.store.getExchangeCode(
        new URL(response.headers.location as string).searchParams.get('code')!,
      );
      expect(record?.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt });
      expect(await f.store.getSession(record!.sessionId)).toMatchObject({
        deviceBinding: { type: 'dpop', jkt: keyA.jkt },
        provider: { issuer, clientId: 'client_1' },
        metadata: { application: 'kept' },
      });
      expect(record!.sessionId).not.toBe('attacker-selected-session');
      expect(forbidden).not.toHaveBeenCalled();
    },
  );

  it('postcommit hook mutation cannot rebind the stored session/code or change the captured cookie deadline/destination', async () => {
    const clock = { value: NOW };
    const onSessionCreated: NonNullable<OidcVaultHooks['onSessionCreated']> = ({ session, req, metadata }) => {
      session!.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
      session!.sessionId = 'changed-session';
      session!.provider = { issuer: 'https://changed.example' };
      metadata!.subject = 'changed-subject';
      req.headers.cookie = `${COOKIE_NAME}=${'A'.repeat(43)}`;
      Object.defineProperty(req, 'query', {
        value: { state: 'changed-state', returnTo: 'https://evil.example' },
        configurable: true,
      });
      clock.value += 2500;
    };
    const f = fixture(transport, { hooks: { onSessionCreated } }, undefined, clock);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser, proofFor(), { returnTo: '/original-target' });
    const response = await callback(browser, login);
    expect(response.status).toBe(302);
    const url = new URL(response.headers.location as string);
    expect(url.pathname).toBe('/original-target');
    const code = await f.store.getExchangeCode(url.searchParams.get('code')!);
    expect(await f.store.getSession(code!.sessionId)).toMatchObject({ deviceBinding: { type: 'dpop', jkt: keyA.jkt } });
    expect(cookieLines(response)[0]).toContain(`${COOKIE_NAME}=${login.secret};`);
    expect(cookieLines(response)[0]).toContain('Max-Age=27;');
    expect(code?.expiresAt).toBe(NOW + 30_000);
  });

  it('login hooks cannot change the captured returnTo, selected key, provider URL or cookie; failed persistence sets no cookie', async () => {
    const onLoginStart: NonNullable<OidcVaultHooks['onLoginStart']> = ({ req, metadata }) => {
      req.body.returnTo = 'https://evil.example';
      req.headers.dpop = proofFor({ key: keyB });
      req.originalUrl = '/wrong-target';
      (metadata!.provider as Record<string, unknown>).authorizationEndpoint = 'https://evil.example/auth';
    };
    const f = fixture(transport, { hooks: { onLoginStart } });
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser, proofFor(), { returnTo: '/captured-target' });
    expect(login.url.origin).toBe(new URL(issuer).origin);
    expect(await f.store.getAuthorizationTransaction(login.state)).toMatchObject({
      returnTo: `${FRONTEND_ORIGIN}/captured-target`,
      deviceBinding: { type: 'dpop', jkt: keyA.jkt },
    });
    const diagnostic = new Error('private transaction persistence failure');
    f.calls.createTransaction.mockRejectedValueOnce(diagnostic);
    const response = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({});
    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.onError.mock.calls.at(-1)![0].error).toBe(diagnostic);
  });

  it('a bound precreate veto is terminal and clears only the authenticated temporary cookie without persisting credentials', async () => {
    const diagnostic = new Error('private callback veto');
    const f = fixture(transport, {
      hooks: {
        onBeforeSessionCreate() {
          throw diagnostic;
        },
      },
    });
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const response = await callback(browser, login);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' });
    expect(cookieLines(response)).toHaveLength(1);
    expect(cookieLines(response)[0]).toContain(`${COOKIE_NAME}=;`);
    expect(cookieLines(response)[0]).toContain('Max-Age=0;');
    expect(f.calls.createSession).not.toHaveBeenCalled();
    expect(f.calls.createCode).not.toHaveBeenCalled();
    expect(f.onError.mock.calls.at(-1)![0].error).toBe(diagnostic);
    expect(await f.store.getAuthorizationTransaction(login.state)).toBeNull();
  });

  it('code persistence failure revokes the original new lineage and clears the authenticated cookie after hook ID/key mutation', async () => {
    const diagnostic = new Error('private code failure');
    const f = fixture(transport, {
      hooks: {
        onBeforeSessionCreate({ session }) {
          session!.sessionId = 'hook-session';
          session!.logicalSessionId = 'hook-lineage';
          session!.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
        },
      },
    });
    f.calls.createCode.mockRejectedValueOnce(diagnostic);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const response = await callback(browser, login);
    expect(response.status).toBe(500);
    const created = f.calls.createSession.mock.calls[0][0];
    expect(created.sessionId).toMatch(/^sess_/);
    expect(created.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt });
    expect(f.calls.revoke).toHaveBeenCalledWith({ logicalSessionId: created.sessionId });
    expect(await f.store.getSession(created.sessionId)).toBeNull();
    expect(cookieLines(response)[0]).toContain('Max-Age=0;');
    expect(f.onError.mock.calls.at(-1)![0].error).toBe(diagnostic);
  });

  it('postcommit notification failure leaves the committed original binding/code and retained cookie intact', async () => {
    const diagnostic = new Error('private postcommit observer failure');
    const f = fixture(transport, {
      hooks: {
        onSessionCreated({ session }) {
          session!.deviceBinding = { type: 'dpop', jkt: keyB.jkt };
          throw diagnostic;
        },
      },
    });
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const response = await callback(browser, login);
    expect(response.status).toBe(302);
    const record = await f.store.getExchangeCode(
      new URL(response.headers.location as string).searchParams.get('code')!,
    );
    expect(record?.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt });
    expect(await f.store.getSession(record!.sessionId)).toMatchObject({
      deviceBinding: { type: 'dpop', jkt: keyA.jkt },
    });
    expect(cookieLines(response)[0]).toContain(`${COOKIE_NAME}=${login.secret};`);
    expect(cookieLines(response)[0]).toContain('Max-Age=30;');
    expect(f.calls.revoke).not.toHaveBeenCalled();
    expect(f.onError.mock.calls.at(-1)![0].error).toBe(diagnostic);
  });

  it('mutable error observers cannot replace proof/nonce response authority or no-store headers', async () => {
    const f = fixture(transport, {
      deviceBinding: { nonce: { secret: randomBytes(32) } },
      hooks: {
        onError({ error, res }) {
          Object.assign(error as object, { status: 299, code: 'PRIVATE_OVERRIDE', clientMessage: 'private raw error' });
          res.setHeader('WWW-Authenticate', 'PRIVATE');
          res.setHeader('DPoP-Nonce', 'private raw nonce');
          res.setHeader('Cache-Control', 'public');
        },
      },
    });
    const invalid = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor({ signingKey: keyB }))
      .send({});
    expect(invalid.status).toBe(401);
    expect(invalid.body).toEqual(INVALID_PROOF);
    expect(invalid.headers['www-authenticate']).toBe('DPoP error="invalid_dpop_proof", algs="ES256"');
    expect(invalid.headers['dpop-nonce']).toBeUndefined();
    const nonce = await request(f.app)
      .post(`${BASE_PATH}/login`)
      .set('Origin', FRONTEND_ORIGIN)
      .set('DPoP', proofFor())
      .send({});
    expect(nonce.status).toBe(400);
    expect(nonce.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expect(nonce.headers['dpop-nonce']).toMatch(/^v1\./);
    expect(nonce.headers['www-authenticate']).toBeUndefined();
    expect(nonce.headers['cache-control']).toBe('no-store');
    expect(nonce.headers['set-cookie']).toBeUndefined();
    expect(f.calls.reserve).not.toHaveBeenCalled();
  });
});

describe.each(TRANSPORTS)('DBJWT-04 cookie configuration and deadlines (%s)', (transport) => {
  it.each([
    [BACKEND_ORIGIN, undefined, COOKIE_NAME, true, 'Lax'],
    ['http://localhost:3000', undefined, 'oidc_vault_transaction', false, 'Lax'],
    [BACKEND_ORIGIN, { name: 'custom_transaction', sameSite: 'none' as const }, 'custom_transaction', true, 'None'],
  ])(
    'serializes constrained cookie attributes on %s (%j)',
    async (backendOrigin, transactionCookie, name, secure, sameSite) => {
      const f = fixture(transport, { backendOrigin, transactionCookie });
      const browser = createBrowser(f.app);
      const login = await startLogin(f, browser, proofFor({ claims: { htu: `${backendOrigin}${BASE_PATH}/login` } }));
      expect(login.line.startsWith(`${name}=`)).toBe(true);
      expect(login.line).toContain('Path=/;');
      expect(login.line).toContain('HttpOnly');
      expect(login.line.includes('Secure')).toBe(secure);
      expect(login.line).toContain(`SameSite=${sameSite}`);
      expect(login.line).not.toContain('Domain=');
    },
  );

  it.each([
    null,
    'cookie',
    { name: '' },
    { name: 'bad name' },
    { name: 'bad\nname' },
    { name: 'badname\n' },
    { name: 'badname\r' },
    { name: 'oidc_vault_session' },
    { sameSite: 'strict' },
    { sameSite: null },
    { domain: 'example.com' },
    { path: '/auth' },
    { secure: false },
    { httpOnly: false },
  ])('rejects invalid/security-optout transactionCookie %j before runtime', (transactionCookie) => {
    expect(() =>
      fixture(transport, { transactionCookie: transactionCookie as OidcVaultTransactionCookieOptions }),
    ).toThrow();
    expect(providerRequests).toEqual([]);
  });

  it.each([{ sameSite: 'none' }, { name: '__Host-local' }, { name: '__Secure-local' }])(
    'rejects incompatible HTTP config %j',
    (transactionCookie) => {
      expect(() =>
        fixture(transport, {
          backendOrigin: 'http://localhost:3000',
          transactionCookie: transactionCookie as OidcVaultTransactionCookieOptions,
        }),
      ).toThrow();
    },
  );

  it('snapshots frozen/reused configuration and does not let later option/clock delays extend cookie or record deadlines', async () => {
    const clock = { value: NOW };
    const transactionCookie = { name: 'original_transaction', sameSite: 'lax' as 'lax' | 'none' };
    const f = fixture(
      transport,
      {
        transactionCookie,
        authorizationTransactionTtlMs: 60_999,
        exchangeCodeTtlMs: 10_999,
        hooks: {
          onAuthorizationUrl() {
            clock.value += 1500;
          },
        },
      },
      undefined,
      clock,
    );
    transactionCookie.name = 'later-transaction';
    transactionCookie.sameSite = 'none';
    f.options.transactionCookie = { name: 'replaced-transaction' };
    f.options.authorizationTransactionTtlMs = 99_000_000;
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    const transaction = await f.store.getAuthorizationTransaction(login.state);
    expect(transaction?.expiresAt).toBe(NOW + 60_999);
    expect(login.line).toContain('original_transaction=');
    expect(login.line).toContain('SameSite=Lax');
    expect(login.line).toContain('Max-Age=59;');
    const initialExpires = Date.parse(login.line.match(/Expires=([^;]+)/)![1]);
    expect(initialExpires).toBeLessThanOrEqual(transaction!.expiresAt);
    const response = await callback(browser, login);
    const record = await f.store.getExchangeCode(
      new URL(response.headers.location as string).searchParams.get('code')!,
    );
    expect(record?.expiresAt).toBe(NOW + 1500 + 10_999);
    expect(cookieLines(response)[0]).toContain('Max-Age=10;');
    expect(Date.parse(cookieLines(response)[0].match(/Expires=([^;]+)/)![1])).toBeLessThanOrEqual(record!.expiresAt);
    const frozen = Object.freeze({ name: 'frozen_transaction' });
    const reused = fixture(transport, { transactionCookie: frozen });
    expect((await startLogin(reused, createBrowser(reused.app))).line).toContain('frozen_transaction=');
    expect(frozen).toEqual({ name: 'frozen_transaction' });
  });

  it('one cookie supports one pending browser flow: reinitiation rotates the secret and earlier callback mismatch leaves both records intact', async () => {
    const f = fixture(transport);
    const browser = createBrowser(f.app);
    const first = await startLogin(f, browser);
    const second = await startLogin(f, browser);
    expect(second.secret).not.toBe(first.secret);
    expect(browser.cookieHeader()).toBe(`${COOKIE_NAME}=${second.secret}`);
    expect(cookieLines(second.response)).toHaveLength(1);
    const beforeFirst = await f.store.getAuthorizationTransaction(first.state);
    const beforeSecond = await f.store.getAuthorizationTransaction(second.state);
    providerRequests = [];
    const earlier = await callback(browser, first);
    expect(earlier.body).toEqual(INVALID_BROWSER);
    expect(earlier.headers['set-cookie']).toBeUndefined();
    expect(await f.store.getAuthorizationTransaction(first.state)).toEqual(beforeFirst);
    expect(await f.store.getAuthorizationTransaction(second.state)).toEqual(beforeSecond);
    expectNoCallbackWork(f);
    expect((await callback(browser, second)).status).toBe(302);
  });

  it('validates distinct configured session/transaction names and captures cookie getters only once into a frozen snapshot', async () => {
    expect(() => fixture(transport, { cookie: { name: 'shared' }, transactionCookie: { name: 'shared' } })).toThrow(
      'distinct',
    );
    const name = vi.fn(() => 'getter_transaction');
    const sameSite = vi.fn(() => 'lax' as const);
    const config = Object.freeze({
      get name() {
        return name();
      },
      get sameSite() {
        return sameSite();
      },
    });
    const f = fixture(transport, { transactionCookie: config });
    await startLogin(f, createBrowser(f.app));
    expect(name).toHaveBeenCalledTimes(1);
    expect(sameSite).toHaveBeenCalledTimes(1);
    let sessionNameReads = 0;
    const sessionName = vi.fn(() => (++sessionNameReads === 1 ? 'original_session' : COOKIE_NAME));
    const sessionConfig = {
      get name() {
        return sessionName();
      },
    };
    const original = fixture(transport, { cookie: sessionConfig });
    await startLogin(original, createBrowser(original.app));
    expect(sessionName).toHaveBeenCalledTimes(1);
  });

  it('expires exactly at the transaction deadline without provider work or clearing; subsecond TTL never rounds up', async () => {
    const clock = { value: NOW };
    const f = fixture(transport, { authorizationTransactionTtlMs: 999 }, undefined, clock);
    const browser = createBrowser(f.app);
    const login = await startLogin(f, browser);
    expect(login.line).toContain('Max-Age=0;');
    clock.value = NOW + 999;
    providerRequests = [];
    const response = await request(f.app)
      .get(`${BASE_PATH}/callback`)
      .set('Cookie', `${COOKIE_NAME}=${login.secret}`)
      .query({ state: login.state, code: `authcode:${login.nonce}:honest-user` });
    expect(response.body.code).toBe('OIDC_VAULT_INVALID_STATE');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expectNoCallbackWork(f);
  });
});

const rawRequest = async (app: express.Express, path: string, headers: string[], body = '{}') => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing raw client address');
  try {
    return await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: unknown }>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            method: path.includes('/callback') ? 'GET' : 'POST',
            path,
            headers: [
              'Host',
              `127.0.0.1:${address.port}`,
              'Connection',
              'close',
              'Content-Type',
              'application/json',
              'Content-Length',
              String(Buffer.byteLength(body)),
              ...headers,
            ],
            agent: false,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
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
            res.on('error', reject);
          },
        );
        req.on('error', reject);
        req.end(body);
      },
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

describe.each(TRANSPORTS)('DBJWT-04 raw header multiplicity (%s)', (transport) => {
  it.each(['proof duplicates', 'comma-joined proof', 'Origin duplicates', 'Referer duplicates'] as const)(
    'rejects %s before reservation or allocation',
    async (kind) => {
      const f = fixture(transport);
      const proof = proofFor();
      const headers =
        kind === 'proof duplicates'
          ? ['Origin', FRONTEND_ORIGIN, 'DPoP', proof, 'dPoP', proof]
          : kind === 'comma-joined proof'
            ? ['Origin', FRONTEND_ORIGIN, 'DPoP', `${proof}, ${proof}`]
            : kind === 'Origin duplicates'
              ? ['Origin', FRONTEND_ORIGIN, 'origin', FRONTEND_ORIGIN, 'DPoP', proof]
              : ['Referer', `${FRONTEND_ORIGIN}/one`, 'referer', `${FRONTEND_ORIGIN}/two`, 'DPoP', proof];
      const response = await rawRequest(f.app, `${BASE_PATH}/login`, headers);
      expect(response.status).toBe(kind.includes('proof') ? 401 : 403);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(f.calls.reserve).not.toHaveBeenCalled();
      expect(f.calls.createTransaction).not.toHaveBeenCalled();
      expect(providerRequests).toEqual([]);
    },
  );

  it('rejects duplicate selected names across two raw Cookie fields before callback consumption', async () => {
    const f = fixture(transport);
    const login = await startLogin(f, createBrowser(f.app));
    providerRequests = [];
    const response = await rawRequest(
      f.app,
      `${BASE_PATH}/callback?state=${login.state}&code=authcode:${login.nonce}:honest-user`,
      ['Cookie', `${COOKIE_NAME}=${login.secret}`, 'Cookie', `${COOKIE_NAME}=${login.secret}`],
    );
    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_BROWSER);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.calls.consumeTransaction).not.toHaveBeenCalled();
    expectNoCallbackWork(f);
  });
});
