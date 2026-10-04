/**
 * ATT-07 prepared signed fetch with one stale-key retry (task sections 4.5/4.6).
 *
 * Browser-safe ONLY: no Node built-ins, Express/Redis types, `Buffer`,
 * `NodeJS`, or `node:*` imports. Part of the `./signer` closure typechecked
 * by `tsconfig.signer-browser.json` (`types: []`).
 *
 * - `fetchWithAttestation(input, init, options)` builds one immutable request
 *   snapshot from `string | URL | Request` input plus `RequestInit`. Actual
 *   method, headers (including `Authorization`), explicit `credentials`
 *   (native default `same-origin`, never forced to `include`), `signal`, and
 *   explicit request options (`mode`, `cache`, `referrer`, `integrity`,
 *   `keepalive`) are preserved. Only the configured API origin is signed;
 *   unrelated origins fail locally without sending auth or signature material.
 * - The serialized body is materialized ONCE within the byte cap/read
 *   deadline (`request-body.ts`), then those same bytes plus the final content
 *   type are hashed and reused for both attempts. Normal finite `BodyInit`
 *   values and replayable `Request`s are supported; caller JSON objects must
 *   be serialized with `JSON.stringify` first. `FormData` is serialized
 *   through a `Request` first and its bytes/boundary are preserved verbatim
 *   (never reconstructed on retry, never `.arrayBuffer()` on `FormData`
 *   itself). A `Request` body uses a byte-counting reader with cancellation
 *   and timeout rather than rejecting on stream type alone.
 * - Each attempt mints one fresh 128-bit nonce (`generateNonceHex`) and one
 *   validated `now()` timestamp. Loaded signer protection space must match
 *   the allowed `apiOrigin`/`replayNamespace` before signing. The caller
 *   signature field is replaced (never appended).
 * - Signed attempts use `redirect: 'manual'`; redirect results are
 *   exposed/returned without forwarding a signature. `Content-Encoding` other
 *   than identity/absent fails locally (v1 identity-only profile).
 * - At most one retry, only on the pre-handler stale-key signal: expected
 *   `403` plus `X-Attestation-Error: stale-key`. The error response is
 *   inspected via headers only (never consumed), only the observed key is
 *   invalidated, and the same serialized request is re-signed with a fresh
 *   timestamp/nonce. A second stale challenge stops. Expired/future/replay/
 *   invalid proofs, operational `5xx`, auth failures, redirects, network
 *   uncertainty, and handler uncertainty never retry.
 *
 * Composition (tested in `test/fetch-client.test.ts`, documented for ATT-08):
 *
 * ```ts
 * import express from 'express';
 * import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
 * import {
 *   createAttestationBodyCapture,
 *   createRequestAttestationMiddleware,
 * } from '@web-ts-toolkit/express-request-attestation';
 *
 * const capture = createAttestationBodyCapture({ maxBodyBytes });
 * const guard = createRequestAttestationMiddleware({ publicOrigin, replayNamespace, keyProvider, store });
 * const app = express();
 * // Vault router owns its base path: mount once, never double-prefix.
 * app.use(createOidcVaultMiddleware({ basePath: '/auth/oidc', backendOrigin, storeProvider, config }));
 * // Capture JSON bytes before both validators on selected API routes only.
 * app.use(express.json({ limit: maxBodyBytes, verify: capture.verify, inflate: false }));
 * app.use(capture.errorHandler);
 * app.post('/api/submit', guard, requireBearerAuth, handler);
 * // Asset/OPTIONS/OIDC navigation/callback/backchannel routes stay reachable
 * // under their own policies; the guard never enrolls DPoP bindings or
 * // rewrites `req.auth`, and every auth refresh re-signs via a fresh wrapper call.
 * ```
 *
 * Browser CORS/CSP (application-configured, verified in tests):
 *
 * - Allow the configured signature field plus actual `Content-Type`,
 *   `Authorization`/DPoP headers as needed; expose `X-Attestation-Error` so
 *   the wrapper can see the retry marker; allow credentialed origins only when
 *   the application explicitly uses `credentials: 'include'`.
 * - Native module imports require `script-src` + CORS for the public module
 *   URLs. Same-origin uses the native default; cross-origin deployments must
 *   explicitly configure CORS for metadata/module fetches (which use
 *   `cache: no-store`, `credentials: omit`, `redirect: error`).
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
  /** Generation-aware signer client (ATT-06). Required, retained by reference. */
  readonly signerClient: SignerClient;
  /** Pinned API origin; only this origin is signed. Required. */
  readonly apiOrigin: string;
  /** Protection-space namespace; must match the loaded signer. Required. */
  readonly replayNamespace: string;
  /** Injected fetch (preferred name, matches task text). Defaults to global fetch. */
  readonly fetch?: typeof fetch;
  /** Alias for `fetch` (matches ATT-01 scaffold). At most one may be set. */
  readonly fetchFn?: typeof fetch;
  /** Signature header field. Defaults to `x-client-transaction-id`. */
  readonly headerName?: string;
  /** Body budget, default 1 MiB, hard cap 16 MiB. Must match server/parser limits. */
  readonly maxBodyBytes?: number;
  /** Bounded body-read deadline, default 5000 ms, allowed 1–60000 ms. */
  readonly bodyReadTimeoutMs?: number;
  /** Epoch-millisecond clock for per-attempt timestamps. Defaults to `Date.now`. */
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
    return globalFetch as typeof fetch;
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
  try {
    return new Request(snapshot.url, init);
  } catch (error) {
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

/**
 * Prepare one immutable request snapshot, sign the exact bytes sent, and
 * retry at most once on the pre-handler stale-key marker.
 *
 * See the module header for the full preparation/retry/composition contract.
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
  const initRecord = (init ?? {}) as RequestInit & { readonly body?: unknown };
  if (initRecord.body !== undefined && initRecord.body !== null) {
    assertSupportedBodyInit(initRecord.body);
  }
  if (typeof input === 'string') {
    if (input.length === 0) {
      throw new AttestationProtocolError('fetchWithAttestation input must be a non-empty URL or Request');
    }
  } else if (!(input instanceof Request) && !(input instanceof URL)) {
    throw new AttestationProtocolError('fetchWithAttestation input must be a URL, string, or Request');
  }
  if (input instanceof Request) {
    if ((input as { readonly bodyUsed?: unknown }).bodyUsed === true) {
      const overridingBody = initRecord.body !== undefined && initRecord.body !== null;
      if (!overridingBody) {
        throw new SignerClientError(
          'SIGNER_PREPARATION_FAILED',
          'Request body has already been used. Clone the Request before sending or pass a fresh body.',
        );
      }
    }
    try {
      const locked = (input as unknown as { readonly body?: { readonly locked?: boolean } }).body?.locked;
      if (locked === true && (initRecord.body === undefined || initRecord.body === null)) {
        throw new SignerClientError(
          'SIGNER_PREPARATION_FAILED',
          'Request body is locked. Clone the Request before sending or pass a fresh body.',
        );
      }
    } catch (error) {
      if (error instanceof SignerClientError) {
        throw error;
      }
      // Non-Request shapes fall through to construction-time validation.
    }
  }

  let base: Request;
  try {
    base = new Request(input as RequestInfo, (init ?? {}) as RequestInit);
  } catch (error) {
    if (error instanceof SignerClientError || error instanceof AttestationProtocolError) {
      throw error;
    }
    const message = error instanceof Error ? `: ${error.message}` : '';
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', `Request could not be prepared${message}.`);
  }

  // Origin pinning BEFORE any network or signature material. A rejected
  // external URL never sends Authorization or a signature.
  let requestOrigin: string;
  try {
    requestOrigin = new URL(base.url).origin;
  } catch {
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request URL is invalid.');
  }
  if (requestOrigin !== config.apiOrigin) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Request origin does not match the configured API origin. Signatures are only attached to the configured API origin.',
    );
  }

  // Identity-only body profile enforced before allocation/signing.
  assertAllowedContentEncoding(base.headers);

  if (base.signal?.aborted === true) {
    const reason = (base.signal as AbortSignal & { readonly reason?: unknown }).reason;
    if (reason !== undefined) {
      throw reason;
    }
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request was aborted before signing.');
  }

  // Materialize the serialized body ONCE. Both attempts reuse these exact
  // bytes plus the final content type, so a multipart boundary generated once
  // stays unchanged on retry.
  const bodyBytes = await materializeRequestBodyBytes(base, {
    maxBodyBytes: config.maxBodyBytes,
    signal: base.signal,
    timeoutMs: config.bodyReadTimeoutMs,
  });

  const snapshot = buildPreparedSnapshot(base, bodyBytes);

  async function signWithFreshProof(signerKeyIdCheck?: { readonly expectedOrigin: string }): Promise<{
    readonly transactionId: string;
    readonly observedKeyId: string;
  }> {
    void signerKeyIdCheck;
    const signer = await config.signerClient.getSigner();
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
    const timestampMs = checkedTimestampMs(config.now);
    const nonceHex = generateNonceHex();
    const bodyHashHex = await hashBodySha256Hex(snapshot.bodyBytes);
    const transactionId = await signer.sign({
      method: snapshot.method,
      requestTarget: snapshot.requestTarget,
      contentType: snapshot.contentType,
      bodyHashHex,
      timestampMs,
      nonceHex,
    });
    return { transactionId, observedKeyId: signer.keyId };
  }

  const first = await signWithFreshProof();
  const firstRequest = buildSignedRequest(snapshot, config.headerName, first.transactionId);
  // Network uncertainty and handler uncertainty never retry: each invocation
  // must regenerate its proof explicitly. Signed attempts use
  // `redirect: 'manual'`, so redirects are returned, not followed.
  const firstResponse = await config.fetchImpl(firstRequest);

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
  // Discard the stale response body without unbounded reads so the retry does
  // not leak the connection. The returned second response stays readable.
  try {
    await firstResponse.body?.cancel();
  } catch {
    // Cancel is best-effort.
  }

  let secondSignerTransaction: { readonly transactionId: string; readonly observedKeyId: string };
  try {
    secondSignerTransaction = await signWithFreshProof();
  } catch {
    // Reload failure stops: return the first stale response rather than
    // manufacturing a second attempt without a fresh proof.
    return firstResponse;
  }
  if (secondSignerTransaction.transactionId === first.transactionId) {
    // Defensive: proofs must never be reused across attempts. A repeated
    // envelope indicates a clock/nonce failure; return the first response.
    return firstResponse;
  }
  const secondRequest = buildSignedRequest(snapshot, config.headerName, secondSignerTransaction.transactionId);
  // A second stale challenge stops: no further automatic retries.
  return config.fetchImpl(secondRequest);
}
