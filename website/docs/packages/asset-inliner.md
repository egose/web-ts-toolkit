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
const asset = await encodeAsset('./assets/logo.png');
formatCssUrl(asset); // url(data:image/png;base64,...)
```

```ts
import { createAssetCatalog, inlineCss } from '@web-ts-toolkit/asset-inliner';
const catalog = await createAssetCatalog(['./assets']);
const result = inlineCss('a { background: url("./assets/logo.png") }', { catalog, documentPath: '/project/src/a.css' });
```

```ts
import { inlineFiles } from '@web-ts-toolkit/asset-inliner';
await inlineFiles({ assets: ['./assets'], targets: ['./styles'] }); // dry-run; add write:true to persist
```

## Notes

- **Registry reuse:** pass an already-validated `AssetDefinitionRegistry` via `{ registry }` to `createAssetCatalog`, `discoverAssets`, or `encodeAsset` to avoid re-normalizing `definitions`.
- **Literal unions:** `AssetInlinerErrorCode` (`'RESOURCE_LIMIT'` etc.) and `DiagnosticCode` (`'UNRESOLVED_REFERENCE'` etc.) narrow in consumers; subclasses like `ResourceLimitError` carry `code: 'RESOURCE_LIMIT' as const`.
- **sourcePath:** `EncodedAsset.sourcePath` is a normalized absolute path (`path.resolve`) when input was a file path.
- **Definition shape:** `AssetTypeDefinition` is a discriminated union — `fontFormat` only allowed when `kind === 'font'` (checked at type and runtime).
- **Changed HTML:** `inlineHtml` prefers source-location patches of the targeted attribute value ranges so unrelated markup stays byte-identical; if a patch is invalid/overlapping it falls back to full serialization (may normalize).
- **Embedded CSS:** `inlineEmbeddedCss: true` (opt-in, default `false`) inlines local `url(...)` inside `<style>` elements and `style` attributes using the same CSS semantics as `inlineCss`, with shared limits, source-offset location mapping, and a `PARSE_ERROR` diagnostic (no corruption) for malformed chunks.
- **Selective inlining:** `InlineOptions`/`InlineFilesOptions` accept `maxInlineBytes` (byteLength threshold) and/or `shouldInline(asset, url) => boolean` to leave large or predicate-rejected assets as external references with an `INLINE_SKIPPED` (`warn`) diagnostic; hard limits (`maxAssetBytes`/`maxTotalBytes`) remain fail-closed (`ResourceLimitError`) and cannot be downgraded, with deterministic order and no implicit heuristics.

## Migration note

Legacy `node-font2base64` and `base64-injector` both exposed `encodeToDataSrc` with conflicting semantics and unsafe defaults. The new package splits them into `encodeAsset` (data URL only) + `formatCssUrl` (generic) / `formatFontSource` (font, requires `fontFormat`), makes file writes opt-in, skips remote/`data:` URLs before I/O, and reports ambiguity as `AmbiguousAssetError` instead of picking a winner. The package `README.md` contains the complete migration matrices for both legacies, the intentional breaking changes, CSP/caching and SVG non-sanitization caveats, and MIT provenance/license notices for dependencies (`file-type`, `postcss`, `postcss-value-parser`, `parse5`) and fixtures.
