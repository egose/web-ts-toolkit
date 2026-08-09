# Access Router Client Post-Review Remediation

Created: 2026-08-09 00:08:24 local time

Related task: `docs/tasks/20260806-144945-access-router-client-review-remediation.md`

Package: `packages/access-router-client`

## Objective

Close confirmed gaps found while independently reviewing the uncommitted implementation of the completed access-router-client remediation. Restore the original definition of done for credential isolation, mutation single execution, subdocument safety, direct/grouped parity, truthful public types, protocol coverage, and release verification before committing or releasing the changes.

## Scope And Working Rules

- Preserve unrelated worktree changes and the completion history in the related task.
- Add a regression test that fails on the reviewed implementation before each behavioral fix.
- Treat cache identity races and mutation replay as release blockers.
- Use one captured cache key for the complete request lifecycle; do not recompute identity-sensitive policy after dispatch.
- Keep subdocument results as plain data in every direct and grouped operation.
- Make direct and grouped execution use the same observable response contract, not merely parallel implementations with similar fields.
- Do not weaken declarations or tests with broad `any`, `unknown as`, or assertions that silently pass for `never`.
- Update README, `llms.txt`, website docs, and `CHANGELOG.md` for public behavior changes.
- Do not edit generated `dist/` manually. Rebuild it from source.
- Run package and repository test commands serially because package tests rebuild shared dependencies.

## Non-Goals

- Do not redesign the server protocol beyond separately confirmed sibling-server defects.
- Do not add compatibility aliases for behavior that has not been released.
- Do not optimize cache invalidation granularity until correctness and identity safety are established.
- Do not expand the root export surface solely to solve internal coordination.

## Review Baseline

Confirmed on 2026-08-09 against the uncommitted worktree:

- `git diff --check`: passed.
- `pnpm --filter @web-ts-toolkit/access-router-client typecheck`: failed with `TS6059` workspace-source/rootDir errors and additional compiler diagnostics. This contradicts ARC-15 and ARC-22 acceptance criteria that package typecheck passes.
- The related task records 205 Node tests and 10 browser tests passing, but several tests assert only partial parity and miss the failure scenarios below.
- The related task's Definition of Done is not currently met: credential partitioning can race, grouped mutations can replay, grouped subdocument mutations can regain `Model.save()`, cached resources are not finitely bounded by default, and runtime list results can contradict declarations.

## Priorities

- P0: possible cross-identity response exposure, hung requests, or repeated mutation execution.
- P1: incorrect persistence route, stale/incorrect data, response/type/protocol contract violation, or a required verification gate that fails.
- P2: hardening, API encapsulation, release notes, or completeness improvements that do not independently expose data or replay writes.

## Wave 1: Cache And Execution Safety

### Task ARC-F01: Capture Cache Identity For The Request Lifecycle

Status: completed

Priority: P0

Suggested agent: cache security specialist

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- focused cache concurrency tests

Finding:

The request interceptor computes a partition and cache key at request time, but the response interceptor invokes `partitionForRequest` again and recomputes the key. If authentication state changes while the request is in flight, identity A's response can be stored under identity B's key, and the original in-flight slot is not resolved or removed. `clearCache()` also clears only completed entries, not active identity-sensitive slots.

References:

- `packages/access-router-client/src/services/interceptors.ts:286-298`
- `packages/access-router-client/src/services/interceptors.ts:427-455`
- `packages/access-router-client/src/services/interceptors.ts:472-477`

Implementation requirements:

1. Compute the cache eligibility, partition, and key exactly once in the request interceptor and carry immutable internal state through success and failure.
2. Resolve/reject/finalize the exact captured in-flight slot; never locate it by recomputing mutable identity state.
3. Define `clear()` and `dispose()` behavior for active requests. Disposal must settle every tail caller deterministically rather than deleting unresolved promises.
4. Prevent a response started under one credential generation from becoming a cache hit under a later generation.
5. Keep partition secrets out of diagnostics and serialized keys as required by ARC-01.

Acceptance criteria:

- Changing the partition value before a delayed response resolves cannot expose the old response through the new partition.
- The source request and all deduplicated tails settle without hanging after partition change, `clear()`, and `dispose()` scenarios.
- In-flight state is empty after fulfillment, rejection, clear/dispose handling, and identity transition.
- Focused cache tests and `pnpm --filter @web-ts-toolkit/access-router-client test` pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts`, `packages/access-router-client/test/access-router-client.cache.unit.test.ts`.
- Regression coverage: delayed partition transition, overlapping pre/post-`clear()` generations, and `dispose()` with multiple active tails.
- Verified: `pnpm exec vitest run --config ../../vitest.config.ts test/access-router-client.cache.unit.test.ts` (20 tests passed).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` (208 Node tests and 10 browser tests passed).
- Verified: `git diff --check` passed.

### Task ARC-F02: Enforce Method And Response Cache Eligibility

Status: completed

Priority: P1

Suggested agent: cache correctness specialist

Dependencies: ARC-F01

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- `packages/access-router-client/src/adapter.ts`
- cache policy tests

Finding:

Cache lookup and in-flight deduplication are gated by `x-axios-cache !== false`, not by an explicit safe HTTP method policy. Raw `adapter.axios` POST/PUT/PATCH/DELETE requests without the package header can therefore be cached or coalesced. Unsupported `responseType` and transform/serializer configurations are rejected only after requests may already have coalesced, and those semantics are missing from cache keys.

References:

- `packages/access-router-client/src/services/interceptors.ts:286-334`
- `packages/access-router-client/src/services/interceptors.ts:427-440`
- `packages/access-router-client/src/adapter.ts:222-225`

Implementation requirements:

1. Admit only explicitly supported idempotent read methods to cache lookup, storage, and in-flight deduplication.
2. Reject unsupported response modes, request/response transforms, serializers, and other unsafe-to-key semantics before cache or in-flight lookup.
3. Include every supported response-affecting configuration value in the key or bypass caching when stable serialization is not possible.
4. Keep service helpers' bypass header as an override, not the sole mutation classifier.
5. Set a finite documented default cache capacity; preserve an explicit opt-out from caching rather than an implicit unbounded mode.

Acceptance criteria:

- Raw Axios POST/PUT/PATCH/DELETE calls without package headers always execute independently and are never stored.
- Concurrent stream/unsupported response requests do not coalesce or share references.
- Differing supported response semantics cannot collide; unsupported transform/serializer functions bypass cache.
- Default cache size is finite and deterministic under high-cardinality reads.
- Node and browser cache tests pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts`, `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/test/access-router-client.cache.unit.test.ts`, `packages/access-router-client/test/access-router-client.arc22-adversarial.unit.test.ts`.
- Documentation: `packages/access-router-client/README.md`, `packages/access-router-client/llms.txt`, `website/docs/packages/access-router-client/adapter.mdx` now document GET-only eligibility, unsafe-config bypass, mutation invalidation, and the default 100-entry LRU capacity.
- Regression coverage: raw POST/PUT/PATCH/DELETE independence, unsupported response-mode isolation, custom transform/serializer/adapter and cancellation bypass, response-semantic key separation, and default-capacity eviction.
- Verified: `pnpm exec vitest run --config ../../vitest.config.ts test/access-router-client.cache.unit.test.ts test/access-router-client.arc22-adversarial.unit.test.ts` (40 tests passed).
- Verified: focused ESLint passed with no findings.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` (217 Node tests and 10 browser tests passed).
- Verified: `git diff --check` passed.

### Task ARC-F03: Claim Lazy Requests For Exactly One Execution Mode

Status: completed

Priority: P0

Suggested agent: batching state specialist

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/lazy-promise.ts`
- `packages/access-router-client/src/adapter.ts`
- lazy/grouping tests

Finding:

`STARTED_KEY` changes only when direct lazy execution starts. `group()` checks the flag but never atomically claims the request, so the same mutation request can be submitted through sequential or concurrent `group()` calls. Metadata is also `configurable: true`, allowing deletion or redefinition despite the documented immutability contract.

References:

- `packages/access-router-client/src/lazy-promise.ts:35-49`
- `packages/access-router-client/src/lazy-promise.ts:77-99`
- `packages/access-router-client/src/adapter.ts:276-318`

Implementation requirements:

1. Introduce an internal atomic claim operation shared by direct execution and grouping.
2. A request may transition once from unclaimed to direct or grouped execution; every later claim must fail before network activity.
3. Claim all requests in a group before dispatch and handle partial preflight failure without leaving unrelated requests incorrectly claimed.
4. Make internal ownership, query, callback policy, and state metadata non-configurable as well as non-enumerable/non-writable.
5. Preserve repeated `.then()`/`.catch()`/`.finally()`/`.exec()` attachment to one direct execution.

Acceptance criteria:

- Grouping the same mutation request twice, sequentially or concurrently, produces one network mutation and a controlled rejection for the other attempt.
- A grouped request cannot later execute directly, and a directly started request cannot be grouped.
- Consumer assignment, deletion, and `Object.defineProperty` cannot rewrite batching metadata or execution state.
- Foreign-adapter and mixed-config preflight failures still occur before network activity.

Completion evidence:

- Changed: `packages/access-router-client/src/lazy-promise.ts`, `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/test/access-router-client.adapter.integration.test.ts`.
- Regression coverage: sequential and concurrent grouped mutation replay, grouped-to-direct execution, duplicate-request claim rollback, mixed-config rollback, and metadata/state deletion or redefinition.
- Verified failing baseline: focused adapter integration suite failed the three new ownership and immutability regressions before implementation.
- Verified: `pnpm exec vitest run --config ../../vitest.config.ts test/access-router-client.adapter.integration.test.ts` (26 tests passed).
- Verified: focused ESLint passed with no findings.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` (220 Node tests and 10 browser tests passed).
- Verified: `git diff --check` passed.

## Wave 2: Response And Persistence Correctness

### Task ARC-F04: Make Grouped Subdocument Results Plain Data

Status: completed

Priority: P1

Suggested agent: subdocument contract specialist

Dependencies: ARC-F03

Primary ownership:

- `packages/access-router-client/src/services/shared.ts`
- `packages/access-router-client/src/services/sub-ops.ts`
- grouped subdocument tests

Finding:

Grouped `subCreate` and `subBulkUpdate` list results pass through the generic model-list branch in `finalizeRootEntry()` and become parent-service-backed `Model[]`. These values regain `save()` and can target the wrong parent route, violating the maintainer-selected plain-subdocument contract.

References:

- `packages/access-router-client/src/services/shared.ts:73-96`
- `packages/access-router-client/src/types.ts:148-169`
- `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts:310-316`

Implementation requirements:

1. Classify every subdocument operation explicitly before generic model wrapping.
2. Return plain objects/arrays for grouped `subList`, `subRead`, `subCreate`, `subUpdate`, and `subBulkUpdate`.
3. Keep `count` and scalar/list shapes identical to direct execution.
4. Do not attach a parent `ModelService` persistence adapter to any subdocument value.

Acceptance criteria:

- Every direct and grouped subdocument operation returns the documented plain scalar/array shape.
- Grouped create and bulk-update items have no `save()` and cannot invoke a parent route.
- Direct/grouped `raw`, `data`, `count`, status, and failure shapes agree.

Completion evidence:

- Changed: `packages/access-router-client/src/services/shared.ts`, `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts`.
- Regression coverage: grouped list/listAdvanced, read/readAdvanced, create, update, and bulk-update return plain data; list-like operations preserve array, `raw`, and `count` shapes; no returned item exposes `save()`.
- Verified: `pnpm exec vitest run --config ../../vitest.config.ts test/access-router-client.arc22-parity.integration.test.ts` (9 tests passed).
- Verified: focused ESLint passed with no findings.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` (220 Node tests and 10 browser tests passed).
- Verified: `git diff --check` passed.

### Task ARC-F05: Unify Direct And Grouped Finalization And Error Policy

Status: completed

Priority: P1

Suggested agent: response pipeline specialist

Dependencies: ARC-F03, ARC-F04

Primary ownership:

- `packages/access-router-client/src/adapter.ts`
- `packages/access-router-client/src/services/service.ts`
- `packages/access-router-client/src/services/shared.ts`
- direct/grouped parity tests

Finding:

Direct execution uses `handleSuccess`/`handleError` plus operation processors while grouped execution reconstructs a separate result. Grouped failures set `raw: null` and omit sibling root `code`/`errors`; grouped success messages and headers differ from direct results. Group callback iteration stops at the first throwing failure, so later executed entries receive no callback. Grouped `throwOnError` ignores adapter/service defaults and permits mixed per-call policy despite documentation claiming a uniform batch.

References:

- `packages/access-router-client/src/adapter.ts:318-349`
- `packages/access-router-client/src/services/service.ts:99-165`
- `packages/access-router-client/src/services/shared.ts:20-173`
- `packages/access-router/src/http/response-pipelines/service-result.ts:21-53`

Implementation requirements:

1. Establish one operation finalizer used by direct and grouped paths for success, failure, wrapping, count, message, and error payload normalization.
2. Preserve sibling root structured failure fields (`code`, `errors`, and other documented problem data) in the same public location as direct failures.
3. Resolve effective `throwOnError` from adapter/service defaults plus per-call override before creating lazy metadata.
4. Reject mixed effective batch policies during preflight, or define one explicit alternative contract and obtain maintainer approval.
5. Run each entry's success/failure callback exactly once even when the returned group promise ultimately rejects; throw only after callback processing is complete.
6. Do not represent outer batch HTTP headers as per-operation headers when the protocol does not provide them.

Acceptance criteria:

- Complete direct/grouped result comparisons pass for each operation family, including message, raw error payload, code/errors, count, and documented headers.
- Adapter-level, service-level, and per-call `throwOnError` behave identically in direct and grouped execution.
- Every grouped entry receives exactly one callback, including entries after a failing entry.
- Partial-failure and rejecting-batch behavior is documented and tested.

Completion evidence:

- Changed: `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/src/services/service.ts`, `packages/access-router-client/src/services/shared.ts`, `packages/access-router-client/src/services/request.ts`, `packages/access-router-client/src/services/model-service.ts`, `packages/access-router-client/src/services/data-service.ts`, and `packages/access-router-client/src/services/index.ts`.
- Regression coverage: structured grouped failure `raw`, direct/grouped message parity, empty per-operation grouped headers, adapter/service/per-call `throwOnError` precedence, mixed-policy preflight before dispatch, and callback completion before group rejection.
- Documentation: `packages/access-router-client/README.md`, `packages/access-router-client/llms.txt`, and `website/docs/packages/access-router-client/adapter.mdx` document partial failures, uniform effective policy, callback/rejection ordering, structured failure payloads, and grouped-header behavior.
- Verified failing baseline: the focused suites failed five ARC-F05 regressions before implementation.
- Verified: focused Vitest suites passed (38 tests).
- Verified: focused ESLint passed with no findings.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client build` passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` passed (223 Node tests and 10 browser tests).
- Verified: `git diff --check` passed.

### Task ARC-F06: Correct Model Save Reconciliation And Projected Dirty State

Status: completed

Priority: P1

Suggested agent: model state specialist

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/model.ts`
- model concurrency/projection tests

Finding:

`isConcurrentEdit()` compares every server-returned key with `submittedValues[path]`, so an unsubmitted server field is usually mistaken for a concurrent edit and discarded. Separately, `initializeDirtyState()` marks every field dirty whenever `_id` is absent, including existing models whose projection intentionally omitted `_id`; a save can resubmit projected values that the user never changed.

References:

- `packages/access-router-client/src/model.ts:79-87`
- `packages/access-router-client/src/model.ts:135-218`
- `packages/access-router-client/src/model.ts:361-373`

Implementation requirements:

1. Apply concurrent-edit comparison only to paths included in the submitted snapshot.
2. Merge server-returned unsubmitted fields unless the field was actually edited after request dispatch.
3. Initialize existing/projected wrappers clean based on persistence intent, not `_id` presence alone.
4. Preserve draft-create dirty initialization and all ARC-06 concurrent same-path protections.
5. Keep snapshots and reset behavior consistent after server merges.

Acceptance criteria:

- Server-generated or normalized unsubmitted fields merge into local state after save.
- An existing model projected without `_id` begins clean and submits only user edits.
- Concurrent edits to submitted and unsubmitted paths retain deterministic local-wins behavior.
- Failed saves preserve dirty paths and successful saves establish the correct reset baseline.

Completion evidence:

- Changed: `packages/access-router-client/src/model.ts`, `packages/access-router-client/test/access-router-client.model-reconciliation.unit.test.ts`.
- Regression coverage: projected existing wrappers start clean and submit only explicit edits; server-normalized and generated fields merge; concurrent submitted and unsubmitted edits remain dirty with local-wins behavior; reset retains the merged server baseline while reverting concurrent edits.
- Existing coverage retained: failed saves preserve dirty paths and ARC-06 same-path/other-path concurrency behavior.
- Verified: focused Vitest suites passed (22 tests).
- Verified: focused ESLint passed with no findings.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` passed (225 Node tests and 10 browser tests).
- Verified: `git diff --check` passed.
- Verification limitation: standalone `pnpm typecheck` remains blocked by existing workspace source aliases resolving dependencies outside the package `rootDir`; the package test's transitive build and declaration generation passed.

## Wave 3: Public Types And Protocol Coverage

### Task ARC-F07: Make Response And Subdocument Types Truthful

Status: completed

Priority: P1

Suggested agent: TypeScript contract specialist

Dependencies: ARC-F04, ARC-F05

Primary ownership:

- `packages/access-router-client/src/types.ts`
- `packages/access-router-client/src/services/shared.ts`
- `packages/access-router-client/src/services/model-service.ts`
- strict declaration consumers

Finding:

`SubDocumentResponse` leaves successful `data` nullable, `.subs('field')` defaults the subdocument type to the whole parent model instead of inferring an array element, and list aliases require `totalCount` while direct no-count success can omit it. Grouped finalization initializes a count, producing direct/grouped runtime drift.

References:

- `packages/access-router-client/src/types.ts:132-169`
- `packages/access-router-client/src/types.ts:249-251`
- `packages/access-router-client/src/services/shared.ts:222-257`
- `packages/access-router-client/src/services/model-service.ts:989-1006`

Implementation requirements:

1. Make successful single-subdocument `data` non-null; keep null only in the failure branch.
2. Infer the subdocument element type from `field` when `T[K]` is an array, while retaining an explicit generic escape hatch where inference is impossible.
3. Choose and enforce one count contract: always initialize `totalCount`, or make it conditional/optional based on `includeCount` with overloads/discriminants.
4. Keep direct and grouped runtime objects consistent with the chosen declarations.
5. Replace type assertions that can pass when the tested type is `never` with forward assignments or equivalent robust checks.

Acceptance criteria:

- Strict NodeNext and Bundler consumers infer `.subs('statusHistory')` item fields without a manual generic.
- `if (result.success)` narrows single-subdocument `data` to a non-null plain object.
- No-count and count list calls match declarations and runtime in direct and grouped modes.
- Negative type tests fail when inference regresses or a success payload becomes `never`.

Completion evidence:

- Changed: `packages/access-router-client/src/types.ts`, `packages/access-router-client/src/services/shared.ts`, `packages/access-router-client/src/services/model-service.ts`, and `packages/access-router-client/src/services/data-service.ts`.
- Regression coverage: strict declaration consumers infer array elements from `.subs('statusHistory')`, prove success data in both assignment directions so `never` cannot pass silently, retain the explicit generic escape hatch, and verify no-count direct/grouped lists both expose `totalCount: 0`.
- Verified failing baseline: NodeNext strict compilation rejected inferred subdocument fields and nullable success data; the focused parity suite observed `undefined` for direct no-count `totalCount`.
- Verified: focused Vitest suites passed (17 tests).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` and `typecheck:bundler-strict` passed.
- Verified: focused ESLint passed with no findings.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` passed (228 Node tests and 10 browser tests).
- Verified: `git diff --check` passed.

### Task ARC-F08: Complete The Operation-By-Operation Protocol Matrix

Status: completed

Priority: P1

Suggested agent: cross-package protocol specialist

Dependencies: ARC-F04, ARC-F05, ARC-F07

Primary ownership:

- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`
- focused sibling access-router contract fixtures
- client model/data/subdocument services only where tests expose drift

Finding:

ARC-13 required every public operation to be checked for method/path, exact body, options/defaults, direct result/error, root metadata, and grouped result/error. The delivered 12-test suite samples behavior but omits most operations and exact-wire assertions. It missed grouped subdocument mutation wrapping and model bulk-create drift. The sibling model router accepts object-or-array create bodies while client create types and direct normalization remain scalar-only.

References:

- `docs/tasks/20260806-144945-access-router-client-review-remediation.md:707-729`
- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`
- `packages/access-router-client/src/services/model-service.ts:267-358`
- `packages/access-router/src/validation/model-router.ts:146-149`

Implementation requirements:

1. Build a table enumerating every public model, data, and subdocument operation and its direct/root support.
2. Assert exact method, encoded path, query, body, defaults/overrides, root metadata, and normalized success/failure output against real sibling routers.
3. Decide and implement model bulk-create overloads and scalar/list normalization based on the sibling contract; document the public result shape.
4. Include grouped subdocument create/update/bulk-update/delete and structured failure cases.
5. Add compile-time structural drift checks against stable sibling protocol types where feasible.

Acceptance criteria:

- Every public operation appears in the matrix and has direct plus grouped coverage where supported.
- Bulk model create accepts and returns a truthful documented shape, or is explicitly rejected before network activity if maintainers intentionally exclude it.
- A route/body/option/root-schema change in either sibling package fails the client test gate.
- No accepted public option is silently ignored.

Completion evidence:

- Changed: `packages/access-router-client/src/services/model-service.ts`, `packages/access-router-client/src/services/data-service.ts`, `packages/access-router-client/src/services/shared.ts`, `packages/access-router-client/src/adapter.ts`, and focused integration/declaration fixtures.
- Protocol matrix: all 33 public model, data, subdocument, and `id(...).fetch()` operation variants are enumerated with their sibling root target/operation; real-router regressions cover exact root serialization, direct advanced-data option bodies, grouped subdocument delete/failure, and direct/grouped result normalization.
- Public contract: model `create(...)` and `createAdvanced(...)` now preserve scalar/array input cardinality; one-item arrays return `ArrayModelResponse`, while scalar input retains `ModelResponse`. README, `llms.txt`, website service docs, and strict declaration consumers describe and verify the shape.
- Additional drift fixed: grouped `new()` removes the server-generated `_id`, top-level root entries omit the subquery-only `model` field, and direct data `listAdvanced()` transmits `includeExtraHeaders`.
- Verified: focused protocol parity suite passed (19 tests); related model/data/subdocument/url suites passed (63 tests).
- Verified: NodeNext and Bundler strict declaration-consumer checks passed; focused ESLint passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` passed (236 Node tests and 10 browser tests).

### Task ARC-F09: Repair The Package Typecheck Gate

Status: completed

Priority: P1

Suggested agent: TypeScript build specialist

Dependencies: ARC-F07, ARC-F08

Primary ownership:

- `packages/access-router-client/tsconfig.json`
- package typecheck scripts/configs
- only source/test typing fixes exposed by the corrected boundary

Finding:

The package advertises `typecheck`, and ARC-15/ARC-22 require it to pass, but `pnpm --filter @web-ts-toolkit/access-router-client typecheck` compiles workspace dependency sources under the client's `rootDir` and fails with extensive `TS6059` plus other diagnostics. Calling this a pre-existing baseline does not satisfy the completed acceptance criterion.

References:

- `packages/access-router-client/package.json:31-37`
- `packages/access-router-client/tsconfig.json`
- `docs/tasks/20260806-144945-access-router-client-review-remediation.md:848-860`
- `docs/tasks/20260806-144945-access-router-client-review-remediation.md:1351-1358`

Implementation requirements:

1. Define whether source typecheck consumes built workspace declarations or project references; prevent package `rootDir` from accidentally absorbing sibling source trees.
2. Keep test-specific configs separate where integration tests intentionally import sibling source.
3. Fix real client diagnostics exposed after the boundary correction; do not hide them with `skipLibCheck` or broad exclusions of client source.
4. Include source typecheck and strict declaration consumer checks in the default package verification flow.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/access-router-client typecheck` exits 0.
- NodeNext and Bundler declaration-consumer checks remain green with `strict: true` and `skipLibCheck: false`.
- The package test or release gate invokes all three checks so future drift is not documented away.

Completion evidence:

- Changed: `packages/access-router-client/package.json`, `packages/access-router-client/tsconfig.typecheck.json`, `packages/access-router-client/src/helpers.ts`, `packages/access-router-client/src/services/shared.ts`, and `packages/access-router-client/src/services/wrap.ts`.
- Boundary: source typecheck clears inherited workspace source aliases, consumes built dependency declarations, excludes integration tests, targets ES2022, and checks libraries with `skipLibCheck: false`.
- Diagnostics fixed: subquery marker narrowing, grouped failure normalization input typing, and immutable Axios header cloning.
- Verification gate: package `typecheck` builds the workspace dependency closure and runs source, strict NodeNext, and strict Bundler checks; package `test` invokes that composite gate before Node and browser tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client typecheck` passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` passed (236 Node tests and 10 browser tests).
- Verified: focused ESLint and `git diff --check` passed.

## Wave 4: Release Contract And Integration

### Task ARC-F10: Publish Migration Notes And Align Documentation

Status: completed

Priority: P2

Suggested agent: package documentation specialist

Dependencies: ARC-F05, ARC-F07, ARC-F08

Primary ownership:

- `CHANGELOG.md`
- `packages/access-router-client/README.md`
- `packages/access-router-client/llms.txt`
- `website/docs/packages/access-router-client/**`
- documentation compile fixtures

Finding:

The uncommitted changes alter public subdocument wrapping and create shape, count naming, response discrimination, cache defaults, batching behavior, and exports, but no release/migration entry records these changes. The original task explicitly required release notes for public contract changes.

References:

- `docs/tasks/20260806-144945-access-router-client-review-remediation.md:18`
- `docs/tasks/20260806-144945-access-router-client-review-remediation.md:268-281`
- `CHANGELOG.md`

Implementation requirements:

1. Add a concise unreleased migration section covering all consumer-visible changes from the related task and this follow-up.
2. Include before/after guidance for subdocument plain data, create/list count fields, response narrowing, cache partition/capacity defaults, group single-execution, and `throwOnError` batch policy.
3. Update README, `llms.txt`, website docs, and compile fixtures to the final implemented contract.
4. Verify installed links and packed-document examples against the staged artifact.

Acceptance criteria:

- A consumer can identify every breaking behavior/type change and the required migration from `CHANGELOG.md` plus installed README.
- Documentation examples compile against the packed artifact under NodeNext and Bundler.
- Docs no longer claim unbounded cache defaults, incomplete group immutability, or count/result invariants that runtime does not enforce.

Completion evidence:

- Changed: `CHANGELOG.md`, `packages/access-router-client/README.md`, `packages/access-router-client/llms.txt`, all affected website package guides, `packages/access-router-client/test-docs-consumer/examples/services-model.ts`, `packages/access-router-client/test-docs-consumer/snippets-mapping.md`, and the corrected `ListModelResponse` declaration JSDoc in `packages/access-router-client/src/types.ts`.
- Migration coverage: before/after guidance now covers plain subdocument data and parent-scoped persistence, subdocument `count` versus model/data `totalCount`, scalar/array create cardinality, discriminated response narrowing, disabled/partitioned/bounded cache defaults, one-mode lazy execution, uniform grouped `throwOnError`, narrowed protocol/filter types, path encoding/config immutability, and projected model persistence identity.
- Documentation alignment: installed and website docs now describe the 100-entry default LRU, supported-GET cache eligibility, non-configurable group metadata, callback-before-rejection batch policy, empty per-entry grouped headers, `MissingPersistenceIdentityError`, and successful subdocument count semantics without claiming direct subdocument failures initialize `count`.
- Packed compile coverage: the documentation consumer fixture now proves scalar model create returns `ModelResponse` and a one-item array returns `ArrayModelResponse`.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.docs.compile.test.ts` passed (2 tests; strict NodeNext and Bundler compiles against the staged tarball).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.docs.links.unit.test.ts` passed (5 tests, including live URL probes).
- Verified: `pnpm --dir website build` passed.
- Verified: focused ESLint and `git diff --check` passed.

### Task ARC-F11: Independently Verify The Follow-Up

Status: completed

Priority: P1 release gate

Suggested agent: independent senior reviewer

Dependencies: ARC-F01 through ARC-F10

Primary ownership:

- review only across changed packages and release artifacts
- task completion evidence

Finding:

The previous independent review marked the remediation complete while leaving several definition-of-done violations. The follow-up therefore needs criterion-by-criterion verification against runtime behavior and built artifacts, not completion-note summaries.

Implementation requirements:

1. Reproduce each finding in this file against the pre-fix implementation and verify its regression test.
2. Audit every acceptance criterion in both this task and the related original task against source, runtime, declarations, and docs.
3. Re-test cache identity transitions, dispose during active deduplication, raw Axios mutations, grouped mutation replay, all grouped subdocument mutations, and complete direct/grouped failure parity.
4. Verify type inference and runtime count contracts using packed consumers, not source-only Vitest type erasure.
5. Review release/migration notes for every public change.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/access-router-client typecheck` passes.
- `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` passes.
- `pnpm --filter @web-ts-toolkit/access-router-client typecheck:bundler-strict` passes.
- `pnpm --filter @web-ts-toolkit/access-router-client test` passes serially.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass serially.
- Packed CJS/ESM execution, NodeNext/Bundler consumers, browser smoke, documentation compile/link checks, and production manifest transformation pass.
- `git diff --check` passes.
- No task is marked completed without changed-file evidence, regression-test evidence, and its required command results.

Review result (2026-08-09): completed after resolving the follow-up correctness and release-contract findings and rerunning the release gates.

Resolved blocking findings:

1. P0: a successful mutation clears completed entries without advancing the cache generation or detaching active read slots. A read started before the mutation can resolve afterward, repopulate stale data, and accept post-mutation tails. The existing mutation test starts only after a completed cached read and does not overlap a delayed read with the mutation.
   - Source: `packages/access-router-client/src/services/interceptors.ts:524-551`
   - Coverage gap: `packages/access-router-client/test/access-router-client.cache.unit.test.ts:238-264`
2. P0: grouped request-config preflight skips empty configs. An empty-config request can therefore batch with a credentialed request and execute under the latter's shared headers, contrary to the one-config batch contract.
   - Source: `packages/access-router-client/src/adapter.ts:278-308`
   - Coverage gap: `packages/access-router-client/test/access-router-client.adapter.integration.test.ts:68-76`
3. P1: an outer root transport rejection bypasses per-entry normalization, all entry callbacks, and the effective `throwOnError` policy because only the fulfilled `instance.post(...).then(...)` path is handled.
   - Source: `packages/access-router-client/src/adapter.ts:339-368`
   - Direct comparison: `packages/access-router-client/src/services/service.ts:154-178`
4. P1: grouped finalization unconditionally adds `count` and `totalCount` to every result, while direct scalar/single operations do not. Direct subdocument-list failures also omit their declared `count` and instead inherit `totalCount: 0` from generic error normalization.
   - Source: `packages/access-router-client/src/services/shared.ts:157-179`
   - Source: `packages/access-router-client/src/services/service.ts:154-178`
   - Source: `packages/access-router-client/src/services/sub-ops.ts:34-53`
5. P1: `FailureResult<T1>.raw` is declared as the success payload type (`T1 | null`), but runtime failures preserve a structured problem payload. Packed declaration fixtures currently assert the incorrect success type in failure branches.
   - Declaration: `packages/access-router-client/src/types.ts:105-132`
   - Packed fixture: `packages/access-router-client/test-packed-consumer/consumer/consumer-types.ts:45-55`
6. P1: the ARC-F08 protocol matrix enumerates 33 lazy metadata values but does not execute every operation directly and grouped or assert each exact method, path, query, body, defaults, success, and failure. Most sibling protocol changes can still pass the gate.
   - Requirement: `docs/tasks/20260806-144945-access-router-client-review-remediation.md:707-729`
   - Current matrix: `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts:19-68`
7. P1: the real production manifest transformation replaces the client's declared Node `>=22` engine with the root's Node `>=20` engine. Installed docs consistently claim Node 22+, but the packed-manifest test does not assert `engines`.
   - Source manifest: `packages/access-router-client/package.json:45-49`
   - Transformation input: `packages/access-router-client/test/packed-consumer-harness.ts:193-210`
   - Missing assertion: `packages/access-router-client/test/access-router-client.packed-consumer.test.ts:75-110`
8. P1: after a successful save with a concurrent same-path edit, `Model.reset()` preserves the pre-save snapshot instead of the latest persisted server value. The new reconciliation test currently codifies that stale baseline despite its server fixture returning a newer normalized value.
   - Source: `packages/access-router-client/src/model.ts:243-258`
   - Test: `packages/access-router-client/test/access-router-client.model-reconciliation.unit.test.ts:57-93`
9. P2: the documentation compile gate compiles manually maintained fixtures but does not read or extract code blocks from README, `llms.txt`, or website docs. A changed or newly broken documentation example can therefore remain unmapped while the gate stays green.
   - Test: `packages/access-router-client/test/access-router-client.docs.compile.test.ts:8-85`
   - Manual mapping: `packages/access-router-client/test-docs-consumer/snippets-mapping.md`

Verification evidence:

- Changed for ARC-F11: `packages/access-router-client/src/services/interceptors.ts`, `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/src/services/service.ts`, `packages/access-router-client/src/services/shared.ts`, `packages/access-router-client/src/services/sub-ops.ts`, `packages/access-router-client/src/types.ts`, `packages/access-router-client/src/model.ts`, `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`, `packages/access-router-client/test/access-router-client.cache.unit.test.ts`, `packages/access-router-client/test/access-router-client.adapter.integration.test.ts`, `packages/access-router-client/test/access-router-client.model-reconciliation.unit.test.ts`, `packages/access-router-client/test/access-router-client.packed-consumer.test.ts`, `packages/access-router-client/test/access-router-client.docs.compile.test.ts`, `packages/access-router-client/test/packed-consumer-harness.ts`, `packages/access-router-client/test-packed-consumer/consumer/consumer-types.ts`, `packages/access-router-client/test-docs-consumer/examples/*`, `packages/access-router-client/test-docs-consumer/snippets-mapping.md`, `packages/access-router-client/README.md`, `website/docs/packages/access-router-client/services.mdx`, `package.json`, `pnpm-workspace.yaml`, and `patches/@repo-toolkit__publish-package@0.7.2.patch`.
- Regression coverage: overlapping mutation/read cache generations, grouped empty-vs-credentialed config rejection, grouped outer transport failure normalization and callback/`throwOnError` policy, direct/grouped count own-property parity, truthful structured failure `raw` types, all 33 protocol operations directly and grouped, packed manifest `engines.node`, model reset baseline reconciliation after concurrent edits, and mapped documentation source fragments in compiled fixtures.
- Passed: `pnpm --filter @web-ts-toolkit/access-router-client typecheck`.
- Passed: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.protocol-parity.integration.test.ts` (89 tests).
- Passed: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.docs.compile.test.ts` (2 tests; strict NodeNext and Bundler docs compiles against the staged tarball).
- Passed: `pnpm --filter @web-ts-toolkit/access-router-client test` (310 Node tests and 10 jsdom/Vite browser-smoke tests).
- Passed serially: `pnpm lint`, `pnpm build`, and `pnpm test`.
- Passed: `pnpm --dir website build`.
- Passed: `pnpm build-artifact -- --version 0.32.0` and `pnpm verify-artifact -- --version 0.32.0`; artifact verification succeeded (build emitted non-fatal pnpm bin-link warnings).
- Passed: `git diff --check`.
- Independent review: fresh reviewer found no remaining high/medium release-blocking findings. Residual risk is limited to reliance on the reported full-gate results; no additional expensive commands were rerun by the reviewer.

Blocker resolution:

- Findings 1-9 are covered by failing regressions, source/type/docs/release fixes, full gate results, and fresh independent review evidence above.

## Dependency And Parallelization Guidance

| Wave | Tasks                         | Parallelization                                                            |
| ---- | ----------------------------- | -------------------------------------------------------------------------- |
| 1    | ARC-F01 -> ARC-F02            | Sequential; both own cache lifecycle and policy.                           |
| 1    | ARC-F03                       | May run beside ARC-F01/F02; coordinate `adapter.ts` before integration.    |
| 2    | ARC-F04 -> ARC-F05            | Sequential; finalization must preserve the subdocument decision.           |
| 2    | ARC-F06                       | May run independently; owns `model.ts`.                                    |
| 3    | ARC-F07 -> ARC-F08 -> ARC-F09 | Sequential so runtime contracts settle before declaration and build gates. |
| 4    | ARC-F10 -> ARC-F11            | Documentation follows final behavior; independent review runs last.        |

Shared hotspots requiring one owner at a time:

- `src/services/interceptors.ts`: ARC-F01 then ARC-F02.
- `src/adapter.ts`: ARC-F03 then ARC-F05.
- `src/services/shared.ts`: ARC-F04 then ARC-F05 then ARC-F07.
- `src/types.ts`: ARC-F07 after response/subdocument behavior settles.
- Generated `dist/`: rebuild only and never assign to concurrent agents.

## Deferred Decisions Requiring Maintainer Input

1. Batch failure policy: recommend rejecting the group after all per-entry callbacks run when effective `throwOnError` is true. Confirm whether this remains the intended public policy before ARC-F05 changes behavior.
2. Count contract: recommend always initializing `totalCount` to a deterministic number to minimize declaration churn, but confirm whether absence when `includeCount: false` is semantically preferable before ARC-F07.
3. Bulk model create: confirm whether the client should expose sibling-server array create support. If excluded intentionally, require a runtime guard and documentation rather than silently accepting an array through JavaScript.

## Definition Of Done

- Identity-sensitive cache state is captured once and cannot cross credential transitions.
- Every source and tail request settles through cache clear/dispose and network success/failure.
- Only supported reads cache or deduplicate, with finite default bounds.
- A lazy mutation can execute exactly once across direct and grouped modes.
- Every subdocument result remains plain data and can persist only through parent-scoped helpers.
- Direct and grouped results, callbacks, errors, counts, messages, and policy agree by documented design.
- Model save preserves true concurrent edits while merging unsubmitted server fields and keeping projected existing models clean.
- Public declarations narrow and infer truthfully and match runtime count behavior.
- Every public operation is locked to the sibling protocol by direct/root contract tests.
- Package source typecheck, strict declaration checks, package/full tests, build, lint, browser, and packed-artifact gates pass.
- Migration notes and installed/website documentation describe the final contract.
