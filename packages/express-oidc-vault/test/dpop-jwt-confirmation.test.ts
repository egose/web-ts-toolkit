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
  new SignJWT({ sub: 'original-subject', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://issuer.example')
    .setAudience('api-audience')
    .setIssuedAt()
    .setExpirationTime('15m')
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
