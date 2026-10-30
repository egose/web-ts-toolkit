import { base64url } from 'jose';

import {
  createAutoRefreshScheduler,
  resolveAutoRefreshOptions,
  type OidcVaultDpopAutoRefreshOptions,
} from './auto-refresh';
import { createDpopProof } from './dpop-proof';
import { getOrCreateDpopKey, getOrCreateLoginDpopKey, type DpopKey } from './dpop-key-store';
import { parseDpopCredentials, readPeerToken, type DpopAccessToken } from './credentials';
import type { DeviceFingerprint } from './device-fingerprint';
import { keyLost, loginRequired, OidcVaultDpopClientError, serverError } from './errors';
import {
  readCookieSessionVersion,
  readDpopScopeState,
  removeDpopScope,
  writeCookieSessionVersion,
  type CookieSessionVersion,
} from './key-database';
import { DpopNonceCache } from './nonce-cache';
import { assertDpopBrowserFeatures, resolveDpopScope } from './scope';
import { createSessionLifecycle, type SessionAuthority } from './session-lifecycle';
import { requestVaultJson } from './vault-http';
import type { OidcVaultLoginInitiationInput, OidcVaultSessionTransport } from './wire';

export type { DpopAccessToken } from './credentials';

/** Configuration for one browser context and public vault mount. */
export interface OidcVaultDpopSessionOptions {
  /** Pinned public scheme/host/port, HTTPS or loopback HTTP; no path/query/fragment. */
  backendOrigin: string;
  /** Exact public vault mount; default /auth/oidc. Trailing slashes normalize away. */
  basePath?: string;
  /** Default body (tab-local handle). Cookie additionally requires Web Locks and BroadcastChannel. */
  sessionTransport?: OidcVaultSessionTransport;
  /** Current signal on login/exchange/refresh only; optional recognition, never PoP. */
  fingerprint?: DeviceFingerprint;
  /**
   * Disabled by default (also accepts false). An options object enables
   * expiry-driven scheduling after successful explicit exchange/refresh, with
   * an optional explicit keep-alive interval. Failures pause until successful
   * explicit acquisition; resume events never retry uncertain rotations.
   * Timers may run in hidden tabs but cannot guarantee execution during sleep.
   */
  autoRefresh?: false | OidcVaultDpopAutoRefreshOptions;
  /** Background scheduler failures only; not awaited, with observer exceptions contained. */
  onAutoRefreshError?: (error: unknown) => void;
  /**
   * Asynchronous, coalesced latest-state observation after committed credential
   * replacement/clear, including API refresh and cookie-peer adoption. Works
   * without auto-refresh. Undefined means cleared; disposal delivers a final
   * clear if a token was observed. Not an event log. Observers run outside this
   * instance's mutation/lock ownership; throws/rejected promises are contained,
   * never awaited and cannot veto a committed operation.
   */
  onCredentialsChanged?: (credentials: DpopAccessToken | undefined) => void;
  /**
   * Per-attempt vault HTTP deadline in milliseconds, including headers, streamed
   * body and JSON parsing. Default 15,000; integer 1..2,147,483,647. Starts at
   * fetch, not queue/key/proof work. Timeout never automatically retries a mutation.
   */
  requestTimeoutMs?: number;
  /**
   * Maximum actual vault response bytes read from the decoded HTTP body stream,
   * independent of Content-Length. Default 1,048,576 (1 MiB); positive safe integer.
   */
  maxResponseBytes?: number;
  /** Default global fetch. Injected responses must expose a standard streaming body. */
  fetch?: typeof globalThis.fetch;
  /** Synchronous login/logout navigation inside lifecycle authority; default location.assign. */
  navigate?: (url: string) => void;
  /** Epoch-millisecond clock; default Date.now. Credential deadline arithmetic must remain safe. */
  now?: () => number;
}

/** One tab's session. Both transports serialize lifecycle mutations; access JWTs stay in memory. */
export interface OidcVaultDpopSession {
  /** Opaque persistent-key scope for this frontend origin, backend origin and normalized mount. */
  readonly scopeId: string;
  readonly sessionTransport: OidcVaultSessionTransport;
  /** FIFO with exchange/refresh/logout. Clears frontend auth, creates a missing key and navigates after POST initiation. */
  login(returnTo?: string): Promise<void>;
  /** FIFO. Exchanges the one-time callback code using the initiating key and temporary cookie. */
  exchange(code: string): Promise<DpopAccessToken>;
  /**
   * Same Promise for concurrent callers until login/exchange/logout/clear/resetKey
   * intervenes; the first caller's rejectedToken owns that batch. FIFO with
   * other lifecycle mutations. No Authorization/ath, even with an expired JWT.
   */
  refresh(options?: { rejectedToken?: string }): Promise<DpopAccessToken>;
  /** FIFO: an earlier refresh publishes its rotated handle before logout uses it. Revokes server refresh state. */
  logout(): Promise<void>;
  /**
   * Proof-authorized local logout followed by top-level provider/fallback navigation.
   * Requires server logoutNavigation opt-in and the existing key/handle or active
   * cookie metadata, not a live access JWT. Concurrent clicks share one Promise.
   * Later login/exchange/logout/clear/resetKey/dispose withdraw navigation intent.
   * Invalid navigation URLs still clear confirmed logout state, then reject.
   */
  logoutAndNavigate(): Promise<void>;
  /** Memory snapshot only; may already be expired, including a valid expiresIn: 0 response. */
  getAccessToken(): DpopAccessToken | undefined;
  /**
   * Existing-key read alongside the lifecycle FIFO. A still-current
   * missing/changed key clears auth; superseded reads cannot clear a newer
   * login. Absence of credentials preserves an in-progress login marker.
   */
  getKey(): Promise<DpopKey>;
  /**
   * Immediately invalidates local work/auth and pending login. Cookie mode
   * resolves after inactive metadata/peer notification under the shared lock,
   * which can wait for other lock owners. Aborts this context's vault HTTP.
   * Keeps the key; no server logout.
   */
  clear(): Promise<void>;
  /**
   * Explicit local key recovery, including corrupt/mismatched persisted keys.
   * Immediately invalidates local auth/pending login and aborts owned vault HTTP;
   * then atomically deletes only this scope's key AND cookie-session metadata,
   * under the shared lock in cookie mode. Repeating on absent records is harmless;
   * concurrent resets share removal until another lifecycle mutation intervenes.
   * Await completion before login() creates a new non-extractable key through
   * atomic first-key-wins. Never creates a key, calls the backend, removes an
   * HttpOnly cookie, or revokes server sessions/JWTs. Other sessions using the old
   * key need fresh login; old server sessions remain until revocation/expiry.
   * Already-started API/crypto work and retained key references cannot be undone.
   * Storage/other lock owners may delay completion. Disposed contexts reject.
   */
  resetKey(): Promise<void>;
  /**
   * Closes this context and peer waits immediately, preserving committed
   * handles/key/metadata and pending login for reload. Aborts owned vault HTTP;
   * does not log out, cancel caller-owned API requests, or undo server mutations.
   * Await clear()/resetKey() first if their persistence work must finish. Later calls reject.
   */
  dispose(): void;
}

interface Handle {
  sessionId: string;
  jkt: string;
}
interface PendingLogin {
  jkt: string;
}
interface ChannelMessage {
  type: 'token' | 'request-token' | 'clear' | 'reset-key';
  sender: string;
  generation: string;
  jkt: string;
  /** Reset only: unvalidated thumbprint hint from the deleted key record. */
  keyJkt?: string;
  recognition?: string;
  token?: unknown;
}
interface PeerWaiter {
  receive(message: ChannelMessage): void;
  finish(): void;
}

/**
 * Create a browser DPoP session for one vault mount (`backendOrigin` + `basePath`).
 * Canonical import: `import { createOidcVaultDpopSession } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'` (named root import, no default export).
 * Lifecycle: `login` → `exchange(code)` → `getAccessToken`/`fetchWithDpop` →
 * `refresh` → `logout`. Cookie transport additionally needs Web Locks +
 * `BroadcastChannel` at runtime, in addition to secure-context Web Crypto,
 * sessionStorage and IndexedDB CryptoKey persistence.
 * Mutating calls are ordered per instance in both transports; cookie mutations
 * also hold the same-origin/scope Web Lock. clear/resetKey/dispose invalidate entry-time
 * authority immediately. Superseded work rejects with non-terminal
 * DPOP_OPERATION_SUPERSEDED (or DPOP_SESSION_DISPOSED after disposal).
 * Vault HTTP has a per-attempt deadline/byte bound and aborts on invalidation.
 * Valid response nonces are learned for this vault/key, including on success.
 * Vault nonce challenges permit one retry with a fresh proof; a second yields
 * non-terminal DPOP_NONCE_RETRY_EXHAUSTED. Only explicit terminal session,
 * browser/device-binding or recognition errors clear auth, not generic 401s.
 * Peer coordination failures are advisory and cannot clear auth. A new login
 * intent supersedes older peer callbacks even while queued; validated current-key
 * failures and explicit terminal operations retain their own failure cleanup.
 * A lost response leaves server commit/cookie application uncertain: local
 * cancellation cannot roll it back or coordinate across frontend origins.
 * autoRefresh is default-off; enabled scheduling uses this lifecycle and pauses
 * on failure, never implicitly retrying uncertain rotations. The optional
 * credential observer works independently of scheduling. Dispose on teardown.
 */
export const createOidcVaultDpopSession = (options: OidcVaultDpopSessionOptions): OidcVaultDpopSession => {
  const {
    backendOrigin,
    basePath = '/auth/oidc',
    sessionTransport = 'body',
    fingerprint,
    autoRefresh,
    onAutoRefreshError,
    onCredentialsChanged,
    requestTimeoutMs = 15_000,
    maxResponseBytes = 1_048_576,
    fetch: request = globalThis.fetch.bind(globalThis),
    navigate = (url) => location.assign(url),
    now = Date.now,
  } = options;
  if (sessionTransport !== 'body' && sessionTransport !== 'cookie') throw new TypeError('Unknown session transport.');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 2_147_483_647)
    throw new TypeError('requestTimeoutMs must be an integer from 1 to 2147483647 milliseconds.');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1)
    throw new TypeError('maxResponseBytes must be a positive safe integer.');
  if (onCredentialsChanged !== undefined && typeof onCredentialsChanged !== 'function')
    throw new TypeError('onCredentialsChanged must be a function.');
  if (onAutoRefreshError !== undefined && typeof onAutoRefreshError !== 'function')
    throw new TypeError('onAutoRefreshError must be a function.');
  const refreshPolicy = resolveAutoRefreshOptions(autoRefresh);
  assertDpopBrowserFeatures(sessionTransport === 'cookie');
  const scope = resolveDpopScope({ frontendOrigin: location.origin, backendOrigin, basePath });
  const storageKey = `oidc-vault-dpop:handle:${scope.id}`;
  const pendingKey = `oidc-vault-dpop:pending:${scope.id}`;
  const lockName = `oidc-vault-dpop:cookie:${scope.id}`;
  const sender = crypto.randomUUID();
  const nonces = new DpopNonceCache();
  const channel = sessionTransport === 'cookie' ? new BroadcastChannel(lockName) : undefined;
  let token: DpopAccessToken | undefined;
  // Transient marker only, never persisted or included in tokens/user/wire DTOs.
  // A cookie-tab with a missing/changed current signal must reach the backend's
  // recognition check instead of bypassing it by borrowing a peer's token.
  let tokenRecognition: string | undefined;
  // A reload/API read may fail before a JWT exists. Keep its observed binding
  // per operation, so overlapping reads cannot redirect stale failure cleanup.
  const cookieBindings = new WeakMap<SessionAuthority, { jkt: string; generation?: string }>();
  let refreshPromise: Promise<DpopAccessToken> | undefined;
  let resetPromise: Promise<void> | undefined;
  let navigationPromise: Promise<void> | undefined;
  let navigationIntent = 0;
  const lifecycle = createSessionLifecycle();
  // Unsolicited channel callbacks may overlap the FIFO. A newer local state
  // must also supersede their publication and failure cleanup.
  let publication = 0;
  let loginIntent = 0;
  let acceptPeerTokens = true;
  const peerWaiters = new Set<PeerWaiter>();
  let mutationOwners = 0;
  let notificationQueued = false;
  let observedToken: DpopAccessToken | undefined;
  const notifyCredentials = (): void => {
    if (!onCredentialsChanged || notificationQueued || observedToken === token) return;
    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      // A commit can precede more asynchronous cleanup in the same operation.
      // Its lock's settled continuation schedules delivery after ownership ends.
      if (mutationOwners && lifecycle.isLive()) return;
      const current = token;
      if (observedToken === current) return;
      observedToken = current;
      try {
        void Promise.resolve(onCredentialsChanged(current)).catch(() => {});
      } catch {
        // Application observers cannot turn committed rotation into failure.
      }
    });
  };
  const withdrawNavigation = (): void => {
    navigationIntent++;
    navigationPromise = undefined;
  };

  const readStorage = <T>(key: string): T | undefined => {
    try {
      const value = sessionStorage.getItem(key);
      return value === null ? undefined : (JSON.parse(value) as T);
    } catch {
      throw new OidcVaultDpopClientError(
        'DPOP_SESSION_STORAGE_UNAVAILABLE',
        'Session storage is unavailable. Sign in again.',
        true,
      );
    }
  };
  const store = (key: string, value?: unknown): void => {
    try {
      if (value === undefined) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      throw new OidcVaultDpopClientError(
        'DPOP_SESSION_STORAGE_UNAVAILABLE',
        'Session storage is unavailable. Sign in again.',
        true,
      );
    }
  };
  // Explicitly probe storage at construction, including cookie redirect markers.
  readStorage(pendingKey);
  const scheduler = refreshPolicy
    ? createAutoRefreshScheduler(refreshPolicy, {
        now,
        busy: () => mutationOwners > 0,
        refresh: (intent) => refreshOperation({}, intent),
        onError: onAutoRefreshError,
      })
    : undefined;

  const clearLocal = (clearPendingLogin = true): void => {
    scheduler?.clear();
    token = undefined;
    tokenRecognition = undefined;
    acceptPeerTokens = false;
    publication++;
    notifyCredentials();
    for (const waiter of peerWaiters) waiter.finish();
    nonces.clear();
    store(storageKey);
    if (clearPendingLogin) store(pendingKey);
  };
  const invalidateLocal = (clearPendingLogin = true): SessionAuthority => {
    const authority = lifecycle.invalidate();
    withdrawNavigation();
    refreshPromise = undefined;
    resetPromise = undefined;
    clearLocal(clearPendingLogin);
    return authority;
  };
  const withCookieLock = <T>(operation: () => Promise<T>): Promise<T> => {
    const owned = async () => {
      mutationOwners++;
      try {
        return await operation();
      } finally {
        mutationOwners--;
      }
    };
    const pending =
      sessionTransport === 'cookie' ? navigator.locks.request(lockName, { mode: 'exclusive' }, owned) : owned();
    // navigator.locks' returned promise settles after releasing the lock.
    return pending.finally(() => {
      notifyCredentials();
      scheduler?.settled();
    });
  };

  const invalidateCookie = async (
    authority: SessionAuthority,
    oldJkt?: string,
    expected?: { jkt: string; generation?: string } | null,
  ): Promise<void> => {
    authority.assertCurrent();
    if (channel) {
      let previous: CookieSessionVersion | undefined;
      if (expected !== undefined) {
        const current = await readDpopScopeState(scope.id, authority);
        authority.assertCurrent();
        // Terminal cleanup belongs to its old binding. In particular, a read
        // begun before reset must not recreate deleted metadata or clear a new
        // login after waiting for the cookie lock. Explicit clear is unconditional.
        if (
          !expected ||
          (!current.keyPresent && !current.cookiePresent) ||
          (current.keyJkt !== undefined && current.keyJkt !== expected.jkt) ||
          (current.version &&
            ((expected.generation !== undefined && current.version.generation !== expected.generation) ||
              (current.version.active && current.version.jkt !== expected.jkt)))
        )
          return;
        previous = current.version;
      } else previous = await readCookieSessionVersion(scope.id);
      authority.assertCurrent();
      const jkt = oldJkt ?? previous?.jkt ?? '';
      const generation = crypto.randomUUID();
      const next = { jkt, generation, active: false };
      await writeCookieSessionVersion(scope.id, next, authority);
      authority.assertCurrent();
      cookieBindings.set(authority, next);
      channel.postMessage({ type: 'clear', sender, jkt, generation } satisfies ChannelMessage);
    }
  };

  const existingKey = async (authority: SessionAuthority, expectedJkt?: string): Promise<DpopKey> => {
    authority.assertCurrent();
    if (channel && expectedJkt !== undefined)
      cookieBindings.set(authority, {
        ...cookieBindings.get(authority),
        jkt: expectedJkt,
      });
    const key = await getOrCreateDpopKey(scope, { create: false });
    authority.assertCurrent();
    if (expectedJkt !== undefined && expectedJkt !== key.jkt) throw keyLost();
    return key;
  };

  const authenticatedKey = async (authority: SessionAuthority): Promise<DpopKey> => {
    authority.assertCurrent();
    let version: CookieSessionVersion | undefined;
    if (!token && channel) {
      version = await readCookieSessionVersion(scope.id);
      authority.assertCurrent();
      if (version) cookieBindings.set(authority, { ...version });
    }
    const expected = token?.jkt ?? (sessionTransport === 'body' ? readStorage<Handle>(storageKey)?.jkt : version?.jkt);
    // Read persistence even with no handle so an IDB loss is explicit.
    const key = await existingKey(authority, expected);
    authority.assertCurrent();
    if (!expected) throw loginRequired();
    return key;
  };

  const recognitionMarker = async (headers: Readonly<Record<string, string>>): Promise<string> =>
    base64url.encode(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify(
              Object.entries(headers)
                .map(([name, value]) => [name.toLowerCase(), value])
                .sort(([a], [b]) => a.localeCompare(b)),
            ),
          ),
        ),
      ),
    );

  const currentRecognition = async (authority: SessionAuthority): Promise<string> => {
    authority.assertCurrent();
    const headers = (await fingerprint?.headers()) ?? {};
    authority.assertCurrent();
    const marker = await recognitionMarker(headers);
    authority.assertCurrent();
    return marker;
  };

  const post = async (
    authority: SessionAuthority,
    route: 'login' | 'exchange' | 'refresh' | 'logout' | 'logout/navigation',
    body: object,
    key: DpopKey,
  ): Promise<{ value: unknown; recognition: string }> => {
    const url = `${scope.backendOrigin}${scope.basePath === '/' ? '' : scope.basePath}/${route}`;
    const { jkt } = key;
    const requestPublication = publication;
    const requestLoginIntent = loginIntent;
    const requestBinding = cookieBindings.get(authority);
    let nonceRetried = false;
    for (;;) {
      authority.assertCurrent();
      const recognition =
        route === 'logout' || route === 'logout/navigation' ? {} : ((await fingerprint?.headers()) ?? {});
      const currentKey = await existingKey(authority, jkt);
      authority.assertCurrent();
      const proof = await createDpopProof(currentKey, {
        method: 'POST',
        url,
        now,
        nonce: nonces.get(scope.id, jkt),
        signal: authority.signal,
      });
      authority.assertCurrent();
      const { status, nonce, value } = await requestVaultJson(
        request,
        url,
        {
          method: 'POST',
          credentials: route === 'login' || route === 'exchange' || sessionTransport === 'cookie' ? 'include' : 'omit',
          redirect: 'error',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', ...recognition, DPoP: proof },
          body: JSON.stringify(body),
        },
        { signal: authority.signal, requestTimeoutMs, maxResponseBytes },
      );
      authority.assertCurrent();
      const learnedNonce = nonces.remember(scope.id, jkt, nonce);
      if (status >= 200 && status < 300) {
        const marker = await recognitionMarker(recognition);
        authority.assertCurrent();
        return { value, recognition: marker };
      }
      const error = serverError(status, value);
      if (route === 'refresh' && error.code === 'OIDC_VAULT_REFRESH_REJECTED') {
        const assertRejectionCurrent = () => {
          authority.assertCurrent();
          if (publication !== requestPublication || loginIntent !== requestLoginIntent)
            throw new OidcVaultDpopClientError(
              'DPOP_OPERATION_SUPERSEDED',
              'This browser auth operation was superseded.',
            );
        };
        assertRejectionCurrent();
        if (channel) {
          let current: CookieSessionVersion | undefined;
          try {
            current = await readCookieSessionVersion(scope.id);
          } catch {
            assertRejectionCurrent();
            // An advisory lookup failure cannot prove current logout authority.
            throw new OidcVaultDpopClientError('OIDC_REQUEST_FAILED', 'The OIDC request failed.', false, status);
          }
          assertRejectionCurrent();
          if (
            !requestBinding?.generation ||
            !current?.active ||
            current.jkt !== requestBinding.jkt ||
            current.generation !== requestBinding.generation
          )
            throw new OidcVaultDpopClientError(
              'DPOP_OPERATION_SUPERSEDED',
              'This browser auth operation was superseded.',
            );
        }
      }
      if (error.code === 'OIDC_VAULT_USE_DPOP_NONCE' && (status === 400 || status === 401)) {
        if (nonceRetried)
          throw new OidcVaultDpopClientError(
            'DPOP_NONCE_RETRY_EXHAUSTED',
            'The DPoP nonce challenge was repeated.',
            false,
            status,
          );
        if (learnedNonce) {
          nonceRetried = true;
          continue;
        }
      }
      throw error;
    }
  };

  const publish = async (
    next: DpopAccessToken,
    recognition: string,
    authority: SessionAuthority,
    sessionId?: string,
    refreshedAt?: number,
  ): Promise<DpopAccessToken> => {
    await existingKey(authority, next.jkt);
    authority.assertCurrent();
    if (channel) {
      const version = { jkt: next.jkt, generation: next.generation, active: true, refreshedAt };
      await writeCookieSessionVersion(scope.id, version, authority);
      authority.assertCurrent();
      cookieBindings.set(authority, version);
    }
    authority.assertCurrent();
    // Commit the tab-local handle and memory token together after all awaits.
    if (sessionTransport === 'body') store(storageKey, { sessionId: sessionId!, jkt: next.jkt } satisfies Handle);
    token = next;
    tokenRecognition = recognition;
    acceptPeerTokens = true;
    publication++;
    scheduler?.replace(next, refreshedAt);
    notifyCredentials();
    channel?.postMessage({
      type: 'token',
      sender,
      jkt: next.jkt,
      generation: next.generation,
      token: next,
      recognition,
    } satisfies ChannelMessage);
    return next;
  };

  const acceptResponse = async (
    response: { value: unknown; recognition: string },
    key: DpopKey,
    authority: SessionAuthority,
  ): Promise<DpopAccessToken> => {
    authority.assertCurrent();
    const refreshedAt = now();
    const parsed = parseDpopCredentials(response.value, sessionTransport, key.jkt, refreshedAt);
    return publish(parsed.token, response.recognition, authority, parsed.sessionId, refreshedAt);
  };

  const stateAuthority = (current: () => boolean = () => true): SessionAuthority => {
    const captured = publication;
    return lifecycle.capture(() => publication === captured && current());
  };
  const peerAuthority = (current: () => boolean = () => true): SessionAuthority => {
    const intent = loginIntent;
    // A login may be queued behind a peer's lookup/FIFO/Web Lock without yet
    // publishing anything. All advisory callbacks must yield to that intent.
    return stateAuthority(() => loginIntent === intent && current());
  };
  const onPeerKeyFailure = (error: unknown, authority: SessionAuthority, jkt: string): void => {
    // Only a validated peer candidate for this still-current local key can own
    // key-failure cleanup. A mismatch against another peer binding proves
    // nothing about our credential, nor does a recognition/metadata read error.
    if (
      !authority.isCurrent() ||
      token?.jkt !== jkt ||
      !(error instanceof OidcVaultDpopClientError) ||
      !error.requiresLogin
    )
      return;
    try {
      invalidateLocal(false);
    } catch {
      // Memory/authority were invalidated first. An event callback has no
      // caller to reject; explicit operations still report storage failures.
    }
  };
  const adoptPeer = async (
    message: ChannelMessage,
    authority: SessionAuthority,
    expectedRecognition?: string,
  ): Promise<DpopAccessToken | undefined> => {
    authority.assertCurrent();
    const unsolicited = expectedRecognition === undefined;
    // clear is locally authoritative even while its cookie metadata write is
    // waiting for the Web Lock. Only an explicit credential operation may
    // enable borrowing again; a fresh context still supports reload bootstrap.
    if (message.type !== 'token' || (!acceptPeerTokens && unsolicited)) return undefined;
    const recognition = expectedRecognition ?? (await currentRecognition(authority));
    authority.assertCurrent();
    if (message.recognition !== recognition) return undefined;
    const current = await readCookieSessionVersion(scope.id);
    authority.assertCurrent();
    if (!current?.active || current.jkt !== message.jkt || current.generation !== message.generation) return undefined;
    const peer = readPeerToken(message.token, current.jkt, current.generation, now());
    if (!peer) return undefined;
    try {
      await existingKey(authority, current.jkt);
    } catch (error) {
      // A requested peer is only an optional shortcut: refresh owns its own
      // subsequent key validation, terminal error and lock-scoped cleanup.
      if (unsolicited) onPeerKeyFailure(error, authority, current.jkt);
      throw error;
    }
    authority.assertCurrent();
    const latest = await readCookieSessionVersion(scope.id);
    authority.assertCurrent();
    if (
      !latest?.active ||
      latest.jkt !== current.jkt ||
      latest.generation !== current.generation ||
      peer.expiresAt <= now()
    )
      return undefined;
    // Duplicate delivery is not a new auth state and must not supersede an API
    // key read already checking this same credential.
    if (
      token?.generation === peer.generation &&
      token.accessToken === peer.accessToken &&
      token.expiresAt === peer.expiresAt &&
      tokenRecognition === recognition
    )
      return token;
    token = peer;
    tokenRecognition = recognition;
    acceptPeerTokens = true;
    publication++;
    scheduler?.replace(peer, latest.refreshedAt);
    notifyCredentials();
    return peer;
  };

  const requestPeer = (
    authority: SessionAuthority,
    jkt: string,
    generation: string,
    recognition: string,
    rejectedToken?: string,
  ): Promise<DpopAccessToken | undefined> =>
    new Promise((resolve, reject) => {
      authority.assertCurrent();
      let settled = false;
      let adopting = false;
      const finish = (value?: DpopAccessToken) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        authority.signal.removeEventListener('abort', onInvalidation);
        peerWaiters.delete(waiter);
        resolve(value);
      };
      const onInvalidation = () => finish();
      const waiter: PeerWaiter = {
        finish: () => finish(),
        receive(message) {
          if (settled || adopting || message.jkt !== jkt || message.generation !== generation) return;
          adopting = true;
          void adoptPeer(
            message,
            peerAuthority(() => !settled && authority.isCurrent()),
            recognition,
          )
            .then((peer) => {
              adopting = false;
              if (peer && peer.accessToken !== rejectedToken) finish(peer);
            })
            .catch(() => finish());
        },
      };
      const timeout = setTimeout(() => finish(), 180);
      peerWaiters.add(waiter);
      authority.signal.addEventListener('abort', onInvalidation, { once: true });
      try {
        channel?.postMessage({ type: 'request-token', sender, jkt, generation, recognition } satisfies ChannelMessage);
      } catch (error) {
        reject(error);
        finish();
      }
    });

  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!lifecycle.isLive()) return;
      const message = event.data as Partial<ChannelMessage> | null;
      if (
        !message ||
        message.sender === sender ||
        typeof message.sender !== 'string' ||
        typeof message.jkt !== 'string' ||
        typeof message.generation !== 'string' ||
        (message.keyJkt !== undefined && typeof message.keyJkt !== 'string') ||
        !['token', 'request-token', 'clear', 'reset-key'].includes(message.type ?? '')
      )
        return;
      const captured = message as ChannelMessage;
      if (captured.type === 'request-token') {
        const current = token;
        if (
          current?.jkt === captured.jkt &&
          current.generation === captured.generation &&
          current.expiresAt > now() &&
          tokenRecognition === captured.recognition
        ) {
          channel.postMessage({
            type: 'token',
            sender,
            jkt: current.jkt,
            generation: current.generation,
            token: current,
            recognition: tokenRecognition,
          } satisfies ChannelMessage);
        }
      } else if (captured.type === 'clear' || captured.type === 'reset-key') {
        const authority = peerAuthority();
        void lifecycle
          .enqueue(authority, () =>
            withCookieLock(async () => {
              authority.assertCurrent();
              if (captured.type === 'clear') {
                const version = await readCookieSessionVersion(scope.id);
                authority.assertCurrent();
                // A peer clears auth, not a pending login owned by this context.
                if (!version?.active && version?.generation === captured.generation && version.jkt === captured.jkt)
                  invalidateLocal(false);
                return;
              }
              const current = await readDpopScopeState(scope.id, authority);
              authority.assertCurrent();
              // No tombstone is persisted by reset. Absence of metadata alone is
              // insufficient: a later login may already have installed a fresh key.
              if (current.keyPresent || current.cookiePresent) return;
              const matchesKey = (jkt: string) => jkt === captured.jkt || jkt === captured.keyJkt;
              const pending = readStorage<PendingLogin>(pendingKey);
              if (pending && !matchesKey(pending.jkt)) return;
              if (token && !matchesKey(token.jkt) && token.generation !== captured.generation) return;
              invalidateLocal();
            }),
          )
          .catch(() => {
            // Advisory delivery cannot prove a clear/reset on an I/O failure.
            // Explicit credential operations retain their own error enforcement.
          });
      } else {
        // A waiter owns adoption while refresh holds the lock. Do not start a
        // duplicate unbounded callback that could publish after its 180ms budget.
        if (peerWaiters.size) for (const waiter of peerWaiters) waiter.receive(captured);
        else {
          const authority = peerAuthority();
          void adoptPeer(captured, authority).catch(() => {
            // Current-binding key failures are handled at the key check above.
            // Failed advisory recognition/generation reads cannot clear auth.
          });
        }
      }
    };

  const onFailure = async (error: unknown, authority: SessionAuthority): Promise<never> => {
    authority.assertCurrent();
    if (error instanceof OidcVaultDpopClientError && error.requiresLogin) {
      const oldJkt = token?.jkt;
      const expected = token
        ? { jkt: token.jkt, generation: token.generation }
        : (cookieBindings.get(authority) ?? null);
      const invalidation = invalidateLocal();
      await invalidateCookie(invalidation, oldJkt, expected);
      invalidation.assertCurrent();
    }
    throw error;
  };
  // Handle a credential failure while still holding the cookie lock, so a late
  // stale-context clear cannot overtake the next tab's successful rotation.
  const operation = <T>(authority: SessionAuthority, run: () => Promise<T>, beforeFailure?: () => void): Promise<T> =>
    lifecycle.enqueue(authority, () =>
      withCookieLock(async () => {
        authority.assertCurrent();
        try {
          const result = await run();
          authority.assertCurrent();
          return result;
        } catch (error) {
          beforeFailure?.();
          return onFailure(error, authority);
        }
      }),
    );

  const refreshOperation = (
    refreshOptions: { rejectedToken?: string } = {},
    scheduledIntent?: number,
  ): Promise<DpopAccessToken> => {
    let started = false;
    const authority = lifecycle.capture(
      () => started || scheduledIntent === undefined || scheduler!.isCurrent(scheduledIntent),
    );
    const acquisitionIntent = scheduler?.capture();
    resetPromise = undefined;
    if (refreshPromise) return refreshPromise;
    const { rejectedToken } = refreshOptions;
    const hadToken = token !== undefined;
    const baseline = token?.generation;
    let refreshPublication = publication;
    const stillDue = () => scheduledIntent === undefined || scheduler!.isDue(scheduledIntent);
    const pending = operation(
      authority,
      async () => {
        started = true;
        // Timers and resume callbacks capture intent before the FIFO/Web Lock.
        // Another publication may postpone the deadline while admission waits.
        if (!stillDue() && token) return token;
        const key = await authenticatedKey(authority);
        authority.assertCurrent();
        if (channel) {
          const recognition = await currentRecognition(authority);
          authority.assertCurrent();
          const version = await readCookieSessionVersion(scope.id);
          authority.assertCurrent();
          if (!version?.active || version.jkt !== key.jkt) throw loginRequired();
          cookieBindings.set(authority, { ...version });
          const reusable = (): DpopAccessToken | undefined => {
            const current = token;
            if (
              current?.jkt === key.jkt &&
              current.accessToken !== rejectedToken &&
              current.expiresAt > now() &&
              current.generation === version.generation &&
              tokenRecognition === recognition
            )
              return current;
          };
          const current = reusable();
          if (current && !stillDue()) return current;
          if (
            scheduledIntent === undefined &&
            current &&
            (rejectedToken || !hadToken || current.generation !== baseline)
          )
            return current;
          if (!hadToken || version.generation !== baseline) {
            const peer = await requestPeer(authority, key.jkt, version.generation, recognition, rejectedToken);
            authority.assertCurrent();
            if (peer && (scheduledIntent === undefined || !stillDue())) return peer;
            // A requested or earlier unsolicited winner must also satisfy the
            // proactive policy; a merely live near-expiry token is not enough.
            const winner = reusable();
            if (winner && (scheduledIntent === undefined || !stillDue())) return winner;
          }
        }
        if (
          !channel &&
          rejectedToken &&
          token &&
          token.accessToken !== rejectedToken &&
          token.expiresAt > now() &&
          tokenRecognition === (await currentRecognition(authority))
        ) {
          authority.assertCurrent();
          return token;
        }
        authority.assertCurrent();
        if (!stillDue() && token) return token;
        const handle = sessionTransport === 'body' ? readStorage<Handle>(storageKey) : undefined;
        if (sessionTransport === 'body' && (!handle?.sessionId || handle.jkt !== key.jkt)) throw loginRequired();
        refreshPublication = publication;
        return acceptResponse(
          await post(authority, 'refresh', handle ? { sessionId: handle.sessionId } : {}, key),
          key,
          authority,
        );
      },
      () => {
        // A later timer must not silently retry an uncertain manual rotation.
        // Manual callers still receive their own error, without a background event.
        if (
          scheduledIntent === undefined &&
          acquisitionIntent !== undefined &&
          scheduler?.isCurrent(acquisitionIntent) &&
          publication === refreshPublication
        )
          scheduler.pause();
      },
    ).then((result) => {
      if (scheduledIntent === undefined && acquisitionIntent !== undefined) scheduler?.activate(acquisitionIntent);
      return result;
    });
    refreshPromise = pending;
    void pending
      .finally(() => {
        if (refreshPromise === pending) refreshPromise = undefined;
      })
      .catch(() => {});
    return pending;
  };

  const session: OidcVaultDpopSession = {
    scopeId: scope.id,
    sessionTransport,
    async login(returnTo) {
      const authority = lifecycle.capture();
      scheduler?.cancel();
      withdrawNavigation();
      // Older peer callbacks must not supersede a newer explicit login waiting
      // behind an advisory lookup/FIFO/Web Lock, before it can publish state.
      loginIntent++;
      refreshPromise = undefined;
      resetPromise = undefined;
      await operation(authority, async () => {
        const oldJkt = token?.jkt;
        // This reset is ordered, so calls already queued behind login retain
        // their authority. Explicit clear/resetKey/dispose instead supersede the queue.
        clearLocal();
        await invalidateCookie(authority, oldJkt);
        authority.assertCurrent();
        const key = await getOrCreateLoginDpopKey(scope, authority);
        authority.assertCurrent();
        store(pendingKey, { jkt: key.jkt } satisfies PendingLogin);
        publication++;
        const body: OidcVaultLoginInitiationInput = returnTo === undefined ? {} : { returnTo };
        const { value } = await post(authority, 'login', body, key);
        authority.assertCurrent();
        if (
          typeof value !== 'object' ||
          value === null ||
          !('authorizationUrl' in value) ||
          typeof value.authorizationUrl !== 'string'
        ) {
          throw new OidcVaultDpopClientError(
            'INVALID_LOGIN_RESPONSE',
            'The login initiation response is invalid.',
            true,
          );
        }
        let url: URL;
        try {
          url = new URL(value.authorizationUrl);
        } catch {
          throw new OidcVaultDpopClientError(
            'INVALID_LOGIN_RESPONSE',
            'The login initiation response is invalid.',
            true,
          );
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
          throw new OidcVaultDpopClientError(
            'INVALID_LOGIN_RESPONSE',
            'The login initiation response is invalid.',
            true,
          );
        }
        authority.assertCurrent();
        navigate(url.href);
      });
    },
    async exchange(code) {
      const authority = lifecycle.capture();
      const acquisitionIntent = scheduler?.cancel();
      withdrawNavigation();
      refreshPromise = undefined;
      resetPromise = undefined;
      const result = await operation(authority, async () => {
        const pending = readStorage<PendingLogin>(pendingKey);
        const key = await existingKey(authority, pending?.jkt);
        authority.assertCurrent();
        if (!pending?.jkt || typeof code !== 'string' || code.length === 0) throw loginRequired();
        const result = await acceptResponse(await post(authority, 'exchange', { code }, key), key, authority);
        authority.assertCurrent();
        store(pendingKey);
        return result;
      });
      if (acquisitionIntent !== undefined) scheduler?.activate(acquisitionIntent);
      return result;
    },
    refresh: refreshOperation,
    async logout() {
      const authority = lifecycle.capture();
      scheduler?.cancel();
      withdrawNavigation();
      refreshPromise = undefined;
      resetPromise = undefined;
      await operation(authority, async () => {
        const key = await authenticatedKey(authority);
        authority.assertCurrent();
        const handle = sessionTransport === 'body' ? readStorage<Handle>(storageKey) : undefined;
        if (sessionTransport === 'body' && !handle?.sessionId) throw loginRequired();
        const { value } = await post(authority, 'logout', handle ? { sessionId: handle.sessionId } : {}, key);
        authority.assertCurrent();
        if (typeof value !== 'object' || value === null || !('loggedOut' in value) || value.loggedOut !== true) {
          throw new OidcVaultDpopClientError('INVALID_LOGOUT_RESPONSE', 'The logout response is invalid.');
        }
        clearLocal();
        await invalidateCookie(authority, key.jkt);
      });
    },
    logoutAndNavigate() {
      const authority = lifecycle.capture();
      if (navigationPromise) return navigationPromise;
      scheduler?.cancel();
      const intent = navigationIntent;
      const navigation = lifecycle.capture(() => navigationIntent === intent);
      refreshPromise = undefined;
      resetPromise = undefined;
      const pending = operation(authority, async () => {
        navigation.assertCurrent();
        const key = await authenticatedKey(authority);
        authority.assertCurrent();
        if (channel) {
          const version = await readCookieSessionVersion(scope.id);
          authority.assertCurrent();
          if (!version?.active || version.jkt !== key.jkt) throw loginRequired();
          cookieBindings.set(authority, { ...version });
        }
        const handle = sessionTransport === 'body' ? readStorage<Handle>(storageKey) : undefined;
        if (sessionTransport === 'body' && (!handle?.sessionId || handle.jkt !== key.jkt)) throw loginRequired();
        const { value } = await post(
          authority,
          'logout/navigation',
          handle ? { sessionId: handle.sessionId } : {},
          key,
        );
        authority.assertCurrent();
        const invalidResponse = () =>
          new OidcVaultDpopClientError(
            'INVALID_LOGOUT_NAVIGATION_RESPONSE',
            'The logout navigation response is invalid.',
          );
        if (typeof value !== 'object' || value === null || !('loggedOut' in value) || value.loggedOut !== true)
          throw invalidResponse();
        // Confirmation owns old-state cleanup even if a queued login has withdrawn
        // navigation. FIFO + cookie lock prevent that cleanup overtaking new auth.
        clearLocal();
        await invalidateCookie(authority, key.jkt);
        authority.assertCurrent();
        navigation.assertCurrent();
        const bare = `${scope.backendOrigin}${scope.basePath === '/' ? '' : scope.basePath}/logout/navigation`;
        const url = 'navigationUrl' in value ? value.navigationUrl : undefined;
        // Exact serialized form: URL parsing/normalization must not grant alternate
        // paths, origins, encodings or query credentials navigation authority.
        if (
          typeof url !== 'string' ||
          (url !== bare &&
            (url.length !== bare.length + '?ticket='.length + 47 ||
              !url.startsWith(`${bare}?ticket=`) ||
              !/^lnt_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(url.slice(`${bare}?ticket=`.length))))
        )
          throw invalidResponse();
        navigation.assertCurrent();
        navigate(url);
      });
      navigationPromise = pending;
      void pending
        .finally(() => {
          if (navigationPromise === pending) navigationPromise = undefined;
        })
        .catch(() => {});
      return pending;
    },
    getAccessToken: () => token,
    async getKey() {
      const authority = stateAuthority();
      try {
        const pending = !token ? readStorage<PendingLogin>(pendingKey) : undefined;
        if (pending) {
          await existingKey(authority, pending.jkt);
          authority.assertCurrent();
          throw loginRequired();
        }
        return await authenticatedKey(authority);
      } catch (error) {
        authority.assertCurrent();
        // No credential is present to invalidate. In particular, a read made
        // between login and exchange must not erase the pending-login marker.
        if (error instanceof OidcVaultDpopClientError && error.code === 'LOGIN_REQUIRED') throw error;
        // Successful reads need no mutation lock. Terminal cleanup does, and
        // must recheck its entry-time auth state after waiting for that lock.
        return operation(authority, async () => {
          throw error;
        });
      }
    },
    async clear() {
      const oldJkt = token?.jkt;
      scheduler?.cancel();
      const authority = invalidateLocal();
      if (!channel) return;
      await lifecycle.enqueue(authority, () => withCookieLock(() => invalidateCookie(authority, oldJkt)));
    },
    async resetKey() {
      if (resetPromise) return resetPromise;
      const oldJkt = token?.jkt;
      scheduler?.cancel();
      const authority = invalidateLocal();
      const pending = lifecycle.enqueue(authority, () =>
        withCookieLock(async () => {
          authority.assertCurrent();
          const previous = await removeDpopScope(scope.id, authority);
          authority.assertCurrent();
          if (previous.keyPresent || previous.cookiePresent)
            channel?.postMessage({
              type: 'reset-key',
              sender,
              jkt: previous.version?.jkt ?? oldJkt ?? '',
              generation: previous.version?.generation ?? '',
              keyJkt: previous.keyJkt,
            } satisfies ChannelMessage);
        }),
      );
      resetPromise = pending;
      void pending
        .finally(() => {
          if (resetPromise === pending) resetPromise = undefined;
        })
        .catch(() => {});
      await pending;
    },
    dispose() {
      scheduler?.dispose();
      lifecycle.dispose();
      withdrawNavigation();
      publication++;
      refreshPromise = undefined;
      resetPromise = undefined;
      token = undefined;
      tokenRecognition = undefined;
      notifyCredentials();
      nonces.clear();
      for (const waiter of peerWaiters) waiter.finish();
      if (channel) channel.onmessage = null;
      channel?.close();
    },
  };
  return Object.freeze(session);
};
