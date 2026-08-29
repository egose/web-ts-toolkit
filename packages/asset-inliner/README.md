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
// targets handled: img[src], img[srcset], source[src|srcset], link[href] (icon), video[poster] where kind === 'image'
// srcset descriptors (1x, 2x, 100w) are preserved; commas inside existing data: URLs are not corrupted
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
import { createDefinitionRegistry, encodeAsset, createAssetCatalog } from '@web-ts-toolkit/asset-inliner';

const custom = { kind: 'audio' as const, extensions: ['.mp3'], mediaType: 'audio/mpeg' };
// explicit mediaType wins even for formats outside file-type
const tiny = await encodeAsset({ data: new Uint8Array([1, 2, 3]), mediaType: 'audio/mpeg', filename: 'ding.mp3' });

// build a catalog that includes custom definitions (immutable, no global mutation)
import { builtInDefinitions } from '@web-ts-toolkit/asset-inliner';
const registry = createDefinitionRegistry([...builtInDefinitions, custom]);
const catalog = await createAssetCatalog(['./assets'], { definitions: [...builtInDefinitions, custom] });
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

All numeric policies are validated (negative, zero, non-finite, fractional, or unreasonable → `InvalidOptionsError`).

| Policy          | Default         | Reasonable cap | Rationale                                                                                                         |
| --------------- | --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `maxAssetBytes` | 3 MiB (3145728) | 100 MiB        | Prevents accidental video/audio; allows large fonts/images; allocation checked before `Buffer.toString('base64')` |
| `maxTotalBytes` | 15 MiB          | 500 MiB        | Caps batch/catalog blow-up (~1.33× expansion + `data:` prefix)                                                    |
| `maxFiles`      | 10 000          | 100 000        | Traversal guard                                                                                                   |
| `maxDepth`      | 32              | 256            | Catches symlink cycles                                                                                            |
| `maxTargets`    | 500             | 5 000          | CSS/HTML entrypoints guard (`inlineFiles`)                                                                        |
| `concurrency`   | 16              | 64             | Saturates SSD without `EMFILE` thrashing                                                                          |

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

- CSS: every syntactically valid local `url(...)` in any declaration value (including `@font-face src` with comma-separated alternatives, backgrounds, masks, borders, cursors, `list-style-image`, generated content, custom properties `--*`, gradients, multiple URLs per decl). `format(...)` is added only for `kind === 'font' && fontFormat` inside `@font-face src` when no following `format(...)` exists. Existing `data:`/remote URLs are preserved.
- HTML: `img[src]` (legacy), `img[srcset]` + `source[srcset]` (descriptors `1x`/`2x`/`100w` preserved without corrupting commas in existing data URLs), `source[src]`, icon `link[href]` (`rel` contains `icon`), `video[poster]` where `kind === 'image'`. Gated by `(element, attribute, kind)` triple — `a[href]`, `form[action]`, `script[src]`, `link[rel=stylesheet][href]`, `iframe[src]`, `object[data]`, `embed[src]`, and audio/video `src` are not inlined by default.

## Matching and filesystem contract

- Catalog keys use normalized absolute paths (`path.resolve`). Basename-only fallback is opt-in (`allowBasenameMatch: true`); duplicates throw `AmbiguousAssetError` with frozen `candidates` — iteration order never picks a winner.
- References resolve relative to `documentPath` (file being transformed) or explicit `rootDir` for in-memory content. Absolute `/` URLs resolve relative to `rootDir`/`cwd`. Query `?...` and fragment `#...` are stripped for matching and never placed into filesystem paths; the replaced data URL does not retain them. Percent-encoding is decoded via `decodeURIComponent`; malformed or NUL-containing paths throw `InvalidOptionsError`.
- `data:`, `blob:`, protocol-relative `//`, fragment-only `#...`, and any scheme URL (`http:`, `mailto:`, etc.) are skipped before filesystem work.
- Discovery accepts one or many paths/roots, traverses in deterministic lexical order within each directory, retains caller order between roots, deduplicates by absolute identity, and respects `traversalRoot`, `followSymlinks: false` by default with cycle detection.
- `inlineCss` throws `ParseError` only when the stylesheet is unparseable; per-URL issues (unresolved, ambiguous, malformed percent) emit `diagnostics` and leave the `url(...)` unchanged. `inlineHtml` never throws on malformed markup or `<img>` without `src` (HTML spec recovery).

## Dry-run vs write

`inlineFiles` defaults to `write: false` (dry-run). `write: true` stages to a same-directory temp file (`.tmp.asset-inliner.<hex>.<basename>.tmp`), preserves file mode via `chmod`, calls `fsync` before `rename`, and removes the temp on failure.

- POSIX rename over an existing file is atomic when source and destination are on the same filesystem; cross-filesystem (`EXDEV`) surfaces as `FilesystemError` per target.
- Windows `EPERM`/`EBUSY` when the target is held open is not retried — it surfaces as per-target `FilesystemError`; callers may retry the whole call.
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
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `encodeToDataUrl(file)` → `string` (`data:font/...;charset=utf-8;base64,...`)                                                               | `encodeAsset(file)` → `EncodedAsset { dataUrl: 'data:<mediaType>;base64,...', mediaType, fontFormat, byteLength, kind }` then `formatCssUrl`/`formatFontSource` as needed. No `;charset=utf-8` by default — `mediaType` is canonical IANA without parameters |
| `encodeToDataUrlSync`                                                                                                                       | `encodeAssetSync` (rejects `detection: 'content'                                                                                                                                                                                                             | 'verify'`immediately; no`promise-synchronizer` blocking) |
| `encodeToDataSrc(file)` → `url(data:...) format('...')` (returns array when passed array)                                                   | Split: `encodeAsset` never wraps in `url(...)`; use `formatFontSource(asset)` for `url(...) format(...)` — explicit, throws when `fontFormat` missing. `encodeAssets` for batch (deterministic, frozen array)                                                |
| `injectBase64(fonts, styles, { resave, fontTypes, cssTypes, fullpathMatch, validator })` → `true` \| `Array<{modified, filepath, content}>` | `inlineFiles({ assets, targets, write })` → `readonly InlineFileResult[]` always structured, `write: false` by default (dry-run), never returns `true`, never swallows success via `console.error`                                                           |
| `injectBase64Sync` (same but sync, allowed `promise-synchronizer` for async detector)                                                       | `inlineFilesSync` — honest sync (rejects async detection), no dynamic blocking                                                                                                                                                                               |
| `injectBase64.fromContent(fonts, content, { root })`                                                                                        | `createAssetCatalog(assets)` + `inlineCss(content, { catalog, documentPath: root ? path.join(root,'file.css') : undefined })`                                                                                                                                |
| `injectBase64Sync.fromBuffer(fonts, buffer)`                                                                                                | `encodeAsset({ data: buffer, filename, mediaType })` or include in catalog                                                                                                                                                                                   |
| `cssTypes: ['.css','.scss','.less']` (SCSS/Less parsed as plain CSS)                                                                        | No SCSS/Less — only plain CSS via `postcss` (`inlineCss` throws `ParseError` on unparseable CSS; SCSS/Less without real adapters are rejected)                                                                                                               |
| `fullpathMatch: false` default basename matching, `validator` callback for custom matching                                                  | Exact-path is default; `allowBasenameMatch: true` is opt-in and throws `AmbiguousAssetError` on duplicates. Validator replaced by narrow `resolver: (ResolverInput, catalog) => EncodedAsset                                                                 | undefined` (no parser AST)                               |
| Returns parser objects / mutable counters                                                                                                   | Never exposes parser instances; results are frozen snapshots with `replacements` + `diagnostics`                                                                                                                                                             |

### From `base64-injector` → `@web-ts-toolkit/asset-inliner`

| Legacy (`base64-injector`)                                                                                               | Canonical                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `encodeToDataUrl` → `data:...`                                                                                           | `encodeAsset` → `EncodedAsset` (same split from font case; no charset)                                                                                                                                                          |
| `encodeToDataSrc` → `url(data:...)` generic image helper                                                                 | `formatCssUrl(asset)`                                                                                                                                                                                                           |
| `encodeToFontDataSrc` / `encodeToFontDataSrcSync` → `url(data:...) format(...)`                                          | `formatFontSource(asset)` (explicit font)                                                                                                                                                                                       |
| `base64Injector.font` / `.image` scoped instances with attached methods                                                  | No attached methods / namespace objects — all operations are named exports; registries are immutable values passed via `definitions` or `createDefinitionRegistry`                                                              |
| `injectBase64(source, target, { sourceTypes, targetTypes, validator, resave })` → `{ n, nModified, contents }` or `true` | `inlineFiles({ assets, targets, write })` → `readonly InlineFileResult[]` with per-target `modified`/`written`/`replacements`/`diagnostics`; `sourceTypes`/`targetTypes` replaced by registry + `.css`/`.html`/`.htm` whitelist |
| `injectBase64.fromCSS(source, css)` → `{ modified, content, nFont, nImage }`                                             | `inlineCss(css, { catalog })` → `{ content, modified, replacements, diagnostics }`                                                                                                                                              |
| `injectBase64.fromHTML(source, html)` → same but only `background`/`background-image` + `<img src>`                      | `inlineHtml(html, { catalog })` covers `img[src]`, `img[srcset]`, `source[src                                                                                                                                                   | srcset]`, icon `link[href]`, `video[poster]`with correct`srcset` handling (data-URL commas preserved) and full HTML target gating |
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
