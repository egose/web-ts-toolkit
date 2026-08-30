/**
 * `@web-ts-toolkit/asset-inliner` — public entrypoint.
 *
 * ESM-only, Node 22+. Named exports only — no default export.
 */

// Re-export public model types for installed consumers.
export type {
  AssetTypeDefinition,
  AssetInput,
  EncodedAsset,
  AssetCatalog,
  AssetReplacement,
  AssetDiagnostic,
  DiagnosticCode,
  InlineResult,
  InlineFileResult,
  BuiltInAssetKind,
  AssetKind,
  DetectionMode,
  EncodeOptions,
  CatalogOptions,
  InlineOptions,
  InlineFilesOptions,
  DiscoveryOptions,
  ResolverInput,
  ResolverResult,
  AssetResolver,
  AssetResolverSync,
  AssetResolverAsync,
} from './types.ts';

// Registry and definitions — immutable built-ins plus explicit SVG-font.
export {
  builtInDefinitions,
  svgFontDefinition,
  createDefinitionRegistry,
  createSvgFontRegistry,
  resolveExtension,
} from './definitions.ts';
export type { AssetDefinitionRegistry } from './definitions.ts';

// Typed errors — stable literal codes; subclasses narrow `code`.
export {
  AssetInlinerError,
  UnsupportedAssetError,
  AmbiguousDefinitionError,
  InvalidOptionsError,
  DetectionMismatchError,
  AmbiguousAssetError,
  ResourceLimitError,
  ParseError,
  FilesystemError,
} from './errors.ts';
export type { AssetInlinerErrorCode } from './errors.ts';

// Detection — default lazy detector and advanced helpers.
export { defaultDetector, resolveByExtension, resolveWithDetector } from './detect.ts';
export type { DetectorResult, AssetDetector, ResolvedMeta } from './detect.ts';

// Encoding — file path or Uint8Array -> data URL
export { encodeAsset, encodeAssetSync, encodeAssets, encodeAssetsSync } from './encode.ts';

// Formatters — deterministic CSS wrappers
export { formatCssUrl, formatFontSource } from './format.ts';

// ---------------------------------------------------------------------------
// Discovery — deterministic traversal
// ---------------------------------------------------------------------------

export { discoverAssets, discoverAssetsSync } from './discovery.ts';
export type { DiscoverOptions } from './discovery.ts';

// ---------------------------------------------------------------------------
// Resolver — URL classification, decoding, and catalog lookup
// ---------------------------------------------------------------------------

export {
  classifyUrl,
  isSkippableUrl,
  stripQueryAndFragment,
  decodeUrlPath,
  extractDecodedPath,
  normalizeLogicalUrlPath,
  resolveLogicalPathToAbsolute,
  resolveAssetReference,
  resolveAssetReferenceSync,
} from './resolve.ts';
export type { UrlClassification, ResolveAssetOptions, ResolveAssetOptionsSync, ResolvedAsset } from './resolve.ts';

// ---------------------------------------------------------------------------
// Catalog — immutable registry + encoded assets
// ---------------------------------------------------------------------------

export { createAssetCatalog, createAssetCatalogSync } from './catalog.ts';

// ---------------------------------------------------------------------------
// Pure content transforms — synchronous over an existing catalog
// ---------------------------------------------------------------------------

/**
 * Inline local `url(...)` references in CSS content using an already-encoded catalog.
 * Synchronous pure transform; async detection/filesystem work must happen during catalog creation.
 * Returns original content byte-for-byte when no replacement occurs.
 */
export { inlineCss } from './css.ts';

/**
 * Inline targeted asset references in HTML content using an already-encoded catalog.
 * Covers `<img src>`, `srcset`, `source[src|srcset]`, `link[href]` (icons), `video[poster]`, etc.
 * Returns original content byte-for-byte when no replacement occurs.
 */
export { inlineHtml } from './html.ts';

// ---------------------------------------------------------------------------
// Policy — finite defaults and validation
// ---------------------------------------------------------------------------

export {
  DEFAULT_MAX_ASSET_BYTES,
  DEFAULT_MAX_TOTAL_BYTES,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_TARGETS,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_TARGET_BYTES,
  DEFAULT_MAX_REPLACEMENTS,
  DEFAULT_MAX_OUTPUT_BYTES,
  MAX_REASONABLE_MAX_ASSET_BYTES,
  MAX_REASONABLE_MAX_TOTAL_BYTES,
  MAX_REASONABLE_MAX_FILES,
  MAX_REASONABLE_MAX_DEPTH,
  MAX_REASONABLE_MAX_TARGETS,
  MAX_REASONABLE_CONCURRENCY,
  MAX_REASONABLE_MAX_TARGET_BYTES,
  MAX_REASONABLE_MAX_REPLACEMENTS,
  MAX_REASONABLE_MAX_OUTPUT_BYTES,
  MAX_REASONABLE_MAX_INLINE_BYTES,
  DEFAULT_POLICY,
  validatePolicyValue,
  validatePolicyOptions,
  normalizePolicy,
} from './policy.ts';
export type { AssetInlinerPolicy } from './policy.ts';

// ---------------------------------------------------------------------------
// File orchestration — dry-run by default, opt-in atomic write
// ---------------------------------------------------------------------------

export { inlineFiles, inlineFilesSync } from './files.ts';
