import { createHash } from 'node:crypto';

import { calculateJwkThumbprint, decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { createDpopProof } from '../src/auth/dpop-proof';
import type { DpopKey } from '../src/auth/dpop-key-store';
import { normalizeDpopTarget, resolveDpopScope } from '../src/auth/scope';
import { normalizeDpopProofTarget } from '../../../packages/express-oidc-vault/src/dpop-target';

let key: DpopKey;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  key = {
    privateKey: pair.privateKey,
    publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x!, y: publicJwk.y! },
    jkt: await calculateJwkThumbprint(publicJwk),
    scopeId: 'unit',
  };
});

describe('DBJWT-10 real WebCrypto ES256 proofs', () => {
  it('signs using a non-extractable private P-256 key with only the public JWK in the header', async () => {
    expect(key.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('jwk', key.privateKey)).rejects.toThrow();
    const proof = await createDpopProof(key, {
      method: 'POST',
      url: 'https://api.example.com/auth/oidc/refresh',
      now: () => 1_800_000_000_123,
    });
    expect(decodeProtectedHeader(proof)).toEqual({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk });
    const verified = await jwtVerify(proof, await importJWK(key.publicJwk, 'ES256'), { algorithms: ['ES256'] });
    expect(verified.payload).toMatchObject({
      htm: 'POST',
      htu: 'https://api.example.com/auth/oidc/refresh',
      iat: 1_800_000_000,
    });
    expect(verified.payload).not.toHaveProperty('ath');
  });
  it('API ath is exactly SHA-256 of the presented ASCII token, including on a fresh retry', async () => {
    const token = 'abc.def.signature';
    const proofs = await Promise.all(
      Array.from({ length: 12 }, () =>
        createDpopProof(key, {
          method: 'GET',
          url: 'https://api.example.com/api/profile?ignored=yes#ignored',
          accessToken: token,
          nonce: 'server-nonce',
        }),
      ),
    );
    const claims = proofs.map(decodeJwt);
    expect(new Set(claims.map((claim) => claim.jti)).size).toBe(12);
    for (const claim of claims) {
      expect(claim).toMatchObject({
        ath: createHash('sha256').update(token, 'ascii').digest('base64url'),
        htu: 'https://api.example.com/api/profile',
        nonce: 'server-nonce',
        htm: 'GET',
      });
      expect(claim.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
    expect(new Set(proofs).size).toBe(12);
  });
  it.each(['get', 'post', 'GET ', 'GET\n'])('rejects nonexact method %j', async (method) => {
    await expect(createDpopProof(key, { method, url: 'https://api.example.com/' })).rejects.toThrow('exact uppercase');
  });
  it.each(['', 'x'.repeat(513), 'bad\r\n', 'caf\u00e9'])('rejects malformed/oversized nonce %#', async (nonce) => {
    await expect(createDpopProof(key, { method: 'GET', url: 'https://api.example.com/', nonce })).rejects.toThrow(
      'nonce is invalid',
    );
  });
  it('rejects a non-ASCII token rather than hashing different bytes from the backend', async () => {
    await expect(
      createDpopProof(key, { method: 'GET', url: 'https://api.example.com/', accessToken: 'caf\u00e9' }),
    ).rejects.toThrow('access token is invalid');
  });
});

describe('DBJWT-10 pinned canonical target parity', () => {
  it.each([
    'HTTPS://API.EXAMPLE.COM:443/a/%7e/%41?query=one#fragment',
    'https://api.example.com/a/b/../%2e/c',
    'http://127.0.0.1:4318//other.example/%2f/%3a/%3f',
    'https://api.example.com/日本語/%e3%81%82',
    'https://api.example.com',
    'https://api.example.com/%2E%2e/a/%2D/%5f',
  ])('is identical to the final backend canonicalizer: %s', (url) => {
    expect(normalizeDpopTarget(url)).toBe(normalizeDpopProofTarget(url));
  });
  it.each([
    '/relative',
    '//attacker.test/a',
    'https://user:secret@api.example.com/a', // pragma: allowlist secret
    'https://api.example.com/a\\b',
    'https://api.example.com/%GG',
    'https://api.example.com/bad path',
    'https://api.example.com/a\n',
  ])('rejects ambiguous target %j', (url) => {
    expect(() => normalizeDpopTarget(url)).toThrow();
  });
  it('scopes key storage to frontend/backend origins and normalized basePath', () => {
    const first = resolveDpopScope({
      frontendOrigin: 'HTTPS://SPA.EXAMPLE.COM:443',
      backendOrigin: 'https://api.example.com',
      basePath: '/auth/oidc/',
    });
    expect(first.id).toBe(
      resolveDpopScope({
        frontendOrigin: 'https://spa.example.com',
        backendOrigin: 'https://api.example.com:443/',
        basePath: '/auth/oidc',
      }).id,
    );
    for (const change of [
      { frontendOrigin: 'https://other.example.com' },
      { backendOrigin: 'https://other.example.com' },
      { basePath: '/other' },
    ]) {
      expect(resolveDpopScope({ ...first, ...change }).id).not.toBe(first.id);
    }
  });
});
