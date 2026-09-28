import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware, type OidcVaultOptions, type OidcVaultProviderMetadata } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

const ISSUER = 'https://provider.example.com/tenant';
const ORIGIN = 'https://app.example.com';
const INVALID_SESSION = { code: 'OIDC_VAULT_INVALID_SESSION', message: 'Session is missing or expired.' };
type Transport = 'body' | 'cookie';

describe('OVH-04 shared-store live session identity', () => {
  let privateKey: CryptoKey;
  let jwk: Record<string, unknown>;

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    jwk = { ...(await exportJWK(keys.publicKey)), kid: 'identity-key' };
  });
  beforeEach(() => __resetProviderClientCachesForTests());
  afterEach(() => {
    vi.restoreAllMocks();
    __resetProviderClientCachesForTests();
  });

  const fixture = (transport: Transport, ownerIssuer = ISSUER, otherIssuer = ISSUER, otherClient = 'client_a') => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/.well-known/openid-configuration')) {
        const issuer = url.slice(0, -'/.well-known/openid-configuration'.length);
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          end_session_endpoint: `${issuer}/end-session`,
        });
      }
      if (url.endsWith('/jwks')) return Response.json({ keys: [jwk] });
      if (url.endsWith('/token')) {
        const form = new URLSearchParams(String(init?.body));
        if (form.get('grant_type') === 'refresh_token') return Response.json({ token_type: 'Bearer' });
        const idToken = await new SignJWT({ sub: 'user_a', nonce: form.get('code') })
          .setProtectedHeader({ alg: 'RS256', kid: 'identity-key' })
          .setIssuer(ownerIssuer)
          .setAudience('client_a')
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(privateKey);
        return Response.json({ token_type: 'Bearer', id_token: idToken, refresh_token: 'private-refresh-a' });
      }
      throw new Error(`Unexpected fixture URL: ${url}`);
    });
    const store = createMemoryOidcVaultStore();
    const app = express();
    const observers = () => ({
      issue: vi.fn(async () => ({ accessToken: 'local-access', expiresIn: 60 })),
      onBeforeLogout: vi.fn(),
      onLogout: vi.fn(),
      onSessionRefreshed: vi.fn(),
      onError: vi.fn<NonNullable<NonNullable<OidcVaultOptions['hooks']>['onError']>>(),
    });
    const a = observers();
    const b = observers();
    const options = (basePath: string, issuer: string, clientId: string, hooks: ReturnType<typeof observers>) =>
      ({
        basePath,
        backendOrigin: 'https://api.example.com',
        frontendRedirectUri: `${ORIGIN}/callback`,
        storeProvider: store,
        sessionTransport: transport,
        cookie: { name: 'shared_vault' },
        trustedOrigins: [ORIGIN],
        config: { issuer, clientId },
        tokenIssuer: { issue: hooks.issue },
        hooks,
      }) satisfies OidcVaultOptions;
    // The owner uses manual metadata to preserve even slash variants exactly.
    const owner = options('/a', ownerIssuer, 'client_a', a);
    app.use(
      createOidcVaultMiddleware({
        ...owner,
        config: {
          ...owner.config,
          authorizationEndpoint: `${ownerIssuer}/authorize`,
          tokenEndpoint: `${ownerIssuer}/token`,
          jwksUri: `${ownerIssuer}/jwks`,
        },
      }),
    );
    // The second router starts with a cold discovery cache: rejection must
    // happen before even discovery, not merely before the token endpoint.
    app.use(createOidcVaultMiddleware(options('/b', otherIssuer, otherClient, b)));
    const post = (router: 'a' | 'b', route: string, sessionId: string, body: Record<string, unknown> = {}) => {
      const req = request(app).post(`/${router}/${route}`).set('Origin', ORIGIN);
      if (transport === 'cookie') req.set('Cookie', `shared_vault=${sessionId}`);
      return req.send({ ...(transport === 'body' ? { sessionId } : {}), ...body });
    };
    const bootstrap = async () => {
      const created = vi.spyOn(store, 'createSession');
      const login = await request(app).get('/a/login').expect(302);
      const url = new URL(login.headers.location as string);
      const callback = await request(app)
        .get('/a/callback')
        .query({
          state: url.searchParams.get('state'),
          code: url.searchParams.get('nonce'),
        })
        .expect(302);
      const code = new URL(callback.headers.location as string).searchParams.get('code');
      const session = await created.mock.results[0].value;
      expect(session.provider).toEqual({ issuer: ownerIssuer, clientId: 'client_a' });
      return { code, session };
    };
    const observeMutations = () => [
      vi.spyOn(store, 'createSession'),
      vi.spyOn(store, 'rotateSession'),
      vi.spyOn(store, 'deleteSession'),
      vi.spyOn(store, 'deleteSessionsByLogicalSessionId'),
      vi.spyOn(store, 'deleteSessionsBySubject'),
      vi.spyOn(store, 'deleteSessionsByProviderSessionId'),
    ];
    const responseSessionId = (response: request.Response): string => {
      expect(response.body.accessToken).toBe('local-access');
      if (transport === 'body') {
        expect(response.headers['set-cookie']).toBeUndefined();
        return response.body.sessionId as string;
      }
      expect(response.body).not.toHaveProperty('sessionId');
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const value = cookies.find((cookie) => cookie.startsWith('shared_vault='));
      expect(value).toBeDefined();
      return value!.split(';')[0].slice('shared_vault='.length);
    };
    return { app, store, upstream, a, b, post, bootstrap, observeMutations, responseSessionId };
  };

  describe.each(['body', 'cookie'] as const)('%s transport', (transport) => {
    it.each([
      { name: 'foreign issuer', otherIssuer: 'https://foreign.example.com/tenant' },
      { name: 'same issuer / foreign client', otherClient: 'client_b' },
      {
        name: 'root trailing slash',
        ownerIssuer: 'https://provider.example.com',
        otherIssuer: 'https://provider.example.com/',
      },
      { name: 'tenant trailing slash', otherIssuer: `${ISSUER}/` },
      { name: 'tenant slash removal', ownerIssuer: `${ISSUER}/`, otherIssuer: ISSUER },
      { name: 'tenant double slash', ownerIssuer: `${ISSUER}/`, otherIssuer: `${ISSUER}//` },
      { name: 'issuer mismatch / absent client', otherIssuer: 'https://foreign.example.com', omit: 'clientId' },
      { name: 'client mismatch / absent issuer', otherClient: 'client_b', omit: 'issuer' },
      { name: 'present empty issuer', empty: 'issuer' },
      { name: 'present empty client', empty: 'clientId' },
    ])('rejects $name before credential use or live lineage mutation', async (scenario) => {
      const f = fixture(transport, scenario.ownerIssuer, scenario.otherIssuer, scenario.otherClient);
      const { code, session } = await f.bootstrap();
      if (scenario.omit) delete session.provider![scenario.omit as keyof OidcVaultProviderMetadata];
      if (scenario.empty) session.provider![scenario.empty as keyof OidcVaultProviderMetadata] = '';
      if (scenario.omit || scenario.empty) await f.store.createSession(session);
      const before = await f.store.getSession(session.sessionId);
      const mutations = f.observeMutations();
      vi.clearAllMocks();
      for (const [route, body] of [
        ['exchange', { code }],
        ['refresh', {}],
        ['logout', {}],
        ['logout', { redirect: true }],
      ] as const) {
        const response = await f.post('b', route, session.sessionId, body).expect(401);
        expect(response.body).toEqual(INVALID_SESSION);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers.location).toBeUndefined();
        expect(f.upstream).not.toHaveBeenCalled();
        expect(f.b.issue).not.toHaveBeenCalled();
        expect(f.b.onBeforeLogout).not.toHaveBeenCalled();
        expect(f.b.onLogout).not.toHaveBeenCalled();
        expect(f.b.onSessionRefreshed).not.toHaveBeenCalled();
        for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
        expect(await f.store.getSession(session.sessionId)).toEqual(before);
      }
      // Error observation remains available, without handing the foreign
      // session to onError or disclosing identity/token details to the caller.
      expect(f.b.onError).toHaveBeenCalledTimes(4);
      for (const [context] of f.b.onError.mock.calls) {
        expect(context.session).toBeUndefined();
        expect(context.error).toMatchObject({ status: 401, code: INVALID_SESSION.code });
      }
      // The shared one-time code was consumed before its session could be
      // checked. This boundary deliberately does not promise code isolation.
      await f.post('a', 'exchange', session.sessionId, { code }).expect(400);
      if (scenario.empty) {
        await f.post('a', 'refresh', session.sessionId).expect(401);
        await f.post('a', 'logout', session.sessionId).expect(401);
        expect(await f.store.getSession(session.sessionId)).toEqual(before);
        return;
      }
      const refreshed = await f.post('a', 'refresh', session.sessionId).expect(200);
      const nextId = f.responseSessionId(refreshed);
      expect(nextId).not.toBe(session.sessionId);
      expect(await f.store.getSession(nextId)).toMatchObject({ logicalSessionId: session.logicalSessionId });
      await f.post('a', 'logout', nextId).expect(200);
      expect(await f.store.getSession(nextId)).toBeNull();
    });

    it.each([
      { name: 'both matching fields', provider: { issuer: ISSUER, clientId: 'client_a' } },
      {
        name: 'absent provider across identities',
        provider: undefined,
        otherIssuer: 'https://legacy.example.com',
        otherClient: 'client_b',
      },
      {
        name: 'empty provider across identities',
        provider: {},
        otherIssuer: 'https://legacy.example.com',
        otherClient: 'client_b',
      },
      {
        name: 'absent issuer across issuers',
        provider: { clientId: 'client_a' },
        otherIssuer: 'https://legacy.example.com',
      },
      { name: 'absent client across clients', provider: { issuer: ISSUER }, otherClient: 'client_b' },
      {
        name: 'undefined fields across identities',
        provider: { issuer: undefined, clientId: undefined },
        otherIssuer: 'https://legacy.example.com',
        otherClient: 'client_b',
      },
    ])('allows $name through exchange, refresh and local logout', async ({ provider, otherIssuer, otherClient }) => {
      const f = fixture(transport, ISSUER, otherIssuer, otherClient);
      const { code, session } = await f.bootstrap();
      await f.store.createSession({ ...session, provider });
      vi.clearAllMocks();
      const exchanged = await f.post('b', 'exchange', session.sessionId, { code }).expect(200);
      expect(f.responseSessionId(exchanged)).toBe(session.sessionId);
      expect(f.upstream).not.toHaveBeenCalled();
      const refreshed = await f.post('b', 'refresh', session.sessionId).expect(200);
      const nextId = f.responseSessionId(refreshed);
      expect(nextId).not.toBe(session.sessionId);
      expect(f.upstream).toHaveBeenCalledTimes(2); // Discovery, then token request.
      expect(new URLSearchParams(String(f.upstream.mock.calls[1][1]?.body)).get('refresh_token')).toBe(
        session.refreshToken,
      );
      expect(await f.store.getSession(nextId)).toMatchObject({ refreshToken: session.refreshToken });
      expect(f.b.issue).toHaveBeenCalledTimes(2);
      expect(f.b.onSessionRefreshed).toHaveBeenCalledTimes(1);
      // A cold cache proves local logout doesn't resolve provider metadata.
      __resetProviderClientCachesForTests();
      f.upstream.mockClear();
      const logout = await f.post('b', 'logout', nextId).expect(200);
      expect(logout.body).toEqual({ loggedOut: true });
      expect(f.upstream).not.toHaveBeenCalled();
      expect(f.b.onBeforeLogout).toHaveBeenCalledTimes(1);
      expect(f.b.onLogout).toHaveBeenCalledTimes(1);
      expect(f.b.onError).not.toHaveBeenCalled();
      expect(await f.store.getSession(nextId)).toBeNull();
      if (transport === 'cookie') expect(logout.headers['set-cookie']?.join(';')).toContain('Max-Age=0');
    });
  });
});
