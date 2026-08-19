# PDF Reader Hardening And Architecture Follow-Up

Created: 2026-08-18 23:32:17 PDT

Package: `packages/pdf-reader`

## Objective

Finish the browser-runtime, lifecycle, input-boundary, output-encoding, embedded-image, performance, and release-readiness work that remains after creating `@web-ts-toolkit/pdf-reader`. Preserve the current small named-export API where it is sound, but do not retain unsafe or misleading behavior solely for compatibility with the original application-local `PDFReader`.

This document is the execution record for follow-up work. It must remain usable by agents that do not have access to the conversation in which the package was created.

## Scope And Working Rules

- Add a focused regression that fails against the current implementation before each confirmed behavioral fix.
- Label fixture-based discoveries as confirmed only after reproducing them with the supported `pdfjs-dist` peer range.
- Keep PDF.js worker asset emission in consumer/application code. Do not add Vite-specific `?url` imports to the package runtime.
- Preserve explicit cleanup. Every loading task, page proxy, render task, canvas, object URL, worker, and document introduced by a task must have an observable release path.
- Treat PDF sources, dimensions, page counts, operator lists, extracted text, and image payloads as untrusted inputs.
- Keep resource-limit and abort failures fail-closed. Best-effort handling may skip an unsupported embedded image, but it must not swallow cancellation or configured limit failures.
- Update runtime behavior, public types, emitted declarations, the shipped package README, website docs, and packed-consumer assertions together when a public contract changes.
- Do not edit generated `dist/` files manually. Build them from tracked TypeScript source.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package and workspace test/build commands serially. Package tests rebuild `dist/`, and `AGENTS.md` documents races when builds overlap.
- Do not mark a task `completed` until its required verification passes and completion evidence is appended to this file.

## Non-Goals

- Do not implement a PDF parser, sanitizer, malware scanner, or security sandbox. PDF parsing remains PDF.js's responsibility.
- Do not promise lossless extraction of vector graphics, masks, patterns, arbitrary form XObjects, or every private PDF.js image representation.
- Do not move worker bundling into this library; each consumer bundler owns worker URL or `Worker` creation.
- Do not add server-side Node rendering without a separate supported canvas/DOM runtime proposal and integration suite.
- Do not add unbounded parallel page rendering.
- Do not add compatibility aliases for the original `isPNG`, `getDataURL`, `getText`, `getImages`, `config`, or `dataURL` names without evidence of a shipped external consumer contract.
- Do not add a default export or unsupported deep imports.
- Do not optimize operator traversal or page scheduling without browser measurements from representative fixtures.

## Baseline Verification

Observed on 2026-08-18 after the initial package implementation:

- `pnpm --filter @web-ts-toolkit/pdf-reader test`: passed, 1 file and 6 tests.
- `pnpm --filter @web-ts-toolkit/pdf-reader typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed for the complete workspace.
- `npm pack --dry-run` from `packages/pdf-reader`: passed and listed 6 intended files: `package.json`, `README.md`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, and `dist/index.d.mts`.
- `git diff --check`: passed.
- The full `pnpm test` run exceeded a 300-second execution limit while rebuilding and typechecking `access-router-client`; suites completed before the timeout passed. This was not a PDF reader assertion failure, but a later final integration run still needs an adequate timeout.
- Existing tests mock `pdfjs-dist`, canvas, document proxies, page proxies, rendering, worker globals, and embedded image objects. They do not parse or render a real PDF in a browser.
- The package exposes CJS and ESM entrypoints, but no fresh packed consumer verifies conditional exports, declaration selection, browser bundling, worker delivery, or runtime loading.
- `pages()` processes pages serially and releases each page in a `finally` block. `convert()` intentionally retains all results.
- Page image and embedded-image output currently use synchronous `HTMLCanvasElement.toDataURL()`.

## Confirmed Findings

1. Concurrent calls to `load()` share `#loadingTask`, but each caller installs an abort listener that invokes `task.destroy()`. Aborting one caller therefore destroys the loading task needed by every other caller, even when their signals remain active.
2. Mock-only tests cannot validate actual PDF.js worker configuration, canvas rendering, text output, malformed-document behavior, image operator shapes, or cleanup in a real browser.
3. The published package has no strict declaration-consumer or packed-install test, so metadata and emitted declarations are inspected but not exercised from a fresh consumer.
4. `toDataURL()` synchronously encodes and duplicates output into base64 strings. This can block the main thread and materially increase retained memory for large pages.
5. URL allowlisting, source byte limits, and operation deadlines are documented as application responsibilities but are not represented by enforceable package hooks beyond caller-provided `AbortSignal` and post-load page/pixel limits.
6. Embedded-image extraction uses PDF.js operator and object-store internals from the main reader implementation. The README correctly calls this best effort, but compatibility is not tested against real PDFs or multiple supported PDF.js versions.

## Priorities

- P0: cross-caller cancellation, cleanup, or resource behavior can corrupt unrelated work or leak browser resources.
- P1: untrusted-input limits, real-browser correctness, or published-package contracts are not enforceable or independently verified.
- P2: architecture, output efficiency, compatibility characterization, or maintainability gaps with bounded impact.
- P3: optional throughput or API expansion requiring benchmark or maintainer evidence.

## Wave 1: Runtime And Publication Baselines

### Task PDFR-01: Add Real-Browser PDF.js Integration Fixtures

Status: pending

Priority: P1

Suggested agent: browser integration and PDF.js test specialist

Dependencies: none

Primary ownership:

- `packages/pdf-reader/test/fixtures/**`
- package-local browser test configuration
- focused browser integration tests under `packages/pdf-reader/test/**`
- `packages/pdf-reader/package.json` test scripts and dev dependencies

Finding:

All current behavior is tested through mocks. This misses the main compatibility boundary: PDF.js worker loading and real browser canvas APIs. It also leaves the package's claims about text extraction, page rendering, page selection, malformed input, and cleanup unverified against an actual PDF.

References:

- `packages/pdf-reader/test/PDFReader.test.ts:4-78`
- `packages/pdf-reader/test/PDFReader.test.ts:81-209`
- `packages/pdf-reader/README.md:15-64`
- `packages/access-router-client/vitest.browser.config.ts:1-22` for the repository's existing browser-smoke pattern; note that its `jsdom` setup is insufficient for real canvas/PDF worker validation

Implementation requirements:

1. Add small, deterministic, license-compatible fixtures covering text, at least two pages, rotation or a nontrivial viewport, and one common embedded raster image.
2. Record fixture provenance and regeneration instructions. Do not commit large or opaque PDFs without documentation.
3. Run the integration in a real supported browser, not only Node or jsdom. Select a Vitest browser provider or equivalent already acceptable to the repository and document its system requirements.
4. Exercise the built package entrypoint and a real PDF.js worker configured through the documented application boundary.
5. Verify page count, selected page numbers, non-empty text, render dimensions, MIME type, cancellation, and destroy behavior without brittle byte-for-byte canvas snapshots.
6. Add malformed/truncated PDF coverage and one password-protected fixture if PDF.js can generate or ship a stable test fixture under a compatible license.
7. Keep browser tests serial or isolated so global PDF.js worker configuration cannot leak between cases.

Acceptance criteria:

- A real browser loads the built package, starts a real PDF.js worker, and renders a deterministic fixture.
- Text and selected-page behavior are asserted from real PDF.js output.
- Malformed input fails without leaving a live loading task, document, or worker owned by the test.
- The browser test fails if worker configuration is removed or if the package accidentally imports a Vite-only worker URL.
- `pnpm --filter @web-ts-toolkit/pdf-reader test` includes or explicitly invokes the browser integration and passes serially.

### Task PDFR-02: Add Strict Packed-Consumer And Export Verification

Status: pending

Priority: P1

Suggested agent: TypeScript package and release-surface specialist

Dependencies: none

Primary ownership:

- `packages/pdf-reader/test-decl-consumer/**`
- `packages/pdf-reader/test/packed-consumer.test.ts`
- `packages/pdf-reader/package.json`
- `packages/pdf-reader/tsup.config.ts` if an export defect is demonstrated

Finding:

The package emits matching runtime and declaration files and packs the intended file list, but no fresh consumer proves package-name resolution, ESM/CJS conditional exports, strict browser TypeScript declarations, transformed release metadata, peer dependency behavior, or rejection of unsupported deep/default imports.

References:

- `packages/pdf-reader/package.json:17-49`
- `packages/pdf-reader/tsup.config.ts:1-13`
- `packages/json-frame/test/packed-consumer.test.ts` for the repository's strongest packed-consumer pattern
- `packages/access-router-client/test-decl-consumer/**` for NodeNext and bundler declaration checks

Implementation requirements:

1. Add strict `moduleResolution: Bundler` browser and `NodeNext` declaration consumers against the package root.
2. Verify named imports, public types, `AsyncGenerator<PageResult>`, `AbortSignal`, canvas requirements, and `pdfjs-dist` peer types.
3. Add negative `@ts-expect-error` checks for the absent default export, unsupported deep imports, invalid image formats, and old application-local option names.
4. Pack a release-like tarball, install it into a temporary consumer with `pdfjs-dist`, and resolve the package through its export map rather than source aliases.
5. Exercise the ESM entry in a browser bundler build. Exercise CJS only in an environment that satisfies the documented browser DOM assumptions; do not misrepresent Node runtime support.
6. Decide from evidence whether advertising CJS for this browser-only PDF.js v5 peer is useful and reliable. If not, propose an explicit ESM-only contract and treat removal of CJS as a release-note-worthy change.
7. Assert that only intended files are packed and that release placeholders are transformed by the real publication path.

Acceptance criteria:

- Fresh strict consumers resolve the intended declarations without workspace aliases or source access.
- Unsupported default/deep imports and legacy option names fail typechecking as intended.
- A packed browser consumer bundles the ESM entry with `pdfjs-dist` supplied as a peer.
- The CJS contract is either demonstrated in its stated supported environment or intentionally removed from metadata, build output, docs, and tests together.
- `npm pack --dry-run --json` lists only the selected public artifacts.

## Wave 2: Lifecycle And Input Hardening

### Task PDFR-03: Isolate Shared Load Cancellation And Destruction

Status: pending

Priority: P0

Suggested agent: asynchronous lifecycle and cancellation specialist

Dependencies: none

Primary ownership:

- `packages/pdf-reader/src/PDFReader.ts`
- `packages/pdf-reader/src/errors.ts`
- lifecycle-focused tests in `packages/pdf-reader/test/**`
- lifecycle contract in `packages/pdf-reader/README.md`

Finding:

`load()` memoizes one `PDFDocumentLoadingTask`, while every concurrent caller binds its own abort signal directly to `task.destroy()`. One caller can cancel every caller's shared work. The current suite covers cancellation during page rendering, but not concurrent load callers, destroy during load, early generator return, or concurrent conversion/destroy behavior.

References:

- `packages/pdf-reader/src/PDFReader.ts:54-82`
- `packages/pdf-reader/src/PDFReader.ts:84-124`
- `packages/pdf-reader/src/PDFReader.ts:281-304`
- `packages/pdf-reader/test/PDFReader.test.ts:176-196`

Implementation requirements:

1. Define explicit ownership for a shared in-flight load. Prefer caller-local cancellation that rejects only that caller while allowing remaining waiters to complete; destroy the PDF.js loading task only when the reader is destroyed or no supported waiter remains and cancellation ownership is unambiguous.
2. Do not allow an aborted caller's eventual shared promise completion to produce an unhandled rejection.
3. Define behavior when `destroy()` races with `load()`, page retrieval, rendering, a suspended generator consumer, or `convert()`.
4. Ensure `destroy()` remains idempotent and does not destroy the same PDF.js object through both loading-task and document paths.
5. Ensure breaking early from `for await (const page of reader.pages())` cleans up the yielded page before generator completion.
6. Use stable package error codes for destroyed/aborted states if callers need to distinguish them. Do not mix arbitrary `Error` and `PdfReaderError` for equivalent lifecycle failures.
7. Add deferred-promise tests that deterministically cover each race without timing sleeps.

Acceptance criteria:

- Aborting one of two concurrent `load()` callers does not reject or destroy the non-aborted caller's load.
- Destroying the reader during load settles all callers deterministically and destroys the underlying PDF.js task exactly once.
- Early iterator return and errors thrown by the consumer release the current page exactly once.
- Rendering and destroy races do not leave an active render task, canvas dimensions, page proxy, document, or loading task owned by the reader.
- Lifecycle tests fail against the current shared-abort implementation and pass after the fix.
- `pnpm --filter @web-ts-toolkit/pdf-reader test` passes.

### Task PDFR-04: Add Enforceable Source And Deadline Policy Hooks

Status: pending

Priority: P1

Suggested agent: browser input-boundary and resource-hardening specialist

Dependencies: PDFR-03

Primary ownership:

- `packages/pdf-reader/src/types.ts`
- `packages/pdf-reader/src/PDFReader.ts`
- option normalization or a focused source-policy module
- security tests and package/website documentation

Finding:

The package bounds page count and canvas pixels only after PDF.js starts loading or rendering. For in-memory input, byte length can often be checked before parsing. For URL and `DocumentInitParameters` input, applications need a reusable policy hook to reject disallowed protocols/origins, credential use, headers, or other loading parameters before `getDocument()` performs work. `AbortSignal` supports caller cancellation, but the package has no optional deadline helper or documented composition pattern that guarantees timer cleanup.

References:

- `packages/pdf-reader/src/types.ts:3-43`
- `packages/pdf-reader/src/PDFReader.ts:42-82`
- `packages/pdf-reader/README.md:89-117`
- PDF.js `DocumentInitParameters` through the public `PdfSource` alias

Implementation requirements:

1. Add a pre-load policy boundary that can inspect the normalized source before `getDocument()` is called.
2. Support a configurable maximum byte length for source forms whose size is synchronously knowable, including typed arrays, array buffers, number arrays, and `DocumentInitParameters.data` where applicable.
3. Do not claim a URL download-byte limit unless it is actually enforced through a controlled fetch/range transport. Keep remote response limits an application responsibility until implementation evidence exists.
4. Provide an optional URL/source validator or a documented composable policy interface. It must be able to reject protocols, origins, credentials, headers, and remote sources before network work.
5. Preserve legitimate PDF.js loading parameters such as passwords, CMaps, fonts, WASM paths, and caller-created `PDFWorker` when policy allows them.
6. Add an optional deadline by composing cancellation with the lifecycle semantics from PDFR-03. Clear timers and listeners on every settle path.
7. Reject invalid limits and deadlines synchronously with stable `PdfReaderError` codes.
8. Avoid logging source URLs, headers, passwords, or PDF content in package-generated errors.

Acceptance criteria:

- Oversized known in-memory data is rejected before `getDocument()` is invoked.
- A denied URL, protocol, credential mode, or header-bearing source is rejected before PDF.js can initiate network work.
- Allowed loading parameters pass through unchanged.
- Deadline, caller abort, successful load, failed load, and destroy paths remove their timers/listeners and settle deterministically.
- Documentation clearly distinguishes package-enforced limits from application and PDF.js responsibilities.
- Security-focused tests and the package suite pass.

## Wave 3: Output And Extraction Architecture

### Task PDFR-05: Introduce Asynchronous Binary Page Output

Status: pending

Priority: P2

Suggested agent: browser canvas and binary-output API specialist

Dependencies: PDFR-01, PDFR-03

Primary ownership:

- `packages/pdf-reader/src/types.ts`
- page rendering/output code currently in `packages/pdf-reader/src/PDFReader.ts`
- a focused encoder abstraction if justified
- browser tests, declaration-consumer tests, README, and website docs

Finding:

Page and embedded-image outputs are created with synchronous `canvas.toDataURL()`. Base64 increases payload size, duplicates data in memory, and can block the main thread. The package has no way to request `Blob`, object URL, or caller-defined encoding while retaining the current data URL convenience path.

References:

- `packages/pdf-reader/src/PDFReader.ts:146-157`
- `packages/pdf-reader/src/PDFReader.ts:217-247`
- `packages/pdf-reader/src/types.ts:45-66`
- `packages/pdf-reader/README.md:62-87`

Implementation requirements:

1. Measure current `toDataURL()` elapsed time and retained output size in the real-browser harness before selecting an API.
2. Add an asynchronous binary output mode using `canvas.toBlob()` or a narrowly scoped injected encoder. Preserve data URL output only as an explicit supported mode if it remains useful.
3. Make output types discriminated so `mimeType`, `dataUrl`, `blob`, or another selected value cannot contradict one another.
4. Define object URL ownership if object URLs are offered. Prefer returning `Blob` and letting callers own URL creation unless the package can provide deterministic revocation.
5. Keep JPEG quality meaningful only for JPEG output. Document PNG quality behavior rather than forwarding a misleading value.
6. Preserve canvas release after encoding success, encoding failure, cancellation, and a null `toBlob()` callback.
7. Keep the public API minimal. Do not add multiple overlapping booleans for output selection.
8. Treat this as a public contract change and update declarations, README examples, website docs, and migration notes together.

Acceptance criteria:

- Consumers can obtain page bytes without mandatory base64 conversion.
- Output mode is statically discoverable and runtime results match its discriminant.
- Canvas memory is released after every asynchronous encoder settle path.
- Cancellation during encoding settles with the documented error and does not publish a late result.
- Browser measurements demonstrate the memory/latency tradeoff and are recorded in completion evidence.
- Browser, package, declaration-consumer, and packed-consumer tests pass.

### Task PDFR-06: Encapsulate And Characterize Embedded-Image Extraction

Status: pending

Priority: P2

Suggested agent: PDF graphics operator and compatibility specialist

Dependencies: PDFR-01, PDFR-05

Primary ownership:

- embedded-image code currently in `packages/pdf-reader/src/PDFReader.ts:170-265`
- a private extractor module or deliberate public subpath if approved
- embedded-image fixtures and compatibility tests
- `packages/pdf-reader/README.md`

Finding:

Embedded-image extraction is mixed into the reader and depends on PDF.js operator/object internals. It handles common image paint operators and basic graphics-state transforms, but does not prove behavior for masks, nested form XObjects, repeated object references, rotations, negative transforms, unsupported data layouts, or version changes across the declared `pdfjs-dist` peer range.

References:

- `packages/pdf-reader/src/PDFReader.ts:170-265`
- `packages/pdf-reader/src/geometry.ts`
- `packages/pdf-reader/test/PDFReader.test.ts:126-160`
- `packages/pdf-reader/README.md:119-125`
- `packages/pdf-reader/package.json:44-49`

Implementation requirements:

1. Move operator traversal, image normalization, and coordinate extraction behind one focused internal boundary with typed input/output adapters.
2. Use real fixtures to characterize inline images, image XObjects, save/restore, transformed images, repeated references, grayscale, RGB, RGBA, and `ImageBitmap` paths.
3. Investigate masks and nested form XObjects. Implement them only if PDF.js exposes a stable, testable route; otherwise return explicit diagnostics or documented unsupported outcomes.
4. Never close a PDF.js-owned `ImageBitmap` unless ownership is explicitly transferred and verified. Page/document cleanup remains the owner of PDF.js caches.
5. Decide whether extraction belongs at the package root or an opt-in `./embedded-images` subpath. Add a subpath only if it creates a real dependency/compatibility boundary and update `tsup` and `exports` atomically.
6. Version-test the oldest and newest supported PDF.js minors, or narrow the peer range to versions proven by the fixture suite.
7. Ensure one malformed image cannot bypass configured limits or abort the entire page unless it raises cancellation/resource-limit failure.
8. Avoid exposing PDF.js private image-object shapes in emitted declarations.

Acceptance criteria:

- Operator-dependent code is isolated from reader lifecycle orchestration.
- Real fixtures establish coordinates and bytes for all claimed image formats and transform cases.
- Unsupported masks/forms/layouts have deterministic, documented behavior rather than accidental exceptions.
- PDF.js-owned bitmap resources remain valid for subsequent page rendering and are released by the owning PDF.js lifecycle.
- The peer range matches versions exercised by compatibility tests.
- Package and real-browser tests pass.

## Wave 4: Measured Throughput And API Health

### Task PDFR-07: Benchmark And Gate Bounded Page Concurrency

Status: pending

Priority: P3

Suggested agent: browser performance and scheduling specialist

Dependencies: PDFR-01, PDFR-03, PDFR-05

Primary ownership:

- a reproducible benchmark under `packages/pdf-reader/benchmark/**` or documented test tooling
- page scheduling code only if measurements justify a change
- performance documentation

Finding:

Pages are processed serially, which minimizes active canvas and page-proxy memory. Text extraction, operator-list extraction, rendering, and encoding are also sequential within a page. Parallel work could improve throughput but could multiply memory use and main-thread contention. No benchmark currently establishes a useful concurrency level or demonstrates that a public concurrency option is warranted.

References:

- `packages/pdf-reader/src/PDFReader.ts:84-112`
- `packages/pdf-reader/src/PDFReader.ts:126-160`
- `packages/pdf-reader/README.md:62-64`

Implementation requirements:

1. Benchmark representative short, long, image-heavy, and text-heavy PDFs in a real browser using serial streaming and any proposed bounded strategy.
2. Record wall time, peak active pages, peak active canvases, approximate retained output bytes, long tasks, and abort latency.
3. Preserve deterministic output order even if internal work overlaps.
4. Never exceed a configured concurrency bound, page/pixel limits, or one active result awaiting a slow streaming consumer unless buffering is explicitly bounded.
5. Cancel queued and active work on abort or destroy and clean every acquired page/canvas.
6. Do not implement concurrency if gains are immaterial or memory/long-task regressions dominate. A completed benchmark with a documented decision is an acceptable outcome.
7. If concurrency is added, default to the current serial behavior unless evidence supports a safe browser-wide default.

Acceptance criteria:

- Benchmark inputs, browser version, hardware context, commands, and results are reproducible and recorded.
- Any concurrency API is justified by measured improvement and has deterministic order, hard bounds, cancellation, and cleanup tests.
- Serial mode remains available and does not regress materially.
- If no runtime change is made, completion evidence explains why and no speculative API is added.

### Task PDFR-08: Align Public Errors, State, And Migration Documentation

Status: pending

Priority: P2

Suggested agent: TypeScript public API and documentation specialist

Dependencies: PDFR-02, PDFR-03, PDFR-04, PDFR-05, PDFR-06

Primary ownership:

- `packages/pdf-reader/src/errors.ts`
- `packages/pdf-reader/src/types.ts`
- `packages/pdf-reader/src/index.ts`
- `packages/pdf-reader/README.md`
- `website/docs/packages/pdf-reader.md`
- root package listing and release notes as needed

Finding:

The initial API documents structured validation/resource errors while allowing PDF.js errors to pass through. Lifecycle and output follow-ups may add states and result variants. The original application-local API used a default export and different option/result names, so consumers need one authoritative migration table and an unambiguous distinction between package errors, PDF.js errors, best-effort diagnostics, and unsupported environments.

References:

- `packages/pdf-reader/src/errors.ts`
- `packages/pdf-reader/src/types.ts`
- `packages/pdf-reader/src/index.ts`
- `packages/pdf-reader/README.md:1-138`
- `website/docs/packages/pdf-reader.md`

Implementation requirements:

1. Audit every thrown package-owned error and ensure equivalent invalid states use stable `PdfReaderError` codes rather than arbitrary messages.
2. Preserve native/PDF.js error identity where callers need password, malformed-document, response, or rendering error classes.
3. Document reader states and legal transitions: new, loading, loaded, iterating/rendering, destroyed, and failed/retryable where applicable.
4. Document the exact ownership and lifetime of source bytes, pages, result blobs/data URLs, canvases, workers, and documents.
5. Add a migration table for old option/result names and the named-export/worker-setup change. Do not add compatibility aliases merely to avoid documentation.
6. Keep installed-package README examples canonical and copy-pasteable. Website docs may summarize but must not contradict the shipped README.
7. Add release notes for behavior or export changes made by this follow-up.
8. Inspect emitted `.d.ts` and `.d.mts` to ensure JSDoc and discriminated output types remain understandable without source files.

Acceptance criteria:

- Public declarations, package README, website docs, and runtime behavior describe the same states, errors, outputs, and ownership rules.
- Migration from the original application-local reader is explicit without hidden compatibility behavior.
- Every package-owned failure has an intentional stable code or a documented reason to remain a native/PDF.js error.
- Installed consumers do not need to inspect package source or PDF.js internal type paths to use the supported API.
- Package, declaration-consumer, packed-consumer, and docs build checks pass.

## Dependency And Parallelization Guidance

Recommended execution order:

| Wave | Tasks                 | Parallelization                                                                                                    |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1    | PDFR-01, PDFR-02      | May run in parallel if agents do not run builds/tests concurrently and coordinate `package.json` edits.            |
| 2    | PDFR-03, then PDFR-04 | Sequence because source policy deadlines depend on settled lifecycle ownership.                                    |
| 3    | PDFR-05, then PDFR-06 | Sequence shared edits to `PDFReader.ts` and result types; PDFR-06 may prepare fixtures while PDFR-05 is active.    |
| 4    | PDFR-07, PDFR-08      | Benchmarking may run while docs/types are prepared, but final API documentation waits for all preceding contracts. |
| 5    | PDFR-09               | Independent final review only after all implemented or deferred tasks have evidence.                               |

Shared hotspots that require one owner at a time:

- `packages/pdf-reader/src/PDFReader.ts`
- `packages/pdf-reader/src/types.ts`
- `packages/pdf-reader/package.json`
- `packages/pdf-reader/README.md`
- package browser test configuration and PDF.js worker globals

Agents may prepare independent fixtures, benchmarks, or declaration-consumer files concurrently, but package test scripts and workspace build/test commands must remain serialized.

## Deferred Decisions Requiring Maintainer Input

These decisions do not block PDFR-01 through PDFR-04 investigation and regression coverage, but they block final public API choices:

1. Output contract: keep data URLs as the default, switch the default to `Blob`, or require an explicit output mode from the next release.
2. Embedded-image boundary: retain the root option or move the unstable feature to an opt-in subpath.
3. Module formats: continue publishing CJS for browser bundlers or move to an explicit ESM-only package based on PDFR-02 evidence.
4. Peer range: support all PDF.js 5.x releases or narrow to fixture-tested minor versions.
5. URL policy default: permit remote sources unless a validator is supplied, or fail closed for remote sources unless explicitly allowed in a future breaking release.
6. Performance budget: define acceptable page-render long-task duration and peak memory targets for supported browsers/devices before accepting concurrency defaults.

Record each decision and rationale in this section before implementing the dependent public contract. Do not guess silently.

## Wave 5: Independent Final Integration Review

### Task PDFR-09: Audit Runtime, Security, Packaging, And Release Readiness

Status: pending

Priority: P1

Suggested agent: independent reviewer who did not implement PDFR-03 through PDFR-08

Dependencies: PDFR-01, PDFR-02, PDFR-03, PDFR-04, PDFR-05, PDFR-06, PDFR-07, PDFR-08

Primary ownership:

- review of the complete `packages/pdf-reader/**` package
- published artifacts and fresh consumer environments
- this task file's statuses and completion evidence
- release notes and residual-risk report

Finding:

The package crosses untrusted PDF parsing, global worker configuration, browser canvas allocation, async cancellation, PDF.js private operator compatibility, and published TypeScript boundaries. A final reviewer must verify the combined behavior rather than accepting individually passing mocked tasks.

References:

- all prior tasks in this document
- `AGENTS.md`
- `packages/pdf-reader/package.json`
- `packages/pdf-reader/README.md`

Implementation requirements:

1. Verify every acceptance criterion against runtime tests, emitted declarations, packed artifacts, and documentation.
2. Re-run adversarial lifecycle scenarios across load, render, encoding, extraction, generator return, abort, deadline, and destroy paths.
3. Confirm request-controlled dimensions, bytes where knowable, page counts, operator/image allocations, queues, and concurrency are bounded.
4. Confirm denied source policy fails before PDF.js network/loading work and errors do not expose credentials or content.
5. Test oldest and newest supported PDF.js peer versions in the real-browser fixture suite.
6. Inspect ESM/CJS or ESM-only metadata against actual built files and fresh consumer resolution.
7. Confirm no package runtime contains a bundler-specific worker URL import or hidden global worker mutation at module evaluation.
8. Verify generated outputs are build products rather than manually edited files.
9. Record every deferred item with rationale, owner, trigger for reconsideration, and residual risk.
10. Update this file with final completion evidence rather than rewriting historical findings.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` passes.
- `pnpm --filter @web-ts-toolkit/pdf-reader test` passes, including real-browser and packed-consumer coverage.
- `pnpm lint` passes.
- `pnpm build` passes.
- `pnpm test` completes serially with an adequate timeout, or an unrelated blocker is documented with command output and ownership.
- `npm pack --dry-run --json` lists only intended files and a fresh installed browser consumer passes.
- Source, README, website docs, declarations, export metadata, and runtime behavior agree.
- The reviewer records no unresolved P0/P1 issue; any P2/P3 deferral includes explicit residual risk.

## Definition Of Done

- Every task is `completed`, `deferred`, or `cancelled` with rationale and evidence; none remains ambiguously `pending`, `in_progress`, or `blocked` at release.
- Real browser fixtures cover the package's core loading, worker, rendering, text, cancellation, malformed-input, and cleanup claims.
- Concurrent lifecycle behavior is deterministic and one caller cannot cancel unrelated callers accidentally.
- Known-size source limits and configured source policy execute before PDF.js work; remote limitations are stated honestly.
- Consumers can choose an efficient non-base64 page output, or measurements document why the API deliberately remains unchanged.
- Embedded-image claims match real fixtures and the tested PDF.js peer range.
- Public types and package metadata work from a packed install without source aliases.
- Performance changes are measurement-driven and bounded.
- Shipped README and website docs are aligned and include migration, security, ownership, and cleanup contracts.
- Final package, repository, browser, declaration, packed-consumer, and artifact checks pass or have documented unrelated blockers.
