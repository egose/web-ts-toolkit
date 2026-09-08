# Express Runtime Boundary Review

Created: 2026-09-07 18:17:31 (local timestamp)

## Objective

Address residual correctness, filesystem safety, HTTP fidelity, lifecycle, public-type, and maintainability gaps in `packages/express-runtime`. This is an executable follow-up review, not authorization already exercised to implement fixes. All tasks below are pending.

Scope: source, focused tests, installed declarations, package metadata, build configuration, README, and corresponding website documentation. Preserve Express 5, Node >=22, and the chosen local AWS API Gateway REST v1 contract.

Non-goals: sandbox trusted app/preload execution; emulate every provider; introduce a separately published CLI; broadly rewrite the parser or lifecycle; manually edit `dist`; change unrelated concurrent work.

## Coverage And Baseline

- Reviewed root app/serverless/local-server source; CLI parser, loading, supervision, build staging, and adapter code; associated tests; emitted root and CLI declarations; export/consumer tests and documentation.
- Related plan: [20260822-201308-express-runtime-review-remediation.md](20260822-201308-express-runtime-review-remediation.md). ERT-01 through ERT-11 are marked completed. This new phase records specific missed cases rather than repeating their original implementations. Its ERT-11 evidence also records a full-workspace test blocker despite completed status; do not reuse that as current passing evidence.
- Related consumer work: [20260823-123959-access-router-runtime-review-remediation.md](20260823-123959-access-router-runtime-review-remediation.md), particularly shared readiness and shutdown-error propagation. Preserve its use of the public CLI facade.
- Existing unrelated changes in access-router-deco, access-router-react, their docs/tests, and task documents were present at review start. Leave them untouched.
- Actually run: `git status --short`; two isolated `node --input-type=module -e '...'` probe processes using existing `dist` exports; `date +%Y%m%d-%H%M%S`. Probe results are listed below. No package build, lint, full test suite, fresh pack/install, destructive build, or real repeated-OS-signal experiment was run during analysis. Avoiding shared build-output races and limiting review-only work were intentional.
- Existing-artifact probes corroborate source inspection, but are not a freshly built package baseline. Other confirmed defects below follow directly from source control flow; implementation agents must add failing-before regressions.
- Probes: `toServerlessEvent('GET', '/x?constructor=v', {}, Buffer.alloc(0))` and the `__proto__` variant threw `multi[key].push is not a function`; `//admin/users` became `/users`; `/a/../private` became `/private`.
- Probe: Node `setTimeout(..., 2147483648)` produced `TimeoutOverflowWarning` and a timer duration of 1 ms; the timer was cleared immediately.
- Probes: real loopback port-0 servers with `signals:false` and `onShutdown: () => Promise.reject(value)` resolved shutdown for each of `undefined`, `null`, `false`, `0`, and `''`. A server configured with `signals: ['SIGUSR2', 'SIGUSR2']` leaked one listener after shutdown; the probe removed only its own leaked listener.
- No claim of exhaustive security audit, cloud-provider parity, cross-platform behavior, throughput, or allocation measurement. Trusted-handler output errors are not automatically remote vulnerabilities. Prototype-named query failures are not evidence of global prototype pollution.
- Document checks: confirmed 18 uniquely numbered pending tasks and reviewed dependency references for cycles; scoped `git diff --check` passed for the tracked backlink change (the new task file is untracked). Final scoped status showed only these two documentation changes and no package changes.

## Priorities And Execution

- P0: destructive filesystem safety bypass; address before further clean builds on untrusted output layouts.
- P1: externally observable HTTP/startup failure or lost process-cleanup ownership.
- P2: exceptional failure paths, configuration semantics, typing, and concrete maintainability improvements.
- P3: optional optimization or architecture decision needing evidence.

Paths in task ownership and references are repository-relative. `src` and `test` shorthand inside a task means `packages/express-runtime/src` and `packages/express-runtime/test`.

Use one CLI implementation owner at a time: tasks sharing `src/cli-utils.ts`, `src/cli-api.ts`, or CLI test files must merge sequentially, preferably priority order. Root tasks 11-13 and 16 share `src/index.ts` and `test/index.test.ts` and must also be sequenced. Root-only work can run alongside CLI-only work only with exclusive test/build scheduling. Task 14 follows adapter changes; task 15 owns the final documentation pass; task 17 follows behavioral changes. These scheduling constraints supplement explicit behavioral dependencies below.

All agents must mark a task `in_progress` when taking ownership, record regressions and completion evidence, and use `blocked` for unmet verification or decisions. Only the coordinator edits shared task status concurrently. Never mark completion on code changes alone. Public contract changes require tests, README/website updates, and release-note evidence; do not remove shipped signatures without checking real consumers.

## Shared Verification

Prerequisites: Node >=22 and workspace dependencies installed with `pnpm install` if absent. Do not install or rebuild concurrently with other agents.

- V1: `pnpm --filter @web-ts-toolkit/express-runtime test`. Rebuilds transitive dependencies and runs the package suite, including staged-package and strict consumer coverage. Add focused regressions in the named test files; record their failing-before/passing-after evidence.
- V2: `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` and `git diff --check`.
- V3: `pnpm --filter @web-ts-toolkit/access-router-runtime test`, after V1, for shared CLI/runtime/build/type changes.
- V4: final integration runs `pnpm build`, `pnpm test`, and `pnpm lint` serially, plus V1-V3. Record unrelated blockers explicitly without altering unrelated code. Staged artifact/strict ESM, CJS, and Bundler tests are required, not just source imports or export-name snapshots.
- Never run package tests/builds concurrently: they write shared `dist` outputs. Use existing `test/support` event barriers, subprocess cleanup, temporary directories, and listener snapshots. Do not use fixed sleeps, broad listener removal, unsafe real clean-build destinations, or orphaned children.

## Tasks

### Task ERT-B01: Validate Physical Clean-Output Boundaries

Status: completed

Kind: defect

Priority: P0, accepted output paths can physically target the project despite lexical safety checks.

Suggested agent: filesystem safety specialist

Dependencies: none

Primary ownership: `src/cli-utils.ts` build safety/staging; `test/build-staging.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1306-1351` (`validateOutDirForClean`) checks lexical ancestry and only a final-component symlink. For cwd `/work/project`, an `alias -> /work` link and outDir `/work/project/alias/project` physically target cwd but pass these checks. Input overlap through ancestor symlinks is also missed. This is an ERT-03 residual, not a demonstrated racing-attacker exploit. `test/build-staging.test.ts:298-326` covers direct symlinks only. Staging acquisition at `src/cli-utils.ts:1354-1368,1417-1436` also leaves its owned directory when entry writing or post-creation inspection fails before the cleanup-protected region.

Requirements:

1. Compare canonical physical cwd, output, and supplied app/init paths; resolve the nearest existing ancestor for nonexistent outputs. Reject unsafe roots, ancestry, and input overlap before invoking tsup. Distinguish missing paths from unexpected filesystem errors and fail closed on the latter.
2. Protect every operation after staging-directory acquisition with cleanup; preserve exclusive private staging and consumer-local resolution.
3. Correct legacy collision tests at `test/build-staging.test.ts:60-135` to place collisions in the actual build cwd. Assert attempted failure fixtures really reject, not merely that cleanup happened.

Acceptance criteria:

- Nested ancestor-symlink aliases of cwd, parents, and app/init directories are rejected without modifying sentinel files; safe nonexistent descendants remain usable.
- Injected entry-write/inspection failures leave no owned staging resource. Success, compile failure, and concurrent staging tests still pass.
- Dangerous cases use validation/mocked-build assertions in temporary trees, never an actual destructive build against repository paths.

Verification: V1, V2, V3; regression evidence for each safety and acquisition-failure case.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `validateOutDirForClean` (:1325) now compares canonical physical paths via `canonicalizePhysicalPath` (:1389, realpath of nearest existing ancestor; ENOENT/ENOTDIR walks up, all other FS errors throw `Refusing to clean`) and `canonicalizeCwd` (:1420, fail-closed); rejects physical root/cwd/ancestor plus bidirectional outDir↔app/init overlap, keeps direct-symlink rejection with fail-closed inspection, and skips tsup import for mocked builds (:1543). Staging (`createUniqueStagingDir` :1452, `writeStagingEntry` :1482, `buildBundleFromEntryContent` :1535) takes injectable `BuildStagingDeps` (:1432); every post-acquisition op (entry write, post-write inspection, bundler) runs under try/finally cleanup, staging-dir inspection failures clean up internally, post-write inspection failures fail closed, exclusive `wx`/`0600` staging and cwd-local `mkdtemp` preserved. `test/build-staging.test.ts` — legacy collision tests (:61,:128) now chdir into the temp project (actual staging parent) with mocked bundler asserting unique `.wtt-build-` entries; failed-build test (:205) now asserts the build really rejected; pre-existing-staging test (:447) always removes its repo-cwd fixture and excludes it by name from the leftover count. New regressions: nested cwd-alias rejections (:500), symlinked app/init overlap (:550), safe nonexistent descendants incl. through-symlink (:598), symlink-loop fail-closed (:628), injected entry-write (:655), post-write inspection (:696), and staging inspection (:743) failures leaving no owned staging. Failing-before proof (src stashed, new tests kept, `-t ERT-B01`): 5 failed / 2 passed on old code (nested-alias, loops, all 3 injected failures fail; direct-symlink and safe-descendant pass on both); after fix all 7 pass. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 278 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` clean. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed. No repo-cwd staging fixtures left; CHANGELOG untouched; no other packages touched.

### Task ERT-B02: Preserve Prototype-Named Query Keys

Status: completed

Kind: defect

Priority: P1, valid request-controlled keys trigger adapter 500 responses.

Suggested agent: HTTP input-boundary specialist

Dependencies: none

Primary ownership: `src/cli-utils.ts` request/result dictionaries; `test/cli-utils.test.ts`, `test/adapter-e2e.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1691-1702` (`parseAwsRestQuery`) indexes ordinary objects and calls `.push` on inherited properties. `constructor`, `toString`, and `__proto__` fail rather than reaching the handler. Existing query tests at `test/cli-utils.test.ts:749-796` omit these keys. Related ERT-07.

Requirements: use own-key-safe dictionaries at the shared map-building boundary; audit adjacent header/result maps for the same local prototype/key-loss issue without claiming global pollution. Preserve duplicate-key order and existing decoding semantics.

Acceptance criteria: literal and percent-encoded prototype names, including duplicates, survive in both query maps and reach an HTTP handler without 500; prototypes and unrelated objects remain unchanged; ordinary queries and headers still round-trip.

Verification: V1, V2; direct helper and HTTP regressions.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `parseAwsRestQuery` (:1831-1832) now builds null-prototype `single`/`multi` dictionaries with own-key `hasOwnProperty` append (:1842-1846) instead of `{}` plus `(multi[key] ??= []).push`; adjacent `normalizeAwsRestHeaders` (:1870-1871) and result validators `validateSingleValueHeaders` (:1983)/`validateMultiValueHeaders` (:2001) audited and moved to null-prototype maps for the same local key-safety boundary (no global-pollution claim); duplicate-key order and single-decode semantics unchanged. `test/cli-utils.test.ts` — new `toServerlessEvent` regressions (literal prototype keys with duplicates incl. `__proto__` own-key assertion, percent-encoded `%63onstructor`/`%74oString`/`%5F%5Fproto%5F%5F` duplicate-order, prototype-named header maps, prototype-named result headers). `test/adapter-e2e.test.ts` — new real-HTTP regression delivering literal+encoded prototype query keys through `createServerlessAdapterApp` to a capturing handler and asserting both query maps with 200. Failing-before (src stashed, new tests kept): cli-utils prototype filter 3 failed / 1 passed, adapter-e2e prototype filter 1 failed with `Serverless adapter error: TypeError: multi[key].push is not a function` (500); passing-after: both filters green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 283 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0. ERT-B01 changes rebased intact (not reverted).

### Task ERT-B03: Preserve Raw Request Paths During Event Translation

Status: completed

Kind: defect

Priority: P1, translation silently selects a different route.

Suggested agent: HTTP protocol specialist

Dependencies: ERT-B02

Primary ownership: `src/cli-utils.ts` (`toServerlessEvent`); `test/adapter-e2e.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1662-1668` uses WHATWG URL authority/dot-segment normalization to split HTTP request targets. Probes show `//admin/users` becomes `/users` and `/a/../private` becomes `/private`. Existing end-to-end query tests at `test/adapter-e2e.test.ts:86-116` do not exercise raw request-target edges. Related ERT-07.

Requirements: separate pathname/query without rewriting origin-form paths. Explicitly define absolute-form support or controlled rejection; preserve encoded delimiters and document intentional changes to previously normalized behavior.

Acceptance criteria: raw `http.request({path: ...})` cases cover double slashes, literal/encoded dot segments, and query delimiters without client-side fixture normalization; event path and real wrapped routing follow the selected documented contract.

Verification: V1, V2; direct event and real-handler HTTP regressions.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `toServerlessEvent` now splits the request target with `splitRequestTarget` instead of the WHATWG `URL` parser: origin-form paths are preserved byte-for-byte up to the first literal `?`/`#` (no dot-segment resolution, slash collapsing, or path decoding; encoded `%3F` stays in the path), fragments are stripped, absolute-form URIs are supported by stripping scheme+authority and preserving the raw remainder (bare authority maps to `/`), asterisk-form (`*`) yields path `*`, empty string maps to `/`, and all other targets are rejected with an `Error` (adapter 500 without handler invocation); query single-decode semantics and ERT-B02 null-prototype maps unchanged; full path contract plus the intentional normalization-removal change documented in the `toServerlessEvent` JSDoc. `test/cli-utils.test.ts` — new direct-event regressions (double slashes/literal dot segments, encoded path delimiters with literal-only query splitting, fragment/absolute/asterisk/rejection cases). `test/adapter-e2e.test.ts` — new real-HTTP regressions using raw `http.request({ path })` (no client-side normalization): captured `event.path` verbatim for `//admin/users`, `/a/../private`, `/a/./b`, `/%2E%2E/private`, `/a%2Fb` plus raw duplicate/encoded query round-trip, and literal wrapped routing (`//admin/users`, `/a/../private`, `/a/./b` return 404 while `/users`, `/private` still 200). Failing-before proof (src stashed, new tests kept): all 5 new tests failed on old code (`//admin/users`->`/users`, 200 instead of 404 on rewritten routes); passing-after: full suite green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 288 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0. ERT-B01/B02 changes verified intact (canonical physical-path checks and null-prototype maps still present).

### Task ERT-B04: Capture Repeated Headers At The HTTP Boundary

Status: completed

Kind: defect

Priority: P2, documented multi-value request fidelity is lost before translation.

Suggested agent: adapter integration specialist

Dependencies: ERT-B03

Primary ownership: `src/cli-utils.ts` request-header translation; `test/adapter-e2e.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1727-1731,1944` uses `req.headers`, where Node has already joined or discarded duplicates. A repeated `X-Repeat` becomes `['one, two']`, not `['one', 'two']`. The artificial header array at `test/cli-utils.test.ts:750-760` bypasses this boundary. Related ERT-07.

Requirements: derive multi-value headers from `rawHeaders` or `headersDistinct`, with explicit normalization/single-map policy. Do not reconstruct duplicates by splitting commas in values; preserve the existing public helper where feasible.

Acceptance criteria: a real request with repeated differently cased headers and a value containing a comma preserves the original values in `multiValueHeaders`; documented single-map behavior and repeated response cookies remain correct.

Verification: V1, V2; real HTTP rather than only synthetic helper input.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `toServerlessEvent` keeps its `(method, url, headers, body)` signature and adds an optional fifth `rawHeaders` argument; new `buildAwsRestHeaders`/`headersFromRawHeadersList` derive both maps from the verbatim `rawHeaders` wire list when valid (names lowercased so `X-Repeat`/`x-repeat` merge, values kept verbatim in wire order, never split on commas, null-prototype maps), accept a `headersDistinct`-shaped record as the fifth argument, and fall back to the existing `normalizeAwsRestHeaders` dict path (single map joins with `", "`, unchanged); header contract plus intentional single-map/`set-cookie` policy documented in the `toServerlessEvent` JSDoc with `toServerlessEvent` preserved as the public helper; `createServerlessAdapterApp` now passes `req.rawHeaders ?? req.headersDistinct` at the real HTTP boundary. `test/adapter-e2e.test.ts` — new real-HTTP regression over a raw `net` socket sending `X-Repeat: one, with comma` plus `x-repeat: two`, asserting `multiValueHeaders['x-repeat']` equals `['one, with comma','two']` and `headers['x-repeat']` equals `'one, with comma, two'`; single-map and existing `Set-Cookie` response test retained. Failing-before (src stashed, new test kept): new test fails with `expected [ 'one, with comma, two' ] to deeply equal [ 'one, with comma', 'two' ]`; passing-after: full suite green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 289 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0. ERT-B01–B03 changes intact (full suite includes their regressions).

### Task ERT-B05: Validate Empty Header Arrays Before Response Mutation

Status: completed

Kind: defect

Priority: P1, invalid handler results can leave partial headers on the fallback 500.

Suggested agent: response-boundary specialist

Dependencies: ERT-B04

Primary ownership: `src/cli-utils.ts` result validation/application; `test/cli-utils.test.ts`, `test/adapter-e2e.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1855-1864` validates names only inside the value loop. `{headers:{'x-before':'leak'}, multiValueHeaders:{'bad header':[]}}` passes validation, then fails in `setHeader` after earlier headers were set (`:1748-1757`). Fallback `:1953-1955` does not clear staged headers. Tests at `test/cli-utils.test.ts:882-907` and `test/adapter-e2e.test.ts:155-173` omit this case. Related ERT-07.

Requirements: validate names independently of array length; define empty-array omission/rejection semantics; keep validation before response mutation and ensure a clean fallback if response application fails before sending headers.

Acceptance criteria: invalid names with empty arrays return a clean 500 without earlier headers/body/framing; valid empty arrays follow the documented policy; cookies and precedence still work. Tighten the throwing-handler test at `test/adapter-e2e.test.ts:175-186` to require 500 rather than permitting 200.

Verification: V1, V2; HTTP regression with a previously staged sentinel header.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `validateMultiValueHeaders` now validates the header name even when the array is empty (new `validateServerlessHeaderName`, omission via `continue`), so `{headers:{'x-before':'leak'}, multiValueHeaders:{'bad header':[]}}` throws during validation before any `res.status`/`setHeader` mutation; valid empty arrays are omitted (documented in the `applyServerlessResult` JSDoc) and no longer shadow colliding `headers` entries, preserving single/multi precedence and `set-cookie` array handling. `applyServerlessResult` wraps header/body application in try/catch that removes any headers it staged (baseline snapshot, `headersSent` guard) before rethrowing, and the adapter's apply-failure fallback defensively strips non-baseline staged headers so the 500 carries no partial 200 framing. `test/cli-utils.test.ts` — new regressions: invalid empty-array name throws before mutation (`headersSent` false, no `x-before` staged), injected mid-write `setHeader` failure rolls back staged headers, valid empty arrays omitted without shadowing. `test/adapter-e2e.test.ts` — invalid-results case extended with the empty-array leak shape, new real-HTTP regression asserting raw 500 with no `x-sentinel`/leak body on the wire, new valid-empty omission test asserting `x-keep`/`set-cookie`/precedence; throwing-handler test tightened to require 500. Failing-before (src stashed, new tests kept): new cli-utils empty-array test and both new adapter-e2e tests failed on old code; passing-after: full suite green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 294 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0. ERT-B01–B04 changes verified intact (canonical physical-path checks, null-prototype maps, verbatim path split, rawHeaders derivation still present).

### Task ERT-B06: Settle Body Collection On Concatenation Failure

Status: completed

Kind: defect

Priority: P2, exceptional allocation errors leave requests permanently pending.

Suggested agent: Node stream specialist

Dependencies: ERT-B05

Primary ownership: `src/cli-utils.ts` (`collectBody`); `test/adapter-body-limit.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1614-1622` marks collection finished before `Buffer.concat`; its catch calls `fail`, which immediately returns when finished (`:1584-1586`). Neither promise settlement occurs. Stream-error tests at `test/adapter-body-limit.test.ts:269-283` do not inject final buffer construction failure. Related ERT-02; not a demonstrated default-limit memory-exhaustion exploit.

Requirements: ensure exactly-once rejection and listener cleanup for finalization errors without changing limits, abort behavior, or normal collection. Use deterministic allocation fault injection rather than enormous real allocations.

Acceptance criteria: injected concat failure rejects promptly with the original error, leaves no owned listeners, and yields a controlled adapter failure; boundary-size, aborted, and chunked-body cases still pass.

Verification: V1, V2.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `collectBody`'s `onEnd` no longer routes `Buffer.concat` failures through `fail()` (which early-returns once `finished` is set, leaving the promise permanently pending). `onEnd` still marks `finished` and runs `cleanup()` first, then concats inside try/catch: success resolves, failure rejects directly with the original error, so settlement is exactly-once with no owned listeners left. Limits, abort (`CLIENT_ABORT`), stream-error, and normal collection paths unchanged. `test/adapter-body-limit.test.ts` — two new deterministic fault-injection regressions (conditional `Buffer.concat` mock keyed on unique payloads, no huge allocations): direct `collectBody` rejection with the original error plus zero `data`/`end`/`error`/`close` listeners and idempotent late `end`; adapter-level fault yielding controlled 500 without handler invocation and a healthy follow-up request. Failing-before (fix hunk temporarily reverted, new tests kept, `-t ERT-B06`): 2 failed (both time out after 5000 ms — promise never settles); passing-after: focused file 15/15 green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 296 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` clean. ERT-B01–B05 changes verified intact (physical-path, null-prototype, verbatim-path, rawHeaders, empty-header validation markers still present).

### Task ERT-B07: Retain Watch Ownership Until Child Termination

Status: completed

Kind: defect

Priority: P1, parent shutdown/error handling can abandon a live child.

Suggested agent: process-lifecycle specialist

Dependencies: none

Primary ownership: `src/cli-utils.ts` watcher lifecycle; `test/watch-supervisor.test.ts`, subprocess fixtures/support only as needed.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1200-1226` removes signal listeners before awaiting child cleanup, so a second real signal can terminate the parent before escalation. `:978-984,1006-1015,1098-1105` also clears child ownership on errors that need not mean process exit. `test/watch-supervisor.test.ts:474-511` uses `process.emit`, which cannot reproduce default OS signal termination; `:347-409` does not prove errored children are gone. These are residual ERT-08 ownership failures.

Requirements:

1. Keep guarded signal handling until cleanup settles, then remove only owned listeners. Repeated signals must follow an explicit bounded policy, not accidentally restore Node's default action.
2. Distinguish failure to spawn from errors operating on a live child. Retain ownership until confirmed exit/absence; report inability to terminate without pretending cleanup succeeded.
3. Preserve one-child supervision, coalesced restarts, no post-shutdown respawn, and SIGTERM/SIGKILL escalation.

Acceptance criteria: a real subprocess receiving two OS signals behind explicit readiness/shutdown barriers cleans up its child; live-child error/failed-kill cases do not silently drop ownership; no leaked timers/watchers/listeners/children; diagnostics and exit codes are deterministic.

Verification: V1, V2, V3. OS-specific tests may be gated with explicit platform rationale, not replaced entirely by `process.emit` mocks.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — new `isChildGone` helper (exit/signal-code plus pid fallback) distinguishes spawn failure (confirmed gone) from live-child errors; `spawnChild`'s `error` handler now retains ownership of a live child so `fail`→`shutdown` can terminate it instead of leaking it; `killChild`'s `settle(error)` retains a live child (clears only the termination intent, releases ownership solely on confirmed absence) so failed SIGTERM/SIGKILL reports inability to terminate with diagnostic + nonzero exit instead of pretending success; `runWithWatch` keeps guarded signal handling installed until cleanup settles (removes only owned listeners in a `finally`), with an explicit bounded repeated-signal policy (1st starts single-flight graceful shutdown, 2nd best-effort SIGKILL escalation of the live child, 3rd+ coalesced — Node default never restored mid-cleanup) and single-flight `exitOnce` so a failure exit(1) is not overridden by a trailing exit(0). One-child supervision, coalesced restarts, no post-shutdown respawn, and SIGTERM/SIGKILL escalation preserved. `test/watch-supervisor.test.ts` — 4 new regressions: live-child error with failed kill retains ownership (diagnostic, exit 1, SIGTERM attempted, `getChild()` still the live child), failed SIGTERM/SIGKILL retains ownership with `Watch restart failed` diagnostic, second-signal escalation (sync assertions: guarded handlers retained, `['SIGTERM','SIGKILL']`, coalesced 3rd, exit 0, baseline listeners restored), and a real-OS POSIX subprocess test (helper runs fixed `dist/cli-api.mjs` `runWithWatch` with a real sleeper grandchild; readiness barrier = pid file + `kill(pid,0)`, shutdown barrier = sleeper-side SIGTERM receipt file with no extra supervisor listener; two back-to-back `SIGTERM`s yield helper exit 0, empty stderr, confirmed grandchild absence, unchanged parent listener baseline; skipped on win32 with platform rationale). Failing-before proof: new fake-level tests 3 failed on old src (ownership dropped, handlers removed early); real-OS test fails on old dist (helper exit null via default termination instead of 0) and passes on new. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 9 files / 300 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` clean. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed. ERT-B01–B06 changes intact (full suite includes their regressions; no B01–B06 files touched).

### Task ERT-B08: Propagate Express Dev Readiness

Status: completed

Kind: defect

Priority: P1, programmatic dev reports completion before startup settles.

Suggested agent: CLI orchestration specialist

Dependencies: none

Primary ownership: `src/cli-api.ts` (`runExpressDevCommand`); focused CLI orchestration/subprocess tests.

Finding and references: `packages/express-runtime/src/cli-api.ts:64-86` awaits an optional returned server, but the Express `start` callback discards `startLocalServer()`'s return. `start` and `start-serverless` await readiness at `:123-136,154`. Existing pre-start validation cases at `test/subprocess-harness.test.ts:84-104` cannot catch this. Related ERT-04 and the access-router-runtime shared readiness follow-up.

Requirements: return the server from the Express runner and preserve optional-void behavior only for actual existing generic runner consumers. Do not redesign root startup error policy for this small fix.

Acceptance criteria: deferred readiness keeps `runExpressDevCommand` pending; rejected readiness propagates; successful readiness resolves; a real CLI failure has nonzero exit and no leaked process. Avoid relying solely on an occupied-port case, whose root default handler can exit independently of promise propagation.

Verification: V1, V2, V3.

Completion evidence: `packages/express-runtime/src/cli-api.ts` — Express `start` callback now `return startLocalServer(app, options)` (:83-85); `DevCommandRunner.start` keeps `LocalServer | void` so the existing generic consumer (`access-router-runtime/src/cli.ts`, which returns `runtime.startLocalServer(options)`) and void runners are unaffected, and root startup error policy is untouched. `test/dev-readiness.test.ts` — 8 regressions: `runDevCommand` deferred-pending (setImmediate-flush pending assertion), rejected-readiness identity propagation, success resolution, void-runner resolution; `runExpressDevCommand` deferred-pending (start-invocation deferred barrier, `exitAfterShutdown:true` arg assertion), rejected-readiness `rejects.toBe` with a non-port failure (no occupied-port reliance), success resolution, and real `dist/cli.js dev` subprocess on an import-throwing app (exit 1, `timedOut:false`, stderr contains marker, child reaped). The Express-path tests mock `startLocalServer` on both `src/index.ts` and the stale `src/index.js` (ERT-B17) since vitest binds `cli-api`'s `./index` to the stale file — both mocks are set/reset together and assertions use their union. Failing-before proof (fix stashed, new tests kept): exactly the 2 Express-path tests fail (deferred resolves early, rejected resolves instead of rejecting); passing-after: focused file 8/8 green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 308 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed. No CHANGELOG update; B01–B07 files untouched.

### Task ERT-B09: Preserve Positional Escaping In Watch Child Arguments

Status: completed

Kind: defect

Priority: P2, supported leading-dash module paths fail only under watch.

Suggested agent: CLI parsing specialist

Dependencies: ERT-B07

Primary ownership: `src/cli-utils.ts` (`buildChildArgs`); `test/cli-utils.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:1167-1177` reconstructs `dev --watch ./src -- --app.js` as `dev --app.js`, losing the parser's `--` protection (`:349-353,689-697`). Tests at `test/cli-utils.test.ts:1079-1159` check literal arrays, not parse/reconstruct/parse semantics. Related ERT-06/ERT-08.

Requirements: place generated options before `--` and the positional module; retain env/preload/start options and remove watch-only flags.

Acceptance criteria: round trips for `--app.js`, `--help`, `--version`, spaces, and ordinary paths preserve app identity and options; watched leading-dash fixture actually starts instead of displaying help or an unknown-option error.

Verification: V1, V2, V3.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — `buildChildArgs` now emits `['dev', ...options, '--', appPath]` (options before `--`, positional after) instead of `['dev', appPath, ...options]`, so the `--` protection from the parent parse (`dev --watch ./src -- --app.js`) survives reconstruction; retained port/host/signals/shutdown-timeout/tsconfig/require/env, watch-only flags still omitted; JSDoc records the escaping contract. `test/cli-utils.test.ts` — updated 3 exact-array expectations to the new shape; new `ERT-B09 positional escaping round trips` block: `it.each` over `--app.js`/`--help`/`--version`/`my app.mts`/`./app.mts` asserting parent parse→rebuild→child reparse preserves app identity, an options-retention test (start/env/preload/tsconfig kept, `--watch`/`--ext`/`--delay` dropped, child reparse equals parent options), and a start-instead-of-help test (`--app.js` no longer throws `Unknown argument`, `--help`/`--version` positionals return dev args without invoking the help/version screen). Failing-before proof (src hunk stashed, new tests kept, `-t buildChildArgs`): 10 failed / 1 passed on old code (`Unknown argument: --app.js`, help-screen nulls, shape mismatches; only the `not.toContain` omission test passed on both); passing-after: 11/11. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 315 tests passed. V2 eslint exit 0 and `git diff --check` clean. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed. No CHANGELOG update; B01–B08 changes preserved (untouched hunks verified in diff).

### Task ERT-B10: Resolve Preloads Relative To The Current Invocation

Status: completed

Kind: defect

Priority: P2, programmatic CLI use can load from the wrong project.

Suggested agent: Node module-resolution specialist

Dependencies: ERT-B09

Primary ownership: `src/cli-utils.ts` preload loader; `test/cli-utils.test.ts`.

Finding and references: `packages/express-runtime/src/cli-utils.ts:838-853` creates `moduleRequire` once at module evaluation, unlike call-time env/app resolution at `:766-769,822-829`. Import in A, change cwd to B, then preload `./register.cjs`: resolution remains in A. Tests at `test/cli-utils.test.ts:1061-1072` cover builtins/empty/missing only. Related ERT-10 public helper ownership.

Requirements: use a consistent invocation-local resolution base, preferably the current cwd when preloading starts. Preserve sequential preload order and supported ESM/CJS behavior; do not introduce sandbox semantics.

Acceptance criteria: isolated A/B fixtures prove only B's same-named preload runs after cwd changes; bare consumer dependencies and builtins still resolve; cwd/env/module side effects are cleaned up.

Verification: V1, V2, V3.

Completion evidence: `packages/express-runtime/src/cli-utils.ts` — removed the module-evaluation-time `moduleRequire` singleton; `preloadModules` now creates an invocation-local `createRequire(pathToFileURL(pathResolve(process.cwd(), '__wtt_runtime_preload__.js')))` at the start of each call, so relative preloads and bare deps resolve against the cwd captured when preloading starts (consistent with call-time `loadEnvFiles`/`loadApp`); sequential `for` loop and sync CJS `require` semantics preserved, no sandbox. `test/cli-utils.test.ts` — new `preloadModules` regressions: A/B isolation test (tmp `a/`+`b/` each with same-named `register.cjs` setting a distinct global marker; `chdir(a)`→`chdir(b)` then `preloadModules(['./register.cjs'])` asserts only `'B'` ran) and order/bare-dep test (`first.cjs`/`second.cjs` assert `['first','second']` order, `node:events` builtin plus fixture `node_modules/ert-b10-bare-pkg` bare specifier resolve from the invocation cwd); both restore cwd, restore/delete global markers, evict fixture `require.cache` entries, and remove tmp trees. Failing-before proof (src hunk stashed, new tests kept, `-t preloadModules`): 2 failed / 3 passed on old code (`Cannot find module './first.cjs'` from stale `__wtt_runtime_preload__` base); passing-after: 5/5. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 317 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` clean. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed. No CHANGELOG update; B01–B09 changes preserved.

### Task ERT-B11: Validate Timer Durations Against Node Limits

Status: completed

Kind: defect

Priority: P2, accepted large durations become near-immediate timers.

Suggested agent: shared configuration-validation specialist

Dependencies: ERT-B09

Primary ownership: `src/numeric-validation.ts`, timer parsing in `src/cli-utils.ts`, timeout validation in `src/index.ts`; corresponding numeric tests.

Finding and references: `packages/express-runtime/src/numeric-validation.ts:1`, `src/index.ts:479-483,658-665`, and `src/cli-utils.ts:79-83,446-453,1069-1077` accept safe integers beyond Node's signed-32-bit timer range. Tests at `test/cli-utils.test.ts:187-188,309-310` explicitly accept `Number.MAX_SAFE_INTEGER`. A Node probe confirmed 2147483648 becomes 1 ms. Residual ERT-06.

Requirements: reject durations above 2147483647 or implement explicitly tested long-duration scheduling; prefer a small timer-specific validator. Do not reduce body-byte limits merely because they share an integer helper. Change contrary tests/docs together and record stricter validation as a public contract change.

Acceptance criteria: 0 and 2147483647 have explicit semantics; 2147483648 and larger are rejected before resource creation/import or scheduled accurately without overflow; CLI separated/equal forms and programmatic shutdown agree; no overflow warning or accidental immediate shutdown/restart.

Verification: V1, V2, V3; timer injection avoids waiting for large durations.

Completion evidence: `src/numeric-validation.ts` — new `MAX_TIMER_DURATION_MS=2147483647` plus `validateTimerDuration(value,name)` (`0..2147483647`); `validateFiniteInteger`/`MAX_INTEGER_OPTION_VALUE` untouched so `--max-body-bytes` keeps the `0..MAX_SAFE_INTEGER` range. `src/cli-utils.ts` — new `parseTimerFlag` used by all four `--shutdown-timeout`/`--delay` separated/equal parse sites; `createWatchSupervisor` validates `watchDelay`, `killTimeoutMs`, and forwarded `shutdownTimeout` before fork/watch/timer creation; JSDoc + `printHelp` ranges (`0..2147483647`). `src/index.ts` — `startLocalServer` validates `shutdownTimeout` via `validateTimerDuration` before `http.createServer` (no new root export; public surface unchanged); JSDoc: `0` force-closes immediately, `2147483647` largest safe delay. Contrary tests updated together: `test/cli-utils.test.ts` boundaries now accept `0`/`2147483647` and reject `2147483648`/`MAX_SAFE_INTEGER` in both CLI forms for both flags. New regressions: `index.test.ts` ERT-B11 (0 resolves, max schedules exactly `2147483647` via stubbed `setTimeout` without waiting, `2147483648`/`MAX_SAFE_INTEGER` throw `Invalid shutdownTimeout` synchronously); `watch-supervisor.test.ts` ERT-B11 (0/max accepted, overflow rejected before fork/watch/timer with counts unchanged, `killTimeoutMs` overflow rejected, change-triggered fake timer asserts exact `2147483647` without waiting). Docs updated as contract change: package `README.md` (validation paragraph split timers vs body-limit, option tables, `shutdownTimeout` row) and `website/docs/packages/express-runtime.md`. No CHANGELOG update per constraints; B01–B10 markers verified intact. Failing-before: old code accepted `MAX_SAFE_INTEGER` per the replaced boundary tests, so the new reject assertions fail on it; passing-after: targeted `cli-utils+index+watch-supervisor` 251/251. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 321 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` clean. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed.

### Task ERT-B12: Propagate Every Shutdown Rejection Value

Status: completed

Kind: defect

Priority: P2, valid JavaScript rejection values are incorrectly reported as success.

Suggested agent: runtime-lifecycle specialist

Dependencies: ERT-B11

Primary ownership: `src/index.ts` shutdown error handling; `test/index.test.ts`, subprocess fixture for exit behavior.

Finding and references: `packages/express-runtime/src/index.ts:683-699` catches into `shutdownError` then tests its truthiness. Rejections with `undefined`, `null`, `false`, `0`, or `''` are logged but shutdown resolves and the CLI success-exit branch remains reachable. Probes reproduced all five. Existing Error-based cleanup tests do not establish falsy-value behavior. Related ERT-04 and access-router-runtime's later rejection contract.

Requirements: track failure independently from its value; preserve original rejection reason, single-flight behavior, cleanup order, and nonzero CLI failure policy.

Acceptance criteria: all five falsy values and an Error reject programmatic shutdown with the original reason; concurrent calls execute cleanup once; CLI subprocess failure exits nonzero even for `Promise.reject()` with no argument.

Verification: V1, V2, V3.

Completion evidence: `packages/express-runtime/src/index.ts` — shutdown cleanup now tracks failure with a dedicated `shutdownFailed` boolean set in the `catch` alongside `shutdownError`, and the failure branch tests the flag instead of the reason's truthiness, so falsy rejections (`undefined`/`null`/`false`/`0`/`''`) reject with the original reason, log once, and take the `process.exit(1)` CLI path; drain-then-cleanup order, single-flight `shutdownPromise`, and success `exit(0)` path unchanged. `test/index.test.ts` — new regressions: `it.each` over all five falsy values plus `Error` asserting rejection identity (`toBe`), single `onShutdown` invocation, and `onShutdown hook failed:` logging; concurrent failing shutdowns (gated `onShutdown` throwing `0`) asserting both `shutdown()` promises reject with the original reason and cleanup runs once; subprocess (`runSubprocess` + `node --input-type=module -e` against fresh `dist/index.mjs` with `exitAfterShutdown:true` and `onShutdown: () => Promise.reject()`) asserting exit 1, no success marker on stdout, and the failure log on stderr. Failing-before proof (src fix stashed, new tests kept, `-t ERT-B12`): 7 failed / 1 passed on old code (all five falsy rows, concurrent, and subprocess fail with resolve/exit-0; only the truthy `Error` row passes); passing-after: focused 8/8 green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 329 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 tests passed. No CHANGELOG update; B01–B11 changes preserved.

### Task ERT-B13: Deduplicate Owned Local Signal Registrations

Status: completed

Kind: defect

Priority: P2, allowed signal arrays can leak listeners after shutdown.

Suggested agent: runtime-lifecycle specialist

Dependencies: ERT-B12

Primary ownership: `src/index.ts` signal registration; `test/index.test.ts`.

Finding and references: `packages/express-runtime/src/index.ts:510-517,714-725` installs a fresh listener for every array item but retains only the last callback per signal in a Map. `['SIGUSR2','SIGUSR2']` leaves one listener after normal shutdown, reproduced in a loopback probe. Existing signal baseline tests do not include duplicate configuration. Residual ERT-04.

Requirements: register once per unique signal or retain every owned registration. Preserve custom arrays, disabled/default signals, and unrelated listeners; do not broaden this into a signal-policy rewrite.

Acceptance criteria: duplicate default/custom signal arrays leave exactly the original listener baseline after shutdown and startup failure; hooks remain single-flight and sentinel listeners survive.

Verification: V1, V2.

Completion evidence: `packages/express-runtime/src/index.ts` — signal registration now iterates `new Set(list)` instead of the raw array, so each unique signal gets exactly one owned `process.once` handler that matches the single `Map` entry removed by `cleanupSignalHandlers`; custom arrays, `signals:false`/default, unrelated listeners, and single-flight shutdown semantics unchanged (no signal-policy rewrite). `test/index.test.ts` — 3 new regressions: duplicate custom `['SIGUSR2','SIGUSR2']` installs exactly one owned listener and returns to baseline+sentinel after shutdown; duplicate default `['SIGINT','SIGINT','SIGTERM','SIGTERM']` installs one owned listener per signal, concurrent signals + double `shutdown()` run `onShutdown` once, and counts restore to baseline with sentinels surviving; duplicate custom signals with a throwing `init` reject `ready` and leave the `SIGUSR2` baseline (each test cleans its `SIGUSR2` baseline in `finally` since the `SIGINT`/`SIGTERM`-only `afterEach` snapshot does not cover it). Failing-before proof (src fix stashed, new tests kept, `-t ERT-B13`): 3 failed / 70 skipped on old code (extra owned listener per duplicate in all three paths); passing-after: focused 3/3 green. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 332 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` clean. No CHANGELOG update; B01–B12 changes preserved (src diff verified to be the single registration line plus untouched B11/B12 hunks).

### Task ERT-B14: Make Root Handlers Compose With The Typed Adapter

Status: completed

Kind: defect

Priority: P2, strict consumers cannot naturally connect two advertised APIs.

Suggested agent: TypeScript installed-consumer specialist

Dependencies: ERT-B06

Primary ownership: handler/adapter types in `src/index.ts`, `src/cli-utils.ts`, `src/cli-api.ts`; `test/export-contract.test.ts`, `test/public-api-surface.test.ts`.

Finding and references: `packages/express-runtime/dist/index.d.mts:91` exposes an object-parameter handler, while `dist/cli-api.d.mts:231,310` requires `GenericHandler` accepting `unknown`. Strict parameter variance rejects natural `createServerlessAdapterApp(createServerlessHandler(app))` composition. The installed fixture at `test/export-contract.test.ts:281-287` substitutes an unrelated unknown-parameter function, masking this mismatch. Related ERT-09/ERT-10; fresh strict compilation was not run during review.

Requirements: reproduce in the packed strict fixture, then align the adapter callable with the event/context it actually supplies. Preserve provider-generic root handling; do not weaken to `any`, add consumer casts, or promise arbitrary provider contexts the local adapter cannot supply.

Acceptance criteria: cast-free root-to-CLI composition compiles in strict NodeNext ESM/CJS and Bundler fixtures with `skipLibCheck:false`; incompatible provider/context assumptions remain rejected; runtime integration and existing CLI loader usage work.

Verification: V1 including real packed declarations, V2, V3.

Completion evidence: `src/cli-utils.ts` — `GenericHandler` narrowed from `(event: unknown, context: unknown)` to `(event: ApiGatewayRestEvent, context: Record<string, unknown>)`, matching what `createServerlessAdapterApp` actually supplies (`handler(event, {})` with a v1 event); `ApiGatewayRestEvent` changed from `interface` to `type` alias (same shape) so its implicit index signature keeps the default provider-generic `ServerlessHandler<Record<string, unknown>, Record<string, unknown>>` assignable without casts; `ServerlessHandler` generics untouched; no `any`, no new casts; adapter JSDoc now states `handler(event, {})` with v1 event + empty record. `test/export-contract.test.ts` — NodeNext ESM fixture replaced the masking unknown-param adapter with cast-free `createServerlessAdapterApp(handler)` / `createServerlessAdapterApp(createServerlessHandler(app))` plus `@ts-expect-error` rejections for custom-event and rich-context handlers; CJS and Bundler fixtures gained cast-free composition (Bundler also a rejection case). Failing-before (src hunk stashed, rebuilt, new fixtures kept): `export-contract` strict-consumer test fails on old types (composition rejected); passing-after: 3/3. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 332 passed. V2 eslint exit 0, `git diff --check` clean. V3 access-router-runtime: 11 files / 81 passed. No CHANGELOG update; B01–B13 hunks untouched.

### Task ERT-B15: Align Deployment And Hover Documentation

Status: completed

Kind: defect

Priority: P2, users are told generated bundles need fewer deployment dependencies than they do.

Suggested agent: package documentation and consumer-test specialist

Dependencies: ERT-B01, ERT-B03, ERT-B04, ERT-B05, ERT-B11, ERT-B14, ERT-B16

Primary ownership: `packages/express-runtime/README.md`, `website/docs/packages/express-runtime.md`, relevant source JSDoc and installed documentation fixtures.

Finding and references: README `:594-599` says the runtime is bundled and only Express remains external unless configured otherwise, but `src/cli-utils.ts:1430` unconditionally externalizes both Express and this runtime package. Adapter JSDoc `:1893-1898` still says Buffer event bodies, while implementation emits base64 strings. Root JSDoc `src/index.ts:166-169` retains unconditional broad-provider claims. Related ERT-03/ERT-07/ERT-10 documentation drift.

Requirements: document actual mandatory externals, runtime/peer installation, chosen adapter event/body/path/header semantics, and final timer/memory policies. Update source JSDoc so emitted declarations agree; do not manually edit dist or change intentional bundling solely to preserve inaccurate prose. Compile the README's Netlify `Handler` example against the actual provider declarations before retaining its compatibility claim; if incompatible, document a supported typed usage or record a bounded follow-up rather than inventing support.

Acceptance criteria: generated local/serverless bundles execute in isolated deployment fixtures with the documented dependencies; installed hover docs no longer claim Buffer events or unconditional provider compatibility; package and website examples match public imports and selected contracts; external behavior changes have release-note evidence.

Verification: V1, V2, V3; isolated generated-bundle execution and declaration/documentation inspection recorded explicitly.

Completion evidence: doc/JSDoc-only fix (no bundling or runtime behavior change; `external: ['express', '@web-ts-toolkit/express-runtime', ...]` at `src/cli-utils.ts:1661` untouched). `src/index.ts` — `ServerlessHandler` JSDoc no longer claims Netlify/Vercel/unconditional provider support (now: generic over provider shapes, `serverless-http` 4 `aws`/`azure` providers, local adapter AWS REST v1 only); `serverlessOptions` JSDoc constrains `provider` to `'aws'`/`'azure'`. `src/cli-utils.ts` — `--external` help (both build sections), build notes, `buildRuntime`/`buildServerless` JSDoc now name both mandatory externals plus deployment install (`express` peer, `serverless-http` ships with runtime); `createServerlessAdapterApp` JSDoc no longer says the body is "passed as a Buffer" (now: buffered via `collectBody`, base64-encoded into the AWS v1 string `body`), stale `#305 workaround` reference removed. `packages/express-runtime/README.md` + `website/docs/packages/express-runtime.md` — mandatory externals + `pnpm/npm add express @web-ts-toolkit/express-runtime` deployment instruction, verbatim origin-form path contract (double-slash/dot-segment/encoded preservation, absolute-form, `*`, empty→`/`, rejection→500), qualified O(limit) memory wording ("small multiple of the limit", no exact ceiling), timer policy (`0..2147483647`) retained, Netlify `Handler`-annotated examples replaced with inferred-type `ServerlessHandler` export plus explicit non-assignability note (bounded follow-up: no platform adapter shipped; local emulation is AWS REST v1 only). Netlify compile check (`tsc --strict`, stub `Handler` with required-`statusCode` response mirroring `@netlify/functions`): `export const handler: Handler = createServerlessHandler(app)` fails with `Type 'Promise<object>' is not assignable to type 'Promise<HandlerResponse>'` — claim removed rather than supported. New `test/deployment-docs.test.ts` (4 tests): doc-contract, qualified-contract/stale-claim, emitted-declaration hover (`dist/index.d.mts`, `dist/cli-api.d.mts`), and isolated deployment — real `buildRuntime`/`buildServerless` outputs keep both externals without inlining runtime code, packed tarball + `express` only installed into a clean fixture, local bundle served `/api/hello` 200 via `startLocalServer`, serverless bundle returned 200 for an AWS v1 event. Failing-before (4 doc/src files stashed, rebuilt, new tests kept): 3 failed / 1 passed (bundle-execution passes on old code as designed — bundling unchanged); passing-after: 4/4. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 11 files / 341 tests passed. V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0, `git diff --check` exit 0. V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test`: 11 files / 81 passed. B01–B14+B16 markers verified intact (physical-path, null-prototype, verbatim-path, rawHeaders, empty-header validation, deferred-decode, timer validator, falsy-shutdown, signal dedup, GenericHandler narrowing). Release-note evidence (CHANGELOG.md untouched per coordinator override, which takes precedence over the task text): no runtime behavior changed, so no behavior entry is owed; suggested note if a release is cut — "docs(express-runtime): generated local/serverless bundles always externalize `express` and `@web-ts-toolkit/express-runtime` (install both at deploy time); local adapter contract documented as AWS API Gateway REST API v1 only with verbatim paths, base64 string bodies, qualified O(limit) memory, and `0..2147483647` timer range; `ServerlessHandler` is not assignable to Netlify `Handler` — export it with its inferred type."

### Task ERT-B16: Remove Unused JSON Decoding And Qualify Memory Claims

Status: completed

Kind: improvement

Priority: P3, avoidable work is visible but end-to-end performance benefit is not measured.

Suggested agent: runtime performance specialist

Dependencies: ERT-B06, ERT-B13

Primary ownership: `src/index.ts` (`defaultRequestHook`); allocation instrumentation/focused tests; memory-related JSDoc in `src/cli-utils.ts` in coordination with CLI owner.

Finding and references: `packages/express-runtime/src/index.ts:264-268` converts the Buffer to UTF-8 before determining readable JSON requests need no conversion. `src/cli-utils.ts:1511,1619,1673,1898` claims limit-plus-one-chunk memory despite concatenation retaining input chunks plus an output Buffer and later base64 allocation. The memory-named test at `test/adapter-body-limit.test.ts:285-296` checks rejection/recovery, not allocation. ERT-05 removed duplicate JSON parsing; this remaining decode and ERT-02 memory wording are narrower follow-ups.

Requirements: defer string conversion until needed without changing the public plain-object hook behavior, media matching, threshold, or Express parser ownership. Quantify allocation/CPU effects for representative at-limit JSON/text/binary inputs and concurrency; replace unsupported exact ceilings with phase-specific evidence or qualified O(limit) wording. Do not propose a streaming rewrite or concurrency controls without measurements.

Acceptance criteria: instrumentation proves readable JSON performs no unused UTF-8 conversion in the hook; plain JSON/text behavior remains covered; reproducible before/after measurements and limitations are recorded, including concat/base64 costs; documentation no longer presents an unmeasured total-memory ceiling.

Verification: V1, V2; record measurement command, Node version, payloads, concurrency, repetitions, and results. No assumed percentage speedup is required.

Completion evidence: `src/index.ts` — `defaultRequestHook` now resolves the content-type/readability decision before any `toString('utf8')`: readable JSON returns early with zero conversions, plain JSON parses via a single deferred decode, non-JSON still converts once; size threshold, media matching (`application/json`, `application/*+json`, case/charset handling), and Express parser ownership unchanged. `src/cli-utils.ts` — the two exact ceilings (`ServerlessAdapterOptions.maxBodyBytes` JSDoc, `createServerlessAdapterApp` JSDoc) replaced with qualified O(limit) wording plus phase-specific costs (chunk retention stops appending past the limit so at most one chunk over is observed; `Buffer.concat` retains chunks + one output; `toServerlessEvent` adds a transient ~4/3 base64 copy; peak is a small multiple of the limit); `collectBody` JSDoc documents the same phases. README/website/help left untouched for ERT-B15's doc pass; no CHANGELOG update; B01–B14 hunks verified intact. New regressions: `test/index.test.ts` 3 ERT-B16 tests (readable JSON zero-conversion via instance `toString` counter, plain JSON exactly one conversion + parse, plain text exactly one conversion); `test/adapter-body-limit.test.ts` 2 ERT-B16 tests (at-limit phases: collect 1024 B → concat 1024 B → base64 1368 B = 4*ceil(1024/3), round-trip decode; 8×512 B concurrent collections settle independently). Failing-before (src stashed, new tests kept, `-t ERT-B16` on index.test.ts): 1 failed / 2 passed (readable-JSON zero-conversion fails on old eager decode); passing-after: 3/3 and 2/2. V1 `pnpm --filter @web-ts-toolkit/express-runtime test`: 10 files / 337 tests passed (the `Expected ";"` line is an expected negative build fixture log, not a failure). V2 `pnpm exec eslint "packages/express-runtime/\*\*/*.{ts,js,mts}"`exit 0 and`git diff --check` clean on touched files. Measurements (`node /tmp/opencode/ert-b16-measure.mjs`, Node v26.7.0, at-limit 1048576 B JSON/text/binary payloads, 50 hook reps, 8-way concurrency): readable JSON 0.002 ms/req with 0 `toString` calls per 10 reqs; avoided eager 1 MiB decode ≈0.16 ms/req (the entire per-request saving — modest, no speedup percentage claimed); plain JSON ≈0.93 ms/req (parse-dominated), plain text ≈0.29 ms/req, binary octet-stream ≈5.0 ms/req (content-dependent: 0x89 bytes expand to U+FFFD replacement chars); collectBody 1 MiB ≈0.3–2.1 ms, base64 exactly ×1.333 with event-encode ≈0.2–0.6 ms; 8 concurrent 1 MiB collections ≈2.4 ms total. Limitations recorded: in-process sync hook timing (no I/O); PassThrough single-chunk bodies (wire chunking/GC noise excluded); no heap-profiler total; figures are order-of-magnitude phase evidence, not a total-memory ceiling — hence the qualified O(limit) docs. No streaming rewrite or concurrency control proposed.

### Task ERT-B17: Resolve Remaining Internal API And Source Ownership

Status: completed

Kind: investigation

Priority: P3, bounded architectural decisions should precede potentially breaking refactoring.

Suggested agent: library architecture specialist

Dependencies: ERT-B01, ERT-B07, ERT-B08, ERT-B09, ERT-B10, ERT-B13, ERT-B14

Primary ownership: evidence and follow-up disposition in this task file; read-only `src/cli-utils.ts`, `src/cli-api.ts`, `src/index.js`, `test/public-api-surface.test.ts`, installed declarations, and confirmed consumers.

Finding and references: `packages/express-runtime/dist/cli-api.d.mts:132-180,325-331` labels watcher injection types internal while public signatures expose them structurally. Export-name locks at `test/public-api-surface.test.ts:121-157` do not protect reachable signatures. Stale `src/index.js:45-94` remains alongside TypeScript; ERT-04 used explicit `.ts` test imports to avoid it. ERT-10 `:607-610,623` already required cohesive modules, but `cli-utils.ts` remains roughly 2,000 lines. This task reconciles unfinished prior scope rather than creating another generic refactor backlog.

Requirements:

1. Inventory public reachable watcher types and actual consumer usage; decide with maintainer input whether to support/document them or move injection behind a private wrapper. Check shipped behavior before narrowing signatures.
2. Establish why stale `src/index.js` exists, who generates/imports it, and whether removing it or preventing source-shadow resolution is safe. It is not evidence of a broken published root: tsup uses TypeScript entries and exports target dist.
3. Recommend the smallest cohesive internal split with clear ownership/testability benefit, or explicitly defer it. Link/reconcile ERT-10 rather than copying its requirements into an unbounded rewrite.

Acceptance criteria: evidence-backed implement/defer/no-action decisions for all three boundaries, named maintainer decisions and compatibility impact, and any approved implementation work assigned precise follow-up IDs with criteria. No public removal or bulk reorganization is required to complete this investigation.

Verification: inspected consumer/import references and emitted signatures; V1-V3 required for any separately approved implementation. Evidence review suffices if this task changes only the decision record.

Completion evidence: read-only investigation; no `src`/`test`/`dist`/doc changes outside this record (B01-B16 hunks untouched, no CHANGELOG update).

- Boundary 1, watcher injection types — decision B17-D1: no-action on signatures (support-as-is, undocumented test seam). `src/cli-utils.ts` exports `WatchSupervisorDeps` (:879), `WatchSupervisorController` (:896), `DEFAULT_WATCH_KILL_TIMEOUT_MS` (:907), `createWatchSupervisor` (:935), `runWithWatch` (:1243), but the public subpath `src/cli-api.ts` re-exports only `runWithWatch` at runtime; its `export type` block (:193-207) omits `WatchSupervisorController`/`WatchSupervisorDeps`, and `createWatchSupervisor`/`DEFAULT_WATCH_KILL_TIMEOUT_MS` are not re-exported at all. `packages/express-runtime` exports map exposes only `.` and `./cli`, so `cli-utils` is unreachable by subpath and no deep `dist` file exists for it. In emitted `dist/cli-api.d.mts`, `WatchSupervisorDeps` (:144) and `WatchSupervisorController` (:160) are declared without `export` yet referenced structurally by exported `runWithWatch` (:193) and `DevCommandRunner.watch` (:479); programmatic check confirms none of `WatchSupervisorDeps`/`WatchSupervisorController`/`createWatchSupervisor` is in the `export {}` list (:493) while `runWithWatch` is. Dist runtime exports 33 keys: `runWithWatch` present, `createWatchSupervisor`/`DEFAULT_WATCH_KILL_TIMEOUT_MS` absent (`typeof undefined`). Consumers: sole confirmed external consumer `packages/access-router-runtime/src/cli.ts` imports only `parseArgs`/`runBuildEntryCommand`/`runDevCommand`/`runCliCommand` (+`RuntimeCliCommand`); no refs to `createWatchSupervisor`/`WatchSupervisorDeps`/`runWithWatch` deps outside `express-runtime` in `packages/`, `website/`, or `docs/`. In-repo `test/watch-supervisor.test.ts` uses `createWatchSupervisor` plus the `runWithWatch` 2nd arg (:550,:724); `README.md:495` names `runWithWatch` without documenting injection. Shipped behavior: dist `runWithWatch` is compiled with a defaulted 2nd param (accepts `deps` positionally), so narrowing/removal would break any positional caller — none confirmed, none disprovable. Compat impact of D1: none (no public change). Follow-up ERT-F01 (optional, docs/tests only): label the `deps` param test-only in `runWithWatch` JSDoc + README helper list and assert in `export-contract` that `WatchSupervisorDeps`/`createWatchSupervisor` stay non-importable from `./cli`; criteria: docs agree with emitted `d.mts`, V1+V2 green. Do not name-export the Deps type or remove the param without a new major-version decision.

- Boundary 2, stale `src/index.js` — decision B17-D2: approved implementation via follow-up ERT-F02 (not executed here per read-only constraint). File is untracked (`git ls-files` lists only `cli-api.ts`/`cli-utils.ts`/`cli.ts`/`index.ts`/`numeric-validation.ts`) and ignored (`.gitignore:11` `packages/**/src/**/*.js`); mtime 2026-08-23 predates all B-work while `src/index.ts` is 2026-09-07; content is stale (eager `toString` at `:83`, no `shutdownFailed`/`new Set(list)`/`validateTimerDuration` — missing B11/B12/B13/B16). Generator: not tsup (explicit `src/*.ts` entries, `outDir: dist`) nor any repo script emitting into `src/`; consistent with stray `tsc`/IDE emit. Importers: `src/cli-api.ts:1` and `src/cli-utils.ts:27` use extensionless `./index`, which vitest binds to the stale `index.js` (per ERT-B08 evidence, `test/dev-readiness.test.ts` mocks both `src/index.ts` and `src/index.js`). Published root is unaffected: exports map targets `dist` only. ERT-F02 criteria: delete `src/index.js` (safe: untracked, ignored, stale, unreferenced by git/build), add a guard regression failing if a sibling `.js` shadows an `src/*.ts` entry, revisit ERT-B08 dual mocks (the `./index.js` mock should become obsolete), V1+V2+V3 green. Compat impact: none on the published package (`dist` unchanged); removes dev/test resolution-shadow risk only.

- Boundary 3, `cli-utils.ts` split — decision B17-D3: explicitly defer; reconciles ERT-10. File is now 2551 lines (review said ~2000). Prior-phase ERT-10 listed an internal split in ownership but completed with exact export locks + measured no-split rationale (67,686 B compressed pack; root import loads no `tsup`/`esbuild`) and performed no module split; B01-B16 added cohesive sections without cross-section defects, so that deferral still holds. Smallest cohesive candidate identified but not implemented: the watch-supervision block (`~:871-1300`: `WatchSupervisorDeps`/`Controller`, `createWatchSupervisor`, `runWithWatch`, `buildChildArgs`, `isChildGone`) — single process-lifecycle owner with a dedicated test file — alternative: build-staging section. Moving it now would churn the D1 seam before B18 verification. Follow-up ERT-F03 (post-B18): extract the watch-supervision seam into `src/watch-supervisor.ts` with `cli-utils` re-exporting for internal compat and byte-identical public surface (`public-api-surface` + `export-contract` unchanged); criteria: no public export-list change, V1+V2+V3 green, ownership note. Compat impact if executed: none intended (internal move only).

- Verification performed: inspected `access-router-runtime` consumer imports, `website/`+`README`+`docs/` refs, in-repo test usages, `dist/cli-api.d.mts` export list (programmatic), `dist/cli-api.js` runtime keys, `git ls-files`/`check-ignore`, file mtimes, and `tsup.config.ts` entries. V1-V3 not re-run: no behavioral change made (last package suite green per B16: 10 files / 337 tests). ERT-B18 ratifies D1-D3 and schedules F01-F03. Decision owner: ERT-B17 investigator; maintainer ratification via coordinator in ERT-B18.

### Task ERT-B18: Independently Verify The Combined Boundaries

Status: completed

Kind: improvement

Priority: P1, shared-boundary fixes need independent integration evidence.

Suggested agent: reviewer who did not implement the behavioral fixes

Dependencies: ERT-B01, ERT-B02, ERT-B03, ERT-B04, ERT-B05, ERT-B06, ERT-B07, ERT-B08, ERT-B09, ERT-B10, ERT-B11, ERT-B12, ERT-B13, ERT-B14, ERT-B15, ERT-B16, ERT-B17

Primary ownership: independent review and completion evidence in this document; fixes only after explicit assignment.

Finding and references: the previous completed ERT-11 review missed cross-path and exceptional-state counterexamples documented above. Export-name assertions, synthetic signal emission, and safety fixtures in the wrong cwd do not independently establish the promised boundaries.

Requirements: verify each acceptance criterion against current behavior/evidence; run real HTTP and OS-process boundary cases; inspect physical filesystem enforcement, failure settlement, ownership cleanup, installed types, public docs, and generated-bundle deployment. Validate claimed bounds and review deferred decisions without expanding this into another broad rewrite.

Acceptance criteria: V1-V4 results and staged-consumer evidence are recorded; no unexplained resource leaks or accidental public contract changes; regressions demonstrate the old behavior fails; no unresolved P0/P1 implementation gap; optional deferrals have maintainer rationale and residual risk. Any required environmental failure keeps this integration task blocked, with exact command/result and prerequisite, rather than completed with a caveat.

Verification: V1-V4, final focused diff review, and an acceptance-criterion evidence checklist recorded here.

Completion evidence: independent verify-only review (no src/test/doc fix implemented by this reviewer; zero file modifications outside this record; no CHANGELOG change — `git diff --name-only -- packages/express-runtime/` shows no changelog file). Fresh serial runs on 2026-09-08 (Node v26.7.0, pnpm 11.18.0), not historical results: V1 `pnpm --filter @web-ts-toolkit/express-runtime test` → 11 files / 341 tests passed (rebuilds transitive deps; includes staged-package, strict ESM/CJS/Bundler consumer via export-contract, isolated generated-bundle deployment via deployment-docs, dev-readiness subprocess); V2 `pnpm exec eslint "packages/express-runtime/**/*.{ts,js,mts}"` exit 0 and `git diff --check` exit 0; V3 `pnpm --filter @web-ts-toolkit/access-router-runtime test` → 11 files / 81 tests passed; V4 `pnpm build` exit 0, full-workspace `pnpm test` exit 0, `pnpm lint` exit 0 (0 errors; 3 warnings only, all pre-existing unused eslint-disable directives in unrelated `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts`). Focused re-run `export-contract + public-api-surface + deployment-docs` → 3 files / 11 tests passed, confirming staged-artifact/strict-consumer/generated-bundle deployment evidence. Independent live probes against fresh `dist` (not task-author fixtures): prototype query keys `constructor/toString/__proto__` survive as own keys; raw paths `//admin/users`, `/a/../private`, `/a/./b` preserved verbatim; raw-socket repeated `X-Repeat: one, with comma` + `x-repeat: two` yields `multiValueHeaders ['one, with comma','two']` with single-map join and no comma-split; all five falsy `onShutdown` rejections (`undefined/null/false/0/''`) reject shutdown with the original reason; invalid empty-array header shape returns clean 500 with no `x-before` leak header or partial body; duplicate `['SIGUSR2','SIGUSR2']` adds exactly one owned listener and returns to baseline after shutdown; `validateOutDirForClean` present with canonical-physical-path enforcement (`Refusing to clean` markers) and `toServerlessEvent` rawHeaders derivation, empty-header validation, concat-settlement, timer validation (`validateTimerDuration`/`MAX_TIMER_DURATION_MS`), `shutdownFailed` flag, and `new Set(list)` dedup markers all confirmed in source. Source-marker spot-checks confirm B07 (bounded repeated-signal policy, ownership retention), B08 (`return startLocalServer`), B09 (options-before-`--`), B10 (invocation-local require), B16 (readability decision before any `toString`), B15 (mandatory externals + qualified contracts in README/website/JSDoc, Netlify `Handler` claim removed), and B14 (`GenericHandler` narrowed to `(ApiGatewayRestEvent, Record<string,unknown>)` in emitted `dist/cli-api.d.mts:299`, matching real `handler(event, {})` supply) intact. Focused diff review (`git diff --stat -- packages/express-runtime/`, 12 files, +2603/-237): public contract deltas are exactly the intended, documented ones — B11 timer-range rejection (README/website/help/JSDoc updated together), B14 `GenericHandler` narrowing + `ApiGatewayRestEvent` interface→shape-identical type alias, additive `BuildStagingDeps` export; no other export-list change, no accidental public removal. Failing-before/old-behavior-fails proof is recorded per task (B01 5-fail, B02 500 `multi[key].push`, B03 route-rewrite 404s, B04 comma-join, B05 leak, B06 5 s timeouts, B07–B16 targeted fails) and current green runs corroborate the fixes without re-stashing. B17 deferrals ratified: D1 no-action on watcher injection seam (support-as-is, F01 docs/tests-only follow-up), D2 stale `src/index.js` approved for deletion via F02 (untracked, ignored, stale, dist unaffected), D3 `cli-utils.ts` split explicitly deferred via F03 (post-B18, byte-identical surface); each carries compatibility impact and residual risk in the B17 record. No unresolved P0/P1 gap, no unexplained leak, no environmental blocker — pre-existing unrelated working-tree diffs (access-router-deco/react, other task docs) were left untouched.

## Decisions And Deferrals

- No maintainer decision blocks starting the confirmed safety/correctness fixes. Empty header-array and absolute-form request behavior must be explicitly selected within their narrowly scoped tasks.
- Public watcher injection ownership and stale-source/module restructuring need the bounded ERT-B17 investigation; do not guess compatibility requirements.
- Separate CLI packaging remains deferred per the prior measured ERT-10 decision. No new rate limiter, global concurrency cap, provider emulator, or wholesale streaming rewrite is justified by this review alone.
- Initialization/shutdown cancellation policy, upgraded WebSocket draining, and full HTTP informational/framing response compatibility were not established by this review; no confirmed defect claim is made for them.

## Definition Of Done

- All mandatory defect tasks satisfy their observable criteria with focused regressions and required serial verification.
- P0/P1 defects are resolved; optional work is completed or explicitly deferred by the maintainer with rationale and residual risk. Update integration dependencies deliberately if optional scope is deferred.
- Public implementation, emitted declarations, README, website, CLI help, and deployment examples agree. Breaking behavior changes have release-note evidence.
- Resource ownership survives success, failure, repeated operations, and alternate entry paths; no unrelated files or concurrent changes are modified.
- The independent integration task records passing required checks, or remains blocked with actionable prerequisites. Historical passing results are never substituted for current verification.
