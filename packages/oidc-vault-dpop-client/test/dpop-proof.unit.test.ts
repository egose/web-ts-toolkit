import { calculateJwkThumbprint } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import type { DpopKey } from '../src/dpop-key-store';
import { createDpopProof } from '../src/dpop-proof';
import { OidcVaultDpopClientError } from '../src/errors';

let key: DpopKey;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! } as const;
  key = {
    privateKey: pair.privateKey,
    publicJwk: { ...publicJwk },
    jkt: await calculateJwkThumbprint(publicJwk),
    scopeId: 'unit',
  };
});

describe('CLIENT-05 createDpopProof method policy', () => {
  it.each(['get', 'post', 'Get', 'GET ', 'GET\n'])('rejects nonexact method %j', async (method) => {
    await expect(createDpopProof(key, { method, url: 'https://api.example.com/' })).rejects.toBeInstanceOf(
      OidcVaultDpopClientError,
    );
    await expect(createDpopProof(key, { method, url: 'https://api.example.com/' })).rejects.toMatchObject({
      code: 'INVALID_DPOP_METHOD',
    });
  });

  it('accepts exact uppercase methods', async () => {
    const proof = await createDpopProof(key, {
      method: 'GET',
      url: 'https://api.example.com/',
      now: () => 1_800_000_000_000,
    });
    expect(typeof proof).toBe('string');
    expect(proof.split('.')).toHaveLength(3);
  });
});
