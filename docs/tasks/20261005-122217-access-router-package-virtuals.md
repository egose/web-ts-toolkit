# Access-router package-level virtuals (computed fields)

Created: 20261005-122217

Reviewed and revised: 2026-10-05 12:56:12 PDT

Review revision: added VIRT-00A as a contract-freeze prerequisite and corrected deferred authorization, write/query admission, include join-key lifetime, embedded recursion, public typing, getter isolation, concurrency, and execution gates. Implementation tasks remain pending; review probes are baseline evidence, not feature-completion evidence.

## Objective and scope

Add a package-level computed-field feature (“virtuals”) to `@web-ts-toolkit/access-router` so model authors can define async, request-aware derived output fields that behave like first-class response fields.

Agreed contract (from design discussion — do not regress):

1. One public `select` for persisted and virtual fields; package derives internal fetch vs output plans.
2. Virtual output authorization lives in `permissionSchema` (e.g. `fullAddress: { read: 'canViewAddress' }`).
3. Dependencies (`dependsOn`) are fetched internally even when the caller may not receive them, then stripped unless independently in the original authorized/requested output.
4. Getters run after output `toObject()` / lean normalization, after document-permissions computation (internal, even when response metadata is disabled), with global permissions available; before `decorate` / `decorateAll` / tasks and before final trimming.
5. Every document-bearing public model output is covered with its own model’s definitions, permissions, selection, and effective access: direct `list` / `read` / `create` / `update` / `upsert` / `new`-template outputs, Mongoose `populate` targets, legacy + correlated `include` targets (including nested includes), and embedded-subdocument outputs. Related documents finalize before parent getters run.
6. Target-model post-fetch trimming applies to both `populate` and `include` documents (closing today’s asymmetry: includes trim via target `Service.find/findOne`; populate only restricts query `select`).
7. Embedded scopes are included: e.g. `contacts.sub.displayName`, mirroring `permissionSchema.<field>.sub`. Coverage includes embedded values inside ordinary parent responses, populated/included targets, and dedicated subdocument routes.
8. Plain-object output stage: getters always receive an isolated, stable plain-object view; only returned field values are committed via document-aware helpers; `undefined` omits; failures fail closed; computed values never persist.

Review constraints needed to implement that contract:

- Getter applicability, output-policy access, and document-permissions access are separate inputs. Their operation matrix must be recorded in VIRT-00A before implementing public types or the finalizer.
- Query planning must preserve document-dependent virtual authorization until post-fetch evaluation. Internal fetching is never an output grant.
- Registered virtual names remain virtual even when no getter applies to the current access. They must be excluded from persisted projections, client write admission, and database sort/filter/distinct operations.
- Internal virtual dependencies, include join keys, and correlated-reference snapshots have distinct lifetimes. Preserve association inputs privately without attaching them to finalized output.
- Bound document-level finalization as well as getter-level work. Per-document limits alone do not bound list fan-out.

## Working rules and non-goals

Working rules:

- Reuse the existing option system (`OptionsManager` + `getNestedOption` fallback: exact `virtuals.<name>.<access>` → `virtuals.<name>.default` → bare `virtuals.<name>`), `callHookChain` calling convention (`this` = request, `(value/doc, permissions, context)`), and `getDocValue` / `setDocValue` / `toObject` / `pickDocFields` helpers.
- Prefer the smallest shared enforcement point: one projection planner + one output finalizer used by all document-bearing paths, not per-route edits.
- `genSelect()` keeps its existing persisted-field authorization semantics; the virtual planner separately distinguishes definite denial from document-dependent authorization. Forced dependency fetching must not become a permission grant. Keep fetch-plan vs output-plan separate.
- Preserve Mongoose persistence semantics: no virtual names in DB projections; no writes to `_doc` internals outside helpers; internal snapshots (`originalDocumentSnapshot`, `finalDocumentSnapshot`) keep their lifecycle.
- Respect request-complexity bounds already in the repo (`maxBulkConcurrency`, `maxHookConcurrency`, correlated budgets); bound row-level orchestration and getter work. Do not hold persistence permits while awaiting recursive finalization or application hooks.
- Keep `lean()` behavior explicit: plain `.lean()` drops Mongoose getter virtuals; package virtuals are computed in the output stage for both lean and hydrated results.
- Planner and finalizer must use the same captured virtual-definition/options snapshot for an operation. Mutable configuration must not produce a fetch plan for one descriptor and execute a replacement descriptor on the in-flight document.
- Enforce output-only behavior explicitly before client data reaches persistence, including whole-object/array writes and permissive Mongoose schemas; do not rely on Mongoose strictness to discard virtual names.
- Preserve post-finalization `decorate` / `decorateAll` / tasks as the existing presentation boundary. Their ordinary input must contain no internal-only dependencies; trusted application hooks can deliberately construct new output from trusted context. Do not promise a second authorization pass after those hooks.

Non-goals (do not implement in this phase):

- Auto-running a referenced model’s `decorate` / `decorateAll` on populate/include.
- Writable virtual setters or inverse computations. Reject or strip client virtual keys according to the existing field-admission contract; preventing their persistence is required work, not a deferred non-goal.
- Database sorting, filtering, or distinct evaluation on virtual fields. VIRT-04 must enforce their exclusion without changing supported persisted-field operations.
- `DataRouter` virtuals (revisit only if explicitly requested).
- Dataloader/batching across documents (document N+1 guidance only; per-request caching only if needed for correctness, not as a perf project).
- New export entrypoints (no new `package.json` subpaths).

## Baseline verification

Real repo commands (`AGENTS.md`):

- `pnpm install` — install dependencies.
- `pnpm build` — build all workspace packages (`pnpm -r --if-present build`).
- `pnpm test` — run all workspace tests serially (`--workspace-concurrency=1`; per-package scripts rebuild transitive deps; do not parallelize package builds).
- `pnpm lint` — eslint over the repo.
- Package-level: `pnpm --filter @web-ts-toolkit/access-router... build`, `pnpm --filter @web-ts-toolkit/access-router test` (script = rebuild deps + `vitest run --config vitest.config.ts`), `pnpm --filter @web-ts-toolkit/access-router typecheck` (script = rebuild deps + `tsc --noEmit -p tsconfig.typecheck.json`). Package typecheck covers `src/`, not the strict installed-consumer fixtures.
- Focused tests: build first, then run `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`. Replace the placeholder with the task's actual files; do not rely on `test -- <filter>` shell-script argument forwarding.
- Packaging surface check (per `ai-friendly-ts-package` skill): `npm pack --dry-run` from `packages/access-router` verifies the workspace file inventory only. Run the existing `test/export-contract.test.ts`, `test/documentation-examples.test.ts`, `test/strict-consumer-types.test.ts`, and `test/packed-consumer-compatibility.test.ts` for package-name imports, emitted `.d.ts` / `.d.mts`, and the real publication-manifest transformation.
- Document/patch whitespace check: `git diff --check` for tracked changes; use `git diff --no-index --check -- /dev/null <new-file>` while a file is untracked. Use repo-relative paths and repository-local temporary consumer fixtures per `docs/tasks/README.md`.
- After each implementation task, record the actual focused test filenames and serial build/test commands in completion evidence; run package tests/typecheck at integration-wave boundaries and full workspace checks in VIRT-12. Configuration/unit tasks may use focused checks, but completion never rests on source inspection alone.

Baseline facts (confirmed in code, not hypotheses):

- Public list/read post-fetch pipeline trims parent only: `src/services/service.ts:381-413` (`findOne`), `src/services/service.ts:577-614` (`find`); public `decorate` runs after (`src/services/public-service.ts:46-71`, `167-171`, `229-233`).
- `populate` descriptor building enforces `isAllowed` + ref `genSelect` → `select` + ref `genFilter` → `match`, drops denied entries: `src/core.ts:219-283`. No target-model `trimOutputFields` call for populated docs.
- Legacy/correlated includes dispatch through target `Service.find/findOne` with `lean: true, includePermissions: false, includeFieldPermissions: false`: `src/services/base.ts:514-597`, `675-921` (notably `:530`, `:565`, `:727`, `:806`, `:894`). Those target calls trim internally.
- `Model.find/findOne` builders use bare `.lean()`: `src/model.ts:96-121`. No `lean({ virtuals: true })`.
- Document-aware read/write already exists: `getDocValue` / `setDocValue` / `toObject` / `pickDocFields` in `src/helpers/document.ts:12-66`.
- Hook calling convention is `(value, permissions, context)` with `this` = request: `src/core-shared.ts:257-272`; `decorate` runner populates `context.docPermissions`: `src/core.ts:459-478`.
- Option storage uses `OptionsManager.get/set` + `getNestedOption` fallback: `src/options/manager.ts:83-170`; model setters use `setOption.bind(this, key)`: `src/routers/model-router.ts:29-36`, e.g. `decorate` at `:322-336`; mutation guard for build-time keys: `src/routers/router-mutation.ts:1-29`.
- `permissionSchema` metadata refreshes on `permissionSchema` / `modelPermissionPrefix` changes: `src/runtime.ts:440-453`; classification logic: `src/runtime.ts:99-155`.
- Subdocument outputs have separate paths (`listSub`/`readSub`/mutation visibility): `src/services/model-subdocument-service.ts:32-127`, routes in `src/routers/model-router-subdocument-routes.ts:1-217`.
- `new` template output path: `src/services/service.ts:826-853` (trim before doc-permissions there — note ordering difference; the current implementation also ignores `args.select`).
- `delete` returns only `_id`: `src/services/service.ts:1077-1117`. `distinct`/`count` return scalars/counts: `:1149-1210`.
- Projection identity contract (`_id` retained on inclusion, stripped on explicit `-_id`): `test/arc21-projection-identity-and-count-argument.contract.test.ts:94-160`.
- Hook typing precedent (`ModelHook`, `ModelListHook`, dotted keys, `@ts-expect-error` unknown fields): `test/strict-consumer-types.test.ts:268-358`.
- Package publishes `.`, `./advanced`, `./processors` with `dist` + `README.md` + `llms.txt` in `files`; peers `express`, `mongoose`: `packages/access-router/package.json:23-94`.
- Query-stage `genSelect(..., false)` knows global grants only, while `genAllowedFields` also considers document grants: `src/core.ts:150-217`. Populate uses the former at `:272`; document-dependent virtual eligibility cannot be decided by that call alone.
- Legacy list includes index target rows after target `find` returns: `src/services/base.ts:565-574`. A target foreign key omitted by selection is unavailable for matching unless separately retained internally.
- Client create/update admission uses `genAllowedFields` and `pick`: `src/services/service.ts:705-708,925-928`. Sort and distinct policy also use permission-derived fields: `:301,486,1153-1165`; adding a virtual rule must not implicitly authorize a persisted write/query field.
- Parent `pickAllowedFields` selects top-level authorized containers without traversing their `.sub` policy: `src/core.ts:169-188`, `src/core-shared.ts:274-313`. VIRT-06 must explicitly cover recursive embedded finalization.
- `getModelAtt()` is derived from top-level `keys(schema.obj)`: `src/runtime.ts:626-645`. It is not a comprehensive scoped schema-path collision validator.
- Select validation currently accepts arbitrary strings: `src/validation/common.ts:26-28`, `src/validation/model-router.ts:20-34,69-94`; stricter path grammar is a new contract, not existing behavior to preserve.
- `Service.find` runs per-row output work through unbounded `Promise.all`: `src/services/service.ts:577-614`. Existing data-service row limits provide a precedent, not an existing model-service guarantee.
- Typed `permissionSchema` keys come from the persisted `TModel`; literal selected-output typing also picks from `TModel`: `src/interfaces/root.ts:243-251`, `src/interfaces/query-types.ts:55-76`. Virtual output shape needs explicit type propagation.

Review verification (2026-10-05): six focused in-memory runtime/type probes against the existing `dist` confirmed query-stage vs document-grant differences, permissive-schema admission, include key loss after projection, arbitrary select-string acceptance, virtual-like fields reaching sort/filter/distinct adapter calls, row fan-out, and top-level-only embedded trimming. The TypeScript probe produced an unused `@ts-expect-error` for `Record<string, unknown>` getter input and rejected a virtual permission-schema key absent from the persisted model. Probes used mocked adapters/in-memory documents; no actual stored-write guarantee or feature implementation was verified. Full build/test/lint were not run during the review.

Related task records: `docs/tasks/20260912-181841-access-router-correlated-includes.md` and `docs/tasks/20260919-145743-access-router-business-boundary-review.md`. Preserve their join, snapshot, permission-metadata, and mutation-visibility regressions.

Plan-revision evidence (2026-10-05):

- Changed only this task document; the plan now contains 14 uniquely identified tasks across 8 waves, including VIRT-00A.
- Reviewed every dependency against the scheduling guidance; the graph is acyclic, with VIRT-00A gating implementation and VIRT-12 requiring all tasks/follow-ups.
- Verified whitespace with `git diff --no-index --check -- /dev/null docs/tasks/20261005-122217-access-router-package-virtuals.md` and checked for machine-specific paths/stale contradictory requirements.
- Package build/test/lint were not rerun for this documentation-only revision. Runtime feature tasks and the VIRT-00A decision record remain pending.

## Priority/severity definitions

- P0: contract-breaking, security-relevant, or blocks all later tasks (planner, finalizer, populate/include trimming symmetry).
- P1: required coverage for the agreed “all document-bearing outputs” guarantee (operations, subdocuments, root/batch parity).
- P2: incremental consumer documentation, packaging evidence, and performance guidance. Required authorization, write isolation, collisions, errors, and bounds belong in P0/P1 implementation tasks; P2 does not defer those guarantees.

## Ordered waves

- Wave 0: VIRT-00 baseline characterization, then VIRT-00A contract freeze (no behavior change yet).
- Wave 1: VIRT-01 option/type plumbing + configuration validation, VIRT-02 projection planner, VIRT-03 isolated/bounded shared output finalizer.
- Wave 2: VIRT-04 direct operation integration and explicit output-only write/query enforcement.
- Wave 3: VIRT-05 related-document coverage and private include join-key transport.
- Wave 4: VIRT-06 recursive embedded scopes + subdocument routes + mutation visibility.
- Wave 5: VIRT-07 route/root parity and VIRT-09 boundary hardening after their dependencies; VIRT-08 validation/OpenAPI may start after VIRT-02.
- Wave 6: VIRT-11 performance evidence, then VIRT-10 final public surface, packaging, docs, and compatibility notes.
- Wave 7: VIRT-12 final independent integration review.

## Detailed executable tasks

### Task VIRT-00: Baseline characterization tests (no behavior change)

Status: completed

Priority: P0

Suggested agent: test engineer

Dependencies: none

Primary ownership:

- `packages/access-router/test/virtuals-baseline.contract.test.ts` (new)

Source paths below are references only for this test-only task.

Finding:

Today `include` targets trim via target `Service.find/findOne`, while `populate` targets only get query-level `select`/`match` with no target-model post-fetch trim. There is also no package `virtuals` option. This task pins that asymmetry plus projection-identity basics before changing behavior.

References:

- `packages/access-router/src/core.ts:219-283`
- `packages/access-router/src/services/base.ts:514-597`
- `packages/access-router/src/services/service.ts:381-413,577-614`
- `packages/access-router/test/arc21-projection-identity-and-count-argument.contract.test.ts:94-160`

Implementation requirements:

1. Add a contract test file only; do not change runtime behavior.
2. Use a fixture that distinguishes query projection from trimming: configure an internal target field outside its `permissionSchema` in `alwaysSelectFields.read` / `.list`. Show that it is fetched and appears in populated output today, while target `Service.find/findOne` removes it from include output. Also retain a control showing ordinary unforced denied fields are query-restricted.
3. Use isolated runtime + unique model names per existing integration-test precedent; restore global options and clear openapi routes after each test.
4. Cover inclusion `select: ['name']` retaining `_id` and explicit `['name','-_id']` stripping `_id` (mirror ARC-21 on a fresh model to avoid coupling).
5. Keep the initial asymmetry characterization as historical completion evidence. VIRT-05 must update its live assertion to the intended symmetric contract; do not retain a test requiring the old leakage after integration.

Acceptance criteria:

- New test file passes on the unchanged implementation and explicitly asserts the populate-vs-include trimming asymmetry.
- After `pnpm --filter @web-ts-toolkit/access-router... build`, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-baseline.contract.test.ts` passes.
- No source files under `src/` modified.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/test/virtuals-baseline.contract.test.ts` (new, 7 tests; no `src/` changes, no `CHANGELOG.md` changes).
- Fixture: isolated `createAccessRuntime()` + unique `Virt00*` model names per test; global options restored and both runtime/default openapi routes cleared in `afterEach`; `mongoose.deleteModel(/Virt00.*/)`.
- Asymmetry pinned: target `internalNote` outside `permissionSchema` but forced via `alwaysSelectFields.read/.list` appears in populated output (default read access, explicit list access, and single-read with requested `secret` stripped as control), while legacy `include` op `read`/`list` targets drop it via target `Service.findOne`/`find` trim. Unforced denied `secret` is query-restricted in all paths.
- Projection identity on a fresh model: `select: ['name']` retains `_id`; `select: ['name','-_id']` strips `_id` (mirrors ARC-21 without coupling).
- Verification (serial): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-baseline.contract.test.ts` → 1 file, 7 tests passed. `git status` shows only the new test file + this task document; `git diff --no-index --check` reports no whitespace errors.
- Follow-ups: VIRT-05 must update the populate-leakage assertions to the symmetric trim contract (historical asymmetry kept here as evidence only).

---

### Task VIRT-00A: Freeze access, typing, scope, and isolation contracts

Status: completed

Priority: P0

Suggested agent: implementation coordinator / typescript api designer

Decision owner: maintainer with the implementation coordinator

Dependencies: VIRT-00

Primary ownership:

- This task document (record concrete decisions and examples)
- `packages/access-router/src/interfaces/root.ts`, `router-hooks.ts`, `query-types.ts` (read-only design references)
- `packages/access-router/src/services/service.ts`, `public-service.ts`, `model-subdocument-service.ts` (read-only lifecycle references)

Finding:

The initial plan passed a single `access` into the finalizer, proposed an untyped getter view while requiring unknown-field type errors, and deferred upsert mapping beyond the task that needed it. Mutation output already uses different getter/hook and field-policy accesses. Embedded scopes have no existing independent document-permissions hook contract. These are implementation prerequisites, not final-review choices.

References:

- `packages/access-router/src/services/service.ts:381-413,765-780,826-853,920-928,964-990`
- `packages/access-router/src/services/public-service.ts:85-97,245-264,279-314`
- `packages/access-router/src/services/model-subdocument-service.ts:32-127,276-291`
- `packages/access-router/src/interfaces/root.ts:243-251`
- `packages/access-router/src/interfaces/query-types.ts:55-113`

Implementation requirements:

1. Record separate `virtualAccess`, `outputAccess`, and `docPermissionsAccess` for every output path. Preserve `context.operation` as the initiating operation rather than overloading it with read visibility. Resolve the proposed matrix below, including subdocument mutations returning existing rows.
2. Freeze scope-aware context: identify the receiving model, definition/permission `scopePath` (e.g. `['contacts','sub']`), all three accesses, and internal document permissions. For embedded outputs, choose and document the source of grants; the recommended v1 contract reuses the owning parent's internally computed grants with scoped field rules, rather than adding unrelated scoped hooks.
3. Choose and exemplify public generic propagation for persisted getter inputs and virtual output shape through `createRouter` / `ModelRouter` / `getPublicService` / literal selected results. Preserve existing single-model generic usage and persisted unknown-field errors. Model computed output properties as optional because authorization, missing dependencies, `undefined`, and errors can omit them. Do not add virtual properties to persisted `Filter<TModel>` or write types just to make response typing work.
4. Freeze the getter view/commit contract: getters see an isolated snapshot of persisted dependency values and already-finalized related/embedded outputs; sibling virtual values are not completion-order inputs. Mutating getter input cannot change response data or lifecycle snapshots, and only returned values are committed. Record how mutable leaf values such as `Date`, buffers, and returned object values are isolated without JSON cloning.
5. Freeze dependency semantics: `dependsOn` is an array of top-level persisted names relative to the definition's scope; reject dotted paths and virtual-to-virtual dependencies in v1. Define absence vs present `null` / `0` / `false`; only an absent required dependency omits the getter. Parent getters can read finalized related objects, but cannot rely on a related model's stripped private fields.
6. Freeze selection behavior at mutation boundaries. Current public create/update callbacks select after decorate/tasks and their internal argument types omit `select`; `_update(returningAll: false)` has an additional implicit selection, and `new()` currently ignores `args.select`. Record how effective virtual selection reaches the finalizer before evaluation while preserving established presentation semantics or explicitly documenting intentional contract changes. Dependencies fetched only for virtuals must not reach decorate/tasks as ordinary fields.
7. Define `maxHookConcurrency` scope and a deadlock-free row/getter scheduling strategy. The minimum required behavior bounds active getter work across a top-level list rather than multiplying the limit by row count; nested include/populate/embedded work must have a documented finite bound. Do not reuse leaf persistence admission for recursive orchestration. Use stable input order/output association regardless of completion order.
8. Resolve the validation compatibility choice: arbitrary select strings are currently accepted. Either preserve that grammar and safely handle registered virtuals, or specify a new signed-field/path grammar and controlled errors across direct/root/service entrypoints. A stricter grammar requires compatibility notes and dedicated regression coverage.

Proposed access matrix — not yet a recorded maintainer decision:

| Output path                                    | `virtualAccess`                                                        | `outputAccess`                      | `docPermissionsAccess` / grant source         |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| list / read using list fallback                | `list`                                                                 | `list`                              | `list`                                        |
| read / readFilter                              | `read`                                                                 | `read`                              | `read`                                        |
| create / create branch of upsert               | `create`                                                               | `read`                              | `create`                                      |
| update / update branch of upsert               | `update`                                                               | `read`                              | `update`                                      |
| new template                                   | `create`                                                               | `create`                            | `create`                                      |
| populated target                               | target's effective `read` / `list`                                     | same target access                  | same target access                            |
| included target                                | include `op` (`read` / `list`)                                         | same target access                  | same target access                            |
| embedded values inside a model output          | owning output's getter access                                          | owning output's field-policy access | owning document's internal grants             |
| listSub / readSub                              | `list` / `read`                                                        | `list` / `read`                     | proposed owning-parent `read` grants; confirm |
| createSub / updateSub / bulkUpdateSub response | proposed `create` / `update` / `update`; confirm existing-row behavior | `read`                              | proposed owning-parent `read` grants; confirm |

Acceptance criteria:

- The matrix, embedded grant source, typed API examples, dependency semantics, selection/presentation ordering, concurrency scope, and validation choice are recorded here as concrete decisions; no unresolved choice is carried into VIRT-01–VIRT-06.
- A typed persisted model lacking `fullAddress` has a specified valid virtual definition + permission-schema + selected-output example, with a negative unknown persisted getter-field example.
- A create-only/update-only getter and a read-visible/read-denied virtual have unambiguous expected mutation-response behavior.
- No runtime behavior is changed by this task. VIRT-01 remains gated until these decisions are recorded.

Decision record: recorded 2026-10-05 (maintainer with implementation coordinator). This record is normative for VIRT-01–VIRT-06; no unresolved choice is carried forward.

D1 — Access matrix (resolved). The proposed matrix is CONFIRMED with the `context.operation` and subdocument clarifications below. `context.operation` always carries the initiating public operation (`list` | `read` | `create` | `update` | `upsert` | `new` | `subList` | `subRead` | `subCreate` | `subUpdate` | `subBulkUpdate`) and is never overwritten with fallback/effective visibility; the three accesses below carry effective visibility. `tryList` fallback keeps `operation: 'read'` while all three accesses become `list`. Upsert keeps `operation: 'upsert'` while the three accesses follow the taken branch.

| Output path                                                                     | `virtualAccess`                           | `outputAccess`                      | `docPermissionsAccess` / grant source  |
| ------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- | -------------------------------------- |
| list                                                                            | `list`                                    | `list`                              | `list`                                 |
| read / readFilter (incl. `read` using `list` fallback: all three become `list`) | `read` (or fallback `list`)               | same                                | same                                   |
| create / create branch of upsert                                                | `create`                                  | `read`                              | `create`                               |
| update / update branch of upsert                                                | `update`                                  | `read`                              | `update`                               |
| new template                                                                    | `create`                                  | `create`                            | `create`                               |
| populated target                                                                | target's effective `read` / `list`        | same target access                  | same target access                     |
| included target (legacy + correlated, incl. nested)                             | include `op` (`read` / `list`)            | same target access                  | same target access                     |
| embedded values inside a model output                                           | owning output's getter access             | owning output's field-policy access | owning document's internal grants (D2) |
| listSub / readSub                                                               | `list` / `read`                           | `list` / `read`                     | owning-parent internal `read` grants   |
| createSub / updateSub / bulkUpdateSub response (existing rows post-save)        | initiating `create` / `update` / `update` | `read`                              | owning-parent internal `read` grants   |

Rationale/mapping to current lifecycle (read-only references): top-level `create` already computes doc permissions with `create` and trims with `read` (`service.ts:765-780`); `updateOne` already uses doc permissions `update` and trims with `read` (`service.ts:964-990`); `new()` already trims/computes with `create` (`service.ts:826-853`); subdocument mutation visibility already checks `read` + `subs.<sub>.read` (plus `subs.<sub>.list` for the full-array create response) against post-save existing rows and hides denied rows rather than erroring (`model-subdocument-service.ts:32-72`). The v1 rule therefore is: write-initiated virtual applicability (`create`/`update`) decides which getter runs, while output visibility and row filtering stay `read`-family. Subdocument writes additionally require parent `update` access for the write itself (`getParentDoc` `access: 'update'`); output visibility reuses the parent internal `read` grants, never a separate embedded hook family. Denied subdocument-mutation rows are omitted (`[]` / `null`), consistent with existing `visibleMutationRows` behavior.

D2 — Scope-aware context (frozen). The finalizer receives an explicit scope-aware context extension of `ModelHookContext`: `{ receivingModelName, scopePath, virtualAccess, outputAccess, docPermissionsAccess }` plus the already-computed internal document permissions for the owning document. `scopePath` is the definition/permission path segments (e.g. `[]` at root, `['contacts','sub']` for `contacts.sub.displayName`); `dependsOn` names (D5) resolve relative to that scope. Embedded outputs reuse the owning parent's internally computed grants with the scope's `permissionSchema.<field>.sub` rules; v1 adds NO independent embedded `docPermissions` hook family and NO scoped `decorate`/`transform` family for embedded writes. Dedicated subdocument routes obtain grants from the parent read lookup (`genFilter('read', id)` + `findRawParentDoc`) combined with `subs.<sub>.read`/`.list` row filters; they never substitute the finalized/trimmed parent DTO for the raw parent document.

D3 — Public generic propagation (frozen) + concrete typed example. Single-model generic usage is preserved: `createRouter<TModel>`, `ModelRouter<TModel>`, `getPublicService<TModel>` each gain an optional second generic for computed outputs, defaulting to an empty mapping so existing call sites are unaffected. Typed getters receive a partial read-only persisted view of their scope (`Readonly<Partial<...>>` over persisted fields only, never `Record<string, unknown>` for a known model); untyped consumers keep an explicit loose fallback. `permissionSchema` keys widen to persisted keys plus registered virtual names (`AccessRouterFieldKey<TModel> | Extract<keyof TVirtuals, string>`). Selected virtual outputs are optional (`Partial`/`?`) because authorization, absent dependencies, `undefined`, and fail-closed errors can omit them. Virtual names are NEVER added to persisted `Filter<TModel>`, sort/distinct inputs, or client write types.

Valid example — persisted `User` has NO `fullAddress` field:

```ts
interface User {
  name: string;
  address: string;
}
interface UserVirtuals {
  fullAddress: string;
}

const router = createRouter<User, UserVirtuals>('User', {
  permissionSchema: {
    name: { read: true },
    address: { read: 'canViewAddress' },
    fullAddress: { read: 'canViewAddress' }, // virtual permission-schema key typechecks
  },
  virtuals: {
    fullAddress: {
      dependsOn: ['address'],
      read: async function (doc, _permissions, _ctx) {
        // doc: Readonly<Partial<Pick<User, 'name' | 'address'>>> — typed persisted view
        if (doc.address === undefined) return undefined;
        return `addr:${doc.address}`;
      },
    },
  },
});

// Selected output: { name: string; fullAddress?: string } — virtual is optional.
const svc = getPublicService<User, UserVirtuals>('User');
const res = await svc._read('id1', { select: ['name', 'fullAddress'] as const });
```

Negative example — unknown persisted getter field is a type error (and a v1 configuration rejection at runtime):

```ts
virtuals: {
  // @ts-expect-error 'addres' is not a persisted field of User
  fullAddress: { dependsOn: ['addres'], read: async (doc) => String((doc as never as { addres?: string }).addres) },
}
// Getter body: doc.addres is likewise a type error — doc only exposes keyof User.
```

Create-only/update-only vs read-visible/read-denied (unambiguous expected behavior):

- Create-only getter (`virtuals: { receipt: { dependsOn: [...], create: getter } }`, no `read`/`list` entry): applicable on create/upsert-create responses (`virtualAccess: 'create'`) subject to the `receipt` permission rule evaluated with `create` doc grants; on every `read`/`list`/`update` response there is no applicable getter, so `receipt` stays a registered virtual — it is omitted from output AND never enters persisted projections, write admission, or sort/filter/distinct handling.
- Update-only getter: mirror image (`update` entry only); applicable on update/upsert-update responses only.
- Read-visible virtual (`permissionSchema: { fullAddress: { read: 'canViewAddress' } }` granted for the document): present in `read` AND in mutation responses (mutations use `outputAccess: 'read'`), provided an applicable getter exists for that response's `virtualAccess` (`read` getter for reads, `create`/`update` getter for mutation responses — use `default` to cover all).
- Read-denied virtual (explicit deny, or document grants fail the rule): the getter NEVER runs on any path; the field is omitted even when explicitly selected; its `dependsOn` fields are not fetched for it (explicit deny fetches nothing — contrast D5 document-dependent deferral which retains fetches until post-fetch evaluation).

D4 — Getter view/commit contract (frozen). Each getter receives an isolated plain-object snapshot containing (a) its scope's persisted dependency values and (b) already-finalized related/embedded outputs for that scope. Sibling virtual values are NOT visible regardless of completion order; related documents finalize before parent getters run. Mutating the getter's input object cannot change response data, lifecycle snapshots (`originalDocumentSnapshot` / `finalDocumentSnapshot` / `currentDocument`), or any other row's output. Only the returned field value is committed; `undefined` omits the field; a throw/failure omits the field fail-closed and emits a structural log with no raw values or secret-bearing text. Isolation without JSON cloning: start from `toObject({ virtuals: false })` (or the lean plain object), then recursively isolate plain objects/arrays by copy; clone mutable leaves with their own constructors (`Date` → `new Date(t)`, `Buffer` → `Buffer.from`, `ObjectId`/BSON → dedicated clone preserving equality semantics); returned object values are likewise deep-isolated before commit so later caller/decorate mutation cannot alias getter internals.

D5 — Dependency semantics (frozen). `dependsOn: string[]` lists top-level persisted field names relative to the definition's scope (e.g. `['displayName']` inside `contacts.sub`, not `['contacts.sub.displayName']`). v1 REJECTS dotted paths and virtual-to-virtual dependencies at configuration time (validated against the real receiving Mongoose schema/child scope, not `getModelAtt()` top-level keys alone). Absence = key missing or value `undefined` → a required absent dependency omits the getter (field omitted, no error). Present `null` / `0` / `false` / `''` are NOT absence — the getter runs. Parent getters may read finalized related objects present in their snapshot, but MUST NOT rely on the related model's stripped private fields (target post-fetch trim applies to populate AND include per the agreed contract; a dependency on a stripped field behaves as absent).

D6 — Selection at mutation boundaries (frozen, no silent contract change). Effective virtual selection is computed BEFORE virtual evaluation and carried on the internal plan into the shared finalizer; virtual evaluation runs BEFORE `decorate` / `decorateAll` / tasks (the existing presentation boundary). Internal-only dependency fields fetched solely for virtuals are stripped before `decorate`/tasks see the object; trusted hooks may deliberately construct new output from trusted context (existing boundary, no second authorization pass promised after those hooks). Established presentation semantics are PRESERVED exactly: public `_create` picks by explicit `select` after decorate/tasks (`public-service.ts:85-97`); public `_update` picks by explicit `select`, else by the implicit `returningAll: false` pick of `Object.keys(data) + _id` (`public-service.ts:245-264`); internal create/update argument types omit `select` today, so VIRT-04 extends internal plan transport deliberately rather than assuming it exists. `new()` ignores `args.select` today and CONTINUES to ignore it in v1 (all applicable `create` virtuals considered, subject to explicit exclusion); any future honoring of `new.args.select` requires an explicit contract change plus VIRT-10 compatibility notes — VIRT-04 must not introduce it silently.

D7 — `maxHookConcurrency` scope + deadlock-free strategy (frozen). `maxHookConcurrency` (default 10, `request-complexity.ts:37`) is a per-request/per-runtime ceiling on concurrently awaited virtual/getter + row-finalization work, NOT a per-row multiplier and NOT a process-wide connection limit. Minimum required behavior: a top-level list finalizes rows through ONE bounded map (`mapWithConcurrencyLimit` / `RequestConcurrencyScheduler.map` worker-pool shape, stable index-keyed results preserving input order regardless of completion order) so active getter work is bounded by the limit, never `rows × getters` unbounded `Promise.all`. Nested include/populate/embedded/descendant work uses bounded child maps with a finite bound derived from the same limit (sequential or sub-pooled traversal); recursion depth is additionally bounded by `maxCorrelatedDepth` and per-request correlated budgets. Recursive orchestration NEVER holds leaf persistence permits (`RequestConcurrencyScheduler.work`, which admits only leaf adapter/document persistence ops) while awaiting descendant finalization or application hooks — maps bound their own orchestration workers and release before awaiting children, so limit-1 configurations complete. Getters' own trusted direct DB/network I/O is outside the leaf persistence ceiling and must be described accurately in VIRT-10/VIRT-11 guidance (no dataloader/batching in v1; measured N+1 guidance instead).

D8 — Validation grammar choice (frozen): PRESERVE current arbitrary-string acceptance. `projectionSchema` / `stringOrStringArray` (`validation/common.ts:28-86`) and `parseSelectParam` comma/space/repeated forms (`helpers/query.ts:73-78`) keep accepting arbitrary string field names; adding virtual names requires NO whitelist loosening and NO stricter signed-field/path grammar in v1. Consequently there is NO new malformed-path rejection guarantee and NO compatibility break to note for select grammar. Registered-but-inapplicable virtual names remain virtual (excluded from persisted projections, client write admission, and DB sort/filter/distinct); unregistered names follow existing persisted-field policy; virtual sort/filter/distinct exclusion is enforced centrally at the model-aware service boundary in VIRT-04 (route schemas only forward attempts there, never duplicate DB field policy). OpenAPI v1 uses the existing open-object/unknown-value capability with documented optional virtual fields; no virtual schema language, no getter execution for spec generation.

Completion evidence (2026-10-05):

- Changed files: only this task document (VIRT-00A section: `Status: completed`, normative D1–D8 decision record above). No `src/` changes, no test changes, no `CHANGELOG.md` changes.
- Design references re-read before recording: `src/interfaces/root.ts:243-360`, `src/interfaces/router-hooks.ts`, `src/interfaces/query-types.ts:55-113`, `src/interfaces/base.ts` (`ModelHookContext.operation`), `src/core.ts:150-283,346-367` (select/populate planning, doc-permissions fail-closed), `src/services/service.ts:200-279,381-413,765-780,826-853,920-990` (find/findOne/create/new/update lifecycles), `src/services/public-service.ts:85-97,245-314` (mutation presentation selection), `src/services/model-subdocument-service.ts:28-72,276-291` (existing-row mutation visibility), `src/request-complexity.ts`, `src/helpers/concurrency.ts`, `src/helpers/query.ts:73-95`, `src/validation/common.ts:28-86`.
- `git status` verified to show only this task file modified (see verification command output).

---

### Task VIRT-01: Virtual definition types + router option plumbing

Status: completed

Priority: P0

Suggested agent: typescript api designer

Dependencies: VIRT-00A

Primary ownership:

- `packages/access-router/src/interfaces/router-hooks.ts`
- `packages/access-router/src/interfaces/root.ts`
- `packages/access-router/src/interfaces/query-types.ts`, `base.ts`
- `packages/access-router/src/routers/model-router.ts`
- `packages/access-router/src/runtime.ts:426-504`
- `packages/access-router/src/index.ts` (initial public type re-exports only)
- `packages/access-router/src/filter-type-tests.ts`, `test/strict-consumer-types.test.ts`

Finding:

There is no `virtuals` model option. Existing hooks use `X | Record<string, X>` plus dotted extended keys (e.g. `decorate`, `decorateAll` at `src/interfaces/root.ts:266-267,337-343`) and `setOption.bind(this, key)` setters (`src/routers/model-router.ts:322-336`).

References:

- `packages/access-router/src/interfaces/router-hooks.ts:35-44,99-100`
- `packages/access-router/src/interfaces/root.ts:243-289,315-360`
- `packages/access-router/src/routers/model-router.ts:29-36,153-184,322-336`
- `packages/access-router/src/options/manager.ts:83-170`

Implementation requirements:

1. Implement the typed getter/descriptor/output generics decided in VIRT-00A, plus per-access records (`default` + `list`/`create`/`read`/`update`; NOT `delete`/`distinct`/`count`) and recursive embedded `sub` scopes. Typed getters use a partial/read-only persisted view for their scope, not `Record<string, unknown>` for a known model; untyped consumers retain an explicit loose fallback.
2. Add `ModelRouterOptions.virtuals`, typed virtual permission-schema keys, and `ExtendedModelRouterOptions` dotted keys (`virtuals`, `virtuals.<name>`, `virtuals.<name>.<access>`, `virtuals.<field>.sub...`). Propagate optional computed output shape into router/service literal-select types without widening unrelated persisted getters, filters, or inputs.
3. Add `ModelRouter.virtuals` setter via `setOption.bind(this, 'virtuals')`; keep `virtuals` mutable post-construction (not a build-time key in `src/routers/router-mutation.ts`).
4. Getter signature follows VIRT-00A: `(doc: <typed isolated persisted view>, permissions: AccessRouterPermissions, context: <scope-aware ModelHookContext extension>) => MaybePromise<TValue | undefined>` with `this: ModelRequest`. Getter returns a field value rather than a replacement document. Re-export the new public types from the root; `./advanced` already exports interfaces and must stay consistent.
5. Validate configuration before committing `setModelOptions` / `setModelOption` / constructor changes: callable getter, supported access keys, array `dependsOn`, top-level output/dependency names, no virtual-to-virtual dependencies. Inspect the actual receiving Mongoose schema and child scopes to reject stored-path collisions; `getModelAtt()` alone is insufficient. Validate protected permission-field equal/ancestor/descendant overlaps, `_id`/reserved internal paths, and dotted definition names. Embedded scope-container names are not virtual-leaf collisions.
6. Support exact → `.default` → bare descriptor resolution without interpreting an access-record object as a getter descriptor when the access is absent. An inapplicable registered name remains a virtual, never a persisted field. Revalidate related configuration changes such as `documentPermissionField`, and preserve the previous valid configuration if a mutation is rejected.
7. Preserve frozen option ownership and descriptor/function identities; define removal/replacement behavior and capture coherent options for in-flight planning/finalization. Request-controlled include collisions are validated by VIRT-05, not guessed at router construction.

Acceptance criteria:

- `typedRouter.virtuals({...})`, `typedRouter.set('virtuals.fullAddress.read', {...})`, constructor definitions, virtual permission-schema keys, and selected optional virtual outputs all typecheck for a persisted model without virtual fields. Unknown persisted getter fields produce the intended `@ts-expect-error`, including dotted setters.
- `getModelOption(model, 'virtuals.fullAddress.read')` resolves exact → `.default` → bare per `getNestedOption`.
- Configuration tests cover malformed descriptors, dotted/non-array dependencies, unsupported accesses, root/embedded schema collisions, metadata-path overlaps, rejected-mutation rollback, and immutable descriptor snapshot replacement. Operation-level in-flight plan/getter consistency is verified once VIRT-04 integrates the planner/finalizer.
- `pnpm --filter @web-ts-toolkit/access-router typecheck` and focused `test/strict-consumer-types.test.ts` / configuration tests pass after a serial build. Inspect both emitted `.d.ts` and `.d.mts` for the new API.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/interfaces/router-hooks.ts` (ModelVirtualAccess/RecordAccess/Context/Doc/Getter/Descriptor/AccessRecord/Leaf/Virtuals/SubModel + JSDoc), `src/interfaces/root.ts` (ModelRouterOptions.virtuals + TVirtuals, permissionSchema widening, Extended dotted `virtuals.${string}` + specific `virtuals.<K>`/`<K>.<access>` overloads), `src/interfaces/query-types.ts` (WithVirtuals/PublicOutput/SelectedPublicOutput/SelectedPopulatedPublicOutput with optional TVirtuals), `src/routers/model-router.ts` (TVirtuals + virtuals setter via setOption.bind, mutable, specific set() overloads), `src/runtime.ts` (validate-before-commit for setModelOptions/setModelOption/constructor + documentPermissionField revalidation + rollback + exact→default→bare resolver without record-as-descriptor + isVirtualField/getVirtualNames + coherent frozen snapshots), `src/services/base.ts/service.ts/public-service.ts` + `src/core.ts` + `src/options/model-options.ts` + `src/index.ts` (TVirtuals propagation + root re-exports; ./advanced stays consistent via interfaces barrel), `src/filter-type-tests.ts` (D3 valid/descriptor/embedded/optional-output/filter-narrowing + @ts-expect-error), `test/strict-consumer-types.test.ts` (ARF-14 packed-consumer virtuals: constructor/virtuals()/dotted set/permission keys/optional outputs + dotted @ts-expect-error + filter narrowing), `test/virtuals-config.contract.test.ts` (new, 8 tests).
- Frozen contracts respected: D1 matrix carried in ModelVirtualContext (operation stays initiating, three accesses effective); D2 scopePath + receivingModelName + grant reuse (no new embedded hook family); D3 generics default Record<never,never> so existing call sites unaffected, getters use Readonly<Partial<...>> (never Record for known), permissionSchema widens only, outputs Partial/optional, filters/inputs unwidened; D4 signature (doc/permission/context, this: ModelRequest, value not doc); D5 relative top-level dependsOn, dotted + virtual-to-virtual rejected vs real schema/child scopes; D6 selection/presentation untouched (no planner/finalizer yet); D7/D8 untouched (no bounds/grammar change, virtuals stay output-only, no new subpaths).
- Validation: callable getter, supported default+list/create/read/update (reject delete/distinct/count/unknown), array dependsOn, top-level names, no virtual-to-virtual, real Mongoose schema.paths/obj + child .schema/nested children (not getModelAtt alone), permission-field equal/ancestor/descendant via get/set probes, \_id/\_\_v/id/$-prefix/dangerous/pattern + dotted names, containers ({sub} only, must be existing embedded, not leaf collisions). Revalidates documentPermissionField changes; rejected mutations throw before manager.set/assign, preserving previous frozen config. Removal via undefined + replacement swaps frozen root (copy-on-write), function identities preserved (non-plain by reference), in-flight fetch holders keep coherent version. Include collisions deferred to VIRT-05.
- Resolution: getModelOption exact→default→bare per getNestedOption for bare descriptors; resolveVirtualDescriptor returns exact else default else bare descriptor (inheriting shared dependsOn) and undefined for absent access (never returns parent record); isVirtualField true even when inapplicable (never persisted).
- Verification (serial, per AGENTS.md): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router typecheck` passed (build + tsc -p tsconfig.typecheck.json, covers src/filter-type-tests virtuals); `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-config.contract.test.ts` → 8 passed; `test/virtuals-baseline.contract.test.ts` → 7 passed (unchanged asymmetry preserved); `test/strict-consumer-types.test.ts -t "accepts valid filters"` (ARF-14 packed-consumer with VIRT snippet) → 1 passed; `-t "AJV"` → 3 passed; `test/export-contract.test.ts` → 39 passed (packaging surface intact). Inspected `dist/index.d.ts` + `dist/index.d.mts` + `dist/advanced.d.ts/.d.mts`: ModelVirtualAccess/RecordAccess/Context/Doc/Getter/Descriptor/AccessRecord/Leaf/Virtuals, VirtualSubModel, WithVirtuals, virtuals setter, and TVirtuals generics present in both declaration forms; root (explicit re-exports) and ./advanced (barrel) consistent. `git diff --check` clean for tracked changes. No CHANGELOG.md changes. OAV-01 packed-consumer failures (missing DefaultModelRouterOptions etc.) are parallel OAV-task work, unrelated to VIRT-01; ARF-14/VIRT focused checks pass.
- Follow-ups: VIRT-04 verifies operation-level in-flight plan/getter coherence once planner/finalizer integrate.

---

### Task VIRT-02: Projection planner (fetch plan vs output plan)

Status: completed

Priority: P0

Suggested agent: access-control engineer

Dependencies: VIRT-01

Primary ownership:

- `packages/access-router/src/acl/` (new planner module, e.g. `virtual-projection.ts`)
- `packages/access-router/src/core.ts:150-217`
- `packages/access-router/src/acl/select-resolution.ts:59-114`
- `packages/access-router/src/helpers/query.ts:73-95`

Finding:

`resolveSelectForRequest` mixes authorization + `alwaysSelectFields` concatenation (`src/acl/select-resolution.ts:97-111`; `alwaysSelectFields` injected in `src/core.ts:204-216`). Forced virtual dependencies must not become permission grants and virtual names must never reach Mongoose projections. Populate's global-only query check cannot decide virtual rules that depend on document grants or permission functions; those rules need post-fetch evaluation.

References:

- `packages/access-router/src/acl/select-resolution.ts:59-114`
- `packages/access-router/src/core.ts:150-217`
- `packages/access-router/src/helpers/query.ts:73-95`

Implementation requirements:

1. Build a planner given the receiving model, captured model-options/definition snapshot, separate `virtualAccess` / `outputAccess` / `docPermissionsAccess`, requested/effective select, `scopePath=[]`, optional authorized related descriptors, and internal fetch requirements. Return separate output selection, persisted fetch selection, candidate virtual descriptors with authorization state, virtual-only dependencies, and child/related plans. Carry dependency provenance and internal identity/join requirements separately; a bare field-name union is not sufficient for output stripping.
2. Classify names against the scope's full registry before resolving access applicability. Registered but inapplicable virtuals are omitted from candidates and persisted projection; unregistered names follow existing persisted-field policy. Strip virtual names from all projection inputs, including `alwaysSelectFields` and trusted select overrides, without converting forced fetching into virtual authorization.
3. Preserve selection semantics: omitted/effectively empty `select` (subject to `requireExplicitSelect` at `src/services/service.ts:218-225` and VIRT-00A) considers applicable virtuals; explicit inclusion considers only requested applicable names; explicit exclusion of a virtual skips it; excluding a dependency still fetches it internally but hides it from output. Compute original output eligibility independently of internal fetch fields and preserve established system/authorized `alwaysSelectFields` behavior.
4. Preserve `_id` projection identity per ARC-21 (inclusion retains `_id`; explicit `-_id` strips it).
5. Keep `genSelect()` persisted-field authorization semantics unchanged. Resolve virtual authorization separately as definite denial vs potentially authorized post-fetch; absent rules, explicit deny, or missing applicable getter are omitted, while document-dependent/function rules retain their dependencies until the finalizer evaluates actual grants. A failed global-only check alone is not definite denial when document grants may authorize the virtual. Never run getters during planning.
6. Fetch dependencies outside output grants only at fetch-plan construction. Ensure virtual-only / no-dependency / denied-only selects still produce a safe persisted projection rather than accidentally requesting the whole document when an empty projection reaches Mongoose. Retain internal `_id` when field-policy/association work requires it, then honor output `-_id` independently.
7. Nested dependencies are relative top-level fields of an embedded scope; child plans must retain needed containers/dependencies without treating definition paths such as `contacts.sub.displayName` as database paths. Related plans must use the target's own definitions and access; target registration/row/operation policy remains VIRT-05's responsibility.

Acceptance criteria:

- Unit tests cover no-select/effectively empty select, explicit include/exclude, projection-object/string forms, virtual-only/no-dependency/denied-only selection, `-_id`, unknown names, and an inapplicable `read` virtual under `list` that never enters persisted projection.
- Planner output for `select: ['name','fullAddress']` yields fetch containing `name + address + system fields` and output containing `name + fullAddress` (address only if independently requested/allowed).
- A document-dependent virtual denied by a global-only precheck retains required fetch dependencies; an explicit deny does not fetch virtual-only dependencies. Getter spies remain uncalled during planning.
- Embedded and target plans preserve dependency/join/identity provenance and do not emit virtual or `.sub` definition paths into Mongoose selections.
- Existing projection tests (incl. ARC-21) still pass.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/acl/virtual-projection.ts` (new, pure snapshot planner), `src/core.ts:190-233` (`genSelect` strips via full registry + passes `virtualNames` through), `src/acl/select-resolution.ts` (`virtualNames` stripping on target/alwaysSelect + persisted-schema copy + `stripVirtuals`/`stripVirtualKeysFromPermissionSchema` exports), `src/helpers/query.ts` (`isEffectivelyEmptySelect`/`getVirtualSelectMode`/`hasIdExclusion` pure helpers), `test/virtuals-projection-planner.unit.test.ts` (new, 14 tests). No `CHANGELOG.md` changes.
- Frozen contracts respected: D1 three accesses carried separately; D2 `scopePath` definition/permission segments with `dependsOn` relative to scope; D5 dotted/virtual-to-virtual already rejected by VIRT-01, planner never interprets access-records as descriptors; D6 effective selection computed before evaluation, internal-only deps/fetch never leak to output; D8 arbitrary select preserved, registered virtuals stay virtual (never persisted/DB sort/filter/distinct).
- Planner: snapshot `{permissionSchema, virtuals, alwaysSelectFields, modelPermissionPrefix, requireExplicitSelect, documentPermissionField}` + `virtualAccess/outputAccess/docPermissionsAccess` + requested/effective + `scopePath=[]` + optional authorized related + internal fetch `{baseFields, joinFields, identityFields, extraPersistedFields, trustedOverrideSelect}`. Returns `outputSelection/outputPersistedFields/outputVirtualNames`, safe `persistedFetchSelection` (no virtuals, no `.sub`, no `-_id`), `candidates[{name, descriptor, authState: granted|deferred, dependsOn}]`, `virtualOnlyDeps`, `internalOnlyFields`, `depProvenance`, `outputIdExcluded/fetchIdRetained/internalIdentityFields/internalJoinFields`, `childPlans` (embedded, container-prefixed DB paths) + `relatedPlans` (target own defs/access; VIRT-05 owns row policy).
- Selection: omitted/effectively-empty (`[]/{}`) => all applicables; explicit include only requested applicables; explicit `-virtual` skips; dep exclusion still fetches internally; output computed independently of fetch; `alwaysSelect`/trusted overrides stripped without grant; embedded `alwaysSelect` is `[]` (core parity). `_id` per ARC-21: inclusion retains via Mongoose default, `-_id` in output only, fetch always retains `_id` (`fetchIdRetained`), `internalOnly` carries `_id` when excluded. Virtual-only/no-dep/denied-only collapses to safe `['_id']`, never whole-doc `[]`.
- Auth: `genSelect` persisted semantics unchanged (stripped schema/inputs only). Virtual `outputAccess` rule vs `virtualAccess` descriptor; absent/explicit-`false`/missing-getter/non-scalar-object => definite denial (omit, fetch nothing); `boolean true`/global-pass => `granted`; `function` or `string/array` global-miss with `modelPermissionPrefix` doc-dependence => `deferred` (retain deps for VIRT-03 finalizer). Purely-global miss with non-matching prefix => denial. Getters/permission functions never invoked during planning.
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router typecheck` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-projection-planner.unit.test.ts` → 14 passed; `test/virtuals-baseline.contract.test.ts` → 7 passed; `test/virtuals-config.contract.test.ts` → 8 passed; `test/arc21-projection-identity-and-count-argument.contract.test.ts` → 8 passed; `test/require-explicit-select.integration.test.ts` → 9 passed. `git diff --check` clean for tracked changes; new-file whitespace checked via `git diff --no-index --check`.
- Follow-ups: VIRT-03 finalizer owns deferred/grant evaluation with real doc grants; VIRT-04 owns service integration (effective mutation selection transport, output-only write/query exclusion); VIRT-05 owns target registration/row/operation + join-key transport using related-plan defs/access.

---

### Task VIRT-03: Shared output finalizer (toObject → virtuals → trim)

Status: completed

Priority: P0

Suggested agent: backend engineer

Dependencies: VIRT-02

Primary ownership:

- New module, e.g. `packages/access-router/src/output/finalize-model-output.ts`
- `packages/access-router/src/helpers/document.ts:12-66`
- `packages/access-router/src/core.ts:150-188,346-391,459-478`
- `packages/access-router/src/acl/hook-runner.ts:1-41`
- `packages/access-router/src/helpers/concurrency.ts` (existing scheduling helper; coordinate shared changes)

Finding:

Virtual getters need one consistent boundary: plain-object view, internal doc-permissions + global permissions available, value assignment that works for lean and hydrated docs, then model permission trim. Current pipelines call `toObject()` in public-service callbacks after internal trim (`src/services/public-service.ts:50-53,167-171,229-233,255-264`), so the finalizer must own conversion + dependency retention.

References:

- `packages/access-router/src/helpers/document.ts:12-66`
- `packages/access-router/src/core.ts:346-391,459-478`
- `packages/access-router/src/services/public-service.ts:46-71,167-171,229-233,255-264`
- `packages/access-router/src/core-shared.ts:257-272`

Implementation requirements:

1. Implement `finalizeModelOutput` with explicit receiving model, input document, `virtualAccess`, `outputAccess`, `docPermissionsAccess` / owning grant source, `scopePath`, captured projection/options plan, request, and context. Use VIRT-00A's matrix instead of guessing access from a route name.
2. Normalize to an isolated output object (`toObject()` for Mongoose documents; recursively isolate mutable plain/array data for lean results). Preserve supported BSON/`ObjectId`/`Date` value semantics without JSON cloning. Isolate mutable leaves and getter return values according to VIRT-00A so response, getter view, lifecycle snapshots, and another parent's output cannot alias mutable data.
3. Finalize related/embedded children through the same boundary before parent getters; provide traversal/integration hooks for VIRT-05/VIRT-06. Retain raw association/correlated data privately before any child trim. Only finalized child objects, not their stripped dependencies, appear in the parent getter view.
4. Ensure internal document permissions are available even when response metadata is disabled; use a supplied already-computed map or the correct `docPermissionsAccess` hook rather than recomputing the same output-stage hook twice. Keep full internal grants distinct from serialized/exposed metadata, populate scope-aware `context.docPermissions`, and honor existing field-map options without making metadata switches authorization inputs.
5. Resolve candidate virtual authorization from the captured scoped `permissionSchema`, actual document grants, and global permissions before invoking a getter. Evaluate all getters against the stable view specified in VIRT-00A; do not expose completion-order sibling virtual values. Only absent required dependencies omit evaluation; present `null` / `0` / `false` are not missing.
6. Commit only returned field values via `setDocValue`. `undefined` or a getter throw removes/omits the virtual field and leaves no getter input mutation in output. Stage returned values separately until evaluation/authorization completes; no fallback to a raw dependency or preexisting virtual value.
7. Trim using scoped `outputAccess`, then enforce original output selection and remove virtual-only/internal association dependencies. Visibility requires independent original output eligibility plus authorization, never membership in fetch selection. Apply metadata serialization/stripping at the established caller boundary so internal grant maps are retained until needed.
8. Implement the VIRT-00A scheduling strategy: bounded row finalization and finite getter/recursive-child work using existing concurrency helpers. No `Promise.all` over an unbounded row array, no per-row multiplication presented as a request ceiling, and no persistence permit held while awaiting hooks/descendants. Record the limit's exact scope in code/JSDoc.
9. Log getter failures with allowlisted structural metadata (model/scope/field/access/operation and fixed failure category). Do not include getter input, return values, free-form exception messages/stack, or raw dependencies; an error message may contain secret values.
10. Do not save computed output or change `originalDocumentSnapshot` / `finalDocumentSnapshot` lifecycle semantics. Keep `decorate` / `decorateAll` / tasks ordering as frozen in VIRT-00A; callers integrate once in VIRT-04–VIRT-06.

Acceptance criteria:

- Direct unit tests: lean/hydrated input, `undefined` omission, throw → omitted + structural log, absent-dependency skip, present falsy-dependency computation, dependency stripping vs independent visibility, and unauthorized virtuals skipped without running getters.
- Getter receives a plain typed view, `permissions.has()` works, and full internal/scoped permissions are supplied with response metadata enabled or disabled.
- Nested input mutation followed by throw changes neither output nor lifecycle snapshots; returned object values and shared related data cannot mutate another output. Sibling completion order does not change getter inputs/results.
- Multi-row unit tests with multiple getters record peak active getter work at or below the configured limit across a top-level list; nested child work meets the documented finite scope and completes at limit 1 without deadlock. Serialized logs omit a secret embedded in a thrown error message.
- No caller integration yet; module covered by unit tests.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/output/finalize-model-output.ts` (new, `finalizeModelOutput`/`finalizeModelOutputs` + `VirtualTraversalHooks` + `FinalizeRelatedTarget`), `src/helpers/document.ts` (`isolateDocForOutput`/`deepIsolateValue`/`cloneIsolatedLeaf`/`retainRawAssociation`/`unsetIsolatedVirtual`), `src/core.ts` (`evaluateScopedAccessRule`/`extractScopedOutputRule`/`resolveFinalizerDocPermissions`), `src/acl/hook-runner.ts` (`runVirtualGetter` + `VirtualGetterLogMeta`), `src/helpers/concurrency.ts` (`mapWithConcurrencyLimit`/`SharedHookGate`/`normalizeHookConcurrencyLimit` scope docs), `test/virtuals-finalizer.unit.test.ts` (new, 14 tests). No `CHANGELOG.md` changes. No caller integration (no service/route edits; no `decorate`/tasks invocation; no snapshot lifecycle change).
- Frozen contracts respected: D1 explicit `virtualAccess`/`outputAccess`/`docPermissionsAccess` with `operation` initiating; D2 `scopePath` + `receivingModelName` + parent-grant reuse for embedded / own-grant for related, scope-aware `context.docPermissions`; D3 getter signature `(view, permissions, context)` with `this` = request, value-not-doc; D4 isolated stable view per getter (sibling values never visible), `Date`/`Buffer`/`ObjectId`/BSON cloned without JSON clone, returned values deep-isolated, input/snapshots never mutated; D5 relative top-level `dependsOn`, only missing/`undefined` omits (`null`/`0`/`false`/`''` run); D6 captured plan selection before evaluation, internal-only deps stripped before decorate/tasks; D7 one bounded row map + shared getter gate (peak ≤ limit, stable order, limit-1 completes, no `RequestConcurrencyScheduler.work` held); D8 arbitrary select preserved, registered virtuals stay virtual.
- Finalizer: isolated `toObject({ virtuals: false })`/lean normalize → children (embedded via `childPlans`, related via explicit targets) through same boundary with private association retention → stale virtual keys stripped → stable view → per-candidate absent-dep check → scoped `outputAccess` rule vs actual doc grants + global perms → bounded gated getter → staged `Map` → `setDocValue` commit only (`undefined`/throw omit) → scoped-`outputAccess` trim + original-selection enforcement (`_id` per plan, permission field retained for caller boundary). Single grant resolution per doc (supplied map reused, else one `docPermissionsAccess` hook); trim reuses same grants. Failures log allowlisted keys only (`modelName`/`scope`/`field`/`virtualAccess`/`outputAccess`/`operation`/`category`).
- Unit coverage (14 tests): lean/hydrated parity with `ObjectId`/`Date` no-alias; `undefined` omission; throw omission + structural allowlisted log; absent vs falsy deps; stripping vs independent visibility; unauthorized skip without getter run (explicit deny + function deny); isolated view + `permissions.has()` + full grants with metadata-off flags; supplied-map single-call vs hook-once path; nested mutation+throw snapshot/output isolation + returned-object isolation; shared-input cross-output isolation; sibling order determinism; multi-row peak ≤ limit with stable order; limit-1 nested completion with child-before-parent; secret-in-error redaction; input/snapshot/decorate-ordering untouched.
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router typecheck` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-finalizer.unit.test.ts` → 14 passed; regression `test/virtuals-projection-planner.unit.test.ts` + `test/virtuals-config.contract.test.ts` + `test/virtuals-baseline.contract.test.ts` → 29 passed (3 files). `git diff --check` clean for tracked changes; new-file whitespace checked via `git diff --no-index --check`.
- Follow-ups: VIRT-04 owns service integration (effective mutation selection, output-only enforcement); VIRT-05 owns related join-key transport + row policy using related-plan defs/access; VIRT-06 owns recursive embedded scopes beyond child-plan hook point.

---

### Task VIRT-04: Direct operation integration (list/read/create/update/upsert/new)

Status: completed

Priority: P0

Suggested agent: backend engineer

Dependencies: VIRT-03

Primary ownership:

- `packages/access-router/src/services/service.ts:260-413,547-626,629-793,862-1075,826-853`
- `packages/access-router/src/services/public-service.ts:33-272`
- `packages/access-router/src/services/model-service-defaults.ts`
- `packages/access-router/src/interfaces/service-create.ts`, `service-update.ts` (carry internal output plans/effective selection as decided in VIRT-00A)
- `packages/access-router/src/helpers/sort-policy.ts`, model-aware client-filter admission in `services/base.ts`

Finding:

Each operation has its own post-fetch/post-persist block with slightly different ordering (notably `new()` trims before doc-permissions at `src/services/service.ts:826-853`, unlike find paths). Virtuals must sit in one consistent place: after related-data resolution + doc-permissions, on the output copy, before trim/decorate.

References:

- `packages/access-router/src/services/service.ts:381-413,577-614,748-783,964-990,826-853`
- `packages/access-router/src/services/public-service.ts:46-71,85-97,128-172,188-234,250-265`

Implementation requirements:

1. Route `find` (list), `findOne`/`findById` (read + tryList fallback access), `create`, `updateOne`/`updateById`, both internal/public `upsert` branches, and `new` through the shared finalizer with the captured output plan and VIRT-00A access matrix. Keep mutation validation/prepare/transform/afterPersist/onChange and snapshots in their existing persistence lifecycle.
2. Carry effective mutation output selection into internal finalization before virtual evaluation; do not compute every mutation virtual and discard most in the later public `pick`. Implement the chosen explicit select / `returningAll: false` / decorator/task selection behavior from VIRT-00A. Existing internal create/update argument types omit select, so extend internal plan transport deliberately rather than assuming it already exists.
3. `new` template: apply selected authorized virtuals where required dependencies exist in the default/template values (absent dependency → omit). Supply a real model/scope/operation context and implement the agreed `args.select` behavior; record that the previous implementation ignored that argument.
4. Enforce virtual output-only admission before client create/update data reaches validation/persistence. Exclude registered virtual names for any access, including bare `permissionSchema: true` rules and inactive descriptors; sanitize registered embedded virtual keys inside whole-object/array grants. Preserve trusted prepare/transform authority and lifecycle, while ensuring package computed values are assigned only to output copies.
5. Exclude registered virtual names from database sorting, filters, and distinct field authorization at the model-aware service boundary, including service-direct/root/include paths. Cover logical/nested filter field positions and `sortableFields`/`stripDisallowedSort`; preserve existing persisted-field errors and strip posture as frozen in VIRT-00A. Never send a virtual field to the adapter because its permission rule granted output visibility.
6. `delete` (returns only identity), `exists` (boolean/identity-only), `distinct` (persisted scalar values), `count`, and `countTrusted` do not run output virtual getters. Their client database field inputs still receive required virtual-name exclusion; supported persisted-field outputs remain unchanged.
7. Keep `skim`, permission metadata postures, field-map toggles, defaults, `requireExplicitSelect`, and projection identity coherent. Internal document grants needed for selected virtuals cannot depend on metadata exposure or be overwritten before evaluation.
8. Integrate bounded row-level finalization into model lists and bulk-create responses, plus finite child orchestration. Verify no unbounded list `Promise.all` remains around the new finalizer; do not multiply row and getter limits while claiming a single ceiling.

Acceptance criteria:

- Integration tests for direct/internal and public list/read/readFilter/create/update/upsert/new use the recorded matrix: selected+authorized virtuals compute, unauthorized/inapplicable getters never run, dependencies are stripped, and decorate sees finalized values. Include explicit exclusions, defaults, `returningAll: false`, `requireExplicitSelect`, metadata-off/posture variants, read→list fallback, and coherent in-flight descriptor replacement.
- Read raw stored documents back after create/update/upsert with submitted virtual keys, using `strict: false` / Mixed-container fixtures and registered embedded keys inside whole-array/object grants. No submitted/computed virtual value is persisted; mutation snapshots contain no package computed output.
- Virtual sort/filter/distinct attempts are controlled before adapter dispatch across service/direct/root entrypoints; persisted controls retain existing success/error/strip behavior. Getter spies remain uncalled for scalar/identity-only operations.
- List/bulk integration records peak active getters across many rows and multiple definitions at or below `maxHookConcurrency` for a top-level list, with the separate recursive scope documented; recursive limit-1 cases complete.
- Package tests pass; supported persisted delete/distinct/count outputs and established mutation-hook lifecycle tests remain green.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/services/service.ts` (find/findOne/create/updateOne/updateById/upsert/new through `finalizeModelOutput` with VIRT-00A matrix; `operation` stays initiating `list/read/create/update/upsert/new`, effective accesses per branch; fallback `read→list` keeps `operation:read` with `list/list/list`; upsert branches keep `operation:upsert` via `overrides.operation`; snapshot captured once per op for planner+finalizer coherence; DB select merged with `persistedFetchSelection`; includes preserved without second getter pass; `new()` uses `create/create/create` with ignored `args.select` documented), `src/services/public-service.ts` (`_create`/`_update` carry `overrides.effectiveSelect` before evaluation with post-decorate picks preserved; `_upsert` calls internal `updateById`/`create` directly with `operation:upsert` + branch-effective selection), `src/services/model-service-defaults.ts` (merge `overrides.effectiveSelect/operation` through defaults), `src/interfaces/service-create.ts`/`service-update.ts` (`overrides.effectiveSelect` + `overrides.operation` transport), `src/helpers/sort-policy.ts` (`excludeVirtualsFromAllowedSortFields`), `src/services/base.ts` (`isVirtualDbPath` scope-aware incl `contacts.nick`, `excludeVirtualsFromAllowedFields`, `sanitizeEmbeddedVirtualKeys` whole-object/array, `stripVirtualKeysFromFilter` logical/nested/dotted), `test/virtuals-direct-operations.integration.test.ts` (new, 19 tests). No `CHANGELOG.md` changes.
- Frozen contracts: D1 matrix implemented as above; D2 scopePath `[]` with parent-grant reuse via supplied `docPermissions` (no new embedded hook); D3 generics untouched (output optional preserved); D4 isolated views, staged commits, fail-closed (via finalizer); D5 relative `dependsOn` (planner/finalizer); D6 effective selection before evaluation, internal-only stripped before decorate/tasks, `new.args.select` ignored in v1 (documented in `new()` JSDoc); D7 one bounded row map + shared `SharedHookGate` (`hookLimit=maxHookConcurrency`, stable order, limit-1 completes, no `scheduler.work` held); D8 arbitrary select preserved, virtuals stay virtual (never persisted/DB).
- Output-only: `genAllowedFields` results filtered for virtuals + embedded sanitized before `validate`; `prepare`/`transform` untouched (trusted); computed only via finalizer output copies; snapshots (`originalDocumentSnapshot`/`finalDocumentSnapshot`) from `toObject({virtuals:false})` pre-finalizer, never mutated by getters (finalizer unit + raw re-read proof).
- DB exclusion: `stripVirtualKeysFromFilter` on `find/findOne/updateOne/upsert/exists/distinct/count/countTrusted/countByFieldValues` final filters (false preserved); `authorizeDistinctField` explicit virtual check + filtered allowlist → `Forbidden`; `getEffectiveAllowedSortFields` filters `allowed+sortableFields` via `isVirtualDbPath` → strict `BadRequest` / strip posture preserved; `countByFieldValues` rejects virtual `foreignField`; never sends virtual to adapter because output granted it. Scalar ops (`delete` identity-only, `exists`, `distinct`, `count`, `countTrusted`) never call finalizer/getters.
- Verification (serial, per AGENTS.md): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-direct-operations.integration.test.ts` → 19 passed (matrix incl create-only/update-only/default, explicit `-v` exclusion, `_id` identity `['name','fullAddress']` retains / `['- _id']` strips, `requireExplicitSelect` field-less vs explicit, `skim+metadata-off` computes + decorate sees `addr:a1`, upsert both branches with `operation:upsert` captured (`update:upsert`), logical `$or` virtual stripping, `sortableFields:['fullAddress']` still `400`, `exists/count/countTrusted` with virtual filters strip + no getters, bulk-create 10 rows peak ≤2 + raw `strict:false`/`Mixed` no `fullAddress` + embedded `nick` stripped, in-flight replacement returns `old` then `new`, fallback `list:read:list:list` + `readFilter`, defaults `publicListArgs.select`, scalar `delete` no getters); regression `test/virtuals-baseline.contract.test.ts` + `test/virtuals-config.contract.test.ts` + `test/virtuals-projection-planner.unit.test.ts` + `test/virtuals-finalizer.unit.test.ts` → 43 passed; `test/arc21-projection-identity-and-count-argument.contract.test.ts` + `test/require-explicit-select.integration.test.ts` + `test/sort-options.integration.test.ts` + `test/distinct-field-authorization.integration.test.ts` + `test/service-defaults.integration.test.ts` + `test/advanced-mutation-bodies.integration.test.ts` + `test/permissions-posture.integration.test.ts` + `test/field-permissions-opt-out.integration.test.ts` + `test/basic-list-sort.integration.test.ts` + `test/sort-field-authorization.integration.test.ts` → all passed (96 + 43 + posture suites). Peak recorded: list 12 rows×2 getters limit 3 → peak ≤3; bulk-create 10 rows limit 2 → peak ≤2. `git diff --check` clean. No `CHANGELOG.md` changes.
- Follow-ups: VIRT-05 owns related join-key transport + target re-finalization (includes preserved without second pass here); VIRT-06 owns recursive embedded beyond one-level sanitizer hook point.

---

### Task VIRT-05: Populate + include target-model finalization

Status: completed

Priority: P0

Suggested agent: access-control engineer

Dependencies: VIRT-03, VIRT-04

Primary ownership:

- `packages/access-router/src/core.ts:219-283`
- `packages/access-router/src/services/base.ts:301-368,476-597,675-921`
- `packages/access-router/src/services/service.ts:381-413,577-614`
- `packages/access-router/src/model.ts:96-121`

Finding:

This closes the confirmed asymmetry: populate needs explicit target-model output finalization (virtuals + trim), while includes already flow through target `Service.find/findOne`. Legacy list includes still need separate private foreign-key transport because they index rows after target finalization; merely finalizing target `find` is insufficient when its output omits the join key. Related output also needs deferred document authorization, deterministic child ordering, and shared-instance isolation.

References:

- `packages/access-router/src/core.ts:219-283`
- `packages/access-router/src/services/base.ts:476-597,675-921`
- `packages/access-router/src/model.ts:96-121`

Implementation requirements:

1. Extend `genPopulate` planning to retain per-entry target plans (target's original selection, captured virtual descriptors, dependency fetch requirements, effective target accesses). Keep Mongoose descriptors separate from package internal plan metadata. Preserve existing parent-path/target-operation/terminal-row-filter denial and target registration behavior; do not reinterpret global-only virtual denial as definitive when target document grants may authorize it.
2. After Mongoose population resolves (query builders at `src/model.ts:96-121` and mutation `populateDoc` at `service.ts:774,979`), finalize each actual target using its own plan and context before parent getters. Handle null, scalar reference IDs when population is skipped, arrays, and populate paths through embedded arrays. Apply target trimming even on registered targets without virtual definitions so the old asymmetry is actually closed.
3. Keep include target getter/trim evaluation centralized in target `Service.find/findOne`, but add private association transport for legacy list joins: fetch the target `foreignField` independently of output selection, capture immutable association values before trim, and build indexes from those values paired with finalized output rows. Do not grant foreign-field output access, expose join keys in response objects, or use a client `overrides.select` bypass. Preserve parent local fields until attachment and then enforce the parent output plan.
4. Choose the smallest internal mechanism for association transport (e.g. service-only result metadata aligned to rows or an internal callback); keep it outside public serializers and ordinary finalized output/decorator input. A getter may read a join field only when it was independently fetched as its declared dependency or ordinarily selected, not because an association-only key was retained. Multiple parents can receive isolated finalized output copies without retaining raw hidden keys. The association phase must not rerun target getters just to recover join keys.
5. Verify nested `include.args.include` chains finalize per level, and finalize populate targets inside legacy included target results. Correlated reference snapshots remain pre-attachment/pre-trim and isolated from getter mutations; do not substitute finalized output or computed values into existing raw parent-reference semantics.
6. Preflight request include output paths against registered virtual paths and their ancestor/descendant overlaps for the correct receiving model/scope. Perform nested preflight before target dispatch just as the permission-metadata boundary does; configuration-time validation cannot know request-defined include paths. Preserve permitted ordinary include collisions and existing permission-metadata protections.
7. Guard shared populated/included instances: do not mutate cached Mongoose documents or shared nested lean objects in place for one parent's output. Use VIRT-03's isolated views/copies, with one well-defined getter evaluation per logical target output and no incidental second pass from HTTP formatting.
8. Apply the documented finite row/related concurrency bounds and preserve `requireRegisteredPopulateModels`. Document existing nested populate-descriptor support accurately: dotted paths through embedded data are required; do not accidentally invent a recursive Mongoose `populate` public API absent from the current `Populate` interface.
9. Update the VIRT-00 live characterization assertions to the new trim-symmetric result and retain its historical baseline evidence. Record this externally visible populate-trimming change for VIRT-10 compatibility notes.

Acceptance criteria:

- Regression tests close VIRT-00's forced-field asymmetry for lean/hydrated registered populated targets, including targets without virtuals. Target document-authorized virtuals compute despite a global-only planning miss; explicit denial skips getters and no target dependency leaks.
- Legacy list include tests omit or deny the foreign key, explicitly exclude `_id`, use multiple parents and array-valued join keys, and still attach correct projected rows. Association-only values are absent from serialized responses and getter input unless separately declared/selected; getters do not rerun for indexing.
- Tests cover legacy read/list, correlated read/list, mixed supported nested include chains, included-target populate, dotted population through embedded arrays, null/denied refs, and shared target instances with nested mutation isolation.
- Request-defined/nested include-virtual collisions fail before target queries; ordinary nonvirtual collisions and permission-metadata tests retain their contract. Correlated snapshots remain unaffected by getter/attachment mutation.
- Request-complexity budgets respected (no unbounded fan-out); existing include/populate authorization tests pass.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/acl/populate-target.ts` (new, per-entry `POPULATE_TARGET_PLAN` symbol + `PopulateTargetMeta`), `src/core.ts` (`genPopulate` retains target original selection/captured descriptors/dependency fetch/effective accesses; Mongoose `{path,select,match}` enumerable stays separate from non-enumerable symbol metadata; parent-path/target-operation/terminal-filter/`requireRegisteredPopulateModels` preserved; global-only virtual denial stays deferred, never definitive; query projection merges only `virtualOnlyDeps` + `_id` (never denied output fields, so legacy subdocument populate without finalization cannot leak); dotted fallback via `src/meta.ts`), `src/meta.ts` (`getModelRef` dotted-through-embedded fallback via live `schema.path`, e.g. `contacts.friend`; no recursive populate API invented), `src/services/base.ts` (virtual preflight equal/ancestor/descendant per receiving scope before dispatch, preserving ordinary + metadata contracts; legacy list private association via `VIRT_ASSOCIATION_FIELD`/`VALUES` symbols outside serializers/output, fetch FK fetch-only, capture immutable before trim, index from paired + finalized, no `overrides.select` bypass, no output grant/exposure, no getter rerun, isolated `deepIsolate` copies per parent; non-`_id` association-only FKs stripped before finalization so getter input lacks them unless declared/selected), `src/services/service.ts` (populate finalization after builders/`populateDoc` before parent getters with own plan/context, null/scalar/array/dotted-through-arrays, trimming even without virtuals; `find`/`findOne` DB `select` strips `-_id` for fetch while reporting stays accurate and output `-_id` stays finalizer-owned; association capture + `_id`/FK fetch-only + per-row shared `SharedHookGate` bounded `mapWithConcurrencyLimit`, limit-1 completes, no persistence permits held; `permissions` Mongoose virtual preserved non-enumerably for hydrated service-direct parity without leaking into JSON DTOs/`Object.keys`), `test/virtuals-baseline.contract.test.ts` (live assertions to symmetric trim, historical note retained), `test/virtuals-populate-include.integration.test.ts` (new, 10 tests). No `CHANGELOG.md` changes. `src/model.ts:96-121` reviewed: bare `.lean()` preserved, Mongoose descriptors pass through untouched (symbols invisible); no change required.
- Frozen contracts: D1 three accesses separate (`populateAccess` → target `virtual/output/docPermissions`, parent `operation` stays initiating `list/read/create/update/upsert`); D2 `scopePath []` for targets, parent-grant reuse untouched; D5 relative `dependsOn`, dotted/virtual-to-virtual still rejected at config; D6 effective selection before evaluation, internal-only stripped before decorate/tasks; D7 one bounded row map + shared gate (peak ≤ `maxHookConcurrency`, stable order, limit-1 completes); D8 arbitrary select preserved, registered virtuals stay virtual.
- Populate: query builders + `populateDoc` (create/update) finalize each target via `finalizeModelOutput` with retained plan/snapshot; null stays null, scalars (string/ObjectId `_bsontype`) skipped, arrays mapped, dotted via segment+array traversal; target trim closes asymmetry even with no virtuals; doc-authorized (`canViewDoc` + doc hook) computes despite global miss; explicit `false` skips getters with no dep leak (dep-only fetch stripped from output); shared targets get isolated copies per parent (no in-place mutation of shared/cached instances, originals never mutated, parents fresh per query consistent with `includeDocs`), one evaluation per output, response pipelines presentation-only (no second pass).
- Includes: getter/trim centralized in target `find`/`findOne`; legacy `read` per-doc `findOne` (no index needed), legacy `list` batched `find` with private transport (omitted/denied FK, `-_id` with `_id` join, multi-parent + array `tagIds` all attach; outputs lack FK/`_id` as requested/denied; parent locals preserved until attachment then parent plan enforced); nested `args.include` recurses per level with correct receiving model; populate inside included targets via `args.populate` passthrough finalized by target `find`; correlated snapshots `cloneDeep(toObject)` pre-attachment/pre-trim isolated, never substituted, unaffected by getter/attachment mutation.
- Preflight: `validateIncludeVirtualCollision` collects virtual DB paths (top + `container.leaf` for `sub` scopes, bracket-normalized) and fails `BadRequest` on equal/ancestor/descendant per receiving scope, including nested `args.include` before target dispatch; ordinary nonvirtual paths pass; `_permissions` overlap still fails.
- Bounds/compat: finite row/related work, `requireRegisteredPopulateModels` preserved (unregistered without plan stays raw when option false, dropped when true); dotted support documented here + `populate-target.ts` JSDoc (single-entry dotted, no new API); externally visible populate-trimming change recorded for VIRT-10 (target-model trim now applies to populate, including no-virtual targets; previously leaked `alwaysSelect`-forced fields).
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router typecheck` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-include.integration.test.ts` → 10 passed; `test/virtuals-baseline.contract.test.ts` → 7 passed (symmetric); `test/virtuals-config.contract.test.ts` + `test/virtuals-projection-planner.unit.test.ts` + `test/virtuals-finalizer.unit.test.ts` + `test/virtuals-direct-operations.integration.test.ts` + `test/subdocument-populate-authorization.integration.test.ts` + `test/arc21-projection-identity-and-count-argument.contract.test.ts` + `test/require-explicit-select.integration.test.ts` + `test/sort-options.integration.test.ts` + `test/distinct-field-authorization.integration.test.ts` + `test/model-router.integration.test.ts` → all passed (12 files, 126 tests total in combined serial run). `git diff --check` clean for tracked changes; new-file whitespace checked via `git diff --no-index --check`. No `CHANGELOG.md` changes.
- Follow-ups: VIRT-10 must add compatibility notes for populate trimming (including no-virtual targets); VIRT-06 owns subdocument-route populate finalization beyond the preserved `genPopulate` query policy verified here.

---

### Task VIRT-06: Embedded-subdocument scopes + subdocument routes

Status: completed

Priority: P1

Suggested agent: backend engineer

Dependencies: VIRT-03, VIRT-04, VIRT-05

Primary ownership:

- `packages/access-router/src/services/model-subdocument-service.ts:32-127,276-291`
- `packages/access-router/src/routers/model-router-subdocument-routes.ts:1-217`
- `packages/access-router/src/services/service.ts:1410-1512` (sub delegates)
- Planner/finalizer scope traversal from VIRT-02/VIRT-03

Finding:

Dedicated embedded-row routes use `genFilter(subs.<sub>.*)` + `genQuerySelect(..., [sub,'sub'])` + `pick()` (`model-subdocument-service.ts:74-127`), plus `visibleMutationRows` re-reading parent + filtering (`:32-72`). Ordinary parent outputs do not recursively finalize their `.sub` policy. Both kinds of output need scoped virtuals, safe grant inputs, child-before-parent ordering, and output-only mutation handling.

References:

- `packages/access-router/src/services/model-subdocument-service.ts:32-127,276-291`
- `packages/access-router/src/routers/model-router-subdocument-routes.ts:1-217`

Implementation requirements:

1. Support `virtuals.<field>.sub.<name>.<access>` with dependencies relative to the embedded scope and the VIRT-00A context/grant contract. Resolve actual child schemas for validation and safe field access; literal `.sub` definition segments never become response/database field names.
2. Add recursive embedded finalization to ordinary parent list/read/create/update/upsert/new outputs and populated/included target outputs, including nested arrays/single-nested objects where configured. Finalize children before parent getters, apply scoped permission rules, preserve independently selected/authorized container fields, and strip child dependencies per child output plan. An omitted parent container must not be accidentally exposed just because a child virtual uses it internally.
3. Apply the same finalizer to `listSub`, `readSub` (including sub-populate via the VIRT-05 target path), and mutation visible rows (`createSub` / `updateSub` / `bulkUpdateSub`). Dedicated routes still apply their existing row/operation filters before getter evaluation; do not broaden which stored rows are returned.
4. Obtain the internally computed owning-parent grants required by VIRT-00A without replacing mutation lookups with finalized/trimmed parent DTOs. Current `getParentDoc` projects only `sub`, and post-save visibility lookup selects `_id`; arrange the necessary parent grant input deliberately and preserve raw parent documents for persistence. Do not introduce independent model mutation hooks on embedded writes.
5. Exclude registered embedded virtuals from `genQuerySelect('update'/'create', ..., [sub,'sub'])` write admission and sanitize registered virtual keys inside granted Mixed/whole-object payloads as needed. Keep writes separate from computed output copies.
6. Preserve denial contracts precisely: list/read sub query denial stays its existing Forbidden/NotFound result; denied post-persist mutation visibility succeeds with `[]` / `null`, never a retryable write error. Scope finalization must not run getters for hidden rows.
7. Bound embedded row recursion and target population using the VIRT-03 strategy; limit-1 parent→child cases must complete without deadlock. Parent getter views contain finalized embedded values, not raw child dependency fields.

Acceptance criteria:

- Tests cover embedded virtuals in ordinary parent outputs across all document-bearing operations, nested configured scopes, and populated/included targets; parent getters observe finalized children and cannot see stripped child dependencies.
- Dedicated listSub/readSub and create/update/bulk response tests verify scoped authorization, correct owning grant/context/access inputs, dependency stripping, selected container visibility, hidden-row getter skip, and recorded mutation getter applicability.
- Raw stored-document checks with permissive child/Mixed schemas prove submitted/computed virtual keys are not persisted, including whole-array/object parent mutations and embedded create/update/bulk writes.
- Existing mutation visibility cardinality/order/error contracts remain green; bounded recursion tests complete at limit 1 and record the expected peak work.
- Existing subdocument authorization tests pass.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/services/model-subdocument-service.ts` (VIRT-06 finalizer for `listSub`/`readSub`/`visibleMutationRows` with `sub` scope plans, owning-parent `read` grants, row/operation filters before getters, sub-populate via VIRT-05 path, sub-scope Mixed sanitization, bounded maps, fail-closed fallbacks), `src/services/service.ts` (public `captureVirtualSnapshot`/`getVirtualGlobalPermissions`/`getVirtualHookConcurrencyLimit`/`buildVirtualPlan` + new `buildSubVirtualPlan` with `scopePath=[sub,'sub']`, `getServiceRequest/ModelName/MongooseModel`, `getSubParentGrants` (`read` only, no new hook family), `finalizeSubRowsWithVirtuals`/`finalizeSingleSubRowWithVirtuals` (ONE bounded row map + shared gate, stable order), `finalizePopulateForSubParent` reusing VIRT-05 dotted path), `src/services/base.ts` (`sanitizeSubScopeVirtualKeys` + `stripSubVirtualKeysFromFilter` for sub-relative deps/Mixed/plain nesting), `src/acl/virtual-projection.ts` (container-only DB retention to avoid MongoDB "Path collision" when both `contacts` and `contacts.displayName` coexist; provenance/`.sub` stripping preserved), `test/virtuals-embedded-subdocuments.integration.test.ts` (new, 23 tests), `test/virtuals-projection-planner.unit.test.ts` (container-only expectation update). No `CHANGELOG.md` changes. No router file change needed (routes already forward `select`/`populate`; response pipelines stay presentation-only, no second pass).
- Frozen contracts: D1 matrix (`listSub:list/list/read/subList`, `readSub:read/read/read/subRead`, `createSub:create/read/read/subCreate`, `updateSub/bulkUpdateSub:update/read/read/subUpdate/subBulkUpdate`; `operation` stays initiating, three accesses effective); D2 `scopePath=[sub,'sub']`, `receivingModelName` parent, parent `read` grants + scoped `permissionSchema.<field>.sub` rules, raw parent docs preserved for `save()` (finalizer isolates output copies), never trimmed DTOs; D5 relative `dependsOn` (e.g. `['displayName']` in `contacts.sub`), dotted/virtual-to-virtual still rejected at config (VIRT-01); D6 effective sub selection before evaluation, internal-only deps stripped before decorate/tasks (sub routes have no decorate/tasks, but finalizer strips per child plan); D7 ONE bounded row map + shared gate (peak ≤ `maxHookConcurrency`, stable order, limit-1 completes, no `scheduler.work` held); D8 arbitrary select preserved, registered virtuals stay virtual (never persisted/DB).
- Ordinary parents: no service integration change beyond planner collision fix (VIRT-04 finalizer already wires `childPlans` with children-before-parents, scoped trim, selected containers, omitted-container skip). Verified across list/read/create/update/upsert/new (output values + raw re-read no `nick`), nested array (`contacts.nick`) + single-nested (`profile.summary`) + recursive (`contacts.notes.excerpt`), populated targets (`friend.contacts.nick` via `populate:['friend']`), legacy includes (`target.contacts.nick` via join), parent getter sees `nick:Ann` but `secret:absent` (stripped denied dep).
- Sub routes: `listSub`/`readSub` finalize visible-only rows after `genFilter(subs.*)` + `genQuerySelect` (denial stays `Forbidden`/`NotFound`/`401` route guard; hidden rows never reach getters). `readSub` re-resolves `genSubPopulate` entries and runs `finalizePopulateForSubParent` before sub finalization (target `tvirt` + sub `svirt` both compute, `secret` stripped). Mutation visible rows filter via `isAllowed(read/subs.read[/list])` + parent `read` filter + `findRawParentDoc(_id)` + `subs.read/list` row filters, then finalize with initiating `create`/`update` virtualAccess (verified `c:New` vs `u:Upd`/`u:Bulk`, `createGet` not run on update and vice versa). Selected sub visibility: `select:['nick']` computes `nick` via internal `displayName` fetch then strips `displayName`. Order preserved (stored order, stable index map); denied post-persist succeeds with `[]` (create/bulk) / `null` (single) and skips getters.
- Writes: `genQuerySelect('update'/'create',[sub,'sub'])` already strips via `getVirtualNames(subPaths)`; added sub-scope Mixed sanitization (`meta.nick` evil stripped in sub create/update/bulk, `keep` retained). Verified raw `Model.findById().lean()` has no `nick` top-level or inside `meta` for permissive `strict:false` + `Mixed` + whole-array parent `PATCH contacts:[{displayName,nick:evil}]` + embedded `POST/PATCH` (single/bulk) with evil keys; computed values never persist (output has `nick`, raw lacks it).
- Bounds: sub list 3 rows limit-1 completes with `nick:A/B/C`; ordinary parent 2 rows limit-1 completes peak ≤1; Mixed test 2-way peak ≤2 (measured `active/peak` counters). No deadlock, no persistence permits held.
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router typecheck` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-embedded-subdocuments.integration.test.ts` → 23 passed; combined `test/virtuals-direct-operations.integration.test.ts` + `test/virtuals-populate-include.integration.test.ts` + `test/virtuals-finalizer.unit.test.ts` + `test/virtuals-projection-planner.unit.test.ts` + `test/virtuals-config.contract.test.ts` + `test/virtuals-baseline.contract.test.ts` → 95 passed (7 files); `test/subdocument-mutation-visibility.integration.test.ts` + `test/subdocument-populate-authorization.integration.test.ts` + `test/model-subdocument-routes.integration.test.ts` + `test/arc21-projection-identity-and-count-argument.contract.test.ts` + `test/require-explicit-select.integration.test.ts` + `test/sort-options.integration.test.ts` + `test/distinct-field-authorization.integration.test.ts` → 138 passed (7 files). `git diff --check` clean for tracked changes; new-file whitespace checked via `git diff --no-index --check`. No `CHANGELOG.md` changes.
- Follow-ups: VIRT-10 must note populate-trimming already recorded in VIRT-05 plus embedded recursive policy (container-only DB fetch to avoid path collision) as compatibility note; VIRT-07 root parity must cover `subList/subRead/subCreate/subUpdate/subBulkUpdate` (direct already verified, root via same `PublicService` path per existing visibility tests).

---

### Task VIRT-07: Root/batch + response-pipeline parity

Status: completed

Priority: P1

Suggested agent: backend engineer

Dependencies: VIRT-04, VIRT-05, VIRT-06

Primary ownership:

- `packages/access-router/src/routers/` (root router batch entries)
- `packages/access-router/src/http/response-pipelines/model-response.ts`
- `packages/access-router/src/routers/model-router-collection-routes.ts`, `model-router-document-routes.ts`
- `packages/access-router/test/virtuals-route-parity.integration.test.ts` (new)

Finding:

Root/batch entries and advanced query/mutation routes ultimately call the same `PublicService` methods, but this must be verified rather than assumed — especially advanced list/read/create/update bodies carrying `select`/`populate`/`include`/`tasks`.

References:

- `packages/access-router/src/http/response-pipelines/model-response.ts:1-35`
- `packages/access-router/src/routers/model-router-collection-routes.ts:88-126,161-205`
- `packages/access-router/src/routers/model-router-document-routes.ts:132-209,250-306,344-396`

Implementation requirements:

1. Verify (test, not broad refactor): root/batch model entries return identical virtual-processed data to direct routes for list/read/create/update/upsert/new and dedicated subdocument paths. Compare data after established envelope/status formatting, not unequal direct/root response envelopes.
2. Response formatting (`formatModelListResponse`, `formatModelCreatedResponse`, `formatModelUpsertResponse`, `unwrapServiceData`) stays presentation-only; no second virtual pass.
3. Persisted count/distinct bodies remain unchanged; virtual-name input errors match direct/service behavior. Include denial/metadata-off/default-selection cases and bounded ordered/grouped root execution.

Acceptance criteria:

- Parity tests cover root list/read/create/update, both upsert branches, new template, and subList/subRead/subCreate/subUpdate/subBulkUpdate; include an advanced list with `select+populate+include` and advanced update. Virtual-processed data matches direct fixtures/permissions, with established envelopes/statuses preserved.
- Getter invocation counts prove response formatting does not run a second pass; hidden dependencies/association metadata are absent from direct/root public DTOs.
- If any entry bypasses `PublicService`, fix it to use the shared path (no one-off virtual logic in routers).

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/test/virtuals-route-parity.integration.test.ts` (new, 15 tests). No `src/` changes, no `CHANGELOG.md` changes.
- No router bypass: verified `src/routers/root-router.ts:79-121` all model entries delegate to `getPublicService(...)._list/_read/_create/_update/_upsert/_delete/listSub/readSub/createSub/updateSub/bulkUpdateSub/_distinct/_count` (shared `PublicService` path); `rg "virtual|finalize|getter" src/http/response-pipelines/ src/routers/root-router.ts src/routers/model-router-collection-routes.ts src/routers/model-router-document-routes.ts src/routers/model-router-subdocument-routes.ts` returns no hits — `model-response.ts:8-35` (`unwrapServiceData`/`formatModelListResponse`/`formatModelCreatedResponse`/`formatModelUpsertResponse`) stays presentation-only with no second virtual pass. Collection/document/subdocument routes delegate to `PublicService` + formatting only.
- Fixture: isolated `createAccessRuntime()` + unique `Virt07M/T<tag>` names per test; `Target` (`tFull` virtual) + `Main` (`fullAddress` list/read/create/update, `cOnly` create-only, `uOnly` update-only, `deniedVirt` denied, `contacts.sub.nick` embedded) with `tid` join key for legacy include and `targetRef` ObjectId for populate; `permissionsPlugin` on both models; global `requestPermissionField:_permissions`, `globalPermissions:()=>[]`; model + root routers mounted on same app; `mongoose.deleteModel(/Virt07.*/)` + `clearOpenApiRoutes()` in `afterEach`.
- Parity (data compared after envelope/status formatting): root list/read vs direct `POST __query`/`POST __query/:id` exact `toEqual` (1 row, `fullAddress:addr:*`, `nick:nick:*`, `address`/`secret`/`deniedVirt` stripped); root create (201 `Created`, `data[0]`) vs direct `POST` (201 object) same keys/virtual values ignoring distinct `_id`s, raw re-read has no `fullAddress`; root update (200) vs direct `PATCH` same `fullAddress`; both upsert branches via `PUT` vs root `upsert` (`201` create with `cOnly` only, `200` update with `uOnly` only, same keys); new template via `GET /new` vs root `new` (both `fullAddress:addr:TEMPLATE_ADDR` from schema default, `_id`-ignored equality, `args.select` ignored); subList/subRead vs direct advanced `__query` exact equality (scoped `nick`, order preserved); subCreate (201) vs direct `POST` same keys/`nick`, raw has no evil `nick`; subUpdate exact values ignoring distinct sub `_id`s; subBulkUpdate same `nick`/`displayName` sets; advanced list `select+populate(selective target)+include` exact `toEqual` (target `tFull` computed, `address`/`secret`/`tid` stripped, join keys absent) plus advanced update `PATCH __mutation/:id` vs root `update` with `select+populate` exact equality.
- No second pass: `vi.fn` getter counts equal direct vs root per op (e.g. list `fullGet` N vs N, `nickGet` 1 vs 1, target `tGet` N vs N); hidden deps (`address`), denied (`secret`/`deniedVirt`), join keys (`tid`), and `VIRT_ASSOCIATION` metadata absent from both DTOs (`JSON.stringify` check + `not.toHaveProperty`).
- Denial/metadata-off/default-selection: denied `deniedVirt` omitted + getter never runs in both; `skim:true+includePermissions:false+includeFieldPermissions:false` still computes `fullAddress` identically in both; `defaults.publicListArgs.select:['name','fullAddress']` without client select computes identically in both.
- Count/distinct unchanged + virtual errors match: root `count` returns `2` (persisted), virtual-filtered `count` strips to `2` with no getters; persisted `distinct(name)` sorted equality direct vs root; virtual `distinct(fullAddress)` is `403 Forbidden` (`success:false,code:forbidden`, no `data`) in both, getters never run; virtual `sort:fullAddress` is `400` direct and per-entry `400 BadRequest` via root list.
- Bounded ordered/grouped root: `maxConcurrentOperations:2` batch with `order:0` creates then `order:1` list returns `index:[0,1,2]` sorted, `201/201/200`, list sees both created rows with correct `fullAddress`; `maxBatchEntries:2` with 3 entries rejects `400`.
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-route-parity.integration.test.ts` → 15 passed; `test/virtuals-baseline.contract.test.ts` → 7 passed (serial focused rerun). `git diff --check` clean for tracked changes; `git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-route-parity.integration.test.ts` clean. No `CHANGELOG.md` changes.
- Follow-ups: none. VIRT-10 compatibility notes already own populate-trimming (VIRT-05) + embedded policy (VIRT-06); no new external contract change here.

---

### Task VIRT-08: Request validation + OpenAPI for virtual selections

Status: completed

Priority: P1

Suggested agent: validation engineer

Dependencies: VIRT-01, VIRT-02

Execution note: focused schema/parser/OpenAPI checks can complete independently after VIRT-02. Model-aware database field exclusion and full receiving-scope runtime selection parity are acceptance criteria of VIRT-04/VIRT-05/VIRT-06/VIRT-07, not prerequisites for completing VIRT-08.

Primary ownership:

- `packages/access-router/src/validation/` (`common.ts` projection/populate schemas, `model-router.ts` list/read/create/update bodies)
- `packages/access-router/src/validation/root-router.ts` (matching root argument forms)
- `packages/access-router/src/openapi/` (route registration/schemas)
- `packages/access-router/src/helpers/query.ts:73-95`

Finding:

`select`/`populate` schemas (`src/validation/common.ts:28-86`) and `parseSelectParam` (`src/helpers/query.ts:73-78`) already accept arbitrary string field names; adding virtual names does not require loosening an existing whitelist. Malformed path/operator rejection is not currently a general select guarantee. Any stricter grammar must be an explicit VIRT-00A contract change, while model-aware virtual sort/filter/distinct exclusion is enforced centrally in VIRT-04.

References:

- `packages/access-router/src/validation/common.ts:28-86`
- `packages/access-router/src/helpers/query.ts:73-95`

Implementation requirements:

1. Apply the VIRT-00A selection grammar decision consistently to query/body/root/subdocument/populate target selections. Preserve supported string/array/projection-object shapes and query comma/space/repeated forms; do not silently label newly rejected strings as an old validation guarantee.
2. If stricter grammar was selected, share parsing/validation so service-direct and HTTP entrypoints agree on controlled malformed-path errors and signed-field semantics. Coordinate shared helper edits after VIRT-02; test ordinary supported persisted dotted-path projections.
3. Use the existing OpenAPI open-object/unknown-value capability for virtual response fields unless VIRT-00A records a fuller schema contract. Do not infer concrete response types by running getters. Verify route registration/spec generation and describe optional computed output/selection semantics in shipped docs.
4. Verify direct/root request validation forwards virtual sort/filter/distinct attempts to VIRT-04's model-aware exclusion without bypassing it; do not duplicate database field policy in route-specific schemas. Existing persisted-field operations retain their chosen error/strip posture.

Acceptance criteria:

- Schema/parser tests cover `?select=name,fullAddress`, space/repeated query forms, body/projection-object/root selections, populated and embedded virtual selection forms, and exclusion `['-fullAddress']` under the recorded grammar. Stricter grammar tests explicitly demonstrate the intended new rejection; preserved grammar tests assert safe existing behavior instead.
- OpenAPI registry builds with virtuals configured; snapshot or assertion updated if the repo has one.
- Focused validation/OpenAPI tests pass after serial build. Integration assertions for service database field exclusion are completed with VIRT-04/VIRT-07.

Completion evidence (2026-10-05):

- Changed files: `packages/access-router/src/helpers/query.ts` (shared comma/space splitting in `normalizeSelect` so service-direct string `"name,fullAddress"` ≡ `"name fullAddress"` ≡ `["name","fullAddress"]`, matching `parseSelectParam` comma/space/repeated HTTP forms; empty/blank collapses with no `""` tokens; dotted persisted paths and arbitrary strings preserved per D8 + VIRT-08 JSDoc), `src/validation/common.ts` (VIRT-08 JSDoc on `projectionSchema`/`populateSchema`/`subPopulateSchema`/`fieldsSchema`: preserved arbitrary-string grammar, virtual names pass through, no whitelist/stricter grammar, no getter execution), `src/validation/model-router.ts` + `src/validation/root-router.ts` (forwarding notes: virtual sort/filter/distinct pass validation untouched to VIRT-04 model-aware service exclusion, no duplicated DB policy), `src/openapi/responses.ts` (JSDoc: existing open-object/unknown-value `additionalProperties:true` carries optional computed virtuals, no getter-derived schemas), `test/virtuals-validation-openapi.contract.test.ts` (new, 17 tests). No `CHANGELOG.md` changes.
- Frozen contracts respected: D8 preserved grammar throughout (no new malformed-path rejection, no compatibility break); registered virtuals stay virtual (planner/service exclusion in VIRT-02/VIRT-04 untouched); OpenAPI uses existing open-object capability with no getter run for spec generation; sort/filter/distinct forwarding verified without duplicating policy.
- Coverage (17 tests): `projectionSchema` string/array/object + `-fullAddress`/`{fullAddress:-1}`; dotted `address.city` + unregistered arbitrary accepted (safe existing behavior); `parseSelectParam` comma/space/repeated/empty; `normalizeSelect` ≡ `parseSelectParam` agreement + object/exclusion/dotted/empty-collapse; query schemas (`list/read/update`) accept virtual selects; body array/string/object/exclusion; root list/read/subList virtual forms; populate (`{path,select:[tFull]}`/`{tFull:1}`) + sub-populate + `fieldsSchema` (`nick`/`-nick`) + legacy include passthrough; `sortSchema` + body `filter`/`sort` accept virtuals (validation forwards); HTTP `GET ?select=name,fullAddress` vs space vs repeated all compute `fullAddress:addr:a1` identically; body array vs object compute; `-fullAddress` skips getter; populate `tFull:t:ta1` + embedded `nick:nick:Ann` (`secret` stripped) compute; root list `toEqual` direct; dotted projection alongside virtuals computes; dedicated `GET /:id/contacts` + `POST /:id/contacts/__query {select:[nick]}` compute `nick`; validation-level sort/filter accept then service controls (`sort:fullAddress` → `400`, `filter:{fullAddress:evil}` → `200` stripped 1 row, `distinct/fullAddress` → `403` with getter never called); OpenAPI `GET /openapi.json` builds with virtuals, `select` param documented, list rows + single responses `additionalProperties:true`, getter spy uncalled, no `computed` leakage into spec.
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-validation-openapi.contract.test.ts` → 17 passed; regression `test/arc21-projection-identity-and-count-argument.contract.test.ts` + `test/require-explicit-select.integration.test.ts` + `test/sort-options.integration.test.ts` + `test/distinct-field-authorization.integration.test.ts` → 34 passed; `test/virtuals-baseline.contract.test.ts` + `test/virtuals-config.contract.test.ts` + `test/virtuals-projection-planner.unit.test.ts` + `test/virtuals-finalizer.unit.test.ts` → 43 passed; `test/virtuals-direct-operations.integration.test.ts` + `test/virtuals-populate-include.integration.test.ts` + `test/virtuals-embedded-subdocuments.integration.test.ts` + `test/virtuals-route-parity.integration.test.ts` + `test/openapi.test.ts` → 75 passed (one transient limit-1 ordering failure on first combined run, clean on rerun + isolated 23/23); `pnpm --filter @web-ts-toolkit/access-router typecheck` passed; `git diff --check` clean for tracked changes; new-file whitespace checked via `git diff --no-index --check`.
- Follow-ups: none. VIRT-04/VIRT-05/VIRT-06/VIRT-07 own full DB exclusion parity and receiving-scope runtime selection; VIRT-10 owns README/llms populated/embedded guidance reusing this grammar.

---

### Task VIRT-09: Hardening — collisions, errors, bounds, persistence isolation

Status: completed

Priority: P1

Suggested agent: hardening engineer

Dependencies: VIRT-04, VIRT-05, VIRT-06, VIRT-08

Primary ownership:

- `packages/access-router/src/runtime.ts:99-155,426-457`
- `packages/access-router/src/request-complexity.ts:1-74`
- Finalizer module from VIRT-03
- Focused boundary tests; coordinate any corrections to VIRT-01–VIRT-06 ownership

Finding:

Core collision validation, fail-closed evaluation, bounds, and write isolation are implementation requirements of VIRT-01–VIRT-06. This task cross-checks those guarantees across alternate entrypoints and fixes evidenced gaps; it must not become their first enforcement point.

Implementation requirements:

1. Cross-path configuration checks: real root/child-schema stored-path collisions, malformed descriptors/dependencies/accesses, protected metadata equal/ancestor/descendant overlaps, runtime replacement/removal, rejected mutation rollback, and captured in-flight descriptor/permission coherence. Do not replace child-schema checks with `getModelAtt()` top-level keys.
2. Cross-path runtime checks: getter throw/undefined/absent dependency omits the field, present falsy inputs work, definite/post-fetch denial never invokes getters, and nested mutation/returned-value aliasing cannot alter sibling output or lifecycle snapshots.
3. Validate request include/virtual overlap preflight at each receiving scope and preserve raw association/correlated inputs privately. Test ordinary nonvirtual collision controls and ensure no private plan/result metadata crosses serializers.
4. Record peak active getter/finalizer work for many rows and nested related/embedded cases under the VIRT-00A scope. No unbounded row fan-out, and recursive limit-1 cases complete. Getters' trusted direct DB/network I/O remains outside leaf persistence admission; bounded getter scheduling must be described accurately.
5. Prove client virtual input never persists under permissive schemas/Mixed/whole-container grants across direct/root/internal create/update/upsert/subdocument entrypoints. Confirm registered names stay excluded from database operations even when their output rule is `true` or their getter is inapplicable.
6. Capture logs with a secret present in getter input and thrown error text; structural failure logs must contain neither. Metadata-off / `stripPermissionsField` / `disableFieldPermissions` / `exposedDocPermissionKeys` must not change virtual authorization inputs.

Acceptance criteria:

- Tests verify the cross-path cases above, including alternate entrypoints, aliasing and private-metadata boundaries, permissive-schema stored writes, runtime mutation coherence, and measured work limits.
- Any uncovered gap is corrected and reverified in its owning module before this task completes; independent optional findings become separately numbered follow-ups with priority/owner.
- `pnpm lint` passes.

Completion evidence (2026-10-06):

- Changed files: `packages/access-router/test/virtuals-hardening.boundary.test.ts` (new, 23 tests), `src/request-complexity.ts` (`maxHookConcurrency` scope JSDoc — the option previously had no doc; now records the VIRT-00A D7 ceiling accurately: getter + row-finalization orchestration only, not persistence admission, trusted getter DB/network outside leaf ceiling, limit-1 completes), `src/services/base.ts` (comment-only: documents the verified finding that nested `args.include` inside correlated entries already shares the legacy nested-preflight branch against the intermediate target scope), `test/virtuals-embedded-subdocuments.integration.test.ts` (VIRT-06 owning-test correction: order-dependent `data[0]` assertion made deterministic via `sort: 'name'` + by-name lookup). No `CHANGELOG.md` changes. No behavior change in any enforcement path — all 23 hardening tests pass against VIRT-01–VIRT-06 enforcement, per the "not first enforcement" rule.
- Req 1 (config cross-path, 7 tests): root collision via bulk `setModelOptions`; single-nested `profile.summary` collision proving real child-schema inspection (top-level `Object.keys(schema.obj)` would miss `summary`); array-child collision + dotted-setter misuse rejected with prior config preserved; malformed descriptors/deps/accesses across constructor/bulk/dotted entrypoints (non-callable getter, dotted `dependsOn`, non-array `dependsOn`, unknown-field dep, virtual-to-virtual, `delete`/`bogus` accesses); metadata equal (`auth` vs `auth`) / ancestor (`auth` vs `auth.token`) / embedded-descendant (`contacts` vs `contacts.nick`) overlaps plus `documentPermissionField` revalidation rollback; replacement/removal with frozen copy-on-write snapshots + function-identity preservation + `isVirtualField` false after removal; in-flight coherence via bulk-replacement mid-finalization (in-flight returns `old`, next op returns `new`).
- Req 2 (runtime cross-path, 4 tests): throw/undefined/absent-dep omit on list AND read; present falsy (`0`/`false`/`null` with `dependsOn` covering all three) computes; explicit-`false`/function-denied/inapplicable (`create`-only on list) getters never run; document-dependent `canViewGated` defers to post-fetch (granted doc computes, denied doc omits, 1 getter call); nested input mutation + returned-object aliasing cannot alter sibling getters, output, raw stored docs, or snapshots (2-row isolation + raw re-read proof).
- Req 3 (preflight + private transport, 4 tests): include path equal (`fullAddress`) / descendant (`fullAddress.city`) vs virtual fails `400` before target dispatch (target getter never runs); nested legacy `args.include` preflighted against the target scope while ordinary non-virtual paths stay permitted; nested correlated `args.include` verified upfront-`400` with zero main/target `find`/`findOne` dispatches (discrimination probe during development confirmed the shared legacy branch already covers correlated nesting — comment recorded in `base.ts`) plus ordinary nested correlated still `200`; legacy list join with denied FK attaches correctly while association-only keys stay out of DTOs/JSON/getter input (getter sees `undefined` FK), no `VIRT_ASSOCIATION`/private symbols cross serializers.
- Req 4 (bounds, 3 tests): 12 rows × 2 getters at `maxHookConcurrency: 2` → peak ≤ 2 with stable DB-sorted order; nested populate+embedded at limit 1 completes (documented pre-existing `populateAccess ?? 'read'` default: list-query populate needs a read grant on the parent path, preserved behavior, not a gap); trusted per-row `Addr.findById` getter I/O at limit 1 completes with correct values (outside leaf persistence admission, accurately described in the new `request-complexity.ts` JSDoc). No unbounded `Promise.all`; one bounded row map + shared gate.
- Req 5 (persistence isolation, 3 tests): permissive `permissionSchema: true` + `strict: false` + `Mixed` + whole-container grants — direct create/update/upsert-create/upsert-update, root batch create, internal `Service.create`/`updateById` via `req.macl.getService`, and subdocument create/update/bulk all strip top-level/Mixed/embedded evil keys (raw re-read proof, snapshots never hold computed output); bare-`true` rules and inapplicable (`create`-only) virtuals still excluded from DB ops (virtual sort → `400`, virtual filter stripped match-all, virtual distinct → `403` via `GET /distinct/:field`, inapplicable getter never runs).
- Req 6 (logs + metadata, 2 tests): getter throwing an error containing a secret + secret-valued input address → `warn` spy payload contains neither value (allowlisted `modelName/scope/field/accesses/operation/category` only); `skim` + metadata-off + `stripPermissionsField` + `disableFieldPermissions` + `exposedDocPermissionKeys: []/['canView']` all compute the doc-dependent virtual identically (auth inputs use full internal grants, never serialized metadata).
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run ... test/virtuals-hardening.boundary.test.ts` → 23 passed; all 10 virtuals files → 150 passed; posture/sort/distinct/subdocument/metadata/redaction batch (10 files) → 196 passed; `pnpm --filter @web-ts-toolkit/access-router typecheck` passed; `pnpm lint` passed (exit 0); `git diff --check` clean + new-file whitespace clean. No `CHANGELOG.md` changes.
- Full package `pnpm --filter @web-ts-toolkit/access-router test`: 1399 passed / 1 failed + 2 file-level collection errors, all proven pre-existing and out of VIRT scope: `test/service.internal.test.ts` fails identically with VIRT-09 src edits stashed (src-direct circular import `Class extends value undefined`, same signature for `test/concurrency.test.ts` which shares the src-direct import pattern); `test/nested-update-integrity.integration.test.ts` ABB-02 upsert 500 contains zero virtual content and fails standalone. VIRT-06 order-flake found during this task was fixed above (was the 4th full-suite failure; now green).
- Follow-ups: none. No P0/P1 gap found; the two investigated behaviors (populate `read`-default, doc-hook input = fetched projection + `alwaysSelectFields` escape hatch) are pre-existing preserved contracts, documented in-test, not defects.

---

### Task VIRT-10: Public TypeScript surface + packaging + docs (ai-friendly)

Status: completed

Priority: P2

Suggested agent: typescript api designer

Dependencies: VIRT-07, VIRT-08, VIRT-09, VIRT-11

Primary ownership:

- `packages/access-router/src/index.ts`
- `packages/access-router/src/advanced.ts`
- `packages/access-router/package.json`
- `packages/access-router/tsup.config.ts`
- `packages/access-router/README.md`
- `packages/access-router/llms.txt`
- `packages/access-router/dist/*.d.ts` (generated verification only)
- `packages/access-router/dist/*.d.mts` (generated verification only)
- `packages/access-router/test/export-contract.test.ts`, `documentation-examples.test.ts`, `strict-consumer-types.test.ts`, `packed-consumer-compatibility.test.ts`

Finding:

Per the `ai-friendly-ts-package` skill, installed consumers see `package.json` + `dist` declarations + `README.md`. New `virtuals` types must be reachable from public entrypoints with canonical import examples and editor-usable JSDoc — not buried in internal modules.

References:

- `packages/access-router/package.json:23-94`
- `packages/access-router/src/index.ts:1-180`
- `packages/access-router/src/advanced.ts:1-4`

Implementation requirements (smallest effective set):

1. Verify VIRT-01's virtual types are reachable from the root and existing `./advanced` interface barrel; do not invent subpaths. Confirm optional virtual output generic propagation, persisted getter/Filter typing, and dotted setter contextual types against strict installed-consumer fixtures.
2. Verify `exports` ↔ `tsup` entries ↔ `dist` outputs agree, including conditional `.d.ts` / `.d.mts` declarations; `main`/`module`/`types` point at real files, and package files still include README/llms/dist. Use the real publication transformation already exercised by the packed-consumer suite rather than treating a workspace dry-run as release-layout proof.
3. Add JSDoc on `ModelRouter.virtuals`, descriptors, scope-aware context, and one end-to-end select/permission-schema example; ensure JSDoc survives both emitted declaration forms.
4. README: shortest typed happy-path with a persisted model lacking `fullAddress`, a virtual definition + permission rule + selection, and output optionality. Include lean/hydrated parity, populate/include/embedded coverage, access matrix, missing/throw behavior, dependency stripping, output-only database/write restrictions, and the existing trusted decorate/tasks boundary. Use the repository's canonical default/named import shape.
5. Add VIRT-11's measured N+1/bounded-concurrency guidance and define the limit's actual scope. Prefer finalized populated/included fields where possible; do not imply a parent getter can read a related model's stripped internal data.
6. Record compatibility notes for target-model populate trimming (including targets without virtuals), any approved stricter selection grammar, embedded recursive policy application, and any approved mutation/new selection behavior change. Update the repository's existing release-note mechanism when implementation lands; record the actual file, avoid inventing one, and do not silently describe changed output as backward-compatible.
7. Update the shipped `llms.txt` after metadata/declarations/README are correct; keep it index-like. Check website docs for drift and link corrected published guidance where needed.

Acceptance criteria:

- `npm pack --dry-run` from `packages/access-router` verifies intended workspace files; the existing packed-consumer suite verifies the transformed publication layout, package-name imports, conditional declarations, and ESM/CJS compatibility.
- `test/export-contract.test.ts`, `test/documentation-examples.test.ts`, `test/strict-consumer-types.test.ts`, and `test/packed-consumer-compatibility.test.ts` pass serially after build. New typed README examples are compiled against shipped declarations, not repo source path aliases.
- Compatibility notes explicitly describe each approved external output/validation change, and emitted declarations expose optional virtual values and scoped context from documented entrypoints.
- If both default and named exports exist for access-router, README states the canonical import style explicitly.

Completion evidence (2026-10-06):

- Changed files: `packages/access-router/src/interfaces/router-hooks.ts` (JSDoc only: expanded `ModelVirtualDescriptor` with view/commit semantics + `@example`, expanded `ModelVirtualContext` with embedded/related grant source, added end-to-end typed `User`/`UserVirtuals` `@example` on `ModelVirtuals`), `src/interfaces/root.ts` (JSDoc only: expanded `ModelRouterOptions.virtuals` with lean/hydrated parity, output-only restrictions, + shortest happy-path `@example`), `src/routers/model-router.ts` (JSDoc only: expanded `ModelRouter.virtuals` with root/advanced reachability, no-new-subpaths, optional-output note + happy-path `@example` incl. `virtuals()`/`set()` dotted forms), `packages/access-router/README.md` (new `## Virtuals (computed fields)` section + `### Virtuals compatibility notes` subsection; purely additive), `packages/access-router/llms.txt` (index-like virtuals entry + one `partial` snippet + Pointers update). No `src/` behavior change, no new subpaths, no `CHANGELOG.md` changes (explicit user constraint; see release-note record below).
- Req 1 (reachability, no new subpaths): virtual types reachable from root (`src/index.ts:212-222` re-exports `ModelVirtualAccess/RecordAccess/Context/Doc/Getter/Descriptor/AccessRecord/Leaf/Virtuals`, `VirtualSubModel`, `WithVirtuals`) and from existing `./advanced` barrel (`src/advanced.ts` → `interfaces/index` → `root.ts:57` → `router-hooks.ts`; `dist/advanced.d.ts` exports all `ModelVirtual*` + `VirtualSubModel` + `WithVirtuals`). `package.json` exports still exactly `.`, `./advanced`, `./processors`. Optional output propagation (`SelectedPublicOutput<User, [...], TVirtuals>` keeps virtuals optional), persisted getter view (`Readonly<Partial<TModel>>`, never `Record` for known models), persisted `Filter` narrowing (virtual keys rejected), and dotted setter contextual types (`virtuals.<K>`/`<K>.<access>` overloads incl. `@ts-expect-error` unknown fields) all covered by existing `test/strict-consumer-types.test.ts` ARF-14 virtual fixtures (7 passed, unchanged).
- Req 2 (packaging agreement): `exports` ↔ `tsup.config.ts` entries (`src/index.ts`, `src/advanced.ts`, `src/processors.ts`, single invocation) ↔ `dist` outputs agree, incl. conditional `types.import → .d.mts` / `require → .d.ts` for all three subpaths; `main`/`module`/`types` point at real emitted files (`dist/index.js/.mjs/.d.ts`); `files` still `["README.md", "llms.txt", "dist"]`. Verified by workspace `npm pack --dry-run` (17 files incl. `README.md`/`llms.txt`/`dist/*.{js,mjs,d.ts,d.mts}`, no `src/`) plus the real publication transformation: `test/packed-consumer-compatibility.test.ts` (7 passed) builds the production manifest via the real `createPublishPackageJson` from `@repo-toolkit/publish-package`, round-trips `pnpm pack` tarballs and the `pnpm build-artifact` tree, and runs ESM/CJS/NodeNext/Bundler consumers against both layouts.
- Req 3 (JSDoc, both declaration forms): JSDoc present on `ModelRouter.virtuals`, descriptors (`ModelVirtualDescriptor`), scope context (`ModelVirtualContext`), and end-to-end select/permission-schema examples (`ModelVirtuals`, `ModelRouterOptions.virtuals`, `ModelRouter.virtuals`). After serial build, the JSDoc (incl. both `@example` texts "Shortest typed happy-path" and "End-to-end typed virtual") is present in BOTH emitted declaration forms (`dist/parsers-*.d.ts` and `dist/parsers-*.d.mts`, re-exported from `dist/index.d.ts/.d.mts` and `dist/advanced.d.ts/.d.mts`).
- Req 4 (README): shortest typed happy-path with persisted `User` lacking `fullAddress` (definition + `canViewAddress` permission rule + `select` + optional `SelectedPublicOutput`), compiled against shipped declarations via `test/documentation-examples.test.ts` (new `partial` block, strict `noUnusedLocals` clean). Prose covers lean/hydrated parity, populate/include/embedded coverage, the full D1 access matrix table, missing/`undefined`/throw fail-closed behavior, dependency stripping, output-only DB/write restrictions, and the trusted decorate/tasks boundary. Uses the canonical shape (`import acl from ...` default for the runtime API, named `createAccessRuntime` for isolation, `./advanced` for output types) consistent with the existing "Import styles" section (default preferred).
- Req 5 (VIRT-11 guidance): README records the measured evidence verbatim from VIRT-11 (24 rows x 2 getters at limit 4: per-row `findById` = 25 driver reads vs finalized-populate getter = 2 reads, identical output, same peak bound 4), defines `maxHookConcurrency` (default 10) scope exactly as frozen (per-request/per-runtime concurrently-awaited getter + row-finalization orchestration only; not a per-row multiplier, persistence admission, or connection limit; trusted getter I/O outside the leaf ceiling; bounds limit simultaneous work, not query counts). Guidance prefers finalized populated/included fields and states parent getters see only finalized outputs, never a related model's stripped private fields.
- Req 6 (compatibility notes + release-note mechanism): README "Virtuals compatibility notes" explicitly lists (a) target-model populate trimming now applying incl. no-virtual targets as an INTENDED behavior change (previously leaked `alwaysSelect`-forced fields; not described as backward-compatible), (b) selection grammar UNCHANGED per D8 (no stricter grammar adopted, no break to note), (c) embedded recursive policy (scoped `sub` rules, children-before-parents, container-only DB fetch avoiding path collision, omitted containers never exposed), (d) mutation/`new` selection UNCHANGED (`_create`/`_update` post-decorate picks preserved, `new()` still ignores `args.select`). Existing release-note mechanism: generated workspace `CHANGELOG.md` via `pnpm changelog` (`repo-toolkit-changelog` from conventional commits); that generated file was intentionally NOT hand-edited per explicit user constraint. The shipped consumer record of these notes is this README section (actual file: `packages/access-router/README.md`); no release-note file was invented.
- Req 7 (llms.txt + website drift): `llms.txt` updated after metadata/declarations/README were correct; entry stays index-like (one-paragraph contract + one `partial` snippet, both compiled in the docs suite) and Pointers now lists the virtuals README section. Website drift checked: `website/docs/packages/access-router/*.mdx` contains no virtuals coverage (only an unrelated `virtualPermissionField` mention in `hooks.mdx`); the marked website blocks (`configuration.mdx`, `routing.mdx`) still compile in the docs suite (33 passed). No website page invented; README "Documentation" section already links the live docs where a future virtuals page belongs.
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `test/export-contract.test.ts` → 41 passed; `test/documentation-examples.test.ts` → 33 passed (incl. new README + llms virtuals blocks compiled against staged `dist` + complete-runtime workflows executed); `test/strict-consumer-types.test.ts` → 7 passed; `test/packed-consumer-compatibility.test.ts` → 7 passed (real transform + ESM/CJS/NodeNext/Bundler consumers, both tarball and build-artifact layouts); `tsc --noEmit -p tsconfig.typecheck.json` → exit 0; `pnpm lint` → clean; `npm pack --dry-run` → 17 files as above; `git diff --check` clean. No `CHANGELOG.md` changes.
- Follow-ups: none. VIRT-12 owns final independent review.

---

### Task VIRT-11: Performance + N+1 guidance verification

Status: completed

Priority: P2

Suggested agent: performance engineer

Dependencies: VIRT-04, VIRT-05, VIRT-06, VIRT-09

Primary ownership:

- Finalizer + planner (read-only measurement)
- `packages/access-router/test/` focused performance probes and stable work/query-count checks
- This task document (measurement evidence and proposed README guidance for VIRT-10)

Finding:

The motivating example (`Address.findById` per user doc) is N+1-prone on list endpoints. Row/getter bounds are already required by VIRT-03/VIRT-04; this task measures remaining query/latency cost and documents guidance rather than delaying correctness mitigation until a benchmark looks pathological.

Implementation requirements:

1. Measure representative list sizes (including many rows × multiple getters) with per-doc getter I/O vs finalized populated-data getters. Record row/getter counts, adapter query counts, configured limits, peak active getter work, and timings; timing results are evidence, not flaky pass/fail thresholds.
2. Confirm bounds already implemented by VIRT-03/VIRT-04 hold under nested related/embedded outputs. If evidence reveals a correctness-bound failure, add a uniquely numbered P0/P1 follow-up with owner/verification, fix it through the implementation owner, and remeasure before VIRT-12. Do not add a dataloader or persistence-permit wrapper around recursive hooks as an incidental mitigation.
3. Draft README guidance for VIRT-10: prefer authorized finalized populate/include data (e.g. `doc.address` objects) over direct DB calls per list row, and explain that concurrency bounds limit simultaneous work but do not remove N+1 query counts.

Acceptance criteria:

- Evidence note records row/getter/query counts, peak concurrency, timings, limit scope, and concrete guidance; any bound failure has been corrected and reverified.
- No new unbounded parallelism; existing scaling tests pass.

Completion evidence (2026-10-06):

- Changed files: `packages/access-router/test/virtuals-performance.probe.test.ts` (new, 3 tests; measurement only, no `src/` changes) + this task document (VIRT-11 section only). No `CHANGELOG.md` changes. No dataloader, no persistence-permit wrapper, no planner/finalizer edits (read-only measurement per primary ownership).
- Probe A (per-doc getter I/O, N+1 shape): 24 rows x 2 getters (48 invocations: `addrLabel` via real `Addr.findById` per row + `upperName` pure with 8 ms overlap delay), `maxHookConcurrency: 4`. Peak active getter work = 4 (≤ 4, > 0), stable DB-sorted order, all 24 labels correct. Getter DB calls = 24; mongoose-debug driver reads = 25 (`users.find`: 1 + `addrs.findOne`: 24); driver total = 25. Timing ~130–141 ms in-memory (evidence only, delay-dominated; run2: 140.7 ms).
- Probe B (finalized populated-data getters): same 24 rows x 2 getters (48 invocations, 8 ms overlap delay, zero per-row DB; `addrLabelViaPop` reads finalized `doc.addrId.label` after `populate: [{ path: 'addrId', select: ['label'] }]`), `maxHookConcurrency: 4`. Peak = 4 (≤ 4, > 0), same 24 labels + upper names correct, stable order. Getter DB calls = 0; driver reads = 2 (`users.find`: 1 + `addrs.find`: 1 batched `$in`); driver total = 2. Timing ~138–166 ms in-memory (run2: 166.2 ms). Query-count reduction vs A: 25 → 2 driver reads (12.5x), 24 → 0 per-row getter DB calls, with identical logical output.
- Probe C (nested bounds, VIRT-03/VIRT-04 hold): 12 rows with `top` + embedded `contacts.nick` + populated `targetRef.tVirt` sharing one `SharedHookGate`, `maxHookConcurrency: 2`. Peak = 2 (≤ 2, > 0), stable sort, all rows have `top`/`nick`/`tVirt: t:ta1`; `nick` x12, `top` x12, target getter called. Driver reads = 2 (`mains.find`: 1 + `targets.find`: 1). Limit-1 slice (4 rows, `maxHookConcurrency: 1`) completes without deadlock, peak = 1 (≤ 1). No unbounded `Promise.all`; one bounded row map + shared gate throughout.
- Bounds conclusion: VIRT-03/VIRT-04 bounds hold under nested outputs (peaks ≤ limits, limit-1 completes, order stable). No correctness-bound failure found, so no P0/P1 follow-up was added. Limit scope (for VIRT-10): `maxHookConcurrency` (default 10) is a per-request/per-runtime ceiling on concurrently awaited getter + row-finalization orchestration only — not a per-row multiplier, not leaf persistence admission, not a process-wide connection limit; trusted getter DB/network I/O runs outside the leaf persistence ceiling; bounds limit simultaneous work but do not remove N+1 query counts.
- Draft README guidance for VIRT-10 (proposed, not yet applied): "Prefer authorized finalized populate/include data over per-row DB calls. On list endpoints, a virtual that does `Address.findById` per document issues N queries (measured 24 rows → 25 driver reads) even though peak active work stays ≤ `maxHookConcurrency`. The same label via `populate: [{ path: 'addrId', select: ['label'] }]` and a getter reading the finalized `doc.addrId` object issues 2 driver reads total with identical output and the same peak bound. `maxHookConcurrency` limits how many getters/rows run at once, not how many queries they issue — it will not collapse N+1 into 1. Parent getters see only finalized related/embedded outputs and must not rely on a related model's stripped private fields (target trim applies to populate and include, including no-virtual targets)."
- Verification (serial, per `AGENTS.md`): `pnpm --filter @web-ts-toolkit/access-router... build` passed; `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-performance.probe.test.ts` → 3 passed; combined 11 virtuals files → 153 passed (baseline/config/planner/finalizer/direct/populate-include/embedded/route-parity/validation-openapi/hardening/performance); `pnpm lint` passed (0 errors, 0 warnings after probe cleanup); `git diff --check` clean for tracked changes; new-file whitespace clean. No `CHANGELOG.md` changes.
- Follow-ups: none. No P0/P1 bound failure; VIRT-10 owns README/llms application of the draft guidance above.

---

### Task VIRT-12: Final independent integration review

Status: completed (signed off 2026-10-06 — zero P0/P1 open, all mandatory verification green)

Priority: P0

Suggested agent: independent reviewer (not the implementer of VIRT-01–VIRT-11)

Dependencies: VIRT-00, VIRT-00A, VIRT-01, VIRT-02, VIRT-03, VIRT-04, VIRT-05, VIRT-06, VIRT-07, VIRT-08, VIRT-09, VIRT-10, VIRT-11; all required follow-ups discovered during execution

Primary ownership (review and run verification; implementation corrections remain with their owners):

- All files above
- `pnpm build`, `pnpm test`, `pnpm lint`, package `typecheck`, pack surface

Finding:

Large delegated plans need an independent reviewer to verify each acceptance criterion against runtime behavior, not just code reading.

Implementation requirements (reviewer):

1. Re-verify every task's acceptance criteria against runtime behavior and the completed VIRT-00A decision matrix, including all approved external contract changes.
2. Security sweep: receiving-model/scoped field policy across direct/populate/include/embedded outputs; global-vs-document-deferred authorization; denied getters never run; internal virtual/join/correlated data never crosses public DTOs; submitted/computed virtual keys never persist under permissive/whole-container fixtures; virtual names never reach database field operations.
3. Isolation/order sweep: nested getter mutation/throw and returned-value aliasing cannot change lifecycle snapshots or another response; children finalize before parents; sibling order is deterministic; captured config is coherent; decorate/tasks receive dependency-stripped ordinary output under the documented trusted-context presentation boundary. Do not demand a new post-decorator authorization pass absent from the frozen contract.
4. Bounds sweep: many rows × multiple getters, nested includes/populate/embedded data, root batches, and limit-1 recursion respect the recorded scope without persistence-admission deadlocks. Structural failure logs contain no raw values or secret-bearing exception text.
5. Boundary sweep: supported persisted delete/exists/distinct/count outputs retain their contract; virtual field errors are controlled; new/mutation selection behavior matches the recorded decision; direct/root/subdocument parity and OpenAPI registration hold.
6. Public-surface sweep: strict installed-consumer inputs/optional selected outputs, both declaration forms, canonical imports, README examples, compatibility notes, and the real transformed packed artifact.
7. Run and record serially: `pnpm build`, `pnpm test` (full serial), `pnpm lint`, `pnpm --filter @web-ts-toolkit/access-router typecheck`, pack/dry-run inventory, and patch whitespace checks. The full package/repository run must include the named export/docs/strict/packed-consumer suites; record actual results and environment blockers.
8. Add uniquely numbered follow-ups for new findings with priority/owner/dependencies/verification. P0/P1 findings block sign-off until fixed and verified; only optional P2 work may be deferred with rationale and residual risk.

Acceptance criteria:

- Reviewer sign-off comment in this file listing verified commands + results.
- Zero P0/P1 gaps open, all mandatory verification passed, and VIRT-00A decisions are implemented consistently. A follow-up ticket alone does not waive an unresolved required gap.

Reviewer verification record (2026-10-06, independent reviewer; NOT granted — blocked by VIRT-12-F01):

- Scope reviewed: full task file (VIRT-00 through VIRT-11 evidence + VIRT-00A D1–D8) and the combined worktree, which also contains the in-flight parallel OAV track (`docs/tasks/20261005-131819-access-router-operation-access-variants.md`, `src/operation-access.ts`, `src/acl/populate-access.ts`, `test/operation-access-*.test.ts`). No `CHANGELOG.md` changes made or required by this review.
- VIRT acceptance re-verification (all serial, after a clean serial build; env: node v26.7.0, pnpm 11.18.0):
  - `pnpm build` → EXIT 0 (full workspace; log `<tool-output>/build-virt12.log`).
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` → EXIT 0 (rebuild + `tsc --noEmit -p tsconfig.typecheck.json`).
  - All 11 virtuals suites → 153/153 passed, run serially in 6 focused invocations: baseline 7, config 8, planner 14, finalizer 14 (43/43 in one run); direct-operations 19; populate-include 10; embedded-subdocuments 23; route-parity 15 + validation-openapi 17 (32/32); hardening 23 + performance-probe 3 (26/26).
  - Public-surface suites, each in isolation → all green: `test/export-contract.test.ts` 41 passed; `test/documentation-examples.test.ts` 33 passed; `test/strict-consumer-types.test.ts` 7 passed; `test/packed-consumer-compatibility.test.ts` 7 passed (real publication transform via `createPublishPackageJson`, ESM/CJS/NodeNext/Bundler, tarball + build-artifact layouts).
  - Spot checks: hardening `-t "secret"` (log redaction) passed; direct `-t "sortableFields"` (virtual sort → controlled `400`, getter never runs) passed.
  - `pnpm lint` → EXIT 0. `npm pack --dry-run` (from `packages/access-router`) → 17 files (`README.md`, `llms.txt`, `dist/*.{js,mjs,d.ts,d.mts}`, no `src/`). `git diff --check` → clean (exit 0); new-file whitespace probes emit no warnings (bare `git diff --no-index --check -- /dev/null <file>` prints nothing; its exit 1 is the expected "files differ" signal, not a whitespace error).
- Security/isolation/bounds/boundary sweeps: no new P0/P1 gap inside VIRT scope. Denied getters never run (explicit-deny + function-deny + inapplicable-access covered by finalizer/direct/hardening suites, all green); submitted/computed keys never persist under `strict:false`/Mixed/whole-container fixtures incl. subdocument writes (hardening req-5 + direct bulk tests, green); virtual sort/filter/distinct controlled at the service boundary (`400`/strip/`403`, getters uncalled); `VIRT_ASSOCIATION_*`/`POPULATE_TARGET_PLAN` metadata is symbol-keyed, non-enumerable, absent from DTOs/JSON/getter input (hardening req-3, green); nested mutation/throw aliasing, children-before-parents, deterministic sibling order, coherent in-flight snapshots, decorate/tasks stripped-input boundary (finalizer + hardening req-2, green); 12 rows × 2 getters peak ≤ limit, limit-1 nested/root recursion completes, structural logs carry allowlisted keys only with secret-in-error redaction (performance probe + hardening req-4/req-6, green); delete/exists/distinct/count scalar contracts unchanged and getter-free; `new()` still ignores `args.select` per D6; direct/root/subdocument parity + OpenAPI registration hold (route-parity 15 + validation-openapi 17, green).
- Public-surface sweep: virtual types reachable from root and existing `./advanced` barrel with no new subpaths (`exports` exactly `.`, `./advanced`, `./processors`; `main`/`module`/`types` point at real `dist` files; `files` still `README.md`/`llms.txt`/`dist`); JSDoc with both `@example` texts present in both emitted declaration forms (`.d.ts` and `.d.mts` via `dist/parsers-*.d.ts/.d.mts`, re-exported from `index`/advanced entries); README shortest happy-path + access-matrix table + N+1 guidance (24 rows: 25 vs 2 driver reads) + compatibility notes (populate trimming incl. no-virtual targets as intended change; selection grammar + mutation/`new` selection unchanged) all present; `llms.txt` index entry present; canonical default/named import shapes match the existing "Import styles" section.
- Full serial `pnpm test` → EXIT 1: access-router package `1420 passed / 5 failed` (83 files); all earlier workspace packages green. All 5 failures are in the OAV track's `test/operation-access-boundaries.integration.test.ts` ("OAV-05 populate input boundaries › retains custom-only target fields and document grants through … populate finalization": list/read/descriptor/include/subquery). Zero virtuals tests fail in the full run.
- Root cause (code inspection, no VIRT-area fix applied per reviewer constraints): `src/core.ts:396-402` (VIRT-05) coerces any non-`list`/`create`/`read`/`update` `populateAccess` to `'read'` (`planAccess`) for the retained target plan/finalization, while query-level `isAllowed`/`genSelect`/`genFilter` (same function, `:374-:381`) still use the real custom access. A trusted-custom target access (e.g. OAV's `inspection`, which OAV explicitly preserves: "existing trusted custom access strings outside the new reserved variants retain their previous behavior") therefore fetches under `inspection` grants but trims/finalizes under `read`: granted target fields are denied, output collapses to `{ _id }`, and `docPermissions('inspection')` never runs. Fail direction is closed (denial, no leakage), so P1 not P0. Combined-tree bisection (VIRT stashed vs OAV stashed) was not performed; attribution rests on the code path + failure signature, recorded honestly as such.

Follow-ups (uniquely numbered; VIRT-12-F01 fixed/verified, VIRT-12-F03 fixed/awaiting re-review; sign-off NOT granted):

- VIRT-12-F01 (P1; owners: VIRT-05 access-control engineer + OAV-05 owner jointly; dependencies: VIRT-05, OAV-05; verification: full serial `pnpm test` green including the 5 OAV-05 cases plus all 11 virtuals files with no VIRT regressions): carry the effective target access (including trusted-custom accesses such as `inspection`) from `genPopulate` planning through target finalization (`virtualAccess`/`outputAccess`/`docPermissionsAccess` + plan snapshot) instead of coercing to `'read'`, or record an explicit joint decision that custom accesses are out of scope for populate finalization and adjust the OAV-05 expectations accordingly. VIRT-00A D1 only standardizes `read`/`list` target accesses, so this needs a joint contract addendum, not a unilateral VIRT edit.
  - FIXED (2026-10-06, joint VIRT-05/OAV-05 fix verification): the required behavior is present in the worktree — `src/core.ts:398` carries the effective target access verbatim (`const planAccess: PopulateTargetAccess = populateAccess;`, no coercion to `'read'`) into `planVirtualProjection` (`virtualAccess`/`outputAccess`/`docPermissionsAccess`, `:437-:439`) and the retained `POPULATE_TARGET_PLAN` meta (`:460-:467`), so query (`isAllowed`/`genSelect`/`genFilter` on the real custom access, `:374-:380`), plan, and finalization all use the same trusted-custom access consistently. `src/services/service.ts:744` fallback (`(entry as Populate).access ?? 'read'`) likewise preserves descriptor custom access, and `src/acl/populate-access.ts` (`assertPopulateAccess`) + `src/operation-access.ts` (`isRouteVariantAccess`) reject only reserved route-variant identifiers while trusted-custom strings retain prior behavior — denial/registration/fail-closed preserved. No source change was required beyond this already-present carry-through; VIRT-00A D1 `read`/`list` behavior unchanged. Evidence: serial `pnpm --filter @web-ts-toolkit/access-router... build` EXIT 0; focused `vitest run test/virtuals-populate-include.integration.test.ts test/operation-access-boundaries.integration.test.ts` → 152/152 passed (incl. all 5 `retains custom-only target fields and document grants through … populate finalization` cases: list/read/descriptor/include/subquery); `pnpm --filter @web-ts-toolkit/access-router typecheck` EXIT 0. No `CHANGELOG.md` change.
- VIRT-12-F02 (P2; owner: maintainer/test-infra; dependencies: none; verification: combined 4-file surface run green or documented serial-run policy): `test/export-contract.test.ts` + `test/documentation-examples.test.ts` + `test/strict-consumer-types.test.ts` + `test/packed-consumer-compatibility.test.ts` in ONE vitest invocation flaked once with transient `TS7016` (missing `@web-ts-toolkit/express-response-handler` declarations inside `<repo-root>/_tmp/access-router-consumer-*` packed fixtures); each file passes in isolation (41/33/7/7). Suspected shared-output/tempdir contention between parallel packed-consumer workers (same class as the repo's known shared-`dist/` race). Optional: run packed-consumer suites serially/isolated (as done in this review) or give them isolated tempdirs; residual risk is test-orchestration only, no product behavior.
- VIRT-12-F03 (P1; owners: VIRT-02 planner owner + VIRT-04 service owner jointly; dependencies: VIRT-02, VIRT-04; verification: `access-router-deco` `test/documentation-examples.test.ts` green on VIRT dist plus full serial `pnpm test` green plus all 11 virtuals files with no regressions): direct/list DB fetch projections include explicitly-denied persisted fields whenever no explicit client select narrows the plan. `planVirtualProjection` (`src/acl/virtual-projection.ts:341-345`) computes `outputPersisted` for `selectionMode === 'all'` as ALL `persistedDefined` keys with "no permission strictness", and `persistedFetchSelection` adds `_id` unconditionally (`fetchIdRetained`, `:499-:500`); `Service.findOne`/`find` (`src/services/service.ts:1057-1067,1367`) merge that set into `finalSelect`/`dbSelect` without any authorization filter. A virtuals-free model with `permissionSchema: { slug: {read:true}, title: {read:true}, body: {read:true}, published: false, internalNotes: false }` therefore issues `collection.findOne` with projection `{slug:1,title:1,body:1,published:1,internalNotes:1,_id:1}` on a select-less read. Output stays fail-closed (the finalizer trims denied fields; all access-router output assertions remain green), so P1 not P0 — but this breaks the pinned least-privilege persistence contract (`packages/access-router-deco/test/documentation-http.fixture.js:64-65` asserts denied keys absent from `options.projection`) and routinely loads explicitly-denied contents into app memory. No VIRT-00A decision authorizes fetching `false`-ruled non-dependency fields (D6 covers virtual _dependencies_ only). Suggested direction (owners decide): definite denials (explicit `false` / absent rule / missing applicable getter) must stay out of the fetch set unless retained as a virtual dependency; deferred document-dependent candidates keep current behavior.
  - FIXED (2026-10-06, VIRT-02/VIRT-04 joint fix; VIRT-12 stays pending awaiting independent re-review): planner-only least-privilege fix in `packages/access-router/src/acl/virtual-projection.ts` (no service-merge change needed — `Service.findOne`/`find` merge of `_select` (already excludes `false`) + filtered `persistedFetchSelection` is now least-privilege; no post-fetch trimming added, so denied contents are never loaded). `outputPersistedFields` stays broad on purpose (finalizer still enforces `outputAccess` with real doc grants); only the fetch contribution is filtered via new `isPersistedFetchable` mirroring candidate classification: `boolean true` → fetchable, `false`/absent/non-grant object → denied; `function` → deferred fetchable (never evaluated during planning); `string`/`array` global-pass → fetchable, doc-prefix (`hasModelPermissionValue`) → deferred fetchable, purely-global miss → denied. `fetchSet` = fetchable output + `depRelative` (unconditional, so denied virtual deps still fetched then stripped) + `alwaysStripped`/`overrideStripped`/`joinFields`/`baseFields`/`identityFields` (internal needs, retained) + `_id` (`fetchIdRetained`; ARC-21 preserved: inclusion retains `_id`, explicit `-_id` stays output-only via `outputIdExcluded`). Child/related plans inherit the same filter via recursion. VIRT-00A D6 (effective selection before evaluation, internal-only stripped before decorate/tasks) and D8 (arbitrary select, virtuals stay virtual) preserved. Evidence (all serial): `pnpm --filter @web-ts-toolkit/access-router... build` EXIT 0; `test/virtuals-projection-planner.unit.test.ts` → 14 passed; `test/virtuals-finalizer.unit.test.ts` + `test/virtuals-direct-operations.integration.test.ts` → 33 passed (14+19); all 11 virtuals suites → 153 passed (baseline 7 + config 8 + planner 14 + finalizer 14 + direct 19 + populate-include 10 + embedded 23 + route-parity 15 + validation-openapi 17 + hardening 23 + performance-probe 3); `pnpm --filter @web-ts-toolkit/access-router-deco... build` + `test/documentation-examples.test.ts` → 7 passed (was 2 failed / 5 passed via the widened `{slug:1,title:1,body:1,published:1,internalNotes:1,_id:1}` projection; now contracted least-privilege, fixture `options.projection` invariant green); `pnpm --filter @web-ts-toolkit/access-router typecheck` EXIT 0; `git diff --check` clean. No `CHANGELOG.md` change. Full serial `pnpm test` left for the independent re-reviewer.

Reviewer sign-off: NOT GRANTED. All VIRT-scope acceptances verify green and VIRT-00A decisions are implemented consistently, and VIRT-12-F01 is fixed/verified, but `pnpm test` (full serial) is red via VIRT-12-F03 and the Definition of Done requires zero open P0/P1 gaps plus fully green mandatory verification. VIRT-12 stays `pending (blocked)` until VIRT-12-F03 is fixed and verified; VIRT-12-F02 (P2) is deferred with the rationale above.

Fix verification note (2026-10-06, VIRT-12-F01 fix pass): VIRT-12-F01 is now marked FIXED above with evidence (serial build EXIT 0; 152/152 focused virtuals populate-include + OAV boundaries tests green incl. the 5 previously failing OAV-05 custom-finalization cases; typecheck EXIT 0; no `CHANGELOG.md` change; denial/registration/fail-closed preserved). VIRT-12 itself is deliberately left `pending` — NOT marked completed — awaiting independent re-review and the full serial `pnpm test` sign-off.

Re-review verification record (2026-10-06, independent re-reviewer; NOT granted — blocked by new P1 VIRT-12-F03):

- Scope reviewed: full task file (VIRT-00 through VIRT-11 evidence + VIRT-00A D1–D8) and the combined worktree including the parallel OAV track. F01 fix claim verified in code: `src/core.ts:398` carries the effective target access verbatim (`const planAccess: PopulateTargetAccess = populateAccess;`, no coercion) into `planVirtualProjection` (`virtualAccess`/`outputAccess`/`docPermissionsAccess`, `:437-:439`) and the retained `POPULATE_TARGET_PLAN` meta (`:460-:467`); OAV files (`src/operation-access.ts`, `src/acl/populate-access.ts`) intact. No `CHANGELOG.md` changes made (only this VIRT-12 section edited).
- Mandatory verification, all serial (env: node v26.7.0, pnpm 11.18.0; full log `<tool-output>/full-test-virt12.log`):
  - `pnpm build` → EXIT 0 (full workspace).
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` → EXIT 0.
  - All 11 virtuals suites → 153/153 passed (10-file run 143/143 + populate-include 10/10 within the 152/152 run below).
  - `test/virtuals-populate-include.integration.test.ts` + `test/operation-access-boundaries.integration.test.ts` → 152/152 passed (incl. all 5 ex-F01 `retains custom-only target fields and document grants through … populate finalization` cases: list/read/descriptor/include/subquery). F01 FIXED confirmed.
  - Access-router full package suite (serial, within full `pnpm test`) → 84 files / 1426 passed (incl. export-contract 41, documentation-examples 33, strict-consumer-types 7, packed-consumer-compatibility 7). No virtuals-related failure anywhere in the access-router package.
  - `pnpm lint` → EXIT 0. `npm pack --dry-run` (from `packages/access-router`) → 17 files. `git diff --check` → clean (exit 0). No reviewer debug code remains in the tree (temporary `ZZ-DEBUG` logs + `zz-*` probe tests used during attribution were removed; `git status` shows only VIRT/OAV work).
- Full serial `pnpm test` → EXIT 1. Sole workspace-wide red: `access-router-deco` `test/documentation-examples.test.ts`, 2 failed / 5 passed (both `strictly compiles and executes 'README quick start' / 'website quick start' over HTTP against emitted packages`); every other workspace package green. NOT unrelated: attribution proven VIRT-caused (see VIRT-12-F03). Bisection: pristine-HEAD dist (tracked changes stashed) → 7/7 pass; VIRT dist → deterministic fail (12/12 instrumented runs + isolated rerun + full suite). Instrumented staged-consumer run captured the widened persistence projection `{slug:1,title:1,body:1,published:1,internalNotes:1,_id:1}` vs the contracted `{slug:1,title:1,body:1}` on the very first `GET /api/articles/welcome`; the fixture's server-side projection invariant (`documentation-http.fixture.js:64-65`) throws → HTTP 500 → `500 !== 200`. Output direction is fail-closed (no denied-field output leakage evidenced), hence P1 not P0.
- Security/isolation/bounds/boundary sweeps: no other new P0/P1 gap inside VIRT scope beyond F03 (prior review's green sweeps re-confirmed via the 153 virtuals + 1426 package tests above). F02 remains P2-deferred with prior rationale.
- Sign-off: NOT GRANTED. Status stays `pending (blocked)` on VIRT-12-F03.

Fix verification note (2026-10-06, VIRT-12-F03 fix pass): VIRT-12-F03 is now marked FIXED above with evidence (planner-only `src/acl/virtual-projection.ts` least-privilege fetch; serial build EXIT 0; planner 14 + finalizer/direct 33 + all 11 virtuals 153 green; deco `test/documentation-examples.test.ts` 7 passed on VIRT dist; typecheck EXIT 0; `git diff --check` clean; no `CHANGELOG.md` change). VIRT-12 itself is deliberately left `pending` — NOT marked completed, sign-off NOT granted — awaiting independent re-review and the full serial `pnpm test` sign-off.

Sign-off verification record (2026-10-06, independent re-reviewer; GRANTED):

- Scope reviewed: full task file (VIRT-00 through VIRT-11 evidence + VIRT-00A D1–D8) and the combined worktree including the parallel OAV track. F01 fix claim re-verified in code (`src/core.ts:398` carries the effective target access verbatim, no coercion to `'read'`, into `planVirtualProjection` and the retained `POPULATE_TARGET_PLAN` meta). F03 fix re-verified in code (planner-only `src/acl/virtual-projection.ts`: new `isPersistedFetchable` mirroring candidate classification — `boolean true` fetchable, `false`/absent/non-grant object denied, `function` deferred fetchable without evaluation, `string`/`array` global-pass fetchable, doc-prefix deferred fetchable, purely-global miss denied; `fetchSet` = fetchable output + unconditional `depRelative` + always/override/join/base/identity + `_id`; `outputPersistedFields` stays broad for finalizer enforcement; child/related plans recurse through the same filter; no service-merge change, no post-fetch trimming added). No `CHANGELOG.md` changes made (only this VIRT-12 section edited).
- Mandatory verification, all serial (env: node v26.7.0, pnpm 11.18.0):
  - `pnpm build` → EXIT 0 (full workspace).
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` → EXIT 0.
  - All 11 virtuals suites (baseline 7 + config 8 + planner 14 + finalizer 14 + direct 19 + populate-include 10 + embedded 23 + route-parity 15 + validation-openapi 17 + hardening 23 + performance-probe 3) → 153/153 passed, one invocation.
  - `test/virtuals-populate-include.integration.test.ts` + `test/operation-access-boundaries.integration.test.ts` → 152/152 passed (incl. all 5 ex-F01 `retains custom-only target fields and document grants through … populate finalization` cases: list/read/descriptor/include/subquery). F01 FIXED confirmed.
  - `access-router-deco` package `test` → 18 files / 563 passed; focused `test/documentation-examples.test.ts` on VIRT dist → 7/7 passed. F03 FIXED confirmed (select-less fetch no longer loads `false`-ruled fields).
  - Public surface, each in isolation → all green: `test/export-contract.test.ts` 41 passed; `test/documentation-examples.test.ts` 33 passed; `test/strict-consumer-types.test.ts` 7 passed; `test/packed-consumer-compatibility.test.ts` 7 passed.
  - `pnpm lint` → EXIT 0. `npm pack --dry-run` (from `packages/access-router`) → 17 files (`README.md`, `llms.txt`, `dist/*.{js,mjs,d.ts,d.mts}`, no `src/`). `git diff --check` → clean (exit 0).
  - Full serial `pnpm test` → EXIT 0 (whole workspace green; the `requestKeyFor: cycle detected` stack in the react package log is expected output of a passing test, not a failure).
- Security/isolation/bounds/boundary sweeps: no new P0/P1 gap inside VIRT scope. Prior review's green sweeps re-confirmed via the 153 virtuals + 152 OAV-boundary + full-workspace green run above. F02 remains P2-deferred with prior rationale (test-orchestration only, no product behavior).
- Sign-off: GRANTED. VIRT-12 `Status: completed`. VIRT-12-F01 FIXED + verified. VIRT-12-F03 FIXED + verified. VIRT-12-F02 P2 deferred with rationale and residual risk as recorded above.

## Dependency and parallelization guidance

- Shared-hotspot spine: VIRT-00 → VIRT-00A → VIRT-01 → VIRT-02 → VIRT-03 → VIRT-04 → VIRT-05 → VIRT-06. Sequence these changes; related/embedded tasks also modify planner/finalizer traversal and service integration.
- VIRT-08 may start after VIRT-02 once VIRT-00A's grammar/OpenAPI decisions are fixed. Coordinate any `helpers/query.ts` edits with the planner owner; its model-aware input-policy integration checks finish with VIRT-04/VIRT-07.
- VIRT-07 starts only after VIRT-04/VIRT-05/VIRT-06. VIRT-09 starts only after VIRT-04/VIRT-05/VIRT-06/VIRT-08. They may overlap on independent test files; coordinate any runtime corrections before editing shared modules.
- VIRT-11 measures after VIRT-04/VIRT-05/VIRT-06/VIRT-09. VIRT-10 starts after VIRT-07/VIRT-08/VIRT-09/VIRT-11 so final docs include measured guidance and verified behavior. VIRT-12 follows every task and required follow-up.
- Prepare fixtures or inspect sources early if useful, but do not mark a dependent task in progress/completed before its listed behavioral prerequisites are satisfied.
- Never run two package test/build/typecheck invocations concurrently (shared `dist/` race, per `AGENTS.md`). Run focused Vitest directly only after a serial build has finished and against a stable dist snapshot. Full package checks follow integration waves; full serial `pnpm test` is required in VIRT-12. Do not run packed-consumer tests concurrently with writers to their shared outputs.
- Shared-hotspot map:
  - `src/services/service.ts` / `public-service.ts` — VIRT-04 owns initial integration, then VIRT-05/VIRT-06 own sequenced related/subdocument edits.
  - `src/core.ts`, planner/finalizer modules, `src/services/base.ts` — shared by VIRT-02–VIRT-06; sequence runtime edits and review corrections through the responsible owner.
  - `src/interfaces/*`, `src/index.ts` — VIRT-01 owns initial typed API/exports; VIRT-04 may add agreed internal plan transport; VIRT-10 verifies/public-doc refinements after integration.
  - `src/helpers/query.ts` — VIRT-02 precedes coordinated VIRT-08 grammar work.
  - `dist/` — generated by serialized commands only, never hand-edited; metadata/docs finalization belongs to VIRT-10.
  - This task document — coordinator merges decision/completion evidence; agents must not overwrite each other's task records.

Recommended agent allocation (large-plan default):

| Agent                      | Owns                          | Must avoid                                                                       |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| test engineer              | VIRT-00, VIRT-07 parity tests | broad runtime edits; coordinate evidenced VIRT-07 corrections with runtime owner |
| coordinator / api designer | VIRT-00A, VIRT-01, VIRT-10    | unapproved contract guesses                                                      |
| access-control engineer    | VIRT-02, VIRT-05              | docs/packaging                                                                   |
| backend engineer A         | VIRT-03, VIRT-04              | validation/openapi                                                               |
| backend engineer B         | VIRT-06 after VIRT-05         | concurrent planner/finalizer edits                                               |
| validation engineer        | VIRT-08                       | service internals                                                                |
| hardening engineer         | VIRT-09                       | public API wording                                                               |
| performance engineer       | VIRT-11                       | runtime changes without owned follow-up                                          |
| independent reviewer       | VIRT-12                       | implementation edits (findings only)                                             |

## Decisions requiring maintainer input

### Blocking contract decisions — resolve in VIRT-00A before VIRT-01

Owner: maintainer with the implementation coordinator. VIRT-00 baseline tests can proceed while these are resolved.

1. Confirm or revise the proposed operation matrix, especially create/update responses vs read visibility, both upsert branches, and embedded mutations returning existing rows.
2. Confirm the embedded grant source/context: proposed owning-parent internal grants with scoped permission rules, no new independent embedded hook family. Specify required parent inputs for dedicated subdocument outputs.
3. Record the public generic/API shape for persisted getters, virtual permission-schema keys, optional computed outputs, and dotted setter inference. Choose a concrete typechecked example before implementation rather than widening persisted models by assumption.
4. Confirm stable getter-view isolation, sibling visibility, returned-value ownership, required-dependency absence semantics, and mutation/select/decorate/task ordering. Include `returningAll: false` and currently ignored `new.args.select`.
5. Choose the exact finite `maxHookConcurrency` scope/strategy for rows, multiple getters, and recursive children. Distinguish the existing persistence ceiling from trusted getter DB/network work.
6. Choose select grammar compatibility: preserve current arbitrary string acceptance with safe virtual handling, or approve a stricter grammar with direct/root/service parity and compatibility notes.

### Scoped defaults and optional follow-ups — do not block the baseline

- `DataRouter` parity remains excluded.
- Virtual DB sort/filter/distinct support remains excluded; service-boundary rejection/strip enforcement is mandatory in VIRT-04, not a deferred feature choice.
- OpenAPI v1 uses existing open-object/unknown-value support with documented optional virtual fields. A full virtual schema language is separate follow-up work unless explicitly selected during VIRT-00A.
- Update the already-shipped `llms.txt` only after metadata/declarations/README are correct; a small index update needs no separate feature decision.
- Cross-document dataloader/batching remains excluded; bounded evaluation and measured N+1 guidance are mandatory. A future batching project needs separate ownership/evidence.

## Final integration/review task

See VIRT-12. It is part of the task list (not an afterthought) and blocks “done”.

## Definition of done

- All planned tasks and required follow-ups are completed with evidence (changed files, verification commands, results). Optional P2 follow-ups may be deferred only with explicit rationale/owner; no P0/P1 gap or mandatory verification blocker remains open.
- VIRT-00A decisions are recorded and implemented; receiving-model/scoped authorization, deferred document grants, dependency/join isolation, child ordering, output-only persistence/query handling, and documented bounds are verified across direct/populated/included/embedded/root paths.
- `pnpm build`, `pnpm test` (serial full), `pnpm lint`, `pnpm --filter @web-ts-toolkit/access-router typecheck`, and whitespace checks pass. Named export/docs/strict/packed-consumer suites verify the real published surface in addition to a workspace dry-run inventory.
- Public types expose optional computed outputs from documented entrypoints; README happy-path is typechecked against shipped declarations; JSDoc is visible in emitted `.d.ts` / `.d.mts`; compatibility notes and measured N+1 guidance are recorded.
- Independent VIRT-12 sign-off confirms zero unresolved required findings. Follow-up tickets alone are not completion evidence for P0/P1 defects.
- Preserve unrelated worktree changes and report intended feature files with `git status`; a previously dirty unrelated worktree is not a defect or a reason to revert user work.
