# Access-router: long-term business and boundary health

Created: 2026-10-12 (`20261012-165209`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed

Completed: 2026-10-14.

Final disposition: all **12 tasks (ARL-01..12)** are completed with Completion evidence.
The nine original implementation tasks and two independently discovered follow-ups ran
in **11 separate, sequential implementation sessions**. A separate independent reviewer
completed ARL-10 after verifying both follow-ups. The coordinator's final record/worktree
audit is complete; no required pending or blocked task remains. Historical intermediate
statuses and failed-run evidence below are retained with their final resolutions.

Final gates: workspace build/test/lint, package typecheck and installed-package checks
passed. The final root test reports **13,009 passing test executions**, including
**2,750 access-router tests**, zero failures/skips and one pre-existing unrelated todo.
`CHANGELOG.md` retains its baseline blob.

## Objective and product context

Review and improve `packages/access-router` as a reusable authorization boundary for
Express/Mongoose business APIs: tenant-scoped CRUD, protected fields, reference and
embedded relationships, computed output, in-memory reference data, and ordered root
batches. Correct authorization and query semantics must survive alternate entry paths,
runtime composition, hooks, and larger business datasets. Make the installed package
and its layered options understandable without repository source access.

The user requests implementation, a fresh isolated sub-agent for **each task**, strictly
sequential execution, completion evidence, and a final independent review. Migration
effort is not a constraint on correcting contracts. Work stays in this repository.
`CHANGELOG.md` must not be edited; external contract notes belong in the shipped README
and this record. No publishing, committing, staging, or unrelated rewrites are authorized.

## Analysis coverage and baseline

- Read repository instructions, task conventions, the requested task-as-you-go skill,
  and the ai-friendly-ts-package skill. A dedicated read-only review inspected runtime,
  configuration, guards, model/data/root routes, CRUD, input/output policies, includes,
  populate, subdocuments, validation and representative regression tests. The coordinator
  inspected package metadata, all public entrypoints, README/llms organization, relevant
  declaration/export tests and the source boundaries behind the promoted findings.
- Product architecture: runtime-owned registration/options -> request permission cores ->
  validated route/service calls -> captured query and field authorization -> bounded
  persistence -> document/related/virtual finalization -> public response shaping.
  DataService uses configuration-time snapshots and page-only shaping instead of Mongo.
- Deduplicated against completed access-router task records for September 19 business
  boundaries/residual contracts, October 5 virtuals/operation variants, October 7 explicit
  service authorization, and October 12 authorization follow-ups. Targeted earlier
  ART/ARH findings were checked where referenced below. These tasks address residual
  cases, not a repeat of completed remediations.
- Starting HEAD: `3f772ec`. Initial worktree contained the unrelated untracked
  `docs/tasks/20261012-163240-dpop-server-client-health.md`; preserve it and any concurrent
  unrelated work. Recheck status before touching files.
- Baseline `CHANGELOG.md` Git blob: `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- **No new runtime/build/test baseline was run during analysis.** Defect findings are
  source-confirmed; owners must establish meaningful failing reproductions before fixes
  where practical. Metadata exports match bundled build entries on inspection; emitted
  declarations and installed consumers require final verification.
- Limitations: no exhaustive audit of every dependency, deployment configuration, hook
  supplied by applications, or every historical task. No performance timing or production
  load claim is made. Performance acceptance below measures bounded work/result size.

## Priority, execution and verification rules

- P1: authorization or query/data-integrity failures; fix before lower-risk improvements.
- P2: concrete usability, ownership or scaling defects that affect ordinary business use.
- Run ARL-01 through ARL-10 **one at a time**, each in a fresh sub-agent session. No nested
  delegation or concurrent rebuilding commands. Dependencies below deliberately form a
  sequence because service/finalization code, README and generated output are hotspots.
  The independent review added ARL-11 and ARL-12; their fresh owners ran sequentially
  before the same independent reviewer resumed ARL-10 for final sign-off.
- Each owner sets its task `in_progress` before work, records necessary contract decisions
  and newly discovered required work, implements and verifies, then records `Completion
evidence` and marks `completed`. Do not rewrite historical findings. Independent new
  findings get a uniquely numbered task with ownership, criteria and dependencies; finish
  them sequentially before final sign-off. Never mark unverified/blocked work complete.
- Prefer shared enforcement points and package-private transport over route exceptions,
  DTO metadata, broad bypasses or new global state. Preserve original actor permissions,
  terminal false predicates, mandatory IDs/joins, explicit authority dimensions, normal
  validation/save hooks, and successful hidden-write responses.
- Use ignored repository-local `<repo-root>/_tmp-arl-health` for fixtures. Check the parent
  with `ls` and its ignore rule with `git check-ignore` before test/tool creation. Set
  `TMPDIR` to that checkout-local directory at runtime. Evidence uses repo-relative paths
  or `<repo-root>`, never machine-specific absolute paths.
- No arbitrary new tests for prose-only changes. Runtime/security fixes need regressions
  against actual behavior, with negative and positive controls. Prefer deterministic
  concurrency barriers and result-size instrumentation over flaky timing assertions.

### Shared checks (working directory: repository root unless stated)

1. Build dependency closure before focused runtime tests:
   `pnpm --filter @web-ts-toolkit/access-router... build`.
2. Focused tests using existing Vitest configuration:
   `TMPDIR=<repo-root>/_tmp-arl-health pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`.
   Replace the filename and record the exact command/results in completion evidence.
3. `pnpm --filter @web-ts-toolkit/access-router typecheck` for implementation/public
   type changes; this command rebuilds dependencies and must remain serialized.
4. Targeted ESLint on changed TypeScript files; `git diff --check` after each task.
5. ARL-09 verifies existing documentation, export and installed-consumer tests, emitted
   CJS/ESM declarations, and `npm pack --dry-run` in `packages/access-router`.
6. ARL-10 runs **sequentially**: `pnpm build`, `pnpm test`, `pnpm lint`, plus final package
   typecheck if the final implementation has changed since the preceding passing check.
   Use the repository-local TMPDIR for checks that create fixtures. Root `pnpm test`
   already serializes package test scripts; retain that behavior. Packed consumer tests
   in the package must run; no production release tooling is needed.
7. Final checks: `git diff --check`, full acceptance/status/evidence audit, and
   `git hash-object CHANGELOG.md` matching the baseline. Record unrelated/environment
   failures accurately and resolve affected-scope blockers before completion.

## Tasks

### Task ARL-01: Clear nullish grants when switching runtime ownership

Status: completed

Kind: defect

Priority: P1 — another runtime's privileges can authorize the new runtime's routes.

Suggested agent: request-runtime isolation implementer; fresh session.

Dependencies: none.

Primary ownership:

- `packages/access-router/src/core-shared.ts`, request/core initialization as needed.
- `packages/access-router/test/runtime-isolation.integration.test.ts` and focused tests.

Finding: `setRequestPermissions` replaces the shared field only for object, array or
string resolver values. `GlobalPermissionValue` also allows null/undefined. Switching
from runtime A's `{ admin: true }` to runtime B resolving null leaves A's map in place
and records B as owner. Existing ARH-02 tests switch between nonempty arrays.

References: `src/core-shared.ts` (`permissionFieldOwners`, `setRequestPermissions`);
`src/interfaces/router-hooks.ts` (`GlobalPermissionValue`); `src/acl/request-context.ts`;
paths in this paragraph are relative to `packages/access-router`.

Requirements:

1. A resolver's nullish result establishes empty authority when initializing/replacing
   runtime-owned state. Review absent/non-callable resolver behavior as the same boundary;
   never transfer stale owned grants. Preserve application-supplied unowned maps.
2. Preserve same-runtime reuse and independent model/data/root cores and caches. Resolve
   asynchronous results without a partially initialized authority state.
3. Document nullish resolver semantics in high-value public JSDoc/README where necessary.

Acceptance criteria:

- Sync/async null and undefined cannot inherit prior grants on a shared request.
- Model/model and model/data/root transitions deny the protected target, with no target
  persistence; same-runtime repeated middleware and application-owned map controls pass.
- Existing runtime-isolation behavior and typecheck pass.

Verification: shared checks 1–4; runtime-isolation and applicable model/data/root tests.

Decisions/findings during implementation:

- The absent/non-callable resolver branch also leaves another runtime's field and owner
  intact. Normalize that branch together with sync/async nullish results at
  `setRequestPermissions`: initialization or ownership replacement establishes a fresh
  empty map when there is no resolved grant value.
- Retain the early returns for same-runtime ownership and application-supplied unowned
  maps (including empty maps). Await callable resolvers before replacing the field and
  recording ownership; request initialization already awaits this boundary before
  publishing the new core/permission symbols. Replace the map rather than clearing the
  previous map in place, preserving prior core snapshots and independent caches.
- Pre-fix reproduction after the dependency-closure build: focused handoff/isolation
  suites produced **28 failed / 19 passed (47 tests)**. All seven empty/invalid resolver
  cases incorrectly returned model create `201`, data list `200`, and root target
  `[201, 200]` instead of denial. All 12 existing isolation tests and seven new
  supported-grant/application-map controls passed. Initial empty-map, held async
  resolution and rejected-resolution retry regressions also exposed stale/missing state.

Completion evidence:

- Changed `packages/access-router/src/core-shared.ts` at the shared permission-field
  handoff: missing/non-callable resolvers and nullish results now establish a fresh
  empty map before ownership is recorded. Added the contract to
  `packages/access-router/src/interfaces/root.ts` (`GlobalOptions.globalPermissions`)
  and `packages/access-router/README.md` (runtime isolation).
- Added `packages/access-router/test/runtime-permission-handoff.integration.test.ts`
  with **35 tests**: sync/async null/undefined plus absent/non-callable resolver cases
  across model/model, model/data and root model/data targets; protected root guards;
  object/array/string grant controls; unowned granted/empty application maps; initial
  empty authority and same-runtime reuse; held asynchronous resolution; rejection/retry.
  Denied direct/root model creates make **zero** observed create/save/find/findOne/count
  calls and leave **zero** target rows. Denied data targets do not invoke their filter.
  Root model/data initialization resolves once per request, prior core grants remain
  intact, and the existing same-name cache/connection/concurrent-runtime controls pass.
- Commands below ran serially from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed**, both
    before the red reproduction and after the fix.
  - Red: `TMPDIR=<repo-root>/_tmp-arl-health pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/runtime-permission-handoff.integration.test.ts test/runtime-isolation.integration.test.ts`
    — **28 failed / 19 passed**, 47 tests across 2 files, with the failures described above.
  - Green: `TMPDIR=<repo-root>/_tmp-arl-health pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/runtime-permission-handoff.integration.test.ts test/runtime-isolation.integration.test.ts test/model-router.routes.integration.test.ts test/data-router.test.ts test/root-router.integration.test.ts`
    — **89 passed / 0 failed, 5 files passed** (35 new handoff tests, 12 existing
    runtime-isolation tests, 42 applicable model/data/root tests).
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — dependency rebuild and
    package `tsc --noEmit` **passed**, zero type errors.
  - `pnpm exec eslint packages/access-router/src/core-shared.ts packages/access-router/src/interfaces/root.ts packages/access-router/test/runtime-permission-handoff.integration.test.ts`
    — **3 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/test/runtime-permission-handoff.integration.test.ts`
    — **1 file passed** after formatting the new suite.
  - `git diff --check` — **passed**. The untracked regression file also produced no
    whitespace diagnostics with
    `git diff --no-index --check -- /dev/null packages/access-router/test/runtime-permission-handoff.integration.test.ts`
    (normal new-file difference exit 1); the same comparison checked this task record.
- Inspected the emitted `GlobalOptions` JSDoc in both
  `packages/access-router/dist/parsers-DQY7icyo.d.ts` and
  `packages/access-router/dist/parsers-DQY7icyo.d.mts`; the nullish/ownership contract
  survives CJS/ESM declaration emission.
- Confirmed `_tmp-arl-health` with `ls` and `git check-ignore` before fixture creation;
  Mongo fixtures were removed by suite teardown. `git hash-object CHANGELOG.md` remains
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. No ARL-01 blocker or required follow-up.

### Task ARL-02: Preserve literal predicates during virtual-filter removal

Status: completed

Kind: defect

Priority: P1 — valid filters can broaden and update the wrong business record.

Suggested agent: query-parser/data-integrity implementer; fresh session.

Dependencies: ARL-01 (execution sequencing).

Primary ownership:

- `packages/access-router/src/services/base.ts` virtual filter walker and focused tests.
- Prepared-query/standalone query integration only where required by the same defect.

Finding: `stripVirtualKeysFromFilter` drops empty object values and array entries even
when no virtual clause was removed and even when no virtuals are configured. For
example `{ reconciliation: {} }` becomes `{}`, while `$in: [{}]` loses its operand.
An `updateOne` expected to miss can modify an unrelated invoice. VIRT-04 requires genuine
virtual predicate exclusion; ARC-03 requires escaped literal integrity, not this broadening.

References: `packages/access-router/src/services/base.ts` (`stripVirtualKeysFromFilter`,
`stripEmbeddedFilterObject`); `src/acl/prepared-query.ts` (`prepareModelQuery`);
`src/services/service.ts` (`exists`, `count`, `updateOne`, `upsert`).

Requirements:

1. Track actual removal; preserve virtual-free predicate meaning, including empty objects,
   empty arrays, literal operator operands and native values. Distinguish query clauses
   from values; matching a virtual's name inside literal data is not a virtual predicate.
2. Preserve current deliberate removal of actual virtual predicates, dotted/embedded
   scope handling, terminal false and mandatory row/identifier/join constraints.
3. If corrected behavior alters documented filter examples, update them together.

Acceptance criteria:

- Real Mongo read/count/exists/update/upsert tests distinguish empty-object equality
  from match-all. A no-match update does not write; an allowed upsert miss follows the
  appropriate branch. `$eq`/`$in` literal objects and virtual-free models are covered.
- Positive empty-object fixtures use `minimize: false` or raw inserts. Genuine root and
  embedded virtual clauses remain excluded, with denial and correlated-literal regressions.

Verification: shared checks 1–4; focused virtual/query/correlated regression suites.

Decisions/findings during implementation:

- This fresh dedicated session owns ARL-02 only; ARL-01 is completed. Initial worktree
  inspection confirmed ARL-01 edits and concurrent unrelated package/task changes.
- Confirmed `_tmp-arl-health` exists with `ls` and is ignored by `.gitignore`'s `_tmp*`
  rule using `git check-ignore`. Fixture-producing commands use
  `TMPDIR=<repo-root>/_tmp-arl-health`. The initial `CHANGELOG.md` blob matches the baseline.
- Parser contract: root/logical clauses and `$elemMatch` bodies are query positions;
  `$not` carries field conditions and `$all` may contain explicit `$elemMatch` queries.
  Ordinary object/array equality values and other operator operands (`$eq`, `$in`,
  `$nin`, expressions, etc.) are opaque data, even when their keys spell virtual names.
  Retain VIRT-04's nested-field shorthand only under a registered embedded container;
  explicit `$eq` expresses literal whole-container equality there. Dotted lookup must
  follow registered container scopes, not reuse root virtual names inside unrelated data.
- Empty query/value objects, array operands and logical branches survive unless an
  actual virtual removal empties that clause. Only those removed clauses are pruned;
  a wholly virtual ordinary filter still becomes `{}`. Terminal `false` and the
  prepared-query scope/identifier/join intersection remain authoritative.
- Required same-defect finding: `stripSubVirtualKeysFromFilter` duplicates the lossy
  walker, and `stripEmbeddedFilterObject` resets to root scope for operator children.
  Share the parser across root/subdocument entrypoints, retain embedded scope through
  query-bearing operators, and add regression controls for these paths within ARL-02.
- Pre-fix red reproduction (after fixture calibration to the existing upsert-create
  list result and Mongoose typed-array casting): **39 failed / 22 passed, 61 tests**
  across the two new suites. Real Mongo bare `{ reconciliation: {} }` reads/counts/
  exists broadened to the decoy, no-match updates recorded a save and changed its state,
  and upsert recorded `update, update` instead of `create, update`. `$in: [{}]` lost
  its positive match and upsert created a third row. Different root/embedded virtual
  names exposed lost `$elemMatch` scope. Literal data, originally empty logical branches,
  standalone literal row policies, and subdocument predicates also failed. Direct client
  `$expr` remains rejected; the expression-literal control uses existing `countTrusted`.

Completion evidence:

- Replaced the recursive cleanup heuristics in `packages/access-router/src/services/base.ts`
  with one scope-aware query/field-operator parser shared by
  `stripVirtualKeysFromFilter` and `stripSubVirtualKeysFromFilter`. A private removal
  marker propagates actual removals; empty values never serve as removal markers.
  Dotted/indexed paths follow registered containers, query-bearing operators retain
  embedded scope, and equality/operator data remains opaque. Prepared and standalone
  service callers receive the correction through their existing shared entrypoints.
- Added `packages/access-router/test/virtual-filter-literals.integration.test.ts`
  (**51 real-Mongo tests**) and
  `packages/access-router/test/virtual-filter-parser.unit.test.ts` (**10 parser tests**).
  Bare/`$eq`/`$in` empty-object queries cover models with and without virtual definitions:
  read/list/count/exists miss correctly, positive `minimize: false` fixtures match alone,
  six no-match updates make **zero saves**, and all six upsert cases record exactly
  **one create followed by one update**, retaining the decoy and exactly two rows.
  Tests also cover literal arrays/virtual-spelled keys/operator-spelled data, native
  operands, originally empty logical clauses, embedded/dotted/indexed scope, `$not`,
  `$all`, `$elemMatch`, subdocument filtering, literal row policies, required IDs/joins,
  and terminal input/base denial with **zero observed persistence calls or saves**.
- Clarified this corrected query-versus-literal contract in
  `packages/access-router/README.md` (Virtuals → output-only database/write restrictions),
  including explicit `$eq` for literal whole-container equality under an embedded scope.
- Commands below ran from `<repo-root>`. Builds, Vitest and typecheck ran serially with
  `TMPDIR=<repo-root>/_tmp-arl-health` and `npm_config_workspace_concurrency=1` (including
  the typecheck script's dependency rebuild); lint/format checks ran afterward with the
  same `TMPDIR`. Vitest additionally used
  `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries` and
  `MONGOMS_PREFER_GLOBAL_PATH=false`:
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed**,
    before the red reproduction and after the implementation correction.
  - Red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtual-filter-literals.integration.test.ts test/virtual-filter-parser.unit.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl02-red.xml`
    — **39 failed / 22 passed, 61 tests, 2 files**, zero collection errors. Inspected
    the report's exact totals and mutation failures before changing runtime code.
  - Green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtual-filter-literals.integration.test.ts test/virtual-filter-parser.unit.test.ts`
    — **61 passed / 0 failed, 2 files passed**.
  - Preservation regressions: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-route-parity.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-hardening.boundary.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-denial-contract.test.ts test/filter-denial.integration.test.ts test/correlated-includes.escape.integration.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/correlated-includes.validation.test.ts test/service.internal.test.ts`
    — **307 passed / 0 failed, 15 files passed**. Existing correlated escapes,
    virtual output/write behavior, query authorization, mandatory constraints and denial
    contracts pass. Total ARL-02 green verification: **368 tests across 17 files**.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — dependency rebuild and
    package `tsc --noEmit` **passed**, zero type errors.
  - `pnpm exec eslint packages/access-router/src/services/base.ts packages/access-router/test/virtual-filter-literals.integration.test.ts packages/access-router/test/virtual-filter-parser.unit.test.ts`
    — **3 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/services/base.ts packages/access-router/test/virtual-filter-literals.integration.test.ts packages/access-router/test/virtual-filter-parser.unit.test.ts`
    — **3 files passed** after applying formatting corrections.
  - `git diff --check` — **passed**. Also checked both new test files and this untracked
    task record with `git diff --no-index --check -- /dev/null <repo-relative-file>`;
    no whitespace diagnostics (normal new-file difference exit 1).
- Mongo fixtures were removed by suite teardown; the temporary JUnit report was removed
  after recording its evidence. Final worktree review preserved ARL-01's source/JSDoc/
  README/test edits and concurrent unrelated work. `git hash-object CHANGELOG.md` remains
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. ARL-02 has no blocker or required follow-up;
  the overall record remains `in_progress`.

### Task ARL-03: Separate include attachment provenance from source authorization

Status: completed

Kind: defect

Priority: P1 — include misses/collisions can expose private fields or change hook grants.

Suggested agent: include/output-authorization implementer; fresh session.

Dependencies: ARL-02.

Primary ownership:

- `packages/access-router/src/services/base.ts` include attachment flow.
- `packages/access-router/src/services/service.ts` (`finalizeDirectOutput`) and private
  output transport/finalization helpers; include/authorization integration tests.

Finding: Legacy read includes leave the source untouched on NotFound. Finalization saves
whatever exists at every requested include path, removes it before document authorization,
then restores it after trimming. A miss at a denied `secret` fetched by `alwaysSelectFields`
can therefore restore that secret. A successful collision can remove a source business
field such as `restricted` before `docPermissions` evaluates it. ABB-01 covers metadata
paths and ordinary success collisions; SVA-11-F03 covers target FK lifetime, not this case.

References: `packages/access-router/src/services/base.ts` (legacy read include miss and
include attachment paths); `src/services/service.ts` (`finalizeDirectOutput`);
`src/acl/output-field-filter.ts` (`resolveOutputDocumentAuthorization`).

Requirements:

1. Preserve original projected source authorization/hook dependencies separately from
   produced include attachments. Restore only explicitly produced target results, never
   source values inferred from a requested path. Use package-private provenance.
2. Keep legitimate ordinary output-path collisions, target policy/handle isolation,
   correlated missing-value contracts, and configured metadata-path rejection.
3. Do not mutate persistence documents or expose private join/hook/dependency fields;
   ensure nested receiving models and list rows retain independent provenance.

Acceptance criteria:

- A missed/denied include cannot expose an unselected or denied private source field in
  direct/root list/read paths, with lean and hydrated coverage and nested target controls.
- Hooks observe the original source dependency even when an attachment replaces it;
  authorized successful collisions still return the target result and valid target handle.
- Related/virtual/include/metadata regressions pass; no public transport token is added.

Verification: shared checks 1–4; include-permission-metadata, service-authorization-related,
virtual/include and new source-provenance regression tests, using actual suite filenames.

Decisions/findings during implementation:

- This fresh isolated implementation session owns ARL-03 only, with no nested delegation.
  ARL-01 and ARL-02 are completed; initial worktree inspection confirmed their edits and
  concurrent unrelated package/task changes. The initial `CHANGELOG.md` blob matches the
  recorded baseline.
- Boundary contract: preserve the original projected source for document authorization,
  business hooks and internal dependencies independently of include output. Only a target
  result explicitly produced by include execution may be restored after source filtering;
  a requested path or an existing source value is never attachment provenance. Use
  package-private transport, with independent state for each source/list row and nested
  receiving model. Successful ordinary collisions still return finalized target results
  with target-owned authorization/context handles. Legacy read misses leave ordinary
  source output subject to source selection/policy; correlated misses retain `null`/`[]`/`0`.
  Preserve target failures, metadata-path rejection, internal joins, lean/hydrated behavior
  and persistence-document ownership. No public authorization token or bypass is added.
- Required same-boundary work: include executors currently mutate fetched lean/hydrated
  rows, and populate finalization subsequently sees those overwritten values. Give each
  receiving row a detached include working view and an independent original projected
  source, held in a package-private WeakMap. Run source/populate finalization from that
  source; record only actual successful attachment writes (including explicit correlated
  empty results). Legacy sequential join evaluation keeps its working view, while
  correlated references keep their existing pre-attachment snapshots.
- Output assembly must copy finalized attachments without mutating either the target
  DTO or an already-associated source output. Preserve exact copy origins when transferring
  authorization graphs, so a replacement of a source embedded container retains the
  target's handle, and overlapping/dotted attachments do not acquire the source handle.
  Source document permissions and virtual dependencies are resolved before output-only
  replacement. Association-only FK cleanup still honors SVA-11-F03's independently
  declared always-select/virtual inputs; ABB-01 metadata preflight remains authoritative.
- Pre-fix reproduction after the five-package dependency build: the new real-Mongo suite
  produced **70 failed / 4 passed, 74 tests, zero collection errors**. Missed, row-filtered,
  and terminal-row-denied legacy reads restored denied `secret`/`profile.private` and
  allowed-but-unselected source values across all nine service/direct/root list/filter-
  read/identifier-read entrypoints in both lean modes. Success/empty-result collisions
  removed `restricted`, exposed conditional source fields, changed permission metadata,
  and lost virtual dependencies; nested receiving targets showed the same defects.
  All four operation-denial/runtime-error controls passed. Fixture calibration raised
  the explicit root-envelope depth limit to 16 for nested descriptors and kept legacy
  bracket-output controls separate from the existing dotted-only related-policy grammar;
  the final red run contained no validation/setup failures.
- The first implementation passed all **74** new tests and **434** existing focused
  regressions. A necessary detached-source preservation check then found that copying
  each parent loses the existing shared populate target's cache identity: **2 failures /
  4 passes / 74 skipped** in six additional controls, with a shared getter running twice
  instead of once in both lean modes. Preserve original populated-object identity solely
  as the existing cache key while finalizing detached inputs and returning independent
  per-parent target copies. This is required by ARL-03's source-copy change, not a separate
  scheduling feature. Ordered overlapping attachments and selected-source miss controls
  already pass; retain them in the final suite.

Completion evidence:

- Changed exactly these ARL-03 paths:
  - `packages/access-router/src/output/include-output.ts` — new package-private,
    per-row WeakMap transport holding the original document, detached projected source,
    and ordered explicitly produced attachments. The legacy working view and final
    attachment copies do not alias source/persistence documents or authenticated targets.
  - `packages/access-router/src/services/base.ts` — prepare detached receiving rows and
    record successful legacy/correlated read/list/count output, including explicit empty
    correlated results. Misses/omitted errors record nothing. Existing target dispatch,
    prepared policies, mandatory joins, metadata preflight and failure handling remain
    enforced. The ARL-02 filter-parser changes are preserved.
  - `packages/access-router/src/services/service.ts` — resolve document authorization
    and virtuals from the original source view, then restore only recorded attachments;
    source IDs still drive field-permission checks. Populate traverses detached input
    with original-object identity solely for its existing cache. Hydrated permission
    aliases and SVA-11-F03's independently declared FK/hook input lifetime are preserved.
  - `packages/access-router/src/acl/document-authorization.ts` — transfer authenticated
    output graphs after assembly, using exact finalized origins for replacement roots
    and traversing newly created dotted containers. This preserves target ownership at
    ordinary/overlapping collisions while validating each original authorized output.
  - `packages/access-router/test/include-source-provenance.integration.test.ts` —
    **80 real-Mongo regressions/controls**, comprising the original 74 plus six necessary
    selected-source-miss, ordered-overlap/join and shared-populate preservation controls.
  - `packages/access-router/README.md` — shipped source-versus-attachment contract under
    “Safe include output paths”, preserving ARL-01/02's existing documentation edits.
  - `docs/tasks/20261012-165209-access-router-long-term-health.md` — this task's decisions,
    verification and status only; the overall record remains `in_progress`.
- Acceptance outcomes: denied and allowed-but-unselected source values stay hidden on
  legacy misses, target row-filter misses and terminal target row denial through all
  nine service/direct/root list/filter-read/identifier-read paths, each with lean and
  hydrated persistence. Terminal denied targets make **zero observed target queries**.
  Successful private-field collisions return authorized target data while source hooks
  and getters retain the original `restricted` boolean and private dependencies.
  Nested read/list receivers use their own original inputs. Mixed lists retain independent
  grants/provenance; correct target-handle picks preserve document/backend grants without
  rerunning hooks, and wrong-model/wrong-row handles reject. Correlated misses still
  produce `null`/`[]`/`0`; unresolvable references make **zero target queries**. Retained
  post-query lean/hydrated objects compare equal to their pre-include snapshots, including
  nested/populated targets. Shared populated output evaluates **one getter for two parents**
  in both lean modes, returning distinct copies with valid handles. Existing 38-test
  metadata protection, private FK/join lifetime, related policy and virtual suites pass.
- Commands ran serially from `<repo-root>`. Every build, Vitest and typecheck invocation
  used `TMPDIR=<repo-root>/_tmp-arl-health` and `npm_config_workspace_concurrency=1`;
  Vitest also used `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries`
  and `MONGOMS_PREFER_GLOBAL_PATH=false`. Lint/format checks used the same TMPDIR.
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed** on
    both standalone runs (before red and after the initial fix). The final typecheck
    below rebuilt the same five-package closure before the final runtime gate.
  - Red, after fixture calibration: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/include-source-provenance.integration.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl03-red.xml`
    — **70 failed / 4 passed, 74 tests, 1 file, zero collection errors**, with the
    source-disclosure/hook failures described above. Initial green with the same command
    and `--outputFile=<repo-root>/_tmp-arl-health/arl03-green.xml` — **74 passed / 0 failed**.
  - Additional preservation reproduction: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/include-source-provenance.integration.test.ts -t 'ordinary collision preserves|ordered overlapping|detaching include'`
    — **2 failed / 4 passed / 74 skipped (80 total)** before retaining populate cache
    identity; both failures measured two getter calls instead of one. All six pass in
    the final gate after that correction.
  - Final green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/include-source-provenance.integration.test.ts test/include-permission-metadata.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-final-review.integration.test.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-direct.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-route-parity.integration.test.ts test/virtuals-hardening.boundary.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/correlated-includes.validation.test.ts test/correlated-includes.escape.integration.test.ts test/service.internal.test.ts test/cross-resource-authorization.integration.test.ts test/read-list-fallback-authorization.integration.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl03-final.xml`
    — **514 passed / 0 failed / 0 skipped, 19 files passed**, exactly **80 new + 434
    existing** tests. Before the cache-identity correction, the same existing 18-file
    focus list (without the new suite, report `arl03-regressions.xml`) also passed all 434.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — final dependency rebuild
    and package `tsc --noEmit` **passed**, zero type errors.
  - `pnpm exec eslint packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/acl/document-authorization.ts packages/access-router/src/output/include-output.ts packages/access-router/test/include-source-provenance.integration.test.ts`
    — **5 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/acl/document-authorization.ts packages/access-router/src/output/include-output.ts packages/access-router/test/include-source-provenance.integration.test.ts`
    — **5 files passed** after formatting corrections.
  - `git diff --check` — **passed**. Also checked both new files and this task record
    using `git diff --no-index --check -- /dev/null <repo-relative-file>`; no whitespace
    diagnostics (normal new-file difference exit 1).
- Inspected emitted `packages/access-router/dist/*.d.ts` and `*.d.mts`: the new include
  transport functions and copy-origin channel are absent from public declarations.
  Output objects carry no transport symbols; no public token or bypass was introduced.
- Confirmed `_tmp-arl-health`'s parent and ignore rule before fixture creation. Mongo
  fixtures were removed by suite teardown, and temporary JUnit reports were removed
  after evidence capture. Final worktree inspection preserved ARL-01/02 and concurrent
  unrelated package/task changes. `git hash-object CHANGELOG.md` remains
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. No ARL-03 blocker or required follow-up;
  full workspace verification remains assigned to ARL-10.

### Task ARL-04: Enforce nested field policy for composite distinct values

Status: completed

Kind: defect

Priority: P1 — a readable container can return denied descendants through distinct.

Suggested agent: field-policy/query-surface implementer; fresh session.

Dependencies: ARL-03.

Primary ownership:

- `packages/access-router/src/services/service.ts` (`authorizeDistinctField`, `distinct`).
- Private request-policy/schema evaluation helper as needed; distinct integration tests.

Finding: Exact top-level allowlist membership permits `distinct('profile')` when
`profile.read` is true, even if `profile.sub.secret` is false. The raw distinct object
contains the denied field, unlike normal output. ART-05 covers flat dotted descendants
accidentally authorizing a parent; it does not cover restrictive `.sub` on an allowed parent.

References: `packages/access-router/src/services/service.ts` (`authorizeDistinctField`);
`src/core-shared.ts` (`collectSchemaFields`); `src/helpers/sort-policy.ts` (`isFieldAllowed`);
`test/distinct-field-authorization.integration.test.ts`.

Requirements:

1. Authorize the complete value returned by distinct. Reject composite paths when
   request authority cannot prove whole-value disclosure, rather than silently trimming
   values and changing distinct equivalence/counts. Record precise scalar/container,
   embedded-array, Mixed/Map and document-dependent rule decisions before implementation.
2. Preserve explicit scalar-child permission controls, configured operation gates, row
   filters, casting and virtual exclusion. Backend output grants do not authorize distinct.
3. Update public guidance for the tightened composite contract.

Acceptance criteria:

- Direct GET/POST/root distinct cannot return denied nested object/array fields; compare
  with ordinary reads. Rejection occurs before distinct persistence.
- Fully authorized safe values and explicitly allowed scalar children retain their
  documented results; conditional/nested rules fail closed without unsafe fallback.

Verification: shared checks 1–4; distinct field authorization and route/root policy tests.

Decisions/findings during implementation:

- This fresh isolated session owns ARL-04 only, with no nested delegation. ARL-01/02/03
  are completed; initial worktree inspection confirmed their edits and concurrent
  unrelated package/task changes. The overall record remains `in_progress`.
- Confirmed the repository parent and existing `_tmp-arl-health` with `ls`; `git
check-ignore -v _tmp-arl-health` resolves to `.gitignore`'s `_tmp*` rule. The initial
  `CHANGELOG.md` blob matches the recorded baseline. Fixture-producing checks use
  `TMPDIR=<repo-root>/_tmp-arl-health`; dependency builds remain serialized.
- Admission contract, recorded before implementation: distinct returns Mongo's whole
  values and count unchanged. Its requested path needs an explicit request `read` rule
  (flat dotted or nested `.sub`); descendant-only grants never authorize a container.
  Ordinary scalar identity retention remains implicit. Known persisted scalar types,
  references as scalar IDs, and recursively scalar arrays remain eligible. A typed
  object/single-nested document/embedded document array additionally requires complete
  request authority over every declared returned descendant, with the ordinary shared
  ancestor/flat-rule precedence. Missing/denied descendants reject the entire operation
  before distinct dispatch, even if a filter would happen to select only safe values.
- Open-value decisions: Mixed, arrays containing Mixed, whole Maps, unknown schema types,
  recursive/unbounded object schemas, and non-strict composite schemas cannot prove a
  complete safe raw value and reject. This includes an otherwise fully granted finite
  container containing one of those values. Explicitly granted, schema-typed scalar Map
  keys (or finite typed values at named keys) may qualify independently; Mixed descendants
  cannot claim a scalar type from their current stored value. Metadata paths/ancestors,
  protected declared descendants and registered virtual values/containing composites
  reject rather than being stripped after Mongo has computed distinct equivalence.
- Conditional-rule decision: use the shared field-rule extractor and static request
  classifier for both scalar and composite admission. Boolean grants and permission
  expressions already satisfied by the original actor can prove disclosure; missing
  document grants and all callable field rules cannot. Do not call a field function with
  fabricated empty document grants to infer unconditional disclosure. This deliberately
  tightens the old scalar-callback behavior too; migrate request-only callback decisions
  into `globalPermissions` plus a declarative field permission key. No document hooks,
  output grants or prior output handles authorize distinct. Evaluation/catalog failures
  fail closed with no permissive allowlist retry. Update the two existing callback-based
  distinct controls to this contract while retaining their request/actor isolation checks.
- Keep generated operation guards, read row policy, filter validation/casting, virtual
  filter removal and the existing raw distinct result/count semantics at their current
  shared boundaries. ARL-02's parser and ARL-03's include provenance remain preserved.
- Pre-fix reproduction after the serialized five-package dependency build: **66 failed /
  41 passed, 107 tests across 3 files, zero collection errors**. The new real-Mongo suite
  accounts for **65 failed / 32 passed (97 tests)**; the tightened existing scalar-callback
  control fails once, and all three declarative request-key/root controls pass. Restricted
  plain/single-nested objects, embedded arrays and deeper array containers leak raw private
  values through GET/POST/root/trusted paths while ordinary reads trim them. Denials observe
  actual model and collection distinct calls. Explicit `.sub` scalar children wrongly
  reject, and a transient permission-check exception retries and authorizes on its second
  call. Full-authority/equivalence, native scalar and row/casting/literal controls pass.
  Fixture calibration respected existing virtual/stored-name collision validation (the
  stale virtual value is raw-inserted only for its test) and wire filters' rejection of
  boolean `false` (terminal literal-false input is tested through the trusted service).
- Necessary same-boundary coverage: a raw distinct container can also carry a stale
  policy-named descendant removed from the current Mongoose schema. The proof must inspect
  relevant declared permission descendants as well as typed schema descendants; an unknown,
  denied or conditional policy branch cannot disappear from admission merely because the
  catalog omits it. Add raw-stored stale-key regressions plus complete `.sub` and recursive
  schema controls before the first implementation build.
- Expanded final red run against the still-unmodified built runtime: **70 failed /
  42 passed, 112 tests across 3 files** (**69 failed / 33 passed, 102 new tests**), zero
  collection/setup errors. The three stale-policy cases and recursive-container case
  reproduce unsafe distinct success; the additional complete-`.sub` positive control passes.
- Initial green: **122 passed**, including all 102 new tests and 20 existing distinct/
  request-boundary tests. The package typecheck and its serialized dependency build pass
  after correcting the captured virtual-registry argument's TypeScript shape. Same-boundary
  review identified embedded discriminator variants as another incomplete composite proof:
  their extra fields need not appear in the base schema catalog. Reject variant-dependent
  composite values; preserve an explicitly permitted scalar child only when every registered
  variant also declares a scalar shape at that path. Add a real variant regression before
  implementing that final shape check.
- Variant red reproduction: **2 failed / 0 passed / 102 skipped (104 total)**. Actual
  embedded discriminator rows leak an extra private field through the composite, and a
  discriminator overriding a base scalar with Mixed leaks an object through the apparent
  scalar child. Ordinary reads omit the uncatalogued private field. The final shape proof
  must inspect all registered scalar variants and reject discriminator-bearing composites.

Completion evidence:

- Changed exactly these ARL-04 paths:
  - `packages/access-router/src/acl/distinct-field-authorization.ts` — new package-private
    schema/value proof using the existing field catalog, rule extractor and static request
    classifier. It checks complete typed values and named policy descendants, handles
    explicit `.sub` paths and typed Map keys, preserves scalar identity/reference/array
    values, and rejects unprovable open/recursive/discriminator composites and protected
    or virtual-containing values. Common discriminator scalar paths are checked against
    every registered variant; a Mixed override cannot inherit scalar eligibility.
  - `packages/access-router/src/services/service.ts` — replace top-level allowlist-only
    admission and its permissive catch/retry with that shared whole-value proof. All entry
    paths deny before query generation/distinct dispatch. No document/field callbacks or
    backend output authority participate. Existing raw Mongo results/counts, read row
    policy, casting, operation guards and virtual filter exclusion remain enforced.
    Public `distinct` JSDoc states the tightened contract; ARL-03 source edits are preserved.
  - `packages/access-router/test/distinct-composite-authorization.integration.test.ts` —
    **104 real-Mongo tests**, including GET/POST/root/trusted object/embedded-array denial,
    ordinary-read comparisons, explicit scalar children, complete raw-value controls,
    metadata, conditional/error cases, Mixed/Map, stale policy keys, recursive schemas,
    discriminator variants, backend-output isolation and row/casting/literal controls.
  - `packages/access-router/test/field-helper-request-boundaries.integration.test.ts` —
    require request-proven distinct fields without synthetic document grants or callbacks;
    keep actor, helper/output, configuration-refresh and populate isolation controls.
  - `packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts` —
    express its dynamic request decision as a declarative permission key, preserving the
    allowed/denied caller and deterministic root-entry controls under the new contract.
  - `packages/access-router/README.md` — shipped “Distinct: whole-value request
    authorization” contract and callback migration guidance, with a precise `.sub` example.
    ARL-01/02/03 documentation edits remain intact.
  - `docs/tasks/20261012-165209-access-router-long-term-health.md` — ARL-04 decisions,
    verification and completion only; overall status remains `in_progress`.
- Acceptance outcomes: all four entry paths reject partially allowed plain/single-nested
  objects, embedded arrays and deeper array containers with **zero observed model distinct,
  collection distinct, find, findOne, countDocuments or aggregate calls**. Ordinary reads
  return only public descendants. Conditional, metadata and transient-error cases also
  reject before persistence without evaluating field/document hooks or retrying permission
  checks. Full-value controls retain **two** raw distinct objects with the same public
  field but different authorized private fields, rather than collapsing them to one;
  explicitly allowed scalar children retain **one** distinct public value. Native/scalar
  arrays, IDs, typed Map keys, complete `.sub` grants and empty closed objects pass. Row
  scope, numeric casting, terminal denials and ARL-02 literal equality pass, as do the
  original ART-05 flat-dotted, generated-operation/root, virtual and ARL-03 provenance tests.
- Commands ran from `<repo-root>`. Every build, Vitest and typecheck invocation used
  `TMPDIR=<repo-root>/_tmp-arl-health` and `npm_config_workspace_concurrency=1`; those
  invocations ran serially. Vitest also used
  `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries` and
  `MONGOMS_PREFER_GLOBAL_PATH=false`. ESLint/Prettier used the same repository-local TMPDIR.
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed** before
    red. The first implementation build exposed TS2559 at the captured virtual-registry
    argument; the explicit typed argument correction passed both subsequent typecheck
    builds, including the final five-package dependency rebuild below.
  - Red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/distinct-composite-authorization.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/arf12-root-distinct.authorization.integration.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl04-red.xml`
    — **70 failed / 42 passed, 112 tests, 3 files**, zero collection/setup errors after
    the fixture calibration described above; **69 failed / 33 passed** in the 102-test
    new suite, plus one tightened callback-contract failure among 10 existing tests.
  - Initial green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/distinct-composite-authorization.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/arf12-root-distinct.authorization.integration.test.ts test/distinct-field-authorization.integration.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl04-green.xml`
    — **122 passed / 0 failed, 4 files passed**, before adding the two variant controls.
  - Variant red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/distinct-composite-authorization.integration.test.ts -t 'discriminator composite' --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl04-variant-red.xml`
    — **2 failed / 0 passed / 102 skipped (104 total)** before the final variant proof.
  - Final green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/distinct-composite-authorization.integration.test.ts test/distinct-field-authorization.integration.test.ts test/arf12-root-distinct.authorization.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts test/model-router.routes.integration.test.ts test/root-router.integration.test.ts test/root-router.variants.integration.test.ts test/virtuals-route-parity.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/service-authorization-rows.integration.test.ts test/service-denial-contract.test.ts test/virtual-filter-literals.integration.test.ts test/virtual-filter-parser.unit.test.ts test/include-source-provenance.integration.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl04-final.xml`
    — **632 passed / 0 failed / 0 skipped, 16 files passed**, exactly **104 new + 528
    existing** tests. This includes all 61 ARL-02 parser/literal tests and all 80 ARL-03
    source-provenance tests against the final implementation.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — final serialized dependency
    rebuild and package `tsc --noEmit` **passed**, zero type errors.
  - `pnpm exec eslint packages/access-router/src/acl/distinct-field-authorization.ts packages/access-router/src/services/service.ts packages/access-router/test/distinct-composite-authorization.integration.test.ts packages/access-router/test/field-helper-request-boundaries.integration.test.ts packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts`
    — **5 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/acl/distinct-field-authorization.ts packages/access-router/src/services/service.ts packages/access-router/test/distinct-composite-authorization.integration.test.ts packages/access-router/test/field-helper-request-boundaries.integration.test.ts packages/access-router/test/arf12-root-distinct.authorization.integration.test.ts`
    — **5 files passed** after formatting corrections.
  - `git diff --check` — **passed**. Both new files and this task record were also checked
    with `git diff --no-index --check -- /dev/null <repo-relative-file>`; no whitespace
    diagnostics (normal new-file difference exit 1).
- Confirmed the new public method JSDoc survives in
  `packages/access-router/dist/parsers-B4Vj2BM_.d.ts` and
  `packages/access-router/dist/parsers-B4Vj2BM_.d.mts`; the private proof/shape helpers are
  absent from public declarations. Mongo fixtures were removed by suite teardown, and
  the four temporary JUnit reports were removed after evidence capture. Final worktree
  review preserved ARL-01/02/03 and concurrent unrelated package/task changes.
  `git hash-object CHANGELOG.md` remains `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
  No ARL-04 blocker or required follow-up; full workspace gates remain assigned to ARL-10.

### Task ARL-05: Own mutable data values and isolate returned rows

Status: completed

Kind: defect

Priority: P2 — cached reference data can change across requests or make decoration fail.

Suggested agent: in-memory data ownership implementer; fresh session.

Dependencies: ARL-04.

Primary ownership:

- `packages/access-router/src/options/manager.ts`, runtime data assignment/snapshot boundary.
- `packages/access-router/src/services/data-service.ts` and data response shaping.
- Options ownership/data snapshot tests and related documentation.

Finding: General option cloning preserves non-plain instances. Data Date/Buffer/Map
values can alias caller-owned storage; picked nested plain values alias frozen snapshots.
Mutating a native leaf changes later responses, while in-place nested decoration may
throw on frozen data. ART-10/ARH-11 assert snapshot ownership but current mutation tests
exercise top-level copies, not server-side nested/native aliasing.

References: `packages/access-router/src/options/manager.ts` (clone/freeze ownership);
`src/services/data-service.ts` (constructor, find/findOne); `test/options-ownership.test.ts`;
`packages/utils/src/pick.ts` (selection retains leaf references).

Requirements:

1. Define supported data values and implement a data-specific copy boundary for ingress,
   option-getter exposure and returned rows. Preserve native types deliberately. Do not
   deep-clone arbitrary hook functions, Mongoose models or general runtime instances.
2. Detach selected/page-only outputs before trusted decoration or caller mutation. Keep
   configuration-time dataset ownership and coherent in-flight versions on replacement;
   no whole-dataset clone per request. Record unsupported-value behavior explicitly.
3. Preserve request-only DataService field/selection semantics and output ordering.

Acceptance criteria:

- Original data, getter snapshots, direct service results and decorators cannot mutate
  later responses through nested objects/arrays or supported mutable native leaves.
- Nested in-place decoration works on detached output. Concurrent readers and data
  replacement remain coherent. Existing no-per-request-dataset-copy instrumentation passes.
- Meaningful copy/work assertions show only returned rows are detached during reads.

Verification: shared checks 1–4; options ownership, data snapshot/router and new native-value tests.

Decisions/findings during implementation:

- This fresh isolated session owns ARL-05 only, with no nested delegation. ARL-01 through
  ARL-04 are completed; initial worktree inspection confirmed their edits and concurrent
  unrelated package/task changes. The overall record remains `in_progress`.
- Confirmed the repository parent and existing `_tmp-arl-health` with `ls`; `git
check-ignore -v _tmp-arl-health` resolves to `.gitignore`'s `_tmp*` rule. Fixture-producing
  checks use `TMPDIR=<repo-root>/_tmp-arl-health` and serialized dependency builds. The
  initial `CHANGELOG.md` blob matches `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Data contract, recorded before implementation: configured `data` is an ordinary array
  (or undefined to clear it) of acyclic values. Support plain objects, including null
  prototypes; ordinary/sparse arrays; null/undefined, strings, booleans, numbers and bigint;
  and exact built-in Date, Buffer, Map, Set, RegExp, fixed non-shared ArrayBuffer, DataView
  and the standard numeric/bigint typed arrays. Copy Map keys/values and Set entries
  recursively; preserve Date timestamps, RegExp source/flags/lastIndex and binary bytes.
  Binary views/Buffer own only their visible byte window in independent backing storage;
  aliases between distinct views/backing buffers are not part of the contract. Repeated
  references within one ordinary copy may remain shared, but each returned row is independent.
- Own enumerable string-keyed object/array properties are data. Materialize accessors once
  at ingress (retaining ARH-11's counting-accessor control); ignore non-enumerable plain
  properties. Reject cycles, functions/symbol values or symbol keys, proxies, arbitrary
  classes/native subclasses, custom native properties, WeakMap/WeakSet/Promise and other
  unsupported instances, shared/resizable/detached binary storage. Fail synchronously with
  a path-bearing TypeError before replacing valid data/options; do not serialize or silently
  retain unsupported mutable instances. These rules apply only inside `data`, not hooks,
  Mongoose models, schemas, loggers or runtime handles in general options.
- Copy boundary: clone/validate data on assignment, including pre-frozen caller input.
  Keep a package-private owned dataset and a reusable public snapshot. Public plain
  containers stay frozen; a native-valued property returns a fresh detached native copy
  on each access, including mutable nested Map/Set contents. Getter/native identity is
  therefore not stable. This protects getters and `router.options` without copying a whole
  dataset on every options read or service construction; retain existing ARH-11 snapshot
  identity assertions. DataService captures the corresponding private version once and
  deep-detaches only final selected/page-returned values, before any response decoration.
  Generic option cloning and the request-only field/empty-selection rules remain intact.
- Required same-boundary findings: generic nested setters only preserve plain-object roots,
  so a `data.<index>...` update can discard the array. Give data setters an array-aware
  copy-on-write path; route bootstrap data restoration through the same admission boundary.
  Buffer copies must use independent (unpooled) backing memory: merely copying a slice
  into Node's shared pool still permits mutation through `.buffer` to reach another copy.
  Preserve coherent old/new data versions across these replacement paths. Native support
  is an in-process ownership contract; normal Express JSON serialization is unchanged.
- Pre-fix reproduction after the serialized five-package dependency build: **117 failed /
  12 passed, 129 tests across 3 files, zero collection errors**. The new 120-test suite
  contributes **117 failures / 3 controls passing**; all nine existing ownership/scaling
  tests pass. Original/getter/direct-result native mutations alter later readers; native-only
  decoration leaks mutations even when a hook rejects; nested in-place decoration fails
  through all eight direct/root list/read paths. Pre-frozen containers also retain mutable
  plain descendants. Nested setters replace arrays with objects, bootstrap data aliases,
  unsupported values are retained (plain cycles overflow), and selected Map copy work is
  zero instead of one. Calibrated root fixtures to the existing root endpoint/`args` envelope
  before the recorded red run. ARH-11 still measures **20 reads / 2,000 rows / 0 source
  payload getter reads**, establishing the no-whole-dataset-copy preservation baseline.

Completion evidence:

- Changed exactly these ARL-05 paths:
  - `packages/access-router/src/options/data-values.ts` — data-only admission/copy codec,
    reusable frozen public views with copy-on-access native properties, and private owned
    versions. Own supported native state and Map/Set contents; compact binary copies have
    independent backing storage. Unsupported values produce path-bearing TypeErrors.
  - `packages/access-router/src/options/data-manager.ts` — data-specific OptionsManager
    subclass admitting assignment, array-aware nested replacement and bootstrap restoration
    before publishing data. Generic option cloning/identity rules remain at the existing manager.
  - `packages/access-router/src/runtime.ts` — use the specialized data manager and document
    safe snapshot exposure. Unrelated option updates and getters reuse the stored data view.
  - `packages/access-router/src/services/data-service.ts` — capture the private version
    corresponding to the service's options, then detach after request trimming/selection
    and list pagination. The existing data response pipeline receives independently mutable
    outputs before `decorate`/`decorateAll`; no extra per-request dataset copy is introduced.
  - `packages/access-router/src/interfaces/root.ts` — shipped `DataRouterOptions.data`
    ownership, native support, rejection, getter and replacement JSDoc.
  - `packages/access-router/test/data-value-ownership.test.ts` — **120 regressions/controls**.
  - `packages/access-router/README.md` and `packages/access-router/llms.txt` — supported data,
    snapshot/native identity, binary view, unsupported-value and service/decorator contracts,
    including ordinary HTTP serialization and explicit replacement guidance.
  - `docs/tasks/20261012-165209-access-router-long-term-health.md` — ARL-05 decisions,
    evidence and status only; the overall record remains `in_progress`.
- Acceptance outcomes: original and pre-frozen input containers are detached; all eight
  snapshot/getter surfaces (plus exact nested leaf getters) protect live data. Object/array
  and **18 native type** controls cover find/findOne/findById, including caller mutation of
  retained results. Native-only decorators and a rejecting decorator cannot poison later
  reads. Nested mutation succeeds on all **eight direct/root list/read paths**, with list
  `decorateAll` also mutating native/nested outputs. Map object keys/aliases and shared-source
  rows remain isolated; Buffer/view `.buffer` mutation cannot reach configured storage.
  Primitive values, sparse arrays, null prototypes and single-evaluation accessors survive.
  **21 unsupported-value cases** reject atomically through full and nested data setters;
  non-array datasets reject, undefined clears, and bootstrap restoration owns/validates data.
  Two deterministically held readers retain the old version while a replacement reader sees
  the new version; output mutation in one held reader leaves its peer intact. Existing
  request-only field/empty-intersection, route, root, sort and runtime-isolation tests pass.
- Copy/work measurements on **2,000 rows**, each with selected, omitted and denied tagged
  payloads/Maps: pages **1 / 7 / 19** make exactly **1 / 7 / 19 trims**, **1 / 7 / 19 tagged
  selected-payload copy traversals** and **1 / 7 / 19 selected Map copies**. Omitted/denied
  payload copies are **zero**. Each selected findOne/findById/single-row list makes **one**
  tagged payload/Map copy. Missing reads, empty lists, denied sort/terminal filters, repeated
  options/snapshot reads and unrelated option updates make **zero** tagged payload/Map
  copies. ARH-11 retains stable snapshot references and **20 first-row reads / 2,000 nested
  rows / 0 original payload getter reads**. These are operation/copy counts, not timing claims.
- Commands ran from `<repo-root>`. Builds, Vitest and typecheck were serialized and used
  `TMPDIR=<repo-root>/_tmp-arl-health` plus `npm_config_workspace_concurrency=1`. The final
  runtime gate additionally used `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries`
  and `MONGOMS_PREFER_GLOBAL_PATH=false`. ESLint/Prettier used the same repository-local TMPDIR.
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed** before
    red and after implementation. Both typecheck invocations also rebuilt all five packages.
  - Red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/data-value-ownership.test.ts test/options-ownership.test.ts test/data-service-scaling.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl05-red.xml`
    — **117 failed / 12 passed, 129 tests, 3 files**, zero collection errors after fixture
    calibration. Initial green with the same command and `--outputFile=<repo-root>/_tmp-arl-health/arl05-green.xml`
    — **129 passed / 0 failed**.
  - Final green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/data-value-ownership.test.ts test/options-ownership.test.ts test/data-service-scaling.test.ts test/data-service-hot-path.test.ts test/data-router.test.ts test/field-helper-removal.contract.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/root-router.integration.test.ts test/runtime-isolation.integration.test.ts test/runtime-permission-handoff.integration.test.ts test/sort-options.integration.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl05-final.xml`
    — **362 passed / 0 failed / 0 skipped, 11 files passed**, exactly **120 new + 242 existing**.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — final dependency rebuild and
    package `tsc --noEmit` **passed**, zero type errors. The initial tsc invocation exposed
    TS2322 on inference of the empty frozen array; explicitly typing that empty input as
    `never[]` corrected it before the final rebuild/runtime gate.
  - `pnpm exec eslint packages/access-router/src/options/data-values.ts packages/access-router/src/options/data-manager.ts packages/access-router/src/runtime.ts packages/access-router/src/services/data-service.ts packages/access-router/src/interfaces/root.ts packages/access-router/test/data-value-ownership.test.ts`
    — **6 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/options/data-values.ts packages/access-router/src/options/data-manager.ts packages/access-router/src/runtime.ts packages/access-router/src/services/data-service.ts packages/access-router/src/interfaces/root.ts packages/access-router/test/data-value-ownership.test.ts`
    — **6 files passed** after formatting corrections.
  - `git diff --check` — **passed**. Also checked the three new TypeScript files and this
    task record with `git diff --no-index --check -- /dev/null <repo-relative-file>`; no
    whitespace diagnostics (normal new-file difference exit 1).
- The new public ownership JSDoc survives in `packages/access-router/dist/parsers-C08GqNph.d.ts`
  and `packages/access-router/dist/parsers-C08GqNph.d.mts`. The private data manager/copy/owned
  snapshot helpers are absent from public declarations. Mongo fixtures were removed by suite
  teardown; temporary JUnit reports were removed after evidence capture. Worktree inspection
  preserved ARL-01 through ARL-04 and concurrent unrelated package/task changes.
  `git hash-object CHANGELOG.md` remains `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
  No ARL-05 blocker or required follow-up; full workspace checks remain assigned to ARL-10.

### Task ARL-06: Honor basic data-list selection and sorting

Status: completed

Kind: defect

Priority: P2 — accepted GET options silently fail and pagination returns the wrong page.

Suggested agent: data route usability implementer; fresh session.

Dependencies: ARL-05.

Primary ownership:

- `packages/access-router/src/routers/data-router.ts` GET collection handler.
- Basic data-list route regression tests and shipped request examples as needed.

Finding: The GET data-list schema accepts `select` and `sort`, but its handler drops
both. Advanced data lists and basic model lists forward them. Existing basic-list-sort
tests cover model routes; ART-04 covers advanced/root data sorting.

References: `packages/access-router/src/routers/data-router.ts` (GET collection handler);
`src/validation/model-router.ts` (`listQuery`); `src/routers/model-router-collection-routes.ts`;
`test/basic-list-sort.integration.test.ts`.

Requirements:

1. Forward normalized selection/sorting into the existing DataService authorization and
   sort-before-pagination path, with consistent GET/advanced semantics.
2. Retain validation, field/sort denial, filtered totals, finite limits and route guards.

Acceptance criteria:

- GET selection omits other allowed fields, sort precedes pagination, and valid GET and
  advanced queries return equivalent results. Denied sort fields/malformed syntax reject.
- Omitted options and filtered totals retain their documented behavior.

Verification: shared checks 1–4; focused basic-list/data router integration tests.

Decisions/findings during implementation:

- This fresh isolated session owns ARL-06 only, with no delegation. ARL-01 through ARL-05
  are completed; initial worktree inspection confirmed their edits and concurrent unrelated
  package/task changes. The overall record remains `in_progress`.
- Confirmed the repository parent and existing `_tmp-arl-health` with `ls`; `git
check-ignore -v _tmp-arl-health` resolves to `.gitignore`'s `_tmp*` rule. Fixture-producing
  checks use `TMPDIR=<repo-root>/_tmp-arl-health` from the repository root; dependency builds
  remain serialized. The initial `CHANGELOG.md` blob matches
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Confirmed the current ARL-05 DataService captures its owned snapshot and detaches only
  selected/page-returned values. The defect is confined to GET collection argument
  forwarding: reuse the model GET route's existing `parseSelectParam` for comma/whitespace/
  repeated selection parameters and pass the validated signed-field sort string unchanged
  to `DataService.find`. Its shared sort parser/authorization, filter/count ordering,
  pagination bounds and page-only detachment remain the enforcement points.
- Preserve data's request-only selection contract: an empty allowed-token intersection
  (including empty, exclusion-only or denied-only selection) means no additional projection
  after request field trimming. GET and advanced lists retain their separate operation
  gates and the same base `list` field/filter policy. No parser or service API is added.
- Pre-fix reproduction after the serialized five-package dependency build: **19 failed /
  8 passed, 27 tests, 1 file**, zero collection/setup errors. Advanced POST controls returned
  the expected projections, sorted pages and 400 errors before each GET comparison. GET
  retained other allowed fields, paginated configuration order, and returned 200 for
  denied/unknown or malformed sort fields. Omitted options, empty-intersection compatibility,
  empty-page totals, repeated-sort validation and terminal/operation-denial controls passed;
  the gate parity test failed only on its allowed GET's discarded selection/sort.

Completion evidence:

- Changed exactly these ARL-06 paths:
  - `packages/access-router/src/routers/data-router.ts` — take `select` and `sort` from
    the validated GET list query and forward `select: parseSelectParam(select)` plus `sort`
    to the existing `DataService.find` path, matching model GET parsing conventions.
  - `packages/access-router/test/basic-data-list.integration.test.ts` — **27 focused HTTP
    regressions/controls** for GET/advanced projection and ordering parity, comma/whitespace/
    repeated selection syntax, string/object/tuple sort equivalents, filtered totals and
    headers, empty pages, configured/default finite caps, denial/validation and operation gates.
  - `packages/access-router/README.md` — shipped equivalent GET/advanced request examples
    and data-list selection/sort/count behavior, preserving the earlier ARL documentation.
  - `docs/tasks/20261012-165209-access-router-long-term-health.md` — ARL-06 decisions,
    verification and completion only; the overall record remains `in_progress`.
- Acceptance outcomes: selecting `name` omits other allowed fields; requesting a denied
  field alongside permitted fields cannot expose it. Ascending/descending and multi-field
  sorts run before both skip/limit and page/page_size pagination, including ordering by
  unselected fields. GET and advanced responses/metadata agree. The seven-row fixture
  returns **five authorized matches**, **two rows per sorted page**, and total/count headers
  of **5 / 2**; empty pages retain total **5**. Decorators receive only the selected returned
  rows. A configured cap of **2** holds with omitted/oversized limits; the default cap returns
  **1,000 / 1,001** rows in requested order. Denied/unknown/malformed sorts return **400**
  with matching errors and **zero decorator calls**. Repeated sort parameters reject before
  list policy; denied basic/advanced gates return **401** before validation/filter/decorate,
  while the other variant remains usable. Terminal row denial remains **403**. Omitted
  options and empty/exclusion-only/denied-only selection retain existing trimmed output.
- Commands ran from `<repo-root>`. Build, typecheck and Vitest invocations were serialized
  with `TMPDIR=<repo-root>/_tmp-arl-health` and `npm_config_workspace_concurrency=1`. Final
  Vitest also used `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries` and
  `MONGOMS_PREFER_GLOBAL_PATH=false`; ESLint/Prettier used the same repository-local TMPDIR.
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed** before
    red. The typecheck command below rebuilt that same closure after the fix, before green.
  - Red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/basic-data-list.integration.test.ts`
    — **19 failed / 8 passed, 27 tests, 1 file**, zero collection/setup errors. Failures
    reproduced discarded GET options; advanced POST positive/negative controls passed.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — **5-package serialized
    rebuild and package `tsc --noEmit` passed**, zero type errors.
  - Green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/basic-data-list.integration.test.ts test/basic-list-sort.integration.test.ts test/data-router.test.ts test/data-service-hot-path.test.ts test/data-service-scaling.test.ts test/data-value-ownership.test.ts test/options-ownership.test.ts test/field-helper-removal.contract.test.ts test/sort-field-authorization.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts`
    — **336 passed / 0 failed / 0 skipped, 10 files passed**, exactly **27 new + 309 existing**
    tests. This includes the ARL-05 ownership, page-only-copy and snapshot-reuse regressions,
    existing data field/empty-intersection contracts, basic model sorting and route guards.
  - `pnpm exec eslint packages/access-router/src/routers/data-router.ts packages/access-router/test/basic-data-list.integration.test.ts`
    — **2 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/routers/data-router.ts packages/access-router/test/basic-data-list.integration.test.ts`
    — **2 files passed** after formatting the new suite.
  - `git diff --check` — **passed**. Also checked the new test and this task record with
    `git diff --no-index --check -- /dev/null <repo-relative-file>`; no whitespace diagnostics.
- Confirmed the temp directory with `ls`/`git check-ignore` before fixture creation. Suite
  teardown removed Mongo fixtures; `_tmp-arl-health` retains only its pre-existing `.gitkeep`
  and `node-compile-cache/`. Final worktree review preserved ARL-01 through ARL-05 and
  concurrent unrelated package/task work. `git hash-object CHANGELOG.md` remains
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. No ARL-06 blocker or required follow-up;
  full workspace integration remains assigned to ARL-10.

### Task ARL-07: Share hook admission across request/runtime output work

Status: completed

Kind: defect

Priority: P2 — independent root/include calls multiply the advertised hook resource ceiling.

Suggested agent: async scheduling/resource-governance implementer; fresh session.

Dependencies: ARL-06.

Primary ownership:

- `packages/access-router/src/helpers/concurrency.ts`, `src/helpers/request-work.ts`.
- Shared hook gate transport in service/subdocument/output/data paths as applicable.
- `src/request-complexity.ts`, concurrency regression tests and resource-limit docs.

Finding: `maxHookConcurrency` is documented per request/runtime, but each service list/read
constructs a separate SharedHookGate. Three root lists with a limit of two can admit six
independent getter bodies. VIRT tests cover one list and its traversal; ABB-04 fixes shared
**persistence** admission, not this separate pool.

References: `packages/access-router/src/services/service.ts` (SharedHookGate creation);
`src/helpers/request-work.ts`; `src/helpers/concurrency.ts` (`SharedHookGate`);
`src/request-complexity.ts` (`maxHookConcurrency`); `src/routers/root-router.ts` (`runGroup`).

Requirements:

1. Record an enforceable scheduling contract before implementation: request/runtime-owned
   admission for independent hook work, coherent captured limits, finite nested work,
   and explicit semantics for trusted hooks that await another service call.
2. Preserve supported recursive service-in-hook calls at limit one; do not hold a
   non-reentrant permit across descendants and deadlock. If recursively waiting callback
   frames are accounted as an admitted chain rather than simultaneous leaf work, name
   and document that distinction precisely and bound independent descendant fan-out.
3. Use private request/runtime ownership, FIFO/error-safe release and stable output order.
   Keep hook and persistence pools separate; do not claim a process-wide connection limit.
4. Cover the actual document-grant/virtual/data hook applicability in types and docs;
   remove misleading broader claims rather than silently exempting affected paths.

Acceptance criteria:

- Deterministic root-batch and correlated/include tests measure the shared independent
  hook peak at/below the configured limit; error/rejection paths release admission.
- Separate requests/runtimes do not share pools; concurrent entry paths share the owning
  pool. Limit-one nested service calls complete and descendant fan-out obeys the recorded
  bound, without bypassing persistence limits or changing output association.
- Existing virtual/subdocument/data and nested persistence tests pass.

Verification: shared checks 1–4; deterministic concurrency tests plus affected virtual,
root, correlated/subdocument and data regression tests. Record measured peaks/work counts.

Decisions/findings during implementation:

- This fresh isolated session owns ARL-07 only, without delegation. ARL-01 through ARL-06
  are completed; initial worktree inspection confirmed their edits and concurrent unrelated
  package/task work. The overall record remains `in_progress`.
- Confirmed the repository parent and existing `_tmp-arl-health` with `ls`; `git
check-ignore -v _tmp-arl-health` resolves to `.gitignore`'s `_tmp*` rule. Fixture-producing
  checks use `TMPDIR=<repo-root>/_tmp-arl-health` from the repository root, with serialized
  builds/tests/typecheck. The initial `CHANGELOG.md` blob matches
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Scheduling/accounting contract, recorded **before runtime implementation**: the private
  request-object/runtime WeakMap owns one hook admission gate and a separate persistence
  scheduler. Capture both normalized concurrency limits together when this work state is
  first used; existing owners retain that capture after configuration/ambient-runtime
  changes, and new requests capture the new configuration. Root entries, independent
  services, legacy/correlated includes, populate and embedded/subdocument outputs use the
  owning pool, with index-keyed output/context association preserved.
- A hook permit counts an **admitted chain**, not every unsettled callback frame. Calls
  originating outside a live same-owner hook frame acquire a root permit FIFO. A hook may
  await another service call: that call's hook stages reuse the chain through private async
  context. Each frame admits **one immediate child branch at a time**, FIFO through its
  entire descendant drain; independent sibling fan-out never receives a blanket reentry
  bypass. At most `maxHookConcurrency` independent leaf branches are admitted. Ancestors
  awaiting those branches still exist and are not separately counted against that limit.
  Limit-one sequential recursion and `Promise.all` service descendants therefore complete
  with serialized child hooks. User-created cross-branch dependency cycles are not supported.
- Enforce a fixed private maximum of **64 nested admission scopes per chain**, including
  internal hook-stage wrappers; exceeding it rejects through existing hook error handling.
  This bounds retained reentrant depth separately from client template/structure limits.
  A settled frame closes to new reentry; already-queued children drain before its branch
  releases, even on synchronous throw/rejection. Detached continuations of a closed frame
  must acquire normal root admission. Child/root queues transfer permits directly without
  queue jumping. Arbitrary trusted recursion, queued work, or direct DB/network fan-out is
  not made safe merely by setting a concurrency limit; application hooks must await their
  work and avoid dependency cycles.
- Hook applicability: model document-grant hooks (output, helper/owning-parent and pre-write
  stages), virtual getters, model/data `decorate`/`decorateAll` chains and service output
  decorator callbacks, plus data request-field selection/trimming stages. Data has no model
  virtual/document-grant family. Row/traversal maps retain finite **per-call** worker bounds;
  they are not a global bound on waiting orchestration frames. Other guards, row/identifier
  filters, model field-rule callbacks and write lifecycle hooks are outside this hook pool.
  Leaf adapter/document persistence alone uses `maxBulkConcurrency`; hooks/orchestration
  hold no persistence permits. Neither pool bounds process-wide connections or query totals.
- Necessary same-task findings: output/helper document grants can currently omit a gate,
  pre-write and owning-subdocument grants call hooks directly, data response decoration uses
  an independent row map, and data services do not capture a runtime owner. Wire these
  applicability paths to the same private state, preserving existing grant failure policy,
  projected source inputs, target/scope authorization and page-only data shaping.
- Calibrated pre-fix red reproduction after the five-package dependency build: **17 failed /
  4 passed, 21 tests across 2 files**, zero collection/setup errors. Three root lists
  measured **6** simultaneous virtual/grant/decorate callbacks at limit **2** (whole-list
  decorators **3**); correlated and legacy includes measured **6**, and mixed model/data
  output measured **6**. Nested service fan-out at both configured limits **1** completed
  on the old per-call gates but measured leaf peak **2**. Rejection/recovery controls also
  exposed peak **2** at limit **1**. A naive single semaphore's unit control cannot admit
  even its first recursive leaf, and the request state has no shared hook gate. Ordinary
  FIFO/order and separate-request/runtime controls passed. Fixture calibration corrected
  a test syntax error and respected existing uncaught decorator errors (caught explicitly
  by the custom service recovery route instead of assuming per-entry root 500 envelopes).
- Necessary wiring/type review also found `src/acl/subdocument-output.ts`'s dedicated
  parent-grant gate. Its authenticated binding now supplies the owning pool for parent
  grants and scoped child finalization. Added explicit root subdocument, pre-write grant,
  same-request/different-runtime, captured model/data limits, output-helper/Core/data stage,
  data-to-model reentry, and depth-overflow failure-policy controls. Existing opaque
  authorization bindings retain actual runtime identity at these private service boundaries.
- Initial corrected runtime gate: **29 new tests passed**. Measured same-request runtime
  pools **1 + 2** alongside another request's independent **1**; model/data helper stages
  share peak **2**. Limit-one nested service cases retain **3 callback frames / 1 leaf**,
  with **26 document reads + 52 field-metadata row checks = 78 persistence operations**
  at persistence peak **1**. The initial 26-total test expectation was corrected to include
  those existing metadata queries. The 64-scope overflow control omits the overflowing
  virtual through its normal failure policy and recovers on the same request pool.
- The common FIFO transfer primitive is reused by separate hook-root/child pools and the
  persistence scheduler; `RequestConcurrencyScheduler.work` itself remains persistence-only.
  Strengthened error tests require parent and child scopes to drain an already-admitted
  failing grandchild before siblings/root waiters advance; strengthened HTTP ordering holds
  the first root's row while another root completes its getters.
- The 26-file preservation gate produced **577 passed / 1 failed (578 tests)**. The sole
  failure was the existing canonical-finalizer test configuring only its private per-call
  `concurrencyLimit: 2` while its runtime retained the default **10**. Under the recorded
  ownership contract, authenticated finalization must use the runtime capture. Update that
  control to configure runtime **2**, deliberately supply a conflicting local **99**, and
  require actual peak **2**; also replace its millisecond delay with an event-loop barrier.
  All new tests and existing virtual/subdocument/data, include provenance, nested persistence,
  root/correlated, runtime-isolation and mutation regressions passed in that run.
- Final ownership review identified a necessary retained-service edge: `Base` hook delegates
  and `DataService` still dereference mutable `req.macl`/`req.dacl` slots, so a same-request
  runtime handoff can send an existing service's callbacks into the replacement core's hook
  pool despite its captured concurrency limits. Add an actual model-decorator/data-service
  handoff regression. Retain the originating core for those service delegates and invoke it
  in its captured runtime, keeping independent admission and the matching hook configuration.
- Retained-service red: **1 failed / 2 skipped** in `request-hook-ownership.test.ts`.
  With owning limits **1 / 2**, all callbacks entered the replacement runtime and measured
  active pools **0 / 2** instead of **1 / 2**. `Base` now retains its core for model
  decorators/document-grant/output-helper delegates, and `DataService` retains its data
  core; those delegates restore their captured runtime during option lookup/invocation.
  Extend the control to model grants/helpers as well as model/data decoration and data
  selection, so the final test requires **seven callbacks per owner** in separate pools.

Completion evidence:

- Delivered the recorded **request/runtime-owned hook-chain** contract. One private
  WeakMap-owned gate shares admission across independent services/root entries/includes
  and scoped output. Root and child queues transfer permits FIFO; each frame admits one
  child branch through descendant drain. Limit-one service reentry works without an
  unrestricted sibling bypass. Waiting ancestors are extra callback frames, not extra
  permits; a chain has at most **64 admission scopes**, including internal wrappers.
  Settled frames close to reentry, drain queued descendants on success/error, and require
  late detached work to acquire root admission. Both concurrency limits are captured
  together; the persistence pool remains separate and persistence-only.
- Changed these ARL-07 implementation paths (all under `packages/access-router/src/`):
  - `helpers/concurrency.ts`, `helpers/request-work.ts` — shared FIFO primitive, bounded
    reentrant async frames, private owner state and coherent limit capture.
  - `services/base.ts`, `services/service.ts`, `services/data-service.ts` — use captured
    owner limits/gates; retain originating cores for model output/grant hooks and data
    service delegates across request-core handoff. Service decorators also use admission.
  - `core.ts`, `core-data.ts`, `acl/hook-runner.ts` — admit document grants, model/data
    decorator chains and data field-selection/trimming stages; preserve hook failure policy.
  - `acl/output-field-filter.ts`, `acl/model-input-admission.ts`, `acl/subdocument-output.ts`,
    `output/finalize-model-output.ts` — authoritative binding-owned admission for output,
    helper, pre-write and owning-parent grants plus virtual/embedded/populate finalization.
    Authenticated finalizers cannot replace the owner pool with a per-call gate/limit;
    standalone unbound internal finalizer fixtures retain their local test seam.
  - `request-complexity.ts` — shipped resource JSDoc names counted chains, waiting frames,
    applicable hook families, finite reentry, FIFO/drain semantics and separate budgets.
- Added `packages/access-router/test/hook-admission-fixture.ts` and three deterministic
  suites: `test/hook-concurrency.test.ts` (**6** tests), `test/request-hook-concurrency.test.ts`
  (**21** tests), `test/request-hook-ownership.test.ts` (**3** tests), with test paths in this
  sentence relative to `packages/access-router`. The route suite uses actual routers,
  Mongoose queries and authorization/finalization, replacing only collection I/O as in the
  existing persistence-admission suite. Updated the existing canonical-finalizer concurrency
  control in `packages/access-router/test/service-authorization-finalizer.unit.test.ts` to
  configure runtime admission and reject a conflicting local limit as an override.
- Measured acceptance outcomes:
  - Three independent four-row root lists: virtual, document-grant and per-row decorator
    peaks **6 → 2** at limit **2**; whole-list decorators **3 → 2**. Root entry and row order
    remain stable even while the first root's first getter waits for another root's getters.
  - Correlated and legacy include targets: **9 rows / 18 grant+getter calls**, peak **6 → 2**;
    each parent retains its own target rows, private joins/source fields stay hidden.
  - Mixed model/data output: **4 getters + 12 data field stages + 8 per-row decorators +
    2 whole-list decorators**, shared peak **6 → 2**. Three dedicated subdocument lists
    execute **3 owning-parent grants + 6 scoped getters** at peak **2**. Three root updates
    execute **6 separate pre/post-write grants** and **3 update operations**, each pool peak **1**.
  - Nested service calls from virtual/grant/decorator hooks at both limits **1**: **18 leaf
    callbacks**, peak **2 → 1**, while **3 callback frames** coexist as one chain. Each case
    executes **26 document reads + 52 metadata row checks = 78 persistence operations** at
    persistence peak **1**. Nested output handles still authorize same-target picks.
  - Scheduler fan-out controls execute **27 leaves** at configured peaks **1 / 2**, with
    corresponding waiting-frame peaks **3 / 6**. Data field/decorate/decorateAll reentry
    executes **12 / 6 / 3** nested leaf hooks respectively, each hook/persistence peak **1**.
  - Same-request runtime pools measure **1 + 2** alongside another request's independent
    **1**. The retained model/data-service handoff measures **1 / 2** after previously routing
    all work to the replacement pool (**0 / 2**); each owner executes exactly **7** callbacks.
    Existing captures retain their limits after runtime/ambient changes; new requests use
    replacements. Overflow stops at **64** scopes, omits the overflowing virtual, and the
    next operation on the same request succeeds. Sync throws, rejected descendants, queued
    siblings, closed-context reentry and recovery release admission without FIFO bypass.
- Updated shipped `packages/access-router/README.md`, `packages/access-router/llms.txt`
  and `website/docs/packages/access-router/configuration.mdx` to match the implemented
  applicability/accounting contract. Existing ARL-01 through ARL-06 edits remain present.
- Verification commands ran from `<repo-root>`. Every build, Vitest and typecheck used
  `TMPDIR=<repo-root>/_tmp-arl-health` and `npm_config_workspace_concurrency=1`, with those
  commands serialized. The final/preservation Vitest commands additionally used
  `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries` and
  `MONGOMS_PREFER_GLOBAL_PATH=false`; ESLint/Prettier used the same TMPDIR.
  - Dependency closure: `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages
    passed** before the calibrated red reproduction. Final typecheck below rebuilt the same
    closure after the retained-core correction and before the final runtime gate.
  - Red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hook-concurrency.test.ts test/request-hook-concurrency.test.ts`
    — **17 failed / 4 passed, 21 tests, 2 files**, zero collection/setup errors after fixture
    calibration; peaks and naive-semaphore deadlock exposure are recorded above.
  - Additional retained-service red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/request-hook-ownership.test.ts -t 'retains service hook owners'`
    — **1 failed / 2 skipped**, exposing **0 / 2** instead of **1 / 2** owning pools. After the
    correction, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/request-hook-ownership.test.ts`
    — **3 passed**; these controls also pass in the final gate.
  - Final green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hook-concurrency.test.ts test/request-hook-concurrency.test.ts test/request-hook-ownership.test.ts test/concurrency.test.ts test/request-persistence-concurrency.test.ts test/service.internal.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-route-parity.integration.test.ts test/virtuals-hardening.boundary.test.ts test/virtuals-performance.probe.test.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-final-review.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-mutations.integration.test.ts test/include-source-provenance.integration.test.ts test/correlated-includes.execution.test.ts test/root-router.integration.test.ts test/data-service-hot-path.test.ts test/data-service-scaling.test.ts test/data-value-ownership.test.ts test/data-router.test.ts test/runtime-isolation.integration.test.ts test/basic-data-list.integration.test.ts`
    — **579 passed / 0 failed / 0 skipped, 26 files passed**, exactly **30 new + 549 existing**
    tests. Existing virtual/populate/embedded/subdocument, root/correlated, data ownership/
    paging, source-provenance, target/row authorization and nested persistence regressions pass.
    The earlier 578-test run's sole per-call-limit fixture mismatch was corrected as described
    above; its focused rerun (`pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-finalizer.unit.test.ts`)
    passed **45 tests** before the final complete gate.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — final **5-package dependency
    rebuild and package `tsc --noEmit` passed**, zero type errors. Intermediate wiring errors
    (opaque binding runtime typing and a stale subdocument `hookGate` argument) were corrected
    before the passing checks; no typecheck blocker remains.
  - `pnpm exec eslint packages/access-router/src/helpers/concurrency.ts packages/access-router/src/helpers/request-work.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/data-service.ts packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/src/acl/hook-runner.ts packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/acl/model-input-admission.ts packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/request-complexity.ts packages/access-router/test/hook-admission-fixture.ts packages/access-router/test/hook-concurrency.test.ts packages/access-router/test/request-hook-concurrency.test.ts packages/access-router/test/request-hook-ownership.test.ts packages/access-router/test/service-authorization-finalizer.unit.test.ts`
    — **18 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/helpers/concurrency.ts packages/access-router/src/helpers/request-work.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/data-service.ts packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/src/acl/hook-runner.ts packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/acl/model-input-admission.ts packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/request-complexity.ts packages/access-router/test/hook-admission-fixture.ts packages/access-router/test/hook-concurrency.test.ts packages/access-router/test/request-hook-concurrency.test.ts packages/access-router/test/request-hook-ownership.test.ts packages/access-router/test/service-authorization-finalizer.unit.test.ts`
    — **18 files passed** after applying formatting patches.
  - `git diff --check` — **passed**. Also checked the four new fixture/test files and this
    task record with `git diff --no-index --check -- /dev/null <repo-relative-file>`; no
    whitespace diagnostics (normal new-file difference exit 1).
- Inspected `packages/access-router/dist/parsers-CjtOIYBT.d.ts` and the matching `.d.mts`:
  resource JSDoc retains the chain/64-scope/capture contract. Private request-state access,
  async-frame storage and FIFO implementation are absent from public declarations/exports;
  no request/DTO reentry token was added.
- Confirmed the temp parent and `_tmp*` ignore rule before fixture creation. Suite teardown
  removed Mongo fixtures; `_tmp-arl-health` contains only its pre-existing `.gitkeep` and
  `node-compile-cache/`. Final worktree review preserved prior ARL and concurrent unrelated
  package/task edits. `git hash-object CHANGELOG.md` remains
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. **No ARL-07 blocker or required follow-up**;
  overall status remains `in_progress`. Documentation reorganization and workspace-wide
  integration remain assigned to ARL-09 and ARL-10 respectively.

### Task ARL-08: Return bounded numeric grouped counts instead of document ID sets

Status: completed

Kind: improvement

Priority: P2 — ordinary count includes can exceed Mongo BSON limits and memory budgets.

Suggested agent: Mongo aggregation/business counting implementer; fresh session.

Dependencies: ARL-07.

Primary ownership:

- `packages/access-router/src/services/service.ts` grouped count executor/API.
- `packages/access-router/src/services/base.ts` count include attachment and private
  prepared-count transport; grouped-count tests, relevant public types and docs.

Finding: Exact counts currently aggregate `$addToSet: '$_id'`, transfer all matching
target IDs to Node, and union them for each source. One number can require a BSON document
over 16 MB. ART-06 fixed pagination undercounts and ABB-05 casting, but tests use small
target sets and measure query count, not aggregate result size.

References: `packages/access-router/src/services/service.ts` (`countByFieldValues`,
`countPreparedByFieldValues`); `src/services/base.ts` (legacy count include union);
`test/grouped-count-casting.integration.test.ts`.

Requirements:

1. Compute exact numeric counts in Mongo per bounded requested parent/key group. A target
   matching several keys of one parent counts once; one target may count for many parents.
   Aggregate result size must scale with requested groups, not matching target IDs.
2. Preserve one grouped aggregate per legacy count-include execution, casting/setter/alias
   behavior, row policy and mandatory joins, terminal denial, and pagination independence.
3. Deliberately align the public `countByFieldValues` contract with real counts (or an
   explicitly named replacement) and update callers, declarations, fixtures and migration
   guidance. Do not silently reinterpret an ID-set API or expose private prepared tokens.
4. Bound request-derived group inputs and avoid one query per parent or an application-side
   scan of target IDs. Record the chosen API/aggregation design before implementation.

Acceptance criteria:

- Scalar/array join tests verify per-parent distinct-document counts, overlapping keys,
  normalized aliases, ACL/casting errors and totals above list/pagination limits.
- A bounded long-string-ID fixture demonstrates large matching-ID volume without returning
  ID arrays; measured aggregate result size/work is group-bounded and query count remains one.
- Public installed type consumers and existing count/related authorization regressions pass.

Verification: shared checks 1–4; grouped-count/casting/include tests, API type fixtures,
and instrumented real-Mongo aggregate result-size regression (record measurements).

Decisions/findings during implementation:

- This fresh isolated session owns ARL-08 only, with no delegation. ARL-01 through
  ARL-07 are completed. Initial worktree inspection identified their existing edits
  and concurrent unrelated package/task changes. The overall record stays `in_progress`.
- Read repository/task instructions, shared verification rules, ARL-08 criteria and
  the ART-06/ABB-05 baseline evidence. Confirmed the repository parent and existing
  `_tmp-arl-health` with `ls`; `git check-ignore -v _tmp-arl-health` resolves to the
  `.gitignore` `_tmp*` rule. The initial `CHANGELOG.md` blob matches the baseline.
  Fixture-producing checks use `TMPDIR=<repo-root>/_tmp-arl-health` and dependency
  builds run serially. API and private aggregation decisions will be recorded here
  before implementation after inspecting the current callers and regression seams.
- Public API decision, recorded before implementation: retain the discoverable name
  `Service.countByFieldValues(foreignField: string, values: readonly unknown[],
filter: Filter<TModel> = {}, access: BaseFilterAccess = 'list')`, deliberately changing
  its result to `Promise<SingleResult<Map<string, number>> | ErrorResult>`. Each distinct
  original `String(value)` alias gets its own exact numeric document count, including
  explicit zero for misses. First occurrence wins for equal original aliases, retaining
  the existing canonical-key rule; different aliases that cast to the same key receive
  equal counts. Array-valued foreign fields count a document once for each requested
  alias. Per-key counts must not be summed to obtain a multi-key union. No ID-set
  compatibility method remains. Update shipped migration guidance and installed
  Bundler/NodeNext/Node16 ESM/CJS consumers with positive numeric and negative Set cases.
  Retain request row access (default `list`, explicit `count` for count policy), filter
  validation, no public authorization-options argument, and no prepared capability export.
- Private aggregation decision, recorded before implementation: snapshot bounded parent
  groups into unique original key operands plus per-parent operand-index lists. A public
  per-key call uses singleton groups; legacy include execution uses one complete group
  per receiving row, with positional numeric results. Cast the complete authorized match
  and the independent unique foreign operands through the owning adapter; map casts back
  to every group before execution. Keep the mandatory join intersection and prepared
  receiver/execution binding. One pipeline first matches authorized joined targets, then
  projects away target `_id` and maps each target to the bounded group ordinals whose
  cast keys intersect its scalar/array foreign values. Unwind only those group ordinals
  and `$group` by ordinal with `$sum: 1`. Duplicate local/foreign keys and overlapping
  keys cannot multiply one target within a group; the same target can increment multiple
  groups. Return only `{ _id: <group ordinal>, count: <number> }` rows, fill absent groups
  with zero, and attach through ARL-03's existing explicit provenance function. No target
  ID arrays, per-parent aggregate, target-ID scan, or pagination stage is used.
- Bounds decision, recorded before implementation: fixed per-execution ceilings of
  **1,000 groups**, **10,000 key occurrences before deduplication**, **64 KiB per key**,
  and **1 MiB cumulative key payload**, checked on both original and schema-cast operands
  (including expansion back into groups). Bound foreign paths to 1,024 UTF-8 bytes and
  structured key values to depth 8 / 20,000 visited nodes. Reject excess/malformed inputs
  as controlled BadRequest before aggregate dispatch; never truncate or split execution.
  Check sizes before cloning/flattening large inputs and own inputs before awaited row
  hooks. Scalar/native BSON equality keys and bounded literal values retain schema casting;
  executable/regex operands are not equality join keys. Terminal false policies still
  skip schema casting/persistence. Limits are explicit fixed API constraints, independent
  of list pagination and not new authorization or configurable bypass options.
- Pre-fix reproduction after the serialized five-package build: **21 failed / 2 passed /
  18 unrelated type cases skipped (41 collected), zero collection errors**. The new
  runtime suite has **16 failed / 2 passed (18 tests)**; all five installed numeric API
  consumers fail on the actual Set return/readonly-input declarations. Existing small
  counts are numerically correct but return ID arrays; input bounds and mutation ownership
  fail. The 10,000-key positive control also exposes the old path's incidental snapshot
  limit before deduplication, rather than a documented group-input bound.
- Definitive pre-fix size reproduction: **144 targets × 131,072-byte string IDs =
  18,874,368 matching-ID bytes**, verified by a numeric `$strLenBytes`/`$sum` query.
  The actual legacy include makes **one aggregate**, fails with Mongo **10334**:
  `Serializing Document failed ... Size 18875732 exceeds maximum 16793600`, and returns
  HTTP **500**. No long-ID result reaches its post-aggregate observer. The same 144
  targets with short IDs return **5,122 BSON bytes** at the aggregate boundary. A fixture
  calibration first showed that a bare raw-collection `$group` probe can permit an
  oversized document on this Mongo version; the regression now exercises the real
  include pipeline and uses only numeric volume measurement as its reference query.
- Initial implementation verification: **126 passed / 3 failed, 129 tests across
  6 files**. All **106 runtime tests** and all **five ARL-08 installed numeric type
  modes** pass. The long-ID include now returns **three 25-byte numeric documents,
  100 BSON bytes including the result-array wrapper, one aggregate, HTTP 200**; its
  144-short-ID control also returns 100 bytes. The package typecheck passes after
  changing the result discriminator to explicit `=== false` for this package's
  compiler settings (the first declaration build exposed that narrowing error).
- Broader gate handoff to existing ARL-09 ownership: the three failures are the
  pre-existing subdocument consumer fixture's misplaced `@ts-expect-error` directives,
  not count declarations. `packages/access-router/test/service-authorization-consumer.types.fixture.ts`
  has comments at lines 295/299/307, while TS reports the intended invalid child paths
  at 297/305/312; Bundler and NodeNext ESM/CJS each report three unused directives plus
  the three real path errors. `git diff --` for that fixture is empty. ARL-09 already
  owns existing installed-consumer checks: relocate those directives without weakening
  the negative path assertions, then rerun that existing gate in its fresh session.
  ARL-08's dedicated type fixture is also wired into the normal packed consumer matrix;
  focused real-tarball installs verify its five module modes at minimum/current peers.
- Necessary count-input boundary follow-up within ARL-08: an additional malformed-key
  regression reproduced an uncaught `TypeError` from an unstringifiable null-prototype
  key (**1 failed / 18 skipped**). Keep pre-clone size/structure checks, own each key
  before alias conversion, and map synchronous snapshot/BSON/string failures to a
  controlled count-input BadRequest. Persistence rejections remain outside that catch.

Completion evidence:

- Changed exactly these ARL-08 paths (retaining inherited ARL-01..07 hunks):
  - `packages/access-router/src/services/grouped-count.ts` — new private bounded
    group/operand snapshot and cast-expansion validation. Groups hold operand indices,
    never target IDs. Limits precede unbounded flattening/cloning; original aliases,
    first-occurrence semantics, one-level local flattening and native values are owned
    before asynchronous policy hooks. Malformed/oversized inputs produce BadRequest.
  - `packages/access-router/src/services/service.ts` — accurately typed/documented
    `countByFieldValues` numeric Map API, explicit zero misses, readonly input and
    authority-argument rejection. The private per-parent executor casts the complete
    authorized match and independent join operands, projects only matching group
    ordinals using `$setIntersection`, unwinds those ordinals and counts with `$sum: 1`.
    No target-ID accumulation, transfer or application-side scan remains in this path.
  - `packages/access-router/src/services/base.ts` — bounded complete key groups per
    parent, one prepared grouped dispatch, positional numeric attachment through ARL-03
    provenance; removed the per-parent target-ID Set union. Input errors use the existing
    controlled include error boundary. Read/list matching and terminal-denial omission
    retain their prior contracts.
  - `packages/access-router/src/acl/service-execution.ts` and
    `packages/access-router/src/acl/prepared-query.ts` — private grouped executor data
    contract now accepts the bounded group plan and returns `SingleResult<number[]>`;
    authenticated receiver/query/execution binding and false-denial dispatch remain.
  - `packages/access-router/test/grouped-count-numeric.integration.test.ts` — **19
    real-Mongo tests**, including scalar/array overlap, raw/cast bounds, input ownership,
    literal dollar keys, invalid native/structured values and instrumented BSON volume.
  - `packages/access-router/test/grouped-count-consumer.types.fixture.ts` — public
    package-name imports, typed numeric Maps via router/request/public services, readonly
    inputs and negative Set/authority/private-executor assertions.
  - `packages/access-router/test/strict-consumer-types.test.ts` and
    `packages/access-router/test/packed-consumer-compatibility.test.ts` — five installed
    module modes and two focused real-tarball peer matrices; the same new fixture is
    also included in the normal packed NodeNext/Node16/Bundler consumer gates.
  - `packages/access-router/test/grouped-count-casting.integration.test.ts`,
    `packages/access-router/test/service.internal.test.ts`,
    `packages/access-router/test/service-authorization-prepared-query.unit.test.ts`,
    `packages/access-router/test/service-authorization-rows.integration.test.ts`, and
    `packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`
    — migrated package-owned numeric result/dispatch fixtures while retaining the actual
    ART-06/ABB-05 alias, setter, independent-cast, mandatory-join and denial assertions.
  - `packages/access-router/README.md` and `packages/access-router/llms.txt` — shipped
    numeric count API, explicit Set-to-number migration, non-additive per-key counts,
    private parent-union execution, fixed input bounds and count row-access guidance.
  - `docs/tasks/20261012-165209-access-router-long-term-health.md` — ARL-08 contract,
    findings, evidence and status; overall status remains `in_progress`.
- Acceptance outcomes:
  - Scalar and duplicate-array joins count each target once per parent, including parents
    with overlapping keys and distinct aliases normalizing to one value. The same target
    counts independently for several parents. Counts exceed target hard limit 2 and
    ignore include limit 1 / skip 100 / page 50 / pageSize 1. Empty groups/misses are zero.
  - All **41 ABB-05 real-Mongo casting tests** pass: ObjectId/String directions, upper/
    lower aliases, setters, array unions, tenant/region filters, direct/root read/list,
    cast failures and one aggregate for 1/24/40 parents. Invalid operands/filters and
    operation/terminal denials perform **zero target persistence**. Adapter tests retain
    synchronous receiver-preserving casts without count middleware and preserve the
    original aggregate-rejection identity.
  - Raw **1,001 groups**, **10,001 duplicate keys**, oversized individual/cumulative
    keys and setter expansion reject before aggregate dispatch. Inclusive **1,000-group**
    and **10,000-key** controls pass in one aggregate. Caller mutation inside an awaited
    row hook cannot alter the captured alias/group. The added native/structured negative
    cases now return controlled BadRequest instead of an uncaught TypeError.
  - All **80 ARL-03 source-provenance tests**, **38 include metadata tests**, **26 related
    authorization tests**, prepared row-scope/mandatory-join tests, cross-resource,
    correlated, virtual/include, denial and persistence-admission regressions pass.
    Successful counts still use explicit attachment provenance; false target rows still
    omit legacy output and cannot revive private source fields.
  - Definitive size/query measurements: **144 × 131,072-byte IDs = 18,874,368 matching-ID
    bytes**. The pre-fix real include failed with Mongo **10334**, document size
    **18,875,732** above **16,793,600**, HTTP **500**, **one aggregate**. The corrected
    include returns **HTTP 200**, counts **[144, 144, 144, 0, 0]** for five requested groups,
    **three numeric result rows × 25 BSON bytes**, **100 BSON bytes including the array
    wrapper**, **one model/collection aggregate**, and **zero target find/findOne/count
    executions**. Both **one short-ID target** and **144 short-ID targets** also return
    **100 BSON bytes / three rows / one aggregate**. The reference volume query returns
    numbers only; measurements are reset before each include. No timing threshold or
    production-scale benchmark is used.
- Exact commands/results, from `<repo-root>`:
  - Builds, typechecks and Vitest ran serially with `TMPDIR=<repo-root>/_tmp-arl-health`
    and `npm_config_workspace_concurrency=1`. Build logs confirm the five dependency
    packages completed one at a time. Vitest also used
    `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries` and
    `MONGOMS_PREFER_GLOBAL_PATH=false`; lint/format checks used the same TMPDIR.
  - `pnpm --filter @web-ts-toolkit/access-router... build` — baseline **5 packages
    passed**. The first implementation build caught the discriminator narrowing issue
    recorded above; the subsequent and final typechecks rebuilt all five successfully.
  - Red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-numeric.integration.test.ts test/strict-consumer-types.test.ts -t 'ARL-08' --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl08-red.xml`
    — **21 failed / 2 passed / 18 skipped, 41 collected, zero collection errors**.
  - Instrumented BSON red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-numeric.integration.test.ts -t 'matching string IDs'`
    — **1 failed / 17 skipped**, actual aggregate **10334** and measurements above.
  - Initial green/broader fixture finding: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-numeric.integration.test.ts test/grouped-count-casting.integration.test.ts test/service.internal.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/strict-consumer-types.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl08-initial-green.xml`
    — **126 passed / 3 pre-existing unrelated fixture failures, 129 tests, 6 files**.
  - Additional malformed-key red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-numeric.integration.test.ts -t 'unstringifiable'`
    — **1 failed / 18 skipped**, then corrected and covered by the final runtime gate.
  - Final runtime green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-numeric.integration.test.ts test/grouped-count-casting.integration.test.ts test/service.internal.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-final-review.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/include-source-provenance.integration.test.ts test/include-permission-metadata.integration.test.ts test/cross-resource-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/virtuals-populate-include.integration.test.ts test/arc21-projection-identity-and-count-argument.contract.test.ts test/filter-denial.integration.test.ts test/service-denial-contract.test.ts test/request-persistence-concurrency.test.ts --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl08-final-runtime.xml`
    — **493 passed / 0 failed / 0 skipped, 17 files**, exactly **19 new + 474 existing**.
  - Final installed API green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/packed-consumer-compatibility.test.ts -t 'ARL-08' --reporter=junit --outputFile=<repo-root>/_tmp-arl-health/arl08-final-consumers.xml`
    — **7 passed / 0 failed / 26 unrelated cases deselected, 2 files**. Five strict
    module-mode checks plus packed **Express 5.0.0 / Mongoose 8.0.0** and **Express 5.2.1 /
    Mongoose 9.8.0** matrices, each covering Bundler and NodeNext/Node16 ESM/CJS. Current
    peers also check the full declaration graph with `skipLibCheck: false`.
    This command additionally used `pnpm_config_workspace_concurrency=1`,
    `pnpm_config_store_dir=<repo-root>/_tmp-arl-health/pnpm-store`,
    `pnpm_config_cache_dir=<repo-root>/_tmp-arl-health/pnpm-cache`,
    `pnpm_config_state_dir=<repo-root>/_tmp-arl-health/pnpm-state`, and
    `npm_config_cache=<repo-root>/_tmp-arl-health/npm-cache`. Verified pnpm's actual store
    resolves inside the repository with the `pnpm_config_store_dir` setting.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed twice**, including
    the final implementation; each rebuilt the five-package closure and completed
    package `tsc --noEmit` with zero type errors.
  - `pnpm exec eslint packages/access-router/src/services/grouped-count.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/prepared-query.ts packages/access-router/test/grouped-count-numeric.integration.test.ts packages/access-router/test/grouped-count-consumer.types.fixture.ts packages/access-router/test/grouped-count-casting.integration.test.ts packages/access-router/test/service.internal.test.ts packages/access-router/test/service-authorization-prepared-query.unit.test.ts packages/access-router/test/service-authorization-rows.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts`
    — **14 files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/services/grouped-count.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/prepared-query.ts packages/access-router/test/grouped-count-numeric.integration.test.ts packages/access-router/test/grouped-count-consumer.types.fixture.ts packages/access-router/test/grouped-count-casting.integration.test.ts packages/access-router/test/service.internal.test.ts packages/access-router/test/service-authorization-prepared-query.unit.test.ts packages/access-router/test/service-authorization-rows.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts`
    — **14 files passed** after formatting patches.
- Inspected emitted `packages/access-router/dist/parsers-D0BMcj4N.d.ts` and `.d.mts`:
  numeric Map/readonly input/migration/bounds JSDoc survives emission. Group-plan data,
  constructors and prepared executor issuers are absent from public declarations;
  the private method remains private. No public transport token or new export is added.
- No ARL-08 implementation blocker remains. The unrelated pre-existing consumer
  annotation issue above is a concrete handoff to ARL-09's existing verification scope;
  that fixture was not edited. Full workspace gates remain assigned to ARL-10.
- Final `git diff --check` **passed**. The three new source/test/consumer files and this
  task record also passed whitespace inspection with
  `git diff --no-index --check -- /dev/null <repo-relative-file>` (no whitespace
  diagnostics). Final `git hash-object CHANGELOG.md` matches the baseline:
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Verified the ignored temp parent before fixture creation. Suite teardown removed
  Mongo and installed-consumer fixtures; temporary JUnit reports were removed after
  evidence capture. `_tmp-arl-health` retains only `.gitkeep`, the pre-existing
  `node-compile-cache/`, and repository-local `pnpm-cache/`, `pnpm-state/`, `pnpm-store/`
  caches. Final worktree inspection preserved prior ARL work and concurrent unrelated
  changes, including additional concurrent access-router test edits outside the inventory
  above. Only ARL-08 is newly completed; the overall record remains `in_progress`.

### Task ARL-09: Make installed-package entry paths and option layers discoverable

Status: completed

Kind: improvement

Priority: P2 — onboarding currently requires traversing extensive advanced migration prose.

Suggested agent: public API/documentation usability implementer; fresh session.

Dependencies: ARL-08.

Primary ownership:

- `packages/access-router/README.md`, `llms.txt`, highest-value public JSDoc.
- Relevant website docs for consistency; existing documentation/consumer/export fixtures.

Finding: The README's Quick Start begins near baseline line 929, after hundreds of lines
of advanced authorization/migration details nested under Highlights. `llms.txt` repeats
over 500 lines rather than indexing the shipped guide. Main factory declarations have
little guidance. `skim` remains accepted but canonical model operations no longer branch
on it; `maxOrderGroups` limits both group count and order value, which its name alone hides.

References: `packages/access-router/README.md` (Highlights/Quick Start); `llms.txt`;
`src/index.ts` (`createAccessRuntime`, factory types); service option interfaces/defaults;
`src/interfaces/root.ts`, `src/routers/root-router.ts` (`maxOrderGroups`).

Requirements:

1. Put a short correct happy path, canonical imports and navigation before advanced
   contracts. Preserve detailed security/business/migration information in the shipped
   README with useful anchors; avoid a second contradictory copy in llms.txt.
2. Add a compact configuration map: global/runtime, model defaults, model/data/root router,
   per-operation defaults, wire args/options, and trusted per-call authority. Explain
   setter/snapshot behavior, scope and precedence; align with completed ARL changes.
3. Retain meaningful distinctions (`operationAccess`/`permissionSchema`/authorization,
   `select`/grants, `baseFilter`/`overrideFilter`, `idParam`/`idField`/resolver,
   root/hook/persistence concurrency). Record naming-review decisions, rather than
   renaming coherent concepts for style. Clearly deprecate/document verified no-op `skim`
   and explain `maxOrderGroups`' actual bound; do not reintroduce skippable authorization.
4. Document main runtime/factory and changed count APIs in emitted declarations. Keep
   existing public entrypoints, correct CJS/ESM/types metadata, peer requirements and
   package-boundary imports. Update affected website references only for consistency.
5. Resolve ARL-08's recorded subdocument consumer-fixture handoff: relocate the three
   misplaced `@ts-expect-error` directives in
   `packages/access-router/test/service-authorization-consumer.types.fixture.ts` onto
   the actual invalid child-path expressions. Preserve every meaningful negative path
   assertion and pass the complete strict-consumer and packed-consumer matrices.
6. Correct the onboarding examples' client-header-derived admin grants and the claim
   that `permissionsPlugin` enables field enforcement. Use a minimal public-read or
   explicitly server-authenticated actor example and document the verified optional
   plugin role. Retain substantive executable authorization/type regressions.
7. Keep the existing strict/no-unused documentation compiler intact. Resolve any
   actual snippet diagnostics in the shipped example itself, including the ARL-08
   numeric-count helper's unused local function found by the complete ARL-09 gate.

Acceptance criteria:

- An installed consumer can locate imports, first router, framework requirements, option
  placement/precedence and advanced references directly from the packed package.
- README examples execute/compile through existing tests; root/subpath declarations and
  supported CJS/ESM and TypeScript consumer modes pass existing export/consumer checks.
- `npm pack --dry-run` includes all needed docs/dist; new JSDoc survives emission. Record
  a concrete inventory of names reviewed and decisions, not an unsupported claim of audit.

Verification: shared checks 1–5; existing documentation-examples, strict-consumer-types,
export-contract tests, emitted declaration inspection and package dry-run packing.

Decisions/findings during implementation:

- This fresh isolated session owns ARL-09 only, with no delegation. ARL-01 through
  ARL-08 are completed; their existing edits and concurrent unrelated package/task
  work were identified before editing. The overall record remains `in_progress`.
- Read repository instructions, task conventions, shared rules, full ARL-09 and the
  exact ARL-08 handoff; loaded the ai-friendly-ts-package and task-as-you-go skills.
  ARL-08's **7 passing focused installed checks** do not replace its broader gate's
  **3 failing subdocument fixtures** (Bundler and NodeNext ESM/CJS), which are now an
  explicit ARL-09 requirement above rather than a claimed passing baseline.
- Confirmed the repository parent and existing `_tmp-arl-health` using `ls`; `git
check-ignore -v _tmp-arl-health/` resolves to `.gitignore`'s `_tmp*` rule. All fixture
  work uses `TMPDIR=<repo-root>/_tmp-arl-health` (the checkout's `$PWD` at runtime).
  Initial `git hash-object CHANGELOG.md` matches
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. Build/test/typecheck/lint commands will
  run serially; repository-wide integration gates remain assigned to ARL-10.
- Reproduced the handoff after a serialized **5-package dependency build**:
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t 'SVA-10 checks installed authorization types and public boundaries'`
  with the repository-local TMPDIR produced **3 failed / 20 deselected (23 total)**.
  Each mode reported TS2578 at fixture lines 295/299/307 and TS2322 for
  `contacts.email`/`badge`/`tenantId` at 297/305/312, exactly as ARL-08 recorded.
  Moved only those comments immediately before the invalid expressions; the calls,
  invalid paths, inferred child types and positive controls are retained verbatim.
- Naming inventory/decisions from actual option interfaces and consumers:
  - Retain `GlobalOptions`/`DefaultModelRouterOptions`/`ModelRouterOptions`/
    `DataRouterOptions`/`RootRouterOptions` and method `Defaults`; document the
    runtime-bound facade versus its `.runtime` owner, shallow assignment, exact
    versus generic nested lookup, variant fallback and per-method nullish resolution.
    Data/root have no model-default layer; public upsert uses create/update public
    buckets rather than an invented `publicUpsertOptions` default.
  - Retain `operationAccess`/`permissionSchema`/trusted `authorization`,
    `select`/`alwaysSelectFields`/`dependsOn`, `baseFilter`/`overrideFilter`,
    `idParam`/`idField`/`resolveIdFilter`, request/document permission fields,
    `requestSchemas`/`validate`/`prepare`/`transform`, `populate`/`include`/`related`
    and `access`/`populateAccess`: these name distinct enforcement or lifecycle jobs.
  - Retain snake_case GET parameters and camelCase body/root fields with an explicit
    transport-placement table; `lean` belongs to service/root read/list options,
    and basic data-by-ID does not consume selection query parameters. Public HTTP
    list metadata exposure follows wire flags even if a service default computes totals.
  - Retain `maxConcurrentOperations`, `maxHookConcurrency`, `maxBulkConcurrency`
    and `maxOrderGroups`. Describe the first three's different counted units and
    captures; document `maxOrderGroups` as both distinct-group count and inclusive
    numeric order bound. No alias or configuration renaming is introduced.
  - Verified all source `skim` uses are admission/default resolution/forwarding,
    not canonical finalization branches. Deprecate accepted properties in public
    service/wire declarations; document a compatibility no-op with no authorization
    skipping. Keep `lean` and metadata switches distinct. Retain the numeric
    `countByFieldValues` name/readonly API and ARL-08 bounds, add actionable count
    hovers, and clarify the existing separate `countTrusted` predicate contract.
- Consequential documentation corrections: `packages/access-router/src/plugins.ts` implements only a
  hydrated metadata getter alias, using active/default runtime option lookup; it
  neither computes grants nor enables field enforcement. Quick Start now uses
  public reads without that plugin or client admin headers. The permission-based
  example explicitly uses a server-authenticated actor. Existing `new()` selection
  prose contradicted its ignored-exclusion contract, and the website's count text
  still described pre/post-unwind casting; align those with current implementations.
- Preserve the full shipped business/security/migration sections and the substantive
  executable Mongo authorization example. Convert `llms.txt` to linked navigation;
  move its unique Zod/defineRequestSchema and conservative processor-output examples
  into README so their existing semantic/runtime checks remain exercised. No test
  suite or meaningful negative assertion is removed, and no prose-mirroring test is added.
- First full documentation/export/strict-consumer gate after the changes: **108
  passed / 1 failed, 109 tests in 3 files**. All **23 strict-consumer** and **43
  export-contract** tests passed, including the three corrected subdocument modes.
  The sole failure was README's existing ARL-08 `countInvoiceLines` example under
  `noUnusedLocals` (TS6133): the documentation harness references top-level variables,
  not local function declarations. Make that consumer helper an explicit export
  (also in the count JSDoc example), retaining the compiler settings and numeric
  count assertions. The other **42 documentation checks** passed, including all
  complete runtime workflows and the new Quick Start's startup-order invariant.

Completion evidence:

- Installed-consumer outcome:
  - `packages/access-router/README.md` now reaches **Quick Start at line 46**
    (line **978** at this session's inherited baseline). Requirements, canonical
    imports and linked navigation precede advanced contracts. The first router is
    public-read with explicit route/field rules; server-authenticated actor and
    optional metadata-alias plugin guidance replace the misleading header/plugin examples.
  - Added the configuration-layer map, all **23 actual method-default buckets**,
    shallow assignment/dotted setters, exact/generic/variant and nullish precedence,
    capture lifetimes, wire placement, meaningful naming distinctions, deprecated
    no-op `skim`, and dual `maxOrderGroups` bounds. Preserved the detailed row/input/
    output/target/subdocument, literal-filter, include-provenance, data ownership,
    virtual, request-wide reentrant hook, numeric count and migration contracts.
  - `packages/access-router/llms.txt` is now a **38-line / 4,467-byte index**, down
    from **531 lines** at session entry. README retains **26 TypeScript blocks**,
    including **6 complete runtime workflows** and the unique moved validation/
    conservative-processor examples. The navigation inspection found **78 local
    README-anchor links / 0 unresolved anchors** across README and llms.txt.
- ARL-09 changed these TypeScript paths (JSDoc/type formatting and the annotated
  consumer fixture; inherited runtime implementation changes remain intact):
  - `packages/access-router/src/index.ts`, `packages/access-router/src/runtime.ts`,
    `packages/access-router/src/plugins.ts` — facade/owner, all three createRouter
    overloads, data/OpenAPI factories, default import, setters and optional plugin role.
  - `packages/access-router/src/interfaces/root.ts`,
    `packages/access-router/src/interfaces/base.ts`,
    `packages/access-router/src/interfaces/service.ts`,
    `packages/access-router/src/interfaces/service-find.ts`,
    `packages/access-router/src/interfaces/service-list.ts`,
    `packages/access-router/src/interfaces/service-read.ts`,
    `packages/access-router/src/interfaces/service-create.ts`,
    `packages/access-router/src/interfaces/service-update.ts`,
    `packages/access-router/src/validation/types.ts` — configuration/default/wire
    discovery, IDs/selection/metadata, root bounds and skim deprecation.
  - `packages/access-router/src/services/service.ts`,
    `packages/access-router/src/services/public-service.ts` — exact numeric count,
    legacy trusted predicate and bounded numeric Map hovers, migration/example,
    and the public new-template option's deprecation annotation.
  - `packages/access-router/test/service-authorization-consumer.types.fixture.ts` —
    moved **only three comments**, now at lines **296/304/311**, immediately above
    the same invalid expressions at **297/305/312**. The negative `contacts.email`,
    virtual `badge`, and parent `tenantId` assertions retain their inferred child
    types. All three formerly failing module modes and the complete matrices pass.
- Consistency updates: `website/docs/packages/access-router/index.mdx`,
  `configuration.mdx`, `hooks.mdx`, `routing.mdx`, and `services.mdx` in that same
  directory align public-read/authenticated actors, optional plugin, capture/default
  behavior, root bounds, source provenance and ARL-08 numeric count/casting guidance.
  The existing documentation/export/strict/packed test suites and their meaningful
  negative assertions were retained. The README count helper is explicitly exported
  to satisfy strict unused checking; no compiler rule or diagnostic was suppressed.
- Naming review above was grounded in the actual public interfaces, runtime/options
  manager, model/public service default resolvers, model/data/root route forwarding,
  identifier/filter resolution and request-work/resource contracts. Coherent names
  and the **three existing public entrypoints** were retained; no alias, export-map,
  peer range, or package build-entry change was needed.
- Commands below ran serially from `<repo-root>`. Builds, typechecks and Vitest used
  `TMPDIR=<repo-root>/_tmp-arl-health`, `npm_config_workspace_concurrency=1` and
  `pnpm_config_workspace_concurrency=1`. Mongo-using Vitest commands also used
  `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries` and
  `MONGOMS_PREFER_GLOBAL_PATH=false`:
  - `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed**
    before the exact three-fixture reproduction recorded above.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed twice**,
    including the final emitted JSDoc/example revision; each invocation rebuilt
    the **5-package closure serially** and completed `tsc --noEmit` without errors.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts test/export-contract.test.ts`
    — final **109 passed / 0 failed / 0 skipped, 3 files**: documentation **43**,
    strict consumer **23**, export contract **43**. The preceding **108/1** run and
    its actual TS6133 snippet correction are recorded above.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts`
    — complete **10 passed / 0 failed / 0 skipped, 1 file**, including the two
    ARL-08 numeric API cases, manifest/dependency/current-byte checks, both real
    tarball peer matrices, and both actual build-artifact peer matrices. It covers
    **Express 5.0.0 / Mongoose 8.0.0** and **Express 5.2.1 / Mongoose 9.8.0**;
    Bundler plus NodeNext/Node16 ESM/CJS, direct runtime imports and compiled/bundled
    Mongo authorization/helper workflows. Current peers use `skipLibCheck: false`.
    The suite also invoked `pnpm build-artifact --version 0.99.0-test` for its
    existing artifact checks; it did not invoke workspace build/test/lint gates.
    Packed installs additionally used
    `NODE_COMPILE_CACHE=<repo-root>/_tmp-arl-health/node-compile-cache`,
    `pnpm_config_store_dir=<repo-root>/_tmp-arl-health/pnpm-store`,
    `pnpm_config_cache_dir=<repo-root>/_tmp-arl-health/pnpm-cache`,
    `pnpm_config_state_dir=<repo-root>/_tmp-arl-health/pnpm-state`, and
    `npm_config_cache=<repo-root>/_tmp-arl-health/npm-cache`. With those pnpm settings,
    `pnpm store path` confirmed `<repo-root>/_tmp-arl-health/pnpm-store/v11`.
  - Total final existing-suite verification: **119 passed / 0 failed / 0 skipped
    across 4 files**. Coverage is the explicit versions/modes/workflows above.
  - `TMPDIR=<repo-root>/_tmp-arl-health pnpm exec eslint packages/access-router/src/index.ts packages/access-router/src/plugins.ts packages/access-router/src/runtime.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/base.ts packages/access-router/src/interfaces/service-find.ts packages/access-router/src/interfaces/service-list.ts packages/access-router/src/interfaces/service-read.ts packages/access-router/src/interfaces/service-create.ts packages/access-router/src/interfaces/service-update.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/validation/types.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/test/service-authorization-consumer.types.fixture.ts`
    — **15 files passed**, zero errors/warnings.
  - `TMPDIR=<repo-root>/_tmp-arl-health pnpm exec prettier --check packages/access-router/src/index.ts packages/access-router/src/plugins.ts packages/access-router/src/runtime.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/base.ts packages/access-router/src/interfaces/service-find.ts packages/access-router/src/interfaces/service-list.ts packages/access-router/src/interfaces/service-read.ts packages/access-router/src/interfaces/service-create.ts packages/access-router/src/interfaces/service-update.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/validation/types.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/test/service-authorization-consumer.types.fixture.ts`
    — **15 files passed** after correcting two comment-indent lines flagged on the first check.
- Declaration/artifact inspection:
  - `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl09-inspect.mjs` —
    one-off TypeScript-checker inspection, removed afterward. Both root/advanced/
    processors graphs resolve to **4 declaration files per module family**, including
    `packages/access-router/dist/parsers-CW8qHEJI.d.ts` / `.d.mts`. Factory/default
    import, all three router overload, plugin, dual root bound and three count-method
    hovers survive alias resolution. Numeric count is still readonly-input
    `Promise<SingleResult<Map<string, number>> | ErrorResult>`; all 23 default buckets
    are reachable. Nine inspected public/inherited skim option views carry
    `@deprecated`; direct declaration inspection confirms all **13 annotated sites**
    in each shared declaration file. ARL-07's 64-scope/captured-chain JSDoc survives.
    No `Service`, `PreparedModelQuery`, `GroupedCountInput`, `SharedHookGate` or
    `getRequestWorkState` export appears on any of the three public entrypoints.
    The same inspection produced the navigation counts above.
  - `TMPDIR=<repo-root>/_tmp-arl-health npm_config_cache=<repo-root>/_tmp-arl-health/npm-cache pnpm --filter @web-ts-toolkit/access-router exec npm pack --dry-run --json`
    — actual npm dry-run in `packages/access-router` **passed**: **17 files**,
    **487,507 packed bytes / 2,452,668 unpacked bytes**. Includes README (**156,096
    bytes**), llms (**4,467 bytes**), package.json, **6 CJS/ESM JavaScript files** and
    **8 declarations**; no source/test/fixture files. This workspace preview retains
    its expected placeholder version and workspace ranges. The passing real-tarball
    test uses the production manifest transformer: flattened entry targets, version
    `0.99.0-test`, rewritten internal ranges, license/repository/Node >=22 metadata,
    no placeholders, and current docs/declaration bytes. The actual artifact tree at
    `dist/web-ts-toolkit-0.99.0-test/packages/access-router` retains workspace-layout
    `dist/` targets and source manifest; its separate installed-consumer checks pass.
- Final `git diff --check` passed; the untracked task record was also checked with
  `git diff --no-index --check -- /dev/null docs/tasks/20261012-165209-access-router-long-term-health.md`
  without whitespace diagnostics. `git hash-object CHANGELOG.md` remains
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Verified the ignored temp parent before fixture creation. Suite teardown removed
  Mongo and installed-consumer fixtures; the one-off inspector was deleted. Only
  `.gitkeep` and repository-local Node/npm/pnpm caches remain in `_tmp-arl-health`.
  Final worktree inspection preserved ARL-01..08 and concurrent unrelated package/task
  changes. **No ARL-09 blocker or new independent follow-up remains. Only ARL-09 is
  newly completed; overall status stays `in_progress` and ARL-10 stays `pending`**
  for its fresh independent review and full workspace gates.

### Task ARL-10: Independently audit acceptance and complete integration gates

Status: completed

Kind: investigation

Priority: P1 — final release-readiness gate for all preceding authorization/business fixes.

Suggested agent: fresh independent reviewer, not any implementation session.

Dependencies: ARL-01, ARL-02, ARL-03, ARL-04, ARL-05, ARL-06, ARL-07, ARL-08, ARL-09,
ARL-11, ARL-12.

Primary ownership: complete changed access-router boundary and this task's review evidence.

Finding: Individually passing fixes can interact through captured authorization, includes,
runtime ownership, data snapshots, scheduling and public declarations. Independent review
must verify the integrated result rather than only accepting implementation summaries.

References: all preceding tasks and their actual changed files/tests/evidence.

Requirements:

1. Audit every acceptance criterion against code, runtime regressions or documentation
   evidence. Check alternate direct/root/related/subdocument paths, original hook inputs,
   private metadata/provenance, false predicates, group bounds and pool isolation.
2. Check public types, docs, implementation and packed consumers agree; examine new
   architecture for accidental global state, duplicated policy paths and unbounded work.
3. Run shared final checks 6–7 sequentially. Resolve regressions from this work. If a new
   independent fix is needed, document a follow-up task for a fresh sequential owner,
   then resume this reviewer after that task passes; do not hide it in a completion note.
4. Verify task statuses, dependency consistency, exact completion evidence, consequential
   deferrals and unchanged CHANGELOG. The coordinator then performs the final file audit.

Acceptance criteria:

- Every task criterion has concrete checked evidence; all required tasks are completed,
  with no hidden pending/blocked follow-up or inaccurate verification claim.
- Final workspace build/test/lint, relevant package typecheck and installed-consumer
  checks pass, and CHANGELOG retains its baseline blob.
- Final review records coverage, actual results and any bounded limitations.

Verification: shared checks 6–7 and independent acceptance/evidence review.

Review start:

- Fresh independent review session owns ARL-10 only; no delegation. ARL-01..09 are
  recorded completed. Their criteria, implementation, tracked and untracked tests,
  declarations and required evidence will be checked independently before sign-off.
- Initial worktree inspection identified concurrent unrelated OIDC/DPoP and request
  attestation changes and task records. Those remain under their existing owners.
- Verified the repository parent and existing `_tmp-arl-health` using `ls`, and its
  `.gitignore` `_tmp*` rule using `git check-ignore -v`. Fixture-producing commands
  use `TMPDIR=<repo-root>/_tmp-arl-health`; final workspace gates run sequentially.
- Initial `git hash-object CHANGELOG.md` matches
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. Overall status remains `in_progress`;
  coordinator final audit/sign-off is pending.

Independent findings / prerequisites:

- **Blocked on ARL-11 then ARL-12**, each assigned to a fresh, sequential implementation
  session. The reviewer has made no runtime fix. Resume independent review after their
  regressions and required checks pass. Prior ARL-01..09 completion entries remain
  historical; integrated runtime isolation and exact grouped-count acceptance are qualified
  by the concrete failures below. Final workspace gate results are recorded separately.
- After an API-harness interruption, checked running processes before resuming: no
  workspace build/test/TypeScript/Mongo fixture process remained. Reconfirmed the ignored
  repo-local temp directory and unchanged CHANGELOG. Saved command logs establish the
  earlier completed attempts; no interrupted command was assumed to have passed.
- Independent real-Mongo probe:
  `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl10-gate.mjs boundary-probe node _tmp-arl-health/arl10-boundary-probe.mjs`
  — **1 passed / 4 failed, exit 1**, all five checks executed, fixture teardown completed.
  The runner supplies repo-local Mongo/npm/pnpm/Node caches as well as TMPDIR. Evidence:
  `_tmp-arl-health/arl10-boundary-probe.log`. This is reviewer reproduction tooling;
  durable regression suites belong with each fresh owner's genuine fix.

Review evidence (audit performed; **not completion/sign-off**):

- Read the root instructions, task conventions and the complete current record. Reviewed
  the access-router tracked diffs, all **18 untracked source/test files** (**5 source,
  13 test/fixture**), and the five changed website guides. The scoped inventory is
  **51 tracked changed + 18 untracked = 69 files**, excluding this task document and
  ignored review tooling. This includes formatting-only inherited test edits and the
  unchanged enforcement/route/default helpers needed to assess the changed callers.
  SHA-256 fingerprints of the reviewed files are retained in
  `_tmp-arl-health/arl10-reviewed-files.json` for the coordinator/follow-up baseline.
- Independently traced direct service, generated GET/POST, root, legacy/correlated
  include, populate and dedicated subdocument paths through captured authorization and
  output finalization. Inspected original projected hook input, WeakMap-only include
  attachment/copy provenance and authenticated target handles; terminal false, literal
  values and mandatory ID/join intersections; whole-value distinct schema/rule proof;
  data-specific ingress/getter/page-only copying; request/runtime hook and persistence
  state, FIFO child/root release and 64-scope reentry; numeric count plans and raw/cast
  budgets. The two reproducible missed cases are ARL-11/12, not deferred prose concerns.
- Existing red/green histories were checked against the actual regressions and current
  enforcement paths. Historical deleted red reports were not regenerated by reverting
  code. The complete current package suite passed below, including all **476 new runtime
  cases** in the eleven new runnable suites (the other two new test files are fixtures).
  The independent five-case probe separately fails on the missed cases, demonstrating why
  the passing existing suite is insufficient for sign-off.

Acceptance-audit table (criteria numbered in their original order; test paths below
are relative to `packages/access-router/test/`, source paths to
`packages/access-router/src/`; all named ordinary suites ran in the passing complete
package gate):

| Task / criterion                                                        | Independently checked evidence and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARL-01 / 1 — sync/async nullish handoff                                 | **Verified.** `core-shared.ts` awaits resolution then replaces owned grants, including missing/non-callable resolvers. `runtime-permission-handoff.integration.test.ts` tests all four nullish modes and invalid/absent controls.                                                                                                                                                                                                                                                                                                                               |
| ARL-01 / 2 — model/data/root denial, reuse and application maps         | **Verified for the specified target initialization paths.** All 35 handoff tests include direct/root denial, zero target persistence/filter work, unowned granted/empty maps, held async resolution and rejection/retry. The distinct retained-service edge is now ARL-11.                                                                                                                                                                                                                                                                                      |
| ARL-01 / 3 — isolation/typecheck preservation                           | **Existing isolation suite and typecheck pass.** Independent retained-service probe disproves broader owner-authority isolation; ARL-11 is a required prerequisite.                                                                                                                                                                                                                                                                                                                                                                                             |
| ARL-02 / 1 — real Mongo literal query/mutation meaning                  | **Verified.** `virtual-filter-literals.integration.test.ts` covers bare/`$eq`/`$in` empty objects with/without virtuals, reads/count/exists, no-match updates with zero saves and create-then-update upserts. Query/value grammar in `services/base.ts` only prunes actual removals.                                                                                                                                                                                                                                                                            |
| ARL-02 / 2 — positive empty fixtures, virtual scope, denial/correlation | **Verified.** Positive fixtures explicitly use `minimize:false`; 51 Mongo plus 10 parser tests exercise literals/native operands, embedded/dotted/indexed scope, `$elemMatch`/`$not`/`$all`, dedicated child routes, false and mandatory IDs/joins. Existing correlated escape/resolver/execution/validation suites pass.                                                                                                                                                                                                                                       |
| ARL-03 / 1 — include misses cannot restore source secrets               | **Verified.** 80-test `include-source-provenance.integration.test.ts` covers nine service/direct/root paths in both lean modes, denied/unselected source fields, misses/terminal target denial and nested receivers. Only `attachIncludeOutput` records produced values.                                                                                                                                                                                                                                                                                        |
| ARL-03 / 2 — original hooks and valid collision/target handles          | **Verified.** Original restricted/private inputs and virtual dependencies survive success/empty collisions; per-row and nested target handles are checked against correct/wrong models and rows. Ordered overlapping attachments and shared-populate one-evaluation/two-copy controls pass.                                                                                                                                                                                                                                                                     |
| ARL-03 / 3 — related/virtual/metadata preservation, private transport   | **Verified.** Include metadata, service-related and virtual suites pass; source/persistence identity snapshots remain unchanged. New include state lives in a private WeakMap, with no DTO symbol/token or public entrypoint export.                                                                                                                                                                                                                                                                                                                            |
| ARL-04 / 1 — nested distinct denial before persistence                  | **Verified for the ordinary owner matrix.** `distinct-composite-authorization.integration.test.ts` compares normal trimmed reads against GET/POST/root/trusted distinct for plain/single-nested/array/deep containers and checks zero persistence on denial.                                                                                                                                                                                                                                                                                                    |
| ARL-04 / 2 — safe values and fail-closed conditional proof              | **Proof/cases verified; owner authority qualified by ARL-11.** All 104 cases pass, including full raw distinct equivalence, scalar children, Map keys, native scalars, denied/conditional/stale-policy/discriminator/recursive branches and no callback/error retry. The new retained-service probe incorrectly authorizes distinct using B's actor.                                                                                                                                                                                                            |
| ARL-05 / 1 — ingress/getter/result/decorator ownership                  | **Verified.** `data-value-ownership.test.ts` covers nested/frozen inputs, eight getter surfaces, 18 native types, Map keys/Set contents/binary backing storage, all three direct service read methods and retained result mutation. Private owned datasets never come from public native getters.                                                                                                                                                                                                                                                               |
| ARL-05 / 2 — mutable decoration and coherent replacement                | **Verified.** Eight direct/root read/list paths allow in-place nested/native decoration; rejecting hooks cannot poison later output. Two barrier-held old readers and a new replacement reader remain coherent; existing snapshot-reuse instrumentation passes.                                                                                                                                                                                                                                                                                                 |
| ARL-05 / 3 — selected/page-only work                                    | **Verified.** The actual post-pagination/post-selection copy boundary and 2,000-row instrumentation require exactly 1/7/19 selected payload/Map copies and trims, zero denied/omitted copies, and zero copies for misses/denials/unrelated option reads.                                                                                                                                                                                                                                                                                                        |
| ARL-06 / 1 — GET/advanced select/sort/validation parity                 | **Verified.** GET forwards normalized select and sort to the shared data service. All 27 `basic-data-list.integration.test.ts` cases pass, including sort-before-page, unselected sort fields, malformed/denied sorts and independent route guards.                                                                                                                                                                                                                                                                                                             |
| ARL-06 / 2 — omitted options and filtered totals                        | **Verified.** Configuration order/empty-intersection compatibility, authorized total 5 versus page 2, empty-page totals, configured cap 2 and default cap 1,000/1,001 are asserted.                                                                                                                                                                                                                                                                                                                                                                             |
| ARL-07 / 1 — shared root/include peak and error release                 | **Verified.** `hook-concurrency.test.ts`, `request-hook-concurrency.test.ts` and `request-hook-ownership.test.ts` use barriers/event-loop probes; root virtual/grant/decorate/all and legacy/correlated target hooks share peak 2. Sync/rejected parent/descendant drains and recovery are asserted.                                                                                                                                                                                                                                                            |
| ARL-07 / 2 — owner pools, reentry, bounded fan-out and association      | **Scheduling verified; authority gap ARL-11.** Owner gate identity/captured limits are private, requests/runtimes measure independent pools, limit-one nested services serialize sibling leaves, 64-scope overflow releases, persistence remains peak 1, and result/handle order is asserted. Retained-owner tests use equal actors and miss the reproduced actor substitution.                                                                                                                                                                                 |
| ARL-07 / 3 — virtual/subdocument/data/persistence preservation          | **Verified within existing coverage.** Full virtual/embedded/populate/subdocument/data and request-persistence suites pass; pre-write/owning-parent grants and data-to-model reentry share admission. Direct trusted I/O and queued totals are explicitly outside the concurrency contract.                                                                                                                                                                                                                                                                     |
| ARL-08 / 1 — exact scalar/array/alias/ACL/count semantics               | **Partially verified; blocked by ARL-12.** All 19 numeric and 41 casting cases pass for their top-level/scalar-key fixtures, overlap, pagination independence, cast errors and false policies. Independent array-equality and dotted-array fixtures each undercount 1 as 0; direct/root includes both reproduce.                                                                                                                                                                                                                                                |
| ARL-08 / 2 — group-bounded numeric results and one aggregate            | **Verified.** Inspected the pipeline: target IDs are projected out, only bounded group ordinals are unwound/summed. The long-ID regression passes with 144 × 131,072 = 18,874,368 matching-ID bytes, one aggregate, no ID arrays/target scans and result size independent of target count/ID length. ARL-08's recorded exact 100-byte result is consistent with its inspected three 25-byte result documents; that historical log was not recast as new console output. Raw/cast group/key/byte/path/node/depth admission is present before aggregate dispatch. |
| ARL-08 / 3 — installed numeric API and authorization regressions        | **Verified existing checks.** Readonly numeric Map fixture retains negative Set/extra-authority/private-executor assertions; strict and real packed matrices pass in the complete package run, as do related/include/false/casting suites. Exact-count follow-up remains independent of type correctness.                                                                                                                                                                                                                                                       |
| ARL-09 / 1 — installed onboarding/configuration discoverability         | **Verified.** Quick Start is line 46; imports/peers/Node floor precede it. README includes eight option layers, shallow/exact/generic/variant/nullish precedence and all 23 actual Defaults buckets. The 38-line llms index links shipped sections; website updates match the inspected interfaces/routes.                                                                                                                                                                                                                                                      |
| ARL-09 / 2 — executable docs and exported consumer modes                | **Verified.** Full package run includes documentation 43, strict consumer 23, export 43 and packed 10 = **119 checks**. Reviewed the three relocated negative child-path directives; invalid expressions remain. Both peer matrices (Express 5.0.0/Mongoose 8.0.0 and 5.2.1/9.8.0), Bundler/NodeNext/Node16 ESM/CJS and runtime consumers remain enabled.                                                                                                                                                                                                       |
| ARL-09 / 3 — pack, emitted hovers and naming inventory                  | **Verified with runtime qualifications tracked separately.** Current declarations/entry exports and 17-file/2,452,668-byte publish inventory match ARL-09. Factory/overload/plugin/count/ownership/root-bound hovers and 13 skim deprecations per declaration family survive. Naming decisions were cross-checked against actual runtime/default/router consumers; ARL-11/12 must correct the overbroad runtime-isolation/exact-count outcomes.                                                                                                                 |
| ARL-10 / 1 — all requirements closed with truthful evidence             | **Blocked.** All preceding criteria were audited; ARL-11/12 are explicit pending dependencies, not hidden in a completion note.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ARL-10 / 2 — final gates, types/consumers and CHANGELOG                 | **Blocked on a complete passing root test as well as fixes.** Workspace build/lint and full access-router tests/typecheck/consumers pass; root test attempts fail outside access-router as detailed below. CHANGELOG matches baseline.                                                                                                                                                                                                                                                                                                                          |
| ARL-10 / 3 — coverage/results/limitations recorded                      | **Recorded below.** Reviewer work is complete to a blocked handoff; coordinator sign-off remains pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Exact verification / workspace outcomes:

- All commands ran serially from `<repo-root>`, using the ignored repository-local
  temp directory. The temporary runner command format is
  `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl10-gate.mjs <label> <command...>`.
  It records complete scrubbed logs and command exit metadata at
  `_tmp-arl-health/arl10-<label>.log` / `.json`, and supplies:
  `TMPDIR=<repo-root>/_tmp-arl-health`, `NODE_COMPILE_CACHE` there under
  `node-compile-cache`, both `npm_config_workspace_concurrency=1` and
  `pnpm_config_workspace_concurrency=1`, `MONGOMS_DOWNLOAD_DIR` there under
  `mongodb-binaries`, `MONGOMS_PREFER_GLOBAL_PATH=false`, repo-local
  `pnpm_config_store_dir`/`pnpm_config_cache_dir`/`pnpm_config_state_dir` under
  `pnpm-store`/`pnpm-cache`/`pnpm-state`, and `npm_config_cache` under `npm-cache`.
  The root test script's explicit `--workspace-concurrency=1` was retained.
  Actual toolchain: **Node v26.10.0, pnpm 11.18.0, TypeScript 6.0.3, Vitest 4.1.11**.
- First required sequence, before the API-harness interruption:
  1. `pnpm build` (`build`) — **exit 2**, 118.0 s. Scope 31/32 workspace projects;
     stopped before access-router at `apps/oidc-vault-dpop-example/src/main.ts:6`
     TS7016 (client declaration unavailable) and `:47` TS18046. Its client dependency
     had logged successful declarations earlier. Declarations were present at inspection;
     active unrelated DPH work existed. A concurrent clean/rebuild was a possibility,
     not a proven diagnosis. The resumed whole-workspace build passed below.
  2. `pnpm test` (`test`) — **exit 2**, 823.1 s. **6,696 passed / 0 test failures /
     1 existing todo**, 19 completed Vitest runs / 241 files, then client typecheck
     stopped on TS7016 for server root/wire declarations (`src/wire.ts:14` and
     `test/wire-contract.test.ts:9`). Access-router had not been reached. Completed
     runs: asset-inliner **772 + 1 todo**; starter **339**; express-oidc-vault **2,017**;
     attestation node/Redis/Mongo/browser/packed **618/62/31/141/12**; express-runtime
     **341**; json-frame **531**; mongoose-rxdb **632**; PDF node/browser **205/32**;
     utils **120**; OIDC memory/Mongo/Redis stores **129/147/342**; http-errors **72**;
     moo **153**. These are partial-workspace results, not a passing root test.
  3. `pnpm lint` (`lint`) — **exit 0**, 30.6 s, no diagnostics.
  4. `pnpm --filter @web-ts-toolkit/access-router typecheck` (`access-typecheck`) —
     **exit 0**, 30.4 s; five-package dependency build and `tsc --noEmit` passed.
     Access-router implementation/type files were not edited by this reviewer afterward.
- Resumed required sequence after confirming no interrupted workspace processes:
  1. `pnpm build` (`build-final`) — **exit 0**, 221.7 s, complete workspace command
     (scope **31 of 32 projects**) including access-router CJS/ESM/declarations and apps.
  2. `pnpm test` (`test-final`) — **exit 1**, 176.9 s. **3,745 passed / 1 failed /
     1 existing todo**, four reached Vitest runs (109 passing files / one failing file).
     Starter **339**, asset **772 + 1 todo**, server **2,017** passed. Attestation node
     **617 passed / 1 failed** at `test/fetch-ownership.cases.ts:156`, the native finite
     POST Request authentication-retry case with omitted init: after caller abort,
     not every retained request signal had reason `'caller finished'`. This scope was
     concurrently modified by its separate owner; no source/test change was made here.
  3. `pnpm lint` (`lint-final`) — **exit 0**, 26.1 s, no diagnostics.
  4. Because root testing stopped before access-router,
     `pnpm --filter @web-ts-toolkit/access-router test` (`access-test`) — **exit 0**,
     671.2 s including rebuild; **112 files / 2,663 tests passed, zero failures/skips**.
     This runs all existing documentation/strict/export/packed checks, including the
     current-byte comparisons for README, llms, JavaScript and declaration graphs.
     Only its existing **`pnpm build-artifact --version 0.99.0-test`** test assembly
     was invoked; no standalone release/version/changelog command was run.
  5. Failure ownership diagnostic:
     `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts -t "supports an authentication retry with omitted init"`
     (`attestation-diagnostic`) — **exit 0**, **1 passed / 106 deselected**, 2.4 s.
     The isolated pass does not erase the failed root attempt.
  6. One justified root retry, `pnpm test` (`test-retry`) — **exit 1**, 267.3 s.
     **3,991 passed / 1 failed / 1 existing todo**, eight reached Vitest runs (115
     passing files / one failing file). Asset **772 + 1 todo**, starter **339**,
     server **2,017**, attestation node/Redis/Mongo/browser **618/62/31/141** passed.
     Attestation packed **11 passed / 1 failed**: installed Chromium's explicit native
     fetchFn/prepared-fetch scenario failed to load the loopback
     `/installed-browser.mjs` with **`net::ERR_NETWORK_CHANGED`**, then
     `page.waitForFunction` exceeded **10,000 ms**. This is an observed browser/network
     loading failure in the unrelated attestation gate. Root again stopped before
     access-router; its separately completed full package result remains above.
- **No passing complete `pnpm test` was obtained.** Prerequisite for resumed ARL-10:
  complete ARL-11 then ARL-12 in fresh sequential sessions, have the coordinator and
  attestation/environment owner resolve or reliably clear the exact signal/browser
  gate failures, and obtain a complete serialized root test on final code. Do not
  reinterpret partial totals or the focused diagnostic as whole-workspace success.

Public package / naming inspection:

- `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl10-inspect.mjs` — passed.
  Checked every import/require JavaScript/type target, then TypeScript-resolved exports
  for all three entrypoints in both module families. **Zero** exports of `Service`,
  `PreparedModelQuery`, `GroupedCountInput`, `SharedHookGate`, `getRequestWorkState` or
  include-state issuers. Non-exported supporting class declarations are not public
  constructors/capabilities. Current graph still uses `parsers-CW8qHEJI.d.ts`/`.d.mts`.
- Rechecked both emitted declaration families for factory/default/CJS forms, three
  createRouter overloads, optional plugin role, numeric readonly Map API, nullish grants,
  data-native ownership, 64-scope hook contract, dual root bound and **13 deprecated
  skim sites**. The 23 Defaults fields match actual model/public resolver use.
- Reused ARL-09's **`npm pack --dry-run --json`** evidence because package metadata,
  build entries and reviewed access-router code/docs are unchanged since that check.
  Independent current inventory confirms **17 files / 2,452,668 unpacked bytes**:
  README, llms, package.json, six JS entry files and eight declarations. The complete
  package gate additionally repacked/installed current files and checked byte equality;
  no redundant npm dry-run was needed. Historical packed size remains **487,507 bytes**,
  not a newly measured compressed-size claim.
- Concrete names cross-checked: runtime facade versus `.runtime`; global/model-default/
  model/data/root options and all method buckets; operation/field/per-call authority;
  selection versus always-select/dependencies; row scope versus query transformation;
  route parameter versus ID field/resolver; request versus document grants/metadata;
  validation/prepare/transform stages; populate/include/related; effective access versus
  populate access; hydration/no-op skim/metadata flags; root/hook/persistence concurrency;
  total/count/per-key Map values. Inspected generic/exact option lookup, `??` method
  resolvers, variant routing and both root order checks. No naming migration is needed
  to fix ARL-11/12; their actual contract corrections remain with their owners.

Final integrity / bounded limitations:

- `git diff --check` and `git diff --exit-code -- CHANGELOG.md` passed. All 18 new
  source/test files and this untracked task record also passed
  `git diff --no-index --check -- /dev/null <repo-relative-file>` without diagnostics.
  `git hash-object CHANGELOG.md` is still
  **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.
- Mongo/consumer teardown completed; no workspace build/test/Mongo fixture process
  remained at final process inspection. Removed **94** identified review-created
  root-test fixture paths after matching their creation window and test harness prefixes.
  Ignored repo-local caches and reviewer logs/probe scripts remain for the coordinator.
  Reviewer durable edits are confined to this record; earlier access-router and unrelated
  OIDC/DPoP/attestation work/task records were preserved. No staging, commit or publication.
- Measurements establish work/result bounds in the tested paths, not production latency,
  a process-wide connection/query-total ceiling, arbitrary trusted-hook liveness or every
  database schema/dependency/deployment combination. Hook waiting ancestors, direct trusted
  I/O, and dataset filtering/sorting remain outside page-copy/concurrency claims as
  documented. Root batches remain non-transactional; existing consequential deferrals
  are unchanged. This review adds only the two concrete existing-boundary fixes.
- **Status handoff:** ARL-01..09 remain `completed`; ARL-11 and ARL-12 are `pending`,
  sequential and acyclic; ARL-10 remains **`blocked`**. Overall record remains
  **`in_progress` — coordinator final audit/sign-off pending**. No completion evidence
  for ARL-10 is claimed until its explicit prerequisites and full root test pass.

Resumed independent review after ARL-11/12:

- ARL-11 and ARL-12 are now recorded completed by two fresh sequential implementation
  sessions. ARL-10 resumes `in_progress` to independently inspect their code/tests,
  rerun the original five-case probe, and execute current-code integration gates.
  All historical blocked findings/results above are retained; resolution evidence
  will be appended rather than substituted for those failed observations.
- Confirmed no interrupted workspace build/test/Mongo fixture process before resuming
  (only editor TypeScript servers were present). Reverified `_tmp-arl-health` and its
  `_tmp*` ignore rule, and the unchanged baseline CHANGELOG blob. Fixture/cache work
  remains repository-local and build/test/typecheck commands remain serialized.
- **Outstanding prerequisite:** the complete root `pnpm test` has not yet passed in
  this review. Current build/test/lint, affected type/declaration/consumer checks and
  independent ARL-11/12 acceptance remain to be verified before completion. Overall
  status remains `in_progress`, coordinator final audit/sign-off pending.

- Resumption checkpoint after the usage-limit interruption: saved exit records confirm
  `resumed-build`, `resumed-test` and `resumed-lint` all exited **0**, and the unchanged
  original five-case probe passed **5/5**. No gate was still running. Root testing now
  reaches the complete **114-file / 2,750-test** access-router package, including the
  full consumer suites. The earlier root prerequisite is resolved by this complete run;
  final declaration inspection and review closeout remain in progress.
- Trivial audit prose correction: ARL-11 updated runtime defaults capture and README,
  but two inherited declaration JSDocs still said defaults were captured on acquisition.
  Corrected only those comments in `packages/access-router/src/interfaces/root.ts`
  (`Defaults`) and `packages/access-router/src/runtime.ts` (`setModelOptions`) to describe
  fresh-call owner defaults, in-flight snapshots and explicit service.defaults overrides.
  No implementation or regression was changed. Rebuild/type/declaration/consumer
  verification will use these final comments; no independent implementation fix is hidden.

Completion evidence (resumed independent review; supersedes the historical blocked
dispositions above without deleting their findings or failed-run evidence):

- **ARL-11 and ARL-12 independently verified; no further implementation blocker or
  ARL-13 follow-up was found.** The original five-case reproduction, unchanged, now
  passes **5/5** on current built output. Retained A output still hides the private field,
  distinct returns Forbidden, and its hook observations remain `[false, false]` while
  B still has admin grants. Literal-array and direct/root dotted-array count fixtures
  each return **1**, matching independent Mongo reference counts; scalar control passes.
  Evidence: `_tmp-arl-health/arl10-resumed-original-probe.log`.
- Reviewed every file changed since the first independent review: **16 added/changed
  paths**, including the new private owner module, both maintained integration suites,
  all affected service/core/cache code, count input validation, existing fixture changes,
  README, website configuration and the two audit JSDoc corrections. The final scoped
  inventory is **51 tracked changed + 21 untracked = 72 files** (untracked: **6 source,
  15 test/fixture**). Earlier unchanged ARL coverage remains the independently read audit
  above and was rerun by the complete final package/workspace gates. Retained fingerprints:
  `_tmp-arl-health/arl10-final-reviewed-files.json`; original fingerprint evidence remains.

Deep boundary resolution:

- **Owner dispatch:** `src/acl/model-service-owner.ts` associates cores with request/
  runtime using a private WeakMap, with private async construction/dispatch contexts.
  Binding walks nearest-to-base prototypes, preserves overrides, skips accessors and
  invokes the original implementation with the actual original receiver and argument
  list. There is no Proxy receiver, request/core/grant swap or public reentry capability.
  Verified that inherited PublicService methods still perform control admission and
  arity checks, and private execution/output WeakMaps retain receiver identity. Async
  continuations run under the owner; the surrounding caller's runtime is restored.
- Core factories transport their originating owner even after `req.macl` is replaced.
  Model adapters explicitly use that runtime/connection. Service field/row/ID/related/
  populate/lifecycle delegates and scalar distinct use `requestCore`; canonical
  subdocument/finalizer paths use authenticated owner bindings. The shared request stays
  unchanged, including B's current `macl` slot, while A's hook permission arguments and
  private output handles remain A-owned. Supporting unbound internal finalizer seams
  are not used as an authority fallback by those canonical routes.
- **Capture/cache:** options/defaults are captured for each top-level service dispatch;
  nested stages preserve that presentation snapshot, and separately overlapping calls
  have distinct captures. Explicit service.defaults overrides remain supported. Row-cache
  entries compare resolver identity as well as their core/model/access key. Both row
  functions are read before awaiting a transform. A late old-policy result may occupy
  the cache, but a current replacement resolver cannot reuse it; the independent race
  control verifies that replacement false remains terminal and is then cached normally.
- Four supplementary real-Mongo reviewer controls pass, without production changes:
  extracted/rebound methods preserve original receiver/handles and async runtime;
  bound public/helper/count admission rejects extra authority/arguments with zero query
  work; simultaneous calls on one receiver retain different presentation snapshots;
  old policy completion cannot revive a newer denial. Evidence:
  `_tmp-arl-health/arl10-final-owner-probe.log` (**4 passed / 0 failed**).
- **Numeric counts:** the historical `$setIntersection` implementation and audit
  description are superseded by native query `$match`/`$count` facets. Independently
  inspected the complete authorized/cast leading match, separately cast mandatory
  operands, complete join-root projection, bounded facet names/group ordinals, zero/one
  numeric row per branch and numeric-only result validation. `_id` remains available
  solely when it is the join input. One aggregate shares a candidate stream; no target
  IDs are collected/returned, no target-document application scan or per-parent database
  dispatch is introduced. Native query matching retains array/object equality, dotted
  multikey traversal and null/missing behavior rather than approximating them.
- Original and cast inputs still enforce 1,000 groups, 10,000 key occurrences, 64 KiB
  key/alias bytes, 1 MiB cumulative payload, depth 8, 20,000 nodes and 1,024-byte paths.
  Operator-document admission is applied to direct raw/cast operands while preserving
  nested dollar-field literals and Mongo's complete literal `$ref`/`$id` exception.
  Reviewed the 41 new query-equivalence tests and their independent post-instrumentation
  countDocuments references, plus the unchanged casting/ACL/false/intersection controls.
- The strengthened long-ID test now explicitly asserts **100 result bytes / three
  25-byte numeric documents**, and passes in both full current package runs. Inspected
  actual ARL-12 saved measurement output, not only its task summary: **18,874,368 matching
  ID bytes**, one aggregate and counts `[144,144,144,0,0]`; maximum-width case **1,000
  groups / 1,024-byte path / 480-byte keys**, **2,151,874 pipeline BSON bytes / 29,906
  result BSON bytes / 1,000 numeric rows**. The same maintained width/result assertions
  ran successfully in the final root gate. Count predicate work remains
  **O(requested groups × candidate documents)** plus Mongo's native comparison costs;
  fixed group/input bounds and scalar facet outputs bound command/result growth, not
  production CPU/latency or arbitrary trusted ACL-filter size.

Updated acceptance-resolution table (all references are to the current code and the
complete final package execution; original criterion-by-criterion history remains above):

| Criteria                                                          | Final checked outcome                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ARL-01 / 1–3                                                      | **Pass.** All 35 nullish/missing/non-callable handoff cases and runtime-isolation preservation pass. ARL-11 closes the separately reproduced retained-service authority issue; original application-owned maps and same-runtime reuse remain covered.                                                                                            |
| ARL-02 / 1–2                                                      | **Pass.** All 51 real-Mongo literal/mutation cases and 10 scope-aware parser cases pass, alongside false/ID/join/correlated/subdocument preservation. No literal-walker changes were introduced by the follow-ups.                                                                                                                               |
| ARL-03 / 1–3                                                      | **Pass.** All 80 source-provenance cases, metadata/related/virtual regressions and wrong-target/row handle checks pass on final owner dispatch. Original projected inputs and produced-attachment-only restoration remain private.                                                                                                               |
| ARL-04 / 1–2                                                      | **Pass.** The 104 whole-value distinct cases and original request-rule controls pass; maintained retained-owner distinct denial checks zero persistence, and the original independent security probe now rejects under A's actor.                                                                                                                |
| ARL-05 / 1–3                                                      | **Pass.** The 120 native/nested ownership cases and snapshot/scaling suites retain atomic admission, mutable detached output, concurrent replacement coherence and exact selected/page-only copy assertions.                                                                                                                                     |
| ARL-06 / 1–2                                                      | **Pass.** All 27 basic-data-list parity cases and existing model/data sort/route suites pass, including omitted options, finite caps, filtered totals and malformed/denied sort rejection.                                                                                                                                                       |
| ARL-07 / 1–3                                                      | **Pass.** All 30 new hook/owner scheduler cases and nested persistence/virtual/subdocument/data regressions pass with ARL-11 dispatch. Independent owner probes additionally verify differing actors and async context/receiver integrity. Request/runtime pools, one child branch/frame, FIFO error drain and 64-scope reentry remain enforced. |
| ARL-08 / 1–3                                                      | **Pass, with ARL-12 resolution.** The 19 numeric and 41 casting cases plus 41 query-equivalence cases pass; original missed equality/traversal probes are now correct. One-aggregate numeric result bounds, raw/cast admission, aliases, ACL/false and installed numeric types remain verified.                                                  |
| ARL-09 / 1–3                                                      | **Pass.** Final complete package run includes all 119 documentation/export/strict/packed checks. Fresh declarations include corrected per-call defaults guidance, native query semantics and all prior factory/naming/skim guidance. New dry-run and declaration graph inspection pass.                                                          |
| ARL-11 / 1 — original actor, writes/distinct and inverse controls | **Pass.** Maintained 46-case ownership suite covers unequal actors and both nullish inverse handoffs, read/public read/list/distinct/mutations, zero denied persistence, original hook permission/input arguments and new B-service controls. Original security probe also passes independently.                                                 |
| ARL-11 / 2 — owner rows/IDs/targets/handles                       | **Pass.** Same-name models on separate connections, warmed caches, retained-core factories, ID resolvers, legacy/correlated/populate/subdocument dispatch and wrong-owner handles all pass. Independent overlapping-call and late-cache-publication controls pass.                                                                               |
| ARL-11 / 3 — maintained regressions and gates                     | **Pass.** All 46 maintained cases and all preservation/consumer files ran together in the final 2,750-test package execution. The constructor-free fixture adaptation retains all 65 admission assertions. Final package typecheck, root lint and diff checks pass.                                                                              |
| ARL-12 / 1 — exact accepted query semantics                       | **Pass.** Original array-literal and direct/root dotted-array failures return 1, with genuine misses 0. Maintained native/scalar/object/array/null/missing/duplicate/overlap cases match independent Mongo references.                                                                                                                           |
| ARL-12 / 2 — one aggregate and group-bounded output               | **Pass.** Instrumented suites require one model/collection aggregate, zero target find/findOne/count executions, numeric-only rows <= groups, no ID accumulation/lookup/union and exact long-ID result size. Maximum-width execution remains within the recorded BSON bounds.                                                                    |
| ARL-12 / 3 — admission and authorization                          | **Pass.** Raw/cast limits, operator versus literal handling, false/operation denial, mandatory joins, related scope and include metadata/provenance pass; numeric installed fixtures still reject removed Set and extra authority/private-token forms.                                                                                           |
| ARL-12 / 4 — integration and consumers                            | **Pass.** All affected suites, typecheck and complete strict/export/packed peer matrices pass in current root/package verification. No required follow-up remains.                                                                                                                                                                               |
| ARL-10 / 1–3                                                      | **Pass.** All dependencies completed and independently audited; original failures resolved with durable regressions, current full workspace/type/consumer gates pass, exact results/limitations and unchanged CHANGELOG recorded. Overall coordinator audit remains pending.                                                                     |

Exact current-code verification:

- Commands use the already documented runner/environment, from `<repo-root>`:
  `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl10-gate.mjs <label> <command...>`.
  The runner keeps Mongo/npm/pnpm/Node caches inside that same ignored directory and
  sets both workspace-concurrency environment values to 1. Each build/test/typecheck
  completed before the next began. Log/exit records are
  `_tmp-arl-health/arl10-<label>.log` / `.json`.
- Initial resumed sequence, before the two prose-only JSDoc corrections:
  - `pnpm build` (`resumed-build`) — **exit 0**, **236.6 s**, scope **31/32 projects**.
  - `node _tmp-arl-health/arl10-boundary-probe.mjs` (`resumed-original-probe`) —
    **exit 0**, **5 passed / 0 failed**, **1.6 s**, unchanged original reproduction.
  - `pnpm test` (`resumed-test`) — **exit 0**, **1,903.6 s**; complete root run:
    **13,009 passing test executions / 0 failures / 0 skips / 1 pre-existing todo**,
    **536 passing file-suite executions across 34 Vitest runs**. Includes the full
    access-router **114 files / 2,750 tests** and all 119 consumer/doc/export checks.
  - `pnpm lint` (`resumed-lint`) — **exit 0**, **23.3 s**, no diagnostics.
- Final declaration/probe/pack checks after the two JSDoc corrections:
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` (`final-typecheck`) —
    **exit 0**, **23.7 s**; serialized five-package rebuild and `tsc --noEmit` passed.
  - `node _tmp-arl-health/arl10-owner-review-probe.mjs` (`final-owner-probe`) —
    **exit 0**, **4 passed / 0 failed**, **2.2 s**, supplementary controls described above.
  - `pnpm --filter @web-ts-toolkit/access-router exec npm pack --dry-run --json`
    (`final-pack`) — **exit 0**, **5.0 s**; **17 files**, **490,669 packed bytes /
    2,462,259 unpacked bytes**. Includes README **158,111 bytes**, llms **4,467 bytes**,
    package.json, six CJS/ESM JavaScript files and eight declarations; no source/tests.
    npm's two unknown inherited environment-config notices were nonfatal.
- Repeated required root sequence on the final emitted comments/declaration graph:
  1. `pnpm build` (`closeout-build`) — **exit 0**, **272.1 s**, complete workspace
     build (scope **31 of 32 projects**), including CJS/ESM/declarations and examples.
  2. `pnpm test` (`closeout-test`) — **exit 0**, **2,095.2 s**. Exact complete results:
     **13,009 passed / 0 failed / 0 skipped / 1 pre-existing todo**, **536 passing
     file-suite executions across 34 Vitest runs**. These include separate React 18/19
     runs, so they are execution totals, not a claim of 13,009 unique test definitions.
     Access-router again passes **114 files / 2,750 tests**, including all **119**
     documentation **43**, export **43**, strict **23** and packed **10** checks.
  3. `pnpm lint` (`closeout-lint`) — **exit 0**, **25.2 s**, zero diagnostics.
- Full workspace breakdown for **each** passing root run (not totals summed across runs):

  | Package/lane                                                        |             Passed tests |
  | ------------------------------------------------------------------- | -----------------------: |
  | asset-inliner                                                       |  772 (+ 1 existing todo) |
  | create-access-router-mongo-starter                                  |                      339 |
  | express-oidc-vault                                                  |                    2,017 |
  | express-request-attestation node / Redis / Mongo / browser / packed | 618 / 62 / 31 / 141 / 12 |
  | express-runtime                                                     |                      341 |
  | json-frame                                                          |                      531 |
  | mongoose-rxdb                                                       |                      632 |
  | pdf-reader node / browser                                           |                 205 / 32 |
  | utils                                                               |                      120 |
  | OIDC memory / MongoDB / Redis stores                                |          129 / 147 / 342 |
  | http-errors                                                         |                       72 |
  | moo                                                                 |                      153 |
  | oidc-vault-dpop-client                                              |                      701 |
  | oidc-vault-dpop-example unit / browser                              |                  51 / 37 |
  | express-response-handler                                            |                      215 |
  | express-json-router                                                 |                       44 |
  | access-router                                                       |                    2,750 |
  | message-service                                                     |                      336 |
  | access-router-client node / browser                                 |                 914 / 10 |
  | access-router-deco                                                  |                      563 |
  | access-router-runtime                                               |                      135 |
  | access-router-react React 19 / React 18 / nonruntime                |           268 / 268 / 18 |
  | react-vite                                                          |                        3 |

- The sole todo is the existing ASSET-06 image-replacement placeholder at
  `packages/asset-inliner/test/legacy-contract.test.ts:453`. No ARL check was skipped.
  React 18 emitted expected cycle/depth Error messages from deliberate `toThrow`
  controls in `packages/access-router-react/test/dependency-policy.test.tsx`; the lane
  reports **268 passed**, not uncaught Vitest errors. Prior OIDC declaration, attestation
  signal and installed-browser/network failures did **not** recur in either complete
  passing run. Those unrelated worktrees/records were not edited to obtain these passes.

Final package/evidence integrity:

- `node _tmp-arl-health/arl10-final-inspect.mjs` (`final-inspection`) — **exit 0**,
  **1.6 s**. Rechecked every declared import/require target and TypeScript-resolved
  root/advanced/processors exports in both declaration families. Final shared graph:
  `packages/access-router/dist/parsers-BnmChTfF.d.ts` / `.d.mts`; private owner helper
  names appear **zero** times in those shared declarations and no owner/include/prepared
  issuer, `Service` constructor or hook gate is exported from a public entrypoint.
  All 13 skim deprecations per family, numeric readonly Map, native query/operand
  contract, factory/overload/plugin hovers, data ownership, 64-scope reentry and dual
  root bound survive emission. Both corrected defaults comments match the current README.
- Current on-disk file sizes match every final npm dry-run entry after the final builds.
  Complete package gates also repacked/installed the current JavaScript/declaration/docs
  bytes and ran both supported peer matrices (Express 5.0.0/Mongoose 8.0.0 and
  Express 5.2.1/Mongoose 9.8.0), strict Bundler/NodeNext/Node16 ESM/CJS and runtime
  consumers. Only their existing test artifact assembly at **0.99.0-test** was used;
  no standalone release, version, changelog or publication operation was performed.
- The inspection aggregates actual logs into
  `_tmp-arl-health/arl10-final-workspace-summary.json`, retains the final 72-file hash
  inventory, and checks all **21 untracked source/test files** plus this task record
  with `git diff --no-index --check -- /dev/null <repo-relative-file>`. No whitespace
  diagnostics. Final `git diff --check` and `git diff --exit-code -- CHANGELOG.md` pass;
  `git hash-object CHANGELOG.md` remains
  **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.
- No workspace build/test/Mongo fixture process remained at closeout. After verifying
  creation times against this resumed review and known harness prefixes, removed
  **98** leftover root-suite/Mongo/browser fixture paths. Earlier owners' evidence,
  unknown directories and repo-local caches were preserved. Review scripts/logs remain
  ignored and repository-local. Durable reviewer edits are this task record and the
  two expressly recorded JSDoc corrections; no runtime or maintained test implementation
  was changed, and no staging, commit, delegation or unrelated record edit occurred.
- Bounded limitations remain the explicit contracts: native facets perform per-group
  predicate work over authorized candidates; hook-chain bounds exclude waiting ancestor
  frames, direct trusted I/O and total queued work; page-only detachment does not make
  data filtering/sorting page-only; root batches are non-transactional. Testing covers
  the declared peer/module matrices and actual current Node **v26.10.0** toolchain, not
  every dependency/deployment/production load. No new speculative feature is deferred.
- **ARL-10 is completed.** ARL-01..09 and ARL-11/12 remain completed; all dependencies
  are satisfied and no required pending/blocked follow-up remains. **Overall status
  remains `in_progress` for the coordinator's final record/worktree audit and sign-off.**

### Task ARL-11: Preserve retained model-service authority across runtime handoff

Status: completed

Kind: defect

Priority: P1 — another runtime's grants can disclose protected model fields through a retained service.

Suggested agent: fresh request/service ownership implementer; separate sequential session,
not the ARL-10 reviewer or a previous implementation session.

Dependencies: ARL-09 (completed integrated baseline; execute before ARL-12).

Primary ownership:

- `packages/access-router/src/services/base.ts`, `packages/access-router/src/services/service.ts` and the
  shared service/core authorization/related dispatch ownership boundaries they call.
- Runtime handoff/ownership integration regressions, including
  `packages/access-router/test/request-hook-ownership.test.ts` and
  `packages/access-router/test/runtime-permission-handoff.integration.test.ts`;
  shipped guidance if needed.

Finding/evidence:

Source/test references below are relative to `packages/access-router` unless fully qualified.

- ARL-07 captures the originating core only for selected hook delegates. Service executor
  `permissions` still reads mutable `this.req.macl` (`src/services/service.ts:1165`),
  `authorizeDistinctField` does the same (`:2517`), and row/ID/related delegates still
  dereference mutable core/ambient runtime state (`src/services/base.ts:574-609,743-760`;
  `src/services/service.ts:1178-1183`). Existing retained-owner tests use identical empty
  actor permissions in both runtimes, so hook pool peaks do not detect authority mixing.
- Real-Mongo reproduction through built package exports: initialize A with `[]`, acquire
  its model service, then run B middleware on the same request with `['admin']`. A's
  `permissionSchema` is `{ name: true, secret: 'admin' }`; both runtimes register the
  same model. Before handoff A's read omits `secret`. The same retained service after
  handoff returns `secret: 'only-runtime-b-admin'`, and `distinct('secret')` succeeds.
  A's original core still reports `admin=false`, B's reports true, and A's document hook
  observations change from false to true. A's retained output helper still removes the
  field, exposing inconsistent authority within the same service. Probe result: **one
  failed security assertion**, with all observations captured before the assertion.
- This is a demonstrated original-actor/runtime boundary failure, not a request for a
  new multi-runtime API. Preserve ARL-01's correct nullish target initialization and
  ARL-07's existing independent captured work pools.

Implementation requirements:

1. Keep a retained model/public service's original request core, actor, runtime/model
   registry, row cache and option lookup coherent at every existing authorization and
   dispatch entry. Do not derive authority from the current mutable request slot or
   ambient replacement runtime. Use a shared private boundary rather than route patches.
2. Audit existing scalar distinct, count/exists, ID lookup, read/list/mutation, related/
   populate/subdocument and helper delegates for the same owner mismatch. Keep fresh
   calls' current configuration capture within the originating runtime; do not freeze
   live policy indefinitely or mutate request actor grants to emulate ownership.
3. Preserve original hook inputs/permissions, private handles, mandatory joins/IDs,
   terminal false, separate request/runtime hook and persistence pools, and same-runtime
   reuse. Application-supplied unowned maps retain their documented contract.
4. Add durable, behavior-based failing-then-passing regressions with differing actors,
   filters, IDs and same-name runtime models. Include positive controls and test actual
   package/service use, not only constructing a gate or changing helper mocks.

Acceptance criteria:

- A retained denied A service cannot gain B's `admin` read/write/distinct authority;
  a retained authorized A service is not silently stripped by nullish B grants. Hooks
  continue observing A's actor. Distinct denial makes zero distinct persistence calls;
  denied writes make zero saves. New B services retain B's independent policy.
- Owner-dependent row/ID/target operations remain on the original model/connection,
  scope and cache despite handoff/ambient changes. Related/subdocument handles retain
  the original owner and reject wrong-owner reuse; direct/root existing routes still pass.
- ARL-01/03/04/07 regressions, affected service authorization suites, package typecheck,
  targeted ESLint and `git diff --check` pass; record exact commands/results. The review
  reproduction becomes ordinary maintained coverage with the fix.

Verification: shared checks 1–4, focused runtime/authorization/ownership tests, then
affected package consumer checks if the public surface changes. No CHANGELOG edits.

Decisions/findings during implementation:

- This fresh dedicated implementation session owns **ARL-11 only**, without delegation.
  ARL-01..09 are completed; ARL-10 remains blocked and ARL-12 remains pending for its
  subsequent isolated session. Read root instructions, task conventions, shared checks,
  ARL-07 ownership history, ARL-10 review evidence and the retained-service probe.
- Initial worktree inspection confirmed extensive existing ARL and unrelated OIDC/DPoP/
  attestation work. Preserve that work. Verified the repository parent and existing
  `_tmp-arl-health` with `ls`; its probe is ignored by `.gitignore`'s `_tmp*` rule.
  Fixture/check commands use `TMPDIR=<repo-root>/_tmp-arl-health` and repo-local caches,
  with dependency builds, tests and typecheck serialized. Initial CHANGELOG blob is
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Owner contract: every retained model/public service entry uses its originating core,
  actor, runtime registry/connection and row cache. Fresh calls capture current options
  from that owner; existing immutable call captures and separate captured hook/persistence
  pools remain authoritative. Related services and output handles inherit that same owner.
  No request-slot/grant mutation or public authorization bypass will emulate ownership.
- Resume check found no interrupted build/test/Mongo fixture process. The five-package
  closure build passed; the first maintained real-Mongo reproduction produced **33 failed
  / 0 passed**, zero collection/setup errors. It reproduces read/distinct grants in both
  directions, B's write hook, B's warmed row cache, wrong ID resolution, related runtime
  binding errors and subdocument disclosure/writes. Log: `_tmp-arl-health/arl11-red.log`.
- Dispatch decision: bind existing model-core/service methods to their captured runtime
  at construction, retaining the actual receiver identity used by private execution maps.
  A private construction context transports the originating core when that core creates
  another service after handoff. All service authority delegates use that core explicitly;
  the shared Express request and its current grants/core slot are never replaced.
  This also covers ambient option/meta/helper lookups and asynchronous continuations,
  rather than adding isolated patches to individual routes. Per-invocation option capture
  preserves live configuration for fresh calls and stable options for an in-flight call.
- Required same-boundary findings: retained-core `getService`/aliases must transport A
  even when `req.macl` is B; Core's populate/field-metadata delegates also reread that slot.
  Service construction currently freezes `options/defaults` indefinitely, so current-owner
  changes must be read at fresh dispatch while existing explicit service-default overrides
  and immutable authorization captures remain supported. These corrections are within ARL-11.
- Expanded coverage exposed one further required live-policy correction: a core's base-row
  cache is keyed only by model/access, so replacing A's row-policy function reuses the old
  cached grant. The new maintained control fails after the ownership correction. Associate
  each entry with its resolver identity; unchanged policy keeps same-request reuse, while
  replacement policy cannot inherit its predecessor's grant. Capture both row-policy
  functions before awaiting query transformation so a suspended call stays coherent.
- Test calibration preserved existing contracts: populated references use supported
  ObjectId schemas; zero-save denials use an actual permission-dependent row gate (field
  trimming alone permits a normal no-op save); mandatory-ID rewrite coverage uses the
  existing dedicated parent/subdocument boundary. Scope is derived from authenticated
  child handles, never supplied alongside one. The custom-core adapter test seam remains
  supported without a fabricated Mongoose registry; real registered cores require their
  captured registry. These adjustments add no field/no-op/identifier contract changes.
- The new owner suite reached **46/46 passing**. The 42-file preservation gate reached
  **1,275 passed / 58 failed**, all failures in one prototype-only admission fixture
  assigning the now-read-only option/derived-field accessors. Adapt that fixture to the
  existing `getModelRouterOptions` seam and an explicit captured core; retain all admission
  assertions. The other **41 suites passed**, including ARL-01/03/04/07 and the real-Mongo
  authorization gates. An earlier 120-second tool timeout produced no test summary; after
  confirming no surviving processes, reran serially with a sufficient command timeout.
- Final continuation checks again found no interrupted build/test/Mongo process. Verified
  completed logs instead of assuming interrupted conversation turns meant interrupted
  commands. The defaults regression was strengthened to require newly selected fields;
  its first rerun exposed an unordered `findOne({})` fixture assumption (**45 passed /
  1 failed**). Selecting the intended `_id` makes that positive control deterministic;
  the final unchanged implementation passes all **46** ownership cases.

Completion evidence:

- Implemented one private model-core/service ownership boundary in
  `packages/access-router/src/acl/model-service-owner.ts`. Existing methods, including
  inherited public-service entries, execute under their captured runtime without changing
  receiver identity, Express request slots or actor grants. Private construction context
  carries the original core into services acquired from that retained core after handoff.
  Dispatch-local options give fresh calls the owner's current configuration while nested
  stages retain their invocation's presentation snapshot. No public issuer, bypass flag,
  request token or output metadata was introduced.
- Changed these existing implementation paths:
  - `packages/access-router/src/core.ts` — register the original core/runtime; preserve
    that owner through all service factories/aliases and Core populate/field-metadata work.
  - `packages/access-router/src/services/base.ts` — retain that core for every authority,
    ID, row, field, lifecycle, related and helper delegate. Registered target lookup uses
    the owner registry. Custom internal adapter/core seams retain their existing support.
  - `packages/access-router/src/services/service.ts` — executor and distinct permission
    reads, row-cache authorization and population use the retained core; the model adapter
    receives the owner runtime explicitly. Presentation options/defaults and derived
    permission-field selection are current per invocation, with explicit service defaults
    still supported. Existing immutable authorization plans and work pools remain intact.
  - `packages/access-router/src/services/public-service.ts` — read/list fallback guards
    use the retained core, with the inherited dispatch boundary covering all public calls.
  - `packages/access-router/src/core-shared.ts` — row-cache entries retain policy-function
    identity, so replacement policy cannot reuse an earlier grant. Capture transform and
    base-policy functions together before awaiting the transform.
- Maintained tests:
  - New `packages/access-router/test/retained-model-service-ownership.integration.test.ts`:
    **46 real-Mongo cases**, using built package exports, actual sequential Express runtime
    middleware and same-name models on separate connections. Covers denied A/admin B and
    granted A/null-or-undefined B; trusted/public read/list/distinct; write input and lifecycle
    ownership; count/exists/numeric count, warmed owner caches, different ID resolvers,
    retained-core factories/aliases; legacy/correlated targets, populate and subdocuments;
    source/embedded/related handles and wrong-owner rejection; live defaults/field/row/ID
    policy, a barrier-held immutable call, fallback guards and unknown/denied targets;
    positive create/new/upsert/delete controls. This incorporates the reviewer reproduction
    into ordinary maintained coverage rather than relying on the temporary probe.
  - `packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`:
    adapt its constructor-free fixture to `getModelRouterOptions`, base fields and the
    captured core. All **65** existing assertions remain and pass; no negative gate removed.
- Acceptance outcomes: denied A read/distinct never acquires B's admin grant; inverse A
  authority survives both nullish B cases, and newly acquired B services keep B's policy.
  Denied distinct makes **zero model and collection distinct calls**. Row-denied updates,
  subdocument writes and deletes make **zero saves**, with the scalar-denial matrix also
  recording zero findOne/count/distinct/delete dispatch. Allowed mixed writes change only
  A's admitted fields and retain the original payload/document snapshots in A's lifecycle
  hooks; B's rows are unchanged. Hook permissions remain A's while `this` is the original
  shared request and its current `macl` slot remains B. Owner scopes, IDs, target connections,
  mandatory dedicated IDs/joins and authenticated output graphs remain isolated. Existing
  direct/root, nullish initialization/application-owned maps, include provenance, composite
  distinct, hook-chain/reentry and separate persistence-pool gates pass.
- Updated the actual owner/capture/cache contract in `packages/access-router/README.md`
  and the matching passage in `website/docs/packages/access-router/configuration.mdx`.
  This task record is the remaining changed path. Earlier ARL edits and unrelated
  OIDC/DPoP/attestation work are preserved.

Exact verification (all from `<repo-root>`, builds/tests/typecheck serialized):

- The temporary runner invocation was
  `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl11-run.mjs <label> <command...>`.
  It supplied repo-local `TMPDIR`, `NODE_COMPILE_CACHE`, `MONGOMS_DOWNLOAD_DIR`,
  `npm_config_cache`, `pnpm_config_store_dir`, `pnpm_config_cache_dir` and
  `pnpm_config_state_dir`, plus `MONGOMS_PREFER_GLOBAL_PATH=false` and both workspace
  concurrency environment settings `=1`. Scrubbed evidence is retained as
  `_tmp-arl-health/arl11-<label>.log`. Commands below specify the exact runner arguments.
- Dependency closure (`build-red`, `build-green`, `build-expanded`):
  `pnpm --filter @web-ts-toolkit/access-router... build` — **5 packages passed** on each
  invocation, including the pre-fix reproduction build. Final typecheck rebuilt the same
  closure after the final implementation/formatting changes.
- Initial red (`red`):
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/retained-model-service-ownership.integration.test.ts`
  — **33 failed / 0 passed**, zero collection errors. Source-disclosure, inverse grant,
  row-cache, ID/related dispatch and child-authority observations are recorded above;
  subsequent fixture calibrations are explicitly recorded rather than counted as fixes.
- Additional live-policy reproduction (`expanded`):
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/retained-model-service-ownership.integration.test.ts test/service.internal.test.ts`
  — **5 failed / 47 passed, 52 tests** before the policy-version cache correction and
  final helper-fixture calibration. The new replacement-policy test returned success
  from the old cached grant instead of Forbidden.
- Final ownership green (`ownership-complete`):
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/retained-model-service-ownership.integration.test.ts`
  — **46 passed / 0 failed / 0 skipped, 1 file**, including the final deterministic
  live-defaults assertion. Earlier `ownership-final` also passed 46 before that strengthening.
- Preservation (`preservation-final`), exact command:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
    test/runtime-permission-handoff.integration.test.ts \
    test/runtime-isolation.integration.test.ts \
    test/include-source-provenance.integration.test.ts \
    test/include-permission-metadata.integration.test.ts \
    test/distinct-composite-authorization.integration.test.ts \
    test/distinct-field-authorization.integration.test.ts \
    test/field-helper-request-boundaries.integration.test.ts \
    test/arf12-root-distinct.authorization.integration.test.ts \
    test/hook-concurrency.test.ts \
    test/request-hook-concurrency.test.ts \
    test/request-hook-ownership.test.ts \
    test/request-persistence-concurrency.test.ts \
    test/concurrency.test.ts \
    test/service.internal.test.ts \
    test/service-authorization-baseline.contract.test.ts \
    test/service-authorization-boundary-admission.contract.test.ts \
    test/service-authorization-context.unit.test.ts \
    test/service-authorization-direct.integration.test.ts \
    test/service-authorization-final-review.integration.test.ts \
    test/service-authorization-finalizer.unit.test.ts \
    test/service-authorization-input.integration.test.ts \
    test/service-authorization-migration.contract.test.ts \
    test/service-authorization-mutations.integration.test.ts \
    test/service-authorization-prepared-query.unit.test.ts \
    test/service-authorization-projection.unit.test.ts \
    test/service-authorization-public-boundaries.integration.test.ts \
    test/service-authorization-related.integration.test.ts \
    test/service-authorization-rows.integration.test.ts \
    test/service-authorization-subdocument-policies.integration.test.ts \
    test/service-authorization-subdocuments.integration.test.ts \
    test/service-denial-contract.test.ts \
    test/filter-denial.integration.test.ts \
    test/model-router.routes.integration.test.ts \
    test/root-router.integration.test.ts \
    test/cross-resource-authorization.integration.test.ts \
    test/read-list-fallback-authorization.integration.test.ts \
    test/virtuals-embedded-subdocuments.integration.test.ts \
    test/virtuals-populate-include.integration.test.ts \
    test/correlated-includes.escape.integration.test.ts \
    test/correlated-includes.execution.test.ts \
    test/operation-access-boundaries.integration.test.ts \
    test/data-router.test.ts --reporter=verbose
  ```

  Result: **41 files passed / 1 failed; 1,275 passed / 58 failed, 1,333 tests**. All 58
  failures were the constructor-free fixture assignment described above. After its sole
  fixture correction, (`admission-final`)
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-boundary-admission.contract.test.ts`
  — **65 passed / 0 failed**, closing that entire file. The other 41 files account for
  **1,268 passing cases**; thus all **1,333 distinct preservation cases** have passing
  verification across those runs, not a claimed single-run 1,333-pass summary.

- Final package typecheck (`typecheck-final`):
  `pnpm --filter @web-ts-toolkit/access-router typecheck` — **exit 0**, five-package
  dependency rebuild plus package `tsc --noEmit` passed with zero type errors.
- Documentation/installed-consumer/public-surface gate (`consumers`):
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/export-contract.test.ts test/strict-consumer-types.test.ts test/packed-consumer-compatibility.test.ts`
  — **119 passed / 0 failed, 4 files**. Existing strict ESM/CJS/Bundler/NodeNext/Node16,
  both packed peer matrices and current-byte comparisons remain enabled. Combined distinct
  verified coverage is **1,498 tests across 47 files** (46 new + 1,333 preservation + 119
  consumer), not a full package/workspace gate claim.
- Targeted ESLint (`lint-closure`):
  `pnpm exec eslint packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/core.ts packages/access-router/src/core-shared.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/test/retained-model-service-ownership.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`
  — **8 files passed**, zero errors/warnings.
- Formatting (`format-closure`):
  `pnpm exec prettier --check packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/core.ts packages/access-router/src/core-shared.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/test/retained-model-service-ownership.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`
  — **8 files passed** after formatting patches.
- `git diff --check` and `git diff --exit-code -- CHANGELOG.md` — **passed**. The two new
  source/test files and this task record also pass
  `git diff --no-index --check -- /dev/null <repo-relative-file>` without whitespace
  diagnostics. `git hash-object CHANGELOG.md` still equals
  **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.
- Checked both emitted declaration families, including
  `packages/access-router/dist/parsers-BcziY8TJ.d.ts` and `.d.mts`: **zero occurrences**
  of the six new private owner/dispatch helper names. No package entrypoint was added.
- Successful Mongo/consumer suites tore down their fixtures. After verifying the exact
  creation window and inactive Mongo PID, removed the one fixture abandoned by the tool
  timeout using `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl11-cleanup.mjs`.
  Repo-local caches and scrubbed command logs remain for the subsequent owners.
  No build/test/Mongo fixture process remains. No staging, commit or publication occurred.
- **ARL-11 is complete with no remaining implementation blocker.** ARL-12 remains pending
  for its fresh sequential owner; ARL-10 remains blocked on ARL-12 and resumed independent
  workspace gates. Overall status remains **in_progress**. This session did not implement
  ARL-12 or perform the independent review.

### Task ARL-12: Make numeric group membership match accepted Mongo join predicates

Status: completed

Kind: defect

Priority: P2 — accepted array-valued/dotted joins silently return incorrect exact counts.

Suggested agent: fresh Mongo grouped-count semantics implementer; separate sequential
session after ARL-11, not the ARL-10 reviewer.

Dependencies: ARL-11 (sequential shared-service ownership); ARL-08, ARL-09 (completed baseline).

Primary ownership:

- `packages/access-router/src/services/service.ts:2753-2848` numeric grouped executor;
  `packages/access-router/src/services/grouped-count.ts` admission only as required by the same semantics.
- `packages/access-router/test/grouped-count-numeric.integration.test.ts`, casting/count
  regressions and corresponding numeric-count README/JSDoc if clarification is necessary.

Finding/evidence:

- The authorized `$match` uses Mongo query `$in`, but per-group assignment later compares
  `$$group.keys` to the aggregation expression `$foreignField` with `$setIntersection`.
  These are not equivalent for all currently accepted equality operands and dotted paths.
  Existing new fixtures cover top-level scalar/array leaves and scalar keys only.
- Real Mongo public helper: schema `direct: [String]`, one target with
  `direct: ['a','b']`. `countDocuments({ direct: { $in: [['a','b']] } })` returns **1**;
  `countByFieldValues('direct', [['a','b']], {}, 'count')` returns success with
  `Map([['a,b', 0]])`. The complete literal array matches the query but not the projected
  set of its elements. Scalar key `'a'` on the same field correctly returns **1**.
- Real Mongo include: schema `contacts: [{ keys: [String] }]`, target
  `{ contacts: [{ keys: ['a','b'] }, { keys: ['a'] }] }`, source `{ key: 'a' }`.
  `countDocuments({ 'contacts.keys': { $in: ['a'] } })` returns **1**. A legacy count
  include with `localField: 'key'`, `foreignField: 'contacts.keys'` returns **0** through
  both direct advanced-list and root-list routes (HTTP/entry 200). Aggregation evaluates
  that dotted path to nested arrays, not Mongo query traversal's scalar candidates.
  Probe outcomes: **three failed exact-count assertions / one positive control passed**.

Implementation requirements:

1. Make per-group membership implement the supported, cast Mongo equality/join semantics,
   including literal-array equality and dotted paths through embedded arrays. A target
   contributes once per parent even when repeated nested values or overlapping keys match.
2. Preserve one aggregate per legacy include, numeric-only group-bounded results, existing
   alias/first-occurrence rules, original-input ownership, complete authorized match and
   independently cast mandatory join. Do not restore ID sets, fetch targets into Node, or
   dispatch a query per group. Preserve all raw/cast input budgets and controlled errors.
3. Cover null/missing, scalar/array, literal-object/array and nested-path controls relevant
   to the chosen shared fix; use independent real `countDocuments` reference queries.
   If an existing accepted shape truly cannot be supported, make any narrowed contract
   explicit and reject before persistence rather than succeeding with a fabricated zero.
4. Maintain durable red/green regressions for both observed failures, direct/root/service
   entry paths and multiple overlapping parents. Update shipped contracts consistently.

Acceptance criteria:

- The two exact fixtures above return **1** for the matching group and **0** for a real
  miss; duplicate nested keys and overlapping parents never multiply a target's count.
  Positive top-level scalar/array/native casting and aliases remain correct.
- Each legacy include makes **one aggregate**, **zero target find/findOne/count executions**,
  returns at most one numeric result per requested group, and retains the long-ID fixture's
  group-bounded result size. No pipeline accumulation or transport of target IDs occurs.
- All group/key/byte/depth/node/path and cast-expansion bounds still reject before dispatch;
  ACL/false/mandatory-join/metadata provenance regressions and numeric installed types pass.
- Shared checks 1–4 plus the numeric/casting/related/include suites and affected installed
  consumer checks pass, with exact results recorded; coordinator resumes ARL-10 afterward.

Verification: shared checks 1–4; real-Mongo numeric/count/casting suites and numeric type
fixture, source-provenance/related authorization preservation. No CHANGELOG edits.

Decisions/findings during implementation:

- This fresh dedicated session owns ARL-12 only, with no delegation. ARL-01..09 and
  ARL-11 are completed; ARL-10 remains blocked for resumed independent review and final
  workspace gates. Preserve ARL-11's private model-service owner dispatch, receiver/async
  runtime binding and row-function cache invalidation, as well as all earlier ARL work.
- Read repository/task instructions, shared rules, the full ARL-12 requirements and the
  independent ARL-10 findings/probe. Initial worktree inspection confirmed extensive
  unrelated OIDC/DPoP/attestation work. Verified the repository parent and existing
  `_tmp-arl-health` with `ls` and its `.gitignore` `_tmp*` rule with `git check-ignore -v`.
  Checks use `TMPDIR=<repo-root>/_tmp-arl-health` and repository-local caches; rebuilding
  commands run serially. Initial CHANGELOG blob matches
  `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.

- Query-equivalence design (before ARL-12 runtime edits): retain the existing complete
  authorized/cast leading `$match`, including the independently intersected mandatory
  join. After independent owning-schema operand casting and all cast-expansion budgets,
  use one `$facet` branch per bounded requested group. Each branch uses native query
  `{ [foreignField]: { $in: castGroupKeys } }`, then `$count`, then a constant numeric
  ordinal projection. This is the same Mongo predicate as the independent count reference,
  including whole-array/object equality, BSON types, null/missing and dotted traversal
  through scalar/array/nested-array values. Repeated matches in one target cannot multiply
  a branch's count; overlapping parents have separate branches. Existing original string
  aliases/first occurrence, include one-level local flattening and snapshot ownership stay
  authoritative. No supported native equality shape needs approximation.
- Aggregation/work assessment: project only the complete top-level join subtree after
  authorization, preserving its exact nested shape (never project/reconstruct a dotted or
  positional path). Drop target `_id` unless it is itself the requested join root. The
  shared candidate stream feeds native per-group predicates: bounded O(groups × candidate
  documents) predicate work, up to 1,000 branches, with no per-parent database dispatch,
  collection rescan, lookup or union. Each branch retains/emits only a scalar count;
  concatenate its zero-or-one numeric rows, unwind and return the existing ordinal/count
  row contract. Facet output and returned rows are O(groups), independent of target count
  or ID size. Pipeline operand payload remains bounded by the existing raw/cast 1 MiB
  budget plus at most 1,000 × 1,024 path bytes and fixed per-branch syntax; the authorized
  match appears once. Verify the real 1,000-branch limit and unchanged long-ID result
  bytes. Mongo's bounded facet input buffering is distinct from its 100 MiB output cap;
  no facet branch accumulates input documents/IDs. Empty public group input can return an
  empty numeric result after denial/cast validation without constructing an empty facet.

- Durable red reproduction on the built pre-fix runtime: **17 failed / 12 passed,
  29 tests, one file, zero collection errors**. Both reviewer fixtures fail through
  helper/service/direct/root paths; nested/empty literal arrays, dotted null/missing,
  deeper Mixed traversals, overlapping parents and owned nested literals undercount.
  Independent countDocuments references run after include instrumentation. Calibration
  retained the existing rejection of numeric positional foreign paths (outside the
  admitted grammar) and allowed `_id` as a join input without mistaking it for ID
  accumulation. Initial uncalibrated run was 19 failed / 10 passed, with those two
  assertion mismatches; neither required a runtime-contract expansion.

- Initial native-facet implementation passes **99 tests across four files** (29 new
  query-equivalence, 19 numeric, 41 casting, 10 internal). Additional acceptance checks
  preserve direct/root/service object/null/missing behavior, empty public input and
  cumulative raw/cast node budgets. A maximum-width real include passes with **1,000
  groups, a 1,024-byte foreign path, 480-byte distinct keys, one aggregate, 2,151,874
  pipeline BSON bytes and 29,906 result BSON bytes / 1,000 numeric rows**.
- Necessary same-boundary finding: a plain operator-shaped object such as `{ $gt: '' }`
  was admitted as a raw/cast Mixed join operand, but Mongo rejects it with code 2,
  `cannot nest $ under $in`, after dispatch. Calibrated regression: **2 failed / 5 passed /
  34 deselected (41 total)**; both raw and schema-cast operator documents reproduce.
  Add pre-persistence rejection to raw/cast key admission: a direct plain-object `$in`
  operand whose first field starts with `$` is not an equality operand unless it has
  both `$ref` and `$id` (Mongo's complete DBRef-document exception). Nested dollar-field
  data inside literal objects/arrays and non-leading dollar fields remain literal and
  supported. Native BSON DBRef class instances retain their existing rejection. This
  explicitly controls an invalid query shape; no valid native equality approximation
  or fabricated zero is introduced. Schema Mixed ignores ordinary query setters, so
  cast-expansion tests use the real schema `castForQuery` seam rather than a no-op setter.

Completion evidence:

- Changed only these ARL-12 paths, preserving all inherited ARL hunks:
  - `packages/access-router/src/services/service.ts` — replace expression/set-intersection
    membership with a shared authorized candidate stream and bounded native query/count
    facets. Preserve the complete cast ACL/descriptor/mandatory match and independent
    operand cast. Project the complete join root, count once per target per group, emit
    only numeric ordinal/count rows, and fill missing groups with zero. Empty public input
    returns an empty Map after denial/cast validation. Updated public count JSDoc.
  - `packages/access-router/src/services/grouped-count.ts` — controlled raw/cast rejection
    of Mongo-invalid expression-document operands, with the exact literal DBRef exception
    and nested-literal controls described above. Existing raw/cast group/key/byte/node/
    depth/path budgets, snapshots, aliases and first-occurrence behavior remain enforced.
  - `packages/access-router/test/grouped-count-query-equivalence.integration.test.ts` —
    **41 durable real-Mongo tests**: helper and service/direct/root includes; literal
    arrays/objects, empty values, null/missing/undefined serialization, multilevel embedded
    arrays, repeated/overlapping parents, BSON/date/number/scalar controls, aliases, owned
    nested inputs, empty groups, raw/cast node bounds, maximum groups/path/payload and
    controlled invalid operands. References use independent owning-model countDocuments
    queries after actual include dispatch/result instrumentation.
  - `packages/access-router/test/grouped-count-numeric.integration.test.ts` — retain the
    original long-ID fixture and strengthen its exact **100-byte / three 25-byte-row**
    assertions. All 19 existing numeric cases still pass.
  - `packages/access-router/test/service.internal.test.ts` — adapt the existing independent
    cast/group-association assertion to native facet predicates; preserve the two-cast,
    original-input, adapter-receiver and original persistence-error identity controls.
  - `packages/access-router/README.md` — native query-equivalence examples, private
    bounded-facet work/result contract and explicit invalid-operand admission rule.
  - `docs/tasks/20261012-165209-access-router-long-term-health.md` — ARL-12 status/design/
    findings/evidence only. ARL-10 stays blocked; overall status stays in_progress.
- Acceptance outcomes:
  - Both reviewer fixtures now return **matching 1 / missing 0**, including direct/root
    and direct service includes. Overlapping parents with repeated nested target keys
    return **[2, 3, 3, 2, 0, 0]**, equal to independent references; dotted object/null
    controls return **[1, 3, 0]**. Literal array/object order, original alias collisions,
    schema normalization, native keys and input mutation ownership all pass.
  - Every instrumented nonempty legacy include executes **one model/collection aggregate**
    and **zero target find/findOne/countDocuments executions**; public helpers have the
    same bound. Cast-only countDocuments builders execute no count middleware/persistence.
    Results have only numeric group ordinals and counts, with rows **<= requested groups**.
    Pipeline assertions prohibit ID accumulation, target-ID transport, lookup and union;
    Node processes only the bounded numeric result rows. Joining on `_id` remains valid
    query input, never a target-ID result set.
  - Long-ID measurement on final code: **144 targets × 131,072 ID bytes = 18,874,368 bytes**;
    HTTP **200**, no aggregate errors, counts **[144, 144, 144, 0, 0]** for five groups,
    **one aggregate**, **three numeric rows × 25 BSON bytes**, **100 BSON bytes including
    the result wrapper**. One short-ID target and 144 short-ID targets both also return
    **100 bytes / three rows / one aggregate**. Measurements are reset after the separate
    numeric-only ID-volume reference. No target IDs cross the count aggregate boundary.
  - Maximum-width measurement on final code: **1,000 distinct parent groups**, **1,024-byte
    foreign path**, **480-byte keys**, **one aggregate**, **1,000 numeric result rows**,
    **2,151,874 pipeline BSON bytes**, **29,906 result BSON bytes**. All counts are 1;
    endpoint-key independent references are 1. The existing inclusive 10,000-key control
    also passes. Excess groups/keys, per-key/cumulative bytes, depth, path, raw/cast nodes,
    setter expansion and malformed operands reject before aggregate dispatch.
  - Work is one native predicate evaluation per candidate per facet (at most 1,000
    facets), with Mongo's ordinary operand/path/value comparison costs. There is one
    candidate stream, not one database dispatch/collection scan per parent. Additional
    facet operand payload is bounded by the existing cast-group byte budget plus bounded
    repeated paths/syntax; the complete authorized leading match is included once. Facet
    outputs contain only zero-or-one numeric rows, so neither the 100 MiB facet output
    cap nor the 16 MiB BSON result cap depends on matching target/ID volume. This establishes
    tested command/result bounds, not a production latency or arbitrary ACL-filter-size claim.
  - All **41 casting**, **80 source-provenance**, **38 metadata**, **26 related-policy**
    and **46 retained-owner ARL-11** regressions pass, alongside prepared binding, row
    intersections, terminal denial, cross-resource/fallback, correlated and virtual/include
    controls. ARL-11 private owner dispatch/async binding/cache implementation is preserved.
- Exact commands ran serially from `<repo-root>`. The ignored local runner invocation was
  `TMPDIR=<repo-root>/_tmp-arl-health node _tmp-arl-health/arl12-gate.mjs <label> <command...>`;
  it records scrubbed `_tmp-arl-health/arl12-<label>.log` and `.json` exit evidence. Its
  environment supplies `TMPDIR=<repo-root>/_tmp-arl-health`, both
  `npm_config_workspace_concurrency=1` and `pnpm_config_workspace_concurrency=1`,
  `MONGOMS_DOWNLOAD_DIR=<repo-root>/_tmp-arl-health/mongodb-binaries`,
  `MONGOMS_PREFER_GLOBAL_PATH=false`, and local `NODE_COMPILE_CACHE`, pnpm store/cache/state
  and npm cache below that same temp root. Runtime `$PWD` expands only to this checkout.
  - `pnpm --filter @web-ts-toolkit/access-router... build` (`build-before`, `build-after`)
    — **five dependency-closure packages passed** on each run; no parallel rebuilds.
  - Pre-fix red: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-query-equivalence.integration.test.ts`
    (`red-calibrated`) — **17 failed / 12 passed, 29 tests, one file**, all failures
    incorrect numeric behavior, zero collection/setup errors. The initial uncalibrated
    command (`red`) was **19 failed / 10 passed**, with the two fixture corrections
    recorded above. Runtime source was still unmodified on both runs.
  - Initial green: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-query-equivalence.integration.test.ts test/grouped-count-numeric.integration.test.ts test/grouped-count-casting.integration.test.ts test/service.internal.test.ts`
    (`green-initial`) — **99 passed / 0 failed, four files**.
  - Added acceptance probes: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-query-equivalence.integration.test.ts --reporter=verbose`
    (`boundaries`) — **35 passed / 3 failed, 38 tests**: one real raw operator-document
    rejection defect and two no-op Mixed-setter fixture mismatches. After using the real
    schema query-cast seam and adding literal preservation controls,
    `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-query-equivalence.integration.test.ts -t 'operator|DBRef|key nodes|dollar fields' --reporter=verbose`
    (`operand-red`) — **2 failed / 5 passed / 34 deselected**, both genuine raw/cast
    Mongo-invalid operand failures. Both now pass with pre-dispatch BadRequest.
  - `pnpm --filter @web-ts-toolkit/access-router typecheck` (`typecheck`) — **passed**:
    serialized five-package rebuild plus package `tsc --noEmit`, zero type errors.
  - Final runtime gate: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/grouped-count-query-equivalence.integration.test.ts test/grouped-count-numeric.integration.test.ts test/grouped-count-casting.integration.test.ts test/service.internal.test.ts test/include-source-provenance.integration.test.ts test/include-permission-metadata.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-final-review.integration.test.ts test/cross-resource-authorization.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/filter-denial.integration.test.ts test/service-denial-contract.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.escape.integration.test.ts test/virtuals-populate-include.integration.test.ts test/retained-model-service-ownership.integration.test.ts --reporter=verbose`
    (`runtime-final`) — **582 passed / 0 failed / 0 skipped, 19 files**, comprising
    **41 new + 541 existing tests**. Exact size/query measurements are in the saved log.
  - Numeric installed consumers: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/packed-consumer-compatibility.test.ts -t ARL-08 --reporter=verbose`
    (`numeric-consumers`) — **7 passed / 0 failed / 26 unrelated cases deselected, two
    files**: five Bundler/NodeNext/Node16 ESM/CJS modes and two real-tarball minimum/current
    peer matrices (Express 5.0.0/Mongoose 8.0.0 and Express 5.2.1/Mongoose 9.8.0). Numeric
    readonly input/Map results and negative ID-set/extra-authority/private-executor checks
    all pass. Total final focused verification: **589 passing tests across 21 files**.
  - `pnpm exec eslint packages/access-router/src/services/service.ts packages/access-router/src/services/grouped-count.ts packages/access-router/test/grouped-count-query-equivalence.integration.test.ts packages/access-router/test/grouped-count-numeric.integration.test.ts packages/access-router/test/service.internal.test.ts`
    (`eslint`) — **five files passed**, zero errors/warnings.
  - `pnpm exec prettier --check packages/access-router/src/services/service.ts packages/access-router/src/services/grouped-count.ts packages/access-router/test/grouped-count-query-equivalence.integration.test.ts packages/access-router/test/grouped-count-numeric.integration.test.ts packages/access-router/test/service.internal.test.ts`
    (`format-final`) — **five files passed** after correcting only JSDoc indentation
    and fixture layout. No behavioral changes followed the passing runtime/type gates.
  - `git diff --check` — **passed**. The three owned untracked source/test files and
    this task record also pass `git diff --no-index --check -- /dev/null <repo-relative-file>`
    with no whitespace diagnostics (normal new-file difference exit 1).
- Inspected the emitted count JSDoc in both
  `packages/access-router/dist/parsers-CJWPsHeo.d.ts` and `.d.mts`: native query semantics,
  invalid-object admission, fixed bounds and the numeric API remain discoverable. There
  is no new public executor, authority option or target-ID result API.
- After the session usage-limit continuation, rechecked code, task state, saved command
  exits and running processes: no interrupted workspace build/test/TypeScript/Mongo fixture
  process remained. Mongo and installed-consumer fixtures were removed by their teardown;
  ignored evidence logs and caches remain local. Reconfirmed `_tmp-arl-health` is ignored.
  `git diff --exit-code -- CHANGELOG.md` passes and `git hash-object CHANGELOG.md` remains
  **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. Earlier ARL and unrelated concurrent work
  remain intact; no delegation, staging, commit or publication occurred.
- **ARL-12 is completed with no remaining implementation blocker.** Overall remains
  **in_progress** and **ARL-10 remains blocked** until its independent reviewer resumes
  the acceptance audit and full serialized workspace gates, including its previously
  recorded unrelated root-test prerequisites. This session claims only ARL-12 completion.

## Consequential deferrals and naming decisions

- Generic transactions/idempotency, optimistic concurrency and cursor pagination need a
  separately specified business API; prior records already identify these choices. This
  phase corrects demonstrated boundary/count/data behavior, not those larger features.
- Authorization snapshot/config-copy CPU cost has not been profiled. Retain isolation
  checks; no speedup is claimed without a relevant measurement.
- Unexpected root-operation rejections may leave partial committed outcomes. A separate
  fault-injection/response-contract decision is needed before promising transactional or
  per-entry recovery behavior; existing root batches remain non-transactional.
- Current operation variants, explicit service authorization dimensions, row transform
  versus row scope, source selection versus authority, populate versus includes, and
  identifier/router parameter distinctions are intentional. ARL-09 documents these and
  verified misleading/no-op cases rather than introducing broad compatibility aliases.

## Definition of done

All ARL tasks and any necessary follow-ups have `Status: completed` with `Completion
evidence` describing changed paths, exact commands, actual results and contract decisions.
The independent reviewer verifies their acceptance criteria and integration checks. The
coordinator checks the complete final record and worktree. No machine-specific evidence
paths, undisclosed unverified requirements, unrelated overwritten work or CHANGELOG edits.

## Coordinator final review — 2026-10-14

Status: completed

Completion evidence:

- Audited the entire task record: **12 unique task IDs**, all `Status: completed`, each
  with required execution fields, acceptance criteria, exact verification outcomes and
  **Completion evidence**. Dependencies are present, completed and acyclic. ARL-10's
  original blocked dispositions are explicitly superseded by its successful resolution
  table; ARL-11/12 are genuine separately implemented follow-ups. Consequential deferrals
  have rationale and bounded limitations, not hidden unfinished acceptance criteria.
- Confirmed the current scope is exactly the independent review's **72-file inventory**
  (**51 tracked changed + 21 untracked source/test files**). All **72 SHA-256 fingerprints**
  match `_tmp-arl-health/arl10-final-reviewed-files.json`; the verified implementation,
  maintained tests and shipped docs have not changed after the passing final gates.
  Coordinator closeout changes only this record; its local audit helper is ignored.
- Independently inspected the final command exit records, workspace summary, published
  declaration/inventory evidence, retained-owner boundary and README/llms guidance.
  Final `pnpm build`, `pnpm test`, `pnpm lint`, access-router `typecheck`, npm dry-run and
  declaration inspection all exited **0**. The final root run reports **13,009 passed /
  0 failed / 0 skipped / 1 pre-existing todo**, **536 file-suite executions across 34
  Vitest runs**. Access-router contributes **114 files / 2,750 tests**, including all
  **119 documentation/export/strict/packed checks**. These are per-run execution totals;
  neither repeated final runs nor React compatibility lanes are presented as unique tests.
- The independent review's unchanged original reproduction passes **5/5**, and its
  supplemental owner controls pass **4/4**. All 46 maintained retained-owner and 41
  query-equivalence regressions are included in the final package run. Native query
  facets retain one aggregate/group-bounded numeric output; the documented per-group
  predicate work and other resource/transaction limits remain explicit.
- Verified `node _tmp-arl-health/arl-coordinator-audit.mjs` — **passed**: task fields/status/
  evidence, dependency graph, all 72 current fingerprints, exact scoped inventory, six
  final successful gate records, test totals and CHANGELOG baseline. The audit helper
  and prior review artifacts are session-local under the ignored repository-local temp
  directory; maintained runtime/type checks remain in the package's ordinary test suites.
- `git diff --check` and `git diff --exit-code -- CHANGELOG.md` — **passed**.
  `git hash-object CHANGELOG.md` remains
  **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. The new task file passes its separate
  whitespace check, and no machine-specific absolute path appears in this shared record.
  Unrelated concurrent work is preserved; no staging, commit or publication occurred.
- **Final sign-off:** every required task and acceptance criterion is delivered and
  verified. The complete task file and overall objective are **completed** with no
  implementation, verification or coordinator-review blocker remaining.
