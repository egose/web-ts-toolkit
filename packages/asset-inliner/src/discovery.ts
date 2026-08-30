/** Discovery — deterministic filesystem traversal with canonical containment. */

import fs from 'node:fs';
import { readdir, lstat, stat as statAsync, realpath as realpathAsync } from 'node:fs/promises';
import path from 'node:path';
import type { AssetTypeDefinition } from './types.ts';
import type { DiscoveryOptions as BaseDiscoveryOptions } from './types.ts';
import { createDefinitionRegistry } from './definitions.ts';
import { InvalidOptionsError, FilesystemError, ResourceLimitError, UnsupportedAssetError } from './errors.ts';
import {
  validatePolicyValue,
  DEFAULT_MAX_DEPTH as POLICY_DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_FILES as POLICY_DEFAULT_MAX_FILES,
  DEFAULT_CONCURRENCY as POLICY_DEFAULT_CONCURRENCY,
} from './policy.ts';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateFinitePositiveInt(value: number | undefined, name: string): void {
  if (value === undefined) return;
  // Delegate to central policy validator with appropriate reasonable max
  const caps: Record<string, number> = {
    maxDepth: 256,
    maxFiles: 100_000,
    concurrency: 64,
    maxTargets: 5_000,
  };
  const cap = caps[name] ?? 64;
  validatePolicyValue(name, value, cap);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
  } else if (signal.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

function normalizeAbsolute(p: string): string {
  return path.resolve(p);
}

function isWithinRoot(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  // '' means same as root, otherwise should not start with '..' + sep or be '..' alone
  if (rel === '') return true;
  if (rel.startsWith('..' + path.sep) || rel === '..') return false;
  // On POSIX, relative that is absolute? but path.relative handles.
  // Also prevent escaping via absolute path outside root: rel starts with ..
  return !path.isAbsolute(rel) || !rel.startsWith('..');
}

// Determine whether extension passes filters before expensive reads.
// Returns true if file should be considered for inclusion.
function passesExtensionFilter(
  ext: string,
  opts: BaseDiscoveryOptions & { definitions?: readonly AssetTypeDefinition[] },
  registry: ReturnType<typeof createDefinitionRegistry> | undefined,
): boolean {
  const lowerExt = ext.toLowerCase();
  // allowedExtensions takes precedence if provided
  if (opts.allowedExtensions && opts.allowedExtensions.length > 0) {
    const normalizedAllowed = opts.allowedExtensions.map((e: string) => {
      const trimmed = e.trim();
      const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
      return withDot.toLowerCase();
    });
    return normalizedAllowed.includes(lowerExt);
  }
  if (opts.allowedKinds && opts.allowedKinds.length > 0) {
    // Need registry to map extension to kind
    if (!registry) return false;
    const def = (() => {
      try {
        return registry.get(lowerExt);
      } catch {
        return undefined;
      }
    })();
    if (!def) return false;
    return (opts.allowedKinds as readonly string[]).includes(def.kind);
  }
  if (registry) {
    try {
      return registry.has(lowerExt);
    } catch {
      return false;
    }
  }
  // No filter configured -> allow all (catalog encoding will later validate)
  return true;
}

// Build registry for filtering if definitions provided — reuses validated registry when available.
function getRegistryForFilter(
  options: BaseDiscoveryOptions & {
    definitions?: readonly AssetTypeDefinition[];
    registry?: import('./definitions.ts').AssetDefinitionRegistry;
  },
) {
  if (options.registry) {
    if (options.definitions) {
      throw new InvalidOptionsError('Provide either registry or definitions, not both for discovery');
    }
    return options.registry;
  }
  if (options.definitions) {
    return createDefinitionRegistry(options.definitions);
  }
  // If allowedKinds present we need a registry to resolve kind.
  if (options.allowedKinds) {
    return createDefinitionRegistry();
  }
  // If neither, but we still want to know allowed extensions for directory ignore vs explicit error,
  // use built-ins as default filter when not otherwise specified? Task says apply extension/kind filters
  // before expensive reads while distinguishing unsupported explicit files vs ignored directory entries.
  // Default should be built-in registry: directory entries with unsupported extensions are ignored,
  // explicit unsupported files should throw. So we use built-ins when no explicit filter.
  return createDefinitionRegistry();
}

// ---------------------------------------------------------------------------
// Core options normalization
// ---------------------------------------------------------------------------

export interface DiscoverOptions extends BaseDiscoveryOptions {
  readonly definitions?: readonly AssetTypeDefinition[];
  readonly registry?: import('./definitions.ts').AssetDefinitionRegistry;
}

const DEFAULT_MAX_DEPTH = POLICY_DEFAULT_MAX_DEPTH;
const DEFAULT_MAX_FILES = POLICY_DEFAULT_MAX_FILES;
const DEFAULT_CONCURRENCY = POLICY_DEFAULT_CONCURRENCY;

function normalizeDiscoverOptions(opts: DiscoverOptions = {}): DiscoverOptions & {
  followSymlinks: boolean;
  maxDepth: number;
  maxFiles: number;
  concurrency: number;
  allowTraversalEscape: boolean;
  traversalRoot?: string;
} {
  validateFinitePositiveInt(opts.maxDepth, 'maxDepth');
  validateFinitePositiveInt(opts.maxFiles, 'maxFiles');
  validateFinitePositiveInt(opts.concurrency, 'concurrency');
  if (opts.traversalRoot !== undefined && typeof opts.traversalRoot !== 'string') {
    throw new InvalidOptionsError('traversalRoot must be a string');
  }
  if (opts.followSymlinks !== undefined && typeof opts.followSymlinks !== 'boolean') {
    throw new InvalidOptionsError('followSymlinks must be boolean');
  }
  if (opts.allowTraversalEscape !== undefined && typeof opts.allowTraversalEscape !== 'boolean') {
    throw new InvalidOptionsError('allowTraversalEscape must be boolean');
  }
  if (opts.registry !== undefined && opts.definitions !== undefined) {
    throw new InvalidOptionsError('Provide either registry or definitions, not both for discovery');
  }
  return {
    followSymlinks: opts.followSymlinks ?? false,
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxFiles: opts.maxFiles ?? DEFAULT_MAX_FILES,
    concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
    traversalRoot: opts.traversalRoot !== undefined ? normalizeAbsolute(opts.traversalRoot) : undefined,
    allowTraversalEscape: opts.allowTraversalEscape ?? false,
    definitions: opts.definitions,
    registry: opts.registry,
    allowedKinds: opts.allowedKinds,
    allowedExtensions: opts.allowedExtensions,
    signal: opts.signal,
  };
}

type NormalizedDiscoverOptions = ReturnType<typeof normalizeDiscoverOptions>;

/** Shared state for one discovery operation (async or sync). */
interface WalkState {
  readonly opts: NormalizedDiscoverOptions;
  readonly registry: ReturnType<typeof createDefinitionRegistry>;
  /** Canonical root identity (`realpath` of `traversalRoot`), when configured. */
  readonly canonicalRoot: string | undefined;
  /** Canonical identities already accepted (dedupe key). */
  readonly seen: Set<string>;
  /** Canonical directory identities already walked (cycle/alias guard). */
  readonly visitedDirs: Set<string>;
  /** First-seen logical paths in deterministic emission order. */
  readonly result: string[];
}

function pushIfNew(state: WalkState, logical: string, canonical: string): void {
  const { opts } = state;
  if (state.seen.has(canonical)) return;
  if (state.result.length >= opts.maxFiles) {
    throw new ResourceLimitError(`Discovered file count ${state.result.length + 1} exceeds maxFiles ${opts.maxFiles}`, {
      limit: opts.maxFiles,
      actual: state.result.length + 1,
      path: logical,
    });
  }
  state.seen.add(canonical);
  state.result.push(logical);
}

/**
 * Canonical containment gate: reject when a canonicalized identity resolves
 * outside the canonical traversal root. No-op unless `traversalRoot` is
 * configured and `allowTraversalEscape` is not set.
 */
function assertContained(state: WalkState, logical: string, canonical: string): void {
  if (!state.canonicalRoot || state.opts.allowTraversalEscape) return;
  if (!isWithinRoot(canonical, state.canonicalRoot)) {
    throw new FilesystemError(
      `Traversal escape denied: "${logical}" resolves to "${canonical}" outside root "${state.canonicalRoot}"`,
      { path: logical, operation: 'traversalRoot' },
    );
  }
}

// ---------------------------------------------------------------------------
// Async discovery
// ---------------------------------------------------------------------------

/**
 * Discover asset files from explicit paths and directories.
 * - Lexical depth-first entry order within directories, caller order between roots.
 * - Deduplicates by canonical (`realpath`) identity; reports first-seen logical paths.
 * - Canonical containment under `traversalRoot` unless `allowTraversalEscape` is set;
 *   a regular file beneath a symlinked ancestor cannot escape the root.
 * - Applies extension/kind filters before reads; explicit unsupported files throw
 *   `UnsupportedAssetError`, directory entries that miss the filter are silently skipped.
 * - Respects `followSymlinks` (false by default), cycle detection, depth, count.
 *   Traversal is serial; `concurrency` is validated but does not accelerate discovery.
 * - Throws `FilesystemError` for missing explicit paths or permission errors.
 */
export async function discoverAssets(
  inputs: string | readonly string[],
  options: DiscoverOptions = {},
): Promise<readonly string[]> {
  const opts = normalizeDiscoverOptions(options);
  throwIfAborted(opts.signal);

  const roots = Array.isArray(inputs) ? [...inputs] : [inputs];
  if (roots.length === 0) return Object.freeze([] as string[]);

  // Canonicalize the traversal root once; all containment checks compare
  // canonical identities, never lexical paths.
  let canonicalRoot: string | undefined;
  if (opts.traversalRoot && !opts.allowTraversalEscape) {
    try {
      canonicalRoot = await realpathAsync(opts.traversalRoot);
    } catch (err) {
      throw new FilesystemError(`Failed to canonicalize traversalRoot "${opts.traversalRoot}"`, {
        path: opts.traversalRoot,
        operation: 'realpath',
        cause: err,
      });
    }
  }

  const state: WalkState = {
    opts,
    registry: getRegistryForFilter(opts),
    canonicalRoot,
    seen: new Set(),
    visitedDirs: new Set(),
    result: [],
  };

  // Recursive depth-first walk: each sorted entry's subtree is fully processed
  // before the next sibling entry, giving one deterministic lexical entry order.
  // Traversal is intentionally serial so result order never depends on
  // parallel completion; `concurrency` does not accelerate discovery.
  async function walkDir(dirAbs: string, depth: number): Promise<void> {
    throwIfAborted(opts.signal);
    if (depth > opts.maxDepth) {
      throw new ResourceLimitError(`Traversal depth ${depth} exceeds maxDepth ${opts.maxDepth} at "${dirAbs}"`, {
        limit: opts.maxDepth,
        actual: depth,
        path: dirAbs,
      });
    }
    let entries: string[];
    try {
      entries = await readdir(dirAbs);
    } catch (err) {
      throw new FilesystemError(`Failed to read directory "${dirAbs}"`, {
        path: dirAbs,
        operation: 'readdir',
        cause: err,
      });
    }
    entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    throwIfAborted(opts.signal);

    for (const entry of entries) {
      throwIfAborted(opts.signal);
      const entryAbs = path.resolve(dirAbs, entry);

      let lst: fs.Stats;
      try {
        lst = await lstat(entryAbs);
      } catch (err) {
        throw new FilesystemError(`Failed to stat "${entryAbs}"`, {
          path: entryAbs,
          operation: 'lstat',
          cause: err,
        });
      }
      const isSym = lst.isSymbolicLink();
      // Never follow a symlink entry unless explicitly allowed; the entry is
      // skipped entirely rather than inspected through its target.
      if (isSym && !opts.followSymlinks) continue;

      let statToUse = lst;
      let canonical: string;
      try {
        canonical = await realpathAsync(entryAbs);
      } catch (err) {
        throw new FilesystemError(`Failed to canonicalize "${entryAbs}"`, {
          path: entryAbs,
          operation: 'realpath',
          cause: err,
        });
      }
      assertContained(state, entryAbs, canonical);
      if (isSym) {
        try {
          statToUse = await statAsync(canonical);
        } catch (err) {
          throw new FilesystemError(`Failed to stat symlink target "${entryAbs}" -> "${canonical}"`, {
            path: entryAbs,
            operation: 'stat',
            cause: err,
          });
        }
      }

      if (statToUse.isDirectory()) {
        if (depth + 1 > opts.maxDepth) {
          throw new ResourceLimitError(
            `Traversal depth ${depth + 1} exceeds maxDepth ${opts.maxDepth} at "${entryAbs}"`,
            { limit: opts.maxDepth, actual: depth + 1, path: entryAbs },
          );
        }
        // Cycle/alias guard on canonical directory identity.
        if (state.visitedDirs.has(canonical)) continue;
        state.visitedDirs.add(canonical);
        // Depth-first: process this entry's subtree before later siblings.
        await walkDir(entryAbs, depth + 1);
      } else if (statToUse.isFile()) {
        const ext = path.extname(entryAbs).toLowerCase();
        // Directory entry: silently skip if not passing filter
        if (!passesExtensionFilter(ext, opts, state.registry)) continue;
        pushIfNew(state, normalizeAbsolute(entryAbs), canonical);
      } else {
        // Other types (FIFO, socket) -> ignore
        continue;
      }
    }
  }

  // Process each caller root in order
  for (const rawRoot of roots) {
    throwIfAborted(opts.signal);
    if (typeof rawRoot !== 'string' || rawRoot.trim().length === 0) {
      throw new InvalidOptionsError(`Discovery path must be a non-empty string, got ${String(rawRoot)}`, {
        path: String(rawRoot),
      });
    }
    const rootAbs = normalizeAbsolute(rawRoot);
    let lst: fs.Stats;
    try {
      lst = await lstat(rootAbs);
    } catch (err) {
      throw new FilesystemError(`Missing explicit path "${rawRoot}" (resolved "${rootAbs}")`, {
        path: rootAbs,
        operation: 'lstat',
        cause: err,
      });
    }
    const isSym = lst.isSymbolicLink();
    // Explicit symlink root with followSymlinks false is not followed: skip.
    if (isSym && !opts.followSymlinks) continue;

    let statToUse = lst;
    let canonical: string;
    try {
      canonical = await realpathAsync(rootAbs);
    } catch (err) {
      throw new FilesystemError(`Failed to canonicalize "${rootAbs}"`, {
        path: rootAbs,
        operation: 'realpath',
        cause: err,
      });
    }
    // Canonical containment applies even when the final path component is a
    // plain regular file or directory reached through a symlinked ancestor.
    assertContained(state, rootAbs, canonical);
    if (isSym) {
      try {
        statToUse = await statAsync(canonical);
      } catch (err) {
        throw new FilesystemError(`Failed to stat symlink target "${rootAbs}"`, {
          path: rootAbs,
          operation: 'stat',
          cause: err,
        });
      }
    }

    if (statToUse.isDirectory()) {
      if (state.visitedDirs.has(canonical)) continue;
      state.visitedDirs.add(canonical);
      await walkDir(rootAbs, 1);
    } else if (statToUse.isFile()) {
      const ext = path.extname(rootAbs).toLowerCase();
      // Explicit file: must surface unsupported distinctly
      if (!passesExtensionFilter(ext, opts, state.registry)) {
        throw new UnsupportedAssetError(`Unsupported asset extension "${ext}" for explicit file "${rootAbs}"`, {
          extension: ext,
          path: rootAbs,
        });
      }
      pushIfNew(state, rootAbs, canonical);
    } else {
      // Ignore other types
      continue;
    }
  }

  return Object.freeze([...state.result]) as readonly string[];
}

// ---------------------------------------------------------------------------
// Sync discovery
// ---------------------------------------------------------------------------

/**
 * Synchronous variant of `discoverAssets`. Semantics match the async version,
 * including canonical containment and lexical depth-first entry order.
 * `signal.aborted` is checked between stages.
 */
export function discoverAssetsSync(
  inputs: string | readonly string[],
  options: DiscoverOptions = {},
): readonly string[] {
  const opts = normalizeDiscoverOptions(options);
  throwIfAborted(opts.signal);

  const roots = Array.isArray(inputs) ? [...inputs] : [inputs];
  if (roots.length === 0) return Object.freeze([] as string[]);

  let canonicalRoot: string | undefined;
  if (opts.traversalRoot && !opts.allowTraversalEscape) {
    try {
      canonicalRoot = fs.realpathSync(opts.traversalRoot);
    } catch (err) {
      throw new FilesystemError(`Failed to canonicalize traversalRoot "${opts.traversalRoot}"`, {
        path: opts.traversalRoot,
        operation: 'realpathSync',
        cause: err,
      });
    }
  }

  const state: WalkState = {
    opts,
    registry: getRegistryForFilter(opts),
    canonicalRoot,
    seen: new Set(),
    visitedDirs: new Set(),
    result: [],
  };

  function walkDirSync(dirAbs: string, depth: number): void {
    throwIfAborted(opts.signal);
    if (depth > opts.maxDepth) {
      throw new ResourceLimitError(`Traversal depth ${depth} exceeds maxDepth ${opts.maxDepth} at "${dirAbs}"`, {
        limit: opts.maxDepth,
        actual: depth,
        path: dirAbs,
      });
    }
    let entries: string[];
    try {
      entries = fs.readdirSync(dirAbs);
    } catch (err) {
      throw new FilesystemError(`Failed to read directory "${dirAbs}"`, {
        path: dirAbs,
        operation: 'readdirSync',
        cause: err,
      });
    }
    entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    throwIfAborted(opts.signal);

    for (const entry of entries) {
      throwIfAborted(opts.signal);
      const entryAbs = path.resolve(dirAbs, entry);
      let lst: fs.Stats;
      try {
        lst = fs.lstatSync(entryAbs);
      } catch (err) {
        throw new FilesystemError(`Failed to stat "${entryAbs}"`, {
          path: entryAbs,
          operation: 'lstatSync',
          cause: err,
        });
      }
      const isSym = lst.isSymbolicLink();
      if (isSym && !opts.followSymlinks) continue;

      let statToUse = lst;
      let canonical: string;
      try {
        canonical = fs.realpathSync(entryAbs);
      } catch (err) {
        throw new FilesystemError(`Failed to canonicalize "${entryAbs}"`, {
          path: entryAbs,
          operation: 'realpathSync',
          cause: err,
        });
      }
      assertContained(state, entryAbs, canonical);
      if (isSym) {
        try {
          statToUse = fs.statSync(canonical);
        } catch (err) {
          throw new FilesystemError(`Failed to stat symlink target "${entryAbs}" -> "${canonical}"`, {
            path: entryAbs,
            operation: 'statSync',
            cause: err,
          });
        }
      }

      if (statToUse.isDirectory()) {
        if (depth + 1 > opts.maxDepth) {
          throw new ResourceLimitError(
            `Traversal depth ${depth + 1} exceeds maxDepth ${opts.maxDepth} at "${entryAbs}"`,
            { limit: opts.maxDepth, actual: depth + 1, path: entryAbs },
          );
        }
        if (state.visitedDirs.has(canonical)) continue;
        state.visitedDirs.add(canonical);
        walkDirSync(entryAbs, depth + 1);
      } else if (statToUse.isFile()) {
        const ext = path.extname(entryAbs).toLowerCase();
        if (!passesExtensionFilter(ext, opts, state.registry)) continue;
        pushIfNew(state, normalizeAbsolute(entryAbs), canonical);
      }
    }
  }

  for (const rawRoot of roots) {
    throwIfAborted(opts.signal);
    if (typeof rawRoot !== 'string' || rawRoot.trim().length === 0) {
      throw new InvalidOptionsError(`Discovery path must be a non-empty string, got ${String(rawRoot)}`, {
        path: String(rawRoot),
      });
    }
    const rootAbs = normalizeAbsolute(rawRoot);
    let lst: fs.Stats;
    try {
      lst = fs.lstatSync(rootAbs);
    } catch (err) {
      throw new FilesystemError(`Missing explicit path "${rawRoot}" (resolved "${rootAbs}")`, {
        path: rootAbs,
        operation: 'lstatSync',
        cause: err,
      });
    }
    const isSym = lst.isSymbolicLink();
    if (isSym && !opts.followSymlinks) continue;

    let statToUse = lst;
    let canonical: string;
    try {
      canonical = fs.realpathSync(rootAbs);
    } catch (err) {
      throw new FilesystemError(`Failed to canonicalize "${rootAbs}"`, {
        path: rootAbs,
        operation: 'realpathSync',
        cause: err,
      });
    }
    assertContained(state, rootAbs, canonical);
    if (isSym) {
      try {
        statToUse = fs.statSync(canonical);
      } catch (err) {
        throw new FilesystemError(`Failed to stat symlink target "${rootAbs}"`, {
          path: rootAbs,
          operation: 'statSync',
          cause: err,
        });
      }
    }

    if (statToUse.isDirectory()) {
      if (state.visitedDirs.has(canonical)) continue;
      state.visitedDirs.add(canonical);
      walkDirSync(rootAbs, 1);
    } else if (statToUse.isFile()) {
      const ext = path.extname(rootAbs).toLowerCase();
      if (!passesExtensionFilter(ext, opts, state.registry)) {
        throw new UnsupportedAssetError(`Unsupported asset extension "${ext}" for explicit file "${rootAbs}"`, {
          extension: ext,
          path: rootAbs,
        });
      }
      pushIfNew(state, rootAbs, canonical);
    }
  }

  return Object.freeze([...state.result]) as readonly string[];
}
