import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware, type OidcVaultOptions } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

const MAX_EPOCH_MS = 8_640_000_000_000_000;
const START = 1_800_000_000_000;
const SESSION_TTL = 60_000;

describe('OVH-03 absolute session lifetime', () => {
  let issuer = '';
  let server: http.Server;
  let providerCalls = 0;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'lifetime-key' };
    const provider = express();
    provider.use(express.urlencoded({ extended: false }));
    provider.get('/jwks', (_req, res) => res.json({ keys: [jwk] }));
    provider.post('/token', async (req, res) => {
      providerCalls++;
      const idToken =
        req.body.grant_type === 'authorization_code'
          ? await new SignJWT({ sub: 'user_1', nonce: req.body.code })
              .setProtectedHeader({ alg: 'RS256', kid: 'lifetime-key' })
              .setIssuer(issuer)
              .setAudience('client_1')
              .setIssuedAt()
              .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
              .sign(privateKey)
          : undefined;
      res.json({
        token_type: 'Bearer',
        expires_in: 1,
        access_token: 'upstream_access',
        refresh_token: 'upstream_refresh',
        ...(idToken ? { id_token: idToken } : {}),
      });
    });
    server = http.createServer(provider);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing provider address.');
    issuer = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    __resetProviderClientCachesForTests();
    providerCalls = 0;
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  const fixture = (overrides: Partial<OidcVaultOptions> = {}) => {
    // Inject the same deterministic clock into middleware and the real store;
    // network timers and JOSE's independent token clock remain real.
    const clock = { value: START };
    const now = () => clock.value;
    const store = createMemoryOidcVaultStore({ now });
    const options: OidcVaultOptions = {
      backendOrigin: 'https://api.example.com',
      frontendRedirectUri: 'https://app.example.com/callback',
      config: {
        issuer,
        clientId: 'client_1',
        authorizationEndpoint: `${issuer}/authorize`,
        tokenEndpoint: `${issuer}/token`,
        jwksUri: `${issuer}/jwks`,
      },
      now,
      storeProvider: store,
      ...overrides,
    };
    const app = express();
    const mount = () => app.use(createOidcVaultMiddleware(options));
    const login = async () => {
      const response = await request(app).get('/auth/oidc/login').expect(302);
      const url = new URL(response.headers.location as string);
      return { state: url.searchParams.get('state'), code: url.searchParams.get('nonce') };
    };
    const callback = async (query: Awaited<ReturnType<typeof login>>) => {
      const response = await request(app).get('/auth/oidc/callback').query(query).expect(302);
      return new URL(response.headers.location as string).searchParams.get('code');
    };
    const bootstrap = async () => {
      const code = await callback(await login());
      const response = await request(app).post('/auth/oidc/exchange').send({ code }).expect(200);
      return response.body.sessionId as string;
    };
    return { app, options, store, clock, mount, login, callback, bootstrap };
  };

  // Representative invalid domains, spread across all three public options
  // rather than repeating the same validation matrix for every option.
  it.each([
    ['authorizationTransactionTtlMs', 0],
    ['exchangeCodeTtlMs', -1],
    ['sessionTtlMs', 0.5],
    ['authorizationTransactionTtlMs', NaN],
    ['exchangeCodeTtlMs', Infinity],
    ['sessionTtlMs', -Infinity],
    ['authorizationTransactionTtlMs', Number.MAX_SAFE_INTEGER + 1],
    ['exchangeCodeTtlMs', '1000'],
    ['sessionTtlMs', null],
  ])('rejects invalid %s = %s before provider/store work', (name, value) => {
    const f = fixture({ [name as string]: value });
    const create = vi.spyOn(f.store, 'createAuthorizationTransaction');
    expect(f.mount).toThrow(`${name} must be a positive safe integer`);
    expect(create).not.toHaveBeenCalled();
    expect(providerCalls).toBe(0);
  });

  it.each(['authorizationTransactionTtlMs', 'exchangeCodeTtlMs', 'sessionTtlMs'] as const)(
    'rejects a safe %s whose computed expiry exceeds the Date range',
    (name) => {
      const f = fixture({ [name]: MAX_EPOCH_MS - START + 1 });
      expect(f.mount).toThrow(`${name} must produce a usable epoch-millisecond expiry`);
      expect(providerCalls).toBe(0);
    },
  );

  it.each([NaN, 0.5, -MAX_EPOCH_MS - 1])('rejects an unusable construction clock %s', (value) => {
    const f = fixture();
    f.clock.value = value;
    expect(f.mount).toThrow('usable epoch-millisecond expiry');
  });

  it('accepts one millisecond TTLs and the exact maximum usable epoch', async () => {
    const f = fixture({ authorizationTransactionTtlMs: 1, exchangeCodeTtlMs: 1, sessionTtlMs: 1 });
    f.clock.value = MAX_EPOCH_MS - 1;
    f.mount();
    const { state } = await f.login();
    expect(await f.store.consumeAuthorizationTransaction(state!)).toMatchObject({ expiresAt: MAX_EPOCH_MS });
  });

  it('rechecks transaction expiry when the clock advances beyond the construction-time range', async () => {
    const f = fixture();
    f.mount();
    const create = vi.spyOn(f.store, 'createAuthorizationTransaction');
    f.clock.value = MAX_EPOCH_MS;
    const response = await request(f.app).get('/auth/oidc/login').expect(500);
    expect(response.body.code).toBe('OIDC_VAULT_INTERNAL_ERROR');
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['sessionTtlMs', 'exchangeCodeTtlMs'] as const)(
    'rechecks %s at callback creation before persisting a session or code',
    async (name) => {
      const f = fixture({ sessionTtlMs: 1, exchangeCodeTtlMs: 1, [name]: 1000 });
      const onError = vi.fn();
      f.options.hooks = {
        onCallbackTokens() {
          f.clock.value = MAX_EPOCH_MS - 999;
        },
        onError,
      };
      f.mount();
      const query = await f.login();
      const createSession = vi.spyOn(f.store, 'createSession');
      const createCode = vi.spyOn(f.store, 'createExchangeCode');
      const response = await request(f.app).get('/auth/oidc/callback').query(query).expect(500);
      expect(response.body.code).toBe('OIDC_VAULT_INTERNAL_ERROR');
      expect(onError.mock.calls[0][0].error.message).toContain(name);
      expect(createSession).not.toHaveBeenCalled();
      expect(createCode).not.toHaveBeenCalled();
    },
  );

  it('anchors expiry at callback creation, snapshots options, and preserves it through refresh to the exact boundary', async () => {
    const f = fixture({
      sessionTtlMs: SESSION_TTL,
      authorizationTransactionTtlMs: 20_000,
      exchangeCodeTtlMs: 10_000,
    });
    const createTransaction = vi.spyOn(f.store, 'createAuthorizationTransaction');
    const createCode = vi.spyOn(f.store, 'createExchangeCode');
    f.mount();
    f.options.sessionTtlMs = 1;
    f.options.authorizationTransactionTtlMs = 1;
    f.options.exchangeCodeTtlMs = 1;
    const query = await f.login();
    expect(createTransaction.mock.calls[0][0].expiresAt).toBe(START + 20_000);
    f.clock.value += 2500;
    const code = await f.callback(query);
    expect(createCode.mock.calls[0][0].expiresAt).toBe(START + 2500 + 10_000);
    const exchanged = await request(f.app).post('/auth/oidc/exchange').send({ code }).expect(200);
    const sessionId = exchanged.body.sessionId as string;
    const expiresAt = START + 2500 + SESSION_TTL;
    expect(await f.store.getSession(sessionId)).toMatchObject({ createdAt: START + 2500, expiresAt });

    f.clock.value = expiresAt - 1; // Well past the upstream one-second access-token lifetime.
    const refreshed = await request(f.app).post('/auth/oidc/refresh').send({ sessionId }).expect(200);
    const nextId = refreshed.body.sessionId as string;
    expect(nextId).not.toBe(sessionId);
    expect(await f.store.getSession(nextId)).toMatchObject({ expiresAt, updatedAt: expiresAt - 1 });
    f.clock.value = expiresAt;
    const callsBefore = providerCalls;
    await request(f.app).post('/auth/oidc/refresh').send({ sessionId: nextId }).expect(401);
    expect(await f.store.getSession(nextId)).toBeNull();
    expect(providerCalls).toBe(callsBefore);
  });

  it('rejects exchange at the exact session expiry even while its exchange code is live', async () => {
    const f = fixture({ sessionTtlMs: 1 });
    f.mount();
    const code = await f.callback(await f.login());
    f.clock.value++;
    const response = await request(f.app).post('/auth/oidc/exchange').send({ code }).expect(401);
    expect(response.body.code).toBe('OIDC_VAULT_INVALID_SESSION');
  });

  it('leaves expiry absent by default through callback and refresh despite short upstream expires_in', async () => {
    const beforeCreate = vi.fn();
    const f = fixture({ hooks: { onBeforeSessionCreate: beforeCreate } });
    f.mount();
    const sessionId = await f.bootstrap();
    expect(beforeCreate.mock.calls[0][0].session).not.toHaveProperty('expiresAt');
    expect((await f.store.getSession(sessionId))?.expiresAt).toBeUndefined();
    f.clock.value += SESSION_TTL;
    const response = await request(f.app).post('/auth/oidc/refresh').send({ sessionId }).expect(200);
    expect((await f.store.getSession(response.body.sessionId))?.expiresAt).toBeUndefined();
  });

  it.each(['hook', 'store'] as const)('retains unset application lifetime assigned by the %s', async (owner) => {
    const expiresAt = START + SESSION_TTL;
    const f = fixture();
    if (owner === 'hook') {
      f.options.hooks = {
        onBeforeSessionCreate({ session }) {
          session!.expiresAt = expiresAt;
        },
      };
    } else {
      const create = f.store.createSession.bind(f.store);
      vi.spyOn(f.store, 'createSession').mockImplementation((input) => create({ ...input, expiresAt }));
    }
    f.mount();
    const sessionId = await f.bootstrap();
    f.clock.value += 2000;
    const response = await request(f.app).post('/auth/oidc/refresh').send({ sessionId }).expect(200);
    expect(await f.store.getSession(response.body.sessionId)).toMatchObject({ expiresAt });
  });

  it('keeps a hook-shortened expiry through refresh and enforces the shortened boundary', async () => {
    const f = fixture({ sessionTtlMs: SESSION_TTL });
    f.options.hooks = {
      onBeforeSessionCreate({ session }) {
        expect(session!.expiresAt).toBe(START + SESSION_TTL);
        session!.expiresAt = START + 5000;
      },
    };
    f.mount();
    const sessionId = await f.bootstrap();
    f.clock.value += 4999;
    const response = await request(f.app).post('/auth/oidc/refresh').send({ sessionId }).expect(200);
    expect(await f.store.getSession(response.body.sessionId)).toMatchObject({ expiresAt: START + 5000 });
    f.clock.value++;
    await request(f.app).post('/auth/oidc/refresh').send({ sessionId: response.body.sessionId }).expect(401);
  });

  it.each(['extend', 'remove', 'NaN', 'fraction'] as const)(
    'restores the original cap after a hook attempts to %s the expiry',
    async (attempt) => {
      const f = fixture({ sessionTtlMs: SESSION_TTL });
      f.options.hooks = {
        async onBeforeSessionCreate({ session }) {
          expect(session!.expiresAt).toBe(START + SESSION_TTL);
          if (attempt === 'remove') delete session!.expiresAt;
          else {
            session!.expiresAt = attempt === 'extend' ? START + SESSION_TTL * 2 : attempt === 'NaN' ? NaN : START + 0.5;
          }
          session!.createdAt += 1000;
          await Promise.resolve();
          f.clock.value += 1000;
        },
      };
      f.mount();
      const sessionId = await f.bootstrap();
      expect(await f.store.getSession(sessionId)).toMatchObject({ expiresAt: START + SESSION_TTL });
    },
  );
});
