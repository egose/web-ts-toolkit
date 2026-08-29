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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetInput, EncodedAsset, EncodeOptions } from './types.ts';
import { createDefinitionRegistry } from './definitions.ts';
import type { AssetDefinitionRegistry } from './definitions.ts';
import { InvalidOptionsError, ResourceLimitError, FilesystemError } from './errors.ts';
import { resolveByExtension, resolveWithDetector, getDetector } from './detect.ts';
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
  if (options.detection !== undefined && !['extension', 'content', 'verify'].includes(options.detection)) {
    throw new InvalidOptionsError(
      `Invalid detection mode "${String(options.detection)}" — expected 'extension' | 'content' | 'verify'`,
    );
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
  if (options.definitions !== undefined) {
    return createDefinitionRegistry(options.definitions);
  }
  return createDefinitionRegistry();
}

function ensureUint8Array(data: Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  throw new InvalidOptionsError('AssetInput data must be Uint8Array');
}

// ---------------------------------------------------------------------------
// Core single encode helpers
// ---------------------------------------------------------------------------

async function encodeOneAsync(
  input: AssetInput,
  options: EncodeOptions,
  registry: AssetDefinitionRegistry,
  detector: AssetDetector | undefined,
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
    sourcePath = p;
    filename = p;
    assertNotAborted(options.signal);
    let buf: Buffer;
    try {
      buf = await readFile(p);
    } catch (err) {
      throw new FilesystemError(`Failed to read file "${p}"`, { path: p, operation: 'readFile', cause: err });
    }
    assertNotAborted(options.signal);
    bytes = new Uint8Array(buf);
  } else {
    if (!input || typeof input !== 'object' || !('data' in input)) {
      throw new InvalidOptionsError('AssetInput object must have data: Uint8Array');
    }
    bytes = ensureUint8Array(input.data);
    filename = input.filename;
    explicitMediaType = input.mediaType;
    explicitKind = input.kind as string | undefined;
    explicitFontFormat = input.fontFormat;
  }

  // Per-asset limit before Base64 — finite default enforced (see src/policy.ts)
  {
    const effective = options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
    if (bytes.length > effective) {
      throw new ResourceLimitError(`Asset byte length ${bytes.length} exceeds maxAssetBytes ${effective}`, {
        limit: effective,
        actual: bytes.length,
        path: filename ?? sourcePath,
      });
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

  // Re-validate limit after detection? Still original bytes, but double-check
  {
    const effective = options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
    if (bytes.length > effective) {
      throw new ResourceLimitError(`Asset byte length ${bytes.length} exceeds maxAssetBytes ${effective}`, {
        limit: effective,
        actual: bytes.length,
        path: filename ?? sourcePath,
      });
    }
  }

  const base64 = Buffer.from(bytes).toString('base64');
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

function encodeOneSync(input: AssetInput, options: EncodeOptions, registry: AssetDefinitionRegistry): EncodedAsset {
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
    sourcePath = p;
    filename = p;
    let buf: Buffer;
    try {
      buf = fs.readFileSync(p);
    } catch (err) {
      throw new FilesystemError(`Failed to read file "${p}"`, { path: p, operation: 'readFileSync', cause: err });
    }
    bytes = new Uint8Array(buf);
  } else {
    if (!input || typeof input !== 'object' || !('data' in input)) {
      throw new InvalidOptionsError('AssetInput object must have data: Uint8Array');
    }
    bytes = ensureUint8Array(input.data);
    filename = input.filename;
    explicitMediaType = input.mediaType;
    explicitKind = input.kind as string | undefined;
    explicitFontFormat = input.fontFormat;
  }

  {
    const effective = options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
    if (bytes.length > effective) {
      throw new ResourceLimitError(`Asset byte length ${bytes.length} exceeds maxAssetBytes ${effective}`, {
        limit: effective,
        actual: bytes.length,
        path: filename ?? sourcePath,
      });
    }
  }

  const meta = resolveByExtension({
    filename,
    explicitMediaType,
    explicitKind: explicitKind as never,
    explicitFontFormat,
    registry,
  });

  const base64 = Buffer.from(bytes).toString('base64');
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
  const registry = getRegistry(options);
  const detector = getDetector();
  // total check for single is same as per-asset when maxTotalBytes present
  if (options.maxTotalBytes !== undefined) {
    // Need bytes length to compare; we will check after reading inside encodeOneAsync
    // For single, we delegate check inside: if byteLength > maxTotalBytes -> ResourceLimitError
    // Do it here via a wrapper: peek? Instead let encodeOne handle per-asset, then verify total.
  }
  const result = await encodeOneAsync(input, options, registry, detector);
  {
    const effectiveTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    if (result.byteLength > effectiveTotal) {
      throw new ResourceLimitError(`Total bytes ${result.byteLength} exceeds maxTotalBytes ${effectiveTotal}`, {
        limit: effectiveTotal,
        actual: result.byteLength,
        path: result.filename ?? result.sourcePath,
      });
    }
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
  const registry = getRegistry(options);
  const result = encodeOneSync(input, options, registry);
  {
    const effectiveTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    if (result.byteLength > effectiveTotal) {
      throw new ResourceLimitError(`Total bytes ${result.byteLength} exceeds maxTotalBytes ${effectiveTotal}`, {
        limit: effectiveTotal,
        actual: result.byteLength,
        path: result.filename ?? result.sourcePath,
      });
    }
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
  const registry = getRegistry(options);
  const detector = getDetector();
  const results: EncodedAsset[] = [];
  let total = 0;
  for (let i = 0; i < inputs.length; i++) {
    assertNotAborted(options.signal);
    const input = inputs[i]!;
    const encoded = await encodeOneAsync(input, options, registry, detector);
    // total check before pushing? check cumulative
    total += encoded.byteLength;
    if (options.maxTotalBytes !== undefined && total > options.maxTotalBytes) {
      throw new ResourceLimitError(
        `Total bytes ${total} exceeds maxTotalBytes ${options.maxTotalBytes} at index ${i}`,
        { limit: options.maxTotalBytes, actual: total, path: encoded.filename ?? encoded.sourcePath },
      );
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
  const registry = getRegistry(options);
  const results: EncodedAsset[] = [];
  let total = 0;
  for (let i = 0; i < inputs.length; i++) {
    assertNotAborted(options.signal);
    const input = inputs[i]!;
    const encoded = encodeOneSync(input, options, registry);
    total += encoded.byteLength;
    if (options.maxTotalBytes !== undefined && total > options.maxTotalBytes) {
      throw new ResourceLimitError(
        `Total bytes ${total} exceeds maxTotalBytes ${options.maxTotalBytes} at index ${i}`,
        { limit: options.maxTotalBytes, actual: total, path: encoded.filename ?? encoded.sourcePath },
      );
    }
    results.push(encoded);
  }
  return Object.freeze([...results]) as readonly EncodedAsset[];
}
