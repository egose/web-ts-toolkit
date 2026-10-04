import { calculateJwkThumbprint, decodeJwt } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { OidcVaultDpopSession } from '../src/auth-session';
import { fetchWithDpop } from '../src/auth-fetch';
import type { DpopAccessToken } from '../src/credentials';
import type { DpopKey } from '../src/dpop-key-store';

const NOW = 1_800_000_000_000;

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
  return { context, attempts, refresh, request };
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
