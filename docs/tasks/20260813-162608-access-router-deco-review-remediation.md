# Access Router Deco Review Remediation

Created: 2026-08-13 16:26:08 PDT

Package: `packages/access-router-deco`

Authoritative runtime contract: `packages/access-router`

## Objective

Bring `@web-ts-toolkit/access-router-deco` into behavioral agreement with `@web-ts-toolkit/access-router`, then improve its security boundaries, bootstrap architecture, metadata encapsulation, public typing, documentation, and installed-package verification. The first waves address confirmed hook-adapter defects that can skip authorization-sensitive inputs or make valid operations fail; later waves improve isolation, maintainability, and bootstrap efficiency.

## Scope And Working Rules

- Treat `packages/access-router` hook types, option resolution, router construction, runtime isolation, and request lifecycle as the authoritative contract. Do not infer behavior from decorator names alone.
- Add a focused regression that fails on the current implementation before each behavioral fix.
- Prefer real `access-router` runtime tests for adapter semantics. Mock-only call assertions are insufficient for route construction, hook execution, option precedence, and isolation.
- Preserve decorated class-instance `this` unless the maintainer chooses otherwise; `@Request()` is the explicit request injection mechanism. Document this divergence from raw `access-router` callbacks.
- Do not manually edit generated `packages/access-router-deco/dist/` files. Build from tracked TypeScript source.
- Update package README, website docs, public declarations, and tests together for public contract changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. The package test script rebuilds its transitive workspace dependencies, whose `dist/` outputs are shared.
- Avoid performance refactors until behavioral regressions pass. Metadata scanning occurs at bootstrap, not per request; optimize only measured or clearly redundant bootstrap work.

## Non-Goals

- Do not redesign `access-router` hook semantics from this package.
- Do not add decorators for data routers unless a separate public API proposal is approved.
- Do not add a dependency-injection framework. A small optional instance resolver is sufficient if constructor injection is required.
- Do not preserve unsafe raw-error serialization through compatibility aliases.
- Do not introduce compatibility reads for private string metadata keys unless a concrete external consumer is identified; those constants are not exported through the package entrypoint.
- Do not broaden this work into unresolved strict-mode remediation inside `packages/access-router`.

## Review Baseline

Confirmed by source and test review on 2026-08-13:

- `access-router` defines hook signatures in `src/interfaces/router-hooks.ts`, option keys in `src/interfaces/root.ts`, option fallback in `src/options/manager.ts`, hook invocation in `src/core-shared.ts` and `src/core.ts`, and isolated runtimes through `createAccessRuntime()` in `src/index.ts`.
- `@Validate` is configured as an array hook by the decorator factory. `access-router` treats a validation array as a static issue array rather than a callback chain, so a decorated validator is not invoked and its non-empty wrapper array causes validation failure.
- `@OverrideFilter` adapts a runtime `(filter, permissions)` callback with an argument map containing only `PERMISSIONS`. The wrapper therefore injects runtime `args[0]`, the filter, as `@Permissions()` and exposes no filter parameter.
- `@Identifier` maps to `resolveIdFilter`, whose runtime callback receives `id`, but its decorator argument map is empty and no ID parameter decorator exists.
- Array-hook accumulation wraps an existing callback array in another array. `access-router` executes only direct functions in a hook chain, so earlier decorated `prepare`, `transform`, `afterPersist`, `decorate`, or `decorateAll` callbacks can be silently skipped.
- The factory constructs model routers before applying module `routerOptions`, and constructs each router before applying its property and method options. Build-time route keys such as `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` therefore cannot reliably affect the mounted route tree when supplied late.
- Every factory uses the imported default `acl` singleton. `EgoseFactoryStatic.create()` creates another wrapper but not another `AccessRuntimeApi`, so applications can share global/model options and model registrations.
- The decorator API accepts only model-name strings. It cannot pass a Mongoose model instance to `access-router`, which prevents the runtime's supported same-name, separate-connection ownership model.
- `handleErrors` mounts an application-wide catch-all after the package router, creates a plain `Error('Not Found')` that becomes status 500, and serializes `{ message: err.message, error: err }`. This both affects unrelated application routes and can expose enumerable internal error data.
- The exported singleton stores the last Express application in `_expressApp`, creating unnecessary retention and a re-entrant bootstrap hazard.
- Metadata keys are generic strings in the shared Reflect metadata namespace. Metadata reads are inherited by default, parameter entries append without validation, symbol metadata can crash `.startsWith()`, and methods carrying multiple hook decorators silently register only the first `HOOK_CONFIG` match.
- The default `@RouterOptions` path only scans `@RouteGuard`, even though `access-router` default model options also support `resolveIdFilter`. `@RouteGuard` also omits runtime operation keys including `new`, `upsert`, `distinct`, and `count`.
- Public types allow constructors with required arguments although bootstrap always calls `new Type()`. Hook decorators expose only generic `MethodDecorator`, `Option` accepts arbitrary strings, package TypeScript is non-strict, and no strict installed-consumer fixture verifies legacy decorator syntax.
- Factory tests fully mock `access-router`; they prove registration calls but not actual hook invocation, path construction, option fallback, middleware behavior, runtime isolation, or package exports.
- The website quick start declares an undecorated `GlobalPermissions` request parameter, which receives `undefined` because the adapter only passes explicitly decorated parameters. Documentation does not state the required legacy TypeScript decorator compiler mode.
- The full targeted command `pnpm --filter @web-ts-toolkit/access-router-deco test` passed: 3 files and 114 tests. The passing mock-based suite does not cover the defects above.
- Worktree was clean before verification and remained clean after dependency/package builds according to `git status --short`.

## Priority Definitions

- P0: confirmed adapter behavior can omit an authorization-sensitive runtime input, skip a required security callback, or make the documented core operation unusable.
- P1: route/runtime ownership, option ordering, error disclosure, or lifecycle behavior can cross application boundaries or contradict the public contract.
- P2: metadata safety, typing, documentation, testability, readability, or installed-package gaps with contained immediate runtime risk.
- P3: optional bootstrap optimization or API expansion requiring benchmark evidence or maintainer policy input.

## Wave 1: Executable Runtime Contract Tests

### Task DECO-01: Add Real Hook Adapter Contract Coverage

Status: completed

Priority: P0

Suggested agent: access-router integration-test specialist

Dependencies: none

Primary ownership:

- new focused tests under `packages/access-router-deco/test/`
- minimal shared test helpers

Finding:

`factory.test.ts` replaces the complete `access-router` package with call-recording mocks. This misses differences between registration shape and runtime behavior, including validation-array interpretation, hook-chain execution, positional callback arguments, option fallback, and route construction.

References:

- `packages/access-router-deco/test/factory.test.ts:4-17`
- `packages/access-router-deco/test/factory.test.ts:156-520`
- `packages/access-router/src/core-shared.ts:121-180`
- `packages/access-router/src/core-shared.ts:228-242`
- `packages/access-router/src/core.ts:264-274`
- `packages/access-router/src/interfaces/router-hooks.ts:17-101`

Implementation requirements:

1. Add focused tests using a real isolated `access-router` runtime wherever possible; do not mutate the default runtime shared by unrelated tests.
2. Establish failing regressions for decorated validation invocation, override-filter filter/permissions injection, identifier ID injection, and two same-key chain hooks executing in declaration order.
3. Assert callback results and side effects, not merely `setModelOption` calls.
4. Keep database-backed tests minimal. Direct invocation through registered runtime options is acceptable when the test still uses the real option manager and runtime callback contract.
5. Preserve the existing fast metadata unit tests; replace mock tests only where real behavior makes them redundant.

Acceptance criteria:

- Each DECO-02 through DECO-04 defect has a regression that fails against the reviewed implementation for the stated reason.
- Tests prove the wrapper's request `this`, class-instance `this`, and explicitly injected parameters have the documented identities.
- Test setup uses isolated runtime state and does not depend on suite order.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes after the dependent fixes land.

Completion evidence:

- Changed: `packages/access-router-deco/test/hook-adapter.contract.test.ts`, `packages/access-router-deco/src/factory.ts`, `packages/access-router-deco/src/constants.ts`, `packages/access-router-deco/src/decorators/parameter.decorators.ts`, `packages/access-router-deco/src/index.ts`, `packages/access-router-deco/test/factory.test.ts`.
- Added real-runtime contract regressions for decorated validator invocation, override-filter filter/permissions/request injection, identifier ID/request injection, and same-key hook-chain declaration order.
- Added public `@Filter()` and `@Id()` parameter decorators so the real callback shapes can be represented explicitly.
- Fixed adapter registration so decorated validators are callable validators, accumulated hook chains contain direct functions only, and override-filter/identifier positional arguments match `access-router` hook signatures.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 4 files and 118 tests.

## Wave 2: Hook Adapter Correctness

### Task DECO-02: Register Decorated Validators As Callable Validators

Status: completed

Priority: P0

Suggested agent: hook-contract correctness specialist

Dependencies: DECO-01

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- focused validator tests

Finding:

`HOOK_CONFIG` marks `validate` as `array: true`, so registration stores `[wrappedValidator]`. The runtime accepts either one validator function, a boolean, or a static issue array; it does not execute arrays as validator chains. A non-empty array is returned as validation issues and rejects the request.

References:

- `packages/access-router-deco/src/factory.ts:45-64`
- `packages/access-router-deco/src/factory.ts:247-275`
- `packages/access-router/src/interfaces/router-hooks.ts:46-53`
- `packages/access-router/src/core.ts:264-274`
- `packages/access-router/src/services/service.ts:504-518`
- `packages/access-router/src/services/service.ts:708-719`

Implementation requirements:

1. Register each decorated validator as the scalar function shape expected by `access-router`.
2. Define behavior for two validators targeting the same operation. Prefer rejecting the ambiguous duplicate during bootstrap unless a composed validator with explicit issue-merging semantics is implemented and tested.
3. Preserve valid static validation arrays supplied in ordinary router options; never append a function into such an array.
4. Cover synchronous and asynchronous validator results and both create/update operation keys.

Acceptance criteria:

- A decorated validator is invoked with allowed data, permissions, and context and can permit a request.
- `false` and issue-array results retain the underlying runtime's controlled validation failure behavior.
- Duplicate decorated validators cannot silently replace one another or become a malformed array.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed `packages/access-router-deco/src/factory.ts` so `@Validate()` registrations are stored as scalar callable validator functions, not hook-chain arrays.
- Added duplicate/static conflict detection for decorated validators by checking the concrete `validate.<operation>` slot before registering the decorator wrapper.
- Added real adapter regressions in `packages/access-router-deco/test/hook-adapter.contract.test.ts` for async update validators, issue-array results, `false` results, duplicate decorated validators, and preserving pre-existing static validation issue arrays.
- Verified with `pnpm --filter @web-ts-toolkit/access-router-deco test`: package build completed and Vitest passed, 4 files and 122 tests.

### Task DECO-03: Add Correct Filter And Identifier Parameter Injection

Status: completed

Priority: P0

Suggested agent: decorator adapter API specialist

Dependencies: DECO-01

Primary ownership:

- `packages/access-router-deco/src/constants.ts`
- `packages/access-router-deco/src/decorators/parameter.decorators.ts`
- `packages/access-router-deco/src/index.ts`
- focused adapter and export tests
- package README and website docs

Finding:

The runtime invokes `overrideFilter(filter, permissions)` and `resolveIdFilter(id)`. The decorator package declares `OVERRIDE_FILTER_ARGS = [PERMISSIONS]`, declares no identifier arguments, and exports neither a filter nor an ID parameter decorator. `@Permissions()` on an override filter currently receives the filter, while identifier methods lose the ID.

References:

- `packages/access-router-deco/src/constants.ts:29-67`
- `packages/access-router-deco/src/decorators/parameter.decorators.ts:4-23`
- `packages/access-router-deco/src/factory.ts:279-298`
- `packages/access-router/src/interfaces/router-hooks.ts:17-33`
- `packages/access-router/src/core-shared.ts:121-129`
- `packages/access-router/src/core-shared.ts:157-160`

Implementation requirements:

1. Add distinct hook parameter kinds and public decorators for the current filter and route identifier; choose unambiguous exported names and document them.
2. Map override-filter runtime arguments as `[filter, permissions]` and identifier arguments as `[id]`.
3. Keep `@Request()` available through callback `this` without shifting positional runtime arguments.
4. Add export-contract tests and examples for both decorators.
5. Treat the new exports as additive public API and include release notes if this work lands in a release.

Acceptance criteria:

- An override-filter method receives the exact incoming filter through the filter decorator and the exact `AccessRouterPermissions` object through `@Permissions()`.
- An identifier method receives the exact route ID and can return a filter derived from it.
- Parameter declaration order is independent from runtime callback argument order.
- Existing document, permissions, context, and request injection tests remain green.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/constants.ts`, `packages/access-router-deco/src/decorators/parameter.decorators.ts`, and `packages/access-router-deco/src/index.ts` already contain public `@Filter()` and `@Id()` decorators plus `[filter, permissions]` and `[id]` runtime argument maps.
- Added/strengthened: `packages/access-router-deco/test/hook-adapter.contract.test.ts` now proves override-filter and identifier injection are independent from method parameter declaration order.
- Added/strengthened: `packages/access-router-deco/test/decorators.test.ts` asserts package-entry exports for `Filter` and `Id` and verifies their `HookParamtypes.FILTER` and `HookParamtypes.ID` metadata.
- Documented: `packages/access-router-deco/README.md`, `website/docs/packages/access-router-deco.md`, and `CHANGELOG.md` describe the additive public API and examples for `@Filter()` and `@Id()`.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 4 files and 125 tests.

### Task DECO-04: Preserve Flat Hook Chains And Deterministic Order

Status: completed

Priority: P1

Suggested agent: lifecycle and hook-chain specialist

Dependencies: DECO-01, DECO-02

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- focused chain-order tests

Finding:

Array hooks append with `toArray(compact([getOption(key)]))`. When the existing value is already an array this produces `[[firstHook], secondHook]`. `access-router` ignores nested arrays because `callHookChain` invokes only direct functions, so earlier hooks are skipped.

References:

- `packages/access-router-deco/src/factory.ts:41-43`
- `packages/access-router-deco/src/factory.ts:270-275`
- `packages/access-router/src/core-shared.ts:228-242`

Implementation requirements:

1. Normalize a missing value to `[]`, a function to `[function]`, and an existing callback array to a shallow copy of that array before appending.
2. Do not flatten arbitrary nested user values silently; reject malformed existing chains with a descriptive bootstrap configuration error.
3. Preserve deterministic method discovery/registration order and document the chosen base-to-derived ordering.
4. Cover `prepare`, `transform`, `afterPersist`, `decorate`, and `decorateAll`, including a preconfigured hook plus decorated hooks.

Acceptance criteria:

- Two decorated hooks for one operation both execute exactly once in documented order.
- Existing option callbacks and decorated callbacks form one flat chain.
- Invalid nested/non-function callback chains fail during bootstrap rather than being ignored during a request.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/factory.ts` normalizes missing hook values to `[]`, scalar functions to single-item chains, and existing flat function arrays to shallow copies before appending decorated callbacks.
- Changed: `packages/access-router-deco/src/factory.ts` now rejects malformed populated chain values with `Invalid hook chain for <option>` bootstrap errors instead of filtering or flattening them silently.
- Added/strengthened: `packages/access-router-deco/test/hook-adapter.contract.test.ts` covers decorated chain order, preconfigured plus decorated flat chains for `prepare`, `transform`, `afterPersist`, `decorate`, and `decorateAll`, scalar preconfigured hooks, and malformed nested/non-function chains.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 4 files and 134 tests.

## Wave 3: Bootstrap Ordering And Runtime Ownership

### Task DECO-05: Apply Build-Time Options Before Router Construction

Status: completed

Priority: P1

Suggested agent: Express router lifecycle specialist

Dependencies: DECO-02, DECO-03, DECO-04

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- real route-construction tests
- docs describing option precedence

Finding:

The factory constructs all routers before processing module `routerOptions`. It also calls `createRouter()` before registering a router class's `@Option` and hook values. `access-router` consumes build-time route options during model-router construction, so late `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` changes do not rebuild the Express routes. The website currently recommends a late `@RouterOptions('User', { basePath: ... })` pattern.

References:

- `packages/access-router-deco/src/factory.ts:86-110`
- `packages/access-router-deco/src/factory.ts:144-159`
- `packages/access-router/src/routers/model-router.ts:46-58`
- `packages/access-router/src/routers/router-mutation.ts:1-29`
- `website/docs/packages/access-router-deco.md:124-153`

Implementation requirements:

1. Establish and document precedence among default router options, model-specific `@RouterOptions`, `@Router` options, and property decorators.
2. Apply all route-construction options before calling `createRouter()`.
3. Do not silently mutate build-time options after routes exist. Reject unsupported late values or restructure compilation into a configuration phase followed by a mount phase.
4. Separate decorator-only module fields (`basePath`, `handleErrors`) from `GlobalOptions` before forwarding options to `access-router`.
5. Test actual mounted Express route behavior, not only setter calls.

Acceptance criteria:

- Default and model-specific route-construction options produce the documented paths and parameter names.
- Property-based build-time options either affect construction according to documented precedence or are rejected with a clear error before mounting.
- The runtime's stored options agree with the mounted route tree.
- Only valid `GlobalOptions` are forwarded to `setGlobalOptions`.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/factory.ts` now splits decorator-only module fields (`basePath`, `handleErrors`) from `GlobalOptions` before calling `acl.setGlobalOptions`.
- Changed: `packages/access-router-deco/src/factory.ts` now applies default `@RouterOptions`, model-specific `@RouterOptions`, `@Router` options, property `@Option` values, and decorated hooks before `acl.createRouter()` constructs model routes.
- Changed: `packages/access-router-deco/src/factory.ts` creates model routers from the already-configured runtime state so build-time options are not silently mutated after routes exist.
- Added: `packages/access-router-deco/test/bootstrap-routes.integration.test.ts` mounts real Express apps and verifies default/model-specific and property-based `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` behavior against actual route responses and stored runtime options.
- Strengthened: `packages/access-router-deco/test/factory.test.ts` verifies option application order before route creation and confirms decorator-only module fields are not forwarded as global options.
- Documented: `packages/access-router-deco/README.md` and `website/docs/packages/access-router-deco.md` describe build-time option precedence.
- Changed: `packages/access-router-deco/package.json` declares explicit route-test dependencies (`mongoose`, `supertest`) and `pnpm-lock.yaml` was refreshed with `pnpm install`.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 5 files and 137 tests.

### Task DECO-06: Bind Factories To Explicit Access Router Runtimes

Status: completed

Priority: P1

Suggested agent: runtime isolation and API design specialist

Dependencies: DECO-05

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- `packages/access-router-deco/src/interfaces.ts`
- runtime-isolation tests
- package README and website docs

Finding:

All factory instances import and mutate the default `acl` singleton. `EgoseFactoryStatic.create()` only creates a new wrapper object. This conflicts with `access-router`'s `createAccessRuntime()` isolation model and permits later bootstraps to alter earlier applications with the same global/model names.

References:

- `packages/access-router-deco/src/factory.ts:1-2`
- `packages/access-router-deco/src/factory.ts:77-93`
- `packages/access-router-deco/src/factory.ts:124-188`
- `packages/access-router/src/index.ts:240-247`
- `packages/access-router/src/index.ts:321-329`
- `packages/access-router/test/runtime-isolation.integration.test.ts:123-299`

Implementation requirements:

1. Bind factory operations to an `AccessRuntimeApi` supplied at factory creation or bootstrap.
2. Decide the singleton compatibility contract explicitly. Recommended: retain `EgoseFactory` as the documented default-runtime compatibility instance while making `EgoseFactoryStatic.create()` use or require an isolated runtime.
3. Return or expose the bound runtime and mounted router in a small bootstrap result so tests and hosts can inspect lifecycle ownership.
4. Remove mutable `_expressApp`; pass application/router references through local bootstrap calls.
5. Reject re-entrant or duplicate bootstrap on the same factory/module/app when it would duplicate routes or callbacks, or provide documented idempotent behavior.

Acceptance criteria:

- Two factories can bootstrap the same model name with different global permissions/options without cross-contamination.
- A factory never retains an unrelated Express app after bootstrap solely for helper access.
- Duplicate/re-entrant bootstrap behavior is explicit and tested.
- Existing singleton use remains documented, or a breaking migration and release note are supplied.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/factory.ts` now binds each factory to an explicit `AccessRuntimeApi`; `EgoseFactoryStatic.create()` creates an isolated runtime by default and accepts a caller-supplied runtime, while `EgoseFactory` remains bound to the default compatibility runtime.
- Changed: `packages/access-router-deco/src/factory.ts` no longer stores `_expressApp`; bootstrap uses the provided Express app locally, returns `{ runtime, router }`, and rejects duplicate bootstrap for the same factory/module/app.
- Changed: `packages/access-router-deco/src/interfaces.ts` and `packages/access-router-deco/src/index.ts` export the `BootstrapResult` type.
- Added/updated: `packages/access-router-deco/test/factory.test.ts`, `packages/access-router-deco/test/bootstrap-routes.integration.test.ts`, and `packages/access-router-deco/test/hook-adapter.contract.test.ts` cover explicit runtime ownership, isolated same-name model/global state, returned bootstrap ownership, duplicate bootstrap rejection, and existing hook behavior on isolated runtimes.
- Documented: `packages/access-router-deco/README.md` and `website/docs/packages/access-router-deco.md` describe default-runtime compatibility versus isolated/runtime-owned factories.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 5 files and 142 tests.

### Task DECO-07: Support Runtime-Owned Mongoose Model Instances

Status: completed

Priority: P2

Suggested agent: Mongoose multi-connection integration specialist

Dependencies: DECO-06

Primary ownership:

- `packages/access-router-deco/src/decorators/class.decorators.ts`
- `packages/access-router-deco/src/interfaces.ts`
- `packages/access-router-deco/src/factory.ts`
- focused multi-runtime tests and docs

Finding:

`access-router.createRouter()` accepts a Mongoose model instance and registers it with the selected runtime. The decorator API stores only a model-name string and always creates by name, so it cannot preserve model ownership for non-default connections or same-name models on separate runtimes.

References:

- `packages/access-router-deco/src/decorators/class.decorators.ts:31-55`
- `packages/access-router-deco/src/factory.ts:144-147`
- `packages/access-router/src/index.ts:194-198`
- `packages/access-router/src/index.ts:256-275`
- `packages/access-router/src/runtime.ts:179-201`

Implementation requirements:

1. Add a typed model-instance overload or an explicit model-provider mechanism without weakening the existing string overload.
2. Pass the exact model instance to the factory's bound runtime.
3. Keep model names and route metadata deterministic and reject invalid model-like inputs at decorator evaluation or bootstrap.
4. Test two isolated runtimes using same-name models from separate Mongoose connections without global model lookup.

Acceptance criteria:

- The exact supplied model instance is registered in and used by the selected runtime.
- Same-name models remain isolated across two decorator factories/runtimes.
- String model-name behavior remains covered.
- Public overloads compile in a strict consumer fixture.

Completion evidence:

- Changed: `packages/access-router-deco/src/decorators/class.decorators.ts` adds typed `@Router(model, options)` and `@RouterOptions(model, options)` overloads while preserving existing string/root/default overloads and rejecting empty strings or invalid model-like objects.
- Changed: `packages/access-router-deco/src/interfaces.ts` and `packages/access-router-deco/src/index.ts` export `RouterModel` for the public decorator model boundary.
- Changed: `packages/access-router-deco/src/factory.ts` resolves deterministic model names from string or Mongoose model metadata, registers exact model instances with the factory runtime before applying model options, and passes model instances to `runtime.createRouter(...)`.
- Added/updated tests: `packages/access-router-deco/test/decorators.test.ts`, `packages/access-router-deco/test/factory.test.ts`, and `packages/access-router-deco/test/bootstrap-routes.integration.test.ts` cover model-instance metadata, invalid model-like rejection, exact runtime registration/use, same-name separate-connection isolation, and existing string model-name behavior.
- Added: `packages/access-router-deco/test/strict-consumer-types.test.ts` compiles a strict consumer against built declarations and verifies public string/model overloads plus negative invalid-argument assertions.
- Documented: `packages/access-router-deco/README.md` and `website/docs/packages/access-router-deco.md` describe runtime-owned Mongoose model decorators and same-name isolated runtime behavior.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 6 files and 148 tests.

## Wave 4: Security And Metadata Encapsulation

### Task DECO-08: Remove Unsafe Application-Wide Error Handling

Status: completed

Priority: P1

Suggested agent: Express error-boundary security specialist

Dependencies: DECO-05

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- response-level Express tests
- package README and website docs

Finding:

With `handleErrors`, bootstrap installs a global catch-all after the module router, creates an unclassified `Error('Not Found')`, defaults it to 500, and returns the raw error object. The middleware affects unrelated routes and may disclose enumerable internal data.

References:

- `packages/access-router-deco/src/factory.ts:110-121`
- `packages/access-router-deco/src/interfaces.ts:12-16`
- `packages/access-router-deco/test/factory.test.ts:146-153`

Implementation requirements:

1. Prefer removing `handleErrors` and leaving application error policy to the host. If retained, scope not-found behavior to the package router and expose safe middleware for explicit host placement rather than taking over the app.
2. Return an explicit 404 for unmatched package routes.
3. Never serialize raw error objects or arbitrary internal messages by default.
4. Honor `res.headersSent`, delegate when a response cannot safely be written, and validate any status before use.
5. State any breaking contract change and migration in docs/release notes.

Acceptance criteria:

- An unmatched package route returns the documented 404 behavior when enabled.
- Unrelated application routes before and after the package mount are not intercepted.
- An internal error carrying sensitive enumerable properties does not expose them in the response.
- Invalid error statuses and `headersSent` are handled safely.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/factory.ts` scopes opt-in `handleErrors` behavior to the package `express.Router` before mounting it, returns safe `{ message: 'Not Found' }` for unmatched package routes, validates error status/statusCode values, sanitizes 5xx responses, and delegates with `next(err)` when `res.headersSent` is true.
- Added tests: `packages/access-router-deco/test/bootstrap-routes.integration.test.ts` covers package-only 404 handling, unrelated app routes mounted before and after bootstrap, sanitized client/server error payloads, invalid status fallback to 500, and `headersSent` delegation.
- Documented: `packages/access-router-deco/README.md` and `website/docs/packages/access-router-deco.md` describe the breaking contract change from application-wide catch-all handling to package-router-local opt-in handling and host migration guidance.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 6 files and 151 tests.

### Task DECO-09: Namespace Metadata And Define Inheritance Semantics

Status: completed

Priority: P2

Suggested agent: TypeScript reflection and inheritance specialist

Dependencies: DECO-02, DECO-03, DECO-04

Primary ownership:

- `packages/access-router-deco/src/constants.ts`
- `packages/access-router-deco/src/metadata.ts`
- `packages/access-router-deco/src/decorators/*.ts`
- metadata inheritance/collision tests

Finding:

The package writes generic string metadata keys such as `options` and `routers` into the shared Reflect namespace and reads inherited metadata implicitly. Parameter and property metadata append without duplicate checks. `getMetadataKeysStartWith` assumes all keys are strings, although Reflect metadata keys may be symbols. Prefix matching also accepts unrelated keys such as `validateExtra`.

References:

- `packages/access-router-deco/src/constants.ts:1-27`
- `packages/access-router-deco/src/metadata.ts:26-68`
- `packages/access-router-deco/src/decorators/class.decorators.ts:14-20`
- `packages/access-router-deco/src/decorators/parameter.decorators.ts:4-7`
- `packages/access-router-deco/src/decorators/property.decorators.ts:4-8`

Implementation requirements:

1. Replace generic metadata keys with package-scoped symbols or one namespaced metadata record.
2. Define class identity, method hook, parameter, and property inheritance separately. Use own metadata where inherited identity would be surprising; deliberately merge where inheritance is a supported feature.
3. Ensure an overridden child method does not accidentally reuse a base method's parameter mapping.
4. Reject or deterministically replace duplicate metadata at the same property/parameter index according to a documented rule.
5. Treat only exact hook keys or `${hook}.` subkeys as matches and safely ignore unrelated symbol metadata.

Acceptance criteria:

- Unrelated metadata named `options`, `routers`, or `__router__` cannot alter package behavior.
- Symbol metadata on a decorated method does not crash bootstrap.
- Base/child router identity, inherited hooks, overridden methods, and inherited properties follow explicit tested rules.
- Prefix-neighbor metadata such as `validateExtra` is ignored.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/constants.ts` now uses package-scoped `Symbol.for(...)` metadata keys for package-owned metadata instead of generic shared Reflect string keys.
- Changed: `packages/access-router-deco/src/metadata.ts`, `packages/access-router-deco/src/factory.ts`, and decorator files define own-vs-inherited metadata behavior: class identity/config uses own metadata, methods intentionally inherit via prototype lookup, parameters bind to the declaring method owner, inherited property options merge with child replacement, and duplicate property/parameter metadata replaces deterministically.
- Added tests: `packages/access-router-deco/test/metadata.test.ts`, `packages/access-router-deco/test/decorators.test.ts`, and `packages/access-router-deco/test/factory.test.ts` cover generic metadata collision resistance, symbol metadata safety, exact hook prefix matching, class identity inheritance, inherited/overridden method hooks, inherited property options, and duplicate metadata replacement.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 6 files and 162 tests.

### Task DECO-10: Validate Decorator Combinations During Bootstrap

Status: completed

Priority: P2

Suggested agent: configuration diagnostics specialist

Dependencies: DECO-02, DECO-03, DECO-09

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- metadata/configuration error types if needed
- focused negative tests and docs

Finding:

Unsupported parameter kinds currently resolve through `findIndex()` to `args[-1]` and become `undefined`. Duplicate parameter metadata and multiple hook-family decorators are accepted; registration silently keeps only the first hook according to `HOOK_CONFIG`, behavior currently encoded by a test but not documented.

References:

- `packages/access-router-deco/src/factory.ts:201-227`
- `packages/access-router-deco/src/factory.ts:279-298`
- `packages/access-router-deco/test/factory.test.ts:591-615`

Implementation requirements:

1. Compile and validate each decorated method's hook and parameter metadata before mutating runtime options or mounting routes.
2. Reject unsupported hook/parameter combinations, duplicate parameter indices, missing method functions, and multiple hook families on one method with a descriptive configuration error.
3. Include class name, method name, hook decorator, and parameter index/type where relevant without leaking runtime request data.
4. Replace the existing "only first matching hook" test with explicit rejection behavior unless all-hook registration is deliberately chosen and proven safe.

Acceptance criteria:

- Invalid combinations fail at bootstrap before the application is partially mounted.
- Error messages identify the source class/method and remediation.
- Valid parameter subsets and arbitrary declaration order continue to work.
- No unsupported parameter silently receives `undefined` due to adapter mapping.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/factory.ts` now validates module, router-options, and model-router hook metadata before calling runtime setters or mounting Express middleware.
- Changed: `packages/access-router-deco/src/factory.ts` rejects multiple hook-family decorators on one method, duplicate parameter metadata at the same index, missing decorated method functions, and hook-specific unsupported parameter decorators with class/method, hook, parameter index, and remediation in the error message.
- Preserved: valid parameter subsets and arbitrary declaration order continue to work, including existing `@Request` injection support on runtime hook callbacks.
- Updated tests: `packages/access-router-deco/test/factory.test.ts` replaces the previous first-hook-wins expectation with explicit bootstrap rejection and adds negative coverage for unsupported parameters and duplicate parameter metadata before runtime mutation or Express mounting.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 6 files and 164 tests.

## Wave 5: Public API, Types, Documentation, And Maintainability

### Task DECO-11: Align Decorator Surface With Supported Runtime Options

Status: completed

Priority: P2

Suggested agent: public API parity specialist

Dependencies: DECO-03, DECO-05, DECO-10

Primary ownership:

- `packages/access-router-deco/src/decorators/method.decorators.ts`
- `packages/access-router-deco/src/factory.ts`
- public API tests and docs

Finding:

`@RouteGuard` omits runtime operations including `new`, `upsert`, `distinct`, and `count`. Default `@RouterOptions` method scanning allows only route guards even though default model options also support `resolveIdFilter`. Static decorator unions can drift as `access-router` evolves.

References:

- `packages/access-router-deco/src/decorators/method.decorators.ts:28-82`
- `packages/access-router-deco/src/factory.ts:161-174`
- `packages/access-router/src/interfaces/root.ts:144-192`

Implementation requirements:

1. Derive public operation key types from exported `access-router` option types where practical rather than duplicating string unions.
2. Add supported top-level operation guard keys that have clear model-router semantics.
3. Register `@Identifier` on default router options, or explicitly document and test why it is unsupported.
4. Do not pretend nested subroute guard configuration fits a scalar method decorator; keep complex `subs` policy in typed options unless a clear API is designed.

Acceptance criteria:

- Decorator operation keys agree with the supported scalar runtime operation keys.
- Default model identifier behavior can be configured through the documented decorator surface or is explicitly excluded with rationale.
- Type and runtime tests prevent future key drift.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed: `packages/access-router-deco/src/decorators/method.decorators.ts` now derives the public `RouteGuardOperationKey` type from `ExtendedDefaultModelRouterOptions` and excludes nested `subs` from the scalar decorator surface.
- Changed: `packages/access-router/src/interfaces/root.ts` and `packages/access-router/src/index.ts` export the runtime option type used by the decorator package and include the missing scalar `operationAccess.upsert` extended key.
- Changed: `packages/access-router-deco/src/factory.ts` registers and validates `@Identifier` for default model router options in addition to `@RouteGuard`.
- Updated tests: `packages/access-router-deco/test/decorators.test.ts`, `packages/access-router-deco/test/factory.test.ts`, and `packages/access-router-deco/test/strict-consumer-types.test.ts` cover newer scalar route guard keys, explicit `subs` exclusion, public type export, and default-option identifier registration.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed and Vitest passed, 6 files and 170 tests.

### Task DECO-12: Tighten Constructor, Hook, And Option Types

Status: completed

Priority: P2

Suggested agent: TypeScript library API specialist

Dependencies: DECO-03, DECO-06, DECO-07, DECO-11

Primary ownership:

- `packages/access-router-deco/src/interfaces.ts`
- decorator public signatures
- package TypeScript configuration/scripts
- strict consumer fixtures

Finding:

The public `Type` permits required constructor arguments while bootstrap invokes every class with no arguments. Hook decorators return unconstrained `MethodDecorator`, `Option` accepts any string, internals rely heavily on `any`, and package source uses `strict: false` with no dedicated typecheck gate.

References:

- `packages/access-router-deco/src/interfaces.ts:1-16`
- `packages/access-router-deco/src/factory.ts:66-67`
- `packages/access-router-deco/src/factory.ts:124-188`
- `packages/access-router-deco/src/decorators/method.decorators.ts:28-82`
- `packages/access-router-deco/src/decorators/property.decorators.ts:4-8`
- `packages/access-router-deco/tsconfig.json:3-17`
- `packages/access-router-deco/package.json:16-19`

Implementation requirements:

1. Constrain directly instantiated classes to `new () => T`, or add a small typed instance resolver and require it for classes with dependencies.
2. Reuse exported `access-router` request, permissions, filter, context, hook, and option types at public boundaries.
3. Add strict source/consumer typechecks in reviewable slices; do not mask declaration failures with `skipLibCheck` in the consumer fixture.
4. Type option keys by scope where possible. If one generic `@Option` cannot safely distinguish scopes, introduce explicit scoped variants rather than an unsound union.
5. Replace internal `any` at metadata and option-setter boundaries with focused records, constructors, and generics as part of touched code; avoid a broad unrelated rewrite.

Acceptance criteria:

- Classes requiring constructor arguments fail at compile time unless an instance resolver is supplied.
- Strict fixtures accept valid decorated hooks and reject representative wrong return types, option keys, and parameter types where TypeScript decorator typing permits enforcement.
- Emitted declarations compile under strict NodeNext and Bundler consumers with `skipLibCheck: false`.
- Package verification runs the new typecheck gate.

Completion evidence:

- Changed: `packages/access-router-deco/src/interfaces.ts` now constrains bootstrapped module/router/router-option classes to zero-argument object constructors through `Type<T extends object = object>`.
- Changed: `packages/access-router-deco/src/decorators/method.decorators.ts` reuses exported `access-router` request, permission-value, hook, and context return types to type hook decorator return contracts while still allowing decorator parameter decorators to select method arguments.
- Changed: `packages/access-router-deco/src/decorators/property.decorators.ts` adds scoped `@GlobalOption`, `@ModelOption`, and `@DefaultModelOption` decorators for typed option keys while leaving legacy `@Option` available for unscoped/compatibility use.
- Changed: `packages/access-router-deco/src/factory.ts` and parameter/property decorator internals replace touched `any` boundaries with focused constructor, metadata, object, and unknown-value types.
- Changed: `packages/access-router/src/index.ts` re-exports the public hook/value/extended model option types consumed by `access-router-deco` declarations.
- Changed: `packages/access-router-deco/package.json` adds `typecheck` and includes it in package `test`; `packages/access-router-deco/tsconfig.typecheck.json` runs strict source typechecking against built dependency declarations with `skipLibCheck: false` inherited from `tsconfig.json`.
- Updated tests: `packages/access-router-deco/test/strict-consumer-types.test.ts` now stages all declaration dependencies, runs the consumer fixture with `skipLibCheck: false`, and covers zero-argument constructor enforcement, scoped option key rejection, valid hook usage, and wrong hook return rejection.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed, strict source typecheck passed, and Vitest passed, 6 files and 170 tests.

### Task DECO-13: Correct And Compile Documentation Examples

Status: completed

Priority: P2

Suggested agent: documentation contract-test specialist

Dependencies: DECO-03, DECO-05, DECO-06, DECO-08, DECO-11, DECO-12

Primary ownership:

- `packages/access-router-deco/README.md`
- `website/docs/packages/access-router-deco.md`
- documentation example tests

Finding:

The website quick start omits `@Request()` on a global-permission parameter even though undecorated parameters receive no values. Neither documentation source explains legacy TypeScript decorator requirements, class-instance `this`, option precedence, runtime ownership, or the exact error-handling boundary. Installation guidance also omits the underlying package's Mongoose peer expectation.

References:

- `packages/access-router-deco/README.md:5-18`
- `packages/access-router-deco/README.md:27-64`
- `website/docs/packages/access-router-deco.md:12-24`
- `website/docs/packages/access-router-deco.md:83-96`
- `website/docs/packages/access-router-deco.md:124-164`
- `website/docs/packages/access-router-deco.md:225-247`

Implementation requirements:

1. Correct every example to use explicit parameter decorators and the final runtime/factory API.
2. Document required TypeScript legacy decorator configuration and supported compiler/transpiler assumptions, including parameter decorators.
3. Explain parameter injection, class-instance `this`, option precedence, runtime isolation/default singleton behavior, duplicate bootstrap behavior, and error ownership.
4. Keep package README and website docs behaviorally aligned.
5. Compile and, where practical, execute documentation snippets against the built or packed package rather than source aliases.

Acceptance criteria:

- The quick starts compile under the documented TypeScript configuration and their registered hooks receive real request values.
- Documentation contains no pattern that sets a build-time route option too late to affect routes.
- Installation lists all direct and peer requirements needed by a clean consumer, including the Mongoose requirement inherited from `access-router`.
- A CI test fails when a documented TypeScript block no longer compiles against emitted declarations.

Completion evidence:

- Changed: `packages/access-router-deco/README.md` quick start now imports every decorator it uses, registers a minimal Mongoose `User` model before bootstrap, decorates the global permissions request parameter with `@Request()`, and uses the actual injected permissions object API via `permissions.has(...)`.
- Changed: `website/docs/packages/access-router-deco.md` quick start is behaviorally aligned with the package README and fixes the missing `@Request()` parameter decorator; additional parameter-injection examples were corrected from `permissions.includes(...)` to `permissions.has(...)`.
- Changed: both installation sections now include `mongoose`, and `packages/access-router-deco/package.json` declares `mongoose >=8.0.0` as a peer dependency to match the inherited `access-router` requirement.
- Changed: README and website docs now explicitly document legacy TypeScript decorator requirements, parameter decorator assumptions, explicit injection semantics, class-instance `this`, option precedence, runtime ownership/isolation, duplicate bootstrap behavior, build-time route option timing, and Express error ownership.
- Added: `packages/access-router-deco/test/consumer-stage.ts` centralizes staged-consumer setup against built workspace package `dist` outputs and emitted declarations with `skipLibCheck: false`.
- Added: `packages/access-router-deco/test/documentation-examples.test.ts` extracts the first TypeScript quick-start block from the package README and website docs, then compiles each snippet as a clean staged consumer with `experimentalDecorators: true`, `emitDecoratorMetadata: true`, and Bundler resolution.
- Verified: initial docs-contract run failed on stale examples, catching `@DocPermissions` returning field-list/boolean shapes and `permissions.includes(...)` usage; examples were corrected to match emitted declarations.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package build completed, strict source typecheck passed, documentation quick-start compile tests passed, and Vitest passed, 7 files and 172 tests.

### Task DECO-14: Centralize Hook Definitions And Bound Bootstrap Work

Status: completed

Priority: P3

Suggested agent: maintainability and bootstrap-performance specialist

Dependencies: DECO-04, DECO-09, DECO-10, DECO-11

Primary ownership:

- `packages/access-router-deco/src/constants.ts`
- `packages/access-router-deco/src/metadata.ts`
- `packages/access-router-deco/src/factory.ts`
- focused bootstrap tests or benchmark

Finding:

Hook identity, option keys, array/scalar behavior, supported operation keys, and argument maps are duplicated across constants, metadata predicates, method decorators, and `HOOK_CONFIG`. Bootstrap repeatedly walks prototype chains and Reflect metadata for each registration stage. This is startup-only work, so optimization is lower priority, but the duplicated schema has already allowed runtime contract drift.

References:

- `packages/access-router-deco/src/constants.ts:14-67`
- `packages/access-router-deco/src/metadata.ts:79-115`
- `packages/access-router-deco/src/decorators/method.decorators.ts:19-82`
- `packages/access-router-deco/src/factory.ts:45-64`
- `packages/access-router-deco/src/factory.ts:201-277`

Implementation requirements:

1. Create one typed hook-definition table that owns watermark, decorator option prefix, runtime option key, cardinality, supported arguments, and allowed operation keys where practical.
2. Compile each class's metadata into a validated registration plan once per bootstrap, then apply that plan without repeated prototype/metadata scans.
3. Do not introduce a global unbounded cache keyed by constructors. A local bootstrap plan or `WeakMap` is acceptable if lifecycle and invalidation are clear.
4. Preserve behavior established by earlier waves and add a small benchmark only if claiming a performance improvement.

Acceptance criteria:

- Adding or changing a hook mapping requires editing one authoritative definition plus its tests, not four disconnected switches/tables.
- Each class prototype is scanned a bounded, documented number of times per bootstrap.
- No strong-reference global cache retains application classes indefinitely.
- Package tests show no registration-order or inheritance regression.

Completion evidence:

- Changed: `packages/access-router-deco/src/constants.ts` now defines one typed `HOOK_DEFINITIONS` table that owns each hook watermark, decorator option key, runtime ACL option key, scalar/array cardinality, supported parameter argument map, allowed operation keys where practical, and default-model-options eligibility.
- Changed: `packages/access-router-deco/src/decorators/method.decorators.ts` and `packages/access-router-deco/src/metadata.ts` now consume `HOOK_DEFINITIONS` instead of maintaining separate hook watermark and option-key mappings.
- Changed: `packages/access-router-deco/src/factory.ts` now compiles a local per-class registration plan during bootstrap validation/registration, reusing discovered methods, matched hook definitions, metadata keys, and parameter metadata instead of rescanning prototype metadata in each registration path; no global constructor cache was added.
- Added: `packages/access-router-deco/test/decorators.test.ts` asserts the authoritative hook-definition table and derived model/default-model hook lists, including the `routeGuard` to `operationAccess` mapping and array/scalar behavior.
- Verified: initial `pnpm --filter @web-ts-toolkit/access-router-deco test` failed because narrowing `RouteGuard()` to the central table's finite operation list moved existing strict-consumer negative-test errors from hook return types to decorator arguments; the public `RouteGuardOperationKey` signature was restored while keeping runtime mapping metadata centralized.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package dependency build completed, strict source typecheck passed, strict consumer/documentation compile tests passed, and Vitest passed, 7 files and 173 tests.

## Wave 6: Installed Artifact And Final Review

### Task DECO-15: Verify Packed ESM, CJS, Types, And Decorator Side Effects

Status: completed

Priority: P2

Suggested agent: npm package compatibility specialist

Dependencies: DECO-12, DECO-13

Primary ownership:

- `packages/access-router-deco/package.json`
- package-local packed-consumer tests
- build configuration only if a failure is demonstrated

Finding:

The package publishes bundled CJS/ESM and declarations, but no package-local test installs the production-transformed tarball in a fresh consumer. There is also no executable contract for whether the package or the consumer owns `reflect-metadata` initialization.

References:

- `packages/access-router-deco/package.json:16-50`
- `packages/access-router-deco/tsup.config.ts:1-12`
- `packages/access-router-deco/src/decorators/class.decorators.ts:1`
- `packages/access-router-deco/src/decorators/method.decorators.ts:1`
- `packages/access-router-deco/src/decorators/parameter.decorators.ts:1`
- `packages/access-router-deco/src/decorators/property.decorators.ts:1`

Implementation requirements:

1. Pack through the repository's production manifest transformation path and install into a fresh temporary consumer.
2. Verify Node ESM import, Node CJS require, strict NodeNext ESM/CJS types, Bundler types, and actual legacy decorator syntax.
3. Choose and test one `reflect-metadata` ownership policy: package initializes it once, or consumers must initialize it before package use.
4. Verify the tarball contains only intended files and no placeholder metadata after production transformation.
5. Avoid relying on workspace path aliases or undeclared transitive dependencies.

Acceptance criteria:

- Fresh ESM and CJS consumers load all documented exports.
- Strict NodeNext and Bundler consumers compile decorated classes against packed declarations with `skipLibCheck: false`.
- The documented `reflect-metadata` policy works in the fresh runtime consumer.
- Packed metadata contains valid version, license, and repository values and no `PLACEHOLDER` strings.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Added: `packages/access-router-deco/test/packed-consumer-compatibility.test.ts` stages `@web-ts-toolkit/access-router-deco` and its internal `@web-ts-toolkit/*` dependency closure through the real `@repo-toolkit/publish-package` manifest transformation, packs tarballs with `pnpm pack`, installs them into a fresh temp consumer, and pins internal packages through local tarball overrides instead of workspace aliases or registry fallbacks.
- Added: the packed consumer test verifies Node ESM import and Node CJS require from the installed tarball, including all documented decorator/factory exports and runtime metadata writes without a consumer-side `import 'reflect-metadata'`.
- Added: the packed consumer test compiles actual legacy-decorator classes against packed declarations under strict NodeNext ESM (`.mts`), strict NodeNext CJS (`.cts`), and Bundler resolution with `skipLibCheck: false`, `experimentalDecorators: true`, and no workspace `paths` mapping.
- Added: tarball assertions verify the production-transformed manifest has version `0.99.0-test`, root license/repository metadata with `packages/access-router-deco` directory, rewritten `@web-ts-toolkit/access-router` peer range, no `devDependencies` or `scripts`, no `PLACEHOLDER` or `workspace:` values, and only `LICENSE`, `README.md`, `index.d.mts`, `index.d.ts`, `index.js`, `index.mjs`, and `package.json` in the packed package.
- Changed: `packages/access-router-deco/README.md` now documents the chosen `reflect-metadata` policy: consumers install the peer dependency, while importing `@web-ts-toolkit/access-router-deco` initializes it once before package decorators run.
- Verified: an initial package test run failed because `pnpm pack --dry-run --json` returned no file-list object for the extracted package path; the test now inspects the actual `.tgz` with `tar -tzf`, which is stricter and matched the emitted dual declaration files.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- Result: package dependency build completed, strict package typecheck passed, and Vitest passed, 8 files and 175 tests.

### Task DECO-99: Perform Independent Security And Architecture Integration Review

Status: completed

Priority: P1

Suggested agent: independent senior reviewer who did not implement the main waves

Dependencies: DECO-01 through DECO-15, excluding explicitly deferred P3 work

Primary ownership:

- review-only across `packages/access-router-deco`
- minimal corrective edits and regressions for findings
- this task document's completion evidence

Finding:

The package is an adapter over security-sensitive authorization hooks. Unit-level registration success is not enough; the completed work needs an independent cross-check against actual `access-router` behavior, alternate bootstrap paths, emitted declarations, and installed artifacts.

References:

- this task document
- `packages/access-router/src/interfaces/router-hooks.ts`
- `packages/access-router/src/interfaces/root.ts`
- `packages/access-router/src/core-shared.ts`
- `packages/access-router/src/core.ts`
- `packages/access-router/src/index.ts`

Implementation requirements:

1. Verify every acceptance criterion against runtime behavior, not task completion notes alone.
2. Re-map every public hook decorator to the current authoritative `access-router` signature, cardinality, operation keys, option fallback, and `this` binding.
3. Exercise direct model routes and root-router paths where decorator-produced model options affect both.
4. Verify two runtimes/apps cannot contaminate global permissions, model options, model instances, OpenAPI metadata, or hook chains.
5. Confirm no raw internal error or metadata crosses an external response boundary.
6. Review constructor/instance lifecycle, repeated bootstrap, inheritance, malformed metadata, and installed-consumer behavior.
7. Record deferred decisions with rationale and residual risk; do not mark the review complete with unexplained failed verification.

Acceptance criteria:

- All P0 and P1 findings are resolved with regressions, or a maintainer-approved blocker and residual risk are documented.
- Public types, docs, emitted declarations, and runtime implementation agree.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.
- `pnpm lint` passes, or unrelated pre-existing failures are identified with exact paths and the package's touched files pass focused lint.
- `pnpm build` passes.
- `pnpm test` passes serially, or unrelated pre-existing failures are documented without weakening package verification.
- Packed-consumer checks pass.

Completion evidence:

- Reviewed: independent runtime/security and packaging/types/docs passes checked hook decorator mappings against `access-router` signatures, scalar/array cardinality, operation keys, explicit parameter injection, class-instance `this`, runtime isolation, error boundaries, metadata validation, declarations, docs, and packed-consumer behavior.
- Changed: `packages/access-router-deco/src/factory.ts` now records duplicate-bootstrap ownership only after successful mounting, so validation failures do not permanently poison the same factory/module/app tuple.
- Changed: `packages/access-router-deco/src/factory.ts` now reuses the validated module/router/router-options instances during registration, avoiding double constructor and field-initializer execution during one bootstrap.
- Added regressions: `packages/access-router-deco/test/factory.test.ts` covers retry after failed pre-mount validation and verifies decorated module, default options, model options, and model router classes are instantiated exactly once per bootstrap.
- Changed: `packages/access-router-deco/test/packed-consumer-compatibility.test.ts` now uses runtime-valid `@BaseFilter` and `@OverrideFilter` parameter decorators in strict packed consumer fixtures.
- Changed: `website/docs/packages/access-router-deco.md` now matches the package README and packed tests for `reflect-metadata` ownership: consumers install the peer dependency, and importing the package initializes it once before package decorators run.
- Verified: focused `pnpm --filter @web-ts-toolkit/access-router-deco test -- factory.test.ts packed-consumer-compatibility.test.ts documentation-examples.test.ts` passed; package build completed, strict source typecheck passed, packed/docs consumer checks passed, and Vitest passed, 8 files and 177 tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-deco test` passed; package build completed, strict source typecheck passed, packed-consumer checks passed, and Vitest passed, 8 files and 177 tests.
- Verified: `pnpm lint` passed.
- Verified: `pnpm build` passed; only existing Vite deprecation/chunk-size warnings were emitted.
- Verified: initial `pnpm test` attempt was killed by the 180s tool timeout while running `@web-ts-toolkit/access-router-client`; rerunning `pnpm test` with a longer timeout completed successfully, including `@web-ts-toolkit/access-router-deco` with 8 files and 177 tests.
- Residual risk: no unresolved P0/P1 findings remain from the DECO-99 review. Documentation example testing still compiles the documented quick-start blocks and packed fixtures rather than every partial TypeScript snippet in the website page.

## Dependency And Parallelization Guidance

Recommended allocation:

| Wave | Tasks                     | Parallel guidance                                                                                                                                                                                             |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | DECO-01                   | One agent establishes the shared real-runtime test harness.                                                                                                                                                   |
| 2    | DECO-02, DECO-03          | May run in parallel after DECO-01 if ownership is split between `factory.ts` and constants/parameter decorators; coordinate edits to adapter tests. DECO-04 follows both where shared factory logic overlaps. |
| 3    | DECO-05, DECO-06, DECO-07 | Sequence in order because all change bootstrap ownership and `factory.ts`.                                                                                                                                    |
| 4    | DECO-08, DECO-09          | May run in parallel after prerequisites because error middleware and metadata internals are mostly separate. DECO-10 follows metadata policy.                                                                 |
| 5    | DECO-11, DECO-12, DECO-13 | Sequence public surface, types, then docs to avoid repeated declaration/example churn. DECO-14 may run after behavior stabilizes and should not block P0/P1 completion.                                       |
| 6    | DECO-15, DECO-99          | Pack verification precedes independent final review.                                                                                                                                                          |

Shared hotspots requiring coordination:

- `packages/access-router-deco/src/factory.ts`: DECO-02, DECO-04, DECO-05, DECO-06, DECO-08, DECO-10, and DECO-14 must be sequenced or assigned to one integration owner.
- `packages/access-router-deco/src/constants.ts` and parameter decorators: DECO-03, DECO-09, and DECO-14 should not edit concurrently.
- README and website docs: defer broad edits until public APIs in DECO-03, DECO-06, DECO-08, DECO-11, and DECO-12 stabilize.
- Test/build commands rebuild shared dependency outputs. Agents must not run package tests or builds concurrently.

## Deferred Decisions Requiring Maintainer Input

- Whether exported `EgoseFactory` should remain bound to the default `access-router` singleton for compatibility or switch to isolated-runtime behavior. Recommended: preserve it as an explicitly documented compatibility singleton and make newly created factories runtime-bound.
- Whether decorated method `this` remains the class instance or changes to the request like raw `access-router` hooks. Recommended: retain class-instance `this` and require `@Request()` for request access because changing it would break stateful decorator classes.
- Whether property decorators may configure build-time route keys. Recommended: support them only in a pre-construction compilation phase; otherwise reject them rather than applying ineffective late mutations.
- Whether multiple validator decorators for one operation should be rejected or composed. Recommended: reject until issue-merging and short-circuit semantics are explicitly designed.
- Whether hook inheritance is part of the supported public contract. Recommended: inherit deliberately only when a child does not override the method, while class router identity and overridden parameter metadata remain own-only.
- Whether the package or consumer owns `reflect-metadata` initialization. Either can work, but docs, bundle side effects, and packed tests must agree.

None of these decisions blocks DECO-01 through DECO-04 regression work. Resolve each before its dependent public API task starts.

## Definition Of Done

- Confirmed validator, override-filter, identifier, and hook-chain defects have real-runtime regressions and are fixed.
- Route-construction options are compiled before router creation with documented deterministic precedence.
- Factory/runtime/app/model ownership is explicit, isolated, and testable; duplicate bootstrap behavior is defined.
- Optional error behavior is module-scoped and never serializes raw internal errors.
- Metadata is namespaced, inheritance is deliberate, malformed configurations fail early, and symbol/collision cases are safe.
- Public decorator keys and callback types track the authoritative `access-router` contract.
- README and website examples compile and execute under the documented legacy decorator configuration.
- Packed ESM/CJS and strict consumer tests pass without workspace aliases or undeclared dependencies.
- Package tests, focused lint, build, serial repository tests, and independent final review pass or have exact unrelated blockers recorded.
- Every completed task includes changed files, commands, results, and follow-up evidence in this document.
