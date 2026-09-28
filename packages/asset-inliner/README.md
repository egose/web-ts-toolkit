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
  inlineFilesSync,
} from '@web-ts-toolkit/asset-inliner';
```

## Quick examples

Each block below (and the custom resolver block later) is a standalone runnable
TypeScript ESM module with complete imports. Save one as `example.mts` in your
own project after installing the package. For example, with TypeScript and
`@types/node` installed:

```sh
npx tsc example.mts --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck false --outDir example-dist
node example-dist/example.mjs
```

The examples use in-memory bytes; the disk example creates and removes its own
temporary assets. No repository fixtures are shipped or required. Tiny byte
samples demonstrate extension-based encoding, not image/font validity. Blocks
elsewhere labeled **illustrative fragment** require the indicated application inputs.

### Encode bytes (async and sync)

<!-- runnable: encode -->

```ts
import { encodeAsset, encodeAssetSync } from '@web-ts-toolkit/asset-inliner';

const bytes = new Uint8Array([137, 80, 78, 71]);
const asset = await encodeAsset({ data: bytes, filename: 'logo.png' });
console.log(asset.mediaType); // 'image/png'
console.log(asset.dataUrl); // 'data:image/png;base64,...'

// Sync uses deterministic extension lookup too; no I/O for byte inputs.
const syncAsset = encodeAssetSync({ data: bytes, filename: 'logo.png' });
console.log(syncAsset.dataUrl === asset.dataUrl); // true
```

### Format for CSS

<!-- runnable: format -->

```ts
import { encodeAsset, formatCssUrl, formatFontSource } from '@web-ts-toolkit/asset-inliner';

const png = await encodeAsset({ data: new Uint8Array([1, 2, 3]), filename: 'logo.png' });
console.log(formatCssUrl(png)); // url(data:image/png;base64,...)

const woff2 = await encodeAsset({ data: new Uint8Array([4, 5, 6]), filename: 'app.woff2' });
console.log(formatFontSource(woff2)); // url(data:font/woff2;base64,...) format('woff2')
// formatFontSource throws InvalidOptionsError when fontFormat is missing
```

### Inline CSS (pure, synchronous over a catalog)

<!-- runnable: css -->

```ts
import { createAssetCatalog, inlineCss } from '@web-ts-toolkit/asset-inliner';

const catalog = await createAssetCatalog([
  { data: new Uint8Array([1, 2, 3]), filename: 'apple.png' },
  { data: new Uint8Array([4, 5, 6]), filename: 'app.woff2' },
]);
const css = `
  .hero { background: url("apple.png"); }
  @font-face { font-family: 'App'; src: url('app.woff2'); }
`;
// Byte inputs have filenames, not filesystem source paths. Opt into unique
// basename matching; duplicate filenames report ambiguity instead of guessing.
const result = inlineCss(css, { catalog, allowBasenameMatch: true });

console.log(result.modified, result.replacements.length); // true, 2
console.log(result.content); // image and font data URLs; font gets format('woff2')
```

### Inline HTML (pure, synchronous)

<!-- runnable: html -->

```ts
import { createAssetCatalog, inlineHtml } from '@web-ts-toolkit/asset-inliner';

const catalog = await createAssetCatalog([
  { data: new Uint8Array([1]), filename: 'apple.png' },
  { data: new Uint8Array([2]), filename: 'pear.png' },
]);
const html = `<img src="apple.png" alt="apple"><link rel="icon" href="pear.png">`;
const out = inlineHtml(html, { catalog, allowBasenameMatch: true });
console.log(out.modified, out.replacements.length); // true, 2
// Targets handled: img[src], img[srcset], source[src|srcset], icon link[href]
// (explicit allowlist), video[poster] where kind === 'image'. Unchanged content
// is returned byte-for-byte. HTML parser recovery accepts malformed markup,
// but resource limits and invalid options/resolver results can still throw.
```

### Process files on disk (dry-run vs write)

<!-- runnable: files -->

```ts
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inlineFiles, inlineFilesSync } from '@web-ts-toolkit/asset-inliner';

const dir = await mkdtemp(join(tmpdir(), 'asset-inliner-example-'));
try {
  const image = join(dir, 'apple.png');
  const target = join(dir, 'app.css');
  const css = '.hero { background: url("apple.png"); }';
  await writeFile(image, new Uint8Array([1, 2, 3]));
  await writeFile(target, css);

  // Real file paths use exact-path matching by default.
  const options = { assets: [image], targets: [target] };
  const dry = await inlineFiles(options);
  const drySync = inlineFilesSync(options);
  assert.equal(dry[0]?.modified, true);
  assert.equal(dry[0]?.written, false);
  assert.deepEqual(drySync, dry);
  assert.equal(await readFile(target, 'utf8'), css);

  // Opt-in write: same-directory temp + rename, mode preserved.
  const written = await inlineFiles({ ...options, write: true });
  assert.equal(written[0]?.written, true);
  assert.equal(await readFile(target, 'utf8'), written[0]?.content);
  console.log(written[0]?.replacements.length); // 1
} finally {
  await rm(dir, { recursive: true, force: true });
}
```

### Custom asset kind without changing encoder

<!-- runnable: custom-kind -->

```ts
import {
  builtInDefinitions,
  createAssetCatalog,
  createDefinitionRegistry,
  inlineCss,
} from '@web-ts-toolkit/asset-inliner';
import type { AssetTypeDefinition } from '@web-ts-toolkit/asset-inliner';

const custom = {
  kind: 'audio' as const,
  extensions: ['.mp3'],
  mediaType: 'audio/mpeg',
} satisfies AssetTypeDefinition;
// build a catalog that includes custom definitions (immutable, no global mutation)
const registry = createDefinitionRegistry([...builtInDefinitions, custom]);
// reuse already-validated registry without re-normalizing definitions
const catalog = await createAssetCatalog([{ data: new Uint8Array([1, 2, 3]), filename: 'ding.mp3' }], {
  registry,
  allowedKinds: ['audio'],
});

// A CSS custom property can carry a custom asset kind; HTML image targets
// remain image-only. This encodes bytes; it does not validate an MP3 stream.
const css = `:root { --notification: url("ding.mp3"); }`;
const result = inlineCss(css, {
  catalog,
  allowBasenameMatch: true,
});
console.log(result.content); // :root { --notification: url(data:audio/mpeg;base64,AQID); }
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

Detection: `defaultDetector`, `resolveByExtension`, `resolveWithDetector`.

Policy: `DEFAULT_MAX_*`, `MAX_REASONABLE_MAX_*`, `DEFAULT_POLICY`, `validatePolicyValue`, `validatePolicyOptions`, `normalizePolicy`.

Note: `DiscoverOptions` (`discovery.ts`) extends the base `DiscoveryOptions` (`types.ts`) with `definitions`/`registry` inputs.

Errors: `AssetInlinerError` + `UnsupportedAssetError`, `AmbiguousDefinitionError`, `InvalidOptionsError`, `DetectionMismatchError`, `AmbiguousAssetError`, `ResourceLimitError`, `ParseError`, `FilesystemError` (all with stable `code`).

## Detection modes

- `extension` (default): deterministic registry lookup from filename extension. Supports text formats like SVG, available to async and sync.
- `content`: async-only `file-type` signature detection (bounded to 4100 bytes). Useful when filename is absent. Throws `UnsupportedAssetError` if detected type not in allowed registry.
- `verify`: async-only comparison of detected binary metadata with expected (explicit or extension). Throws `DetectionMismatchError` on mismatch; no detection for text formats like SVG falls back to expected.

**Illustrative fragment** — import the encoder functions as above and supply your own files:

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
| `maxSyntaxDepth`  | 256               | 512            | Bounds HTML element and CSS delimiter nesting, including opt-in embedded CSS; independent of directory `maxDepth`, checked even without references                                                                                                                                                                                        |
| `maxReplacements` | 1000              | 100 000        | Caps replacements per target to prevent one 3 MiB data URL repeated thousands of times allocating gigabytes; enforced before each insertion with safe-integer arithmetic                                                                                                                                                                  |
| `maxOutputBytes`  | 20 MiB (20971520) | 100 MiB        | Caps projected transformed output (original + sum replacement deltas, including HTML quotes/escaping and CSS font hints); checked before insertion and again on changed output after assembly/fallback serialization, safe-integer, no truncated return                                                                                   |
| `maxFiles`        | 10 000            | 100 000        | Traversal guard                                                                                                                                                                                                                                                                                                                           |
| `maxDepth`        | 32                | 256            | Bounds directory nesting; followed symlinks also have separate cycle detection                                                                                                                                                                                                                                                            |
| `maxTargets`      | 500               | 5 000          | CSS/HTML entrypoints guard (`inlineFiles`)                                                                                                                                                                                                                                                                                                |
| `concurrency`     | 16                | 64             | Bounds parallel catalog encoding and target writes; discovery traversal itself is serial and deterministic                                                                                                                                                                                                                                |
| `maxInlineBytes`  | — (no default)    | 100 MiB        | Selective inlining threshold — assets whose `byteLength` exceeds this value are left as external references with a structured `INLINE_SKIPPED` diagnostic (`warn`, not error); distinct from hard `maxAssetBytes`/`maxTotalBytes` which remain fail-closed; also available as synchronous `shouldInline(asset, url) => boolean` predicate |

Defaults are **effective even when an option is omitted**: batch encoders and catalogs reject once cumulative input bytes exceed the effective `maxTotalBytes` (default 15 MiB), and path inputs are rejected once file size exceeds the effective `maxAssetBytes` (default 3 MiB). For path inputs the file's metadata is inspected first so an oversized regular file is rejected **before** its contents are read. This is a metadata preflight only, not a strict allocation bound: a file that grows between inspection and read still allocates its grown body before the post-read check rejects it, and non-regular inputs skip the preflight. Async reads receive the `AbortSignal`. Target input bytes are checked before parser invocation in both pure transforms (`inlineCss`/`inlineHtml` throw `ResourceLimitError`) and file orchestration (`inlineFiles` per-target `RESOURCE_LIMIT` diagnostic, no write); oversized-target rejections return `content: ''` with `written: false` and never load the rejected body just to fill the result. Repeated references are bounded per replacement via `maxReplacements` and `maxOutputBytes` projection (`originalBytes + sum delta`) with safe-integer arithmetic before insertion — exact-boundary inputs still succeed and transforms are never silently truncated. Selective inlining (`maxInlineBytes` / `shouldInline`) is evaluated **after** catalog lookup and **before** replacement accounting, leaving oversized or predicate-rejected assets as external references with an `INLINE_SKIPPED` (`warn`) diagnostic; hard limits remain fail-closed and cannot be downgraded by selection policy.

Changed contracts from recent fixes (also reflected in `dist/index.d.mts` JSDoc):

- HTML source patches are assembled in one pass over the original source after sorting/validation, including srcset spans. Output bytes, locations, unchanged-source identity, overlap/invalid-patch serialization fallback, and all limits retain the same contracts; this reduces repeated expanded-output copying without raising limits.
- `inlineHtml`, `inlineCss`, `inlineFiles`, and `inlineFilesSync` now enforce **`maxSyntaxDepth`**, default **256**, maximum **512**, independently of filesystem `maxDepth`. `DEFAULT_MAX_SYNTAX_DEPTH`, `MAX_REASONABLE_MAX_SYNTAX_DEPTH`, `DEFAULT_POLICY`, and `normalizePolicy` expose the same policy. Excess throws `ResourceLimitError` in pure transforms; file transforms report a per-target `RESOURCE_LIMIT` with `content: ''`, no replacements/write, preserve the original file on disk, and continue processing other targets. This applies even when no assets would be replaced. HTML counts element ancestors **including the element itself**, implied elements (`html`, `head`, `body`), and template content; document/fragment roots, text and comments add zero. Insertion-time checks bound parser recovery too, and an iterative final-tree check protects traversal/full-tree serialization. Thus a fragment with 256 nested divs is at the default limit; a document's `html`/`body` ancestors also consume depth. CSS uses a conservative lexical bound: simultaneously open unescaped `{`, `(` and `[` delimiters outside quoted strings and comments count together, including block/function nesting, selectors, custom properties and malformed/unclosed groups; only matching closing delimiters reduce depth. For example, `a{background:url(a.png)}` has depth 2. The bound runs before parsing and no-reference fast paths, with parser-tree checks before walking/stringifying. With `inlineEmbeddedCss: true`, each style chunk starts its own CSS depth at zero (not added to HTML depth), including entity-decoded style attributes, raw-source decoder fallback, missing source locations and inert template content. `<style>` text remains raw text; with embedded CSS disabled its CSS syntax is not inspected. Quotes/comments/escaped delimiters do not falsely consume CSS depth. Exact boundaries remain accepted; no truncation or stack-error recovery is used.
- HTML now determines the first applicable `<base href>` **before** transforming any references. This applies to simple attributes, img/source srcset, opt-in style attributes/elements, and async/sync file APIs. Relative and root-relative bases select the mapped local directory instead of the physical document directory; same-name assets in the latter no longer win accidentally. Remote/protocol-relative or unmappable bases preserve local-looking references (including `/root-relative` ones) with a warning `HTML_BASE_UNMAPPABLE` per supported reference, before catalog lookup, basename fallback, or custom resolver calls. Existing remote/data/blob/fragment-only reference skips remain unchanged. No fetching or base rewriting occurs. See the matching contract below for precedence, mapping, and resolver context.
- `img[srcset]` / `source[srcset]` now tokenize complete entity-decoded URL candidates using HTML URL/descriptor states. Interior commas belong to **all** URLs: `apple,pear.png 1x` resolves the whole filename, and `https://example.test/a,apple.png 1x` stays untouched without resolving a local suffix. Trailing URL commas delimit descriptorless candidates; repeated separators are preserved. Only ASCII whitespace separates URLs from descriptors. Valid descriptors (nonnegative finite `x`, positive integer `w`, and HTML's future-compatible positive `h` paired with `w`) are preserved; duplicate/conflicting/unknown descriptors and malformed parenthesized descriptors leave that candidate untouched without resolver calls or asset diagnostics. This corrects earlier comma-splitting assumptions: `a.png,b.png` is **one URL**, while `a.png, b.png` and `a.png 1x,b.png 2x` are two candidates. Missing separators such as `a.png 1x b.png 2x` are not repaired. Source patches preserve descriptors, separators, remote/data URLs, and unrelated entity spelling; replacements report original URL source offsets, including decoded commas/whitespace, CRLF, and named-reference decoder fallback. Full-tree serialization may normalize markup/whitespace; missing source locations are reported as offset `-1` rather than guessed. Pure and async/sync file transforms share this contract.
- With `inlineEmbeddedCss: true`, rewritten `style` attributes preserve their attribute boundaries and CSS suffixes: originally unquoted values gain double quotes, and values are escaped for the output quote context. This also applies to the raw-source fallback when the source-map decoder disagrees with the HTML parser; existing entity references are decoded only once. Added quotes and escaping expansion count toward `maxOutputBytes` in pure, async-file, and sync-file transforms; a file that exceeds the limit is not written. `<style>` elements retain HTML raw-text semantics (no HTML-entity decoding).
- `maxFiles` is one catalog-wide budget across all roots; overlapping roots, duplicates, and canonical aliases are deduplicated, not double-counted. In-memory byte (`{ data }`) inputs sit outside the file-only `maxFiles` policy and remain bounded by `maxAssetBytes`/`maxTotalBytes`.
- Resolver and catalog data URLs must match `data:<type>/<subtype>;base64,<strict-base64>` — values with charset/parameters, fragments, or delimiter-bearing payloads are rejected with `INVALID_OPTIONS` before any mutation, including standalone `formatCssUrl`/`formatFontSource` calls and caller-supplied catalogs. Encoded bytes stay opaque (no SVG sanitization).
- Detector alias: `image/x-icon` normalizes to canonical `image/vnd.microsoft.icon` for content/verify checks (explicit caller `mediaType` is never aliased; genuine mismatches still reject). Media types with URL-significant punctuation are rejected with `INVALID_OPTIONS` instead of emitting fragment-bearing URLs.
- Font hints are CSS-escaped (quotes, backslashes, line breaks) on both the automatic `@font-face` path and `formatFontSource`; ordinary hints are byte-identical.

Override per-operation (**illustrative fragment**, using your own files and the imports above):

```ts
await encodeAsset('./assets/large.woff2', { maxAssetBytes: 5 * 1024 * 1024 });
await inlineFiles({ assets: ['./assets'], targets: ['./styles'], maxTargets: 1000, concurrency: 8 });
```

## Supported built-ins

**Fonts:** `.ttf` → `font/ttf` (`truetype`), `.otf` → `font/otf` (`opentype`), `.eot` → `application/vnd.ms-fontobject` (`embedded-opentype`), `.sfnt` → `font/sfnt` (`sfnt`), `.woff` → `font/woff` (`woff`), `.woff2` → `font/woff2` (`woff2`), `.ttc` → `font/collection` (`collection`). SVG font (`image/svg+xml`, `svg`) is available only via `svgFontDefinition` / `createSvgFontRegistry()` to avoid global `.svg` ambiguity; default `.svg` is image.

**Images:** `.apng` `image/apng`, `.bmp` `image/bmp`, `.gif` `image/gif`, `.ico`/`.cur` `image/vnd.microsoft.icon`, `.jpg`/`.jpeg`/`.jfif`/`.pjpeg`/`.pjp` `image/jpeg`, `.png` `image/png`, `.svg` `image/svg+xml`, `.tif`/`.tiff` `image/tiff`, `.webp` `image/webp`, `.avif` `image/avif`.

Extensions are normalized case-insensitively with leading dot; duplicates are rejected at registry construction.

**Audio/video:** No built-in definitions. Tiny audio/video can be inlined via custom `AssetTypeDefinition` and `allowedKinds` (see the runnable custom-kind example above). WebVTT, WASM, PDF, archives, office/executable/script/stylesheet/`application/*` remain out-of-scope as default inline targets by design.

**Target syntax:**

- CSS: every syntactically valid local `url(...)` in any declaration value (backgrounds, masks, borders, cursors, `list-style-image`, generated content, custom properties `--*`, gradients, comma-separated `@font-face src` alternatives, `image-set()` and other nested functions; any function-name casing). `format(...)` is added only for `kind === 'font' && fontFormat` inside `@font-face src` when no following `format(...)` exists. URL token values are CSS-unescaped before classification while the original spelling is kept for diagnostics and replacement records; entity-encoded HTML attribute values resolve in decoded space with source-mapped replacement ranges. Existing `data:`/remote URLs are preserved; malformed values produce a controlled `INVALID_OPTIONS` diagnostic and no partial mutation.
- HTML: `img[src]`, `img[srcset]` + `source[srcset]` (valid descriptors preserved, interior commas in all URL schemes handled atomically; see changed-contract notes above), `source[src]`, icon `link[href]` (explicit allowlist: `icon`, `apple-touch-icon`, `apple-touch-icon-precomposed`, `mask-icon`, `fluid-icon`, and `shortcut` + `icon` — `iconic`/`nonicon` untouched), `video[poster]` where `kind === 'image'`. Other elements/attributes (`a[href]`, `script[src]`, stylesheet links, …) are not inlined. Replacements patch targeted attribute ranges so unrelated markup stays byte-identical (fallback to full serialization if a patch is invalid); `location` identifies the URL token, not the attribute start. Opt-in `inlineEmbeddedCss: true` processes `<style>` text and `style` attributes with `inlineCss` semantics and shared limits; within resource limits, malformed chunks yield a `PARSE_ERROR` diagnostic and are left unchanged. JS templates, shadow DOM, and runtime fetching are explicitly out of scope.

## Matching and filesystem contract

Resolver URL text is the value passed to resolution, not necessarily literal source text: transforms normally decode HTML entities/CSS escapes first. The existing style decoder-disagreement fallback retains raw HTML entities; standalone resolver utilities use their caller's input. Source locations and replacement records retain their existing contracts.

- Catalog keys use normalized absolute paths (`path.resolve`). Basename-only fallback is opt-in (`allowBasenameMatch: true`); duplicates throw `AmbiguousAssetError` with frozen `candidates` — iteration order never picks a winner.
- References resolve relative to `documentPath` (file being transformed) or explicit `rootDir` for in-memory content. Absolute `/` URLs resolve relative to `rootDir`/`cwd`. Query `?...` and fragment `#...` are stripped for matching and never placed into filesystem paths; the replaced data URL does not retain them. Percent-encoding is decoded via `decodeURIComponent`; malformed or NUL-containing paths throw `InvalidOptionsError`.
- **HTML base mapping:** select the first HTML-namespace base with an `href` in parsed tree order, including a base appearing after asset references. Bases without `href`, foreign-namespace bases, and bases in inert template content do not participate. Later bases never override the first. An empty/whitespace-only, query-only, or fragment-only href uses the document fallback directory. As in HTML, `data:`/`javascript:` base hrefs use fallback but still prevent later bases from winning. parse5 decodes href entities once; URL edge C0/space trimming and ASCII tab/newline removal precede mapping. Relative bases anchor at the physical document directory (or `rootDir`/cwd); `/` bases anchor at `rootDir`/cwd. A trailing slash or final `.`/`..` denotes a directory; otherwise the last segment denotes a document. Query/fragment stripping, one percent decode, and path normalization follow the existing filesystem contract (including slash/backslash normalization). Root-relative **asset** URLs continue to use `rootDir`/cwd under local bases. No-base behavior is unchanged.
- **Base limitations and identity:** absolute schemes such as `file:`/`blob:`/custom schemes are not mapped to local files, and malformed/NUL percent-encoded bases are unmappable. These and remote/protocol-relative bases leave local-looking references unchanged with `HTML_BASE_UNMAPPABLE`; no browser origin, CSP, or runtime DOM mutations are inferred. This is filesystem mapping, not a browser URL/fetch implementation. For based HTML, diagnostic `filePath` remains the actual containing `documentPath` (absent for in-memory content); attempted asset paths remain in resolution messages and replacement `resolvedPath`. Custom hooks keep the actual `documentPath`, original parsed reference (HTML entities/CSS escapes decoded), and reference-relative `decodedPath`; the new optional `resolutionBaseDir` supplies the absolute effective directory separately, also for embedded CSS. It is absent without an HTML base. A root-relative `decodedPath` still anchors at `rootDir`/cwd, not `resolutionBaseDir`.
- `data:`, `blob:`, protocol-relative `//`, fragment-only `#...`, and any scheme URL (`http:`, `mailto:`, etc.) are skipped before filesystem work.
- Discovery accepts one or many paths/roots and traverses in one deterministic order: **lexical depth-first entry order** — each sorted directory entry (and, for directories, its entire subtree) is processed before the next sibling entry. Caller order is retained between roots.
- Containment is **canonical**: `traversalRoot` and every accepted file/directory are canonicalized with `realpath` before comparison, so a regular file reached through a symlinked ancestor resolves outside the root and is rejected with `FilesystemError` — even when the final path component is not a symlink. Escaping the root is possible only via the explicit `allowTraversalEscape: true` option. `followSymlinks: false` (default) never follows a symlink directory entry; with cycle detection when `followSymlinks: true`.
- Aliases are deduplicated by canonical identity (`realpath`); the first-seen logical (lexical) path is reported and used for diagnostics. Traversal is serial, so result order never depends on parallel completion; the `concurrency` option is validated for API compatibility but does **not** accelerate discovery (it bounds catalog encoding and target writes).
- Residual risk: containment is validated at discovery time. A path component can still be swapped (e.g. a directory replaced by a symlink) between discovery and a later read or write; closing that TOCTOU window would require descriptor-relative (`openat`-style) traversal, which this package does not implement.
- `inlineCss` throws `ParseError` when the stylesheet is unparseable; per-URL issues (unresolved, ambiguous, malformed percent or malformed CSS escapes, NUL) emit `diagnostics` and leave the `url(...)` unchanged (no partial mutation). Replacement `location` for CSS is the URL token offset (`offset` 0-based, `line` 1-based, `column` 1-based) derived from declaration-local parser indexes. `inlineHtml` uses HTML-spec recovery for malformed markup and accepts `<img>` without `src`. This is not a no-throw guarantee: byte/count/syntax limits throw `ResourceLimitError` even on malformed input, and invalid options or resolver results can throw `InvalidOptionsError`.

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

<!-- runnable: resolver -->

```ts
import {
  builtInDefinitions,
  createAssetCatalog,
  createDefinitionRegistry,
  inlineCss,
} from '@web-ts-toolkit/asset-inliner';

const registry = createDefinitionRegistry([
  ...builtInDefinitions,
  { kind: 'image', extensions: ['.jxl'], mediaType: 'image/jxl' },
]);

const catalog = await createAssetCatalog([{ data: new Uint8Array([1, 2, 3]), filename: 'alias.jxl' }], { registry });
const css = '.hero { background: url("legacy.png"); }';
let aliasHits = 0;

// narrow custom matcher — no parser AST knowledge required
const result = inlineCss(css, {
  catalog,
  resolver: (input, catalog) => {
    // ResolverInput also supplies optional documentPath, rootDir, resolutionBaseDir.
    if (input.basename === 'legacy.png') {
      aliasHits++;
      return catalog.getByBasename('alias.jxl');
    }
    return undefined; // fall back to default exact/basename matching
  },
});
console.log(aliasHits, result.replacements.length); // 1, 1 — alias branch actually ran
console.log(result.content); // .hero { background: url(data:image/jxl;base64,AQID); }
```

The hook is invoked only for local URLs that passed `data:`/`blob:`/remote/fragment skipping and decoded without error. In sync mode, async resolvers throw `InvalidOptionsError`.

## Errors

All errors extend `AssetInlinerError` and carry a stable `code`:

- `UNSUPPORTED_ASSET` (`UnsupportedAssetError`) — extension/media not in registry; fields `extension`, `mediaType`, `path`
- `AMBIGUOUS_DEFINITION` (`AmbiguousDefinitionError`) — duplicate extension at registry construction; `extension`, `conflictingMediaTypes` (frozen)
- `INVALID_OPTIONS` (`InvalidOptionsError`) — malformed detection mode, NUL/malformed percent, negative/zero/non-finite/fractional/unreasonable limits, unsafe data URLs (charset/params/fragments/delimiters), URL-significant media types
- `DETECTION_MISMATCH` (`DetectionMismatchError`) — `verify` mode detected different `mediaType`; `expectedMediaType`, `detectedMediaType`
- `AMBIGUOUS_ASSET` (`AmbiguousAssetError`) — basename mode duplicate; `basename`, `candidates` (frozen)
- `RESOURCE_LIMIT` (`ResourceLimitError`) — `limit`/`actual`/`path` for byte/count/depth/target/concurrency
- `PARSE_ERROR` (`ParseError`) — CSS unparseable (HTML uses per-target diagnostics)
- `FILESYSTEM_ERROR` (`FilesystemError`) — missing path, permission, or failed atomic write; `path`, `operation`, `cause` preserved

Raw asset bytes are never included in messages; `candidates`/`conflictingMediaTypes` are frozen snapshots.

**Illustrative fragment** — replace the file path with your own asset:

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
