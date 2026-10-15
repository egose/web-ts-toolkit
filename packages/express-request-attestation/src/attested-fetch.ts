/**
 * Prepared signed fetch with one pre-handler stale-key retry.
 *
 * Browser-safe: use the `/signer` entry without Express or Node dependencies/types.
 *
 * - `fetchWithAttestation(input, init, options)` builds one immutable request
 *   snapshot from `string | URL | Request` input plus `RequestInit`. Actual
 *   method, headers (including `Authorization`), explicit `credentials`
 *   (native default `same-origin`, never forced to `include`), `signal`, and
 *   explicit request options (`mode`, `cache`, `referrer`, `integrity`,
 *   `keepalive`) are preserved. Only the configured API origin is signed;
 *   unrelated origins fail locally without sending auth or signature material.
 * - The serialized body is materialized ONCE within the byte cap/read
 *   deadline, then those same bytes plus the final content
 *   type and one body digest are reused for both attempts. Normal finite `BodyInit`
 *   values and replayable `Request`s are supported; caller JSON objects must
 *   be serialized with `JSON.stringify` first. `FormData` is serialized
 *   through a `Request` first and its bytes/boundary are preserved verbatim
 *   (never reconstructed on retry, never `.arrayBuffer()` on `FormData`
 *   itself). A `Request` body uses a byte-counting reader with cancellation
 *   and timeout rather than rejecting on stream type alone. Inherited bodies
 *   are cloned before reading so finite caller Requests remain reusable,
 *   including concurrent calls. Non-null `init.body` supplies a replacement;
 *   `null`/`undefined` inherit the body, as in Fetch. Explicit replacement
 *   streams transfer ownership, including aliases of the original's body.
 * - Each attempt mints one fresh 128-bit nonce (`generateNonceHex`) and one
 *   validated `now()` timestamp. Loaded signer protection space must match
 *   the allowed `apiOrigin`/`replayNamespace` before signing. The caller
 *   signature field is replaced (never appended).
 * - Signed attempts use `redirect: 'manual'`; redirect results are
 *   exposed/returned without forwarding a signature. `Content-Encoding` other
 *   than identity/absent fails locally (v1 identity-only profile).
 * - `no-cors` and browser-forbidden proof fields fail before body/signer work
 *   when statically known. Each constructed Request must retain the exact proof
 *   before transport is invoked; unrestricted temporary Headers are insufficient.
 * - At most one retry, only on the pre-handler stale-key signal: expected
 *   `403` plus `X-Attestation-Error: stale-key`. The error response is
 *   inspected via headers only (never consumed), only the observed key is
 *   invalidated, and the same serialized request is re-signed with a fresh
 *   timestamp/nonce. A second stale challenge stops. Expired/future/replay/
 *   invalid proofs, operational `5xx`, auth failures, redirects, network
 *   uncertainty, and handler uncertainty never retry.
 * - The first stale response remains untouched until the retry Request is
 *   built. Reload/signing/construction failure or a repeated envelope returns
 *   that readable response. Abandoned bodies are cancelled without awaiting
 *   producer cleanup, with cancellation rejection observed. Caller abort stops
 *   this invocation's preparation wait without disposing the shared signer client.
 *
 * Application auth retries call this wrapper again for a fresh proof. The
 * server guard never establishes or rewrites authentication. Auth-before-guard
 * avoids replay allocation for rejected credentials; guard-first can reject
 * bad proofs before auth work but reserves even if later auth fails. Durable
 * business idempotency and retry decisions remain application-owned.
 *
 * Browser CORS/CSP (application-configured):
 *
 * - Allow the configured signature field plus actual `Content-Type`,
 *   `Authorization`/DPoP headers as needed; expose `X-Attestation-Error` so
 *   the wrapper can see the retry marker; allow credentialed origins only when
 *   the application explicitly uses `credentials: 'include'`.
 * - Native module imports require `script-src` + CORS for key and runtime URLs;
 *   metadata/API fetches need suitable `connect-src`. Discovery uses
 *   no-store/omit/error, while dynamic imports follow native module rules.
 *   Asset modules must not redirect to other origins. Let OPTIONS reach the
 *   application's CORS handler before the server attestation guard.
 *
 * Public HMAC material stays accessible to every caller despite
 * non-extractable `CryptoKey` wrapping; this wrapper provides request-format
 * consistency and replay detection, not device/browser authenticity.
 */

import {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  DEFAULT_ATTESTATION_HEADER,
  AttestationProtocolError,
} from './shared/types.js';
import {
  canonicalizeRequestTarget,
  normalizeContentType,
  normalizeMethod,
  validateHeaderName,
  validatePublicOrigin,
  validateReplayNamespace,
} from './shared/codec.js';
import { assertTimestampMs } from './shared/canonical.js';
import { DEFAULT_MAX_BODY_BYTES, MAX_BODY_BYTES_HARD_CAP } from './shared/types.js';
import { SignerClientError } from './client-errors.js';
import type { SignerClient } from './signer-client.js';
import { generateNonceHex, hashBodySha256Hex } from './request-signer.js';
import { assertSupportedBodyInit, materializeRequestBodyBytes } from './request-body.js';

/** Default bounded body-read deadline for one prepared fetch: 5000 ms. */
export const DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS = 5000 as const;

const MIN_FETCH_TIMEOUT_MS = 1 as const;
const MAX_FETCH_TIMEOUT_MS = 60000 as const;

// Fetch transport restrictions are narrower than general HTTP header validity.
// Keep them out of the shared/server validator. Cookie2 and User-Agent are also
// rejected by Chromium's Request guard, despite no longer being in Fetch's list.
const FORBIDDEN_FETCH_HEADER_NAMES: ReadonlySet<string> = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
]);

const FETCH_WITH_ATTESTATION_OPTION_KEYS: ReadonlySet<string> = new Set([
  'signerClient',
  'apiOrigin',
  'replayNamespace',
  'fetch',
  'fetchFn',
  'headerName',
  'maxBodyBytes',
  'bodyReadTimeoutMs',
  'now',
]);

/** Options for `fetchWithAttestation` (all validation is strict). */
export interface FetchWithAttestationOptions {
  /** Caller-owned shared signer client, retained by reference; abort never disposes it. */
  readonly signerClient: SignerClient;
  /** Pinned API origin; only this origin is signed. Required. */
  readonly apiOrigin: string;
  /** Protection-space namespace; must match the loaded signer. Required. */
  readonly replayNamespace: string;
  /** API transport, default global fetch. Must honor the Request signal; no package transport deadline or uncertain retry. */
  readonly fetch?: typeof fetch;
  /** Compatibility alias for `fetch`; set at most one of the two options. */
  readonly fetchFn?: typeof fetch;
  /**
   * Signature field, default `x-client-transaction-id`. Shared HTTP validation
   * rejects malformed/reserved names with `AttestationProtocolError`. Otherwise
   * valid browser-forbidden fields (including `sec-*`, `proxy-*`, `Cookie2`, and
   * `User-Agent`) fail locally with `SIGNER_PREPARATION_FAILED` before body
   * preparation or signer work. The field must be writable by browser Fetch.
   */
  readonly headerName?: string;
  /** Body budget, default 1 MiB, hard cap 16 MiB. Must match server/parser limits. */
  readonly maxBodyBytes?: number;
  /** Body-read deadline only, default 5000 ms (integer 1–60000); distinct from signer load and API transport waits. */
  readonly bodyReadTimeoutMs?: number;
  /** Per-attempt clock, default `Date.now`; must return nonnegative safe-integer epoch milliseconds. */
  readonly now?: () => number;
}

interface ResolvedFetchOptions {
  readonly signerClient: SignerClient;
  readonly apiOrigin: string;
  readonly replayNamespace: string;
  readonly fetchImpl: typeof fetch;
  readonly headerName: string;
  readonly maxBodyBytes: number;
  readonly bodyReadTimeoutMs: number;
  readonly now: () => number;
}

function resolveFetchImpl(fetchAlias: unknown, fetchFnAlias: unknown): typeof fetch {
  if (fetchAlias !== undefined && fetchFnAlias !== undefined) {
    throw new AttestationProtocolError('fetchWithAttestation options must set at most one of fetch/fetchFn');
  }
  const candidate = fetchAlias ?? fetchFnAlias;
  if (candidate === undefined) {
    const globalFetch = (globalThis as unknown as { readonly fetch?: unknown }).fetch;
    if (typeof globalFetch !== 'function') {
      throw new SignerClientError(
        'SIGNER_PREPARATION_FAILED',
        'fetch is unavailable. Prepared fetch requires a fetch implementation.',
      );
    }
    // Native Window.fetch rejects the configuration object as its receiver.
    return (globalFetch as typeof fetch).bind(globalThis);
  }
  if (typeof candidate !== 'function') {
    throw new AttestationProtocolError('fetchWithAttestation fetch must be a function');
  }
  return candidate as typeof fetch;
}

function validateMaxBodyBytes(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_MAX_BODY_BYTES;
  }
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new AttestationProtocolError('maxBodyBytes must be a positive safe integer');
  }
  const bytes = value as number;
  if (bytes > MAX_BODY_BYTES_HARD_CAP) {
    throw new AttestationProtocolError(
      `maxBodyBytes must be at most ${MAX_BODY_BYTES_HARD_CAP} bytes (16 MiB v1 hard cap)`,
    );
  }
  return bytes;
}

function validateBodyReadTimeoutMs(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS;
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < MIN_FETCH_TIMEOUT_MS ||
    value > MAX_FETCH_TIMEOUT_MS
  ) {
    throw new AttestationProtocolError(
      `bodyReadTimeoutMs must be a safe integer in [${MIN_FETCH_TIMEOUT_MS}, ${MAX_FETCH_TIMEOUT_MS}]`,
    );
  }
  return value;
}

function assertFetchProofHeaderName(headerName: string): void {
  const lower = headerName.toLowerCase();
  if (lower.startsWith('sec-') || lower.startsWith('proxy-') || FORBIDDEN_FETCH_HEADER_NAMES.has(lower)) {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Attestation headerName must be writable by browser Fetch; browser-forbidden request headers cannot carry a proof.',
    );
  }
}

function assertAttestableMode(mode: RequestMode | undefined): void {
  if (mode === 'no-cors') {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Request mode no-cors cannot carry an attestation proof. Use cors or same-origin.',
    );
  }
}

function resolveOptions(options: FetchWithAttestationOptions): ResolvedFetchOptions {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('fetchWithAttestation options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!FETCH_WITH_ATTESTATION_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown fetchWithAttestation option ${key}`);
    }
  }
  const client = (options as { readonly signerClient?: unknown }).signerClient;
  if (
    client === null ||
    typeof client !== 'object' ||
    typeof (client as { readonly getSigner?: unknown }).getSigner !== 'function' ||
    typeof (client as { readonly invalidate?: unknown }).invalidate !== 'function'
  ) {
    throw new AttestationProtocolError('fetchWithAttestation signerClient must expose getSigner()/invalidate()');
  }
  validatePublicOrigin(options.apiOrigin);
  validateReplayNamespace(options.replayNamespace);
  const fetchImpl = resolveFetchImpl(
    (options as { readonly fetch?: unknown }).fetch,
    (options as { readonly fetchFn?: unknown }).fetchFn,
  );
  const headerName = options.headerName ?? DEFAULT_ATTESTATION_HEADER;
  validateHeaderName(headerName);
  assertFetchProofHeaderName(headerName);
  const maxBodyBytes = validateMaxBodyBytes(options.maxBodyBytes);
  const bodyReadTimeoutMs = validateBodyReadTimeoutMs(options.bodyReadTimeoutMs);
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') {
    throw new AttestationProtocolError('fetchWithAttestation now must be a function');
  }
  return Object.freeze({
    signerClient: client as SignerClient,
    apiOrigin: options.apiOrigin,
    replayNamespace: options.replayNamespace,
    fetchImpl,
    headerName,
    maxBodyBytes,
    bodyReadTimeoutMs,
    now: now as () => number,
  });
}

function checkedTimestampMs(now: () => number): number {
  let value: number;
  try {
    value = now();
  } catch {
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Attestation clock failed.');
  }
  try {
    assertTimestampMs('timestampMs', value);
  } catch {
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Attestation clock produced an invalid timestamp.');
  }
  return value;
}

/**
 * Derive the canonical origin-form request target from a final `Request.url`.
 * Uses the serialized URL pathname plus raw search string so encoded reserved
 * characters, doubled/trailing slashes, duplicate query parameters, query
 * order, `+`, and percent-escape spelling survive untouched. A lone empty
 * `?` is already absent from `URL.search`, matching the shared rule.
 */
function deriveRequestTarget(requestUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request URL is invalid.');
  }
  const target = `${parsed.pathname}${parsed.search}`;
  return canonicalizeRequestTarget(target);
}

function assertAllowedContentEncoding(headers: Headers): void {
  const raw = headers.get('content-encoding');
  if (raw === null) {
    return;
  }
  const tokens: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }
    tokens.push(trimmed.toLowerCase());
  }
  for (const token of tokens) {
    if (token !== 'identity') {
      throw new SignerClientError(
        'SIGNER_PREPARATION_FAILED',
        'Request content-encoding is unsupported. V1 accepts identity/no content-encoding only.',
      );
    }
  }
}

interface PreparedSnapshot {
  readonly url: string;
  readonly method: string;
  readonly requestTarget: string;
  readonly contentType: string;
  readonly bodyBytes: Uint8Array;
  readonly headers: Headers;
  readonly credentials: RequestCredentials;
  readonly signal: AbortSignal | null;
  readonly mode: RequestMode;
  readonly cache: RequestCache;
  readonly referrer: string;
  readonly referrerPolicy: ReferrerPolicy;
  readonly integrity: string;
  readonly keepalive: boolean;
}

function readRequestProperty<T>(request: Request, name: string): T {
  return (request as unknown as Record<string, T>)[name];
}

function readWithFallback<T>(base: Request, name: string, fallback: T): T {
  try {
    const value = readRequestProperty<T>(base, name);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function buildPreparedSnapshot(base: Request, bodyBytes: Uint8Array): PreparedSnapshot {
  const method = normalizeMethod(readRequestProperty<string>(base, 'method'));
  const requestTarget = deriveRequestTarget(base.url);
  const contentType = normalizeContentType(base.headers.get('content-type'));
  assertAllowedContentEncoding(base.headers);
  const headers = new Headers(base.headers);
  const credentials = readWithFallback<RequestCredentials>(base, 'credentials', 'same-origin');
  const signal = readWithFallback<AbortSignal | null>(base, 'signal', null);
  const mode = readWithFallback<RequestMode>(base, 'mode', 'cors');
  const cache = readWithFallback<RequestCache>(base, 'cache', 'default');
  const referrerRaw = readWithFallback<unknown>(base, 'referrer', '');
  const referrer = typeof referrerRaw === 'string' ? referrerRaw : '';
  const referrerPolicyRaw = readWithFallback<unknown>(base, 'referrerPolicy', '');
  const referrerPolicy = (typeof referrerPolicyRaw === 'string' ? referrerPolicyRaw : '') as ReferrerPolicy;
  const integrityRaw = readWithFallback<unknown>(base, 'integrity', '');
  const integrity = typeof integrityRaw === 'string' ? integrityRaw : '';
  const keepalive = readWithFallback<boolean>(base, 'keepalive', false) === true;
  return Object.freeze({
    url: base.url,
    method,
    requestTarget,
    contentType,
    bodyBytes,
    headers,
    credentials,
    signal,
    mode,
    cache,
    referrer,
    referrerPolicy,
    integrity,
    keepalive,
  });
}

function buildSignedRequest(snapshot: PreparedSnapshot, headerName: string, transactionId: string): Request {
  const headers = new Headers(snapshot.headers);
  // Replace (never append) any caller-supplied signature field.
  headers.set(headerName, transactionId);
  // Preserve the exact final content type captured before signing. The copy
  // above already carries it; re-assert it when non-empty so a bytes-bodied
  // reconstruction cannot drop a multipart boundary.
  if (snapshot.contentType !== '') {
    try {
      headers.set('content-type', snapshot.contentType);
    } catch {
      // If the header cannot be set (forbidden header in browser), the
      // original copy already holds the value; signing still used it.
    }
  }
  const bodyForFetch: Uint8Array | null = snapshot.bodyBytes.length === 0 ? null : snapshot.bodyBytes;
  const init: RequestInit & { readonly duplex?: string } = {
    method: snapshot.method,
    headers,
    redirect: 'manual',
    credentials: snapshot.credentials,
    mode: snapshot.mode,
    cache: snapshot.cache,
    integrity: snapshot.integrity,
    keepalive: snapshot.keepalive,
  };
  if (snapshot.signal !== null) {
    init.signal = snapshot.signal;
  }
  if (snapshot.referrer !== '') {
    try {
      init.referrer = snapshot.referrer;
    } catch {
      // Referrer is best-effort; signing already bound method/target/type/body.
    }
  }
  if (snapshot.referrerPolicy !== '') {
    try {
      init.referrerPolicy = snapshot.referrerPolicy;
    } catch {
      // Best-effort (see above).
    }
  }
  if (bodyForFetch !== null) {
    init.body = bodyForFetch as BodyInit;
  }
  let request: Request | undefined;
  try {
    request = new Request(snapshot.url, init);
    // Native request guards can silently discard or normalize a field that an
    // unrestricted Headers object accepted, including value-dependent guards.
    if (request.headers.get(headerName) !== transactionId) {
      throw new SignerClientError(
        'SIGNER_PREPARATION_FAILED',
        'Prepared request did not retain the exact attestation proof header.',
      );
    }
    return request;
  } catch (error) {
    cancelOwnedBody(request);
    if (error instanceof SignerClientError || error instanceof AttestationProtocolError) {
      throw error;
    }
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Prepared request could not be built.');
  }
}

function isStaleKeyRetryCandidate(response: Response): boolean {
  if (response.status !== 403) {
    return false;
  }
  try {
    return response.headers.get(ATTESTATION_ERROR_RESPONSE_HEADER) === 'stale-key';
  } catch {
    return false;
  }
}

/** Only call for a body this invocation owns and will neither return nor send. */
function cancelOwnedBody(owner: Request | Response | undefined): void {
  try {
    // Native tee cancellation may wait for a caller-owned sibling indefinitely.
    // A locked transport body remains the transport's responsibility.
    void owner?.body?.cancel().catch(() => undefined);
  } catch {
    // Synchronous faults from substitutes must not replace the operation's result.
  }
}

function throwIfAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) {
    if (signal.reason !== undefined) throw signal.reason;
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request was aborted before sending.');
  }
}

/** Stop this waiter, not the caller-owned client's shared load/native crypto. */
async function withPreparationAbort<T>(signal: AbortSignal | null, prepare: () => Promise<T>): Promise<T> {
  throwIfAborted(signal);
  if (signal === null) return prepare();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      try {
        throwIfAborted(signal);
      } catch (reason) {
        reject(reason);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    // Install both rejection observers before invoking preparation. Late shared
    // load/crypto failures remain observed after abort has won the race.
    return await Promise.race([Promise.resolve().then(prepare), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function copyRequestWithoutBody(input: Request): Request {
  // Chromium disturbs input.body even for new Request(input, { body: override }).
  // A bodyless template preserves the supported native settings without touching
  // a used/locked caller stream or creating an unused tee. Native construction
  // below still applies init (including header replacement and null signal).
  return new Request(input.url, {
    method: input.method,
    headers: input.headers,
    credentials: input.credentials,
    signal: input.signal,
    mode: input.mode === 'navigate' ? 'same-origin' : input.mode,
    cache: input.cache,
    referrer: input.referrer,
    referrerPolicy: input.referrerPolicy,
    integrity: input.integrity,
    keepalive: input.keepalive,
    redirect: input.redirect,
  });
}

async function prepareSnapshot(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  overridingBody: boolean,
  config: ResolvedFetchOptions,
): Promise<PreparedSnapshot> {
  let unreadOwner: Request | undefined;
  try {
    let base: Request;
    try {
      let source = input;
      if (input instanceof Request) {
        if (overridingBody) {
          source = copyRequestWithoutBody(input);
        } else if (input.body !== null) {
          // Until construction succeeds this clone owns the internal branch.
          unreadOwner = input.clone();
          source = unreadOwner;
        }
      }
      base = new Request(source as RequestInfo, init);
      // Native construction transfers an inherited clone body to base. Only
      // base can cancel it now; the caller's tee branch is never ours to cancel.
      unreadOwner = base;
    } catch (error) {
      if (error instanceof SignerClientError || error instanceof AttestationProtocolError) throw error;
      const message = error instanceof Error ? `: ${error.message}` : '';
      throw new SignerClientError('SIGNER_PREPARATION_FAILED', `Request could not be prepared${message}.`);
    }

    // Native dictionary conversion may resolve a non-string mode only during
    // construction. Check again before the bounded reader takes body ownership.
    assertAttestableMode(base.mode);
    // Mode/origin/encoding/abort rejection owns cleanup before a reader exists.
    if (new URL(base.url).origin !== config.apiOrigin) {
      throw new SignerClientError(
        'SIGNER_ORIGIN_MISMATCH',
        'Request origin does not match the configured API origin. Signatures are only attached to the configured API origin.',
      );
    }
    assertAllowedContentEncoding(base.headers);
    throwIfAborted(base.signal);

    // Transfer disposal responsibility to the bounded reader. It cancels once
    // on failure and releases its lock; do not cancel that stream a second time.
    unreadOwner = undefined;
    const bodyBytes = await materializeRequestBodyBytes(base, {
      maxBodyBytes: config.maxBodyBytes,
      signal: base.signal,
      timeoutMs: config.bodyReadTimeoutMs,
    });
    return buildPreparedSnapshot(base, bodyBytes);
  } finally {
    cancelOwnedBody(unreadOwner);
  }
}

/**
 * Prepare one immutable request snapshot, sign the exact bytes sent, and
 * retry at most once on `403` plus `X-Attestation-Error: stale-key`. Only the
 * pinned API origin is signed; Authorization/credentials follow native Fetch
 * options, and signed attempts always use manual redirects. Body bytes and
 * their digest are reused, with a fresh nonce/timestamp on each attempt.
 *
 * After general option validation, `no-cors` and browser-forbidden fields reject with
 * `SIGNER_PREPARATION_FAILED` before body/signer work when statically known.
 * `init.mode` is sampled once before `init.body`; an undefined mode inherits the
 * Request's mode (or Fetch's default). Supported `cors`/`same-origin` settings
 * are preserved. Every constructed attempt must retain the exact proof.
 *
 * Inherited finite Request bodies are cloned, leaving the original readable for
 * concurrent/repeated calls. Non-null `init.body` overrides even used/locked
 * originals; `null`/`undefined` inherit and require an unused, unlocked body.
 * Explicit stream bodies (even aliases of the original's body) transfer reading/
 * cancellation ownership after native construction succeeds. The byte cap covers
 * reader-owned storage, not native tee queues retained for the caller's original
 * Request. Reuse refers to the original Request's current body, not the identity
 * of a raw stream reference saved before native cloning. Construction failure
 * leaves an unaccepted explicit stream caller-owned.
 *
 * Reload/signing/retry-construction failure or a repeated envelope returns the
 * untouched first stale response. Only a prepared retry (or caller abort)
 * abandons it; cancellation is nonblocking with rejection observed. Caller abort
 * stops waiting for preparation, without disposing the shared signer client or
 * cancelling native module/crypto execution, and rejects with the caller's exact
 * reason. Dispatched readers belong to native Fetch/the injected transport,
 * which must honor the forwarded signal. Transport errors never retry. Every
 * separate application auth/business retry needs a fresh wrapper call; public
 * HMAC is not authentication or durable business idempotency.
 */
export async function fetchWithAttestation(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: FetchWithAttestationOptions,
): Promise<Response> {
  const config = resolveOptions(options);
  if (init !== undefined && (init === null || typeof init !== 'object' || Array.isArray(init))) {
    throw new AttestationProtocolError('fetchWithAttestation init must be an object');
  }
  // Preflight the effective mode before cloning/serializing a body. Native init
  // precedence applies: an explicit supported mode can replace inherited no-cors.
  const initMode = init?.mode;
  assertAttestableMode(initMode === undefined && input instanceof Request ? input.mode : initMode);
  // Preflight and native construction must see the same mode/body, even with
  // accessors that mutate init. Forward other dictionary properties unchanged,
  // including inherited/non-enumerable properties and their original receiver.
  const initBody = init?.body;
  const overridingBody = initBody !== undefined && initBody !== null;
  if (overridingBody) assertSupportedBodyInit(initBody);
  const stableInit =
    init === undefined
      ? undefined
      : new Proxy(init, {
          get(target, property) {
            if (property === 'body') return initBody;
            if (property === 'mode') return initMode;
            return Reflect.get(target, property, target);
          },
        });
  if (typeof input === 'string') {
    if (input.length === 0) {
      throw new AttestationProtocolError('fetchWithAttestation input must be a non-empty URL or Request');
    }
  } else if (!(input instanceof Request) && !(input instanceof URL)) {
    throw new AttestationProtocolError('fetchWithAttestation input must be a URL, string, or Request');
  }
  if (input instanceof Request && !overridingBody) {
    if (input.bodyUsed) {
      throw new SignerClientError(
        'SIGNER_PREPARATION_FAILED',
        'Request body has already been used. Clone the Request before sending or pass a fresh body.',
      );
    }
    if (input.body?.locked) {
      throw new SignerClientError(
        'SIGNER_PREPARATION_FAILED',
        'Request body is locked. Clone the Request before sending or pass a fresh body.',
      );
    }
  }

  const snapshot = await prepareSnapshot(input, stableInit, overridingBody, config);
  // Lazy, per-invocation digest of the private immutable byte snapshot. Neither
  // signer inputs nor native Request byte copies expose the snapshot for mutation.
  let bodyHashHex: string | undefined;

  async function signWithFreshProof(): Promise<{
    readonly transactionId: string;
    readonly observedKeyId: string;
  }> {
    throwIfAborted(snapshot.signal);
    const signer = await config.signerClient.getSigner();
    throwIfAborted(snapshot.signal);
    if (
      signer.version !== 1 ||
      signer.publicOrigin !== config.apiOrigin ||
      signer.replayNamespace !== config.replayNamespace
    ) {
      throw new SignerClientError(
        'SIGNER_ORIGIN_MISMATCH',
        'Loaded signer protection space does not match the configured API origin/namespace.',
      );
    }
    bodyHashHex ??= await hashBodySha256Hex(snapshot.bodyBytes);
    throwIfAborted(snapshot.signal);
    const timestampMs = checkedTimestampMs(config.now);
    const nonceHex = generateNonceHex();
    const transactionId = await signer.sign({
      method: snapshot.method,
      requestTarget: snapshot.requestTarget,
      contentType: snapshot.contentType,
      bodyHashHex,
      timestampMs,
      nonceHex,
    });
    throwIfAborted(snapshot.signal);
    return { transactionId, observedKeyId: signer.keyId };
  }

  async function send(request: Request): Promise<Response> {
    try {
      throwIfAborted(snapshot.signal);
      // Transport owns consumption once invoked. Native Fetch owns any locked
      // reader; an unread request on abort/rejection can still be released here.
      // Preserve caller-selected binding without supplying internal config as `this`.
      const fetchImpl = config.fetchImpl;
      return await fetchImpl(request);
    } catch (reason) {
      cancelOwnedBody(request);
      throw reason;
    }
  }

  const first = await withPreparationAbort(snapshot.signal, signWithFreshProof);
  const firstRequest = buildSignedRequest(snapshot, config.headerName, first.transactionId);
  // Network uncertainty and handler uncertainty never retry: each invocation
  // must regenerate its proof explicitly. Signed attempts use
  // `redirect: 'manual'`, so redirects are returned, not followed.
  const firstResponse = await send(firstRequest);

  if (!isStaleKeyRetryCandidate(firstResponse)) {
    return firstResponse;
  }

  // One bounded stale-key retry: invalidate only the observed key (a late
  // challenge for an old key never evicts a newer signer thanks to
  // generation-aware invalidation), reload, and re-sign the SAME serialized
  // request with a new timestamp/nonce. Never reuse the old envelope.
  try {
    config.signerClient.invalidate(first.observedKeyId);
  } catch {
    // Invalidation is best-effort locality; a failed invalidate still reloads.
  }
  let secondRequest: Request;
  try {
    const second = await withPreparationAbort(snapshot.signal, signWithFreshProof);
    throwIfAborted(snapshot.signal);
    if (second.transactionId === first.transactionId) {
      // A defective signer must not cause envelope reuse. The first response
      // still belongs to the caller if there is no valid retry to send.
      return firstResponse;
    }
    secondRequest = buildSignedRequest(snapshot, config.headerName, second.transactionId);
  } catch {
    if (snapshot.signal?.aborted) {
      cancelOwnedBody(firstResponse);
      throwIfAborted(snapshot.signal);
    }
    // Reload, signing, or native retry construction can fail. No body reader or
    // cancellation has touched this response; return the original readable error.
    return firstResponse;
  }

  // Commit to the fully prepared retry. Cancellation cannot block it, even if
  // a native tee's caller-owned sibling remains unread. send rechecks abort in
  // case cancellation itself triggers it and disposes the unsent retry body.
  cancelOwnedBody(firstResponse);
  // A second stale challenge stops: no further automatic retries.
  return send(secondRequest);
}
