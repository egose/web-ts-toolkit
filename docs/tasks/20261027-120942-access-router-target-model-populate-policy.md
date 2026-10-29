# Access-router: target-owned populate policies and actual-model binding

Created: 2026-10-27 12:09:42 local (`20261027-120942`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — MPO-00..05 and linked POP-07 independently accepted after corrected-source V2/V3/V4; reopened POP-01/POP-05 criteria are reconciled under the target-model/default-model scope.

## Objective and execution authorization

The user approved moving both populate operation requirements from global options
to individual **target-model** options, with runtime model defaults and strict
built-ins. Create this task file first, then implement its items using a fresh
sub-agent per item, strictly sequentially, with coordinator handoff review and a
separate independent final reviewer. No nested agents or concurrent shared builds.

Proposed final server configuration, after registering/configuring the models:

```ts
api.setDefaultModelOptions({
  requireOperationAccessForPopulateQueries: true,
  requireOperationAccessForPopulateDependencies: true,
});
api.setModelOptions('Document', {
  requireOperationAccessForPopulateQueries: false,
  requireOperationAccessForPopulateDependencies: false,
});
api.setModelOptions('User', {
  requireOperationAccessForPopulateQueries: true,
  requireOperationAccessForPopulateDependencies: true,
});
```

Before that migration, resolve the outstanding actual-model binding defect
[POP-07 in the previous phase](20261026-225914-access-router-populate-operation-policy.md#task-pop-07-bind-ordinary-population-to-its-validated-actual-mongoose-target).
MPO-00 executes that existing correction; it is not a separate duplicate fix.
The prior global-policy API/fixtures become historical as this phase supersedes
their scope. Preserve actual past evidence and close the real binding finding
only after its correction and independent acceptance.

## Fixed contracts

### C1 — The actual target owns both flags

- Keep the exact names `requireOperationAccessForPopulateQueries` and
  `requireOperationAccessForPopulateDependencies`, as optional booleans on
  `DefaultModelRouterOptions` and its model/extended option surfaces.
- Remove them from `GlobalOptions`, global defaults/normalization, and global
  policy capture. Do not alias or broadcast a global value into target models.
  Stale explicit global usage must fail with actionable migration diagnostics;
  ordinary business fields with these names remain valid data.
- Resolve independently: **explicit target override → captured runtime model
  defaults → built-in true**. Only literal false disables a requirement. Explicit
  undefined clears an override and restores inheritance; omission preserves an
  existing override. Other malformed JavaScript values are conservatively true.
- Normalize model/default bulk and exact setters consistently. Restrict special
  inheritance handling to these two flags; other model options retain their
  existing shallow replacement/copied-default contracts.
- Do not materialize inherited flag values as permanent model overrides. Unrelated
  model updates, router construction, repeated decorator setup and bootstrap
  restore must not break live inheritance. Later operations on existing models
  without overrides observe changed defaults; in-flight calls keep old snapshots.
- For `Project.documentIds → Document`, both ordinary population and private
  dependency loading use **Document's** resolved settings. Project's settings
  cannot relax Document or User. Document's own virtual referencing User uses
  User's dependency policy, not Document's.

### C2 — Coherent model-default and target capture

Capture the flag-default snapshot once per owning execution before source/target
option reads and the first await. Combine it with each actual target's owned
options; propagate its identity/data through related/include, derived/fallback,
embedded, cached output and dedicated-child stages. New top-level calls on the
same service/request refresh; nested stages retain the originating capture.

Do not use a source `AuthorizationConfiguration` containing source-resolved flags
as a substitute for runtime model defaults. In particular, the dedicated-child
handoff currently reuses that configuration as a global carrier and needs explicit
replacement. Globals for authentication/logger/budgets keep their existing roles.

Keep public runtime option getters and `router.options`' documented stored/
construction snapshot behavior. Effective captured policy remains strict even
when an unset raw getter returns undefined. Actual target bindings, actor,
row/field authority, query/default masks and private descriptors remain coherent.

### C3 — Existing authorization and response semantics

- Every population target still requires its actual Mongoose model, owning-runtime
  ACL configuration and an effective object `permissionSchema` before relevant
  target I/O or initiating writes. `{}` is an explicit closed business-field policy.
- Query true requires the target's effective read/list/trusted custom operation;
  query false skips only that admission gate. Source entry/field permission,
  target fields/document grants, row/base/transform filters, match, mandatory
  references and original selection/exclusions/identity rules remain enforced.
- Dependency true requires target base read; false skips only that operation gate.
  Declared private input fields and source virtual output authorization remain
  distinct; target request read-row filters and mandatory IDs still apply.
- Direct/generated/root operation guards do not inherit a populate bypass. An
  unmounted registered Document may deny standalone read/list and still permit
  related data according to its own populate settings and policies.
- Denied/no admitted population retains exact authorized original ID(s); parent
  field denial/unselection omits them. Actual admitted misses use normal null/
  filtered-array behavior. Private computation/denial/failure never changes the
  ordinary reference shape or introduces private data into public views.
- Preserve fourth-argument isolation, original refs/native copies, target-owned
  handles, include provenance, immutable query masks, detached mutation output,
  hidden-row visibility, hydration caveats, batching/cache ownership, concurrency
  bounds and limit-one completion. No private recursive/identity-only/helper I/O.

### C4 — Actual-model binding is a required prerequisite

Implement the existing POP-07 requirements: validate the actual model resolved by
the source reference against the owning runtime's configured instance; reject
missing or same-named mismatched instances before writes/target I/O. Carry that
validated binding through Mongoose population/finalization so a later registry
lookup cannot substitute a different model. Preserve correctly registered explicit
cross-connection model-valued refs where currently supported, without silently
registering or forcing an unrelated same-named model. Test both query modes,
canonical/helpers/mutations and original-ID controls.

## Inspected baseline and scope

- Baseline HEAD `49699bb`; worktree clean before this file. Read root `AGENTS.md`,
  task workflow/conventions, current POP-07 finding and focused options/default/
  capture source. Planning research used a read-only agent; no implementation,
  build or runtime test was run to create this file.
- Source refs below are relative to `packages/access-router` unless qualified.
  `src/runtime.ts` (`setModelOptions`) copies runtime defaults into stored options
  using `{ ...defaults, ...stored, ...supplied }`; `OptionsManager.assign` shallowly
  assigns while `set` preserves undefined. Merely moving types would freeze
  inherited defaults accidentally. General copied-default behavior is intentional
  and tested; change only the two populate flags.
- `src/interfaces/root.ts` declares both flags in `GlobalOptions` today;
  `ModelRouterOptions` extends `DefaultModelRouterOptions`, and extended key/setter
  types inherit those surfaces. Existing model/default setters and model-router
  setters can expose the new scope without a new API.
- `src/acl/model-output-planning.ts` currently derives flags from globals.
  `src/acl/virtual-populate-dependencies.ts` computes one global pair outside target
  capture. `src/acl/model-service-owner.ts` and `related-execution.ts` share global
  snapshots. Replace this policy carrier with owned model-default capture.
- `src/acl/subdocument-output.ts` currently passes the source configuration as the
  global carrier. It must not become a source-model override of a target's defaults.
- Existing executor checks already read captured target configuration in
  `Service.genExecutionPopulate`, `Core.genPopulate` and
  `executeVirtualPopulateBatch`. Keep those gates; change correct resolution and
  capture, not their field/row/operation meaning.
- `packages/access-router-deco` derives scoped option keys from server interfaces,
  validates both booleans in `src/property-options.ts`, and may apply bulk options,
  exact property setters and another empty `createRouter` call. Verify that sequence
  does not materialize inherited values or lose undefined clearing/rollback.
- Existing types/docs/tests explicitly promise global-only flags; update those
  with the scope migration. Old flags removed by the prior phase remain removed.

Related records: [breaking populate policy](20261026-225914-access-router-populate-operation-policy.md),
[private read phase](20261026-122832-access-router-private-populate-read-policy.md),
[server-owned hydration](20261015-162927-access-router-server-owned-hydration.md).
No existing task supplies per-target flag inheritance. POP-07 is explicitly reused,
not duplicated. Coverage is focused; no universal peer/plugin audit is claimed.

Primary implementation packages are access-router and access-router-deco; shipped
docs/website and runtime/decorator integration are included. Record necessary scope
expansion first. No unrelated default-system redesign, writable/recursive virtual
feature, unregistered-target mode, dependency upgrade, release/publish automation,
commit/staging or hand-edit of generated output is authorized.

## Execution and verification

P1: required correctness/ownership prerequisite; P2: required consumer readiness.
All tasks are required. Execute MPO-00 → MPO-01 → MPO-02 → MPO-03 → MPO-04 one at
a time, with a fresh owner for each. MPO-04 is independent of implementers. Update
status before work, record actual changes/commands/results and corrected failures,
and never complete a blocked acceptance criterion. New required findings receive
stable new IDs and fresh corrective owners before final review resumes.

Commands run from repository root unless stated. Requirements: Node >=22,
repository pnpm, installed dependencies, usable mongodb-memory-server binaries and
registry/cache availability for real consumers. Use ignored repository-local
`_tmp-mpo`, checking parent/ignore before creation. Replace quoted `<repo-root>`
placeholders before execution; record only repo-relative/placeholders and no full
session identifiers. Preserve concurrent/unrelated work and inspect processes
before shared builds; wait for owners rather than stopping their workers.

Build/test scripts must remain serialized: root tests use
`--workspace-concurrency=1`, server Vitest uses `fileParallelism: false`, and package
scripts rebuild transitive shared dist outputs. No concurrent agent builds.

### Shared gates

- **V1 — focused runtime:** fresh
  `pnpm --filter @web-ts-toolkit/access-router... build`, then actual suites with
  `TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`.
  Replace filenames and retain meaningful before-fix regressions where practical.
- **V2 — types/integrity:**
  `pnpm --filter @web-ts-toolkit/access-router typecheck`; focused ESLint/Prettier;
  `git diff --check`; new files additionally
  `git diff --no-index --check -- /dev/null <new-owned-file>`. Use concrete paths
  and record exact results. Relevant decorator scripts have their own rebuilt closure.
- **V3 — complete server and installed surface:**

  ```sh
  TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router test
  TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts
  ```

  A current complete server run containing all four updated consumer suites
  satisfies the second command; inspect actual results instead of repeating it.
  Inspect root/advanced `.d.ts`/`.d.mts`, actual transformed tarball/artifact ESM/CJS
  and strict NodeNext/Bundler behavior. Inventory: `npm pack --dry-run` from
  `packages/access-router`. Website has its own workspace: `pnpm build` there.

- **V4 — final integration:** root `pnpm build`, root `pnpm lint`, then serially
  `TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-runtime test`
  and
  `TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco test`.
  Confirm final V2/V3 freshness; broaden to other tests if demonstrated impact
  warrants it. Do not infer full-root test success from scoped gates or use earlier
  global-phase results as current per-model evidence.

## Tasks

### Task MPO-00: Execute existing POP-07 actual-target binding correction

Status: completed — scoped implementation/V1/V2 passed and linked POP-07 independently accepted by MPO-04 after corrected-source final gates.

Kind: defect

Priority: P1 — mismatched model policy and post-write resolution failures block correct target-owned settings.

Dependencies: none.

Primary ownership: fresh corrective implementer for the linked POP-07 source and
regressions; this section and the prior task's implementation evidence.

Finding: source-connection population can use a different actual model than the
runtime instance whose name/policy was validated; a missing target can fail after
create persistence. Reproduced in the prior completion audit for both query modes.

References: prior task POP-07; `src/acl/{related-execution,populate-target-configuration}.ts`,
`src/model.ts`, captured population metadata and helper/mutation paths.

Requirements:

1. Implement existing POP-07's actual-ref resolution, mandatory registered instance,
   pre-write error and captured-binding transport requirements without a duplicate fix.
2. Retain before-fix tests for wrong connection/same name, missing target, late
   model-registry substitution, canonical/helper/create and supported positive refs.
3. Preserve current field/row/match/ID and ordinary/private semantics before scope migration.

Acceptance criteria:

- No unregistered actual target can borrow another same-named instance's policy.
- Invalid targets fail with zero initiating writes and zero unintended target I/O.
- Correct supported refs remain usable; in-flight model binding cannot be substituted.
- Existing POP-07 records actual implementation evidence; independent closure waits for MPO-04.

Verification: prior POP-07 gates, V1/V2 and relevant registration/query/helper/
mutation controls. Do not mark earlier global-policy API claims current per-model behavior.

#### MPO-00 implementation and MPO-01 handoff

Fresh sequential corrective owner executed the **existing POP-07**, after reading
both complete task records, root `AGENTS.md` and `ai-friendly-ts-package`. MPO-00
and POP-07 were set to `in_progress` before code; later MPO items stayed pending.
Initial HEAD was `49699bb`, with only the coordinator's new plan and prior-phase
cross-link changed. Both were preserved. The coordinator waited throughout; no
nested agents or concurrent shared-output build/test owner was used.

Environment: Node `v26.12.1`, pnpm `11.18.0`. Before scratch creation,
`ls -ld . _tmp-mpo` confirmed the repository parent and absent scratch directory;
`git check-ignore -v _tmp-mpo/probe` matched `.gitignore:8:_tmp*`, then
`mkdir _tmp-mpo` created the ignored parent. Initial, pre-check and final
`ps -C node,pnpm,esbuild,tsc -o comm,args` inspections found no competing workers.
Build/test invocations were serialized; Vitest retained `fileParallelism: false`.
Commands below ran from repository root; quoted `<repo-root>` placeholders were
expanded from `$PWD` at execution. Evidence paths are repository-relative.

Changes (relative to `packages/access-router`):

- `src/meta.ts`: `getModelReference` reads the actual owning-runtime source schema,
  including scalar refs, array element aliases (`$embeddedSchemaType`,
  `embeddedSchemaType`, `caster`), nested reference arrays and dotted embedded
  paths. `getModelRef` now also recognizes static Model-valued refs. Admission
  does not use the cached name-only reference map as actual-model authority.
- `src/acl/populate-target-configuration.ts`: new shared synchronous
  `capturePopulateTargetBinding` combines the existing registration/effective-object-
  schema check with actual reference resolution. String refs resolve on the source
  connection; explicit Model refs retain that instance, including cross-connection
  refs. Missing or different instances throw the existing controlled
  `ServiceAuthorizationError`/`bad_request` before target I/O or initiating writes.
  Dynamic callbacks/refPath cannot supply a static pre-I/O binding and receive an
  actionable controlled diagnostic. No model is auto-configured or substituted.
- `src/acl/related-execution.ts`, `src/acl/service-authorization.ts`: ordinary
  `AuthorizationRelatedTarget.model` retains the validated instance alongside its
  captured policy. `staticObjectIdReference: false` still selects the Mongoose
  adapter fallback; it is not an admission result or a same-connection restriction
  on legitimate ordinary explicit refs.
- `src/acl/populate-target.ts`, `src/core.ts`: both planners now retain
  `fetchBinding.model` and the helper's captured target schema/configuration.
  `setPopulateTargetMeta` installs a read-only enumerable `model` from that binding
  because Mongoose copies enumerable descriptor keys. Original plan/selection/
  access metadata remains under the existing non-enumerable Symbol. Input planners
  construct fresh descriptors; public `Populate`/`SubPopulate` options gain no
  `model` authority. Wire and JavaScript helper spoof controls pass.
- `src/model.ts`, `src/services/service.ts`: private synchronous
  `withCapturedPopulateModel` constructs the canonical target service against its
  captured model, so a runtime registry replacement during a source await cannot
  mix old target policy with a newly constructed adapter/document-grant binding.
  Canonical descriptors, adapter population, document post-save population,
  detached private/ordinary fallback, dedicated-child copies and finalization keep
  the held model. Existing source/target operations, rows, fields, native match,
  IDs and private gates retain their independent execution seams.
- New `test/populate-operation-policy.binding.test.ts`: **136 real Mongo tests**,
  two actual Mongoose connections, same-named models and both Q/hydration modes.
  Retains absent/mismatched targets (including another runtime's configuration),
  canonical/helper/create/update/upsert/dotted-array/dedicated-child preflight,
  zero initiating inserts/updates and zero unintended target reads. Positive
  scalar/array/nested/child, explicit Model/cross-connection, field/row/match,
  duplicate/missing-ID, saved-ID, denied-operation/root and caller-model-spoof
  controls pass. Awaited target guards (Q true) or row transforms (Q false), source
  guard/runtime replacement and source registry/schema-ref replacement retain old
  bindings; later same-service calls revalidate. Explicit cross-connection fallback
  alongside private inputs covers read, post-save create and child-copy population
  at concurrency one, with exactly three ordinary and three private target reads.
  Native multidimensional-array controls verify adapter binding against Mongoose's
  own hydration-specific helper output, without adding recursive output semantics.
- `test/populate-operation-policy.helper-isolation.test.ts`: retained all 12
  native/required-match regressions; updated the descriptor-key assertion for the
  server-derived model and asserted its exact instance. The eight independent
  `populate-operation-policy.review.test.ts` cases were not edited.

Actual checks, before/after results and corrected attempts:

1. Fresh baseline closure passed:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo00-before-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose > _tmp-mpo/mpo00-before-binding.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose > _tmp-mpo/mpo00-before-binding-corrected.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose > _tmp-mpo/mpo00-before-binding-final.log 2>&1
   ```

   Initial **88 failed / 0 passed** included new-fixture mistakes: create returns a
   list result, unauthenticated root denial is `unauthorized`, and RegExp cannot be
   sent as JSON match. Corrected those assumptions before production edits; the
   intermediate result was **82 failed / 6 passed**, and the final meaningful
   before-fix result was **80 failed / 8 passed**, 88 cases / 1 file. All correctly
   bound ordinary/ID controls passed. Missing targets threw `MissingSchemaError`
   after one initiating create/update/upsert write; mismatched targets read A under
   B's policy; late replacements returned B instead of the captured A. These
   binding assertions remain in the retained suite.

2. Initial descriptor-binding correction passed its fresh closure and all **88/88**:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo00-first-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose > _tmp-mpo/mpo00-first-binding.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose > _tmp-mpo/mpo00-expanded-binding.log 2>&1
   ```

   The expanded 116-case suite then exposed **4 failed / 112 passed**: runtime
   registry replacement during the source await still supplied B to target document
   permission contexts. Added the private captured-model construction transport;
   the next build and expanded private/fallback controls passed **120/120**:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo00-expanded-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose > _tmp-mpo/mpo00-expanded-binding-corrected.log 2>&1
   ```

3. V1/V2 closure/source typecheck and the affected runtime run:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo00-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts test/populate-operation-policy.config.test.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.dependencies.test.ts test/populate-operation-policy.review.test.ts test/populate-operation-policy.helper-isolation.test.ts test/private-populate-read-policy.config.test.ts test/private-populate-read-policy.review.test.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/model-router.integration.test.ts test/runtime-isolation.integration.test.ts test/retained-model-service-ownership.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-final-review.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/subdocument-mutation-visibility.integration.test.ts test/request-hook-concurrency.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo00-focused.json' > _tmp-mpo/mpo00-focused.log 2>&1
   ```

   Fresh five-package closure and `tsc --noEmit -p tsconfig.typecheck.json` passed.
   The 26-file run finished in **343.32s**, **1,145 passed / 8 failed**, no skips/todo.
   All **25 existing affected files / 1,017 cases passed**. Eight newly added
   multidimensional-array assertions incorrectly assumed ordinary 1D materialized
   output. Corrected those probes to compare helper output to real native Mongoose
   under the same hydration/filter/projection, retaining actual model/query-count
   and canonical no-private-leak checks. No recursive finalizer change was made.

4. Final fresh V1/V2 and corrected new suite:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo00-final-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo00-final-binding.json' > _tmp-mpo/mpo00-final-binding.log 2>&1
   ```

   Closure/source typecheck passed. New binding suite **136/136**, **31.41s**,
   zero failed/skipped/todo; actual JSON reports success. Runtime implementation
   was unchanged after item 3 (only the new test oracle and a source comment were
   corrected). Thus final scoped evidence is **1,153 distinct passing tests across
   26 files**, from the 25-file passing portion plus this corrected suite; this is
   not a claim that the earlier combined invocation passed. Includes all 84 query,
   320 dependency, 23 configuration, 8 unchanged independent native-match and 12
   helper-isolation cases, plus actual registration/ownership/related/child/mutation/
   visibility/concurrency controls. No current scoped failure remains.

5. Final focused V2 passed on all eight changed source and both test paths:

   ```sh
   pnpm exec eslint packages/access-router/src/acl/populate-target-configuration.ts packages/access-router/src/acl/populate-target.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/core.ts packages/access-router/src/meta.ts packages/access-router/src/model.ts packages/access-router/src/services/service.ts packages/access-router/test/populate-operation-policy.binding.test.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts > _tmp-mpo/mpo00-final-eslint.log 2>&1
   pnpm exec prettier --check packages/access-router/src/acl/populate-target-configuration.ts packages/access-router/src/acl/populate-target.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/core.ts packages/access-router/src/meta.ts packages/access-router/src/model.ts packages/access-router/src/services/service.ts packages/access-router/test/populate-operation-policy.binding.test.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts > _tmp-mpo/mpo00-final-prettier.log 2>&1
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.binding.test.ts || test "$?" -eq 1
   ```

   Generated `.d.ts`/`.d.mts` inspection confirms public `Populate` remains exactly
   path/select/match/access and helpers still return `Promise<Populate[]>`; none of
   the new private helper functions is a root/advanced callable export. The
   server-derived descriptor binding is not a new caller capability. Taskfile
   formatting/new-file whitespace and final status/index checks are recorded below.

MPO-01 handoff:

- Preserve `capturePopulateTargetBinding` → `AuthorizationRelatedTarget.model` →
  `withCapturedPopulateModel` / `fetchBinding.model` → `setPopulateTargetMeta` as the
  actual-instance chain while changing flag ownership/default capture. The captured
  model and its policy must stay together; do not replace them with a later name lookup.
- Keep `getModelReference`'s explicit owner and live schema-ref resolution. Static
  string/Model refs and dotted embedded/array paths have actual binding evidence;
  dynamic callback/refPath admission remains deliberately controlled/unsupported.
  Ordinary explicit cross-connection models are not subject to private one-hop's
  same-connection/static-string restriction. Batch-shape fallback is independent.
- Both operation flags and this new suite still use the **current global API**.
  MPO-01 owns the model/default migration, and MPO-02 owns its nested/default/decorator
  integration. Helper/canonical metadata now carries the captured actual model in
  both paths; retain original selection/native-match isolation and independent gates.
- MPO-00 scoped implementation/V1/V2 criteria are satisfied. Existing POP-07 remains
  `in_progress` for refreshed V3/V4 and independent MPO-04 acceptance; POP-01/POP-05
  remain blocked. Complete server/pack/consumer checks belong to MPO-03 and final
  integration/independent closure to MPO-04. No full server or full-root test result
  is claimed here. HEAD/index/manifest/lockfile/generated audit found only intended
  task work, no staged changes, commits, dependency updates or hand-edited output.

Handoff integrity passed after the evidence was recorded:

```sh
pnpm exec prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md
pnpm exec prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md
git diff --check
git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md || test "$?" -eq 1
git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.binding.test.ts || test "$?" -eq 1
```

No-index checks emitted no whitespace diagnostics; expected new-file diff exit
status 1 was handled explicitly. MPO-00 was marked completed only after its scoped
runtime/type/style/whitespace gates passed. Final review of the diff/status
preserved both coordinator records, left MPO-01..04 pending and POP-01/POP-05
blocked, with POP-07 still in_progress.
The index remains empty; only the eight source files, two tests and two task records
are intended changes. Final source/test/task formatting, tracked/new-file whitespace,
HEAD/index and worker checks were repeated at handoff without another shared build.

### Task MPO-01: Implement target-model storage, inheritance and captured policy

Status: completed — scoped runtime/types/V2 passed and subsequent nested/decorator integration and independent final acceptance are complete.

Kind: improvement

Priority: P1 — copied defaults and source/global carriers cannot govern another target's access requirement.

Dependencies: MPO-00.

Primary ownership: model/default/public types and runtime option storage/setters;
shared flag resolution, source/related/private target capture, dispatch/default
snapshot plumbing; focused configuration, capture and type regressions.

Finding: both flags are global, and bulk model updates copy defaults. Types alone
cannot provide independent target settings or live inheritance; nested captures
currently transport global/source-derived values.

References: `src/interfaces/root.ts`, `runtime.ts`, `options/manager.ts`,
`src/acl/{model-output-planning,model-service-owner,related-execution,virtual-populate-dependencies,subdocument-output}.ts`,
`src/services/service.ts` and `src/core.ts`.

Requirements:

1. Implement C1's model/default surface and normalization; remove global capability
   and provide clear invalid-global-scope diagnostics rather than silent rebroadcast.
2. Prevent materialized inherited values for these flags only. Undefined clearing,
   omitted/unrelated updates and new/old models must follow C1 resolution independently.
3. Implement coherent captured default/target resolution C2; final executor consumes
   the held target value, including self-ref/private and ordinary related stages.
4. Keep previous row/field/ID/query/persistence contracts and model ownership intact.

Acceptance criteria:

- Document false and User true behave differently in one request regardless of
  source settings; default false with explicit true and inverse both work.
- All model/default bulk/exact/router setter forms, malformed values, undefined
  restoration, default clearing and unrelated updates have observable controls.
- Default changes affect later calls for existing unoverridden models but not
  active captures; explicit target overrides remain authoritative.
- Strict types expose flags on model/default surfaces only; business data names remain valid.

Verification: V1 before/after configuration/capture tests and affected prior policy
suites; relevant strict consumers and V2. Record internal defaults/target handoff for MPO-02.

#### MPO-01 implementation and MPO-02 handoff

Fresh sequential MPO-01 owner read this complete task (including C1-C4, MPO-00's
actual implementation and handoff), root `AGENTS.md` and `ai-friendly-ts-package`.
MPO-01 was set to `in_progress` before implementation. The existing MPO-00 source,
binding regressions, new plan and previous POP-07 record were preserved. The
coordinator waited; no nested agent or competing shared-output build was used.

Environment rechecked: Node `v26.12.1`, pnpm `11.18.0`. `ls -ld . _tmp-mpo` verified
the existing repository/scratch parents, and `git check-ignore -v _tmp-mpo/probe`
matched `.gitignore:8:_tmp*`. Logs and installed-type fixtures used that ignored
parent. `ps -C node,pnpm,esbuild,tsc -o comm,args` inspections before shared builds
found no competing workers. Every build/test invocation was serialized; existing
Vitest `fileParallelism: false` was retained. Commands below ran at repository root;
quoted `<repo-root>` was expanded from `$PWD` when executed.

Actual changes, relative to `packages/access-router`:

- `src/interfaces/{root,router-hooks}.ts`: both optional booleans now belong to
  `DefaultModelRouterOptions`, inherited by model/extended option keys. They are
  absent from `GlobalOptions`. Shipped JSDoc explains actual-target ownership,
  independent runtime defaults, primitive-false bypass, undefined inheritance,
  stored versus effective snapshots and migration. Public query/service/Populate
  surfaces gain no new control.
- New `src/options/populate-policy.ts`: bounded shared key list and setter
  normalization (`undefined` remains undefined; every other non-false value becomes
  true). `runtime.ts` initializes model defaults to true; removes only these two
  inherited keys before bulk model-default materialization, retaining explicit
  stored/supplied values including undefined. Exact and whole model/default/router
  setters agree. Other copied-default/shallow behavior remains intact. Stale global
  bulk/exact/API-alias usage throws before assignment with target-model and
  `setModelOptions` / `setDefaultModelOptions` migration instructions. Accepted
  globals keep their previous shallow copy, authentication, logger and budget roles.
- New `src/acl/populate-policy.ts`: private `PopulatePolicyDefaultsToken`,
  `capturePopulatePolicyDefaults`, `resolvePopulatePolicy` and
  `getCapturedPopulatePolicyDefaults`. The token owns one frozen strict pair in a
  WeakMap and survives authorization copying by function identity. Each actual
  target resolves independently with exact undefined fallback, then `!== false`;
  neither null nor a source/sibling override can relax another target.
- `src/acl/model-service-owner.ts`, `src/services/service.ts`, `src/core.ts`:
  `modelServicePopulatePolicyDefaults(receiver, runtime)` replaces the old
  populate-only global snapshot cache. `modelServiceOptions(receiver, runtime,
read)` captures defaults **before** reading source options. Configuration and
  ordinary related/helper capture receive the same token before awaits; later
  top-level dispatches on the same service/request refresh it.
- `src/acl/{model-output-planning,related-execution,virtual-populate-dependencies,service-authorization,subdocument-output}.ts`:
  `AuthorizationConfiguration.populatePolicyDefaults` carries the originating token.
  Ordinary/include/private captures resolve each target's own values, including
  proposed self-ref options during eager validation. Private capture no longer uses
  one globally resolved pair outside target capture. Dedicated-child preparation
  extracts the actual captured defaults token instead of passing source-resolved
  authorization configuration as target defaults. Derived/output copies retain the
  token and terminal target policies; the executors consume held target flags.
  The MPO-00 actual-instance chain and mandatory configuration/field/row/ID checks
  were retained, including explicitly registered cross-connection ordinary refs.
- New `test/populate-operation-policy.target-options.test.ts`: **27 cases**, including
  all model/default/router whole/exact forms, malformed values, explicit undefined,
  omission, default clearing, old/new models, unrelated updates, repeated setup,
  construction snapshots, bootstrap restore, global rejection/atomicity, raw-null
  strictness and runtime isolation. Captures cover mixed source/Document/User
  settings, Document's own private User inputs, self refs, child defaults, token
  identity and defaults captured before either source or target option reads.
  Awaited calls retain defaults/target overrides and later same-service calls refresh.
  Real Mongo tests cover all four independent flag pairs in both hydration modes,
  differently configured simultaneous targets, exact denied IDs, inherited-default
  changes, private/public separation and same-spelled filter/create/update data.
- `test/{populate-operation-policy,private-populate-read-policy}.config.test.ts`:
  migrated existing strict/default/snapshot tests and source-versus-target controls;
  preserved mandatory registration/schema/pre-write failure and no-I/O assertions.
  `test/private-populate-read-policy.types.fixture.ts` and the focused POP-04 cases
  in `test/export-contract.test.ts` now require model/default/extended flags and
  reject global, wire, per-query and service authority placements.
- Bounded runtime fixture migration to default-model setters, with business
  assertions retained: `test/populate-operation-policy.{binding,helper-isolation,review,queries,dependencies}.test.ts`,
  `test/private-populate-read-policy.{runtime,review}.test.ts`,
  `test/virtuals-populate-dependencies.{config,traversal,performance,operation-guards,parity}.test.ts`,
  `test/model-router.integration.test.ts`,
  `test/service-authorization-final-review.integration.test.ts`, and
  `test/subdocument-populate-authorization.integration.test.ts`. This includes the
  existing 136 binding cases; their actual-model/zero-write/zero-unintended-I/O
  assertions were not weakened.

Actual verification and corrected attempts:

1. Fresh baseline closure and new before-feature suite:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo01-before-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.target-options.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-before-target-options.json' > _tmp-mpo/mpo01-before-target-options.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.target-options.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-before-target-options-corrected.json' > _tmp-mpo/mpo01-before-target-options-corrected.log 2>&1
   ```

   Closure passed. The first **20 failed / 0 passed** included two fixture mistakes:
   repeated `createRouter` collided with existing OpenAPI routes, and strict private
   denial omits the virtual rather than returning null. Corrected both before any
   production edit, retaining real business assertions. The meaningful corrected
   result was still **20 failed / 0 passed**, **5.32s**: model-default built-ins were
   absent, effective target flags remained global, stale globals were accepted,
   source/target capture used the wrong scope and later default changes were inert.

2. Initial implementation and focused configuration/type checks:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo01-first-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.target-options.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-first-target-options.json' > _tmp-mpo/mpo01-first-target-options.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/strict-consumer-types.test.ts test/export-contract.test.ts -t 'MPO-01|POP-01|PPR-01|POP-04' --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-config-types-first.json' > _tmp-mpo/mpo01-config-types-first.log 2>&1
   ```

   Closure passed, then **20/20** new cases and **68 selected checks / 5 files**
   passed. The latter invocation intentionally excluded 69 unrelated consumer cases
   via the test-name filter; those are not claimed as executed. Expanded the new
   suite to 27 for early source-option capture, raw-null handling, held target
   overrides, new-model copied-default controls and business writes.

3. Fresh closure/source typecheck and affected runtime suites:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo01-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.config.test.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.dependencies.test.ts test/populate-operation-policy.binding.test.ts test/populate-operation-policy.helper-isolation.test.ts test/populate-operation-policy.review.test.ts test/private-populate-read-policy.config.test.ts test/private-populate-read-policy.runtime.test.ts test/private-populate-read-policy.review.test.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.parity.test.ts test/model-router.integration.test.ts test/service-authorization-final-review.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-defaults.integration.test.ts test/runtime-isolation.integration.test.ts test/retained-model-service-ownership.integration.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-focused.json' > _tmp-mpo/mpo01-focused.log 2>&1
   ```

   Five-package closure and `tsc --noEmit -p tsconfig.typecheck.json` passed.
   **1,400/1,400 tests / 23 files passed**, **445.12s**, zero failed/skipped/todo.
   Includes all 27 new, 136 binding, 84 ordinary-query, 320 dependency, 12 helper,
   8 independent review and 43 configuration cases, plus defaults/ownership and
   existing nested/parity, hidden-write, concurrency/query-count controls. These
   existing nested controls are preservation evidence; MPO-02 still owns the new
   full target-mixed nested/decorator acceptance matrix.

4. Final compatibility audit retained the pre-existing shallow spread for accepted
   global assignments (including frozen snapshots and logger identity). Added that
   positive control to global-rejection tests. No flag resolution/capture logic
   changed after item 3. Fresh closure/source types, affected configuration/globals
   and installed declaration lanes were then checked:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo01-final-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/options-ownership.test.ts test/logger-redaction.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-final-config.json' > _tmp-mpo/mpo01-final-config.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts -t 'POP-04' --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo01-final-types.json' > _tmp-mpo/mpo01-final-types.log 2>&1
   ```

   Final source typecheck passed. **87/87 runtime cases / 5 files**, **11.49s**;
   all 27 new and 43 existing configuration cases plus 6 ownership/11 logger controls
   passed. **5 selected installed-type/declaration cases / 2 files**, **25.77s**,
   passed: strict Bundler `.ts`, NodeNext ESM `.mts` and CJS `.cts`, `skipLibCheck:
false`, and root/advanced hover/type inspection in both `.d.ts`/`.d.mts`. The
   name filter excluded 69 unrelated cases. Generated declarations expose the pair
   only on model/default/extended options, with the new JSDoc; the new token/helpers
   are not root/advanced callable exports. This is scoped consumer evidence, not
   the full packed-artifact/V3 run reserved for MPO-03.

5. Focused V2 passed on all 13 owned source and 20 owned test paths (including
   fixture-only changes to earlier owners' tests). Formatting was applied before
   the main run; final lint/style commands were:

   ```sh
   pnpm exec eslint packages/access-router/src/options/populate-policy.ts packages/access-router/src/acl/populate-policy.ts packages/access-router/src/runtime.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/core.ts packages/access-router/src/services/service.ts packages/access-router/test/populate-operation-policy.target-options.test.ts packages/access-router/test/populate-operation-policy.config.test.ts packages/access-router/test/private-populate-read-policy.config.test.ts packages/access-router/test/private-populate-read-policy.types.fixture.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/populate-operation-policy.binding.test.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts packages/access-router/test/populate-operation-policy.review.test.ts packages/access-router/test/populate-operation-policy.queries.test.ts packages/access-router/test/populate-operation-policy.dependencies.test.ts packages/access-router/test/private-populate-read-policy.runtime.test.ts packages/access-router/test/private-populate-read-policy.review.test.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts packages/access-router/test/virtuals-populate-dependencies.traversal.test.ts packages/access-router/test/virtuals-populate-dependencies.performance.test.ts packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts packages/access-router/test/virtuals-populate-dependencies.parity.test.ts packages/access-router/test/model-router.integration.test.ts packages/access-router/test/service-authorization-final-review.integration.test.ts packages/access-router/test/subdocument-populate-authorization.integration.test.ts > _tmp-mpo/mpo01-final-eslint.log 2>&1
   pnpm exec prettier --check packages/access-router/src/options/populate-policy.ts packages/access-router/src/acl/populate-policy.ts packages/access-router/src/runtime.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/core.ts packages/access-router/src/services/service.ts packages/access-router/test/populate-operation-policy.target-options.test.ts packages/access-router/test/populate-operation-policy.config.test.ts packages/access-router/test/private-populate-read-policy.config.test.ts packages/access-router/test/private-populate-read-policy.types.fixture.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/populate-operation-policy.binding.test.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts packages/access-router/test/populate-operation-policy.review.test.ts packages/access-router/test/populate-operation-policy.queries.test.ts packages/access-router/test/populate-operation-policy.dependencies.test.ts packages/access-router/test/private-populate-read-policy.runtime.test.ts packages/access-router/test/private-populate-read-policy.review.test.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts packages/access-router/test/virtuals-populate-dependencies.traversal.test.ts packages/access-router/test/virtuals-populate-dependencies.performance.test.ts packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts packages/access-router/test/virtuals-populate-dependencies.parity.test.ts packages/access-router/test/model-router.integration.test.ts packages/access-router/test/service-authorization-final-review.integration.test.ts packages/access-router/test/subdocument-populate-authorization.integration.test.ts > _tmp-mpo/mpo01-final-prettier.log 2>&1
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/src/acl/populate-policy.ts || test "$?" -eq 1
   git diff --no-index --check -- /dev/null packages/access-router/src/options/populate-policy.ts || test "$?" -eq 1
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.target-options.test.ts || test "$?" -eq 1
   ```

   ESLint emitted no diagnostics; Prettier passed; tracked/new-owned-file whitespace
   checks emitted no diagnostics. New-file diff status 1 was handled explicitly.

MPO-02 handoff:

- Carry `AuthorizationConfiguration.populatePolicyDefaults` as a
  `PopulatePolicyDefaultsToken`. Use `getCapturedPopulatePolicyDefaults(config)`
  for nested/child handoffs, not either resolved source flag. `captureRelatedTargets`
  takes this token as its fifth argument; model/private capture functions take it
  as their fourth. `resolvePopulatePolicy(targetOptions, token)` is the shared
  strict resolution helper. Capture a fresh token only at a new owning operation;
  `modelServicePopulatePolicyDefaults` caches it per top-level dispatch, while
  `modelServiceOptions` captures before reading source options.
- Preserve MPO-00's `capturePopulateTargetBinding` →
  `AuthorizationRelatedTarget.model` → `withCapturedPopulateModel` /
  `fetchBinding.model` → `setPopulateTargetMeta` chain. No later name/connection
  lookup may replace that admitted instance. Private targets remain terminal and
  use their own dependency flag; Document referencing User is governed by User.
- All server runtime fixtures touched for the focused gates now configure model
  defaults; the new suite supplies explicit per-target differences. No decorator
  source/fixture was changed. MPO-02 owns repeated decorator initialization,
  rollback, new mixed-target nested/include/embedded/dedicated mutation coverage
  and remaining integration acceptance. Its task stays pending for the fresh owner.
- MPO-03 still owns full shipped docs/examples and real transformed packed fixtures,
  notably `test/documentation-examples.test.ts` and
  `test/virtuals-populate-dependencies.consumer.runtime.fixture.ts`, plus complete
  V3/website checks. MPO-04 retains final V4/independent POP-07 acceptance. Earlier
  historical global-policy evidence remains history. No complete-server, website,
  packed artifact or root test success is claimed here.
- MPO-01 runtime/type/style criteria have passed with no outstanding scoped blocker.
  Final task formatting/whitespace and worktree/index/manifest/generated-output
  integrity checks are recorded at handoff. The coordinator's and MPO-00's work
  remain intact; no staged changes, commits, reverts, dependency updates, publishing
  or manual generated-output edits were made.

Handoff task formatting and whitespace passed after recording the evidence:

```sh
pnpm exec prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
pnpm exec prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md
git diff --check
git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
```

MPO-01 was then marked completed, leaving MPO-02..04 pending and POP-07's
independent acceptance unchanged. Final integrity checks confirm an empty index,
no changed manifest/lockfile/tracked dist paths, only intended task/source/test
changes and no active build/test workers. The status-only task edit receives one
last task formatting/whitespace check; no shared rebuild is needed for that edit.

### Task MPO-02: Enforce target ownership through nested and decorator flows

Status: completed — scoped nested/runtime/decorator checks and corrected integrated acceptance passed, including MPO-05's captured include receiver correction.

Kind: improvement

Priority: P1 — secondary stages and repeated bootstrap calls must not apply source flags or freeze inherited defaults.

Dependencies: MPO-01.

Primary ownership: related/include/embedded/dedicated output and derived-execution
handoffs, scoped decorator/factory integration, targeted nested/snapshot regressions.

Finding: dedicated child output currently reuses source configuration as a global
carrier, and decorator registration can perform another bulk model setup. Both are
material inheritance/ownership boundaries beyond the basic target gate.

References: `src/acl/subdocument-output.ts`, related/service execution and include
capture; `packages/access-router-deco/src/{factory,property-options}.ts` and scoped
property decorators.

Requirements:

1. Verify/fix target-owned policy through ordinary targets' own virtuals, legacy/
   correlated includes, nested embedded occurrences, dedicated reads/mutations,
   fallback/upsert/new and cached output copies under both hydration modes.
2. ModelOption/DefaultModelOption gain flags, GlobalOption loses them; preserve
   bool/undefined validation, precedence, initialization transactions and rollback.
3. Cover source false/target true, inverse, mixed flags, multiple targets, recursive
   public traversal with terminal private reads and limit-one completion.
4. Awaited target/default replacement and same-service subsequent calls retain
   snapshot boundaries without mode/cache/actor/row-policy confusion.

Acceptance criteria:

- No source or sibling model can relax a strict target through any approved seam.
- Decorator repeated empty/bulk setup preserves inheritance and explicit overrides.
- Nested/default/rollback/parity controls pass alongside exact original-ID, private
  mask, field/row/match, model binding, hidden-write and concurrency regressions.

Verification: V1 targeted nested/parity/ownership/default tests, freshly built
decorator property/factory/type suites and V2. Record actual measured query/bound
controls where implementation touches batching; no unmeasured performance claim.

#### MPO-02 implementation, verification and MPO-03 handoff

Fresh sequential MPO-02 owner read this complete task, C1-C4, actual MPO-00/01
implementation evidence/handoffs, root `AGENTS.md` and `ai-friendly-ts-package`.
MPO-02 was set to `in_progress` before implementation. Prior source, tests, both
private default-policy helpers and task records were preserved. The continuation
rechecked the actual worktree and saved JSON reports before reusing passing checks.
No nested agents or competing shared-output builds were used; the coordinator waited.

Environment: Node `v26.12.1`, pnpm `11.18.0`, HEAD `49699bb`. Before writing logs,
`ls -ld . _tmp-mpo` verified the existing repository/scratch parents;
`git check-ignore -v _tmp-mpo/probe` matched `.gitignore:8:_tmp*`.
`ps -C node,pnpm,esbuild,tsc -o comm,args` inspections found no competing workers.
Build/test commands were serialized. The server retains `fileParallelism: false`;
the decorator config does not set it, so every focused decorator invocation below
explicitly used `--fileParallelism=false`. Consumer staging uses `os.tmpdir()`, so
the supplied `TMPDIR` placed its temporary declaration fixtures under `_tmp-mpo`.
Commands ran from repository root; quoted `<repo-root>` below was expanded from
`$PWD` at execution. Evidence paths are repository-relative.

Actual changes:

- New `packages/access-router/test/populate-operation-policy.nested-targets.test.ts`:
  **164 real Mongo cases**, both hydration modes, independent Q/D pairs, explicit
  Document overrides opposing captured defaults and an inversely configured User
  in the same call. Covers ordinary scalar/duplicate-array/string-ref fallback
  targets and their own private virtual inputs; embedded object/nested/document-array
  occurrences; dedicated list/read/create/update/bulkUpdate with separate parent,
  child and visibility grants; create/update/both upsert branches/new responses;
  legacy/correlated read/list/count attachments and recursive public
  Project → Document → Project includes; self refs; read/readFilter list fallbacks;
  detached/cache copies; source row/field suspension and later calls on the **same
  service/request**. Default and target updates remain frozen in flight and refresh
  on subsequent dispatches. Include provenance survives a source-ref exclusion;
  private outcomes do not replace authorized original IDs. Query false retains
  match/target rows/fields; denied ordinary targets keep exact IDs while admitted
  misses yield null/filtered arrays. Direct/root target guards remain denied.
  Target hook context keeps its actual Mongoose model and public mask. Per-getter
  fourth-argument masks, terminal private reads, Date/ObjectId/native-copy isolation
  and parent versus target document grants have explicit assertions.
- New `packages/access-router-deco/test/populate-policy.integration.test.ts`:
  **24 cases**, importing freshly built `dist/index.mjs`. The real factory applies
  bulk defaults/model providers, exact properties, model-router bulk options and
  another empty `createRouter(Model, {})`. Real same-service reads verify live
  inheritance, explicit overrides and undefined clearing across that sequence;
  an independently strict User cannot borrow Project/Document bypasses. Late mount
  failure restores default/model/cleared-override state and old raw/construction
  snapshots, then retry publishes once. Invalid initialization rolls back; scoped,
  inferred, legacy and bulk stale global placements fail with migration diagnostics.
- `packages/access-router-deco/src/{property-options,factory}.ts`: bounded preflight
  rejection of the two moved keys on actual global/module roles, before value
  validation/setters. Before this correction, malformed legacy/GlobalOption values
  reported only a boolean-value error instead of the required scope migration.
  The diagnostic names target-model configuration, scoped providers and
  `setModelOptions` / `setDefaultModelOptions`. Model/default boolean-or-undefined
  validation and unknown extension/other option contracts remain covered.
- `packages/access-router-deco/src/decorators/property.decorators.ts`: shipped
  JSDoc describes actual-target ownership, independent live defaults, explicit
  undefined clearing, held captures and direct/root guards; removes the obsolete
  global-policy promise. The scoped key types already inherit MPO-01's server
  interfaces. `test/hydration-consumer.types.fixture.ts` now proves both flags on
  model/default scoped and bulk surfaces, rejects global/bad-type/unknown-key
  placements and preserves hydration/retired-control assertions.
  `test/property-contracts.test.ts` moves only the flags' legacy positive/invalid
  value controls to default-model providers, retaining extension/undefined/rollback
  behavior and all unrelated global scalar tests.
- Reviewed actual nested source, including `subdocument-output.ts`,
  `subdocument-authorization.ts`, `related-execution.ts`, service derivation and
  dispatch. MPO-01's owned token transport works through these approved seams;
  this stage needed no server production edit. Its runtime and MPO-00's validated
  actual-instance chain were exercised by fresh binding/parity/ownership controls.

Actual commands/results and corrected attempts:

1. Fresh pre-edit six-package closure and initial probes:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router-deco... build > _tmp-mpo/mpo02-before-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.nested-targets.test.ts --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-before-nested.json' > _tmp-mpo/mpo02-before-nested.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/property-contracts.test.ts test/strict-consumer-types.test.ts --fileParallelism=false --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-before-decorator.json' > _tmp-mpo/mpo02-before-decorator.log 2>&1
   ```

   Closure passed. Initial nested suite: **98 passed / 24 failed / 122 cases**.
   All failures were new test-oracle mistakes: dedicated update/bulkUpdate performs
   two parent permission stages; `new()` has no ordinary-populate stage; include
   read does not use public read-to-list fallback, and correlated include options
   must be absent/empty. Corrected those expectations against actual source/native
   contracts without changing server behavior. Existing decorator probes:
   **37 passed / 4 failed / 41 cases**; the two legacy positives still expected
   global flags and the two strict consumer lanes still promised global-only scope.

   The expanded nested attempt (`mpo02-before-nested-corrected.log`) was terminated
   by the 120s command timeout before a JSON report; no completed count is claimed.
   A narrow `-t 'initial target pair=false.*source-row' --reporter=verbose` probe
   passed **2 selected / 154 excluded** (`mpo02-async-probe.log`). A guarded
   suspension probe then avoided waiting on operations already rejected by admission:

   ```sh
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.nested-targets.test.ts -t 'initial target' --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-async.json' > _tmp-mpo/mpo02-async.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.nested-targets.test.ts --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-nested-first.json' > _tmp-mpo/mpo02-nested-first.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/populate-policy.integration.test.ts --fileParallelism=false --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-decorator-first.json' > _tmp-mpo/mpo02-decorator-first.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/populate-policy.integration.test.ts -t 'stale module' --fileParallelism=false --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-before-global-scope.json' > _tmp-mpo/mpo02-before-global-scope.log 2>&1
   ```

   Async probe: **28 passed / 4 failed / 124 excluded**; all four rejected unsupported
   correlated `args.populate`. Kept correlated private virtual traversal but removed
   that unsupported public arg. Next full nested run: **154 passed / 2 failed**,
   **30.47s**; corrected dedicated parent-denial expectation from unauthorized to its
   existing forbidden result. The initial built decorator integration passed
   **24/24**. Expanding malformed global values retained a meaningful before-fix
   diagnostic regression: **4 passed / 4 failed / 16 excluded**. Both explicit
   legacy/scoped forms failed migration-message assertions for each flag; bulk and
   inferred-undefined scope rejection controls passed. The preflight fix above
   corrects that bounded gap. No worker was left running after the timed-out attempt.

2. Fresh final source closure/type gates and decorator property/factory/type run:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router-deco... build > _tmp-mpo/mpo02-built-closure.log 2>&1
   pnpm --filter @web-ts-toolkit/access-router-deco typecheck > _tmp-mpo/mpo02-decorator-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/populate-policy.integration.test.ts test/property-contracts.test.ts test/factory.test.ts test/bootstrap-transaction.test.ts test/hydration-configuration.test.ts test/strict-consumer-types.test.ts --fileParallelism=false --reporter=json --outputFile='<repo-root>/_tmp-mpo/mpo02-decorator-focused.json' > _tmp-mpo/mpo02-decorator-focused.log 2>&1
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo02-server-typecheck.log 2>&1
   ```

   Six-package closure and decorator source `tsc --noEmit` passed. All
   **237/237 decorator checks / 6 files**, **43.92s**, zero skipped/failed/todo,
   including 24 new, property/factory/default ordering and bootstrap transaction
   controls, passed. Strict staged consumers compile the refreshed fixture under
   NodeNext and Bundler with `skipLibCheck: false`. Generated decorator `.d.ts`
   and `.d.mts` contain the new public JSDoc and inherit the correct scoped key
   types; no private scope/default-token helper became a public export.
   The server typecheck script freshly rebuilt its five-package closure and
   passed `tsc --noEmit -p tsconfig.typecheck.json`.

3. Fresh V1 focused server acceptance run:

   ```sh
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.nested-targets.test.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.config.test.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.dependencies.test.ts test/populate-operation-policy.binding.test.ts test/populate-operation-policy.helper-isolation.test.ts test/populate-operation-policy.review.test.ts test/private-populate-read-policy.config.test.ts test/private-populate-read-policy.runtime.test.ts test/private-populate-read-policy.review.test.ts test/virtuals-populate-dependencies.parity.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.fallback.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/service-defaults.integration.test.ts test/retained-model-service-ownership.integration.test.ts test/runtime-isolation.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-final-review.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/request-hook-concurrency.test.ts test/include-source-provenance.integration.test.ts test/options-ownership.test.ts test/logger-redaction.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo02-server-focused.json' > _tmp-mpo/mpo02-server-focused.log 2>&1
   ```

   **1,702/1,702 tests / 31 files passed**, **574.58s**, no failed/skipped/todo.
   Includes the then-complete **156-case new nested suite**, all 136 actual-binding,
   84 query, 320 dependency, 12 native/helper-isolation, 8 independent review,
   184 parity, 154 fallback, 80 include-provenance, 71 hidden-child-mutation,
   defaults/ownership/logger, parent/child grants and concurrency controls.
   Source remained unchanged after this passing run.

   Final criterion audit added only eight recursive public include cases (both
   modes, both hydration modes, opposite User D values), tested against that same
   fresh build:

   ```sh
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.nested-targets.test.ts -t 'recursive public includes' --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo02-recursive-public.json' > _tmp-mpo/mpo02-recursive-public.log 2>&1
   ```

   **8/8 selected passed**, **4.32s**, 156 already-validated cases excluded by the
   name filter. This yields **164 distinct passing new cases**, **1,710 distinct
   scoped server cases across the same 31 files**, not a claim that a second
   combined 1,710-case invocation was run. Recursive public output keeps the strict
   User terminal loader closed with zero User reads; inverse policy admits only
   declared inputs and never invokes User's own virtual/private recursion.

   Measured new union/cache controls: eight source rows with duplicate public
   Document refs plus private Date/secret masks use **one Document find and zero
   User finds**. Mutating a getter's private Date leaves fetched native rows intact.
   Mixed embedded occurrences use **one find for the admitted private target and
   zero for the independently strict sibling**. Scalar/identity/helpers/count-only
   includes add zero private finds. Concurrency-one execution completed in both
   modes. No batching implementation was changed or general performance claim made.

4. Final focused V2 source/test lint, style and whitespace:

   ```sh
   pnpm exec eslint packages/access-router/test/populate-operation-policy.nested-targets.test.ts packages/access-router-deco/src/property-options.ts packages/access-router-deco/src/factory.ts packages/access-router-deco/src/decorators/property.decorators.ts packages/access-router-deco/test/populate-policy.integration.test.ts packages/access-router-deco/test/property-contracts.test.ts packages/access-router-deco/test/hydration-consumer.types.fixture.ts > _tmp-mpo/mpo02-final-eslint.log 2>&1
   pnpm exec prettier --check packages/access-router/test/populate-operation-policy.nested-targets.test.ts packages/access-router-deco/src/property-options.ts packages/access-router-deco/src/factory.ts packages/access-router-deco/src/decorators/property.decorators.ts packages/access-router-deco/test/populate-policy.integration.test.ts packages/access-router-deco/test/property-contracts.test.ts packages/access-router-deco/test/hydration-consumer.types.fixture.ts > _tmp-mpo/mpo02-final-prettier.log 2>&1
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.nested-targets.test.ts
   git diff --no-index --check -- /dev/null packages/access-router-deco/test/populate-policy.integration.test.ts
   ```

   ESLint emitted no diagnostics; Prettier passed; tracked and new-test whitespace
   checks emitted no diagnostics. Final task formatting/whitespace and index/worker
   integrity are checked after this evidence/status update.

MPO-03 handoff:

- MPO-02's runtime/nested/decorator acceptance and V2 are satisfied with no scoped
  blocker. Preserve the exact two-key decorator scope check, bool/undefined model
  validation and typed inheritance from server interfaces. Unknown extension keys
  remain legacy-compatible; there is no global alias/broadcast of moved keys.
- Continue to propagate the owned `PopulatePolicyDefaultsToken` from source
  configuration through nested captures; never substitute source-resolved flags.
  Preserve MPO-00's actual-target instance/descriptor chain. Dedicated targets,
  admitted misses, denied IDs, field/row/match, native copies and private masks have
  current positive/negative evidence above. `new()` retains its existing no-ordinary-
  populate behavior. Correlated include args still reject `populate` and nonempty
  options; public read/list fallback is a separate preserved entry seam.
- MPO-03 owns remaining shipped README/llms/website and runnable docs/examples,
  complete V3 and real transformed packed/artifact consumers. In particular, the
  decorator README's boolean list still labels this pair global/module and needs
  migration; its public decorator JSDoc/type fixture is already updated here.
  Preserve the scope of that documentation pass and the previous handoffs' server
  consumer fixture hotspots. The checks above are focused, with current declaration
  staging, not full server/packed/website/root acceptance.
- MPO-03/MPO-04 remain pending. Independent POP-07 acceptance and final V4 remain
  with MPO-04. Prior failed probes/history remain recorded. Final integrity review
  found the prior owners' source/tests/docs/helpers intact, an empty index and no
  manifest/lockfile/tracked dist changes; no commit, staging, revert, dependency
  specification update, publish or hand-edited generated file was made.

Final closure audit re-read the saved reports: server **1,702 passed / 31 files**,
recursive additions **8 passed / 156 excluded**, decorator **237 passed / 6 files**;
each JSON reports success. Comparing passing test names confirms eight distinct
additions and **1,710 distinct scoped server cases**. No source change invalidated
the completed build/type/runtime checks, so the 574.58s server run was retained.
Task formatting, tracked/new-file whitespace, manifest/lockfile/tracked-dist and
empty-index audits passed. Final workers were absent; prior-owner and unrelated
work were preserved.

During the final `pnpm exec prettier --write` invocation, pnpm automatically
refreshed installed dependencies from the existing lockfile (reported 56 added,
25 removed, zero downloads). This was not an explicit install/update command;
subsequent `git status` and manifest/lockfile audits confirmed no dependency
specification changes. Record that automatic installed-state refresh separately
from the unchanged source/check evidence. The final status-only formatter below
uses the installed binary directly.

```sh
pnpm exec prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
pnpm exec prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md
git diff --check
git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.nested-targets.test.ts
git diff --no-index --check -- /dev/null packages/access-router-deco/test/populate-policy.integration.test.ts
git diff --cached --stat
git diff --name-only -- ':(glob)**/package.json' ':(glob)**/*lock*' ':(glob)**/dist/**'
ps -C node,pnpm,esbuild,tsc -o comm,args
```

MPO-02 was marked completed after its scoped checks passed. Final status-only task
formatting/whitespace is verified with:

```sh
./node_modules/.bin/prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
./node_modules/.bin/prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md
git diff --check
git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
```

### Task MPO-03: Publish per-model configuration and verify real consumers

Status: completed — documentation/consumer criteria passed; MPO-04 refreshed corrected-source complete V3 and accepted applicable website/inventory evidence.

Kind: improvement

Priority: P2 — shipped examples/types must predict per-target settings and migration accurately.

Dependencies: MPO-02.

Primary ownership: server/decorator JSDoc, README/llms/website, strict/export/docs/
real transformed packed fixtures and bounded test-fixture migration.

Finding: current docs/fixtures require flags globally and prohibit model/default
placement. Those contracts must change with installed declarations and behavior.

References: server/decorator public option interfaces and fixtures; current
Document example, prior POP/PPR type controls and four V3 consumer suites.

Requirements:

1. Teach target ownership, independent defaults/overrides, undefined inheritance,
   stored versus effective snapshots, new global-scope errors and direct/root denial.
2. Run examples with differently configured Document/User targets in one runtime,
   both query/dependency paths, selected/denied fields and exact ID/miss controls.
3. Verify actual root/advanced ESM/CJS declarations/hover, scoped decorators and real
   publisher-transformed tarball/artifact consumers with strict module-resolution lanes.
4. Document the model-binding correction and current supported ref/hydration limits;
   historical task records remain history, not conflicting supported API guidance.

Acceptance criteria:

- Installed users can configure both flags per target/defaults without global setup;
  removed global placements are rejected and no caller-control capability is added.
- Complete server, current consumer/type/example suites, website and pack inventory pass.
- Runtime behavior, public declarations and all current shipped docs agree.

Verification: V2/V3, generated-declaration inspection and relevant decorator
consumer checks. Record exact freshness and independent-review hotspots.

#### MPO-03 consumer-fixture scope refinement

Before expanding `packages/access-router-deco/test/consumer-stage.ts`, the new exact
README/website ESM runner exposed an omitted link for the already-declared transitive
runtime dependency `@fast-csv/format`. The fresh four-file decorator run completed at
**57 passed / 4 failed / 61 cases**, with only those four new mixed-target executions
failing module resolution; all real transformed-tarball checks passed. Add the missing
dependency link to the existing staging helper within consumer-fixture ownership;
no dependency specification or production package change is needed. Preserve that
failure history and verify the corrected staged executions before completion.

The first complete V3 script finished at **5,059 passed / 13 failed / 5,072 tests**,
**152 passed / 2 failed / 154 files**, **1,405.33s**, with no skipped/todo cases.
All four current consumer suites passed. Before bounded fixture migration, inspect
`test/model-authorization-capture.unit.test.ts` (stale global setters and a raw old
global bag passed where the private defaults token now belongs) and
`test/service-authorization-boundary-admission.contract.test.ts` (prototype service
stub omitted its owning runtime). These are test-scaffolding migrations in MPO-03's
declared scope. Retain all capture, native/schema, request-only forwarding and
zero-dispatch/privacy assertions; provide current model-default capture/runtime
ownership and rerun the complete script after correcting the focused files.

#### MPO-03 recovery takeover

A fresh recovery owner took over the interrupted MPO-03 invocation after reading
this complete task, C1-C4 and all MPO-00..02 handoffs, root `AGENTS.md` and
`ai-friendly-ts-package`. This owner is not the original implementer; saved reports
are inherited evidence, not a claim of personally executing those checks. The
previous invocation returned no resumable identity. No agents are spawned.

Current HEAD is `f6c7112`, rather than the creation baseline `49699bb`, following
externally merged Renovate updates (including the Mongoose lockfile). Those updates
and all intentional uncommitted binding, storage, capture, decorator, docs and
fixture changes are preserved. Node is `v26.12.1`, pnpm `11.18.0`.
`ls -ld . _tmp-mpo node_modules/.bin` verified the existing parents, and
`git check-ignore -v _tmp-mpo/probe` confirmed `.gitignore:8:_tmp*` before new logs.
Process inspection found no build/test worker for this repository; an unrelated
esbuild service belongs to another project and is left alone. Shared builds/tests
remain serialized, and style checks use installed binaries directly.

The saved `mpo03-complete-server-final.log` has 5,175 lines and ends on individual
test output, without aggregate Test Files/Tests totals or a final JSON report.
With no surviving worker, it is an **interrupted attempt**, not a complete success.
The earlier completed `mpo03-complete-server.json` remains the failed 5,059/13
history above. The two migrated test files retain their original native/schema,
capture, request-only forwarding, zero-dispatch and privacy assertions; added
assertions also check held/next target policy. Fresh closure/types and complete V3
are required before marking this item complete. MPO-04 remains pending and POP-07
independent acceptance remains open.

#### MPO-03 audited changes and verification

Audited/preserved the interrupted owner's scoped changes:

- `packages/access-router/README.md` and `llms.txt`: target-owned Q/D, independent
  target/default resolution, literal-false normalization, undefined inheritance,
  stored/construction versus effective captures, global-scope migration errors and
  direct/root denial. The runnable configuration-only Document/User example uses
  actual registered models with object schemas and different policies in the same
  request, including Document's private User dependency, all four Document pairs,
  later default updates, exact authorized IDs, public masks and admitted misses.
  Binding guidance distinguishes ordinary exact-instance string/Model-valued refs
  (including configured cross-connection Models), controlled dynamic-ref rejection
  and the narrower terminal private static-string ObjectId/1D-array contract.
- Shipped server JSDoc in `src/{index,interfaces/root,interfaces/router-hooks,
interfaces/query-types}.ts`, relative to `packages/access-router`, agrees with that
  surface. `index.ts` and `query-types.ts` edits are documentation-only. Existing
  root/advanced/processors entrypoints and caller-control boundaries are retained.
  Generated root/advanced `.d.ts`/`.d.mts` and their shared declaration graph expose
  optional `boolean | undefined` on all model/default/extended surfaces, exclude the
  pair from `GlobalOptions` and query/wire authority, and retain precise `Populate`
  path/select/match/access keys. Private policy/binding helpers are not public
  callable exports or supported deep-import entrypoints.
- The four server consumer suites, `private-populate-read-policy.types.fixture.ts`
  and `virtuals-populate-dependencies.consumer.runtime.fixture.ts`: strict
  Bundler/NodeNext ESM/CJS type and hover checks, rejected global/caller placements,
  real publisher-transformed tarball and actual build-artifact consumers. The
  installed runtime fixture covers inverse Document/User pairs in one request,
  both hydration modes, arrays/nulls/order/duplicates/missing/native IDs, detached
  private Date copies, separate getter masks, public/private unions and row scope,
  denied/unselected refs, standalone denial, same-service later default changes
  and captures held across awaits. The initial packed current-major probe failed
  TS7022 for `beforeMixed`; its saved correction is an explicit `number` annotation,
  not a relaxation of strictness. Saved corrected probe: 1 passed / 9 name-filtered
  exclusions; the complete fresh run below executes all 10 packed cases.
- `packages/access-router-deco/README.md`, shipped property-decorator JSDoc and
  the existing hydration/type fixture now teach model/default scopes and global
  rejection. Its documentation suite strictly compiles and executes the exact
  README/website mixed-target module in ESM and CJS, including inheritance, closed
  User schema, exact IDs, masks/misses and root denial. The new
  `test/populate-policy.documentation.runtime.fixture.js` is consumer scaffolding;
  `test/consumer-stage.ts` adds only the missing already-declared `@fast-csv/format`
  link. Packed fixtures compile the shipped module with full library checking.
- `website/docs/packages/access-router/{configuration,hooks}.mdx` and
  `website/docs/packages/access-router-deco.md` agree with shipped guidance, including
  breaking migration without aliases, actual-model binding and hydration/private
  limits. The two bounded server scaffold migrations are described above; their
  capture/privacy/no-dispatch assertions were preserved and extended.

No server/decorator production feature correction was needed by recovery. Only
`llms.txt` code-span formatting and task evidence were edited after takeover; all
prior intentional runtime/storage/capture/binding/decorator/test work is retained.

Fresh commands below were personally executed by the recovery owner, serialized
for shared-output builds/tests. `<repo-root>` was expanded to the actual root at
execution. Each successful gate returned exit 0; logs and actual JSON totals were
inspected rather than inferring success from individual passing test lines.

1. **V2 fresh source closure/typecheck and complete V3:**

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo03-recovery-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo03-recovery-complete-server.json' > _tmp-mpo/mpo03-recovery-complete-server.log 2>&1
   ```

   The five-package closure and `tsc --noEmit -p tsconfig.typecheck.json` passed.
   The complete script freshly rebuilt that closure and finished in **1,611.94s**:
   **5,072/5,072 tests, 154/154 files**, zero failed/skipped/todo; JSON reports
   `success: true`. This includes the migrated capture **6/6** and boundary-admission
   **68/68**, retaining all 74 scaffold assertions. Required current consumers:

   | Suite                                   | Passed | Failed / skipped / todo |
   | --------------------------------------- | -----: | ----------------------- |
   | `strict-consumer-types.test.ts`         |     29 | 0 / 0 / 0               |
   | `export-contract.test.ts`               |     45 | 0 / 0 / 0               |
   | `documentation-examples.test.ts`        |     55 | 0 / 0 / 0               |
   | `packed-consumer-compatibility.test.ts` |     10 | 0 / 0 / 0               |

   These **139 checks / 4 files** are included in 5,072, not added to that count.
   This complete run satisfies V3's four-suite command without another unchanged
   consumer execution. Actual transformed tarball and build-artifact lanes execute
   ESM/CJS imports and the exact shipped runtime workflows, strict NodeNext/Node16/
   Bundler consumers, full current-peer declarations (`skipLibCheck: false`) and
   existing minimum-peer library-check boundaries. Pinned packed peers remain
   Express 5.0.0/Mongoose 8.0.0 and Express 5.2.1/Mongoose 9.8.0; the installed
   workspace used Express 5.2.1, Mongoose **9.11.4**, Vitest 4.1.11 and TypeScript
   6.0.3 from the current external lockfile/installed context.

2. **Fresh decorator closure/types and relevant installed consumers:**

   ```sh
   pnpm --filter @web-ts-toolkit/access-router-deco... build > _tmp-mpo/mpo03-recovery-decorator-build.log 2>&1
   pnpm --filter @web-ts-toolkit/access-router-deco typecheck > _tmp-mpo/mpo03-recovery-decorator-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/property-contracts.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts --fileParallelism=false --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo03-recovery-decorator-consumers.json' > _tmp-mpo/mpo03-recovery-decorator-consumers.log 2>&1
   ```

   Six-package closure and decorator `tsc --noEmit` passed. Fresh **61/61 / 4 files**,
   **194.46s**, zero failed/skipped/todo; JSON reports success: documentation **16**,
   packed compatibility **4**, property contracts **36**, strict consumers **5**.
   The earlier corrected saved JSON also verifies 61/61, but README/website mtimes
   were newer than that report, so this run refreshes their final contents. It covers
   all four mixed-target runtime executions that initially failed the omitted
   dependency link. Scoped decorator types and generated `.d.ts`/`.d.mts` JSDoc
   remain correct. Full decorator/runtime integration is still MPO-04's V4.

3. **Website workspace and raw pack inventory:**

   ```sh
   # workdir: website (its separate pnpm workspace)
   pnpm build > ../_tmp-mpo/mpo03-recovery-website-build.log 2>&1
   # workdir: packages/access-router
   npm pack --dry-run > ../../_tmp-mpo/mpo03-recovery-pack-dry-run.log 2>&1
   ```

   Parent directories were checked before these commands. Website Docusaurus 3.10.2
   client/server compilation and static generation passed. Dry-run inventory passed:
   **17 files**, **577.1 kB packed / 2.8 MB unpacked**, README, llms, manifest and
   matching JS/ESM/declaration outputs for root/advanced/processors plus the shared
   declaration graph. No source/tests/private subpath is included. This raw workspace
   inventory uses the existing placeholder manifest; the 10 real transformed
   consumer cases above verify the actual publisher/artifact manifests.

4. **Focused installed V2 style/integrity:**

   ```sh
   ./node_modules/.bin/eslint packages/access-router/src/index.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/interfaces/query-types.ts packages/access-router/test/documentation-examples.test.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts packages/access-router/test/private-populate-read-policy.types.fixture.ts packages/access-router/test/virtuals-populate-dependencies.consumer.runtime.fixture.ts packages/access-router/test/model-authorization-capture.unit.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router-deco/src/decorators/property.decorators.ts packages/access-router-deco/test/consumer-stage.ts packages/access-router-deco/test/documentation-examples.test.ts packages/access-router-deco/test/hydration-consumer.types.fixture.ts packages/access-router-deco/test/packed-consumer-compatibility.test.ts packages/access-router-deco/test/populate-policy.documentation.runtime.fixture.js > _tmp-mpo/mpo03-recovery-eslint.log 2>&1
   ./node_modules/.bin/prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md packages/access-router/README.md packages/access-router/src/index.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/interfaces/query-types.ts packages/access-router/test/documentation-examples.test.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts packages/access-router/test/private-populate-read-policy.types.fixture.ts packages/access-router/test/virtuals-populate-dependencies.consumer.runtime.fixture.ts packages/access-router/test/model-authorization-capture.unit.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router-deco/README.md packages/access-router-deco/src/decorators/property.decorators.ts packages/access-router-deco/test/consumer-stage.ts packages/access-router-deco/test/documentation-examples.test.ts packages/access-router-deco/test/hydration-consumer.types.fixture.ts packages/access-router-deco/test/packed-consumer-compatibility.test.ts packages/access-router-deco/test/populate-policy.documentation.runtime.fixture.js website/docs/packages/access-router-deco.md website/docs/packages/access-router/configuration.mdx website/docs/packages/access-router/hooks.mdx > _tmp-mpo/mpo03-recovery-prettier.log 2>&1
   ./node_modules/.bin/prettier --check --parser markdown packages/access-router/llms.txt > _tmp-mpo/mpo03-recovery-llms-prettier.log 2>&1
   ./node_modules/.bin/prettier --check --parser markdown packages/access-router/llms.txt > _tmp-mpo/mpo03-recovery-llms-prettier-final.log 2>&1
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router-deco/test/populate-policy.documentation.runtime.fixture.js
   git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md
   ```

   ESLint passed on **18 source/test paths**, without diagnostics. Prettier passed
   on the **25 listed source/test/doc/task paths**. The additional explicit Markdown
   parser check initially flagged three unquoted code spellings in `llms.txt`;
   replaced them with code spans, retaining meaning. Its final check passed.
   Tracked and both new-owned-file whitespace checks emitted no diagnostics.
   No-index checks return the expected new-file diff status 1, handled explicitly
   below; it is not a whitespace failure. Final task evidence/status formatting
   and integrity are checked once more after this section is saved.

   The post-server change was only `llms.txt` markup, not source, test, README,
   declarations or executable examples. Refreshed its two affected inventories:

   ```sh
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts -t 'packs the current JavaScript, declaration graph and shipped docs|assembles the current JavaScript, declaration graph and shipped docs in the artifact' --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo03-recovery-final-doc-inventory.json' > _tmp-mpo/mpo03-recovery-final-doc-inventory.log 2>&1
   ```

   **2/2 selected passed / 1 file**, **12.75s**, eight previously passed cases
   excluded by the name filter. The current transformed tarball/artifact contains
   byte-identical final shipped docs and the current JavaScript/declaration graph.
   This is an inventory refresh, not another complete 10-case consumer invocation.

5. **Stored freshness and handoff integrity:** current source/tests/docs, relevant
   manifests/configs and both existing lockfiles are fingerprinted, including new
   untracked implementations/fixtures:

   ```sh
   git ls-files -co --exclude-standard -z -- AGENTS.md package.json pnpm-lock.yaml packages/access-router/src packages/access-router/test packages/access-router/package.json packages/access-router/tsup.config.ts packages/access-router/vitest.config.ts packages/access-router/README.md packages/access-router/llms.txt packages/access-router-deco/src packages/access-router-deco/test packages/access-router-deco/package.json packages/access-router-deco/tsup.config.ts packages/access-router-deco/vitest.config.ts packages/access-router-deco/README.md website/package.json website/pnpm-lock.yaml website/docs/packages/access-router-deco.md website/docs/packages/access-router/configuration.mdx website/docs/packages/access-router/hooks.mdx | sort -zu | xargs -0 sha256sum > _tmp-mpo/mpo03-recovery-verified-files.sha256
   git diff --cached --stat
   git diff --name-only -- ':(glob)**/package.json' ':(glob)**/*lock*' ':(glob)**/dist/**'
   git log -1 --oneline
   ps -C node,pnpm,esbuild,tsc -o comm,args
   ```

   Index and manifest/lockfile/tracked-dist diffs are empty, HEAD remains `f6c7112`,
   and no repository build/test worker remains. Checks ran against the final
   production/test source in the current installed-dependency context. No source
   or executable example changed after the complete server/decorator runs; only
   the explicitly refreshed llms markup and task record changed afterward.

   Final evidence/status-only checks use the installed formatter and stored
   fingerprint, without another shared build:

   ```sh
   ./node_modules/.bin/prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md > _tmp-mpo/mpo03-recovery-task-format.log 2>&1
   ./node_modules/.bin/prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md > _tmp-mpo/mpo03-recovery-task-prettier.log 2>&1
   sha256sum --check _tmp-mpo/mpo03-recovery-verified-files.sha256 > _tmp-mpo/mpo03-recovery-freshness-check.log 2>&1
   git diff --check
   git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md || test "$?" -eq 1
   git diff --no-index --check -- /dev/null packages/access-router-deco/test/populate-policy.documentation.runtime.fixture.js || test "$?" -eq 1
   ```

   Final evidence formatting/whitespace and every stored fingerprint passed.
   MPO-03 was marked completed only after these scoped checks passed; a final
   status-only task style/whitespace check follows without another shared build.

#### MPO-03 independent-review handoff

MPO-03's documentation/type/installed-consumer V2/V3 criteria are satisfied with no
scoped blocker. All initial failed probes and the interrupted final attempt remain
recorded. This is scoped completion, with the overall task still in_progress.

MPO-04 stays **pending** for a fresh independent reviewer:

1. Review C1-C4 and the full intentional diff against the original baseline while
   preserving external HEAD/lockfile updates. Audit the actual-instance chain
   `capturePopulateTargetBinding` → related target `model` → captured service /
   `fetchBinding.model` → population descriptor and finalization, including
   missing/mismatched pre-write failure, explicit cross-connection positives and
   replacement across awaits. Preserve the 136 binding regressions.
2. Audit two-key storage/default inheritance and owned defaults-token transport
   through include/embedded/dedicated/derived/private stages; mixed target policy,
   same-service refresh, IDs/masks/rows, terminal private reads and decorator
   preflight/repeated setup/rollback. Existing target-options/nested tests and exact
   installed examples provide positive/negative controls; private helpers remain
   unexported capabilities.
3. Verify the saved JSON/log totals and `_tmp-mpo/mpo03-recovery-verified-files.sha256`
   against the review checkout. Run V4: root `pnpm build`, root `pnpm lint`, then
   runtime and decorator package test scripts **serially** with the repository-local
   TMPDIR. Refresh any V2/V3 gate invalidated by substantive changes; these scoped
   results do not claim root test success or final V4 acceptance.
4. Independently accept linked POP-07 and reconcile its reopened POP-01/POP-05
   dispositions only after those checks. Model/default target scope supersedes
   historical global API evidence. **POP-07 independent acceptance remains open.**

### Task MPO-04: Independently accept binding and per-target policy integration

Status: completed — the same independent reviewer accepted MPO-05 and linked POP-07, reconciled reopened criteria and verified corrected-source V2/V3/V4 with no outstanding required finding.

Kind: investigation

Priority: P1 — final approval requires actual model identity, inheritance and independent target enforcement.

Dependencies: MPO-00, MPO-01, MPO-02, MPO-03; final acceptance additionally requires MPO-05, discovered during this review.

Primary ownership: fresh independent reviewer; full scoped diff/acceptance audit,
meaningful probes, V4 and this/previous task reconciliation. Substantive corrections
go to fresh follow-up owners before the same reviewer resumes.

Finding: the previous completion audit exposed an actual-model gap despite passing
suites. New inheritance and nested capture changes require independent runtime and
artifact evidence, not status-only confirmation.

References: C1-C4, each acceptance criterion, linked POP-07 and actual source/
consumer results and generated artifacts.

Requirements:

1. Independently review actual target binding and pre-write failure, all setter/
   default resolution forms, mixed target policies and same-request capture updates.
2. Verify no copied-default/global/source authority, runtime/family/cache leakage,
   hidden field/private-data exposure, ID loss or nested admission regression.
3. Run V4 and confirm current V2/V3 cover final source; refresh invalidated gates.
4. Independently close existing POP-07 and its reopened acceptance, explicitly
   noting that target-owned model settings supersede the earlier global surface.

Acceptance criteria:

- No required finding or failed/incomplete gate remains; model identity and policy
  come from the same captured registered target on every supported path.
- Default inheritance and per-model target isolation have actual positive/negative
  runtime and installed consumer evidence; docs/types/runtime agree.
- All current tasks and linked binding correction have accurate final dispositions,
  with historical failed probes and approval/reopening evidence preserved.

Verification: V4, applicable fresh V2/V3, independent targeted regressions and final
diff/status/evidence/dependency audit. Do not label scoped checks a full-root test run.

#### MPO-04 independent review and corrective return

Historical first-pass corrective return; the resumed final acceptance below
supersedes its blocking disposition. Failed probes and their evidence remain intact.

Fresh independent MPO-04 reviewer, not an MPO-00..03 implementer, read both complete
task records, C1-C4, every task requirement/acceptance/evidence section and the
reopened POP-01/POP-05/POP-07 criteria, root/applicable `AGENTS.md` and
`ai-friendly-ts-package`. MPO-04 was set to `in_progress` before review. The
coordinator waited throughout the exclusive verification window; no nested agents
or competing repository build/test workers were observed. After the usage-limit
interruption the reviewer re-read actual state and completed logs/reports, rather
than rerunning finished V4 gates or treating the interruption as approval.

Environment: Node `v26.12.1`, pnpm `11.18.0`, external HEAD `f6c7112` with the
original task baseline `49699bb`. Inspected `git diff 49699bb HEAD` as well as the
full delivered scoped diff: **56 tracked modified paths and eight pre-existing
untracked additions**, including both policy helpers, binding/target-options/
nested/decorator suites, scaffold migrations, type fixtures and shipped/website
docs. Read the actual current implementations at their execution boundaries,
including the external CPU/snapshot changes in shared authorization/finalization.
External committed changes, dependency/lockfile updates and prior intentional
uncommitted work were preserved.

Before new logs/probes, `ls -ld . _tmp-mpo` confirmed the repository/scratch parents;
`git check-ignore -v _tmp-mpo/probe` matched `.gitignore:8:_tmp*`. Worker inspections
used `ps -C node,pnpm,esbuild,tsc -o comm,args`. All independently launched builds/
tests were serialized; root build retained its existing recursive workspace
schedule, server Vitest `fileParallelism: false`, and the complete decorator run
explicitly used `--fileParallelism=false`. Installed formatter/linter binaries
were used without a formatter-triggered pnpm refresh.

**Disposition: return to the coordinator for fresh corrective ownership of
required MPO-05. Final MPO-04/POP-07/POP-01/POP-05 acceptance is not complete.**

Actual source/contract audit:

- **C1:** the exact two flags are optional booleans on model/default/extended
  surfaces, absent from globals. Only those two default keys are excluded from
  bulk copied-default materialization. Model/default bulk/exact and router setters
  normalize undefined as clearing/inheritance and other non-false values strictly;
  omission and unrelated shallow/copied defaults retain their established behavior.
  The owned defaults token captures before source/target options. Repeated decorator
  bulk/property/empty setup, scoped providers, malformed values, global migration
  diagnostics and rollback have current positive/negative controls. Business keys
  with the same spelling stay data; no global alias/broadcast or caller flag/Model
  capability was added.
- **C2:** verified token identity and target-owned resolution through ordinary,
  private, derived/fallback, embedded, dedicated-child, cached and include option
  captures. Dedicated output extracts the actual defaults token rather than the
  resolved source pair. Mixed-target and same-service/request await/default updates
  retain old captures and refresh later calls. **The include receiver's actual
  Model is not retained through its service construction: MPO-05 reproduces that
  required ownership gap.** Captured include/private policy can govern another
  same-named receiver's rows despite the token itself being held correctly.
- **C3:** inspected separate query operation-only and private base-read gates,
  root/direct admission, source ref eligibility, target fields/document grants,
  row/base/transform predicates, mandatory IDs/match and original selection/\_id.
  Full reconstruction retains authorized original IDs on no admitted population/
  private failure, uses ordinary null/filtered arrays on admitted misses and omits
  source-denied/unselected fields. Declared fourth-input masks, target-owned public
  handles, snapshots/hooks, detached native values, raw-work families/identities/
  predicates/error eviction and concurrency-one guards retain their implemented
  boundaries. Include attachment provenance is independently authorized and remains
  supported; it does not justify the reproduced actual-model substitution.
- **C4 / original POP-07:** followed `getModelReference` live owning-source schema
  metadata through `capturePopulateTargetBinding`, related `model`,
  `withCapturedPopulateModel`, `fetchBinding.model` and the read-only enumerable
  descriptor `model` plus non-enumerable plan metadata. Missing/mismatched ordinary
  refs fail before source/target I/O or writes; static string/explicit Model-valued
  correctly configured cross-connection refs retain supported behavior. Adapter,
  post-save, detached fallback, dedicated copies and finalizer contexts use the held
  ordinary target. The prior POP-06 mutable/native match copy boundaries remain
  correct with this Model pin. The narrower one-hop private declaration limit and
  dynamic ordinary ref/refPath rejection stay explicit. Original POP-07 scoped
  correction is verified; integrated final closure waits for C2/MPO-05 correction.

Fresh **V4** commands personally completed before the interruption (repository
root; `<repo-root>` was expanded at execution):

```sh
pnpm build > _tmp-mpo/mpo04-root-build.log 2>&1
pnpm lint > _tmp-mpo/mpo04-root-lint.log 2>&1
TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-runtime test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-runtime.json' > _tmp-mpo/mpo04-runtime.log 2>&1
TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router-deco test --fileParallelism=false --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-deco.json' > _tmp-mpo/mpo04-deco.log 2>&1
```

| Gate                      | Exit | Actual completed result                                       |
| ------------------------- | ---: | ------------------------------------------------------------- |
| Root build                |    0 | Recursive workspace build completed                           |
| Root lint                 |    0 | Repository ESLint passed                                      |
| Complete runtime script   |    0 | **135 passed / 12 files**, 0 failed/skipped/todo; **192.48s** |
| Complete decorator script |    0 | **681 passed / 21 files**, 0 failed/skipped/todo; **247.37s** |

The runtime script freshly rebuilt its dependency closure. The decorator script
freshly rebuilt its closure and passed source `tsc --noEmit`; completed JSON success,
per-test statuses and final log totals were inspected after resumption. Root build
ends with the final project's completed build; root lint has no diagnostics. These
are scoped V4 scripts, **not a full-root `pnpm test` result**.

Audited applicable **V2/V3**, rather than repeating the unchanged complete server:

- `_tmp-mpo/mpo03-recovery-verified-files.sha256` matched **all 359 inputs** before
  and after review/probes. Audit also checks **309 server source/test/config/README
  mtimes** against the actual complete-server end time. The review added only its
  new regression outside that prior file list; no prior source/test/doc input was
  altered. Evidence: `mpo04-reused-source-freshness.log`,
  `mpo04-resumed-freshness.log`, `mpo04-post-probes-freshness.log` and
  `mpo04-evidence-audit-final.json`, all under `_tmp-mpo`.
- Read actual recovery source typecheck/decorator typecheck logs and JSON/verbose
  complete-server results: **5,072 passed / 154 files**, no failed/skipped/todo,
  **1,611.94s**. Included current consumer counts are **29 strict + 45 exports +
  55 documentation + 10 packed = 139**, not added to 5,072. Recovery decorator
  consumers are **61 / 4 files**, no failed/skipped/todo, **194.46s**; the current
  complete MPO-04 decorator run includes those same consumers.
- Inspected actual root/advanced `.d.ts`/`.d.mts`, shared declaration graph,
  decorator declarations, public exports and installed fixture/compiler settings.
  The real publisher transformer stages/installs actual tarballs and the actual
  build-artifact tree. Current packed peers keep full declaration checking in
  strict ESM/CJS NodeNext/Node16/Bundler lanes. Pinned minimum **Express 5.0.0 /
  Mongoose 8.0.0** retain their explicitly bounded library-check limits; current
  packed peers are **5.2.1 / 9.8.0**. Actual workspace dependencies verified by audit
  are Express **5.2.1**, Mongoose **9.11.4**, Vitest **4.1.11**, TypeScript **6.0.3**.
- After V4, `git diff --no-index --exit-code` exited 0 for all current server `dist`
  bytes against `dist/web-ts-toolkit-0.99.0-test/packages/access-router/dist`, plus
  separate README, llms and package.json comparisons. The recovery's post-server
  llms markup change already has a current **2-pass / 8 name-filtered exclusions**
  transformed-tarball/artifact inventory refresh; its actual JSON/log and source
  were inspected. No archive surviving test cleanup is claimed as newly installed
  by this reviewer.
- Actual recovery website log proves production client/server compilation/static
  generation. Actual dry-run inventory proves **17 files** (matching root/advanced/
  processors JS/declarations/shared graph, manifest/README/llms), no private source
  subpath. Their inputs remain fingerprint-identical. This evidence is source-fresh
  preservation/consumer verification, **not acceptance of the new failing regression**.

Fresh focused execution against the V4-rebuilt, artifact-identical output:

```sh
TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.binding.test.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.nested-targets.test.ts test/populate-operation-policy.review.test.ts test/populate-operation-policy.helper-isolation.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-focused.json' > _tmp-mpo/mpo04-focused.log 2>&1
```

**347/347 / 5 files**, **78.27s**, exit 0, no failed/skipped/todo: binding 136,
target-options 27, nested 164, prior independent review 8, helper isolation 12.
The eight original mutable-transform review assertions were retained; only their
earlier model-default API migration differs from the historical global fixture.

Bounded independent actual-Mongo probes live in `_tmp-mpo`:

1. `mpo04-independent-probes.mjs`: **8/8**, ESM/CJS, both Q modes and source hydration
   modes; **5.44s**, exit 0, no failed/cancelled/skipped/todo. Combines supported
   explicit cross-connection ordinary target's own private User dependency,
   defaults held across source/ref/runtime replacement, later same-service refresh,
   explicit User strictness/undefined inheritance, mutable native required match,
   helper read-only Model/alias isolation, dedicated child/post-save output,
   zero-write string mismatch/missing controls and terminal/private-view isolation.
   Final log/status: `mpo04-independent-probes-final-v2.log` and its `.status.json`.
2. `mpo04-include-binding-probe.mjs`: **4 failed / 0 passed**, **2.57s**, exit 1,
   no cancelled/skipped/todo. Legacy/correlated include × both source hydration
   modes reproducibly combine B's receiver row with A's captured private value.
   Log/status: `mpo04-include-binding-probe.log` and its `.status.json`.
3. Retained new
   `packages/access-router/test/populate-operation-policy.include-binding.review.test.ts`:
   **4 failed / 4 passed / 1 file**, **4.40s**, exit 1, no skipped/todo. All four
   unchanged-model positive controls pass. All four replacements show **target A
   reads 0 / B reads 1**, **private User A reads 1 / B reads 0**, and wrong target
   Model hook context, returning `row-B` + `private-A`. The isolated fourth mask
   and getter-count controls pass before that ownership assertion. Actual evidence:
   `mpo04-include-binding-review.log`, `.json`, `.log.status.json` under `_tmp-mpo`.

The review-local runner records actual completed exit/signal status for new audit/
probe invocations. The first evidence-parser attempt confused Vitest's per-case
`skipped` status with aggregate `numPendingTests`; corrected the parser, not the
saved report. The eight-probe scaffolding initially used a wrongly anchored CJS
relative import, then made both source-ref/runtime A (correctly triggering A's
invalid private same-connection declaration on the next call), and assumed empty
ordinary filter was never null. Corrected those fixture premises; original logs
`mpo04-independent-probes.log`, `mpo04-independent-probes-corrected.log`,
`mpo04-independent-probes-final.log` and `mpo04-evidence-audit.err` are preserved.
The include probe and retained regression required no weakened oracle or production
edit to reproduce the ownership defect.

Review-owned tracked/new edits are **the two task records and the eight-case
include-binding regression**; all other review scripts/evidence are ignored scratch.
Installed ESLint/Prettier passed on the new test and tracked/new-file whitespace
checks emitted no diagnostics. Final task formatting/new-file checks are recorded
at handoff. Index, manifests/lockfiles/tracked generated diffs remain empty; external
HEAD and prior fingerprints remain intact. No source fix, agent spawn, staging,
commit, revert, dependency-spec change, publish or manual generated edit was made.

MPO-05 is the required fresh corrective return. Reopened POP-01/POP-05 criteria
explicitly follow the model/default scope superseding the earlier global API;
mandatory configuration, operation-only gates and coherent ownership are still
required. Final linked POP-07 acceptance, MPO-04 and overall definition of done
remain blocked until correction, refreshed affected gates and independent re-review.

Final handoff formatting and whitespace passed after recording the disposition:

```sh
./node_modules/.bin/prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md
./node_modules/.bin/prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md docs/tasks/20261026-225914-access-router-populate-operation-policy.md packages/access-router/test/populate-operation-policy.include-binding.review.test.ts > _tmp-mpo/mpo04-handoff-prettier.log 2>&1
./node_modules/.bin/eslint packages/access-router/test/populate-operation-policy.include-binding.review.test.ts > _tmp-mpo/mpo04-handoff-eslint.log 2>&1
git diff --check
git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md || test "$?" -eq 1
git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.include-binding.review.test.ts || test "$?" -eq 1
```

No whitespace diagnostics; expected no-index new-file status is handled explicitly.
The final report audit, including the required four failures/four positive controls,
passed in `_tmp-mpo/mpo04-evidence-handoff.json` with a recorded completed exit 0.
Final status/index/dependency/generated audits retain only intended work, an empty
index and HEAD `f6c7112`. A last status-only formatting/integrity check follows this
record; the new regression remains deliberately failing pending MPO-05.

### Task MPO-05: Pin captured include receivers to their actual model and nested policy

Status: completed — scoped correction/V1/V2 passed and the same independent MPO-04 reviewer accepted it after refreshed corrected-source V2/V3/V4.

Kind: defect

Priority: P1 — a late same-named include receiver replacement reads B's rows under A's captured output/private policy and combines them with A's private inputs.

Dependencies: completed MPO-00, MPO-01, MPO-02, MPO-03 implementation. Discovered
by MPO-04; do not depend on MPO-04's blocked completion. MPO-04 final acceptance
depends on this correction and refreshed verification.

Primary ownership: **fresh corrective implementer assigned by the coordinator**,
not the MPO-04 reviewer. Bounded scope expansion: the shared include service
construction/binding seam in `packages/access-router/src/services/base.ts`,
`src/acl/related-execution.ts` and private model-binding transport as necessary,
plus retained include/ordinary/private ownership regressions. Preserve prior
uncommitted work, external HEAD/lockfile changes and the target-model two-flag API.

Finding and actual source:

- `src/acl/related-execution.ts:81-124` captures an include's configuration, defaults
  token, operation guard and nested private/related targets but omits its actual
  receiver Model. Ordinary ref targets at lines 65-78 do retain their Model.
- `src/services/base.ts:750-785` retains the captured include operation guard, then
  constructs its service with `getPublicService(modelName)` from the live runtime
  registry. `relatedExecution` at lines 797-825 supplies A's captured configuration
  to the service newly bound to B. The live lookup in `relatedBinding` at lines
  788-794 is also an identity boundary to audit when pinning recursive receivers.
- The independent actual-Mongo probe held the source row stage after capturing
  registered Target A and its same-connection private User A. Replacing only the
  runtime's Target entry with same-named B made **both legacy and correlated list
  includes, under both source hydration modes**, return `name: 'row-B'` with
  `value: 'private-A'`. Private User B is deliberately unregistered. Thus captured
  terminal input authority is used for another actual receiver's rows; include
  attachment provenance does not authorize model substitution.
- This is C2's required coherent target binding through include stages and MPO-02
  requirements 1/4, not a change to independent include attachment provenance or
  the private one-hop limit. The original POP-07 ordinary string/Model-ref correction
  passed its current controls; this remaining integrated capture path blocks final
  acceptance even with those checks and V4 passing.

Requirements / acceptance:

1. Retain the owning runtime's actual include receiver Model together with its
   captured configuration/default token and use that binding through service
   construction, query adapters, document grants, private target staging and
   finalization. A later registry replacement must not mix A's policy/private
   graph with B's rows. New top-level calls revalidate/capture the current receiver.
2. Keep recursive include receivers and ordinary refs nested inside includes
   bound to their originating model/configuration; audit `relatedBinding` without
   removing binding authentication or replacing it with name-only trust. Preserve
   custom-core/non-Mongoose adapters and standalone operation admission.
3. Make the retained eight-case reviewer suite pass without weakening its four
   replacement negatives or four unchanged-model positives. Keep actual target/
   private query counts, context Model, fourth-input/first-view isolation and
   no private recursion. Add only bounded read/list/count/nested controls needed
   for the shared corrective seam. Ordinary Model-valued cross-connection refs,
   zero-write failures, mandatory match/IDs, default inheritance and public/private
   mode isolation must retain their current assertions.
4. No new caller Model/flag capability, automatic registration, global alias,
   permission-schema bypass or include-provenance restriction. Use existing
   package-private captured-binding transport; no dependency-spec, publish or
   generated-output hand edits. Final review remains independent of the fix owner.

Verification: fresh server closure and the retained
`test/populate-operation-policy.include-binding.review.test.ts`; existing
`populate-operation-policy.{binding,target-options,nested-targets,review,helper-isolation}.test.ts`,
`include-source-provenance.integration.test.ts`, related/correlated and custom-core
adapter controls relevant to the changed seam. V2 fresh server source typecheck,
focused ESLint/Prettier and tracked/new-file whitespace. Refresh complete V3 server/
current consumers and affected V4 build/lint/runtime/decorator scripts serially
after production correction. Website/inventory structure may be reused only if
their inputs remain unchanged; compare refreshed JS/declaration/artifact bytes.
MPO-04/POP-07/POP-01/POP-05 cannot be completed until independent correction
acceptance and all required refreshed gates pass.

#### MPO-05 corrective implementation and scoped evidence

Fresh sequential MPO-05 corrective owner read this complete task, C1-C4, all prior
handoffs, the MPO-04 finding and MPO-05 requirements, root `AGENTS.md` and
`ai-friendly-ts-package`. MPO-05 was set to `in_progress` before implementation.
The coordinator waited throughout; no nested agents or competing repository
build/test workers were used. External HEAD `f6c7112` and all prior intentional
uncommitted implementation/docs/tests were preserved.

Environment: Node `v26.12.1`, pnpm `11.18.0`. Before new logs/probes,
`ls -ld . _tmp-mpo node_modules/.bin` verified the existing parents and
`git check-ignore -v _tmp-mpo/probe` matched `.gitignore:8:_tmp*`.
`ps -C node,pnpm,esbuild,tsc -o comm,args` inspections found no competing workers.
Build/test/type/style processes were launched serially; server Vitest retained
`fileParallelism: false`. Installed formatter/linter binaries avoided an incidental
formatter-triggered dependency refresh. All commands below ran from repository
root; quoted `<repo-root>` was expanded from `$PWD` at execution.

Actual production changes, relative to `packages/access-router`:

- `src/acl/related-execution.ts`: include capture now retains the actual registered
  receiver Model before awaits alongside its existing configuration, schema/catalog,
  query/default masks, operation guard, defaults token and recursively captured
  ordinary/private targets. Missing receiver Models retain the existing controlled
  configuration error. `createRelatedExecution` checks both the receiver name and
  **actual Model identity whenever a target is captured**, including request-only
  calls without an explicit related policy. A same-named different adapter cannot
  consume the old target configuration or private graph.
- `src/services/base.ts`: include target construction reuses MPO-00's private
  `withCapturedPopulateModel` seam after the held operation guard, so query adapters,
  document grants and finalization receive that Model. The originating service's
  `relatedBinding` comes from its authenticated service executor, rather than a
  later runtime name lookup. This keeps source and recursive receiver binding valid
  when their own registry entries change during an await. The guard remains
  one-shot, request actor capture remains authenticated and related operation grants
  remain distinct from populate bypasses. Captured receivers use their held
  registration; uncaptured custom-core/adapter dispatch retains its existing seam.
- `src/acl/service-authorization.ts`: only the private target Model property's
  comment expands from ordinary refs to ordinary refs/include receivers. Actual
  bindings remain package-private. Generated `Populate`/`SubPopulate` keep their
  precise caller keys, and none of the capture/construction/executor helpers is a
  callable root/advanced export.

New owned regressions:

- `test/populate-operation-policy.include-binding.test.ts`: **22 real Mongo cases**.
  Twelve legacy/correlated read/list/count cases, both source hydration modes,
  replace the target registry, target fields/rows/guards/default selection and runtime
  dependency defaults during source suspension. Captured actor, original target
  rows and native match/mandatory join constraints stay held. Later calls on the
  **same source service/request** capture B, deny its changed include operation,
  then observe strict and cleared/changed inherited User dependency policy. Public
  User IDs stay original; target output `-_id`, separate fourth-input masks,
  fetch-only join keys, native Date copies and closed terminal private traversal
  have explicit assertions. Count-only includes perform no private reads.
  Four recursive public include cases simultaneously replace source, outer target,
  nested receiver and private User Models, retaining A's source/target ownership,
  nested grants and private input graph. Two awaited include guards verify nested
  live guard denial, one-shot capture and concurrency-one completion. Four legacy
  include cases retain nested ordinary explicit cross-connection Model refs, both
  Q values and exact denied original IDs after registry replacement.
- `test/related-execution.binding.unit.test.ts`: **3 cases**. Same-named different
  receivers reject before dispatch with and without explicit related operation
  grants. An explicit related receiver keeps A's Model/configuration/default token;
  an ordinary later configuration capture still observes live registry/schema,
  target options and defaults. No general service/default capture lifetime was
  changed to achieve include binding.
- The independent
  `test/populate-operation-policy.include-binding.review.test.ts` is **byte unchanged**.
  Its eight cases retain all context Model, actual/private query count, first/fourth
  view isolation and terminal-recursion assertions.

Actual verification, including failed/corrected attempts:

1. **Fresh baseline closure and retained before-fix failure:**

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo05-before-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.review.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-before-include-review.json' > _tmp-mpo/mpo05-before-include-review.log 2>&1
   ```

   Baseline five-package closure passed, including declarations. The independent
   suite reproduced **4 failed / 4 passed / 1 file**, **4.43s**, exit 1, no skipped/
   todo cases: replacements read A **0** / B **1**, private User A **1** / B **0**,
   return `row-B` + `private-A` and provide B's hook Model. The four unchanged-model
   controls pass. This retained failure supplied the before-fix regression; no new
   production edit or weaker independent oracle was needed to reproduce it.

2. **Initial correction and expanded probes:**

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo05-first-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.review.test.ts test/service.internal.test.ts test/guard.test.ts test/service-authorization-related.integration.test.ts test/model-authorization-capture.unit.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-first-include-controls.json' > _tmp-mpo/mpo05-first-include-controls.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.test.ts test/related-execution.binding.unit.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-expanded-first.json' > _tmp-mpo/mpo05-expanded-first.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.test.ts test/related-execution.binding.unit.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-expanded-diagnostics.json' > _tmp-mpo/mpo05-expanded-diagnostics.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.test.ts test/related-execution.binding.unit.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-expanded-corrected.json' > _tmp-mpo/mpo05-expanded-corrected.log 2>&1
   ```

   The first build emitted new JS but failed declaration generation at TS2352 for
   the private Base-to-Service assertion. It is **not a passing closure gate**.
   The five-file runtime run passed **59/59**, **14.82s**, including all eight retained
   independent cases and custom-core/adapter controls. New probes initially had
   **14 failed / 11 passed**, **13.84s**. Ten assertions incorrectly matched the
   generic `Bad Request` message instead of the controlled `result.errors` detail;
   corrected them without weakening binding diagnostics. The next result was
   **4 failed / 21 passed**, **14.34s**: the recursive fixture incorrectly treated
   an output field grant as persisted sort authority. Explicit target-owned
   `sortableFields: ['name']` corrected that fixture while keeping the output
   grant and sort authorization separate. The next run passed **25/25 / 2 files**,
   **14.33s**. Neither runtime behavior nor independent reviewer assertions was
   changed to repair those test premises.

3. **Wider V1 and final fresh closure/type correction:**

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-mpo/mpo05-final-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.review.test.ts test/populate-operation-policy.include-binding.test.ts test/related-execution.binding.unit.test.ts test/populate-operation-policy.binding.test.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.nested-targets.test.ts test/populate-operation-policy.review.test.ts test/populate-operation-policy.helper-isolation.test.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.dependencies.test.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/private-populate-read-policy.runtime.test.ts test/private-populate-read-policy.review.test.ts test/include-source-provenance.integration.test.ts test/include-permission-metadata.integration.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.escape.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.fallback.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-final-review.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/model-authorization-capture.unit.test.ts test/service-authorization-prepared-query.unit.test.ts test/subdocument-populate-authorization.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/retained-model-service-ownership.integration.test.ts test/runtime-isolation.integration.test.ts test/request-hook-concurrency.test.ts test/service.internal.test.ts test/guard.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-final-focused.json' > _tmp-mpo/mpo05-final-focused.log 2>&1
   sha256sum packages/access-router/dist/index.js packages/access-router/dist/index.mjs packages/access-router/dist/advanced.js packages/access-router/dist/advanced.mjs packages/access-router/dist/processors.js packages/access-router/dist/processors.mjs > _tmp-mpo/mpo05-pre-type-correction-js.sha256
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-mpo/mpo05-final-typecheck.log 2>&1
   sha256sum --check _tmp-mpo/mpo05-pre-type-correction-js.sha256
   TMPDIR='<repo-root>/_tmp-mpo' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.review.test.ts test/populate-operation-policy.include-binding.test.ts test/related-execution.binding.unit.test.ts test/populate-operation-policy.binding.test.ts test/populate-operation-policy.target-options.test.ts test/populate-operation-policy.nested-targets.test.ts test/populate-operation-policy.review.test.ts test/populate-operation-policy.helper-isolation.test.ts test/service-authorization-boundary-admission.contract.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo05-final-refresh.json' > _tmp-mpo/mpo05-final-refresh.log 2>&1
   ```

   The wider build again emitted current JS but failed the same declaration cast.
   The 36-file attempt finished **1,623 passed / 1 failed / 1,624 cases**, **511.55s**,
   with 35 wholly passing files. The one declaration-dependent boundary fixture's
   TypeScript child failed while the current declaration graph was absent. Its
   source/privacy/no-dispatch assertions were preserved.

   Corrected the private assertion through `unknown`, keeping runtime executor
   registration/binding authentication intact. Final `typecheck` freshly rebuilt
   **all five closure packages, ESM/CJS and .d.ts/.d.mts**, then passed
   `tsc --noEmit -p tsconfig.typecheck.json`. All **six JS entrypoint fingerprints
   remain byte identical** across this type-only correction, so the prior passing
   runtime portion remains applicable. The nine-file fresh execution passed
   **448/448**, **113.44s**, no failed/skipped/todo, actual JSON `success: true`.
   It contains retained reviewer **8**, new Mongo **22**, new binding unit **3**,
   ordinary binding **136**, target-options **27**, nested **164**, original review
   **8**, helper isolation **12** and corrected boundary/declaration **68**.

   Current scoped evidence is **1,624 distinct passing cases / 36 files**, from the
   27 unchanged byte-verified passing files plus this nine-file refresh. This is
   **not a claim that the earlier combined failed invocation passed**. Actual
   audit validates case-name overlap, totals, no exclusions/todo and the single
   original type-lane failure. Existing query/dependency, source/include provenance,
   correlated and custom-core, capture/actor, mutation/child visibility, actual-ref,
   mandatory-ID/match and concurrency controls retain their assertions.

   Measured new controls: each one-parent legacy/correlated list reads held Target A
   **once**, B **zero**, private User A **once**, User B **zero**. Legacy grouped count
   uses **one A aggregate**, correlated count **one A countDocuments**, with **zero
   private reads**. Two outer rows' nested legacy list uses **one nested A find**;
   correlated nested lists use **two**. Native private row copies remain unchanged,
   terminal User getters never execute and limit-one guard/recursive work completes.
   No batching or general performance change is claimed.

4. **Scoped V2/integrity and reviewer evidence:**

   ```sh
   ./node_modules/.bin/eslint packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/services/base.ts packages/access-router/test/populate-operation-policy.include-binding.test.ts packages/access-router/test/related-execution.binding.unit.test.ts > _tmp-mpo/mpo05-final-eslint.log 2>&1
   ./node_modules/.bin/prettier --check packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/services/base.ts packages/access-router/test/populate-operation-policy.include-binding.test.ts packages/access-router/test/related-execution.binding.unit.test.ts docs/tasks/20261027-120942-access-router-target-model-populate-policy.md > _tmp-mpo/mpo05-final-prettier.log 2>&1
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.include-binding.test.ts || test "$?" -eq 1
   git diff --no-index --check -- /dev/null packages/access-router/test/related-execution.binding.unit.test.ts || test "$?" -eq 1
   git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md || test "$?" -eq 1
   node _tmp-mpo/mpo05-evidence-audit.mjs > _tmp-mpo/mpo05-evidence-audit.json 2> _tmp-mpo/mpo05-evidence-audit.err
   ```

   Final post-type-correction installed ESLint passed on all **five owned source/test
   paths**, with no diagnostics. Prettier passed on those five paths and this task.
   Tracked and all three new-owned-file whitespace checks emitted no diagnostics;
   expected no-index new-file status was handled explicitly. These scoped V2 checks
   passed before MPO-05 was marked completed.
   The current evidence audit passed: **356/359 prior fingerprinted inputs are byte
   unchanged**, with only the three intended shared source paths changed. The
   retained eight-case reviewer file and previous POP task are byte unchanged;
   HEAD is preserved and index/manifest/lockfile/tracked-dist diffs are empty.
   Generated root/advanced declaration inspection confirms the original caller
   Populate/SubPopulate shapes and unexported private construction/execution seams.

   Current production/test/doc/config/dependency inputs were fingerprinted for the
   reviewer, including the retained review file and both new owned tests:

   ```sh
   git ls-files -co --exclude-standard -z -- AGENTS.md package.json pnpm-lock.yaml packages/access-router/src packages/access-router/test packages/access-router/package.json packages/access-router/tsup.config.ts packages/access-router/vitest.config.ts packages/access-router/README.md packages/access-router/llms.txt packages/access-router-deco/src packages/access-router-deco/test packages/access-router-deco/package.json packages/access-router-deco/tsup.config.ts packages/access-router-deco/vitest.config.ts packages/access-router-deco/README.md website/package.json website/pnpm-lock.yaml website/docs/packages/access-router-deco.md website/docs/packages/access-router/configuration.mdx website/docs/packages/access-router/hooks.mdx | sort -zu | xargs -0 sha256sum > _tmp-mpo/mpo05-handoff-verified-files.sha256
   ```

   The final audit additionally verifies all **362 current handoff inputs** and
   their byte identity to this fingerprint. Final status-only task formatting,
   whitespace, index/dependency/worker and saved-report audits follow without a
   shared rebuild; no production/test source changed after the fresh passing gates.

#### MPO-05 same-reviewer handoff and required refresh

Historical corrective handoff; the subsequent independent final acceptance records
the completed refresh and supersedes this section's pending disposition.

The production fix signature is **captured include Model/configuration/private
graph → held target-service construction → actual executor binding → authenticated
related execution**, with source binding authenticated to its actual receiver.
MPO-05 owns only the three source paths, two new tests and this task section/status.
All earlier task source/docs/tests and the independent regression remain intact.
No additional independent out-of-scope defect was reproduced by these controls.

Scoped requirements 1-4 are satisfied by the receiver/source binding correction,
unchanged eight-case independent regression, 25 new controls, existing preservation
matrix and passing fresh closure/source types/style/integrity checks. This completes
MPO-05's corrective implementation handoff, **not independent overall acceptance**.

Final independent acceptance belongs to the **same MPO-04 reviewer**, after the
coordinator handoff. MPO-04 and overall/linked POP-07/POP-01/POP-05 acceptance remain
**blocked** pending that review and refreshed gates. The old POP record was not
closed or edited by this corrective owner.

Required refresh:

1. Re-review C2 and the corrected capture/construction/source-binding seams, including
   optional-policy actual receiver checks, recursive includes/ordinary refs and
   retained independent query/context/private-mask controls. Audit current reports
   and the handoff fingerprint; the initial type/build and new-oracle failures remain
   recorded above rather than being labeled successful gates.
2. Refresh complete **V3** server/current four consumer suites after this production
   correction. The prior MPO-03 5,072-case run is historical, not final-source-fresh
   after these three source edits. The scoped V1/V2 above is current; no routine
   full V3 was launched by this corrective owner.
3. Refresh affected **V4** root build/lint, runtime and decorator scripts serially.
   Confirm source types and actual transformed JS/declaration/tarball/artifact bytes
   against the corrected build. Prior V4 counts are history until refreshed.
   Website/docs/pack-inventory structure inputs remain byte unchanged and may be
   reused only after that identity audit; prior artifact JS is not current correction
   evidence.
4. Independently reconcile MPO-05/MPO-04 and linked reopened acceptance only after
   fresh required gates pass. The target-owned two-flag model/default API, registered
   actual-ref/schema requirements and independent operation/row/field/private gates
   retain their existing ownership and scope.

Final handoff commands:

```sh
./node_modules/.bin/prettier --write docs/tasks/20261027-120942-access-router-target-model-populate-policy.md > _tmp-mpo/mpo05-handoff-task-format.log 2>&1
./node_modules/.bin/prettier --check docs/tasks/20261027-120942-access-router-target-model-populate-policy.md > _tmp-mpo/mpo05-handoff-task-prettier.log 2>&1
git diff --check
git diff --no-index --check -- /dev/null docs/tasks/20261027-120942-access-router-target-model-populate-policy.md || test "$?" -eq 1
node _tmp-mpo/mpo05-evidence-audit.mjs > _tmp-mpo/mpo05-evidence-handoff.json 2> _tmp-mpo/mpo05-evidence-handoff.err
git diff --cached --stat
git diff --name-only -- ':(glob)**/package.json' ':(glob)**/*lock*' ':(glob)**/dist/**'
git rev-parse --short=7 HEAD
ps -C node,pnpm,esbuild,tsc -o comm,args
```

#### MPO-04 resumed independent final acceptance of MPO-05 and POP-07

The **same independent MPO-04 reviewer**, not the MPO-05 corrective owner, resumed
after the coordinator's sequential handoff. Re-read the actual three corrected
source paths, all 22 new real-Mongo cases, three binding units, the retained
eight-case reviewer regression and the saved MPO-05 before/after JSON/logs; did not
rely on the handoff summary alone. MPO-04 and overall were set to `in_progress`
before the review/refresh. The coordinator waited throughout; no nested agents or
competing repository node/pnpm/tsc/esbuild workers were observed. Existing `_tmp-mpo`
parent/ignore rules were rechecked before review logs. Node `v26.12.1`, pnpm
`11.18.0`, external HEAD `f6c7112`; the original `49699bb` baseline and all earlier
intentional work/external dependency-lockfile changes were preserved.

**Finding disposition: MPO-05 corrected and independently accepted; linked POP-07
and current C1-C4 accepted. No unresolved required finding.**

- `captureRelatedTargets` now holds each include receiver's actual registered Model
  together with its target configuration/default token, operation guard, query intent
  and nested related/private graph. `Base.getAuthorizedTargetService` checks the
  captured name and constructs the service synchronously using the held Model;
  `relatedBinding` authenticates the actual service-executor binding instead of a
  live registry lookup. `createRelatedExecution` compares both Model identity and
  name even without a caller related grant. The one-shot guard is separate from the
  Model handoff; existing unowned custom-core fallback remains supported. Later
  top-level captures use current registry/default policy, while already-held nested
  stages use their originating Model/actor/policy.
- The independent eight-case regression is **byte-identical** to the previous
  reviewer version and now passes all legacy/correlated, lean/hydrated, with/without
  replacement cases. Reviewed the corrective suite's read/list/count, recursive
  source/target/private replacement, operation-grant, default/target changes,
  native copy, field/row/match/mandatory join, direct guard, nested ordinary explicit
  cross-connection ref and no-private-recursion controls. The held receiver's rows,
  context Model and declaration-specific private inputs now agree. Original
  separately authorized include attachment provenance stays supported.
- A new **four-case independent actual-Mongo probe** in ignored scratch exercises
  both ESM/CJS and both include modes. From an awaited private getter, a separate
  request on the same runtime and another runtime construct their own current B/C
  services and obtain B/C rows; the original captured A include returns A/private-A.
  Direct operation guards stay denied, private input is only in the fourth mask and
  a getter-count assertion prevents swallowed failures from passing. All four cases
  pass, including concurrency-one completion: `mpo04-resume-independent-probes.mjs`,
  `.log` and `.log.status.json` under `_tmp-mpo`.
- The earlier full C1-C4 source/test/type/docs audit remains applicable to unchanged
  code and was cross-checked against the corrected seams. Exactly Q/D are model and
  model-default flags; undefined/omission/literal-false semantics, live inheritance,
  captured-default token and source/sibling isolation remain as reviewed. Original
  POP-07 actual string/Model-ref pre-write and in-flight pin chain, POP-06 native
  match copies, target field/document/row gates, exact ID reconstruction and private
  isolation retain their positive/negative current tests. No global/old alias,
  raw unregistered passthrough or caller Model/flag capability was introduced.

Fresh corrected-source **V2/V3** commands (repository root; `<repo-root>` was
expanded at execution; all commands completed, not merely launched):

```sh
node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-typecheck.log pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-mpo' node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-focused.log pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.include-binding.review.test.ts test/populate-operation-policy.include-binding.test.ts test/related-execution.binding.unit.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-resume-focused.json'
TMPDIR='<repo-root>/_tmp-mpo' node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-independent-probes.log node --test --test-concurrency=1 _tmp-mpo/mpo04-resume-independent-probes.mjs
TMPDIR='<repo-root>/_tmp-mpo' node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-complete-server.log pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-resume-complete-server.json'
```

The fresh five-package closure/declaration build and server `tsc --noEmit` exited 0.
Independent focused execution passed **33/33 / 3 files**, **18.28s**, no failures/
skips/todo (8 unchanged reviewer + 22 corrective Mongo + 3 binding units). The
additional independent four cases passed, **3.07s**, with no failures/cancellations/
skips/todo. Complete server script rebuilt the closure and exited **0**:
**5,105/5,105 tests across 157/157 files**, **1,590.64s** Vitest duration, no
failures/skips/todo. This supersedes the pre-correction **5,072/154** recovery run,
which remains historical evidence. The interruption occurred after the saved
complete-server child had finished: `.log.status.json` confirms `completed: true`,
exit 0 and no signal; actual JSON assertions and aggregate log were audited.

The complete run includes the current four consumer suites, already counted in
5,105: strict types **29**, export/declaration contracts **45**, documentation
examples **55**, actual transformed packed/artifact compatibility **10** = **139**.
Inspected the current root/advanced `.d.ts`/`.d.mts` and shared graph, decorator
declarations/hover, package metadata and exact transformed-tarball/artifact test
implementation. The four real publication-layout × peer lanes execute ESM/CJS,
strict NodeNext/Node16/Bundler consumers and current runtime examples. Current peers
**Express 5.2.1 / Mongoose 9.8.0** use full declaration checking; minimum peers
**5.0.0 / 8.0.0** retain their explicitly bounded `skipLibCheck` limit. No general
peer/plugin compatibility claim is made.

Fresh **V4**, serially after complete V3:

```sh
node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-root-build.log pnpm build
node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-root-lint.log pnpm lint
TMPDIR='<repo-root>/_tmp-mpo' node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-runtime.log pnpm --filter @web-ts-toolkit/access-router-runtime test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-resume-runtime.json'
TMPDIR='<repo-root>/_tmp-mpo' node _tmp-mpo/mpo04-run-gate.mjs _tmp-mpo/mpo04-resume-deco.log pnpm --filter @web-ts-toolkit/access-router-deco test --fileParallelism=false --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-mpo/mpo04-resume-deco.json'
```

| Gate                      | Exit | Actual completed result                                       |
| ------------------------- | ---: | ------------------------------------------------------------- |
| Root build                |    0 | Recursive workspace build completed                           |
| Root lint                 |    0 | Repository ESLint passed                                      |
| Complete runtime script   |    0 | **135 passed / 12 files**, 0 failed/skipped/todo; **209.59s** |
| Complete decorator script |    0 | **681 passed / 21 files**, 0 failed/skipped/todo; **259.14s** |

The runtime script rebuilt its closure; the decorator script rebuilt its closure and
passed its own source `tsc --noEmit`. Each invocation's actual completed exit/signal
was saved by `_tmp-mpo/mpo04-run-gate.mjs` in its `.log.status.json`. Actual logs,
per-test JSON statuses and totals were checked by the independent
`_tmp-mpo/mpo04-resume-all-gates-audit.json` (exit 0). The MPO-05 scoped evidence
audit also verified **448/448 / 9 files** and **1,624 distinct passing cases / 36
files** from the stated wider passing portion plus correction refresh, without
mislabeling its historical 1-failure mixed invocation as all-green. Focused cases
are included in the complete server total; no full-root `pnpm test` is claimed.

Final freshness/artifact and integrity:

- All **362** MPO-05 handoff source/test/docs/config/dependency fingerprints match;
  **313** server inputs predate the corrected complete-server start. The retained
  reviewer regression hash is unchanged. No production/test/consumer input changed
  after these gates. Source fingerprint and JSON audits are saved under `_tmp-mpo`.
- After the final downstream rebuild, `git diff --no-index --exit-code` returned 0
  for current server `dist` against the newly built
  `dist/web-ts-toolkit-0.99.0-test/packages/access-router/dist`, plus README, llms
  and package.json. The current V3 actually staged publisher-transformed tarballs,
  rebuilt the artifact and compared their emitted JS/declarations/docs before
  executing the installed consumers; tarballs were cleaned by that test, not
  retained as a separate audit artifact.
- Reused the actual recovery website production/static-generation log because
  website inputs remain unchanged. Reused the **17-file** dry-run inventory
  structure, not its pre-correction runtime bytes or hashed declaration filename;
  current corrected bytes/manifest layouts were verified by the new packed tests
  and post-V4 artifact comparison.
- Root lint covers the corrected source/new tests. Installed Prettier and
  tracked/new-file whitespace checks, empty index, unchanged manifest/lockfile/
  tracked-dist diff, preserved HEAD and absent build workers are checked at final
  handoff. No generated output was hand edited, and no commit/staging, revert,
  nested agent, dependency-specification change or publication occurred.

**Final disposition:** independently accept MPO-05 and the linked POP-07 correction;
re-complete reopened POP-01/POP-05 under the newer target-model/default-model API,
which explicitly supersedes historical global-placement/type/alias criteria. MPO-04
and overall definition of done are complete; no required work remains open. Earlier
failing probes and approval/reopening history are preserved above.

## Definition of done and creation evidence

MPO-00..05, linked POP-07 and required follow-ups must be independently accepted
with passing current checks. Both flags are target-model/default-model options,
actual-target registration/schema remain mandatory, authorized original IDs remain
stable and no global/source setting can grant another model bypass.

Current disposition: **completed**. MPO-00..05, linked POP-07 and reopened POP-01/
POP-05 are independently accepted under the target-model/default-model contract;
corrected-source V2/V3/V4 passed and no required finding, gate or follow-up remains
open. Historical failed probes, earlier approval and reopening evidence remain intact.

Creation baseline: clean `git status --short`; `git log -1 --oneline` returned
`49699bb`. Read-only planning research confirmed storage/default/capture details;
no current implementation/build/test result is claimed by saving this document.
Check formatting, whitespace, required fields, links and acyclic dependencies
before the first handoff; append actual task execution evidence as work proceeds.

Pre-handoff evidence: corrected one Markdown list-spacing issue; installed
Prettier and tracked/new-file whitespace checks pass for this plan and the prior
phase cross-link. Reviewed five stable task IDs/required fields and acyclic
dependencies, including explicit reuse of POP-07. No active build/test process
was observed; only the two intentional task-document paths changed.
