/**
 * Public model types for `@web-ts-toolkit/asset-inliner`.
 *
 * All registries, collections, and results are immutable values.
 * Extension keys are normalized once (lowercase, leading dot) and duplicate
 * definitions are rejected at catalog construction time.
 * Result collections are readonly snapshots preserving deterministic input order.
 */

// ---------------------------------------------------------------------------
// Asset kind and definition
// ---------------------------------------------------------------------------

/**
 * Built-in asset kinds supported by default.
 * Custom kinds may be supplied via `string & {}` extension.
 */
export type BuiltInAssetKind = 'font' | 'image' | 'audio' | 'video';

/**
 * Asset kind — built-ins plus any custom string kind.
 * Use a custom kind to inline non-standard assets without changing encoder logic.
 */
export type AssetKind = BuiltInAssetKind | (string & {});

/**
 * Immutable definition for a single asset type.
 * One definition maps a set of file extensions to a canonical media type
 * and, for fonts, a CSS `format(...)` hint.
 */
export interface AssetTypeDefinition {
  /** Logical kind (e.g. 'font', 'image'). */
  readonly kind: AssetKind;
  /** File extensions including leading dot, e.g. ['.woff2', '.woff']. Normalized to lowercase. */
  readonly extensions: readonly string[];
  /** Canonical IANA media type, e.g. 'font/woff2' or 'image/png'. */
  readonly mediaType: string;
  /**
   * CSS font format hint for `@font-face src`, e.g. 'woff2', 'truetype', 'svg'.
   * Only meaningful when `kind === 'font'`. Images and other kinds must leave this undefined.
   */
  readonly fontFormat?: string;
}

// ---------------------------------------------------------------------------
// Encoding inputs/outputs
// ---------------------------------------------------------------------------

/**
 * Input to the encoder — either an absolute/relative file path or an in-memory
 * byte payload with optional explicit metadata. Explicit metadata wins over
 * extension lookup; binary detection (async) may verify but never silently
 * overrides explicit `mediaType`.
 */
export type AssetInput =
  | string
  | {
      readonly data: Uint8Array;
      readonly filename?: string;
      readonly mediaType?: string;
      readonly kind?: AssetKind;
      readonly fontFormat?: string;
    };

/**
 * Result of encoding a single asset to a Base64 data URL.
 * Never includes raw bytes — only the encoded URL plus immutable metadata.
 */
export interface EncodedAsset {
  /** Original absolute file path, if input was a file path. */
  readonly sourcePath?: string;
  /** Filename derived from path or explicit `filename`. */
  readonly filename?: string;
  /** Resolved asset kind. */
  readonly kind: AssetKind;
  /** Canonical media type used in the data URL. */
  readonly mediaType: string;
  /** Font format hint, if applicable. */
  readonly fontFormat?: string;
  /** Original byte length before Base64 expansion. */
  readonly byteLength: number;
  /** RFC 2397 data URL: `data:<mediaType>;base64,<payload>` */
  readonly dataUrl: string;
}

// ---------------------------------------------------------------------------
// Catalog — immutable registry + encoded assets
// ---------------------------------------------------------------------------

/**
 * Immutable catalog of encoded assets and their resolved definitions.
 * Constructed by `createAssetCatalog` / `createAssetCatalogSync`.
 * Keys are normalized absolute paths internally; diagnostics use POSIX-style
 * logical paths. Lookup is exact by default; basename compatibility mode
 * reports ambiguity instead of picking a winner.
 */
export interface AssetCatalog {
  /** Assets in deterministic input order. */
  readonly assets: readonly EncodedAsset[];
  /** Normalized definitions in deterministic order. */
  readonly definitions: readonly AssetTypeDefinition[];
  /**
   * Resolve an encoded asset by normalized absolute path.
   * Returns undefined if not found.
   */
  readonly getByPath: (absolutePath: string) => EncodedAsset | undefined;
  /** Resolve by filename basename (compatibility mode); throws AmbiguousAssetError on duplicate. */
  readonly getByBasename: (basename: string) => EncodedAsset | undefined;
  /** Number of entries. */
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Replacement diagnostics (pure transform boundaries)
// ---------------------------------------------------------------------------

/**
 * One deterministic replacement of a local URL with an inlined data URL.
 */
export interface AssetReplacement {
  /** Original URL text as it appeared in the source (before stripping query/fragment for lookup). */
  readonly originalUrl: string;
  /** Normalized resolved asset path that was replaced. */
  readonly resolvedPath: string;
  /** Kind of the resolved asset. */
  readonly kind: AssetKind;
  /** Media type of the resolved asset. */
  readonly mediaType: string;
  /** Byte length of the original asset. */
  readonly byteLength: number;
  /** Location hint: byte offset or line/column when available. */
  readonly location?: {
    readonly offset: number;
    readonly line?: number;
    readonly column?: number;
  };
}

/**
 * Structured diagnostic for skipped, ambiguous, or failed references.
 * Replacements succeed; diagnostics explain what did not (and why) without
 * leaking raw asset bytes.
 */
export interface AssetDiagnostic {
  /** Stable diagnostic code, e.g. 'UNRESOLVED_REFERENCE', 'AMBIGUOUS_ASSET', 'UNSUPPORTED_TYPE'. */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
  /** Original URL that triggered the diagnostic. */
  readonly originalUrl?: string;
  /** Associated file or document path. */
  readonly filePath?: string;
  /** Severity. */
  readonly severity: 'warn' | 'error';
}

// ---------------------------------------------------------------------------
// Transform results
// ---------------------------------------------------------------------------

/**
 * Result of a pure content transform (CSS or HTML) over an already-encoded catalog.
 * `content` is byte-identical to input when `modified === false`.
 */
export interface InlineResult {
  /** Transformed content (or original when unmodified). */
  readonly content: string;
  /** Whether any replacement occurred. */
  readonly modified: boolean;
  /** Deterministic replacement records in source order. */
  readonly replacements: readonly AssetReplacement[];
  /** Diagnostics for unresolved/ambiguous/skipped references. */
  readonly diagnostics: readonly AssetDiagnostic[];
}

/** Result for a single target file processed by `inlineFiles`. */
export interface InlineFileResult extends InlineResult {
  /** Absolute path of the target file. */
  readonly filePath: string;
  /** Whether the file was written (only true when `write: true` and modified). */
  readonly written: boolean;
}

// ---------------------------------------------------------------------------
// Option stubs — refined by ASSET-02..ASSET-08, but frozen here so signatures are stable.
// ---------------------------------------------------------------------------

/**
 * Detection mode for resolving media type.
 * - `extension`: deterministic extension lookup (sync+async), supports SVG and other text formats.
 * - `content`: async-only `file-type` signature detection when filename is absent.
 * - `verify`: async-only mismatch check between detected and expected metadata.
 */
export type DetectionMode = 'extension' | 'content' | 'verify';

/**
 * Options for single/batch encoding. Extended by later tasks without breaking call sites.
 */
export interface EncodeOptions {
  /** Immutable registry overrides. Duplicate extensions are rejected. */
  readonly definitions?: readonly AssetTypeDefinition[];
  /** Detection mode. Sync APIs reject `content`/`verify` immediately. */
  readonly detection?: DetectionMode;
  /**
   * Per-asset byte limit. Finite positive integer, fractional/non-finite/negative rejected.
   * Default `3145728` (3 MiB, `DEFAULT_MAX_ASSET_BYTES`). Values > `104857600` (100 MiB) rejected as unreasonable.
   */
  readonly maxAssetBytes?: number;
  /**
   * Total encoded bytes limit across a batch/catalog. Finite positive integer.
   * Default `15728640` (15 MiB, `DEFAULT_MAX_TOTAL_BYTES`). Values > `524288000` (500 MiB) rejected as unreasonable.
   */
  readonly maxTotalBytes?: number;
  /** AbortSignal honored between I/O stages (async only). */
  readonly signal?: AbortSignal;
}

/** Discovery policy — traversal bounds, symlink handling, and filtering. */
export interface DiscoveryOptions {
  /** Follow symlinks while traversing. Default `false`. */
  readonly followSymlinks?: boolean;
  /**
   * Maximum recursion depth for directories. Finite positive integer.
   * Default `32` (`DEFAULT_MAX_DEPTH`). Values > `256` rejected as unreasonable; negative/non-finite/fractional rejected.
   */
  readonly maxDepth?: number;
  /**
   * Maximum number of files discovered. Finite positive integer.
   * Default `10000` (`DEFAULT_MAX_FILES`). Values > `100000` rejected as unreasonable.
   */
  readonly maxFiles?: number;
  /** Explicit traversal root. Discovered paths must stay under this root unless `allowTraversalEscape` is true. */
  readonly traversalRoot?: string;
  /** When `false` (default), traversal that would escape `traversalRoot` is denied with `FilesystemError`. */
  readonly allowTraversalEscape?: boolean;
  /**
   * Bounded concurrency for async traversal/encoding. Finite positive integer.
   * Default `16` (`DEFAULT_CONCURRENCY`). Values > `64` rejected as unreasonable; fractional/non-finite/negative rejected.
   */
  readonly concurrency?: number;
  /** Only include assets whose kind is in this list (checked before expensive reads). Directory entries not in kind list are silently ignored; explicit files that fail the filter throw `UnsupportedAssetError`. */
  readonly allowedKinds?: readonly AssetKind[];
  /** Only include assets whose extension is in this list (normalized lowercase with dot). Same observability rule as `allowedKinds`. */
  readonly allowedExtensions?: readonly string[];
  /** AbortSignal honored between stages (async and sync check). */
  readonly signal?: AbortSignal;
}

/** Options for catalog creation (discovery + encoding). */
export interface CatalogOptions extends EncodeOptions, DiscoveryOptions {
  /** Bounded concurrency for encoding stage (also reused for discovery when not specified separately). */
  readonly concurrency?: number;
}

/** Narrow input for a custom resolver hook — no parser AST knowledge required. */
export interface ResolverInput {
  /** Original URL text as it appeared in source (including query/fragment). */
  readonly originalUrl: string;
  /** Decoded logical path without query/fragment, percent-decoded for filesystem matching. POSIX-style with forward slashes. */
  readonly decodedPath: string;
  /** Basename of `decodedPath` (POSIX basename). */
  readonly basename: string;
  /** Document path of the containing CSS/HTML file, if available. */
  readonly documentPath?: string;
  /** Explicit root for `documentPath`-less content. */
  readonly rootDir?: string;
}

/** Result of a custom resolver hook. Return `undefined` to fall back to default resolution. */
export type ResolverResult = EncodedAsset | undefined;

/**
 * Custom matcher/resolver hook.
 * Receives a narrow, AST-free input describing the URL to resolve and the catalog.
 * Return an `EncodedAsset` to use, or `undefined` to let default exact/basename matching run.
 * The hook must not throw for skip/remote cases; classification is handled before the hook is called.
 */
export type AssetResolver = (input: ResolverInput, catalog: AssetCatalog) => ResolverResult | Promise<ResolverResult>;

/** Options for pure CSS/HTML inlining over an existing catalog. */
export interface InlineOptions {
  /** Immutable catalog to resolve local references against. */
  readonly catalog: AssetCatalog;
  /** Absolute path of the containing document for relative resolution; or explicit root. */
  readonly documentPath?: string;
  /** Explicit root for `documentPath`-less content. */
  readonly rootDir?: string;
  /** Opt-in basename compatibility mode (default: exact-path only). */
  readonly allowBasenameMatch?: boolean;
  /**
   * Optional custom resolver hook. Receives a narrow `ResolverInput` (originalUrl, decodedPath, basename)
   * and the catalog, without requiring parser AST knowledge. Return an `EncodedAsset` to use for that
   * URL, or `undefined` to fall back to default exact/basename matching. The hook is only invoked for
   * local URLs that passed remote/data/blob/fragment skipping and decoded without error.
   */
  readonly resolver?: AssetResolver;
}

/** Options for file-level orchestration (`inlineFiles`). */
export interface InlineFilesOptions extends CatalogOptions {
  /** Target CSS/HTML files or directories to process (lexical, deduplicated). */
  readonly targets: readonly string[] | string;
  /** Asset files/dirs to build the catalog from. Required unless `catalog` is supplied. */
  readonly assets?: readonly string[] | string;
  /** When true, write transformed content back atomically. Default false (dry-run). */
  readonly write?: boolean;
  /** Catalog may be supplied directly to avoid rebuilding it per target. */
  readonly catalog?: AssetCatalog;
  /**
   * Maximum number of target files to process. Finite positive integer.
   * Default `500` (see `src/policy.ts` `DEFAULT_MAX_TARGETS`). Values > `5000` are rejected as unreasonable.
   */
  readonly maxTargets?: number;
  /** Explicit root for resolving relative URLs when documentPath is not used; passed to per-file inline dispatch. */
  readonly rootDir?: string;
  /** Opt-in basename compatibility mode for per-file inline dispatch. */
  readonly allowBasenameMatch?: boolean;
  /** Optional custom resolver hook for per-file inline dispatch. */
  readonly resolver?: AssetResolver;
}
