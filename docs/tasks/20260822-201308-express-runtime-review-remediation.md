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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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
