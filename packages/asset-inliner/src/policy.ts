/** Resource policy — finite defaults and validated bounds. */

import { InvalidOptionsError } from './errors.ts';

// ---------------------------------------------------------------------------
// Finite defaults
// ---------------------------------------------------------------------------

/** Per-asset byte limit — 3 MiB. See rationale above. */
export const DEFAULT_MAX_ASSET_BYTES = 3 * 1024 * 1024; // 3145728

/** Total encoded byte limit across batch/catalog — 15 MiB. */
export const DEFAULT_MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15728640

/** Max discovered files per traversal — 10 000. */
export const DEFAULT_MAX_FILES = 10_000;

/** Max directory recursion depth — 32. */
export const DEFAULT_MAX_DEPTH = 32;

/** Max target CSS/HTML files processed by `inlineFiles` — 500. */
export const DEFAULT_MAX_TARGETS = 500;

/** Bounded async concurrency for discovery/encoding/file orchestration — 16. */
export const DEFAULT_CONCURRENCY = 16;

/** Max target input bytes (UTF-8) per transform — 5 MiB. Bounds parser input before parsing. */
export const DEFAULT_MAX_TARGET_BYTES = 5 * 1024 * 1024; // 5242880

/** Max replacements per target transform — 1000. Bounds repeated data URL expansion. */
export const DEFAULT_MAX_REPLACEMENTS = 1000;

/** Max transformed output bytes (UTF-8) per target — 20 MiB. Bounds projected growth per replacement. */
export const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024; // 20971520

// ---------------------------------------------------------------------------
// Reasonable upper caps (values above are "unreasonable" and rejected)
// ---------------------------------------------------------------------------

/** Values >100 MiB per asset are unreasonable — would allocate ~133 MiB string. */
export const MAX_REASONABLE_MAX_ASSET_BYTES = 100 * 1024 * 1024;

/** Values >500 MiB total are unreasonable — would OOM most build runners. */
export const MAX_REASONABLE_MAX_TOTAL_BYTES = 500 * 1024 * 1024;

/** Values >100 000 files are unreasonable — suggests glob mistake. */
export const MAX_REASONABLE_MAX_FILES = 100_000;

/** Depth >256 is unreasonable — exceeds practical directory trees. */
export const MAX_REASONABLE_MAX_DEPTH = 256;

/** Targets >5000 are unreasonable — suggests broad glob over narrow pattern. */
export const MAX_REASONABLE_MAX_TARGETS = 5_000;

/** Concurrency >64 is unreasonable — risks EMFILE and threadpool starvation. */
export const MAX_REASONABLE_CONCURRENCY = 64;

/** Values >50 MiB target input are unreasonable — would allocate huge parser input. */
export const MAX_REASONABLE_MAX_TARGET_BYTES = 50 * 1024 * 1024;

/** Values >100 000 replacements per target are unreasonable — suggests runaway expansion. */
export const MAX_REASONABLE_MAX_REPLACEMENTS = 100_000;

/** Values >100 MiB output per target are unreasonable — would allocate ~100 MiB string. */
export const MAX_REASONABLE_MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

/** Values >100 MiB inline threshold are unreasonable — would inline huge assets. */
export const MAX_REASONABLE_MAX_INLINE_BYTES = 100 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Frozen aggregate for consumers and tests
// ---------------------------------------------------------------------------

export interface AssetInlinerPolicy {
  readonly maxAssetBytes: number;
  readonly maxTotalBytes: number;
  readonly maxFiles: number;
  readonly maxDepth: number;
  readonly maxTargets: number;
  readonly concurrency: number;
  readonly maxTargetBytes: number;
  readonly maxReplacements: number;
  readonly maxOutputBytes: number;
  readonly maxInlineBytes?: number;
}

export const DEFAULT_POLICY: AssetInlinerPolicy = Object.freeze({
  maxAssetBytes: DEFAULT_MAX_ASSET_BYTES,
  maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES,
  maxFiles: DEFAULT_MAX_FILES,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxTargets: DEFAULT_MAX_TARGETS,
  concurrency: DEFAULT_CONCURRENCY,
  maxTargetBytes: DEFAULT_MAX_TARGET_BYTES,
  maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  maxReplacements: DEFAULT_MAX_REPLACEMENTS,
}) as AssetInlinerPolicy;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single numeric policy value.
 * @throws {InvalidOptionsError} on negative, zero, non-finite, fractional, unsafe-integer, or unreasonable (>cap) values.
 */
export function validatePolicyValue(name: string, value: unknown, reasonableMax: number): void {
  if (value === undefined) return;
  if (typeof value !== 'number') {
    throw new InvalidOptionsError(`${name} must be a finite positive integer, got ${String(value)} (${typeof value})`);
  }
  if (!Number.isFinite(value)) {
    throw new InvalidOptionsError(`${name} must be a finite positive integer, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new InvalidOptionsError(
      `${name} must be a finite positive integer, got ${String(value)} — fractional values are not allowed`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new InvalidOptionsError(
      `${name} must be a safe integer, got ${String(value)} — exceeds Number.MAX_SAFE_INTEGER`,
    );
  }
  if (value <= 0) {
    throw new InvalidOptionsError(`${name} must be a finite positive integer, got ${String(value)} — must be > 0`);
  }
  if (value > reasonableMax) {
    throw new InvalidOptionsError(
      `${name} value ${value} is unreasonable — exceeds maximum reasonable value ${reasonableMax}.`,
    );
  }
}

/**
 * Validate all policy-relevant numeric options at once.
 * Useful for `EncodeOptions`, `DiscoveryOptions`, `CatalogOptions`, `InlineFilesOptions`.
 */
export function validatePolicyOptions(options: {
  readonly maxAssetBytes?: unknown;
  readonly maxTotalBytes?: unknown;
  readonly maxFiles?: unknown;
  readonly maxDepth?: unknown;
  readonly maxTargets?: unknown;
  readonly concurrency?: unknown;
  readonly maxTargetBytes?: unknown;
  readonly maxReplacements?: unknown;
  readonly maxOutputBytes?: unknown;
  readonly maxInlineBytes?: unknown;
}): void {
  validatePolicyValue('maxAssetBytes', options.maxAssetBytes, MAX_REASONABLE_MAX_ASSET_BYTES);
  validatePolicyValue('maxTotalBytes', options.maxTotalBytes, MAX_REASONABLE_MAX_TOTAL_BYTES);
  validatePolicyValue('maxFiles', options.maxFiles, MAX_REASONABLE_MAX_FILES);
  validatePolicyValue('maxDepth', options.maxDepth, MAX_REASONABLE_MAX_DEPTH);
  validatePolicyValue('maxTargets', options.maxTargets, MAX_REASONABLE_MAX_TARGETS);
  validatePolicyValue('concurrency', options.concurrency, MAX_REASONABLE_CONCURRENCY);
  validatePolicyValue('maxTargetBytes', options.maxTargetBytes, MAX_REASONABLE_MAX_TARGET_BYTES);
  validatePolicyValue('maxReplacements', options.maxReplacements, MAX_REASONABLE_MAX_REPLACEMENTS);
  validatePolicyValue('maxOutputBytes', options.maxOutputBytes, MAX_REASONABLE_MAX_OUTPUT_BYTES);
  validatePolicyValue('maxInlineBytes', options.maxInlineBytes, MAX_REASONABLE_MAX_INLINE_BYTES);
}

/**
 * Normalize policy options with finite defaults applied.
 * Returns a frozen snapshot where every policy key is guaranteed present.
 */
export function normalizePolicy(
  options: {
    readonly maxAssetBytes?: number;
    readonly maxTotalBytes?: number;
    readonly maxFiles?: number;
    readonly maxDepth?: number;
    readonly maxTargets?: number;
    readonly concurrency?: number;
    readonly maxTargetBytes?: number;
    readonly maxReplacements?: number;
    readonly maxOutputBytes?: number;
    readonly maxInlineBytes?: number;
  } = {},
): AssetInlinerPolicy {
  validatePolicyOptions(options);
  return Object.freeze({
    maxAssetBytes: options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxTargets: options.maxTargets ?? DEFAULT_MAX_TARGETS,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    maxTargetBytes: options.maxTargetBytes ?? DEFAULT_MAX_TARGET_BYTES,
    maxReplacements: options.maxReplacements ?? DEFAULT_MAX_REPLACEMENTS,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    ...(options.maxInlineBytes !== undefined ? { maxInlineBytes: options.maxInlineBytes } : {}),
  }) as AssetInlinerPolicy;
}
