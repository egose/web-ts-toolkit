import { base64url } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOidcVaultDpopSession, type OidcVaultDpopSession } from '../src/auth-session';
import { getOrCreateDpopKey, getOrCreateLoginDpopKey, type DpopKey } from '../src/dpop-key-store';
import { createDpopProof } from '../src/dpop-proof';
import { readCookieSessionVersion, writeCookieSessionVersion, type CookieSessionVersion } from '../src/key-database';

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
  scopeId: 'review',
  privateKey: {} as CryptoKey,
  publicJwk: { kty: 'EC', crv: 'P-256', x: JKT, y: JKT },
};
const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
class Channel {
  static current: Channel;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  messages: Array<Record<string, unknown>> = [];
  constructor() {
    Channel.current = this;
  }
  postMessage(message: Record<string, unknown>) {
    this.messages.push(message);
  }
  close() {}
  receive(message: Record<string, unknown>) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}
let version: CookieSessionVersion | undefined;
let session: OidcVaultDpopSession;
let values: Map<string, string>;
let navigate: ReturnType<typeof vi.fn<(authorizationUrl: string) => void>>;
let requests: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.resetAllMocks();
  values = new Map();
  version = undefined;
  let tail: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('location', { origin: 'https://app.example.com' });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('sessionStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  });
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, _options: unknown, run: () => Promise<unknown>) => {
        const next = tail.then(run);
        tail = next.catch(() => {});
        return next;
      },
    },
  });
  vi.stubGlobal('BroadcastChannel', Channel);
  vi.mocked(getOrCreateDpopKey).mockResolvedValue(key);
  vi.mocked(getOrCreateLoginDpopKey).mockResolvedValue(key);
  vi.mocked(createDpopProof).mockResolvedValue('review-proof');
  vi.mocked(readCookieSessionVersion).mockImplementation(async () => version && { ...version });
  vi.mocked(writeCookieSessionVersion).mockImplementation(async (_scope, next, authority) => {
    authority.assertCurrent();
    version = { ...next };
  });
  let sequence = 0;
  requests = vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith('/login')
      ? Response.json({ authorizationUrl: 'https://idp.example.com/authorize' })
      : Response.json({
          tokenType: 'DPoP',
          expiresIn: 60,
          accessToken: [
            base64url.encode(JSON.stringify({ alg: 'ES256' })),
            base64url.encode(JSON.stringify({ sub: `user-${++sequence}`, cnf: { jkt: JKT }, exp: NOW / 1000 + 60 })),
            base64url.encode('contract-only-signature'),
          ].join('.'),
        }),
  );
  navigate = vi.fn();
  session = createOidcVaultDpopSession({
    backendOrigin: 'https://api.example.com',
    sessionTransport: 'cookie',
    fetch: requests,
    navigate,
    now: () => NOW,
  });
});
afterEach(async () => {
  session.dispose();
  await drain();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const signIn = async () => {
  await session.login();
  return session.exchange('callback-code');
};

describe('DPH-09 independent cookie peer-generation probes', () => {
  it.each(['clear', 'token'] as const)(
    'a stale %s message plus a failed advisory read must preserve a newer login',
    async (type) => {
      const old = await signIn();
      const recognition = Channel.current.messages.find((message) => message.type === 'token')!.recognition;
      const current = await signIn();
      const currentVersion = version;
      // Remove Web Crypto scheduling from this callback-only probe. An immediate
      // lookup rejection and digest result let one event-loop turn drain every
      // continuation; an implementation may also reject the stale message earlier.
      vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(
        Uint8Array.from(base64url.decode(recognition as string)).buffer,
      );
      vi.mocked(readCookieSessionVersion).mockRejectedValueOnce(new Error('temporary IDB read failure'));
      const oldClear = [...Channel.current.messages].reverse().find((message) => message.type === 'clear')!;
      Channel.current.receive(
        type === 'clear'
          ? { ...oldClear, sender: 'old-peer' }
          : { type, sender: 'old-peer', jkt: old.jkt, generation: old.generation, token: old, recognition },
      );
      await drain();
      expect(session.getAccessToken() === current).toBe(true);
      expect(version).toEqual(currentVersion);
    },
  );

  it('a login queued during an older clear notification lookup must keep its authority', async () => {
    const old = await signIn();
    version = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
    const cleared = version;
    const entered = deferred();
    const release = deferred();
    vi.mocked(readCookieSessionVersion).mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return cleared;
    });
    Channel.current.receive({ type: 'clear', sender: 'old-peer', ...cleared });
    await entered.promise;
    const result = session.login().then(
      () => 'started',
      (error: unknown) => error,
    );
    release.resolve();
    expect(await result).toBe('started');
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(values.get(`oidc-vault-dpop:pending:${session.scopeId}`)).toBe(JSON.stringify({ jkt: JKT }));
  });

  it('control: a stale clear with a successful current-generation lookup is ignored', async () => {
    const old = await signIn();
    const current = await signIn();
    Channel.current.receive({ type: 'clear', sender: 'old-peer', jkt: old.jkt, generation: old.generation });
    await drain();
    expect(session.getAccessToken()).toBe(current);
  });

  it('control: a confirmed current peer clear still invalidates local auth', async () => {
    const old = await signIn();
    version = { jkt: old.jkt, generation: 'peer-cleared-generation', active: false };
    Channel.current.receive({ type: 'clear', sender: 'peer', ...version });
    await drain();
    expect(session.getAccessToken()).toBeUndefined();
  });
});
