import { base64url } from 'jose';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOidcVaultDpopSession,
  type OidcVaultBearerSession,
  type OidcVaultBearerSessionOptions,
  type OidcVaultDpopSession,
} from '../src/auth-session';
import { parseCookieSessionVersion } from '../src/cookie-session';
import { parseBearerCredentials, type BearerAccessToken } from '../src/credentials';
import { getOrCreateDpopKey, getOrCreateLoginDpopKey, type DpopKey } from '../src/dpop-key-store';
import { createDpopProof } from '../src/dpop-proof';
import {
  readCookieSessionVersion,
  readDpopScopeState,
  removeDpopScope,
  writeCookieSessionVersion,
  type CookieSessionVersion,
} from '../src/key-database';

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
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const releases: Array<() => void> = [];
const barrier = () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  releases.push(() => release.resolve());
  return {
    entered: entered.promise,
    release: () => release.resolve(),
    async wait() {
      entered.resolve();
      await release.promise;
    },
  };
};
const recognitionDigest = vi.fn<SubtleCrypto['digest']>();
// All ungated peer dependencies in this fixture resolve on the microtask queue:
// metadata/key mocks and recognitionDigest (a real SHA-256 computed synchronously,
// not native WebCrypto's worker-thread completion). The next task is therefore a
// completion checkpoint, not a guess about how long crypto/I/O might take. Tests
// must release their explicit peer barriers before using this checkpoint.
const settleContinuations = () => new Promise<void>((resolve) => setImmediate(resolve));
const outcome = <T>(pending: Promise<T>) =>
  pending.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

class StorageFixture {
  values = new Map<string, string>();
  getItem(name: string) {
    return this.values.get(name) ?? null;
  }
  setItem(name: string, value: string) {
    this.values.set(name, value);
  }
  removeItem(name: string) {
    this.values.delete(name);
  }
}
class Channel {
  static instances: Channel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  messages: unknown[] = [];
  closed = false;
  onPost?: (message: Record<string, unknown>) => void;
  constructor(readonly name: string) {
    Channel.instances.push(this);
  }
  postMessage(message: Record<string, unknown>) {
    this.messages.push(message);
    this.onPost?.(message);
  }
  receive(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
  close() {
    this.closed = true;
  }
}

let storage: StorageFixture;
let version: CookieSessionVersion | undefined;
let persistedKey: DpopKey | undefined;
let lockTail: Promise<unknown>;
let activeLocks: number;
let usedDpop: boolean;
const locks = {
  request: vi.fn((_name: string, _options: unknown, run: () => Promise<unknown>) => {
    const pending = lockTail.then(async () => {
      activeLocks++;
      try {
        return await run();
      } finally {
        activeLocks--;
      }
    });
    lockTail = pending.catch(() => {});
    return pending;
  }),
};
const sessions: Array<OidcVaultBearerSession | OidcVaultDpopSession> = [];
const assertKeyless = () => {
  for (const helper of [
    getOrCreateDpopKey,
    getOrCreateLoginDpopKey,
    createDpopProof,
    readDpopScopeState,
    removeDpopScope,
    nonce.construct,
    nonce.get,
    nonce.remember,
    nonce.clear,
  ])
    expect(helper).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetAllMocks();
  recognitionDigest.mockImplementation(async (algorithm, input) => {
    expect(algorithm).toBe('SHA-256');
    const bytes = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
    return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
  });
  storage = new StorageFixture();
  version = undefined;
  persistedKey = key;
  usedDpop = false;
  lockTail = Promise.resolve();
  activeLocks = 0;
  Channel.instances = [];
  vi.stubGlobal('location', { origin: 'https://app.example.com' });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('BroadcastChannel', Channel);
  vi.stubGlobal('crypto', {
    randomUUID: crypto.randomUUID.bind(crypto),
    subtle: { digest: recognitionDigest },
  });
  vi.mocked(getOrCreateDpopKey).mockImplementation(async () => persistedKey!);
  vi.mocked(getOrCreateLoginDpopKey).mockImplementation(async () => persistedKey!);
  vi.mocked(createDpopProof).mockResolvedValue('bound-proof');
  vi.mocked(readCookieSessionVersion).mockImplementation(async () => version && { ...version });
  vi.mocked(writeCookieSessionVersion).mockImplementation(async (_scope, value, authority) => {
    authority.assertCurrent();
    version = { ...value };
  });
  vi.mocked(readDpopScopeState).mockImplementation(async (_scope, authority) => {
    authority.assertCurrent();
    return {
      keyPresent: persistedKey !== undefined,
      keyJkt: persistedKey?.jkt,
      cookiePresent: version !== undefined,
      version: parseCookieSessionVersion(version),
    };
  });
  vi.mocked(removeDpopScope).mockImplementation(async (scope, authority, matches = () => true) => {
    const current = await readDpopScopeState(scope, authority);
    authority.assertCurrent();
    if (!matches(current)) return undefined;
    persistedKey = undefined;
    version = undefined;
    return current;
  });
});
afterEach(async () => {
  for (const session of sessions.splice(0)) session.dispose();
  for (const release of releases.splice(0)) release();
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  vi.useRealTimers();
  await settleContinuations();
  if (!usedDpop) assertKeyless();
  vi.unstubAllGlobals();
});

const fixture = (transport: 'body' | 'cookie', options: Partial<OidcVaultBearerSessionOptions> = {}) => {
  let sequence = 0;
  const credentials = (id = `opaque-${++sequence}`) => ({
    accessToken: id,
    tokenType: 'Bearer',
    expiresIn: 60,
    ...(transport === 'body' ? { sessionId: `handle-${id}` } : {}),
    user: { sub: 'alice' },
  });
  const request = vi.fn<typeof fetch>(async (input) => {
    if (String(input).endsWith('/login'))
      return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
    if (String(input).endsWith('/logout')) return Response.json({ loggedOut: true });
    return Response.json(credentials());
  });
  const navigate = vi.fn();
  const session = createOidcVaultDpopSession({
    dpop: false,
    backendOrigin: 'https://api.example.com',
    sessionTransport: transport,
    fetch: request,
    navigate,
    now: () => NOW,
    ...options,
  });
  sessions.push(session);
  const pendingKey = `oidc-vault-bearer:pending:${session.scopeId}`;
  const handleKey = `oidc-vault-bearer:handle:${session.scopeId}`;
  const channel = Channel.instances.at(-1);
  const signIn = async () => {
    await session.login('/profile');
    return session.exchange('one-time-code');
  };
  return { session, request, navigate, credentials, pendingKey, handleKey, channel, signIn };
};
const dpopFixture = () => {
  usedDpop = true;
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/login')) return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
    const accessToken = [
      base64url.encode(JSON.stringify({ alg: 'ES256' })),
      base64url.encode(JSON.stringify({ exp: NOW / 1000 + 3600, cnf: { jkt: JKT } })),
      base64url.encode('signature'),
    ].join('.');
    return Response.json({ accessToken, tokenType: 'DPoP', expiresIn: 60 });
  });
  const session = createOidcVaultDpopSession({
    backendOrigin: 'https://api.example.com',
    sessionTransport: 'cookie',
    fetch: request,
    navigate: vi.fn(),
    now: () => NOW,
  });
  sessions.push(session);
  return {
    session,
    request,
    signIn: async () => {
      await session.login();
      return session.exchange('bound-code');
    },
  };
};
const peerMessage = (token: BearerAccessToken, recognition: unknown) => ({
  type: 'token',
  mode: 'bearer',
  sender: 'peer',
  generation: token.generation,
  recognition,
  token,
});
const recognitionOf = (channel: Channel) =>
  (
    [...channel.messages].reverse().find((value) => (value as { type: string }).type === 'token') as {
      recognition: string;
    }
  ).recognition;
const nextPeer = (id = 'peer-token') => parseBearerCredentials({ accessToken: id, expiresIn: 60 }, 'cookie', NOW).token;

describe.each(['body', 'cookie'] as const)('OBEAR-03 %s keyless lifecycle', (transport) => {
  it('completes guarded login, exchange, rotation, expired-token logout and clear without proof/key/nonce helpers', async () => {
    const headers = vi.fn(async () => ({ 'X-Browser-Fingerprint': 'recognition-only' }));
    const f = fixture(transport, { fingerprint: { headers } });
    expect(f.session.dpop).toBe(false);
    expect(Object.isFrozen(f.session)).toBe(true);
    const first = await f.signIn();
    expect(first).toMatchObject({ tokenType: 'Bearer', user: { sub: 'alice' } });
    expect(first).not.toHaveProperty('jkt');
    expect(storage.getItem(f.pendingKey)).toBeNull();
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith('https://idp.example.com/authorize');
    if (transport === 'cookie') {
      expect(version).toMatchObject({ mode: 'bearer', generation: first.generation, active: true, refreshedAt: NOW });
      expect(version).not.toHaveProperty('jkt');
    } else expect(JSON.parse(storage.getItem(f.handleKey)!)).toEqual({ mode: 'bearer', sessionId: 'handle-opaque-1' });
    const rotated = await f.session.refresh();
    expect(rotated.generation).not.toBe(first.generation);
    await f.session.logout();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(storage.getItem(f.handleKey)).toBeNull();
    const calls = f.request.mock.calls;
    expect(calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['login', 'exchange', 'refresh', 'logout']);
    expect(calls.map(([, init]) => init?.credentials)).toEqual([
      'include',
      'include',
      transport === 'body' ? 'omit' : 'include',
      transport === 'body' ? 'omit' : 'include',
    ]);
    expect(calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { returnTo: '/profile' },
      { code: 'one-time-code' },
      transport === 'body' ? { sessionId: 'handle-opaque-1' } : {},
      transport === 'body' ? { sessionId: 'handle-opaque-2' } : {},
    ]);
    for (const [url, init] of calls) {
      expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
      const outgoing = new Headers(init?.headers);
      expect(outgoing.get('Content-Type')).toBe('application/json');
      expect(outgoing.has('Authorization')).toBe(false);
      expect(outgoing.has('DPoP')).toBe(false);
      expect(outgoing.has('X-Browser-Fingerprint')).toBe(!String(url).endsWith('/logout'));
    }
    await f.session.clear();
    expect(persistedKey).toBe(key);
    assertKeyless();
  });

  it('preserves an isolated pending marker across reload and exchanges only the initiating mode', async () => {
    const first = fixture(transport);
    const dpopPending = `oidc-vault-dpop:pending:${first.session.scopeId}`;
    const dpopHandle = `oidc-vault-dpop:handle:${first.session.scopeId}`;
    storage.setItem(dpopPending, JSON.stringify({ jkt: JKT }));
    storage.setItem(dpopHandle, JSON.stringify({ jkt: JKT, sessionId: 'bound-handle' }));
    await first.session.login();
    const pending = JSON.parse(storage.getItem(first.pendingKey)!);
    expect(pending).toMatchObject({ mode: 'bearer' });
    expect(pending).not.toHaveProperty('jkt');
    first.session.dispose();
    const reload = fixture(transport);
    await reload.session.exchange('callback-code');
    await reload.session.clear();
    expect(storage.getItem(dpopPending)).toBe(JSON.stringify({ jkt: JKT }));
    expect(storage.getItem(dpopHandle)).toBe(JSON.stringify({ jkt: JKT, sessionId: 'bound-handle' }));
    expect(persistedKey).toBe(key);
  });

  it('bootstraps refresh from only its persisted handle/metadata after reload', async () => {
    const first = fixture(transport);
    await first.signIn();
    const committed = version;
    const handle = storage.getItem(first.handleKey);
    first.session.dispose();
    expect(storage.getItem(first.handleKey)).toBe(handle);
    expect(version).toEqual(committed);
    const reload = fixture(transport);
    expect(reload.request).not.toHaveBeenCalled();
    expect(reload.session.getAccessToken()).toBeUndefined();
    expect((await reload.session.refresh()).tokenType).toBe('Bearer');
    expect(reload.request).toHaveBeenCalledOnce();
  });

  it('does not consume an unmarked/opposite-mode pending marker or body handle', async () => {
    const f = fixture(transport);
    storage.setItem(f.pendingKey, JSON.stringify({ jkt: JKT }));
    storage.setItem(f.handleKey, JSON.stringify({ sessionId: 'foreign-handle', jkt: JKT }));
    await expect(f.session.exchange('code')).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    await expect(f.session.refresh()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(['OIDC_VAULT_DPOP_REQUIRED', 'OIDC_VAULT_DEVICE_BINDING_REQUIRED'] as const)(
    'rejects required-binding policy %s once, with no GET/proof fallback',
    async (code) => {
      const f = fixture(transport);
      f.request.mockResolvedValueOnce(Response.json({ code }, { status: 401 }));
      await expect(f.session.login()).rejects.toMatchObject({
        code,
        requiresLogin: code === 'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
      });
      expect(f.request).toHaveBeenCalledOnce();
      expect(f.navigate).not.toHaveBeenCalled();
    },
  );

  it('rejects bound responses rather than relabeling or falling back', async () => {
    const f = fixture(transport);
    await f.signIn();
    f.request.mockResolvedValueOnce(Response.json({ ...f.credentials(), tokenType: 'DPoP' }));
    await expect(f.session.refresh()).rejects.toMatchObject({
      code: 'INVALID_BEARER_CREDENTIAL_RESPONSE',
      requiresLogin: true,
    });
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(f.request).toHaveBeenCalledTimes(3);
  });

  it('keeps refresh single-flight and FIFO logout uses the committed rotated handle', async () => {
    const f = fixture(transport);
    await f.signIn();
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials('rotated'));
    });
    const refreshing = f.session.refresh();
    expect(f.session.refresh({ rejectedToken: 'other-batch-hint' })).toBe(refreshing);
    await gate.entered;
    const loggingOut = f.session.logout();
    gate.release();
    await refreshing;
    await loggingOut;
    expect(JSON.parse(String(f.request.mock.calls.at(-1)?.[1]?.body))).toEqual(
      transport === 'body' ? { sessionId: 'handle-rotated' } : {},
    );
    await expect(f.session.refresh()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(f.session.getAccessToken()).toBeUndefined();
  });

  it('FIFO login/exchange/refresh retain their entry-time authority when queued together', async () => {
    const f = fixture(transport);
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json({ authorizationUrl: 'https://idp.example.com/authorize' });
    });
    const login = outcome(f.session.login());
    await gate.entered;
    const exchange = outcome(f.session.exchange('queued-code'));
    const refresh = outcome(f.session.refresh());
    gate.release();
    expect(await login).toEqual({ value: undefined });
    expect(await exchange).toHaveProperty('value');
    expect(await refresh).toHaveProperty('value');
    expect(f.session.getAccessToken()?.tokenType).toBe('Bearer');
  });

  it.each(['clear', 'dispose'] as const)('%s aborts owned HTTP and suppresses late publication', async (method) => {
    const f = fixture(transport);
    const first = await f.signIn();
    const gate = barrier();
    let signal: AbortSignal | null | undefined;
    f.request.mockImplementationOnce(async (_url, init) => {
      signal = init?.signal;
      await gate.wait();
      return Response.json(f.credentials('too-late'));
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    await f.session[method]();
    expect(signal?.aborted).toBe(true);
    expect(await refreshing).toMatchObject({
      error: { code: method === 'dispose' ? 'DPOP_SESSION_DISPOSED' : 'DPOP_OPERATION_SUPERSEDED' },
    });
    gate.release();
    await settleContinuations();
    expect(f.session.getAccessToken()).toBeUndefined();
    if (transport === 'body') expect(storage.getItem(f.handleKey) === null).toBe(method === 'clear');
    else expect(version?.active).toBe(method === 'dispose');
    if (method === 'dispose' && transport === 'cookie') expect(version?.generation).toBe(first.generation);
  });

  it('ordinary logout remains usable after app-token expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const f = fixture(transport, { now: Date.now });
    await f.signIn();
    vi.setSystemTime(NOW + 120_000);
    await f.session.logout();
    expect(String(f.request.mock.calls.at(-1)?.[0])).toMatch(/\/logout$/);
    expect(f.session.getAccessToken()).toBeUndefined();
  });

  it('unsupported runtime DPoP methods reject before auth/storage/scheduling/network side effects', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const f = fixture(transport, { autoRefresh: {}, now: Date.now });
    const current = await f.signIn();
    const persisted = [...storage.values];
    const metadata = version;
    const requests = f.request.mock.calls.length;
    const lockCalls = locks.request.mock.calls.length;
    const timers = vi.getTimerCount();
    const runtime = f.session as unknown as Pick<OidcVaultDpopSession, 'getKey' | 'resetKey' | 'logoutAndNavigate'>;
    for (const method of ['getKey', 'resetKey', 'logoutAndNavigate'] as const)
      await expect(runtime[method]()).rejects.toMatchObject({
        code: 'DPOP_OPERATION_UNSUPPORTED',
        requiresLogin: false,
      });
    expect(f.session.getAccessToken()).toBe(current);
    expect([...storage.values]).toEqual(persisted);
    expect(version).toBe(metadata);
    expect(f.request).toHaveBeenCalledTimes(requests);
    expect(locks.request).toHaveBeenCalledTimes(lockCalls);
    expect(vi.getTimerCount()).toBe(timers);
    expect(f.navigate).toHaveBeenCalledOnce();
    await f.session.logout();
  });

  it('preserves deadlines/byte limits and never retries a nonce challenge or uncertain mutation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const f = fixture(transport, { requestTimeoutMs: 10, maxResponseBytes: 1024 });
    const original = await f.signIn();
    const challenge = Response.json(
      { code: 'OIDC_VAULT_USE_DPOP_NONCE' },
      { status: 401, headers: { 'DPoP-Nonce': 'ignored-nonce' } },
    );
    const readHeader = vi.spyOn(challenge.headers, 'get');
    f.request.mockResolvedValueOnce(challenge);
    await expect(f.session.refresh()).rejects.toMatchObject({
      code: 'OIDC_VAULT_USE_DPOP_NONCE',
      requiresLogin: false,
    });
    expect(f.request).toHaveBeenCalledTimes(3);
    expect(readHeader).not.toHaveBeenCalledWith('DPoP-Nonce');
    f.request.mockResolvedValueOnce(new Response('x'.repeat(1025)));
    await expect(f.session.refresh()).rejects.toMatchObject({ code: 'DPOP_RESPONSE_TOO_LARGE', requiresLogin: false });
    const gate = barrier();
    f.request.mockImplementationOnce(async () => {
      await gate.wait();
      return Response.json(f.credentials('uncertain'));
    });
    const refreshing = outcome(f.session.refresh());
    await gate.entered;
    await vi.advanceTimersByTimeAsync(10);
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT', requiresLogin: false } });
    gate.release();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(f.request).toHaveBeenCalledTimes(5);
    expect(f.session.getAccessToken()).toBe(original);
  });

  it('all disposed lifecycle entrypoints reject before storage, locks or HTTP', async () => {
    const f = fixture(transport);
    f.session.dispose();
    const read = vi.spyOn(storage, 'getItem');
    for (const run of [
      () => f.session.login(),
      () => f.session.exchange('code'),
      () => f.session.refresh(),
      () => f.session.logout(),
      () => f.session.clear(),
    ])
      await expect(Promise.resolve().then<unknown>(run)).rejects.toMatchObject({ code: 'DPOP_SESSION_DISPOSED' });
    expect(read).not.toHaveBeenCalled();
    expect(locks.request).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });
});

describe('OBEAR-03 browser capability and cookie mode boundaries', () => {
  it('body Bearer runs the complete lifecycle without IndexedDB, CryptoKey, Web Locks or BroadcastChannel', async () => {
    for (const name of ['indexedDB', 'CryptoKey', 'BroadcastChannel', 'navigator']) vi.stubGlobal(name, undefined);
    const f = fixture('body');
    await f.signIn();
    await f.session.refresh();
    await f.session.logout();
    await f.session.clear();
    expect(readCookieSessionVersion).not.toHaveBeenCalled();
    expect(writeCookieSessionVersion).not.toHaveBeenCalled();
  });

  it.each(['secure', 'digest', 'uuid', 'storage', 'cookie-idb', 'cookie-lock', 'cookie-channel'] as const)(
    'retains required %s feature checks before network work',
    (feature) => {
      if (feature === 'secure') vi.stubGlobal('isSecureContext', false);
      if (feature === 'digest') vi.stubGlobal('crypto', { subtle: {}, randomUUID: crypto.randomUUID });
      if (feature === 'uuid') vi.stubGlobal('crypto', { subtle: crypto.subtle });
      if (feature === 'storage') vi.stubGlobal('sessionStorage', undefined);
      if (feature === 'cookie-idb') vi.stubGlobal('indexedDB', undefined);
      if (feature === 'cookie-lock') vi.stubGlobal('navigator', {});
      if (feature === 'cookie-channel') vi.stubGlobal('BroadcastChannel', undefined);
      expect(() => fixture(feature.startsWith('cookie') ? 'cookie' : 'body')).toThrow();
    },
  );

  it.each([
    undefined,
    null,
    {},
    { mode: 'unknown', generation: 'g', active: true },
    { mode: 'bearer', jkt: JKT, generation: 'g', active: true },
    { jkt: JKT, generation: 'legacy', active: true },
    { mode: 'dpop', jkt: JKT, generation: 'explicit-dpop', active: true },
  ])('Bearer reload does not blindly refresh missing/corrupt/legacy-DPoP metadata (%j)', async (metadata) => {
    version = metadata as CookieSessionVersion | undefined;
    const f = fixture('cookie');
    await expect(f.session.refresh()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(f.request).not.toHaveBeenCalled();
    expect(writeCookieSessionVersion).not.toHaveBeenCalled();
    expect(version).toBe(metadata);
  });

  it('uses the SAME historical lock/channel while fresh Bearer login replaces DPoP, never its installed key', async () => {
    const bound = dpopFixture();
    await bound.signIn();
    const bearer = fixture('cookie');
    const gate = barrier();
    lockTail = gate.wait();
    const loggingIn = bearer.session.login();
    const staleRefresh = outcome(bound.session.refresh());
    gate.release();
    await loggingIn;
    await bearer.session.exchange('new-mode-code');
    expect(await staleRefresh).toMatchObject({ error: { code: 'LOGIN_REQUIRED' } });
    expect(bound.request).toHaveBeenCalledTimes(2);
    expect(bound.session.getAccessToken()).toBeUndefined();
    expect(version).toMatchObject({ mode: 'bearer', active: true });
    expect(version).not.toHaveProperty('jkt');
    expect(persistedKey).toBe(key);
    expect(new Set(locks.request.mock.calls.map(([name]) => name))).toEqual(
      new Set([`oidc-vault-dpop:cookie:${bearer.session.scopeId}`]),
    );
    expect(new Set(Channel.instances.map(({ name }) => name)).size).toBe(1);
  });

  it.each(['getKey', 'refresh', 'logout', 'logoutAndNavigate'] as const)(
    'DPoP %s detects opposite-mode metadata even with a live memory token',
    async (method) => {
      const bound = dpopFixture();
      await bound.signIn();
      const replacement: CookieSessionVersion = { mode: 'bearer', generation: 'replacement', active: true };
      version = replacement;
      bound.request.mockClear();
      vi.mocked(getOrCreateDpopKey).mockClear();
      await expect(bound.session[method]()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
      expect(bound.request).not.toHaveBeenCalled();
      expect(getOrCreateDpopKey).not.toHaveBeenCalled();
      expect(bound.session.getAccessToken()).toBeUndefined();
      expect(version).toBe(replacement);
      expect(persistedKey).toBe(key);
    },
  );

  it.each(['refresh', 'logout'] as const)(
    'Bearer %s checks opposite-mode metadata even with a live memory token',
    async (method) => {
      const f = fixture('cookie');
      await f.signIn();
      const replacement: CookieSessionVersion = { mode: 'dpop', jkt: JKT, generation: 'bound-successor', active: true };
      version = replacement;
      f.request.mockClear();
      await expect(f.session[method]()).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
      expect(f.request).not.toHaveBeenCalled();
      expect(f.session.getAccessToken()).toBeUndefined();
      expect(version).toBe(replacement);
    },
  );

  it('rejects a delayed callback after another mode replaces its pending generation', async () => {
    const f = fixture('cookie');
    await f.session.login();
    const bound = dpopFixture();
    await bound.signIn();
    const current = version;
    await expect(f.session.exchange('old-callback')).rejects.toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(f.request).toHaveBeenCalledOnce();
    expect(version).toBe(current);
  });

  it.each([
    ['bearer', 'same'],
    ['bearer', 'opposite'],
    ['dpop', 'same'],
    ['dpop', 'opposite'],
  ] as const)('a stale %s clear cannot overwrite a newer %s-mode generation', async (mode, successor) => {
    const f = mode === 'bearer' ? fixture('cookie') : dpopFixture();
    await f.signIn();
    const gate = barrier();
    lockTail = gate.wait();
    const clearing = f.session.clear();
    expect(f.session.getAccessToken()).toBeUndefined();
    const successorMode = successor === 'same' ? mode : mode === 'bearer' ? 'dpop' : 'bearer';
    const replacement: CookieSessionVersion =
      successorMode === 'dpop'
        ? { mode: 'dpop', jkt: JKT, generation: 'new-bound-login', active: true }
        : { mode: 'bearer', generation: 'new-unbound-login', active: true };
    version = replacement;
    const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
    gate.release();
    await clearing;
    expect(version).toBe(replacement);
    expect(writeCookieSessionVersion).toHaveBeenCalledTimes(writes);
    expect(persistedKey).toBe(key);
  });

  it.each(['same', 'opposite'] as const)(
    'stale reset rechecks %s-mode generation atomically without deleting the newer key',
    async (replacementMode) => {
      const f = dpopFixture();
      await f.signIn();
      const gate = barrier();
      const originalRemove = vi.mocked(removeDpopScope).getMockImplementation()!;
      vi.mocked(removeDpopScope).mockImplementationOnce(async (...args) => {
        await gate.wait();
        return originalRemove(...args);
      });
      const resetting = f.session.resetKey();
      await gate.entered;
      const replacement: CookieSessionVersion =
        replacementMode === 'same'
          ? { mode: 'dpop', jkt: JKT, generation: 'new-bound-generation', active: true }
          : { mode: 'bearer', generation: 'new-bearer-generation', active: true };
      version = replacement;
      gate.release();
      await resetting;
      expect(version).toBe(replacement);
      expect(persistedKey).toBe(key);
    },
  );

  it('an already stale reset cannot claim newer metadata by capturing it at entry', async () => {
    const f = dpopFixture();
    await f.signIn();
    const replacement: CookieSessionVersion = { mode: 'dpop', jkt: JKT, generation: 'new-login', active: true };
    version = replacement;
    await f.session.resetKey();
    expect(version).toBe(replacement);
    expect(persistedKey).toBe(key);
  });

  it('a stale reset preserves a newer key-only commit without matching cookie metadata', async () => {
    const f = dpopFixture();
    await f.signIn();
    const replacement = { ...key, jkt: 'B'.repeat(42) + 'A' };
    persistedKey = replacement;
    version = undefined;
    await f.session.resetKey();
    expect(persistedKey).toBe(replacement);
    expect(version).toBeUndefined();
  });

  it('explicit reset still removes a corrupt/mismatched key when its captured cookie generation is current', async () => {
    const f = dpopFixture();
    await f.signIn();
    persistedKey = { ...key, jkt: 'corrupt-key-hint', privateKey: {} as CryptoKey };
    vi.mocked(getOrCreateDpopKey).mockClear();
    await f.session.resetKey();
    expect(persistedKey).toBeUndefined();
    expect(version).toBeUndefined();
    expect(getOrCreateDpopKey).not.toHaveBeenCalled();
  });

  it.each(['bearer', 'dpop'] as const)(
    'late successful %s publication cannot replace opposite-mode metadata',
    async (mode) => {
      const f = mode === 'bearer' ? fixture('cookie') : dpopFixture();
      const original = await f.signIn();
      const gate = barrier();
      // Preserve the fixture's valid credential response, but delay its delivery.
      const respond = f.request.getMockImplementation()!;
      f.request.mockImplementationOnce(async (...args) => {
        await gate.wait();
        return respond(...args);
      });
      const refreshing = outcome<unknown>(f.session.refresh());
      await gate.entered;
      const replacement: CookieSessionVersion =
        mode === 'bearer'
          ? { mode: 'dpop', jkt: JKT, generation: 'late-bound-successor', active: true }
          : { mode: 'bearer', generation: 'late-unbound-successor', active: true };
      version = replacement;
      gate.release();
      expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
      expect(version).toBe(replacement);
      expect(f.session.getAccessToken()).toBe(original);
      expect(persistedKey).toBe(key);
    },
  );

  it.each(['OIDC_VAULT_INVALID_SESSION', 'OIDC_VAULT_REFRESH_REJECTED', 'contract'] as const)(
    'stale terminal %s cleanup preserves opposite-mode metadata/key',
    async (failure) => {
      const f = fixture('cookie');
      await f.signIn();
      const gate = barrier();
      f.request.mockImplementationOnce(async () => {
        await gate.wait();
        return failure === 'contract'
          ? Response.json({ invalid: true })
          : Response.json({ code: failure }, { status: 401 });
      });
      const refreshing = outcome(f.session.refresh());
      await gate.entered;
      const replacement: CookieSessionVersion = { mode: 'dpop', jkt: JKT, generation: 'new-mode', active: true };
      version = replacement;
      const writes = vi.mocked(writeCookieSessionVersion).mock.calls.length;
      gate.release();
      await refreshing;
      expect(version).toBe(replacement);
      expect(writeCookieSessionVersion).toHaveBeenCalledTimes(writes);
      expect(persistedKey).toBe(key);
    },
  );
});

describe('OBEAR-03 keyless peer admission and failure authority', () => {
  it('disposal immediately closes a keyless reload peer wait, without a fallback mutation', async () => {
    vi.useFakeTimers();
    const owner = fixture('cookie');
    await owner.signIn();
    owner.session.dispose();
    const reload = fixture('cookie');
    const requested = deferred<void>();
    reload.channel!.onPost = (message) => {
      if (message.type === 'request-token') requested.resolve();
    };
    const refreshing = outcome(reload.session.refresh());
    await requested.promise;
    expect(vi.getTimerCount()).toBe(1);
    reload.session.dispose();
    expect(await refreshing).toMatchObject({ error: { code: 'DPOP_SESSION_DISPOSED' } });
    expect(vi.getTimerCount()).toBe(0);
    expect(reload.request).not.toHaveBeenCalled();
    expect(reload.channel!.closed).toBe(true);
  });

  it('observes same-mode peer replacement once, ignores duplicates, and observes confirmed peer clear', async () => {
    const observed: Array<BearerAccessToken | undefined> = [];
    const admitted = deferred<void>();
    const cleared = deferred<void>();
    const f = fixture('cookie', {
      onCredentialsChanged: (value) => {
        observed.push(value);
        if (value?.accessToken === 'peer-winner') admitted.resolve();
        if (value === undefined) cleared.resolve();
      },
    });
    const current = await f.signIn();
    const peer = nextPeer('peer-winner');
    version = { mode: 'bearer', generation: peer.generation, active: true };
    const message = peerMessage(peer, recognitionOf(f.channel!));
    f.channel!.receive(message);
    await admitted.promise;
    f.channel!.receive(message);
    await settleContinuations();
    expect(observed.map((value) => value?.accessToken)).toEqual([current.accessToken, peer.accessToken]);
    version = { mode: 'bearer', generation: 'cleared-generation', active: false };
    f.channel!.receive({ type: 'clear', sender: 'peer', ...version });
    await cleared.promise;
    expect(observed.at(-1)).toBeUndefined();
    expect(f.session.getAccessToken()).toBeUndefined();
  });

  it('coalesces immediate publication/clear without observing an obsolete intermediate token', async () => {
    const observer = vi.fn();
    const f = fixture('cookie', { onCredentialsChanged: observer });
    let clearing: Promise<void> | undefined;
    f.channel!.onPost = (message) => {
      if (message.type === 'token') clearing = f.session.clear();
    };
    await expect(f.signIn()).rejects.toMatchObject({ code: 'DPOP_OPERATION_SUPERSEDED' });
    await clearing;
    await settleContinuations();
    expect(observer).not.toHaveBeenCalled();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(version?.active).toBe(false);
  });

  it.each([true, false])('recognition-compatible peer is reused only when matching (%s)', async (matching) => {
    const owner = fixture('cookie');
    const current = await owner.signIn();
    const reload = fixture('cookie');
    reload.request.mockResolvedValueOnce(Response.json(reload.credentials('backend-rotated')));
    reload.channel!.onPost = (message) => {
      if (message.type === 'request-token')
        reload.channel!.receive(peerMessage(current, matching ? message.recognition : 'changed-recognition'));
    };
    const refreshed = await reload.session.refresh();
    expect(refreshed.accessToken === current.accessToken).toBe(matching);
    expect(reload.request).toHaveBeenCalledTimes(matching ? 0 : 1);
  });

  it('ignores opposite-mode payloads, generation mismatch, expiry and final metadata replacement', async () => {
    const f = fixture('cookie');
    const current = await f.signIn();
    const recognition = recognitionOf(f.channel!);
    const peer = nextPeer();
    const reads = vi.mocked(readCookieSessionVersion);
    // Opposite-mode notifications use the FIFO/lock, without recognition crypto.
    const beforeOpposite = reads.mock.calls.length;
    f.channel!.receive({ ...peerMessage(peer, recognition), mode: 'dpop', jkt: JKT });
    await settleContinuations();
    expect(reads).toHaveBeenCalledTimes(beforeOpposite + 1);
    expect(f.session.getAccessToken()).toBe(current);

    for (const [message, metadata] of [
      [{ ...peerMessage(peer, recognition), generation: current.generation }, version],
      [
        peerMessage({ ...peer, expiresAt: NOW }, recognition),
        { mode: 'bearer', generation: peer.generation, active: true },
      ],
    ] as const) {
      version = metadata;
      const hashing = barrier();
      const digest = recognitionDigest.getMockImplementation()!;
      recognitionDigest.mockImplementationOnce(async (...args) => {
        await hashing.wait();
        return digest(...args);
      });
      const beforeCandidate = reads.mock.calls.length;
      f.channel!.receive(message);
      await hashing.entered;
      // Deliberately stall each predecessor at the boundary that caused the
      // original flake. No candidate may reach metadata before its digest.
      expect(reads).toHaveBeenCalledTimes(beforeCandidate);
      hashing.release();
      await settleContinuations();
      // Both invalid payloads finish after the first lookup (not the final
      // recheck). In particular, expiry is tested with matching metadata.
      expect(reads).toHaveBeenCalledTimes(beforeCandidate + 1);
      expect(f.session.getAccessToken()).toBe(current);
    }
    version = { mode: 'bearer', generation: peer.generation, active: true };
    const gate = barrier();
    const beforeFinal = reads.mock.calls.length;
    reads.mockResolvedValueOnce(version).mockImplementationOnce(async () => {
      await gate.wait();
      return { mode: 'dpop', jkt: JKT, generation: 'replaced-during-validation', active: true };
    });
    f.channel!.receive(peerMessage(peer, recognition));
    await gate.entered;
    expect(reads).toHaveBeenCalledTimes(beforeFinal + 2);
    gate.release();
    await settleContinuations();
    expect(reads).toHaveBeenCalledTimes(beforeFinal + 2);
    expect(f.session.getAccessToken()).toBe(current);
  });

  it('checks opposite-mode notifications before local invalidation and never changes successor metadata', async () => {
    const f = fixture('cookie');
    const current = await f.signIn();
    const replacement: CookieSessionVersion = { mode: 'dpop', jkt: JKT, generation: 'bound-successor', active: true };
    const message = { type: 'token', sender: 'bound-peer', ...replacement };
    f.channel!.receive(message);
    await settleContinuations();
    expect(f.session.getAccessToken()).toBe(current);
    version = replacement;
    f.channel!.receive(message);
    await settleContinuations();
    expect(f.session.getAccessToken()).toBeUndefined();
    expect(version).toBe(replacement);
    expect(persistedKey).toBe(key);
  });

  it.each(['OIDC_VAULT_INVALID_SESSION', 'contract'] as const)(
    'a delayed %s failure cannot clear an admitted same-mode peer winner',
    async (failure) => {
      const f = fixture('cookie');
      await f.signIn();
      const recognition = recognitionOf(f.channel!);
      const gate = barrier();
      f.request.mockImplementationOnce(async () => {
        await gate.wait();
        return failure === 'contract' ? Response.json({}) : Response.json({ code: failure }, { status: 401 });
      });
      const refreshing = outcome(f.session.refresh());
      await gate.entered;
      const peer = nextPeer('winner');
      version = { mode: 'bearer', generation: peer.generation, active: true };
      const checked = deferred<void>();
      vi.mocked(readCookieSessionVersion)
        .mockResolvedValueOnce(version)
        .mockImplementationOnce(async () => {
          checked.resolve();
          return version;
        });
      f.channel!.receive(peerMessage(peer, recognition));
      await checked.promise;
      await settleContinuations();
      expect(f.session.getAccessToken()?.accessToken).toBe('winner');
      gate.release();
      expect(await refreshing).toMatchObject({ error: { code: 'DPOP_OPERATION_SUPERSEDED', requiresLogin: false } });
      expect(f.session.getAccessToken()?.accessToken).toBe('winner');
      expect(version?.active).toBe(true);
    },
  );

  it('advisory lookup errors do not clear auth, including terminal-shaped errors', async () => {
    const f = fixture('cookie');
    const current = await f.signIn();
    vi.mocked(readCookieSessionVersion).mockRejectedValueOnce(
      Object.assign(new Error('advisory failure'), { requiresLogin: true }),
    );
    f.channel!.receive(peerMessage(nextPeer(), recognitionOf(f.channel!)));
    await settleContinuations();
    expect(f.session.getAccessToken()).toBe(current);
    expect(version?.generation).toBe(current.generation);
  });

  it('keeps peer acquisition hints rather than treating delayed receipt as fresh provider activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', new EventTarget());
    const owner = fixture('cookie');
    await owner.session.login();
    owner.request.mockResolvedValueOnce(Response.json({ ...owner.credentials('long-lived'), expiresIn: 3600 }));
    const current = await owner.session.exchange('code');
    vi.setSystemTime(NOW + 19 * 60_000);
    const acquired = deferred<void>();
    let observations = 0;
    const reload = fixture('cookie', {
      now: Date.now,
      autoRefresh: { maxRefreshIntervalMs: 20 * 60_000 },
      onCredentialsChanged: (value) => {
        if (value && ++observations === 2) acquired.resolve();
      },
    });
    reload.channel!.onPost = (message) => {
      if (message.type === 'request-token') reload.channel!.receive(peerMessage(current, message.recognition));
    };
    expect((await reload.session.refresh()).accessToken).toBe(current.accessToken);
    expect(reload.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    await acquired.promise;
    expect(reload.request).toHaveBeenCalledOnce();
  });
});

describe.each(['body', 'cookie'] as const)('OBEAR-03 %s Bearer observation/scheduling', (transport) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  });
  const refreshCount = (f: ReturnType<typeof fixture>) =>
    f.request.mock.calls.filter(([url]) => String(url).endsWith('/refresh')).length;

  it('observes committed exchange/refresh/clear independently of default-off scheduling and contains rejected observers', async () => {
    const observed: Array<BearerAccessToken | undefined> = [];
    const deliveries = [deferred<void>(), deferred<void>(), deferred<void>()];
    const f = fixture(transport, {
      onCredentialsChanged: (value) => {
        expect(activeLocks).toBe(0);
        observed.push(value);
        deliveries[observed.length - 1]?.resolve();
        return Promise.reject(new Error('app observer'));
      },
    });
    const first = await f.signIn();
    await deliveries[0].promise;
    const next = await f.session.refresh();
    await deliveries[1].promise;
    await f.session.clear();
    await deliveries[2].promise;
    expect(observed).toEqual([first, next, undefined]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refreshCount(f)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows reentrant clear outside lock ownership and delivers the final undefined state', async () => {
    const observed: Array<BearerAccessToken | undefined> = [];
    const cleared = deferred<void>();
    let clearing: Promise<void> | undefined;
    const f = fixture(transport, {
      onCredentialsChanged: (value) => {
        expect(activeLocks).toBe(0);
        observed.push(value);
        if (value) clearing = f.session.clear();
        else cleared.resolve();
      },
    });
    await f.signIn();
    await cleared.promise;
    await clearing;
    expect(observed).toHaveLength(2);
    expect(observed[0]?.tokenType).toBe('Bearer');
    expect(observed[1]).toBeUndefined();
    expect(f.session.getAccessToken()).toBeUndefined();
  });

  it.each(['uncertain', 'terminal', 'zero'] as const)(
    'pauses %s outcomes without loops and explicitly rearms',
    async (failure) => {
      const failed = deferred<unknown>();
      const onError = vi.fn((error) => {
        expect(activeLocks).toBe(0);
        failed.resolve(error);
      });
      const acquired = deferred<void>();
      let recovering = false;
      const f = fixture(transport, {
        autoRefresh: { maxRefreshIntervalMs: 1_000 },
        now: Date.now,
        onAutoRefreshError: onError,
        onCredentialsChanged: (value) => {
          if (recovering && value) acquired.resolve();
        },
      });
      const original = await f.signIn();
      if (failure === 'uncertain') f.request.mockRejectedValueOnce(new TypeError('uncertain rotation'));
      if (failure === 'terminal')
        f.request.mockResolvedValueOnce(Response.json({ code: 'OIDC_VAULT_REFRESH_REJECTED' }, { status: 401 }));
      if (failure === 'zero')
        f.request.mockResolvedValueOnce(Response.json({ ...f.credentials('zero'), expiresIn: 0 }));
      await vi.advanceTimersByTimeAsync(1_000);
      await failed.promise;
      if (failure === 'zero') {
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'BEARER_ACCESS_TOKEN_EXPIRED', requiresLogin: false }),
        );
        expect(f.session.getAccessToken()?.accessToken).toBe('zero');
        if (transport === 'body')
          expect(JSON.parse(storage.getItem(f.handleKey)!)).toMatchObject({ sessionId: 'handle-zero' });
      } else expect(f.session.getAccessToken()).toBe(failure === 'uncertain' ? original : undefined);
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(refreshCount(f)).toBe(1);
      expect(onError).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      if (failure === 'terminal') await f.signIn();
      else await f.session.refresh();
      recovering = true;
      await vi.advanceTimersByTimeAsync(1_000);
      await acquired.promise;
      expect(refreshCount(f)).toBe(failure === 'terminal' ? 2 : 3);
    },
  );

  it('failed explicit refresh pauses the scheduler; unsupported methods do not rearm it', async () => {
    const f = fixture(transport, { autoRefresh: { maxRefreshIntervalMs: 1_000 }, now: Date.now });
    await f.signIn();
    f.request.mockRejectedValueOnce(new TypeError('uncertain manual rotation'));
    await expect(f.session.refresh()).rejects.toThrow('uncertain manual rotation');
    const runtime = f.session as unknown as Pick<OidcVaultDpopSession, 'resetKey'>;
    await expect(runtime.resetKey()).rejects.toMatchObject({ code: 'DPOP_OPERATION_UNSUPPORTED' });
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refreshCount(f)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('zero-lifetime exchange retains committed state but never starts an automatic refresh loop', async () => {
    const onError = vi.fn();
    const f = fixture(transport, { autoRefresh: {}, now: Date.now, onAutoRefreshError: onError });
    await f.session.login();
    f.request.mockResolvedValueOnce(Response.json({ ...f.credentials('zero-exchange'), expiresIn: 0 }));
    const zero = await f.session.exchange('code');
    expect(zero.expiresAt).toBe(NOW);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refreshCount(f)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.session.getAccessToken()).toBe(zero);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: 'BEARER_ACCESS_TOKEN_EXPIRED' }));
    if (transport === 'body')
      expect(JSON.parse(storage.getItem(f.handleKey)!)).toMatchObject({ sessionId: 'handle-zero-exchange' });
    else expect(version).toMatchObject({ generation: zero.generation, active: true });
    await f.session.logout();
  });

  it('uses the safe half-life cadence and reports expired credentials without zero-live refresh loops', async () => {
    const acquired = deferred<void>();
    let observations = 0;
    const f = fixture(transport, {
      autoRefresh: {},
      now: Date.now,
      onCredentialsChanged: (value) => {
        if (value && ++observations === 2) acquired.resolve();
      },
    });
    await f.signIn();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(refreshCount(f)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await acquired.promise;
    expect(refreshCount(f)).toBe(1);
    await f.session.clear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refreshCount(f)).toBe(1);
  });
});
