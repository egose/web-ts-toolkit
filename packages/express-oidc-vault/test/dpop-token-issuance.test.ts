import express from 'express';
import { calculateJwkThumbprint, decodeJwt, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { setSessionCookie, usesCookieTransport } from '../src/cookies';
import { resolveDeviceBindingOptions, type ResolvedOidcVaultOptions } from '../src/device-binding-policy';
import { toErrorPayload } from '../src/errors';
import type {
  IssueTokenInput,
  OidcVaultTokenIssueResult,
  OidcVaultTokenIssuer,
  OidcVaultVerifiedDpopBinding,
} from '../src/index';
import { createExchangeResponse, withIssuedToken } from '../src/token-issuance';

const ORIGIN = 'https://api.example.com';
const AUDIENCE = 'local-api';
const USER = { sub: 'user_1', name: 'Verified user' };
const INTERNAL_ERROR = { code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' };
// Local signing is deliberately HS256 while the verified DPoP key is ES256:
// the proof policy must not become an access-token signing allowlist.
const LOCAL_KEY = new Uint8Array(32).fill(71);
type Transport = 'body' | 'cookie';
type Phase = 'exchange' | 'rotated refresh';
const PATHS = [
  { transport: 'body', phase: 'exchange' },
  { transport: 'cookie', phase: 'exchange' },
  { transport: 'body', phase: 'rotated refresh' },
  { transport: 'cookie', phase: 'rotated refresh' },
] as const;

let verifiedKey: OidcVaultVerifiedDpopBinding;
let otherJkt: string;

beforeAll(async () => {
  const first = await generateKeyPair('ES256');
  const second = await generateKeyPair('ES256');
  verifiedKey = { type: 'dpop', jkt: await calculateJwkThumbprint(await exportJWK(first.publicKey)), alg: 'ES256' };
  otherJkt = await calculateJwkThumbprint(await exportJWK(second.publicKey));
});

afterEach(() => vi.restoreAllMocks());

const signLocalToken = (payload: Record<string, unknown>): Promise<string> =>
  new SignJWT({ sub: USER.sub, ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ORIGIN)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(LOCAL_KEY);

/**
 * Internal issuance boundary fixture: supply already-verified context directly,
 * or a session already rotated by its store. No proof verification, guarded
 * consume, nonce/replay, or proof-aware vault handler is simulated/claimed here.
 * Existing OVH-05 tests exercise this same helper through real vault routes.
 */
const fixture = async (
  transport: Transport,
  phase: Phase,
  issuer?: OidcVaultTokenIssuer,
  config: {
    bound?: boolean;
    policy?: ResolvedOidcVaultOptions['deviceBinding'];
    proof?: Readonly<OidcVaultVerifiedDpopBinding>;
  } = {},
) => {
  const store = createMemoryOidcVaultStore();
  const bound = config.bound ?? true;
  const original = await store.createSession({
    sessionId: 'sess_original',
    logicalSessionId: 'lineage_original',
    subject: USER.sub,
    provider: { issuer: 'https://idp.example.com', clientId: 'client_1' },
    ...(bound ? { deviceBinding: { type: 'dpop', jkt: verifiedKey.jkt } } : {}),
    refreshToken: 'private-upstream-refresh',
    idToken: 'private-upstream-id',
    accessToken: 'private-upstream-access',
    expiresAt: Date.now() + 120_000,
    user: USER,
    metadata: { privateApplicationData: 'private-metadata' },
  });
  await store.createSession({ ...original, sessionId: 'sess_sibling' });
  await store.createSession({ ...original, sessionId: 'sess_unrelated', logicalSessionId: 'lineage_unrelated' });
  const session =
    phase === 'exchange'
      ? original
      : await store.rotateSession({
          sessionId: original.sessionId,
          nextSession: { ...original, sessionId: 'sess_rotated', refreshToken: 'private-rotated-refresh' },
        });
  const revoke = vi.spyOn(store, 'deleteSessionsByLogicalSessionId');
  const onError = vi.fn<(error: unknown) => void>();
  const options: ResolvedOidcVaultOptions = {
    backendOrigin: ORIGIN,
    storeProvider: store,
    sessionTransport: transport,
    cookie: { name: 'vault_session' },
    tokenIssuer: issuer,
    deviceBinding: 'policy' in config ? config.policy : resolveDeviceBindingOptions({}),
  };
  const proof = 'proof' in config ? config.proof : bound ? verifiedKey : undefined;
  const app = express();
  app.post('/issuance-contract', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const issued = await withIssuedToken(req, res, options, session, proof);
      if (usesCookieTransport(options)) setSessionCookie(res, options, session.sessionId);
      res.json(createExchangeResponse(options, session, issued));
    } catch (error) {
      onError(error);
      const payload = toErrorPayload(error);
      res.status(payload.status).json({ code: payload.code, message: payload.message });
    }
  });

  const assertRollback = async (response: request.Response) => {
    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(revoke).toHaveBeenCalledExactlyOnceWith({ logicalSessionId: 'lineage_original' });
    expect(await store.getSession(original.sessionId)).toBeNull();
    expect(await store.getSession(session.sessionId)).toBeNull();
    expect(await store.getSession('sess_sibling')).toBeNull();
    expect(await store.getSession('sess_unrelated')).not.toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    if (transport === 'cookie') {
      expect(response.headers['set-cookie']).toEqual([expect.stringMatching(/^vault_session=;.*Max-Age=0/)]);
    } else {
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  };
  const assertSuccess = (response: request.Response, tokenFields: object) => {
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      ...(transport === 'body' ? { sessionId: session.sessionId } : {}),
      user: USER,
      ...tokenFields,
    });
    expect(response.text).not.toContain('private-');
    expect(response.body).not.toHaveProperty('deviceBinding');
    expect(response.body).not.toHaveProperty('metadata');
    if (transport === 'cookie') {
      expect(response.headers['set-cookie']).toEqual([expect.stringContaining(`vault_session=${session.sessionId};`)]);
    }
  };
  return {
    store,
    session,
    original,
    revoke,
    onError,
    post: () => request(app).post('/issuance-contract'),
    assertRollback,
    assertSuccess,
  };
};

describe('DBJWT-03 verified DPoP local issuance contract and rollback', () => {
  it.each(PATHS)(
    'issues matching cnf.jkt/exact DPoP with response projection ($phase/$transport)',
    async ({ transport, phase }) => {
      const extraGetter = vi.fn(() => {
        throw new Error('private-extra-result');
      });
      const toJSON = vi.fn(() => ({ private: 'private-result-serializer' }));
      const issue = vi.fn(async (input: IssueTokenInput) => {
        expect(input.deviceBinding).toEqual(verifiedKey);
        expect(Object.isFrozen(input.deviceBinding)).toBe(true);
        expect(input.deviceBinding).not.toBe(verifiedKey);
        expect(input.session.deviceBinding).toEqual({ type: 'dpop', jkt: verifiedKey.jkt });
        expect(input.session.deviceBinding).not.toHaveProperty('alg');
        const accessToken = await signLocalToken({
          sid: input.session.sessionId,
          cnf: { jkt: input.deviceBinding?.jkt },
        });
        return Object.freeze({
          accessToken,
          expiresIn: 900,
          tokenType: 'DPoP' as const,
          sessionId: 'injected-session',
          user: { sub: 'injected-user' },
          refreshToken: 'private-result-refresh',
          deviceBinding: { type: 'dpop', jkt: otherJkt },
          get extra() {
            return extraGetter();
          },
          toJSON,
        });
      });
      const f = await fixture(transport, phase, { issue });
      const response = await f.post();
      f.assertSuccess(response, { accessToken: response.body.accessToken, expiresIn: 900, tokenType: 'DPoP' });
      const verified = await jwtVerify(response.body.accessToken, LOCAL_KEY, {
        issuer: ORIGIN,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      expect(verified.payload).toMatchObject({
        cnf: { jkt: verifiedKey.jkt },
        sid: f.session.sessionId,
        sub: USER.sub,
      });
      expect(verified.protectedHeader.alg).toBe('HS256');
      expect(await f.store.getSession(f.session.sessionId)).toEqual(f.session);
      expect(f.revoke).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(issue).toHaveBeenCalledTimes(1);
      expect(extraGetter).not.toHaveBeenCalled();
      expect(toJSON).not.toHaveBeenCalled();
    },
  );

  it.each(PATHS)(
    'keeps bound issuance valid without a local issuer ($phase/$transport)',
    async ({ transport, phase }) => {
      const f = await fixture(transport, phase);
      f.assertSuccess(await f.post(), {});
      expect(f.revoke).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(await f.store.getSession(f.session.sessionId)).toEqual(f.session);
    },
  );

  it.each(PATHS)(
    'revokes the original lineage for a wrong cnf.jkt ($phase/$transport)',
    async ({ transport, phase }) => {
      const accessToken = await signLocalToken({ cnf: { jkt: otherJkt } });
      const issue = vi.fn(async () => ({ accessToken, expiresIn: 900, tokenType: 'DPoP' as const }));
      const f = await fixture(transport, phase, { issue });
      await f.assertRollback(await f.post());
      expect(issue).toHaveBeenCalledTimes(1);
      expect(f.onError.mock.calls[0][0]).toBeInstanceOf(TypeError);
      expect(f.onError.mock.calls[0][0]).toHaveProperty('message', expect.stringContaining('cnf.jkt'));
    },
  );

  const invalid: { name: string; result(): Promise<unknown>; diagnostic: string }[] = [
    ...[
      { name: 'omitted tokenType', tokenType: undefined },
      { name: 'Bearer tokenType on a bound token', tokenType: 'Bearer' },
      { name: 'lowercase dpop tokenType', tokenType: 'dpop' },
      { name: 'whitespace DPoP tokenType', tokenType: 'DPoP ' },
      { name: 'null tokenType', tokenType: null },
    ].map(({ name, tokenType }) => ({
      name,
      result: async () => ({
        accessToken: await signLocalToken({ cnf: { jkt: verifiedKey.jkt } }),
        expiresIn: 900,
        tokenType,
      }),
      diagnostic: 'tokenType',
    })),
    ...[
      { name: 'missing cnf', payload: {} },
      { name: 'null cnf', payload: { cnf: null } },
      { name: 'string cnf', payload: { cnf: 'private-cnf' } },
      { name: 'array cnf', payload: { cnf: [{ jkt: 'private-cnf' }] } },
      { name: 'missing jkt', payload: { cnf: {} } },
      { name: 'non-string jkt', payload: { cnf: { jkt: 1 } } },
      { name: 'unproved jwk instead of jkt', payload: { cnf: { jwk: { kty: 'EC' } } } },
    ].map(({ name, payload }) => ({
      name,
      result: async () => ({ accessToken: await signLocalToken(payload), expiresIn: 900, tokenType: 'DPoP' }),
      diagnostic: 'cnf.jkt',
    })),
    ...[
      { name: 'opaque non-JWT token', accessToken: 'private-opaque-token' },
      { name: 'missing signature', accessToken: 'e30.e30.' },
      { name: 'JWE instead of compact JWS', accessToken: 'e30.e30.e30.e30.e30' },
      { name: 'invalid base64url segments', accessToken: 'e30.e30.???' },
      { name: 'padded base64url segments', accessToken: 'e30=.e30.e30' },
      { name: 'unsigned alg with a fake signature', accessToken: 'eyJhbGciOiJub25lIn0.e30.AQ' }, // pragma: allowlist secret
      { name: 'missing signing alg', accessToken: 'e30.e30.AQ' },
      { name: 'unencoded JWT payload', accessToken: 'eyJhbGciOiJIUzI1NiIsImI2NCI6ZmFsc2V9.e30.AQ' }, // pragma: allowlist secret
    ].map(({ name, accessToken }) => ({
      name,
      result: async () => ({ accessToken, expiresIn: 900, tokenType: 'DPoP' }),
      diagnostic: 'JWT',
    })),
    {
      name: 'nonfinite lifetime',
      result: async () => ({
        accessToken: await signLocalToken({ cnf: { jkt: verifiedKey.jkt } }),
        expiresIn: NaN,
        tokenType: 'DPoP',
      }),
      diagnostic: 'expiresIn',
    },
  ];
  it.each(invalid.map((scenario, index) => ({ ...scenario, ...PATHS[index % PATHS.length] })))(
    'rolls back $name with private field diagnostics ($phase/$transport)',
    async ({ transport, phase, result, diagnostic }) => {
      const f = await fixture(transport, phase, { issue: async () => (await result()) as OidcVaultTokenIssueResult });
      await f.assertRollback(await f.post());
      expect(f.onError.mock.calls[0][0]).toBeInstanceOf(TypeError);
      expect(f.onError.mock.calls[0][0]).toHaveProperty('message', expect.stringContaining(diagnostic));
    },
  );

  it('retains its authoritative binding and response/lineage when the issuer replaces/strips security input', async () => {
    const issue = vi.fn(async (input: IssueTokenInput) => {
      const binding = input.deviceBinding;
      expect(binding).toBeDefined();
      expect(Reflect.set(binding as object, 'jkt', otherJkt)).toBe(false);
      expect(Reflect.set(input.session.deviceBinding as object, 'jkt', otherJkt)).toBe(false);
      Reflect.deleteProperty(input, 'deviceBinding');
      input.session.deviceBinding = { type: 'dpop', jkt: otherJkt };
      input.session.sessionId = 'sess_unrelated';
      input.session.logicalSessionId = 'lineage_unrelated';
      input.session.provider = { issuer: 'https://changed.example.com', clientId: 'changed' };
      input.session.user = { sub: 'changed-subject' };
      return {
        accessToken: await signLocalToken({ cnf: { jkt: binding?.jkt } }),
        expiresIn: 900,
        tokenType: 'DPoP' as const,
      };
    });
    const f = await fixture('cookie', 'rotated refresh', { issue });
    const before = structuredClone(f.session);
    const response = await f.post();
    f.assertSuccess(response, { accessToken: response.body.accessToken, expiresIn: 900, tokenType: 'DPoP' });
    expect(decodeJwt(response.body.accessToken).cnf).toEqual({ jkt: verifiedKey.jkt });
    expect(f.session).toEqual(before);
    expect(await f.store.getSession(f.session.sessionId)).toEqual(before);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it('rejects rebound output after the issuer replaces both context locations and still revokes the original lineage', async () => {
    const f = await fixture('cookie', 'rotated refresh', {
      async issue(input) {
        input.deviceBinding = Object.freeze({ type: 'dpop', jkt: otherJkt, alg: 'ES256' });
        input.session.deviceBinding = { type: 'dpop', jkt: otherJkt };
        input.session.logicalSessionId = 'lineage_unrelated';
        return { accessToken: await signLocalToken({ cnf: { jkt: otherJkt } }), expiresIn: 900, tokenType: 'DPoP' };
      },
    });
    await f.assertRollback(await f.post());
    expect(f.session.deviceBinding).toEqual({ type: 'dpop', jkt: verifiedKey.jkt });
  });

  it('preserves an issuer/getter exception as the private original diagnostic after input mutation', async () => {
    const diagnostic = new Error('private-issuer-diagnostic');
    const f = await fixture('body', 'exchange', {
      async issue(input) {
        input.session.logicalSessionId = 'lineage_unrelated';
        Reflect.deleteProperty(input.session, 'deviceBinding');
        return {
          expiresIn: 900,
          tokenType: 'DPoP',
          get accessToken(): string {
            throw diagnostic;
          },
        };
      },
    });
    await f.assertRollback(await f.post());
    expect(f.onError.mock.calls[0][0]).toBe(diagnostic);
  });

  it('reads each allowed bound issuer-result getter once and captures the verified proof before an async issuer mutates it', async () => {
    const proof = { ...verifiedKey };
    const accessToken = await signLocalToken({ cnf: { jkt: verifiedKey.jkt } });
    const token = vi.fn(() => accessToken);
    const lifetime = vi.fn(() => 0);
    const type = vi.fn(() => 'DPoP' as const);
    const f = await fixture(
      'body',
      'exchange',
      {
        async issue() {
          await Promise.resolve();
          proof.jkt = otherJkt;
          proof.alg = 'PS256';
          return {
            get accessToken() {
              return token();
            },
            get expiresIn() {
              return lifetime();
            },
            get tokenType() {
              return type();
            },
          };
        },
      },
      { proof },
    );
    f.assertSuccess(await f.post(), { accessToken, expiresIn: 0, tokenType: 'DPoP' });
    for (const getter of [token, lifetime, type]) expect(getter).toHaveBeenCalledTimes(1);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'missing verified context',
      config: { proof: undefined },
      code: 'OIDC_VAULT_DPOP_REQUIRED',
      message: 'DPoP authentication is required.',
    },
    {
      name: 'disabled acceptance',
      config: { policy: undefined },
      code: 'OIDC_VAULT_DPOP_REQUIRED',
      message: 'DPoP authentication is required.',
    },
    {
      name: 'required unbound context',
      config: { bound: false, policy: resolveDeviceBindingOptions({ mode: 'required' }) },
      code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
      message: 'A device-bound login is required.',
    },
  ])(
    'rejects $name at issuance preflight without issuer/revocation/cookie mutation',
    async ({ config, code, message }) => {
      const issue = vi.fn(async () => ({ accessToken: 'unexpected-token', expiresIn: 60 }));
      const f = await fixture('cookie', 'exchange', { issue }, config);
      const before = await f.store.getSession(f.session.sessionId);
      const response = await f.post();
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ code, message });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(issue).not.toHaveBeenCalled();
      expect(f.revoke).not.toHaveBeenCalled();
      expect(await f.store.getSession(f.session.sessionId)).toEqual(before);
    },
  );

  it.each(['wrong key', 'disallowed algorithm'] as const)(
    'rejects %s verified context before calling the issuer',
    async (scenario) => {
      const proof = { ...verifiedKey, ...(scenario === 'wrong key' ? { jkt: otherJkt } : { alg: 'PS256' as const }) };
      const issue = vi.fn(async () => ({ accessToken: 'unexpected-token', expiresIn: 60 }));
      const f = await fixture('body', 'exchange', { issue }, { proof });
      const response = await f.post();
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_INVALID_DPOP_PROOF',
        message: 'DPoP proof validation failed.',
      });
      expect(issue).not.toHaveBeenCalled();
      expect(f.revoke).not.toHaveBeenCalled();
      expect(await f.store.getSession(f.session.sessionId)).toEqual(f.session);
    },
  );

  it('does not turn a later optional proof or issuer mutation into unbound enrollment', async () => {
    const issue = vi.fn(async (input: IssueTokenInput) => {
      expect(input).not.toHaveProperty('deviceBinding');
      expect(input.session).not.toHaveProperty('deviceBinding');
      input.session.deviceBinding = { type: 'dpop', jkt: verifiedKey.jkt };
      input.session.user = { sub: 'changed-by-issuer' };
      return { accessToken: ' opaque-local-token ', expiresIn: Number.MAX_SAFE_INTEGER };
    });
    const f = await fixture('body', 'exchange', { issue }, { bound: false, proof: verifiedKey });
    f.assertSuccess(await f.post(), { accessToken: ' opaque-local-token ', expiresIn: Number.MAX_SAFE_INTEGER });
    expect(f.session).not.toHaveProperty('deviceBinding');
    expect(await f.store.getSession(f.session.sessionId)).toEqual(f.session);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it('rejects exact DPoP output for an unbound session despite the expanded public union', async () => {
    const f = await fixture(
      'body',
      'exchange',
      {
        async issue() {
          return {
            accessToken: await signLocalToken({ cnf: { jkt: verifiedKey.jkt } }),
            expiresIn: 900,
            tokenType: 'DPoP',
          };
        },
      },
      { bound: false },
    );
    await f.assertRollback(await f.post());
  });
});
