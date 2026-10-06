# Access Router Deco: policy preservation and application usability

Created: 2026-09-20 21:56:29 local

Overall status: completed — five implementation tasks and one independent review, each executed sequentially in its own fresh sub-agent session. Required package checks pass; repository-wide diagnostic failures are recorded below.

## Objective and business requirements

`@web-ts-toolkit/access-router-deco` translates legacy TypeScript decorated classes into Access Router authorization, validation, lifecycle hooks, model configuration, and Express mounts. Its users build CRUD/batch APIs over Mongoose, often with tenant-owned runtimes. Essential requirements are that declared policies cannot silently disappear, reusable/instrumented classes preserve their behavior, startup errors do not publish partially configured routes, and installed consumers can construct a working API from the shipped documentation.

This review covers residual defects after the earlier reviews, plus an executable application quickstart. Implementation is authorized by the user. Do not modify the root `CHANGELOG.md`, generated dist files, or unrelated existing changes. Public behavior changes receive migration notes in the package README and matching website documentation.

## Coverage, evidence, and triage

- Inspected all package source entrypoints, factory registration/bootstrap, decorator/metadata boundaries, public interfaces, metadata/build configuration, README, relevant transaction/decorator/inheritance/documentation tests, and prior task records.
- A separate read-only review agent (`ses_f1eca659cffewajiuJB8bZztpd`) confirmed wrapper and callable-accessor hook loss using strict in-memory TypeScript compilation and public bootstrap probes. These used existing dependency artifacts; no baseline build/full suite has yet been run.
- Existing plans deduplicated: `20260813-162608-access-router-deco-review-remediation.md`, `20260827-223556-access-router-deco-health-follow-up.md`, and `20260907-121236-access-router-deco-boundary-review.md` under this directory. Their completed hook argument, ordering, runtime isolation, route scoping, and packaging fixes are not new tasks here.
- Confirmed: method metadata lives only on replaceable functions; callable accessors return early; factory discovery filters to allowed hooks and skips root classes, so wrong-role hooks disappear; snapshot creation/restoration exceptions are swallowed despite the documented transaction guarantee.
- Quickstart finding: README uses an unverified `x-role` header as an administrator grant, queries a `slug` absent from its schema, omits JSON parsing, and does not show an explicit usable operation/field authorization policy. Existing tests compile it but only execute a separately reconstructed validator example.
- Architecture/performance: retain the centralized hook definitions, bootstrap-local registration plan, instance/request separation, isolated runtimes, and measured traversal instrumentation. No request-path cache or speculative speedup is proposed. Preserve instrumentation checks when adding role/metadata validation.
- Limitations: not an audit of persistence internals, authentication providers, arbitrary hostile in-process Reflect writes, or every peer version. Numerous unrelated edits existed at entry, including Access Router itself; preserve them and distinguish integration failures from package regressions.

### Existing deferred decisions (not duplicated)

- BDECO-09-F01 (scoped property validation/remapping) and BDECO-10-F01 (OpenAPI module mount-prefix composition) remain in their original evidence reports, awaiting the existing maintainer decisions. Residual risks: wrong-scope property writes and externally inaccurate OpenAPI paths. This plan does not claim they are fixed.
- Same-role class redecorations and forged valid Reflect metadata provenance remain trusted-configuration design decisions from BDECO-12. Broad dependency injection, authentication, rate limiting, and audit storage belong to the application/runtime layers; this adapter should demonstrate composition rather than implement competing systems.

## Execution and verification

P1 = policy loss or broken startup integrity; P2 = application usability. Execute PDEC-01 through PDEC-06 **sequentially**, each in a fresh isolated sub-agent session. Shared factory/metadata/docs files make parallel implementation inappropriate. Each agent reads this file and AGENTS.md, updates only its task status/evidence, and uses `apply_patch`. No commits. Constructors remain outside rollback; do not broaden the transaction guarantee to arbitrary application effects.

Working directory for commands: `<repo-root>` unless specified. Prerequisites: installed workspace dependencies, Node >=22, pnpm, local package build outputs. Tests rebuilding transitive dependencies must remain serialized.

- V1 targeted: `pnpm --filter @web-ts-toolkit/access-router-deco... build`, then `pnpm --filter @web-ts-toolkit/access-router-deco typecheck`, then `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts <test-paths>` (test paths relative to the package).
- V2 required final package check: `pnpm --filter @web-ts-toolkit/access-router-deco test`. Includes strict declarations, documentation compilation, packed ESM/CJS consumer sentinel, and traversal instrumentation.
- V3 required changed-scope check: `pnpm exec eslint "packages/access-router-deco/**/*.{ts,js,mts}"` and `git diff --check -- packages/access-router-deco website/docs/packages/access-router-deco.md docs/tasks/20260926-215629-access-router-deco-policy-preservation.md`.
- V4 repository integration diagnostics: `pnpm build`, `pnpm lint`, `pnpm test`, serially. Capture failures and limits honestly, with package/file evidence. Unrelated failures in this already-dirty workspace do not require editing other packages or claiming repository-wide green. Any attributable regression blocks completion. Do not run conflicting rebuilds or an unrequested full peer-version matrix.

Definition of done: each requirement below has observable evidence, all package checks pass, changed API docs agree with implementation, every task is completed with Completion evidence, and the independent reviewer plus coordinator audits the final record. Required checks blocked by environment keep the affected task blocked; historical or partial runs are not substitutes.

### Task PDEC-01: Preserve hooks across method-wrapper composition

Status: completed

Kind: defect

Priority: P1 — instrumentation can silently remove a deny guard or validator.

Suggested agent: decorator metadata and composition implementer (fresh session)

Dependencies: none

Primary ownership: `packages/access-router-deco/src/decorators/method.decorators.ts`, `src/metadata.ts`, `src/constants.ts`, registration readers in `src/factory.ts`, focused composition tests, package README and matching website notes.

Finding: `setMethodMetadata` stores hook registration only on `descriptor.value`; a later wrapping decorator replaces that function. `compileRegistrationPlan` sees no watermark and preserves an existing allow option. Strict legacy syntax compiles in both decorator orders, but one loses the policy.

References: `src/decorators/method.decorators.ts:setMethodMetadata`; `src/metadata.ts:getMethodMetadata`; `src/factory.ts:compileRegistrationPlan`; `test/inheritance-symbol.test.ts`.

Requirements:

1. Anchor hook declaration registration to its declaring member so conventional wrappers (mutating or returning a replacement descriptor) retain hook behavior in either decorator order.
2. Invoke the effective wrapped method with existing parameter injection and instance `this`; retain inherited override suppression, symbols, duplicate checks, and operation isolation.
3. Keep metadata namespaced and readers centralized; do not introduce global caches or broaden public exports. Preserve bounded traversal behavior.
4. Document composition support and its boundary; arbitrary wrappers remain responsible for the method behavior they return.

Acceptance criteria:

- Both wrapper styles/orders retain a deny guard over a configured allow; an actual Express request is denied before persistence access.
- A validator or filter representative, symbol method, inherited method/override, sparse parameters, and instance state retain their intended behavior.
- Existing inheritance, duplicate, operation, and instrumentation tests pass. Registration tests fail on the old behavior where feasible.

Verification: V1 with new composition tests plus inheritance, decorator, factory, hook-adapter, and instrumentation tests; V2 at final integration.

Completion evidence:

- Changed (8 files including this record): `packages/access-router-deco/src/constants.ts`, `src/decorators/method.decorators.ts`, `src/metadata.ts`, `src/factory.ts`, `test/method-composition.test.ts`, package `README.md`, `website/docs/packages/access-router-deco.md`, and this task file. Source/test paths after the first are relative to `packages/access-router-deco/`.
- Registration now anchors declarations to the declaring member under a namespaced symbol. Centralized readers merge own-member declarations with legacy function metadata, deduplicate operation keys, and reuse owner/descriptor resolution. Effective wrapped invocation, function-only compatibility, override suppression, symbols, parameter injection, and instance binding remain covered; no public exports or global caches added.
- Red evidence before implementation: `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/method-composition.test.ts` — the corrected initial 13-case suite had **8 failures / 5 passes** on the old implementation (both outer-wrapper styles lost deny guards and returned HTTP 500 instead of 401; inherited symbol validators, wrapped child registration, duplicates/mixed families, and wrapper-separated operations also failed). An initial test assumption that validators were arrays was corrected to the existing callable-validator contract before recording this baseline. Two additional effective-wrapper/legacy-compatibility cases bring the final composition suite to 15.
- V1 passed sequentially on the final implementation:
  1. `pnpm --filter @web-ts-toolkit/access-router-deco... build` — all **6 selected workspace packages** built successfully, including ESM/CJS and declarations.
  2. `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — passed.
  3. `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/method-composition.test.ts test/inheritance-symbol.test.ts test/decorators.test.ts test/decorator-boundary.test.ts test/metadata.test.ts test/factory.test.ts test/hook-adapter.contract.test.ts test/route-guard.runtime.test.ts test/registration-plan.instrumentation.test.ts` — **9 files / 301 tests passed** (15 new composition cases plus 286 existing tests).
- Regressions verified: all four wrapper style/order combinations deny actual Express read requests with **zero persistence calls** despite configured allow; inherited symbol validators preserve sparse injected values and instance state; decorated/undecorated overrides suppress base hooks/parameters; duplicate and mixed-family validation survives wrappers; operations remain isolated; effective async wrapper results/errors and legacy function-only declarations are retained.
- Instrumentation caught an intermediate extra descriptor read (**210 > 200** shallow-hierarchy bound). Shared owner/descriptor resolution removed it; both existing instrumentation tests pass with their assertions and thresholds unchanged. No unresolved attributable regression or blocker. Vitest emitted its existing Vite config-loader warning; execution passed.
- V2/V3/V4 remain for PDEC-06; no root repository checks run. Root `CHANGELOG.md`, generated tracked files, and unrelated existing work were not edited. Later task statuses remain pending.

### Task PDEC-02: Reject accessor and non-method hook declarations

Status: completed

Kind: defect

Priority: P1 — supported-looking syntax silently loses policy.

Suggested agent: decorator target-validation implementer (fresh session)

Dependencies: PDEC-01

Primary ownership: shared method-decorator validation, `test/decorator-boundary.test.ts`, strict consumer fixtures, README/website migration note.

Finding: `HookDecorator` admits a getter returning a function; `setMethodMetadata` returns when `descriptor.value` is undefined, and scanner excludes accessors. `@RouteGuard('read') get guard() { return () => false; }` compiles strictly and silently leaves an existing allow policy.

References: `src/decorators/method.decorators.ts:HookDecorator`, `assertInstanceMethodTarget`, `setMethodMetadata`; `src/metadata.ts:getAllMethodNames`; `test/metadata.test.ts` accessor exclusion.

Requirements:

1. Reject accessor, missing descriptor, and non-callable descriptor targets at the shared decorator boundary without evaluating getters or writing hook metadata.
2. Provide decorator/member diagnostic and direct users to instance methods; retain valid ordinary, inherited, symbol, and wrapped methods.
3. Explain runtime rejection even where legacy TypeScript descriptor typing cannot distinguish callable accessors. Tighten typing only if ordinary consumer decorator syntax remains sound.

Acceptance criteria:

- Callable getters, setter-only descriptors, and JavaScript non-method calls throw before registration, without getter side effects or partial hook metadata.
- Strict-compiling getter fixture is exercised or compile-time rejected with meaningful diagnostics; runtime tests cover bypassed types.
- Shared operation-bearing and operationless families are covered; supported composition remains green.

Verification: V1 decorator-boundary, composition, decorators, metadata, and strict-consumer tests.

Completion evidence:

- Changed (6 files including this record): `packages/access-router-deco/src/decorators/method.decorators.ts`, `packages/access-router-deco/test/decorator-boundary.test.ts`, `packages/access-router-deco/test/strict-consumer-types.test.ts`, `packages/access-router-deco/README.md`, `website/docs/packages/access-router-deco.md`, and this task file.
- Shared target validation inspects the supplied descriptor's own callable data value before any hook metadata writes. It rejects accessor/missing/non-callable/mixed descriptors, including a getter on the descriptor's `value`, without reading the target member or evaluating getters. Diagnostics identify the decorator and member (including symbols) and direct callers to instance methods. PDEC-01 member anchors and effective wrapped methods are preserved.
- Red evidence: the initial focused boundary run produced **15 regression failures / 53 existing passes** on PDEC-01 behavior: all 14 hook families silently accepted callable accessors, and a malformed mixed descriptor added a declaration instead of rejecting it. The initial consumer spy had an overloaded-function typing error; after correcting that test instrumentation, `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t 'strict-compiling callable getters'` compiled strictly and failed at runtime with **Missing expected exception**, confirming the installed declaration/runtime policy-loss gap.
- V1 passed sequentially on the final implementation:
  1. `pnpm --filter @web-ts-toolkit/access-router-deco... build` — all **6 selected workspace packages** built, including ESM/CJS and declarations.
  2. `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — passed.
  3. `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/decorator-boundary.test.ts test/method-composition.test.ts test/decorators.test.ts test/metadata.test.ts test/strict-consumer-types.test.ts` — **5 files / 181 tests passed**.
- Regression coverage: **17 invalid descriptor shapes across all 14 hook families** (operation-bearing and operationless), with zero metadata writes, getter/setter/function calls, or partial member/function metadata; rejected redeclaration preserves existing metadata. The staged public-package fixture strictly compiles and executes actual legacy callable-getter syntax for `RouteGuard` and `GlobalPermissions`, asserting diagnostic throws and zero getter calls/metadata writes. All **15 PDEC-01 composition tests** remain green, including both wrapper styles/orders denying HTTP requests before persistence, inheritance/symbols, sparse injection, and override suppression.
- Public descriptor typing remains compatible with ordinary legacy decorator syntax; README and website explain runtime rejection and migration to methods. The instance-method/accessor warning is present in emitted `dist/index.d.ts`.
- No blockers or unresolved attributable regressions. Vitest emitted the existing Vite config-loader warning; checks passed. V2/V3/V4 remain assigned to PDEC-06. Root `CHANGELOG.md`, unrelated work, prior-agent changes, and later task statuses were preserved; no generated tracked files were edited.

### Task PDEC-03: Fail fast for hooks on unsupported class roles

Status: completed

Kind: defect

Priority: P1 — declaring a hook on the wrong provider silently drops application policy.

Suggested agent: registration-role validation implementer (fresh session)

Dependencies: PDEC-01, PDEC-02

Primary ownership: `src/factory.ts:validateModuleConfiguration` and `compileRegistrationPlan`, centralized hook role definitions, focused role tests, README/website migration notes.

Finding: registration compilation scans only the passed allowed hook subset and ignores other known hooks. Root routers are never compiled. For example a `@RouteGuard` on a module/root router or `@BaseFilter` on default options is silently ignored despite published role restrictions.

References: `src/factory.ts:validateModuleConfiguration` (module global-only plan, root skip); `compileRegistrationPlan` (zero matches continue); `src/constants.ts:HOOK_DEFINITIONS`; README hook role table.

Requirements:

1. Discover all known effective hook declarations and reject any outside the class role's allowed subset before runtime setters or Express publication.
2. Validate root router prototypes without constructing root classes; avoid adding constructor side effects. Preserve legitimate inherited override behavior and valid default RouteGuard/Identifier hooks.
3. Diagnose class, member, hook, and valid placement; no automatic reassignment to a different scope.
4. Reuse PDEC-01 metadata readers and bounded scans, with documentation of the now-enforced role contract.

Acceptance criteria:

- Wrong-role hooks on module, model router, model options, default options, and root router fail deterministically with no runtime mutation/mount.
- Valid roles, inherited and symbol hooks, and root routers without hooks remain functional.
- Mixed allowed/disallowed hook decoration cannot evade validation; current performance instrumentation stays meaningful and passes.

Verification: V1 new role regressions, factory, bootstrap transaction, hook adapter, inheritance, and instrumentation tests.

Completion evidence:

- Changed (6 files including this record): `packages/access-router-deco/src/constants.ts`, `packages/access-router-deco/src/factory.ts`, `packages/access-router-deco/test/hook-roles.test.ts`, `packages/access-router-deco/README.md`, `website/docs/packages/access-router-deco.md`, and this task file.
- Centralized the five class-role hook subsets and placement labels. Registration now discovers all known families through the PDEC-01 effective-member metadata reader in the existing bounded scan, rejects unsupported placements before runtime setters/publication, and diagnoses class, member, hook, current role, and valid placements. Root prototypes use the same validation without root construction. README/website migration notes agree with the enforced contract and retain the constructor rollback boundary.
- Red evidence on PDEC-02 behavior: `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/hook-roles.test.ts` — **56 failed / 41 passed (97 cases)**. Of these failures, 53 silently accepted wrong-role hooks; three mixed-family cases rejected only the allowed families and omitted the wrong-role hook/placement diagnostic. Five further late-provider/valid-redecoration cases bring the final role suite to **102 cases**.
- V1 passed sequentially on the final implementation:
  1. `pnpm --filter @web-ts-toolkit/access-router-deco... build` — all **6 selected workspace packages** built successfully, including ESM/CJS and declarations.
  2. `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — passed.
  3. `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/hook-roles.test.ts test/factory.test.ts test/bootstrap-transaction.test.ts test/hook-adapter.contract.test.ts test/inheritance-symbol.test.ts test/registration-plan.instrumentation.test.ts test/method-composition.test.ts test/decorator-boundary.test.ts` — **8 files / 327 tests passed** (**102 role cases + 225 existing tests**).
- Regression coverage: all **14 hook families × 5 roles** (29 accepted / 41 rejected placements); repeated invalid bootstrap with unchanged runtime snapshots, zero setter/model-registration/router-construction/mount calls, and released tuple reservations; mixed allowed/disallowed declarations on one or distinct members; inherited symbol hooks; undecorated method/accessor and decorated override semantics; wrapped/member-anchor and legacy function-only detection; default inherited symbol RouteGuard/Identifier invocation with injected ID and instance state; hook-free roots and invalid roots without root construction; a late invalid root prevents all earlier valid module/default/model registration.
- PDEC-01/02 preservation: all **15 composition tests** and the decorator-boundary suite pass, including wrapped request denial and invalid-target rejection. Both existing traversal-instrumentation tests pass with **unchanged counters/assertions/thresholds**; no extra per-hook prototype traversal or global cache was added.
- Additional checks passed: `pnpm exec eslint packages/access-router-deco/src/constants.ts packages/access-router-deco/src/factory.ts packages/access-router-deco/test/hook-roles.test.ts`; `git diff --check -- packages/access-router-deco website/docs/packages/access-router-deco.md docs/tasks/20260926-215629-access-router-deco-policy-preservation.md`.
- No blockers or unresolved attributable regressions. Vitest emitted its existing Vite config-loader warning; execution passed. Full-package/root checks and final V2/V3/V4 remain with PDEC-06. Root `CHANGELOG.md`, generated tracked files, unrelated work, preceding-agent changes, and later task statuses were preserved.

### Task PDEC-04: Surface bootstrap snapshot and rollback failures

Status: completed

Kind: defect

Priority: P1 — silent transaction failures contradict startup integrity guarantees.

Suggested agent: bootstrap transaction implementer (fresh session)

Dependencies: PDEC-03

Primary ownership: `src/factory.ts:createRuntimeSnapshot`, `restoreRuntimeSnapshot`, bootstrap catch/finally; `test/bootstrap-transaction.test.ts`, factory mock fixtures if required; README/website transaction contract.

Finding: snapshot creation exceptions are caught and converted to null, allowing mutations without rollback protection. Restoration exceptions are swallowed, hiding potentially partial runtime state behind only the original setup error. Current tests cover setup/mount failures, not failure of the snapshot mechanism itself.

References: `src/factory.ts:createRuntimeSnapshot` and `restoreRuntimeSnapshot`; README Transactional Bootstrap; `test/bootstrap-transaction.test.ts`.

Requirements:

1. Fail before runtime mutation/publication when snapshot acquisition fails; require the real runtime's supported snapshot/restore capability rather than silently claiming atomicity without it. Preserve supported direct/underlying runtime API forms.
2. On failed setup, attempt runtime restore and app-stack cleanup independently. Surface original and rollback/cleanup failure information together (e.g. AggregateError with cause), without hiding the original failure.
3. Always release in-progress reservation. Document that failed restoration leaves runtime state uncertain and requires host recovery; do not claim rollback succeeded.
4. Retain exact original error on ordinary successful rollback, including non-Error thrown values, and clean-retry behavior where rollback succeeded.

Acceptance criteria:

- Throwing/missing snapshot capability prevents setters and mount; restored capability permits retry.
- A forced restore failure remains visible alongside the original error, while app cleanup still occurs and reservation is released.
- Existing transaction snapshots, reentrancy, ordinary error identity, and successful retry tests pass.

Verification: V1 transaction, factory, bootstrap routes, cross-path, and role tests.

Completion evidence:

- Changed (7 files including this record): `packages/access-router-deco/src/factory.ts`, `packages/access-router-deco/test/bootstrap-transaction.test.ts`, `packages/access-router-deco/test/factory.test.ts`, `packages/access-router-deco/test/bootstrap-routes.integration.test.ts`, `packages/access-router-deco/README.md`, `website/docs/packages/access-router-deco.md`, and this task file.
- Snapshot creation now requires both callable capabilities before acquisition/preflight/mutation; acquisition and capability-lookup throws propagate unchanged, and null/undefined snapshot results fail before setters or publication. Each method retains direct-API precedence with underlying `.runtime` fallback, including mixed forms and receiver binding. The restore function is captured before acquisition/setup so a later API-property replacement cannot silently disable rollback.
- Runtime restoration and app-stack cleanup run independently. Recovery failures produce `AggregateError` with the exact original value as `cause` and first `errors` entry, followed by raw runtime-restore/app-cleanup failures in that order; the message identifies failed recovery steps and uncertainty. App-router retrieval errors are no longer swallowed. Ordinary successful rollback rethrows the exact original value, including non-Error throws. The existing `finally` releases reservations on every guarded exit.
- Red evidence on PDEC-03 behavior: `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/bootstrap-transaction.test.ts` — **26 failed / 18 passed (44 cases)**. Acquisition/missing capability/absent snapshots allowed setup; failed restore was hidden, and failed cleanup replaced the original error. Eight additional capability-capture, precedence, lookup/retrieval, and non-Error recovery cases bring the final transaction suite to **52 cases (40 new + 12 existing)**.
- V1 passed sequentially:
  1. `pnpm --filter @web-ts-toolkit/access-router-deco... build` — all **6 selected workspace packages** built successfully, including ESM/CJS and declarations.
  2. `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — passed.
  3. `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/bootstrap-transaction.test.ts test/factory.test.ts test/bootstrap-routes.integration.test.ts test/cross-path.integration.test.ts test/hook-roles.test.ts` — **5 files / 254 tests passed (40 new + 214 existing)**.
- Regression coverage uses real runtime snapshots behind direct, underlying, and both mixed API facades. It verifies zero setter/model-registration/router-construction/mount calls on acquisition/capability failure; restore-only, cleanup-only, and combined failures after actual Express publication; preservation of preexisting host middleware; exact original/recovery identities (including undefined/null); pre-publication setter failure; reservation release; and clean retry. Failed-recovery cases explicitly repair runtime/app state before retry rather than pretending rollback succeeded. Existing snapshot, OpenAPI conflict, lazy preflight, reentrancy, route construction/error handling, cross-path, and PDEC-03 role tests remain green.
- Updated the three stateless runtime mock fixtures in the two existing test files to provide snapshot/restore capabilities instead of weakening the transaction. README/website migration and recovery notes agree with bootstrap JSDoc; the capability requirement, AggregateError contract, and recovery uncertainty are present in emitted `dist/index.d.ts`.
- Additional checks passed: `pnpm exec eslint packages/access-router-deco/src/factory.ts packages/access-router-deco/test/bootstrap-transaction.test.ts packages/access-router-deco/test/factory.test.ts packages/access-router-deco/test/bootstrap-routes.integration.test.ts`; `git diff --check -- packages/access-router-deco website/docs/packages/access-router-deco.md docs/tasks/20260926-215629-access-router-deco-policy-preservation.md`. **3 V1 checks + 2 scoped checks passed.** Final source/test touchups only aligned comment/statement whitespace.
- No blockers or unresolved attributable regressions. Vitest emitted its existing Vite config-loader warning; execution passed. Constructor/field-initializer effects and Express internals outside the mount stack remain outside rollback; failed restoration/cleanup requires host recovery. Full-package/root V2/V3/V4 remain with PDEC-06 and were not run here. Root `CHANGELOG.md`, tracked generated files, unrelated edits, preceding task work, and later task statuses were preserved. No subagents or commits.

### Task PDEC-05: Provide a working application authorization quickstart

Status: completed

Kind: improvement

Priority: P2 — installed users need a correct, explicit business workflow to copy.

Suggested agent: application docs and executable examples implementer (fresh session)

Dependencies: PDEC-04

Primary ownership: `packages/access-router-deco/README.md`, `website/docs/packages/access-router-deco.md`, `test/documentation-examples.test.ts` and focused supporting fixture if needed.

Finding: the first README example grants admin directly from `x-role`, uses a slug identifier with no slug field, omits body parsing, and lacks explicit operation/field authorization needed for a working route. Existing example tests compile text but execute only a separately reconstructed validator.

References: README Quick Start; `test/documentation-examples.test.ts:extractFirstTypeScriptBlock`, validator runtime example; website quickstart.

Requirements:

1. Replace first examples with a concise coherent workflow: matching schema/identifier, explicit operation and field policy, JSON parsing if mutations are shown, isolated model/runtime ownership, and connection/listening prerequisites.
2. Keep authentication ownership explicit: never promote an unverified request role header to an admin grant. Use a public read-only workflow or host-verified principal with deny-by-default unauthenticated behavior. Avoid pretending to implement an authentication system.
3. Include tenant-scoping/composition guidance where useful, explaining that filters are not authentication and per-request state belongs to injected request/context rather than shared class fields.
4. Execute the extracted shipped example (not a divergent reconstruction) against representative HTTP requests with a deterministic persistence seam or local test database; retain strict installed declaration compilation.

Acceptance criteria:

- Both shipped/website first examples compile and match the same current public API contract.
- Executed example handles a permitted request as documented, rejects an unauthorized path, and a forged `x-role: admin` does not elevate access.
- Identifier/schema and parsing behavior agree; documented deployment prerequisites are explicit.

Verification: V1 documentation examples and strict consumer tests; V2 packed consumer sentinel at final integration.

Completion evidence:

- Changed (5 files including this record): `packages/access-router-deco/README.md`, `website/docs/packages/access-router-deco.md`, `packages/access-router-deco/test/documentation-examples.test.ts`, new `packages/access-router-deco/test/documentation-http.fixture.js`, and this task file. Only PDEC-05 status/evidence updated; earlier implementation and documentation notes preserved.
- Both first examples now contain the identical `createArticleApp(connection)` public-read-only workflow: host-owned connection/model instance, fresh isolated factory runtime, required unique slug matching `@Identifier`, `published: false` schema default, `@BaseFilter('read')` publication restriction, explicit read-only operation policy, explicit public field policy, and JSON parsing before bootstrap. `publicReadOptions` disables list fallback and computed field permissions; docs accurately describe the remaining `_permissions` placeholder. Startup instructions cover Node/TypeScript/peers, `MONGODB_URI`, awaited connection, index initialization, trusted provisioning, listening, and host-owned shutdown. Migration/tenant guidance removes header-based administrator grants and explains verified host principals, deny guards, filter limitations, supported request/context injection, and shared-instance state boundaries.
- The test writes each extracted first TypeScript block unchanged into a staged installed-package layout, compiles it with **strict NodeNext, `skipLibCheck: false`, legacy decorators, and `noEmitOnError: true`**, and executes that emitted JavaScript from a plain Node HTTP runner. It uses real Express listeners on loopback ephemeral ports, real decorators/bootstrap/Access Router/Mongoose query casting and projection, and deterministic in-memory rows only at `Article.collection.findOne`. No replacement authorization implementation or source aliases are used. Existing validator and strict-consumer coverage remains intact; an equality assertion prevents README/website first-example drift.
- V1 passed (build, typecheck, then targeted execution; no concurrent builds launched by this task):
  1. `pnpm --filter @web-ts-toolkit/access-router-deco... build` — **6 selected workspace packages built successfully**, including ESM/CJS/declarations.
  2. `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — **passed** (also rerun before final targeted verification).
  3. `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts` — final run at **22:34:38: 2 files / 10 tests passed** (7 documentation + 3 strict-consumer tests).
- HTTP evidence per extracted example: **19 requests / 8 authorized-read persistence queries / zero forbidden persistence calls**, totaling **38 requests / 16 read queries** across README and website. Anonymous and forged `x-role: admin` requests both read published content (200), cannot read drafts (404), cannot list/create/update/delete (401), cannot expose `internalNotes` even with explicit selection, and receive 404 for unknown paths. Collection assertions verify slug/publication restrictions and field projection; response assertions verify exact public content plus documented metadata. Observed POST request bodies prove the shipped JSON parser ran; denied operations stop before persistence. Two same-name models on separate connections return distinct content, with independent runtimes and policy changes; the global Mongoose registry is untouched. Servers/connections and staged directories are cleaned up.
- Development checks exposed and corrected unsupported `operationAccess.default` object syntax and default read-fallback/permission-metadata assumptions; these were example/test iterations, not package regressions. Intermediate targeted runs also hit **two external staging races** (missing `express-response-handler` declarations, then missing `access-router` declarations). Process inspection confirmed independently running workspace/root builds/tests; waited for the observed dependency build and reran against complete artifacts. The final required run passes with no declaration workaround. Vitest's existing Vite config-loader warning remains non-blocking.
- Additional checks passed: `pnpm exec eslint packages/access-router-deco/test/documentation-examples.test.ts packages/access-router-deco/test/documentation-http.fixture.js`; `git diff --check -- packages/access-router-deco website/docs/packages/access-router-deco.md docs/tasks/20260926-215629-access-router-deco-policy-preservation.md`. The initial fixture's CommonJS-import lint errors were resolved by using an ESM runner.
- No remaining blocker or attributable regression. V2/V3/V4 full-package/root verification remains with PDEC-06; this session did not launch those runs. Root `CHANGELOG.md`, tracked generated files, unrelated edits, prior task work, and PDEC-06 status preserved. No nested agents or commits.

### Task PDEC-06: Independently review and verify the complete remediation

Status: completed

Kind: investigation

Priority: P1 — independently verify policy and public contract integration.

Suggested agent: independent reviewer (fresh session; not any implementation agent)

Dependencies: PDEC-01, PDEC-02, PDEC-03, PDEC-04, PDEC-05

Primary ownership: this task record; review all changed package/docs files. Add only necessary regression/contract fixes if uncovered, explicitly recording them; substantial new independent work gets a numbered follow-up before implementation.

Finding: shared metadata, role validation, bootstrap rollback, and installed examples need cross-task review; individual focused passes do not establish overall completion.

References: all tasks above and their completion evidence; prior deferred decisions.

Requirements:

1. Audit every acceptance criterion and current implementation/test evidence; verify wrapper/role boundaries cannot silently discard the tested policies and request errors do not leak internal state.
2. Run V2, V3, and V4 serially, recording actual outputs/counts and unrelated blockers honestly. Inspect emitted declarations and packed-consumer results.
3. Confirm root CHANGELOG.md was not changed by this work, unrelated pre-existing edits are preserved, and no unsupported performance claim was introduced.
4. Record task-by-task verdicts, deferred decisions/residual risk, and final completion status. Do not call unrun tests passing.

Acceptance criteria:

- Each implementation task has passing required checks and evidence matching its criteria.
- Final package suite and changed-scope lint/diff checks pass; repository diagnostic outcomes are reported, with no unresolved attributable regression.
- Task record has no unexplained pending/in-progress/blocked item and clearly distinguishes existing external deferrals from completed new work.

Verification: V2, V3, V4 and independent source/criteria review; coordinator performs final record audit afterward.

Completion evidence:

- Independent reviewer session: read this entire task file and root `AGENTS.md`, marked PDEC-06 `in_progress` before investigation, and audited changed source, all changed/new tests, README/website, package/build metadata, emitted declarations, and packed-consumer implementation. Dependencies PDEC-01–05 were completed at entry. No nested agents. **Review verdict: all 15 implementation acceptance criteria pass; no attributable regression or necessary implementation fix found.** Only this task's status/evidence was edited by the reviewer, using `apply_patch`.

### Independent acceptance-criterion verdicts

Criterion numbers below follow the three acceptance bullets in each task. Paths are relative to `packages/access-router-deco/` unless stated otherwise; bare source filenames refer to `src/` (method decorators under `src/decorators/`), and bare test/fixture filenames to `test/`. Earlier V1/red results are historical implementation evidence, audited here rather than represented as fresh reruns; every named package suite was included in the fresh full-package checks below.

| Task    | Verdict        | Evidence for every acceptance criterion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDEC-01 | **PASS (3/3)** | **C1:** `method-composition.test.ts:71–101` exercises both descriptor-mutation/replacement styles in both orders: actual HTTP denial (401) over configured read allow and zero collection reads. **C2:** its inherited symbol validators, sparse Document/Permissions/Context/Request injection, instance state, decorated/undecorated overrides, effective async wrapper/error behavior, and operation separation agree with `metadata.ts:70–110` and `factory.ts:1050–1111,1226–1250`. **C3:** all 15 composition cases plus inheritance, duplicate, decorator, hook-adapter, factory, and unchanged instrumentation suites pass in V2 and root tests. The recorded old-behavior failures specifically cover lost declarations. Own-member anchoring plus legacy function fallback is centralized and namespaced; wrapper behavior and override boundaries are documented consistently.                                                                                                                                                                                                                                                          |
| PDEC-02 | **PASS (3/3)** | **C1:** `method.decorators.ts:69–115` validates callable own data descriptors before hook writes; `decorator-boundary.test.ts:193–261` checks 17 invalid shapes across all 14 families, getter/setter/function non-execution, zero metadata writes, and preservation of prior declarations. **C2:** `strict-consumer-types.test.ts:316–386` strictly compiles real callable-getter syntax against installed declarations, then executes it and verifies RouteGuard/GlobalPermissions throws with member diagnostics and zero getter calls/writes; bypassed JS types are covered separately. **C3:** operation-bearing and operationless families use the same validation and all wrapper tests remain green. Keeping legacy descriptor typing while documenting runtime rejection preserves ordinary consumer syntax.                                                                                                                                                                                                                                                                                                                              |
| PDEC-03 | **PASS (3/3)** | **C1:** `hook-roles.test.ts` independently specifies all 14 families × 5 roles (29 allowed / 41 rejected) and asserts unchanged snapshots, zero runtime setters/model registration/router construction/app mounts, deterministic retry, and diagnostic class/member/hook/placement. `factory.ts:959–998` completes all role plans before snapshot/preflight/setters. **C2:** valid inherited symbol defaults invoke guards/identifiers with state/ID injection; method/accessor overrides suppress base declarations; decorated overrides use their own roles; hook-free roots publish without construction. **C3:** mixed allowed/disallowed families, separate members, wrapped member anchors, legacy function-only metadata, and a late invalid root cannot bypass validation. All 102 cases and both unchanged instrumentation cases pass; discovery examines every known family in the existing bounded owner scan.                                                                                                                                                                                                                          |
| PDEC-04 | **PASS (3/3)** | **C1:** `bootstrap-transaction.test.ts:82–187,266–305,378–387` checks direct, underlying, and both mixed snapshot API forms, receiver binding/precedence, missing/non-callable methods, acquisition/lookup throws, absent snapshots, zero mutation/publication, and retry after capability repair. **C2:** restore-only, cleanup-only, and combined failures after actual publication preserve the original as `cause`/first aggregate entry, retain raw recovery errors in order, independently attempt both steps, preserve host middleware where cleanup succeeds, and release reservations; restore capability is captured before setup replacement. Failed-recovery tests repair host state before retry. **C3:** all 52 transaction cases pass, including snapshots, lazy preflight, reentrancy, exact Error/object/string/undefined/null/zero throw identity, and clean retries. `factory.ts:327–414,456–507`, emitted bootstrap JSDoc, README, and website agree on synchronous capabilities and uncertain state after failed recovery.                                                                                                    |
| PDEC-05 | **PASS (3/3)** | **C1:** the two identical extracted first examples compile unchanged under strict NodeNext with `skipLibCheck:false`, using emitted installed-package declarations. **C2:** `documentation-examples.test.ts:46–103` executes that emitted code through `documentation-http.fixture.js`, not a replacement policy: **38 HTTP requests / 16 authorized read queries / zero forbidden persistence calls** across the two examples. Published reads succeed, drafts/unknown routes return 404, list/create/update/delete return 401, forged admin headers do not elevate, and explicit field selection cannot reveal internal fields. **C3:** schema's required unique slug and default unpublished state match Identifier/BaseFilter behavior; observed POST bodies prove the shipped JSON parser runs; query restrictions/projection and separate same-name connection/model/runtime ownership are asserted. Both docs explain connection/index/provisioning/listening/shutdown prerequisites, public authorization, verified-principal ownership, filter limits, and request-state injection. All 7 documentation and 3 strict-consumer cases pass. |

### Cross-task/public contract audit

- Public surface: `src/index.ts` and the single-root `package.json` export map remain unchanged. `tsup.config.ts` bundles CJS/ESM for Node 22. Inspected emitted `dist/index.d.ts` (including its final export list) and checked both built runtime namespaces with a plain Node exact-set assertion: **29 named runtime exports in each format**, no metadata helper/watermark/role-table exports. `METHOD_METADATA`, `HOOK_CLASS_ROLES`, and the new reader/writer are internal. The non-exported `HOOK_DEFINITIONS`/`HookParamtypes` declarations support existing operation types; their presence inside the declaration file is not a public export. Typed model/union overloads, return contracts, factory result, accessor warning, and rollback JSDoc remain intact.
- Packed verification in V2/root: production-transformed manifest and exact seven-file tarball assertions, ESM/CJS loading, strict NodeNext (`.mts`/`.cts`) and Bundler compilation, and package-owned Express declaration dependency all passed (four packed-consumer tests). These are the current-peer sentinel; **the optional full peer-version matrix was not run**, and historical minimum-version claims are not new verification here.
- Error/parameter/alternate boundaries: reviewed `factory.ts:71–104` and the route-error tests for safe 404/500 messages, invalid statuses, no raw error/secret/stack serialization, and `headersSent` delegation. Cross-path, runtime-isolation, route-guard, hook-adapter, sparse-parameter, and inherited-owner tests pass. Bootstrap recovery diagnostics stay startup exceptions, separate from request JSON; intentional 4xx messages retain the existing host contract. Unsupported hook parameters still fail before setters; wrong-role checks precede mixed-family handling and cannot be evaded by the tested wrapper/legacy/symbol paths.
- Performance: no request-path cache or global registration cache was added. Both descriptor-count instrumentation tests remain byte-unchanged from HEAD and pass, retaining chain-length assertions and bounds **800 (50 methods/depth 5), 200 (20/depth 2), and the 2000 per-hook-traversal tripwire**. These verify bounded descriptor traversal, not wall-clock speed or total-work linearity; no new unsupported performance claim was introduced.

### Fresh verification and repository diagnostic bounds

Commands were launched **serially** from the workspace root: V2 → V3 lint → V3 diff → V4 build → V4 lint → V4 test. Root `pnpm test` used the repository's `--workspace-concurrency=1`; no overlapping rebuilds were launched by this reviewer. An unrelated message-service build observed at entry had exited before V2 began. Other sessions continued editing this workspace, so root outcomes describe these actual runs, not a frozen repository baseline. Environment: Node **26.7.0**, pnpm **11.18.0**, Vitest **4.1.11**.

| Check                                                                                                                                                                 | Actual result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 `pnpm --filter @web-ts-toolkit/access-router-deco test`                                                                                                            | **PASS**, exit 0: six selected packages rebuilt, package typecheck passed, **16 files / 524 tests passed**; Vitest start **22:38:31**, duration **66.16s** on 2026-09-26. Existing Vite config-loader warning only. Log: `<repo-root>/_tmp/pdec06-v2.log`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| V3 `pnpm exec eslint "packages/access-router-deco/**/*.{ts,js,mts}"`                                                                                                  | **PASS**, exit 0, no diagnostics. Log: `<repo-root>/_tmp/pdec06-v3-eslint.log` (empty successful output).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| V3 `git diff --check -- packages/access-router-deco website/docs/packages/access-router-deco.md docs/tasks/20260926-215629-access-router-deco-policy-preservation.md` | **PASS**, exit 0, no whitespace diagnostics; also repeated after this completion record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| V4 `pnpm build`                                                                                                                                                       | **FAIL**, exit 2, normal process completion. Of 25 selected projects, **21 reported Done**, `apps/nodejs` failed with **TS7016** at `src/app.ts(2,52)` and `src/routers.ts(2,62)` resolving `@web-ts-toolkit/access-router` declarations. `packages/access-router-deco` completed JS/declaration builds. No build start for `packages/access-router-react`, `apps/react-vite`, or `apps/runtime` before the stop. Log: `<repo-root>/_tmp/pdec06-v4-build.log` (743 lines).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| V4 `pnpm lint`                                                                                                                                                        | **FAIL**, exit 1: **22 errors / 0 warnings**, all in unrelated `packages/json-frame/test-decl-consumer/inference-contract.mts` (empty-object types and type-only-used variables). No deco diagnostics. Log: `<repo-root>/_tmp/pdec06-v4-lint.log`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V4 `pnpm test`                                                                                                                                                        | **FAIL**, exit 1, normal fail-fast completion after **19 passing package scripts**, then `@web-ts-toolkit/access-router-runtime`: **11 files passed / 1 failed; 132 tests passed / 3 failed**. Failures are its `test/packed-consumer.test.ts` Mongoose 8, Mongoose 9, and minimally provisioned consumers: `pnpm exec tsc -p tsconfig.nodenext.json` reports **TS7016** for packed `@web-ts-toolkit/access-router` and `/advanced` declarations. First suite start **22:44:55**; failing runtime suite start **23:04:40**, duration **174.39s**. Root-observed totals across completed Vitest summaries: **356 files passed / 1 failed; 6,672 tests passed / 3 failed / 1 todo** (includes PDF browser and client declaration runs). `packages/access-router-react` and `apps/react-vite` test scripts were **not reached**; the other three apps have no `test` script. No manual remainder matrix run. Log: `<repo-root>/_tmp/pdec06-v4-test.log` (1,726 lines). |

- **Final package green within V4:** deco independently rebuilt its six-package dependency closure and passed typecheck plus **16 files / 524 tests** again at **23:02:24**, duration **69.08s** (`pdec06-v4-test.log:1253–1413`), including the packed and documentation consumers. Access Router itself passed **59 files / 812 tests** in that root run. The root failures are outside deco: the Node example does not depend on deco, and Access Router Runtime's failing tarball workspace (`test/packed-consumer.test.ts:60–71`) does not include it. The exact external declaration-resolution/staging cause is **not established** by this review; concurrency is a possible environmental contributor, not a proven diagnosis. No unrelated fixes were made.
- Timeout accounting: V2 had a **600,000ms** harness allowance; V4 build **1,200,000ms**, lint **600,000ms**, test **1,800,000ms**. **None timed out**. The root test ran roughly 23 minutes and exited on the reported assertions/compiler errors; output truncation was only display truncation, with complete logs retained above. No timeout retry was necessary.
- Preservation: root `CHANGELOG.md` was clean at entry and remains clean; before/after `git hash-object` is **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. No tracked generated artifacts were edited, no commits were made, and unrelated dirty/concurrent files were preserved. Package changes remain the prior agents' work; this reviewer made **zero source/test/docs fixes** outside this task record.
- Residual limits remain the existing external deferrals **BDECO-09-F01** (scoped property validation/remapping) and **BDECO-10-F01** (OpenAPI mount-prefix composition), plus trusted same-role redecorations/Reflect provenance, arbitrary wrapper semantics, constructors/field initializers outside rollback, and host recovery after rollback failure. The HTTP example uses a deterministic collection seam rather than a live deployment database. No new independent finding requiring a follow-up task was confirmed. **PDEC-01–06 are completed; repository-wide green is not claimed. Coordinator final record audit remains the next handoff, not an unrun check claimed by this reviewer.**

## Coordinator final record audit

- Read the entire completed task file after the independent reviewer returned. All six task statuses are `completed`, each has Completion evidence, dependencies are satisfied, and all 15 implementation acceptance criteria have independent passing verdicts. Historical findings and intermediate results remain intact.
- Confirmed six distinct sequential task sessions: PDEC-01 `ses_f1ec5c486ffe6rm37Pzwuas5BK`; PDEC-02 `ses_f1ebed98dffe1EAvb389KUssLm`; PDEC-03 `ses_f1eb9c2edffetRdP6Ql5dPIkh3`; PDEC-04 `ses_f1eb4f4e5ffetGDupHVurjwWOs`; PDEC-05 `ses_f1eaef4efffeSoMUdQoHttd1Li`; independent PDEC-06 `ses_f1ea24943ffeXVF3muFFMFN4Hk`.
- Inspected scoped git status and diff statistics: implementation changes are in the package, its matching website documentation, and this new record; three new test/fixture files are present. Root `CHANGELOG.md` has no diff/status entry. No commit was made.
- Accepted fresh V2/V3 verification and the second 524-test package pass inside V4. Full repository failures and unrun remainder are explicitly retained; no all-repository pass is claimed. The existing external design deferrals are not misrepresented as completed implementation.
- Final verdict: this six-task remediation is complete, with no unresolved attributable regression or blocked task. The independent review handoff above is now closed by this coordinator audit.
