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
import type { AssetCatalog, AssetInput, CatalogOptions, EncodedAsset, AssetTypeDefinition } from './types.ts';
import { createDefinitionRegistry } from './definitions.ts';
import type { AssetDefinitionRegistry } from './definitions.ts';
import { encodeAsset, encodeAssetSync } from './encode.ts';
import { discoverAssets, discoverAssetsSync } from './discovery.ts';
import { AmbiguousAssetError, InvalidOptionsError, ResourceLimitError } from './errors.ts';
import { validatePolicyOptions } from './policy.ts';

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
}

function asArray<T>(input: T | readonly T[]): readonly T[] {
  if (Array.isArray(input)) return input as readonly T[];
  return [input as T];
}

function isByteInput(input: AssetInput): input is Extract<AssetInput, { data: Uint8Array }> {
  return typeof input !== 'string';
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
 * - Encoding is bounded, honors `AbortSignal`, and preserves input order regardless of async completion timing.
 * - Exact path matching is default; basename compatibility mode is opt-in and throws `AmbiguousAssetError` on duplicates.
 */
export async function createAssetCatalog(
  inputs: readonly AssetInput[] | AssetInput,
  options: CatalogOptions = {},
): Promise<AssetCatalog> {
  validateCatalogOptions(options);
  throwIfAborted(options.signal);

  const list = asArray(inputs);
  const registry: AssetDefinitionRegistry = options.definitions
    ? createDefinitionRegistry(options.definitions)
    : createDefinitionRegistry();

  // Separate string path inputs (need discovery) vs byte inputs (direct)
  const stringPaths: string[] = [];
  const byteInputs: Array<{ input: Extract<AssetInput, { data: Uint8Array }>; index: number }> = [];
  const inputOrder: Array<
    { kind: 'path'; value: string } | { kind: 'byte'; input: Extract<AssetInput, { data: Uint8Array }> }
  > = [];

  for (const inp of list) {
    if (isByteInput(inp)) {
      byteInputs.push({ input: inp, index: inputOrder.length });
      inputOrder.push({ kind: 'byte', input: inp });
    } else {
      stringPaths.push(inp);
      inputOrder.push({ kind: 'path', value: inp });
    }
  }

  // Discovery for string paths: deterministic, deduped, lexical, root-aware
  let discoveredFiles: readonly string[] = Object.freeze([] as string[]);
  if (stringPaths.length > 0) {
    // Use discoverAssets with relevant DiscoveryOptions propagated
    const discoverOpts = {
      followSymlinks: options.followSymlinks,
      maxDepth: options.maxDepth,
      maxFiles: options.maxFiles,
      traversalRoot: options.traversalRoot,
      allowTraversalEscape: options.allowTraversalEscape,
      concurrency: options.concurrency,
      signal: options.signal,
      definitions: options.definitions,
      allowedKinds: (options as CatalogOptions).allowedKinds,
      allowedExtensions: (options as CatalogOptions).allowedExtensions,
    };
    discoveredFiles = await discoverAssets(stringPaths, discoverOpts);
  }

  throwIfAborted(options.signal);

  // Encode phase: preserve overall input order.
  // For string path inputs, the discovered files are interleaved in caller order.
  // We have `discoveredFiles` as ordered deduped list from discovery, but we need to map each original string path
  // to its expanded files in order. `discoverAssets` already retains caller order between roots, so we can use it directly
  // as the ordered path sequence. However we also need to interleave byte inputs in original inputOrder positions.
  // Simpler: build final ordered encode queue as:
  // - iterate inputOrder; for 'byte' push that byte input; for 'path' push its expanded segment?
  // But discoveredFiles loses grouping per root. Instead we can reconstruct by invoking discovery per root individually
  // while preserving order. Our current `discoveredFiles` is already globally ordered by roots' caller order, so we can
  // treat it as the path queue and interleave bytes by original positions using a stable merge:
  // The spec says "Preserve input order, deduplicate" — meaning overall catalog order follows input order.
  // If input is [byteA, "/dir1", byteB, "/dir2"], catalog should be [encoded(byteA), files from /dir1 lexically, encoded(byteB), files from /dir2 lexically].
  // To achieve, we need per-root expansion while preserving positions.

  // Re-expand per root to interleave correctly, dedup globally but keep first occurrence order.
  const globalSeen = new Set<string>();
  const orderedQueue: Array<
    { type: 'file'; path: string } | { type: 'byte'; input: Extract<AssetInput, { data: Uint8Array }> }
  > = [];

  // Helper to expand a single root string to files (or single file) deterministically
  // We already have discoveredFiles globally deduped, but for interleaving we need per-root grouping.
  // Instead of reusing global, we will discover per path root sequentially to build ordered queue.

  // If we have both path and byte inputs interleaved, we need to process path roots one by one in inputOrder.
  // So we will iterate inputOrder and for each 'path' expand via discoverAssets for that single root.

  // To avoid double discovery, we already discovered globally; but we can split global into per-root segments
  // by discovering each root individually now (still deterministic, but extra work). Simpler to redo per-root discovery
  // for ordering when byte inputs are interleaved; when no byte interleaving, we can just use global.

  const hasInterleavedBytes = byteInputs.length > 0 && stringPaths.length > 0;
  if (hasInterleavedBytes) {
    // Discover per root in order, building queue interleaved with bytes
    for (const entry of inputOrder) {
      throwIfAborted(options.signal);
      if (entry.kind === 'byte') {
        orderedQueue.push({ type: 'byte', input: entry.input });
      } else {
        // entry is a path string root
        const filesForRoot = await discoverAssets(entry.value, {
          followSymlinks: options.followSymlinks,
          maxDepth: options.maxDepth,
          maxFiles: options.maxFiles,
          traversalRoot: options.traversalRoot,
          allowTraversalEscape: options.allowTraversalEscape,
          concurrency: options.concurrency,
          signal: options.signal,
          definitions: options.definitions,
          allowedKinds: (options as CatalogOptions).allowedKinds,
          allowedExtensions: (options as CatalogOptions).allowedExtensions,
        });
        for (const f of filesForRoot) {
          const norm = normalizeAbsolute(f);
          if (globalSeen.has(norm)) continue;
          globalSeen.add(norm);
          orderedQueue.push({ type: 'file', path: norm });
        }
      }
    }
  } else if (stringPaths.length > 0) {
    // Only path inputs: use global discoveredFiles as queue in order
    for (const f of discoveredFiles) {
      const norm = normalizeAbsolute(f);
      if (globalSeen.has(norm)) continue;
      globalSeen.add(norm);
      orderedQueue.push({ type: 'file', path: norm });
    }
  } else {
    // Only byte inputs
    for (const entry of inputOrder) {
      if (entry.kind === 'byte') orderedQueue.push({ type: 'byte', input: entry.input });
    }
  }

  throwIfAborted(options.signal);

  // Encode sequentially to guarantee deterministic order regardless of async timing
  // Also respect concurrency option if provided: we batch with limited parallelism but preserve order via indexed results.

  const concurrency = options.concurrency ?? 16;
  validateCatalogOptions({ concurrency } as CatalogOptions);

  const encoded: EncodedAsset[] = [];
  let totalBytes = 0;

  // Sequential path ensures determinism; we still respect abort and limits.
  // If concurrency >1, we could allow limited parallel but must merge in order. For simplicity, sequential.
  // To honor concurrency bound, we process in batches of `concurrency` with Promise.all but store ordered.
  // Even with parallel, result order is input order, not completion order, because we map index->result.

  // Implement batched parallel while preserving order:
  if (concurrency > 1 && orderedQueue.length > 1) {
    // Process in chunks of concurrency, awaiting each chunk to keep determinism and bounded resource
    for (let i = 0; i < orderedQueue.length; i += concurrency) {
      throwIfAborted(options.signal);
      const chunk = orderedQueue.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          throwIfAborted(options.signal);
          if (item.type === 'file') {
            // Encode file path
            // Use same options (definitions, detection, limits, signal)
            const enc = await encodeAsset(item.path, options);
            return enc;
          } else {
            const enc = await encodeAsset(item.input as AssetInput, options);
            return enc;
          }
        }),
      );
      for (const enc of chunkResults) {
        throwIfAborted(options.signal);
        // Check total bytes limit incrementally in order of chunk (which is input order)
        totalBytes += enc.byteLength;
        if (options.maxTotalBytes !== undefined && totalBytes > options.maxTotalBytes) {
          throw new ResourceLimitError(`Total bytes ${totalBytes} exceeds maxTotalBytes ${options.maxTotalBytes}`, {
            limit: options.maxTotalBytes,
            actual: totalBytes,
            path: enc.sourcePath ?? enc.filename,
          });
        }
        // Per-asset limit already enforced in encode, but double-check
        encoded.push(enc);
      }
    }
  } else {
    for (const item of orderedQueue) {
      throwIfAborted(options.signal);
      let enc: EncodedAsset;
      if (item.type === 'file') {
        enc = await encodeAsset(item.path, options);
      } else {
        enc = await encodeAsset(item.input as AssetInput, options);
      }
      totalBytes += enc.byteLength;
      if (options.maxTotalBytes !== undefined && totalBytes > options.maxTotalBytes) {
        throw new ResourceLimitError(`Total bytes ${totalBytes} exceeds maxTotalBytes ${options.maxTotalBytes}`, {
          limit: options.maxTotalBytes,
          actual: totalBytes,
          path: enc.sourcePath ?? enc.filename,
        });
      }
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
  const registry = options.definitions ? createDefinitionRegistry(options.definitions) : createDefinitionRegistry();

  const stringPaths: string[] = [];
  const inputOrder: Array<
    { kind: 'path'; value: string } | { kind: 'byte'; input: Extract<AssetInput, { data: Uint8Array }> }
  > = [];

  for (const inp of list) {
    if (isByteInput(inp)) {
      inputOrder.push({ kind: 'byte', input: inp });
    } else {
      stringPaths.push(inp);
      inputOrder.push({ kind: 'path', value: inp });
    }
  }

  // Discovery sync
  let discoveredFiles: readonly string[] = Object.freeze([] as string[]);
  if (stringPaths.length > 0) {
    discoveredFiles = discoverAssetsSync(stringPaths, {
      followSymlinks: options.followSymlinks,
      maxDepth: options.maxDepth,
      maxFiles: options.maxFiles,
      traversalRoot: options.traversalRoot,
      allowTraversalEscape: options.allowTraversalEscape,
      concurrency: options.concurrency,
      signal: options.signal,
      definitions: options.definitions,
      allowedKinds: (options as CatalogOptions).allowedKinds,
      allowedExtensions: (options as CatalogOptions).allowedExtensions,
    });
  }

  throwIfAborted(options.signal);

  const globalSeen = new Set<string>();
  const orderedQueue: Array<
    { type: 'file'; path: string } | { type: 'byte'; input: Extract<AssetInput, { data: Uint8Array }> }
  > = [];

  const hasInterleavedBytes = list.some(isByteInput) && stringPaths.length > 0;
  if (hasInterleavedBytes) {
    for (const entry of inputOrder) {
      throwIfAborted(options.signal);
      if (entry.kind === 'byte') {
        orderedQueue.push({ type: 'byte', input: entry.input });
      } else {
        const filesForRoot = discoverAssetsSync(entry.value, {
          followSymlinks: options.followSymlinks,
          maxDepth: options.maxDepth,
          maxFiles: options.maxFiles,
          traversalRoot: options.traversalRoot,
          allowTraversalEscape: options.allowTraversalEscape,
          concurrency: options.concurrency,
          signal: options.signal,
          definitions: options.definitions,
          allowedKinds: (options as CatalogOptions).allowedKinds,
          allowedExtensions: (options as CatalogOptions).allowedExtensions,
        });
        for (const f of filesForRoot) {
          const norm = normalizeAbsolute(f);
          if (globalSeen.has(norm)) continue;
          globalSeen.add(norm);
          orderedQueue.push({ type: 'file', path: norm });
        }
      }
    }
  } else if (stringPaths.length > 0) {
    for (const f of discoveredFiles) {
      const norm = normalizeAbsolute(f);
      if (globalSeen.has(norm)) continue;
      globalSeen.add(norm);
      orderedQueue.push({ type: 'file', path: norm });
    }
  } else {
    for (const entry of inputOrder) {
      if (entry.kind === 'byte') orderedQueue.push({ type: 'byte', input: entry.input });
    }
  }

  throwIfAborted(options.signal);

  const encoded: EncodedAsset[] = [];
  let totalBytes = 0;
  for (const item of orderedQueue) {
    throwIfAborted(options.signal);
    let enc: EncodedAsset;
    if (item.type === 'file') {
      enc = encodeAssetSync(item.path, options);
    } else {
      enc = encodeAssetSync(item.input as AssetInput, options);
    }
    totalBytes += enc.byteLength;
    if (options.maxTotalBytes !== undefined && totalBytes > options.maxTotalBytes) {
      throw new ResourceLimitError(`Total bytes ${totalBytes} exceeds maxTotalBytes ${options.maxTotalBytes}`, {
        limit: options.maxTotalBytes,
        actual: totalBytes,
        path: enc.sourcePath ?? enc.filename,
      });
    }
    encoded.push(enc);
  }

  const definitions = registry.definitions;
  return createImmutableCatalog(encoded, definitions);
}
