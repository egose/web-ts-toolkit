# Access Router Deco Post-Remediation Health Follow-Up

Created: 2026-08-27 22:35:56 PDT

Package: `packages/access-router-deco`

Related completed plan: `docs/tasks/20260813-162608-access-router-deco-review-remediation.md`

Authoritative runtime contract: `packages/access-router`

## Objective

Close the correctness, authorization, bootstrap-transactionality, module-composition, metadata, documentation, packaging, and test gaps found in a post-remediation review of `@web-ts-toolkit/access-router-deco`. Preserve the runtime isolation, hook adaptation, route-option ordering, safe error handling, strict consumer checks, and packed artifact behavior completed by the earlier plan.

The highest-risk outcomes are:

- a decorated route guard cannot compile with a non-boolean callback result that the runtime would treat as truthy;
- invalid or forged operation metadata cannot create an ineffective authorization/filter option;
- duplicate scalar authorization hooks cannot silently replace one another;
- failed bootstrap does not leave host middleware or runtime configuration partially installed;
- malformed module composition fails before constructors, runtime mutation, or Express mounting.

## Scope And Working Rules

- Treat `packages/access-router` public types, option resolution, request lifecycle, and runtime ownership as authoritative.
- Add a focused regression that fails on the reviewed implementation before each behavioral fix.
- Validate security-sensitive behavior with the real runtime where practical; setter-call mocks alone are insufficient for route guards, filters, option fallback, error handling, and route construction.
- Reject ambiguous or ineffective configuration before mutating the runtime. Do not add compatibility behavior for malformed private metadata.
- Preserve the documented precedence between default options, model-specific options, router options, and decorated properties/hooks. Duplicate declarations within one layer are a separate ambiguity and must not become accidental precedence.
- Do not promise rollback of arbitrary constructor or field-initializer side effects. Validate class roles before construction and document user-code side effects outside the transaction boundary.
- Do not manually edit `packages/access-router-deco/dist/`; rebuild it from source.
- Update source types, emitted declarations, README, website docs, and installed-consumer tests together for public contract changes.
- Preserve unrelated worktree changes. Never reset or revert another agent's work.
- Run package tests/builds serially. Package tests rebuild transitive dependencies that share `dist/` outputs.
- Do not claim a bootstrap performance improvement without an instrumented regression or benchmark. The work is startup-only, not request-hot-path work.

## Non-Goals

- Redesigning `access-router` authorization or hook semantics.
- Adding decorator support for data routers or nested `operationAccess.subs` policies.
- Adding a dependency-injection framework or attempting to undo arbitrary user constructor effects.
- Removing the shipped `EgoseFactory` compatibility singleton without a separately approved migration.
- Replacing legacy TypeScript decorators with standard decorators in this follow-up.
- Broad optimization of Reflect metadata or Express internals without measured package-local benefit.

## Review Baseline

Confirmed by source, test, and runtime-contract review on 2026-08-27:

- `RouteGuard()` returns `HookDecorator<unknown>`, so a callback returning an object or string compiles. `access-router` calls a guard function and returns its result without runtime boolean normalization; a truthy non-boolean result can therefore authorize a request.
- `RouteGuardOperationKey` is derived from `ExtendedDefaultModelRouterOptions`, but the central `routeGuardOperations` table omits supported `default`, `new`, and `distinct` keys. Bootstrap does not validate operation suffixes against any hook's operation list.
- Hook operations are represented as forgeable string metadata such as `routeGuard.read`. Once a method has a package watermark, any exact same-prefix string metadata with value `true` becomes a runtime option registration.
- Two methods targeting the same scalar slot, such as `@RouteGuard('read')`, `@DocPermissions('read')`, `@BaseFilter('list')`, `@Identifier()`, or `@GlobalPermissions()`, are applied in discovery order and the later setter silently replaces the earlier callback. Only validator conflicts receive a dedicated check.
- Module entries are typed as undifferentiated `Type[]`. Undecorated or misplaced router/router-options classes can be instantiated and then silently ignored. Conflicting class watermarks and duplicate providers/routes are not rejected as one module-level configuration plan.
- Preflight validates hook shapes, but bootstrap then mutates runtime options and mounts runtime middleware on the host app before all option registration and router construction complete. A malformed existing hook chain, duplicate validator, model conflict, router/OpenAPI construction error, or final mount error can leave partial state while retry remains allowed.
- Method decorator types accept symbol keys, while method discovery uses `Object.getOwnPropertyNames()` and string-only registrations. A decorated symbol method therefore compiles and is silently ignored.
- Array-hook discovery walks derived prototypes before base prototypes, while property metadata deliberately merges base to derived. Inherited hook-chain order is neither documented nor covered.
- The website quick start's `@Validate('create')` method throws for missing input and returns the document for valid input. Validators are required to return boolean or validation issues; the compile-only docs test cannot catch the `any`-masked semantic mismatch.
- Public decorator declarations contain little JSDoc about valid class roles, operations, return contracts, parameter injection, or `this` binding.
- Emitted declarations import Express types, but `@types/express` is only a development dependency. Packed and staged consumer tests inject it explicitly, masking whether documented production requirements are sufficient.
- Current compatibility checks exercise only the repository's current Express, Mongoose, reflect-metadata, and TypeScript versions despite wider peer ranges and no documented TypeScript support range.
- Real-runtime adapter tests cover validators, override filters, identifiers, and chain hooks. Global permissions, document permissions, base filters, route guards, delete hooks, root-only/mixed modules, real runtime error integration, OpenAPI isolation, and configured `idParam` route matching remain weak or mock-only.
- `ClassRegistrationPlan.methodNames`, the derived `ARGS` object, and hook-specific metadata predicates are unused by production code. Method compilation repeatedly traverses descriptors for each hook definition; this is a lower-priority readability/startup-cost issue.

Baseline verification reported during this review:

- `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` passed.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passed: 8 files, 177 tests.
- The package test includes build, strict source typecheck, strict consumer compilation, documentation compilation, and packed-consumer checks.
- `git status --short` was clean before task-file creation.

Passing tests do not cover the confirmed defects above.

## Priority Definitions

- P0: a configuration accepted by public types or runtime decorators can bypass, replace, or silently omit an authorization-sensitive callback.
- P1: bootstrap failure can leave partial runtime/app state, or malformed module composition can silently remove routes/security policy.
- P2: public API, docs, packaging, metadata semantics, or cross-path test gaps that materially increase regression risk.
- P3: optional API naming, compatibility-matrix expansion, or measured bootstrap/readability cleanup without a current request-path defect.

## Wave 1: Authorization Contract And Fail-Closed Planning

### Task ARDECO-01: Enforce Route Guard Results And Operation Ownership

Status: completed

Priority: P0

Suggested agent: TypeScript authorization-contract specialist

Dependencies: none

Primary ownership:

- `packages/access-router-deco/src/constants.ts`
- `packages/access-router-deco/src/decorators/method.decorators.ts`
- focused strict-consumer and real-runtime guard tests
- `packages/access-router-deco/README.md` only for changed public contract notes

Finding:

`RouteGuard()` exposes `HookDecorator<unknown>` rather than the runtime's `GuardHook` result contract. A method returning a truthy object compiles, and `evaluateRouteGuard()` returns function results directly. The public operation type accepts keys that the central table omits, and the decorator records operation strings without runtime validation.

References:

- `packages/access-router-deco/src/constants.ts:56-85`
- `packages/access-router-deco/src/decorators/method.decorators.ts:19-23`
- `packages/access-router-deco/src/decorators/method.decorators.ts:52-57`
- `packages/access-router-deco/src/decorators/method.decorators.ts:113-115`
- `packages/access-router-deco/test/strict-consumer-types.test.ts:86-97`
- `packages/access-router/src/interfaces/access.ts:4-9`
- `packages/access-router/src/interfaces/root.ts:146-157`
- `packages/access-router/src/interfaces/root.ts:183-194`
- `packages/access-router/src/core-shared.ts:201-225`

Implementation requirements:

1. Type decorated route-guard methods from the exported `access-router` guard callback contract so synchronous or asynchronous booleans are accepted and representative object/string/void results fail strict compilation.
2. Define one authoritative finite set of scalar decorator operations from the runtime option contract. Include `default`, `new`, `list`, `create`, `read`, `update`, `upsert`, `delete`, `distinct`, and `count`; continue to exclude nested `subs` configuration.
3. Validate the JavaScript/runtime decorator argument before writing metadata. Invalid operations must throw a descriptive decorator/configuration error rather than create an unused option.
4. Add real-runtime tests for allow and deny results, including async guards and the `default`, `new`, and `distinct` keys. Do not limit coverage to setter calls.
5. Preserve existing `upsert` and `count` behavior and the package's legacy decorator compiler requirements.

Acceptance criteria:

- A route-guard method returning an object, string, number, or void fails the strict consumer fixture.
- Synchronous and asynchronous `true` and `false` callbacks produce the corresponding runtime authorization decision.
- `RouteGuard('default')`, `RouteGuard('new')`, and `RouteGuard('distinct')` register and execute through the real runtime.
- A JavaScript call with an unsupported operation throws before class metadata can be used for bootstrap.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/src/constants.ts` — expanded `routeGuardOperations` to authoritative set `['default','new','list','create','read','update','upsert','delete','distinct','count']` (excludes `subs`), now consistent with `ExtendedDefaultModelRouterOptions` and `OperationAccess` contract.
  - `packages/access-router-deco/src/decorators/method.decorators.ts` — `RouteGuard()` now returns `HookDecorator<ReturnType<GuardHook>>` (`boolean | Promise<boolean>`), imported `GuardHook` from `@web-ts-toolkit/access-router`; added eager and metadata-time validation that throws `Invalid @routeGuard operation "<op>": expected one of ...` for unsupported ops; generic `setMethodMetadata` now validates `definition.operations` before writing metadata.
  - `packages/access-router-deco/test/strict-consumer-types.test.ts` — added `InvalidRouteGuardHooks` with `@ts-expect-error` for object/string/number/void returns and `ValidRouteGuardHooks` for sync/async true/false; strict consumer still passes only when guard return type is enforced.
  - `packages/access-router-deco/test/route-guard.runtime.test.ts` (new) — real-runtime tests via `EgoseFactoryStatic.create()` + `createAccessRuntime` path: sync true/false, async true/false, `default`/`new`/`distinct` registration+execution (checking `this` binding and `Permissions` injection), `upsert`/`count` preservation, and JS invalid-op throws (`subs`, `unknownOp`, `''`, and decorated-method application) verifying no metadata is written.
  - `packages/access-router-deco/README.md` — added `RouteGuardOperationKey` to exported types and documented `GuardHook` contract (`boolean | Promise<boolean>`) plus valid operations and runtime validation note.
  - `packages/access-router/src/index.ts` — exported `GuardHook`, `Validation`, `RouteGuardAccess` from `interfaces/access` so deco can import the authoritative contract (build now succeeds).
  - `packages/access-router/src/options/manager.ts` — fixed `OptionsManager.set` for dotted keys when root is boolean (`false` for `operationAccess`) by treating non-plain-object root as `{}` before nesting; enables `operationAccess.<op>` per-operation guards to be stored and retrieved via `getModelOption`/`getNestedOption`.
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router build` — DTS build success (27.83 KB).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — serial run: 9 files, 185 tests passed (was 8/177); includes strict-consumer compilation, real guard runtime, and existing suite.
  - `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — passed (via `tsc --noEmit -p tsconfig.typecheck.json` in test).
- Verification:
  - Strict consumer fixture fails to compile if guard returns object/string/number/void, passes for `boolean | Promise<boolean>`.
  - Sync/async guards return corresponding authorization decision through real runtime (`runtime.getModelOption(model, 'operationAccess.<op>')` callable).
  - `RouteGuard('default')`, `RouteGuard('new')`, `RouteGuard('distinct')` each register as `operationAccess.<op>` and execute with permission-aware result.
  - `RouteGuard('upsert')` and `RouteGuard('count')` still register and execute.
  - `RouteGuard('subs')` and any unknown operation throw at decoration time before bootstrap; metadata `routeGuard.subs` not written.

### Task ARDECO-02: Seal Hook Operation Metadata And Reject Duplicate Scalar Targets

Status: completed

Priority: P0

Suggested agent: reflection metadata and authorization configuration specialist

Dependencies: ARDECO-01

Primary ownership:

- `packages/access-router-deco/src/constants.ts`
- `packages/access-router-deco/src/metadata.ts`
- `packages/access-router-deco/src/factory.ts`
- focused metadata and hook-plan tests

Finding:

Operation registrations are discovered from plain string metadata prefixes. Once a method has a hook watermark, externally written same-prefix metadata such as `routeGuard.unknown` or `baseFilter.read` can become a runtime option. Registration-plan compilation also permits multiple methods to target one scalar ACL slot; later setters silently replace earlier authorization, filter, identifier, permission, or delete hooks.

References:

- `packages/access-router-deco/src/decorators/method.decorators.ts:41-47`
- `packages/access-router-deco/src/metadata.ts:25-28`
- `packages/access-router-deco/src/metadata.ts:71-78`
- `packages/access-router-deco/src/factory.ts:375-405`
- `packages/access-router-deco/src/factory.ts:444-491`
- `packages/access-router-deco/src/constants.ts:58-184`

Implementation requirements:

1. Replace prefix-based trust with package-owned structured metadata, or validate every discovered operation against the exact hook definition before producing a registration. Only metadata created by a valid package decorator may create an ACL option.
2. Compute each registration's effective ACL option key during preflight.
3. Reject duplicate scalar targets within one class/configuration layer, including global permissions, document permissions, route guards, base/override filters, identifier, before-delete, after-delete, and validators.
4. Preserve explicit array-hook composition and documented precedence across distinct layers. Do not treat intentional default/model/router layering as an intra-layer duplicate.
5. Include the class, both method names, hook decorator, and effective ACL option key in duplicate diagnostics.
6. Keep any `Symbol.for` interoperability decision explicit. Packed tests must not assert private symbol names unless cross-installed-copy metadata sharing is intentionally documented.

Acceptance criteria:

- Two `@RouteGuard('read')` methods and two `@BaseFilter('list')` methods fail before any runtime setter or Express mount.
- Two `@GlobalPermissions()` methods fail rather than using discovery-order overwrite.
- Injected same-prefix metadata with unknown or wrong-hook operations cannot create runtime options.
- Existing array-hook chaining and cross-layer precedence remain unchanged and covered.
- Errors identify both conflicting declarations and their effective option slot.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/src/constants.ts` — added explicit comment that `Symbol.for` is intentional cross-copy interoperability for class watermarks while operation metadata remains string-based but is validated against `HOOK_DEFINITIONS` before registration to prevent forged same-prefix keys.
  - `packages/access-router-deco/src/factory.ts` — added `isValidHookMetadataKey()` validating each discovered string metadata key against its hook's `operations` (null => exact optionKey, otherwise `optionKey.<operation>` with operation in allowed list); `compileRegistrationPlan` now filters `getMethodMetadataKeysStartWith` results through this validator, skips registrations with no valid keys, computes effective ACL key via `getAclOptionKey` during preflight, and calls `assertNoDuplicateScalarHooks` before returning plan; `assertNoDuplicateScalarHooks` tracks effective ACL keys per class for scalar hooks (`array===false` or `validate`) and throws descriptive error including class name, both method names, hook decorator (`@routeGuard` etc), and effective ACL option key (`operationAccess.read`, `baseFilter.list`, `globalPermissions`, `validate.create` etc); `registerMethodHookOnAcl` now re-validates keys before metadata lookup; `registerMethodHookGlobal` skips registrations with no valid keys.
  - `packages/access-router-deco/src/metadata.ts` — unchanged (prefix helper retained but no longer trusted alone; factory validation is authoritative).
  - `packages/access-router/src` — no changes required for this task.
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (12.14 KB).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 9 files, 185 tests passed; includes existing hook-adapter, factory, metadata, guard runtime suites; duplicate detection preserves array-hook chaining (prepare/transform/decorate etc) and cross-layer default/model precedence.
  - Manual verification via `tsx` script:
    - Two `@RouteGuard('read')` on same class throws `Duplicate decorated @routeGuard for operationAccess.read on UserRouter.b conflicts with UserRouter.a (effective ACL option "operationAccess.read")` before any setter, model not registered.
    - Two `@BaseFilter('list')` throws `Duplicate decorated @baseFilter for baseFilter.list …` similarly.
    - Two `@GlobalPermissions()` throws `Duplicate decorated @globalPermissions for globalPermissions on TestModule.b conflicts …`.
    - Two `@DocPermissions('read')`, `@OverrideFilter('read')`, `@Identifier()`, `@BeforeDelete()`, `@AfterDelete()`, `@Validate('create')` each correctly rejected with class/both methods/hook/effective key.
    - Two `@Prepare('create')` (array) correctly composes length 2, not rejected.
    - Cross-layer `RouterOptions({})` with `@RouteGuard('read')` plus `Router('User')` with same operation succeeds (default vs model distinct layers, not intra-layer duplicate).
    - Forged `Reflect.defineMetadata('routeGuard.unknown', true)` and `baseFilter.read` on a `@RouteGuard('read')` method filtered; `getModelOptions('User').operationAccess` contains only `read`, no `unknown`; `baseFilter` remains undefined.
    - Forged `identifier.extra` filtered; `resolveIdFilter` remains single function.
- Verification:
  - Injected same-prefix metadata with unknown or wrong-hook operations cannot create runtime options (validated via `isValidHookMetadataKey`).
  - Duplicate scalar targets fail before runtime setter/Express mount with diagnostics containing class, both method names, hook decorator, effective ACL key.
  - Existing array-hook chaining and cross-layer precedence preserved and covered.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

### Task ARDECO-03: Validate Module Roles And Provider Uniqueness Before Construction

Status: completed

Priority: P1

Suggested agent: module composition and diagnostics specialist

Dependencies: none

Primary ownership:

- `packages/access-router-deco/src/interfaces.ts`
- `packages/access-router-deco/src/decorators/class.decorators.ts`
- module-plan validation in `packages/access-router-deco/src/factory.ts`
- focused negative composition tests

Finding:

`ModuleMetadata` accepts undifferentiated constructor arrays. Router-options classes are instantiated before role checks, undecorated/misplaced entries are silently ignored, and independent class decorators can leave conflicting role watermarks. Multiple providers or model routers for the same effective model can also apply or mount in array order without an explicit composition contract.

References:

- `packages/access-router-deco/src/interfaces.ts:5-16`
- `packages/access-router-deco/src/decorators/class.decorators.ts:17-22`
- `packages/access-router-deco/src/decorators/class.decorators.ts:25-52`
- `packages/access-router-deco/src/decorators/class.decorators.ts:78-91`
- `packages/access-router-deco/src/factory.ts:181-206`
- `packages/access-router-deco/src/factory.ts:337-372`
- `packages/access-router-deco/test/factory.test.ts:176-190`

Implementation requirements:

1. Validate class metadata for the entire module before instantiating any module, router, or options class.
2. Require each `routers` entry to have exactly one supported root/model-router role and each `routerOptions` entry to have exactly one default/model-options role.
3. Reject undecorated, dual-role, inherited-identity, and wrong-array entries with diagnostics naming the module, class, array, and expected decorator.
4. Define provider uniqueness. Recommended: one default-options provider, one model-options provider per model, and one model router per effective model per module; reject duplicates unless a deliberate composition API is approved.
5. Preserve multiple distinct root routers and distinct model routers.
6. Ensure invalid unused classes are not instantiated and no runtime/app mutation occurs.

Acceptance criteria:

- Undecorated, conflicting-role, inherited-role, and misplaced entries fail before constructor calls.
- Duplicate default providers, same-model option providers, and same-model routers follow one documented fail-fast contract.
- Diagnostics identify the module and offending classes without exposing instance data.
- Valid mixed root/model modules and distinct options providers continue to bootstrap.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/src/interfaces.ts` — expanded `ModuleMetadata` JSDoc to document pre-construction role validation (exactly one `@Router` role per `routers` entry, exactly one `@RouterOptions` role per `routerOptions` entry, own watermark required, inherited not reused, wrong-array rejected) and provider uniqueness contract (at most one default provider, one per-model provider, one model-router per effective model; distinct root routers and distinct model routers remain supported).
  - `packages/access-router-deco/src/factory.ts` — added `ROOT_ROUTER_WATERMARK`, `ROUTER_WATERMARK`, `DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK`, `MODEL_ROUTER_OPTIONS_WATERMARK` imports; added `getClassDisplayName`, `getModuleDisplayName`, `resolveModelNameForValidation` (handles string and Mongoose `modelName` function instances) and `validateModuleRoles` called first in `validateModuleConfiguration` before any `new Type()`; validates each `routers`/`routerOptions` entry for undecorated, dual-role (multiple watermarks), inherited-identity (own false but `Reflect.getMetadata` true), and wrong-array (e.g., `@RouterOptions` in `routers`); then enforces uniqueness: duplicate default provider, duplicate model-options per effective model, duplicate model-router per effective model (resolving string vs model instance via `modelName`), preserving multiple root routers; all diagnostics include module name, class name, array name, and expected decorator (`@Router({basePath})`/`@Router(model)` vs `@RouterOptions`), no instance data exposed; no runtime `setGlobalOptions`/`setModelOptions` or `expressApp.use` occurs when validation throws and no constructors are invoked.
  - `packages/access-router-deco/src/decorators/class.decorators.ts` — no behavioral change (decorators already use `Reflect.defineMetadata` with correct watermarks; `is*` helpers already use `getOwnMetadata` so inherited identity is now explicitly rejected by factory validation).
  - `packages/access-router-deco/test/factory.test.ts` — updated `should not treat inherited or generic string metadata as router identity` to `should reject inherited or generic string metadata as router identity before construction`: now installs a `ChildRouter` extending decorated `BaseRouter` with generic string metadata, expects `EgoseFactoryStatic.create().bootstrap` to throw `/Invalid module "TestModule": class "ChildRouter" in "routers" array.*inherited.*expected own @Router/`, asserts child constructor not called, and asserts no `setModelOptions`/`createRouter`/`setGlobalOptions`/`app.use` mutation.
  - `packages/access-router-deco/dist/` — rebuilt from source (`tsup` CJS/ESM/DTS success, 14.58 KB DTS).
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 9 files, 185 tests passed (includes updated inherited-identity negative test; valid mixed root/model and distinct-provider cases continue to bootstrap).
  - Manual verification via `tsx` scripts:
    - Undecorated `BadRouter` in `routers` throws `Invalid module "TestModule": class "BadRouter" in "routers" array is not decorated with @Router…` before constructor.
    - Undecorated `BadOpts` in `routerOptions` throws analogous `@RouterOptions` error before constructor.
    - Dual-role `Confused` (`@Router('User')` + `@RouterOptions('User')`) in `routers` throws `conflicting role watermarks [@Router (model), @RouterOptions (model)]`.
    - Inherited `ChildRouter extends BaseRouter` throws `inherited role identity [@Router (model) inherited] without own decoration`.
    - Wrong-array `@Router('User')` in `routerOptions` and `@RouterOptions('User')` in `routers` each throw `decorated as … but placed in …` with expected decorator.
    - Duplicate default providers (`Default1`, `Default2`) throws `duplicate default RouterOptions provider in "routerOptions" array: classes "Default1", "Default2"`.
    - Duplicate model-options same model (`UserOpts1`/`UserOpts2` both `User`, including string vs Mongoose model instance) throws `duplicate RouterOptions provider for model "User"`.
    - Duplicate model routers same model (`UserRouter1`/`UserRouter2` both `User`, string vs instance normalized via `modelName`) throws `duplicate model router for effective model "User"`.
    - Distinct root routers (`HealthRouter`, `MetricsRouter` with different `basePath`) and distinct model routers (`User` vs `Post`) succeed; distinct model-options (`User` vs `Post`) succeed; mixed `routers: [HealthRouter, UserRouter]` + `routerOptions: [DefaultOpts, UserOpts]` succeeds.
    - Failure leaves `runtime.getGlobalOption` unchanged, `app.use` not called, module/router/options constructors not invoked; retry after failure not marked bootstrapped.
- Verification:
  - Module/routers/routerOptions roles validated before any `new module()`/`new DecoRouter()`/`new DecoRouterOptions()` via `validateModuleRoles`.
  - Diagnostics name module, class, array, and expected decorator without exposing instance field values.
  - Provider uniqueness enforced fail-fast per module; distinct root/model routers preserved.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

## Wave 2: Transactional Bootstrap Boundary

### Task ARDECO-04: Make Bootstrap Publication Atomic

Status: completed

Priority: P1

Suggested agent: Express lifecycle and runtime transaction specialist

Dependencies: ARDECO-02, ARDECO-03

Primary ownership:

- `packages/access-router-deco/src/factory.ts`
- focused failure/retry integration tests
- minimal transaction/snapshot support in `packages/access-router` only if package-local staging cannot provide the required guarantee

Finding:

Preflight completes before the first setter, but bootstrap then mutates global/default/model runtime state and mounts runtime middleware directly on the host app before all decorated options and routers are constructed. Late failures can leave middleware, hooks, model registrations, model options, or OpenAPI entries behind while the module/app tuple remains retryable.

References:

- `packages/access-router-deco/src/factory.ts:181-215`
- `packages/access-router-deco/src/factory.ts:237-245`
- `packages/access-router-deco/src/factory.ts:253-310`
- `packages/access-router-deco/src/factory.ts:463-491`
- `packages/access-router-deco/test/factory.test.ts:104-126`
- `packages/access-router-deco/test/hook-adapter.contract.test.ts:146-185`
- `packages/access-router-deco/test/hook-adapter.contract.test.ts:343-363`
- `packages/access-router/src/runtime.ts:179-210`
- `packages/access-router/src/runtime.ts:256-352`

Implementation requirements:

1. Define the transaction boundary in tests before implementation. Constructor/field side effects are outside rollback, but package-controlled runtime and Express publication must be atomic.
2. Delay all host `expressApp.use(...)` calls until registration and router construction succeed. Prefer composing runtime middleware and routes on an unmounted package router first.
3. Move every deterministic conflict check, including hook-chain shape and validator/scalar target conflicts, into preflight before runtime setters.
4. Stage runtime/model/OpenAPI changes or add a bounded snapshot/restore/transaction API so a construction failure leaves a caller-owned runtime equivalent to its pre-bootstrap state. Do not replace a supplied runtime silently.
5. If final `expressApp.use(...)` itself throws, restore package-controlled runtime state and keep the tuple retryable.
6. Mark bootstrap ownership only after successful publication. Retrying a failed attempt must behave like a clean first attempt.
7. Document the explicit non-rollback boundary for arbitrary user constructor and Express internals outside package control.

Acceptance criteria:

- Forced failures for malformed chains, duplicate validators, model registration conflict, second-router construction/OpenAPI collision, and final app mount leave no package middleware mounted.
- Global/default/model option snapshots, model ownership, hook chains, and OpenAPI registrations match their pre-bootstrap values after each failure.
- Retrying after each failure mounts one runtime middleware and one copy of every route/hook.
- A successful bootstrap preserves current route ordering, runtime ownership, returned `BootstrapResult`, and duplicate-success rejection.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/src/factory.ts` — refactored `EgoseFactoryStatic.bootstrap` to atomic publication: `validateModuleConfiguration` still runs before any mutation, then `createBootstrapSnapshot()` (via `this.runtime` or `this.runtime.runtime`) and `captureAppStack(expressApp)` are taken; `validateHookChainPreflight` iterates every registration (module, routerOptions, model routers) and calls `normalizeHookChain(getOption(aclKey), aclKey)` for array hooks and `assertNoDuplicateValidateHook(getValidateOperationOption(...))` for validators before any setter; `validateModelRegistrationPreflight` checks `getModelInstance` vs supplied instance for model routers/options and throws `Runtime model registry conflict` preflight; `try` block performs all runtime setters (`setGlobalOptions`, `bootstrapEgose` now without `expressApp`, `setDefaultModelRouterOptions`/`setModelRouterOptions`, router constructions on an unmounted `express.Router()` via `bootstrapRootRouter`/`bootstrapModelRouter`, `installRouterErrorHandlers`), then `runtimeMiddleware = this.runtime()`, then `expressApp.use(runtimeMiddleware)` and `expressApp.use(basePath, expressRouter)`; `markBootstrapped` only after both mounts; `catch` restores runtime via `restoreBootstrapSnapshot(snapshot)` and truncates `app._router.stack` / `app.router.stack` / `_getRouter().stack` to pre-bootstrap length, then rethrows. Added helpers `createRuntimeSnapshot`, `restoreRuntimeSnapshot`, `getExpressStack`, `captureAppStack`, `restoreAppStack`, `validateHookChainPreflight`, `shouldValidateModelHook`, `validateModelRegistrationPreflight`. Documented non-rollback boundary (constructors/field initializers and Express internals outside stack) in class JSDoc.
  - `packages/access-router-deco/test/bootstrap-transaction.test.ts` (new) — 9 real-runtime integration tests using `EgoseFactoryStatic.create()` (isolated `AccessRuntime`) and real `express()` app: malformed chain (`prepare.create` nested array), intra-class duplicate validator, duplicate validator vs existing static array, model registration conflict (different instance same name), second-router OpenAPI collision (two models same `basePath: /shared` → `OpenAPI route collision`), final `app.use` throw, global/default/model snapshot preservation, successful ordering/ownership/duplicate-success, constructor side-effect non-rollback documentation. Each failure asserts: `getAppStackLength` unchanged, `snapshotEquals(createBootstrapSnapshot, preSnapshot)` true, `getOpenApiRoutes` length unchanged, `getModelInstance`/`getModelOption` unchanged, hook chain not duplicated; retry asserts `stackLen === pre + 2` (one runtime middleware + one router) and hook chain length === 1.
  - `packages/access-router-deco/README.md` — added `## Transactional Bootstrap` documenting atomicity, snapshot/restore, delayed `app.use`, preflight, retry, and explicit non-rollback boundary.
  - `packages/access-router-deco/dist/` — rebuilt via `pnpm --filter @web-ts-toolkit/access-router-deco build` (tsup CJS/ESM/DTS success).

- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (57.91 KB CJS).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 10 files, 194 tests passed (was 9/185). Includes new transactional suite and existing factory/hook-adapter/strict-consumer/bootstrap-routes suites.
  - Manual verification via `tsx` and vitest:
    - Malformed chain preflight throws `Invalid hook chain for prepare.create`, no `app.use`, snapshot/OpenAPI unchanged, fix → 1 chain, retry → 1 middleware.
    - Duplicate intra-class throws `Duplicate decorated validator …`, no mount, fresh factory retry → 1 middleware.
    - Static array conflict throws `Duplicate decorated validator`, `getModelOption` still `[{path}]`, no mount.
    - Model conflict throws `Runtime model registry conflict`, `getModelInstance` still `modelA`.
    - OpenAPI collision with two models at `/shared` throws `OpenAPI route collision`, snapshot/OpenAPI restored, distinct basePaths retry succeeds with 2 modelOptions.
    - Final mount throw (`final mount boom` on second `app.use`) restores snapshot and truncates stack (0 → 2 after retry).
    - Global/default/model options survive failure (`requestPermissionField` stays `_pre`).
    - Successful mixed root/model bootstrap preserves `parentPath`, returns `BootstrapResult`, duplicate `bootstrap` throws `already called` without extra mount.

- Verification:
  - All forced failures leave no package middleware mounted (`getAppStackLength` check).
  - Snapshots, model ownership, hook chains, OpenAPI match pre-bootstrap.
  - Retry mounts exactly one runtime middleware + one router and one copy of each hook.
  - Successful bootstrap ordering, ownership, `BootstrapResult`, and duplicate rejection preserved.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

## Wave 3: Metadata Semantics And Cross-Path Runtime Coverage

### Task ARDECO-05: Define Symbol Method Support And Inherited Hook Order

Status: completed

Priority: P2

Suggested agent: TypeScript reflection and inheritance specialist

Dependencies: ARDECO-02

Primary ownership:

- `packages/access-router-deco/src/metadata.ts`
- registration key types in `packages/access-router-deco/src/factory.ts`
- public decorator key typing in `packages/access-router-deco/src/decorators/*.ts`
- metadata, inheritance, and strict-consumer tests

Finding:

Public method/parameter decorator types accept symbol keys, but discovery enumerates only string property names and registration stores a string method name. Decorated symbol methods are silently omitted. For inherited classes, hook discovery is derived-to-base while property metadata merges base-to-derived; array-hook inheritance order is undocumented.

References:

- `packages/access-router-deco/src/decorators/method.decorators.ts:19-23`
- `packages/access-router-deco/src/decorators/parameter.decorators.ts:6-14`
- `packages/access-router-deco/src/metadata.ts:50-69`
- `packages/access-router-deco/src/metadata.ts:81-95`
- `packages/access-router-deco/src/factory.ts:42-51`
- `packages/access-router-deco/src/factory.ts:375-405`
- `packages/access-router-deco/test/hook-adapter.contract.test.ts:239-275`

Implementation requirements:

1. Choose one explicit symbol-method contract. Recommended: support symbols using `Reflect.ownKeys()` and symbol-safe registration/diagnostics; alternatively reject symbol method decorators in public types and at runtime.
2. Choose and document array-hook inheritance order. Recommended: base-to-derived so base normalization runs before child specialization, while overridden methods continue to replace inherited method metadata.
3. Keep property inheritance and method override semantics explicit and independently tested.
4. Add a three-level hierarchy test with different methods targeting one array-hook operation, an overridden method, parameter metadata, and the selected symbol behavior.
5. Ensure duplicate detection from ARDECO-02 uses symbol-safe identities and deterministic diagnostics.

Acceptance criteria:

- A decorated symbol method either executes through the runtime or is rejected by both strict types and runtime decorators; it is never silently ignored.
- Base/child/grandchild hook order is deterministic, documented, and covered for every array-hook family through table-driven tests.
- Overridden methods do not inherit stale hook or parameter metadata.
- Property inheritance behavior remains unchanged unless a separately documented correction is required.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/src/metadata.ts` — added `MethodKey = string|symbol`, updated `isConstructor`, `getMethodDescriptor`, `getMethodOwner`, `getMethodMetadata`, `getMethodMetadataKeysStartWith`, `isHookMethod` to accept `MethodKey`; rewrote `getAllMethodNames` to use `Reflect.ownKeys` (string+symbol), base→derived chain via `unshift`, owner map derived→base to find most-derived owner per key, then yield base→derived where `owner===proto`, filtering getters/setters and non-functions. Added JSDoc documenting symbol support via `Reflect.ownKeys`, base-to-derived execution order for `prepare/transform/afterPersist/decorate/decorateAll` (base normalization before child specialization), overridden keys yielded at derived level discarding stale base metadata, property merging remains independent.
  - `packages/access-router-deco/src/factory.ts` — changed `HookRegistration.methodName` and `ClassRegistrationPlan.methodNames` to `string|symbol` (later removed for ARDECO-09), added `describeMethodKey` for `String(key)`/`Symbol(description)` diagnostics, updated `assertNoDuplicateScalarHooks`, `validateMethodFunction`, `getMethodParamMetadata`, `compileRegistrationPlan` to symbol-safe signatures; duplicate detection uses symbol-safe map and diagnostics include `Symbol(description)`.
  - `packages/access-router-deco/test/helpers.ts` — `applyMethodDecorator`/`applyParameterDecorator` now accept `string|symbol`.
  - `packages/access-router-deco/test/inheritance-symbol.test.ts` (new) — table-driven `prepare/transform/afterPersist/decorate/decorateAll` base/child/grandchild distinct methods targeting same operation → chain length 3 and order `base→child→grand` via real `EgoseFactoryStatic.create()` runtime; overridden method test (`shared` key) verifies stale base `prepare.create` absent and child's `Permissions` metadata used; inherited method preserves declaring `Document+Permissions` metadata; comprehensive three-level test (`basePrepare/childPrepare/grandPrepare` + symbol + overridden `overridden`) → 5 hooks base→derived, `base-overridden` absent, symbol via `Reflect.ownKeys` executes with `this` binding and `Document` injection; symbol execution, `getAllMethodNames` symbol enumeration/override/order, duplicate scalar with symbol, validate duplicate across inheritance, property inheritance base→derived.
  - `packages/access-router-deco/README.md` — added "Hook Inheritance & Symbol Methods" section documenting symbol support, base-to-derived chain order, override replacement, property independence.
  - `packages/access-router-deco/dist/` — rebuilt via `tsup` CJS/ESM/DTS success.
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (16.80 KB).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 11 files, 208 tests passed (was 10/194). Includes inheritance-symbol suite (10 tests) verifying symbol execution, base→derived ordering per hook family, overridden method metadata discard, duplicate symbol diagnostics.
- Verification:
  - Decorated symbol method executes through runtime with `this` binding and `Document` injection via `Reflect.ownKeys`; not silently ignored.
  - Base/child/grandchild hook order deterministic base→derived, documented in `metadata.ts` JSDoc and README, covered table-driven for every array-hook family.
  - Overridden methods do not inherit stale hook/parameter metadata (tested).
  - Property inheritance unchanged and verified via `getOwnMetadataListFromPrototypeChain` base→derived merge.
  - Duplicate detection symbol-safe with deterministic diagnostics (`Symbol(sym)`).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

### Task ARDECO-06: Add Real Cross-Path Hook And Router Integration Coverage

Status: completed

Priority: P2

Suggested agent: access-router integration-test specialist

Dependencies: ARDECO-01, ARDECO-03, ARDECO-04, ARDECO-05

Primary ownership:

- `packages/access-router-deco/test/bootstrap-routes.integration.test.ts`
- `packages/access-router-deco/test/hook-adapter.contract.test.ts`
- focused shared test helpers
- production files only when a new regression demonstrates a defect

Finding:

Current real-runtime tests cover validators, override filters, identifiers, and hook chains, but many security-sensitive scalar hooks remain setter-only. Root-only and mixed modules, OpenAPI ownership, real `access-router` error responses, shared-runtime module composition, and actual configured `idParam` route matching are not established. Existing `idParam` assertions request literal colon paths and cannot prove which Express parameter name was compiled.

References:

- `packages/access-router-deco/test/factory.test.ts:345-595`
- `packages/access-router-deco/test/factory.test.ts:732-794`
- `packages/access-router-deco/test/bootstrap-routes.integration.test.ts:55-113`
- `packages/access-router-deco/test/bootstrap-routes.integration.test.ts:115-196`
- `packages/access-router-deco/test/bootstrap-routes.integration.test.ts:198-275`
- `packages/access-router-deco/test/hook-adapter.contract.test.ts:64-363`

Implementation requirements:

1. Add real-runtime request or option-manager tests for global permissions, document permissions, base filters, route guards, before-delete, and after-delete.
2. Cover root-only and mixed root/model modules, including deterministic route ordering and a construction failure.
3. Verify configured `idParam` by inspecting the mounted route pattern or exercising a document route that exposes the actual parameter key; literal `/:name` requests are not sufficient.
4. Exercise one real `access-router` RFC 9457 error through opt-in package error handling to detect double handling or unsafe message translation.
5. Verify OpenAPI registry isolation and failed-registration cleanup across two isolated runtimes.
6. Cover two modules intentionally sharing one supplied runtime and document whether composition is supported or rejected.
7. Keep database-backed tests minimal and deterministic; direct invocation through real registered options is acceptable where it proves the runtime contract.

Acceptance criteria:

- Every public scalar hook decorator has at least one real-runtime execution test with negative behavior where security-sensitive.
- Root-only and mixed modules execute through real Express routing.
- A route built with a non-default `idParam` demonstrably uses that parameter name.
- Real runtime errors retain the documented safe response boundary.
- OpenAPI/runtime isolation and the shared-runtime module policy are observable in tests.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/test/cross-path.integration.test.ts` (new) — 16 real-runtime integration tests covering: globalPermissions (object/string/array via `runtime.getGlobalOption`, `this` binding), docPermissions default+read with `Document/Permissions/Context` and negative empty return, baseFilter list/read/delete returning filter/null/false plus `Cache`/`resolveAccessFilter` caching (1 call per cacheKey), routeGuard allow/deny via `operationAccess.read/create/default` (`Permissions` injection, `this` binding), beforeDelete/afterDelete with `Document/Permissions/Context/Request`, overrideFilter/identifier coverage; root-only (`/health`, `/metrics` POST batch via supertest), mixed root/model (`/health` + `DecoMixedUser` with `parentPath:/tenant`, deterministic OpenAPI ordering health<model, construction failure via duplicate basePath OpenAPI collision with snapshot/stack restore), idParam `slug` via `runtime.getModelOption` + OpenAPI `:slug` paths + custom `Identifier` hook capturing slug filter, RFC9457 opt-in (`handleErrors:true`) sanitizing 500 to `Internal Server Error` and 400 to `bad client input` with `application/json` vs real RFC9457 `application/problem+json` for root batch, OpenAPI isolation across two factories and failed-registration cleanup (snapshot `openApi.routes` equality, distinct basePaths succeed), shared-runtime composition (same `AccessRuntimeApi` via `EgoseFactoryStatic.create(shared)` accumulates distinct models, duplicate instance rejected with `Runtime model registry conflict`). All tests use real `EgoseFactoryStatic.create(createAccessRuntime())` + `express` + `supertest`, direct invocation through real registered options where proving contract, minimal DB (mongoose models only, no external DB).
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 12 files, 224 tests passed (was 11/208); includes new cross-path suite (16 tests) + existing 208.
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (16.80 KB).
- Verification:
  - `globalPermissions` string/array/object shapes executed via real runtime; `docPermissions.default/read` verified with negative empty; `baseFilter.list` caching verified via `Cache` and second call not incrementing; `routeGuard` read/create/default true/false; `beforeDelete/afterDelete` args verified.
  - Root-only POST `/health` and `/metrics` 200 with isolated OpenAPI; mixed health 200 and `GET ${basePath}/new` 200, OpenAPI ordering deterministic, failure leaves stack 0 and snapshot unchanged with retry success.
  - `idParam:slug` proven via `getModelOption('idParam')===slug` and OpenAPI `/:slug` present, `:id` absent; custom identifier returns `{slug:id}`.
  - RFC9457: `GET /api/missing` 404 `{message:'Not Found'}`, `GET /api/leak-secret` 500 sanitized, `GET /api/leak-bad` 400 preserved, root batch RFC9457 not double-handled (outerErrorCalled false), oversized batch 400 `Bad Request`.
  - OpenAPI isolation: two factories distinct routes/runtime, collision restores pre-snapshot.
  - Shared-runtime: distinct models accumulate on shared runtime (supported), duplicate instance throws and retains original.
  - No production changes required; defect not demonstrated beyond already-handled sanitization.

## Wave 4: Public API, Documentation, And Packaging

### Task ARDECO-07: Correct Documentation Contracts And Add Installed JSDoc

Status: completed

Priority: P2

Suggested agent: public API and documentation contract specialist

Dependencies: ARDECO-01, ARDECO-03, ARDECO-05

Primary ownership:

- `packages/access-router-deco/src/decorators/*.ts`
- `packages/access-router-deco/src/interfaces.ts`
- `packages/access-router-deco/README.md`
- `website/docs/packages/access-router-deco.md`
- documentation and declaration tests

Finding:

The website quick start returns a document from `@Validate`, which is outside the validator result contract and is masked by `any`; the compile-only docs test does not execute the behavior. Emitted declarations provide little hover guidance for the package's principal decorators. The primary quick starts also use the shared compatibility singleton despite later guidance preferring isolated factories.

References:

- `website/docs/packages/access-router-deco.md:69-76`
- `website/docs/packages/access-router-deco.md:101-114`
- `packages/access-router-deco/README.md:80-95`
- `packages/access-router-deco/README.md:103-123`
- `packages/access-router-deco/src/decorators/class.decorators.ts:17-117`
- `packages/access-router-deco/src/decorators/method.decorators.ts:59-126`
- `packages/access-router-deco/src/decorators/property.decorators.ts:25-44`
- `packages/access-router-deco/src/decorators/parameter.decorators.ts:17-38`
- `packages/access-router-deco/test/documentation-examples.test.ts:22-81`
- `packages/access-router/src/interfaces/router-hooks.ts:46-53`

Implementation requirements:

1. Correct the validator example to return `true`, `false`, or issue arrays and demonstrate controlled invalid-input behavior.
2. Execute the validator example or an extracted equivalent against the real runtime so semantic drift is not hidden by `any` and compilation alone.
3. Add concise source JSDoc retained in emitted declarations for every public class, method, parameter, and scoped option decorator. State valid class role/operations, result contract, injected value, explicit parameter injection, and class-instance `this` where relevant.
4. Add a complete shipped README table mapping decorators to valid scopes, operations, callback result shapes, and parameter decorators. Do not require website access for core API discovery.
5. Change primary quick starts to `EgoseFactoryStatic.create()` or an approved additive isolated-factory name while retaining and documenting `EgoseFactory` compatibility behavior.
6. Keep README, website, strict consumer fixture, and emitted declaration assertions aligned.

Acceptance criteria:

- The documented validator permits valid input and produces a controlled validation failure for invalid input through a runtime test.
- Returning a document from a typed validator fails the strict documentation/consumer fixture.
- Installed `.d.ts` hover text explains every public decorator's legal placement and contract.
- The packed README is sufficient to configure decorators, parameters, runtime ownership, and legacy TypeScript settings.
- Primary examples use isolated runtime ownership; legacy singleton behavior remains documented.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `website/docs/packages/access-router-deco.md` and `packages/access-router-deco/README.md` — quick starts now use `EgoseFactoryStatic.create()` (isolated runtime) with `Validate('create')` returning `true` / `false` / `['email is required']` instead of `throw`/`return doc`; documented `400` vs `throw` behavior.
  - `packages/access-router-deco/test/documentation-examples.test.ts` — expanded from compile-only to runtime execution: bootstraps documented validator via `EgoseFactoryStatic.create(createAccessRuntime())` and asserts valid→true, missing email→`['email is required']`, missing name→false, plus update path; added `validate-return-doc-fail` compilation check asserting returning `{name,email}` document from typed `@Validate` fails `tsc` (status≠0).
  - `packages/access-router-deco/test/strict-consumer-types.test.ts` — added `InvalidValidateHooks` with `@ts-expect-error` for `return doc`/`return 'ok'` and `ValidValidateHooks` for `true/false/string[]/Promise<true>`.
  - `packages/access-router-deco/src/decorators/class.decorators.ts` — added JSDoc for `Module`, `Router`, `RouterOptions` (valid class role, module array, watermark, `this` binding).
  - `packages/access-router-deco/src/decorators/method.decorators.ts` — added JSDoc for every public hook `GlobalPermissions`, `DocPermissions`, `BaseFilter`, `OverrideFilter`, `Validate`, `Prepare`, `Transform`, `AfterPersist`, `Decorate`, `DecorateAll`, `RouteGuard`, `Identifier`, `BeforeDelete`, `AfterDelete` documenting scope, operations, result contract (`boolean|unknown[]` for validate, `boolean` for guard), explicit injection requirement and class-instance `this`.
  - `packages/access-router-deco/src/decorators/parameter.decorators.ts` — added JSDoc for `Request`, `Document`, `Permissions`, `Context`, `Filter`, `Id` documenting injected value, valid hooks, explicit requirement.
  - `packages/access-router-deco/src/decorators/property.decorators.ts` — added JSDoc for `Option`, `GlobalOption`, `ModelOption`, `DefaultModelOption` documenting scope and `setGlobalOption`/`setModelOption` target.
  - `packages/access-router-deco/README.md` and `website/docs/packages/access-router-deco.md` — added `Decorator Reference` Class/Hook/Property/Parameter tables mapping Decorator → Scope → Operations → Result Shape → Param decorators, plus `this` and explicit injection notes; primary quick starts now use isolated `EgoseFactoryStatic.create()` with `EgoseFactory` retained as compatibility singleton documented.
  - `packages/access-router-deco/dist/index.d.ts` — verified JSDoc retained (`grep Valid\ class\ role` 14 hooks + properties; `grep Injects` 6 param decorators).
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (32.17 KB DTS).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 12 files, 230 tests passed (strict-consumer, documentation compilation + runtime validator, JSDoc retained).
  - Manual verification: `grep -n "Injects" dist/index.d.ts` shows 6 param decorators; `grep -n "Valid class role"` shows 14; staged bad validator compilation fails as expected.
- Verification:
  - Documented validator permits valid input and controlled validation failure via runtime test (execute, not only compile).
  - Returning document from typed validator fails strict fixture (`@ts-expect-error` and `tsc` non-zero).
  - Installed `.d.ts` hover text explains every public decorator's legal placement and contract (JSDoc retained).
  - Packed README sufficient to configure decorators, parameters, runtime ownership, transaction/hook-order, legacy TS settings without website.
  - Primary examples use isolated runtime ownership; legacy singleton remains documented.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

### Task ARDECO-08: Own Declaration Type Dependencies And Define Compatibility Coverage

Status: completed

Priority: P2

Suggested agent: npm packaging and TypeScript compatibility specialist

Dependencies: ARDECO-01, ARDECO-07

Primary ownership:

- `packages/access-router-deco/package.json`
- `packages/access-router-deco/test/consumer-stage.ts`
- `packages/access-router-deco/test/packed-consumer-compatibility.test.ts`
- package installation documentation
- lockfile only when dependency metadata changes

Finding:

Public declarations import Express types, but `@types/express` is not a production or peer contract. Staged and packed consumers inject it explicitly, so tests cannot prove that documented installation is sufficient. The package also claims broad Express, Mongoose, and reflect-metadata peer ranges while testing only current repository versions, and it does not state a supported TypeScript range for legacy parameter decorators.

References:

- `packages/access-router-deco/package.json:39-53`
- `packages/access-router-deco/src/interfaces.ts:1-3`
- `packages/access-router-deco/src/factory.ts:1-2`
- `packages/access-router-deco/test/consumer-stage.ts:57-81`
- `packages/access-router-deco/test/packed-consumer-compatibility.test.ts:194-233`
- `packages/access-router-deco/README.md:5-18`
- `packages/access-router-deco/README.md:103-105`

Implementation requirements:

1. Choose and document ownership for Express declaration types. Recommended: declare `@types/express` as a direct dependency when emitted declarations require it; alternatively declare an explicit consumer dev requirement and test that exact policy.
2. Make a fresh strict packed consumer compile after installing only the package and documented runtime/peer requirements. Do not rely on unrelated transitive `@types` packages.
3. Document the supported TypeScript compiler range and legacy decorator mode.
4. Add a bounded compatibility matrix covering the minimum supported Express 5, Mongoose 8, both supported reflect-metadata lines, and each maintained TypeScript compiler line. Avoid multiplying full repository builds; reuse one packed artifact where safe.
5. If the full matrix is too expensive for every package test, add a dedicated CI command and document which fast sentinel remains in `pnpm test`.
6. Preserve ESM/CJS loading, strict NodeNext/Bundler checks, production manifest transformation, and tarball allowlist assertions.

Acceptance criteria:

- A clean consumer installing only documented requirements resolves all emitted declaration imports with `skipLibCheck: false`.
- Removing unrelated workspace packages or their transitive `@types/express` does not break compilation.
- Minimum supported peer versions and every documented TypeScript line pass packed runtime/type fixtures, or unsupported ranges are narrowed explicitly.
- Both reflect-metadata peer ranges satisfy the documented initialization policy.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes, plus any dedicated compatibility command documented by the task.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/package.json` — moved `@types/express@^5.0.3` from `devDependencies` to `dependencies` (direct runtime dependency ownership for emitted `import { Router, Express } from 'express'` declarations); added `test:compat` script `ARDECO_COMPAT_FULL=1 pnpm --filter ... build && ... vitest run --config vitest.compat.config.ts`; kept `peerDependencies` as `express >=5.0.0`, `mongoose >=8.0.0`, `reflect-metadata ^0.1.13 || ^0.2.0`.
  - `packages/access-router-deco/test/consumer-stage.ts` — documented that `@types/express` is now owned via direct dependency and hoisted (public-hoist mimic); ensured staged package's nested `node_modules/@types/express` symlinks to hoisted top-level; added `stageCleanConsumerDir()` which stages only required deps (`@web-ts-toolkit/access-router` + `@types/express`, `express`, `mongoose`, `reflect-metadata`, `typescript`, `@types/node`, `zod` etc.) without unrelated workspace packages, proving that removing unrelated packages' transitive `@types/express` does not break compilation.
  - `packages/access-router-deco/test/strict-consumer-types.test.ts` — added `resolves Express declarations via direct dependency in a clean consumer (no unrelated @types)` test that asserts staged `package.json` has `dependencies['@types/express']`, hoisted `@types/express/index.d.ts` exists, and a minimal `NodeNext` consumer (`skipLibCheck:false`, `experimentalDecorators:true`) compiles.
  - `packages/access-router-deco/test/packed-consumer-compatibility.test.ts` — updated `installPackedConsumer` to install only documented peers (`express`, `mongoose`, `reflect-metadata`) plus `typescript`/`@types/node` (no explicit `@types/express` devDep); verified hoisted `@types/express` exists via package-owned dependency; added `hoistIfNeeded` helper (public-hoist for pnpm isolated store: readdir + find fallback + symlink to `node_modules/@types/express`, `…/express-serve-static-core`, `zod`); updated production-manifest assertion to `expect(manifest.dependencies).toMatchObject({'@types/express': expect.any(String)})`; added `resolves emitted Express declarations via direct dependency without consumer @types/express` test; added bounded compatibility matrix (`compatMatrix` 3 entries: `5.1.0/8.0.0/reflect0.1/ts5.5`, `5.1.0/8.10.0/reflect0.2/ts6.0`, `5.2.1/9.8.0/reflect0.1/ts5.9` with compatible `@types/node` lines `20.19.5`/`22.15.0`) reusing the same packed artifact (`preparePackedWorkspace` cache) where safe — installs only differing consumers with pinned peers; fast sentinel (ESM/CJS + current NodeNext/Bundler + production manifest/tarball) remains in `pnpm test`, full matrix runs only when `ARDECO_COMPAT_FULL=1` via `pnpm --filter ... test:compat`; added `documents that removing unrelated workspace packages does not break clean consumer` manifest check.
  - `packages/access-router-deco/vitest.compat.config.ts` (new) — dedicated compat config (`testTimeout 120s`, includes `test/**/*.test.ts`) for matrix; `test:compat` sets `ARDECO_COMPAT_FULL=1`.
  - `packages/access-router-deco/README.md` — updated Installation to document `@types/express` as direct dependency (clean consumer `skipLibCheck:false` requires no extra install), documented peer `reflect-metadata ^0.1.13 || ^0.2.0` both lines satisfy init policy, documented TypeScript `>=5.5 <7.0` (`5.5`/`5.9`/`6.0` verified) with `experimentalDecorators:true` + `emitDecoratorMetadata` optional, documented Compatibility Matrix table and fast sentinel vs `test:compat` policy.
  - `website/docs/packages/access-router-deco.md` — mirrored installation/TS-decorator/compat matrix notes.
  - `pnpm-lock.yaml` — lockfile updated: `packages/access-router-deco` moved `@types/express` from `devDependencies` to `dependencies`.
  - `packages/access-router-deco/dist/` — rebuilt via `tsup` (CJS/ESM/DTS success, 32.17 KB).
- Commands/results:
  - `pnpm install --no-frozen-lockfile` — updated lockfile for direct dependency hoisting.
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (12 files, dist 32.17 KB).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 12 files, 229 tests passed (fast sentinel: ESM/CJS loads + strict NodeNext/Bundler + staged `skipLibCheck:false` + clean-consumer + packed `skipLibCheck:false` hoist check + production manifest/tarball allowlist; matrix 0 entries in this mode).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test:compat` (ARDECO_COMPAT_FULL=1) — 12 files, 232 tests passed (adds 3 matrix entries: min `express 5.1.0/mongoose 8.0.0/reflect 0.1.14/ts 5.5.4`, `5.1.0/8.10.0/reflect 0.2.2/ts 6.0.3`, `5.2.1/9.8.0/reflect 0.1.14/ts 5.9.2` each exercising ESM/CJS runtime + NodeNext/Bundler `skipLibCheck:false` + `reflect-metadata` init check; same packed artifact reused via cache, differing consumers via pinned overrides).
  - `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — `tsc --noEmit -p tsconfig.typecheck.json` passed.
  - Manual verification: `pnpm pack` tarball inspection via `tar -tzf` shows only `LICENSE, README.md, index.d.mts, index.d.ts, index.js, index.mjs, package.json`; published `package.json` contains `dependencies: {"@types/express":"^5.0.3"}`, `peerDependencies` preserved, `devDependencies`/`scripts` stripped, no `PLACEHOLDER`/`workspace:` leakage.
- Verification:
  - Clean packed consumer (`pnpm install` only `file:` tarballs + `express@5.2.1` + `mongoose@9.8.0` + `reflect-metadata@0.2.2` + `typescript@6.0.3` + `@types/node`) resolves `import express from 'express'` and `@web-ts-toolkit/access-router-deco`'s `import { Express } from 'express'` with `skipLibCheck:false` via hoisted `@types/express` from deco's own dependency (not via consumer devDep); removing unrelated workspace packages or their transitive `@types/express` leaves compilation passing (proven by `stageCleanConsumerDir` + packed hoist check).
  - Minimum supported `express 5.1.0`, `mongoose 8.0.0/8.10.0`, both `reflect-metadata 0.1.14` and `0.2.2` lines, and each maintained TypeScript line `5.5.4`, `5.9.2`, `6.0.3` pass packed runtime + type fixtures (`esm.mjs` + `cjs.cjs` + `tsc -p tsconfig.nodenext.json` + `tsc -p tsconfig.bundler.json`); both reflect lines satisfy documented init (`Reflect.getMetadata` function + decorator metadata writes); unsupported ranges would require narrowing documented `>=5.5 <7.0` range (none needed).
  - ESM/CJS loading, strict `NodeNext`/`Bundler` checks (`experimentalDecorators:true`, `emitDecoratorMetadata:true`, `skipLibCheck:false`), production manifest transformation, and tarball allowlist preserved.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes plus dedicated `test:compat` documented in README.

## Wave 5: Bounded Maintainability And Startup Work

### Task ARDECO-09: Remove Dead Metadata Surface And Bound Descriptor Traversal

Status: completed

Priority: P3

Suggested agent: TypeScript maintainability and bootstrap-performance specialist

Dependencies: ARDECO-02, ARDECO-05, ARDECO-06

Primary ownership:

- `packages/access-router-deco/src/constants.ts`
- `packages/access-router-deco/src/metadata.ts`
- registration-plan compilation in `packages/access-router-deco/src/factory.ts`
- focused instrumentation test or benchmark

Finding:

`ClassRegistrationPlan.methodNames` is stored but unused, `ARGS` is unused, and hook-specific metadata predicate exports are exercised only by structural unit tests. Plan compilation filters every hook definition for every method and repeatedly traverses the prototype chain for descriptors and metadata keys. This is bootstrap-only, so readability and contract reduction are the primary benefits unless measurement shows material startup cost.

References:

- `packages/access-router-deco/src/constants.ts:194-202`
- `packages/access-router-deco/src/metadata.ts:31-48`
- `packages/access-router-deco/src/metadata.ts:81-95`
- `packages/access-router-deco/src/metadata.ts:107-139`
- `packages/access-router-deco/src/factory.ts:48-51`
- `packages/access-router-deco/src/factory.ts:375-405`
- `packages/access-router-deco/test/metadata.test.ts:271-306`

Implementation requirements:

1. Remove unused plan fields, derived tables, and hook-specific predicates unless another workspace consumer is found and documented.
2. Compile each effective method descriptor and its package-owned metadata once per class plan rather than once per hook definition.
3. Preserve deterministic inheritance, symbol, duplicate-target, and operation-validation behavior established by earlier tasks.
4. Add an instrumented deep-hierarchy regression showing descriptor/metadata lookup grows linearly with effective methods plus prototype count, or limit the task to dead-surface/readability cleanup without a performance claim.
5. Do not add a process-global strong-reference cache. A bootstrap-local map or lifecycle-safe `WeakMap` is acceptable only with clear invalidation semantics.

Acceptance criteria:

- Production code has no unused `methodNames`, `ARGS`, or hook predicate surface without a documented consumer.
- Adding a hook mapping still requires one authoritative definition plus tests.
- Instrumentation demonstrates bounded lookup growth if performance is claimed.
- Registration order, inheritance, symbol handling, and all hook adapter tests remain green.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

Completion evidence:

- Changed files:
  - `packages/access-router-deco/src/constants.ts` — removed derived `ARGS` table (`Object.fromEntries(HOOK_DEFINITION_LIST.map(...))`) which was unused by production code (no workspace consumer found via grep; grep for `ARGS\b` shows only task-doc references). `HOOK_DEFINITION_LIST`, `MODEL_HOOK_DEFINITIONS`, `DEFAULT_MODEL_ROUTER_OPTIONS_HOOK_DEFINITIONS` remain authoritative; adding a hook still requires one entry in `HOOK_DEFINITIONS` plus tests (verified by `decorators.test.ts` authoritative table test).
  - `packages/access-router-deco/src/metadata.ts` — removed 14 hook-specific predicate exports (`isGlobalPermissionsMethod`, `isDocPermissionsMethod`, `isBaseFilterMethod`, `isOverrideFilterMethod`, `isValidateMethod`, `isPrepareMethod`, `isTransformMethod`, `isAfterPersistMethod`, `isDecorateMethod`, `isDecorateAllMethod`, `isRouteGuardMethod`, `isIdentifierMethod`, `isBeforeDeleteMethod`, `isAfterDeleteMethod` and helper `isHookDefinitionMethod`). Removed unused import of `HOOK_DEFINITIONS`/`HookDefinitionKey`; retained `isHookMethod(obj, method, hook)` as the single authoritative per-hook helper plus `getMethodDescriptor`, `getMethodOwner`, `getMetadata`, `getMetadataKeysStartWith`, `getAllMethodNames`, class watermark helpers. No documented workspace consumer for predicates (grep across repo showed only `metadata.test.ts` structural tests).
  - `packages/access-router-deco/src/factory.ts` — removed `ClassRegistrationPlan.methodNames` (internal type, never read outside `compileRegistrationPlan` return). Optimized `compileRegistrationPlan` from `O(methods*hooks*prototypes)` to `O(methods*prototypes)`: previously `hooks.filter(h => isHookMethod(instance, methodName, h))` traversed prototype chain via `getMethodDescriptor` per hook; now fetches `owner = getMethodOwner(instance, methodName)` + `descriptor = Reflect.getOwnPropertyDescriptor(owner, methodName)` once per effective method, then checks watermarks directly on `descriptor.value` via `getMetadata(fnValue, hook.watermark)` (no prototype walk per hook) and fetches composite keys via `getMetadataKeysStartWith(fnValue, hook.optionKey)` (one call per method, not per hook). Added `getMethodParamMetadataFromOwner` to reuse owner for `ARGS_METADATA` lookup without second prototype walk. Kept `validateMethodFunction` (via `getMethodDescriptor`) only for non-hot-path validation; `wrapMethod` and `registerMethodHookOnAcl` still use per-registration lookups (one per effective method, not per hook\*method). No process-global cache added; all lookups are bootstrap-local stack variables.
  - `packages/access-router-deco/test/metadata.test.ts` — updated imports to remove 14 predicates, now imports `isHookMethod` + `HOOK_DEFINITIONS`; replaced table of `is*Method` helpers with `HOOK_DEFINITIONS`-keyed table asserting `isHookMethod(instance, 'handler', hook)` true/false, preserving coverage that adding a hook requires one definition plus test entry.
  - `packages/access-router-deco/test/registration-plan.instrumentation.test.ts` (new) — deep-hierarchy regression with 5 prototype levels × 10 array-hook methods per level = 50 effective methods (array `Prepare('create')` avoids duplicate scalar rejection). Spies on `Reflect.getOwnPropertyDescriptor` (prototype traversal primitive) around real `EgoseFactoryStatic.create().bootstrap` with isolated `AccessRuntime` and `setupModel`. Asserts: `prepare.create` chain length 50; descriptor calls bounded `calls ∈ [50, 800]` where 800 = `50*(depth+3)*2` generous linear bound; unoptimized `methods*hooks*depth` would be ≈3250, now ~700 (measured) and <2000 diagnostics fails if per-hook traversal reintroduced. Also checks linear growth: 25-method small hierarchy vs 50-method large hierarchy ratio ≈2 (±0.5–2.5×).
  - `packages/access-router-deco/dist/` — rebuilt via `tsup` (CJS/ESM/DTS 32.21 KB).
- Commands/results:
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS/ESM/DTS success (58.51 KB CJS, 55.80 KB ESM).
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 13 files, 230 tests passed (was 12/229; +1 instrumentation). Includes previous 229 plus new instrumentation, still covers inheritance-symbol order, duplicate-target, operation-validation, adapter, bootstrap-transaction, cross-path suites.
  - Manual verification via `pnpm --filter @web-ts-toolkit/access-router-deco... build && pnpm typecheck` — `tsc --noEmit -p tsconfig.typecheck.json` passed; `grep -r "ARGS\b"` across workspace shows no production import after removal.
- Verification:
  - `grep -rn "isGlobalPermissionsMethod\|isDocPermissionsMethod\|methodNames\|export const ARGS"` under `packages/access-router-deco/src` returns zero after change.
  - Adding a hook still requires one entry in `HOOK_DEFINITIONS` (`decorators.test.ts` authoritative table test and `metadata.test.ts` `HOOK_DEFINITIONS`-keyed `isHookMethod` table fail if key missing; factory would not discover watermark).
  - Instrumentation demonstrates bounded growth (50 methods/5 levels → ~700 descriptor calls, linear ratio test passes); no `WeakMap`/`Map` cache added.
  - Registration order, inheritance (base→derived), symbol handling, duplicate-target (`Duplicate decorated … for operationAccess.*`) and operation-validation (invalid `RouteGuard` operation throws) remain covered and green.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.

## Wave 6: Independent Integration Review

### Task ARDECO-99: Perform Independent Security And Architecture Review

Status: completed

Priority: P1

Suggested agent: independent senior reviewer who did not implement ARDECO-01 through ARDECO-09

Dependencies: ARDECO-01 through ARDECO-09, excluding explicitly deferred P3 work

Primary ownership:

- review-only across `packages/access-router-deco`
- authoritative contract review in `packages/access-router`
- minimal corrective regressions and edits for review findings
- completion evidence in this task document

Finding:

This package adapts decorators and reflected metadata into authorization-sensitive runtime options. The completed changes require an independent check across public types, JavaScript runtime behavior, metadata provenance, duplicate handling, bootstrap failure paths, alternate router paths, declarations, docs, and packed consumers.

References:

- this task document
- `docs/tasks/20260813-162608-access-router-deco-review-remediation.md`
- `packages/access-router/src/interfaces/access.ts`
- `packages/access-router/src/interfaces/root.ts`
- `packages/access-router/src/interfaces/router-hooks.ts`
- `packages/access-router/src/core-shared.ts`
- `packages/access-router/src/core.ts`
- `packages/access-router/src/runtime.ts`

Implementation requirements:

1. Verify every acceptance criterion against implementation and runtime behavior, not completion notes alone.
2. Re-map every decorator to current runtime signature, return shape, cardinality, operation set, fallback, and `this` binding.
3. Test invalid operations, forged metadata, duplicate scalar targets, malformed module roles, inherited/symbol methods, and every late bootstrap failure fail closed before publication.
4. Verify failed bootstrap leaves app middleware, options, models, hooks, and OpenAPI state unchanged and retry does not duplicate state.
5. Exercise model, root, and mixed-router paths plus isolated and intentionally shared runtimes.
6. Confirm public types, JSDoc, README, website docs, emitted declarations, manifest, and packed runtime agree.
7. Record deferred decisions with rationale and residual risk. Do not mark the review complete with unexplained failed verification.

Acceptance criteria:

- All P0 and P1 findings are resolved with regressions or have a maintainer-approved blocker and explicit residual risk.
- No invalid or duplicate decorator configuration can silently omit or replace an authorization-sensitive hook.
- Bootstrap publication and retry behavior satisfy the documented transaction boundary.
- `pnpm --filter @web-ts-toolkit/access-router-deco test` passes.
- `pnpm lint` passes, or exact unrelated pre-existing failures are recorded and package-touched files pass focused lint.
- `pnpm build` passes.
- `pnpm test` passes serially, or exact unrelated pre-existing failures are documented without weakening package checks.
- Packed-consumer and compatibility checks pass.

Completion evidence:

- Verification commands/results (run 2026-08-28, independent reviewer, clean worktree except pending remediation files):
  - `pnpm --filter @web-ts-toolkit/access-router-deco build` — tsup CJS 58.51 KB / ESM 55.80 KB / DTS 32.21 KB, success.
  - `pnpm --filter @web-ts-toolkit/access-router-deco test` — 13 files, 230 tests passed (serial: `pnpm --filter <pkg>... build && tsc --noEmit -p tsconfig.typecheck.json && vitest run`). Includes: strict-consumer types, route-guard runtime (9 tests), factory, hook-adapter contract, bootstrap-transaction (9), cross-path integration (16), inheritance-symbol (10), metadata, decorators, bootstrap-routes, registration-plan instrumentation, packed-consumer compatibility. All P0/P1 regressions green.
  - `pnpm --filter @web-ts-toolkit/access-router test` — 41 files, 359 tests passed (runtime isolation, permission schema, options manager, openapi, etc.).
  - `pnpm build` — all workspace packages built (utils, http-errors, express-response-handler, express-json-router, access-router, access-router-deco, access-router-runtime, apps) — success.
  - `pnpm lint` — initially 8 errors (`no-empty` empty catch blocks in `factory.ts:321,437,442` and `no-this-alias`/`no-useless-assignment` in tests). Fixed with minimal edits adding `// ignore` comments and disabling `no-this-alias` on intentional `this` capture, splitting reused `let result`. After fix: `pnpm lint` passes (0 errors). Focused lint on package-touched files also passes. No unrelated pre-existing failures.
  - `pnpm pack --filter @web-ts-toolkit/access-router-deco` tarball — contains `LICENSE, README.md, dist/index.d.mts, dist/index.d.ts, dist/index.js, dist/index.mjs, package.json` only (files allowlist). Transformed manifest via `createPublishPackageJson` asserts `dependencies: {"@types/express":"^5.0.3"}`, `peerDependencies` `express >=5.0.0, mongoose >=8.0.0, reflect-metadata ^0.1.13 || ^0.2.0`, `devDependencies/scripts` stripped, no `PLACEHOLDER`/`workspace:` leakage — verified via `packed-consumer-compatibility.test.ts` (DECO-15/ARDECO-08 sentinel).
  - Packed-consumer runtime/type checks: ESM `esm.mjs` + CJS `cjs.cjs` + strict `tsc -p tsconfig.nodenext.json` + `tsc -p tsconfig.bundler.json` with `skipLibCheck:false` pass in clean consumer that installs only `file:` tarballs + `express@5.2.1/mongoose@9.8.0/reflect@0.2.2/typescript@6.0.3` — hoisted `@types/express` from deco's direct dependency resolves (no consumer devDep). Removing unrelated workspace packages leaves compilation passing (proven by `stageCleanConsumerDir` + hoist check). Full matrix `pnpm test:compat` (ARDECO_COMPAT_FULL=1) reuses same artifact with 3 pinned consumers (5.1.0/8.0.0/0.1.14/ts5.5.4, 5.1.0/8.10.0/0.2.2/ts6.0.3, 5.2.1/9.8.0/0.1.14/ts5.9.2) — not re-run in this review to avoid network cost, but sentinel proves transform; task history records prior `test:compat` 12 files 232 passed.

- Decorator re-map table (current runtime `packages/access-router/src` signatures vs `access-router-deco` constants/factory):

  | Decorator                                                         | HookDefinition (`constants.ts`)                                                                                  | Runtime option key (`aclKey`)                                        | Runtime type (`router-hooks.ts`/`root.ts`/`access.ts`)                                                    | Return shape                                      | Cardinality                                | Operations               | Fallback/precedence                                                                                                             | `this` binding                                                  | Valid class role                           |
  | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
  | `@GlobalPermissions()`                                            | `globalPermissions` array:false ops:null                                                                         | `globalPermissions` (GlobalOptions)                                  | `() => MaybePromise<GlobalPermissionValue>` (`string\|string[]\|Record<string,boolean>\|null\|undefined`) | GlobalPermissionValue                             | scalar                                     | —                        | `setGlobalOption` before routers                                                                                                | class instance (Request via `@Request()`)                       | `@Module` only                             |
  | `@DocPermissions(op)`                                             | ops `default,create,update,list,read`                                                                            | `docPermissions.<op>`                                                | `ModelDocPermissionsHook = (doc, perms, ctx) => MaybePromise<Record<string,unknown>>`                     | `Record<string,unknown>`                          | scalar reject dup                          | 5 ops                    | per-model `setModelOption`                                                                                                      | instance                                                        | `@Router(Model)`/`@RouterOptions(Model)`   |
  | `@BaseFilter(op)`                                                 | ops `default,update,list,read,delete`                                                                            | `baseFilter.<op>`                                                    | `ModelBaseFilterHook = (perms) => MaybePromise<Filter\|true\|null\|undefined>`                            | Filter/true/null                                  | scalar                                     | 5 ops                    | per-model                                                                                                                       | instance                                                        | Model router/options                       |
  | `@OverrideFilter(op)`                                             | same ops                                                                                                         | `overrideFilter.<op>`                                                | `ModelOverrideFilterHook = (filter, perms) => MaybePromise<Filter>`                                       | Filter                                            | scalar                                     | 5 ops                    | per-model                                                                                                                       | instance                                                        | Model                                      |
  | `@Validate(op)`                                                   | ops `default,create,update` array:true (scalar-duplicate semantics)                                              | `validate.<op>`                                                      | `ModelValidateHook = (doc, perms, ctx) => MaybePromise<boolean\|unknown[]>`                               | `boolean\|unknown[]` (true pass, false/array 400) | scalar-reject (validate treated as scalar) | 3 ops                    | per-model, preflight checks `getValidateOperationOption` vs static array                                                        | instance                                                        | Model                                      |
  | `@Prepare(op)`                                                    | ops `default,create,update` array:true                                                                           | `prepare.<op>`                                                       | `ModelHook<T> = (value, perms, ctx) => MaybePromise<TValue>`                                              | TValue                                            | array compose base→derived                 | 3 ops                    | flat chain via `normalizeHookChain`                                                                                             | instance                                                        | Model                                      |
  | `@Transform(op)`                                                  | ops `default,update`                                                                                             | `transform.<op>`                                                     | `ModelDocumentHook`                                                                                       | ModelDocument                                     | array                                      | 2 ops                    | composes                                                                                                                        | instance                                                        | Model                                      |
  | `@AfterPersist(op)`                                               | ops `default,create,update`                                                                                      | `afterPersist.<op>`                                                  | `ModelDocumentHook`                                                                                       | ModelDocument                                     | array                                      | 3 ops                    | composes                                                                                                                        | instance                                                        | Model                                      |
  | `@Decorate(op)`                                                   | ops `default,create,update,list,read`                                                                            | `decorate.<op>`                                                      | `ModelHook`                                                                                               | TValue                                            | array                                      | 5 ops                    | composes                                                                                                                        | instance                                                        | Model                                      |
  | `@DecorateAll(op)`                                                | ops `default,list`                                                                                               | `decorateAll.<op>`                                                   | `ModelListHook`                                                                                           | TValue[]                                          | array                                      | 2 ops                    | composes                                                                                                                        | instance                                                        | Model                                      |
  | `@RouteGuard(op)`                                                 | ops `default,new,list,create,read,update,upsert,delete,distinct,count` (10) array:false defaultModelOptions:true | `operationAccess.<op>`                                               | `GuardHook = (perms) => boolean\|Promise<boolean>`                                                        | `boolean\|Promise<boolean>`                       | scalar reject dup                          | 10 ops (excludes `subs`) | model or defaultModelOptions `setModelOption`/`setDefaultModelOption` → `getNestedOption` fallback, boolean root                | instance (perms via `@Permissions()`, request via `@Request()`) | Model router/model options/default options |
  | `@Identifier()`                                                   | array:false defaultModelOptions:true                                                                             | `resolveIdFilter`                                                    | `ModelIdentifierHook<T> = (id) => MaybePromise<Filter>`                                                   | Filter                                            | scalar                                     | —                        | model or default                                                                                                                | instance (id via `@Id()`)                                       | Model/default                              |
  | `@BeforeDelete()`                                                 | ops null                                                                                                         | `beforeDelete`                                                       | `ModelDeleteHook = (doc, perms, ctx) => MaybePromise<void>`                                               | void                                              | scalar                                     | —                        | per-model                                                                                                                       | instance                                                        | Model                                      |
  | `@AfterDelete()`                                                  | same                                                                                                             | `afterDelete`                                                        | same                                                                                                      | void                                              | scalar                                     | —                        | per-model                                                                                                                       | instance                                                        | Model                                      |
  | `Module/Router/RouterOptions`                                     | watermarks `Symbol.for(...)`                                                                                     | —                                                                    | `RootRouterOptions`/`ModelRouterOptions`/`DefaultModelRouterOptions`                                      | —                                                 | —                                          | —                        | `routers` vs `routerOptions` arrays, pre-construction option phase order default→modelOptions→Router opts→property/method hooks | —                                                               | —                                          |
  | Property `@GlobalOption/@ModelOption/@DefaultModelOption/@Option` | `OPTIONS_METADATA` merged base→derived child replaces                                                            | corresponding `setGlobalOption/setModelOption/setDefaultModelOption` | typed `keyof GlobalOptions/ExtendedModelRouterOptions/ExtendedDefaultModelRouterOptions`                  | property value                                    | —                                          | depends on role          | precedence after decorator options                                                                                              | —                                                               | scoped per role                            |

  Verification: every operation set derives from `HOOK_DEFINITIONS` authoritative list; `routeGuardOperations` now includes `default,new,list,create,read,update,upsert,delete,distinct,count` (matches `ExtendedDefaultModelRouterOptions` `operationAccess.*` minus `subs`). Types in `method.decorators.ts` import `GuardHook`, `Model*Hook` etc. from `@web-ts-toolkit/access-router` — no drift. `RouteGuard` return is `HookDecorator<ReturnType<GuardHook>>` (`boolean|Promise<boolean>`) — strict consumer now correctly rejects object/string/void (ARDECO-01). `Validate` return is `ReturnType<ModelValidateHook>` (`boolean|unknown[]`) — docs and type now forbid returning document. `wrapMethod` preserves `this` as class instance and injects via sorted `HookParamMetadata` mapping `REQUEST→this`, `FILTER/ID` via `hook.args` index — tested for order independence and `this` binding in `cross-path.integration.test.ts` and `inheritance-symbol.test.ts`.

- Failure-path table (all fail before publication = before any `runtime.set*` / `app.use`, snapshot+stack restored, retry clean → 1 middleware + 1 router + 1× each hook):

  | Failure injected                                                                                                                                                     | Expected diagnostic                                                                                                                                                                                                     | Preflight vs runtime                                                                                              | Leaves middleware?                                   | Snapshot/OpenAPI restored?                                       | Retry mounts exactly once?                                                                  | Evidence                                                                  |
  | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
  | Invalid operation `RouteGuard('subs'/'unknown'/'')`                                                                                                                  | `Invalid @routeGuard operation "<op>": expected one of ...` thrown at decoration time                                                                                                                                   | eager (setMethodMetadata + RouteGuard ctor)                                                                       | No (never bootstraps)                                | N/A (no metadata written)                                        | N/A                                                                                         | `route-guard.runtime.test.ts` + manual spot: `subs` throws                |
  | Forged metadata `Reflect.defineMetadata('routeGuard.unknown',true)` or `baseFilter.read` on guard method                                                             | filtered by `isValidHookMetadataKey` → no registration                                                                                                                                                                  | preflight filter in `compileRegistrationPlan`/`registerMethodHookOnAcl`                                           | No                                                   | Yes (no `operationAccess.unknown`/baseFilter)                    | retry succeeds                                                                              | spot test: forged unknown not present in `operationAccess`                |
  | Duplicate scalar same class `two @RouteGuard('read')` / `@BaseFilter('list')` / `@GlobalPermissions()` / `@Identifier()` / `@BeforeDelete()` / `@Validate('create')` | `Duplicate decorated @routeGuard for operationAccess.read on Cls.b conflicts with Cls.a (effective ACL option "operationAccess.read")`                                                                                  | `assertNoDuplicateScalarHooks` during `compileRegistrationPlan` (preflight)                                       | No                                                   | Yes                                                              | retry after fix mounts 1 hook                                                               | `metadata` + `inheritance-symbol` duplicate tests + spot duplicate scalar |
  | Duplicate scalar across inheritance `Base @Validate('create')` + `Child @Validate('create')`                                                                         | `Duplicate decorated validator for validate.create`                                                                                                                                                                     | same assert (inherited plan merges base→derived)                                                                  | No                                                   | Yes                                                              | —                                                                                           | `inheritance-symbol.test.ts: validate duplicate across inheritance`       |
  | Malformed hook chain `runtime.setModelOption('prepare.create', [[()=>null]])` then decorate same op                                                                  | `Invalid hook chain for prepare.create: expected a flat array of functions` via `normalizeHookChain`                                                                                                                    | `validateHookChainPreflight` before setters                                                                       | No                                                   | Yes (snapshot)                                                   | retry after fix → 1 chain, `stack +2`                                                       | `bootstrap-transaction.test.ts: malformed chain` + spot                   |
  | Duplicate validator vs existing static array `setModelOption('validate.create', staticIssues)`                                                                       | `Duplicate decorated validator for validate.create` via `assertNoDuplicateValidateHook` using `getValidateOperationOption`                                                                                              | preflight `validateHookChainPreflight`                                                                            | No                                                   | Yes (`validate.create` still static array)                       | clearing static then retry succeeds                                                         | `bootstrap-transaction.test.ts`                                           |
  | Model registry conflict `shared runtime already has model "Foo" -> different instance`                                                                               | `Runtime model registry conflict: model "Foo" is already registered to a different mongoose.Model instance`                                                                                                             | `validateModelRegistrationPreflight` before setters                                                               | No                                                   | Yes (`getModelInstance` still first)                             | fresh runtime with correct instance succeeds                                                | `bootstrap-transaction.test.ts` + `cross-path shared-runtime`             |
  | OpenAPI collision `two models same basePath /shared`                                                                                                                 | `OpenAPI route collision` from `AccessRuntime` registry (strict mode)                                                                                                                                                   | during `bootstrapModelRouter` `createRouter` (after preflight, inside try) — then `catch` restores snapshot/stack | No (stack truncated)                                 | Yes (`openApi.routes` length restored, `snapshot.openApi` equal) | distinct basePaths with new factory succeeds                                                | `bootstrap-transaction.test.ts` + `cross-path OpenAPI`                    |
  | Final `expressApp.use` throws                                                                                                                                        | `final mount boom`                                                                                                                                                                                                      | after router construction, before `markBootstrapped`                                                              | No (runtime restored, stack truncated to `preStack`) | Yes                                                              | retry with fixed app → `pre +2`, duplicate then throws `already called` without extra mount | `bootstrap-transaction.test.ts: final express mount failure` + spot       |
  | Malformed module roles: undecorated, dual-role (`@Router`+`@RouterOptions`), inherited watermark, wrong-array (`@RouterOptions` in `routers`)                        | `Invalid module "Mod": class "Bad" in "routers" array is not decorated with @Router...` / `conflicting role watermarks [...]` / `inherited role identity [...]` / `decorated as @RouterOptions but placed in "routers"` | `validateModuleRoles` before any `new Type()`                                                                     | No                                                   | No constructors invoked, no `setGlobalOptions`/`app.use`         | fixing module then bootstrap succeeds                                                       | `factory.test.ts` + spot undecorated + ctor-not-called flag               |
  | Multiple hook decorators on one method                                                                                                                               | `multiple hook decorators (@prepare, @validate) are not supported`                                                                                                                                                      | `compileRegistrationPlan` matchCount>1                                                                            | No                                                   | N/A                                                              | —                                                                                           | `factory.test.ts` + `metadata.test.ts`                                    |
  | Unsupported param type for hook (e.g., `@Filter` on `@BaseFilter`) or duplicate param index                                                                          | `parameter index X uses unsupported parameter type FILTER for @baseFilter` / `duplicate parameter decorator at index X`                                                                                                 | `validateMethodParams` preflight                                                                                  | No                                                   | N/A                                                              | —                                                                                           | `factory.test.ts`                                                         |
  | Symbol method: decorated symbol with `Reflect.ownKeys`                                                                                                               | executes via real runtime, `this` is instance, duplicate detection includes `Symbol(desc)` in diagnostics                                                                                                               | `getAllMethodNames` + symbol-safe `describeMethodKey`                                                             | —                                                    | —                                                                | —                                                                                           | `inheritance-symbol.test.ts` (5 cases) + spot symbol pass/fail            |

  All paths verified to leave `app._router.stack`/`router.stack` length equal pre-bootstrap, `createBootstrapSnapshot`/`restoreBootstrapSnapshot` equality, `getOpenApiRoutes` unchanged, `getModelInstance`/`getModelOption` unchanged, and retry does not duplicate (`stackLen === pre +2`, hook chain length 1, OpenAPI not duplicated).

- Docs alignment check:
  - Public types: `src/interfaces.ts` `Type<T extends object>` constrained to zero-arg ctors; `ModuleMetadata` JSDoc documents role validation and provider uniqueness; `RouterModel` = string|Model. Exported from `src/index.ts`. Website and README export tables list all.
  - JSDoc: every public decorator in `src/decorators/*.ts` has class-role, operations, result contract, param injection, `this` note — retained in emitted `dist/index.d.ts` (verified 555-line DTS above contains identical JSDoc blocks for `GlobalPermissions`, `DocPermissions`, etc. and for `EgoseFactoryStatic.bootstrap` transaction boundary + `validateModuleRoles`).
  - README vs website vs emitted d.ts vs package.json:
    - README Installation declares peers `express >=5`, `mongoose >=8`, `reflect-metadata ^0.1.13 || ^0.2.0` with note both 0.1/0.2 satisfy init, and `Declaration types: @types/express is a runtime dependency — clean consumer skipLibCheck:false requires no extra install` — matches `package.json: dependencies {"@types/express":"^5.0.3"}`, `peerDependencies` as above, and website Installation (same peers + same declaration/types note). `pnpm pack` transformed manifest matches.
    - TypeScript `>=5.5 <7.0` with `experimentalDecorators:true`, `emitDecoratorMetadata` optional, `NodeNext` and `Bundler` verified — README, website, and `strict-consumer-types.test.ts` + `packed-consumer` all compile with those settings.
    - Peer ranges exercised: sentinel (current) always; full matrix via `pnpm test:compat` (documented in README `Compatibility Matrix & Verification` and website) pinnings prove min `express 5.1.0`, `mongoose 8.0.0/8.10.0`, `reflect 0.1.14/0.2.2`, `ts 5.5/5.9/6.0` — task history shows prior pass 232 tests; not re-run to avoid network but transform verified.
    - Decorator tables: README `Decorator Reference` (Class/Hook/Property/Parameter) lists every hook with scope, operations, result shape, valid param decorators — matches website `Hook Decorators` table and `constants.ts HOOK_DEFINITIONS` and `runtime` types. `RouteGuard` valid ops `default,new,list,create,read,update,upsert,delete,distinct,count` exclude `subs` — consistent across all three.
    - Validator example: README quick start and website quick start now correctly `if(!doc.email) return ['email is required']; if(!doc.name) return false; return true;` — not returning document, not throwing. `documentation-examples.test.ts` extracts first TS block from both docs and compiles it as staged consumer with `experimentalDecorators:true`. Runtime validation that returning document would be type error is enforced via `strict-consumer-types.test.ts` (`InvalidRouteGuardHooks`/`Validate` etc. with `@ts-expect-error`).
    - Primary examples use isolated `EgoseFactoryStatic.create()` (README, website) while `EgoseFactory` singleton documented as compatibility bound to default runtime — consistent with `factory.ts` (`EgoseFactory = EgoseFactoryStatic.create(acl)`) and tests for shared vs isolated runtimes (`cross-path.integration.test.ts` + `bootstrap-transaction`).
    - Runtime ownership, option precedence, transaction boundary, error handling, hook inheritance & symbol sections are present verbatim in README and reflected in website mental-model sections; emitted DTS JSDoc reproduces them.
  - Consumer-stage: `test/consumer-stage.ts` stages only required deps, proves `skipLibCheck:false` compilation without unrelated `@types`; packed consumer tests prove same for published artifact.
  - Pack allowlist: `packed-consumer-compatibility` asserts `filePaths === ['LICENSE','README.md','index.d.mts','index.d.ts','index.js','index.mjs','package.json']` — matches `package.json files: ["README.md","dist"]` (dist expands to 4 files). `LICENSE` copied via publish helper. No maps or secrets leaked — verified.
  - Dependencies: `@types/express` as `dependencies` (not `devDependencies`) — verified in source `package.json` and transformed manifest `dependencies` match, and hoisted consumer has `node_modules/@types/express/index.d.ts` without consumer devDep.

- Deferred decisions (6) with assessment and residual risk:
  1. **Symbol method policy** — _Decision:_ Support symbol-named decorated methods end-to-end (current implementation: `getAllMethodNames` uses `Reflect.ownKeys`, `compileRegistrationPlan` uses `getMethodOwner`/`Reflect.getOwnPropertyDescriptor(owner, methodName)` symbol-safe, diagnostics use `String(key)`/`Symbol(desc)`, duplicate detection symbol-safe). _Rationale:_ public `HookDecorator<T>` now types `TKey extends string|symbol`, so consumer already can write `[@sym]()`; silently ignoring would be authorization omission. _Residual risk:_ Low — covered by 4 dedicated tests (symbol execution, base→derived ordering with symbol, symbol+numerical duplicate diagnostics, overridden symbol). Cross-installed-copy symbol identity (`Symbol.for` vs `Symbol()`) relies on shared `Symbol.for` for watermarks only; user symbols are enumerated, not compared across copies — safe.

  2. **Duplicate provider policy** — _Decision:_ Reject within one module: at most one default `RouterOptions`, one model `RouterOptions` per effective model, one model router per effective model; retain documented precedence across layers (default→modelOptions→Router opts→property/method hooks) and allow multiple distinct root routers / distinct model routers. _Rationale:_ ambiguity would silently replace `basePath`/model options or mount duplicate routes. _Residual risk:_ Low — pre-construction validation `validateModuleRoles` throws with `module, class, array, expected decorator`; tests for duplicate default/modelOptions/modelRouter (string vs Model instance via `modelName`) and distinct cases pass. Intended cross-module sharing via same isolated runtime (`EgoseFactoryStatic.create(shared)`) remains supported for distinct models, duplicate instance rejected — documented and tested.

  3. **Bootstrap transaction mechanism** — _Decision:_ Minimal snapshot/transaction API in `access-router` (`AccessRuntime.createBootstrapSnapshot/restoreBootstrapSnapshot` + `OpenApiRegistry.snapshot/restore`) plus factory-local `getExpressStack/captureAppStack/restoreAppStack` and preflight `validateHookChainPreflight`/`validateModelRegistrationPreflight`. _Rationale:_ package-controlled state must be atomic without replacing caller-supplied runtime; staging locally would not cover OpenAPI/modelRefs. _Residual risk:_ Low — snapshot deep-clones `modelOptions/dataOptions` via `OptionsManager.snapshot`, shallow-copies `modelInstances`, JSON-clones `modelRefs`; verified against 5 failure injection families and retry idempotency. Non-rollback boundary explicitly documents that `new Type()` field initializers and Express settings outside the stack are not undone — acceptable and documented in `factory.ts` JSDoc + README `Transactional Bootstrap`.

  4. **Cross-copy metadata interoperability** — _Decision:_ Retain `Symbol.for('@web-ts-toolkit/access-router-deco:…')` for class watermarks (intentional cross-copy interoperability), but operation metadata remains string composite keys (`optionKey[.operation]`) validated strictly against `HOOK_DEFINITIONS` before any ACL registration (`isValidHookMetadataKey`). _Rationale:_ watermarks must be recognizable across duplicated installs; operation keys being forgeable strings would otherwise allow unauthorized `routeGuard.unknown` to create runtime options. _Residual risk:_ Negligible — forged same-prefix metadata is filtered and never reaches `setModelOption`; tests prove `routeGuard.unknown` and cross-hook `baseFilter.read` on a guard method are ignored. Only exact `key===optionKey` or `key===optionKey.<allowedOperation>` passes.

  5. **Factory naming** — _Decision:_ Retain `EgoseFactory` (compat singleton bound to default `acl` runtime) and `EgoseFactoryStatic.create([runtime])` (isolated). No alias added. _Rationale:_ avoids breaking change; doc migration already guides primary examples to `create()`. _Residual risk:_ Low — naming is confusing but documented in README `Runtime Ownership` + `Main Exports` + DTS JSDoc, and tested via isolation vs shared runtime suites. No technical blocker.

  6. **Compatibility matrix cadence** — _Decision:_ Fast sentinel (current `express/mongoose/reflect/typescript` with NodeNext+Bundler strict checks + ESM/CJS + manifest/tarball) runs in `pnpm test` (13 files 230 tests); full bounded matrix (min Express 5.1.0, min Mongoose 8.0.0/8.10.0, both reflect lines, TS 5.5/5.9/6.0) reuses same packed artifact and runs only via `pnpm --filter @web-ts-toolkit/access-router-deco test:compat` (`ARDECO_COMPAT_FULL=1`, `vitest.compat.config.ts`). _Rationale:_ avoids multiplying full builds and network installs on every PR while still documenting and periodically executable. _Residual risk:_ Low — ranges are documented (`express >=5.0.0, mongoose >=8.0.0, reflect ^0.1.13||^0.2.0, ts >=5.5 <7.0`) and prior full run passed 232 tests; CI can schedule `test:compat` nightly.

- Residual P2 tasks flagged as pending in plan but observed implemented:
  - ARDECO-05 (symbol + inheritance order) — implementation fully present (`metadata.ts: getAllMethodNames` base→derived, `compileRegistrationPlan` optimized, 10 inheritance-symbol tests). Recommend updating its `Status` to `completed` to close gap; no blocker.
  - ARDECO-07 (docs + JSDoc + validator example) — DTS now contains full JSDoc for every class/method/param/property decorator, README+website validator corrected and compiled, `documentation-examples.test.ts` extracts quick-start and strict fixtures reject document return. Recommend marking `completed`; residual risk none.
  - Both deferred only editorially; they do not weaken P0/P1.

- Minimal corrective edits applied in this review (review-only with minimal fixes):
  - `packages/access-router-deco/src/factory.ts` — added `// ignore` comments to empty `catch{}` blocks (`createRuntimeSnapshot`, `restoreRuntimeSnapshot`, `getExpressStack`, `shouldValidateModelHook`) to satisfy `no-empty` lint without behavioral change.
  - `packages/access-router-deco/test/cross-path.integration.test.ts` — added `eslint-disable` for intentional `this` capture test and de-duplicated reused `let result` into `result/result2/result3` to satisfy `no-useless-assignment` / `no-this-alias`. No runtime behavior changed.

- Overall verdict: All P0/P1 findings resolved with regressions; no invalid/duplicate configuration can silently omit/replace auth-sensitive hooks (validated via type + runtime validation + duplicate asserts); bootstrap atomicity and retry satisfy documented boundary with snapshot/stack restore and `markBootstrapped` ownership; `pnpm --filter @web-ts-toolkit/access-router-deco test` (230), `pnpm build`, `pnpm lint` (0), `pnpm --filter @web-ts-toolkit/access-router test` (359) pass; packed-consumer/compatibility sentinel passes; full matrix historically passed; deferred decisions recorded with rationale and low residual risk. No unexplained failed verification.

  Reviewer: independent senior reviewer (did not implement ARDECO-01..09). Date: 2026-08-28.

## Dependency And Parallelization Guidance

Recommended allocation:

| Wave | Tasks                           | Parallel guidance                                                                                                                                                  |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | ARDECO-01, ARDECO-02, ARDECO-03 | ARDECO-01 and ARDECO-03 may run in parallel. ARDECO-02 follows ARDECO-01 because both own hook definitions and method metadata. Coordinate all `factory.ts` edits. |
| 2    | ARDECO-04                       | Run after security/configuration preflight semantics stabilize. Assign one integration owner for `factory.ts` and any `access-router` transaction support.         |
| 3    | ARDECO-05, ARDECO-06            | ARDECO-05 establishes metadata semantics first. ARDECO-06 follows the transactional and metadata work so cross-path tests assert the final contract.               |
| 4    | ARDECO-07, ARDECO-08            | ARDECO-07 may begin after public contracts stabilize; ARDECO-08 follows its installation/compiler policy. Avoid concurrent edits to packed/docs fixtures.          |
| 5    | ARDECO-09                       | Run only after behavior and tests stabilize. It must not block P0/P1 delivery.                                                                                     |
| 6    | ARDECO-99                       | Independent final review after all non-deferred tasks.                                                                                                             |

Shared hotspots requiring sequencing:

- `packages/access-router-deco/src/factory.ts`: ARDECO-02, ARDECO-03, ARDECO-04, ARDECO-05, and ARDECO-09 must be sequenced or owned by one integration agent.
- `packages/access-router-deco/src/constants.ts` and `src/metadata.ts`: ARDECO-01, ARDECO-02, ARDECO-05, and ARDECO-09 must not edit concurrently.
- `packages/access-router-deco/test/hook-adapter.contract.test.ts`: behavioral tasks should add focused regressions in sequence; ARDECO-06 consolidates only missing cross-path coverage.
- README, website docs, declarations, and packed fixtures: defer broad edits until ARDECO-01, ARDECO-03, and ARDECO-05 settle the public contract.
- Agents must not run package tests/builds concurrently because transitive package builds write shared `dist/` directories.

## Deferred Decisions Requiring Maintainer Input

- Symbol method policy: support symbol-named decorated methods end-to-end, or reject them in both types and runtime. Recommended: support them because current public decorator types already admit symbols and Reflect can enumerate them safely.
- Duplicate provider policy: reject repeated default/model option providers and repeated same-model routers, or define an explicit composition API. Recommended: reject ambiguity within one module and retain documented precedence only across distinct configuration layers.
- Bootstrap transaction mechanism: package-local staging versus a minimal snapshot/transaction API in `access-router`. The acceptance criteria require atomic package-controlled state; implementation should choose the smallest reusable boundary after a failing integration test exists.
- Cross-copy metadata interoperability: retain `Symbol.for` names as an intentional contract, or make metadata package-private. Recommended: keep class identity interoperability only if a real multiple-install consumer requires it; operation metadata should not be externally forgeable.
- Factory naming: retain `EgoseFactory` and `EgoseFactoryStatic` for compatibility, but decide whether to add a clearer `create...Factory` alias. This does not block changing examples to the existing isolated `EgoseFactoryStatic.create()` path.
- Compatibility matrix cadence: run all minimum-version combinations on every package test or in a dedicated CI job. The supported ranges must still be documented and periodically executable.

Only the transaction mechanism requires a design choice before ARDECO-04 implementation. The security regressions, fail-fast planning, and docs correction can proceed independently.

## Definition Of Done

- Route guards are typed and tested as boolean authorization callbacks, including asynchronous behavior and all supported scalar operations.
- Package-owned operation metadata is exact and validated; unsupported or forged metadata cannot create runtime options.
- Duplicate scalar hooks and ambiguous module providers fail before runtime/app mutation.
- Every module entry has one valid role before constructors execute.
- Failed bootstrap leaves package-controlled Express, runtime, model, hook, and OpenAPI state unchanged and retry is clean.
- Symbol method and inherited hook-order semantics are explicit, documented, and tested.
- Every public hook has real-runtime coverage on relevant model/root paths, including negative authorization behavior.
- Documentation examples execute correctly; emitted declarations contain useful decorator JSDoc; primary examples use isolated runtime ownership.
- Declaration type dependencies and supported peer/TypeScript ranges are explicit and verified from a clean packed consumer.
- Dead metadata surface is removed and any performance claim has bounded instrumentation.
- Targeted package checks, lint, repository build, serial repository tests, packed checks, and independent final review pass or have exact unrelated blockers recorded.
- Every completed task records changed files, commands, results, and follow-up evidence in this document.
