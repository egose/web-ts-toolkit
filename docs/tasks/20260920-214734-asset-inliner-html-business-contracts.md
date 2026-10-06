# Asset inliner: HTML business contracts and bounded transforms

Created: 2026-09-20 21:47:34 local time.

## Objective and scope

Make offline/self-contained HTML and CSS exports preserve asset identity and document semantics, remain bounded for small adversarial inputs, and be usable after npm installation. Implement the evidenced residual defects below in `packages/asset-inliner`, with focused internal abstractions, regressions, shipped documentation, and consumer verification.

Do not modify root `CHANGELOG.md`. Do not add network fetching, a sanitizer, new broad target allowlists, a crawler, streaming APIs, or descriptor-relative filesystem sandboxing. Preserve unrelated worktree changes (many other packages/apps/tasks were dirty at baseline; asset-inliner was clean).

## Analysis, related work, and limitations

- Inspected all package source modules, relevant tests, README/website documentation, package metadata, build configuration, declarations, and existing benchmark. Read-only review agent: `ses_f1ed4f987ffe3klN0rj4BPEgMR`.
- Baseline actually run: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` passed. In-memory source/built-entrypoint probes confirmed AIR-01–05; parse5 reparsing confirmed the new event attribute in AIR-01. No browser handler execution was attempted. Full tests, new build, actual tarball installation, and Windows integration were not run during analysis.
- Prior plans: `20260828-113925-asset-inliner-package.md`, `20260828-214456-asset-inliner-health-review-remediation.md` (AINL2), and `20260908-073603-asset-inliner-health-follow-up.md` (AIH), all in this directory. This is a residual-contract phase after their implemented fixes, not a duplicate rewrite of those tasks. AIR-01 extends AIH-08's missed unquoted serialization boundary; AIR-02 extends AINL2-07 beyond data URLs; AIR-04 adds syntax depth beyond AINL2-04 byte/count bounds; AIR-06 verifies residual AIH-11 installed-example claims.
- Existing AIH-01 still needs real Windows cross-drive/UNC filesystem integration. Portable predicate tests pass; no new task duplicates that blocker. Documented discovery/read TOCTOU remains outside this phase.
- Metadata and existing bundled ESM entrypoint agree; no broken package export was established. Source self-reference is not proof of tarball installation.
- A suspected font-hint `</style>` breakout was disproved by pinned PostCSS serialization and is not a finding.

## Execution and verification rules

Run AIR-01 through AIR-07 strictly sequentially, with a **new isolated sub-agent session for each task**, no nested delegation. Shared HTML/docs changes must not overlap. Mark the current task `in_progress` before work; append `Completion evidence` with changed paths, commands/results, and any limitations before marking it `completed`. Preserve historical findings. Add new independently necessary follow-ups here with full fields before execution, rather than hiding scope in evidence.

User steering after AIR-01: all further work must stay inside `<repo-root>`. Use ignored repository-local `_tmp*` directories for temporary fixtures/consumer installations and set `TMPDIR` to an absolute repo-local directory when running tests that use `os.tmpdir()`. Do not access external skill paths again; the required skill rules are captured in this document. Repository commands may invoke existing toolchain executables, but do not inspect or modify outside directories. Do not create new consumer work under `<system-tmp>/opencode`.

Priority definitions: P0 = demonstrated unsafe output; P1 = material asset-identity/resource correctness; P2 = measured performance or installed-consumer usability. All source/test paths below are relative to `packages/asset-inliner` unless fully qualified.

Commands run from `<repo-root>` unless stated otherwise; dependencies are installed. Build/test commands must remain serial because workspace test scripts rebuild shared outputs.

- **V1 focused:** `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts <task-test-paths>`; include affected existing regressions. Demonstrate a failing pre-fix regression where practical without reverting/stashing concurrent user work.
- **V2 scope:** `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`; package tests `pnpm --filter @web-ts-toolkit/asset-inliner test`; targeted lint `pnpm exec eslint packages/asset-inliner`. Each implementation task requires V1, typecheck, and relevant lint; run the whole package at integrated checkpoints/final review rather than duplicating it without reason.
- **V3 repository integration:** run `pnpm build`, `pnpm test`, `pnpm lint` serially once during AIR-07. Record exact results and unrelated failures, without changing other packages. These are workspace-context checks; completion of this scoped review requires their execution and evidence, not repairing unrelated dirty-worktree failures. Any failure attributable to this package blocks completion until fixed. A complete repository pass must never be claimed when a command stops early.
- **V4 installed consumer:** build, run `npm pack --dry-run` in the package, install a real tarball with declared dependencies into an isolated ignored repository-local `_tmp*` consumer; test named ESM root imports, strict NodeNext declarations, runtime regression smoke cases, and actual self-contained README examples. Prevent ancestor node_modules/workspace self-reference from masking missing packed files or dependencies. Record commands. Keep workspace lockfile and generated dist untracked/unmodified in the final diff.

External behavior changes must appear in the shipped README's changed-contract notes and relevant declaration JSDoc; use that release-note location rather than root CHANGELOG.md. Website docs should agree.

### Task AIR-01: Preserve unquoted style attribute boundaries

Status: completed

Kind: defect

Priority: P0 — a transformed attribute can introduce an executable event-handler attribute.

Suggested agent: HTML output-safety implementer.

Dependencies: none.

Primary ownership: `src/html.ts` attribute serialization; focused HTML safety tests.

Finding: `handleStyleAttr` decodes entities but `escapeHtmlAttrValue` receives a null quote for unquoted attributes. `<div style=background:url(apple.png);--x:&#32;onmouseover&#61;alert(1)></div>` gains a separate `onmouseover` attribute after normal local image replacement. Existing tests cover quoted styles and unsafe resolver URLs, not this source-text boundary.

References: `src/html.ts` (`escapeHtmlAttrValue`, `handleStyleAttr`, baseline lines 447–456 and 1584–1697); `test/html-decoded-attrs.test.ts`; `test/resolver-data-url-safety.test.ts`.

Requirements:

1. Rewritten styles reparse as exactly the same attribute with the transformed CSS value. Quote unquoted output and escape for that context, including the decoder-disagreement fallback.
2. Include quotation/entity expansion in projected output accounting; preserve source locations and style-element raw-text semantics.
3. Document the corrected output contract and add meaningful regressions alongside the fix.

Acceptance criteria:

- Reparsing proves no new attributes for encoded whitespace, equals, and both quote characters; legitimate CSS suffixes stay in style. Cover unquoted, single/double-quoted, and decoder-fallback input.
- Exact output bound succeeds and one-under fails without mutation; pure transform and async/sync file paths preserve attributes.
- Existing embedded-CSS and resolver-safety tests remain green.

Verification: V1 relevant HTML/embedded-CSS/safety regressions; V2 typecheck and lint.

Completion evidence (isolated task agent 1, 2026-09-26):

- Changed: `packages/asset-inliner/src/html.ts`, `packages/asset-inliner/src/types.ts`, new `packages/asset-inliner/test/html-style-boundaries.test.ts`, shipped `packages/asset-inliner/README.md`, `website/docs/packages/asset-inliner.md`, and this AIR-01 status/evidence section.
- Implementation: serialize the entire rewritten style value in a quoted context; preserve existing single/double quote contexts and wrap unquoted values in double quotes. Account for the actual serialized patch (including quotes/escaping) before adding it. The raw-source decoder-disagreement path uses the same quoting boundary while preserving existing entity spellings, and uses parse5's single decode for its fallback tree value to avoid double-encoding during full-tree serialization. Original URL locations and style-element raw-text handling are retained.
- Regression before fix: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html-style-boundaries.test.ts` initially exposed a test-authoring URL-binding collision (no tests ran), corrected before the behavioral baseline. The next pre-fix run reported **10 failed / 5 passed**: nine behavioral failures demonstrated new `onmouseover` attributes (pure and both file paths) or missing fallback quotation; one failure was an ESM spy setup issue, corrected with a test-local module wrapper. No source fix was present during these failures. After the fix, the same command passed **15/15**; subsequent coverage additions bring the new file to **17 tests**.
- Acceptance coverage: parse5 reparsing checks the complete attribute list and exact transformed CSS value for unquoted/single/double-quoted inputs, encoded ASCII whitespace (including CR decoder disagreement), equals, both quotes, ampersands, angle brackets, multibyte text, and legitimate suffixes. Named-reference disagreement and literal fallback delimiters are covered. Forced missing source information exercises full-tree serialization for both decoding paths. Exact output limits pass; one byte less is asserted to fail at **projected** accounting with the expected actual/limit values. Async and sync file tests verify no write/no replacements on failure, successful exact-bound writes matching pure results/locations, and temporary-file cleanup. Existing raw-text, embedded-CSS, and resolver-safety regressions pass.
- V1 command: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html-style-boundaries.test.ts test/html-decoded-attrs.test.ts test/html-source-patches.test.ts test/html.test.ts test/embedded-css.test.ts test/css-mixed-case-url.test.ts test/resolver-data-url-safety.test.ts test/target-limits.test.ts` — **8 files / 133 tests passed**. Vitest emitted the existing Vite native-config-loader compatibility warning; no test failures.
- V2 commands: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **passed**; `pnpm exec eslint packages/asset-inliner` — **passed**, no findings.
- Declaration verification: `pnpm --filter @web-ts-toolkit/asset-inliner build` — **ESM and declarations passed**; inspected emitted `dist/index.d.mts` and confirmed the new `inlineHtml` / `InlineOptions.inlineEmbeddedCss` JSDoc survives. Generated dist remains outside the tracked diff; package metadata/lockfile unchanged.
- Diff checks: `git diff --check -- packages/asset-inliner website/docs/packages/asset-inliner.md docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **passed**; `git diff -- CHANGELOG.md` and scoped status confirm root CHANGELOG is unchanged. Unrelated baseline work was preserved. All build/test commands ran serially.
- Limitations/follow-up: no new independent follow-up identified. Full-package/integrated workspace and packed-consumer checks remain assigned to the later tasks per the execution rules; not claimed as run here. AIR-02–07 remain untouched and pending.

### Task AIR-02: Tokenize complete srcset candidates consistently

Status: completed

Kind: defect

Priority: P1 — valid remote URLs are corrupted and local comma filenames fail to inline.

Suggested agent: responsive-image parser implementer.

Dependencies: AIR-01.

Primary ownership: `src/html.ts` srcset handling; optional small internal tokenizer module; focused srcset tests.

Finding: both srcset splitters treat commas as separators except in `data:` URLs. `https://example.test/a,apple.png 1x` wrongly resolves/replaces the `apple.png` suffix. `apple,pear.png 1x` is diagnosed as two files. A URL token can contain interior commas regardless of scheme.

References: `src/html.ts` (`splitSrcsetPreservingDataUrls`, `splitSrcsetWithOffsets`, baseline lines 63–113 and 467–537); `test/html-source-patches.test.ts`; `test/html.test.ts`.

Requirements:

1. Use one offset-producing tokenizer following HTML srcset URL/descriptor states, distinguish interior commas from trailing separators, and consume only complete URL tokens.
2. Preserve decoded-to-source locations and untouched source spelling. Invalid candidate descriptors must not result in unintended prefix/suffix replacement; document any correction to old invalid-input expectations.

Acceptance criteria:

- Comma-containing local filenames resolve whole assets despite suffix decoys; comma-containing remote URLs stay byte-identical and never call a resolver on their suffix.
- Data URLs, descriptorless candidates, trailing/repeated separators, ASCII whitespace, malformed descriptors, entities, duplicate locations, img/source paths have regression coverage.
- Existing source-patch and decoded-attribute safety holds.

Verification: V1 srcset/HTML/source-patch/decoded-attribute tests; V2 typecheck and lint.

Completion evidence (isolated task agent 2, 2026-09-26):

- Changed: `packages/asset-inliner/src/srcset.ts` (new internal tokenizer), `packages/asset-inliner/src/html.ts`, `packages/asset-inliner/src/types.ts`, `packages/asset-inliner/test/html-srcset-tokens.test.ts` (new, **60 tests**), shipped `packages/asset-inliner/README.md`, `website/docs/packages/asset-inliner.md`, and this AIR-02 status/evidence section. AIR-01's style serializer and tests were preserved; no other task status changed.
- Implementation: removed both old splitters/extractors and the duplicated raw-source srcset replacement loop. One offset-producing HTML URL/descriptor-state tokenizer now feeds one replacement path for img/source, mapped source patches, and missing-source full-tree serialization. Interior commas belong to every URL scheme; trailing URL commas delimit descriptorless candidates. Descriptor validation consumes malformed candidates completely without resolving prefixes/suffixes; parentheses retain their internal commas. Decoded and raw patches preserve untouched candidates/descriptors/separators rather than rebuilding the list from accepted candidates.
- Source mapping: the existing narrow decoder remains the fast path. A srcset-only fallback uses the existing parse5 dependency to decode character references in attribute context, cached per attribute, with original UTF-16 offsets and correct literal CR/CRLF versus numeric-CR handling. Tokenization never falls back to raw entity text. Missing parser source information reports offset `-1` rather than guessing duplicate locations. Full-tree serialization may normalize CR descriptor whitespace to LF on reparse; source patches preserve the original spelling. Added quotes/escaping for unquoted srcset values remain output-budgeted.
- Regression before fix: initial focused invocation ran no tests due to a new fixture setup mistake (encoded assets passed to the input-only catalog constructor); corrected to byte inputs before behavioral verification. The next pre-fix invocation of the focused command below with only `test/html-srcset-tokens.test.ts` reported **51 failed / 0 passed**, demonstrating remote suffix corruption, wrong comma-filename selection, descriptor errors, and decoded-location failures. Subsequent test-authoring corrections matched the resolver's object argument and parse5 full-tree CR normalization; no incorrect splitting expectation was retained to make tests pass.
- Acceptance coverage: remote/protocol-relative comma URLs with resolver spies; whole local comma filenames and distinct-content suffix decoys, including real files under exact-path lookup in async/sync orchestration; unresolved whole-name diagnostics; data URLs; descriptorless candidates; trailing/repeated and entity-encoded separators; all five ASCII whitespace characters, CRLF and numeric/named encodings; non-ASCII whitespace within URL tokens; valid/invalid/duplicate/conflicting/future-compatible descriptors, parenthesized commas and unclosed parentheses; duplicate source offsets/line/column; single/double/unquoted attributes; exact and one-under output limits; decoder disagreement and missing-source/full-tree paths.
- Invalid-input review: existing checked-in HTML/source-patch srcset cases passed without changing their expectations. New explicit cases reject the old splitter assumption: `a.png,b.png` is one URL, `a.png 1x,b.png 2x` is two candidates, and `a.png 1x b.png 2x` is an invalid descriptor list left untouched. A standalone `2x` after a separator is a URL token, not a descriptor. README changed-contract notes, website docs, and declaration JSDoc now describe the corrected behavior.
- All commands ran from the repository root, with **`TMPDIR=<repo-root>/_tmp-air02`**; the ignored directory was created after checking the repo parent. Temporary file fixtures were cleaned by their tests. No further outside-file inspection or modification was performed after repo-only steering; no nested agents were used. Build/test/check commands ran serially.
- V1: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html-srcset-tokens.test.ts test/html-source-patches.test.ts test/html-decoded-attrs.test.ts test/html.test.ts test/html-style-boundaries.test.ts test/resolver-data-url-safety.test.ts test/embedded-css.test.ts test/selective-inline.test.ts test/target-limits.test.ts` — **9 files / 189 tests passed**. Only the existing Vite native-config-loader compatibility warning was emitted.
- V2: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **passed**; `pnpm exec eslint packages/asset-inliner` — **passed**, no findings. `pnpm --filter @web-ts-toolkit/asset-inliner build` — **ESM and declarations passed**; inspected `dist/index.d.mts` and confirmed new srcset `inlineHtml`/`InlineOptions` JSDoc and retained AIR-01 style JSDoc.
- Diff verification: `git diff --check -- packages/asset-inliner website/docs/packages/asset-inliner.md docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **passed**. `git diff -- CHANGELOG.md pnpm-lock.yaml` — **empty**. Scoped status confirms generated dist is ignored and package metadata unchanged. Unrelated baseline worktree changes were preserved.
- Follow-up/limitations: no new independent follow-up required for AIR-02. Full-package, repository integration, and packed-consumer verification remain assigned to later tasks and were not claimed here. The ignored repo-local Node compile cache remains available under `_tmp-air02`; no temporary asset fixtures remain.

### Task AIR-03: Respect effective HTML base references

Status: completed

Kind: defect

Priority: P1 — documents can embed the wrong local asset in place of a remote or differently based reference.

Suggested agent: URL-resolution contract implementer.

Dependencies: AIR-02.

Primary ownership: `src/html.ts`, narrowly scoped internal base-resolution helper, `src/resolve.ts` only if needed; base-reference regressions.

Finding: HTML always resolves through the physical documentPath/rootDir and ignores `<base href>`. A remote base plus `img src=apple.png` embeds a local decoy; `../duplicate-a/` from a duplicate-b document chooses duplicate-b. Embedded CSS repeats the same mistake.

References: `src/html.ts` (`walkAndInline`, `handleSimpleAttr`, embedded CSS dispatch, baseline lines 546–664 and 1471–1481); `src/resolve.ts` filesystem anchoring; `test/html.test.ts` exact-path tests.

Requirements:

1. Determine first applicable base before transforming. Support locally mappable relative/root-relative bases under the existing filesystem contract, retaining actual document identity in diagnostics.
2. Remote/protocol-relative effective bases prevent false local lookup across all supported HTML reference paths. For unmappable bases, preserve affected references with a controlled diagnostic rather than guessing a filesystem path. No fetching or base rewriting.
3. Define empty/missing href, entity decoding, later base elements, and template-contained inert bases consistently with browser semantics; preserve no-base behavior.

Acceptance criteria:

- Conflicting same-name local assets resolve from the effective base; remote/protocol-relative base decoys remain untouched with no falsely local resolver calls.
- Cover first-base precedence, empty href, entity encoding, missing href, no-base controls, simple attributes, srcset, style attributes/elements, and async/sync files.
- Public docs/types describe the contract and limitations; no source path or query/fragment decoding regression.

Verification: V1 base-resolution and existing resolve/HTML/embedded tests; V2 typecheck and lint.

Completion evidence (isolated task agent 3, 2026-09-26):

- Changed: new internal `packages/asset-inliner/src/html-base.ts`, `packages/asset-inliner/src/html.ts`, `packages/asset-inliner/src/resolve.ts`, narrowly scoped forwarding in `packages/asset-inliner/src/css.ts`, `packages/asset-inliner/src/types.ts`, new `packages/asset-inliner/test/html-base.test.ts` (**55 tests**), shipped `packages/asset-inliner/README.md`, `website/docs/packages/asset-inliner.md`, and this AIR-03 status/evidence section. Preserved prior AIR-01/AIR-02 changes and unrelated dirty work; other task statuses were not changed.
- Implementation: scan parsed tree order before transformation for the first HTML-namespace base with href, ignoring missing href and inert template/foreign-namespace bases. Use parse5's single entity decode plus URL edge C0/space trimming and tab/newline removal. Map relative/root-relative bases through the existing query/fragment stripping, percent-decoding, and filesystem normalization contract, distinguishing directory endings from document endings. Empty/query/fragment-only href and HTML-disallowed data:/javascript: base schemes select document fallback and retain first-base precedence. No base is rewritten or fetched.
- Shared resolution: an internal symbol-keyed per-transform context carries the effective directory through simple attributes, img/source srcset, style elements, style attributes, and their decoder-disagreement path into synchronous resolution. Remote/protocol-relative and unmappable bases stop local-looking references before catalog/basename lookup or resolver hooks, emitting `HTML_BASE_UNMAPPABLE` warnings. Root-relative references remain anchored at rootDir/cwd under local bases and are preserved under remote/unmappable bases. Ordinary nonlocal reference skips remain unchanged.
- Honest identity: the actual documentPath is never replaced by a synthetic base document. Hooks retain reference-relative decodedPath and actual documentPath, with optional public `ResolverInput.resolutionBaseDir` exposing the mapped directory separately. Based-HTML diagnostic filePath identifies the containing document; attempted asset paths remain in resolution messages/replacement metadata. No document identity is invented for in-memory content. Docs/JSDoc also clarify resolver URL text, including the existing raw-entity style fallback exception.
- Pre-fix regression: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html-base.test.ts` — **24 failed / 11 passed**, demonstrating wrong-directory selection, remote/unmappable decoy inlining, false file writes, and missing honest base context. The first post-fix run passed **35/35**; additional acceptance cases brought this file to **55 tests**.
- Acceptance coverage: distinct-content duplicate assets and root decoys across all eight supported reference paths; directory/document/root-relative/dot-segment bases; bases after references in documents/fragments; first/later/empty/missing href precedence; numeric/full named entities and tab preprocessing; nested inert templates and foreign namespace; remote/protocol-relative/scheme/backslash and malformed/NUL percent bases; data:/javascript: fallback; ordinary remote/data/fragment skips; source offsets with entity-encoded srcset commas and percent-encoded filename query/fragment characters; one-time base decoding; style decoder disagreement and full-tree serialization; rootDir/cwd/document-less controls; frozen hook context, hook overrides, no-base context, selective-skip/resource diagnostic identity; async/sync writes selecting local assets and no writes for remote/unmappable bases, with fixture/temp cleanup.
- All commands below ran serially from the repo root with **`TMPDIR=<repo-root>/_tmp-air03`**. The ignored directory was created after checking its repo parent. No outside-file inspection/modification, external skill reads, or subagents were used. Temporary fixtures were removed; only the ignored Node compile cache remains there.
- V1: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html-base.test.ts test/resolve.test.ts test/html.test.ts test/embedded-css.test.ts test/html-decoded-attrs.test.ts test/html-source-patches.test.ts test/html-srcset-tokens.test.ts test/html-style-boundaries.test.ts test/css-mixed-case-url.test.ts test/resolver-sync-honesty.test.ts test/resolver-data-url-safety.test.ts test/target-limits.test.ts` — **12 files / 290 tests passed**. Only the existing Vite native-config-loader compatibility warning was emitted.
- V2: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **passed**; `pnpm exec eslint packages/asset-inliner` — **passed**, no findings. The initial lint run flagged the intentional C0 URL-preprocessing regex; added a narrowly scoped, explained no-control-regex suppression and reran successfully.
- Declaration/build verification: `pnpm --filter @web-ts-toolkit/asset-inliner build` — **ESM and declarations passed**. Inspected emitted `dist/index.d.mts`: HTML base JSDoc, `HTML_BASE_UNMAPPABLE`, and optional `resolutionBaseDir` are present; internal context types/symbol are absent from the public declarations. Generated dist remains ignored.
- Diff verification: `git diff --check -- packages/asset-inliner website/docs/packages/asset-inliner.md docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **passed**. `git diff -- CHANGELOG.md pnpm-lock.yaml packages/asset-inliner/package.json` — **empty**. Scoped status confirms only intended AIR-03 paths plus preserved prior-agent paths.
- Follow-ups/limitations: no new independent AIR-03 follow-up required. Mapping deliberately does not infer browser origin/CSP/runtime DOM changes or map file:/blob:/custom schemes; these limits are shipped in docs. Full-package/integrated workspace and packed-consumer checks remain assigned to later tasks and are not claimed here. Historical real-Windows integration and discovery/read TOCTOU limitations remain as recorded above.

### Task AIR-04: Bound HTML and CSS syntax nesting

Status: completed

Kind: defect

Priority: P1 — small inputs below byte limits cause uncontrolled stack overflows.

Suggested agent: parser-resource boundary implementer.

Dependencies: AIR-03.

Primary ownership: `src/html.ts`, `src/css.ts`, focused internal syntax-depth helper; policy/types/files forwarding and exports only as needed; nesting tests.

Finding: 8,000 nested divs (88,015 bytes) throw raw RangeError in recursive HTML walking; 8,000 nested CSS functions (24,024 bytes) throw in postcss-value-parser traversal. Defaults permit both; replacement limits and directory maxDepth do not constrain syntax depth.

References: `src/html.ts` (`walkAndInline` recursive children baseline 588–592, serialize fallback); `src/css.ts` recursive value-parser walk baseline 310–406; `test/target-limits.test.ts`.

Requirements:

1. Choose/document a finite syntax nesting cap independent of filesystem depth; prefer a small explicit policy consistent with existing limit validation (default 256, maximum 512 unless runtime evidence requires a lower cap). Define exact depth counting and expose any new public policy consistently across pure/file APIs.
2. Iteratively check depth before recursive traversal/serialization operations. Inspect HTML template content and CSS blocks/functions/serialization paths; do not merely catch arbitrary RangeError.
3. Excess depth produces ResourceLimitError in pure APIs and RESOURCE_LIMIT/no-write in file orchestration, even without replacements. Embedded CSS receives the same bound.

Acceptance criteria:

- Both reproductions are controlled, not raw stack errors. Exact chosen boundary succeeds, one-over fails, quotes/comments don't falsely count, and no-reference input is checked.
- Standalone/embedded CSS and HTML fallback paths are bounded; file failures preserve disk and other target results.
- Public policy/types/JSDoc/README agree; existing limits remain enforced.

Verification: V1 depth and target/policy/embedded regressions; V2 typecheck, lint, and full package test checkpoint.

Completion evidence (isolated task agent 4, 2026-09-26):

- Changed: new internal `packages/asset-inliner/src/syntax-depth.ts`, `packages/asset-inliner/src/html.ts`, `packages/asset-inliner/src/css.ts`, `packages/asset-inliner/src/policy.ts`, `packages/asset-inliner/src/types.ts`, `packages/asset-inliner/src/files.ts`, `packages/asset-inliner/src/index.ts`, new `packages/asset-inliner/test/syntax-depth.test.ts` (**42 tests**), shipped `packages/asset-inliner/README.md`, `website/docs/packages/asset-inliner.md`, and this AIR-04 status/evidence section. Prior AIR-01–03 edits and unrelated dirty files were preserved; no other task status changed.
- Public policy: `maxSyntaxDepth` is a positive safe integer, **default 256 / maximum 512**, independent of filesystem `maxDepth`. Added matching constants, frozen/default normalized policy entries, validation, pure/file option declarations, and forwarding through both embedded-CSS transform paths. README changed-contract notes, policy table, website, and emitted declaration JSDoc agree. Internal guards are not exported from the package root.
- Counting/implementation: HTML counts parsed elements including the current element, implied elements and template content; document/fragment roots, text and comments add zero. A per-parse adapter checks insertion ancestry iteratively, linking template fragments to their hosts and excluding parse5's temporary fragment root. This bounds parse5's recursive unclosed-template EOF recovery **before it runs**, not merely the later HTML walk. An iterative completed-tree check covers parser moves, template content, recursive walking and fallback serialization. CSS has a documented conservative lexical cap on simultaneously open unescaped `{`, `(` and `[` outside strings/comments, with matching closers; it runs before parsing/no-URL fast paths and covers blocks, functions, selectors, at-rule parameters, custom properties and malformed/unclosed groups. Iterative PostCSS/value-parser tree checks precede walk/stringify operations. No arbitrary `RangeError` catch or recursive preflight was added.
- Embedded CSS: opt-in chunks receive the same cap starting from zero independently of HTML nesting, including no-reference chunks, entity-decoded style values, raw-source decoder fallback, absent source locations and inert templates. Disabled embedded CSS remains raw HTML content. Failures propagate as `ResourceLimitError`; file orchestration retains its existing `RESOURCE_LIMIT` result contract (`content: ''`, no replacements, `modified: false`, `written: false`), preserves the original file on disk and processes sibling targets.
- Pre-fix regression: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/syntax-depth.test.ts` initially reported **36 failed / 1 passed**, demonstrating absent policy validation, accepted over-depth HTML/no-reference CSS, raw CSS `RangeError`, wrong unclosed-CSS error class, and writes to over-depth files. Initial guards passed **37/37**. Inspection of pinned parse5 then identified recursive EOF template recovery; two added unclosed-template fragment/document cases reported **2 failed / 37 passed** with only a post-parse guard. Adding the insertion adapter passed **39/39**. Final acceptance additions bring the file to **42/42**.
- Acceptance coverage: small 8,000-depth HTML div/template/unterminated-template and CSS function/block/unterminated-block inputs; exact/one-over custom 4, default 256 and maximum 512 boundaries; modified and no-reference inputs; parser-inserted elements; text/comments/quoted raw markup; CSS quote escapes, comments and escaped punctuation; selector/parameter/bracket/custom-property nesting; forced full-tree div/template serialization with serializer spies; exact 512-depth unclosed-template recovery; embedded style element/attribute and decoder fallback forwarding; invalid policies through normalization and all four transform/file entrypoints; async/sync mixed-target batches with 8,000-depth and one-over failures, preserved disk bytes, empty failure results, exact-bound successful writes, independent filesystem depth, and atomic-temp cleanup assertions.
- All test/build/check commands ran serially from `<repo-root>` with **`TMPDIR=<repo-root>/_tmp-air04`**. The parent was verified before creation and `git check-ignore` confirmed the directory is ignored. No external skill reads, outside-repository work, `<system-tmp>/opencode` usage, or nested agents. New test fixtures clean themselves; the full existing package suite leaves six ignored `readme-examples-*` fixture directories alongside the Node compile cache under `_tmp-air04`.
- V1: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/syntax-depth.test.ts test/target-limits.test.ts test/policy.test.ts test/embedded-css.test.ts test/html.test.ts test/html-source-patches.test.ts test/html-style-boundaries.test.ts test/html-srcset-tokens.test.ts test/html-base.test.ts test/html-decoded-attrs.test.ts test/css.test.ts test/css-mixed-case-url.test.ts test/resolver-data-url-safety.test.ts` — **13 files / 343 tests passed**. After documenting/asserting the existing empty-result-content contract, reran `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/syntax-depth.test.ts` — **42/42 passed**. Vitest emitted only the existing Vite native-config-loader compatibility warning.
- V2: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **passed**. `pnpm exec eslint packages/asset-inliner` — **passed** on final rerun; the first lint run identified one unnecessary escaped double quote in the new fixture, corrected without changing the CSS bytes. `pnpm --filter @web-ts-toolkit/asset-inliner test` — **ESM/declaration build passed; 36 test files passed, 740 tests passed / 1 existing todo (741 total)**. Inspected `dist/index.d.mts`: both new constants, policy/options fields, and transform JSDoc are present; internal adapter/guards are absent from public declarations. Generated dist remains ignored.
- Additional plain-Node built-entrypoint verification (same repo-local TMPDIR): `node --input-type=module -e "import assert from 'node:assert/strict'; import { inlineHtml, inlineCss, createAssetCatalogSync, ResourceLimitError } from './packages/asset-inliner/dist/index.mjs'; const catalog=createAssetCatalogSync([{filename:'a.png',data:new Uint8Array([1])}]); const options={catalog,allowBasenameMatch:true,maxSyntaxDepth:512}; const html='<div>'.repeat(511)+'<img src=a.png>'+'</div>'.repeat(511); const css='a{background:'+'f('.repeat(510)+'url(a.png)'+')'.repeat(510)+'}'; assert.equal(inlineHtml(html,options).replacements.length,1); assert.equal(inlineCss(css,options).replacements.length,1); assert.equal(inlineHtml('<template>'.repeat(512),options).modified,false); for(const input of ['<div>'.repeat(8000)+'</div>'.repeat(8000),'<template>'.repeat(8000)]) assert.throws(()=>inlineHtml(input,{catalog}),ResourceLimitError); assert.throws(()=>inlineCss('a{--x:'+'f('.repeat(8000)+'x'+')'.repeat(8000)+'}',{catalog}),ResourceLimitError); console.log('Built ESM: 512-depth transforms/recovery and 8000-depth rejections passed');"` — **passed**. This is built-runtime evidence, not a packed-consumer claim. An earlier read-only plain-Node parse5 probe also confirmed balanced 8,000-div parsing itself succeeds; no runtime timing benchmark was run.
- Diff checks: `git diff --check -- packages/asset-inliner website/docs/packages/asset-inliner.md docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **passed**. `git diff -- CHANGELOG.md pnpm-lock.yaml packages/asset-inliner/package.json` — **empty**. Scoped status confirmed prior agent files remain present and no generated dist/temp artifacts enter the tracked diff.
- Follow-ups/limitations: no new independent AIR-04 follow-up required. AIR-05 performance work, AIR-06 packed-consumer/example verification, and AIR-07 integrated workspace review remain pending. No repository-wide or tarball-install pass is claimed here. Historical Windows integration and TOCTOU limitations remain unchanged.

### Task AIR-05: Assemble HTML patches in one pass

Status: completed

Kind: defect

Priority: P2 — measured superlinear copying makes permitted offline exports unnecessarily slow.

Suggested agent: source-patch performance implementer.

Dependencies: AIR-04.

Primary ownership: `src/html.ts` patch assembly; small internal shared patch helper; patch regressions and `benchmarks/` transform benchmark.

Finding: descending replacements repeatedly slice the increasingly expanded output. Baseline source probe with one 10 KiB asset and 100/250/500/1,000 img references took about 190/660/2,437/11,233 ms for 1.37/3.42/6.85/13.69 MB output, all within defaults. A single-join assembly-only control for 500 references produced identical bytes in ~29 ms; that is not an end-to-end speedup claim.

References: `src/html.ts` final patch loop baseline 1830–1867 and srcset span assembly 1073–1079; `benchmarks/policy-benchmark.mjs` lacks transform scaling.

Requirements:

1. Validate/sort nonoverlapping patches, assemble original-source slices and replacement chunks with one join. Reuse for srcset where appropriate without exporting internal parser helpers.
2. Preserve overlap fallback, offsets, byte/count limits, identity for unchanged content, and source formatting.
3. Add a non-gating benchmark for 100/250/500/1,000 references and record measured before/after results under comparable conditions. No timing assertions in unit tests.

Acceptance criteria:

- Byte-identical outputs and metadata for adjacent, first/last, multibyte/entity, repeated and empty patch sets; overlap/invalid fallback remains correct; exact bounds hold.
- Evidence shows the copying bottleneck is reduced without increasing allowed output or changing semantics.

Verification: V1 source-patch/srcset/HTML tests; V2 typecheck/lint; actual benchmark command/results.

Completion evidence (isolated task agent 5, 2026-09-26):

- Changed only for AIR-05: `packages/asset-inliner/src/html.ts`, new internal `packages/asset-inliner/src/source-patches.ts`, new `packages/asset-inliner/test/source-patches.test.ts` (**19 tests**), new `packages/asset-inliner/test/html-patch-assembly.test.ts` (**8 tests**), new `packages/asset-inliner/benchmarks/html-patches-benchmark.mjs`, and this AIR-05 status/evidence section. Preserved prior AIR-01–04 changes and unrelated work. No public contract/policy/export changes or root CHANGELOG edits.
- Implementation: a shared internal assembler copies/sorts the patch list ascending, validates safe-integer, nonempty, in-bounds UTF-16 spans, rejects overlap (including duplicates/containment), retains replacement byte-length validation, then collects only original-source slices and replacement chunks for one join. Adjacent spans and empty replacement strings work; empty patch lists return the original content. Document assembly retains its null-to-tree-serialization fallback and unchanged-content early return. Both raw and decoded srcset assembly reuse the helper; invalid raw mapping selects tree fallback with the decoded attribute retained. Tokenizer-produced decoded spans are asserted valid. Projected byte/count checks, quoting, location calculation, and final serialized-output limits retain their existing ownership and defaults.
- Pre-fix preservation run: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html-patch-assembly.test.ts` — initial **2 failed / 6 passed** because the new test expected a filename rather than the existing absolute resolvedPath; corrected that test expectation using `path.resolve`. The next run passed **8/8 before source edits**. These are preservation tests, not claims of a pre-fix behavioral defect; the measured runtime baseline below demonstrates the performance defect without flaky timing assertions.
- Regression coverage: unordered/adjacent/first/last/deletion/empty patch sets; multibyte and surrogate-pair source coordinates; fractional, negative, out-of-bounds, unsafe, NaN/infinite, reversed and zero-width spans; duplicate/contained/partial overlap; input-list immutability. End-to-end HTML and srcset each exercise 128 repeated entity-encoded references to a 10 KiB asset, exact full output and replacement metadata, source spelling, exact/one-under byte and count bounds. Parser-injected overlapping, missing, out-of-bounds and fractional locations verify actual serializer fallback. Missing-source unquoted input verifies final output accounting including added quotes. Existing decoded/srcset/base/style/depth/safety tests cover the affected alternate paths.
- All build/test/typecheck/lint/benchmark commands ran serially from `<repo-root>` with **`TMPDIR=<repo-root>/_tmp-air05`**. Created that directory after checking the repository parent and confirmed it is ignored with `git check-ignore`. No external skill reads, outside-repository inspection, or nested agents. The benchmark uses in-memory fixtures; new regressions create no filesystem fixtures.
- V1: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/source-patches.test.ts test/html-patch-assembly.test.ts test/html-source-patches.test.ts test/html-srcset-tokens.test.ts test/html.test.ts test/html-decoded-attrs.test.ts test/html-style-boundaries.test.ts test/html-base.test.ts test/embedded-css.test.ts test/resolver-data-url-safety.test.ts test/target-limits.test.ts test/syntax-depth.test.ts` — **12 files / 305 tests passed**. Only the existing Vite native-config-loader compatibility warning was emitted.
- V2: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **passed**; `pnpm exec eslint packages/asset-inliner` — **passed**, no findings. `pnpm --filter @web-ts-toolkit/asset-inliner build` — **ESM and declaration builds passed**, run once before source changes for the baseline and once after for the fixed benchmark. Generated dist remains ignored; package metadata and lockfile are unchanged.
- Actual comparable benchmark command, executed once against each freshly built version: `node --expose-gc packages/asset-inliner/benchmarks/html-patches-benchmark.mjs`. Same machine, **Node v26.7.0 / Linux x64**, fresh process per version, one 10,240-byte in-memory PNG-named asset, identical repeated `<img src="a.png">` input, `allowBasenameMatch: true`, all resource limits at defaults. Each size receives one unmeasured warmup and three measured complete `inlineHtml` calls. Explicit GC runs before each call; catalog/input creation and output/metadata checks are outside timings. No concurrent build/test command and no timing thresholds. Results in milliseconds:

  | References | Input bytes | Output bytes (both) | Before samples                 | Before median | After samples             | After median | Median speedup |
  | ---------: | ----------: | ------------------: | ------------------------------ | ------------: | ------------------------- | -----------: | -------------: |
  |        100 |       1,700 |           1,369,000 | 32.307 / 40.673 / 35.256       |        35.256 | 13.464 / 10.026 / 9.880   |       10.026 |          3.52× |
  |        250 |       4,250 |           3,422,500 | 302.828 / 415.001 / 333.180    |       333.180 | 27.687 / 27.213 / 23.961  |       27.213 |         12.24× |
  |        500 |       8,500 |           6,845,000 | 1202.568 / 1316.853 / 1460.794 |      1316.853 | 48.673 / 48.728 / 54.272  |       48.728 |         27.02× |
  |      1,000 |      17,000 |          13,690,000 | 4733.668 / 4158.688 / 5495.893 |      4733.668 | 116.236 / 93.763 / 96.360 |       96.360 |         49.12× |

- Benchmark equivalence: every transform asserted exact expected output bytes, modified=true, correct replacement count and empty diagnostics. Before/after SHA-256 output and full metadata hashes matched at all four sizes (metadata includes all replacement locations/resolved paths, modified flag and diagnostics). Common hashes:

  | References | Output SHA-256                                                     | Metadata SHA-256                                                   |
  | ---------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
  |        100 | `82656d4dd9356aaccc07d189f77c52c40c8bf8b7fc62c0a87432110ed23ccb78` | `d4991bd673e225945c45f61d8140bedcb38e9a797808e4f2ae74c2634f54d737` |
  |        250 | `6cc40e4375bc5248d5ccb5d2acb0bd8a7bf7e115724ed6e7b6e09e6e94948a48` | `e74518e77e53df3b5cbc48ee1dc63b97e3778c5931149d9884abd2fb7c9e86d2` |
  |        500 | `6bfe7b770cc711b09abd9d6803c553c166b4d18163c9ed04e3f11f9a8e9d14fe` | `bf2fda4ab7476db190313406b280ad3d3697db9b16015dcd101189fa4a70e116` |
  |      1,000 | `50a4a02cc3ec3fa31cc2f38257eaf7f0a3888fa92c7436dd47af2339b71612a2` | `3a40bb13a27cc282e4dede7fd1a3f76d0b6f37d1232ce97f19c38b86da3e61c5` |

- Interpretation: at 1,000 references the observed median end-to-end runtime decreased **97.96%**, from 4,733.668 to 96.360 ms, with identical bytes and metadata and no increased output allowance. This measures the current built implementation before/after on this runtime, not the historical source-probe times or an assembly-only control. It demonstrates removal of the expanded-output copying bottleneck; it is not a universal timing or total-transform asymptotic guarantee.
- Diff checks: `git diff --check -- packages/asset-inliner docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **passed**. `git diff -- CHANGELOG.md pnpm-lock.yaml packages/asset-inliner/package.json` — **empty**. Scoped status confirms earlier task files remain present and dist/temp files do not enter the tracked diff.
- Follow-ups/limitations: no new independent AIR-05 follow-up required. AIR-06 installed-consumer/example work and AIR-07 independent integrated verification remain pending; no packed-consumer, full-package rerun or repository-wide pass is claimed here. The existing AIR-04 full-package checkpoint is preserved. Historical Windows integration and discovery/read TOCTOU limitations remain as recorded above.

### Task AIR-06: Make shipped examples self-contained and verify installation

Status: completed

Kind: improvement

Priority: P2 — an installed consumer cannot run repository-fixture examples and one resolver block has undefined bindings.

Suggested agent: installed TypeScript consumer/documentation implementer.

Dependencies: AIR-05.

Primary ownership: `README.md`, `website/docs/packages/asset-inliner.md`, example/packed-consumer tests and fixtures; public JSDoc where needed.

Finding: README quickstarts claim to run from package root using unpublished test/fixtures paths; package files includes only dist/README. The later custom resolver example imports only createDefinitionRegistry/inlineCss but uses builtInDefinitions, createAssetCatalog, and css. Existing example tests execute equivalent rewritten snippets, not the exact shipped blocks.

References: `README.md` baseline 40–100 and 294–313; `package.json` files/exports; `test/readme-examples.test.ts`. Residual verification of AIH-11 claims.

Requirements:

1. Make primary happy-path examples executable using in-memory assets or explicitly created temporary/user assets with complete imports; label illustrative fragments accurately. Remove false package-root fixture claims and exercise actual resolver alias behavior.
2. Check actual self-contained shipped blocks rather than independent approximations. Verify new contracts AIR-01–05 in README/website and key emitted declarations, including changed-contract notes without root CHANGELOG edits.
3. Add/execute maintainable real packed-consumer verification using the package root, named ESM imports, strict NodeNext declarations, declared dependencies, and corrected behavior. Keep package metadata changes evidence-driven.

Acceptance criteria:

- Actual designated runnable README snippets execute from an isolated installed consumer without repository fixtures or source imports; imports/types resolve under strict NodeNext.
- Tarball contains advertised JS/declaration/README paths and works in plain Node; source-only successes cannot satisfy this task.
- Docs and types agree on output safety, srcset tokens, base handling, syntax caps, and existing constraints.

Verification: V1 actual-snippet/consumer tests; V2 typecheck/lint; V4 with recorded commands and results.

Completion evidence (isolated task agent 6, 2026-09-26):

- Changed for AIR-06: `packages/asset-inliner/README.md`, `website/docs/packages/asset-inliner.md`, declaration JSDoc only in `packages/asset-inliner/src/{html,types,policy}.ts`, replacement of `packages/asset-inliner/test/readme-examples.test.ts`, new `packages/asset-inliner/test-consumer/{README.md,contracts.mts,runtime.mjs,resolution-guard.mjs}`, and this status/evidence section. Preserved AIR-01–05 implementations and unrelated/user work. No new exports, runtime implementation changes, package metadata changes, or root CHANGELOG edits.
- Shipped examples: seven stable `runnable:` blocks (`encode`, `format`, `css`, `html`, `files`, `custom-kind`, `resolver`) now contain complete imports and inputs. In-memory examples require no repository assets; the file example creates its own assets, checks async/sync dry-run and async write, and removes its directory in `finally`. Byte catalogs explicitly opt into basename matching; filesystem examples retain default exact matching. Custom-kind actually uses the custom audio definition, and the resolver example references `legacy.png`, exercises the alias branch once, and emits the custom JXL asset. Added a strict NodeNext compile/plain-Node run command and labeled application-dependent detection/policy/error fragments. Removed package-root fixture claims and undefined resolver bindings.
- Exact-text verification: the harness reads the **installed tarball's README**, requires all seven designated IDs, extracts each block verbatim into its own `.mts`, and compiles/runs it unchanged. A second copy appends assertions after the unchanged block to verify real outcomes (never supplies missing example bindings). Both copies compile with `strict`, `NodeNext`, `skipLibCheck: false`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`, then execute as emitted `.mjs` in plain Node. The previous six source-imported approximation tests and their leaked fixture-tree setup were replaced. No pre-fix execution is claimed for this documentation task; the missing shipped fixtures/undefined bindings were established by inspection.
- Packed installation and isolation: a fresh consumer with a distinct package name gets its own `package.json`/`package-lock.json` and a real local `.tgz` install, using only the package's declared dependency graph plus consumer dev dependencies TypeScript/Node types. npm uses repo-local empty user/global configs and a reusable repo-local cache; `--prefix <consumer> --workspaces=false` prevents workspace install discovery. Root/package manifests and `pnpm-lock.yaml` are compared before/after. The package directory must be a real install, not a symlink, and root runtime resolution must equal its installed `dist/index.mjs`. Direct dependency resolution from that entry and exact declared versions are asserted. A preloaded synchronous Node resolution hook rejects **every** non-builtin module outside the consumer (including transitive/dynamic imports and realpath escapes); inherited `NODE_OPTIONS`/`NODE_PATH` are cleared. Negative controls prove an existing workspace entry is rejected and removing local `parse5` fails instead of silently succeeding through an ancestor. TypeScript's complete `--listFiles` output must include the installed `dist/index.d.mts` and every compiler/source/library realpath must be consumer-owned; type roots are explicitly local.
- V4 runtime/type coverage: named root ESM imports, no default export, all advertised JS/declaration/README paths, dry-run/actual pack file-list equality, exact packed README/manifest equality, strict public `ResolverInput.resolutionBaseDir`/options/file results/policy/error types, readonly context, negative async-resolver/default/internal-export type assertions, and emitted JSDoc checks. Plain Node exercises actual lazy `file-type` content/verify detection, all ten defaulted policies and caps plus optional `maxInlineBytes`, reparsed unquoted style boundaries with exact/one-under output limits, whole comma-srcset resolution with a suffix decoy and source offsets, repeated-patch byte/metadata identity, local/remote bases across simple/srcset/style paths, honest hook/diagnostic document identity, exact 256/512 HTML limits and 8,000-depth HTML/CSS rejection, embedded CSS limits/quoted delimiters, and async/sync file writes/no-writes with preserved over-depth/remote files and successful siblings.
- Contract review: retained AIR-01 style escaping/accounting, AIR-02 complete srcset tokens/descriptors, AIR-03 base precedence/mapping and optional `resolutionBaseDir`, AIR-04 depth counting/default 256/cap 512, and AIR-05 byte/location/fallback preservation. Added the one-pass patch performance note without changing limits. README/website explicitly qualify HTML recovery and malformed embedded CSS by resource limits, rather than claiming malformed HTML never throws. Updated output accounting and file-option caps, resource-error empty-result JSDoc, catalog-wide file budget/serial discovery wording, and corrected `normalizePolicy` JSDoc: `maxInlineBytes` has no default and remains absent when omitted. Website now has matching runnable in-memory examples and the full policy default/cap table.
- All commands ran serially from `<repo-root>` with **`TMPDIR=<repo-root>/_tmp-air06`**. The parent was checked before creation and `git check-ignore` confirmed the directory is ignored. Read only the requested in-repo skill; no external skill reads, `<system-tmp>/opencode`, outside-repository consumer work, or nested agents.
- Build: `pnpm --filter @web-ts-toolkit/asset-inliner build` — **ESM and declaration builds passed**, initially and again after final JSDoc changes. Inspected `dist/index.d.mts`: public `resolutionBaseDir`, pure/file syntax options, 256/512 constants, base/srcset/style/error JSDoc, output accounting/file caps, and optional policy wording survive emission. Internal helpers remain absent. Generated dist is ignored and absent from the tracked diff.
- Initial focused V1/V4: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/readme-examples.test.ts` — **11/11 passed** (27.15 s). This first run printed npm's inherited-config warning and the expected missing-dependency negative-control error; subprocess output is now captured and reported only for unexpected failures. Added the existing-workspace-entry negative control before the final run.
- Final V1/V4: `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/readme-examples.test.ts test/html-style-boundaries.test.ts test/html-srcset-tokens.test.ts test/html-base.test.ts test/syntax-depth.test.ts test/html-patch-assembly.test.ts test/policy.test.ts test/target-limits.test.ts` — **8 files / 244 tests passed** (33.74 s), including all **11 installed-consumer checks**. Only the existing Vite native-config-loader compatibility warning appeared.
- V4 subprocess commands actually executed by that test: from the package, `npm pack --dry-run --json --ignore-scripts` and `npm pack --json --ignore-scripts --pack-destination <consumer>`; from the consumer, `npm install --prefix <consumer> --workspaces=false --ignore-scripts --no-audit --no-fund`, `npm ls --all --prefix <consumer> --workspaces=false`, `node node_modules/typescript/bin/tsc -p tsconfig.json --listFiles`, and `node --import ./resolution-guard.mjs compiled/{readme,checked}-<ID>.mjs` for all seven IDs, plus guarded `runtime.mjs` and the two negative controls. **All positive checks passed; both negative controls failed as required.** Current runtime: Node **v26.7.0**, Linux. Metadata advertises Node >=22; the test-only synchronous resolution guard requires Node >=22.15, documented in its maintainer README.
- V2: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **passed**; `pnpm exec eslint packages/asset-inliner` — **passed**, no findings. No full-package/workspace rerun claimed here; the AIR-04 full-package checkpoint remains recorded and AIR-07 owns integrated verification.
- Final diff checks: `git diff --check -- packages/asset-inliner website/docs/packages/asset-inliner.md docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **passed**. `git diff -- CHANGELOG.md pnpm-lock.yaml package.json packages/asset-inliner/package.json` — **empty**. Scoped status preserves preceding task paths. Repository-local temp inspection confirms all consumers/tarballs/runtime fixtures were cleaned; only ignored `node-compile-cache/` and `npm-cache/` remain under `_tmp-air06`.
- Follow-ups/limitations: no new independent AIR-06 follow-up required. AIR-07 remains pending for independent integrated review and V3. This is a real npm-pack/install check of this package, not a release-artifact or repository-wide pass. First consumer installation requires registry access (subsequent runs can reuse the local cache). Historical real-Windows filesystem integration and discovery/read TOCTOU limitations remain as recorded above.

### Task AIR-07: Independently review integrated contracts and all task evidence

Status: completed

Kind: improvement

Priority: P1 — security and semantic boundaries cross all preceding tasks and need independent verification.

Suggested agent: independent reviewer who implemented none of AIR-01–06.

Dependencies: AIR-01, AIR-02, AIR-03, AIR-04, AIR-05, AIR-06.

Primary ownership: this task file and integration evidence; small directly necessary corrections with focused regressions are allowed, independent new outcomes need a follow-up task.

Finding: previous green suites and completed tasks missed the specific residual boundaries above. Completion must reconcile runtime behavior, packed types/docs, benchmark evidence, and each acceptance criterion.

References: AIR-01–06 and related prior task records.

Requirements:

1. Independently check each acceptance criterion/evidence, including alternate HTML entry paths, decoder fallback, srcset and base interaction, nested inputs, file writes, metadata, and consumer behavior.
2. Run V2, V3, and review/re-run V4 as needed; keep all builds/tests serial. Record actual root command failures, if any, as workspace-context limitations with ownership and no false full-suite pass.
3. Review scoped diff for unnecessary exports, duplicated parser logic, style consistency, temp leaks, untracked artifacts, and unintended edits. Confirm root CHANGELOG unchanged.

Acceptance criteria:

- All AIR-01–06 acceptance criteria pass with concrete Completion evidence; all seven tasks have honest status and this final review records a per-task verdict.
- Package tests/typecheck/lint and packed-consumer requirements pass; repository checks actually run and are accurately reported. Any in-scope failure is fixed and reverified before completion.
- Historical Windows blocker and TOCTOU limitation remain explicit; no unrelated files are overwritten.

Verification: independent code/evidence review, V2/V3, V4 evidence plus relevant consumer replay.

Completion evidence (fresh isolated reviewer7, 2026-09-26):

- Independence/scope: implemented none of AIR-01–06; marked AIR-07 `in_progress` before review. Read this entire task and every preceding Completion evidence section, root `AGENTS.md` (no more-specific asset-inliner AGENTS exists), the in-repo installed-package skill, the historical AIH-01 Windows blocker, relevant source/tests, package metadata/build configuration, shipped README, website, emitted declarations, consumer harness/fixtures, and benchmark. No external skill reads or delegation. Reviewed source behavior and executable assertions rather than accepting previous green-suite claims alone. **No scoped defect requiring correction or independent package follow-up was established.** No package implementation, tests, exports, or documentation were changed by reviewer7.

### Per-task acceptance verdicts

| Task   | Independent verdict and concrete acceptance evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AIR-01 | **Pass.** Traced `serializeStyleAttrValue`/`escapeHtmlAttrValue`, both style transform branches, raw-source single-decode tree values, projected serialized-byte deltas, and final serialization accounting. `html-style-boundaries.test.ts` has **17 passing cases** covering all three quote contexts, encoded whitespace/equals/both quotes, suffixes, literal delimiters, narrow-decoder disagreement, forced tree fallback, exact/one-under limits and async/sync disk preservation. Existing decoded-attribute, embedded-CSS and malicious resolver/catalog tests also pass. Style-element raw text is kept separate from attribute decoding.                                                                                                                                                                                                                                             |
| AIR-02 | **Pass.** Inspected the single offset-producing tokenizer's URL, descriptor and parenthesis states and width/density/height validation; traced mapped, parser-decoder-fallback and missing-source paths through the same handler. `html-srcset-tokens.test.ts` has **60 passing cases**, including complete comma filenames with distinct suffix decoys, remote URLs with zero resolver calls, data URLs, descriptorless/trailing/repeated commas, five ASCII whitespace characters, CRLF/numeric CR/named entities, malformed/duplicate/conflicting descriptors, duplicate locations, img/source, source preservation and async/sync exact-path files. Original-source UTF-16 offsets and missing-source `-1` records are asserted, not inferred from replacement counts.                                                                                                                      |
| AIR-03 | **Pass.** Traced first applicable HTML-namespace base selection before walking, inert template content, missing/empty/first/later href precedence, one entity/percent decode, directory/document/root-relative mapping, query/fragment handling, and remote/unmappable rejection before hooks/catalog/basename lookup. `html-base.test.ts` has **55 passing cases** across all eight supported simple/srcset/style paths, fragment/document entry, decoder disagreement, tree fallback and both file APIs. Distinct physical assets prove effective-directory selection; hook `documentPath`, optional `resolutionBaseDir`, diagnostic `filePath`, attempted `resolvedPath`, and no-document cases are checked. README/website/declarations accurately qualify this as filesystem mapping without origin/CSP/fetch/runtime-DOM inference.                                                       |
| AIR-04 | **Pass.** Inspected insertion-time parse5 ancestry guarding (including template-host links and temporary fragment-root exclusion), iterative completed-tree checks, pre-parse CSS lexical checks and iterative parser-tree checks before recursive walk/stringify. Verified normalized default **256**, cap **512**, validation at pure/file entries, shared file dispatch and both embedded-CSS forwarding branches. `syntax-depth.test.ts` has **42 passing cases**: 8,000-depth div/template/unclosed-template/CSS reproductions, 4/256/512 exact and one-over boundaries, parser-implied elements, no-reference inputs, quoted/comment/escaped delimiters, template and forced-serialization paths, embedded decoded/raw/missing-source paths, and mixed async/sync batches that preserve rejected disk bytes and still write successful siblings. Existing target/policy/limit tests pass. |
| AIR-05 | **Pass.** Inspected safe-integer/nonempty/in-bounds/overlap validation, copied ascending sort, original-source slices plus one join, and reuse for raw/decoded srcset. Invalid assembly retains tree fallback; unchanged content retains early identity return; projected count/byte and final serialized-byte checks remain active. `source-patches.test.ts` (**19**) and `html-patch-assembly.test.ts` (**8**) pass, covering adjacent/first/last/deletion/empty patches, multibyte/surrogate/entity coordinates, repeated complete metadata, exact bounds, and actual overlap/missing/out-of-bounds/fractional serializer fallback. Independently replayed the benchmark below; every output and metadata hash matches the recorded before/after hashes. Historical before timings were reviewed, not regenerated by reverting preceding work.                                               |
| AIR-06 | **Pass.** Inspected the tarball's advertised root paths, bundled internal ESM build, named public exports, emitted `index.d.mts` JSDoc/options, seven exact runnable README blocks and website agreement. Inspected and replayed all **11** `readme-examples.test.ts` checks within both full-package runs below: actual pack/install, installed README extraction, unaltered and assertion-appended snippets, strict local NodeNext compiler/declarations, guarded plain-Node runtime including lazy file-type, and two isolation negative controls. These are real installed-consumer successes, not workspace self-reference or source-import substitutes. No additional public parser/helper exports or package metadata changes were needed.                                                                                                                                               |
| AIR-07 | **Pass for the scoped review.** All six preceding acceptance sets are accepted with the independent inspection and runtime evidence here. Package/type/lint/packed checks pass. All required root context commands were attempted and substantive build/test/lint runs completed with the exact limitations below; an incomplete root test suite is not called a repository pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Commands and actual results

- All reviewer-owned temporary work is in ignored **`<repo-root>/_tmp-air07`**, checked with `git check-ignore`, and all build/test/typecheck/lint/benchmark commands used that absolute **`TMPDIR`**. Commands were issued one at a time; no concurrent top-level build/test commands or nested agents were launched.
- **V2:** `TMPDIR=<repo-root>/_tmp-air07 pnpm --filter @web-ts-toolkit/asset-inliner typecheck` — **exit 0**. `TMPDIR=<repo-root>/_tmp-air07 pnpm --filter @web-ts-toolkit/asset-inliner test` — **exit 0**, ESM/declaration build passed, **38 files / 772 tests passed / 1 existing todo (773 total)**, test duration **26.99 s**. `TMPDIR=<repo-root>/_tmp-air07 pnpm exec eslint packages/asset-inliner` — **exit 0**, no findings. Existing Vite native-config-loader warning only.
- **V4 replay:** V2 above and the subsequent root test's asset-inliner stage each executed the full installed-consumer harness successfully. Actual subprocesses: package-local `npm pack --dry-run --json --ignore-scripts`; `npm pack --json --ignore-scripts --pack-destination <repo-local-consumer>`; consumer-local `npm install --prefix <consumer> --workspaces=false --ignore-scripts --no-audit --no-fund`; `npm ls --all --prefix <consumer> --workspaces=false`; `node node_modules/typescript/bin/tsc -p tsconfig.json --listFiles`; guarded `node --import ./resolution-guard.mjs compiled/{readme,checked}-<ID>.mjs` for all seven IDs and `runtime.mjs`. All positive checks passed; loading the existing workspace entry and hiding installed parse5 both failed as required. The harness asserts real non-symlink installation, exact dependency versions, local realpaths for runtime/transitive/dynamic imports and all TypeScript listed files, exact packed README/manifest and advertised files. Strict compilation includes `skipLibCheck: false`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Consumers/tarballs/runtime fixtures were cleaned by the harness.
- **V3 build, one substantive invocation:** `TMPDIR=<repo-root>/_tmp-air07 npm_config_workspace_concurrency=1 pnpm build` — **exit 0**. The workspace package/app build completed, including asset-inliner; website is not a member of `pnpm-workspace.yaml`, so this is not a website build claim. **Scheduling limitation:** pnpm 11 did not honor the legacy `npm_config_workspace_concurrency` variable: output shows its normal internally parallel workspace build scheduling. The top-level build was allowed to finish before test/lint; it was not rerun. The accepted `pnpm_config_workspace_concurrency=1` setting was verified with `pnpm config get workspace-concurrency` and used for subsequent root execution. Do not describe the internal root build as fully serialized. Harness-truncated build output was not followed by outside-repository log access.
- **V3 test launch/setup:** to retain complete output inside the repo and redirect home/cache/fixture work, an ignored `_tmp-air07/root-check.mjs` runner invokes the existing pnpm executable synchronously with a **1,200,000 ms** allowance and logs to a repo-local file. Its first launch through the asdf shim with redirected HOME returned **126 in 16 ms**, empty output, before the root test script ran. Corrected only this review-local runner to invoke the existing executable returned by `asdf which pnpm` and retain `ASDF_DATA_DIR` for toolchain execution. No package code was changed. This was an infrastructure launch failure, not a test result or an extra completed root suite run.
- **V3 test, one substantive invocation:** `TMPDIR=<repo-root>/_tmp-air07 node _tmp-air07/root-check.mjs test` executed **`pnpm test`**, with repo-local HOME/npm/XDG/Mongo fixture caches, `pnpm_config_workspace_concurrency=1`, and the root script's explicit `--workspace-concurrency=1`. **Exit 1 after 181.999 s**, with no timeout/output-size bailout. Full output is `_tmp-air07/root-test-run.log`. Completed stages: asset-inliner **38 files, 772 passed + 1 todo** (26.32 s), create-access-router-mongo-starter **18 files, 335 passed** (97.85 s), express-oidc-vault **24 files, 474 passed / 1 failed** (15.34 s). Across those stages: **79 files passed / 1 failed; 1,581 tests passed / 1 failed / 1 todo**. The failure is `packages/asset-inliner`-independent: `packages/express-oidc-vault/test/packed-consumer.test.ts:299`, **OIDC-11 packed-package consumer compatibility > installs the staged tarball and runs CJS, ESM, NodeNext, NodeNext-CJS, and Bundler consumers**. `node consumer.mjs` cannot resolve `@web-ts-toolkit/express-oidc-vault` in its repo-local consumer (`ERR_MODULE_NOT_FOUND`); its later NodeNext/Bundler commands are not reached. Inspection finds that harness uses `pnpm install --no-frozen-lockfile` inside the enclosing workspace without the asset-inliner harness's independent-prefix/workspace isolation. This is an OIDC consumer-harness/workspace-context failure, not evidence that its published package is broken. Root stops at `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`; an express-runtime command-start line appears but no completed tests follow. Remaining package/app tests are **not verified by this root run**. No unrelated package fix was attempted.
- **V3 lint, one invocation:** `TMPDIR=<repo-root>/_tmp-air07 node _tmp-air07/root-check.mjs lint` executed **`pnpm lint`** — **exit 1 after 30.339 s**, **34 errors / 0 warnings**. Full output is `_tmp-air07/root-lint-run.log`. **22 errors** belong to the already-untracked unrelated `packages/json-frame/test-decl-consumer/inference-contract.mts` (empty-object types and values used only as types). **12 errors** belong to generated workspace-context output: one `self` error in `_tmp-air07/f2e3c844fa1a713810db7916dc0f7386/sw.js` from the app/PWA build, and eleven errors in `_tmp-air07/jiti/{dist-index.2ae84f0d,shared-marker.82dbaf7f,watch-smoke-runtime.config.6de22ed5}.cjs` from build/starter-test fixtures. Git ignores `_tmp*`, but root ESLint still scans these generated files. None is an asset-inliner source/test lint failure. The generated review-owned fixture/cache directories were subsequently removed; root lint was **not rerun** and no post-cleanup root pass is claimed.
- **Benchmark replay:** `TMPDIR=<repo-root>/_tmp-air07 node --expose-gc packages/asset-inliner/benchmarks/html-patches-benchmark.mjs` — **exit 0**, Node **v26.7.0 / Linux x64**, default limits, same 10,240-byte asset, one warmup/three measured samples per size. Medians for **100 / 250 / 500 / 1,000** references: **10.415 / 20.008 / 38.179 / 60.964 ms**; output bytes **1,369,000 / 3,422,500 / 6,845,000 / 13,690,000**. All four output SHA-256 and all four full-metadata SHA-256 values exactly match AIR-05's recorded common hashes. This independently confirms current output equivalence and reduced-copying behavior, not a new before/after experiment or a universal timing guarantee.

### Hygiene and unresolved limitations

- The root fixture audit inspected package test/build scripts, literal external-path uses, tmpdir-based consumer/support helpers, scaffold home checks and Mongo fixture setup before invocation. Used repo-local HOME/caches for the substantive root test/lint, preserving existing external toolchain execution only. No consumer was deliberately created outside the repository and no outside file was read with review tools. The ignored runner's complete logs remain local; the harness's automatically generated external build log was not opened.
- Reviewer7 changed only this task document in the intended final diff. Ignored review utilities/logs are under `_tmp-air07`; the cleanup utility removed **34** known generated fixture/cache directories, including the files that polluted root lint. Only review scripts/logs and reusable `node-compile-cache`/`npm-cache` remain there. Installed consumers/tarballs are absent. Prior `_tmp-air01`–`_tmp-air06` work and unrelated dirty packages were preserved.
- `git diff --check -- packages/asset-inliner website/docs/packages/asset-inliner.md docs/tasks/20260926-214734-asset-inliner-html-business-contracts.md` — **exit 0**. Final scoped status preserves all preceding task files; `git diff --exit-code -- CHANGELOG.md pnpm-lock.yaml package.json packages/asset-inliner/package.json` — **exit 0 / empty** after root execution. `git check-ignore` confirms emitted `dist/index.mjs`, `dist/index.d.mts` and `_tmp-air07` are ignored. Root `CHANGELOG.md` was not edited. Final AIR status: **7 completed / 0 pending / 0 blocked** in this task document; historical AIH-01 is separately blocked as below.
- Historical **AIH-01 remains blocked on real Windows cross-drive/UNC filesystem integration**; portable predicates are covered by the passing package suite, but this Linux run cannot discharge that blocker. Discovery/read/write **TOCTOU** and metadata-preflight growth races remain explicit documented limitations. Runtime verification here used Node v26.7.0/Linux; no minimum-Node-version matrix, browser handler execution, Windows run or release-artifact verification is claimed. Unrelated root test/lint failures and the internal root-build scheduling deviation above remain honestly recorded. They do not establish an in-scope acceptance failure; all AIR-01–06 scoped contracts and required package/packed checks passed.

### Coordinator final verification

- Confirmed the entire task document has **7 completed tasks**, each with Completion evidence, and reviewed the independent per-task verdicts and scoped Git status/diff. No additional task or in-scope blocker was identified.
- Re-ran root lint after reviewer-owned generated fixtures were cleaned, specifically to resolve the temporary-output uncertainty: `TMPDIR=<repo-root>/_tmp-air07 pnpm lint` — **exit 1, 22 errors / 0 warnings**, all in the pre-existing unrelated `packages/json-frame/test-decl-consumer/inference-contract.mts`. The 12 generated-file errors from the reviewer's earlier invocation are gone. This is the final root-lint result; no root pass is claimed. No unrelated source changes were made.
- Final scoped diff/unchanged-manifest checks were repeated; root `CHANGELOG.md`, package manifests, and workspace lockfile remain unchanged. All work after the user steering stayed within the repository.

## Definition of done

Every task above is implemented, meets its acceptance criteria, and has status `completed` with Completion evidence; the independent reviewer accepts integrated behavior. Required unrun scoped checks keep a task blocked. Broader unrelated workspace failures and the historical Windows-only blocker are reported separately, never relabeled as passes. Root `CHANGELOG.md` is unchanged.
