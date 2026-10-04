/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 */
import type { OidcVaultDpopSession } from './auth-session';
import { createDpopProof } from './dpop-proof';
import { loginRequired, OidcVaultDpopClientError } from './errors';
import { DpopNonceCache } from './nonce-cache';
import { normalizeDpopTarget, normalizeStaticOrigin } from './scope';

export interface DpopApi {
  /** Exact origin receiving the proof/Authorization. No wildcard or redirects. */
  origin: string;
  /** Backend API replayNamespace (the nonce protection space), not a route. */
  replayNamespace: string;
  /** Usually omit for JWT APIs; include only for an explicitly cookie-using API. */
  credentials?: 'omit' | 'include';
}

export interface DpopFetchContext {
  session: OidcVaultDpopSession;
  apis: readonly DpopApi[];
  fetch?: typeof globalThis.fetch;
  nonces?: DpopNonceCache;
  now?: () => number;
}

export interface DpopFetchOptions extends Omit<RequestInit, 'redirect' | 'credentials'> {
  /**
   * GET/HEAD/OPTIONS may retry. All other methods default to one attempt.
   * Explicitly authorize idempotent retries only for a server operation whose
   * contract supports them (e.g. PUT or POST with a server idempotency key).
   */
  retry?: 'never' | 'idempotent';
}

const defaultNonces = new WeakMap<OidcVaultDpopSession, DpopNonceCache>();
const nonceCache = (context: DpopFetchContext): DpopNonceCache => {
  if (context.nonces) return context.nonces;
  let cache = defaultNonces.get(context.session);
  if (!cache) {
    cache = new DpopNonceCache();
    defaultNonces.set(context.session, cache);
  }
  return cache;
};

const replayableBody = (body: BodyInit | null | undefined): (() => BodyInit | null | undefined) => {
  if (body === undefined || body === null || typeof body === 'string') return () => body;
  if (body instanceof URLSearchParams) {
    const snapshot = body.toString();
    return () => new URLSearchParams(snapshot);
  }
  if (body instanceof Blob) {
    const snapshot = body.slice();
    return () => snapshot.slice();
  }
  if (body instanceof ArrayBuffer) {
    const snapshot = body.slice(0);
    return () => snapshot.slice(0);
  }
  if (ArrayBuffer.isView(body)) {
    const snapshot = new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
    return () => snapshot.slice();
  }
  if (body instanceof FormData) {
    const entries = [...body.entries()];
    return () => {
      const copy = new FormData();
      for (const [name, value] of entries) copy.append(name, value);
      return copy;
    };
  }
  throw new OidcVaultDpopClientError('DPOP_BODY_NOT_REPLAYABLE', 'Retry requires a replayable request body.');
};

// The frozen backend contract emits DPoP error first, then algs. Associate
// error with that challenge, never an unrelated Bearer challenge on the line.
const challengeError = (response: Response): string | undefined =>
  response.status === 401
    ? /(?:^|,\s*)DPoP\s+error="([a-z_]+)"(?:,|$)/i.exec(response.headers.get('WWW-Authenticate') ?? '')?.[1]
    : undefined;

/**
 * Scoped DPoP `fetch` for one configured API origin: mints a fresh proof per
 * attempt, sends `Authorization: DPoP`, then retries once on a DPoP nonce
 * challenge and at most once via `session.refresh()` on `invalid_token`.
 * Canonical import: `import { fetchWithDpop } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'` (named root import). Only origins
 * listed in `context.apis` are called; authentication headers are owned by the
 * helper and must not be set by callers.
 */
export const fetchWithDpop = async (
  context: DpopFetchContext,
  input: string | URL,
  options: DpopFetchOptions = {},
): Promise<Response> => {
  const target = normalizeDpopTarget(input);
  const url = new URL(typeof input === 'string' ? input : input.href);
  const api = context.apis.find((candidate) => normalizeStaticOrigin(candidate.origin) === url.origin);
  if (!api || !api.replayNamespace || api.replayNamespace.length > 128 || !/^[\x20-\x7e]+$/.test(api.replayNamespace)) {
    throw new OidcVaultDpopClientError('DPOP_API_OUT_OF_SCOPE', 'The API target is outside the configured auth scope.');
  }
  const { session, fetch: request = globalThis.fetch.bind(globalThis), now = Date.now } = context;
  const { retry, ...init } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  if (retry !== undefined && retry !== 'never' && retry !== 'idempotent')
    throw new TypeError('Unknown DPoP retry policy.');
  const canRetry = retry !== 'never' && (['GET', 'HEAD', 'OPTIONS'].includes(method) || retry === 'idempotent');
  const body = canRetry ? replayableBody(init.body) : () => init.body;
  const headers = new Headers(init.headers);
  for (const name of ['Authorization', 'DPoP', 'Cookie', 'Proxy-Authorization']) {
    if (headers.has(name))
      throw new OidcVaultDpopClientError('DPOP_AUTH_HEADER_OVERRIDE', 'The DPoP helper owns authentication headers.');
  }
  const space = JSON.stringify(['api', url.origin, api.replayNamespace]);
  const nonces = nonceCache(context);
  let nonceRetried = false;
  let refreshed = false;
  let credential = session.getAccessToken();
  if (!credential || credential.expiresAt <= now()) {
    credential = await session.refresh();
    refreshed = true;
  }
  for (;;) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (credential.tokenType !== 'DPoP') {
      await session.clear();
      throw new OidcVaultDpopClientError(
        'DPOP_TOKEN_TYPE_REQUIRED',
        'A DPoP access token is required. Sign in again.',
        true,
      );
    }
    const key = await session.getKey();
    if (key.jkt !== credential.jkt) {
      await session.clear();
      throw loginRequired();
    }
    const proof = await createDpopProof(key, {
      method,
      url: target,
      accessToken: credential.accessToken,
      nonce: nonces.get(space, key.jkt),
      now,
    });
    const attemptHeaders = new Headers(headers);
    attemptHeaders.set('Authorization', `DPoP ${credential.accessToken}`);
    attemptHeaders.set('DPoP', proof);
    const response = await request(url.href, {
      ...init,
      method,
      body: body(),
      headers: attemptHeaders,
      credentials: api.credentials ?? 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    if (
      challengeError(response) === 'use_dpop_nonce' &&
      canRetry &&
      !nonceRetried &&
      nonces.remember(space, key.jkt, response.headers.get('DPoP-Nonce'))
    ) {
      nonceRetried = true;
      await response.body?.cancel();
      continue;
    }
    if (challengeError(response) === 'invalid_token' && canRetry && !refreshed) {
      refreshed = true;
      await response.body?.cancel();
      credential = await session.refresh({ rejectedToken: credential.accessToken });
      continue;
    }
    return response;
  }
};
