# Express Response Handler Boundary Follow-Up

Created: 2026-09-08 07:07:33 (local time)

## Objective And Scope

Address residual lifecycle, CSV resource ownership, public-contract, and testability gaps in `packages/express-response-handler`. This is an executable plan for subagents, not authorization to implement every recommendation without resolving the explicit decisions below.

Related completed plan: `docs/tasks/20260809-100934-express-response-handler-review-remediation.md` (ERH-01 through ERH-13). This new phase records boundary cases missed by that completed plan; its historical completion evidence is not a current verification result. Existing root-import optimization and spreadsheet formula policy remain in `packages/express-response-handler/ERH-12.md` and are not duplicated here.

Non-goals: replace Express or the CSV formatter, introduce a plugin framework, redesign all response classes, silently change typed-5xx disclosure, or implement speculative optimizations. No package implementation was changed during this review.

## Coverage And Evidence

- Reviewed handler/error dispatch, CSV and success wrappers, public types, metadata/build entrypoints, existing declarations, README/installed documentation, lifecycle/CSV tests, packed-consumer harness, and the prior remediation record.
- Three read-only reviewers covered handler/errors, CSV/wrappers, and installed package contracts separately. Findings were deduplicated here; shared factory-inference findings are one task.
- Inline Node probes against existing generated output reproduced duplicate delegation, partial-pre-hook omission, skipped error hooks, raw `next(null)`, CSV cleanup failures, late destination errors, first-read cancellation, exhausted-source rereads, and direct-call failure omission. These used response doubles or Node writables, not a freshly built live HTTP test suite. Source inspection supports the corresponding control-flow findings.
- A diagnostic CSV probe with fixed-size cells, a non-retaining writable, forced GC, and an export kept active measured approximately 2.93 MB heap growth at 10,000 rows and 26.01 MB at 100,000 rows. This is preliminary evidence of retained abort-promise reactions, not a production budget or a committed benchmark. Reproduce under B-ERH-05.
- No fresh build, package test, lint, compiler fixture, pack/install, or full repository check was run during analysis. Existing generated output may be stale; implementation agents must first reproduce on fresh output. Full tests were unnecessary for writing this review plan.
- NodeNext default-import behavior is an investigation, not a compiler-confirmed failure. Generic writable process-error probes do not prove identical behavior for every Express socket implementation. No dependency vulnerability audit or exhaustive supported-version matrix was performed.
- Worktree was clean at review start. All document paths are repo-relative; generic temporary consumers may use `/tmp`.

## Priorities And Working Rules

- P1: request hangs, duplicate routing, unhandled asynchronous failures, unbounded export retention, or a public runtime/type mismatch that breaks valid callers. Prioritize these before usability work; no remote exploitability is asserted.
- P2: type fidelity, installed documentation, harness robustness, or maintainability gaps without a demonstrated P1 outcome.
- Each defect needs a regression that fails on fresh pre-fix output and passes afterward. Use deterministic gates, not timing sleeps, for races. Observe later Express error middleware as well as the first handler.
- Preserve generic-error redaction, original server-side diagnostics, explicit `next()`/`next('route')`/`next('router')`, and CJS/ESM cross-entry wrapper recognition.
- Prefer one private enforcement point for request ownership and one coordinated CSV lifecycle. Do not add exported orchestration methods or speculative compatibility aliases.
- Update types, README, website docs, `llms.txt`, and `CHANGELOG.md` together when their external contract changes. Do not edit generated `dist/` manually.
- Agents mark a task `in_progress` only after dependencies complete, and append changed paths, exact commands, results, and residual risks on completion. Use `blocked` with a named prerequisite when verification or a decision is unavailable; never mark a fix complete solely because it was written.

## Verification Commands

Run from the repository root with the workspace toolchain and dependencies installed (`pnpm install` if needed):

- Package gate: `pnpm --filter @web-ts-toolkit/express-response-handler test`. This rebuilds transitive dependencies and runs Vitest with coverage, including packed consumers.
- Focused lint: `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"`.
- Sibling integration: `pnpm --filter @web-ts-toolkit/express-json-router test` after handler/type changes.
- Final repository gates: `pnpm build`, `pnpm test`, `pnpm lint`, and `git diff --check`.
- For targeted iteration after a fresh serialized build, run `pnpm exec vitest run --config vitest.config.ts test/<affected-file>.test.ts` from `packages/express-response-handler`. Partial runs can fail aggregate coverage thresholds; they do not replace the full package gate.
- Packed checks must continue using the production manifest rewrite and isolated ESM/CJS and strict NodeNext/Bundler consumers with `skipLibCheck: false`. Registry access or a populated dependency cache is required by the current harness.

Never run package tests/builds concurrently: they write shared dependency `dist/` trees. Have one coordinator own all builds and test commands, even when edits are parallel. Final artifact build/verification is only required when producing an actual versioned release candidate; otherwise explicitly record that no release artifact is being produced.

## Tasks

### Task B-ERH-01: Enforce Request Ownership At Every Terminal Boundary

Status: completed

Kind: defect

Priority: P1; late failures can re-enter middleware after request ownership was transferred.

Suggested agent: Express lifecycle specialist

Dependencies: none

Primary ownership: `packages/express-response-handler/src/create-handler.ts`, internal state in `src/types.ts`, `test/middleware.test.ts`, and `test/lifecycle-safety.test.ts` within that package.

Finding and references: `src/create-handler.ts:408-418,433-439` forward errors after headers without checking cancellation; `terminalErrorBoundary` at lines 274-285 does not mark delegation, and `nextFn` at lines 377-391 does not know automatic sending already won. A handler can call `next(error)`, let downstream middleware respond, then reject and delegate again. A callback can also call `next` after automatic serialization. The existing late-rejection test at `test/middleware.test.ts:1300-1323` only watches an error handler that Express has already passed.

Requirements:

1. Enforce ownership consistently before every handler settlement, hook continuation, automatic send, and terminal delegation. Distinguish completion from intentional post-hook failure reporting.
2. Preserve callback-style manual responses and immediate explicit Express continuation. Ignore late handler outcomes after transfer, including sync throws after `next` and promise rejection after downstream headers.
3. Keep orchestration private. As part of the touched lifecycle, remove obsolete `nextError`, no-op rebuild plumbing, and no-op serialization callbacks only if proven unused; do not perform a broad rewrite merely for style.

Acceptance criteria: gated tests cover duplicate callbacks, late sync throws/rejections, a downstream partial write, automatic send followed by a delayed callback, and normal post-hook failure reporting. Later error middleware sees no stale handler failure; one terminal owner wins without suppressing intentional observability. Existing sentinel tests pass.

Verification: focused middleware/lifecycle regressions, package gate, focused lint, and sibling integration.

Completion evidence:

- Changed paths:
  - `packages/express-response-handler/src/types.ts` — `EventState` removed obsolete `nextError` (proven write-never: only read once, initialized once), added `reported` for intentional post-hook observability.
  - `packages/express-response-handler/src/create-handler.ts` — one private `claimSlot(event, 'canceled' | 'reported')` enforcement point; `delegateTerminalError` claims settlement for handler failures/terminal delegation; `reportHookObservation` claims reporting for post-hook failures (allowed after settlement, once); `nextFn`/`runLifecycle`/`routerFn` catch check settlement before headers; `dispatchError`/`dispatchValue` recheck after async pre-hooks and claim after successful auto-send; CSV pre-output fallback uses same-owner bypass when headers open; removed `noopRebuild` plumbing (only four call sites passed it, `updateHook` only invoked it) and `onSerialized` no-op (single call site passed `() => undefined`); removed `terminalErrorBoundary` without marking.
  - `packages/express-response-handler/test/middleware.test.ts` — new `Request ownership boundaries (B-ERH-01)` block (5 tests): duplicate `next(error)`, sync throw after `next()` with committed headers, rejection after downstream headers (deferred gate), auto-send then delayed `next(error)` (stored-callback gate), partial-write then stale rejection.
  - `packages/express-response-handler/test/lifecycle-safety.test.ts` — 2 tests: normal post-json failure reporting after auto-send (observability gate), single-owner post-json observation not displaced by delayed callback.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success.
  - `pnpm exec vitest run --config vitest.config.ts test/middleware.test.ts test/lifecycle-safety.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 2 files, 92 tests passed with fix.
  - Pre-fix proof: `git stash push -- packages/express-response-handler/src/create-handler.ts packages/express-response-handler/src/types.ts`, rebuild, same focused run — 3 failed pre-fix (`sync throw after next with committed headers`, `rejection after downstream headers`, `explicit next(error) after automatic send won`), 2 passed; `git stash pop` restored fix.
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 5 files, 128 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean.
  - `pnpm --filter @web-ts-toolkit/express-json-router test` — 2 files, 33 tests passed.
- Results: later error middleware sees only first owner; post-hook observability still delivered once; sentinel redaction, `next()`/`next('route')`/`next('router')`, and cross-entry wrapper tests pass (in 128). No `dist/` edits, no `CHANGELOG.md` update. No release artifact produced.
- Residual risks: async manual `res.*` response completed after `finalize` (headers open at finalize, no settlement claim) followed by a delayed `next()` is still forwarded — kept to preserve immediate continuation without `res` tracking in `nextFn`; not in acceptance. CSV pre-output error fallback bypasses settlement by design (same owner, headers open); full hook routing for fallbacks is B-ERH-03 scope. Falsy/sentinel throw normalization untouched (B-ERH-02).

### Task B-ERH-02: Keep Arbitrary Thrown Values On The Error Channel

Status: completed

Completion evidence:

- B-ERH-01 status verified as `completed` before starting; its ownership helpers (`claimSlot`, `delegateTerminalError`, `reportHookObservation`, `EventState.reported`) were preserved and reused, with no change to B-ERH-01 scope beyond calling the new normalizer from its two terminal helpers.
- Changed paths:
  - `packages/express-response-handler/src/create-handler.ts` — added private `describeTerminalFailure`/`toTerminalError` helpers (ordinary `Error` keeps identity; all other thrown values wrapped in `Error` with original preserved as `cause`); `delegateTerminalError` and `reportHookObservation` now forward `toTerminalError(value)`; explicit `nextFn` left untouched so caller-supplied `next()`/`next('route')`/`next('router')` keep their control contract. No change to `src/error-format.ts` (no shared helper needed), no exported orchestration, no `dist/` edits, no `CHANGELOG.md` update.
  - `packages/express-response-handler/test/lifecycle-safety.test.ts` — new `Arbitrary thrown values stay on the error channel (B-ERH-02)` block (42 tests): parameterized post-write sync throws, post-write rejections, post-json rejections, and provider throws over `null`, `undefined`, `false`, `0`, `''`, `'route'`, `'router'`, symbol, plain object, string-error; plus ordinary-Error identity and thrown-`'route'`-vs-explicit-`next('route')` tests.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild).
  - Pre-fix proof: temporarily restored raw `next(terminalError)`/`next(observation)` forwarding on top of B-ERH-01 baseline, rebuilt, `pnpm exec vitest run --config vitest.config.ts test/lifecycle-safety.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 40 failed, 19 passed pre-fix (falsy/sentinel throws hit regular downstream, symbols/objects reached error middleware as non-Errors); restored fix afterwards.
  - `pnpm exec vitest run --config vitest.config.ts test/lifecycle-safety.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 1 file, 59 tests passed with fix.
  - `pnpm exec vitest run --config vitest.config.ts test/middleware.test.ts test/lifecycle-safety.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 2 files, 134 tests passed.
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 5 files, 170 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean (after `_next` unused-param fix).
  - `pnpm --filter @web-ts-toolkit/express-json-router test` — 2 files, 33 tests passed.
  - `git diff --check` — clean.
- Results: terminal falsy/sentinel/symbol/object failures now reach error middleware exactly once as `Error` with `cause` === original (identity preserved for `Error`), regular downstream middleware not invoked; explicit `next('route')` still routes to the next route while thrown `'route'` stays on the error channel. Generic-error redaction, formatted-body behavior, sentinel routing, and CJS/ESM wrapper recognition preserved (in 170 package tests + 33 sibling tests). No release artifact produced.
- Residual risks: provider-throw normalization displaces the original handler error (pre-existing `senderFailure` precedence, unchanged); terminal `Error` messages for non-Errors are diagnostic only (e.g. `'null'`, `'undefined'`, symbol text, `''`) and not part of the redacted body contract; `undefined`-rejection fallback precedence (`hookErr === undefined ? err : hookErr`) retained before normalization.

Kind: defect

Priority: P1; falsy failures and sentinel strings can bypass Express error middleware.

Suggested agent: error-boundary specialist

Dependencies: B-ERH-01

Primary ownership: `packages/express-response-handler/src/create-handler.ts`, `src/error-format.ts` only if a shared normalization helper is needed, and `test/lifecycle-safety.test.ts`.

Finding and references: raw forwarding at `src/create-handler.ts:274-299,408-439` allows thrown `null`, `false`, `0`, or `''` to become ordinary Express continuation, and thrown `'route'`/`'router'` to become routing instructions. `normalizeThrownError` protects formatted bodies, not terminal delegation. Existing arbitrary-throw body tests do not establish this boundary.

Requirements:

1. Normalize thrown/rejected terminal failures to an Express-recognized error while preserving the original thrown value, for example as `cause`. Preserve ordinary Error identity where possible.
2. Do not normalize explicit caller-supplied `next(...)` into a different control contract.

Acceptance criteria: parameterized provider failures, post-hook rejections, and post-write throws/rejections with falsy values, symbols, objects, and sentinel strings reach error middleware exactly once, retain diagnostic values, and do not invoke regular downstream middleware. Explicit sentinels still route correctly.

Verification: focused lifecycle regressions, package gate, focused lint, and sibling integration.

### Task B-ERH-03: Route Hook And Serialization Failures Through One Error Lifecycle

Status: completed

Completion evidence:

- B-ERH-01 status verified as `completed` and B-ERH-02 status verified as `completed` before starting; ownership helpers (`claimSlot`, `delegateTerminalError`/`reportHookObservation`, `toTerminalError`, `EventState.reported`) preserved and reused with no change to B-ERH-01/02 scope.
- Changed paths:
  - `packages/express-response-handler/src/create-handler.ts` — private `dispatchValue` rewrite only: `undefined` no-return/manual exclusion before any success hook (claims sync manual); `headersSent` owned-partial delegation before send and rechecked in every async continuation (`runSender`, `preJson` success/failure, fallback send); bounded `runFallbackLifecycle`/`sendFallbackFormatted` for serialization/`preJson`/CSV-before-output failures (one `preError` with original, one redacted body via `sendBaseError`, one finish-timed `postError`, never `postJson`, never re-enters failing `preError`/provider); CSV same-owner bypass via `autoSendClaimed` + `bypassEvent` with `fallbackOccurred` guard suppressing previously scheduled `postJson` on fallback finish.
  - `packages/express-response-handler/test/lifecycle-safety.test.ts` — new `Hook and serialization error lifecycle (B-ERH-03)` block (8 tests): circular, BigInt, rejected `preJson` (each one redacted 500 + one `preError` + one finish-timed `postError` + zero `postJson` + error middleware never reached); CSV pre-output processor failure (same, no `postJson`); manual sync and manual callback (zero `preJson`/`postJson`, 200, no unsolicited 500, error middleware never reached); partial-write then async `preJson` success (delegates to error middleware, zero second `send`); partial-write race then rejected `preJson` (one `preError` with original, error middleware once, zero second `send`, zero `postJson`).
  - `packages/express-response-handler/README.md`, `website/docs/packages/express-response-handler.md`, `packages/express-response-handler/llms.txt` — hook contract updates only: `preJson` skipped for `undefined`/manual ownership; `postJson` never for fallback/manual; fallback lifecycle (one `preError` with original, redacted body, one finish-timed `postError`, no recursion, no `postJson`); owned partial delegation via `next(err)` without second body. No `dist/` edits, no `CHANGELOG.md` update.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild).
  - Pre-fix proof: with fix stashed (old `create-handler.ts`), `pnpm exec vitest run --config vitest.config.ts test/lifecycle-safety.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 8 failed (all new B-ERH-03 block: circular/BigInt/rejected-preJson 0 preError/postError, CSV fallback postJson + 0 hooks, manual 1 preJson, partial-success timeout/hang, partial-reject 0 preError), 59 passed; restored fix afterwards (updated partial-reject race still fails pre-fix via 0 preError; full stash revert showed 48 failed including B-ERH-02 baseline, confirming shared helper dependency).
  - `pnpm exec vitest run --config vitest.config.ts test/lifecycle-safety.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 1 file, 67 tests passed with fix.
  - `pnpm exec vitest run --config vitest.config.ts test/middleware.test.ts test/lifecycle-safety.test.ts test/csv-response.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 3 files, 157 tests passed.
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 5 files, 178 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean.
  - `pnpm --filter @web-ts-toolkit/express-json-router test` — 2 files, 33 tests passed.
  - `git diff --check` — clean.
- Results: partial-write/pre-hook paths terminate via error middleware with zero second `send`; circular/BigInt/rejected-`preJson`/CSV-pre-output each produce one `{message:'Internal Server Error'}` with secret only in hooks, one `preError` (original identity), one finish-timed `postError`, zero `postJson`; manual sync/callback get zero success hooks and no 500; ordinary hook behavior intact (in 178 package + 33 sibling tests). Redaction, diagnostics (`cause`), explicit `next()`/`next('route')`/`next('router')`, CJS/ESM recognition preserved. No release artifact produced.
- Residual risks: success value with `headersSent` at entry delegates terminal with the value itself (`toTerminalError` wraps non-Errors, `cause` = data) for observability — diagnostic message is not part of redacted body contract; CSV post-output (after-output-started) failures still terminate via `destroy`, not via fallback error lifecycle (B-ERH-04 scope); provider-throw precedence during fallback displaces original send (pre-existing `senderFailure` precedence, unchanged); `undefined`-rejection fallback precedence retained.

Kind: defect

Priority: P1; async hook races can silently leave partial responses open, while fallback errors lose logging hooks.

Suggested agent: hook/error integration specialist

Dependencies: B-ERH-02

Primary ownership: `packages/express-response-handler/src/create-handler.ts`, hook/lifecycle tests, and hook documentation.

Finding and references: `sendBaseError` silently skips committed headers at `src/create-handler.ts:212-215`; async pre-hook continuations at lines 313-317 and 367-369 can reach it after a scheduled partial write. `dispatchValue` lines 335-340 bypasses `dispatchError`, so successful fallback 500s for circular JSON, BigInt, and rejected `preJson` bypass both error hooks. `preJson` runs before no-return/manual-response exclusion at lines 190-196 and 367-370, contrary to `README.md:119`. Existing no-return coverage checks only `postJson`.

Requirements:

1. Recheck ownership and committed headers when asynchronous continuations settle. Delegate owned partial-response failures rather than silently skipping them.
2. Send success-path serialization/pre-hook/CSV-before-output failures through a bounded error lifecycle with original errors visible to error hooks. Never recursively re-enter a failing error hook/provider.
3. Skip success hooks when a handler returns `undefined` or has already taken manual response ownership. Ensure a failed CSV attempt does not later run `postJson` on its fallback JSON error's finish event.

Acceptance criteria: gated partial-write/pre-hook tests terminate through error middleware without a second body; circular/BigInt JSON and rejected pre-hooks produce one redacted error with one `preError` and one finish-timed `postError`; no `postJson` runs on fallback errors. Manual synchronous/callback responses receive no success hooks or unsolicited 500. Existing ordinary hook behavior remains intact.

Verification: focused middleware/lifecycle and CSV fallback tests, package gate, focused lint, and sibling integration.

### Task B-ERH-04: Own CSV Failures Through Destination Termination

Status: completed

Completion evidence:

- Changed paths:
  - `packages/express-response-handler/src/responses/csv.ts` — `closeActiveIterator` now contains sync `return()` throws in try/catch and observes async rejections; detached pump observed via `void pump().then(undefined, () => undefined)`; idempotent `cleanup` (`cleaned` flag) retains `res` error/close/finish ownership through actual destruction (no cleanup before `destroy`, no `stream 'end'` cleanup, `finished` only on `res 'finish'`); `handleClose` fails premature close then cleans (in-flight close needs immediate cleanup), terminal close cleans; pre-output path destroys formatter, cleans, and contains throwing `onBeforeOutputError`; no `dist/` edits, no `CHANGELOG.md` update.
  - `packages/express-response-handler/test/csv-response.test.ts` — removed `destroy` override; real `Writable` lifecycle (`CsvTestWritable`/`FailingWriteWritable`/`DelayedFailingWriteWritable`/`DelayedFinalWritable`/`BlockingWritable`) with error/close/finish observation; deterministic gates (`close`/`finish` promises, write-call/backpressure gates, no sleeps for races); temp process observers (`unhandledRejection`/`uncaughtException`) restored in teardown; new `CSV destination termination (B-ERH-04)` block (9 tests: sync-throwing `return`, rejecting `return`, throwing generator `finally`, delayed `_write`, delayed `_final`, premature close while flushing, throwing pre-output owner, success listener-removal/end-once, Express socket disconnect); generic-writable vs socket-specific distinguished in comments/names.
- Exact commands (never concurrent builds/tests):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild).
  - Pre-fix proof: `git stash push -- packages/express-response-handler/src/responses/csv.ts`, rebuild, `pnpm exec vitest run --config vitest.config.ts test/csv-response.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 4 failed pre-fix (`sync-throwing return` timeout, `throwing generator finally` timeout, `premature close while flushing`, `throwing pre-output owner`), 20 passed; `git stash pop` + rebuild restored fix.
  - `pnpm exec vitest run --config vitest.config.ts test/csv-response.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 1 file, 24 tests passed with fix.
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 5 files, 187 tests passed, coverage thresholds met (csv.mjs 92.19% stmts / 80.51% branches / 85.71% funcs / 93.89% lines).
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean (after `no-unsafe-finally` disable for intentional test).
  - `git diff --check -- packages/express-response-handler/src/responses/csv.ts packages/express-response-handler/test/csv-response.test.ts` — clean.
- Results: throwing-`finally`/sync-throwing/rejecting-`return` preserve initiating failure (`errors == [initiating]`), terminate via real `close`, no unhandled/uncaught; later-row processor, delayed `_write`/`_final`, premature-close abort all observable via destination `error` + single `close`; throwing pre-output owner contained with original still delivered; success ends once (`finishCount 1`, `writableEnded true`), owned listeners removed; Express socket abort leaves server healthy. B-ERH-01 (`claimSlot`/`delegateTerminalError`/`reportHookObservation`), B-ERH-02 (`toTerminalError`/`cause`), B-ERH-03 (fallback lifecycle/`preError`/`postError`/manual exclusion) preserved — untouched files still pass in 187 package tests. No release artifact produced.
- Residual risks: first-read gated disconnect and empty-iterator re-read retention are B-ERH-05 scope (no first-read abort race added); destinations without `on`/`off` have no terminal event to drive retained-ownership cleanup (single formatter-listener retention; all production/tested paths are evented); `stream.destroy()`/`res.destroy()` sync throws are not separately contained (matches pre-existing contract; iterator/owner containment is the required path).

Kind: defect

Priority: P1; iterator cleanup and late writable errors can escape as process-level errors.

Suggested agent: Node stream lifecycle specialist

Dependencies: none

Primary ownership: `packages/express-response-handler/src/responses/csv.ts` and `test/csv-response.test.ts`.

Finding and references: `closeActiveIterator` at `src/responses/csv.ts:138-144` evaluates `iterator.return()` before `Promise.resolve`, so a synchronous cleanup throw interrupts `fail`. The detached pump at line 238 can reject unobserved. `cleanup` removes destination error ownership before `destroy(error)` (lines 131-174), and formatter `end` removes listeners before destination finalization (line 196). `finished` is set before destination finish (lines 227-229). The writable test helper at `test/csv-response.test.ts:22-25` overrides `destroy`, masking real Node error/close behavior.

Requirements:

1. Contain synchronous and asynchronous iterator cleanup failures without displacing the initiating failure or preventing stream termination. Observe every asynchronous pump/cleanup outcome.
2. Retain error/close ownership through actual destination completion/destruction, with idempotent cleanup and no listener leaks. Do not equate formatter end with destination finish.
3. Use real Node writable lifecycle tests without replacing destruction, plus an Express disconnect regression. Keep generic writable findings distinguished from socket-specific behavior.

Acceptance criteria: throwing generator `finally`, synchronously throwing and rejecting `return`, later-row processor failure, delayed `_write`/`_final` failure, and premature close while flushing terminate deterministically with no unhandled rejection or uncaught error. Original failures stay observable; successful exports remove owned listeners and end once.

Verification: focused CSV regressions with temporary process observers restored in teardown, package gate, and focused lint.

### Task B-ERH-05: Bound CSV Cancellation State And Respect Iterator Completion

Status: completed

Kind: defect

Priority: P1; retained per-row cancellation state grows with export length, and boundary reads can resume canceled work or hang empty exports.

Suggested agent: streaming resource/performance specialist

Dependencies: B-ERH-04

Primary ownership: `packages/express-response-handler/src/responses/csv.ts`, CSV tests, and a focused reproducible measurement fixture or note.

Finding and references: `src/responses/csv.ts:126-129,191,218` races every iteration against one pending abort promise, retaining reactions for the duration of an active export. The first `next()` at line 205 has no cancellation coordination or post-await failure guard; it can process/write after disconnect. An initial `{ done: true }` still enters the loop at lines 217-218 and reads the exhausted source again. Existing backpressure tests at `test/csv-response.test.ts:291-314` bound queued rows, not retained state over successfully drained rows.

Requirements:

1. Coordinate cancellation without accumulating one pending reaction per consumed row. Preserve downstream backpressure and one-time iterator cleanup.
2. Apply cancellation/ownership checks to the first read and every later continuation. Stop reading immediately when any iterator result reports completion.
3. Record the limits of canceling an arbitrary unresolved iterator promise: do not claim the library can cancel external I/O without a cooperative source contract.

Acceptance criteria: disconnect before a gated first read resolves/rejects causes no later processor call, header assignment, piping, or write. An empty custom iterator whose second call throws or never settles is read exactly once and finishes. A reproducible fixed-row, non-retaining-sink measurement compares increasing active-export row counts, demonstrates removal of linear cancellation bookkeeping retention, and records environment, GC method, results, and a justified tolerance. Existing 100,000-row backpressure and cleanup tests pass.

Verification: focused CSV regressions and bounded measurement, package gate, and focused lint. Do not impose a machine-dependent wall-clock speed assertion.

Completion evidence:

- B-ERH-04 status verified as `completed` before starting; its destination-termination work (`cleaned` idempotency, sync/async iterator-cleanup containment, retained error/close/finish ownership, real-Writable tests) is preserved untouched — no change to B-ERH-04 scope.
- Changed paths:
  - `packages/express-response-handler/src/responses/csv.ts` — removed the shared pending abort promise and every per-row `Promise.race([iterator.next(), abortSignal])`; cancellation is now a `failed` flag plus a bounded `abortWaiters` set holding at most the single active drain waiter (woken by `fail()`, removed on drain/abort), so no per-row reaction accumulates. `failed` is checked after the first read, after every loop read, after every processor call, and before header assignment/piping/write; an initial `{done:true}` ends the stream without a second read. Cooperative-source limitation documented in code: a pending `next()` cannot be cancelled, abort only prevents subsequent work after it settles. Backpressure still observed via `drain`; one-time iterator cleanup retained. No `dist/` edits, no `CHANGELOG.md` update.
  - `packages/express-response-handler/test/csv-cancellation.test.ts` (new, 7 tests) — disconnect before gated first-read resolve/reject causes zero processor calls, header assignments, or writes; empty iterator with throwing/never-settling second read is read exactly once and finishes; synchronous re-entrant disconnect inside the processor stops before headers/pipe/write; slow-sink drain backpressure resumes and finishes; bounded retention measurement.
  - `packages/express-response-handler/test/csv-retention-measure.mjs` (new) — reproducible fixture: fixed 32-byte cells, non-retaining discarding sink, export held active behind a gate, heap sampled with forced GC (`global.gc()` x3, `node --expose-gc`) at 10k vs 100k active rows. Tolerance 5 MB for the 90k delta (~55 bytes/row, under a quarter of the pre-fix ~260 bytes/row slope) absorbs GC noise without hiding linear retention. No wall-clock assertion.
- Exact commands (never concurrent builds/tests):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success.
  - Pre-fix proof: `git stash push -- packages/express-response-handler/src/responses/csv.ts`, rebuild, `pnpm exec vitest run --config vitest.config.ts test/csv-cancellation.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 4 failed / 1 passed pre-fix (gated resolve/reject, never-settling empty reread timeout, retention); standalone retention pre-fix: delta 23,172,448 bytes, `pass:false` (matches the review probe's ~23 MB slope); `git stash pop` + rebuild restored fix.
  - Post-fix retention: `node --expose-gc test/csv-retention-measure.mjs` — env node v26.7.0 linux x64, delta 77,928 bytes vs 5,242,880 tolerance, `pass:true` (~0.9 bytes/row, flat).
  - `pnpm exec vitest run --config vitest.config.ts test/csv-cancellation.test.ts test/csv-response.test.ts --coverage.enabled=false` — 2 files, 31 tests passed (includes existing 100k-row backpressure/cleanup tests).
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 6 files, 194 tests passed, coverage thresholds met (csv.mjs 91.76% stmts; the two added drain/re-entrant tests lifted it from 89.41% vs the 90% per-file gate).
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean (after `prefer-const` fix). `git diff --check` — clean.
- Results: disconnects before/during reads do no later work; empty sources are never reread; active-export heap is flat across 10k→100k rows; all prior CSV/backpressure/cleanup behavior intact (194 package tests). No release artifact produced.
- Residual risks: an arbitrary unresolved `next()` cannot be preempted — prompt cancellation of a stuck read needs a cooperative source (documented, not claimed); the `writeRow`-entry, drain-executor-entry, and post-contentDisposition `failed` guards are synchronously unreachable and covered by reasoning rather than tests (a re-entrant `close` emitted from user code is the path they protect); destinations without `on`/`off` still have no terminal event to drive cleanup (B-ERH-04 residual, unchanged).

### Task B-ERH-06: Define Direct CSV Streaming Error Ownership

Status: completed

Completion evidence:

- Contract choice recorded before signature work (no breaking restriction, no maintainer approval needed): minimal runtime-safe fallback. `streamCsv(res, onBeforeOutputError?)` keeps its optional-owner signature; JSDoc on `streamCsv` in `src/responses/csv.ts` documents the three outcomes (pre-output with owner / without owner / post-output). No `src/create-handler.ts` change was necessary — the handler already supplies the owner and its bounded fallback lifecycle is untouched.
- Changed paths:
  - `packages/express-response-handler/src/responses/csv.ts` — pre-output `fail` without an owner now deterministically destroys the destination with the normalized failure (or ends when `destroy` is unavailable), retaining error/close/finish ownership until actual close/finish so the failure is observable via `error` + `close`; pre-output `fail` with an owner still invokes it exactly once (owner terminates; handler renders one redacted JSON), and a throwing owner is contained then the destination is destroyed with the original failure (local noop `error` observer added after `cleanup()` released ownership); non-`Error` failures now wrapped with original as `cause`. Post-output path unchanged (always destroys). No `dist/` edits, no `CHANGELOG.md` update (user constraint).
  - `packages/express-response-handler/test/csv-direct-errors.test.ts` (new, 8 tests) — invalid filename / failed first read / first-row processor throw each with and without owner (without: `errors==[original]`, `closeCount 1`, headers empty, no unhandled/uncaught; with: owner seen once, owner `end()`s, `finishCount 1`, zero destination errors); throwing owner contained with `errors==[original]` + close; non-Error first-read wrapped with `cause`.
  - `packages/express-response-handler/test/csv-response.test.ts` — B-ERH-04 throwing-owner test updated to the B-ERH-06 contract (was `errors==[]` with destination left open; now `errors==[original]`, `closeCount 1`, awaited close). All other B-ERH-04/05 tests untouched.
  - `packages/express-response-handler/README.md`, `website/docs/packages/express-response-handler.md`, `packages/express-response-handler/llms.txt` — direct-`streamCsv` ownership paragraph/line only (with-owner owns termination, without-owner deterministic destroy, throwing owner contained, post-output always destroys, non-Error `cause`).
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild; `streamCsv` signature still `(res, onBeforeOutputError?) => void` in `dist/responses/csv.d.ts`).
  - Pre-fix proof: `git stash push -- packages/express-response-handler/src/responses/csv.ts`, rebuild, `pnpm exec vitest run --config vitest.config.ts test/csv-direct-errors.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 5 failed / 3 passed pre-fix (all three no-owner cases + throwing-owner + cause case; the three non-throwing with-owner cases pass pre-fix since the test owner terminates); `git stash pop` + rebuild restored fix.
  - `pnpm exec vitest run --config vitest.config.ts test/csv-direct-errors.test.ts test/csv-response.test.ts test/csv-cancellation.test.ts --coverage.enabled=false` — 3 files, 39 tests passed with fix (existing handler 500-JSON fallback + post-output destroy + cancellation tests intact).
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 7 files, 202 tests passed, coverage thresholds met (csv.mjs 91.25% stmts), packed consumers included.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean. `git diff --check` on touched paths — clean.
- Results: every pre-output failure now has exactly one documented observable outcome (owner callback once, or fallback `error`+`close`) with no open destination and no process-level error; normal-handler formatted errors before output (control-char filename / first-row processor → single 500 JSON, existing tests) and post-output destroy preserved; throwing owner contained. B-ERH-01 (`claimSlot`/ownership), B-ERH-02 (`cause` style followed), B-ERH-03 (handler fallback lifecycle untouched, `create-handler.ts` unmodified), B-ERH-04 (termination/cleanup idempotency retained, one test expectation advanced to the new contract), B-ERH-05 (bounded abort flag/waiters, first-read/empty-reread guards untouched) preserved. No release artifact produced.
- Residual risks: with-owner direct calls still rely on the owner to terminate (documented; handler owner always does via fallback JSON); `res` without `destroy` falls back to `end()` so a non-Error `cause` is only observable via finish/close, not an `error` event; `res.destroy()` sync throws remain uncontained (B-ERH-04 residual, unchanged).

Kind: defect

Priority: P1; public direct calls can silently abandon failures without ending a response.

Suggested agent: CSV public-contract specialist

Dependencies: B-ERH-03, B-ERH-05

Primary ownership: `packages/express-response-handler/src/responses/csv.ts`, its public type/consumer tests, CSV docs, and the caller in `src/create-handler.ts` only as necessary.

Finding and references: `streamCsv` has an optional failure callback and returns void at `src/responses/csv.ts:119`; pre-output `fail` only optionally invokes the callback and returns at lines 168-170. Direct `streamCsv(res)` with an invalid filename, failed first read, or first-row processor throw therefore neither exposes the error nor terminates the destination. The main handler supplies a callback, so this is an alternate public entry path.

Requirements:

1. Record a contract choice before changing signatures: either require an explicit error owner, or provide an observable, deterministic fallback for callback-free calls. Prefer a minimal runtime-safe fallback unless a maintainer chooses a breaking API restriction.
2. Preserve normal-handler formatted errors before output and stream termination after output. Include a throwing error-owner callback in failure containment tests.

Acceptance criteria: each pre-output failure with and without an error callback has exactly one documented observable outcome and no open destination or process-level error. Direct-use declarations/docs match runtime, and any breaking signature change has release notes and maintainer approval.

Verification: focused CSV and handler fallback tests, packed consumers, package gate, and focused lint.

### Task B-ERH-07: Align Handler Call Shapes And Preserve Factory Payload Types

Status: completed

Completion evidence:

- Decision recorded (no breaking runtime change, no approval needed): accurately type the shipped length-dependent behavior; input-shape consistency (`[fn] -> [router]`) deferred to release notes/maintainer approval. Audit: workspace callers use single-fn, variadic-multi, and fixed multi-array (all unchanged shapes); the one dynamic-array caller (`express-json-router/src/index.ts:353` spreads `[...middlewares, ...routeCallbacks]` into `handleResponse` and forwards the result to Express, which accepts a function or an array) works under either contract. External callers doing `.map()`/length checks on singleton-array results would break if runtime changed, so runtime is untouched.
- Changed paths:
  - `packages/express-response-handler/src/types.ts` — `HandleResponse` rewritten to 8 overloads: single-fn -> single; `readonly []` -> `never` (empty array throws at runtime); `readonly [Middleware]` -> single (singleton-array length-dependent runtime); fixed `>=2` tuple -> array; general `readonly Middleware[]` -> `Router | Router[]` union (dynamic length, empty throws); `()` -> `never`; fixed variadic `2+` -> array; general variadic spread -> union. Contract-choice comment documents the audit and deferral. Generics per overload preserve Params/ResBody/ReqBody/ReqQuery/Locals/Return inference.
  - `packages/express-response-handler/src/http-response.ts` — payload-bearing success factories now use explicit generic inference (`ok/created/accepted/nonAuthoritativeInfo/resetContent/partialContent/multiStatus/alreadyReported/imUsed/json` as `<T>(data: T) => new X<T>(data)`); error factories and `noContent`/`csv` untouched.
  - `packages/express-response-handler/src/create-handler.ts` — `normalizeMiddlewareList` and `handleResponse` impl accept `readonly MiddlewareFunction[]` (tuple overloads); singleton unwrap copies (`[...nested]`) since readonly is not assignable to the mutable working array. No runtime behavior change.
  - `packages/express-response-handler/test/response.test.ts` — new `Handler call shapes (B-ERH-07)` block (8 tests): single -> function; singleton array -> single function (not array); multi array / variadic multi -> arrays; empty array + empty variadic throw; dynamic spread/array resolve by runtime length; singleton-array serves traffic; factory payloads (`ok`/`json`/`created`) serialize with retained data.
  - `packages/express-response-handler/test/packed-examples.test.ts` — packed ESM/CJS runtime now asserts singleton -> single, multi/variadic -> arrays, spread singleton/pair shapes, empty array/variadic throw, and `ok`/`json` payload retention; strict NodeNext/Bundler fixtures assert single/singleton -> `RequestHandler`, multi/variadic -> `RequestHandler[]` (with `@ts-expect-error` cross-assignments), empty shapes are `never` (via `Equals<..., never>`), dynamic array/spread narrow via `Array.isArray`, and `ok`/`json` payload fields read without casts while `.nonexistent` fails compilation.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild; `dist` shows union overloads and `<T>(data: T)` factories).
  - Pre-fix proof: `git stash push -- packages/express-response-handler/src/types.ts packages/express-response-handler/src/http-response.ts packages/express-response-handler/src/create-handler.ts`, rebuild, `pnpm exec vitest run --config vitest.config.ts test/packed-examples.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — strict tsc fixture FAILED pre-fix (`tsc -p tsconfig-nodenext.json` error, 1 failed / 2 passed), runtime consumers passed (runtime intentionally preserved); `git stash pop` + rebuild restored fix.
  - `pnpm exec vitest run --config vitest.config.ts test/response.test.ts test/middleware.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 2 files, 101 tests passed.
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 7 files, 210 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean (after removing unused generics from the `readonly []` overload).
  - `pnpm --filter @web-ts-toolkit/express-json-router test` — 2 files, 33 tests passed.
  - `git diff --check` — clean.
- Results: packed runtime + strict declarations agree for single, singleton-array, multi-array, empty-array, and variable-length spread; `HttpResponse.ok/json/created` payload fields typecheck without casts and nonexistent fields fail compilation; request/body/query/locals inference and `isResponse`/`isCSVResponse` cross-entry recognition intact (in 210 package + 33 sibling tests). B-ERH-01/02/03 ownership, error-channel, and fallback lifecycle plus B-ERH-04/05/06 CSV work preserved — touched lifecycle files pass in the full gate. No `dist/` edits, no `CHANGELOG.md` update. No release artifact produced.
- Residual risks: empty inputs are typed `never` but still callable (returns `never` rather than a no-overload error) because the general dynamic overloads must stay callable for legitimate dynamic arrays; misuse is caught only if the `never` result is used, plus runtime throws. Singleton-array unwrap changes nothing at runtime but callers relying on the old (incorrect) array type will see new compile errors guiding them to the single-function shape.

Kind: defect

Priority: P1 for singleton-array runtime mismatch; payload inference is an associated P2 API-accuracy fix.

Suggested agent: TypeScript API specialist

Dependencies: B-ERH-03, B-ERH-06

Primary ownership: `packages/express-response-handler/src/types.ts`, `src/http-response.ts`, `src/create-handler.ts:444-448`, focused response tests, and `test/packed-examples.test.ts`.

Finding and references: the array overload at `src/types.ts:84-93` always promises an array, but `handleResponse` at `src/create-handler.ts:444-448` returns one function for a singleton array. `.map()` type-checks and fails at runtime. The variadic overload also accepts empty/variable-length lists without describing runtime rejection or singleton output. Payload-bearing factories at `src/http-response.ts:45-55,95` use generic `ConstructorParameters`, emitting `OK<unknown>` and equivalent results rather than retaining the payload type preserved by direct wrapper constructors.

Requirements:

1. Record whether array input should consistently return an array or the declaration must reflect current length-dependent output. Recommended contract is input-shape consistency, but it changes shipped singleton-array behavior and requires release notes/approval. Audit workspace callers before choosing.
2. Cover single-function, singleton-array, multi-array, empty-array, and variable-length spread contracts without pretending compile-time guarantees exist for dynamic lengths.
3. Give payload-bearing success factories explicit generic inference, including `json`, without changing error factories or adding payload semantics to `NoContent`.

Acceptance criteria: packed runtime and strict declaration fixtures agree for all call shapes; typed factory payload fields work without casts and nonexistent fields fail compilation. Existing Express request/body/query/locals inference and wrapper-brand recognition remain intact.

Verification: response/middleware regressions, packed strict ESM/CJS fixtures, package gate, focused lint, and sibling integration.

### Task B-ERH-08: Verify ESM Default-Import Declaration Routing

Status: completed

Kind: investigation

Priority: P2; current declaration routing may misrepresent the singleton for NodeNext consumers.

Suggested agent: installed declaration compatibility specialist

Dependencies: B-ERH-07

Primary ownership: `packages/express-response-handler/package.json`, `tsup.config.ts` if justified, and `test/packed-examples.test.ts`.

Finding and references: all export entries at `package.json:19-49` select unconditional `.d.ts` types although `.d.mts` graphs are emitted and the package is not module-typed. Existing `.mts` fixtures at `test/packed-examples.test.ts:283-305` only access default-import members also available on the module namespace, not singleton-only hooks/provider. The suspected compiler consequence has not been reproduced.

Requirements:

1. Bound the investigation to root and all four subpaths through the production-rewritten packed manifest, strict NodeNext `.mts`/`.cts`, and Bundler mode.
2. Assign the default import to `ExpressResponseHandler` and access/set `preJson` and `errorMessageProvider`; record diagnostics and actual declaration resolution.
3. Conclude implement, defer, or no action with evidence. If a mismatch is proven, specify conditional `import.types`/`require.types` routing preserving runtime targets, and record a separately actionable implementation follow-up before expanding this investigation.

Acceptance criteria: committed fixture/evidence answers whether installed default and named imports match runtime in each module mode; any recommended metadata change accounts for production path rewriting and all subpaths. A compiler pass with the correct singleton assertions can complete this task without runtime changes.

Verification: packed fixture reproduction, package gate after fixture edits, and focused lint.

Completion evidence:

- Conclusion: implement (implemented within this task, evidence-driven, metadata-only). The suspected mismatch was reproduced through the production-rewritten packed manifest; the specified conditional routing was applied to root + all four subpaths with runtime targets byte-identical. No separate implementation follow-up remains for this package: sibling packages (`utils`, `http-errors`, `express-json-router`) already used this exact routing shape, so no investigation expansion was needed. `tsup.config.ts` needed no change (both `.d.ts`/`.d.mts` graphs were already emitted).
- Pre-fix proof (fixture additions only, `package.json` untouched): `pnpm exec vitest run --config vitest.config.ts test/packed-examples.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — manifest-rewrite and ESM/CJS runtime tests passed (runtime default IS the singleton), compiler test FAILED at `pnpm exec tsc -p tsconfig-nodenext.json`. Packed-consumer diagnostics: both ESM importers (`consumer-types.ts` in the `type: module` consumer and `consumer-mts.mts`) typed the default import as the module namespace — `TS2739: Type 'typeof import(".../node_modules/@web-ts-toolkit/express-response-handler/index")' is missing ... errorMessageProvider, preJson, postJson, preError, postError`, plus `TS2339: Property 'preJson'/'errorMessageProvider' does not exist` on every access/assignment (and knock-on `TS7006` on the hook arrow parameter). No errors on `consumer-cts.cts` (`require` consumers resolved the CJS graph correctly) and none on the `@ts-expect-error` named-`preJson`-import line (confirming `preJson` is singleton-only, not a named export). Mechanism: the non-module-typed package resolves ESM importers to `index.d.ts` (CJS declaration), so TypeScript applies synthetic-default (namespace) semantics while runtime `index.mjs` is true ESM whose `default` is the singleton. Earlier `tsc --traceResolution` probes against workspace `dist/` confirmed ESM importers matched the unconditional `types` condition to `dist/index.d.ts`, and that nested conditional routing resolves ESM to `dist/index.d.mts` / CJS to `dist/index.d.ts`.
- Changed paths (no `src/` runtime change, no `dist/` edits, no `CHANGELOG.md` update):
  - `packages/express-response-handler/package.json` — all five export entries (`.`, `./types`, `./responses`, `./responses/csv`, `./responses/success`) now use the workspace-established conditional shape `types: { import: <*.d.mts>, require: <*.d.ts>, default: <*.d.ts> }` (same as `utils`/`http-errors`/`express-json-router`); `import`/`require`/`default` runtime targets, top-level `main`/`module`/`types`, and all other fields are byte-identical.
  - `packages/express-response-handler/test/packed-examples.test.ts` — ESM `source` fixture (shared by strict NodeNext `.ts`/`.mts` and Bundler): default import assigned to `ExpressResponseHandler`, `preJson` read/set-to-function/set-to-null, `errorMessageProvider` read/set/restore, plus `@ts-expect-error` on a named `preJson` import; `.cts` fixture: same singleton assertions through `api.default` (`types.ExpressResponseHandler`/`Hook`/`ErrorMessageProvider`); `consumer.mjs`/`consumer.cjs` runtime: singleton-member presence plus `preJson = null` and provider set/round-trip/restore (separate processes, no cross-talk); manifest-rewrite expectation updated to the conditional form for all five entries with production-rewritten `./` paths; local `PackageJson.exports` type widened to allow nested condition objects.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild; both declaration graphs present).
  - `pnpm exec vitest run --config vitest.config.ts test/packed-examples.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 3 passed post-fix (manifest rewrite incl. nested routing for all five entries, packed ESM+CJS runtime incl. singleton round-trips, strict NodeNext `.ts`/`.mts`/`.cts` + Bundler `tsc` with `skipLibCheck: false`).
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 7 files, 210 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean.
  - `pnpm --filter @web-ts-toolkit/express-json-router test` — 2 files, 33 tests passed.
  - `git diff --check` — clean.
- Results: installed default + named imports now match runtime in every module mode (ESM NodeNext/Bundler default = singleton with settable `preJson`/`errorMessageProvider`; CJS `require` default unchanged and still correct; all four subpaths resolve named imports under both graphs with runtime targets preserved). B-ERH-07 call-shape/payload declarations and B-ERH-01..06 lifecycle/CSV work preserved — full gate passes. No release artifact produced.
- Residual risks: nested-condition `exports` requires TypeScript 4.7+ (and equivalent bundler support) for per-mode declarations; older resolvers fall back to top-level `types: dist/index.d.ts` (CJS graph, previous behavior) — no runtime effect since Node/bundlers ignore the `types` condition. Other workspace packages were inspected, not changed (all already conform).

### Task B-ERH-09: Bound Packed-Consumer Subprocesses

Status: completed

Kind: improvement

Priority: P2; a stalled install or child process can block the test worker indefinitely.

Suggested agent: test-infrastructure specialist

Dependencies: B-ERH-08

Primary ownership: `packages/express-response-handler/test/packed-examples.test.ts` and focused harness tests if needed.

Finding and references: `run` at `test/packed-examples.test.ts:57-59` uses synchronous `execFileSync` without a timeout; installation at lines 144-176 is registry-backed. A Vitest timer cannot reliably interrupt a synchronously blocked worker.

Requirements: give each subprocess an enforceable finite deadline and useful command/cwd/output diagnostics; align outer test budgets and temporary-directory cleanup with those limits. Keep the real production manifest/packed-install coverage rather than replacing it with workspace imports.

Acceptance criteria: a controlled child that does not exit is stopped within the configured budget with an actionable diagnostic; normal install/runtime/compiler cases pass; no child or temporary consumer is left by tested failure paths.

Verification: focused harness failure exercise, packed tests, package gate, and focused lint.

Completion evidence:

- B-ERH-08 status verified as `completed` before starting; its packed manifest routing, ESM/CJS runtime, and strict NodeNext/Bundler fixtures are preserved — `test/packed-examples.test.ts` keeps the production manifest rewrite and isolated packed-install coverage (no workspace-import replacement).
- Changed paths:
  - `packages/express-response-handler/test/helpers/packed-subprocess.ts` (new) — bounded `run(command, args, cwd, { timeoutMs })` via `execFileSync` with `timeout` + `SIGKILL` + 10 MB `maxBuffer` (enforceable deadline on the synchronously blocked worker, not a Vitest timer); failures throw with command line, cwd, deadline, exit status/signal/code, stdout/stderr tails (4k chars), and original error as `cause`. Exports `PACK_TIMEOUT_MS` (60s), `INSTALL_TIMEOUT_MS` (180s), `NODE_TIMEOUT_MS` (30s), `TSC_TIMEOUT_MS` (90s).
  - `packages/express-response-handler/test/packed-examples.test.ts` — all subprocess calls pass explicit budgets (pack/install/node/tsc); outer Vitest budgets aligned (manifest 240s, ESM/CJS runtime 300s, tsc 300s replacing the prior 30s); temp-root tracking/`afterAll` cleanup unchanged so timed-out consumers are still removed.
  - `packages/express-response-handler/test/packed-subprocess.test.ts` (new, 4 tests) — success passthrough; non-zero exit diagnostics (command/cwd/stdout/stderr + cause); hanging child (`setInterval`) stopped within 2s budget with `did not exit within 2000ms` + command/cwd/timeout diagnostic and a post-kill liveness probe; temp-dir timeout path leaves no directory behind.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success.
  - `pnpm exec vitest run --config vitest.config.ts test/packed-subprocess.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 1 file, 4 tests passed (hang stopped in ~2s, well under the 30s finiteness bound).
  - `pnpm exec vitest run --config vitest.config.ts test/packed-examples.test.ts --coverage.enabled=false` (from `packages/express-response-handler`) — 3 tests passed in ~11s (manifest rewrite, packed ESM+CJS runtime, strict NodeNext + Bundler `tsc` with `skipLibCheck: false`).
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 8 files, 214 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.ts"` — clean.
  - `git diff --check` — clean.
- Results: every packed-consumer subprocess has a finite kill deadline with actionable command/cwd/output diagnostics; a controlled non-exiting child is killed within budget; normal install/runtime/compiler cases pass; timed-out consumers are tracked for `afterAll` removal and the harness failure path removes its temp dir. No `dist/` edits, no `CHANGELOG.md` update. No release artifact produced.
- Residual risks: `execFileSync` kills the direct child (`SIGKILL`); grandchildren detached by a hung installer are not process-group-killed — mitigation is the tracked temp-dir cleanup, not a kill-tree guarantee. Outer budgets (up to 300s) are generous for registry-backed installs and slow CI; they bound finiteness, not speed.

### Task B-ERH-10: Make The Installed Quickstart Self-Sufficient

Status: completed

Kind: improvement

Priority: P2; strict dependency isolation exposes missing direct dependencies in the documented recipe.

Suggested agent: package documentation/consumer specialist

Dependencies: B-ERH-09

Primary ownership: `packages/express-response-handler/README.md`, `llms.txt`, packed quickstart fixture, and matching `website/docs/packages/express-response-handler.md` sections.

Finding and references: README install lines 5-9 name only this package, while quickstart lines 22-24 import Express and `@web-ts-toolkit/http-errors` directly. The latter is transitive and not reliably importable under isolated dependency layouts. `package.json:60-70` declares Node >=22 and Express ^5 but README omits those prerequisites. The broad fixture installs every workspace dependency at `test/packed-examples.test.ts:150-164`, masking the recipe gap. README line 161 points at `ERH-12.md`, which is not in `package.json:55-59`'s files list.

Requirements: document runtime/peer/type prerequisites and every directly imported dependency, or simplify imports to the actual installed surface. Add a strict isolated fixture for the exact advertised recipe, distinct from the broad compatibility fixture. Use reachable published/repository URLs for unshipped notes rather than broken installed-relative links.

Acceptance criteria: a consumer following only the recipe compiles and runs the quickstart without transitive-root visibility or source deep imports; docs state Node/Express requirements and canonical import style; navigation does not require files absent from the package.

Verification: exact-recipe packed consumer, package gate, focused lint, and documentation/packed-file inspection.

Completion evidence:

- B-ERH-09 status verified as `completed` before starting; its bounded subprocess helper (`test/helpers/packed-subprocess.ts`, `run` with `timeout`+`SIGKILL` budgets) is preserved untouched — the new fixture uses it for all pack/install/node/tsc calls with `PACK/INSTALL/NODE/TSC_TIMEOUT_MS`.
- Changed paths (no `src/` runtime change, no `dist/` edits, no `CHANGELOG.md` update):
  - `packages/express-response-handler/README.md` — Installation now states Node.js `>=22` + Express `^5` peer prerequisites, installs all directly imported deps (`pnpm add @web-ts-toolkit/express-response-handler @web-ts-toolkit/http-errors express`) with a note that `http-errors` must be direct because transitive packages are not importable under isolated pnpm installs, plus TypeScript dev prerequisites (`pnpm add -D typescript @types/express @types/node`). Documentation section navigates via the live docs URL with the repo source labeled as repository-only; the `ERH-12.md` pointer is now a reachable repository URL (`https://github.com/egose/web-ts-toolkit/blob/main/packages/express-response-handler/ERH-12.md`) marked as an unshipped dev note.
  - `website/docs/packages/express-response-handler.md` — same Installation prerequisites/recipe/type-prerequisites as README (npm variants).
  - `packages/express-response-handler/llms.txt` — new Installation section (same recipe + Node/Express prerequisites + direct-import note); Gotchas now state Node/Express requirements, explicit direct-install rule, and one-style-consistently import guidance.
  - `packages/express-response-handler/test/packed-examples.test.ts` — new `stageExactRecipeConsumer()` (direct dependencies exactly handler + `http-errors` + `express`; `utils` never direct; same production-manifest tarballs + overrides only for offline transitive resolution) and new `installs only the documented recipe and runs the README quickstart in isolation (B-ERH-10)` test: asserts the consumer manifest has exactly the three recipe dependencies and no `utils`, asserts quickstart sources contain no `@web-ts-toolkit/utils` or `/dist/` deep imports, compiles the README quickstart under strict NodeNext + Bundler with `skipLibCheck: false`, and runs it (Express boots; `GET /health` 200 `{ok:true}`, `GET /users/ada` 200, `GET /users/missing` 404 via directly imported `NotFoundError`, `POST /jobs` 201). Broad compatibility fixture untouched.
- Exact commands (repo root unless noted; never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler... build` — success (post-fix rebuild).
  - Pre-fix analysis (reasoning, no separate pre-fix execution run): the old README named only this package while the quickstart imports `express` + `http-errors` directly; under pnpm isolation transitive packages are not importable, so the old recipe leaves those two imports undeclared. The new isolated fixture pins direct deps to exactly the three recipe packages with no `utils` and would fail compilation/execution if any directly imported package were dropped from the recipe. Post-fix run: `pnpm exec vitest run --config vitest.config.ts test/packed-examples.test.ts --coverage.enabled=false -t "B-ERH-10"` (from `packages/express-response-handler`) — 1 passed (initial run caught a strict `string | string[]` params narrowing issue in the fixture, fixed with explicit narrowing; README example bodies unchanged).
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 8 files, 215 tests passed (214 prior + 1 new), coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean. `git diff --check` — clean.
  - Packed-file inspection: `pnpm pack --dry-run` file list contains `README.md`, `llms.txt`, `dist`, `LICENSE`, `package.json` only — confirming `ERH-12.md` and `website/docs/...` are absent from the artifact, so the URL-based pointers are required and no installed navigation depends on them.
- Results: a consumer following only the documented recipe compiles (strict NodeNext + Bundler, `skipLibCheck: false`) and runs the quickstart with no transitive-root (`utils`) or `dist/` deep imports; docs state Node `>=22`/Express `^5`/direct-import/type prerequisites and both default + named import styles; installed navigation uses only shipped files + reachable URLs. B-ERH-01..09 lifecycle/CSV/type/declaration/harness work preserved — full gate passes. No release artifact produced.
- Residual risks: README/website quickstart bodies still pass `req.params.id` straight to a `(id: string)` helper for readability; strict consumers under `@types/express` v5 (`string | string[]` params) need the same one-line narrowing the isolated fixture applies — not a recipe-dependency gap. The exact-recipe consumer still declares `overrides` for offline tarball resolution of transitive deps; overrides affect version resolution only, not direct importability, so isolation holds under pnpm.

### Task B-ERH-11: Independently Verify The Combined Boundaries

Status: completed

Completion evidence:

- Independent reviewer (did not implement B-ERH-01..10); read-only review, no `src/`/`test/`/`dist/`/`CHANGELOG.md` changes made by this task. No P1 boundary found broken, so no fix was applied.
- Fresh per-task verification outcome (evidence, not inherited claims):
  - B-ERH-01 (ownership): `claimSlot`/`delegateTerminalError`/`reportHookObservation` present as the single private enforcement point in `src/create-handler.ts`; `EventState.reported` present, `nextError` absent; 5 ownership tests in `test/middleware.test.ts` + 2 observability tests in `test/lifecycle-safety.test.ts` pass inside the package gate.
  - B-ERH-02 (error channel): `toTerminalError`/`describeTerminalFailure` normalize terminal failures with original as `cause`, ordinary-`Error` identity preserved, explicit `next('route')` untouched; 42-test arbitrary-throw block passes inside the package gate.
  - B-ERH-03 (hook lifecycle): bounded fallback lifecycle (`runFallbackLifecycle`/`sendFallbackFormatted`, one `preError` + redacted body + one finish-timed `postError`, zero `postJson`), manual/`undefined` success-hook exclusion, CSV same-owner bypass with `fallbackOccurred` guard; 8-test block passes; README/website/`llms.txt` hook-contract paragraphs present.
  - B-ERH-04 (destination termination): idempotent `cleanup`, retained error/close/finish ownership, sync/async iterator-cleanup containment, real-`Writable` tests with temp process observers; 9-test block passes inside the package gate.
  - B-ERH-05 (bounded cancellation): no per-row abort-promise race; `failed` flag + bounded single-waiter `abortWaiters`, first-read and every-continuation guards, empty-iterator single read; 7-test `csv-cancellation.test.ts` passes; retention fixture reproduced fresh: `node --expose-gc test/csv-retention-measure.mjs` → `pass:true`, delta 114,952 bytes vs 5,242,880 tolerance (10k vs 100k active rows), confirming flat active-export heap.
  - B-ERH-06 (direct CSV): contract choice (runtime-safe fallback) recorded in `src/responses/csv.ts` JSDoc; no-owner pre-output failures deterministically destroy with normalized error, throwing owners contained, non-`Error` wrapped with `cause`; 8-test `csv-direct-errors.test.ts` passes; docs paragraph present.
  - B-ERH-07 (call shapes): 8-overload `HandleResponse` in `src/types.ts` matches length-dependent runtime (singleton→single, `readonly []`/`()`→`never`, dynamic→union); explicit generic payload factories in `src/http-response.ts`; runtime + strict-declaration agreement asserted in `test/response.test.ts` and packed strict fixtures.
  - B-ERH-08 (declarations): `package.json` root + all four subpaths use conditional `types: {import: *.d.mts, require: *.d.ts, default: *.d.ts}` with byte-identical runtime targets; both declaration graphs present in `dist/` (`index.d.mts`, `responses/csv.d.mts`, etc.); packed manifest-rewrite test asserts the conditional form.
  - B-ERH-09 (bounded subprocess): `test/helpers/packed-subprocess.ts` enforces `timeout`+`SIGKILL` budgets with command/cwd/output diagnostics; 4-test `packed-subprocess.test.ts` passes (hang killed in ~2s).
  - B-ERH-10 (recipe): README/website/`llms.txt` state Node `>=22`/Express `^5`/direct-install prerequisites; exact-recipe isolated consumer test passes (only handler + `http-errors` + `express` direct, quickstart compiles under strict NodeNext+Bundler and serves `/health`, 404, 201).
- Exact gates (repo root, serial, never concurrent):
  - `pnpm --filter @web-ts-toolkit/express-response-handler test` — 8 files, 215 tests passed, coverage thresholds met.
  - `pnpm exec eslint "packages/express-response-handler/**/*.{ts,js}"` — clean (0 errors, 0 warnings).
  - `pnpm --filter @web-ts-toolkit/express-json-router test` — 2 files, 33 tests passed.
  - `pnpm build` — success (all workspace packages + app built, `Done`).
  - `pnpm test` (full repo) — NOT GREEN due to unrelated baseline failures outside this package: express-response-handler 8 files/215 passed and express-json-router 2 files/33 passed in the same run; failures observed: (run 1) `@web-ts-toolkit/express-oidc-vault`: 3 files failed, 8 tests failed / 231 passed (e.g. `bov-07-refresh-profile.test.ts` `composeRefreshedUserProfile is not a function`); (run 2) `@web-ts-toolkit/access-router`: 2 files failed, 1 test failed / 397 passed (`filter-denial.integration.test.ts`, `options-ownership.test.ts` ART-10 nested-setter). Serial runner stops at first failing package, so later packages were not reached. No unrelated files were modified to force a pass.
  - `pnpm lint` (full repo) — 0 errors, 3 warnings (all in unrelated `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts`: unused eslint-disable directives).
  - `git diff --check` — clean.
- Remaining limitations: full-repo `pnpm test` red is caused by in-flight unrelated work (express-oidc-vault, access-router tracks visible as modified/untracked in `git status`); no new terminal-state ambiguity or unsafe compat path found in this package; readability/encapsulation of the final private ownership model (`claimSlot` + two terminal helpers, no exported orchestration) is adequate.
- New follow-ups: none. No new independent P1 findings; subtask residual risks (unpreemptible arbitrary `next()`, `destroy()` sync-throw containment, non-evented-destination cleanup, `never`-typed empty-input callability) stand as documented and need no new task.
- Release-artifact statement: no release artifact build/verification was produced — no versioned release candidate exists for this change set (`pnpm build-artifact`/`pnpm verify-artifact` not run, correctly per task guidance).

Kind: improvement

Priority: P1; local fixes must compose across stream, Express, and package boundaries.

Suggested agent: independent reviewer who did not implement B-ERH-01 through B-ERH-10

Dependencies: B-ERH-01 through B-ERH-10

Primary ownership: this task document for evidence; read-only review across package, sibling integration, and changed documentation.

Finding and references: prior ERH-13 passed aggregate tests while the remaining boundary cases in B-ERH-01 through B-ERH-10 stayed uncovered. Coverage percentages and mocked destination behavior alone are insufficient evidence of lifecycle correctness.

Requirements: verify each criterion against fresh runtime/type evidence; review alternate direct CSV paths, cancellation during every await, committed-header error delegation, original diagnostic preservation/redaction, post-hook exclusions, real writable completion, bounded export retention, public call shapes, and production-rewritten declarations. Review readability and encapsulation of the final private ownership model rather than requiring a particular helper/class structure.

Acceptance criteria: package/lint/sibling and final repository gates pass serially; packed consumers and the documented recipe pass; performance measurements are reproducible; no new terminal-state ambiguity or unsafe compatibility path remains. Investigations conclude with evidence, new independent findings get complete follow-up tasks, and deferred changes name an owner, rationale, and residual risk. Record release-artifact applicability rather than claiming an unrun artifact check passed.

Verification: all shared gates above, acceptance-evidence review, and `git diff --check`. Record unrelated baseline failures precisely without modifying unrelated work to force a pass.

## Allocation And Decisions

Two editing tracks may start in parallel: handler B-ERH-01 -> 02 -> 03, and CSV B-ERH-04 -> 05. Join at B-ERH-06, then execute B-ERH-07 -> 08 -> 09 -> 10 -> 11 serially. This intentionally sequences `create-handler.ts`, `csv.ts`, shared docs, and `packed-examples.test.ts`; all builds/tests remain serialized regardless of edit allocation.

Unresolved decisions do not block the initial fixes:

1. B-ERH-06: direct `streamCsv` fallback versus required error-owner signature. Maintainer approval is needed for a breaking signature restriction.
2. B-ERH-07: input-shaped array output versus accurately typing existing length-dependent behavior. Audit released/workspace expectations and obtain approval before changing shipped behavior.
3. B-ERH-08: compiler evidence determines whether metadata changes are needed; do not assume a failure or rewrite exports preemptively.

Deferred rather than refiled: formula-neutralization ownership and root import splitting remain governed by ERH-12; typed-5xx disclosure remains the prior explicit policy question, not a newly proven vulnerability. A supported-Express-version matrix and broader dependency audit were outside this boundary review; current-version tests must not be described as proving every supported release.

## Definition Of Done

All planned tasks are either completed with required evidence or explicitly deferred by the maintainer with owner/rationale/risk; blocked verification stays visible. Confirmed lifecycle/resource defects need regression evidence, not just a refactor. Runtime, public declarations, production package contents, and docs agree; response ownership is deterministic; CSV failures remain observed through actual destination termination; cancellation state does not grow with rows consumed. The independent integration task records exact gates and any remaining limitations without inheriting historical pass claims.
