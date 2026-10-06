# Access Router Business Boundary Review

Created: 2026-09-19 14:57:43 local time (generated with `date +%Y%m%d-%H%M%S`).

## Objective and product requirements

Review and implement concrete remaining gaps in `packages/access-router`, following
`the task-as-you-go skill` and the workspace
`ai-friendly-ts-package` skill.

The product generates reusable ACL-aware Express CRUD and batch APIs over Mongoose,
plus read-only in-memory services. Business applications supply tenant/row filters,
field permissions, identifiers, validation and lifecycle hooks. Related-data includes,
subdocuments and counts support dashboards, comments, attachments and line items.
Correctness requires identical policy enforcement across direct and root routes,
preservation of protected state during partial edits, trustworthy aggregate results,
and bounded work when clients compose relationships.

Scope: five evidenced boundary defects, shared implementation seams/regressions,
installed-consumer documentation, and final independent verification. Improve
readability/reusability through focused helpers rather than a wholesale service rewrite.
Do not edit root `CHANGELOG.md`, hand-edit generated `dist/`, commit, or revert unrelated
work. Record compatibility/release notes in this document and shipped README instead.

## Coverage, deduplication and baseline

- Initial worktree clean (`git status --short`). Coordinator inspected package metadata,
  README, build entries, advanced exports, model adapter, ACL field selection,
  subdocument services, model mutation/count paths, include execution and scheduler.
- Read-only review agent inspected related service/ACL/data paths and corroborated
  findings with offline Mongoose, source-scheduler and controlled HTTP probes. HTTP
  probes used existing unrebuilt dist with persistence stubs; fresh regressions are
  required before completion. No build/full-suite green baseline is claimed.
- Reviewed earlier AR/ARF/ART/ARH and ACI records:
  `20260804-124249-access-router-review-remediation.md`,
  `20260805-192300-access-router-remediation-follow-up.md`,
  `20260820-164011-access-router-post-remediation-review.md`,
  `20260905-105547-access-router-health-follow-up.md`,
  `20260912-181841-access-router-correlated-includes.md`.
  Findings below are new cases or enforcement follow-ups, not duplicate completed work.
- Export conditions and bundled tsup entries appear aligned for root, advanced and
  processors. Existing packed/type/doc checks will verify installed consumers.
- Limitations: focused source/probe review, not exhaustive vulnerability/dependency
  scanning, a validator-version matrix, or a production throughput benchmark.

## Execution and verification

Each task receives a **fresh isolated sub-agent**, in the listed order, with no parallel
agents or package builds. Agents set their own task `in_progress` before edits and
append **Completion evidence** with changed files, exact commands/results and observed
acceptance outcomes before setting `completed`. Dependency failures block downstream
work. Newly discovered necessary work must be recorded explicitly here.

Priorities: P0 = demonstrated authorization bypass; P1 = sensitive row disclosure or
protected-data loss; P2 = bounded correctness, resource governance, documentation.
All paths below are relative to repository root unless explicitly marked otherwise.

Prerequisites: installed workspace dependencies, supported Node >=22/pnpm, and cached
or downloadable MongoDB memory-server binary for real persistence tests.

- **V1 (each implementation):** from repo root, run
  `pnpm --filter @web-ts-toolkit/access-router... build`, then
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`
  with actual affected/new test filenames; `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`.
  Add regression tests to the smallest meaningful service/HTTP/Mongo boundary and
  record before-fix reproduction when feasible. No timing-based performance gates.
- **V2 (integration):** serialized
  `pnpm --filter @web-ts-toolkit/access-router typecheck` and
  `pnpm --filter @web-ts-toolkit/access-router test`.
  The latter includes export, strict-consumer, documentation, and packed-consumer
  compatibility suites; inspect fresh emitted declarations and packed contents.
- **V3 (final repository integration):** serialized `pnpm build`, `pnpm test`,
  `pnpm lint`, `git diff --check`. Record exact unrelated failures/environmental
  blockers; never silently waive required checks. Root tests serialize packages.

## Tasks

### Task ABB-01: Protect authorization metadata from include output

Status: completed

Kind: defect

Priority: P0 — accessible target count can grant source-field permission.

Suggested agent: authorization-boundary implementer

Dependencies: none

Primary ownership: `packages/access-router/src/services/base.ts`, focused include
path helper if useful, cross-resource authorization regressions.

Finding / references: correlated count attaches at client-controlled path
(`base.ts`, `includeCorrelatedCount`, lines 930–940); model list trims after includes
(`service.ts`, `find`, lines 462–510); `core.ts:160–178`, `pickAllowedFields`, trusts
document permission metadata. `_permissions.canReadSecret` is a valid output path.
Probe: an allowed count of 1 exposed a source secret denied without the include.
Legacy attachment also writes arbitrary output paths. Related AR-06/ACI-03 did not
cover source permission metadata collisions.

Requirements:

1. Reject legacy and correlated include output paths equal to, below, or above the
   source model's configured `documentPermissionField` at the shared service boundary,
   before attachment/target query. Handle dotted custom fields and nested targets.
2. Include-generated data must never become authorization input. Preserve ordinary
   output collisions allowed by the include contract and positive authorized includes.
3. Return controlled BadRequest consistently through direct/root read/list entrypoints.

Acceptance criteria:

- Positive-count attack cannot expose a denied field; direct/root read and list cases
  cover legacy/correlated entries, default/custom metadata paths and ancestor overlap.
- Rejected entries produce zero target persistence calls; valid unrelated paths and
  legitimate document permissions still work. Nested target model config is honored.

Verification: V1 authorization/include suites; V2/V3 at ABB-07.

Implementation findings (ABB-01): the shared `processInclude` call was outside
`Service.find`/`findOne`'s controlled-error catches. This task also owns those two
call sites and the two `PublicService` read fallback guards: malformed includes
must return BadRequest even when source list access is denied. Nested descriptors
need preflight with the target model's config because legacy parents can swallow
target error results. Legacy output accepts bracket notation; collision checking
must use the same path semantics as attachment, not only dotted string prefixes.

Completion evidence (ABB-01):

- Changed files (exact):
  - `packages/access-router/src/services/base.ts`: shared preflight of legacy and
    correlated output paths, including nested target configuration and equivalent
    legacy bracket paths; unknown nested owning models return controlled BadRequest.
  - `packages/access-router/src/services/service.ts`: move include processing into
    the existing controlled-error boundary before client filter parsing/query work
    in both `find` and `findOne`.
  - `packages/access-router/src/services/public-service.ts`: preserve BadRequest
    through identifier/filter reads instead of retrying with list authorization.
  - `packages/access-router/test/include-permission-metadata.integration.test.ts`:
    38 real-Mongo regression/control tests, exercising direct and root list,
    read-by-filter and read-by-id, plus in-process service methods.
  - `packages/access-router/test/correlated-includes.resolver.test.ts`: register a
    real offline source model for the existing model-aware include processor tests.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: ABB-01
    status, implementation findings, verification evidence and documentation handoff.
- Commands/results (all from repository root, build/test/typecheck invocations
  serialized):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — passed on all three
    invocations, building five packages and emitting CJS/ESM/declarations. First
    invocation established fresh pre-fix output; third built the final source.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/include-permission-metadata.integration.test.ts -t "positive-count"`
    — run twice before the fix. First exposed a fixture issue (permission metadata
    was regenerated rather than using stored document permissions). After setting
    the fixture's supported skim/permission options and internal field projection,
    the second run demonstrated the actual defect: safe count returned 1 without
    `secret`, a legitimately permitted row returned `allowed-secret`, and output
    at `_permissions.canReadSecret` returned the denied `source-secret` (1 failed,
    37 skipped, as expected for before-fix reproduction).
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/include-permission-metadata.integration.test.ts test/cross-resource-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/correlated-includes.validation.test.ts test/read-list-fallback-authorization.integration.test.ts`
    — final result **6 files / 101 tests passed**. Earlier iterations surfaced
    fixture registration, route/import and direct-read response-shape mistakes
    (84 passed/17 failed; then 79 passed/5 failed/18 skipped with one failed setup).
    Those were corrected. Nested positive controls cover the supported legacy/
    legacy, legacy/correlated and correlated/correlated shapes; correlated parents
    already require correlated nested descriptors, as verified by the existing
    shape-validation contract. No unsupported nesting form is treated as evidence
    of metadata enforcement.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
    — passed, exit 0.
  - `pnpm exec eslint packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/test/include-permission-metadata.integration.test.ts packages/access-router/test/correlated-includes.resolver.test.ts`
    — passed, exit 0.
  - `git diff --check` — passed, exit 0.
- Acceptance outcomes: default `_permissions` and dotted `auth.policy.permissions`
  equal/descendant/ancestor collisions reject with controlled BadRequest for
  read/list/count includes in both modes. Legacy bracket aliases also reject.
  Direct HTTP returns problem+json 400; root entries carry statusCode 400 and
  `bad_request`; service calls return the same error code. This also holds for
  read-only sources whose list guard denies access. Every rejected case asserts
  zero target `find`/`findOne`/`countDocuments`/`aggregate` calls, including an
  earlier safe sibling and nested target/leaf calls. Positive controls preserve
  exact count 1, target reads/lists, ordinary `key` replacement, similarly named
  metadata siblings, and legitimate document-granted secret access. A target
  configured with `policy.permissions` rejects its own overlaps while allowing
  `_permissions.canReadSecret` as ordinary output without granting secret access.
- Fresh declaration inspection: `dist/parsers-fOot9K9F.d.ts` exposes only private
  helper declarations for this implementation; existing service method signatures
  and root/advanced/processors entrypoints remain intact. Generated files were
  produced by build only. Worktree audit contains only the six files listed above;
  the existing untracked task document was preserved, root CHANGELOG was not
  edited, and no commit was made.
- Follow-up: ABB-06 owns shipped documentation using the compatibility notes below;
  ABB-07 owns V2/V3 and independent verification. V2/V3 were not run in this isolated
  ABB-01 session. No additional implementation task or unresolved blocker arose.

### Task ABB-02: Preserve protected siblings during nested updates

Status: completed

Kind: defect

Priority: P1 — admitted partial updates erase fields the caller cannot write.

Suggested agent: mutation/data-integrity implementer

Dependencies: ABB-01

Primary ownership: `packages/access-router/src/services/service.ts`,
`src/services/model-subdocument-service.ts`, focused reusable update helper and tests.

Finding / references: `service.ts:809–835` picks allowed data then `Object.assign`s
the containing object; subdocument update/bulk repeat it at
`model-subdocument-service.ts:101–104,142–146`. Offline Mongoose shows updating only
`profile.public` replaces `profile` and deletes protected `profile.secret` for nested
objects and single-nested schemas. ARH-04 addressed validator output, not assignment.

Requirements:

1. Apply policy-admitted nested leaf changes without replacing protected containing
   objects; share a small helper across model and subdocument mutation paths.
2. Preserve intentional whole-field replacement when the whole field is authorized,
   array/scalar semantics, and documented trusted prepare/transform hook behavior.
   Explicitly record the chosen partial-update and hook contract.
3. Cover updateOne/updateById and the upsert update branch through their shared path,
   plus single/bulk subdocument updates. Do not implement generic recursive merging.

Acceptance criteria:

- Real Mongo persist/reload regressions preserve protected siblings in ordinary
  nested and single-nested schemas while applying authorized changes.
- Single/bulk subdocuments, explicit whole-object authorization, and trusted hooks
  have observable controls; field filters cannot be bypassed through dotted payloads.
- Existing hook context and validation behavior remains correct.

Verification: V1 mutation/subdocument/hook suites including real Mongo; V2/V3 at ABB-07.

Implementation decisions (ABB-02): use policy paths as assignment
boundaries, with Mongoose path setters for persistence/change tracking. Recurse only
through containers that are strict ancestors of admitted fields, never generically
merge objects. Whole-authorized objects/arrays remain replacement values. Prepare
output remains trusted (including additional fields), but plain objects at partial
policy ancestors apply supplied child paths; omission is not deletion. Transform
retains explicit document replacement/setter authority. Regressions distinguish
ordinary nested and single-nested schemas, including absent/null containers and
indexed array leaves. Detailed compatibility handoff is recorded below.

Completion evidence (ABB-02):

- Changed files (ABB-02 ownership only):
  - `packages/access-router/src/helpers/apply-update.ts`: shared internal assignment
    helper. Builds whole-field/partial-container boundaries with the same path
    grammar as `pick`; walks only strict policy ancestors. Uses Mongoose setters
    for documents/subdocuments and path assignment for plain adapter objects.
  - `packages/access-router/src/services/service.ts`: replace update assignment with
    the helper after prepare, covering `updateOne`, `updateById` and existing-row
    `upsert`; keep the existing validation/hook/context sequence.
  - `packages/access-router/src/services/model-subdocument-service.ts`: use the same
    helper after field selection in single and bulk subdocument updates.
  - `packages/access-router/test/nested-update-integrity.integration.test.ts`:
    **46 real-Mongo tests** with raw collection reloads, avoiding Mongoose defaults
    concealing missing persisted data.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: task
    status, decisions, evidence and explicit ABB-06 handoff.
- Commands/results (repository root; builds, focused runs and typechecks serialized):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **passed on all three
    invocations**, building five packages. First produced fresh before-fix output;
    third produced the final implementation's CJS/ESM/declarations.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/nested-update-integrity.integration.test.ts -t "preserves protected siblings"`
    — before fix: **6 failed / 24 skipped**, as intended. `updateOne`, `updateById`,
    existing-row upsert, direct single/bulk subdocument and root single-subdocument
    updates all persisted `{ public: 'next' }` instead of retaining `secret` and
    `settings`; each failed at the first raw nested-object assertion.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/nested-update-integrity.integration.test.ts test/model-subdocument-routes.integration.test.ts test/advanced-mutation-bodies.integration.test.ts test/model-router.integration.test.ts test/service.internal.test.ts`
    — **5 files / 105 tests passed** on the final run. This command ran three times:
    initial implementation **100 passed**, then **105 passed**, then **105 passed**
    after strengthening whole-object-array/indexed unauthorized-row controls.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
    — final **passed, exit 0** (last two invocations passed). Initial invocation
    exposed TS2345 at the bulk-subdocument call: `pick(tdata as object, ...)` returns
    `object`, narrower than the helper's initial record constraint. Corrected the
    helper to accept object/null/undefined, also preserving no-output prepare
    behavior, and rebuilt before the passing runs.
  - `pnpm exec eslint packages/access-router/src/helpers/apply-update.ts packages/access-router/src/services/service.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/test/nested-update-integrity.integration.test.ts`
    — **passed, exit 0**, both invocations including final code/tests.
  - `git diff --check` — **passed, exit 0**.
- Acceptance mapping:
  - **Requirement 1 / acceptance 1:** six entry paths persist authorized public
    leaves while preserving protected `secret` and omitted `settings` in ordinary
    nested AND single-nested schemas. Bulk tests verify both updated subdocuments;
    absent and null containers initialize correctly in both schema forms.
  - **Requirement 2 / acceptance 2:** whole-authorized parents remove omitted
    children; whole arrays of objects replace rather than merge by index. Authorized
    object leaves replace independently while their protected siblings survive.
    Scalar/null, empty arrays/objects, whole-field null, and `indexed.0.public`
    controls verify atomic values versus explicit indexed patches. Malicious
    sibling/index-1 changes and literal dotted/bracket payload keys never bypass
    selection; nested payload values win over ignored dotted aliases. Policy
    bracket/index aliases remain aligned with `pick`.
  - **Requirement 2 / acceptance 3:** validation sees admitted data and original
    context before prepare. In-place/returned prepare chain output remains trusted,
    can persist extra protected fields (nested or dotted) and server-only fields
    even with no client grants, and can omit, clear or unset values deliberately.
    Identity/empty-container/no-output hooks preserve omitted siblings. Transform
    sees assigned values and dirty paths, and explicit whole replacement persists.
    Hook order, original/final snapshots and final diff removals are asserted.
    Failed validation invokes no prepare/transform and leaves Mongo state intact;
    existing advanced validator-output and invalid-transform suites pass.
  - **Requirement 3:** one helper serves the model shared update path and both
    subdocument mutation paths; recursion stops at authorized fields, with no
    generic recursive merge or changes to create/delete/read visibility.
- Fresh declaration inspection: `dist/parsers-fOot9K9F.d.ts` retains the existing
  `updateOne`, `updateById`, `upsert`, `updateSub` and `bulkUpdateSub` signatures.
  `applyUpdate` is internal and absent from emitted public declarations; no new
  entrypoint/dependency/public option. Generated files were built only.
- Worktree audit: preserved all inherited ABB-01 files/hunks, including the shared
  service's include handling. Added/edited only the five ABB-02 files listed above;
  root CHANGELOG was not edited and no commit or subagent was used.
- Follow-ups: ABB-06 owns shipped documentation using the handoff below; ABB-07 owns
  V2/V3 and independent integration. Those checks were not run in this isolated
  ABB-02 session. No independent additional scope or unresolved blocker was found.

### Task ABB-03: Apply read visibility to subdocument mutation responses

Status: completed

Kind: defect

Priority: P1 — append access discloses restricted existing rows.

Suggested agent: subdocument authorization implementer

Dependencies: ABB-02

Primary ownership: `packages/access-router/src/services/model-subdocument-service.ts`
and direct/root subdocument regressions.

Finding / references: `createSub` at lines 170–190 returns the entire array after
write-authorized parent lookup and field projection only; `listSub`/`readSub` enforce
row filters at lines 35–47 and 61–75. Probe: GET omitted restricted row but POST `[]`
returned it. Single/bulk update responses share the field-only response pattern.
ART-02/AR-05/ARF-12 cover populate/input filters rather than response row visibility.

Requirements:

1. Centralize subdocument mutation response visibility: write authorization alone
   cannot expose parent/subdocument data hidden by the applicable read policy.
   For full-array create responses apply list/read visibility deliberately; define
   and document which policies govern each response shape.
2. Review single/bulk updates for the same root cause. Preserve authorized writes
   even when response rows are hidden; use a documented successful empty/null
   result rather than a post-commit forbidden error that encourages unsafe retries.
3. Keep field projection, counts, ordering and addFirst semantics consistent.

Acceptance criteria:

- Direct/root empty and nonempty create responses never include restricted existing
  rows; permitted writes persist and returned count reflects visible rows only.
- Read-denied parent, terminal false subfilter, and single/bulk update response cases
  are covered along with ordinary authorized controls.
- New successful no-visible-output contract is recorded for ABB-06 documentation.

Verification: V1 subdocument/authorization suites; V2/V3 at ABB-07.

Implementation findings / necessary scope (ABB-03): `genFilter` does not enforce
`operationAccess`; direct/root routes check only the requested write operation.
The shared mutation response helper must also check parent read and applicable
subdocument read/list guards. This requires passing request ACL context from the
three `Service` mutation wrappers in `src/services/service.ts` (additional owned
call sites, preserving ABB-01/02). Parent lookup projects only the subdocument
array, so evaluating parent policy against that object would incorrectly omit
tenant/other fields: use one post-save Mongo parent visibility query. Full-array
create responses require BOTH subdocument list and read guards/row filters, while
single/bulk updates require read only and return only their mutation targets.
All three retain historical read-field projection (list field projection governs
list endpoints, not mutation output). Resolve each applicable row policy once,
not per returned row; terminal false and denied guards hide output successfully.

Completion evidence (ABB-03):

- Changed files (ABB-03 ownership only):
  - `packages/access-router/src/services/model-subdocument-service.ts`: internal
    `visibleMutationRows` helper shared by create/single/bulk update after save.
    Checks parent/subdocument operation guards, parent read filter in Mongo, and
    applicable subdocument list/read filters before existing read-field projection.
    Parent visibility is pinned to the saved parent's actual `_id`, even with a
    custom request identifier or a trusted filter override. Hidden rows yield
    successful empty lists/count zero or a successful single `null`.
  - `packages/access-router/src/services/service.ts`: three mutation wrappers pass
    a request-bound operation-guard callback to internal implementations; public
    signatures are unchanged. ABB-01 include handling and ABB-02 assignment remain.
  - `packages/access-router/test/subdocument-mutation-visibility.integration.test.ts`:
    **69 real-Mongo tests**, using raw collection reloads to verify committed writes
    and protected input fields independently of returned visibility.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: status,
    necessary call-site scope, evidence and ABB-06 compatibility handoff.
- Commands/results (repository root; build, focused-suite and typecheck invocations
  serialized):
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/subdocument-mutation-visibility.integration.test.ts -t "create hides restricted existing rows"`
    — **4 failed / 62 skipped**, as intended, against inherited pre-ABB-03 `dist`
    (not a freshly rebuilt before-fix baseline). Direct/root empty create returned
    all five stored rows instead of two visible rows; nonempty create returned all
    seven instead of three. Raw reload assertions passed before disclosure assertions.
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **passed twice**, five
    packages each time; second emitted the final source's CJS/ESM/declarations.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/subdocument-mutation-visibility.integration.test.ts test/model-subdocument-routes.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/nested-update-integrity.integration.test.ts test/filter-denial.integration.test.ts test/request-complexity.integration.test.ts test/cross-resource-authorization.integration.test.ts`
    — final **7 files / 180 tests passed**. First run: **175 passed / 2 failed**;
    both failures were new fixture bulk-limit controls configured at model scope.
    Moved that fixture setting to supported runtime `requestComplexity`, added
    unrestricted-row and bounded-query controls, rebuilt and reran successfully.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
    — **passed, exit 0**.
  - `pnpm exec eslint packages/access-router/src/services/model-subdocument-service.ts packages/access-router/src/services/service.ts packages/access-router/test/subdocument-mutation-visibility.integration.test.ts`
    — **passed, exit 0**.
  - `git diff --check` — **passed, exit 0**.
- Acceptance mapping:
  - Direct/root empty and nonempty create omit list-hidden/read-hidden existing and
    new rows; array and singleton creates persist. Parent row mismatch, parent
    terminal false, parent/read guards, sub-read base/override false and no-match
    filters all preserve successful creates and updates with hidden output.
    Empty create also stays successful under those denials and list denials.
  - List guard/false/no-match filters hide create output but do not hide targeted
    read-authorized single/bulk update output. Bulk returns only readable update
    targets in stored array order, independently of request order; write-denied
    rows remain unchanged. Single updates that change their own read eligibility
    return `null`, then become visible after an authorized restoring write.
  - Parent read policy depending on the updated array is checked against committed
    Mongo state. Ordinary allowed rows retain read fields plus `_id`, including
    read-only-versus-list field differences, with denied secret/list-only fields
    absent. Existing update selection protects stored secrets.
  - Both `addFirst` values preserve filtered response and persisted ordering with
    custom parent `idField`; counts reflect visible rows only. A 50-item create
    persists 55 rows and returns count 52 with exactly two `collection.findOne`
    calls (write lookup plus one parent read check), and exactly one call per
    parent-read/sub-read/sub-list row policy. No per-row policy/query fan-out.
  - Write operation denials, terminal false update filters and maxBulkItems still
    reject before mutation. Existing subdocument CRUD/populate, ABB-02 integrity,
    filter-denial, complexity and cross-resource authorization suites pass.
- Fresh declaration inspection: `dist/parsers-fOot9K9F.d.ts:96–98` retains existing
  `updateSub`, `bulkUpdateSub`, and `createSub` signatures. Neither the helper nor
  its guard callback type appears in public declarations; no new entrypoint,
  dependency or public option. All generated output was produced by builds.
- Worktree audit: inherited ABB-01/02 changes preserved, including both shared
  service files; only the four ABB-03 files above added/edited in this session.
  No root CHANGELOG edit, manual dist edit, commit or subagent.
- Follow-ups: ABB-06 owns shipped documentation using the handoff below; ABB-07 owns
  V2/V3 and independent verification. Those checks were not run in this isolated
  ABB-03 session. No unresolved blocker or independent implementation scope arose.

### Task ABB-04: Enforce request-wide persistence concurrency for nested includes

Status: completed

Kind: defect

Priority: P2 — relationship fan-out exceeds configured work concurrency.

Suggested agent: request scheduling implementer

Dependencies: ABB-03

Primary ownership: `packages/access-router/src/helpers/concurrency.ts`, shared request
scheduling/model persistence seams, `src/services/base.ts`, focused concurrency tests.

Finding / references: `RequestConcurrencyScheduler.map` (`concurrency.ts:23–39`)
creates an independent worker pool each time; nested service calls from correlated
execution (`base.ts:816–865`) reuse the object but not shared admission. A source
probe with limit 3 and nested three-item maps reached 9 active operations. This is
an ACI-03/ART-08 enforcement follow-up, distinct from default-limit tuning.

Requirements:

1. Enforce a shared request-owned ceiling around actual persistence work across nested
   include levels and root entries, with runtime ownership respected. Do not hold a
   permit while waiting for recursive descendants or blindly gate nested map callbacks.
2. Preserve output order, errors, total correlated-query/depth budgets and existing
   bounded bulk/subquery behavior. Release permits after rejection.
3. Keep the scheduler small and independently testable; clarify map/orchestration
   versus persistence admission semantics rather than implying every map is global.

Acceptance criteria:

- Deterministic instrumentation of nested parent/child/grandchild persistence and
  root batching demonstrates peak active calls <= maxBulkConcurrency.
- Limit 1 completes without deadlock; rejection releases slots; ordering and multiple
  concurrent requests/runtime isolation are verified.
- Record before/after peak counts, not an unmeasured throughput claim.

Verification: V1 concurrency/correlated/bulk/runtime suites; V2/V3 at ABB-07.

Implementation findings / necessary scope (ABB-04): inspected `ModelAdapter`, its
service factory override seam, all service persistence calls, runtime AsyncLocalStorage,
request-keyed correlated state and root worker groups. Use an internal request/runtime
state registry and adapter admission wrapper, keeping recursive map/run orchestration
separate from permits. The service captures its runtime when constructed; a later
ambient runtime must not choose its persistence pool. Move the correlated total into
the same runtime-owned state without changing depth/total accounting. Additional owned
call sites are document save/delete and post-write populate in `service.ts` and the
four subdocument saves (internal callback only), since root writes must share admission
with reads. Admission units are awaited adapter/document persistence operations, not
whole service callbacks, hooks, or MongoDB driver commands inside one operation.
Bulk create is admitted per item (singleton adapter arrays), preserving input/output
order and submitting every item even if one rejects, to avoid hidden Mongoose save
fan-out without switching to ordered-create stop-on-error semantics. Public signatures
and adapter override seam stay intact; ABB-06 owns shipped prose and ABB-07 full integration.

Completion evidence (ABB-04):

- Changed files (ABB-04 ownership only):
  - `packages/access-router/src/helpers/concurrency.ts`: separate FIFO `work`
    admission with permit transfer/release in `finally`; existing map/run keep
    per-invocation orchestration semantics and never acquire work permits.
  - `packages/access-router/src/helpers/request-work.ts`: internal weak registry
    keyed by request AND runtime, sharing permits and correlated totals.
  - `packages/access-router/src/model.ts`: internal adapter admission wrapper that
    awaits actual lazy-query settlement, preserves adapter receivers/model/document
    identities, and admits array creates per item using singleton adapter arrays.
    Existing Mongoose adapter query-building/casting methods are unchanged.
  - `packages/access-router/src/services/base.ts`: capture owning runtime when the
    service is constructed; use the shared registry for correlated execution state.
  - `packages/access-router/src/services/service.ts`: wrap the existing overridable
    adapter once at construction; admit document save/delete and post-write populate
    separately from recursive service orchestration, ACL and lifecycle hooks.
  - `packages/access-router/src/services/model-subdocument-service.ts`: internal
    persistence callback around four parent saves; ABB-02/03 logic retained.
  - `packages/access-router/test/concurrency.test.ts`: five independently controlled
    scheduler/adapter/service tests, including lazy thenables, synchronous throws,
    FIFO/rejection/order, bulk attempts, and request/runtime ownership.
  - `packages/access-router/test/request-persistence-concurrency.test.ts`: fifteen
    HTTP/Mongoose execution tests with instrumented collection-boundary doubles.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: status,
    explicit necessary scope, evidence and ABB-06 public-contract handoff.
- Before/after instrumentation: peak **active collection operations**, counted at
  cursor `toArray` / `findOne` / `countDocuments` / write commands, NOT at service
  or scheduler-map callbacks. Deterministic event-loop completion barriers expose
  all runnable fan-out without elapsed-time assertions. These are real HTTP,
  service and Mongoose query execution paths with controlled persistence doubles,
  not MongoDB wire-load/throughput measurements. Real-Mongo correctness is covered
  by the focused integration suites below.

  | Case                                                   | Configured limit | Before peak | After peak |
  | ------------------------------------------------------ | ---------------: | ----------: | ---------: |
  | Three parents × three children, nested correlated read |                3 |           9 |          3 |
  | Same nested correlated list                            |                3 |           9 |          3 |
  | Same nested correlated count                           |                3 |           9 |          3 |
  | Three root entries with nested identifier reads        |                1 |           3 |          1 |
  | Same root batch                                        |                3 |           9 |          3 |

- Commands/results (repository root; builds, test invocations and typechecks serialized):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **passed three times**,
    five packages each time. First built fresh pre-fix output; third emitted the
    final implementation's CJS/ESM/declarations. No hand-edited generated files.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/request-persistence-concurrency.test.ts`
    — before fix **5 failed**, all exclusively on the peak assertions in the table;
    ordering, associations, counts and completion assertions passed first. Later
    expanded standalone run **15 passed** (including third-level/rejection/writes).
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/request-persistence-concurrency.test.ts test/service.internal.test.ts`
    — first implementation run **17 passed / 1 failed**: new unit test expected
    the budget detail as the thrown message; controlled `ClientRequestError` uses
    message `bad_request`. Corrected that assertion; no production workaround.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/request-persistence-concurrency.test.ts test/service.internal.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/correlated-includes.validation.test.ts test/request-complexity.integration.test.ts test/runtime-isolation.integration.test.ts test/root-router.integration.test.ts test/include-permission-metadata.integration.test.ts test/nested-update-integrity.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/model-subdocument-routes.integration.test.ts`
    — intermediate **13 files / 281 tests passed**.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/request-persistence-concurrency.test.ts test/service.internal.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/correlated-includes.validation.test.ts test/request-complexity.integration.test.ts test/runtime-isolation.integration.test.ts test/root-router.integration.test.ts test/include-permission-metadata.integration.test.ts test/nested-update-integrity.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/model-subdocument-routes.integration.test.ts test/model-router.integration.test.ts`
    — final **14 files / 303 tests passed** against the final build.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
    — **passed twice**, including after the final build/tests.
  - `pnpm exec eslint packages/access-router/src/helpers/concurrency.ts packages/access-router/src/helpers/request-work.ts packages/access-router/src/model.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/test/concurrency.test.ts packages/access-router/test/request-persistence-concurrency.test.ts`
    — **passed twice**, including final source/tests.
  - `git diff --check` — **passed**.
- Acceptance outcomes:
  - All table cases enforce the shared ceiling. An additional list → read → count
    chain completes at limits 1 and 3 with exact nine leaf counts, showing permits
    are released before recursive descendants. Root create/update/delete plus
    nested reads share peak 1; bulk create has six observed `insertOne` calls with
    stable per-entry/per-item output order.
  - A rejected nested `findOne` permits queued siblings and a successful count on
    the SAME request. Unit tests verify original error identity, synchronous throw
    release, FIFO transfer and deliberately reversed completion versus result order.
    A lazy adapter thenable holds its permit until settlement, not construction.
  - Two simultaneously held HTTP requests each configured at 1 reach combined
    peak 2, for both one runtime and separate runtimes. Source-service instrumentation
    on the SAME request gives separate ceilings 1 and 2 for two runtimes (same model
    name), plus one independent slot for another request: four held calls start,
    and queued work starts only when its own runtime/request releases a permit.
    Invoking runtime-A services while runtime B is ambient still uses A's pool.
  - Root/nested correlated total 5 admits exactly five target operations and returns
    controlled budget errors. Depth 1 rejects a two-level template with zero target
    calls. Totals remain cumulative across sibling services but isolated across
    runtimes/requests; freeing a permit does not refund a total-query slot.
    Existing bulk validation/index ordering, subquery parsing bounds, include ACL,
    grouped-count execution, root order groups and runtime suites remain green.
  - All inherited ABB-01/02/03 regressions pass, including real-Mongo persist/reload
    integrity and subdocument response visibility. Their implementation hunks remain.
- Fresh declaration inspection: `dist/parsers-DUfy9KEp.d.ts` retains service CRUD,
  count and subdocument signatures, with only internal/protected scheduler/runtime
  details and private `persist` added. The adapter wrapper/registry are not public
  exports. `package.json` exports and root/advanced/processors entrypoints are unchanged;
  no new required import, dependency or public configuration option.
- Follow-ups: ABB-06 owns shipped documentation using the contract below; ABB-07
  owns V2/V3 and independent integration. Those checks were not run in this isolated
  ABB-04 session. No unresolved blocker. Worktree audit preserves inherited work;
  no root CHANGELOG edit, manual dist edit, commit, subagent or other task implementation.

### Task ABB-05: Match Mongoose query casting in grouped include counts

Status: completed

Kind: defect

Priority: P2 — dashboards silently report incorrect authorized relationship counts.

Suggested agent: Mongoose count semantics implementer

Dependencies: ABB-04

Primary ownership: `packages/access-router/src/services/service.ts`
(`countByFieldValues`), `src/model.ts` adapter seam if needed, real Mongo count tests.

Finding / references: `countByFieldValues` (`service.ts:1114–1137`) places raw
authorized filters and foreign operands in aggregation match stages; `model.ts:108–109`
does not cast pipelines. Ordinary query casting converts string tenant IDs to ObjectId
and ObjectId join operands to String, while aggregation retains the wrong types.
ART-06 tests with mocks/string keys do not establish casting parity.

Requirements:

1. Cast authorized match and foreign-key operands with owning model schema semantics
   consistently across both match stages; preserve ACL and controlled cast failures.
2. Preserve array foreign keys, deduplication of document IDs, association back to
   parent keys, exact count beyond pagination bounds, and the model adapter test seam.
3. Avoid N-per-parent count queries as a shortcut; keep grouped execution.

Acceptance criteria:

- Real Mongo include-count results agree with authorized countDocuments for ObjectId
  to String joins, string to ObjectId joins, tenant filters, array/duplicate keys and
  counts exceeding listHardLimit; denied and malformed operands are controlled.
- Grouped query count remains bounded independently of parent count.

Verification: V1 real Mongo/count/cross-resource suites; V2/V3 at ABB-07.

Implementation findings / necessary scope (ABB-05): the legacy count attachment in
`src/services/base.ts` silently ignores error results. Add a narrowly scoped BadRequest
propagation there so schema-cast failures returned by `countByFieldValues` reach the
existing direct/root/service controlled-error boundary. Preserve terminal ACL denial
behavior. Casting must also retain original-to-cast key aliases (for example uppercase
ObjectId strings); stringifying only aggregate result keys loses those associations.
Use a synchronous, optional adapter query-casting capability, forwarded without a
persistence permit; the actual grouped aggregate continues through ABB-04 admission.
Adapters without that capability retain their existing identity-casting test seam.

Completion evidence (ABB-05):

- Changed files (ABB-05 ownership only):
  - `packages/access-router/src/model.ts`: optional synchronous adapter `castFilter`
    capability; default adapter casts a copy using the owning Mongoose model's
    `countDocuments` Query.cast. Admission wrapper forwards it with its receiver
    intact and without acquiring a persistence permit. Aggregate admission remains.
  - `packages/access-router/src/services/service.ts`: cast the complete authorized
    match and independently cast foreign `$in` operands against the original schema
    path before projection. Reuse those operands after unwind. Map normalized group
    keys back to original parent aliases, retaining document-ID sets for exact union
    counts. Return controlled BadRequest from the synchronous cast boundary only.
  - `packages/access-router/src/services/base.ts`: propagate legacy grouped-count
    BadRequest through the existing include error boundary (necessary scope above).
  - `packages/access-router/test/grouped-count-casting.integration.test.ts`:
    **41 real-Mongo tests**, comparing authorized ordinary countDocuments with direct
    and root read/list includes, plus service-method denial/error controls.
  - `packages/access-router/test/service.internal.test.ts`: two additional adapter
    tests covering copy/receiver/permit behavior, query setters, numeric aliases,
    trusted filter replacement, independent operand casting and persistence errors.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: status,
    necessary scope, evidence and ABB-06 handoff.
- Commands/results (repository root; build, test and typecheck invocations serialized):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **passed three times**,
    building five packages each time. First produced fresh pre-fix output; third
    emitted the final CJS/ESM/declarations. Generated output was built only.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-casting.integration.test.ts -t "equals authorized countDocuments"`
    — run twice before implementation. First **16 failed / 23 skipped** due to a
    fixture's mistyped 23-character hex key; corrected to four repeated hex groups.
    Second **16 failed / 23 skipped**, all on the intended count assertion: actual
    **0**, authorized countDocuments **9** (scalar) or **10** (duplicate arrays).
    Direct/root read/list, both join directions, each had one aggregate and zero
    target query executions before the reference count was run.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-casting.integration.test.ts test/service.internal.test.ts test/cross-resource-authorization.integration.test.ts`
    — first implementation run **3 files / 62 tests passed**.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-casting.integration.test.ts test/service.internal.test.ts test/cross-resource-authorization.integration.test.ts test/arc21-projection-identity-and-count-argument.contract.test.ts test/correlated-includes.execution.test.ts test/concurrency.test.ts test/request-persistence-concurrency.test.ts test/include-permission-metadata.integration.test.ts`
    — final **8 files / 144 tests passed**, including the expanded new tests and
    inherited count, cross-resource, metadata-boundary and persistence-permit suites.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
    — **passed, exit 0**.
  - `pnpm exec eslint packages/access-router/src/model.ts packages/access-router/src/services/service.ts packages/access-router/src/services/base.ts packages/access-router/test/service.internal.test.ts packages/access-router/test/grouped-count-casting.integration.test.ts`
    — **passed, exit 0**.
  - `git diff --check` — **passed, exit 0**.
- Acceptance outcomes:
  - ObjectId parent → String foreign and String parent → ObjectId foreign counts
    agree with authorized countDocuments on scalar and array foreign paths. Nested
    ACL `$and` uses string tenant IDs; include filter uses a string region ID; both
    cast to ObjectId. Wrong-tenant, hidden and wrong-region records remain excluded.
    Count guard is enabled while target read/list guards are denied, demonstrating
    explicit count access. Client include overrides cannot remove the row policy.
  - Counts 9/10 exceed target listHardLimit 2 and ignore include limit 1/skip 100.
    Repeated source/target array keys and documents matching multiple parent keys
    count once. Upper/lower ObjectId aliases and String query setters preserve
    association to original parent keys. No-match and empty-array cases return zero.
  - **One aggregate, zero target find/findOne/countDocuments executions** for 1, 24
    and 40 parents (asserted before running the reference queries). Grouped execution
    and ABB-04's admitted aggregate are retained; no N-per-parent fallback.
  - Denied operation guards make zero target calls. Terminal false count policy
    returns Forbidden at the grouped service and preserves legacy omitted output,
    skipping even malformed parent casting. Invalid parent ObjectId, operator-shaped
    parent object, tenant filter and include filter produce controlled direct HTTP
    400/root entry BadRequest with zero target persistence. The grouped service
    itself returns BadRequest for a mixed valid/invalid operand list.
  - Adapter casting returns synchronously while the sole persistence permit is held,
    does not execute query middleware, and leaves input filters/operand arrays intact.
    A trusted replacement filter that drops the join still gets independently cast
    post-unwind operands. Schema-cast errors are controlled; an aggregate rejection
    retains its original error identity. Existing identity-casting adapter doubles pass.
- Fresh declarations: `dist/index.d.ts:91–92` contains the additive `castFilter`
  method/JSDoc on the model exposed through `ModelRouter.model`; no new import is
  required. `dist/parsers-DUfy9KEp.d.ts:76` retains the existing countByFieldValues
  signature. Package exports/dependencies and root/advanced/processors entrypoints
  are unchanged. Query-casting versus middleware scope is explicit in the handoff.
- Worktree audit: all inherited ABB-01..04 implementation hunks and task evidence
  preserved; only the six ABB-05 files above edited/added. No root CHANGELOG change,
  manual dist edit, commit, subagent or other task implementation.
- Follow-ups: ABB-06 owns shipped documentation using the contract below; ABB-07
  owns V2/V3 and independent integration. V2/V3 were not run in this isolated ABB-05
  session. No unresolved blocker or independent extra implementation scope found.

### Task ABB-06: Document business contracts for installed consumers

Status: completed

Kind: improvement

Priority: P2 — callers need precise partial-update, visibility and resource contracts.

Suggested agent: TypeScript package documentation specialist

Dependencies: ABB-01, ABB-02, ABB-03, ABB-04, ABB-05

Primary ownership: package README, llms.txt, high-value public JSDoc, relevant website
docs only for drift, and this file's compatibility notes. Root CHANGELOG is excluded.

Finding / references: README advertises ACL, hooks, partial mutation validation and
correlated request concurrency, but does not describe the five corrected boundary
contracts. `advanced.ts` currently only re-exports interfaces/symbols/enums/validation,
so verify README's low-level runtime-context description against actual exports.

Requirements:

1. Explain safe include output paths, nested partial updates versus whole replacement,
   trusted hooks, write-only subdocument response shapes, casting and concurrency.
2. Add a concise business-oriented example where helpful using public imports only;
   keep README self-sufficient and canonical import/subpath guidance accurate.
3. Inspect fresh emitted declarations for any changed public API, preserve existing
   entrypoints, and put compatibility/release notes here instead of CHANGELOG.

Acceptance criteria:

- README/JSDoc/llms and affected website docs agree with tested behavior and exports.
- Documentation examples, export-contract and strict-consumer checks pass; no new
  required entrypoint or dependency is introduced merely to satisfy stale prose.

Verification: V1 build plus documentation/export/strict-consumer tests and declaration
inspection; full packed suite in ABB-07.

Completion evidence (ABB-06):

- Changed files (exact, ABB-06 ownership only):
  - `packages/access-router/README.md`: self-contained include metadata safety,
    grouped count/casting/error semantics, authorized nested updates and trusted hook
    compatibility, successful hidden subdocument response table, request/runtime
    persistence admission and its limitations, corrected advanced exports, and one
    public-import customer-profile policy/payload example.
  - `packages/access-router/llms.txt`: compact matching business-contract guidance,
    corrected advanced/runtime import guidance and README index.
  - `packages/access-router/src/interfaces/query-types.ts`: include/count and output
    path JSDoc on shipped include types.
  - `packages/access-router/src/interfaces/root.ts`: option JSDoc for permission
    metadata, policy-path assignments, trusted prepare/transform and root orchestration.
  - `packages/access-router/src/request-complexity.ts`: persistence admission versus
    orchestration, cumulative query budget and depth JSDoc.
  - `packages/access-router/src/services/service.ts`: public service JSDoc on shared
    update/count and all three subdocument mutation methods; only comments added by
    ABB-06, preserving inherited ABB-01..05 implementation hunks.
  - `website/docs/packages/access-router/advanced.mdx`: actual advanced export surface.
  - `website/docs/packages/access-router/configuration.mdx`: metadata restriction,
    request/runtime ownership and adapter-operation admission limitations.
  - `website/docs/packages/access-router/hooks.mdx`: trusted hook/omission contract
    and explicit replacement migration.
  - `website/docs/packages/access-router/services.mdx`: safe includes, exact grouped
    counts, partial updates and successful hidden response shapes.
  - `website/docs/packages/access-router/validation.mdx`: service-level metadata
    preflight/cast failures and removal of stale legacy-behavior claim.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: ABB-06
    status, completion evidence and compatibility delivery notes below.
- Commands/results (repository root except the stated pack working directory;
  build, test invocations and typecheck serialized):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, five packages,
    emitting fresh CJS/ESM and `.d.ts`/`.d.mts` declarations.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/export-contract.test.ts test/strict-consumer-types.test.ts`
    — **56 passed / 1 failed**, with export-contract and strict-consumer suites fully
    passing (**2 files / 40 tests**). The new README example alone failed TS2353:
    `ModelRouterOptions<Customer>` restricts permission keys to the model's top-level
    fields. Corrected the example to the supported non-generic `ModelRouterOptions`
    for dotted policy paths; no production types or tests changed to accommodate it.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts`
    — final **1 file / 17 tests passed**, including the corrected example's strict
    compile and existing complete-runtime workflows against staged published output.
    Thus all three required suites pass (**57 unique tests** across their final runs).
    Both Vitest invocations emitted the existing Vite native-config future-compatibility
    warning; neither final check failed on it.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
    — **passed**, exit 0.
  - `pnpm exec eslint packages/access-router/src/interfaces/query-types.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/request-complexity.ts packages/access-router/src/services/service.ts`
    — **passed**, exit 0.
  - `npm pack --dry-run --json` (working directory `packages/access-router`) —
    **passed**, 17 publication entries: README, llms, package metadata and all three
    JS/ESM/declaration entrypoints plus their shared declaration chunk. No source-only
    import or new dependency is required; this was a dry-run, not the full packed suite.
  - `git diff --check` — **passed**, exit 0.
- Fresh declaration inspection: both `dist/parsers-CmJdFTud.d.ts` and `.d.mts` retain
  the new hover contracts on updateOne (58–64), countByFieldValues (84–90), subdocument
  writes (112–133), concurrency/budgets (486–498), include types (1099–1175), and
  configuration/hooks (1634–1712). Root `dist/index.d.ts`/`.d.mts` still expose
  ModelRouter.model.castFilter (91–92) and root runtime factories/instances;
  `dist/advanced.d.ts`/`.d.mts` export interfaces/symbols/enums/validation, with no
  runtime-context API. Root/advanced/processors exports and public signatures remain
  intact. Generated output was produced only by the build.
- Acceptance: all five implemented contracts now agree across README, llms, relevant
  public JSDoc and website prose. The measured 9 → 3 nested peak is explicitly scoped
  to controlled collection instrumentation; no driver-command/middleware/populate
  ceiling, throughput improvement or concurrency-control guarantee is claimed.
  New prose is grounded in ABB-01..05 implementation and recorded regression evidence;
  this documentation session does not claim a new real-Mongo regression run.
- Compatibility/worktree audit: inherited ABB-01..05 source/tests/evidence preserved.
  ABB-06 changes only documentation/comments and this task record. No root CHANGELOG,
  manual dist edit, commit, subagent, new public entrypoint, option or dependency.
- Follow-up: ABB-07 remains pending and owns independent V2/V3, full packed-consumer
  verification and final acceptance review. Those checks and a website build were not
  run in this bounded documentation session. No unresolved ABB-06 blocker. The existing
  generic permission-key typing limitation is accommodated by the documented public
  non-generic option type, not expanded into another implementation task.

### Task ABB-07: Independently verify all tasks and final integration

Status: completed

Kind: improvement

Priority: P1 — independent cross-path verification of security and mutation fixes.

Suggested agent: independent final reviewer (fresh session, not a main implementer)

Dependencies: ABB-01, ABB-02, ABB-03, ABB-04, ABB-05, ABB-06

Primary ownership: this task file and verification evidence; report/fix necessary
integration defects explicitly, adding scoped follow-ups for independent discoveries.

Requirements:

1. Review every acceptance criterion against actual code and meaningful regression
   evidence, not test counts alone. Inspect direct/root/nested security boundaries,
   mutation integrity, scheduling ownership and installed-consumer contracts.
2. Run V2 and V3 serially; confirm fresh packed consumer suite, declarations and
   publication contents. Failures require diagnosis, not silent waivers.
3. Verify all tasks have completed status and Completion evidence, no hidden blockers,
   no root CHANGELOG edits, no manual generated edits, and only intended worktree diff.

Acceptance criteria:

- All preceding requirements are delivered with passing required checks, or this task
  remains blocked with exact cause. Every newly necessary fix has tracked evidence.
- Final review records verdict for ABB-01 through ABB-06 and material limitations.

Verification: V2, V3 and independent acceptance/diff audit.

Review started (ABB-07): fresh independent reviewer session; read the full task
record, root AGENTS.md, the requested task-as-you-go skill and the package-surface
skill. ABB-01..06 dependencies are completed with evidence. Initial worktree contains
only the inherited package source/tests/docs, website docs and this task record.
V2/V3 will run serially; no completion is claimed before their actual results.

Necessary integration scope (ABB-07): `test/packed-consumer-compatibility.test.ts`
reuses `dist/web-ts-toolkit-0.99.0-test` solely when the directory exists. The
inherited artifact README SHA-256 is `4726392397588a185e94db281909947c5c9d2bd9b59566cc5d76710e49a9f23e`,
while the current README is `ee47fe5522d26af672bb1698b51ae67fd8eb3ff22cdd29107f53f0f11975eb7c`.
This pre-existing test-fixture defect can silently validate stale implementations,
blocking the explicit fresh-artifact acceptance. Own a narrow test-only correction:
assemble the artifact once per suite invocation regardless of an existing directory,
and compare packed/artifact JavaScript, declarations and shipped docs with current
built/package bytes. Use the normal artifact builder, never manual dist edits.

First V2 package test: **55 files passed / 1 failed; 690 passed / 1 failed**.
The new freshness assertion and all business regressions passed. The current-peer
tarball consumer completed its synchronous install/runtime/three-TypeScript-check
sequence in 69,593ms without a subprocess error, but exceeded its inherited 60s
Vitest test deadline. Extend only the two installed-consumer matrix deadlines to
180s (bounded integration allowance, no assertion removed); rerun the exact V2
package command before V3. This is a test-budget integration defect, not evidence
of a business regression or a waived failure.

Second V2 package test: **55 files passed / 1 failed; 688 passed / 3 skipped**.
All seven packed checks passed with the corrected budget. The unrelated existing
`arf12-root-distinct.authorization.integration.test.ts` failed MongoMemoryServer
startup (`Port "39014" already in use`), before its three tests ran. Inspected
`test/setup.ts` (automatic ephemeral port selection) and `vitest.config.ts` (four
workers); `ss -ltnp 'sport = :39014'` showed no remaining listener. Treat this as a
transient environment port race and rerun the exact package command; no unrelated
production/setup change or waived test. A clean full invocation is still required.

V3 integration scope extension (ABB-07): first `pnpm test` stopped at the inherited
Redis-store test `keeps bounded revocation command behavior for a 10,000-session
index` (`packages/express-oidc-vault-redis-store/test/index.test.ts:1199–1224`).
Result there: **7 files passed / 1 failed; 89 passed / 1 failed**; the sole failure
was its explicit 20s whole-test deadline after 21,772ms. Inspected the test and
the original `20260813-185747-express-oidc-vault-redis-store-review-remediation.md`
evidence: fixture construction precedes the timed revocation; all command-count,
batch-size and revocation-under-10s assertions completed without assertion errors.
The file was unchanged in the inherited worktree. Own only a 60s whole-test setup
allowance with explanatory comment; retain the exact 10s operation assertion and
all 10,000-item/command bounds. This unrelated pre-existing fixture-budget issue
is explicitly included solely to unblock required V3. No Redis production changes
or broader performance task are justified by this timeout. Rerun full `pnpm test`.

Acceptance audit finding (ABB-07 / ABB-03 integration): bulk subdocument updates
filter response candidates only by the resolved update policy. A trusted
`overrideFilter.subs.<sub>.update` replacing the request-ID predicate with `{}`
admits every stored row into `result`; the assignment loop skips rows absent from
the payload, but `visibleMutationRows` still returns those readable non-targets.
This contradicts ABB-03's targeted-result contract and its handoff statement that
trusted overrides cannot expand update response candidates beyond actual targets.
Own the small correction in `model-subdocument-service.ts` plus direct/root real-Mongo
regressions in `subdocument-mutation-visibility.integration.test.ts`: intersect bulk
candidates with supplied IDs before assignment/response policy. Preserve trusted
row-filter replacement and stored ordering. Verify before/after, then refresh V2/V3.

Verification progress after the acceptance fix: both direct/root reproductions
failed before correction (2 failed / 69 skipped; two readable non-target rows
returned although raw reload confirmed only the requested row changed). Fresh V2
typecheck and package tests now pass (**56 files / 693 tests**, including all 71
subdocument visibility cases and seven packed checks). Second `pnpm build` passed.
The earlier full-workspace rerun had passed, but refreshing it after this source
change exposed another unrelated inherited fixture timeout: ERT-B07 real OS signal
test in `packages/express-runtime/test/watch-supervisor.test.ts:765–909`, **340
passed / 1 failed**, exceeding Vitest's default 5s at 5,038ms. Its own sequential
polling deadlines allow 10s readiness + 10s signal receipt + 15s exit + 5s cleanup.
Inspected `vitest.config.mts` and original ERT-B07 record; explicitly extend this
single test's outer allowance to 60s so its existing readiness/shutdown/exit/leak
assertions govern failure. No runtime production change. Run the focused test to
diagnose any remaining substantive failure, then rerun the exact workspace command.

ERT-B07 diagnosis update: focused run passed (1 passed / 15 skipped), but full
workspace rerun now reaches a real assertion: missing sleeper SIGTERM receipt at
line 858 after 12,132ms. The fixture's PID-file + `kill(pid, 0)` barrier proves
process existence, not that the grandchild has installed its SIGTERM handler.
Under workspace load the first signal can arrive before that handler; default
termination produces no receipt. This is a pre-existing test-readiness race (the
same ERT-B07 test passed in the earlier full run), not an access-router regression.
Extend the already recorded single-test scope with a sleeper-written readiness
marker immediately after handler registration, and wait for both PID and marker
before signaling. Keep every shutdown/exit/leak assertion and bounded poll. No
independent production task is needed for this local fixture correction.

Next V3 rerun verified ERT-B07's correction (**11 files / 341 Express-runtime
tests passed**) but stopped at an unrelated MongoDB-store packed runtime smoke:
`packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts:228–252`,
**43 passed / 1 failed**, 5,348ms versus inherited default 5s. Inspected its
synchronous install + ESM/CJS subprocess sequence: no subprocess/assertion failure;
the adjacent strict packed-consumer test already has a 30s allowance. Explicitly
own a matching 30s allowance for this one runtime-smoke test only. All package
contents/export/runtime assertions remain. This is another inherited integration
budget issue, not a MongoDB-store production change. Required full rerun continues.

Next V3 rerun passed the corrected Express-runtime/MongoDB-store/Redis-store suites
(341/44/90 tests), then stopped at `packages/express-json-router/test/packed-consumer-compatibility.test.ts:622–678`:
the first packing/manifest/allowlist test took 6,209ms versus the inherited default
5s (**43 passed / 1 failed** in that package). Its synchronous pack/unpack sequence
completed with no assertion/subprocess error. Explicitly own a 30s allowance on
that first fixture-building test only; dependency/export/allowlist assertions and
all consumer tests remain intact. This is a pre-existing dependency-package test
budget defect. No global timeout override or unrelated production edit is used.

Next V3 rerun passed all packages through access-router-deco, including fresh
access-router **56 files / 693 tests**, but stopped at the existing access-router-runtime
`test/config-loader.test.ts:205–257` five-subprocess rejection matrix: **134 passed /
1 failed**, default 5s deadline at 5,069ms. Each of its five sequential subprocesses
already has an explicit 10s timeout, so the outer default can abort the matrix before
those bounds. Explicitly own a 60s outer allowance for this one test, preserving all
per-process 10s limits, export-path diagnostics, exit and unhandled-rejection checks.
This is an inherited runtime-test budget mismatch; no config-loader implementation
changes. Full V3 rerun remains required.

Completion evidence (ABB-07):

- **Final verdict: PASS for ABB-01..06 and ABB-07**, after the independently
  reproduced bulk-response correction and explicitly scoped integration-fixture
  repairs above. All required V2/V3 checks passed against final production source.
  No unresolved implementation task or verification blocker remains.
- Files changed in this reviewer session (exact; inherited changes preserved):
  - `packages/access-router/src/services/model-subdocument-service.ts`: intersect
    bulk response candidates with actual payload IDs before assignment; trusted
    update-filter replacement cannot enumerate readable non-targets.
  - `packages/access-router/test/subdocument-mutation-visibility.integration.test.ts`:
    two direct/root real-Mongo regressions covering broad trusted replacement,
    committed target-only changes, and empty bulk payload response/count.
  - `packages/access-router/test/packed-consumer-compatibility.test.ts`: rebuild
    release artifact once per invocation, assert all 14 emitted JS/declaration files
    and both shipped docs match current bytes in tarball/artifact, and allow 180s
    for each installed-consumer matrix case.
  - `packages/express-oidc-vault-redis-store/test/index.test.ts`: one 60s outer
    fixture deadline; original 10s revocation and all resource assertions retained.
  - `packages/express-runtime/test/watch-supervisor.test.ts`: child-side readiness
    acknowledgement after signal-handler registration and 60s outer test deadline;
    original signal/shutdown/exit/leak assertions retained.
  - `packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts`: one
    30s installed-runtime smoke deadline.
  - `packages/express-json-router/test/packed-consumer-compatibility.test.ts`: one
    30s first pack/manifest/allowlist fixture deadline.
  - `packages/access-router-runtime/test/config-loader.test.ts`: one 60s outer
    five-subprocess matrix deadline, retaining each subprocess's 10s bound.
  - `docs/tasks/20260926-145743-access-router-business-boundary-review.md`: status,
    discoveries, explicit integration scope, failed/passing command evidence and
    independent acceptance verdicts. No other files edited by this reviewer.

Independent acceptance verdicts:

| Task   | Verdict and inspected evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ABB-01 | **PASS.** `Base.processInclude`/`assertIncludeOutputPaths` preflight before filter parsing/target work; two-way `get`/`set` probes match legacy bracket semantics, with nested receiving-model config. Both service read paths catch controlled errors and PublicService preserves BadRequest before list fallback. All **38 metadata tests** pass: positive-count attack, default/dotted equal/ancestor/descendant overlaps, direct/root identifier/filter/list and internal paths, zero calls including earlier safe siblings/nested targets, ordinary collision/sibling and legitimate permission controls. Cross-resource and fallback suites also pass.                                                                                                             |
| ABB-02 | **PASS.** `applyUpdate` traverses only strict policy ancestors, whole grants win, and document setters perform casting/change tracking. Model updateOne (including updateById/upsert) and both subdocument update paths share it after selection. All **46 raw Mongo reload regressions** pass for ordinary/single-nested schemas, absent/null parents, whole objects/arrays, indexed leaves, malformed/dotted inputs and trusted prepare/transform. Validation precedes prepare; protected hook additions, explicit replacement, dirty paths, snapshots and diff controls agree with the handoff.                                                                                                                                                                       |
| ABB-03 | **PASS after review correction.** `visibleMutationRows` checks parent/sub-read guards, adds sub-list only for full-array create, pins one post-save parent query to actual `_id`, intersects applicable row filters and applies read fields plus `_id`. Hidden writes succeed with null/empty data and visible counts. All **71 real-Mongo tests** pass, including write denial, false/override filters, post-save eligibility, stored ordering/addFirst/custom ID and bounded policy/query calls. The earlier evidence did not cover a broad trusted update override returning non-targets; the reviewer reproduced and corrected it as recorded above. Empty/nonempty bulk responses now preserve the documented target-only contract even under that override.        |
| ABB-04 | **PASS.** Request/runtime WeakMap state owns FIFO leaf persistence permits; service construction captures the pool owner, lazy adapter operations settle inside `work`, and document save/delete/populate share admission. `finally` releases/transfers slots; map/run orchestration holds none across descendants. All **5 scheduler/adapter + 15 HTTP persistence tests** pass: measured nested peak 3 at limit 3 (historical before peak 9), root/third-level completion at 1, rejection recovery/FIFO/order, bulk attempts, distinct requests/runtimes and ambient-runtime persistence ownership. Cumulative query/depth and existing bulk/subquery bounds remain passing. Admission is scoped to adapter/document operations, as documented.                        |
| ABB-05 | **PASS.** Default adapter `castFilter` clones and uses owning-model Query.cast without execution; wrapper preserves receiver and forwards synchronously without admission. Grouped count casts complete authorized match and independent foreign operands, reuses them after unwind, maps original aliases and unions document-ID sets. All **41 real-Mongo count regressions** plus the two added adapter tests pass: both ObjectId/String directions, ACL tenant/region, arrays/duplicates/setters/aliases, 9/10 counts beyond hard limit 2, one aggregate for 1/24/40 parents, denied/malformed cases with zero target persistence and original aggregate-error identity. Legacy cast BadRequest reaches direct/root callers without revealing trusted filter values. |
| ABB-06 | **PASS.** Inspected all changed README/llms/JSDoc/website prose against code and the five contracts; canonical root/default/advanced/processors guidance agrees with actual entries. **17 documentation + 39 export-contract + 1 strict-consumer test = 57**, plus **7 packed/artifact checks**, pass in final package runs. The strict-consumer test compiles its positive/negative snippet matrix. The customer-profile example uses supported non-generic public options for dotted keys; no added dependency/entrypoint is required.                                                                                                                                                                                                                                 |

Commands/results (repository root unless noted; commands executed serially):

1. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed twice**,
   including after the final bulk-candidate fix; each rebuilt five packages then
   ran `tsc --noEmit -p tsconfig.typecheck.json` successfully.
2. `pnpm --filter @web-ts-toolkit/access-router test` — **four invocations**:
   first 690 passed/1 consumer deadline failure; second 688 passed/3 skipped with
   one Mongo startup failure; third 691 passed; fourth/final **56 files / 693
   tests passed** (157.95s Vitest duration). Failures and their resolution are
   recorded above. Each invocation freshly rebuilt the package dependency closure.
3. `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/subdocument-mutation-visibility.integration.test.ts -t 'bulk trusted filter replacement'`
   — before fix **2 failed / 69 skipped**, both at unexpected non-target response
   rows after raw persistence assertions passed. Final V2/V3 include both passing
   cases and all 71 tests in that file; no generated output was hand-edited.
4. `pnpm build` — **passed twice**, including after the final production change,
   across workspace packages/apps. Final full output:
   `<tool-output>/tool_0e024e738001AgIKjp51QYIBk9`.
5. `pnpm test` — **eight serialized invocations**: Redis fixture deadline failure;
   full pass before the independently found bulk-candidate fix; ERT-B07 outer
   deadline failure; ERT-B07 readiness assertion failure; MongoDB-store packed
   deadline failure; express-json-router pack deadline failure; runtime config
   matrix deadline failure; then **final full PASS**. Final run: **364 file
   executions / 5,384 tests passed / 1 existing TODO**, across 26 Vitest lanes
   (including React 18/19 and browser lanes, so these are execution totals rather
   than unique-test counts). Access-router again **56 files / 693 tests passed**;
   all seven packed checks regenerated/verified fresh artifacts. Final full output:
   `<tool-output>/tool_0e0669b8b001D3ToWXyi9bNWRm`.
6. `pnpm --filter @web-ts-toolkit/express-runtime exec vitest run --config vitest.config.mts test/watch-supervisor.test.ts -t 'real subprocess receiving two OS signals'`
   — diagnostic run **1 passed / 15 skipped** after the outer-budget adjustment;
   subsequent full-run readiness failure led to the marker fix. Final full suite
   passes all **341** Express-runtime tests with that correction.
7. `pnpm lint` — **passed twice**, including final source/tests, exit 0.
8. `git diff --check` — **passed** after both integration waves and final task
   evidence update, exit 0.
9. `npm pack --dry-run --json` (cwd `packages/access-router`) — **passed**:
   **17 entries**, 230,409 compressed bytes, 1,369,873 unpacked bytes. Contents are
   README/llms/manifest, root/advanced/processors JS+ESM+dual declarations and the
   dual shared declaration chunk. Actual production-transformed tarballs are
   independently unpacked/installed by the seven passing packed checks.

Declaration/artifact audit:

- Inspected fresh `dist/index.d.ts`/`.d.mts`, `advanced.d.ts`/`.d.mts`,
  `processors.d.ts`/`.d.mts`, and shared `parsers-CmJdFTud.d.ts`/`.d.mts`.
  Root/advanced/processors conditions align with all three bundled tsup entries.
  Update/count/subdocument signatures retain the documented result shapes; hover
  contracts survive for policy-path assignments, hooks, metadata and concurrency.
  `ModelRouter.model.castFilter` is additive; applyUpdate, visibleMutationRows,
  admission wrapper and request registry introduce no public export.
- Actual tarballs use the real publisher's manifest transformation; release-artifact
  package trees preserve their own layout. Both now byte-match current access-router
  output and README/llms, rather than merely resolving old entrypoints. Installed
  ESM/CJS, NodeNext `.mts`/`.cts` plus emitted runtime, and Bundler consumers pass
  with Express 5.0/Mongoose 8.0 and Express 5.2.1/Mongoose 9.8. Current-peer checks
  use `skipLibCheck: false`; the minimum-peer lane's existing declaration-internal
  limitation remains explicitly scoped, not a full behavior/version matrix.

Final diff/evidence audit and limitations:

- Read every preceding Completion evidence section and traced its changed source,
  entry paths, regression assertions and documentation claims. Historical failing-
  before invocations are their authors' recorded evidence; this reviewer did not
  revert source to replay them. Fresh full tests independently revalidate their
  final outcomes, and the new bulk override defect has reviewer-run before/after
  evidence. ABB-03's stated inherited-dist baseline limitation remains visible.
- Final shared tree contains **33 intended files**: the inherited 27 ABB files plus
  six newly modified test files (packed suite and the five explicitly scoped
  cross-package fixture repairs). The reviewer also edited inherited subdocument
  source/test/task files, for **nine reviewer-owned changed files** total. Inspected
  tracked diffs and all untracked ABB helpers/tests; no unexpected files or staged
  changes, root CHANGELOG edit, manual dist edit, commit or subagent. Fresh build
  output was generated only by repository build/artifact commands.
- Existing non-failing diagnostics include Vite native-config warnings, template
  dependency notices, intentional invalid-TS/React error-path fixture output and
  the React-18 runner's asdf fallback messages. Final commands exit 0. Asset-inliner's
  one pre-existing TODO remains a TODO; no tests were newly skipped/waived.
- Scope is these business-boundary criteria plus observed integration blockers,
  not exhaustive vulnerability scanning, arbitrary hook/plugin governance, a
  schema/version behavior matrix or production throughput testing. Website prose
  was checked for drift; no separate website build was required/run. Existing
  consequential deferrals below remain unchanged. Coordinator audit is the only
  remaining handoff; no new independent task or unresolved blocker is claimed.

## Compatibility / release notes

Implemented contracts and compatibility decisions are recorded below and delivered
in shipped documentation by ABB-06. Historical handoff wording records execution
order; all seven task statuses above are now completed. Root `CHANGELOG.md` is unchanged.

### ABB-01 documentation handoff

- Include `path` is output-only. It must not equal, descend from, or contain the
  receiving model's configured `documentPermissionField` (default `_permissions`).
  For `documentPermissionField: 'auth.policy.permissions'`, reject `auth`,
  `auth.policy`, `auth.policy.permissions` and `auth.policy.permissions.canReadSecret`.
  A sibling such as `auth.policy.permissionsExtra` is valid. Equivalent legacy
  bracket notation is subject to the same restriction.
- The restriction applies to legacy and correlated read/list/count includes and
  to every supported nested include level using that level's receiving target
  model configuration. The include tree is preflighted before target persistence
  work, even if an earlier sibling is valid or a nested relationship would be empty.
- Requests that previously used include output to overwrite authorization metadata
  now fail with BadRequest (`bad_request` in service/root results). Direct routes
  return HTTP 400; the root batch retains its HTTP 200 envelope with statusCode 400
  on the affected entry. Public read-by-id/read-by-filter do not retry BadRequest
  using list access, including other malformed read arguments.
- Ordinary output collisions (for example replacing `key` with a count), unrelated
  nested/sibling paths, target operation/row/field authorization and legitimate
  document permission grants remain supported. Applications should move computed
  relationship values to ordinary output paths rather than permission metadata.
- No new public import, option, dependency or callable API is required. ABB-06 should
  incorporate this contract in the shipped README/appropriate public include JSDoc.

### ABB-02 documentation handoff

- Update payloads are partial **at the authorized policy paths**, not generic deep
  merges. With only `'profile.public': { update: true }`, send
  `{ profile: { public: 'next' } }`: existing `profile.secret` and other omitted
  siblings survive. This applies to model `updateOne`, `updateById`, existing-row
  upsert, and single/bulk subdocument updates, including ordinary Mongoose nested
  objects and single-nested subdocuments. Admitted leaves can initialize missing
  or null parents through Mongoose setters.
- Authorizing `profile` itself authorizes whole replacement. Sending
  `{ profile: { public: 'next' } }` then removes omitted children. Authorizing an
  object-valued leaf such as `profile.settings` replaces that leaf without replacing
  `profile`. If whole and descendant grants overlap, the whole grant takes priority.
  Empty authorized objects replace (Mongoose `minimize` may omit them in storage).
- Arrays are whole replacement values when the array field is authorized: no
  concatenation or element-wise merge. An explicit indexed leaf grant such as
  `'items.0.public'` instead updates that index/path and preserves other elements
  and protected fields. Omitted fields are unchanged; admitted null values clear
  the selected field. An absent/null/empty/malformed **containing** client value
  supplies no descendant leaf and cannot clear a protected parent. Normal Mongoose
  casting and validation still apply to admitted values.
- Continue sending nested JSON. Literal client keys such as `'profile.public'`,
  `'profile.secret'` and bracket aliases are not Mongo update instructions; the
  existing `pick` selection ignores them rather than expanding them. They cannot
  bypass field authorization, even alongside a legitimate nested payload. This
  change does not introduce `$set`/`$unset` client operators. Configured policy
  bracket/index aliases retain the same path interpretation as field selection.
- Prepare/transform hooks remain **trusted application code**. Validation still
  runs against selected client data before prepare. Prepare receives that selected
  nested shape and its returned data is not re-filtered: it may add protected or
  server-only fields, including dotted Mongoose paths. In-place and returned-object
  prepare chains both work. `context.preparedData`/result input retain that output
  shape; the helper does not flatten or mutate it.
- Compatibility decision: plain-object/array prepare output at a strict ancestor
  of this request's admitted paths now applies its supplied children, preserving
  omitted siblings. Returning the original selected object, `{ profile: {} }` at
  such a partial ancestor, or omitting `profile` does not erase existing children.
  Other prepare paths (including protected additions) remain whole assignments.
  Prepare can explicitly clear/unset a parent with `{ profile: null }` or
  `{ profile: undefined }`; an entirely null/undefined prepare result supplies no
  assignments. Applications that formerly relied on omission-based parent deletion
  from a prepare object should explicitly call `doc.set('profile', replacement)`
  in trusted `transform.update` (or authorize the whole parent if intended for the
  client). Transform still receives/returns a Mongoose document and can explicitly
  replace protected state. These hooks must not blindly reintroduce unfiltered
  client data from `context.originalData`.
- Hook context/order remains validation → prepare → assigned-document transform →
  save → afterPersist → changes. Original/final snapshots and diffs describe the
  actual persisted update; transform's `modifiedPaths` now reflects precise leaf
  assignments. Subdocument updates retain their existing lifecycle; this task does
  not add model prepare/transform hooks to subdocument operations.
- ABB-06 should document this as a protected-data-loss fix plus the explicit prepare
  omission compatibility change. No public import, option or dependency is added.

### ABB-03 documentation handoff

- Subdocument write authorization does not imply response read authorization.
  Create, single update and bulk update first retain their existing write checks
  and persistence behavior, then independently determine visible response data.
  All require parent `operationAccess.read` and the parent's `read` row policy.
  Parent row visibility is checked in Mongo against post-save state, scoped to
  the saved parent's actual `_id`; custom request identifiers remain supported.
- Full-array **create** responses require BOTH `operationAccess.subs.<sub>.list`
  and `.read`, and intersect `baseFilter`/`overrideFilter` for `subs.<sub>.list`
  and `subs.<sub>.read`. This covers existing rows as well as newly inserted rows,
  including POST `[]`. Granting append/create alone no longer enumerates existing
  data. A read grant alone is insufficient to enumerate the array via create.
- **Single/bulk update** responses require `subs.<sub>.read` operation/row access
  and contain only authorized mutation targets. Bulk output is a list-shaped set
  of targeted update results, not a full-array listing: it deliberately does not
  require `subs.<sub>.list`. This preserves read-authorized updates for callers
  who cannot list the collection. A read policy can hide successfully updated rows.
- Compatibility decision: mutation field projection remains **read fields plus
  `_id`**, rather than switching to list projection or intersecting list/read
  field grants. List fields govern list endpoints. The create response's extra
  list gate governs enumeration; the read gate governs the read-shaped content.
  Read/list row policies are distinct, so create intersects them while targeted
  update uses read only. Existing list/read endpoint contracts are unchanged.
- A denied response operation guard, terminal false base/override filter, or no
  matching parent/rows is **successful hidden output**, not a post-commit error:
  - Create: service/root `{ success: true, kind: 'list', code: 'created', data: [], count: 0 }`;
    direct HTTP **201** with `[]`, root entry statusCode **201**.
  - Bulk update: service/root `{ success: true, kind: 'list', code: 'success', data: [], count: 0 }`;
    direct HTTP **200** with `[]`, root entry statusCode **200**.
  - Single update: service/root `{ success: true, kind: 'single', code: 'success', data: null }`;
    direct HTTP **200** with JSON `null`, root entry statusCode **200**.
    Root retains its normal HTTP 200 batch envelope. Callers must treat these as
    completed writes and must not retry merely because the response is empty.
    Actual write denials and validation/persistence failures retain their errors.
- Visible counts count only returned rows, not all stored/updated rows. Filtering
  preserves stored array order; bulk request order does not reorder the response.
  The public service's existing `addFirst` option preserves insertion order before
  filtering. Generated direct/root create routes still expose their existing body
  contract; this does not add an HTTP addFirst option.
- Response policies are collection predicates resolved once per mutation. Create
  uses an unrestricted initial subdocument selector; single read policy receives
  the saved target `_id`, bulk read policy receives an `$in` of mutation-target IDs.
  Trusted overrides may replace those predicates, but response candidates remain
  the actual mutation targets for updates. No per-row callback/persistence loop:
  at most one extra parent visibility query, and existing bulk item limits remain.
- ABB-06 should describe this as a response-disclosure fix and an explicit
  successful-write/hidden-output compatibility contract. Public service signatures
  and imports remain unchanged; no new option or dependency is introduced.

### ABB-04 documentation handoff

- `requestComplexity.maxBulkConcurrency` is now a **request-and-runtime-owned
  persistence admission ceiling** for access-router model services. Direct service
  calls, root batch entries, legacy/subquery target calls and all correlated include
  levels using the same request/runtime share one pool. Distinct requests have
  independent pools; runtimes sharing an Express request also have independent pools
  and correlated-query totals. A service captures its runtime at construction, so
  later ambient runtime changes do not select another pool for its persistence.
- Admission wraps the awaited adapter operation (including lazy Mongoose query
  execution), document save/delete, and service-triggered post-write populate.
  An array create submits one admitted singleton-array adapter operation per item;
  results retain input order, and rejection does not cancel already submitted items.
  Bulk item/validation limits and indexed validation errors retain their contracts.
  Internal adapter overrides must retain the existing array-in/array-out create
  contract; they now receive singleton arrays for bulk persistence.
- Include/root orchestration does not hold a permit while awaiting descendants.
  Internal scheduler `map`/`run` still bound their own orchestration loops; only
  persistence `work` admission is shared. `RootRouter.maxConcurrentOperations`
  independently limits whole root operations within each order group. It is not
  the persistence ceiling. A persistence limit of 1 supports recursive includes
  without deadlock; root results retain input-index order and include associations.
- Permits release on success, synchronous throw and promise/query rejection, with
  FIFO transfer to waiting operations. Existing errors propagate; slot release does
  not cancel other submitted work or refund `maxCorrelatedQueries`. That option is
  a cumulative target-query budget, and `maxCorrelatedDepth` remains a template-depth
  budget. Neither is replaced by the simultaneous-persistence ceiling.
- The admission unit is a library adapter/document operation, not every MongoDB
  driver command inside it (for example Mongoose populate internals). This is not
  a process-wide connection-pool limit, a throughput guarantee, or governance of
  arbitrary database/network calls made directly by trusted application hooks.
  Service ACL/prepare/afterPersist/decorate and recursive include orchestration are
  outside the permit; the awaited persistence operation includes Mongoose's own
  middleware. No new public import, dependency or option is needed.
- ABB-06 should correct any prose implying all scheduler maps share one global
  worker pool. Document the adapter-operation ceiling, distinct orchestration and
  total/depth budgets, and the measured nested peak correction (9 → 3 at limit 3),
  without claiming increased throughput. ABB-05 grouped-count casting remains pending.

### ABB-05 documentation handoff

- Legacy grouped `op: 'count'` includes now use the **target model's query-schema
  casting** for the complete authorized match (including tenant/row filters) and
  the foreign-key `$in` operands used after array unwind. String ObjectId inputs,
  ObjectId-to-String joins, array element types and query setters follow the owning
  Mongoose schema. This resolves ABB-04's then-pending casting handoff above.
- Counts are exact distinct target-document counts over the authorized count scope,
  independent of listHardLimit and include pagination. Repeated source keys, repeated
  foreign array entries and a document matching multiple local keys do not inflate
  the result. Normalized keys (uppercase ObjectId strings, String setters, numeric
  string aliases) associate back to their original parent values. No matches yield 0.
- One grouped aggregate serves all parents for each legacy count include execution;
  this change does not convert grouping into per-parent queries. The aggregate uses
  the request/runtime persistence pool from ABB-04. Synchronous schema casting takes
  no persistence permit and performs no database query.
- Casting occurs after ACL filter resolution. Denied count operations still reject
  before target work; terminal false row policy retains the existing legacy omitted
  include output and grouped-service Forbidden result. Malformed schema operands or
  authorized filters now produce controlled BadRequest rather than silent zero counts:
  direct HTTP 400, root entry statusCode 400/code `bad_request`, and grouped-service
  error result. Error details do not include values from trusted tenant/ACL filters.
  Database/aggregate failures are not relabeled as casting errors.
- This is **query-schema/setter parity**, not a replay of countDocuments middleware
  or plugins. The synchronous cast builds a query without executing it; aggregate
  middleware still belongs to the aggregate operation. Applications should express
  router count authorization through the supported operation/row policy hooks.
  Arbitrary user pipelines passed to the model's aggregate method are not auto-cast.
- The internal overridable adapter seam gains optional synchronous `castFilter`:
  custom adapters without it retain identity semantics; implementations should cast
  a copy and preserve `$in` operand order/cardinality so parent aliases remain aligned.
  The default adapter exposes this additive method through `ModelRouter.model`, with
  emitted JSDoc. Existing service signatures, imports, dependencies and options remain.
- ABB-06 should document the corrected count/casting/error contract and middleware
  distinction without promising a Mongoose-version/plugin compatibility matrix.

### ABB-06 compatibility delivery

- The shipped README and llms now carry the ABB-01..05 handoff contracts above.
  Applications must relocate computed include output away from permission metadata,
  use explicit trusted replacement when prepare omission formerly deleted parents,
  and treat successful empty/null subdocument mutation responses as completed writes.
  Exact grouped counts now use schema casting and controlled BadRequest on invalid
  operands; count middleware/plugin replay and arbitrary-pipeline casting are not promised.
- Request/runtime-owned admission can change timing across nested/root persistence.
  Custom adapter bulk creates receive singleton arrays with array-in/array-out results;
  optional synchronous castFilter preserves operand order/cardinality and identity
  semantics when absent. Admission is not a driver-operation count, process-wide
  connection limit, transaction, idempotency or optimistic concurrency feature.
- `/advanced` has no runtime-context exports; use the existing root runtime API.
  Public entrypoints/signatures remain compatible. Dotted policy examples use the
  existing non-generic ModelRouterOptions rather than claiming generic nested-key typing.
  No version/plugin compatibility matrix or production performance result is implied.

## Consequential deferrals

Continuation: [Residual contracts](20260926-184406-access-router-residual-contracts.md)
now tracks implementation of ARH D1/D2/D3 and the bare-literal-escape finding, following
the user's request to continue. The historical scope and completed ABB evidence remain
unchanged; the continuation document owns those new execution statuses.

Existing ARH D1/D2/D3 and ACI follow-ups (including bare literal escape and old-server
compatibility) retain their original records; this objective does not reopen that
backlog. Generic transactions/idempotency, optimistic concurrency, soft-delete, cursor
pagination and production tuning need separate business contracts; adding them here
would be speculative. Their absence does not remove application responsibility for
concurrent edits, retry semantics or retention. No new generic feature task is promised.

## Definition of done

Every accepted task is completed with observable evidence, shared enforcement is
reusable/testable, documentation matches public behavior, final package/workspace and
packed checks pass, and coordinator audits this entire task file after the independent
review. Report the exact file path, resolved findings and actual verification results.

## Coordinator final audit

- Read the entire final task document after ABB-07, including all requirements,
  acceptance mappings, failed/passing verification history, scope extensions,
  compatibility decisions and consequential deferrals. Confirmed **7 tasks, 7
  completed statuses, and 7 Completion evidence sections**; no accepted task remains
  pending, blocked or deferred.
- Confirmed each task ran in its own fresh sub-agent session, sequentially. ABB-07
  independently reviewed implementation and corrected its discovered bulk-target
  response defect with before/after regression evidence.
- Inspected final source diffs and both new internal helpers, shipped README,
  packed-artifact freshness changes, and all five cross-package test-fixture repairs.
  Those repairs are limited to observed verification blockers and retain operation,
  export, shutdown and resource assertions. There are no unrelated production edits.
- Verified `git status --short` against the 33-file ownership record and checked
  `git diff -- CHANGELOG.md` (empty). No generated output is tracked as changed.
  Package/workspace verification is the independent reviewer's recorded successful
  final V2/V3 execution; the coordinator did not repeat already-passing suites after
  this documentation-only audit update.
- **Final outcome: complete.** Access-router has 693 passing tests including seven
  fresh packed/artifact checks; workspace execution totals are 5,384 passed with one
  pre-existing TODO. Build, typecheck, lint and diff checks passed. Earlier backlog
  deferrals and documented review limitations are retained; no new blocker remains.
