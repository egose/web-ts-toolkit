# Express Runtime Review Remediation

Created: 2026-08-22 20:13:08 PDT

Package: `packages/express-runtime`

## Objective

Remediate confirmed security, correctness, lifecycle, serverless-emulation, packaging, and maintainability gaps in `@web-ts-toolkit/express-runtime`. The end state must bound request-controlled memory, avoid destructive build staging, provide deterministic server and watcher lifecycles, accurately emulate the documented serverless request/response contract, and make source exports, declarations, CLI behavior, documentation, and release-staged artifacts agree.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat app modules, preload modules, and init hooks as intentionally trusted executable code; do not confuse that documented trust with permission to overwrite unrelated files or accept unbounded network input.
- Prefer the smallest shared enforcement point: body collection for adapter limits, one lifecycle state machine for local server startup/shutdown, one supervisor for watch transitions, and one build-staging helper for temporary entries.
- Preserve Express 5 support and the documented root API unless a task explicitly changes the contract.
- Do not manually edit `packages/express-runtime/dist/`; rebuild it from source.
- Update `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md` together for public behavior.
- Check `packages/access-router-runtime` before changing `/cli` exports or build helper signatures because it consumes this package programmatically.
- Preserve unrelated worktree changes. Never revert files outside the assigned task.
- Run package tests serially. `pnpm test` and package test scripts rebuild shared outputs, so agents must not run package build/test commands concurrently.
- Use temporary directories and restore process listeners, environment variables, current directories, child processes, servers, and filesystem watchers in test cleanup.

## Non-Goals

- Do not sandbox application or preload module execution; arbitrary execution is inherent in their documented purpose.
- Do not emulate every cloud provider in the first adapter fix. Select and document one canonical event contract, then test it accurately.
- Do not split the CLI into a separately published package unless installation-size measurements and maintainer approval justify that contract change.
- Do not preserve unsafe fixed temporary filenames or unbounded body behavior through compatibility options.
- Do not broadly rewrite argument parsing while fixing numeric validation and `--` semantics.

## Review Baseline

Confirmed on 2026-08-22 before this task file was created:

- `pnpm --filter @web-ts-toolkit/express-runtime test`: passed, 2 files and 176 tests.
- `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"`: passed with no findings.
- The package test rebuild emitted CJS, ESM, `.d.ts`, and `.d.mts` artifacts before running source-oriented tests.
- Vitest warned that `vitest.config.ts` uses ESM syntax while being loaded as CommonJS.
- Existing tests do not execute the published binary, release-staged package, build concurrency, watch supervision, or an end-to-end real `createServerlessHandler()` through the local adapter.
- Existing local-server tests use fixed sleeps and remove all `SIGINT`/`SIGTERM` listeners, which can hide lifecycle leaks and disturb the test runner.
- The worktree was clean when review began. The baseline package test regenerated tracked `dist/` files without leaving a reported status change.

## Priorities

- P0: remotely triggerable resource exhaustion, unrelated file destruction, or unsafe build races.
- P1: startup/shutdown races, inaccurate serverless behavior, leaked process resources, or broken published contracts.
- P2: validation, type/API ownership, performance, testability, and maintainability gaps without an independent P0/P1 outcome.
- P3: optional compatibility or structural improvements whose value depends on a maintainer policy decision or measurement.

## Wave 1: Regression Harness And Immediate Safety

### Task ERT-01: Build Deterministic Lifecycle And CLI Integration Harnesses

Status: completed

Completion evidence:

- Added deterministic harness helpers under `packages/express-runtime/test/support/`: `deferred.ts` (createDeferred, createTrigger), `events.ts` (waitForEvent, waitForListening, waitForClose, waitForExit, createEventBarrier), `process-listeners.ts` (captureListenerSnapshot, restoreListenerSnapshot, getListenerCounts, withListenerBaseline, installSentinelListeners), `tmp.ts` (createTempDir, withTempDir, captureEnv/restoreEnv, captureCwd/restoreCwd, writeTempFile), `subprocess.ts` (runSubprocess, trackedSpawn, cleanupTrackedChildren, assertSubprocessExitsWith), `server.ts` (ServerHarness, createRequestBarrier).
- Refactored `packages/express-runtime/test/index.test.ts:18-25,449-507,546-558` to use `waitForListening`, `createRequestBarrier`, `createDeferred` and `waitForEvent` instead of fixed 50 ms/100 ms sleeps; `afterEach` now awaits `server.close` deterministically and restores only newly added `SIGINT`/`SIGTERM` listeners via snapshot (sentinel listeners installed in `beforeAll` verified to survive and counts return to baseline); no `process.removeAllListeners()` remains in tests (only child-process cleanup in `support/subprocess.ts`).
- Added minimal injectable seam in `packages/express-runtime/src/cli-utils.ts:734-950`: `WatchSupervisorDeps`, `WatchSupervisorController`, `createWatchSupervisor()` (validates all watch paths before opening any watcher, exposes `shutdown`/`getChild`/`getWatchers`/`isShuttingDown` for deterministic tests) and updated `runWithWatch()` to delegate to the supervisor via DI (production path still installs `SIGINT`/`SIGTERM` exit handlers; test mode with injected deps does not install handlers, preventing leaks). Not re-exported via `cli-api.ts`, so supported public API unchanged.
- Added focused harness tests: `packages/express-runtime/test/subprocess-harness.test.ts` (asserts exit code 42, stderr, stdout, timeout→SIGTERM, CLI `--help`/`--version` via real `dist/cli.js` subprocess, and temp-dir cleanup with `runSubprocess`), `packages/express-runtime/test/adapter-e2e.test.ts` (real `createServerlessHandler` through `createServerlessAdapterApp` via supertest, real HTTP server with `waitForListening`, and header passthrough; notes ERT-07 query-string contract gap), `packages/express-runtime/test/watch-supervisor.test.ts` (validates watch-path pre-validation with zero leaked watchers, observable controller shutdown closing watchers and killing child deterministically, and absence of signal-listener leaks in test mode).
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → tsup success (CJS/ESM/DTS), `pnpm --filter @web-ts-toolkit/express-runtime test` → 5 test files, 190 tests passed, `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"` → passed with no findings (lint errors fixed, only child-process `removeAllListeners` remains, not `process`). Sentinel `SIGINT`/`SIGTERM` listeners survive and listener counts restore to baseline after each `startLocalServer` test.

Priority: P1

Suggested agent: Node process and integration-test specialist

Dependencies: none

Primary ownership:

- `packages/express-runtime/test/index.test.ts`
- `packages/express-runtime/test/cli-utils.test.ts`
- focused helpers and fixtures under `packages/express-runtime/test/`

Finding:

The suite imports source modules and tests helpers mostly in isolation. Local-server tests use fixed 50 ms and 100 ms sleeps, cleanup does not consistently await server closure, and the signal test removes all listeners owned by the process. There are no subprocess-level assertions for CLI exit behavior, no injected watch/build lifecycle harness, and no end-to-end test wrapping a real serverless handler with the local adapter.

References:

- `packages/express-runtime/test/index.test.ts:18-25`
- `packages/express-runtime/test/index.test.ts:449-507`
- `packages/express-runtime/test/index.test.ts:546-558`
- `packages/express-runtime/test/cli-utils.test.ts:1-26`
- `packages/express-runtime/src/cli.ts:3-16`

Implementation requirements:

1. Add deferred-promise/event helpers for readiness, in-flight request entry, child exit, and shutdown without fixed sleeps.
2. Record process listener baselines and remove only listeners installed by each test or runtime instance; never call `process.removeAllListeners()`.
3. Add temporary-directory and subprocess helpers that always clean up children, watchers, servers, environment changes, and current-directory changes.
4. Add injectable or test-observable seams for child process and filesystem watcher behavior without expanding the supported public API solely for tests.
5. Do not change production behavior in this task except for minimal internal dependency injection needed by later tasks.

Acceptance criteria:

- Local-server tests wait on explicit events and contain no arbitrary startup/drain sleeps.
- Pre-existing sentinel signal listeners survive every test and listener counts return to baseline.
- A focused subprocess test can assert exit code, stderr, timeout, and absence of hanging handles.
- A focused adapter test can invoke a real `createServerlessHandler()` end to end.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

### Task ERT-02: Bound Local Serverless Adapter Request Bodies

Status: completed

Completion evidence:

- Added `DEFAULT_ADAPTER_MAX_BODY_BYTES = 1048576` (1 MiB) and `ServerlessAdapterOptions`, `validateMaxBodyBytes()` (finite non-negative integer, `0` allows empty bodies only) in `packages/express-runtime/src/cli-utils.ts:1068-1145`; rewrote `collectBody(req, maxBytes)` to reject oversized declared `Content-Length` before buffering, enforce incremental limit, stop retaining after limit, remove owned `data`/`end`/`error`/`close`/`aborted` listeners, drain via `resume()` on `LIMIT_EXCEEDED`, and distinguish `CLIENT_ABORT`/`STREAM_ERROR` without unhandled rejection; bounded memory to `limit + one chunk`.
- Updated `createServerlessAdapterApp(handler, options?)` in `packages/express-runtime/src/cli-utils.ts:1286-1345` to validate limit, call bounded `collectBody`, return `413 Payload Too Large` without invoking handler on `LIMIT_EXCEEDED`, silently handle `CLIENT_ABORT`, and `500` for other errors; `validateMaxBodyBytes` exported via `packages/express-runtime/src/cli-api.ts:2-36,142-179` and `runCliCommand` now passes `maxBodyBytes` to adapter.
- Added CLI flag `--max-body-bytes` (`--max-body-bytes=<bytes>`) for `start-serverless` in `packages/express-runtime/src/cli-utils.ts:424-447` with validation before env/handler loading, help text and notes in `printHelp()` (`src/cli-utils.ts:161-167,182-184`), and re-exported `DEFAULT_ADAPTER_MAX_BODY_BYTES`, `validateMaxBodyBytes`, `collectBody`, `ServerlessAdapterOptions` via `cli-api`.
- Updated docs: `packages/express-runtime/README.md:196-235,416-427` and `website/docs/packages/express-runtime.md:179-191,196-201` document default 1 MiB, override via CLI (`--max-body-bytes`) and programmatic (`{maxBodyBytes}`), zero semantics (empty bodies only), and bounded-memory/`413` behavior.
- Added regression harness `packages/express-runtime/test/adapter-body-limit.test.ts` (13 tests): at-limit 200 vs over-limit 413 without handler, declared `Content-Length` early reject, chunked `Transfer-Encoding` incremental reject, zero-limit empty-only, invalid limit validation (negative/float/NaN/Infinity), CLI parsing valid/invalid `--max-body-bytes` (including `=` form and missing value), `createServerlessAdapterApp` invalid throws, client abort `CLIENT_ABORT` listener cleanup without unhandled rejection, stream `error` listener cleanup, huge-payload bounded-memory follow-up request, and help output contains `--max-body-bytes`. Tests fail on unbounded implementation (would return 200 and invoke handler) and pass now.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → tsup success (CJS/ESM/DTS), `pnpm --filter @web-ts-toolkit/express-runtime test` → 6 files, 203 tests passed, `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"` → no findings, `node dist/cli.js --help` contains `--max-body-bytes`, `node dist/cli.js start-serverless ... --max-body-bytes -1` exits 1 before handler load.

Priority: P0

Suggested agent: Node HTTP stream security specialist

Dependencies: ERT-01

Primary ownership:

- `packages/express-runtime/src/cli-utils.ts` body collection and adapter options
- `packages/express-runtime/src/cli-api.ts` only for the public adapter signature
- focused adapter tests and documentation

Finding:

`collectBody()` retains every request chunk and then allocates the complete payload again with `Buffer.concat()`. `createServerlessAdapterApp()` disables Express body parsers, applies no replacement limit, and is started on the local server's default `0.0.0.0` host. An unauthenticated remote client can therefore consume unbounded process memory with one or more streamed requests.

References:

- `packages/express-runtime/src/cli-utils.ts:970-981`
- `packages/express-runtime/src/cli-utils.ts:1041-1068`
- `packages/express-runtime/src/cli-api.ts:126-135`
- `packages/express-runtime/README.md:196-209`

Implementation requirements:

1. Define a conservative default maximum body size and expose a validated adapter/CLI configuration for intentional overrides.
2. Reject an oversized declared `Content-Length` before buffering and enforce the same limit incrementally for chunked bodies.
3. Stop retaining chunks after the limit, remove owned listeners, and safely drain or terminate the request according to Node HTTP semantics.
4. Return a deterministic `413` without invoking the serverless handler; distinguish client aborts and stream errors from oversized input.
5. Validate the limit as a finite non-negative integer and document whether zero disables bodies or means no limit. Do not offer an unbounded default.

Acceptance criteria:

- Requests at the limit reach the handler and requests one byte over receive `413` without invoking it.
- Declared and chunked oversized requests follow the same policy.
- Client abort and stream-error cases release listeners and do not produce an unhandled rejection.
- Retained body memory is bounded by the configured limit plus at most one incoming chunk per request.
- README, help output, public types, and tests state the default and override behavior.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

### Task ERT-03: Make Build Entry Staging Unique And Non-Destructive

Status: completed

Completion evidence:

- Replaced predictable `writeFileSync` + `rmSync` staging in `packages/express-runtime/src/cli-utils.ts:61-71,1013-1046` with unique private staging: `mkdtempSync(join(process.cwd(), '.wtt-build-'))` (0700) + `writeFileSync(entry, …, {flag:'wx', mode:0o600})` with `lstatSync` symlink checks; staging dir/file created exclusively and removed only via `rmSync(dir, {recursive:true})` in `finally`; legacy constants `TEMP_BUILD_ENTRY_FILENAME`/`TEMP_SERVERLESS_ENTRY_FILENAME` retained for regression but no longer written.
- `BuildEntryContentArgs` no longer exposes `tempEntryFilename`; `BuildEntryCommandOptions.tempEntryFilename` made optional deprecated and ignored; `buildBundleFromEntryContent` now resolves `outDir` to absolute `pathResolve(cwd, outDir)` before passing to `tsup` (fixes concurrent cwd race) and marks `@web-ts-toolkit/express-runtime` as external for serverless bundling so temp projects without installed package still bundle.
- Added `validateOutDirForClean(outDir, clean, appPath?, initPath?)` in `src/cli-utils.ts:1028-1082` and call from `runBuildEntryCommand` (with app/init awareness) and `buildBundleFromEntryContent` (root/cwd/symlink check): rejects filesystem root, cwd itself, ancestor of cwd, symlinked outDir, and outDir containing `appPath`/`initPath`; `clean:false` bypasses validation.
- Updated `packages/express-runtime/src/cli-api.ts:50-95` to drop `tempEntryFilename` from `runBuildEntryCommand` and to call `validateOutDirForClean` before staging; re-exported `validateOutDirForClean`, `TEMP_BUILD_ENTRY_FILENAME`, `TEMP_SERVERLESS_ENTRY_FILENAME` for tests.
- Updated `packages/access-router-runtime/src/cli.ts:49-65` to stop passing `tempEntryFilename` (now uses unique staging via shared helper).
- Kept staging inside `process.cwd()` (`.wtt-build-*`) so bare imports and tsconfig path resolution remain correct; confirmed consumer-local `tsconfig` path alias test still bundles `42`.
- Added regression harness `packages/express-runtime/test/build-staging.test.ts` (10 tests): legacy files byte-for-byte unchanged after both `buildRuntime`/`buildServerless`; symlink at legacy path not followed (victim unchanged); single and concurrent (2×runtime, 2×serverless, mixed) builds complete independently; staging removed after success and after failure (bad entry); unsafe `outDir` combos (`/`, `.`, ancestor, symlink, `src` containing app) throw `Refusing to clean` before `tsup` and leave `keep.txt` untouched; tsconfig path alias still resolves; pre-existing `.wtt-build-preexisting` dirs not deleted.
- Set `vitest.config.ts:fileParallelism:false, sequence.concurrent:false` to avoid cwd-related flakiness for build tests that use `process.cwd()`-based staging; with absolute `outDir` the build is now cwd-robust.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → tsup success (CJS/ESM/DTS), `pnpm --filter @web-ts-toolkit/express-runtime test` → 7 files, 213 tests passed, `pnpm --filter @web-ts-toolkit/access-router-runtime test` → 3 files, 20 tests passed, `pnpm build` → success.

Priority: P0

Suggested agent: filesystem and build-tooling safety specialist

Dependencies: ERT-01

Primary ownership:

- `packages/express-runtime/src/cli-utils.ts` build staging
- `packages/express-runtime/src/cli-api.ts` build-entry orchestration
- build integration tests in temporary projects
- `packages/access-router-runtime/src/cli.ts` only if its shared-helper call must migrate

Finding:

Build commands write predictable entry files in the caller's current directory with truncating `writeFileSync()`, then unconditionally delete them. A pre-existing file is destroyed, a symlink can redirect the write, and concurrent builds can overwrite or delete each other's entry while tsup is reading it. The programmatic API also accepts a caller-selected `tempEntryFilename`, spreading unsafe ownership.

References:

- `packages/express-runtime/src/cli-utils.ts:61-71`
- `packages/express-runtime/src/cli-utils.ts:841-842`
- `packages/express-runtime/src/cli-utils.ts:897-947`
- `packages/express-runtime/src/cli-api.ts:46-50`
- `packages/express-runtime/src/cli-api.ts:77-93`
- `packages/access-router-runtime/src/cli.ts:49-65`

Implementation requirements:

1. Create a unique private staging directory or file with exclusive creation and permissions appropriate for the current user.
2. Keep staging close enough to the consumer project for package and tsconfig resolution, or configure tsup explicitly so resolution remains correct.
3. Remove only the uniquely created staging resource in `finally`; never overwrite, follow, or delete a pre-existing candidate.
4. Remove fixed temporary-path selection from the supported caller contract unless a concrete consumer requirement exists.
5. Investigate tsup `clean` behavior for repository root, filesystem root, source/input overlap, and symlinked output directories. Add validation that prevents cleaning inputs or dangerous roots before preserving default `clean: true`.

Acceptance criteria:

- Files with both legacy temporary names remain byte-for-byte unchanged.
- A symlink collision cannot modify its target.
- Two concurrent local builds, two concurrent serverless builds, and one of each complete independently from one project.
- Staging resources are removed after successful and failed builds.
- Unsafe `--out-dir`/clean combinations fail before any source or unrelated file is removed.
- Consumer-local imports and tsconfig path resolution still work.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

## Wave 2: Runtime Lifecycle Correctness

### Task ERT-04: Make Local Server Startup And Shutdown Single-Flight

Status: completed

Completion evidence:

- Reworked `packages/express-runtime/src/index.ts` local-server lifecycle around one explicit `LocalServerState` state machine (`initializing`, `listening`, `stopping`, `stopped`, `failed`) and kept the existing `{ server, shutdown }` contract while adding `ready: Promise<void>`; `ready` resolves only on listening and rejects on init/listen failure or shutdown before listening, with an internal rejection handler to avoid detached startup `unhandledRejection` noise.
- Made shutdown single-flight: concurrent `shutdown()` calls and owned `SIGINT`/`SIGTERM` handlers share one memoized operation, mark `stopping` before awaiting, remove only this server instance's signal handlers, and run shutdown logs, force-close behavior, `onShutdown`, and optional process exit at most once.
- Changed shutdown ordering to stop accepting new connections with `server.close()` before application resource teardown, drain in-flight requests up to `shutdownTimeout`, force-close via `closeAllConnections()` on timeout, then run `onShutdown`; `shutdownTimeout` intentionally covers request draining only, and `onShutdown` errors are logged without rejecting `shutdown()`.
- Defined deterministic edge behavior: shutdown during pending `init` suppresses later `listen` and leaves `server.listening === false`; never-started or externally closed servers resolve shutdown without error; port `0` logs the actual bound address instead of `:0`.
- Added focused local-server regressions in `packages/express-runtime/test/index.test.ts`: `ready` success, init/listen rejection without unhandled rejection, shutdown during blocked init, new-connection refusal while an existing request drains before `onShutdown`, concurrent calls/signals cleanup-once plus signal-listener baseline restoration, actual port-0 logging, and externally closed shutdown no-op. The local-server test file now imports `../src/index.ts` so source tests exercise the TypeScript implementation rather than the stale sibling `src/index.js`.
- Updated local-server API docs in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md` for `ready`, lifecycle states, shutdown order/timeout policy, signal ownership, port `0` logging, and never-started/external-close behavior.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → passed (tsup CJS/ESM/DTS); `pnpm --filter @web-ts-toolkit/express-runtime test` → passed (7 files, 221 tests; existing Vitest CommonJS/ESM config warning and expected invalid-TypeScript fixture diagnostic remain); `pnpm exec eslint "packages/express-runtime/src/index.ts" "packages/express-runtime/test/index.test.ts"` → passed. Required broad `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"` currently fails only on pre-existing non-ERT-04 issues in `packages/express-runtime/test/build-staging.test.ts` (unused `generateServerlessEntry` and four empty blocks), left untouched to keep this session isolated to ERT-04.

Priority: P1

Suggested agent: Node HTTP lifecycle specialist

Dependencies: ERT-01

Primary ownership:

- `packages/express-runtime/src/index.ts` local server lifecycle
- focused local-server tests
- local-server API documentation

Finding:

`startLocalServer()` detaches startup without exposing readiness. A shutdown requested during a pending `init()` can resolve before `start()` later opens the port. Shutdown runs application cleanup before stopping new connections, can run the hook repeatedly under concurrent signals/calls, and never removes owned signal listeners. Default init rejection is emitted as a non-listen server error; `defaultOnError()` throws and the detached startup promise can become unhandled.

References:

- `packages/express-runtime/src/index.ts:311-321`
- `packages/express-runtime/src/index.ts:355-369`
- `packages/express-runtime/src/index.ts:371-455`
- `packages/express-runtime/test/index.test.ts:449-507`
- `packages/express-runtime/test/index.test.ts:546-558`

Implementation requirements:

1. Use one explicit lifecycle state machine for initializing, listening, stopping, stopped, and failed states.
2. Expose an awaitable `ready` promise or equivalent additive contract that resolves on listening and rejects on init/listen failure.
3. Mark stopping before awaiting anything; a completed shutdown must prevent pending startup from listening later.
4. Stop accepting new connections before application resource teardown, drain in-flight requests up to the timeout, then run `onShutdown` under a documented timeout/error policy.
5. Memoize one shutdown operation so hooks, logs, force-close behavior, and optional process exit happen at most once.
6. Retain and remove only signal handlers owned by this server instance after shutdown or terminal failure.
7. Log the actual address for port `0`, and define deterministic handling when the server was never started or was closed externally.

Acceptance criteria:

- Callers can await successful listening and catch init or listen failure without `unhandledRejection`.
- Shutdown during blocked init leaves `server.listening === false` after init is released.
- New connections are refused after shutdown starts while an existing request may complete before `onShutdown` tears down its dependency.
- Concurrent calls and signals execute cleanup once and restore signal-listener baselines.
- Port `0` logs the actual bound port.
- Tests use no fixed sleeps and do not remove unrelated process listeners.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

### Task ERT-05: Make Serverless Initialization And Media Parsing Deterministic

Status: completed

Completion evidence:

- Updated `packages/express-runtime/src/index.ts` serverless handling so `init` accepts sync or async hooks and is always memoized through one promise; synchronous throws are memoized like asynchronous rejections, and `reset()` is a no-op while initialization is pending so it cannot create concurrent initialization. After settlement, `reset()` clears the memoized result and the next invocation performs exactly one retry.
- Updated `defaultRequestHook` media handling to parse the media type separately from parameters, compare case-insensitively, treat only exact `application/json` and structured `application/*+json` as JSON, and never treat `application/jsonp` or `application/json-evil` as JSON. Malformed JSON on direct hook inputs leaves the Buffer unchanged without logging an internal error.
- Verified installed `serverless-http` 4.0.0 behavior from `node_modules/.pnpm/serverless-http@4.0.0/node_modules/serverless-http/lib/provider/aws/create-request.js` and `lib/request.js`: AWS-style string, object, and Buffer event bodies are converted to Buffers and replayed through a readable `IncomingMessage` stream before Express runs. The default hook now leaves JSON Buffers on readable requests for Express to parse once, preserving Express parser limits and avoiding duplicate JSON parsing/logging.
- Added focused regressions in `packages/express-runtime/test/index.test.ts`: concurrent invocations after a synchronous init throw call init once and observe the same rejection; reset during pending init is ignored and reset after settlement permits one retry; `serverless-http` 4 parses JSON through Express without the eager hook conversion; normal JSON is parsed once; malformed JSON produces a 400 through Express without `logger.error`; exact media matching covers `application/json` with parameters, rejects JSON prefix lookalikes, and positively covers `application/vnd.api+json`.
- Added adapter integration coverage in `packages/express-runtime/test/adapter-e2e.test.ts` distinguishing Express parser limits (`express.json({ limit })` returns 413), the `createServerlessHandler` default-hook `maxBodyBytes` conversion threshold (oversized text remains Buffer and is not rejected), and the local adapter `maxBodyBytes` enforcement (`createServerlessAdapterApp` returns 413 before invoking the handler).
- Updated serverless API docs in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md` for sync/async init memoization, pending-reset semantics, serverless-http 4 stream behavior, exact JSON media matching with structured `+json` support, malformed JSON logging behavior, and `maxBodyBytes` as a conversion threshold distinct from Express/platform/local-adapter request rejection limits.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → passed (tsup CJS/ESM/DTS); `pnpm --filter @web-ts-toolkit/express-runtime test` → passed (7 files, 229 tests; existing Vitest CommonJS/ESM config warning and expected invalid-TypeScript fixture diagnostic remain); `pnpm exec eslint "packages/express-runtime/src/index.ts" "packages/express-runtime/test/index.test.ts" "packages/express-runtime/test/adapter-e2e.test.ts"` → passed with no findings.

Priority: P1

Suggested agent: serverless runtime correctness specialist

Dependencies: ERT-01

Primary ownership:

- `packages/express-runtime/src/index.ts` serverless handler and request hook
- focused serverless integration tests
- serverless API documentation

Finding:

A synchronously throwing `init` is not assigned to the memoized promise and is retried on every invocation despite documentation saying rejection is memoized. `reset()` can clear a still-pending initialization and permit concurrent initialization. The JSON media check accepts invalid prefix types such as `application/jsonp`. The default hook also parses/logs malformed JSON before Express parses the underlying stream again under the installed `serverless-http` behavior, adding duplicate CPU work and attacker-controlled log noise.

References:

- `packages/express-runtime/src/index.ts:173-200`
- `packages/express-runtime/src/index.ts:204-233`
- `packages/express-runtime/src/index.ts:236-267`
- `packages/express-runtime/test/index.test.ts:183-254`
- `packages/express-runtime/test/index.test.ts:287-328`

Implementation requirements:

1. Convert synchronous init throws into the same memoized promise rejection as asynchronous failures.
2. Define reset semantics during pending initialization; prevent undocumented concurrent init execution, preferably by allowing reset only after settlement.
3. Parse and compare media types exactly, case-insensitively, with parameters handled separately. Decide and document support for structured `application/*+json` types.
4. Reproduce `serverless-http` 4 behavior and determine whether issue #305 still requires eager body conversion for supported event shapes.
5. If conversion remains necessary, avoid duplicate parsing and do not log expected malformed client JSON as an internal server failure.
6. Clarify that `maxBodyBytes` is either a conversion threshold or an enforced request limit; do not describe it as end-to-end protection unless tests prove rejection and bounded allocation.

Acceptance criteria:

- Concurrent calls after a synchronous init throw execute init once and observe the same rejection.
- Reset after settlement permits exactly one retry; reset during pending init cannot create concurrent initialization.
- `application/json` with parameters follows the chosen JSON behavior; `application/jsonp` and `application/json-evil` never parse as JSON.
- Structured `+json` behavior is documented and covered by positive or negative tests.
- A normal request is not parsed twice and malformed JSON does not create duplicate internal error logs.
- Integrated tests distinguish Express parser limits, hook conversion limits, and actual request rejection.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

### Task ERT-06: Validate Ports, Timeouts, Delays, And Positional Parsing

Status: completed

Completion evidence:

- Added shared numeric validation in `packages/express-runtime/src/numeric-validation.ts` and wired `packages/express-runtime/src/index.ts` to validate programmatic `shutdownTimeout` before server creation; `normalizePort()` now accepts only canonical decimal numeric ports in `0..65535`, rejects whitespace-only/padded, fractional, exponent, signed, `NaN`, and infinity-like numeric strings, and preserves nonnumeric named-pipe strings.
- Updated `packages/express-runtime/src/cli-utils.ts` so `--port`, `--shutdown-timeout`, `--delay`, and `--max-body-bytes` share finite-integer validation with explicit `0..Number.MAX_SAFE_INTEGER` bounds where applicable; separated and `--flag=value` forms share required-value handling and reject empty equal-form values. `validateMaxBodyBytes()` now delegates to the shared finite-integer validator and is bounded to `0..9007199254740991`.
- Implemented standard `--` option termination in `parseArgs()`/subcommand parsers: global `--help`/`--version` only win before `--`, tokens after `--` are positional, and `dev -- --app.js` plus `build -- --app.ts` are parsed as leading-dash module paths.
- Added regressions in `packages/express-runtime/test/index.test.ts`, `packages/express-runtime/test/cli-utils.test.ts`, `packages/express-runtime/test/adapter-body-limit.test.ts`, and `packages/express-runtime/test/subprocess-harness.test.ts` for valid numeric boundaries, invalid `NaN`/infinity/negative/fraction/whitespace/empty values with flag-specific messages, leading-dash positional parsing, and CLI subprocess failure before env loading or app import.
- Updated public CLI/runtime docs in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md` for `--` termination and numeric validation bounds/policies.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → passed (tsup CJS/ESM/DTS); `pnpm --filter @web-ts-toolkit/express-runtime test` → passed (7 files, 243 tests; existing Vitest CommonJS/ESM warning and expected invalid-TypeScript fixture diagnostic remain); targeted `pnpm exec eslint "packages/express-runtime/src/index.ts" "packages/express-runtime/src/cli-utils.ts" "packages/express-runtime/src/numeric-validation.ts" "packages/express-runtime/test/index.test.ts" "packages/express-runtime/test/cli-utils.test.ts" "packages/express-runtime/test/adapter-body-limit.test.ts" "packages/express-runtime/test/subprocess-harness.test.ts"` → passed; broad `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"` still fails only on pre-existing non-ERT-06 issues in `packages/express-runtime/test/build-staging.test.ts` (`generateServerlessEntry` unused and four empty blocks), left untouched to keep this session isolated to ERT-06.

Priority: P2

Suggested agent: CLI input-validation specialist

Dependencies: ERT-04

Primary ownership:

- `packages/express-runtime/src/index.ts` shared runtime option validation
- `packages/express-runtime/src/cli-utils.ts` argument parsing
- parser and startup validation tests

Finding:

Port normalization accepts fractions and converts whitespace-only strings to port `0`. CLI timeout and delay parsing accepts `NaN`, infinities, negatives, fractions, and empty `--flag=` values; Node timers may coerce them to near-immediate execution. The parser skips `--` rather than ending option parsing, so leading-dash paths cannot be passed positionally.

References:

- `packages/express-runtime/src/index.ts:323-352`
- `packages/express-runtime/src/index.ts:371-375`
- `packages/express-runtime/src/cli-utils.ts:18-24`
- `packages/express-runtime/src/cli-utils.ts:230-368`
- `packages/express-runtime/src/cli-utils.ts:429-545`

Implementation requirements:

1. Centralize finite-integer validation for ports, shutdown timeouts, watch delays, adapter body limits, and other numeric flags.
2. Accept numeric ports only in `0..65535`; preserve intentional named-pipe strings while rejecting whitespace-only and ambiguous numeric forms.
3. Define bounded policies for timeout and delay values and reject invalid input before loading env files/modules, opening watchers, or binding a server.
4. Make separated and `--flag=value` forms share validation and reject empty required values.
5. Implement standard `--` termination so all subsequent tokens are positional.

Acceptance criteria:

- `NaN`, infinities, negatives, fractions, whitespace-only values, and empty equal-form values fail with flag-specific messages.
- Valid boundary values have explicit tests.
- Invalid CLI input exits nonzero without loading application code or opening resources.
- `dev -- --app.js` and equivalent build forms treat the leading-dash path as positional.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

## Wave 3: Serverless Adapter Fidelity And Watch Supervision

### Task ERT-07: Define And Implement One Accurate Local Serverless Contract

Status: completed

Completion evidence:

- Defined the local adapter contract as AWS API Gateway REST API v1 / Lambda proxy in `packages/express-runtime/src/cli-utils.ts`: added exported `ApiGatewayRestEvent`, changed `toServerlessEvent()` to emit pathname-only `path`, single-value `headers`, `multiValueHeaders`, `queryStringParameters`, `multiValueQueryStringParameters`, string `body`, `isBase64Encoded`, and only the minimal `requestContext.identity.sourceIp` required by `serverless-http`; re-exported the event type through `packages/express-runtime/src/cli-api.ts`.
- Implemented query splitting without `URLSearchParams`: duplicate keys are preserved in `multiValueQueryStringParameters`, empty values remain `''`, literal `+` remains `+`, Unicode and encoded delimiters are decoded exactly once, and single-value query fields use the last value. Request header arrays are represented in `multiValueHeaders`, with comma-joined single-value headers for the AWS v1 single map.
- Changed local adapter request bodies to AWS v1 strings: non-empty bodies are base64-encoded to preserve arbitrary bytes and empty bodies use `body: ''` with `isBase64Encoded: false`, allowing serverless-http to replay decoded bytes into Express.
- Reworked `applyServerlessResult()` to validate the complete handler result before writing: result must be an object, `statusCode` must be an integer in `100..599`, `headers` values must be strings, `multiValueHeaders` values must be string arrays, `body` must be a string, and `isBase64Encoded: true` requires valid standard base64. `multiValueHeaders` deterministically wins over `headers` on collisions and preserves multiple `Set-Cookie` values. `createServerlessAdapterApp()` catches invalid result contracts, logs `Invalid serverless handler result:`, and sends a clean `500` only if no response has been written.
- Added focused unit and end-to-end regressions in `packages/express-runtime/test/cli-utils.test.ts` and `packages/express-runtime/test/adapter-e2e.test.ts`: AWS v1 event fields, duplicate/empty/encoded query behavior, base64 request event body, multi-value response header precedence, two `Set-Cookie` values through a real `createServerlessHandler()` and local adapter, `/x?a=1&a=2&empty=` routing with `req.path === '/x'`, ordinary text request body round-trip, binary response round-trip, and invalid status/header/base64/result shapes producing `500` without leaking partial status/header/body.
- Updated documentation in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md` to name AWS API Gateway REST API v1 / Lambda proxy as the local emulation target, document query/header/body/result semantics, state `multiValueHeaders` precedence, and narrow unsupported provider claims for Netlify, Vercel, HTTP API v2, ALB, cookies arrays, authorizers, stage variables, full request context, and trusted source IP.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → passed (tsup CJS/ESM/DTS); `pnpm --filter @web-ts-toolkit/express-runtime test` → passed (7 files, 251 tests; existing Vitest CommonJS/ESM config warning and expected invalid-TypeScript fixture diagnostic remain); targeted `pnpm exec eslint "packages/express-runtime/src/cli-utils.ts" "packages/express-runtime/src/cli-api.ts" "packages/express-runtime/test/cli-utils.test.ts" "packages/express-runtime/test/adapter-e2e.test.ts"` → passed with no findings.

Priority: P1

Suggested agent: API Gateway and HTTP adapter specialist

Dependencies: ERT-01, ERT-02

Primary ownership:

- `packages/express-runtime/src/cli-utils.ts` event/result translation
- adapter types exported through `packages/express-runtime/src/cli-api.ts`
- end-to-end adapter fixtures and documentation

Finding:

`toServerlessEvent()` places the full `req.url`, including the query string, in the API Gateway-style `path` and omits query parameter fields. Through `serverless-http`, `/x?a=1` can become `/x%3Fa=1` and miss route `/x`. Response handling ignores `multiValueHeaders`, dropping repeated production headers such as multiple `Set-Cookie` values. The adapter's broader provider compatibility and event fidelity are not defined.

References:

- `packages/express-runtime/src/cli-utils.ts:954-968`
- `packages/express-runtime/src/cli-utils.ts:984-1039`
- `packages/express-runtime/src/cli-utils.ts:1041-1068`
- `packages/express-runtime/README.md:196-209`

Implementation requirements:

1. Select and document one canonical provider/event shape supported by the generated handler and local adapter.
2. Split pathname from query without double decoding, preserving duplicate keys, empty values, plus signs, Unicode, and encoded delimiters in the canonical query fields.
3. Represent repeated request headers according to the selected contract.
4. Apply `multiValueHeaders` responses, especially `Set-Cookie`, with deterministic precedence when single and multi-value maps collide.
5. Validate handler result shape, status range, headers, body, and base64 encoding before partially writing a response; produce actionable local diagnostics for invalid contracts.
6. Narrow claims for unsupported provider context, source IP, cookies, or request-context fields instead of fabricating compatibility.

Acceptance criteria:

- A real wrapped Express route receives `req.path === '/x'` and expected values for `/x?a=1&a=2&empty=`.
- Encoded query edge cases are not double encoded or silently collapsed contrary to the documented contract.
- Two cookies emitted by the wrapped app reach the local HTTP client as two `Set-Cookie` values.
- Binary and ordinary text bodies round-trip under the selected contract.
- Invalid status, header, base64, and result shapes fail deterministically before a partial response is sent.
- Documentation names the emulated provider shape and its intentional limitations.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

### Task ERT-08: Replace Watch Mode With A Bounded Single-Owner Supervisor

Status: completed

Completion evidence:

- Replaced watch mode in `packages/express-runtime/src/cli-utils.ts` with one serialized supervisor that validates every watch path before opening watchers, rolls back opened watchers on setup failure, coalesces burst change events while a restart is already in flight, and tracks at most one owned child process.
- Extended `WatchSupervisorDeps` with narrow test/production lifecycle hooks (`logger`, timer injection, `killTimeoutMs`, `exit`, and opt-in signal handler installation) while preserving the existing `createWatchSupervisor()` / `WatchSupervisorController` seam; `runWithWatch()` now returns the controller and removes only its owned `SIGINT` / `SIGTERM` handlers during shutdown.
- Added explicit failure policy for watcher errors, child spawn/error/exit, failed `kill()`, and restart rejection: emit one diagnostic, begin idempotent shutdown, close owned watchers, terminate the child, and exit nonzero through the injected/production exit path. Graceful child termination sends `SIGTERM` and escalates to `SIGKILL` after the documented 5000 ms default timeout, with injected timeout support for deterministic tests.
- Added/extended `packages/express-runtime/test/watch-supervisor.test.ts` coverage for pre-validation with zero watcher/fork calls, watcher setup rollback, deterministic controller cleanup, burst changes during slow exit producing one final replacement with no overlapping live children, spawn error diagnostics/nonzero exit, restart kill failure diagnostics/nonzero exit, SIGTERM-to-SIGKILL escalation, watcher runtime errors, and repeated signal idempotency with listener removal and no respawn after shutdown.
- Updated CLI documentation in `packages/express-runtime/src/cli-utils.ts`, `packages/express-runtime/README.md`, and `website/docs/packages/express-runtime.md` to describe single-child watch supervision, serialized restarts, the 5 second SIGKILL escalation bound, resource cleanup, and nonzero failure behavior.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` → passed (tsup CJS/ESM/DTS); `pnpm --filter @web-ts-toolkit/express-runtime test` → passed (7 files, 258 tests; existing Vitest CommonJS/ESM config warning and expected invalid-TypeScript fixture diagnostic remain); targeted `pnpm exec eslint "packages/express-runtime/src/cli-utils.ts" "packages/express-runtime/src/cli-api.ts" "packages/express-runtime/test/watch-supervisor.test.ts"` → passed with no findings; broad `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"` still fails only on pre-existing non-ERT-08 issues in `packages/express-runtime/test/build-staging.test.ts` (`generateServerlessEntry` unused and four empty blocks), left untouched to keep this session isolated to ERT-08.

Priority: P1

Suggested agent: child-process and filesystem-watch specialist

Dependencies: ERT-01, ERT-06

Primary ownership:

- `packages/express-runtime/src/cli-utils.ts` watch mode
- watch lifecycle tests and CLI documentation

Finding:

File changes can enter overlapping asynchronous restarts and spawn multiple children while only one remains tracked. Watch paths are opened while being validated, so a later invalid path leaks earlier watchers and can keep the failed CLI alive. Child spawn errors, failed kills, and ignored SIGTERM are unhandled; restart rejections are detached; watcher handles and signal listeners are never removed.

References:

- `packages/express-runtime/src/cli-utils.ts:757-835`
- `packages/express-runtime/src/cli.ts:12-16`

Implementation requirements:

1. Validate all watch paths before opening any watcher and roll back every opened resource on setup failure.
2. Implement one serialized supervisor state machine that coalesces changes during restart and never owns more than one live child.
3. Retain watcher and signal-handler ownership and expose internal async shutdown suitable for deterministic tests and programmatic cleanup.
4. Handle child `error`, `exit`, `kill()` failure, and restart rejection with one diagnostic and a defined exit policy.
5. Bound graceful child termination, escalate from `SIGTERM` to `SIGKILL` after a documented timeout, and make shutdown idempotent under repeated signals.
6. Handle watcher runtime errors and ensure no timer can respawn after shutdown begins.

Acceptance criteria:

- Instrumentation observes at most one live child during burst changes and slow exits, with exactly one final replacement.
- A valid path followed by an invalid path exits promptly with zero open watchers or children.
- Spawn failure exits nonzero with one diagnostic and no uncaught event.
- A child ignoring `SIGTERM` is force-terminated within the configured bound.
- Repeated signals initiate one shutdown, close all watchers/listeners, and never respawn.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

## Wave 4: Published Contract And Architectural Health

### Task ERT-09: Verify And Correct Release-Staged Package Contracts

Status: completed

Completion evidence:

- Updated `packages/express-runtime/package.json` release contract so root and `./cli` export maps use condition-specific declarations (`import` -> `.d.mts`, `require`/`default` -> `.d.ts`) matching emitted CJS/ESM files after `publishDir: 'dist'` flattening; kept `main`/`module`/`types`/`bin` aligned with staged `./index.js`, `./index.mjs`, `./index.d.ts`, and `./cli.js` paths.
- Resolved the Express type policy by declaring `@types/express` as a peer dependency (and dev dependency for this workspace), and documented explicit TypeScript install commands for `@types/express` and `@types/node` in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md`.
- Kept CLI version runtime-derived from the installed package manifest via `resolveCliVersion()`, so the flattened release-staged binary reads staged `package.json`; the new staged contract test verifies `wtt-express-runtime --version` and direct `node ./node_modules/@web-ts-toolkit/express-runtime/cli.js --version` print `1.2.3`, and no staged `.js`/`.mjs`/`.d.ts`/`.d.mts` contains `0.0.0-PLACEHOLDER`.
- Added package-local `packages/express-runtime/test/export-contract.test.ts` coverage that stages an npm-like package through the real publish manifest transformer, packs/installs it, checks manifest fields and export targets, loads root and `./cli` through both `import` and `require`, exercises binary `--help`/`--version`, verifies documented CLI paths, and compiles strict clean TypeScript consumer fixtures for NodeNext ESM, NodeNext CJS, and Bundler with `skipLibCheck: false` using documented dependencies.
- Aligned `packages/express-runtime/tsconfig.json` target to `ES2024` for the package's Node 22 runtime target; the package already uses `vitest.config.mts`, and package test runs no longer emit the earlier Vitest CommonJS/ESM config warning.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` -> passed (tsup CJS/ESM/DTS); `pnpm --filter @web-ts-toolkit/express-runtime test` -> passed (8 files, 261 tests; expected invalid-TypeScript fixture diagnostic from build-staging remains); targeted `pnpm exec eslint "packages/express-runtime/test/export-contract.test.ts" "packages/express-runtime/tsup.config.ts" "packages/express-runtime/vitest.config.mts"` -> passed; broad `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` still fails only on pre-existing non-ERT-09 issues in `packages/express-runtime/test/build-staging.test.ts` (`generateServerlessEntry` unused and four empty blocks), left untouched to keep this session isolated to ERT-09.

Priority: P1

Suggested agent: TypeScript package and release-artifact specialist

Dependencies: ERT-03, ERT-04, ERT-07

Primary ownership:

- `packages/express-runtime/package.json`
- `packages/express-runtime/tsup.config.ts`
- `packages/express-runtime/tsconfig.json`
- packed/export-contract tests
- package and website documentation
- release tooling only if package-local configuration cannot solve version injection

Finding:

The CLI version is embedded as `0.0.0-PLACEHOLDER`, while the release pipeline rewrites package metadata rather than emitted JavaScript. ESM `.d.mts` files are emitted but export maps direct both import and require consumers to `.d.ts`. Public declarations import Express types even though `@types/express` is only a dev dependency. Tests import source and do not exercise release-staged root, `/cli`, binary, declaration, or README paths. Published staging flattens `dist`, but TypeScript CLI examples still reference `.../dist/cli.js`.

References:

- `packages/express-runtime/src/cli-utils.ts:9-12`
- `packages/express-runtime/package.json:17-59`
- `packages/express-runtime/tsup.config.ts:3-27`
- `packages/express-runtime/tsconfig.json:3-14`
- `packages/express-runtime/README.md:102-120`
- `website/docs/packages/express-runtime.md:137-150`
- `packages/access-router/test/packed-consumer-compatibility.test.ts:116-129`

Implementation requirements:

1. Inject or derive the actual staged package version so the installed binary reports the release version and no published executable contains the placeholder.
2. Map ESM imports to `.d.mts` and CommonJS require consumers to `.d.ts`, or intentionally emit one declaration mode proven correct under NodeNext.
3. Make Express declarations available under the documented install command by selecting and documenting a dependency or peer policy for `@types/express`.
4. Add package-local export-contract tests for root and `/cli` through both `import` and `require`.
5. Stage an npm-like release package and test transformed `main`, `module`, `types`, `bin`, `exports`, `--help`, `--version`, and documented CLI paths.
6. Compile strict clean ESM and CommonJS TypeScript consumers with NodeNext and a Bundler consumer with `skipLibCheck: false`.
7. Align the Node 22 target across TypeScript/build config or document why declaration checking needs a lower target; resolve the Vitest module-mode warning without breaking CJS consumers.

Acceptance criteria:

- A staged version `X.Y.Z` prints exactly `X.Y.Z` from its installed binary.
- No staged JS or declarations contain `0.0.0-PLACEHOLDER`.
- Root and `/cli` load and type-check in strict ESM, CJS, and Bundler fixtures using only documented dependencies.
- Every emitted declaration entry is reachable or intentionally no longer emitted.
- README and website TypeScript CLI commands execute against the staged layout.
- The export-contract suite fails on missing, stale, or incorrectly conditioned targets.
- `pnpm --filter @web-ts-toolkit/express-runtime test` passes.

### Task ERT-10: Tighten Public API Ownership And Internal Module Boundaries

Status: completed

Completion evidence:

- Added exact public-surface locks in `packages/express-runtime/test/public-api-surface.test.ts`: TypeScript symbol export checks for root and `@web-ts-toolkit/express-runtime/cli`, plus emitted CJS and ESM runtime export checks for `dist/index.{js,mjs}` and `dist/cli-api.{js,mjs}`. The root runtime surface is locked to `createExpressApp`, `createServerlessHandler`, `defaultRequestHook`, `normalizePort`, `parsePortValue`, `startLocalServer`, and `validateFiniteInteger`; `/cli` runtime exports are locked to the documented programmatic facade and extension seams.
- Preserved `/cli` compatibility for `@web-ts-toolkit/access-router-runtime`: its source still imports only `parseArgs`, `runBuildEntryCommand`, `runDevCommand`, and `runCliCommand` from `@web-ts-toolkit/express-runtime/cli`, and `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed after rebuilding transitive dependencies.
- Removed the stale “Exported for direct unit testing” wording from `packages/express-runtime/src/index.js`; public comments now describe `defaultRequestHook` and `normalizePort` as supported extension/helper seams. The TypeScript source already documents those root exports as public extension seams rather than test-only details.
- Resolved `ExpressAppOptions.logger` as observable behavior: `createExpressApp()` routes the default final error logger through `options.logger.error`, and `packages/express-runtime/test/index.test.ts` covers unhandled errors reaching the factory-owned pipeline. Docs state that custom `errorHandler` owns final handling, while the default handler logs through `logger.error('Unhandled Express error:', err)` before delegating to Express.
- Aligned serverless hook types/docs with serverless-http 4 provider arguments: `ServerlessRequestHook<TEvent, TContext>` and `ServerlessResponseHook<TEvent, TContext>` accept `(request, event, context)` / `(response, event, context)`, docs describe provider-specific generics and local AWS REST API v1 adapter scope, and runtime tests assert event/context are passed to both hooks.
- Documented early middleware `ErrorRequestHandler` semantics in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md`: error handlers in `preMiddleware`, `middleware`, and `postMiddleware` are slot-dependent and only catch errors from earlier middleware/routes; use `errorHandler` or `finalize()` for final app-wide error handling.
- Measured package size/import cost and documented why build tooling is not split now: `npm pack --dry-run --json` reports 67,686 bytes compressed and 312,815 bytes unpacked for the package payload; root CJS import took 127.869 ms in the local measurement, loaded 141 modules / 684,576 bytes, and did not load `tsup` or `esbuild`; root ESM import took 149.313 ms. Local symlink-following install-size checks reported `tsup` itself at about 484 KiB and `serverless-http` at about 132 KiB. README and website docs now state that splitting the build CLI can be reconsidered if install-size policy changes, but is not required for runtime imports today.
- Updated public API ownership docs in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md`: root supported APIs, root extension seams, `/cli` stable consumer facade, `/cli` extension seams, and export-locking expectations are named explicitly.
- Verification: `pnpm --filter @web-ts-toolkit/express-runtime build` passed; `pnpm --filter @web-ts-toolkit/express-runtime test` passed (9 files, 267 tests; expected invalid-TypeScript fixture diagnostic from build-staging remains); `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (3 files, 20 tests; existing Vite native-loader warning for its `vitest.config.ts` remains); targeted `pnpm exec eslint "packages/express-runtime/test/public-api-surface.test.ts"` passed. Targeted eslint including `packages/express-runtime/src/index.js` produced only an ESLint ignore warning because that file is ignored by config. Broad `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` still fails only on pre-existing non-ERT-10 issues in `packages/express-runtime/test/build-staging.test.ts` (`generateServerlessEntry` unused and four empty blocks), left untouched to preserve prior ERT work.

Priority: P2

Suggested agent: TypeScript library architecture specialist

Dependencies: ERT-03, ERT-05, ERT-07, ERT-08, ERT-09

Primary ownership:

- `packages/express-runtime/src/index.ts`
- `packages/express-runtime/src/cli-api.ts`
- internal modules split from `packages/express-runtime/src/cli-utils.ts`
- exact export-surface tests and public API documentation
- `packages/access-router-runtime` compatibility tests

Finding:

The 1,111-line `cli-utils.ts` combines parsing, help, env loading, dynamic imports, process supervision, build staging, and HTTP translation. `/cli` exports many low-level helpers primarily to make source unit testing possible, creating broad compatibility obligations. Root exports similarly expose `defaultRequestHook` and `normalizePort` “for direct unit testing.” `ExpressAppOptions.logger` is documented but never read. Serverless hook types hide event/context arguments supported by the dependency and rely on casts.

References:

- `packages/express-runtime/src/index.ts:85-86`
- `packages/express-runtime/src/index.ts:165-200`
- `packages/express-runtime/src/index.ts:204-210`
- `packages/express-runtime/src/index.ts:326-332`
- `packages/express-runtime/src/cli-utils.ts:1-1111`
- `packages/express-runtime/src/cli-api.ts:142-179`
- `packages/access-router-runtime/src/cli.ts:1-6`

Implementation requirements:

1. Inventory each root and `/cli` export as supported consumer API, intentional extension seam, or internal test detail.
2. Keep the public `/cli` entrypoint stable for confirmed `access-router-runtime` consumers while moving unrelated implementation into focused internal modules.
3. Prefer cohesive internal seams for argument parsing, environment/module loading, watcher supervision, build staging, and serverless HTTP adaptation; avoid abstractions used only once unless they provide ownership or injection value.
4. Test internals through behavior or package-private imports rather than exporting helpers solely for tests.
5. Remove, deprecate, or implement `ExpressAppOptions.logger` based on release history; do not leave a dead documented option.
6. Decide whether serverless request/response hooks intentionally omit provider event/context. If not, expose accurate generic types without unchecked boundary casts.
7. Reassess whether accepting `ErrorRequestHandler` in early middleware arrays is useful, since early handlers cannot catch later router errors; narrow types or document slot-dependent Express semantics.
8. Measure packed size and root import dependency cost before proposing separation of `tsup` build tooling from the runtime package.

Acceptance criteria:

- An exact export-surface test records supported root and `/cli` names and detects accidental additions/removals.
- `access-router-runtime` builds and its CLI compatibility tests pass after internal reorganization.
- Public exports are not justified only by direct unit testing comments.
- The logger option has observable tested behavior or a documented migration path.
- Hook signatures and documentation agree about provider context.
- CLI modules have cohesive ownership and can be tested without process-global destructive cleanup.
- Any proposal to split build tooling includes measured installed/packed impact and is not required for completion without maintainer approval.
- `pnpm --filter @web-ts-toolkit/express-runtime test` and `pnpm --filter @web-ts-toolkit/access-router-runtime test` pass serially.

## Dependency And Parallelization Guidance

| Wave | Task   | Recommended owner             | May run in parallel with                                |
| ---- | ------ | ----------------------------- | ------------------------------------------------------- |
| 1    | ERT-01 | integration-test specialist   | none initially                                          |
| 1    | ERT-02 | HTTP stream specialist        | ERT-03 after ERT-01 merges                              |
| 1    | ERT-03 | filesystem/build specialist   | ERT-02 after ERT-01 merges                              |
| 2    | ERT-04 | server lifecycle specialist   | ERT-05                                                  |
| 2    | ERT-05 | serverless runtime specialist | ERT-04                                                  |
| 2    | ERT-06 | validation specialist         | ERT-05 after ERT-04 contract settles                    |
| 3    | ERT-07 | serverless adapter specialist | ERT-08                                                  |
| 3    | ERT-08 | process supervisor specialist | ERT-07                                                  |
| 4    | ERT-09 | package/release specialist    | none while shared package metadata/build config changes |
| 4    | ERT-10 | architecture specialist       | none until behavioral/public contracts settle           |

Shared hotspots requiring sequencing:

- `src/cli-utils.ts` is touched by ERT-02, ERT-03, ERT-06, ERT-07, ERT-08, and ERT-10. Use narrow ownership or merge in task order; do not assign all six concurrently.
- `src/index.ts` is touched by ERT-04, ERT-05, ERT-06, and ERT-10. ERT-04 and ERT-05 may run concurrently only if ownership stays within local-server versus serverless sections.
- ERT-09 owns package metadata and build configuration after runtime signatures stabilize.
- Do not run package tests/builds concurrently, even for source-disjoint tasks, because each rebuilds shared `dist/` output.

## Deferred Decisions Requiring Maintainer Input

These decisions do not block regression work but must be resolved in the named task before its contract is finalized:

1. ERT-04: whether `shutdownTimeout` covers only request draining or the complete drain plus application-cleanup sequence.
2. ERT-05: whether structured `application/*+json` types are parsed and whether `maxBodyBytes` is a conversion threshold or an enforced rejection limit.
3. ERT-07: which single provider event shape the local adapter promises to emulate.
4. ERT-09: whether `@types/express` is a dependency or a required peer; the documented install must work either way.
5. ERT-10: whether dead/low-level exports have shipped sufficiently to require deprecation rather than direct removal.
6. ERT-10: whether build-tool installation weight warrants a future separately published CLI package after measurement.

## Final Integration Review

### Task ERT-11: Independently Verify Runtime, CLI, And Release Boundaries

Status: completed

Completion evidence:

- Reviewed ERT-02 through ERT-10 completion evidence and current `packages/express-runtime` code/tests. The integrated regression suite covers oversized declared `Content-Length` and chunked bodies (`test/adapter-body-limit.test.ts`), temp-file legacy collisions, symlink collisions, successful/failed/concurrent staging cleanup (`test/build-staging.test.ts`), shutdown during blocked init and repeated signals (`test/index.test.ts`), watch bursts, repeated signals, watcher errors, and child `SIGTERM` to `SIGKILL` timeout escalation (`test/watch-supervisor.test.ts`), duplicate query values, repeated `Set-Cookie`, binary/text bodies, and malformed handler results before partial response writes (`test/adapter-e2e.test.ts`, `test/cli-utils.test.ts`).
- Fixed the remaining broad eslint blocker in `packages/express-runtime/test/build-staging.test.ts`: removed the unused `generateServerlessEntry` import and replaced empty catch blocks with explicit ignored-error comments. No production code or `dist/` files were edited manually.
- Verified leak ownership by reviewing and running the harness-backed tests: process listener baselines/sentinel `SIGINT`/`SIGTERM` listeners are restored, local servers/sockets are closed through `ServerHarness`, subprocess helpers kill/unref children and remove child listeners, watch supervisor tests assert watcher/listener/child cleanup, temp-dir helpers restore cwd/env and remove owned temp roots, and build-staging tests assert no `.wtt-build-*` leftovers in temp projects or cwd. No express-runtime open-handle warnings were emitted in package test runs.
- Verified release and public API boundaries through the package test suite, including ERT-09 staged package/export-contract checks: staged root and `./cli` export maps, condition-specific `.d.mts`/`.d.ts` declarations, flattened package layout, `wtt-express-runtime --version` and `--help`, documented `./node_modules/@web-ts-toolkit/express-runtime/cli.js` path, absence of `0.0.0-PLACEHOLDER` in staged JS/declarations, and strict NodeNext ESM/CJS plus Bundler consumer compilation with documented dependencies. ERT-10 public-surface locks verify exact root and `/cli` runtime/type exports.
- Reviewed request-controlled and recursive-input bounds. Body collection is capped by validated `maxBodyBytes` and retains at most limit plus one chunk; default Express parsers remain `1mb`; numeric CLI/runtime options are finite bounded integers; query/header/cookie collections follow AWS REST v1 maps and are bounded by the already bounded request line/header handling in Node rather than by a new package limit; recursive filesystem watching remains caller-selected trusted local paths and is owned by one supervisor; env/preload/app/init execution remains trusted executable code per the task non-goals. No P0/P1 request-controlled unbounded memory issue remains in `express-runtime`.
- Confirmed deferred decisions have selected contracts and rationale: `shutdownTimeout` covers request draining only; structured `application/*+json` is supported and `maxBodyBytes` on `createServerlessHandler()` is a conversion threshold, while adapter `maxBodyBytes` is the HTTP rejection limit; the local adapter emulates AWS API Gateway REST API v1 / Lambda proxy only; `@types/express` is a documented peer dependency; low-level exports are locked as supported facade/extension seams; build-tool split is deferred with measured package/import-cost rationale. These are documented in `packages/express-runtime/README.md` and `website/docs/packages/express-runtime.md`. No P0/P1 ERT item remains deferred.
- Verification run serially: `pnpm --filter @web-ts-toolkit/express-runtime test` passed (9 files, 267 tests) with no module-loader/open-handle warnings; the only diagnostic was the expected invalid-TypeScript build-staging fixture (`THIS IS NOT VALID TYPESCRIPT {{{{`). `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` passed. `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (3 files, 20 tests; existing Vite native-loader warning for that package's `vitest.config.ts`). `pnpm build` passed (existing non-express-runtime Vite config/chunk-size warnings only). `git diff --check` passed.
- Full `pnpm test` was run serially. First run exposed a stale generated `packages/pdf-reader/node_modules/.bin/vitest` shim pointing at missing `vitest@4.1.10`; removing that generated shim made `@web-ts-toolkit/pdf-reader` resolve the root `vitest` 4.1.11 binary and pass. The rerun then failed in unrelated `@web-ts-toolkit/express-oidc-vault-redis-store`: Docker-backed Redis suites could not start `redis:6.2-alpine` / `redis:7.2-alpine`, and `test/index.test.ts` timed out in `keeps bounded revocation command behavior for a 10,000-session index`. A direct package rerun reproduced the same Redis-store failures. This blocks the repository-wide `pnpm test` acceptance in the current environment but is outside `packages/express-runtime`; no ERT P0/P1 remediation is deferred.

Priority: P1

Suggested agent: independent security and release reviewer who did not implement ERT-02 through ERT-10

Dependencies: ERT-02, ERT-03, ERT-04, ERT-05, ERT-06, ERT-07, ERT-08, ERT-09, ERT-10

Primary ownership:

- review-only across `packages/express-runtime/`
- integration fixes only when assigned after findings are recorded
- final completion evidence in this task file

Finding:

The remediations cross network input, filesystem ownership, process lifecycle, provider emulation, public types, and release transformation boundaries. A final reviewer must test the combined behavior rather than accepting isolated task results.

References:

- all ERT task findings and completion evidence
- `AGENTS.md` serialization and packaging notes
- `packages/express-runtime/package.json`

Implementation requirements:

1. Verify every acceptance criterion against runtime behavior and record evidence or a named blocker.
2. Re-test oversized declared/chunked bodies, temp-file collisions/symlinks/concurrency, shutdown during init, repeated signals, watch bursts, child termination timeout, query duplicates, multiple cookies, and malformed handler results.
3. Confirm no owned timer, process listener, watcher, child, server, socket, temporary file, cwd mutation, or environment mutation leaks after tests.
4. Verify root and `/cli` runtime exports, declarations, docs, staged package layout, binary version/help output, and strict consumer compilation agree.
5. Review bounds for every request-controlled collection or recursive input introduced by the final design.
6. Confirm deferred decisions include rationale, selected contract, and residual risk.
7. Run targeted and full checks serially and inspect the final diff for accidental generated or unrelated changes.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/express-runtime test` passes without module-loader or open-handle warnings.
- `pnpm exec eslint "packages/express-runtime/**/*.{ts,js}"` passes.
- `pnpm build` passes.
- `pnpm test` passes serially as configured by the repository.
- Release-staged package and strict consumer checks from ERT-09 pass.
- `git diff --check` passes.
- Every task is completed with evidence or explicitly deferred with maintainer rationale and residual risk; no P0 or P1 item remains deferred.

## Definition Of Done

- All P0 and P1 tasks are completed with failing-before/passing-after regressions.
- Adapter request memory is bounded and oversized requests receive deterministic client errors.
- Build staging cannot overwrite unrelated files, follow collision symlinks, or race through shared temporary names.
- Local server and watch lifecycles are awaitable, idempotent, bounded, and clean up only resources they own.
- The local serverless adapter accurately implements its documented query, header, cookie, binary, and error contract.
- Numeric and positional CLI input fails early and consistently.
- Root and `/cli` exports, condition-specific declarations, dependencies, documentation, binary version, and staged package layout agree.
- Public APIs have explicit ownership; internals are not exported only for tests, and architectural splits preserve confirmed consumers.
- Full repository verification runs serially and passes.
