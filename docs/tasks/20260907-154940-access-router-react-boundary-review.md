# Access Router React Boundary Review

Created: 2026-09-07 15:49:40 local time

## Objective And Scope

Prepare independently verifiable subagent work for `packages/access-router-react`: correct request ownership, request identity, projection safety, observer reentrancy, request-key validation, and installed-consumer examples. This is a review and execution plan, not an implementation record. All implementation tasks start pending.

Scope includes the four source files, runtime tests, public declarations, README, consumer fixtures, build metadata, and narrowly relevant client/server contracts. Non-goals: shared caching, retries, optimistic updates, bulk-create APIs, a new state-management dependency, or rewriting the client/server protocol. No authorization bypass, credential disclosure, or remotely exploitable vulnerability was established. Getter and resource-budget findings are caller-input/render-purity hardening, not remote code-execution claims.

Related completed plans:

- `docs/tasks/20260811-114545-access-router-react-review-remediation.md`
- `docs/tasks/20260821-131823-access-router-react-health-follow-up.md`

This new phase tracks residual boundary cases after those completed plans. Do not reopen their original findings wholesale or treat historical completion prose as current verification. Each task below identifies overlap explicitly.

## Coverage And Baseline

- Two read-only review scopes covered runtime/lifecycle/serializer and public types/packaging/docs/testing. Coordinator inspected lifecycle, list keying, serializer, metadata, and previous completion evidence.
- `pnpm test:react19` from the package passed: 15 files, 211 tests. Vite emitted a forward-looking native-config-loader warning about CommonJS-loaded TypeScript configs; it did not fail verification.
- The contract reviewer ran `pnpm exec tsc --noEmit -p tsconfig.typecheck.json`, `-p tsconfig.test-typecheck.json`, `-p test-decl-consumer/tsconfig-nodenext.json`, and `-p test-decl-consumer/tsconfig-bundler.json` from the package. All four passed.
- A strict in-memory NodeNext package-import probe against existing declarations accepted unsafe required-field assignments for dynamic, exclusion-only, and union projections. ARR-B03 records the cases to turn into permanent fixtures.
- Coordinator ran a read-only Node ESM probe against existing `dist/index.mjs`: an array index getter ran once and serialized as `[n:1]`; reversed compound-sort dictionaries had equal keys; a 40-level shared subtree referenced beneath another 40 wrappers was accepted (737 characters), whereas its equivalent copied tree threw `RequestKeyError` for maximum depth.
- Existing `dist` was not rebuilt. Probe results corroborate inspected source but are not fresh-artifact release evidence. Runtime failure scenarios not explicitly probed remain static control-flow findings requiring failing regression tests before fixes.
- Full package test, React 18 lane, packed installs, coverage, lint, root build/test, live server round trips, browser profiling, and Node-floor execution were not run during this planning review. These are not prerequisites for creating the plan; required implementation checks are below.
- Pre-existing unrelated work was present in the access-router-deco task documents. Preserve it. No package implementation files were edited by this review.

## Execution Rules

- P1: observable incorrect lifecycle/request behavior or unsafe public types. P2: bounded correctness, hardening, docs, or verification gaps. No P0 finding was confirmed.
- Set status to `in_progress` only when dependencies are complete. Append changed files, commands, results, and remaining risks on completion. If verification cannot run, mark `blocked` with prerequisite and owner rather than claiming completion.
- Keep regressions with their fixes. Confirm failure against the old implementation where feasible, then passing behavior after the change. Do not weaken existing tests to accommodate a fix.
- Keep internals private. Prefer existing `useAutoQuery`, `useMutation`, and serializer boundaries over per-hook patches or public controller exposure.
- Public behavior/type changes require source JSDoc, emitted declarations, README, website docs, consumer fixtures, and release notes to agree. Do not manually edit `dist`.
- Only one agent edits `src/create-model-hook.ts` at a time: ARR-B01 -> ARR-B02 -> ARR-B03 -> ARR-B04. This sequence also protects potential factory-signature changes in ARR-B03.
- ARR-B05 begins after ARR-B01 because both can modify `src/fetch.ts`; ARR-B06 follows ARR-B05. ARR-B05/B06 must not edit hook call sites concurrently with ARR-B02/B03/B04; queue such edits through the current hook owner.
- ARR-B07 follows runtime/type/serializer work and owns final README/website/example reconciliation. Earlier agents may make necessary focused contract edits only while holding those files; communicate handoff in this document.
- ARR-B08 is a read-only investigation and may run alongside implementation. Any proposed shared harness/manifest/CI edits become a separately owned follow-up, not an unannounced concurrent edit.
- All builds and package test scripts that rebuild shared transitive `dist` outputs must run serially. Use one verification runner even when source analysis/implementation is parallel.

## Shared Verification

Working directory for package-local commands: `packages/access-router-react`. Prerequisites: workspace dependencies installed with root `pnpm install`, supported tooling runtime, and built transitive declarations for no-emit/consumer checks. Network access is needed for isolated React 18 and packed-consumer installs.

- Targeted runtime check: `pnpm exec vitest run --config vitest.runtime.config.ts <test-file...>` using files added/changed by the task.
- Package check from root after each implementation group: `pnpm --filter @web-ts-toolkit/access-router-react test`. This serially builds dependencies, runs all four typecheck categories, both React runtime lanes, and non-runtime checks.
- Public API tasks additionally run package-local `pnpm test:packed-consumer` after rebuilding and inspect `dist/index.d.ts` and `dist/index.d.mts`.
- Docs checks: `pnpm exec vitest run --config vitest.config.ts test/access-router-react.docs.compile.test.ts` and the targeted runtime docs-semantic file.
- Final integration: root `pnpm lint`, `pnpm build`, `pnpm test`, then `git diff --check`, all serially. Record unrelated baseline failures separately rather than reverting them.

## Tasks

### Task ARR-B01: Invalidate The Current Query On Disable

Status: completed

Kind: defect

Priority: P1, pending imperative work can publish after cancellation was requested and flags already report idle.

Suggested agent: React request-lifecycle specialist

Dependencies: none

Primary ownership: `src/create-model-hook.ts` (`useAutoQuery`), `src/fetch.ts` (`useAbortManager`), `test/cancellation.test.tsx` and focused ownership tests, relative to the package.

Finding and references:

- `src/create-model-hook.ts:448-485` clears activity on the disabled effect branch, but cleanup aborts only the captured automatic scope. `query`/`refetch` replace that scope at `508-535`.
- `src/fetch.ts:154-167` only aborts the manager's current controller on replacement or unmount. After an automatic request settles, start a deferred manual query/refetch and disable: the old automatic controller aborts, while the manual invocation remains authoritative and can publish success/error/callbacks.
- `test/cancellation.test.tsx:112-182` covers disabling active automatic work, not an imperative replacement. README's cancellation guidance includes disabling at `README.md:263`.
- Residual of ARR-H01 and earlier cancellation work, not the fixed signal-composition bug.

Requirements:

1. Make disable/ID removal invalidate and abort the current request owner regardless of its entry path, without exposing controllers publicly.
2. Define and test request-affecting changes while auto-fetch remains disabled: stale work from the old request context must not publish into the new context. Preserve explicitly starting a new manual request while disabled.
3. Preserve reset-as-state-clear, caller-signal composition, latest callbacks, and listener cleanup. Document any externally changed dependency-transition behavior.

Acceptance criteria:

- For all four query hooks, automatic settlement -> pending `query()` or `refetch()` -> disable aborts the active forwarded signal and converges activity flags.
- Late success, normalized failure, or rejection cannot publish stale data/error/observers. Read ID removal has the same behavior.
- A disabled manual request followed by a structural request-context change cannot settle into the new context; a newly invoked manual request still works.
- Focused regressions fail before the fix, pass afterward, and package checks pass.

Verification: targeted cancellation/signal/reset tests plus shared package check.

Completion evidence:

- Changed files: `packages/access-router-react/src/fetch.ts` (`useAbortManager` gains an internal `abort()` that aborts the current in-flight controller without exposing controllers publicly; manager handle stays function-only and identity-stable), `packages/access-router-react/src/create-model-hook.ts` (`useAutoQuery` `!shouldFetch` effect branch now bumps `ownerIdRef` and calls `manager.abort()` before converging flags and firing `onDisabled`), `packages/access-router-react/test/arr-b01-disable-invalidate.test.tsx` (new, 11 focused regressions).
- Externally changed dependency-transition behavior: disabling (or read-ID removal) while a manual `query()`/`refetch()` is pending now aborts its forwarded signal and invalidates its owner token, so late settlement cannot publish; a structural request-context change while auto-fetch remains disabled (e.g. new `filter` with `enabled === false`) likewise invalidates pending disabled manual work. A manual request explicitly started after the transition takes a newer owner id and still settles normally. Reset-as-state-clear, caller-signal composition, latest-callback invokers, and listener `release()` paths are unchanged.
- Commands/results (package dir `packages/access-router-react` unless noted): `pnpm exec vitest run --config vitest.runtime.config.ts test/arr-b01-disable-invalidate.test.tsx` -> 11 failed before fix (all on `signal.aborted === true` assertion), 11 passed after; shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + typecheck + react19 + react18 lanes + nonruntime) -> all passed (react18 lane: 16 files / 222 tests passed; nonruntime: 3 files / 18 tests passed; no failures).
- Remaining risks: none known; the disabled-branch owner bump also invalidates a still-pending auto request on disable (previously converged via the aborted-owner path calling `onAborted`), but `onDisabled` clears the same ancillary state (`useList.previousData`), so behavior is preserved.

### Task ARR-B02: Preserve Compound-Sort Precedence In Request Identity

Status: completed

Kind: defect

Priority: P1, reordered compound sorts can silently retain the old ordering and page membership.

Suggested agent: query-contract specialist

Dependencies: ARR-B01

Primary ownership: `src/create-model-hook.ts` list key construction, `test/dependency-policy.test.tsx`, focused list tests.

Finding and references:

- `src/create-model-hook.ts:1113-1115,1157-1162,1188-1198,1223` keys `sort` as an unordered dictionary but forwards the original object and memoizes its closure by that key.
- `src/fetch.ts:419-441` sorts all plain-object keys. `{status: 1, name: 1}` and `{name: 1, status: 1}` therefore collide despite different primary sort fields.
- Client `packages/access-router-client/src/types.ts:48-50` supports object sorts; server `packages/access-router/src/model.ts:66-76` forwards sort to Mongoose. Generic dictionary equivalence is intentionally tested at `test/dependency-policy.test.tsx:137-139`.
- This is a semantic-keying gap beyond ARR-H10, not a request to remove ordinary dictionary canonicalization.

Requirements:

1. Use an order-preserving semantic representation for supported sort objects when deriving dependencies, retaining original wire precedence.
2. Keep ordinary dictionary equality stable; do not globally make `requestKeyFor` insertion-order-sensitive.
3. Keep string/tuple-array sorts supported and avoid introducing accessor execution while normalizing sort inputs.

Acceptance criteria:

- Reversing only compound-sort field order triggers a replacement automatic request.
- Subsequent `query()` and `refetch()` forward the new precedence, not a retained closure.
- Existing tuple/string sort and unordered-filter equivalence tests remain green.

Verification: targeted dependency/list tests and shared package check.

Completion evidence:

- Changed files: `packages/access-router-react/src/fetch.ts` (adds package-internal `sortKeyFor`: same traversal/budgets/`RequestKeyError` contract as `requestKeyFor` with a `preserveObjectKeyOrder` flag so plain-object keys keep insertion order; `requestKeyFor` behavior unchanged), `packages/access-router-react/src/create-model-hook.ts` (`useList` `sortKey` now via `sortKeyFor`; `useRead` splits `sort` out of the composite `requestKeyFor` into its own order-preserving `sortKey` dep so `doFetchById` re-memoizes and auto `deps` include it), `packages/access-router-react/test/arr-b02-sort-precedence.test.tsx` (new, 9 focused regressions: auto refetch on reversed compound sort, `query()`/`refetch()` forward new precedence, `useRead` advanced-sort reorder, filter-reorder stability, tuple/string support, `sortKeyFor` order-sensitivity/accessor-safety).
- `requestKeyFor({status:1,name:1})` still equals `requestKeyFor({name:1,status:1})` (generic dict equivalence at `test/dependency-policy.test.tsx:137-139` untouched); `sortKeyFor` differs on field-order reversal. String/tuple-array sorts delegate to the same traversal (array order already significant). Accessor check uses descriptor inspection before value reads, so no getter executes. `sortKeyFor` is not re-exported from the package index.
- Commands/results (package dir `packages/access-router-react` unless noted): new test file failed before fix (2 failed / 3 passed: reversed-sort auto request and query/refetch-precedence cases timed out at 1 call), 9 passed after; `pnpm exec vitest run --config vitest.runtime.config.ts test/arr-b02-sort-precedence.test.tsx test/dependency-policy.test.tsx` -> 2 files / 59 tests passed; shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + typechecks + react19/react18 lanes + nonruntime) -> all passed (both React lanes: 17 files / 231 tests passed; nonruntime: 3 files / 18 tests passed; exit 0; `Error: Uncaught ...cycle detected...` lines are expected console noise from throw-path tests).
- Remaining risks: none known; ARR-B01 disable-invalidate behavior preserved (no lifecycle edits, only key derivation + dep arrays). ARR-B05 owns remaining array-index/`Date.getTime`/config-rest accessor paths; `sortKeyFor` introduces no new normalization path beyond the shared traversal flag.

### Task ARR-B03: Make Projection Results Conservative And Union-Safe

Status: completed

Kind: defect

Priority: P1, accepted TypeScript programs can dereference fields absent from projected responses.

Suggested agent: TypeScript public-API specialist

Dependencies: ARR-B02

Primary ownership: `src/types.ts`, factory generic signatures in `src/create-model-hook.ts`, `test-decl-consumer/**`, `test-packed-consumer/consumer/consumer-types.ts`, projection tests and contract docs.

Finding and references:

- `src/types.ts:96-137` and existing `dist/index.d.ts:64-94` use `SelectedKeys` resolving to `never` as a full-model fallback. This also occurs for broad `string`, `string[]`, and exclusion-only selection, not just omitted selection.
- Union selections such as `readonly ['name'] | readonly ['status']` combine selected keys and claim both are required. The client fallback at `packages/access-router-client/src/types.ts:15-46` is more conservative for unknown selections.
- `test-decl-consumer/decl-consumer.strict.test.ts:114-149` and packed type fixtures at `101-131` cover positive literals but omit dynamic/exclusion/union cases. The review's strict probe accepted `const required: string = data.status` with `select: string[]` and `{status: -1}`, and accepted both required fields for the union.
- Residual beyond ARR-09 literal projection coverage; not a new bulk-create requirement.

Requirements:

1. Distinguish absent projection from a supplied projection whose fields cannot be determined. Preserve safe full-model inference when selection really is absent.
2. Preserve alternatives for union projections or conservatively mark uncertain fields optional. Do not solve this with casts or blanket full-model fallback.
3. Apply consistent shapes to query/list data, `previousData`, mutation data, callbacks, and promise responses. Record this as a declaration tightening in release notes.

Acceptance criteria:

- Negative fixtures reject required access to omitted/uncertain fields for dynamic string/array, exclusion-only object, and union projections.
- Positive literal and omitted-selection controls remain useful; cases across read/list/create/update/upsert and callback/promise payloads compile as intended.
- Source, NodeNext, Bundler, and packed consumers pass against rebuilt declarations, not source aliases alone.

Verification: shared package and public API checks; inspect both emitted declaration branches.

Completion evidence:

- Changed files: `packages/access-router-react/src/types.ts` (adds package-internal `IsAbsentProjection<TSelect>` = `[Projection] extends [TSelect]` so only the true no-projection default keeps the full required model; supplied selections resolve via `NarrowedDataShape<T, S>` = `Model<T, ResolvedSelectedShape<T, S, never>> & ResolvedSelectedShape<T, S, never>`, which is `Partial`-based (all optional) when `SelectedKeys` is `never`; all four aliases `ProjectedShape`/`ProjectedShapeArray`/`ProjectedModelResponse`/`ProjectedListModelResponse` distribute over union `TSelect` so alternatives keep separate required/optional contracts instead of merging keys; no casts and no blanket full-model fallback on the supplied path), `packages/access-router-react/src/create-model-hook.ts` (two `useList` empty-array initializers become `[] as unknown as DataArray` — the empty array is valid for every element shape; required because the now-distributive `ProjectedShapeArray<T, TSelect>` stays deferred over the generic `TSelect`, otherwise `useState<DataArray>` rejects `never[]`; no runtime or public-type change), `packages/access-router-react/test-decl-consumer/decl-consumer.strict.test.ts` (new `ARR-B03` describe: dynamic `string`/`string[]`, exclusion-only `{ status: -1 }`, union `readonly ['name'] | readonly ['status']` negative `@ts-expect-error` fixtures across read/list data, `previousData`, `onSuccess`/`onSettled` callbacks, and `query()`/`refetch()`/`mutate()` payloads for read/list/create/update/upsert, plus omitted/literal positive controls), `packages/access-router-react/test-packed-consumer/consumer/consumer-types.ts` (mirrored fixtures for the installed-tarball consumers), `packages/access-router-react/test/access-router-react.exports.unit.test.ts` (the `ProjectedModelResponse<T, never>` full-model contract assertion updated: the no-projection default is `Projection`, which still resolves to `ModelResponse<T>`; explicit `never` now resolves to the conservative `ModelResponse<T, Partial<T>>` with a negative `name`-required fixture), `packages/access-router-react/README.md` + `website/docs/packages/access-router-react.md` (one focused sentence each documenting the tightening).
- Before/after: the 5-case probe (`ProjectedShape<Pet, string|string[]|{status:-1}|union>` required-field assignments) compiled cleanly before the fix (bug reproduced) and errors on all 5 after; the new decl-consumer negatives fail against the stale `dist` (24 `Unused '@ts-expect-error'` errors on NodeNext) and pass after `pnpm build` rebuilds `dist/index.d.ts` + `dist/index.d.mts` (both inspected: `IsAbsentProjection` + distributive aliases present in both branches; `dist` rebuilt by build script, never hand-edited).
- Commands/results (package dir `packages/access-router-react` unless noted): `pnpm exec tsc --noEmit -p tsconfig.typecheck.json`, `-p tsconfig.test-typecheck.json`, `-p test-decl-consumer/tsconfig-nodenext.json`, `-p test-decl-consumer/tsconfig-bundler.json` -> all pass; package-local `pnpm test:packed-consumer` -> 2 files / 6 tests pass (packed CJS/ESM smoke + strict NodeNext/Bundler installed consumers + docs compile); docs/nonruntime re-check `vitest run --config vitest.config.ts test/access-router-react.docs.compile.test.ts test/access-router-react.exports.unit.test.ts` -> 2 files / 14 tests pass; shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + 4 typechecks + react19/react18 lanes + nonruntime) -> EXIT 0 (react19: 17 files / 231 tests; react18: 17 files / 231 tests; nonruntime: 3 files / 18 tests; `cycle detected` stacks are expected throw-path console noise, same as ARR-B02).
- CHANGELOG.md NOT updated per coordinator instruction (release-notes recording deferred to the release process / ARR-B07 reconciliation); the tightening is recorded in source JSDoc (`ProjectedShape` docs carry an `ARR-B03` declaration-tightening note) plus the README/website sentences above.
- Remaining risks / handoff: explicit `UseReadQueryResult<Pet, Projection>` (broad type passed by hand) is indistinguishable from the omitted default and keeps the full model — acceptable since real inference never produces bare `Projection` from a supplied `select`; `ProjectedShapeArray` distributes to a union of arrays (one array per alternative) rather than an array of unions — element reads are equally conservative either way; ARR-B01/B02 files untouched (`fetch.ts` not edited; `create-model-hook.ts` keeps B01 owner-invalidation + B02 order-preserving `sortKey`); full README/website/example reconciliation stays with ARR-B07.

### Task ARR-B04: Make Settlement Safe Against Reentrant Observers

Status: completed

Kind: defect

Priority: P2, callbacks can start new work or unmount while stale settlement continues mutating lifecycle state.

Suggested agent: React concurrency and observer-boundary specialist

Dependencies: ARR-B03

Primary ownership: `src/create-model-hook.ts` observer dispatch, shared lifecycles and list settled-data ref; `test/callback-observers.test.tsx`, `test/previous-data.test.tsx`.

Finding and references:

- `src/create-model-hook.ts:432-439` runs error observers before `onFailed`. A list `onError` that starts replacement B lets stale A subsequently clear B's `previousData` snapshot.
- `src/create-model-hook.ts:1049-1077,1146-1147` updates `hasSettledRef` during application, but mirrors settled data only on render. Starting B directly in A's `onSuccess` captures pre-A data before React commits A.
- `src/create-model-hook.ts:182-190,339-345,711-737` checks observer lifetime around a sequence, not between user calls; synchronous unmount from the first observer still permits the later observer and mutation state writes.
- Existing callback tests at `test/callback-observers.test.tsx:72-185` cover exceptions and unmount-before-settlement, not unmount inside dispatch. Previous-data tests at `test/previous-data.test.tsx:122-145,208-249` wait for render or do not retry from callbacks.
- ARR-H05 established throw isolation; these are reentrancy gaps at the same boundary. ARR-H11 moved a different latest-value ref out of render, not this list mirror.

Requirements:

1. Complete owner-specific internal settlement changes before invoking application code where possible; otherwise revalidate ownership before subsequent internal changes.
2. Maintain authoritative settled-list data at application/reset boundaries so an immediate follow-up sees the just-settled page, without relying on render-time ref mutation.
3. Recheck mount lifetime between observers and before later state writes. Preserve per-invocation mutation callbacks, latest-state ownership, reset semantics, and exception isolation. Do not suppress `onSettled` merely because the preceding observer throws.
4. Replace misleading historical/render-ref comments in touched sections with concise current invariants, not a broad file split.

Acceptance criteria:

- Retry B started inside A's `onError` retains B's snapshot; B started inside A's `onSuccess` captures A's returned data, including first settlement and post-reset cases.
- Synchronous unmount from success/error prevents subsequent observers and state writes for query and mutation paths.
- Throwing observers still leave request-based promise settlement unchanged and attempt the next observer while mounted.
- Existing overlapping mutation, reset, cancellation, and previous-data tests pass.

Verification: focused observer/previous-data regressions and shared package check on both React majors.

Completion evidence:

- Changed files: `packages/access-router-react/src/create-model-hook.ts` (`runObserverSequence` takes an optional `isAlive` gate checked before each observer so a sync unmount stops later observers while a throw still proceeds while mounted; `fireCallbacksSafely` passes `() => mountRef.current` and lists `mountRef` in deps; query success/error paths return/throw early when unmounted so no state writes or observers fire post-unmount while the per-invocation promise still settles; error path runs owner-internal `onFailed()` before app observers so a retry started in `onError` keeps its `previousData` snapshot; `useList` `latestDataRef` is now written synchronously in `applyResult`/`reset` as the authoritative settled page so a follow-up started in `onSuccess` captures the just-settled page without waiting for the render mirror, which is retained only for prop-driven alignment; mutation paths run per-invocation observers through the alive-gated sequence, recheck mount before the latest-write gate so an observer-started follow-up keeps its claim and an observer-triggered unmount skips `setData`/`setError`; touched comments replaced with concise ARR-B04 invariants), `packages/access-router-react/test/arr-b04-reentrant-observers.test.tsx` (new, 8 focused regressions).
- Commands/results (package dir `packages/access-router-react` unless noted): new test file failed before fix (7 failed / 1 passed: retry-in-onError snapshot, first-settlement capture, post-reset capture, query onSuccess/onError unmount skips, mutation onSuccess/onError unmount skips), 8 passed after; `pnpm exec vitest run --config vitest.runtime.config.ts test/callback-observers.test.tsx test/previous-data.test.tsx test/arr-b04-reentrant-observers.test.tsx` -> 3 files / 21 tests passed; shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + typechecks + react19/react18 lanes + nonruntime) -> EXIT 0 (react18 lane: 18 files / 239 tests passed; nonruntime: 3 files / 18 tests passed; `cycle detected` stacks are expected throw-path console noise, same as ARR-B02/B03).
- Remaining risks: none known; query pre-observer state writes (applyResult/flags) still commit before a sync-unmounting first observer, but no post-observer internal writes remain so unmount only skips the second observer; ARR-B01/B02/B03 behaviors preserved (no owner/key/projection edits).

### Task ARR-B05: Enforce Accessor-Free Key Construction Across Supported Inputs

Status: completed

Kind: defect

Priority: P2, supported containers can execute caller getters during React render despite the explicit no-getter contract.

Suggested agent: serializer and render-purity specialist

Dependencies: ARR-B01

Primary ownership: `src/fetch.ts`, `test/dependency-policy.test.tsx`, focused request-config tests.

Finding and references:

- `src/fetch.ts:293-294` promises no getter execution; array indexing at `378-383`, instance `Date.getTime` at `352-353`, and config object-rest at `91-96` bypass ordinary-object descriptor validation at `427-437`.
- The review probe serialized an accessor-bearing array and observed one getter invocation. `test/dependency-policy.test.tsx:216-227` tests only a plain-object accessor.
- This is incomplete enforcement of the accessor contract retained by ARR-H10. It requires caller-created JavaScript objects and is not a remote exploit claim.

Requirements:

1. Inspect array element descriptors before reads, accounting for inherited accessors in sparse arrays. Preserve documented normal sparse-array behavior or explicitly document a deliberate tightening.
2. Obtain Date values through intrinsic operations rather than caller-overridable method lookup. Avoid getters while excluding `requestConfig.signal` from structural identity.
3. Preserve source signal behavior and input immutability. Document the boundary for proxies: reflective operations can trigger proxy traps; do not promise safe introspection of arbitrary proxies.

Acceptance criteria:

- Getter spies remain at zero for own/inherited array accessors, overridden/accessor Date methods, and top-level request-config properties during key construction; unsupported cases fail with actionable typed errors.
- Ordinary Dates, plain arrays/objects, legitimate signal config, cycle rejection, and key determinism continue to pass.
- No new unsafe normalization path is introduced by ARR-B02; coordinate a final cross-path test.

Verification: targeted dependency/config tests and shared package check.

Completion evidence:

- Changed files: `packages/access-router-react/src/fetch.ts` (accessor-free key construction: array elements read descriptor-first with prototype-chain walk for holes — own/inherited accessors throw `RequestKeyError` before any getter fires, true holes serialize as `undefined` preserving documented sparse behavior and inherited data reads through by descriptor value; Dates compare by the intrinsic `Date.prototype.getTime` captured at module load via prototype-chain membership instead of `instanceof`/`value.getTime()`, so own/accessor/prototype overrides never fire; built-in rejections use prototype-chain membership with static names and `safePrototypeDisplayName` instead of instance `constructor` reads; `requestConfigKeyInput` rebuilt descriptor-first excluding `signal` by name before any read and preserving enumerable symbols so they reach `requestKeyError` instead of colliding; JSDoc documents the deliberate inherited-accessor tightening and the proxy-trap boundary), `packages/access-router-react/test/arr-b05-accessor-free.test.tsx` (new, 12 focused regressions: own/inherited array accessors, sparse-hole preservation, inherited-data read-through, overridden/accessor/patched-prototype Date methods, top-level config accessor, signal-accessor exclusion, fresh-copy immutability, ordinary/cycle/determinism controls, `sortKeyFor` cross-path).
- Commands/results (package dir `packages/access-router-react` unless noted): new test file failed before fix (8 failed / 4 passed: own/inherited array accessors executed getters, Date overrides executed, config/signal getters executed, cross-path array accessor serialized), 12 passed after; `pnpm exec vitest run --config vitest.runtime.config.ts test/dependency-policy.test.tsx test/arr-b02-sort-precedence.test.tsx test/query-signal-composition.test.tsx test/arr-b05-accessor-free.test.tsx` -> 4 files / 76 tests passed (ARR-B02 sort precedence intact: `requestKeyFor` stays unordered, `sortKeyFor` order-sensitive, no new normalization path — shared `requestKeyForImpl` flag only); shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + typechecks + react19/react18 lanes + nonruntime) -> EXIT 0 (both React lanes: 19 files / 251 tests passed; nonruntime: 3 files / 18 tests passed; `cycle detected` stacks are expected throw-path console noise, same as ARR-B02/B03/B04).
- Remaining risks: none known; proxy inputs can still trigger reflective traps (`getOwnPropertyDescriptor`/`getPrototypeOf`/`Object.keys`) — documented as not promised safe, callers must pass plain wire data; cross-realm Dates are rejected as non-plain (same as pre-fix `instanceof` behavior); `mergeRequestConfig`/forwarding still reads values normally at request time (source signal behavior preserved by design — only key construction is accessor-free).

### Task ARR-B06: Enforce Depth On Cached Subtrees And Reject Oversize Inputs Earlier

Status: completed

Kind: defect

Priority: P2, documented structural bounds are identity-dependent and oversized values allocate before rejection.

Suggested agent: bounded-serialization and performance specialist

Dependencies: ARR-B05

Primary ownership: `src/fetch.ts`, serializer regression tests and a reproducible focused benchmark.

Finding and references:

- `src/fetch.ts:247-258,300-319,388,446` caches only strings. A subtree first visited shallowly can be reused deeper without checking its descendant height. The shared/copy probe in the baseline confirms different acceptance for equivalent over-depth content.
- `src/fetch.ts:334-335,410-419,439-440,463-473` JSON-encodes strings/property names and enumerates/sorts full object keys before relevant budget rejection. Current limits bound accepted output, not all temporary work.
- `test/dependency-policy.test.tsx:265-286` tests sharing and depth separately and only near-budget large inputs. This is residual ARR-H10 enforcement, not absence of bounds.

Requirements:

1. Validate effective subtree depth on cache hits, preserving per-call memoization and no global object retention. Keep equivalent shared/copied structures consistent for the documented depth limit.
2. Preflight obviously oversized strings/property names before encoding and reject excessive object width before sorting where feasible. Account for escaping without constructing arbitrarily large diagnostic strings.
3. Measure accepted and rejected wide-object, escaped-string, deep, and repeated-reference cases before/after. Record runtime, input sizes, methodology, elapsed time and output/allocation proxies; no assumed speedup or brittle wall-clock test thresholds.
4. State unavoidable input-sized reflective work honestly. Do not claim absolute CPU/memory bounds for arbitrary caller objects. Retain existing numeric budgets unless a maintainer approves a contract change.

Acceptance criteria:

- Shared and copied over-depth structures both throw `RequestKeyError`, independent of key visitation order; within-limit cache reuse remains deterministic.
- Oversized strings fail before full encoding and wide objects before sorting, demonstrated by focused instrumentation or equivalent evidence.
- Normal small-key determinism/collision/accessor tests pass; benchmark results and residual resource limits are recorded.

Verification: focused serializer tests, recorded benchmark, and shared package check.

Completion evidence:

- Changed files: `packages/access-router-react/src/fetch.ts` (per-call `cache` entries now store `{ key, height }` where height is the intrinsic subtree height — 0 for primitives/Dates/empty containers, else `1 + max(child heights)` — computed by the refactored `serializeRequestKeyNode` inner traversal; cache hits revalidate `depth + height` against `REQUEST_KEY_MAX_DEPTH` so shallow-first reuse deeper past the bound throws the existing depth-limit `RequestKeyError`, keeping shared/copied over-depth consistent independent of visitation order; memoization stays per-call (`WeakMap` created per `requestKeyFor`/`sortKeyFor` invocation, no global retention); string/prop-name preflights reject on raw length (`outputLength + raw + framing > 200000`) before `JSON.stringify` since escaping only grows the encoded form; object/array width preflights reject on counts (`nodesVisited + width > 20000`) plus a lower-bound output check before `sort`/iteration; oversized diagnostics use `truncatedKeyLabel` (full JSON only for names <= 100 chars, else 50-char prefix + total length); `noteRequestKeyNode`/`reserveRequestKeyOutput` reuse shared throw helpers with unchanged messages; numeric budgets retained at 64 / 20000 / 200000; `requestKeyFor` JSDoc documents the cache-height invariant, preflights, and honest residual limits), `packages/access-router-react/test/arr-b06-depth-early-reject.test.ts` (new, 9 focused regressions).
- Failing-before/passing-after: new file failed before fix 5 failed / 4 passed (shallow-first shared over-depth and `sortKeyFor` cross-path accepted instead of throwing; oversize string/prop-name tests observed `JSON.stringify` called with the huge payload; wide-object test observed `sort` called and an output-length rather than pre-sort rejection), 9 passed after.
- Benchmark (reproducible focused script `/tmp/opencode/arr-b06-bench.ts`, run via `pnpm exec tsx` from the package dir against `src/fetch.ts` directly, Node v26.7.0, N=7 runs per case, median elapsed reported as informational only with no timing assertions; instrumentation proxies = `Array.prototype.sort` call count and `JSON.stringify` calls carrying a >100k-char payload, recorded on first iteration; full log methodology in script header):
  | case | input size | before (old) | after (new) |
  |---|---|---|---|
  | wide-accepted | 1000 keys | ok len=12781, sort=1 | ok len=12781, sort=1 |
  | wide-rejected | 20001 keys | throw output-length, sort=1, ~6.15ms | throw node-budget, sort=0, ~2.18ms |
  | escaped-accepted | 10000 quotes raw | ok len=20004 | ok len=20004 |
  | escaped-rejected-expansion | 150000 quotes raw (~300k encoded) | throw output-length, bigStringify=1 | throw output-length, bigStringify=1 (residual: expansion only discoverable by encoding) |
  | oversize-raw-rejected | 250000 chars raw | throw output-length, bigStringify=1 | throw output-length, bigStringify=0 (pre-encoding preflight) |
  | deep-accepted | 60 nested arrays | ok len=123 | ok len=123 |
  | deep-rejected-copied | 65 nested arrays | throw depth | throw depth |
  | deep-rejected-shared | inner depth 40 shared shallow + under 30 wrappers | ok len=237 (bug: accepted) | throw depth (fixed; shared/copied consistent, both visitation orders covered in tests) |
  | repeated-ref-accepted | 500x shared filter object | ok len=46013 | ok len=46013 |
  Wall-clock medians are host/JIT/GC-sensitive and claimed as no speedup; the load-bearing deltas are the allocation proxies (sort 1->0, bigStringify 1->0) and the shared-depth accept->throw correction.
- Residual limits (recorded, not claimed away): budgets bound accepted output and first-visit traversal, not all temporary work — `Object.keys`/descriptor enumeration over a caller object is inherently input-sized; quote/control escaping can expand strings up to ~6x per char before the post-encoding output check fires (see escaped-expansion row); proxy traps on reflective operations remain caller-owned per existing boundary. No absolute CPU/memory bound for arbitrary caller objects is claimed.
- Commands/results (package dir `packages/access-router-react` unless noted): `pnpm exec vitest run --config vitest.runtime.config.ts test/arr-b06-depth-early-reject.test.ts test/dependency-policy.test.tsx test/arr-b02-sort-precedence.test.tsx test/arr-b05-accessor-free.test.tsx test/query-signal-composition.test.tsx` -> 5 files / 85 tests passed; shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + 4 typechecks + react19/react18 lanes + nonruntime, serial) -> EXIT 0 (react19: 20 files / 260 tests passed; react18: 20 files / 260 tests passed; nonruntime: 3 files / 18 tests passed; `cycle detected` stacks are expected throw-path console noise, same as prior tasks).
- Remaining risks: none known; ARR-B01..B05 behaviors preserved (no lifecycle/key-order/projection/accessor edits; targeted suites for B02/B05 plus dependency-policy all green). CHANGELOG.md NOT updated and `dist/` untouched per instructions.

### Task ARR-B07: Execute Real Documentation Examples And Handle Mutation Rejections

Status: completed

Kind: defect

Priority: P2, copy-paste event handlers leak rejected promises and semantic tests do not validate the actual snippets.

Suggested agent: executable-documentation and React testing specialist

Dependencies: ARR-B04, ARR-B06

Primary ownership: package `README.md`, `website/docs/packages/access-router-react.md`, `test-docs-consumer/**`, `test/access-router-react.docs-semantic.test.tsx`, docs compile mapping/tests.

Finding and references:

- `README.md:60-71,277-295` and website docs at `253-271` return rejecting mutation/`Promise.all` promises from event handlers without catching them. React does not consume ordinary event-handler rejections; rendering hook error state does not handle the promise.
- `test/access-router-react.docs-semantic.test.tsx:46-59,87-126` executes handwritten duplicates, not mapped snippets. Compile checks at `test/access-router-react.docs.compile.test.ts:198-225` enforce correspondence but cannot detect a semantically wrong example updated alongside its fixture.
- Residual ARR-H09: semantic acceptance was partially implemented, not wholly absent. `src/create-model-hook.ts:895-903` also retains a misleading ServiceError-wrapper comment although key errors throw plain Error with cause.

Requirements:

1. Explicitly handle rejected mutation promises in the quickstart and concurrent event handlers while preserving visible hook error UI and documented programmatic rejection behavior.
2. Execute the actual mapped fixture/extracted example with injected operations instead of a manually duplicated algorithm. Preserve verbatim snippet checks.
3. Reconcile all earlier contract edits and the stale key-error comment. Do not introduce unnecessary helpers throughout the runtime to accommodate docs tests.

Acceptance criteria:

- Running the actual quickstart/concurrent example with failed mutations produces expected error handling and no unhandled rejection.
- Updating both snippet and fixture to await-before-abort makes the semantic test fail; swapping/returning the wrong concurrent result also fails.
- README/website inventory, strict compile fixtures, and runtime examples agree after preceding changes.

Verification: shared docs checks, packed consumer check, and package check.

Completion evidence:

- Changed files: `packages/access-router-react/README.md` (quickstart click now `void mutate(...).catch(() => undefined)` with hook-error-state comment; concurrent `saveTwice` wraps `Promise.all` in try/catch returning `undefined` on failure and click is `void saveTwice().catch(() => undefined)`), `website/docs/packages/access-router-react.md` (same concurrent fix), `packages/access-router-react/test-docs-consumer/examples/quickstart.tsx` + `concurrent-mutations.tsx` (verbatim scaffold updates), `test-docs-consumer/snippets-mapping.md` (recomputed sha256 for README#3 `a4ce3315…`, README#14 + website#12 `a8262f1c…`), `packages/access-router-react/test/access-router-react.docs-semantic.test.tsx` (rewritten to load the actual mapped README blocks/fixtures with the compile gate's extraction rules and execute them with injected ops: cancellation block run via `new Function('query', …)` against a deferred mock; quickstart `onClick={…}` expression extracted by brace matching and invoked against live `useCreate().mutate` with a planned `ServiceError` rejection; concurrent `saveTwice` arrow extracted by brace matching and run against live `useUpdate().mutate` with just-in-time deferred plans, asserting positional `Promise.all` order via captured `console.log`, `secondResult.data` return contract, latest-wins hook state, and failure-path `undefined` return; `process.on('unhandledRejection')` tracking in every runtime test), `packages/access-router-react/src/create-model-hook.ts` (comment-only fix at the `useRead` key-error site: misleading "Wrap in a ServiceError" replaced with plain-`Error` + `cause` invariant; no runtime change).
- No runtime helpers added to `src/` for docs tests; all extraction/eval helpers are test-local. `fetch.ts`, `types.ts`, decl/packed-consumer fixtures from B01-B06 untouched. CHANGELOG.md NOT updated and `dist/` untouched per instructions.
- Sensitivity: cancellation executes the real README#13 statements, so an await-before-abort reorder leaves `controller.signal.aborted === false` while the transport is pending (or hangs the deferred runner) and fails; concurrent executes the real `saveTwice` source, so swapping the destructured positions logs `(B, A)` instead of `(A, B)` and returning the wrong entry returns A-data instead of B-data, both failing the positional assertions; dropping the `.catch`/try handling makes the quickstart handler return a rejecting thenable (`toBeUndefined` fails) and the concurrent failure path reject instead of resolving `undefined`, plus the `unhandledRejection` tracker and verbatim marker assertions fail.
- Commands/results (package dir `packages/access-router-react` unless noted): `pnpm exec vitest run --config vitest.runtime.config.ts test/access-router-react.docs-semantic.test.tsx` -> 5 passed; `pnpm exec vitest run --config vitest.config.ts test/access-router-react.docs.compile.test.ts` -> 2 passed; package-local `pnpm test:packed-consumer` -> 2 files / 6 tests passed; shared check from repo root `pnpm --filter @web-ts-toolkit/access-router-react test` (build + 4 typechecks + react19/react18 lanes + nonruntime) -> EXIT 0 (react18 lane: 20 files / 263 tests passed; nonruntime: 3 files / 18 tests passed; expected `RequestKeyError`/`cycle detected` console noise from throw-path tests).
- Remaining risks: none known; semantic test uses test-local `new Function` evaluation of doc text (lint-suppressed, typechecked) rather than importing fixture components, so future snippet refactors that rename `saveTwice`/`onClick` anchors will fail loudly at extraction instead of silently passing.

### Task ARR-B08: Establish Evidence For Runtime-Floor And Reproducible Consumer Lanes

Status: completed

Kind: investigation

Priority: P2, current compatibility evidence does not establish the advertised minimum Node runtime; no Node 20 runtime failure is confirmed.

Suggested agent: package compatibility and CI investigator

Dependencies: none

Primary ownership: read-only `package.json`, packed-consumer harness/tests, React lane setup, root runtime/CI configuration; append findings and bounded follow-up tasks here.

Finding and references:

- `package.json:50-55` advertises Node >=20. `test/access-router-react.packed-consumer.test.ts:83-84,181-198` asserts the metadata but executes ambient Node via the harness at `test/packed-consumer-harness.ts:187-195`. The harness copies the repository tool pin, currently Node 26.7.0 in `.tool-versions:1-3`.
- `test/packed-consumer-harness.ts:107-120,357-386` describes pinned versions but installs copied caret ranges without a frozen lock. React 18 setup at `test/react18-lane.ts:56-64` uses exact direct runtime versions but resolves transitive dependencies afresh.
- This is follow-up verification of ARR-H07/H08, not a reason to raise engines or a proven runtime defect. React 18 installed declaration coverage is already an acknowledged ARR-H11 residual.

Requirements:

1. Determine whether repository CI outside this package actually executes its packed CJS/ESM hooks under Node 20; cite the configuration or establish the gap. Separate build-tool runtime requirements from installed library runtime requirements.
2. If available, run an existing built-artifact smoke with an explicitly selected Node 20 executable and record its exact version. Otherwise record the prerequisite, not a guessed pass.
3. Recommend a reproducible supported-dependency lane versus a floating latest-compatible canary, including resolved-version evidence, lock ownership, and network/setup costs.
4. Produce a concrete implement/defer/no-action decision with scoped follow-up acceptance criteria. Do not alter engine policy, CI, or shared harness files as part of the investigation without an approved follow-up.

Acceptance criteria:

- The document states exactly which Node/React/runtime/type combinations have executed evidence and which remain inferred.
- A minimal floor-verification/reproducibility recommendation identifies owners, required tools, cost, and the maintainer decision needed; any proposed task has complete fields and no duplicate prior backlog item.

Verification: inspected CI/harness references and explicit runtime experiment output, or a precise unavailable-prerequisite record. Investigation can complete with an evidence-backed recommendation; a claimed runtime-floor pass requires execution.

Completion evidence:

- Scope: read-only. No engine/CI/harness/`dist/`/CHANGELOG edits. The only new file is the repo-external probe `/tmp/opencode/arr-b08-node20-hook-smoke.cjs` (not committed).
- Requirement 1 — CI gap established: the only below-pin runtime job is `access-router-minimum-node-smoke` (`.github/workflows/test.yml:65-85`). It overwrites `.tool-versions` with Node 22.20.0 (not 20) and runs the _server_ package smoke (`pnpm --filter @web-ts-toolkit/access-router exec vitest run ... --testNamePattern "supports minimum peers from release-artifact tarballs..."`, matching `packages/access-router/test/packed-consumer-compatibility.test.ts:831-841`, express 5.0.0 / mongoose 8.0.0). It never installs or executes `@web-ts-toolkit/access-router-react`. The main `unit-test` job (`test.yml:26-63`) runs `pnpm build` + `pnpm test` on the ambient asdf pin (Node 26.7.0 per `.tool-versions:1`), which is the only lane executing the react packed CJS/ESM hook smoke. Repo-wide grep over `.github` for `access-router-react|minimum-node|nodejs 20` returns only that server-package job. Conclusion: no CI executes react packed hooks under Node 20.
- Build-tool vs library runtime separation: root `package.json:26-28` (`engines: node >=20`) governs the repo toolchain (tsup 8.5.1, typescript ^6, vitest ^4, all run on ambient Node 26.7.0 in dev and CI); `packages/access-router-react/package.json:50-52` (`engines: node >=20`) advertises the installed-library floor. `tsup.config.ts:7` emits `target: es2022` (Node-20-compatible syntax on its face — inference, not execution evidence). No Node-20-incompatible API use is established, and none is claimed.
- Requirement 2 — Node 20 experiment with explicit binary `~/.asdf/installs/nodejs/20.10.0/bin/node` (`node --version` => `v20.10.0`; `asdf list nodejs` shows 20.10.0 installed locally, `asdf latest nodejs 20` => 20.20.2 not installed):
  - Existing built `dist/` (not rebuilt): CJS `require(dist/index.js)` and ESM `import(dist/index.mjs)` both expose exactly `RequestKeyError,createModelHooks,requestKeyFor`; `requestKeyFor` determinism, nested-object acceptance, and cycle→`RequestKeyError` verified on both entries under v20.10.0.
  - Minimal hook smoke (repo-external probe): CJS `dist` + workspace-installed React 19.2.8 + `@testing-library/react` + jsdom rendered a `useRead` success path that settled to `data.name === 'Milo'` with `error === null` => PASS under v20.10.0.
  - NOT executed under Node 20 (recorded prerequisites, not passes): packed-tarball install with isolated React 18/19 peer trees (`installPackedConsumer` at `test/packed-consumer-harness.ts:332-388`), ESM-entry hook render, React 18 lane (`test/run-react18-lane.ts` → `react18-lane.ts:137-151`), NodeNext/Bundler `tsc` consumers, and any `npm ci` transitive closure. Full-harness execution under Node 20 needs an asdf-resolvable Node 20 plus network registry access in a single lane.
- Executed-vs-inferred table:
  | Node / React / artifact / type combo | Evidence | Status |
  |---|---|---|
  | Node 26.7.0 (repo pin) + React 19 workspace + packed CJS/ESM hook smoke + NodeNext/Bundler `tsc` | Existing `access-router-react.packed-consumer.test.ts:181-226` via main CI `unit-test` job / local `pnpm test:packed-consumer` (ambient Node) | Executed (pre-existing suite) |
  | Node 26.7.0 + React 18.3.1 isolated lane (`react18-lane.ts:9-13` exact direct) + packed React 18 consumer | Existing `test:react18` lane + packed-consumer React 18 block | Executed (pre-existing suite) |
  | Node v20.10.0 + CJS `dist` + workspace React 19.2.8 hook render (success path) | This investigation's `/tmp` probe | Executed (limited scope, not the packed harness) |
  | Node v20.10.0 + ESM `dist` import + `requestKeyFor` serializer checks | This investigation (`node --input-type=module`) | Executed (import/serializer only, no hook render) |
  | Node 20 + packed-tarball install / isolated peers / ESM hooks / React 18 lane / type consumers | None | Gap — inferred only, must not be claimed as passing |
  | `es2022` tsup output running on Node 20 | Target inspection + serializer/hook probe above | Inferred, consistent so far |
- Requirement 3 — reproducibility recommendation (supported lane vs floating canary):
  - Floating points found: `installPackedConsumer` copies caret ranges from workspace manifests (`packed-consumer-harness.ts:110-120`: `reactVersion` etc. are `^`-ranges) and runs `pnpm install --no-frozen-lockfile` (`:386`) with no committed consumer lock — minors and transitives float per run and resolved versions are not recorded. The React 18 lane pins exact direct versions (`react18-lane.ts:9-13`) and `npm install --package-lock-only` + `npm ci` (`:56-65`), but the lock is generated in a throwaway temp dir, never committed — transitives float at install time and `validateReact18DepsRoot` (`:67-93`) checks only the three direct versions plus `scheduler` presence.
  - Recommended: a blocking supported-dependency lane (pinned React 18.3.1 + current React 19.x + recorded resolved tree, e.g. committed lane lockfile or `pnpm list --depth=0` / `npm ls` output saved as a CI artifact) plus a non-blocking floating canary (current `--no-frozen-lockfile` / fresh-transitive install) to catch ecosystem drift without gating releases.
  - Owners: package maintainer owns the lane lock/snapshot and bump cadence; CI/workflow owner owns the job edit. Tools: existing harnesses reused unchanged (`installPackedConsumer({ reactMajor: 18|19 })`, `runReact18Lane`), asdf Node 20.x in CI (any 20.x resolves via `setup-tools`; locally only 20.10.0 is installed). Cost: network installs are already required for these lanes (no new infra class); added CI minutes ≈ one job running the packed test (240 s timeout at `packed-consumer.test.ts:226`) × two React majors plus typechecks; maintenance = bump lane lock on peer-major changes.
  - Maintainer decision needed: (a) approve the Node-floor job scope (react package, Node 20.x, React 18 + 19 majors); (b) lockfile-vs-snapshot ownership and update cadence; (c) confirm `engines >=20` stays (this probe supports keeping it; there is no evidence to raise it and no full-harness Node 20 pass yet to strengthen it).
- Requirement 4 — decision: IMPLEMENT via a scoped follow-up (no engine/CI/harness change in this investigation). No duplicate backlog item exists (searched this document: the only Node-floor item is this investigation; ARR-H07/H08 are completed ambient-Node plans). Proposed follow-up:
  - Title: ARR-B10 — Gate the Node 20 floor and lock the supported-dependency lane (follow-up of ARR-B08). Status: pending. Kind: improvement. Priority: P2. Suggested agent: package compatibility and CI engineer. Dependencies: ARR-B08. Primary ownership: `packages/access-router-react/test/packed-consumer-harness.ts`, `test/react18-lane.ts`, `.github/workflows/test.yml` (or new lane job), and the new lane lock/snapshot file.
  - Requirements: (1) add a CI job running the existing packed-consumer CJS/ESM hook smoke + NodeNext/Bundler `tsc` consumers for React 18 and 19 under Node 20.x (reuse `installPackedConsumer`, no harness redesign); (2) commit lane lockfile or record resolved versions per run and assert the three direct React-lane versions; (3) keep the floating install as a non-blocking canary.
  - Acceptance criteria: Node 20 job green with logged `node --version` + resolved React versions; lock/snapshot owner and bump cadence documented; `engines >=20` either corroborated or revised with evidence. Verification: CI job output + lock diff; any remaining gap stays `blocked` with prerequisite/owner, never a claimed pass.

### Task ARR-B09: Independently Verify Integrated Contracts

Status: completed

Kind: improvement

Priority: P1, prevent another aggregate green suite from masking incomplete boundary fixes.

Suggested agent: independent reviewer who did not implement ARR-B01 through ARR-B07

Dependencies: ARR-B01, ARR-B02, ARR-B03, ARR-B04, ARR-B05, ARR-B06, ARR-B07, ARR-B08

Primary ownership: review-only package surface and this task document; coordinate fixes with original owners.

Finding and references: the prior ARR-H11 completion record and this review show that happy-path/individual-feature coverage can miss interactions. References are each task's cited paths and `docs/tasks/20260821-131823-access-router-react-health-follow-up.md:715-737`.

Requirements:

1. Verify each criterion against regressions, public declarations, installed examples, and recorded experiments rather than task prose alone.
2. Cross-check disable versus imperative requests, observer-triggered retries/unmount/reset, sort normalization versus accessor rejection, and caching versus depth limits.
3. Inspect packed exports/types and release notes; require explicit treatment of any declaration tightening or lifecycle contract change.
4. Run shared final checks serially. Record unrelated failures without modifying other sessions' work. Review ARR-B08 follow-ups and require an explicit approved disposition for any remaining release gate.

Acceptance criteria:

- Every implementation task has failing-before/passing-after evidence where practical and passing required checks; unresolved P1 defects keep integration blocked.
- Both React runtime lanes and packed CJS/ESM plus NodeNext/Bundler consumers pass; security claims remain limited to demonstrated boundaries.
- Final root lint/build/test and diff checks pass, or integration remains blocked with exact prerequisite/failure evidence.
- Deferred recommendations include maintainer-approved rationale and residual risk; no task is marked complete merely because code or this plan exists.

Verification: shared final integration commands, artifact inspection, criterion-by-criterion independent review.

Completion evidence:

- Reviewer scope: read-only review of package surface + this document, plus minimal reviewer fixes listed below. No broad refactors. No other task section touched. CHANGELOG.md NOT updated per coordinator constraint (verified: `git diff` shows no CHANGELOG change); declaration tightening / lifecycle contract changes are documented instead in source JSDoc (`src/types.ts:46,84,129` ARR-B03 note; `src/fetch.ts` accessor/proxy/depth JSDoc), `README.md` (disable/invalidation at 233-235,254,261; mutation rejection handling at 67-68,268,299; serializer boundaries at 309,322,329), `website/docs/packages/access-router-react.md` (same mutation + boundary reconciliation), and consumer fixtures. `dist/` never hand-edited (rebuilt only via package build script; `git status` shows no tracked `dist/` modification).
- Per-task independent verification (package dir `packages/access-router-react` unless noted):
  - ARR-B01: new `test/arr-b01-disable-invalidate.test.tsx` (11 tests) passes; assertions directly check `signal.aborted === true`, flag convergence, and stale-settlement suppression for query/refetch/disable/ID-removal/context-change paths across read/list/count/distinct. Cross-ran with `cancellation.test.tsx` + `query-reset.test.tsx` + `query-signal-composition.test.tsx` (all green). Before/after counts per B01 record (11 failed before on `signal.aborted`, 11 pass after) accepted from recorded evidence; passing-after re-executed by reviewer.
  - ARR-B02: new `test/arr-b02-sort-precedence.test.tsx` (9 tests) passes; `requestKeyFor` still order-insensitive (existing `dependency-policy.test.tsx:137-139` green) while `sortKeyFor` differs on reversal; `useRead` advanced-sort reorder covered. Verified `sortKeyFor` is NOT in `src/index.ts` and NOT in `dist/index.d.ts`/`dist/index.d.mts` (encapsulation holds). Contract documented in `src/fetch.ts:451-459` JSDoc + `create-model-hook.ts:919-921,981-987` comments. Observation (non-blocking): README/website state sort forwarding but carry no explicit "compound field order participates in request identity" sentence; no contradiction exists, B07 reconciliation stands, behavior is regression-pinned.
  - ARR-B03: `tsc --noEmit` passes for `tsconfig.typecheck.json`, `tsconfig.test-typecheck.json`, `test-decl-consumer/tsconfig-nodenext.json`, `test-decl-consumer/tsconfig-bundler.json`; `test-decl-consumer/decl-consumer.strict.test.ts` (45 `@ts-expect-error`) + `test-packed-consumer/consumer/consumer-types.ts` (31) pass against rebuilt declarations; both `dist/index.d.ts` and `dist/index.d.mts` contain `IsAbsentProjection` + distributive aliases (verified by grep). Packed consumer suite passes (installed CJS/ESM + NodeNext/Bundler consumers).
  - ARR-B04: new `test/arr-b04-reentrant-observers.test.tsx` (8 tests) passes; cross-ran with `callback-observers.test.tsx` + `previous-data.test.tsx` (21 tests green combined). Retry-snapshot, first-settlement capture, post-reset capture, and sync-unmount skip paths asserted.
  - ARR-B05: new `test/arr-b05-accessor-free.test.tsx` (12 tests) passes with `delete arr[1]` true-hole construction (reviewer edit, semantics preserved); getter-spy-zero assertions for own/inherited array accessors, Date overrides, config/signal exclusion. Security claim stays bounded: proxy-trap boundary documented in `src/fetch.ts` JSDoc, no remote-exploit claim made.
  - ARR-B06: new `test/arr-b06-depth-early-reject.test.ts` (9 tests) passes; shared-vs-copied over-depth consistency, pre-encoding/pre-sort rejection, determinism controls all green. Benchmark + residual limits recorded in B06 evidence; no absolute CPU/memory bound claimed. Numeric budgets unchanged.
  - ARR-B07: `test/access-router-react.docs-semantic.test.tsx` (5 tests: real README blocks executed via mapped extraction, unhandled-rejection tracking) + `test/access-router-react.docs.compile.test.ts` (2 tests) pass; `test-docs-consumer` fixtures/mapping agree with README/website (verbatim marker assertions green); misleading key-error comment fixed (comment-only, no runtime change).
  - ARR-B08: read-only investigation accepted as recorded. No CI job executes react packed hooks under Node 20 (gap established, not claimed away); limited Node v20.10.0 CJS/ESM serializer + hook-render probe recorded as limited scope. Follow-up ARR-B10 (P2, pending, owned scoped task for Node-20 lane + lock/snapshot) is the disposition: no engine/CI/harness change made here. Maintainer decision still needed on (a) Node-20 job scope, (b) lockfile-vs-snapshot ownership/cadence, (c) keeping `engines >=20`. This is a P2 follow-up, not a release gate: no unresolved P1 is hidden behind it.
- Cross-interaction checks (reviewer-executed): combined runtime run of `arr-b01 + arr-b02 + arr-b04 + arr-b05 + arr-b06 + docs-semantic` -> 6 files / 54 passed; lifecycle interaction run (`cancellation + query-reset + callback-observers + previous-data + dependency-policy + query-signal-composition` + all ARR regression files) -> 11 files / 134 passed. Disable-vs-imperative, observer-retry/unmount/reset, sort-vs-accessor (`sortKeyFor` cross-path test inside B05 file green), and cache-vs-depth (B06 visitation-order tests green) show no interference.
- Artifact inspection: packed `dist/index.js` (CJS) and `dist/index.mjs` (ESM) both expose exactly `RequestKeyError,createModelHooks,requestKeyFor`; `dist/index.d.ts` + `dist/index.d.mts` agree (B03 tightening present in both branches).
- Reviewer minimal fixes (test-only, behavior-identical, coordinated via this record; original owners: B01/B04/B05/B07 implementers): root `pnpm lint` initially failed with 13 errors, all inside new ARR test files — 8x `no-explicit-any` in `arr-b01-disable-invalidate.test.tsx` (fixed via `MethodResult`/`FilterQuery`/`ListArgs` overloads + `as unknown as` assertions + `{data: unknown}` narrowing), 3x `no-sparse-arrays` in `arr-b05-accessor-free.test.tsx` (literal holes replaced with `delete arr[1]` true holes), 1x `no-useless-assignment` each in `arr-b04-reentrant-observers.test.tsx` (declaration merged into `const` at use site) and `docs-semantic.test.tsx` (`let i: number` + removed unused `no-implied-eval` disable). After fixes: affected runtime suites 4 files / 36 passed; `tsconfig.test-typecheck.json` clean; package-file eslint clean.
- Shared final checks (serial, from repo root): `pnpm lint` -> EXIT 0 (only 3 pre-existing warnings in unrelated `access-router-client` bnd12 benchmark file — separate session's work, untouched, recorded here not reverted); `pnpm build` -> EXIT 0; `pnpm test` -> EXIT 0 (includes package check react19 20 files/263 tests, react18 20 files/263 tests, nonruntime 3 files/18 tests); `git diff --check` -> EXIT 0. Package check `pnpm --filter @web-ts-toolkit/access-router-react test` -> EXIT 0 (both React lanes + packed CJS/ESM + NodeNext/Bundler).
- Remaining risks: none known for B01-B07 integration. Residual: (1) B02 README one-sentence observation above (non-blocking); (2) ARR-B10 pending maintainer decision (P2, tracked in ARR-B08 evidence with owner/cost/acceptance); (3) unrelated baseline warnings in `access-router-client` benchmark file belong to another session.

## Deferred Scope And Decisions

- No maintainer decision blocks starting ARR-B01 through ARR-B07. Preserve the shipped reset, single-create, numeric-key-budget, and observer-exception contracts unless a demonstrated conflict requires a short decision before implementation.
- ARR-B08 investigates runtime-floor evidence and reproducibility policy. Installing new tooling or changing release/runtime policy is not implicitly authorized by the review plan.
- React 18 installed-consumer type coverage and broader-than-normalized success response types were already acknowledged by ARR-H11. They remain non-blocking follow-ups, not newly confirmed defects here.
- Misleading declaration-consumer path aliases currently fall back to working package resolution; remove or clarify them only when touching those fixtures in ARR-B03, not as a claim that all current typechecks are bypassed.
- Shared caches, retries, optimistic updates, bulk creation, and new public cancellation APIs are deferred without concrete consumer requirements. They increase lifecycle/API scope and are not prerequisites for these fixes.

## Definition Of Done

- All nine tasks have verified outcomes or explicit approved deferrals; no unresolved P1 defect is hidden behind a completed integration task.
- Correctness regressions cover alternate entry paths and interacting features, not just aggregate test counts.
- Public types, docs, examples, and shipped artifacts agree; internals remain encapsulated and changes use the smallest shared enforcement points.
- Serializer performance claims have measurements and honest residual bounds. No unproven security or runtime compatibility claim is presented as established fact.
- Completion evidence lists exact files, commands, results, and follow-up ownership, allowing execution without this conversation.
