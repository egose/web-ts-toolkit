import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithDpop, type BearerFetchContext, type DpopFetchOptions } from '../src/auth-fetch';
import { createOidcVaultDpopSession, type OidcVaultBearerSession } from '../src/auth-session';
import type { BearerAccessToken, DpopAccessToken } from '../src/credentials';
import { getOrCreateDpopKey, getOrCreateLoginDpopKey } from '../src/dpop-key-store';
import { createDpopProof } from '../src/dpop-proof';
import type { DpopNonceCache } from '../src/nonce-cache';

const nonce = vi.hoisted(() => ({ construct: vi.fn(), get: vi.fn(), remember: vi.fn(), clear: vi.fn() }));
vi.mock('../src/nonce-cache', () => ({
  DpopNonceCache: class {
    constructor() {
      nonce.construct();
    }
    get = nonce.get;
    remember = nonce.remember;
    clear = nonce.clear;
  },
}));
vi.mock('../src/dpop-key-store', () => ({ getOrCreateDpopKey: vi.fn(), getOrCreateLoginDpopKey: vi.fn() }));
vi.mock('../src/dpop-proof', () => ({ createDpopProof: vi.fn() }));

const NOW = 1_800_000_000_000;
const ORIGIN = 'https://api.example.com';
const target = `${ORIGIN}/api/profile`;
const credential = (accessToken = 'old-opaque-token'): BearerAccessToken => ({
  accessToken,
  tokenType: 'Bearer',
  expiresAt: NOW + 60_000,
  generation: accessToken,
});
const wrongMode = (): DpopAccessToken => ({ ...credential('bound-token'), tokenType: 'DPoP', jkt: 'real-binding' });
const challenged = (header = 'Bearer error="invalid_token"', status = 401) =>
  new Response('caller-owned', { status, headers: { 'WWW-Authenticate': header, 'DPoP-Nonce': 'irrelevant' } });

const fixture = (responses: Response[] = [], initial: BearerAccessToken = credential()) => {
  let current: BearerAccessToken | undefined = initial;
  const refresh = vi.fn<OidcVaultBearerSession['refresh']>(async () => {
    current = credential('new-opaque-token');
    return current;
  });
  const getAccessToken = vi.fn(() => current);
  const clear = vi.fn(async () => {
    current = undefined;
  });
  const getKey = vi.fn(async () => {
    throw new Error('Bearer must not read a signing key.');
  });
  const session: OidcVaultBearerSession & { getKey: typeof getKey } = {
    dpop: false,
    scopeId: 'bearer-unit',
    sessionTransport: 'body',
    login: async () => {},
    exchange: async () => current!,
    logout: async () => {},
    dispose() {},
    getAccessToken,
    refresh,
    clear,
    getKey,
  };
  const attempts: Array<{ url: string; init: RequestInit; headers: Headers; body?: string }> = [];
  const request = vi.fn<typeof fetch>(async (url, init) => {
    attempts.push({
      url: String(url),
      init: init!,
      headers: new Headers(init?.headers),
      body: init?.body == null ? undefined : await new Response(init.body).text(),
    });
    return responses.shift() ?? new Response('success');
  });
  const context: BearerFetchContext = {
    session,
    apis: [{ origin: ORIGIN }],
    fetch: request,
    now: () => NOW,
  };
  return {
    context,
    session,
    request,
    attempts,
    refresh,
    getAccessToken,
    getKey,
    clear,
    replace(value: BearerAccessToken | undefined) {
      current = value;
    },
  };
};

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  for (const helper of [getOrCreateDpopKey, getOrCreateLoginDpopKey, createDpopProof, ...Object.values(nonce)])
    expect(helper).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OBEAR-04 explicit Bearer API requests', () => {
  it.each([undefined, 'unused-namespace'])(
    'sends exactly Bearer auth with namespace=%j, no key/proof/nonce work, and owned Fetch policies',
    async (replayNamespace) => {
      const response = new Response('owned', { headers: { 'DPoP-Nonce': 'ignored-on-success' } });
      const read = vi.spyOn(response.headers, 'get');
      const f = fixture([response]);
      f.context.apis = [{ origin: ORIGIN, replayNamespace, credentials: 'include' }];
      f.context.nonces = { get: nonce.get, remember: nonce.remember, clear: nonce.clear } as unknown as DpopNonceCache;
      await expect(
        fetchWithDpop(f.context, target, {
          method: 'patch',
          body: 'payload',
          headers: { 'X-Caller': 'value' },
          ...({ credentials: 'omit', redirect: 'follow', cache: 'force-cache' } as RequestInit),
        }),
      ).resolves.toBe(response);
      expect(f.attempts).toHaveLength(1);
      expect([...f.attempts[0].headers]).toEqual([
        ['authorization', 'Bearer old-opaque-token'],
        ['x-caller', 'value'],
      ]);
      expect(f.attempts[0].init).toMatchObject({
        method: 'PATCH',
        credentials: 'include',
        redirect: 'error',
        cache: 'no-store',
      });
      expect(read).not.toHaveBeenCalled();
      expect(await response.text()).toBe('owned');
      expect(f.getKey).not.toHaveBeenCalled();
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.clear).not.toHaveBeenCalled();
    },
  );

  it('does not even read the optional nonce-cache property or response nonce header on a 401', async () => {
    const response = challenged('DPoP error="use_dpop_nonce", Bearer error="insufficient_scope"');
    const read = vi.spyOn(response.headers, 'get');
    const f = fixture([response]);
    Object.defineProperty(f.context, 'nonces', {
      get() {
        throw new Error('No Bearer cache access.');
      },
    });
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(response);
    expect(read).toHaveBeenCalledExactlyOnceWith('WWW-Authenticate');
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.getKey).not.toHaveBeenCalled();
  });

  it.each(['Authorization', 'authorization', 'DPoP', 'dpop', 'Cookie', 'Proxy-Authorization'])(
    'rejects caller-owned %s before credential lookup or refresh',
    async (name) => {
      const f = fixture();
      f.replace(undefined);
      await expect(fetchWithDpop(f.context, target, { headers: { [name]: 'unsafe' } })).rejects.toMatchObject({
        code: 'DPOP_AUTH_HEADER_OVERRIDE',
        requiresLogin: false,
      });
      expect(f.getAccessToken).not.toHaveBeenCalled();
      expect(f.refresh).not.toHaveBeenCalled();
      expect(f.request).not.toHaveBeenCalled();
    },
  );

  it.each([null, 0, 1, '', 'false', 'true', {}, []])('rejects invalid runtime mode %j before auth', async (dpop) => {
    const f = fixture();
    Object.defineProperty(f.session, 'dpop', { value: dpop });
    await expect(fetchWithDpop(f.context, target)).rejects.toThrow('dpop must be a boolean.');
    expect(f.getAccessToken).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.getKey).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
  });

  it('snapshots adapter mode at entry, even if refresh changes the property to true', async () => {
    const f = fixture();
    let reads = 0;
    let mode = false;
    Object.defineProperty(f.session, 'dpop', {
      get() {
        reads++;
        return mode;
      },
    });
    f.replace(undefined);
    f.refresh.mockImplementationOnce(async () => {
      mode = true;
      return credential();
    });
    await fetchWithDpop(f.context, target);
    expect(reads).toBe(1);
    expect(f.attempts[0].headers.get('Authorization')).toBe('Bearer old-opaque-token');
    expect(f.getKey).not.toHaveBeenCalled();
  });

  it('fails closed on a current wrong-mode credential without relabeling it', async () => {
    const f = fixture();
    f.replace(wrongMode() as unknown as BearerAccessToken);
    await expect(fetchWithDpop(f.context, target)).rejects.toMatchObject({
      code: 'BEARER_TOKEN_TYPE_REQUIRED',
      requiresLogin: true,
    });
    expect(f.clear).toHaveBeenCalledOnce();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.getKey).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it.each(['initial', 'challenge'] as const)(
    'a stale wrong-mode %s refresh result cannot clear a newer replacement credential',
    async (phase) => {
      const f = fixture(phase === 'challenge' ? [challenged()] : []);
      if (phase === 'initial') f.replace(undefined);
      const newer = credential('new-login-token');
      f.refresh.mockImplementationOnce(async () => {
        f.replace(newer);
        return wrongMode() as unknown as BearerAccessToken;
      });
      await expect(fetchWithDpop(f.context, target)).rejects.toMatchObject({
        code: 'BEARER_TOKEN_TYPE_REQUIRED',
        requiresLogin: true,
      });
      expect(f.clear).not.toHaveBeenCalled();
      expect(f.getAccessToken()).toBe(newer);
      expect(f.request).toHaveBeenCalledTimes(phase === 'challenge' ? 1 : 0);
      await fetchWithDpop(f.context, target);
      expect(f.attempts.at(-1)!.headers.get('Authorization')).toBe('Bearer new-login-token');
    },
  );
});

describe('OBEAR-04 Bearer challenge recovery and budgets', () => {
  it.each([
    'Bearer error="invalid_token"',
    'bEaReR realm="api", ERROR = invalid_token',
    'DPoP error="invalid_dpop_proof", Bearer error="invalid_token"',
    'Basic realm="quoted, \\"text\\"", Bearer error="invalid_token", DPoP error="use_dpop_nonce"',
  ])('refreshes once for the selected valid HTTP-401 challenge: %s', async (header) => {
    const response = challenged(header);
    const cancel = vi.spyOn(response.body!, 'cancel');
    const f = fixture([response, new Response('done')]);
    await fetchWithDpop(f.context, target);
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith({ rejectedToken: 'old-opaque-token' });
    expect(f.attempts.map(({ headers }) => headers.get('Authorization'))).toEqual([
      'Bearer old-opaque-token',
      'Bearer new-opaque-token',
    ]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.getKey).not.toHaveBeenCalled();
  });

  it.each([
    'Bearer',
    'Bearer realm="api"',
    'DPoP error="invalid_token"',
    'Bearer realm="api", DPoP error="invalid_token"',
    'DPoP error="invalid_token", Bearer error="insufficient_scope"',
    'Bearer error="use_dpop_nonce"',
    'Bearer error="invalid_dpop_proof"',
    'DPoP realm="literal, Bearer error=\\"invalid_token\\""',
    'Bearer error="invalid_token", Bearer',
    'Bearer error="invalid_token", ERROR=invalid_token',
    'Bearer error="invalid_token", DPoP error="unterminated',
    'Bearer error="invalid_token", DPoP error="one", error="two"',
    'Bearer error="invalid_token",',
    `Bearer error="invalid_token", realm="${'x'.repeat(8192)}"`,
  ])('returns unrelated/ambiguous/malformed/oversized challenges untouched: %s', async (header) => {
    const response = challenged(header);
    const cancel = vi.spyOn(response.body!, 'cancel');
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(response);
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(await response.text()).toBe('caller-owned');
  });

  it('does not refresh on a generic 401 without a challenge', async () => {
    const response = new Response('no challenge', { status: 401 });
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(response);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it.each([200, 400, 403, 429, 500, 503])('ignores valid Bearer errors on HTTP %s', async (status) => {
    const response = challenged(undefined, status);
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(response);
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('reads the challenge only once and never reinterprets headers after cleanup/refresh', async () => {
    const response = challenged();
    const read = vi
      .spyOn(response.headers, 'get')
      .mockReturnValueOnce('Bearer error="insufficient_scope"')
      .mockReturnValue('Bearer error="invalid_token"');
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(response);
    expect(read).toHaveBeenCalledExactlyOnceWith('WWW-Authenticate');
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows at most two API attempts for safe %s', async (method) => {
    const last = challenged();
    const cancel = vi.spyOn(last.body!, 'cancel');
    const f = fixture([challenged(), last]);
    await expect(fetchWithDpop(f.context, target, { method })).resolves.toBe(last);
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'POST', body: 'mutation' },
    { method: 'PUT' },
    { method: 'PATCH' },
    { method: 'DELETE' },
    { method: 'GET', retry: 'never' },
    { method: 'POST', retry: 'never' },
  ] satisfies DpopFetchOptions[])('does not replay default unsafe mutations or retry=never: %j', async (options) => {
    const response = challenged();
    const f = fixture([response]);
    await expect(fetchWithDpop(f.context, target, options)).resolves.toBe(response);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledOnce();
    expect(response.bodyUsed).toBe(false);
  });

  it.each(['missing', 'expired'] as const)(
    'initial %s acquisition spends the same one-refresh budget',
    async (kind) => {
      const response = challenged();
      const f = fixture([response], { ...credential(), expiresAt: NOW });
      if (kind === 'missing') f.replace(undefined);
      await expect(fetchWithDpop(f.context, target)).resolves.toBe(response);
      expect(f.refresh).toHaveBeenCalledExactlyOnceWith();
      expect(f.request).toHaveBeenCalledOnce();
      expect(f.attempts[0].headers.get('Authorization')).toBe('Bearer new-opaque-token');
    },
  );

  it('permits initial acquisition with retry=never, but no response-driven refresh or replay', async () => {
    const response = challenged();
    const f = fixture([response]);
    f.replace(undefined);
    await expect(fetchWithDpop(f.context, target, { method: 'POST', retry: 'never' })).resolves.toBe(response);
    expect(f.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(f.request).toHaveBeenCalledOnce();
  });

  it('does not add a nonce retry after its one Bearer refresh', async () => {
    const last = challenged('DPoP error="use_dpop_nonce", Bearer error="use_dpop_nonce"');
    const f = fixture([challenged(), last]);
    await expect(fetchWithDpop(f.context, target)).resolves.toBe(last);
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it.each(['initial', 'challenge'] as const)(
    'stops on a failed %s refresh without clearing auth or retrying',
    async (phase) => {
      const f = fixture(phase === 'challenge' ? [challenged()] : []);
      if (phase === 'initial') f.replace(undefined);
      const primary = new Error('refresh failed');
      f.refresh.mockRejectedValueOnce(primary);
      await expect(fetchWithDpop(f.context, target)).rejects.toBe(primary);
      expect(f.refresh).toHaveBeenCalledOnce();
      expect(f.request).toHaveBeenCalledTimes(phase === 'challenge' ? 1 : 0);
      expect(f.clear).not.toHaveBeenCalled();
    },
  );

  it.each(['initial', 'challenge'] as const)(
    'stops on a nonlive %s refresh result and permits later explicit recovery',
    async (phase) => {
      const f = fixture(phase === 'challenge' ? [challenged()] : []);
      if (phase === 'initial') f.replace(undefined);
      f.refresh.mockImplementationOnce(async () => {
        const expired = { ...credential('rotated-zero-live'), expiresAt: NOW };
        f.replace(expired);
        return expired;
      });
      await expect(fetchWithDpop(f.context, target)).rejects.toMatchObject({
        code: 'BEARER_ACCESS_TOKEN_EXPIRED',
        requiresLogin: false,
      });
      expect(f.refresh).toHaveBeenCalledOnce();
      expect(f.request).toHaveBeenCalledTimes(phase === 'challenge' ? 1 : 0);
      expect(f.clear).not.toHaveBeenCalled();
      await fetchWithDpop(f.context, target);
      expect(f.refresh).toHaveBeenCalledTimes(2);
      expect(f.attempts.at(-1)!.headers.get('Authorization')).toBe('Bearer new-opaque-token');
    },
  );

  it.each(['GET', 'POST'])('does not replay a %s network failure even with idempotent opt-in', async (method) => {
    const f = fixture();
    const primary = new TypeError('network unavailable');
    f.request.mockRejectedValueOnce(primary);
    await expect(fetchWithDpop(f.context, target, { method, retry: 'idempotent' })).rejects.toBe(primary);
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
  });
});

describe('OBEAR-04 Bearer replayable request snapshots', () => {
  it.each([
    ['string', (): BodyInit => 'payload', () => {}, 'payload'],
    [
      'urlencoded',
      (): BodyInit => new URLSearchParams({ message: 'payload' }),
      (body: BodyInit) => (body as URLSearchParams).set('message', 'changed'),
      'message=payload',
    ],
    ['blob', (): BodyInit => new Blob(['payload']), () => {}, 'payload'],
    [
      'buffer',
      (): BodyInit => new TextEncoder().encode('payload').buffer as ArrayBuffer,
      (body: BodyInit) => new Uint8Array(body as ArrayBuffer).fill(0),
      'payload',
    ],
    [
      'view',
      (): BodyInit => new TextEncoder().encode('payload'),
      (body: BodyInit) => (body as Uint8Array).fill(0),
      'payload',
    ],
  ] as const)(
    'replays the original %s after caller mutation during refresh',
    async (_name, build, mutate, expected) => {
      const f = fixture([challenged(), new Response('done')]);
      const body = build();
      f.refresh.mockImplementationOnce(async () => {
        mutate(body);
        return credential('new-token');
      });
      await fetchWithDpop(f.context, target, { method: 'post', retry: 'idempotent', body });
      expect(f.attempts.map((attempt) => attempt.body)).toEqual([expected, expected]);
      expect(f.attempts.map(({ init }) => init.method)).toEqual(['POST', 'POST']);
    },
  );

  it('snapshots FormData and protects both attempts from mutation during refresh', async () => {
    const form = new FormData();
    form.append('message', 'original');
    form.append('file', new Blob(['file-data']), 'example.txt');
    const f = fixture([challenged(), new Response('done')]);
    f.refresh.mockImplementationOnce(async () => {
      form.set('message', 'changed');
      form.delete('file');
      return credential();
    });
    await fetchWithDpop(f.context, target, { method: 'POST', retry: 'idempotent', body: form });
    for (const attempt of f.attempts) {
      expect(attempt.body).toContain('original');
      expect(attempt.body).not.toContain('changed');
      expect(attempt.body).toContain('filename="example.txt"');
      expect(attempt.body).toContain('file-data');
    }
    expect(f.attempts).toHaveLength(2);
  });

  it('snapshots bytes before initial acquisition rather than after the auth await', async () => {
    const body = new TextEncoder().encode('initial-body');
    const f = fixture();
    f.replace(undefined);
    f.refresh.mockImplementationOnce(async () => {
      body.fill(0);
      return credential();
    });
    await fetchWithDpop(f.context, target, { method: 'PUT', retry: 'idempotent', body });
    expect(f.attempts[0].body).toBe('initial-body');
  });

  it('rejects nonreplayable bodies and invalid retry policy before auth', async () => {
    const f = fixture();
    f.replace(undefined);
    await expect(
      fetchWithDpop(f.context, target, {
        method: 'POST',
        retry: 'idempotent',
        body: new ReadableStream() as unknown as BodyInit,
      }),
    ).rejects.toMatchObject({ code: 'DPOP_BODY_NOT_REPLAYABLE', requiresLogin: false });
    await expect(fetchWithDpop(f.context, target, { retry: 'always' as 'never' })).rejects.toThrow(
      'Unknown DPoP retry policy.',
    );
    expect(f.getAccessToken).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
});

describe('OBEAR-04 real typed Bearer session integration', () => {
  const signIn = async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('location', { origin: 'https://app.example.com' });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('sessionStorage', {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => values.delete(name),
    });
    let sequence = 0;
    const vault = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/login'))
        return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
      return Response.json({
        accessToken: `opaque-${++sequence}`,
        tokenType: 'Bearer',
        expiresIn: 60,
        sessionId: `rotated-${sequence}`,
      });
    });
    const session = createOidcVaultDpopSession({
      backendOrigin: ORIGIN,
      dpop: false,
      fetch: vault,
      now: () => NOW,
      navigate: () => {},
    });
    await session.login('/callback');
    await session.exchange('code');
    return { session, vault, values };
  };

  it('uses a newer committed credential after a late invalid_token without another vault rotation', async () => {
    const f = await signIn();
    const attempts: string[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      attempts.push(new Headers(init?.headers).get('Authorization')!);
      if (attempts.length === 1) {
        await f.session.refresh();
        return challenged();
      }
      return new Response('done');
    });
    try {
      const context: BearerFetchContext = {
        session: f.session,
        apis: [{ origin: ORIGIN }],
        fetch: request,
        now: () => NOW,
      };
      await fetchWithDpop(context, target);
      expect(attempts).toEqual(['Bearer opaque-1', 'Bearer opaque-2']);
      expect(f.vault).toHaveBeenCalledTimes(3); // login, exchange, one explicit rotation; late rejection reuses it.
      expect(f.session.getAccessToken()!.accessToken).toBe('opaque-2');
    } finally {
      f.session.dispose();
    }
  });

  it('retains the rotated body handle after a zero-live API refresh and uses it on explicit recovery', async () => {
    const f = await signIn();
    const request = vi.fn<typeof fetch>(async () => challenged());
    f.vault.mockResolvedValueOnce(
      Response.json({ accessToken: 'zero-live', expiresIn: 0, sessionId: 'zero-live-rotated-handle' }),
    );
    try {
      await expect(
        fetchWithDpop({ session: f.session, apis: [{ origin: ORIGIN }], fetch: request, now: () => NOW }, target),
      ).rejects.toMatchObject({ code: 'BEARER_ACCESS_TOKEN_EXPIRED', requiresLogin: false });
      expect(request).toHaveBeenCalledOnce();
      expect(f.session.getAccessToken()!.accessToken).toBe('zero-live');
      await f.session.refresh();
      expect(JSON.parse(String(f.vault.mock.calls.at(-1)![1]!.body))).toEqual({
        sessionId: 'zero-live-rotated-handle',
      });
      expect([...f.values.keys()].every((name) => name.startsWith('oidc-vault-bearer:'))).toBe(true);
    } finally {
      f.session.dispose();
    }
  });

  it('caller abort does not cancel the real session single-flight refresh needed by another API caller', async () => {
    const f = await signIn();
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    f.vault.mockImplementationOnce(() => {
      enter();
      return pending;
    });
    let attempts = 0;
    const request = vi.fn<typeof fetch>(async () => (++attempts <= 2 ? challenged() : new Response('done')));
    const context: BearerFetchContext = {
      session: f.session,
      apis: [{ origin: ORIGIN }],
      fetch: request,
      now: () => NOW,
    };
    const controller = new AbortController();
    const first = fetchWithDpop(context, target, { signal: controller.signal }).catch((error: unknown) => error);
    const second = fetchWithDpop(context, target);
    try {
      await entered;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(f.vault).toHaveBeenCalledTimes(3);
      const vaultSignal = f.vault.mock.calls.at(-1)![1]!.signal!;
      expect(vaultSignal).not.toBe(controller.signal);
      controller.abort();
      await expect(first).resolves.toBe(controller.signal.reason);
      expect(vaultSignal.aborted).toBe(false);
      release(Response.json({ accessToken: 'shared-refreshed', expiresIn: 60, sessionId: 'shared-handle' }));
      await expect(second).resolves.toMatchObject({ status: 200 });
      expect(f.vault).toHaveBeenCalledTimes(3);
      expect(request).toHaveBeenCalledTimes(3);
      expect(f.session.getAccessToken()!.accessToken).toBe('shared-refreshed');
    } finally {
      release(Response.json({ accessToken: 'cleanup', expiresIn: 60, sessionId: 'cleanup-handle' }));
      f.session.dispose();
      await Promise.allSettled([first, second]);
    }
  });
});
