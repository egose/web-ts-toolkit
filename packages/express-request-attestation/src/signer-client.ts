/**
 * ATT-06 generation-aware ESM signer client (task sections 4.1/4.6).
 *
 * Browser-safe ONLY: no Node built-ins, Express/Redis types, `Buffer`,
 * `NodeJS`, or `node:*` imports. Part of the `./signer` closure typechecked
 * by `tsconfig.signer-browser.json` (`types: []`).
 *
 * - `fetchSignerBundle({ metadataUrl, apiOrigin, replayNamespace, fetch?,
 *   loadModule?, signal? })` fetches bounded discovery metadata
 *   (`4096`-byte cap) with noncached, credential-omitting, redirect-rejecting
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
 *   old key never evicts a newer signer. `dispose()` is terminal. Failure
 *   clears the rejected load so a later explicit call can recover. A late
 *   old-generation result never installs. One metadata-to-module retirement
 *   race may refetch discovery once; repeated failure stops. Timeout/abort
 *   stops waiting; native import evaluation is not cancellable, so late
 *   results are discarded without claiming rollback of module execution.
 * - Runtime module-cache retention is documented: invalidation cannot erase
 *   the browser module cache or guarantee immediate key deletion from RAM.
 *   Publicly distributed HMAC material remains accessible to every caller.
 *
 * No storage API, cookies, DOM mutation, global network patch, import-time
 * requests, or polling timers. One-shot load timeouts use a single
 * `setTimeout` per load with cleanup (`sideEffects: false` still holds:
 * timers exist only while a load is in flight).
 */

import { AttestationProtocolError, PROTOCOL_VERSION } from './shared/types.js';
import type { RequestSigner } from './shared/types.js';
import { validateKeyId, validatePublicOrigin, validateReplayNamespace } from './shared/codec.js';
import { utf8ByteLength, utf8Decode } from './shared/canonical.js';
import { SignerClientError } from './client-errors.js';

/** Bounded discovery metadata body: at most 4096 UTF-8 bytes. */
export const SIGNER_METADATA_BYTE_CAP = 4096 as const;

/** Default bound for one `getSigner()` load (metadata + import + one refetch). */
export const DEFAULT_SIGNER_LOAD_TIMEOUT_MS = 5000 as const;

const MIN_SIGNER_LOAD_TIMEOUT_MS = 1 as const;
const MAX_SIGNER_LOAD_TIMEOUT_MS = 60000 as const;

/** Distributed-module shape: a module exports `signer`, nothing else trusted. */
export interface SignerModule {
  readonly signer: RequestSigner;
}

/** Typed native ESM loader. Tests/host bundlers inject a fixture loader. */
export type SignerModuleLoader = (moduleUrl: string) => Promise<SignerModule>;

/** Options for `fetchSignerBundle` (single metadata + import attempt). */
export interface FetchSignerBundleOptions {
  readonly metadataUrl: string;
  readonly apiOrigin: string;
  readonly replayNamespace: string;
  readonly fetch?: typeof fetch;
  readonly loadModule?: SignerModuleLoader;
  readonly signal?: AbortSignal;
}

/** Options for `createSignerClient`. */
export interface SignerClientOptions {
  readonly metadataUrl: string;
  readonly apiOrigin: string;
  readonly replayNamespace: string;
  readonly fetch?: typeof fetch;
  readonly loadModule?: SignerModuleLoader;
  readonly loadTimeoutMs?: number;
}

/** Minimal owned signer-client surface. */
export interface SignerClient {
  getSigner(): Promise<RequestSigner>;
  invalidate(observedKeyId: string): void;
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
    return globalFetch as typeof fetch;
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

async function readBoundedMetadataDocument(response: Response, fetchImplName: string): Promise<unknown> {
  void fetchImplName;
  let bytes: Uint8Array | null = null;
  let text: string | null = null;
  if (typeof response.arrayBuffer === 'function') {
    let buffer: ArrayBuffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (error) {
      if (error instanceof SignerClientError) {
        throw error;
      }
      const name = (error as { readonly name?: unknown }).name;
      if (name === 'AbortError' || (response as { readonly signal?: unknown }).signal !== undefined) {
        throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer discovery was aborted.');
      }
      throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata fetch failed.');
    }
    const view = new Uint8Array(buffer);
    if (view.byteLength > SIGNER_METADATA_BYTE_CAP) {
      throw new SignerClientError(
        'SIGNER_LOAD_FAILED',
        `Signer metadata exceeds the ${SIGNER_METADATA_BYTE_CAP}-byte cap.`,
      );
    }
    bytes = view;
  } else if (typeof response.text === 'function') {
    try {
      text = await response.text();
    } catch {
      throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata fetch failed.');
    }
    if (utf8ByteLength(text) > SIGNER_METADATA_BYTE_CAP) {
      throw new SignerClientError(
        'SIGNER_LOAD_FAILED',
        `Signer metadata exceeds the ${SIGNER_METADATA_BYTE_CAP}-byte cap.`,
      );
    }
  } else {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata response is unreadable.');
  }
  let raw: string;
  if (text !== null) {
    raw = text;
  } else {
    try {
      raw = utf8Decode(bytes as Uint8Array);
    } catch {
      throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata is not valid UTF-8.');
    }
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata is not valid JSON.');
  }
}

function validateMetadataDocument(
  document: unknown,
  expected: { readonly apiOrigin: string; readonly replayNamespace: string },
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
    signerUrl: record['signerUrl'] as string,
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

async function fetchMetadataDocument(config: ValidatedBundleConfig): Promise<ValidatedMetadata> {
  if (config.signal?.aborted) {
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer discovery was aborted.');
  }
  let response: Response;
  try {
    response = await config.fetchImpl(config.metadataUrl, {
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
    throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer metadata fetch failed.');
  }
  const document = await readBoundedMetadataDocument(response, 'fetch');
  return validateMetadataDocument(document, {
    apiOrigin: config.apiOrigin,
    replayNamespace: config.replayNamespace,
  });
}

async function importValidatedModule(
  config: ValidatedBundleConfig,
  metadata: ValidatedMetadata,
): Promise<SignerModule> {
  const moduleUrl = resolveSignerModuleUrl(metadata.signerUrl, config.metadataUrl, config.apiOrigin);
  let candidate: unknown;
  try {
    candidate = (await config.loadModule(moduleUrl)) as unknown;
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
 * Bounded discovery fetch plus native dynamic import (single attempt, no
 * retirement refetch). Use `createSignerClient` when the one allowed
 * metadata-to-module retirement refetch is required.
 */
export async function fetchSignerBundle(options: FetchSignerBundleOptions): Promise<SignerModule> {
  const config = validateBundleConfig(options);
  const metadata = await fetchMetadataDocument(config);
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

/** Create the generation-aware single-flight signer client. */
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
      if (second.keyId === first.keyId) {
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

    const tracked = raced.then(
      (signer) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        if (disposed || myGeneration !== generation) {
          throw new SignerClientError('SIGNER_LOAD_FAILED', 'Signer load was superseded.');
        }
        active = signer;
        if (pending === tracked) {
          pending = null;
        }
        currentAborter = null;
        return signer;
      },
      (error: unknown) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        if (pending === tracked) {
          pending = null;
        }
        // Timeout already aborted the fetch; a late import settlement is
        // discarded by the generation check above (or by the race having
        // already rejected). Never claim rollback of module execution.
        if (error instanceof SignerClientError && error.code === 'SIGNER_LOAD_TIMEOUT') {
          generation += 1;
        }
        currentAborter = null;
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
      if (typeof observedKeyId !== 'string' || observedKeyId.length === 0) {
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
        active = null;
        // Bump so any old in-flight load (started before this invalidation)
        // cannot install after it settles. Pending is null while active
        // exists, but clear defensively.
        generation += 1;
        pending = null;
        return;
      }
      // No active signer: discard any old in-flight load so the next
      // getSigner starts fresh. Existing waiters keep their old promise,
      // which discards on settlement via the generation check. This is what
      // makes late old-generation results unable to install after
      // invalidation/disposal.
      generation += 1;
      pending = null;
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      active = null;
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
