/** Public model types for `@web-ts-toolkit/asset-inliner`. */

import type { AssetDefinitionRegistry } from './definitions.ts';

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

/** Immutable definition for a single asset type. */
export type AssetTypeDefinition =
  | {
      readonly kind: 'font';
      readonly extensions: readonly string[];
      readonly mediaType: string;
      readonly fontFormat?: string;
    }
  | {
      readonly kind: Exclude<AssetKind, 'font'>;
      readonly extensions: readonly string[];
      readonly mediaType: string;
      readonly fontFormat?: never;
    };

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

/** Result of encoding a single asset to a Base64 data URL. */
export interface EncodedAsset {
  /** Normalized absolute path when input was a file path. */
  readonly sourcePath?: string;
  readonly filename?: string;
  readonly kind: AssetKind;
  readonly mediaType: string;
  readonly fontFormat?: string;
  readonly byteLength: number;
  /** RFC 2397 data URL: `data:<mediaType>;base64,<payload>` */
  readonly dataUrl: string;
}

// ---------------------------------------------------------------------------
// Catalog — immutable registry + encoded assets
// ---------------------------------------------------------------------------

/** Immutable catalog of encoded assets. Keys are normalized absolute paths. */
export interface AssetCatalog {
  readonly assets: readonly EncodedAsset[];
  readonly definitions: readonly AssetTypeDefinition[];
  readonly getByPath: (absolutePath: string) => EncodedAsset | undefined;
  readonly getByBasename: (basename: string) => EncodedAsset | undefined;
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Replacement diagnostics (pure transform boundaries)
// ---------------------------------------------------------------------------

/** One replacement of a local URL with an inlined data URL. */
export interface AssetReplacement {
  readonly originalUrl: string;
  readonly resolvedPath: string;
  readonly kind: AssetKind;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly location?: {
    readonly offset: number;
    readonly line?: number;
    readonly column?: number;
  };
}

export type DiagnosticCode =
  | 'UNRESOLVED_REFERENCE'
  | 'AMBIGUOUS_ASSET'
  | 'UNSUPPORTED_KIND'
  | 'INVALID_OPTIONS'
  | 'RESOURCE_LIMIT'
  | 'PARSE_ERROR'
  | 'FILESYSTEM_ERROR'
  | 'UNSUPPORTED_TYPE'
  | 'RESOLVE_ERROR'
  | 'INLINE_SKIPPED';

/** Structured diagnostic for skipped or failed references. */
export interface AssetDiagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly originalUrl?: string;
  readonly filePath?: string;
  readonly severity: 'warn' | 'error';
}

// ---------------------------------------------------------------------------
// Transform results
// ---------------------------------------------------------------------------

/** Result of a pure content transform. */
export interface InlineResult {
  readonly content: string;
  readonly modified: boolean;
  readonly replacements: readonly AssetReplacement[];
  readonly diagnostics: readonly AssetDiagnostic[];
}

/** Result for a single target file processed by `inlineFiles`. */
export interface InlineFileResult extends InlineResult {
  /** Absolute path of the target file. */
  readonly filePath: string;
  /** Whether the file was written (only true when `write: true` and modified). */
  readonly written: boolean;
}

// Option types

/**
 * Detection mode for resolving media type.
 * - `extension`: deterministic extension lookup (sync+async), supports SVG and other text formats.
 * - `content`: async-only `file-type` signature detection when filename is absent.
 * - `verify`: async-only mismatch check between detected and expected metadata.
 */
export type DetectionMode = 'extension' | 'content' | 'verify';

/** Options for single/batch encoding. */
export interface EncodeOptions {
  /** Immutable registry overrides. Duplicate extensions are rejected. */
  readonly definitions?: readonly AssetTypeDefinition[];
  /**
   * Already validated registry. When provided, `definitions` must not be provided;
   * the registry is used directly without re-normalization. Allows callers that
   * already hold a `createDefinitionRegistry` result to avoid repeated validation.
   */
  readonly registry?: AssetDefinitionRegistry;
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
  /**
   * Per-operation detector for `detection: 'content' | 'verify'`.
   * When omitted the default lazy `file-type` detector is used. No process-global
   * mutation is required; concurrent operations may supply independent detectors
   * without interference. The object must have an async `detect(bytes, signal?)` method.
   */
  readonly detector?: import('./detect.ts').AssetDetector;
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
  /**
   * Already validated registry for filtering. When provided, `definitions` must not be provided.
   * Discovery can reuse a registry already held by the caller to avoid re-normalizing.
   */
  readonly registry?: AssetDefinitionRegistry;
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
 * Synchronous custom matcher/resolver hook — **sync-only** honest contract for inline transforms.
 * Normal TypeScript rejects async callbacks (those returning `Promise`) at compile time when this
 * type is used in `InlineOptions`/`InlineFilesOptions`. At runtime any thenable
 * (native Promise, cross-realm Promise, custom `{ then: Function }`) is rejected with
 * `INVALID_OPTIONS` before mutation.
 * Return an `EncodedAsset` to use, or `undefined` to let default exact/basename matching run.
 * The hook must not throw for skip/remote cases; classification is handled before the hook is called.
 */
export type AssetResolverSync = (input: ResolverInput, catalog: AssetCatalog) => ResolverResult;

/** Async-capable resolver hook — for the standalone `resolveAssetReference` utility. */
export type AssetResolverAsync = (
  input: ResolverInput,
  catalog: AssetCatalog,
) => ResolverResult | Promise<ResolverResult>;

/**
 * Custom matcher/resolver hook — legacy alias.
 * @deprecated Use `AssetResolverSync` for transforms (`inlineCss`/`inlineHtml`/`inlineFiles`) or
 * `AssetResolverAsync` for standalone async `resolveAssetReference`. This alias is retained for
 * backwards compatibility and equals `AssetResolverAsync`.
 */
export type AssetResolver = AssetResolverAsync;

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
  /** Optional custom resolver hook — sync-only. Async resolvers rejected at compile time and at runtime with `INVALID_OPTIONS`. */
  readonly resolver?: AssetResolverSync;
  /**
   * Maximum target input bytes (UTF-8). Finite positive safe integer.
   * Default `5242880` (5 MiB, `DEFAULT_MAX_TARGET_BYTES`). Values > `52428800` (50 MiB) rejected as unreasonable.
   * Enforced before parser invocation; pure transforms throw `ResourceLimitError`, `inlineFiles` converts to per-target diagnostic.
   */
  readonly maxTargetBytes?: number;
  /**
   * Maximum replacements per target. Finite positive safe integer.
   * Default `1000` (`DEFAULT_MAX_REPLACEMENTS`). Values > `100000` rejected as unreasonable.
   * Enforced before inserting each data URL.
   */
  readonly maxReplacements?: number;
  /**
   * Maximum transformed output bytes (UTF-8) per target. Finite positive safe integer.
   * Default `20971520` (20 MiB, `DEFAULT_MAX_OUTPUT_BYTES`). Values > `104857600` (100 MiB) rejected as unreasonable.
   * Enforced per replacement via pessimistic projection (`original + sum delta`) with safe-integer arithmetic before insertion.
   */
  readonly maxOutputBytes?: number;
  /**
   * Selective inlining threshold — assets whose `byteLength` exceeds this value
   * are left as external references with a structured `INLINE_SKIPPED` diagnostic
   * (`severity: 'warn'`). Distinct from hard resource limits (`maxAssetBytes` /
   * `maxTotalBytes`) which remain fail-closed and throw `ResourceLimitError`.
   * Finite positive safe integer, `<= 104857600` (100 MiB). No default — when
   * omitted every catalogued asset is eligible for inlining (subject to kind gating).
   * No implicit extension or environment heuristics are applied.
   */
  readonly maxInlineBytes?: number;
  /**
   * Synchronous predicate for selective inlining. Called with each resolved
   * `EncodedAsset` and the original URL string; return `false` to leave the
   * reference external with an `INLINE_SKIPPED` diagnostic, `true` to inline.
   * Must be synchronous — returning a thenable is rejected. When provided,
   * `maxInlineBytes` is still enforced first; both conditions must pass to inline.
   */
  readonly shouldInline?: (asset: EncodedAsset, url: string) => boolean;
  /**
   * Opt-in embedded CSS processing for `inlineHtml` (default `false`).
   * When `true`, `<style>` element text and `style` attribute values are
   * transformed with the same CSS semantics as `inlineCss`: local `url(...)`
   * resolve relative to the HTML `documentPath`/`rootDir`, remote and `data:`
   * URLs are left untouched, and the same target/replacement/output limits apply.
   * Malformed embedded CSS produces a `PARSE_ERROR` diagnostic and leaves the
   * chunk unchanged — it never corrupts the surrounding HTML. Replacement
   * locations are mapped back to HTML source offsets.
   */
  readonly inlineEmbeddedCss?: boolean;
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
  /** Maximum number of target files to process. Default `500`. Values > `5000` rejected. */
  readonly maxTargets?: number;
  /** Explicit root for resolving relative URLs when documentPath is not used; passed to per-file inline dispatch. */
  readonly rootDir?: string;
  /** Opt-in basename compatibility mode for per-file inline dispatch. */
  readonly allowBasenameMatch?: boolean;
  /** Optional custom resolver hook — sync-only. */
  readonly resolver?: AssetResolverSync;
  /**
   * Maximum target input bytes (UTF-8) per file. Finite positive safe integer.
   * Default `5242880` (5 MiB). Enforced before parser invocation; per-target `RESOURCE_LIMIT` diagnostic with `written:false`, no partial write.
   */
  readonly maxTargetBytes?: number;
  /**
   * Maximum replacements per target file. Finite positive safe integer.
   * Default `1000`. Enforced before each data URL insertion; per-target diagnostic on exceed.
   */
  readonly maxReplacements?: number;
  /**
   * Maximum transformed output bytes (UTF-8) per target file. Finite positive safe integer.
   * Default `20971520` (20 MiB). Enforced per replacement via projection with safe-integer arithmetic.
   */
  readonly maxOutputBytes?: number;
  /**
   * Selective inlining threshold — assets whose `byteLength` exceeds this value
   * are left as external references with a structured `INLINE_SKIPPED` diagnostic
   * (`severity: 'warn'`). Distinct from hard limits (`maxAssetBytes`/`maxTotalBytes`)
   * which remain fail-closed. Finite positive safe integer, `<= 104857600`. No default.
   */
  readonly maxInlineBytes?: number;
  /**
   * Synchronous predicate for selective inlining. Return `false` to leave external
   * with `INLINE_SKIPPED` diagnostic. Must be synchronous; thenable rejected.
   * When provided, `maxInlineBytes` is still enforced first.
   */
  readonly shouldInline?: (asset: EncodedAsset, url: string) => boolean;
  /**
   * Opt-in embedded CSS processing for HTML targets (default `false`).
   * Forwarded to `inlineHtml`; see `InlineOptions.inlineEmbeddedCss`.
   */
  readonly inlineEmbeddedCss?: boolean;
}
