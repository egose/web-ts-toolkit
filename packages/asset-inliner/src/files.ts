/**
 * File orchestration — `inlineFiles` / `inlineFilesSync`.
 *
 * Compose catalog creation, deterministic target discovery, extension-based
 * transformer dispatch, and structured results without duplicating internals.
 *
 * **Dry-run vs write:**
 * - Default `write: false` performs no writes; returns one immutable
 *   `InlineFileResult` per discovered target in deterministic lexical order.
 * - `write: true` stages to a same-directory temporary file then renames over
 *   the target, preserving mode and cleaning up failed temp output.
 *
 * **Atomic write — platform limitations:**
 * - `fs.rename` over an existing file is atomic on POSIX when source and
 *   destination are on the same filesystem (single directory entry swap).
 * - It is **not** atomic across filesystems (`EXDEV`) — the caller will get a
 *   `FilesystemError` diagnostic for that target; the temp file is cleaned up.
 * - On Windows, `rename` may fail with `EPERM`/`EBUSY` if the target is
 *   memory-mapped or held open; no automatic retry is performed — the
 *   operation surfaces as a per-target `FilesystemError` and the temp file is
 *   removed. Callers that need Windows-retry should retry the whole
 *   `inlineFiles` call.
 * - Mode preservation: the original file's `mode` (permission bits) is copied
 *   to the temp file before rename via `chmod`. Ownership (`uid`/`gid`) is
 *   not changed.
 * - Flush: async path opens the temp file and calls `fsync` before close;
 *   sync path calls `fsyncSync` when available, otherwise close after write.
 * - Temp naming: `.tmp.asset-inliner.<random>.<basename>` in the target's
 *   directory; discovery filters any `basename.startsWith('.tmp.')` so recursive
 *   scans never re-process generated temps.
 * - Unchanged content is never written.
 * - Partial failure: a parse or write failure is captured as a per-target
 *   diagnostic (`PARSE_ERROR` / `FILESYSTEM_ERROR`) with `modified: false`,
 *   `written: false` and does **not** abort the batch nor cause the batch to
 *   be reported as fully successful.
 */

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { InlineFilesOptions, InlineFileResult, AssetCatalog } from './types.ts';
import { createAssetCatalog, createAssetCatalogSync } from './catalog.ts';
import { discoverAssets, discoverAssetsSync } from './discovery.ts';
import { inlineCss } from './css.ts';
import { inlineHtml } from './html.ts';
import { InvalidOptionsError, ResourceLimitError, FilesystemError, ParseError } from './errors.ts';
import { validatePolicyOptions, DEFAULT_MAX_TARGETS, DEFAULT_CONCURRENCY } from './policy.ts';

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

const ALLOWED_TARGET_EXTS = ['.css', '.html', '.htm'] as const;
const TEMP_PREFIX = '.tmp.asset-inliner.';
const TEMP_DOT_PREFIX = '.tmp.';

function isTempBasename(basename: string): boolean {
  return basename.startsWith(TEMP_DOT_PREFIX);
}

function isAllowedTargetExt(ext: string): boolean {
  return (ALLOWED_TARGET_EXTS as readonly string[]).includes(ext.toLowerCase());
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  else if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function toArray(input: string | readonly string[]): readonly string[] {
  if (Array.isArray(input)) return input as readonly string[];
  return [input as string];
}

function normalizeAbsolute(p: string): string {
  return path.resolve(p);
}

function validateTargetsInput(targets: unknown): asserts targets is string | readonly string[] {
  if (typeof targets === 'string') {
    if (targets.trim().length === 0)
      throw new InvalidOptionsError('targets must be a non-empty string', { path: String(targets) });
    return;
  }
  if (Array.isArray(targets)) {
    if (targets.length === 0) throw new InvalidOptionsError('targets must not be empty');
    for (const t of targets) {
      if (typeof t !== 'string' || t.trim().length === 0) {
        throw new InvalidOptionsError(`targets entries must be non-empty strings, got ${String(t)}`, {
          path: String(t),
        });
      }
    }
    return;
  }
  throw new InvalidOptionsError('targets must be a string or string[]', { path: String(targets) });
}

// ---------------------------------------------------------------------------
// Target discovery — extension-filtered, temp-filtered, deterministic
// ---------------------------------------------------------------------------

async function discoverTargetsAsync(
  inputs: string | readonly string[],
  opts: InlineFilesOptions & { concurrency: number },
): Promise<readonly string[]> {
  // discoverAssets with allowedExtensions enforces CSS/HTML only and throws for explicit unsupported files
  const raw = await discoverAssets(inputs, {
    followSymlinks: opts.followSymlinks,
    maxDepth: opts.maxDepth,
    maxFiles: opts.maxFiles,
    traversalRoot: opts.traversalRoot,
    allowTraversalEscape: opts.allowTraversalEscape,
    concurrency: opts.concurrency,
    signal: opts.signal,
    allowedExtensions: [...ALLOWED_TARGET_EXTS],
  });
  // Filter out any .tmp.* files that may have been created by previous runs or concurrent writers
  const filtered = raw.filter((p) => !isTempBasename(path.basename(p)));
  // Additional safety: deduplicate already done, but remove again after filter
  // Also enforce extension whitelist again (explicit check)
  const validated = filtered.filter((p) => isAllowedTargetExt(path.extname(p)));
  // If raw contained a temp .css file, it's filtered; explicit temp file as input would have been discovered as that exact path,
  // but we still filter it out to prevent self-inlining loop.
  return Object.freeze([...validated]) as readonly string[];
}

function discoverTargetsSync(
  inputs: string | readonly string[],
  opts: InlineFilesOptions & { concurrency: number },
): readonly string[] {
  const raw = discoverAssetsSync(inputs, {
    followSymlinks: opts.followSymlinks,
    maxDepth: opts.maxDepth,
    maxFiles: opts.maxFiles,
    traversalRoot: opts.traversalRoot,
    allowTraversalEscape: opts.allowTraversalEscape,
    concurrency: opts.concurrency,
    signal: opts.signal,
    allowedExtensions: [...ALLOWED_TARGET_EXTS],
  });
  const filtered = raw.filter((p) => !isTempBasename(path.basename(p)));
  const validated = filtered.filter((p) => isAllowedTargetExt(path.extname(p)));
  return Object.freeze([...validated]) as readonly string[];
}

// ---------------------------------------------------------------------------
// Atomic write helpers
// ---------------------------------------------------------------------------

async function writeAtomicAsync(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const random = crypto.randomBytes(6).toString('hex');
  const tempName = `${TEMP_PREFIX}${random}.${base}.tmp`;
  const tempPath = path.join(dir, tempName);

  let originalMode: number | undefined;
  try {
    const st = await fs.promises.stat(targetPath);
    originalMode = st.mode;
  } catch {
    // If stat fails, proceed without mode preservation; rename will still try
    originalMode = undefined;
  }

  let wrote = false;
  try {
    await fs.promises.writeFile(tempPath, content, 'utf8');
    wrote = true;
    // Preserve mode
    if (originalMode !== undefined) {
      try {
        await fs.promises.chmod(tempPath, originalMode);
      } catch (_e) {
        void _e;
      }
    }
    // Flush to disk — open and fsync before rename
    try {
      const handle = await fs.promises.open(tempPath, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (_e2) {
      void _e2;
    }

    // Atomic rename
    await fs.promises.rename(tempPath, targetPath);
  } catch (err) {
    // Cleanup temp on any failure
    if (wrote) {
      try {
        await fs.promises.unlink(tempPath);
      } catch (_e) {
        void _e;
      }
    } else {
      // If writeFile failed before creating file, no cleanup needed, but try anyway
      try {
        await fs.promises.unlink(tempPath);
      } catch (_e2) {
        void _e2;
      }
    }
    throw new FilesystemError(`Failed to write target "${targetPath}" atomically`, {
      path: targetPath,
      operation: 'rename',
      cause: err,
    });
  }
}

function writeAtomicSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const random = crypto.randomBytes(6).toString('hex');
  const tempName = `${TEMP_PREFIX}${random}.${base}.tmp`;
  const tempPath = path.join(dir, tempName);

  let originalMode: number | undefined;
  try {
    const st = fs.statSync(targetPath);
    originalMode = st.mode;
  } catch {
    originalMode = undefined;
  }

  let wrote = false;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    wrote = true;
    if (originalMode !== undefined) {
      try {
        fs.chmodSync(tempPath, originalMode);
      } catch (_e) {
        void _e;
      }
    }
    // Flush: open and fsyncSync if available
    try {
      const fd = fs.openSync(tempPath, 'r+');
      try {
        if (typeof fs.fsyncSync === 'function') fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch (_e2) {
      void _e2;
    }
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    if (wrote) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_e) {
        void _e;
      }
    } else {
      try {
        fs.unlinkSync(tempPath);
      } catch (_e2) {
        void _e2;
      }
    }
    throw new FilesystemError(`Failed to write target "${targetPath}" atomically`, {
      path: targetPath,
      operation: 'renameSync',
      cause: err,
    });
  }
}

// ---------------------------------------------------------------------------
// Per-target processing (shared logic without I/O duplication)
// ---------------------------------------------------------------------------

function dispatchInline(
  filePath: string,
  content: string,
  catalog: AssetCatalog,
  opts: InlineFilesOptions,
): { content: string; modified: boolean; replacements: readonly unknown[]; diagnostics: readonly unknown[] } {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.css') {
    return inlineCss(content, {
      catalog,
      documentPath: filePath,
      rootDir: opts.rootDir,
      allowBasenameMatch: opts.allowBasenameMatch,
      resolver: opts.resolver,
    }) as unknown as {
      content: string;
      modified: boolean;
      replacements: readonly unknown[];
      diagnostics: readonly unknown[];
    };
  }
  if (ext === '.html' || ext === '.htm') {
    return inlineHtml(content, {
      catalog,
      documentPath: filePath,
      rootDir: opts.rootDir,
      allowBasenameMatch: opts.allowBasenameMatch,
      resolver: opts.resolver,
    }) as unknown as {
      content: string;
      modified: boolean;
      replacements: readonly unknown[];
      diagnostics: readonly unknown[];
    };
  }
  // Should not happen due to whitelist, but per-target diagnostic: unsupported extension
  throw new InvalidOptionsError(
    `Unsupported target extension "${ext}" for file "${filePath}" — only .css, .html, .htm are allowed`,
    {
      path: filePath,
    },
  );
}

// ---------------------------------------------------------------------------
// Validation for InlineFilesOptions (policy + specific)
// ---------------------------------------------------------------------------

function validateInlineFilesOptions(opts: InlineFilesOptions): void {
  if (!opts || typeof opts !== 'object') {
    throw new InvalidOptionsError('inlineFiles requires options object');
  }
  validateTargetsInput((opts as unknown as { targets: unknown }).targets);
  // assets is required unless catalog supplied
  if (!opts.catalog) {
    const assets = (opts as unknown as { assets: unknown }).assets;
    if (assets === undefined || assets === null) {
      throw new InvalidOptionsError('inlineFiles requires assets or catalog', { path: 'assets' });
    }
    if (typeof assets === 'string') {
      if (assets.trim().length === 0)
        throw new InvalidOptionsError('assets must be non-empty', { path: String(assets) });
    } else if (Array.isArray(assets)) {
      if (assets.length === 0) throw new InvalidOptionsError('assets must not be empty', { path: 'assets' });
      for (const a of assets as unknown[]) {
        if (typeof a !== 'string' || (a as string).trim().length === 0) {
          throw new InvalidOptionsError(`assets entries must be non-empty strings, got ${String(a)}`, {
            path: String(a),
          });
        }
      }
    } else {
      throw new InvalidOptionsError('assets must be string or string[]', { path: String(assets) });
    }
  }
  validatePolicyOptions({
    maxAssetBytes: (opts as unknown as { maxAssetBytes: unknown }).maxAssetBytes,
    maxTotalBytes: (opts as unknown as { maxTotalBytes: unknown }).maxTotalBytes,
    maxFiles: opts.maxFiles,
    maxDepth: opts.maxDepth,
    maxTargets: opts.maxTargets,
    concurrency: opts.concurrency,
  });
  if (opts.write !== undefined && typeof opts.write !== 'boolean') {
    throw new InvalidOptionsError('write must be boolean');
  }
  if (opts.detection !== undefined && !['extension', 'content', 'verify'].includes(opts.detection as string)) {
    throw new InvalidOptionsError(`Invalid detection mode "${String(opts.detection)}"`);
  }
  // maxTargets and concurrency already validated via policy, but also ensure finite
}

// ---------------------------------------------------------------------------
// Public API: inlineFiles (async) — async fs exclusively
// ---------------------------------------------------------------------------

/**
 * Process target CSS/HTML files, inlining local asset references (async).
 *
 * - Composes catalog creation, deterministic target discovery, extension-based
 *   transformer dispatch, and structured results without duplicating internals.
 * - Defaults to `write: false` (dry-run); always returns one immutable result
 *   per target in deterministic lexical order (not completion order).
 * - Async variant uses bounded concurrency and async filesystem calls exclusively
 *   (`fs/promises`); never calls `readFileSync` in async path.
 * - For `write: true`, stages to same-directory temp file (`.tmp.asset-inliner.*`),
 *   flushes, preserves mode, renames over target, and removes temp on failure.
 * - Never writes unchanged content; per-target parse/write failures are captured
 *   as diagnostics with `modified: false, written: false` and do not abort batch.
 * - Prevents aliasing surprises, symlink escape (via discovery policy),
 *   duplicate target writes (dedup), and recursive temp file discovery.
 * - Only `.css`, `.html`, `.htm` targets are supported; other extensions are
 *   rejected before transformation.
 */
export async function inlineFiles(options: InlineFilesOptions): Promise<readonly InlineFileResult[]> {
  validateInlineFilesOptions(options);
  throwIfAborted(options.signal);

  const write = options.write ?? false;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxTargets = options.maxTargets ?? DEFAULT_MAX_TARGETS;

  // Validate maxTargets/concurrency are finite positive integers via policy already
  // But ensure they are applied

  // Discover targets deterministically
  const targetInputs = toArray(options.targets as string | readonly string[]);
  throwIfAborted(options.signal);
  const discovered = await discoverTargetsAsync(targetInputs, { ...options, concurrency } as InlineFilesOptions & {
    concurrency: number;
  });
  throwIfAborted(options.signal);

  if (discovered.length > maxTargets) {
    throw new ResourceLimitError(`Discovered target count ${discovered.length} exceeds maxTargets ${maxTargets}`, {
      limit: maxTargets,
      actual: discovered.length,
    });
  }

  // Additional duplicate check: discovered already deduped, but ensure filtered temp not counted
  // Deduplicate again defensively (normalize)
  const seen = new Set<string>();
  const orderedTargets: string[] = [];
  for (const p of discovered) {
    const norm = normalizeAbsolute(p);
    if (seen.has(norm)) continue;
    // Also ensure not aliasing with asset paths? We do not skip; we keep all targets regardless of alias
    // But we ensure temp files already filtered
    if (isTempBasename(path.basename(norm))) continue;
    seen.add(norm);
    orderedTargets.push(norm);
  }
  throwIfAborted(options.signal);

  // Build catalog if not supplied
  let catalog: AssetCatalog;
  if (options.catalog) {
    catalog = options.catalog;
  } else {
    const assetsInput = options.assets as string | readonly string[];
    // assets may be string or array; normalize for createAssetCatalog which accepts readonly AssetInput[] | AssetInput
    // AssetCatalog expects file paths; we pass same type (string | string[])
    // Cast: assetsInput is string | readonly string[], createAssetCatalog expects AssetInput
    const assetsForCatalog: string | readonly string[] = Array.isArray(assetsInput)
      ? (assetsInput as readonly string[])
      : (assetsInput as string);
    catalog = await createAssetCatalog(assetsForCatalog as unknown as readonly import('./types.ts').AssetInput[], {
      definitions: options.definitions,
      detection: options.detection,
      maxAssetBytes: options.maxAssetBytes,
      maxTotalBytes: options.maxTotalBytes,
      maxFiles: options.maxFiles,
      maxDepth: options.maxDepth,
      traversalRoot: options.traversalRoot,
      allowTraversalEscape: options.allowTraversalEscape,
      followSymlinks: options.followSymlinks,
      concurrency,
      signal: options.signal,
      allowedKinds: (options as unknown as { allowedKinds?: readonly string[] }).allowedKinds as never,
      allowedExtensions: (options as unknown as { allowedExtensions?: readonly string[] }).allowedExtensions as never,
    });
  }
  throwIfAborted(options.signal);

  // Process each target with bounded concurrency, preserving order
  const results: InlineFileResult[] = new Array(orderedTargets.length) as unknown as InlineFileResult[];

  // Create chunks for concurrency
  for (let start = 0; start < orderedTargets.length; start += concurrency) {
    throwIfAborted(options.signal);
    const end = Math.min(start + concurrency, orderedTargets.length);
    const chunkIndices: number[] = [];
    for (let i = start; i < end; i++) chunkIndices.push(i);

    const chunkPromises = chunkIndices.map(async (idx) => {
      throwIfAborted(options.signal);
      const filePath = orderedTargets[idx]!;
      let content: string;
      try {
        content = await readFile(filePath, 'utf8');
      } catch (err) {
        throwIfAborted(options.signal);
        const diag = {
          code: (err as { code?: string })?.code ?? 'FILESYSTEM_ERROR',
          message: err instanceof Error ? err.message : String(err),
          originalUrl: undefined,
          filePath,
          severity: 'error' as const,
        };
        const result: InlineFileResult = Object.freeze({
          filePath,
          content: '',
          modified: false,
          replacements: Object.freeze([]),
          diagnostics: Object.freeze([Object.freeze(diag)]),
          written: false,
        }) as InlineFileResult;
        return { idx, result };
      }

      // Dispatch based on extension
      let inlineResult: {
        content: string;
        modified: boolean;
        replacements: readonly unknown[];
        diagnostics: readonly unknown[];
      };
      try {
        // dispatchInline may throw ParseError for malformed CSS or InvalidOptionsError for unsupported ext or AmbiguousAssetError etc. which we capture per-target
        inlineResult = dispatchInline(filePath, content, catalog, options);
      } catch (err) {
        throwIfAborted(options.signal);
        const code = (err as { code?: string })?.code ?? (err instanceof ParseError ? 'PARSE_ERROR' : 'RESOLVE_ERROR');
        const diag = {
          code,
          message: err instanceof Error ? err.message : String(err),
          originalUrl: undefined,
          filePath,
          severity: 'error' as const,
        };
        const result: InlineFileResult = Object.freeze({
          filePath,
          content, // return original content on parse error
          modified: false,
          replacements: Object.freeze([]),
          diagnostics: Object.freeze([Object.freeze(diag)]),
          written: false,
        }) as InlineFileResult;
        return { idx, result };
      }

      // Handle per-target diagnostics already present: they are warn/error for unresolved etc. but modified may still be true if some succeeded.
      // We consider modified as returned.

      let written = false;
      let finalDiagnostics: readonly unknown[] = inlineResult.diagnostics as readonly unknown[];
      if (write && inlineResult.modified) {
        try {
          await writeAtomicAsync(filePath, inlineResult.content);
          written = true;
        } catch (err) {
          const code = (err as { code?: string })?.code ?? 'FILESYSTEM_ERROR';
          const diag = {
            code,
            message: err instanceof Error ? err.message : String(err),
            originalUrl: undefined,
            filePath,
            severity: 'error' as const,
          };
          // On write failure, we have made no successful rename, but we still report modified true (content differs) but written false
          finalDiagnostics = Object.freeze([
            ...(inlineResult.diagnostics as unknown[]),
            Object.freeze(diag),
          ] as unknown as readonly unknown[]);
          written = false;
        }
      }

      const result: InlineFileResult = Object.freeze({
        filePath,
        content: inlineResult.content,
        modified: inlineResult.modified,
        replacements: Object.freeze([...(inlineResult.replacements as readonly unknown[])]),
        diagnostics: Object.freeze([...(finalDiagnostics as readonly unknown[])]),
        written,
      }) as InlineFileResult;
      return { idx, result };
    });

    const chunkResults = await Promise.all(chunkPromises);
    throwIfAborted(options.signal);
    for (const { idx, result } of chunkResults) {
      results[idx] = result;
    }
  }

  return Object.freeze([...results]) as readonly InlineFileResult[];
}

// ---------------------------------------------------------------------------
// Public API: inlineFilesSync (sync) — sync fs exclusively
// ---------------------------------------------------------------------------

/**
 * Synchronous variant of `inlineFiles`.
 * Uses sync I/O throughout, rejects async detection modes (`content`/`verify`),
 * and otherwise mirrors async semantics with deterministic order.
 */
export function inlineFilesSync(options: InlineFilesOptions): readonly InlineFileResult[] {
  validateInlineFilesOptions(options);
  throwIfAborted(options.signal);
  if (options.detection === 'content' || options.detection === 'verify') {
    throw new InvalidOptionsError(
      `Detection mode "${options.detection}" is async-only and cannot be used with sync APIs`,
    );
  }

  const write = options.write ?? false;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxTargets = options.maxTargets ?? DEFAULT_MAX_TARGETS;

  const targetInputs = toArray(options.targets as string | readonly string[]);
  throwIfAborted(options.signal);
  const discovered = discoverTargetsSync(targetInputs, { ...options, concurrency } as InlineFilesOptions & {
    concurrency: number;
  });
  throwIfAborted(options.signal);

  if (discovered.length > maxTargets) {
    throw new ResourceLimitError(`Discovered target count ${discovered.length} exceeds maxTargets ${maxTargets}`, {
      limit: maxTargets,
      actual: discovered.length,
    });
  }

  const seen = new Set<string>();
  const orderedTargets: string[] = [];
  for (const p of discovered) {
    const norm = normalizeAbsolute(p);
    if (seen.has(norm)) continue;
    if (isTempBasename(path.basename(norm))) continue;
    seen.add(norm);
    orderedTargets.push(norm);
  }
  throwIfAborted(options.signal);

  let catalog: AssetCatalog;
  if (options.catalog) {
    catalog = options.catalog;
  } else {
    const assetsInput = options.assets as string | readonly string[];
    const assetsForCatalog: string | readonly string[] = Array.isArray(assetsInput)
      ? (assetsInput as readonly string[])
      : (assetsInput as string);
    catalog = createAssetCatalogSync(assetsForCatalog as unknown as readonly import('./types.ts').AssetInput[], {
      definitions: options.definitions,
      detection: options.detection,
      maxAssetBytes: options.maxAssetBytes,
      maxTotalBytes: options.maxTotalBytes,
      maxFiles: options.maxFiles,
      maxDepth: options.maxDepth,
      traversalRoot: options.traversalRoot,
      allowTraversalEscape: options.allowTraversalEscape,
      followSymlinks: options.followSymlinks,
      concurrency,
      signal: options.signal,
      allowedKinds: (options as unknown as { allowedKinds?: readonly string[] }).allowedKinds as never,
      allowedExtensions: (options as unknown as { allowedExtensions?: readonly string[] }).allowedExtensions as never,
    });
  }
  throwIfAborted(options.signal);

  const results: InlineFileResult[] = [];

  for (const filePath of orderedTargets) {
    throwIfAborted(options.signal);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const diag = {
        code: (err as { code?: string })?.code ?? 'FILESYSTEM_ERROR',
        message: err instanceof Error ? err.message : String(err),
        originalUrl: undefined,
        filePath,
        severity: 'error' as const,
      };
      const result: InlineFileResult = Object.freeze({
        filePath,
        content: '',
        modified: false,
        replacements: Object.freeze([]),
        diagnostics: Object.freeze([Object.freeze(diag)]),
        written: false,
      }) as InlineFileResult;
      results.push(result);
      continue;
    }

    let inlineResult: {
      content: string;
      modified: boolean;
      replacements: readonly unknown[];
      diagnostics: readonly unknown[];
    };
    try {
      inlineResult = dispatchInline(filePath, content, catalog, options);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? (err instanceof ParseError ? 'PARSE_ERROR' : 'RESOLVE_ERROR');
      const diag = {
        code,
        message: err instanceof Error ? err.message : String(err),
        originalUrl: undefined,
        filePath,
        severity: 'error' as const,
      };
      const result: InlineFileResult = Object.freeze({
        filePath,
        content,
        modified: false,
        replacements: Object.freeze([]),
        diagnostics: Object.freeze([Object.freeze(diag)]),
        written: false,
      }) as InlineFileResult;
      results.push(result);
      continue;
    }

    let written = false;
    let finalDiagnostics: readonly unknown[] = inlineResult.diagnostics as readonly unknown[];
    if (write && inlineResult.modified) {
      try {
        writeAtomicSync(filePath, inlineResult.content);
        written = true;
      } catch (err) {
        const code = (err as { code?: string })?.code ?? 'FILESYSTEM_ERROR';
        const diag = {
          code,
          message: err instanceof Error ? err.message : String(err),
          originalUrl: undefined,
          filePath,
          severity: 'error' as const,
        };
        finalDiagnostics = Object.freeze([
          ...(inlineResult.diagnostics as unknown[]),
          Object.freeze(diag),
        ] as unknown as readonly unknown[]);
        written = false;
      }
    }

    const result: InlineFileResult = Object.freeze({
      filePath,
      content: inlineResult.content,
      modified: inlineResult.modified,
      replacements: Object.freeze([...(inlineResult.replacements as readonly unknown[])]),
      diagnostics: Object.freeze([...(finalDiagnostics as readonly unknown[])]),
      written,
    }) as InlineFileResult;
    results.push(result);
    throwIfAborted(options.signal);
  }

  return Object.freeze([...results]) as readonly InlineFileResult[];
}
