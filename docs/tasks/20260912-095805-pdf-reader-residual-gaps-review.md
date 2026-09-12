# PDF Reader: Residual Gaps And Sub-Agent Remediation

Created: 2026-09-12 09:58:05 PDT

Package: `packages/pdf-reader` · Task prefix: `PDFR3` · Execution status: done

## Objective And Scope

Correct remaining source-policy, resource-limit, lifecycle, image-accuracy, and installed-consumer defects; improve the maintainability and measurement quality of the relevant boundaries. This document is a self-contained handoff for sub-agents. It follows the requested task-as-you-go workflow: evidence first, classified findings, bounded ownership, dependencies, observable acceptance criteria, and recorded verification.

The review covered every file in `packages/pdf-reader/src`, package metadata/build configuration, emitted declarations, unit/browser/declaration/packed-consumer tests, the embedded-image fixture generator, benchmark implementation and documentation, and `website/docs/packages/pdf-reader.md`. Selected installed PDF.js implementation paths were inspected to establish its source, worker, image-store, and text-stream contracts.

The deliverable of this review is this plan. Implementation is future work. Scope excludes a new PDF parser, OCR, server rendering, a network sandbox, broad API expansion, and unrelated workspace remediation.

### Existing Work And Deduplication

- `docs/tasks/20260818-233158-pdf-reader-hardening-follow-up.md`: PDFR-01–09 are marked completed.
- `docs/tasks/20260823-152535-pdf-reader-health-review-remediation.md`: PDFR2-01–09 are marked completed. This is a new review phase; historical completion evidence remains intact.
- PDFR3-02/03 address nested headers and mutable/omitted byte forms beyond PDFR2-01's top-level snapshot. PDFR3-04/05 address synchronous initialization and page-stage waits beyond PDFR2-02's policy/render/encoder waits. PDFR3-01 addresses normalization rather than re-adding PDFR2-03 limits.
- PDFR3-06/07 extend PDFR-06 image characterization; PDFR3-09 corrects examples left after PDFR2-07; PDFR3-10 corrects benchmark methodology left after PDFR-07/PDFR2-06. Do not recreate completed worker setup, packed-consumer, Blob output, caching, serial-operation, or peer-range tasks.
- Existing deferrals remain: borrowed-proxy replacement requires major-version planning; Firefox/WebKit expansion requires compatibility funding; embedded-image Blob output and public concurrency require representative measurements; default-deny remote sources requires a breaking-contract decision. See PDFR2's deferred decisions and final evidence.

## Findings And Priorities

- **P1:** confirmed policy/limit bypass or lifecycle defect with a material correctness/resource impact. These are first-wave work; none is asserted to be a standalone malicious-PDF exploit.
- **P2:** confirmed opt-in accuracy or consumer-example defect, or a bounded improvement/investigation with practical workarounds.
- **P3:** minor polish; no standalone P3 task is needed here.
- `defect` means demonstrated behavior; `investigation` means the supported-fixture impact or appropriate design still needs evidence; `improvement` means optional, measurable hardening.

| ID       | Priority / kind  | Outcome                                                                |
| -------- | ---------------- | ---------------------------------------------------------------------- |
| PDFR3-01 | P1 defect        | Undefined configuration cannot erase finite default limits             |
| PDFR3-02 | P1 defect        | Policy and PDF.js consume the same effective header values             |
| PDFR3-03 | P1 defect        | Known source-byte limits cover strings and mutable-size inputs         |
| PDFR3-04 | P1 defect        | Synchronous load failures release state and permit retry               |
| PDFR3-05 | P1 defect        | Page retrieval/text/operator waits have cancellation ownership         |
| PDFR3-06 | P2 defect        | Image decoding respects PDF.js pixel format rather than length guesses |
| PDFR3-07 | P2 investigation | Establish shared/unresolved XObject compatibility and its remedy       |
| PDFR3-08 | P2 defect        | Validate runtime options and reject invalid canvas output              |
| PDFR3-09 | P2 defect        | Correct worker and Blob-preview lifecycle examples                     |
| PDFR3-10 | P2 improvement   | Make concurrency/retention benchmarks bounded and comparable           |
| PDFR3-11 | P2 investigation | Evaluate incrementally bounded text extraction                         |
| PDFR3-13 | P2 defect        | Shared/unresolved image objects resolve via the document-wide store    |
| PDFR3-12 | P1 improvement   | Independently verify the integrated contracts and artifacts            |

## Baseline Verification And Limitations

The worktree was clean before review. No runtime implementation was changed. Temporary characterization probes were added, run, and removed; their outcomes below characterize existing defects, not fixes. Recreate durable regression coverage with the implementation tasks.

Commands actually run from the repository root:

1. `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts test/review-probes.test.ts` — passed: **56 tests**, comprising **48 existing unit tests and 8 temporary probes**. Probes demonstrated:
   - `limits: { maxDocumentPages: undefined }` admits a 1,001-page mock document despite the 1,000-page default.
   - A synchronously throwing policy leaves `state === 'loading'`; changing that policy to approve does not cause a second invocation or fresh load.
   - Mutating an approved header object changes the value supplied to `getDocument()`.
   - `{ data: '12345' }` passes `maxSourceBytes: 2`; an approved one-element number array grown to four elements also passes that limit.
   - Destruction during deferred text extraction leaves conversion and page cleanup pending until the deferred PDF.js result resolves.
   - An invalid MIME and a three-element page range pass option normalization; an empty range produces `[Infinity, -Infinity]` at range resolution.
   - A mock one-bit image byte `0x80` is incorrectly interpreted as intensity 128.
2. `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` — package ESM/declaration build passed; **all 13 existing Chromium tests passed**. Of three temporary browser probes, worker ownership and early Blob-URL revocation probes passed. An initial image probe failed because a small inline one-bit image was correctly normalized to RGBA by PDF.js; that was a disproven probe assumption, not an existing-suite failure.
3. `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.browser.config.mts test/review-probes.browser.ts` — **3 probes passed** after changing the image experiment to a one-bit image XObject with `isOffscreenCanvasSupported: false`. Its actual `kind` was `GRAYSCALE_1BPP`; with object readiness explicitly awaited, the extracted white pixel was `[128,128,128,255]` instead of `[255,255,255,255]`. The other probes showed a caller-created `PDFWorker` remained alive after `reader.destroy()`, and immediate URL revocation made `Image.decode()` reject.
4. `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` — passed after removing probes.

No full package test, fresh packed install, declaration-consumer run, benchmark run, full-workspace lint/build/test, dependency vulnerability audit, or cross-browser matrix was run for this review. Existing packed-consumer coverage and emitted declarations were inspected, not revalidated in a fresh install. Security conclusions concern the wrapper's inspected boundaries, not PDF.js internals generally. Shared/unresolved object-store behavior and incremental text extraction remain investigations. The final document whitespace check is recorded below after creation.

## Shared Working And Verification Rules

- Use repository-relative paths in task updates. Generic temporary directories such as `/tmp` are acceptable. Preserve unrelated worktree changes.
- Each agent sets its task `in_progress` only after dependencies complete, and appends changed files, command results, acceptance evidence, and follow-ups before setting `completed`. Use `blocked` with owner/prerequisite when required evidence cannot run; use `deferred` only with rationale and residual risk.
- Keep behavioral regressions with fixes. Demonstrate pre-fix failure when feasible. Use deferred promises and observable browser events rather than elapsed-time guesses for lifecycle tests.
- Source-policy failures must remain redacted. Preserve native PDF.js error identity on ordinary PDF.js failures and caller-local load abort/deadline isolation.
- Keep the ESM-only named root API, external PDF.js peer, private image adapter, and one executing page operation per reader. Do not edit generated `dist` manually.
- Public changes require runtime/types/declarations/README/website/migration notes to agree. Use the existing README migration section for release notes; coordinate any broader release-file change with its owner.
- **Serialize builds and tests**, including between agents. `AGENTS.md` documents shared-output races. Browser files also share PDF.js worker globals.

Verification references used by tasks (working directory: repository root unless noted):

| Check | Command / purpose                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1    | `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` — focused source-level unit checks; add a new focused file to the arguments if a task introduces one |
| V2    | `pnpm --filter @web-ts-toolkit/pdf-reader typecheck`                                                                                                                                                              |
| V3    | `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` — rebuilds before real Chromium checks                                                                                                                    |
| V4    | `pnpm --filter @web-ts-toolkit/pdf-reader test` — serialized package build, Node/declaration/packed-consumer tests, then browser suite                                                                            |
| V5    | `pnpm --filter @web-ts-toolkit/pdf-reader benchmark` — build and browser performance experiments                                                                                                                  |
| V6    | `npm pack --dry-run --json` from `packages/pdf-reader`, after build; also review the release-transformed artifact exercised by V4                                                                                 |
| V7    | `pnpm lint`, `pnpm build`, `pnpm test`, executed serially with adequate timeouts, then `git diff --check`                                                                                                         |

Prerequisites: installed workspace dependencies (`pnpm install` when needed), package-compatible Node/toolchain from package metadata, and installed Playwright Chromium for V3–V5. Browser installation is documented by `packages/pdf-reader/vitest.browser.config.mts`; its repository-backed command is `pnpm --filter @web-ts-toolkit/pdf-reader exec playwright install chromium`. V4's fresh consumer needs registry access or a complete package cache and the `tar` executable. Record blockers rather than silently skipping required checks.

## Executable Tasks

### Task PDFR3-01: Preserve Finite Limits When Overrides Are Undefined

Status: completed

Kind: defect

Priority: P1 — ordinary optional-property spreads can accidentally disable advertised resource protection.

Suggested agent: input-normalization and resource-bound specialist

Dependencies: none

Primary ownership: `packages/pdf-reader/src/PDFReader.ts` limit resolution; limit tests in `packages/pdf-reader/test/PDFReader.test.ts`; private normalization helper if useful.

Finding and references: constructor spread `{ ...defaultLimits, ...options.limits }` at `src/PDFReader.ts:89-95` preserves explicit `undefined`; `#validateLimits` at `734-740` skips it. Comparisons such as `numPages > undefined` at `479` are false. All defaulted limits share this issue. Existing exact/over-boundary tests at `test/PDFReader.test.ts:351-554` and `646-659` supply numeric values only.

Requirements:

1. Resolve each defaulted limit to a finite positive safe integer, treating undefined as omitted. Preserve optional/unset `maxSourceBytes`; reject invalid supplied values with `INVALID_OPTION`.
2. Give resolution one typed, independently testable boundary; avoid separately drifting defaults, validation, and resolved shapes.

Acceptance criteria:

- Omitted properties and explicit undefined produce identical defaults for every defaulted limit, including configuration assembled by object spread.
- A 1,001-page document is rejected with `PAGE_LIMIT_EXCEEDED` in both cases. Representative text/operator/image checks still reject one-over and accept exact limits.
- Null, NaN, infinities, zero, fractions, and unsafe integers cannot disable limits; no extra page/canvas is allocated after rejection.

Verification: V1, V2; V4 at the core-boundary checkpoint.

Completion evidence:

- Changed files: `packages/pdf-reader/src/PDFReader.ts` (added typed exported `resolveLimits()` boundary owning defaults+validation; constructor uses it; removed spread/`#validateLimits`), `packages/pdf-reader/test/PDFReader.test.ts` (3 regression tests: undefined-vs-omitted defaults incl. spread assembly, 1,001-page rejection in both cases, INVALID_OPTION for null/NaN/±Infinity/zero/negative/fraction/2\*\*53).
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 51 tests passed; `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean. Pre-fix check: new tests run against stashed original source fail (old code has no `resolveLimits`; old spread `{...defaults, ...{maxDocumentPages: undefined}}` yields `undefined` and `1001 > undefined === false`, verified via node one-liner). Existing exact/one-over text/operator/image/canvas tests still pass within the 51.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; no CHANGELOG/dist edits; unrelated worktree changes preserved.

### Task PDFR3-02: Snapshot Effective Header Values At The Policy Boundary

Status: completed

Kind: defect

Priority: P1 — a header-value policy may approve different request values from those PDF.js later sends.

Suggested agent: JavaScript source-boundary specialist

Dependencies: none

Primary ownership: source-snapshot/header methods in `packages/pdf-reader/src/PDFReader.ts`; a private source-normalization module if extracted; source-policy unit tests; affected `src/types.ts` documentation.

Finding and references: `#toPdfJsSource`/`#freezeSource` at `src/PDFReader.ts:669-692` freeze only the outer object. `#readHttpHeaders` at `711-732` copies diagnostic values but leaves `rawSource.httpHeaders` live. The test at `test/PDFReader.test.ts:800-837` replaces the whole header property, never mutating its contents. Installed `packages/pdf-reader/node_modules/pdfjs-dist/build/pdf.mjs:15210,15308-15329,13333-13344` retains the header reference until worker readiness and then enumerates it using `for...in`, including inherited values, unlike the wrapper's diagnostic copy.

Requirements:

1. Normalize supported effective headers once into an owned, immutable representation used by both policy and PDF.js. Cover value getters/coercion, inherited enumerable headers, and mutation before and after async approval. Do not freeze the caller's object.
2. Explicitly normalize or reject non-plain header containers; do not report a `Headers` diagnostic view as equivalent to a record if PDF.js consumes different entries. Treat policy approval based only on `hasHttpHeaders` as an existing supported path.
3. Make snapshot construction prototype-safe; special keys must not install mutable inherited loading parameters. Preserve opaque worker/factory identities without claiming recursive immutability.
4. Prefer a private, typed snapshot helper so policy metadata and loading data cannot diverge through duplicated normalization. Coordinate its contract with PDFR3-03.

Acceptance criteria:

- Mutating an approved header value cannot change the effective PDF.js request. Getter/inherited/container cases either produce identical approved/loaded values or a redacted pre-load rejection.
- A browser local-endpoint test or equivalent instrumented PDF.js transport proves the effective headers remain stable while worker setup is deferred, not merely at the initial `getDocument()` call.
- Public shallow-snapshot documentation clearly distinguishes stabilized request fields from deliberately borrowed opaque objects; preserved pass-through cases still pass.

Verification: V1, V2, V3; V4 after the source-boundary tasks.

Completion evidence:

- Changed files: `packages/pdf-reader/src/PDFReader.ts` (single-enumeration `#snapshotHttpHeaders()` mirroring PDF.js `createHeaders` `for...in` semantics incl. inherited, `undefined`-skip, `String()` coercion; fetch-`Headers` containers report `hasHttpHeaders: true` with no value entries so approved/loaded views stay identical; `#createSourceSnapshot()` reads the caller container once and shares one frozen record between policy `info` and `pdfJsSource`; prototype-safe `#toPdfJsSource()` via `defineProperty` with `httpHeaders` live reference replaced by the stabilized record; caller object never frozen; `data`/worker/factory fields stay borrowed references for PDFR3-03), `packages/pdf-reader/src/types.ts` (stabilized-vs-borrowed `PdfReaderSourceInfo` docs), `packages/pdf-reader/test/PDFReader.test.ts` (5 new regressions + stabilized-copy assertions in the deferred-snapshot test + HeaderBag contract update to presence-only blocking).
- Pre-fix failure: new/updated tests run against original header logic fail — nested mutation, getter re-read, inherited header, `Headers` container, prototype `__proto__` snapshot, and the deferred-snapshot stabilized-copy assertions (6 header failures in the isolated run; full-stash run shows the same 6 plus unrelated PDFR3-01/04 worktree drift).
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 60 tests passed; `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 13 Chromium tests passed. Deferred-approval tests mutate headers mid-approval and late `for...in` reads confirm the effective request stays approved while worker setup is deferred. Opaque worker/data pass-through tests still pass.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; byte-limit/copy semantics untouched for PDFR3-03; no CHANGELOG/dist edits; unrelated worktree changes preserved.

### Task PDFR3-03: Enforce Known Byte Limits Across Supported Source Forms

Status: completed

Kind: defect

Priority: P1 — configured source limits can be bypassed by accepted data forms or changing their size during policy approval.

Suggested agent: binary-input and allocation-bound specialist

Dependencies: PDFR3-02

Primary ownership: source normalization and byte accounting in `packages/pdf-reader/src/PDFReader.ts` or the private helper established by PDFR3-02; byte-limit tests; source ownership docs.

Finding and references: `#knownByteLength` at `src/PDFReader.ts:698-703` omits binary strings and scans entire number arrays with `every`. `#enforceSourcePolicy` at `615-625` checks size only before an awaited policy; data remains a borrowed reference (`676-677`). PDF.js explicitly accepts strings in `packages/pdf-reader/node_modules/pdfjs-dist/types/src/display/api.d.ts:14-24` and converts strings/arrays in `build/pdf.mjs:8497-8510`. The existing known-size regression at `test/PDFReader.test.ts:680-687` covers only a direct `Uint8Array`.

Requirements:

1. Count binary strings according to PDF.js's byte conversion; support direct and nested documented array/buffer/view forms with a stated definition of the limit.
2. Reject known over-limit lengths before scanning/copying entire input. Do not claim size is unknown merely because array values are non-finite; normalize or reject invalid input deliberately.
3. Ensure growth of arrays or resizable buffers during policy approval cannot defeat the load-time size check. Decide explicitly between stable normalization and a final size recheck, accounting for PDF.js's conversion timing.
4. Document typed-array transfer, byte-content mutation assumptions, and retry behavior for detached/transferred data; avoid introducing mandatory copies of all typed arrays without measurement.

Acceptance criteria:

- Exact/one-over tests cover binary strings, number arrays, buffers, sliced views, and `DocumentInitParameters.data`.
- An initially one-byte source grown above a two-byte limit during approval fails before PDF.js loading. Resizable-buffer tests run where supported, with an explicit capability skip otherwise.
- Oversized array rejection does not perform element-by-element traversal first. Remote byte limits remain accurately described as application-owned.

Verification: V1, V2, V3 for actual source conversion/transfer behavior; V4 at checkpoint.

Completion evidence:

- Changed files: `packages/pdf-reader/src/PDFReader.ts` (`#knownByteLength` now counts binary strings as `length` per PDF.js `stringToBytes`, arrays as `length` with no element traversal and no finite-value gate, buffers/views as `byteLength`; new `#throwIfOverSourceLimit()` length-first helper; `#enforceSourcePolicy` pre-check preserved; post-approval recheck in `#getOrCreateLoadState` runs in the same synchronous block as `getDocument()` — chosen over stable normalization so typed arrays stay borrowed with no mandatory copies, safe because PDF.js converts `data` synchronously inside `getDocument()`; PDFR3-02 `#snapshotHttpHeaders`/`#createSourceSnapshot`/`#toPdfJsSource` untouched), `packages/pdf-reader/src/types.ts` (byte-limit definition, transfer/detached-retry/mutation docs on `PdfSource`, `maxSourceBytes`, `byteLength`), `packages/pdf-reader/README.md` (byte definition, pre+post approval checks, detached retry), `website/docs/packages/pdf-reader.md` (matching limit sentence), `packages/pdf-reader/test/PDFReader.test.ts` (9 new unit tests), `packages/pdf-reader/test/pdf-reader.browser.ts` (1 new real-Chromium binary-string conversion test).
- Pre-fix failure: 7 of the 9 new unit tests fail against original byte logic (binary-string exact/one-over + policy length, forms matrix via nested string, non-finite array length, throwing-getter no-traversal, array growth during approval, resizable-buffer growth during approval); the typed-array by-reference and remote-URL tests pass pre-fix and document preserved contracts.
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 69 tests passed (60 existing incl. PDFR3-02 header-snapshot regressions + 9 new); `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 14 Chromium tests passed (13 existing + 1 new). Resizable-buffer test runs (Node 26 supports `ArrayBuffer.resize`); explicit `it.skipIf` guard records the skip where unsupported.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; repo-wide `pnpm lint` reports one error at `src/PDFReader.ts:784` (`#isFetchHeaders(value: object | Function)`, `@typescript-eslint/no-unsafe-function-type`) from PDFR3-02's uncommitted worktree code — preserved untouched per isolation, left for its owner/PDFR3-12; no CHANGELOG/dist edits; unrelated worktree changes preserved.

### Task PDFR3-04: Publish Load State Before Synchronous Failure Can Settle It

Status: completed

Kind: defect

Priority: P1 — synchronous pre-load failures permanently retain a rejected load state and violate retry/state contracts.

Suggested agent: asynchronous lifecycle specialist

Dependencies: none

Primary ownership: `packages/pdf-reader/src/PDFReader.ts` load-state initialization/teardown; lifecycle unit tests.

Finding and references: the async IIFE in `#getOrCreateLoadState` starts at `src/PDFReader.ts:454`; its `finally` clears only an already-published state at `500-502`, but publication occurs at `505`. A synchronously thrown policy/size/snapshot/`getDocument()` error executes the finally block before publication, leaving the rejected state cached. Existing retry tests at `test/PDFReader.test.ts:661-678,1278-1308` reject a deferred PDF.js promise and miss this order.

Requirements:

1. Establish ownership before executing synchronously fallible source/policy/PDF.js code, while keeping loading itself asynchronous and policy approval ahead of PDF.js work.
2. Retain idempotent failed-task cleanup and shared-load behavior. Account for a policy callback that synchronously calls reader APIs; define a deterministic reentrancy outcome without duplicate loading tasks.

Acceptance criteria:

- Synchronous policy, known-size, snapshot, and PDF.js initialization failures report `failed`, clear the attempt, and allow a genuinely fresh retry where the cause can be corrected.
- A throw-once/approve-next policy runs twice and the second attempt loads successfully; concurrent callers still share one task.
- Original PDF.js errors survive cleanup errors, and destruction cannot republish a task/document after teardown.

Verification: V1, V2; V4 at checkpoint.

Completion evidence:

- Changed files: `packages/pdf-reader/src/PDFReader.ts` (`#getOrCreateLoadState` publishes `this.#loadingState` before synchronously fallible snapshot/policy/`getDocument()` work; shared `state.promise` deferred is assigned before work starts so reentrant `load()`/`state` share one task; inner task promise forwards to the shared promise; `finally` clears only the published attempt; policy-before-PDF.js order, idempotent `destroyLoadStateTask` cleanup, original-error propagation, and destroy-teardown guards unchanged), `packages/pdf-reader/test/PDFReader.test.ts` (4 regression tests: sync throw-once policy retry, sync reentrant-policy single-task sharing, sync `getDocument` throw retry with original error, known-size/snapshot sync failures report `failed`).
- Pre-fix failure: new tests run against original source fail — sync policy/`getDocument`/known-size/snapshot leave `state === 'loading'` instead of `'failed'`; reentrant policy creates 804 duplicate tasks and overflows the stack.
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 55 tests passed (51 existing incl. PDFR3-01 + 4 new); existing destroy-race/abort-sharing/PDF.js-cleanup-preservation tests still pass within the 55; `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; no CHANGELOG/dist edits; unrelated worktree changes preserved.

### Task PDFR3-05: Own Cancellation Across Every Page-Stage Wait

Status: completed

Kind: defect

Priority: P1 — abort/destruction can leave page operations and their ownership pending behind unresolved PDF.js work.

Suggested agent: cancellation and async-resource ownership specialist

Dependencies: PDFR3-04

Primary ownership: `packages/pdf-reader/src/PDFReader.ts` page pipeline/wait helpers; cancellation adapter in `src/embeddedImages.ts`; focused unit/browser lifecycle tests.

Finding and references: `getPage()` at `src/PDFReader.ts:169`, `getTextContent()` at `237`, and `getOperatorList()` at `src/embeddedImages.ts:61` are awaited directly. The destruction-aware helpers at `src/PDFReader.ts:517-570` cover other stages. The deferred text probe remained pending after destroy. Existing tests at `test/PDFReader.test.ts:1035-1055,1111-1276` concentrate on render/Blob/load waits; README `111` describes broader in-flight rejection.

Requirements:

1. Provide one private cancellation/wait contract reused across load, page retrieval, text, operator retrieval, and encoding where applicable; keep caller-local load semantics distinct from reader destruction.
2. Settle package-facing promises promptly when abort/destroy wins. Observe late rejections and late `getPage()` fulfillment, cleaning any acquired page exactly once without starting later processing.
3. Do not equate racing a promise with cancellation of underlying PDF.js work. Establish how pending page work remains owned, how cleanup completion is observed, and when a subsequent conversion may safely acquire the same reader/page.
4. Document uncancellable upstream work and generator suspension semantics precisely. A yielded iterator is resumed/closed by its consumer; do not promise destruction can force consumer code to run.

Acceptance criteria:

- Deferred get-page/text/operator cases settle caller-facing operations with `ABORTED` or `DESTROYED` without waiting for the deferred work; late resolve/reject paths cause no unhandled rejection or late published result.
- Page/canvas teardown and operation locking remain correct after success, failure, late acquisition, iterator return, and cancellation; sequential reuse cannot overlap orphaned work contrary to the serial guarantee.
- Existing concurrent-load and real-render cancellation regressions continue passing.

Verification: V1, V2, V3, then V4.

Completion evidence:

- Changed files: `packages/pdf-reader/src/PDFReader.ts` (single `#awaitWithSignal` contract with late-value/Rejection observation + `onLateValue` page cleanup; `#awaitWithDestroy` delegates to it keeping caller-local load distinct; `pages()` getPage + `#processPage` text wrapped; bound `awaitWithCancellation` passed to extractor; `pages()`/`destroy()` JSDoc documents uncancellable upstream, exactly-once late cleanup, immediate sequential reuse safety, and generator suspension), `packages/pdf-reader/src/embeddedImages.ts` (`awaitWithCancellation` adapter reused for `getOperatorList`), `packages/pdf-reader/src/types.ts` (`ConvertOptions.signal` documents prompt page/text/operator/render waits + uncancellable upstream + resume observation), `packages/pdf-reader/README.md` (in-flight paragraph + Pages ownership: prompt settle, uncancellable upstream owned only for cleanup observation, late getPage cleaned once never processed, immediate reuse safe, suspended generator resumes/closes only via consumer), `packages/pdf-reader/test/PDFReader.test.ts` (4 deferred-promise regressions, no sleeps).
- Pre-fix failure: all 4 new tests fail pre-fix via 5s timeout (caller-facing `convert` stays pending behind deferred `getPage`/`getTextContent`/`getOperatorList` after abort/destroy) — verified with `-t "deferred getPage"`, `-t "deferred text"`, `-t "deferred operator"` isolated runs.
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 73 tests passed (69 existing incl. concurrent-load/render/blob/destroy-race/iterator-return regressions + 4 new); `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 14 Chromium tests passed (13 existing incl. real-render abort + 1 binary-string conversion). New tests assert prompt ABORTED/DESTROYED, late page exactly-once cleanup with no render/encode/image work, late rejection observed, `state` transitions, and sequential reuse acquiring fresh page after lock release.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; no CHANGELOG.md/dist manual edits; unrelated worktree changes preserved.

### Task PDFR3-06: Decode PDF.js Images By Their Declared Pixel Format

Status: completed

Kind: defect

Priority: P2 — opt-in extraction can silently return incorrect pixels for a valid supported-peer image representation.

Suggested agent: PDF graphics and pixel-format specialist

Dependencies: PDFR3-01, PDFR3-05

Primary ownership: `packages/pdf-reader/src/embeddedImages.ts` image normalization/encoding; embedded-image fixtures and pixel assertions.

Finding and references: `PdfImageObject` at `src/embeddedImages.ts:18-24` omits `kind`; `toRgba` at `220-240` infers channels from length. A one-pixel GRAYSCALE_1BPP XObject containing `0x80` was browser-reproduced as gray rather than white when `isOffscreenCanvasSupported: false`. Wider packed images may instead be skipped. PDF.js distinguishes the layout in `packages/pdf-reader/node_modules/pdfjs-dist/build/pdf.mjs:10603` and its black/white conversion at `9534-9568`. Existing browser fixture assertions at `test/pdf-reader.browser.ts:419-487` check transforms, sizes, counts, and PNG prefixes rather than decoded pixels; its small inline grayscale fixture takes a different RGBA-normalizing PDF.js path.

Requirements:

1. Introduce a private discriminated normalized image representation. Respect PDF.js ImageKind and packed-row padding; unsupported formats must warn/skip rather than be guessed into incorrect pixels.
2. Support the demonstrated one-bit XObject case, including widths not divisible by eight and multiple rows. Preserve RGB, RGBA, and PDF.js-owned bitmap behavior.
3. Validate layout before large scratch allocations. Keep pixel/count/aggregate limits and cancellation propagation intact; share output buffers where practical, without an unmeasured performance claim.
4. Keep format internals private and narrow any documentation claim not backed by real fixtures.

Acceptance criteria:

- A durable supported-peer browser fixture reproduces the old wrong-pixel result and verifies corrected pixel values with browser bitmap conversion enabled and disabled.
- Pixel assertions cover one-bit row boundaries, representative RGB/RGBA colors/alpha, malformed lengths, and unsupported kinds; transform/caching regressions remain green.
- Borrowed bitmaps are never closed by the extractor; failed layouts do not repeatedly allocate large conversion buffers before rejection.

Verification: V1, V2, V3, V4; V5 if allocation/encoding behavior is optimized.

Completion evidence:

- Changed files: `packages/pdf-reader/src/embeddedImages.ts` (added private `kind` on `PdfImageObject`, private `ImageKind` mirror, private discriminated `NormalizedImage` (`bitmap`|`rgba`); `normalizeImageSource()` enforces declared kind strictly — RGBA shares the source buffer, RGB/gray-8 expand, `GRAYSCALE_1BPP` unpacks MSB-first with `ceil(width/8)` row padding (`1`=white/`0`=black, worker-side `needsDecode` inversion already applied upstream); unknown kinds and length mismatches return `undefined` (warn/skip); kind-less legacy shapes keep exact 4/3/1 bytes-per-pixel inference, never packed bits; layout validated before any canvas/conversion allocation; bitmaps borrowed, never closed), `packages/pdf-reader/test/PDFReader.test.ts` (6 unit regressions: 1x1 white `0x80`→`[255,255,255,255]`, 9x2 row-padding pixel matrix, RGB/RGBA incl. alpha, malformed 1-bit skips with no canvas alloc, unknown kind skips with no canvas alloc, borrowed bitmap drawn never closed), `packages/pdf-reader/test/fixtures/generate-embedded-images.mjs` (+ `generated/embedded-1bit.pdf` sidecar: 1x1 white + 9x2 `AA 80 55 00` DeviceGray/BPC-1 XObjects; existing `embedded-images.pdf` byte-identical, sidecar untouched), `packages/pdf-reader/test/pdf-reader.browser.ts` (PNG pixel decode helper + 1-bit test asserting exact pixels with `isOffscreenCanvasSupported: true` and `false`, fresh bytes per iteration since PDF.js detaches on load), `packages/pdf-reader/test/fixtures/README.md` + `packages/pdf-reader/README.md` + `website/docs/packages/pdf-reader.md` (one-bit fixture/coverage sentences only; no perf claims).
- Pre-fix failure: new unit tests run against stashed original `embeddedImages.ts` fail — `-t "one-bit"` → 3 failed (white-pixel gray guess, 9x2 skipped, malformed allocated canvas), `-t "unsupported image kinds"` → 1 failed (kind 99 decoded as RGBA instead of skipped). Isolated browser pre-fix run blocked by shared-worktree build coupling (stashing only `embeddedImages.ts` breaks the PDFR3-05 `awaitWithCancellation` contract at dts build); the browser test asserts `[255,255,255,255]` on the bitmap-disabled path that the review reproduced as `[128,128,128,255]`.
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 79 tests passed (73 existing incl. PDFR3-05 cancellation + transform/caching regressions + 6 new); `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 15 Chromium tests passed (14 existing + 1 new 1-bit × bitmap on/off). Limits/cancel preserved: count/total enforcement still precedes allocation; RGBA still shares buffers.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; shared/unresolved XObject readiness untouched for PDFR3-07; no CHANGELOG.md/dist manual edits; unrelated worktree changes preserved.

### Task PDFR3-07: Establish Shared And Unresolved Image-Object Behavior

Status: completed

Kind: investigation

Priority: P2 — valid shared or not-yet-decoded XObjects may be skipped; supported-fixture impact needs characterization.

Suggested agent: PDF.js compatibility investigator

Dependencies: PDFR3-06

Primary ownership: focused compatibility experiments in `packages/pdf-reader/test`; conclusions in this task's evidence. Any resulting implementation is a separately recorded follow-up or an explicitly scoped amendment before coding.

Finding and references: `resolvePaintedImage` at `src/embeddedImages.ts:174-190` always calls `await page.objs.get(reference)`. In the installed peer, `PDFObjects.get()` is synchronous and throws when unresolved (`packages/pdf-reader/node_modules/pdfjs-dist/build/pdf.mjs:14761-14774`); `await` does not wait for readiness. PDF.js rendering chooses `commonObjs` for `g_` IDs (`10774-10779`), and operator-list completion (`15766-15795`) is distinct from object readiness. Existing browser tests also directly use `page1.objs.get` at `test/pdf-reader.browser.ts:401` and do not establish either boundary.

Requirements:

1. Create bounded real-browser experiments for a shared image reference across enough pages to trigger PDF.js's shared cache and for deferred image decoding/object readiness. Compare extraction before and after rendering.
2. Establish whether the package omits valid XObjects, and whether grouped/repeated image paint operators emitted by these fixtures need an explicit supported/unsupported outcome.
3. Recommend the smallest private store/readiness adapter if needed, including cancellation and cleanup integration with PDFR3-05. Do not advertise all PDF.js operators as supported.

Acceptance criteria:

- Evidence identifies actual operator IDs, selected store, readiness semantics, extracted count/pixels, and supported-peer version; it answers whether each case is defective, intentionally unsupported, or not reproducible.
- Any required fix receives ownership, dependencies, and acceptance criteria in this plan; otherwise record the limitation and reconsideration trigger. A mock-only hypothesis is not sufficient to claim real-PDF compatibility.

Verification: V3 for experiments, V2 for retained tests; review the evidence before adding implementation scope.

Completion evidence:

- Verdict: DEFECTIVE (real-PDF reproduced, not mock-only). `resolvePaintedImage` (`src/embeddedImages.ts:219-235`) routes every named reference through `page.objs.get()`, but the supported peer stores cross-page shared images in `page.commonObjs` under `g_`-prefixed IDs. Those valid XObjects are silently skipped (per-image warn path), so extraction omits them. No runtime change made in this investigation; recommendation below is for coordinator filing (no new task ID minted here). Follow-up filed: the recommended adapter has since been implemented in the working tree and is formalized as Task PDFR3-13 below — see its entry for ownership, acceptance, and verification; this investigation's verdict, method, peer facts, and measurements are unchanged.
- Method (bounded, temporary, since removed): temp browser file `packages/pdf-reader/test/pdfr3-07-probe.browser.ts` built a 3-page PDF in-browser sharing one 8x8 DeviceRGB XObject Ref (2 paints p1, 1 paint p2/p3; exceeds worker `GlobalImageCache.NUM_PAGES_THRESHOLD = 2`). Raw `getDocument` operator/store reads pre-render, full `page.render()` of all pages, post-render re-reads, then package `PDFReader.convert({ includeEmbeddedImages: true })` on identical bytes. Removed after the run; existing suite re-verified green without it.
- Peer facts (`pdfjs-dist` 6.2.108, matching `~6.2.108` peer range): operator IDs `dependency=1 paintXObject=66 paintFormXObjectBegin=74 paintFormXObjectEnd=75 paintImageMaskXObject=83 paintImageXObject=85 paintInlineImageXObject=86`. Store contract: `PDFObjects.get(id)` without callback throws `Requesting object that isn't resolved yet <id>` when unresolved (`build/pdf.mjs:14763-14774`); renderer routes `g_` IDs to `commonObjs` (`build/pdf.mjs:10774-10779`); worker globalizes a repeated image as `g_<docId>_img_…` via `commonobj` once the same Ref is seen on ≥2 pages, and later pages reuse it through `addCachedImageOps` with an `OPS.dependency` entry (`build/pdf.worker.mjs:34083-34097,34507-34523,35196-35201`). Render suspends on unready dependencies via callback-form `get(id, continueCallback)` (`build/pdf.mjs:10850-10858`); operator-list completion is distinct from object readiness. The extractor ignores `OPS.dependency` and never touches `commonObjs`.
- Measurements (real Chromium): p1 paint refs `["img_p0_1","img_p0_1"]`, `dependencyIds ["img_p0_1"]`, `page.objs.has=true`, `objs.get ok w=8 h=8 bitmap=true`. P2/p3 paint refs `["g_d0_img_p1_1"]`, `dependencyIds ["g_d0_img_p1_1"]`, `page.objs.has=false` + `objs.get throw "Requesting object that isn't resolved yet g_d0_img_p1_1."`, `page.commonObjs.has=true` + `commonObjs.get ok w=8 h=8`. Post-render store placement identical (render does not move the object; omission is structural, not a timing flake). Package extraction on the same bytes: `[{page:1,images:2},{page:2,images:0},{page:3,images:0}]` — 2 valid shared XObjects omitted (expected 4 total paint outcomes). P1's repeated paints each produced one entry with its own transform, so repeated-op dedup is sound once the store routes correctly; form-nested flattening is already covered by the existing `embedded-images.pdf` page-2 test. No new supported/unsupported outcome needed for grouped/repeated paint ops beyond the store fix; image masks (`paintImageMaskXObject`) stay explicitly unsupported as today.
- Recommended follow-up (implement; smallest scope): private store/readiness adapter in `src/embeddedImages.ts` only — (a) route references starting with `g_` to `page.commonObjs`, mirroring `CanvasGraphics.getObject`, keeping `page.objs` for the rest; (b) await readiness for unresolved IDs via callback-form `get(id, cb)` (the same primitive the renderer uses) raced through the PDFR3-05 `awaitWithCancellation` contract so abort/destroy settle promptly and late resolutions are dropped, never processed; (c) keep borrowed-bitmap lifetime (never `close()`, PDF.js frees via `page.cleanup()`/destroy) and warn/skip only on genuine decode/shape failure. No new public API, no `commonObjs` leakage into declarations, no claim that all PDF.js operators are supported. Suggested ownership: `src/embeddedImages.ts` + shared-image browser fixture/assertions; dependencies: PDFR3-05 (cancellation) and PDFR3-06 (pixel layout); acceptance: shared-Ref fixture extracts all paints with correct 8x8 pixels on every page (pre- and post-render identical), unresolved-object waits settle on abort/destroy, existing 15 browser + unit suites green.
- Verified commands+results (repo root, serial): `test:browser` with probe → build ok + 16 tests passed (15 existing + 1 probe); after probe removal `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean, `test:browser` → build ok + 15 Chromium tests passed. Changed files: this task section only; no CHANGELOG.md/dist edits; unrelated worktree changes preserved.

### Task PDFR3-08: Validate Runtime Options And Canvas Results Consistently

Status: completed

Kind: defect

Priority: P2 — untyped inputs escape the promised structured validation and can produce misleading image results.

Suggested agent: runtime-contract and canvas-boundary specialist

Dependencies: PDFR3-01, PDFR3-05, PDFR3-06

Primary ownership: `packages/pdf-reader/src/options.ts`; page/embedded canvas guards in `src/PDFReader.ts` and `src/embeddedImages.ts`; focused option/output tests.

Finding and references: `src/options.ts:16-39,54-60` does not validate MIME, non-number/non-function scale, boolean flags, or tuple shape before methods/spreads. A three-element range is accepted; a non-array range can throw native TypeError. `src/PDFReader.ts:602-608` accepts deadlines beyond the browser timer range. Page allocation at `398-409` checks the product but not positive individual dimensions; output at `325-335` labels a result with the requested MIME without checking the actual data URL/Blob. Browsers may return `data:,` for unencodable canvas dimensions. Existing tests cover valid MIME output and null Blob/context errors, but not these cases.

Requirements:

1. Reject unsupported MIME, malformed ranges, invalid scale/flag shapes, and invalid deadlines with `INVALID_OPTION` before PDF.js page work. Preserve reversed two-element ranges and normal optional defaults. Bound timer values or implement a documented long-deadline strategy.
2. Share a private positive-safe-dimension and encode-result guard where it prevents page/embedded behavior drift. Do not allocate zero, negative, non-finite, or unsafe dimensions; ensure partial allocation errors release owned canvases.
3. Reject empty/sentinel encodes and MIME mismatches with an intentional package error instead of reporting successful PNG/JPEG output. Distinguish invalid caller options from browser capability failures.

Acceptance criteria:

- Table-driven runtime tests cover invalid values arriving through JavaScript/unknown casts, invalid tuple lengths and sparse tuples, deadline boundary, and malformed dimensions; errors have stable documented codes.
- Default and valid PNG/JPEG Blob/data-URL results retain their existing contract. Empty/fallback output cannot be published with a false MIME claim; cleanup occurs on rejection.
- No new public canvas abstraction or output mode is introduced solely for this refactor.

Verification: V1, V2, V3 for browser output behavior, then V4.

Completion evidence:

- Changed files: `packages/pdf-reader/src/canvasGuards.ts` (new private shared guards: `MAX_TIMER_MS=2_147_483_647`, `resolveSafeCanvasDimensions`, `isValidDataUrlForMime`, `isValidBlobForMime`; not exported from index), `packages/pdf-reader/src/options.ts` (strict `resolveConvertOptions`: object guard, MIME/flag/tuple-shape validation, scale must be number|function; strict `validatePageRange` length-2 + sparse check + non-array INVALID_OPTION; `resolvePageNumbers` defends length), `packages/pdf-reader/src/PDFReader.ts` (`#resolveLoadOptions` object guard + deadline upper bound with INVALID_OPTION, `#allocateCanvas` via shared guard with try/release on partial failure, `#encodePageImage` data-URL/Blob MIME+empty validation to UNSUPPORTED_ENVIRONMENT), `packages/pdf-reader/src/embeddedImages.ts` (`readImageDimensions`/`allocateCanvas` via shared guard, `imageToDataUrl` returns undefined on sentinel/mismatch so warn/skip never publishes false MIME, partial-alloc release), `packages/pdf-reader/src/types.ts` (deadlineMs max JSDoc), `packages/pdf-reader/test/PDFReader.test.ts` (7 new table-driven regressions).
- Pre-fix failure: new tests run against stashed original src fail — `rejects invalid runtime` fails publishing `image/gif` success instead of INVALID_OPTION; `malformed page ranges` fails publishing 2-page success for 3-elem range instead of INVALID_OPTION; `bounds load deadlines` fails (no INVALID_OPTION for 2147483648, Node TimeoutOverflowWarning fires after 1ms).
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 86 tests passed (79 existing incl. PDFR3-01/05/06 + 7 new); `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 15 Chromium tests passed. Reversed `[3,1]` + defaults retained; valid PNG/JPEG data-URL/Blob contracts retained; `data:,`/mismatch/empty-Blob rejected with UNSUPPORTED_ENVIRONMENT with canvas release + page cleanup; no new public export (index.ts untouched).
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12; repo-wide lint shows one pre-existing error at `src/PDFReader.ts:873` (`#isFetchHeaders(value: object | Function)`) from PDFR3-02 worktree — preserved untouched per isolation; no CHANGELOG.md/dist edits; unrelated worktree changes preserved.

### Task PDFR3-09: Correct Installed-Consumer Resource-Lifetime Examples

Status: completed

Kind: defect

Priority: P2 — copy-paste examples leak a caller-owned worker or invalidate the preview before it loads.

Suggested agent: TypeScript consumer documentation and browser lifecycle specialist

Dependencies: PDFR3-02, PDFR3-03, PDFR3-05, PDFR3-06, PDFR3-07, PDFR3-08

Primary ownership: `packages/pdf-reader/README.md`; matching `website/docs/packages/pdf-reader.md`; highest-value source JSDoc and declaration-consumer coverage.

Finding and references: README `56-70` creates a `PDFWorker` but only destroys the reader; the browser probe proved the worker remains alive. PDF.js assigns `task._worker` only for its own worker at `packages/pdf-reader/node_modules/pdfjs-dist/build/pdf.mjs:15263-15269`, and destroys that owned worker at `15362-15379`. Website `48` creates a worker inline with no retained teardown handle. README `164-174` revokes a Blob URL immediately after `preview.src` assignment; the browser probe's `Image.decode()` rejected. `src/types.ts:106-146`/`dist/index.d.mts:89-125` also omit useful option defaults and image coordinate/size semantics from editor-visible declarations.

Requirements:

1. Demonstrate caller-owned `PDFWorker` destruction in a finally path even if reader teardown rejects. Explain the difference between a `Worker`, a `PDFWorker`, and a worker internally created by PDF.js; show the required worker-asset configuration.
2. Keep preview URLs alive through decoding/display and release them on an appropriate replacement/disposal/error path. Use a self-contained browser example, not immediate revocation after assignment.
3. Show the compatible peer minor in the installation command so a future latest PDF.js release cannot silently contradict the stated peer range.
4. Add concise public JSDoc for conversion defaults, 1-based page range, embedded-image user-space coordinates (`y` is the upper bound), and what `size` measures. Do not describe it as encoded PNG length. Verify comments survive emission.
5. Keep prose readable: separate load, page-operation, and teardown contracts currently combined in README `111`, and align the migration notes with preceding tasks.

Acceptance criteria:

- A real-browser example test proves the preview decodes before revocation and caller-owned worker cleanup occurs explicitly, including load failure.
- README, website, and emitted declarations agree on ownership, cancellation, byte accounting, image support, and output semantics. Installed consumers can use examples without repository source access.
- No accidental default/deep export is added and existing strict consumer checks remain green.

Verification: V2, V3, V4, V6; inspect built declarations and packed README.

Completion evidence:

- Changed files: `packages/pdf-reader/README.md` (install `pdfjs-dist@~6.2.108`; Worker-vs-PDFWorker-vs-internal ownership + bundler worker-asset note + nested-finally caller-owned `PDFWorker.destroy()` example; Load/Page-operation/Teardown contract split of old line 111 with failed-retry sentence; self-contained blob-preview example keeping the URL alive through `decode()` with replacement/disposal/error release; migration table extended with source-snapshot/byte-limit, cancellation-ownership, option/output-validation, and image+performance rows; shared `g_`→`commonObjs` + `y`-upper-bound + decoded-byte `size` sentences), `website/docs/packages/pdf-reader.md` (matching install/worker-nested-finally/preview-lifetime/image-semantics/defaults+1-based-range/migration prose), `packages/pdf-reader/src/types.ts` (concise public JSDoc: per-field `ConvertOptions` defaults, 1-based `pageRange`, user-space coords with `y` as upper bound, `size` as decoded source bytes explicitly not encoded PNG length, unscaled `pageWidth`/`pageHeight`), `packages/pdf-reader/src/worker.ts` + `packages/pdf-reader/src/PDFReader.ts` (JSDoc-only: caller-created `PDFWorker` never destroyed by reader/task teardown, destroy explicitly even on rejection), `packages/pdf-reader/test-decl-consumer/decl-consumer.mts` (caller-owned worker destroy/`destroyed` + `ExtractedImage` y/size/pageWidth/mimeType assertions, strict `@ts-expect-error` default/deep-export guards retained), `packages/pdf-reader/test/pdf-reader.browser.ts` (2 new real-Chromium tests mirroring the documented examples: blob preview `decode()` resolves while the URL is live with `worker.destroyed === true` after nested finally; malformed-load failure still destroys the caller-owned worker with no leaked document).
- Doc/behavior alignment: `Worker` (browser thread) vs `PDFWorker` (PDF.js ownership wrapper) vs internally created worker verified against installed `pdfjs-dist@6.2.108` (`build/pdf.mjs`: internal worker assigned to `task._worker` ~15263-15269 and destroyed with the task ~15362-15379; caller-supplied `worker` leaves the slot empty; port-backed `PDFWorker.destroy()` releases PDF.js state without terminating a caller-supplied port thread). Shared-store prose matches in-tree `selectImageStore`/`awaitResolvedImageObject` (`g_`→`commonObjs`, callback-form readiness raced through the PDFR3-05 contract); no-concurrency/no-streaming-text rows match the PDFR3-10 serial decision and PDFR3-11 DEFER verdict.
- Pre-fix failure: review baseline already demonstrated both defects (worker alive after `reader.destroy()`; `Image.decode()` rejects after immediate revoke). New tests fail by construction against the old examples, which never called `worker.destroy()` and revoked before decode.
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean (V2); `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 17 Chromium tests passed, 15 existing + 2 new (V3); `pnpm --filter @web-ts-toolkit/pdf-reader test` → 90 Node/decl/packed tests passed + 17 browser passed, incl. strict NodeNext/Bundler decl-consumer with new assertions and packed-tarball vite build with no default/deep export (V4); `npm pack --dry-run --json` from `packages/pdf-reader` → 4 intended artifacts (`README.md`, `dist/index.mjs`, `dist/index.d.mts`, `package.json`), no bundled deps (V6). Built `dist/index.d.mts` carries the new ConvertOptions/ExtractedImage/worker/destroy JSDoc; packed README contains the peer-pinned install, nested-finally, decode-before-revoke, and split contracts; `git diff --check` clean on all touched files.
- Follow-ups: V5/V7 + repo-wide integration checkpoint owned by PDFR3-12; no CHANGELOG.md/dist manual edits; unrelated worktree changes preserved (other agents' files untouched; `src/PDFReader.ts` + `src/worker.ts` changes are JSDoc comments only).

### Task PDFR3-10: Make Performance Evidence Bounded And Comparable

Status: completed

Kind: improvement

Priority: P2 — current benchmark claims overstate what is bounded/measured, weakening future performance decisions.

Suggested agent: browser-performance measurement specialist

Dependencies: PDFR3-06

Primary ownership: `packages/pdf-reader/benchmark/pdf-reader.benchmark.browser.ts`, `benchmark/README.md`; performance paragraphs in package/website docs by coordinated handoff.

Finding and references: `runBoundedStrategy` at benchmark lines `276-335` bounds active workers but not completed results: while the earliest page stalls, another worker can fill `completed` with the rest of the document. README `63` says it does not buffer unbounded completed pages. `measureStrategy:338-364` excludes two document loads and sums per-document page peaks, which is not a measured simultaneous peak. Abort measurement still sleeps 5 ms (`403`) even after PDFR2-08 fixed the integration test. Embedded-image timing uses the tiny fixture (`495-542`), and old README measurements predate the two-reader benchmark change.

Requirements:

1. Bound scheduling/reorder retention explicitly and verify slow-first-page and slow-consumer cases; identify package-owned versus PDF.js-internal resources in metrics.
2. Track simultaneous active pages globally, report loaded reader/worker counts, and separate load-inclusive time from conversion-only time. Record warmup, repeated samples, and measurement order; avoid attributing two-worker gains solely to page concurrency.
3. Synchronize abort measurements with an observed active stage. Report when that stage cannot be reached instead of relying on a delay.
4. Add representative unique/repeated image workloads within safe budgets; measure encode counts, scratch/output accounting, wall time, and long tasks. Preserve historical results as historical, and publish a clearly dated current baseline.

Acceptance criteria:

- A stalled first page cannot cause result retention beyond the declared reorder window, regardless of document length; output order remains deterministic.
- Simultaneous resource metrics are validated against deliberate overlap/non-overlap. Measurements state exclusions, versions, fixture dimensions, repetition counts, and variability.
- Documentation removes unsupported bounded-retention claims and does not propose runtime concurrency or Blob changes without evidence.

Verification: V2, V5 and focused scheduler checks; V4 if runtime or shared fixture code changes.

Completion evidence:

- Changed files: `packages/pdf-reader/benchmark/pdf-reader.benchmark.browser.ts` (declared `CONCURRENCY=2`/`REORDER_WINDOW_PAGES=2`; `runBoundedStrategy` drains the emittable prefix synchronously and blocks workers while post-drain retention is at the window; global simultaneous page tracker replacing summed per-document peaks; per-run `loadWallTimeMs`/`convertWallTimeMs`/`totalWallTimeMs`, `loadedReaderCount`, `workerSetup`, `peakRetainedPages`, ownership notes; 1 warmup + 3 interleaved repeats with `measurementOrder` and min/median/max; stage-synchronized abort with `stageReached`/`stageDetail` and unreachable-stage reporting; image workloads for mixed-unique `embedded-images.pdf` p1 and repeated-raster `image-heavy.pdf` p1 with encode/scratch/output/wall/long-task accounting; 3 focused checks: stalled-first-page bound, slow-consumer bound, overlap-vs-non-overlap tracker validation), `packages/pdf-reader/benchmark/README.md` (ownership/exclusions, window/repeats/abort/image methodology, 2026-08-19 preserved as historical, dated 2026-09-12 current baseline with medians/ranges/variability), `packages/pdf-reader/README.md` + `website/docs/packages/pdf-reader.md` (unsupported single-sample/summed-peak claims replaced with windowed, load-separated, dated baseline prose; serial-only decision kept with no runtime concurrency/Blob proposal).
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader benchmark` → build ok + 5 browser tests passed (2 scheduler-bound checks, 1 tracker overlap check, 1 page matrix, 1 image-workload matrix). Current baseline (HeadlessChrome/151.0.7922.34, hw 32/32, pdfjs 6.2.108): conversion-only medians serial vs bounded — short 36.8 vs 37.9 ms, long 220.4 vs 176.6 ms (peaks 2/2, retained 0<=2), text-heavy 131.2 vs 109.9 ms, image-heavy 115.3 vs 101.0 ms; bounded load costs ~110–150 ms extra (2 documents) so load-inclusive favors serial; abort stage-synchronized serial 2.8 ms / bounded 3.7 ms both ABORTED with stageReached true; image repeats mixed-unique 6 images/3 encodes/3 scratch/~876 B vs repeated-raster 6 images/1 encode/1 scratch/~227,940 B, ops {1,5,2} vs {0,6,1}, 0 long tasks. Stalled-first-page (12 pp) and slow-consumer (8 pp, 20 ms drain delay) checks assert exact 1..N order with peakRetainedPages <= 2; tracker check asserts overlap peak 2 vs sequential peak 1.
- Follow-ups: V4 not required (no `src/` runtime or shared fixture-generator change); V4/V5 integration checkpoint owned by PDFR3-12; no CHANGELOG.md/dist manual edits; unrelated worktree changes preserved (restored tracked benchmark screenshot dir after removing failure artifacts).

### Task PDFR3-11: Evaluate Incrementally Bounded Text Extraction

Status: completed

Kind: investigation

Priority: P2 — a potential missing capability can enforce text limits earlier and improve cancellation without changing result shape.

Suggested agent: streaming-text and memory-performance investigator

Dependencies: PDFR3-01, PDFR3-05

Primary ownership: a focused experiment under `packages/pdf-reader/benchmark` or `test`; evidence and recommendation in this task. Production text changes require a documented follow-up decision.

Finding and references: `src/PDFReader.ts:235-239,288-312` waits for complete `TextContent` before checking counts. README `241` accurately disclaims the initial allocation. The installed peer exposes `streamTextContent()` and implements `getTextContent()` by accumulating it (`packages/pdf-reader/node_modules/pdfjs-dist/build/pdf.mjs:15797-15829`), offering a concrete earlier enforcement boundary. PDF.js uses a separate XFA route at `15814-15817`, so replacing it blindly could lose behavior.

Requirements:

1. Compare current aggregation against consuming PDF.js text chunks while checking item/code-unit limits, cancelling the stream reader on limit/abort/destroy, and preserving text/styles/lang semantics.
2. Use bounded text-heavy and over-limit fixtures; measure received/retained chunks/items/code units and cancellation latency. Do not claim a whole-parser memory cap from wrapper measurements.
3. Evaluate XFA, marked-content, and normalization behavior before recommending a private implementation change or public opt-in. Limit this investigation to text extraction, not a new search/OCR/reading-order API.

Acceptance criteria:

- Evidence answers whether earlier enforcement avoids full wrapper accumulation, whether cancellation releases the stream, and which existing TextContent behaviors require fallback.
- Conclude implement/defer/no-action with measured benefit, compatibility costs, and a scoped implementation task if warranted. No speculative API is required to complete this investigation.

Verification: V2, V3 for semantic/cancellation experiments, V5 when measurements are added there; evidence review.

Completion evidence:

- Verdict: DEFER — no production text change. Bounded evidence shows zero incremental benefit at the supported-fixture scale, a hanging stream-cancel that would violate the PDFR3-05 prompt-settle contract, and required XFA/param fallbacks. No new task ID minted; reconsideration trigger below. No speculative API added.
- Method (bounded, temporary, since removed): two temp browser files under `packages/pdf-reader/test/`, removed after the runs — `pdfr3-11-probe.browser.ts` (stream-vs-`getTextContent` semantic equivalence with pdf.mjs-identical merge `lang ??=` + `Object.assign(styles)` + `items.push(...)`; param parity for `includeMarkedContent`/`disableNormalization`; early-limit simulation with tiny `maxItems=10`/`maxUnits=200` counting received vs retained chunks/items/code-units plus `reader.cancel()` latency and post-cancel `read()`; `PDFReader.convert` over-limit baseline) and `pdfr3-11-cancel.browser.ts` (isolates the hanging stage with 2500 ms timeout races so the test never hits the 15 s runner timeout; XFA/shape check). Bounded fixtures only: `benchmark/generated/text-heavy.pdf` p1 (3 pp × 48 lines) plus over-limit-by-configuration (tiny limits, no large allocation). Existing suite re-verified green without the probes.
- Peer facts (`pdfjs-dist` 6.2.108, matching `~6.2.108`): `streamTextContent({includeMarkedContent, disableNormalization})` returns a `ReadableStream` (`highWaterMark`/`TEXT_CONTENT_CHUNK_SIZE = 100`, `size = items.length`; `build/pdf.mjs:15797-15829`); `getTextContent(params)` accumulates it with `lang ??= value.lang`, `Object.assign(styles, value.styles)`, `items.push(...value.items)`. XFA route (`15814-15817`): when `_transport._htmlForXfa` is set, `getTextContent` returns `XfaText.textContent(xfa)` — `{items: [{str}], styles: {}}`, no `dir/width/height/transform/fontName/hasEOL`, no `lang` — while `streamTextContent` always sends `GetTextContent` to the worker page path, so streaming bypasses XFA. Worker (`build/pdf.worker.mjs:35673ff,36171ff,36367ff,64771ff`): per-chunk `textContent.styles` reset with `items = []` (consumer must re-merge); `lang` carried per chunk; `disableNormalization` skips `normalizeUnicode` in `runBidiTransform`; `includeMarkedContent` emits `{type, tag}` items; chunks flush when `items.length >= sink.desiredSize` or at end; `sink.ready` backpressure stalls the worker when the client stops pulling; client `cancel()` posts `CANCEL` and awaits `CANCEL_COMPLETE`, but the worker `CANCEL` branch replies only when `streamSinks[streamId]` still exists (`if (!streamSink) break`, no reply) — a completed/closed stream never acknowledges cancel.
- Measurements (real Chromium, text-heavy p1): `getTextContent` = 48 items / 4791 code units / styles `["g_d0_f1"]` / `lang null`; streamed accumulation = 1 chunk / 48 received items / 48 merged items / 4791 merged units, `JSON.stringify(items)` identical, style keys and `lang` identical (probe asserted). Param parity: `plain 48` vs `includeMarkedContent:true 48` (fixture has no marked content) and `disableNormalization:true 48`; streamed accumulation with the same params reproduces each `getTextContent` result exactly (asserted). Early-limit (`maxItems=10`): the single stream chunk already carries all 48 items, so received == full and retained-prefix saving is nil at this scale — earlier enforcement cannot avoid full wrapper accumulation for pages under one chunk, and worker + transport already allocated the full chunk before the wrapper sees it. `reader.cancel(new Error(...))` after the first (only) chunk did NOT settle within 2500 ms (bounded race) and hung past the 15 s runner timeout in the unraced probe (2 tests timed out); post-cancel `read()` never reached. Abort-style cancel (first-chunk then cancel) hung identically. Current production baseline still rejects correctly, just late: `PDFReader.convert` with `limits: {maxTextItems: 10}` rejects `TEXT_LIMIT_EXCEEDED` after full `getTextContent` (asserted). No whole-parser cap is claimed: worker-side content parsing, font loading, and transport allocation precede any wrapper chunk boundary.
- Answers: (1) earlier enforcement does not avoid full wrapper accumulation at the bounded-fixture scale (1 chunk = full page) and cannot bound worker/transport allocation generally — at best it saves retaining tail items on multi-chunk (>100-item) pages; (2) cancellation does NOT release the stream — `cancel()` hangs when the worker sink already closed/completed, so wiring it into the PDFR3-05 abort/destroy path would regress prompt `ABORTED`/`DESTROYED` settle into hangs; (3) fallback required for XFA (stream bypasses the `XfaText` branch; wrapper has no public XFA detector since `_transport` is private — blind replacement loses XFA shape), plus `includeMarkedContent`/`disableNormalization` must be plumbed (currently unexposed; adding them is public API expansion, out of scope) and the styles/lang merge must duplicate `pdf.mjs` exactly (drift risk on peer upgrades).
- Benefit/costs: benefit — bounded prefix retention on large multi-chunk pages only (unmeasured here; would need a large-text workload that violates the small-fixture policy). Costs — hanging cancel breaks PDFR3-05 semantics; XFA fallback + param plumbing + merge-duplication maintenance; no worker-memory cap regardless. Scoped follow-up IF warranted (not created): revisit only when (a) the supported PDF.js stream-cancel contract acknowledges post-completion cancel (or a bounded cancel-timeout/drop-reader discipline is proven leak-free worker-side), (b) a bounded large-text workload demonstrates material wrapper-retention savings, and (c) XFA detection + param exposure are accepted as API scope. Then: private chunk-consumer in `src/PDFReader.ts` only, reusing the PDFR3-05 `awaitWithSignal` contract (never await bare `cancel()`), forwarding both text params, XFA fallback to `getTextContent`, acceptance = chunk-count>1 fixture shows retained<prefix vs full with prompt abort/destroy settle and byte-identical text/styles/lang vs `getTextContent`.
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; probe runs → semantic + params tests passed with the metrics above, early-limit + abort-cancel tests timed out at 15 s (the cancel-hang evidence; screenshots removed); bounded cancel-race rerun → `first-read {done:false, items:48, fullItems:48}`, `cancel-race {settled:false}` (>2500 ms), `xfa-check {htmlForXfa:null, sampleItemKeys:[dir,fontName,hasEOL,height,str,transform,width], lang:null, styleKeys:[g_d0_f1]}`; after probe removal `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 15 Chromium tests passed. V5 not run: no durable benchmark measurements were added (temp-only investigation per plan). Changed files: this task section only; no `CHANGELOG.md`/dist edits; unrelated worktree changes preserved.

### Task PDFR3-13: Resolve Shared And Unresolved Image Objects Through The Document-Wide Store

Status: completed

Kind: defect

Priority: P2 — opt-in extraction silently omitted valid cross-page shared XObjects (same class as PDFR3-06's pixel defect, narrower blast radius: only documents reusing one image Ref across pages).

Suggested agent: PDF.js compatibility implementer (formalized from pre-existing worktree fix; no new agent needed)

Dependencies: PDFR3-05 (cancellation contract), PDFR3-06 (pixel layout), PDFR3-07 (investigation verdict and remedy design)

Primary ownership: store/readiness adapter in `packages/pdf-reader/src/embeddedImages.ts`; shared-image fixture in `packages/pdf-reader/test/fixtures/generate-embedded-images.mjs` + `packages/pdf-reader/test/fixtures/generated/embedded-shared.pdf`; regression assertions in `packages/pdf-reader/test/pdf-reader.browser.ts`.

Finding and references: PDFR3-07 proved DEFECTIVE on real PDFs — `resolvePaintedImage` routed every named reference through `page.objs.get()`, but the supported peer (`pdfjs-dist` 6.2.108) stores cross-page shared images in `page.commonObjs` under `g_`-prefixed IDs (worker globalizes a repeated Ref via `commonobj` once seen on ≥2 pages; renderer routes `g_` IDs to `commonObjs` at `build/pdf.mjs:10774-10779`). `PDFObjects.get()` without a callback throws `Requesting object that isn't resolved yet` when unresolved (`build/pdf.mjs:14763-14774`); the renderer suspends on dependencies via callback-form `get(id, cb)` (`build/pdf.mjs:10850-10858`). Measured extraction on identical bytes: `[{page:1,images:2},{page:2,images:0},{page:3,images:0}]` — 2 valid shared XObjects omitted of 4 expected paint outcomes. Worktree fix observed at `src/embeddedImages.ts:83-92` (`ImageObjectStore` structural view), `258-261` (`selectImageStore`: `g_`→`page.commonObjs`, fallback to `page.objs`), `273-294` (`awaitResolvedImageObject`: `has()` fast path, callback-form readiness wait raced through the PDFR3-05 `awaitWithCancellation` contract), `244-249` (`resolvePaintedImage` routing).

Requirements:

1. Route references starting with `g_` to `page.commonObjs`, mirroring `CanvasGraphics.getObject`; keep `page.objs` for the rest with a legacy fallback when `commonObjs` is absent.
2. Await readiness for unresolved IDs via callback-form `get(id, cb)` raced through the PDFR3-05 contract so abort/destroy settle promptly; late resolutions are dropped, never processed; late rejections observed, never unhandled.
3. Keep borrowed-bitmap lifetime (never `close()`; PDF.js frees via `page.cleanup()`/destroy) and warn/skip only on genuine decode/shape failure. No new public API, no `commonObjs` leakage into declarations, no claim that all PDF.js operators are supported.

Acceptance criteria:

- A durable shared-Ref browser fixture (3 pages, 2 paints p1 + 1 paint p2/p3, exceeding `GlobalImageCache.NUM_PAGES_THRESHOLD = 2`) extracts all paints with correct 8x8 pixels on every page.
- Unresolved-object waits settle on abort/destroy; existing unit + browser suites stay green.
- Pre-fix failure demonstrated (PDFR3-07 probe measurement; new test fails by construction against `page.objs`-only routing).

Verification: V1, V2, V3.

Completion evidence:

- Provenance (honest): the `src/embeddedImages.ts` store/readiness adapter, the `buildSharedPdf()` generator + `embedded-shared.pdf` + base64 sidecar, and the README/website shared-store prose all pre-existed in the working tree when PDFR3-13 was filed (the generator docstring already names PDFR3-13 as the PDFR3-07 follow-up). No `src/` runtime change was made during formalization — but verification found a coverage gap: no test consumed the shared fixture (`test/pdf-reader.browser.ts` imported only `embedded-images` + `embedded-1bit`; `grep embedded-shared` hit only the generator; no unit test covers `selectImageStore`/`awaitResolvedImageObject` routing). Formalization therefore added the missing durable regression test (test-only change, zero runtime behavior change) plus this entry. A stray duplicated copy of the PDFR3-11 Finding/Requirements/Acceptance/Verification block that sat headerless between PDFR3-11 and PDFR3-13 was still present at formalization; the PDFR3-12 reviewer removed it (authoritative PDFR3-11 section untouched).
- Changed files observed in `git diff --stat` / status: `packages/pdf-reader/src/embeddedImages.ts` (pre-existing: `ImageObjectStore`, `selectImageStore`, `awaitResolvedImageObject`, `resolvePaintedImage` routing; file also carries PDFR3-05/06/08 hunks owned by those tasks), `packages/pdf-reader/test/fixtures/generate-embedded-images.mjs` (pre-existing: `buildSharedPdf` — 3 pages sharing one 8x8 DeviceRGB Ref, solid red pixels — + `embedded-shared.pdf` write block), `packages/pdf-reader/test/fixtures/generated/embedded-shared.pdf` + `.base64.txt` (pre-existing, untracked), `packages/pdf-reader/test/pdf-reader.browser.ts` (formalization-added: `embeddedSharedB64` import + `extracts a cross-page shared image on every page via the document-wide store (PDFR3-13)` test asserting 2/1/1 image counts, exact `[8,0,0,8,…]` transforms, and end-to-end PNG-decoded solid-red 8x8 pixels on all 4 paints).
- Pre-fix failure: PDFR3-07's real-Chromium probe on the same construction measured `[{page:1,images:2},{page:2,images:0},{page:3,images:0}]`; the new test's 2/1/1 counts fail by construction against `page.objs`-only routing (p2/p3 paint refs are `g_`-prefixed `commonObjs` entries; `page.objs.has` is false and `get` throws unresolved). No isolated pre-fix re-run was performed (would require stashing combined PDFR3-05/06/08 hunks sharing the file).
- Verified commands+results (repo root, serial): `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.config.mts test/PDFReader.test.ts` → 1 file / 86 tests passed; `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean; `pnpm --filter @web-ts-toolkit/pdf-reader test:browser` → build ok + 18 Chromium tests passed (17 pre-existing incl. PDFR3-03/06/09 additions + 1 new PDFR3-13 shared-store test); `git diff --check` clean on touched files.
- Follow-ups: V4 integrated checkpoint owned by PDFR3-12 (now lists PDFR3-13 as a dependency); `packages/pdf-reader/test/fixtures/README.md` fixture table still lists only `embedded-images.pdf`/`embedded-1bit.pdf` — one-line `embedded-shared.pdf` row left for the PDFR3-12 reviewer or fixture owner; no CHANGELOG.md/dist edits; unrelated worktree changes preserved (message-service/moo files untouched).

### Task PDFR3-12: Independently Review Integrated Runtime And Published Contracts

Status: completed

Kind: improvement

Priority: P1 — cross-path interactions and published behavior must be verified before declaring remediation complete.

Suggested agent: independent reviewer who did not implement the core fixes

Dependencies: PDFR3-01, PDFR3-02, PDFR3-03, PDFR3-04, PDFR3-05, PDFR3-06, PDFR3-07, PDFR3-08, PDFR3-09, PDFR3-10, PDFR3-11, PDFR3-13

Primary ownership: read-only package/artifact audit, integration evidence and task statuses in this file. Fixes found during review require explicit follow-up ownership.

Finding and references: `PDFReader.ts`, `embeddedImages.ts`, `options.ts`, public types, consumer docs, and tests jointly define the contracts above. Prior completion records did not cover these demonstrated edge cases; individually green tests do not establish combined correctness.

Requirements:

1. Review every acceptance criterion, including configured limits, mutable policy input, synchronous/asynchronous failure, late acquisition, actual image pixels, worker ownership, and installed documentation.
2. Check proposed private helpers remove duplicated normalization/wait/encoding rules without introducing a generic framework or leaking PDF.js private image shapes into public declarations.
3. Verify outcomes of investigations and any newly added dependent tasks. Record deferred work with rationale, owner, trigger, and residual risk; do not silently treat an investigation as a fix.
4. Run the appropriate integrated checks serially. An unrelated workspace failure must retain its exact command, result, owner, and remaining unverified criteria; do not mark required verification completed while blocked.

Acceptance criteria:

- All implemented findings have regression evidence; no unresolved P1 defect in this plan is dismissed through documentation alone.
- V2–V7 pass for their applicable scope. Fresh packed metadata, ESM entry, strict consumer types, worker bundling, README, and declarations agree.
- Independent evidence records resource ownership through failure/cancellation and real-browser pixel/preview behavior. Performance claims correspond to current reproducible measurements.

Verification: V2, V3/V4, V5, V6, V7; avoid repeating an unchanged passing browser suite already included in V4 unless a new concern justifies it.

Completion evidence (independent reviewer, did not implement core fixes; read-only audit + task-file/doc corrections only, no `src/` runtime change, no `CHANGELOG.md`/dist edits, unrelated message-service/moo worktree changes preserved):

- Acceptance review, per task: PDFR3-01 — `resolveLimits()` treats explicit `undefined` as omitted for every defaulted limit, rejects null/NaN/±Infinity/zero/fraction/2\*\*53 with `INVALID_OPTION`, keeps `maxSourceBytes` optional; 3 regressions incl. spread-assembly and 1,001-page `PAGE_LIMIT_EXCEEDED` in both cases. PDFR3-02 — single-enumeration `#snapshotHttpHeaders()` mirrors PDF.js `for...in` semantics (inherited, `undefined`-skip, `String()` coercion), one frozen record shared by policy `info` and `pdfJsSource`, prototype-safe snapshot, caller object never frozen; deferred-approval browser evidence shows stability while worker setup is deferred. PDFR3-03 — `#knownByteLength` counts strings/arrays/buffers/views by length with no element traversal, length-first `#throwIfOverSourceLimit()` pre-check plus post-approval recheck in the same synchronous block as `getDocument()`; exact/one-over matrix plus growth-during-approval and resizable-buffer regressions, plus a real-Chromium binary-string conversion test. PDFR3-04 — `#getOrCreateLoadState` publishes ownership before synchronously fallible work; sync policy/size/snapshot/`getDocument()` failures report `failed` and allow genuine retry; throw-once/reentrant/`getDocument`-throw regressions. PDFR3-05 — single `#awaitWithSignal` contract (late-value cleanup, late-rejection observation) reused for getPage/text/operator via the `awaitWithCancellation` adapter; 4 deferred-promise regressions assert prompt `ABORTED`/`DESTROYED`, exactly-once late-page cleanup, and immediate sequential reuse. PDFR3-06 — private `ImageKind` mirror + discriminated `NormalizedImage`, strict kind enforcement with `ceil(width/8)` 1-bit unpacking, layout validated before allocation, borrowed bitmaps never closed; 1×1-white + 9×2-padding unit regressions and a durable 1-bit browser fixture asserting exact pixels with bitmap conversion on and off. PDFR3-07 — verdict DEFECTIVE on real PDFs with method/peer-facts/measurements recorded; remedy designed, no runtime change in the investigation itself. PDFR3-13 (formalized follow-up) — `selectImageStore` (`g_`→`commonObjs`) + `awaitResolvedImageObject` (callback-form readiness raced through the PDFR3-05 contract); durable 3-page shared-Ref browser test asserts 2/1/1 counts, exact transforms, and solid-red 8×8 pixels on all 4 paints; the formalization-added test was verified present by this reviewer (`embeddedSharedB64` import + test). PDFR3-08 — private `canvasGuards.ts` shared guards, strict option/tuple/deadline validation, encode-result MIME/empty guards with canvas release; 7 table-driven regressions. PDFR3-09 — peer-pinned install, Worker-vs-PDFWorker-vs-internal ownership prose, nested-finally worker-destroy example, decode-before-revoke preview example; 2 real-Chromium tests (preview decodes while live + `worker.destroyed === true`; malformed-load failure still destroys caller-owned worker); `dist/index.d.mts` carries the new JSDoc and packed README contains the corrected examples (verified by V4/V6). PDFR3-10 — bounded `REORDER_WINDOW_PAGES=2` scheduler, global simultaneous tracker, load-separated timing, 1-warmup+3-interleaved repeats, stage-synchronized abort, representative image workloads; dated 2026-09-12 baseline published, historical 2026-08-19 preserved as historical; serial-only decision kept with no speculative API. PDFR3-11 — verdict DEFER with measured rationale (single-chunk pages give nil retention saving; stream `cancel()` hangs past 15 s, violating PDFR3-05; XFA bypass + param-plumbing costs); scoped reconsideration trigger recorded, no speculative API.
- Private-helper check: `ImageKind`, `NormalizedImage`, `ImageObjectStore`, `NormalizedImage`/`selectImageStore`/`awaitResolvedImageObject` internals are module-private in `src/embeddedImages.ts`; `grep commonObjs|ImageKind dist/index.d.mts` → 0 matches, so no PDF.js private image shape leaks into declarations. `canvasGuards.ts` exports are shared only inside `src/` (not re-exported from `src/index.ts`; dist declaration export list contains only the documented public API). `resolveLimits` is exported from `src/PDFReader.ts` as a typed testable boundary but is not re-exported from `src/index.ts` and does not appear in `dist/index.d.mts` — no accidental public API. No generic framework introduced: one limits resolver, one header snapshot, one wait contract, one canvas-guard module, each with a single call-site family.
- Deferred work (nothing dismissed via docs; no unresolved P1): PDFR3-11 DEFER (streaming text) — rationale/trigger in its evidence; owner: future text-extraction work if the three trigger conditions are met; risk: wrapper retains full-page text before limit rejection, worker/transport allocation unbounded (unchanged from baseline, accurately disclaimed in README). Pre-existing plan-level deferrals (borrowed-proxy replacement, Firefox/WebKit matrix, default-deny remote sources) remain as recorded in PDFR2 scope. Residual risks: PDF.js-internal allocations and synchronous browser encodes remain outside package limits (documented non-goal); whole-conversion output budgets intentionally unimplemented (`pages()` is the incremental path); image masks stay explicitly unsupported.
- Integrated verification (repo root, serial): V2 `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` → clean. V4 `pnpm --filter @web-ts-toolkit/pdf-reader test` → 90 Node/decl/packed tests passed + 18 browser tests passed (17 pre-existing incl. PDFR3-03/06/09 additions + 1 PDFR3-13 shared-store test). V5 `pnpm --filter @web-ts-toolkit/pdf-reader benchmark` → build ok + 5 browser tests passed. V6 `npm pack --dry-run --json` from `packages/pdf-reader` → 4 intended artifacts (`README.md`, `dist/index.mjs`, `dist/index.d.mts`, `package.json`), no bundled deps. `git diff --check` → clean. V3 not re-run separately: the browser suite already ran green inside V4 with no new browser concern justifying repetition.
- V7 (partially blocked, unrelated + follow-up failures recorded, none silently skipped): `pnpm lint` → exit 1 with 7 errors: pdf-reader follow-ups — `src/PDFReader.ts:878` `no-unsafe-function-type` on `#isFetchHeaders(value: object | Function)` (pre-existing from PDFR3-02 worktree, already flagged in PDFR3-03/08 evidence; owner: PDFR3-02 source-boundary specialist); `benchmark/pdf-reader.benchmark.browser.ts:200` unused `createCountingCanvasFactory` (owner: PDFR3-10 benchmark owner); `test/PDFReader.test.ts:2286,2300` unused `mimeType`/`pdf` in the PDFR3-08 contract test (owner: PDFR3-08 specialist); `test/pdf-reader.browser.ts:394` useless assignment `decodedBeforeRevoke` in the PDFR3-09 preview test (owner: PDFR3-09 specialist) — plus unrelated `packages/moo/src/plugins/cascade-delete.ts:62,68` `no-explicit-any` (owner: moo agent; moo worktree changes preserved untouched). `pnpm build` (workspace) → success. `pnpm test` (workspace, serial) → blocked by unrelated failure: `create-access-router-mongo-starter` `pnpm build && vitest run`, 1 failed / 334 passed, `tests/packed-consumer.test.ts:213` packed-consumer assertion (owner: starter-package agent; needs its own triage, unrelated to pdf-reader); serial runner stops at first failure so later packages were not re-verified by V7, but pdf-reader scope is fully covered by the green V4/V5 above.
- Reviewer corrections in this file and docs (no runtime): PDFR3-12 `pending`→`completed`, Execution status → `done`; removed the stray headerless duplicate of the PDFR3-11 template block (corrected PDFR3-13's provenance sentence, which had prematurely claimed its removal); fixed the stale closing validation paragraph that still read "All implementation tasks remain pending"; `test/fixtures/README.md` gained the invited `embedded-shared.pdf` row and the three-fixture regen sentence (generator already writes all three; fixture binaries/sidecars untouched).
- Follow-ups: lint cleanups owned above (5 pdf-reader items + 1 moo item); workspace `pnpm test` starter-package packed-consumer triage owned by its agent; PDFR3-11 reconsideration only on its recorded triggers. No `CHANGELOG.md`/dist edits; unrelated worktree changes preserved.

## Agent Scheduling And Shared Hotspots

| Track           | Suggested execution                                  | Coordination                                                                                                                                                               |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core boundaries | PDFR3-01 → PDFR3-04 → PDFR3-02 → PDFR3-03 → PDFR3-05 | One active editor for `PDFReader.ts`, its source helper, and `test/PDFReader.test.ts`; this is the shared-file order even where behavioral dependencies allow independence |
| Extraction      | PDFR3-06 → PDFR3-07 → PDFR3-13                       | Starts after required core tasks; one owner for extractor and browser fixtures (PDFR3-13 formalizes the PDFR3-07-recommended adapter)                                      |
| Validation      | PDFR3-08                                             | Follows extraction to avoid shared canvas/extractor changes                                                                                                                |
| Measurements    | PDFR3-10 and PDFR3-11                                | May prepare separate experiments after dependencies, but coordinate benchmark-file ownership; publish evidence through one task-file coordinator                           |
| Consumer docs   | PDFR3-09                                             | Finalize after behavioral/compatibility outcomes; coordinate performance prose with PDFR3-10                                                                               |
| Integration     | PDFR3-12                                             | Independent reviewer after all dependencies and any investigation-generated required fixes                                                                                 |

Private helpers/new focused tests can be prepared in parallel only with non-overlapping ownership. `src/types.ts`, `src/index.ts`, package/website README prose, package metadata, browser fixtures/tests, and this task file each need a single editor at a time. No parallel builds/tests, even when source edits are independent.

## Decisions, Deferrals, And Definition Of Done

No maintainer decision blocks starting the confirmed defect tasks. Header normalization must explicitly choose normalize/reject semantics for non-plain containers before changing that contract. PDFR3-05 must document how uncancellable upstream work affects reader reuse. PDFR3-07/11 require evidence before implementation scope is chosen.

Additional features deliberately not promoted to implementation tasks:

- Whole-conversion output budgets: `convert()` intentionally collects all results and `pages()` already provides incremental consumption. Per-page limits are not a total-process cap. Revisit with a concrete consumer budget; residual risk is high retained memory when callers collect many large results.
- Image viewport-coordinate helpers, rotation/crop/UserUnit conveniences, annotations/outlines/search, password/progress callbacks, and OCR: no consumer requirement was established in this review. Raw proxy interoperability and the existing transform remain available; coordinate/result semantics should be documented by PDFR3-09.
- Full PDF.js allocation bounds and dependency vulnerability status were not established. The package's finite output/work limits do not bound every PDF.js internal allocation or synchronous browser encode. Broader claims require separate evidence.

Definition of done:

- Each task has acceptance and verification evidence, or an explicit justified deferral/cancellation; required unfinished verification remains blocked.
- Policy and PDF.js agree on stable effective request fields, and all supported known-size sources obey configured limits.
- Finite defaults survive optional configuration; synchronous load failures are retryable; page-stage waits and late resources have explicit ownership.
- Image bytes, MIME results, browser examples, declaration JSDoc, and resource/performance claims match observed behavior.
- New findings are deduplicated and assigned before handoff. No hidden source changes or generic unfinished “improve security/performance” tasks remain.

Document validation: `git diff --check` and `git diff --no-index --check /dev/null docs/tasks/20260912-095805-pdf-reader-residual-gaps-review.md` passed at creation. Manual review confirmed 13 unique task IDs, existing/acyclic dependency references, required task fields, sequenced shared ownership, and repository-relative paths with only generic temporary-directory exceptions. At PDFR3-12 close: all 13 tasks are completed (PDFR3-11 concluded as DEFER with rationale/trigger/risk; all other investigations concluded with implemented fixes plus regression evidence), the headerless PDFR3-11 duplicate block was removed by the reviewer, PDFR3-13 linkage/dependency entries are accurate, and the Execution status header reads done.
