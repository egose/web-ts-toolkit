import { abortable, assertNotAborted, cancelResponse } from './abort';
import { readDpopChallengeError } from './auth-challenge';
import type { OidcVaultDpopSession } from './auth-session';
import { createDpopProof } from './dpop-proof';
import { loginRequired, OidcVaultDpopClientError } from './errors';
import { DpopNonceCache } from './nonce-cache';
import { normalizeDpopPathPrefix, normalizeDpopTarget, normalizeStaticOrigin } from './scope';

/**
 * Credential/nonce policy for a public API subtree, selected by `fetchWithDpop`.
 * @example
 * const apis: DpopApi[] = [
 *   { origin: 'https://gateway.example.com', pathPrefix: '/orders', replayNamespace: 'orders-api' },
 *   { origin: 'https://gateway.example.com', pathPrefix: '/billing', replayNamespace: 'billing-api' },
 * ];
 */
export interface DpopApi {
  /**
   * Exact public scheme/host/port receiving auth, with an optional root slash.
   * HTTPS or loopback HTTP; no path, query, fragment, wildcard or redirects.
   */
  origin: string;
  /**
   * Absolute path subtree. Omission or `/` permits the entire origin. Matches
   * segment boundaries (`/orders` or `/orders/...`, never `/orders-evil`);
   * the longest normalized matching prefix wins, independent of array order.
   * Trailing slashes are removed; unreserved percent escapes and dot segments
   * normalize as in the proof/outbound path. A prefix normalizing to `/` is
   * origin-wide too. Reserved escapes remain encoded.
   * No URL, `//` authority-like prefix, query, fragment, whitespace, backslash,
   * or malformed escape. Duplicate normalized origin/path scopes are rejected,
   * even if their namespace/credential policies are identical.
   */
  pathPrefix?: string;
  /**
   * Backend API replayNamespace: 1–128 printable ASCII characters. Nonces use
   * the selected `['api', normalizedOrigin, replayNamespace]` plus signing jkt;
   * paths with the same origin/namespace intentionally share that nonce space.
   */
  replayNamespace: string;
  /** Default `omit`. Use `include` only for a cookie-using API. Snapshotted before auth awaits. */
  credentials?: 'omit' | 'include';
}

export interface DpopFetchContext {
  session: OidcVaultDpopSession;
  /** All scopes are validated on each invocation, including entries that do not match its target. */
  apis: readonly DpopApi[];
  fetch?: typeof globalThis.fetch;
  /** Optional shared cache; each instance holds at most 64 protection-space/key tuples. */
  nonces?: DpopNonceCache;
  now?: () => number;
}

export interface DpopFetchOptions extends Omit<RequestInit, 'redirect' | 'credentials'> {
  /**
   * Abort this caller's wait before/through auth, proof and HTTP work. Pre-aborted
   * calls do no auth work. Shared refresh/key work continues for other waiters;
   * already-started Web Crypto/server mutations cannot be undone.
   */
  signal?: AbortSignal | null;
  /**
   * GET/HEAD/OPTIONS may retry. All other methods default to one attempt.
   * Explicitly authorize idempotent retries only for a server operation whose
   * contract supports them (e.g. PUT or POST with a server idempotency key).
   * Nonce learning still occurs on single-attempt and success responses, so a
   * later explicit invocation can use the nonce without resubmitting this call.
   */
  retry?: 'never' | 'idempotent';
}

const invalidApiConfig = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('INVALID_DPOP_API_CONFIG', 'The API auth scope configuration is invalid or ambiguous.');

const selectApi = (apis: readonly DpopApi[], origin: string, pathname: string): Readonly<Required<DpopApi>> => {
  if (!Array.isArray(apis)) throw invalidApiConfig();
  const scopes = new Set<string>();
  let selected: Readonly<Required<DpopApi>> | undefined;
  for (const candidate of apis) {
    if (!candidate || typeof candidate !== 'object') throw invalidApiConfig();
    const { origin: configuredOrigin, pathPrefix: configuredPath, replayNamespace, credentials = 'omit' } = candidate;
    if (
      typeof configuredOrigin !== 'string' ||
      typeof replayNamespace !== 'string' ||
      !/^[\x20-\x7e]{1,128}$/.test(replayNamespace) ||
      (credentials !== 'omit' && credentials !== 'include')
    )
      throw invalidApiConfig();
    const normalizedOrigin = normalizeStaticOrigin(configuredOrigin);
    const pathPrefix = normalizeDpopPathPrefix(normalizedOrigin, configuredPath);
    const scope = JSON.stringify([normalizedOrigin, pathPrefix]);
    if (scopes.has(scope)) throw invalidApiConfig();
    scopes.add(scope);
    if (
      normalizedOrigin !== origin ||
      (pathPrefix !== '/' && pathname !== pathPrefix && !pathname.startsWith(`${pathPrefix}/`))
    ) {
      continue;
    }
    if (!selected || pathPrefix.length > selected.pathPrefix.length) {
      // Own primitive policy values before any injected auth/crypto/network work.
      selected = { origin: normalizedOrigin, pathPrefix, replayNamespace, credentials };
    }
  }
  if (!selected) {
    throw new OidcVaultDpopClientError('DPOP_API_OUT_OF_SCOPE', 'The API target is outside the configured auth scope.');
  }
  return selected;
};

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

const assertLiveAccessToken = (expiresAt: number, now: number): void => {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new OidcVaultDpopClientError('INVALID_DPOP_TIME', 'The proof clock is invalid.');
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now)
    throw new OidcVaultDpopClientError(
      'DPOP_ACCESS_TOKEN_EXPIRED',
      'The DPoP access token has expired. Refresh before retrying.',
    );
};

/**
 * Scoped DPoP `fetch` for a configured API origin/path: mints a fresh proof per
 * attempt and sends `Authorization: DPoP`. When the retry policy permits it,
 * retries once on a DPoP nonce challenge and at most once via `session.refresh()`
 * on `invalid_token`. Learns valid response nonces even on single-attempt,
 * success and final challenge responses, isolated by protection space/key.
 * Only an unambiguous HTTP-401 DPoP challenge authorizes recovery; parameter
 * order is flexible, but malformed/duplicate challenges and fields over 8,192
 * characters do not trigger retries. Final API responses belong to the caller.
 * Canonical import: `import { fetchWithDpop } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'` (named root import). Selects the
 * longest normalized segment-prefix match in `context.apis`; omission/root is
 * origin-wide. Validates all scopes and snapshots the target and selected
 * origin/path/namespace/credentials before auth awaits. A missing match rejects
 * with DPOP_API_OUT_OF_SCOPE before credential/key/refresh/network work. Bad
 * policies or duplicate normalized scopes reject with INVALID_DPOP_API_CONFIG;
 * malformed paths/origins retain INVALID_DPOP_TARGET / INSECURE_DPOP_ORIGIN.
 * All are non-terminal. Authentication headers are owned by the helper.
 * Outbound path normalization matches the proof: unreserved escapes and dot
 * segments normalize, reserved escapes stay encoded, and query/fragment data
 * is preserved for fetch (HTTP omits fragments). Neither enters the proof.
 * The uppercase method is the same on the proof and every outbound attempt.
 * A nonlive deadline (including an expiresIn: 0 refresh result) stops the
 * attempt with DPOP_ACCESS_TOKEN_EXPIRED, requiresLogin: false. The rotated
 * session handle is retained; no additional refresh loop is started.
 * Caller cancellation rejects with signal.reason, including while waiting on
 * shared refresh/key work, without cancelling that shared work. Discarded retry
 * responses are cancelled best effort; cleanup never delays or replaces a result.
 */
export const fetchWithDpop = async (
  context: DpopFetchContext,
  input: string | URL,
  options: DpopFetchOptions = {},
): Promise<Response> => {
  const { signal } = options;
  assertNotAborted(signal);
  const inputUrl = typeof input === 'string' ? input : input.href;
  // Validate the raw path before URL parsing can discard malformed dot segments.
  const target = normalizeDpopTarget(inputUrl);
  const url = new URL(inputUrl);
  // Match the path actually sent, not just its equivalent proof spelling. The
  // pathname setter cannot switch authorities or rewrite query/fragment data.
  url.pathname = new URL(target).pathname;
  const { href, origin, pathname } = url;
  const api = selectApi(context.apis, origin, pathname);
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
  const space = JSON.stringify(['api', api.origin, api.replayNamespace]);
  const nonces = nonceCache(context);
  let nonceRetried = false;
  let refreshed = false;
  let credential = session.getAccessToken();
  if (!credential || credential.expiresAt <= now()) {
    credential = await abortable(signal, () => session.refresh());
    refreshed = true;
  }
  for (;;) {
    assertNotAborted(signal);
    if (credential.tokenType !== 'DPoP') {
      await abortable(signal, () => session.clear());
      assertNotAborted(signal);
      throw new OidcVaultDpopClientError(
        'DPOP_TOKEN_TYPE_REQUIRED',
        'A DPoP access token is required. Sign in again.',
        true,
      );
    }
    assertLiveAccessToken(credential.expiresAt, now());
    const accessToken: string = credential.accessToken;
    const key = await abortable(signal, () => session.getKey());
    assertNotAborted(signal);
    const { jkt } = key;
    if (jkt !== credential.jkt) {
      await abortable(signal, () => session.clear());
      assertNotAborted(signal);
      throw loginRequired();
    }
    const proof = await abortable(signal, () =>
      createDpopProof(key, {
        method,
        url: target,
        accessToken,
        nonce: nonces.get(space, jkt),
        now,
        signal: signal ?? undefined,
      }),
    );
    assertNotAborted(signal);
    assertLiveAccessToken(credential.expiresAt, now());
    const attemptHeaders = new Headers(headers);
    attemptHeaders.set('Authorization', `DPoP ${accessToken}`);
    attemptHeaders.set('DPoP', proof);
    const response = await abortable(
      signal,
      () =>
        request(href, {
          ...init,
          method,
          body: body(),
          headers: attemptHeaders,
          credentials: api.credentials,
          redirect: 'error',
          cache: 'no-store',
        }),
      cancelResponse,
    );
    if (signal?.aborted) {
      cancelResponse(response);
      assertNotAborted(signal);
    }
    // Learning does not authorize a retry. Snapshot the response once before
    // cleanup or refresh can run injected code, retaining the signing key's jkt.
    const challenge =
      response.status === 401 ? readDpopChallengeError(response.headers.get('WWW-Authenticate')) : undefined;
    const learnedNonce = nonces.remember(space, jkt, response.headers.get('DPoP-Nonce'));
    if (challenge === 'use_dpop_nonce' && canRetry && !nonceRetried && learnedNonce) {
      nonceRetried = true;
      cancelResponse(response);
      continue;
    }
    if (challenge === 'invalid_token' && canRetry && !refreshed) {
      refreshed = true;
      cancelResponse(response);
      credential = await abortable(signal, () => session.refresh({ rejectedToken: accessToken }));
      continue;
    }
    return response;
  }
};
