import {
  createHash,
  createPrivateKey,
  createSecretKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';

import express from 'express';
import {
  calculateJwkThumbprint,
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  generateSecret,
  jwtVerify,
  SignJWT,
} from 'jose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { parseDpopCredentials } from '../../oidc-vault-dpop-client/src/credentials';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenIssuer,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  type IssueTokenInput,
  type OidcVaultJwtAccessTokenClaims,
  type OidcVaultJwtAccessTokenIssuerOptions,
  type OidcVaultJwtSigningAlgorithm,
  type OidcVaultOptions,
} from '../src/index';

const ORIGIN = 'https://api.example.com';
const PROVIDER = 'https://provider.example.com';
const AUDIENCE = 'local-api';
const KEY = new Uint8Array(64).fill(81);
const JKT = 'A'.repeat(43);
const options = (extra: Partial<OidcVaultJwtAccessTokenIssuerOptions> = {}): OidcVaultJwtAccessTokenIssuerOptions => ({
  key: KEY,
  algorithm: 'HS256',
  issuer: ORIGIN,
  audience: AUDIENCE,
  ...extra,
});
const input = (bound = false): IssueTokenInput => ({
  operation: 'exchange',
  req: {} as express.Request,
  res: {} as express.Response,
  session: {
    sessionId: 'private-vault-handle',
    logicalSessionId: 'private-lineage',
    subject: 'user_1',
    scope: 'openid profile',
    user: { sub: 'profile-subject', cnf: { jkt: JKT }, privateProfile: 'private-profile' },
    metadata: { cnf: { jkt: JKT }, privateMetadata: 'private-metadata' },
    accessToken: 'private-upstream-access',
    refreshToken: 'private-upstream-refresh',
    idToken: 'private-upstream-id',
    createdAt: 0,
    updatedAt: 0,
  },
  ...(bound ? { deviceBinding: { type: 'dpop' as const, jkt: JKT, alg: 'ES256' as const } } : {}),
});
const validate = (extra = {}) =>
  createOidcVaultJwtAccessTokenValidator({
    key: KEY,
    issuer: ORIGIN,
    audience: AUDIENCE,
    algorithms: ['HS256'],
    ...extra,
  });

afterEach(() => vi.restoreAllMocks());

describe('OVAPP-03 local JWT issuer configuration and authority', () => {
  it.each([false, true])('defaults to the captured subject/scope and no private data (bound=%s)', async (bound) => {
    const now = Date.now();
    const issuer = createOidcVaultJwtAccessTokenIssuer(options({ now: () => now }));
    expect(Object.isFrozen(issuer)).toBe(true);
    const result = await issuer.issue(input(bound));
    expect(result).toMatchObject({ expiresIn: 300, tokenType: bound ? 'DPoP' : 'Bearer' });
    expect(decodeProtectedHeader(result.accessToken)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = decodeJwt(result.accessToken);
    expect(payload).toEqual({
      sub: 'user_1',
      scope: 'openid profile',
      iss: ORIGIN,
      aud: AUDIENCE,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 300,
      ...(bound ? { cnf: { jkt: JKT } } : {}),
    });
    expect(JSON.stringify(payload)).not.toMatch(/private-|sid|profile-subject/);
    expect(await validate().validate(result.accessToken)).toMatchObject({ subject: 'user_1', scope: 'openid profile' });
  });

  const algorithms: OidcVaultJwtSigningAlgorithm[] = [
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512',
    'EdDSA',
  ];
  it.each(algorithms)('signs with matching bytes/native/CryptoKey/JWK representations for %s', async (algorithm) => {
    const secret = algorithm.startsWith('HS');
    const pair = secret ? undefined : await generateKeyPair(algorithm, { extractable: true });
    const cryptoKey = secret ? await generateSecret(algorithm, { extractable: true }) : pair!.privateKey;
    const jwk = await exportJWK(cryptoKey);
    const native = secret
      ? createSecretKey(Buffer.from(jwk.k!, 'base64url'))
      : createPrivateKey({ key: jwk, format: 'jwk' });
    for (const key of [
      cryptoKey,
      native,
      { ...jwk, alg: algorithm, use: 'sig', key_ops: ['sign'] },
      ...(secret ? [Buffer.from(jwk.k!, 'base64url')] : []),
    ]) {
      const issuer = createOidcVaultJwtAccessTokenIssuer(options({ key, algorithm }));
      const result = await issuer.issue(input(true));
      const verified = await jwtVerify(result.accessToken, secret ? cryptoKey : pair!.publicKey, {
        issuer: ORIGIN,
        audience: AUDIENCE,
        algorithms: [algorithm],
      });
      expect(verified.payload.cnf).toEqual({ jkt: JKT });
    }
  });

  it.each([
    { algorithm: 'none' },
    { algorithm: undefined },
    { algorithm: 'hs256' },
    { key: undefined },
    { key: 'fallback-not-allowed' },
    { key: new Uint8Array(31) },
    { algorithm: 'HS384', key: new Uint8Array(47) },
    { algorithm: 'HS512', key: new Uint8Array(63) },
    { issuer: '' },
    { issuer: '  ' },
    { issuer: undefined },
    { audience: '' },
    { audience: [] },
    { audience: ['valid', ''] },
    { audience: undefined },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, '5m', null].map(
      (lifetimeSeconds) => ({ lifetimeSeconds }),
    ),
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER].map((clock) => ({ now: () => clock })),
    { now: null },
    { mapSubject: 'subject' },
    { mapClaims: {} },
    { key: { kty: 'oct', k: Buffer.from(KEY).toString('base64url'), alg: 'HS512' } },
    { key: { kty: 'oct', k: Buffer.from(KEY).toString('base64url'), use: 'enc' } },
    { key: { kty: 'oct', k: Buffer.from(KEY).toString('base64url'), key_ops: ['verify'] } },
    { key: { kty: 'oct', k: 'padded=' } },
  ])('rejects malformed configuration %#', (extra) => {
    expect(() =>
      createOidcVaultJwtAccessTokenIssuer(options(extra as Partial<OidcVaultJwtAccessTokenIssuerOptions>)),
    ).toThrow(TypeError);
  });

  it('rejects incompatible native, JWK and CryptoKey algorithms/types/usages', async () => {
    const ec = await generateKeyPair('ES256', { extractable: true });
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const hmac = await generateSecret('HS512');
    const noSign = await crypto.subtle.importKey('raw', KEY, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const cases = [
      { key: ec.publicKey },
      { key: ec.privateKey },
      { key: hmac },
      { key: noSign },
      { key: ec.privateKey, algorithm: 'ES384' },
      { key: KEY, algorithm: 'ES256' },
      { key: await exportJWK(ec.publicKey), algorithm: 'ES256' },
      { key: await exportJWK(rsa.privateKey), algorithm: 'RS256' },
      { key: rsa.privateKey, algorithm: 'PS256' },
    ];
    for (const extra of cases)
      expect(() =>
        createOidcVaultJwtAccessTokenIssuer(options(extra as Partial<OidcVaultJwtAccessTokenIssuerOptions>)),
      ).toThrow(TypeError);
  });

  it('snapshots options, key bytes, audience and mapper/clock references', async () => {
    const now = Date.now();
    const key = Uint8Array.from(KEY);
    const audience = [AUDIENCE];
    const config = options({
      key,
      audience,
      lifetimeSeconds: 60,
      now: () => now,
      mapClaims: () => ({ role: 'reader' }),
    });
    const issuer = createOidcVaultJwtAccessTokenIssuer(config);
    key.fill(0);
    audience[0] = 'changed';
    Object.assign(config, {
      algorithm: 'none',
      issuer: 'changed',
      lifetimeSeconds: 0,
      now: () => NaN,
      mapClaims: () => ({ role: 'admin' }),
    });
    const result = await issuer.issue(input());
    expect(result.expiresIn).toBe(60);
    expect((await jwtVerify(result.accessToken, KEY, { issuer: ORIGIN, audience: AUDIENCE })).payload).toMatchObject({
      role: 'reader',
      exp: Math.floor(now / 1000) + 60,
    });
  });

  it('snapshots JWK material and key_ops without freezing/mutating the caller', async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(pair.privateKey)), key_ops: ['sign'], alg: 'ES256' };
    const issuer = createOidcVaultJwtAccessTokenIssuer(options({ key: jwk, algorithm: 'ES256' }));
    expect(Object.isFrozen(jwk)).toBe(false);
    jwk.d = 'changed';
    jwk.alg = 'none';
    jwk.key_ops[0] = 'verify';
    expect((await jwtVerify((await issuer.issue(input())).accessToken, pair.publicKey)).payload.sub).toBe('user_1');
  });

  it.each(['iss', 'aud', 'iat', 'exp', 'sub', 'cnf'])(
    'rejects reserved %s even undefined, inherited or serializer-produced',
    async (field) => {
      for (const claims of [
        { [field]: 'changed' },
        { [field]: undefined },
        Object.create({ [field]: 'changed' }),
        { toJSON: () => ({ [field]: 'changed' }) },
      ]) {
        const issuer = createOidcVaultJwtAccessTokenIssuer(
          options({ mapClaims: () => claims as OidcVaultJwtAccessTokenClaims }),
        );
        await expect(issuer.issue(input())).rejects.toThrow(`reserved claim ${field}`);
      }
    },
  );

  it.each([null, [], 'claims', 1, { toJSON: () => null }, { toJSON: () => [] }])(
    'rejects non-object mapped JSON %#',
    async (claims) => {
      const issuer = createOidcVaultJwtAccessTokenIssuer(
        options({ mapClaims: () => claims as OidcVaultJwtAccessTokenClaims }),
      );
      await expect(issuer.issue(input())).rejects.toThrow(TypeError);
    },
  );

  it.each([false, true])(
    'keeps binding/default subject/scope authoritative across mapper mutations (bound=%s)',
    async (bound) => {
      const value = input(bound);
      // A session field alone must never select cnf.
      value.session.deviceBinding = { type: 'dpop', jkt: JKT };
      const issuer = createOidcVaultJwtAccessTokenIssuer(
        options({
          async mapClaims(input) {
            await Promise.resolve();
            if (input.deviceBinding) Reflect.set(input.deviceBinding, 'jkt', 'B'.repeat(42) + 'A');
            delete input.deviceBinding;
            input.session.subject = 'changed';
            input.session.scope = 'admin';
            input.session.deviceBinding = { type: 'dpop', jkt: 'B'.repeat(42) + 'A' };
            input.session.user!.cnf = { jkt: 'B'.repeat(42) + 'A' };
            return { role: 'reader', nested: { toJSON: () => ({ ok: true }) } };
          },
        }),
      );
      const result = await issuer.issue(value);
      expect(decodeJwt(result.accessToken)).toMatchObject({
        sub: 'user_1',
        scope: 'openid profile',
        role: 'reader',
        nested: { ok: true },
      });
      expect(decodeJwt(result.accessToken).cnf).toEqual(bound ? { jkt: JKT } : undefined);
      expect(result.tokenType).toBe(bound ? 'DPoP' : 'Bearer');
    },
  );

  it('maps application subject/claims in order, can narrow/omit scope, and samples signing time after mapping', async () => {
    let now = Date.now();
    const order: string[] = [];
    const issuer = createOidcVaultJwtAccessTokenIssuer(
      options({
        now: () => now,
        async mapSubject({ operation }) {
          order.push(operation);
          return 'application-user';
        },
        async mapClaims({ operation }) {
          order.push('claims');
          now += 5_000;
          return { role: 'reader', scope: operation === 'exchange' ? 'api:read' : undefined };
        },
      }),
    );
    const value = input();
    expect(decodeJwt((await issuer.issue(value)).accessToken)).toMatchObject({
      sub: 'application-user',
      scope: 'api:read',
      iat: Math.floor(now / 1000),
    });
    value.operation = 'refresh';
    expect(decodeJwt((await issuer.issue(value)).accessToken)).not.toHaveProperty('scope');
    expect(order).toEqual(['exchange', 'claims', 'refresh', 'claims']);
  });

  it.each(['', ' ', null, 4])('rejects invalid mapped subjects %#', async (subject) => {
    const issuer = createOidcVaultJwtAccessTokenIssuer(options({ mapSubject: () => subject as string }));
    await expect(issuer.issue(input())).rejects.toThrow('JWT subject');
  });

  it('checks clock/lifetime arithmetic at issuance, including the fractional-second browser deadline', async () => {
    let now = 0;
    const issuer = createOidcVaultJwtAccessTokenIssuer(options({ now: () => now, lifetimeSeconds: 1 }));
    for (const clock of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER - 999]) {
      now = clock;
      await expect(issuer.issue(input())).rejects.toThrow(TypeError);
    }
    const zero = createOidcVaultJwtAccessTokenIssuer(options({ now: () => 0, lifetimeSeconds: 0 }));
    expect(decodeJwt((await zero.issue(input())).accessToken)).toMatchObject({ iat: 0, exp: 0 });
  });
});

describe('OVAPP-03 helper-issued vault JWT to validator/API/browser credential contract', () => {
  it.each(['body', 'cookie'] as const)(
    'exchanges and refreshes bound/unbound and zero-lifetime JWTs (%s)',
    async (sessionTransport) => {
      const pair = await generateKeyPair('ES256');
      const jwk = await exportJWK(pair.publicKey);
      const jkt = await calculateJwkThumbprint(jwk);
      const now = Date.now();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        Response.json({ token_type: 'Bearer', refresh_token: 'private-rotated-refresh' }),
      );
      for (const bound of [false, true])
        for (const lifetimeSeconds of [300, 0]) {
          const store = createMemoryOidcVaultStore({ now: () => now });
          const session = await store.createSession({
            ...input().session,
            provider: { issuer: PROVIDER, clientId: 'client_1' },
            ...(bound ? { deviceBinding: { type: 'dpop', jkt } } : {}),
          });
          const secret = randomBytes(32).toString('base64url');
          await store.createExchangeCode({
            code: 'exchange_code',
            sessionId: session.sessionId,
            createdAt: now,
            expiresAt: now + 30_000,
            ...(bound
              ? {
                  deviceBinding: session.deviceBinding,
                  browserBindingHash: createHash('sha256').update(secret, 'ascii').digest('base64url'),
                }
              : {}),
          });
          const onTokenOutcome = vi.fn<NonNullable<OidcVaultOptions['onTokenOutcome']>>();
          const onError = vi.fn();
          const operations: string[] = [];
          const app = express();
          app.use(
            createOidcVaultMiddleware({
              basePath: '/vault',
              backendOrigin: ORIGIN,
              sessionTransport,
              storeProvider: store,
              now: () => now,
              config: {
                issuer: PROVIDER,
                clientId: 'client_1',
                authorizationEndpoint: `${PROVIDER}/authorize`,
                tokenEndpoint: `${PROVIDER}/token`,
                jwksUri: `${PROVIDER}/jwks`,
              },
              deviceBinding: {},
              onTokenOutcome,
              hooks: { onError },
              tokenIssuer: createOidcVaultJwtAccessTokenIssuer(
                options({
                  now: () => now,
                  lifetimeSeconds,
                  mapClaims({ operation }) {
                    operations.push(operation);
                    return { role: 'reader' };
                  },
                }),
              ),
            }),
          );
          app.get(
            '/api/me',
            createOidcVaultAccessTokenMiddleware({
              validator: validate(),
              deviceBinding: {
                publicOrigin: ORIGIN,
                replayNamespace: 'issuer-api',
                replayStore: store,
                now: () => now,
              },
            }),
            (req, res) => res.json({ subject: req.auth?.subject, bound: !!req.auth?.deviceBinding }),
          );
          const proof = (route: string, accessToken?: string) =>
            new SignJWT({
              htm: route === '/api/me' ? 'GET' : 'POST',
              htu: `${ORIGIN}${route}`,
              iat: Math.floor(now / 1000),
              jti: randomUUID(),
              ...(accessToken ? { ath: createHash('sha256').update(accessToken, 'ascii').digest('base64url') } : {}),
            })
              .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
              .sign(pair.privateKey);
          const post = async (route: 'exchange' | 'refresh', sessionId: string) => {
            const call = request(app).post(`/vault/${route}`).set('Origin', ORIGIN);
            if (bound) call.set('DPoP', await proof(`/vault/${route}`));
            const cookies = [
              ...(sessionTransport === 'cookie' ? [`oidc_vault_session=${sessionId}`] : []),
              ...(bound && route === 'exchange' ? [`__Host-oidc_vault_transaction=${secret}`] : []),
            ];
            if (cookies.length) call.set('Cookie', cookies.join('; '));
            return call.send(
              route === 'exchange' ? { code: 'exchange_code' } : sessionTransport === 'body' ? { sessionId } : {},
            );
          };
          let sessionId = session.sessionId;
          for (const route of ['exchange', 'refresh'] as const) {
            const response = await post(route, sessionId);
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({ expiresIn: lifetimeSeconds, tokenType: bound ? 'DPoP' : 'Bearer' });
            expect(decodeJwt(response.body.accessToken)).not.toHaveProperty('sid');
            expect(JSON.stringify(decodeJwt(response.body.accessToken))).not.toMatch(/private-|upstream/);
            sessionId =
              sessionTransport === 'body'
                ? response.body.sessionId
                : response.headers['set-cookie']
                    .find((line: string) => line.startsWith('oidc_vault_session='))
                    .split(';')[0]
                    .split('=')[1];
            if (sessionTransport === 'cookie') expect(response.body).not.toHaveProperty('sessionId');
            expect(await store.getSession(sessionId)).not.toBeNull();
            if (bound) {
              const parsed = parseDpopCredentials(response.body, sessionTransport, jkt, now);
              expect(parsed.sessionId).toBe(sessionTransport === 'body' ? sessionId : undefined);
              expect(parsed.token.expiresAt).toBe((Math.floor(now / 1000) + lifetimeSeconds) * 1000);
              expect(parsed.token.expiresAt > now).toBe(lifetimeSeconds > 0);
            }
            const call = request(app)
              .get('/api/me')
              .set('Authorization', `${bound ? 'DPoP' : 'Bearer'} ${response.body.accessToken}`);
            if (bound) call.set('DPoP', await proof('/api/me', response.body.accessToken));
            const api = await call;
            expect(api.status).toBe(lifetimeSeconds === 0 ? 401 : 200);
            if (lifetimeSeconds) expect(api.body).toEqual({ subject: 'user_1', bound });
            else
              await expect(validate().validate(response.body.accessToken)).rejects.toHaveProperty(
                'code',
                'ERR_JWT_EXPIRED',
              );
          }
          expect(operations).toEqual(['exchange', 'refresh']);
          expect(onTokenOutcome.mock.calls.map(([event]) => [event.kind, event.operation])).toEqual([
            ['token-issued', 'exchange'],
            ['exchange-succeeded', 'exchange'],
            ['token-issued', 'refresh'],
          ]);
          expect(onError).not.toHaveBeenCalled();
        }
    },
  );

  it.each(['key', 'issuer', 'audience', 'expiry'] as const)(
    'rejects wrong %s in both validator methods and API',
    async (wrong) => {
      const issuer = createOidcVaultJwtAccessTokenIssuer(
        options({
          ...(wrong === 'key' ? { key: new Uint8Array(32).fill(82) } : {}),
          ...(wrong === 'issuer' ? { issuer: 'https://wrong.example.com' } : {}),
          ...(wrong === 'audience' ? { audience: 'wrong-api' } : {}),
          ...(wrong === 'expiry' ? { lifetimeSeconds: 0, now: () => Date.now() - 1000 } : {}),
        }),
      );
      const token = (await issuer.issue(input())).accessToken;
      const validator = validate();
      await expect(validator.validate(token)).rejects.toThrow();
      await expect(
        validator.validateWithRequest({ token, scheme: 'Bearer', req: {} as express.Request }),
      ).rejects.toThrow();
      const app = express();
      app.get('/me', createOidcVaultAccessTokenMiddleware({ validator }), (_req, res) => res.json({ ok: true }));
      expect((await request(app).get('/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    },
  );
});
