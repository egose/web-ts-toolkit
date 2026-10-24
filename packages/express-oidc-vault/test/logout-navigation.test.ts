import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, type KeyObject } from 'node:crypto';
import http from 'node:http';

import express from 'express';
import { calculateJwkThumbprint, exportJWK, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  createOidcVaultMiddleware,
  OIDC_VAULT_ROUTE_PATHS,
  OidcVaultStoreConflictError,
  type OidcVaultDpopDiagnosticEvent,
  type OidcVaultHooks,
  type OidcVaultOptions,
  type OidcVaultSession,
  type OidcVaultStoreProvider,
} from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

const ORIGIN = 'https://api.example.com';
const FRONTEND = 'https://app.example.com';
const BASE = '/vault';
const PATH = `${BASE}/logout/navigation`;
const BARE = `${ORIGIN}${PATH}`;
const FALLBACK = `${FRONTEND}/signed-out?static=1`;
const NOW = 1_800_000_000_123;
const INTERNAL = { code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' };
const INVALID = { code: 'OIDC_VAULT_INVALID_DPOP_PROOF', message: 'DPoP proof validation failed.' };
const REQUIRED = { code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', message: 'A device-bound login is required.' };
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('base64url');
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
interface Key {
  privateKey: KeyObject;
  jwk: JWK;
  jkt: string;
}
let key: Key;
let wrongKey: Key;
let issuer: string;
let providerServer: http.Server;
let clock: number;
let providerCalls: string[];
let discoveryFailure: boolean;
let endSessionEndpoint: string | null;
let discoveryWait: ReturnType<typeof deferred> | undefined;
let refreshWait: ReturnType<typeof deferred> | undefined;
let providerEntered: ReturnType<typeof deferred>;

const proof = (input: { key?: Key; route?: string; claims?: Record<string, unknown> } = {}) => {
  const selected = input.key ?? key;
  const value = [
    { typ: 'dpop+jwt', alg: 'ES256', jwk: selected.jwk },
    {
      htm: 'POST',
      htu: `${ORIGIN}${input.route ?? PATH}`,
      iat: Math.floor(clock / 1000),
      jti: randomUUID(),
      ...input.claims,
    },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  return `${value}.${sign('sha256', Buffer.from(value), { key: selected.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};

beforeAll(async () => {
  const makeKey = async (): Promise<Key> => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = await exportJWK(pair.publicKey);
    return { privateKey: pair.privateKey, jwk, jkt: await calculateJwkThumbprint(jwk) };
  };
  key = await makeKey();
  wrongKey = await makeKey();
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  provider.use((req, _res, next) => {
    providerCalls.push(req.path);
    next();
  });
  provider.get('/issuer/.well-known/openid-configuration', async (_req, res) => {
    providerEntered.resolve();
    await discoveryWait?.promise;
    if (discoveryFailure) {
      res.status(503).send('private-discovery-token');
      return;
    }
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      ...(endSessionEndpoint === null ? {} : { end_session_endpoint: endSessionEndpoint }),
    });
  });
  provider.post('/issuer/token', async (_req, res) => {
    providerEntered.resolve();
    await refreshWait?.promise;
    res.json({ token_type: 'Bearer', refresh_token: 'private-next-refresh', expires_in: 3600 });
  });
  providerServer = provider.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => providerServer.once('listening', resolve));
  const address = providerServer.address();
  if (!address || typeof address === 'string') throw new Error('Provider address missing.');
  issuer = `http://127.0.0.1:${address.port}/issuer`;
});
beforeEach(() => {
  vi.restoreAllMocks();
  __resetProviderClientCachesForTests();
  clock = NOW;
  providerCalls = [];
  discoveryFailure = false;
  endSessionEndpoint = `${issuer}/end-session?static=yes`;
  discoveryWait = undefined;
  refreshWait = undefined;
  providerEntered = deferred();
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => providerServer.close((error) => (error ? reject(error) : resolve())));
});

const fixture = (transport: 'body' | 'cookie' = 'body', overrides: Partial<OidcVaultOptions> = {}) => {
  const store = createMemoryOidcVaultStore({ now: () => clock });
  const hooks = {
    onBeforeLogout: vi.fn<NonNullable<OidcVaultHooks['onBeforeLogout']>>(),
    onLogout: vi.fn<NonNullable<OidcVaultHooks['onLogout']>>(),
    onError: vi.fn<NonNullable<OidcVaultHooks['onError']>>(),
  };
  const diagnostics: OidcVaultDpopDiagnosticEvent[] = [];
  const options: OidcVaultOptions = {
    basePath: BASE,
    backendOrigin: ORIGIN,
    frontendRedirectUri: `${FRONTEND}/callback`,
    trustedOrigins: [FRONTEND],
    sessionTransport: transport,
    storeProvider: store,
    cookie: { name: 'selected_session', path: '/vault', domain: 'example.com', sameSite: 'strict' },
    deviceBinding: {},
    logoutNavigation: { fallbackRedirectUri: FALLBACK },
    config: { issuer, clientId: 'client' },
    postLogoutRedirectUri: `${FRONTEND}/provider-return`,
    now: () => clock,
    hooks,
    onDpopDiagnostic: (event) => {
      diagnostics.push(event);
    },
    ...overrides,
  };
  const mount = (changed: Partial<OidcVaultOptions> = {}, before?: express.RequestHandler) => {
    const app = express();
    if (before) app.use(before);
    app.use(createOidcVaultMiddleware({ ...options, ...changed }));
    return app;
  };
  const app = mount();
  const seed = (changes: Partial<OidcVaultSession> = {}) =>
    store.createSession({
      sessionId: 'private-handle',
      logicalSessionId: 'private-lineage',
      subject: 'private-subject',
      refreshToken: 'private-refresh',
      accessToken: 'private-access',
      idToken: 'private-id',
      provider: { issuer, clientId: 'client' },
      deviceBinding: { type: 'dpop', jkt: key.jkt },
      user: { sub: 'private-subject', secret: 'private-profile' },
      metadata: { secret: 'private-metadata' },
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: NOW + 3_600_000,
      ...changes,
    });
  const post = (
    input: {
      app?: express.Express;
      proof?: string | null;
      body?: unknown;
      route?: string;
      origin?: string | null;
      cookie?: string;
    } = {},
  ) => {
    const call = request(input.app ?? app)
      .post(input.route ?? PATH)
      .type('json');
    if (input.origin !== null) call.set('Origin', input.origin ?? FRONTEND);
    if (input.proof !== null) call.set('DPoP', input.proof ?? proof({ route: input.route }));
    if (transport === 'cookie')
      call.set('Cookie', input.cookie ?? 'selected_session=private-handle; oidc_vault_session=decoy');
    const body = input.body === undefined ? (transport === 'body' ? { sessionId: 'private-handle' } : {}) : input.body;
    return call.send(
      typeof body === 'string' || (typeof body === 'object' && body !== null) ? body : JSON.stringify(body),
    );
  };
  return { app, options, mount, seed, post, store, hooks, diagnostics };
};
const pathOf = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};
const expectHeaders = (res: request.Response) => {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
};
const expectFallback = (res: request.Response) => {
  expectHeaders(res);
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe(FALLBACK);
  expect(res.text).toBe('');
  expect(res.headers['set-cookie']).toBeUndefined();
};
const expectClear = (res: request.Response, transport: 'body' | 'cookie') => {
  if (transport === 'body') expect(res.headers['set-cookie']).toBeUndefined();
  else {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain('selected_session=;');
    for (const attribute of ['Path=/vault', 'Domain=example.com', 'SameSite=Strict', 'HttpOnly', 'Secure', 'Max-Age=0'])
      expect(cookies[0]).toContain(attribute);
  }
};

describe.each(['body', 'cookie'] as const)('logout navigation HTTP (%s)', (transport) => {
  it('revokes before ticket persistence, returns only the backend DTO, and consumes across instances exactly once', async () => {
    const f = fixture(transport);
    await f.seed();
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const consume = vi.spyOn(f.store, 'consumeLogoutNavigationTicket');
    const response = await f.post().set('Authorization', 'Bearer expired-irrelevant-jwt');
    expect(response.status).toBe(200);
    expectHeaders(response);
    expectClear(response, transport);
    expect(Object.keys(response.body).sort()).toEqual(['loggedOut', 'navigationUrl']);
    expect(response.body.loggedOut).toBe(true);
    expect(response.body.navigationUrl).toMatch(
      /^https:\/\/api\.example\.com\/vault\/logout\/navigation\?ticket=lnt_[A-Za-z0-9_-]{43}$/,
    );
    const ticket = new URL(response.body.navigationUrl).searchParams.get('ticket')!;
    const record = create.mock.calls[0][0];
    expect(record).toEqual({
      namespace:
        'logout-navigation:v1:' +
        hash(
          JSON.stringify([
            'oidc-vault-logout-navigation',
            1,
            ORIGIN,
            BASE,
            issuer,
            'client',
            'default',
            FALLBACK,
            `${FRONTEND}/provider-return`,
          ]),
        ),
      ticketHash: hash(ticket),
      upstreamLogoutUrl: expect.any(String),
      createdAt: NOW,
      expiresAt: NOW + 60_000,
    });
    expect(Object.keys(record).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'namespace',
      'ticketHash',
      'upstreamLogoutUrl',
    ]);
    expect(JSON.stringify(record)).not.toContain(ticket);
    for (const secret of ['private-', 'id_token_hint', issuer, 'upstreamLogoutUrl'])
      expect(response.text).not.toContain(secret);
    expect(await f.store.getSession('private-handle')).toBeNull();
    expect(f.hooks.onBeforeLogout).toHaveBeenCalledTimes(1);
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    expect(f.hooks.onLogout.mock.calls[0][0]).toMatchObject({ route: 'logout', metadata: undefined });
    expect(f.diagnostics.some((event) => event.operation === 'logout' && event.reason === 'proof-accepted')).toBe(true);
    const beforeGet = f.diagnostics.length;
    const reads = vi.spyOn(f.store, 'getSession');
    const other = f.mount();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(index % 2 ? other : f.app).get(pathOf(response.body.navigationUrl)),
      ),
    );
    const winner = results.filter((res) => res.headers.location !== FALLBACK);
    expect(winner).toHaveLength(1);
    const upstream = new URL(winner[0].headers.location);
    expect(upstream.origin).toBe(new URL(issuer).origin);
    expect(upstream.searchParams.get('id_token_hint')).toBe('private-id');
    expect(upstream.searchParams.get('post_logout_redirect_uri')).toBe(`${FRONTEND}/provider-return`);
    for (const res of results) {
      expectHeaders(res);
      expect(res.status).toBe(302);
      expect(res.text).toBe('');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(consume).toHaveBeenCalledTimes(8);
    expect(reads).not.toHaveBeenCalled();
    expect(f.diagnostics).toHaveLength(beforeGet);
    expect(providerCalls).toEqual(['/issuer/.well-known/openid-configuration']);
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    await f.seed({ sessionId: 'new-login' });
    expectFallback(
      await request(other).get(pathOf(response.body.navigationUrl)).set('Cookie', 'selected_session=new-login'),
    );
    expect(await f.store.getSession('new-login')).not.toBeNull();
  });

  it.each([
    ['missing', (): null => null, 'OIDC_VAULT_DPOP_REQUIRED'],
    ['wrong key', () => proof({ key: wrongKey }), 'OIDC_VAULT_INVALID_DPOP_PROOF'],
    ['wrong target', () => proof({ route: `${BASE}/logout` }), 'OIDC_VAULT_INVALID_DPOP_PROOF'],
    ['stale', () => proof({ claims: { iat: Math.floor(NOW / 1000) - 66 } }), 'OIDC_VAULT_INVALID_DPOP_PROOF'],
    ['malformed', (): string => 'private-bad-proof', 'OIDC_VAULT_INVALID_DPOP_PROOF'],
  ] as const)('rejects %s proof without changing authority', async (_label, value, code) => {
    const f = fixture(transport);
    const original = await f.seed();
    const reserve = vi.spyOn(f.store, 'reserveDpopProof');
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const res = await f.post({ proof: value() });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(code);
    expectHeaders(res);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await f.store.getSession('private-handle')).toEqual(original);
    expect(reserve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
  });

  it.each([null, 'null', 'https://foreign.example', `${FRONTEND}, ${ORIGIN}`])(
    'rejects untrusted source %s before store/proof',
    async (origin) => {
      const f = fixture(transport);
      await f.seed();
      const read = vi.spyOn(f.store, 'getSessionRevocationContext');
      const res = await f.post({ origin });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OIDC_VAULT_UNTRUSTED_ORIGIN');
      expectHeaders(res);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
      expect(await f.store.getSession('private-handle')).not.toBeNull();
    },
  );

  it('uses Referer only in the absence of Origin', async () => {
    const f = fixture(transport);
    await f.seed();
    expect((await f.post({ origin: 'null' }).set('Referer', `${FRONTEND}/page`)).status).toBe(403);
    expect((await f.post({ origin: null }).set('Referer', `${FRONTEND}/page`)).status).toBe(200);
  });

  it.each([{ issuer: 'https://foreign.example' }, { issuer: () => `${issuer}/` }, { clientId: 'foreign' }])(
    'rejects known foreign provider %j without reservation',
    async (provider) => {
      const f = fixture(transport);
      await f.seed({
        provider: {
          ...provider,
          ...(typeof provider.issuer === 'function' ? { issuer: provider.issuer() } : {}),
        } as OidcVaultSession['provider'],
      });
      const reserve = vi.spyOn(f.store, 'reserveDpopProof');
      const res = await f.post();
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('OIDC_VAULT_INVALID_SESSION');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(reserve).not.toHaveBeenCalled();
      expect(await f.store.getSession('private-handle')).not.toBeNull();
      expect(providerCalls).toEqual([]);
    },
  );

  it('retains legacy provider omission authority without backfilling it', async () => {
    const f = fixture(transport);
    await f.seed({ provider: undefined });
    expect((await f.post()).body.navigationUrl).toContain('?ticket=');
    expect(f.hooks.onLogout.mock.calls[0][0].session?.provider).toBeUndefined();
  });

  it('rejects originally unbound live and alias targets even under optional mode; ordinary logout still works', async () => {
    const f = fixture(transport);
    const original = await f.seed({ deviceBinding: undefined });
    const reserve = vi.spyOn(f.store, 'reserveDpopProof');
    expect((await f.post()).body).toEqual(REQUIRED);
    await f.store.rotateSession({
      sessionId: original.sessionId,
      nextSession: { ...original, sessionId: 'successor' },
    });
    expect((await f.post()).body).toEqual(REQUIRED);
    expect(reserve).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
    const local = await f.post({ route: `${BASE}/logout`, proof: null });
    expect(local.status).toBe(200);
    expect(local.body).toEqual({ loggedOut: true });
    expect(await f.store.getSession('successor')).toBeNull();
  });

  it('challenges without reservation and accepts a fresh nonce retry without an access JWT', async () => {
    const f = fixture(transport, { deviceBinding: { nonce: { secret: randomBytes(32) } } });
    await f.seed();
    const reserve = vi.spyOn(f.store, 'reserveDpopProof');
    const firstProof = proof();
    const challenge = await f.post({ proof: firstProof });
    expect(challenge.status).toBe(400);
    expect(challenge.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expectHeaders(challenge);
    expect(challenge.headers['set-cookie']).toBeUndefined();
    expect(reserve).not.toHaveBeenCalled();
    expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
    const fresh = proof({ claims: { nonce: challenge.headers['dpop-nonce'] } });
    const accepted = await f.post({ proof: fresh });
    expect(accepted.status).toBe(200);
    expect(accepted.body.navigationUrl).toContain('?ticket=');
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it('retains proof reservations after veto and rejects replay without deletion or cookie clear', async () => {
    const f = fixture(transport);
    await f.seed();
    const veto = new Error('private-hook-token');
    f.hooks.onBeforeLogout.mockRejectedValueOnce(veto);
    const admitted = proof();
    const first = await f.post({ proof: admitted });
    expect(first.status).toBe(500);
    expect(first.body).toEqual(INTERNAL);
    const replay = await f.post({ proof: admitted });
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual(INVALID);
    for (const res of [first, replay]) {
      expectHeaders(res);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(await f.store.getSession('private-handle')).not.toBeNull();
    expect(f.hooks.onBeforeLogout).toHaveBeenCalledTimes(1);
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
    expect((await f.post()).status).toBe(200);
  });

  it('fails closed on replay backend failure', async () => {
    const f = fixture(transport);
    await f.seed();
    vi.spyOn(f.store, 'reserveDpopProof').mockRejectedValue(new Error('private-replay-token'));
    const res = await f.post();
    expect(res.status).toBe(503);
    expect(res.text).not.toContain('private-');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await f.store.getSession('private-handle')).not.toBeNull();
    expect(providerCalls).toEqual([]);
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
  });

  it('keeps per-check overrides and truthful logout diagnostics', async () => {
    const f = fixture(transport, {
      deviceBinding: { ignoreTargetFailure: true, ignoreFreshnessFailure: true, ignoreReplayFailure: true },
    });
    await f.seed();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(f.store, 'reserveDpopProof').mockRejectedValue(new Error('private-replay-token'));
    const res = await f.post({ proof: proof({ route: '/wrong', claims: { iat: 1 } }) });
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(3);
    for (const stage of ['target', 'freshness', 'replay'])
      expect(f.diagnostics.some((event) => event.stage === stage && event.outcome === 'ignored')).toBe(true);
    expect(JSON.stringify(f.diagnostics)).not.toMatch(/private-|ticket=|id_token_hint/);
  });

  it('aliases revoke only, with no successor credentials, provider calls, ticket or hooks', async () => {
    const f = fixture(transport);
    const original = await f.seed();
    await f.store.rotateSession({
      sessionId: original.sessionId,
      nextSession: { ...original, sessionId: 'successor', idToken: 'successor-secret' },
    });
    const read = vi.spyOn(f.store, 'getSession');
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const res = await f.post();
    expect(res.body).toEqual({ loggedOut: true, navigationUrl: BARE });
    expectClear(res, transport);
    expect(read.mock.calls).toEqual([['private-handle']]);
    expect(await f.store.getSession('successor')).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
    expect(f.hooks.onBeforeLogout).not.toHaveBeenCalled();
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
  });

  it('aliases retain original provider/key checks and cannot revoke with an unrelated proof', async () => {
    const f = fixture(transport);
    const original = await f.seed();
    await f.store.rotateSession({
      sessionId: original.sessionId,
      nextSession: { ...original, sessionId: 'successor' },
    });
    const reserve = vi.spyOn(f.store, 'reserveDpopProof');
    const wrong = await f.post({ proof: proof({ key: wrongKey }) });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(INVALID);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    const foreign = f.mount({ config: { issuer: `${issuer}/`, clientId: 'client' } });
    const rejected = await f.post({ app: foreign });
    expect(rejected.status).toBe(401);
    expect(rejected.body.code).toBe('OIDC_VAULT_INVALID_SESSION');
    expect(reserve).not.toHaveBeenCalled();
    expect(await f.store.getSession('successor')).not.toBeNull();
    expect(providerCalls).toEqual([]);
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
  });

  it('absent and expired targets succeed idempotently without proof reservation/deletion/discovery', async () => {
    const f = fixture(transport);
    await f.seed({ expiresAt: NOW });
    const reserve = vi.spyOn(f.store, 'reserveDpopProof');
    const remove = vi.spyOn(f.store, 'deleteSessionsByLogicalSessionId');
    for (let i = 0; i < 2; i++) {
      const res = await f.post({ proof: 'not-even-a-proof' });
      expect(res.body).toEqual({ loggedOut: true, navigationUrl: BARE });
      expectClear(res, transport);
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
  });

  it.each(['before', 'after-partial'] as const)('never signals logout when deletion rejects %s', async (when) => {
    const f = fixture(transport);
    await f.seed();
    await f.seed({ sessionId: 'other-member' });
    const remove = f.store.deleteSessionsByLogicalSessionId.bind(f.store);
    vi.spyOn(f.store, 'deleteSessionsByLogicalSessionId').mockImplementation(async (input) => {
      if (when === 'after-partial') await remove(input);
      throw new Error('private-alias-cleanup-token');
    });
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const res = await f.post();
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL);
    expectHeaders(res);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.navigationUrl).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
    expect(await f.store.getSession('private-handle')).toEqual(when === 'before' ? expect.any(Object) : null);
  });

  it('holds all ticket/provider work until deletion resolves, including a legitimate zero-count race', async () => {
    const f = fixture(transport);
    await f.seed();
    const entered = deferred();
    const release = deferred();
    const remove = f.store.deleteSessionsByLogicalSessionId.bind(f.store);
    vi.spyOn(f.store, 'deleteSessionsByLogicalSessionId').mockImplementation(async (input) => {
      await remove(input);
      entered.resolve();
      await release.promise;
      return 0;
    });
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const pending = f.post().then((res) => res);
    await entered.promise;
    try {
      expect(create).not.toHaveBeenCalled();
      expect(providerCalls).toEqual([]);
      expect(f.hooks.onLogout).not.toHaveBeenCalled();
      expectFallback(await request(f.app).get(PATH));
    } finally {
      release.resolve();
    }
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body.navigationUrl).toContain('?ticket=');
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
  });

  it('rechecks original context and cannot let mutable hooks replace lineage, key, hint or return policy', async () => {
    const f = fixture(transport);
    await f.seed();
    await f.seed({ sessionId: 'unrelated', logicalSessionId: 'other' });
    f.hooks.onBeforeLogout.mockImplementation(({ session, req }) => {
      Object.assign(session!, {
        logicalSessionId: 'other',
        idToken: 'attacker-id',
        deviceBinding: { type: 'dpop', jkt: wrongKey.jkt },
      });
      req.body.redirect = true;
      f.options.postLogoutRedirectUri = 'https://attacker.example';
    });
    const res = await f.post();
    const get = await request(f.app).get(pathOf(res.body.navigationUrl));
    const upstream = new URL(get.headers.location);
    expect(upstream.searchParams.get('id_token_hint')).toBe('private-id');
    expect(upstream.searchParams.get('post_logout_redirect_uri')).toBe(`${FRONTEND}/provider-return`);
    expect(await f.store.getSession('unrelated')).not.toBeNull();
    expect(f.hooks.onLogout.mock.calls[0][0].session?.idToken).toBe('private-id');
  });

  it.each(['changed', 'absent'] as const)('handles %s context at the post-proof recheck', async (state) => {
    const f = fixture(transport);
    await f.seed();
    const get = f.store.getSessionRevocationContext.bind(f.store);
    const context = await get('private-handle');
    vi.spyOn(f.store, 'getSessionRevocationContext')
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce(state === 'absent' ? null : { ...context!, logicalSessionId: 'other' });
    const remove = vi.spyOn(f.store, 'deleteSessionsByLogicalSessionId');
    const res = await f.post();
    expect(res.status).toBe(state === 'absent' ? 200 : 401);
    if (state === 'absent') {
      expect(res.body.navigationUrl).toBe(BARE);
      expectClear(res, transport);
    } else expect(res.headers['set-cookie']).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
    expect(f.hooks.onLogout).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
  });

  it.each([
    'discovery',
    'ticket-before',
    'ticket-ambiguous',
    'collisions',
    'missing-hint',
    'missing-endpoint',
    'invalid-endpoint',
    'oversized-hint',
  ] as const)('retains committed local logout and one live notification on %s', async (failure) => {
    const f = fixture(transport);
    await f.seed({
      ...(failure === 'missing-hint' ? { idToken: '' } : {}),
      ...(failure === 'oversized-hint' ? { idToken: 'x'.repeat(16_384) } : {}),
    });
    const savedCreate = f.store.createLogoutNavigationTicket.bind(f.store);
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    if (failure === 'discovery') discoveryFailure = true;
    if (failure === 'missing-endpoint') endSessionEndpoint = null;
    if (failure === 'invalid-endpoint') endSessionEndpoint = 'https://user:secret@provider.example/end#fragment';
    if (failure === 'ticket-before') create.mockRejectedValue(new Error('private-storage-token'));
    if (failure === 'ticket-ambiguous')
      create.mockImplementation(async (record) => {
        await savedCreate(record);
        throw new Error('private-ack-token');
      });
    if (failure === 'collisions') create.mockRejectedValue(new OidcVaultStoreConflictError('private-conflict-token'));
    const res = await f.post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ loggedOut: true, navigationUrl: BARE });
    expectClear(res, transport);
    expectHeaders(res);
    expect(await f.store.getSession('private-handle')).toBeNull();
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    const noError = failure === 'missing-hint' || failure === 'missing-endpoint';
    expect(f.hooks.onError).toHaveBeenCalledTimes(noError ? 0 : 1);
    expect(create).toHaveBeenCalledTimes(failure === 'collisions' ? 3 : failure.startsWith('ticket-') ? 1 : 0);
    if (failure === 'collisions') expect(new Set(create.mock.calls.map(([record]) => record.ticketHash)).size).toBe(3);
    if (failure === 'missing-hint') expect(providerCalls).toEqual([]);
    expectFallback(await request(f.app).get(PATH));
    expect(res.text).not.toMatch(/private-|id_token_hint|upstreamLogoutUrl/);
  });

  it('retries only definite collisions, with independent entropy and one sampled deadline', async () => {
    const f = fixture(transport);
    await f.seed();
    const savedCreate = f.store.createLogoutNavigationTicket.bind(f.store);
    const create = vi
      .spyOn(f.store, 'createLogoutNavigationTicket')
      .mockRejectedValueOnce(new OidcVaultStoreConflictError())
      .mockRejectedValueOnce({ name: 'OidcVaultStoreConflictError' })
      .mockImplementation(savedCreate);
    const res = await f.post();
    expect(res.body.navigationUrl).toContain('?ticket=');
    expect(create).toHaveBeenCalledTimes(3);
    expect(new Set(create.mock.calls.map(([record]) => record.ticketHash)).size).toBe(3);
    for (const [record] of create.mock.calls) {
      expect(record.createdAt).toBe(NOW);
      expect(record.expiresAt).toBe(NOW + 60_000);
    }
  });

  it('samples ticket lifetime after discovery and falls back on a failed late clock', async () => {
    const f = fixture(transport);
    await f.seed();
    discoveryWait = deferred();
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const pending = f.post().then((res) => res);
    await providerEntered.promise;
    clock += 45_000;
    discoveryWait.resolve();
    expect((await pending).status).toBe(200);
    expect(create.mock.calls[0][0]).toMatchObject({ createdAt: NOW + 45_000, expiresAt: NOW + 105_000 });
    __resetProviderClientCachesForTests();
    await f.seed();
    discoveryWait = deferred();
    providerEntered = deferred();
    const second = f.post().then((res) => res);
    await providerEntered.promise;
    clock = NaN;
    discoveryWait.resolve();
    const res = await second;
    expect(res.body.navigationUrl).toBe(BARE);
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('post-hook and error observers cannot undo ticket or local commits', async () => {
    const f = fixture(transport);
    await f.seed();
    f.hooks.onLogout.mockRejectedValue(new Error('private-observer-token'));
    f.hooks.onError.mockRejectedValue(new Error('private-error-observer-token'));
    const res = await f.post();
    expect(res.status).toBe(200);
    expect(res.body.navigationUrl).toContain('?ticket=');
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    expect(f.hooks.onError).toHaveBeenCalledTimes(1);
    expect((await request(f.app).get(pathOf(res.body.navigationUrl))).headers.location).not.toBe(FALLBACK);
  });

  it('refresh begun before logout cannot rotate credentials back into the revoked lineage', async () => {
    const f = fixture(transport);
    await f.seed();
    refreshWait = deferred();
    const refreshing = f.post({ route: `${BASE}/refresh` }).then((res) => res);
    await providerEntered.promise; // discovery may arrive before the actual refresh request
    await vi.waitFor(() => expect(providerCalls).toContain('/issuer/token'));
    const loggedOut = await f.post();
    expect(loggedOut.status).toBe(200);
    refreshWait.resolve();
    const refreshed = await refreshing;
    expect(refreshed.status).toBe(401);
    expect(refreshed.body.code).toBe('OIDC_VAULT_INVALID_SESSION');
    expect(refreshed.body.sessionId).toBeUndefined();
    expect(await f.store.getSession('private-handle')).toBeNull();
    expect(await f.store.getSessionRevocationContext('private-handle')).toBeNull();
    expect((await request(f.app).get(pathOf(loggedOut.body.navigationUrl))).status).toBe(302);
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
  });

  it('logout holding original live authority revokes a concurrent rotation using its original hint', async () => {
    const f = fixture(transport);
    const original = await f.seed();
    f.hooks.onBeforeLogout.mockImplementation(async () => {
      await f.store.rotateSession({
        sessionId: original.sessionId,
        nextSession: { ...original, sessionId: 'successor', idToken: 'successor-hint' },
      });
    });
    const res = await f.post();
    expect(res.status).toBe(200);
    expect(await f.store.getSession('successor')).toBeNull();
    const upstream = new URL((await request(f.app).get(pathOf(res.body.navigationUrl))).headers.location);
    expect(upstream.searchParams.get('id_token_hint')).toBe('private-id');
  });

  it('keeps ordinary local/redirected POST behavior and never creates tickets for those routes', async () => {
    const f = fixture(transport);
    await f.seed();
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const local = await f.post({ route: `${BASE}/logout`, body: { sessionId: 'private-handle' } });
    expect(local.status).toBe(200);
    expect(local.body).toEqual({ loggedOut: true });
    expect(providerCalls).toEqual([]);
    expect(local.headers['referrer-policy']).toBeUndefined();
    await f.seed();
    const redirected = await f.post({ route: `${BASE}/logout`, body: { sessionId: 'private-handle', redirect: true } });
    expect(redirected.status).toBe(302);
    expect(redirected.headers.location).toContain('id_token_hint=private-id');
    expect(create).not.toHaveBeenCalled();
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(2);
  });
});

describe('navigation parsing, isolation, configuration and delivery', () => {
  it.each([
    [],
    null,
    'text',
    3,
    false,
    { redirect: true },
    { returnTo: 'https://evil.example' },
    { sessionId: 3 },
    { accessToken: 'private' },
  ])('rejects unsupported JSON shape %j without store work', async (body) => {
    const f = fixture();
    await f.seed();
    const read = vi.spyOn(f.store, 'getSessionRevocationContext');
    const res = await f.post({ body: JSON.stringify(body) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OIDC_VAULT_INVALID_REQUEST_BODY');
    expectHeaders(res);
    expect(read).not.toHaveBeenCalled();
    expect(res.text).not.toContain('evil.example');
  });
  it.each(['body', 'cookie'] as const)(
    'requires the selected %s handle, ignores query destinations and body-cookie substitution',
    async (transport) => {
      const f = fixture(transport);
      await f.seed();
      const missing = await f.post({
        body: {},
        ...(transport === 'cookie' ? { cookie: 'oidc_vault_session=private-handle' } : {}),
      });
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe('OIDC_VAULT_MISSING_SESSION_ID');
      expect(await f.store.getSession('private-handle')).not.toBeNull();
      const res = await f.post({
        route: `${PATH}?returnTo=https://evil.example&redirect=true`,
        body: { sessionId: transport === 'cookie' ? 'other' : 'private-handle' },
      });
      expect(res.status).toBe(200);
      expect(res.body.navigationUrl).toContain('?ticket=');
    },
  );
  it.each(['application/x-www-form-urlencoded', 'text/plain', 'application/octet-stream'])(
    'rejects %s before form parsing',
    async (media) => {
      const f = fixture();
      const read = vi.spyOn(f.store, 'getSession');
      const res = await request(f.app)
        .post(PATH)
        .set('Origin', FRONTEND)
        .set('Content-Type', media)
        .send('sessionId=private&x='.repeat(2000));
      expect(res.status).toBe(415);
      expect(res.body.code).toBe('OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE');
      expectHeaders(res);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('applies feature headers to malformed/oversized JSON and never includes parser input', async () => {
    const f = fixture();
    for (const [body, status, code] of [
      ['{"private-token":', 400, 'OIDC_VAULT_MALFORMED_REQUEST_BODY'],
      [JSON.stringify({ secret: 'private-token'.repeat(2000) }), 413, 'OIDC_VAULT_REQUEST_BODY_TOO_LARGE'],
    ] as const) {
      const res = await request(f.app).post(PATH).set('Origin', FRONTEND).type('json').send(body);
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expectHeaders(res);
      expect(res.text).not.toContain('private-token');
    }
  });
  it.each(['origin', 'referer'] as const)('rejects actual duplicate raw %s headers before store work', async (name) => {
    const f = fixture();
    const read = vi.spyOn(f.store, 'getSession');
    const server = f.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Address missing.');
    try {
      const result = await new Promise<{ status?: number; body: unknown }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path: PATH,
            method: 'POST',
            headers: [
              'Host',
              'api.example.com',
              'Connection',
              'close',
              'Content-Type',
              'application/json',
              name,
              FRONTEND,
              name,
              FRONTEND,
            ],
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
              } catch (error) {
                reject(error);
              }
            });
          },
        );
        req.on('error', reject);
        req.end('{}');
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ code: 'OIDC_VAULT_UNTRUSTED_ORIGIN' });
      expect(read).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each([
    '',
    '?',
    '?ticket=',
    '?ticket=bad',
    `?ticket=lnt_${'A'.repeat(42)}B`,
    `?ticket=lnt_${'A'.repeat(43)}=`,
    `?ticket=lnt_${'A'.repeat(43)}&ticket=lnt_${'A'.repeat(43)}`,
    `?ticket=lnt_${'A'.repeat(43)}&x=1`,
    `?%74icket=lnt_${'A'.repeat(43)}`,
    `?ticket=lnt_%41${'A'.repeat(42)}`,
    '?returnTo=https://evil.example',
  ])('malformed/missing GET query %s uses fixed fallback without store work', async (query) => {
    const f = fixture();
    const consume = vi.spyOn(f.store, 'consumeLogoutNavigationTicket');
    expectFallback(await request(f.app).get(PATH + query));
    expect(consume).not.toHaveBeenCalled();
  });
  it('unknown and exact-expiry tickets fall back without session work', async () => {
    const f = fixture();
    await f.seed();
    const res = await f.post();
    const read = vi.spyOn(f.store, 'getSession');
    expectFallback(await request(f.app).get(`${PATH}?ticket=lnt_${randomBytes(32).toString('base64url')}`));
    clock += 60_000;
    expectFallback(await request(f.app).get(pathOf(res.body.navigationUrl)));
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['issuer', 'client', 'origin', 'mount', 'namespace', 'fallback', 'return'] as const)(
    'isolates tickets by exact %s scope',
    async (field) => {
      const f = fixture();
      await f.seed();
      const res = await f.post();
      const changes: Partial<OidcVaultOptions> = {
        ...(field === 'issuer' ? { config: { issuer: `${issuer}/`, clientId: 'client' } } : {}),
        ...(field === 'client' ? { config: { issuer, clientId: 'other' } } : {}),
        ...(field === 'origin'
          ? { backendOrigin: 'https://other.example', logoutNavigation: { fallbackRedirectUri: FALLBACK } }
          : {}),
        ...(field === 'mount' ? { basePath: '/other' } : {}),
        ...(field === 'namespace' ? { logoutNavigation: { fallbackRedirectUri: FALLBACK, namespace: 'other' } } : {}),
        ...(field === 'fallback' ? { logoutNavigation: { fallbackRedirectUri: `${FALLBACK}&policy=other` } } : {}),
        ...(field === 'return' ? { postLogoutRedirectUri: `${FRONTEND}/other-return` } : {}),
      };
      const other = f.mount(changes);
      const path =
        field === 'mount' ? pathOf(res.body.navigationUrl).replace(BASE, '/other') : pathOf(res.body.navigationUrl);
      const foreign = await request(other).get(path);
      expect(foreign.headers.location).toBe(field === 'fallback' ? `${FALLBACK}&policy=other` : FALLBACK);
      const honest = await request(f.app).get(pathOf(res.body.navigationUrl));
      expect(honest.headers.location).toContain('id_token_hint=');
    },
  );
  it.each(['head', 'put', 'patch', 'delete', 'options'] as const)(
    '%s never spends a ticket; HEAD rejects before GET/body parsing',
    async (method) => {
      const f = fixture();
      await f.seed();
      const res = await f.post();
      const consume = vi.spyOn(f.store, 'consumeLogoutNavigationTicket');
      const called = await request(f.app)[method](pathOf(res.body.navigationUrl)).type('json').send('{broken');
      if (method === 'head') {
        expect(called.status).toBe(405);
        expect(called.headers.allow).toBe('GET, POST');
      }
      expect(consume).not.toHaveBeenCalled();
      const get = await request(f.app).get(pathOf(res.body.navigationUrl)).type('json').send('{broken');
      expect(get.status).toBe(302);
      expect(get.headers.location).toContain('id_token_hint=');
    },
  );
  it('preserves caller-owned CORS preflight', async () => {
    const f = fixture();
    const app = express();
    app.options(PATH, (_req, res) => {
      res.set('Access-Control-Allow-Origin', FRONTEND).status(204).end();
    });
    app.use(createOidcVaultMiddleware(f.options));
    const consume = vi.spyOn(f.store, 'consumeLogoutNavigationTicket');
    const res = await request(app).options(PATH).set('Origin', FRONTEND);
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
    expect(consume).not.toHaveBeenCalled();
  });

  it('cannot write upstream Location before the atomic consume resolves', async () => {
    const f = fixture();
    await f.seed();
    const res = await f.post();
    const entered = deferred();
    const release = deferred();
    const consume = f.store.consumeLogoutNavigationTicket.bind(f.store);
    vi.spyOn(f.store, 'consumeLogoutNavigationTicket').mockImplementation(async (input) => {
      const record = await consume(input);
      entered.resolve();
      await release.promise;
      return record;
    });
    let delivered = false;
    const pending = request(f.app)
      .get(pathOf(res.body.navigationUrl))
      .then((response) => {
        delivered = true;
        return response;
      });
    await entered.promise;
    try {
      expect(delivered).toBe(false);
    } finally {
      release.resolve();
    }
    expect((await pending).headers.location).toContain('id_token_hint=');
    expectFallback(await request(f.app).get(pathOf(res.body.navigationUrl)));
  });

  it('preserves selected-cookie first-match authority and ignores malformed unrelated cookies', async () => {
    const f = fixture('cookie');
    await f.seed();
    const res = await f.post({ cookie: 'unrelated=%ZZ; selected_session=private-handle; selected_session=%ZZ' });
    expect(res.status).toBe(200);
    expectClear(res, 'cookie');
    await f.seed();
    const invalid = await f.post({ cookie: 'selected_session=%ZZ; selected_session=private-handle' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('OIDC_VAULT_MALFORMED_SESSION_COOKIE');
    expect(invalid.headers['set-cookie']).toBeUndefined();
    expect(await f.store.getSession('private-handle')).not.toBeNull();
  });

  it('clears a configured __Host- session with its exact host-only security attributes', async () => {
    const f = fixture('cookie', { cookie: { name: '__Host-app_session', path: '/', sameSite: 'none' } });
    await f.seed();
    const res = await f.post({ cookie: '__Host-app_session=private-handle' });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    for (const value of ['__Host-app_session=;', 'Path=/', 'Secure', 'HttpOnly', 'SameSite=None', 'Max-Age=0'])
      expect(cookie).toContain(value);
    expect(cookie).not.toContain('Domain=');
  });

  it.each([
    'throw-before',
    'throw-after',
    'wrong-namespace',
    'wrong-hash',
    'expired',
    'bad-ttl',
    'bad-clock',
    'userinfo',
    'fragment',
    'backslash',
    'control',
    'oversize',
    'extra',
    'undefined',
  ] as const)(
    'custom consume %s cannot manufacture authority; errors are private and consumption is never retried',
    async (failure) => {
      const f = fixture();
      await f.seed();
      const res = await f.post();
      const consume = f.store.consumeLogoutNavigationTicket.bind(f.store);
      const spy = vi.spyOn(f.store, 'consumeLogoutNavigationTicket').mockImplementation(async (input) => {
        if (failure === 'throw-before') throw new Error('private-store-before');
        const original = await consume(input);
        if (!original) return original;
        if (failure === 'throw-after') throw new Error('private-store-after');
        if (failure === 'undefined') return undefined as unknown as null;
        if (failure === 'bad-clock') clock = NaN;
        const changes = {
          ...(failure === 'wrong-namespace' ? { namespace: 'foreign' } : {}),
          ...(failure === 'wrong-hash' ? { ticketHash: hash('foreign') } : {}),
          ...(failure === 'expired' ? { expiresAt: NOW } : {}),
          ...(failure === 'bad-ttl' ? { expiresAt: NOW + 120_001 } : {}),
          ...(failure === 'userinfo' ? { upstreamLogoutUrl: 'https://user:secret@evil.example' } : {}),
          ...(failure === 'fragment' ? { upstreamLogoutUrl: 'https://evil.example/#secret' } : {}),
          ...(failure === 'backslash' ? { upstreamLogoutUrl: 'https://evil.example\\@safe.example' } : {}),
          ...(failure === 'control' ? { upstreamLogoutUrl: 'https://safe.example/\nsecret' } : {}),
          ...(failure === 'oversize' ? { upstreamLogoutUrl: `https://safe.example/${'x'.repeat(16_384)}` } : {}),
          ...(failure === 'extra' ? { idToken: 'private-extra' } : {}),
        };
        return { ...original, ...changes };
      });
      expectFallback(await request(f.app).get(pathOf(res.body.navigationUrl)));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(f.hooks.onError).toHaveBeenCalledTimes(1);
      expect(f.hooks.onError.mock.calls[0][0]).toMatchObject({
        route: 'logout',
        session: undefined,
        metadata: undefined,
      });
      clock = NOW;
      spy.mockImplementation(consume);
      const retry = await request(f.app).get(pathOf(res.body.navigationUrl));
      if (failure === 'throw-before') expect(retry.headers.location).toContain('id_token_hint=');
      else expectFallback(retry);
      expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    },
  );

  it('a lost POST response leaves revocation/ticket committed; explicit retry cannot recover the grant', async () => {
    const f = fixture('cookie');
    await f.seed();
    const lost = f.mount({}, (_req, res, next) => {
      res.json = (() => {
        res.destroy();
        return res;
      }) as typeof res.json;
      next();
    });
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    await expect(f.post({ app: lost })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
    expect(await f.store.getSession('private-handle')).toBeNull();
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    const retry = await f.post();
    expect(retry.body).toEqual({ loggedOut: true, navigationUrl: BARE });
    expect(create).toHaveBeenCalledTimes(1);
    // Only hash/URL survived. There is no API that recovers the undelivered secret.
    clock += 60_000;
    expect(await f.store.consumeLogoutNavigationTicket(create.mock.calls[0][0])).toBeNull();
  });
  it('a lost GET response burns the consumed grant', async () => {
    const f = fixture();
    await f.seed();
    const res = await f.post();
    const lost = f.mount({}, (req, response, next) => {
      if (req.method === 'GET')
        response.end = (() => {
          response.destroy();
          return response;
        }) as typeof response.end;
      next();
    });
    await expect(request(lost).get(pathOf(res.body.navigationUrl))).rejects.toThrow();
    expectFallback(await request(f.app).get(pathOf(res.body.navigationUrl)));
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
  });
  it('cookie preparation failure retains revocation, not success or a grant, and notifies once', async () => {
    const f = fixture('cookie');
    await f.seed();
    const app = f.mount({}, (_req, res, next) => {
      const append = res.append.bind(res);
      res.append = (name, value) => {
        if (name === 'Set-Cookie') throw new Error('private-cookie-failure');
        return append(name, value);
      };
      next();
    });
    const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
    const res = await f.post({ app });
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL);
    expect(await f.store.getSession('private-handle')).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(providerCalls).toEqual([]);
    expect(f.hooks.onLogout).toHaveBeenCalledTimes(1);
    expect(f.hooks.onError).toHaveBeenCalledTimes(1);
  });

  it.each([null, true, [], new Date()])('rejects nonplain logoutNavigation %j', (value) => {
    const f = fixture();
    expect(() => createOidcVaultMiddleware({ ...f.options, logoutNavigation: value as never })).toThrow(
      /logoutNavigation/,
    );
  });
  it.each([0, 999, 120_001, 1000.5, NaN, Infinity, null, '60000'])('rejects invalid TTL %s', (ticketTtlMs) => {
    const f = fixture();
    expect(() =>
      f.mount({ logoutNavigation: { fallbackRedirectUri: FALLBACK, ticketTtlMs: ticketTtlMs as number } }),
    ).toThrow(/logoutNavigation.ticketTtlMs/);
  });
  it.each(['', 'space label', 'é', '\n', 'x'.repeat(129), null])('rejects invalid namespace %j', (namespace) => {
    const f = fixture();
    expect(() =>
      f.mount({ logoutNavigation: { fallbackRedirectUri: FALLBACK, namespace: namespace as string } }),
    ).toThrow(/logoutNavigation.namespace/);
  });
  it.each([
    'https://evil.example/out',
    `${BARE}?loop=1`,
    `${BARE}/`,
    `${ORIGIN}/VAULT/LOGOUT/NAVIGATION?loop=1`,
    'http://app.example.com/out',
    '//app.example.com/out',
    'javascript:alert(1)',
    `${FRONTEND}/out#`,
    `${FRONTEND}/out#secret`,
    `https://user:pass@app.example.com/out`,
    `${FRONTEND}/out\n`,
    `${FRONTEND}/out\\evil`,
    `${FRONTEND}/${'x'.repeat(2048)}`,
  ])('rejects malicious fallback %s', (fallbackRedirectUri) => {
    const f = fixture();
    expect(() => f.mount({ logoutNavigation: { fallbackRedirectUri } })).toThrow(
      /logoutNavigation.fallbackRedirectUri/,
    );
  });
  it('trustedOrigins never grants redirect destination authority', () => {
    const f = fixture();
    expect(() =>
      f.mount({
        trustedOrigins: ['https://evil.example'],
        logoutNavigation: { fallbackRedirectUri: 'https://evil.example/out' },
      }),
    ).toThrow(/logoutNavigation.fallbackRedirectUri/);
  });
  it.each([
    'https://user:pass@provider.example/out',
    'http://provider.example/out',
    'https://provider.example/out#',
    'https://provider.example/out\n',
    `https://provider.example/${'x'.repeat(2048)}`,
  ])('validates configured provider return URI %s only when enabled', (postLogoutRedirectUri) => {
    const f = fixture();
    expect(() => f.mount({ postLogoutRedirectUri })).toThrow(/logoutNavigation.postLogoutRedirectUri/);
    expect(() => f.mount({ postLogoutRedirectUri, logoutNavigation: undefined })).not.toThrow();
  });
  it.each([1000, 120_000])(
    'accepts TTL boundary %s and snapshots all navigation authority against mutation',
    async (ticketTtlMs) => {
      const f = fixture();
      await f.seed();
      const navigation = { fallbackRedirectUri: `${ORIGIN}/out`, ticketTtlMs, namespace: 'snap' };
      const options = { ...f.options, basePath: 'vault/', logoutNavigation: navigation };
      const app = express();
      app.use(createOidcVaultMiddleware(options));
      navigation.fallbackRedirectUri = 'https://evil.example/out';
      navigation.ticketTtlMs = 1;
      navigation.namespace = 'changed';
      options.postLogoutRedirectUri = 'https://evil.example/out';
      options.config!.clientId = 'changed';
      options.basePath = '/changed';
      const create = vi.spyOn(f.store, 'createLogoutNavigationTicket');
      const res = await f.post({ app });
      expect(res.status).toBe(200);
      expect(create.mock.calls[0][0]).toMatchObject({
        createdAt: NOW,
        expiresAt: NOW + ticketTtlMs,
        namespace:
          'logout-navigation:v1:' +
          hash(
            JSON.stringify([
              'oidc-vault-logout-navigation',
              1,
              ORIGIN,
              BASE,
              issuer,
              'client',
              'snap',
              `${ORIGIN}/out`,
              `${FRONTEND}/provider-return`,
            ]),
          ),
      });
      expect((await request(app).get(PATH)).headers.location).toBe(`${ORIGIN}/out`);
    },
  );
  it('allows loopback development destinations and normalizes once', () => {
    const f = fixture();
    expect(() =>
      f.mount({
        backendOrigin: 'http://127.0.0.1:8080',
        frontendRedirectUri: 'http://localhost:4200/callback',
        postLogoutRedirectUri: 'http://[::1]:4200/out',
        logoutNavigation: { fallbackRedirectUri: 'http://localhost:4200/a/../out' },
      }),
    ).not.toThrow();
  });
  it.each([
    'deviceBinding',
    'createLogoutNavigationTicket',
    'consumeLogoutNavigationTicket',
    'getSessionRevocationContext',
    'reserveDpopProof',
    'getAuthorizationTransaction',
    'consumeAuthorizationTransactionIfMatches',
    'getExchangeCode',
    'consumeExchangeCodeIfMatches',
  ] as const)('fails synchronously on missing %s with a feature-specific message', (capability) => {
    const f = fixture();
    const store: OidcVaultStoreProvider = Object.create(f.store);
    if (capability !== 'deviceBinding') Object.defineProperty(store, capability, { value: undefined });
    expect(() =>
      f.mount({ storeProvider: store, ...(capability === 'deviceBinding' ? { deviceBinding: undefined } : {}) }),
    ).toThrow(new RegExp(`logoutNavigation.*${capability}`));
  });
  it('validates construction clock arithmetic and late ticket arithmetic without extending expiry', () => {
    const f = fixture();
    expect(() =>
      f.mount({
        now: () => 8_640_000_000_000_000 - 1000,
        authorizationTransactionTtlMs: 1,
        exchangeCodeTtlMs: 1,
        logoutNavigation: { fallbackRedirectUri: FALLBACK, ticketTtlMs: 1001 },
      }),
    ).toThrow(/logoutNavigation.ticketTtlMs/);
  });
  it('disabled legacy custom stores have no new capability checks or routes and retain ordinary logout', async () => {
    const f = fixture();
    await f.seed({ deviceBinding: undefined });
    const store: OidcVaultStoreProvider = Object.create(f.store);
    for (const name of [
      'createLogoutNavigationTicket',
      'consumeLogoutNavigationTicket',
      'getSessionRevocationContext',
      'reserveDpopProof',
      'getAuthorizationTransaction',
      'consumeAuthorizationTransactionIfMatches',
      'getExchangeCode',
      'consumeExchangeCodeIfMatches',
    ] as const)
      Object.defineProperty(store, name, { value: undefined });
    const app = f.mount({ logoutNavigation: undefined, deviceBinding: undefined, storeProvider: store });
    expect((await request(app).get(PATH)).status).toBe(404);
    expect((await f.post({ app })).status).toBe(404);
    const res = await f.post({ app, route: `${BASE}/logout`, proof: null });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ loggedOut: true });
    expect(res.headers['referrer-policy']).toBeUndefined();
    expect(OIDC_VAULT_ROUTE_PATHS['logout-navigation']).toBe('/logout/navigation');
  });
});
