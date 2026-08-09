# Express Response Handler Review Remediation

Created: 2026-08-09 10:09:34 PDT

Package: `packages/express-response-handler`

## Objective

Remediate confirmed correctness, security, streaming, public-contract, and testability gaps in `@web-ts-toolkit/express-response-handler`. The end state must terminate or delegate every request exactly once, preserve Express control flow, avoid exposing unexpected server failures by default, stream CSV output with bounded memory behavior, and make runtime exports, declarations, examples, and package artifacts agree.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Preserve documented success wrappers and simple, AIP-193, and RFC 9457 error formats unless this plan explicitly changes their contract.
- Prefer one async request pipeline over additional detached promise branches in `create-handler.ts`.
- Preserve the original thrown value for server-side hooks and Express error middleware even when the client receives a redacted payload.
- Treat returned values as trusted application code, but validate every status, configuration value, and header value before writing a response.
- Do not edit generated `dist/` manually. Rebuild it from source.
- Update `README.md`, `llms.txt`, website docs, declarations, and release notes together when public behavior changes.
- Check sibling `express-json-router` behavior whenever handler shape or shared hooks change.
- Preserve unrelated worktree changes. Never revert files outside the assigned task.
- Run package tests serially. The test script rebuilds shared dependency output, so agents must not run package test/build commands concurrently.

## Non-Goals

- Do not replace Express or `@fast-csv/format` without evidence that the dependency blocks an acceptance criterion.
- Do not redesign all response wrapper classes while fixing request lifecycle behavior.
- Do not preserve unsafe error disclosure through a compatibility alias unless a concrete released consumer requires it.
- Do not add broad framework abstractions for middleware that the package does not support.
- Do not optimize bundle size before measuring packed size and root import cost.

## Review Baseline

Confirmed on 2026-08-09 against a clean worktree before this task file was created:

- `pnpm --filter @web-ts-toolkit/express-response-handler test`: passed, 3 files and 44 tests.
- `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"`: passed with no findings.
- `git diff --check`: passed.
- Tests rebuild `utils`, `http-errors`, and this package before importing generated ESM files.
- Existing tests cover ordinary `Error` instances and small CSV arrays, but not nullish throws, detached error-path failures, delayed `next(error)`, Express route sentinels, partial responses, CSV processor failures, filename encoding, or backpressure.
- Existing packed-consumer coverage in `packages/access-router/test/packed-consumer-compatibility.test.ts` includes this package transitively but does not directly verify every response-handler root/subpath contract.

## Priorities

- P0: unhandled process errors, hung requests, incomplete response termination, or confidential server-error disclosure.
- P1: broken Express semantics, invalid HTTP output, malformed streaming behavior, or a documented API that cannot be used.
- P2: test isolation, type/API encapsulation, packaging, performance, and maintainability improvements that do not independently create a P0/P1 outcome.
- P3: measured optional optimization or defense-in-depth whose value depends on maintainer policy.

## Wave 1: Regression Harness And Request Safety

### Task ERH-01: Isolate Tests And Add Lifecycle Regression Helpers

Status: completed

Priority: P1

Suggested agent: Express integration-test specialist

Dependencies: none

Primary ownership:

- `packages/express-response-handler/test/middleware.test.ts`
- `packages/express-response-handler/test/response.test.ts`
- focused test helpers under `packages/express-response-handler/test/`

Finding:

Middleware tests mutate the default singleton's hooks and provider without restoring them, so later tests inherit state. Response tests also open fixed port `8083` even though Supertest can exercise the app directly. The current harness has no reliable assertion for one terminal response, Express error delegation, or process-level unhandled rejection.

References:

- `packages/express-response-handler/test/middleware.test.ts:7-17`
- `packages/express-response-handler/test/middleware.test.ts:188-319`
- `packages/express-response-handler/test/response.test.ts:20-32`

Implementation requirements:

1. Use fresh `createHandler()` instances per behavioral test group, or restore every mutable singleton field in `afterEach`.
2. Remove the fixed listener when `request(app)` is sufficient; otherwise bind port `0` and await lifecycle events.
3. Add reusable, test-only instrumentation for Express error middleware, response completion/close, and temporary `unhandledRejection` observation.
4. Keep helpers deterministic and restore all process listeners after each test.
5. Do not change runtime behavior in this task.

Acceptance criteria:

- Hook/provider tests pass independently and in reversed/randomized order.
- Two test processes can run the response suite without `EADDRINUSE` or open-handle warnings.
- A focused test can prove whether a request finished, closed, or reached error middleware exactly once.
- `pnpm --filter @web-ts-toolkit/express-response-handler test` passes.

Completion evidence:

- Added: `packages/express-response-handler/test/helpers/lifecycle.ts` exposing `createResponseLifecycleProbe`, `trackResponseTermination`, `captureProcessErrors`, `createInstrumentedApp`, `createBoundApp`, and `resetHandlerState`. All process listeners registered by these helpers are removed in `dispose()`.
- Changed: `packages/express-response-handler/test/middleware.test.ts`
  - Removed the `http.createServer(app)` + `server.listen(0)` from `middleware.test.ts`; Supertest exercises the app directly, so no TCP handle is left open.
  - Added a global `afterEach` that resets the default singleton's hooks and `errorMessageProvider` via `resetHandlerState`, plus captured defaults of `apiHandler.errorMessageProvider` captured at module load so later groups never inherit mutated state.
  - Migrated every hook/provider/group test (`Pre Json hook`, `Pre Json hook failure`, `Pre Json hook with Post Json hook`, `Pre Error hook`, `Pre Error hook with Post Error hook`, `Pre Error hook failure`, `Custom Error Message Provider`, `Configuration accessors`, `Handler instance isolation`, `AIP-193 error format`, `RFC 9457 error format`) to its own `createHandler()` instance so singleton state never leaks between groups.
  - Added an `Express error middleware observation` describe block with four focused tests:
    - a thrown handler error produces one terminal response and does not emit an `unhandledRejection`;
    - a rejected handler promise does the same;
    - a raw Express middleware calling `next(error)` reaches the lifecycle probe exactly once and the response finishes once;
    - a successful response finishes exactly once and never reaches Express error middleware.
- Changed: `packages/express-response-handler/test/response.test.ts`
  - Removed `app.set('port', 8083)`, the `http.createServer`, `server.listen(8083)`, and `afterAll` closer. Each test now builds its own `express()` app and uses `request(app)` directly, eliminating the fixed listener that previously kept a handle open for the entire suite.
  - Added a `Response lifecycle regression` group exercising `createInstrumentedApp` + `probe.install()` + `tracker.attachedMiddleware` to prove a successful `OK` response finishes exactly once without reaching Express error middleware.
- Verified:
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` passes (3 files, 49 tests, up from 44).
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` passes with no findings.
  - `pnpm exec vitest run --sequence.shuffle --sequence.seed=1` and `--seed=4242` both pass (49 tests), satisfying independent/randomized order.
  - Two parallel `pnpm exec vitest run --config …/vitest.config.ts` processes complete `A=0 B=0`; no `EADDRINUSE` or open-handle messages.
  - `pnpm exec vitest run --detectAsyncLeaks` reports no async leaks.
  - `pnpm --filter @web-ts-toolkit/express-json-router test` passes (13 tests) after the test isolation changes.
- Runtime impact: none. `git diff packages/express-response-handler/src` is empty; `dist/` is regenerated by the package test script.
- Result: 49 tests passed; helpers now exist for ERH-02/ERH-03 hook and pipeline regression tests.

### Task ERH-02: Make The Response Pipeline Awaitable And Failure-Safe

Status: pending

Priority: P0

Suggested agent: asynchronous error-boundary specialist

Dependencies: ERH-01

Primary ownership:

- `packages/express-response-handler/src/create-handler.ts`
- `packages/express-response-handler/src/error-format.ts`
- focused middleware lifecycle tests

Finding:

`routerFn` and `handlePromise` detach the promise chain. If `sendError`, an error provider, a hook continuation, or response serialization throws, Express cannot observe the rejection. `sendBaseError` also dereferences `null` and `undefined` throw values before normalization. Errors after headers are sent are silently returned instead of reaching Express error handling, which can leave a partial request open.

References:

- `packages/express-response-handler/src/create-handler.ts:173-205`
- `packages/express-response-handler/src/create-handler.ts:216-275`
- `packages/express-response-handler/src/create-handler.ts:313-327`
- `packages/express-response-handler/src/error-format.ts:58-62`
- `packages/express-response-handler/src/types.ts:38-42`

Implementation requirements:

1. Build one returned/observed async lifecycle for handler results, pre-hooks, serialization, post-hook policy, and error delivery.
2. Normalize arbitrary JavaScript throw values before property access; support `null`, `undefined`, strings, symbols, objects, and ordinary errors.
3. Thread the original Express `next` function to the terminal error boundary.
4. If headers are already sent, call `next(originalError)` rather than attempting a second response or silently returning.
5. If formatting or response serialization fails before headers are sent, delegate that failure to Express exactly once.
6. Do not recursively invoke a failing formatter/provider without a bounded terminal fallback.

Acceptance criteria:

- Sync throws and promise rejections with `null`, `undefined`, a string, and an object each terminate deterministically.
- Throwing providers, formatters, hooks, `res.json`, `res.send`, and `res.set` reach Express error middleware exactly once.
- A throw after `res.write(...)` reaches error middleware and no second body is attempted.
- No test emits `unhandledRejection` or `uncaughtException`, and no request hangs.
- Existing simple, AIP-193, and RFC 9457 tests continue to pass.

### Task ERH-03: Preserve Express `next` And Route-Control Semantics

Status: pending

Priority: P1

Suggested agent: Express middleware compatibility specialist

Dependencies: ERH-02

Primary ownership:

- `packages/express-response-handler/src/create-handler.ts`
- `packages/express-response-handler/src/types.ts`
- Express routing/error integration tests

Finding:

The replacement `next` records only synchronous `Error` instances. A delayed callback-style `next(error)` occurs after result inspection and is never handled. A `next(error)` can also wait behind an unrelated pending returned promise. Express control sentinels `next('route')` and `next('router')` are converted into package-generated 422 errors.

References:

- `packages/express-response-handler/src/create-handler.ts:263-310`
- `packages/express-response-handler/test/middleware.test.ts:111-186`
- `packages/express-response-handler/test/middleware.test.ts:651-658`
- `website/docs/packages/express-response-handler.md:206-219`

Implementation requirements:

1. Forward errors and Express control sentinels immediately rather than storing them for later polling.
2. Preserve `next()` with no arguments as middleware continuation and cancel package serialization for that middleware.
3. Ensure delayed `next(error)` from a timer or Node callback cannot hang even when the handler returned `undefined` or a pending promise.
4. Define and enforce behavior when a handler both calls `next(...)` and later resolves/rejects; only the first terminal action may win.
5. Align `NextFunction`, `RouterFunction`, and return types with the supported Express contract.

Acceptance criteria:

- Delayed `next(error)` reaches Express error middleware exactly once.
- `next(error)` is not blocked by an unrelated never-settling returned promise.
- `next('route')` selects the next route and `next('router')` exits the current router where Express supports it.
- A late resolution/rejection after `next()` or `next(error)` does not write or delegate again.
- Direct Express 5 integration tests cover all listed cases.

## Wave 2: Secure And Valid Error Contracts

### Task ERH-04: Redact Unexpected Failures And Validate Statuses

Status: pending

Priority: P0

Suggested agent: HTTP error-contract security specialist

Dependencies: ERH-02

Primary ownership:

- `packages/express-response-handler/src/create-handler.ts`
- `packages/express-response-handler/src/error-format.ts`
- `packages/express-response-handler/src/types.ts`
- error-format tests and public error documentation

Finding:

Generic errors currently return their raw message as status 422. Unexpected database, filesystem, assertion, or upstream messages can therefore expose implementation details and are misclassified as client failures. Status values from thrown objects, wrappers, and custom providers are accepted without checking for finite integer HTTP error ranges; a thrown object with status 200 can become a successful response.

References:

- `packages/express-response-handler/src/create-handler.ts:49-87`
- `packages/express-response-handler/src/create-handler.ts:173-204`
- `packages/express-response-handler/src/error-format.ts:14-20`
- `packages/express-response-handler/src/error-format.ts:58-62`
- `website/docs/packages/express-response-handler.md:244-257`

Implementation requirements:

1. Make unexpected/non-HTTP failures default to status 500 with a generic client message.
2. Retain the original error for `preError`, `postError`, application logging, and Express delegation.
3. Validate status codes as finite integers in the supported HTTP range before any write; error paths must not emit 1xx, 2xx, or 3xx.
4. Validate provider-derived AIP-193 and RFC 9457 status/code values through the same shared boundary.
5. Document the security behavior and add a breaking-change/release note if the prior 422/raw-message contract has shipped.
6. Do not add a compatibility option that restores raw production disclosure unless a maintainer records a concrete requirement.

Acceptance criteria:

- An unexpected error containing a sentinel secret returns neither the secret nor other raw details in every error format.
- Server-side hooks/error middleware can still observe the original error and sentinel.
- `NaN`, infinities, fractional, negative, out-of-range, and non-error status classes are rejected before response headers are written.
- Valid typed 4xx/5xx HTTP errors preserve their documented payloads, subject to an explicit policy for 5xx message redaction.
- README, website docs, and `llms.txt` agree with runtime behavior.

### Task ERH-05: Validate Handler Configuration At Construction

Status: pending

Priority: P1

Suggested agent: runtime validation specialist

Dependencies: ERH-04

Primary ownership:

- `packages/express-response-handler/src/create-handler.ts`
- `packages/express-response-handler/src/types.ts`
- configuration tests

Finding:

TypeScript unions are the only guard for `errorFormat` and `rfc9457ContentType`. JavaScript consumers or cast values can select an unknown formatter, causing an undefined function call while handling another error. Invalid domains/content types are retained until response time.

References:

- `packages/express-response-handler/src/create-handler.ts:55-87`
- `packages/express-response-handler/src/create-handler.ts:119-123`
- `packages/express-response-handler/src/types.ts:12-16`

Implementation requirements:

1. Validate all handler options synchronously in `createHandler`, before returning an instance.
2. Reject unknown formats and unsupported RFC 9457 content types with stable, actionable errors.
3. Define minimal domain validation needed by downstream payload builders without inventing URL policy.
4. Keep one validated immutable configuration snapshot per handler instance.

Acceptance criteria:

- Invalid JavaScript-style configuration fails during `createHandler(...)`, not during request error handling.
- Every accepted option combination has a focused request test.
- Valid instances cannot observe later mutation of the caller's options object.

## Wave 3: CSV Security And Bounded Streaming

### Task ERH-06: Make CSV Headers And Failure Termination Safe

Status: pending

Priority: P1

Suggested agent: Node stream and HTTP header specialist

Dependencies: ERH-02

Primary ownership:

- `packages/express-response-handler/src/responses/csv.ts`
- `packages/express-response-handler/test/csv-response.test.ts`
- CSV documentation

Finding:

CSV filenames are interpolated directly into `Content-Disposition` without quoting, escaping, control-character rejection, or Unicode encoding. The formatter is piped before every row is processed; a throwing processor can leave selected CSV headers and an unterminated or partial response. The code also calls `res.end()` from an `end` listener even though `pipe()` normally ends the destination.

References:

- `packages/express-response-handler/src/responses/csv.ts:41-69`
- `packages/express-response-handler/test/csv-response.test.ts:28-85`

Implementation requirements:

1. Generate a standards-compliant attachment header with a safely quoted fallback and `filename*` for Unicode, using a focused dependency if preferable to custom parsing.
2. Reject CR, LF, NUL, and other disallowed control characters before headers are written.
3. Coordinate processor, formatter, and destination failures through one stream lifecycle.
4. Before output starts, delegate failure through the normal error path; after output starts, destroy/close the response with the original failure.
5. Remove redundant manual ending unless a regression test proves it is required.

Acceptance criteria:

- Spaces, quotes, semicolons, backslashes, Unicode, CR/LF, NUL, and path-like filenames have deterministic safe header output or deterministic pre-write rejection.
- A processor throwing on the first and on a later row terminates all stream participants without a second JSON body.
- Formatter and destination errors leave no open handles and are observed exactly once.
- Existing CSV output remains parseable for object and array rows.

### Task ERH-07: Respect Backpressure And Support Lazy CSV Sources

Status: pending

Priority: P1

Suggested agent: streaming performance specialist

Dependencies: ERH-06

Primary ownership:

- `packages/express-response-handler/src/responses/csv.ts`
- `packages/express-response-handler/src/http-response.ts`
- CSV type declarations, tests, and docs

Finding:

`CSVResponse` eagerly converts input to an array and synchronously calls `stream.write(...)` for every row without observing the return value. Large exports can queue the encoded dataset in memory and block the event loop despite the API being described as streaming.

References:

- `packages/express-response-handler/src/responses/csv.ts:34-49`
- `packages/express-response-handler/src/responses/csv.ts:53-69`
- `packages/express-response-handler/test/csv-response.test.ts:28-85`

Implementation requirements:

1. Accept arrays and synchronous iterables without eager copying; add async iterable support if it does not complicate error ownership.
2. Use pipeline/`Readable.from` or explicit `write()`/`drain` coordination so production never queues the full encoded output by design.
3. Preserve header inference for arrays; require explicit `headers` when a lazy source cannot be safely peeked without consumption.
4. Propagate iterator, processor, formatter, abort, and destination failures through the ERH-06 lifecycle.
5. Document whether a source can be consumed only once and how client disconnect cancellation reaches it.

Acceptance criteria:

- A slow writable and at least 100,000 generated rows demonstrate bounded buffering under a documented threshold.
- Production pauses source consumption when downstream backpressure applies.
- Async iterator cleanup runs on client disconnect and formatter failure.
- Existing array callers remain source-compatible unless a documented breaking change is approved.

## Wave 4: Hooks, API Boundaries, And Documentation

### Task ERH-08: Define Hook Semantics And Failure Policy

Status: pending

Priority: P2

Suggested agent: middleware observability API specialist

Dependencies: ERH-02, ERH-03

Primary ownership:

- `packages/express-response-handler/src/create-handler.ts`
- `packages/express-response-handler/src/types.ts`
- `packages/express-response-handler/README.md`
- `packages/express-response-handler/llms.txt`
- `website/docs/packages/express-response-handler.md`
- `packages/express-json-router/src/index.ts` only if required by the selected contract

Finding:

Documentation says hooks can modify response flow, but return values are discarded. Post hooks run after dispatch invocation rather than HTTP `finish`, run even when no body was sent in some paths, and silently discard rejection. Shared mutable hooks are also proxied process-wide by `express-json-router`.

References:

- `packages/express-response-handler/src/create-handler.ts:33-40`
- `packages/express-response-handler/src/create-handler.ts:151-170`
- `packages/express-response-handler/src/create-handler.ts:210-260`
- `packages/express-response-handler/src/types.ts:8-9`
- `website/docs/packages/express-response-handler.md:221-242`
- `website/docs/packages/express-json-router.md:185-201`

Implementation requirements:

1. Obtain the maintainer decision listed under Deferred Decisions before changing the contract.
2. Recommended minimal contract: hooks are observational side effects returning `void | Promise<void>`; return values never transform payloads.
3. Define whether `post` means after dispatch or after response `finish`; name/document it truthfully and do not report completion after `close`/failure.
4. Route hook rejection through a documented error/logging policy rather than an empty catch.
5. Preserve per-instance isolation and explicitly document the default singleton's process-wide mutation behavior.
6. Update `express-json-router` tests/docs if its proxy contract changes.

Acceptance criteria:

- Types, implementation, README, website docs, and `llms.txt` state the same hook semantics.
- Async pre/post hook success and failure are covered for JSON, errors, no-return handlers, and CSV completion/close.
- Hook failures are observable and do not create duplicate responses or unhandled rejections.
- Fresh handler instances remain isolated; shared singleton behavior is tested explicitly.

### Task ERH-09: Repair Root Exports And Executable Examples

Status: pending

Priority: P1

Suggested agent: TypeScript library API specialist

Dependencies: ERH-03, ERH-04

Primary ownership:

- `packages/express-response-handler/src/index.ts`
- `packages/express-response-handler/README.md`
- `packages/express-response-handler/llms.txt`
- `website/docs/packages/express-response-handler.md`
- documentation compile fixtures

Finding:

README, website docs, and `llms.txt` advertise a named `handleResponse` root export that does not exist. README and website subpath examples call the `Created` and `NoContent` classes without `new`. These copied examples fail compilation or runtime linking.

References:

- `packages/express-response-handler/src/index.ts:1-25`
- `packages/express-response-handler/README.md:60-107`
- `packages/express-response-handler/llms.txt:41-47`
- `website/docs/packages/express-response-handler.md:67-115`
- `packages/express-response-handler/src/responses/success.ts:9-31`

Implementation requirements:

1. Recommended contract: export the default singleton's stable `handleResponse` function as a named root export because all three documentation surfaces already promise it.
2. Keep the default export and `createHandler()` as the preferred isolated/configurable APIs.
3. Correct class examples to use `new`, or use existing `HttpResponse` factories; do not make classes callable solely to preserve broken examples.
4. Turn every documented import/example style into a strict compile fixture and execute representative runtime examples.
5. Keep ESM and CJS behavior aligned.

Acceptance criteria:

- Every README, website, and `llms.txt` import example compiles under strict NodeNext and Bundler resolution.
- Root default, root named, and documented subpath imports execute from a packed tarball in ESM and CJS.
- `Created` and `NoContent` examples execute without class invocation errors.
- Documentation no longer claims any absent export.

### Task ERH-10: Tighten Express Types And Public Encapsulation

Status: pending

Priority: P2

Suggested agent: TypeScript declaration and API-boundary specialist

Dependencies: ERH-03, ERH-08, ERH-09

Primary ownership:

- `packages/express-response-handler/src/types.ts`
- `packages/express-response-handler/src/public-types.ts`
- `packages/express-response-handler/package.json`
- declaration-consumer fixtures
- `packages/express-json-router/src/index.ts` compatibility checks

Finding:

Middleware request types default to `unknown`, so documented `req.params` and augmented `req.user` usage lacks useful contextual typing. Express is only a dev dependency and no supported major range is declared. Internal orchestration types and methods (`EventState`, `handleResult`, `handlePromise`) are exposed publicly even though no workspace consumer calls them directly, increasing coupling and making lifecycle refactoring harder.

References:

- `packages/express-response-handler/src/types.ts:27-54`
- `packages/express-response-handler/src/types.ts:71-84`
- `packages/express-response-handler/src/public-types.ts:1-18`
- `packages/express-response-handler/package.json:63-73`
- `packages/express-response-handler/README.md:42-48`

Implementation requirements:

1. Provide Express-aware overloads/defaults that contextually type request, response, `next`, params, body, query, locals, and request augmentation.
2. Declare and test the supported Express peer range, keeping optional/framework-light structural types only if there is a demonstrated consumer.
3. Audit published usage before removing `EventState`, `handleResult`, or `handlePromise`; if released consumers exist, schedule a major-version removal rather than silently breaking them.
4. Keep orchestration state private in the preferred API so alternate callers cannot create impossible event combinations.
5. Validate types against `express-json-router`, which consumes `ExpressResponseHandler` and mutable handler properties.

Acceptance criteria:

- Strict examples infer `req.params`, body/query/locals generics, and declaration-merged `req.user` without broad casts.
- Minimum and current supported Express versions pass routing, async error, and sentinel integration tests.
- Public declarations expose only intentionally supported lifecycle methods/types, with release notes for removals.
- `express-json-router` builds and its response-handler integration tests pass.

## Wave 5: Package Verification And Measured Optimization

### Task ERH-11: Add Direct Packed-Consumer And Coverage Gates

Status: pending

Priority: P2

Suggested agent: package compatibility and test-infrastructure specialist

Dependencies: ERH-07, ERH-09, ERH-10

Primary ownership:

- `packages/express-response-handler/package.json`
- packed-consumer fixtures/tests for this package
- package Vitest coverage configuration
- `packages/express-response-handler/tsup.config.ts` only when a test proves a packaging defect

Finding:

Package tests import generated `.mjs` paths directly rather than resolving the package export map. CJS, root/subpath exports, default/named bindings, and declaration routing are not directly verified for this package. No coverage reporting protects the branch-heavy response and stream lifecycle.

References:

- `packages/express-response-handler/package.json:16-59`
- `packages/express-response-handler/test/middleware.test.ts:7`
- `packages/express-response-handler/test/response.test.ts:6-18`
- `packages/express-response-handler/test/csv-response.test.ts:5-6`
- `packages/access-router/test/packed-consumer-compatibility.test.ts:105-114`
- `packages/express-response-handler/tsup.config.ts:3-22`

Implementation requirements:

1. Pack this package and required workspace dependencies using the repository's production manifest rewrite, then install them into isolated consumers.
2. Exercise root and every documented subpath through ESM `import` and CJS `require`.
3. Compile strict NodeNext, Bundler, `.mts`, and `.cts` consumers with `skipLibCheck: false`.
4. Verify default/named exports and cross-entry response-wrapper recognition.
5. Add package coverage reporting and meaningful thresholds, emphasizing branches in `create-handler.ts` and `responses/csv.ts`.
6. Add explicit risk-case tests rather than using aggregate percentage as a substitute.

Acceptance criteria:

- Packed consumers compile and execute without workspace source resolution.
- Runtime branches and declaration branches resolve consistently in every supported module mode.
- Coverage includes every terminal request state, hook state, error format, CSV error source, and backpressure path introduced by this plan.
- Package tests fail when a documented export or subpath is removed or misrouted.

### Task ERH-12: Measure Root Import And CSV Security Policy

Status: pending

Priority: P3

Suggested agent: performance and security investigation specialist

Dependencies: ERH-07, ERH-11

Primary ownership:

- benchmark/security notes under `packages/express-response-handler/` or `docs/`
- packaging configuration only if evidence justifies a change
- CSV documentation

Finding:

The root handler imports CSV recognition and each entry is bundled independently with splitting disabled, so JSON-only consumers may load CSV formatter code. Separately, CSV formula prefixes (`=`, `+`, `-`, `@`) are emitted unchanged; whether neutralization belongs in this serializer depends on its trust model and spreadsheet use cases. Neither concern has evidence sufficient for a mandatory behavioral change yet.

References:

- `packages/express-response-handler/src/create-handler.ts:4`
- `packages/express-response-handler/src/index.ts:7-23`
- `packages/express-response-handler/src/responses/csv.ts:53-69`
- `packages/express-response-handler/tsup.config.ts:3-22`

Implementation requirements:

1. Record packed size, root import time, loaded module/code size, and representative memory before changing bundle structure.
2. Compare root JSON-only use with direct response/CSV subpaths in Node and one representative bundler.
3. Decide whether CSV formula neutralization is library responsibility, an opt-in processor, or documented application responsibility.
4. Do not add lazy loading or formula mutation without a measured benefit and explicit contract decision.

Acceptance criteria:

- Results are reproducible with documented commands and include a before/after budget if optimization proceeds.
- Any bundle change preserves CJS/ESM/subpath and wrapper-brand compatibility.
- CSV documentation explicitly states formula-injection responsibility and provides a safe pattern when user-controlled cells reach spreadsheet users.
- Deferred optimization records rationale and residual cost rather than remaining an undocumented hypothesis.

## Dependency And Parallelization Guidance

| Wave | Task   | Suggested owner             | May run in parallel with                                     |
| ---- | ------ | --------------------------- | ------------------------------------------------------------ |
| 1    | ERH-01 | test harness agent          | none initially                                               |
| 1    | ERH-02 | async pipeline agent        | none; owns the central hotspot                               |
| 1    | ERH-03 | Express compatibility agent | none while ERH-02 edits `create-handler.ts`                  |
| 2    | ERH-04 | error security agent        | ERH-06 after ERH-02, with separate primary files coordinated |
| 2    | ERH-05 | validation agent            | ERH-06, but not ERH-04 due to shared error/config code       |
| 3    | ERH-06 | stream safety agent         | ERH-04 or ERH-05 after ERH-02                                |
| 3    | ERH-07 | streaming performance agent | ERH-08 after prerequisites                                   |
| 4    | ERH-08 | hooks API agent             | ERH-07 after ERH-03                                          |
| 4    | ERH-09 | public API/docs agent       | ERH-08 if documentation ownership is explicitly split        |
| 4    | ERH-10 | declaration agent           | none until ERH-08 and ERH-09 settle public shape             |
| 5    | ERH-11 | packaging agent             | none until public and CSV contracts settle                   |
| 5    | ERH-12 | investigation agent         | final integration review preparation                         |

Shared hotspots:

- Serialize ERH-02, ERH-03, ERH-04, ERH-05, and ERH-08 changes to `src/create-handler.ts`.
- Serialize ERH-06 and ERH-07 changes to `src/responses/csv.ts`.
- Coordinate ERH-08, ERH-09, and ERH-10 documentation/public type edits before merging.
- Never run package test scripts concurrently because they rebuild shared `dist/` trees.

## Deferred Decisions Requiring Maintainer Input

1. Hook contract: recommended default is observational `void | Promise<void>` hooks, with `post` tied to a precisely documented dispatch or completion event. Choose transformation semantics only if a concrete consumer depends on returned hook values.
2. Typed 5xx errors: decide whether messages from explicit 5xx `HttpError` instances are public. Recommended production-safe default is redaction with original details retained server-side.
3. Internal public methods: confirm whether `handleResult`, `handlePromise`, and `EventState` have external released consumers before removal. No workspace runtime consumer was found.
4. CSV formula injection: decide whether neutralization is opt-in library behavior or application responsibility after ERH-12 documents use cases.

Only decision 1 blocks ERH-08. Decision 2 must be resolved during ERH-04. Decisions 3 and 4 can be deferred without blocking the P0/P1 remediation.

## Final Integration Task

### Task ERH-13: Independently Verify The Remediation

Status: pending

Priority: P1

Suggested agent: independent reviewer who did not implement ERH-02 through ERH-12

Dependencies: ERH-01 through ERH-11; ERH-12 may be completed or explicitly deferred

Primary ownership:

- review only across all changed package, sibling integration, test, and documentation files
- this task document for completion evidence and deferred-risk updates

Finding:

The remediation crosses request ownership, Express control flow, security defaults, stream lifecycle, declarations, a sibling package, and published artifacts. Local happy-path tests alone cannot establish that the combined contract is safe.

References:

- all findings and acceptance criteria in ERH-01 through ERH-12

Implementation requirements:

1. Review every acceptance criterion against runtime behavior, not only implementation shape.
2. Verify sync, promise, callback, route-sentinel, partial-response, hook, formatter, stream, abort, and client-disconnect paths.
3. Confirm no internal error detail or mutable orchestration state crosses an unintended public boundary.
4. Confirm request-controlled statuses, headers, and collection/stream inputs have validation or bounded resource behavior.
5. Confirm implementation, public declarations, README, `llms.txt`, website docs, and release notes agree.
6. Record completion evidence or exact blockers on each task; do not mark tasks complete based only on code changes.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/express-response-handler test` passes.
- Focused package ESLint passes.
- `pnpm --filter @web-ts-toolkit/express-json-router test` passes after any shared contract change.
- Direct packed ESM/CJS and strict declaration consumers pass.
- `pnpm build` passes.
- `pnpm test` passes serially.
- `pnpm lint` passes.
- `git diff --check` passes.
- Artifact build/verification is run for a release candidate, or a documented maintainer-approved reason explains why it is not applicable.
- Deferred work records rationale, owner, and residual security/performance risk.

## Definition Of Done

- Every P0 and P1 task is completed with regression and verification evidence.
- Every request reaches exactly one terminal outcome: response finish, intentional Express continuation, Express error delegation, or connection close after partial streaming.
- No supported thrown value, hook/provider failure, serializer failure, or stream failure creates an unhandled rejection or hung request.
- Unexpected server failures are redacted by default and valid HTTP status constraints are enforced centrally.
- CSV filename handling is standards-compliant and CSV production respects downstream backpressure with bounded buffering.
- Express route-control semantics and supported-version behavior are integration-tested.
- Public exports, declarations, examples, peer compatibility, and packed artifacts agree.
- Hook semantics and singleton mutability are explicit and tested.
- Test state is isolated; direct export-map, CJS/ESM, strict type, coverage, package, repository, and release checks pass as applicable.
- P2/P3 work not completed is marked `deferred` with rationale and residual risk, not left silently pending.
