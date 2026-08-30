/**
 * Catalog — immutable registry of encoded assets with exact and basename indexes.
 *
 * Constructed via `createAssetCatalog` (async) and `createAssetCatalogSync` (sync).
 * - Uses deterministic discovery (lexical order, dedup, caller-order preservation).
 * - Encodes via bounded `encodeAsset` APIs, preserving input order regardless of async timing.
 * - Exact normalized absolute path index is the default; secondary basename index only for compatibility mode.
 * - Immutable, frozen snapshots.
 */

import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { AssetCatalog, AssetInput, CatalogOptions, EncodedAsset, AssetTypeDefinition } from './types.ts';
import { createDefinitionRegistry } from './definitions.ts';
import type { AssetDefinitionRegistry } from './definitions.ts';
import { encodeAsset, encodeAssetSync } from './encode.ts';
import { discoverAssets, discoverAssetsSync } from './discovery.ts';
import type { DiscoverOptions } from './discovery.ts';
import { AmbiguousAssetError, InvalidOptionsError, ResourceLimitError } from './errors.ts';
import { validatePolicyOptions, DEFAULT_MAX_TOTAL_BYTES } from './policy.ts';

function normalizeAbsolute(p: string): string {
  return path.resolve(p);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  else if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function validateCatalogOptions(opts: CatalogOptions): void {
  validatePolicyOptions({
    maxAssetBytes: opts.maxAssetBytes,
    maxTotalBytes: opts.maxTotalBytes,
    maxFiles: opts.maxFiles,
    maxDepth: opts.maxDepth,
    concurrency: opts.concurrency,
    maxTargets: (opts as { maxTargets?: unknown }).maxTargets,
  });
  if (opts.registry !== undefined && opts.definitions !== undefined) {
    throw new InvalidOptionsError('Provide either registry or definitions, not both');
  }
  if (opts.registry !== undefined) {
    const r: unknown = opts.registry;
    if (
      r === null ||
      typeof r !== 'object' ||
      !Array.isArray((r as { definitions?: unknown }).definitions) ||
      typeof (r as { get?: unknown }).get !== 'function'
    ) {
      throw new InvalidOptionsError(
        'CatalogOptions.registry must be an AssetDefinitionRegistry from createDefinitionRegistry',
      );
    }
  }
  if ((opts as { detector?: unknown }).detector !== undefined) {
    const d: unknown = (opts as { detector?: unknown }).detector;
    if (d === null || typeof d !== 'object' || typeof (d as { detect?: unknown }).detect !== 'function') {
      throw new InvalidOptionsError(
        'CatalogOptions.detector must be an AssetDetector with async detect(bytes, signal?) method',
      );
    }
  }
}

function asArray<T>(input: T | readonly T[]): readonly T[] {
  if (Array.isArray(input)) return input as readonly T[];
  return [input as T];
}

function isByteInput(input: AssetInput): input is Extract<AssetInput, { data: Uint8Array }> {
  return typeof input !== 'string';
}

// ---------------------------------------------------------------------------
// Registry resolution (reuse validated registry)
// ---------------------------------------------------------------------------

function resolveCatalogRegistry(options: CatalogOptions): AssetDefinitionRegistry {
  if (options.registry) {
    return options.registry;
  }
  return options.definitions ? createDefinitionRegistry(options.definitions) : createDefinitionRegistry();
}

/** Adapter: allow callers with `registry.definitions` to pass either shape without re-normalizing. */
export function registryFromDefinitionsOrRegistry(options: {
  definitions?: readonly AssetTypeDefinition[];
  registry?: AssetDefinitionRegistry;
}): AssetDefinitionRegistry {
  if (options.registry) return options.registry;
  return options.definitions ? createDefinitionRegistry(options.definitions) : createDefinitionRegistry();
}

// ---------------------------------------------------------------------------
// Pure helpers: queue normalization
// ---------------------------------------------------------------------------

type InputOrderEntry =
  | { kind: 'path'; value: string }
  | { kind: 'byte'; input: Extract<AssetInput, { data: Uint8Array }> };

function normalizeCatalogInputs(list: readonly AssetInput[]): InputOrderEntry[] {
  const order: InputOrderEntry[] = [];
  for (const inp of list) {
    if (isByteInput(inp)) order.push({ kind: 'byte', input: inp });
    else order.push({ kind: 'path', value: inp });
  }
  return order;
}

function discoveryOptionsFromCatalog(options: CatalogOptions, registry: AssetDefinitionRegistry): DiscoverOptions {
  return {
    followSymlinks: options.followSymlinks,
    maxDepth: options.maxDepth,
    maxFiles: options.maxFiles,
    traversalRoot: options.traversalRoot,
    allowTraversalEscape: options.allowTraversalEscape,
    concurrency: options.concurrency,
    signal: options.signal,
    registry,
    allowedKinds: (options as CatalogOptions).allowedKinds,
    allowedExtensions: (options as CatalogOptions).allowedExtensions,
  };
}

// Build ordered per-root discovery groups once so mixed path/byte inputs retain order without duplicate traversal.
// Each distinct normalized root is discovered at most once (cache) and global file dedupe respects first occurrence.
// Pure ordering logic; I/O is isolated to discoverAssets calls.

async function buildOrderedQueueAsync(
  inputOrder: InputOrderEntry[],
  discoverOpts: DiscoverOptions,
): Promise<QueueItem[]> {
  const cache = new Map<string, readonly string[]>();
  const globalSeen = new Set<string>();
  const queue: QueueItem[] = [];
  for (const entry of inputOrder) {
    throwIfAborted(discoverOpts.signal);
    if (entry.kind === 'byte') {
      queue.push({ type: 'byte', input: entry.input });
    } else {
      const normRoot = normalizeAbsolute(entry.value);
      let files = cache.get(normRoot);
      if (!files) {
        files = await discoverAssets(entry.value, discoverOpts);
        cache.set(normRoot, files);
      }
      for (const f of files) {
        const norm = normalizeAbsolute(f);
        if (globalSeen.has(norm)) continue;
        globalSeen.add(norm);
        queue.push({ type: 'file', path: norm });
      }
    }
  }
  return queue;
}

function buildOrderedQueueSync(inputOrder: InputOrderEntry[], discoverOpts: DiscoverOptions): QueueItem[] {
  const cache = new Map<string, readonly string[]>();
  const globalSeen = new Set<string>();
  const queue: QueueItem[] = [];
  for (const entry of inputOrder) {
    throwIfAborted(discoverOpts.signal);
    if (entry.kind === 'byte') {
      queue.push({ type: 'byte', input: entry.input });
    } else {
      const normRoot = normalizeAbsolute(entry.value);
      let files = cache.get(normRoot);
      if (!files) {
        files = discoverAssetsSync(entry.value, discoverOpts);
        cache.set(normRoot, files);
      }
      for (const f of files) {
        const norm = normalizeAbsolute(f);
        if (globalSeen.has(norm)) continue;
        globalSeen.add(norm);
        queue.push({ type: 'file', path: norm });
      }
    }
  }
  return queue;
}

// ---------------------------------------------------------------------------
// Aggregate byte accounting
// ---------------------------------------------------------------------------

type QueueItem = { type: 'file'; path: string } | { type: 'byte'; input: Extract<AssetInput, { data: Uint8Array }> };

function itemLabel(item: QueueItem): string | undefined {
  return item.type === 'file' ? item.path : item.input.filename;
}

/**
 * Probe the planned byte size of a catalog queue item before it is encoded.
 * Byte inputs know their length; file paths are statted so a bounded
 * concurrent chunk can refuse work that would exceed the remaining total
 * before Base64 payload allocation. Returns `undefined` when the size cannot
 * be inspected; the encode path remains the authoritative enforcer.
 */
async function probeItemSize(item: QueueItem): Promise<number | undefined> {
  if (item.type === 'byte') return item.input.data.length;
  try {
    const st = await stat(item.path);
    return st.isFile() ? st.size : undefined;
  } catch {
    return undefined;
  }
}

/** Throw the deterministic aggregate-limit error for the first overflowing item. */
function throwTotalLimit(total: number, limit: number, item: EncodedAsset | QueueItem): never {
  const ref = 'byteLength' in item ? (item.sourcePath ?? item.filename) : itemLabel(item);
  throw new ResourceLimitError(`Total bytes ${total} exceeds maxTotalBytes ${limit}`, {
    limit,
    actual: total,
    path: ref,
  });
}

/**
 * Plan one concurrent chunk against the remaining aggregate budget so a chunk
 * cannot allocate an unbounded amount past the effective remaining total.
 * Returns the number of leading queue items that fit; the first non-fitting
 * item fails with `RESOURCE_LIMIT` after the fitting prefix is encoded and
 * accounted, preserving deterministic input order. Files may change between
 * this probe and their read; the actual encoded bytes are still re-checked
 * against the limit afterwards.
 */
async function planChunk(
  queue: readonly QueueItem[],
  offset: number,
  chunkSize: number,
  remaining: number,
): Promise<number> {
  const end = Math.min(queue.length, offset + chunkSize);
  let planned = 0;
  for (let i = offset; i < end; i++) {
    const size = await probeItemSize(queue[i]!);
    if (size !== undefined) {
      if (planned + size > remaining) {
        return i - offset;
      }
      planned += size;
    }
  }
  return end - offset;
}

// ---------------------------------------------------------------------------
// Index building
// ---------------------------------------------------------------------------

function buildCatalogIndexes(
  assets: readonly EncodedAsset[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _definitions: readonly AssetTypeDefinition[],
): Pick<AssetCatalog, 'getByPath' | 'getByBasename' | 'size'> {
  const exactMap = new Map<string, EncodedAsset>();
  const basenameMap = new Map<string, EncodedAsset[]>();

  for (const a of assets) {
    if (a.sourcePath) {
      const key = normalizeAbsolute(a.sourcePath);
      // Deduplication already handled before encoding, but if duplicate absolute sneaks in, keep first (deterministic)
      if (!exactMap.has(key)) exactMap.set(key, a);
      const base = path.posix.basename(key.replace(/\\/g, '/'));
      // Also use path.basename for platform, but posix for URL-like; for filesystem we need platform basename.
      // Use platform basename to be filesystem accurate, but also ensure posix fallback for consistency.
      const basePlatform = path.basename(key);
      const effectiveBase = basePlatform; // prefer platform for filesystem
      const list = basenameMap.get(effectiveBase) ?? [];
      list.push(a);
      basenameMap.set(effectiveBase, list);
      // Also index by posix basename if different (handles Windows-style paths on POSIX host)
      if (base !== effectiveBase) {
        const list2 = basenameMap.get(base) ?? [];
        if (!list2.includes(a)) {
          list2.push(a);
          basenameMap.set(base, list2);
        }
      }
    } else if (a.filename) {
      // Byte inputs without sourcePath: only basename index if filename present
      const base = a.filename; // already basename'd in encode
      const list = basenameMap.get(base) ?? [];
      list.push(a);
      basenameMap.set(base, list);
    }
  }

  const getByPath = (absolutePath: string): EncodedAsset | undefined => {
    const key = normalizeAbsolute(absolutePath);
    return exactMap.get(key);
  };

  const getByBasename = (basename: string): EncodedAsset | undefined => {
    // Normalize basename: strip directory components, keep only last segment with posix and platform handling
    const normalizedBase = path.basename(basename.replace(/\\/g, '/'));
    // Also posix basename fallback
    const posixBase = path.posix.basename(basename.replace(/\\/g, '/'));
    const candidates = basenameMap.get(normalizedBase) ?? basenameMap.get(posixBase);
    if (!candidates || candidates.length === 0) return undefined;
    if (candidates.length > 1) {
      const paths = candidates.map((c) => c.sourcePath ?? c.filename ?? '<byte-input>');
      throw new AmbiguousAssetError(`Ambiguous basename "${normalizedBase}" matches ${candidates.length} assets`, {
        basename: normalizedBase,
        candidates: Object.freeze([...paths]),
      });
    }
    return candidates[0];
  };

  return {
    getByPath,
    getByBasename,
    size: assets.length,
  };
}

function createImmutableCatalog(
  assets: readonly EncodedAsset[],
  definitions: readonly AssetTypeDefinition[],
): AssetCatalog {
  const indexes = buildCatalogIndexes(assets, definitions);
  const frozenAssets = Object.freeze([...assets]) as readonly EncodedAsset[];
  const frozenDefs = Object.freeze([...definitions]) as readonly AssetTypeDefinition[];

  const catalog: AssetCatalog = Object.freeze({
    assets: frozenAssets,
    definitions: frozenDefs,
    getByPath: indexes.getByPath,
    getByBasename: indexes.getByBasename,
    size: indexes.size,
  }) as AssetCatalog;

  return catalog;
}

// ---------------------------------------------------------------------------
// Async catalog creation
// ---------------------------------------------------------------------------

/**
 * Create an immutable asset catalog from file paths, directories, and byte inputs (async).
 * - Discovery is deterministic lexical order, deduplicated, caller-order preserved.
 * - Encoding is bounded, honors `AbortSignal`, and preserves input order regardless of async timing.
 * - Exact path matching is default; basename compatibility mode is opt-in and throws `AmbiguousAssetError` on duplicates.
 */
export async function createAssetCatalog(
  inputs: readonly AssetInput[] | AssetInput,
  options: CatalogOptions = {},
): Promise<AssetCatalog> {
  validateCatalogOptions(options);
  throwIfAborted(options.signal);

  const list = asArray(inputs);
  const registry = resolveCatalogRegistry(options);
  const inputOrder = normalizeCatalogInputs(list);
  const discoverOpts = discoveryOptionsFromCatalog(options, registry);

  throwIfAborted(options.signal);

  const orderedQueue = await buildOrderedQueueAsync(inputOrder, discoverOpts);

  throwIfAborted(options.signal);

  // Encode sequentially to guarantee deterministic order regardless of async timing
  // Also respect concurrency option if provided: we batch with limited parallelism but preserve order via indexed results.

  const concurrency = options.concurrency ?? 16;
  validateCatalogOptions({ concurrency } as CatalogOptions);
  // One effective aggregate limit for this operation; the default applies
  // even when `maxTotalBytes` is omitted.
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  const encoded: EncodedAsset[] = [];
  let totalBytes = 0;

  // Pass validated registry to encode to avoid re-normalizing.
  const encodeOptions: CatalogOptions = { ...options, registry, definitions: undefined };
  // `planChunk` bounds each chunk against the remaining aggregate budget, so a
  // concurrent chunk cannot allocate an unbounded amount past the limit.
  if (concurrency > 1 && orderedQueue.length > 1) {
    for (let i = 0; i < orderedQueue.length; i += concurrency) {
      throwIfAborted(options.signal);
      const fitting = await planChunk(orderedQueue, i, concurrency, maxTotalBytes - totalBytes);
      const chunk = orderedQueue.slice(i, i + fitting);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          throwIfAborted(options.signal);
          return item.type === 'file' ? encodeAsset(item.path, encodeOptions) : encodeAsset(item.input, encodeOptions);
        }),
      );
      for (const enc of chunkResults) {
        throwIfAborted(options.signal);
        totalBytes += enc.byteLength;
        if (totalBytes > maxTotalBytes) throwTotalLimit(totalBytes, maxTotalBytes, enc);
        encoded.push(enc);
      }
      if (fitting < Math.min(concurrency, orderedQueue.length - i)) {
        const overItem = orderedQueue[i + fitting]!;
        const size = (await probeItemSize(overItem)) ?? 0;
        throwTotalLimit(totalBytes + size, maxTotalBytes, overItem);
      }
    }
  } else {
    for (const item of orderedQueue) {
      throwIfAborted(options.signal);
      const enc =
        item.type === 'file'
          ? await encodeAsset(item.path, encodeOptions)
          : await encodeAsset(item.input, encodeOptions);
      totalBytes += enc.byteLength;
      if (totalBytes > maxTotalBytes) throwTotalLimit(totalBytes, maxTotalBytes, enc);
      encoded.push(enc);
      throwIfAborted(options.signal);
    }
  }

  const definitions = registry.definitions;
  return createImmutableCatalog(encoded, definitions);
}

// ---------------------------------------------------------------------------
// Sync catalog creation
// ---------------------------------------------------------------------------

/**
 * Synchronous variant of `createAssetCatalog`. Rejects async detection modes (`content`, `verify`) immediately,
 * never blocks a promise, and uses sync I/O throughout.
 */
export function createAssetCatalogSync(
  inputs: readonly AssetInput[] | AssetInput,
  options: CatalogOptions = {},
): AssetCatalog {
  validateCatalogOptions(options);
  throwIfAborted(options.signal);
  if (options.detection === 'content' || options.detection === 'verify') {
    throw new InvalidOptionsError(
      `Detection mode "${options.detection}" is async-only and cannot be used with sync APIs`,
    );
  }

  const list = asArray(inputs);
  const registry = resolveCatalogRegistry(options);
  const inputOrder = normalizeCatalogInputs(list);
  const discoverOpts = discoveryOptionsFromCatalog(options, registry);

  throwIfAborted(options.signal);

  const orderedQueue = buildOrderedQueueSync(inputOrder, discoverOpts);

  throwIfAborted(options.signal);

  const encoded: EncodedAsset[] = [];
  let totalBytes = 0;
  // One effective aggregate limit; the default applies even when omitted.
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const encodeOptions: CatalogOptions = { ...options, registry, definitions: undefined };
  for (const item of orderedQueue) {
    throwIfAborted(options.signal);
    const enc =
      item.type === 'file' ? encodeAssetSync(item.path, encodeOptions) : encodeAssetSync(item.input, encodeOptions);
    totalBytes += enc.byteLength;
    if (totalBytes > maxTotalBytes) throwTotalLimit(totalBytes, maxTotalBytes, enc);
    encoded.push(enc);
  }

  const definitions = registry.definitions;
  return createImmutableCatalog(encoded, definitions);
}
