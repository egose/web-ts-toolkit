# `@web-ts-toolkit/asset-inliner`

Generic ESM-only asset inliner for CSS and HTML — Base64 data URL encoding, CSS `url()` / font `format()` formatting, deterministic catalog and file pipeline.

- **Runtime:** Node.js `>=22`
- **Module:** ESM only (`"type": "module"`). No CommonJS `require()` entry.
- **Imports:** named imports from `@web-ts-toolkit/asset-inliner` (no default export, no attached methods).

## Installation

```sh
pnpm add @web-ts-toolkit/asset-inliner
# npm: npm install @web-ts-toolkit/asset-inliner
# yarn: yarn add @web-ts-toolkit/asset-inliner
```

Requires Node `>=22`. The package publishes an import-only export map (`types` + `import`/`default` → `dist/index.mjs` + `dist/index.d.mts`). `require('@web-ts-toolkit/asset-inliner')` is not supported.

```ts
import {
  encodeAsset,
  encodeAssetSync,
  formatCssUrl,
  formatFontSource,
  createAssetCatalog,
  inlineCss,
  inlineHtml,
  inlineFiles,
} from '@web-ts-toolkit/asset-inliner';
```

## Quick examples

### Encode a single file or bytes

```ts
import { encodeAsset, encodeAssetSync } from '@web-ts-toolkit/asset-inliner';

// from a file path (async, supports detection modes)
const asset = await encodeAsset('./assets/logo.png');
console.log(asset.mediaType); // 'image/png'
console.log(asset.dataUrl); // 'data:image/png;base64,...'

// from bytes with explicit metadata (works for SVG / custom types)
const bytes = new Uint8Array([137, 80, 78, 71]);
const fromBytes = await encodeAsset({ data: bytes, filename: 'logo.png' });

// sync variant — deterministic extension lookup only
import { encodeAssetSync } from '@web-ts-toolkit/asset-inliner';
const syncAsset = encodeAssetSync('./assets/app.woff2');
```

### Format for CSS

```ts
import { encodeAsset, formatCssUrl, formatFontSource } from '@web-ts-toolkit/asset-inliner';

const png = await encodeAsset('./assets/logo.png');
formatCssUrl(png); // 'url(data:image/png;base64,...)'

const woff2 = await encodeAsset('./assets/app.woff2');
formatFontSource(woff2); // 'url(data:font/woff2;base64,...) format('woff2')'
// formatFontSource throws InvalidOptionsError when fontFormat is missing
```

### Inline CSS (pure, synchronous over a catalog)

```ts
import { createAssetCatalog, inlineCss } from '@web-ts-toolkit/asset-inliner';

const catalog = await createAssetCatalog(['./assets/logo.png', './assets/fonts/app.woff2']);
const css = `
  @font-face { font-family: 'App'; src: url('./assets/fonts/app.woff2') format('woff2'), local('App'); }
  .hero { background: url("./assets/logo.png"); }
`;
const result = inlineCss(css, { catalog, documentPath: '/project/src/app.css' });

if (result.modified) {
  console.log(result.replacements[0]?.originalUrl); // './assets/logo.png'
  console.log(result.diagnostics); // [] or warn/error for unresolved
}
```

### Inline HTML (pure, synchronous)

```ts
import { createAssetCatalog, inlineHtml } from '@web-ts-toolkit/asset-inliner';

const catalog = await createAssetCatalog(['./assets/logo.png', './assets/icon.png']);
const html = `<img src="./assets/logo.png" alt="logo"><link rel="icon" href="./assets/icon.png">`;
const out = inlineHtml(html, { catalog, documentPath: '/project/src/index.html' });
// targets handled: img[src], img[srcset], source[src|srcset], link[href] (icon allowlist), video[poster] where kind === 'image'
// srcset uses a standards-aware parser: descriptors (1x, 2x, 100w) preserved, literal commas inside data: URLs handled atomically,
// empty candidates skipped, ASCII whitespace respected — multi-comma data URLs remain unchanged while local candidates are replaced
// document vs fragment is detected from leading syntax (BOM, whitespace, comments stripped before <!doctype or <html>), so a comment containing <html> does not inject wrappers
// changed content prefers source-location patches of the targeted attribute value ranges so unrelated quotes/casing/comments/malformed markup remain byte-identical (patches applied descending, overlap/invalid detected, fallback to full serialization)
// locations report the URL token offset (0-based) with line 1-based / column 1-based, distinguishing duplicate and srcset candidates
// icon gating uses an explicit allowlist (icon, apple-touch-icon, apple-touch-icon-precomposed, mask-icon, fluid-icon, shortcut+icon) — iconic/nonicon are not eligible
// unchanged content is returned byte-for-byte, no wrapper injection, malformed HTML never throws
```

### Process files on disk (dry-run vs write)

```ts
import { inlineFiles, inlineFilesSync } from '@web-ts-toolkit/asset-inliner';

// Dry-run by default — no writes, one result per target in lexical order
const dry = await inlineFiles({
  assets: ['./assets'],
  targets: ['./styles', './pages/index.html'],
});
for (const r of dry) {
  console.log(r.filePath, r.modified, r.replacements.length, r.written); // written is always false here
}

// Opt-in write — same-directory temp + rename, mode preserved, temp cleaned up on failure
const written = await inlineFiles({
  assets: ['./assets'],
  targets: ['./styles/app.css'],
  write: true,
});

// Sync variant mirrors async with sync I/O
import { inlineFilesSync } from '@web-ts-toolkit/asset-inliner';
const drySync = inlineFilesSync({ assets: ['./assets'], targets: ['./styles'] });
```

### Custom asset kind without changing encoder

```ts
import {
  createDefinitionRegistry,
  encodeAsset,
  createAssetCatalog,
  builtInDefinitions,
} from '@web-ts-toolkit/asset-inliner';

const custom = {
  kind: 'audio' as const,
  extensions: ['.mp3'],
  mediaType: 'audio/mpeg',
} satisfies import('@web-ts-toolkit/asset-inliner').AssetTypeDefinition;
// explicit mediaType wins even for formats outside file-type
const tiny = await encodeAsset({ data: new Uint8Array([1, 2, 3]), mediaType: 'audio/mpeg', filename: 'ding.mp3' });

// build a catalog that includes custom definitions (immutable, no global mutation)
const registry = createDefinitionRegistry([...builtInDefinitions, custom]);
// reuse already-validated registry without re-normalizing definitions
const catalog = await createAssetCatalog(['./assets'], { registry });

// diagnostic codes are literal unions: DiagnosticCode = 'UNRESOLVED_REFERENCE' | 'AMBIGUOUS_ASSET' | ...
// error codes narrow too: if (e instanceof ResourceLimitError) e.code === 'RESOURCE_LIMIT'
```

## API surface (named exports only)

| Export                                                                                   | Description                                                                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `encodeAsset(input, options?)`                                                           | Async encode single file path or `{data, filename?, mediaType?, kind?, fontFormat?}` → `EncodedAsset` |
| `encodeAssetSync(...)`                                                                   | Sync variant; rejects `detection: 'content' \| 'verify'`                                              |
| `encodeAssets(inputs, options?)`                                                         | Async batch, preserves input order                                                                    |
| `encodeAssetsSync(...)`                                                                  | Sync batch                                                                                            |
| `formatCssUrl(asset)`                                                                    | `url(data:...)` generic                                                                               |
| `formatFontSource(asset)`                                                                | `url(data:...) format('...')` requires `fontFormat`                                                   |
| `createAssetCatalog(inputs, options?)`                                                   | Async catalog (discovery + encode), immutable, exact-path index                                       |
| `createAssetCatalogSync(...)`                                                            | Sync catalog                                                                                          |
| `inlineCss(content, {catalog, documentPath?, rootDir?, allowBasenameMatch?, resolver?})` | Pure sync CSS `url(...)` replacement                                                                  |
| `inlineHtml(content, {catalog, ...})`                                                    | Pure sync HTML replacement                                                                            |
| `inlineFiles(options)` / `inlineFilesSync(options)`                                      | Discovery + catalog + dispatch, dry-run default                                                       |

Registry: `builtInDefinitions`, `svgFontDefinition`, `createDefinitionRegistry(defs)`, `createSvgFontRegistry()`, `resolveExtension(ext)`.

Resolver helpers: `classifyUrl`, `isSkippableUrl`, `stripQueryAndFragment`, `decodeUrlPath`, `extractDecodedPath`, `normalizeLogicalUrlPath`, `resolveLogicalPathToAbsolute`, `resolveAssetReference`/`Sync`.

Discovery: `discoverAssets`, `discoverAssetsSync`.

Policy: `DEFAULT_MAX_*`, `MAX_REASONABLE_MAX_*`, `DEFAULT_POLICY`, `validatePolicyValue`, `normalizePolicy`.

Errors: `AssetInlinerError` + `UnsupportedAssetError`, `AmbiguousDefinitionError`, `InvalidOptionsError`, `DetectionMismatchError`, `AmbiguousAssetError`, `ResourceLimitError`, `ParseError`, `FilesystemError` (all with stable `code`).

## Detection modes

- `extension` (default): deterministic registry lookup from filename extension. Supports text formats like SVG, available to async and sync.
- `content`: async-only `file-type` signature detection (bounded to 4100 bytes). Useful when filename is absent. Throws `UnsupportedAssetError` if detected type not in allowed registry.
- `verify`: async-only comparison of detected binary metadata with expected (explicit or extension). Throws `DetectionMismatchError` on mismatch; no detection for text formats like SVG falls back to expected.

```ts
await encodeAsset('./assets/no-name.bin', { detection: 'content' }); // detects via bytes
await encodeAsset('./assets/logo.png', { detection: 'verify' }); // verifies extension vs bytes
encodeAssetSync('./assets/logo.png', { detection: 'content' }); // throws InvalidOptionsError
```

`file-type` is kept external and loaded via dynamic `import('file-type')`. Sync APIs never block a promise (no `promise-synchronizer`).

## Limits and security bounds

All numeric policies are validated (negative, zero, non-finite, fractional, unsafe integer, or unreasonable → `InvalidOptionsError`).

| Policy            | Default           | Reasonable cap | Rationale                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxAssetBytes`   | 3 MiB (3145728)   | 100 MiB        | Prevents accidental video/audio; allows large fonts/images; checked from file metadata before reading, re-checked on the bytes actually read, and enforced before `toString('base64')`                                                                                                                                                    |
| `maxTotalBytes`   | 15 MiB            | 500 MiB        | Caps batch/catalog blow-up (~1.33× expansion + `data:` prefix); enforced with the default even when the option is omitted                                                                                                                                                                                                                 |
| `maxTargetBytes`  | 5 MiB (5242880)   | 50 MiB         | Bounds CSS/HTML parser input before parsing (UTF-8 bytes); pure transforms throw `ResourceLimitError`, `inlineFiles` converts to per-target `RESOURCE_LIMIT` diagnostic with `written:false`, no partial write                                                                                                                            |
| `maxReplacements` | 1000              | 100 000        | Caps replacements per target to prevent one 3 MiB data URL repeated thousands of times allocating gigabytes; enforced before each insertion with safe-integer arithmetic                                                                                                                                                                  |
| `maxOutputBytes`  | 20 MiB (20971520) | 100 MiB        | Caps projected transformed output (original + sum delta per replacement, where delta is `dataUrlBytes - originalUrlBytes` plus font `format(...)`); enforced per replacement before insertion, safe-integer, no truncated return                                                                                                          |
| `maxFiles`        | 10 000            | 100 000        | Traversal guard                                                                                                                                                                                                                                                                                                                           |
| `maxDepth`        | 32                | 256            | Catches symlink cycles                                                                                                                                                                                                                                                                                                                    |
| `maxTargets`      | 500               | 5 000          | CSS/HTML entrypoints guard (`inlineFiles`)                                                                                                                                                                                                                                                                                                |
| `concurrency`     | 16                | 64             | Bounds parallel catalog encoding and target writes; discovery traversal itself is serial and deterministic                                                                                                                                                                                                                                |
| `maxInlineBytes`  | — (no default)    | 100 MiB        | Selective inlining threshold — assets whose `byteLength` exceeds this value are left as external references with a structured `INLINE_SKIPPED` diagnostic (`warn`, not error); distinct from hard `maxAssetBytes`/`maxTotalBytes` which remain fail-closed; also available as synchronous `shouldInline(asset, url) => boolean` predicate |

Defaults are **effective even when an option is omitted**: batch encoders and catalogs always reject once cumulative input bytes exceed the effective `maxTotalBytes` (default 15 MiB), and path inputs are rejected once file size exceeds the effective `maxAssetBytes` (default 3 MiB). For path inputs the file's metadata is inspected first so an oversized regular file is rejected **before** its contents are read or allocated. A file can still change between that metadata inspection and the read; if the bytes actually read exceed the limit the encode is rejected after the read as well. Async reads receive the `AbortSignal`, and cancellation during a read settles with the signal reason. Concurrent catalog chunks pre-plan file sizes against the remaining aggregate budget, so a chunk cannot allocate an unbounded amount past the effective remaining total while results stay in deterministic input order. Target input bytes are checked before parser invocation in both pure transforms (`inlineCss`/`inlineHtml` throw `ResourceLimitError`) and file orchestration (`inlineFiles` per-target diagnostic, no write); repeated references are bounded per replacement via `maxReplacements` and `maxOutputBytes` projection (`originalBytes + sum delta`) with safe-integer arithmetic before insertion, preserving exact-boundary success and never returning a silently truncated transform. Selective inlining (`maxInlineBytes` / `shouldInline`) is evaluated **after** catalog lookup and **before** replacement accounting, leaving oversized or predicate-rejected assets as external references with an `INLINE_SKIPPED` (`warn`) diagnostic; hard limits (`maxAssetBytes`/`maxTotalBytes`) remain fail-closed (`ResourceLimitError`) and cannot be downgraded by selection policy; no implicit extension or environment heuristics are applied and deterministic source order is preserved.

Defaults are **effective even when an option is omitted**: batch encoders and catalogs always reject once cumulative input bytes exceed the effective `maxTotalBytes` (default 15 MiB), and path inputs are rejected once file size exceeds the effective `maxAssetBytes` (default 3 MiB). For path inputs the file's metadata is inspected first so an oversized regular file is rejected **before** its contents are read or allocated. A file can still change between that metadata inspection and the read; if the bytes actually read exceed the limit the encode is rejected after the read as well. Async reads receive the `AbortSignal`, and cancellation during a read settles with the signal reason. Concurrent catalog chunks pre-plan file sizes against the remaining aggregate budget, so a chunk cannot allocate an unbounded amount past the effective remaining total while results stay in deterministic input order. Target input bytes are checked before parser invocation in both pure transforms (`inlineCss`/`inlineHtml` throw `ResourceLimitError`) and file orchestration (`inlineFiles` per-target diagnostic, no write); repeated references are bounded per replacement via `maxReplacements` and `maxOutputBytes` projection (`originalBytes + sum delta`) with safe-integer arithmetic before insertion, preserving exact-boundary success and never returning a silently truncated transform.

Override per-operation:

```ts
await encodeAsset('./assets/large.woff2', { maxAssetBytes: 5 * 1024 * 1024 });
await inlineFiles({ assets: ['./assets'], targets: ['./styles'], maxTargets: 1000, concurrency: 8 });
```

## Supported built-ins

**Fonts:** `.ttf` → `font/ttf` (`truetype`), `.otf` → `font/otf` (`opentype`), `.eot` → `application/vnd.ms-fontobject` (`embedded-opentype`), `.sfnt` → `font/sfnt` (`sfnt`), `.woff` → `font/woff` (`woff`), `.woff2` → `font/woff2` (`woff2`), `.ttc` → `font/collection` (`collection`). SVG font (`image/svg+xml`, `svg`) is available only via `svgFontDefinition` / `createSvgFontRegistry()` to avoid global `.svg` ambiguity; default `.svg` is image.

**Images:** `.apng` `image/apng`, `.bmp` `image/bmp`, `.gif` `image/gif`, `.ico`/`.cur` `image/vnd.microsoft.icon`, `.jpg`/`.jpeg`/`.jfif`/`.pjpeg`/`.pjp` `image/jpeg`, `.png` `image/png`, `.svg` `image/svg+xml`, `.tif`/`.tiff` `image/tiff`, `.webp` `image/webp`, `.avif` `image/avif`.

Extensions are normalized case-insensitively with leading dot; duplicates are rejected at registry construction.

**Audio/video:** No built-in definitions. Tiny audio/video can be inlined via custom `AssetTypeDefinition` and `allowedKinds` (see `src/policy.ts` and `test/policy.test.ts`). WebVTT, WASM, PDF, archives, office/executable/script/stylesheet/`application/*` remain out-of-scope as default inline targets by design.

**Target syntax:**

- CSS: every syntactically valid local `url(...)` in any declaration value (including `@font-face src` with comma-separated alternatives, backgrounds, masks, borders, cursors, `list-style-image`, generated content, custom properties `--*`, gradients, multiple URLs per decl, `image-set()` and other nested functions). `format(...)` is added only for `kind === 'font' && fontFormat` inside `@font-face src` when no following `format(...)` exists. URL token values are CSS-unescaped per CSS Syntax (hex escapes 1–6 digits plus optional whitespace, escaped newlines `\` + newline are ignored, simple `\c` escapes) before classification and percent-decoding, while the original spelling is retained for diagnostics and replacement records. Locations are derived from parser source indexes and declaration-local mapping (value start offset + `postcss-value-parser` `sourceIndex`), not global `indexOf`, so duplicate spellings in unrelated declarations, comments, quoted/unquoted forms, and nested `image-set()` receive distinct correct offsets with deterministic source-order replacement. Existing `data:`/remote URLs are preserved; malformed escapes produce a controlled `INVALID_OPTIONS` diagnostic and no partial token mutation.
- HTML: `img[src]` (legacy), `img[srcset]` + `source[srcset]` (standards-aware: descriptors `1x`/`2x`/`100w` preserved, literal commas inside `data:` URLs handled atomically, empty candidates skipped, ASCII whitespace respected — a multi-comma data URL candidate stays unchanged while a later local candidate is replaced with its descriptor), `source[src]`, icon `link[href]` (explicit allowlist: `icon`, `apple-touch-icon`, `apple-touch-icon-precomposed`, `mask-icon`, `fluid-icon`, and `shortcut` + `icon` pair, case-insensitive — `iconic`/`nonicon` untouched), `video[poster]` where `kind === 'image'`. Gated by `(element, attribute, kind)` triple — `a[href]`, `form[action]`, `script[src]`, `link[rel=stylesheet][href]`, `iframe[src]`, `object[data]`, `embed[src]`, and audio/video `src` are not inlined by default. Document vs fragment is detected from leading syntax (optional BOM, whitespace, and `<!-- comments -->` stripped before `<!doctype` or `<html>`) so a comment containing `<html>` does not add wrappers. When replacements occur, source-location patches of the targeted attribute value ranges are applied in descending offset order with overlap/invalid detection so unrelated markup (quotes, casing, comments, optional tags, malformed-but-recovered markup) remains byte-identical; fallback to full `parse5` serialization may normalize if patches are invalid. Replacement `location` identifies the actual URL token (`offset` 0-based, `line` 1-based, `column` 1-based) for duplicate `src` and `srcset` candidates, not the attribute start. Opt-in `inlineEmbeddedCss: true` additionally processes `<style>` element text and `style` attribute values with the same CSS transform semantics as `inlineCss`: local `url(...)` resolve relative to the HTML `documentPath`/`rootDir`, remote and `data:` URLs are left untouched, the same `maxTargetBytes`/`maxReplacements`/`maxOutputBytes` limits and selective policy (`maxInlineBytes`/`shouldInline`) apply across the whole target, replacement locations are mapped back to HTML source offsets, and malformed embedded CSS yields a `PARSE_ERROR` diagnostic that leaves the chunk and surrounding HTML unchanged (never throws, never corrupts markup). JS templates, shadow DOM, and runtime fetching are explicitly out of scope.

## Matching and filesystem contract

- Catalog keys use normalized absolute paths (`path.resolve`). Basename-only fallback is opt-in (`allowBasenameMatch: true`); duplicates throw `AmbiguousAssetError` with frozen `candidates` — iteration order never picks a winner.
- References resolve relative to `documentPath` (file being transformed) or explicit `rootDir` for in-memory content. Absolute `/` URLs resolve relative to `rootDir`/`cwd`. Query `?...` and fragment `#...` are stripped for matching and never placed into filesystem paths; the replaced data URL does not retain them. Percent-encoding is decoded via `decodeURIComponent`; malformed or NUL-containing paths throw `InvalidOptionsError`.
- `data:`, `blob:`, protocol-relative `//`, fragment-only `#...`, and any scheme URL (`http:`, `mailto:`, etc.) are skipped before filesystem work.
- Discovery accepts one or many paths/roots and traverses in one deterministic order: **lexical depth-first entry order** — each sorted directory entry (and, for directories, its entire subtree) is processed before the next sibling entry. Caller order is retained between roots.
- Containment is **canonical**: `traversalRoot` and every accepted file/directory are canonicalized with `realpath` before comparison, so a regular file reached through a symlinked ancestor resolves outside the root and is rejected with `FilesystemError` — even when the final path component is not a symlink. Escaping the root is possible only via the explicit `allowTraversalEscape: true` option. `followSymlinks: false` (default) never follows a symlink directory entry; with cycle detection when `followSymlinks: true`.
- Aliases are deduplicated by canonical identity (`realpath`); the first-seen logical (lexical) path is reported and used for diagnostics. Traversal is serial, so result order never depends on parallel completion; the `concurrency` option is validated for API compatibility but does **not** accelerate discovery (it bounds catalog encoding and target writes).
- Residual risk: containment is validated at discovery time. A path component can still be swapped (e.g. a directory replaced by a symlink) between discovery and a later read or write; closing that TOCTOU window would require descriptor-relative (`openat`-style) traversal, which this package does not implement.
- `inlineCss` throws `ParseError` only when the stylesheet is unparseable; per-URL issues (unresolved, ambiguous, malformed percent or malformed CSS escapes, NUL) emit `diagnostics` and leave the `url(...)` unchanged (no partial mutation). Replacement `location` for CSS is the URL token offset (`offset` 0-based, `line` 1-based, `column` 1-based) derived from declaration-local parser indexes. `inlineHtml` never throws on malformed markup or `<img>` without `src` (HTML spec recovery).

## Dry-run vs write

`inlineFiles` defaults to `write: false` (dry-run). `write: true` stages to a same-directory temp file (`.tmp.asset-inliner.<hex>.<basename>.tmp`) created **exclusively** (`wx`) with the target's original mode so a restrictive `0o600` is never temporarily widened to the process `umask` default, `chmod`s/`fchmod`s it to the exact original mode, `fsync`s the temp before `rename`, `rename`s atomically over the target, and best-effort `fsync`s the parent directory on POSIX. The temp is removed on any failure and a cleanup failure never masks the primary `FilesystemError`.

- **Commit point:** the `rename` is the atomic commit. `AbortSignal` is checked after reads, after transformation, before staging, and immediately before `rename`. If cancellation wins **before** the commit the target is left unchanged, the temp is removed, and the batch rejects with the signal's reason. If at least one `rename` has already committed, a later cancellation check does **not** hide that state — the batch returns accurate per-target `written: true/false` results (documented race boundary).
- `stat`, write, `chmod`/`fchmod`, `fsync`/`fsyncSync`, `close`, and `rename` failures are treated as controlled write failures (`FILESYSTEM_ERROR`, `written: false`) with preserved `operation`/`cause`.
- Target read failures are normalized to stable `FILESYSTEM_ERROR` diagnostics (raw `ENOENT` etc. are not leaked).
- POSIX rename over an existing file is atomic when source and destination are on the same filesystem; cross-filesystem (`EXDEV`) surfaces as `FilesystemError` per target.
- Windows `EPERM`/`EBUSY` when the target is held open is not retried — it surfaces as per-target `FilesystemError`; callers may retry the whole call.
- Crash durability: temp is `fsync`'d before `rename`; after `rename` the parent directory is `fsync`'d where supported (POSIX, best-effort). This provides replacement atomicity and flushes the directory entry on supported platforms; it is not a full `fsync`-to-disk guarantee on all filesystems (Windows directory `fsync` is ignored).
- Unchanged content is never written. Per-target parse/write failures are captured as `diagnostics` with `written: false` and do not convert the batch to “fully successful.” Result order follows target input/lexical order, not promise completion order; concurrency is bounded (`concurrency`).

## Custom definitions and resolver hook

Registries are immutable values — pass `definitions` per operation or via `createDefinitionRegistry([...builtInDefinitions, custom])`. No process-global mutable registry exists.

```ts
import { createDefinitionRegistry, inlineCss } from '@web-ts-toolkit/asset-inliner';

const registry = createDefinitionRegistry([
  ...builtInDefinitions,
  { kind: 'image', extensions: ['.jxl'], mediaType: 'image/jxl' },
]);

const catalog = await createAssetCatalog(['./assets'], { definitions: registry.definitions });

// narrow custom matcher — no parser AST knowledge required
const result = inlineCss(css, {
  catalog,
  documentPath: '/project/src/app.css',
  resolver: (input, catalog) => {
    // input: { originalUrl, decodedPath, basename, documentPath, rootDir }
    if (input.basename === 'legacy.png') return catalog.getByPath('/project/assets/alias.png');
    return undefined; // fall back to default exact/basename matching
  },
});
```

The hook is invoked only for local URLs that passed `data:`/`blob:`/remote/fragment skipping and decoded without error. In sync mode, async resolvers throw `InvalidOptionsError`.

## Errors

All errors extend `AssetInlinerError` and carry a stable `code`:

- `UNSUPPORTED_ASSET` (`UnsupportedAssetError`) — extension/media not in registry; fields `extension`, `mediaType`, `path`
- `AMBIGUOUS_DEFINITION` (`AmbiguousDefinitionError`) — duplicate extension at registry construction; `extension`, `conflictingMediaTypes` (frozen)
- `INVALID_OPTIONS` (`InvalidOptionsError`) — malformed detection mode, NUL/malformed percent, negative/zero/non-finite/fractional/unreasonable limits
- `DETECTION_MISMATCH` (`DetectionMismatchError`) — `verify` mode detected different `mediaType`; `expectedMediaType`, `detectedMediaType`
- `AMBIGUOUS_ASSET` (`AmbiguousAssetError`) — basename mode duplicate; `basename`, `candidates` (frozen)
- `RESOURCE_LIMIT` (`ResourceLimitError`) — `limit`/`actual`/`path` for byte/count/depth/target/concurrency
- `PARSE_ERROR` (`ParseError`) — CSS unparseable (HTML uses per-target diagnostics)
- `FILESYSTEM_ERROR` (`FilesystemError`) — missing path, permission, or failed atomic write; `path`, `operation`, `cause` preserved

Raw asset bytes are never included in messages; `candidates`/`conflictingMediaTypes` are frozen snapshots.

```ts
import { encodeAsset, ResourceLimitError, UnsupportedAssetError } from '@web-ts-toolkit/asset-inliner';
try {
  await encodeAsset('./assets/huge.png');
} catch (e) {
  if (e instanceof ResourceLimitError) console.error(e.code, e.limit, e.actual);
  if (e instanceof UnsupportedAssetError) console.error(e.extension);
}
```

## Security caveats

- **Size blow-up:** `data:` URLs are ~33% larger than the source (`ceil(n/3)*4` + `data:<mime>;base64,` prefix). Inlining large assets can bloat CSS/HTML significantly. Respect `maxAssetBytes`/`maxTotalBytes` and prefer icons/fonts (<500 KB) over media clips. The package enforces finite defaults (3 MiB per-asset, 15 MiB total) and validates every numeric limit.
- **CSP/caching:** A Content Security Policy that restricts `data:` in `style-src`/`img-src` (or `font-src`) will block the inlined assets. Data URLs are not cached separately from the containing file; inlining trades HTTP caching granularity for fewer requests. Evaluate per deployment.
- **No sanitization:** Data URLs are not sanitized. In particular, SVG is an active XML format (it can contain `<script>`). This package does not strip scripts or validate SVG content — it only Base64-encodes bytes and rewrites URLs. If SVG sources are untrusted, sanitize them before inlining.
- **No fetching or validation:** Remote URLs are never fetched, and `file-type` detection is best-effort binary signature sniffing (bounded to 4100 bytes) and not a security guarantee or file validation — see `file-type` docs.
- **Extensionless imports:** The package is ESM-only and bundles internal source with `tsup` (`bundle: true`). Published files are `dist/index.mjs`, `dist/index.d.mts`, and `README.md`; `sideEffects: false` and import-time I/O is none.
- **No SCSS/Less:** Only plain CSS is transformed; `.scss`/`.less` aliases are rejected — a real preprocessor adapter would require its own parser and tests.

## Dependency and license notices

- Dependencies are external runtime imports: [`file-type@22.0.2`](https://github.com/sindresorhus/file-type) MIT, [`postcss@8.5.26`](https://github.com/postcss/postcss) MIT, [`postcss-value-parser@4.2.0`](https://github.com/TrySound/postcss-value-parser) MIT, [`parse5@8.0.0`](https://github.com/inikulin/parse5) MIT. The shipped ESM JavaScript is a bundled `dist/index.mjs` (tsup) with `file-type` kept external via dynamic `import('file-type')`.
- This package’s own metadata is `Apache-2.0` with `publishConfig.access: public`, homepage `https://web-ts-toolkit.pages.dev/docs/packages/asset-inliner`, repository `git+https://github.com/egose/web-ts-toolkit.git` (`packages/asset-inliner`).

## Migration

### From `node-font2base64` → `@web-ts-toolkit/asset-inliner`

| Legacy (`node-font2base64`)                                                                                                                 | Canonical                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `encodeToDataUrl(file)` → `string` (`data:font/...;charset=utf-8;base64,...`)                                                               | `encodeAsset(file)` → `EncodedAsset { dataUrl: 'data:<mediaType>;base64,...', mediaType, fontFormat, byteLength, kind }` then `formatCssUrl`/`formatFontSource` as needed. No `;charset=utf-8` by default — `mediaType` is canonical IANA without parameters |
| `encodeToDataUrlSync`                                                                                                                       | `encodeAssetSync` (rejects `detection: 'content' \| 'verify'` immediately; no `promise-synchronizer` blocking)                                                                                                                                               |
| `encodeToDataSrc(file)` → `url(data:...) format('...')` (returns array when passed array)                                                   | Split: `encodeAsset` never wraps in `url(...)`; use `formatFontSource(asset)` for `url(...) format(...)` — explicit, throws when `fontFormat` missing. `encodeAssets` for batch (deterministic, frozen array)                                                |
| `injectBase64(fonts, styles, { resave, fontTypes, cssTypes, fullpathMatch, validator })` → `true` \| `Array<{modified, filepath, content}>` | `inlineFiles({ assets, targets, write })` → `readonly InlineFileResult[]` always structured, `write: false` by default (dry-run), never returns `true`, never swallows success via `console.error`                                                           |
| `injectBase64Sync` (same but sync, allowed `promise-synchronizer` for async detector)                                                       | `inlineFilesSync` — honest sync (rejects async detection), no dynamic blocking                                                                                                                                                                               |
| `injectBase64.fromContent(fonts, content, { root })`                                                                                        | `createAssetCatalog(assets)` + `inlineCss(content, { catalog, documentPath: root ? path.join(root,'file.css') : undefined })`                                                                                                                                |
| `injectBase64Sync.fromBuffer(fonts, buffer)`                                                                                                | `encodeAsset({ data: buffer, filename, mediaType })` or include in catalog                                                                                                                                                                                   |
| `cssTypes: ['.css','.scss','.less']` (SCSS/Less parsed as plain CSS)                                                                        | No SCSS/Less — only plain CSS via `postcss` (`inlineCss` throws `ParseError` on unparseable CSS; SCSS/Less without real adapters are rejected)                                                                                                               |
| `fullpathMatch: false` default basename matching, `validator` callback for custom matching                                                  | Exact-path is default; `allowBasenameMatch: true` is opt-in and throws `AmbiguousAssetError` on duplicates. Validator replaced by narrow `resolver: (ResolverInput, catalog) => EncodedAsset \| undefined` (no parser AST)                                   |
| Returns parser objects / mutable counters                                                                                                   | Never exposes parser instances; results are frozen snapshots with `replacements` + `diagnostics`                                                                                                                                                             |

### From `base64-injector` → `@web-ts-toolkit/asset-inliner`

| Legacy (`base64-injector`)                                                                                               | Canonical                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encodeToDataUrl` → `data:...`                                                                                           | `encodeAsset` → `EncodedAsset` (same split from font case; no charset)                                                                                                                                                          |
| `encodeToDataSrc` → `url(data:...)` generic image helper                                                                 | `formatCssUrl(asset)`                                                                                                                                                                                                           |
| `encodeToFontDataSrc` / `encodeToFontDataSrcSync` → `url(data:...) format(...)`                                          | `formatFontSource(asset)` (explicit font)                                                                                                                                                                                       |
| `base64Injector.font` / `.image` scoped instances with attached methods                                                  | No attached methods / namespace objects — all operations are named exports; registries are immutable values passed via `definitions` or `createDefinitionRegistry`                                                              |
| `injectBase64(source, target, { sourceTypes, targetTypes, validator, resave })` → `{ n, nModified, contents }` or `true` | `inlineFiles({ assets, targets, write })` → `readonly InlineFileResult[]` with per-target `modified`/`written`/`replacements`/`diagnostics`; `sourceTypes`/`targetTypes` replaced by registry + `.css`/`.html`/`.htm` whitelist |
| `injectBase64.fromCSS(source, css)` → `{ modified, content, nFont, nImage }`                                             | `inlineCss(css, { catalog })` → `{ content, modified, replacements, diagnostics }`                                                                                                                                              |
| `injectBase64.fromHTML(source, html)` → same but only `background`/`background-image` + `<img src>`                      | `inlineHtml(html, { catalog })` covers `img[src]`, `img[srcset]`, `source[src\|srcset]`, icon `link[href]`, `video[poster]` with correct `srcset` handling (data-URL commas preserved) and full HTML target gating              |
| Default basename matching for all CSS/HTML URLs                                                                          | Exact matching by default; basename opt-in with `AmbiguousAssetError` instead of picking first duplicate                                                                                                                        |
| `injectBase64.fromCSS` / `fromHTML` allowed attached-method style, CJS `require`                                         | No `require`, no `default`, no attached methods — always `import { inlineCss } from '@web-ts-toolkit/asset-inliner'`                                                                                                            |
| `sourceTypes`/`targetTypes` including `.svg` in both registries with spread-order winner                                 | `.svg` defaults to `image/svg+xml` in `builtInDefinitions`; font SVG only via `svgFontDefinition`/`createSvgFontRegistry()` so no global ambiguity                                                                              |
| Fake `.scss`/`.less` paths                                                                                               | Rejected — plain CSS only                                                                                                                                                                                                       |

### Intentional breaking changes (both legacies)

- **No default export, no CJS, no IIFE.** Publish is ESM-only (`dist/index.mjs` + `dist/index.d.mts`, `"type": "module"` import-only `exports`). `require` is outside the contract.
- **No attached methods.** `injectBase64.fromCSS` / `.fromContent` / `.fromBuffer` style dispatch is gone — use explicit `inlineCss`/`inlineHtml`/`encodeAsset({data})`.
- **No implicit mutation.** `injectBase64` no longer mutates files by default or returns `true`. `inlineFiles` is dry-run by default and always returns structured results; `write: true` is opt-in and atomic with cleanup.
- **No parser objects in results.** Results are `{ content, modified, replacements, diagnostics }` frozen snapshots with location offsets, not live `postcss`/`parse5` instances.
- **No swallowed errors.** Broad `try/catch` + `console.error` → still-report-success is gone. Malformed CSS throws `ParseError`; per-URL issues emit `diagnostics` (`UNRESOLVED_REFERENCE`, `AMBIGUOUS_ASSET`, `INVALID_OPTIONS`, `UNSUPPORTED_KIND`); filesystem errors carry `cause`.
- **No default basename matching.** Exact normalized absolute path is default. `allowBasenameMatch: true` must be opted into and reports ambiguity as `AmbiguousAssetError`.
- **No default symlink following, no traversal escape, no duplicate winner by iteration order.** Deterministic lexical discovery with dedup, `followSymlinks: false`, `traversalRoot` containment, and cycle detection.
- **No fake SCSS/Less.** Inputs with `.scss`/`.less` are rejected for targets; a future syntax-specific adapter would require its own parser and tests.
- **No `promise-synchronizer`.** Sync APIs reject `content`/`verify` detection instead of blocking.
- **Data URL generation has no `;charset=utf-8`.** Output is RFC 2397 `data:<mediaType>;base64,<payload>` with canonical `mediaType` (`font/ttf`, `image/jpeg`, `image/vnd.microsoft.icon`, etc.); `charset` is not attached to binary fonts.
