# Access-router: registered populate targets and independent operation policies

Created: 2026-10-26 22:59:14 local (`20261026-225914`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — the same independent MPO-04 reviewer accepted POP-07 and MPO-05 after corrected-source final gates, and requalified POP-01/POP-05 under the newer target-model/default-model scope. Historical checks, failed probes, approval and reopening remain preserved.

Execution continuation: [target-model populate policy](20261027-120942-access-router-target-model-populate-policy.md)
owns the user-approved per-target option scope and executes this record's existing
POP-07 correction first. The newer phase supersedes the global option placement;
its independent final review accepted the binding correction and reconciled the
reopened requirements. No duplicate binding implementation was introduced.

## Objective and execution authorization

Deliver the user-approved breaking simplification of populate authorization. Create
this file first, then execute each task with a fresh sub-agent, strictly sequentially.
The coordinator reviews each handoff; POP-05 uses an independent reviewer rather
than an implementer. No nested agents or concurrent shared-output builds.

Historical runtime API delivered by this phase, superseded by the
[target-model/default-model surface](20261027-120942-access-router-target-model-populate-policy.md#c1--the-actual-target-owns-both-flags):

```ts
api.setGlobalOptions({
  requireOperationAccessForPopulateQueries: true,
  requireOperationAccessForPopulateDependencies: true,
});
```

Both flags default to true. Registration and an effective `permissionSchema` are
mandatory for populate targets. The flags control target operation admission only.
This supersedes the completed [private-read policy phase](20261026-122832-access-router-private-populate-read-policy.md)
and its target-read-based whole-reference omission rule. Preserve historical task
evidence; update current shipped behavior/types/docs/tests together.

## Fixed contract

### C1 — Mandatory target configuration, two runtime flags

Scope reconciliation: this historical C1's global setter/alias and no-per-model
placement clauses are superseded by the later approved **actual target-model and
runtime model-default** API. The current pair resolves target override → captured
model default → built-in true; explicit undefined restores inheritance, omission
keeps an override and malformed non-undefined values are strictly true. Globals
reject the pair with migration diagnostics. Its registration/schema, admission,
isolation, business-data and all remaining authorization requirements still apply.

- Every requested ordinary population target and declared private dependency target
  must have an actual Mongoose model and ACL configuration in the owning runtime,
  including an effective object `permissionSchema`. Defaults may supply the schema;
  an empty schema is an explicit closed business-field policy, not allow-all.
- Missing target registration/schema is a clear configuration/admission error before
  target I/O or initiating mutation persistence. Do not auto-register an unrelated
  Mongoose model, synthesize authority, return an unregistered raw target, or silently
  fall back to a raw passthrough. Validate actual requested targets at operation
  capture; do not require every unused schema ref to be configured during startup.
  Existing eager validation of declared private dependencies remains applicable.
- A registered `Document` model need not have mounted HTTP routes. Its own base
  read/list operations can remain false, including root-query denial, while another
  model can populate it when the corresponding runtime operation requirement is false.
- Delete `requireRegisteredPopulateModels`, its unregistered passthrough paths and
  metadata/output exceptions. Replace `requireReadOperationAccessForPopulateDependencies`
  with `requireOperationAccessForPopulateDependencies`. No deprecated aliases,
  boolean-to-new-policy mappings, compatibility switches or new registration enum.
- Only literal false disables each new operation requirement; undefined/malformed
  JavaScript values must not accidentally enable bypass. Keep typed global setters,
  aliases/getters/snapshots and decorator option handling consistent.
- Both new values are server/runtime-owned, isolated and captured with source/target
  policy/query intent before awaits, including derived/related/embedded/child stages.
  Later calls see changes; in-flight work does not. No per-model, query, HTTP/client
  authority override; same-spelled ordinary business fields remain ordinary data.

### C2 — Ordinary caller population

- `requireOperationAccessForPopulateQueries: true` requires the target's effective
  operation (`read` normally, or supported `list`/trusted custom access). Existing
  scoped trusted backend operation grants keep their separate intentional authority.
- False skips only that target operation-admission requirement. Source entry access,
  source reference field eligibility, target `permissionSchema`, document grants,
  row/base/transform filters, original selection/exclusions/identity rules, requested
  match, and mandatory reference IDs remain enforced.
- Direct/generated target endpoints and root queries still enforce their own
  operation access. The new flag does not make a denied standalone target readable.
- Denied population leaves original authorized source IDs rather than removing a
  permitted parent field. Allowed population follows normal scalar/array/null/missing
  target and match behavior, returning only originally selected/authorized fields.
- Preserve request `match` and mandatory reference constraints in canonical and
  request-only helper/subdocument population; do not discard predicates during
  operation bypass or legacy-path cleanup.

### C3 — Virtual private dependency population

- `requireOperationAccessForPopulateDependencies: true` retains the captured target
  base read-operation requirement for private inputs. False skips only that gate.
- Private targets still use captured request-mode `baseFilter.read`,
  `overrideFilter.read`, original actor/permissions and mandatory original IDs.
  Field-input authority comes from the server `dependsOnPopulate` declaration;
  the virtual's output is independently authorized. No private read-to-list fallback.
- Keep terminal/nonrecursive loading, native isolation and declaration-specific
  fourth getter arguments. Ordinary public match/access/related grants do not
  redefine private input scope. Both flags are independent, including differing
  public/private admission results for the same target.
- Private work must not change ordinary response shape. With no admitted ordinary
  population, restore exact original ID(s) when the parent field permits them;
  omit only when parent selection/field authorization requires omission. Preserve
  array order, duplicates, missing-target IDs, nulls, empty arrays and own absence.
- Remove the extra unconditional target-base-read reference-visibility gate added
  by PPR. It must neither hide permitted IDs nor override an admitted ordinary
  population using the new query policy. Getter omission/failure, deferred denial,
  private row/query failure and strict private operation denial do not add public
  fields or remove otherwise permitted source IDs.

### C4 — Public/private ownership and supported paths

Preserve immutable original selections/defaults, runtime/model/policy ownership,
compatible positive fetch unions, ID deduplication for fetch only, scoped cache
coverage/error eviction, source/include provenance and target-owned public handles.
Private values do not implicitly enter the getter's first argument, snapshots,
permission hooks, metadata, handles or ordinary decorate/decorateAll/task inputs.
Only an authorized getter's deliberate return is computed output.

Cover direct/root/trusted list/read/readFilter, fallback, create/update/upsert/new,
ordinary populated and include target outputs, embedded scopes and dedicated child
list/read/mutation output. Preserve hidden-write visibility, post-save snapshots,
saved reference values, access triples, hydration caveats and configured scheduling
bounds, including concurrency-one completion. No count/distinct/identity/helper-only
operation gains dependency I/O. Independently authorized include attachments keep
their documented separate provenance even when reusing a source field's path.

## Inspected baseline and scope

- HEAD `4f544d5`; worktree clean before creation. Read root `AGENTS.md`, task workflow,
  task conventions and the relevant current source/tests in the preceding review.
  No new runtime/build/typecheck baseline was run to create this plan.
- Primary package: `packages/access-router`; decorator option validation/types/tests,
  shipped docs/website and affected runtime/decorator integration are in scope.
  Qualify any necessary ownership expansion before editing. No dependency upgrades,
  release/version automation, publishing, commits/staging or generated-output edits.
- `src/interfaces/root.ts` / `src/runtime.ts` (paths relative to access-router)
  currently expose/default the two old globals. `src/acl/model-output-planning.ts`,
  `model-service-owner.ts`, `related-execution.ts`, `service-authorization.ts` and
  `subdocument-output.ts` capture/transport those values through output execution.
- `src/acl/related-execution.ts:64-84`, `src/services/service.ts:895-902`,
  `src/core.ts:362-365`, `src/acl/output-field-filter.ts:258-260` and the related
  target kind implement the existing unregistered-target passthrough. Remove this
  capability, not merely its public property name.
- `src/services/service.ts:921-931` currently always requires ordinary target
  operation admission except trusted related grants. `src/core.ts` has a separate
  request-only helper boundary; both need coherent captured flag semantics.
- `src/acl/virtual-populate-execution.ts` consumes the old private flag and owns
  captured target/row work. `src/output/finalize-model-output.ts:721-745` currently
  invokes an additional target-read visibility gate that conflicts with C2/C3.
- `packages/access-router-deco/src/property-options.ts:18-34` validates the old
  registration boolean. Change the validation and its property-contract tests/docs
  to the new pair; avoid leaving a stale supported-option promise.
- Tests currently require raw unregistered output and denied-ID omission under the
  earlier contracts. Update those explicitly while retaining authorization and
  data-shape controls. The prior runtime probe also showed raw passthrough dropping
  match; raw mode is removed here, and supported registered paths must retain match.

Related records: [package virtuals](20261024-234103-access-router-virtual-populate-dependencies.md),
[private-read policy](20261026-122832-access-router-private-populate-read-policy.md),
and [operation variants](20261005-131819-access-router-operation-access-variants.md).
These completed records supply historical context, not new verification evidence.
Focused prior analysis found no other task implementing this breaking two-flag/ID
contract. Coverage is focused, not an exhaustive audit of every application plugin,
peer combination or unrelated workspace package.

## Execution and verification rules

P1 means required configuration/authorization/data-shape correctness before shipping;
P2 means required installed-consumer/docs readiness. All tasks are required. Execute
POP-01 → POP-02 → POP-03 → POP-04 → POP-05 sequentially with fresh owners. Only the
independent reviewer performs final signoff. New required findings get stable new
IDs/ownership/dependencies/acceptance and fresh corrective owners before review resumes.

Set status before work, preserve unrelated changes, and record concise changed
paths, actual commands/results, failed attempts/corrections, remaining criteria and
blockers. Never complete on code intent or stale historical passing reports.

Task-body `src/`/`test/` paths are relative to `packages/access-router` unless
qualified. Commands run from repo root unless stated. Requirements: Node >=22,
repository pnpm, installed dependencies, usable mongodb-memory-server binaries,
and registry/cache availability for installed consumers. Follow the existing harness.

Use ignored repository-local `_tmp-pop` for fixtures/logs, checking the parent and
ignore rule before creation. Replace quoted `<repo-root>` placeholders before use.
Evidence stays repo-relative/placeholders; omit local absolute paths/session IDs.

All builds/tests must be serialized: package scripts rebuild shared transitive dist;
root `pnpm test` retains `--workspace-concurrency=1`, and access-router Vitest retains
`fileParallelism: false`. Inspect competing build/test processes and wait for external
owners rather than racing shared output or stopping their workers.

### Shared gates

- **V1 — focused behavior:** fresh
  `pnpm --filter @web-ts-toolkit/access-router... build`, then actual focused suites:
  `TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`.
  Replace placeholders and record exact filenames. Establish meaningful new
  before-fix failures where practical; tests ship with their implementation.
- **V2 — source and integrity:**
  `pnpm --filter @web-ts-toolkit/access-router typecheck`, focused ESLint/Prettier,
  `git diff --check`, plus
  `git diff --no-index --check -- /dev/null <new-owned-file>` for untracked files.
- **V3 — complete package/current installed API:**

  ```sh
  TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router test
  TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts
  ```

  A fresh complete package run with all four updated consumer suites satisfies the
  second command; inspect actual results rather than repeat unchanged checks.
  Review emitted root/advanced `.d.ts`/`.d.mts`, publisher-transformed packed ESM/CJS
  runtime flows and strict NodeNext/Bundler consumers. `npm pack --dry-run` from
  `packages/access-router` checks inventory. Website is a separate workspace:
  `pnpm build` with workdir `website` after its prerequisites.

- **V4 — final integration:** `pnpm build`, `pnpm lint`, and scoped runtime/decorator
  test scripts, serially:

  ```sh
  TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router-runtime test
  TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router-deco test
  ```

  Confirm current V2/V3 cover final source. Broaden to other workspace tests when
  actual downstream impact warrants it; do not claim full-root tests from scoped
  checks. Reuse applicable exact evidence, rerunning gates invalidated by corrections.
  Record environmental/unrelated failures with proof and explicit remaining criteria.

## Tasks

### Task POP-01: Establish mandatory target policy and replace legacy configuration

Status: completed — independently requalified by MPO-04 after POP-07/MPO-05 correction and corrected-source gates; target-model/default-model options supersede the historical typed-global criterion.

Kind: improvement

Priority: P1 — old registration/raw-output authority must not survive the breaking API replacement.

Dependencies: none.

Primary ownership: global/public types/runtime setters, captured configuration/
target validation and passthrough removal, decorator option validation, relevant
configuration/type/registration tests; scoped migration notes needed for those changes.

Finding: old globals mix registration/raw passthrough with a separate private mode.
Targets without effective policy can bypass ACL finalization. See baseline anchors.

Requirements:

1. Add the exact new boolean pair/defaults and fully rename private mode capture
   and consumption so source typecheck remains coherent at this handoff.
2. Remove old option APIs/runtime branches and all unregistered raw-target kinds/
   serialization exceptions, with no aliases/deprecation/compatibility mapping.
3. Enforce registered effective schema-backed targets before relevant persistence;
   keep ordinary unused refs and configuration-only model registration valid.
4. Capture flags/target policy coherently before awaits; validate both new decorator
   booleans and preserve unrelated option/business-field semantics.

Acceptance criteria:

- Current scope: model/default and their extended setters expose the pair; stale
  global setters/aliases reject it. The following original global-only criterion is
  preserved as historical evidence and is not the current API.
- Typed globals/aliases expose only the new pair; strict default and explicit false,
  malformed runtime inputs, isolation/await changes and missing-schema/target cases pass.
- No supported entry can obtain an unregistered raw target by setting either flag.
- Existing registered target field/row/related authorization and public/private input
  isolation remain intact. Old raw-mode cases become explicit fail-closed controls.

Verification: V1 configuration/registration and affected related/operation suites,
relevant strict consumer cases, decorator property contracts, and V2. Record the
controlled error contract and exact POP-02 flag/capture handoff.

#### POP-01 implementation and handoff evidence

Owner: fresh POP-01 implementation agent, sequentially after taskfile creation.
Read the full C1-C4/scope/shared gates, root `AGENTS.md`, and the
`ai-friendly-ts-package` skill. Set overall/own status to `in_progress` before
code. Initial HEAD remained `4f544d5`; preserved the coordinator's previous-phase
cross-link and this taskfile. Process inspections with
`ps -C node,pnpm,esbuild,tsc -o comm,args` found no competing workers before builds.
Node `v26.12.1`, pnpm `11.18.0`; checked the repository parent with `ls -ld .`,
confirmed `git check-ignore -v _tmp-pop/probe` matched `.gitignore:8:_tmp*`, then
created `_tmp-pop`. All fixture commands below ran from the repository root with
`TMPDIR="$PWD/_tmp-pop"`. Builds/tests were serialized.

Changes (package-relative unless qualified):

- `src/interfaces/root.ts`, `src/runtime.ts`: exact new optional boolean globals,
  strict defaults, literal-false normalization for object/key setters and bound
  aliases. Added typed `DefaultModelRouterOptions.permissionSchema` because C1
  permits effective runtime defaults; resolved its inherited setter type against
  virtual-aware model schemas. `src/interfaces/router-hooks.ts` uses the new name.
- `src/acl/model-output-planning.ts`, `service-authorization.ts`,
  `related-execution.ts`, `virtual-populate-dependencies.ts`,
  `virtual-populate-execution.ts`: carry both normalized globals in source,
  ordinary/include/derived/embedded/child and terminal private captures; fully
  renamed private admission/cache consumption. Effective undefined model schemas
  resolve against runtime model defaults.
- New `src/acl/populate-target-configuration.ts`: shared synchronous validation of
  actual model + owning-runtime ACL configuration + effective object schema.
  Ordinary requested targets preflight before awaits/persistence; declared private
  targets keep eager validation, including proposed self-reference options. Empty
  schemas are valid closed policies; unused ordinary refs/count-only models remain
  valid. Configuration-only registration requires no target HTTP router.
- `src/core.ts`, `src/services/service.ts`, `src/acl/output-field-filter.ts`,
  `src/acl/populate-target.ts`: removed raw descriptors, passthrough target kind,
  normalization/output-copy exceptions and stale raw-finalization comments.
  Request-only helpers retain captured source/target policy, grants, original
  selection and both flags before field awaits, preserve mandatory requested match
  through transforms, and require retained target plans instead of swallowing
  planner failures into descriptors without metadata.
- Ownership expansion within C1/C4: `src/meta.ts` now accepts the explicit runtime
  for ref resolution; related capture supplies its owner. A separate-Mongoose
  before-fix probe proved ambient lookup could silently skip a requested target.
- `packages/access-router-deco/src/property-options.ts`,
  `src/decorators/property.decorators.ts`, `test/property-contracts.test.ts`:
  validate/document both new booleans; invalid values roll back bootstrap, valid
  false/undefined and extension keys retain their contracts.
- New `test/populate-operation-policy.config.test.ts` (23 tests): actual snapshots,
  missing registration/instance/schema, unavailable configured model, malformed
  schemas, effective defaults/empty schemas, no target route construction, no
  auto-configuration, read/create/update/upsert/helper/child admission and zero
  pre-write I/O, private setter atomicity, setter forms/malformed JS/isolation,
  source/include/private snapshots across awaits and independent globals.
- Updated `test/private-populate-read-policy.config.test.ts` with the new name and
  all four capture combinations across derived/include/embedded/dedicated child
  stages. Updated `virtuals-populate-dependencies.config.test.ts` with explicit
  closed policies, missing-schema controls, self/cyclic staged configuration.
- `test/model-router.integration.test.ts`,
  `service-authorization-final-review.integration.test.ts`,
  `subdocument-populate-authorization.integration.test.ts`: replaced superseded
  unregistered/raw/silent-drop assertions with explicit C1 admission failures;
  retained registered field/row/related assertions. Added real Mongo output tests
  proving model/default `{}` targets return identity without business fields.
- Renamed active configuration in `private-populate-read-policy.runtime.test.ts`,
  `private-populate-read-policy.review.test.ts`,
  `virtuals-populate-dependencies.operation-guards.test.ts`,
  `virtuals-populate-dependencies.performance.test.ts`,
  `virtuals-populate-dependencies.parity.test.ts`, and
  `virtuals-populate-dependencies.consumer.runtime.fixture.ts`. The second-runtime
  private fixture now declares its required closed target schema.
- `test/private-populate-read-policy.types.fixture.ts`, `export-contract.test.ts`
  and the declaration-property lookup in `documentation-examples.test.ts`: actual
  root/advanced boolean contracts, setters/aliases, default schemas and negative
  old-name/client/model controls compile against current declarations. Complete
  README/website/packed-example prose and final reference-shape migration remain
  POP-04's declared work.

Controlled error contract: shared target-configuration failures throw
`ServiceAuthorizationError` (`message: 'Bad Request'`) with
`result: { success: false, kind: 'error', code: 'bad_request', errors: [{ detail }] }`.
Details start with `Service authorization: Populate target "<model>" for <source>`
and explain either configuring the actual model/options first or providing an
effective object `permissionSchema` (including `{}` as a closed policy). Services
return that controlled result; HTTP helpers produce 400; direct helpers/config
setters throw with actionable details in `result.errors`. Existing private
declaration-shape/registration errors retain their eager `Virtual … dependsOnPopulate`
configuration diagnostics. No new registration boolean/enum/alias exists.

Verification and corrected attempts:

1. Fresh baseline `pnpm --filter @web-ts-toolkit/access-router... build` passed.
   Before the implementation, the following new suite had **11 failed / 3 passed**
   (14 initial tests), proving missing defaults, mandatory configuration and
   effective-schema gaps:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.config.test.ts
   ```

2. Two post-edit closure builds found and corrected a generic setter narrowing
   error and an `unknown` helper match type. The next
   `pnpm --filter @web-ts-toolkit/access-router build` passed. Initial configuration
   execution had **10 failed / 113 passed**, because assertions inspected the
   generic error message instead of controlled `result.errors`; corrected those
   assertions. This exact rerun passed **123 / 123** at that point:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/virtuals-populate-dependencies.config.test.ts
   ```

3. Affected registered authorization/operation/registration/private baseline run:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/model-router.integration.test.ts test/runtime-isolation.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-final-review.integration.test.ts test/operation-access-boundaries.integration.test.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/subdocument-populate-authorization.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/private-populate-read-policy.runtime.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts
   ```

   **595 passed / 3 failed; 9 files passed / 2 failed.** Corrected two second-runtime
   private fixture cases that omitted the now-mandatory schema and the superseded
   subdocument silent-drop assertion. Subsequent execution below passed both files.

4. `pnpm --filter @web-ts-toolkit/access-router typecheck` initially exposed the
   missing typed default-schema option; after adding it, declaration emission
   exposed the duplicate inherited schema property, corrected with the model-aware
   inherited type. The command then passed, and passed again after the final owner
   fix. Each successful invocation freshly ran the full required
   `pnpm --filter @web-ts-toolkit/access-router... build` closure followed by source
   `tsc --noEmit -p tsconfig.typecheck.json` (V1 freshness + V2).

5. Expanded configuration/empty-schema/fixture correction run:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/virtuals-populate-dependencies.config.test.ts test/private-populate-read-policy.runtime.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-final-review.integration.test.ts
   ```

   **249 passed / 4 failed; 5 files passed / 1 failed.** The four new ordinary
   configuration cases incorrectly supplied unsupported populate options to child
   mutations. Corrected the probes to supported child `readSub`; private-schema
   invalidation now separately checks child mutations before parent I/O/persistence.
   A targeted rerun of `test/populate-operation-policy.config.test.ts` passed
   **22 / 22**. The other five files passed all **231 tests**, including 88 private
   runtime cases, all four structural capture combinations, child admission and real
   empty-schema Mongo output cases.

6. Relevant strict installed consumers and root/advanced declarations:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t 'PPR-01'
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/export-contract.test.ts -t 'PPR-03'
   ```

   **3 passed / 26 skipped** (strict Bundler `.ts`, NodeNext `.mts`/`.cts`), then
   **2 passed / 43 skipped** (root/advanced `.d.ts`/`.d.mts` properties/hover).
   Declaration inspection found only new flag names in emitted declarations.

7. Independently serialized decorator fresh closure + property contracts:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router-deco... build && TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/property-contracts.test.ts
   ```

   Build passed; **36 / 36** property contracts passed. Final subsequent owner-only
   ref-resolution correction does not change these option/declaration contracts.

8. Additional before-fix owner regression:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.config.test.ts -t 'resolves target refs from the owning runtime'
   ```

   **1 failed / 22 skipped** before the explicit-owner fix (no admission error was
   raised). After the fix, the final fresh closure/source typecheck passed, and this
   exact affected-path run passed **176 / 176 tests across 7 files**:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/virtuals-populate-dependencies.config.test.ts test/service-authorization-related.integration.test.ts test/runtime-isolation.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/subdocument-populate-authorization.integration.test.ts
   ```

9. Final focused V2 ESLint/Prettier and tracked/new source/test whitespace passed:

   ```sh
   pnpm exec eslint $(git diff --name-only -- packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test) packages/access-router/src/acl/populate-target-configuration.ts packages/access-router/test/populate-operation-policy.config.test.ts
   pnpm exec prettier --check $(git diff --name-only -- packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test) packages/access-router/src/acl/populate-target-configuration.ts packages/access-router/test/populate-operation-policy.config.test.ts
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/src/acl/populate-target-configuration.ts
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.config.test.ts
   ```

   Final taskfile formatting and new-file whitespace passed with
   `pnpm exec prettier --write docs/tasks/20261026-225914-access-router-populate-operation-policy.md`,
   `pnpm exec prettier --check docs/tasks/20261026-225914-access-router-populate-operation-policy.md`,
   `git diff --check`, and
   `git diff --no-index --check -- /dev/null docs/tasks/20261026-225914-access-router-populate-operation-policy.md`.
   Each no-index check was also executed independently with `|| test "$?" -eq 1`
   to handle the expected new-file diff exit status; all emitted no whitespace diagnostics.
   These are focused POP-01 checks; complete V3/package/root tests and final docs/
   publishing inventory checks belong to the later declared gates.

POP-02 handoff (no POP-02 implementation started):

- `AuthorizationConfiguration.requireOperationAccessForPopulateQueries` is captured
  and normalized on source/target/derived stages. Wire it only around target
  operation admission in `Service.genExecutionPopulate` and `Core.genPopulate`.
  The former already has `policy?.operation.mode === 'grant'`; the latter now uses
  captured target configuration/permissions with `withCapturedModelOperationGuard`.
  Keep root/direct operation admission separate.
- `requireOperationAccessForPopulateDependencies` is already fully renamed through
  terminal captures, cache compatibility and execution, with its baseline private
  behavior covered. Both flags are available to related and child execution via
  their existing captured configuration; do not reread live globals after awaits.
- Reuse `capturePopulateTargetConfiguration` and requested `captureRelatedTargets`;
  no raw kind/output exception remains. Request-only helper match now intersects
  the immutable requested predicate with captured row/transform policy.
- POP-03 owns removal of `isVirtualPopulateReferenceVisible`/finalizer target-read
  coupling and replacement of superseded PPR reference-omission assertions. Those
  private/public shape contracts remain intentionally at their current baseline
  until that sequential task. POP-04 owns the remaining full documentation/packed
  consumer migration. No POP-01 blocker remains; no dependencies/staging/commits/
  publishing/generated-output hand edits were performed.

### Task POP-02: Apply ordinary-populate operation policy without changing allowed IDs

Status: completed

Kind: improvement

Priority: P1 — caller population must separate target admission from field/row policy and source IDs.

Dependencies: POP-01.

Primary ownership: canonical/request-only populate planning, service/related and
dedicated-child handoffs as needed, ordinary operation/row/selection regression tests.

Finding: ordinary target operation checks are unconditional today, and legacy/raw
paths differ. The registered Document use case requires operation bypass while root
Document access and target field/row restrictions remain enforced.

References: `Service.genExecutionPopulate`, `Core.genPopulate`, related execution,
`RootRouter.isAllowed`, and ordinary populate boundary tests.

Requirements:

1. Honor captured `requireOperationAccessForPopulateQueries` only at target operation
   admission; preserve effective read/list/trusted custom selection and scoped grants.
2. Keep source entry/field policy, target fields/doc grants/rows, requested match,
   mandatory IDs and original output selection immutable and enforced in both modes.
3. Preserve authorized original ID(s) on denied population; omit only for parent
   field selection/authorization. Do not turn match/no-row misses into ID restoration
   after an admitted population attempt.
4. Use shared seams across direct/root/trusted/mutation/related/child paths and
   request-only helpers, with no broad root/route grant or ambient nested admission.

Acceptance criteria:

- Document read/list false denies direct/root access but query flag false permits
  referenced output with only selected/permitted fields and scoped rows.
- True denies the same population and retains permitted parent IDs; field denial/
  exclusion omits them. Test read/list, defaults, functions, masks, arrays and errors.
- Match/mandatory ID and snapshot/concurrency tests pass across relevant seams;
  registered backend grants remain explicitly scoped and caller controls cannot grant authority.

Verification: V1 new ordinary policy tests, prior operation-access/related/helper/
subdocument/defaults tests and V2. Private finalizer decoupling remains POP-03.

#### POP-02 implementation and handoff evidence

Owner: fresh POP-02 implementation agent, sequentially after coordinator-reviewed
POP-01. Read the complete taskfile/C1-C4/POP-01 evidence, root `AGENTS.md` and the
`ai-friendly-ts-package` skill; set own status to `in_progress` before editing.
Preserved the pre-existing plan/historical cross-link and all POP-01 work. No nested
agents, staging, commits, dependency changes, publishing or manual generated-output
edits. Checked the repository parent and existing scratch directory with
`ls -ld . _tmp-pop`; `git check-ignore -v _tmp-pop/probe` confirmed `.gitignore:8:_tmp*`.
Inspected `ps -C node,pnpm,esbuild,tsc -o comm,args` before the serialized checks;
there were no competing build/test workers. Commands below ran from the repository
root, with Mongo fixtures under `TMPDIR="$PWD/_tmp-pop"`.

Changes (package-relative):

- `src/services/service.ts`: canonical `genExecutionPopulate` now evaluates the
  target's captured effective operation guard only when the captured query flag is
  not literal false and no independently scoped backend related operation grant
  applies. Source admission, related rows, target projection/document grants and
  mandatory match/reference constraints retain their existing execution seams.
- `src/core.ts`: request-only `genPopulate` applies the same flag at its captured
  one-shot operation guard. Captured source/target/actor, original descriptors and
  row predicates continue through helper planning. Necessary small scope adjustment:
  use existing `resolveAlwaysSelectForAccess` for target hook fetch inputs, matching
  canonical planning. The before-fix custom-access helper probe found that a missing
  per-access bucket otherwise passed the whole record to `stripVirtuals` and threw.
- New `test/populate-operation-policy.queries.test.ts`: **84 ordinary-only tests**
  using actual Mongo/Mongoose output (including both hydration modes), not descriptor
  strings alone. Covers configuration-only denied Document targets, direct/root
  target and source-entry denial, scalar/array/duplicate/missing/null/absent/empty
  reference shapes, source denial/exclusion/functions/errors, selected target fields,
  exclusions/identity, target document grants and effective default/empty schemas.
  Read/list/descriptor/option/custom accesses, exact/stored-default/bare/runtime-exact
  operation fallback, permission strings/masks, guard errors, terminal row denial/
  errors, explicit related operation grants, client spoofing and same-spelled
  business keys have independent controls. Canonical/request-only/scoped-helper
  match and mandatory IDs survive an override returning `{}`. Snapshot tests cover
  both flag-change directions, target operation/runtime-default/schema/row changes,
  mutable selection/match and actor changes across the first source await; later
  calls see the updated intent/policy. Direct/root/trusted read/list/readFilter,
  fallback, create/update/upsert branches, embedded/include and dedicated-child
  output use the shared policy seams; saved references remain IDs.

Verification, failed probes and corrections:

1. Fresh `pnpm --filter @web-ts-toolkit/access-router... build` passed before the
   implementation (`_tmp-pop/pop02-before-build.log`). The initial new suite:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.queries.test.ts
   ```

   had **17 failed / 10 passed** (27 initial tests), proving ordinary bypass gaps at
   both boundaries and the custom-access helper crash. Evidence:
   `_tmp-pop/pop02-before-queries.log`.

2. After implementation and expansion, another fresh closure build passed; the
   suite had **4 failed / 64 passed** (68 tests). Corrected fixture assumptions:
   embedded containers need an explicit output rule; an excluded but permitted
   source ref does not promise zero target queries; fallback may choose list policy;
   dedicated `SubPopulate` intentionally remains path/select-only. Match/mandatory-ID
   proof uses the supported named scoped `genPopulate` plus real Mongoose population,
   preserving the existing negative SubPopulate type contract. A further expanded
   run had **3 failed / 79 passed** (82 tests), all from incorrectly reading direct
   mutation responses as `{ data }` rather than their bare response body; corrected
   the assertions. No existing test was weakened or removed.

3. A focused run passed **543 / 543 across 15 files** with the then-82-test ordinary
   suite (`_tmp-pop/pop02-focused.log`). Added two effective-schema cases and stronger
   later-call selection/row assertions; the ordinary suite passed **84 / 84**
   (`_tmp-pop/pop02-queries-final.log`). Both admission conditions explicitly use
   `!== false`, preserving strict admission for absent/malformed captured values.
   The final source then passed this complete fresh V1/V2 sequence:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.config.test.ts test/operation-access-boundaries.integration.test.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/service-defaults.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-final-review.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/runtime-isolation.integration.test.ts test/request-hook-concurrency.test.ts
   ```

   **545 / 545 tests passed across 15 files**, including all **84** ordinary policy
   regressions and **461** configuration/operation/default/related/helper/child/
   source-capture/runtime-isolation/concurrency regressions. `typecheck` freshly
   rebuilt `@web-ts-toolkit/access-router...` and passed source
   `tsc --noEmit -p tsconfig.typecheck.json`. Final logs:
   `_tmp-pop/pop02-final-typecheck.log`, `_tmp-pop/pop02-final-focused.log`.

4. Final focused V2 source/test ESLint/Prettier passed; taskfile formatting and
   tracked/new-file whitespace checks passed:

   ```sh
   pnpm exec eslint packages/access-router/src/core.ts packages/access-router/src/services/service.ts packages/access-router/test/populate-operation-policy.queries.test.ts
   pnpm exec prettier --check packages/access-router/src/core.ts packages/access-router/src/services/service.ts packages/access-router/test/populate-operation-policy.queries.test.ts
   pnpm exec prettier --write docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   pnpm exec prettier --check docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.queries.test.ts
   git diff --no-index --check -- /dev/null docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   ```

   The no-index checks were also executed with `|| test "$?" -eq 1` for the expected
   new-file diff status and emitted no whitespace diagnostics. Full package/current
   consumer gates remain POP-04's assigned verification.

POP-03 handoff: POP-02's ordinary-only criteria and scoped checks are complete;
there is no POP-02 blocker. `src/output/finalize-model-output.ts` still calls
`isVirtualPopulateReferenceVisible` before original-reference reconstruction.
For an active private occurrence with a present reference,
`src/acl/virtual-populate-execution.ts` still delegates that visibility decision to
captured `targetReadAllowed`. Consequently a denied target base read can still hide
otherwise permitted source IDs or override an ordinary population admitted by query
bypass, list/custom access or a scoped backend grant. This is the known C3/PPR
coupling assigned to POP-03, including when private operation admission is bypassed.
Remove that extra visibility rule while preserving ordinary source-field selection/
authorization, admitted population misses and exact original-reference restoration.
The private dependency flag/executor/cache/finalizer were not changed by POP-02;
no additional private input channel or compatibility policy was introduced.

### Task POP-03: Decouple virtual input admission from public reference visibility

Status: completed

Kind: improvement

Priority: P1 — selecting/computing a virtual must not remove otherwise allowed parent references.

Dependencies: POP-02.

Primary ownership: private dependency executor/cache and shared finalizer; related,
embedded, mutation/template and dedicated-child response seams; focused runtime/parity tests.

Finding: PPR's independent target-read output gate removes IDs and can undo ordinary
operation bypass. The new agreed contract restores ordinary response shape instead.

References: `executeVirtualPopulateBatch`, `isVirtualPopulateReferenceVisible`,
`readVirtualPopulateOriginalReference`, `finalizeSingleDoc`, and source/target row tokens.

Requirements:

1. Apply the renamed dependency mode to private read admission only, preserving
   captured request rows/transforms, mandatory IDs and declaration-specific fourth inputs.
2. Remove the additional target-read output-visibility coupling. Reconstruct public
   output using actual admitted ordinary population or original permitted parent IDs.
3. Cover all four query/dependency flag combinations with target operation denial,
   denied public fields, independent private/public masks, native copies and errors.
4. Maintain batching/query union, mode/policy/cache ownership, original slot ordering,
   hook/persistence limits, snapshots, hidden writes and public output handles.

Acceptance criteria:

- Adding a virtual does not change visibility/ID shape of allowed parent refs.
- Strict private denial/getter failure/row failure cannot hide permitted IDs or
  expose private target fields; denied parent refs remain absent.
- Query bypass and private bypass are independent across read/fallback/write/new,
  populated/include targets, embedded and dedicated-child output in both hydration modes.
- Existing performance/concurrency-one/isolation measurements remain bounded.

Verification: V1 new policy matrix and affected DPV/PPR/parity/performance/visibility
regressions, plus V2. Intentionally replace superseded PPR whole-reference omission assertions.

#### POP-03 implementation and handoff evidence

Owner: fresh sequential POP-03 implementation agent after POP-02's handoff. Read
the complete C1-C4/taskfile/POP-01 and POP-02 evidence, root `AGENTS.md`, and the
`ai-friendly-ts-package` skill; set POP-03 to `in_progress` before edits. Preserved
the intentional earlier source/docs/tests and historical task evidence. Initial
and pre-build `git status --short` / `ps -C node,pnpm,esbuild,tsc -o comm,args`
inspections found no external changes or competing build/test workers. Checked
the existing repository/scratch parents with `ls -ld . _tmp-pop` and confirmed
`git check-ignore -v _tmp-pop/probe` matched `.gitignore:8:_tmp*` before logs or
fixtures. All commands below ran from the repository root; Mongo scratch used
`TMPDIR="$PWD/_tmp-pop"`. Builds and test invocations were serialized.

Changes (package-relative unless qualified):

- `src/acl/virtual-populate-execution.ts`: deleted
  `isVirtualPopulateReferenceVisible`, its `referenceTargets` occurrence map and
  capture bindings. The remaining `targetReadAllowed`/deduplicated guard map is
  consumed only by strict private dependency admission. Literal-false private
  mode proceeds directly to captured request read rows/transforms and mandatory
  original IDs; it adds no guard for returning parent IDs.
- `src/output/finalize-model-output.ts`: removed the extra target-base-read
  visibility call/import. Existing selected/authorized source fields reconstruct
  exact captured originals only when no admitted ordinary population owns the
  slot. Admitted public DTO/null/filtered-array results retain their ordinary
  target-owned authorization. Getter omission/failure, private admission/row/query
  failures and deferred virtual denial cannot remove permitted IDs. Fourth-input
  masking, private WeakMap tokens, isolated copies and include-attachment
  provenance keep their existing boundaries.
- Necessary C4 related/child expansion: `src/meta.ts` recognizes current Mongoose
  `$embeddedSchemaType` / `embeddedSchemaType` as well as `caster` when resolving
  dotted array refs. Real plain-definition embedded/dedicated-child probes showed
  the previous fallback silently skipped ordinary array population. This uses
  the already-explicit owning runtime and synchronous capture seam.
- New `test/populate-operation-policy.dependencies.test.ts`: **320 tests** across
  both hydration modes and all four flags. Compares ordinary output with/without
  active virtuals; covers scalar/array/null/empty/absent/missing/duplicate IDs,
  source selection/exclusion/denial/deferred/document/function grants, public
  target document grants and original masks despite private positive fetch unions.
  Match/deleted-target misses, private guard/base/override/query/getter failures,
  virtual output denial, native Date/Buffer/ObjectId isolation and an authorized
  getter's deliberate return have independent controls. Includes both-flag await
  snapshots/later same-service calls, direct/root/trusted list/read/child/fallback,
  create/update/upsert/new/defaults, embedded/populated/legacy/correlated include
  targets, hidden child writes, direct/root target denial and scalar/identity/
  helper-only zero-dependency-I/O controls. Persistence/snapshots/hooks retain
  intended local/public inputs; private query failure never retries a write.
- `test/private-populate-read-policy.runtime.test.ts` and `.review.test.ts`:
  consciously replaced obsolete whole-reference omission/output-only guard
  expectations with exact permitted IDs or admitted public DTOs. Retained denied/
  unselected parent controls, private leaks/masks/native mutation checks, read
  capture/nested Core independence and actual include collision provenance.
  The captured-guard probe now uses strict private mode, where a guard belongs.
- `test/virtuals-populate-dependencies.integration.test.ts`,
  `.operation-guards.test.ts`, `.parity.test.ts`: adapted superseded operation-
  denial/list/custom/backend-grant/new/default assertions, preserving negative
  private-computation and authorization checks. Related target duplicates/cache
  copies, direct/root/trusted mutation and embedded/dedicated output retain their
  actual permitted IDs. The second-runtime parity fixture explicitly declares
  its mandatory closed target schema.
- `test/virtuals-populate-dependencies.performance.test.ts`: expanded measured
  1/24-row, two-target-group, limit-one/two tests to all four flag combinations in
  both hydration modes (**16 cases**). Assertions retain three driver reads,
  two target groups, fetch-only ID deduplication, four getters per source row,
  bounded persistence/hooks and terminal nonrecursive targets. Operation guards
  are exactly `2 * Number(Q) + 2 * Number(D)`: 4/2/2/0; bypass adds none.
- `test/virtuals-populate-dependencies.traversal.test.ts`: retained explicit
  default/custom traversal token ownership and expanded raw-work reuse/coverage/
  failure eviction to both hydration modes. New same-family captures prove
  changed flags/operation/row scopes cannot reuse incompatible private values;
  older captures still own their original policy. The cache fixture now supplies
  its required explicit closed target schema.

Verification and corrected attempts:

1. Fresh `pnpm --filter @web-ts-toolkit/access-router... build` passed
   (`_tmp-pop/pop03-before-build.log`). The initial 64-case new matrix had
   **32 failed / 32 passed**. Eight failures were fixture setup accidentally
   replacing the whole source schema and dropping the virtual output rule;
   corrected this to scoped option setters. The same before-runtime-fix command
   then had **24 failed / 40 passed**, directly proving lost permitted IDs/public
   DTOs under all relevant modes:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.dependencies.test.ts
   ```

   Logs: `_tmp-pop/pop03-before-matrix.log` and
   `_tmp-pop/pop03-before-matrix-corrected.log`.

2. The first post-edit closure build passed. Its combined test invocation was
   interrupted by the shell's 120-second timeout; no complete result was claimed
   (`_tmp-pop/pop03-first-build.log`, `_tmp-pop/pop03-first-focused.log`). Process
   inspection confirmed no remaining workers before the serialized longer runs.
   A complete 64-case matrix run had **4 failed / 60 passed**: corrected its
   expected public document-hook count from two to three (separate scalar/array
   stages, duplicate array slots shared). The adapted five-file PPR/runtime/
   operation/parity/integration run had **570 passed / 1 failed**; corrected the
   remaining obsolete `new()` target-operation-denied ID omission expectation.
   Logs: `_tmp-pop/pop03-matrix-first.log`, `_tmp-pop/pop03-adapted-focused.log`.

3. Expanded matrix + performance execution had **268 passed / 20 failed** across
   two files. Eight embedded/child failures reproduced the missing nested-array
   ref resolution above; fixed `src/meta.ts`. Corrected four assertions that
   mistook ObjectId's prototype `_id` getter for a DTO output property, and eight
   correlated fixtures using unsupported `populate` args; correlated targets now
   exercise their supported selection/virtual/ID contract. Another fresh closure
   build plus the then-272-case matrix, DPV integration and subdocument population
   passed **369 / 369 across 3 files**. Added wire/fallback/hidden-visibility
   probes; the final expanded new suite passed **320 / 320**. Logs:
   `_tmp-pop/pop03-expanded-matrix.log`, `_tmp-pop/pop03-meta-build.log`,
   `_tmp-pop/pop03-matrix-corrected.log`, `_tmp-pop/pop03-matrix-parity.log`.

4. Final source V2 freshly rebuilt the complete required closure, then passed
   source `tsc --noEmit -p tsconfig.typecheck.json`:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck
   ```

   Log: `_tmp-pop/pop03-final-typecheck.log`. Against those final outputs, the
   exact private-policy V1 run passed **1,277 / 1,277 across 16 files**:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.dependencies.test.ts test/private-populate-read-policy.config.test.ts test/private-populate-read-policy.runtime.test.ts test/private-populate-read-policy.review.test.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-populate-dependencies.planner.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.fallback.test.ts test/virtuals-populate-dependencies.parity.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.dispatch.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts
   ```

   Log: `_tmp-pop/pop03-final-private.log`. The separately serialized shared/
   ordinary-policy run passed **599 / 599 across 17 files**:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.config.test.ts test/operation-access-boundaries.integration.test.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/service-defaults.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-final-review.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-populate-include.integration.test.ts test/runtime-isolation.integration.test.ts test/request-hook-concurrency.test.ts
   ```

   Log: `_tmp-pop/pop03-final-shared.log`. Total final V1: **1,876 tests / 33 files**,
   including POP-02's full **84-test** ordinary query-policy suite. No remaining
   failure in these scoped runtime checks. These are scoped gates, not V3/V4 or
   full-workspace test evidence.

5. Final focused ESLint and Prettier passed on all three changed source files and
   all eight changed/new test files (paths listed above); logs:
   `_tmp-pop/pop03-final-eslint.log`, `_tmp-pop/pop03-final-prettier.log`.
   `git diff --check` and new matrix whitespace checks passed:

   ```sh
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.dependencies.test.ts
   pnpm exec prettier --write docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   pnpm exec prettier --check docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   git diff --check
   git diff --no-index --check -- /dev/null docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   ```

   Active source searches found neither old global name nor the removed visibility
   helper/map. Final source/output remained unchanged after the fresh typecheck
   and both complete scoped test runs. No nested agents, commits/staging, reverts,
   dependency changes, publishing or manual generated-output edits were performed.

POP-04 handoff: POP-03 is complete with no runtime blocker. The assigned consumer/
prose migration is still necessary: current shipped JSDoc in
`src/interfaces/root.ts` (active-reference base-read omission paragraphs) and
`src/interfaces/router-hooks.ts` (dependency/getter reference-shape paragraphs),
README/llms/website, and
`test/virtuals-populate-dependencies.consumer.runtime.fixture.ts` around its strict/
bypass/ordinary-list assertions still describe/expect the superseded whole-field
omission contract. Update those with the four-mode/ID rules during POP-04 and run
its complete package/installed-consumer/website/pack gates. The full package may
also expose older, outside-these-33-files fixtures needing explicit target schemas;
no full-package failure is asserted without that run. Independent POP-05 hotspots:
positive fetch union versus original public masks/handles, source original IDs
versus actually produced colliding include attachments, nested-array ref discovery
across Mongoose peer versions, captured-mode/row cache compatibility and the
dedicated read-hydrated/write-lean output caveat. POP-05 owns final independent
signoff and V4.

### Task POP-04: Ship accurate breaking-contract docs and installed consumers

Status: completed

Kind: improvement

Priority: P2 — installed consumers must discover only the new configuration and correct response shapes.

Dependencies: POP-03.

Primary ownership: server/decorator shipped JSDoc/README/llms and website docs;
strict/export/documentation/publisher-transformed packed fixtures and compatibility cases.

Finding: shipped configuration/hover/examples still advertise registration opt-out
and PPR reference omission. They must describe the new breaking contract and actual
installed behavior rather than preserve old option aliases.

References: `src/interfaces/{root,router-hooks}.ts`, package README/llms, decorator
property options and the four V3 consumer suites.

Requirements:

1. Document mandatory registration/effective permissionSchema, configuration-only
   Document model setup, the two flags, direct/root denial versus reference reads,
   four-mode matrix, exact ID retention and independent private inputs.
2. Remove supported-option promises for both old names; provide concise breaking
   release guidance rather than aliases. Historical task evidence remains historical.
3. Compile/run actual registered Document examples and real packed ESM/CJS consumers,
   including both hydration modes, arrays/missing refs, source denial and row boundaries.
4. Update decorator behavior/docs/tests and installed root/advanced hover. Keep
   query/client/DTO types free of server capabilities, no new entrypoint.

Acceptance criteria:

- Current runtime/type/JSDoc/examples agree; old raw/unregistered mode is absent.
- Complete server suite and updated four consumer suites pass, as do source
  typecheck, website generation and actual pack inventory.
- Apps can migrate both old settings to the new explicit contract using shipped docs.

Verification: V2/V3; appropriate decorator checks. Record final output freshness and
independent review hotspots, without claiming old task results verify the new contract.

#### POP-04 implementation and handoff evidence

Fresh sequential POP-04 owner read the full task/C1-C4 and actual POP-01..03
handoffs (including the 320-case dependency matrix), root `AGENTS.md`, and
`ai-friendly-ts-package`. Set own status before edits; preserved all intentional
uncommitted work. Initial and pre-check process inspections with
`ps -C node,pnpm,esbuild,tsc -o comm,args` found no competing build/test workers.
Verified parents with `ls -ld . _tmp-pop website`; `git check-ignore -v _tmp-pop/probe`
confirmed `.gitignore:8:_tmp*` before fixtures/logs. Package/build/test invocations
were serialized; the coordinator did not build concurrently. No nested agents,
staging, commits, reverts, dependency updates, publishing or manual dist edits.

Scope qualification recorded before editing: `packages/access-router-deco` shipped
README and property-decorator JSDoc need the same two-boolean contract as its POP-01
validation; scoped decorator property/type/docs checks are necessary. Its existing
strict configuration fixture also now checks both typed global decorator keys and
rejects the removed names/model-default placement. No production policy revision or
other package implementation was needed. The complete server run found no additional
old fixture requiring a missing-target-schema correction.

Changed files (package-relative unless qualified; earlier owners' changes in shared
files remain intact):

- `src/interfaces/root.ts`, `src/interfaces/router-hooks.ts`: corrected GlobalOptions,
  virtual/dependency/permission-schema hover, exact two flags/defaults/literal-false,
  independent admission, effective object schema, configuration-only Document,
  original-ID retention, admitted misses and isolated fourth inputs. Removed the
  stale PPR visibility promise; no new export or compatibility alias.
- `README.md`, `llms.txt`: mandatory registration/schema/defaults/closed `{}`,
  controlled configuration errors, guard errors, four-mode matrix, source/target
  field/document/row/match/identity boundaries, captured frozen getter snapshots and
  root named getters. Added concise removed-name/breaking-upgrade guidance. Replaced
  the runnable private example with an actual configuration-only `Document`, denied
  read/list and no target router, scalar four-mode/field denial/public-mask/private
  union/ID/null-miss controls, standalone base admission and root denial.
- `test/virtuals-populate-dependencies.consumer.runtime.fixture.ts`: real installed
  Document array consumer in lean/hydrated modes, all four flag combinations, exact
  original missing/out-of-scope IDs/nulls/order/duplicates, defaults/suppression,
  source denial/unselection, public selection/identity/match misses versus private
  read rows, ordinary first/fourth-input separation, frozen snapshots/malformed input,
  root denial and subsequently constructed generated-target endpoint denial. Replaced
  old target-read-only `{}` expectations with permitted IDs; source-denied `{}` stays.
- `test/export-contract.test.ts`, `test/documentation-examples.test.ts`,
  `test/strict-consumer-types.test.ts`,
  `test/private-populate-read-policy.types.fixture.ts`,
  `test/packed-consumer-compatibility.test.ts`: both root/advanced declaration
  conditions and hover, exact new/negative old APIs, named getters/setters, server-only
  placement, actual compiled hover/README examples. The three new-policy strict
  Bundler/NodeNext checks now use `skipLibCheck: false`. Existing publisher-transform
  and actual artifact-tree runtime/type checks retain their full current-peer
  declaration check and existing minimum-peer limits; no weakened peer coverage.
- `packages/access-router-deco/README.md`,
  `packages/access-router-deco/src/decorators/property.decorators.ts`,
  `packages/access-router-deco/test/hydration-consumer.types.fixture.ts`: matching
  option validation/migration/hover and typed decorator boundaries above.
- `website/docs/packages/access-router/configuration.mdx`,
  `website/docs/packages/access-router/hooks.mdx`, and
  `website/docs/packages/access-router-deco.md`: matching two-flag/ID/registration
  contract, compiled configuration-only Document, error/migration and hook isolation.
- `docs/tasks/20261005-122217-access-router-package-virtuals.md` and
  `docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md`: concise
  current-contract supersession cross-links only; retained historical evidence and
  the existing private-read phase cross-link. This taskfile records current evidence.

Actual verification and corrected attempts (commands from repository root unless
workdir is specified; scratch uses `TMPDIR="$PWD/_tmp-pop"`):

1. Initial fresh `pnpm --filter @web-ts-toolkit/access-router typecheck` passed the
   complete five-package closure and source `tsc --noEmit -p tsconfig.typecheck.json`
   (`_tmp-pop/pop04-typecheck.log`). The first complete required script:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router test
   ```

   finished, without a shell timeout, at **4,218 passed / 6 failed; 134 passed / 2
   failed files (4,224 tests / 136 files), 1,288.29s**. The six failures were all new
   README TypeScript calls, not runtime authorization failures: wrong service type
   for `_read`/`_list` and an unsupported typed dotted schema setter. Log:
   `_tmp-pop/pop04-package-first.log`.

2. Corrected the schema update to the supported whole-schema setter. Focused
   `test/documentation-examples.test.ts -t 'README.md-block-28-of-29'` runs then
   exposed the missing required `_list({})` filter (**2 failed / 53 skipped**),
   followed by an invalid assumption that a direct underscore wrapper supplies an
   initiating route guard (**1 passed / 1 failed / 53 skipped**). The example now
   checks `req.macl.isAllowed` for standalone base admission and actual root entries;
   generated endpoint denial is additionally executed in the packed array fixture.
   No production guard semantics were changed. The exact corrected command passed
   **2 / 2 selected, 53 skipped**:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts -t 'README.md-block-28-of-29'
   ```

   Logs: `_tmp-pop/pop04-readme-correction.log`,
   `_tmp-pop/pop04-readme-corrected.log`, `_tmp-pop/pop04-readme-final.log`.

3. Focused packed `-t 'supports'` reached strict runtime emission and found a new
   fixture's TypeScript circular inference on the fetch response (**4 failed / 6
   skipped**). An explicit `Response` annotation fixed inference without suppressing
   checks. Then this current-peer transformed-tarball probe passed **1 selected / 9
   skipped**, including both real ESM/CJS README and array executions:

   ```sh
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts -t 'supports current majors from release-artifact tarballs'
   ```

   Logs: `_tmp-pop/pop04-packed-correction.log`,
   `_tmp-pop/pop04-packed-current-corrected.log`. Final complete evidence below
   supersedes these selected probes and proves both peer versions/publication layouts.

4. Appropriate decorator checks, serialized after the server probes:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router-deco... build
   pnpm --filter @web-ts-toolkit/access-router-deco typecheck
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/property-contracts.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts
   ```

   Closure/typecheck passed; **50 / 50 tests across 3 files** passed, including
   existing 36 property contracts, strict NodeNext/Bundler configuration and shipped
   docs execution. Logs: `_tmp-pop/pop04-deco-build.log`,
   `_tmp-pop/pop04-deco-typecheck.log`, `_tmp-pop/pop04-deco-focused.log`.

5. Final fresh V2/V3, after all source/docs/fixture corrections:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck
   TMPDIR="$PWD/_tmp-pop" pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose
   ```

   Fresh five-package closure/source typecheck passed. Complete script rebuilt the
   same closure and passed **4,224 / 4,224 tests across 136 / 136 files**, with no
   skips/failures, **1,399.12s** Vitest duration. The shell timeout was 1,800,000ms;
   no worker was interrupted. Logs: `_tmp-pop/pop04-final-typecheck.log`,
   `_tmp-pop/pop04-package-final.log`. Inspected the actual passing per-test lines:

   | Current consumer suite                       | Passed  |
   | -------------------------------------------- | ------- |
   | `test/strict-consumer-types.test.ts`         | 29      |
   | `test/export-contract.test.ts`               | 45      |
   | `test/documentation-examples.test.ts`        | 55      |
   | `test/packed-consumer-compatibility.test.ts` | 10      |
   | **Total included in the complete run**       | **139** |

   This satisfies V3's four-suite command without another unchanged execution. The
   10 packed cases include four full installed environments: Express/Mongoose
   **5.0.0/8.0.0** and **5.2.1/9.8.0**, each from publisher-transformed tarballs and
   the freshly assembled actual artifact tree. All execute real public ESM/CJS,
   strict NodeNext/Bundler (plus existing Node16 checks), exact shipped scalar
   Document example and both-hydration array fixture. Current peers keep full
   `skipLibCheck: false`; the minimum-peer existing lib-check limits remain intact.
   Root/advanced `.d.ts`/`.d.mts` and their shared declaration graph were inspected;
   automated hover/alias resolution and actual example compilation pass all four
   entry/condition views. Packed/artifact bytes match current emitted JS/declarations
   and shipped docs. A post-run `rg -c` counting attempt was unavailable (`rg` is
   not installed); dedicated content searches of the final verbose log confirmed
   the exact 29/45/55/10 passing records above. No test rerun was needed for counting.

6. `pnpm build` with **workdir `website`** passed the separate workspace's English
   client/server production compilation and static generation. Log:
   `_tmp-pop/pop04-website.log`. `npm pack --dry-run` with **workdir
   `packages/access-router`** passed and listed **17 files**: 14 emitted runtime/
   declaration files plus package.json, README and llms.txt; no source/tests/scratch.
   Log: `_tmp-pop/pop04-pack-inventory.log`. These gates ran after final shipped doc
   edits; subsequent builds used the identical source/docs, confirmed by packed
   byte-equality tests. No pack/publish/version automation changed.

7. Focused V2 ESLint passed all ten owned changed TS source/test paths listed above;
   Prettier passed the owned changed code/docs/historical links/taskfile; logs:
   `_tmp-pop/pop04-eslint.log`, `_tmp-pop/pop04-prettier.log`. `git diff --check`
   passed. Final taskfile formatting and new-file whitespace passed before handoff,
   including `git diff --no-index --check -- /dev/null
docs/tasks/20261026-225914-access-router-populate-operation-policy.md` (expected
   new-file diff status handled). Source/emitted searches find neither removed flag
   nor the removed `isVirtualPopulateReferenceVisible`/`referenceTargets` gate.
   Remaining old names are concise removed migration notes, negative API tests or
   preserved historical task evidence. Working status shows only intended task work;
   no dependency/lockfile/version/generated tracked changes.

POP-05 handoff: POP-04 is complete with **no blocker**. Final source/docs/fixtures
were unchanged through the last fresh typecheck and complete package run; only this
evidence/status record was appended afterward. Reuse applicable V2/V3 evidence;
POP-05 remains pending for independent acceptance and V4 root build/lint plus full
runtime/decorator scripts. No full-root test result is claimed. Independent review
hotspots: original public masks/target-owned handles versus positive private fetch
unions; permitted original IDs versus admitted scalar/array misses and colliding
include provenance; nested-array Mongoose ref metadata across peers; captured
operation/actor/row cache ownership through child/post-lifecycle stages; native
fourth-input isolation and the dedicated hydrated-read/lean-write visibility caveat.
Initiating custom service guards retain their established route/root ownership;
the example's admission probe and actual generated/root denial controls reflect it.

### Task POP-05: Independently verify the complete breaking policy

Status: completed — the same independent MPO-04 reviewer accepted POP-07 and corrected MPO-05, refreshed affected gates and reconciled current target-model scope; no required finding remains.

Kind: investigation

Priority: P1 — final signoff requires exact policy separation, cleanup and affected consumer evidence.

Dependencies: POP-01, POP-02, POP-03, POP-04.

Required re-review prerequisite: POP-07 below. Its correction must requalify POP-01
and be independently accepted before final completion.

Primary ownership: full scoped diff/acceptance audit, meaningful independent probes,
V4 gates and this record; substantive corrections use fresh follow-up implementers.

Finding: independent flags, mandatory target policy and response reconstruction
cross several shared execution boundaries; individual component passes cannot prove
the integrated contract or complete removal of the old capabilities.

References: C1-C4, all preceding task acceptance/evidence, shared populate helpers,
executor/finalizer and actual generated/public consumer surfaces.

Requirements:

1. Review C1-C4 and every acceptance criterion against actual source/behavior, including
   registration/schema failure before writes, no raw bypass, flag capture/actor/defaults,
   mandatory match/IDs, all four mode combinations and no field/row-policy bypass.
2. Inspect complete final reconstruction, include provenance, native isolation,
   missing/error paths, ID retention, backend grants, root denial and nested admission.
3. Verify removal of old runtime capabilities/public promises, current generated/
   installed types and sequential execution evidence. Add bounded probes for gaps.
4. Run V4 and verify applicable final V2/V3. Reproduce findings and add stable
   corrective tasks, then review corrections independently before approving.

Acceptance criteria:

- No unresolved required finding or failed/incomplete required gate remains.
- Registered Document can be populated with explicit query bypass while standalone
  reads stay denied; permitted parent IDs survive denied/private-only population.
- Current shipped contracts, runtime, consumer behavior and affected integrations
  agree, with actual independent review and exact results recorded.

Verification: V4, final V2/V3 evidence, independent regressions and complete
status/diff/dependency audit. Never infer whole-workspace test completion from scoped runs.

#### POP-05 independent review evidence and corrective return

Historical first-pass return; the resumed final acceptance below supersedes its
blocking disposition. All failed probes and their original evidence remain intact.

Owner: fresh independent POP-05 reviewer, not an owner of POP-01..04. Read the
entire fixed C1-C4/task/evidence record, root `AGENTS.md` and
`ai-friendly-ts-package`; set POP-05 to `in_progress` before review work. Reviewed
the complete delivered diff against `4f544d5`: all **45 tracked changed files**,
the new target-configuration source, all three new policy test files, and this new
taskfile. This included actual production, test, strict type/consumer and shipped/
website documentation changes, not just handoff summaries. Historical task changes
are supersession links only and their earlier evidence remains intact.

Checked `ps -C node,pnpm,esbuild,tsc -o pid,ppid,comm,args` before shared-output
builds and again before independent probes; no competing workers were present.
`ls -ld . _tmp-pop` verified the existing parents, and
`git check-ignore -v _tmp-pop/pop05-probe` matched `.gitignore:8:_tmp*` before
creating logs/reports. Build/test invocations below were serialized. The root build
uses its existing recursive workspace schedule; no separate build/test owner ran
alongside it.

**Disposition: return to coordinator for fresh corrective ownership of POP-06.**
The independent review found a reproduced C2/C4 predicate-isolation defect in the
changed request-only helper. POP-05 and overall definition of done are not complete.

Source/contract audit:

- C1: inspected synchronous requested-target capture, actual owning-runtime model/
  ACL checks and plain-object effective schema validation, including default fallback
  and closed `{}`; followed preflight through ordinary/helper and initiating mutation/
  child/private captures. Unused ordinary refs do not trigger eager registration.
  No old global, raw related kind, normalize-policy exception, service/Core raw
  branch, output-copy exception, or PPR reference-visibility helper/map remains in
  active production source or emitted runtime/declarations. Remaining removed names
  are explicit migration guidance, negative API tests or historical evidence.
- Both global setters/aliases normalize literal false only. Captured model/related/
  private/derived/embedded/child policy uses the new booleans; runtime dispatch and
  request/family ownership retain pre-await captures. Decorator validation accepts
  only boolean/undefined for each new key. Public model/query/client controls do not
  grant these capabilities; same-spelled business data remains ordinary data.
- C2: followed canonical target operation admission, separately scoped related
  operation grants, request rows/transforms, target field/document grants, original
  masks/identity and mandatory reference/match constraints. The configuration-only
  Document examples and actual generated/root denial controls agree with that
  boundary. Denied admission retains permitted IDs; an admitted scalar/array miss
  belongs to ordinary population, not ID restoration. **The helper's captured match
  is not isolated from its override hook: POP-06 below is required.**
- C3/C4: inspected complete private executor/cache and finalizer reconstruction,
  target-owned public handles versus positive fetch unions, terminal private input
  masks/native copies, row/base/override/ID enforcement, all four flag combinations,
  original slot/null/missing/duplicate ordering, hidden-write visibility, snapshots
  and nested stages. The removed PPR base-read visibility gate has not reappeared
  as conditional field hiding. Include output retains separately authorized
  attachment provenance; absent attachments preserve permitted originals. Reviewed
  actual cache coverage/eviction and limit-one/terminal-I/O assertions. These are
  bounded suite measurements, not a universal performance or plugin claim.

Fresh required V4 commands/results (repository root; logs are repo-relative):

```sh
pnpm build > _tmp-pop/pop05-root-build.log 2>&1
pnpm lint > _tmp-pop/pop05-root-lint.log 2>&1
TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router-runtime test > _tmp-pop/pop05-runtime-test.log 2>&1
TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router-deco test > _tmp-pop/pop05-deco-test.log 2>&1
```

| Gate                      | Exit | Actual result                                             |
| ------------------------- | ---- | --------------------------------------------------------- |
| Root build                | 0    | Workspace build script passed                             |
| Root lint                 | 0    | Repository ESLint passed                                  |
| Complete runtime script   | 0    | **135 passed / 12 files**, 0 failed/skipped/todo; 207.34s |
| Complete decorator script | 0    | **650 passed / 20 files**, 0 failed/skipped/todo; 91.61s  |

The decorator script includes its fresh closure build and source typecheck. Tool
timeouts were 900,000ms for root build/lint, 1,200,000ms for runtime and 1,800,000ms
for decorator; every V4 script finished. These scoped package tests are not a root
`pnpm test` result.

Reused V2/V3 evidence was audited against actual logs and current emitted contents:

- `_tmp-pop/pop04-final-typecheck.log`: fresh five-package closure/source typecheck
  passed. `_tmp-pop/pop04-package-final.log`: complete script passed **4,224 tests /
  136 files**, 0 failed/skipped/todo, 1,399.12s. Independently searched every actual
  passing consumer record: **strict 29, export 45, documentation 55, packed 10 = 139**,
  already included in 4,224. The prior failed/corrected POP-04 runs remain recorded.
- Reviewed root/advanced `.d.ts` and `.d.mts` aliases and the shared declaration
  graph's actual two-flag/JSDoc/default-schema surface, entry metadata, bundled
  ESM/CJS files, strict negative controls and README's actual Document example.
  Packed tests use the real publisher manifest transform, actual freshly assembled
  artifact tree and installed Express/Mongoose **5.0.0/8.0.0** and **5.2.1/9.8.0**,
  executing ESM/CJS and strict NodeNext/Bundler consumers. Current peers retain full
  declaration checking; existing minimum-peer lib-check limits are explicit.
- Inspected the actual artifact manifest/package JSON and successfully compared
  current `packages/access-router/dist` with
  `dist/web-ts-toolkit-0.99.0-test/packages/access-router/dist` using
  `git diff --no-index --exit-code`; all emitted bytes still match after V4 rebuilds.
  The equivalent README, llms.txt and package.json comparisons also exited 0.
  An attempted source-directory comparison was unavailable because the artifact
  intentionally omits `src`; it is not source-freshness evidence. Production source/
  shipped docs were not edited during this review.
- `_tmp-pop/pop04-website.log` proves the separate website production build/static
  generation; `_tmp-pop/pop04-pack-inventory.log` proves the **17-file** npm dry-run
  inventory (14 emitted files plus package.json/README/llms, no source/tests/scratch).
  Inspected those actual logs and the byte-equality assertions rather than treating
  the handoff summary as proof. No unchanged 20-minute server rerun was necessary.
- This evidence covers the delivered production/docs, **not** a final all-green
  tree including the new failing independent regression. POP-06 invalidates final
  acceptance and its correction must refresh the affected V2/V3/V4 gates.

Independent reproduction retained in new
`test/populate-operation-policy.review.test.ts`:

1. Initial plain-object mutation probe used actual emitted ESM, Mongoose population
   and Mongo rows: **2 passed / 2 failed across 1 file**, exit 1. Both canonical
   controls passed; both helper calls threw
   `Cannot delete property 'name' of #<Object>`.
   Logs/report: `_tmp-pop/pop05-independent-probes.log` and `.json`.
2. Expanded only that concrete isolation gap to native Date mutation. Exact command:

   ```sh
   TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.review.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop05-independent-native-probes.json' > _tmp-pop/pop05-independent-native-probes.log 2>&1
   ```

   **4 passed / 4 failed across 1 file**, exit 1; **0 skipped/todo**, 3.97s.
   Actual JSON reports `success: false`, 8 tests, 4 passed/4 failed, 0 pending/todo;
   its aggregate suite count includes nested describe nodes, not three test files.
   Plain helper cases throw in both Q modes. Native helper cases return **two
   referenced rows instead of one**, admitting the row excluded by the original
   Date predicate. All four canonical controls pass with unchanged original match,
   tenant rows, target field policy and mandatory source IDs. Only test formatting
   followed this final reproduction; production/emitted output stayed unchanged.

Review-owned edits: this status/evidence/follow-up record and the eight-case
independent regression. An initial new-test Prettier check flagged one chain layout;
corrected formatting only. Final targeted ESLint/Prettier logs:
`_tmp-pop/pop05-review-final-eslint.log`, `_tmp-pop/pop05-review-final-prettier.log`.
Final task formatting and tracked/all-new-file whitespace checks are recorded at
handoff. Task formatting initially flagged table spacing and the wrapped inline
error message; corrected layout only. Final check:
`pnpm exec prettier --check docs/tasks/20261026-225914-access-router-populate-operation-policy.md packages/access-router/test/populate-operation-policy.review.test.ts`
passed (`_tmp-pop/pop05-handoff-format.log`). `git diff --check` and
`git diff --no-index --check -- /dev/null <new-file>` passed for the task, new
configuration source and all four new policy test files (expected no-index new-file
status handled). Final status/unstaged/generated/dependency audit kept HEAD at
`4f544d5`, the index empty and package manifests/lockfiles/build configuration free
of changes; a final process inspection found no remaining build/test workers.
Existing intentional changes, source/tests/docs, historical links and
failed attempts remain preserved. No subagents, implementation fix, staging,
commits, reverts, dependency changes, publishing or generated-output hand edits.

### Task POP-06: Isolate request-only populate transform input from required match

Status: completed

Kind: bug

Priority: P1 — helper rewrites can crash supported calls or weaken mandatory requested match.

Dependencies: POP-01, POP-02, POP-03, POP-04. Discovered by POP-05's independent
review; POP-05 final acceptance awaits correction, avoiding a dependency cycle.

Primary ownership: **fresh corrective implementer assigned by the coordinator**,
not the POP-05 reviewer. Scope: `src/core.ts` request-only populate query preparation,
the retained independent regression and necessary helper/scoped-helper coverage.
Use the existing private preparation/isolation seams where appropriate; preserve
all earlier work and fixed C1-C4. No new compatibility policy or spec reduction.

Finding: `Core.genPopulate` freezes/captures descriptors at `src/core.ts:328`, then
passes `p.match` itself into `resolveAccessFilterForRequest` at lines 403-412 and
reuses it as the required predicate at line 415. `resolveAccessFilterParts` passes
that same input to `overrideFilter`. Plain mutation therefore throws; native Date
mutation succeeds and rewrites the required captured match. In contrast,
`src/acl/prepared-query.ts:98-112` detaches the ordinary transform input and retains
the original related predicate separately. Reproduced with both query-flag values
using the real emitted helper and actual target rows; see POP-05 evidence above.

Requirements / actionable acceptance:

1. Keep immutable, pre-await original match/selection/actor/target policy capture,
   but give override hooks an independent mutable ordinary query copy, including
   detached native leaves. In-place delete/assignment and native mutation must not
   throw because of the package snapshot or alter its required predicate.
2. After transformation, retain original requested match AND request base rows AND
   mandatory reference IDs. Query operation bypass must still skip only admission;
   operation-required, scoped helper and canonical behavior remain coherent.
3. Make all eight retained independent cases pass without disabling/weakening them,
   preserving the four canonical controls and row/field/ID controls. Add only focused
   coverage needed for the corrective seam (including named scoped helper use).
4. Fresh independent POP-05 review must inspect the correction and rerun its probes.
   Complete refreshed required verification before marking POP-06 or POP-05 done.

Verification: V1 fresh server closure then
`test/populate-operation-policy.review.test.ts`,
`test/populate-operation-policy.queries.test.ts`,
`test/populate-operation-policy.config.test.ts`,
`test/field-helper-request-boundaries.integration.test.ts` and
`test/subdocument-populate-authorization.integration.test.ts`; V2 fresh source
typecheck, focused ESLint/Prettier and tracked/new-file whitespace; complete V3
server/current-consumer script and affected V4 integration gates serialized.
Reuse website/inventory evidence only if shipped docs/exports remain unchanged.

#### POP-06 corrective implementation and independent-review handoff

Owner: fresh sequential POP-06 corrective implementer, separate from the POP-05
reviewer. Read C1-C4, the complete prior task/evidence record, root `AGENTS.md` and
`ai-friendly-ts-package`; set POP-06 to `in_progress` before implementation work.
Preserved the earlier intentional source/tests/docs and the reviewer's eight-case
`test/populate-operation-policy.review.test.ts` byte-for-byte (before/after
`git hash-object` comparisons matched). No nested agents or concurrent build owner.

Verified the existing parents with `ls -ld . _tmp-pop` and confirmed
`git check-ignore -v _tmp-pop/probe` matched `.gitignore:8:_tmp*` before creating
logs/fixtures. Initial and pre-build/test/final process inspections using
`ps -C node,pnpm,esbuild,tsc -o comm,args` found no competing workers. All build/test
invocations were serialized; Vitest retained `fileParallelism: false`. Commands
below ran from the repository root; quoted `<repo-root>` paths were expanded from
`$PWD` at execution. Evidence paths are repository-relative.

Changed files (package-relative unless qualified):

- `src/core.ts`: use the existing `deepIsolateValue` for the ordinary filter input
  passed to `resolveAccessFilterForRequest`. The package-owned captured original
  match remains separate, including Date/Buffer/BSON/RegExp leaves; hooks receive
  mutable containers and detached native values. After request transformation and
  base-row intersection, isolate `intersectFilters(originalMatch, resolvedFilter)`
  before returning the Mongoose descriptor. This also prevents descriptor-native
  mutations from changing the capture, application-returned predicate or request
  row-cache values, and prevents retained hook-native aliases from changing the
  prepared descriptor. Original relationship match remains ANDed with resolved
  rows/transforms; Mongoose retains its source-reference ID constraint.
- New `test/populate-operation-policy.helper-isolation.test.ts`: **12 focused real
  Mongo cases**, both query-flag values, using the named scoped service helper.
  Covers in-place object/native mutation after an await for read/list/custom
  `preview`, Date/Buffer/ObjectId/Decimal128 type-preserving isolation, retained
  hook-return alias mutation before target I/O, unchanged original match, target
  field/row/reference controls, non-enumerable original-selection/access metadata,
  returned descriptor isolation from override/base predicates and the same-request
  row cache, and application-hook throw/no-I/O/retry behavior.
- `docs/tasks/20261026-225914-access-router-populate-operation-policy.md`: own
  status, actual reproduction/verification and remaining independent gates.

Shared-helper audit: `Base.genPopulate` delegates to `Core.genPopulate`, including
named `scopePath`; retained subdocument `getParentDoc` uses the same service helper.
There is no separate populate alias requiring another production correction.
Canonical prepared-query isolation, generic `genFilter` behavior, effective
read/list/custom target policy, source-field/registered-config/schema admission,
captured flags/actor, original selections and scheduling boundaries retain their
existing implementations. The correction is one import and two copy boundaries
in the request-only populate seam.

Actual checks and failures:

1. Fresh before-fix closure passed:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router... build > _tmp-pop/pop06-before-build.log 2>&1
   TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.review.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop06-before-review.json' > _tmp-pop/pop06-before-review.log 2>&1
   TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.helper-isolation.test.ts --reporter=verbose > _tmp-pop/pop06-before-helper-isolation.log 2>&1
   ```

   Retained review: **4 passed / 4 failed, 8 cases / 1 file**, exit 1, 3.94s;
   all canonical controls passed, object helpers threw on frozen-key deletion,
   and native helpers returned two referenced rows rather than one. New focused
   extension: **12 failed / 12, 1 file**, exit 1, 5.14s; six frozen-input failures,
   four native hook/cache alias mutations and two replaced application errors.
   These are deliberate before-fix regressions, not fixture failures.

2. After the narrow correction, fresh V1 closure plus V2 source typecheck passed:

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-pop/pop06-final-typecheck.log 2>&1
   TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.review.test.ts test/populate-operation-policy.helper-isolation.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop06-correction-probes.json' > _tmp-pop/pop06-correction-probes.log 2>&1
   ```

   `typecheck` rebuilt the complete five-package server closure, then passed
   `tsc --noEmit -p tsconfig.typecheck.json`. Both test files passed **20 / 20**
   (**8 unchanged reviewer cases + 12 new cases**), 8.69s. JSON reports success,
   zero failed/pending/todo; aggregate suite nodes are not test-file counts.

3. The final affected behavior run passed **886 / 886 across 19 files**, 202.39s,
   zero failures/skips/todo in the actual JSON report:

   ```sh
   TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.queries.test.ts test/populate-operation-policy.dependencies.test.ts test/populate-operation-policy.config.test.ts test/private-populate-read-policy.config.test.ts test/virtuals-populate-dependencies.config.test.ts test/filter-denial.integration.test.ts test/service-authorization-rows.integration.test.ts test/field-helper-request-boundaries.integration.test.ts test/service-authorization-related.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-final-review.integration.test.ts test/request-hook-concurrency.test.ts test/virtuals-populate-dependencies.performance.test.ts test/private-populate-read-policy.review.test.ts test/subdocument-mutation-visibility.integration.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop06-final-focused.json' > _tmp-pop/pop06-final-focused.log 2>&1
   ```

   Includes the unchanged **84 ordinary-policy**, **320 dependency-policy** and
   **23 target-configuration** cases, filter overrides/terminal denials, mandatory
   parent/child/mutation predicates, related authorization, scoped helper and
   subdocument population, private native/reference isolation, hidden mutations
   and concurrency-one/bounded private work. Together with item 2: **906 passing
   tests across 21 files**, no repeated suite counted. No post-fix test/assertion
   correction or production edit was needed after the fresh typecheck.

4. Focused ESLint/Prettier passed on `src/core.ts` and the new helper-isolation
   suite; logs: `_tmp-pop/pop06-eslint.log`, `_tmp-pop/pop06-prettier.log`.
   Final task/reviewer-file formatting and tracked/new-file whitespace checks:

   ```sh
   pnpm exec eslint packages/access-router/src/core.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts
   pnpm exec prettier --check packages/access-router/src/core.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts
   pnpm exec prettier --check docs/tasks/20261026-225914-access-router-populate-operation-policy.md packages/access-router/test/populate-operation-policy.review.test.ts
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/test/populate-operation-policy.helper-isolation.test.ts
   git diff --no-index --check -- /dev/null docs/tasks/20261026-225914-access-router-populate-operation-policy.md
   ```

   New-file diff exit status 1 is handled without suppressing whitespace failures.
   Active source searches found neither old global nor the removed private
   reference-visibility gate/map. Status/index/dependency/generated audit shows
   only intended task work, an empty index and no changed package manifests,
   lockfiles or tracked generated/build configuration. No commits/staging,
   reverts, dependency updates, publishing or manual dist edits.

**Handoff / remaining blocker:** implementation and scoped V1/V2 checks satisfy
POP-06 requirements 1-3. POP-06 remains `in_progress` because requirement 4 still
needs independent POP-05 acceptance and refreshed complete V3/affected V4 gates.
The production correction invalidates the prior final full-server/current-packed-
consumer and affected integration freshness; those historical passing reports
are not acceptance of this corrected tree. The final reviewer must inspect both
copy boundaries, rerun the retained eight cases, complete the fresh V3 server/
current-consumer script and refresh affected V4 build/lint/runtime/decorator gates
before marking either task complete. Shipped docs/exports are unchanged, so review
can assess reuse of prior website/inventory evidence. No full server/current-
consumer or full-workspace root test was run by this corrective owner. POP-05 and
overall status remain `in_progress`, blocked on that independent acceptance; no
scoped failure remains in this handoff.

#### POP-05 resumed final independent acceptance of POP-06 and the complete policy

Historical approval before the later POP-07 completion re-review. The actual passing
commands/results below remain valid records, but the newly reproduced actual-model
ownership/pre-write gap supersedes this section's completion disposition.

The same independent POP-05 reviewer resumed after the fresh POP-06 corrective
owner and coordinator handoff. Read the actual narrow correction and the complete
new 12-case helper-isolation suite, the unchanged eight-case reviewer suite, and
POP-06's logs/JSON/evidence. Earlier complete scoped production/test/type/doc diff
review against `4f544d5` remains recorded above; unchanged areas were not replaced
by another summary-only review. Both task statuses stayed `in_progress` until all
refreshed required gates below had actually finished.

Rechecked existing scratch parents with `ls -ld . _tmp-pop` and confirmed
`git check-ignore -v _tmp-pop/pop05-resume-probe` matched `.gitignore:8:_tmp*` before
creating new logs/reports. Process inspections before the fresh closure, full server
and downstream builds found no competing build/test owner. All build/test commands
were serialized, with no nested agents; package/root scripts used their existing
workspace schedules and server Vitest retained `fileParallelism: false`.

**Independent finding disposition: POP-06 accepted; no further required finding.**

- At `src/core.ts:329`, descriptors and native query intent are still captured
  independently before field/operation awaits. The corrective import reuses the
  existing `deepIsolateValue`, whose actual Date/RegExp/Buffer/BSON and mutable
  plain-container behavior was inspected; it does not JSON-coerce these inputs.
- At lines 404-415, only the detached ordinary `deepIsolateValue(match)` reaches
  mutable hook resolution. The mandatory original match remains separate while
  override hooks await, mutate keys/native leaves or throw. Pre-await flags, actor,
  effective target policy and source/target field admission retain their existing
  captured boundaries.
- At lines 418-419, the returned descriptor isolates the AND of original match and
  resolved transformation/base rows. This prevents later hook-returned aliases or
  descriptor-native changes from changing the required capture, hook-owned predicates
  or request row-cache values. Mongoose still supplies original reference IDs; the
  correction adds no operation/row/field authority or private dependency I/O.
- Inspected actual real-Mongo scoped tests for read/list/custom access in both query
  modes, mutation after await, Date/Buffer/ObjectId/Decimal128 values, retained hook
  aliases before target I/O, returned predicates versus the same-request base cache,
  throw/no-I/O/retry behavior, selected-field metadata and unrelated-ID controls.
  The eight original reviewer cases are byte-unchanged (`git hash-object` checked
  before and after the refreshed gates). Both copy boundaries are necessary and
  the correction satisfies POP-06 requirements without weakening assertions/C1-C4.

Fresh V1/V2 and complete V3 commands (repository root; quoted placeholders were
expanded from the actual repository root at execution):

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck > _tmp-pop/pop05-resume-typecheck.log 2>&1
TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy.review.test.ts test/populate-operation-policy.helper-isolation.test.ts test/populate-operation-policy.queries.test.ts test/field-helper-request-boundaries.integration.test.ts test/subdocument-populate-authorization.integration.test.ts --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop05-resume-focused.json' > _tmp-pop/pop05-resume-focused.log 2>&1
TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop05-final-server.json' > _tmp-pop/pop05-final-server.log 2>&1
```

- Source typecheck exited **0**, freshly rebuilding the full five-package server
  closure before `tsc --noEmit -p tsconfig.typecheck.json`.
- Independent focused execution exited **0**: **115 / 115 tests across 5 files**,
  **0 failed/skipped/todo**, **31.03s**. Includes all **8 unchanged reviewer**, **12
  corrective isolation**, **84 ordinary-policy**, **7 request-helper** and **4
  subdocument-populate** cases. Actual JSON reports success and zero pending/todo.
- The complete server script freshly rebuilt the closure and exited **0**:
  **4,244 / 4,244 tests across 138 / 138 files**, **0 failed/skipped/todo**,
  **1,470.45s** Vitest duration. Its shell timeout was **2,400,000ms**; the invocation
  completed without interruption. Actual verbose log and JSON were inspected;
  JSON aggregate suite nodes include describe blocks, not additional test files.
  This refresh supersedes POP-04's 4,224/136 result for current-source acceptance.

The same full run includes all four current consumer suites, verified by counting
their actual passing per-test log records:

| Current consumer suite                       | Passed  |
| -------------------------------------------- | ------- |
| `test/strict-consumer-types.test.ts`         | 29      |
| `test/export-contract.test.ts`               | 45      |
| `test/documentation-examples.test.ts`        | 55      |
| `test/packed-consumer-compatibility.test.ts` | 10      |
| **Included consumer total**                  | **139** |

The 139 are included in 4,244, not additional tests. The packed cases freshly
execute the actual publisher-transformed tarball and rebuilt artifact tree with
Express/Mongoose **5.0.0/8.0.0** and **5.2.1/9.8.0**, real ESM/CJS runtime flows,
strict NodeNext/Bundler consumers, the exact shipped Document example and both
hydration-mode array fixture. Current peers retain full declaration checking;
the established minimum-peer lib-check bounds remain explicit. Root/advanced
declaration/hover and removed-name/client/model negative controls all passed.

Fresh final V4 commands, serialized after V3:

```sh
pnpm build > _tmp-pop/pop05-final-root-build.log 2>&1
pnpm lint > _tmp-pop/pop05-final-root-lint.log 2>&1
TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router-runtime test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop05-final-runtime.json' > _tmp-pop/pop05-final-runtime.log 2>&1
TMPDIR='<repo-root>/_tmp-pop' pnpm --filter @web-ts-toolkit/access-router-deco test --reporter=verbose --reporter=json --outputFile.json='<repo-root>/_tmp-pop/pop05-final-deco.json' > _tmp-pop/pop05-final-deco.log 2>&1
```

- Root build and root lint each exited **0**. Logs retain the actual exit status.
- Complete runtime script exited **0**: **135 / 135 tests across 12 / 12 files**,
  **0 failed/skipped/todo**, **209.27s**. Its fresh dependency build also passed.
- Complete decorator script exited **0**: **650 / 650 tests across 20 / 20 files**,
  **0 failed/skipped/todo**, **91.84s**. Its fresh dependency build and source
  `tsc --noEmit -p tsconfig.typecheck.json` also passed.
- Inspected actual runtime/decorator verbose logs and successful JSON reports.
  Root build/runtime timeouts were 1,200,000ms, lint 900,000ms and decorator
  1,800,000ms. All invocations finished; no timeout/failure was reclassified as a
  pass. These are the required scoped V4 scripts, not a full-root `pnpm test`.

Final current-output/docs/package audit:

- Compared correction-generated output with the older POP-04 artifact before V3:
  only `dist/index.js`/`index.mjs` changed, for the two copy boundaries and imported
  helper initialization. The root/advanced/processors `.d.ts`/`.d.mts` shared graph
  and entry metadata remained unchanged. Inspected the actual emitted new calls
  and shared `GlobalOptions` declarations; both booleans/defaults/JSDoc remain exact.
- V3 freshly rebuilt the actual artifact and verified transformed packed/artifact
  bytes against current JS/declarations/README/llms. After the final V4 rebuilds,
  `git diff --no-index --exit-code` again returned **0** for the entire current
  `packages/access-router/dist` versus
  `dist/web-ts-toolkit-0.99.0-test/packages/access-router/dist`, plus separate README,
  llms.txt and package.json comparisons. Thus the final emitted output is the same
  corrected output exercised by the fresh installed-consumer run.
- Reused the exact applicable `_tmp-pop/pop04-website.log` production/static-build
  pass and `_tmp-pop/pop04-pack-inventory.log` **17-file inventory** pass. Correction
  changes no shipped docs, website input, package/export/file configuration or
  declaration graph; the 14 emitted filenames plus README/llms/package.json remain
  the same. This reuses inventory structure, not the old runtime bytes/hash: current
  runtime bytes and real publication layouts were freshly exercised by V3.
- Final source/emitted/decorator searches found no active removed globals,
  unregistered raw-target kind/exception, or PPR target-base-read reference-visibility
  helper/map. Historical names remain only where explicitly historical/removed or
  negative API controls. The earlier full C1-C4 acceptance audit plus the refreshed
  complete configuration/query/dependency/output/consumer gates establish mandatory
  configured schema targets, independent captured Q/D policies, source-authorized
  ID retention, admitted misses, private isolation and separate include provenance.

Final integrity checks:

```sh
pnpm exec prettier --check packages/access-router/src/core.ts packages/access-router/test/populate-operation-policy.review.test.ts packages/access-router/test/populate-operation-policy.helper-isolation.test.ts
git diff --check
git diff --no-index --check -- /dev/null <each-new-task/source/test-file>
```

Code formatting passed (`_tmp-pop/pop05-final-code-format.log`); root lint already
covers the corrected source and both review files. Final task formatting and all
seven new task/source/test-file whitespace checks passed at handoff (expected
no-index new-file status handled); task/code final formatting log:
`_tmp-pop/pop05-final-handoff-format.log`. Status/index/dependency/generated audit retained
the intentional work, empty index, HEAD `4f544d5`, and no manifest/lockfile/build-
configuration or tracked generated change. Source and both probe-file hashes stayed
stable through the fresh gates; only this task's acceptance/status evidence was
edited by the resumed reviewer. Prior failed review and before-fix records remain.

**Final disposition:** POP-06 requirements 1-4 independently accepted; POP-06 and
POP-05 completed, and overall definition of done satisfied. No unresolved required
finding, failed/incomplete gate or remaining blocker. Scope remains the declared
server/decorator/runtime integration and installed-consumer contract; no unrelated
whole-workspace tests, universal peer/plugin coverage or broader performance claim.
No commits/staging, reverts, dependency updates, publishing, nested agents or manual
generated-output edits were performed.

### Task POP-07: Bind ordinary population to its validated actual Mongoose target

Status: completed — actual ordinary Model binding, pre-write failures and captured-instance transport independently accepted by MPO-04; corrected include ownership and final V2/V3/V4 also passed.

Kind: defect

Priority: P1 — a same-named unrelated model's ACL policy can authorize an unregistered actual target, and a missing actual target can fail after a write.

Dependencies: none pending. The delivered POP-01..04 implementation is the correction
baseline; POP-01's reopened acceptance and POP-05 signoff depend on this fix, so
POP-07 must not depend on their blocked completion.

Primary ownership: a fresh corrective implementation sub-agent; ordinary target
resolution/capture, required target configuration/model ownership, private internal
population binding transport and affected canonical/helper/mutation regressions.
The final reviewer must remain independent of this corrective owner.

Finding and inspected source:

- `src/acl/related-execution.ts:68-75` obtains a ref model name and validates the
  runtime's model/configuration for that name. It does not require that instance
  to match the target actually resolved by the source's Mongoose reference.
- `src/acl/populate-target-configuration.ts:19-30` validates the runtime model and
  schema policy, without source-reference identity context.
- `src/model.ts:107,117` passes ordinary descriptors to Mongoose without an explicit
  validated model binding. String refs are resolved on the source connection.
- The private path already checks actual same-connection model identity in
  `src/acl/virtual-populate-dependencies.ts:245-250`. Ordinary capture lacks an
  equivalent ownership guarantee; its batching-shape check can fall back to the
  adapter rather than reject a mismatched actual target.

Fresh completion re-review reproduction used actual Mongo/Mongoose and the current
emitted public runtime in both query-flag modes, without source edits:

1. Create connections A and B; register Source from A, with string ref `Target`.
2. Register/configure Target from B in that isolated ACL runtime, with object
   permissionSchema and allowed target operation.
3. With no Target model on A, `Service.create` persists one Source document and
   then throws `MissingSchemaError` while populating. Configuration did not fail
   before the mutation, violating C1 and POP-01 requirement 3.
4. With a different Target model on A that has no ACL registration/configuration,
   canonical `Service.findOne` and request-only `Core.genPopulate` population read
   and return A's target data under B's captured policy. Actual target reads hit A;
   B receives none. Both true/false query requirement modes reproduce the mismatch.

This is an actual-model ownership gap, not an operation-flag or field-selection
bypass claim for correctly bound targets. C1's registered actual target and
pre-write requirements and C4's model/policy ownership remain unsatisfied.

Requirements:

1. Resolve and validate the actual target of each supported ordinary ref against
   the owning runtime's registered/configured Mongoose instance, not only its name.
   Reject missing/mismatched actual bindings before relevant target I/O or writes;
   never auto-register an unconfigured model or force an unrelated same-named one.
2. Carry the validated actual binding through population and finalization. Prevent
   late source-connection lookup from substituting a different target after capture.
   Preserve currently supported explicit model-valued/cross-connection refs when
   their actual target is correctly registered/configured; document unsupported
   shapes rather than silently admitting a model-name match.
3. Cover canonical calls, request-only helpers, post-save population and relevant
   nested/array/dedicated seams under both flag values and hydration modes. Retain
   root/direct operation denial, field/row/match/ID policies and exact ID fallback.
4. Retain a meaningful before-fix regression, positive correctly bound controls,
   cross-runtime/same-name negatives and pre-write/query-count assertions. Refresh
   affected type/runtime/installed-consumer evidence before independent acceptance.

Observable acceptance:

- A correctly configured same-name model on another connection cannot authorize
  source-connection data from an unregistered actual target.
- Missing/mismatched actual targets yield the controlled admission error with zero
  initiating create/save and zero unintended target queries, in both query modes.
- Correctly bound supported refs still populate with the exact current operation,
  row, field, match, selection and ID-restoration behavior.
- In-flight population cannot switch to a different actual model via mutable
  connection registry/ref lookup; later operations revalidate configuration.
- POP-01 and POP-05 are only re-completed after correction and independent review.

Verification: meaningful failing/passing new binding regressions; V1 relevant
registration/query/helper/dependency/mutation suites; V2; then applicable refreshed
V3/V4 and independent correction acceptance. No failing case may be removed or
weakened to preserve an earlier completion claim.

#### Subsequent completion re-review evidence

The user requested another audit of whether all task items are genuinely complete.
A fresh read-only runtime reviewer, independent of the implementers, examined C1-C4
and the scoped runtime source/diff and reproduced POP-07 with an ignored temporary
probe after checking parent/ignore rules. The probe was executed and removed; no
production, test or generated files were changed by that review.

Fresh existing-suite verification against current built output passed **447 tests
across 5 files**, zero failed/skipped/todo, **104.16 seconds**:

- `test/populate-operation-policy.config.test.ts`: 23 passed.
- `test/populate-operation-policy.queries.test.ts`: 84 passed.
- `test/populate-operation-policy.dependencies.test.ts`: 320 passed.
- `test/populate-operation-policy.review.test.ts`: 8 passed.
- `test/populate-operation-policy.helper-isolation.test.ts`: 12 passed.

The existing suites do not cover the reproduced actual-connection binding gap.
Prior full V3/V4 passing evidence is preserved above but does not establish POP-07
acceptance. The coordinator inspected the relevant capture/adapter/private binding
seams and reopened POP-01, POP-05 and overall completion. Other completed task
entries retain their historical implementation evidence. A corrective implementation
has not been started by this review-only request.

#### POP-07 corrective implementation handoff (executed as MPO-00)

The fresh sequential MPO-00 corrective owner set both execution records to
`in_progress` before code and implemented this **same existing POP-07**, preserving
the coordinator's cross-link and new plan. The single detailed change/command/
failure/control/handoff record is
[MPO-00 implementation and MPO-01 handoff](20261027-120942-access-router-target-model-populate-policy.md#mpo-00-implementation-and-mpo-01-handoff).

Actual source-ref resolution now requires the owning runtime's configured **exact
model instance** before initiating writes or target queries. Both canonical and
helper descriptors bind that captured instance for Mongoose, including post-save,
dedicated-child and explicit cross-connection fallback; target service construction
and finalization retain the same model/policy across awaits and registry changes.
No caller Model option or unconfigured-target admission was added.

Retained actual-Mongo before-fix binding probes: **80 failed / 8 passed**. Initial
correction passed 88/88; an expanded runtime-registry probe then exposed **4 failed /
112 passed** target document-grant contexts, corrected by private captured-model
construction. Final new suite: **136/136**, both query flags/hydration modes,
zero-write/no-unintended-query negatives, correctly bound/explicit cross-connection
positives, late registry/schema replacements and later-call revalidation. Affected
existing suites: **1,017/1,017 across 25 files**; total final scoped evidence:
**1,153 distinct passing cases / 26 files**. The detailed record preserves initial
fixture corrections and the later native multidimensional-array oracle correction;
the earlier mixed-result invocation is not labeled all-green.

Fresh server closure/source typecheck, focused ESLint/Prettier and code/new-test
whitespace passed. Both flags still use this phase's current global API; per-target
scope migration starts with MPO-01. **POP-07 remains in_progress** for current
consumer/integration gates and independent MPO-04 acceptance. POP-01 and POP-05
remain blocked; their historical approval is not re-completed by this implementation
handoff. No complete server/pack or full-root test claim is made by MPO-00.

#### MPO-04 independent re-review and required corrective return

Historical corrective return; final independent acceptance below supersedes its
blocking disposition while preserving the original reproduced failure.

The fresh independent MPO-04 reviewer read this full record and the target-model
phase's C1-C4/requirements/evidence, reviewed actual delivered source/tests/types/
docs against `49699bb` and current external HEAD `f6c7112`, and verified the saved
recovery reports/fingerprints and current emitted/artifact bytes. Detailed current
commands/results and the reproduced finding are recorded in
[MPO-04 independent review and corrective return](20261027-120942-access-router-target-model-populate-policy.md#mpo-04-independent-review-and-corrective-return).

- The original POP-07 ordinary string/explicit-Model binding correction is verified
  by the retained **136 real-Mongo binding cases**, the fresh **347-case / 5-file**
  focused run and eight additional actual ESM/CJS cross-connection/default/native
  probes. Missing/mismatched targets fail before writes/target I/O; valid ordinary
  cross-connection refs and in-flight pinning retain their current controls.
- Audited source-fresh complete server evidence is **5,072 / 154 files**, including
  **139 current consumers (29/45/55/10)**. Fresh MPO-04 V4 finished: root build/lint,
  runtime **135 / 12 files**, decorator **681 / 21 files**; no skipped/todo/failing
  case in those invocations. Those passes do not cover the new failing include
  regression as an all-green final tree.
- Required new **MPO-05** reproduces C2's include receiver mismatch: after capture
  on A, a same-named runtime receiver replacement reads B's include row while
  retaining A's private target graph and computed `private-A` value. Both legacy/
  correlated includes and both source hydration modes fail; retained reviewer
  regression is **4 failed / 4 unchanged-model controls passed / 1 file**. This
  blocks final acceptance despite the ordinary correction's scoped success.

Reopened POP-01/POP-05 criteria explicitly use the newer target-owned **model and
default-model** API. The earlier `GlobalOptions` pair, setter/alias positives and
global-only type promises are historical/superseded; current globals reject the
pair with migration diagnostics. Mandatory actual target configuration/schema,
pre-write admission, no raw passthrough/old aliases, independent operation-only
gates, exact permitted IDs, field/row/match/private isolation and coherent nested
ownership remain required. POP-01/POP-05 and linked POP-07 are **not re-completed**
until a fresh MPO-05 owner corrects the include seam, refreshes affected V2/V3/V4
and obtains independent MPO-04 acceptance. Preserve all earlier failed probes,
approval and reopening evidence.

#### MPO-04 resumed independent final acceptance and scope reconciliation

After fresh MPO-05 correction and coordinator handoff, the same independent reviewer
inspected the actual corrected include capture, held-service construction and
authenticated source/receiver binding; re-ran the byte-unchanged eight-case reviewer
regression and two corrective suites (**33/33 / 3 files**) and four additional
independent ESM/CJS cross-request/runtime probes. All passed. Model/policy/private
input ownership is now held across ordinary and include execution, without lending
the held Model to independent calls. The linked original POP-07 string/explicit-Model
binding and pre-write controls remain intact, including **136 current binding cases**.

Corrected-source server closure/typecheck passed; the complete server script passed
**5,105 / 157 files**, including **139** current consumers (strict 29, export 45,
documentation 55, packed/artifact 10). Fresh serialized V4 root build and lint
passed; runtime **135 / 12 files** and decorator **681 / 21 files** passed, with
zero failed/skipped/todo cases. Actual JSON/log/status records, **362** unchanged
handoff fingerprints and current generated/artifact byte equality were verified.
The full exact commands, timings, peer/declaration bounds and applicable reused
website/17-file inventory evidence are recorded in
[MPO-04 resumed independent final acceptance](20261027-120942-access-router-target-model-populate-policy.md#mpo-04-resumed-independent-final-acceptance-of-mpo-05-and-pop-07).

**Requalification:** POP-01's old global-placement/alias and no-model-override
criteria are explicitly superseded by the approved target-model/default-model
contract. The two strict built-in flags, their undefined inheritance/malformed-value
behavior, registered actual instance/effective schema, no raw passthrough/old aliases,
operation-only bypass, field/row/match/ID constraints, private isolation and
pre-write failures all pass current verification. POP-05's integrated requirements
also pass with the corrected include Model binding and independent evidence.
POP-01, POP-05 and POP-07 are completed; no required linked finding or gate remains.
Historical failed probes, former approval and subsequent reopening remain above.

## Definition of done and creation evidence

POP-01..05 and required follow-ups must be completed with actual evidence. C1-C4,
full server/current installed consumer checks, affected integrations, build/lint,
source typecheck, docs/pack and independent acceptance must pass. No silent scope
reduction, stale compatibility alias or unverified completion.

Current independent disposition: **completed**. POP-01..07 and the required MPO-05
follow-up are independently accepted with corrected-source V2/V3/V4 and the newer
target-model/default-model scope. No required finding, gate or follow-up remains.
The earlier POP-01..06 approval and V2/V3 **4,244 tests / 138 files** including
**139 consumers**, root build/lint, runtime **135/12** and decorator **650/20**
remain historical evidence. Historical failed attempts, later reopening and the
four-case MPO-05 pre-correction failure remain preserved. No full-workspace test or
unbounded performance claim is made.

Creation baseline: `git status --short` was clean and `git log -1 --oneline` reported
`4f544d5`. Inspected instructions/source/related task contracts as described above;
runtime/build/type/pack checks were not rerun solely for plan creation. The generated
timestamp names this new phase. Formatting/whitespace/links/dependencies and required
task fields are checked before POP-01 starts; append actual checks and execution
evidence as work proceeds. No feature task is complete by saving this file.

Pre-handoff plan checks passed: installed Prettier on this file and the previous
phase's cross-link, tracked/new-file whitespace checks, and review of five unique
task IDs, required fields, links and acyclic dependencies. Process inspection found
no node/pnpm/tsc/esbuild worker. Only this file and the intentional previous-phase
cross-link changed during plan creation.
