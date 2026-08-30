/**
 * Encoding — bounded Base64 data URL generation from file paths and byte inputs.
 *
 * - Async uses async I/O throughout; sync uses sync I/O throughout.
 * - Per-asset and total-byte limits are validated before large Base64 allocation.
 * - Honors AbortSignal between stages.
 * - Generates RFC2397 `data:<mediaType>;base64,<payload>` without charset.
 * - Returns immutable EncodedAsset.
 */

import fs from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AssetInput, EncodedAsset, EncodeOptions } from './types.ts';
import { createDefinitionRegistry } from './definitions.ts';
import type { AssetDefinitionRegistry } from './definitions.ts';
import { InvalidOptionsError, ResourceLimitError, FilesystemError } from './errors.ts';
import { resolveByExtension, resolveWithDetector, defaultDetector } from './detect.ts';
import type { AssetDetector } from './detect.ts';
import { validatePolicyOptions, DEFAULT_MAX_ASSET_BYTES, DEFAULT_MAX_TOTAL_BYTES } from './policy.ts';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateLimits(options: EncodeOptions): void {
  validatePolicyOptions({
    maxAssetBytes: options.maxAssetBytes,
    maxTotalBytes: options.maxTotalBytes,
  });
  if (options.registry !== undefined && options.definitions !== undefined) {
    throw new InvalidOptionsError('Provide either registry or definitions, not both');
  }
  if (options.registry !== undefined) {
    const r: unknown = options.registry;
    if (
      r === null ||
      typeof r !== 'object' ||
      !Array.isArray((r as { definitions?: unknown }).definitions) ||
      typeof (r as { get?: unknown }).get !== 'function'
    ) {
      throw new InvalidOptionsError(
        'EncodeOptions.registry must be an AssetDefinitionRegistry from createDefinitionRegistry',
      );
    }
  }
  if (options.detection !== undefined && !['extension', 'content', 'verify'].includes(options.detection)) {
    throw new InvalidOptionsError(
      `Invalid detection mode "${String(options.detection)}" — expected 'extension' | 'content' | 'verify'`,
    );
  }
  if (options.detector !== undefined) {
    const d: unknown = options.detector;
    if (d === null || typeof d !== 'object' || typeof (d as { detect?: unknown }).detect !== 'function') {
      throw new InvalidOptionsError(
        'EncodeOptions.detector must be an AssetDetector with async detect(bytes, signal?) method',
      );
    }
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
  } else if (signal.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

function getRegistry(options: EncodeOptions): AssetDefinitionRegistry {
  if (options.registry !== undefined) {
    if (options.definitions !== undefined) {
      throw new InvalidOptionsError('Provide either registry or definitions, not both');
    }
    return options.registry;
  }
  if (options.definitions !== undefined) {
    return createDefinitionRegistry(options.definitions);
  }
  return createDefinitionRegistry();
}

/** Shared helper: resolve registry without re-validating when already validated. */
export function registryFromEncodeOptions(options: EncodeOptions): AssetDefinitionRegistry {
  return getRegistry(options);
}

function ensureUint8Array(data: Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  throw new InvalidOptionsError('AssetInput data must be Uint8Array');
}

/**
 * One effective limit set per operation. Defaults apply even when omitted —
 * a limit that is only enforced when explicitly supplied is not a limit.
 */
interface EffectiveLimits {
  readonly maxAssetBytes: number;
  readonly maxTotalBytes: number;
}

function resolveEffectiveLimits(options: EncodeOptions): EffectiveLimits {
  return {
    maxAssetBytes: options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  };
}

function throwAssetByteLimit(actual: number, limit: number, ref: string | undefined): never {
  throw new ResourceLimitError(`Asset byte length ${actual} exceeds maxAssetBytes ${limit}`, {
    limit,
    actual,
    path: ref,
  });
}

/**
 * Base64-encode without copying a Buffer into a new full-size Uint8Array and
 * back into another Buffer. Buffers encode in place; ArrayBuffer-backed views
 * are wrapped (shared memory, no copy); anything else is copied once.
 */
function toBase64(bytes: Uint8Array): string {
  if (Buffer.isBuffer(bytes)) return bytes.toString('base64');
  if (bytes.buffer instanceof ArrayBuffer) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Byte length of a regular file at `p`, or `undefined` when the metadata
 * cannot be inspected. Failure to stat falls through to the read, which
 * keeps the historical `FilesystemError` surface for missing/inaccessible
 * files.
 */
async function inspectFileSize(p: string): Promise<number | undefined> {
  try {
    const st = await stat(p);
    return st.isFile() ? st.size : undefined;
  } catch {
    return undefined;
  }
}

function inspectFileSizeSync(p: string): number | undefined {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st.size : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Core single encode helpers
// ---------------------------------------------------------------------------

async function encodeOneAsync(
  input: AssetInput,
  options: EncodeOptions,
  registry: AssetDefinitionRegistry,
  detector: AssetDetector | undefined,
  limits: EffectiveLimits,
): Promise<EncodedAsset> {
  assertNotAborted(options.signal);

  let bytes: Uint8Array;
  let filename: string | undefined;
  let sourcePath: string | undefined;
  let explicitMediaType: string | undefined;
  let explicitKind: string | undefined;
  let explicitFontFormat: string | undefined;

  if (typeof input === 'string') {
    const p = input;
    const absPath = path.resolve(p);
    sourcePath = absPath;
    filename = p;
    assertNotAborted(options.signal);
    const knownSize = await inspectFileSize(p);
    if (knownSize !== undefined && knownSize > limits.maxAssetBytes) {
      throwAssetByteLimit(knownSize, limits.maxAssetBytes, p);
    }
    assertNotAborted(options.signal);
    let buf: Buffer;
    try {
      buf = await readFile(p, options.signal ? { signal: options.signal } : undefined);
    } catch (err) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? err;
      }
      throw new FilesystemError(`Failed to read file "${p}"`, { path: p, operation: 'readFile', cause: err });
    }
    assertNotAborted(options.signal);
    bytes = buf;
    if (bytes.length > limits.maxAssetBytes) {
      throwAssetByteLimit(bytes.length, limits.maxAssetBytes, p);
    }
  } else {
    if (!input || typeof input !== 'object' || !('data' in input)) {
      throw new InvalidOptionsError('AssetInput object must have data: Uint8Array');
    }
    bytes = ensureUint8Array(input.data);
    filename = input.filename;
    explicitMediaType = input.mediaType;
    explicitKind = input.kind as string | undefined;
    explicitFontFormat = input.fontFormat;
    if (bytes.length > limits.maxAssetBytes) {
      throwAssetByteLimit(bytes.length, limits.maxAssetBytes, filename);
    }
  }

  assertNotAborted(options.signal);

  // Resolve metadata
  const detection = options.detection ?? 'extension';
  let meta: { kind: string; mediaType: string; fontFormat?: string };
  if (detection === 'extension') {
    meta = resolveByExtension({
      filename,
      explicitMediaType,
      explicitKind: explicitKind as never,
      explicitFontFormat,
      registry,
    });
  } else {
    // content or verify: async detector path
    meta = await resolveWithDetector({
      bytes,
      filename,
      explicitMediaType,
      explicitKind: explicitKind as never,
      explicitFontFormat,
      registry,
      detection,
      detector,
      signal: options.signal,
    });
  }

  assertNotAborted(options.signal);

  const base64 = toBase64(bytes);
  const dataUrl = `data:${meta.mediaType};base64,${base64}`;

  const result: EncodedAsset = Object.freeze({
    ...(sourcePath !== undefined ? { sourcePath } : {}),
    ...(filename !== undefined ? { filename: path.posix.basename(filename.replace(/\\/g, '/')) } : {}),
    kind: meta.kind as EncodedAsset['kind'],
    mediaType: meta.mediaType,
    ...(meta.fontFormat !== undefined ? { fontFormat: meta.fontFormat } : {}),
    byteLength: bytes.length,
    dataUrl,
  }) as EncodedAsset;

  return result;
}

function encodeOneSync(
  input: AssetInput,
  options: EncodeOptions,
  registry: AssetDefinitionRegistry,
  limits: EffectiveLimits,
): EncodedAsset {
  assertNotAborted(options.signal);

  // Sync must reject async detection modes immediately
  const detection = options.detection ?? 'extension';
  if (detection === 'content' || detection === 'verify') {
    throw new InvalidOptionsError(`Detection mode "${detection}" is async-only and cannot be used with sync APIs`);
  }

  let bytes: Uint8Array;
  let filename: string | undefined;
  let sourcePath: string | undefined;
  let explicitMediaType: string | undefined;
  let explicitKind: string | undefined;
  let explicitFontFormat: string | undefined;

  if (typeof input === 'string') {
    const p = input;
    const absPath = path.resolve(p);
    sourcePath = absPath;
    filename = p;
    assertNotAborted(options.signal);
    const knownSize = inspectFileSizeSync(p);
    if (knownSize !== undefined && knownSize > limits.maxAssetBytes) {
      throwAssetByteLimit(knownSize, limits.maxAssetBytes, p);
    }
    let buf: Buffer;
    try {
      buf = fs.readFileSync(p);
    } catch (err) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? err;
      }
      throw new FilesystemError(`Failed to read file "${p}"`, { path: p, operation: 'readFileSync', cause: err });
    }
    bytes = buf;
    if (bytes.length > limits.maxAssetBytes) {
      throwAssetByteLimit(bytes.length, limits.maxAssetBytes, p);
    }
  } else {
    if (!input || typeof input !== 'object' || !('data' in input)) {
      throw new InvalidOptionsError('AssetInput object must have data: Uint8Array');
    }
    bytes = ensureUint8Array(input.data);
    filename = input.filename;
    explicitMediaType = input.mediaType;
    explicitKind = input.kind as string | undefined;
    explicitFontFormat = input.fontFormat;
    if (bytes.length > limits.maxAssetBytes) {
      throwAssetByteLimit(bytes.length, limits.maxAssetBytes, filename);
    }
  }

  const meta = resolveByExtension({
    filename,
    explicitMediaType,
    explicitKind: explicitKind as never,
    explicitFontFormat,
    registry,
  });

  const base64 = toBase64(bytes);
  const dataUrl = `data:${meta.mediaType};base64,${base64}`;

  const result: EncodedAsset = Object.freeze({
    ...(sourcePath !== undefined ? { sourcePath } : {}),
    ...(filename !== undefined ? { filename: path.posix.basename(filename.replace(/\\/g, '/')) } : {}),
    kind: meta.kind as EncodedAsset['kind'],
    mediaType: meta.mediaType,
    ...(meta.fontFormat !== undefined ? { fontFormat: meta.fontFormat } : {}),
    byteLength: bytes.length,
    dataUrl,
  }) as EncodedAsset;

  return result;
}

// ---------------------------------------------------------------------------
// Public APIs
// ---------------------------------------------------------------------------

/**
 * Encode a single asset to a Base64 data URL (async).
 *
 * Accepts a file path (`string`) or an in-memory `{ data: Uint8Array, filename?, mediaType?, kind?, fontFormat? }`.
 * Resolves `mediaType`/`kind`/`fontFormat` via extension lookup by default (`detection: 'extension'`).
 * When `detection` is `'content'` or `'verify'`, `file-type` is used asynchronously through an internal detector
 * (bounded to 4100 bytes, honors `AbortSignal`). Sync APIs reject those modes.
 * Enforces `maxAssetBytes` (default 3 MiB) before Base64 allocation and `maxTotalBytes` cumulatively.
 * Returns a frozen `EncodedAsset` with `dataUrl: data:<mediaType>;base64,<payload>` (RFC 2397, no charset).
 *
 * @param input - file path or byte input with optional explicit metadata (explicit `mediaType` wins)
 * @param options - registry overrides, detection mode, byte limits, AbortSignal
 * @throws {FilesystemError} when file read fails
 * @throws {UnsupportedAssetError} for unknown extension/media type
 * @throws {ResourceLimitError} when per-asset or total byte limits exceeded
 * @throws {InvalidOptionsError} for malformed options or sync misuse of async detection
 * @throws {DetectionMismatchError} when `detection: 'verify'` detects a mismatch
 */
export async function encodeAsset(input: AssetInput, options: EncodeOptions = {}): Promise<EncodedAsset> {
  validateLimits(options);
  assertNotAborted(options.signal);
  const limits = resolveEffectiveLimits(options);
  const registry = getRegistry(options);
  const detector = options.detector ?? defaultDetector;
  const result = await encodeOneAsync(input, options, registry, detector, limits);
  if (result.byteLength > limits.maxTotalBytes) {
    throw new ResourceLimitError(`Total bytes ${result.byteLength} exceeds maxTotalBytes ${limits.maxTotalBytes}`, {
      limit: limits.maxTotalBytes,
      actual: result.byteLength,
      path: result.filename ?? result.sourcePath,
    });
  }
  return result;
}

/**
 * Synchronous variant of `encodeAsset`.
 * Uses sync I/O throughout and rejects `detection: 'content' | 'verify'` immediately (no promise blocking).
 * Otherwise matches async semantics and limits.
 */
export function encodeAssetSync(input: AssetInput, options: EncodeOptions = {}): EncodedAsset {
  validateLimits(options);
  assertNotAborted(options.signal);
  const limits = resolveEffectiveLimits(options);
  const registry = getRegistry(options);
  const result = encodeOneSync(input, options, registry, limits);
  if (result.byteLength > limits.maxTotalBytes) {
    throw new ResourceLimitError(`Total bytes ${result.byteLength} exceeds maxTotalBytes ${limits.maxTotalBytes}`, {
      limit: limits.maxTotalBytes,
      actual: result.byteLength,
      path: result.filename ?? result.sourcePath,
    });
  }
  return result;
}

/**
 * Encode multiple assets in deterministic input order (async).
 * Preserves input order, enforces per-asset and cumulative `maxTotalBytes` limits,
 * honors `AbortSignal` between items. Never calls sync I/O.
 */
export async function encodeAssets(
  inputs: readonly AssetInput[],
  options: EncodeOptions = {},
): Promise<readonly EncodedAsset[]> {
  validateLimits(options);
  assertNotAborted(options.signal);
  if (!Array.isArray(inputs)) {
    throw new InvalidOptionsError('encodeAssets expects an array of AssetInput');
  }
  const limits = resolveEffectiveLimits(options);
  const registry = getRegistry(options);
  const detector = options.detector ?? defaultDetector;
  const results: EncodedAsset[] = [];
  let total = 0;
  for (let i = 0; i < inputs.length; i++) {
    assertNotAborted(options.signal);
    const input = inputs[i]!;
    const encoded = await encodeOneAsync(input, options, registry, detector, limits);
    total += encoded.byteLength;
    if (total > limits.maxTotalBytes) {
      throw new ResourceLimitError(`Total bytes ${total} exceeds maxTotalBytes ${limits.maxTotalBytes} at index ${i}`, {
        limit: limits.maxTotalBytes,
        actual: total,
        path: encoded.filename ?? encoded.sourcePath,
      });
    }
    results.push(encoded);
    assertNotAborted(options.signal);
  }
  return Object.freeze([...results]) as readonly EncodedAsset[];
}

/**
 * Synchronous variant of `encodeAssets`. Rejects `content`/`verify` detection.
 * Preserves input order and enforces same limits with sync I/O only.
 */
export function encodeAssetsSync(inputs: readonly AssetInput[], options: EncodeOptions = {}): readonly EncodedAsset[] {
  validateLimits(options);
  assertNotAborted(options.signal);
  if (!Array.isArray(inputs)) {
    throw new InvalidOptionsError('encodeAssetsSync expects an array of AssetInput');
  }
  if (options.detection === 'content' || options.detection === 'verify') {
    throw new InvalidOptionsError(
      `Detection mode "${options.detection}" is async-only and cannot be used with sync APIs`,
    );
  }
  const limits = resolveEffectiveLimits(options);
  const registry = getRegistry(options);
  const results: EncodedAsset[] = [];
  let total = 0;
  for (let i = 0; i < inputs.length; i++) {
    assertNotAborted(options.signal);
    const input = inputs[i]!;
    const encoded = encodeOneSync(input, options, registry, limits);
    total += encoded.byteLength;
    if (total > limits.maxTotalBytes) {
      throw new ResourceLimitError(`Total bytes ${total} exceeds maxTotalBytes ${limits.maxTotalBytes} at index ${i}`, {
        limit: limits.maxTotalBytes,
        actual: total,
        path: encoded.filename ?? encoded.sourcePath,
      });
    }
    results.push(encoded);
  }
  return Object.freeze([...results]) as readonly EncodedAsset[];
}
