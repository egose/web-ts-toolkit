# Access Router Health Follow-Up

Created: 2026-09-05 10:55:47 PDT

Package: `packages/access-router` (not `packages/access-router-runtime`).

## Objective And Scope

Close newly identified authorization, validation, runtime-isolation, consumer-type, and verification gaps. Improve data snapshot efficiency without weakening ownership. This document is the requested deliverable; no package implementation was authorized or changed during review.

Follow `.opencode/skills/task-as-you-go/SKILL.md`. Agents must re-read current source, record ownership/status here, and preserve unrelated work. Do not rewrite the router/service architecture wholesale, introduce speculative caching, add new public entrypoints, or hand-edit `dist/`.

Related completed objectives, inspected for deduplication:

- `docs/tasks/20260804-124249-access-router-review-remediation.md` (AR).
- `docs/tasks/20260805-192300-access-router-remediation-follow-up.md` (ARF).
- `docs/tasks/20260820-164011-access-router-post-remediation-review.md` (ART).

These findings identify remaining cases, not reasons to mark the earlier work incomplete. In particular, same-request runtime transitions differ from separate-request isolation; construction-time subpath lookup differs from persistence model ownership; copying the whole dataset differs from page-sized output shaping. Keep historical completion evidence intact.

## Coverage And Baseline

- Three read-only review scopes covered routing/ACL, processors/data/validation, and public API/packaging. Source, relevant tests, manifests, README, llms guidance, and existing declarations were inspected. This is not an exhaustive vulnerability audit, dependency audit, or production benchmark.
- Review-agent in-memory probes reproduced false filters becoming `{}`, runtime B accepting runtime A's permission on the same request, isolated connection subdocument routes being omitted, and successful ArkType-shaped array outputs being rejected.
- Review-agent TypeScript `noEmit` probes reproduced NodeNext default-import, typed model registration, dotted-hook generic, and optional nested-filter failures. These used existing, potentially stale `dist/` plus installed peers; source/manifest causes were independently located. Fresh packed verification is required during implementation.
- No package/full test suite, build, lint, real-library adapter matrix, live MongoDB destructive reproduction, or performance benchmark was run for this review. Focused probes and source evidence were sufficient to write tasks; no green baseline is claimed.
- Initial `git status --short` showed unrelated modifications in `packages/asset-inliner/test/files-write.test.ts` and `packages/express-oidc-vault-redis-store/test/redis-integration.test.ts`. Do not alter them.
- Current package scripts rebuild transitive dependencies. Vitest permits up to four workers; this does not make separate package build/test invocations safe to run concurrently.

## Priorities And Coordination

- P0: confirmed authorization bypass or denial becoming an allowed query. Fix before release.
- P1: runtime correctness, sensitive error disclosure, or a broken advertised consumer workflow.
- P2: bounded correctness, type usability, verification, or measured performance improvement.

All task paths below are relative to the repository root. All tasks start `pending`; dependencies are execution prerequisites, not merely reading order.

| Agent                | Tasks                  | Sequencing / Shared Files                                         |
| -------------------- | ---------------------- | ----------------------------------------------------------------- |
| ACL boundary         | ARH-01, ARH-02         | Sequential; both may touch `core-shared.ts`                       |
| Router composition   | ARH-03, ARH-04         | Independent of each other; coordinate route context changes       |
| Validation           | ARH-05, ARH-06, ARH-07 | Sequential ownership of `validation/parsers.ts` and adapter tests |
| Package contracts    | ARH-08, ARH-09, ARH-10 | Sequential ownership of export/packed/type fixtures               |
| Data ownership       | ARH-11                 | After runtime/model registration changes                          |
| Processor robustness | ARH-12                 | Independent source/test ownership                                 |
| Independent reviewer | ARH-13                 | After all implementation tasks                                    |

Only the coordinator runs builds/tests, one invocation at a time. Independent agents may research or edit disjoint files concurrently. Serialize README, llms, changelog, manifest, lockfile, and shared fixture updates; the coordinator merges those edits. Use real optional-validator packages as test-only dependencies where needed, without adding mandatory runtime dependencies by default.

## Shared Verification

Prerequisites: dependencies installed with `pnpm install`, supported Node >=22, and access to any MongoDB memory-server binary / peer packages required by existing tests. Record exact environmental blockers rather than silently skipping coverage.

- V1: after changes, build transitive dependencies once with `pnpm --filter @web-ts-toolkit/access-router... build`, then run selected files with `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`. The filename is a placeholder to replace with the task's regression file(s).
- V2: `pnpm --filter @web-ts-toolkit/access-router typecheck`, then `pnpm --filter @web-ts-toolkit/access-router test`, serialized. These scripts rebuild dependencies themselves.
- V3: run `test/packed-consumer-compatibility.test.ts`, `test/strict-consumer-types.test.ts`, `test/export-contract.test.ts`, and `test/documentation-examples.test.ts` through V1 after a fresh build. Use the existing publication transformation/packed harness, not a substitute manifest. Check actual exported declaration resolution and API calls with `skipLibCheck: false`.
- V4: final repository integration: `pnpm build`, `pnpm test`, `pnpm lint`, and `git diff --check`, serialized. Distinguish unrelated baseline failures from new regressions; do not change other packages without evidence and explicit task expansion.

Every defect requires a regression that fails before and passes after the fix where feasible. Preserve allowed/ordinary behavior with positive controls. Contract changes require matching types, README/llms/OpenAPI where relevant, and release notes. A task remains blocked if required verification cannot complete; append changed files, commands, results, and follow-ups when completing it.

## Executable Tasks

### Task ARH-01: Preserve Explicit Filter Denial

Status: completed

Assigned session: isolated ARH-01 implementation agent

Completion evidence:

- Changed: `src/core-shared.ts`, model/data router denial handling, `test/filter-denial.integration.test.ts`, README, and llms guidance.
- Verified: transitive package build; focused filter-denial suite (10 passed); package typecheck; package suite (42 files, 369 tests passed).
- Result: explicit identifier/override denial remains terminal, denied direct/root reads and deletes make no persistence lookup, and allowed controls retain trusted override behavior.
- Follow-up: none.

Kind: defect

Priority: P0 - denial can become an unrestricted read or destructive lookup.

Suggested agent: ACL boundary specialist

Dependencies: none

Primary ownership: `packages/access-router/src/core-shared.ts`; focused filter and direct/root service regressions.

Finding / references: `normalizeFilter()` preserves `false`, but `resolveAccessFilter()` uses `nextFilter || {}` and `if (!nextFilter) return baseFilter` (`src/core-shared.ts:110-118,155-180`). A `resolveIdFilter` or `overrideFilter` returning false loses denial. Downstream delete uses the resolved lookup before deleting the matching row (`src/services/service.ts:878-909`). AR-10 normalization work did not cover this sentinel.

Requirements:

1. Distinguish denial from absent/empty filters at the shared boundary. Preserve false through base-filter composition and do not let an override accidentally revive an already denied identifier; document trusted override semantics explicitly.
2. Keep legitimate empty/absent filters and restrictive base filters working. Preserve the controlled denied-result contract rather than allowing an arbitrary row lookup.

Acceptance criteria:

- Identifier and override denials remain denied with absent, empty, restrictive, and denied base filters.
- Direct/root read and delete regressions assert zero persistence calls after denial and no unrelated-row deletion; include positive allowed controls.
- Inspect existing filter tests for any contradictory override expectation and update contract documentation/release notes deliberately.

Verification: V1 filter and authorization regressions; V2.

### Task ARH-02: Scope Request Authorization State To Its Runtime

Status: completed

Assigned session: isolated ARH-02 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/acl/request-context.ts`, `src/core.ts`, `src/core-data.ts`, `src/core-shared.ts`, `test/runtime-isolation.integration.test.ts`, README, and llms guidance.
- Verified: transitive package build; focused runtime-isolation plus filter-denial suites (2 files, 22 tests passed); package typecheck; package suite (42 files, 374 tests passed).
- Result: shared requests now maintain independent runtime-owned authorization state, same-field/conflicting-resolver and model/data/root transitions cannot reuse another runtime's grants, warmed base-filter caches stay isolated, and same-runtime reuse remains idempotent.
- Follow-up: none.

Kind: defect

Priority: P0 - middleware composition can reuse another runtime's credentials and policy cache.

Suggested agent: runtime isolation specialist

Dependencies: ARH-01

Primary ownership: `src/acl/request-context.ts`, `src/core.ts`, `src/core-data.ts`, `src/core-shared.ts`, and `test/runtime-isolation.integration.test.ts`, all under `packages/access-router/`.

Finding / references: initialization exits on a request-wide flag (`src/acl/request-context.ts:37-47`). Middleware switches runtime context but may retain an existing core (`src/core.ts:542-554`; `src/core-data.ts:213-225`). Permission setup also skips resolution if the configured request field is already populated (`src/core-shared.ts:183-198`). One request passing through A then B can use A's grants under B's policy. Existing isolation tests use separate apps/requests and do not prove this boundary.

Requirements:

1. Resolve the policy decision before implementation: either support independent runtime-owned state on a shared request or reject cross-runtime reuse explicitly. Never silently combine states.
2. Track ownership of cores, permissions, initialization, and base-filter caches together. Preserve documented application-supplied request permissions; distinguish those from fields populated by another runtime.
3. Cover both model and data initialization and root dispatch. Avoid a registry-only fix that leaves permission-field reuse intact.

Acceptance criteria:

- A single app/request traversing A then B cannot use grants supplied only by A at B's service boundary.
- Cover same permission-field names, conflicting resolvers, model/model, model/data, model/root transitions, and warmed same-name base-filter caches.
- Same-runtime repeated middleware remains safe and does not unnecessarily rerun its resolver; separate concurrent requests stay isolated.
- Chosen cross-runtime composition contract is documented with migration impact.

Verification: V1 runtime isolation and direct/root ACL suites; V2.

### Task ARH-03: Discover Subdocument Routes From The Owning Runtime

Status: completed

Assigned session: isolated ARH-03 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/routers/model-router-route-context.ts`, `model-router-subdocument-routes.ts`, `model-router.ts`, and `test/model-subdocument-routes.integration.test.ts`.
- Verified: transitive package build; focused subdocument/OpenAPI/runtime-isolation suites (3 files, 49 tests passed); package typecheck; package suite (42 files, 377 tests passed).
- Result: subdocument discovery uses the owning runtime explicitly, isolated-connection models generate only their own endpoints/OpenAPI paths, and same-name global/isolated divergence is order-independent.
- Follow-up: none.

Kind: defect

Priority: P1 - isolated models lose endpoints or acquire routes from an unrelated schema.

Suggested agent: router composition specialist

Dependencies: none

Primary ownership: `packages/access-router/src/routers/model-router-subdocument-routes.ts`, its route context, and `test/model-subdocument-routes.integration.test.ts`.

Finding / references: route discovery uses ambient `getModelSub()` (`src/routers/model-router-subdocument-routes.ts:23-27`; `src/meta.ts:4,14-15`) during construction outside runtime context (`src/routers/model-router.ts:46-57`). Default-runtime metadata can cache an empty subpath list or use a global same-name model (`src/runtime.ts:579-606`). Existing subdocument fixtures register globally and mask the isolated-connection case.

Requirements:

1. Pass the owning runtime or its resolved metadata explicitly through the smallest route-construction boundary.
2. Keep runtime metadata caches isolated; do not register isolated models globally as a workaround.

Acceptance criteria:

- A model registered only on an unconnected `mongoose.createConnection()` generates its expected subdocument endpoints and OpenAPI paths without a database server.
- Same-name global and isolated models with different subpaths generate only their own endpoints, regardless of construction order.
- Existing default-runtime route behavior remains covered.

Verification: V1 subdocument, OpenAPI, and runtime-isolation tests; V2.

### Task ARH-04: Use Transformed Advanced Mutation Bodies

Status: completed

Assigned session: isolated ARH-04 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/routers/model-router-collection-routes.ts`, `model-router-document-routes.ts`, `test/advanced-mutation-bodies.integration.test.ts`, README, and llms guidance.
- Verified: transitive package build; focused advanced-mutation plus model-router suites (2 files, 22 tests passed); package typecheck; package suite (43 files, 383 tests passed).
- Result: advanced create/update/upsert dispatch final parsed bodies with preserved envelope ordering, query fallback, and allowed-option restrictions; rejection performs zero persistence dispatch.
- Follow-up: none.

Kind: defect

Priority: P1 - application validators run but their sanitized output is not persisted.

Suggested agent: mutation routing specialist

Dependencies: none

Primary ownership: `packages/access-router/src/routers/model-router-collection-routes.ts`, `model-router-document-routes.ts`, and advanced mutation schema tests.

Finding / references: advanced create/update/upsert await and discard `parseBodyWithSchema()` output, dispatching earlier destructured values (`src/routers/model-router-collection-routes.ts:144-168`; `src/routers/model-router-document-routes.ts:235-260,313-335`). The parser returns transformed data (`src/validation/parsers.ts:85-94,120-125`). Existing mutation schema tests (`test/model-router.integration.test.ts:240-283`) cover rejection/nested schemas, not whole-body replacement.

Requirements:

1. Derive service data, arguments, and options from the final parsed body, preserving envelope validation and nested-schema ordering.
2. Keep query-option fallback and allowed option restrictions intact. Do not solve by requiring validators to mutate their input.

Acceptance criteria:

- All three operations use a validator returning a new object with sanitized data and changed options; spies observe only the final values.
- Include Zod strip/transform and custom success-result validators, rejection with zero dispatch, and nested-plus-whole-body schema composition.
- Ordinary mutations retain equivalent parser semantics; document the corrected contract.

Verification: V1 advanced mutation regressions and model-router integration; V2.

### Task ARH-05: Separate Validation Failures From Operational Exceptions

Status: completed

Assigned session: isolated ARH-05 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/validation/parsers.ts`, `src/validation/types.ts`, `test/data-router.test.ts`, and new `test/validation-error-boundary.test.ts`.
- Verified: transitive package build; focused validation-error-boundary plus data-router suites (2 files, 27 tests passed); package typecheck; package suite (44 files, 388 tests passed).
- Result: genuine Yup/Vine failures normalize to controlled 400 diagnostics while operational exceptions rethrow with identity to the server-error boundary; validation 400 output contains no operational sentinel and 500s follow the configured server-error policy.
- Follow-up: none.

Kind: defect

Priority: P1 - Yup can expose internal exception messages as client validation details; both adapters hide server faults.

Suggested agent: validation/error-boundary specialist

Dependencies: none

Primary ownership: `packages/access-router/src/validation/parsers.ts` (`fromYup`, `fromVine`, error discriminators), associated structural types, and focused adapter tests.

Finding / references: both adapters catch every exception (`src/validation/parsers.ts:239-253,364-378`); Yup accepts any object with a message as a validation error (`:405-414,518-528`). An upstream failure in a custom check becomes a client-visible validation message instead of following server-error handling. Existing fake validation failures do not cover ordinary exceptions (`test/data-router.test.ts:941-953`). This is conditional on application validators throwing sensitive operational errors, not evidence of an unconditional data leak.

Requirements:

1. Recognize actual supported library validation failures and normalize only those. Rethrow unexpected exceptions unchanged.
2. Verify discriminators against real Yup/Vine versions; do not rely only on permissive fake objects. State any narrowed structural-adapter contract and release impact.

Acceptance criteria:

- Genuine library validation failures retain useful controlled paths/messages.
- Ordinary Error, TypeError, and simulated upstream failures propagate to the server-error boundary, preserving identity where applicable.
- A sensitive sentinel from an operational exception never appears in validation output; HTTP behavior follows the configured server error policy.

Verification: V1 adapter and HTTP error regressions; V2.

### Task ARH-06: Honor Validator Success And Async Contracts

Status: completed

Assigned session: isolated ARH-06 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/validation/parsers.ts`, `src/validation/types.ts`, `package.json` test-only `ajv`/`arktype` devDeps, `test/data-router.test.ts`, and new `test/validation-arh06.test.ts`.
- Verified: transitive package build; focused validation-arh06/data-router/validation-error-boundary suites (3 files, 35 tests passed); package typecheck; package suite (45 files, 396 tests passed).
- Result: real ArkType arrays/records/nullables succeed via brand/Standard Schema discrimination, AJV diagnostics stay input-local with full async-contract support, and explicit/automatic Zod async refinements/transforms work with operational exceptions propagated.
- Follow-up: none. Async AJV decision: support full sync plus `$async` rejection-carried contract.

Kind: defect

Priority: P1 - valid arrays fail and concurrent validation diagnostics can be assigned to the wrong input.

Suggested agent: validation integration specialist

Dependencies: ARH-05

Primary ownership: `packages/access-router/src/validation/parsers.ts` (`fromArkType`, `fromAjv`, `fromZod`), adapter structural types, and focused real-library tests.

Finding / references:

- ArkType errors are identified by `Array.isArray`, so successful arrays fail, and null members can throw (`src/validation/parsers.ts:310-324,440-446,522-524`). Existing fake success outputs are objects (`test/data-router.test.ts:1102-1152`).
- AJV reads mutable `validator.errors` after an unconditional await (`src/validation/parsers.ts:273-286`). Same-turn invalid/valid calls can produce an empty error list or another input's diagnostics. This does not turn invalid input into success. Existing adapter requests are sequential (`test/data-router.test.ts:980-1050`).
- Zod adaptation calls synchronous safeParse, prioritized over Standard Schema (`src/validation/parsers.ts:174-176,203-217`), so async refinements/transforms throw rather than validate.

Requirements:

1. Identify ArkType failures through its supported discriminator or Standard Schema contract, not array shape or issue-like record fields.
2. Capture synchronous AJV errors before suspension. Decide and document support for actual async AJV rejection-carried errors rather than assuming a delayed boolean is the library's full contract.
3. Support async Zod user-schema validation while preserving output types and synchronous-schema behavior. Do not unnecessarily change built-in envelope parsing.

Acceptance criteria:

- Real ArkType empty, scalar, record, and nullable arrays succeed unchanged; invalid arrays return useful errors, including data records containing `message`/`path` keys as positive controls.
- Deterministic same-turn AJV invalid/valid and invalid/invalid calls retain input-local paths/messages.
- Explicit and automatic Zod adapters support passing/failing async refinements and transformed outputs, with unexpected exceptions propagated.
- Supported async AJV behavior is tested, or explicitly narrowed with a maintainer-approved public contract and migration note.

Verification: V1 real-library adapter regressions and existing data-router tests; V2; V3 if exported structural types change.

### Task ARH-07: Produce Lossless Validation Pointers

Status: completed

Assigned session: isolated ARH-07 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/validation/parsers.ts` and new `test/validation-arh07.test.ts`.
- Verified: transitive package build; focused validation-arh07/data-router/validation-arh06/validation-error-boundary suites (4 files, 39 tests passed); package typecheck; package suite (46 files, 400 tests passed).
- Result: AJV pointers decode losslessly with escape/empty/numeric preservation, fragment output is escaped/URI-encoded, root versus empty-string property is distinguished, and AJV/Zod/Standard Schema locations align with ordinary output stable.
- Follow-up: none.

Kind: defect

Priority: P2 - diagnostics identify the wrong input field for valid property names.

Suggested agent: validation diagnostics specialist

Dependencies: ARH-06

Primary ownership: `packages/access-router/src/validation/parsers.ts` pointer parsing/formatting and focused diagnostics tests.

Finding / references: AJV pointer parsing drops empty segments, does not decode escapes, and converts numeric-looking keys to numbers (`src/validation/parsers.ts:495-505`). Output joins unescaped segments (`:530-552`), so a property `a/b` looks like two nested properties and `/01` can become `/1`. Existing ordinary-path assertions do not cover these cases (`test/data-router.test.ts:1007-1044`).

Requirements:

1. Decode AJV JSON Pointer segments losslessly and escape output segments according to JSON Pointer rules. Preserve empty and numeric-looking object keys.
2. Retain the package's fragment-form `#` pointer contract and apply required URI-fragment encoding. Distinguish root from an empty-string property and handle an empty missingProperty value.

Acceptance criteria:

- Tests resolve emitted pointers back to the intended fields for `/`, `~`, empty strings, `01`, spaces, Unicode, and array indices.
- AJV, Zod, and Standard Schema report equivalent locations, including nested-body prefixes and root errors.
- Ordinary existing pointer output remains stable where already valid.

Verification: V1 diagnostics and adapter suites; V2.

### Task ARH-08: Make The Export Declaration Smoke Test Real

Status: completed

Assigned session: isolated ARH-08 implementation agent

Completion evidence:

- Changed: `packages/access-router/test/export-contract.test.ts` only.
- Verified: transitive package build; focused export-contract suite (38 passed); packed/strict/export/docs V3 suites (4 files, 61 passed); package typecheck; package suite rerun clean (46 files, 402 tests passed; one transient missing-dist suite failure resolved on rerun).
- Result: the declaration smoke test compiles via in-memory host with loaded-source assertions, retains global/options/missing-file diagnostics, uses supported import boundaries, and negative controls fail for the right reasons without shared temp files.
- Follow-up: none.

Kind: defect

Priority: P2 - false-positive compilation coverage hides actual unsupported imports.

Suggested agent: TypeScript test-harness specialist

Dependencies: none

Primary ownership: `packages/access-router/test/export-contract.test.ts`.

Finding / references: the test declares `snippet` but neither writes it nor supplies it through a compiler host (`test/export-contract.test.ts:322-364`). Missing-root-file diagnostics lack a file and are filtered out. Its unused snippet imports AccessRuntime from `/advanced`, which is not exported (`src/advanced.ts:1-4`). A fixed `/tmp` path can also read unrelated content.

Requirements:

1. Compile the intended snippet using an in-memory host or unique managed fixture. Assert the expected source loaded.
2. Retain global/options/missing-file diagnostics and correct imports to the supported package boundary; do not add an export merely to satisfy the stale test.

Acceptance criteria:

- Negative controls prove nonexistent exports and missing consumer sources fail.
- Valid public imports pass against fresh declarations, without fixed shared temporary filenames or ignored global diagnostics.

Verification: V1 export-contract suite; V3.

### Task ARH-09: Select Format-Correct Published Declarations

Status: completed

Assigned session: isolated ARH-09 implementation agent

Completion evidence:

- Changed: `packages/access-router/package.json` (nested per-condition declarations for all three entrypoints), `test/packed-consumer-compatibility.test.ts` (actual-call ESM/CJS/NodeNext/Bundler consumers with emit+run), and `test/export-contract.test.ts` (nested-shape and recursive dist-resolution expectations).
- Verified: transitive package build; packed-consumer suite (6 passed, including rebuilt `0.99.0-test` artifact after stale-cache refresh); V3 packed/strict/export/docs suites (4 files, 62 passed); package typecheck; package suite (46 files, 403 tests passed).
- Result: strict NodeNext `.mts` consumers resolve `.d.mts` and execute default factory/`createRouter`/helpers; `.cts`/CJS/Bundler resolve `.d.ts`; runtime import/require unchanged and README preferred imports work from packed contents.
- Follow-up: none.

Kind: defect

Priority: P1 - README's preferred default import is unusable in strict NodeNext ESM consumers.

Suggested agent: package compatibility specialist

Dependencies: ARH-08

Primary ownership: `packages/access-router/package.json`, `tsup.config.ts` if necessary, publication-transform expectations, and `test/packed-consumer-compatibility.test.ts`.

Finding / references: each export selects `.d.ts` before import/require (`package.json:26-43`) despite emitting `.d.mts` (`tsup.config.ts:3-17`). Without type:module, NodeNext treats `.d.ts` as CommonJS. An `.mts` consumer importing default acl cannot call `acl.createRouter`; the existing smoke merely places acl in a void array (`test/packed-consumer-compatibility.test.ts:478-494`). This breaks preferred usage documented at `README.md:183-195`.

Requirements:

1. Select ESM and CJS declarations under their respective conditions for all three existing entrypoints; preserve runtime import/require compatibility and publication transforms.
2. Exercise actual calls, not only symbol existence, in packed consumers. Do not switch the entire package module format as a shortcut.

Acceptance criteria:

- Fresh packed `.mts` consumers call the default factory, `acl.createRouter`, and named helpers with strict NodeNext checking and execute successfully.
- `.cts` and Bundler consumers remain functional; tests assert the chosen declaration filenames for root and subpaths.
- README preferred imports work using only packed contents and peers; V3 passes with full declaration checks.

Verification: V3 and V2.

### Task ARH-10: Preserve Model Types Across Public Configuration Forms

Status: completed

Assigned session: isolated ARH-10 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/interfaces/query-types.ts`, `src/interfaces/root.ts`, `src/runtime.ts`, `src/options/model-options.ts`, `src/index.ts`, `src/routers/model-router.ts`, and `test/strict-consumer-types.test.ts`.
- Verified: transitive package build (after `as unknown as` erasure-cast fix); focused strict-consumer suite (1 passed); V3 packed/strict/export/docs suites (4 files, 62 passed); package typecheck; package suite (46 files, 403 tests passed).
- Result: `Model<User>` registers without casts via named/facade/runtime methods with `fromModel` inference, dotted hooks carry `TModel` with unknown-field rejection, and optional/nullable/mixed dotted filters admit valid paths while rejecting invalid paths/leaf values.
- Follow-up: none.

Kind: defect

Priority: P2 - common typed models/configuration require casts or lose inference.

Suggested agent: public TypeScript API specialist

Dependencies: ARH-03, ARH-09

Primary ownership: `packages/access-router/src/index.ts`, `src/runtime.ts` registration signatures, `src/options/model-options.ts`, `src/routers/model-router.ts` factory types, `src/interfaces/root.ts`, `src/interfaces/query-types.ts`, and consumer type fixtures.

Finding / references:

- Registration accepts `mongoose.Model<unknown>`, rejecting ordinary `Model<User>` under strict checking; `fromModel` also disconnects input from result inference (`src/index.ts:250-252`; `src/runtime.ts:199`; `src/options/model-options.ts:47-48`; `src/routers/model-router.ts:61-68`). Passing the same model to runtime.createRouter already works.
- Dotted hook options use bare ModelHook/ModelListHook/ModelDocumentHook instead of their TModel forms (`src/interfaces/root.ts:197-210,242-281`; `src/interfaces/router-hooks.ts:97-100`), unlike ordinary hook options.
- DeepFieldPath stops at optional/nullable containers (`src/interfaces/query-types.ts:115-139,163-174`), rejecting `'profile.email'` for `{ profile?: { email: string } }`. Current strict-consumer nested examples use required containers (`test/strict-consumer-types.test.ts:111-132,160-164`).

Requirements:

1. Preserve model generics at registration/factory boundaries; keep unavoidable heterogeneous registry erasure internal.
2. Thread TModel through every dotted hook equivalent. Reuse existing type definitions where it avoids drift without introducing a type framework.
3. Normalize container nullability during path traversal and review PathValue together; retain precise leaf types and invalid-path rejection.

Acceptance criteria:

- Strict packed consumers register a required-field model through named, facade, and runtime methods without casts; ModelRouter.fromModel infers the corresponding model type.
- Ordinary hooks, dotted options, and router.set forms permit known model fields and reject unknown fields, including list/document hooks.
- Optional/nullable objects, optional record arrays, and mixed containers admit valid dotted filters while nonexistent paths and wrong leaf values fail.
- Supported minimum/current Mongoose peer fixtures exercise registration without broad public any or blanket type assertions masking failures.

Verification: V3, V2, and existing peer matrix via packed-consumer suite.

### Task ARH-11: Avoid Full Dataset Copies On Every Read

Status: completed

Assigned session: isolated ARH-11 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/options/manager.ts` (assignment-time immutable snapshot with frozen-subtree reuse, preserve-key identity, copy-on-write nested set), `src/runtime.ts` (`assign`-based data updates plus `getDataSnapshot`), new `src/options/data-options.ts` snapshot wrapper, `src/services/data-service.ts` (per-service snapshot capture), `test/options-ownership.test.ts`, and `test/data-service-scaling.test.ts`.
- Verified: transitive package build; focused ownership plus scaling suites (2 files, 9 tests passed); package typecheck; package suite (46 files, 407 tests passed; one transient parallel-run strict-consumer flake resolved on rerun).
- Result: 2000-record nested dataset with counting `payload` getter shows repeated first-row `__filter` reads share the frozen snapshot (`snapshotA toBe snapshotB`, `options.data toBe snapshot`, `payloadReads<=READS+2` and `<2000` with zero reads on pure snapshot/options access); input/fetched-snapshot mutation cannot alter served data, decorator/response mutation stays isolated, and replacement leaves in-flight readers coherent. No query-result caching; pagination/filter/sort/totals/hooks intact. Measurement setup and non-gating timing log live in `test/data-service-scaling.test.ts` (`[ARH-11]` console record); no unmeasured throughput gain claimed.
- Follow-up: none.

Kind: improvement

Priority: P2 - established full-data traversal/allocation precedes even one-row reads; latency benefit is unmeasured.

Suggested agent: data ownership/performance specialist

Dependencies: ARH-02, ARH-10

Primary ownership: `packages/access-router/src/options/manager.ts`, `src/runtime.ts` data option access, `src/services/data-service.ts`, `test/options-ownership.test.ts`, and `test/data-service-scaling.test.ts`.

Finding / references: DataService construction fetches data options (`src/services/data-service.ts:41-45`; `src/runtime.ts:552-555`); OptionsManager.fetch recursively copies/freezes the configured data graph (`src/options/manager.ts:10-49,125-133`). ART-10 established snapshot ownership and ART-15 measured page-sized shaping, but existing scaling assertions (`test/data-service-scaling.test.ts:151-157`) do not count this earlier full copy.

Requirements:

1. First measure construction/read traversal and allocations using a representative nested dataset. Record before/after results without claiming an unmeasured throughput gain.
2. Reuse a safe immutable internal snapshot created on assignment/replacement rather than cloning all records per request. Keep public ownership guarantees and function/model identities intact.
3. Preserve in-flight snapshot consistency during replacement; do not introduce query-result caching or expose mutable internal references.

Acceptance criteria:

- Deterministic counters show repeated first-row reads do not recopy every stored payload; include a non-gating timing/allocation comparison where practical.
- Original input/fetched snapshot mutation cannot alter served data, decorators cannot mutate stored records, and replacement leaves in-flight readers on a coherent version.
- Pagination, filters, sorting, totals, and hook behavior remain correct with the ownership/scaling suites passing.

Verification: V1 ownership, hot-path, and scaling suites; V2; record measurement setup/results here.

### Task ARH-12: Remove Processor Argument-Count Limits

Status: completed

Assigned session: isolated ARH-12 implementation agent

Completion evidence:

- Changed: `packages/access-router/src/processors.ts` (iterative single-arg appends) and `test/processors.test.ts` (200k-intermediate regression with ordering/mixed/no-op/mutable/immutable coverage).
- Verified: transitive package build; focused processors plus path-hardening suites (2 files, 39 tests passed); package typecheck; package suite (46 files, 408 tests passed).
- Result: large intermediate arrays complete without variadic argument-limit failure while order, path/mutation semantics, and mutable/immutable equivalence hold; no new traversal budgets added.
- Follow-up: none. Note: similar `push(...x)` sites outside `processors.ts` were left untouched as out of scope.

Kind: defect

Priority: P2 - large nested arrays can trigger incidental engine RangeError.

Suggested agent: processor robustness specialist

Dependencies: none

Primary ownership: `packages/access-router/src/processors.ts` and processor tests.

Finding / references: nested traversal appends `ret.push(...next)` (`src/processors.ts:181-187`), passing one argument per intermediate member. Sufficiently large stored arrays exceed the engine's argument limit before leaf processing. Existing traversal tests use two records (`test/processors.test.ts:51-103`). Exact threshold and remote request reachability were not measured; this is not classified as a demonstrated remote DoS.

Requirements:

1. Append iteratively without variadic calls proportional to array length. Preserve order and existing path/mutation semantics.
2. Do not add arbitrary new traversal budgets as part of this small fix; any request-budget proposal requires separate reachability evidence.

Acceptance criteria:

- A large intermediate array that demonstrates the previous failure completes in supported Node runtimes.
- Mixed intermediates, ordering, no-op behavior, and mutable/immutable value equivalence remain covered.

Verification: V1 `test/processors.test.ts` and `test/processors-path-hardening.test.ts`; V2.

### Task ARH-13: Independently Review And Integrate The Remediation

Status: completed

Assigned session: isolated ARH-13 independent reviewer

Completion evidence:

- Independent static review verdict: ARH-01 through ARH-12 all PASS against acceptance criteria (denial terminal with zero persistence lookup; per-runtime request state; owning-runtime subdocument discovery; final-body mutation dispatch; Yup/Vine operational rethrow; ArkType/AJV/Zod async contracts; lossless pointers; real export smoke test; per-condition `.d.mts`/`.d.ts`; generic model registration/dotted hooks/nullable paths; snapshot reuse; iterative processor appends). No new P0 bypass or error-disclosure found.
- Coordinator-executed serial verification (final tree): V2 package typecheck plus full suite (46 files, 408 tests passed); V3 packed/strict/export/docs suites (4 files, 62 passed); V4 `pnpm build` clean, root `pnpm test` green across all 25 workspace projects (access-router 46 files included), `pnpm lint` clean (0 errors, 0 warnings), `git diff --check` clean. No `CHANGELOG.md` or `dist/` modifications; unrelated baseline modifications left intact.
- Coordinator follow-up FH-01 (harness race, not an implementation defect): `test/strict-typecheck.test.ts` shelled out to `pnpm run typecheck`, whose tsup step cleans `packages/access-router/dist` while parallel sibling tests copy/import `dist`, intermittently flaking consumer suites (`Cannot find module '../dist/index.mjs'`, missing `.d.mts`). The test now invokes `tsc --noEmit -p tsconfig.typecheck.json` directly; the script-string contract assertion is unchanged. Full root suite is green after the fix.
- Independent follow-ups (bounded P2, accepted as non-blocking): D1 `Service.exists` lacks an explicit `false`-filter `403` guard (fail-closed via null, inconsistent with siblings); D2 internal `overrideFilter || genFilter` / `overrideIdFilter || genIDFilter` fallbacks treat explicit `false` as absent (not client-reachable today); D3 async-AJV `data === false`-after-await branch reads `validator.errors` post-suspension (true `$async` AJV rejects instead). Residual risks R1-R5 per reviewer report (library-wrapped operational throws, `isAjvValidationError` shape tolerance, frozen-snapshot mutation discipline, V2/V3/V4 now coordinator-verified).
- Follow-up: D1-D3 tracked above for a future task file; none blocks release.

Kind: improvement

Priority: P1 - combined boundary and consumer changes require independent release verification.

Suggested agent: reviewer who did not implement the main fixes

Dependencies: ARH-01, ARH-02, ARH-03, ARH-04, ARH-05, ARH-06, ARH-07, ARH-08, ARH-09, ARH-10, ARH-11, ARH-12

Primary ownership: this task document, integration evidence, and coordinated release documentation; report independent implementation defects rather than silently broadening ownership.

Finding / references: prior green coverage missed cross-runtime middleware composition, schema result consumption, actual default-import calls, and even an unloaded consumer fixture. Review the concrete references and regressions in ARH-01 through ARH-12, not only test counts.

Requirements:

1. Verify each acceptance criterion against runtime/type evidence, including direct/root paths and negative controls. Confirm no new client-controlled policy bypass or internal-error disclosure.
2. Check exported types, installed README/llms, OpenAPI where relevant, and runtime behavior agree. Check real adapter contracts rather than only structural fakes.
3. Re-run V2, V3, and V4 serially. Record unrelated failures and environmental blockers explicitly; do not report a clean release while required checks remain unverified.
4. Append completion evidence for each task and add bounded follow-ups for independent discoveries. No task completes merely because its code was edited.

Acceptance criteria:

- All preceding tasks have evidence-backed completion, or explicit maintainer-approved deferral with residual risk and release decision. A pending dependency must be formally resolved before this task starts.
- Fresh packed consumers demonstrate correct format resolution and useful inference; runtime tests demonstrate fail-closed behavior across supported paths.
- Full checks pass or integration remains blocked with exact cause/owner. Final diff contains only intended work and no manual generated-output edits.

Verification: V2, V3, V4, and independent evidence review.

## Decisions And Deferrals

- ARH-02 requires a maintainer decision on same-request cross-runtime composition: independent state or explicit rejection. The authorization invariant is non-negotiable; this choice blocks implementation of that task, not the rest of the plan.
- ARH-02 resolution (coordinator, implementation): independent runtime-owned state on a shared request (sequential re-initialization with isolated credentials/cache, never silent combination). Documented with migration impact in README/llms; regressions cover same-field/conflicting-resolver and model/data/root transitions.
- ARH-06 requires an explicit async AJV support decision and real-library-compatible discrimination. Do not infer a full promise contract from structural test doubles.
- ARH-06 resolution (implementation, verified against real installed `ajv`/`arktype`): full AJV contract supported (sync boolean plus mutable `errors` snapshotted before suspension; `$async` promise resolving validated data or rejecting with `ValidationError` carrying `errors`; other rejections propagate). ArkType discriminated via `arkKind`/`' arkKind'` brand plus Standard Schema path. Documented in `fromAjv`/`fromArkType` JSDoc; no narrowed contract or migration note needed.
- No generic feature expansion, wholesale class splitting, new llms document, request cache, or concurrency increase is proposed. Existing docs/entrypoints and adapter seams already provide useful structure; concrete boundary and inference fixes take precedence.
- Dependency vulnerability scanning, production load benchmarks, exhaustive route combinations, and a full optional-validator version matrix remain outside this review. Their absence limits completeness, not the actionable evidence above.

## Definition Of Done

All accepted tasks have observable regression/measurement evidence, public contract updates where needed, and required passing checks. Authorization denials never widen queries; runtime/request ownership is explicit; successful schema output drives dispatch; operational exceptions are not mislabeled as user validation; packed TypeScript consumers execute the documented API. The independent reviewer records any residual risk and release blockers in this file.
