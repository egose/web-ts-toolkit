/**
 * Resolver — URL classification, safe percent-decoding, and filesystem matching.
 *
 * Responsibilities:
 * - Classify and skip remote, protocol-relative, data:, blob:, fragment-only, non-local refs.
 * - Decode only URL-syntax safe for filesystem matching; reject malformed or NUL-containing paths.
 * - Never interpret query/fragment as path segment (strip before filesystem lookup).
 * - Resolve relative to `documentPath` or explicit `rootDir` using POSIX semantics for URLs,
 *   without depending on host separator for logical URL parsing.
 * - Raise `AmbiguousAssetError` for duplicate basename candidates.
 * - Provide narrow custom matcher/resolver hook (`AssetResolver`) that does not require parser AST knowledge.
 */

import path from 'node:path';
import type { AssetCatalog, ResolverInput, AssetResolver } from './types.ts';
import type { EncodedAsset } from './types.ts';
import { InvalidOptionsError } from './errors.ts';

// ---------------------------------------------------------------------------
// Classification — skip non-local refs before filesystem work
// ---------------------------------------------------------------------------

export type UrlClassification =
  | { readonly kind: 'local'; readonly url: string }
  | { readonly kind: 'skip'; readonly reason: string };

const SKIP_REASONS = {
  empty: 'empty reference',
  fragment: 'fragment-only reference',
  data: 'data: URL',
  blob: 'blob: URL',
  protocolRelative: 'protocol-relative URL',
  remote: 'remote URL with scheme',
} as const;

/**
 * Classify a URL as local (needs filesystem resolution) or skippable.
 * Skippable includes: empty, fragment-only, data:, blob:, protocol-relative (//), and any scheme (http:, https:, ftp:, mailto:, etc.).
 * This runs before filesystem resolution and decoding.
 */
export function classifyUrl(url: string): UrlClassification {
  if (typeof url !== 'string') {
    return { kind: 'skip', reason: SKIP_REASONS.empty };
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) return { kind: 'skip', reason: SKIP_REASONS.empty };
  if (trimmed.startsWith('#')) return { kind: 'skip', reason: SKIP_REASONS.fragment };
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:')) return { kind: 'skip', reason: SKIP_REASONS.data };
  if (lower.startsWith('blob:')) return { kind: 'skip', reason: SKIP_REASONS.blob };
  if (trimmed.startsWith('//')) return { kind: 'skip', reason: SKIP_REASONS.protocolRelative };
  // Any scheme like "http:", "https:", "ftp:", "mailto:", "tel:", "file:", etc. is remote/non-local.
  // We check for scheme pattern before any slash: scheme = alpha + alnum+.- then colon.
  // But we must not misclassify Windows drive letter "C:\path" as scheme; URLs use forward slash,
  // and Windows drive absolute is "C:/" or "C:\" . We treat "C:" as not a URL scheme for resolver:
  // only consider scheme if url contains ':' before any '/' and the before-colon part matches scheme and is not single letter drive.
  // Simpler: if matches /^[a-z][a-z0-9+.-]*:/i and length of scheme >1 or not single letter + slash/backslash, treat as remote.
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    // Allow single-letter scheme only if followed by "//" ? But we already handled // ; for drive letters like "C:/", "C:\",
    // the URL reference for assets would be like "C:/foo.png" which is not a web URL; we could treat as local filesystem path?
    // However resolver is for web URLs (url(...), src), not filesystem drive refs. The spec says never resolve remote URLs,
    // but drive-letter paths are not web URLs, they could be considered local? Yet URL with drive letter would be unusual in CSS.
    // To avoid host separator dependence, we treat "C:" style as NOT remote if it looks like Windows absolute with slash/backslash after colon.
    // Check if trimmed matches /^[a-z]:[\\/]/i -> Windows absolute local path, not remote
    if (/^[a-z]:[\\/]/i.test(trimmed)) {
      // Windows absolute path used as URL — treat as local but will be normalized later
      return { kind: 'local', url: trimmed };
    }
    // Otherwise scheme length >1 or generic scheme => skip
    if (scheme.length > 1) {
      return { kind: 'skip', reason: SKIP_REASONS.remote };
    }
    // Single letter scheme without slash (e.g., "x:foo") — treat as remote as well to be safe, but rare
    return { kind: 'skip', reason: SKIP_REASONS.remote };
  }
  return { kind: 'local', url: trimmed };
}

/**
 * Whether the URL should be skipped (remote, data, blob, etc.). Convenience wrapper.
 */
export function isSkippableUrl(url: string): boolean {
  return classifyUrl(url).kind === 'skip';
}

// ---------------------------------------------------------------------------
// Decoding — URL-safe percent decoding for filesystem matching
// ---------------------------------------------------------------------------

/**
 * Strip query (?...) and fragment (#...) from a URL for filesystem matching.
 * Does NOT decode; only literal '?' and '#' delimiters are considered.
 * Percent-encoded %3F / %23 are preserved as part of path.
 */
export function stripQueryAndFragment(url: string): string {
  const qIdx = url.indexOf('?');
  const hIdx = url.indexOf('#');
  let end = url.length;
  if (qIdx !== -1 && hIdx !== -1) end = Math.min(qIdx, hIdx);
  else if (qIdx !== -1) end = qIdx;
  else if (hIdx !== -1) end = hIdx;
  return url.slice(0, end);
}

/**
 * Safely decode a URL path component for filesystem matching.
 * - Rejects NUL-containing paths (\x00) before or after decoding.
 * - Rejects malformed percent-encodings (e.g., "%", "%G0", incomplete trailing "%").
 * - Uses `decodeURIComponent` on the whole path; throws `InvalidOptionsError` on failure.
 * - Never interprets query/fragment as path segment (caller must strip first).
 */
export function decodeUrlPath(pathPart: string): string {
  if (pathPart.includes('\0') || pathPart.includes('\u0000')) {
    throw new InvalidOptionsError('URL path contains NUL byte');
  }
  // Early check for malformed percent: lone % or % not followed by two hex digits
  // We will validate via decodeURIComponent throwing, but also pre-check for stray % at end
  // decodeURIComponent throws URIError for malformed, which we map to InvalidOptionsError
  try {
    const decoded = decodeURIComponent(pathPart);
    if (decoded.includes('\0') || decoded.includes('\u0000')) {
      throw new InvalidOptionsError('Decoded URL path contains NUL byte');
    }
    return decoded;
  } catch (err) {
    if (err instanceof InvalidOptionsError) throw err;
    // decodeURIComponent throws URIError for malformed sequences
    throw new InvalidOptionsError(`Malformed URL percent-encoding in "${pathPart}"`, { cause: err });
  }
}

/**
 * Full pipeline: strip query/fragment then safely decode.
 * Throws on malformed or NUL.
 */
export function extractDecodedPath(url: string): string {
  const stripped = stripQueryAndFragment(url);
  return decodeUrlPath(stripped);
}

// ---------------------------------------------------------------------------
// Path resolution — relative to documentPath or rootDir, POSIX semantics
// ---------------------------------------------------------------------------

/**
 * Normalize logical URL path without depending on host separator.
 * - Converts backslashes "\" to "/" so Windows-style "a\\b\\c.png" becomes "a/b/c.png".
 * - Uses `path.posix.normalize` to collapse "." and ".." segments using POSIX rules.
 * - Preserves absolute leading "/" for later root-relative handling.
 */
export function normalizeLogicalUrlPath(decodedPath: string): string {
  const withForward = decodedPath.replace(/\\/g, '/');
  // posix.normalize will convert empty to "."; we want empty to stay empty for later checks
  if (withForward === '') return '';
  return path.posix.normalize(withForward);
}

/**
 * Resolve a decoded logical path to an absolute filesystem path.
 * - `decodedPath` must already be stripped of query/fragment and decoded, but may still contain POSIX separators.
 * - Resolves relative to `documentPath`'s directory, or `rootDir`, or `process.cwd()` in that priority.
 * - Absolute POSIX paths (starting with "/") are treated as root-relative to `rootDir` (or cwd) via "./" trick.
 */
export function resolveLogicalPathToAbsolute(
  decodedLogicalPath: string,
  opts: { documentPath?: string; rootDir?: string },
): string {
  const normalized = normalizeLogicalUrlPath(decodedLogicalPath);
  if (normalized === '' || normalized === '.') {
    throw new InvalidOptionsError(`URL path "${decodedLogicalPath}" resolves to empty after normalization`);
  }
  // Determine base directory
  const baseDir = opts.documentPath
    ? path.dirname(path.resolve(opts.documentPath))
    : opts.rootDir
      ? path.resolve(opts.rootDir)
      : process.cwd();

  // For absolute POSIX path ("/assets/foo.png"), resolve as root-relative to baseDir's root
  // Use path.posix handling: strip leading "/" and join to baseDir via path.resolve(baseDir, '.' + normalized)
  // This keeps Windows fixture compatibility without host separator dependence.
  let toResolve: string;
  if (normalized.startsWith('/')) {
    // Root-relative: treat as relative to rootDir/baseDir
    // Example: baseDir "/project/src", normalized "/assets/a.png" => "/project/assets/a.png" if rootDir is "/project"
    // If rootDir not specified but baseDir is document dir, then absolute URL's root is ambiguous; we resolve relative to cwd's root or baseDir's anchor.
    // Implementation: join root base (rootDir if given else process.cwd()) with normalized without leading slash?
    // But for simplicity, use baseDir as anchor for absolute too via "./" trick after stripping leading "/"
    const withoutLeading = normalized.slice(1);
    const rootAnchor = opts.rootDir ? path.resolve(opts.rootDir) : process.cwd();
    toResolve = path.resolve(rootAnchor, withoutLeading);
  } else {
    toResolve = path.resolve(baseDir, normalized);
  }
  // Normalize to absolute
  return path.resolve(toResolve);
}

// ---------------------------------------------------------------------------
// High-level resolver — combines classification, decoding, resolution, catalog lookup, ambiguity, hook
// ---------------------------------------------------------------------------

export interface ResolveAssetOptions {
  readonly documentPath?: string;
  readonly rootDir?: string;
  readonly allowBasenameMatch?: boolean;
  readonly resolver?: AssetResolver;
}

export interface ResolvedAsset {
  /** Matched asset, if found. */
  readonly asset?: EncodedAsset;
  /** Absolute filesystem path that was looked up (for diagnostics). */
  readonly resolvedPath?: string;
  /** Whether the URL was skipped (remote, data, etc.) and not resolved. */
  readonly skipped: boolean;
  /** Skip reason when `skipped` is true. */
  readonly skipReason?: string;
  /** Original URL. */
  readonly originalUrl: string;
}

/**
 * Resolve a single URL reference against a catalog.
 *
 * Steps in order:
 * 1. Classify and skip remote/protocol-relative/data:/blob:/fragment-only before any filesystem work.
 * 2. Strip query/fragment, safely percent-decode (reject malformed or NUL), normalize logical POSIX path.
 * 3. Resolve to absolute filesystem path relative to `documentPath` or `rootDir`.
 * 4. If `resolver` hook is provided, invoke it with narrow `ResolverInput` (originalUrl, decodedPath, basename, documentPath, rootDir).
 *    If hook returns an `EncodedAsset`, that asset is used and default lookup is skipped.
 *    Hook is only invoked for local URLs that passed steps 1-3 without error.
 * 5. Default lookup: exact path via `catalog.getByPath`. If not found and `allowBasenameMatch` is true,
 *    try basename via `catalog.getByBasename` (which throws `AmbiguousAssetError` on duplicate).
 * 6. Return `{ skipped: true }` for non-local refs, or `{ asset, resolvedPath }` for matches, or `{ asset: undefined }` for unresolved.
 *
 * Throws:
 * - `InvalidOptionsError` for malformed percent-encoding or NUL.
 * - `AmbiguousAssetError` when basename mode finds duplicates (from catalog.getByBasename).
 */
export async function resolveAssetReference(
  originalUrl: string,
  catalog: AssetCatalog,
  options: ResolveAssetOptions = {},
): Promise<ResolvedAsset> {
  const classification = classifyUrl(originalUrl);
  if (classification.kind === 'skip') {
    return {
      originalUrl,
      skipped: true,
      skipReason: classification.reason,
    };
  }

  // Strip query/fragment and decode
  const stripped = stripQueryAndFragment(classification.url);
  const decoded = decodeUrlPath(stripped);

  const normalizedLogical = normalizeLogicalUrlPath(decoded);
  // Empty after normalization is not a valid local file reference — treat as skipped? But we throw for empty?
  if (normalizedLogical === '' || normalizedLogical === '.') {
    throw new InvalidOptionsError(`URL "${originalUrl}" has empty path after normalization`);
  }

  const basename = path.posix.basename(normalizedLogical);

  // Custom hook — narrow typed inputs, no parser AST needed
  if (options.resolver) {
    const input: ResolverInput = Object.freeze({
      originalUrl,
      decodedPath: normalizedLogical,
      basename,
      ...(options.documentPath !== undefined ? { documentPath: options.documentPath } : {}),
      ...(options.rootDir !== undefined ? { rootDir: options.rootDir } : {}),
    }) as ResolverInput;
    const hookResult = await options.resolver(input, catalog);
    if (hookResult) {
      // Hook returned an asset directly — use it.
      // We still compute resolvedPath for diagnostics via normal resolution for observability.
      const hookResolvedPath = resolveLogicalPathToAbsolute(normalizedLogical, {
        documentPath: options.documentPath,
        rootDir: options.rootDir,
      });
      return {
        originalUrl,
        asset: hookResult,
        resolvedPath: hookResolvedPath,
        skipped: false,
      };
    }
    // Hook returned undefined => fall back to default
  }

  const absolute = resolveLogicalPathToAbsolute(normalizedLogical, {
    documentPath: options.documentPath,
    rootDir: options.rootDir,
  });

  // Exact match first
  const exact = catalog.getByPath(absolute);
  if (exact) {
    return {
      originalUrl,
      asset: exact,
      resolvedPath: absolute,
      skipped: false,
    };
  }

  if (options.allowBasenameMatch) {
    // Basename compatibility mode — may throw AmbiguousAssetError
    const byBase = catalog.getByBasename(basename);
    if (byBase) {
      return {
        originalUrl,
        asset: byBase,
        resolvedPath: absolute, // still report attempted absolute for diagnostics, but asset came from basename
        skipped: false,
      };
    }
  }

  // Unresolved local reference — not skipped, but no asset
  return {
    originalUrl,
    asset: undefined,
    resolvedPath: absolute,
    skipped: false,
  };
}

/**
 * Synchronous variant of `resolveAssetReference`. Requires `resolver` to be sync (or returns Promise which is not awaited — we throw).
 * For simplicity we support only sync resolvers in sync mode; async resolvers will throw.
 */
export function resolveAssetReferenceSync(
  originalUrl: string,
  catalog: AssetCatalog,
  options: ResolveAssetOptions = {},
): ResolvedAsset {
  const classification = classifyUrl(originalUrl);
  if (classification.kind === 'skip') {
    return {
      originalUrl,
      skipped: true,
      skipReason: classification.reason,
    };
  }

  const stripped = stripQueryAndFragment(classification.url);
  const decoded = decodeUrlPath(stripped); // throws on malformed/NUL
  const normalizedLogical = normalizeLogicalUrlPath(decoded);
  if (normalizedLogical === '' || normalizedLogical === '.') {
    throw new InvalidOptionsError(`URL "${originalUrl}" has empty path after normalization`);
  }
  const basename = path.posix.basename(normalizedLogical);

  if (options.resolver) {
    const input: ResolverInput = Object.freeze({
      originalUrl,
      decodedPath: normalizedLogical,
      basename,
      ...(options.documentPath !== undefined ? { documentPath: options.documentPath } : {}),
      ...(options.rootDir !== undefined ? { rootDir: options.rootDir } : {}),
    }) as ResolverInput;
    const hookResult = options.resolver(input, catalog) as EncodedAsset | undefined | Promise<EncodedAsset | undefined>;
    if (hookResult instanceof Promise) {
      throw new InvalidOptionsError('Async resolver cannot be used with sync API');
    }
    if (hookResult) {
      const hookResolvedPath = resolveLogicalPathToAbsolute(normalizedLogical, {
        documentPath: options.documentPath,
        rootDir: options.rootDir,
      });
      return {
        originalUrl,
        asset: hookResult,
        resolvedPath: hookResolvedPath,
        skipped: false,
      };
    }
  }

  const absolute = resolveLogicalPathToAbsolute(normalizedLogical, {
    documentPath: options.documentPath,
    rootDir: options.rootDir,
  });

  const exact = catalog.getByPath(absolute);
  if (exact) {
    return {
      originalUrl,
      asset: exact,
      resolvedPath: absolute,
      skipped: false,
    };
  }

  if (options.allowBasenameMatch) {
    const byBase = catalog.getByBasename(basename);
    if (byBase) {
      return {
        originalUrl,
        asset: byBase,
        resolvedPath: absolute,
        skipped: false,
      };
    }
  }

  return {
    originalUrl,
    asset: undefined,
    resolvedPath: absolute,
    skipped: false,
  };
}
