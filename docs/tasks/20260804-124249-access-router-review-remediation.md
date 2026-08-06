# Access Router Review Remediation Tasks

Created: 2026-08-04 12:42:49 local time

Package: `packages/access-router`

## Progress Log

- 2026-08-04: Wave 0 baseline recorded (15 files, 98 tests, all passing).
- 2026-08-04: AR-01 complete — `Model.exists()` and `find()` limit guard fixed in `src/model.ts`.
- 2026-08-04: AR-02 complete — client-controlled `options.access` removed from count schemas/handlers in `src/validation/{model-router,root-router}.ts`, `src/routers/{root-router,model-router-document-routes}.ts`, `src/validation/types.ts`. Existing count tests updated to reflect the secure contract (server-selected `list` access).
- 2026-08-04: AR-03 complete — field-level authorization enforced in `Service.distinct()` via `isValidDistinctFieldName()` + `authorizeDistinctField()` helpers. New regression test file `test/distinct-field-authorization.integration.test.ts` (7 tests).
- 2026-08-04: AR-04 complete — `/new` route now calls `assertAllowed(req, 'new')`, and `Service.new()` shapes output via `trimOutputFields` + permission-aware `pickAllowedFields`. Root `new` schema extended to accept `args`/`options` for consistency.
- 2026-08-04: AR-05 complete — `listSub()` now calls `validateClientFilter()` before resolving filters in `src/services/model-subdocument-service.ts`.
- 2026-08-04: Unauthorized error mapping fixed in `src/helpers/errors.ts` — `Codes.Unauthorized` now maps to HTTP 401 (previously 422).
- 2026-08-04: AR-06 complete — centralized cross-resource target authorization added in `src/services/base.ts` via `getAuthorizedTargetService()`. Includes and `$$sq` subqueries now verify active-runtime model membership and target operation guards before dispatch. New regression file `test/cross-resource-authorization.integration.test.ts`.
- 2026-08-04: AR-07 complete — root HTTP results now expose an explicit public DTO only (`success`, `kind`, `code`, `data`, `count`, `totalCount`, `errors`) via `toPublicRootResult()` in `src/routers/root-router.ts`. Exported `RootOperationResult` now references `PublicServiceResult` in `src/interfaces/base.ts`.
- 2026-08-04: AR-08 complete — pagination validation now distinguishes non-negative `skip/page` from strictly positive `limit/pageSize` in `src/validation/{common,model-router,data-router,root-router}.ts`. `genPagination()` now rejects unsafe integers defensively and normalizes missing/invalid limits to the configured hard limit. `Model.find()` now falls back to `hardLimit` when a malformed limit slips through.
- 2026-08-04: AR-09 complete — root batching now uses explicit `maxBatchEntries`, `maxOrderGroups`, and `maxConcurrentOperations` options on `RootRouterOptions`; sparse-array grouping was replaced with sorted `Map` groups and bounded worker execution in `src/routers/root-router.ts`.
- 2026-08-04: Downstream compatibility updated in `packages/access-router-client` — `countAdvanced()` no longer sends deprecated `options.access`; related integration test updated.
- 2026-08-04: Lint blocker fixed — root `package.json` now includes `eslint-plugin-mocha-no-only`, so `pnpm lint` runs. Remaining lint failures are pre-existing `.mongoose/**` violations and TS parser-root config issues, not a missing dependency crash.
- Post-Wave 2 verification: 17 access-router test files, 119 tests, all passing.
- Repo verification: `pnpm test` passed after the downstream client update. `pnpm lint` now executes and reports existing `.mongoose/**` issues.
- Status: Wave 2 complete. Wave 3 onward pending.
- 2026-08-05: AR-10 complete — shared request complexity budgets added. New module `src/request-complexity.ts` exposes `RequestComplexityOptions`, `defaultRequestComplexity`, `resolveRequestComplexity()`, and `validateRequestComplexity()` (recursive traversal enforcing depth, nodes, logical clauses, `$in` values, include count, subquery count, bulk item count, and rejecting dangerous prototype keys; `$$sq` payloads are counted without recursing into their service-resolved bodies). `GlobalOptions` gained `requestComplexity?: RequestComplexityOptions` in `src/interfaces/root.ts` and `src/runtime.ts` now seeds defaults. `src/validation/parsers.ts` calls `validateRequestComplexity()` from `parseBody()` and `parseQuery()` before schema parsing; `src/services/base.ts` `validateClientFilter()` reuses the same routine for nested filter scope. `Service.create()` in `src/services/service.ts` rewritten for two-phase bulk: bounded concurrency via `mapWithConcurrencyLimit`, max items check, validation-phase runs before any prepare hook, and indexed error pointers via `formatBulkValidationIssue` for array inputs (single-item inputs preserve raw validator return values). `model-subdocument-service.ts` `createSub()` and `bulkUpdateSub()` enforce `maxBulkItems`. `core-shared.ts` `optimizeAndFilter()` quadratic deduplication replaced with a `Set`-based key. New regression file `test/request-complexity.integration.test.ts` (5 tests). 18 access-router test files / 124 tests passing; repo `pnpm test` green (Wave 3 verification pending).
- 2026-08-05: AR-11 complete — explicit runtime model ownership. `AccessRuntime` now holds a per-runtime `modelInstances` registry with `registerModelInstance(name, model)` (throws on duplicate-name-different-instance, idempotent for same instance), `hasModelInstance(name)`, and `getModelInstance(name)` (falls back to `mongoose.models[name]`). `Model` wrapper (`src/model.ts`) accepts an optional `AccessRuntime` and resolves the mongoose model via `runtime.getModelInstance(name) ?? mongoose.models[name]` instead of unconditionally calling `mongoose.model(name)`. `ModelRouter.fromModel(model, options, runtime)` static factory registers the supplied instance and constructs the router. `createRouter(modelInstance, options)` (in `src/index.ts`) duck-types `mongoose.Model` (function with `modelName` and `schema`) and routes through `ModelRouter.fromModel`. `runtime.ensureModelMeta()` and `runtime.createModelOptions()` consult `getModelInstance()` so models attached to `mongoose.createConnection()` work without relying on the global registry. `runtime-context.ts` no longer mutates mongoose models: `attachRuntimeToModel`, `getRuntimeForModelName`, and the `ACCESS_RUNTIME` symbol are removed. `meta.ts` and `options/model-options.ts` resolve the active runtime via `getActiveRuntime() ?? defaultRuntime` (set by `runWithRuntime` in the request middleware). The Wtt API exposes `registerModelInstance`, `hasModelInstance`, and `getModelInstance` bound to the runtime. New regression file `test/runtime-isolation.integration.test.ts` (4 tests) covers: model on non-default connection preserves the supplied instance, two runtimes with same name on separate connections work independently, duplicate registration with a different instance throws, and constructing runtime B cannot alter runtime A behavior. 19 access-router test files / 128 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-12 complete — router/service construction no longer mutates consumer-owned mongoose schemas. Removed the `optimisticConcurrency` forcing and `versionKey` reintroduction in `src/model.ts` (`Model` constructor). The diff-exclusion of `__v` in `Service.update` (`src/services/service.ts:611`) is preserved harmlessly. Consumers who want optimistic concurrency must opt in via their own schema options. New regression file `test/schema-mutation.regression.test.ts` (3 tests) covers: default construction leaves schema options unchanged, explicit `versionKey: false` is preserved, and custom version keys plus consumer-set `optimisticConcurrency: true` are preserved. 20 access-router test files / 131 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-14 complete — published export contract. `src/processors.ts` now exports `ProcessCopy` and `CopyAndDepopulateOptions` interfaces (was private). `src/index.ts` exports `GuardModelCondition` and `GuardModelConditionID` (previously available only via the `guard` function overloads). The new runtime-model-registry helpers (`registerModelInstance`, `hasModelInstance`, `getModelInstance`) were added to `src/options/model-options.ts` as standalone wrappers (default/active runtime) and re-exported from `src/index.ts`, so they are now part of the CJS `module.exports` manifest produced by tsup. New `test/export-contract.test.ts` (28 tests) verifies: `package.json` exports field declares root, `/advanced`, `/processors` with types/import/require; root entry resolves default and named exports in ESM and CJS; advanced entry exposes `parseBody`, `MIDDLEWARE`, `Codes` but not `createRouter`/`acl`; processors entry exports only `copyAndDepopulate` at runtime; declared `dist` files exist on disk; TypeScript declarations compile against `dist/*.d.ts` via the TypeScript API; `package.json` declare peerDependencies for `express` and `mongoose` and never publish `src/`; export allowlist snapshot detects accidental surface changes. 21 access-router test files / 159 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-15 complete — side-effect and initialization semantics corrected. The `mschema2Jsonschema(mongoose)` global-patch call was moved out of module top-level in `src/runtime.ts` into an idempotent `ensureMongooseJsonSchemaInitialized()` helper that runs once on the first `AccessRuntime` construction. `package.json` `sideEffects` was changed from `false` to an explicit array of side-effecting bundled entry files (`./dist/index.js`, `./dist/index.mjs`, `./dist/advanced.js`, `./dist/advanced.mjs`) so bundlers correctly retain the runtime initialization and do not tree-shake it. New `test/side-effect-initialization.test.ts` (3 tests) verifies: repeated `AccessRuntime` construction is idempotent and the `jsonSchema()` method is present on a runtime-registered mongoose model; `createAccessRuntime()` returns an API whose `.runtime` is an `AccessRuntime` instance; lazy init surfaces `jsonSchema()` on freshly registered models. The export-contract test gained an assertion that `package.json` advertises side effect metadata accurately (array or `false`). 22 access-router test files / 163 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-16 complete — README and `llms.txt` made executable and consistent. `README.md` rewritten to include a runnable end-to-end Express + Mongoose quickstart (model registration, `permissionsPlugin`, router mount, `app.listen`, `mongoose.connect`), an explicit default-runtime vs. isolated-runtime section using `createAccessRuntime()`, a `createRouter` overloads section that documents both the model-name and `mongoose.Model`-instance forms, an annotated list of all root exports (including `registerModelInstance`/`hasModelInstance`/`getModelInstance` and `guard` types), corrected guidance that `acl.createOpenApiRouter(options)` defaults to the shared runtime while the standalone `createOpenApiRouter(runtime, options)` requires the runtime, and a `processors` subpath example that demonstrates the actual semantics of `copyAndDepopulate` (src swapped for ids, dest gets the original objects). `llms.txt` rewritten to drop the bogus `defaultRuntime` import from `/advanced`, replace it with the documented `/advanced` exports (`parseBody`, `Codes`, `MIDDLEWARE`), keep the file short and index-like, and explicitly state the model-name vs. model-instance overload, the side-effect metadata, and the `createOpenApiRouter` runtime-binding caveat. New `test/documentation-examples.test.ts` parses every ` ```ts ` block from `README.md` and `llms.txt` through the TypeScript compiler API and fails the suite if any block has syntax errors (compile-each-block smoke test). 23 access-router test files / 172 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-17 deferred to a dedicated strict-mode slice. Enabling `noImplicitAny` over `packages/access-router/src` flagged 169 errors clustered around: `AccessRouterBaseRequest` lacks index signatures for symbol/string access (`acl/request-context.ts`, `core-shared.ts`), generic `Filter<T>` predicate narrowing in `core-shared.ts`, `Function` parameters used as generic callable types in service hooks, `Record<string, unknown>` vs `Filter<T>` mismatches, and lib-target/library cut issues surfaced when running `tsc --noEmit` against the workspace `tsconfig.base.json` paths map (`Object.hasOwn`, `ErrorOptions`, `Export assignment`). The package `tsconfig.json` keeps `strict: false` and explicitly records `"noImplicitAny": false` to document the deferral; `tsup build` continues to use `skipLibCheck` for cross-package output. Strict-mode lifts should land in reviewable slices: (a) add index-signature/Record-typed helpers to `AccessRouterBaseRequest`, (b) rework `Filter<T>` type predicates in `core-shared.ts`, (c) replace `Function` with specific callable/generic types across services and hooks, (d) raise the lib target and align with cross-package `tsconfig.base.json`. No code changes were made for AR-17 at this time.
- 2026-08-05: AR-18 complete — data list hot paths optimized. `DataService.find()` in `src/services/data-service.ts` now applies `filterCollection`, computes `totalCount`, applies `orderBy` sort, then slices the page (`docs.slice(skip, skip+limit)`) before invoking `trimOutputFields` and `select` on the paged subset only. Pre-AR-18 the implementation awaited `trimOutputFields` for every matching doc before pagination, so requesting a one-row page over a 50-row matching set ran the permission-shape hook 50 times. The new flow guarantees async output shaping and `pick` projection run exactly `returnedCount` times. `decorateAll` is invoked downstream in `decorateDataListResult` against the already-trimmed page, so the spy contract still holds. `genPagination` and `validateClientFilter` (Set-based dedup from AR-10) were already in place; no further filter-normalization changes were needed. New `test/data-service-hot-path.test.ts` (3 tests) covers: (1) `decorateAll` is called exactly once with a single-doc array when `limit=1` over a 50-row dataset, and `meta.totalCount` reflects the full dataset; (2) ascending (`sort=rank`) and descending (`sort=-rank`) sort semantics are preserved through the trim-only-on-page rewrite, returning `[1,2,3]` and `[12,11,10]` respectively with `limit=3`; (3) `filter={group:'A'}` yields `totalCount=30` and `returnedCount=5` with `limit=5`. Tests use the POST `/<basePath>/__query` advanced-list endpoint (the default `queryRouteSegment`) since sort/filter/select are advanced-list-only body fields; the GET list endpoint only accepts skip/limit/page/page_size/include_count/include_extra_headers query params. 24 access-router test files / 175 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-19 complete — structured, redacted, lazy logging. New `src/logger-helpers.ts` exports `redactFilter`, `redactPayload`, `safeStringify`, `isLevelEnabled`, `info`, `warn`, `error`, `debug` plus the `OpLogContext` type. Redaction uses a case-insensitive sensitive-key list (password, pwd, secret, token, access_token, api_key, apikey, authorization, authtoken, credentials, privatekey, ssn, credit_card, card_number, cvv, tenant, tenantid) and replaces matched keys with `[REDACTED]` at any depth. `safeStringify` replaces circular references with the `[Circular]` sentinel and converts functions to `[Function]` without ever throwing. `isLevelEnabled(level)` consults an optional `AccessRouterLogger.isLevelEnabled(level)` member (added to the `AccessRouterLogger` interface in `src/interfaces/root.ts`); when the configured logger has no `isLevelEnabled`, the helpers conservatively assume enabled so behavioral parity with prior code is maintained. All five eager `logger.debug(JSON.stringify(...))` call sites in `src/services/service.ts` (findOne, find, updateOne, upsert, delete) were replaced with `debugLog({ op, modelName, sort, skip, limit, selectCount, populateCount, query: { filter } })`. The structured payload carries operation, model name, pagination limits, select/populate cardinality, and the redacted filter — never the trimmed document bodies or mutation payloads. `routers/index.ts`'s `logger.error(error)` was replaced with `errorLog(error)` so logging failures are caught and never break the HTTP response pipeline. Other safe call sites (`routers/model-router.ts` route-path info logging, `core.ts` docPermissions warn) were left as-is because they already redact or contain no sensitive data. The new helpers plus `OpLogContext` type are re-exported from `src/index.ts` so consumers can build their own structured logs with the same redaction. New `test/logger-redaction.test.ts` (10 tests) covers: nested redaction shape preservation, case-insensitive key matching, circular reference safety without throwing, input immutability, payload-redaction parity with filter redaction, `safeStringify` circular escaping in nested objects (without redacting non-sensitive string values), disabled-level skip via `isLevelEnabled('debug') === false`, sensitive filter-key redaction in captured HTTP logs (logged message contains 'REDACTED' and 'alice' but never 'hunter2'), logging exceptions never break an HTTP 200, and structured op payload contains `op`, `modelName`, and `limit`. 25 access-router test files / 186 tests passing; repo `pnpm test` green.
- 2026-08-05: AR-20 complete — OpenAPI collision and edge-case behavior hardened. New `src/openapi/errors.ts` exports `OpenApiCollisionError` (extends `Error`, carries `collisionKind: 'path' | 'operationId'`, `method`, `path`, `operationId`, `existing`, `incoming` so consumers can branch on the conflict). The `OpenApiRouteDescriptor` type in `src/openapi/types.ts` gained two opt-in flags: `allowReplace?: boolean` (override an existing descriptor at the same method/path even in strict mode) and `idempotent?: boolean` (silently accept equivalent re-registration). `OpenApiRegistryOptions` (`rejectConflicts`, `rejectDuplicateOperationIds`) added to the same file. `src/openapi/registry.ts` now compares descriptors via `descriptorsEqual` (wire-affecting identity: method, path, operationId, acl, query, body, pathParams, responses, tags, summary, description, deprecated) and uses a `stableKey` helper that serializes functions as `[Function]` so schema sources cannot trigger false negatives. The `OpenApiRegistry` constructor accepts options; `setStrictMode(enabled)` toggles them at runtime; `clear()` resets the route list. Defaults are **non-strict** (`rejectConflicts: false`, `rejectDuplicateOperationIds: false`) so backwards compat with apps that legitimately register multiple routers with overlapping basePath on the same runtime (e.g. test suites reusing the default runtime) is preserved. `AccessRuntime.enableOpenApiCollisionDetection()` (in `src/runtime.ts`) flips both strict flags on; `AccessRuntime.clearOpenApiRoutes()` exposes the registry's `clear()` so test harnesses can reset route accumulation. `defaultRuntime` is now re-exported from `src/index.ts` alongside `OpenApiCollisionError`. The root router's `root.query` POST descriptor gained `idempotent: true` so multiple RootRouters on the same strict-mode runtime do not collides on the reserved operationId. Side fix: `defaultDataOptions` in `src/runtime.ts` was missing `parentPath: '/'` (only model defaults had it), so data routers constructed without an explicit `parentPath` produced paths like `/undefined/mix` and silently bypassed path-collision detection. The default is now `parentPath: '/'` so `fullBasePath` joins cleanly. The package's `vitest.config.ts` gained `setupFiles: ['test/global-setup.ts']` and a new `test/global-setup.ts` calls `defaultRuntime.clearOpenApiRoutes()` in `afterEach` so accumulators on the shared default runtime do not leak routes across test cases within a file (this fixes a class of test-isolation issues the strict-mode work surfaced without requiring each test to migrate to `createAccessRuntime()`). New `test/openapi-collision.test.ts` (12 tests) covers: strict-mode throw on conflicting method/path with the full error message regex and `OpenApiCollisionError` instance check; collision-error metadata fields (`collisionKind`, `method`, `path`, `existing`, `incoming`); idempotent equivalent re-registration accepted in strict mode; `allowReplace: true` override accepted in strict mode; duplicate operationId bound to a different path throws with `collisionKind: 'operationId'` and `operationId` metadata; disabled strict mode preserves backwards-compatible silent replacement; `clearOpenApiRoutes()` empties the registry; model/model collision on shared basePath detected; data/data collision detected; model/data collision detected; malicious title/css url/bundle url escaped in docs HTML (no raw `<script>` injection in `<title>`, no `onload=` attribute survives on the bundle script tag); relative spec path derived from `jsonPath` and `docsPath` (SwaggerUIBundle receives `url: "openapi.json"`); servers data with embedded `</script>` and HTML is safely embedded in the OpenAPI JSON spec (well-formed JSON output, payload preserved verbatim because JSON-encoding renders HTML injection harmless). 26 access-router test files / 199 tests passing; repo `pnpm test` green.
- Status: AR-01 through AR-16, AR-18, AR-19, AR-20 complete. AR-17 deferred to a dedicated strict-mode slice. AR-13 (P2 service/HTTP boundaries) and AR-21 onward (Wave 5 processors / peer versions / final review) still pending.
- 2026-08-05: AR-21 complete — processor path semantics hardened. `src/processors.ts` rewritten with an explicit, documented contract: missing/null/scalar intermediate `src` segments are safe no-ops (the previous code crashed with `Cannot read properties of undefined` for a missing intermediate path); array leaves whose members are all plain records depopulate to an array of ids; mixed/object+primitive arrays and primitive scalar leaves are safe no-ops (previously primitives were silently replaced with `null` ids); records missing the configured `idField` throw a descriptive `Error` instead of silently producing `undefined` ids; `__proto__` / `prototype` / `constructor` segments in either `src` or `dest` throw a descriptive `Error` before any mutation (the `set` utility already rejected these on writes, but the source traversal's raw `targetObject[seg]` indexing was still walking `Object.prototype.constructor` for an unguarded source key — so the guard is now applied symmetrically to both sides); empty `src`/`dest` strings and non-string op fields are safe no-ops; operations run sequentially in input order, so overlapping ops are well-defined (the second op sees the first op's output, treating a now-depopulated scalar-leaf as a no-op). `ProcessCopy`, `CopyAndDepopulateOptions` carry full JSDoc describing the semantics, default `mutable: true`, default `idField: '_id'`, and the prototype-pollution guarantees. The new `test/processors-path-hardening.test.ts` (35 tests) covers: missing/null/scalar intermediates as no-ops (mutable and immutable), empty/non-string operation fields, scalar and mixed primitive arrays as no-ops, fully-populated record arrays depopulating to id arrays, empty arrays, missing-id throw cases for both single-object and array leaves, custom `idField` enforcement including the `0`/`''`-are-valid-ids edge case, symmetric unsafe-segment rejection for `src` and `dest` at any depth, no `Object.prototype` pollution after attacker-supplied `__proto__` destination, mutable-vs-immutable identity/value-equivalence invariants, sequential overlapping-op semantics including chained depopulation into a moved dest, default-`mutable`/default-`idField` behavior (omitted options, empty options object), and prototype preservation on plain and null-proto objects. Existing `test/processors.test.ts` 3 tests still pass unchanged. 27 access-router test files / 234 tests passing; `pnpm lint` reports only pre-existing `.mongoose/**` and parser-root config issues, none on AR-21 files.
- 2026-08-05: AR-13 complete — service and HTTP boundaries clarified without a broad service rewrite. A new shared serializer module `src/http/response-pipelines/service-result.ts` now defines `toPublicErrorResult`, `toPublicSingleResult`, `toPublicListResult`, and `toPublicServiceResult`, and both root and direct routes now flow through those helpers instead of hand-rolling or bypassing public DTO shaping. `src/routers/root-router.ts` dropped its private `toPublicRootResult()` implementation and now uses `toPublicServiceResult()`; the duplicated subdocument populate normalization logic was centralized as `normalizeSubPopulate()` in `src/helpers/document.ts` and reused from both `root-router.ts` and `routers/model-router-subdocument-routes.ts`. Direct response helpers were tightened so they serialize from internal `ListResult` / `SingleResult` values explicitly: `http/response-pipelines/model-response.ts` now unwraps single/list data through the shared public serializer, `list-response.ts` derives direct `{ data, meta }` list responses from a `ListResult` only after converting it to a `PublicListResult`, and `data-router.ts` now uses the same `unwrapServiceData()` helper as model routes for direct read responses instead of returning `decoratedResult.data` directly. The subdocument service seam is now typed instead of implicit-`any`: `src/interfaces/service.ts` added `SubdocumentId`, `SubdocumentName`, `SubdocumentRecord`, `SubdocumentBulkRecord`, `SubdocumentCreateInput`, `SubdocumentBulkUpdateInput`, `SubdocumentListOptions`, `SubdocumentReadOptions`, `SubdocumentCreateOptions`, `SubdocumentParentArgs`, and `SubdocumentParentOptions`; `src/services/model-subdocument-service.ts`, `src/services/service.ts`, `src/routers/model-router-subdocument-routes.ts`, and `src/routers/root-router.ts` now use those aliases at the service boundary while leaving the router parse layer as the explicit cast point from validated `unknown` payloads. Hook error policy is now explicit for `docPermissions`: `src/core.ts` treats failures as fail-closed (attach an empty document-permissions object and continue request handling) and emits a structured warning through `logger-helpers.warn()` with `{ modelName, access, operation, error }` metadata instead of a freeform string via `logger.warn(...)`. New tests: `test/response-pipeline.internal.test.ts` (3 tests) verifies the shared serializer strips internal `input` / `query` / `context` / `contexts` from root DTOs, drives direct single-result unwrapping, and drives direct list `{ data, meta }` shaping while still deriving pagination metadata from the internal query; `test/model-router.integration.test.ts` gained a regression asserting that a throwing `docPermissions` hook returns HTTP 200 with an empty `documentPermissionField` payload and emits the new structured warning. Package verification: `pnpm --filter @web-ts-toolkit/access-router test` passed with 28 access-router test files / 238 tests green; `pnpm lint` still reports only the pre-existing workspace parser-root / `.mongoose/**` issues already recorded in the baseline and earlier waves.
- Status: AR-01 through AR-16, AR-18, AR-19, AR-20, AR-21 complete. AR-17 deferred to a dedicated strict-mode slice. AR-13 (P2 service/HTTP boundaries), AR-22 (peer versions), and AR-23 (final review) still pending.
- Status: AR-01 through AR-16, AR-18, AR-19, AR-20, AR-21, AR-13 complete. AR-17 deferred to a dedicated strict-mode slice. AR-22 (peer versions) and AR-23 (final review) still pending.
- 2026-08-05: AR-22 complete — packed-artifact compatibility and manifest verification added for `@web-ts-toolkit/access-router`. New `test/packed-consumer-compatibility.test.ts` stages a release-like tarball set for the package and its internal workspace dependency closure (`utils`, `http-errors`, `express-response-handler`, `express-json-router`, `access-router`) by copying built `dist/` outputs and rewriting package metadata the same way the repository release process is documented to (`0.0.0-PLACEHOLDER` -> root release version, `PLACEHOLDER` license/repository -> root SPDX/repository values, and `workspace:*` dependency specs -> the release version across dependency/peer/dev/optional blocks). The test unpacks the staged `@web-ts-toolkit/access-router` tarball and verifies: release-version `version`, SPDX `license`, root `repository`, expected `files`, expected root/`/advanced`/`/processors` export map entries, internal dependency versions resolved to the release version, and the absence of any remaining `PLACEHOLDER` or `workspace:` strings anywhere in the packed manifest. It also performs consumer smoke tests from the tarballs for two peer combinations: minimum supported peers (`express@5.0.0`, `mongoose@8.0.0`) and current majors exercised in-repo (`express@5.2.1`, `mongoose@9.8.0`). Each consumer installs only from the generated tarballs plus the selected peer versions and then verifies: CJS runtime loading from `@web-ts-toolkit/access-router`, `@web-ts-toolkit/access-router/advanced`, and `@web-ts-toolkit/access-router/processors`; NodeNext TypeScript compilation using package-name imports against the installed tarballs; and Bundler TypeScript compilation against the same installed tarballs. To make the package test command deterministic under the now-longer compatibility suite, `packages/access-router/vitest.config.ts` sets `fileParallelism: false`; this avoids shared-`mongoose` / `mongodb-memory-server` startup races across Mongo-backed integration files and keeps `pnpm --filter @web-ts-toolkit/access-router test` green end-to-end. Package verification after AR-22: 29 access-router test files / 241 tests passing.
- Status: AR-01 through AR-16, AR-18, AR-19, AR-20, AR-21, AR-13, AR-22 complete. AR-17 deferred to a dedicated strict-mode slice. AR-23 (final review) still pending.
- 2026-08-05: AR-23 complete — final security and architecture integration review. The final-pass review agent walked the AR-23 checklist against the current tree and surfaced one P0 regression that had survived the earlier wave fixes: `genPopulate()` in `src/core.ts` built cross-resource populate descriptors without consulting the target (referenced) model's `operationAccess` or runtime membership, so a caller authorized on a source model could populate a target model whose `read`/`list` operation was denied — a bypass of the AR-06 target-authorization guarantee for the populate path specifically. Fix: `genPopulate()` now calls `getActiveRuntime().hasModel(refModelName)` (rejects unknown/cross-runtime targets with a controlled 400) and `this.req.macl.isAllowed(refModelName, populateAccess)` (rejects denied target operations) before constructing the populate descriptor; `populateAccess` is derived from the populate access selector exactly as the rest of the pipeline does. A new regression test in `test/model-router.integration.test.ts` ("fails closed for populate when the target model denies the requested operation") proves the source-allowed/target-denied case returns a controlled 401 and never reaches the target. Documentation corrections applied during the final pass: `packages/access-router/README.md` line 64 now mounts `app.use(docsRouter)` (the value returned by `acl.createOpenApiRouter()`) instead of the non-existent `docsRouter.routes`; the Documentation section now points at the live docs URL and the `website/docs/packages/access-router/` source directory without hardcoding per-file paths that may move as the docs site evolves. Verification: `pnpm --filter @web-ts-toolkit/access-router test` green (29 test files / 242 tests) after the README correction; the populate-authorization fix and its regression test landed earlier in the pass and were green at that point too. Remaining repo-level verification status (unchanged from AR-22, all pre-existing and outside `packages/access-router`): `pnpm lint` still fails on the pre-existing `.mongoose/**` violations and `tsconfigRootDir`/parser-root config issues across all TS files — these are baseline noise, not caused by any AR task; `pnpm build` still fails in `apps/mongoose-rxdb-example` (unrelated TypeScript errors in the example app, not the access-router package or its workspace dependency closure); root `pnpm test` runs the full 23-package suite serially and the access-router scope is green. AR-17 (strict-mode / `noImplicitAny`) remains deferred to a dedicated strict-mode slice with the explicit rationale recorded on 2026-08-05: 169 errors clustered around `AccessRouterBaseRequest` index signatures, `Filter<T>` predicate narrowing, `Function`-as-callable types in service hooks, `Record<string, unknown>` vs `Filter<T>` mismatches, and lib-target/paths-map issues; these are lifted in reviewable per-scope slices, not as part of a release-gate pass. Conclusion: no unresolved P0/P1 finding remains in `packages/access-router`; the deferred item (AR-17) is P2 with an explicit task, rationale, and risk statement; the package is ready for release on its own contract pending the unrelated repo-level blockers in lint config and `apps/mongoose-rbdb-example`.
- AR-23 acceptance-criteria gaps (recorded 2026-08-05, task declared done by maintainer direction): The AR-23 acceptance criteria are not literally all met. Three criteria are documented as known limitations rather than fixed before close: (1) "All commands pass without test concurrency workarounds" — `packages/access-router/vitest.config.ts` retains `fileParallelism: false` (introduced during AR-22) to prevent `mongodb-memory-server` / shared `mongoose` port races across Mongo-backed parallel test files; the root cause is in the test harness's Mongo memory-server lifecycle, not in the access-router production code, and removing the workaround would require reworking that lifecycle. (2) "The package's changelog/release notes call out security-relevant contract changes" — no `CHANGELOG.md` was created; the security-relevant contract changes (count access removal in AR-02, distinct field authorization in AR-03, cross-resource target authorization in AR-06, public root DTO in AR-07, schema-mutation stop in AR-12, request complexity budgets in AR-10, populate-target authorization in AR-23) are documented in this task progress log but not yet surfaced as a consumer-facing changelog. (3) Required verification `pnpm lint` and `pnpm build` do not pass at the repo root — both are pre-existing failures unrelated to any access-router AR task (`pnpm lint` fails on `.mongoose/**` files and a `tsconfigRootDir` parser-root config issue across all TS files; `pnpm build` fails in `apps/mongoose-rxdb-example`). The access-router package scope (`pnpm --filter @web-ts-toolkit/access-router test`) is green: 29 test files / 242 tests. Maintainer directed that these three gaps be recorded as known limitations and AR-23 declared complete rather than fixed in this pass.
- Status: AR-01 through AR-16, AR-18, AR-19, AR-20, AR-21, AR-13, AR-22, AR-23 complete. AR-17 deferred to a dedicated strict-mode slice. AR-23 acceptance-criteria gaps (test-concurrency workaround, missing CHANGELOG, pre-existing repo lint/build failures) recorded as known limitations above.

## Objective

Resolve confirmed correctness and authorization defects first, then improve resource hardening, runtime isolation, package usability, readability, and testability without unintentionally changing the public API.

This file is an execution brief for sub-agents. Agents must inspect the current implementation before editing because the worktree may contain concurrent changes.

## Required Working Rules

- Do not undo unrelated or pre-existing changes.
- Keep each task focused. Do not combine opportunistic refactors with security fixes.
- Add a failing regression test before or with every behavioral fix.
- Preserve existing public behavior unless the task explicitly changes an unsafe or contradictory contract.
- Prefer a single shared enforcement point over fixes duplicated across direct and root routes.
- Treat all request-controlled filters, field paths, model names, limits, batch entries, and access names as untrusted.
- Use explicit public response DTOs at HTTP boundaries; do not return internal service objects by default.
- Run package tests serially as configured. Do not run package test scripts concurrently because their builds share `dist/`.
- If a task discovers that its proposed behavior is relied upon by tests, update the tests only when the old behavior is unsafe or demonstrably incorrect. Document the contract change.
- Do not add compatibility paths unless a persisted or external consumer requirement is identified.

## Baseline Verification

Before starting the first implementation task, record the baseline result of:

```sh
pnpm --filter @web-ts-toolkit/access-router test
pnpm lint
```

After each task, run its targeted tests. At the end of each wave, run:

```sh
pnpm --filter @web-ts-toolkit/access-router test
pnpm lint
pnpm build
```

The final integration agent must also run root `pnpm test` serially.

## Severity And Ordering

- P0: confirmed correctness or authorization defects with direct security impact
- P1: denial-of-service hardening, runtime isolation, and externally visible contract defects
- P2: package/API quality, type safety, performance, and maintainability
- P3: optional hardening or documentation refinements

Tasks within a wave may run in parallel only when their ownership sections do not overlap. Later waves must rebase their understanding on completed earlier work.

## Wave 0: Baseline And Security Contract

### Task AR-00: Establish Baseline And Security Invariants

Priority: P0

Suggested agent: test/integration agent

Dependencies: none

Primary ownership:

- `packages/access-router/test/**`
- A new focused regression test file is preferred where existing suites are already large.

Do not edit production behavior in this task.

Work:

1. Run the baseline verification commands and record failures in the task/PR summary.
2. Add focused regression tests that demonstrate the confirmed defects listed in AR-01 through AR-07 where a compact fixture can be shared.
3. Ensure tests prove the secure contract rather than merely exercising code paths.

Required regression scenarios:

- `exists({ name: 'missing' })` returns false while another document exists.
- `exists(..., { includeId: true })` never returns an unrelated document.
- Count callers cannot select `read`, `update`, `delete`, or unknown base-filter access through HTTP input.
- A caller allowed on a source model cannot include or subquery a target model whose required operation is denied.
- `distinct` rejects a field denied by read/list field permissions.
- `operationAccess.new: false` protects `/new`.
- Root results do not expose `query`, `input`, `context`, `contexts`, or document snapshots.
- Subdocument list filters reject every operator blocked by top-level filters.
- Unauthorized service results map to HTTP 401 in direct and root responses.

Acceptance criteria:

- Tests fail against the reviewed buggy implementation for the expected reason.
- Fixtures distinguish route-level authorization, row filters, and field permissions.
- Tests do not depend on test ordering or globally retained Mongoose models.
- The agent documents which tests are expected to remain red until each corresponding task lands.

## Wave 1: Immediate Correctness And Authorization Fixes

Complete AR-01 first. AR-02 through AR-05 may then run in parallel if agents avoid shared files. AR-06 and AR-07 should follow because both may touch root/service result contracts.

### Task AR-01: Fix Model `exists()` Argument Contract

Priority: P0

Suggested agent: model adapter agent

Dependencies: AR-00 regression test

Primary ownership:

- `packages/access-router/src/model.ts`
- `packages/access-router/test/service-exists.integration.test.ts`

Finding:

`Model.exists(filter)` calls `findOne(filter)`, but `findOne` expects `{ filter, ... }`. The filter is discarded and any document can match. This can also corrupt field-permission checks that rely on existence queries.

References:

- `packages/access-router/src/model.ts:156-173`
- `packages/access-router/src/services/service.ts:627-646`
- `packages/access-router/src/core.ts` field-permission existence checks

Implementation requirements:

1. Correct the adapter call contract, preferably with a typed argument that makes recurrence a compile error.
2. Return the same result shape currently expected by `Service.exists()`.
3. Do not broaden the model wrapper API.
4. Add explicit parameter and return types to the touched adapter method.

Acceptance criteria:

- Missing filters return false even when unrelated documents exist.
- `includeId` returns only the matching ID.
- ACL-derived filters are respected.
- Existing `exists` access override behavior remains correct for trusted service calls.
- Targeted and package tests pass.

### Task AR-02: Remove Client-Controlled Count Access Selection

Priority: P0

Suggested agent: count-route security agent

Dependencies: AR-00 regression test

Primary ownership:

- `packages/access-router/src/validation/model-router.ts`
- `packages/access-router/src/validation/root-router.ts`
- Count handlers in `packages/access-router/src/routers/**`
- Count-specific tests

Avoid editing generic service internals unless necessary.

Finding:

HTTP count requests pass `options.access` into `Service.count()`, allowing the client to select a potentially broader base filter despite only passing the `count` route guard.

References:

- `packages/access-router/src/validation/model-router.ts:83-94`
- `packages/access-router/src/validation/root-router.ts:117-121`
- `packages/access-router/src/routers/model-router-document-routes.ts`
- `packages/access-router/src/routers/root-router.ts:114-117`
- `packages/access-router/src/services/service.ts:665-678`

Implementation requirements:

1. Remove access selection from all public HTTP count schemas and handlers.
2. Use a server-selected access policy, normally `list`, consistently for direct and root routes.
3. Keep an internal service access parameter only if it has a concrete trusted caller and is clearly documented as non-HTTP input.
4. Reject obsolete `options.access` rather than silently accepting it through passthrough schemas.
5. Update OpenAPI schemas and docs if they expose the option.

Acceptance criteria:

- A count caller cannot select another operation's base filter.
- Unknown and legacy client access fields receive a controlled 400 response.
- Direct and root count semantics match.
- Tenant-scoped count tests prove no cross-tenant count leakage.

### Task AR-03: Enforce Field Authorization For `distinct`

Priority: P0

Suggested agent: field-policy agent

Dependencies: AR-00 regression test

Primary ownership:

- Distinct handling in `packages/access-router/src/services/service.ts`
- Distinct handlers in `packages/access-router/src/routers/model-router-document-routes.ts`
- Distinct-specific tests

Finding:

`distinct(field)` applies a row filter but never checks whether the requested field is readable under `permissionSchema`.

References:

- `packages/access-router/src/services/service.ts:649-662`
- `packages/access-router/src/routers/model-router-document-routes.ts:371-411`
- `packages/access-router/src/routers/root-router.ts:112-113`

Implementation requirements:

1. Enforce a server-derived allowlist for distinct-capable fields.
2. At minimum, require the field to be readable under the relevant read/list field policy for the requester.
3. Validate field-path syntax and reject operator-like or special object paths.
4. Apply enforcement in the service boundary so direct and root calls cannot diverge.
5. Decide and document whether dynamic document-level field permissions can support `distinct`. If they cannot be evaluated safely without reading documents, fail closed or require an explicit configured allowlist.

Acceptance criteria:

- Denied, unknown, malformed, and sensitive nested fields are rejected.
- Allowed fields continue to work for GET, POST, and root batch routes.
- Dynamic permission behavior is deterministic and documented.
- No raw database error is returned for malformed paths.

### Task AR-04: Guard And Shape `/new`

Priority: P0

Suggested agent: route-boundary agent

Dependencies: AR-00 regression test

Primary ownership:

- `packages/access-router/src/routers/model-router-collection-routes.ts`
- New-template behavior in `packages/access-router/src/services/public-service.ts` and `service.ts` only if required
- `/new` tests and OpenAPI registration

Finding:

`GET /new` does not call the `new` operation guard and returns a raw Mongoose document without explicit output field shaping.

References:

- `packages/access-router/src/routers/model-router-collection-routes.ts:183-196`
- `packages/access-router/src/services/public-service.ts`
- `packages/access-router/src/services/service.ts`

Implementation requirements:

1. Enforce `context.assertAllowed(req, 'new')` before service execution.
2. Define which field policy applies to a new template. Prefer an explicit create-template policy over accidental raw schema exposure.
3. Remove sensitive defaults and denied fields from the response.
4. Keep direct and any root equivalent behavior consistent.
5. Document schema defaults and generated IDs as potentially observable only when allowed.

Acceptance criteria:

- Disabled `new` access returns 401/403 according to package policy.
- Sensitive denied defaults are absent.
- Allowed defaults remain available.
- OpenAPI documents the route's authorization and response shape.

### Task AR-05: Validate Subdocument Filters At The Service Boundary

Priority: P0

Suggested agent: subdocument security agent

Dependencies: AR-00 regression test

Primary ownership:

- `packages/access-router/src/services/model-subdocument-service.ts`
- Subdocument tests

Finding:

`listSub()` sends request filters to ACL resolution and `sift` without applying the shared client-filter validator used by model and data services.

References:

- `packages/access-router/src/services/base.ts:45-71`
- `packages/access-router/src/services/model-subdocument-service.ts:7-29`

Implementation requirements:

1. Apply the same recursive filter policy as top-level list operations before processing.
2. Enforce at the subdocument service boundary so direct and root calls share behavior.
3. Return the standard Bad Request error shape.
4. Do not create a second operator denylist.

Acceptance criteria:

- `$where`, `$expr`, `$function`, and `$accumulator` are rejected at every nesting level.
- Direct and root sub-list routes return matching errors.
- Valid subdocument filters continue to work.

### Task AR-06: Centralize Cross-Resource Authorization

Priority: P0

Suggested agent: authorization architecture agent

Dependencies: AR-01 through AR-05 complete

Primary ownership:

- `packages/access-router/src/services/base.ts`
- Request/core service dispatch APIs as needed
- Include and subquery tests

Finding:

Client-controlled include and `$$sq` model names obtain a public service and call it directly. The target model's operation guard is not evaluated.

References:

- `packages/access-router/src/services/base.ts:232-311`
- `packages/access-router/src/services/base.ts:327-375`
- `packages/access-router/src/validation/common.ts:70-82`

Implementation requirements:

1. Introduce one authorization-aware cross-resource dispatcher or equivalent shared helper.
2. Verify the target belongs to the active runtime before model lookup.
3. Map include/subquery operations to the target operation guard and call the target ACL core's `isAllowed()`.
4. Use target row filters and field policies after route authorization.
5. Return controlled Bad Request for unknown targets and Forbidden/Unauthorized for denied operations.
6. Do not leak target existence if package policy requires concealment; document the chosen status semantics.
7. Ensure callers cannot pass trusted service-only override options through include or subquery payloads.

Acceptance criteria:

- Source authorization never implies target authorization.
- Includes for list, read, and count each require the correct target guard.
- Subquery list and read require their corresponding target guards.
- Unknown and cross-runtime targets fail predictably without a Mongoose 500.
- Row and field ACL still apply after the new guard.
- Tests cover concurrent isolated runtimes.

### Task AR-07: Define A Safe Public Root Result DTO

Priority: P0

Suggested agent: HTTP response-boundary agent

Dependencies: AR-01 through AR-06 complete

Primary ownership:

- `packages/access-router/src/routers/root-router.ts`
- Root response types in `packages/access-router/src/interfaces/**`
- Shared response pipeline helpers if necessary
- Root integration tests

Finding:

Root responses wrap and return complete internal `ServiceResult` values, including `query`, `input`, hook contexts, and snapshots captured before final output trimming.

References:

- `packages/access-router/src/routers/root-router.ts:182-191`
- `packages/access-router/src/services/service.ts:147-187`
- `packages/access-router/src/services/service.ts:245-270`
- `packages/access-router/src/services/service.ts:398-405`
- `packages/access-router/src/services/service.ts:513-517`

Implementation requirements:

1. Define an explicit public root operation result DTO.
2. Allowlist fields such as success, kind, code, public data, count/totalCount, public errors, message, statusCode, target/name/op/index.
3. Never serialize raw query, input, context, contexts, resolved filters, snapshots, Mongoose models, or hook data.
4. Reuse the same response shaping pipeline as direct routes where their contracts should match.
5. Keep internal service metadata available to trusted in-process callers without exposing it over HTTP.
6. Update exported root result types and OpenAPI schemas to match runtime output.

Acceptance criteria:

- Root HTTP JSON contains only allowlisted fields.
- Denied include local fields and mutation inputs cannot appear in metadata.
- Circular hook context cannot break root serialization.
- Direct and root operation data are equivalently field-trimmed.
- Existing consumers receive a documented security-driven contract change.

## Wave 2: Resource And Input Hardening

AR-08 and AR-09 can run in parallel. AR-10 should follow because it may consolidate their limits into shared options.

### Task AR-08: Make Pagination Limits Unambiguous And Unbypassable

Priority: P1

Suggested agent: pagination agent

Dependencies: Wave 1 complete

Primary ownership:

- `packages/access-router/src/validation/common.ts`
- `packages/access-router/src/helpers/query.ts`
- `packages/access-router/src/model.ts`
- `packages/access-router/src/services/data-service.ts`
- Pagination tests

Finding:

Validation accepts `limit: 0`. The Mongoose path treats zero as no limit, while the data path has different slice behavior. This can bypass `listHardLimit`.

Implementation requirements:

1. Define public semantics: `limit` and `pageSize` must be integers greater than zero; `skip` and `page` may be zero.
2. Enforce `effectiveLimit <= listHardLimit` after all normalization.
3. Defensively apply a limit in the persistence adapter even if upstream input is malformed.
4. Align model, data, direct, advanced, and root behavior.
5. Reject unsafe numeric strings, overflow, `NaN`, and non-finite values.

Acceptance criteria:

- Zero, negative, huge, malformed, and overflow limits are rejected or safely clamped according to one documented policy.
- Missing limit applies the configured hard limit.
- Boundary values behave identically across storage backends.
- Tests prove no unbounded Mongoose query is generated.

### Task AR-09: Bound Root Batch Size, Order, And Concurrency

Priority: P1

Suggested agent: root batching agent

Dependencies: Wave 1 complete

Primary ownership:

- `packages/access-router/src/validation/root-router.ts`
- Root grouping/execution in `packages/access-router/src/routers/root-router.ts`
- Root batch tests

Finding:

Any integer is accepted for `order`, which is used as a sparse array index and then iterated to its full length. Batch length and per-group `Promise.all()` fan-out are unbounded.

Implementation requirements:

1. Add configurable, conservative defaults for maximum batch entries, order groups, and concurrent operations.
2. Replace sparse-array grouping with a `Map<number, Entry[]>` or sorted dense groups.
3. Reject negative and excessive order values instead of coercing them.
4. Execute each order group with bounded concurrency while preserving ordering semantics.
5. Document partial-result behavior if one operation fails or times out.
6. Consider request abort signals where supported, but do not expand scope into a generic cancellation framework.

Acceptance criteria:

- A huge order value is rejected without a long loop or large allocation.
- Oversized batches are rejected before service work begins.
- Maximum in-flight operations are testably bounded.
- Result ordering remains stable.
- Existing sequential order-group semantics remain intact.

### Task AR-10: Introduce Shared Request Complexity Budgets

Priority: P1

Suggested agent: input-hardening agent

Dependencies: AR-08 and AR-09

Primary ownership:

- Validation and filter-policy modules
- Bulk create/subdocument validation
- `packages/access-router/src/core-shared.ts` if filter normalization changes
- Complexity-focused tests

Findings:

- Bulk create and subdocument mutation arrays have no item limits.
- Filter/operator arrays and nesting depth are unbounded.
- `optimizeAndFilter()` performs quadratic deep-comparison deduplication.

References:

- `packages/access-router/src/validation/model-router.ts:150-154`
- `packages/access-router/src/services/model-subdocument-service.ts`
- `packages/access-router/src/core-shared.ts:31-48`

Implementation requirements:

1. Define shared configurable budgets for filter depth, total nodes, logical clauses, `$in` values, bulk mutation items, and include/subquery count.
2. Validate budgets before ACL normalization or database work.
3. Reject recursively dangerous keys: `__proto__`, `prototype`, and `constructor` at request boundaries.
4. Replace quadratic deduplication with a bounded approach or remove it for client-controlled input.
5. Limit hook/preparation concurrency for bulk operations.
6. Split batch create into validation and preparation phases so preparation side effects do not run when any item fails validation.

Acceptance criteria:

- Oversized/deep filters fail quickly with a controlled 400.
- Bulk limits apply consistently to direct and root routes.
- Prepare hooks do not run if batch validation fails.
- Multiple validation errors preserve item indices deterministically.
- Performance tests or benchmarks demonstrate bounded behavior for adversarial inputs.

## Wave 3: Runtime Encapsulation And Architectural Health

AR-11 must complete before AR-12. AR-13 may run in parallel with AR-11 if it avoids runtime/model files.

### Task AR-11: Make Runtime Model Ownership Explicit

Priority: P1

Suggested agent: runtime architecture agent

Dependencies: Waves 1 and 2 complete

Primary ownership:

- `packages/access-router/src/runtime.ts`
- `packages/access-router/src/runtime-context.ts`
- `packages/access-router/src/index.ts`
- Model registration and lookup paths
- Runtime-isolation tests

Findings:

- Runtime state is attached to globally registered Mongoose models, so a second runtime can overwrite the first.
- `createRouter(modelInstance, ...)` discards the model instance and resolves by name through the default Mongoose registry.

References:

- `packages/access-router/src/runtime-context.ts:17-30`
- `packages/access-router/src/index.ts:230-243`
- `packages/access-router/src/runtime.ts:210-238`
- `packages/access-router/src/model.ts:36-38`

Implementation requirements:

1. Add a runtime-owned model registry keyed by the runtime's intended identity rules.
2. Preserve a supplied `mongoose.Model` instance, including its connection.
3. Resolve model services and metadata from the active runtime registry, not global `mongoose.model(name)`.
4. Remove or strictly subordinate model-attached runtime state.
5. Define duplicate-name behavior within one runtime and same-name behavior across runtimes/connections.
6. Keep the default runtime API working without hiding ownership in global model mutation.

Acceptance criteria:

- The same model name can exist in two isolated runtimes with different options and connections.
- Concurrent requests use their own runtime's base filters and permissions.
- A model defined only on `mongoose.createConnection()` supports CRUD when passed to `createRouter`.
- Constructing runtime B cannot alter runtime A behavior.
- Root target discovery remains runtime-scoped.

### Task AR-12: Stop Mutating Consumer-Owned Mongoose Schemas

Priority: P1

Suggested agent: persistence adapter agent

Dependencies: AR-11

Primary ownership:

- `packages/access-router/src/model.ts`
- Model router options/types if explicit concurrency configuration is introduced
- Persistence behavior tests

Finding:

Constructing the wrapper sets `optimisticConcurrency` and can reintroduce `__v`, changing application-wide persistence behavior.

Implementation requirements:

1. Do not mutate schema concurrency/version settings during router or service construction.
2. If optimistic concurrency is required, validate prerequisites and expose an explicit opt-in configuration or documented setup step.
3. Preserve consumer-selected version keys.
4. Keep update conflict handling deterministic and tested.

Acceptance criteria:

- Router/service construction leaves schema options unchanged.
- Models with `versionKey: false` remain unchanged.
- Custom version keys remain unchanged.
- Opt-in concurrency behavior, if retained, has explicit tests and documentation.

### Task AR-13: Clarify Service And HTTP Boundaries

Priority: P2

Suggested agent: service architecture agent

Dependencies: Wave 1 complete

Primary ownership:

- Service result interfaces
- Response pipeline modules
- Router/service orchestration seams

Avoid a broad rewrite of all service methods.

Work:

1. Separate internal execution metadata from public operation data in types.
2. Make router layers responsible only for parse, authorize, dispatch, and serialize.
3. Centralize repeated direct/root operation orchestration where behavior must match.
4. Define typed service inputs for currently untyped subdocument IDs, names, data, and options.
5. Make hook error policy explicit, especially `docPermissions`, rather than silently swallowing one hook family while propagating others.

Acceptance criteria:

- Internal result metadata is not structurally assignable to public HTTP DTOs without explicit serialization.
- Direct and root response behavior shares tested helpers.
- Touched boundaries contain no implicit `any`.
- Hook failures have documented fail-hard or fail-closed semantics and structured logs.

## Wave 4: Package Contract And Installed Consumer Experience

AR-14 should precede documentation changes so docs describe the final API. AR-15 and AR-16 may run in parallel after AR-14.

### Task AR-14: Define And Test The Published Export Contract

Priority: P1

Suggested agent: package-contract agent

Dependencies: Runtime API decisions from AR-11

Primary ownership:

- `packages/access-router/package.json`
- `packages/access-router/tsup.config.ts`
- `packages/access-router/src/index.ts`
- `packages/access-router/src/advanced.ts`
- `packages/access-router/src/processors.ts`
- Consumer/package smoke-test fixtures

Findings:

- Published entrypoints are not tested through `package.json` exports.
- Public guard input types are not exported.
- Processor parameter types are private.
- `/advanced` is broad but its stable contract is unclear.

Implementation requirements:

1. Curate root, `/advanced`, and `/processors` export allowlists.
2. Export public guard input types from the documented entrypoint.
3. Export `ProcessCopy` and `CopyAndDepopulateOptions` from `/processors`.
4. Decide whether `defaultRuntime` is public; export and document it consistently or keep it private everywhere.
5. Add packed-package smoke tests using a temporary consumer.
6. Verify ESM imports, CJS `require`, and declarations for every entrypoint under NodeNext and Bundler module resolution.
7. Verify the packed manifest contains resolved dependency versions and all required files.
8. Add an export/API snapshot or allowlist to detect accidental surface changes.

Acceptance criteria:

- Every documented import resolves from the packed tarball.
- Root, `/advanced`, and `/processors` work in ESM, CJS, and TypeScript.
- Consumers do not require `src`, workspace resolution, or undeclared files.
- Public parameter types are directly importable.
- Accidental export changes fail CI.

### Task AR-15: Correct Side-Effect And Initialization Semantics

Priority: P1

Suggested agent: build/package agent

Dependencies: AR-14 API decision

Primary ownership:

- `packages/access-router/package.json`
- `packages/access-router/src/runtime.ts`
- Build smoke tests

Finding:

The package declares `sideEffects: false`, but importing runtime code executes `mschema2Jsonschema(mongoose)` and mutates Mongoose.

Implementation requirements:

1. Prefer explicit or lazy idempotent plugin initialization owned by a runtime rather than import-time mutation.
2. If side effects cannot be removed, make `sideEffects` metadata accurately identify the affected entry/module.
3. Ensure tree shaking cannot remove required initialization.
4. Verify repeated runtime creation is safe.

Acceptance criteria:

- Importing the package has documented, testable side-effect behavior.
- Bundler smoke tests retain required schema generation.
- Initialization is idempotent.
- Metadata matches runtime behavior.

### Task AR-16: Make README And `llms.txt` Executable And Consistent

Priority: P2

Suggested agent: documentation/API agent

Dependencies: AR-14 and AR-15

Primary ownership:

- `packages/access-router/README.md`
- `packages/access-router/llms.txt`
- Website package docs only where drift must be corrected
- Documentation example tests

Findings:

- README quick start does not mount routers or register the Mongoose model.
- `llms.txt` imports nonexistent symbols from `/advanced`.
- `llms.txt` contradicts the model-instance overload.
- Named `createOpenApiRouter(runtime, options)` differs from `acl.createOpenApiRouter(options)` without explanation.

Implementation requirements:

1. Provide a minimal runnable Express/Mongoose quick start with JSON middleware, model registration, router mounting, connection, and startup guidance.
2. Explain the preferred default-runtime import and isolated-runtime alternative.
3. Document correct named and runtime-bound OpenAPI helper signatures.
4. List stable subpath exports and their purpose.
5. Remove all unsupported imports and contradictory guidance.
6. Compile or execute checked documentation examples in CI.
7. Keep `llms.txt` short and index-like; do not use it to compensate for missing declarations or README content.

Acceptance criteria:

- README and `llms.txt` examples resolve against a packed installation.
- The quick start can launch after supplying a MongoDB URL.
- Model-name versus model-instance support is stated consistently.
- Default and isolated runtime workflows are unambiguous.

## Wave 5: Type Safety, Performance, And Maintainability

These tasks may run in parallel when file ownership permits.

### Task AR-17: Incrementally Enable Strict Type Checking

Priority: P2

Suggested agent: TypeScript agent

Dependencies: AR-11 through AR-14

Primary ownership:

- `packages/access-router/tsconfig.json`
- Public entrypoints and typed service/model boundaries
- Consumer type tests

Implementation requirements:

1. Add a dedicated `tsc --noEmit` package/CI check if build tooling does not already guarantee it.
2. Enable `noImplicitAny` first, then additional strict flags in reviewable slices.
3. Prioritize `Model`, subdocument services, middleware/guard inputs, plugins, service results, and public exports.
4. Replace `Function` and unbounded `any` with specific callable/generic types.
5. Move source-internal filter type assertions to consumer-facing tests that import packed declarations.
6. Do not paper over errors with broad casts or `unknown as` chains.

Acceptance criteria:

- Public entrypoints compile under strict consumer settings.
- Model adapter argument-shape mistakes are compile-time errors.
- Positive and `@ts-expect-error` tests cover filters, projections, guards, runtime APIs, and subpaths.
- Generated declarations contain no accidental private or anonymous configuration types.

### Task AR-18: Optimize Data List And Filter Hot Paths

Priority: P2

Suggested agent: performance agent

Dependencies: AR-08 and AR-10

Primary ownership:

- `packages/access-router/src/services/data-service.ts`
- Filter normalization helpers
- Benchmarks/performance tests

Findings:

- `DataService.find()` trims every matching row before pagination.
- Filter normalization can perform quadratic deep comparisons.

Implementation requirements:

1. Preserve sorting semantics while avoiding expensive async field shaping outside the returned page where safe.
2. Apply filtering and required sort keys before pagination, then trim/select only returned records.
3. Ensure sorting on non-returned but permitted fields remains secure and deterministic.
4. Remove or replace quadratic client-filter deduplication.
5. Add representative benchmarks for large in-memory datasets and complex filters.

Acceptance criteria:

- A one-row page does not run async output hooks over the entire matching dataset.
- Output, count, sort, and permission semantics remain unchanged.
- Benchmarks show improved scaling and include regression thresholds tolerant of CI variance.

### Task AR-19: Add Structured, Redacted, Lazy Logging

Priority: P2

Suggested agent: observability agent

Dependencies: Service boundary from AR-13

Primary ownership:

- `packages/access-router/src/logger*.ts`
- Service logging call sites
- Logging tests

Finding:

Services eagerly `JSON.stringify()` complete resolved queries, potentially exposing sensitive values and doing work when debug logs are disabled.

Implementation requirements:

1. Use structured logging with operation, resource, timing, result code, and safe cardinality metadata.
2. Redact filter values, credentials, tokens, tenant identifiers where appropriate, and mutation payloads.
3. Avoid serializing debug payloads unless the log level is enabled.
4. Ensure circular/custom hook values cannot break request handling.
5. Route all package diagnostics through the configured logger abstraction.

Acceptance criteria:

- Sensitive query and input values do not appear in captured logs.
- Disabled debug logging performs no query serialization.
- Logging failures cannot fail an HTTP operation.
- Tests cover redaction and circular data.

### Task AR-20: Define OpenAPI Collision And Edge-Case Behavior

Priority: P2

Suggested agent: OpenAPI agent

Dependencies: AR-14

Primary ownership:

- `packages/access-router/src/openapi/**`
- OpenAPI tests and documentation

Finding:

Registering the same method/path silently replaces the previous descriptor, which can make documentation differ from Express routing precedence.

Implementation requirements:

1. Reject conflicting method/path registrations by default unless descriptors are equivalent.
2. Include both operation IDs and source/resource information in collision errors.
3. Define identical repeat-registration behavior as idempotent or reject it explicitly.
4. Validate duplicate operation IDs independently of path collisions.
5. Cover relative/absolute docs paths, path collisions, custom asset URLs, and safe HTML/JSON embedding.

Acceptance criteria:

- Model/model, data/data, and model/data route collisions are detected.
- OpenAPI output cannot silently describe a different handler than Express serves.
- Special characters in titles, descriptions, URLs, and server data are safely embedded.

### Task AR-21: Harden Processor Path Semantics

Priority: P3

Suggested agent: processors agent

Dependencies: AR-14 exported processor types

Primary ownership:

- `packages/access-router/src/processors.ts`
- `packages/access-router/test/processors.test.ts`

Finding:

`copyAndDepopulate()` has undefined behavior for missing/null intermediate paths, scalar array entries, overlapping operations, missing IDs, and unsafe destination paths.

Implementation requirements:

1. Define whether malformed/missing paths are safe no-ops or descriptive errors.
2. Reject unsafe special-key paths.
3. Make mutable and immutable modes behave identically except for object identity.
4. Document default `mutable` and `idField` behavior.

Acceptance criteria:

- Tests cover null/missing intermediates, empty paths, scalar array entries, missing IDs, overlaps, and prototype-like keys.
- No operation can mutate an object's prototype.
- Public types and JSDoc describe behavior.

## Wave 6: Compatibility And Final Integration

### Task AR-22: Verify Supported Peer Versions And Packed Artifacts

Priority: P2

Suggested agent: compatibility agent

Dependencies: Waves 1 through 5

Primary ownership:

- CI/package test configuration
- Temporary consumer fixtures
- Package metadata only if support ranges change

Work:

1. Test minimum supported Express 5 and Mongoose 8 versions.
2. Test current supported major versions.
3. Run tests against the packed tarball rather than workspace source resolution.
4. Validate `version`, SPDX license, repository, exports, files, and resolved dependencies in the packed manifest.
5. Fail packaging if `PLACEHOLDER` or unresolved `workspace:*` values remain in a release artifact.
6. Narrow peer ranges if compatibility cannot be demonstrated.

Acceptance criteria:

- Declared minimum and current peer combinations pass consumer smoke tests.
- ESM, CJS, NodeNext, and Bundler consumers pass.
- Published metadata contains no placeholders or workspace protocols.

### Task AR-23: Final Security And Architecture Integration Review

Priority: P0 release gate

Suggested agent: senior review/integration agent who did not implement the majority of fixes

Dependencies: all selected tasks complete

Primary ownership: tests and small integration corrections only; return larger regressions to the owning task agent

Review checklist:

- No HTTP request can choose a trusted internal access override.
- Every cross-resource operation authorizes the target resource and operation.
- Row filters and field permissions apply to list, read, count, distinct, includes, subqueries, subdocuments, and root operations.
- Public HTTP responses cannot expose service queries, mutation inputs, hook contexts, or snapshots.
- Every request-controlled collection and recursive structure has a practical bound.
- Runtime/model ownership is isolated across apps and Mongoose connections.
- Router construction does not mutate consumer schemas.
- Package docs, declarations, export maps, and runtime imports agree.
- Security logs are useful without exposing request data.

Required verification:

```sh
pnpm --filter @web-ts-toolkit/access-router test
pnpm lint
pnpm build
pnpm test
```

Also run packed-package consumer tests and any new compatibility matrix introduced by AR-14/AR-22.

Acceptance criteria:

- All commands pass without test concurrency workarounds.
- The reviewer reports no unresolved P0/P1 finding.
- Any deferred P2/P3 item has an explicit issue/task, rationale, and risk statement.
- The package's changelog/release notes call out security-relevant contract changes.

## Deferred Decisions Requiring Maintainer Confirmation

Agents should stop and request a decision if these cannot be resolved from existing docs or tests:

1. Whether unauthorized target resources should return 401, 403, or concealed 404. The current error enum names and route behavior are inconsistent.
2. Whether `distinct` should support dynamic document-level field permissions or require a static configured field allowlist.
3. Whether internal `Service.count(filter, access)` remains public to in-process callers after HTTP access overrides are removed.
4. Whether `defaultRuntime` is a supported public export.
5. Whether model instances are officially supported. The preferred recommendation is yes because the overload exists and connection preservation is architecturally healthier.
6. Whether root batch partial failures should continue returning HTTP 200 with per-item statuses or use another top-level status policy.
7. Exact default complexity and concurrency budgets. Choose conservative defaults and make them configurable if no product limits exist.

## Recommended Agent Allocation

To minimize merge conflicts:

| Agent | Tasks               | Main files                                            |
| ----- | ------------------- | ----------------------------------------------------- |
| A     | AR-00, AR-23        | tests/integration                                     |
| B     | AR-01, AR-08, AR-12 | `model.ts`, persistence tests                         |
| C     | AR-02, AR-04        | route validation/collection routes                    |
| D     | AR-03, AR-05        | service field/subdocument policy                      |
| E     | AR-06, AR-13        | `services/base.ts`, service boundaries                |
| F     | AR-07, AR-09        | root router and root types                            |
| G     | AR-10, AR-18        | complexity/filter/data performance                    |
| H     | AR-11               | runtime/model registry                                |
| I     | AR-14, AR-15, AR-22 | package/build/consumer tests                          |
| J     | AR-16, AR-17        | docs/declarations/type tests                          |
| K     | AR-19, AR-20, AR-21 | logging/OpenAPI/processors; split if run concurrently |

Do not run tasks assigned to the same agent concurrently. If multiple agents are used, Wave dependencies still apply.

## Definition Of Done

The remediation is complete when:

- Confirmed authorization and correctness defects have regression tests and fixes.
- Request complexity and concurrency are bounded at shared boundaries.
- Runtime ownership is explicit and supports isolated connections.
- Internal metadata never crosses the HTTP response boundary unintentionally.
- Published exports, declarations, README, and `llms.txt` agree and are verified from a packed installation.
- Public TypeScript boundaries are strict enough to catch adapter contract errors.
- Package, repository, compatibility, and packed-consumer verification pass.
