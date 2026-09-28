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
  | 'HTML_BASE_UNMAPPABLE'
  | 'INLINE_SKIPPED';

/** Structured diagnostic for skipped or failed references. */
export interface AssetDiagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly originalUrl?: string;
  /** For HTML with an applicable base href, the actual containing document (if supplied), never a synthetic base path. */
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

/** Result for a single target file processed by `inlineFiles`.
 *
 * Bounded error-result content contract (AIH-03): when a target is rejected
 * by `maxTargetBytes` — either by the regular-file metadata preflight (body
 * never read) or by the post-read actual-bytes check (growth race) — the
 * result carries `content: ''`, `modified: false`, `written: false`, and a
 * `RESOURCE_LIMIT` diagnostic. Rejected bodies are never loaded just to fill
 * the result. Syntax-depth, replacement-count and output-byte limit failures
 * also discard result content and replacements and never write the target.
 * Other failures (parse/resolver/filesystem) retain the read
 * body in `content` where one was read.
 */
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
  /**
   * URL text passed to resolution, including query/fragment. Transforms normally
   * decode HTML entities/CSS escapes first; the style decoder-disagreement
   * fallback retains raw HTML entities. Standalone resolvers use caller input.
   */
  readonly originalUrl: string;
  /** Decoded logical path without query/fragment, percent-decoded for filesystem matching. POSIX-style with forward slashes. */
  readonly decodedPath: string;
  /** Basename of `decodedPath` (POSIX basename). */
  readonly basename: string;
  /** Document path of the containing CSS/HTML file, if available. */
  readonly documentPath?: string;
  /**
   * Absolute directory selected by the first applicable HTML base href, when
   * present and locally mappable (also for embedded CSS). `documentPath` remains
   * the actual containing file, and `decodedPath` remains the reference's own
   * path. Relative paths use this directory; root-relative paths still use
   * `rootDir`/cwd. Absent for no-base HTML, standalone CSS/resolution utilities.
   */
  readonly resolutionBaseDir?: string;
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

/**
 * Options for pure CSS/HTML inlining over an existing catalog.
 * HTML srcset resolves complete decoded URL tokens, including interior commas.
 * Invalid candidate descriptors are preserved without resolver calls; valid
 * descriptors and separators retain their source spelling when patched.
 * HTML selects the first HTML-namespace `<base href>` in parsed tree order
 * before transforming, ignoring inert template content and bases without href.
 * Relative/root-relative bases map under the filesystem contract; empty href
 * selects the document fallback and prevents later bases from taking effect.
 * Entities are decoded once. Remote/protocol-relative and unmappable bases
 * preserve local-looking references with `HTML_BASE_UNMAPPABLE` warnings and
 * no lookup/resolver calls. HTML-disallowed data:/javascript: bases use fallback.
 * No base fetching/rewriting or browser-origin/CSP inference is performed.
 */
export interface InlineOptions {
  /** Immutable catalog to resolve local references against. */
  readonly catalog: AssetCatalog;
  /** Actual containing file; relative resolution uses its directory unless HTML supplies a mappable base href. */
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
   * Includes HTML output quotes/escaping and CSS font hints; changed output is
   * checked again after assembly or fallback serialization. No truncation.
   */
  readonly maxOutputBytes?: number;
  /**
   * Maximum syntax nesting, independent of filesystem `maxDepth`. Positive safe
   * integer; default 256 (`DEFAULT_MAX_SYNTAX_DEPTH`), maximum 512.
   * HTML counts parsed element ancestors including the element itself, implied
   * elements and template content; document/fragment roots, text and comments add
   * zero. CSS counts simultaneously open unescaped `{`, `(` and `[` delimiters
   * outside strings/comments (including blocks, functions and custom properties).
   * Embedded CSS, when enabled, has its own depth starting at zero per chunk,
   * including decoded style attributes and inert template content.
   * Checked even without asset references, before recursive walking/serialization.
   * Excess throws `ResourceLimitError`; file APIs report `RESOURCE_LIMIT`, no write.
   */
  readonly maxSyntaxDepth?: number;
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
   * respect the effective HTML base (otherwise `documentPath`/`rootDir`), remote and `data:`
   * URLs are left untouched, and the same target/replacement/output/syntax limits apply.
   * Within resource limits, malformed embedded CSS produces a `PARSE_ERROR` diagnostic and leaves the
   * chunk unchanged — it never corrupts the surrounding HTML. Replacement
   * locations are mapped back to HTML source offsets.
   * Rewritten style attributes preserve attribute boundaries: unquoted values
   * gain double quotes, and values are escaped for their quote context, including
   * the raw-source decoder fallback. Added quotes and entity expansion count
   * toward `maxOutputBytes`. `<style>` element text is not HTML-entity decoded.
   */
  readonly inlineEmbeddedCss?: boolean;
}

/** Options for file-level orchestration (`inlineFiles`). HTML targets share `InlineOptions`' base-href contract. */
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
   * Default `5242880` (5 MiB), maximum `52428800` (50 MiB). Enforced before parser invocation;
   * per-target `RESOURCE_LIMIT` diagnostic with `written:false`, no partial write.
   * Regular files get a `stat` metadata preflight so oversized bodies are
   * rejected before reading/decoding (result `content: ''`); a post-read
   * actual-bytes check still rejects growth races and also discards the body.
   * Reads are metadata-preflight only, not strictly bounded. Async body reads
   * receive the operation `AbortSignal`.
   */
  readonly maxTargetBytes?: number;
  /**
   * Maximum replacements per target file. Finite positive safe integer.
   * Default `1000`, maximum `100000`. Enforced before each data URL insertion; per-target diagnostic on exceed.
   */
  readonly maxReplacements?: number;
  /**
   * Maximum transformed output bytes (UTF-8) per target file. Finite positive safe integer.
   * Default `20971520` (20 MiB), maximum `104857600` (100 MiB).
   * Enforced via projection including quotes/escaping/font hints and checked
   * again on changed output; per-target `RESOURCE_LIMIT`, no write on exceed.
   */
  readonly maxOutputBytes?: number;
  /**
   * Syntax nesting limit forwarded to each CSS/HTML target; default 256, maximum
   * 512, independent of filesystem `maxDepth`. See `InlineOptions.maxSyntaxDepth`
   * for counting (including opt-in embedded CSS). Excess yields a per-target
   * `RESOURCE_LIMIT` diagnostic with `written: false`, even without replacements.
   */
  readonly maxSyntaxDepth?: number;
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
