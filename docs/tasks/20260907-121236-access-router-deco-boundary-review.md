# Access Router Deco Boundary Review

Created: 2026-09-07 12:12:36 PDT

## Objective

Close newly demonstrated configuration, authorization-contract, module-isolation, and consumer-type gaps in `packages/access-router-deco`. This is a new execution phase after both earlier plans were marked completed, not a request to repeat their implementations.

Related plans:

- `docs/tasks/20260813-162608-access-router-deco-review-remediation.md` (DECO IDs).
- `docs/tasks/20260827-223556-access-router-deco-health-follow-up.md` (ARDECO IDs).

Scope: decorator registration, metadata inheritance, factory lifecycle, real `access-router` integration, shipped types/docs, and focused verification quality. The authoritative authorization and option-resolution contracts live in `packages/access-router`.

Non-goals: redesign runtime authorization, introduce a DI framework, migrate to standard decorators, remove the compatibility singleton, promise rollback of arbitrary user constructor effects, or broadly split the factory into new abstractions. This review creates tasks only; it does not implement fixes.

## Coverage And Baseline

- Reviewed package source, README, package metadata/build entrypoints, relevant emitted declarations, and metadata, decorator, factory, transaction, inheritance, hook, cross-path, strict-consumer, instrumentation, and packed-consumer tests. Compared the two completed package plans before promoting findings.
- Two read-only sub-agent reviews covered factory/runtime behavior and metadata/decorators respectively. They reported isolated Node probes against existing `dist`, real Express/runtime probes, and an in-memory strict TypeScript fixture reproducing the scenarios below. These probes were not persisted and must become regression tests; existing build freshness was not established by a rebuild.
- Coordinator ran `pnpm --filter @web-ts-toolkit/access-router-deco typecheck`: passed. `git status --short` was clean at review start.
- Package tests, compatibility matrix, fresh build/pack, and full repository checks were not run during this planning review. Focused source inspection and probes established task boundaries without rebuilding shared outputs. Do not interpret this document as a fresh passing runtime baseline.
- Root exports, bundled CJS/ESM build configuration, declaration paths, and direct Express type dependency align in the inspected files. Published metadata placeholders are intentionally rewritten by the publisher used in `test/packed-consumer-compatibility.test.ts:125-159`; they are not reported as a release defect.
- No external MongoDB integration, dependency vulnerability audit, hostile network-input fuzzing, or performance benchmark was performed. Metadata-writing scenarios assume in-process application/library code, not remote attacker access.

## Priorities And Coordination

This phase uses P1 for confirmed security-sensitive policy omission or substantial runtime correctness defects, P2 for bounded correctness/API gaps or investigations, and P3 for optional evidence-backed maintainability improvements. Earlier plans used different P0/P1 labels; the references below identify residual cases without rewriting historical completion evidence.

All implementation tasks start pending. Set `in_progress` only when dependencies are complete; record an owner. Keep tests with fixes. Record changed files, commands/results, and follow-ups on completion. If verification is unavailable, use `blocked`, naming the missing prerequisite rather than marking complete.

Shared-file sequencing:

- Factory owner: BDECO-01 -> 02 -> 03 -> 04 -> 06 -> 09 -> 10. These tasks share `src/factory.ts`; do not assign simultaneous edits there.
- Decorator owner: BDECO-05 -> 07 -> 08. These share decorators/docs; coordinate README and `cross-path.integration.test.ts` changes with the factory owner.
- BDECO-05 may run alongside BDECO-01 if it stays in its named decorator files and dedicated tests. BDECO-11 can run alongside implementation but must not modify shared build outputs concurrently.
- BDECO-12 is an independent integration review after all other tasks. Investigation completion means an evidence-backed decision, not a speculative implementation.
- All builds/tests run serially across agents. Package test scripts rebuild transitive dependencies into shared `dist/`; no concurrent test/build processes, including compatibility tests. Never manually edit generated files.

## Shared Verification

Working directory for all commands: `/home/jahn/projects/_web-ts-toolkit`.

Prerequisites: workspace dependencies installed with `pnpm install`, supported Node >=22, and registry/network or cached dependencies for packed consumers. Use the repository's package manager/tool versions.

- V1: After a fix, build current sources once with `pnpm --filter @web-ts-toolkit/access-router-deco... build`, then run `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/<affected-file>.test.ts` with the actual test filename. Include a before-fix failure where feasible; do not run tests against stale `dist`.
- V2: `pnpm --filter @web-ts-toolkit/access-router-deco test` after each implementation wave. It includes transitive builds, strict package typecheck, normal tests, strict/documentation consumer checks, and the packed-consumer sentinel.
- V3: `pnpm --filter @web-ts-toolkit/access-router-deco test:compat` for public type/metadata changes and final integration. Exercise NodeNext and Bundler consumers, ESM/CJS, and declared peer/compiler coverage. Record unsupported advertised minima rather than silently equating tested versions with all supported versions.
- V4: Final integration runs `pnpm build`, `pnpm test`, and `pnpm lint`, sequentially. Separate unrelated baseline failures from regressions; record exact evidence and blockers.

Public behavior/type changes require source JSDoc, README, relevant website docs, emitted declaration checks, and migration/release notes together. Preserve supported legacy decorators, symbol hooks, instance `this`, explicit injection, runtime ownership, and documented cross-layer precedence.

## Tasks

### Task BDECO-01: Preserve Root And Per-Operation Hook Configuration

Status: completed

Completion evidence:

- Changed `packages/access-router-deco/src/factory.ts` (exact-slot `getExactNestedValue`, validate `getValidateExactConflict`, `assertArrayRootShorthandFree`, scoped `registerMethodHookOnAcl` with model/default scope; preflight+registration use exact lookups, malformed maps still throw via `normalizeHookChain`, registration throws inside bootstrap try for atomic rollback).
- Changed `packages/access-router-deco/test/hook-adapter.contract.test.ts` (38 tests: root false/array/callback preservation, sibling/default combos both orders table-driven for all array-hook families, malformed rejection) and `test/bootstrap-transaction.test.ts` (root-false rollback), plus README root-shorthand contract paragraph.
- Verification: `pnpm --filter @web-ts-toolkit/access-router-deco... build` success; `vitest run test/hook-adapter.contract.test.ts` 38 passed; `test/bootstrap-transaction.test.ts` 10 passed; `test/factory.test.ts` 53 passed; typecheck clean. Before-fix: stashed src fix, rebuilt → 20 failed/18 passed; restored → 38 passed.
- Owner: sub-agent ses_f82abb6e9ffe8GoVQwGI8A9jsb, 2026-09-07.

Kind: defect

Priority: P1, registering one decorated operation can erase validation for another; valid sibling hook registrations also fail bootstrap.

Suggested agent: runtime option-contract specialist

Dependencies: none

Primary ownership: `packages/access-router-deco/src/factory.ts` option lookup/preflight/registration; `test/hook-adapter.contract.test.ts` and focused transaction tests in that package.

Finding: `getValidateOperationOption` recognizes only own operation properties, ignoring root validation booleans, issue arrays, and callbacks. Decorating `validate.create` over `validate: ['must reject']` replaces the root value with an operation map; `update` then resolves a value the runtime treats as successful validation. Separately, array-hook accumulation uses a fallback-resolving getter as an exact-slot lookup: after `prepare.create` is set, missing `prepare.update` resolves to `{ create: [...] }` and `normalizeHookChain` throws. Existing tests cover per-operation static validator conflicts and several callbacks on one operation, not root shorthands or sibling operation maps.

References:

- `packages/access-router-deco/src/factory.ts:106-138` and `:1035-1047`.
- `packages/access-router/src/core.ts:276-285` (validation fallback).
- `packages/access-router-deco/test/hook-adapter.contract.test.ts:165-184` and `:239-340`.
- Residual cases after DECO-02, DECO-04, and ARDECO-04; do not recreate their already-fixed callable-validator/flat-array work.

Requirements:

1. Establish exact-slot versus default/root fallback semantics at one registration boundary, using runtime-supported option forms. Do not accept arbitrary malformed maps as empty chains.
2. Reject conflicting static/root validators under the existing duplicate policy, or explicitly preserve their default behavior if the runtime contract calls for composition. Never silently weaken unrelated operations; document the chosen root-shorthand contract.
3. Support sibling operations and default/operation combinations in either declaration order for every array-hook family, preserving callback order and negative shape validation.

Acceptance criteria:

- Root `false`, issue-array, and callback validators cannot disappear when a decorated operation is registered; actual create/update validation proves this or bootstrap rejects atomically.
- `@Prepare('create')` plus `@Prepare('update')` bootstraps and executes the correct chains; table-driven equivalent cases pass for all supported array-hook families.
- Regression tests fail on the old implementation, cover both declaration orders, and retain malformed-chain rejection and rollback assertions.

Verification: V1 hook-adapter/transaction tests; V2.

### Task BDECO-02: Make Provider Precedence Independent Of Array Order

Status: completed

Completion evidence:

- Changed `packages/access-router-deco/src/factory.ts` bootstrap provider loop to apply default providers before model providers regardless of caller order (index list defaults-first, preserving relative order and plan pairing; BDECO-01 exact-slot preserved).
- Changed `packages/access-router-deco/test/bootstrap-routes.integration.test.ts` (+2 tests: both permutations deny + identical route params/paths with stale initial defaults and router override; duplicate-provider uniqueness retained).
- Verification: `pnpm --filter @web-ts-toolkit/access-router-deco... build` success; `vitest run test/bootstrap-routes.integration.test.ts` 9/9 passed; `test/factory.test.ts` 53/53 sanity. Before-fix: stashed fix → 1 failed/8 passed (model-first yielded stale path + permitted).
- Owner: sub-agent ses_f829c4ae5ffepQ16jvnon4e1Xq, 2026-09-07.

Kind: defect

Priority: P1, reversing valid providers can omit a deny guard.

Suggested agent: factory configuration specialist

Dependencies: BDECO-01

Primary ownership: `packages/access-router-deco/src/factory.ts` provider application; `test/bootstrap-routes.integration.test.ts` and provider-order tests.

Finding: default and model providers are applied in caller array order. Model options materialize defaults before a later default provider runs. With existing default `operationAccess: true`, a model provider followed by a default `@RouteGuard('new')` returning false leaves `/users/new` permitted; reversing providers denies it. `parentPath` and `idParam` also retain stale defaults. Existing precedence tests list default providers first.

References: `packages/access-router-deco/src/factory.ts:229-234`, `:530-552`; `packages/access-router-deco/test/bootstrap-routes.integration.test.ts:198-238`; README `:177-181`. Follow-up to DECO-05 and ARDECO-03.

Requirements:

1. Apply default providers before model providers, preserving original entries' associated plans and documented router/property/hook precedence.
2. Test both provider permutations with an actual denying route guard and route-construction options, including caller-supplied initial defaults.

Acceptance criteria:

- Both valid array orders return the same deny result and compile identical configured route parameters/paths.
- Router-specific overrides still win and provider uniqueness checks remain unchanged.

Verification: V1 bootstrap-routes tests; V2.

### Task BDECO-03: Scope Runtime Initialization To The Module Router

Status: completed

Completion evidence:

- Changed `packages/access-router-deco/src/factory.ts` to compose `runtimeMiddleware` + routes + error handlers on unmounted `express.Router()`, then single `app.use(basePath, router)`; removed global `app.use(runtimeMiddleware)`; JSDoc scope/ownership note; preserved BDECO-01/02.
- Changed `test/bootstrap-routes.integration.test.ts` (+6 scoped-init tests), `test/bootstrap-transaction.test.ts` (single-mount ownership assertions `+1`/`handle===router`/inner `setCoreMiddleware`), README scope paragraph (`app.use(factory.runtime())` for outside needs).
- Verification: build success (DTS 32.59kB); `bootstrap-routes` 15 passed; `bootstrap-transaction` 10 passed; `cross-path` 16 passed; `factory` 53 passed. Before-fix: `GET /outside` invoked resolver (calls=1); stashed fix → new test `expected 1 to be 0`.
- Owner: sub-agent ses_f8293a7d5ffe5lXjcKAAzVsdRM, 2026-09-07.

Kind: defect

Priority: P1, module permission resolution affects unrelated endpoints and escapes the opt-in module error boundary.

Suggested agent: Express isolation specialist

Dependencies: BDECO-02

Primary ownership: `packages/access-router-deco/src/factory.ts` router assembly/publication; `test/bootstrap-routes.integration.test.ts`, `test/bootstrap-transaction.test.ts`, relevant cross-path tests.

Finding: `expressApp.use(runtimeMiddleware)` is application-wide while only routes are mounted at `basePath`. A throwing global-permission resolver for `/a` runs on `/outside` and reaches the host error handler even with `handleErrors: true`. Existing unrelated-route tests replace initialization with a no-op, and isolated factory tests generally use separate apps.

References: `packages/access-router-deco/src/factory.ts:236-251`; `packages/access-router-deco/test/bootstrap-routes.integration.test.ts:11-39`; README `:224-230`. Residual initialization path after DECO-08 and ARDECO-04/06, not the already-fixed global 404 handler.

Requirements:

1. Compose runtime initialization before routes and error handlers on the unmounted module router, then publish under the same mount path.
2. Preserve returned router/runtime ownership, route ordering, safe errors, `headersSent` delegation, and atomic failure behavior. Update tests that assume exactly two host layers to assert meaningful ownership instead.
3. Document that applications needing request runtime initialization outside module routes must explicitly own that middleware.

Acceptance criteria:

- An unrelated host endpoint invokes neither module's permissions resolver; two isolated modules on one app use only their owning runtime on their paths.
- Sync/async initialization failures inside a module follow its configured safe error boundary; `handleErrors: false` delegates to the host.
- Failure/retry tests prove no partial publication or duplicate initialization.

Verification: V1 bootstrap-routes/transaction/cross-path tests; V2.

### Task BDECO-04: Close Preflight Rollback And Reentrant Bootstrap Gaps

Status: completed

Completion evidence:

- Changed `packages/access-router-deco/src/factory.ts` bootstrap lifecycle: `bootstrapInProgress` WeakMap reservation before user constructors, `try` covers metadata→user ctor→snapshot→preflights→mount, `catch` restores package snapshot+app stack, `finally` clears in-progress; successful duplicate protection retained; JSDoc non-conflation note.
- Changed `test/bootstrap-transaction.test.ts` (+2: lazy-conflict snapshot unchanged, reentrant ctor rejected/retryable) and `test/factory.test.ts` (+1 reentrancy lifecycle).
- Verification: build success (DTS 33.29kB); `bootstrap-transaction` 12 passed; `factory` 54 passed; `hook-adapter` 38 passed; `bootstrap-routes` 15 passed. Before-fix: transaction 2 failed/10 passed (snapshot mutated, nested null + outer OpenAPI collision); factory reentrant `expected [Function] to throw`.
- Owner: sub-agent ses_f828703c2ffe4tYf6K5XJJ2QNZ, 2026-09-07.

Kind: defect

Priority: P2, documented atomicity and duplicate protection miss concrete lifecycle entry paths.

Suggested agent: lifecycle transaction specialist

Dependencies: BDECO-03

Primary ownership: `packages/access-router-deco/src/factory.ts` bootstrap lifecycle/preflight; `test/bootstrap-transaction.test.ts`, lifecycle tests in `test/factory.test.ts`.

Finding: model preflight calls a getter that lazily registers default-runtime Mongoose models, but preflight is outside `try`/restore. A same-name model conflict therefore mutates the registry despite failure. Also, only successful tuples are tracked: a constructor can recursively bootstrap the same factory/module/app before the outer call marks success, publishing twice. Existing tests use pre-registered isolated model conflicts and sequential duplicate calls.

References: `packages/access-router-deco/src/factory.ts:208-225`, `:252-278`, `:463-476`; `test/bootstrap-transaction.test.ts:179-209` and `test/factory.test.ts:93-162` under the package. Specific residual guarantees from ARDECO-04 and DECO-06.

Requirements:

1. Include potentially mutating preflight in rollback or use nonmutating registry inspection.
2. Reserve an in-progress tuple before user constructors/callbacks execute, release it reliably on failure, and retain successful duplicate protection.
3. Do not conflate preventing nested package bootstrap with rolling back arbitrary user-code side effects.

Acceptance criteria:

- Default-runtime lazy model lookup followed by conflict leaves the full package-controlled snapshot unchanged.
- Reentrant constructor/callback bootstrap is rejected before nested publication; failed attempts remain retryable and independent module/app tuples still work.

Verification: V1 transaction/factory tests; V2.

### Task BDECO-05: Reject Unsupported Decorator Targets And Missing Operations

Status: completed

Completion evidence:

- Changed `src/decorators/method.decorators.ts` (`assertInstanceMethodTarget` + `assertValidOperation` via HOOK_DEFINITIONS, eager validation in all 10 op-bearing factories), `parameter.decorators.ts` (reject ctor/static before writes), `property.decorators.ts` (reject static, per-decorator names); instance-only contract JSDoc; no factory.ts edits.
- New `test/decorator-boundary.test.ts` (53 tests: static rejections, Function-metadata non-contamination, missing/undefined/empty/wrong-type/unsupported with no residue, legacy `@` syntax via transpile+eval, valid/inherited/symbol/operationless bootstrap).
- Verification: build success (DTS 33.29kB); `decorator-boundary+decorators+route-guard` 120 passed; full package vitest 316 passed; src typecheck clean; eslint clean. Before-fix probe: static guard silent, static params shared Function metadata, ctor silent, `BaseFilter()` unsuffixed write.
- Owner: sub-agent ses_f827b9ac6ffeRfKAumm23FXQee, 2026-09-07.

Kind: defect

Priority: P1, accepted declarations can silently remove authorization/filter policy.

Suggested agent: decorator validation specialist

Dependencies: none

Primary ownership: `packages/access-router-deco/src/decorators/method.decorators.ts`, `parameter.decorators.ts`, `property.decorators.ts`; dedicated negative decorator/strict-consumer tests. Avoid factory edits while BDECO-01 through 04 are active.

Finding: static hooks compile and receive metadata but instance-prototype discovery never registers them. Static parameter injection writes to `Function` via `target.constructor`, sharing metadata between unrelated classes. Constructor parameter decorators silently return. Separately, `setMethodMetadata` validates only when an operation is not undefined: JavaScript `BaseFilter()` and similar calls write unsuffixed metadata that bootstrap silently skips. RouteGuard's extra eager validation does not protect other operation-bearing hooks.

References: `packages/access-router-deco/src/decorators/method.decorators.ts:20-55`; `parameter.decorators.ts:6-14`; `packages/access-router-deco/src/factory.ts:847-855`, `:895-909`, `:936-938`; `test/route-guard.runtime.test.ts:146-175` and `test/decorators.test.ts:283-300`, `:365-443`. Residual target/argument cases after DECO-10/12 and ARDECO-01.

Requirements:

1. Explicitly reject static method/property/parameter and constructor-injection targets before metadata writes rather than introducing a new static-hook feature. Document the instance-only contract and compatibility impact.
2. Validate required operations from the hook definition even for missing/undefined arguments. Preserve operationless hooks and valid symbol instance methods.
3. Add actual legacy TypeScript decorator syntax plus JavaScript misuse cases; do not rely solely on helper-applied instance decorators.

Acceptance criteria:

- Static deny guards fail clearly instead of disappearing; two static parameter declarations cannot contaminate `Function` metadata.
- Every operation-bearing decorator rejects missing, undefined, empty, wrong-type, and unsupported values without leaving watermarks/operation metadata.
- All valid operations and operationless hooks still compile/register, including inherited/symbol instance hooks.

Verification: V1 decorator/guard tests; V2 and V3 for public target typing changes.

### Task BDECO-06: Preserve Sparse Parameter Positions

Status: completed

Completion evidence:

- Changed `packages/access-router-deco/src/factory.ts` `wrapMethod` to assign injected values at declared `meta.index` into sparse array (`apply(target, sparse)`), preserving undefined holes/defaults and instance `this`; replaced sorted `.map()` compaction.
- Changed `test/factory.test.ts` (+6 sparse-position tests) and `test/hook-adapter.contract.test.ts` (+6 real-runtime sparse tests: leading/interior/default/nonzero-Request/inherited/symbol + return propagation).
- Verification: build success (DTS 33.29kB); `hook-adapter` 44/44; `factory` 60/60; full package 328/328; typecheck clean. Before-fix: both new suites 6 failed each (value at arg 0).
- Owner: sub-agent ses_f826c5142ffe0qtuw2UgiVWdmo, 2026-09-07.

Kind: defect

Priority: P2, injected values move to the wrong arguments.

Suggested agent: hook adapter specialist

Dependencies: BDECO-04, BDECO-05

Primary ownership: `packages/access-router-deco/src/factory.ts` wrapper argument assembly; `test/hook-adapter.contract.test.ts`, parameter tests in `test/factory.test.ts`.

Finding: sorting parameter metadata followed by `.map()` compacts indices. For `guard(unused, @Permissions() permissions)`, the permissions object becomes argument zero and argument one is undefined. This contradicts README's explicit-injection contract. Current tests cover reordered but contiguous parameters.

References: `packages/access-router-deco/src/factory.ts:1059-1070`; `test/factory.test.ts:611-646`; README `:134`, `:189`. Follow-up to DECO-03/10.

Requirements:

1. Assign injected values at declared parameter indices, preserving undefined holes without changing instance `this` binding.
2. Cover leading/interior holes, default arguments, nonzero `@Request()`, and inherited/symbol hooks.

Acceptance criteria:

- Undecorated arguments remain undefined/defaulted and each decorated argument receives exactly its intended runtime value at its declared position.
- Contiguous/subset injection and callback return propagation remain unchanged.

Verification: V1 hook-adapter/factory tests; V2.

### Task BDECO-07: Correct Denial Documentation Against Effective Authorization

Status: completed

Completion evidence:

- Changed `src/decorators/method.decorators.ts` JSDoc only (DocPermissions OR-semantics, BaseFilter only-false-denies, Identifier instance-`this` cleanup; no runtime change), README + `website/docs/packages/access-router-deco.md` tables + BDECO-07 security/migration note.
- Changed `test/cross-path.integration.test.ts` (+ effective-auth block: 6 BaseFilter values via `resolveAccessFilter`, DocPermissions `{}` via real resolver with/without global grant) and new `test/documentation-examples.test.ts` (6 declaration/doc contract tests).
- Verification: build success (DTS 33.71kB, corrected guidance in `dist/index.d.ts:327-348,446-450`); `cross-path` 18/18; `documentation-examples` 6/6; full V2 332/332; eslint clean.
- Follow-up noted: `IdentifierDecoratorHook` `this: AccessRouterRequest` alias vs instance binding left for BDECO-08 scope.
- Owner: sub-agent ses_f8266458fffeOfn2gOyoSag15c, 2026-09-07.

Kind: defect

Priority: P1, shipped hover documentation recommends values that do not deny access.

Suggested agent: authorization documentation specialist

Dependencies: BDECO-05

Primary ownership: `packages/access-router-deco/src/decorators/method.decorators.ts`, README, `website/docs/packages/access-router-deco.md`; effective authorization tests in `test/cross-path.integration.test.ts`, declaration/documentation tests. Coordinate shared cross-path edits with BDECO-03.

Finding: BaseFilter JSDoc says `null`/`false` denies; runtime treats only false as denial while null adds no base restriction. DocPermissions JSDoc says an empty map denies; runtime combines global/document grants with OR, so `{}` cannot revoke a global grant. Both claims are present in shipped `dist/index.d.ts`. Current negative tests check raw callback returns, not effective denial.

References: `packages/access-router-deco/src/decorators/method.decorators.ts:86`, `:102`; `dist/index.d.ts:315`, `:326`; `test/cross-path.integration.test.ts:137-241`; `packages/access-router/src/core-shared.ts:111-113`, `:179-183`; `packages/access-router/src/core.ts:146-177`. Specific correction to completed ARDECO-07/06.

Requirements:

1. Describe actual filter and permission-combination semantics in source JSDoc, README reference tables, and website docs; do not change runtime authorization semantics to match incorrect prose.
2. Execute decorated filters through `resolveAccessFilter` and document permissions through real permission/access resolution with and without global grants.
3. Remove unfinished Identifier `this` prose at method decorators `:245`; verify compiled declarations preserve corrected guidance.

Acceptance criteria:

- Tests distinguish false, null, undefined, true, empty filters, and restrictive filters by effective access result.
- Tests prove empty document grants do not revoke global grants; docs no longer describe them as a universal deny mechanism.
- Shipped declarations and docs agree on supported result types and instance `this` binding; migration/security notes flag the previously misleading guidance.

Verification: V1 cross-path/documentation tests; V2 and inspection of regenerated declarations.

### Task BDECO-08: Repair RouterModel Consumer Composition

Status: completed

Completion evidence:

- Changed `src/interfaces.ts` to generic `RouterModel<TModel=any> = string | mongoose.Model<TModel>` and `src/decorators/class.decorators.ts` (+ union overloads `RouterModel<TModel>` preserving `ModelRouterOptions<TModel>` inference, runtime untouched).
- Changed `test/strict-consumer-types.test.ts` (cast removed; bare/generic/union positives without casts, typed permissionSchema positive + bogus-field negative), `test/packed-consumer-compatibility.test.ts` (NodeNext/Bundler typed-model + union fixtures, skipLibCheck:false), README + website composition docs.
- Verification: build success (DTS 35.44kB emits generic alias + overloads); before-fix stashed → new strict fixture 1 failed/1 passed; typecheck clean; V2 332/332; V3 compat 335/335 (mongoose 8.0/8.10/9.x, TS 5.5/5.9/6.0, ESM+CJS, NodeNext+Bundler); eslint clean.
- Owner: sub-agent ses_f825a5aafffeNS8cepUyZMXiBh, 2026-09-07.

Kind: defect

Priority: P2, the exported configuration alias cannot express ordinary typed models or be passed naturally to the decorators.

Suggested agent: TypeScript public API specialist

Dependencies: BDECO-07

Primary ownership: `packages/access-router-deco/src/interfaces.ts`, `src/decorators/class.decorators.ts`; `test/strict-consumer-types.test.ts`, packed-consumer fixtures and public documentation.

Finding: `RouterModel = string | mongoose.Model<unknown>` rejects ordinary `Model<{name: string}>` under installed Mongoose declarations. The string/model/object overloads of Router and RouterOptions also reject an unnarrowed RouterModel union. The existing positive fixture casts the model to `Model<unknown>`, masking the alias problem.

References: `packages/access-router-deco/src/interfaces.ts:46`; `src/decorators/class.decorators.ts:94-98`, `:147-150`; `test/strict-consumer-types.test.ts:85-86`; emitted `dist/index.d.ts:48`. Residual consumer case after DECO-07/12.

Requirements:

1. Make model configuration composable through the exported alias and decorator overloads while retaining model-specific option inference. Prefer a narrow generic/overload correction over broad public `any` expansion.
2. Add positive strict fixtures using typed models without casts and string-or-model variables; preserve invalid option-key/result negative fixtures.

Acceptance criteria:

- Typed Mongoose models and union-valued configuration compile through root public imports in NodeNext and Bundler fixtures.
- Both supported Mongoose lines retain expected inference, with `skipLibCheck: false`; no source/deep imports or coercive casts hide failures.

Verification: V2 and V3; inspect emitted public declarations.

### Task BDECO-09: Define Scoped Property Enforcement And Inherited Remapping

Status: completed

Completion evidence:

- Investigation only, no src semantics changed. Evidence: `test/inheritance-symbol.test.ts` +10 (E1-E10: wrong-role Global/Model/DefaultModel misplacement, inferred-key typo verbatim, string listHardLimit passthrough proving no value validation, same-property/different-key dup bug E6, same-key/different-property child-wins E7, symbols/3-level E8, same-prototype E9, no scope discriminator E10) + `test/strict-consumer-types.test.ts` bypass fixtures (inferred keys, value types, role placement compile under strict+skipLibCheck:false).
- Report: `docs/tasks/20260907-134500-bdeco-09-property-scope-evidence.md` with decision record and follow-up BDECO-09-F01 (scope validation, legacy typo/value policy, propertyKey-aware dedupe, docs/migration/release; blocked on named maintainer approval for BDECO-12 to assign).
- Verification: build success (DTS 35.44kB); `inheritance-symbol` 24/24; `strict-consumer` 2/2; V2 342/342.
- Owner: sub-agent ses_f823591dbffe36lAbAyXJ1AMmz, 2026-09-07.

Kind: investigation

Priority: P2, documented scope and replacement guarantees exceed current behavior; enforcement choices affect shipped consumers.

Suggested agent: metadata/API contract specialist

Dependencies: BDECO-06, BDECO-08

Primary ownership: `packages/access-router-deco/src/decorators/property.decorators.ts`, `src/metadata.ts`, factory property registration; `test/strict-consumer-types.test.ts`, `test/inheritance-symbol.test.ts`.

Finding: scoped decorators store no scope, so `GlobalOption('requestPermissionField')` on a default provider writes into default model options. Omitted keys and property value types are unchecked (`operationAcess` typo; string `listHardLimit`). Inherited property merging deduplicates only by option key, although same-prototype decoration replaces by property OR option key: remapping a child property from `operationAccess.read` to `.update` leaves both mappings reading the child's value.

References: `packages/access-router-deco/src/decorators/property.decorators.ts:9-19`, `:37-68`; `src/metadata.ts:50-68`; `src/factory.ts:565-575`; `test/strict-consumer-types.test.ts:68-73`, `:109-116`; `test/inheritance-symbol.test.ts:447-481`. Residual scope/inheritance questions after DECO-09/12 and ARDECO-05/07.

Requirements:

1. Bound investigation to these property APIs: demonstrate wrong-role, inferred-key, wrong-value, and same-property/different-key inheritance cases using strict fixtures and real stored options.
2. Recommend explicit runtime scope validation versus accurately documented key-name conveniences, and assess feasible legacy property-decorator key/value checking. Identify maintainer approval needed before breaking accepted declarations.
3. Specify child remapping semantics, including same key/different property, symbols, and three-level inheritance. Prefer consistency with same-prototype replacement unless a concrete shipped contract requires otherwise.
4. Record the decision and create a uniquely identified implementation follow-up with scope, regression criteria, verification, and release implications; do not silently implement guessed semantics.

Acceptance criteria:

- A bounded evidence report names each enforceable guarantee, remaining type-system limitation, chosen/recommended contract, and approving maintainer if blocked.
- Implementation work is either explicitly scoped as a follow-up or deferred with residual configuration risk. No claim that scoped decorators currently validate values survives without evidence.

Verification: focused strict/runtime experiments after V1 build; evidence review. Run V2 if any test/documentation changes are retained.

### Task BDECO-10: Reconcile Module Mount Paths With OpenAPI Paths

Status: completed

Completion evidence:

- Investigation only, no live route matching changed. Evidence table (fresh build + supertest/OpenAPI probes): reachable=`moduleBase+basePath`, OpenAPI=`parentPath+basePath` (model) or basename (root); agreement iff both `/`; P1-P7 mismatch rows incl. two-module identical specs and proxy missing servers[].
- Changed `test/cross-path.integration.test.ts` (+7 P1-P7 current-behavior evidence tests) and new `docs/tasks/20260907-145022-bdeco-10-path-composition-evidence.md` (report + BDECO-10-F01: OpenAPI-side mount-prefix fix, parentPath/servers proxy docs, double-prefix migration, P1-P7 acceptance; blocked on maintainer approval for BDECO-12).
- Verification: build success (DTS 35.44kB); `cross-path` 25/25; V2 349/349.
- Owner: sub-agent ses_f822c12c5ffeNax6fdjBwaDpBp, 2026-09-07.

Kind: investigation

Priority: P2, generated route descriptions omit a known module prefix, but external parent-path composition needs an explicit contract.

Suggested agent: routing/OpenAPI integration specialist

Dependencies: BDECO-09

Primary ownership: `packages/access-router-deco/src/factory.ts` route construction; `test/cross-path.integration.test.ts`; inspect `packages/access-router/src/routers/model-router.ts` and root-router path generation without broad runtime edits.

Finding: module `/api` with model `/users` serves `/api/users/new` while registering OpenAPI `/users/new`. Factory applies the prefix only at Express mounting; runtime documents `parentPath + basePath`. Cross-path tests exercise prefixed requests without comparing them to OpenAPI. An explicit external parent path may have separate deployment meaning, so blindly adding the prefix risks double composition.

References: `packages/access-router-deco/src/factory.ts:213`, `:251`, `:524-527`; `packages/access-router/src/routers/model-router.ts:46-52`; `packages/access-router-deco/test/cross-path.integration.test.ts:538-630`. New path-consistency case adjacent to DECO-05/ARDECO-06.

Requirements:

1. Establish expected module/base/parent path composition for model and root routers, including external reverse-proxy prefixes and two differently mounted modules.
2. Reproduce the mismatch with fresh builds, compare generated path/server URLs to reachable routes, and recommend a package-local integration fix or an explicit required configuration contract.
3. Record the maintainer decision and a scoped follow-up if implementation requires public behavior changes. Do not fix documentation paths by unintentionally changing live route matching.

Acceptance criteria:

- Root/model, empty/nonempty module prefixes, and explicit parent prefixes have an evidence-backed composition table.
- The report specifies how to eliminate missing/doubled prefixes, with observable request/OpenAPI acceptance tests for any follow-up.

Verification: V1 cross-path experiments and evidence review; V2 if code/tests are retained.

### Task BDECO-11: Make Performance And Integration Assertions Honest

Status: completed

Completion evidence:

- Changed `test/cross-path.integration.test.ts` shared-runtime assertion (no swallowed `.catch`, runtime-derived basePath, 401 deny + 404 separation), `test/registration-plan.instrumentation.test.ts` (narrowed to measured O(methods×depth), independent depth dimension, deterministic counters, no wall-clock thresholds, chain-length preservation), `test/inheritance-symbol.test.ts` (removed dead scaffolding → pointer to BDECO-09 E1-E10), `src/metadata.ts` comment (validate scalar policy).
- Verification: build success (DTS 35.44kB); instrumentation 2 passed; inheritance 24 passed; cross-path 25 passed; typecheck clean. Negative: broke expectation to `.expect(200)` → 1 failed, restored → 25 passed.
- Owner: sub-agent ses_f82236fdaffeGYha0iU3tsCWPg, 2026-09-07.

Kind: improvement

Priority: P3, improve testability/readability without claiming unmeasured request performance gains.

Suggested agent: independent test-quality specialist

Dependencies: none

Primary ownership: `packages/access-router-deco/test/registration-plan.instrumentation.test.ts`, `test/inheritance-symbol.test.ts`, shared-runtime assertion in `test/cross-path.integration.test.ts`; narrowly related metadata comments. Coordinate cross-path/inheritance edits with their active owners.

Finding: instrumentation calls its bound linear in methods plus depth, but bounds their product and varies method count at fixed depth. Startup-only metadata traversal uses repeated `unshift`; no measured performance defect is established. Shared-runtime request assertions swallow rejection with `.catch(() => {})`, and an inheritance test constructs unused runtime scaffolding without executing it.

References: `packages/access-router-deco/test/registration-plan.instrumentation.test.ts:31-40`, `:112`, `:121-172`; `test/cross-path.integration.test.ts:727-730`; `test/inheritance-symbol.test.ts:483-501`; `src/metadata.ts:55-59`, `:86-100`. Evidence/readability follow-up to ARDECO-06/09, not a new generic optimization project.

Requirements:

1. Remove swallowed assertions and execute or remove misleading dead scaffolding; ensure the shared-runtime test actually fails for an unexpected route/authorization result.
2. Narrow the complexity claim to what is measured or vary depth independently with deterministic work counters. Do not add wall-clock CI thresholds.
3. Correct stale comments describing validators as chains. Optimize only if a bounded startup measurement demonstrates a worthwhile benefit and behavior-preservation tests accompany it.

Acceptance criteria:

- Deliberately breaking the shared-runtime request expectation fails its test.
- Instrumentation tests state the measured bound precisely, including inheritance-depth behavior, and preserve registration semantics.
- No unexecuted setup implies coverage that does not exist; any performance claim includes baseline/comparison evidence.

Verification: V1 affected tests; V2 after merging coordinated edits.

### Task BDECO-12: Perform Independent Boundary Integration Review

Status: completed

Completion evidence:

- Independent review by sub-agent ses_f821c6e7affevq15675mqY9QqA (did not implement BDECO-01..11): per-task verdicts BDECO-01..08 PASS, BDECO-09/10 investigation COMPLETE with blocked follow-ups BDECO-09-F01/BDECO-10-F01 (residual risks explicitly unresolved), BDECO-11 PASS; full evidence block below under "Completion evidence (BDECO-12 independent review...)".
- Coordinator follow-through 2026-09-07: fixed returned `prefer-const` regression at `src/factory.ts:362,368` (`let` → `const`, removed pre-assignment declarations); re-verified serially: `pnpm --filter @web-ts-toolkit/access-router-deco... build` success (DTS 35.44kB); V2 `test` 14 files/350 passed; V3 `test:compat` 14 files/353 passed; V4 `pnpm build` PASS, `pnpm lint` 0 errors (3 pre-existing warnings in access-router-client benchmark test only). Full-repo `pnpm test` remains unrun on uncapped runner (prior V4 attempt SIGTERM-killed at 600s tool timeout inside access-router-runtime, no failing assertion); package-level V2/V3 cover the changed package.
- Decision owners still TBD for BDECO-09-F01/BDECO-10-F01 (coordinator to name maintainer); historical Deferred Decisions preserved; BDECO-05 migration note closed by review (README + website).
- Owner: sub-agent ses_f821c6e7affevq15675mqY9QqA + coordinator lint fix, 2026-09-07.

Kind: improvement

Priority: P2, independently verify fixes and reconcile investigation outcomes before release.

Suggested agent: reviewer who did not implement the primary fixes

Dependencies: BDECO-01, BDECO-02, BDECO-03, BDECO-04, BDECO-05, BDECO-06, BDECO-07, BDECO-08, BDECO-09, BDECO-10, BDECO-11

Primary ownership: this task file, focused verification evidence, migration notes; implementation corrections return to the responsible owner or a newly scoped follow-up.

Finding: prior completed plans left boundary variants undetected because setter-call/raw-return assertions, source-only typing, and swallowed request failures did not prove effective behavior. This phase needs an independent check of outcomes rather than another implementation summary.

References: each task's concrete references; both related completed plans' DECO-99/ARDECO-99 integration tasks.

Requirements:

1. Check each acceptance criterion against tests/runtime/consumer evidence, especially provider permutations, root validation fallback, sparse injection, unsupported targets, same-app runtime isolation, lazy default-runtime conflicts, and reentrancy.
2. Verify actual denial/filter decisions, safe initialization errors, public types and shipped docs, returned router ownership, and migration notes for changed contracts.
3. Review BDECO-09/10 conclusions and track implementation decisions/blockers explicitly. Do not require speculative fixes to complete an investigation, but do not declare the underlying risk resolved without implementation evidence.
4. Run V2, V3, and V4 serially. Reconcile all deferred work and remove no historical findings; append resolution evidence.

Acceptance criteria:

- Every implemented fix has reproducible regression evidence and required verification results, or remains blocked with an exact prerequisite.
- Investigation outcomes and any new tasks are linked; security-relevant deferrals have a named decision owner and residual risk.
- Packed ESM/CJS and strict consumer checks reflect rebuilt source, and the final report distinguishes passing checks, unrelated failures, and unrun checks.

Verification: V2, V3, V4 and independent evidence review.

Completion evidence (BDECO-12 independent review, 2026-09-07, reviewer did not implement BDECO-01..11):

- Per-task verdicts (acceptance checked against rebuilt source, tests, and shipped artifacts; worktree at review time contained only this phase's uncommitted changes plus the three new task docs):
  - BDECO-01 PASS: exact-slot helpers `getExactNestedValue`/`getValidateExactConflict`/`assertArrayRootShorthandFree` present (`src/factory.ts:139-164`); `hook-adapter.contract.test.ts` root-shorthand + sibling/default-order blocks (`:277`,`:343`,`:365`,`:432`) and `bootstrap-transaction.test.ts:203` root-false rollback; README root-shorthand contract paragraph present; before-fix failure recorded (20 failed/18 passed stashed).
  - BDECO-02 PASS: defaults-first `providerOrder` (`src/factory.ts:351-354`) preserving relative order and plan pairing; permutation test asserting identical deny result and identical route params/paths in both orders (`bootstrap-routes.integration.test.ts:278-363`); router-override and uniqueness behavior retained; before-fix failure recorded (model-first yielded stale path + permitted).
  - BDECO-03 PASS (with trivial regression returned to owner, see blockers): module init composed on unmounted `express.Router()` and single-mounted (`src/factory.ts:362-376`); grep confirms no global `app.use(runtimeMiddleware)` remains; scoped-init tests (`bootstrap-routes` +6, `bootstrap-transaction` ownership assertions) and README scope paragraph present; before-fix recorded (`GET /outside` calls 1→0).
  - BDECO-04 PASS: `bootstrapInProgress` WeakMap reservation before user constructors (`src/factory.ts:279,401-419`), `try` covering metadata→constructors→preflights→mount with snapshot+stack restore and `finally` release; lazy-conflict snapshot-unchanged and reentrant-rejected/retryable tests present; before-fix failures recorded (2 transaction failures + factory reentrancy).
  - BDECO-05 PASS: `assertInstanceMethodTarget`/`assertValidOperation` eager in all operation-bearing factories (`src/decorators/method.decorators.ts:65-91`), parameter/property static+ctor rejections, instance-only JSDoc (`:42-64`); `test/decorator-boundary.test.ts` covers static/Function-contamination/ctor/missing-op/legacy-syntax cases (table-driven `it.each`, V2 green). Doc gap closed by this review: BDECO-05 migration note added to README + website hook-decorator sections (static/ctor/missing-op now throw; move hooks to instance methods).
  - BDECO-06 PASS: sparse indexed injection preserving holes/defaults/`this` (`src/factory.ts:1216-1228`); leading/interior/default/nonzero-`@Request()`/inherited/symbol coverage in `factory.test.ts` (+6) and `hook-adapter.contract.test.ts` (+6); before-fix recorded (6+6 failed on old compaction).
  - BDECO-07 PASS: JSDoc/README/website corrected to effective semantics (only `false` denies; `{}` never revokes global OR-grant); `cross-path.integration.test.ts:402` effective-auth block and `documentation-examples.test.ts:213` doc-contract tests; regenerated `dist/index.d.ts:364,387,466` carries the corrected guidance; BDECO-07 migration note present in README + website. Residual `Identifier` `this`-alias prose resolved: shipped declarations state instance binding.
  - BDECO-08 PASS: generic `RouterModel<TModel=any>` (`src/interfaces.ts:65`) + union overloads (`src/decorators/class.decorators.ts:103,162`); strict fixtures use typed models without casts and string-or-model unions with `skipLibCheck:false`; `dist/index.d.ts:56-67,570-599` emits the generic alias + overloads; V2+V3 green on rebuilt source.
  - BDECO-09 investigation COMPLETE per its acceptance (evidence-backed decision, no speculative implementation): `docs/tasks/20260907-134500-bdeco-09-property-scope-evidence.md` with E1-E10 retained tests + strict bypass fixtures; follow-up BDECO-09-F01 scoped (scope discriminator, typo/value policy, propertyKey-aware dedupe, docs/migration/release) and BLOCKED on named maintainer approval (owner TBD — coordinator to name). Underlying risk NOT resolved: silent cross-role misroute (E1-E3), typo/wrong-type passthrough (E4-E5), stale remap duplicate (E6) all still present by design of this phase.
  - BDECO-10 investigation COMPLETE per its acceptance: `docs/tasks/20260907-145022-bdeco-10-path-composition-evidence.md` with P1-P7 retained tests and composition table (reachable = moduleBase+routerBase; OpenAPI = parentPath+basePath; agreement iff both prefixes `/`/`''`); follow-up BDECO-10-F01 scoped (OpenAPI-side mount prefix, parentPath/servers proxy docs, double-prefix migration) and BLOCKED on named maintainer approval (owner TBD — coordinator to name). Underlying risk NOT resolved: non-`/` mounts serve routes whose OpenAPI entries omit the mount; `parentPath` decorates OpenAPI only.
  - BDECO-11 PASS: swallowed `.catch` removed with 401/404 separation, instrumentation narrowed to measured bound with deterministic counters and no wall-clock thresholds, dead scaffolding removed, stale validator-chain comment corrected; negative check performed (broke expectation → 1 failed, restored → green).
- V2 PASS: `pnpm --filter @web-ts-toolkit/access-router-deco test` — transitive rebuilds + strict typecheck + 14 files / 350 tests passed (superset of the 342/349 cited in earlier per-task evidence; suite grew as BDECO-09/10/11 tests landed). Packed ESM/CJS + strict consumer checks ran against rebuilt source (CJS 65.79 KB / ESM 63.07 KB / DTS 35.44 KB).
- V3 PASS: `pnpm --filter @web-ts-toolkit/access-router-deco test:compat` — 14 files / 353 tests passed on the same rebuilt artifact (NodeNext + Bundler, ESM + CJS, pinned peer/compiler coverage). Residual peer-range note: README matrix documents tested minima (express 5.1.0, mongoose 8.10.0/9.8.x, reflect both lines, TS 5.5/5.9/6.0) while `package.json` peers advertise `>=5.0.0`/`>=8.0.0`; untested peer versions are not established compatible. Range/coverage alignment stays with ARDECO-08; no duplicate packaging task created.
- V4 MIXED: `pnpm build` PASS (all workspace packages + apps, only pre-existing Vite chunk-size/deprecation warnings). `pnpm lint` FAIL — 2 errors are new BDECO regressions returned to the factory owner: `src/factory.ts:362,368` `prefer-const` (`let expressRouter`/`let runtimeMiddleware` never reassigned after BDECO-03/04 rework; trivial const fix, no behavior impact). 3 warnings are unrelated pre-existing: `access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts` unused eslint-disable directives. `pnpm test` (full repo, serial) BLOCKED: exceeds the 600s tool timeout; run was SIGTERM-killed inside `@web-ts-toolkit/access-router-runtime` (timeout artifact, not a code failure — no failing assertion observed). Prerequisite: a runner without the 600s cap, or serial per-package runs; package-level V2/V3 above are unaffected.
- Deferred decisions reconciliation (none removed; all stand): (1) same-prefix forged Reflect metadata on otherwise-valid keys still passes the allowlist — remains a trusted-in-process-boundary deferral, and BDECO-05 must not be read as provenance validation; (2) repeated same-role class-decorator overwrite policy still undocumented — pending maintainer evidence of composition usage; (3) metadata-helper accessor/primitive hardening still deferred — production scanner filters them; (4) compat-table vs peer-range minima reconciled as tested-minima documentation (see V3 note), range alignment stays with ARDECO-08.
- New/returned follow-ups: (a) factory owner: `prefer-const` fix at `src/factory.ts:362,368` + focused lint (trivial, no refactor); (b) coordinator: name decision owners for BDECO-09-F01 and BDECO-10-F01 (both blocked, residual risks above; security-relevant deferral: BDECO-09 scope misroute — owner TBD, residual risk silent wrong-store writes E1-E3); (c) coordinator: complete full-repo `pnpm test` on an uncapped runner and record per-package results, separating the access-router-runtime-or-later packages (unrun here) from the verified deco package; (d) closed by this review: BDECO-05 migration note (README + website).
- Overall: every implemented fix (BDECO-01..08, 11) has reproducible regression evidence and V2/V3 verification; both investigations (BDECO-09/10) are evidence-complete with blocked, uniquely identified follow-ups and explicitly unresolved residual risk; no speculative fixes were made and no historical findings were removed.

## Deferred Decisions

- Valid-sibling Reflect metadata injection remains possible: a marked `RouteGuard('list')` method plus manually written `routeGuard.read = true` passes the allowlist (`src/decorators/method.decorators.ts:53-55`, `src/factory.ts:847-855`). ARDECO-02's operation validation does not establish provenance. Defer structured private registration metadata pending a maintainer decision on cross-installed-copy interoperability and the trusted in-process configuration boundary; do not call this a remotely exploitable vulnerability or repeat the completed unknown-operation filtering task. BDECO-12 must narrow any overstated guarantee.
- Repeated same-role class decorators overwrite identity/options (`src/decorators/class.decorators.ts:35-62`, `:100-113`). Rejection versus deliberate last-write-wins is undocumented; defer a new feature/contract change pending maintainer evidence of decorator-composition usage. Existing different-role/duplicate-provider validation does not settle this question.
- Metadata helpers may throw on accessors/primitive descriptors (`src/metadata.ts:71-78`), but the current production scanner filters them. Defer isolated helper hardening until a real caller needs it; do not expand public API for this internal case.
- README's compatibility table labels Express 5.1 and Mongoose 8.10 as minima while peers advertise >=5.0 and >=8.0 (`README.md:195-206`, `package.json:43-47`). Existing ARDECO-08 already owns range/coverage alignment. V3/BDECO-12 should reconcile this residual claim rather than invent a duplicate packaging project; earlier/later untested peer versions are not established compatible by this review.
- No generic caching, request-path performance rewrite, extra AI discovery files, or factory decomposition is proposed. Fix registration semantics at their shared boundary first; startup work needs measurement before optimization.

## Definition Of Done

This document is a living execution record. The review deliverable is complete when the plan is saved and checked; all implementation tasks remain pending until executed. The remediation phase is complete only when required acceptance/verification evidence is recorded, approved follow-ups are tracked, public contract changes are documented, and BDECO-12 independently reports unresolved risks. Preserve historical plans and unrelated worktree changes.
