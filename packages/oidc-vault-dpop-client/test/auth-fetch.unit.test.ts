import { calculateJwkThumbprint, compactVerify, decodeJwt, importJWK } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { OidcVaultDpopSession } from '../src/auth-session';
import { fetchWithDpop, type DpopFetchOptions } from '../src/auth-fetch';
import type { DpopAccessToken } from '../src/credentials';
import type { DpopKey } from '../src/dpop-key-store';
import { DpopNonceCache } from '../src/nonce-cache';

const NOW = 1_800_000_000_000;

let key: DpopKey;
let anotherKey: DpopKey;
const generateKey = async (): Promise<DpopKey> => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! } as const;
  return {
    privateKey: pair.privateKey,
    publicJwk: { ...publicJwk },
    jkt: await calculateJwkThumbprint(publicJwk),
    scopeId: 'unit',
  };
};
beforeAll(async () => {
  key = await generateKey();
  anotherKey = await generateKey();
});

const credential = (accessToken = 'old.access.token'): DpopAccessToken => ({
  accessToken,
  tokenType: 'DPoP',
  expiresAt: NOW + 60_000,
  jkt: key.jkt,
  generation: accessToken,
});

const challenged = (error: string, nonce?: string): Response =>
  new Response('{}', {
    status: 401,
    headers: { 'WWW-Authenticate': `DPoP error="${error}", algs="ES256"`, ...(nonce ? { 'DPoP-Nonce': nonce } : {}) },
  });

interface Attempt {
  claims: ReturnType<typeof decodeJwt>;
  proof: string;
  authorization: string | null;
  body: string | undefined;
}

const fixture = (responses: Response[], initial: DpopAccessToken = credential()) => {
  let current = initial;
  const refresh = vi.fn(async (): Promise<DpopAccessToken> => {
    current = credential('new.access.token');
    return current;
  });
  const clear = vi.fn(async (): Promise<void> => {});
  const getKey = vi.fn(async (): Promise<DpopKey> => key);
  const session: OidcVaultDpopSession = {
    scopeId: 'unit',
    sessionTransport: 'body',
    login: async () => {},
    exchange: async () => current,
    logout: async () => {},
    resetKey: async () => {
      throw new Error('Unexpected automatic key reset.');
    },
    dispose() {},
    getAccessToken: () => current,
    getKey,
    refresh,
    clear,
  };
  const attempts: Attempt[] = [];
  const request: typeof fetch = vi.fn(async (input, init) => {
    const headers = new Headers(init?.headers);
    const proof = headers.get('DPoP');
    expect(proof).toBeTruthy();
    attempts.push({
      claims: decodeJwt(proof!),
      proof: proof!,
      authorization: headers.get('Authorization'),
      body: init?.body === undefined ? undefined : await new Response(init.body as BodyInit).text(),
    });
    const next = responses.shift();
    return next ?? new Response('{}');
  }) as unknown as typeof fetch;
  const context = {
    session,
    fetch: request,
    now: () => NOW,
    apis: [{ origin: 'https://api.example.com', replayNamespace: 'unit-api' }],
  };
  return { context, attempts, refresh, request, getKey, clear };
};

describe('CLIENT-05 replayableBody via fetchWithDpop', () => {
  it.each([
    ['string', (): BodyInit => 'payload', 'payload'],
    ['urlencoded', (): BodyInit => new URLSearchParams({ message: 'hello world' }), 'message=hello+world'],
    ['blob', (): BodyInit => new Blob(['payload']), 'payload'],
    ['buffer', (): BodyInit => new TextEncoder().encode('payload').buffer as ArrayBuffer, 'payload'],
    ['view', (): BodyInit => new TextEncoder().encode('payload'), 'payload'],
  ] as const)('idempotent retry replays the original %s body', async (_name, build, expected) => {
    const f = fixture([challenged('use_dpop_nonce', 'nonce'), new Response('{}')]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/mutate', {
      method: 'POST',
      retry: 'idempotent',
      body: build(),
    });
    expect(f.attempts).toHaveLength(2);
    expect(f.attempts.map((attempt) => attempt.body)).toEqual([expected, expected]);
  });

  it('replays FormData fields from a snapshot after a nonce challenge', async () => {
    const f = fixture([challenged('use_dpop_nonce', 'nonce'), new Response('{}')]);
    const form = new FormData();
    form.append('message', 'payload');
    form.append('file', new Blob(['file-data']), 'example.txt');
    await fetchWithDpop(f.context, 'https://api.example.com/api/mutate', {
      method: 'POST',
      retry: 'idempotent',
      body: form,
    });
    expect(f.attempts).toHaveLength(2);
    for (const attempt of f.attempts) {
      expect(attempt.body).toContain('name="message"');
      expect(attempt.body).toContain('payload');
      expect(attempt.body).toContain('filename="example.txt"');
      expect(attempt.body).toContain('file-data');
    }
  });

  it('rejects a streaming body before the first network request', async () => {
    const f = fixture([]);
    await expect(
      fetchWithDpop(f.context, 'https://api.example.com/api/mutate', {
        method: 'POST',
        retry: 'idempotent',
        body: new ReadableStream() as unknown as BodyInit,
      }),
    ).rejects.toMatchObject({ code: 'DPOP_BODY_NOT_REPLAYABLE' });
    expect(f.request).not.toHaveBeenCalled();
  });
});

describe('CLIENT-05 challengeError via fetchWithDpop', () => {
  it('retries once on DPoP use_dpop_nonce with the server nonce', async () => {
    const f = fixture([challenged('use_dpop_nonce', 'nonce-one'), new Response('{}')]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/profile');
    expect(f.attempts).toHaveLength(2);
    expect(f.attempts[0].claims).not.toHaveProperty('nonce');
    expect(f.attempts[1].claims.nonce).toBe('nonce-one');
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('ignores Bearer noise and does not refresh', async () => {
    const f = fixture([
      new Response('{}', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", DPoP algs="ES256"' },
      }),
    ]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/profile');
    expect(f.attempts).toHaveLength(1);
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('refreshes once on DPoP invalid_token', async () => {
    const f = fixture([challenged('invalid_token'), new Response('{}')]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/profile');
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ rejectedToken: 'old.access.token' });
    expect(f.attempts).toHaveLength(2);
  });

  it('does not treat a non-401 DPoP challenge as retryable', async () => {
    const f = fixture([
      new Response('{}', {
        status: 400,
        headers: { 'WWW-Authenticate': 'DPoP error="use_dpop_nonce", algs="ES256"', 'DPoP-Nonce': 'nonce' },
      }),
    ]);
    const response = await fetchWithDpop(f.context, 'https://api.example.com/api/profile');
    expect(response.status).toBe(400);
    expect(f.attempts).toHaveLength(1);
    expect(f.refresh).not.toHaveBeenCalled();
  });
});

describe('DPH-04 API nonce learning', () => {
  const target = 'https://api.example.com/api/profile';

  it.each([
    { method: 'POST', body: 'mutation' },
    { method: 'PUT', body: 'mutation' },
    { method: 'DELETE' },
    { retry: 'never' },
  ] satisfies DpopFetchOptions[])(
    'learns a nonce on a single-attempt $method/$retry call for the next explicit invocation',
    async (options) => {
      const first = challenged('use_dpop_nonce', 'learned');
      const f = fixture([first, new Response('{}')]);
      await expect(fetchWithDpop(f.context, target, options)).resolves.toBe(first);
      expect(f.attempts).toHaveLength(1);
      expect(first.bodyUsed).toBe(false);
      expect(await first.text()).toBe('{}');
      expect(f.refresh).not.toHaveBeenCalled();
      // A new wrapper object still shares the default cache through this session.
      await fetchWithDpop({ ...f.context }, target, options);
      expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'learned']);
      expect(f.attempts[0].claims.jti).not.toBe(f.attempts[1].claims.jti);
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.clear).not.toHaveBeenCalled();
    },
  );

  it.each([200, 201, 204])(
    'learns a success-response nonce on HTTP %s without consuming the response or retrying',
    async (status) => {
      const first = new Response(status === 204 ? null : 'caller-owned', {
        status,
        headers: { 'DPoP-Nonce': 'next-nonce' },
      });
      const f = fixture([first, new Response('{}')]);
      await expect(fetchWithDpop(f.context, target)).resolves.toBe(first);
      expect(f.attempts).toHaveLength(1);
      expect(await first.text()).toBe(status === 204 ? '' : 'caller-owned');
      await fetchWithDpop(f.context, target);
      expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'next-nonce']);
      expect(f.refresh).not.toHaveBeenCalled();
    },
  );

  it('learns the final nonce even when the invocation has exhausted its nonce retry', async () => {
    const final = challenged('use_dpop_nonce', 'nonce-two');
    const f = fixture([challenged('use_dpop_nonce', 'nonce-one'), final, new Response('{}')]);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(final);
    expect(f.attempts).toHaveLength(2);
    expect(final.bodyUsed).toBe(false);
    await fetchWithDpop(f.context, target);
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'nonce-one', 'nonce-two']);
  });

  it.each([undefined, '', 'one,two', 'one, two', '"quoted"', 'two words', 'back\\slash', 'x'.repeat(513)])(
    'ignores malformed/ambiguous nonce %j without retrying with or replacing a cached value',
    async (nonce) => {
      const invalid = challenged('use_dpop_nonce', nonce);
      const f = fixture([new Response('{}', { headers: { 'DPoP-Nonce': 'usable' } }), invalid, new Response('{}')]);
      await fetchWithDpop(f.context, target);
      await expect(fetchWithDpop(f.context, target)).resolves.toBe(invalid);
      expect(f.attempts).toHaveLength(2);
      await fetchWithDpop(f.context, target);
      expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'usable', 'usable']);
      expect(f.refresh).not.toHaveBeenCalled();
    },
  );

  it('isolates nonce learning by origin, replay namespace, and signing key in a shared cache', async () => {
    const nonces = new DpopNonceCache();
    const f = fixture([
      new Response('{}', { headers: { 'DPoP-Nonce': 'space-a' } }),
      new Response('{}', { headers: { 'DPoP-Nonce': 'space-b' } }),
      new Response('{}', { headers: { 'DPoP-Nonce': 'other-origin' } }),
      new Response('{}'),
    ]);
    const original = { ...f.context, nonces };
    await fetchWithDpop(original, target);
    await fetchWithDpop(
      { ...original, apis: [{ origin: 'https://api.example.com', replayNamespace: 'other' }] },
      target,
    );
    await fetchWithDpop(
      {
        ...original,
        apis: [{ origin: 'https://other.example.com', replayNamespace: 'unit-api' }],
      },
      'https://other.example.com/profile',
    );
    await fetchWithDpop(original, target);
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, undefined, undefined, 'space-a']);
    const other = fixture([new Response('{}')], { ...credential(), jkt: anotherKey.jkt });
    other.getKey.mockResolvedValue(anotherKey);
    await fetchWithDpop({ ...other.context, nonces }, target);
    expect(other.attempts[0].claims).not.toHaveProperty('nonce');
  });

  it('keeps the signing thumbprint as cache authority across a mutable injected key/network wait', async () => {
    const nonces = new DpopNonceCache();
    const injectedKey = { ...key };
    const f = fixture([]);
    f.getKey.mockResolvedValueOnce(injectedKey);
    vi.mocked(f.request).mockImplementationOnce(async () => {
      injectedKey.jkt = 'changed-after-signing';
      return new Response('{}', { headers: { 'DPoP-Nonce': 'original-key-nonce' } });
    });
    await fetchWithDpop({ ...f.context, nonces }, target);
    const space = JSON.stringify(['api', 'https://api.example.com', 'unit-api']);
    expect(nonces.get(space, key.jkt)).toBe('original-key-nonce');
    expect(nonces.get(space, injectedKey.jkt)).toBeUndefined();
  });

  it('learns before awaiting refresh and keeps the admitted response nonce despite later header mutation', async () => {
    const rejected = challenged('invalid_token', 'before-refresh');
    const f = fixture([rejected, new Response('{}')]);
    f.refresh.mockImplementationOnce(async () => {
      rejected.headers.set('DPoP-Nonce', 'late-mutation');
      return credential('refreshed.access.token');
    });
    await fetchWithDpop(f.context, target);
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'before-refresh']);
    expect(f.refresh).toHaveBeenCalledOnce();
  });
});

describe('DPH-04 DPoP authentication challenges', () => {
  it.each([
    'DPoP algs="ES256", error="invalid_token"',
    'dPoP   realm="api", ALGS = "ES256" , ERROR = invalid_token',
    'Bearer error="invalid_token", DPoP algs="ES256", error="invalid_token"',
    'Basic realm="first, \\"quoted\\"", DPoP error="invalid_token", algs="ES256", Bearer',
    'Negotiate abc+/==, DPoP algs="ES256", error="invalid_token"',
  ])('associates reordered parameters with exactly one DPoP challenge: %s', async (header) => {
    const f = fixture([
      new Response('{}', { status: 401, headers: { 'WWW-Authenticate': header } }),
      new Response('{}'),
    ]);
    await fetchWithDpop(f.context, 'https://api.example.com/profile');
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ rejectedToken: 'old.access.token' });
    expect(f.attempts).toHaveLength(2);
  });

  it.each([
    'Bearer error="invalid_token", DPoP algs="ES256"',
    'DPoP algs="ES256", Bearer error="invalid_token"',
    'Bearer realm="DPoP", error="invalid_token"',
    'Bearer realm="literal, DPoP error=\\"invalid_token\\"", error="invalid_token"',
    'Bearer realm="literal, DPoP error="invalid_token", algs="ES256"',
    'DPoP error="invalid_token", error="invalid_token"',
    'DPoP error="invalid_token", ERROR="use_dpop_nonce"',
    'DPoP error="invalid_token", algs="ES256", ALGS="ES256"',
    'DPoP error="invalid_token", DPoP error="invalid_token"',
    'DPoP error="invalid_token", DPoP',
    'DPoP error="invalid_token", Basic realm="unterminated',
    'DPoP error="invalid_token", Bearer realm="one" trailing',
    'DPoP error="invalid_token", Bearer realm="one", realm="two"',
    'DPoP error="invalid_token", broken=@',
    'DPoP error="invalid_token",',
    'DPoP error="invalid_token",, algs="ES256"',
    'DPoP error="invalid_token"; algs="ES256"',
    'DPoP error="invalid_token" algs="ES256"',
    'DPoP error="invalid_token", realm=',
    'DPoP error=',
    'DPoP invalid_token',
    'DPoP error="INVALID_TOKEN"',
    'DPoP error="invalid_dpop_proof"',
    `DPoP error="invalid_token", realm="${'x'.repeat(8192)}"`,
  ])('does not refresh or retry on unrelated, ambiguous, malformed or oversized challenges: %s', async (header) => {
    const response = new Response('{}', {
      status: 401,
      headers: { 'WWW-Authenticate': header, 'DPoP-Nonce': 'valid' },
    });
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, 'https://api.example.com/profile')).resolves.toBe(response);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
    expect(f.attempts).toHaveLength(1);
    expect(response.bodyUsed).toBe(false);
  });

  it('snapshots the challenge once instead of reinterpreting a mutable header', async () => {
    const response = challenged('invalid_dpop_proof');
    const original = response.headers.get.bind(response.headers);
    let reads = 0;
    vi.spyOn(response.headers, 'get').mockImplementation((name) =>
      name.toLowerCase() === 'www-authenticate'
        ? `DPoP error="${reads++ === 0 ? 'invalid_dpop_proof' : 'invalid_token'}"`
        : original(name),
    );
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, 'https://api.example.com/profile')).resolves.toBe(response);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.attempts).toHaveLength(1);
  });

  it('retries a reordered nonce challenge with a fresh proof, without refreshing', async () => {
    const f = fixture([
      new Response('{}', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer error="invalid_token", DPoP algs="ES256", error="use_dpop_nonce"',
          'DPoP-Nonce': 'nonce',
        },
      }),
      new Response('{}'),
    ]);
    await fetchWithDpop(f.context, 'https://api.example.com/profile');
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'nonce']);
    expect(f.attempts[0].claims.jti).not.toBe(f.attempts[1].claims.jti);
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it.each([400, 403, 429, 500, 503])(
    'does not make HTTP %s retryable just because it includes a DPoP challenge',
    async (status) => {
      const response = new Response('{}', {
        status,
        headers: {
          'WWW-Authenticate': 'DPoP error="invalid_token"',
          'DPoP-Nonce': 'next-explicit-call',
        },
      });
      const f = fixture([response, new Response('{}')]);
      await expect(fetchWithDpop(f.context, 'https://api.example.com/profile')).resolves.toBe(response);
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(1);
      await fetchWithDpop(f.context, 'https://api.example.com/profile');
      expect(f.attempts[1].claims.nonce).toBe('next-explicit-call');
    },
  );

  it.each(['use_dpop_nonce', 'invalid_token'])(
    'keeps the combined retry budgets and replayed body when %s arrives first',
    async (first) => {
      const second = first === 'use_dpop_nonce' ? 'invalid_token' : 'use_dpop_nonce';
      const final = challenged(first, 'final-nonce');
      const f = fixture([challenged(first, 'nonce-one'), challenged(second, 'nonce-two'), final]);
      const body = new TextEncoder().encode('original-body');
      f.refresh.mockImplementationOnce(async () => {
        body.fill(0);
        return credential('refreshed.access.token');
      });
      await expect(
        fetchWithDpop(f.context, 'https://api.example.com/mutation', {
          method: 'POST',
          body,
          retry: 'idempotent',
        }),
      ).resolves.toBe(final);
      expect(f.attempts).toHaveLength(3);
      expect(f.refresh).toHaveBeenCalledOnce();
      expect(f.clear).not.toHaveBeenCalled();
      expect(f.attempts.map((attempt) => attempt.body)).toEqual(['original-body', 'original-body', 'original-body']);
      expect(new Set(f.attempts.map(({ claims }) => claims.jti)).size).toBe(3);
      expect(new Set(f.attempts.map(({ proof }) => proof.split('.')[2])).size).toBe(3);
      const publicKey = await importJWK(key.publicJwk, 'ES256');
      for (const attempt of f.attempts) {
        await compactVerify(attempt.proof, publicKey);
        expect(attempt.authorization).toMatch(/^DPoP /);
        expect(attempt.claims).toMatchObject({ htm: 'POST', htu: 'https://api.example.com/mutation' });
        expect(attempt.claims.ath).toBeTypeOf('string');
      }
      expect(f.attempts[0].claims.ath).not.toBe(f.attempts[2].claims.ath);
      expect(final.bodyUsed).toBe(false);
    },
  );
});

describe('DPH-01 zero-lifetime API credentials', () => {
  it('stops after an expired refresh result, retains auth handles and permits a later explicit refresh', async () => {
    const expired = { ...credential(), expiresAt: NOW };
    const f = fixture([], expired);
    f.refresh.mockResolvedValueOnce({ ...credential('zero.lifetime.token'), expiresAt: NOW });
    await expect(fetchWithDpop(f.context, 'https://api.example.com/api/profile')).rejects.toMatchObject({
      code: 'DPOP_ACCESS_TOKEN_EXPIRED',
      requiresLogin: false,
    });
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.getKey).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
    expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile')).status).toBe(200);
    expect(f.refresh).toHaveBeenCalledTimes(2);
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it('stops a challenge-triggered retry when refresh returns a nonlive credential', async () => {
    const f = fixture([challenged('invalid_token')]);
    f.refresh.mockResolvedValueOnce({ ...credential('expired.refresh.token'), expiresAt: NOW - 1 });
    await expect(fetchWithDpop(f.context, 'https://api.example.com/api/profile')).rejects.toMatchObject({
      code: 'DPOP_ACCESS_TOKEN_EXPIRED',
      requiresLogin: false,
    });
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.getKey).toHaveBeenCalledTimes(1);
    expect(f.clear).not.toHaveBeenCalled();
  });

  it('rechecks the deadline after asynchronous key/proof work before sending', async () => {
    const f = fixture([]);
    let now = NOW;
    f.context.now = () => now;
    f.getKey.mockImplementationOnce(async () => {
      await Promise.resolve();
      now += 60_000;
      return key;
    });
    await expect(fetchWithDpop(f.context, 'https://api.example.com/api/profile')).rejects.toMatchObject({
      code: 'DPOP_ACCESS_TOKEN_EXPIRED',
      requiresLogin: false,
    });
    expect(f.request).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
  });
});
