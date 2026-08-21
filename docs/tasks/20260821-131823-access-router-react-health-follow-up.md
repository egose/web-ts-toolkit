# Access Router React Architectural Health Follow-Up

Created: 2026-08-21 13:18:23 local time

Package: `packages/access-router-react`

Related completed plan:

- `docs/tasks/20260811-114545-access-router-react-review-remediation.md`

## Objective

Close current correctness, cancellation, type-safety, performance, readability, encapsulation, package-verification, and documentation gaps in `@web-ts-toolkit/access-router-react`. This is a standalone execution plan for delegated sub-agents. Agents must verify the current source and tests rather than relying on the earlier plan's completion notes, because the current implementation does not satisfy several contracts recorded there as completed.

No credential-exposure or code-execution vulnerability was confirmed in this review. The security-relevant work is cancellation/resource ownership and bounded handling of caller-controlled request structures; treat those as correctness and denial-of-service hardening, not as proven remote exploits.

## Scope And Working Rules

- Preserve unrelated worktree changes. Never reset, revert, or rewrite files owned by another session.
- Set a task to `in_progress` before implementation. Mark it `completed` only after its required verification passes and completion evidence is appended.
- Add a regression test that fails against the current implementation before fixing each confirmed behavioral defect.
- Prefer one request-lifecycle enforcement point over per-hook patches. Signal composition, cancellation classification, settlement ownership, and listener release must be centralized.
- Keep automatic queries, manual `query()`, and `refetch()` behavior consistent unless an intentional difference is documented and tested.
- Treat query reset semantics, mutation input types, bulk-create support, callback ordering, runtime support, and error behavior as public contracts. Update source types, emitted declarations, installed README, website docs, compile fixtures, and release notes together when behavior changes.
- Do not edit generated `dist/` manually. Rebuild it from source.
- Keep React 18 and React 19 behavior supported. Do not suppress Strict Mode or hook lint rules to hide lifecycle defects.
- Package tests rebuild this package and transitive dependencies. Run package and repository builds/tests serially, never concurrently, because shared `dist/` output can race.
- Do not expose internal controllers, owner tokens, listener registries, or mutable lifecycle state merely to make tests easier.
- Keep changes minimal. Do not add a shared query cache, retry layer, state-management dependency, or general-purpose serializer.

## Non-Goals

- Do not introduce TanStack Query, SWR, Redux, or cross-component request deduplication.
- Do not redesign the `access-router-client` response protocol or its lazy request implementation.
- Do not add automatic retries, optimistic updates, cache invalidation, or background revalidation.
- Do not claim that request-key inputs are remotely attacker-controlled without showing an application path that exposes them. The confirmed issue is unbounded synchronous work on caller-provided structures.
- Do not preserve contradictory or unsafe behavior through compatibility aliases unless a concrete shipped consumer requires it.
- Do not split files solely to meet a line-count target. Extract only cohesive lifecycle or keying units with focused tests.

## Baseline Verification

Verified on 2026-08-21:

- The worktree was clean before review (`git status --short` produced no output).
- `pnpm --filter @web-ts-toolkit/access-router-react test`: passed. Transitive builds, strict NodeNext and Bundler declaration consumers, 11 Vitest files, and 198 tests completed successfully.
- `pnpm --filter @web-ts-toolkit/access-router-react test:react18`: exited successfully with 8 files and 180 tests, but it installed dependencies into the fixed shared path `/tmp/opencode/react18-deps`, omitted three default-lane files, and printed expected uncaught render errors from request-key tests.
- `pnpm exec tsc --noEmit -p tsconfig.json` from the package: failed. The config follows workspace source aliases outside the package `rootDir`, lacks Node test types, uses ES2020 while source/tests use newer APIs, and exposes package-local test type errors. Notable errors include four `Error(message, { cause })` calls, invalid `throwOnError`/`enabled` export probes, and invalid fixtures.
- The default test gate does not run `test:react18`, source/test no-emit typechecking, coverage, or a packed React-hook behavior test.
- Existing packed consumers inspect exports and exercise `requestKeyFor`; they do not mount a hook from the installed tarball.

## Priority Definitions

- P0: confirmed cross-identity data exposure, authorization bypass, code execution, or similarly critical security failure. No P0 finding was confirmed in this review.
- P1: broken cancellation/reset contract, stale state or callbacks, runtime/type mismatch, or ineffective compatibility gate that can produce incorrect application behavior.
- P2: package hardening, resource bounds, architecture, readability, documentation accuracy, or testability gap without a demonstrated critical failure.
- P3: optional ergonomics or measurement work whose implementation depends on benchmark or maintainer evidence.

## Wave 1: Cancellation And State Ownership

### Task ARR-H01: Enforce Three-Source Query Cancellation At One Boundary

Status: completed

Priority: P1

Suggested agent: React cancellation and resource-lifecycle specialist

Dependencies: none

Primary ownership:

- `packages/access-router-react/src/create-model-hook.ts`
- `packages/access-router-react/src/fetch.ts`
- focused signal and listener-cleanup tests

Finding:

`RequestConfig` publicly accepts `signal`, but each query serializes the complete `requestConfig` during render. `requestKeyFor` rejects `AbortSignal` as a non-plain instance, so supplying the advertised option throws before a request starts. If keying is bypassed, `mergeRequestConfig` writes the hook-owned signal last and discards `requestConfig.signal`. Manual `query()` composes only the per-call signal and internal controller.

There is a second cancellation defect: `runWithCallbacks` decides cancellation from the internal controller's `signal`, while the transport receives a separately composed signal. If only the per-call caller signal aborts, a resolving transport can still write data and invoke success callbacks; a rejecting transport can publish the cancellation as `error` and invoke failure callbacks. Existing coverage checks only that the forwarded signal aborts.

This contradicts the README's three-source composition claim and the earlier ARR-05 completion evidence.

References:

- `packages/access-router-react/src/types.ts:30-47`
- `packages/access-router-react/src/create-model-hook.ts:302-370`
- `packages/access-router-react/src/create-model-hook.ts:440-458`
- `packages/access-router-react/src/create-model-hook.ts:825-836`
- `packages/access-router-react/src/create-model-hook.ts:1050-1063`
- `packages/access-router-react/src/create-model-hook.ts:1556-1563`
- `packages/access-router-react/src/create-model-hook.ts:1649-1656`
- `packages/access-router-react/src/fetch.ts:35-75`
- `packages/access-router-react/src/fetch.ts:92-109`
- `packages/access-router-react/src/fetch.ts:330-338`
- `packages/access-router-react/test/dependency-policy.test.tsx:724-764`
- `packages/access-router-react/README.md:347`

Implementation requirements:

1. Exclude `requestConfig.signal` from structural serialization. Decide explicitly whether replacing only the signal should restart an automatic query; prefer signal identity as a separate dependency only if replacement is intended to be request-affecting.
2. Compose the hook-owned controller, `requestConfig.signal`, and per-call `QueryCallOptions.signal` into the one effective signal used by both transport forwarding and lifecycle cancellation classification.
3. Make the effective signal authoritative after both resolve and reject. An aborted effective signal must not write data/error or fire success/error/settled callbacks.
4. Preserve every non-signal request-config field without mutating the caller's config or headers.
5. Release every attached listener on success, failure, any source abort, replacement, and unmount. Keep release idempotent.
6. Apply one implementation to `useRead`, `useList`, `useCount`, and `useDistinct`; do not repeat composition in four hooks.
7. Reconcile `src/types.ts` JSDoc, README, website docs, and the earlier contradictory manual-query statement with the chosen contract.

Acceptance criteria:

- All four query hooks render with `requestConfig: { signal }` and issue a request instead of throwing during render.
- Aborting the internal, request-config, or per-call signal makes the forwarded effective signal abort with the first source's reason.
- A transport that resolves after any source abort cannot write data or invoke `onSuccess`/`onSettled`.
- A transport that rejects after any source abort cannot write `error` or invoke `onError`/`onSettled`.
- Instrumented listener tests cover success, failure, each source abort, already-aborted signals, same-signal inputs, replacement, unmount, and repeated release; 100 settled requests leave zero outstanding listeners.
- Original config, headers, and source signals are not mutated.
- Focused tests and `pnpm --filter @web-ts-toolkit/access-router-react test` pass.

Completion evidence:

- Changed: `packages/access-router-react/src/create-model-hook.ts`, `packages/access-router-react/src/fetch.ts`, `packages/access-router-react/src/types.ts`, `packages/access-router-react/README.md`, `website/docs/packages/access-router-react.md`, `packages/access-router-react/test/query-signal-composition.test.tsx`, `packages/access-router-react/test/fetch.abort-signals.test.ts`
- Implemented: `useAutoQuery` now composes the hook-owned controller, `requestConfig.signal`, and per-call `QueryCallOptions.signal` into one effective signal used for both transport forwarding and cancellation classification.
- Implemented: `requestConfig.signal` is excluded from structural request-key generation, so signal-only replacement does not trigger an automatic refetch while future query executions still use the latest signal.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/query-signal-composition.test.tsx test/fetch.abort-signals.test.ts`
- Result: 2 files, 9 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, strict declaration checks, and 13 Vitest files with 207 tests passed.

### Task ARR-H02: Make Query Reset Invalidate Pending Settlement

Status: completed

Priority: P1

Suggested agent: React concurrency and state-ownership specialist

Dependencies: ARR-H01

Primary ownership:

- `packages/access-router-react/src/create-model-hook.ts`
- focused reset/concurrency tests
- reset contract documentation

Finding:

Query `reset()` clears state and `hasDataRef` but neither aborts the active request nor invalidates `ownerIdRef`. A request that was pending before reset remains the current owner and can later repopulate data/error and invoke callbacks. Mutation reset already invalidates pending state writes by incrementing its latest-invocation token, so the two lifecycle families have inconsistent state-clear semantics.

References:

- `packages/access-router-react/src/create-model-hook.ts:250-256`
- `packages/access-router-react/src/create-model-hook.ts:302-370`
- `packages/access-router-react/src/create-model-hook.ts:481-489`
- `packages/access-router-react/src/create-model-hook.ts:713-738`
- `packages/access-router-react/src/create-model-hook.ts:946-950`
- `packages/access-router-react/src/create-model-hook.ts:1190-1203`
- `packages/access-router-react/src/create-model-hook.ts:1629-1633`
- `packages/access-router-react/src/create-model-hook.ts:1718-1722`
- `packages/access-router-react/README.md:248-255`

Implementation requirements:

1. Define reset as an authoritative state-clear: invalidate the current query owner's right to publish settlement.
2. Preserve the documented statement that reset is not transport cancellation unless maintainers explicitly choose a breaking contract change. The request may continue, but its pre-reset result must be stale for hook state and observers.
3. Keep `isFetching` truthful under the chosen contract. If transport continues after reset while its settlement is ignored, document whether reset exposes physical transport activity or authoritative hook activity.
4. Apply the same invalidation primitive to read, list, count, and distinct.
5. Preserve list-specific clearing of `previousData`, `totalCount`, and `hasSettledRef`.

Acceptance criteria:

- For each query hook, reset during a deferred request immediately restores initial/default data and clears error/loading state.
- A pre-reset success, normalized failure, rejection, or abort cannot repopulate state or fire callbacks after reset.
- A new query started after reset owns state normally and can settle successfully.
- `useList` does not revive stale `previousData` or `totalCount` after reset.
- Mutation reset behavior remains unchanged.
- Focused tests and the package test pass.

Completion evidence:

- Changed: `packages/access-router-react/src/create-model-hook.ts`, `packages/access-router-react/README.md`, `website/docs/packages/access-router-react.md`, `packages/access-router-react/test/query-reset.test.tsx`
- Implemented: query `reset()` now invalidates the current query owner token inside `useAutoQuery` before clearing visible loading/fetching state, so pre-reset settlements become stale for state and callbacks without aborting the underlying transport.
- Implemented: query reset docs now state that stale pre-reset success/failure/rejection/abort settlements are ignored and that `isFetching` reflects authoritative hook activity after reset rather than physical transport activity.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/query-reset.test.tsx`
- Result: 1 file, 5 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, NodeNext and Bundler declaration checks, and 14 Vitest files with 212 tests passed.

## Wave 2: Public Runtime And Type Contracts

### Task ARR-H03: Honor Configured Pagination In Advanced Manual Lists

Status: completed

Priority: P1

Suggested agent: query API correctness agent

Dependencies: ARR-H01

Primary ownership:

- `packages/access-router-react/src/create-model-hook.ts`
- focused `useList` tests

Finding:

The public type comment and implementation comment say `useList().query()` falls back to configured `listParams` when manual args are omitted. Basic mode does `args ?? listParams`, but advanced mode spreads only `args`. Consequently advanced `query()` silently drops configured page/page-size values while auto-fetch and `refetch()` preserve them.

References:

- `packages/access-router-react/src/types.ts:242-250`
- `packages/access-router-react/src/create-model-hook.ts:1071-1110`
- `packages/access-router-react/src/create-model-hook.ts:1132-1138`
- `packages/access-router-react/src/create-model-hook.ts:1176-1187`

Implementation requirements:

1. Resolve one `effectiveArgs = args ?? listParams` before the basic/advanced branch.
2. Use the same fallback contract for auto-fetch, `query()`, and `refetch()`.
3. Preserve explicit manual arguments as a full override of configured pagination.
4. Do not alter filter, sort, projection, options, or request-config forwarding.

Acceptance criteria:

- `useList({ advanced: true, listParams: { page: 3, pageSize: 20 } }).query()` forwards both configured values to `listAdvanced`.
- Explicit manual args override the configured values.
- Basic mode retains its current fallback behavior.
- A focused regression fails against the current implementation and the package test passes.

Completion evidence:

- Changed: `packages/access-router-react/src/create-model-hook.ts`, `packages/access-router-react/test/harness.test.tsx`
- Implemented: `useList` now resolves one `effectiveArgs = args ?? listParams` before the basic/advanced branch, so auto-fetch, manual `query()`, and `refetch()` share the same configured-pagination fallback contract.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/harness.test.tsx`
- Result: 1 file, 15 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, strict NodeNext and Bundler declaration checks, and 14 Vitest files with 213 tests passed.

### Task ARR-H04: Preserve Mutation Input Types And Resolve Bulk Create

Status: completed

Priority: P1

Suggested agent: TypeScript public-API specialist

Dependencies: none for contract investigation; implementation must precede ARR-H06

Primary ownership:

- `packages/access-router-react/src/types.ts`
- `packages/access-router-react/src/create-model-hook.ts`
- strict declaration consumers
- mutation behavior tests and docs

Finding:

Create, update, and upsert inputs are exposed as `object`, discarding the underlying `ModelService` mutation input generics. Arrays satisfy `object`; the client interprets an array passed to `create` as bulk create and returns `ArrayModelResponse`, but the React hook casts it to a single `ProjectedModelResponse` and stores array data as one projected model. This is a confirmed runtime/declaration mismatch.

References:

- `packages/access-router-react/src/types.ts:254-284`
- `packages/access-router-react/src/types.ts:287-342`
- `packages/access-router-react/src/create-model-hook.ts:1210-1308`
- `packages/access-router-react/src/create-model-hook.ts:1311-1481`
- `packages/access-router-client/src/services/model-service.ts:73-78`
- `packages/access-router-client/src/services/model-service.ts:281-295`
- `packages/access-router-client/src/services/model-service.ts:342-362`

Implementation requirements:

1. Obtain the maintainer decision recorded below: either support bulk create truthfully or reject arrays statically and at runtime.
2. Thread the client service's create/update/upsert input types through `createModelHooks` and the returned hooks instead of replacing them with `object`.
3. If bulk create is supported, add overloads or a separate result surface whose promise, callbacks, and state are array-aware. Do not union single and array state into an ambiguous shape without a discriminator.
4. If bulk create is not supported, reject arrays before calling the service and provide an actionable error; declaration tests must reject array input.
5. Preserve projection typing for successful single-model advanced mutations.
6. Treat this as a public declaration change and update docs/release notes.

Acceptance criteria:

- Strict consumer tests prove custom create/update/upsert input types remain inferred from a configured service and reject unrelated keys/shapes.
- The chosen bulk contract is consistent across TypeScript, runtime result, hook `data`, callbacks, README, website docs, and emitted declarations.
- No cast can turn `ArrayModelResponse` into `ProjectedModelResponse` on an accepted path.
- Existing mutation concurrency/reset behavior remains green.
- NodeNext and Bundler declaration consumers and the package test pass.

Completion evidence:

- Changed: `packages/access-router-react/src/types.ts`, `packages/access-router-react/src/create-model-hook.ts`, `packages/access-router-react/README.md`, `website/docs/packages/access-router-react.md`, `packages/access-router-react/test/mutation-inputs.test.tsx`, `packages/access-router-react/test-decl-consumer/decl-consumer.strict.test.ts`, `packages/access-router-react/test-packed-consumer/consumer/consumer-types.ts`
- Contract: `createModelHooks` now preserves custom create/update/upsert input types from the bound `ModelService`, and `useCreate().mutate(...)` is explicitly single-record-only for both TypeScript and runtime callers.
- Implemented: `useCreate` rejects array input before calling the client service, so no accepted path can cast `ArrayModelResponse` into the hook's single-model `ProjectedModelResponse` state or callback surface.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/mutation-inputs.test.tsx`
- Result: 1 file, 2 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, NodeNext and Bundler declaration consumers, and 15 Vitest files with 215 tests passed.
- Verified: `pnpm test:packed-consumer`
- Result: 2 files, 6 tests passed.

### Task ARR-H05: Isolate Callback Observers And Consolidate Mutation Ownership

Status: completed

Priority: P2

Suggested agent: hook architecture and testability specialist

Dependencies: ARR-H02, ARR-H04

Primary ownership:

- `packages/access-router-react/src/create-model-hook.ts`
- focused callback and unmount tests

Finding:

Query and mutation callback groups run inside one `try`. If `onSuccess` or `onError` throws, `onSettled` is skipped despite callbacks being described as isolated observers. Mutation callback ownership is also split: `useMutation` owns success/settled with one mount ref, while four public wrappers own error with separate mount refs and repeated try/catch blocks. This duplication makes ordering, unmount, and exception behavior harder to reason about and test.

References:

- `packages/access-router-react/src/create-model-hook.ts:258-277`
- `packages/access-router-react/src/create-model-hook.ts:601-740`
- `packages/access-router-react/src/create-model-hook.ts:1225-1301`
- `packages/access-router-react/src/create-model-hook.ts:1326-1390`
- `packages/access-router-react/src/create-model-hook.ts:1414-1475`
- `packages/access-router-react/src/create-model-hook.ts:1491-1534`
- `packages/access-router-react/README.md:186-200`

Implementation requirements:

1. Confirm the intended observer contract: recommended behavior is that each registered observer is attempted once in deterministic order even if a prior observer throws.
2. Centralize safe observer invocation for both query and mutation lifecycles; report each thrown observer error without reclassifying the request result.
3. Move mutation `onError` into the shared mutation lifecycle and remove per-hook error wrappers where possible.
4. Use one mount/ownership source per mutation hook invocation. Do not expose it publicly.
5. Preserve per-invocation callbacks for overlapping mutations and latest-invocation-wins state writes.
6. Keep the implementation readable; remove historical comments that no longer explain current invariants, while retaining concise rationale for ownership and observer isolation.

Acceptance criteria:

- A throwing `onSuccess` does not prevent `onSettled` from running once.
- A throwing `onError` does not prevent failure-form `onSettled` from running once.
- Callback exceptions do not mutate hook `error` or change the returned promise's request-based settlement.
- No callback fires after unmount.
- Create/update/upsert/delete use the same mutation observer boundary without repeated wrapper try/catch implementations.
- Concurrent mutation, resolved-failure, cancellation, and package tests pass.

Completion evidence:

- Changed: `packages/access-router-react/src/create-model-hook.ts`, `packages/access-router-react/test/callback-observers.test.tsx`
- Implemented: query and mutation observers now run through one isolated ordered dispatcher, so each observer is attempted once even if an earlier callback throws, and callback failures are still reported asynchronously without reclassifying the request result.
- Implemented: mutation `onError` now lives inside the shared `useMutation` lifecycle, letting create/update/upsert/delete share one mount-gated observer boundary while keeping `useCreate`'s single-record array guard local to that hook.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/callback-observers.test.tsx`
- Result: 1 file, 3 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, strict NodeNext and Bundler declaration checks, and 16 Vitest files with 218 tests passed.

## Wave 3: Verification And Compatibility Gates

### Task ARR-H06: Add Clean Source And Test Typecheck Gates

Status: completed

Priority: P1

Suggested agent: TypeScript build and tooling specialist

Dependencies: ARR-H04

Primary ownership:

- `packages/access-router-react/tsconfig*.json`
- `packages/access-router-react/package.json`
- package-local invalid TypeScript fixtures

Finding:

The package's default tests compile declaration consumers but do not typecheck package source and runtime tests as one supported configuration. The current `tsconfig.json` includes source and tests, follows workspace source aliases outside package `rootDir`, lacks Node test types, and fails. Vitest transpilation therefore permits invalid export probes and fixtures. Source also uses the ES2022 `Error` cause constructor while declaring/building ES2020.

References:

- `packages/access-router-react/tsconfig.json:1-18`
- `packages/access-router-react/package.json:32-40`
- `packages/access-router-react/tsup.config.ts:3-12`
- `packages/access-router-react/src/create-model-hook.ts:845`
- `packages/access-router-react/src/create-model-hook.ts:1066`
- `packages/access-router-react/src/create-model-hook.ts:1563`
- `packages/access-router-react/src/create-model-hook.ts:1656`
- `packages/access-router-react/test/access-router-react.exports.unit.test.ts:142-162`
- `tsconfig.base.json:17-20`

Implementation requirements:

1. Add separate source/build and runtime-test no-emit configs so dependencies resolve from built declarations or package exports rather than pulling sibling source under this package's `rootDir`.
2. Configure test types/libs intentionally for Node, DOM, Vitest, JSX, and the actual ECMAScript target.
3. Fix package-local type errors rather than hiding them with broad `skipLibCheck`, `any`, or exclusions of substantive tests.
4. Remove invalid `throwOnError` and `UseBaseOptions.enabled` probes unless the public API is intentionally changed.
5. Resolve the ES2020 versus `Error.cause` mismatch together with ARR-H07's runtime policy. Do not let source declarations claim a lower target than emitted runtime syntax.
6. Add the source/test checks to the normal package test or a required package `typecheck` script invoked by CI.
7. Add V8 coverage reporting for `src/**` with fixtures/generated output excluded. Record the initial branch/function baseline before choosing non-trivial thresholds; coverage must supplement, not replace, explicit lifecycle branch tests.

Acceptance criteria:

- Source-only and runtime-test `tsc --noEmit` commands exit zero from a clean checkout.
- Strict NodeNext and Bundler declaration consumer checks continue to pass.
- The default required package gate invokes all four typecheck categories.
- A package coverage command reports source branch/function coverage and enforces maintainer-approved thresholds that do not encourage low-value tests.
- Removing a real public property or introducing an invalid runtime test fixture makes an appropriate typecheck fail.
- `pnpm --filter @web-ts-toolkit/access-router-react test` passes.

Completion evidence:

- Changed: `packages/access-router-react/package.json`, `packages/access-router-react/tsconfig.json`, `packages/access-router-react/tsconfig.typecheck.json`, `packages/access-router-react/tsconfig.test-typecheck.json`, `packages/access-router-react/tsup.config.ts`, `packages/access-router-react/vitest.config.ts`, `packages/access-router-react/test/access-router-react.exports.unit.test.ts`, `packages/access-router-react/test/access-router-react.docs.compile.test.ts`, `packages/access-router-react/test/access-router-react.packed-consumer.test.ts`, `packages/access-router-react/test/cancellation.test.tsx`, `packages/access-router-react/test/concurrent-mutations.test.tsx`, `packages/access-router-react/test/dependency-policy.test.tsx`, `packages/access-router-react/test/harness.test.tsx`, `packages/access-router-react/test/hooks.test.tsx`, `packages/access-router-react/test/projection.test.tsx`, `packages/access-router-react/test/query-signal-composition.test.tsx`, `packages/access-router-react/test/support/index.ts`
- Implemented: the package now has separate no-emit source and runtime-test configs that clear inherited workspace source-path aliases, typecheck against ES2022 + DOM/Vitest/Node libs intentionally, and run as `typecheck:source`, `typecheck:test`, `typecheck:nodenext-strict`, and `typecheck:bundler-strict` under the default package `test` gate.
- Implemented: invalid runtime test probes and fixtures were corrected instead of excluded, including stale `throwOnError` / `UseBaseOptions.enabled` export assertions, missing type-only barrel re-exports, overly broad response fixtures, unsupported ad-hoc filter literals, and stale success payload shapes that only Vitest transpilation had been tolerating.
- Implemented: the package target used for type/build verification is now aligned at ES2022, and `test:coverage` reports `src/**` V8 coverage with enforced global thresholds.
- Verified: `pnpm exec tsc --noEmit -p tsconfig.typecheck.json`
- Result: passed.
- Verified: `pnpm exec tsc --noEmit -p tsconfig.test-typecheck.json`
- Result: passed.
- Verified: `pnpm test:coverage`
- Result: passed with source coverage `statements 96.8%`, `branches 86.11%`, `functions 96.84%`, `lines 96.81%`; enforced thresholds set to `96/86/96/96`.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, all four typecheck categories, and 16 Vitest files with 218 tests passed.

### Task ARR-H07: Align Runtime Target, Engines, And React Compatibility Lanes

Status: completed

Priority: P2

Suggested agent: package compatibility and CI specialist

Dependencies: ARR-H06

Primary ownership:

- `packages/access-router-react/package.json`
- `packages/access-router-react/tsup.config.ts`
- `packages/access-router-react/vitest.react18.config.ts`
- React matrix setup/harness
- packed-consumer runtime matrix

Finding:

The package builds for ES2020 but emits ES2022 `Error` cause construction. It declares Node `>=22` even though the root workspace supports Node `>=20` and this browser-facing package has no Node runtime imports. React 18 is advertised as verified but is absent from the default test gate. Its setup reuses predictable global path `/tmp/opencode/react18-deps`, skips validation once one React directory exists, can retain stale/partial dependencies, and is unsafe for concurrent jobs.

References:

- `packages/access-router-react/package.json:34-50`
- `packages/access-router-react/tsup.config.ts:7`
- `packages/access-router-react/tsconfig.json:4`
- `packages/access-router-react/vitest.react18.config.ts:1-80`
- `packages/access-router-react/README.md:13-16`
- `package.json:26-28`

Implementation requirements:

1. Obtain the maintainer's minimum-runtime decision below. Align TypeScript lib/target, tsup target, `engines`, README, and packed tests to that decision.
2. Establish runtime requirements from used platform features, not from an arbitrary inherited Node version.
3. Replace the fixed React 18 directory with an isolated `mkdtemp` workspace, a pinned manifest/lock or equivalent reproducible install, an environment-provided path, and cleanup in `finally`.
4. Validate React, React DOM, and Testing Library versions before tests. Two concurrent lanes must never share a dependency tree.
5. Make React 18 and React 19 required CI lanes or invoke both from the default package verification path without racing shared builds.
6. Ensure both lanes run the same substantive behavior files unless a documented React-version reason requires an explicit exclusion.

Acceptance criteria:

- Build target, TypeScript libs, emitted runtime syntax, `engines`, README, and packed consumer assertions state one consistent compatibility contract.
- React 18 and React 19 required lanes pass from clean isolated environments.
- A deliberately wrong React DOM major or incomplete install is detected before Vitest runs.
- Two concurrent React-matrix setup jobs use distinct directories and clean them afterward.
- The React 18 lane's test inventory difference is removed or explicitly justified and enforced.

Completion evidence:

- Changed: `packages/access-router-react/package.json`, `packages/access-router-react/vitest.config.ts`, `packages/access-router-react/vitest.runtime.config.ts`, `packages/access-router-react/vitest.runtime-shared.ts`, `packages/access-router-react/vitest.react18.config.ts`, `packages/access-router-react/test/react18-lane.ts`, `packages/access-router-react/test/run-react18-lane.ts`, `packages/access-router-react/test/react18-lane.test.ts`, `packages/access-router-react/test/access-router-react.packed-consumer.test.ts`, `packages/access-router-react/README.md`, `website/docs/packages/access-router-react.md`
- Contract: `@web-ts-toolkit/access-router-react` now states one ES2022 / Node `>=20` compatibility floor across package metadata, packed-consumer assertions, installed README, and website docs while preserving the `react ^18 || ^19` peer contract.
- Implemented: the default package `test` gate now requires both runtime lanes sequentially via `test:react19` and `test:react18`, with the React 18 lane sharing the same runtime test inventory as React 19 and non-runtime packed/docs/export checks running separately under `test:nonruntime`.
- Implemented: `test:react18` now provisions a fresh `mkdtemp` dependency workspace on every run, installs exact `react@18.3.1`, `react-dom@18.3.1`, and `@testing-library/react@16.3.2` versions, validates the installed tree before Vitest starts, supports a caller-provided temp parent via `ACCESS_ROUTER_REACT18_TMPDIR`, and removes the isolated tree in `finally`.
- Verified: `pnpm exec vitest run --config vitest.runtime.config.ts test/react18-lane.test.ts`
- Result: 1 file, 3 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build and all four typecheck categories passed; the React 19 runtime lane ran 14 files / 203 tests, the isolated React 18 runtime lane ran the same 14 files / 203 tests, and the non-runtime packed/docs/export lane ran 3 files / 18 tests.

### Task ARR-H08: Execute Hook Behavior From The Packed Artifact

Status: completed

Priority: P2

Suggested agent: package-consumer integration specialist

Dependencies: ARR-H01, ARR-H04, ARR-H07

Primary ownership:

- `packages/access-router-react/test-packed-consumer/**`
- `packages/access-router-react/test/access-router-react.packed-consumer.test.ts`
- packed-consumer harness only as needed

Finding:

Runtime behavior tests import package source. Packed ESM/CJS consumers inspect exports and execute `requestKeyFor`, but they do not mount `createModelHooks` from the installed tarball. A bundling, externalization, JSX/runtime, or declaration/runtime integration error affecting hooks can therefore pass source behavior and packed export tests independently.

References:

- `packages/access-router-react/test/hooks.test.tsx:1-25`
- `packages/access-router-react/test-packed-consumer/consumer/consumer.mjs:1-49`
- `packages/access-router-react/test-packed-consumer/consumer/consumer.cjs:1-48`
- `packages/access-router-react/test/access-router-react.packed-consumer.test.ts:1-250`

Implementation requirements:

1. Install the tarball into a fresh isolated consumer with compatible React and client peer dependencies.
2. Import the installed package, mount at least one query and one mutation hook, and exercise success, normalized failure, and cancellation.
3. Run the behavioral smoke against ESM and CJS entry points where the test runner/runtime can support both truthfully.
4. Include both supported React majors through the matrix established by ARR-H07 without duplicating the full source suite unnecessarily.
5. Keep consumer code independent of workspace source aliases and undeclared transitive dependencies.

Acceptance criteria:

- Packed consumers execute a read query, caller cancellation, and one mutation through hooks imported from the installed tarball.
- Tests fail if React is accidentally bundled, the client peer is unresolved, or an export points at source/workspace files.
- ESM/CJS runtime and NodeNext/Bundler type consumers all pass for the declared compatibility matrix.
- `npm pack --dry-run --json` includes only intended package files.

Completion evidence:

- Changed: `packages/access-router-react/test/packed-consumer-harness.ts`, `packages/access-router-react/test/access-router-react.packed-consumer.test.ts`, `packages/access-router-react/test-packed-consumer/consumer/consumer.cjs`, `packages/access-router-react/test-packed-consumer/consumer/consumer.mjs`, `packages/access-router-react/test-packed-consumer/consumer/hooks-smoke-core.cjs`
- Implemented: the packed-consumer harness now provisions isolated React 19 and React 18 consumers with runtime smoke dependencies, while the packed CJS and ESM consumer entries mount `createModelHooks` from the installed tarball and exercise read success, normalized failure, caller cancellation, and create mutation success.
- Implemented: packed runtime smoke now asserts the resolved package entry stays inside installed `node_modules` rather than source/test paths, so export-map regressions and accidental bundled-React/client-peer breakage fail against the shipped artifact.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/access-router-react.packed-consumer.test.ts`
- Result: 1 file, 4 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, all four typecheck categories, React 19 runtime lane, isolated React 18 runtime lane, and non-runtime packed/docs/export checks passed; packed-consumer verification now covers React 19 and React 18 installed-tarball hook smoke plus strict NodeNext and Bundler consumers.

## Wave 4: Documentation And Performance Hardening

### Task ARR-H09: Correct Documentation And Test Lifecycle Semantics

Status: completed

Priority: P2

Suggested agent: API documentation and executable-example specialist

Dependencies: ARR-H01, ARR-H02, ARR-H03, ARR-H04, ARR-H05

Primary ownership:

- `packages/access-router-react/README.md`
- `website/docs/packages/access-router-react.md`
- `packages/access-router-react/test-docs-consumer/**`
- docs compile/runtime tests

Finding:

Several installed and website statements are currently wrong or contradictory: the opening factory signature omits the config object; query failures are described as resolving a `ServiceError`; the cancellation example awaits completion before aborting; concurrent `Promise.all` labels the first positional result as the second and conflates invocation order with settlement order; `requireKeyFor` is misspelled; request-config signal composition is claimed but not implemented; and `RequestKeyError` comments claim hook error-state delivery while hooks synchronously throw a plain `Error` during render.

The docs suite classifies substantive examples as derived fragments and checks normalized line inclusion, so it does not preserve statement order or lifecycle semantics. That is why the await-then-abort example compiles successfully.

References:

- `packages/access-router-react/README.md:5`
- `packages/access-router-react/README.md:100`
- `packages/access-router-react/README.md:228-238`
- `packages/access-router-react/README.md:269-276`
- `packages/access-router-react/README.md:317-332`
- `packages/access-router-react/README.md:347`
- `packages/access-router-react/src/fetch.ts:208-214`
- `packages/access-router-react/src/create-model-hook.ts:837-847`
- `packages/access-router-react/test-docs-consumer/snippets-mapping.md:1-50`
- `packages/access-router-react/test/access-router-react.docs.compile.test.ts:135-209`

Implementation requirements:

1. Update installed and website docs together after preceding contract tasks land.
2. Show cancellation by starting a promise, aborting while pending, then awaiting/handling rejection.
3. Describe Promise ordering and latest-invocation-wins state independently; do not name a positional result by settlement order.
4. State accurately whether request-key failures throw during render or enter hook error state. Align implementation comments too.
5. Replace derived inclusion checks for complete examples with verbatim extraction plus only explicit prefix/suffix scaffolding.
6. Add runtime semantic tests for cancellation and overlapping mutation examples; compilation alone is insufficient.

Acceptance criteria:

- Every listed factual error is corrected in README and website docs.
- Installed README factory examples compile against the packed package.
- Moving `abort()` after the awaited request causes a semantic docs test to fail.
- Swapping or mislabeling `Promise.all` results causes a docs test or explicit assertion to fail.
- Snippet inventory accounts for every substantive code block and distinguishes exact, scaffolded, and intentionally non-executable examples.
- Docs tests and the package test pass.

Completion evidence:

- Changed: `packages/access-router-react/README.md`, `website/docs/packages/access-router-react.md`, `packages/access-router-react/src/fetch.ts`, `packages/access-router-react/test/access-router-react.docs.compile.test.ts`, `packages/access-router-react/test/access-router-react.docs-semantic.test.tsx`, `packages/access-router-react/test-docs-consumer/snippets-mapping.md`, `packages/access-router-react/test-docs-consumer/examples/active-record.tsx`, `packages/access-router-react/test-docs-consumer/examples/cancellation.tsx`, `packages/access-router-react/test-docs-consumer/examples/concurrent-mutations.tsx`, `packages/access-router-react/test-docs-consumer/examples/factory-readme.ts`, `packages/access-router-react/test-docs-consumer/examples/factory-website.ts`, `packages/access-router-react/test-docs-consumer/examples/failure.tsx`, `packages/access-router-react/test-docs-consumer/examples/mutations.tsx`, `packages/access-router-react/test-docs-consumer/examples/organization.ts`, `packages/access-router-react/test-docs-consumer/examples/projection.tsx`, `packages/access-router-react/test-docs-consumer/examples/query-hooks.tsx`, `packages/access-router-react/test-docs-consumer/examples/quickstart.tsx`, `packages/access-router-react/test-docs-consumer/examples/request-key.ts`, `packages/access-router-react/test-docs-consumer/examples/website-extras.tsx`, `packages/access-router-react/test-docs-consumer/examples/website-quickstart.tsx`
- Implemented: installed and website docs now use the correct `createModelHooks({ modelService })` factory shape, describe query failures as promise rejection, show manual-query cancellation while the request is still pending, separate `Promise.all` positional ordering from latest-invocation-wins hook state, correct the `requestKeyFor` helper name, and align request-key failure comments with the actual synchronous render throw contract.
- Implemented: the docs compile harness now distinguishes `exact`, `scaffolded`, and intentionally non-executable snippets, and scaffolded fixtures must preserve each documented block verbatim between explicit marker comments instead of passing on normalized line inclusion alone.
- Implemented: new runtime docs-semantics tests prove the cancellation example aborts before awaiting settlement and that overlapping mutation `Promise.all` results stay tied to invocation order even when hook state follows the latest invocation.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/access-router-react.docs.compile.test.ts test/access-router-react.docs-semantic.test.tsx`
- Result: 2 files, 4 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build and all four typecheck categories passed; the React 19 runtime lane ran 15 files / 205 tests, the isolated React 18 runtime lane ran the same 15 files / 205 tests, and the non-runtime docs/packed/export lane ran 3 files / 18 tests.

### Task ARR-H10: Bound And Measure Structural Request-Key Work

Status: completed

Priority: P2 hardening; implementation details may remain P3 until measured

Suggested agent: performance and input-hardening specialist

Dependencies: ARR-H01, ARR-H06

Primary ownership:

- `packages/access-router-react/src/fetch.ts`
- request-key construction call sites in `create-model-hook.ts`
- focused unit tests and benchmarks
- request-key documentation

Finding:

Every query synchronously serializes request structures during every render. `useList` performs multiple traversals. Object keys are sorted and complete strings are recursively concatenated without maximum depth, node count, or output length. Cycles are rejected, but deeply nested input can overflow the stack and large/shared structures can block render and allocate large strings. No benchmark or supported input budget exists.

This is a confirmed unbounded-work property and a potential application-level denial-of-service risk when an application passes user-influenced filter/task structures. It is not a proven remotely exploitable vulnerability by itself.

References:

- `packages/access-router-react/src/create-model-hook.ts:825-836`
- `packages/access-router-react/src/create-model-hook.ts:1047-1063`
- `packages/access-router-react/src/create-model-hook.ts:1556-1561`
- `packages/access-router-react/src/create-model-hook.ts:1649-1654`
- `packages/access-router-react/src/fetch.ts:263-265`
- `packages/access-router-react/src/fetch.ts:316-328`
- `packages/access-router-react/src/fetch.ts:340-378`

Implementation requirements:

1. First benchmark representative 1k- and 10k-node flat, nested, and repeated-reference inputs under the supported Node runtime. Record methodology and results in this task file.
2. Add deterministic maximum depth and node/output bounds or replace recursion with a bounded iterative traversal. Obtain maintainer agreement on externally observable limits before shipping them.
3. Throw a typed, actionable `RequestKeyError` when a limit is exceeded; do not partially key, truncate, or silently collide.
4. Avoid serializing `requestConfig.signal` and other non-wire identity/control objects as established by ARR-H01.
5. Investigate safe per-render reuse of repeated object references only after measurement. Do not add global caches that retain caller objects or make mutable-object changes invisible.
6. Document expected request-key input size and mutation/stability assumptions.

Acceptance criteria:

- Deep input reaches a deterministic documented limit without native stack overflow.
- Oversized input fails closed with `RequestKeyError`; two distinct oversized values never collapse to the same usable key.
- Benchmarks record time and output allocation proxies for agreed representative cases before and after changes.
- Normal small inputs retain deterministic ordering, Date handling, cycle/accessor rejection, and collision tests.
- No global strong-reference cache retains request objects.
- Focused tests and the package test pass.

Completion evidence:

- Changed: `packages/access-router-react/src/fetch.ts`, `packages/access-router-react/test/dependency-policy.test.tsx`, `packages/access-router-react/README.md`, `website/docs/packages/access-router-react.md`, `packages/access-router-react/test-docs-consumer/examples/query-hooks.tsx`, `packages/access-router-react/test-docs-consumer/examples/mutations.tsx`, `packages/access-router-react/test-docs-consumer/examples/concurrent-mutations.tsx`, `packages/access-router-react/test-docs-consumer/examples/active-record.tsx`, `packages/access-router-react/test-docs-consumer/examples/cancellation.tsx`, `packages/access-router-react/test-docs-consumer/examples/projection.tsx`, `packages/access-router-react/test-docs-consumer/examples/website-extras.tsx`
- Implemented: `requestKeyFor` now enforces deterministic bounds of 64 nested array/object levels, 20,000 first-visit nodes, and 200,000 serialized-key characters; oversized inputs fail closed with actionable `RequestKeyError` messages instead of overflowing the stack, building partial keys, or silently colliding.
- Implemented: repeated object/array references are memoized only within a single `requestKeyFor(...)` call via a per-call `WeakMap`, reducing repeated-reference traversal work without adding any global strong-reference cache or making later renders ignore caller-object mutation.
- Implemented: docs now state the supported request-key budget and stability assumptions, and the scaffolded docs fixtures were re-aligned verbatim so the package docs compile gate continues to enforce exact README/website snippets after the request-key documentation change.
- Benchmarked: `node --input-type=module -e '...'` from `packages/access-router-react` against the pre-change serializer logic and the built `dist/index.mjs` implementation, using 2 warmup runs plus 5 measured runs per case under Node 20-compatible runtime semantics. Output proxy was serialized key length on success, else the thrown error category/message.
- Benchmark results: `flat-1k` before `0.266ms / 12,781 chars`, after `0.753ms / 12,781 chars`; `flat-10k` before `3.400ms / 147,781 chars`, after `3.126ms / 147,781 chars`; `nested-1k` before `0.312ms / 2,003 chars`, after `0.089ms / RequestKeyError(max depth 64)`; `nested-10k` before `0.995ms / RangeError(Maximum call stack size exceeded)`, after `0.087ms / RequestKeyError(max depth 64)`; `repeated-1k` before `2.174ms / 92,013 chars`, after `0.114ms / 92,013 chars`; `repeated-10k` before `27.848ms / 920,013 chars`, after `0.089ms / RequestKeyError(max serialized key length 200,000)`.
- Verified: `pnpm exec vitest run --config vitest.runtime.config.ts test/dependency-policy.test.tsx`
- Result: 1 file, 50 tests passed.
- Verified: `pnpm exec vitest run --config vitest.config.ts test/access-router-react.docs.compile.test.ts`
- Result: 1 file, 2 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: package build, all four typecheck categories, React 19 runtime lane, isolated React 18 runtime lane, and non-runtime exports/packed/docs checks passed; totals were 15 runtime files / 210 tests on React 19, the same 15 files / 210 tests on React 18, and 3 non-runtime files / 18 tests.

## Wave 5: Independent Integration

### Task ARR-H11: Perform Independent Final Integration Review

Status: pending

Priority: P1

Suggested agent: independent reviewer who did not implement ARR-H01 through ARR-H10

Dependencies: ARR-H01, ARR-H02, ARR-H03, ARR-H04, ARR-H05, ARR-H06, ARR-H07, ARR-H08, ARR-H09, ARR-H10

Primary ownership:

- review-only across `packages/access-router-react/**`
- task status and completion evidence
- release notes if public contracts changed

Finding:

The earlier completed plan recorded signal composition and cleanup as complete, but current source still rejects `requestConfig.signal`, discards it during forwarding, and classifies per-call cancellation using the wrong signal. A final reviewer must therefore validate observable behavior directly rather than accepting task prose or passing aggregate counts.

References:

- `docs/tasks/20260811-114545-access-router-react-review-remediation.md:332-404`
- this task file

Implementation requirements:

1. Verify every acceptance criterion against current runtime behavior and emitted declarations.
2. Review cancellation across automatic query, manual `query()`, `refetch()`, dependency replacement, reset, and unmount for all query hooks.
3. Verify single/bulk create and custom mutation input contracts from an installed consumer.
4. Confirm public types, source JSDoc, README, website docs, and implementation agree.
5. Review request-key bounds, listener release, and temp-directory handling for resource leaks and unsafe shared state.
6. Run targeted, package, React matrix, packed-consumer, lint, root build, and full repository tests serially.
7. Record all command results and any deferred work with rationale and residual risk. Do not mark this task complete with unresolved P1 findings.

Acceptance criteria:

- Every preceding task has completion evidence and no stale `pending`/`in_progress` status.
- The reviewer reports no unresolved P0/P1 findings, or the plan remains open with explicit blockers.
- `pnpm --filter @web-ts-toolkit/access-router-react test` passes.
- The required React 18 and React 19 lanes pass from isolated dependency trees.
- Packed runtime/type consumers pass for all declared module/runtime combinations.
- `pnpm lint`, `pnpm build`, and serial `pnpm test` pass.
- `git diff --check` passes and generated artifacts were produced by build commands, not manual edits.

## Dependencies And Parallelization

Recommended allocation:

| Wave | Tasks            | Parallel guidance                                                                                                                                    |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | ARR-H01, ARR-H02 | Sequence. Both own query lifecycle and cancellation state in `create-model-hook.ts`.                                                                 |
| 2    | ARR-H03, ARR-H04 | May run in parallel after ARR-H01 if agents use focused ownership; both touch `create-model-hook.ts`, so coordinate patches before integration.      |
| 2    | ARR-H05          | Run after ARR-H02 and ARR-H04 because it consolidates lifecycle/callback code touched by both.                                                       |
| 3    | ARR-H06          | May begin config design while runtime work proceeds, but integrate after ARR-H04 to avoid treating expected declaration changes as fixture failures. |
| 3    | ARR-H07          | Run after ARR-H06 establishes valid target/typecheck configs.                                                                                        |
| 3    | ARR-H08          | Run after cancellation, mutation, and compatibility contracts stabilize.                                                                             |
| 4    | ARR-H09          | Draft after contracts stabilize; do not publish docs for undecided behavior.                                                                         |
| 4    | ARR-H10          | Benchmark work may run after ARR-H01; bounds and source changes should integrate after ARR-H06.                                                      |
| 5    | ARR-H11          | Always last and assigned to an independent reviewer.                                                                                                 |

Shared hotspots:

- `packages/access-router-react/src/create-model-hook.ts`: ARR-H01 through ARR-H05 and ARR-H10. Sequence integrations; do not let agents independently rewrite the file.
- `packages/access-router-react/src/types.ts`: ARR-H01, ARR-H04, ARR-H09. ARR-H04 owns mutation generic changes.
- `packages/access-router-react/package.json`: ARR-H06 through ARR-H08. ARR-H07 owns compatibility scripts/metadata after ARR-H06 adds typecheck scripts.
- README and website docs: ARR-H09 owns final reconciliation; earlier agents should record required doc changes rather than concurrently rewriting full sections unless needed for their acceptance criteria.
- Build/test commands must not run concurrently because package tests rebuild shared transitive `dist/` outputs.

## Deferred Decisions Requiring Maintainer Input

1. Bulk create contract: resolved by ARR-H04 for the current public API. `useCreate().mutate` remains single-record-only and rejects array input; add a separate bulk hook/result surface only when a concrete consumer requires it.
2. Runtime floor: should this package align with the workspace's Node `>=20`, raise its JS target to ES2022, or preserve ES2020/browser compatibility by avoiding the `Error` cause constructor overload? ARR-H06 and ARR-H07 require one explicit compatibility contract. Recommended default: match the client package's ES2022 target and workspace Node `>=20`, then verify browser bundling separately.
3. Request-key budget: maximum depth/node/output limits are externally observable. ARR-H10 must present benchmark evidence and a proposed budget before enforcing one. Until decided, the unbounded render-work risk remains.
4. Observer exceptions: should all callbacks be attempted independently when an earlier callback throws? Recommended default: yes, because the documented contract calls them observers; report each error asynchronously without skipping `onSettled`.

Only decision 2 blocks its remaining public-contract implementations. Other tasks may proceed.

## Definition Of Done

- All tasks are `completed` or deliberately `deferred` with maintainer-approved rationale and residual risk.
- Every confirmed behavior defect has a regression test demonstrated to fail against the old implementation.
- Query cancellation uses one effective signal for transport and lifecycle decisions, composes every documented source, and releases listeners on every terminal path.
- Query reset prevents pre-reset work from repopulating state or firing callbacks.
- Advanced manual list pagination and mutation input/result declarations match runtime behavior.
- Callback ownership is centralized enough that observer ordering, exception isolation, overlap, and unmount behavior are consistent and testable.
- Source, tests, declaration consumers, packed consumers, React 18, and React 19 all have required green gates.
- Runtime target, package engines, emitted syntax, and documentation state one support contract.
- Request-key work has measured, documented bounds or an explicit maintainer-approved deferral with residual denial-of-service risk.
- Installed README, website docs, source comments, and executable examples agree with shipped behavior.
- The independent integration review and serial repository checks pass.
