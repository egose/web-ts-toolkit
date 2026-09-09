# Access Router Runtime Boundary Follow-Up

Created: 2026-09-08 14:11:54 (local time)

Package: `packages/access-router-runtime`

## Objective And Scope

Close remaining lifecycle, resource-ownership, configuration, artifact, and public-contract gaps following the completed [runtime remediation](20260823-123959-access-router-runtime-review-remediation.md). This is a new review phase, not a claim that the earlier fixes were absent. All implementation tasks below are completed; see per-task Completion evidence and ARRT-B14 integration.

- Preserve independent runtime connections, externally owned connection isolation, synchronous config loading, Express middleware ordering, and the public CLI facade.
- Treat config, schemas, hooks, and preload modules as trusted application code. No confirmed remote authorization bypass was established in this package.
- Do not rewrite delegated CRUD authorization, query parsing, HTTP adapters, watchers, or bundlers. Coordinate shared lifecycle changes with [express-runtime boundary review](20260907-181731-express-runtime-boundary-review.md).
- Prefer small enforcement boundaries and behavior-focused regressions. Do not split `src/index.ts` merely for line count or add speculative caching.
- Use repository-relative paths in this document and subsequent evidence. Generic temporary fixtures may live under `/tmp`.
- Preserve unrelated worktree changes, including concurrent OIDC-vault store work. Do not manually edit generated `dist/` files.

## Coverage And Evidence

Inspected all five runtime source modules, package metadata/build configuration, existing emitted declarations, README, and relevant config, lifecycle, router-order, CLI, artifact, strict-type, and packed-consumer tests. Three non-overlapping review agents covered lifecycle/database, CLI/config, and composition/public packaging. The coordinator deduplicated findings against ARRT-01 through ARRT-12 and the shared express-runtime follow-up, then checked material control flows and ran focused probes.

Fresh review probes used `node --input-type=module -e '...'` from `packages/access-router-runtime`, importing existing `dist/index.mjs`. These were disposable processes, not committed tests; no MongoDB server was needed. Existing dist was not rebuilt in this review, so source inspection is the authority and each fix must reproduce against a fresh build.

| Probe                                                                                | Observed result                                                         | Task     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- |
| Create and shut down three schema-only runtimes using real Mongoose                  | `mongoose.connections.length` grew from 1 to 4                          | ARRT-B03 |
| Fail first init, then successfully retry a schema-backed external-connection runtime | Public model remained present, but `connection.models` entry was absent | ARRT-B03 |
| Register A before encountering incompatible pre-existing B                           | Factory threw; caller connection still contained A and B                | ARRT-B04 |
| Two schemas configured with the same schema-level collection                         | Validation accepted the config                                          | ARRT-B07 |
| Shutdown during init that subsequently rejects with `0`                              | Init rejected with `0`; shutdown resolved                               | ARRT-B01 |
| Catch rejection of an async config factory through the normalizer                    | One additional `unhandledRejection` event observed                      | ARRT-B08 |
| Successfully initialize, then listen on an occupied loopback port                    | Readiness rejected; `local.shutdown()` ran zero runtime cleanup hooks   | ARRT-B02 |

The async-config probe installed and removed its own rejection observer to measure the event. The listen probe explicitly shut down the runtime and closed the occupied server afterward. Process-local disconnected Mongoose objects disappeared on probe exit.

Not run in this review: fresh builds, package/full-repository test suites, lint, fresh packed installs, real MongoDB integration, fresh peer-version matrix, Windows signals, or performance timing/heap profiling. They are not prerequisites for producing this plan. Historical 81-test success in the earlier task file is not a fresh baseline. Other findings are source/test-contract observations, not freshly executed regressions. No throughput regression, request-controlled recursive growth, or new packaging-entrypoint failure was demonstrated; request input bounds remain delegated to lower-level packages.

## Priorities And Execution

- P1: startup/shutdown or construction failure can leave live resources, violate teardown ordering, or contaminate caller-owned state.
- P2: reproducible correctness, configuration-integrity, public-type, or diagnostic-contract gap.
- P3: optional fidelity/readability improvement without a demonstrated production failure.

Dependencies include deliberate shared-file serialization. A coordinator owns README, website, release-note, shared test-harness, and task-record integration. Each implementer supplies the relevant documentation/test changes, but agents must not edit those shared files concurrently.

| Workstream            | Ordered tasks                | Ownership constraints                                                                                                   |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Database/lifecycle    | B03, B04, B05, B01, B02, B06 | One owner at a time for `src/database.ts`, `src/index.ts`, and lifecycle/index tests                                    |
| Config validation     | B07, B08                     | One owner for `src/config-loader.ts` and config-loader tests; may run alongside database work without editing its files |
| Artifact generation   | B09                          | Own CLI entry generation and artifact tests; no shared bundler rewrite                                                  |
| Public contracts      | B10, B11, B12                | Follow core/config work; serialize `src/index.ts`, declarations fixtures, and docs                                      |
| Consumer verification | B13, then B14                | Final package/harness integration after public contracts stabilize                                                      |

All task IDs in the table have prefix `ARRT-`. Agents may analyze independent streams concurrently, but **all builds and test commands are serialized**: package tests rebuild transitive shared `dist/` outputs. Acquire the coordinator's build/test slot before any such command.

## Shared Verification

Run commands from the repository root unless noted. Prerequisites: dependencies installed with `pnpm install`, Node supported by `package.json` (>=22), working pnpm/toolchain, available loopback ports, and registry/cache access for packed peer installs.

- V1: `pnpm --filter @web-ts-toolkit/access-router-runtime test`. This rebuilds dependencies and executes the package suite, including artifact/packed/type tests.
- V2: `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check`.
- V3: If shared express-runtime code changes, run `pnpm --filter @web-ts-toolkit/express-runtime test` before V1 and lint that package with `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"`.
- V4: Final integration runs `pnpm build`, `pnpm test`, and `pnpm lint`, serially. Report unrelated failures separately; never revert concurrent work to obtain a green baseline.
- V5: For CLI/artifact release integration, run `pnpm build-artifact -- --version 0.0.0-arrt-boundary` and `pnpm verify-artifact -- --version 0.0.0-arrt-boundary`, serially, and inspect the included runtime CLI/package.
- Targeted checks: after one serialized `pnpm --filter @web-ts-toolkit/access-router-runtime... build`, run `pnpm exec vitest run --config vitest.config.mts test/<affected-file>.test.ts` from `packages/access-router-runtime`, replacing the placeholder with an existing affected test filename. Targeted success does not substitute for V1 at integration.

Behavioral fixes require a failing-before/passing-after regression where feasible. Use deferred barriers rather than fixed sleeps. Temporary fixtures must clean their own servers, listeners, connections, models, files, environment changes, and subprocesses without modifying unrelated resources. Do not rely on suite teardown to conceal production retention. Update README and `website/docs/packages/access-router-runtime.md` together for public contract changes, and record migration/release notes where shipped behavior or typing changes.

## Tasks

### Task ARRT-B03: Separate Retry Rollback From Terminal Database Disposal

Status: completed

Kind: defect

Priority: P1, because retry reports readiness with missing registrations and terminal disposal retains runtime-owned resources.

Suggested agent: Mongoose resource-lifecycle specialist

Dependencies: none

Primary ownership: `packages/access-router-runtime/src/database.ts`, the smallest lifecycle call-site changes in `src/index.ts`, and focused lifecycle/database tests.

Finding: One `disconnect()` operation serves both retryable startup rollback and terminal shutdown. It deletes generated registrations on rollback, but subsequent init does not restore them. It only closes opened connections, never removes terminal owned connections from Mongoose's connection list, and a close rejection prevents model cleanup. A first model-deletion rejection similarly skips later registrations. Existing fake-connection cleanup tests do not reproduce the real connection-list retention, and the retry test uses no generated models.

References:

- `packages/access-router-runtime/src/database.ts:111-115,146-175` (`generatedModelNames`, `connect`, `disconnect`).
- `packages/access-router-runtime/src/index.ts:329-342,405-428,458-460` (one-time model assembly versus lifecycle reuse).
- `packages/access-router-runtime/test/lifecycle-harness.test.ts:241-269,300-339` (cleanup rejection and model-free retry).
- Prior ARRT-05/06/09; fresh connection-list and retry probes above.

Requirements:

1. Distinguish retryable rollback from terminal disposal with the smallest internal contract. On successful retry, generated model lookup, string-reference population prerequisites, and exposed model handles must agree.
2. Release runtime-owned connection registrations on successful terminal disposal, including never-opened schema-only connections. Do not destroy external connections or connections explicitly retained by the documented `disconnectOnShutdown: false` policy.
3. Attempt independent model/resource cleanup even when close or one deletion fails; preserve all relevant errors and retain accurate ownership for any permitted retry.
4. Resolve the app-only schema-backed case at `src/index.ts:287-292,544-546`: it currently allocates an owned connection while returning no disposal handle. Maintainer must approve either a genuinely lifecycle-free supported path or a documented restriction with migration guidance; do not silently remove support.

Acceptance criteria:

- Failed first init followed by successful retry leaves `connection.model(name)` and `runtime.models[name]` consistent, with tests using real disconnected Mongoose models.
- Repeated terminal shutdown of ordinary owned runtimes returns `mongoose.connections` to baseline; retained/external connections remain operational under the documented policy.
- Close failure and first-deletion failure still attempt all independent cleanup steps, preserve errors, and do not mark unclean resources disposed.
- The app-only policy is explicit, approved, tested, and documented; Mongoose 8/9 packed ownership cases cover the selected disposal behavior.

Verification: focused lifecycle/index tests, real no-server connection-list regression, then V1/V2. Record the app-helper decision before changing its public contract.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/database.ts` — added `rollback()` (retryable: closes partially opened owned connection, keeps generated registrations, never destroys) and hardened terminal `disconnect()` (closes when policy allows, deletes each generated model independently retaining failures, releases owned registration via `connection.destroy()` with `mongoose.connections` fallback, aggregates errors, only marks successes disposed).
  - `packages/access-router-runtime/src/index.ts` — failed `init()` rollback now calls `database.rollback()`; `shutdown()` keeps terminal `database.disconnect()`; `createAccessRouterRuntimeApp()` now also rejects schema-backed models before any side effect with migration guidance to `createAccessRouterRuntime(config)` + `init()`/`shutdown()`.
  - `packages/access-router-runtime/test/database-disposal.test.ts` (new, 7 tests, real disconnected Mongoose, no server) — external/owned retry consistency, never-opened release + idempotent repeated shutdown, retained/external operational, close-failure and first-deletion-failure independent cleanup with ownership retention, app-only restriction without connection allocation.
  - `packages/access-router-runtime/test/packed-consumer.test.ts` — extended `ownership-lifecycle.mjs` with owned disposal-to-baseline and `disconnectOnShutdown: false` retained cases (runs under both Mongoose 8 and 9 matrix entries).
  - `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` — minimal public-contract update for the app-only schema-backed restriction (no CHANGELOG edit per constraints).
- Contract decisions:
  - Retry vs terminal: `rollback()` ignores `disconnectOnShutdown: false` (rollback is not shutdown) and never deletes/destroys; terminal `disconnect()` respects the flag for close/destroy but always attempts model deletion.
  - App-only policy (documented restriction, chosen over a fake lifecycle-free owned path because any schema-backed model allocates a globally registered owned connection with no disposal handle): `createAccessRouterRuntimeApp()` supports only genuinely lifecycle-free configs (no `db`/`init`/`shutdown`, no `models[].schema`); existing-model/data/root/OpenAPI configs remain supported; migration is `createAccessRouterRuntime(config)` with explicit `init()`/`shutdown()`.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/database-disposal.test.ts test/lifecycle-harness.test.ts test/index.test.ts` — 3 files, 35 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 88 tests passed (includes Mongoose 8/9 packed consumer matrix with the new owned/retained ownership checks).
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; overlapping ownership-identity work remains with ARRT-B05 (identity-safe cleanup for replaced/shared registrations), construction rollback with ARRT-B04.

### Task ARRT-B04: Roll Back Partial Runtime Construction

Status: completed

Kind: defect

Priority: P1, because a throwing factory leaves caller-owned connection state mutated without returning a cleanup handle.

Suggested agent: runtime assembly specialist

Dependencies: ARRT-B03

Primary ownership: `packages/access-router-runtime/src/index.ts` assembly, minimal database disposal support, `test/index.test.ts`.

Finding: Registration proceeds incrementally before router/app construction. A later model collision, router error, or throwing `express.finalize` bypasses all runtime cleanup because the factory never returns. The existing single-model collision test cannot observe earlier successful registrations.

References: `packages/access-router-runtime/src/index.ts:316-375,505-541`; `packages/access-router-runtime/src/database.ts:140-147`; `packages/access-router-runtime/test/index.test.ts:342-373`. Fresh A/B collision probe retained A after the throw. This is a residual of ARRT-02/05, not a reason to duplicate downstream validators.

Requirements:

1. Validate predictable conflicts before mutation where possible and add transactional ownership-aware rollback around remaining fallible construction.
2. Preserve the synchronous factory contract; do not fire-and-forget rejected disposal promises. Use a construction-safe cleanup boundary for resources acquired before async init.
3. Restore only resources acquired by this construction attempt, preserving the original error and any cleanup failures under an explicit policy.

Acceptance criteria:

- A valid A followed by incompatible existing B throws with the original collision evidence and leaves the external registry identical to its baseline.
- Throwing router/finalize construction leaves no owned model/connection retention or unhandled rejection.
- Pre-existing models/connections survive failed construction; a corrected retry can construct successfully.

Verification: focused index/assembly regressions, V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/database.ts` — added `prevalidateModels()` (synchronous pre-mutation check replicating `resolveModel` name/schema/connection/compatibility validation without creating models) and `rollbackConstruction()` (synchronous construction-safe cleanup: deletes only `generatedModelNames`, releases never-opened owned connection registration via `mongoose.connections` splice, never closes/destroys asynchronously, throws single/`AggregateError` on cleanup failure).
  - `packages/access-router-runtime/src/index.ts` — wrapped model/router/app assembly in try/catch after `createAccessRouterRuntimeDatabase`; calls `database.prevalidateModels()` before any mutation, then resolves models and builds routers/app; on any construction throw calls synchronous `database.rollbackConstruction()` and rethrows via existing `combineLifecycleErrors` (original preserved, cleanup failures aggregated under `Runtime construction failed and cleanup also failed`). Synchronous factory contract preserved; no async `rollback()`/`disconnect()` fire-and-forget.
  - `packages/access-router-runtime/test/index.test.ts` — added 2 regressions: valid-A plus incompatible pre-existing-B throws with original collision evidence, leaves external registry identical to baseline, and corrected retry succeeds; throwing `express.finalize` releases owned models/connections synchronously with no unhandled rejection, and corrected retry constructs and shuts down cleanly.
- Contract decisions (policy):
  - Predictable conflicts fail before mutation via `prevalidateModels()`; remaining fallible steps (router creation, `combineRoutes`, `createExpressApp`/`finalize`) are covered by transactional sync rollback.
  - Construction cleanup restores only resources acquired by this attempt (`generatedModelNames` plus owned connection registration when `ownsConnection`); external connections and pre-existing models are never deleted/released. Respects B03 retry-vs-terminal distinction: construction rollback is neither init `rollback()` nor terminal `disconnect()`.
  - Error policy: cleanup success rethrows the original error unchanged; cleanup failure throws `AggregateError([original, ...cleanupErrors], 'Runtime construction failed and cleanup also failed')`, preserving original evidence.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/index.test.ts` — 1 file, 18 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 90 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; overlapping identity-safe cleanup remains with ARRT-B05.

### Task ARRT-B05: Make Model Registration Ownership Identity-Safe

Status: completed

Kind: defect

Priority: P2, because shutdown can delete a replacement registration or break another runtime's shared model lookup.

Suggested agent: Mongoose ownership specialist

Dependencies: ARRT-B04

Primary ownership: `packages/access-router-runtime/src/database.ts` and focused ownership tests.

Finding: Ownership tracks names rather than constructors. Cleanup removes whatever occupies that name, including an externally replaced model. Same-schema reuse is accepted, but the creator can delete the registration while another runtime still uses it. Current tests cover sequential reuse, not overlapping owners or replacement.

References: `packages/access-router-runtime/src/database.ts:114,140-147,169-174`; `packages/access-router-runtime/test/index.test.ts:375-404`; prior ARRT-05.

Requirements:

1. Track identity so cleanup cannot delete a different registration acquired by another owner.
2. Specify the supported lifetime policy for simultaneously reused schema-backed registrations on an external connection. Recommend a minimal safe policy based on a two-runtime regression; obtain maintainer approval before rejecting previously supported reuse or adding shared ownership machinery.
3. Keep external connection closure outside runtime ownership and preserve B03's retry/disposal distinctions.

Acceptance criteria:

- Replacing a runtime-created model externally and then shutting down the original runtime leaves the replacement intact.
- Two runtimes sharing a schema/connection either retain valid registry lookup until the final permitted owner exits, or the unsupported combination fails before mutation under an approved documented contract.
- Retry, partial construction rollback, and shutdown never remove unrelated registrations.

Verification: focused identity/reuse tests and V1/V2; decision/evidence review for the shared-lifetime policy.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/database.ts` — replaced `generatedModelNames: Set<string>` with `generatedModels: Map<string, RuntimeModel>` tracking the exact constructor created by `resolveModel`; reused (borrowed) compatible registrations are never tracked. Both `rollbackConstruction()` and terminal `disconnect()` now delete only when `connection.models[name] === trackedModel`, otherwise relinquish tracking and leave the replacement/borrowed registration intact. `rollback()` unchanged (retry keeps registrations); external-connection close/release still outside runtime ownership per B03.
  - `packages/access-router-runtime/test/database-disposal.test.ts` — added 2 regressions with real disconnected Mongoose (no server): externally replaced model survives original-runtime shutdown; shared same-schema external registration uses borrower semantics (borrower shutdown never deletes, creator shutdown last cleans, sequential reuse after final exit works, external connection retained).
  - `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` — minimal policy doc: identity-safe delete-only-if-exact-constructor, borrower semantics for shared external reuse (overlapping borrowers must shut down before creator; sequential reuse supported), existing supplied models never deleted.
- Contract decisions:
  - Lifetime policy (minimal safe, no shared refcounting, no rejection of previously supported reuse): last-owner-wins with documented no-delete-if-replaced/shared. Only the creating runtime may delete, and only its exact constructor; borrowers never delete. Permitted order is borrower-first/creator-last (retains valid `connection.models` lookup until the final permitted owner exits); creator-first overlapping exit is documented best-effort (borrower keeps its JS handle, registry lookup is gone). Sequential reuse after final exit remains supported.
  - B03 retry/disposal distinctions preserved: `rollback()` never deletes/destroys; terminal `disconnect()` respects `disconnectOnShutdown: false` for close/release but always attempts identity-safe model deletion; construction rollback stays synchronous and identity-safe.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/database-disposal.test.ts test/index.test.ts test/lifecycle-harness.test.ts` — 3 files, 39 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 92 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; B03/B04 behavior preserved (verified by unchanged disposal/construction suites within V1).

### Task ARRT-B01: Keep Shutdown Terminal Across Rollback And Preserve Rejection Values

Status: completed

Kind: defect

Priority: P1, because failed-init rollback can reopen startup during an active shutdown.

Suggested agent: asynchronous state-machine specialist

Dependencies: ARRT-B05

Primary ownership: `packages/access-router-runtime/src/index.ts` private lifecycle and `test/lifecycle-harness.test.ts`.

Finding: Init checks `stopping` before awaiting rollback, then unconditionally writes `failed`. Shutdown requested during that await can therefore lose its stopping state; a fresh init is accepted while explicit shutdown cleanup is still pending. Separately, `pendingInitError` truthiness drops falsy rejection reasons, and cancellation is identified by error message rather than private identity. Existing pending-connect/config-init tests do not enter the failed-init rollback window.

References: `packages/access-router-runtime/src/index.ts:207-220,394-431,438-483`; `packages/access-router-runtime/test/lifecycle-harness.test.ts:93-170`; fresh falsy rejection probe above. Shared express-runtime ERT-B12 fixed a similar truthiness issue in a different owner; it does not fix this runtime branch.

Requirements:

1. Keep shutdown intent authoritative across every await, including rollback. No new init may start while shutdown owns teardown.
2. Track rejection occurrence independently from its value. Preserve `undefined`, `null`, `false`, `0`, and empty-string reasons, including primary-first aggregation when cleanup also fails.
3. Distinguish internally generated shutdown cancellation from user errors without matching only message text.
4. Preserve documented concurrent init/shutdown single-flight and retry behavior without exposing mutable lifecycle flags.

Acceptance criteria:

- Deferred failed-init rollback followed by shutdown and a second init never starts another connect/hook or resolves shutdown before pending acquisitions are cleaned.
- Table-driven falsy rejection tests show init/shutdown rejection identity and correct aggregation; a user error with the cancellation message is not suppressed.
- Successful pending init interrupted by shutdown retains the existing controlled-cancellation behavior with no duplicate cleanup.

Verification: deterministic lifecycle regressions, V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/index.ts` — private `ShutdownDuringInitError` class (unexported identity; `isShutdownDuringInitError` uses `instanceof` only, same message text preserved for diagnostics); `init()` re-checks `stopping` after rollback await and rethrows combined primary/rollback errors without writing `failed`, plus `shutdownPromise` guard so no new init starts while shutdown owns teardown; `shutdown()` tracks `hasPendingInitError` flag independently from value so `undefined`/`null`/`false`/`0`/`''` propagate and aggregate primary-first. Single-flight (`initPromise`/`shutdownPromise`) and retry (`failed`/`stopped`) semantics unchanged; no mutable lifecycle flags exposed.
  - `packages/access-router-runtime/test/lifecycle-harness.test.ts` — added 22 tests: deferred failed-init rollback + shutdown + second-init terminality; table-driven falsy init identity (5), falsy init primary-first aggregation (5), falsy shutdown identity (5), falsy shutdown primary-first aggregation (5); user error carrying the cancellation message propagated (not suppressed) under concurrent shutdown.
- Contract decisions:
  - Shutdown authoritative: failed-init rollback interrupted by shutdown preserves `stopping`; second `init()` rejects with stopping/stopped; shutdown awaits pending rollback acquisitions then performs terminal `disconnect()` and propagates the primary init error.
  - Falsy policy: `throw primary` / `AggregateError([primary, ...secondary])` preserves falsy values with `Object.is` identity; shutdown cleanup order (caller shutdown, then disconnect) preserved for aggregation.
  - Cancellation identity: only the private class suppresses; user `Error` with identical message is a real failure (rollback runs, shutdown propagates).
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/lifecycle-harness.test.ts` — 1 file, 34 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 114 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; B03/B04/B05 behavior preserved (V1 includes disposal/construction/identity suites).

### Task ARRT-B02: Coordinate Full Adapter Startup With Cleanup

Status: completed

Kind: defect

Priority: P1, because late caller initialization and listen failure can leave resources alive after shutdown/startup failure.

Suggested agent: Express/serverless lifecycle integration specialist

Dependencies: ARRT-B01

Primary ownership: `packages/access-router-runtime/src/index.ts:488-539`, local/serverless lifecycle tests; smallest shared `packages/express-runtime/src/index.ts` change only if required.

Finding: Caller `options.init` runs after runtime init is ready and outside the operation runtime shutdown awaits. Cleanup can finish before a pending caller hook acquires its resource. A local listen failure after successful init also rejects readiness without application cleanup; the shared server's failed-state shutdown branch returns early. Existing caller-init rejection tests fail before listening and do not cover pending successful hooks or post-init listen errors.

References: `packages/access-router-runtime/src/index.ts:446,488-539`; `packages/access-router-runtime/test/lifecycle-harness.test.ts:341-414`; `packages/express-runtime/src/index.ts:524-551,626-634`; prior ARRT-04/06/07 and shared ERT-B08. Fresh occupied-port probe observed zero cleanup hooks.

Requirements:

1. Coordinate complete adapter startup, including caller hooks, with runtime/local shutdown. A pending serverless invocation must not dispatch through a runtime after terminal shutdown.
2. Roll back successful application initialization when listen/readiness subsequently fails, exactly once, including caller cleanup and owned DB resources.
3. Decide and document the ownership boundary for direct `runtime.shutdown()` versus local-server shutdown and multiple adapters on one instance. Do not silently invent reference counting; preserve supported simple workflows.
4. Prefer the smallest shared lifecycle seam, preserve readiness error identity, HTTP drain order, signal ownership, and error aggregation.

Acceptance criteria:

- A deferred caller init that acquires a tracked resource after release cannot outlive completed teardown; cleanup follows acquisition and runs once.
- Cover local shutdown, direct runtime shutdown during serverless init, and rejected caller init, with no late server listen or request dispatch after stop.
- Occupied-port startup with initialized DB/caller resources rejects readiness and cleans those resources even when the caller subsequently invokes local shutdown.
- CLI startup fails in bounded time without leaked sockets/connections, unhandled rejection, or duplicated signal handlers.

Verification: focused lifecycle/CLI subprocess tests, V3 if shared code changes, then V1/V2. Coordinate shared task records rather than duplicating an existing fix.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/index.ts` — added `pendingAdapterInits` entry tracking with resolve-on-release so `shutdown()` and composed local shutdown wait for deferred caller acquisition without deadlock (failing adapters release before rollback shutdown); serverless handler now owns cold-start memoization/`reset()` with an inner no-init express handler plus terminal dispatch guards before and after init; local adapter wraps caller `onShutdown` once (pending-join then no-op, never replays failure) and returns wrapped `ready` (original listen error preserved, aggregated only when rollback also fails via `combineLifecycleErrors`) and wrapped `shutdown` (express drain first, then idempotent composed cleanup preserving first error); `runComposedShutdown` pre-waits for pending adapters so caller cleanup follows acquisition. No `express-runtime` change; HTTP drain, signal ownership, and error aggregation preserved.
  - `packages/access-router-runtime/test/lifecycle-harness.test.ts` — 4 regressions with deferred barriers (no sleeps): deferred caller + local shutdown ordering/no-late-listen/once; direct runtime shutdown during serverless caller init with no dispatch plus terminal second invocation; rejected caller init second invocation + reset terminality with no dispatch; occupied-port EADDRINUSE with DB/caller cleanup preserved across subsequent local shutdown.
  - `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` — ownership boundary: runtime shutdown terminal + waits but never closes HTTP; local shutdown drains then cleans once; failed ready rolls back once; serverless memoized cold start with no dispatch after terminal; no refcounting, one runtime per independent lifecycle.
- Contract decisions:
  - No refcounting and no shared-code change: single-runtime terminality documented; multiple adapters share fate; simple one-runtime/one-adapter workflows unchanged.
  - Readiness identity: listen `EADDRINUSE` rethrown identical on successful rollback, aggregated primary-first only when rollback also fails; caller-init failure path unchanged (primary/Aggregate preserved).
  - Exactly-once: caller `onShutdown` once wrapper (concurrent join, later no-op success so a prior failure is not duplicated); runtime shutdown single-flight/failed-retry preserved.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/lifecycle-harness.test.ts` — 1 file, 38 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 118 tests passed (includes existing CLI subprocess bounded-time/signal/drain suites).
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean.
  - V3 not required (no shared `express-runtime` change).
- Follow-ups: none new; B03/B04/B05/B01 suites preserved within V1.

### Task ARRT-B06: Snapshot Structured Connection Options Accurately

Status: completed

Kind: defect

Priority: P2, because security-sensitive connection configuration can change after construction despite the snapshot contract.

Suggested agent: configuration-encapsulation specialist

Dependencies: ARRT-B02

Primary ownership: `packages/access-router-runtime/src/index.ts` config snapshots and mutation tests in `test/index.test.ts`.

Finding: `snapshotDbConfig` copies `options` one level only. Nested authentication objects and option arrays remain shared with the caller and public snapshot, while `openUri` consumes the captured options later. Current mutation coverage changes scalar options/top-level references only. This is trusted configuration integrity, not an untrusted-input exploit.

References: `packages/access-router-runtime/src/index.ts:242-247,256-284,313`; `packages/access-router-runtime/src/database.ts:156`; `packages/access-router-runtime/test/index.test.ts:181-221`; prior ARRT-09.

Requirements:

1. Establish a safe snapshot policy for plain structured option values, including nested objects/arrays, without cloning/freezing Mongoose connections, schemas, functions, or opaque driver instances indiscriminately.
2. Prevent nested mutations through either the original config or the public config view from altering lifecycle options. Document intentional opaque references and avoid overclaiming a deep runtime freeze.

Acceptance criteria:

- Mutating original nested `auth` and structured array options after construction does not change arguments later passed to `openUri`.
- JavaScript mutation through `runtime.config` cannot change those captured options.
- Supported opaque values retain required identity/behavior; no JSON round-trip loses functions or typed values.

Verification: focused snapshot regressions, strict declarations if types change, V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/index.ts` — added plain-structure-only `cloneSnapshotValue`/`freezePlainSnapshotValue` helpers with `isPlainSnapshotObject` guard; `snapshotDbConfig` now deep-clones plain nested `db.options` (arrays/plain objects) while keeping functions, class instances, Buffers/Dates/Maps/Sets, and Mongoose connections/schemas by reference (no JSON round-trip); `createContextConfigSnapshot` deep-freezes only the cloned plain `db.options` structure before freezing the public `db` view, keeping lifecycle and public snapshots independent.
  - `packages/access-router-runtime/test/index.test.ts` — added 2 regressions: original-config nested `auth` + `readPreferenceTags`/`compressors` mutation isolation verified via `openUri` args; public `runtime.config` nested mutation throws `TypeError` (frozen plain structure) with lifecycle args unchanged, plus opaque identity (`pkFactory` class instance, function, `Date`, `Buffer` retained by reference with behavior intact).
- Contract decisions:
  - Opaque references intentional and documented in code: only `Object.prototype`/`null`-prototype objects and arrays are cloned/frozen; all other values are shared unfrozen by design, so the public view is not claimed as a full deep freeze.
  - Lifecycle vs public isolation: `snapshotDbConfig` is called separately for the lifecycle capture and the public snapshot, so neither original-config nor public-view nested plain mutations can alter the other.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/index.test.ts` — 1 file, 20 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 120 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; B03/B04/B05/B01/B02 suites preserved within V1.

### Task ARRT-B07: Complete Pre-Construction Router And Collection Validation

Status: completed

Kind: defect

Priority: P2, because equivalent config representations receive inconsistent validation and malformed required fields reach side effects.

Suggested agent: config-boundary specialist

Dependencies: none

Primary ownership: `packages/access-router-runtime/src/config-loader.ts` and `test/config-loader.test.ts`; avoid database/lifecycle files owned by the core stream.

Finding: `getRouterName` silently ignores absent/null/primitive routers although public model/data definitions require router objects. A missing data router is then dereferenced after earlier models have registered. Collection collision tracking uses definition-level overrides or existing-model collections but omits schema-option collections, contrary to the documented explicit/resolved collision contract. Existing collision tests cover only definition-level strings.

References: `packages/access-router-runtime/src/config-loader.ts:138-147,179-228,245-265`; `packages/access-router-runtime/src/index.ts:329-348`; `packages/access-router-runtime/test/config-loader.test.ts:279-291`; `packages/access-router-runtime/README.md:279`; prior ARRT-02 and fresh schema-collection probe.

Requirements:

1. Validate required router container shapes before any model/router assembly, with path-qualified field diagnostics. Do not duplicate all nested access-router validation.
2. Account for schema-configured collection names with Mongoose's explicit override precedence. State the boundary for implicit pluralized names and external connections rather than guessing a new cross-database policy.
3. Keep construction rollback in B04 independent: validation cannot guarantee downstream hooks never throw.

Acceptance criteria:

- Missing/null/primitive/array router values fail with a field-specific error before registration; valid empty model router options retain supported behavior.
- Duplicate schema-option collections and mixed schema-option/definition-level collisions are rejected before registration; a legitimate explicit override avoids a false collision.
- Direct creation, sync config loading, and generated-entry normalization share the same validation outcome.

Verification: focused config tests with registration spies, then V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/config-loader.ts` — added `assertRouterContainer()` requiring `models[i].router` and `data[i].router` to be plain objects (missing/null/primitive/array fail with `field "models[i].router must be a plain object` / `data[i].router` before any model/router assembly; valid empty `{}` passes, nested access-router options not duplicated); added `getSchemaOptionCollection()` (`schema.get('collection')` with `schema.options.collection` fallback) with explicit definition-level override precedence; schema-backed resolved collection now participates in the shared duplicate-collection set covering schema-option/schema-option, mixed schema-option/definition-level, and schema-option/existing-model collisions. Boundary stated in code: implicit pluralized names not inferred; no new cross-database policy for external/different connections.
  - `packages/access-router-runtime/test/config-loader.test.ts` — added 3 regressions: router-container table (missing/null/string/number/array fail via both `normalize...` and `validate...` with `modelNames()` spy proving no registration, empty `{}` passes); schema-option duplicate + mixed definition-level + mixed existing-model rejected, explicit override (`collection` over schema option) passes; shared-outcome check across direct `validateAccessRouterRuntimeConfig`, generated-entry `normalize...`, and sync `loadAccessRouterRuntimeConfigSync` (temp TS files) for both router and collection cases.
- Contract decisions:
  - Container-only validation: plain-object check preserves B04 construction rollback independence — downstream router/finalize hooks can still throw and are still covered by B04 sync rollback.
  - Collection precedence: definition-level string wins over schema option; empty-string definition ignored for tracking (backward compatible); only non-empty explicit/resolved names tracked.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/config-loader.test.ts` — 1 file, 18 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 123 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; B03/B04/B05/B01/B02/B06 suites preserved within V1.

### Task ARRT-B08: Reject Async Config Without Orphaned Promise Rejections

Status: completed

Kind: defect

Priority: P2, because catching the documented validation error can still leave an uncontrolled process-level rejection.

Suggested agent: Node config-loading specialist

Dependencies: ARRT-B07

Primary ownership: `packages/access-router-runtime/src/config-loader.ts`, config-loader/subprocess tests.

Finding: Factories execute before the normalizer rejects their promise result. A rejected async factory or already-rejected native Promise remains unobserved even when the caller catches the validation error. Existing tests cover resolving async factories and inert thenables only.

References: `packages/access-router-runtime/src/config-loader.ts:49-68,288-325`; `packages/access-router-runtime/test/config-loader.test.ts:112-119,142-153`; prior ARRT-02/11; fresh rejection-event probe.

Requirements:

1. Retain synchronous-only exports and one deterministic path-qualified diagnostic. Avoid invoking identifiable unsupported async factories where practical.
2. Safely observe already-created native promise rejections on all rejected export paths without making config normalization asynchronous or blindly invoking arbitrary thenables.
3. Preserve supported default object, synchronous factory, and named object forms.

Acceptance criteria:

- Isolated subprocesses catch the normalization error for rejecting factories and rejected native promises, then survive an event-loop turn without unhandled rejection or a second uncontrolled diagnostic.
- Cover raw/default/named exports and a synchronous function returning a rejected promise.
- Arbitrary thenable fixtures remain rejected without relying on executing their `then` body for cleanup.

Verification: focused config/subprocess cases, V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/config-loader.ts` — added `observeNativePromiseRejection()` (`instanceof Promise`-only `then(undefined, noop)` attach, never invokes arbitrary thenables) called on every rejected path (raw thenable, factory results, `assertPlainConfigObject` fallback covering direct default/named promises) without making normalization async; added `isAsyncFactory()` (constructor-name + `Object.prototype.toString` tag for `AsyncFunction`/`AsyncGeneratorFunction`) so identifiable async factories throw the deterministic path-qualified sync-only diagnostic without invocation. Sync-only contract, single `Invalid access-router-runtime config "<path>"` error, and default-object/sync-factory/named-object forms preserved.
  - `packages/access-router-runtime/test/config-loader.test.ts` — added 4 regressions: async factories (raw + default) throw sync error with zero invocations; arbitrary thenables (raw/factory/named) throw with `then` body never executed; 5 isolated subprocesses (raw/default/named rejected native promises + raw sync-fn and default factory returning rejected promises) catch the path-qualified error and survive a 50ms event-loop turn with exit 0 and no `unhandledRejection`; avoidance subprocess proves async factories uninvoked and thenables untouched with no second diagnostic.
- Contract decisions:
  - Native-only observation: strictly `instanceof Promise`, so cross-realm-looking fakes with a `then` method are never touched; native derived promise from the no-op handler resolves, leaving no unhandled rejection.
  - Async avoidance message reuses the existing sync-only diagnostic (`config export must be a synchronous object, not a promise or thenable.`) so no new error shape; sync functions returning rejected promises are still invoked (undetectable without running) then observed.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/config-loader.test.ts` — 1 file, 22 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 127 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; B03-B07 suites preserved within V1.

### Task ARRT-B09: Remove Build-Machine Paths From Config Diagnostic Labels

Status: completed

Kind: defect

Priority: P2, because absolute CLI input survives in deployed output despite the path-free artifact contract.

Suggested agent: Node build-artifact specialist

Dependencies: none

Primary ownership: `packages/access-router-runtime/src/cli-utils.ts`, relevant call sites in `src/cli.ts`, `test/cli-utils.test.ts`, `test/artifact-harness.test.ts`.

Finding: Generated entries correctly use absolute imports for bundling, but also embed unmodified `configPath` in a runtime diagnostic string. Absolute CLI targets therefore retain build-machine paths after import resolution. This does not reintroduce Jiti at runtime or source-file dependence. Existing relocation assertions do not establish absolute-target coverage. Both generators also accept and discard `tsconfigPath`, obscuring the fact that the shared build helper owns alias resolution.

References: `packages/access-router-runtime/src/cli-utils.ts:118-149`; `packages/access-router-runtime/src/cli.ts:30,40`; `packages/access-router-runtime/test/artifact-harness.test.ts:59-60`; prior ARRT-03.

Requirements:

1. Separate build-time import resolution from a sanitized, non-machine-specific diagnostic label. Do not weaken useful config errors or path escaping.
2. Remove or explain the unused internal generator parameter after checking callers; continue passing tsconfig to the actual shared bundler.

Acceptance criteria:

- Local and serverless artifacts built with an absolute target run after source removal/relocation and contain no original fixture source-root diagnostic string.
- Relative targets and paths containing spaces/quotes remain valid; alias-relocation tests still pass.
- Generated modules retain no runtime source-config/tsconfig loader dependency, and generator signatures describe their actual responsibility.

Verification: executable artifact regressions, V1/V2; V5 at final integration.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/cli-utils.ts` — both generators now resolve the static import to the absolute config path (unchanged build-time bundling behavior) but pass only `basename(absoluteConfigPath)` as the `normalizeAccessRouterRuntimeConfigExport` diagnostic label, still `JSON.stringify`-escaped. Removed the accepted-and-discarded `tsconfigPath` parameter; JSDoc on each generator states the contract (absolute import for resolution, file-name-only label, tsconfig/alias resolution owned by the shared bundler).
  - `packages/access-router-runtime/src/cli.ts` — `build`/`build-serverless` callers pass only `configPath`; `--tsconfig` still flows to the actual shared bundler via `runBuildEntryCommand` (`args.tsconfigPath` → `buildBundleFromEntryContent`), unchanged.
  - `packages/access-router-runtime/test/cli-utils.test.ts` — existing no-`tsconfig`-embed assertions kept (single-arg calls); added absolute-target regressions for both generators (absolute import line kept, diagnostic line is file-name-only with no machine directory); spaces/quotes escaping assertion updated for the absolute import plus basename label.
  - `packages/access-router-runtime/test/support/artifact.ts` — `probeRelocatedAccessRouterArtifacts` accepts `{ configArgStyle: 'relative' | 'absolute' }` (default relative); absolute mode passes the absolute config and tsconfig paths to both `build` and `build-serverless`.
  - `packages/access-router-runtime/test/artifact-harness.test.ts` — new absolute-target regression: local and serverless artifacts built with an absolute target run after source removal/relocation and contain no fixture source-root string plus no `loadAccessRouterRuntimeConfigSync`/`createConfigJiti`/`createJiti(` loader dependency.
- Contract decisions:
  - Label policy: uniform `basename` for both relative and absolute inputs (non-machine-specific, still identifies the file in config errors); path escaping preserved via `JSON.stringify`. No new error shape; config validation diagnostics otherwise unchanged.
  - Unused parameter removed (not merely explained): the only callers were the two `cli.ts` build call sites, both updated; tsconfig continues to reach the shared bundler through `args.tsconfigPath`, so `@fixture/*` alias resolution is unaffected (proven by the alias-based relocation harnesses passing with spaces/quotes fixtures).
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/cli-utils.test.ts test/artifact-harness.test.ts` — 2 files, 12 tests passed.
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 130 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; V5 deferred to final integration per task scope.

### Task ARRT-B10: Align Dev Metadata With The Actual Watch Contract

Status: completed

Kind: defect

Priority: P2, because public hover documentation claims ignored values control watch scope and timing.

Suggested agent: public API/documentation specialist

Dependencies: ARRT-B06, ARRT-B08, ARRT-B09

Primary ownership: `packages/access-router-runtime/src/index.ts:155-161`, config validation/docs as necessary, CLI contract tests.

Finding: Public `dev.watch/ext/delay` JSDoc calls these CLI defaults, but the CLI never consumes them. This is intentional supervisor isolation from ARRT-04; bare `--watch` uses `.`. The validator still treats these fields as active config. Shared ERT-B11 tightened real timer bounds, but the unused runtime metadata is not a demonstrated timer-overflow vulnerability.

References: `packages/access-router-runtime/src/index.ts:155-173`; `packages/access-router-runtime/src/config-loader.ts:90-109`; `packages/access-router-runtime/src/cli.ts:17-24`; `packages/access-router-runtime/src/cli-utils.ts:81-87,109-111`; prior ARRT-04 resolved decision.

Requirements:

1. Correct JSDoc, README, website, and tests to state the actual explicit-CLI watch behavior. Do not restore executable config evaluation in the supervisor.
2. Maintainer decides whether ignored shipped fields remain documented/deprecated metadata or are removed through a breaking change. At minimum the default claims must disappear; removal is not a prerequisite for that correction.

Acceptance criteria:

- Emitted declarations and shipped docs no longer imply these values affect supervisor scope, extensions, or delay.
- A distinctive config metadata fixture does not alter supervisor options or execute config in the parent.
- CLI watch flags and bare-watch behavior remain correct, with migration guidance for any removal.

Verification: CLI contract/declared-doc checks and V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/index.ts` — `AccessRouterRuntimeDevOptions` JSDoc rewritten: fields marked `@deprecated` ignored metadata; supervisor uses only explicit `--watch`/`--ext`/`--delay` with bare `--watch` defaulting to `.` and never loads config in the parent. No executable config evaluation restored.
  - `packages/access-router-runtime/src/config-loader.ts` — `validateDevConfig` keeps shape validation for backward compatibility with an explicit ignored-metadata comment; no behavior change.
  - `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` — config shape, validation bullets, CLI notes, and migration guidance updated together: `dev` accepted as ignored deprecated metadata, watch control is explicit CLI flags only, remove `dev` when convenient (no breaking removal).
  - `packages/access-router-runtime/test/config-loader.test.ts` — renamed dev test to ignored-metadata contract; added valid distinctive `dev: { watch: ['./should-not-watch'], ext: ['distinctive-ext'], delay: 12345 }` acceptance alongside existing invalid-shape rejections.
  - `packages/access-router-runtime/test/cli-utils.test.ts` — new contract test: distinctive dev metadata preserved by the normalizer while CLI watch normalization stays flag-only (bare `--watch` → `--watch=.`, explicit flags unchanged).
  - `packages/access-router-runtime/test/cli-runtime.test.ts` — new subprocess regression: distinctive dev metadata config under `dev --watch` leaves no `supervisor-eval.txt`/`supervisor-init.txt` (config not executed in parent) with exactly one child eval/init.
- Contract decisions:
  - Maintainer decision (retain/deprecate, no breaking removal): keep `dev.watch`/`ext`/`delay` as ignored deprecated metadata with corrected JSDoc + docs + migration guidance. Rationale: removal would be a breaking change for shipped configs with zero runtime benefit since the supervisor already ignores the fields; shape validation retained so malformed values still fail fast. Trivially-safe removal was rejected because unknown external configs may still set these fields.
  - Default claims removed everywhere: no JSDoc, declaration, README, or website text now implies these values affect supervisor scope/extensions/delay.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS); verified `dist/index.d.mts` shows `@deprecated Ignored metadata` with no default claims.
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/cli-utils.test.ts test/config-loader.test.ts` — 2 files, 33 tests passed.
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/cli-runtime.test.ts -t "watch"` — 2 passed, 11 skipped (both supervisor-isolation cases).
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 132 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Follow-ups: none new; B06/B08/B09 behavior preserved within V1.

### Task ARRT-B11: Make Heterogeneous Model Registry Inference Sound

Status: completed

Kind: defect

Priority: P2, because widened model names can claim every registry entry is every model type.

Suggested agent: TypeScript declaration specialist

Dependencies: ARRT-B10

Primary ownership: `packages/access-router-runtime/src/index.ts` registry/config generics, `test/strict-consumer-types.test.ts`, relevant packed fixtures.

Finding: The model registry intersects per-definition records. A widened or omitted name falls back to `string`, producing intersected string-index records for heterogeneous models rather than an honest mapping/fallback. `defineRuntimeConfig` does not preserve literals with a const generic, and current positive fixtures explicitly use a single `'User' as const`, masking ordinary usage and negative assignability cases.

References: `packages/access-router-runtime/src/index.ts:38-65,201-203`; `packages/access-router-runtime/dist/index.d.mts:20-34`; `packages/access-router-runtime/test/strict-consumer-types.test.ts:150-171`; `packages/access-router-runtime/test/packed-consumer.test.ts:319-325,346-350`; prior ARRT-09.

Requirements:

1. Preserve literal-name inference for ordinary inline configuration where practical without forcing pervasive assertions.
2. Use a truthful dynamic/unnamed fallback instead of intersecting all possible model values under every key; explicitly handle lookup absence where appropriate.
3. Preserve supplied model typing and readonly registry contracts without widening everything to `any`.

Acceptance criteria:

- Strict packed ESM/CJS NodeNext and Bundler fixtures use two incompatible model shapes with inline, literal, dynamic, and omitted names.
- Known model keys yield the correct model type; cross-model assignments are rejected rather than accepted through intersections.
- Dynamic/omitted-name lookups require the documented uncertainty handling and do not claim impossible simultaneous model shapes.

Verification: strict consumer/packed type tests with negative assertions, V1/V2. Record consumer-visible type tightening in migration notes.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/index.ts` — `defineRuntimeConfig`/`createAccessRouterRuntime`/`createAccessRouterRuntimeApp` use `const` generics for literal-name inference; replaced the intersect-everything registry with `RuntimeKnownModelRecords`/`RuntimeKnownModelRegistry` (literal names only, intersected by key), `RuntimeDynamicModelValues` (widened/omitted `string` names only), and `RuntimeAllModelValues` fallback (`{ [K in string]: union | undefined }` only when dynamic exists, otherwise `unknown`). Known keys keep their exact `mongoose.Model<T>`; dynamic/omitted lookups are `union | undefined`. Supplied model typing and `Readonly` contracts preserved, no `any` widening.
  - `packages/access-router-runtime/test/strict-consumer-types.test.ts` — hetero fixture with incompatible `User`/`Org` plus `Audit` existing model; inline `'User'` (no assertion), `'Org' as const`, `string` dynamic name, omitted-name existing model; positive known-key assignments, `@ts-expect-error` cross-model rejections, `@ts-expect-error` direct dynamic/omitted assignments with `!== undefined` handling.
  - `packages/access-router-runtime/test/packed-consumer.test.ts` — `consumer.nodenext.mts` (ESM), `consumer.require.cts` (CJS), and `consumer.bundler.ts` (Bundler, plus direct inline `createAccessRouterRuntime` literal check) all use two incompatible shapes with inline/literal/dynamic/omitted names and the same positive/negative/`undefined`-handling assertions.
  - `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` — minimal migration notes: known keys keep exact type, dynamic/omitted lookups are `union | undefined` with absence-check example; literal inference without `as const` (no CHANGELOG edit per constraints).
- Contract decisions:
  - Literal preservation relies on `const` generics on the config entry points; inner `satisfies` on the argument would widen before inference, so fixtures check App/Config compatibility without inner `satisfies` (outer assignment check), matching ordinary `defineRuntimeConfig({...})` usage.
  - Dynamic fallback is union plus `undefined` (absence explicitly handled); known keys do not carry `undefined` and stay directly assignable.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/strict-consumer-types.test.ts` — 1 file, 1 test passed.
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/packed-consumer.test.ts` — 1 file, 4 tests passed (Mongoose 8/9 matrix with new hetero NodeNext ESM/CJS + Bundler tsc checks).
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 132 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
  - Failing-before note: old `Record<string, Model<A>> & Record<string, Model<B>>` accepts `const cross: Model<B> = registry.User` and `const direct: Model<A> = registry[stringVar]` (verified with isolated tsc probe, exit 0), so the new `@ts-expect-error` assertions fail before and pass after.
- Follow-ups: none new; B10 dev-metadata contract preserved within V1.

### Task ARRT-B12: Expose And Document Custom-Route Authorization Context

Status: completed

Kind: improvement

Priority: P2, because missing contextual typing and unclear guard responsibility encourage incorrect custom authorization assumptions.

Suggested agent: access-router API/security documentation specialist

Dependencies: ARRT-B11

Primary ownership: `packages/access-router-runtime/src/index.ts:93-115`, custom-route request/type tests, README and matching website examples.

Finding: Model custom-route handlers are typed with plain Express `Request`, hiding the delegated `ModelRequest.macl` API. Existing tests intentionally expect custom endpoints to succeed with `operationAccess: false`; these routes do not automatically acquire generated-operation checks. README describes routing/return semantics without explicitly explaining that authorization responsibility. This is not evidence that generated CRUD guards are bypassed.

References: `packages/access-router-runtime/src/index.ts:93-102,337-339`; `packages/access-router-runtime/dist/index.d.mts:40-45`; `packages/access-router-runtime/test/index.test.ts:462-509`; `packages/access-router-runtime/README.md:62-67,326`; `packages/access-router/src/routers/model-router.ts:52`; `packages/access-router/src/interfaces/base.ts:270-271`.

Requirements:

1. Expose the supported model request-core/ACL contract through custom-handler contextual typing, using the delegated public type rather than inventing a parallel request API.
2. Explicitly document that custom routes require their own guard and do not inherit a guessed CRUD operation's authorization. Include a correct guarded example.
3. Preserve existing custom-route behavior; do not silently map arbitrary methods or paths onto CRUD permissions.

Acceptance criteria:

- A packed consumer can access the supported ACL API in a custom handler without casts.
- A caller-supplied guard denies an unauthorized custom request and permits an authorized request in focused integration tests.
- Shipped docs distinguish request-core setup from automatic authorization, and existing generated-route guards remain unchanged.

Verification: custom-route request tests, packed strict type fixtures, V1/V2.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/src/index.ts` — `AccessRouterRuntimeCustomRouteHandler` now takes `AccessRouterRuntimeCustomRouteRequest` (new exported alias for the delegated public `ModelRequest` from `@web-ts-toolkit/access-router/advanced`, type-only import, no parallel request API) instead of plain Express `Request`; JSDoc states request-core setup is not authorization and custom routes must enforce their own guard. Registration wraps the handler in a pass-through adapter to the plain-Express `JsonRouter` registrar with identical return-value semantics; no method/path is mapped onto CRUD permissions and generated-route guards are untouched.
  - `packages/access-router-runtime/test/index.test.ts` — 2 focused integration tests with caller-supplied `req.macl.isAllowed` guards (no casts): `operationAccess: false` denies with 403, `operationAccess: { read: true }` permits with 200 (plus `getPublicService` access). Custom GET paths nest under `/:id/profile` because generated `GET /:id` claims bare GET paths first (found while writing the tests: a bare `/profile` path never reached the custom handler and returned the generated-route 401/ObjectId-cast errors).
  - `packages/access-router-runtime/test/packed-consumer.test.ts` — NodeNext ESM, CJS, and Bundler fixtures each mount a custom route using `req.macl.isAllowed` with `boolean` annotation and no casts (strict tsc checks).
  - `packages/access-router-runtime/test/public-api-surface.test.ts` — exact-export list extended with `AccessRouterRuntimeCustomRouteRequest`.
  - `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` — custom-route section documents the request type, the setup-vs-authorization distinction, the own-guard requirement, and no CRUD mapping; both include a correct guarded `isAllowed` example (README also gains a Custom-Route Authorization section; no CHANGELOG edit per constraints).
- Contract decisions:
  - Delegated type via the `advanced` subpath because `ModelRequest` is not re-exported from the access-router root; the runtime package does not invent or re-declare the request shape. No access-router source change was needed.
  - Internal `req as AccessRouterRuntimeCustomRouteRequest` cast is confined to the registration adapter and is sound because the model router's request-core middleware always runs before custom routes; consumer-facing typing needs no casts.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS); `dist/index.d.mts` exposes `AccessRouterRuntimeCustomRouteRequest = ModelRequest` with the `advanced` import.
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/index.test.ts test/route-order.test.ts` — 2 files, 27 tests passed.
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/packed-consumer.test.ts test/strict-consumer-types.test.ts` — 2 files, 5 tests passed (Mongoose 8/9 packed matrix with new ACL fixtures).
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 134 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
  - Failing-before note: the exact-export surface test failed before its list update (new export), passing after; the two guard tests were written against the new typed `req.macl` API (plain-Express `Request` has no `macl`, so they do not compile against the old type).
- Follow-ups: none new; B01-B11 suites preserved within V1.

### Task ARRT-B13: Test A Minimally Provisioned Installed Consumer

Status: completed

Kind: improvement

Priority: P3, because the current packed matrix can mask missing dependency edges but no current broken edge was demonstrated.

Suggested agent: npm packaging/test-isolation specialist

Dependencies: ARRT-B12

Primary ownership: `packages/access-router-runtime/test/packed-consumer.test.ts`; no metadata changes without a reproduced dependency failure.

Finding: The transformed packed-consumer suite installs every internal workspace package as a direct dependency. This is genuine packaging coverage, but a missing transitive dependency edge can be hidden by those extra root dependencies. Previous ARRT-10 already implemented packing, conditional declarations, and peer coverage; do not duplicate those facilities.

References: `packages/access-router-runtime/test/packed-consumer.test.ts:60-71,188-224`; `packages/access-router-runtime/package.json:48-55`.

Requirements:

1. Add a minimal fixture declaring only this runtime package, supported peers, and required compiler tooling as direct dependencies. Keep tarball overrides for transitive resolution without declaring all overridden packages at the consumer root.
2. Preserve the existing broad peer/CLI matrix and actual publish-manifest transformation.
3. Prevent ambient workspace dependencies or symlinks from satisfying missing consumer dependencies.

Acceptance criteria:

- Minimal packed ESM import, CJS require, and strict declaration compilation pass in an isolated consumer directory.
- Fixture manifests and resolution evidence show internal dependencies are reached through declared package edges, not accidental workspace fallback.
- New harness cost is recorded; reuse packing/install setup where safe rather than multiplying the full matrix unnecessarily.

Verification: focused packed-consumer tests and V1/V2. This improvement can be explicitly deferred with a fidelity-risk note if install prerequisites are unavailable.

Completion evidence:

- Changed files:
  - `packages/access-router-runtime/test/packed-consumer.test.ts` (only file changed; no metadata, CHANGELOG, or dist edits) — added `installMinimalPackedConsumer()` (declares only `@web-ts-toolkit/access-router-runtime` plus `express`/`mongoose` peers and `@types/express`/`@types/node`/`typescript` tooling; `pnpm-workspace.yaml` keeps all tarball overrides for transitive resolution with `packages: []`), `runMinimalConsumerMatrix()` (reuses `writeConsumerRuntimeFiles`/`writeConsumerTypeFiles` ESM/CJS/ownership plus NodeNext/CJS/Bundler strict tsc and `tsconfig.json`-extends checks), `assertIsolatedTransitiveResolution()` (root manifest declares no other internal package, no transitive internal hoisted at consumer root, plain-node subprocess resolution through the installed runtime edge lands on `testVersion` copies outside the workspace checkout), and one `runs and compiles a minimally provisioned packed consumer` test on a single Mongoose 9 peer reusing the shared `preparePackedWorkspace()` pack cache. Broad Mongoose 8/9 matrix, CLI checks, and publish-manifest transformation assertions unchanged.
  - `run()` gained an optional env parameter plus `isolatedEnv()` which strips `NODE_PATH`; the minimal install and all minimal consumer subprocesses (node ESM/CJS/ownership, tsc, resolution probes) run with it.
- Contract decisions:
  - Single-peer (Mongoose 9) minimal coverage bounds new harness cost instead of duplicating the full 8/9 matrix; the shared tarball pack cache is reused.
  - Resolution evidence comes from plain-node consumer subprocesses, not in-process `require.resolve`: the vitest worker injects `NODE_PATH` pointing at the workspace pnpm store (observed `resolvedEntry=.../packages/access-router/dist/index.js` before isolation), which would mask a missing edge. With `NODE_PATH` stripped, the probe resolves transitives through the runtime's real virtual-store path (Node does not realpath custom `paths` entries before lookup, so the symlinked root entry alone cannot see isolated siblings) and asserts versions plus non-workspace realpaths.
- Commands/results (serialized, from repository root unless noted):
  - `pnpm --filter @web-ts-toolkit/access-router-runtime... build` — success (tsup CJS/ESM/DTS).
  - From `packages/access-router-runtime`: `pnpm exec vitest run --config vitest.config.mts test/packed-consumer.test.ts` — 1 file, 5 tests passed (4 pre-existing + 1 new minimal).
  - `pnpm --filter @web-ts-toolkit/access-router-runtime test` (V1) — 12 files, 135 tests passed.
  - `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` and `git diff --check` (V2) — clean, no output.
- Harness cost: new minimal test adds ~20s (one isolated `pnpm install` plus ESM/CJS/ownership/3×tsc/resolution probes); full packed file ~58s, full V1 ~106s. No new pack pass (shared cache reused).
- Follow-ups: none new; install prerequisites were available so no deferral needed.

### Task ARRT-B14: Independently Verify Boundary Remediation

Status: completed

Kind: improvement

Priority: P1, because individual fixes do not prove cross-layer startup/disposal and installed-consumer contracts compose correctly.

Suggested agent: independent reviewer who did not implement the core tasks

Dependencies: ARRT-B01, ARRT-B02, ARRT-B03, ARRT-B04, ARRT-B05, ARRT-B06, ARRT-B07, ARRT-B08, ARRT-B09, ARRT-B10, ARRT-B11, ARRT-B12, ARRT-B13

Primary ownership: this task record and verification evidence. Return implementation failures to their owners rather than broadening scope into unrelated packages.

Finding: This follow-up spans construction, retryable rollback, terminal cleanup, shared HTTP lifecycle, executable config, emitted declarations, and published consumers. Earlier green tests did not cover the newly identified combinations.

References: all findings/tasks in this document; previous runtime remediation and shared express-runtime boundary review linked above.

Requirements:

1. Verify each acceptance criterion independently, including interleavings of construction failure, init retry, concurrent shutdown, replaced/shared models, and caller-init/listen failure.
2. Recheck external ownership and custom-route guard boundaries across direct, local, serverless, and generated-entry paths; confirm no new internal state or build-machine path escapes.
3. Check README, website, public types, actual runtime behavior, and packed artifacts agree. Revisit request-controlled bounds only where these changes introduce new input handling.
4. Run V1-V5 as applicable, serially, and record exact outcomes, prerequisites, failures, and remaining limitations. Any deferral requires maintainer approval and a residual-risk note before adjusting this task's dependency gate.

Acceptance criteria:

- Every implemented task has failing-before/passing-after or equivalent evidence, changed-file references, and successful required verification.
- No unresolved P1 finding is described as fixed. Blocked checks remain blocked with a named prerequisite and owner.
- All approved decisions and migration notes are recorded; independent probes do not rely on suite teardown to hide runtime leaks.
- No unrelated edits are reverted, no unintended generated fixtures remain, and document paths remain repository-relative or generic system paths.

Verification: V1/V2, V3 for shared changes, V4, V5, plus acceptance-by-acceptance evidence review.

Completion evidence:

- Scope discipline: reviewed only `packages/access-router-runtime`, `website/docs/packages/access-router-runtime.md`, and this task record. No source, test, website, or task-record edits outside ARRT-B14. No `CHANGELOG.md` edit and no `dist/` edit (dist is git-ignored; `git status` shows no dist entries). Unrelated worktree (concurrent OIDC-vault store files, `20260812`/`20260823` task records) left untouched; no files reverted.
- Acceptance-by-acceptance review (B01-B13): each task record carries changed-file refs, contract decisions, and exact V1/V2 command outcomes with suite growth 88 (B03) → 135 (B13) tests across a stable 12-file package suite. Failing-before evidence is explicit where the fix is type/surface-shaped (B11 isolated-tsc intersection probe; B12 exact-export surface failure plus non-compiling old `Request` typing) and regression-shaped elsewhere (new real-Mongoose disposal/identity tests B03/B05, construction-rollback tests B04, 22 falsy/cancellation lifecycle tests B01, 4 deferred-barrier adapter tests B02, snapshot-mutation tests B06, router-container/collection table tests B07, async-factory/subprocess rejection tests B08, absolute-target artifact tests B09, supervisor-isolation subprocess tests B10, minimal-consumer isolation test B13). No P1 (B01-B04, B14) is described as fixed without a corresponding regression plus green V1. No blocked checks: all prerequisites (build slot, loopback, packed-install cache) were available, so no deferral or maintainer-approval note was needed. Approved decisions/migration notes recorded per task: B03 app-only restriction + `disconnectOnShutdown: false` semantics, B04 sync-rollback/`AggregateError` policy, B05 borrower-first/creator-last policy, B01 shutdown-authoritative/falsy/`instanceof` policy, B02 no-refcounting terminality, B06 plain-structure-only snapshot policy, B07 container-only/override-precedence boundary, B08 native-only observation/async-avoidance, B09 basename-label/parameter-removal, B10 retain-deprecate dev metadata, B11 union-plus-`undefined` dynamic fallback, B12 delegated `ModelRequest` alias, B13 single-peer minimal matrix cost (~20s).
- Boundary rechecks (source + suite, no broadening): external ownership (borrower-never-deletes, identity-safe delete-only-if-exact-constructor, external close/release outside runtime) holds across direct/local/serverless paths per B02/B05 suites; custom-route guard boundary (delegated `AccessRouterRuntimeCustomRouteRequest`, pass-through adapter, no CRUD mapping, own-guard requirement) holds across direct and packed ESM/CJS/Bundler fixtures per B12 suites; generated-entry path shares direct-creation validation per B07 shared-outcome checks; no new internal mutable state beyond the documented lifecycle/ownership tracking (`pendingAdapterInits` join, `generatedModels` identity map, `hasPendingInitError` flag) and no build-machine path escapes (both generators emit `basename` labels; absolute-target relocation suite passes). Request-controlled bounds revisited: none of B01-B13 introduces new request input handling (trusted-config integrity, typing-only handler signature, ignored dev metadata), so no new bound was required; bounds remain delegated to lower-level packages as stated in the review.
- Contract agreement: README and website custom-route sections both document the delegated request type, setup-vs-authorization distinction, and guarded `isAllowed` example; both document the app-only restriction, borrower lifetime policy, adapter terminality, ignored dev metadata, dynamic-lookup `union | undefined` migration, and basename labels. `dist/index.d.mts` exposes `AccessRouterRuntimeCustomRouteRequest` (3 refs) with `@deprecated` ignored dev metadata (3 refs). Behavior confirmed against the fresh build (see independent probes).
- Independent probes (disposable `node --input-type=module` processes from `packages/access-router-runtime` against fresh `dist/index.mjs`, exited without relying on suite teardown; no server): (a) three schema-only runtimes grew `mongoose.connections` 1→4 and repeated shutdown restored baseline 1 (`baseline-restored true`); (b) valid-A plus incompatible pre-existing-B on one external connection threw the collision diagnostic, left the registry identical (`A-absent true`, `B-intact true`), and a corrected retry constructed; (c) nested `auth`/`readPreferenceTags` mutation through the original config left lifecycle options unchanged while public `runtime.config` nested mutation throws `TypeError` (frozen). Two probe-design artifacts resolved during probing (unsupported per-model `connection` key variant showed no-throw with no pollution; supplied-connection `openUri` spy never fires and uri-init is lazy) — both re-ran in supported forms above; package-suite regressions remain authoritative.
- Commands/results (all serialized from repository root unless noted; prerequisites met: `pnpm install` present, Node >= 22, loopback, packed-install cache):
  - V1 `pnpm --filter @web-ts-toolkit/access-router-runtime test` — 12 files, 135 tests passed (101.30s, includes Mongoose 8/9 packed matrix + minimal consumer).
  - V2 `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` — clean (exit 0); `git diff --check` — clean (exit 0).
  - V3 — N/A: `git diff`/`git status` show no `packages/express-runtime` changes, and no task required a shared-code change (B02 explicitly records none).
  - V4 `pnpm build` — success (exit 0, incl. apps); `pnpm test` — success (exit 0, full serial workspace suites); `pnpm lint` — exit 0 with 0 errors and 3 warnings, all pre-existing unused `eslint-disable` directives in unrelated `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts` (reported separately, not reverted).
  - V5 `pnpm build-artifact -- --version 0.0.0-arrt-boundary` — success (`dist/web-ts-toolkit-0.0.0-arrt-boundary.tar.gz`, commands include `wtt-access-router-runtime`); `pnpm verify-artifact -- --version 0.0.0-arrt-boundary` — `release artifact verified successfully.` Tarball inspection: includes `packages/access-router-runtime/dist/` (`index.js`, `cli.js`, `index.d.ts`) and `bin/wtt-access-router-runtime`.
- Remaining limitations: no real-MongoDB integration, Windows-signal, peer-version-beyond-8/9, or heap/throughput profiling was run (same standing deferrals as the review; throughput claims remain out of scope). Minimal-consumer coverage stays single-peer (Mongoose 9) by approved B13 cost decision. V4's 3 lint warnings are owned outside this package.

## Decisions And Deferrals

- B03 maintainer decision: supported lifecycle/disposal policy for schema-backed app-only creation; preserve `disconnectOnShutdown: false` intent while clarifying caller responsibility. Core regressions can be written before this decision, but public contract changes cannot.
- B05 maintainer decision: lifetime policy for simultaneous schema-registration reuse on an external connection. Identity-safe cleanup can proceed independently of that decision.
- B02 implementer/coordinator must specify adapter ownership, including direct runtime shutdown and multiple wrappers. Escalate to maintainer if this requires restricting shipped behavior.
- B10 maintainer decision: retain/deprecate ignored dev metadata versus a breaking removal. Correcting misleading documentation is not blocked.
- Deferred: speculative request-path caching, broad module decomposition, new providers, and a new async config API. None is justified by the current evidence; startup correctness and retention have higher value.
- Deferred: heap/throughput optimization. B03 has an observable connection-count retention regression, but this review measured neither heap bytes nor latency; do not claim a speedup without a repeatable measurement.

## Definition Of Done And Maintenance

- An agent sets its task `in_progress` only after dependencies complete and ownership is assigned. Use `blocked` for an unmet prerequisite/decision, with owner and unblock action; do not mark partial delivery completed.
- A task becomes `completed` only when its acceptance criteria and required verification pass. Append changed files, exact commands/results, contract decisions, and follow-up IDs without erasing historical findings.
- New findings must be deduplicated and classified as defect, improvement, or bounded investigation before adding independent work. Keep required follow-ups inside their parent task when they share its outcome.
- Public contract changes ship with types, tests, README/website, and migration/release notes together. No compatibility aliases or speculative shared state are added without a concrete supported-consumer need.
- Final integration confirms correct resource ownership, deterministic lifecycle, accurate configuration/types, portable diagnostics, isolated installed-consumer behavior, clean task-document formatting, and explicitly accepted residual risks.
