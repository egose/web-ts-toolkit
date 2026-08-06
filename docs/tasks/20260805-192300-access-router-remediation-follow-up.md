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

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/services/base.ts` (read subquery now passes `tryList: false`), `packages/access-router/test/cross-resource-authorization.integration.test.ts` (new ARF-01 regression test).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 29 files / 243 tests passed.
- Result: A read-authorized/list-denied caller cannot obtain list-scoped target data through a read subquery; the test fails (200) without the fix and passes (404) with it.

### Task ARF-02: Validate Complete Subquery Complexity

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/request-complexity.ts` (`$$sq` payloads now recursed instead of skipped), `packages/access-router/test/request-complexity.integration.test.ts` (new ARF-02 regression test + existing depth budget raised from 4 to 8 so the subquery-count overflow case is not masked by depth).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 29 files / 244 tests passed.
- Result: one `$$sq` with oversized nested `$in`, dangerous keys, a nested `$$sq`, or oversized `include` is rejected with a controlled 400 before target service work; the test fails (200) without the fix and passes with it.

### Task ARF-03: Reject Legacy Root Count Access Overrides

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/validation/root-router.ts` (`rootModelCountOptionsSchema` now `z.object({}).strict()`), `packages/access-router/src/interfaces/base.ts` (`RootModelCountQueryEntry.options` no longer advertises `access`), `packages/access-router/test/root-router.integration.test.ts` (new ARF-03 regression test).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 29 files / 245 tests passed.
- Result: root `count` with `options.access` or any unknown option field now returns a controlled 400; the test fails (200) without the strict schema and passes with it.

### Task ARF-04: Make Pagination Arithmetic Safe

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/helpers/query.ts` (derived `(page - 1) * limit` clamped to `MAX_SAFE_INTEGER`; final `skip` validated as a non-negative safe integer), `packages/access-router/test/pagination-overflow.test.ts` (new focused unit test), `packages/access-router/test/model-router.routes.integration.test.ts` (new ARF-04 route integration test).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 30 files / 251 tests passed.
- Result: individually-safe `page` and `limit` whose product overflows no longer produce an unsafe `skip`; the route returns a controlled 200 (empty page) and the unit test asserts the clamped offset is a safe integer.

### Task ARF-05: Aggregate Bulk Validation Errors Deterministically

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/services/service.ts` (bulk validation now collects per-item errors and aggregates them in stable input-index order instead of using a single shared `validationError` that short-circuits later items), `packages/access-router/test/request-complexity.integration.test.ts` (new ARF-05 regression test with `maxBulkConcurrency: 1` and five items, including valid items between invalid ones).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 30 files / 252 tests passed.
- Result: all invalid items report errors with stable indices regardless of where the first failure occurs; the test fails (only `#/2/name` reported, `#/4/role` skipped) with the old short-circuit and passes with the aggregate fix.

## Wave 2: Field Policy, Logging, And OpenAPI

### Task ARF-06: Authorize Data Sort Fields

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/services/data-service.ts` (added `validateSortFields` that parses the sort string, validates field syntax, and authorizes each sort field against the list field policy before ordering), `packages/access-router/test/data-service-hot-path.test.ts` (new ARF-06 regression test covering denied fields, malformed/operator-style paths, descending denied fields, and permitted ascending/descending sort).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 30 files / 253 tests passed.
- Result: a caller cannot infer denied data through ordering; the test returns 200 (ordering exposed) with the fix disabled and 400 with it enabled, while permitted ascending/descending sort remains deterministic.

### Task ARF-07: Complete Safe Structured Logging

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/logger.ts` (legacy passthrough now wrapped in try/catch), `packages/access-router/src/logger-helpers.ts` (added `summarizeFilter` structural-only cardinality helper; raw query values are no longer included in the structured payload), `packages/access-router/src/services/service.ts` (added `beginOp`/`completeOp` helpers emitting `startedAt`, `durationMs`, and `resultCode` for findOne, find, updateOne, upsert, and delete operations), `packages/access-router/src/model.ts` (`validateSort` default logger now uses the safe wrapper), `packages/access-router/src/routers/model-router.ts` (route-path info logging routed through safe helpers), `packages/access-router/test/logger-redaction.test.ts` (added ARF-07 assertions for raw-value absence and inert logger failures).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 32 files / 290 tests passed.
- Result: captured logs contain no raw query/filter values even for non-sensitive key names; a logger that throws from every level cannot break router construction or any tested HTTP operation; successful and failed operations emit operation, resource, duration, result code, and safe cardinalities; disabled debug logging performs no serialization.

### Task ARF-08: Enforce OpenAPI Collision Safety By Default

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/src/openapi/registry.ts` (default `rejectConflicts` and `rejectDuplicateOperationIds` are now `true`; `allowReplace` now runs `assertOperationIdAvailable(route, existing)` so it can no longer steal another route's `operationId`; identity-aware `replacing` argument ignores the descriptor being replaced; idempotent-on-both-sides descriptors may share an `operationId` so reserved operations like `root.query` can mount at multiple base paths on the same runtime), `packages/access-router/src/openapi/router.ts` (new `escapeInlineScriptJson` helper escapes `<`, `>`, `&`, U+2028, U+2029, and `</script` before the inline `<script>` payload; `url:` now uses it instead of raw `JSON.stringify(specPath)`), `packages/access-router/src/openapi/types.ts` (updated `OpenApiRegistryOptions` JSDoc to document strict-by-default defaults and the `OpenApiRegistry` constructor opt-out, and the `idempotent` flag now documents that reserved idempotent operations may share an `operationId` across paths), `packages/access-router/src/index.ts` (re-exported `OpenApiRegistry` so low-level callers and tests can opt into legacy lenient mode via the constructor), `packages/access-router/test/openapi-collision.test.ts` (replaced the lenient-default test with a strict-by-default assertion, added a constructor opt-in lenient test, added the ARF-08 `allowReplace` operation-ID theft regression, and added the inline-script `</script>` / quotes / ampersand / separator escaping test), `website/docs/packages/access-router/openapi.mdx` (Notes section now documents strict-by-default behavior, `allowReplace` operation-ID validation, the `OpenApiRegistry` constructor escape hatch, and inline-script path escaping).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` -> 33 files / 290 tests passed.
- Result: default model/model, data/data, and model/data conflicts throw `OpenApiCollisionError` even without an explicit `enableOpenApiCollisionDetection()` call; `allowReplace: true` cannot steal a foreign `operationId`; an attacker-controlled `jsonPath` containing `</script>`, quotes, `&`, or U+2028/U+2029 cannot terminate the Swagger UI inline `<script>` (exactly two `</script>` close tags survive and the dangerous sequences are emitted as JS escape sequences). The prior lenient test that asserted "does not throw when strict mode is disabled" now asserts strict throw by default and the same scenario requires an explicit `new OpenApiRegistry({ rejectConflicts:false, rejectDuplicateOperationIds:false })` opt-in.

## Wave 3: Published Package And Documentation Verification

### Task ARF-09: Test The Real Release Artifact And ESM Runtime

Status: completed

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

Completion evidence:

- Changed: `packages/access-router/test/packed-consumer-compatibility.test.ts` (rewrote the test to drive the production release transformation instead of a hand-rolled synthetic rewriter; the manifest for each workspace package is now produced by the real `createPublishPackageJson` from `@repo-toolkit/publish-package`, resolved via `createRequire(require.resolve('@repo-toolkit/release-artifact'))` since `publish-package` is a transitive dependency. `stagePublishedPackage` mirrors the publisher's publish-dir layout: copies the existing built `dist/` outputs as the package root, flattens the default package files (`README.md`, `llms.txt`) plus root `LICENSE`, and writes the rewritten `package.json`, then `pnpm pack` produces the npm tarball. The consumer install now pins every `@web-ts-toolkit/*` dependency to its local tarball via a `pnpm-workspace.yaml` `overrides` block so transitive internal deps can no longer leak back to the npm registry (the prior `pnpm add` form silently substituted registry tarballs when the sentinel version was unavailable). `seedToolVersions` writes the workspace `.tool-versions` into each temp/consumer dir so spawned `pnpm`/`node`/`tsc` processes under `/tmp` resolve the same `pnpm 11.18.0` the workspace pins, replacing the ambient `/tmp/.tool-versions` coupling that ARF-12 noted. `runConsumerSmokeTests` now executes `node esm.mjs` before `node cjs.cjs` and the two `tsc` type checks, closing the gap where the ESM smoke file was previously written but never run. The describe is renamed from "AR-22 packed-package compatibility" to "ARF-09 packed-package compatibility using the real release-artifact pipeline" and the tarball manifest assertions verify the publisher-exact output: version `0.99.0-test`, `license: Apache-2.0`, `repository: { ..., directory: "packages/access-router" }`, `files: ["**/*","!**/*.map"]`, root/main/module/types/bin/exports stripped of any `dist/` prefix, internal workspace deps rewritten to the test version, `devDependencies`/`scripts` absent, and no `PLACEHOLDER`/`workspace:` value anywhere in the resolved manifest), `packages/access-router/test/export-contract.test.ts` (added three ARF-09 exact-equals snapshot tests inside the existing `export allowlist snapshot` describe that compare the ESM and CJS module-namespace keys for the root, `/advanced`, and `/processors` subpaths against a recorded sorted list. The presence-only allowlist tests above them continue to assert required exports are present; the new snapshots additionally fail on any added or removed public export, surfacing the `defaultRuntime`, `OpenApiCollisionError`, `OpenApiRegistry`, `permissionsPlugin`, `redactFilter`, `redactPayload`, `safeStringify`, `isLevelEnabled` root exports and the full `/advanced` surface as an intentional contract that future changes must update deliberately).
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router test` → 33 files / 301 tests passed plus 1 pre-existing failure in `test/tree-shaking-smoke.test.ts` (an ARF-15-owned untracked file whose `sideEffects`/`dist` resolution failure was already failing before any ARF-09 edit; not introduced or in scope for this task). The two touched test files pass standalone: `packed-consumer-compatibility.test.ts` 4 passed, `export-contract.test.ts` 35 passed.
  - `pnpm build-artifact -- --version 0.99.0-test` → produced `dist/web-ts-toolkit-0.99.0-test.tar.gz` with `commands: create-access-router-mongo-starter, create-access-router-mongo-starter-deploy-netlify, create-access-router-mongo-starter-deploy-shared, wtt-access-router-runtime, wtt-express-runtime` and a 15-entry `requiredFiles` manifest. Inspected the unpacked `artifact-manifest.json` (version `0.99.0-test`) and confirmed the bundled `packages/access-router` tree shipped its already-built `dist/` outputs and the per-package `package.json`; the CLI artifact intentionally leaves the workspace placeholder (`0.0.0-PLACEHOLDER`) in the per-package manifests because CLI consumers do not republish them, while the npm-published tarball transformation exercised by `packed-consumer-compatibility.test.ts` is the source of the version-rewrite contract.
  - `pnpm verify-artifact -- --version 0.99.0-test` → `release artifact verified successfully.` (manifest, required-files presence, per-wrapper `bash -n`, per-wrapper `--help` boot, symlink-escape safety).
  - The generated tarball and the unpacked `dist/web-ts-toolkit-0.99.0-test/` artifact root were removed afterward; no build artifact was committed.
- Result: every published-tarball manifest is now generated by the real `@repo-toolkit/publish-package` transformation, so a regression in the version-rewrite/dist-strip/workspace-rewrite logic fails `packed-consumer-compatibility.test.ts` instead of masking behind a hand-rolled synthetic rewriter. Installing the staged tarballs into a fresh consumer (via `pnpm-workspace.yaml` overrides so transitive internal deps cannot fall back to the registry) executes `node esm.mjs`, `node cjs.cjs`, `tsc -p tsconfig.nodenext.json`, and `tsc -p tsconfig.bundler.json` against the real artifact closure, covering ESM, CJS, NodeNext, and Bundler consumers. The exact-equals snapshots at `export-contract.test.ts` catch any added/removed public export on the root, `/advanced`, or `/processors` surface, so accidental leaks (e.g. via an `export *`) or accidental removals surface as a deliberate contract update rather than a silent regression. The CLI distribution pipeline (`pnpm build-artifact` + `pnpm verify-artifact`) passes at the same sentinel version with inspected resolved manifests.

### Task ARF-10: Make Documentation Examples Executable

Status: completed

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

Completion evidence:

- Changed:
  - `packages/access-router/README.md` — quick-start block now connects to MongoDB via `try { await mongoose.connect(...) } catch { process.exit(1) }` **before** `app.listen(port, ...)` so the service never publishes routes it cannot serve; commentaries updated to match the new ordering. The `createRouter`-overload snippet was missing imports (`mongoose`, `acl`, `permissionsPlugin`) and referenced an undeclared `uri` placeholder, so ARF-10 implementation requirement #2 (explicit fixture declarations rather than ignoring errors) was satisfied by adding the imports and a `const uri = process.env.MONGODB_URL_TENANT ?? 'mongodb://localhost:27017/tenant'` declaration.
  - `packages/access-router/llms.txt` — the validation adapter block referenced `z.object`/`z.string` without importing `z` from `zod` (an unresolved name the prior TS1xxx-only filter masked). Added `import { z } from 'zod';`. The isolated-runtime block referenced an undeclared `UserModel`; replaced the hand-waved placeholder with an explicit `const UserModel = mongoose.model('User', new mongoose.Schema({ name: String }))` declaration plus the `import mongoose from 'mongoose'` import so every identifier resolves.
  - `packages/access-router/test/documentation-examples.test.ts` — rewritten to drive a real packaging and semantics check instead of a syntax-only filter. The test stages a virtual consumer project under `os.tmpdir()` that copies `dist/` and `package.json` into `node_modules/@web-ts-toolkit/access-router/` and symlinks `express`, `mongoose`, `zod`, `typescript`, `@types/node`, `@types/express`, plus the package's transitive `@web-ts-toolkit/*` and `just-diff`/`sift`/`winston`/`mongoose-schema-jsonschema` deps from the workspace hoist. Each ```ts fenced block from `README.md`and`llms.txt`is extracted, given a synthesized`void [...]`reference tail that names every top-level binding the block introduced (both import bindings and`const`/`let`/`var`/destructured const bindings — `type`-only imports are excluded so the runtime reference is valid), and emitted as `${block-name}.ts`into the consumer dir with a per-block`tsconfig.json`configured for`moduleResolution: Bundler`, `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`. The test then shells out to `node .../node_modules/typescript/bin/tsc -p tsconfig.<block>.json --noEmit` and asserts zero diagnostics, surfacing every resolved-name and module-resolution failure the prior TS1xxx-only filter masked. Two additional contract tests guard the README quick-start ordering invariant (`mongoose.connect`must precede`app.listen`and a`try { ... } catch`must wrap the connect) and the llms.txt`z`-import invariant (any block referencing `z.object`/`z.string`must`import { z } from 'zod'`).
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router test` → 34 files / 304 tests passed (the documentation-examples suite contributes 11 tests covering all 9 README/llms.ts fenced blocks plus the 2 ordering/import invariants).
  - Regression-checked the test by removing the `import { z } from 'zod'` line from `llms.txt` and re-running; both the `llms.txt-block-2-of-4` semantic compile and the `every import and identifier referenced in llms.txt resolves` contract test fail with `TS2304: Cannot find name 'z'` (semantic) and the missing-import regex (contract), proving each surface independently catches the regression; restored `llms.txt` afterward.
- Result: documentation snippets are no longer type-checked in isolation against a `skipLibCheck`-suppressed syntax filter; they compile under strict semantic mode against the same packed `dist/` artifact ARF-09 reviews, with every documented binding enforced as actually-used, every import enforced as resolved, and the README's connect-before-listen ordering now both demonstrably aligned with its prose and asserted by an explicit contract test. A future `import` typo or undocumented-name regression in README/llms.txt fails CI rather than slipping past the syntax-only filter that previously masked the `UserModel`/`z` failures.

### Task ARF-11: Publish Security And Contract Release Notes

Status: completed

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

Completion evidence:

- Changed:
  - `CHANGELOG.md` — added an `Unreleased` section with `access-router` security/contract remediation notes. The entry calls out the externally visible authorization, request-budget, response-boundary, logging, and type-checking changes, and includes migration notes for rejected root `count` access input, stricter OpenAPI collision defaults, serializer-only public DTOs, stricter compile-time filter/guard/runtime option checks, and integrations that relied on unpublished runtime shims or undocumented schema-mutation side effects.
- Verified:
  - The changelog entry covers the consumer-visible changes completed under ARF-01 through ARF-10 and aligns with the final runtime/type behavior now enforced by the package and packed-consumer tests.
- Result: release notes for the access-router remediation are now present in the repository's established `CHANGELOG.md` workflow, with migration guidance that matches the final verified behavior instead of leaving security/contract changes discoverable only through internal task logs.

## Wave 4: Deferred Quality And Acceptance Evidence

### Task ARF-12: Complete Missing Security Regression Coverage

Status: completed

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

Completion evidence:

- Changed:
  - `packages/access-router/test/service-exists.integration.test.ts` — extended `createExistsApp` to derive a per-model `basePath` (eliminating the prior shared-`/exists-users` OpenAPI collision under ARF-08's strict-by-default policy) and added three ARF-12 #1 regression tests: `exists()` returns `false` when only an unrelated document is present, both states (`true`/`false`) are reported correctly when matching and unrelated rows coexist, and `includeId` returns only the requested row's id (never the unrelated document's id) and `null` for a missing match.
  - `packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts` (new) — ARF-12 #2 coverage: a root batch `distinct` entry on a denied `secret` field returns a controlled per-entry 403 with the operator-named error message and no leaked values, while a permitted `role` field on the same batch still succeeds; a dynamic document-level field permission (`secret: (permissions) => permissions.has('canViewSecret')`) deterministically permits a caller holding `canViewSecret` and denies a caller lacking it; repeated denials under the same caller produce byte-identical responses.
  - `packages/access-router/test/arf12-new-route-denial.integration.test.ts` (new) — ARF-12 #3 coverage: `operationAccess.new: 'canNew'` denies a caller lacking `canNew` with a 401 on the direct `/new` route; an authorized caller reaches `/new` and the sensitive default `secret` (schema default `'confidential'`) is absent from the trimmed output; the same denial/trim behaviour is verified through a root batch `new` entry (controlled per-entry 401 then 200 with `secret` stripped).
  - `packages/access-router/test/model-subdocument-routes.integration.test.ts` — appended a `describe('ARF-12 #4 ...')` block that tests `$where`, `$expr`, `$function`, `$accumulator`. For each operator the direct subdocument list route (`POST /<parent>/<id>/<sub>/__query`) and the root `subList` batch entry reject the operator at the top level, nested under a normal field-name key, and buried inside an `$and`/`$or` clump; a benign nested filter still succeeds to prove the rejection is operator-specific. Direct routes return HTTP 400; root batch entries return HTTP 200 with a per-entry `statusCode: 400` and `result.code: 'bad_request'`. Each ARF-12 test uses an isolated `createAccessRuntime()` so its OpenAPI registry is scoped to the test and cannot collide with the default-runtime routers set up by `createSubdocumentApp()` in the earlier tests.
  - `packages/access-router/test/runtime-isolation.integration.test.ts` — added ARF-12 #5 test: two runtimes register the same model name on separate connections with differing `baseFilter.list` (runtime A exposes only `public:true`, runtime B only `public:false`); both stores seed one public and one private document; concurrent HTTP list requests across both runtimes (8 in-flight plus 3 more bursts) each observe only their own runtime's base filter, proving AsyncLocalStorage isolation and independent base-filter resolution.
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 32 files / 290 tests passed (this required asdf to find a `pnpm` version for the `/tmp/access-router-ar22-*` paths used by `packed-consumer-compatibility.test.ts`; a `nodejs 26.5.0`/`python 3.14.6`/`pnpm 11.18.0` `.tool-versions` was placed in `/tmp` to satisfy asdf lookup for those process invocations — this is an environment coupling owned by ARF-09, not modified by ARF-12).
- Result: every ARF-12 adversarial scenario is now covered by a regression test that documents the buggy behaviour it guards against. The new tests use isolated `createAccessRuntime()` per test (and a per-model basePath in `service-exists`) so they do not depend on global Mongoose models, shared OpenAPI route registries, or test execution order; repeated runs of `pnpm --filter @web-ts-toolkit/access-router test` produce consistent 32 files / 290 tests passing.

### Task ARF-13: Finish Public Type Boundary Separation

Status: completed

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

Completion evidence:

- Changed:
  - `packages/access-router/src/interfaces/base.ts` — added a type-only nominal brand (`declare const publicResultBrand: unique symbol`) carried as a required field on `PublicSingleResult`, `PublicListResult`, and `PublicErrorResult` (`PublicServiceResult` derives it transitively). The brand is purely type-level (no runtime symbol value and no symbol-keyed property is ever constructed), so the serialized JSON shape is unchanged; its only effect is structural: internal `SingleResult`/`ListResult`/`ErrorResult` lack the brand and thus cannot be assigned directly to the public DTOs.
  - `packages/access-router/src/http/response-pipelines/service-result.ts` — `toPublicErrorResult`, `toPublicSingleResult`, and `toPublicListResult` now construct a fresh plain DTO and cast it to the branded public type. The cast is the single explicit crossing point between internal service results and the public response DTO; nothing else in the package crosses the boundary (`RootRouter.wrapResult` and `list-response`/`model-response` continue to use the serializers).
  - `packages/access-router/test/export-contract.test.ts` — added an `ARF-13 public service/result type boundary` describe block with two tests: a runtime equality test asserting the serializers drop `input`/`query`/`contexts`/`context` and emit only the public JSON fields, and a `ts.createProgram` compile test that imports the internal interfaces and public DTOs from the package source and asserts a zero-diagnostic compile of a consumer snippet containing three `@ts-expect-error` direct-crossing assignments (`ListResult -> PublicListResult`, `SingleResult -> PublicSingleResult`, `ErrorResult -> PublicErrorResult`) plus three positive serializer-crossing assignments. Zero diagnostics proves every directive suppressed a real error and every serializer assignment compiled; reverting the brand repr surfaces exactly three TS2578 "Unused '@ts-expect-error' directive" diagnostics (verified at implementation time).
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 32 of 33 test files passed (292 tests); the single failing suite is `test/packed-consumer-compatibility.test.ts`, which fails with a pre-existing oxc parse error at `test/packed-consumer-compatibility.test.ts:126` introduced by the still-in-progress ARF-09 worktree changes (a `**/*` glob embedded in a JSDoc block comment terminates the comment prematurely) and is unrelated to ARF-13 — confirmed by stashing only the ARF-13 source/test changes and reproducing the identical parse failure and identical `32 of 33 files / 290 tests passing` baseline. `pnpm --filter @web-ts-toolkit/access-router build` succeeded with no DTS errors; `tsc -p tsconfig.json --noEmit` reports the same number of pre-existing repository-wide diagnostics before and after the ARF-13 change (no new type errors); `npx eslint` over the three changed files is clean.
- Result: internal `SingleResult`/`ListResult`/`ErrorResult` cannot be assigned directly to `PublicSingleResult`/`PublicListResult`/`PublicErrorResult` (the public DTO brand is required and internal results lack it); crossing the boundary requires the explicit `toPublic*` serializer (the centralized `as` cast is the only crossing point); serializer output is assignable to the public DTOs and its runtime JSON contains exactly the public fields; root and direct response helpers compile without broad casts. The "brand the internal types" implementation hint in the remit was technically insufficient on its own (a required brand on the source does not block source-target structural assignability in TypeScript), so the brand was applied to the public DTOs — the minimal mechanism that satisfies the acceptance criterion — while keeping the runtime JSON shape intact and adding no nominal complexity to consumer-facing runtime output.

### Task ARF-14: Execute Incremental Strict Type Slices

Status: completed

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

Completion evidence:

- Changed:
  - `packages/access-router/src/services/public-service.ts`, `packages/access-router/src/routers/root-router.ts`, `packages/access-router/src/routers/model-router-collection-routes.ts`, and `packages/access-router/src/routers/model-router-document-routes.ts` — completed the final public-boundary/router casts needed to carry wire-level `unknown` request bodies into the typed public service layer without reintroducing implicit `any`; `_update()` now uses a concrete `Record<string, unknown>` payload and typed decorate/output shaping, and the last three router call sites now perform the narrow bridge casts at the HTTP boundary instead of inside downstream helpers.
  - `packages/access-router/tsconfig.json` — flipped `noImplicitAny` to `true` for package source.
  - `packages/access-router/tsconfig.typecheck.json` (new) and `packages/access-router/package.json` — added a dedicated package `typecheck` command: `pnpm --filter @web-ts-toolkit/access-router... build && tsc --noEmit -p tsconfig.typecheck.json`. The dedicated config clears inherited workspace `paths`, sets `baseUrl: "."`, and uses Node-22-aligned `ES2022` libs so the check resolves built dependency declarations instead of sibling workspace source trees.
  - `packages/access-router/test/strict-typecheck.test.ts` (new) — asserts `noImplicitAny` is enabled, the dedicated `typecheck` script is declared, and the real package typecheck command passes.
  - `packages/access-router/test/strict-consumer-types.test.ts` (new) — stages a packed-style consumer under `/tmp`, compiles a strict snippet against `@web-ts-toolkit/access-router`, `@web-ts-toolkit/access-router/advanced`, and `@web-ts-toolkit/access-router/processors`, and proves both positive and `@ts-expect-error` cases for typed filters, projections, guards, runtime APIs, and subpath exports.
  - `packages/express-response-handler/src/create-handler.ts` — replaced `.catch(() => undefined)` with `.catch(() => {})` so the transitive dependency's DTS build no longer leaks an implicit-`any` return when access-router builds declarations against workspace sources.
- Verified:
  - `pnpm run typecheck` (in `packages/access-router`) passed. This runs `pnpm --filter @web-ts-toolkit/access-router... build && tsc --noEmit -p tsconfig.typecheck.json`.
  - `pnpm test` (in `packages/access-router`) passed: 36 files / 307 tests.
  - `pnpm exec tsc --noEmit -p tsconfig.json --noImplicitAny` still reports only the previously acknowledged out-of-scope cross-package path-mapped diagnostics under `../express-json-router`, `../http-errors`, and `../utils`; it reports zero diagnostics under `packages/access-router/src/**/*.ts`, completing the original ARF-14 source-slice objective.
- Result: `access-router` source now runs with `noImplicitAny: true`, the package has a repeatable dedicated typecheck command aligned to installed declarations and Node-22-era libs, the built declarations continue to emit cleanly, and strict consumer compilation now proves the intended public type contracts: invalid filter keys, invalid nested filter paths, invalid guard id shapes, invalid runtime option types, and projection/result shape mismatches fail at compile time while valid root and subpath imports continue to compile.

### Task ARF-15: Add Performance And Tree-Shaking Evidence

Status: completed

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

Completion evidence:

- Changed:
  - `packages/access-router/package.json` — `sideEffects` now lists only emitted package entry files: `./dist/index.js`, `./dist/index.mjs`, `./dist/advanced.js`, `./dist/advanced.mjs`. The defunct `dist/runtime.js`/`dist/runtime.mjs` entries (which tsup never emits) were removed.
  - `packages/access-router/test/data-service-scaling.test.ts` — new bounded regression test for the data service hot path. Builds a 5,000-record in-memory dataset and asserts `read`-shaped list responses return in bounded wall-clock time for page sizes 10/50/100 (CI-tolerant ceilings of 220/240/280 ms) plus a counterfactual comparison test that exercises the same query without the page-sized trim and asserts the full-match path exceeds a stable lower bound — surfacing a regression that naively iterates the matching set instead of page-trimming it.
  - `packages/access-router/test/tree-shaking-smoke.test.ts` — new esbuild bundler smoke test. Stages the access-router package into a temp consumer via a `node_modules/@web-ts-toolkit/access-router` symlink, bundles `consumer.cjs` (which imports only `createAccessRuntime` and registers a mongoose model) with `esbuild --bundle --minify --external:mongoose --external:express`, executes the bundled output, and asserts the runtime's idempotent `mongoose-schema-jsonschema` patch chain survives tree-shaking: `model.jsonSchema` is a function on the registered model, `parsed.schemaType === 'object'`, `schemaFields` contains `name`/`secret`/`public`/`_id`, and the bundled text retains `createAccessRuntime`, `defaultRuntime`, and `jsonSchema` symbols. Also asserts every `package.json` `sideEffects` path resolves to a file that exists and that no `dist/runtime.{js,mjs}` entry was reintroduced. The tree-shake-mode (non-minified) variant re-runs the consumer to confirm the un-minified bundle still executes after bundling.
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` → 34 files / 302 tests passed. The `tree-shaking-smoke.test.ts` (3 tests) and `data-service-scaling.test.ts` (2 tests) pass alongside the rest of the suite. `pnpm build-artifact -- --version <ver>` was confirmed passing in ARF-09; the ARF-15 `sideEffects` change ships in `package.json` and is reflected in the packed tarball consumed by `packed-consumer-compatibility.test.ts`.
- Result: a regression that drops the `Schema.prototype.jsonSchema`/`Model.jsonSchema` side-effect assignment now fails `tree-shaking-smoke.test.ts` (the consumer asserts `typeof model.jsonSchema === 'function'` and throws otherwise), and a hot-path regression that scans the entire matching set instead of page-trimming it now fails the ceiling and counterfactual comparison in `data-service-scaling.test.ts`. The `sideEffects` allowlist no longer references non-emitted modules, so bundlers will not retain a defunct `dist/runtime.js` shim.

## Known Repository Verification Blockers

None remain on the final ARF-16 rerun.

- `pnpm lint` now passes after scoping root ESLint away from vendored `.mongoose/**` content and generated `packages/**/src/**/*.js` artifacts rather than muting first-party TypeScript/JavaScript sources.
- `pnpm build` now passes after fixing the `apps/mongoose-rxdb-example` strict build issues and the `apps/nodejs` package-export resolution/type-check configuration.
- `pnpm test` passes with the repository's existing serialized workspace test command (`--workspace-concurrency=1`), which is the documented supported mode for this workspace.

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

Status: completed

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

Completion evidence:

- Changed:
  - `packages/access-router/package.json` — `sideEffects` now uses publish-safe wildcard entry patterns (`./**/index.js`, `./**/index.mjs`, `./**/advanced.js`, `./**/advanced.mjs`) so the contract remains valid for both the workspace/CLI artifact `dist/` layout and the flattened packed npm publish layout.
  - `packages/access-router/test/tree-shaking-smoke.test.ts` and `packages/access-router/test/export-contract.test.ts` — updated ARF-15 assertions to validate the side-effect patterns against emitted entry candidates instead of assuming literal in-repo file paths.
  - `packages/access-router/test/packed-consumer-compatibility.test.ts` — extended consumer verification in two ways: the packed publish-tarball path now asserts the rewritten manifest carries the publish-safe `sideEffects` patterns and emitted root entry files, and a second peer-matrix smoke path now installs the actual `build-artifact` package directories and runs the same ESM, CJS, NodeNext, and Bundler consumer checks against the real extracted artifact tree. Added explicit 60s per-case timeouts so the full suite remains stable under repo-wide load.
  - `CHANGELOG.md` — completed ARF-11 release notes so the final release-gate review includes consumer-facing migration guidance.
  - `eslint.config.mjs` — root lint now ignores vendored `.mongoose/**` content and generated `packages/**/src/**/*.js` artifacts, which were the only remaining non-product lint failures after the remediation work.
  - `apps/mongoose-rxdb-example/src/index.ts` — fixed strict build/type issues in the example app by typing document/model usage and using explicit `.exec()` query execution.
  - `apps/nodejs/tsconfig.json` and `apps/nodejs/src/app.ts` — aligned the example app with package-export-based Node16 resolution and typed the global permission callback, clearing the last root `pnpm build` failure.
- Independent review:
  - A separate reviewer pass was rerun after the final fixes and reported `No findings`; it explicitly confirmed that the earlier ARF-16 gaps (missing release notes, publish-sideEffects mismatch, lack of actual build-artifact consumer coverage, and incomplete release-gate verification) are now resolved.
- Verified:
  - `git diff --check` → passed.
  - `pnpm --filter @web-ts-toolkit/access-router test` → passed, 36 files / 309 tests.
  - `pnpm lint` → passed.
  - `pnpm build` → passed.
  - `pnpm test` → passed.
  - `pnpm build-artifact -- --version 0.99.0-test` → passed, produced `dist/web-ts-toolkit-0.99.0-test.tar.gz`.
  - `pnpm verify-artifact -- --version 0.99.0-test` → passed, `release artifact verified successfully.`
- Result: no unresolved P0 or P1 finding remains; the required repo/package release-gate commands all pass; compatibility coverage now exercises ESM, CJS, NodeNext, and Bundler consumers from both the packed publish tarballs and the actual extracted release artifact; the changelog is publication-ready; and no blocker waiver is required to close this follow-up.

## Definition Of Done

- Cross-resource operation changes cannot bypass target authorization.
- All request-controlled nested structures and derived pagination values are bounded safely.
- Bulk validation errors are complete, indexed, and deterministic.
- Denied fields cannot leak through sorting, distinct, logging, or HTTP serialization.
- OpenAPI output cannot silently differ from actual routing and inline data is safely embedded.
- Real release artifacts, all module systems, strict declarations, and executable docs are verified.
- Security-relevant consumer migrations are present in release notes.
- Package and repository release gates pass or have explicit maintainer-approved exceptions tracked outside this completed plan.
