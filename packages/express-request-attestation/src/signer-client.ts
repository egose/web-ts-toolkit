/**
 * Generation-aware ESM signer discovery and loading.
 *
 * Browser-safe: import from `@web-ts-toolkit/express-request-attestation/signer`.
 * Requires standard Fetch/byte-stream APIs; no server dependencies or Node types.
 *
 * - `fetchSignerBundle({ metadataUrl, apiOrigin, replayNamespace, fetch?,
 *   loadModule?, signal? })` fetches bounded discovery metadata
 *   (`4096`-byte incremental cap, 5000 ms response-body read deadline) with
 *   noncached, credential-omitting, redirect-rejecting
 *   defaults, validates origin/namespace/version, resolves the key-specific
 *   asset URL against the metadata location, and loads it through native
 *   dynamic `import()` (default) or an injectable typed loader. No `eval`,
 *   `new Function`, Blob-script workaround, or global `<script>` callback.
 *   Native import follows browser module rules; the helper cannot intercept
 *   its redirect chain, so the asset router must not redirect modules to
 *   other origins and the host CSP must scope executable origins.
 * - `createSignerClient({ metadataUrl, apiOrigin, replayNamespace, fetch?,
 *   loadModule?, loadTimeoutMs? })` owns at most one active signer and one
 *   in-flight load (single-flight within this context, no cross-tab claim).
 *   `invalidate(observedKeyId)` is generation-aware: a late rejection for an
 *   old key never evicts a newer signer or its pending replacement, including
 *   challenges from multiple rotations ago. `dispose()` is terminal.
 *   Failure clears the rejected load so a later explicit call can recover. A late
 *   old-generation result never installs. One metadata-to-module retirement
 *   race may refetch discovery once; a changed validated module URL can recover
 *   even under the same key ID, while unchanged identity/repeated failure stops.
 *   Timeout stops waiting; disposal signals current metadata cancellation and
 *   prevents late installation. Native import evaluation is not cancellable,
 *   so discarding late results does not roll back module execution.
 * - Runtime module-cache retention is documented: invalidation cannot erase
 *   the browser module cache or guarantee immediate key deletion from RAM.
 *   Publicly distributed HMAC material remains accessible to every caller.
 *
 * No storage API, cookies, DOM mutation, global network patch, import-time
 * requests, or polling timers. Load/read deadlines and the reader's cooperative
 * yield timer exist only during the operation and are cleaned up on settlement.
 */

import { AttestationProtocolError, PROTOCOL_VERSION } from './shared/types.js';
import type { RequestSigner } from './shared/types.js';
import { validateKeyId, validatePublicOrigin, validateReplayNamespace } from './shared/codec.js';
import { utf8Decode } from './shared/canonical.js';
import { SignerClientError } from './client-errors.js';
import { readBoundedByteStream } from './bounded-byte-stream.js';

/** Bounded discovery metadata body: at most 4096 UTF-8 bytes. */
export const SIGNER_METADATA_BYTE_CAP = 4096 as const;

/** Default bound for one `getSigner()` load (metadata + import + one refetch). */
export const DEFAULT_SIGNER_LOAD_TIMEOUT_MS = 5000 as const;

/** Standalone discovery body consumption only; the client owns its whole-load deadline. */
const SIGNER_METADATA_READ_TIMEOUT_MS = 5000;

const MIN_SIGNER_LOAD_TIMEOUT_MS = 1 as const;
const MAX_SIGNER_LOAD_TIMEOUT_MS = 60000 as const;

/** Distributed-module shape: a module exports `signer`, nothing else trusted. */
export interface SignerModule {
  readonly signer: RequestSigner;
}

/** Loads a validated absolute module URL; defaults to native dynamic import, whose execution is not cancellable. */
export type SignerModuleLoader = (moduleUrl: string) => Promise<SignerModule>;

/**
 * Options for one discovery/import attempt. Metadata must have a readable byte
 * stream (standard `Response`); whole-value-only fetch substitutes are rejected.
 * Body consumption is capped at 4096 bytes and 5000 ms after the response arrives.
 * This deadline excludes waiting for headers and module import/evaluation.
 */
export interface FetchSignerBundleOptions {
  /** Absolute metadata URL on `apiOrigin`, without userinfo; typically `/attestation/signer-meta` at that origin. */
  readonly metadataUrl: string;
  /** Pinned canonical HTTPS origin (loopback HTTP allowed); metadata and module origins must match. */
  readonly apiOrigin: string;
  /** Expected namespace, matching both verifier and imported signer. */
  readonly replayNamespace: string;
  /** Default global fetch; called with no-store/omit/error and must return a readable byte-stream Response. */
  readonly fetch?: typeof fetch;
  /** Default native dynamic import; receives a validated absolute `.mjs` URL. Host owns module CORS/CSP. */
  readonly loadModule?: SignerModuleLoader;
  /** Signals cancellation to discovery fetch/body reading, not native module evaluation. */
  readonly signal?: AbortSignal;
}

/** Pinned discovery configuration for a caller-owned, single-flight signer client. */
export interface SignerClientOptions {
  /** Absolute discovery URL on `apiOrigin`, without userinfo; usually `${apiOrigin}/attestation/signer-meta`. */
  readonly metadataUrl: string;
  /** Canonical API origin, identical to the server's configured `publicOrigin`. */
  readonly apiOrigin: string;
  /** Pinned protection-space namespace. Recreate/reconfigure clients when migrating namespaces. */
  readonly replayNamespace: string;
  /** Default global fetch; discovery omits credentials, rejects redirects, and requires a byte-stream Response. */
  readonly fetch?: typeof fetch;
  /** Default native dynamic import. Timeout/disposal stops waiting or installation, not module execution/cache. */
  readonly loadModule?: SignerModuleLoader;
  /**
   * Whole load: headers, body reads, import, and one retirement refetch.
   * Default 5000 ms; integer range 1–60000. Expiry is SIGNER_LOAD_TIMEOUT.
   * There is no additional standalone 5000 ms body deadline inside client loads.
   */
  readonly loadTimeoutMs?: number;
}

/** One active signer and one current pending load per client; no cross-tab sharing. */
export interface SignerClient {
  /** Cached or shared current load. A later call can recover after failure; a disposed client throws SIGNER_LOAD_FAILED. */
  getSigner(): Promise<RequestSigner>;
  /**
   * Invalidate the observed installed key, or supersede an initial load. A
   * different active key and malformed IDs are ignored. Pending replacements
   * and their explicit recovery coalesce challenges from any older issued key,
   * including multiple rotations behind. An installed same-key signer can be
   * invalidated again. The next `getSigner()` starts/shares the replacement.
   */
  invalidate(observedKeyId: string): void;
  /** Terminal and idempotent: signals current metadata cancellation and prevents late installation; native import/cache persists. */
  dispose(): void;
}

const FETCH_BUNDLE_OPTION_KEYS: ReadonlySet<string> = new Set([
  'metadataUrl',
  'apiOrigin',
  'replayNamespace',
  'fetch',
  'loadModule',
  'signal',
]);

const SIGNER_CLIENT_OPTION_KEYS: ReadonlySet<string> = new Set([
  'metadataUrl',
  'apiOrigin',
  'replayNamespace',
  'fetch',
  'loadModule',
  'loadTimeoutMs',
]);

interface ValidatedBundleConfig {
  readonly metadataUrl: string;
  readonly apiOrigin: string;
  readonly replayNamespace: string;
  readonly fetchImpl: typeof fetch;
  readonly loadModule: SignerModuleLoader;
  readonly signal: AbortSignal | undefined;
}

interface ValidatedMetadata {
  readonly version: 1;
  readonly keyId: string;
  /** Absolute module URL, validated against the configured metadata/API origin. */
  readonly signerUrl: string;
  readonly publicOrigin: string;
  readonly replayNamespace: string;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname);
}

function resolveFetch(candidate: unknown): typeof fetch {
  if (candidate === undefined) {
    const globalFetch = (globalThis as unknown as { readonly fetch?: unknown }).fetch;
    if (typeof globalFetch !== 'function') {
      throw new SignerClientError(
        'SIGNER_PREPARATION_FAILED',
        'fetch is unavailable. Signer discovery requires a fetch implementation.',
      );
    }
    // Native Window.fetch rejects the configuration object as its receiver.
    return (globalFetch as typeof fetch).bind(globalThis);
  }
  if (typeof candidate !== 'function') {
    throw new AttestationProtocolError('signer client fetch must be a function');
  }
  return candidate as typeof fetch;
}

function resolveLoadModule(candidate: unknown): SignerModuleLoader {
  if (candidate === undefined) {
    const loader: SignerModuleLoader = (moduleUrl: string) => import(moduleUrl) as Promise<SignerModule>;
    return loader;
  }
  if (typeof candidate !== 'function') {
    throw new AttestationProtocolError('signer client loadModule must be a function');
  }
  return candidate as SignerModuleLoader;
}

function validateApiOrigin(value: unknown): string {
  validatePublicOrigin(value);
  return value as string;
}

function validateMetadataUrl(value: unknown, apiOrigin: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AttestationProtocolError('metadataUrl must be a non-empty string');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AttestationProtocolError('metadataUrl must be an absolute URL');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer metadata URL must not contain userinfo.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer metadata URL must use http or https.');
  }
  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Signer metadata http URL is allowed only for loopback development.',
    );
  }
  let expected: URL;
  try {
    expected = new URL(apiOrigin);
  } catch {
    throw new AttestationProtocolError('apiOrigin must be a valid origin');
  }
  if (parsed.origin !== expected.origin) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Signer metadata URL origin does not match the configured API origin.',
    );
  }
  return value;
}

function validateLoadTimeoutMs(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_SIGNER_LOAD_TIMEOUT_MS;
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < MIN_SIGNER_LOAD_TIMEOUT_MS ||
    value > MAX_SIGNER_LOAD_TIMEOUT_MS
  ) {
    throw new AttestationProtocolError(
      `loadTimeoutMs must be a safe integer in [${MIN_SIGNER_LOAD_TIMEOUT_MS}, ${MAX_SIGNER_LOAD_TIMEOUT_MS}]`,
    );
  }
  return value;
}

function validateBundleConfig(options: FetchSignerBundleOptions): ValidatedBundleConfig {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('fetchSignerBundle options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!FETCH_BUNDLE_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown fetchSignerBundle option ${key}`);
    }
  }
  const apiOrigin = validateApiOrigin(options.apiOrigin);
  validateReplayNamespace(options.replayNamespace);
  const replayNamespace = options.replayNamespace;
  const metadataUrl = validateMetadataUrl(options.metadataUrl, apiOrigin);
  const fetchImpl = resolveFetch(options.fetch);
  const loadModule = resolveLoadModule(options.loadModule);
  const signal = options.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new AttestationProtocolError('fetchSignerBundle signal must be an AbortSignal');
  }
  return { metadataUrl, apiOrigin, replayNamespace, fetchImpl, loadModule, signal };
}

/**
 * Resolve and validate the key-specific asset URL against the metadata
 * location. Rejects userinfo, unexpected origins/schemes/paths, fragments,
 * and non-module targets. The pathname must end in `.mjs` so arbitrary JS
 * text or non-module URLs cannot be selected.
 */
function resolveSignerModuleUrl(signerUrl: unknown, metadataUrl: string, apiOrigin: string): string {
  if (typeof signerUrl !== 'string' || signerUrl.length === 0) {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer metadata signerUrl must be a non-empty string.');
  }
  let resolved: URL;
  try {
    resolved = new URL(signerUrl, metadataUrl);
  } catch {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer module URL is not a valid URL.');
  }
  if (resolved.username !== '' || resolved.password !== '') {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer module URL must not contain userinfo.');
  }
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer module URL must use http or https.');
  }
  if (resolved.protocol === 'http:' && !isLoopbackHostname(resolved.hostname)) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Signer module http URL is allowed only for loopback development.',
    );
  }
  let expected: URL;
  try {
    expected = new URL(apiOrigin);
  } catch {
    throw new AttestationProtocolError('apiOrigin must be a valid origin');
  }
  if (resolved.origin !== expected.origin) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Signer module origin does not match the configured API origin.',
    );
  }
  if (!resolved.pathname.endsWith('.mjs')) {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer module URL must target a .mjs module path.');
  }
  if (resolved.hash !== '') {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer module URL must not contain a fragment.');
  }
  return resolved.href;
}

async function readBoundedMetadataDocument(
  response: Response,
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): Promise<unknown> {
  const body = response.body;
  if (body === undefined || (body !== null && typeof body.getReader !== 'function')) {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata response is unreadable.');
  }
  const bytes =
    body === null
      ? new Uint8Array(0)
      : await readBoundedByteStream(body, {
          maxBytes: SIGNER_METADATA_BYTE_CAP,
          signal,
          timeoutMs,
          error(failure, cause) {
            switch (failure) {
              case 'abort':
                return new SignerClientError('SIGNER_LOAD_FAILED', 'Signer discovery was aborted.');
              case 'limit':
                return new SignerClientError(
                  'SIGNER_LOAD_FAILED',
                  `Signer metadata exceeds the ${SIGNER_METADATA_BYTE_CAP}-byte cap.`,
                );
              case 'timeout':
                return new SignerClientError(
                  'SIGNER_LOAD_FAILED',
                  `Signer metadata body read timed out after ${timeoutMs} ms.`,
                );
              case 'locked':
              case 'chunk':
                return new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata response is unreadable.');
              case 'read':
                if (cause instanceof SignerClientError) return cause;
                if ((cause as { readonly name?: unknown } | null)?.name === 'AbortError') {
                  return new SignerClientError('SIGNER_LOAD_FAILED', 'Signer discovery was aborted.');
                }
                return new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata fetch failed.');
            }
          },
        });
  let raw: string;
  try {
    raw = utf8Decode(bytes);
  } catch {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata is not valid UTF-8.');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata is not valid JSON.');
  }
}

function validateMetadataDocument(
  document: unknown,
  expected: { readonly apiOrigin: string; readonly replayNamespace: string; readonly metadataUrl: string },
): ValidatedMetadata {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata must be a JSON object.');
  }
  const record = document as Record<string, unknown>;
  if (record['version'] !== PROTOCOL_VERSION) {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Signer metadata version must be 1.');
  }
  try {
    validateKeyId(record['keyId']);
  } catch {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Signer metadata keyId is invalid.');
  }
  if (typeof record['signerUrl'] !== 'string' || (record['signerUrl'] as string).length === 0) {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer metadata signerUrl is invalid.');
  }
  try {
    validatePublicOrigin(record['publicOrigin']);
  } catch {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer metadata publicOrigin is invalid.');
  }
  try {
    validateReplayNamespace(record['replayNamespace']);
  } catch {
    throw new SignerClientError('SIGNER_ORIGIN_MISMATCH', 'Signer metadata replayNamespace is invalid.');
  }
  if ((record['publicOrigin'] as string) !== expected.apiOrigin) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Signer metadata origin does not match the configured API origin.',
    );
  }
  if ((record['replayNamespace'] as string) !== expected.replayNamespace) {
    throw new SignerClientError(
      'SIGNER_ORIGIN_MISMATCH',
      'Signer metadata namespace does not match the configured replay namespace.',
    );
  }
  return {
    version: 1,
    keyId: record['keyId'] as string,
    signerUrl: resolveSignerModuleUrl(record['signerUrl'], expected.metadataUrl, expected.apiOrigin),
    publicOrigin: record['publicOrigin'] as string,
    replayNamespace: record['replayNamespace'] as string,
  };
}

/**
 * Runtime-validate an imported module. Rejects JS source strings, extra
 * key-fetch modes (`signSource`), and malformed signers. The signer's
 * version/key/protection space must match discovery metadata exactly.
 */
function validateSignerModule(candidate: unknown, metadata: ValidatedMetadata): SignerModule {
  if (typeof candidate === 'string') {
    throw new SignerClientError(
      'SIGNER_MODULE_INVALID',
      'Signer module must be an ESM namespace with a signer export, not a JS source string.',
    );
  }
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Signer module namespace is invalid.');
  }
  const record = candidate as Record<string, unknown>;
  if ('signSource' in record) {
    throw new SignerClientError(
      'SIGNER_MODULE_INVALID',
      'Signer module must export signer without evaluated source strings.',
    );
  }
  const signer = record['signer'];
  if (signer === null || typeof signer !== 'object' || Array.isArray(signer)) {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Signer module must export a signer object.');
  }
  const entry = signer as Record<string, unknown>;
  if (entry['version'] !== PROTOCOL_VERSION) {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer version must be 1.');
  }
  try {
    validateKeyId(entry['keyId']);
  } catch {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer keyId is invalid.');
  }
  try {
    validatePublicOrigin(entry['publicOrigin']);
  } catch {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer origin is invalid.');
  }
  try {
    validateReplayNamespace(entry['replayNamespace']);
  } catch {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer namespace is invalid.');
  }
  if ((entry['keyId'] as string) !== metadata.keyId) {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer key does not match discovery metadata.');
  }
  if ((entry['publicOrigin'] as string) !== metadata.publicOrigin) {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer origin does not match discovery metadata.');
  }
  if ((entry['replayNamespace'] as string) !== metadata.replayNamespace) {
    throw new SignerClientError(
      'SIGNER_MODULE_INVALID',
      'Imported signer namespace does not match discovery metadata.',
    );
  }
  if (typeof entry['sign'] !== 'function') {
    throw new SignerClientError('SIGNER_MODULE_INVALID', 'Imported signer sign function is invalid.');
  }
  return { signer: signer as RequestSigner };
}

async function fetchMetadataDocument(
  config: ValidatedBundleConfig,
  readTimeoutMs?: number,
): Promise<ValidatedMetadata> {
  if (config.signal?.aborted) {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer discovery was aborted.');
  }
  let response: Response;
  try {
    // Injected transports own their binding; never supply internal config as `this`.
    const fetchImpl = config.fetchImpl;
    response = await fetchImpl(config.metadataUrl, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      ...(config.signal === undefined ? {} : { signal: config.signal }),
    });
  } catch (error) {
    if (error instanceof SignerClientError) {
      throw error;
    }
    const name = (error as { readonly name?: unknown }).name;
    if (name === 'AbortError' || config.signal?.aborted) {
      throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer discovery was aborted.');
    }
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata fetch failed.');
  }
  if (response.ok !== true) {
    // No Response escapes this boundary. Discard its body without reading an
    // arbitrary error payload or letting producer cleanup delay the fixed error.
    try {
      void response.body?.cancel().catch(() => undefined);
    } catch {
      // A synchronous cancellation fault must not replace the discovery failure.
    }
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata fetch failed.');
  }
  const document = await readBoundedMetadataDocument(response, config.signal, readTimeoutMs);
  return validateMetadataDocument(document, {
    apiOrigin: config.apiOrigin,
    replayNamespace: config.replayNamespace,
    metadataUrl: config.metadataUrl,
  });
}

async function importValidatedModule(
  config: ValidatedBundleConfig,
  metadata: ValidatedMetadata,
): Promise<SignerModule> {
  let candidate: unknown;
  try {
    candidate = (await config.loadModule(metadata.signerUrl)) as unknown;
  } catch (error) {
    if (error instanceof SignerClientError) {
      throw error;
    }
    const name = (error as { readonly name?: unknown }).name;
    if (name === 'AbortError' || config.signal?.aborted) {
      throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer module load was aborted.');
    }
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer module import failed.');
  }
  return validateSignerModule(candidate, metadata);
}

/**
 * Incremental discovery (4096 bytes, fixed 5000 ms body-read deadline after
 * the response arrives), then native dynamic import. Exceeding the cap/deadline
 * or aborting discovery cancels its reader without awaiting producer cleanup
 * and rejects with `SignerClientError` (`SIGNER_LOAD_FAILED`).
 * Non-OK discovery responses discard their bodies without reading error payloads
 * or awaiting cancellation, preserving the fixed metadata-fetch failure.
 *
 * The read deadline excludes the wait for response headers and module import.
 * Use `signal` to abort native discovery fetch/read; it cannot cancel native
 * module evaluation. Use `createSignerClient` for a configurable whole-load
 * waiting bound and the one allowed metadata-to-module retirement refetch.
 * Discovery defaults to global fetch with no-store/omit/error; module loading
 * defaults to native dynamic import. Metadata and module must match the pinned
 * API origin, namespace, version, and key. Native module CORS/CSP/cache rules
 * apply independently of the discovery fetch options.
 */
export async function fetchSignerBundle(options: FetchSignerBundleOptions): Promise<SignerModule> {
  const config = validateBundleConfig(options);
  const metadata = await fetchMetadataDocument(config, SIGNER_METADATA_READ_TIMEOUT_MS);
  return importValidatedModule(config, metadata);
}

function isRetirementRetryCandidate(error: unknown): boolean {
  // Only module-phase failures qualify for the single discovery refetch:
  // import transport failure or module validation against stale metadata.
  // Metadata-phase failures (oversized, origin mismatch on discovery itself,
  // malformed JSON) never refetch.
  if (!(error instanceof SignerClientError)) {
    return false;
  }
  return error.code === 'SIGNER_LOAD_FAILED' || error.code === 'SIGNER_MODULE_INVALID';
}

/**
 * Create a caller-owned, generation-aware single-flight signer client. No I/O
 * starts until `getSigner()`. One active signer and one current pending load
 * are retained; concurrent callers share that load. Replacement/recovery is
 * preserved across stale challenges from any older issued key, including
 * multiple rotations behind. No historical key map or cross-tab state is kept.
 *
 * `loadTimeoutMs` bounds the whole headers/body/import/refetch wait (default
 * 5000 ms, integer range 1–60000); expiry rejects with SIGNER_LOAD_TIMEOUT.
 * Module-phase failure may refetch discovery once and reload only when the
 * validated `(keyId, absolute module URL)` changes, including a same-key URL
 * change. Unchanged identity or a second module failure ends that load.
 * A later explicit `getSigner()` can recover after failure.
 *
 * `dispose()` is terminal and signals the current metadata fetch. Obsolete
 * settlements cannot install a signer or alter its replacement. Timeout and
 * disposal cannot cancel native module execution or erase its cache. This
 * client loads public material; it does not authenticate a user or session.
 */
export function createSignerClient(options: SignerClientOptions): SignerClient {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('signer client options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!SIGNER_CLIENT_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown signer client option ${key}`);
    }
  }
  const apiOrigin = validateApiOrigin(options.apiOrigin);
  validateReplayNamespace(options.replayNamespace);
  const replayNamespace = options.replayNamespace;
  const metadataUrl = validateMetadataUrl(options.metadataUrl, apiOrigin);
  const fetchImpl = resolveFetch(options.fetch);
  const loadModule = resolveLoadModule(options.loadModule);
  const loadTimeoutMs = validateLoadTimeoutMs(options.loadTimeoutMs);

  let active: RequestSigner | null = null;
  let pending: Promise<RequestSigner> | null = null;
  let pendingGeneration = 0;
  let generation = 0;
  let disposed = false;
  let currentAborter: AbortController | null = null;
  // Further challenges cannot identify a newer signer until one installs.
  // Retain only this phase across failed loads, not a history of retired keys.
  let awaitingReplacement = false;

  function throwIfDisposed(): void {
    if (disposed) {
      throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer client is disposed.');
    }
  }

  async function loadWithSingleRetirement(signal: AbortSignal): Promise<RequestSigner> {
    const base: ValidatedBundleConfig = {
      metadataUrl,
      apiOrigin,
      replayNamespace,
      fetchImpl,
      loadModule,
      signal,
    };
    const first = await fetchMetadataDocument(base);
    try {
      const module = await importValidatedModule(base, first);
      return module.signer;
    } catch (importError) {
      if (!isRetirementRetryCandidate(importError)) {
        throw importError;
      }
      if (signal.aborted) {
        throw importError;
      }
      const second = await fetchMetadataDocument(base);
      if (second.keyId === first.keyId && second.signerUrl === first.signerUrl) {
        throw importError;
      }
      if (signal.aborted) {
        throw importError;
      }
      const module = await importValidatedModule(base, second);
      return module.signer;
    }
  }

  function startLoad(): Promise<RequestSigner> {
    const myGeneration = generation;
    pendingGeneration = myGeneration;
    const aborter = new AbortController();
    currentAborter = aborter;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        try {
          aborter.abort();
        } catch {
          // Abort is best-effort; the race below still rejects with timeout.
        }
        reject(new SignerClientError('SIGNER_LOAD_TIMEOUT', 'Signer load timed out.'));
      }, loadTimeoutMs);
      const handle = timer as unknown as { readonly unref?: unknown };
      if (typeof handle.unref === 'function') {
        (handle.unref as () => void)();
      }
    });

    const actual = loadWithSingleRetirement(aborter.signal);

    const raced = Promise.race([actual, timeout]) as Promise<RequestSigner>;
    // Attach a discard handler to the non-winning branch so its late
    // settlement never becomes an unhandled rejection and never installs.
    actual.then(
      () => undefined,
      () => undefined,
    );

    function releaseLoad(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (pending === tracked) {
        pending = null;
      }
      if (currentAborter === aborter) {
        currentAborter = null;
      }
    }

    const tracked = raced.then(
      (signer) => {
        const ownsGeneration = pending === tracked && myGeneration === generation;
        releaseLoad();
        if (disposed || !ownsGeneration) {
          throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer load was superseded.');
        }
        active = signer;
        awaitingReplacement = false;
        return signer;
      },
      (error: unknown) => {
        const ownsGeneration = pending === tracked && myGeneration === generation;
        releaseLoad();
        // Timeout already aborted the fetch; a late import settlement is
        // discarded by the settled race. An obsolete timeout must not advance
        // a replacement's generation or release its abort controller.
        if (ownsGeneration && error instanceof SignerClientError && error.code === 'SIGNER_LOAD_TIMEOUT') {
          generation += 1;
        }
        throw error;
      },
    );
    pending = tracked;
    return tracked;
  }

  const client: SignerClient = {
    getSigner(): Promise<RequestSigner> {
      throwIfDisposed();
      if (active !== null) {
        return Promise.resolve(active);
      }
      if (pending !== null && pendingGeneration === generation) {
        return pending;
      }
      if (pending !== null && pendingGeneration !== generation) {
        pending = null;
      }
      return startLoad();
    },

    invalidate(observedKeyId: string): void {
      if (disposed) {
        return;
      }
      try {
        validateKeyId(observedKeyId);
      } catch {
        return;
      }
      if (active !== null) {
        let matches: boolean;
        try {
          matches = active.keyId === observedKeyId;
        } catch {
          return;
        }
        if (!matches) {
          // Late rejection for an old key must never evict a newer active
          // signer. No generation bump: there is no pending load to discard
          // while an active signer exists (getSigner returns active
          // directly), so preserving the generation is both safe and avoids
          // needless reloads.
          return;
        }
      } else if (awaitingReplacement) {
        // No newer signer has been issued since the previous invalidation.
        // Even challenges from older rotations join the relevant replacement,
        // including explicit recovery after a failed replacement attempt.
        return;
      }
      active = null;
      awaitingReplacement = true;
      // Supersede only this invalidation's load. Its existing waiters keep their
      // promise; late settlement cannot install or mutate a replacement load.
      generation += 1;
      pending = null;
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      active = null;
      awaitingReplacement = false;
      generation += 1;
      try {
        currentAborter?.abort();
      } catch {
        // Best-effort abort; pending discards via the disposed flag.
      }
      currentAborter = null;
      pending = null;
    },
  };

  return Object.freeze(client);
}
