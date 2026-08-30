/**
 * Typed errors for `@web-ts-toolkit/asset-inliner`.
 *
 * All errors extend `AssetInlinerError` with stable `code` values.
 * Raw asset bytes are never included in messages.
 */

export type AssetInlinerErrorCode =
  | 'UNSUPPORTED_ASSET'
  | 'AMBIGUOUS_DEFINITION'
  | 'INVALID_OPTIONS'
  | 'DETECTION_MISMATCH'
  | 'AMBIGUOUS_ASSET'
  | 'RESOURCE_LIMIT'
  | 'PARSE_ERROR'
  | 'FILESYSTEM_ERROR';

/**
 * Base for all package-specific errors.
 * `code` is a stable literal union for exhaustive handling.
 */
export class AssetInlinerError extends Error {
  readonly code: AssetInlinerErrorCode;

  constructor(message: string, code: AssetInlinerErrorCode, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Unsupported ---------------------------------------------------------------

/** Thrown when an extension or media type is not in the registry. Code `UNSUPPORTED_ASSET`. */
export class UnsupportedAssetError extends AssetInlinerError {
  override readonly code = 'UNSUPPORTED_ASSET' as const;
  readonly extension?: string;
  readonly mediaType?: string;
  readonly path?: string;

  constructor(message: string, context?: { extension?: string; mediaType?: string; path?: string; cause?: unknown }) {
    super(message, 'UNSUPPORTED_ASSET', { cause: context?.cause });
    this.extension = context?.extension;
    this.mediaType = context?.mediaType;
    this.path = context?.path;
  }
}

// Ambiguous definition

/** Thrown when two definitions claim the same extension. Code `AMBIGUOUS_DEFINITION`. */
export class AmbiguousDefinitionError extends AssetInlinerError {
  override readonly code = 'AMBIGUOUS_DEFINITION' as const;
  readonly extension: string;
  readonly conflictingMediaTypes?: readonly string[];

  constructor(
    message: string,
    context: { extension: string; conflictingMediaTypes?: readonly string[]; cause?: unknown },
  ) {
    super(message, 'AMBIGUOUS_DEFINITION', { cause: context.cause });
    this.extension = context.extension;
    this.conflictingMediaTypes = context.conflictingMediaTypes
      ? Object.freeze([...context.conflictingMediaTypes])
      : undefined;
  }
}

// Invalid options ------------------------------------------------------------

/** Thrown for malformed or out-of-range options. Code `INVALID_OPTIONS`. */
export class InvalidOptionsError extends AssetInlinerError {
  override readonly code = 'INVALID_OPTIONS' as const;
  readonly path?: string;

  constructor(message: string, context?: { path?: string; cause?: unknown }) {
    super(message, 'INVALID_OPTIONS', { cause: context?.cause });
    this.path = context?.path;
  }
}

// Detection mismatch ---------------------------------------------------------

/** Thrown when `detection: 'verify'` detects a mismatch. Code `DETECTION_MISMATCH`. */
export class DetectionMismatchError extends AssetInlinerError {
  override readonly code = 'DETECTION_MISMATCH' as const;
  readonly expectedMediaType?: string;
  readonly detectedMediaType?: string;
  readonly path?: string;

  constructor(
    message: string,
    context?: { expectedMediaType?: string; detectedMediaType?: string; path?: string; cause?: unknown },
  ) {
    super(message, 'DETECTION_MISMATCH', { cause: context?.cause });
    this.expectedMediaType = context?.expectedMediaType;
    this.detectedMediaType = context?.detectedMediaType;
    this.path = context?.path;
  }
}

// Ambiguous asset (basename compatibility mode) --------------------------------

/** Thrown when basename compatibility mode finds duplicate candidates. Code `AMBIGUOUS_ASSET`. */
export class AmbiguousAssetError extends AssetInlinerError {
  override readonly code = 'AMBIGUOUS_ASSET' as const;
  readonly basename: string;
  readonly candidates: readonly string[];

  constructor(message: string, context: { basename: string; candidates: readonly string[]; cause?: unknown }) {
    super(message, 'AMBIGUOUS_ASSET', { cause: context.cause });
    this.basename = context.basename;
    this.candidates = Object.freeze([...context.candidates]);
  }
}

// Resource limits ------------------------------------------------------------

/** Thrown when a byte, count, depth, target, or concurrency limit is exceeded. Code `RESOURCE_LIMIT`. */
export class ResourceLimitError extends AssetInlinerError {
  override readonly code = 'RESOURCE_LIMIT' as const;
  readonly limit: number;
  readonly actual?: number;
  readonly path?: string;

  constructor(message: string, context: { limit: number; actual?: number; path?: string; cause?: unknown }) {
    super(message, 'RESOURCE_LIMIT', { cause: context.cause });
    this.limit = context.limit;
    this.actual = context.actual;
    this.path = context.path;
  }
}

// Parse ----------------------------------------------------------------------

/** Thrown when CSS is unparseable. Code `PARSE_ERROR`. */
export class ParseError extends AssetInlinerError {
  override readonly code = 'PARSE_ERROR' as const;
  readonly path?: string;

  constructor(message: string, context?: { path?: string; cause?: unknown }) {
    super(message, 'PARSE_ERROR', { cause: context?.cause });
    this.path = context?.path;
  }
}

// Filesystem -----------------------------------------------------------------

/** Thrown for missing paths, permission errors, or failed writes. Code `FILESYSTEM_ERROR`. */
export class FilesystemError extends AssetInlinerError {
  override readonly code = 'FILESYSTEM_ERROR' as const;
  readonly path: string;
  readonly operation?: string;

  constructor(message: string, context: { path: string; operation?: string; cause?: unknown }) {
    super(message, 'FILESYSTEM_ERROR', { cause: context.cause });
    this.path = context.path;
    this.operation = context.operation;
  }
}
