# Access Router Remediation Follow-Up

Created: 2026-08-05 19:23:00 local time

Related completed review: `docs/tasks/20260804-124249-access-router-review-remediation.md`

Package: `packages/access-router`

## Objective

Close the confirmed behavioral, security, verification, and release-readiness gaps found while auditing the completed AR-01 through AR-23 work against its original acceptance criteria and the current `git diff`.

Do not modify the related completed task file. This follow-up is the execution record for all newly confirmed work.

## Scope And Working Rules

- Preserve unrelated worktree changes and do not revert generated or consumer changes made by other sessions.
- Add a regression test that fails against the current implementation for every behavioral defect.
- Enforce request and authorization policy at shared service/validation boundaries, not only in one HTTP route.
- Keep direct, root, include, populate, and subquery behavior consistent where they share a contract.
- Do not weaken security behavior for backward compatibility without a confirmed external requirement.
- Run package tests serially. The package test script rebuilds shared workspace outputs.
- Do not mark a task complete until its targeted verification passes and completion evidence is recorded here.

## Audit Baseline

Verified on 2026-08-05 against the current worktree:

- `git diff --check`: passed.
- `pnpm --filter @web-ts-toolkit/access-router test`: passed, 29 files and 242 tests.
- `pnpm lint`: failed. Most output is under `.mongoose/**`, followed by TypeScript parser-root errors; this remains a repository release-gate failure.
- `pnpm build`: failed in `apps/mongoose-rxdb-example` with existing TypeScript errors; the access-router package build itself passed.
- The package suite still sets `fileParallelism: false` in `packages/access-router/vitest.config.ts`.
- Root `CHANGELOG.md` contains no release notes for these access-router security and contract changes.

Passing tests do not establish completion: several tests omit the adversarial case required by the original acceptance criteria.

## Priorities

- P0: authorization bypass or release-blocking security defect.
- P1: request-boundary, data exposure, correctness, or published-contract defect.
- P2: incomplete acceptance evidence, type safety, performance, or maintainability.

## Wave 1: Authorization And Request Boundaries

### Task ARF-01: Authorize Read-To-List Subquery Fallback

Status: pending

Priority: P0

Suggested agent: authorization service agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/services/base.ts`
- `packages/access-router/src/services/public-service.ts`
- `packages/access-router/test/cross-resource-authorization.integration.test.ts`

Finding:

`handleSubQuery()` authorizes target operation `read`, then calls `_read()` with its default `tryList: true`. After a read miss, `_read()` retries using `list` access without authorizing the target model's `list` operation. A caller allowed to read but denied list can therefore reach the target list row policy through a read subquery.

References:

- `packages/access-router/src/services/base.ts:398-412`
- `packages/access-router/src/services/public-service.ts:125-149`
- `packages/access-router/src/services/public-service.ts:359-365`
- `packages/access-router/test/cross-resource-authorization.integration.test.ts:204-228`

Implementation requirements:

1. Do not permit an authorized `read` dispatch to change to `list` without separately authorizing `list` on the target resource.
2. Prefer disabling fallback for cross-resource read subqueries unless fallback is an explicit documented subquery feature.
3. If fallback is retained, dispatch it through the same target-operation authorization helper and apply the target list row/field policy.
4. Preserve trusted in-process `_read()` behavior unless changing it is necessary to make the contract unambiguous.

Acceptance criteria:

- A source-authorized caller with target `read: true` and target `list: false` cannot obtain a list-scoped result after a read miss.
- Tests cover ID and filter read subqueries, both with and without a matching read-scoped document.
- The target list service is not called when its operation guard is denied.
- `pnpm --filter @web-ts-toolkit/access-router test` passes.

### Task ARF-02: Validate Complete Subquery Complexity

Status: pending

Priority: P1

Suggested agent: request-hardening agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/request-complexity.ts`
- `packages/access-router/src/services/base.ts`
- `packages/access-router/test/request-complexity.integration.test.ts`

Finding:

The complexity walker counts a `$$sq` key and then skips its complete payload. Request-controlled nested `args.include`, filters, tasks, arrays, and recursive structures inside one subquery can therefore bypass depth, node, include, and collection budgets before `_list()` or `_read()` executes.

References:

- `packages/access-router/src/request-complexity.ts:102-129`
- `packages/access-router/src/services/base.ts:398-412`
- `packages/access-router/test/request-complexity.integration.test.ts:171-200`

Implementation requirements:

1. Count each `$$sq` once while recursively validating its client-supplied payload.
2. Avoid traversing only data produced internally after service resolution; do not exempt the original request payload.
3. Apply depth, nodes, include count, nested subquery count, collection limits, and dangerous-key rejection within subqueries.
4. Ensure recursive/nested `$$sq` values cannot reset counters or trigger unbounded recursion.

Acceptance criteria:

- One subquery with excessive nested includes, nodes, depth, or arrays fails with a controlled 400 before target service work.
- Nested subqueries count toward the same request-wide budget.
- Valid bounded subqueries continue to work.
- Targeted complexity tests and the package suite pass.

### Task ARF-03: Reject Legacy Root Count Access Overrides

Status: pending

Priority: P1

Suggested agent: route-validation agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/validation/root-router.ts`
- Count option types in `packages/access-router/src/interfaces/**`
- `packages/access-router/test/root-router.integration.test.ts`

Finding:

The root count entry rejects only top-level `access`. Its passthrough `options` object still accepts `options.access`, and an exported count options type still advertises the field. The value is currently ignored, but the original contract requires controlled rejection and matching direct/root semantics.

References:

- `packages/access-router/src/validation/root-router.ts:120`
- `packages/access-router/src/validation/root-router.ts:305-313`
- `packages/access-router/src/interfaces/base.ts:180-185`
- `packages/access-router/test/root-router.integration.test.ts:643-705`

Implementation requirements:

1. Make root count options strict or explicitly reject `options.access` and unknown trusted-only fields.
2. Remove the obsolete HTTP-facing access property from exported request types while retaining an internal service option only if a real trusted caller needs it.
3. Align direct and root validation responses for legacy input.

Acceptance criteria:

- Root `count` with top-level `access` or `options.access` returns a controlled 400.
- Unknown count option fields do not pass through silently.
- Tenant-scoped tests prove the server-selected `list` filter is used.
- Direct and root count regression tests pass.

### Task ARF-04: Make Pagination Arithmetic Safe

Status: pending

Priority: P1

Suggested agent: pagination agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/helpers/query.ts`
- Pagination validation schemas
- Pagination tests across model, data, and root paths

Finding:

`page` and `limit` are normalized individually as safe integers, but `(page - 1) * limit` is not checked. The derived skip can exceed `Number.MAX_SAFE_INTEGER` and reach Mongoose or array slicing instead of receiving a controlled response.

References:

- `packages/access-router/src/helpers/query.ts:27-41`

Implementation requirements:

1. Validate the derived offset with safe-integer arithmetic before returning it.
2. Choose one explicit policy for overflow: reject at validation or safely clamp before persistence. Prefer controlled rejection for valid-looking but impossible page requests.
3. Apply the same behavior to model, data, direct, advanced, and root routes.

Acceptance criteria:

- Individually safe `page` and `limit` values whose product overflows are rejected or bounded according to the documented policy.
- No unsafe Mongoose `skip` is generated.
- Boundary values at the largest safe supported offset behave consistently across storage backends.

### Task ARF-05: Aggregate Bulk Validation Errors Deterministically

Status: pending

Priority: P1

Suggested agent: bulk-service agent

Dependencies: ARF-02

Primary ownership:

- `packages/access-router/src/services/service.ts`
- `packages/access-router/test/request-complexity.integration.test.ts`

Finding:

Bulk create uses one shared `validationError`. Workers skip later items once any worker sets it, and concurrent scheduling decides which invalid item wins. This does not preserve deterministic indexed errors across multiple invalid items.

References:

- `packages/access-router/src/services/service.ts:408-446`
- `packages/access-router/test/request-complexity.integration.test.ts:241-261`

Implementation requirements:

1. Validate every admitted item in the validation phase with bounded concurrency.
2. Collect errors per item and flatten them in stable input-index order.
3. Run no prepare hooks when any item is invalid.
4. Preserve the existing single-item validator result contract.

Acceptance criteria:

- Multiple invalid items report all issues with stable item pointers regardless of concurrency greater than one.
- Repeated runs produce identical error order.
- Prepare hooks are called zero times when any item fails.
- Valid bulk create retains bounded concurrency and existing output ordering.

## Wave 2: Field Policy, Logging, And OpenAPI

### Task ARF-06: Authorize Data Sort Fields

Status: pending

Priority: P1

Suggested agent: field-policy agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/services/data-service.ts`
- `packages/access-router/src/validation/data-router.ts`
- `packages/access-router/test/data-service-hot-path.test.ts`

Finding:

`DataService.find()` sorts raw records before output-field trimming, but the sort field is not checked against list/read field permissions. A caller can infer denied data through ordering even when the field is absent from the response.

References:

- `packages/access-router/src/services/data-service.ts:95-127`
- `packages/access-router/src/validation/data-router.ts:12-17`

Implementation requirements:

1. Validate sort path syntax and authorize each sort field under the applicable list field policy before sorting.
2. Fail closed for dynamic field permissions that cannot be safely evaluated before ordering.
3. Preserve sorting by permitted fields that are intentionally omitted from the final projection.

Acceptance criteria:

- Sorting by a denied, unknown, malformed, or operator-like field is rejected without exposing ordering.
- Permitted ascending and descending sorting remains deterministic.
- Tests distinguish permission authorization from client projection.

### Task ARF-07: Complete Safe Structured Logging

Status: pending

Priority: P1

Suggested agent: observability agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/logger.ts`
- `packages/access-router/src/logger-helpers.ts`
- Package logging call sites
- `packages/access-router/test/logger-redaction.test.ts`

Findings:

- Structured query logging redacts only recognized sensitive key names; arbitrary filter values such as names, emails, IDs, and custom tenant keys remain in logs despite the original requirement to redact filter values.
- Legacy `logger.*` passthrough calls can still throw. `Model.validateSort()` defaults to `logger.error`, and model-router endpoint logging calls `logger.info` directly.
- Production operation logs do not populate timing or result code even though those fields exist in `OpLogContext`.

References:

- `packages/access-router/src/logger-helpers.ts:120-159`
- `packages/access-router/src/logger.ts:5-18`
- `packages/access-router/src/model.ts:80-95`
- `packages/access-router/src/routers/model-router.ts:140-145`
- `packages/access-router/test/logger-redaction.test.ts:173-177`

Implementation requirements:

1. Log filter structure/cardinality without raw client filter values by default.
2. Route every package diagnostic through non-throwing logger helpers.
3. Ensure invalid client inputs cannot turn a logger exception into an HTTP failure.
4. Emit useful operation completion metadata, including duration and result code, without mutation payloads or response bodies.
5. Preserve debug-level lazy serialization.

Acceptance criteria:

- Captured logs contain no raw query/filter/input values, including values under non-sensitive key names.
- A logger that throws from every level cannot break router construction or any tested HTTP operation.
- Successful and failed operations include operation, resource, duration, result code, and safe cardinalities.
- Disabled debug logging performs no query serialization.

### Task ARF-08: Enforce OpenAPI Collision Safety By Default

Status: pending

Priority: P1

Suggested agent: OpenAPI agent

Dependencies: none

Primary ownership:

- `packages/access-router/src/openapi/registry.ts`
- `packages/access-router/src/openapi/router.ts`
- `packages/access-router/src/openapi/types.ts`
- `packages/access-router/test/openapi-collision.test.ts`
- Relevant website OpenAPI documentation

Findings:

- Registry defaults disable path and operation-ID conflict rejection, so conflicting descriptors silently replace prior entries and can describe a different handler than Express serves.
- `allowReplace` returns before duplicate operation-ID validation.
- `jsonPath` is embedded in an inline script with `JSON.stringify()` but without escaping a `</script>` sequence.

References:

- `packages/access-router/src/openapi/registry.ts:43-100`
- `packages/access-router/src/openapi/types.ts:47-70`
- `packages/access-router/src/openapi/router.ts:15-34`
- `packages/access-router/test/openapi-collision.test.ts:147-163`
- `website/docs/packages/access-router/openapi.mdx:137-141`

Implementation requirements:

1. Reject non-equivalent method/path conflicts by default.
2. Preserve explicitly idempotent equivalent re-registration.
3. Validate duplicate operation IDs independently, including during explicit replacement.
4. Require an explicit compatibility option for legacy replacement behavior if a concrete consumer need exists.
5. Escape inline-script JSON so attacker-controlled path text cannot terminate the script element.
6. Align public type documentation and website behavior descriptions.

Acceptance criteria:

- Default model/model, data/data, and model/data conflicts throw `OpenApiCollisionError`.
- Explicit replacement cannot reuse an operation ID owned by another route in strict mode.
- `</script>`, quotes, ampersands, Unicode separators, and URL characters remain data rather than executable markup.
- Generated OpenAPI cannot silently diverge from Express route precedence.

## Wave 3: Published Package And Documentation Verification

### Task ARF-09: Test The Real Release Artifact And ESM Runtime

Status: pending

Priority: P1

Suggested agent: packaging agent

Dependencies: ARF-08

Primary ownership:

- Release artifact scripts/configuration
- `packages/access-router/test/packed-consumer-compatibility.test.ts`
- Package export tests

Findings:

- The packed-consumer test independently copies builds and rewrites manifests instead of exercising `pnpm build-artifact -- --version <ver>` output. It can pass even if the production release transformation is broken.
- The test writes `esm.mjs` but never executes it.
- The export allowlist asserts required names are present but does not fail on additional accidental root or advanced exports.

References:

- `packages/access-router/test/packed-consumer-compatibility.test.ts:70-165`
- `packages/access-router/test/packed-consumer-compatibility.test.ts:213-232`
- `packages/access-router/test/packed-consumer-compatibility.test.ts:326-330`
- `packages/access-router/test/export-contract.test.ts:315-359`

Implementation requirements:

1. Build and verify the repository's real release artifact at a test version and install the access-router tarball plus its internal dependency closure from that artifact.
2. Assert the artifact manifest contains no placeholder or workspace protocol after the production transformation.
3. Execute ESM and CJS runtime smoke files and NodeNext/Bundler type checks for all entrypoints.
4. Snapshot or exactly compare curated root, `/advanced`, and `/processors` runtime export names.
5. Keep synthetic unit coverage only where it tests isolated helpers not covered by the real pipeline.

Acceptance criteria:

- Breaking the production artifact transformation makes the compatibility test fail.
- ESM, CJS, NodeNext, and Bundler consumers execute/compile from the generated artifact.
- Added or removed public exports fail an explicit API contract test.
- `pnpm build-artifact -- --version <ver>` and `pnpm verify-artifact -- --version <ver>` pass with inspected resolved manifests.

### Task ARF-10: Make Documentation Examples Executable

Status: pending

Priority: P2

Suggested agent: documentation test agent

Dependencies: ARF-09

Primary ownership:

- `packages/access-router/README.md`
- `packages/access-router/llms.txt`
- `packages/access-router/test/documentation-examples.test.ts`

Findings:

- Documentation tests filter diagnostics to syntax errors only, so unresolved names and invalid imports pass.
- README starts listening before `mongoose.connect()` completes despite saying to connect before serving traffic.
- Examples are not resolved against an installed packed artifact.

References:

- `packages/access-router/test/documentation-examples.test.ts:77-104`
- `packages/access-router/README.md:76-82`
- `packages/access-router/llms.txt:39-50`

Implementation requirements:

1. Type-check complete runnable examples, including semantic diagnostics and module resolution, against the packed package.
2. Separate snippets that are intentionally partial and provide explicit fixture declarations rather than ignoring errors.
3. Connect to MongoDB before calling `app.listen()` in the quick start and show startup failure handling.
4. Keep `llms.txt` short while ensuring every import and referenced identifier resolves.

Acceptance criteria:

- Unsupported imports, unresolved names, and invalid API calls fail documentation CI.
- The quick start launches after a MongoDB URL is supplied and does not accept traffic before connection.
- Documentation examples pass against the same artifact used by ARF-09.

### Task ARF-11: Publish Security And Contract Release Notes

Status: pending

Priority: P1 release gate

Suggested agent: release/documentation agent

Dependencies: ARF-01 through ARF-10

Primary ownership:

- Root `CHANGELOG.md` or the repository's generated release-note source
- Package migration documentation if needed

Finding:

No consumer-facing changelog currently records the security and contract changes from the original remediation, including count access removal, distinct/target/populate authorization, request budgets, public response DTOs, and schema mutation removal.

Implementation requirements:

1. Use the repository's established changelog workflow rather than creating an unrelated package format.
2. Describe security-relevant behavior without publishing exploit instructions.
3. Call out breaking or observable migrations: rejected count access input, stricter cross-resource authorization, response allowlisting, complexity limits, schema ownership, and OpenAPI collision defaults.
4. Include any configuration knobs consumers may need to review.

Acceptance criteria:

- Release notes clearly identify every security-driven or externally visible contract change.
- Migration guidance matches runtime behavior and public types.
- No completed change exists only in internal task logs.

## Wave 4: Deferred Quality And Acceptance Evidence

### Task ARF-12: Complete Missing Security Regression Coverage

Status: pending

Priority: P2

Suggested agent: integration test agent

Dependencies: Waves 1 and 2

Primary ownership:

- Focused access-router integration tests
- Documentation for dynamic distinct permissions

Finding:

Several production fixes appear substantially correct but their tests do not prove the original adversarial criteria.

Required scenarios:

1. `exists()` returns false while an unrelated document exists, and `includeId` returns only the requested row's ID.
2. Distinct denial is covered through root operations; dynamic document-level field-permission behavior is deterministic and documented.
3. `/new` denial and removal of a sensitive default are covered.
4. Direct and root subdocument list routes reject `$where`, `$expr`, `$function`, and `$accumulator` at nested levels.
5. Concurrent same-name isolated-runtime requests prove separate base filters and permissions.

References:

- `packages/access-router/test/service-exists.integration.test.ts:85-125`
- `packages/access-router/test/distinct-field-authorization.integration.test.ts:74-149`
- `packages/access-router/test/model-router.routes.integration.test.ts:149-184`
- `packages/access-router/test/model-subdocument-routes.integration.test.ts:91-190`
- `packages/access-router/test/runtime-isolation.integration.test.ts:151-167`

Acceptance criteria:

- Each listed test fails for the corresponding pre-fix behavior or a deliberately reintroduced defect.
- Tests do not depend on retained global Mongoose models or execution order.
- Package suite remains deterministic when run repeatedly.

### Task ARF-13: Finish Public Type Boundary Separation

Status: pending

Priority: P2

Suggested agent: TypeScript API agent

Dependencies: ARF-09

Primary ownership:

- `packages/access-router/src/interfaces/base.ts`
- `packages/access-router/src/http/response-pipelines/service-result.ts`
- Strict packed-consumer type tests

Finding:

Runtime serializers allowlist public fields correctly, but internal `ListResult` and `SingleResult` remain structurally assignable to public DTO interfaces because they only add optional metadata. The original type-level separation criterion is therefore not met.

References:

- `packages/access-router/src/interfaces/base.ts:283-342`
- `packages/access-router/src/http/response-pipelines/service-result.ts:12-41`

Implementation requirements:

1. Make crossing from an internal service result to a public response require the explicit serializer at the type level.
2. Avoid nominal complexity in consumer-facing output types unless a small internal-only brand or distinct shape is sufficient.
3. Add positive serializer tests and `@ts-expect-error` assignments against packed declarations.

Acceptance criteria:

- Internal results cannot be assigned directly to public DTOs.
- Explicit serializer output is assignable and matches runtime JSON.
- Root and direct response helpers compile without broad casts.

### Task ARF-14: Execute Incremental Strict Type Slices

Status: pending

Priority: P2

Suggested agent: TypeScript strictness agent

Dependencies: ARF-13

Primary ownership:

- `packages/access-router/tsconfig.json`
- Request/context, filter, hook, and public boundary types
- Packed strict-consumer tests

Finding:

Original AR-17 was deferred with 169 `noImplicitAny` errors, but its informal slices lack executable ownership, dependencies, checks, and acceptance evidence.

Implementation requirements:

1. Add a dedicated package `tsc --noEmit` command/check using the repository's supported target and lib settings.
2. Land reviewable slices in this order: request/context index access; filter predicate narrowing; concrete hook/callback types replacing `Function`; target/lib and cross-package config alignment.
3. Keep each slice green before enabling the corresponding compiler flag package-wide.
4. Add strict positive and `@ts-expect-error` packed-consumer tests for filters, projections, guards, runtime APIs, and subpaths.
5. Do not suppress errors with broad `any`, blanket `skipLibCheck`, or `unknown as` chains.

Acceptance criteria:

- `noImplicitAny` is enabled for package source.
- Package `tsc --noEmit`, build, tests, and strict packed-consumer checks pass.
- Model adapter argument-shape mistakes are compile-time failures.
- Generated declarations expose no accidental private/anonymous configuration types.

### Task ARF-15: Add Performance And Tree-Shaking Evidence

Status: pending

Priority: P2

Suggested agent: performance/build agent

Dependencies: ARF-06, ARF-09

Primary ownership:

- Data-service benchmark or performance regression tests
- Side-effect/tree-shaking smoke tests
- `packages/access-router/package.json`

Findings:

- Data hot-path tests prove output-hook cardinality but provide no representative scaling benchmark or regression threshold.
- Side-effect tests prove idempotent runtime initialization but do not run a bundler/tree-shaking smoke test.
- `sideEffects` lists `dist/runtime.js` and `dist/runtime.mjs`, which are not emitted package entry files.

Implementation requirements:

1. Add a stable benchmark or bounded regression test for large in-memory datasets and complex filters.
2. Run a minimal bundler consumer that imports the supported API and proves required schema initialization survives tree shaking.
3. Make `sideEffects` list only emitted modules whose retention is required.

Acceptance criteria:

- Performance evidence compares page-sized shaping against full-match shaping with CI-tolerant thresholds.
- A production-mode tree-shaken bundle retains required initialization and executes successfully.
- Every `sideEffects` path exists in the packed artifact.

## Known Repository Verification Blockers

These are not access-router production defects, but they block the original release-gate definition of done and require explicit ownership before final completion:

- `pnpm lint` includes `.mongoose/**` and encounters parser-root configuration failures. Fix lint scope/configuration without hiding first-party violations.
- `pnpm build` fails in `apps/mongoose-rxdb-example` due to existing TypeScript errors.
- Access-router tests use `fileParallelism: false` to avoid shared Mongoose/Mongo memory-server races. Either isolate the test lifecycle so default parallelism is reliable or explicitly revise the release criterion with maintainer approval and documented risk.

Do not fold broad repository fixes into access-router behavioral tasks. Create or link dedicated repository tasks if ownership is separate.

## Dependency And Parallelization Guidance

| Wave | Tasks            | Guidance                                                                         |
| ---- | ---------------- | -------------------------------------------------------------------------------- |
| 1    | ARF-01 to ARF-05 | ARF-01, ARF-03, and ARF-04 can run independently. Sequence ARF-02 before ARF-05. |
| 2    | ARF-06 to ARF-08 | Can run in parallel because primary source ownership differs.                    |
| 3    | ARF-09 to ARF-11 | Sequence in order so docs and release notes use the verified artifact/contract.  |
| 4    | ARF-12 to ARF-15 | ARF-12 and ARF-15 can run independently; sequence ARF-13 before ARF-14.          |

Shared hotspots include `services/base.ts`, package integration fixtures, and generated `dist/`. Do not run package build/test scripts concurrently.

## Final Integration Review

### Task ARF-16: Independently Verify Follow-Up Completion

Status: pending

Priority: P0 release gate

Suggested agent: senior reviewer who did not implement most follow-up tasks

Dependencies: ARF-01 through ARF-15 and linked repository blockers resolved or explicitly accepted

Primary ownership:

- Review and focused integration corrections only
- Return larger defects to the owning task

Review requirements:

1. Verify each acceptance criterion against runtime behavior, not progress notes.
2. Re-test authorization across read/list fallback, include, populate, subquery, direct, and root paths.
3. Confirm all client-controlled recursive and collection inputs share practical request-wide bounds.
4. Confirm sort, distinct, select, and output shaping cannot disclose denied fields.
5. Confirm logger failures are inert and request values are absent from diagnostics.
6. Install and execute the actual release artifact under the supported peer matrix.
7. Confirm public types, exports, documentation, OpenAPI, and runtime behavior agree.

Required verification:

```sh
git diff --check
pnpm --filter @web-ts-toolkit/access-router test
pnpm lint
pnpm build
pnpm test
pnpm build-artifact -- --version <ver>
pnpm verify-artifact -- --version <ver>
```

Acceptance criteria:

- No unresolved P0 or P1 finding remains.
- All required commands pass, or a maintainer-approved exception is linked with owner, rationale, and residual risk.
- Compatibility tests execute ESM, CJS, NodeNext, and Bundler consumers from the real artifact.
- Security/contract release notes are ready before publication.
- Completion evidence lists changed files, command results, and any separately tracked P2/P3 deferrals.

## Definition Of Done

- Cross-resource operation changes cannot bypass target authorization.
- All request-controlled nested structures and derived pagination values are bounded safely.
- Bulk validation errors are complete, indexed, and deterministic.
- Denied fields cannot leak through sorting, distinct, logging, or HTTP serialization.
- OpenAPI output cannot silently differ from actual routing and inline data is safely embedded.
- Real release artifacts, all module systems, strict declarations, and executable docs are verified.
- Security-relevant consumer migrations are present in release notes.
- Package and repository release gates pass or have explicit maintainer-approved exceptions tracked outside this completed plan.
