import { createHash } from 'node:crypto';

import { calculateJwkThumbprint, decodeJwt, importJWK, jwtVerify } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { fetchWithDpop, type DpopFetchOptions } from '../src/auth/auth-fetch';
import type { DpopAccessToken, OidcVaultDpopSession } from '../src/auth/auth-session';
import type { DpopKey } from '../src/auth/dpop-key-store';

let key: DpopKey;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  key = {
    privateKey: pair.privateKey,
    publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! },
    jkt: await calculateJwkThumbprint(jwk),
    scopeId: 'unit',
  };
});

const credential = (accessToken = 'old.access.token', expiresAt = Date.now() + 60_000): DpopAccessToken => ({
  accessToken,
  tokenType: 'DPoP',
  expiresAt,
  jkt: key.jkt,
  generation: accessToken,
});
const challenged = (error: string, nonce?: string) =>
  new Response('{}', {
    status: 401,
    headers: { 'WWW-Authenticate': `DPoP error="${error}", algs="ES256"`, ...(nonce ? { 'DPoP-Nonce': nonce } : {}) },
  });

const fixture = (responses: Array<Response | Error>, initial = credential()) => {
  let current = initial;
  const refresh = vi.fn(async () => {
    current = credential('new.access.token');
    return current;
  });
  const clear = vi.fn(async () => {});
  const getKey = vi.fn(async () => key);
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
  const attempts: Array<{
    url: string;
    init: RequestInit;
    claims: ReturnType<typeof decodeJwt>;
    body: string | undefined;
  }> = [];
  const request: typeof fetch = vi.fn(async (input, init) => {
    const headers = new Headers(init?.headers);
    const proof = headers.get('DPoP')!;
    const verified = await jwtVerify(proof, await importJWK(key.publicJwk, 'ES256'), { algorithms: ['ES256'] });
    const token = headers.get('Authorization')!.slice('DPoP '.length);
    expect(verified.payload.ath).toBe(createHash('sha256').update(token, 'ascii').digest('base64url'));
    attempts.push({
      url: String(input),
      init: init!,
      claims: verified.payload,
      body: init?.body === undefined ? undefined : await new Response(init.body).text(),
    });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? new Response('{}');
  });
  const context = {
    session,
    fetch: request,
    apis: [{ origin: 'https://api.example.com', replayNamespace: 'unit-api' }],
  };
  return { context, attempts, refresh, clear, getKey, request };
};

describe('DBJWT-10 scoped API fetch and real signed retry matrix', () => {
  it('scopes credentials/proofs to an exact origin and rejects an out-of-scope URL before refresh/key/network', async () => {
    const f = fixture([]);
    await expect(fetchWithDpop(f.context, 'https://attacker.example/api')).rejects.toThrow('outside');
    expect(f.request).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.getKey).not.toHaveBeenCalled();
  });
  it('uses mandatory DPoP, redirect:error, credentials:omit and a query-free canonical proof', async () => {
    const f = fixture([]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/%7Eprofile?q=visible#ignored');
    expect(f.attempts[0].init).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
    expect(f.attempts[0].claims.htu).toBe('https://api.example.com/api/~profile');
    expect(f.attempts[0].url).toContain('?q=visible');
    expect(new Headers(f.attempts[0].init.headers).get('Authorization')).toBe('DPoP old.access.token');
  });
  it('nonce retries once with a new jti/signature and stops at a repeated challenge without refresh', async () => {
    const f = fixture([challenged('use_dpop_nonce', 'nonce-one'), challenged('use_dpop_nonce', 'nonce-two')]);
    expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile')).status).toBe(401);
    expect(f.attempts).toHaveLength(2);
    expect(f.attempts[0].claims).not.toHaveProperty('nonce');
    expect(f.attempts[1].claims.nonce).toBe('nonce-one');
    expect(new Set(f.attempts.map((attempt) => attempt.claims.jti)).size).toBe(2);
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it('permits only one refresh plus one nonce retry total, regenerating ath for the winner token', async () => {
    const f = fixture([
      challenged('invalid_token'),
      challenged('use_dpop_nonce', 'nonce'),
      challenged('invalid_token'),
    ]);
    expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile')).status).toBe(401);
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ rejectedToken: 'old.access.token' });
    expect(f.attempts).toHaveLength(3);
    expect(new Set(f.attempts.map((attempt) => attempt.claims.jti)).size).toBe(3);
    expect(f.attempts[0].claims.ath).not.toBe(f.attempts[1].claims.ath);
    expect(f.attempts[1].claims.ath).toBe(f.attempts[2].claims.ath);
  });
  it('refreshes before presenting an expired token and cannot then run a second refresh cycle', async () => {
    const f = fixture([challenged('invalid_token')], credential('expired.token.signature', 0));
    expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile')).status).toBe(401);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.attempts).toHaveLength(1);
    expect(new Headers(f.attempts[0].init.headers).get('Authorization')).toBe('DPoP new.access.token');
  });
  it.each(['invalid_dpop_proof', 'insufficient_scope', 'other_error'])(
    'does not treat %s as an expired-token refresh trigger',
    async (error) => {
      const f = fixture([challenged(error)]);
      expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile')).status).toBe(401);
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.attempts).toHaveLength(1);
    },
  );
  it('does not retry on network/redirect failure', async () => {
    const f = fixture([new TypeError('Fetch failed')]);
    await expect(fetchWithDpop(f.context, 'https://api.example.com/api/profile')).rejects.toThrow('Fetch failed');
    expect(f.attempts).toHaveLength(1);
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it('does not refresh from an unrelated Bearer error in a multi-scheme challenge', async () => {
    const f = fixture([
      new Response('{}', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", DPoP algs="ES256"' },
      }),
    ]);
    expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile')).status).toBe(401);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.attempts).toHaveLength(1);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'never implicitly retries a mutating %s operation on nonce or invalid-token responses',
    async (method) => {
      for (const response of [challenged('use_dpop_nonce', 'nonce'), challenged('invalid_token')]) {
        const f = fixture([response]);
        expect(
          (await fetchWithDpop(f.context, 'https://api.example.com/api/mutate', { method, body: 'payload' })).status,
        ).toBe(401);
        expect(f.attempts).toHaveLength(1);
        expect(f.refresh).not.toHaveBeenCalled();
      }
    },
  );
  it.each([
    ['string', (): BodyInit => 'payload', 'payload'],
    ['urlencoded', (): BodyInit => new URLSearchParams({ message: 'hello world' }), 'message=hello+world'],
    ['blob', (): BodyInit => new Blob(['payload']), 'payload'],
    ['buffer', (): BodyInit => new TextEncoder().encode('payload').buffer, 'payload'],
    ['view', (): BodyInit => new TextEncoder().encode('payload'), 'payload'],
  ] as const)('explicit authorized idempotent retries replay the original %s body', async (_name, body, expected) => {
    const f = fixture([challenged('use_dpop_nonce', 'nonce'), challenged('invalid_token'), new Response('{}')]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/mutate', {
      method: 'POST',
      retry: 'idempotent',
      body: body(),
      headers: { 'Idempotency-Key': 'operation-id' },
    });
    expect(f.attempts.map((attempt) => attempt.body)).toEqual([expected, expected, expected]);
    expect(new Set(f.attempts.map((attempt) => attempt.claims.jti)).size).toBe(3);
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });
  it('rejects a streaming retry body before the first credential request', async () => {
    const f = fixture([]);
    await expect(
      fetchWithDpop(f.context, 'https://api.example.com/api/mutate', {
        method: 'POST',
        retry: 'idempotent',
        body: new ReadableStream(),
      }),
    ).rejects.toThrow('replayable');
    expect(f.request).not.toHaveBeenCalled();
  });
  it('replays FormData fields from a snapshot, including file data, after a nonce challenge', async () => {
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
  it('retry:never disables even safe-method nonce and refresh retries', async () => {
    const f = fixture([challenged('use_dpop_nonce', 'nonce')]);
    expect((await fetchWithDpop(f.context, 'https://api.example.com/api/profile', { retry: 'never' })).status).toBe(
      401,
    );
    expect(f.attempts).toHaveLength(1);
  });
  it.each(['Authorization', 'DPoP', 'Cookie', 'Proxy-Authorization'])('rejects caller override of %s', async (name) => {
    const f = fixture([]);
    await expect(
      fetchWithDpop(f.context, 'https://api.example.com/api/profile', { headers: { [name]: 'override' } }),
    ).rejects.toThrow('owns authentication');
    expect(f.request).not.toHaveBeenCalled();
  });
  it('runtime options cannot override redirect/credentials and a Bearer token cannot cause fallback', async () => {
    const f = fixture([]);
    await fetchWithDpop(f.context, 'https://api.example.com/api/profile', {
      credentials: 'include',
      redirect: 'follow',
    } as unknown as DpopFetchOptions);
    expect(f.attempts[0].init).toMatchObject({ credentials: 'omit', redirect: 'error' });
    const bad = fixture([], { ...credential(), tokenType: 'Bearer' } as unknown as DpopAccessToken);
    await expect(fetchWithDpop(bad.context, 'https://api.example.com/api/profile')).rejects.toThrow(
      'DPoP access token is required',
    );
    expect(bad.clear).toHaveBeenCalledTimes(1);
    expect(bad.request).not.toHaveBeenCalled();
  });
});
