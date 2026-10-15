import { base64url } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOidcVaultDpopSession,
  type OidcVaultDpopSession,
  type OidcVaultDpopSessionOptions,
} from '../src/auth-session';
import { fetchWithDpop } from '../src/auth-fetch';
import type { DpopAccessToken } from '../src/credentials';
import { getOrCreateDpopKey, getOrCreateLoginDpopKey, type DpopKey } from '../src/dpop-key-store';
import { createDpopProof } from '../src/dpop-proof';
import { keyLost, OidcVaultDpopClientError } from '../src/errors';
import {
  readCookieSessionVersion,
  readDpopScopeState,
  removeDpopScope,
  writeCookieSessionVersion,
  type CookieSessionVersion,
} from '../src/key-database';

vi.mock('../src/dpop-key-store', () => ({ getOrCreateDpopKey: vi.fn(), getOrCreateLoginDpopKey: vi.fn() }));
vi.mock('../src/dpop-proof', () => ({ createDpopProof: vi.fn() }));
vi.mock('../src/key-database', () => ({
  readCookieSessionVersion: vi.fn(),
  writeCookieSessionVersion: vi.fn(),
  readDpopScopeState: vi.fn(),
  removeDpopScope: vi.fn(),
}));

const NOW = 1_800_000_000_000;
const JKT = 'A'.repeat(43);
const key: DpopKey = {
  jkt: JKT,
  scopeId: 'unit',
  privateKey: {} as CryptoKey,
  publicJwk: { kty: 'EC', crv: 'P-256', x: JKT, y: JKT },
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const releases: Array<() => void> = [];
const drainContinuations = () => new Promise<void>((resolve) => setImmediate(resolve));

// A barrier signals the exact asynchronous boundary; no sleeps/polling select
// an interleaving. Rejections are observed immediately, including before release.
const barrier = () => {
  const entered = deferred<void>();
  const released = deferred<void>();
  releases.push(() => released.resolve());
  return {
    entered: entered.promise,
    release: () => released.resolve(),
    async wait() {
      entered.resolve();
      await released.promise;
    },
  };
};
const pendingOutcomes: Promise<unknown>[] = [];
const outcome = <T>(promise: Promise<T>) => {
  const pending = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  pendingOutcomes.push(pending);
  return pending;
};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(name: string) {
    return this.values.get(name) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(name: string) {
    this.values.delete(name);
  }
  setItem(name: string, value: string) {
    this.values.set(name, value);
  }
}

class TestChannel {
  static instances: TestChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  closed = false;
  messages: unknown[] = [];
  onPost?: (message: unknown) => void;
  constructor(readonly name: string) {
    TestChannel.instances.push(this);
  }
  postMessage(message: unknown) {
    if (this.closed) throw new Error('Channel closed');
    this.messages.push(message);
    this.onPost?.(message);
  }
  close() {
    this.closed = true;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

let storage: MemoryStorage;
let version: CookieSessionVersion | undefined;
let persistedKey: DpopKey | undefined;
let lockTail: Promise<unknown>;
const locks = {
  request: vi.fn((_name: string, _options: unknown, run: () => Promise<unknown>) => {
    const pending = lockTail.then(run);
    lockTail = pending.catch(() => {});
    return pending;
  }),
};
const sessions: OidcVaultDpopSession[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  storage = new MemoryStorage();
  version = undefined;
  persistedKey = key;
  lockTail = Promise.resolve();
  TestChannel.instances = [];
  vi.stubGlobal('location', { origin: 'https://app.example.com' });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('BroadcastChannel', TestChannel);
  vi.mocked(getOrCreateDpopKey).mockResolvedValue(key);
  vi.mocked(getOrCreateLoginDpopKey).mockImplementation((scope) => getOrCreateDpopKey(scope));
  vi.mocked(createDpopProof).mockResolvedValue('unit-proof');
  vi.mocked(readCookieSessionVersion).mockImplementation(async () => version && { ...version });
  vi.mocked(writeCookieSessionVersion).mockImplementation(async (_scope, next, authority) => {
    authority.assertCurrent();
    version = { ...next };
  });
  vi.mocked(readDpopScopeState).mockImplementation(async () => ({
    keyPresent: persistedKey !== undefined,
    keyJkt: persistedKey?.jkt,
    cookiePresent: version !== undefined,
    version: version && { ...version },
  }));
  vi.mocked(removeDpopScope).mockImplementation(async (scope, authority) => {
    authority.assertCurrent();
    const previous = await readDpopScopeState(scope, authority);
    authority.assertCurrent();
    persistedKey = undefined;
    version = undefined;
    return previous;
  });
});

afterEach(async () => {
  for (const session of sessions.splice(0)) session.dispose();
  for (const release of releases.splice(0)) release();
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  vi.useRealTimers();
  await Promise.all(pendingOutcomes.splice(0));
  await drainContinuations();
  vi.unstubAllGlobals();
});

const jwt = (id: string, jkt = JKT) =>
  [
    base64url.encode(JSON.stringify({ alg: 'ES256' })),
    base64url.encode(JSON.stringify({ sub: id, cnf: { jkt }, exp: NOW / 1000 + 3600 })),
    base64url.encode('contract-only-signature'),
  ].join('.');

const fixture = (transport: 'body' | 'cookie', options: Partial<OidcVaultDpopSessionOptions> = {}) => {
  let counter = 0;
  const credentials = (id = `response-${++counter}`, jkt = JKT) => ({
    tokenType: 'DPoP',
    accessToken: jwt(id, jkt),
    expiresIn: 60,
    ...(transport === 'body' ? { sessionId: id } : {}),
  });
  const request = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/login')) return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
    if (url.endsWith('/logout')) return Response.json({ loggedOut: true });
    return Response.json(credentials());
  });
  const navigate = vi.fn();
  const session = createOidcVaultDpopSession({
    backendOrigin: 'https://api.example.com',
    sessionTransport: transport,
    fetch: request,
    navigate,
    now: () => NOW,
    ...options,
  });
  sessions.push(session);
  const handleKey = `oidc-vault-dpop:handle:${session.scopeId}`;
  const pendingKey = `oidc-vault-dpop:pending:${session.scopeId}`;
  const seed = () => {
    storage.setItem(handleKey, JSON.stringify({ sessionId: 'persisted-handle', jkt: JKT }));
    version = { jkt: JKT, generation: 'persisted-generation', active: true };
  };
  const pendingLogin = () => storage.setItem(pendingKey, JSON.stringify({ jkt: JKT }));
  const signIn = async () => {
    await session.login();
    return session.exchange('one-time-code');
  };
  return { session, request, navigate, credentials, handleKey, pendingKey, seed, pendingLogin, signIn };
};

describe.each(['body', 'cookie'] as const)('DPH-02 %s operation authority', (transport) => {
  it.each(['login', 'refresh', 'getKey'] as const)(
    'clear supersedes %s before an asynchronous key result',
    async (method) => {
      const f = fixture(transport);
      f.seed();
      const gate = barrier();
      vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
        await gate.wait();
        return key;
      });
      const running = outcome<unknown>(f.session[method]());
      await gate.entered;
      const clearing = outcome(f.session.clear());
      gate.release();
      expect(await running).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
      await clearing;
      expect(f.request).not.toHaveBeenCalled();
      expect(f.navigate).not.toHaveBeenCalled();
      expect(storage.getItem(f.pendingKey)).toBeNull();
      expect(storage.getItem(f.handleKey)).toBeNull();
    },
  );

  it('captures exchange authority before key lookup; clear prevents network and handle publication', async () => {
    const f = fixture(transport);
    f.pendingLogin();
    const gate = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await gate.wait();
      return key;
    });
    const exchanging = outcome(f.session.exchange('code'));
    await gate.entered;
    const clearing = outcome(f.session.clear());
    expect(storage.getItem(f.pendingKey)).toBeNull();
    gate.release();
    const result = await exchanging;
    await clearing;
    expect(result).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
    expect(f.request).not.toHaveBeenCalled();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
    if (transport === 'cookie') expect(version?.active).toBe(false);
  });

  it('clear during refresh key lookup prevents further work even if that lookup fails late', async () => {
    const f = fixture(transport);
    f.seed();
    const gate = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await gate.wait();
      throw keyLost();
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const clearing = outcome(f.session.clear());
    const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
    await clearing;
    expect(f.request).not.toHaveBeenCalled();
    // Exactly the explicit clear; the late key-loss error cannot clear again.
    expect(vi.mocked(writeCookieSessionVersion).mock.calls.length - writes).toBe(transport === 'cookie' ? 1 : 0);
  });

  it('clear is prompt during response publication and cannot restore credentials', async () => {
    const f = fixture(transport);
    const old = await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
        await gate.wait();
        return key;
      });
      return Response.json(f.credentials('rotated-handle'));
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const clearing = outcome(f.session.clear());
    expect(f.session.getAccessToken(), 'memory clears before the pending publication finishes').toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED' } });
    await clearing;
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
    if (transport === 'cookie') {
      expect(version?.active).toBe(false);
      expect(version?.generation).not.toBe(old.generation);
    }
  });

  it('dispose suppresses a pending login response and navigation, preserving preexisting storage', async () => {
    const f = fixture(transport);
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
    });
    const loggingIn = outcome(f.session.login());
    await gate.entered;
    const marker = storage.getItem(f.pendingKey);
    f.session.dispose();
    gate.release();
    expect(await loggingIn).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED', requiresLogin: false } });
    expect(f.navigate).not.toHaveBeenCalled();
    expect(storage.getItem(f.pendingKey)).toBe(marker);
    expect(f.session.getAccessToken()).toBeUndefined();
  });

  it('orders refresh before logout so logout uses the rotated body handle or cookie', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials('rotated-handle'));
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const keyReads = vi.mocked(getOrCreateDpopKey).mock.calls.length;
    const loggingOut = outcome(f.session.logout());
    await drainContinuations();
    expect(vi.mocked(getOrCreateDpopKey).mock.calls.length).toBe(keyReads);
    gate.release();
    expect(await refreshing).toHaveProperty('value');
    expect(await loggingOut).toEqual({ value: undefined });
    const calls = f.request.mock.calls.filter(([url]) => String(url).endsWith('/logout'));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual(
      transport === 'body' ? { sessionId: 'rotated-handle' } : {},
    );
    expect(f.session.getAccessToken()).toBeUndefined();
    if (transport === 'cookie') expect(version?.active).toBe(false);
  });

  it('keeps refresh single-flight until a different lifecycle call, then orders a later refresh after logout', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials());
    });
    const first = f.session.refresh();
    const refreshing = outcome(first);
    expect(f.session.refresh()).toBe(first);
    await gate.entered;
    const loggingOut = outcome(f.session.logout());
    const next = f.session.refresh();
    const later = outcome(next);
    expect(next).not.toBe(first);
    gate.release();
    expect(await refreshing).toHaveProperty('value');
    expect(await loggingOut).toEqual({ value: undefined });
    expect(await later).toMatchObject({ error: { code: 'LOGIN_REQUIRED' } });
  });

  it('checks disposed queued work before key, storage or HTTP work', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials());
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const queued = [outcome(f.session.login()), outcome(f.session.exchange('queued')), outcome(f.session.logout())];
    f.session.dispose();
    const reads = vi.mocked(getOrCreateDpopKey).mock.calls.length;
    const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
    const calls = f.request.mock.calls.length;
    gate.release();
    for (const result of await Promise.all([refreshing, ...queued]))
      expect(result).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED' } });
    expect(vi.mocked(getOrCreateDpopKey).mock.calls.length).toBe(reads);
    expect(vi.mocked(writeCookieSessionVersion).mock.calls.length).toBe(writes);
    expect(f.request.mock.calls.length).toBe(calls);
  });

  it('a superseded failure cannot clear the next login or its exchanged credentials', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json({ code: 'OIDC_VAULT_INVALID_SESSION' }, { status: 401 });
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const clearing = outcome(f.session.clear());
    const loggingIn = outcome(f.session.login());
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
    await clearing;
    expect(await loggingIn).toEqual({ value: undefined });
    expect(storage.getItem(f.pendingKey)).not.toBeNull();
    const next = await f.session.exchange('new-code');
    expect(f.session.getAccessToken()).toBe(next);
  });

  it('normal reload bootstrap retains existing handles/key authority and API getKey remains usable', async () => {
    const f = fixture(transport);
    const first = await f.signIn();
    f.session.dispose();
    const reloaded = fixture(transport);
    const next = await reloaded.session.refresh();
    expect(next.jkt).toBe(first.jkt);
    const api = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    const context = {
      session: reloaded.session,
      now: () => NOW,
      fetch: api,
      apis: [{ origin: 'https://api.example.com', replayNamespace: 'api' }],
    };
    expect((await fetchWithDpop(context, 'https://api.example.com/profile')).status).toBe(200);
    expect((await reloaded.session.getKey()).jkt).toBe(JKT);
    expect(api).toHaveBeenCalledOnce();
    expect(
      vi
        .mocked(getOrCreateDpopKey)
        .mock.calls.slice(-2)
        .every(([, options]) => options?.create === false),
    ).toBe(true);
  });

  it.each(['pending', 'exchanged'] as const)('a late API key failure cannot clear a newer %s login', async (phase) => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await gate.wait();
      throw keyLost();
    });
    const reading = outcome(f.session.getKey());
    await gate.entered;
    await f.session.login();
    const marker = storage.getItem(f.pendingKey);
    const next = phase === 'exchanged' ? await f.session.exchange('new-code') : undefined;
    gate.release();
    expect(await reading).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
    expect(f.session.getAccessToken()).toBe(next);
    expect(storage.getItem(f.pendingKey)).toBe(phase === 'pending' ? marker : null);
  });

  it('getKey can read during a pending vault response without interfering with refresh single-flight', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials());
    });
    const first = f.session.refresh();
    const refreshing = outcome(first);
    await gate.entered;
    expect((await f.session.getKey()).jkt).toBe(JKT);
    expect(f.session.refresh()).toBe(first);
    gate.release();
    expect(await refreshing).toHaveProperty('value');
  });

  it('a getKey call between login and exchange does not clear the pending marker', async () => {
    const f = fixture(transport);
    await f.session.login();
    const pending = storage.getItem(f.pendingKey);
    const result = await outcome(f.session.getKey());
    expect(result).toMatchObject({ error: { code: 'LOGIN_REQUIRED' } });
    expect(storage.getItem(f.pendingKey)).toBe(pending);
    expect(await f.session.exchange('code')).toMatchObject({ jkt: JKT });
  });

  it('FIFO login/exchange/refresh remain usable when queued together', async () => {
    const f = fixture(transport);
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
    });
    const login = outcome(f.session.login());
    await gate.entered;
    const exchange = outcome(f.session.exchange('code'));
    const refresh = outcome(f.session.refresh());
    gate.release();
    expect(await login).toEqual({ value: undefined });
    expect(await exchange).toHaveProperty('value');
    expect(await refresh).toHaveProperty('value');
    expect(f.session.getAccessToken()?.jkt).toBe(JKT);
  });

  it('does not begin a request when disposed during proof creation', async () => {
    const f = fixture(transport);
    await f.signIn();
    f.request.mockClear();
    const gate = barrier();
    vi.mocked(createDpopProof).mockImplementationOnce(async () => {
      await gate.wait();
      return 'late-proof';
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    f.session.dispose();
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED' } });
    expect(f.request).not.toHaveBeenCalled();
  });

  it('does not parse/publish or clear again after clear during response-body reading', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          await gate.wait();
          if (!cancelled) {
            controller.enqueue(new TextEncoder().encode('{"code":"OIDC_VAULT_INVALID_SESSION"}'));
            controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 401 },
    );
    f.request.mockResolvedValueOnce(response);
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const clearing = outcome(f.session.clear());
    const reads = vi.mocked(getOrCreateDpopKey).mock.calls.length;
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
    await clearing;
    expect(vi.mocked(getOrCreateDpopKey).mock.calls.length).toBe(reads);
    expect(f.session.getAccessToken()).toBeUndefined();
  });

  it('all disposed entrypoints reject before storage, key, lock or network work', async () => {
    const f = fixture(transport);
    f.session.dispose();
    const readStorage = vi.spyOn(storage, 'getItem');
    const removeStorage = vi.spyOn(storage, 'removeItem');
    const operations: Array<() => Promise<unknown>> = [
      () => f.session.login(),
      () => f.session.exchange('code'),
      () => f.session.refresh(),
      () => f.session.logout(),
      () => f.session.getKey(),
      () => f.session.clear(),
      () => f.session.resetKey(),
    ];
    for (const run of operations)
      await expect(Promise.resolve().then(run)).rejects.toMatchObject({ code: 'DPOP_SESSION_DISPOSED' });
    f.session.dispose();
    expect(readStorage).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(getOrCreateDpopKey).not.toHaveBeenCalled();
    expect(readCookieSessionVersion).not.toHaveBeenCalled();
    expect(writeCookieSessionVersion).not.toHaveBeenCalled();
    expect(removeDpopScope).not.toHaveBeenCalled();
    expect(readDpopScopeState).not.toHaveBeenCalled();
    expect(locks.request).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
});

describe.each(['body', 'cookie'] as const)('DPH-04 %s nonce and error recovery', (transport) => {
  const nonceResponse = (nonce: string | undefined, status = 400) =>
    Response.json(
      { code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'private server text' },
      { status, headers: nonce === undefined ? {} : { 'DPoP-Nonce': nonce } },
    );

  it('learns success nonces across login/exchange/refresh/logout while keeping vault and API spaces separate', async () => {
    const f = fixture(transport);
    f.request
      .mockResolvedValueOnce(
        Response.json(
          { authorizationUrl: 'https://idp.example.com/authorize' },
          {
            headers: { 'DPoP-Nonce': 'login-nonce' },
          },
        ),
      )
      .mockResolvedValueOnce(Response.json(f.credentials('exchanged'), { headers: { 'DPoP-Nonce': 'exchange-nonce' } }))
      .mockResolvedValueOnce(Response.json(f.credentials('refreshed'), { headers: { 'DPoP-Nonce': 'refresh-nonce' } }));
    await f.signIn();
    await f.session.refresh();
    const api = vi.fn<typeof fetch>(async () => new Response('{}', { headers: { 'DPoP-Nonce': 'api-nonce' } }));
    await fetchWithDpop(
      {
        session: f.session,
        fetch: api,
        now: () => NOW,
        apis: [{ origin: 'https://api.example.com', replayNamespace: 'vault-is-separate' }],
      },
      'https://api.example.com/profile',
    );
    await f.session.logout();
    expect(vi.mocked(createDpopProof).mock.calls.map(([, input]) => input.nonce)).toEqual([
      undefined,
      'login-nonce',
      'exchange-nonce',
      undefined,
      'refresh-nonce',
    ]);
    expect(f.request).toHaveBeenCalledTimes(4);
    for (const [, init] of f.request.mock.calls) expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    const vaultProofs = vi
      .mocked(createDpopProof)
      .mock.calls.filter(([, input]) => !String(input.url).endsWith('/profile'));
    for (const [, input] of vaultProofs) expect(input.accessToken).toBeUndefined();
  });

  it.each([400, 401])(
    'reports repeated HTTP %s nonce challenges with the promised code and retains auth for explicit recovery',
    async (status) => {
      const f = fixture(transport);
      const old = await f.signIn();
      const handle = storage.getItem(f.handleKey);
      const previousVersion = version;
      f.request
        .mockClear()
        .mockResolvedValueOnce(nonceResponse('first', status))
        .mockResolvedValueOnce(nonceResponse('last', status));
      vi.mocked(createDpopProof).mockClear().mockResolvedValueOnce('proof-one').mockResolvedValueOnce('proof-two');
      await expect(f.session.refresh()).rejects.toMatchObject({
        code: 'DPOP_NONCE_RETRY_EXHAUSTED',
        message: 'The DPoP nonce challenge was repeated.',
        requiresLogin: false,
        status,
      });
      expect(f.request).toHaveBeenCalledTimes(2);
      expect(f.request.mock.calls.map(([, init]) => init?.body)).toEqual([
        JSON.stringify(transport === 'body' ? { sessionId: 'response-1' } : {}),
        JSON.stringify(transport === 'body' ? { sessionId: 'response-1' } : {}),
      ]);
      expect(f.request.mock.calls.map(([, init]) => new Headers(init?.headers).get('DPoP'))).toEqual([
        'proof-one',
        'proof-two',
      ]);
      expect(f.session.getAccessToken()).toBe(old);
      expect(storage.getItem(f.handleKey)).toBe(handle);
      expect(version).toEqual(previousVersion);
      expect((await f.session.refresh()).jkt).toBe(JKT);
      expect(f.request).toHaveBeenCalledTimes(3);
      expect(vi.mocked(createDpopProof).mock.calls.map(([, input]) => input.nonce)).toEqual([
        undefined,
        'first',
        'last',
      ]);
    },
  );

  it.each([undefined, 'one, two', '"quoted"', 'two words'])(
    'a malformed nonce %j cannot replace a usable nonce or enable a retry',
    async (nonce) => {
      const f = fixture(transport);
      await f.signIn();
      f.request.mockResolvedValueOnce(Response.json(f.credentials('seed'), { headers: { 'DPoP-Nonce': 'usable' } }));
      const old = await f.session.refresh();
      f.request.mockClear().mockResolvedValueOnce(nonceResponse(nonce, 401));
      vi.mocked(createDpopProof).mockClear();
      await expect(f.session.refresh()).rejects.toMatchObject({
        code: 'OIDC_VAULT_USE_DPOP_NONCE',
        requiresLogin: false,
      });
      expect(f.request).toHaveBeenCalledOnce();
      expect(f.session.getAccessToken()).toBe(old);
      await f.session.refresh();
      expect(vi.mocked(createDpopProof).mock.calls.map(([, input]) => input.nonce)).toEqual(['usable', 'usable']);
    },
  );

  it('reports exhaustion even if the repeated challenge lacks a usable nonce', async () => {
    const f = fixture(transport);
    const old = await f.signIn();
    f.request
      .mockClear()
      .mockResolvedValueOnce(nonceResponse('first'))
      .mockResolvedValueOnce(nonceResponse('ambiguous,nonce'));
    await expect(f.session.refresh()).rejects.toMatchObject({
      code: 'DPOP_NONCE_RETRY_EXHAUSTED',
      requiresLogin: false,
    });
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.session.getAccessToken()).toBe(old);
  });

  it.each([
    [401, 'OIDC_VAULT_INVALID_DPOP_PROOF'],
    [401, 'OIDC_VAULT_DPOP_REQUIRED'],
    [503, 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE'],
    [502, 'OIDC_VAULT_TOKEN_REQUEST_FAILED'],
    [500, 'OIDC_VAULT_INTERNAL_ERROR'],
    [400, 'OIDC_VAULT_INVALID_FINGERPRINT'],
    [403, 'OIDC_VAULT_UNTRUSTED_ORIGIN'],
    [401, 'unknown-server-secret'],
    [401, '__proto__'],
  ] as const)('retains auth and releases refresh ownership after non-terminal HTTP %s %s', async (status, code) => {
    const f = fixture(transport);
    const old = await f.signIn();
    const previousHandle = storage.getItem(f.handleKey);
    const previousVersion = version;
    const expectedCode = code.startsWith('OIDC_VAULT_') ? code : 'OIDC_REQUEST_FAILED';
    f.request.mockClear().mockResolvedValueOnce(Response.json({ code, message: 'private server message' }, { status }));
    await expect(f.session.refresh()).rejects.toMatchObject({ code: expectedCode, requiresLogin: false, status });
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.session.getAccessToken()).toBe(old);
    expect(storage.getItem(f.handleKey)).toBe(previousHandle);
    expect(version).toEqual(previousVersion);
    expect((await f.session.refresh()).jkt).toBe(JKT);
    expect(f.request).toHaveBeenCalledTimes(2);
  });

  it('keeps the pending login/exchange code usable after a recoverable proof failure', async () => {
    const f = fixture(transport);
    f.pendingLogin();
    const pending = storage.getItem(f.pendingKey);
    f.request.mockResolvedValueOnce(Response.json({ code: 'OIDC_VAULT_INVALID_DPOP_PROOF' }, { status: 401 }));
    await expect(f.session.exchange('unconsumed-code')).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_DPOP_PROOF',
      requiresLogin: false,
    });
    expect(f.request).toHaveBeenCalledOnce();
    expect(storage.getItem(f.pendingKey)).toBe(pending);
    expect((await f.session.exchange('unconsumed-code')).jkt).toBe(JKT);
    expect(f.request.mock.calls.map(([, init]) => init?.body)).toEqual([
      '{"code":"unconsumed-code"}',
      '{"code":"unconsumed-code"}',
    ]);
  });

  it.each([
    [401, 'OIDC_VAULT_INVALID_SESSION'],
    [400, 'OIDC_VAULT_MISSING_SESSION_ID'],
    [400, 'OIDC_VAULT_MALFORMED_SESSION_COOKIE'],
    [400, 'OIDC_VAULT_INVALID_EXCHANGE_CODE'],
    [400, 'OIDC_VAULT_INVALID_BROWSER_BINDING'],
    [401, 'OIDC_VAULT_DEVICE_BINDING_REQUIRED'],
    [403, 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED'],
  ] as const)('clears credentials and pending login on terminal HTTP %s %s', async (status, code) => {
    const f = fixture(transport);
    await f.signIn();
    f.pendingLogin();
    f.request.mockClear().mockResolvedValueOnce(Response.json({ code, message: 'private server message' }, { status }));
    const result =
      code === 'OIDC_VAULT_INVALID_EXCHANGE_CODE' ? f.session.exchange('expired-code') : f.session.refresh();
    await expect(result).rejects.toMatchObject({ code, requiresLogin: true, status });
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
    expect(storage.getItem(f.pendingKey)).toBeNull();
    if (transport === 'cookie') {
      expect(version?.active).toBe(false);
      expect(TestChannel.instances[0].messages.at(-1)).toMatchObject({ type: 'clear' });
    }
    await expect(f.session.refresh()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED', requiresLogin: true });
    expect(f.request).toHaveBeenCalledOnce();
  });

  it.each(['key-loss', 'Bearer-response'] as const)(
    'preserves terminal local %s handling without fallback',
    async (failure) => {
      const f = fixture(transport);
      await f.signIn();
      f.request.mockClear();
      if (failure === 'key-loss') vi.mocked(getOrCreateDpopKey).mockRejectedValueOnce(keyLost());
      else f.request.mockResolvedValueOnce(Response.json({ ...f.credentials(), tokenType: 'Bearer' }));
      await expect(f.session.refresh()).rejects.toMatchObject({
        code: failure === 'key-loss' ? 'DPOP_KEY_LOST' : 'INVALID_BOUND_CREDENTIAL_RESPONSE',
        requiresLogin: true,
      });
      expect(f.session.getAccessToken()).toBeUndefined();
      expect(storage.getItem(f.handleKey)).toBeNull();
      expect(f.request).toHaveBeenCalledTimes(failure === 'key-loss' ? 0 : 1);
      if (transport === 'cookie') expect(version?.active).toBe(false);
    },
  );

  it.each(['challenge', 'success'] as const)(
    'snapshots %s status and nonce before an injected response body can mutate them',
    async (kind) => {
      const f = fixture(transport);
      await f.signIn();
      f.request.mockClear();
      vi.mocked(createDpopProof).mockClear();
      const gate = barrier();
      let status = kind === 'challenge' ? 400 : 200;
      const payload =
        kind === 'challenge' ? { code: 'OIDC_VAULT_USE_DPOP_NONCE' } : f.credentials('snapshotted-success');
      const response = new Response(
        new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              await gate.wait();
              controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
              controller.close();
            },
          },
          { highWaterMark: 0 },
        ),
        { status, headers: { 'DPoP-Nonce': 'at-headers' } },
      );
      Object.defineProperty(response, 'status', { get: () => status });
      Object.defineProperty(response, 'ok', { get: () => status >= 200 && status < 300 });
      f.request.mockResolvedValueOnce(response);
      const refreshing = outcome(f.session.refresh());
      await gate.entered;
      status = kind === 'challenge' ? 200 : 401;
      response.headers.set('DPoP-Nonce', 'changed-during-body');
      gate.release();
      expect(await refreshing).toHaveProperty('value');
      expect(f.request).toHaveBeenCalledTimes(kind === 'challenge' ? 2 : 1);
      if (kind === 'success') await f.session.refresh();
      expect(vi.mocked(createDpopProof).mock.calls.map(([, input]) => input.nonce)).toEqual([undefined, 'at-headers']);
    },
  );
});

describe.each(['body', 'cookie'] as const)('DPH-03 %s HTTP ownership', (transport) => {
  it.each([
    { name: 'default 1 MiB', options: {}, bytes: 1_048_576 },
    { name: 'configured', options: { maxResponseBytes: 512 }, bytes: 512 },
  ])(
    'enforces the $name byte limit without clearing auth, retrying, or retaining queue ownership',
    async ({ options, bytes }) => {
      const f = fixture(transport, options);
      const old = await f.signIn();
      f.request.mockClear();
      const previousHandle = storage.getItem(f.handleKey);
      f.request.mockResolvedValueOnce(
        new Response(' '.repeat(bytes) + '0', {
          status: 401,
          headers: { 'Content-Length': '1' },
        }),
      );
      await expect(f.session.refresh()).rejects.toMatchObject({
        code: 'DPOP_RESPONSE_TOO_LARGE',
        requiresLogin: false,
      });
      expect(f.request).toHaveBeenCalledOnce();
      expect(f.session.getAccessToken()).toBe(old);
      expect(storage.getItem(f.handleKey)).toBe(previousHandle);
      expect((await f.session.refresh()).jkt).toBe(JKT);
      expect(f.request).toHaveBeenCalledTimes(2);
    },
  );

  it('bounds a stalled fetch to 15,000ms by default and releases refresh/queue/lock ownership', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const f = fixture(transport);
    const old = await f.signIn();
    f.request.mockClear();
    const gate = barrier();
    let signal: AbortSignal | null | undefined;
    f.request.mockImplementationOnce(async (_url, init) => {
      signal = init?.signal;
      await gate.wait(); // Deliberately ignores AbortSignal.
      return Response.json(f.credentials('late-rotation'));
    });
    const first = f.session.refresh();
    let result: unknown;
    const refreshing = outcome(first).then((value) => {
      result = value;
    });
    expect(f.session.refresh()).toBe(first);
    await gate.entered;
    await vi.advanceTimersByTimeAsync(14_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT', requiresLogin: false } });
    expect(signal?.aborted).toBe(true);
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.session.getAccessToken()).toBe(old);
    expect(vi.getTimerCount()).toBe(0);

    // A later explicit operation must not join the rejected refresh or wait
    // for the noncooperative fetch. Its server outcome is deliberately separate.
    const next = f.session.refresh();
    expect(next).not.toBe(first);
    const current = await next;
    expect(current).not.toBe(old);
    gate.release();
    await refreshing;
    await drainContinuations();
    expect(f.session.getAccessToken()).toBe(current);
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a new configured HTTP deadline only for the existing single nonce retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const f = fixture(transport, { requestTimeoutMs: 100 });
    await f.signIn();
    f.request.mockClear();
    vi.mocked(createDpopProof).mockClear().mockResolvedValueOnce('proof-one').mockResolvedValueOnce('proof-two');
    const first = barrier();
    const second = barrier();
    f.request
      .mockImplementationOnce(async () => {
        await first.wait();
        return Response.json(
          { code: 'OIDC_VAULT_USE_DPOP_NONCE' },
          {
            status: 400,
            headers: { 'DPoP-Nonce': 'challenge-nonce' },
          },
        );
      })
      .mockImplementationOnce(async () => {
        await second.wait();
        return Response.json(f.credentials());
      });
    let result: unknown;
    outcome(f.session.refresh()).then((value) => {
      result = value;
    });
    await first.entered;
    await vi.advanceTimersByTimeAsync(90);
    first.release();
    await second.entered;
    await vi.advanceTimersByTimeAsync(10);
    expect(result, 'the retry has its own deadline').toBeUndefined();
    await vi.advanceTimersByTimeAsync(90);
    expect(result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT', requiresLogin: false } });
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createDpopProof).mock.calls.map(([, input]) => input.nonce)).toEqual([
      undefined,
      'challenge-nonce',
    ]);
    expect(f.request.mock.calls.map(([, init]) => new Headers(init?.headers).get('DPoP'))).toEqual([
      'proof-one',
      'proof-two',
    ]);
    for (const [, init] of f.request.mock.calls) {
      expect(init).toMatchObject({
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        credentials: transport === 'cookie' ? 'include' : 'omit',
      });
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never navigates from a login response delivered after timeout and a newer login', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const f = fixture(transport, { requestTimeoutMs: 50 });
    const gate = barrier();
    const response = Response.json({ authorizationUrl: 'https://idp.example.com/old-transaction' });
    const cancel = vi.spyOn(response.body!, 'cancel');
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return response;
    });
    let result: unknown;
    outcome(f.session.login()).then((value) => {
      result = value;
    });
    await gate.entered;
    await vi.advanceTimersByTimeAsync(50);
    expect(result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT' } });
    expect(f.navigate).not.toHaveBeenCalled();
    await f.session.login();
    const pending = storage.getItem(f.pendingKey);
    gate.release();
    await drainContinuations();
    expect(cancel).toHaveBeenCalledOnce();
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith('https://idp.example.com/authorize');
    expect(storage.getItem(f.pendingKey)).toBe(pending);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['clear', 'dispose'] as const)(
    '%s aborts in-flight fetch promptly even when the fetch ignores it',
    async (action) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const f = fixture(transport);
      await f.signIn();
      const gate = barrier();
      const late = Response.json({ code: 'OIDC_VAULT_INVALID_SESSION' }, { status: 401 });
      const cancelled = vi.spyOn(late.body!, 'cancel').mockRejectedValue(new Error('late cleanup failure'));
      let signal: AbortSignal | null | undefined;
      f.request.mockImplementationOnce(async (_url, init) => {
        signal = init?.signal;
        await gate.wait();
        return late;
      });
      let result: unknown;
      outcome(f.session.refresh()).then((value) => {
        result = value;
      });
      await gate.entered;
      const oldHandle = storage.getItem(f.handleKey);
      const oldVersion = version;
      let ended = false;
      outcome(Promise.resolve(f.session[action]())).then(() => {
        ended = true;
      });
      expect(f.session.getAccessToken()).toBeUndefined();
      await drainContinuations();
      expect(result).toMatchObject({
        error: {
          code: action === 'clear' ? 'DPOP_OPERATION_SUPERSEDED' : 'DPOP_SESSION_DISPOSED',
          requiresLogin: false,
        },
      });
      expect(ended, 'cookie clear must not wait for the abandoned HTTP response').toBe(true);
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      if (action === 'clear') {
        expect(storage.getItem(f.handleKey)).toBeNull();
        if (transport === 'cookie') expect(version?.active).toBe(false);
        await f.signIn();
      } else {
        expect(storage.getItem(f.handleKey)).toBe(oldHandle);
        expect(version).toEqual(oldVersion);
      }
      const current = f.session.getAccessToken();
      const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
      gate.release();
      await drainContinuations();
      expect(cancelled).toHaveBeenCalledOnce();
      expect(f.session.getAccessToken()).toBe(current);
      expect(writeCookieSessionVersion).toHaveBeenCalledTimes(writes);
    },
  );

  it.each(['clear', 'dispose'] as const)(
    '%s settles an ignored body read without waiting for reader cleanup',
    async (action) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const f = fixture(transport);
      await f.signIn();
      const gate = barrier();
      const cancellation = barrier();
      const read = vi.fn(async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
        await gate.wait();
        throw new Error('late unreadable response');
      });
      const cancel = vi.fn(async () => {
        await cancellation.wait();
        throw new Error('late cancellation failure');
      });
      const releaseLock = vi.fn();
      const response = Response.json(f.credentials('late-rotation'));
      vi.spyOn(response.body!, 'getReader').mockReturnValue({
        read,
        cancel,
        releaseLock,
      } as unknown as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>);
      f.request.mockResolvedValueOnce(response);
      let result: unknown;
      outcome(f.session.refresh()).then((value) => {
        result = value;
      });
      await gate.entered;
      let ended = false;
      outcome(Promise.resolve(f.session[action]())).then(() => {
        ended = true;
      });
      expect(f.session.getAccessToken()).toBeUndefined();
      await drainContinuations();
      expect(result).toMatchObject({
        error: {
          code: action === 'clear' ? 'DPOP_OPERATION_SUPERSEDED' : 'DPOP_SESSION_DISPOSED',
          requiresLogin: false,
        },
      });
      expect(ended).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();
      expect(releaseLock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      if (action === 'clear') await f.signIn();
      const current = f.session.getAccessToken();
      gate.release();
      cancellation.release();
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(current);
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it('an API caller abort leaves another waiter on the real single-flight session refresh', async () => {
    let now = NOW;
    const f = fixture(transport, { now: () => now });
    await f.signIn();
    now += 60_001;
    f.request.mockClear();
    const gate = barrier();
    let signal: AbortSignal | null | undefined;
    f.request.mockImplementationOnce(async (_url, init) => {
      signal = init?.signal;
      await gate.wait();
      return Response.json(f.credentials('winner'));
    });
    const controller = new AbortController();
    const api = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    const context = {
      session: f.session,
      fetch: api,
      now: () => now,
      apis: [{ origin: 'https://api.example.com', replayNamespace: 'api' }],
    };
    let cancelled: unknown;
    outcome(fetchWithDpop(context, 'https://api.example.com/profile', { signal: controller.signal })).then((value) => {
      cancelled = value;
    });
    const winner = outcome(fetchWithDpop(context, 'https://api.example.com/profile'));
    await gate.entered;
    controller.abort();
    await drainContinuations();
    expect(cancelled).toEqual({ error: controller.signal.reason });
    expect(signal?.aborted).toBe(false);
    expect(api).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenCalledOnce();
    gate.release();
    expect(await winner).toMatchObject({ value: { status: 200 } });
    expect(api).toHaveBeenCalledOnce();
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.session.getAccessToken()?.jkt).toBe(JKT);
  });

  it.each([
    ['login', 'INVALID_LOGIN_RESPONSE', true],
    ['exchange', 'INVALID_BOUND_CREDENTIAL_RESPONSE', true],
    ['refresh', 'INVALID_BOUND_CREDENTIAL_RESPONSE', true],
    ['logout', 'INVALID_LOGOUT_RESPONSE', false],
  ] as const)('keeps the %s response-contract error for malformed JSON', async (route, code, requiresLogin) => {
    const f = fixture(transport);
    await f.signIn();
    f.pendingLogin();
    f.request.mockResolvedValueOnce(new Response('{"private":'));
    const result = route === 'exchange' ? f.session.exchange('code') : f.session[route]();
    await expect(result).rejects.toMatchObject({ code, requiresLogin });
    expect(f.navigate).toHaveBeenCalledTimes(1);
  });
});

describe('DPH-03 public resource options', () => {
  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER, null, '100', true])(
    'rejects requestTimeoutMs %s before storage or key work',
    (value) => {
      const read = vi.spyOn(storage, 'getItem');
      expect(() => fixture('body', { requestTimeoutMs: value as number })).toThrow(
        new TypeError('requestTimeoutMs must be an integer from 1 to 2147483647 milliseconds.'),
      );
      expect(read).not.toHaveBeenCalled();
      expect(getOrCreateDpopKey).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, null, '100', true])(
    'rejects maxResponseBytes %s before storage or key work',
    (value) => {
      const read = vi.spyOn(storage, 'getItem');
      expect(() => fixture('body', { maxResponseBytes: value as number })).toThrow(
        new TypeError('maxResponseBytes must be a positive safe integer.'),
      );
      expect(read).not.toHaveBeenCalled();
      expect(getOrCreateDpopKey).not.toHaveBeenCalled();
    },
  );
  it.each([1, 2_147_483_647])('accepts the inclusive timer boundary %s', (requestTimeoutMs) => {
    fixture('body', { requestTimeoutMs, maxResponseBytes: Number.MAX_SAFE_INTEGER });
    expect(getOrCreateDpopKey).not.toHaveBeenCalled();
  });
});

describe('DPH-02 cookie peer authority and cleanup', () => {
  const peerMessage = (token: DpopAccessToken, recognition: string) => ({
    type: 'token',
    sender: 'peer',
    jkt: token.jkt,
    generation: token.generation,
    token,
    recognition,
  });

  describe('DPH-10 advisory notification admission and failure ownership', () => {
    const lastMessage = (type: 'clear' | 'token') =>
      [...TestChannel.instances[0].messages]
        .reverse()
        .find((value) => (value as { type: string }).type === type) as ReturnType<typeof peerMessage>;
    const storageFailure = () =>
      new OidcVaultDpopClientError('DPOP_KEY_STORAGE_UNAVAILABLE', 'IndexedDB key persistence is unavailable.', true);

    // These include all five independent DPH-09 cases in the ordinary suite.
    // Unlike an event-loop sleep, the read barrier also waits for recognition
    // hashing before allowing either the successful or rejecting continuation.
    describe.each(['clear', 'token'] as const)('stale %s notification', (type) => {
      it.each(['unclassified', 'terminal-shaped'] as const)(
        'a rejecting %s coordination lookup preserves newer auth and its pending marker',
        async (failure) => {
          const f = fixture('cookie');
          await f.signIn();
          const oldToken = lastMessage('token');
          const current = await f.signIn();
          const message = type === 'clear' ? lastMessage('clear') : oldToken;
          f.pendingLogin();
          const pending = storage.getItem(f.pendingKey);
          const currentVersion = version;
          const gate = barrier();
          vi.mocked(readCookieSessionVersion).mockImplementationOnce(async () => {
            await gate.wait();
            throw failure === 'terminal-shaped' ? storageFailure() : new Error('Temporary metadata read failure');
          });
          TestChannel.instances[0].receive({ ...message, sender: 'old-peer' });
          await gate.entered;
          gate.release();
          await drainContinuations();
          expect(f.session.getAccessToken()).toBe(current);
          expect(storage.getItem(f.pendingKey)).toBe(pending);
          expect(version).toEqual(currentVersion);

          // The advisory failure policy does not mask a subsequent real key
          // storage failure belonging to this context's explicit operation.
          const requests = f.request.mock.calls.length;
          vi.mocked(getOrCreateDpopKey).mockRejectedValueOnce(storageFailure());
          await expect(f.session.getKey()).rejects.toMatchObject({
            code: 'DPOP_KEY_STORAGE_UNAVAILABLE',
            requiresLogin: true,
          });
          expect(f.session.getAccessToken()).toBeUndefined();
          expect(storage.getItem(f.pendingKey)).toBeNull();
          expect(version?.active).toBe(false);
          expect(f.request).toHaveBeenCalledTimes(requests);
        },
      );

      it('a rejected lookup cannot cancel a reloaded pending-login exchange', async () => {
        const previous = fixture('cookie');
        await previous.signIn();
        const oldToken = lastMessage('token');
        await previous.session.login();
        const message = type === 'clear' ? lastMessage('clear') : oldToken;
        const pending = storage.getItem(previous.pendingKey);
        previous.session.dispose();
        const f = fixture('cookie');
        const metadata = barrier();
        vi.mocked(readCookieSessionVersion).mockImplementationOnce(async () => {
          await metadata.wait();
          throw storageFailure();
        });
        TestChannel.instances[1].receive({ ...message, sender: 'old-peer' });
        await metadata.entered;
        const keyRead = barrier();
        vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
          await keyRead.wait();
          return key;
        });
        const exchanging = outcome(f.session.exchange('new-login-code'));
        metadata.release();
        await drainContinuations();
        expect(storage.getItem(f.pendingKey)).toBe(pending);
        keyRead.release();
        expect(await exchanging).toHaveProperty('value');
        expect(f.session.getAccessToken()).toMatchObject({ jkt: JKT });
        expect(storage.getItem(f.pendingKey)).toBeNull();
        expect(version?.active).toBe(true);
      });
    });

    it.each(['confirmed', 'rejected'] as const)(
      'a new login queued during an older clear lookup retains authority when the read is %s',
      async (result) => {
        const f = fixture('cookie');
        const old = await f.signIn();
        const cleared = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
        version = cleared;
        const gate = barrier();
        vi.mocked(readCookieSessionVersion).mockImplementationOnce(async () => {
          await gate.wait();
          if (result === 'rejected') throw storageFailure();
          return cleared;
        });
        TestChannel.instances[0].receive({ type: 'clear', sender: 'old-peer', ...cleared });
        await gate.entered;
        const loggingIn = outcome(f.session.login());
        gate.release();
        expect(await loggingIn).toEqual({ value: undefined });
        expect(f.navigate).toHaveBeenCalledTimes(2);
        expect(JSON.parse(storage.getItem(f.pendingKey)!)).toEqual({ jkt: JKT });
        expect(version?.generation).not.toBe(cleared.generation);
      },
    );

    it.each(['granted', 'rejected'] as const)(
      'a new login queued behind an older clear keeps authority when its Web Lock is %s',
      async (result) => {
        const f = fixture('cookie');
        const old = await f.signIn();
        version = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
        const lock = barrier();
        locks.request.mockImplementationOnce(async (_name, _options, run) => {
          await lock.wait();
          if (result === 'rejected') throw new Error('Coordination lock unavailable');
          return run();
        });
        TestChannel.instances[0].receive({ type: 'clear', sender: 'old-peer', ...version });
        await lock.entered;
        const loggingIn = outcome(f.session.login());
        lock.release();
        expect(await loggingIn).toEqual({ value: undefined });
        expect(f.navigate).toHaveBeenCalledTimes(2);
        expect(JSON.parse(storage.getItem(f.pendingKey)!)).toEqual({ jkt: JKT });
      },
    );

    it('a new login supersedes an older clear still waiting in the lifecycle FIFO', async () => {
      const f = fixture('cookie');
      const old = await f.signIn();
      const gate = barrier();
      f.request.mockImplementationOnce(async () => {
        await gate.wait();
        throw new TypeError('Transient network failure');
      });
      const refreshing = outcome(f.session.refresh());
      await gate.entered;
      version = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
      TestChannel.instances[0].receive({ type: 'clear', sender: 'old-peer', ...version });
      const loggingIn = outcome(f.session.login());
      gate.release();
      expect(await refreshing).toMatchObject({ error: { message: 'Transient network failure' } });
      expect(await loggingIn).toEqual({ value: undefined });
      expect(f.navigate).toHaveBeenCalledTimes(2);
      expect(JSON.parse(storage.getItem(f.pendingKey)!)).toEqual({ jkt: JKT });
    });

    it('control: a successfully checked stale clear cannot erase newer auth', async () => {
      const f = fixture('cookie');
      const old = await f.signIn();
      const current = await f.signIn();
      TestChannel.instances[0].receive({ type: 'clear', sender: 'old-peer', jkt: old.jkt, generation: old.generation });
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(current);
      expect(version).toMatchObject({ active: true, generation: current.generation });
    });

    it('control: a confirmed current clear invalidates local auth while preserving the pending marker', async () => {
      const f = fixture('cookie');
      const old = await f.signIn();
      f.pendingLogin();
      const pending = storage.getItem(f.pendingKey);
      version = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
      TestChannel.instances[0].receive({ type: 'clear', sender: 'peer', ...version });
      await drainContinuations();
      expect(f.session.getAccessToken()).toBeUndefined();
      expect(storage.getItem(f.pendingKey)).toBe(pending);
      expect(version?.active).toBe(false);
    });

    it('a failed final generation recheck cannot turn a validated peer key into an auth failure', async () => {
      const f = fixture('cookie');
      const current = await f.signIn();
      const currentVersion = version;
      const gate = barrier();
      vi.mocked(readCookieSessionVersion)
        .mockResolvedValueOnce(version)
        .mockImplementationOnce(async () => {
          await gate.wait();
          throw storageFailure();
        });
      TestChannel.instances[0].receive({ ...lastMessage('token'), sender: 'peer' });
      await gate.entered;
      gate.release();
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(current);
      expect(version).toEqual(currentVersion);
    });

    it('a failed advisory recognition lookup preserves auth and remains an error on explicit refresh', async () => {
      const headers = vi.fn(async () => ({}));
      const f = fixture('cookie', { fingerprint: { headers } });
      const current = await f.signIn();
      const gate = barrier();
      headers.mockImplementationOnce(async () => {
        await gate.wait();
        throw new Error('Recognition unavailable');
      });
      TestChannel.instances[0].receive({ ...lastMessage('token'), sender: 'peer' });
      await gate.entered;
      gate.release();
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(current);
      headers.mockRejectedValueOnce(new Error('Recognition unavailable'));
      await expect(f.session.refresh()).rejects.toThrow('Recognition unavailable');
      expect(f.session.getAccessToken()).toBe(current);
    });

    it.each(['key-loss', 'storage-failure'] as const)(
      'control: an unsolicited matching token still fails closed on actual current %s',
      async (failure) => {
        const f = fixture('cookie');
        await f.signIn();
        const gate = barrier();
        vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
          await gate.wait();
          throw failure === 'key-loss' ? keyLost() : storageFailure();
        });
        TestChannel.instances[0].receive({ ...lastMessage('token'), sender: 'peer' });
        await gate.entered;
        gate.release();
        await drainContinuations();
        expect(f.session.getAccessToken()).toBeUndefined();
        expect(getOrCreateLoginDpopKey).toHaveBeenCalledOnce();
        expect(removeDpopScope).not.toHaveBeenCalled();
      },
    );

    it('a peer key mismatch against another binding cannot invalidate the still-present local key', async () => {
      const f = fixture('cookie');
      const current = await f.signIn();
      const sent = lastMessage('token');
      const otherJkt = 'B'.repeat(42) + 'A';
      const candidate = { ...current, jkt: otherJkt, generation: 'other-binding', accessToken: jwt('other', otherJkt) };
      version = { jkt: otherJkt, generation: candidate.generation, active: true };
      const currentVersion = version;
      const gate = barrier();
      vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
        await gate.wait();
        return key; // The local token's key is intact; only the peer binding differs.
      });
      TestChannel.instances[0].receive(peerMessage(candidate, sent.recognition));
      await gate.entered;
      gate.release();
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(current);
      expect(version).toEqual(currentVersion);
      expect((await f.session.getKey()).jkt).toBe(current.jkt);
    });

    it.each(['success', 'key-loss'] as const)(
      'a new login intent queued on a lock supersedes an older unsolicited peer key %s',
      async (result) => {
        const f = fixture('cookie');
        await f.signIn();
        const gate = barrier();
        vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
          await gate.wait();
          if (result === 'key-loss') throw keyLost();
          return key;
        });
        const sent = lastMessage('token');
        // A different live token would be a new publication without the intent
        // guard; a duplicate would hide that successful-adoption race.
        TestChannel.instances[0].receive(
          peerMessage({ ...sent.token, accessToken: jwt('peer-winner') }, sent.recognition),
        );
        await gate.entered;
        const current = f.session.getAccessToken();
        const lock = barrier();
        lockTail = lock.wait();
        const loggingIn = outcome(f.session.login());
        gate.release();
        await drainContinuations();
        expect(f.session.getAccessToken()).toBe(current);
        lock.release();
        expect(await loggingIn).toEqual({ value: undefined });
        expect(f.navigate).toHaveBeenCalledTimes(2);
        expect(JSON.parse(storage.getItem(f.pendingKey)!)).toEqual({ jkt: JKT });
      },
    );

    it('a requested peer key failure leaves terminal cleanup and error reporting to the explicit refresh', async () => {
      const f = fixture('cookie');
      const old = await f.signIn();
      const sent = lastMessage('token');
      const winner = { ...old, generation: 'new-generation', accessToken: jwt('winner') };
      version = { jkt: JKT, generation: winner.generation, active: true };
      const currentVersion = version;
      const requested = deferred<void>();
      TestChannel.instances[0].onPost = (message) => {
        if ((message as { type: string }).type === 'request-token') requested.resolve();
      };
      const refreshing = outcome(f.session.refresh());
      await requested.promise;
      vi.mocked(getOrCreateDpopKey).mockRejectedValue(keyLost());
      TestChannel.instances[0].receive(peerMessage(winner, sent.recognition));
      expect(await refreshing).toMatchObject({ error: { code: 'DPOP_KEY_LOST', requiresLogin: true } });
      expect(f.session.getAccessToken()).toBeUndefined();
      // Cleanup owns the old local generation, not the peer's newer one (DPH-06).
      expect(version).toEqual(currentVersion);
      expect(f.request).toHaveBeenCalledTimes(2); // Only the initial login/exchange.
    });
  });

  it.each(['success', 'key-loss'] as const)(
    'a late peer %s after a new login/exchange cannot replace or clear the newer token',
    async (result) => {
      const f = fixture('cookie');
      const old = await f.signIn();
      const channel = TestChannel.instances[0];
      const sent = [...channel.messages].reverse().find((value) => (value as { type: string }).type === 'token') as {
        recognition: string;
      };
      const gate = barrier();
      vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
        await gate.wait();
        if (result === 'key-loss') throw keyLost();
        return key;
      });
      channel.receive(peerMessage(old, sent.recognition));
      await gate.entered;
      const next = await f.signIn();
      gate.release();
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(next);
      expect(version).toMatchObject({ active: true, generation: next.generation });
    },
  );

  it('clear during cookie bootstrap metadata lookup prevents key and network work', async () => {
    const f = fixture('cookie');
    f.seed();
    const previous = version;
    const gate = barrier();
    vi.mocked(readCookieSessionVersion).mockImplementationOnce(async () => {
      await gate.wait();
      return previous;
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const clearing = outcome(f.session.clear());
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED' } });
    await clearing;
    expect(getOrCreateDpopKey).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    expect(version?.active).toBe(false);
  });

  it.each(['clear', 'dispose'] as const)(
    'passes authority through cookie publication so %s defeats a delayed active write',
    async (action) => {
      const f = fixture('cookie');
      await f.signIn();
      const previous = version;
      const gate = barrier();
      vi.mocked(writeCookieSessionVersion).mockImplementationOnce(async (_scope, next, authority) => {
        await gate.wait();
        authority.assertCurrent();
        version = next;
      });
      const refreshing = outcome(f.session.refresh());
      await gate.entered;
      const ending = outcome(Promise.resolve(f.session[action]()));
      expect(f.session.getAccessToken()).toBeUndefined();
      gate.release();
      expect(await refreshing).toMatchObject({
        error: { code: action === 'clear' ? 'DPOP_OPERATION_SUPERSEDED' : 'DPOP_SESSION_DISPOSED' },
      });
      await ending;
      if (action === 'clear') expect(version?.active).toBe(false);
      else expect(version).toEqual(previous);
      expect(f.session.getAccessToken()).toBeUndefined();
    },
  );

  it('does no storage work when a queued cookie lock is finally granted after disposal', async () => {
    const f = fixture('cookie');
    f.seed();
    const gate = barrier();
    lockTail = gate.wait();
    const running = outcome(f.session.login());
    await gate.entered;
    await drainContinuations();
    expect(locks.request).toHaveBeenCalledOnce();
    f.session.dispose();
    gate.release();
    expect(await running).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED' } });
    expect(getOrCreateDpopKey).not.toHaveBeenCalled();
    expect(readCookieSessionVersion).not.toHaveBeenCalled();
    expect(writeCookieSessionVersion).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });

  it('ignores peer tokens arriving after clear while the inactive metadata write is still queued', async () => {
    const f = fixture('cookie');
    const old = await f.signIn();
    const channel = TestChannel.instances[0];
    const sent = [...channel.messages].reverse().find((value) => (value as { type: string }).type === 'token') as {
      recognition: string;
    };
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials());
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const clearing = outcome(f.session.clear());
    channel.receive(peerMessage(old, sent.recognition));
    await drainContinuations();
    expect(f.session.getAccessToken()).toBeUndefined();
    gate.release();
    await refreshing;
    await clearing;
    expect(version?.active).toBe(false);
  });

  it('a peer adoption stalled beyond the 180ms wait cannot publish after timeout/fallback failure', async () => {
    vi.useFakeTimers();
    const f = fixture('cookie');
    f.seed();
    const requested = deferred<{ recognition: string }>();
    const channel = TestChannel.instances[0];
    channel.onPost = (message) => {
      if ((message as { type: string }).type === 'request-token') requested.resolve(message as { recognition: string });
    };
    f.request.mockRejectedValueOnce(new TypeError('network unavailable'));
    const refreshing = outcome(f.session.refresh());
    const { recognition } = await requested.promise;
    const gate = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await gate.wait();
      return key;
    });
    channel.receive(
      peerMessage(
        {
          accessToken: jwt('peer'),
          tokenType: 'DPoP',
          jkt: JKT,
          generation: version!.generation,
          expiresAt: NOW + 60_000,
        },
        recognition,
      ),
    );
    await gate.entered;
    await vi.advanceTimersByTimeAsync(180);
    expect(await refreshing).toMatchObject({ error: { message: 'network unavailable' } });
    expect(vi.getTimerCount()).toBe(0);
    gate.release();
    vi.useRealTimers();
    await drainContinuations();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(version?.active).toBe(true);
  });

  it('reuses a winner adopted by an earlier broadcast while its requested peer response is being checked', async () => {
    const f = fixture('cookie');
    const old = await f.signIn();
    f.request.mockClear();
    const channel = TestChannel.instances[0];
    const sent = [...channel.messages].reverse().find((value) => (value as { type: string }).type === 'token') as {
      recognition: string;
    };
    const winner = { ...old, generation: 'peer-rotation', accessToken: jwt('peer-winner') };
    const lock = barrier();
    lockTail = lock.wait();
    const refreshing = outcome(f.session.refresh());
    version = { jkt: JKT, generation: winner.generation, active: true };
    const broadcast = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await broadcast.wait();
      return key;
    });
    channel.receive(peerMessage(winner, sent.recognition));
    await broadcast.entered;
    const requested = deferred<void>();
    channel.onPost = (message) => {
      if ((message as { type: string }).type === 'request-token') requested.resolve();
    };
    lock.release();
    await requested.promise;
    const reply = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await reply.wait();
      return key;
    });
    channel.receive(peerMessage(winner, sent.recognition));
    await reply.entered;
    broadcast.release();
    await drainContinuations();
    expect(f.session.getAccessToken()?.accessToken).toBe(winner.accessToken);
    reply.release();
    expect(await refreshing).toMatchObject({ value: { accessToken: winner.accessToken } });
    expect(f.request).not.toHaveBeenCalled();
  });

  it('settles the peer wait and removes its timer/listener immediately on disposal', async () => {
    vi.useFakeTimers();
    const f = fixture('cookie');
    f.seed();
    const requested = deferred<void>();
    const channel = TestChannel.instances[0];
    channel.onPost = (message) => {
      if ((message as { type: string }).type === 'request-token') requested.resolve();
    };
    const refreshing = outcome(f.session.refresh());
    await requested.promise;
    expect(vi.getTimerCount()).toBe(1);
    f.session.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(channel.onmessage).toBeNull();
    expect(channel.closed).toBe(true);
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED' } });
    expect(f.request).not.toHaveBeenCalled();
  });

  it('bounds a peer wait to 180ms and releases refresh single-flight after a transient failure', async () => {
    vi.useFakeTimers();
    const f = fixture('cookie');
    f.seed();
    const requested = deferred<void>();
    TestChannel.instances[0].onPost = (message) => {
      if ((message as { type: string }).type === 'request-token') requested.resolve();
    };
    f.request.mockRejectedValueOnce(new TypeError('network unavailable'));
    const refreshing = outcome(f.session.refresh());
    await requested.promise;
    await vi.advanceTimersByTimeAsync(179);
    expect(f.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await refreshing).toMatchObject({ error: { message: 'network unavailable' } });
    expect(vi.getTimerCount()).toBe(0);
    expect(version?.active).toBe(true);
    const requestedAgain = deferred<void>();
    TestChannel.instances[0].onPost = (message) => {
      if ((message as { type: string }).type === 'request-token') requestedAgain.resolve();
    };
    const next = f.session.refresh();
    await requestedAgain.promise;
    await vi.advanceTimersByTimeAsync(180);
    expect(await next).toMatchObject({ jkt: JKT });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe.each(['body', 'cookie'] as const)('DPH-06 %s explicit key recovery', (transport) => {
  it('clears local credentials/pending login promptly and deletes persistence without validating the corrupt key', async () => {
    const f = fixture(transport);
    await f.signIn();
    f.pendingLogin();
    f.request.mockClear();
    vi.mocked(getOrCreateDpopKey).mockClear().mockRejectedValue(keyLost());
    const resetting = f.session.resetKey();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
    expect(storage.getItem(f.pendingKey)).toBeNull();
    await resetting;
    expect(persistedKey).toBeUndefined();
    expect(version).toBeUndefined();
    expect(removeDpopScope).toHaveBeenCalledOnce();
    expect(vi.mocked(removeDpopScope).mock.calls[0][0]).toBe(f.session.scopeId);
    expect(getOrCreateDpopKey).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();

    // An absent record is already reset; repeated explicit recovery still succeeds.
    await f.session.resetKey();
    expect(removeDpopScope).toHaveBeenCalledTimes(2);
    expect(persistedKey).toBeUndefined();
    expect(version).toBeUndefined();
    await Promise.all([f.session.resetKey(), f.session.resetKey()]);
    expect(removeDpopScope).toHaveBeenCalledTimes(3);
  });

  it('does not create/delete keys on failed credential operations; only the next explicit login recreates one', async () => {
    const f = fixture(transport);
    await f.signIn();
    await f.session.resetKey();
    const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
    vi.mocked(getOrCreateDpopKey)
      .mockClear()
      .mockImplementation(async (_scope, options) => {
        if (persistedKey) return persistedKey;
        if (options?.create === false) throw keyLost();
        persistedKey = replacement;
        return replacement;
      });
    f.request.mockClear();
    const api = vi.fn<typeof fetch>();
    const operations = [
      () => f.session.refresh(),
      () => f.session.getKey(),
      () => f.session.exchange('old-code'),
      () => f.session.logout(),
      () =>
        fetchWithDpop(
          {
            session: f.session,
            fetch: api,
            now: () => NOW,
            apis: [{ origin: 'https://api.example.com', replayNamespace: 'api' }],
          },
          'https://api.example.com/profile',
        ),
    ];
    for (const run of operations) {
      await expect(run()).rejects.toMatchObject({ code: 'DPOP_KEY_LOST' });
      expect(persistedKey).toBeUndefined();
      expect(version).toBeUndefined();
    }
    expect(vi.mocked(getOrCreateDpopKey).mock.calls.every(([, options]) => options?.create === false)).toBe(true);
    expect(removeDpopScope).toHaveBeenCalledOnce();
    expect(f.request).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();

    await f.session.login();
    expect(persistedKey).toBe(replacement);
    f.request.mockResolvedValueOnce(Response.json(f.credentials('replacement', replacement.jkt)));
    const next = await f.session.exchange('new-code');
    expect(next.jkt).toBe(replacement.jkt);
    expect(f.session.getAccessToken()).toBe(next);
    expect((await f.session.getKey()).jkt).toBe(replacement.jkt);
  });

  it.each(['login', 'refresh'] as const)(
    'reset aborts owned %s HTTP and finishes before a noncooperative response',
    async (method) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const f = fixture(transport);
      await f.signIn();
      const gate = barrier();
      let signal: AbortSignal | null | undefined;
      f.request.mockImplementationOnce(async (_url, init) => {
        signal = init?.signal;
        await gate.wait();
        return Response.json({ code: 'OIDC_VAULT_INVALID_SESSION' }, { status: 401 });
      });
      const running = outcome<unknown>(f.session[method]());
      await gate.entered;
      await f.session.resetKey();
      expect(await running).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(version).toBeUndefined();
      expect(persistedKey).toBeUndefined();
      expect(storage.getItem(f.pendingKey)).toBeNull();
      // Late failure must not erase a subsequent login or write another marker.
      persistedKey = key;
      const next = await f.signIn();
      const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
      gate.release();
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(next);
      expect(writeCookieSessionVersion).toHaveBeenCalledTimes(writes);
    },
  );

  it('supersedes an API key read and a held refresh publication without restoring auth', async () => {
    const f = fixture(transport);
    await f.signIn();
    const reading = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await reading.wait();
      return key;
    });
    const api = vi.fn<typeof fetch>();
    const fetching = outcome(
      fetchWithDpop(
        {
          session: f.session,
          fetch: api,
          now: () => NOW,
          apis: [{ origin: 'https://api.example.com', replayNamespace: 'api' }],
        },
        'https://api.example.com/profile',
      ),
    );
    await reading.entered;
    const publishing = barrier();
    f.request.mockImplementationOnce(async () => {
      vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
        await publishing.wait();
        return key;
      });
      return Response.json(f.credentials('stale'));
    });
    const refreshing = outcome(f.session.refresh());
    await publishing.entered;
    const resetting = outcome(f.session.resetKey());
    expect(f.session.getAccessToken()).toBeUndefined();
    reading.release();
    publishing.release();
    expect(await fetching).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED' } });
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED' } });
    expect(await resetting).toEqual({ value: undefined });
    expect(api).not.toHaveBeenCalled();
    expect(version).toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
  });
});

describe('DPH-06 cookie reset coordination', () => {
  const resetMessage = (previous: CookieSessionVersion, keyJkt = previous.jkt) => ({
    type: 'reset-key',
    sender: 'resetting-peer',
    jkt: previous.jkt,
    generation: previous.generation,
    keyJkt,
  });

  it('waits for the existing lock, rechecks disposal on admission, and never deletes from a disposed context', async () => {
    const f = fixture('cookie');
    await f.signIn();
    f.request.mockClear();
    const previous = version;
    const gate = barrier();
    lockTail = gate.wait();
    const resetting = outcome(f.session.resetKey());
    await drainContinuations();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(removeDpopScope).not.toHaveBeenCalled();
    f.session.dispose();
    gate.release();
    expect(await resetting).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED' } });
    expect(removeDpopScope).not.toHaveBeenCalled();
    expect(version).toEqual(previous);
    expect(persistedKey).toBe(key);
    expect(f.request).not.toHaveBeenCalled();
  });

  it('aborts a stale active-generation write before deleting both records and notifying peers', async () => {
    const f = fixture('cookie');
    await f.signIn();
    const previous = version!;
    const gate = barrier();
    vi.mocked(writeCookieSessionVersion).mockImplementationOnce(async (_scope, next, authority) => {
      await gate.wait();
      authority.assertCurrent();
      version = next;
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    const resetting = outcome(f.session.resetKey());
    gate.release();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED' } });
    expect(await resetting).toEqual({ value: undefined });
    expect(version).toBeUndefined();
    expect(persistedKey).toBeUndefined();
    expect(TestChannel.instances[0].messages.at(-1)).toMatchObject({
      type: 'reset-key',
      jkt: JKT,
      generation: previous.generation,
      keyJkt: JKT,
    });
  });

  it('drops an affected peer token and pending login only after confirming both records are absent', async () => {
    const f = fixture('cookie');
    await f.signIn();
    f.pendingLogin();
    const previous = version!;
    const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
    version = undefined;
    persistedKey = undefined;
    TestChannel.instances[0].receive(resetMessage(previous));
    await drainContinuations();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(storage.getItem(f.pendingKey)).toBeNull();
    expect(version).toBeUndefined();
    expect(writeCookieSessionVersion).toHaveBeenCalledTimes(writes);
    expect(removeDpopScope).not.toHaveBeenCalled();
  });

  it.each(['active-generation', 'pending-login', 'fresh-key-only'] as const)(
    'a stale reset message preserves a newer %s',
    async (state) => {
      const f = fixture('cookie');
      await f.signIn();
      const previous = version!;
      const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
      persistedKey = replacement;
      vi.mocked(getOrCreateDpopKey).mockResolvedValue(replacement);
      await f.session.login();
      if (state !== 'pending-login') {
        f.request.mockResolvedValueOnce(Response.json(f.credentials('new-login', replacement.jkt)));
        await f.session.exchange('new-code');
      }
      if (state === 'fresh-key-only') version = undefined;
      const current = f.session.getAccessToken();
      const pending = storage.getItem(f.pendingKey);
      const currentVersion = version;
      TestChannel.instances[0].receive(resetMessage(previous));
      await drainContinuations();
      expect(f.session.getAccessToken()).toBe(current);
      expect(storage.getItem(f.pendingKey)).toBe(pending);
      expect(version).toEqual(currentVersion);
      expect(persistedKey).toBe(replacement);
    },
  );

  it('does not erase a new pending binding on an old notification even if persistence has since disappeared', async () => {
    const f = fixture('cookie');
    await f.signIn();
    const previous = version!;
    const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
    vi.mocked(getOrCreateDpopKey).mockResolvedValue(replacement);
    await f.session.login();
    const pending = storage.getItem(f.pendingKey);
    version = undefined;
    persistedKey = undefined;
    TestChannel.instances[0].receive(resetMessage(previous));
    await drainContinuations();
    expect(storage.getItem(f.pendingKey)).toBe(pending);
  });

  it('a failed advisory reset lookup cannot erase a newer login', async () => {
    const f = fixture('cookie');
    await f.signIn();
    const previous = version!;
    const next = await f.signIn();
    vi.mocked(readDpopScopeState).mockRejectedValueOnce(new Error('IndexedDB temporarily unavailable'));
    TestChannel.instances[0].receive(resetMessage(previous));
    await drainContinuations();
    expect(f.session.getAccessToken()).toBe(next);
    expect(version?.generation).toBe(next.generation);
  });

  it('a new login queued during a reset-notification lookup keeps its authority', async () => {
    const f = fixture('cookie');
    await f.signIn();
    const previous = version!;
    version = undefined;
    persistedKey = undefined;
    const gate = barrier();
    vi.mocked(readDpopScopeState).mockImplementationOnce(async () => {
      await gate.wait();
      return { keyPresent: false, cookiePresent: false };
    });
    TestChannel.instances[0].receive(resetMessage(previous));
    await gate.entered;
    const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
    vi.mocked(getOrCreateDpopKey).mockImplementation(async (_scope, options) => {
      if (options?.create !== false) persistedKey = replacement;
      if (!persistedKey) throw keyLost();
      return persistedKey;
    });
    const loggingIn = outcome(f.session.login());
    gate.release();
    expect(await loggingIn).toEqual({ value: undefined });
    expect(JSON.parse(storage.getItem(f.pendingKey)!)).toEqual({ jkt: replacement.jkt });
    expect(persistedKey).toBe(replacement);
  });

  it.each(['refresh', 'getKey'] as const)(
    'an old binding failure in %s cannot invalidate a replacement login generation',
    async (method) => {
      const f = fixture('cookie');
      await f.signIn();
      const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
      persistedKey = replacement;
      vi.mocked(getOrCreateDpopKey).mockResolvedValue(replacement);
      version = { jkt: replacement.jkt, generation: 'replacement-login', active: true };
      const currentVersion = version;
      const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
      await expect(f.session[method]()).rejects.toMatchObject({ code: 'DPOP_KEY_LOST', requiresLogin: true });
      expect(f.session.getAccessToken()).toBeUndefined();
      expect(version).toEqual(currentVersion);
      expect(writeCookieSessionVersion).toHaveBeenCalledTimes(writes);
      expect(persistedKey).toBe(replacement);
    },
  );

  it('a reload key read that began before reset cannot clear the replacement generation when its failure enters the queue', async () => {
    const f = fixture('cookie');
    f.seed();
    const previous = version;
    const gate = barrier();
    vi.mocked(readCookieSessionVersion).mockImplementationOnce(async () => {
      await gate.wait();
      return previous;
    });
    const reading = outcome(f.session.getKey());
    await gate.entered;
    const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
    persistedKey = replacement;
    vi.mocked(getOrCreateDpopKey).mockResolvedValue(replacement);
    version = { jkt: replacement.jkt, generation: 'replacement-login', active: true };
    const currentVersion = version;
    gate.release();
    expect(await reading).toMatchObject({ error: { code: 'DPOP_KEY_LOST' } });
    expect(version).toEqual(currentVersion);
    expect(writeCookieSessionVersion).not.toHaveBeenCalled();
  });

  it('overlapping reload key reads keep separate failure bindings across a peer reset/login', async () => {
    const f = fixture('cookie');
    f.seed();
    const gate = barrier();
    vi.mocked(getOrCreateDpopKey).mockImplementationOnce(async () => {
      await gate.wait();
      throw keyLost();
    });
    const oldRead = outcome(f.session.getKey());
    await gate.entered;
    const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
    persistedKey = replacement;
    vi.mocked(getOrCreateDpopKey).mockResolvedValue(replacement);
    version = { jkt: replacement.jkt, generation: 'replacement-login', active: true };
    const currentVersion = version;
    expect((await f.session.getKey()).jkt).toBe(replacement.jkt);
    gate.release();
    expect(await oldRead).toMatchObject({ error: { code: 'DPOP_KEY_LOST' } });
    expect(version).toEqual(currentVersion);
    expect(writeCookieSessionVersion).not.toHaveBeenCalled();
  });
});
