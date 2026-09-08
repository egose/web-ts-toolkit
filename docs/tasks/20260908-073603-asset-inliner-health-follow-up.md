# Asset Inliner Health Follow-Up

Created: 2026-09-08 07:36:03 (local timestamp)

Overall status: partially complete — AIH-02 through AIH-12 completed with evidence and independent review; AIH-01 blocked on Windows runner (portable predicate done)

## Objective

Close newly identified correctness, output-safety, filesystem, resource-budget, and installed-consumer documentation gaps in `packages/asset-inliner`. This document is an executable brief for sub-agents, not authorization to implement unrelated features.

Related historical plans:

- `docs/tasks/20260828-113925-asset-inliner-package.md`
- `docs/tasks/20260828-214456-asset-inliner-health-review-remediation.md` (completed; referenced below as AINL2)

The prior remediation is complete, so this is a separate follow-up. Specific residual failures are linked to their original task instead of repeating generic remediation. Preserve historical completion evidence.

Non-goals: remote fetching, sanitization of asset bytes, CommonJS, CLI/bundler adapters, SCSS/Less, broad public-API redesign, or adversarial TOCTOU-proof filesystem sandboxing.

## Coverage And Baseline

- Three non-overlapping review agents inspected parsing/resolution, file/discovery policies, and encoding/detection/catalog code with associated tests and both prior task files. Coordinator inspected package metadata, entrypoint, build configuration, README, a declaration sample, and critical filesystem branches.
- Initial worktree was clean. No runtime source or tests were edited for this review.
- `pnpm --filter @web-ts-toolkit/asset-inliner test`: passed; package rebuilt successfully, 22 test files passed, 473 tests passed, 1 todo. Existing Vite native-config-loader warning remains.
- `pnpm --filter @web-ts-toolkit/asset-inliner typecheck`: passed.
- Review-agent read-only probes against current source confirmed resolver injection, font-hint injection, entity handling, mixed-case URL truncation, per-root file-count bypass, real ICO/CUR detection failure, and MIME-fragment serialization. A `path.win32` predicate probe confirmed cross-drive/cross-server acceptance; actual Windows filesystem integration was not run.
- Cancellation and exclusive-temp-creation findings are established from control flow; deterministic filesystem regressions remain implementation acceptance criteria, not tests claimed to have run.
- Full repository build/test/lint, packed-consumer installation, browser tests, benchmarks, memory profiling, and exhaustive declaration inspection were not run. Package metadata and build paths agree; no broken export was established.

## Execution Rules

- Use repository-relative paths in task updates. Run all commands below from the repository root unless explicitly stated otherwise.
- Priorities follow the previous review: P0 = explicit boundary bypass or unsafe output; P1 = materially false correctness/resource/cancellation contract; P2 = bounded maintainability or usability issue; P3 = optional capability.
- Add a regression that fails before each defect fix. Tests belong with fixes. Do not treat passing existing tests as proof that the new acceptance criteria hold.
- Keep pure transforms separate from I/O; preserve deterministic ordering, exact-path lookup, immutable results, honest sync APIs, and stable diagnostics.
- Prefer small shared validation/serialization boundaries over parser-specific copies. Do not introduce a framework to unify all sync/async I/O.
- Update README, public types/JSDoc, website documentation and release notes where external behavior changes. README/website edits have one integration owner to avoid concurrent conflicts; implementing agents provide precise contract notes.
- Never manually edit generated `dist/`. Serialize every build/test command, even across otherwise independent agents, because scripts rebuild shared outputs.
- Set tasks to `in_progress` when owned, `blocked` with a concrete prerequisite if necessary, and `completed` only after acceptance and verification pass. Append changed paths, exact commands/results, and follow-up evidence.

Suggested allocation: filesystem agent owns AIH-01 through AIH-04 in dependency order; catalog/detector agent owns AIH-05 and AIH-10; parser agent owns AIH-06 through AIH-09 in dependency order; documentation agent owns AIH-11 after implementation. AIH-12 must be owned by an independent reviewer. AIH-10 follows AIH-06 because both may change data-URL validation. Agents must coordinate incidental shared-file edits before starting them.

## Shared Verification

- V1: targeted package tests, for example `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/discovery.test.ts`. Substitute the task's focused test paths, relative to the package.
- V2: `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` and `pnpm --filter @web-ts-toolkit/asset-inliner test`, run serially after each implementation group.
- V3: final repository `pnpm build`, `pnpm test`, and `pnpm lint`, run serially. Record unrelated failures separately; do not silently waive required checks or claim a clean baseline.
- V4: after build, run `npm pack --dry-run` from `packages/asset-inliner`, then create/install a real tarball into an isolated consumer under `/tmp/opencode`. Verify Node ESM named imports and TypeScript NodeNext resolution using only packed files and declared dependencies. Record the actual commands. Do not change the workspace lockfile for consumer experiments.

## Tasks

### Task AIH-01: Reject Cross-Volume Traversal Escapes

Status: blocked

Kind: defect

Priority: P0; bypasses an explicitly configured filesystem containment boundary on Windows.

Suggested agent: filesystem security

Dependencies: none

Primary ownership: `packages/asset-inliner/src/discovery.ts`; `packages/asset-inliner/test/discovery.test.ts` and focused Windows containment tests.

Finding and references: `isWithinRoot` at `src/discovery.ts:47-54` uses `!path.isAbsolute(rel) || !rel.startsWith('..')`. Windows relative results on different drives or UNC servers are absolute but do not start with `..`, so they are accepted. Canonical enforcement at lines 212-218 inherits this error. This is distinct from AINL2-02's symlink-ancestor fix and documented TOCTOU risk. Existing discovery tests at lines 259-290 and 326-439 cover same-filesystem escapes, not volume identities. All abbreviated source/test references in this document are relative to `packages/asset-inliner`.

Requirements:

1. Reject parent-relative and absolute relative-results at the shared containment predicate; retain exact-root and descendant acceptance.
2. Keep canonicalization, explicit `allowTraversalEscape`, and first-seen logical paths unchanged. Replace misleading POSIX-oriented comments with the actual invariant.

Acceptance criteria:

- `path.win32` cases for different drives and different UNC servers reject; sibling prefixes reject; root/descendants pass. Tests must exercise production predicate logic, not a copied expression.
- Async and sync Windows discovery reject an existing outside asset with escape disabled. Cover target discovery/write with a prebuilt catalog and verify the outside target is unchanged.
- Actual Windows integration is run, or the task remains blocked on a Windows runner with the portable predicate evidence recorded.

Verification: V1 discovery/containment tests, Windows integration, V2.

Completion evidence: Prerequisite for completion: Windows runner (actual Windows filesystem integration could not run on Linux; per spec the task stays blocked until then). Portable part is done. Changed paths: `packages/asset-inliner/src/discovery.ts` (fixed `isWithinRoot`: now rejects parent-relative `..` results AND any absolute `relative()` result such as cross-drive/cross-UNC-server targets, keeps exact-root/descendant acceptance; exported with optional path-impl param defaulting to `node:path` so tests inject `path.win32`; canonicalization, `allowTraversalEscape`, and first-seen logical paths unchanged; replaced POSIX-oriented comments with the real invariant), `packages/asset-inliner/test/discovery-cross-volume.test.ts` (new; exercises production `isWithinRoot` with `path.win32`: different drives reject, different UNC servers reject, sibling prefixes/parent-relative reject, root/descendants and same-share UNC descendants pass; plus portable POSIX analogues: async/sync `discoverAssets` reject an existing outside asset with escape disabled and accept with `allowTraversalEscape`, and async/sync `inlineFiles` with a prebuilt byte catalog reject an outside target leaving it unchanged). Regression proof: with the old `!isAbsolute || !startsWith('..')` tail reinstated, 2 of the 6 new tests fail (cross-drive and cross-server accepted); with the fix all pass. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/discovery.test.ts test/discovery-cross-volume.test.ts` -> 2 files, 27 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 23 files, 479 passed, 1 todo. `git status --short` shows no `dist/` or `CHANGELOG.md` changes from this task (other modified paths in the worktree pre-existed via parallel agents). Remaining for Windows runner: run the same containment asserts against real `C:`/`D:` drives and UNC shares plus async/sync discovery of an existing outside asset with escape disabled.

### Task AIH-02: Preserve Every Committed Result On Cancellation

Status: completed

Kind: defect

Priority: P1; a caller can receive only cancellation after files were modified.

Suggested agent: filesystem orchestration

Dependencies: AIH-01 (shared filesystem test ownership)

Primary ownership: `packages/asset-inliner/src/files.ts`; `packages/asset-inliner/test/files-write.test.ts`.

Finding and references: `src/files.ts:826-845` inspects settled promises in input order and may throw on an earlier aborted entry before observing a later committed result in the same chunk. Sync post-transform checks at lines 953-972 can throw after an earlier file committed, for example when the second resolver aborts. The existing cancellation regression at `test/files-write.test.ts:290-327` uses async concurrency 1 only. This task is a residual-regression extension of completed AINL2-03, not a new generic cancellation contract.

Requirements:

1. Determine all committed outcomes in a settled chunk before deciding whether cancellation may reject.
2. Route sync cancellation at every post-commit exit through accurate ordered per-target reporting. Keep rejection with the signal reason when nothing committed and prevent any later write after cancellation.

Acceptance criteria:

- Deterministically gate two async targets at concurrency 2: index 1 commits before index 0 aborts; the call returns index 1 as written and index 0 as not written.
- Abort from the second target's synchronous resolver after the first target commits; the first written result remains observable.
- Verify disk contents, result order, untouched remaining targets, pre-commit rejection, and no leaked owned temp files. Avoid timing-only tests.

Verification: V1 files-write tests, V2.

Completion evidence: Async settled-chunk handling now pre-scans the whole chunk for any `written:true` before deciding whether an abort may reject, so a later-index commit (b.css) is preserved when the earlier index (a.css) aborts; sync loop routes every post-commit cancellation exit (read-catch, post-read, transform-catch, post-transform, pre-write x2) to ordered per-target error reporting with `written:false` instead of throwing, while pre-commit aborts still reject with the signal reason and no later write occurs. Changed paths: `packages/asset-inliner/src/files.ts` (two-pass settled-chunk commit detection; sync abort-to-result conversions preserving inlineResult diagnostics where available), `packages/asset-inliner/test/files-cancellation-commit.test.ts` (new; 4 tests: async concurrency-2 gate where b.css rename commits then aborts/releases gated a.css read — returns [not-written, written, not-written] in input order with disk/order/temp checks; sync second-resolver abort after first commits over 3 targets; async + sync pre-commit rejection with signal reason identity and untouched disks). Regression proof: new file fails 2/4 before fix (both commit-preservation cases reject with AbortError), passes 4/4 after. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/files-write.test.ts test/files-cancellation-commit.test.ts` -> 2 files, 16 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 24 files, 483 passed, 1 todo. `git status --short` shows only AIH-02 paths added by this task (`src/files.ts`, `test/files-cancellation-commit.test.ts`); other worktree modifications pre-existed via parallel agents; no `dist/` or `CHANGELOG.md` changes.

### Task AIH-03: Bound Target Reads Before Allocation

Status: completed

Kind: defect

Priority: P1; configured parser limits do not prevent large file-read allocations or retention.

Suggested agent: filesystem/resource policy

Dependencies: AIH-02

Primary ownership: `packages/asset-inliner/src/files.ts`; `packages/asset-inliner/test/target-limits.test.ts`.

Finding and references: `src/files.ts:773-799,944-968` reads all UTF-8 content before enforcing `maxTargetBytes`, then retains oversized content in the error result. Async reads omit the signal. `test/target-limits.test.ts:220-244` verifies no write, not bounded reads. AINL2-01 fixed asset reads; AINL2-04 bounded target parsing only. This is the remaining target-I/O gap.

Requirements:

1. Reject oversized regular targets before body reads and decoding. Keep a check against actual bytes for growth races; document whether reads are strictly bounded or metadata-preflight only.
2. Pass cancellation to supported async I/O and preserve AIH-02 reporting.
3. Define a bounded error-result content contract for unread oversized targets. Do not load rejected content just to fill the result; update types/docs and release notes for this observable change.

Acceptance criteria:

- Async/sync oversized regular-file tests assert no body read, `RESOURCE_LIMIT`, `written:false`, unchanged disk, and bounded returned content.
- Exact-boundary UTF-8 input succeeds; simulated growth is rejected; cancelled async reads receive the supplied signal.
- Record a modest oversized-target experiment showing bytes read/retained at concurrency 1 and greater than 1. Do not assert an unmeasured memory improvement or allocate enormous fixtures.

Verification: V1 target-limits and files-write tests, measured read/retention experiment, V2.

Completion evidence: Oversized regular targets are now rejected by a `stat` metadata preflight before any body read or decoding, in both `inlineFiles` (async) and `inlineFilesSync`; the post-read actual-bytes check is kept for growth races. Reads are documented as metadata-preflight only, NOT strictly bounded (a file growing between `stat` and `read` still allocates its grown body; non-regular targets and stat failures skip the preflight and rely on the post-read check). Async body reads now receive the caller's `AbortSignal` (`readFile` with `{ encoding: 'utf8', signal }`); sync reads take no signal (honest-sync kept). Bounded error-result content contract: any `maxTargetBytes` rejection (preflight or growth race) returns `content: ''`, `modified: false`, `written: false` with a `RESOURCE_LIMIT` diagnostic — rejected bodies are never loaded just to fill the result; other failure kinds retain the read body. AIH-02 reporting is preserved (pre-commit aborts still reject with the signal reason; post-commit aborts still convert to ordered per-target results); the preflight abort exits mirror the existing read-catch pattern. Changed paths: `packages/asset-inliner/src/files.ts` (`targetByteLimitError` helper, `inspectTargetSizeAsync/Sync` preflight, signal-passing async read, `RESOURCE_LIMIT`-only content bounding in both transform-error branches, module-JSDoc read-bounding note), `packages/asset-inliner/src/types.ts` (JSDoc only: `InlineFileResult` content contract, `InlineFilesOptions.maxTargetBytes` preflight/signal note), `packages/asset-inliner/test/target-limits.test.ts` (new `target read bounding (AIH-03)` block, 9 cases: async/sync no-body-read + `RESOURCE_LIMIT`/`written:false`/unchanged-disk/`content:''`, exact-boundary multibyte UTF-8 success with len-1 rejection, async/sync mocked-growth rejection with discarded body, async signal passthrough on every body read, pre-aborted rejection with signal-reason identity, read/retention experiment at concurrency 1 and 4). Regression proof: the 9 new cases fail 8 test entries pre-fix (incl. experiment `expected 4 to be +0` body reads at both concurrencies and 30400 retained bytes) and pass post-fix. Measured experiment (modest fixtures, 4 targets x ~7600 B = 30400 B on disk, `/tmp/opencode/aih03-experiment.mjs` against built `dist`, monkey-patched `fs.promises.readFile` counter): under-limit control at concurrency 1 reads 4 bodies / 30400 B (instrumentation proven); oversized at concurrency 1: 0 body reads, 0 B read, 0 B retained, all `RESOURCE_LIMIT`, disks unchanged; oversized at concurrency 8: identical (0/0/0). No memory-improvement claim is made; no enormous fixtures were allocated. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/target-limits.test.ts test/files-write.test.ts test/files-cancellation-commit.test.ts` -> 3 files, 39 tests passed; V2 `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 24 files, 492 passed, 1 todo. `git status --short packages/asset-inliner/` shows only AIH-03 paths from this task (`src/files.ts`, `src/types.ts`, `test/target-limits.test.ts`); other worktree paths pre-existed via parallel agents; no `dist/` or `CHANGELOG.md` changes. Release-notes input for AIH-11 (README/website owner; full README left to AIH-11): observable contract change is "`inlineFiles`/`inlineFilesSync` `maxTargetBytes` rejections now return `content: ''` (previously the full over-limit body was retained), oversized regular targets are rejected before reading via metadata preflight, and async target reads honor the supplied `AbortSignal`; reads remain metadata-preflight only, so README must not promise strict I/O allocation bounds." No separate release-notes file exists in the repo; root `CHANGELOG.md` untouched per task rules.

### Task AIH-04: Clean Up Only Owned Temporary Files

Status: completed

Kind: defect

Priority: P1; a rare exclusive-create collision deletes a pre-existing unrelated file.

Suggested agent: filesystem durability

Dependencies: AIH-03

Primary ownership: `packages/asset-inliner/src/files.ts`; `packages/asset-inliner/test/files-write.test.ts`.

Finding and references: exclusive creation at `src/files.ts:320-323,459-463` can fail with `EEXIST`, but cleanup at lines 393-420 and 530-545 unlinks the path without requiring successful ownership acquisition. This residual AINL2-03 case was not covered by cleanup tests at `test/files-write.test.ts:233-263,329-386`. Random naming lowers likelihood; this is not a demonstrated arbitrary-file deletion exploit.

Requirements:

1. Unlink only after successful exclusive creation establishes ownership, including cancellation cleanup paths.
2. Preserve the original failure and target contents; retries are optional, not required for this fix.

Acceptance criteria:

- Stub random naming, pre-create the temp pathname with sentinel content, and trigger async and sync writes. The sentinel survives unchanged, the target is unchanged, and a controlled unsuccessful-write result is returned.
- Existing failures after successful creation still clean up owned files and preserve primary-error precedence.

Verification: V1 files-write tests, V2.

Completion evidence: All four cleanup sites in `writeAtomicAsync`/`writeAtomicSync` (`src/files.ts`) now unlink the temp path only when `tempCreated` is true, i.e. after successful exclusive (`wx`) creation establishes ownership — including both cancellation cleanup paths (the async abort branch previously unlinked in both the owned and unowned arms). An `EEXIST` from a colliding pre-existing temp therefore preserves the sentinel file byte-for-byte, leaves the target unchanged, and surfaces as a controlled per-target `FILESYSTEM_ERROR` (`written:false`, primary error/operation preserved via the existing wrap). Owned-temp behavior is unchanged: failures after successful creation (e.g. injected rename failure with failing unlink) still clean up and preserve primary-error precedence, covered by the pre-existing test at `test/files-write.test.ts:233-263`. Changed paths: `packages/asset-inliner/src/files.ts` (ownership-gated unlinks only), `packages/asset-inliner/test/files-write.test.ts` (new `AIH-04` block, 2 tests: stubbed `crypto.randomBytes(6)` + pre-created sentinel temp, async and sync writes assert sentinel/target unchanged with `written:false` + `FILESYSTEM_ERROR`). Regression proof: the 2 new tests fail before the fix (sentinel deleted, `ENOENT` on read-back) and pass after. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/files-write.test.ts` -> 1 file, 14 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 24 files, 494 passed, 1 todo. No `dist/` or `CHANGELOG.md` changes from this task.

### Task AIH-05: Enforce One Catalog-Wide File Budget

Status: completed

Kind: defect

Priority: P1; root partitioning bypasses `maxFiles` and permits excess filesystem/metadata work.

Suggested agent: catalog/resource policy

Dependencies: none

Primary ownership: `packages/asset-inliner/src/catalog.ts`; `packages/asset-inliner/test/catalog.test.ts` and `test/orchestration-reuse.test.ts`.

Finding and references: async/sync queue construction at `src/catalog.ts:132-184` invokes discovery separately for each root. Discovery's count at `src/discovery.ts:195-203` is per invocation, with no catalog-wide enforcement. Two explicit image paths produce a size-2 catalog with `maxFiles:1`. AINL2-10 addressed repeated traversal, not the lost global budget; orchestration tests at lines 19-97 do not combine multiple roots with count limits.

Requirements:

1. Maintain an operation-wide unique-file budget while constructing the catalog queue, before encoding the overflowing asset. Avoid reintroducing repeated traversal.
2. Preserve mixed byte/path ordering and canonical alias deduplication. Explicitly document whether byte inputs count toward a separate collection limit or remain outside the file-only policy; do not silently change their contract.

Acceptance criteria:

- Separate files and separate directories obey the same budget as a single combined root in both variants.
- Overlapping roots, duplicates, and canonical aliases do not double-count; exact-boundary catalogs succeed.
- Overflow fails before asset-body encoding/reads for the overflowing unique file; test through `inlineFiles` catalog construction too.

Verification: V1 catalog/orchestration tests, V2. Coordinate with AIH-01 if discovery changes become necessary.

Completion evidence: Catalog-only fix, no `discovery.ts` change. `src/catalog.ts` `buildOrderedQueueAsync/Sync` now enforce one operation-wide unique-file budget during queue construction, before any `encodeAsset` call: per-file `realpath` canonical identity (lexical fallback) dedupes overlapping roots/duplicates/symlink aliases without double-counting, `globalSeen.size >= effectiveMaxFiles` throws `ResourceLimitError` (`Discovered file count N exceeds maxFiles M`, limit/actual/path) for the overflowing unique file; each distinct root is still discovered at most once (cache preserved, no repeated traversal). Byte (`{ data }`) inputs are explicitly documented as outside the file-only `maxFiles` policy (JSDoc on both `createAssetCatalog` variants; bytes still bounded by `maxAssetBytes`/`maxTotalBytes`). Changed paths: `packages/asset-inliner/src/catalog.ts`, `packages/asset-inliner/test/catalog-file-budget.test.ts` (new, 8 tests). Regression proof: with `src/catalog.ts` stashed, 7/8 new tests fail (only byte-policy test passes); with fix all pass. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/catalog.test.ts test/orchestration-reuse.test.ts test/catalog-file-budget.test.ts` -> 3 files, 25 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 25 files, 502 passed, 1 todo. `git status --short` shows only AIH-05 paths from this task; no `dist/` or `CHANGELOG.md` changes.

### Task AIH-06: Make Resolver Data URLs Safe To Serialize

Status: completed

Kind: defect

Priority: P0; accepted resolver strings can introduce attributes or declarations into output.

Suggested agent: parser/output security

Dependencies: none

Primary ownership: `packages/asset-inliner/src/resolve.ts`, `src/format.ts`, `src/html.ts`, `src/css.ts`; `packages/asset-inliner/test/resolver-sync-honesty.test.ts` and focused serialization regressions.

Finding and references: validation at `src/resolve.ts:31-36` only requires a `data:` prefix and a `;base64,` substring. HTML at `src/html.ts:501-504` and CSS at `src/css.ts:603-605` insert the string into their output contexts. A resolver data URL ending in `AA==" onerror="alert(1)` adds an HTML event attribute; one ending in `);color:red;/*` escapes CSS. This requires a resolver forwarding attacker-influenced metadata, not merely untrusted image bytes. AINL2-06's basic shape tests at `test/resolver-sync-honesty.test.ts:97-155` miss plausible prefixes with delimiters.

Requirements:

1. Enforce the supported Base64 data-URL contract at the narrow shared boundary and serialize safely for quoted/unquoted HTML, srcset, CSS, and embedded CSS contexts. Account for caller-supplied catalogs and standalone formatters, not only custom resolver returns.
2. Keep encoded asset bytes opaque; this is structural output safety, not SVG sanitization. Reject malformed runtime records through controlled errors/diagnostics without partial mutation.
3. Reuse the smallest appropriate validator/serializer rather than adding independent inconsistent checks. Document any stricter resolver contract and release impact.

Acceptance criteria:

- Delimiter-bearing payloads cannot add attributes, elements, CSS declarations, or extra srcset candidates when reparsed by the actual parsers.
- Cover both HTML quote styles, unquoted attributes, ordinary CSS, style attributes, style elements, custom catalogs, and formatter entrypoints.
- Valid generated URLs, including empty Base64 payloads and supported custom media types, preserve byte equality and normal replacement metadata. Escaping expansion remains subject to output limits.

Verification: V1 resolver/format/CSS/HTML/embedded-CSS tests, V2.

Completion evidence: Shared boundary `isSafeDataUrl`/`assertSafeDataUrl` added in `src/format.ts` enforcing `data:<type>/<subtype>;base64,<base64>` with a safe media-type subset (definition tokens minus `#$&`; no charset/params, whitespace, quotes, parens, or extra delimiters) and strict-Base64-alphabet payload (empty allowed, unpadded accepted, padding confined to 1-2 tail `=`); encoded bytes stay opaque. `src/resolve.ts` `validateResolverAsset` reuses it (stricter resolver contract — note for AIH-11: resolvers returning charset/parameterized, fragment, or delimiter-bearing data URLs now fail with `INVALID_OPTIONS` instead of being inlined; release note should document this). `src/format.ts` `formatCssUrl` validates (covers standalone formatters; `formatFontSource` inherits via `formatCssUrl`). `src/css.ts` validates every resolved asset before limits/mutation and inserts the validated URL as a single `url()` word (safe on reparse). `src/html.ts` validates in simple-attr and srcset paths before limits/mutation; quoted attrs keep the URL verbatim preserving quote style, unquoted attrs/srcset gain double quotes in the source patch (+2 bytes counted in projected output limits; serialize fallback keeps raw value since parse5 quotes). No partial mutation: violations throw `INVALID_OPTIONS` before insertion. Changed paths: `packages/asset-inliner/src/format.ts`, `src/resolve.ts`, `src/css.ts`, `src/html.ts`, new `packages/asset-inliner/test/resolver-data-url-safety.test.ts` (14 tests: validator accept/reject, resolver rejection, CSS/HTML/srcset breakers rejected via resolver and custom catalogs, both quote styles + unquoted reparse via parse5, ordinary/embedded CSS declaration counts via postcss, formatter entrypoints, empty-payload + custom `image/jxl` byte equality with normal replacement metadata, quote-expansion output-limit bound). Regression proof: with `src/` changes stashed, 11/14 new tests fail; with fix 14/14 pass. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/resolver-data-url-safety.test.ts test/resolver-sync-honesty.test.ts test/resolve.test.ts test/encode.test.ts test/css.test.ts test/css-escapes-locations.test.ts test/html.test.ts test/html-source-patches.test.ts test/embedded-css.test.ts test/media-type-eligibility.test.ts test/selective-inline.test.ts` -> 11 files, 232 passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 26 files, 516 passed, 1 todo. No `dist/` or `CHANGELOG.md` changes.

### Task AIH-07: Share Safe Font-Hint Serialization

Status: completed

Kind: defect

Priority: P0; explicit font metadata can inject new CSS declarations without a custom resolver.

Suggested agent: CSS serialization

Dependencies: AIH-06

Primary ownership: `packages/asset-inliner/src/css.ts`, `src/format.ts`; focused font-format tests in `packages/asset-inliner/test/css.test.ts` and `test/encode.test.ts`.

Finding and references: `src/css.ts:588-602` places raw `fontFormat` into a parser string node; the serializer does not escape quotes. `src/format.ts:48-52` separately escapes quotes/backslashes. Explicit metadata flows through `src/detect.ts:272-288`. A font input with `fontFormat: "woff2'); font-display:swap; src:local('x"` produces extra declarations. AINL2-05 handled font metadata on non-font assets, not this serialization gap. `test/encode.test.ts:368-378` covers the standalone formatter only; automatic hints at `test/css.test.ts:237-270` use ordinary values.

Requirements:

1. Share correct CSS string serialization or consistent validation between automatic hints and formatters. Handle quotes, backslashes, and line breaks; do not assume AST constructors escape values.
2. Preserve valid custom font hints unless an explicitly documented validation change is chosen. Do not broadly refactor detection for a formatting defect.

Acceptance criteria:

- End-to-end byte input to catalog to `@font-face` output cannot create extra declarations, even with adversarial metadata.
- Resolver-supplied hints and standalone formatting have equivalent safe behavior; ordinary font hints and existing `format(...)` preservation pass.
- Parsed font-hint value and declaration count are asserted, not merely output substrings.

Verification: V1 CSS/encode/embedded-CSS tests, V2.

Completion evidence: Shared single-quoted CSS string escaper `escapeCssSingleQuoteString` added in `src/format.ts` (escapes backslashes, single quotes, CR/LF/FF as CSS hex escapes; ordinary hints untouched) and reused by both `formatFontSource` and the automatic `@font-face` path in `src/css.ts` (trim-then-escape; whitespace-only hints add no descriptor, matching the formatter's empty-hint rejection without throwing from the transform path). No detection refactor; valid custom hints preserved byte-for-byte when inert. AIH-06 `assertSafeDataUrl` reuse in `css.ts`/`formatCssUrl` left intact. Changed paths: `packages/asset-inliner/src/format.ts`, `packages/asset-inliner/src/css.ts`, new `packages/asset-inliner/test/font-hint-safety.test.ts` (10 tests: escaper unit cases, byte-input-to-catalog-to-`@font-face` quote/backslash/line-break breakers asserting postcss declaration count plus reparsed single `format()` string value, resolver-supplied hint equivalence, standalone `formatFontSource` equivalence, ordinary-hint and pre-existing-`format(...)` preservation). Regression proof: with `src/css.ts`+`src/format.ts` stashed, 9/10 new tests fail; with fix 10/10 pass (also fixed the new test's line-break assertion scoping which first matched ambient newlines). Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/css.test.ts test/encode.test.ts test/embedded-css.test.ts test/font-hint-safety.test.ts test/resolver-data-url-safety.test.ts` -> 5 files, 120 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 27 files, 526 passed, 1 todo. `git status --short` confirms only AIH-07 paths from this task (`src/css.ts`, `src/format.ts`, `test/font-hint-safety.test.ts` shared with the AIH-06 validator); no `dist/` or `CHANGELOG.md` changes.

### Task AIH-08: Resolve Decoded HTML Attribute Values With Source Mapping

Status: completed

Kind: defect

Priority: P1; valid entity-encoded URLs and inline styles fail resolution.

Suggested agent: HTML parser/source mapping

Dependencies: AIH-07 (shared parser files)

Primary ownership: `packages/asset-inliner/src/html.ts`; `packages/asset-inliner/test/html-source-patches.test.ts`, `test/html.test.ts`, `test/embedded-css.test.ts`.

Finding and references: `src/html.ts:558-566,595-602,839-844,949-965` parses raw source attribute spellings for srcset/style, unlike simple attributes which use decoded parse5 values. `src="apple&#46;png"` works, while `srcset="apple&#46;png 1x"` does not; `style="background:url(&quot;apple.png&quot;)"` looks up literal entities. Inspected entity tests cover unrelated `alt`, not these paths. This extends AINL2-07/AINL2-13 with an HTML decoding boundary they did not test.

Requirements:

1. Parse decoded attribute values with a reliable decoded-to-source mapping for replacement ranges and diagnostics; re-encode replacements for their HTML context.
2. Preserve unrelated source spelling and whole-target resource accounting. Keep style-element raw text separate: character references are not HTML-decoded there.

Acceptance criteria:

- Numeric/named references in URLs, encoded CSS quotes, and encoded descriptor whitespace inline correctly in srcset/style attributes.
- Unrelated entities and markup remain byte-identical. Duplicate references receive correct original-source offsets and line/column locations.
- Cross-check ordinary src, srcset, style attributes, and style elements; ensure decoding is not applied twice and output does not acquire new syntax.

Verification: V1 HTML/source-patches/embedded-CSS tests, V2.

Completion evidence: Wired the existing decode helpers into both paths. `handleSrcsetAttr` now decodes the raw value slice with `decodeHtmlAttrValue` (fixed to index the map by UTF-16 unit so astral references stay aligned) and, when the decode agrees with the parser-provided `attr.value`, delegates to new `handleSrcsetDecoded`: URLs resolve in decoded space while replacements splice the raw source slice at mapped spans, so separators/descriptors/unrelated entities stay byte-identical; per-replacement output accounting uses original-source-span bytes and locations point at the source spelling (duplicates distinct, line/column via `offsetToLineCol`); unquoted-attribute quote wrapping preserved. `handleStyleAttr` decodes once, runs `inlineCss` on the decoded CSS, re-encodes the whole-chunk patch with `escapeHtmlAttrValue` (validated data URLs pass through byte-identical; `&amp;/&lt;/&gt;/`active-quote round-trip), accounts the escaped-vs-raw delta, and maps nested locations through the decode map. Both paths fall back to legacy raw-source parsing on decode/parser disagreement (narrow named table, newline normalization), so decoding is never applied twice. `handleStyleElement` untouched (raw text, no decoding). AIH-06/07 boundaries (`assertSafeDataUrl`, quote serialization, font-hint escaper) preserved. Changed paths: `packages/asset-inliner/src/html.ts` (AIH-08 wiring only), new `packages/asset-inliner/test/html-decoded-attrs.test.ts` (10 tests: numeric/named/hex refs, encoded CSS quotes, encoded descriptor space/tab, byte-identical preservation incl. exact-splice assert, duplicate offsets+line/col, single-decode `&amp;amp;` proof, source-spelling output accounting exact/exact-1, ordinary-src cross-check, style-element raw-text proof with positive control). Regression proof: with `src/html.ts` reverted, 8/10 new tests fail (only ordinary-src and style-element-raw pass, as pre-existing behavior); with fix 10/10 pass. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/html.test.ts test/html-source-patches.test.ts test/embedded-css.test.ts test/html-decoded-attrs.test.ts` -> 4 files, 67 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 28 files, 536 passed, 1 todo. No `dist/` or `CHANGELOG.md` changes.

### Task AIH-09: Parse Complete Mixed-Case CSS URL Functions

Status: completed

Kind: defect

Priority: P1; a path prefix can silently select the wrong asset.

Suggested agent: CSS parser

Dependencies: AIH-08 (shared CSS/embedded test ownership)

Primary ownership: `packages/asset-inliner/src/css.ts`; `packages/asset-inliner/test/css-escapes-locations.test.ts` and `test/css.test.ts`.

Finding and references: `src/css.ts:310-330` accepts function names case-insensitively but consumes only the first inner word. The dependency's special unquoted-url tokenization is case-sensitive; uppercase URL paths can contain multiple inner nodes. Replacement at lines 603-605 discards the rest. `URL(apple.png/other.png)` incorrectly replaces the whole URL with `apple.png` when that prefix is cataloged; `URL(../images/apple.png)` looks up only `..`. Existing quote/escape cases use lowercase names. This is separate from AINL2-08's unescaping fix.

Requirements:

1. Extract the complete URL according to CSS token semantics for every accepted function casing; never accept a prefix while discarding unvalidated remainder nodes.
2. Preserve original spelling and accurate location metadata while resolving the complete decoded value. Malformed functions must remain unchanged with controlled handling.

Acceptance criteria:

- `url`, `URL`, and `Url` behave equivalently for relative/root-relative paths, quoted values, escapes, and nested functions.
- A catalog matching only the first path segment cannot cause a replacement. Records contain the full original URL.
- Exercise the same cases through opt-in embedded CSS.

Verification: V1 CSS/escape/embedded-CSS tests, V2.

Completion evidence: `src/css.ts` url-function extraction now consumes the complete inner URL for every accepted casing instead of only the first inner node. postcss-value-parser applies its special unquoted-url tokenization only to exact-lowercase `url` (whole `a/b` stays one word); any other casing (`URL`, `Url`, ...) tokenizes as a generic function ([word, div, word], ...), so the old first-node extraction resolved the `apple.png` prefix of `URL(apple.png/other.png)` (or `..` of `URL(../images/apple.png)`) while replacement discarded the rest. The new shape dispatch keeps single string/word/function behavior byte-identical for all casings, reconstructs unquoted multi-node content via full-inner `stringify` (never a prefix) with the offset still pointing at the URL start, and leaves multi-value quoted/nested shapes (`url('a' 'b')`, `URL(a'b')`) unchanged with a `PARSE_ERROR` diagnostic carrying the full spelling. Replacement code is untouched (discarding the remainder is correct once the complete URL was resolved). AIH-06/07 boundaries (`assertSafeDataUrl`, font-hint escaper) preserved. Changed paths: `packages/asset-inliner/src/css.ts` (extraction only), new `packages/asset-inliner/test/css-mixed-case-url.test.ts` (12 tests: url/URL/Url/uRl equivalence for relative/root-relative/quoted/escape/nested image-set cases, prefix-trap `URL(apple.png/other.png)` unchanged with full-URL `UNRESOLVED_REFERENCE` and no prefix record, `URL(../images/apple.png)` full resolution + full-URL records with slice-exact offsets, multi-value malformed unchanged with `PARSE_ERROR`, plus 3 opt-in embedded-CSS cases via `inlineHtml` with `inlineEmbeddedCss`). Regression proof: with `src/css.ts` stashed, 7/12 new tests fail; with fix 12/12 pass. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/css.test.ts test/css-escapes-locations.test.ts test/embedded-css.test.ts test/css-mixed-case-url.test.ts test/resolver-data-url-safety.test.ts test/font-hint-safety.test.ts test/encode.test.ts test/html.test.ts test/html-source-patches.test.ts test/html-decoded-attrs.test.ts` -> 10 files, 198 tests passed; `pnpm --filter @web-ts-toolkit/asset-inliner typecheck` -> clean; `pnpm --filter @web-ts-toolkit/asset-inliner test` -> 29 files, 548 passed, 1 todo. `git status --short` shows only AIH-09 paths from this task (`src/css.ts`, `test/css-mixed-case-url.test.ts`); other worktree modifications pre-existed via parallel agents; no `dist/` or `CHANGELOG.md` changes.

### Task AIH-10: Reconcile Detector MIME Aliases And Data-URL Encoding

Status: completed

Kind: defect

Priority: P1; supported ICO/CUR fail detection; accepted MIME punctuation can generate unusable URLs.

Suggested agent: encoding/detection contract

Dependencies: AIH-05, AIH-06

Primary ownership: `packages/asset-inliner/src/detect.ts`, `src/definitions.ts`, `src/encode.ts`; `packages/asset-inliner/test/detect.test.ts`, `test/media-type-eligibility.test.ts`, `test/encode.test.ts`.

Finding and references:

- `src/definitions.ts:179-180` uses canonical `image/vnd.microsoft.icon`; actual `file-type@22.0.2` returns `image/x-icon`. Literal consistency checks at `src/detect.ts:126-150,336-343,368-370` reject both existing ICO/CUR fixtures in content and verify modes with `INVALID_OPTIONS`. AINL2-05's fabricated consistency tests miss this legitimate dependency alias.
- MIME normalization at `src/definitions.ts:57-67` accepts `#`, but URL construction at `src/encode.ts:244-245,326-327` interpolates it verbatim. `image/x#demo` yields a fragment containing the delimiter/payload; Node fetch cannot decode the data URL. Existing custom-MIME tests check strings rather than a URL consumer.

Requirements:

1. Normalize a narrow documented set of legitimate detector aliases before consistency/verification checks, preserving canonical registry metadata and real mismatch rejection.
2. Separate canonical MIME metadata from URL serialization. Correctly encode URL-significant characters, or deliberately reject unsupported values with a controlled documented error. Align with AIH-06's structural validator.
3. Keep these two regressions separately named and tested even though one agent owns the metadata boundary.

Acceptance criteria:

- Real default detection of ICO/CUR succeeds in content and verify modes with canonical MIME and exact recovered bytes; contradictory PNG/JPEG pairs still reject.
- Async/sync explicit MIME and custom-definition punctuation cases produce valid URLs with no unintended fragment and exact bytes through a real data-URL consumer, or a documented controlled rejection.
- Existing supported media types, explicit metadata precedence, and eligibility gates remain correct.

Verification: V1 detection/eligibility/encode tests, Node URL/data-URL consumer probes, V2.

Completion evidence: Narrow alias table `DETECTOR_MIME_ALIASES = { 'image/x-icon' -> 'image/vnd.microsoft.icon' }` in `src/detect.ts` normalizes only detector-reported MIME before consistency/verification checks (`validateDetectorResult`, `findDefinitionForDetected`, `resolveWithDetector` verify path); canonical registry metadata is preserved on results, explicit caller `mediaType` is never aliased, exact registry matches keep precedence, and PNG/JPEG contradictions still throw `DetectionMismatchError`. `src/encode.ts` (async + sync) keeps canonical `meta.mediaType` on the result but gates data-URL construction through the shared AIH-06 `assertSafeDataUrl` boundary, so URL-significant media types (`image/x#demo` etc.) fail with controlled `INVALID_OPTIONS` before Base64 allocation instead of emitting fragment-bearing URLs; `definitions.ts` normalization unchanged. Two separately named regressions: new `test/detect-mime-alias.test.ts` (AIH-10a, 6 tests: real ICO/CUR fixtures in content+verify modes with canonical MIME and exact bytes, PNG/JPEG contradiction rejections) and new `test/mime-url-serialization.test.ts` (AIH-10b, 6 tests: async/sync safe explicit MIME usable via real `fetch`+`URL` consumer with empty hash and exact bytes, async/sync explicit and custom-definition punctuation rejections with `INVALID_OPTIONS`). Regression proof: with `src/detect.ts`+`src/encode.ts` stashed, 8/12 new tests fail; with fix 12/12 pass. AIH-05 budget (`test/catalog-file-budget.test.ts`) and AIH-06 validator (`test/resolver-data-url-safety.test.ts`, `src/format.ts` untouched) preserved. Commands from repo root, serial: V1 `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/detect.test.ts test/media-type-eligibility.test.ts test/encode.test.ts test/detect-mime-alias.test.ts test/mime-url-serialization.test.ts test/catalog-file-budget.test.ts test/resolver-data-url-safety.test.ts` -> 7 files, 141 passed; tsx Node probe -> ICO/CUR canonical MIME with empty hash and byte equality, PNG-as-JPG `DetectionMismatchError`, custom MIME usable, `image/x#demo` `INVALID_OPTIONS` async+sync; V2 `typecheck` clean + package `test` -> 31 files, 560 passed, 1 todo. Changed paths: `packages/asset-inliner/src/detect.ts`, `packages/asset-inliner/src/encode.ts`, `packages/asset-inliner/test/detect-mime-alias.test.ts`, `packages/asset-inliner/test/mime-url-serialization.test.ts`; no `dist/` or `CHANGELOG.md` changes.

### Task AIH-11: Make Shipped Examples Executable And Contracts Concise

Status: completed

Kind: defect

Priority: P2; installed users encounter duplicate imports and path-inconsistent happy paths.

Suggested agent: installed-consumer documentation

Dependencies: AIH-04, AIH-09, AIH-10

Primary ownership: `packages/asset-inliner/README.md`; `website/docs/packages/asset-inliner.md`; focused documentation/consumer checks; release-note location following repository convention.

Finding and references: README lines 37/49 and 105/124 import the same binding twice within one fenced example. CSS/HTML examples at lines 71-91 create cwd-relative catalogs but use unrelated absolute document paths, so default exact-path resolution does not demonstrate a working happy path. The first CSS replacement comment also names the image despite a preceding font reference. Lines 212 and 214 duplicate a long limits paragraph. The custom resolver block at lines 265-285 relies on unimported/undefined context. AINL2-12 fixed other presentation issues; these concrete examples remain broken or incomplete.

Requirements:

1. Make each advertised runnable example self-contained, with single imports and coherent repository-relative fixture/document paths. Clearly label illustrative fragments that intentionally rely on earlier context.
2. Remove duplicated limits prose and shorten implementation-heavy explanations without losing security caveats. Incorporate contract notes from preceding tasks and keep website/types consistent.
3. Add a minimal reproducible installed-consumer smoke check for the principal encode/catalog/CSS/HTML examples rather than a large documentation framework.

Acceptance criteria:

- Quickstart blocks compile without duplicate bindings or missing symbols and demonstrably produce intended replacements using temporary fixture assets.
- The consumer resolves only the package root from a packed install; emitted types and README agree on supported imports and changed error/content contracts.
- No source/deep imports or machine-specific paths are required. Updated prose does not promise strict I/O allocation bounds unless AIH-03 actually provides them.

Verification: V4, executable example checks, documentation review; V2 if smoke tests change.

Completion evidence: README quickstarts are now self-contained single-import blocks with coherent package-root-relative fixture/document paths (`test/fixtures/legacy/...` sharing one tree so default exact-path resolution succeeds; `replacements[0]` comment fixed to the image-first source order; `inlineFiles` placeholder dirs explicitly labeled as an illustrative fragment pointing at the runnable temp-fixture equivalent; custom resolver block imports all used bindings, defines `css`, and aliases via `getByBasename`). Duplicated limits prose (old lines 212/214) collapsed to one paragraph documenting metadata-preflight only (no strict allocation-bound promise); CSS/HTML target-syntax bullets shortened with security caveats kept; TOCTOU note preserved; new concise "Changed contracts" list incorporates AIH-03 (`content: ''` + `written:false` oversized-target contract), AIH-05 (catalog-wide `maxFiles`, byte inputs outside file-only budget), AIH-06 (strict `data:<type>/<subtype>;base64,<strict-base64>` boundary incl. standalone formatters, `INVALID_OPTIONS`), AIH-10 (`image/x-icon`→canonical alias, punctuation rejection), and AIH-07 font-hint escaping; `INVALID_OPTIONS` error row extended; website page paths/contracts aligned. Changed paths: `packages/asset-inliner/README.md`, `website/docs/packages/asset-inliner.md`, new `packages/asset-inliner/test/readme-examples.test.ts` (6 tests: encode/file+bytes+sync, formatters, CSS 2-replacement, HTML 2-replacement, files dry-run/write async+sync, custom registry+resolver — all on temp copies of real fixtures). Executable proof: new test file 6/6 pass; verbatim README CSS/HTML snippets run from the package root against `dist` yield 2+2 replacements with no diagnostics. V2: `typecheck` clean, `test` 32 files / 566 passed / 1 todo. V4: `npm pack --dry-run` (5 files: dist + README + package.json), real tarball installed into `/tmp/opencode/aih11-consumer` (own lockfile, workspace untouched); Node ESM root-only named imports exercise encode/sync/bytes/catalog/CSS/HTML/dry-run replacements — OK; TS `NodeNext` strict `tsc` (skipLibCheck false) on packed declarations — OK. No `dist/` or `CHANGELOG.md` edits.

### Task AIH-12: Independently Verify Integrated Boundaries

Status: completed

Kind: improvement

Priority: P1; the prior green suite missed cross-path and dependency integration failures.

Suggested agent: independent integration reviewer, not the main implementer

Dependencies: AIH-01, AIH-02, AIH-03, AIH-04, AIH-05, AIH-06, AIH-07, AIH-08, AIH-09, AIH-10, AIH-11

Primary ownership: this task document and integration verification evidence; coordinate any corrections with their owning agents.

Finding and references: the baseline's 473 passing tests coexist with the specific boundary defects recorded above. Completion needs cross-path evidence, not only another green run of the same assertions.

Requirements:

1. Check every task's acceptance criteria against regressions/runtime evidence, including actual Windows coverage and packed-consumer execution.
2. Review sync/async cancellation, custom catalogs/resolvers/formatters, embedded versus standalone transforms, output expansion after escaping, and operation-wide budgets together.
3. Confirm encapsulation improved at concrete shared boundaries without exporting internal parser/I/O helpers unnecessarily. Check public declarations, docs, and runtime agree.

Acceptance criteria:

- V1/V2 evidence exists for each defect; V3/V4 pass, or exact blockers and delivered-but-unverified criteria are recorded with affected tasks left blocked.
- No unintended tracked changes, temp leaks, or unexplained source/artifact differences remain.
- All deferrals include rationale and residual risk; this document records final ownership, verification, and any follow-up IDs.

Verification: independent evidence review, V2, V3, V4.

Completion evidence: Independent reviewer (did not implement AIH-01–AIH-11). Per-task verdicts: AIH-01 blocked (correct — portable `path.win32` predicate evidence passes on Linux via `test/discovery-cross-volume.test.ts`, but actual Windows filesystem integration was not run, so per-task spec it must stay blocked until a Windows runner executes the containment asserts against real `C:`/`D:` drives and UNC shares); AIH-02 through AIH-11 completed — each has a named regression file plus recorded before/after fail-pass evidence, and all pass in this review. V1 sample (reviewer-run): `pnpm --filter @web-ts-toolkit/asset-inliner exec vitest run --config ../../vitest.config.ts test/discovery-cross-volume.test.ts test/files-cancellation-commit.test.ts test/catalog-file-budget.test.ts test/resolver-data-url-safety.test.ts test/font-hint-safety.test.ts test/html-decoded-attrs.test.ts test/css-mixed-case-url.test.ts test/detect-mime-alias.test.ts test/mime-url-serialization.test.ts test/readme-examples.test.ts` -> 10 files, 82 tests passed. V2 (serial): `typecheck` clean; `test` -> 32 files, 566 passed, 1 todo. V3 (serial): `pnpm build` EXIT 0; `pnpm test` — asset-inliner plus all packages up to the failure point pass (asset-inliner 32 files/566 passed), but the run stops at `packages/express-response-handler/test/packed-examples.test.ts` (ERH-11: `TypeError: Cannot read properties of undefined (reading 'timeoutMs')` in `test/helpers/packed-subprocess.ts:58` — unrelated to asset-inliner, owned by `docs/tasks/20260908-070733-express-response-handler-boundary-follow-up.md`; packages after it in serial order did not execute); `pnpm lint` initially failed with 6 errors confined to AIH-touched files, fixed by reviewer as small in-scope corrections (see below), final `pnpm lint` EXIT 0 with only 4 pre-existing warnings (3 unused eslint-disable in `access-router-client` benchmark test, since resolved for asset-inliner). V4 (reviewer-run, workspace lockfile untouched): `npm pack --dry-run` from `packages/asset-inliner` -> 5 files (dist + README + package.json), 140.1 kB; real tarball installed into `/tmp/opencode/aih12-consumer` (own `.tool-versions` + `package.json`, installed tarball + declared deps only); Node ESM root-only named imports verified (`encodeAssetSync`, `inlineCss`, `inlineHtml`, `createAssetCatalogSync`, `formatCssUrl`, `classifyUrl`, `builtInDefinitions`, `discoverAssetsSync`) — file-based catalog + document in one tree yields 1 CSS + 1 HTML replacement with zero diagnostics (byte-input relative URLs return documented `UNRESOLVED_REFERENCE` per the exact-path contract, not a defect); TypeScript NodeNext strict (`skipLibCheck: false`) resolution against packed `dist/index.d.mts` passes (TSC*EXIT 0) using the workspace `tsc` binary without adding consumer deps. Cross-cutting review: (a) sync/async cancellation (AIH-02 two-pass chunk scan + sync post-commit ordered reporting) composes with AIH-03 preflight aborts (same read-catch pattern) — full suite green; (b) custom catalogs/resolvers/formatters all gate through shared `assertSafeDataUrl` (`format.ts`), no partial mutation (throw before insertion), verified by 14 resolver-safety tests; (c) embedded vs standalone equivalent (font-hint escaper shared by `formatFontSource` and `@font-face` path; CSS mixed-case extraction; HTML decoded-attr mapping with style-element raw-text preserved); (d) output expansion after escaping accounted (`+2` quote bytes in projected `maxOutputBytes`, safe-integer arithmetic); (e) operation-wide budgets compose (`maxFiles` catalog-wide dedup + `maxTargetBytes` preflight + `maxTotalBytes` cumulative) with byte inputs explicitly outside file-only `maxFiles`. Encapsulation: no new package-root exports — `isWithinRoot` (test seam with `pathImpl` param), `isSafeDataUrl`/`assertSafeDataUrl`, `escapeCssSingleQuoteString` are module-level shares for `css.ts`/`html.ts`/`resolve.ts`/tests but absent from `src/index.ts` and `dist/index.d.mts`; `DETECTOR_MIME_ALIASES` is module-private; catalog/filesystem helpers remain private with only `createAssetCatalog(Sync)`/`inlineFiles(Sync)` public; README "Changed contracts" list, `src/types.ts` JSDoc, website page, and packed-declaration JSDoc agree with runtime (verified `content: ''` oversized contract, preflight-only bound, catalog-wide `maxFiles`, strict data-URL boundary, `x-icon` alias). Reviewer corrections applied (recorded here, owning tasks untouched): `src/format.ts` SAFE regexes `\-` -> `-` (4 `no-useless-escape` errors), `src/html.ts` removed dead `const attrLoc = earlyAttrLoc` (unused var), `test/target-limits.test.ts` `observedCalls` `[]` -> `| undefined` + `?? []` use (useless assignment), `src/files.ts:559` removed stale `eslint-disable-line` (unused directive warning); re-ran typecheck/eslint/package-test green after each. No `dist/` manual edits, no `CHANGELOG.md` changes, no lockfile changes; `git status --short` shows only AIH-owned asset-inliner paths plus parallel agents' unrelated work (express-*, other task docs — not this reviewer's, left for their owners); /tmp leftovers (`/tmp/opencode/_.bak`, `aih03-experiment.mjs`, `discovery.fixed.ts`, `aih11-consumer`) pre-existed from prior agents. Deferrals/residual risk: (1) AIH-01 remains blocked on a real Windows runner — cross-drive/UNC acceptance is proven only at the predicate level via `path.win32`injection; filesystem-level Windows behavior (drive-relative paths, junctions) is unverified. (2) Repo-wide`pnpm test`does not run to completion due to the unrelated express-response-handler packed-examples helper bug — asset-inliner itself is fully green, but final repo-green confirmation for downstream packages is pending their owners. (3) TOCTOU-after-discovery stays an acknowledged README limitation by design. Follow-ups: none new — AIH-01 Windows-runner execution; ERH-11 packed-subprocess`timeoutMs` fix (other task). Proposed final Overall status: all implementation tasks are completed except AIH-01 which is correctly blocked per its own spec (Windows runner prerequisite), so the coordinator may set Overall to completed-with-blocked-AIH-01 or keep pending until the Windows run — Overall line intentionally left unchanged for coordinator final review.

## Decisions And Deferrals

- No maintainer decision blocks starting the root tasks. AIH-03 must explicitly choose/document bounded error-result content; AIH-10 must choose safe MIME encoding versus controlled rejection. These decisions belong within their scoped implementation, not an invented compatibility layer.
- Actual Windows integration needs a Windows runner. Portable path tests can proceed on Linux but are not evidence of Windows filesystem behavior.
- TOCTOU after canonical discovery remains an acknowledged limitation in README lines 244-246; descriptor-relative sandboxing is not added to this follow-up.
- Do not add network fetching, persistent caches, parallel discovery, or broad abstractions merely to fill feature/performance categories. No measurement here establishes their benefit. Resource/read work and narrowly shared serialization are the supported performance/architecture recommendations.
- Missing syntax support worth fixing now is concrete: mixed-case CSS URL functions and HTML-decoded srcset/style values. Broader asset/HTML target expansion remains deliberately outside current allowlists.

## Definition Of Done

All tasks meet their observable acceptance criteria with appended verification evidence; an independent reviewer accepts the integrated behavior and packed consumer surface. Public contract changes are documented and release-noted. Any required unrun check keeps the affected task blocked rather than being reported as complete. Creating this plan alone completes none of the implementation tasks.
