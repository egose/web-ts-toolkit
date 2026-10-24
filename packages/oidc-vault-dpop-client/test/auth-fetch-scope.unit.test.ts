import { createServer } from 'node:http';
import { calculateJwkThumbprint, compactVerify, decodeJwt, importJWK } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { fetchWithDpop, type DpopApi, type DpopFetchContext, type DpopFetchOptions } from '../src/auth-fetch';
import type { DpopAccessToken } from '../src/credentials';
import type { DpopKey } from '../src/dpop-key-store';
import { DpopNonceCache } from '../src/nonce-cache';

const ORIGIN = 'https://gateway.example.com';
const NOW = 1_800_000_000_000;
let key: DpopKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! } as const;
  key = { privateKey: pair.privateKey, publicJwk, jkt: await calculateJwkThumbprint(publicJwk), scopeId: 'gateway' };
});
afterEach(() => vi.restoreAllMocks());

const credential = (accessToken = 'gateway.access.token'): DpopAccessToken => ({
  accessToken,
  tokenType: 'DPoP',
  expiresAt: NOW + 60_000,
  jkt: key.jkt,
  generation: accessToken,
});
const api = (pathPrefix?: string, replayNamespace = 'orders'): DpopApi => ({
  origin: ORIGIN,
  pathPrefix,
  replayNamespace,
});
const space = (namespace: string, origin = ORIGIN) => JSON.stringify(['api', origin, namespace]);
const challenged = (nonce: string, error = 'use_dpop_nonce') =>
  new Response('{}', {
    status: 401,
    headers: { 'WWW-Authenticate': `DPoP algs="ES256", error="${error}"`, 'DPoP-Nonce': nonce },
  });
const success = (nonce?: string) => new Response('{}', { headers: nonce ? { 'DPoP-Nonce': nonce } : {} });

interface Attempt {
  url: string;
  method: string;
  credentials: RequestCredentials;
  redirect: RequestRedirect;
  cache: RequestCache;
  authorization: string | null;
  proof: string;
  claims: ReturnType<typeof decodeJwt>;
}

const fixture = (apis: readonly DpopApi[], responses: Response[] = []) => {
  const getAccessToken = vi.fn<() => DpopAccessToken | undefined>(() => credential());
  const refresh = vi.fn(async () => credential('refreshed.access.token'));
  const getKey = vi.fn(async () => key);
  const clear = vi.fn(async () => {});
  const nonces = new DpopNonceCache();
  const attempts: Attempt[] = [];
  const request = vi.fn<typeof fetch>(async (input, init) => {
    // Exercise native Fetch URL/method/credential parsing as well as the proof.
    const outbound = new Request(input, init);
    expect(outbound.url).toBe(input);
    const proof = outbound.headers.get('DPoP')!;
    attempts.push({
      url: outbound.url,
      method: outbound.method,
      credentials: outbound.credentials,
      redirect: outbound.redirect,
      cache: outbound.cache,
      authorization: outbound.headers.get('Authorization'),
      proof,
      claims: decodeJwt(proof),
    });
    return responses.shift() ?? success();
  });
  const context: DpopFetchContext = {
    apis,
    fetch: request,
    nonces,
    now: () => NOW,
    session: {
      scopeId: 'gateway',
      sessionTransport: 'body',
      getAccessToken,
      refresh,
      getKey,
      clear,
      login: async () => {},
      exchange: async () => credential(),
      logout: async () => {},
      logoutAndNavigate: async () => {},
      dispose() {},
      resetKey: async () => {
        throw new Error('Unexpected automatic key reset.');
      },
    },
  };
  return { context, getAccessToken, refresh, getKey, clear, nonces, attempts, request };
};

const expectNoAuthWork = (f: ReturnType<typeof fixture>) => {
  expect(f.getAccessToken).not.toHaveBeenCalled();
  expect(f.refresh).not.toHaveBeenCalled();
  expect(f.getKey).not.toHaveBeenCalled();
  expect(f.clear).not.toHaveBeenCalled();
  expect(f.request).not.toHaveBeenCalled();
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('DPH-05 gateway protection spaces', () => {
  it('learns and retries independently for orders and billing on one normalized origin', async () => {
    const f = fixture(
      [
        api('/orders'),
        {
          origin: 'https://GATEWAY.example.com:443/',
          pathPrefix: '/billing/',
          replayNamespace: 'billing',
          credentials: 'include',
        },
      ],
      [
        challenged('orders-challenge'),
        success('orders-next'),
        challenged('billing-challenge'),
        success('billing-next'),
      ],
    );
    await fetchWithDpop(f.context, `${ORIGIN}/orders/42`);
    await fetchWithDpop(f.context, `${ORIGIN}/billing/invoices`);
    await fetchWithDpop(f.context, `${ORIGIN}/orders/43`);
    await fetchWithDpop(f.context, `${ORIGIN}/billing/invoices/1`);
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([
      undefined,
      'orders-challenge',
      undefined,
      'billing-challenge',
      'orders-next',
      'billing-next',
    ]);
    expect(f.attempts.map(({ credentials }) => credentials)).toEqual([
      'omit',
      'omit',
      'include',
      'include',
      'omit',
      'include',
    ]);
    expect(f.nonces.get(space('orders'), key.jkt)).toBe('orders-next');
    expect(f.nonces.get(space('billing'), key.jkt)).toBe('billing-next');
    expect(f.refresh).not.toHaveBeenCalled();
    expect(new Set(f.attempts.map(({ claims }) => claims.jti)).size).toBe(6);
    const publicKey = await importJWK(key.publicJwk, 'ES256');
    for (const attempt of f.attempts) {
      await compactVerify(attempt.proof, publicKey);
      expect(attempt.claims).toMatchObject({ htu: attempt.url, htm: attempt.method, ath: expect.any(String) });
      expect(attempt.authorization).toBe('DPoP gateway.access.token');
    }
  });

  it.each([{ method: 'POST' }, { method: 'GET', retry: 'never' }] satisfies DpopFetchOptions[])(
    'keeps $method/$retry single-attempt while the next explicit call learns only its own service nonce',
    async (options) => {
      const orders = challenged('orders-only');
      const billing = challenged('billing-only');
      const f = fixture([api('/orders'), api('/billing', 'billing')], [orders, billing]);
      await expect(fetchWithDpop(f.context, `${ORIGIN}/orders`, options)).resolves.toBe(orders);
      expect(f.attempts).toHaveLength(1);
      await expect(fetchWithDpop(f.context, `${ORIGIN}/billing`, options)).resolves.toBe(billing);
      expect(f.attempts).toHaveLength(2);
      expect(orders.bodyUsed).toBe(false);
      expect(billing.bodyUsed).toBe(false);
      await fetchWithDpop(f.context, `${ORIGIN}/orders/next`, options);
      await fetchWithDpop(f.context, `${ORIGIN}/billing/next`, options);
      expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([
        undefined,
        undefined,
        'orders-only',
        'billing-only',
      ]);
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.clear).not.toHaveBeenCalled();
    },
  );

  it('shares the existing origin/namespace/key tuple when two paths intentionally use the same namespace', async () => {
    const f = fixture([api('/orders', 'shared'), api('/billing', 'shared')], [success('shared-nonce')]);
    await fetchWithDpop(f.context, `${ORIGIN}/orders`);
    await fetchWithDpop(f.context, `${ORIGIN}/billing`);
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, 'shared-nonce']);
    expect(f.nonces.get(space('shared'), key.jkt)).toBe('shared-nonce');
  });

  it.each([
    ['/orders', 'orders'],
    ['/orders/', 'orders'],
    ['/orders/42', 'orders'],
    ['/orders/admin', 'admin'],
    ['/orders/admin/users', 'admin'],
    ['/orders/admin-evil', 'orders'],
    ['/%6frders/%61dmin/', 'admin'],
    ['/orders/%2e%2e/billing', 'billing'],
    ['/orders-evil', 'root'],
  ])('selects the longest segment prefix for %s regardless of configuration order', async (path, namespace) => {
    const apis = [api('/', 'root'), api('/orders'), api('/billing', 'billing'), api('/orders/admin/', 'admin')];
    for (const order of [apis, [...apis].reverse()]) {
      const f = fixture(order);
      for (const entry of apis) f.nonces.remember(space(entry.replayNamespace), key.jkt, entry.replayNamespace);
      await fetchWithDpop(f.context, `${ORIGIN}${path}`);
      expect(f.attempts[0].claims.nonce).toBe(namespace);
    }
  });

  it.each([undefined, '/'])('treats %j as origin-wide, with more-specific prefixes taking precedence', async (root) => {
    const f = fixture([api(root, 'root'), api('/orders/')]);
    f.nonces.remember(space('root'), key.jkt, 'root');
    f.nonces.remember(space('orders'), key.jkt, 'orders');
    for (const path of ['/', '/outside', '/orders-evil', '/orders', '/orders/42']) {
      await fetchWithDpop(f.context, `${ORIGIN}${path}`);
    }
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual(['root', 'root', 'root', 'orders', 'orders']);
  });

  it('allows the same path on distinct origins without merging their credentials or nonce spaces', async () => {
    const other = 'https://other.example.com';
    const f = fixture(
      [api('/orders'), { ...api('/orders'), origin: other, credentials: 'include' }],
      [success('first-origin')],
    );
    await fetchWithDpop(f.context, `${ORIGIN}/orders`);
    await fetchWithDpop(f.context, `${other}/orders`);
    expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual([undefined, undefined]);
    expect(f.attempts.map(({ credentials }) => credentials)).toEqual(['omit', 'include']);
  });
});

describe('DPH-05 canonical scope and outbound URL agreement', () => {
  it('sends the canonical path, original query and method through native fetch while omitting the fragment', async () => {
    const received = deferred<{ path: string; method: string; authorization?: string; proof: string }>();
    const server = createServer((request, response) => {
      received.resolve({
        path: request.url!,
        method: request.method!,
        authorization: request.headers.authorization,
        proof: request.headers.dpop as string,
      });
      response.end('{}');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP listener.');
      const origin = `http://127.0.0.1:${address.port}`;
      const f = fixture([{ origin, pathPrefix: '/orders', replayNamespace: 'orders' }]);
      const response = await fetchWithDpop(
        { ...f.context, fetch: globalThis.fetch },
        `${origin}/ord%65rs/%7eactive/a%2fb?key=%2f+%20&key=2#ignored`,
        { method: 'PATCH', body: 'payload' },
      );
      expect(await response.text()).toBe('{}');
      const outbound = await received.promise;
      expect(outbound).toMatchObject({
        path: '/orders/~active/a%2Fb?key=%2f+%20&key=2',
        method: 'PATCH',
        authorization: 'DPoP gateway.access.token',
      });
      const verified = await compactVerify(outbound.proof, await importJWK(key.publicJwk, 'ES256'));
      expect(JSON.parse(new TextDecoder().decode(verified.payload))).toMatchObject({
        htu: `${origin}/orders/~active/a%2Fb`,
        htm: 'PATCH',
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it.each([
    ['/orders///', '/ord%65rs/%7eactive', '/orders/~active'],
    ['/discard/%2e%2e/orders/', '/orders/./one/../two', '/orders/two'],
    ['/orders', '/orders/%2e/item', '/orders/item'],
    ['/orders%2farchive', '/orders%2Farchive/item', '/orders%2Farchive/item'],
    ['/orders', '/orders/a%2fb/%3f%23%5c', '/orders/a%2Fb/%3F%23%5C'],
    ['/orders', '/orders/%2e%2e%2fbilling', '/orders/..%2Fbilling'],
    ['/orders', '/orders/%252e%252e/billing', '/orders/%252e%252e/billing'],
    ['/%2f%2fattacker.test', '/%2F%2fattacker.test/orders', '/%2F%2Fattacker.test/orders'],
    ['/', '//attacker.test/orders', '//attacker.test/orders'],
    ['/caf%C3%A9', '/café/item', '/caf%C3%A9/item'],
  ])(
    'matches %s against %s and sends the same canonical path the proof signs',
    async (prefix, inputPath, expectedPath) => {
      const f = fixture([api(prefix)]);
      await fetchWithDpop(f.context, `${ORIGIN}${inputPath}`);
      expect(f.attempts[0].url).toBe(`${ORIGIN}${expectedPath}`);
      expect(f.attempts[0].claims.htu).toBe(`${ORIGIN}${expectedPath}`);
      expect(new URL(f.attempts[0].url).origin).toBe(ORIGIN);
    },
  );

  it.each([
    ['', 'GET'],
    ['?q=%2f+%20&n=1&n=2#part%2f', 'PATCH'],
    ['?#', 'REPORT'],
    ['#//attacker.test/billing', 'POST'],
  ])(
    'preserves query/fragment spelling %j and method %s while canonicalizing only the pathname',
    async (suffix, method) => {
      for (const asUrl of [false, true]) {
        const f = fixture([api('/orders')]);
        const input = `https://GATEWAY.example.com:443/ord%65rs/./%7eactive${suffix}`;
        await fetchWithDpop(f.context, asUrl ? new URL(input) : input, { method });
        expect(f.attempts[0]).toMatchObject({
          url: `${ORIGIN}/orders/~active${suffix}`,
          method,
          redirect: 'error',
          cache: 'no-store',
        });
        expect(f.attempts[0].claims).toMatchObject({ htu: `${ORIGIN}/orders/~active`, htm: method });
      }
    },
  );

  it.each([
    '/orders-evil',
    '/orders%2Fevil',
    '/orders%5Cevil',
    '/Orders',
    '/billing?next=/orders#orders',
    '/orders/../billing',
    '/orders/%2e%2e/billing',
    '/orders/.%2E/billing',
    '/orders/%2E./billing',
    '/%2forders',
    '//orders',
  ])('rejects %s before any credential/key/refresh/sign/network work when only /orders is configured', async (path) => {
    const f = fixture([api('/orders/')]);
    f.getAccessToken.mockReturnValue(undefined);
    const sign = vi.spyOn(crypto.subtle, 'sign');
    await expect(fetchWithDpop(f.context, `${ORIGIN}${path}`)).rejects.toMatchObject({
      code: 'DPOP_API_OUT_OF_SCOPE',
      requiresLogin: false,
    });
    expectNoAuthWork(f);
    expect(sign).not.toHaveBeenCalled();
  });

  it('does not treat an encoded slash prefix as its literal-slash route', async () => {
    const f = fixture([api('/orders%2Farchive')]);
    await expect(fetchWithDpop(f.context, `${ORIGIN}/orders/archive/item`)).rejects.toMatchObject({
      code: 'DPOP_API_OUT_OF_SCOPE',
    });
    expectNoAuthWork(f);
  });

  it.each([
    '/orders',
    '//gateway.example.com/orders',
    'https://user@gateway.example.com/orders',
    'ftp://gateway.example.com/orders',
    `${ORIGIN}/orders\\..\\billing`,
    `${ORIGIN}/bad%/../orders`,
    `${ORIGIN}/orders/%zz/..`,
    `${ORIGIN}/orders/\nitem`,
  ])('does not let a configured prefix rescue an unsafe or malformed endpoint %j', async (input) => {
    const f = fixture([api('/orders')]);
    await expect(fetchWithDpop(f.context, input)).rejects.toMatchObject({
      code: 'INVALID_DPOP_TARGET',
      requiresLogin: false,
    });
    expectNoAuthWork(f);
  });

  it.each([{ apis: [] }, { apis: [api('/orders')] }])(
    'rejects an unconfigured origin before auth work',
    async ({ apis }) => {
      const f = fixture(apis);
      await expect(fetchWithDpop(f.context, 'https://other.example.com/orders')).rejects.toMatchObject({
        code: 'DPOP_API_OUT_OF_SCOPE',
      });
      expectNoAuthWork(f);
    },
  );
});

describe('DPH-05 configuration validation', () => {
  it.each([
    [undefined, '/'],
    ['/orders', '/orders'],
    ['/orders', '/orders/'],
    ['/orders/', '/orders///'],
    ['/orders', '/ord%65rs'],
    ['/orders', '/discard/%2e%2e/orders'],
    ['/orders', '/orders/%2E'],
    ['/orders%2farchive', '/orders%2Farchive'],
    ['/', '/orders/..'],
    ['/café', '/caf%C3%A9'],
  ])('rejects duplicate normalized scopes %j and %j instead of choosing by array order', async (first, second) => {
    const f = fixture([
      api(first),
      { ...api(second, 'different-namespace'), origin: 'https://GATEWAY.example.com:443/', credentials: 'include' },
    ]);
    await expect(fetchWithDpop(f.context, `${ORIGIN}/orders`)).rejects.toMatchObject({
      code: 'INVALID_DPOP_API_CONFIG',
      requiresLogin: false,
    });
    expectNoAuthWork(f);
  });

  it('rejects even identical duplicate policies, including duplicates at an unselected origin', async () => {
    const duplicate = { ...api('/orders'), origin: 'https://other.example.com' };
    const f = fixture([api('/orders'), duplicate, { ...duplicate }]);
    await expect(fetchWithDpop(f.context, `${ORIGIN}/orders`)).rejects.toMatchObject({
      code: 'INVALID_DPOP_API_CONFIG',
    });
    expectNoAuthWork(f);
  });

  it.each([
    { pathPrefix: '' },
    { pathPrefix: 'orders' },
    { pathPrefix: 'https://attacker.test/orders' },
    { pathPrefix: '//attacker.test/orders' },
    { pathPrefix: '/.//orders' },
    { pathPrefix: '/orders?x' },
    { pathPrefix: '/orders#x' },
    { pathPrefix: '/orders\\billing' },
    { pathPrefix: '/bad%/../orders' },
    { pathPrefix: '/orders/ space' },
    { pathPrefix: '/orders/\0' },
    { pathPrefix: 42 },
    { pathPrefix: null },
    { origin: `${ORIGIN}/orders` },
    { origin: `${ORIGIN}?q=1` },
    { origin: `${ORIGIN}#fragment` },
    { origin: `${ORIGIN}/orders/..` },
    { origin: `${ORIGIN}/?` },
    { origin: `${ORIGIN}/#` },
  ])('validates malformed paths/origins even after a matching entry: %j', async (invalid) => {
    const f = fixture([api('/orders'), { ...api('/other', 'other'), ...invalid } as unknown as DpopApi]);
    await expect(fetchWithDpop(f.context, `${ORIGIN}/orders`)).rejects.toMatchObject({
      code: 'INVALID_DPOP_TARGET',
      requiresLogin: false,
    });
    expectNoAuthWork(f);
  });

  it.each([
    { replayNamespace: '' },
    { replayNamespace: 'x'.repeat(129) },
    { replayNamespace: 'bad\nnamespace' },
    { replayNamespace: 'trailing\n' },
    { replayNamespace: 'trailing\r' },
    { replayNamespace: 12 },
    { credentials: 'same-origin' },
    { credentials: null },
    { credentials: false },
    { origin: null },
  ])('rejects malformed policy fields before auth work: %j', async (invalid) => {
    const f = fixture([api('/orders'), { ...api('/other', 'other'), ...invalid } as unknown as DpopApi]);
    await expect(fetchWithDpop(f.context, `${ORIGIN}/orders`)).rejects.toMatchObject({
      code: 'INVALID_DPOP_API_CONFIG',
      requiresLogin: false,
    });
    expectNoAuthWork(f);
  });

  it('keeps HTTPS enforcement on a path-scoped origin even after a matching entry', async () => {
    const f = fixture([api('/orders'), { ...api('/orders'), origin: 'http://insecure.example.com' }]);
    await expect(fetchWithDpop(f.context, `${ORIGIN}/orders`)).rejects.toMatchObject({ code: 'INSECURE_DPOP_ORIGIN' });
    expectNoAuthWork(f);
  });
});

describe.each(['key', 'initial refresh', 'challenge refresh'] as const)(
  'DPH-05 route snapshot during %s await',
  (phase) => {
    it.each([undefined, 'omit', 'include'] as const)(
      'pins the URL, namespace and credentials=%j for the entire invocation',
      async (credentials) => {
        const selected = { ...api('/ord%65rs/'), credentials };
        const apis = [selected];
        const f = fixture(apis, [
          ...(phase === 'challenge refresh' ? [challenged('before-refresh', 'invalid_token')] : []),
          challenged('retry-nonce'),
          success('next-call-nonce'),
        ]);
        f.nonces.remember(space('orders'), key.jkt, 'initial-nonce');
        const entered = deferred<void>();
        const resume = deferred<void>();
        if (phase === 'key') {
          f.getKey.mockImplementationOnce(async () => {
            entered.resolve();
            await resume.promise;
            return key;
          });
        } else {
          if (phase === 'initial refresh') f.getAccessToken.mockReturnValue(undefined);
          f.refresh.mockImplementationOnce(async () => {
            entered.resolve();
            await resume.promise;
            return credential('new.access.token');
          });
        }
        const input = new URL(`${ORIGIN}/ord%65rs/%7eopen?keep=%2f+%20#part`);
        const options: DpopFetchOptions = { method: 'PUT', retry: 'idempotent', body: 'original' };
        const running = fetchWithDpop(f.context, input, options);
        try {
          await entered.promise;
          selected.origin = 'https://attacker.test';
          selected.pathPrefix = '/billing';
          selected.replayNamespace = 'billing';
          selected.credentials = credentials === 'include' ? 'omit' : 'include';
          apis.splice(0, 1, { ...selected });
          input.href = 'https://attacker.test/billing?changed#changed';
          options.method = 'DELETE';
        } finally {
          resume.resolve();
        }
        await running;
        expect(f.attempts).toHaveLength(phase === 'challenge refresh' ? 3 : 2);
        expect(f.attempts.map((attempt) => attempt.credentials)).toEqual(f.attempts.map(() => credentials ?? 'omit'));
        for (const attempt of f.attempts) {
          expect(attempt).toMatchObject({
            url: `${ORIGIN}/orders/~open?keep=%2f+%20#part`,
            method: 'PUT',
            credentials: credentials ?? 'omit',
            redirect: 'error',
            cache: 'no-store',
          });
          expect(attempt.claims).toMatchObject({ htm: 'PUT', htu: `${ORIGIN}/orders/~open` });
        }
        expect(f.attempts.map(({ claims }) => claims.nonce)).toEqual(
          phase === 'challenge refresh'
            ? ['initial-nonce', 'before-refresh', 'retry-nonce']
            : ['initial-nonce', 'retry-nonce'],
        );
        expect(f.nonces.get(space('orders'), key.jkt)).toBe('next-call-nonce');
        expect(f.nonces.get(space('billing', selected.origin), key.jkt)).toBeUndefined();
        expect(f.clear).not.toHaveBeenCalled();
      },
    );
  },
);
