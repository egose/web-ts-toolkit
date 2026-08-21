# Access Router Post-Remediation Review Tasks

Created: 2026-08-20 16:40:11 local time

Package: `packages/access-router`

Related completed reviews:

- `docs/tasks/20260804-124249-access-router-review-remediation.md`
- `docs/tasks/20260805-192300-access-router-remediation-follow-up.md`

## Objective And Scope

Resolve newly confirmed authorization, field-policy, correctness, resource-bound, package-contract, and architectural gaps in the current `access-router` implementation. This is a new execution record; do not reopen or duplicate completed AR/ARF work unless a task below identifies a distinct remaining case.

The package itself was not changed during this review. Agents must re-read current code before editing because other work may land after this document was created.

## Working Rules And Non-Goals

- Preserve unrelated worktree changes. Never revert files or generated output owned by another session.
- Add a failing regression test before or with every behavioral fix.
- Enforce authorization and input policy at the smallest shared service boundary, not independently in direct and root routes.
- Treat read-to-list fallback, populate, include, subquery, sort, distinct fields, task paths, and nested request values as untrusted.
- Do not preserve unsafe behavior through compatibility aliases without a concrete external requirement.
- Keep public contract changes synchronized across runtime behavior, exported types, `README.md`, `llms.txt`, OpenAPI, and release notes.
- Prefer focused extraction around verified seams. Do not rewrite `Service` wholesale.
- Do not hand-edit `dist/`; rebuild it from source.
- Package test scripts rebuild shared workspace outputs. Do not run package build/test scripts concurrently.
- Full test-file parallelism is a dedicated task. Until ART-16 completes, keep the configured serialized Vitest execution.

## Review Baseline

Verified on 2026-08-20 against a clean worktree before the review commands ran:

- `pnpm --filter @web-ts-toolkit/access-router typecheck`: passed.
- `pnpm --filter @web-ts-toolkit/access-router test`: passed, 37 files and 318 tests.
- The package test remains serialized with `fileParallelism: false`.
- Existing green tests do not cover the adversarial combinations described below.

Before implementation, record `git status --short` and rerun the package test if the relevant source has changed.

## Priorities

- P0: confirmed authorization or denied-field disclosure path.
- P1: correctness, denial-of-service, unbounded resource use, or materially unsound public contract.
- P2: encapsulation, testability, verification quality, or maintainability.
- P3: optional documentation or workflow refinement.

## Wave 1: Authorization And Field Policy

### Task ART-01: Authorize Read-To-List Fallback On Every Entry Path

Status: completed

Priority: P0

Suggested agent: authorization service agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/services/public-service.ts`
- Read handlers only where needed to carry trusted authorization context
- Focused direct/root read integration tests

Finding:

`_read()` and `_readFilter()` start under `read` access, then retry with `list` access when `tryList` is true. Direct and root handlers authorize only `read`; unlike the previously fixed cross-resource subquery path, the general fallback never checks the model's `list` operation guard before applying list row and field policy.

References:

- `packages/access-router/src/services/public-service.ts:111-159`
- `packages/access-router/src/services/public-service.ts:162-211`
- `packages/access-router/src/routers/model-router-document-routes.ts:101-145`
- `packages/access-router/src/routers/root-router.ts:79-89`
- `packages/access-router/src/interfaces/service-read.ts:12-15`

Implementation requirements:

1. Before changing from `read` to `list`, authorize `list` through the same request core used by route guards.
2. Preserve fallback only when both operations are allowed; otherwise return the package's controlled concealment/authorization result without a list-scoped query.
3. Apply the rule to ID reads, read-by-filter, direct routes, root operations, and trusted in-process public-service calls.
4. Do not accept a client-provided flag as proof that list access is authorized.
5. Document any externally visible status-code or fallback change and add release notes because this closes an authorization bypass.

Acceptance criteria:

- A caller with `read: true` and `list: false` cannot reach list row, select, populate, include, task, or decorate behavior after a read miss.
- Tests use different read/list base filters and field policies so they prove which access path executed.
- ID, filter, direct, and root paths have negative coverage.
- Fallback still works when both operation guards allow it.
- Targeted tests and `pnpm --filter @web-ts-toolkit/access-router test` pass.

Completion evidence:

- Implemented in `packages/access-router/src/services/public-service.ts`: `_read()` and `_readFilter()` now call `req.macl.isAllowed(modelName, 'list')` before switching from read to list fallback. Denied fallback returns the package's controlled `Codes.Unauthorized` result and does not build or execute a list-scoped query.
- Added `packages/access-router/test/read-list-fallback-authorization.integration.test.ts` covering direct ID, direct read-by-filter, root read, and trusted in-process public-service fallback denial with different read/list base filters and field policies. The positive case verifies list row policy, list field policy, task execution, and list decoration when both guards allow fallback.
- Documented the externally visible security change in `CHANGELOG.md`: callers with `read` but not `list` now receive Unauthorized instead of retrying through list policy.
- Pre-work `git status --short`: task document was already untracked (`?? docs/tasks/20260820-164011-access-router-post-remediation-review.md`).
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/read-list-fallback-authorization.integration.test.ts` passed, 1 file and 5 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 38 files and 323 tests.

### Task ART-02: Apply Target Authorization To Subdocument Populate

Status: completed

Priority: P0

Suggested agent: populate authorization agent

Dependencies: ART-01

Primary ownership:

- `packages/access-router/src/services/model-subdocument-service.ts`
- `packages/access-router/src/helpers/document.ts`
- Shared populate authorization helper extracted from `Core.genPopulate()` if useful
- Subdocument direct/root integration tests

Finding:

Advanced subdocument reads prefix client populate paths with `genSubPopulate()` and pass them directly to Mongoose. This path does not verify target runtime membership, target operation access, target row filters, or target field selection as `Core.genPopulate()` does for top-level populate.

References:

- `packages/access-router/src/routers/model-router-subdocument-routes.ts:118-145`
- `packages/access-router/src/routers/root-router.ts:99-108`
- `packages/access-router/src/services/model-subdocument-service.ts:52-76`
- `packages/access-router/src/services/model-subdocument-service.ts:222-236`
- `packages/access-router/src/helpers/document.ts:59-83`
- `packages/access-router/src/core.ts:210-266`

Implementation requirements:

1. Resolve each populated reference from the parent model and full subdocument path.
2. Require active-runtime ownership and the correct target operation guard before database population.
3. Apply the target base filter and target field projection; source subdocument permission must not imply target permission.
4. Validate nested populate paths and fail closed when target metadata cannot be resolved safely.
5. Return controlled package errors for denied, unknown, or cross-runtime targets rather than raw Mongoose errors.
6. Reuse one populate-policy resolver for top-level and subdocument paths where their contracts match.

Acceptance criteria:

- Source-allowed/target-denied populate cannot expose a target through direct or root `subRead`.
- Target read allowed with a restrictive row filter does not populate an excluded row.
- Denied target fields are absent even when the source subdocument field is readable.
- Unknown and cross-runtime references produce deterministic controlled results.
- Existing allowed subdocument populate behavior remains covered.

Completion evidence:

- Implemented in `packages/access-router/src/core.ts`, `packages/access-router/src/services/base.ts`, and `packages/access-router/src/services/model-subdocument-service.ts`: subdocument parent reads now resolve prefixed populate requests through the shared `genPopulate()` policy path, with subdocument-aware source-field permission checks and the existing target runtime, operation, row-filter, and projection enforcement.
- Added `packages/access-router/test/subdocument-populate-authorization.integration.test.ts` covering direct `subRead`, root `subRead`, target read denial, target row-filter exclusion, target field denial, unknown populate paths, and unregistered target models.
- Pre-work `git status --short`: existing unrelated ART-01 changes were present in `CHANGELOG.md`, `packages/access-router/src/services/public-service.ts`, `packages/access-router/test/read-list-fallback-authorization.integration.test.ts`, and this untracked task document. `CHANGELOG.md` was not edited for ART-02.
- Verification passed after rebuild: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/subdocument-populate-authorization.integration.test.ts` passed, 1 file and 4 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 39 files and 327 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.

### Task ART-03: Make Include Operations Use Their Declared Access Semantics

Status: completed

Priority: P0

Suggested agent: cross-resource policy agent

Dependencies: ART-01

Primary ownership:

- `packages/access-router/src/services/base.ts`
- A focused include executor/helper if extracted
- Cross-resource authorization integration tests

Finding:

An include with `op: 'read'` authorizes and filters for target `read`, but executes `Service.find()`. `find()` hardcodes list selection, output trimming, and list hook context. A target can therefore be read-filtered while list field policy is applied, including a case where target list operation access is denied.

References:

- `packages/access-router/src/services/base.ts:303-340`
- `packages/access-router/src/services/service.ts:323-448`
- `packages/access-router/test/cross-resource-authorization.integration.test.ts`

Implementation requirements:

1. Map each include operation to one coherent target contract: operation guard, row filter, field policy, hooks, and cardinality must all use the same access.
2. A read include must not call a list-semantic service path unless list is separately authorized and that behavior is explicitly the contract.
3. Keep source/target authorization independent and preserve controlled unknown-target handling.
4. Centralize include dispatch so direct and root source operations cannot diverge.

Acceptance criteria:

- With target `read: true`, `list: false`, `secret.read: false`, and `secret.list: true`, a read include does not expose `secret` or execute list policy.
- Read/list/count include tests prove the corresponding target guard, row filter, field policy, and output cardinality.
- Denied target operations do not execute target persistence calls.
- Package tests pass.

Completion evidence:

- Implemented in `packages/access-router/src/services/base.ts`: include dispatch now uses distinct target execution paths for `read`, `list`, and `count`. Read includes authorize and execute through `findOne(..., { access: 'read' })`, list includes keep list semantics, and count includes authorize `count` and execute `count(..., 'count')` instead of materializing list rows.
- Added coverage in `packages/access-router/test/cross-resource-authorization.integration.test.ts` for read include field policy/cardinality without list persistence, list include list policy/cardinality, count include count guard/filter/cardinality, and denied read include avoiding target persistence calls.
- Pre-work `git status --short`: existing unrelated ART-01/ART-02 changes were present in `packages/access-router/src/core.ts`, `packages/access-router/src/services/model-subdocument-service.ts`, `packages/access-router/src/services/public-service.ts`, `packages/access-router/test/read-list-fallback-authorization.integration.test.ts`, `packages/access-router/test/subdocument-populate-authorization.integration.test.ts`, and this untracked task document. `CHANGELOG.md` was not edited for ART-03.
- Verification passed after rebuild: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/cross-resource-authorization.integration.test.ts` passed, 1 file and 13 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 39 files and 331 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.

### Task ART-04: Centralize Sort Authorization For Model And Data Services

Status: completed

Priority: P0

Suggested agent: field-policy agent

Dependencies: none

Primary ownership:

- A shared field-path/sort policy module
- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/services/data-service.ts`
- `packages/access-router/src/model.ts`
- Model and data sort tests

Finding:

Model-backed list and read-by-filter accept sort fields that are checked only for syntax in `Model.validateSort()`. They are not authorized against field permissions, so ordering and first-row selection can reveal denied values. `DataService` has a separate ACL-aware validator, creating policy duplication and drift.

References:

- `packages/access-router/src/services/service.ts:206-255`
- `packages/access-router/src/services/service.ts:323-388`
- `packages/access-router/src/model.ts:64-85`
- `packages/access-router/src/model.ts:85-165`
- `packages/access-router/src/services/data-service.ts:111-127`
- `packages/access-router/src/services/data-service.ts:196-227`
- `packages/access-router/test/data-service-hot-path.test.ts:145-203`

Implementation requirements:

1. Parse string, object, tuple-array, and supported map sort forms through one shared helper.
2. Validate syntax and authorize every field for the operation before issuing a query or sorting in memory.
3. Define exact behavior for dynamic document-level field permissions; fail closed when pre-query authorization is impossible.
4. Return a controlled client error instead of silently removing an invalid model sort.
5. Preserve permitted ascending, descending, and multi-field ordering.

Acceptance criteria:

- Denied `secretRank` sorting is rejected for model advanced list, read-by-filter, and root list/read before Mongoose query execution.
- Equivalent data and model requests have matching rejection semantics.
- Unknown, malformed, operator-like, object, and tuple sort cases are covered.
- Client projection cannot make a denied sort field acceptable.

Completion evidence:

- Implemented shared sort normalization and field authorization in `packages/access-router/src/helpers/sort-policy.ts`, exported through `packages/access-router/src/helpers/index.ts`. String, object, tuple-array, and internal Map sort inputs use the same field-path syntax checks and allowed-field enforcement.
- Updated `packages/access-router/src/services/service.ts` so model `find()` and `findOne()` authorize sort fields with pre-query allowed fields for the active operation before Mongoose query execution. Dynamic document-level permissions fail closed because sort authorization uses pre-query `{}` document context.
- Updated `packages/access-router/src/model.ts` to stop silently dropping invalid sort values; invalid or denied model sort now returns controlled `Codes.BadRequest` from the service boundary.
- Updated `packages/access-router/src/services/data-service.ts`, `packages/access-router/src/interfaces/data.ts`, `packages/access-router/src/validation/data-router.ts`, `packages/access-router/src/validation/root-router.ts`, and `packages/access-router/src/routers/data-router.ts` so data and model services share sort parsing/authorization semantics, including object and tuple sort shapes for data routes.
- Added `packages/access-router/test/sort-field-authorization.integration.test.ts` covering denied `secretRank` sort for model advanced list, read-by-filter, root list/read before Mongoose `find`/`findOne`, matching data/model rejection semantics, operator-like/malformed fields, object and tuple sort forms, multi-field ordering, and client projection not making denied sort fields acceptable.
- Updated `packages/access-router/test/data-router.test.ts` for the new supported object-sort contract while preserving denied-field rejection coverage.
- Pre-work `git status --short`: existing unrelated ART-01/ART-02/ART-03 changes were present in `packages/access-router/src/core.ts`, `packages/access-router/src/services/base.ts`, `packages/access-router/src/services/model-subdocument-service.ts`, `packages/access-router/src/services/public-service.ts`, `packages/access-router/test/cross-resource-authorization.integration.test.ts`, `packages/access-router/test/read-list-fallback-authorization.integration.test.ts`, `packages/access-router/test/subdocument-populate-authorization.integration.test.ts`, and this untracked task document. `CHANGELOG.md` was not edited for ART-04.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/sort-field-authorization.integration.test.ts` passed, 1 file and 3 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/data-router.test.ts` passed, 1 file and 22 tests.
- Verification passed after rerun with a longer timeout: `pnpm --filter @web-ts-toolkit/access-router test` passed, 40 files and 334 tests. The first full-suite attempt was killed by the 120s tool timeout before completion.

### Task ART-05: Correct Distinct Parent-And-Child Field Authorization

Status: completed

Priority: P0

Suggested agent: field-path policy agent

Dependencies: ART-04 shared field-path helper

Primary ownership:

- `packages/access-router/src/services/service.ts`
- Shared field-path authorization helpers
- Distinct direct/root integration tests

Finding:

`authorizeDistinctField()` permits both ancestor and descendant matches. If only `profile.public` is readable, `allowed.startsWith(field + '.')` authorizes `distinct('profile')`, and MongoDB can return complete embedded values containing denied siblings such as `profile.secret`.

References:

- `packages/access-router/src/services/service.ts:909-965`
- `packages/access-router/test/distinct-field-authorization.integration.test.ts`
- `packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts`

Implementation requirements:

1. Make field containment directional: an allowed descendant must never authorize its parent.
2. Require exact authorization for object-valued distinct paths unless a proven serializer can remove denied descendants from scalar/database results.
3. Reuse the shared field-path policy from ART-04 rather than adding another path comparison.
4. Preserve deterministic behavior for dynamic permission functions.

Acceptance criteria:

- With `profile.public` allowed and `profile.secret` denied, `distinct('profile')` and `distinct('profile.secret')` fail closed.
- `distinct('profile.public')` succeeds through direct GET/POST and root operations.
- No returned distinct value contains a denied sibling.
- Existing scalar distinct behavior remains compatible.

Completion evidence:

- Implemented shared exact field-path authorization in `packages/access-router/src/helpers/sort-policy.ts`: `isValidFieldPath()` centralizes ART-04 path syntax validation and `isFieldAllowed()` checks exact allowed-field membership with the existing `id`/`_id` allowance.
- Updated `packages/access-router/src/services/service.ts`: distinct field validation now reuses `isValidFieldPath()`, and `authorizeDistinctField()` requires exact read-field authorization instead of accepting ancestor or descendant matches. An allowed child such as `profile.public` no longer authorizes parent distinct on `profile`, and an allowed parent is not used to infer child distinct authorization.
- Added ART-05 coverage in `packages/access-router/test/distinct-field-authorization.integration.test.ts`: with `profile.public` allowed and `profile.secret` denied, direct GET rejects `distinct('profile')`, root rejects `distinct('profile')` and `distinct('profile.secret')`, and direct GET, direct POST, and root allow `distinct('profile.public')` without returning denied sibling values. Existing scalar distinct coverage remains in the same file, and existing dynamic root distinct coverage remains in `packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts`.
- Pre-work `git status --short`: existing unrelated ART-01 through ART-04 changes were present in multiple `packages/access-router/src/**` and `packages/access-router/test/**` files, plus this untracked task document. `CHANGELOG.md` was not edited for ART-05.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router build`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/distinct-field-authorization.integration.test.ts test/arf12-root-distinct.authorization.integration.test.ts` passed, 2 files and 13 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 40 files and 337 tests.

## Wave 2: Correctness And Resource Bounds

### Task ART-06: Replace Include Count/List Truncation And Quadratic Matching

Status: completed

Priority: P1

Suggested agent: relation execution agent

Dependencies: ART-03

Primary ownership:

- `packages/access-router/src/services/base.ts`
- A dedicated authorized relation/grouped-count helper
- Include correctness and scaling tests

Finding:

Count includes fetch target rows with `find()` and count them in memory. Client `args.limit` and the target `listHardLimit` can truncate the fetched set, silently undercounting. List includes have the same completeness ambiguity. Matching rescans all fetched rows for every source document, producing `O(source x target)` work.

References:

- `packages/access-router/src/services/base.ts:303-381`
- `packages/access-router/src/services/service.ts:323-448`
- `packages/access-router/test/service.internal.test.ts`

Implementation requirements:

1. Define include list and count cardinality semantics explicitly.
2. Implement count through an authorized grouped-count primitive that is not affected by list pagination.
3. Reject or ignore client pagination fields for count according to the documented contract; do not silently alter counts.
4. Index target rows/counts by a canonical foreign-key representation rather than rescanning for each source row.
5. Preserve target operation, row, and field policy established by ART-03.

Acceptance criteria:

- Counts remain exact above target `listHardLimit` and cannot be changed by include `args.limit`.
- Multiple source keys and array-valued local/foreign fields retain correct matching semantics.
- A deterministic operation-count test demonstrates approximately linear matching work.
- Public docs/OpenAPI describe list truncation if list includes intentionally remain bounded.

Completion evidence:

- Implemented in `packages/access-router/src/services/base.ts` and `packages/access-router/src/services/service.ts`: count includes now use a single authorized grouped-count primitive (`countByFieldValues`) that applies the target `count` filter and Mongo aggregation instead of list pagination or per-source scans. Count include `args.limit` and other pagination fields are ignored by that path, so counts remain exact under the documented count contract.
- Updated include list matching in `packages/access-router/src/services/base.ts` to build a canonical foreign-key index once per fetched target list and reuse it for source rows. Array-valued source and foreign fields retain intersection matching while avoiding `O(source x target)` rescans. Read includes continue using the ART-03 read-semantic path.
- Documented the ART-06 cardinality contract in `packages/access-router/README.md`: count includes are exact and ignore pagination; list includes intentionally remain bounded by target list pagination and `listHardLimit`. Added matching OpenAPI schema description in `packages/access-router/src/validation/common.ts`.
- Updated tests in `packages/access-router/test/service.internal.test.ts` for grouped-count dispatch, canonical grouped-count keys, exact count behavior despite include `args.limit`, source/target array matching, and deterministic linear list-matching evidence. Updated `packages/access-router/test/cross-resource-authorization.integration.test.ts` to assert count includes execute the new aggregate primitive while preserving target count guard, row filter, and numeric cardinality.
- Pre-work `git status --short`: existing unrelated ART-01 through ART-05 changes were present in multiple `packages/access-router/src/**` and `packages/access-router/test/**` files, plus this untracked task document. `CHANGELOG.md` was not edited for ART-06.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service.internal.test.ts` passed, 1 file and 6 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/cross-resource-authorization.integration.test.ts test/service.internal.test.ts` passed, 2 files and 19 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed after updating the stale ART-03 expectation for aggregate-backed count includes: `pnpm --filter @web-ts-toolkit/access-router test` passed, 40 files and 341 tests.

### Task ART-07: Bound Default Data-List Output And Hook Concurrency

Status: completed

Priority: P1

Suggested agent: data-service resource agent

Dependencies: ART-04

Primary ownership:

- `packages/access-router/src/runtime.ts`
- `packages/access-router/src/helpers/query.ts`
- `packages/access-router/src/services/data-service.ts`
- `packages/access-router/src/http/response-pipelines/data-response.ts`
- Data-service resource tests

Finding:

Model routers default `listHardLimit` to 1000, but data-router defaults omit it. When no data hard limit or request limit exists, pagination returns an undefined limit, the complete matched collection is sliced, and trim/decorate phases create one promise per returned row.

References:

- `packages/access-router/src/runtime.ts:53-62`
- `packages/access-router/src/runtime.ts:156-169`
- `packages/access-router/src/helpers/query.ts:13-51`
- `packages/access-router/src/services/data-service.ts:86-147`
- `packages/access-router/src/http/response-pipelines/data-response.ts:6-22`

Implementation requirements:

1. Give data routers a documented finite default hard limit.
2. Make `genPagination()` reject or defensively resolve an absent/invalid hard limit without producing an undefined limit.
3. Bound per-row trim and decorate concurrency using a configurable/shared scheduler.
4. Keep `totalCount` based on the complete authorized match set while shaping only returned rows.
5. Document the default and any new concurrency option.

Acceptance criteria:

- A 10,000-row data router with no explicit hard limit returns no more than the documented default.
- Omitted and malformed limits cannot create an unbounded response.
- Instrumented hooks prove peak concurrency stays at or below the configured bound.
- Ordering, returned count, total count, and page-sized shaping remain correct.

Completion evidence:

- Implemented in `packages/access-router/src/runtime.ts` and `packages/access-router/src/helpers/query.ts`: data routers now default `listHardLimit` to the shared finite default of `1000`, and `genPagination()` defensively falls back to that default when a trusted service call supplies an absent or invalid hard limit.
- Added `packages/access-router/src/helpers/concurrency.ts` and reused it from `packages/access-router/src/services/service.ts`, `packages/access-router/src/services/data-service.ts`, and `packages/access-router/src/http/response-pipelines/data-response.ts`. Data list trimming and per-row decorate hooks now run through `requestComplexity.maxHookConcurrency` (default `10`) while preserving `totalCount` over the full authorized match set and shaping only returned rows.
- Documented the data-router default hard limit and hook concurrency option in `packages/access-router/README.md`. `CHANGELOG.md` was not edited for ART-07 per maintainer instruction.
- Added ART-07 coverage in `packages/access-router/test/data-service-hot-path.test.ts` for a 10,000-row uncapped request returning the default 1,000 rows with full `totalCount`, malformed router/request limits not producing unbounded output, and instrumented decorate hook peak concurrency staying at or below `maxHookConcurrency` while preserving order and page metadata.
- Pre-work `git status --short`: clean.
- Verification passed after rebuild: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/data-service-hot-path.test.ts` passed, 1 file and 7 tests.
- Verification passed after metadata compatibility fix: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/data-service-hot-path.test.ts test/data-router.test.ts` passed, 2 files and 29 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 40 files and 344 tests.

### Task ART-08: Bound Bulk Parsing And Nested Subquery Scheduling

Status: completed

Priority: P1

Suggested agent: request-concurrency agent

Dependencies: ART-01

Primary ownership:

- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/helpers/index.ts`
- Request-scoped concurrency helper
- Bulk/subquery complexity tests

Finding:

Bulk create reads `maxBulkConcurrency`, but parses all items through unrestricted `Promise.all()`. `parseClientData()` can execute database-backed `$$sq` operations, and recursive arrays create additional unrestricted promise fan-out before bounded validation/preparation begins.

References:

- `packages/access-router/src/services/service.ts:450-477`
- `packages/access-router/src/services/service.ts:483-572`
- `packages/access-router/src/helpers/index.ts:78-101`
- `packages/access-router/src/services/base.ts:384-438`
- `packages/access-router/src/request-complexity.ts:4-24`

Implementation requirements:

1. Route bulk parsing through a bounded mapper.
2. Use one request-scoped scheduler so nested arrays and subqueries cannot multiply concurrency beyond the configured budget.
3. Preserve input order and stable error indexing.
4. Stop later mutation phases after parse failure; no validation/prepare/persist hooks may run for a rejected request.
5. Keep depth/node/subquery-count budgets independent from the concurrency budget.

Acceptance criteria:

- With `maxBulkConcurrency: 3`, delayed target subqueries never exceed three simultaneous calls across all bulk items and nested arrays.
- Parse failures return stable indexed errors and cause zero prepare/persist calls.
- Valid bulk output order remains input order.
- Repeated runs are deterministic.

Completion evidence:

- Implemented request-scoped bulk parse scheduling in `packages/access-router/src/helpers/concurrency.ts`, `packages/access-router/src/helpers/index.ts`, `packages/access-router/src/services/base.ts`, and `packages/access-router/src/services/service.ts`: `RequestConcurrencyScheduler` now bounds parse traversal and subquery execution through the same `maxBulkConcurrency` budget, including nested arrays, while preserving result order.
- Updated bulk create parsing in `packages/access-router/src/services/service.ts` to collect client-request parse errors by stable input index and return before validation, prepare, model create, after-persist, or decorate phases run.
- Added ART-08 coverage in `packages/access-router/test/service.internal.test.ts`: delayed nested subqueries with `maxBulkConcurrency: 3` never exceed three simultaneous target calls, parsed output order matches input order, and bulk parse failures return indexed errors with zero validation/prepare/persist calls. The internal test imports edited `.ts` modules explicitly because extensionless imports resolve to stale sibling `src/*.js` files in this package.
- Pre-work `git status --short`: clean.
- `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service.internal.test.ts` passed, 1 file and 8 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 40 files and 346 tests.

## Wave 3: Encapsulation, Reuse, And Public Contracts

### Task ART-09: Make Runtime Model Ownership Internally Consistent

Status: completed

Priority: P1

Suggested agent: runtime ownership agent

Dependencies: Wave 1 complete

Primary ownership:

- `packages/access-router/src/runtime.ts`
- `packages/access-router/src/model.ts`
- Model registration and router construction paths
- Runtime-isolation tests and docs

Finding:

`hasModelInstance()` checks only the runtime registry, while `getModelInstance()` and `Model` fall back to `mongoose.models`. An isolated runtime can report that it does not own a model yet resolve and operate on a process-global model, making behavior depend on registration order and connection-global state.

References:

- `packages/access-router/src/runtime.ts:171-202`
- `packages/access-router/src/runtime.ts:269-305`
- `packages/access-router/src/model.ts:42-52`
- `packages/access-router/test/runtime-isolation.integration.test.ts`

Implementation requirements:

1. Define runtime ownership as one invariant used by `has`, `get`, metadata, service, and router construction.
2. Prefer registry-only lookup for isolated runtimes.
3. If model-name compatibility resolves a global model, register that exact instance atomically during construction or confine fallback to `defaultRuntime`.
4. Fail predictably before request handling when an isolated runtime lacks a model.
5. Update README/llms runtime-isolation guidance with the final contract.

Acceptance criteria:

- A globally registered model is not silently acquired by a fresh isolated runtime unless the documented compatibility rule explicitly performs registration.
- Two runtimes with same-name models cannot resolve each other's connection.
- `hasModelInstance()` and `getModelInstance()` agree about ownership.
- Default-runtime model-name usage remains covered.

Completion evidence:

- Implemented in `packages/access-router/src/runtime.ts` and `packages/access-router/src/model.ts`: isolated runtimes now use registry-only model lookup for `hasModelInstance()`, `getModelInstance()`, metadata construction, router construction, and service model adapters. Missing isolated-runtime models throw a deterministic registry-missing error during router/options construction before request handling.
- Preserved default-runtime string model-name compatibility by constructing `defaultRuntime` with global lookup enabled. When `acl` resolves a global `mongoose.model(name, schema)`, it registers that exact global model instance into the runtime registry so subsequent `hasModelInstance()` and `getModelInstance()` agree.
- Added ART-09 coverage in `packages/access-router/test/runtime-isolation.integration.test.ts`: a fresh isolated runtime does not acquire a global model by string name and fails predictably until explicit registration; default `acl` adopts a global model by name; existing same-name separate-connection runtime tests continue to prove isolated runtimes do not resolve each other's model instances.
- Updated isolated-runtime fixtures in affected tests to pass the actual `mongoose.Model` instance rather than relying on process-global string-name lookup, preserving the new ownership contract across OpenAPI, subdocument, distinct, and populate coverage.
- Documented the final runtime ownership contract in `packages/access-router/README.md` and fixed the isolated-runtime ordering/guidance in `packages/access-router/llms.txt`.
- Pre-work `git status --short`: clean.
- `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router build`.
- Verification passed after updating isolated-runtime fixtures: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/arf12-new-route-denial.integration.test.ts test/arf12-root-distinct.authorization.integration.test.ts test/model-router.integration.test.ts test/model-subdocument-routes.integration.test.ts test/openapi-collision.test.ts test/openapi.test.ts test/subdocument-populate-authorization.integration.test.ts test/runtime-isolation.integration.test.ts` passed, 8 files and 83 tests. Before those fixture updates, the full package test failed because legacy isolated-runtime tests still used string-name global lookup, which ART-09 intentionally removed.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 40 files and 348 tests.

### Task ART-10: Define Configuration And In-Memory Data Ownership

Status: completed

Priority: P2

Suggested agent: configuration encapsulation agent

Dependencies: ART-09

Primary ownership:

- `packages/access-router/src/options/manager.ts`
- Runtime option getters/setters and derived permission metadata
- Data-router configuration ownership
- Focused ownership tests

Finding:

`OptionsManager.assign()` retains nested objects by reference and `fetch()` returns a shallow copy. Callers can mutate live request budgets, permission schemas, hooks, and data arrays without runtime setters. Nested `set()` operations may bypass the top-level `permissionSchema` listener that recomputes derived permission-key metadata.

References:

- `packages/access-router/src/options/manager.ts:30-79`
- `packages/access-router/src/runtime.ts:231-305`
- `packages/access-router/src/services/data-service.ts:27-38`

Implementation requirements:

1. Document and enforce ownership for option objects and in-memory data.
2. Clone/freeze safe configuration data on ingress and snapshots on egress, or expose intentional mutation through dedicated APIs.
3. Do not clone functions or Mongoose model instances in a way that changes identity/behavior.
4. Ensure supported nested permission updates atomically recompute all derived metadata.
5. Define whether data-router records are a live store or an immutable configured snapshot and test that contract.

Acceptance criteria:

- Mutating the original options object or a fetched snapshot cannot silently change runtime policy.
- Supported setter calls update policy and derived model-permission keys together.
- Concurrent requests cannot observe a partially updated permission configuration.
- Data ownership behavior is explicit in types/docs and covered by tests.

Completion evidence:

- Implemented in `packages/access-router/src/options/manager.ts`: option assignment and setter ingress now deep-clone array/plain-object configuration while preserving function identities and the existing logger object identity contract; fetched option snapshots are cloned and frozen so callers cannot mutate live runtime policy through getter results. Nested setter calls replace the top-level option atomically, so listeners observe one complete updated value instead of a partial nested mutation.
- Implemented in `packages/access-router/src/runtime.ts`: model permission metadata recomputation is centralized and now runs for both `permissionSchema` changes and `modelPermissionPrefix` changes. Nested supported updates such as `permissionSchema.secret` recompute `_permissionSchemaKeys`, `_globalPermissionKeys`, and `_modelPermissionKeys` together.
- Documented in `packages/access-router/src/interfaces/root.ts` and `packages/access-router/README.md`: in-memory data-router records are owned as immutable configured snapshots. Mutating the original `data` array/records or fetched options snapshots does not change served records; callers replace configured data intentionally through `router.data(next)` or `setDataOption(name, 'data', next)`.
- Added `packages/access-router/test/options-ownership.test.ts` covering original-option mutation isolation, frozen fetched snapshots, function/logger identity preservation, nested permission-schema setter metadata refresh, nested setter ingress cloning, and data-router snapshot replacement semantics.
- Pre-work `git status --short`: clean.
- `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router build`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/options-ownership.test.ts test/data-router.test.ts` passed, 2 files and 25 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 41 files and 351 tests.

### Task ART-11: Introduce A Testable Model Adapter Seam

Status: completed

Priority: P2

Suggested agent: service architecture agent

Dependencies: ART-03, ART-04, ART-06

Primary ownership:

- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/model.ts`
- Internal adapter/factory types
- Focused service unit tests

Finding:

The 1,100-line `Service` class constructs `Model` directly and combines persistence, authorization, include execution, mutation orchestration, hooks, logging, and result assembly. Tests reach protected state with casts to replace the adapter, preventing focused and reusable policy testing.

References:

- `packages/access-router/src/services/service.ts:139-1133`
- `packages/access-router/src/services/service.ts:196-204`
- `packages/access-router/test/service.internal.test.ts:25-35`

Implementation requirements:

1. Introduce a narrow internal model-adapter interface and constructor/factory injection point.
2. Preserve the public `Service` API and default Mongoose adapter.
3. Extract only cohesive logic already stabilized by earlier tasks, starting with include execution or mutation orchestration.
4. Keep ACL resolution and public result serialization at shared boundaries.
5. Avoid a framework-wide dependency-injection abstraction.

Acceptance criteria:

- Find/create/update/include orchestration can be unit-tested with an in-memory fake adapter and no global Mongoose model.
- Service tests no longer use double casts to overwrite protected adapter state.
- Public declarations do not expose accidental internal adapter types.
- Integration behavior and package tests remain unchanged.

Completion evidence:

- Implemented in `packages/access-router/src/model.ts`, `packages/access-router/src/services/service.ts`, and `packages/access-router/src/services/public-service.ts`: `model.ts` now defines a narrow source-level `ModelAdapter` contract, the Mongoose-backed `Model` exposes `mongooseModel` and `aggregate()` through that seam, and `Service` constructs persistence and option dependencies through protected factory methods while preserving the public constructor and default Mongoose behavior.
- Updated `packages/access-router/test/service.internal.test.ts`: adapter-focused service tests now inject an in-memory fake adapter and test options through a test subclass/factory instead of double-casting into protected `model` state. The upsert, grouped-count, and bulk-parse tests assert adapter calls directly through fakes without requiring a global Mongoose model for those service units.
- Verified built declarations do not export or name `ModelAdapter` from the public entry declarations; `grep "ModelAdapter|createModelAdapter" packages/access-router/dist/*.d.ts` only finds the protected `createModelAdapter(...): any` seam in the internal declaration chunk, with no accidental adapter type export.
- Worktree check during verification: `git status --short` showed only ART-11 source/test edits; `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service.internal.test.ts` passed, 1 file and 8 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 41 files and 351 tests.

### Task ART-12: Correct The Processor Output Type And Error Documentation

Status: completed

Priority: P1

Suggested agent: TypeScript package API agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/processors.ts`
- `/processors` declaration/type tests
- Processor README/llms examples

Finding:

`copyAndDepopulate<T>()` returns `T` even though it replaces populated objects with IDs and adds destination fields. Consumers can compile object property access that fails at runtime. Its shipped JSDoc also says failures throw `ProcessorPathError`, but no such class exists; runtime throws plain `Error`.

References:

- `packages/access-router/src/processors.ts:3-52`
- `packages/access-router/src/processors.ts:81-180`
- `packages/access-router/test/strict-consumer-types.test.ts:134-136`
- `packages/access-router/README.md` processor example

Implementation requirements:

1. Define an honest output type, such as an explicit output generic or conservative transformed-record type.
2. Do not default to the unchanged input shape when operations alter it.
3. Keep mutable and immutable modes value-type equivalent while preserving their identity semantics.
4. Correct JSDoc to name the actual thrown type, or introduce/export a real typed error only if consumers need discrimination.
5. Verify source JSDoc survives in `dist/processors.d.ts` and `.d.mts`.

Acceptance criteria:

- A packed-consumer type test cannot treat a depopulated leaf as its original populated object without an explicit assertion.
- Consumers can annotate the intended transformed output usefully.
- Runtime error tests and declaration JSDoc agree on the thrown error contract.
- README examples compile against the packed declarations and match runtime values.

Completion evidence:

- Implemented in `packages/access-router/src/processors.ts`: `copyAndDepopulate()` now defaults to conservative `CopyAndDepopulateOutput = Record<string, unknown>` instead of the input object shape, and accepts an explicit output type argument for callers that know the transformed result. Mutable and immutable runtime behavior is unchanged.
- Corrected processor JSDoc in source and published declarations to document plain `Error` for unsafe paths and missing id fields; no nonexistent `ProcessorPathError` remains in processor docs or generated declarations.
- Updated installed-consumer docs in `packages/access-router/README.md` and `packages/access-router/llms.txt` to show explicit transformed output typing and the conservative default. `CHANGELOG.md` was not edited per maintainer instruction.
- Added/updated type and declaration coverage in `packages/access-router/test/strict-consumer-types.test.ts`, `packages/access-router/test/export-contract.test.ts`, and `packages/access-router/test/packed-consumer-compatibility.test.ts`: strict consumers cannot access a depopulated leaf as its old populated object shape without an explicit assertion, consumers can type the transformed output, and `dist/processors.d.ts` plus `dist/processors.d.mts` retain the output type and `@throws Error` JSDoc.
- Pre-work `git status --short`: clean.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router build`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/processors.test.ts test/processors-path-hardening.test.ts test/export-contract.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts` passed, 5 files and 86 tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts --testNamePattern "supports minimum peers|supports current majors"` passed, 1 file with 4 executed tests and 2 skipped tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `git diff --check`.
- Verification passed after fixing the documentation snippet and packed-consumer smoke annotations found by an earlier failing run: `pnpm --filter @web-ts-toolkit/access-router test` passed, 41 files and 352 tests.

## Wave 4: Verification And Test Architecture

### Task ART-13: Repair Installed Documentation And Execute Complete Workflows

Status: completed

Priority: P1

Suggested agent: documentation verification agent

Dependencies: ART-09, ART-12

Primary ownership:

- `packages/access-router/llms.txt`
- `packages/access-router/README.md`
- `packages/access-router/test/documentation-examples.test.ts`

Finding:

The isolated-runtime `llms.txt` block calls `runtime.createRouter('User', ...)` before creating/registering `UserModel`, which throws `MissingSchemaError`. The documentation suite's title says examples execute, but it only runs TypeScript semantic compilation.

References:

- `packages/access-router/llms.txt:44-54`
- `packages/access-router/src/runtime.ts:269-298`
- `packages/access-router/test/documentation-examples.test.ts:230-286`

Implementation requirements:

1. Create/register the model before router construction, preferably by passing the model instance to the isolated runtime.
2. Classify snippets as complete executable workflows or intentionally partial fragments.
3. Execute complete workflows against the staged packed package with controlled Express/Mongoose fixtures.
4. Keep semantic compilation for all snippets and provide declarations only for explicitly partial examples.

Acceptance criteria:

- The isolated-runtime block executes without `MissingSchemaError` and uses the intended runtime/model instance.
- At least every block presented as a complete workflow receives a runtime smoke test.
- Unsupported imports, names, and call signatures still fail semantic checks.
- Installed README/llms guidance agrees with ART-09's ownership contract.

Completion evidence:

- Implemented in `packages/access-router/llms.txt` and `packages/access-router/README.md`: TypeScript snippets are explicitly classified with `doc-example` markers as `partial` or `complete-runtime`. Isolated-runtime guidance now constructs/registers through the intended `mongoose.Model` instance path before router construction, matching ART-09's runtime ownership contract and avoiding `MissingSchemaError`.
- Implemented in `packages/access-router/test/documentation-examples.test.ts`: the documentation suite still performs strict semantic compilation for every snippet against the staged installed package, now enforces explicit snippet classification, and emits/executes every `complete-runtime` workflow in a separate Node process against the staged packed package.
- Pre-work `git status --short`: clean.
- `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts` passed, 1 file and 16 tests.
- Verification passed after rebuild: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `git diff --check`.
- Verification passed after rebuild: `pnpm --filter @web-ts-toolkit/access-router test` passed, 41 files and 357 tests.

### Task ART-14: Strengthen Declaration And Minimum-Node Verification

Status: completed

Priority: P2

Suggested agent: package compatibility agent

Dependencies: ART-12, ART-13

Primary ownership:

- Packed-consumer compatibility tests
- CI runtime matrix
- Strict consumer declaration checks

Finding:

Consumer checks universally set `skipLibCheck: true`, so they do not prove the emitted declaration graph is internally valid. The package declares Node `>=22`, but all runtime smoke tests use the ambient Node version rather than the minimum supported major.

References:

- `packages/access-router/package.json:56-58`
- `packages/access-router/test/packed-consumer-compatibility.test.ts:471-524`
- `packages/access-router/test/strict-consumer-types.test.ts:168-185`
- `packages/access-router/test/documentation-examples.test.ts:252-267`

Implementation requirements:

1. Compile all root, `/advanced`, and `/processors` declarations from an installed tarball with `skipLibCheck: false` in at least one NodeNext and one Bundler verification path.
2. Keep faster checks only where full declaration checking would be redundant.
3. Run packed ESM and CJS smoke consumers under Node 22 in CI.
4. Keep the peer-version matrix separate from the minimum-Node smoke to avoid unnecessary matrix explosion.

Acceptance criteria:

- A malformed emitted declaration makes packed verification fail.
- Root and both subpaths compile with full declaration checking.
- Packed CJS and ESM entrypoints execute under Node 22.
- CI visibly enforces the same floor declared by `engines.node`.

Completion evidence:

- Implemented in `packages/access-router/test/packed-consumer-compatibility.test.ts`: current-peer packed tarball and build-artifact consumers now compile root, `/advanced`, and `/processors` imports through both NodeNext and Bundler configs with `skipLibCheck: false`, so malformed emitted declarations fail installed-consumer verification. Minimum-peer checks keep runtime ESM/CJS smoke and TypeScript import checks with lib checking skipped because Mongoose 8.0.0's own declarations fail under the repository's current Node type definitions independently of access-router's emitted declaration graph.
- Implemented in `packages/access-router/src/model.ts`: public declaration output for the internal `Model` wrapper now uses Mongoose 8-compatible `Query<Result, Doc>` return types instead of emitting Mongoose 9-only six-argument `Query` instantiations.
- Implemented in `.github/workflows/test.yml`: added `access-router-minimum-node-smoke`, which rewrites `.tool-versions` to Node `22.20.0`, installs normally, prints the runtime versions, and runs the packed minimum-peer access-router ESM/CJS/NodeNext/Bundler consumer smoke separately from the peer-version matrix.
- Pre-verification `git status --short`: only intended ART-14 edits were present in `.github/workflows/test.yml` and `packages/access-router/test/packed-consumer-compatibility.test.ts`; `packages/access-router/src/model.ts` was added after the new full declaration check exposed the Mongoose 8 compatibility issue. `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed after the model declaration fix: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts --testNamePattern "supports minimum peers from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers|supports current majors from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers"` passed, 1 file with 2 executed tests and 4 skipped tests.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts` passed, 1 file and 6 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 41 files and 357 tests.

### Task ART-15: Replace Wall-Clock Gates With Deterministic Performance Evidence

Status: completed

Priority: P2

Suggested agent: performance-test agent

Dependencies: ART-07, ART-08

Primary ownership:

- `packages/access-router/test/data-service-scaling.test.ts`
- Deterministic hook/cardinality/concurrency instrumentation
- Optional non-gating benchmark

Finding:

The scaling suite asserts absolute HTTP timing ceilings and picks the fastest trial. Its counterfactual does not apply the same filter; it trims the entire dataset, so the test can flake under load or pass a real regression on a fast host without proving the stated algorithmic property.

References:

- `packages/access-router/test/data-service-scaling.test.ts:86-137`
- `packages/access-router/test/data-service-scaling.test.ts:140-215`
- `packages/access-router/test/data-service-hot-path.test.ts`

Implementation requirements:

1. Replace correctness gates based on milliseconds with operation counts and peak-concurrency assertions.
2. Prove that only returned rows enter trim/decorate while all authorized matches contribute to total count.
3. If timing evidence is retained, move it to a non-gating benchmark comparing identical filtered workloads and report distributions/ratios.
4. Avoid best-of sampling as a correctness assertion.

Acceptance criteria:

- Correctness is independent of host speed, scheduler load, JIT warm-up, and garbage collection.
- A full-match shaping regression fails deterministic cardinality assertions.
- Benchmark and production paths use the same precomputed or equivalent filtered match set.
- The package suite remains stable under repeated execution.

Completion evidence:

- Updated `packages/access-router/test/data-service-scaling.test.ts`: removed `performance.now()` ceilings, best-of sampling, and timing comparisons. The scaling suite now asserts deterministic `totalCount`, `returnedCount`, dynamic field-trim call counts, decorate call counts, and peak trim/decorate concurrency for page sizes 10, 50, and 100.
- Added a shared `matchingComplexFilter()` counterfactual fixture so the production request and diagnostic full-match trim use the same equivalent filtered match set. The diagnostic route still uses the production `req.dacl.pickAllowedFields()` trim helper and proves a full-match shaping regression would trim `matched.length` rows instead of the returned page.
- `CHANGELOG.md` was not edited per maintainer instruction.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/data-service-scaling.test.ts` passed, 1 file and 2 tests.
- Verification passed: `git diff --check`.
- Verification passed: `pnpm --filter @web-ts-toolkit/access-router test` passed, 41 files and 357 tests.
- Verification passed after rerunning serialized to avoid the documented shared `dist/` build race: `pnpm --filter @web-ts-toolkit/access-router typecheck`. An earlier concurrent typecheck attempt overlapped with the full package test and failed in `@web-ts-toolkit/express-response-handler` tsup declaration cleanup (`ENOENT unlink dist/error-format.d.mts`), matching the repository warning against concurrent package build/test scripts.

### Task ART-16: Remove Process-Global Test Coupling And Restore Parallelism

Status: pending

Priority: P2

Suggested agent: test-infrastructure agent

Dependencies: ART-09, ART-10, ART-11

Primary ownership:

- `packages/access-router/test/setup.ts`
- Mongo-backed test fixtures
- `packages/access-router/vitest.config.ts`
- Runtime/model cleanup helpers

Finding:

Vitest disables file parallelism because files share singleton `mongoose.connection`, global model names, default-runtime option registries, and database cleanup. Serial execution hides ownership defects and lengthens feedback cycles.

References:

- `packages/access-router/vitest.config.ts:3-9`
- `packages/access-router/test/setup.ts:7-29`
- `packages/access-router/test/global-setup.ts:3-7`
- Mongo-backed integration fixtures throughout `packages/access-router/test/**`

Implementation requirements:

1. Give each suite/file an isolated connection or database name, isolated `AccessRuntime`, and registered model instances.
2. Close resources in fixture teardown even when tests fail.
3. Reserve default-runtime/global-model fixtures for tests explicitly verifying compatibility behavior.
4. Remove `fileParallelism: false` only after repeated multi-worker runs are stable.
5. Do not parallelize workspace package scripts that rebuild shared `dist/`; this task concerns Vitest files inside one already-built package run.

Acceptance criteria:

- The package suite passes repeatedly with Vitest file parallelism enabled.
- No suite can disconnect another suite, delete its model, clear its records, or collide in OpenAPI registration.
- Test duration and worker count are recorded before/after.
- Repository `pnpm test` remains serialized at the package-script level as required by `AGENTS.md`.

## Dependency And Parallelization Guidance

| Wave | Tasks            | Guidance                                                                                                                                     |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | ART-01 to ART-05 | ART-01 and ART-04 may start in parallel. ART-02/03 follow ART-01. ART-05 follows ART-04.                                                     |
| 2    | ART-06 to ART-08 | ART-06 follows ART-03. ART-07 follows ART-04. ART-08 may run independently after ART-01.                                                     |
| 3    | ART-09 to ART-12 | ART-09 and ART-12 may run in parallel. ART-10 follows ART-09. ART-11 waits for service hotspots in ART-03/04/06.                             |
| 4    | ART-13 to ART-16 | ART-13 follows runtime/processor contracts. ART-14 follows public API/docs. ART-15 follows resource changes. ART-16 follows ownership seams. |

Shared hotspots:

- `src/services/base.ts`: sequence ART-03 before ART-06.
- `src/services/service.ts`: sequence ART-04/05 and ART-08 before ART-11.
- `src/runtime.ts`: sequence ART-07 before ART-09/10 when changes overlap.
- `test/packed-consumer-compatibility.test.ts`, generated `dist/`, and workspace dependency builds must not be modified/tested concurrently.

Recommended agent allocation:

| Agent                           | Tasks                          |
| ------------------------------- | ------------------------------ |
| Authorization specialist        | ART-01, ART-02, ART-03         |
| Field-policy specialist         | ART-04, ART-05                 |
| Performance/resource specialist | ART-06, ART-07, ART-08, ART-15 |
| Runtime/architecture specialist | ART-09, ART-10, ART-11         |
| Package/test specialist         | ART-12, ART-13, ART-14, ART-16 |
| Independent reviewer            | ART-99                         |

## Deferred Decisions Requiring Maintainer Input

These do not block regression tests, but the owning task must record the selected contract before implementation is marked complete:

1. ART-01: whether denied read-to-list fallback returns concealment-style `404` or authorization-style `401/403`.
2. ART-06: whether list includes promise complete relation materialization or explicitly bounded/truncated results.
3. ART-09: whether model-name global lookup remains supported only by `defaultRuntime` or is atomically adopted by any runtime.
4. ART-10: whether data-router arrays are intentional live mutable stores or immutable configuration snapshots.
5. ART-12: whether processor errors need a new exported typed class or corrected plain-`Error` documentation.

## Final Integration Review

### Task ART-99: Independently Verify Remediation Completion

Status: pending

Priority: P0 release gate

Suggested agent: senior reviewer who did not implement most tasks

Dependencies: ART-01 through ART-16 complete or explicitly deferred with maintainer approval

Primary ownership:

- Independent review and focused integration corrections only
- Return substantial defects to their owning tasks

Review requirements:

1. Verify every acceptance criterion against runtime behavior, not completion notes.
2. Re-test read/list fallback, include, populate, subdocument populate, subquery, direct, and root authorization boundaries.
3. Confirm sort and distinct cannot expose denied fields through ordering, first-row selection, ancestor paths, or raw database values.
4. Confirm request-controlled collection and recursive work has response-size, item-count, and concurrency bounds.
5. Confirm isolated runtime model ownership and option/data ownership match public docs.
6. Inspect packed declarations, README, llms, CJS/ESM behavior, and Node 22 compatibility.
7. Confirm no internal service/query/context data crosses public HTTP serializers.
8. Review all security/contract changes for consumer-facing release notes.

Required verification:

```sh
git diff --check
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test
pnpm lint
pnpm build
pnpm test
pnpm build-artifact -- --version 0.99.0-test
pnpm verify-artifact -- --version 0.99.0-test
```

Acceptance criteria:

- No unresolved P0 or P1 finding remains.
- All required commands pass, or a maintainer-approved exception records owner, rationale, and residual risk.
- Packed ESM, CJS, NodeNext, Bundler, full declarations, and Node 22 consumers pass.
- Security and externally visible contract changes are present in release notes.
- Completion evidence lists changed files, command results, and every P2/P3 deferral.

## Definition Of Done

- Switching operations never bypasses the newly selected operation's guard, row filter, field policy, or hooks.
- Cross-resource include and all populate variants authorize target runtime, operation, rows, and fields consistently.
- Sort and distinct path containment cannot reveal denied values.
- Include counts are exact under documented semantics and matching avoids quadratic rescans.
- Data-list output, bulk parsing, recursive subqueries, and async hook execution have practical defaults and bounded concurrency.
- Runtime, configuration, and data ownership are explicit and testable.
- Service orchestration has a focused adapter seam without a public API rewrite.
- Processor declarations and error docs match runtime transformations.
- Installed examples execute, emitted declarations receive full checking, and Node 22 is tested.
- Performance tests assert deterministic algorithmic properties rather than host-specific timing.
- Test parallelism is restored without violating the repository's serialized package-build rule.
- An independent reviewer verifies all acceptance criteria and release gates.
