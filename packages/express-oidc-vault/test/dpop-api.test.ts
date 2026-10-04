import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import http from 'node:http';

import express, { type RequestHandler } from 'express';
import { calculateJwkThumbprint, exportJWK, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { OidcVaultHttpError } from '../src/errors';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  type OidcVaultAccessTokenMiddlewareOptions,
  type OidcVaultAccessTokenValidator,
  type OidcVaultApiDeviceBindingOptions,
  type OidcVaultDeviceBindingStoreProvider,
} from '../src/index';

const ORIGIN = 'https://api.example.com';
const PATH = '/api/profile';
const NOW = 1_800_000_000_000;
const SECRET = new Uint8Array(32).fill(47);
const INVALID_PROOF = { code: 'OIDC_VAULT_INVALID_DPOP_PROOF', message: 'DPoP proof validation failed.' };
const REQUIRED = { code: 'OIDC_VAULT_DPOP_REQUIRED', message: 'DPoP authentication is required.' };
const INVALID_TOKEN = { code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN', message: 'Access token validation failed.' };
const PROOF_CHALLENGE = 'DPoP error="invalid_dpop_proof", algs="ES256"';

interface ProofKey {
  privateKey: KeyObject;
  jwk: JWK;
  privateJwk: JWK;
  jkt: string;
}
let keyA: ProofKey;
let keyB: ProofKey;

beforeAll(async () => {
  const makeKey = async (): Promise<ProofKey> => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = await exportJWK(pair.publicKey);
    return {
      privateKey: pair.privateKey,
      jwk,
      privateJwk: await exportJWK(pair.privateKey),
      jkt: await calculateJwkThumbprint(jwk),
    };
  };
  [keyA, keyB] = await Promise.all([makeKey(), makeKey()]);
});

const tokenFor = (confirmation: unknown = { jkt: keyA.jkt }, extra: Record<string, unknown> = {}): Promise<string> =>
  new SignJWT({
    sub: 'api-user',
    sid: 'local-session',
    scope: 'read:profile',
    ...(confirmation === null ? {} : { cnf: confirmation }),
    ...extra,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ORIGIN)
    .setAudience('local-api')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(SECRET);

// Raw signing permits negative protected-header/claim fixtures that a JWT
// builder would refuse to produce. The actual ES256 signature is always real.
const proofFor = (
  token: string,
  options: {
    key?: ProofKey;
    signingKey?: ProofKey;
    claims?: Record<string, unknown>;
    header?: Record<string, unknown>;
  } = {},
): string => {
  const key = options.key ?? keyA;
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: key.jwk, ...options.header };
  const claims = {
    htm: 'GET',
    htu: `${ORIGIN}${PATH}`,
    iat: NOW / 1000,
    jti: randomUUID(),
    ath: createHash('sha256').update(token, 'ascii').digest('base64url'),
    ...options.claims,
  };
  const input = [header, claims].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${input}.${sign('sha256', Buffer.from(input), { key: (options.signingKey ?? key).privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};

const fixture = (
  overrides: {
    deviceBinding?: false | Partial<OidcVaultApiDeviceBindingOptions>;
    validator?: OidcVaultAccessTokenValidator;
    store?: OidcVaultDeviceBindingStoreProvider;
    clock?: { value: number };
    onAuthContext?: OidcVaultAccessTokenMiddlewareOptions['onAuthContext'];
    onError?: OidcVaultAccessTokenMiddlewareOptions['onError'];
    before?: RequestHandler;
  } = {},
) => {
  const clock = overrides.clock ?? { value: NOW };
  const store = overrides.store ?? createMemoryOidcVaultStore({ now: () => clock.value });
  const reserve = vi.spyOn(store, 'reserveDpopProof');
  const onError = vi.fn(overrides.onError ?? (() => {}));
  const onAuthContext = vi.fn(overrides.onAuthContext ?? (() => {}));
  const downstream = vi.fn<RequestHandler>((req, res) => {
    res.json({
      subject: req.auth?.subject,
      token: req.auth?.token,
      confirmation: req.auth?.confirmation,
      deviceBinding: req.auth?.deviceBinding,
    });
  });
  const validator =
    overrides.validator ??
    createOidcVaultJwtAccessTokenValidator({
      key: SECRET,
      issuer: ORIGIN,
      audience: 'local-api',
      algorithms: ['HS256'],
    });
  const deviceBinding =
    overrides.deviceBinding === false
      ? undefined
      : ({
          publicOrigin: ORIGIN,
          replayNamespace: 'api-tests',
          replayStore: store,
          now: () => clock.value,
          ...overrides.deviceBinding,
        } satisfies OidcVaultApiDeviceBindingOptions);
  const options: OidcVaultAccessTokenMiddlewareOptions = { validator, deviceBinding, onError, onAuthContext };
  const middleware = createOidcVaultAccessTokenMiddleware(options);
  const app = express();
  if (overrides.before) app.use(overrides.before);
  app.use(middleware, downstream);
  return {
    app,
    options,
    deviceBinding,
    validator,
    middleware,
    clock,
    store,
    reserve,
    onError,
    onAuthContext,
    downstream,
  };
};

const expectProofRejection = (response: request.Response, context: ReturnType<typeof fixture>): void => {
  expect(response.status).toBe(401);
  expect(response.body).toEqual(INVALID_PROOF);
  expect(response.headers['www-authenticate']).toBe(PROOF_CHALLENGE);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['dpop-nonce']).toBeUndefined();
  expect(context.downstream).not.toHaveBeenCalled();
  expect(context.onAuthContext).not.toHaveBeenCalled();
  expect(context.reserve).not.toHaveBeenCalled();
  expect(context.onError).toHaveBeenCalledTimes(1);
};

describe.each(['optional', 'required'] as const)('DBJWT-06 real JWT/API proof matrix (%s)', (mode) => {
  it('[DBJWT-01; DBJWT-06] bound API rejects a copied JWT without proof and Bearer fallback', async () => {
    const token = await tokenFor();
    for (const scheme of ['Bearer', 'DPoP']) {
      for (const supplied of [false, true]) {
        if (scheme === 'DPoP' && supplied) continue;
        const context = fixture({ deviceBinding: { mode } });
        const call = request(context.app).get(PATH).set('Authorization', `${scheme} ${token}`);
        if (supplied) call.set('DPoP', proofFor(token));
        const response = await call;
        expect(response.status).toBe(401);
        expect(response.body).toEqual(REQUIRED);
        expect(response.headers['www-authenticate']).toBe(PROOF_CHALLENGE);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(context.downstream).not.toHaveBeenCalled();
        expect(context.reserve).not.toHaveBeenCalled();
      }
    }
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects a valid proof from a different cnf.jkt key', async () => {
    const context = fixture({ deviceBinding: { mode } });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { key: keyB }));
    expectProofRejection(response, context);
    expect(response.text).not.toContain(keyA.jkt);
    expect(response.text).not.toContain(keyB.jkt);
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects a proof with an invalid signature', async () => {
    const context = fixture({ deviceBinding: { mode } });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { signingKey: keyB }));
    expectProofRejection(response, context);
    expect(context.onError.mock.calls[0][0].error).toHaveProperty('cause');
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects wrong typ, disallowed algorithms and private JWKs', async () => {
    const token = await tokenFor();
    for (const header of [{ typ: 'JWT' }, { alg: 'HS256' }, { alg: 'none' }, { jwk: keyA.privateJwk }]) {
      const context = fixture({ deviceBinding: { mode } });
      const response = await request(context.app)
        .get(PATH)
        .set('Authorization', `DPoP ${token}`)
        .set('DPoP', proofFor(token, { header }));
      expectProofRejection(response, context);
      expect(response.text).not.toContain(keyA.privateJwk.d);
    }
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects a proof for a different HTTP method', async () => {
    const context = fixture({ deviceBinding: { mode } });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { htm: 'POST' } }));
    expectProofRejection(response, context);
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects a different public URL despite attacker Host/forwarded headers', async () => {
    const context = fixture({ deviceBinding: { mode } });
    context.app.set('trust proxy', true);
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Host', 'attacker.example')
      .set('Forwarded', 'host=attacker.example;proto=https')
      .set('X-Forwarded-Host', 'attacker.example')
      .set('X-Forwarded-Proto', 'https')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { htu: `https://attacker.example${PATH}` } }));
    expectProofRejection(response, context);
    expect(response.text).not.toContain('attacker.example');
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects ath for a different access token', async () => {
    const context = fixture({ deviceBinding: { mode } });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set(
        'DPoP',
        proofFor(token, { claims: { ath: createHash('sha256').update('other-token').digest('base64url') } }),
      );
    expectProofRejection(response, context);
  });

  it('[DBJWT-01; DBJWT-06] bound API rejects a stale proof outside the approved window', async () => {
    const context = fixture({ deviceBinding: { mode } });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { iat: NOW / 1000 - 65 } }));
    expectProofRejection(response, context);
  });

  it('accepts a fresh original-key proof only after JWT and shared replay validation', async () => {
    const context = fixture({ deviceBinding: { mode } });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `dPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subject: 'api-user',
      token,
      confirmation: { jkt: keyA.jkt },
      deviceBinding: { type: 'dpop', jkt: keyA.jkt, alg: 'ES256' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(context.reserve).toHaveBeenCalledTimes(1);
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    expect(context.downstream).toHaveBeenCalledTimes(1);
    expect(context.onError).not.toHaveBeenCalled();
  });
});

describe('DBJWT-06 verified confirmation, legacy compatibility and shared instances', () => {
  it('[DBJWT-01; DBJWT-06] custom mapClaims cannot strip or forge the bound JWT proof requirement', async () => {
    const token = await tokenFor();
    const mapper = vi.fn((claims: Record<string, unknown>) => {
      delete claims.cnf;
      return { subject: 'mapped-user', confirmation: null, claims: { cnf: { jkt: keyB.jkt } } };
    });
    const context = fixture({
      validator: createOidcVaultJwtAccessTokenValidator({ key: SECRET, algorithms: ['HS256'], mapClaims: mapper }),
    });
    const missing = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual(REQUIRED);
    const wrong = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { key: keyB }));
    expect(wrong.body).toEqual(INVALID_PROOF);
    const honest = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(honest.status).toBe(200);
    expect(honest.body).toMatchObject({
      subject: 'mapped-user',
      confirmation: { jkt: keyA.jkt },
      deviceBinding: { jkt: keyA.jkt },
    });
    expect(context.reserve).toHaveBeenCalledTimes(1);
    expect(mapper).toHaveBeenCalledTimes(3);
  });

  it('[DBJWT-01; DBJWT-06/07/08] sequential and concurrent API replay across instances has exactly one winner', async () => {
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrivals = 0;
    const jwt = createOidcVaultJwtAccessTokenValidator({ key: SECRET, issuer: ORIGIN, audience: 'local-api' });
    const adapter = {
      validate: jwt.validate,
      async validateWithRequest(input: Parameters<typeof jwt.validateWithRequest>[0]) {
        const result = await jwt.validateWithRequest(input);
        if (++arrivals === 4) release();
        if (arrivals <= 4) await gate;
        return result;
      },
    };
    const first = fixture({ store, validator: adapter });
    const second = fixture({ store, validator: adapter });
    const token = await tokenFor();
    const proof = proofFor(token);
    const call = (context: ReturnType<typeof fixture>, credential = token) =>
      request(context.app).get(PATH).set('Authorization', `DPoP ${credential}`).set('DPoP', proof);
    const responses = await Promise.all([call(first), call(second), call(second), call(first)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401, 401, 401]);
    for (const loser of responses.filter((response) => response.status === 401)) {
      expect(loser.body).toEqual(INVALID_PROOF);
      expect(loser.headers['www-authenticate']).toBe(PROOF_CHALLENGE);
    }
    expect(first.downstream.mock.calls.length + second.downstream.mock.calls.length).toBe(1);
    const replay = await call(second);
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual(INVALID_PROOF);

    // Different verified JWT and target, but the same signed key/JTI: neither
    // token hash nor route can partition the shared replay namespace.
    const otherToken = await tokenFor({ jkt: keyA.jkt }, { sid: 'other-session' });
    const otherProof = proofFor(otherToken, {
      claims: { jti: JSON.parse(Buffer.from(proof.split('.')[1], 'base64url').toString()).jti, htu: `${ORIGIN}/other` },
    });
    const other = await request(second.app)
      .get('/other')
      .set('Authorization', `DPoP ${otherToken}`)
      .set('DPoP', otherProof);
    expect(other.status).toBe(401);
    expect(other.body).toEqual(INVALID_PROOF);
  });

  it('[DBJWT-01; DBJWT-06/07] fresh original-key proofs recover across instances after replay rejection', async () => {
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const first = fixture({ store });
    const second = fixture({ store });
    const token = await tokenFor();
    const proof = proofFor(token);
    expect((await request(first.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof)).status).toBe(
      200,
    );
    expect((await request(second.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof)).body).toEqual(
      INVALID_PROOF,
    );
    for (const context of [first, second]) {
      expect(
        (await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proofFor(token)))
          .status,
      ).toBe(200);
    }
    expect(first.downstream.mock.calls.length + second.downstream.mock.calls.length).toBe(3);
  });

  it('keeps exactly validate(token) when disabled even if a request-aware method exists', async () => {
    const validate = vi.fn(async (token: string) => ({ subject: token }));
    const validateWithRequest = vi.fn(async () => ({ subject: 'must-not-run', confirmation: null }));
    const context = fixture({ deviceBinding: false, validator: { validate, validateWithRequest } });
    const response = await request(context.app).get(PATH).set('Authorization', 'Bearer legacy-token');
    expect(response.status).toBe(200);
    expect(validate.mock.calls).toEqual([['legacy-token']]);
    expect(validateWithRequest).not.toHaveBeenCalled();
    expect(context.reserve).not.toHaveBeenCalled();
  });

  it('refuses a known bound JWT downgrade when binding is disabled even with mapClaims stripping', async () => {
    const context = fixture({
      deviceBinding: false,
      validator: createOidcVaultJwtAccessTokenValidator({
        key: SECRET,
        mapClaims: () => ({ subject: 'mapped-user' }),
      }),
    });
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${await tokenFor()}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual(REQUIRED);
    expect(response.headers['www-authenticate']).toBe(PROOF_CHALLENGE);
    expect(context.downstream).not.toHaveBeenCalled();
  });

  it('permits genuinely unbound Bearer JWTs in optional mode and never upgrades them', async () => {
    const context = fixture();
    const token = await tokenFor(null);
    const bearer = await request(context.app).get(PATH).set('Authorization', `Bearer ${token}`);
    expect(bearer.status).toBe(200);
    expect(bearer.body.confirmation).toBeNull();
    expect(bearer.body).not.toHaveProperty('deviceBinding');
    const attemptedUpgrade = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(attemptedUpgrade.status).toBe(401);
    expect(attemptedUpgrade.body).toEqual(INVALID_TOKEN);
    expect(attemptedUpgrade.headers['www-authenticate']).toBe('DPoP error="invalid_token", algs="ES256"');
    expect(context.reserve).not.toHaveBeenCalled();
  });
});

describe('DBJWT-06 challenge table and bounded signed claims', () => {
  it.each(['optional', 'required'] as const)('advertises the exact no-credential %s challenge', async (mode) => {
    const context = fixture({ deviceBinding: { mode } });
    const response = await request(context.app).get(PATH);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'OIDC_VAULT_MISSING_ACCESS_TOKEN', message: 'Missing access token.' });
    expect(response.headers['www-authenticate']).toBe(
      mode === 'optional' ? 'Bearer, DPoP algs="ES256"' : 'DPoP algs="ES256"',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(context.reserve).not.toHaveBeenCalled();
  });

  it.each(['Bearer', 'DPoP'] as const)(
    'invalid %s tokens use the attempted scheme invalid_token challenge before proof work',
    async (scheme) => {
      const context = fixture({ deviceBinding: { nonce: { secret: SECRET } } });
      const response = await request(context.app)
        .get(PATH)
        .set('Authorization', `${scheme} invalid-token`)
        .set('DPoP', proofFor('invalid-token'));
      expect(response.status).toBe(401);
      expect(response.body).toEqual(INVALID_TOKEN);
      expect(response.headers['www-authenticate']).toBe(
        scheme === 'Bearer' ? 'Bearer error="invalid_token"' : 'DPoP error="invalid_token", algs="ES256"',
      );
      expect(response.headers['dpop-nonce']).toBeUndefined();
      expect(context.reserve).not.toHaveBeenCalled();
    },
  );

  it.each(['signature', 'issuer', 'audience', 'expiry'])(
    'rejects a JWT with wrong %s before nonce/replay/hook work',
    async (stage) => {
      const context = fixture({ deviceBinding: { nonce: { secret: SECRET } } });
      const token = await new SignJWT({ sub: 'api-user', cnf: { jkt: keyA.jkt } })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(stage === 'issuer' ? 'https://wrong-issuer.example' : ORIGIN)
        .setAudience(stage === 'audience' ? 'wrong-audience' : 'local-api')
        .setExpirationTime(stage === 'expiry' ? 0 : '15m')
        .sign(stage === 'signature' ? new Uint8Array(32).fill(7) : SECRET);
      const response = await request(context.app)
        .get(PATH)
        .set('Authorization', `DPoP ${token}`)
        .set('DPoP', proofFor(token));
      expect(response.status).toBe(401);
      expect(response.body).toEqual(INVALID_TOKEN);
      expect(response.headers['www-authenticate']).toBe('DPoP error="invalid_token", algs="ES256"');
      expect(response.headers['dpop-nonce']).toBeUndefined();
      expect(context.reserve).not.toHaveBeenCalled();
      expect(context.onAuthContext).not.toHaveBeenCalled();
      expect(context.downstream).not.toHaveBeenCalled();
    },
  );

  it('rejects required-mode unbound Bearer use without enrolling from a supplied proof', async () => {
    const context = fixture({ deviceBinding: { mode: 'required' } });
    const token = await tokenFor(null);
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
      message: 'A device-bound login is required.',
    });
    expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    expect(context.reserve).not.toHaveBeenCalled();
    expect(context.downstream).not.toHaveBeenCalled();
  });

  it.each(['Bearer token, DPoP token', 'DPoP token,token', 'DPoP', 'DPoP token extra', 'Basic token', 'Bearer tokén'])(
    'rejects ambiguous/malformed Authorization %s',
    async (authorization) => {
      const context = fixture();
      const response = await request(context.app).get(PATH).set('Authorization', authorization);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('OIDC_VAULT_INVALID_AUTHORIZATION_HEADER');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(context.reserve).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing iat', { iat: undefined }],
    ['string iat', { iat: String(NOW / 1000) }],
    ['negative iat', { iat: -1 }],
    ['fractional iat', { iat: NOW / 1000 + 0.5 }],
    ['unsafe iat', { iat: Number.MAX_SAFE_INTEGER + 1 }],
    ['future iat', { iat: NOW / 1000 + 6 }],
    ['missing jti', { jti: undefined }],
    ['empty jti', { jti: '' }],
    ['long jti', { jti: 'a'.repeat(129) }],
    ['unicode jti', { jti: 'aé' }],
    ['trailing newline jti', { jti: 'a\n' }],
    ['control jti', { jti: 'a\t' }],
    ['missing htm', { htm: undefined }],
    ['lowercase htm', { htm: 'get' }],
    ['missing htu', { htu: undefined }],
    ['relative htu', { htu: PATH }],
    ['bad htu escape', { htu: `${ORIGIN}/api/%xz` }],
    ['userinfo htu', { htu: `https://@api.example.com${PATH}` }],
    ['wrong path', { htu: `${ORIGIN}/wrong` }],
    ['missing ath', { ath: undefined }],
    ['padded ath', { ath: `${'A'.repeat(43)}=` }],
    ['long nonce', { nonce: 'a'.repeat(513) }],
    ['non-string nonce', { nonce: 42 }],
  ] satisfies Array<[string, Record<string, unknown>]>)(
    'rejects signed %s before replay allocation',
    async (_name, claims) => {
      const context = fixture();
      const token = await tokenFor();
      const response = await request(context.app)
        .get(PATH)
        .set('Authorization', `DPoP ${token}`)
        .set('DPoP', proofFor(token, { claims }));
      expectProofRejection(response, context);
    },
  );

  it.each([NOW / 1000 - 64, NOW / 1000 + 5])('accepts the strict valid window edge iat %i', async (iat) => {
    const context = fixture();
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { iat, jti: ' '.repeat(128) } }));
    expect(response.status).toBe(200);
    expect(context.reserve).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ expiresAt: (iat + 65) * 1000 }));
  });

  it.each(['', 'not-a-jwt', 'a.b.c.d', 'a.b.', 'a.b.c,a.b.c', 'a'.repeat(8193)])(
    'rejects malformed/oversized DPoP header %s',
    async (proof) => {
      const context = fixture();
      const response = await request(context.app)
        .get(PATH)
        .set('Authorization', `DPoP ${await tokenFor()}`)
        .set('DPoP', proof);
      expectProofRejection(response, context);
    },
  );

  it('remains compatible with valid unbound Bearer plus proof without adding a device binding', async () => {
    const context = fixture();
    const token = await tokenFor(null);
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body.confirmation).toBeNull();
    expect(response.body).not.toHaveProperty('deviceBinding');
    expect(context.reserve).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid supplied proof on optional unbound Bearer without ignoring it or enrolling', async () => {
    const context = fixture();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${await tokenFor(null)}`)
      .set('DPoP', 'invalid-proof');
    expectProofRejection(response, context);
  });
});

describe('DBJWT-06 pinned target normalization', () => {
  it.each([
    {
      path: '/api/profile?scope=ignored',
      htu: 'https://API.example.com:443/api/a/../profile?other=ignored#fragment',
      prefix: undefined,
    },
    { path: '/%7euser/%2fthing?x=1', htu: 'https://api.example.com/public/~user/%2Fthing', prefix: '/public/' },
    { path: '/%2e%2e/profile', htu: 'https://api.example.com/public/profile', prefix: '/public/stripped' },
    { path: '//attacker.example/profile', htu: 'https://api.example.com//attacker.example/profile', prefix: undefined },
    { path: '/café', htu: 'https://api.example.com/caf%C3%A9', prefix: undefined },
  ])('normalizes pinned path and proof consistently: $path', async ({ path, htu, prefix }) => {
    const context = fixture({
      deviceBinding: { publicPathPrefix: prefix },
      before: (req, _res, next) => {
        req.originalUrl = path;
        next();
      },
    });
    context.app.set('trust proxy', true);
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Host', 'attacker.example')
      .set('X-Forwarded-Host', 'attacker.example')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { htu } }));
    expect(response.status).toBe(200);
    expect(context.reserve).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://attacker.example/api/profile',
    'api/profile',
    '*',
    '/api/%xz',
    '/api\\profile',
    '/api/\u0001profile',
  ])('refuses non-origin-form or malformed request target %s', async (originalUrl) => {
    const context = fixture({
      before: (req, _res, next) => {
        req.originalUrl = originalUrl;
        next();
      },
    });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expectProofRejection(response, context);
  });

  it('preserves reserved slash escapes rather than treating them as path separators', async () => {
    const context = fixture({
      before: (req, _res, next) => {
        req.originalUrl = '/api%2fprofile';
        next();
      },
    });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expectProofRejection(response, context);
  });
});

describe('DBJWT-06 nonce/replay HTTP integration', () => {
  it('excludes optional unbound no-proof requests and never enrolls nonce-authenticated unbound proofs', async () => {
    const context = fixture({ deviceBinding: { nonce: { secret: SECRET } } });
    const token = await tokenFor(null);
    const withoutProof = await request(context.app).get(PATH).set('Authorization', `Bearer ${token}`);
    expect(withoutProof.status).toBe(200);
    expect(withoutProof.body.confirmation).toBeNull();
    expect(withoutProof.body).not.toHaveProperty('deviceBinding');
    expect(withoutProof.headers['dpop-nonce']).toBeUndefined();
    expect(context.reserve).not.toHaveBeenCalled();
    const challenge = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${token}`)
      .set('DPoP', proofFor(token));
    expect(challenge.status).toBe(401);
    expect(challenge.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expect(context.reserve).not.toHaveBeenCalled();
    const authenticated = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${token}`)
      .set('DPoP', proofFor(token, { claims: { nonce: challenge.headers['dpop-nonce'] } }));
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.confirmation).toBeNull();
    expect(authenticated.body).not.toHaveProperty('deviceBinding');
    expect(context.reserve).toHaveBeenCalledTimes(1);
  });

  it('challenges before reservation and accepts shared-instance fresh-proof retries and older parallel nonces', async () => {
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const first = fixture({ store, deviceBinding: { nonce: { secret: SECRET } } });
    const second = fixture({ store, deviceBinding: { nonce: { secret: SECRET } } });
    const token = await tokenFor();
    const challenge = await request(first.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(challenge.status).toBe(401);
    expect(challenge.body).toEqual({ code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'A fresh DPoP nonce is required.' });
    expect(challenge.headers['www-authenticate']).toBe('DPoP error="use_dpop_nonce", algs="ES256"');
    expect(challenge.headers['cache-control']).toBe('no-store');
    const nonce = challenge.headers['dpop-nonce'] as string;
    expect(Buffer.byteLength(nonce)).toBeLessThanOrEqual(512);
    expect(store.reserveDpopProof).not.toHaveBeenCalled();
    expect(first.onError).toHaveBeenCalledTimes(1);
    const secondChallenge = await request(second.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(secondChallenge.headers['dpop-nonce']).not.toBe(nonce);
    const responses = await Promise.all(
      [first, second].map((context) =>
        request(context.app)
          .get(PATH)
          .set('Authorization', `DPoP ${token}`)
          .set('DPoP', proofFor(token, { claims: { nonce } })),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    for (const response of responses) expect(response.headers['dpop-nonce']).toBeUndefined();
    expect(store.reserveDpopProof).toHaveBeenCalledTimes(2);
  });

  it.each(['signature', 'key', 'method', 'target', 'hash', 'iat', 'jti'])(
    'invalid %s never issues a nonce or reserves replay',
    async (stage) => {
      const context = fixture({ deviceBinding: { nonce: { secret: SECRET } } });
      const token = await tokenFor();
      const proof = proofFor(token, {
        ...(stage === 'signature' ? { signingKey: keyB } : stage === 'key' ? { key: keyB } : {}),
        claims:
          stage === 'method'
            ? { htm: 'POST' }
            : stage === 'target'
              ? { htu: `${ORIGIN}/other` }
              : stage === 'hash'
                ? { ath: 'bad' }
                : stage === 'iat'
                  ? { iat: NOW / 1000 - 65 }
                  : stage === 'jti'
                    ? { jti: '' }
                    : {},
      });
      const response = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof);
      expectProofRejection(response, context);
    },
  );

  it('nonce response writes exactly one bounded raw header', async () => {
    const context = fixture({ deviceBinding: { nonce: { secret: SECRET } } });
    const token = await tokenFor();
    const response = await rawCall(context.app, ['Authorization', `DPoP ${token}`, 'DPoP', proofFor(token)]);
    expect(response.status).toBe(401);
    expect(
      response.rawHeaders.filter((name, index) => index % 2 === 0 && name.toLowerCase() === 'dpop-nonce'),
    ).toHaveLength(1);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(context.reserve).not.toHaveBeenCalled();
  });

  it('expired or cross-space/wrong-key nonces challenge without consuming a JTI', async () => {
    const clock = { value: NOW };
    const first = fixture({ clock, deviceBinding: { nonce: { secret: SECRET, lifetimeSeconds: 1 } } });
    const token = await tokenFor();
    const challenge = await request(first.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    const nonce = challenge.headers['dpop-nonce'];
    clock.value += 1000;
    const expired = await request(first.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { iat: clock.value / 1000, nonce } }));
    expect(expired.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    const otherSpace = fixture({ deviceBinding: { replayNamespace: 'other-space', nonce: { secret: SECRET } } });
    const foreign = await request(otherSpace.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { nonce } }));
    expect(foreign.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    const otherToken = await tokenFor({ jkt: keyB.jkt });
    const otherKey = fixture({ deviceBinding: { nonce: { secret: SECRET } } });
    const wrongKey = await request(otherKey.app)
      .get(PATH)
      .set('Authorization', `DPoP ${otherToken}`)
      .set('DPoP', proofFor(otherToken, { key: keyB, claims: { nonce } }));
    expect(wrongKey.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    for (const context of [first, otherSpace, otherKey]) expect(context.reserve).not.toHaveBeenCalled();
  });

  it('fails closed at actual shared capacity, gives duplicate precedence and recovers after expiry', async () => {
    const clock = { value: NOW };
    const store = createMemoryOidcVaultStore({ now: () => clock.value, dpopReplayMaxEntries: 1 });
    const context = fixture({ clock, store });
    const token = await tokenFor();
    const proof = proofFor(token);
    expect((await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof)).status).toBe(
      200,
    );
    const full = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(full.status).toBe(503);
    expect(full.body).toEqual({
      code: 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
      message: 'DPoP replay protection is unavailable.',
    });
    expect(full.headers['www-authenticate']).toBeUndefined();
    expect(full.headers['cache-control']).toBe('no-store');
    const replay = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof);
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual(INVALID_PROOF);
    clock.value += 65_000;
    const fresh = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { iat: clock.value / 1000 } }));
    expect(fresh.status).toBe(200);
  });

  it('retains replay state after a protected-route failure and permits a fresh-proof retry', async () => {
    let fail = true;
    const error = new Error('protected-route private failure');
    const context = fixture();
    context.downstream.mockImplementation((req, res, next) => {
      if (fail) next(error);
      else res.json({ ok: true, deviceBinding: req.auth?.deviceBinding });
    });
    context.app.use(((caught, _req, res, _next) => {
      void [_req, _next];
      expect(caught).toBe(error);
      res.status(500).json({ code: 'APP_ROUTE_FAILED' });
    }) as express.ErrorRequestHandler);
    const token = await tokenFor();
    const proof = proofFor(token);
    const failed = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof);
    expect(failed.status).toBe(500);
    expect(failed.headers['cache-control']).toBe('no-store');
    fail = false;
    const replay = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof);
    expect(replay.body).toEqual(INVALID_PROOF);
    const retry = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(retry.status).toBe(200);
    expect(context.downstream).toHaveBeenCalledTimes(2);
    expect(context.reserve).toHaveBeenCalledTimes(3);
  });

  it('maps original provider failures privately without auth, diagnostic leakage or a non-401 challenge', async () => {
    const context = fixture({
      onError: ({ req }) => {
        expect(req.auth).toBeUndefined();
        throw new Error('observer-secret');
      },
    });
    const cause = new Error('mongodb://user:private-password@private-host'); // pragma: allowlist secret
    context.reserve.mockRejectedValue(cause);
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
      message: 'DPoP replay protection is unavailable.',
    });
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(response.text).not.toContain('private');
    expect(response.text).not.toContain('observer-secret');
    expect(context.onError).toHaveBeenCalledTimes(1);
    expect(context.onError.mock.calls[0][0].error).toHaveProperty('cause', cause);
    expect(context.downstream).not.toHaveBeenCalled();
    expect(context.onAuthContext).not.toHaveBeenCalled();
  });
});

describe('DBJWT-06 auth-context veto authority', () => {
  it.each([
    {
      error: new Error('hook-private-diagnostic'),
      status: 500,
      body: { code: 'OIDC_VAULT_AUTH_CONTEXT_FAILED', message: 'Auth context hook failed.' },
      challenge: undefined,
    },
    {
      error: new OidcVaultHttpError(403, 'APP_FORBIDDEN', 'private veto detail', 'Forbidden.'),
      status: 403,
      body: { code: 'APP_FORBIDDEN', message: 'Forbidden.' },
      challenge: undefined,
    },
    {
      error: new OidcVaultHttpError(401, 'APP_REAUTH', 'private veto detail', 'Sign in again.'),
      status: 401,
      body: { code: 'APP_REAUTH', message: 'Sign in again.' },
      challenge: 'DPoP error="invalid_token", algs="ES256"',
    },
  ])(
    'keeps bound valid-token hook veto status $status and never releases replay',
    async ({ error, status, body, challenge }) => {
      let capturedReq: express.Request | undefined;
      const context = fixture({
        onAuthContext({ req }) {
          capturedReq = req;
          throw error;
        },
        onError({ req }) {
          expect(req.auth).toBeUndefined();
          req.auth = { token: 'forged', subject: 'forged' };
          throw new Error('observer failed');
        },
      });
      const token = await tokenFor();
      const proof = proofFor(token);
      const rejected = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof);
      expect(rejected.status).toBe(status);
      expect(rejected.body).toEqual(body);
      expect(rejected.headers['www-authenticate']).toBe(challenge);
      expect(rejected.headers['cache-control']).toBe('no-store');
      expect(rejected.text).not.toContain('private');
      expect(capturedReq?.auth).toBeUndefined();
      expect(context.onError).toHaveBeenCalledTimes(1);
      expect(context.onError.mock.calls[0][0].error).toBe(error);
      expect(context.onError.mock.calls[0][0].auth).toMatchObject({ token, deviceBinding: { jkt: keyA.jkt } });
      expect(context.reserve).toHaveBeenCalledTimes(1);
      expect(context.downstream).not.toHaveBeenCalled();
      const replay = await request(context.app).get(PATH).set('Authorization', `DPoP ${token}`).set('DPoP', proof);
      expect(replay.body).toEqual(INVALID_PROOF);
      expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    },
  );

  it('restores original token/confirmation/binding and req.auth after a mutable successful hook', async () => {
    const context = fixture({
      onAuthContext({ req, res, auth }) {
        expect(Object.isFrozen(auth.deviceBinding)).toBe(true);
        expect(Object.isFrozen(auth.confirmation)).toBe(true);
        auth.token = 'replaced';
        auth.confirmation = null;
        auth.deviceBinding = { type: 'dpop', jkt: keyB.jkt, alg: 'RS256' };
        auth.subject = 'hook-mapped-subject';
        req.auth = { subject: 'forged', token: 'forged' };
        res.setHeader('Cache-Control', 'public');
      },
    });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subject: 'hook-mapped-subject',
      token,
      confirmation: { jkt: keyA.jkt },
      deviceBinding: { type: 'dpop', jkt: keyA.jkt, alg: 'ES256' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not evaluate replacement hook security getters when restoring authenticated authority', async () => {
    const getter = vi.fn(() => {
      throw new Error('security getter must not execute');
    });
    const context = fixture({
      onAuthContext({ auth }) {
        for (const key of ['token', 'confirmation', 'deviceBinding'])
          Object.defineProperty(auth, key, { get: getter, enumerable: true });
      },
    });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ token, confirmation: { jkt: keyA.jkt }, deviceBinding: { jkt: keyA.jkt } });
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps throwing mapped hook getters inside the hook-failure boundary (explicit veto: %s)',
    async (explicitVeto) => {
      const getterError = new Error('private mapped getter failure');
      const veto = new OidcVaultHttpError(403, 'APP_VETO', 'private veto failure', 'Denied.');
      let captured: express.Request | undefined;
      const context = fixture({
        onAuthContext({ req, auth }) {
          captured = req;
          Object.defineProperty(auth, 'subject', {
            get() {
              throw getterError;
            },
            enumerable: true,
          });
          if (explicitVeto) throw veto;
        },
      });
      const token = await tokenFor();
      const response = await request(context.app)
        .get(PATH)
        .set('Authorization', `DPoP ${token}`)
        .set('DPoP', proofFor(token));
      expect(response.status).toBe(explicitVeto ? 403 : 500);
      expect(response.body).toEqual(
        explicitVeto
          ? { code: 'APP_VETO', message: 'Denied.' }
          : { code: 'OIDC_VAULT_AUTH_CONTEXT_FAILED', message: 'Auth context hook failed.' },
      );
      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(captured?.auth).toBeUndefined();
      expect(context.onError).toHaveBeenCalledTimes(1);
      expect(context.onError.mock.calls[0][0].error).toBe(explicitVeto ? veto : getterError);
      expect(context.onError.mock.calls[0][0].auth).toMatchObject({
        subject: 'api-user',
        token,
        deviceBinding: { jkt: keyA.jkt },
      });
      expect(context.downstream).not.toHaveBeenCalled();
      expect(context.reserve).toHaveBeenCalledTimes(1);
    },
  );

  it('clears prior and validator-injected req.auth before a proof failure', async () => {
    let captured: express.Request | undefined;
    const jwt = createOidcVaultJwtAccessTokenValidator({ key: SECRET });
    const context = fixture({
      before(req, _res, next) {
        req.auth = { subject: 'previous-user', token: 'previous-token' };
        next();
      },
      validator: {
        validate: jwt.validate,
        async validateWithRequest(input) {
          captured = input.req;
          expect(input.req.auth).toBeUndefined();
          input.req.auth = { subject: 'validator-injected', token: 'injected' };
          return jwt.validateWithRequest(input);
        },
      },
      onError({ req }) {
        expect(req.auth).toBeUndefined();
      },
    });
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${await tokenFor()}`);
    expect(response.body).toEqual(REQUIRED);
    expect(captured?.auth).toBeUndefined();
    expect(context.downstream).not.toHaveBeenCalled();
  });

  it('forwards the original hook error after headers are sent while detaching auth', async () => {
    const error = new Error('hook failed after write');
    let captured: express.Request | undefined;
    const context = fixture({
      onAuthContext({ req, res }) {
        captured = req;
        res.status(202).json({ accepted: true });
        throw error;
      },
    });
    const errorHandler = vi.fn<express.ErrorRequestHandler>((caught, _req, _res, _next) => {
      void [_req, _res, _next];
      expect(caught).toBe(error);
    });
    context.app.use(errorHandler);
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(202);
    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(captured?.auth).toBeUndefined();
    expect(context.downstream).not.toHaveBeenCalled();
    expect(context.reserve).toHaveBeenCalledTimes(1);
  });

  it('captures sanitized status/body/challenge before a mutable error observer runs', async () => {
    const original = new OidcVaultHttpError(403, 'APP_DENIED', 'private original', 'Denied.');
    const context = fixture({
      onAuthContext() {
        throw original;
      },
      onError({ error, res }) {
        Object.assign(error as object, { status: 401, code: 'PRIVATE_CHANGED', clientMessage: 'observer-secret' });
        res.setHeader('WWW-Authenticate', 'Bearer error_description="observer-secret"');
        res.setHeader('DPoP-Nonce', 'observer-secret');
      },
    });
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'APP_DENIED', message: 'Denied.' });
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(response.headers['dpop-nonce']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain('observer-secret');
    expect(context.onError).toHaveBeenCalledTimes(1);
  });
});

describe('DBJWT-06 custom trusted adapter requirements and mutation', () => {
  it('requires a request-aware adapter at construction without invoking or allocating anything', () => {
    const validate = vi.fn(async () => ({ subject: 'legacy-user' }));
    const reserveDpopProof = vi.fn(async () => true);
    expect(() =>
      createOidcVaultAccessTokenMiddleware({
        validator: { validate },
        deviceBinding: {
          publicOrigin: ORIGIN,
          replayNamespace: 'custom-api',
          replayStore: { reserveDpopProof },
        },
      }),
    ).toThrow('validateWithRequest');
    expect(validate).not.toHaveBeenCalled();
    expect(reserveDpopProof).not.toHaveBeenCalled();
  });

  it('refuses a bound confirmation reported by a legacy custom adapter and preserves the exact invocation', async () => {
    const validate = vi.fn(async () => ({ subject: 'legacy-subject', confirmation: { jkt: keyA.jkt } }));
    const context = fixture({ deviceBinding: false, validator: { validate } });
    const response = await request(context.app).get(PATH).set('Authorization', 'Bearer known-bound-token');
    expect(response.status).toBe(401);
    expect(response.body).toEqual(REQUIRED);
    expect(response.headers['www-authenticate']).toBe(PROOF_CHALLENGE);
    expect(validate.mock.calls).toEqual([['known-bound-token']]);
    expect(context.downstream).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
    { jkt: 'bad' },
    { jkt: 'A'.repeat(42) + 'B' },
    { jkt: 'A'.repeat(43), extra: true },
    { jwk: {} },
    [],
  ])('refuses missing/malformed request-aware confirmation %j', async (confirmation) => {
    const validate = vi.fn(async () => ({ subject: 'legacy-path-must-not-run' }));
    const validateWithRequest = vi.fn(async () => ({
      subject: 'custom-user',
      ...(confirmation === undefined ? {} : { confirmation }),
    }));
    const context = fixture({
      validator: { validate, validateWithRequest } as unknown as OidcVaultAccessTokenValidator,
    });
    const response = await request(context.app).get(PATH).set('Authorization', 'Bearer custom-token');
    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_TOKEN);
    expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    expect(validate).not.toHaveBeenCalled();
    expect(validateWithRequest).toHaveBeenCalledTimes(1);
    expect(context.reserve).not.toHaveBeenCalled();
    expect(context.downstream).not.toHaveBeenCalled();
  });

  it.each(['Bearer', 'DPoP'] as const)(
    'passes exact token/normalized %s scheme/real Request to validateWithRequest',
    async (scheme) => {
      let reqAtAdapter: express.Request | undefined;
      const validate = vi.fn(async () => ({ subject: 'unused' }));
      const validateWithRequest = vi.fn(
        async (input: { token: string; scheme: 'Bearer' | 'DPoP'; req: express.Request }) => {
          reqAtAdapter = input.req;
          expect(input.req.auth).toBeUndefined();
          expect(Object.keys(input).sort()).toEqual(['req', 'scheme', 'token']);
          return { subject: 'introspected-user', confirmation: scheme === 'DPoP' ? { jkt: keyA.jkt } : null };
        },
      );
      const context = fixture({ validator: { validate, validateWithRequest } });
      const token = 'opaque-ascii-token';
      const call = request(context.app).get(PATH).set('Authorization', `${scheme.toLowerCase()} ${token}`);
      if (scheme === 'DPoP') call.set('DPoP', proofFor(token));
      const response = await call;
      expect(response.status).toBe(200);
      expect(validate).not.toHaveBeenCalled();
      expect(validateWithRequest.mock.calls).toEqual([[{ token, scheme, req: reqAtAdapter }]]);
      expect(response.body.subject).toBe('introspected-user');
      if (scheme === 'DPoP') expect(response.body.deviceBinding.jkt).toBe(keyA.jkt);
      else expect(response.body).not.toHaveProperty('deviceBinding');
    },
  );

  it('uses pre-adapter target/proof/token snapshots despite request-header/method/URL mutation', async () => {
    const token = 'opaque-snapshot-token';
    const validateWithRequest = vi.fn(
      async (input: { token: string; scheme: 'Bearer' | 'DPoP'; req: express.Request }) => {
        input.req.method = 'POST';
        input.req.originalUrl = '/rewritten';
        input.req.headers.authorization = 'Bearer another-token';
        input.req.rawHeaders.splice(0, input.req.rawHeaders.length, 'Authorization', 'Bearer other', 'DPoP', 'invalid');
        return { subject: 'custom-user', confirmation: { jkt: keyA.jkt } };
      },
    );
    const context = fixture({
      validator: {
        async validate() {
          throw new Error('unused');
        },
        validateWithRequest,
      },
    });
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body.token).toBe(token);
    expect(response.body.deviceBinding.jkt).toBe(keyA.jkt);
    expect(context.reserve).toHaveBeenCalledTimes(1);
  });

  it('captures the original callable methods even if the caller replaces adapter methods after construction', async () => {
    const originalAware = vi.fn(async () => ({ subject: 'original-adapter', confirmation: null }));
    const originalLegacy = vi.fn(async () => ({ subject: 'original-adapter' }));
    const validator = { validate: originalLegacy, validateWithRequest: originalAware };
    const context = fixture({ validator });
    validator.validateWithRequest = vi.fn(async () => {
      throw new Error('replacement aware method');
    });
    validator.validate = vi.fn(async () => {
      throw new Error('replacement legacy method');
    });
    const response = await request(context.app).get(PATH).set('Authorization', 'Bearer custom-token');
    expect(response.status).toBe(200);
    expect(response.body.subject).toBe('original-adapter');
    expect(originalAware).toHaveBeenCalledTimes(1);
    expect(originalLegacy).not.toHaveBeenCalled();
    expect(validator.validateWithRequest).not.toHaveBeenCalled();
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it('cannot repair the original invalid method proof by rewriting the Request in the adapter', async () => {
    const context = fixture({
      validator: {
        async validate() {
          throw new Error('unused');
        },
        async validateWithRequest({ req }) {
          req.method = 'POST';
          req.originalUrl = '/other';
          return { subject: 'custom-user', confirmation: { jkt: keyA.jkt } };
        },
      },
    });
    const token = 'opaque-token';
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { htm: 'POST', htu: `${ORIGIN}/other` } }));
    expectProofRejection(response, context);
  });

  it('snapshots adapter confirmation and mapped fields before an asynchronous replay provider mutates its result', async () => {
    const result = { subject: 'custom-user', confirmation: { jkt: keyA.jkt } };
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const originalReserve = store.reserveDpopProof.bind(store);
    const context = fixture({
      store,
      validator: {
        async validate() {
          throw new Error('unused');
        },
        async validateWithRequest() {
          return result;
        },
      },
    });
    context.reserve.mockImplementation(async (input) => {
      result.confirmation.jkt = keyB.jkt;
      result.subject = 'mutated-user';
      return originalReserve(input);
    });
    const token = 'opaque-token';
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      subject: 'custom-user',
      confirmation: { jkt: keyA.jkt },
      deviceBinding: { jkt: keyA.jkt },
    });
  });

  it('captures each adapter confirmation/mapped getter once and clears getter-injected auth before replay', async () => {
    let adapterReq: express.Request | undefined;
    const getters = {
      jkt: vi.fn(() => keyA.jkt),
      confirmation: vi.fn(() => ({
        get jkt() {
          return getters.jkt();
        },
      })),
      subject: vi.fn(() => 'getter-user'),
      sessionId: vi.fn(() => 'getter-session'),
      scope: vi.fn(() => 'getter-scope'),
      claims: vi.fn(() => {
        adapterReq!.auth = { token: 'injected', subject: 'injected' };
        return { custom: true };
      }),
    };
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const originalReserve = store.reserveDpopProof.bind(store);
    const context = fixture({
      store,
      validator: {
        async validate() {
          throw new Error('unused');
        },
        async validateWithRequest({ req }) {
          adapterReq = req;
          return {
            get confirmation() {
              return getters.confirmation();
            },
            get subject() {
              return getters.subject();
            },
            get sessionId() {
              return getters.sessionId();
            },
            get scope() {
              return getters.scope();
            },
            get claims() {
              return getters.claims();
            },
          };
        },
      },
    });
    context.reserve.mockImplementation(async (input) => {
      expect(adapterReq!.auth).toBeUndefined();
      return originalReserve(input);
    });
    const token = 'getter-access-token';
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      subject: 'getter-user',
      confirmation: { jkt: keyA.jkt },
      deviceBinding: { jkt: keyA.jkt },
    });
    for (const getter of Object.values(getters)) expect(getter).toHaveBeenCalledTimes(1);
  });

  it('does not even read a request-aware method getter on the disabled legacy path', async () => {
    const getter = vi.fn(() => {
      throw new Error('legacy path must not read request-aware configuration');
    });
    const validate = vi.fn(async () => ({ subject: 'legacy-user' }));
    const context = fixture({
      deviceBinding: false,
      validator: {
        validate,
        get validateWithRequest() {
          return getter();
        },
      },
    });
    const response = await request(context.app).get(PATH).set('Authorization', 'Bearer legacy-token');
    expect(response.status).toBe(200);
    expect(validate.mock.calls).toEqual([['legacy-token']]);
    expect(getter).not.toHaveBeenCalled();
  });

  it('ignores adapter-supplied token/deviceBinding getters instead of elevating them into req.auth', async () => {
    const attackerGetter = vi.fn(() => {
      throw new Error('must not evaluate an adapter security extension');
    });
    const result = {
      subject: 'custom-user',
      confirmation: null,
      get token() {
        return attackerGetter();
      },
      get deviceBinding() {
        return attackerGetter();
      },
    };
    const context = fixture({
      validator: {
        async validate() {
          return result;
        },
        async validateWithRequest() {
          return result;
        },
      },
    });
    const response = await request(context.app).get(PATH).set('Authorization', 'Bearer genuine-token');
    expect(response.status).toBe(200);
    expect(response.body.token).toBe('genuine-token');
    expect(response.body).not.toHaveProperty('deviceBinding');
    expect(attackerGetter).not.toHaveBeenCalled();
  });
});

describe('DBJWT-06 construction policy snapshot', () => {
  const valid = (): OidcVaultApiDeviceBindingOptions => ({
    publicOrigin: ORIGIN,
    replayNamespace: 'static-api',
    replayStore: {
      async reserveDpopProof() {
        return true;
      },
    },
  });
  const adapter = {
    async validate() {
      return { subject: 'user' };
    },
    async validateWithRequest() {
      return { subject: 'user', confirmation: null };
    },
  };

  it.each([
    { mode: 'other' },
    { algorithms: [] },
    { algorithms: ['HS256'] },
    { proofMaxAgeSeconds: 0 },
    { proofMaxAgeSeconds: 301 },
    { proofMaxAgeSeconds: 0.5 },
    { clockSkewSeconds: -1 },
    { clockSkewSeconds: 31 },
    { nonce: null },
    { nonce: { secret: new Uint8Array(31) } },
    { nonce: { secret: SECRET, lifetimeSeconds: 301 } },
    { publicOrigin: 'http://api.example.com' },
    { publicOrigin: 'https://api.example.com/path' },
    { publicOrigin: 'https://api.example.com?query' },
    { publicOrigin: 'https://api.example.com#fragment' },
    { publicOrigin: 'https://user@api.example.com' },
    { publicOrigin: 'ftp://api.example.com' },
    { publicPathPrefix: 'relative' },
    { publicPathPrefix: '/prefix?query' },
    { publicPathPrefix: '/prefix#fragment' },
    { publicPathPrefix: '/prefix\\x' },
    { publicPathPrefix: '/prefix/%xz' },
    { publicPathPrefix: null },
    { replayNamespace: '' },
    { replayNamespace: 'a'.repeat(129) },
    { replayNamespace: 'line\nbreak' },
    { replayNamespace: 'unicode-é' },
    { replayStore: {} },
    { now: 'clock' },
  ])('rejects invalid configured policy %j before any replay work', (invalid) => {
    expect(() =>
      createOidcVaultAccessTokenMiddleware({
        validator: adapter,
        deviceBinding: { ...valid(), ...invalid } as unknown as OidcVaultApiDeviceBindingOptions,
      }),
    ).toThrow();
  });

  it('rejects nonplain/null deviceBinding containers', () => {
    for (const deviceBinding of [null, [], new Date(), false]) {
      expect(() =>
        createOidcVaultAccessTokenMiddleware({
          validator: adapter,
          deviceBinding,
        } as unknown as OidcVaultAccessTokenMiddlewareOptions),
      ).toThrow('plain options');
    }
  });

  it('supports frozen plain options, loopback HTTP and normalized external prefixes', async () => {
    const options = Object.freeze({
      validator: adapter,
      deviceBinding: Object.freeze({
        ...valid(),
        publicOrigin: 'http://LOCALHOST:80/',
        publicPathPrefix: '/mount/a/../%7eapi/',
        algorithms: Object.freeze(['ES256'] as const),
      }),
    });
    expect(typeof createOidcVaultAccessTokenMiddleware(options)).toBe('function');
    expect(options.deviceBinding.publicOrigin).toBe('http://LOCALHOST:80/');
    expect(options.deviceBinding.publicPathPrefix).toBe('/mount/a/../%7eapi/');
  });

  it('retains mode/origin/path/window/allowlist/namespace/clock/replay/callback snapshots after caller mutation', async () => {
    const context = fixture({
      deviceBinding: {
        publicPathPrefix: '/external',
        mode: 'optional',
        algorithms: ['ES256'],
        proofMaxAgeSeconds: 60,
        clockSkewSeconds: 5,
      },
    });
    const configured = context.deviceBinding!;
    const originalNamespace = configured.replayNamespace;
    const originalStore = configured.replayStore;
    const replacementReserve = vi.fn(async () => {
      throw new Error('replacement store');
    });
    configured.mode = 'required';
    configured.publicOrigin = 'https://replacement.example';
    configured.publicPathPrefix = '/replacement';
    configured.proofMaxAgeSeconds = 1;
    configured.clockSkewSeconds = 0;
    (configured.algorithms as string[]).splice(0, 1, 'RS256');
    configured.replayNamespace = 'replacement-api';
    configured.replayStore = { reserveDpopProof: replacementReserve };
    configured.now = () => NOW + 100_000;
    context.options.validator = {
      async validate() {
        throw new Error('replacement adapter');
      },
    };
    context.options.onAuthContext = () => {
      throw new Error('replacement hook');
    };
    context.options.onError = () => {
      throw new Error('replacement observer');
    };
    const token = await tokenFor();
    const response = await request(context.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set(
        'DPoP',
        proofFor(token, { claims: { htu: `${ORIGIN}/external${PATH}`, iat: NOW / 1000 - 10, jti: 'snapshot-jti' } }),
      );
    expect(response.status).toBe(200);
    const namespace = ['api', ORIGIN, originalNamespace];
    expect(originalStore.reserveDpopProof).toHaveBeenCalledExactlyOnceWith({
      replayKey: `dpop:v1:${createHash('sha256')
        .update(JSON.stringify([namespace, keyA.jkt, 'snapshot-jti']))
        .digest('base64url')}`,
      expiresAt: NOW + 55_000,
    });
    expect(replacementReserve).not.toHaveBeenCalled();
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    const unbound = await request(context.app)
      .get(PATH)
      .set('Authorization', `Bearer ${await tokenFor(null)}`);
    expect(unbound.status).toBe(200);
  });

  it('copies nonce secret bytes rather than retaining a caller Buffer/subarray', async () => {
    const caller = Buffer.alloc(64, 39);
    const secret = caller.subarray(8, 40);
    const copy = Uint8Array.from(secret);
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const first = fixture({ store, deviceBinding: { nonce: { secret } } });
    caller.fill(0);
    const second = fixture({ store, deviceBinding: { nonce: { secret: copy } } });
    const token = await tokenFor();
    const challenge = await request(first.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token));
    const accepted = await request(second.app)
      .get(PATH)
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proofFor(token, { claims: { nonce: challenge.headers['dpop-nonce'] } }));
    expect(accepted.status).toBe(200);
  });

  it('captures each configured public URL/service/clock field once at construction', () => {
    const getters = {
      publicOrigin: vi.fn(() => ORIGIN),
      publicPathPrefix: vi.fn(() => '/external'),
      replayNamespace: vi.fn(() => 'static-api'),
      replayStore: vi.fn(() => valid().replayStore),
      now: vi.fn(() => () => NOW),
    };
    createOidcVaultAccessTokenMiddleware({
      validator: adapter,
      deviceBinding: {
        get publicOrigin() {
          return getters.publicOrigin();
        },
        get publicPathPrefix() {
          return getters.publicPathPrefix();
        },
        get replayNamespace() {
          return getters.replayNamespace();
        },
        get replayStore() {
          return getters.replayStore();
        },
        get now() {
          return getters.now();
        },
      },
    });
    for (const getter of Object.values(getters)) expect(getter).toHaveBeenCalledTimes(1);
  });
});

// A real Node HTTP client preserves repeated field lines. req.headers alone
// would conceal duplicate Authorization and comma-join duplicate DPoP values.
const rawCall = async (app: express.Express, headers: string[]) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback listener.');
  try {
    return await new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      body: unknown;
      rawHeaders: string[];
    }>((resolve, reject) => {
      const call = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: PATH,
          headers: ['Host', '127.0.0.1', 'Connection', 'close', ...headers],
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            try {
              resolve({
                status: response.statusCode!,
                headers: response.headers,
                rawHeaders: response.rawHeaders,
                body: JSON.parse(Buffer.concat(chunks).toString()),
              });
            } catch (error) {
              reject(error);
            }
          });
          response.on('error', reject);
        },
      );
      call.on('error', reject);
      call.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

describe('DBJWT-06 unambiguous raw HTTP fields', () => {
  it.each(['Authorization', 'aUtHoRiZaTiOn'])(
    'rejects duplicate %s fields hidden by Node header selection',
    async (name) => {
      const context = fixture();
      const token = await tokenFor();
      const response = await rawCall(context.app, [
        'Authorization',
        `DPoP ${token}`,
        name,
        `Bearer ${token}`,
        'DPoP',
        proofFor(token),
      ]);
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER' });
      expect(context.reserve).not.toHaveBeenCalled();
      expect(context.downstream).not.toHaveBeenCalled();
    },
  );

  it.each(['DPoP', 'dPoP'])('rejects duplicate %s fields using raw multiplicity', async (name) => {
    const context = fixture();
    const token = await tokenFor();
    const proof = proofFor(token);
    const response = await rawCall(context.app, ['Authorization', `DPoP ${token}`, 'DPoP', proof, name, proof]);
    expect(response.status).toBe(401);
    expect(response.body).toEqual(INVALID_PROOF);
    expect(response.headers['www-authenticate']).toBe(PROOF_CHALLENGE);
    expect(context.reserve).not.toHaveBeenCalled();
    expect(context.downstream).not.toHaveBeenCalled();
  });
});
