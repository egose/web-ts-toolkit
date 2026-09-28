---
sidebar_label: Asset Inliner
sidebar_position: 23
---

# `@web-ts-toolkit/asset-inliner`

Generic ESM-only asset inliner for CSS and HTML — Base64 data URL encoding, CSS `url()` / font `format()` formatting, deterministic catalog and file pipeline. Node `>=22`, named imports only.

> This page mirrors the installed package `README.md` (the authoritative consumer guide). The shipped declarations under `dist/index.d.mts` plus `README.md` are the primary installed-consumer docs; website docs are secondary.

## Install

```sh
pnpm add @web-ts-toolkit/asset-inliner
```

ESM only with import-only export map (`dist/index.mjs` + `dist/index.d.mts`). `require()` is not supported. See package `README.md` for the full quickstart, detection modes, limits, supported built-ins, custom definitions, resolver hook, and error reference.

## Shortest examples

```ts
import { encodeAsset, formatCssUrl } from '@web-ts-toolkit/asset-inliner';
const asset = await encodeAsset({ data: new Uint8Array([1, 2, 3]), filename: 'apple.png' });
formatCssUrl(asset); // url(data:image/png;base64,...)
```

```ts
import { createAssetCatalog, inlineCss } from '@web-ts-toolkit/asset-inliner';
const catalog = await createAssetCatalog([{ data: new Uint8Array([1, 2, 3]), filename: 'apple.png' }]);
const result = inlineCss('.hero { background: url("apple.png") }', {
  catalog,
  allowBasenameMatch: true, // byte inputs have filenames, not filesystem source paths
});
console.log(result.modified, result.replacements.length); // true, 1
```

These in-memory blocks are standalone TypeScript ESM examples. Tiny bytes show
extension-based encoding, not image validity. The shipped README includes the
NodeNext compile/run command and a self-cleaning runnable disk example.

**Illustrative fragment** — supply your own asset and stylesheet directories:

```ts
import { inlineFiles } from '@web-ts-toolkit/asset-inliner';
await inlineFiles({ assets: ['./assets'], targets: ['./styles'] }); // dry-run; add write:true to persist
```

## Notes

- **Registry reuse:** pass an already-validated `AssetDefinitionRegistry` via `{ registry }` to `createAssetCatalog`, `discoverAssets`, or `encodeAsset` to avoid re-normalizing `definitions`.
- **Literal unions:** `AssetInlinerErrorCode` (`'RESOURCE_LIMIT'` etc.) and `DiagnosticCode` (`'UNRESOLVED_REFERENCE'` etc.) narrow in consumers; subclasses like `ResourceLimitError` carry `code: 'RESOURCE_LIMIT' as const`.
- **sourcePath:** `EncodedAsset.sourcePath` is a normalized absolute path (`path.resolve`) when input was a file path.
- **Definition shape:** `AssetTypeDefinition` is a discriminated union — `fontFormat` only allowed when `kind === 'font'` (checked at type and runtime).
- **Changed HTML:** `inlineHtml` prefers source-location patches of the targeted attribute value ranges so unrelated markup stays byte-identical; if a patch is invalid/overlapping it falls back to full serialization (may normalize). Validated patches (including srcset spans) now assemble from original-source slices with one join, reducing expanded-output copying without changing bytes, locations or limits. HTML-spec recovery accepts malformed markup, but resource limits and invalid options/resolver results can still throw.
- **Changed syntax bound:** pure and async/sync file transforms enforce `maxSyntaxDepth` (default **256**, maximum **512**), independent of filesystem `maxDepth`, even without references. HTML counts parsed element ancestors including the element, implied `html`/`head`/`body`, and template content; document/fragment roots, text and comments add zero. Iterative insertion checks protect parser recovery; completed-tree checks protect walking and fallback serialization. CSS conservatively counts simultaneously open unescaped `{`, `(` and `[` outside strings/comments, including blocks, functions, selectors, custom properties and malformed/unclosed groups; only matching closers reduce depth. Checks run before parsing/fast paths and before parser-tree walking/stringifying. `a{background:url(a.png)}` has depth 2. Opt-in embedded CSS starts at zero per chunk, including decoded attributes, raw-source fallback, missing locations and inert templates; its depth is not added to HTML depth. Disabled embedded CSS is not syntax-checked. Exact boundaries succeed; excess throws `ResourceLimitError` in pure APIs and yields per-target `RESOURCE_LIMIT` with `content: ''`, no replacements/write in file APIs, preserving original files on disk while other targets continue. `DEFAULT_MAX_SYNTAX_DEPTH`, `MAX_REASONABLE_MAX_SYNTAX_DEPTH`, `DEFAULT_POLICY`, `normalizePolicy`, and public option JSDoc share this policy.
- **Changed srcset:** `img`/`source` candidates use complete decoded URL tokens: interior commas belong to local, remote, and data URLs alike. `a.png,b.png` is one URL; `a.png, b.png` and `a.png 1x,b.png 2x` are two candidates. Trailing/repeated separators and valid descriptors (nonnegative finite `x`, positive integer `w`, future-compatible positive `h` paired with `w`) are preserved. Malformed/duplicate/conflicting descriptors stay untouched without resolver calls or asset diagnostics; missing separators are not repaired. Source patches retain remote/data URLs and unrelated entity spelling, and map decoded commas/ASCII whitespace, CRLF, and named references back to original URL offsets. Full-tree fallback may normalize markup/whitespace; absent source locations report offset `-1`. Pure and async/sync file transforms use the same rules.
- **Embedded CSS:** `inlineEmbeddedCss: true` (opt-in, default `false`) inlines local `url(...)` inside `<style>` elements and `style` attributes using the same CSS semantics as `inlineCss`, with shared limits, source-offset location mapping, and a `PARSE_ERROR` diagnostic (no corruption) for malformed chunks within resource limits. Limits remain fail-closed, including on malformed input.
- **Resolver URL text:** transforms normally pass HTML-entity/CSS-escape-decoded URLs; the existing style decoder-disagreement fallback retains raw HTML entities. Standalone resolution utilities pass caller input. Source-location contracts are unchanged.
- **Changed HTML base contract:** before transforming, select the first HTML-namespace `<base href>` in parsed tree order, including one after references. Missing href and inert template/foreign-namespace bases do not participate; later bases never override it. Empty/whitespace-only, query-only, and fragment-only hrefs select the document fallback; HTML-disallowed `data:`/`javascript:` bases also use fallback and block later bases. Href entities decode once, with URL edge C0/space trimming and tab/newline removal. Relative bases map from the physical document directory (or `rootDir`/cwd); `/` bases use `rootDir`/cwd. Trailing slash or final dot segments denote directories, otherwise the last segment denotes a document. Existing query/fragment stripping, single percent decoding, and slash/backslash normalization apply. Simple attributes, img/source srcset, opt-in embedded CSS, and async/sync file APIs share this behavior. Root-relative asset URLs still use `rootDir`/cwd under a local base.
- **Base limitations and resolver identity:** remote/protocol-relative and unmappable bases (including `file:`, `blob:`, custom schemes, malformed/NUL percent encodings) preserve local-looking references, including root-relative ones, with per-reference `HTML_BASE_UNMAPPABLE` warnings and no catalog/basename/resolver calls. Ordinary remote/data/fragment skips are unchanged. No fetching, base rewriting, browser-origin/CSP inference, or runtime DOM handling is added. Based-HTML diagnostics retain the actual containing `documentPath`; attempted asset paths remain in messages/replacement metadata. Hooks retain actual `documentPath` and reference-relative `decodedPath`, with optional `resolutionBaseDir` exposing the effective absolute directory separately (also in embedded CSS); original URLs are parsed/entity- or CSS-escape-decoded text. No-base behavior is unchanged. The shipped README details the filesystem mapping contract.
- **Changed style output:** rewritten unquoted `style` values gain double quotes; values are escaped for their output quote context so decoded whitespace, equals signs, and quotes cannot introduce attributes or detach CSS suffixes. The raw-source decoder fallback also preserves attribute boundaries and decodes existing entities only once. Added quotes/escaping count toward `maxOutputBytes` in pure and async/sync file APIs, with no write on limit failure. `<style>` elements retain raw-text semantics (no HTML-entity decoding).
- **Selective inlining:** `InlineOptions`/`InlineFilesOptions` accept `maxInlineBytes` (byteLength threshold) and/or `shouldInline(asset, url) => boolean` to leave large or predicate-rejected assets as external references with an `INLINE_SKIPPED` (`warn`) diagnostic; hard limits (`maxAssetBytes`/`maxTotalBytes`) remain fail-closed (`ResourceLimitError`) and cannot be downgraded, with deterministic order and no implicit heuristics.
- **Changed contracts:** `maxFiles` is one catalog-wide budget across roots (byte `{ data }` inputs sit outside it); oversized targets rejected by `maxTargetBytes` return `content: ''` with `written: false` (metadata preflight only, not a strict allocation bound); resolver/catalog/formatter data URLs must match `data:<type>/<subtype>;base64,<strict-base64>` or fail with `INVALID_OPTIONS`; `image/x-icon` detections normalize to canonical `image/vnd.microsoft.icon`.

## Policy defaults and caps

All numeric overrides are positive safe integers. Defaults apply when omitted;
values above the cap are rejected with `InvalidOptionsError`.

| Policy            | Default | Maximum |
| ----------------- | ------: | ------: |
| `maxAssetBytes`   |   3 MiB | 100 MiB |
| `maxTotalBytes`   |  15 MiB | 500 MiB |
| `maxTargetBytes`  |   5 MiB |  50 MiB |
| `maxOutputBytes`  |  20 MiB | 100 MiB |
| `maxReplacements` |    1000 |  100000 |
| `maxSyntaxDepth`  |     256 |     512 |
| `maxFiles`        |   10000 |  100000 |
| `maxDepth`        |      32 |     256 |
| `maxTargets`      |     500 |    5000 |
| `concurrency`     |      16 |      64 |
| `maxInlineBytes`  |    none | 100 MiB |

Output accounting includes quotes/escaping/font hints and checks changed output
after assembly/fallback serialization. See the README for depth counting,
metadata-read growth races, discovery/read TOCTOU, and file-write guarantees.

## Migration note

Legacy `node-font2base64` and `base64-injector` both exposed `encodeToDataSrc` with conflicting semantics and unsafe defaults. The new package splits them into `encodeAsset` (data URL only) + `formatCssUrl` (generic) / `formatFontSource` (font, requires `fontFormat`), makes file writes opt-in, skips remote/`data:` URLs before I/O, and reports ambiguity as `AmbiguousAssetError` instead of picking a winner. The package `README.md` contains the complete migration matrices for both legacies, the intentional breaking changes, CSP/caching and SVG non-sanitization caveats, and MIT provenance/license notices for dependencies (`file-type`, `postcss`, `postcss-value-parser`, `parse5`) and fixtures.
