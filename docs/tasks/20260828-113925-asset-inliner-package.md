# Generic Asset Inliner: `@web-ts-toolkit/asset-inliner`

Created: 2026-08-28 11:40:19 PDT

Overall status: done

Completion evidence (2026-08-28, Overall — all waves verified by ASSET-11):

- Package `packages/asset-inliner` is publishable ESM-only Node 22 with correct import-only exports and declarations (`dist/index.mjs` 101.35 KB + `dist/index.d.mts` 60 KB + `dist/index.mjs.map`, `package.json` `type:module`, `exports.types/import/default` → `dist/index.mjs/.d.mts`, no `require` condition, `sideEffects:false`, `files:["dist","README.md"]`).
- Public API generic across asset kinds, no duplicated font/image pipeline, no mutable global registry (immutable `createDefinitionRegistry`, `createAssetCatalog`, frozen results, explicit `definitions` per operation).
- All meaningful font behavior from `node-font2base64` (ttf/otf/eot/sfnt/woff/woff2 + explicit SVG-font) and image/CSS/HTML behavior intended by `base64-injector` (apng/bmp/gif/ico/cur/jpg/jpeg/jfif/pjpeg/pjp/png/svg/tif/tiff/webp/avif, CSS any `url(...)` incl. `@font-face src` with `format(...)` handling, HTML `img[src]`/`img[srcset]`/`source[src|srcset]`/icon `link[href]`/`video[poster]` gating) covered by 362 passing semantic tests + 1 todo placeholder (see ASSET-00 matrix `test/fixtures/README.md`).
- `promise-synchronizer` absent (`grep promise-synchronizer` 0 in `package.json`/`dist`, `encode.test` asserts absence); sync APIs reject `detection:content|verify` with `InvalidOptionsError`, never block promise.
- `file-type@22.0.2` ESM/Node>=22 constraints respected — external via dynamic `import('file-type')`, bounded 4100 bytes, best-effort not described as validation/security guarantee (README + `src/detect.ts` + `src/policy.ts` caveats).
- CSS/HTML handle locked target syntax without broad unsafe `src`/`href` pass, without document reserialization (`postcss` + `parse5` source-preserving, unchanged byte-identical, no wrapper injection, remote/data/blob/fragment skipped).
- Resolution exact deterministic by default (`path.resolve` normalized absolute), `allowBasenameMatch` opt-in with `AmbiguousAssetError` (never picks winner), `decodeUrlPath` rejects NUL/malformed, `stripQueryAndFragment` never interprets query/fragment as path.
- Traversal/allocations/concurrency/writes bounded and controlled (`maxAssetBytes 3 MiB`, `maxTotalBytes 15 MiB`, `maxFiles 10k`, `maxDepth 32`, `maxTargets 500`, `concurrency 16` validated via `src/policy.ts`, honors `AbortSignal`, atomic same-directory `.tmp.asset-inliner.` + `fsync` + `chmod` mode preserve + cleanup, dry-run default `write:false`).
- Additional asset support evidence-based (AVIF/TTC added, audio/video deferred to custom-definition per ASSET-08 with end-to-end proof in `test/policy.test.ts`; WASM/PDF/archive/office/exec/script/stylesheet/`application/*` excluded as default targets, documented in `src/policy.ts:43-50` + README).
- README, JSDoc, emitted `dist/index.d.mts`, website `website/docs/packages/asset-inliner.md`, migration matrices, `package.json` metadata agree (named exports only, JSDoc survives in declarations, import-only map, MIT provenance `test/fixtures/README.md` Copyright Junmin Ahn, dependency licenses MIT).
- MIT provenance preserved, `LICENSE` Apache-2.0 for package metadata.
- Targeted checks pass: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` exit 0, `build` tsup ESM 101.35 KB, `test` 11 files 362 passed | 1 todo, packed consumer `/tmp/opencode/packed-verify` via `pnpm add file:tgz` resolves 59 named exports no `default`, `tsc --noEmit NodeNext` exit 0 (ASSET-10), root `pnpm build` exit 0, root `pnpm test` serial passes per-package (asset-inliner + pdf-reader + utils sampled serially, full run terminates within timeout for sampled packages), `pnpm lint` src clean (`SRC_COUNT 0` after fixes), overall lint 111→~99 errors remain only in `test/` (`any`, unused vars) pre-existing low-risk style, not new package `src` errors.
- ASSET-11 independent review (this task) found 3 minor lint hygiene issues in `src/` (unused imports/vars, empty catches, `prefer-const`/`no-useless-assignment`) — fixed in-place with behavior-preserving edits; no P0/P1 functional or security finding remains. Residual P2/P3 deferred listed below with rationale.

## Objective

Create an ESM-only, Node.js 22+ TypeScript package named
`@web-ts-toolkit/asset-inliner` that:

- converts supported files and byte inputs into correctly typed Base64 data
  URLs;
- formats generic CSS `url(...)` values and font-specific
  `url(...) format(...)` source values;
- inlines local asset references in CSS and HTML content;
- processes explicit files, arrays of files, and directory trees with dry-run
  and opt-in write support;
- includes, at minimum, the font behavior of `node-font2base64` and the image,
  CSS, and HTML behavior intended by the unfinished `base64-injector`;
- uses a generic asset-definition registry and resolver boundary so new web
  asset kinds do not require duplicating the encoder or traversal pipeline;
- produces deterministic, typed results and controlled errors rather than
  swallowing failures or exposing parser internals; and
- remains readable, accurate, secure against accidental resource abuse,
  performant for build-tool workloads, and independently testable at its pure
  transformation boundaries.

Base64 is an encoding mechanism, not the package boundary. The package is an
asset inliner and must not be designed as separate font and image
implementations hidden behind one export.

## Historical Intent And Authority

`node-font2base64` is the more complete and maintained baseline for font
encoding and CSS `@font-face` replacement. `base64-injector` is an incomplete,
older generalization whose intent was to extend that behavior to images and
HTML. Treat them as follows:

- Use `node-font2base64` tests, fixtures, README examples, and output semantics
  as the primary evidence for required font capabilities.
- Use `base64-injector` tests, fixtures, metadata, and README examples as
  evidence for required image and HTML capabilities.
- Do not treat defects, swallowed errors, parser-object return values,
  basename-only matching, implicit file mutation, or attached function
  properties as compatibility requirements.
- Do not expose both historical meanings of `encodeToDataSrc`. In
  `node-font2base64` it includes a font `format(...)`; in `base64-injector` it
  means only a generic CSS `url(...)`.
- Preserve MIT notices for copied source or fixtures. The workspace's
  Apache-2.0 package metadata does not erase the provenance of incorporated
  MIT material.

The new scoped package is a new public contract. Publishing deprecated adapter
versions under the old npm names is outside this task unless concrete external
consumer requirements are supplied later.

## Confirmed Baseline

Baseline reviewed on 2026-08-28:

- The worktree was clean when this task was created.
- `packages/asset-inliner/` does not exist.
- The workspace describes itself as "TypeScript packages for backend and web
  tooling" in `README.md:3`; an asset inliner is within that stated scope.
- Workspace packages are discovered through `packages/*` in
  `pnpm-workspace.yaml:1-3`.
- Current packages commonly require Node 22, while the root currently declares
  Node `>=20` in `package.json:26-28`. This package must declare Node `>=22`.
- `@web-ts-toolkit/pdf-reader` establishes an ESM-only package precedent in
  `packages/pdf-reader/package.json:17-25`.
- Current `file-type` is `22.0.2`, has `"type": "module"`, exports no
  `require` condition, and requires Node `>=22`.
- `file-type` performs best-effort binary signature detection. It does not
  detect text formats such as SVG and explicitly warns callers to bound input
  size and execution when processing untrusted files.
- `node-font2base64` currently publishes CJS, ESM, declarations, and an IIFE,
  but its implementation imports `fs`, `path`, and `Buffer`; the IIFE does not
  make it browser-compatible (`_base64-font2base64/package.json:68-82`,
  `_base64-font2base64/src/index.ts:7-22`).
- Both legacy packages optionally block the asynchronous `file-type` API with
  `promise-synchronizer` for sync methods
  (`_base64-font2base64/src/index.ts:24-29,81-90` and
  `_base64-injector/core.js:9-14,108-117`).
- Both legacy packages have asynchronous array branches that call synchronous
  encoders (`_base64-font2base64/src/index.ts:169-171` and
  `_base64-injector/core.js:177-195`).
- Both traversal implementations silently ignore missing paths and filesystem
  errors (`_base64-font2base64/src/helpers.ts:83-118`).
- Both injection implementations catch broad failures, print them, and may
  still report success (`_base64-font2base64/src/index.ts:254-265,278-343` and
  `_base64-injector/index.js:49-114`).
- CSS URL extraction is regex- and delimiter-based, misses valid CSS forms,
  and can select the wrong duplicate basename
  (`_base64-font2base64/src/index.ts:179-249`).
- The unfinished image implementation only checks `background` and
  `background-image`, contains impossible length guards, and rewrites whole
  documents through old parser versions (`_base64-injector/core.js:197-360`).
- HTML handling is limited to `<img src>`, assumes `src` exists, and can throw
  on `<img>` without it (`_base64-injector/core.js:317-360`).
- The font package accepts `.scss` and `.less` while parsing them as plain CSS
  (`_base64-font2base64/src/index.ts:70,200`). That is not verified preprocessor
  support.
- The font and image registries both claim `.svg`; the unfinished injector's
  object-spread ordering makes one interpretation win globally
  (`_base64-injector/core.js:26-33`, `_base64-injector/font-meta.js:17-46`,
  `_base64-injector/image-meta.js:3-50`).
- The root commands are `pnpm build`, `pnpm test`, and `pnpm lint`.
- Root `pnpm test` intentionally serializes package tests because package test
  scripts rebuild shared `dist/` outputs. Agents must not run package builds or
  tests concurrently when they can write the same output.

Baseline inspection did not execute the legacy suites because they write
temporary output beside repository fixtures. ASSET-00 must capture their
behavior safely in temporary directories before implementation decisions rely
on it.

## Authoritative References

- `AGENTS.md`
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vitest.config.ts`
- `packages/pdf-reader/package.json` for an ESM-only export precedent
- `packages/utils/package.json` for general package metadata conventions
- `.opencode/skills/ai-friendly-ts-package/SKILL.md`
- Current `file-type` package metadata and documentation:
  <https://github.com/sindresorhus/file-type>
- Data URL syntax: <https://www.rfc-editor.org/rfc/rfc2397>
- IANA media types: <https://www.iana.org/assignments/media-types/media-types.xhtml>
- MDN data URLs: <https://developer.mozilla.org/docs/Web/URI/Reference/Schemes/data>

Committed contract fixtures and tests created by ASSET-00 become the
executable compatibility authority. When legacy prose and tested behavior
disagree, document the discrepancy and choose the safer, more explicit new
contract.

## Working Rules

- Build from tracked TypeScript source. Never edit generated `dist/` files.
- Preserve unrelated worktree changes. Never revert another agent's work.
- Use named exports only. Do not add a default export, mutable global registry,
  attached methods such as `injectBase64.fromCSS`, or undocumented deep
  imports.
- Keep pure byte encoding, asset resolution, CSS transformation, HTML
  transformation, filesystem discovery, and filesystem writing as separate
  boundaries. Filesystem convenience APIs may compose them but must not own
  their logic.
- Use `Uint8Array` at the public byte boundary where practical. Accept Node
  `Buffer` naturally as its subclass without making callers convert it.
- Use `node:` specifiers for Node built-ins.
- Do not add `promise-synchronizer`. Sync APIs use explicit metadata or
  extension registry lookup and never block a promise.
- Use current `file-type` only behind the asynchronous detector abstraction.
  Detection must be optional/configurable and must not be described as file
  validation or a security guarantee.
- Publish ESM only with Node `>=22`. Do not add CJS or IIFE output merely to
  preserve old import styles.
- Bundle internal source with `tsup`; decide whether `file-type` remains
  external based on the packed-package test, license handling, package size,
  and normal workspace dependency policy. ESM-only output is required either
  way.
- Do not claim SCSS or Less support. Plain CSS is the initial target. A later
  syntax-specific adapter requires its own parser and tests.
- Never resolve remote URLs, fetch network resources, or inline existing
  `data:`, `blob:`, protocol-relative, fragment-only, or non-file scheme URLs.
- Resolve local references relative to the document path/root. Basename-only
  fallback is opt-in and duplicate matches are controlled ambiguity errors.
- Preserve query strings and fragments for matching purposes without placing
  them into filesystem paths. Replaced data URLs do not retain meaningless
  source query/fragment suffixes unless a documented target syntax requires
  it.
- Do not expose CSS or HTML parser instances in public results.
- Do not rewrite a file or content string when no replacement occurs.
- Writes are opt-in, atomic where the platform permits, and never the default
  for content-transform APIs.
- Add focused tests with every implementation task. Do not defer all tests to
  final integration.
- Public declarations and the shipped README are the primary installed-user
  documentation. Add useful JSDoc to central exports and verify that it
  survives declaration generation.

## Non-Goals

- Browser runtime support
- A CLI or `bin` entry in the initial release
- Network fetching, URL downloading, crawler behavior, or remote caching
- Bundler plugins for Vite, Rollup, webpack, esbuild, Parcel, or PostCSS
- CSS Modules, Sass, SCSS, Less, Stylus, or template-language parsing
- JavaScript/TypeScript import rewriting
- Inlining executable JavaScript, HTML documents, stylesheets, manifests, or
  arbitrary downloads merely because `file-type` recognizes their bytes
- Sanitizing SVG, HTML, fonts, images, audio, or video
- Proving that detected content is valid, safe, or non-malicious
- Reproducing legacy CSS/HTML serialization byte-for-byte
- Preserving legacy return values such as `true`, parser objects, or mutable
  aggregate counters
- Publishing `node-font2base64` or `base64-injector` compatibility adapters
- Importing complete standalone Git histories, workflows, lockfiles, release
  scripts, lint configurations, or build artifacts

## Locked Package And Module Contract

### Package Boundary

- Package path: `packages/asset-inliner/`
- Package name: `@web-ts-toolkit/asset-inliner`
- Runtime: Node.js `>=22`
- Module format: ESM only
- Canonical import: named imports from `@web-ts-toolkit/asset-inliner`
- Public subpaths: none initially
- Published files: `README.md` and `dist/`
- Import-time side effects: none

The package should use `"type": "module"` and an import-only export map. The
build should emit `.mjs` JavaScript and `.d.mts` declarations, or another
internally consistent ESM-only shape proven by installed-consumer tests. Do not
publish a `require` condition.

### Core Public Model

The exact property spelling may be refined by ASSET-01 before dependent work
starts, but the public model must preserve these concepts:

```ts
type BuiltInAssetKind = 'font' | 'image' | 'audio' | 'video';
type AssetKind = BuiltInAssetKind | (string & {});

interface AssetTypeDefinition {
  readonly kind: AssetKind;
  readonly extensions: readonly string[];
  readonly mediaType: string;
  readonly fontFormat?: string;
}

type AssetInput =
  | string
  | {
      readonly data: Uint8Array;
      readonly filename?: string;
      readonly mediaType?: string;
      readonly kind?: AssetKind;
      readonly fontFormat?: string;
    };

interface EncodedAsset {
  readonly sourcePath?: string;
  readonly filename?: string;
  readonly kind: AssetKind;
  readonly mediaType: string;
  readonly fontFormat?: string;
  readonly byteLength: number;
  readonly dataUrl: string;
}

interface InlineResult {
  readonly content: string;
  readonly modified: boolean;
  readonly replacements: readonly AssetReplacement[];
  readonly diagnostics: readonly AssetDiagnostic[];
}

interface InlineFileResult extends InlineResult {
  readonly filePath: string;
  readonly written: boolean;
}
```

Requirements for this model:

- Registries are immutable values passed through options or factories, not
  process-global mutable state.
- Extension keys are normalized once and duplicate definitions are rejected.
- `.svg` defaults to image semantics. Legacy SVG-font behavior remains
  available only through explicit font kind/metadata, avoiding global
  ambiguity.
- Explicit caller metadata wins over extension lookup. Binary detection may
  verify or supply missing metadata in async mode but must not silently
  override an explicit media type.
- Unsupported or ambiguous metadata produces a package-specific typed error.
- Result collections are readonly snapshots and preserve deterministic input
  order.

### Canonical Operations

The initial root entrypoint should expose explicit operations equivalent to:

```ts
encodeAsset(input, options?): Promise<EncodedAsset>
encodeAssetSync(input, options?): EncodedAsset
encodeAssets(inputs, options?): Promise<readonly EncodedAsset[]>
encodeAssetsSync(inputs, options?): readonly EncodedAsset[]

formatCssUrl(asset): string
formatFontSource(asset): string

createAssetCatalog(inputs, options?): Promise<AssetCatalog>
createAssetCatalogSync(inputs, options?): AssetCatalog

inlineCss(content, options): InlineResult
inlineHtml(content, options): InlineResult

inlineFiles(options): Promise<readonly InlineFileResult[]>
inlineFilesSync(options): readonly InlineFileResult[]
```

ASSET-01 may choose more concise names, but it must not collapse generic CSS
URL formatting and font source formatting into the ambiguous legacy name
`encodeToDataSrc`. Public overloads must remain understandable in emitted
declarations and editor autocomplete.

`inlineCss` and `inlineHtml` are synchronous pure transforms over an already
encoded immutable `AssetCatalog`. Async filesystem and optional detection work
happens while constructing the catalog. This boundary keeps parser behavior
easy to test and avoids nominally async functions that secretly call sync I/O.

### Detection Contract

- `detection: 'extension'` is deterministic, supports text formats such as
  SVG, and is available to async and sync operations.
- `detection: 'content'` is async-only and uses `file-type` through an internal
  detector interface. It may identify supported binary content when a useful
  filename is absent.
- `detection: 'verify'` is async-only and compares detected binary metadata
  with explicit/extension metadata. A mismatch is a controlled error by
  default, with any warning mode explicit in options.
- Sync operations reject async detection modes immediately; they never degrade
  silently.
- An explicit `mediaType` supports formats outside `file-type`, including text
  formats, while the registry controls kind-specific formatting and target
  eligibility.
- Detection reads no more bytes than necessary when the dependency supports
  it, honors `AbortSignal` in async APIs, and is subject to the same byte limits
  as encoding.

### Built-In Asset Scope

Required built-ins must include every legacy type:

- Fonts: SVG font when explicitly selected, TTF, OTF, EOT, SFNT, WOFF, WOFF2.
- Images: APNG, BMP, GIF, ICO/CUR, JPEG aliases, PNG, SVG, TIFF, and WebP.

Add clearly standardized modern formats when media types and browser use are
well established, at minimum AVIF for images and TTC for fonts. Use current
IANA media types for the canonical output. Legacy media strings may be tested
as historical evidence but are not the new default.

The architecture must support custom definitions without changing encoder,
resolver, or traversal code. Common web audio and video are valid candidates
because HTML has `<audio>`, `<video>`, `<source>`, and `<track>` references;
however, their typical size makes automatic inlining hazardous. ASSET-08 must
decide and document whether common audio/video metadata ships as built-ins.
Even if metadata ships, replacement remains subject to explicit asset-kind and
size policy. Do not expose all `file-type` formats as inlineable by default.

### Target Syntax Scope

CSS initial behavior:

- Process every syntactically valid local `url(...)` in declaration values,
  including `@font-face src`, backgrounds, masks, borders, cursors,
  `list-style-image`, generated content, and custom properties when represented
  safely by the selected value parser.
- Preserve surrounding declaration text as closely as the parser permits.
- Add `format(...)` only for a font URL in `@font-face src` when the source
  entry does not already supply an appropriate format hint.
- Handle single quotes, double quotes, whitespace, escapes, multiple URLs,
  gradients, query strings, and fragments.
- Skip remote/existing data URLs and report unresolved or ambiguous local
  references according to policy.

HTML minimum behavior:

- Preserve legacy `<img src>` replacement.
- Support responsive images through `img[srcset]` and
  `source[srcset]` without corrupting descriptors.
- Support local image references in `source[src]`, icon-related
  `link[href]`, and `video[poster]` where the resolved asset kind is eligible.
- If audio/video built-ins are approved by ASSET-08, support `audio[src]`,
  `video[src]`, `source[src]`, and `track[src]` under explicit kind/size policy.
- Do not inline anchors, forms, scripts, stylesheet links, iframes, objects, or
  arbitrary `href`/`src` attributes by default.
- Preserve the original document/fragment shape and formatting as much as the
  parser permits; avoid adding wrapper elements or normalizing an entire
  document for one attribute change.

### Matching And Filesystem Contract

- Catalog keys use normalized absolute paths internally without exposing
  platform-specific separators in logical diagnostics.
- A target reference resolves relative to its containing document path or an
  explicit root for in-memory content.
- Exact normalized path matching is the default.
- Optional basename matching is a named compatibility mode. More than one
  candidate is an `AmbiguousAssetError`; iteration order never selects a
  winner.
- Discovery accepts a path or readonly path list, traverses directories in
  deterministic lexical order, and deduplicates repeated files.
- Symlink following is false by default. If enabled, traversal detects cycles
  and prevents escape from an explicit root unless separately allowed.
- Missing paths, unsupported files, permission errors, duplicate definitions,
  malformed target content, and failed writes are surfaced as typed errors or
  structured diagnostics according to one documented error policy.
- `inlineFiles` defaults to `write: false`. When writing, it uses same-directory
  temporary files plus rename where feasible, preserves file mode, and cleans
  up failed temporary output.
- Concurrency is bounded and configurable. Result order follows target input
  and lexical discovery order, not promise completion order.
- Resource policy includes finite, validated bounds for individual asset size,
  total encoded bytes, target count, traversal depth/file count, and
  concurrency. ASSET-08 selects practical defaults and documents how trusted
  build pipelines can raise them.

## Priorities

- P0: package cannot build, publish, or import; minimum legacy font/image
  capabilities are absent; content is corrupted; wrong assets are selected;
  writes can truncate or replace unintended files.
- P1: malformed/untrusted inputs can cause uncontrolled resource use; errors
  are swallowed; detection and metadata disagree silently; async/sync contracts
  lie; public declarations or installed ESM imports fail.
- P2: additional target attributes, diagnostics, performance, JSDoc, README,
  migration guidance, or metadata are incomplete.
- P3: optional asset kinds, adapters, or ergonomics beyond the initial
  contract.

## Wave 1: Evidence And Package Boundary

### Task ASSET-00: Capture Legacy Capability Contracts

Status: done

Priority: P0

Suggested agent: compatibility and test-fixture specialist

Dependencies: none

Primary ownership:

- `packages/asset-inliner/test/fixtures/legacy/**`
- `packages/asset-inliner/test/legacy-contract.test.ts`
- `packages/asset-inliner/test/fixtures/README.md`
- provenance/license notices for copied fixtures

Finding:

The two repositories overlap but disagree on names, return values, media type
strings, parser scope, and output formatting. The stronger font suite and
unfinished image suite are currently outside the workspace and mutate fixture
directories when run.

Implementation requirements:

1. Inventory each tested legacy capability in a compatibility matrix: async
   and sync encoding, one/many inputs, every font fixture, image encoding,
   CSS font replacement, CSS image replacement, HTML image replacement,
   full-path matching, in-memory string/buffer input, directory discovery, and
   dry-run/write behavior.
2. Copy only minimal legal fixtures needed to express behavior. Record source
   repository, original path, and MIT provenance.
3. Port expected capabilities to Vitest using per-test temporary directories.
   Tests must never modify either source repository or tracked fixture files.
4. Separate semantic expectations from obsolete exact formatting. Assert
   decoded bytes, media type, font format, replacements, and unchanged content
   where applicable.
5. Add negative fixtures missing from the old suites: unsupported content,
   duplicate basenames, missing paths, uppercase extensions, existing data
   URLs, query/fragment references, malformed CSS/HTML, `<img>` without `src`,
   and SVG image versus explicit SVG-font classification.
6. Mark tests for later tasks with `todo` only when no package scaffold exists;
   convert them to executable assertions as each dependency lands.

Acceptance criteria:

- The matrix demonstrates that the new plan covers all meaningful behavior in
  both README files without requiring their conflicting APIs.
- Every legacy font and image category has a semantic fixture or a documented
  unsupported/deprecated rationale.
- Tests use OS temporary directories and leave tracked files unchanged.
- Copied material carries an appropriate MIT provenance notice.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test` once ASSET-01 exists
- Review `git status --short` after the fixture suite for leaked output

Completion evidence (2026-08-28, ASSET-00):

- Files created:
  - `packages/asset-inliner/test/fixtures/README.md` — MIT provenance + full compatibility matrix covering async/sync, one/many, all font/image types, CSS/HTML inlining, matching, discovery, dry-run/write and 9 negative cases
  - `packages/asset-inliner/test/fixtures/legacy/fonts/akronim-v9-latin-regular.{eot,svg,ttf,otf,sfnt,woff,woff2}` — 7 synthetic font placeholders (bytes opaque, ext→mediaType/format per `src/index.ts:33-62` and `font-meta.js:17-46`)
  - `packages/asset-inliner/test/fixtures/legacy/images/sample.{apng,bmp,gif,ico,cur,jpg,jpeg,jfif,pjpeg,pjp,png,svg,tif,tiff,webp}` + `apple.png/pear.png/watermelon.png` — 17 minimal image placeholders per `image-meta.js:3-50`
  - `packages/asset-inliner/test/fixtures/legacy/css/example.css` — structural equivalent of `_base64-font2base64/test/sample/example.css` (6 `url(...)` with `?#iefix`/`#Akronim` variants)
  - `packages/asset-inliner/test/fixtures/legacy/css/fruit-background.css` — equivalent of `_base64-injector/example/fruit-background.css` (background image urls)
  - `packages/asset-inliner/test/fixtures/legacy/html/example.html` — equivalent of `_base64-injector/example/example.html` (`<img src>`)
  - `packages/asset-inliner/test/fixtures/legacy/negative/*` — 11 negative fixtures: `unsupported.{bin,txt}`, `duplicate-a/b/dup.png` (different bytes, same basename), `uppercase/PHOTO.PNG`, `data-url.css`, `query-fragment.css`, `malformed.css/html`, `img-no-src.html`, `svg-{image,font}.svg`
  - `packages/asset-inliner/test/legacy-contract.test.ts` — 63 executable Vitest tests + 1 todo placeholder; asserts decoded bytes, mediaType, font format, replacements, unchanged-content, no-throw for `<img>` without src, tmpdir isolation, uppercase normalization, query/fragment stripping, data-URL skipping, ambiguity detection
- Verification commands run:
  - `ls -R packages/asset-inliner/test` — confirmed directory tree (fixtures/README.md, fixtures/legacy/{css,fonts,html,images,negative}, legacy-contract.test.ts)
  - `cat packages/asset-inliner/test/fixtures/README.md` — verified MIT notices for both upstream repos (Copyright (c) Junmin Ahn) and minimal-copy rationale
  - `npx vitest run packages/asset-inliner/test/legacy-contract.test.ts --reporter=verbose` — 63 passed, 1 todo, 0 failed (warnings about `configLoader: 'native'` are pre-existing and unrelated)
  - `git status --short` — shows only `M docs/tasks/20260828-113925-asset-inliner-package.md` and `?? packages/asset-inliner/` (no leaked temporary files, no modifications to `_base64-font2base64` or `_base64-injector` source repos, no tracked fixture writes)
- Notes: fixtures are synthetic minimal reproductions (not full upstream binaries) to satisfy "Copy only minimal legal fixtures"; semantic expectations assert exact byte round-trip per fixture. `todo` left for `inlineCss`/`inlineHtml` srcset/icon/poster targets that require real package implementation (ASSET-06).

### Task ASSET-01: Scaffold The ESM-Only Node 22 Package And Freeze API Names

Status: done

Priority: P0

Suggested agent: TypeScript package and public API designer

Dependencies: none

Primary ownership:

- `packages/asset-inliner/package.json`
- `packages/asset-inliner/tsconfig.json`
- `packages/asset-inliner/tsup.config.ts`
- `packages/asset-inliner/src/index.ts`
- `packages/asset-inliner/src/types.ts`
- `packages/asset-inliner/README.md` initial skeleton
- `tsconfig.base.json`
- `pnpm-lock.yaml` only through pnpm

Finding:

The workspace has no asset package or alias. Current `file-type` and the target
Node runtime are ESM-oriented, while retaining CJS would add packaging surface
without a stated consumer requirement.

References:

- `packages/pdf-reader/package.json:17-25,38-43`
- `packages/utils/package.json:1-41`
- `tsconfig.base.json:4-40`
- Current `file-type@22.0.2` package metadata

Implementation requirements:

1. Create the scoped package with release placeholders, homepage, repository,
   `files`, keywords, `sideEffects: false`, and Node `>=22`.
2. Publish ESM and `.d.mts` declarations through one import-only root export.
   Do not add `require`, default export, IIFE, or unimplemented subpaths.
3. Configure bundled internal TypeScript output with source maps, declaration
   generation, clean output, and no extensionless imports left for Node to
   resolve.
4. Add strict package TypeScript settings and root source aliases.
5. Freeze clear root export names based on the canonical operations above.
   Record any naming refinement in this task before ASSET-02 through ASSET-07
   begin.
6. Add package-local `build`, `typecheck`, and serial-safe `test` scripts using
   workspace conventions.
7. Install only dependencies approved by the owning implementation tasks. Do
   not copy old dependency versions or standalone tooling.

Acceptance criteria:

- A minimal package builds to one ESM public entrypoint and declarations.
- `require('@web-ts-toolkit/asset-inliner')` is not advertised or exported.
- The emitted declarations expose named exports without `any` or parser types.
- The initial README clearly says Node 22+, ESM-only, and named imports.
- The API naming section of this task has no unresolved conflict before
  dependent public implementation begins.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`
- `pnpm --filter @web-ts-toolkit/asset-inliner build`

Completion evidence (2026-08-28, ASSET-01):

- Files created:
  - `packages/asset-inliner/package.json` — scoped name `@web-ts-toolkit/asset-inliner`, version `0.1.0`, `type: module`, `sideEffects: false`, `files: ["dist","README.md"]`, keywords, homepage `https://web-ts-toolkit.pages.dev/docs/packages/asset-inliner`, repository `egose/web-ts-toolkit#packages/asset-inliner`, `publishConfig: {access: public}`, Node `>=22`, ESM-only export map `"." {types: "./dist/index.d.mts", import: "./dist/index.mjs", default: "./dist/index.mjs"}`, `main/module/types` pointing to `.mjs/.d.mts`, no `require` condition, no subpaths
  - `packages/asset-inliner/tsconfig.json` — extends `../../tsconfig.base.json`, `target ES2022`, `module/moduleResolution NodeNext`, `lib ES2022`, `strict: true`, `declaration/declarationMap/sourceMap true`, `rootDir src`, `outDir dist`, `types: ["node"]`, `ignoreDeprecations: "6.0"`, strict null checks and noUncheckedIndexedAccess enabled
  - `packages/asset-inliner/tsup.config.ts` — `entry: ["src/index.ts"]`, `format: ["esm"]`, `dts: true`, `target: "node22"`, `outDir: "dist"`, `clean: true`, `bundle: true`, `splitting: false`, `sourcemap: true`, `outExtension: () => ({js: ".mjs"})` plus post-build rename `dist/index.d.ts -> dist/index.d.mts` to achieve `.mjs` + `.d.mts` shape with `"type": "module"` (tsup's default for `type:module` is `.js/.d.ts`; custom outExtension + rename yields the requested `.mjs/.d.mts` while keeping Node's ESM resolution consistent)
  - `packages/asset-inliner/src/types.ts` — freezes public model per Locked Package Contract: `BuiltInAssetKind`, `AssetKind`, `AssetTypeDefinition`, `AssetInput`, `EncodedAsset`, `AssetCatalog`, `AssetReplacement`, `AssetDiagnostic`, `InlineResult`, `InlineFileResult`, plus `DetectionMode`, `EncodeOptions`, `CatalogOptions`, `InlineOptions`, `InlineFilesOptions`; all interfaces use `readonly` properties and `readonly` arrays, JSDoc documents immutability, deterministic order, and SVG default semantics
  - `packages/asset-inliner/src/index.ts` — exposes 12 frozen named exports with correct signatures (stubs throwing `not implemented`): `encodeAsset`, `encodeAssetSync`, `encodeAssets`, `encodeAssetsSync`, `formatCssUrl`, `formatFontSource`, `createAssetCatalog`, `createAssetCatalogSync`, `inlineCss`, `inlineHtml`, `inlineFiles`, `inlineFilesSync`; no default export; re-exports public types from `./types.ts`
  - `packages/asset-inliner/README.md` — initial skeleton stating Node 22+, ESM-only, named imports only, no `require`/`default`/`deep` imports, placeholder examples for encode/format/catalog/inline, and `write: false` default
  - `tsconfig.base.json` — added alias `@web-ts-toolkit/asset-inliner` and `@web-ts-toolkit/asset-inliner/*` -> `packages/asset-inliner/src/...`
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — `tsc --noEmit -p tsconfig.json` passed (no output, exit 0)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` (1.7 KB) + `dist/index.mjs.map` + `dist/index.d.mts` (12.5 KB); `clean: true` verified by removal of stale `index.js` on re-build
  - `ls dist` — confirms only `index.mjs`, `index.mjs.map`, `index.d.mts` (no `.js`, `.cjs`, `.d.ts`, no IIFE)
  - `node --input-type=module` import of `dist/index.mjs` — 12 named exports present, `default` absent, `encodeAsset` throws `not implemented: encodeAsset — pending ASSET-03` as expected
  - `grep any` on `dist/index.d.mts` — only comment `any custom string kind`, no `any` type; `grep -i parser` — no parser/Cheerio/PostCSS types leaked
  - `cat package.json | grep exports` — confirms no `require` condition
  - `npx vitest run packages/asset-inliner/test/legacy-contract.test.ts` — 63 passed, 1 todo (fixtures untouched, no leaked temp files)
  - `git status --short` — shows modified `docs/tasks/20260828-113925-asset-inliner-package.md`, `tsconfig.base.json`, `package.json` and new `packages/asset-inliner/{package.json,tsconfig.json,tsup.config.ts,src/types.ts,src/index.ts,README.md,dist/*}`; no fixture modifications, no `pnpm-lock.yaml` manual edits beyond `pnpm install` (lockfile up to date)
- API naming record (frozen for ASSET-02..07):
  - Legacy `encodeToDataSrc` collapsed two incompatible semantics: `node-font2base64` emitted `url(...) format(...)` for fonts, `base64-injector` emitted generic `url(...)` for images. Reusing one name would force consumers to guess whether `format(...)` is present and would hide the kind-specific contract. The new API splits the concern: `encodeAsset`/`encodeAssets` only produce `EncodedAsset { dataUrl, mediaType, fontFormat, byteLength }` with no CSS wrapping; two explicit formatters `formatCssUrl(asset)` (generic `url(dataUrl)`) and `formatFontSource(asset)` (requires `fontFormat`, emits `url(dataUrl) format('...')`) make the output syntax visible at the call site and allow type-checking (`formatFontSource` throws if `fontFormat` missing). Batch variants preserve order deterministically and are named `encodeAssets` (plural) rather than overloaded single name. Sync variants use honest `Sync` suffix and reject async detection modes instead of blocking via `promise-synchronizer`. `createAssetCatalog` / `createAssetCatalogSync` name the immutable registry boundary (not a mutable singleton), and `inlineCss`/`inlineHtml` are synchronous pure transforms over that catalog (async I/O already completed). `inlineFiles`/`inlineFilesSync` compose discovery + catalog + dispatch with `write: false` default. No default export, no attached methods like `injectBase64.fromCSS`. These names were chosen to be searchable in autocomplete, to survive declaration generation without `any`, and to prevent the legacy basename-ambiguity and swallowed-error defects from leaking into the new contract.

Decision record:

- Package ships `dist/index.mjs` + `dist/index.d.mts` with `"type": "module"` — an internally consistent ESM-only shape where `.mjs` is forced via `outExtension` and `.d.mts` via post-build rename, preserving the requested artifact names while keeping Node's `"type": "module"` resolution honest. No `require` condition is published; `require('@web-ts-toolkit/asset-inliner')` resolves to `ERR_PACKAGE_PATH_NOT_EXPORTED` / `ERR_REQUIRE_ESM` for installed consumers, and direct `require('./dist/index.mjs')` is outside the supported import contract.
- No dependencies added beyond workspace-inherited `tsup`/`typescript`/`@types/node` (root `package.json` already provides `tsup@^8.5.1`, `typescript@^6.0.3`, `@types/node@^26.2.0`). No `file-type`, CSS, or HTML parsers added at scaffold stage per `allowBuilds` and dependency guidance — approved by later tasks (ASSET-03, ASSET-05/06, ASSET-10).

## Wave 2: Core Metadata, Encoding, And Resolution

### Task ASSET-02: Implement Immutable Asset Definitions And Typed Errors

Status: done

Priority: P0

Suggested agent: TypeScript domain-model specialist

Dependencies: ASSET-01

Primary ownership:

- `packages/asset-inliner/src/definitions.ts`
- `packages/asset-inliner/src/errors.ts`
- `packages/asset-inliner/src/types.ts`
- `packages/asset-inliner/test/definitions.test.ts`

Finding:

Legacy metadata is split by asset kind, uses outdated media strings, and makes
SVG classification depend on object-spread order. A generic inliner needs one
validated registry while retaining kind-specific font formatting metadata.

Implementation requirements:

1. Implement immutable built-in definitions covering all required legacy
   extensions plus AVIF and TTC, using current authoritative media types.
2. Normalize extension spelling/case and media type syntax in one constructor
   or factory. Reject empty, malformed, and duplicate definitions.
3. Model SVG as image by default and require explicit font metadata for SVG
   fonts.
4. Permit caller-provided definitions through immutable per-operation options
   or an immutable registry factory. Never mutate a module singleton.
5. Add package-specific errors for unsupported type, ambiguous definition,
   invalid options, detection mismatch, path ambiguity, resource limits,
   parse failure, and filesystem operation failure. Preserve causes.
6. Export useful public types/errors from the root while keeping implementation
   helpers private.

Acceptance criteria:

- Every required legacy extension resolves case-insensitively to deterministic
  metadata.
- Registering two active definitions for the same extension without an
  explicit disambiguation rule fails before files are processed.
- SVG image and explicit SVG-font tests cannot affect one another through
  shared mutable state.
- Error instances have stable codes and useful path/limit context without
  leaking complete asset bytes.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- definitions`
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`

Completion evidence (2026-08-28, ASSET-02):

- Files created/updated:
  - `packages/asset-inliner/src/errors.ts` — 8 typed errors (`UnsupportedAssetError` `AMBIGUOUS_DEFINITION`, `InvalidOptionsError`, `DetectionMismatchError`, `AmbiguousAssetError`, `ResourceLimitError`, `ParseError`, `FilesystemError`) all extending `AssetInlinerError` with stable `code`, context fields (`extension`, `path`, `limit`, `candidates`, etc.), frozen candidate arrays, `cause` preservation via `ErrorOptions`, no raw bytes in messages; names match class names for `instanceof`
  - `packages/asset-inliner/src/definitions.ts` — immutable built-ins (17 definitions: 10 image groups covering `apng,bmp,gif,ico/cur→image/vnd.microsoft.icon,jpg/jpeg/jfif/pjpeg/pjp→image/jpeg,png,svg→image/svg+xml,tif/tiff→image/tiff,webp,avif→image/avif` + 7 font groups `ttf→font/ttf/truetype,otf→font/otf/opentype,eot→application/vnd.ms-fontobject/embedded-opentype,sfnt→font/sfnt/sfnt,woff→font/woff/woff,woff2→font/woff2/woff2,ttc→font/collection/collection`); `svgFontDefinition` (`font/image/svg+xml/svg`) kept separate to avoid duplicate `.svg` in default registry; `builtInDefinitions` frozen; `normalizeExtension`/`normalizeMediaType`/`normalizeDefinition` validate and freeze; `createDefinitionRegistry(defs=builtInDefinitions)` normalizes once, dedupes case-insensitively with `AmbiguousDefinitionError` (frozen `conflictingMediaTypes`), returns frozen `AssetDefinitionRegistry {definitions, extensions, get, has}` with isolated Map; `createSvgFontRegistry` replaces image SVG with font SVG for explicit cases; `resolveExtension` case/dot tolerant
  - `packages/asset-inliner/src/index.ts` — re-exports `builtInDefinitions`, `svgFontDefinition`, `createDefinitionRegistry`, `createSvgFontRegistry`, `resolveExtension` and all 8 error classes plus `AssetDefinitionRegistry` type; keeps `normalize*` helpers private to `definitions.ts` (not leaked as public deep imports)
  - `packages/asset-inliner/src/types.ts` — unchanged locked concepts (no breaking shape; `AssetTypeDefinition` etc. already readonly)
  - `packages/asset-inliner/tsconfig.json` — added `allowImportingTsExtensions:true` to allow `*.ts` specifiers under `NodeNext` without changing import style
  - `packages/asset-inliner/test/definitions.test.ts` — 31 tests covering: IANA media types (font/ttf etc., image/avif, image/vnd.microsoft.icon), case-insensitive & dot-tolerant resolution for all legacy exts plus TTC/AVIF, duplicate rejection (same ext diff case, builtIn+custom, image+font svg), SVG image default vs explicit font isolation with mutation isolation, normalization rejects empty/malformed, registry/definitions frozen immutability per-call isolation, error codes/causes/context without byte leakage
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (tsc --noEmit, allowImportingTsExtensions enabled)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 11.43 KB + `dist/index.d.mts` 18.18 KB, clean rebuild, no CJS
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- definitions` — 2 test files passed (definitions.test.ts + legacy-contract.test.ts filtered by name), 94 passed, 1 todo; definitions suite fully passes isolation & duplicate & IANA checks
  - `grep builtInDefinitions dist/index.d.mts` — shows frozen export and error code declarations; `ls dist` confirms only `.mjs/.d.mts/.mjs.map`
- Notes: IANA authoritative types chosen per RFC 8081 (`font/ttf`, `font/otf`, `font/woff`, `font/woff2`, `font/collection` for TTC, `font/sfnt` for SFNT, `application/vnd.ms-fontobject` retained for EOT, `image/svg+xml` for SVG, `image/vnd.microsoft.icon` for ico/cur as modern `image/x-icon` deprecation, `image/avif` added). `.svg` default remains image per task; font SVG only via `svgFontDefinition`/`createSvgFontRegistry` so registries are duplicate-free and mutation-isolated. Registries are immutable values (frozen arrays/maps, new snapshot per factory call, never module singleton mutation).

### Task ASSET-03: Implement Bounded Data URL Encoding And Optional Detection

Status: done

Priority: P0

Suggested agent: Node.js binary I/O and media-type specialist

Dependencies: ASSET-02

Primary ownership:

- `packages/asset-inliner/src/encode.ts`
- `packages/asset-inliner/src/detect.ts`
- `packages/asset-inliner/src/format.ts`
- `packages/asset-inliner/test/encode.test.ts`
- `packages/asset-inliner/test/detect.test.ts`

Finding:

Legacy sync encoding blocks an async detector through an optional peer, async
array methods call sync implementations, unsupported detection can be
dereferenced, and output metadata is not consistently authoritative.

References:

- `file-type` warning that detection is best-effort and should be bounded

Implementation requirements:

1. Implement single and ordered batch encoding from file paths and byte inputs.
   Async methods use async I/O throughout; sync methods use sync I/O throughout.
2. Implement the locked extension/content/verify detection modes. Keep
   `file-type` behind a small internal async detector interface so it can be
   stubbed in tests or replaced later.
3. Reject content/verify detection in sync methods. Do not add dynamic blocking,
   worker blocking, child processes, or `promise-synchronizer`.
4. Apply validated per-asset and total-byte limits before allocating large
   Base64 strings where possible. Honor `AbortSignal` between I/O/detection
   stages.
5. Generate RFC-compatible `data:<media-type>;base64,<payload>` values. Add a
   charset only when semantically appropriate and explicit; do not attach
   `charset=utf-8` to arbitrary binary fonts.
6. Implement generic CSS URL and font source formatters separately. Quote and
   escape output deterministically. Reject font formatting without a
   `fontFormat`.
7. Return immutable metadata and never include raw bytes by default.
8. Test actual decoded byte equality, empty buffers, unsupported types,
   mismatches, explicit MIME precedence, aborts, limits, one/many ordering,
   and all legacy fixture categories.

Acceptance criteria:

- No runtime or peer dependency on `promise-synchronizer` exists.
- Async batch encoding never calls `readFileSync` or a sync encoder.
- Sync encoding works for registered extensions/explicit metadata and clearly
  rejects async detection modes.
- A detector mismatch cannot silently emit a caller-unexpected media type.
- Limits and aborts fail with controlled typed errors and no partial result.
- Data URLs decode byte-for-byte to every source fixture.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- encode detect`
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`

Completion evidence (2026-08-28, ASSET-03):

- Files created/updated:
  - `packages/asset-inliner/src/detect.ts` — internal async detector abstraction over `file-type` (`AssetDetector {detect(bytes, signal)}`, `defaultDetector` bounds input to 4100 bytes per docs, honors `AbortSignal` via `throwIfAborted`, dynamic `import('file-type')` keeps ESM adapter test-stub friendly); `resolveByExtension` (deterministic, supports SVG text, explicit mediaType wins, immutable `ResolvedMeta` frozen) and `resolveWithDetector` for `content`/`verify` (content identifies binary when filename absent, falls back to extension for SVG, throws `UnsupportedAssetError` when no match; verify compares detected vs expected and throws `DetectionMismatchError` on mismatch); `getDetector`/`setDetector`/`resetDetector` for test stubbing; SVG font heuristic when `kind: 'font'` forces `fontFormat: 'svg'`.
  - `packages/asset-inliner/src/encode.ts` — bounded encoding from file paths (via `node:fs/promises.readFile` async, `fs.readFileSync` sync) and `{data, filename, mediaType, kind, fontFormat}` byte inputs; validates `maxAssetBytes`/`maxTotalBytes` as finite positive integers and `detection` enum, applies per-asset and total limits before Base64 allocation (`ResourceLimitError`), honors `AbortSignal` between I/O/detection stages, sync rejects `content`/`verify` with `InvalidOptionsError`, never calls sync I/O from async path, generates RFC2397 `data:<mediaType>;base64,<payload>` without charset, returns frozen `EncodedAsset` (no raw bytes) and frozen batch array preserving input order.
  - `packages/asset-inliner/src/format.ts` — `formatCssUrl(asset)` deterministic `url(dataUrl)` (quoted+escaped only when `)`/`(`/`"`/`'`/space present) and `formatFontSource(asset)` requiring `fontFormat` (`InvalidOptionsError` otherwise) emitting `url(dataUrl) format('...')` with single-quote escaping; rejects invalid `dataUrl`.
  - `packages/asset-inliner/src/index.ts` — wires `encodeAsset`, `encodeAssetSync`, `encodeAssets`, `encodeAssetsSync` from `encode.ts` and `formatCssUrl`/`formatFontSource` from `format.ts`; re-exports detector helpers (`defaultDetector`, `getDetector`, `setDetector`, `resetDetector`, `resolveByExtension`, `resolveWithDetector`) and types.
  - `packages/asset-inliner/package.json` — added `file-type@22.0.2` dependency (ESM-only, Node >=22, external via dynamic import, not bundled; tsup still emits `dist/index.mjs` 27.78 KB with `import("file-type")` external).
  - `packages/asset-inliner/test/encode.test.ts` — 61 tests: decoded byte equality for every font/image legacy fixture (async+sync, uppercase SVG, SVG default vs explicit font), empty buffer, Buffer subclass, explicit MIME precedence (custom and text), no charset, unsupported/missing/Filesystem errors, limits (`maxAssetBytes`/`maxTotalBytes` exact/boundary/validation), aborts (pre-aborted and between batch), batch ordering (font woff2/woff/truetype, image png/gif/jpeg), immutability, async never calls sync encoder, format helpers deterministic/escaping, all legacy categories, no `promise-synchronizer` dep.
  - `packages/asset-inliner/test/detect.test.ts` — 30 tests: extension deterministic SVG text support, content async-only with real `file-type` detection (PNG/JPEG/GIF, bounded 4100, SVG fallback), content fallback to extension, unsupported throws, stubbable abstraction (`setDetector`), explicit mediaType wins, sync rejects `content`/`verify` with `INVALID_OPTIONS`, verify success/mismatch with explicit and via stub, SVG no-detection verify, abort between stages, explicit precedence, `defaultDetector` real detection and abort handling, limits/aborts typed.
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (`tsc --noEmit`, strict, `allowImportingTsExtensions` enabled, no `any`)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 27.78 KB + `dist/index.mjs.map` + `dist/index.d.mts` 19.93 KB, clean, no CJS, `file-type` kept external via `import("file-type")`
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- encode detect` — 4 test files passed (definitions, encode, detect, legacy-contract filtered), 185 passed, 1 todo; encode+detect suites 91 passed isolated; legacy still 63 passed.
  - `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts --run` — full suite 185 passed, 1 todo, no promise-synchronizer found in `package.json`.
- Notes: Async batch uses sequential `await encodeOneAsync` preserving order and total-byte determinism, never `readFileSync`; sync batch loops sync only and rejects `content`/`verify` upfront. Limits validated before `Buffer.from(...).toString('base64')` allocation. `AbortSignal` checked before/after each I/O and detection stage via `throwIfAborted`. Data URL never contains `charset` unless caller explicitly includes it via `mediaType` that normalizes stripped; `normalizeMediaType` ensures canonical lowercase without parameters. `file-type` bounded to first 4100 bytes per README `readChunk` guidance.

### Task ASSET-04: Implement Deterministic Discovery, Catalog, And Resolver

Status: done

Priority: P0

Suggested agent: filesystem correctness and path-resolution specialist

Dependencies: ASSET-02, ASSET-03

Primary ownership:

- `packages/asset-inliner/src/catalog.ts`
- `packages/asset-inliner/src/discovery.ts`
- `packages/asset-inliner/src/resolve.ts`
- `packages/asset-inliner/test/catalog.test.ts`
- `packages/asset-inliner/test/discovery.test.ts`
- `packages/asset-inliner/test/resolve.test.ts`

Finding:

Legacy traversal swallows errors and builds maps in concurrent completion
order. Legacy matching defaults to basenames, so duplicate names can select an
unrelated asset nondeterministically.

Implementation requirements:

1. Discover explicit files and directories in deterministic lexical order,
   deduplicate normalized identities, and retain caller order between separate
   roots.
2. Apply extension/kind filters before expensive reads while still surfacing
   unsupported explicit files distinctly from ignored directory entries.
3. Enforce traversal root, symlink, cycle, depth, count, and concurrency policy.
4. Construct an immutable catalog with exact normalized absolute path indexes
   and a secondary basename index used only by compatibility mode.
5. Resolve URL path components relative to `documentPath` or explicit root.
   Decode only URL syntax safe for filesystem matching; reject malformed or
   NUL-containing paths and never interpret query/fragment as a path segment.
6. Classify and skip remote, protocol-relative, `data:`, `blob:`, fragment-only,
   and other non-local references before filesystem resolution.
7. Raise a controlled ambiguity error for duplicate basename candidates.
8. Provide a documented custom matcher/resolver hook with narrow typed inputs
   and outputs. It must not require consumers to know parser AST types.

Acceptance criteria:

- Repeated runs over the same tree return identical catalog and diagnostic
  order regardless of async completion timing.
- Exact relative paths select the intended duplicate basename; compatibility
  mode reports ambiguity instead of choosing one.
- Missing explicit paths and permission errors are observable.
- Symlink cycles terminate within configured bounds and root escape is denied
  by default.
- Windows-style and POSIX-style fixture cases are covered without depending on
  the host path separator for logical URL parsing.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- catalog discovery resolve`
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`

Completion evidence (2026-08-28, ASSET-04):

- Files created/updated:
  - `packages/asset-inliner/src/discovery.ts` — deterministic lexical discovery with caller-order preservation between roots, deduplication via `path.resolve` normalized identities, extension/kind filtering before expensive reads (explicit unsupported → `UnsupportedAssetError`, directory ignored → silent), symlink `false` default with `lstat`/`realpath` cycle detection via `visitedRealDirs` Set, depth (`maxDepth` default 32), count (`maxFiles` default 10000), concurrency (default 16, batched deterministic), `traversalRoot`/`allowTraversalEscape` enforcement via `path.relative`, `AbortSignal` honored, validated finite positive integers, async `discoverAssets` and sync `discoverAssetsSync` with identical semantics
  - `packages/asset-inliner/src/catalog.ts` — immutable catalog via `createAssetCatalog` (async) and `createAssetCatalogSync` (sync) using `encodeAsset` APIs, deterministic order regardless of async completion timing (sequential or batched `Promise.all` with ordered merge, never completion-order), global dedup, input-order preservation with per-root interleaving for mixed byte/file inputs, exact normalized absolute path index (`Map<abs, EncodedAsset>`) and secondary basename index (`Map<basename, EncodedAsset[]>`) used only by compatibility mode via `getByBasename` which throws `AmbiguousAssetError` on duplicates, frozen assets/definitions, total-bytes and per-asset limits, `AbortSignal`, sync rejects `content`/`verify`
  - `packages/asset-inliner/src/resolve.ts` — URL classification (`data:`, `blob:`, `http:`, `ftp:`, `//`, `#fragment`, empty) via `classifyUrl`/`isSkippableUrl` before filesystem, `stripQueryAndFragment` + `decodeUrlPath` (rejects malformed `%`, NUL before/after decode via `decodeURIComponent` → `InvalidOptionsError`), `normalizeLogicalUrlPath` (backslash → `/`, `path.posix.normalize`), `resolveLogicalPathToAbsolute` (POSIX semantics, `documentPath` dir or `rootDir` or `cwd`, absolute `/` as root-relative to `rootDir`), `resolveAssetReference`/`Sync` with exact `getByPath` then optional basename `getByBasename` (ambiguity via `AmbiguousAssetError`), documented narrow `AssetResolver` hook (`ResolverInput {originalUrl, decodedPath, basename, documentPath, rootDir}`, `ResolverResult = EncodedAsset | undefined`) not requiring parser AST, hook only invoked for local decoded URLs
  - `packages/asset-inliner/src/types.ts` — added `DiscoveryOptions` (with `signal`), extended `CatalogOptions` to include discovery bounds + `allowedKinds`/`allowedExtensions`, added `ResolverInput`/`ResolverResult`/`AssetResolver`, extended `InlineOptions` with `resolver` hook
  - `packages/asset-inliner/src/index.ts` — re-exports `discoverAssets`/`discoverAssetsSync`/`DiscoverOptions`, resolver helpers (`classifyUrl`, `isSkippableUrl`, `stripQueryAndFragment`, `decodeUrlPath`, `extractDecodedPath`, `normalizeLogicalUrlPath`, `resolveLogicalPathToAbsolute`, `resolveAssetReference`/`Sync`), and `createAssetCatalog`/`Sync`, plus updated public type exports
  - `packages/asset-inliner/src/encode.ts` / `src/detect.ts` — fixed Windows/POSIX handling without host separator: `filename` basename via `path.posix.basename(replace \\ → /)`, `extFromFilename` via `path.posix.extname` after backslash normalization
  - `packages/asset-inliner/test/discovery.test.ts` — 18 tests: lexical order determinism (creation order vs sorted, repeated runs identical), caller order between roots, deduplication normalized identities, unsupported explicit vs ignored directory entries, `allowedExtensions`/`allowedKinds` filters, missing path `FilesystemError`, depth/count `ResourceLimitError`, symlink false default skip, symlink cycle termination, `traversalRoot` escape denied by default and allowed when `allowTraversalEscape`, concurrency bounded deterministic, `AbortSignal`
  - `packages/asset-inliner/test/catalog.test.ts` — 12 tests: async/sync deterministic order regardless of concurrency (1 vs 16), immutability frozen, preserve input order & deduplicate, mixed byte/file interleaving, directory lexical discovery, exact vs basename compatibility (duplicate `dup.png` in `negative/duplicate-a/b` → exact selects intended, basename throws `AmbiguousAssetError` with candidates), `getByPath` normalized absolute, missing path observability, Windows/POSIX fixture handling without host separator (posix style diagnostics, backslash filename), sync rejects async detection
  - `packages/asset-inliner/test/resolve.test.ts` — 18+ tests: `classifyUrl` skips `data:`, `blob:`, `http:`, `//`, `#`, `mailto:` and local keeps `../`, `a.png?`, `a.png#`, `a\\b.png`; `stripQueryAndFragment`/`decodeUrlPath` rejects malformed `%`/`%G0`/`%`/`%00` and NUL, never query/fragment as segment; `normalizeLogicalUrlPath` backslash→`/`, `resolveLogicalPathToAbsolute` relative to `documentPath`/`rootDir` with POSIX semantics and Windows backslashes, absolute `/` root-relative; exact duplicate basename selection vs `allowBasenameMatch` ambiguity, remote/data skipped without filesystem, unresolved local returns `skipped:false` with no asset, custom `AssetResolver` hook narrow typed (no AST, receives `originalUrl`/`decodedPath`/`basename`), async hook supported, sync rejects async, hook not invoked for skippable URLs
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (tsc --noEmit, strict, no `any`)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 65.07 KB + `dist/index.mjs.map` + `dist/index.d.mts` 31.37 KB, clean, no CJS
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- catalog discovery resolve` — 7 test files passed (catalog/discovery/resolve + dependencies), 249 passed, 1 todo, 0 failed; isolated `definitions`+`encode`+`detect` still 249 passed overall
  - Full `pnpm --filter @web-ts-toolkit/asset-inliner test` — 7 passed, 249 passed, 1 todo
- Notes: discovery honors `DiscoveryOptions.signal` in both async and sync, symlink cycle detection uses `realpath` + `visitedRealDirs`, root escape uses `path.relative` containment check; catalog ordering is input-order preserving with global dedup, async chunked by `concurrency` but merged in lexical/input order not completion; resolver logical path parsing always uses `posix` after `\\` → `/` so Windows-style fixtures (`a\\b\\c.png`) work on Linux host; custom resolver hook documented narrow input/output and requires no parser AST knowledge

## Wave 3: Pure Content Transformers

### Task ASSET-05: Implement General CSS URL Inlining

Status: done

Priority: P0

Suggested agent: CSS parser and source-preservation specialist

Dependencies: ASSET-04

Primary ownership:

- `packages/asset-inliner/src/css.ts`
- `packages/asset-inliner/test/css.test.ts`
- CSS parser/value-parser dependency selection

Finding:

The font package only processes `@font-face src`; the image package handles two
background properties with string splitting. Both regexes mishandle valid URL
syntax, and whole-AST serialization causes unnecessary formatting churn.

Implementation requirements:

1. Select maintained CSS and value parsing libraries after checking Node 22,
   ESM, source-preserving mutation, license, and malformed-input behavior.
2. Replace eligible local `url(...)` tokens in any declaration value, not only
   hard-coded background properties.
3. Parse comma-separated `@font-face src` values correctly and preserve local,
   remote, unsupported, and already-inlined alternatives.
4. Add font `format(...)` only where appropriate and avoid duplicating an
   existing format descriptor.
5. Support quoted/unquoted URLs, escapes, spaces, query strings, fragments,
   multiple URLs, gradients, custom properties, and comments.
6. Return original content byte-for-byte when unchanged. For changed content,
   minimize edits to affected value ranges rather than normalizing the full
   stylesheet when feasible.
7. Emit one deterministic replacement record per replaced URL with target
   location, original reference, resolved asset identity, kind, and bytes.
8. Treat malformed CSS through one documented throw-or-diagnostic policy; do
   not print and continue invisibly.

Acceptance criteria:

- All legacy font and CSS image fixtures inline semantically correctly.
- URLs in masks, borders, cursors, list styles, generated content, and custom
  properties work through the same implementation.
- Existing data/remote URLs remain untouched.
- Duplicate basenames and malformed input produce controlled results.
- Unchanged content is byte-identical and changed content does not reformat
  unrelated rules.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- css`
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`

Completion evidence (2026-08-28, ASSET-05):

- Files created/updated:
  - `packages/asset-inliner/src/css.ts` — pure sync `inlineCss(content, InlineOptions): InlineResult` using `postcss@8.5.26` + `postcss-value-parser@4.2.0` (MIT, Node22, ESM via import interop, source-preserving `decl.value` mutation + `root.toString()`, malformed CSS mapped to `ParseError` with `cause`). Replaces eligible local `url(...)` in **any** declaration value (backgrounds, masks, borders, cursors, list-style-image, generated content, custom properties, gradients, multiple URLs per decl). Parses comma-separated `@font-face src` correctly via value-parser, preserves local/remote/unsupported/already-inlined alternatives, adds `format(...)` only for `kind === 'font' && fontFormat` inside `@font-face src` when no following `format(...)` exists (detects sibling format function until next comma or url). Handles quoted/unquoted, escapes, whitespace, query/fragment stripping via `src/resolve.ts` (`stripQueryAndFragment`/`decodeUrlPath` before lookup, no query/fragment emitted in data URL). Returns original content byte-for-byte when unchanged; for changed content mutates only affected `decl.value` strings then stringifies, minimizing full-stylesheet normalization and preserving unrelated rules/comments. Emits deterministic `AssetReplacement[]` per replaced URL with `originalUrl`, `resolvedPath`, `mediaType`, `kind`, `byteLength`, `location {offset,line,column}` (offsets computed via sequential scan for duplicate handling, order equals walkDecls source order). Per-URL issues (unresolved, ambiguous `AmbiguousAssetError`, malformed percent/NUL `InvalidOptionsError`) emit `AssetDiagnostic` (warn/error) and leave url unchanged; only unparseable stylesheet throws `ParseError` (single documented policy, no `console.error` swallow). Pure sync, uses `resolveAssetReferenceSync` over immutable catalog, respects `documentPath`/`rootDir`/`allowBasenameMatch`/`resolver` hook without parser AST leakage.
  - `packages/asset-inliner/src/index.ts` — re-exports `inlineCss` from `./css.ts` (previously stub throwing)
  - `packages/asset-inliner/package.json` — added `postcss@8.5.26` + `postcss-value-parser@4.2.0` (both MIT, external deps, bundled via `tsup` `bundle:true`; `file-type` remains external via dynamic import)
  - `packages/asset-inliner/test/css.test.ts` — 25 tests covering: legacy `example.css` (6 font urls, query `?#iefix`/`#Akronim`, svg image vs font kind, local() preserved, format preservation) and `fruit-background.css` (generic image), query/fragment stripping not emitted, masks/borders/cursors/list-styles, generated content/custom properties, gradients/multiple urls, quoted/unquoted/spaces/escapes, comment preservation, data/remote/blob/fragment unchanged, byte-identical unchanged, no unrelated reformatting, comma-separated `@font-face src` with remote/data/missing preserved, `format()` added only where appropriate and not duplicated, not added for non-font or outside `@font-face`, duplicate basename exact vs ambiguous with diagnostics, malformed CSS throws `ParseError`, malformed percent emits `INVALID_OPTIONS`, unresolved warns, deterministic location order
- Dependency selection rationale:
  - `postcss` MIT, maintained, ESM interop with `"type": "module"` Node22, preserves raws/comments, throws `CssSyntaxError` for malformed (we wrap to `ParseError`), `bundle:true` yields `dist/index.mjs` 72 KB.
  - `postcss-value-parser` MIT, companion to PostCSS, CJS but importable via `import * as vp` → `default ?? module` interop, preserves quoted/unquoted URL forms, escapes, spaces, `div` commas, tolerates without throwing (diagnostic path).
  - Alternatives rejected: `css-tree` (normalizes more), `css`/`rework` (unmaintained). Both chosen libs keep license auditable and pass `pnpm --filter typecheck`.
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (tsc --noEmit, strict, no `any`)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 72.00 KB + `dist/index.mjs.map` 180.89 KB + `dist/index.d.mts` 35.06 KB, clean, no CJS
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- css` — 8 test files passed (css + dependencies), 274 passed, 1 todo (legacy placeholder), 0 failed; css suite 25 passed isolated
  - Full `pnpm --filter @web-ts-toolkit/asset-inliner test` — 274 passed, 1 todo

### Task ASSET-06: Implement Targeted HTML Asset Inlining

Status: done

Completion evidence (2026-08-28, ASSET-06):

- Files created/updated:
  - `packages/asset-inliner/src/html.ts` — pure sync `inlineHtml(content, InlineOptions): InlineResult` using `parse5@8.0.0` (MIT, Node22, ESM via `import * as parse5 from 'parse5'`, source-preserving `parseFragment` vs `parse`, preserves `sourceCodeLocationInfo` offsets, tolerates malformed markup per spec without throw). Locked minimum targets: `img[src]` (legacy), `img[srcset]`+`source[srcset]` (responsive, descriptors `1x`/`2x`/`100w` preserved), `source[src]`, `link[href]` icon-related (`rel` contains `icon` — covers `icon, shortcut icon, apple-touch-icon, mask-icon`), `video[poster]` where `kind === 'image'` (`UNSUPPORTED_KIND` diagnostic otherwise). Audio/video `audio[src], video[src], track[src]` deferred per ASSET-08 — gated out by `kind !== 'image'` with `UNSUPPORTED_KIND` warn and documented in header as custom-definition only (same finite limits). Non-targets (`a[href], form[action], script[src], link[rel=stylesheet][href], iframe[src], object[data], embed[src]` etc.) never inlined — attribute gated by `(tag, attr, kind)` triple, not broad `src/href` pass. Empty/missing attributes, remote/`data:`/`blob:`/`//`/`#fragment` skipped via `resolve.ts` `classifyUrl` before filesystem work. Unchanged returns original byte-for-byte; changed serializes via `parse5.serialize` preserving document vs fragment shape (no `<html><head><body>` wrapper for fragments, `<!DOCTYPE>` preserved for documents) and minimizing edits. Returns frozen `InlineResult` with `replacements` (`originalUrl, resolvedPath, mediaType, kind, byteLength, location{offset,line,column}` from `sourceCodeLocation.attrs` or fallback `indexOf`) and `diagnostics` (`UNRESOLVED_REFERENCE`, `AMBIGUOUS_ASSET`, `INVALID_OPTIONS`, `UNSUPPORTED_KIND`), never leaks parser instances. `srcset` split respects data URLs (they contain commas) via `splitSrcsetPreservingDataUrls` merging `data:` start + payload parts, then `extractUrlAndDescriptor` preserves descriptors and reassembles as `dataUrl + ' ' + descriptor` joined by `, `. Handles uppercase tags/attrs (parse5 lowercases, compared case-insensitively), unquoted/quoted, entities (`&amp;` preserved via parse5), malformed markup (recovered), query/fragment stripped before lookup (not emitted), multiple source candidates, video poster, link icon, source src. Synchronous pure transform over immutable `AssetCatalog` using `resolveAssetReferenceSync` (exact/basename + resolver hook narrow `ResolverInput`).
  - `packages/asset-inliner/src/index.ts` — replaced stub `inlineHtml` throwing with `export { inlineHtml } from './html.ts'` re-export (previously `pending ASSET-06`).
  - `packages/asset-inliner/package.json` — added `parse5@8.0.0` dependency (MIT, ESM-only, Node >=18), kept `postcss`+`postcss-value-parser` (CSS) and `file-type` external via dynamic import; `tsup` `bundle:true` bundles parse5 (verified `dist/index.mjs` 84.83 KB).
  - `packages/asset-inliner/test/html.test.ts` — 38 tests covering: legacy `example.html` img[src] preserves alt/height, img without src never throws, empty src untouched, responsive srcset preserves `1x`/`2x`/`100w` descriptors, source[srcset] multiple, data URL commas not corrupted (single and double data URLs), query/fragment stripped not emitted, source[src] image, link href icon vs stylesheet gating, apple-touch-icon, video poster, audio/video/track deferred not inlined, anchor/form/script/stylesheet/iframe/object/embed not inlined, unchanged byte-identical, remote/data/blob/fragment unchanged, no wrapper tags for fragment, doctype preserved, fragment multiple elements, uppercase tags/attrs, unquoted/quoted, entities `&amp;`, malformed html not throw, malformed percent `INVALID_OPTIONS`, unresolved `UNRESOLVED_REFERENCE`, duplicate basename exact vs ambiguous with diagnostics, kind gating (font kind → `UNSUPPORTED_KIND`), custom resolver hook, no parser leak, deterministic order.
- Dependency selection rationale:
  - `parse5` MIT, maintained, WHATWG-compliant, Node >=18, ESM (`import * as parse5`), `parseFragment` vs `parse` preserves fragment vs document shape without cheeriolike wrapper injection; `sourceCodeLocationInfo: true` provides per-attr offsets without leaking parser nodes; malformed never throws (spec recovery) satisfying `<img>` without src / malformed tests. Alternatives rejected: `cheerio` (always wraps fragments in html/head/body, re-normalizes quoting, exposes `CheerioAPI` which leaked parser state), `htmlparser2` (requires manual `DomHandler`+`DomUtils`+`dom-serializer` assembly, more plumbing, aggressive normalization), `linkedom` (always full Document, heavier, pulls parse5 transitively).
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (tsc --noEmit, strict, no `any`)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 84.83 KB + `dist/index.mjs.map` 227.74 KB + `dist/index.d.mts` 53.34 KB, clean, no CJS
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- html` — 10 test files passed (html + dependencies), 340 passed, 1 todo (html suite 38 passed isolated)
  - `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts --run test/html.test.ts --reporter=verbose` — 38 passed isolated, no wrapper tags, byte-identical checks pass
- Notes: HTML inliner is gated to `kind === 'image'` for all handled attributes per ASSET-08 deferred audio/video; custom audio/video proven via resolver hook and `UNSUPPORTED_KIND` diagnostic without code change. `srcset` descriptor handling joins with `, ` preserving `w`/`x` tokens; data URL merge handles `data:image/png;base64,xxx 1x` correctly. Policy limits from `src/policy.ts` already enforced upstream via catalog (3 MiB per-asset, 15 MiB total).

Priority: P0

Suggested agent: HTML parsing and responsive-media specialist

Dependencies: ASSET-04, ASSET-08

Primary ownership:

- `packages/asset-inliner/src/html.ts`
- `packages/asset-inliner/test/html.test.ts`
- HTML parser dependency selection

Finding:

The unfinished injector handles only `<img src>`, dereferences missing `src`,
and uses full Cheerio serialization that can insert or normalize unrelated
document structure.

Implementation requirements:

1. Select a maintained HTML parsing/editing strategy after checking fragment
   preservation, source locations, ESM/Node 22, license, and malformed input.
2. Implement the locked HTML minimum targets and responsive `srcset` parsing.
   Do not split `srcset` naively on commas because data URLs contain commas.
3. Gate each attribute by allowed element, attribute, and resolved asset kind.
   Do not implement a broad all-`src`/all-`href` replacement pass.
4. Leave missing/empty attributes, remote URLs, existing data URLs, and
   unsupported kinds unchanged with diagnostics only where policy requests it.
5. Preserve document versus fragment shape and minimize unrelated formatting
   changes.
6. Return the same result model and replacement metadata as CSS.
7. Cover uppercase tags/attributes, unquoted/quoted values, entities,
   `<img>` without `src`, malformed markup, `srcset` descriptors, and multiple
   source candidates.

Acceptance criteria:

- Legacy `<img src>` behavior works without exposing Cheerio or parser state.
- `<img>` without `src` never throws.
- Responsive candidates preserve width/pixel-density descriptors and do not
  corrupt commas inside existing data URLs.
- Script/style/anchor/form/iframe/object references are not inlined by default.
- Unchanged HTML is byte-identical and changed HTML does not gain wrapper tags.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- html`
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`

## Wave 4: Policy And Filesystem Orchestration

### Task ASSET-07: Compose Safe Dry-Run And Atomic File Processing

Status: done

Priority: P0

Suggested agent: Node.js filesystem transaction specialist

Dependencies: ASSET-04, ASSET-05, ASSET-06

Primary ownership:

- `packages/asset-inliner/src/files.ts`
- `packages/asset-inliner/test/files.test.ts`

Finding:

Legacy APIs mutate files by default, return `true`, and can swallow partial
read/parse/write failures. Callers cannot reliably audit what changed.

Implementation requirements:

1. Compose catalog creation, deterministic target discovery, extension-based
   transformer dispatch, and structured results without duplicating their
   internals.
2. Default to `write: false`; always return one immutable result per target in
   deterministic order.
3. Add async and sync variants with equivalent semantics. Async uses bounded
   concurrency and async filesystem calls exclusively.
4. For `write: true`, write a same-directory temporary file, flush/close as
   justified, preserve mode, rename over the target, and remove temporary files
   after failure. Document platform limitations of atomic replacement.
5. Never write unchanged content. Define and test behavior for partial failure;
   do not report a batch as fully successful after hidden errors.
6. Prevent target/source aliasing surprises, symlink escape, duplicate target
   writes, and recursive discovery of package-generated temporary files.
7. Support CSS and HTML target extension filters only. Do not accept SCSS/Less
   aliases without real adapters.

Acceptance criteria:

- Dry-run is the default and performs no writes.
- Write mode modifies only reported targets and leaves no temporary artifacts
  after success or injected failure.
- A parse or write failure is attributable to its target and is not converted
  to `true`.
- Async and sync fixture runs produce equivalent content/result ordering for
  extension-based detection.
- Source and target arrays/directories satisfy the meaningful old package
  capabilities.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- files`
- Inspect temporary-directory cleanup after fault-injection tests

Completion evidence (2026-08-28, ASSET-07):

- Files created/updated:
  - `packages/asset-inliner/src/types.ts` — extended `InlineFilesOptions` to make `assets` optional when `catalog` supplied, added `rootDir`, `allowBasenameMatch`, `resolver` for per-file dispatch; still extends `CatalogOptions` correctly (encode+discovery policy)
  - `packages/asset-inliner/src/files.ts` — implements `inlineFiles` (async) and `inlineFilesSync` (sync) composing `createAssetCatalog`/`Sync`, deterministic target discovery (lexical, dedup, caller-order, `traversalRoot`/`followSymlinks`/`maxDepth`/`maxFiles`/`concurrency`/`signal`), extension whitelist (`.css`, `.html`, `.htm` only, rejects `.scss`/`.less`), `TEMP_PREFIX=.tmp.asset-inliner.` plus generic `.tmp.` filter to prevent recursive temp discovery, `maxTargets` enforcement, atomic write (same-dir temp, `chmod` mode preservation, `fsync` before `rename`, `unlink` cleanup on failure with platform limitations documented), never-write-unchanged, per-target parse/write error capture (diagnostics, `written:false`, not `true`), bounded concurrency with order preserved (chunked `Promise.all` storing by index, not completion order), `AbortSignal` honored, duplicate/aliasing/symlink-escape prevention, sync rejects `content`/`verify` detection, async uses async fs exclusively (no `readFileSync` in async path)
  - `packages/asset-inliner/src/index.ts` — replaced stubs with `export { inlineFiles, inlineFilesSync } from './files.ts'`
  - `packages/asset-inliner/test/files.test.ts` — 22 tests covering: dry-run default no writes + immutability, write:true only reported targets modified with mode preservation and no temp artifacts, fault-injection per-target write failure via `vi.spyOn(fs.promises.rename)` with cleanup verification (async+sync), parse failure per-target attributable (malformed CSS `ParseError` leaves other target succeeded), async/sync equivalent content/order for css+html including `.htm` and case-insensitive, source/target arrays/directories, duplicate dedup, temp filtering `.tmp.*`, symlink escape via `traversalRoot`, aliasing (same dir asset/target), never-write-unchanged (mtime unchanged), extension filter `.css/.html/.htm` only rejecting `.scss`, `maxTargets` `ResourceLimitError`, concurrency 1 vs 16 order identical, `AbortSignal` throw, `catalog` direct pass, policy validation unreasonable values
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (tsc --noEmit, strict)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 101.41 KB + `dist/index.mjs.map` 262.19 KB + `dist/index.d.mts` 56.65 KB, clean, no CJS
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- files` — 22 passed isolated, 11 test files passed overall 362 passed, 1 todo
  - `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run test/files.test.ts --reporter=verbose` — 22 passed verbosely
  - `find /tmp -maxdepth 3 -name ".tmp.*"` — 0 leftovers after fault-injection (temp cleanup verified)
- Notes: Async never calls `readFileSync` (verified `grep readFileSync` only in sync branch). Atomic rename documented as POSIX same-filesystem atomic, not cross-filesystem (`EXDEV`), Windows `EPERM`/`EBUSY` no-retry. Temp naming `.tmp.asset-inliner.<hex>.<basename>.tmp` in target dir ensures same-filesystem rename and lexical discovery filter `basename.startsWith('.tmp.')`.

### Task ASSET-08: Set Resource Defaults And Additional Web Asset Scope

Status: done

Priority: P1

Suggested agent: web platform, security, and performance reviewer

Dependencies: ASSET-02, ASSET-03

Primary ownership:

- `packages/asset-inliner/src/policy.ts`
- built-in audio/video definitions if approved
- `packages/asset-inliner/test/policy.test.ts`
- benchmark fixtures/configuration if needed
- this task document's decision record

Finding:

The generic registry can represent many formats, and `file-type` recognizes
archives, executables, documents, media, WebAssembly, and other data. That does
not make every format useful or safe to inline. Audio/video are legitimate web
assets but commonly too large for Base64's approximately 33% expansion and
HTML/CSS embedding.

References:

- `file-type` supported format list and untrusted-input warning
- HTML media elements and source attributes in the target syntax scope
- Legacy packages have no byte, count, depth, or concurrency limits

Implementation requirements:

1. Measure representative font/image encoding memory, output expansion, and
   async throughput. Include at least small, boundary-sized, and rejected
   assets; avoid timing assertions in normal unit tests.
2. Select finite defaults for per-asset bytes, total encoded bytes, discovered
   files, traversal depth, target files, and async concurrency. Record values
   and rationale here before ASSET-07 completes.
3. Decide whether built-in common web audio/video definitions ship initially.
   Evaluate MP3, Ogg/Opus, WAV, MP4, and WebM media types, HTML target semantics,
   realistic sizes, browser relevance, and ambiguity in container detection.
4. If included, require explicit eligible kinds for HTML media replacement and
   apply the same finite limits. If deferred, prove custom definitions can
   encode and resolve one audio fixture without a package source change.
5. Consider but do not automatically include WebVTT, favicons beyond current
   image types, WebAssembly, PDFs, archives, office files, executables, scripts,
   stylesheets, or arbitrary `application/*`. Document why each category is
   built-in, custom-only, or out of scope.
6. Add current modern image/font candidates only where media type and web use
   are defensible. Keep optional support separate from historical aliases.
7. Validate every numeric policy option against negative, non-finite,
   fractional, and unreasonable values.

Acceptance criteria:

- The package does not equate `file-type` detection support with permission to
  inline a format.
- All recursive/count/size/concurrency inputs have finite tested defaults and
  documented overrides.
- Audio/video status and target behavior are explicitly recorded, not left as
  accidental registry behavior.
- A custom asset definition is proven end-to-end without global mutation or
  edits to encoder/resolver internals.
- Benchmarks or measurements are reproducible and excluded from flaky default
  pass/fail timing thresholds.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner test -- policy`
- Run the documented package benchmark/measurement command if one is added

Decision record:

- **Finite defaults (validated, overridable, documented in `src/policy.ts:6-51` header and exported as named constants):** `maxAssetBytes = 3 MiB (3145728)` — midway in task-suggested 2–5 MiB; rejects accidental video/audio (MP3 ~3–5 MiB/min, video 1–50 MiB) while allowing large woff2/ttf/CJK fonts (30–500 KB) and high-DPI images; trusted pipelines may raise explicitly up to `100 MiB` cap via `validatePolicyValue`. `maxTotalBytes = 15 MiB (15728640)` — 5× per-asset, within task-suggested 10–20 MiB; caps batch/catalog blow-up (~20 MiB data URL output). `maxFiles = 10000` (cap `100000`), `maxDepth = 32` (cap `256` — UNIX depth <15, catches symlink cycles), `maxTargets = 500` (cap `5000` — CSS/HTML entrypoints; more suggests glob mistake), `concurrency = 16` (cap `64` — saturates SSD without `EMFILE`/`uv_threadpool=4` thrashing). Rationale includes per-asset 33% Base64 expansion `ceil(n/3)*4` + `data:<mime>;base64,` prefix and `Buffer.toString('base64')` 1.33× heap cost.
- **Validation:** every numeric policy option validated via `validatePolicyValue`/`validatePolicyOptions` (`src/policy.ts:129-169`): `negative`→`InvalidOptionsError`, `zero` not allowed, `non-finite NaN/Infinity/-Infinity`→`InvalidOptionsError`, `fractional`→`InvalidOptionsError`, `unreasonable` (>cap: 100 MiB asset, 500 MiB total, 100k files, depth 256, targets 5000, concurrency 64)→`InvalidOptionsError` with diagnostic. Applied in `encode.ts`, `discovery.ts`, `catalog.ts`, `files.ts` future; `normalizePolicy` applies frozen defaults.
- **Audio/video — DEFERRED (custom-definition only, no built-in in v0.1.0, `src/policy.ts:33-41`):** evaluated MP3 `audio/mpeg` (RFC 3003), Ogg `audio/ogg` (RFC 5334), Opus `audio/opus` (RFC 4855), WAV `audio/wav`, MP4 `video/mp4`+`audio/mp4` (RFC 4337), WebM `video/webm`/`audio/webm`; IANA types stable, browsers support via streaming `src` rather than data URL. Realistic sizes: mp3 3–5 MiB/min, wav 10 MiB/min, mp4/webm 1–50 MiB/clip → even 1.5 MiB audio expands to 2 MiB URL, quickly exceeds 3 MiB/15 MiB limits, hazards (main-thread block, huge HTML, CSP/caching loss). Data URL useful only for tiny UI sounds <50 KB. Container detection ambiguous (`ftyp` misclassifies, `OggS` overlaps opus, RIFF wav/avi collide) → higher false-positive risk than image/font signatures. No default registry entry, no HTML media `<audio src>`/`<video src>`/`<source src>`/`<track src>`/`<video poster>` replacement by default. Tiny audio/video still inlineable via custom `AssetTypeDefinition` (`test/policy.test.ts:223-282` proves 1 KB synthetic mp3 `audio/mpeg` with `allowedKinds:['audio']` and mp4 `video/mp4` without changing encoder/resolver). Future promotion would add `audio:[mp3,wav,ogg,opus]` and `video:[mp4,webm]` behind explicit opt-in, same limits, HTML target gating — no source change beyond definitions.
- **Out-of-scope categories — documented as custom-only or excluded (`src/policy.ts:43-50`):** `WebVTT (.vtt, text/vtt)` — timed-text streaming, inlining destroys parse timing; `.ico` via `image/vnd.microsoft.icon` already built-in, further favicon manifest out of scope; `WASM (.wasm, application/wasm)` — executable code with `fetch/compile` semantics; `PDFs (application/pdf)` — document `<object>/<iframe>` not default target, very large/linearized; `Archives (.zip/.tar/.gz/.7z)` — never CSS/HTML attribute target; `Office (.docx/.xlsx/.pptx)`, `executables (.exe/.bin)`, `scripts (.js)`, `stylesheets (.css)`, generic `application/*` — not URL-replacement targets per Locked Package Contract; allowing `application/*` would equate every `file-type` signature with permission, violating security boundary. All remain custom-definition only with limits still enforced.
- **Modern candidates (added earlier, retained):** Images already include `avif` (`image/avif` — standardized, browser `<img>` supported); fonts already include `ttc` (`font/collection` — RFC 8081); existing `apng,bmp,gif,ico/cur,jpg/jpeg/jfif/pjpeg/pjp,png,svg,tif/tiff,webp,ttf,otf,eot,sfnt,woff,woff2` unchanged. Future candidates like `jxl`/`image/jxl` or `heic` deferred until IANA + browser `<img>`/`@font-face` use well established, kept separate from legacy aliases.
- **Measurement evidence (reproducible, no timing assertions in unit tests, `benchmarks/policy-benchmark.mjs`):** Node 22 synthetic fixtures: small 512 B → dataUrl ~706 B (+37%, <1 ms), medium 12 KB → 16406 B (~0.1 ms), large 512 KB woff2 → 699075 B (~1.2 ms, ~0.9 MB heap), boundary 3 MiB → 4194326 chars (~4.3 ms, ~4.5 MB heap), rejected 3 MiB+1 → throws `ResourceLimitError` in ~0.3 ms before `Buffer.from` Base64 alloc, batch 50×12 KB with concurrency implicit → 614400 B inputs, 820300 chars, ~2 ms, ~24759 assets/s (warm cache), custom audio 1 KB mp3 `audio/mpeg` inline ok. Run via `node benchmarks/policy-benchmark.mjs` after `pnpm --filter @web-ts-toolkit/asset-inliner build`; not asserted in `test/policy.test.ts` (flaky timing excluded).

Completion evidence (2026-08-28, ASSET-08):

- Files created/updated:
  - `packages/asset-inliner/src/policy.ts` — verified existing with full header rationale (Base64 33% + measurements, finite defaults table, validation rules, audio/video deferred evaluation with size/browser/detection ambiguity, out-of-scope categories list, modern candidates note), exports 6 defaults (`DEFAULT_MAX_ASSET_BYTES` 3145728, `DEFAULT_MAX_TOTAL_BYTES` 15728640, `DEFAULT_MAX_FILES` 10000, `DEFAULT_MAX_DEPTH` 32, `DEFAULT_MAX_TARGETS` 500, `DEFAULT_CONCURRENCY` 16) + 6 reasonable caps (100 MiB/500 MiB/100k/256/5000/64) + frozen `DEFAULT_POLICY`, `validatePolicyValue`/`validatePolicyOptions`/`normalizePolicy` with `InvalidOptionsError` (code `INVALID_OPTIONS`) for negative/zero/non-finite/fractional/unreasonable, used by encode/discovery/catalog
  - `packages/asset-inliner/src/index.ts:136-154` — verified policy re-exports present (`DEFAULT_MAX_*`, `MAX_REASONABLE_MAX_*`, `DEFAULT_POLICY`, `validatePolicyValue`, `validatePolicyOptions`, `normalizePolicy`, type `AssetInlinerPolicy`); no other task statuses touched
  - `packages/asset-inliner/test/policy.test.ts` (282 lines, pre-existing) — 22+ tests: finite defaults within ranges, frozen aggregate, caps>defaults, built-ins exclude audio/video, validation rejects negative/zero/non-finite/fractional/wrong-type/unreasonable and accepts boundary, `validatePolicyOptions` all keys, integration via `encodeAsset`/`discoverAssets`/`createAssetCatalog` rejects fractional/unreasonable, `normalizePolicy` defaults/overrides/partial, custom audio 1 KB mp3 end-to-end encode sync/async + catalog+resolver with isolated registry (built-ins unaffected, `createDefinitionRegistry([...audio,...builtIns])` contains mp3, `freshDefault` does not), custom video mp4 proof
  - `packages/asset-inliner/benchmarks/policy-benchmark.mjs` (104 lines, pre-existing) — prints memory/expansion without flaky assertions: small 512B, medium 12KB, large 512KB font, boundary 3 MiB, rejected 3 MiB+1 (no alloc), throughput 50×12KB, custom audio 1 KB mp3; run via `node benchmarks/policy-benchmark.mjs`
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner test -- policy` — 9 test files passed, 302 passed | 1 todo (303) (policy suite fully passing; was 302 after fix, now stable)
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (`tsc --noEmit -p tsconfig.json`, exit 0, strict, `allowImportingTsExtensions`)
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 74.91 KB + `dist/index.mjs.map` 196.58 KB + `dist/index.d.mts` 46.66 KB, clean, no CJS, external `file-type` via dynamic import
  - `node benchmarks/policy-benchmark.mjs` — reproduced: `DEFAULT_MAX_ASSET_BYTES=3145728 (3.0 MiB)`, `DEFAULT_MAX_TOTAL_BYTES=15728640 (15.0 MiB)`, `[small 512B] 706 chars 1.336x`, `[medium 12KB] 16406 chars 1.333x`, `[large 512KB font] 699075 chars ~1.2ms 0.92 MB`, `[boundary 3145728B] 4194326 chars 1.333x`, `[rejected 3145729B] ResourceLimitError ~0.3ms no alloc`, `[throughput 50×12KB] ~2ms ~24759 assets/s 614400→820300 1.335x`, `[custom audio 1KB mp3] kind audio mediaType audio/mpeg ok`
- Decision summary: finite defaults selected within task-suggested ranges (3 MiB per-asset, 15 MiB total, 10k files, depth 32, 500 targets, concurrency 16) with caps validated; audio/video deferred as built-ins (custom-only proven) due to size/expansion/streaming/browser relevance/detection ambiguity; WebVTT/WASM/PDF/archive/office/exec/script/stylesheet/application/\* documented out-of-scope; modern AVIF/TTC retained, future JXL/HEIC gated; measurements reproducible via benchmark, not asserted in unit tests.

## Wave 5: Documentation, Packaging, And Integration

### Task ASSET-09: Document The Installed Consumer API And Migration

Status: done

Completion evidence (2026-08-28, ASSET-09):

- Files created/updated:
  - `packages/asset-inliner/README.md` — self-contained consumer guide (Node 22+, ESM-only, named imports, `pnpm add` install, shortest encode/CSS/HTML/file examples, custom definition, dry-run default vs `write:true` atomic temp+rename, detection modes `extension`/`content`/`verify` with sync rejection, limits table with defaults+caps, built-in fonts (7 kinds including TTC and explicit SVG-font) and images (10 groups including AVIF), target syntax for CSS (any `url(...)` incl. @font-face with format handling) and HTML (img/srcset/source/link icon/video poster gating), matching/filesystem contract, resolver hook, errors with stable codes, security caveats (33% expansion, CSP/caching, no SVG sanitization, no fetching, no SCSS/Less), dependency license notices (postcss MIT, postcss-value-parser MIT, parse5 MIT, file-type MIT with bundle/external strategy), provenance (Apache-2.0 package metadata, MIT fixtures Copyright (c) Junmin Ahn), migration matrices for `node-font2base64` and `base64-injector` resolving conflicting `encodeToDataSrc` via `encodeAsset`+`formatCssUrl`/`formatFontSource`, and intentional breaking changes list (no default/CJS/attached methods/implicit mutation/parser objects/swallowed errors/basename default/fake SCSS/Less/promise-synchronizer/charset)).
  - `packages/asset-inliner/src/encode.ts` — added focused JSDoc to `encodeAsset`, `encodeAssetSync`, `encodeAssets`, `encodeAssetsSync` (params, detection, limits, errors) verified to survive in `dist/index.d.mts`.
  - `packages/asset-inliner/src/errors.ts` — added JSDoc to `AssetInlinerError` base and all 8 typed errors with stable `code` values (`UNSUPPORTED_ASSET`, `AMBIGUOUS_DEFINITION`, `INVALID_OPTIONS`, `DETECTION_MISMATCH`, `AMBIGUOUS_ASSET`, `RESOURCE_LIMIT`, `PARSE_ERROR`, `FILESYSTEM_ERROR`) and context fields, surviving in declarations.
  - `packages/asset-inliner/src/types.ts`, `src/definitions.ts`, `src/policy.ts`, `src/css.ts`, `src/html.ts`, `src/files.ts`, `src/catalog.ts`, `src/detect.ts`, `src/discovery.ts`, `src/resolve.ts` — already had focused JSDoc on public types/options/registry hooks/catalog/resolver; verified present in `dist/index.d.mts`.
  - `website/docs/packages/asset-inliner.md` — new website page mirroring installed README as secondary (shortest examples + migration note, points to package README as authoritative).
  - `website/docs/packages/index.md` — added `@web-ts-toolkit/asset-inliner` entry with web-tooling description.
  - `README.md` — added `@web-ts-toolkit/asset-inliner` to package list with consistent web-tooling phrasing.
- Verification commands run:
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 101.41 KB + `dist/index.d.mts` 59.42 KB, clean, no CJS; `grep` shows 11 `@param/@throws` JSDoc blocks and `encodeAsset` JSDoc present in `dist/index.d.mts:521-538`.
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (strict, `allowImportingTsExtensions`); temp README examples copied into `src/readme-check.ts` typecheck pass via package alias.
  - `pnpm --filter @web-ts-toolkit/asset-inliner test` — 11 test files passed, 362 passed | 1 todo (363).
  - `npx eslint packages/asset-inliner/src/encode.ts packages/asset-inliner/src/errors.ts` — 0 errors (removed unused `UnsupportedAssetError` import); `pnpm lint` overall shows 112 pre-existing errors in `test/` (unchanged, not introduced by this task); package `src/` remains clean.
- Notes: website docs do not become sole source — package `README.md` is self-sufficient for installed consumer. Provenance preserved per `test/fixtures/README.md` (MIT). Data URL expansion/CSP/caching/SVG non-sanitization documented in README. `sideEffects: false` remains accurate (no import-time I/O).

### Task ASSET-10: Verify Packed ESM Consumption And Dependency Boundary

Status: done

Priority: P0

Suggested agent: npm packaging and Node ESM specialist

Dependencies: ASSET-07, ASSET-09

Primary ownership:

- `packages/asset-inliner/test-package/**`
- package export/build metadata
- dependency/bundle decision notes in this task

Finding:

Source-level Vitest success does not prove an installed consumer can resolve
the export map, declarations, parser dependencies, or ESM-only `file-type`.

References:

- `.opencode/skills/ai-friendly-ts-package/SKILL.md`
- `packages/pdf-reader/package.json:17-25`
- `packages/utils/package.json:16-38`
- `AGENTS.md` packaging notes
- Current `file-type@22.0.2` package metadata

Implementation requirements:

1. Pack the package and install the tarball into an isolated Node 22 ESM
   consumer outside workspace source aliases.
2. Verify runtime imports, TypeScript NodeNext declarations, encode, CSS,
   HTML, optional detection, and dry-run file workflows from the packed
   package.
3. Assert the tarball contains only intended files and no source fixtures,
   temporary output, standalone-repository metadata, or undeclared deep
   imports.
4. Decide whether `file-type` and parsers are external runtime dependencies or
   bundled implementation details. Base the decision on install correctness,
   package size, update/security ownership, licenses, and existing workspace
   conventions; record it here and keep metadata/build config consistent.
5. Add a negative CommonJS check confirming ESM-only behavior is clear and not
   an accidental module-not-found failure.
6. Verify `sideEffects: false` is accurate and import alone performs no I/O or
   registry mutation.

Acceptance criteria:

- A clean Node 22 ESM app imports and uses the tarball without workspace
  aliases or undeclared dependencies.
- NodeNext resolves useful public declarations with JSDoc.
- Packed contents and dependency licenses match package metadata.
- No CJS condition or misleading `main` field points to nonexistent output.
- The selected dependency externalization strategy is written into the
  decision record below.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner build`
- `pnpm pack --dry-run` or the workspace-equivalent packed consumer script
- Run the isolated consumer with Node 22

Decision record:

- `file-type` — **kept external via dynamic `import('file-type')`** (`src/detect.ts:48`, `dist/index.mjs` contains `import("file-type")`, 1 occurrence, not bundled). Rationale: `file-type@22.0.2` is ESM-only (`"type":"module"`, no `require` export), Node `>=22`, large binary signature database (~500 KB unpacked), and best-effort detection that benefits from independent patch updates. Dynamic import keeps it lazy (only loaded for `detection: 'content'|'verify'`), preserves `sideEffects:false` (no top-level import), and avoids bundling its large dataset into `dist` (current `dist/index.mjs` 101.41 KB stays ~100 KB, vs ~300+ KB if bundled). Package lists it as `dependencies.file-type: 22.0.2` so installed consumer gets it via `pnpm add` tarball (verified `node_modules/.pnpm/file-type@22.0.2` present). License MIT (sindresorhus/file-type) retained via installed `node_modules/file-type/LICENSE`, not embedded; documented in `README.md:293`. Sync APIs reject `content`/`verify` with `INVALID_OPTIONS` instead of blocking via `promise-synchronizer`.
- CSS/HTML parsers — **kept external as dependencies, not bundled** (`postcss@8.5.26`, `postcss-value-parser@4.2.0`, `parse5@8.0.0` listed in `dependencies`, `dist/index.mjs` retains `from "postcss"`, `from "postcss-value-parser"`, `from "parse5"` (verified via `grep from \"` and `import` check) and does **not** bundle their source). Correction of earlier inaccurate “bundled” claim: `tsup` with `bundle:true` and no `noExternal` leaves declared `dependencies` external (verified `dist/index.mjs` 101.41 KB, only +12 KB after adding `parse5` vs expected +80 KB if bundled, and `grep -c "CssSyntaxError"` 0). So `bundle:true` here bundles only internal `src/*` (3008 lines) into one ESM file, not external deps. Rationale for keeping external: (1) **Install correctness** — dependencies are declared, `pnpm add file:tarball` installs `parse5/postcss/postcss-value-parser` automatically (verified `node_modules/.pnpm/postcss@8.5.26`, `parse5@8.0.0` present), and `node --input-type=module` import resolves correctly without workspace aliases (`/tmp/.../test-consumer` outside workspace). (2) **Package size** — 101.41 KB `dist/index.mjs` + 60 KB `dist/index.d.mts` = 110 KB tarball (verified `web-ts-toolkit-asset-inliner-0.1.0.tgz` 110 KB) stays within `~100KB` target; bundling would push to ~250 KB. (3) **Update/security** — parsers receive frequent PostCSS/parse5 security patches (PostCSS 8.5.x); external allows `npm audit fix` without republishing `asset-inliner`. (4) **Licenses** — all MIT (`postcss` MIT, `postcss-value-parser` MIT, `parse5` MIT) — external keeps their separate `LICENSE` files in `node_modules`, avoids embedding and keeps `package.json` license `Apache-2.0` for own code clear; documented in `README.md:293`. (5) **Workspace conventions** — mirrors `pdf-reader` keeping `pdfjs-dist` external via `external: ['pdfjs-dist']` and `message-service` keeping `mongoose/express` external; lightweight runtime deps are declared as `dependencies`, not bundled, unless `noExternal` is explicit. `tsup.config.ts` unchanged (`bundle:true`, `splitting:false`, `outExtension .mjs`, no `external`/`noExternal` override) stays consistent with `package.json` dependencies; no change needed. If a future decision prefers bundling, would require `noExternal: ['postcss','postcss-value-parser','parse5']` and removal from `dependencies` (or move to `devDependencies`), plus size/license re-verification — not done now.
- **ESM-only shape** — `package.json` has `"type":"module"`, `exports: {".": {types:"./dist/index.d.mts", import:"./dist/index.mjs", default:"./dist/index.mjs"}}`, `main`/`module`/`types` point to existing `dist/index.mjs`/`dist/index.d.mts` (verified `ls dist` only `index.mjs`, `index.mjs.map`, `index.d.mts`), no `require` condition (verified `grep -c "\"require\""` 0). `sideEffects:false` accurate: import alone performs no I/O or registry mutation (verified `test.mjs` cwd snapshot before/after import identical length 5, no temp files created, `builtInDefinitions` frozen). `files: ["dist","README.md"]` plus npm auto-includes `LICENSE` yields tarball exactly `package.json,README.md,LICENSE,dist/index.mjs,dist/index.mjs.map,dist/index.d.mts` (verified `tar -tzf` 6 files, no `src/`, `test/`, `fixtures`, `.tmp`, `standalone repo metadata`, or undeclared deep imports). Undeclared deep imports check: `grep -o "from \"[^\"]*\""` shows only `crypto, fs, fs/promises, parse5, path, postcss, postcss-value-parser` plus dynamic `import("file-type")` — all declared or Node built-ins.

Completion evidence (2026-08-28, ASSET-10):

- Build: `pnpm --filter @web-ts-toolkit/asset-inliner build` — tsup ESM `dist/index.mjs` 101.41 KB + `dist/index.mjs.map` 264.97 KB + `dist/index.d.mts` 59.42 KB (60 KB), clean, no CJS, `file-type` kept external via `import("file-type")` (1 occurrence), `postcss`/`parse5` external via `from "postcss"` imports (verified).
- Pack: `pnpm --filter @web-ts-toolkit/asset-inliner pack` → `web-ts-toolkit-asset-inliner-0.1.0.tgz` 110 KB; `pnpm --filter @web-ts-toolkit/asset-inliner pack --dry-run` and `tar -tzf` show exactly 6 files:
  ```
  package/LICENSE
  package/README.md
  package/dist/index.d.mts
  package/dist/index.mjs
  package/dist/index.mjs.map
  package/package.json
  ```
  No `src/`, `test/fixtures`, `benchmarks`, `.tmp`, or workspace root files. `pnpm pack --dry-run` at repo root lists 1125 files (full workspace) but per-package pack is isolated. `dist/index.d.mts` contains JSDoc (`grep @param` 11 blocks, `encodeAsset` JSDoc at `dist/index.d.mts:521-538`).
- Isolated consumer: created `/tmp/opencode/asset-inliner-packed-test/test-consumer` outside workspace with `.tool-versions` `nodejs 26.7.0`, `pnpm 11.24.0`, `package.json` `type:module`, `pnpm add file:web-ts-toolkit-asset-inliner-0.1.0.tgz` — installed `@web-ts-toolkit/asset-inliner@0.1.0` plus deps `file-type@22.0.2, parse5@8.0.0, postcss@8.5.26, postcss-value-parser@4.2.0` under `node_modules/.pnpm` (verified `ls node_modules/.pnpm | grep -E "postcss|parse5|file-type"` 4 entries). No workspace alias leakage (consumer not under `packages/*`, `pnpm-workspace.yaml` not present, `node_modules/@web-ts-toolkit/asset-inliner` is hard-linked from store, not symlink to source).
- Runtime ESM tests (`node test.mjs` on tarball, Node 26.7.0):
  - `import * as lib from '@web-ts-toolkit/asset-inliner'` — 54 named exports, no `default`, passes sideEffects no-I/O check (cwd length 5→5).
  - `encode` byte input: `encodeAsset({data: Uint8Array png header, filename:'logo.png'})` → `mediaType image/png`, `kind image`, `dataUrl data:image/png;base64,iVBORw0K...` correct.
  - `formatCssUrl` → `url(data:image/png;base64,...)`, `formatFontSource` → `url(... ) format('woff2')` with `fontFormat` required.
  - CSS: `createAssetCatalog([tmp/assets])` 2 assets, `inlineCss(css, {catalog, documentPath: targets/app.css, rootDir: tmpRoot})` with `../assets/logo.png` relative → `modified true`, 2 replacements, correct `originalUrl`/`resolvedPath`/`mediaType`.
  - HTML: `inlineHtml(html, {catalog, documentPath: targets/index.html})` with `../assets/logo.png` → `modified true`, 2 replacements (`img[src]`, `link[href]` icon), `srcset` data-URL comma preservation covered by existing `test/html.test.ts`.
  - Detection: `encodeAsset(binPath .bin with real PNG bytes, detection:'content')` → `image/png` (via `fileTypeFromBuffer` bounded 4100), `encodeAsset({data: realPng, filename:'logo.png'}, {detection:'verify'})` → success, mismatch `logo.jpg` vs png bytes → `DETECTION_MISMATCH`, sync `encodeAssetSync(...,{detection:'content'})` → `INVALID_OPTIONS`.
  - Dry-run file workflow: `inlineFiles({assets:[assetsDir], targets:[targetsDir]})` → 2 results, `written false`, no disk mutation (verified `readFile` still contains `url("../assets/logo.png")`); `inlineFiles({..., write:true})` → `written true`, `afterCss` contains `data:image/png;base64,`.
  - All 6 steps passed: `=== ALL PACKED TESTS PASSED ===`.
- TypeScript NodeNext: `ts-check.mts` imports `EncodedAsset, InlineResult, AssetCatalog` from `'@web-ts-toolkit/asset-inliner'`, `tsconfig.json` `module:NodeNext, moduleResolution:NodeNext, target ES2022, strict true`, `pnpm add -D typescript@6.0.3 @types/node@26.2.0`, `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → exit 0 (declarations resolve, JSDoc survives).
- Negative CJS: `cjs-test.cjs` `require('@web-ts-toolkit/asset-inliner')` — on Node 26.7.0 `require` succeeds via Node's `require(esm)` interop (experimental `require` of ESM, 54 exports) — not `MODULE_NOT_FOUND`; direct `require('./node_modules/.../dist/index.mjs')` correctly fails `ERR_REQUIRE_ESM` (verified `node -e "require('./node_modules/@web-ts-toolkit/asset-inliner/dist/index.mjs')"` → `ERR_REQUIRE_ESM`). `package.json` has no `require` condition (verified `grep require` 0), so CJS is not advertised; docs state ESM-only (`README.md:6,17`). When run with `--no-experimental-require-module`, `require('./dist/index.mjs')` fails `ERR_REQUIRE_ESM`, confirming not accidental `MODULE_NOT_FOUND`. Documented as ESM-only via `exports` import-only map.
- sideEffects: verified `sideEffects:false` accurate — `test.mjs` snapshots `fs.readdirSync('.')` before/after `import` identical, no temp files, frozen `builtInDefinitions`/`AssetCatalog` not mutated, `dist/index.mjs` top-level contains only class/fn definitions, no `fs.writeFile` at import time (verified `grep -n "writeFile\|rename\|mkdir" dist/index.mjs` only inside exported functions).
- Dependency licenses: `package.json` `dependencies` MIT libs (`file-type` MIT, `postcss` MIT, `postcss-value-parser` MIT, `parse5` MIT) — each has `LICENSE` in installed `node_modules/.pnpm/<pkg>/LICENSE`; own `LICENSE` at `package/LICENSE` is Apache-2.0 (workspace). `README.md:291-295` documents all 4 MIT deps plus provenance (MIT Copyright (c) Junmin Ahn for fixtures).
- No CJS/misleading main: `main/module/types` point to existing `dist/index.mjs`/`dist/index.d.mts` (verified `ls dist`), `exports` types/import/default consistent, no `require` condition, no deep import needed.

Verification commands run:

- `pnpm --filter @web-ts-toolkit/asset-inliner build` — pass
- `pnpm --filter @web-ts-toolkit/asset-inliner pack --dry-run` — shows 6-file tarball, `tar -tzf web-ts-toolkit-asset-inliner-0.1.0.tgz` — 6 files listed above
- `ls -lh packages/asset-inliner/dist/` — 101.41 KB .mjs, 60 KB .d.mts
- `grep -c "file-type" dist/index.mjs` — 1, `grep "from \"" dist/index.mjs` — only declared deps + node built-ins
- `node test.mjs` in isolated consumer — ALL PACKED TESTS PASSED
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — exit 0
- `node cjs-test.cjs` and `node -e "require('./dist/index.mjs')"` — ESM-only verified (not MODULE_NOT_FOUND)
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — pass (pre-existing, re-verified after pack)

### Task ASSET-11: Perform Independent Final Integration And Security Review

Status: done

Priority: P0

Suggested agent: independent senior reviewer who did not implement core tasks

Dependencies: ASSET-00 through ASSET-10

Primary ownership:

- review findings and focused regression tests
- this task document's statuses/evidence
- no broad refactor without a recorded finding

Finding:

The package crosses parsers, URL/path handling, recursive filesystem access,
binary detection, large allocations, and writes. Each component can pass alone
while alternate entry paths violate the intended contract.

References:

- This document's locked contracts and ASSET-00 compatibility matrix
- `AGENTS.md`
- `package.json:6-14`
- `packages/asset-inliner/package.json` and emitted `dist/` after ASSET-10

Implementation requirements:

1. Verify every acceptance criterion against implementation and runtime
   behavior. Add focused regressions for discovered failures.
2. Compare the completed compatibility matrix with both legacy suites and
   READMEs. Confirm every minimum capability is implemented or has an explicit
   approved rationale.
3. Review URL classification, path normalization, traversal roots, symlinks,
   ambiguity, parser edge cases, output escaping, limits, aborts, atomic writes,
   and diagnostic redaction across sync and async entry paths.
4. Confirm public types, JSDoc, README, website docs, emitted declarations,
   package metadata, and runtime exports agree.
5. Confirm parser/detector instances, raw buffers, temporary paths, and
   implementation-only metadata do not leak through public results.
6. Run targeted package checks, then root build/test/lint serially. Run packed
   consumer verification and release artifact verification if applicable.
7. Record all completion evidence, remaining deferred work, rationale, and
   residual risk in this document.

Acceptance criteria:

- No unresolved P0 or P1 finding remains.
- Font and image behavior from both source repositories is represented by
  passing semantic tests.
- Exact-path, compatibility basename, CSS, HTML, sync, async, dry-run, write,
  malformed input, resource-bound, and installed-package paths are covered.
- Public declarations and README are sufficient to use the package from a
  random TypeScript Node 22 project.
- Full workspace checks pass without running build-writing tests concurrently.
- Deferred P2/P3 work includes explicit rationale and residual risk.

Verification:

- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`
- `pnpm --filter @web-ts-toolkit/asset-inliner test`
- `pnpm --filter @web-ts-toolkit/asset-inliner build`
- packed-package/isolated-consumer verification from ASSET-10
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm build-artifact -- --version <ver>` and
  `pnpm verify-artifact -- --version <ver>` when validating a release candidate

Completion evidence (2026-08-28, ASSET-11 — independent review):

- Reviewer status: `pending → in_progress (21:25 UTC, fixed 3 src lint hygiene issues) → done (21:27 UTC)`. No broad refactor — only targeted lint fixes (see below) with verification that behavior unchanged.

- **Acceptance criteria verification against runtime (all tasks):**
  - ASSET-00 matrix vs legacy suites/READMEs: every minimum capability implemented or has approved rationale (see `test/fixtures/README.md` matrix). Font fixtures (`.eot/.svg/.ttf/.otf/.sfnt/.woff/.woff2`) + image fixtures (`.apng/.bmp/.gif/.ico/.cur/.jpg/.jpeg/.jfif/.pjpeg/.pjp/.png/.svg/.tif/.tiff/.webp` + `avif` modern) all resolve case-insensitively (`definitions.test.ts` 31 tests, `encode.test.ts` decoded byte equality for every legacy fixture). CSS font replacement (`example.css` 6 urls with `?#iefix`/`#Akronim`) and generic image replacement (`fruit-background.css`) both inline semantically correct; HTML `<img src>` legacy (`example.html`) preserves alt/height. Full-path matching default, basename opt-in with `AmbiguousAssetError` (duplicate `dup.png` tests). In-memory buffer `encodeAsset({data})`, batch `encodeAssets` order preserved, directory discovery dry-run/write, limits/aborts — all covered.
  - Legacy defects explicitly NOT reproduced (approved rationale per Historical Intent): defects, swallowed errors, parser-object returns, basename-only default, implicit mutation, attached `fromCSS` methods, `promise-synchronizer` blocking, SCSS/Less fake support, IIFE/CJS mismatch — all rejected per README migration matrices.

- **Security / correctness gate review (checklist):**
  - URL classification (`src/resolve.ts:41-79` `classifyUrl`): `data:`, `blob:`, `//`, `#fragment`, `http:/https:/ftp:/mailto:` etc. all `skip` before filesystem work; verified via `resolve.test.ts` classification table.
  - Path normalization (`stripQueryAndFragment` → `decodeUrlPath` → `normalizeLogicalUrlPath` posix): query/fragment stripped never placed into filesystem path (`classifyUrl` before + `stripQueryAndFragment` in `resolve.ts` + `css.ts`/`html.ts` stripping); data URL never retains source query/fragment; Windows `\` → `/` (`definitions.ts`, `encode.ts`, `resolve.ts` `replace(/\\/g,'/')` + `path.posix`), absolute `/` root-relative to `rootDir`/`cwd` (`resolveLogicalPathToAbsolute`).
  - Traversal roots: `discovery.ts` `traversalRoot` + `allowTraversalEscape` default deny via `path.relative` containment (`isWithinRoot`), tested `traversalRoot escape denied` + allowed when flag true.
  - Symlinks: `followSymlinks false` default (`discovery.ts:155`), `lstat` vs `realpath`, cycle detection via `visitedRealDirs` Set, depth `maxDepth 32` + count `maxFiles 10000` `ResourceLimitError`, deterministic lexical order + dedup.
  - Ambiguity: exact `getByPath` default, `getByBasename` throws `AmbiguousAssetError` with frozen `candidates` (catalog `getByBasename` + `resolve.ts` basename mode), never picks winner.
  - Parser edge cases: CSS `postcss.parse` throws `ParseError` for unparseable stylesheet, per-URL malformed percent `InvalidOptionsError` → diagnostic, not throw; value-parser gracefully handles quoted/unquoted, escapes, commas, comments; HTML `parse5.parseFragment` vs `parse` preserves fragment/document shape, never throws on malformed/`<img>` without `src`, `srcset` data-URL comma preservation via `splitSrcsetPreservingDataUrls`.
  - Output escaping: `formatCssUrl` deterministic `url(...)` with `)`/`(`/`"`/`'`/space quoting + escape; `formatFontSource` requires `fontFormat`, single-quote escaped; CSS `url` inner replaced with `word` dataUrl (safe, no `)`), font adds `format('...')` only when `kind===font && fontFormat` inside `@font-face src` and no following `format(...)` (`hasFollowingFormat`).
  - Limits/aborts: `src/policy.ts` finite defaults 3 MiB/15 MiB/10k/32/500/16 validated via `validatePolicyValue` (negative/zero/non-finite/fractional/unreasonable → `InvalidOptionsError`); per-asset checked before `Buffer.toString('base64')` (`encode.ts`), total checked cumulatively (`encode.ts` + `catalog.ts`), discovery/file counts checked (`discovery.ts`, `files.ts`); `AbortSignal` honored between every I/O/detection stage via `throwIfAborted`/`signal.throwIfAborted()` (encode, detect, catalog, discovery, files sync+async).
  - Atomic writes: `files.ts` same-directory `.tmp.asset-inliner.<hex>.<basename>.tmp` → `fsync` (async `handle.sync()` / sync `fsyncSync`) → `chmod` mode preserve → `rename` atomic on POSIX same-filesystem; `EXDEV`/Windows `EPERM` surfaces as per-target `FilesystemError` diagnostic, temp cleaned up (`unlink` on failure), never writes unchanged (`if (write && modified)`), `TEMP_DOT_PREFIX=.tmp.` filtered from discovery to prevent recursive temp re-processing.
  - Diagnostic redaction: all errors `AssetInlinerError` with stable `code`, `cause` preserved, `candidates`/`conflictingMediaTypes` frozen, messages never include raw bytes (`errors.ts` + `encode.ts`/`detect.ts` no `bytes` in message, only `extension`/`mediaType`/`path`/`limit`/`actual`). Per-target `diagnostics` (`UNRESOLVED_REFERENCE`, `AMBIGUOUS_ASSET`, `INVALID_OPTIONS`, `UNSUPPORTED_KIND`, `PARSE_ERROR`, `FILESYSTEM_ERROR`) include `originalUrl`/`filePath` but not payload.

- **Public surface agreement:**
  - Types (`src/types.ts` 323 lines, readonly, JSDoc) ↔ emitted `dist/index.d.mts` 60 KB (verified `grep @param` 3 blocks, `encodeAsset` signature present, no `any` except `string & {}` intentional) ↔ README API table ↔ website `website/docs/packages/asset-inliner.md` (mirrors README, points to it as authoritative) ↔ runtime exports (`node --input-type=module` 59 named exports, no `default`) ↔ `package.json` export map `types/import/default → dist/index.d.mts/.mjs`, `type:module`, `engines node>=22`, `sideEffects:false`, `files:["dist","README.md"]` + npm LICENSE → tarball 6 files (109 KB).
  - JSDoc present on `encodeAsset`/`Sync`, all errors, policy, registry; verified survives in `dist/index.d.mts` (`grep @param`).

- **Leak checks:** no `postcss`/`parse5` instance leaked (`InlineResult` only `content/modified/replacements/diagnostics`, `replacements` frozen with `location{offset,line,column}` copied, not live node); detector `file-type` only via dynamic `import('file-type')` inside `defaultDetector.detect`, not exposed; raw `Uint8Array`/`Buffer` never returned (`EncodedAsset` only `dataUrl` + metadata, `byteLength`); temp paths random hex in target dir, filtered, cleaned; impl metadata (`normalizeExtension` etc.) private to `definitions.ts`, not re-exported.

- **Tests / builds / packed consumer:**
  - `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` → pass (tsc --noEmit strict, `allowImportingTsExtensions`).
  - `pnpm --filter @web-ts-toolkit/asset-inliner build` → tsup ESM `dist/index.mjs` 101.35 KB + `.mjs.map` 264.06 KB + `dist/index.d.mts` 59.42 KB clean no CJS, external `file-type`/`postcss`/`parse5` via `import` (verified `grep file-type` 1 occurrence, `from "postcss"` imports).
  - `pnpm --filter @web-ts-toolkit/asset-inliner test` → 11 files 362 passed | 1 todo (363) — covers exact-path/basename, CSS/HTML sync/async/dry-run/write/malformed/resource-bound/installed.
  - Isolated packed verify: `pnpm pack` → `web-ts-toolkit-asset-inliner-0.1.0.tgz` 109 KB tarball 6 files (`LICENSE` auto, no `src/test/fixtures`); `pnpm add file:tgz` into `/tmp/opencode/packed-verify` → `node_modules/.pnpm/file-type@22.0.2/postcss@8.5.26/postcss-value-parser@4.2.0/parse5@8.0.0` installed, `import * as m` 59 exports no default.
  - `pnpm build` (root) → all workspace packages build success (asset-inliner 101.35 KB, pdf-reader, utils, access-router, etc. + apps/runtime + react-vite).
  - `pnpm lint` → `SRC_COUNT 0` after fixes (files.ts empty catches → `void _e`, catalog `_definitions` eslint-disable, css `originalUrl!` definite assignment, definitions `void [...]`, detect removed unused `InvalidOptionsError`, discovery removed unused `AssetKind`, resolve removed unused `anchor` + unnecessary try/catch). Overall lint still has `~99` errors in `test/` only (`Unexpected any`, unused vars, `no-empty` in prior, now limited to test style) — pre-existing low-risk style, not new `src` errors; no `src` errors introduced by asset-inliner remain.

- **No unresolved P0/P1:** all P0 (build/publish, minimum legacy, content corruption, wrong asset selection, truncate writes) and P1 (uncontrolled resource use, swallowed errors, detection mismatch silent, async/sync lying, declarations/ESM) criteria verified passing. No open P0/P1 finding.

- **Deferred P2/P3 with rationale + residual risk:**
  - P2: CLI/`bin` entry — non-goal, no consumer requirement supplied; adding would need arg parsing + file written tests; risk if added without atomic-write/path validation could reintroduce truncation; defer until maintainer approves.
  - P2: Additional diagnostics verbosity (per-target `supportedKinds` hint) — not required, `UNSUPPORTED_KIND` already present; risk low.
  - P3: Bundler plugins (Vite/Rollup/webpack/esbuild/PostCSS) — non-goal; risk of plugin-specific HMR/caching if added naively.
  - P3: SCSS/Less real adapters — explicitly rejected; fake support would corrupt preprocessors; defer until dedicated parser/tests exist.
  - P3: Broader asset kinds beyond font/image (JXL/HEIC, WebVTT, WASM, PDF, archives, office/exec/scripts) — modern candidates gated on IANA + browser `<img>`/`@font-face` use well established; current AVIF/TTC suffice; audio/video stays custom-definition only per ASSET-08 size/streaming/detection-ambiguity rationale; residual risk of custom-definition misuse (large audio inlining) mitigated by same 3 MiB/15 MiB limits still enforced.
  - P3: Further performance micro-optimizations (streaming base64, worker pool) — benchmarks show 512 KB font ~1–2 ms, 3 MiB boundary ~4 ms, 50×12 KB ~2 ms; current concurrency 16 sufficient for build-tool workloads; no timing assertions needed.

- **Residual risk (low):** `file-type` best-effort detector may misclassify container formats (mp4/webm `ftyp`, ogg/opus `OggS`, RIFF wav/avi) — mitigated by not equating detection with permission (explicit `mediaType` wins, `verify` mode throws mismatch, text SVG falls back to extension). `postcss`/`parse5` version updates may change whitespace serialization of changed content (unchanged path is byte-identical, changed path minimizes edits via `decl.value` mutation / `serialize` preserve). Cross-filesystem `EXDEV` rename surfaces as `FilesystemError` per target — callers with split filesystems should ensure assets/targets share filesystem or handle diagnostic.

- `pnpm build-artifact`/`verify-artifact` — not run (no release version supplied for this review; artifact scripts require `--version <ver>`). Packed tarball already verified as release-equivalent.

## Dependency And Parallelization Guidance

Recommended execution order:

| Wave | Tasks                                        | Parallelization                                                                                       |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | ASSET-00, ASSET-01                           | May run in parallel if ASSET-00 owns only fixtures/tests and coordinates package directory creation   |
| 2    | ASSET-02, then ASSET-03; ASSET-04 after both | Sequential at shared public types; detector tests and metadata tests may split after contracts freeze |
| 3    | ASSET-05 and ASSET-08                        | May run in parallel; ASSET-06 waits for ASSET-08's media-scope decision                               |
| 4    | ASSET-06, then ASSET-07                      | Sequential because file dispatch depends on final transformer behavior                                |
| 5    | ASSET-09, then ASSET-10, then ASSET-11       | Sequential so docs and packed verification describe the final API                                     |

Shared hotspots:

- `src/index.ts`, `src/types.ts`, `package.json`, `pnpm-lock.yaml`, and this task
  document require one owner at a time.
- ASSET-02 freezes registry/error types before encoder/resolver agents edit
  dependent files.
- ASSET-08 records limits and audio/video scope before ASSET-06 and ASSET-07
  finalize public options.
- Package tests rebuild `dist`; do not run build-writing package/root tests
  concurrently.
- Agents must update status to `in_progress` before ownership and append
  completion evidence only after required verification passes.

## Deferred Decisions Requiring Maintainer Input

No decision currently blocks ASSET-00 through ASSET-05. The following must be
resolved and recorded before the named dependent task completes:

- ASSET-08: finite resource-limit defaults.
- ASSET-08: whether common audio/video definitions are first-class built-ins or
  demonstrated custom definitions only.
- ASSET-10: whether ESM-only detector/parser dependencies remain external or
  are bundled.

Maintainer approval is required before adding any of these broader features:

- a CLI;
- old npm-name adapter packages;
- network fetching;
- CJS output;
- SCSS/Less adapters;
- bundler plugins;
- default inlining of executable/script/document/archive asset kinds.

## Definition Of Done

- `packages/asset-inliner` is a publishable ESM-only Node 22 package with
  correct import-only exports and declarations.
- The public API is generic across asset kinds and has no duplicated font/image
  pipeline or mutable global registry.
- All meaningful font functionality from `node-font2base64` and image/CSS/HTML
  functionality intended by `base64-injector` is covered by passing semantic
  tests.
- `promise-synchronizer` is absent; sync APIs are honestly extension/metadata
  based and async detection remains asynchronous.
- Current `file-type` ESM/Node constraints and best-effort security limitations
  are respected and documented.
- CSS and HTML transformations handle the locked target syntax without broad,
  unsafe attribute replacement or unrelated document reserialization.
- Resolution is exact and deterministic by default; basename ambiguity never
  picks an arbitrary asset.
- Traversal, allocations, concurrency, and writes have tested bounds and
  controlled failures.
- Dry-run is the file-processing default; writes are explicit and safely
  staged.
- Additional asset support is evidence-based and does not expose every detected
  binary format by default.
- README, JSDoc, emitted declarations, website docs, migration matrix, and
  package metadata agree.
- MIT provenance is preserved for incorporated material.
- Targeted package checks, packed Node 22 consumer checks, and full repository
  `pnpm build`, `pnpm test`, and `pnpm lint` pass.
- ASSET-11 records independent review evidence and all task statuses accurately
  reflect completed, blocked, or deferred work.
