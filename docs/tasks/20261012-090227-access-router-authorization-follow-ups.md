# Access-router: activated authorization follow-ups

Created: 2026-10-12 09:02:27 PDT (`20261012-090227`, generated with `date`).

Status: completed

## Objective and activation

Implement all three previously deferred follow-ups from
`docs/tasks/20261007-143507-access-router-explicit-service-authorization.md`.
The maintainer explicitly requested implementation in separate subagent sessions
on 2026-10-12. This activates SVA-F01, SVA-F02, and SVA-F03; their common
prerequisite, SVA-11, and all original required review fixes are completed.

Final disposition (2026-10-12): SVA-F01/F02/F03 were implemented and verified in
their separate sessions; SVA-F04's fresh independent audit, four recorded corrective
follow-ups and complete serial integration gates are completed. See **F04 independent
acceptance audit** and **F04 final integration and completion evidence** below.

This is a new execution phase. The original record's first-release restrictions
on write elevation, dedicated subdocument elevation, and positional helper
retirement describe the completed baseline, not restrictions on these activated
tasks. Its other authorization, public-boundary, hook, isolation, and persistence
contracts continue to apply.

Activated scope:

- SVA-F01: explicit, independent persisted input-field authority for model
  create/update/upsert operations.
- SVA-F02: dedicated subdocument parent/child operation, row, output, and write
  authority, using SVA-F01's input semantics. Post-write read visibility receives
  an explicit contract rather than inheriting mutation authority.
- SVA-F03: remove positional `skipChecks`/`subPaths` and arbitrary `baseFields`
  helper overloads, migrate package-owned callers, and document model/data
  compatibility. Removal ships with these changes in the next breaking release;
  no release version/date or transitional adapter is required to implement it.
- SVA-F04: fresh independent review and complete serial integration gates.

## Working rules

- Follow `AGENTS.md`, `docs/tasks/README.md`, the task-as-you-go skill, and the
  ai-friendly-ts-package skill. Keep evidence repository-relative.
- Run a fresh implementation subagent for each of F01, F02, and F03, sequentially
  in that order. F04 is a different reviewer session. Shared hotspots include
  `core.ts`, `services/base.ts`, `services/service.ts`, the authorization
  interfaces/resolver, README, and installed-consumer fixtures.
- Each owner must inspect the current implementation and record exact API and
  behavioral decisions below its task before implementation. Prefer shared
  boundaries to route-specific exceptions. Record newly necessary work promptly.
- Preserve immutable per-call authority, the original actor/permission map,
  document-stage isolation, mandatory identifier/association constraints,
  terminal false predicates, and configured query-transform behavior.
- All new capabilities remain trusted server-only. Public/root/nested options,
  router defaults, client/React/OpenAPI request surfaces, and transformed public
  envelopes must not acquire authority. Legitimate business fields retain their
  ordinary meaning. Add positive internal controls alongside negative wire tests.
- Validation/preparation/transform/save/afterPersist hooks and output-only
  virtual semantics stay active. Output grants and input grants remain separate.
- Preserve bounded persistence admission; never hold a leaf permit while waiting
  on hooks or descendant orchestration. Keep all rebuilding checks serialized.
- Do not edit `CHANGELOG.md`, including via tooling. Baseline Git blob hash:
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Do not commit, stage, reset, revert unrelated work, run publishing/versioning/
  changelog tooling, or introduce new package entrypoints. Preserve other sessions'
  changes. F04 may run the existing test-only artifact assembly/verification at
  the suite's sentinel version (`0.99.0-test`); this selects no production release
  and must leave tracked version/changelog files unchanged.
- Use ignored repository-local temporary fixtures, verifying their location and
  ignore rule before use. Record TMPDIR as `<repo-root>/_tmp-svaf`.

## Baseline and verification

- Baseline HEAD: `c289f17` (`ci: pass docker compose plugin to setup tools`).
- Worktree was clean before activation. Dependencies are installed.
- Original completion evidence is in SVA-11 and the coordinator final review of
  the linked original task record. No new runtime check was run merely to create
  this activation record.
- Confirmed baseline: `src/interfaces/service-authorization.ts` rejects
  `inputFields`/`subdocuments`; `test/service-authorization-mutations.integration.test.ts`
  asserts output-only grants do not write; `services/model-subdocument-service.ts`
  uses request-only parent/child filters and positional input admission;
  `core.ts` and `core-data.ts` expose positional helper overloads. Paths in this
  bullet are relative to `packages/access-router/`.

Per-task verification:

1. `pnpm --filter @web-ts-toolkit/access-router... build`.
2. Focused tests after build:
   `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`.
   Record actual test filenames and results, not this placeholder.
3. `pnpm --filter @web-ts-toolkit/access-router typecheck`.
4. Relevant public-boundary, regression, documentation, and installed-consumer
   tests for the modified surface. Inspect emitted root/advanced declarations.

Final integration (F04), sequentially:

- `pnpm build`.
- `pnpm test` (serial workspace package scripts).
- `pnpm lint`.
- `pnpm --filter @web-ts-toolkit/access-router typecheck` if not already verified
  on the final implementation by the preceding owner.
- `npm pack --dry-run` in `packages/access-router`; actual package-name CJS/ESM
  and Node16/NodeNext/Bundler consumers are covered by the package tests.
- `git diff --check`, task-status/evidence review, and unchanged CHANGELOG hash.

## Detailed tasks

### Task SVA-F01: Implement independent write-field elevation

Status: completed

Owner: fresh dedicated F01 implementation session; no subdelegation. SVA-11 is
complete. Starting worktree contains only the two task-record activation changes;
the CHANGELOG blob matches the required baseline. The first invocation was
interrupted; the resumed dedicated session preserved its implementation, contract,
and tests, fixed the remaining shared-boundary findings, and completed verification.

Priority: P1 (activated extension; authorization correctness is release-blocking).

Suggested agent: API/persistence implementation specialist, fresh session.

Dependencies: completed SVA-11; maintainer activation above.

Primary ownership:

- `packages/access-router/src/interfaces/service-authorization.ts` and mutation
  option types/exports; `src/acl/service-authorization.ts` and execution context.
- `packages/access-router/src/services/service.ts`, shared input admission,
  `src/helpers/apply-update.ts`, mutation/boundary/type tests, README/JSDoc.

Finding: Current output/row authority cannot admit protected input fields.
Existing mutation admission and whole-container semantics must be extended
deliberately rather than reusing output planning or virtual catalogs as writes.

References: original SVA-F01, C6, mutation tests, and `src/helpers/apply-update.ts`.

Implementation requirements:

1. Record `authorization.inputFields` request/grant/unrestricted semantics,
   method applicability, safe persisted paths, and additive request/grant rules.
2. Define leaf/container/array replacement behavior before coding. Descendant
   grants must not write/delete denied siblings or change unauthorized array
   structure; container authority has explicit replacement semantics.
3. Exclude virtual/control/unsafe paths; validate at runtime as well as types.
   Input grants imply no output, row, related-target, or operation grants.
4. Keep normal hooks and Mongoose validation/save behavior. Public calls and
   unsupported method dimensions reject authority before side effects.
5. Make shared input admission usable by F02 without exposing a general bypass.
6. Update installed declarations, README/examples, website consistency, and the
   original task's status/evidence pointer.

Acceptance criteria:

- Mongo-backed create/update/upsert tests assert persisted values as well as
  output, denied siblings, nested and array integrity, virtual exclusion,
  independent output grants, validation/hook invocation, and upsert branches.
- Runtime malformed policies and public-envelope attacks fail before writes;
  request actor, later calls, related targets, and defaults remain isolated.
- Relevant checks and package typecheck pass; exact contract and evidence follow.

#### F01 implementation contract (recorded before implementation)

- API: export `InputFieldPath<TModel>` (bounded persisted-model paths, no virtual
  generic), `InputFieldAuthorization<TModel>` (request/grant/unrestricted), and
  `MutationAuthorization<TModel, TVirtuals>` from root and `/advanced`.
  `UpdateOneOptions`, `UpdateByIdOptions`, and `UpsertOptions` use the mutation
  policy; `CreateAuthorization` also accepts input authority but rejects rows.
  `ServiceAuthorization` remains the read policy and explicitly forbids
  `inputFields`, including pretyped mutation values. Output/new/related policies
  also forbid input authority. No new entrypoint or public helper is introduced.
- `authorization.inputFields` is independent of rows, output, operation and
  related authority. Missing/undefined or `{ mode: 'request' }` uses ordinary
  request admission; `{ mode: 'grant', paths: [...] }` adds named persisted paths
  (empty adds nothing); `{ mode: 'unrestricted' }` admits eligible persisted roots.
  Grants never synthesize payload, tenant scope, output fields or user metadata.
- Paths use safe unsigned dot-separated response segments, e.g. `contacts.email`.
  Runtime schema validation covers declared leaves/containers, safe Mixed/Map
  descendants, and stored reference values (not target interiors). Reject unknown,
  virtual, signed/wildcard/bracket/index/definition paths, prototype/Mongoose/control
  metadata, identity grants and configured permission/version metadata. Preserve
  ordinary business fields named `authorization` and `overrides`. Existing
  request-schema bracket/index aliases remain compatible until F03's caller review.
- A leaf replaces just its supplied value (including null/undefined); omission is
  no write. A container boundary authorized by request or explicit input policy
  replaces the supplied object/array, including omitted descendants, empty/null
  values and array cardinality. Elevated containers are limited to eligible
  persisted children; Mixed values may contain safe dynamic business keys.
  Root/embedded identity fields cannot be elevated; replacement embedded documents
  receive Mongoose-generated IDs unless existing request authority admits IDs.
- A descendant grant creates only necessary object ancestors (including absent/null
  nested objects), never replaces a scalar ancestor or writes/deletes siblings.
  Across arrays it patches existing object elements **by index**, never by supplied
  `_id`. Omitted/trailing elements, null/scalar/hole slots and excess input elements
  do not change existing array structure. Missing arrays cannot be created through
  a descendant grant, including on create/upsert-create; authorize the array (or a
  containing subtree) explicitly, or use an already request-authorized container.
  The same rule applies recursively to nested arrays and arrays inside Mixed.
- Shared package-private input admission combines captured request rules with the
  validated policy and emits admitted data plus concrete write boundaries for
  `applyUpdate`. F02 can reuse it with its own scoped request fields/document grants;
  no dedicated-method authority is enabled in F01.
- Update resolves pre-write document grants once from the untrimmed persisted
  snapshot, independently of output grants/results and serialized `_permissions`.
  Capture policy/configuration/request permissions before awaits. Create retains
  its existing request-only pre-document rules (no new pre-create document hook);
  client metadata is never a source of document grants. Post-write hooks/results
  resolve their own fresh stage. Fetch needed persisted input roots privately so
  schema-hidden containers cannot lose siblings or evade structure checks.
- Validation receives admitted input, then prepare/transform/afterPersist/change
  hooks and Mongoose casting/validation/create/save remain active. Trusted prepare
  additions and explicit transform setters retain their existing business-write
  authority; virtual keys remain output-only, including inside permissive whole
  containers and prepared values. No persistence permit is held while awaiting hooks.
- Public/root/nested/JS/custom-validator/default admission rejects control-slot
  authority before dispatch/effects, with working backend-write positive controls.
  Unsupported dimensions reject even in request mode. Terminal row denial, route
  guards, target gates, later-call isolation and unchanged actor metadata remain.

Inspection findings necessary for F01:

- The old `pick` utility does not fan out `contacts.email` through arrays; concrete
  index expansion is necessary before `applyUpdate`, which must never treat an
  intermediate array element as a replacement merely because an index was omitted
  from a policy path.
- Update currently serializes pre-write grants onto its hydrated document and
  create reads metadata through the legacy helper. F01 replaces those admission
  inputs with private captured grants to prevent payload metadata forgery and stage
  mixing, while preserving the established hook invocation counts.
- The output catalog includes registered virtuals and virtual-only containers.
  Input validation needs a persisted-only catalog view; subtracting top-level
  virtual names alone cannot safely admit unrestricted or container writes.
- First focused regression run: model mutation cases passed, but 17 dedicated
  nested-update cases rejected because `prepareSubdocumentOutput` revalidated a
  normalized policy including the new request-mode input default. Necessary F01
  integration fix: derive its read-only policy through `serviceAuthorizationInput`
  rather than spreading normalized dimensions. This enables no F02 authority.
- Final-review regression (necessary F01 correction): `iterateQuery` deliberately
  passes non-plain JS values through. An unrestricted create with a class-instance
  embedded container persisted its virtual, unknown and `_permissions` properties
  under `strict: false`; the new `JS composite containers` Mongo test failed on all
  three stored keys. Canonicalize composite input/prepared containers before shared
  admission, preserving native Date/Buffer/BSON leaves and hydrated-document casting
  inputs. This closes the same virtual/control boundary for JS as for JSON payloads.
- Resumed dedicated F01 session preserved the interrupted implementation and first
  verified its build plus 123 focused tests. Additional Mongo storage/hook probes
  reproduced four failures: a granted ancestor dropped a separately request-admitted
  class-instance descendant; positive root selection still hid an embedded
  `select: false` field from pre-write grants; and create/update prepared class
  containers persisted control metadata. Necessary shared-boundary corrections:
  normalize before checking descendant container shape, positively fetch eligible
  declared nested paths as well as roots, and scrub prepared virtual/control paths
  while retaining trusted business additions and explicit setters.

#### F01 completion evidence — 2026-10-12

Delivered API and implementation:

- Root and `/advanced` export `InputFieldPath<TModel>`,
  `InputFieldAuthorization<TModel>`, and `MutationAuthorization<TModel, TVirtuals>`.
  Create uses `CreateAuthorization` (input/output/related, no rows); updateOne,
  updateById and both upsert branches accept mutation input authority. Reads keep
  `ServiceAuthorization.inputFields?: never`; pretyped mutation policies also fail
  assignment. Output/new/related/public/default policies reject input authority.
- Missing/request/empty grants retain request admission; grants are additive;
  unrestricted admits eligible persisted paths. The recorded leaf/container/array
  contract is implemented: descendants patch existing object slots by index without
  structural changes or denied-sibling deletion; explicit container authority
  replaces the supplied subtree. Safe Mixed/Map paths and ordinary business fields
  named authorization/overrides work. Runtime schema checks reject virtual, unknown,
  identity, metadata, unsafe and referenced-interior grant paths before effects.
- `packages/access-router/src/acl/model-input-admission.ts` is the shared private
  boundary. `field-catalog.ts` now captures persisted paths, arrays, native virtuals
  and metadata separately from output paths. `service-authorization.ts`,
  `service-execution.ts` and `services/service.ts` capture/validate/derive input
  policies and resolve pre-write document grants privately from hydrated raw input.
  Post-write grants/output are a separate stage; actor and serialized metadata
  receive no input grant. Validation, preparation, setters, save, afterPersist,
  changes and bounded persistence remain active.
- The interrupted class-container regression is resolved. Additional red Mongo
  regressions now pass for request-admitted class descendants under granted
  containers, hidden embedded pre-write hook inputs, and prepared JS control keys.
  Prepared Maps are normalized to castable data and omit virtual/control keys
  rather than retaining undefined keys. Trusted business additions remain active.
- `acl/subdocument-output.ts` derives a read-only policy through
  `serviceAuthorizationInput`; normalized request-mode input defaults no longer
  break existing dedicated nested updates. Dedicated authorization remains F02.
- Updated public interface JSDoc/exports, README typed and runnable Mongo examples,
  `llms.txt`, website `services.mdx`, consumer fixtures and export-contract tests.
  New `test/service-authorization-input.integration.test.ts` contains **43**
  Mongo-backed cases, with raw collection assertions for persisted outcomes.

Verification, run sequentially on the final implementation:

1. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, all five
   packages in the dependency closure emitted JavaScript and declarations.
2. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-input.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-context.unit.test.ts test/nested-update-integrity.integration.test.ts`
   — **4 files / 173 tests passed**.
3. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed**, including
   its serialized prerequisite build and `tsc --noEmit`.
4. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-public-boundaries.integration.test.ts test/service-denial-contract.test.ts test/filter-denial.integration.test.ts test/advanced-mutation-bodies.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/request-complexity.integration.test.ts test/model-router.test.ts test/field-permissions-opt-out.integration.test.ts`
   — **11 files / 297 tests passed**. Includes wire/root/nested/custom-validator
   attacks, positive backend writes, guards/defaults/actor isolation, terminal
   denial, dedicated hidden-mutation visibility, hooks and bounded concurrency.
5. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`
   — **3 files / 99 tests passed**. Staged installed-package consumers compile
   Bundler and NodeNext ESM/CJS fixtures; the README Mongo workflow executes and
   verifies the new protected write/array patch against storage. Export contracts
   cover CJS/ESM and private runtime/declaration exclusions.
6. Reviewed `dist/index.d.ts`, `dist/index.d.mts`, `dist/advanced.d.ts`,
   `dist/advanced.d.mts` and their shared declaration graph: input JSDoc/types and
   mutation-only option signatures are present; read/output/related `never`
   exclusions survive; no public issuer, admission helper or new entrypoint.
7. `git diff --check` — **passed**. `git hash-object CHANGELOG.md` —
   **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**, unchanged.

Final task checks total **18 files / 569 tests passed** (earlier red/green runs
are not included). Verified the existing `_tmp-svaf` parent with
`ls -ld . _tmp-svaf` and its ignore rule with
`git check-ignore _tmp-svaf/fixture` before use. Suites cleaned their temporary
consumer/Mongo directories; only the ignored Node compile cache remains.
No F01 blocker remains. Full workspace and release-artifact/packed-pipeline gates
belong to F04; they were not invoked in this session.

#### F01 handoff to F02 and F03

- **F02 admission reuse:** call private `admitModelInput` with the selected child's
  original persisted snapshot, child-relative request fields, an already validated
  input policy, and the captured owning-model catalog. Optional `scopePath` prefixes
  catalog paths; grant paths must be owning-model paths beneath that scope. F02
  should translate its new scoped API explicitly, including whole-child/array
  structural authority, rather than inheriting parent policy. Pass returned
  `allowedData` and concrete `allowedFields` together to `applyUpdate`; do not feed
  unexpanded `contacts.email` directly to setters or use output picks for writes.
- **F02 stages/gates:** `requestInputFields`/`resolveInputDocumentGrants` are model-root
  create/update adapters, not automatic subdocument policy. Resolve the owning raw
  parent's grants for F02's own scope/access stage, supply scoped request rules,
  and keep post-write read visibility independent. `inputFetchPaths` includes nested
  hidden schema fields as well as roots; apply its positive inclusions to the owning
  parent. `sanitizePreparedInput(prepared, catalog, scopePath)` and
  `stripDocumentInputVirtuals(parent, catalog)` preserve the input/virtual boundary.
  Parent/child row and operation gates, ID/association selection, public option
  splitting and persistence orchestration remain F02's explicit work.
- **F03 caller migration:** canonical model create/update/upsert now use private
  request/input admission, not positional `genAllowedFields`/`pick`. Remaining
  dedicated callers are `subdocumentInputFields` plus `pick`/`applyUpdate` in
  `services/model-subdocument-service.ts`; coordinate their migration with F02.
  Standalone service query helpers, Core/Base and DataCore/DataService still have
  legacy callers/overloads. Preserve their request/data/metadata contracts rather
  than substituting model output authorization. Input request bracket/index aliases
  remain deliberate compatibility and are covered by nested-update tests.
- **Consumer migration:** use `MutationAuthorization` for update/upsert and
  `CreateAuthorization` for create; keep reusable read policies as
  `ServiceAuthorization`. Derive `{ outputFields: policy.outputFields }` for output
  helpers. Current fixtures still characterize positional helpers for F03 to retire.
  F02, F03 and F04 remain **pending**.

### Task SVA-F02: Implement dedicated subdocument parent/child authorization

Status: completed

Owner: fresh dedicated F02 session, no subdelegation. F01 and SVA-11 are complete;
preserving all activation/F01 work. Verified existing ignored `_tmp-svaf` parent
and unchanged CHANGELOG blob before inspection. F03/F04 remain pending.

Priority: P1.

Suggested agent: embedded/subdocument implementation specialist, fresh session.

Dependencies: completed SVA-11 and SVA-F01; maintainer activation above.

Primary ownership:

- Dedicated internal/public subdocument option types and exported declarations.
- `packages/access-router/src/services/model-subdocument-service.ts`, service
  entrypoints, `src/acl/subdocument-output.ts`, row/operation/input integration.
- Subdocument route/visibility/authorization/type tests and package documentation.

Finding: Dedicated methods retain request-only parent/child operation and row
gates, while embedded output grants already work. Existing successful writes can
return hidden null/empty output after independent read visibility checks.

References: original SVA-F02/C7; `test/subdocument-mutation-visibility.integration.test.ts`,
`test/service-authorization-subdocuments.integration.test.ts` in the package.

Implementation requirements:

1. Record exact scoped parent/child operation, row, output and input API; use F01
   write semantics and separate explicitly scoped post-write read visibility.
2. Preserve identifier/owning-parent constraints, array selection/cardinality,
   terminal denial, hook transformation, and original raw-parent grant inputs.
3. No implicit parent-to-child, write-to-read, or cross-target elevation. Keep
   successful hidden mutation responses successful (`null`/`[]`).
4. Split internal options from public route/wrapper input; enforce actual public
   dispatch boundaries, including JS and custom validators, before activation.
5. Cover list/read/create/update/bulk-update/delete methods as applicable, with
   unsupported dimensions rejected rather than ignored; retain related isolation.
6. Update shipped docs/types and the original task's status/evidence pointer.

Acceptance criteria:

- Tests cover parent-denied/child-granted and inverse cases, scoped ownership,
  selected child rows, write elevation without response elevation, explicit
  post-write visibility, null/empty success, array semantics, virtual exclusion,
  original-parent hooks, public isolation, and related targets.
- Package/subdocument checks and package typecheck pass; contract/evidence follow.

#### F02 implementation contract (recorded before implementation)

- Add method-specific `options.authorization` on internal `listSub`, `readSub`,
  `createSub`, `updateSub`, `bulkUpdateSub`, and `deleteSub`. The bounded shape is
  `{ parent, child, visibility }`, not a recursive subdocuments tree. Parent is
  `{ operation?, rows? }`; child read/list adds `outputFields`, child create/update
  adds `inputFields`. Child create rejects rows (no existing child lookup), delete
  rejects fields and visibility. Parent fields/related and child related reject:
  these methods neither return nor edit parent fields and target elevation is not
  part of this API. Child field paths are relative to the selected embedded array;
  parent row paths belong to the owning model. Known-model methods infer bounded
  child shapes from top-level embedded-array names; unknown models allow strings
  with runtime schema validation. Export the policy and public/internal option types
  through existing root/advanced entrypoints.
- Initial gates for policy-bearing internal calls: parent `read` for list/read,
  parent `update` for every mutation; child `subs.<sub>.<list|read|create|update|delete>`.
  Operation grant permits exactly that gate, never rows/fields/the other scope.
  Omitted dimensions within a supplied policy use request authority. Inspection
  found no initial service operation gate in the baseline: calls without a supplied
  policy retain that route-owned initiating contract (including basic/advanced
  variants). `{ authorization: {} }` explicitly opts into the paired base gates.
  This avoids adding blanket initiating guards to historical request-only calls.
- Mutation `visibility` is independent: `{ parent?: {operation, rows}, child?:
{operation, rows, outputFields} }` checks parent read and child read. Create alone
  also accepts `visibility.list?: {operation, rows}` and requires that child list
  gate/filter as well. No mutation grant is inherited. Absent visibility retains
  request-only post-write checks. Validate every visibility dimension before writes.
  Virtual access remains list/read/create/update; output/document grants remain
  list-fields/read-owner for list, read/read for read, and read/read after mutation.
  Successful writes with denied/failed finalization return success null/[]; delete
  returns only the removed ID. Create returns the visible full stored array; bulk
  update returns visible targeted rows in stored order; counts are visible counts.
- Parent identifiers resolved normally are ANDed after row transformation. Child
  single IDs/bulk selected IDs and owning-array membership are mandatory independent
  constraints. False predicates/scopes/identifier/transform results are terminal.
  Each configured overrideFilter runs once at its stage in every nonterminal mode;
  scopes replace only the base scope, are validated inert predicates, and never
  execute client markers. Validate policy structure/paths/scopes with the existing
  snapshot and request complexity limits before any application hook/persistence.
- Capture configuration, permissions, mutation and visibility policies synchronously.
  Pre-write update grants resolve once from the untrimmed hydrated owning RAW parent;
  create retains request-only pre-document admission. Child request fields use the
  captured `<sub>.sub` schema. Reuse F01 `admitModelInput` with child snapshot and
  prefixed owning-model grants, passing admitted data/concrete boundaries together
  to applyUpdate. Descendants patch nested arrays by index; explicit child-container
  grants replace only that child's eligible subtree. Outer-array membership changes
  are authorized only by create/delete, never inputFields. Hidden schema inputs are
  positively fetched; virtual/control/identity elevation remains excluded.
- Use shared subdocument output planning/finalization and private handles for both
  ordinary and virtual fields. Referenced targets stay request-only. Each output
  stage resolves fresh owning-parent grants, never serialized metadata or a trimmed
  child. Existing Mongoose casting/validation/save middleware and bounded persistence
  remain active; dedicated methods have no baseline model validate/prepare/transform/
  afterPersist hook pipeline, and do not start invoking model-root hooks on children.
- Split `PublicSubdocument*Options` before enabling authority. Override inherited
  PublicService methods to reject controls at actual dispatch, including direct JS,
  root/nested/custom-validator paths, and positively forward presentation options.
  No defaults, actor mutation or wire capability. Business payload authorization/
  overrides keys remain ordinary fields. Preserve all F01 paths and leave legacy
  helper retirement to F03; migrate dedicated input admission to private helpers now.

F02 implementation findings / resumed-session work:

- Initial dependency build and **45 new Mongo policy tests** passed; the first
  request-mode regression run passed **143 tests**. The invocation then hit a usage
  limit. The resumed session preserves that implementation and contract; no build
  or test process remained running. Documentation/installed-consumer work and final
  regression gates were still pending.
- Review found mandatory predicates aliased the mutable query object passed to
  overrideFilter. Add in-place-transform regressions and detach mandatory inputs
  before awaits, matching the shared prepared-query boundary. Also preflight a
  false list predicate before identifiers and preserve captured identifier config.
  Final caller review applies the same detached-identifier protection to the retained
  request-only getParentDoc helper; the in-place-transform Mongo test covers both.
- Whole-parent virtual scrubbing in dedicated writes would remove stale persisted
  virtual values from unrelated children/scopes. Dedicated operations have no root
  transform stage; shared admitted child input already excludes virtual/control
  writes. Remove that whole-parent mutation and assert unrelated stored values stay
  intact. Capture original child snapshots before awaiting pre-write grant hooks.
- The three new predicate/identifier regressions reproduced failures and now pass.
  Strict package typecheck exposed scoped generic/filter adapter mismatches; align
  the adapters with child-relative public filter types without weakening policy types.
- Replace the private parent lookup's `parent.success === false` discrimination:
  a persisted business `success: false` must not be mistaken for an ErrorResult (or
  returned raw). Use a private `{ parent }`/`{ error }` wrapper and a Mongo regression.
- Broader regression run: **402 passed / 4 failed**. Restore dedicated request-mode
  recursive virtual-name scrubbing inside Mixed/plain child containers, using the
  existing sanitizer on detached admitted input (never on the parent). Explicit
  grants matching these legacy virtual aliases must reject before effects rather
  than be silently scrubbed. Restore detailed bulk complexity errors. Two route
  failures only observed the retired internal Core.genFilter transport; verify their
  real configured hooks and database predicate instead, preserving all route guards.
- The seven affected subdocument/route/virtual/complexity suites now pass **307 tests**.
  README runnable Mongo and declaration/export documentation checks passed. Three
  installed-consumer variants found one older boundary fixture still treating
  SubdocumentReadOptions as public; migrate that assertion to PublicSubdocument\*
  types while retaining strict public/default/nested capability exclusions.

#### F02 completion evidence — 2026-10-12

Delivered (implementation paths in this summary are relative to
`packages/access-router/` unless explicitly prefixed with `packages/`):

- Internal dedicated list/read/create/update/bulk-update/delete accept the recorded
  bounded `{ parent, child, visibility }` authorization shape. Root and `/advanced`
  export the method-specific `SubdocumentReadAuthorization`,
  `SubdocumentMutationAuthorization`, `SubdocumentCreateAuthorization`,
  `SubdocumentDeleteAuthorization`, `SubdocumentVisibilityAuthorization` and
  `SubdocumentCreateVisibilityAuthorization`, scoped gate/input/output types,
  inferred `SubdocumentModel`/`SubdocumentVirtuals`, and internal/public options.
- Policy-bearing calls independently gate parent read/update and the named child
  operation; absent dimensions are request-mode. No-policy initiating behavior and
  generated base/basic/advanced guards remain compatible. Parent fields, child create
  rows, mutation output fields outside visibility, delete fields/visibility, related
  policies, invalid scopes/paths and malformed/oversized policies reject before effects.
- `packages/access-router/src/acl/subdocument-authorization.ts` captures policies,
  configuration, original permissions and identifier behavior before awaits. Its
  private row adapter preserves mandatory parent/selected-child predicates even
  under in-place transformation; terminal false and inert scopes remain terminal/
  inert. Owning-parent/child membership, read/list intersections, stored ordering and
  visible counts have Mongo-backed assertions. The retained request-only raw parent
  helper also detaches its mandatory identifier from transforms.
- `services/model-subdocument-service.ts` now uses F01 `admitModelInput` through
  scoped `requestInputFields` and original-child snapshots. Update document grants
  use the untrimmed hydrated owning parent; output uses fresh read-stage parent
  grants. Input, output, row and operation authority remain independent. Nested
  descendant/container/ID semantics, hidden fields, classes, virtual/control exclusion,
  legacy Mixed virtual-name scrubbing, Mongoose validation/save and limit-one nested
  hook work pass. No parent DTO is used for persistence or returned as an error.
- `acl/subdocument-output.ts` consumes only captured child output authority through
  the shared planner/finalizer and private handles. Referenced targets stay request-only.
  Post-write visibility has independent parent read, child read, and create-only child
  list policies. Hidden persisted writes succeed with null/[]; deletion returns the ID.
  Tests pin virtual/output/document access stages and original owner-hook inputs.
- PublicService overrides every inherited dedicated entry method, rejecting control
  slots before dispatch and positively forwarding presentation options. Positive
  backend grants accompany public/JS/inherited/non-enumerable/root/nested/custom-
  validator negatives. Business authorization/overrides fields remain writable under
  ordinary rules. Defaults and actor state gain no authority.
- README now provides typed scoped usage, method/applicability/migration tables and
  an executing Mongo example that checks protected child writes against storage.
  Website `services.mdx`, `llms.txt`, public JSDoc, emitted declarations and installed
  consumer fixtures agree. The new
  `test/service-authorization-subdocument-policies.integration.test.ts` has **59 tests**.
  All concrete findings above are resolved; no F02 blocker remains.

Passing verification (all rebuilding commands serialized):

1. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, five-package
   dependency closure, CJS/ESM and declarations.
2. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-subdocument-policies.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/nested-update-integrity.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/request-complexity.integration.test.ts`
   — **7 files / 307 tests passed** after the Mixed/complexity/route fixes.
3. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed**, including
   its serialized dependency build and `tsc --noEmit`; repeated successfully after
   the final retained-parent-helper identifier fix.
4. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/model-subdocument-routes.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-public-boundaries.integration.test.ts test/service-authorization-input.integration.test.ts test/service-authorization-mutations.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/service-authorization-context.unit.test.ts test/service-denial-contract.test.ts test/filter-denial.integration.test.ts test/model-router.test.ts test/advanced-mutation-bodies.integration.test.ts test/field-permissions-opt-out.integration.test.ts test/virtuals-populate-include.integration.test.ts`
   — **13 files / 341 tests passed**. Includes F01 protected input/storage behavior,
   public/route boundaries, target isolation, hooks, metadata and nested execution.
5. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-subdocument-policies.integration.test.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`
   — **4 files / 160 tests passed**. The **3 documentation/consumer/export files
   contribute 101 unique tests**; the 59 policy tests repeat item 2. Installed
   Bundler, NodeNext ESM and NodeNext CJS fixtures compile; CJS/ESM exports and
   README Mongo workflows execute. A separate strict-consumer rerun also passed
   **13 tests** after migrating its older public-options fixture.
6. Final retained-parent-helper fix:
   `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-subdocument-policies.integration.test.ts`
   — **59 tests passed** after the final typecheck/build. This is a repeat, not
   additional unique tests.
7. Targeted lint — **passed**:
   `pnpm exec eslint packages/access-router/src/acl/model-input-admission.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/subdocument-authorization.ts packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/interfaces/service-authorization.ts packages/access-router/src/interfaces/subdocument-authorization.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/interfaces/index.ts packages/access-router/src/index.ts packages/access-router/src/services/model-service-defaults.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/services/service.ts packages/access-router/src/routers/model-router-subdocument-routes.ts packages/access-router/test/service-authorization-subdocument-policies.integration.test.ts packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts packages/access-router/test/service-authorization-consumer.types.fixture.ts packages/access-router/test/service-authorization-boundary.types.fixture.ts packages/access-router/test/service-authorization.types.fixture.ts packages/access-router/test/export-contract.test.ts`.
   Repeated for the final changed implementation/test:
   `pnpm exec eslint packages/access-router/src/services/model-subdocument-service.ts packages/access-router/test/service-authorization-subdocument-policies.integration.test.ts`
   — **passed**.
8. Inspected `packages/access-router/dist/index.d.ts`,
   `packages/access-router/dist/index.d.mts`, `packages/access-router/dist/advanced.d.ts`,
   `packages/access-router/dist/advanced.d.mts` and their shared declaration graph.
   Scoped child generics, method-specific never exclusions, separate PublicService
   signatures and JSDoc survive. Export tests verify no private issuer/row/input
   boundary is exposed. No new package entrypoint.
9. `git diff --check` — **passed**. `git hash-object CHANGELOG.md` — unchanged
   **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.

Final unique acceptance coverage: **23 files / 749 tests passed** (648 runtime/
regression tests plus 101 documentation/consumer/export tests; red runs and repeated
tests excluded). Verified `_tmp-svaf` with `ls -ld . _tmp-svaf` and
`git check-ignore _tmp-svaf/fixture`; suites removed their fixtures, leaving only
the ignored Node compile cache. Full workspace gates remain F04. F03/F04 are pending.

#### F02 handoff to F03 — caller inventory and private replacements

Paths below are relative to `packages/access-router/`:

- Dedicated mutations no longer call positional genQuerySelect/genAllowedFields or
  use pick as write admission. Their package-private adapter is `inputAdmission` in
  `services/model-subdocument-service.ts`, using `requestInputFields({ scopePath })`,
  `resolveInputDocumentGrants`, original child snapshots and `admitModelInput`'s paired
  allowedData/allowedFields. Preserve request bracket/index aliases and the dedicated
  post-admission Mixed virtual-name sanitizer. This grants neither rows nor output.
- New private scoped boundaries are `prepareSubdocumentCall`, `subdocumentRows`,
  `subdocumentParentFilter`, `subdocumentGateAllowed`, `subdocumentInputPolicy` in
  `acl/subdocument-authorization.ts`. `prepareSubdocumentOutput` accepts captured
  output-only policy/configuration/permissions; it and `finalizeSubdocumentRows`
  retain shared plans/handles and owning-parent read-stage grants. F03 should not
  route child input, rows or request metadata through output helper authority.
- **Remaining model request callers:** `Service.authorizeDistinctField` in
  `services/service.ts` calls genAllowedFields(null, read) (normal and fallback);
  preserve request-only distinct semantics. `Core.addFieldPermissions` in `core.ts`
  calls genAllowedFields for read/update metadata; preserve request-user `_view`/
  `_edit`, never serialize backend grants as actor privileges.
- **Remaining population callers:** `Core.genPopulate` uses positional genSelect
  for source admission (false + subPaths) and target selection (false). The retained
  request-only `getParentDoc` helper in `services/model-subdocument-service.ts` still
  calls `service.genPopulate('read', ..., [sub, 'sub'])`. Dedicated readSub uses the
  private execution populate planner instead. Preserve target gates/rows and scope
  translation when migrating these legacy helper paths.
- **Remaining overload/adapters:** Core/Base (`core.ts`, `services/base.ts`)
  genSelect/genQuerySelect/genAllowedFields/pickAllowedFields/trimOutputFields still
  contain the legacy boolean/subPaths/baseFields dispatch. DataCore/DataService
  (`core-data.ts`, `services/data-service.ts`) retain their request-only positional
  adapters; data find/findOne use genQuerySelect/trimOutputFields, and data sort uses
  genAllowedFields. `acl/select-resolution.ts` remains the private request evaluator
  used by Core/DataCore and F01/F02 request input. Keep data/metadata semantics
  separate from the model catalog/output planner.
- **Consumer migration sites:** `test/service-authorization.types.fixture.ts`,
  `test/service-authorization-consumer.types.fixture.ts` and
  `test/service-authorization-migration.types.fixture.ts` still assert supported
  legacy positional helpers. Update their removal expectations with F03's migration.
  `test/service-authorization-boundary.types.fixture.ts` now uses public subdocument
  options. Retain its public/default/nested negatives and the new backend positives.
  README/llms/website positional-helper migration statements still point to F03.

F01 work is preserved. F03 owns all overload removal; F04 owns independent review
and full workspace/packaging integration. Neither task was started here.

### Task SVA-F03: Remove positional helper overloads and migrate callers

Status: completed

Owner: fresh dedicated F03 implementation session, no subdelegation. SVA-11,
F01 and F02 are complete. Preserving their uncommitted work; verified the
CHANGELOG blob and existing ignored `<repo-root>/_tmp-svaf` before inspection.
F04 remains pending for a fresh independent reviewer and full workspace gates.

Priority: P1.

Suggested agent: helper API/installed-consumer specialist, fresh session.

Dependencies: completed SVA-11, SVA-F01, SVA-F02 (shared-file sequencing).

Primary ownership:

- `packages/access-router/src/core.ts`, `src/core-data.ts`, `src/services/base.ts`,
  data-service/shared helpers and package-owned callers.
- Named option interfaces, installed-consumer fixtures, package/data regressions,
  declaration and README/website migration contracts.

Finding: Positional `skipChecks`/`subPaths` and arbitrary `baseFields` remain
separate compatibility entrypoints; some request/input/data internals use them.
Simply routing all calls through the model output planner would change write and
data semantics and permission metadata.

References: original SVA-F03/C3/C10; `core.ts:180-387`, `core-data.ts:82-141`
at activation baseline; package strict/packed consumer tests.

Implementation requirements:

1. Inventory model/data/internal/external-fixture callers and record their
   replacement and semantics. Remove the signatures in this breaking change.
2. Use named output planning and output grants/document handles where appropriate;
   keep request/input admission and private system retention explicit and separate.
3. Define named request-only data helper compatibility without introducing model
   catalogs or incidental new DataService authority. Document unsupported legacy
   elevation and controlled removal behavior if no data capability replaces it.
4. Reject old JS positional booleans/arrays/extra arguments predictably; reject
   removed TS overloads in installed fixtures. Avoid silent option fallback.
5. Migrate all package-owned callers, tests, emitted declarations and live docs.
   Historical task findings can remain with resolution pointers.

Acceptance criteria:

- Consumer fixtures prove supported named migrations and removed-overload errors.
- Canonical model grant/planning/filtering and new F01/F02 behavior still pass;
  request input, data output, and metadata preserve their documented contracts.
- Package/data/packed-consumer tests and typecheck pass; inventory/evidence follow.

#### F03 caller inventory and implementation contract (before implementation)

Repository-wide inspection covered source, tests, type fixtures, examples/templates,
README/JSDoc/llms/website, other workspace packages and historical docs. Runtime
helper implementations are confined to access-router. Paths below are relative to
`packages/access-router/` unless prefixed otherwise.

| Current surface/caller                                                                                                                                                                                                                                                             | Replacement and preserved boundary                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core.ts`, `src/services/base.ts`: five model helpers and their aliases                                                                                                                                                                                                        | Single named output signature per helper; remove legacy dispatch and all positional parameters. PublicService/Service inherit the same helpers.                                                                                                                                         |
| `Core.genPopulate`: source `genSelect(..., false, subPaths)` and target `genSelect(..., false)`                                                                                                                                                                                    | Explicit private request-only persisted selection, preserving source/target admission, virtual exclusion, target operation/row gates, private target dependency/identity fetch and retained target plan. Do not make fetch dependencies authorize population.                           |
| `Base.genPopulate`, retained `getParentDoc` in `src/services/model-subdocument-service.ts`                                                                                                                                                                                         | Also retire positional populate `subPaths`; named scope-only `PopulatePlanningOptions`, translating `['contacts']` to private permission-definition scope. Existing root helper consumers retain omission/default behavior.                                                             |
| `Core.addFieldPermissions`                                                                                                                                                                                                                                                         | Private shared request-field collection using the request actor and existing serialized request-document grants. No new document hook, output catalog/grant, or input authority in `_view`/`_edit`. Preserve row visibility checks.                                                     |
| `Service.authorizeDistinctField` normal/fallback                                                                                                                                                                                                                                   | Private request-schema collection with empty document grants, keeping virtual exclusion, query-field checks and hook arguments; never use existing-output `genAllowedFields(null)` or output grants.                                                                                    |
| F01/F02 `requestInputFields` / `admitModelInput`                                                                                                                                                                                                                                   | Retain persisted request admission and private prewrite grants. Share only the request-rule collector, preserving bracket/index schema aliases, array/container semantics and scoped virtual/control sanitization.                                                                      |
| `src/core-data.ts`: genSelect/genAllowedFields/pickAllowedFields; `src/services/data-service.ts`: those plus genQuerySelect/trimOutputFields                                                                                                                                       | Named `DataFieldOptions`; request-only evaluator, no model registration/catalog/document hook or DataService authorization. Find/findOne/default output and list sort keep this evaluator.                                                                                              |
| `src/acl/select-resolution.ts`, `src/core-shared.ts`                                                                                                                                                                                                                               | Remove now-unused arbitrary baseFields/skipChecks inputs from request collectors themselves. Private output planner identity/join/dependency retention remains separate and is not a public grant.                                                                                      |
| `test/service-authorization{,-consumer,-migration}.types.fixture.ts`                                                                                                                                                                                                               | Replace legacy positive calls with named positives and removed-call negatives; add exhaustive helper/default/undefined-plus-extra coverage against installed root/advanced declarations. Keep F01/F02/public-boundary negatives and positives.                                          |
| Legacy success assertions in `test/service-authorization-baseline.contract.test.ts`, `test/service-authorization-finalizer.unit.test.ts`, `test/service-authorization-projection.unit.test.ts`                                                                                     | Preserve denied/granted/identity/request-rule coverage through named equivalents and explicit removal assertions. Existing named grant/handle/finalizer/direct/related/subdocument tests remain substantive.                                                                            |
| Route/mock callers in `test/model-router.integration.test.ts`, `test/operation-access-{boundaries,data-subdocument-routes}.integration.test.ts`, `test/service-denial-contract.test.ts`, `test/service.internal.test.ts`; default data pick in `test/data-service-scaling.test.ts` | Root populate and data-default calls remain supported. Assertions that observe an old transport must instead observe actual request hooks/authorized data if migration makes them obsolete.                                                                                             |
| `packages/access-router-deco/test/cross-path.integration.test.ts`                                                                                                                                                                                                                  | Only other-package use: private request collector with redundant empty baseFields and a now-obsolete Core delegation comment. Migrate this fixture and verify its OR-combination coverage. No active helper calls found in other package source, starter templates or website examples. |
| README, `llms.txt`, `website/docs/packages/access-router/services.mdx`, `docs/acl-architecture-review.md`                                                                                                                                                                          | Publish breaking-release defaults/removal/data/populate migration now; retain historical observations with a resolution pointer. Original task findings remain historical.                                                                                                              |

Exact API/default/removal decisions:

- Model Base/Service/PublicService signatures (Core prepends `modelName`):
  `genSelect(access, select?, options?: OutputPlanningOptions)`, identical
  `genQuerySelect`; `pickAllowedFields(doc, access, options?: OutputFieldOptions)`,
  identical `trimOutputFields`; `genAllowedFields(doc, access,
options?: AllowedOutputFieldOptions)`. Preserve model/virtual/path generics.
- Omitted/explicit-undefined options on planning/pick/trim equal `{}` (fresh
  request-mode **output**). Allowed-fields omission/undefined equals
  `{ purpose: 'output' }`; an explicitly supplied options object still requires
  `purpose: 'output'`. No-option allowed-fields reports existing authorized paths,
  not a request-schema/input allowlist; null/undefined docs yield `[]`, pick/trim
  preserve them without hooks. These are deliberate breaking default changes.
- Default model planning now defers document-dependent rules without invoking
  permission functions/getters, excludes definitely denied fields, includes only
  canonical private identity/dependency inputs and honors requireExplicitSelect.
  Default filtering isolates hydrated/plain output, evaluates fresh document grants
  on suitable raw input, ignores forged serialized grants, preserves canonical
  identity/metadata posture and nested rules, and rejects unsupported scalar/array
  documents. Known trimmed output cannot reconstruct missing document decisions;
  use the authenticated original document handle. Output grants remain additive
  and independent of selection, writes, rows, query fields and referenced targets.
- `DataFieldOptions` (root and advanced type export) supports only ordinary readonly
  `scopePath?: readonly string[]`; authorization/documentAuthorization are forbidden.
  Same named shape on every existing data helper, optional with `{}` default. Scope
  chooses the nested permission schema via private `.sub` traversal; no model
  catalog is consulted. Allowed-fields remains a request-schema allowlist even with
  null/no data; functions receive only request permissions and `this === req`.
  Data pick retains only request-authorized existing fields, with no automatic `_id`
  or permission-metadata retention. genSelect returns the normalized requested-token
  intersection with allowed request fields; omitted/null/empty/exclusion-only select
  yields `[]`. Data find/findOne historically interpret that empty intersection as
  no additional projection after request trimming, including all-denied selections;
  preserve/document this compatibility explicitly. Old data skipChecks never elevated
  fields; old arbitrary baseFields elevation is removed/unsupported, with no substitute
  bypass or new data policy capability.
- `genPopulate(access?, populate?, options?: PopulatePlanningOptions)` (Core prepends
  modelName) accepts the same ordinary scope syntax but only scope, not model output
  authority/handles. No-option remains request-only root population. No new entrypoint.
- Every public helper/alias validates its own actual argument count before forwarding,
  including Base/DataService wrappers. Booleans, arrays, null/non-object options,
  retired named bypass keys and **any** extra positional arguments (even an explicit
  undefined options slot followed by undefined/array/object) reject with controlled
  actionable BadRequest errors before permission hooks/catalog/persistence. TypeScript
  exposes only finite named signatures, so removed argument counts also fail installed
  strict fixtures. Scope-only data/populate options reject unknown capability keys and
  malformed/definition/index/prototype paths; no silent fallback.

Necessary verification-infrastructure finding, recorded before changes:

- `test/packed-consumer-compatibility.test.ts` unconditionally runs build-artifact in
  its shared beforeAll even when selecting only tarball tests. Make artifact preparation
  lazy for artifact-specific cases so this session can run actual locally packed,
  installed CJS/ESM/Node16/NodeNext/Bundler consumers without invoking prohibited release
  tooling. Preserve all artifact checks for F04. Package-wide F03 checks will exclude
  that artifact-bearing file and run its actual tarball checks separately. The local
  production manifest transformer is allowed test staging, not a release invocation.

Additional inspection findings necessary for the same acceptance boundary:

- `Service.buildVirtualPlan` and `buildSubVirtualPlan` are unused former orchestration
  methods (no repository callers), but their public declarations still expose a
  separate raw snapshot/planning seam, including arbitrary `internalFetch.baseFields`.
  Remove these obsolete builders in this breaking release; supported public fetch
  helpers are genSelect/genQuerySelect, while retained plans belong to private service
  execution. Add installed declaration negatives and document the migration.
- Retained `Core.genPopulate` source admission currently calls the old selector with
  `alwaysSelectFields`, allowing a fetch-only source relationship to pass its field
  gate. Separate source request admission from target private hook-input fetch; add a
  regression proving a denied source stays denied even when privately fetched.
  Target hook-input fetch, target operation/row checks and virtual dependencies remain.

First verification findings:

- The first dependency declaration build exposed an overly broad inferred data-option
  lookup type; a private typed scope/schema accessor resolves it. The repeated five-
  package dependency build passed.
- First focused run: **185 passed / 5 failed** across the new helper-removal suite and
  migrated baseline/projection/finalizer suites. Runtime rejection matrices already
  passed. Existing controlled authorization errors expose migration detail in `result`
  while `Error.message` is just Bad Request; make the new removal errors actionable
  through both channels. Other existing policy errors retain their structured contract.
- One new expectation incorrectly treated explicit `select: []` as omitted under
  requireExplicitSelect. Both canonical planners intentionally restrict only omitted/
  undefined selection; explicit null/empty selection considers ordinary candidates
  under the selected policy (no implicit grant). Preserve this behavior, characterize
  it in tests, and state the distinction in defaults documentation.
- The migrated three legacy suites now pass; the two new suites pass **66 tests**
  after correcting fixture assumptions for embedded `_id: false` and function-valued
  request base filters. Package typecheck and **107 documentation/installed-type/export
  tests** pass. Actual tarball manifest/content checks and migration type fixtures pass,
  but the new executable installed fixture failed strict compilation on existing
  unknown document-hook inputs, middleware-installed request types, data-shape inference
  and fetch-result inference. Correct the consumer fixture using real guards/types;
  include it in focused installed compilation before rerunning both packed peer sets.
- Focused installed compilation then exposed a real configuration-type gap: existing
  runtime `permissionSchema.<field>.sub` scopes cannot be expressed as typed object
  literals because `PermissionRule` omits `sub`. Named data/populate scope migration
  needs this configuration. Add recursive `sub?: PermissionSchema` only to the
  permission-schema rule type (not OperationAccess/route guards); keep route variants
  forbidden as field rules. Verify typed scoped model/data configuration and negative
  route/child-field cases in installed fixtures. Runtime request semantics do not change.
- First broad package wave (all files except artifact-bearing compatibility): **98
  files passed; 2 files failed; 2,149 tests passed / 3 failed**. Two substantive
  `virtuals-hardening.boundary.test.ts` storage assertions show model-root input
  admission retaining registered virtual-name aliases inside Mixed values (e.g.
  meta.fullAddress). Restore the established scope-aware recursive alias exclusion
  in the shared private input catalog/admission/prepared boundary; explicit alias
  grants must reject. Preserve untouched existing siblings and F01/F02 array/identity
  semantics, and add stored-state grant/class/prepare regressions before final gates.
- The other broad failure is an obsolete internal-call assertion in
  `service-authorization-boundary-admission.contract.test.ts`: F02 now legitimately
  accepts an internal `{ authorization: {} }` scope, but its pre-F02 fake model has no
  schema. Migrate that negative to the actual PublicService dedicated dispatch while
  retaining direct private rejection tests for all other unsupported controls and
  nested-populate attacks. Do not weaken production F02 authorization.
- The nine added input regressions reproduced **8 failures / 1 passing sibling-
  preservation control** before the shared catalog fix. After the fix, the six
  focused helper/input/F02/virtual/public-admission suites pass **265 tests**.
- Final caller review found that the migrated distinct collector used the service's
  construction snapshot, whereas its former Core helper read current request field
  configuration on each call. Preserve that call-time behavior through the receiving
  runtime's options (still no catalog or output policy), and pin a same-service policy
  update regression before final checks.

#### F03 completion evidence — 2026-10-12

Delivered contract (paths relative to `packages/access-router/` unless prefixed):

- Core and Base/Service/PublicService now expose one finite named signature for each
  output helper. Base signatures, preserving the existing model/virtual generics:
  `genSelect(access, select?, options?: OutputPlanningOptions): Promise<string[]>`
  and `genQuerySelect` alias;
  `pickAllowedFields<T>(doc, access, options?: OutputFieldOptions): Promise<T>` and
  `trimOutputFields` alias;
  `genAllowedFields(doc, access, options?: AllowedOutputFieldOptions): Promise<string[]>`.
  Core prepends `modelName` and retains its explicit model/virtual generic parameters.
  All five use canonical named output semantics with no legacy default dispatch.
- Omitted/undefined planning/pick/trim options equal `{}`. Allowed-fields omission/
  undefined equals `{ purpose: 'output' }`; supplied objects require the purpose and
  report only existing output paths. Nullish model documents preserve null/undefined
  in pick/trim and produce `[]` for allowed-fields without hooks. Hydrated inputs are
  isolated. Planning defers document rules, retains private identity/dependencies and
  respects normal selection; requireExplicitSelect restricts omitted/undefined select,
  while explicit null/empty keeps all-candidates compatibility under field authority.
  Raw policy is fresh evaluation; authenticated handles retain original document
  decisions. Selection, output, input, query fields, rows and related targets stay separate.
- All retired JS booleans/arrays, named bypass keys, malformed option containers and
  extra arguments reject before helper hooks/planning, including undefined-plus-extra.
  Each wrapper/alias checks its own count. Removal errors have actionable `Error.message`
  and structured BadRequest `result.errors`, with model/data/populate migration guidance.
  No adapter, deprecation interval, version switch, new entrypoint or transport capability.
- `DataFieldOptions` and `PopulatePlanningOptions` are root/advanced type exports with
  readonly ordinary `scopePath` and explicit model-policy/handle exclusions. Existing
  DataCore genSelect/genAllowedFields/pickAllowedFields and DataService's five helpers
  accept optional DataFieldOptions (`{}` default); DataCore still has its original
  three helper names. They keep the request-only data evaluator: schema allowlists,
  one permission argument/actual request receiver, whole-container picks, no automatic
  identity/metadata retention, model catalogs/hooks or new DataService authority.
  Empty requested-token intersections retain the documented no-extra-projection
  behavior in find/findOne. Legacy data elevation is removed/unsupported.
- Core/Base `genPopulate` now accepts named scope-only PopulatePlanningOptions.
  `getParentDoc` migrated to `{ scopePath: [sub] }`. Private request source admission
  excludes fetch-only grants; target operation/rows/persisted fields and private
  hook/virtual inputs remain explicit. The unused raw `buildVirtualPlan` and
  `buildSubVirtualPlan` service builders were removed; retained plans stay private.
- `acl/select-resolution.ts` and `core-shared.ts` no longer accept skipChecks/baseFields.
  Private `collectModelRequestFields` serves persisted input, request metadata and
  distinct admission. Core `_view`/`_edit` retain existing request-document grants
  without a new hook; distinct retains empty grants and current request configuration
  on reused services. F01/F02 input admission keeps concrete write boundaries.
- `PermissionSchema` now types its existing recursive `sub` configuration without
  adding field rules to operation guards. Broad verification also restored scoped
  virtual-name alias exclusion in `acl/field-catalog.ts`/`model-input-admission.ts`:
  submitted/prepared Mixed/class/Map aliases are excluded, explicit alias grants reject,
  and untouched existing siblings remain. The nine new stored-state tests reproduced
  eight failures before the fix. Dedicated F02 behavior remains covered and passing.
- New `test/field-helper-removal.contract.test.ts` has **60 tests** across built CJS/ESM
  Core/Service/PublicService/DataCore/DataService, defaults, metadata and data behavior.
  `test/field-helper-request-boundaries.integration.test.ts` has **7 Mongo tests** for
  distinct, reused-service request rules, population and retained raw-parent behavior.
  F01's input suite now has **52 tests** (43 original plus 9 F03 alias regressions).
  Migrated original positional success assertions to removal/named equivalents;
  migrated the old F02 boundary assertion to actual PublicService dispatch.
- `test/field-helper-migration.types.fixture.ts` covers every helper/alias, inherited
  public helpers, root/advanced acquisition, scoped configuration, named positives,
  removed calls and explicit undefined-plus-extra TS failures. The executable
  `test/field-helper-consumer.runtime.fixture.ts` runs installed CJS/ESM helper checks.
  `strict-consumer-types.test.ts`, `packed-consumer-compatibility.test.ts` and
  `export-contract.test.ts` verify installed declarations, finite signatures/JSDoc,
  exports and private exclusions. Artifact-only test preparation is lazy; all artifact
  cases remain for F04. No publish, build-artifact or verify-artifact command was
  invoked by F03.
- Migrated the only other-package collector fixture in
  `packages/access-router-deco/test/cross-path.integration.test.ts`. Shipped README,
  llms, JSDoc and `website/docs/packages/access-router/services.mdx` agree on the
  breaking defaults/removal/data scope contract. `docs/acl-architecture-review.md`
  retains historical findings with a resolution pointer.

Verification ledger (all rebuilding commands serialized; TMPDIR is repository-local):

1. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, five-package
   CJS/ESM/declaration closure. Initial TS2322 data lookup failure was fixed; subsequent
   builds passed, including the shared alias correction. The final typecheck below
   rebuilt again after the last distinct call-time correction.
2. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/field-helper-removal.contract.test.ts test/service-authorization-baseline.contract.test.ts test/service-authorization-projection.unit.test.ts test/service-authorization-finalizer.unit.test.ts`
   — initial **185 passed / 5 failed**, resolved as recorded above.
3. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/field-helper-removal.contract.test.ts test/field-helper-request-boundaries.integration.test.ts test/service-authorization-baseline.contract.test.ts test/service-authorization-projection.unit.test.ts test/service-authorization-finalizer.unit.test.ts`
   — **193 passed / 3 failed**, with all three migrated legacy suites passing. Corrected
   the new explicit-selection/embedded-ID/function-base-filter fixture expectations.
4. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/field-helper-removal.contract.test.ts test/field-helper-request-boundaries.integration.test.ts`
   — **2 files / 66 tests passed** at that point (request suite later gained one test).
5. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed**, including
   serialized dependency build and `tsc --noEmit`; repeated after scoped configuration
   typing and after the final input/distinct corrections, both passing.
6. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`
   — **3 files / 107 tests passed**. All run again successfully on the final code in
   item 11. Includes executing README Mongo workflows and installed declarations.
7. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t SVA-F03`
   — after adding executable fixture compilation, first **5 failed / 13 skipped**
   exposed the PermissionSchema.sub type gap; after correction **5 passed / 13 skipped**.
   Both migration and runtime fixtures compile in Bundler, NodeNext ESM/CJS and Node16
   ESM/CJS. Full final strict suite passes in item 11.
8. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-input.integration.test.ts -t F03`
   — intentional regression run **8 failed / 1 passed / 43 skipped** before the alias
   fix. All nine pass after it, in items 9 and 11.
9. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/field-helper-removal.contract.test.ts test/field-helper-request-boundaries.integration.test.ts test/service-authorization-input.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/virtuals-hardening.boundary.test.ts test/service-authorization-boundary-admission.contract.test.ts`
   — **6 files / 265 tests passed** after the broad-wave fixes; the subsequent reused-
   service distinct regression is verified in item 10.
10. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/field-helper-request-boundaries.integration.test.ts test/distinct-field-authorization.integration.test.ts test/arf12-root-distinct.authorization.integration.test.ts`
    — **3 files / 20 tests passed**, on final implementation/declarations.
11. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --exclude test/packed-consumer-compatibility.test.ts`
    — **100 files / 2,162 tests passed** on the final implementation. Initial wave
    was 98 passing files / 2 failing files, 2,149 passed / 3 failed; every finding was
    fixed with preserved or stronger coverage. Includes F01/F02, canonical planning,
    grants/handles, output isolation, mutations, virtuals, input/metadata, model/data
    routes, public controls, counts/sorting, complexity, docs and installed exports/types.
12. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts -t 'manifest transformation|rewrites every|packs the current|from release-artifact tarballs'`
    — final **5 passed / 3 artifact-only cases skipped**. Repeated successfully after
    the final input/distinct changes. Earlier run passed 3 manifest/content checks and
    failed 2 peer cases on the new runtime fixture's strict typing; fixed as recorded.
    Actual local tarballs use production-transformed metadata and install the full
    five-package local closure. Minimum peers (Express 5.0.0 / Mongoose 8.0.0) and current
    peers (5.2.1 / 9.8.0) run CJS/ESM helpers, root/advanced/processors import probes,
    strict Node16/NodeNext/Bundler migrations, emitted consumer code, README Mongo
    workflows and a real Node bundle. Current peers use full declaration checking.
    Packed JavaScript, declaration graph and shipped docs match the current files.
13. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/cross-path.integration.test.ts`
    — **1 file / 25 tests passed**, including the migrated request-grant OR boundary.
14. Targeted lint, repeated successfully on the final source/tests — **passed**:
    `pnpm exec eslint packages/access-router/src/acl/field-helper-options.ts packages/access-router/src/acl/select-resolution.ts packages/access-router/src/acl/field-catalog.ts packages/access-router/src/acl/model-input-admission.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/core-shared.ts packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/data-service.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/src/interfaces/data.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/interfaces/service-authorization.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/index.ts packages/access-router/test/field-helper-removal.contract.test.ts packages/access-router/test/field-helper-request-boundaries.integration.test.ts packages/access-router/test/field-helper-migration.types.fixture.ts packages/access-router/test/field-helper-consumer.runtime.fixture.ts packages/access-router/test/service-authorization-input.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/service-authorization-baseline.contract.test.ts packages/access-router/test/service-authorization-projection.unit.test.ts packages/access-router/test/service-authorization-finalizer.unit.test.ts packages/access-router/test/service-authorization.types.fixture.ts packages/access-router/test/service-authorization-consumer.types.fixture.ts packages/access-router/test/service-authorization-migration.types.fixture.ts packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts packages/access-router/test/export-contract.test.ts packages/access-router-deco/test/cross-path.integration.test.ts`.
15. Inspected `dist/index.d.ts`, `dist/index.d.mts`, `dist/advanced.d.ts`,
    `dist/advanced.d.mts`, and both `dist/parsers-DIRF6rNH.d.{ts,mts}` shared graphs.
    Defaults, readonly scope options, output-purpose/handle exclusions, finite generic
    signatures and JSDoc survive. Export tests introspect every existing core/service/
    inherited-public/data helper and alias. Private collectors/issuers and the removed
    raw builders are absent from supported exports/methods.
16. `git diff --check` — **passed**; `git hash-object CHANGELOG.md` — unchanged
    **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. Reviewed status/stat and the helper
    diff; F01/F02 work is preserved. Final edits after runtime checks only clarify an
    internal comment and record this completion evidence.

Final unique acceptance total: **102 files / 2,192 tests passed** (2,162 non-artifact
access-router tests + 5 actual tarball cases + 25 decorator consumer tests). Repeated
focused/failed runs are excluded. `_tmp-svaf` parent/ignore verified with
`ls -ld . _tmp-svaf` and `git check-ignore _tmp-svaf/fixture`; consumer/Mongo fixtures
cleaned themselves, leaving only the ignored Node compile cache. No F03 blocker remains.

#### F03 independent-review handoff

- F01/F02 behavior is preserved and covered by the final package wave; F03 owns the
  additional input-alias correction and obsolete public-boundary fixture migration
  documented above. Review these together with the private request/output separation,
  data empty-intersection compatibility, reused-service distinct rules and source
  populate fetch/admission separation.
- Inspect `field-helper-options.ts`, Core/Base/DataCore/DataService finite wrappers,
  `collectModelRequestFields`, the catalog alias predicate and both installed fixtures.
  Retired names remain only in rejection/migration tests/docs, historical findings,
  unrelated local path variables and private identity/dependency retention. No public
  arbitrary baseFields or skipChecks authority remains.
- F04 stays **pending** for a fresh independent reviewer, the integrated diff, full
  workspace `pnpm build`, serialized `pnpm test`, `pnpm lint`, final dry-run packaging
  and artifact-only cases, task/evidence review and unchanged CHANGELOG verification.
  The packed suite now prepares the artifact lazily only for its three artifact cases;
  F03 selected and fully executed actual tarball cases without release tooling.

### Task SVA-F04: Independently review and verify the integrated phase

Status: completed

Owner: fresh independent F04 reviewer session, distinct from all three implementation
sessions; no subdelegation. F01/F02/F03 completion records and dependencies inspected.
Starting HEAD is `c289f17`; all tracked and untracked activation/implementation work
is preserved. Verified the existing ignored `_tmp-svaf` and the required CHANGELOG
blob before auditing runtime, types, tests and published documentation.

Priority: P1.

Suggested agent: independent reviewer, fresh session distinct from implementers.

Dependencies: SVA-F01, SVA-F02, SVA-F03, and required review findings
SVA-F04-F01 through SVA-F04-F04 (all completed).

Primary ownership: integrated diff, all acceptance evidence, final checks and
task-record review. Record concrete corrective follow-ups before fixes.

Implementation requirements:

1. Independently inspect all three implementations against their contracts and
   observable acceptance cases, including public/default/nested entry paths.
2. Confirm published declarations, README and actual CJS/ESM installed consumers
   agree; no legacy bypass or accidental data-service policy enters the API.
3. Run the final serial gates above. Resolve concrete findings with focused
   verification, then repeat only affected gates as justified by changes.
4. Review every task status/evidence, CHANGELOG hash, and final workspace diff.

Acceptance criteria:

- All three requested features have passing completion evidence and an
  attributable independent review; no required finding or check remains open.
- All final integration commands pass (or a concrete environmental blocker is
  reported honestly without marking this task complete).

#### Task SVA-F04-F01: Bound composite mutation input before recursive admission

Status: completed

Priority: P1 (required input/resource boundary).

Owner: independent F04 reviewer; no subdelegation.

Dependencies: completed SVA-F01/F02/F03; blocks F04 completion.

Primary ownership:

- `packages/access-router/src/acl/model-input-admission.ts` and mutation-entry adapters.
- Model/dedicated mutation regression tests and shipped input-boundary documentation.

Finding: `copyInputValue`, grant expansion and prepared-input sanitization recursively
visit admitted composite values without structural budgets/cycle checks. Model mutation
`parseClientData` and dedicated mutation `assertPublicAdmission` do not apply request
complexity to these payloads; the existing complexity walker also treats class/Map
containers as leaves. An independent built-ESM HTTP probe (custom handler calling the
internal create API) reproduced `RangeError: Maximum call stack size exceeded` for a
cyclic class under an unrestricted Mixed grant. With `maxNodes: 50`, a 60-key Mixed
payload reached the application validation hook. Existing F01/F02 class tests cover
field scrubbing, and F02 complexity tests cover policies/top-level bulk sizes, but
neither bounds these newly traversed payload containers.

Implementation requirements:

1. Use a shared, bounded composite-input boundary before recursive parsing/admission;
   cover model create/update/upsert and dedicated create/update/bulk-update, including
   direct JS/public service paths, classes, Maps, sparse arrays and cycles.
2. Apply configured input depth/node/collection limits without treating permission
   grants as a resource bypass. Bound trusted prepared-container sanitization too.
3. Preserve native persisted leaves, valid class/Map writes, marker semantics, existing
   array/sibling/identity rules, and validation/prepare/save hooks on valid inputs.

Acceptance criteria:

- Mongo regressions fail before the fix and pass afterward: controlled BadRequest,
  no input/permission/save effects for invalid payloads, unchanged storage, and a
  working bounded positive control. Prepared cyclic/deep values fail before save.
- Relevant F01/F02/complexity/consumer tests, package typecheck, and all final serial
  integration gates pass.

Completion evidence: the shared composite walker detects cycles and counts actual
class/Map/array contents (including holes), enforces configured request complexity
before parsing/input hooks and caps admission/prepared sanitization at depth 100 /
20,000 nodes. Model prepared execution, dedicated mutations and public dispatch use
the private boundary. Native leaves and valid composite writes retain their behavior.
The **10 new Mongo tests** failed before the fix and pass with no invalid-input
permission/validation/save effects, unchanged storage, and bounded positive controls.
Typecheck, focused consumer checks and the full workspace/artifact gates below pass.

#### Task SVA-F04-F02: Preserve untouched persisted siblings during virtual scrubbing

Status: completed

Priority: P1 (required mutation isolation).

Owner: independent F04 reviewer; no subdelegation.

Dependencies: completed SVA-F01/F03; blocks F04 completion.

Primary ownership:

- `packages/access-router/src/acl/model-input-admission.ts`, `stripDocumentInputVirtuals`.
- `packages/access-router/test/service-authorization-input.integration.test.ts`.

Finding: model-root update calls `stripDocumentInputVirtuals` after transform, which
unconditionally unsets every registered virtual path in the hydrated parent. A
descendant-only write to one array element consequently schedules deletion of stale
persisted virtual fields in untouched sibling elements and at unrelated roots. F02
already corrected the equivalent whole-parent sweep in dedicated writes; F03's
untouched-sibling test covers a Mixed alias, which this exact-path sweep does not
match, and misses registered paths such as `contacts.1.badge`.

Implementation requirements:

1. Limit the post-transform scrub to actual modified input boundaries, preserving
   unchanged persisted values outside a descendant grant.
2. Continue excluding submitted/prepared/transform-introduced virtual writes and
   preserve explicit container replacement and Mongoose dirty tracking.

Acceptance criteria:

- Mongo regressions for updateOne/updateById/upsert-update preserve untouched root
  and array-sibling stored virtual values while patching the authorized descendant.
- Existing input/prepare/transform virtual-exclusion, replacement and dedicated
  isolation regressions pass; relevant typecheck and final serial gates pass.

Completion evidence: `stripDocumentInputVirtuals` now checks Mongoose dirty paths
before removing transform-introduced virtual writes. **Three new Mongo regressions**
failed on the prior sweep and pass for updateOne/updateById/upsert-update. Existing
submitted/prepared/transform virtual exclusion and container-replacement tests pass,
as do dedicated isolation, typecheck and final integration gates.

#### Task SVA-F04-F03: Correct the direct createSub negative-boundary fixture

Status: completed

Priority: P2 (required meaningful regression evidence).

Owner: independent F04 reviewer; no subdelegation.

Dependencies: completed SVA-F02/F03; blocks F04 completion.

Primary ownership: `packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`.

Finding: the direct private `createSub` negative still passes the removed `isAllowed`
callback argument. Its intended malicious options become an ignored extra argument;
the business payload shifts into the options slot and its ordinary `overrides` key
causes the expected BadRequest for the wrong reason. PublicService negatives and the
Mongo policy suite are valid, but this purported direct-boundary evidence is not.

Implementation requirement: call the current private signature with real id/sub/data
positions, keeping each malicious control in the actual options argument.

Acceptance criteria: the complete boundary-admission contract suite passes with
correct argument positions and the existing no-persistence assertions retained.

Completion evidence: removed the obsolete callback argument from the private
createSub test call. Each injected control now occupies the real options slot.
The complete boundary-admission suite passes in both the **319-test focused wave**
and full **2,183-test access-router** invocation; no assertion was removed.

#### Task SVA-F04-F04: Resolve the final root lint gate

Status: completed

Priority: P2 (integration gate).

Owner: independent F04 reviewer; no subdelegation.

Dependencies: completed SVA-F01/F02/F03 and successful full workspace test run;
blocks F04 completion.

Primary ownership: `packages/access-router/test/operation-access-boundaries.integration.test.ts`.

Finding: the required root `pnpm lint` failed with two `no-unexpected-multiline`
errors at the dynamic Supertest calls (pre-correction lines 1124 and 1533). This
previously unchanged test file splits `request(f.app)` from its computed method
access. The full test suite already passed; the needed correction is formatting only.

Implementation requirement: join each computed property access to its receiving
expression without changing the call or any assertions.

Acceptance criteria: `pnpm lint` and `git diff --check` pass. No runtime/type or
whole-workspace rerun is needed for these whitespace-only changes.

Completion evidence: joined the two computed method accesses to their receiving
Supertest expressions. The repeated root `pnpm lint` passes with zero errors/warnings;
`git diff --check` passes. The file's runtime assertions had already passed in the
full workspace run; these final edits change only whitespace.

#### F04 independent acceptance audit — 2026-10-12

Attribution: performed by the fresh independent F04 reviewer, who did not implement
F01/F02/F03 and used no subdelegation. Read the entire activated record in substantial
chunks, the original contracts/completion pointers, both required skills and repository
instructions. Reviewed the tracked diff from clean baseline `c289f17` and every new
untracked implementation/test file directly, rather than treating prior summaries as
acceptance. The following audit precedes the final integration gates.

| Acceptance area             | Independent inspection and observable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F01 authority/applicability | Mutation-only public types and resolver applicability agree; request/grant/unrestricted are additive and independent of output, rows, query fields, operations and related targets. Read/new/helper/related negatives and positive writes assert storage. Policy/configuration/request permissions are captured before awaits; prewrite hydrated grants and post-write output stages are separate.                                                                                                                                                                       |
| F01 persisted admission     | Audited catalog, admission, applyUpdate and all mutation branches. Schema/Mixed/Map/reference boundaries, native aliases, virtual-name aliases, identity/control/prototype exclusions, JS/prepared containers, absent/scalar ancestors and nested existing-index arrays have meaningful Mongo assertions. Explicit container replacement and Mongoose hooks remain active. F04-F01 adds missing composite resource bounds; F04-F02 fixes unrelated stored-virtual deletion.                                                                                              |
| F02 scopes/gates/visibility | Inspected every dedicated method and private scoped adapter. Parent/child/visibility dimensions are separate; supplied-policy paired base gates coexist with historical no-policy initiation. Parent IDs and single/bulk-selected child predicates are detached and intersected after transforms. False remains terminal, scopes inert and validated. Create read/list intersections and successful hidden null/[] results are independent of writes. Raw-parent grant stages, target/other-array isolation and limit-one nested hook work are asserted against storage. |
| Public and alternate paths  | Reviewed inherited PublicService dedicated overrides, root/route dispatch, transformed validators, defaults, includes/populates/subqueries and JS control presence checks. Positive backend capabilities accompany wire/JS negatives, including business authorization/overrides controls. F04-F03 corrects a stale direct-private test signature; other meaningful boundary assertions remain.                                                                                                                                                                          |
| F03 helper migration        | Inspected finite Core/Base/DataCore/DataService wrappers and all actual-argument checks, including undefined-plus-extra. No legacy dispatch/builders remain. Model helpers use output planning/handles; request input, distinct and user metadata use private request evaluation. Data scope/empty-intersection compatibility, fresh reused-service distinct configuration, and populate fetch-versus-admission separation match tests/docs. Reviewed the decorator fixture's request-grant OR migration.                                                                |
| Installed surface           | package.json exports and bundled tsup entries remain root/advanced/processors only. Reviewed root/advanced CJS/ESM declaration links and shared types/JSDoc, installed migration/runtime fixtures, README executable examples, llms and website consistency. Named options, method exclusions and scoped generics match runtime. Actual tarball/artifact consumer checks remain enabled; no new entrypoint or client authority.                                                                                                                                          |

Focused correction evidence (all rebuilding commands serialized):

1. Independent built-ESM custom-handler probe reproduced a cyclic class stack overflow
   and oversized Mixed input reaching validation (`maxNodes: 50`, 60 keys).
2. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-input.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts -t F04`
   — intentional red run: **10 failed / 111 skipped**, **95.16 s**. All failures were
   the unbounded input/prepared recursion, before corrective runtime edits.
3. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, five-package
   JavaScript/declaration closure after F04-F01.
4. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-input.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/request-complexity.integration.test.ts test/nested-update-integrity.integration.test.ts test/advanced-mutation-bodies.integration.test.ts test/service-authorization-public-boundaries.integration.test.ts test/model-router.test.ts`
   — **7 files / 235 passed**, **61.79 s** after F04-F01.
5. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-input.integration.test.ts -t 'F04 .*untouched persisted virtual'`
   — intentional red run: **3 failed / 59 skipped**, **1.57 s**, reproducing F04-F02's
   deletion on updateOne/updateById/upsert-update before its fix.
6. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed**, including
   serialized dependency build and `tsc --noEmit`, after all runtime/JSDoc corrections.
7. `TMPDIR=<repo-root>/_tmp-svaf pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-input.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/virtuals-hardening.boundary.test.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`
   — **7 files / 319 passed**, **112.50 s**. Includes all **13 new Mongo regressions**,
   corrected private-boundary calls, F01/F02, transform/prepare virtual exclusion,
   executing README workflows and installed Bundler/Node16/NodeNext ESM/CJS fixtures.

#### F04 final integration and completion evidence — 2026-10-12

All final commands were run sequentially, with the root test script's
`--workspace-concurrency=1` preserved. Full build/test output was captured and its
summaries inspected; local harness log paths are omitted from this shared record.

1. `pnpm build` — **passed**, all build scripts in the 31-project recursive selection,
   including workspace libraries, declarations and application builds.
2. `TMPDIR=<repo-root>/_tmp-svaf pnpm test` — **passed**. Summed all 34 Vitest lane
   summaries: **11,349 passing test executions / 510 passing file executions** across
   25 test-bearing projects. This includes repeated compatibility lanes, not 11,349
   distinct test definitions. Access-router: **101 files / 2,183 tests passed**, no
   skips/TODOs, **540.02 s**. Its packed compatibility file ran **all 8 cases**:
   **5 actual tarball cases + all 3 actual artifact-tree cases reserved for F04**.
   Both minimum (Express 5.0.0 / Mongoose 8.0.0) and current (5.2.1 / 9.8.0) peers
   passed installed CJS/ESM execution, Node16/NodeNext/Bundler compilation, root/
   advanced/processors imports, finite helper migration, README Mongo workflows,
   declaration checks and the real Node bundle. The artifact was freshly assembled
   by the suite's `pnpm build-artifact --version 0.99.0-test` invocation.
3. `pnpm lint` — initial **2 errors**, recorded and corrected by SVA-F04-F04; repeated
   **passed**, zero errors/warnings. No runtime/type/assertion change followed the
   successful full workspace tests.
4. `npm pack --dry-run` in `packages/access-router` — **passed**: **17 files**, **451.7
   kB** packed / **2.3 MB** unpacked. Inventory is package.json, README.md, llms.txt,
   six root/advanced/processors CJS/ESM files, six matching entry declarations and
   two shared declaration files. Inspected both final shared graphs
   `dist/parsers-lfwubp2R.d.{ts,mts}` and their root/advanced links. The new input
   bounds JSDoc survives; policy types, finite signatures and private exclusions agree.
   Source version placeholders remain intentional; actual tarball tests verify the
   production manifest transformation separately.
5. `TMPDIR=<repo-root>/_tmp-svaf pnpm verify-artifact --version 0.99.0-test` — **passed**,
   `release artifact verified successfully`. Inspected the assembled inventory:
   **23 package directories / 5 manifest commands**, all at the test sentinel. This
   is test-only assembly/verification, with no production release selected.
6. `git diff --check` and no-index whitespace checks of **every untracked new file**
   — **passed**. `git hash-object CHANGELOG.md` — unchanged
   **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. The explicit diff check of CHANGELOG,
   root/package manifests, lockfile and release-artifact configuration is empty.
7. Reviewed all task statuses/dependencies/evidence: the four activated tasks and
   four required F04 findings are completed. F01 → F02 → F03 → F04 sequencing and
   independent ownership are preserved; findings depend only on completed feature
   tasks/checks, so no dependency cycle or open acceptance item remains. Updated the
   original header/activation summary with this final pointer; historical deferrals
   and earlier handoff states remain historical evidence.

Workspace test accounting (passing executions, compatibility lanes included):

| Project under `packages/` unless prefixed |     Passed |
| ----------------------------------------- | ---------: |
| asset-inliner                             |        772 |
| create-access-router-mongo-starter        |        339 |
| express-oidc-vault                        |      1,982 |
| express-request-attestation (five lanes)  |        467 |
| express-runtime                           |        341 |
| json-frame                                |        531 |
| mongoose-rxdb                             |        632 |
| pdf-reader (two lanes)                    |        237 |
| utils                                     |        120 |
| express-oidc-vault-memory-store           |        129 |
| express-oidc-vault-mongodb-store          |        147 |
| express-oidc-vault-redis-store            |        342 |
| http-errors                               |         72 |
| moo                                       |        153 |
| oidc-vault-dpop-client                    |         63 |
| apps/oidc-vault-dpop-example (two lanes)  |         65 |
| express-response-handler                  |        215 |
| express-json-router                       |         44 |
| access-router                             |      2,183 |
| message-service                           |        336 |
| access-router-client (two lanes)          |        924 |
| access-router-deco                        |        563 |
| access-router-runtime                     |        135 |
| access-router-react (three lanes)         |        554 |
| apps/react-vite                           |          3 |
| **Total**                                 | **11,349** |

The only nonexecuted workspace definitions are pre-existing unrelated entries:
one asset-inliner legacy image-replacement TODO and the oidc-vault-dpop-client
README-skeleton marker skipped because real documentation examples exist (its real
documentation compilation runs). No authorization, slow, packed or artifact case
was skipped or weakened. Existing Vite/dependency diagnostic warnings were non-fatal.

Cleanup: verified `_tmp-svaf` with `ls -ld . _tmp-svaf` / `git check-ignore` before use,
inspected remaining full-workspace fixtures, confirmed no test/Mongo process remained,
and removed those generated fixtures/caches while preserving the pre-existing Node
compile cache. The ignored sentinel artifact remains available for coordinator review.
All activation/implementation work is preserved; no commit/staging/reset/publishing,
version bump or changelog generation occurred. **F04 and the activated phase are
completed; no blocker remains.**

## Coordinator final review — 2026-10-12 16:12:46 PDT

- Reviewed the completed F01/F02/F03 contracts and handoffs, the independent F04
  acceptance audit, all four corrective findings and the final serial verification
  ledger. All eight task/finding statuses are completed, with no open dependency
  or required acceptance item. The original follow-up statuses and completion
  pointers agree; its earlier deferral and handoff statements remain historical.
- Inspected the final worktree inventory, mutation/subdocument public types,
  bounded input admission, finite helper argument validation, public subdocument
  dispatch and request-only data migration. Changes correspond to the activated
  capabilities, their consumer migration, necessary review fixes and documentation.
- Confirmed shipped README sections describe independent input authority, dedicated
  parent/child/visibility policies and named-helper breaking/default behavior.
  F04 supplies passing installed declarations/runtime/artifact evidence for these
  same contracts, including all eight packed/artifact cases.
- Coordinator checks: `git diff --check` passed; `git hash-object CHANGELOG.md`
  returned `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`; `git diff --exit-code --
CHANGELOG.md VERSION package.json pnpm-lock.yaml release-artifact.config.json
':(glob)packages/*/package.json'` passed with an empty diff. The task evidence
  contains no machine-local paths or active pending/in_progress/blocked statuses.
- The final coordinator edits are documentation-only; the independently verified
  runtime and tests are unchanged. All three requested implementations and final
  review are complete. No production release version/date was selected.

## Definition of done

- SVA-F01/F02/F03 implemented and individually verified in separate sessions.
- F02 includes write authority and independent post-write visibility.
- Retired overloads are absent from supported declarations and reject at runtime.
- Public transport remains request-only; hooks, scope, and isolation contracts pass.
- README/JSDoc/types/packed consumers describe the delivered APIs and migrations.
- SVA-F04 independent review and serial integration checks complete; original
  follow-up statuses point here; CHANGELOG unchanged.
