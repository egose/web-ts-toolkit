import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware, type OidcVaultOptions, type OidcVaultTokenIssuer } from '../src/index';

const ISSUER = 'https://provider.example.com';
const ORIGIN = 'https://app.example.com';
const USER = { sub: 'user_1', name: 'Verified user' };
const VALID = { accessToken: 'local-access', expiresIn: 60, tokenType: 'Bearer' as const };
const INTERNAL_ERROR = { code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' };
type Transport = 'body' | 'cookie';
type Route = 'exchange' | 'refresh';

afterEach(() => vi.restoreAllMocks());

const fixture = async (transport: Transport, issuer?: OidcVaultTokenIssuer) => {
  const store = createMemoryOidcVaultStore();
  const session = await store.createSession({
    sessionId: 'session_original',
    logicalSessionId: 'lineage_1',
    subject: USER.sub,
    provider: { issuer: ISSUER, clientId: 'client_1' },
    user: USER,
    refreshToken: 'private-upstream-refresh',
    idToken: 'private-upstream-id',
    accessToken: 'private-upstream-access',
    metadata: { secret: 'private-metadata' }, // pragma: allowlist secret
  });
  // A second live record makes whole-lineage rollback observable, rather than
  // merely proving deletion of the one handle handed to the issuer.
  await store.createSession({ ...session, sessionId: 'session_sibling' });
  await store.createSession({ ...session, sessionId: 'session_unrelated', logicalSessionId: 'lineage_other' });
  await store.createExchangeCode({
    code: 'exchange_code',
    sessionId: session.sessionId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    expect(String(input)).toBe(`${ISSUER}/token`);
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe(session.refreshToken);
    return Response.json({ token_type: 'Bearer', refresh_token: 'private-rotated-refresh' });
  });
  const onError = vi.fn<NonNullable<NonNullable<OidcVaultOptions['hooks']>['onError']>>();
  const onSessionRefreshed = vi.fn<NonNullable<NonNullable<OidcVaultOptions['hooks']>['onSessionRefreshed']>>();
  const rotate = vi.spyOn(store, 'rotateSession');
  const revoke = vi.spyOn(store, 'deleteSessionsByLogicalSessionId');
  const app = express();
  app.use(
    createOidcVaultMiddleware({
      basePath: '/vault',
      backendOrigin: ORIGIN,
      storeProvider: store,
      config: {
        issuer: ISSUER,
        clientId: 'client_1',
        authorizationEndpoint: `${ISSUER}/authorize`,
        tokenEndpoint: `${ISSUER}/token`,
        jwksUri: `${ISSUER}/jwks`,
      },
      sessionTransport: transport,
      cookie: { name: 'vault' },
      tokenIssuer: issuer,
      hooks: { onError, onSessionRefreshed },
    }),
  );
  const post = (route: Route, sessionId = session.sessionId) => {
    const req = request(app).post(`/vault/${route}`).set('Origin', ORIGIN);
    if (transport === 'cookie') req.set('Cookie', `vault=${sessionId}`);
    return req.send(route === 'exchange' ? { code: 'exchange_code' } : { sessionId });
  };
  const assertSuccess = (response: request.Response, sessionId: string, credentials: object) => {
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...(transport === 'body' ? { sessionId } : {}),
      user: USER,
      ...credentials,
    });
    if (transport === 'cookie') {
      expect(response.headers['set-cookie']).toEqual([expect.stringContaining(`vault=${sessionId};`)]);
      expect(response.headers['set-cookie'][0]).not.toContain('Max-Age=0');
    } else {
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  };
  const assertRollback = async (response: request.Response, route: Route) => {
    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: 'lineage_1' });
    expect(await store.getSession(session.sessionId)).toBeNull();
    expect(await store.getSession('session_sibling')).toBeNull();
    expect(await store.getSession('session_unrelated')).not.toBeNull();
    if (route === 'refresh') {
      expect(rotate).toHaveBeenCalledTimes(1);
      const rotated = await rotate.mock.results[0].value;
      expect(rotated.sessionId).not.toBe(session.sessionId);
      expect(rotated.refreshToken).toBe('private-rotated-refresh');
      expect(await store.getSession(rotated.sessionId)).toBeNull();
      expect(upstream).toHaveBeenCalledTimes(1);
    } else {
      expect(rotate).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
      expect(await store.consumeExchangeCode('exchange_code')).toBeNull();
    }
    expect(onSessionRefreshed).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].route).toBe(route);
    if (transport === 'cookie') {
      expect(response.headers['set-cookie']).toEqual([expect.stringMatching(/^vault=;.*Max-Age=0/)]);
    } else {
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  };
  return { session, store, upstream, rotate, revoke, onError, onSessionRefreshed, post, assertSuccess, assertRollback };
};

describe('OVH-05 local issuer response boundary', () => {
  describe.each(['body', 'cookie'] as const)('%s transport', (transport) => {
    it('allowlists an extended frozen issuer result through exchange and refresh', async () => {
      const extraGetter = vi.fn(() => 'private-extra');
      const toJSON = vi.fn(() => ({ secret: 'private-serialization-override' })); // pragma: allowlist secret
      const extended = Object.freeze({
        ...VALID,
        refreshToken: 'private-refresh',
        idToken: 'private-id',
        sessionId: 'injected-session',
        user: { sub: 'injected-user' },
        metadata: { secret: 'private-metadata' }, // pragma: allowlist secret
        get extra() {
          return extraGetter();
        },
        toJSON,
      });
      // Structural typing legitimately permits these extra properties.
      const issue = vi.fn(async () => extended);
      const f = await fixture(transport, { issue });
      f.assertSuccess(await f.post('exchange'), f.session.sessionId, VALID);
      const refreshed = await f.post('refresh');
      const rotated = await f.rotate.mock.results[0].value;
      f.assertSuccess(refreshed, rotated.sessionId, VALID);
      expect(issue).toHaveBeenCalledTimes(2);
      expect(extraGetter).not.toHaveBeenCalled();
      expect(toJSON).not.toHaveBeenCalled();
      expect(f.revoke).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(await f.store.getSession(rotated.sessionId)).toMatchObject({ refreshToken: 'private-rotated-refresh' });
    });

    it('keeps exchange and refresh valid without an issuer', async () => {
      const f = await fixture(transport);
      f.assertSuccess(await f.post('exchange'), f.session.sessionId, {});
      const refreshed = await f.post('refresh');
      const rotated = await f.rotate.mock.results[0].value;
      f.assertSuccess(refreshed, rotated.sessionId, {});
      expect(f.onError).not.toHaveBeenCalled();
      expect(f.revoke).not.toHaveBeenCalled();
    });

    it.each(['exchange', 'refresh'] as const)('rolls back %s for a null issuer result', async (route) => {
      const issue = vi.fn(async () => null as unknown as typeof VALID);
      const f = await fixture(transport, { issue });
      await f.assertRollback(await f.post(route), route);
      expect(issue).toHaveBeenCalledTimes(1);
      expect(f.onError.mock.calls[0][0].error).toBeInstanceOf(TypeError);
      expect(f.onError.mock.calls[0][0].error).toHaveProperty('message', expect.stringContaining('tokenIssuer.issue'));
    });
  });

  // Validate each domain once, distributed across both routes/transports;
  // the shared rollback behavior is exercised above on all four paths.
  const invalid: { name: string; result: unknown; field: string }[] = [
    { name: 'undefined', result: undefined, field: 'object' },
    { name: 'primitive', result: 'private-string-result', field: 'object' },
    { name: 'array with valid fields', result: Object.assign([], VALID), field: 'object' },
    { name: 'function with valid fields', result: Object.assign(() => {}, VALID), field: 'object' },
    { name: 'missing accessToken', result: { expiresIn: 60 }, field: 'accessToken' },
    { name: 'empty accessToken', result: { ...VALID, accessToken: '' }, field: 'accessToken' },
    {
      name: 'object accessToken',
      result: { ...VALID, accessToken: { secret: 'private-token' } }, // pragma: allowlist secret
      field: 'accessToken',
    },
    { name: 'missing expiresIn', result: { accessToken: 'local' }, field: 'expiresIn' },
    { name: 'string expiresIn', result: { ...VALID, expiresIn: '60' }, field: 'expiresIn' },
    { name: 'null expiresIn', result: { ...VALID, expiresIn: null }, field: 'expiresIn' },
    { name: 'NaN expiresIn', result: { ...VALID, expiresIn: NaN }, field: 'expiresIn' },
    { name: 'infinite expiresIn', result: { ...VALID, expiresIn: Infinity }, field: 'expiresIn' },
    { name: 'negative expiresIn', result: { ...VALID, expiresIn: -1 }, field: 'expiresIn' },
    { name: 'fractional expiresIn', result: { ...VALID, expiresIn: 0.5 }, field: 'expiresIn' },
    { name: 'unsafe expiresIn', result: { ...VALID, expiresIn: Number.MAX_SAFE_INTEGER + 1 }, field: 'expiresIn' },
    { name: 'null tokenType', result: { ...VALID, tokenType: null }, field: 'tokenType' },
    { name: 'lowercase tokenType', result: { ...VALID, tokenType: 'bearer' }, field: 'tokenType' },
    { name: 'numeric tokenType', result: { ...VALID, tokenType: 1 }, field: 'tokenType' },
    { name: 'DPoP tokenType without a bound session', result: { ...VALID, tokenType: 'DPoP' }, field: 'tokenType' },
  ];
  it.each(
    invalid.map((scenario, index) => ({
      ...scenario,
      transport: (index % 2 === 0 ? 'body' : 'cookie') as Transport,
      route: (index % 4 < 2 ? 'exchange' : 'refresh') as Route,
    })),
  )('rejects $name ($route/$transport) with private field diagnostics', async ({ result, field, route, transport }) => {
    const f = await fixture(transport, { issue: async () => result as typeof VALID });
    await f.assertRollback(await f.post(route), route);
    const error = f.onError.mock.calls[0][0].error;
    expect(error).toBeInstanceOf(TypeError);
    expect(error).toHaveProperty('message', expect.stringContaining(field));
  });

  it('snapshots allowed getters once before the refresh notification can mutate the issuer result', async () => {
    const original = { ...VALID };
    const accessToken = vi.fn(() => original.accessToken);
    const expiresIn = vi.fn(() => original.expiresIn);
    const tokenType = vi.fn(() => original.tokenType);
    const f = await fixture('cookie', {
      issue: async () => ({
        get accessToken() {
          return accessToken();
        },
        get expiresIn() {
          return expiresIn();
        },
        get tokenType() {
          return tokenType();
        },
      }),
    });
    f.onSessionRefreshed.mockImplementation(() => {
      original.accessToken = 'private-later-mutation';
      original.expiresIn = NaN;
    });
    const response = await f.post('refresh');
    const rotated = await f.rotate.mock.results[0].value;
    f.assertSuccess(response, rotated.sessionId, VALID);
    for (const getter of [accessToken, expiresIn, tokenType]) expect(getter).toHaveBeenCalledTimes(1);
    expect(f.onSessionRefreshed).toHaveBeenCalledTimes(1);
  });

  it('preserves a throwing allowed getter diagnostic privately while revoking the rotated lineage', async () => {
    const diagnostic = new Error('private-getter-diagnostic');
    const f = await fixture('cookie', {
      issue: async () => ({
        ...VALID,
        get accessToken(): string {
          throw diagnostic;
        },
      }),
    });
    await f.assertRollback(await f.post('refresh'), 'refresh');
    expect(f.onError.mock.calls[0][0].error).toBe(diagnostic);
  });

  it.each([
    { name: 'zero lifetime and omitted tokenType', result: { accessToken: 'local', expiresIn: 0 } },
    {
      name: 'maximum safe lifetime and undefined tokenType',
      result: { accessToken: ' local ', expiresIn: Number.MAX_SAFE_INTEGER, tokenType: undefined },
    },
  ])('accepts $name without normalizing the opaque token', async ({ result }) => {
    const f = await fixture('body', { issue: async () => result });
    f.assertSuccess(await f.post('exchange'), f.session.sessionId, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
    const refreshed = await f.post('refresh');
    const rotated = await f.rotate.mock.results[0].value;
    f.assertSuccess(refreshed, rotated.sessionId, { accessToken: result.accessToken, expiresIn: result.expiresIn });
  });
});
