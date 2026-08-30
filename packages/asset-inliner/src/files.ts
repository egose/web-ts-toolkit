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
 * **Atomic write — commit point and cancellation:**
 * - The write **commit point** is the `rename` that swaps the staged temp file
 *   over the target. Cancellation is checked after reads, after transformation,
 *   before staging, and immediately before `rename`. If the `AbortSignal`
 *   aborts **before** the commit, the target is left unchanged, any staged
 *   temp file is removed, and the batch rejects with the signal's reason
 *   (`AbortError`).
 * - If the signal aborts **after** at least one `rename` has committed, the
 *   batch does **not** hide the committed state with a later
 *   cancellation rejection. Instead it returns accurate per-target results
 *   (`written: true` for committed files, `written: false` for unprocessed
 *   targets). This is the documented race boundary: cancellation and rename
 *   are racy; a rename that has already swapped the directory entry is
 *   durable and will be reported as such.
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
 * - Mode preservation: the original file's `mode` (permission bits) is
 *   captured via `stat` before staging and the temp file is created
 *   **exclusively** (`wx`) with that mode so a restrictive original (e.g.
 *   `0o600`) is never temporarily widened to default-umask (`0o666` /
 *   `0o644`) permissions. The mode is re-applied via `chmod` to ensure the
 *   final value matches exactly even when `umask` masked the creation mode.
 *   Ownership (`uid`/`gid`) is not changed.
 * - Flush: async path opens the temp file and calls `fsync` before close;
 *   sync path calls `fsyncSync` when available, otherwise close after write.
 *   `stat`, write, `chmod`, `fsync`, `close`, and `rename` failures are
 *   treated as controlled write failures (`FILESYSTEM_ERROR`, `written:
 *   false`); the primary failure's `operation` and `cause` are preserved and
 *   a cleanup (`unlink`) failure never replaces the primary error.
 * - Crash durability: the temp file is `fsync`'d before `rename`; after a
 *   successful `rename` the parent directory is `fsync`'d where the platform
 *   supports `fsync` on directories (POSIX). Directory `fsync` failures are
 *   best-effort and do not convert a successful rename into `written: false`.
 *   This provides replacement atomicity and flushes the directory entry on
 *   supported platforms; it is not a full `fsync`-to-disk guarantee on all
 *   filesystems.
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
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  InlineFilesOptions,
  InlineFileResult,
  AssetCatalog,
  InlineResult,
  AssetDiagnostic,
  AssetReplacement,
} from './types.ts';
import { createAssetCatalog, createAssetCatalogSync } from './catalog.ts';
import { discoverAssets, discoverAssetsSync } from './discovery.ts';
import { inlineCss } from './css.ts';
import { inlineHtml } from './html.ts';
import type { InlineOptions } from './types.ts';
import { InvalidOptionsError, ResourceLimitError, FilesystemError, ParseError } from './errors.ts';
import { validatePolicyOptions, DEFAULT_MAX_TARGETS, DEFAULT_CONCURRENCY, DEFAULT_MAX_TARGET_BYTES } from './policy.ts';

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

function byteLengthUtf8(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

// ---------------------------------------------------------------------------
// Pure shared helpers — queue normalization, diagnostic mapping, result construction
// ---------------------------------------------------------------------------

function toArray(input: string | readonly string[]): readonly string[] {
  if (Array.isArray(input)) return input as readonly string[];
  return [input as string];
}

function normalizeAbsolute(p: string): string {
  return path.resolve(p);
}

function enforceTargetBytes(content: string, filePath: string, opts: InlineFilesOptions): void {
  const maxTargetBytes = opts.maxTargetBytes ?? DEFAULT_MAX_TARGET_BYTES;
  const bytes = byteLengthUtf8(content);
  if (!Number.isSafeInteger(bytes)) {
    throw new ResourceLimitError(`Target byte length ${bytes} exceeds safe integer range`, {
      limit: maxTargetBytes,
      actual: bytes,
      path: filePath,
    });
  }
  if (bytes > maxTargetBytes) {
    throw new ResourceLimitError(`Target input bytes ${bytes} exceeds maxTargetBytes ${maxTargetBytes}`, {
      limit: maxTargetBytes,
      actual: bytes,
      path: filePath,
    });
  }
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

function makeDiagnostic(
  code: import('./types.ts').DiagnosticCode,
  message: string,
  filePath: string,
  originalUrl?: string,
): AssetDiagnostic {
  return Object.freeze({
    code,
    message,
    originalUrl,
    filePath,
    severity: 'error' as const,
  });
}

function makeInlineFileResult(
  filePath: string,
  inlineResult: InlineResult,
  extraDiagnostics: readonly AssetDiagnostic[] = [],
  written = false,
): InlineFileResult {
  const diagnostics = extraDiagnostics.length
    ? Object.freeze([...inlineResult.diagnostics, ...extraDiagnostics] as readonly AssetDiagnostic[])
    : inlineResult.diagnostics;
  return Object.freeze({
    filePath,
    content: inlineResult.content,
    modified: inlineResult.modified,
    replacements: Object.freeze([...inlineResult.replacements] as readonly AssetReplacement[]),
    diagnostics: Object.freeze([...diagnostics] as readonly AssetDiagnostic[]),
    written,
  });
}

function makeErrorFileResult(
  filePath: string,
  content: string,
  diagnostics: readonly AssetDiagnostic[],
): InlineFileResult {
  return Object.freeze({
    filePath,
    content,
    modified: false,
    replacements: Object.freeze([] as readonly AssetReplacement[]),
    diagnostics: Object.freeze([...diagnostics] as readonly AssetDiagnostic[]),
    written: false,
  });
}

function normalizeAndDedupeTargets(discovered: readonly string[]): string[] {
  const filtered = discovered.filter((p) => !isTempBasename(path.basename(p)));
  const validated = filtered.filter((p) => isAllowedTargetExt(path.extname(p)));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of validated) {
    const norm = normalizeAbsolute(p);
    if (seen.has(norm)) continue;
    if (isTempBasename(path.basename(norm))) continue;
    seen.add(norm);
    ordered.push(norm);
  }
  return ordered;
}

function buildInlineOptions(filePath: string, catalog: AssetCatalog, opts: InlineFilesOptions): InlineOptions {
  return {
    catalog,
    documentPath: filePath,
    rootDir: opts.rootDir,
    allowBasenameMatch: opts.allowBasenameMatch,
    resolver: opts.resolver,
    maxTargetBytes: opts.maxTargetBytes,
    maxReplacements: opts.maxReplacements,
    maxOutputBytes: opts.maxOutputBytes,
    maxInlineBytes: opts.maxInlineBytes,
    shouldInline: opts.shouldInline,
    inlineEmbeddedCss: opts.inlineEmbeddedCss,
  };
}

// ---------------------------------------------------------------------------
// Target discovery — extension-filtered, temp-filtered, deterministic
// ---------------------------------------------------------------------------

async function discoverTargetsAsync(
  inputs: string | readonly string[],
  opts: InlineFilesOptions & { concurrency: number },
): Promise<readonly string[]> {
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
  const filtered = raw.filter((p) => !isTempBasename(path.basename(p)));
  const validated = filtered.filter((p) => isAllowedTargetExt(path.extname(p)));
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

async function writeAtomicAsync(targetPath: string, content: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const random = crypto.randomBytes(6).toString('hex');
  const tempName = `${TEMP_PREFIX}${random}.${base}.tmp`;
  const tempPath = path.join(dir, tempName);

  let originalMode: number;
  try {
    const st = await fs.promises.stat(targetPath);
    originalMode = st.mode;
  } catch (err) {
    throw new FilesystemError(`Failed to stat target "${targetPath}"`, {
      path: targetPath,
      operation: 'stat',
      cause: err,
    });
  }
  throwIfAborted(signal);

  // Before staging — cancellation wins before any temp exposure
  throwIfAborted(signal);

  let tempCreated = false;
  let handle: fs.promises.FileHandle | undefined;
  let primaryError: unknown;
  let primaryOperation = 'write';

  try {
    // Exclusively create temp file with intended mode (no default-umask widening)
    handle = await fs.promises.open(tempPath, 'wx', originalMode);
    tempCreated = true;
    primaryOperation = 'write';
    await handle.writeFile(content, 'utf8');
    throwIfAborted(signal);

    primaryOperation = 'chmod';
    try {
      await handle.chmod(originalMode);
    } catch (err) {
      throw new FilesystemError(`Failed to chmod temp for "${targetPath}"`, {
        path: targetPath,
        operation: 'chmod',
        cause: err,
      });
    }
    throwIfAborted(signal);

    primaryOperation = 'fsync';
    try {
      await handle.sync();
    } catch (err) {
      throw new FilesystemError(`Failed to fsync temp for "${targetPath}"`, {
        path: targetPath,
        operation: 'fsync',
        cause: err,
      });
    }
    throwIfAborted(signal);

    primaryOperation = 'close';
    try {
      await handle.close();
      handle = undefined;
    } catch (err) {
      throw new FilesystemError(`Failed to close temp for "${targetPath}"`, {
        path: targetPath,
        operation: 'close',
        cause: err,
      });
    }
    throwIfAborted(signal);

    // Commit point — immediately before rename
    throwIfAborted(signal);
    primaryOperation = 'rename';
    await fs.promises.rename(tempPath, targetPath);
    tempCreated = false;

    // Best-effort parent directory fsync for crash durability (POSIX)
    try {
      const dirHandle = await fs.promises.open(dir, 'r');
      try {
        await dirHandle.sync();
      } finally {
        await dirHandle.close();
      }
    } catch {
      // Ignore — not supported on all platforms or filesystems
    }
  } catch (err) {
    // If cancellation caused this rejection and we have not yet committed, clean and rethrow signal reason
    if (signal?.aborted) {
      // Prefer signal reason over any filesystem error that occurred concurrently
      const abortReason = signal.reason ?? new DOMException('Aborted', 'AbortError');
      // Cleanup before rejecting with abort reason if not yet committed
      if (handle) {
        try {
          await handle.close();
        } catch {} // eslint-disable-line no-empty
      }
      if (tempCreated) {
        try {
          await fs.promises.unlink(tempPath);
        } catch {} // eslint-disable-line no-empty
      } else {
        try {
          await fs.promises.unlink(tempPath);
        } catch {} // eslint-disable-line no-empty
      }
      // If rename already committed (tempCreated === false after success), we would not be in this catch for post-rename abort
      // because we check abort before rename. So reaching here means abort won before commit.
      // Re-throw abort reason directly, not wrapped as FilesystemError, so caller sees cancellation
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // If abort signal is set, throw its reason even if err is a FilesystemError from chmod/fsync etc. that happened before abort check
      // The spec says if cancellation wins before commit, reject with signal reason
      throw abortReason;
    }

    primaryError = err;
    // Preserve primary error, cleanup without masking it
    if (handle) {
      try {
        await handle.close();
      } catch {} // eslint-disable-line no-empty
    }
    try {
      await fs.promises.unlink(tempPath);
    } catch {} // eslint-disable-line no-empty

    if (primaryError instanceof FilesystemError) throw primaryError;
    // Wrap non-FilesystemError with appropriate operation
    throw new FilesystemError(`Failed to write target "${targetPath}" atomically`, {
      path: targetPath,
      operation: primaryOperation,
      cause: primaryError,
    });
  }
}

function writeAtomicSync(targetPath: string, content: string, signal?: AbortSignal): void {
  throwIfAborted(signal);
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const random = crypto.randomBytes(6).toString('hex');
  const tempName = `${TEMP_PREFIX}${random}.${base}.tmp`;
  const tempPath = path.join(dir, tempName);

  let originalMode: number;
  try {
    const st = fs.statSync(targetPath);
    originalMode = st.mode;
  } catch (err) {
    throw new FilesystemError(`Failed to stat target "${targetPath}"`, {
      path: targetPath,
      operation: 'statSync',
      cause: err,
    });
  }
  throwIfAborted(signal);
  throwIfAborted(signal);

  let tempCreated = false;
  let fd: number | undefined;
  let primaryError: unknown;
  let primaryOperation = 'write';

  try {
    primaryOperation = 'write';
    // Exclusively create temp with intended mode
    fd = fs.openSync(tempPath, 'wx', originalMode);
    tempCreated = true;
    fs.writeFileSync(fd, content, 'utf8');
    throwIfAborted(signal);

    primaryOperation = 'chmod';
    try {
      fs.fchmodSync(fd, originalMode);
    } catch (err) {
      // fallback to path-based chmod if fchmodSync not available/failed due to platform
      try {
        fs.chmodSync(tempPath, originalMode);
      } catch {
        throw new FilesystemError(`Failed to chmod temp for "${targetPath}"`, {
          path: targetPath,
          operation: 'chmodSync',
          cause: err,
        });
      }
    }
    throwIfAborted(signal);

    primaryOperation = 'fsync';
    try {
      if (typeof fs.fsyncSync === 'function') fs.fsyncSync(fd);
    } catch (err) {
      throw new FilesystemError(`Failed to fsync temp for "${targetPath}"`, {
        path: targetPath,
        operation: 'fsyncSync',
        cause: err,
      });
    }
    throwIfAborted(signal);

    primaryOperation = 'close';
    try {
      fs.closeSync(fd);
      fd = undefined;
    } catch (err) {
      throw new FilesystemError(`Failed to close temp for "${targetPath}"`, {
        path: targetPath,
        operation: 'closeSync',
        cause: err,
      });
    }
    throwIfAborted(signal);
    throwIfAborted(signal);
    primaryOperation = 'renameSync';
    fs.renameSync(tempPath, targetPath);
    tempCreated = false; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Best-effort parent dir fsync
    try {
      const dirFd = fs.openSync(dir, 'r');
      try {
        if (typeof fs.fsyncSync === 'function') fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {} // eslint-disable-line no-empty
  } catch (err) {
    if (signal?.aborted) {
      const abortReason = signal.reason ?? new DOMException('Aborted', 'AbortError');
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {} // eslint-disable-line no-empty
      }
      try {
        fs.unlinkSync(tempPath);
      } catch {} // eslint-disable-line no-empty
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw abortReason;
    }

    primaryError = err;
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {} // eslint-disable-line no-empty
    }
    try {
      fs.unlinkSync(tempPath);
    } catch {} // eslint-disable-line no-empty

    if (primaryError instanceof FilesystemError) throw primaryError;
    throw new FilesystemError(`Failed to write target "${targetPath}" atomically`, {
      path: targetPath,
      operation: primaryOperation,
      cause: primaryError,
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
): InlineResult {
  const ext = path.extname(filePath).toLowerCase();
  const inlineOpts = buildInlineOptions(filePath, catalog, opts);
  if (ext === '.css') {
    return inlineCss(content, inlineOpts);
  }
  if (ext === '.html' || ext === '.htm') {
    return inlineHtml(content, inlineOpts);
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
  validateTargetsInput(opts.targets);
  // assets is required unless catalog supplied
  if (!opts.catalog) {
    const assets = opts.assets;
    if (assets === undefined || assets === null) {
      throw new InvalidOptionsError('inlineFiles requires assets or catalog', { path: 'assets' });
    }
    if (typeof assets === 'string') {
      if (assets.trim().length === 0)
        throw new InvalidOptionsError('assets must be non-empty', { path: String(assets) });
    } else if (Array.isArray(assets)) {
      if (assets.length === 0) throw new InvalidOptionsError('assets must not be empty', { path: 'assets' });
      for (const a of assets) {
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
    maxAssetBytes: opts.maxAssetBytes,
    maxTotalBytes: opts.maxTotalBytes,
    maxFiles: opts.maxFiles,
    maxDepth: opts.maxDepth,
    maxTargets: opts.maxTargets,
    concurrency: opts.concurrency,
    maxTargetBytes: opts.maxTargetBytes,
    maxReplacements: opts.maxReplacements,
    maxOutputBytes: opts.maxOutputBytes,
    maxInlineBytes: opts.maxInlineBytes,
  });
  if (opts.write !== undefined && typeof opts.write !== 'boolean') {
    throw new InvalidOptionsError('write must be boolean');
  }
  if (opts.detection !== undefined && !['extension', 'content', 'verify'].includes(opts.detection as string)) {
    throw new InvalidOptionsError(`Invalid detection mode "${String(opts.detection)}"`);
  }
  if (opts.shouldInline !== undefined && typeof opts.shouldInline !== 'function') {
    throw new InvalidOptionsError('shouldInline must be a function (asset, url) => boolean');
  }
  if (opts.inlineEmbeddedCss !== undefined && typeof opts.inlineEmbeddedCss !== 'boolean') {
    throw new InvalidOptionsError('inlineEmbeddedCss must be a boolean');
  }
  // maxTargets and concurrency already validated via policy, but also ensure finite
}

// Shared helper to build catalog options from InlineFilesOptions without casts
function catalogOptionsFromInlineFiles(
  options: InlineFilesOptions,
  concurrency: number,
): import('./types.ts').CatalogOptions {
  if (options.registry && options.definitions) {
    throw new InvalidOptionsError('Provide either registry or definitions, not both');
  }
  if (options.registry) {
    return {
      registry: options.registry,
      definitions: undefined,
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
      allowedKinds: options.allowedKinds,
      allowedExtensions: options.allowedExtensions,
      detector: options.detector,
    };
  }
  return {
    definitions: options.definitions,
    registry: undefined,
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
    allowedKinds: options.allowedKinds,
    allowedExtensions: options.allowedExtensions,
    detector: options.detector,
  };
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

  // Discover targets deterministically
  const targetInputs = toArray(options.targets);
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

  const orderedTargets = normalizeAndDedupeTargets(discovered);
  throwIfAborted(options.signal);

  let catalog: AssetCatalog;
  if (options.catalog) {
    catalog = options.catalog;
  } else {
    const assetsInput = options.assets as string | readonly string[];
    const assetsForCatalog = Array.isArray(assetsInput) ? (assetsInput as readonly string[]) : (assetsInput as string);
    const catalogOpts = catalogOptionsFromInlineFiles(options, concurrency);
    // assetsInput is file paths/dirs; cast to AssetInput[] is safe (string extends AssetInput)
    catalog = await createAssetCatalog(assetsForCatalog as readonly import('./types.ts').AssetInput[], catalogOpts);
  }
  throwIfAborted(options.signal);

  const results: InlineFileResult[] = new Array(orderedTargets.length);
  let hasCommitted = false;

  for (let start = 0; start < orderedTargets.length; start += concurrency) {
    if (options.signal?.aborted) {
      if (hasCommitted) {
        for (let i = start; i < orderedTargets.length; i++) {
          if (results[i] === undefined) {
            const fp = orderedTargets[i]!;
            const diag = makeDiagnostic(
              'FILESYSTEM_ERROR',
              String(options.signal.reason ?? new DOMException('Aborted', 'AbortError')),
              fp,
            );
            results[i] = makeErrorFileResult(fp, '', [diag]);
          }
        }
        break;
      } else {
        throwIfAborted(options.signal);
      }
    }
    const end = Math.min(start + concurrency, orderedTargets.length);
    const chunkIndices: number[] = [];
    for (let i = start; i < end; i++) chunkIndices.push(i);

    const chunkPromises = chunkIndices.map(async (idx) => {
      throwIfAborted(options.signal);
      const filePath = orderedTargets[idx]!;
      let content: string;
      try {
        content = await fs.promises.readFile(filePath, 'utf8');
      } catch (err) {
        if (options.signal?.aborted) throwIfAborted(options.signal);
        const diag = makeDiagnostic('FILESYSTEM_ERROR', err instanceof Error ? err.message : String(err), filePath);
        return { idx, result: makeErrorFileResult(filePath, '', [diag]) };
      }
      throwIfAborted(options.signal);

      let inlineResult: InlineResult;
      try {
        enforceTargetBytes(content, filePath, options);
        inlineResult = dispatchInline(filePath, content, catalog, options);
      } catch (err) {
        if (options.signal?.aborted) throwIfAborted(options.signal);
        const code = ((err as { code?: string })?.code ??
          (err instanceof ParseError
            ? 'PARSE_ERROR'
            : err instanceof ResourceLimitError
              ? 'RESOURCE_LIMIT'
              : 'RESOLVE_ERROR')) as import('./types.ts').DiagnosticCode;
        const diag = makeDiagnostic(code, err instanceof Error ? err.message : String(err), filePath);
        return { idx, result: makeErrorFileResult(filePath, content, [diag]) };
      }
      throwIfAborted(options.signal);
      if (write && inlineResult.modified) throwIfAborted(options.signal);

      let written = false;
      let finalDiagnostics: readonly AssetDiagnostic[] = inlineResult.diagnostics;
      if (write && inlineResult.modified) {
        throwIfAborted(options.signal);
        try {
          await writeAtomicAsync(filePath, inlineResult.content, options.signal);
          written = true;
        } catch (err) {
          if ((err instanceof DOMException && err.name === 'AbortError') || options.signal?.aborted) {
            throw err;
          }
          const code = ((err as { code?: string })?.code ?? 'FILESYSTEM_ERROR') as import('./types.ts').DiagnosticCode;
          const diag = makeDiagnostic(code, err instanceof Error ? err.message : String(err), filePath);
          finalDiagnostics = Object.freeze([...inlineResult.diagnostics, diag] as readonly AssetDiagnostic[]);
          written = false;
        }
      }

      const result = makeInlineFileResult(filePath, { ...inlineResult, diagnostics: finalDiagnostics }, [], written);
      return { idx, result };
    });

    const settled = await Promise.allSettled(chunkPromises);
    let abortReason: unknown;
    let hasAbortInChunk = false;
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]!;
      const idx = chunkIndices[i]!;
      if (s.status === 'fulfilled') {
        const { idx: rIdx, result } = s.value;
        results[rIdx] = result;
        if (result.written) hasCommitted = true;
      } else {
        const reason = s.reason;
        const isAbort =
          (reason instanceof DOMException && reason.name === 'AbortError') || (options.signal?.aborted ?? false);
        if (isAbort) {
          hasAbortInChunk = true;
          abortReason = reason instanceof DOMException ? reason : (options.signal?.reason ?? reason);
          if (!hasCommitted) {
            // No commit yet — propagate abort
            throw abortReason;
          }
          // Has committed — record this target as not written with diagnostic
          const fp = orderedTargets[idx]!;
          const diag = makeDiagnostic(
            'FILESYSTEM_ERROR',
            abortReason instanceof Error ? abortReason.message : String(abortReason),
            fp,
          );
          results[idx] = makeErrorFileResult(fp, '', [diag]);
        } else {
          throw reason;
        }
      }
    }
    if (hasAbortInChunk && !hasCommitted) {
      throw abortReason ?? options.signal?.reason ?? new DOMException('Aborted', 'AbortError');
    }
    if (options.signal?.aborted && !hasCommitted) throwIfAborted(options.signal);
  }

  for (let i = 0; i < results.length; i++) {
    if (results[i] === undefined) {
      const fp = orderedTargets[i]!;
      const diag = makeDiagnostic('FILESYSTEM_ERROR', String(options.signal?.reason ?? 'Aborted'), fp);
      results[i] = makeErrorFileResult(fp, '', [diag]);
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

  const targetInputs = toArray(options.targets);
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

  const orderedTargets = normalizeAndDedupeTargets(discovered);
  throwIfAborted(options.signal);

  let catalog: AssetCatalog;
  if (options.catalog) {
    catalog = options.catalog;
  } else {
    const assetsInput = options.assets as string | readonly string[];
    const assetsForCatalog = Array.isArray(assetsInput) ? (assetsInput as readonly string[]) : (assetsInput as string);
    const catalogOpts = catalogOptionsFromInlineFiles(options, concurrency);
    catalog = createAssetCatalogSync(assetsForCatalog as readonly import('./types.ts').AssetInput[], catalogOpts);
  }
  throwIfAborted(options.signal);

  const results: InlineFileResult[] = [];
  let hasCommitted = false;

  for (const filePath of orderedTargets) {
    if (options.signal?.aborted) {
      if (hasCommitted) {
        const diag = makeDiagnostic(
          'FILESYSTEM_ERROR',
          String(options.signal.reason ?? new DOMException('Aborted', 'AbortError')),
          filePath,
        );
        results.push(makeErrorFileResult(filePath, '', [diag]));
        continue;
      } else {
        throwIfAborted(options.signal);
      }
    }
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if (options.signal?.aborted) throwIfAborted(options.signal);
      const diag = makeDiagnostic('FILESYSTEM_ERROR', err instanceof Error ? err.message : String(err), filePath);
      results.push(makeErrorFileResult(filePath, '', [diag]));
      continue;
    }
    throwIfAborted(options.signal);

    let inlineResult: InlineResult;
    try {
      enforceTargetBytes(content, filePath, options);
      inlineResult = dispatchInline(filePath, content, catalog, options);
    } catch (err) {
      if (options.signal?.aborted) throwIfAborted(options.signal);
      const code = ((err as { code?: string })?.code ??
        (err instanceof ParseError
          ? 'PARSE_ERROR'
          : err instanceof ResourceLimitError
            ? 'RESOURCE_LIMIT'
            : 'RESOLVE_ERROR')) as import('./types.ts').DiagnosticCode;
      const diag = makeDiagnostic(code, err instanceof Error ? err.message : String(err), filePath);
      results.push(makeErrorFileResult(filePath, content, [diag]));
      continue;
    }
    throwIfAborted(options.signal);
    if (write && inlineResult.modified) throwIfAborted(options.signal);

    let written = false;
    let finalDiagnostics: readonly AssetDiagnostic[] = inlineResult.diagnostics;
    if (write && inlineResult.modified) {
      throwIfAborted(options.signal);
      try {
        writeAtomicSync(filePath, inlineResult.content, options.signal);
        written = true;
        hasCommitted = true;
      } catch (err) {
        if ((err instanceof DOMException && err.name === 'AbortError') || options.signal?.aborted) {
          if (hasCommitted) {
            const diag = makeDiagnostic('FILESYSTEM_ERROR', err instanceof Error ? err.message : String(err), filePath);
            finalDiagnostics = Object.freeze([...inlineResult.diagnostics, diag] as readonly AssetDiagnostic[]);
            written = false;
            results.push(
              makeInlineFileResult(filePath, { ...inlineResult, diagnostics: finalDiagnostics }, [], written),
            );
            continue;
          } else {
            throw err;
          }
        }
        const code = ((err as { code?: string })?.code ?? 'FILESYSTEM_ERROR') as import('./types.ts').DiagnosticCode;
        const diag = makeDiagnostic(code, err instanceof Error ? err.message : String(err), filePath);
        finalDiagnostics = Object.freeze([...inlineResult.diagnostics, diag] as readonly AssetDiagnostic[]);
        written = false;
      }
    }

    const result = makeInlineFileResult(filePath, { ...inlineResult, diagnostics: finalDiagnostics }, [], written);
    results.push(result);
    if (written) hasCommitted = true;
    if (options.signal?.aborted && !hasCommitted) throwIfAborted(options.signal);
  }

  return Object.freeze([...results]) as readonly InlineFileResult[];
}
