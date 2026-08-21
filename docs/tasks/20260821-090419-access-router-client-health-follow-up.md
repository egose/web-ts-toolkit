# Access Router Client Architectural Health Follow-Up

Created: 2026-08-21 09:04:19 local time

Package: `packages/access-router-client`

Related completed tasks:

- `docs/tasks/20260806-144945-access-router-client-review-remediation.md`
- `docs/tasks/20260809-000824-access-router-client-post-review-remediation.md`

## Objective

Close current security, correctness, protocol-alignment, type-safety, encapsulation, package-metadata, and runtime-verification gaps in `@web-ts-toolkit/access-router-client` while preserving the contracts already established by the two completed remediation plans. This file is a standalone execution plan for sub-agents; agents must verify current behavior rather than relying on the historical completion notes.

## Scope And Working Rules

- Preserve unrelated worktree changes. Never reset, revert, or rewrite files owned by another session.
- Add a regression that fails against the current implementation before fixing each confirmed behavioral defect.
- Keep `access-router-client` wire behavior aligned with the sibling schemas and root protocol in `packages/access-router/src/validation/model-router.ts`, `packages/access-router/src/validation/data-router.ts`, and `packages/access-router/src/validation/root-router.ts`.
- Prefer one enforcement point: credential classification and cache lifecycle in the cache interceptor, persistence identity in model-result finalization, request-config admissibility at group preflight, and default normalization in service construction.
- Do not place raw cookies, authorization values, partition tokens, or other credentials into cache keys, errors, snapshots, logs, or tests.
- Treat changes to cache policy, mutation input types, model field access, lazy-request extension points, runtime support, and exported names as public contract changes. Update source JSDoc, generated declarations, README, `llms.txt`, website docs, compile fixtures, and release notes together.
- Do not edit `dist/` manually. Rebuild generated artifacts from source.
- Package tests rebuild shared workspace outputs. Run build/typecheck/test commands serially, never concurrently, to avoid shared `dist/` races.
- Set a task to `in_progress` before implementation. Mark it `completed` only after its required verification passes and completion evidence is appended.

## Non-Goals

- Do not redesign the sibling `access-router` protocol.
- Do not replace Axios, the root batching protocol, or the model wrapper wholesale.
- Do not add compatibility aliases for behavior that has not shipped or has no demonstrated external consumer.
- Do not expose cache or batching internals merely to make tests easier.
- Do not claim a browser-version guarantee from jsdom execution alone.
- Do not implement the model field-collision or overlapping-save design in ARC-H09 until the maintainer decision recorded there is made.

## Baseline Verification

Verified on 2026-08-21:

- Worktree was clean before review (`git status --short` produced no output).
- `pnpm --filter @web-ts-toolkit/access-router-client typecheck`: passed, including package build and strict NodeNext/Bundler declaration consumers.
- `pnpm --filter @web-ts-toolkit/access-router-client test`: passed with 310 Node tests and 10 jsdom/Vite smoke tests.
- `npm pack --dry-run --json` from `packages/access-router-client`: passed and listed 7 files (`package.json`, README, `llms.txt`, and four `dist` outputs).
- `pnpm exec browserslist "supports es2022-module"`: failed with `Unknown feature name 'es2022-module'`.
- `pnpm exec tsc --noEmit -p tsconfig.strict.json`: failed. The config resolves workspace `utils` source outside the package `rootDir` and also exposes many strict client diagnostics. The passing `typecheck:source` uses `tsconfig.typecheck.json`, which does not enable `strict`.
- The passing suite does not cover the confirmed auth-header cache collision, cache-bypass invalidation, grouped-read invalidation, or update-result persistence-identity scenarios below.

## Priority Definitions

- P0: possible cross-identity response exposure or credential-boundary failure.
- P1: stale/incorrect behavior, persistence failure, sibling-protocol mismatch, false release/runtime claim, or ineffective verification gate.
- P2: architectural hardening, public API precision, performance, readability, or testability improvement without a currently demonstrated data-exposure path.

## Wave 1: Cache Security And Correctness

### Task ARC-H01: Classify Header-Authenticated Requests As Credentialed

Status: completed

Priority: P0

Suggested agent: cache security specialist

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- `packages/access-router-client/test/access-router-client.cache.unit.test.ts`
- cache policy documentation

Finding:

Cache credential classification currently depends only on `withCredentials`. When `withCredentials` is false, a request carrying `Authorization`, `Cookie`, or another authentication-bearing header is treated as anonymous and can cache without a partition. The same sensitive headers are intentionally excluded from the cache key. Two bearer tokens or manually supplied cookies can therefore collide on one cache entry and one in-flight slot.

The existing sensitive-header test uses `withCredentialsDefault: true` and a shared explicit partition, so it verifies secret exclusion but not safe handling when authentication headers are present with `withCredentials: false`.

References:

- `packages/access-router-client/src/services/interceptors.ts:10-16`
- `packages/access-router-client/src/services/interceptors.ts:255-273`
- `packages/access-router-client/src/services/interceptors.ts:358-363`
- `packages/access-router-client/src/services/interceptors.ts:407-418`
- `packages/access-router-client/test/access-router-client.cache.unit.test.ts:151-197`
- `packages/access-router-client/README.md:99-106`

Implementation requirements:

1. Classify a request as credentialed when `withCredentials` resolves true or when an authentication-bearing request header is present.
2. Require a non-empty partition token for every credentialed cache lookup, in-flight join, and store operation; otherwise bypass caching and deduplication.
3. Keep sensitive header values out of cache keys and diagnostics. Do not hash raw credentials as a substitute for a caller-controlled identity partition.
4. Normalize header names case-insensitively and support AxiosHeaders plus plain header objects.
5. Document browser cookie credentials, explicitly configured authorization headers, and Node manually supplied headers separately.

Acceptance criteria:

- Two otherwise identical requests with `withCredentials: false`, distinct `Authorization` values, and no partition each reach the network and never share cached or in-flight results.
- The same negative test passes for manually supplied `Cookie` headers in Node.
- Header-authenticated requests cache only when an explicit partition is returned; distinct partitions cannot collide.
- Cache-key probes prove no raw credential appears in a key or error.
- Focused cache tests and `pnpm --filter @web-ts-toolkit/access-router-client test` pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts`, `packages/access-router-client/test/access-router-client.cache.unit.test.ts`, `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/README.md`, `packages/access-router-client/llms.txt`, `website/docs/packages/access-router-client/adapter.mdx`, `website/docs/packages/access-router-client/index.md`.
- Regression coverage: added header-authenticated cache tests for distinct `Authorization` values with `withCredentials: false` and no partition, manually supplied mixed-case `Cookie` headers via `AxiosHeaders`, and explicit partition isolation for header-authenticated requests. The `Authorization` test covers both cache storage reuse and in-flight deduplication; the old implementation would have treated those requests as anonymous because only `withCredentials` was considered credentialed.
- Security evidence: credential detection now normalizes plain object and `AxiosHeaders` names case-insensitively, requires a non-empty partition for browser-cookie/`withCredentials` or authentication-header requests, and continues excluding raw credential header values from serialized cache keys.
- Documentation evidence: installed README/`llms.txt`, source JSDoc, and website docs now separate browser cookie credentials, explicitly configured authorization/API-key headers, and Node manually supplied `Cookie` headers. `CHANGELOG.md` was not updated.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts`.
- Result: focused cache suite passed, 1 test file and 33 tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test`.
- Result: package typecheck/build passed; 19 Node test files and 313 tests passed; 1 browser-smoke file and 10 tests passed.
- Verified: `git diff --check`.
- Result: passed.

### Task ARC-H02: Separate Cache Bypass From Mutation Invalidation

Status: completed

Priority: P1

Suggested agent: cache lifecycle specialist

Dependencies: ARC-H01

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- `packages/access-router-client/src/adapter.ts`
- cache and grouped parity tests

Finding:

The response interceptor invalidates the entire cache when either the request has `x-axios-cache: false` or its HTTP method is POST/PUT/PATCH/DELETE. This conflates "do not cache this request" with "this request successfully mutated state." A cache-bypassed GET clears unrelated entries. Every root batch is transported as POST, so an all-read group clears the cache, and a root response with outer HTTP 2xx can clear the cache even when all mutating entries failed inside the response body.

The grouped-failure test checks only the returned value, not network invocation count, so a fresh request is indistinguishable from a retained cache hit.

The same cache module also accepts a configurable clone strategy for cache hits, but initial snapshots and in-flight tails call `defaultClone` directly, making clone behavior path-dependent.

References:

- `packages/access-router-client/src/services/interceptors.ts:42-60`
- `packages/access-router-client/src/services/interceptors.ts:244-252`
- `packages/access-router-client/src/services/interceptors.ts:446-455`
- `packages/access-router-client/src/services/interceptors.ts:535-547`
- `packages/access-router-client/src/adapter.ts:334-361`
- `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts:200-250`

Implementation requirements:

1. Represent cache eligibility/bypass separately from post-success invalidation intent. The package cache header must not serve as both signals.
2. Invalidate after a successful direct mutation, not after a cache-bypassed read.
3. For root batches, invalidate only when at least one mutating entry succeeded according to the root response, not merely because the transport method is POST or outer status is 2xx.
4. Preserve the generation boundary that prevents pre-mutation in-flight reads from repopulating stale state.
5. Resolve one clone function from policy and use it consistently for storage snapshots, cache hits, and in-flight tails, or remove the unused customization if it is intentionally internal and unsupported.
6. Use network invocation counts and overlapping-request tests rather than value-only assertions.

Acceptance criteria:

- Cached GET, then grouped read, then identical GET makes no extra network GET after the group.
- Cache-bypassed GET does not evict an unrelated cached GET.
- A group whose mutating entries all fail does not evict a cached GET.
- A group with at least one successful mutation advances the cache generation and the next related read reaches the network.
- A read started before a successful grouped mutation cannot repopulate or join the post-mutation generation.
- Custom clone behavior, if retained, is identical for source, hit, and deduplicated-tail callers.
- Focused cache/group tests and the package suite pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts`, `packages/access-router-client/src/services/wrap.ts`, `packages/access-router-client/src/services/model-service.ts`, `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/test/access-router-client.cache.unit.test.ts`, `packages/access-router-client/test/access-router-client.arc22-adversarial.unit.test.ts`, `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts`.
- Regression coverage: added cache-bypassed GET retention coverage, grouped all-read retention coverage with network request counts, failed grouped mutation retention count assertions, successful grouped mutation invalidation count assertions, deterministic pre-mutation in-flight read generation coverage, and custom clone policy coverage across source, in-flight tail, and cache hit paths.
- Implementation evidence: cache bypass and successful-mutation invalidation are now represented separately; package service/wrap mutations carry an internal invalidation signal that is consumed before network dispatch; root batches strip direct-mutation invalidation metadata and invalidate only when a mutating root entry succeeds; cache snapshots and tails use the configured clone policy consistently.
- Documentation evidence: `CHANGELOG.md` was not updated.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts test/access-router-client.arc22-parity.integration.test.ts`.
- Result: focused cache/group suites passed, 2 test files and 48 tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.arc22-adversarial.unit.test.ts test/access-router-client.adapter.integration.test.ts`.
- Result: focused adversarial/adapter suites passed, 2 test files and 42 tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test`.
- Result: package build/typecheck passed; 19 Node test files and 317 tests passed; 1 browser-smoke file and 10 tests passed.
- Verified: `git diff --check`.
- Result: passed.

## Wave 2: Model And Protocol Correctness

### Task ARC-H03: Preserve Known Identity On Update Results

Status: completed

Priority: P1

Suggested agent: model persistence specialist

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/services/model-service.ts`
- `packages/access-router-client/src/services/shared.ts`
- model persistence and direct/grouped parity tests

Finding:

`read` and `readAdvanced` pass their known identifier into `Model.create`, allowing projected models without `_id` to save safely. `update` and `updateAdvanced` know the same target identifier but discard it when wrapping the returned model. Grouped finalization captures `query.id` only for `op === 'read'`, not `op === 'update'`. An update response that omits `_id` therefore returns a wrapper whose next `save()` throws `MissingPersistenceIdentityError`, although the client already knows the persistence target.

References:

- `packages/access-router-client/src/services/model-service.ts:713-815`
- `packages/access-router-client/src/services/model-service.ts:923-1015`
- `packages/access-router-client/src/services/shared.ts:128-144`
- `packages/access-router-client/src/model.ts:135-174`
- sibling root update schema: `packages/access-router/src/validation/root-router.ts:208-218`

Implementation requirements:

1. Pass the request identifier to wrappers produced by direct `update` and `updateAdvanced`.
2. Preserve `query.id` for grouped update results through the same finalization rule used by grouped reads.
3. Preserve the existing projected-read safety rule: existing wrappers with no resolvable identity must still refuse silent create.
4. Investigate upsert separately: preserve input `_id` only when the sibling contract makes it an unambiguous persistence identity; do not guess identity from an arbitrary filter or response field.
5. Keep direct and grouped wrappers behaviorally equivalent.

Acceptance criteria:

- Direct and grouped update results whose response projection excludes `_id` can be modified and saved back to the original identifier.
- The second save uses PATCH for the original encoded route and never POSTs a duplicate.
- Filter reads without a known identifier still throw `MissingPersistenceIdentityError` when `_id` is absent.
- Tests cover `returningAll: false`, `_id`-excluding advanced projection, and direct/grouped paths.
- Package tests and strict packed declaration consumers pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/model-service.ts`, `packages/access-router-client/src/services/shared.ts`, `packages/access-router-client/test/access-router-client.arc21-projection-identity.integration.test.ts`.
- Regression coverage: added update-result persistence identity tests for direct `update(id, ..., { returningAll: false })`, direct `updateAdvanced(id, ...)` with an `_id`-excluding projection, and grouped `updateAdvanced(id, ...)` with an `_id`-excluding projection. Each test strips `_id` from the returned wrapper state before the follow-up `save()` and asserts the save uses `PATCH /api/users/<originalId>` with `returning_all=false`, not `POST`.
- Implementation evidence: direct `update` and `updateAdvanced` now pass the request identifier into `Model.create`; grouped root finalization now preserves `query.id` for `op === 'update'` through the same captured-persistence-identity path used by grouped reads. Filter reads without a known identifier are unchanged and remain covered by the existing `MissingPersistenceIdentityError` regression.
- Documentation evidence: `CHANGELOG.md` was not updated.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.arc21-projection-identity.integration.test.ts`.
- Result: focused projection-identity suite passed, 1 test file and 7 tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client typecheck`.
- Result: package build/typecheck passed, including strict NodeNext and Bundler declaration consumers.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test`.
- Result: package build/typecheck passed; 19 Node test files and 320 tests passed; 1 browser-smoke file and 10 tests passed.
- Verified: `git diff --check`.
- Result: passed.

### Task ARC-H04: Validate Group Configs And Root Response Shape

Status: pending

Priority: P1

Suggested agent: batching boundary specialist

Dependencies: ARC-H02, ARC-H03

Primary ownership:

- `packages/access-router-client/src/adapter.ts`
- `packages/access-router-client/src/services/cache-utils.ts`
- grouping and malformed-protocol tests

Finding:

Group request configs are compared by JSON-stringifying normalized objects. JSON serialization silently omits function-valued object properties and changes unsupported values, so different `validateStatus`, transform, serializer, or adapter functions can compare equal. The loop then overwrites `sharedConfig`, causing the final group to use the last member's config. Circular objects throw an unclassified serialization error.

After dispatch, `group()` assumes `res.data` is an array with exactly one valid entry per request and directly indexes `proms[index]`. A malformed, short, long, or non-array sibling response can throw an incidental TypeError or skip callbacks rather than producing a controlled protocol failure.

References:

- `packages/access-router-client/src/adapter.ts:28`
- `packages/access-router-client/src/adapter.ts:274-345`
- `packages/access-router-client/src/services/cache-utils.ts:4-24`
- sibling root request schema: `packages/access-router/src/validation/root-router.ts:158-347`

Implementation requirements:

1. Define the Axios config subset supported by `group()` and reject unsupported function, symbol, circular, adapter, transform, serializer, and cancellation values before claiming any lazy request.
2. Compare supported configs deterministically without silently dropping values. Preserve the first validated shared config instead of replacing it on every iteration.
3. Validate that a fulfilled root response is an array of exactly the input cardinality and that each entry has the minimum result/status shape needed by finalization.
4. Convert malformed root responses into one documented controlled protocol/transport failure policy and run each input's failure callback exactly once.
5. Keep all preflight validation before request claims and network dispatch.

Acceptance criteria:

- Two requests with distinct function-valued configs reject before dispatch rather than sharing the last config.
- Circular or unsupported config values produce a package-specific controlled error before claims/network activity.
- Empty, non-array, short, extra, and malformed root response fixtures settle every grouped request according to the documented policy without incidental TypeErrors.
- Callback and `throwOnError` behavior remains deterministic for malformed responses.
- Existing 33-operation protocol parity coverage remains green.

## Wave 3: Type Safety And Testability

### Task ARC-H05: Make Strict Source And Type-Test Gates Real

Status: pending

Priority: P1

Suggested agent: TypeScript verification specialist

Dependencies: ARC-H03, ARC-H04

Primary ownership:

- `packages/access-router-client/package.json`
- `packages/access-router-client/tsconfig.typecheck.json`
- `packages/access-router-client/tsconfig.strict.json`
- a focused test-typecheck config or declaration fixtures
- typing fixes exposed by the corrected gate

Finding:

The default source typecheck passes with the repository's non-strict base settings. The separate strict config is not called by a package script and currently resolves workspace source outside the package `rootDir`. Runtime Vitest files are transpiled rather than fully typechecked, so invalid extra-argument calls and negative type assertions can pass unnoticed. Current examples include `count(undefined, headers)` despite `count` accepting one argument and `Model.save(undefined, headers)` despite `save` accepting one argument; JavaScript discards the intended config argument.

References:

- `packages/access-router-client/package.json:31-38`
- `packages/access-router-client/tsconfig.typecheck.json:1-10`
- `packages/access-router-client/tsconfig.strict.json:1-8`
- `packages/access-router-client/src/services/model-service.ts:648-675`
- `packages/access-router-client/src/model.ts:135`
- `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts:86-90`
- `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts:166-196`

Implementation requirements:

1. Make the source gate strict while continuing to consume built workspace declarations rather than sibling source outside `rootDir`.
2. Add a no-emit type-test gate for files containing compile-time assertions, or move those assertions into dedicated strict NodeNext/Bundler fixtures.
3. Fix invalid extra-argument tests and assert the intended request headers/config actually reach the server.
4. Resolve real strict diagnostics at their shared type boundaries; do not use broad `any`, `skipLibCheck`, blanket exclusions, or unchecked casts to silence the gate.
5. Keep strict source, strict declaration consumers, and type tests in the default package `typecheck`/`test` flow.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/access-router-client typecheck` runs strict source and relevant type-test checks and exits 0.
- Removing a required `@ts-expect-error` or allowing a known-invalid call makes the gate fail.
- Runtime tests no longer pass ignored extra arguments to `count` or `save`; server-side probes confirm the intended config is transmitted.
- `skipLibCheck` remains false for strict consumer checks.
- Package tests pass after the gate changes.

### Task ARC-H06: Type Mutation Payloads Against Consumer Models

Status: pending

Priority: P2

Suggested agent: public TypeScript API specialist

Dependencies: ARC-H05

Primary ownership:

- `packages/access-router-client/src/services/model-service.ts`
- `packages/access-router-client/src/services/sub-ops.ts`
- service factory/public generic types
- strict declaration consumers and docs

Finding:

Model create, update, upsert, and subdocument mutation methods accept `object`/`object[]`. Misspelled fields and wrong scalar values therefore compile despite the package being a typed client. The sibling server intentionally accepts generic records at runtime, so the client needs consumer-configurable input types rather than pretending the server can infer required fields.

The filter type has a related precision issue: `QuerySelector` receives `ApplyBasicQueryCasting<T>`, which includes arrays. Scalar comparison operators such as `$gt` can consequently accept array operands that should be reserved for direct conditions or `$in`/`$nin`.

References:

- `packages/access-router-client/src/services/model-service.ts:270-284`
- `packages/access-router-client/src/services/model-service.ts:331-350`
- `packages/access-router-client/src/services/model-service.ts:411-461`
- `packages/access-router-client/src/services/model-service.ts:923-980`
- `packages/access-router-client/src/services/sub-ops.ts:215-315`
- `packages/access-router-client/src/mongoose/types.ts:50-107`
- sibling model schemas: `packages/access-router/src/validation/model-router.ts:130-186`
- sibling root schemas: `packages/access-router/src/validation/root-router.ts:198-227`

Implementation requirements:

1. Introduce explicit create/update/upsert input generics with useful defaults derived from `T`, while allowing consumers whose request schema differs from the response model to supply custom input types.
2. Infer subdocument mutation payloads from `S` and preserve scalar/array cardinality where the sibling schema supports both.
3. Do not claim compile-time requiredness the sibling runtime schema cannot establish. Document the default and the custom-schema escape hatch.
4. Separate direct-condition casting from operator operand types so scalar comparison operators do not accept accidental arrays; keep `$in`/`$nin` array support and documented server-side cast escape hatches.
5. Treat generic-order changes as a public API change and include migration guidance if inference at existing call sites changes.

Acceptance criteria:

- Strict consumers reject misspelled known fields and wrong scalar values in model and subdocument mutation object literals.
- Consumers can explicitly provide distinct create/update/upsert input schemas without casts.
- Scalar `$gt`/`$lte` with an array operand fails; direct array conditions and `$in`/`$nin` continue to compile as documented.
- Runtime wire bodies remain accepted by the sibling model/root schemas and cardinality tests stay green.
- Generated `.d.ts` files expose understandable input generic names and useful editor hover documentation.

## Wave 4: Encapsulation And Model Architecture

### Task ARC-H07: Snapshot Service Defaults At Construction

Status: pending

Priority: P2

Suggested agent: encapsulation specialist

Dependencies: ARC-H05

Primary ownership:

- `packages/access-router-client/src/services/model-service.ts`
- `packages/access-router-client/src/services/data-service.ts`
- shared default normalization helper and focused tests

Finding:

Exported service constructors retain the caller's defaults object and call `setDefaultObjectProp` to add missing nested objects. Direct construction therefore mutates caller-owned input. Nested arrays/objects also remain shared, so later caller mutation can silently alter service behavior. Adapter-created services avoid some top-level mutation through `mergeServiceDefaults`, but encapsulation should hold at each exported class boundary.

References:

- `packages/access-router-client/src/services/model-service.ts:72-102`
- `packages/access-router-client/src/services/data-service.ts:54-74`
- `packages/access-router-client/src/services/shared.ts:242-246`
- `packages/access-router-client/src/adapter.ts:33-60`

Implementation requirements:

1. Clone and normalize defaults inside each service constructor regardless of caller.
2. Ensure nested projections, populate arrays, tasks, option objects, and other supported default values are detached from caller-owned data.
3. Freeze the internal normalized snapshot if service defaults are intended to be immutable, or expose an explicit update API if mutation is supported; do not permit accidental mutation by retained reference.
4. Consolidate model/data default normalization without introducing a broad framework.

Acceptance criteria:

- Constructing a service does not modify the supplied defaults object.
- Mutating caller defaults after construction does not alter subsequent request metadata or wire payloads.
- ModelService and DataService direct-construction tests cover nested arrays and objects.
- Adapter-level plus per-service default precedence remains unchanged.
- Package tests and strict typecheck pass.

### Task ARC-H08: Make Installed Runtime And API Claims Truthful

Status: pending

Priority: P1

Suggested agent: package and runtime compatibility specialist

Dependencies: ARC-H01, ARC-H02, ARC-H05, ARC-H06

Primary ownership:

- `packages/access-router-client/package.json`
- `packages/access-router-client/tsup.config.ts`
- `packages/access-router-client/README.md`
- `packages/access-router-client/llms.txt`
- source JSDoc and documentation compile fixtures
- browser/packed-consumer verification

Finding:

Several installed-consumer claims disagree with implementation or verification:

- `browserslist: ["supports es2022-module"]` is invalid and causes Browserslist resolution to fail.
- `cacheTTL` JSDoc says seconds, but it is passed directly to `setTimeout` and tests/examples predominantly use millisecond values.
- Authentication docs say `withCredentials` transmits Authorization and controls manually supplied Node Cookie headers; Axios does not create Authorization headers from `withCredentials`.
- The jsdom/Vite smoke test is described as proving old browser-engine syntax compatibility, but jsdom runs on Node and Vite may transform/resolve the built module.
- The README says only its selected names are stable, while generated declarations and `llms.txt` expose/name additional public types.
- `wrapLazyPromise` is described as allowing consumer-built compatible custom batches, but `group()` requires a private adapter identity consumers cannot stamp.
- Model JSDoc links to nonexistent `ModelService.findOne`.

References:

- `packages/access-router-client/package.json:45-50`
- `packages/access-router-client/src/adapter.ts:70-78`
- `packages/access-router-client/src/services/interceptors.ts:117-128`
- `packages/access-router-client/README.md:99-106`
- `packages/access-router-client/README.md:154-180`
- `packages/access-router-client/README.md:268-304`
- `packages/access-router-client/llms.txt:54-57`
- `packages/access-router-client/src/model.ts:33-40`
- `packages/access-router-client/test/access-router-client.browser-smoke.ts:3-39`
- `packages/access-router-client/test/access-router-client.browser-smoke.ts:162-180`
- generated export list: `packages/access-router-client/dist/index.d.ts:967`

Implementation requirements:

1. Choose a valid Browserslist query that expresses the maintained browser floor and add a CI/package check that resolves the actual package config.
2. Define `cacheTTL` in milliseconds across JSDoc, README, `llms.txt`, website docs, and examples; use an internal `ttlMs` name and an adapter-level fake-timer regression. If maintainers instead choose public seconds, convert exactly once at the adapter boundary and update all tests.
3. Correct authentication wording: browser cookies depend on `withCredentials`, CORS, and cookie policy; Authorization is explicit; Node manually supplied headers are not created by `withCredentials`.
4. Either add real-browser execution against the built/packed ESM artifact for claimed browser engines or narrow the claim and describe the existing test accurately as jsdom/Vite smoke coverage.
5. Make one exhaustive public-export inventory authoritative for declaration/export tests, README, and `llms.txt`, or change README wording from exhaustive/stable to primary exports.
6. Decide whether custom batching is public. If supported, expose an adapter-owned safe request factory; otherwise remove the incompatible `wrapLazyPromise` custom-batch claim while documenting its actual low-level lazy semantics.
7. Replace stale links and ensure high-value JSDoc survives in emitted declarations.

Acceptance criteria:

- `pnpm exec browserslist` resolves the package's actual config without error and matches the documented floor.
- A cache TTL boundary test proves the documented unit (for example, 1,000 survives 999 ms and expires at/after 1,000 ms).
- Installed docs no longer imply `withCredentials` creates Authorization or Node cookie-jar behavior.
- Browser support claims are backed by the named verification environment; jsdom is not presented as a browser-engine/version gate.
- README, `llms.txt`, runtime export tests, and emitted declarations no longer contradict one another about stable exports or custom batching.
- `npm pack --dry-run --json`, packed CJS/ESM execution, strict consumers, docs compile checks, and package tests pass.

### Task ARC-H09: Decide Model Collision And Overlapping-Save Contracts

Status: pending

Priority: P2 investigation before implementation

Suggested agent: model API architect

Dependencies: ARC-H03, ARC-H05

Primary ownership:

- investigation and focused characterization tests in `packages/access-router-client/test/`
- `packages/access-router-client/src/model.ts` only after maintainer decision
- model API documentation

Finding:

The model wrapper combines document fields and methods on one object. `definePublicDataProps` skips keys already present on the wrapper, so document fields named `save`, `reset`, `set`, `get`, `assign`, `toJSON`, and similar names are not available through the advertised direct-property API even though `Model<T> & TData` claims both shapes. Existing coverage demonstrates a `save` data field is reachable only via `get()` but does not establish a type-level reserved-name contract.

The wrapper also permits overlapping `save()` calls. Current reconciliation handles edits during one in-flight save but does not serialize, reject, or explicitly define two simultaneous saves on the same instance. This is a correctness risk to investigate, not a confirmed lost-update defect until a deterministic reproduction is established.

References:

- `packages/access-router-client/src/model.ts:90-97`
- `packages/access-router-client/src/model.ts:135-276`
- `packages/access-router-client/src/model.ts:419-431`
- `packages/access-router-client/test/access-router-client.model.integration.test.ts:76-89`
- `packages/access-router-client/README.md:142-149`

Implementation requirements:

1. Add characterization tests for field names colliding with every public model method/property and for two overlapping saves with same-path and different-path edits.
2. Present maintainers with the smallest viable field contract: reserve/type-exclude method names, expose data under a dedicated namespace, or undertake an explicitly approved breaking proxy/method-namespace design.
3. Present the overlapping-save contract: serialize saves, reject a second active save, or prove the current reconciliation is deterministic for all characterized cases.
4. Do not implement a breaking object-shape redesign without release/version approval.
5. Once decided, align runtime behavior, types, README, emitted JSDoc, and migration notes.

Acceptance criteria:

- The task records an explicit maintainer decision for field collisions and overlapping saves.
- Public types no longer promise ordinary direct property access for reserved method names unless runtime can provide it.
- Overlapping same-path and different-path saves have deterministic tested behavior with no silently cleared unsent edit.
- Existing single-save concurrency, reset-baseline, projected-identity, and dirty-tracking tests remain green.
- If implementation is deferred, the file records rationale, consumer guidance, and residual risk.

## Wave 5: Independent Integration Review

### Task ARC-H10: Independently Verify Security, Protocol, Types, And Artifact

Status: pending

Priority: P1 release gate

Suggested agent: independent senior reviewer who did not implement ARC-H01 through ARC-H09

Dependencies: ARC-H01 through ARC-H08; ARC-H09 completed or explicitly deferred with maintainer rationale

Primary ownership:

- review only across changed package, sibling protocol references, docs, and packed artifact
- completion evidence in this task file

Finding:

The package has a large passing suite and two completed remediation histories, but current defects survived because tests asserted values rather than request counts, source strictness was not active, and package/runtime claims exceeded their verification. Final review must validate each acceptance criterion against runtime and packed output rather than trust implementation summaries.

Implementation requirements:

1. Reproduce each confirmed finding against the pre-fix revision or prove its new regression fails when the fix is removed.
2. Verify credential classification across cookies, bearer headers, `withCredentials`, partitions, cache hits, and in-flight deduplication.
3. Verify cache generation behavior for direct reads/mutations, bypassed reads, all-read groups, all-failed mutation groups, mixed groups, and overlapping reads.
4. Verify every changed direct/root wire shape against sibling Zod schemas and protocol parity tests.
5. Inspect emitted `.d.ts` and packed README/`llms.txt`; compile installed consumers under strict NodeNext and Bundler modes.
6. Verify browser claims in the actual environment named by documentation.
7. Ensure deferred ARC-H09 work has an explicit rationale and residual-risk statement.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/access-router-client typecheck` passes with strict source and type-test gates.
- `pnpm --filter @web-ts-toolkit/access-router-client test` passes serially.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass serially at repository level.
- `npm pack --dry-run --json` and packed CJS/ESM, NodeNext, Bundler, docs, export, and browser checks pass.
- `pnpm exec browserslist` resolves the package configuration without error.
- `git diff --check` passes.
- No task is marked completed without changed-file evidence, failing-regression evidence for confirmed defects, and command results.

## Dependency And Parallelization Guidance

| Wave | Tasks              | Parallelization                                                                        |
| ---- | ------------------ | -------------------------------------------------------------------------------------- |
| 1    | ARC-H01 -> ARC-H02 | Sequential; both own credential/cache lifecycle in `interceptors.ts`.                  |
| 2    | ARC-H03            | May run beside ARC-H01, then coordinate `shared.ts`/`adapter.ts` before ARC-H04.       |
| 2    | ARC-H04            | Starts after cache invalidation and model finalization behavior settle.                |
| 3    | ARC-H05 -> ARC-H06 | Sequential so mutation/filter type work is enforced by the corrected gate.             |
| 4    | ARC-H07            | May run beside ARC-H06 after strict source baseline is green.                          |
| 4    | ARC-H08            | Starts after behavioral and public-type contracts settle.                              |
| 4    | ARC-H09            | Characterization may run beside ARC-H07; implementation waits for maintainer decision. |
| 5    | ARC-H10            | Runs last and must use an independent reviewer.                                        |

Shared hotspots requiring one owner at a time:

- `src/services/interceptors.ts`: ARC-H01 then ARC-H02.
- `src/adapter.ts`: ARC-H02 then ARC-H04.
- `src/services/shared.ts`: ARC-H03 then ARC-H04.
- `src/services/model-service.ts`: ARC-H03 then ARC-H05/H06.
- package metadata/docs/generated declarations: ARC-H08 after runtime/type tasks.
- `dist/`: generated serially only; never assign concurrent agents to generated outputs.

Recommended agent allocation:

| Agent                 | Primary tasks                     | Notes                                            |
| --------------------- | --------------------------------- | ------------------------------------------------ |
| A: cache security     | ARC-H01, ARC-H02                  | One owner preserves cache generation invariants. |
| B: model/protocol     | ARC-H03, then support ARC-H04     | Coordinate finalization ownership with Agent C.  |
| C: batching           | ARC-H04                           | Wait for ARC-H02/H03 contracts.                  |
| D: TypeScript API     | ARC-H05, ARC-H06                  | Own strict gates before changing generics.       |
| E: encapsulation      | ARC-H07, ARC-H09 characterization | Avoid public type files while Agent D owns them. |
| F: package/runtime    | ARC-H08                           | Runs after public behavior/types settle.         |
| G: independent review | ARC-H10                           | Must not be a primary implementer above.         |

## Deferred Decisions Requiring Maintainer Input

1. Cache TTL public unit: recommend milliseconds because implementation and most tests already use `setTimeout` units. Renaming to `cacheTTLMilliseconds` would be clearer but is a larger public change; decide whether documentation-only correction is sufficient for the next release.
2. Custom batching: recommend removing the claim that raw `wrapLazyPromise` values can join `adapter.group()` unless a concrete consumer needs a safe adapter-owned custom request factory.
3. Mutation input generic defaults: decide whether create defaults to `Partial<T>`, a dedicated consumer-supplied type, or another documented mapped type. The sibling server accepts records and cannot infer required schema fields.
4. Browser matrix: decide whether exact Chrome/Firefox/Safari floors are release guarantees requiring real-engine CI, or whether support should be stated as `es2022` syntax plus modern bundlers with a narrower smoke-test claim.
5. Model collisions and overlapping saves: ARC-H09 must record a decision before any breaking model object-shape change.

None of these decisions blocks ARC-H01 through ARC-H05 or ARC-H07. Decisions 1-4 block final completion of ARC-H06/ARC-H08 as applicable; decision 5 may be explicitly deferred with residual risk.

## Definition Of Done

- Any request carrying authentication credentials requires an explicit stable cache partition, independent of `withCredentials`.
- Cache bypass never implies invalidation; only successful mutations advance the cache generation, including root batches.
- Update-returned projected models retain their known persistence identity in direct and grouped execution.
- Group preflight rejects unsupported config semantics, and malformed root responses settle through a controlled documented policy.
- Strict source and type-test gates are part of normal package verification and catch invalid calls.
- Mutation/filter public types are useful without exceeding the sibling runtime schema's guarantees.
- Exported service classes own immutable/detached default snapshots.
- Browserslist, TTL, authentication, export, custom batching, and browser-support claims match implementation and packed verification.
- Model collision/overlapping-save behavior is implemented and tested or explicitly deferred with maintainer rationale and residual risk.
- Targeted, package, repository, packed-artifact, documentation, and applicable browser checks pass serially.
- ARC-H10 independently verifies every acceptance criterion and records evidence before release.
