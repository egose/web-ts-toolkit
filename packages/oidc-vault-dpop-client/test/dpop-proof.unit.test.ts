import { calculateJwkThumbprint } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

afterEach(() => vi.restoreAllMocks());

describe('DPH-03 proof cancellation before signing', () => {
  it('does no digest or signature work for a pre-aborted proof', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const sign = vi.spyOn(crypto.subtle, 'sign');
    const controller = new AbortController();
    controller.abort();
    await expect(
      createDpopProof(key, {
        method: 'GET',
        url: 'https://api.example.com/',
        accessToken: 'access.token',
        signal: controller.signal,
      }),
    ).rejects.toBe(controller.signal.reason);
    expect(digest).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'stops waiting on the digest and never signs after its late %s',
    async (ending) => {
      let resolve!: (value: ArrayBuffer) => void;
      let reject!: (error: unknown) => void;
      const pending = new Promise<ArrayBuffer>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const digest = vi.spyOn(crypto.subtle, 'digest').mockReturnValueOnce(pending);
      const sign = vi.spyOn(crypto.subtle, 'sign');
      const controller = new AbortController();
      let result: unknown;
      const proof = createDpopProof(key, {
        method: 'GET',
        url: 'https://api.example.com/',
        accessToken: 'access.token',
        signal: controller.signal,
      }).then(
        (value) => {
          result = value;
        },
        (error: unknown) => {
          result = error;
        },
      );
      try {
        expect(digest).toHaveBeenCalledOnce();
        controller.abort();
        await new Promise<void>((done) => setImmediate(done));
        expect(result).toBe(controller.signal.reason);
        if (ending === 'resolve') resolve(new ArrayBuffer(32));
        else reject(new Error('late digest failure'));
        await new Promise<void>((done) => setImmediate(done));
        expect(sign).not.toHaveBeenCalled();
      } finally {
        resolve(new ArrayBuffer(32));
        await proof;
      }
    },
  );

  it('stops waiting on already-started signing and observes a late crypto rejection', async () => {
    let release!: (error: unknown) => void;
    const pending = new Promise<ArrayBuffer>((_resolve, reject) => {
      release = reject;
    });
    let entered!: () => void;
    const signing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.spyOn(crypto.subtle, 'sign').mockImplementationOnce(() => {
      entered();
      return pending;
    });
    const controller = new AbortController();
    let result: unknown;
    const proof = createDpopProof(key, {
      method: 'GET',
      url: 'https://api.example.com/',
      signal: controller.signal,
    }).then(
      (value) => {
        result = value;
      },
      (error: unknown) => {
        result = error;
      },
    );
    try {
      await signing;
      controller.abort();
      await new Promise<void>((done) => setImmediate(done));
      expect(result).toBe(controller.signal.reason);
    } finally {
      release(new Error('late signing failure'));
      await proof;
      await new Promise<void>((done) => setImmediate(done));
    }
  });
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
