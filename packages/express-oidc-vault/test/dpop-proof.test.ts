import { constants, createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import express from 'express';
import { calculateJwkThumbprint, compactVerify, exportJWK, importJWK, type JWK } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { resolveDeviceBindingOptions } from '../src/device-binding-policy';
import { extractDpopProof, verifyDpopProof } from '../src/dpop-proof';
import { createDpopReplayPolicy } from '../src/dpop-replay';
import { createOidcVaultAccessTokenMiddleware, type OidcVaultDpopAlgorithm } from '../src/index';

const NOW = 1_800_000_000_000;
const TARGET = 'https://api.example.com/api/profile';
const TOKEN = 'real-introspected-access-token';
const INVALID = { status: 401, code: 'OIDC_VAULT_INVALID_DPOP_PROOF', clientMessage: 'DPoP proof validation failed.' };
vi.mock('jose', async (importOriginal) => {
  const original = await importOriginal<typeof import('jose')>();
  // Wrapping the real crypto operations records ordering/admission; valid
  // proofs still use JOSE's actual key import and signature verification.
  return { ...original, importJWK: vi.fn(original.importJWK), compactVerify: vi.fn(original.compactVerify) };
});
interface ProofKey {
  privateKey: KeyObject;
  jwk: JWK;
  privateJwk: JWK;
  jkt: string;
}
let ec: ProofKey;
let otherEc: ProofKey;
let rsa2048: ProofKey;
let otherRsa2048: ProofKey;
let rsa4096: ProofKey;

const makeKey = async (privateKey: KeyObject, publicKey: KeyObject): Promise<ProofKey> => {
  const jwk = await exportJWK(publicKey);
  return { privateKey, jwk, privateJwk: await exportJWK(privateKey), jkt: await calculateJwkThumbprint(jwk) };
};
beforeAll(async () => {
  const pairs = [
    generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
    generateKeyPairSync('rsa', { modulusLength: 2048 }),
    generateKeyPairSync('rsa', { modulusLength: 2048 }),
    generateKeyPairSync('rsa', { modulusLength: 4096 }),
  ];
  [ec, otherEc, rsa2048, otherRsa2048, rsa4096] = await Promise.all(
    pairs.map((pair) => makeKey(pair.privateKey, pair.publicKey)),
  );
}, 30_000);

const claims = (extra: Record<string, unknown> = {}) => ({
  htm: 'GET',
  htu: TARGET,
  iat: NOW / 1000,
  jti: 'signed-proof-jti',
  ath: createHash('sha256').update(TOKEN).digest('base64url'),
  ...extra,
});
const proof = (
  options: {
    key?: ProofKey;
    signingKey?: ProofKey;
    alg?: OidcVaultDpopAlgorithm;
    header?: Record<string, unknown>;
    headerJson?: string;
    claims?: Record<string, unknown>;
    payloadBytes?: Uint8Array;
    payloadJson?: string;
  } = {},
): string => {
  const key = options.key ?? ec;
  const alg = options.alg ?? 'ES256';
  const header = Buffer.from(
    options.headerJson ?? JSON.stringify({ typ: 'dpop+jwt', alg, jwk: key.jwk, ...options.header }),
  ).toString('base64url');
  const payload = Buffer.from(
    options.payloadBytes ?? Buffer.from(options.payloadJson ?? JSON.stringify(claims(options.claims))),
  ).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(input),
    alg === 'ES256'
      ? { key: (options.signingKey ?? key).privateKey, dsaEncoding: 'ieee-p1363' }
      : {
          key: (options.signingKey ?? key).privateKey,
          padding: alg === 'PS256' ? constants.RSA_PKCS1_PSS_PADDING : constants.RSA_PKCS1_PADDING,
          saltLength: 32,
        },
  );
  return `${input}.${signature.toString('base64url')}`;
};
const verify = (
  value: string,
  algorithms: readonly OidcVaultDpopAlgorithm[] = ['ES256'],
  options: { expectedJkt?: string; accessToken?: string } = {},
) =>
  verifyDpopProof({
    proof: value,
    method: 'GET',
    targetUrl: TARGET,
    proofOptions: resolveDeviceBindingOptions({ algorithms })!,
    expectedJkt: options.expectedJkt ?? ec.jkt,
    accessToken: options.accessToken ?? TOKEN,
  });

describe('DBJWT-06 shared signature-first proof verifier', () => {
  it('returns a detached frozen verified thumbprint/algorithm/signed replay claims', async () => {
    const result = await verify(proof({ claims: { nonce: 'bounded-nonce' } }));
    expect(result).toEqual({
      binding: { type: 'dpop', jkt: ec.jkt, alg: 'ES256' },
      iat: NOW / 1000,
      jti: 'signed-proof-jti',
      nonce: 'bounded-nonce',
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.binding)).toBe(true);
    expect(result).not.toHaveProperty('jwk');
    expect(result).not.toHaveProperty('ath');
  });

  it('supports vault POSTs without ath and without a preselected key, then uses the existing shared replay policy', async () => {
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const reserve = vi.spyOn(store, 'reserveDpopProof');
    const policy = resolveDeviceBindingOptions({})!;
    const replay = createDpopReplayPolicy({
      protectionSpace: {
        type: 'vault',
        backendOrigin: 'https://api.example.com',
        basePath: '/auth/oidc',
        issuer: 'https://issuer.example',
        clientId: 'spa-client',
      },
      proofOptions: policy,
      replayStore: store,
      now: () => NOW,
    });
    const value = proof({ claims: { htm: 'POST', htu: 'https://api.example.com/auth/oidc/login', ath: undefined } });
    const result = await replay.verifyAndReserve(() =>
      verifyDpopProof({
        proof: value,
        method: 'POST',
        targetUrl: 'https://api.example.com/auth/oidc/login',
        proofOptions: policy,
      }),
    );
    expect(result).toMatchObject({ type: 'accepted', binding: { type: 'dpop', jkt: ec.jkt, alg: 'ES256' } });
    expect(reserve).toHaveBeenCalledTimes(1);
    // The same helper demands ath when its caller supplies an API token.
    await expect(
      verifyDpopProof({
        proof: value,
        method: 'POST',
        targetUrl: 'https://api.example.com/auth/oidc/login',
        proofOptions: policy,
        accessToken: TOKEN,
      }),
    ).rejects.toMatchObject(INVALID);
  });

  it('verifies signature before parsing even malformed UTF-8 payload claims', async () => {
    const invalidBytes = new Uint8Array([0xff, 0xfe, 0xc0]);
    const value = proof({ payloadBytes: invalidBytes, signingKey: otherEc });
    await expect(verify(value)).rejects.toMatchObject({
      ...INVALID,
      cause: { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' },
    });
    await expect(verify(proof({ payloadBytes: invalidBytes }))).rejects.toMatchObject({
      ...INVALID,
      cause: expect.any(TypeError),
    });
  });

  it('rejects signed duplicate payload names including escaped aliases after signature verification', async () => {
    const json = JSON.stringify(claims());
    const duplicate = `${json.slice(0, -1)},"\\u0068tm":"GET"}`;
    await expect(verify(proof({ payloadJson: duplicate }))).rejects.toMatchObject(INVALID);
    await expect(
      verify(proof({ payloadJson: `${json.slice(0, -1)},"extra":{"jti":"x","jti":"y"}}` })),
    ).rejects.toMatchObject(INVALID);
  });

  it('handles bounded deeply nested payload data without a recursive key scan', async () => {
    const json = `${JSON.stringify(claims()).slice(0, -1)},"unused":${'['.repeat(1500)}0${']'.repeat(1500)}}`;
    expect(Buffer.byteLength(json)).toBeLessThan(6000);
    await expect(verify(proof({ payloadJson: json }))).resolves.toMatchObject({ binding: { jkt: ec.jkt } });
  });

  it.each(['null', '[]', '"claims"', '{bad-json}'])(
    'rejects signed non-object/malformed payload %s',
    async (payloadJson) => {
      await expect(verify(proof({ payloadJson }))).rejects.toMatchObject(INVALID);
    },
  );

  it('captures expected key/method/target/token and allowlist before asynchronous verification', async () => {
    const policy = resolveDeviceBindingOptions({ algorithms: ['ES256'] })!;
    const input = {
      proof: proof(),
      method: 'GET',
      targetUrl: TARGET,
      accessToken: TOKEN,
      expectedJkt: ec.jkt,
      proofOptions: policy,
    };
    const pending = verifyDpopProof(input);
    input.method = 'POST';
    input.targetUrl = 'https://attacker.example';
    input.accessToken = 'other';
    input.expectedJkt = otherEc.jkt;
    await expect(pending).resolves.toMatchObject({ binding: { jkt: ec.jkt } });
  });
});

describe('DBJWT-06 bounded public-only protected header/JWK', () => {
  it('enforces all untrusted parsing/profile/size bounds BEFORE key import or signature work', async () => {
    vi.mocked(importJWK).mockClear();
    vi.mocked(compactVerify).mockClear();
    for (const value of [
      'a'.repeat(8193),
      proof({ header: { typ: 'JWT' } }),
      proof({ header: { alg: 'HS256' } }),
      proof({ header: { jku: 'https://remote.example/jwks' } }),
      proof({ header: { crit: ['custom'] } }),
      proof({ header: { jwk: ec.privateJwk } }),
      proof({ header: { jwk: { ...ec.jwk, x: 'A'.repeat(1000) } } }),
      proof({ header: { harmless: 'a'.repeat(2048) } }),
      proof({ key: rsa2048, alg: 'RS256', header: { jwk: { ...rsa2048.jwk, n: 'A'.repeat(4000) } } }),
      proof({ key: rsa2048, alg: 'RS256', header: { jwk: { ...rsa2048.jwk, e: 'A'.repeat(1000) } } }),
    ]) {
      await expect(verify(value, ['ES256', 'RS256'])).rejects.toMatchObject(INVALID);
      expect(importJWK).not.toHaveBeenCalled();
      expect(compactVerify).not.toHaveBeenCalled();
    }
    await expect(verify(proof())).resolves.toMatchObject({ binding: { jkt: ec.jkt } });
    expect(importJWK).toHaveBeenCalledTimes(1);
    expect(compactVerify).toHaveBeenCalledTimes(1);
  });

  it.each(['jku', 'x5u', 'x5c', 'x5t', 'x5t#S256', 'crit', 'b64'])(
    'rejects protected %s extensions before key use',
    async (name) => {
      await expect(
        verify(
          proof({ header: { [name]: name === 'crit' ? [] : name === 'b64' ? true : 'https://remote.example/keys' } }),
        ),
      ).rejects.toMatchObject(INVALID);
    },
  );

  it.each(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k', 'jku', 'x5u', 'x5c', 'crit'])(
    'rejects JWK private/remote/critical member %s even if empty/null',
    async (name) => {
      await expect(verify(proof({ header: { jwk: { ...ec.jwk, [name]: null } } }))).rejects.toMatchObject(INVALID);
    },
  );

  it.each([
    { typ: undefined },
    { typ: 'DPoP+JWT' },
    { typ: 'jwt' },
    { alg: 'none' },
    { alg: 'HS256' },
    { alg: 'ES384' },
    { jwk: undefined },
    { jwk: null },
    { jwk: [] },
    { jwk: { kty: 'oct', k: 'secret' } },
  ])('rejects malformed header profile %j', async (header) => {
    await expect(verify(proof({ header }))).rejects.toMatchObject(INVALID);
  });

  it.each([
    { crv: 'P-384' },
    { kty: 'OKP' },
    { x: 'A'.repeat(42) },
    { x: 'A'.repeat(43) + '=' },
    { y: 'A'.repeat(42) + 'B' },
    { x: 'A'.repeat(1000) },
    { use: 'enc' },
    { alg: 'ES384' },
    { key_ops: ['sign'] },
    { key_ops: ['verify', 'sign'] },
    { key_ops: [] },
    { kid: {} },
  ])('rejects incompatible/noncanonical EC JWK parameters %j', async (change) => {
    await expect(verify(proof({ header: { jwk: { ...ec.jwk, ...change } } }))).rejects.toMatchObject(INVALID);
  });

  it('rejects invalid P-256 points with a private import diagnostic', async () => {
    await expect(
      verify(proof({ header: { jwk: { ...ec.jwk, x: 'A'.repeat(43), y: 'A'.repeat(43) } } })),
    ).rejects.toMatchObject({ ...INVALID, cause: expect.any(Error) });
  });

  it('rejects an oversized decoded header or JWK before import, independent of the 8192-byte wire limit', async () => {
    const huge = proof({ header: { jwk: { ...ec.jwk, kid: 'a'.repeat(2048) } } });
    expect(huge.length).toBeLessThan(8192);
    await expect(verify(huge)).rejects.toMatchObject(INVALID);
  });

  it('rejects duplicate protected header/JWK names including escaped aliases', async () => {
    const json = JSON.stringify({ typ: 'dpop+jwt', alg: 'ES256', jwk: ec.jwk });
    await expect(verify(proof({ headerJson: `${json.slice(0, -1)},"alg":"ES256"}` }))).rejects.toMatchObject(INVALID);
    const jwkJson = JSON.stringify(ec.jwk);
    await expect(
      verify(
        proof({
          headerJson: `{"typ":"dpop+jwt","alg":"ES256","jwk":${jwkJson.slice(0, -1)},"\\u0078":"${ec.jwk.x}"}}`,
        }),
      ),
    ).rejects.toMatchObject(INVALID);
  });

  it('requires canonical bounded base64url for all three segments and exact ES256 signature size', async () => {
    const value = proof();
    const parts = value.split('.');
    for (const index of [0, 1, 2]) {
      const changed = [...parts];
      changed[index] += '=';
      await expect(verify(changed.join('.'))).rejects.toMatchObject(INVALID);
    }
    const shorter = Buffer.from(parts[2], 'base64url').subarray(0, 63).toString('base64url');
    await expect(verify(`${parts[0]}.${parts[1]}.${shorter}`)).rejects.toMatchObject(INVALID);
    const badHeader = Buffer.from([0xff, 0xfe]).toString('base64url');
    await expect(verify(`${badHeader}.${parts[1]}.${parts[2]}`)).rejects.toMatchObject(INVALID);
  });

  it('accepts exactly 2048 decoded header bytes but refuses 2049 before import', async () => {
    const base = { typ: 'dpop+jwt', alg: 'ES256', jwk: ec.jwk, harmless: '' };
    const baseLength = Buffer.byteLength(JSON.stringify(base));
    const exact = proof({ header: { harmless: 'a'.repeat(2048 - baseLength) } });
    expect(Buffer.from(exact.split('.')[0], 'base64url')).toHaveLength(2048);
    await expect(verify(exact)).resolves.toMatchObject({ binding: { jkt: ec.jkt } });
    const over = proof({ header: { harmless: 'a'.repeat(2049 - baseLength) } });
    await expect(verify(over)).rejects.toMatchObject(INVALID);
  });

  it('accepts the exact 8192-byte wire limit and rejects 8193', async () => {
    let filler = '';
    let value = proof({ claims: { unused: filler } });
    // Single-character increments only around the target bound; base64url
    // grows in 1/2-character steps and reaches this exact limit.
    filler = 'a'.repeat(Math.floor(((8192 - value.length) * 3) / 4));
    value = proof({ claims: { unused: filler } });
    while (value.length < 8192) {
      filler += 'a';
      value = proof({ claims: { unused: filler } });
    }
    expect(value).toHaveLength(8192);
    expect(extractDpopProof({ count: 1, value })).toBe(value);
    await expect(verify(value)).resolves.toMatchObject({ binding: { jkt: ec.jkt } });
    expect(() => extractDpopProof({ count: 1, value: `${value}a` })).toThrow();
  });
});

describe.each(['RS256', 'PS256'] as const)('DBJWT-06 explicit %s RSA policy', (alg) => {
  it.each([2048, 4096])('accepts a real %i-bit public RSA proof through API middleware', async (bits) => {
    const key = bits === 2048 ? rsa2048 : rsa4096;
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const reserve = vi.spyOn(store, 'reserveDpopProof');
    const app = express();
    app.use(
      createOidcVaultAccessTokenMiddleware({
        validator: {
          async validate() {
            throw new Error('unused');
          },
          async validateWithRequest() {
            return { subject: 'rsa-user', confirmation: { jkt: key.jkt } };
          },
        },
        deviceBinding: {
          publicOrigin: 'https://api.example.com',
          replayNamespace: 'rsa-api',
          replayStore: store,
          algorithms: [alg],
          now: () => NOW,
        },
      }),
      (req, res) => res.json(req.auth?.deviceBinding),
    );
    const response = await request(app)
      .get('/api/profile')
      .set('Authorization', `DPoP ${TOKEN}`)
      .set('DPoP', proof({ key, alg }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: 'dpop', jkt: key.jkt, alg });
    expect(reserve).toHaveBeenCalledTimes(1);
    const replay = await request(app)
      .get('/api/profile')
      .set('Authorization', `DPoP ${TOKEN}`)
      .set('DPoP', proof({ key, alg }));
    expect(replay.status).toBe(401);
    expect(replay.headers['www-authenticate']).toBe(`DPoP error="invalid_dpop_proof", algs="${alg}"`);
  });

  it('does not accept RSA unless explicitly enabled', async () => {
    await expect(verify(proof({ key: rsa2048, alg }))).rejects.toMatchObject(INVALID);
  });

  it('rejects a real wrong RSA signature and algorithm-confusion signature', async () => {
    const value = proof({ key: rsa2048, alg, signingKey: otherRsa2048 });
    await expect(verify(value, [alg], { expectedJkt: rsa2048.jkt })).rejects.toMatchObject({
      ...INVALID,
      cause: { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' },
    });
    const alternate = proof({ key: rsa2048, alg: alg === 'RS256' ? 'PS256' : 'RS256', header: { alg } });
    await expect(verify(alternate, [alg], { expectedJkt: rsa2048.jkt })).rejects.toMatchObject({
      ...INVALID,
      cause: expect.any(Error),
    });
  });

  it.each([
    { n: Buffer.alloc(255, 255).toString('base64url') }, // 2040 bits
    { n: Buffer.alloc(256, 127).toString('base64url') }, // 2047 bits
    { n: Buffer.alloc(513, 255).toString('base64url') }, // 4104 bits
    { n: 'A'.repeat(4000) },
    { n: 'not+base64' },
    { e: 'Ag' },
    { e: 'AQ' },
    { e: 'AAEAAQ' },
    { e: Buffer.alloc(513, 255).toString('base64url') },
    { e: 'AQAB=' },
    { d: null },
    { oth: [] },
  ])('rejects bounded RSA public/private parameters %j before import', async (change) => {
    await expect(
      verify(proof({ key: rsa2048, alg, header: { jwk: { ...rsa2048.jwk, ...change } } }), [alg], {
        expectedJkt: rsa2048.jkt,
      }),
    ).rejects.toMatchObject(INVALID);
  });

  it('rejects leading-zero/non-minimal RSA base64url integers', async () => {
    const n = Buffer.concat([Buffer.from([0]), Buffer.from(rsa2048.jwk.n!, 'base64url')]).toString('base64url');
    await expect(
      verify(proof({ key: rsa2048, alg, header: { jwk: { ...rsa2048.jwk, n } } }), [alg], { expectedJkt: rsa2048.jkt }),
    ).rejects.toMatchObject(INVALID);
  });
});
