# Access-router: private populated dependencies for virtuals

Created: 2026-10-24 23:41:03 local (`20261024-234103`, generated with `date +%Y%m%d-%H%M%S`).

Status: planned — DPV-00 through DPV-06 are pending.

## Objective and purpose

Add server-configured `dependsOnPopulate` alongside virtuals' existing `dependsOn`.
An authorized virtual may need related persisted fields that the caller cannot read.
Load those declared inputs automatically, compute the virtual, and reconstruct the
response using the original caller-facing selection, population, and authorization.

This is an opt-in capability improvement, not a finding that the current target
trimming is defective. Local `dependsOn` already separates private computation
inputs from public output; the enhancement extends that distinction across stored
references and supports batched loading instead of per-document getter queries.

**Central invariant:** private population may supply computation inputs and produce
an authorized virtual result, but must not otherwise broaden output fields or turn
an ordinarily unpopulated reference into a public populated object.

Proposed server configuration fragment; getter typing and descriptor details are
settled in DPV-00:

```ts
const dependencyOptions = {
  dependsOn: ['total'],
  dependsOnPopulate: [{ path: 'account', select: ['balance', 'creditLimit'] }],
};
```

For example, `canPlaceOrder` may use private account inputs while the caller may
receive only `account.name`, the account ID, or no account field at all.

## Scope and non-goals

- Primary package: `packages/access-router`, including configuration/types,
  captured execution policy, projection/populate planning, shared finalization,
  document-bearing service paths, tests, and installed-package documentation.
- Required paths: direct model list/read/readFilter, create/update/upsert responses,
  `new` templates, populated/included target outputs, embedded scopes, and dedicated
  subdocument outputs. DPV-00 specifies applicability and absence behavior for each;
  a narrower supported reference shape must be rejected/documented explicitly.
- Preserve direct/root/trusted-service consistency, server-owned hydration, current
  operation/access mappings, include provenance, private document authorization,
  and mutation visibility/lifecycle contracts.
- Website configuration/hook documentation and existing declaration/packed-consumer
  fixtures are included. Change downstream packages only if a demonstrated type or
  configuration integration requirement is recorded first.
- Non-goals: writable or database-queryable virtuals, DataRouter virtuals, a new
  client-side dependency/authority option, a general relationship-policy redesign,
  new package entrypoints, dependency upgrades, or release/publishing automation.
- Recursive private population and private virtual-to-virtual computation are not
  presumed supported. DPV-00 must define a finite initial scope instead of quietly
  accepting shapes that cannot execute correctly.

## Agreed behavior

### A1 — Dependency authority and eligibility

1. `dependsOnPopulate` belongs to trusted model virtual configuration. Neither
   HTTP input nor an ordinary service query can create or widen that authority.
2. Caller denial of the source reference field or the declared target input fields
   does not by itself prevent their private use by an authorized virtual. The
   virtual's output is independently authorized using its existing effective access.
3. Automatically retain the source reference needed to load a dependency. Repeating
   its path in `dependsOn` must not be necessary.
4. Plan only dependencies of selected, applicable virtual candidates. Known-denied
   virtuals cause no dependency-only target query. Preserve deferred document-based
   authorization; do not treat a global-permission miss as final denial.
5. Field-input authority does not settle target operation admission or row scope.
   D1 below must define those separately, retaining mandatory relationship and
   tenant constraints and the original request actor.

### A2 — Selection union is fetch-only

For each compatible target scope, combine:

- the ordinary populate plan's persisted fetch requirements;
- the active virtuals' declared private populated selections;
- required identity, policy-hook, association, and target-virtual inputs.

Keep the original public output/authorization plan separate and immutable. A private
field survives in populated output only if it independently belongs to the original
selection and passes the effective target output policy. Being readable is not
enough when it was not selected. Being fetched is never an output grant.

Resolve projection semantics before unioning paths. Preserve existing string,
array, object, omitted/effectively empty, exclusion, dotted-path, and `-_id`
behavior where supported by the D2 dependency contract; never concatenate conflicting
include/exclude tokens into a Mongo projection. Compact ancestor/descendant fetch
paths without broadening public output. Private `_id` retention never defeats a
public `-_id` exclusion.

Example: ordinary populate selects authorized `name`; the virtual requires
`balance` and `creditLimit`. Fetch the union plus internal requirements, make the
declared private values available to the getter, and return only `name` with normal
identity behavior. The same stripping applies if either private field is readable
but unrequested, explicitly excluded, or denied.

### A3 — Restore the original response shape

The original query is the effective caller-facing query, including existing server
defaults, captured **before** internal dependency expansion.

- Ordinary population requested and permitted: return its original authorized
  target projection and ordinary match/null/array behavior.
- No ordinary population requested, and source reference selected and permitted:
  restore its original ID or array of IDs after virtual computation.
- Source reference unselected, excluded, or denied: omit the field entirely,
  including its ID. Internal fetching must not add output eligibility.
- Ordinary population requested but denied: preserve the ordinary denial/fallback
  response; internal population cannot make the denied request publicly succeed.

Preserve original reference values before population, rather than reconstructing
them from returned targets. Restore missing-target IDs, duplicates, array order,
original nulls, absent fields, and empty arrays exactly. This must work in both
lean and hydrated modes. Public identity rules still apply after restoration.

### A4 — Isolated inputs, scopes, and lifecycle

- Keep private populated inputs distinct from finalized public related DTOs and
  their document-authorization handles. Only returned virtual values are committed.
  Private inputs must not be attached to response DTOs, public authorization
  metadata/handles, or the ordinary data given to decorate/decorateAll/tasks.
  This governs implicit transport: a trusted getter still deliberately chooses its
  returned computed value, governed by the virtual's own output authorization.
- Getters without the new declaration retain their existing finalized-related-view
  contract. D3 specifies how each opted-in getter receives its declared private
  fields without exposing another getter's undeclared private expansion.
- Capture configuration, target policies, and dependency selections coherently
  before asynchronous work. Live option replacement cannot mix fetch and getter
  definitions; separate requests/runtimes and public/private scopes must not share
  mutable target data or incorrectly reusable authorization state.
- A caller's `populate.match`, `access`, or selection must not redefine the virtual's
  declared private inputs. Share a fetch only when target/model/row constraints are
  compatible; otherwise preserve independently scoped queries/views. Keep ordinary
  populate filtering and authorization intact.
- Preserve lifecycle snapshots, source inputs for permission hooks and include
  joins/correlation, validation/save behavior, and output-only computed values.
  Final trimming/restoration also runs when a getter returns undefined, throws,
  is denied after fetch, or has a missing dependency.
- Batch compatible dependency work across rows and virtuals; preserve existing
  request/runtime persistence and hook bounds, including limit-one completion.

## Analysis coverage and baseline

Planning baseline: HEAD `fb3b28e`; `git status --short` was clean before creation.
Source and representative test code were inspected; no build, runtime test,
typecheck, packed consumer, or performance baseline was run for this planning-only
deliverable. Existing tests are references, not newly executed evidence.

Confirmed current behavior and implementation anchors:

- `packages/access-router/src/interfaces/router-hooks.ts:155-215`
  (`ModelVirtualGetter`, `ModelVirtualDescriptor`, `ModelVirtualAccessRecord`):
  dependencies are local persisted names; getter input is the persisted model's
  partial view plus finalized related output. No populated dependency property.
- `packages/access-router/src/runtime.ts:261-425`
  (`validateVirtualDependsOn`, `validateVirtualLeafValue`, `validateVirtualsScope`):
  strict descriptor keys reject the proposed property; ordinary dotted or
  virtual-to-virtual dependencies are deliberately rejected.
- `packages/access-router/src/acl/output-projection.ts:146-269`
  (`planCatalogProjection`): candidate dependencies enter fetch requirements, with
  separate output eligibility and private provenance. This is the canonical
  schema-backed planner; `acl/virtual-projection.ts` also has a legacy planner and
  shared descriptor resolver that must remain consistent.
- `packages/access-router/src/services/service.ts:788-863`
  (`genExecutionPopulate`): source field, target operation/rows, and target output
  planning govern ordinary population. Adding a dependency to the source fetch
  selection alone does not authorize private target loading.
- `packages/access-router/src/acl/related-execution.ts:23-92`
  (`captureRelatedTargets`, `createRelatedExecution`) and
  `packages/access-router/src/acl/model-output-planning.ts:18-44`: target configuration/policy
  capture currently follows ordinary related descriptors.
- `packages/access-router/src/services/service.ts:880-1098,1364-1399,1704-1727`
  and `packages/access-router/src/output/finalize-model-output.ts:409-549,621-700`:
  target output is finalized before parent getters; private target inputs have
  already been stripped. A separate getter-input representation is required.
- `packages/access-router/src/model.ts:96-120` (`find`, `findOne`): Mongoose
  population happens inside the query before service snapshots are created.
  `packages/access-router/src/acl/output-field-filter.ts:247-263` (`copyAuthorizedReference`)
  can reduce an unauthenticated object to `_id`, but cannot recover missing refs
  or determine original population intent. Neither is sufficient ID restoration.
- `packages/access-router/src/services/service.ts:1778-1959,2004-2055`:
  create populates after persistence; `new` has its own template finalizer and
  continues to ignore `args.select`.
  `packages/access-router/src/acl/subdocument-output.ts:40-120` separately prepares
  population and finalizes scoped child output.
- Existing evidence to extend: `test/virtuals-projection-planner.unit.test.ts`,
  `test/virtuals-populate-include.integration.test.ts`,
  `test/virtuals-performance.probe.test.ts`, and
  `test/service-authorization-related.integration.test.ts` under the server
  package. They cover local dependency stripping, authorized populated inputs,
  batched population, and separate related authority, not the new private contract.

Limitations: not an exhaustive audit of every mutation/subdocument branch,
application Mongoose plugin, refPath/discriminator combination, peer version, or
downstream package. No speedup or constant query count is asserted without DPV-04
measurement. Line anchors can move; refresh named symbols before editing.

### Related work and deduplication

Focused searches found no existing `dependsOnPopulate`/`populateDependencies` task.
This new phase builds on, rather than reopens, these contracts:

- [Package virtuals](20261005-122217-access-router-package-virtuals.md), especially
  VIRT-00A's getter/dependency contract and VIRT-05/VIRT-11 related-output behavior.
  The documented finalized-only related view needs an explicit opt-in exception.
- [Explicit service authorization](20261007-143507-access-router-explicit-service-authorization.md):
  separate field/row/operation authority and captured related policies.
- [Long-term health](20261012-165209-access-router-long-term-health.md):
  include-source provenance and isolated output contexts.
- [Server-owned hydration](20261015-162927-access-router-server-owned-hydration.md):
  model-owned hydration choices and their value-conversion caveats.

These are context links, not pending cross-document prerequisites. Preserve their
historical evidence and current regression coverage.

## Decisions required before implementation

DPV-00 owns this bounded decision record with the maintainer. A1-A4 are fixed
requirements; the following details remain unresolved, not implicit permission to
invent a broad bypass:

- **D1 — Private target authority:** target effective access; behavior when target
  read/list operation is denied; row/baseFilter/overrideFilter rules; interaction
  with explicit service `authorization.related`. Distinguish source/target field
  input authority from operation and row authority. Define how denied targets
  affect the getter without altering ordinary populated output.
- **D2 — Descriptor and initial reference scope:** shared/per-access inheritance
  and leaf overrides; supported `select` grammar and omitted/empty semantics;
  reference/target registration validation timing; allowed target fields and
  supported scalar/array/embedded reference shapes. Recommended starting scope:
  single-hop stored refs and persisted target fields, with unsupported recursion,
  dynamic refs, or target-virtual chaining rejected explicitly unless supported by
  evidence. Do not silently change ordinary `Populate.select` grammar.
- **D3 — Getter typing and missing values:** a stored reference ID does not provide
  the related model type. Specify typed private getter inputs without weakening
  all getters or claiming populated shapes in persisted/write/result types. Define
  per-getter views, missing target/field versus null behavior, and dependency-fetch
  failure handling. Preserve existing getters' failure/undefined omission contract.
- **D4 — Execution/lifecycle:** how refs are captured before population in both
  hydration modes; compatible-query grouping; whether/how `new` loads default
  references; mutation response loading without changing saved reference values
  or retry semantics; bounded handling of dependency graphs across related outputs.

Implementation is gated on recorded D1-D4 decisions. Investigation can start now.
If a choice requires maintainer input, mark DPV-00 blocked with the exact question
and recommendation; later tasks remain pending.

## Execution and verification

Priority meanings: **P1** is a correctness/policy prerequisite for this feature;
**P2** is release-readiness/documentation evidence after the core behavior. Every
task below is required to ship; these priorities do not imply an urgent existing
vulnerability.

Execute DPV-00 through DPV-06 sequentially. Shared hotspots include descriptor
resolution, service execution, target-policy snapshots, output finalization, and
consumer fixtures. No delegation is requested or claimed by this document. If
execution is later delegated, use a final reviewer other than the main implementer
and record actual review independence without session identifiers.

Update status before work, preserve unrelated changes, and record exact commands,
results, changed paths, and blockers. A blocked verification does not satisfy a
dependency. Follow-ups get stable new IDs and explicit ownership/criteria.

All commands below run from repository root unless stated. Prerequisites: Node >=22,
the repository pnpm version, installed dependencies (`pnpm install` when
needed), and usable mongodb-memory-server binaries. Packed consumers need registry
access or a usable dependency cache. Follow `docs/tasks/README.md` for temporary
fixtures: prepare an ignored repository-local directory, confirm its parent and
ignore rule, and replace the quoted `<repo-root>` placeholder before executing.

Task-body paths beginning `src/` or `test/` are relative to
`packages/access-router`; fully qualified repository paths are used elsewhere.
The focused Vitest commands pass test paths relative to that filtered package.

Builds and tests must be serialized: root `pnpm test` uses
`--workspace-concurrency=1`, and the server Vitest config sets
`fileParallelism: false`. Package test/typecheck scripts rebuild transitive shared
`dist` outputs. Do not overlap them with other package builds or edit generated
output manually.

### Shared checks (proposed, not executed during planning)

- **V1 — Baseline and focused runtime checks.** Build before tests importing `dist`:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router... build
  TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-populate-include.integration.test.ts test/service-authorization-related.integration.test.ts
  ```

  Later tasks run their actual new/affected tests with the same `exec vitest run`
  form, after a fresh build when source changed. Planned new filenames below do
  not exist yet; record concrete commands when created. Add meaningful behavior
  regressions with each implementation, including a before-feature failure where
  feasible; do not retain a test that requires the enhancement to stay absent.

- **V2 — Types and patch checks.** Run
  `pnpm --filter @web-ts-toolkit/access-router typecheck`, focused ESLint on changed
  TypeScript files, and `git diff --check`. For new untracked files use
  `git diff --no-index --check -- /dev/null <new-file>` with the real repo-relative
  filename. Documentation-only work uses content/link review and
  `pnpm exec prettier --check <changed-markdown-file>` instead of runtime tests.
- **V3 — Package behavior.** Run
  `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router test`
  after cross-path integration. Tests must cover both configured hydration modes;
  preserve documented hydration value differences rather than asserting universal
  byte-for-byte parity.
- **V4 — Installed surface and documentation.** After a fresh build:

  ```sh
  TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts
  pnpm --filter website build
  ```

  Also run `npm pack --dry-run` from `packages/access-router` for inventory. The
  transformed-manifest packed-consumer suite, not the dry run alone, verifies the
  installed API. No publishing or release-artifact configuration change is needed.

- **V5 — Final integrated gates.** Run `pnpm build`,
  `TMPDIR='<repo-root>/_tmp-dpv' pnpm test`, and `pnpm lint` serially; run the server
  typecheck if final changes invalidated its last passing evidence. Audit the full
  acceptance matrix and final diff. Reuse fresh equivalent passing V3/V4 evidence
  rather than repeatedly rebuilding unchanged output. Record environmental and
  unrelated failures accurately; do not claim a baseline failure without evidence.

## Tasks

### Task DPV-00: Freeze private population policy and execution contracts

Status: pending

Kind: investigation

Priority: P1 — authority, getter representation, and original-ID retention determine the implementation boundary.

Dependencies: none.

Primary ownership: this decision record; focused characterization fixtures only
where source inspection cannot settle a material question.

Finding: the desired field-input behavior is agreed, but ordinary populate gates,
finalized getter views, and query-time reference replacement do not define a
private dependency execution contract.

References:

- `packages/access-router/src/services/service.ts` (`genExecutionPopulate`, `createPrepared`, `new`).
- `packages/access-router/src/interfaces/service-authorization.ts` (`RelatedAuthorization`, `RowAuthorization`).
- `packages/access-router/src/model.ts` (`find`, `findOne`).
- `packages/access-router/src/interfaces/router-hooks.ts` (`ModelVirtualDoc`, descriptor/access records).

Requirements:

1. Resolve D1-D4 in this document with concrete examples and a supported-path table.
2. Characterize original-ID capture for a missing scalar target and a reference
   array with duplicates/misses in lean and hydrated results. Identify the smallest
   shared seam that retains refs without an extra per-parent lookup.
3. Specify public/private query compatibility, operation/row denial, ordinary
   populate defaults, permission-hook inputs, and safe cache ownership.
4. Establish V1 baseline results; record any blocker without claiming implementation.

Acceptance criteria:

- D1-D4 have explicit recorded outcomes; no unresolved behavioral blocker is left
  to a later implementation owner.
- The selected approach satisfies A1-A4, including denied input fields, authorized
  populated output, and exact ID restoration. Unsupported shapes have a validation
  or documented applicability rule.
- Evidence identifies the relevant service, planner, and finalizer handoffs and
  meaningful regression fixtures; no broad authorization redesign is required.

Verification: V1 plus decision/evidence review and any bounded characterization
probe documented with actual results. Maintainer-dependent questions block completion.

### Task DPV-01: Add validated descriptor types and coherent dependency snapshots

Status: pending

Kind: improvement

Priority: P1 — malformed or incoherent server configuration cannot reach dependency loading.

Dependencies: DPV-00.

Primary ownership:

- `packages/access-router/src/interfaces/router-hooks.ts`, `src/runtime.ts`.
- `packages/access-router/src/acl/virtual-projection.ts` descriptor resolution;
  `src/acl/model-output-planning.ts` and related snapshot capture as needed.
- `test/virtuals-populate-dependencies.config.test.ts` (planned, server package)
  and the relevant existing type/configuration fixtures.

Finding: descriptor validation and resolution currently understand only `get` and
`dependsOn`; getter types describe stored refs rather than a typed private target.

References: `src/runtime.ts` (`validateVirtualLeafValue`, `validateVirtualsScope`),
`src/acl/virtual-projection.ts` (`toSnapshotDescriptor`, `resolveSnapshotDescriptor`),
and `src/interfaces/router-hooks.ts`.

Requirements:

1. Implement the frozen D2/D3 shape, shared/per-access inheritance and leaf override
   rules, scope-relative references, and typed getter contract. Existing descriptors
   and ordinary `dependsOn` semantics remain valid.
2. Validate supported refs/selects against the owning runtime's actual schema and
   target registry at the D2-defined point. Reject malformed/unsupported/internal
   paths and unsafe recursive shapes without partial option updates.
3. Capture target configurations and dependency options with the operation snapshot;
   do not resolve replacement descriptors from live options during finalization.
4. Keep the property server-only and out of wire/client option types. Public query
   controls cannot activate it; legitimate business fields with the same spelling
   retain ordinary data semantics.

Acceptance criteria:

- Positive/negative configuration and strict type cases cover the approved shapes,
  constructors, bulk/dotted setters, inherited/overridden records, and atomic failure.
- Unknown stored fields still produce type/configuration errors; persisted models,
  input writes, and public output types are not widened to private populated data.
- In-flight mutation of dependency arrays/configuration cannot change the captured
  descriptor; a later call observes the new valid configuration.

Verification: V1 focused configuration tests, existing
`test/virtuals-config.contract.test.ts`, relevant strict consumer cases, and V2.

### Task DPV-02: Plan and batch private population with original-reference retention

Status: pending

Kind: improvement

Priority: P1 — fetch union, target scope, and provenance determine both correctness and query cost.

Dependencies: DPV-01.

Primary ownership:

- `packages/access-router/src/acl/output-projection.ts`, `virtual-projection.ts`,
  `populate-target.ts`, `related-execution.ts` (all under `src/acl`).
- `packages/access-router/src/services/service.ts`, `src/model.ts`, and a narrowly
  scoped package-private dependency executor/transport if needed.
- `test/virtuals-populate-dependencies.planner.test.ts` and
  `test/virtuals-populate-dependencies.integration.test.ts` (planned, server package).

Finding: ordinary populate admission cannot supply denied private inputs, and
query-time population replaces refs before the service can retain their originals.

References: `src/services/service.ts` (`genExecutionPopulate`),
`src/acl/output-projection.ts` (`planCatalogProjection`),
`src/acl/related-execution.ts` (`captureRelatedTargets`),
`src/acl/populate-target.ts` (`PopulateTargetMeta`), and `src/model.ts` (`find/findOne`).

Requirements:

1. Derive internal population and source fetch requirements from active virtual
   candidates; keep public selection/population intent independent and immutable.
2. Resolve and union compatible ordinary/private target fetch projections,
   deduplicate shared requirements, and retain identity/hook inputs privately.
   Preserve document-dependent authorization and skip known-denied candidates.
3. Implement D1 target policy and independent D4 query scopes. Field-input authority
   must work without a public source/target field grant; private loading must not
   manufacture an ordinary output grant or reuse an incompatible public target handle.
4. Capture exact original reference values before expansion and batch target work
   across parent rows. Keep copies, cache keys, runtime/model/access ownership, and
   public/private row scopes distinct; preserve the existing scheduling bounds.

Acceptance criteria:

- Planner/executor tests observe fetch union with the original output plan unchanged
  for inclusion, exclusion, omitted/empty, object, dotted, and identity cases allowed
  by D2; overlapping Mongo paths do not cause projection collisions.
- Zero dependency-only queries for excluded/inapplicable/known-denied virtuals;
  post-fetch grants can still admit deferred virtuals.
- Original scalar/array IDs survive target misses and independently filtered public
  population. Different `match`/access/row policies cannot be merged by path alone.
- Driver/executor observations demonstrate batched loading for multiple rows sharing
  a dependency, rather than a lookup per getter invocation.

Verification: V1 new planner/executor tests plus existing
`test/service-authorization-projection.unit.test.ts`,
`test/service-authorization-related.integration.test.ts`, and V2.

### Task DPV-03: Compute from private views and restore authorized direct output

Status: pending

Kind: improvement

Priority: P1 — private inputs must reach the getter without changing public data or persistence.

Dependencies: DPV-02.

Primary ownership:

- `packages/access-router/src/output/finalize-model-output.ts`.
- `packages/access-router/src/acl/output-field-filter.ts` and private output/context
  handoffs only where required by the recorded representation.
- `packages/access-router/src/services/service.ts`, `src/services/public-service.ts`.
- The planned dependency integration suite and existing finalizer/direct-operation tests.

Finding: current target finalization strips private fields before parent getters;
blindly retaining them in the target DTO would change both output and authorization
provenance. Missing-reference restoration cannot rely on populated `_id` extraction.

References: `src/services/service.ts` (`finalizeSinglePopulateTarget`, `finalizeDirectOutput`),
`src/output/finalize-model-output.ts` (`finalizeSingleDoc`),
`src/acl/output-field-filter.ts` (`copyAuthorizedReference`), and A2-A4.

Requirements:

1. Supply isolated D3 getter views containing declared private populated inputs,
   preserving ordinary finalized-related behavior for non-opted-in getters.
2. Commit only returned virtual values. Apply the original public target projection
   when population was requested; otherwise restore retained IDs and then enforce
   parent field selection/authorization. Preserve ordinary population-denial shapes.
3. Complete cleanup on success, undefined, getter throw, post-fetch denial, and
   dependency miss/failure according to D3. Restore output before presentation hooks.
4. Integrate direct reads and mutation/template outputs using their existing
   effective accesses. Private population must not alter write input, saved refs,
   lifecycle snapshots, successful hidden writes, or retry/error semantics.

Acceptance criteria:

- The central example computes from denied `balance`/`creditLimit`, returns only
  requested/authorized `account.name` for public population, restores IDs without
  public population, and omits the reference when unselected/denied.
- An authorized but unrequested private field is still stripped; explicit exclusions
  and `-_id` remain effective. Original ref arrays retain order, duplicates and misses.
- Getter input mutations, parallel completion, and thrown/undefined results cannot
  leak private data to another getter's undeclared view, returned DTOs, metadata,
  document handles, persistence, or ordinary decorate/task inputs.
- Lean/hydrated direct paths, read-to-list fallback, create/update/upsert branches,
  and the recorded `new` behavior meet the same output-shape contract.

Verification: V1 dependency integration tests, `test/virtuals-finalizer.unit.test.ts`,
`test/virtuals-direct-operations.integration.test.ts`,
`test/read-list-fallback-authorization.integration.test.ts`,
`test/service-authorization-mutations.integration.test.ts`, and V2.

### Task DPV-04: Cover related, embedded, and alternate routes with bounded work

Status: pending

Kind: improvement

Priority: P1 — the configuration must behave consistently wherever its model virtuals execute.

Dependencies: DPV-03.

Primary ownership:

- Shared server service/finalizer seams; `src/acl/subdocument-output.ts`,
  `src/services/model-subdocument-service.ts`, and `src/output/include-output.ts`
  only as required for scoped execution/provenance.
- `test/virtuals-populate-dependencies.parity.test.ts` (planned, server package),
  existing related/embedded/root suites, and `test/virtuals-performance.probe.test.ts`.

Finding: related/embedded/dedicated-subdocument execution has separate scope and
owning-document handoffs; direct-read support alone would leave accepted model
configuration partially effective. Existing batching measurements concern public,
authorized populated inputs rather than private dependency union/restoration.

References: `src/acl/subdocument-output.ts` (`prepareSubdocumentOutput`,
`prepareSubdocumentPopulate`, `finalizeSubdocumentRows`),
`src/services/service.ts` (`finalizePopulateForSingleDoc`), and existing
`test/virtuals-embedded-subdocuments.integration.test.ts` /
`test/virtuals-performance.probe.test.ts`.

Requirements:

1. Verify direct/root/trusted-service parity and dependencies on virtuals belonging
   to populated targets, legacy/correlated include targets, embedded scopes, and
   dedicated list/read/create/update/bulkUpdate subdocument outputs.
2. Preserve source values under include-path collisions, join/correlation inputs,
   parent-owned embedded grants, related target-owned grants, and scoped mutation
   visibility. Hidden output rows do not execute getters.
3. Exercise shared-target copies, multiple virtuals and reference arrays, differing
   public/private scopes, runtime isolation, live configuration changes, null/missing
   refs, metadata flags, and both hydration modes.
4. Measure actual target query counts and peak work for one row versus a multi-row
   list with repeated references/multiple getters. Prove finite dependency traversal
   and completion at concurrency one; avoid timing-only performance assertions.
5. Verify count/distinct/exists/delete identity paths do not start dependency work,
   and public controls cannot activate server-only dependency loading.

Acceptance criteria:

- A path-by-path matrix records executable coverage and results for the supported
  scope; no silently ignored supported declaration remains.
- Query growth follows compatible target groups/batches rather than parent-row or
  getter count. Getter/persistence peaks respect configured request/runtime limits.
- Existing include provenance, target authorization, subdocument visibility and
  hydration contracts pass with the feature enabled and disabled.

Verification: V1 new parity/performance cases and the relevant existing
`test/virtuals-populate-include.integration.test.ts`,
`test/virtuals-embedded-subdocuments.integration.test.ts`,
`test/virtuals-route-parity.integration.test.ts`,
`test/include-source-provenance.integration.test.ts`,
`test/service-authorization-subdocuments.integration.test.ts`, and
`test/hydration-characterization.integration.test.ts`; then V2 and V3 serially.

### Task DPV-05: Publish accurate types, examples, and compatibility guidance

Status: pending

Kind: improvement

Priority: P2 — consumers need to distinguish private input declarations from public population.

Dependencies: DPV-04.

Primary ownership:

- Public server declaration/JSDoc surfaces and existing root/advanced exports as needed.
- `packages/access-router/README.md`, `packages/access-router/llms.txt`.
- `website/docs/packages/access-router/configuration.mdx` and `hooks.mdx`.
- Existing strict-consumer, export, documentation-example and packed-consumer fixtures.

Finding: current docs promise only finalized related getter inputs and expose no
typed populated dependency. Adding the runtime option alone leaves the deliberate
exception, output restoration, and remaining row/operation rules undiscoverable.

References: `packages/access-router/README.md` (Virtuals / computed fields),
`src/interfaces/router-hooks.ts`, and the four V4 consumer suites.

Requirements:

1. Document the frozen API, typing, selection union, private field authority,
   target policy, defaults, inheritance, missing/error behavior, and supported scope.
2. Include executable examples for ordinary populated output, internal-only
   population restored to ID(s), and a selected virtual with a hidden reference.
   Explain the difference from ordinary `populate` and local `dependsOn`.
3. Update finalized-related-only wording with the explicit declaration-scoped
   exception. Document cleanup before decoration, bounded batching measurements,
   and compatibility/release notes without promising universal hydration equality.
4. Verify actual installed ESM/CJS and strict NodeNext/Bundler declarations, including
   negative input/query/private-output typing and unchanged legacy descriptors.
   Keep the feature absent from client-facing authority/query options and OpenAPI
   request controls; no new entrypoint is needed.

Acceptance criteria:

- An installed consumer can configure a typed private dependency and understand all
  three response shapes from shipped docs without repository source access.
- Examples compile; declarations, runtime validation and documentation agree.
  Packed consumers exercise the new behavior using the real publication transform.
- Existing getter configurations remain source/runtime compatible; any unavoidable
  approved contract change is called out explicitly with migration guidance.

Verification: V2 and V4. Review tarball inventory and generated declarations;
generated files are produced only by normal builds.

### Task DPV-06: Verify the complete contract and release readiness

Status: pending

Kind: investigation

Priority: P1 — integrated evidence must prove private inputs never broaden public response semantics.

Dependencies: DPV-00, DPV-01, DPV-02, DPV-03, DPV-04, DPV-05.

Primary ownership: this task record, integrated acceptance review, and narrowly
scoped corrections or separately tracked follow-ups discovered during review.

Finding: the feature spans configuration, query execution, authorization provenance,
getter inputs, and response shaping; individual passing components do not prove
the central invariant across all public/model-output paths.

References: A1-A4, recorded D1-D4 decisions, all task acceptance criteria, and the
existing virtual/authorization/hydration regression suites.

Requirements:

1. Review the full change against the final path matrix and each acceptance criterion,
   including negative selection/permission cases, IDs, batching, errors and writes.
2. Confirm private authority never becomes public `authorization.related`, request
   permissions, document handles, wire controls, or accidentally serialized context.
3. Run V5 serially and confirm fresh V2/V4 evidence covers final changes. Reopen or
   add stable-ID tasks for necessary fixes; keep unresolved prerequisites visible.
4. Record reviewer identity by role/task-local alias and whether review was independent.
   Do not claim independent review when the implementer performed it.

Acceptance criteria:

- All required acceptance criteria have implementation/test or approved investigation
  evidence; required checks pass on the final worktree.
- Private dependency transport has no automatic public exposure; caller-facing
  fields and reference shapes match the original public plan, with only authorized
  getter return values added as computed output.
- Types/docs/runtime agree, no required task remains blocked, and any deliberately
  deferred capability has explicit validation behavior and rationale.

Verification: V5, current V2/V4 results, final diff/acceptance/dependency audit, and
recorded review findings. Historical task results are not substitute evidence.

## Definition of done and execution record

- DPV-00 through DPV-06 must be completed with actual evidence and all decision blockers resolved.
- A1-A4 hold across the approved operation/reference matrix in both hydration modes.
- Actual query measurements demonstrate batching and configured concurrency bounds.
- Final package, installed-consumer, documentation, and workspace checks pass serially.
- Any discovered follow-up is completed or explicitly deferred with its impact,
  owner, and supported-contract consequence recorded; no silent scope reduction.

Creation evidence:

- Reviewed the task-as-you-go workflow, repository task conventions, package scripts,
  relevant current code/tests, and the related plans linked above.
- Ran `git status --short` (clean) and `git rev-parse --short HEAD` (`fb3b28e`) from
  repository root before creating this file.
- Runtime/build/typecheck/consumer/performance checks: not run; this deliverable is
  the implementation task document. Proposed commands are listed separately above.
- Initial `pnpm exec prettier --check docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md`
  reported Markdown blockquote/list-spacing issues, which were corrected. That
  invocation also synchronized installed workspace dependencies; subsequent
  `git status --short` showed only this new task file, with no tracked manifest or
  lockfile changes. Final formatting uses the installed formatter directly.
- Passed from repository root:
  `node_modules/.bin/prettier --check docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md`
  and
  `git diff --no-index --check -- /dev/null docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md`.
- Reviewed seven unique task IDs, all required task fields, acyclic dependencies,
  existing relative task links, and the distinction between agreed requirements
  and D1-D4 decisions. A focused content scan found no machine-local paths or full
  session identifiers. New implementation-test paths are explicitly marked planned.
- No feature task has started. Append implementation decisions and completion
  evidence to the corresponding task as execution proceeds.
