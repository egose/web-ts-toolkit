import { createHash, generateKeyPairSync } from 'node:crypto';

import { exportJWK, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { createOidcVaultJwtAccessTokenValidator } from '../src/index';
import type { OidcVaultAccessTokenRequestInput, OidcVaultJwtAccessTokenValidatorOptions } from '../src/types';

const SECRET = new Uint8Array(32).fill(81);
const JKT = createHash('sha256').update('original-key').digest('base64url');
const OTHER_JKT = createHash('sha256').update('other-key').digest('base64url');
const INVALID = {
  status: 401,
  code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
  clientMessage: 'Access token validation failed.',
};
const tokenFor = (claims: Record<string, unknown>, key = SECRET): Promise<string> =>
  new SignJWT({ sub: 'original-subject', exp: Math.floor(Date.now() / 1000) + 900, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://issuer.example')
    .setAudience('api-audience')
    .setIssuedAt()
    .sign(key);
const inputFor = (token: string): OidcVaultAccessTokenRequestInput => ({
  token,
  scheme: 'DPoP',
  req: {} as OidcVaultAccessTokenRequestInput['req'],
});

describe('DBJWT-06 JWT confirmation survives verified-claims mapping', () => {
  it('implements both validator methods with mandatory null only in the request-aware unbound result', async () => {
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET });
    const token = await tokenFor({ sid: 'session', scope: 'read' });
    const legacy = await validator.validate(token);
    const aware = await validator.validateWithRequest(inputFor(token));
    expect(legacy).toMatchObject({ subject: 'original-subject', sessionId: 'session', scope: 'read' });
    expect(legacy).not.toHaveProperty('confirmation');
    expect(aware.confirmation).toBeNull();
    expect(Object.hasOwn(aware, 'confirmation')).toBe(true);
  });

  it.each(['legacy', 'request-aware'] as const)(
    'retains an immutable original cnf snapshot in %s output despite in-place deletion/rebinding',
    async (method) => {
      let mapperCnf: Record<string, unknown> | undefined;
      const mapClaims = vi.fn((claims: Record<string, unknown>) => {
        mapperCnf = claims.cnf as Record<string, unknown>;
        mapperCnf.jkt = OTHER_JKT;
        delete claims.cnf;
        return { subject: 'mapped-subject', confirmation: { jkt: OTHER_JKT }, claims: { cnf: { jkt: OTHER_JKT } } };
      });
      const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
      const token = await tokenFor({ cnf: { jkt: JKT } });
      const result = await (method === 'legacy'
        ? validator.validate(token)
        : validator.validateWithRequest(inputFor(token)));
      expect(result.subject).toBe('mapped-subject');
      expect(result.confirmation).toEqual({ jkt: JKT });
      expect(Object.isFrozen(result.confirmation)).toBe(true);
      mapperCnf!.jkt = 'mutated-again';
      expect(result.confirmation).toEqual({ jkt: JKT });
      expect(mapClaims).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['legacy', 'request-aware'] as const)(
    'discards mapper-forged confirmation for an originally unbound %s JWT',
    async (method) => {
      const validator = createOidcVaultJwtAccessTokenValidator({
        key: SECRET,
        mapClaims(claims) {
          claims.cnf = { jkt: JKT };
          return { subject: 'mapped-subject', confirmation: { jkt: JKT }, claims };
        },
      });
      const token = await tokenFor({});
      const result = await (method === 'legacy'
        ? validator.validate(token)
        : validator.validateWithRequest(inputFor(token)));
      if (method === 'legacy') expect(result).not.toHaveProperty('confirmation');
      else expect(result.confirmation).toBeNull();
    },
  );

  it('does not evaluate mapper confirmation/token/binding getters', async () => {
    const forbiddenGetter = vi.fn(() => {
      throw new Error('mapper getter must not execute');
    });
    const validator = createOidcVaultJwtAccessTokenValidator({
      key: SECRET,
      mapClaims: () => ({
        subject: 'mapped-subject',
        get confirmation() {
          return forbiddenGetter();
        },
        get token() {
          return forbiddenGetter();
        },
        get deviceBinding() {
          return forbiddenGetter();
        },
      }),
    });
    const result = await validator.validateWithRequest(inputFor(await tokenFor({ cnf: { jkt: JKT } })));
    expect(result.confirmation).toEqual({ jkt: JKT });
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('deviceBinding');
    expect(forbiddenGetter).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    'cnf',
    123,
    false,
    {},
    { jkt: null },
    { jkt: 123 },
    { jkt: '' },
    { jkt: 'A'.repeat(42) },
    { jkt: 'A'.repeat(42) + 'B' },
    { jkt: 'A'.repeat(43) + '=' },
    { jkt: `${JKT}\n` },
    { jkt: JKT, extra: 'unsupported' },
    { jwk: { kty: 'EC' } },
    { jkt: JKT, jwk: {} },
    { 'x5t#S256': JKT },
  ])('rejects malformed/unsupported verified cnf %j before mapClaims in BOTH methods', async (cnf) => {
    const mapClaims = vi.fn(() => ({ subject: 'mapped-legacy-subject' }));
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
    const token = await tokenFor({ cnf });
    await expect(validator.validate(token)).rejects.toMatchObject(INVALID);
    await expect(validator.validateWithRequest(inputFor(token))).rejects.toMatchObject(INVALID);
    expect(mapClaims).not.toHaveBeenCalled();
  });

  it('verifies signature before reading confirmation or invoking a mapper', async () => {
    const mapClaims = vi.fn(() => ({ subject: 'unused' }));
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
    const token = await tokenFor({ cnf: null }, new Uint8Array(32).fill(19));
    await expect(validator.validateWithRequest(inputFor(token))).rejects.toMatchObject({
      code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
    });
    expect(mapClaims).not.toHaveBeenCalled();
  });
});

describe('DPH-01 bound JWT deadline profile', () => {
  it.each([
    ['missing', undefined],
    ['fractional', Math.floor(Date.now() / 1000) + 900.5],
    ['unsafe seconds', Number.MAX_SAFE_INTEGER + 1],
    ['unsafe milliseconds', Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1],
  ])('rejects %s bound exp before a mapper can add or repair it in BOTH methods', async (_name, exp) => {
    const mapClaims = vi.fn((claims: Record<string, unknown>) => {
      claims.exp = Math.floor(Date.now() / 1000) + 900;
      delete claims.cnf;
      return { subject: 'mapped-subject' };
    });
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
    const token = await tokenFor({ cnf: { jkt: JKT }, exp });
    await expect(validator.validate(token)).rejects.toMatchObject(INVALID);
    await expect(validator.validateWithRequest(inputFor(token))).rejects.toMatchObject(INVALID);
    expect(mapClaims).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null, 'ERR_JWT_CLAIM_VALIDATION_FAILED'],
    ['string', '9999999999', 'ERR_JWT_CLAIM_VALIDATION_FAILED'],
    ['negative', -1, 'ERR_JWT_EXPIRED'],
    ['expired', 0, 'ERR_JWT_EXPIRED'],
  ])('retains JOSE rejection of %s exp in BOTH methods', async (_name, exp, code) => {
    const mapClaims = vi.fn(() => ({ subject: 'unused' }));
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
    const token = await tokenFor({ cnf: { jkt: JKT }, exp });
    await expect(validator.validate(token)).rejects.toMatchObject({ code });
    await expect(validator.validateWithRequest(inputFor(token))).rejects.toMatchObject({ code });
    expect(mapClaims).not.toHaveBeenCalled();
  });

  it.each([undefined, Math.floor(Date.now() / 1000) + 900.5, Number.MAX_SAFE_INTEGER])(
    'preserves generic unbound exp compatibility (%s) in BOTH methods',
    async (exp) => {
      const mapClaims = vi.fn(() => ({ subject: 'unbound-subject' }));
      const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
      const token = await tokenFor({ exp });
      expect(await validator.validate(token)).toEqual({ subject: 'unbound-subject' });
      expect(await validator.validateWithRequest(inputFor(token))).toEqual({
        subject: 'unbound-subject',
        confirmation: null,
      });
      expect(mapClaims).toHaveBeenCalledTimes(2);
    },
  );

  it('accepts the largest exp with safe milliseconds in BOTH methods', async () => {
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET });
    const token = await tokenFor({ cnf: { jkt: JKT }, exp: Math.floor(Number.MAX_SAFE_INTEGER / 1000) });
    expect((await validator.validate(token)).confirmation).toEqual({ jkt: JKT });
    expect((await validator.validateWithRequest(inputFor(token))).confirmation).toEqual({ jkt: JKT });
  });

  it('rejects noncanonical compact encoding only for bound JWTs, after JOSE verifies', async () => {
    const mapClaims = vi.fn(() => ({ subject: 'mapped-subject' }));
    const validator = createOidcVaultJwtAccessTokenValidator({ key: SECRET, mapClaims });
    // Padding changes the encoding, not the signature bytes JOSE verifies.
    const bound = `${await tokenFor({ cnf: { jkt: JKT } })}=`;
    await expect(validator.validate(bound)).rejects.toMatchObject(INVALID);
    await expect(validator.validateWithRequest(inputFor(bound))).rejects.toMatchObject(INVALID);
    expect(mapClaims).not.toHaveBeenCalled();
    expect(await validator.validate(`${await tokenFor({})}=`)).toMatchObject({ subject: 'mapped-subject' });
  });
});

describe('DBJWT-06 JWT helper construction snapshots', () => {
  it('copies caller secret, audience, allowlist and mapper/config values at creation', async () => {
    const callerKey = Buffer.alloc(64, 28);
    const key = callerKey.subarray(8, 40);
    const originalKey = Uint8Array.from(key);
    const mapClaims = vi.fn(() => ({ subject: 'original-mapper' }));
    const options: OidcVaultJwtAccessTokenValidatorOptions = {
      key,
      issuer: 'https://issuer.example',
      audience: ['api-audience'],
      algorithms: ['HS256'],
      mapClaims,
    };
    const validator = createOidcVaultJwtAccessTokenValidator(options);
    callerKey.fill(0);
    options.issuer = 'https://other-issuer.example';
    (options.audience as string[])[0] = 'other-audience';
    options.algorithms!.splice(0, 1, 'RS256');
    options.mapClaims = () => {
      throw new Error('replacement mapper');
    };
    options.key = new Uint8Array(32).fill(1);
    const token = await tokenFor({ cnf: { jkt: JKT } }, originalKey);
    const result = await validator.validateWithRequest(inputFor(token));
    expect(result.subject).toBe('original-mapper');
    expect(result.confirmation).toEqual({ jkt: JKT });
    expect(mapClaims).toHaveBeenCalledTimes(1);
  });

  it('captures a public JWT JWK instead of retaining its mutable fields', async () => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = await exportJWK(pair.publicKey);
    jwk.key_ops = ['verify'];
    const options = Object.freeze({ key: jwk, algorithms: Object.freeze(['ES256']) as unknown as string[] });
    const validator = createOidcVaultJwtAccessTokenValidator(options);
    jwk.x = 'bad';
    jwk.y = 'bad';
    jwk.key_ops[0] = 'sign';
    const token = await new SignJWT({ sub: 'asymmetric-user', cnf: { jkt: JKT } })
      .setProtectedHeader({ alg: 'ES256' })
      .setExpirationTime('15m')
      .sign(pair.privateKey);
    const result = await validator.validateWithRequest(inputFor(token));
    expect(result.subject).toBe('asymmetric-user');
    expect(result.confirmation).toEqual({ jkt: JKT });
  });
});
