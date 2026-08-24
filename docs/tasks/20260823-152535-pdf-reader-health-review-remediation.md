# PDF Reader Health Review Remediation

Created: 2026-08-23 15:25:35 PDT

Package: `packages/pdf-reader`

Related completed plan: `docs/tasks/20260818-233158-pdf-reader-hardening-follow-up.md`

## Objective

Close the residual security, lifecycle, resource-bounding, compatibility, and architectural gaps found after the original PDF reader hardening plan was completed. Preserve the package's browser-only, ESM-only, named-export contract where it is sound, while making the pre-load policy boundary fail closed and ensuring every package-owned asynchronous or PDF.js resource has a deterministic teardown path.

This is a new follow-up phase because the prior plan is complete and its historical evidence must remain intact. Agents executing this plan must update this file as a living execution record.

## Scope And Working Rules

- Add a focused regression that fails against the current implementation before each confirmed behavioral fix.
- Treat PDF sources, source object properties, policy return values, text content, operator lists, image objects, dimensions, and collection sizes as untrusted runtime input.
- Preserve native PDF.js loading, password, malformed-document, and rendering errors unless the package is normalizing a documented lifecycle race.
- Keep policy failures free of source URLs, headers, passwords, and document content.
- Prefer one reader-owned cancellation boundary over unrelated flags and callbacks distributed across methods.
- Keep operator/image compatibility code private. Do not expose PDF.js private object shapes in declarations.
- Do not edit `dist/` manually. Rebuild it from tracked TypeScript source.
- Update runtime behavior, public types, emitted declarations, package README, website docs, packed-consumer assertions, and release notes together when a public contract changes.
- Preserve unrelated worktree changes. Do not revert or modify concurrent changes outside this package and this task file.
- Run package and workspace build/test commands serially. Package tests rebuild shared `dist/` output, and `AGENTS.md` documents races when builds overlap.
- Do not mark a task `completed` until its required verification passes and completion evidence is appended here.

## Non-Goals

- Do not implement a PDF parser, sanitizer, malware scanner, network proxy, or browser sandbox.
- Do not claim that post-return text/operator checks prevent PDF.js from allocating its initial result.
- Do not add unbounded page concurrency or retain multiple live page canvases by default.
- Do not broaden embedded-image format claims beyond behavior proven with real PDF.js fixtures.
- Do not add a default export, CommonJS build, or unsupported deep imports.
- Do not replace PDF.js public interoperability types merely to hide the peer dependency.
- Do not rewrite the completion evidence or historical version claims in the prior task file. Add a correction note there only if implementation needs to explain later contract drift.
- Do not optimize embedded-image encoding without representative browser measurements and hard aggregate limits first.

## Baseline Verification

Observed on 2026-08-23 before this follow-up was created:

- `pnpm --filter @web-ts-toolkit/pdf-reader typecheck`: passed.
- `pnpm --filter @web-ts-toolkit/pdf-reader test`: passed with 3 Node/Vitest files and 30 assertions plus 1 Headless Chromium file and 13 assertions.
- The package test rebuilt `dist/index.mjs` and `dist/index.d.mts` successfully.
- Both Node and browser Vitest runs emitted the existing Vite warning that ESM syntax in `.ts` config files is incompatible with the future native config loader default.
- `npm pack --dry-run`, full workspace lint/build/test, and a multi-browser matrix were not rerun for this review.
- The worktree contained unrelated changes in other packages and existing untracked task files. No PDF reader source change was present before baseline verification.
- The current manifest declares and tests `pdfjs-dist@^6.2.108`; the installed lockfile version is `6.2.108`.
- The package README and website docs still describe embedded-image compatibility as `~5.7.284`, while the prior task record says that range was intentionally narrowed. The published manifest therefore no longer matches those claims.

## Confirmed Findings

1. `sourcePolicy` recognizes only same-realm native promises because `#isPromiseLike` uses `instanceof Promise`. A cross-realm promise or valid thenable can let `getDocument()` start before policy approval and can later reject without an owned observer.
2. Policy inspects one view of a mutable `DocumentInitParameters` object and later passes the original object to PDF.js. Getters or mutation can change URL, credentials, headers, or other loading parameters after approval. Header detection also reports `false` for non-empty non-plain containers such as `Headers`, while PDF.js types accept `httpHeaders?: Object`.
3. A PDF.js loading task that rejects before successful publication is removed from `#loadingState` without `task.destroy()`. Later `reader.destroy()` no longer has a reference to that task, so failed or retried loads have no package-owned teardown path.
4. `destroy()` does not settle all package-owned waits. A pending asynchronous source policy can leave `load()` pending forever after destruction, and a delayed or missing `canvas.toBlob()` callback can leave conversion, page, and canvas ownership pending after `destroy()` resolves.
5. Resource limits are per document, page canvas, or individual embedded image. Text item/character counts, operator count, embedded-image count, and aggregate embedded-image work/output on one page remain unbounded.
6. Each embedded-image paint synchronously calls `canvas.toDataURL()`. Repeated XObject references are resolved and encoded repeatedly even though only their transforms differ.
7. The runtime permits multiple concurrent `pages()` or `convert()` calls on one reader. The documentation's unqualified serial-processing and `1/1` active page/canvas resource claims apply only to each iterator, not to the reader as a whole.
8. `load()` returns the reader-owned `PDFDocumentProxy`, which lets a caller directly destroy or mutate the lifecycle of a proxy that `reader.state` still reports as loaded. The ownership contract does not currently label that proxy as borrowed or prohibit caller teardown.
9. The published peer range, tested version, README, website docs, packed-consumer assertion, and prior completion record disagree about the supported PDF.js compatibility boundary.

## Priority Definitions

- P0: confirmed cross-boundary behavior permits untrusted input to bypass an intended security decision or corrupt unrelated consumers.
- P1: confirmed policy, cleanup, resource-bound, compatibility, or lifecycle behavior can leak resources, violate documented guarantees, or expose consumers to an untested runtime contract.
- P2: architectural or performance behavior materially weakens encapsulation, predictability, or browser responsiveness but has a bounded workaround.
- P3: optional API cleanup, test portability, or maintainability improvement without a current production defect.

## Wave 1: Pre-Load Security And Lifecycle Ownership

### Task PDFR2-01: Snapshot And Await The Effective Source Policy Input

Status: pending

Priority: P0

Suggested agent: browser input-boundary and JavaScript object-semantics specialist

Dependencies: none

Primary ownership:

- `packages/pdf-reader/src/PDFReader.ts` source inspection and policy path
- source-policy tests in `packages/pdf-reader/test/PDFReader.test.ts`
- source-policy contract in `packages/pdf-reader/src/types.ts` and `packages/pdf-reader/README.md`

Finding:

`#getOrCreateLoadState()` awaits policy only when `#isPromiseLike()` returns true, and that helper uses `value instanceof Promise`. Valid cross-realm promises and thenables therefore fail open. Policy metadata is derived from the original source and the same mutable source is later passed to PDF.js, allowing time-of-check/time-of-use changes. `#readHttpHeaders()` treats only enumerable string-valued plain-object entries as evidence of headers, so a non-empty `Headers` or other object can be reported as `hasHttpHeaders: false` even though PDF.js receives it.

References:

- `packages/pdf-reader/src/PDFReader.ts:358-403`
- `packages/pdf-reader/src/PDFReader.ts:480-508`
- `packages/pdf-reader/src/PDFReader.ts:510-583`
- `packages/pdf-reader/src/types.ts:60-77`
- `packages/pdf-reader/test/PDFReader.test.ts:348-424`
- `packages/pdf-reader/node_modules/pdfjs-dist/types/src/display/api.d.ts:28`

Implementation requirements:

1. Normalize the effective PDF.js source once before policy execution. Policy inspection and `getDocument()` must observe the same URL, credential flag, header presence, data reference, and loading parameters.
2. Prevent getters or post-approval top-level mutation from changing the effective URL, credentials, headers, or other PDF.js parameters. Preserve legitimate opaque values such as caller-created `PDFWorker` instances without recursively cloning them.
3. Do not expose a policy-mutable object that can alter the effective source after approval. If `rawSource` cannot remain safely exposed, treat its removal or replacement as an explicit public contract change with declarations and migration notes.
4. Treat any supplied non-null header object as header-bearing. Copy string header values for policy diagnostics only when this can be done safely; do not claim the absence of headers merely because a container is not a plain enumerable record.
5. Await all valid `PromiseLike<void>` policy results through normal promise assimilation. Observe late rejection even when abort or destroy wins the caller-facing race.
6. Keep synchronous policy failures and known-size source rejections ahead of `getDocument()`.
7. Avoid including URL, headers, password, source contents, or arbitrary policy error text in package-generated errors.
8. Add adversarial tests for a custom thenable, a promise from another realm or equivalent non-`instanceof` promise, changing getters, mutation during deferred approval, and a non-plain header object.

Acceptance criteria:

- `getDocument()` is not called until a cross-realm promise or thenable policy has fulfilled.
- A rejected thenable produces `SOURCE_POLICY_VIOLATION` without starting PDF.js work or causing an unhandled rejection.
- Policy approval and PDF.js loading use one stable effective URL, credential setting, header presence, and parameter snapshot.
- A source whose URL or credentials change between property reads cannot make PDF.js consume values different from those approved by policy.
- A supplied non-plain header object is reported as header-bearing and can be rejected before network work.
- Existing password, CMap, font, WASM, data, and caller-created-worker pass-through tests remain valid.
- `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` and `pnpm --filter @web-ts-toolkit/pdf-reader test` pass.

### Task PDFR2-02: Own Failed Loads And Destruction-Aware Waits

Status: pending

Priority: P1

Suggested agent: asynchronous lifecycle and cancellation specialist

Dependencies: PDFR2-01

Primary ownership:

- `packages/pdf-reader/src/PDFReader.ts` load, destroy, render, and encoder lifecycle
- `packages/pdf-reader/src/errors.ts` only if lifecycle codes require adjustment
- lifecycle-focused tests in `packages/pdf-reader/test/PDFReader.test.ts`
- focused browser lifecycle tests in `packages/pdf-reader/test/pdf-reader.browser.ts`

Finding:

A loading task is published to `#loadingTask` only after `task.promise` fulfills. On ordinary rejection, the local task is forgotten without `task.destroy()`, and later reader destruction cannot reach it. Reader destruction also has no internal signal/deferred that can reject a policy wait or Blob encoder wait; `destroy()` can resolve while `load()` or `convert()` remains pending and retains package-owned work.

References:

- `packages/pdf-reader/src/PDFReader.ts:29-34`
- `packages/pdf-reader/src/PDFReader.ts:99-111`
- `packages/pdf-reader/src/PDFReader.ts:157-178`
- `packages/pdf-reader/src/PDFReader.ts:277-320`
- `packages/pdf-reader/src/PDFReader.ts:358-435`
- `packages/pdf-reader/test/PDFReader.test.ts:482-501`
- `packages/pdf-reader/test/PDFReader.test.ts:525-545`
- `packages/pdf-reader/test/PDFReader.test.ts:565-669`
- `packages/pdf-reader/test/pdf-reader.browser.ts:259-292`

Implementation requirements:

1. Give every created `PDFDocumentLoadingTask` one explicit owner and one idempotent destroy path, including malformed, password, network, worker-initialization, page-limit, retry, and reader-destroy outcomes.
2. Destroy an unsuccessfully loaded task before dropping the final reference. Preserve the original PDF.js rejection if cleanup also rejects; do not replace a useful password or malformed-document error with a cleanup error.
3. Introduce one reader-owned destruction notification and compose it with source-policy waiting, load waiting, rendering, and Blob encoding where package code controls the wait.
4. `destroy()` must cause affected public operations to settle promptly with `DESTROYED`, detach listeners, ignore late callbacks, and release page/canvas ownership exactly once.
5. Define whether `destroy()` waits for page/canvas cleanup to complete. The implementation and README must agree; do not claim destruction is complete while package-owned synchronous cleanup remains pending.
6. Keep caller abort local to that caller. Do not regress concurrent `load()` isolation.
7. Add deferred-promise tests without sleeps for failed-task cleanup, retry after failure, destroy during asynchronous policy approval, destroy during Blob encoding, late policy rejection, late Blob callback, and cleanup rejection.
8. Strengthen browser malformed/encrypted assertions where observable, but do not claim public `numPages === undefined` proves worker/task teardown.

Acceptance criteria:

- Each failed PDF.js loading task has `destroy()` called exactly once before the reader permits an independent retry.
- Password and malformed-document errors retain their PDF.js identity when task cleanup succeeds or fails.
- Destroying during a never-settling policy causes all reader-owned load waiters to reject promptly with `DESTROYED` and does not call `getDocument()` later.
- Destroying during delayed Blob encoding rejects conversion with `DESTROYED`, releases the page and canvas exactly once, and ignores a late callback.
- Concurrent load caller abort behavior and idempotent reader destruction remain unchanged.
- Lifecycle tests fail on the pre-fix implementation and pass after the change.
- `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` and `pnpm --filter @web-ts-toolkit/pdf-reader test` pass.

## Wave 2: Aggregate Resource Bounds And Reader Concurrency

### Task PDFR2-03: Bound Per-Page Text And Operator-Derived Work

Status: pending

Priority: P1

Suggested agent: untrusted-document resource-hardening specialist

Dependencies: PDFR2-02

Primary ownership:

- `packages/pdf-reader/src/types.ts` resource-limit contract
- `packages/pdf-reader/src/PDFReader.ts` text boundary
- `packages/pdf-reader/src/embeddedImages.ts` operator and aggregate-image boundary
- limit-focused unit/browser fixtures and tests
- package and website resource-limit documentation

Finding:

Current limits bound total document pages, one page canvas, and one embedded-image canvas. They do not bound the number or retained characters of text items, operator-list length, number of extracted images, cumulative decoded image pixels, or aggregate encoded output for a page. A compact PDF can therefore trigger unbounded traversal, repeated canvas encoding, and large retained page results while every individual allocation remains under its limit.

References:

- `packages/pdf-reader/src/types.ts:45-54`
- `packages/pdf-reader/src/PDFReader.ts:180-242`
- `packages/pdf-reader/src/embeddedImages.ts:33-115`
- `packages/pdf-reader/src/embeddedImages.ts:135-203`
- `packages/pdf-reader/test/PDFReader.test.ts:164-262`
- `packages/pdf-reader/test/pdf-reader.browser.ts:350-403`
- `packages/pdf-reader/README.md:173-220`

Implementation requirements:

1. Add explicit limits for operator count, extracted-image count, aggregate decoded embedded-image pixels, and retained text size. Define whether text size is measured by item count, string code units, or both.
2. Select documented finite defaults consistent with the package's resource-safe claim. Record the compatibility impact and allow callers to configure stricter values.
3. Enforce operator and text limits immediately after PDF.js returns each complete structure and before package traversal or per-image allocation begins.
4. Enforce image-count and aggregate-pixel limits before allocating or encoding the next image. Use safe-integer arithmetic and fail closed on non-finite or overflowing dimensions/counts.
5. Decide whether aggregate encoded output needs a separately enforceable bound. If exact pre-encoding enforcement is impossible, document and test the nearest safe boundary rather than claiming a guarantee that does not exist.
6. Use stable, specific `PdfReaderError` codes. Do not overload `IMAGE_LIMIT_EXCEEDED` if callers need to distinguish one-image and aggregate failures.
7. Resource-limit and lifecycle errors must propagate through best-effort extraction; unsupported individual image layouts may still warn and skip.
8. Document that these checks bound package processing and retained results after PDF.js returns data, but cannot stop PDF.js from initially constructing text/operator structures.
9. Add negative, exact-boundary, one-over-boundary, overflow, abort, and cleanup tests. Add a deterministic generated fixture only if mocks cannot establish the browser boundary.

Acceptance criteria:

- A page above each configured text, operator, image-count, or aggregate-pixel limit fails with the documented stable code.
- A page exactly at each limit succeeds.
- No over-limit embedded image is allocated or encoded, and page/canvas cleanup still occurs exactly once.
- Repeating many individually valid image operators cannot bypass aggregate limits.
- Defaults, configuration, enforcement timing, and PDF.js allocation limitations agree across types, README, website docs, and emitted declarations.
- Focused tests, browser tests, typecheck, and the package test command pass.

### Task PDFR2-04: Enforce One Page Operation Per Reader

Status: pending

Priority: P1

Suggested agent: async iterator and API-contract specialist

Dependencies: PDFR2-03

Primary ownership:

- `packages/pdf-reader/src/PDFReader.ts` page-operation ownership
- `packages/pdf-reader/src/errors.ts` operation-conflict code
- concurrent iterator/conversion tests
- serial-processing and state documentation

Finding:

Each `pages()` loop is serial, but the reader has no operation lock. Multiple calls to `pages()` or `convert()` can concurrently acquire page proxies and allocate canvases. `#activePageWorkCount` only reports `iterating`; it does not enforce the README's reader-level serial processing or the benchmark's `1/1` active page/canvas resource assumption.

References:

- `packages/pdf-reader/src/PDFReader.ts:59-60`
- `packages/pdf-reader/src/PDFReader.ts:77-85`
- `packages/pdf-reader/src/PDFReader.ts:113-155`
- `packages/pdf-reader/README.md:159-171`
- `website/docs/packages/pdf-reader.md:60`
- `packages/pdf-reader/test/PDFReader.test.ts:547-669`

Implementation requirements:

1. Enforce one active `pages()`/`convert()` operation per reader unless the maintainer explicitly chooses and documents per-iterator rather than per-reader bounds.
2. Prefer a deterministic fail-fast conflict error over an implicit unbounded queue. Add a stable error code if overlap is rejected.
3. Acquire operation ownership when generator execution actually begins, not merely when `pages()` returns an iterator object.
4. Release ownership on normal exhaustion, early iterator return, caller-thrown loop errors, option validation failure, page failure, abort, and destroy.
5. Ensure `convert()` does not acquire a second lock in addition to the underlying `pages()` operation.
6. Keep sequential reuse after completion supported.
7. Update state and performance documentation to state the exact reader-level guarantee and release-note the newly rejected overlap if applicable.

Acceptance criteria:

- Two overlapping page operations on one reader cannot own two page proxies or canvases at once.
- The second overlapping operation fails with the documented stable error before `getPage()` or canvas allocation.
- Early return, validation error, abort, and destroy all release operation ownership exactly once.
- A new conversion after the prior operation settles succeeds.
- The benchmark's serial resource claim and runtime behavior describe the same scope.
- Package, browser, declaration-consumer, and packed-consumer checks pass.

## Wave 3: Compatibility And Performance Health

### Task PDFR2-05: Align The PDF.js Peer Compatibility Contract

Status: pending

Priority: P1

Suggested agent: TypeScript packaging and PDF.js compatibility specialist

Dependencies: none

Primary ownership:

- `packages/pdf-reader/package.json`
- `packages/pdf-reader/test/packed-consumer.test.ts`
- package and website PDF.js compatibility documentation
- compatibility test tooling if a version matrix is selected
- `CHANGELOG.md`

Finding:

The manifest publishes `pdfjs-dist@^6.2.108` and the lockfile/browser suite exercise `6.2.108`, while the README and website docs still claim `~5.7.284`. The extractor depends on operator constants and image-object shapes that are not a stable version-agnostic boundary. A caret range advertises future 6.x minors that have not been exercised.

References:

- `packages/pdf-reader/package.json:41-47`
- `packages/pdf-reader/src/embeddedImages.ts:1-17`
- `packages/pdf-reader/src/embeddedImages.ts:33-133`
- `packages/pdf-reader/README.md:223-229`
- `website/docs/packages/pdf-reader.md:58`
- `packages/pdf-reader/test/packed-consumer.test.ts:277-305`
- `docs/tasks/20260818-233158-pdf-reader-hardening-follow-up.md:618-627`

Implementation requirements:

1. Determine whether the `^6.2.108` change was intentional and backed by compatibility evidence not recorded in the prior plan.
2. If no such evidence exists, narrow the peer and dev dependency to the tested `~6.2.108` minor. Do not retain a future-minor caret solely for convenience.
3. If the caret is retained, add a reproducible real-browser matrix that tests the minimum supported release and newest permitted 6.x release against rendering and every claimed embedded-image fixture shape.
4. Align package metadata, packed-consumer assertions, lockfile, README, website docs, and changelog in one change.
5. Preserve the prior task's historical evidence. Add a dated correction or link to this task instead of rewriting what was observed on 2026-08-19.
6. Ensure a fresh packed consumer installs the selected peer contract and bundles the worker path.

Acceptance criteria:

- One unambiguous PDF.js version policy appears in the manifest, package README, website docs, packed-consumer tests, and release notes.
- Every version admitted by the selected policy is represented by defensible compatibility evidence, or the range is narrowed to the tested minor.
- Real-browser rendering and embedded-image fixtures pass for the supported compatibility boundary.
- `npm pack --dry-run --json` and the package test command pass.

### Task PDFR2-06: Measure And Reduce Repeated Embedded-Image Encoding

Status: pending

Priority: P2

Suggested agent: browser canvas performance and PDF graphics specialist

Dependencies: PDFR2-03, PDFR2-05

Primary ownership:

- `packages/pdf-reader/src/embeddedImages.ts`
- embedded-image benchmark/fixture coverage
- extracted-image result types only if measurements justify a public mode
- performance documentation

Finding:

Embedded-image extraction synchronously calls `canvas.toDataURL('image/png')` for every paint operation. Repeated XObject references are resolved and encoded repeatedly even though the encoded pixels are identical and only placement transforms differ. Existing Blob measurements cover full-page output, not this path.

References:

- `packages/pdf-reader/src/embeddedImages.ts:80-104`
- `packages/pdf-reader/src/embeddedImages.ts:117-168`
- `packages/pdf-reader/test/pdf-reader.browser.ts:313-403`
- `packages/pdf-reader/benchmark/pdf-reader.benchmark.browser.ts`

Implementation requirements:

1. Measure extraction wall time, long tasks, encode count, and retained output size for unique and repeatedly painted image objects after aggregate limits exist.
2. Cache encoded payloads for repeated PDF.js object references while retaining a separate result and transform for each paint. Do not cache inline images by an unsafe or collision-prone synthetic key.
3. Bound cache lifetime to one page extraction and clear references when extraction settles.
4. Evaluate asynchronous Blob encoding before replacing synchronous `toDataURL()`. Preserve mandatory data URL output only if conversion cost and compatibility are measured and documented.
5. If adding an embedded-image Blob mode, use a discriminated result type and update declarations/docs as an explicit public contract change. Do not add overlapping booleans.
6. Keep cancellation and resource-limit checks between images. Do not claim JavaScript can interrupt a synchronous canvas encode already in progress.
7. Preserve PDF.js ownership of `ImageBitmap` instances.

Acceptance criteria:

- A repeated image XObject is encoded once per page while every placement retains its own transform and coordinates.
- Unique, inline, bitmap-backed, RGB, RGBA, and nested-form fixture behavior remains unchanged.
- Cache size cannot exceed the aggregate limits established by PDFR2-03 and is released after the page settles.
- Browser measurements and the resulting keep/change decision are recorded in completion evidence.
- No speculative public output mode is added without measured benefit and migration documentation.
- Benchmark, package, and browser tests pass.

## Wave 4: Encapsulation, Documentation, And Test Health

### Task PDFR2-07: Clarify Borrowed Proxies And Global Worker Ownership

Status: pending

Priority: P2

Suggested agent: public TypeScript API and lifecycle documentation specialist

Dependencies: PDFR2-02, PDFR2-04, PDFR2-05

Primary ownership:

- `packages/pdf-reader/src/types.ts`
- `packages/pdf-reader/src/worker.ts`
- `packages/pdf-reader/src/index.ts`
- declaration-consumer coverage
- package README, website docs, and migration notes

Finding:

`load()` returns the same `PDFDocumentProxy` that the reader claims to own, but the contract does not label it as borrowed or prohibit callers from invoking `document.destroy()`. Doing so leaves reader state and retained proxy ownership inconsistent. The package also exports `LoadedPdfPage` even though no package API returns it, describes an `HTMLCanvasElement` factory as supporting non-DOM implementations, and exposes a helper that mutates PDF.js application-global worker settings without using that scope in its name or summary.

References:

- `packages/pdf-reader/src/PDFReader.ts:87-97`
- `packages/pdf-reader/src/types.ts:79-87`
- `packages/pdf-reader/src/types.ts:139-154`
- `packages/pdf-reader/src/worker.ts:3-17`
- `packages/pdf-reader/src/index.ts:7-32`
- `packages/pdf-reader/README.md:29-50`
- `packages/pdf-reader/README.md:93-115`
- `packages/pdf-reader/test-decl-consumer/decl-consumer.mts:46-75`
- `packages/pdf-reader/dist/index.d.mts:124-142`

Implementation requirements:

1. Document the `PDFDocumentProxy` returned by `load()` as borrowed: callers may inspect/use supported PDF.js methods but must not destroy it while the reader owns lifecycle teardown.
2. Add an explicit test characterizing behavior if the borrowed proxy is externally destroyed. If safe detection is impossible, document the unsupported action and residual risk rather than pretending reader state can remain authoritative.
3. Record a future-major option to return `void`, reader metadata, or a package-owned facade from `load()`. Do not make that breaking change without maintainer approval.
4. Audit exported aliases. Remove `LoadedPdfPage` only with consumer evidence or a release-note-worthy API decision; otherwise document its intentional interoperability purpose.
5. Correct `canvasFactory` JSDoc to describe custom DOM canvas creation unless its return type is deliberately generalized and browser behavior is tested.
6. Make the application-global scope and collision risk of `configurePdfWorker()` explicit in JSDoc and README. Show per-source caller-created `PDFWorker` configuration as the isolation path if supported by the public source type.
7. Verify high-value JSDoc survives into `dist/index.d.mts` and can be understood in an installed consumer without source access.

Acceptance criteria:

- Installed declarations and README unambiguously describe document proxy ownership and prohibited caller teardown.
- Worker configuration is described as PDF.js application-global state, including the isolated per-source alternative where supported.
- Public aliases and canvas injection documentation match actual runtime entrypoints and types.
- No unsupported deep import or default export is introduced.
- Declaration-consumer, packed-consumer, typecheck, and package tests pass.

### Task PDFR2-08: Make Browser Coverage Deterministic And State Its Support Boundary

Status: pending

Priority: P3

Suggested agent: Vitest browser and cross-browser test specialist

Dependencies: PDFR2-02, PDFR2-05

Primary ownership:

- `packages/pdf-reader/test/pdf-reader.browser.ts`
- `packages/pdf-reader/vitest.browser.config.ts`
- package-local test scripts and dev dependencies
- browser support documentation

Finding:

The real-browser cancellation case sleeps for 5 ms and assumes rendering has started but not completed, making the assertion scheduler-sensitive. The suite runs only Chromium, yet package prose does not define an explicit browser support boundary. Current config files also emit a Vite warning about ESM syntax under the planned native config loader.

References:

- `packages/pdf-reader/test/pdf-reader.browser.ts:410-443`
- `packages/pdf-reader/vitest.browser.config.ts:31-55`
- `packages/pdf-reader/package.json:27-47`
- `packages/pdf-reader/README.md:5-13`

Implementation requirements:

1. Replace fixed-delay cancellation with an observable render-start synchronization point or a deterministic integration hook that still exercises real PDF.js and browser canvas behavior.
2. Do not weaken the test into a mock-only assertion; the real browser boundary must remain covered.
3. Decide and document the supported browser engines/versions. Add Firefox/WebKit coverage if broad support is claimed and CI can install/run them; otherwise state that automated compatibility is currently Chromium-only.
4. Resolve the Vite native-config-loader warning using the repository's preferred config format or record a versioned tooling blocker. Do not suppress it without understanding the migration impact.
5. Keep browser files serial because PDF.js worker configuration is global.

Acceptance criteria:

- The real-browser abort test proves rendering began before cancellation without relying on elapsed-time sleeps.
- Repeated local runs do not intermittently complete before abort.
- Package documentation states the tested browser support boundary accurately.
- Browser tests pass without the native-config-loader warning, or a concrete dependency/config blocker is documented with owner and trigger.
- `pnpm --filter @web-ts-toolkit/pdf-reader test` passes serially.

## Dependency And Parallelization Guidance

Recommended execution order:

| Wave | Tasks                   | Parallelization                                                                                                                        |
| ---- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | PDFR2-01, then PDFR2-02 | Sequence because both own the load state and policy path in `PDFReader.ts`.                                                            |
| 2    | PDFR2-03, then PDFR2-04 | Sequence shared reader/types/tests edits and settle resource semantics before concurrency enforcement.                                 |
| 3    | PDFR2-05 and PDFR2-06   | PDFR2-05 may run alongside Waves 1-2 if agents coordinate package/docs/test runs; PDFR2-06 waits for aggregate limits and peer policy. |
| 4    | PDFR2-07 and PDFR2-08   | May run in parallel after dependencies if they coordinate README and browser-test ownership.                                           |
| 5    | PDFR2-09                | Independent integration review after every earlier task is completed or explicitly deferred.                                           |

Shared hotspots requiring one owner at a time:

- `packages/pdf-reader/src/PDFReader.ts`
- `packages/pdf-reader/src/types.ts`
- `packages/pdf-reader/test/PDFReader.test.ts`
- `packages/pdf-reader/test/pdf-reader.browser.ts`
- `packages/pdf-reader/package.json`
- `packages/pdf-reader/README.md`
- `website/docs/packages/pdf-reader.md`
- generated `packages/pdf-reader/dist/**`

Agents may prepare isolated fixtures or compatibility scripts concurrently, but they must not run package tests/builds at the same time because those commands rebuild the same `dist/` directory.

Recommended agent allocation:

| Agent | Tasks              | Notes                                                                                      |
| ----- | ------------------ | ------------------------------------------------------------------------------------------ |
| A     | PDFR2-01, PDFR2-02 | Retain one owner for source snapshot and lifecycle state changes.                          |
| B     | PDFR2-03, PDFR2-04 | Start only after Agent A completes; owns resource and operation bounds.                    |
| C     | PDFR2-05           | Can investigate independently; coordinate manifest/docs edits and serialized verification. |
| D     | PDFR2-06           | Start after PDFR2-03 and PDFR2-05; owns measured extraction optimization.                  |
| E     | PDFR2-07, PDFR2-08 | Can split docs/declarations from browser tooling if shared files are coordinated.          |
| F     | PDFR2-09           | Must be independent from Agents A-E.                                                       |

## Deferred Decisions Requiring Maintainer Input

1. `load()` return contract: keep the borrowed `PDFDocumentProxy` for this release or schedule a major-version facade/metadata return. PDFR2-07 documentation is not blocked; removing the proxy is blocked pending maintainer approval and consumer evidence.
2. Embedded-image binary output: retain data URLs with per-page caching, or add a discriminated Blob mode. PDFR2-06 must gather browser measurements before requesting this decision.
3. Browser support: claim Chromium-only automated compatibility or fund Firefox/WebKit CI coverage. PDFR2-08 must state the current tested boundary even if expansion is deferred.
4. Remote URL default policy from the prior plan remains unresolved: permit remote sources unless `sourcePolicy` is supplied, or default-deny them in a future breaking release. PDFR2-01 must make configured policies fail closed but must not silently change the default.

No maintainer decision blocks PDFR2-01 through PDFR2-05 from implementing the smallest secure contract described above.

## Wave 5: Independent Final Integration Review

### Task PDFR2-09: Audit The Combined Security And Resource Contract

Status: pending

Priority: P1

Suggested agent: independent reviewer who did not implement PDFR2-01 through PDFR2-08

Dependencies: PDFR2-01, PDFR2-02, PDFR2-03, PDFR2-04, PDFR2-05, PDFR2-06, PDFR2-07, PDFR2-08

Primary ownership:

- independent review of `packages/pdf-reader/**`
- emitted declarations and packed artifacts
- package and website documentation consistency
- this task file's statuses and completion evidence

Finding:

The follow-up changes intersect policy approval, mutable JavaScript object semantics, PDF.js worker/loading ownership, cancellation, canvas callbacks, collection limits, async iterators, private PDF.js image shapes, package metadata, and installed declarations. Individually passing task suites are insufficient to prove that the combined boundary remains fail closed and leak free.

References:

- all tasks and completion evidence in this document
- `docs/tasks/20260818-233158-pdf-reader-hardening-follow-up.md`
- `AGENTS.md`
- `packages/pdf-reader/package.json`
- `packages/pdf-reader/README.md`

Implementation requirements:

1. Verify every acceptance criterion against current runtime code, focused regressions, real-browser behavior, declarations, packed artifacts, and documentation.
2. Re-run adversarial source getters/mutation, non-plain headers, thenable policy, policy rejection, task rejection, retry, abort, deadline, destroy, render, Blob callback, early iterator return, operation overlap, and aggregate-limit scenarios.
3. Confirm every created loading task, page proxy, render task, canvas, timer, listener, and per-page image cache has one owner and one observable release path.
4. Confirm source policy inspects the same effective values consumed by PDF.js and starts no network/loading work before asynchronous approval.
5. Confirm text/operator/image collection bounds have exact-boundary and one-over-boundary tests and do not swallow abort, destroy, or resource-limit failures.
6. Verify the peer dependency range matches real-browser compatibility evidence and all shipped documentation.
7. Inspect `dist/index.d.mts` for useful JSDoc, intentional PDF.js type exposure, and absence of internal image shapes.
8. Verify the package runtime has no bundler-specific worker import or module-evaluation worker mutation.
9. Record every deferred item with rationale, owner, trigger, and residual risk.
10. Update this task file with evidence; do not rewrite historical findings.

Acceptance criteria:

- No unresolved P0 or P1 finding remains.
- `pnpm --filter @web-ts-toolkit/pdf-reader typecheck` passes.
- `pnpm --filter @web-ts-toolkit/pdf-reader test` passes, including real-browser, declaration-consumer, and packed-consumer coverage.
- `pnpm --filter @web-ts-toolkit/pdf-reader benchmark` passes if PDFR2-06 changes extraction performance.
- `npm pack --dry-run --json` lists only intended artifacts.
- `pnpm lint`, `pnpm build`, and the full serialized `pnpm test` pass, or an unrelated blocker is captured with command output and ownership.
- Source, emitted declarations, manifest, package README, website docs, changelog, and runtime behavior agree.
- Deferred P2/P3 work has explicit residual risk and a reconsideration trigger.

## Definition Of Done

- Every task is `completed`, `deferred`, or `cancelled` with rationale and verification evidence.
- Async policy results cannot bypass approval, and policy inspects the same effective source values PDF.js consumes.
- Every created PDF.js loading task has a deterministic teardown path on success, failure, retry, page-limit rejection, and reader destruction.
- Reader destruction promptly settles package-owned policy, rendering, and encoding waits and releases page/canvas ownership.
- Default and configured limits bound text, operator-derived work, image count, and aggregate image allocation with honest PDF.js boundary documentation.
- One reader cannot accidentally multiply page/canvas ownership through overlapping conversions contrary to the documented serial contract.
- PDF.js peer metadata, tested versions, README, website docs, packed consumer, and release notes agree.
- Embedded-image performance changes are measured, bounded, and preserve transform correctness.
- Installed declarations clearly communicate borrowed document ownership, canvas requirements, and global worker configuration scope.
- Targeted, package, browser, packed-consumer, benchmark where applicable, and final workspace verification pass or have documented unrelated blockers.
