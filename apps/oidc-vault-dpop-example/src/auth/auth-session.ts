import { base64url } from 'jose';

import { createDpopProof } from './dpop-proof';
import { getOrCreateDpopKey, type DpopKey } from './dpop-key-store';
import { parseDpopCredentials, readPeerToken, type DpopAccessToken } from './credentials';
import type { DeviceFingerprint } from './device-fingerprint';
import { keyLost, loginRequired, OidcVaultDpopClientError, serverError } from './errors';
import { readCookieSessionVersion, writeCookieSessionVersion } from './key-database';
import { DpopNonceCache } from './nonce-cache';
import { assertDpopBrowserFeatures, resolveDpopScope } from './scope';
import type { OidcVaultLoginInitiationInput, OidcVaultSessionTransport } from './wire';

export type { DpopAccessToken } from './credentials';

export interface OidcVaultDpopSessionOptions {
  backendOrigin: string;
  basePath?: string;
  sessionTransport?: OidcVaultSessionTransport;
  /** Current signal on login/exchange/refresh only; optional recognition, never PoP. */
  fingerprint?: DeviceFingerprint;
  fetch?: typeof globalThis.fetch;
  navigate?: (authorizationUrl: string) => void;
  now?: () => number;
}

export interface OidcVaultDpopSession {
  readonly scopeId: string;
  readonly sessionTransport: OidcVaultSessionTransport;
  login(returnTo?: string): Promise<void>;
  exchange(code: string): Promise<DpopAccessToken>;
  /** Single-flight; no Authorization/ath even if the old JWT expired. */
  refresh(options?: { rejectedToken?: string }): Promise<DpopAccessToken>;
  logout(): Promise<void>;
  getAccessToken(): DpopAccessToken | undefined;
  /** Existing key only. Missing/changed persistence clears auth and requires login. */
  getKey(): Promise<DpopKey>;
  clear(): Promise<void>;
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
  type: 'token' | 'request-token' | 'clear';
  sender: string;
  generation: string;
  jkt: string;
  recognition?: string;
  token?: unknown;
}

/** Copyable app helper. It is not an export of the Express package. */
export const createOidcVaultDpopSession = (options: OidcVaultDpopSessionOptions): OidcVaultDpopSession => {
  const {
    backendOrigin,
    basePath = '/auth/oidc',
    sessionTransport = 'body',
    fingerprint,
    fetch: request = globalThis.fetch.bind(globalThis),
    navigate = (url) => location.assign(url),
    now = Date.now,
  } = options;
  if (sessionTransport !== 'body' && sessionTransport !== 'cookie') throw new TypeError('Unknown session transport.');
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
  let refreshPromise: Promise<DpopAccessToken> | undefined;
  let disposed = false;
  let epoch = 0;
  const peerWaiters = new Set<(message: ChannelMessage) => void>();

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

  const clearLocal = (clearPendingLogin = true): void => {
    token = undefined;
    tokenRecognition = undefined;
    epoch++;
    nonces.clear();
    store(storageKey);
    if (clearPendingLogin) store(pendingKey);
  };
  const assertLive = (): void => {
    if (disposed) throw new OidcVaultDpopClientError('DPOP_SESSION_DISPOSED', 'This browser auth context is closed.');
  };
  const withCookieLock = <T>(operation: () => Promise<T>): Promise<T> =>
    sessionTransport === 'cookie' ? navigator.locks.request(lockName, { mode: 'exclusive' }, operation) : operation();

  const invalidate = async (): Promise<void> => {
    const oldJkt = token?.jkt;
    clearLocal();
    if (channel) {
      const previous = await readCookieSessionVersion(scope.id);
      const jkt = oldJkt ?? previous?.jkt ?? '';
      const generation = crypto.randomUUID();
      await writeCookieSessionVersion(scope.id, { jkt, generation, active: false });
      channel.postMessage({ type: 'clear', sender, jkt, generation } satisfies ChannelMessage);
    }
  };

  const existingKey = async (expectedJkt?: string): Promise<DpopKey> => {
    assertLive();
    const key = await getOrCreateDpopKey(scope, { create: false });
    if (expectedJkt !== undefined && expectedJkt !== key.jkt) throw keyLost();
    return key;
  };

  const authenticatedKey = async (): Promise<DpopKey> => {
    const expected =
      token?.jkt ??
      (sessionTransport === 'body'
        ? readStorage<Handle>(storageKey)?.jkt
        : (await readCookieSessionVersion(scope.id))?.jkt);
    // Read persistence even with no handle so an IDB loss is explicit.
    const key = await existingKey(expected);
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

  const currentRecognition = async (): Promise<string> => recognitionMarker((await fingerprint?.headers()) ?? {});

  const post = async (
    route: 'login' | 'exchange' | 'refresh' | 'logout',
    body: object,
    key: DpopKey,
  ): Promise<{ value: unknown; recognition: string }> => {
    const url = `${scope.backendOrigin}${scope.basePath === '/' ? '' : scope.basePath}/${route}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const recognition = route === 'logout' ? {} : ((await fingerprint?.headers()) ?? {});
      const currentKey = await existingKey(key.jkt);
      const proof = await createDpopProof(currentKey, {
        method: 'POST',
        url,
        now,
        nonce: nonces.get(scope.id, key.jkt),
      });
      const response = await request(url, {
        method: 'POST',
        credentials: route === 'login' || route === 'exchange' || sessionTransport === 'cookie' ? 'include' : 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...recognition, DPoP: proof },
        body: JSON.stringify(body),
      });
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        value = undefined;
      }
      if (response.ok) return { value, recognition: await recognitionMarker(recognition) };
      const error = serverError(response.status, value);
      if (
        error.code === 'OIDC_VAULT_USE_DPOP_NONCE' &&
        (response.status === 400 || response.status === 401) &&
        attempt === 0 &&
        nonces.remember(scope.id, key.jkt, response.headers.get('DPoP-Nonce'))
      )
        continue;
      throw error;
    }
    throw new OidcVaultDpopClientError('DPOP_NONCE_RETRY_EXHAUSTED', 'The DPoP nonce challenge was repeated.');
  };

  const publish = async (
    next: DpopAccessToken,
    recognition: string,
    operationEpoch: number,
  ): Promise<DpopAccessToken> => {
    await existingKey(next.jkt);
    if (epoch !== operationEpoch || disposed) throw loginRequired();
    if (channel) {
      await writeCookieSessionVersion(scope.id, { jkt: next.jkt, generation: next.generation, active: true });
    }
    if (epoch !== operationEpoch || disposed) throw loginRequired();
    token = next;
    tokenRecognition = recognition;
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
    operationEpoch: number,
  ): Promise<DpopAccessToken> => {
    if (epoch !== operationEpoch || disposed) throw loginRequired();
    const parsed = parseDpopCredentials(response.value, sessionTransport, key.jkt, now());
    if (sessionTransport === 'body') store(storageKey, { sessionId: parsed.sessionId!, jkt: key.jkt } satisfies Handle);
    return publish(parsed.token, response.recognition, operationEpoch);
  };

  const adoptPeer = async (
    message: ChannelMessage,
    expectedRecognition?: string,
  ): Promise<DpopAccessToken | undefined> => {
    if (disposed || message.type !== 'token') return undefined;
    const operationEpoch = epoch;
    const recognition = expectedRecognition ?? (await currentRecognition());
    if (message.recognition !== recognition) return undefined;
    const current = await readCookieSessionVersion(scope.id);
    if (!current?.active || current.jkt !== message.jkt || current.generation !== message.generation) return undefined;
    const peer = readPeerToken(message.token, current.jkt, current.generation, now());
    if (!peer) return undefined;
    await existingKey(current.jkt);
    const latest = await readCookieSessionVersion(scope.id);
    if (epoch !== operationEpoch || disposed || !latest?.active || latest.generation !== current.generation)
      return undefined;
    token = peer;
    tokenRecognition = recognition;
    return peer;
  };

  const requestPeer = (
    jkt: string,
    generation: string,
    recognition: string,
    rejectedToken?: string,
  ): Promise<DpopAccessToken | undefined> =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (value?: DpopAccessToken) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        peerWaiters.delete(waiter);
        resolve(value);
      };
      const waiter = (message: ChannelMessage) => {
        if (message.jkt !== jkt || message.generation !== generation) return;
        void adoptPeer(message, recognition)
          .then((peer) => {
            if (peer && peer.accessToken !== rejectedToken) finish(peer);
          })
          .catch(() => finish());
      };
      const timeout = setTimeout(() => finish(), 180);
      peerWaiters.add(waiter);
      channel?.postMessage({ type: 'request-token', sender, jkt, generation, recognition } satisfies ChannelMessage);
    });

  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data as Partial<ChannelMessage> | null;
      if (
        !message ||
        message.sender === sender ||
        typeof message.sender !== 'string' ||
        typeof message.jkt !== 'string' ||
        typeof message.generation !== 'string' ||
        !['token', 'request-token', 'clear'].includes(message.type ?? '')
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
      } else if (captured.type === 'clear') {
        void withCookieLock(async () => {
          const version = await readCookieSessionVersion(scope.id);
          // A peer clears auth, not a new pending login owned by this tab/context.
          if (!version?.active && version?.generation === captured.generation) clearLocal(false);
        }).catch(() => clearLocal(false));
      } else {
        for (const waiter of peerWaiters) waiter(captured);
        void adoptPeer(captured).catch(() => clearLocal(false));
      }
    };

  const onFailure = async (error: unknown): Promise<never> => {
    if (!disposed && error instanceof OidcVaultDpopClientError && error.requiresLogin) await invalidate();
    throw error;
  };
  // Handle a credential failure while still holding the cookie lock, so a late
  // stale-context clear cannot overtake the next tab's successful rotation.
  const operation = <T>(run: () => Promise<T>): Promise<T> =>
    withCookieLock(async () => {
      try {
        return await run();
      } catch (error) {
        return onFailure(error);
      }
    });

  const session: OidcVaultDpopSession = {
    scopeId: scope.id,
    sessionTransport,
    async login(returnTo) {
      assertLive();
      await operation(async () => {
        await invalidate();
        const key = await getOrCreateDpopKey(scope);
        store(pendingKey, { jkt: key.jkt } satisfies PendingLogin);
        const body: OidcVaultLoginInitiationInput = returnTo === undefined ? {} : { returnTo };
        const { value } = await post('login', body, key);
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
        navigate(url.href);
      });
    },
    async exchange(code) {
      assertLive();
      return operation(async () => {
        const pending = readStorage<PendingLogin>(pendingKey);
        const key = await existingKey(pending?.jkt);
        if (!pending?.jkt || typeof code !== 'string' || code.length === 0) throw loginRequired();
        const operationEpoch = epoch;
        const result = await acceptResponse(await post('exchange', { code }, key), key, operationEpoch);
        store(pendingKey);
        return result;
      });
    },
    refresh(refreshOptions = {}) {
      assertLive();
      if (refreshPromise) return refreshPromise;
      const run = async () => {
        const hadToken = token !== undefined;
        const baseline =
          token?.generation ?? (channel ? (await readCookieSessionVersion(scope.id))?.generation : undefined);
        return operation(async () => {
          const key = await authenticatedKey();
          if (channel) {
            const recognition = await currentRecognition();
            const version = await readCookieSessionVersion(scope.id);
            if (!version?.active || version.jkt !== key.jkt) throw loginRequired();
            const current = token;
            if (
              refreshOptions.rejectedToken &&
              current &&
              current.accessToken !== refreshOptions.rejectedToken &&
              current.expiresAt > now() &&
              current.generation === version.generation &&
              tokenRecognition === recognition
            )
              return current;
            if (
              (!hadToken || current?.generation !== baseline) &&
              current &&
              current.expiresAt > now() &&
              current.accessToken !== refreshOptions.rejectedToken &&
              current.generation === version.generation &&
              tokenRecognition === recognition
            )
              return current;
            if (!hadToken || version.generation !== baseline) {
              const peer = await requestPeer(key.jkt, version.generation, recognition, refreshOptions.rejectedToken);
              if (peer) return peer;
            }
          }
          if (
            !channel &&
            refreshOptions.rejectedToken &&
            token &&
            token.accessToken !== refreshOptions.rejectedToken &&
            token.expiresAt > now() &&
            tokenRecognition === (await currentRecognition())
          )
            return token;
          const handle = sessionTransport === 'body' ? readStorage<Handle>(storageKey) : undefined;
          if (sessionTransport === 'body' && (!handle?.sessionId || handle.jkt !== key.jkt)) throw loginRequired();
          const operationEpoch = epoch;
          return acceptResponse(
            await post('refresh', handle ? { sessionId: handle.sessionId } : {}, key),
            key,
            operationEpoch,
          );
        });
      };
      const pending = run();
      refreshPromise = pending;
      void pending
        .finally(() => {
          if (refreshPromise === pending) refreshPromise = undefined;
        })
        .catch(() => {});
      return pending;
    },
    async logout() {
      assertLive();
      await operation(async () => {
        const key = await authenticatedKey();
        const handle = sessionTransport === 'body' ? readStorage<Handle>(storageKey) : undefined;
        if (sessionTransport === 'body' && !handle?.sessionId) throw loginRequired();
        const { value } = await post('logout', handle ? { sessionId: handle.sessionId } : {}, key);
        if (typeof value !== 'object' || value === null || !('loggedOut' in value) || value.loggedOut !== true) {
          throw new OidcVaultDpopClientError('INVALID_LOGOUT_RESPONSE', 'The logout response is invalid.');
        }
        await invalidate();
      });
    },
    getAccessToken: () => token,
    getKey: () => operation(authenticatedKey),
    clear: () => withCookieLock(invalidate),
    dispose() {
      disposed = true;
      epoch++;
      token = undefined;
      tokenRecognition = undefined;
      channel?.close();
      peerWaiters.clear();
    },
  };
  return Object.freeze(session);
};
