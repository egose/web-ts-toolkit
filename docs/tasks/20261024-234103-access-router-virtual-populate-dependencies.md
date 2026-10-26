# Access-router: private populated dependencies for virtuals

Created: 2026-10-24 23:41:03 local (`20261024-234103`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — all DPV-00..11 requirements and corrective findings are closed.
The same independent DPV-06 reviewer accepted the corrections and completed final
DPV-09 build/test/lint/type/installed-surface verification. Historical failures and
the final exact evidence are retained below.

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

## Frozen decisions (DPV-00)

The following are chosen engineering decisions under the DPV-00 investigation
authorization, grounded in the current seams and the characterization below. They
are not claims of separate user approval. A1-A4 remain the controlling requirements.

### D1 — Private field authority, independent target operation and rows

- A selected/applicable source virtual's declaration grants **input fields only**:
  retain its source ref automatically and fetch its declared persisted target
  selection despite source/target output-field denial. No `outputFields` grant,
  request permission, target document handle, or public related policy is created.
  Keep global-only definite denial versus document-dependent deferral as today.
- Private targets always use base **`read`**, for scalar and array refs and for every
  source operation. Resolve captured `operationAccess.read`, `baseFilter.read`, and
  `overrideFilter.read` using existing exact → default → bare option resolution and
  the original actor/permissions. There is no private `access` option, automatic
  read-to-list fallback, route-variant gate, or new operation/row bypass.
  A list-only target is insufficient; `operationAccess.default: true` can admit
  read through the existing fallback. Source read-to-list fallback still chooses
  the source's list virtual/output/doc-permission accesses.
- Private row authorization is always request mode. Prepare ordinary input `{}`;
  run the captured read transform and base scope with existing hook/cache rules;
  AND them with the retained source IDs as a mandatory `_id: { $in: ... }`
  constraint **after** transformation. False operation admission or terminal false
  base/transform scope performs no target query and makes the dependency unavailable
  (D3). Base-filter null/undefined retains its existing empty-scope meaning.
  No parent row grant, caller filter, populate match, or include join replaces this
  scope. Mandatory source relationship IDs and target tenant constraints survive.
- `authorization.related` remains exclusively the policy for an **ordinary requested
  populate/include**, including defaults. Its operation grants, row replacements,
  output grants, and nested policy do not apply to private dependency loading.
  An entry naming a dependency-only path is still unused/invalid, rather than a new
  capability. An ordinary restrictive match/scope cannot hide a permitted private
  input; an ordinary grant cannot admit a private target whose request read gate
  fails. Different scopes execute separately. This deliberately preserves the
  existing exact-requested-path contract of `RelatedAuthorization`.
- Permission hooks keep their existing projected-input contract. Public source and
  target authorization snapshots receive the original public fetch requirements,
  existing local dependencies, and `alwaysSelectFields`, not new dependency-only
  target fields or automatically retained private-only source refs. Split a shared
  raw fetch into those views **before** issuing public authorization handles or
  invoking their hooks. Private target reads need no target `docPermissions`/field
  grant computation: those are output decisions, not row gates. Source virtual
  authorization still uses its ordinary source grants. No duplicate permission-hook
  invocation is introduced solely to obtain private fields.

**Example:** Order's selected `canPlaceOrder` can read Account's denied `balance`
inside the actor's `baseFilter.read` tenant. A caller's `populate.account` selecting
`name`, matching another name, or using `access: 'list'` does not alter that input.
If Account's read operation is denied, the virtual is omitted even if a public
related operation grant permits the caller's separate populated `name` output.

### D2 — Descriptor, selection, inheritance, and registration

Public server-only shape (type names to export from the existing root/advanced
surfaces; no new entrypoint):

```ts
import type { AccessRouterFieldKey, Projection } from '@web-ts-toolkit/access-router/advanced';

export interface ModelVirtualPopulateDependency<TModel = unknown> {
  path: AccessRouterFieldKey<TModel>;
  select?: Projection;
}
```

- A leaf descriptor or per-access record accepts the optional property
  `dependsOnPopulate?: ModelVirtualPopulateDependency<TModel>[]`.
- Only `path` and `select` are descriptor keys. No shorthand strings, `model`,
  `match`, `access`, `populate`, or arbitrary Mongoose options. The schema supplies
  the target. An absent property means no private dependencies. An empty list is
  valid and disables them. Reject null, malformed arrays/descriptors, and duplicate
  paths within one resolved declaration; different virtuals may share a path.
- Shared per-access declarations follow existing `dependsOn`: exact access leaf,
  then `default`; bare leaf functions inherit the shared list; a leaf's defined
  list replaces the shared list wholesale (`[]` clears it). Undefined inherits;
  null rejects. `dependsOn` and `dependsOnPopulate` inherit/override independently.
  Clone descriptors, selection objects/arrays and normalized paths into the same
  operation snapshot as the getter; both live and snapshot resolvers must agree.
- Initial source shape: a **static string `ref` to a registered ObjectId-identity
  model**, stored in an ObjectId scalar or one-dimensional ObjectId ref array.
  `path` is a top-level field relative to the virtual scope, like `dependsOn`.
  Embedded single/nested objects and document arrays are supported by defining the
  virtual in their `.sub` scope (`contacts.sub.canOrder` declares `account`, not
  `contacts.account`). Root declarations cannot traverse into an embedded child or
  through a ref. Dotted source paths, Map/Mixed/dynamic ref containers, `refPath`,
  function/model-valued refs, virtual populate, refs in discriminator-varying
  source scopes or to base/concrete discriminator target models,
  cross-connection targets, non-ObjectId IDs and multi-dimensional ref arrays reject
  explicitly. Existing ordinary populate support for these shapes is unaffected.
- Target selections cover schema-known persisted scalars, arrays, and embedded
  fields; dotted paths through statically described embedded objects/arrays work.
  Target stored refs may be selected as **IDs only**, never traversed. Explicit
  target virtuals (package or Mongoose), aliases rather than actual stored paths,
  dynamic Map/Mixed paths, internal/prototype/control paths, version keys and the
  target's permission-metadata subtree reject. Target `_id` is the identity exception.
  A selected static container expands to its eligible persisted descendants;
  unknown/virtual/metadata/dynamic contents are not copied wholesale.
- Use the ordinary `Populate.select` normalization: comma/space-delimited string,
  string array, or projection object with **`1`/`-1`**, not Mongo's `1`/`0`.
  Omitted/undefined and effectively empty (`''`, `[]`, `{}`) mean **all eligible
  static persisted target fields**, regardless of their output permissions;
  they never select target virtuals. Exclusion-only means that same universe minus
  excluded paths. Any positive token selects its paths/descendants, with explicit
  negative paths winning. Include/exclude combinations are resolved in memory,
  never concatenated into Mongo projection syntax. Reject non-string array entries,
  invalid object values (including `0`/booleans), unsafe/unknown paths and `+` tokens.
  Validate excluded paths too. Ordinary public grammar is not tightened by this rule.
- `_id` is present in a private target view by default unless `-_id` was declared;
  identity remains privately fetched for association even then. Target
  `requireExplicitSelect` and target service query defaults do not replace this
  server declaration. Public omitted/empty/default selections retain their current
  independent behavior. Normalize both plans before positive persisted fetch union;
  compact ancestor/descendant fetch collisions and project each view separately.
- Validation is **eager and atomic** on constructors, bulk setters and dotted
  setters. Source and target actual schemas, registered target model instance and
  target model options must exist in the same owning runtime when a declaration
  is assigned, even if `requireRegisteredPopulateModels` is false. Configure targets
  first, or create/register both models' options before setting their virtuals.
  Self-refs use the proposed source configuration. This is a deliberate opt-in
  registration-order requirement, avoiding a partially executable forward reference.
  Validate all per-access leaves, including overridden shared declarations.
  At synchronous operation capture, recheck target/schema/metadata binding against
  the captured configuration before hooks or persistence; invalid capture fails
  admission, never after a write. Target-side option replacement is observed on the
  next call and cannot change an already captured plan. No live registry lookup in
  finalization or recursive dependency-graph validation is required.

**Selection examples:** `{ path: 'account', select: { balance: 1, _id: -1 } }`
supplies only `balance` to that private target view; `select: '-creditLimit'`
supplies the eligible persisted catalog except that branch; `select: []` supplies
the eligible catalog. Public `select: 'name -_id'` still returns only `name`.

### D3 — Isolated typed input and absence/error semantics

Choose a separate **fourth getter argument**, `populated`, rather than retyping
persisted ref IDs or inserting private objects into the first argument/context:

```ts
import type { ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';
import type { Types } from 'mongoose';

interface Order {
  total: number;
  account: Types.ObjectId | null;
}
interface AccountInputs {
  balance: number;
  creditLimit: number;
}

const canPlaceOrder: ModelVirtualDescriptor<Order, boolean, { account: AccountInputs }> = {
  dependsOn: ['total'],
  dependsOnPopulate: [{ path: 'account', select: ['balance', 'creditLimit'] }],
  get(doc, _permissions, _context, populated = {}) {
    const account = populated.account;
    if (doc.total === undefined || account?.balance === undefined || account.creditLimit === undefined) {
      return undefined;
    }
    return doc.total <= account.balance + account.creditLimit;
  },
};
```

- Add optional third generic `TPopulated` (default empty object shape) to
  `ModelVirtualGetter`, `ModelVirtualDescriptor`, `ModelVirtualAccessRecord`, and
  `ModelVirtualLeaf`, plus exported `ModelVirtualPopulateInputs<TModel, TPopulated>`.
  The map explicitly names source keys and related persisted input model shapes;
  IDs cannot infer the target model. For known sources, reject unknown source keys
  and derive scalar/array cardinality from the source field. Each map property is
  optional; scalar values are a deeply readonly/partial target or null; arrays are
  readonly arrays of such targets/null slots, or null. Preserve native scalar types.
  With unknown source cardinality a typed value must allow both scalar and array.
  No target shape is guessed for an unannotated fourth argument (empty default type).
  Use a separately typed descriptor for inference, then assign it to ordinary
  `virtuals`; no router-wide generic or persisted/public/write-model widening.
  The type annotation describes possible values, not authority: runtime declarations
  and captured schemas determine which fields actually exist.
- The runtime always supplies the fourth argument; its callback type is optional
  to preserve existing three-argument direct invocations as well as callback
  assignments. Typed getters default it to `{}` (as above) or guard undefined.
  Existing three-argument getters remain assignable; their first argument and
  `ModelVirtualDoc<TModel>` stay unchanged. The first argument is the pre-expansion
  persisted/local-dependency plus finalized-public-related view, even for opted-in
  getters. A new auto-fetched ref is not added to another getter's view; an existing
  local `dependsOn` on that ref keeps its old behavior. Never put the fourth argument
  into `ModelVirtualContext`, lifecycle snapshots, DTOs, metadata or handles.
- `populated` contains **only that resolved getter's declared paths and selection**,
  independent of ordinary public match/select/access. No declaration means an empty
  private map. A separate deep-isolated copy per getter, row and array slot prevents
  mutations from crossing views, shared target caches, output or persistence. Do not
  share mutable Date/Buffer/BSON leaves. Only the explicitly returned value is staged.
- Source absent/undefined: omit that virtual without invoking its getter, as for an
  absent local dependency. Present source null: pass null and allow the getter.
  Empty source array: pass `[]` and allow it, without a target query. Non-null IDs
  with no matching row (deleted or outside the permitted row scope): scalar null;
  arrays preserve **source order, duplicates and null/missing slots** in the private
  map. Each matched target is projected to the declaration; absent/undefined target
  fields stay absent/undefined, present null/false/zero/empty-string stay present.
  Missing target fields do not automatically suppress a getter: its partial input
  type requires it to choose an appropriate result. This does not alter local
  `dependsOn`'s existing missing-versus-null rules.
- Denied read operation or terminal false row/transform scope marks the dependency
  unavailable and omits affected virtuals without invoking them (even if a source
  value is null/empty). Query/hook/cast failure in a **dependency-only** group also
  omits its dependent virtuals; no retry, rollback, raw-data fallback, or new
  retryable mutation error. Log structural metadata/fixed category only. If a shared
  fetch also serves ordinary public population, an actual shared-query failure
  follows that ordinary population error path; do not hide or retry a public error.
  Invalid server configuration is the preflight error from D2, not a swallowed miss.
- Getter undefined/throw, post-fetch virtual denial and unavailable inputs all use
  the same unconditional response reconstruction/cleanup. They cannot leave a
  fetched ref object or extra field in output. A successful write remains successful
  when only its private computation is unavailable; existing visibility/error
  behavior of the ordinary mutation path is preserved.

### D4 — Capture, execution, grouping, and finite lifecycle

1. **Freeze intent first.** Resolve and own effective service/public args, including
   server `defaults.*Args.populate/select`, effective populate access and mutation
   implicit returning/decorator/task selections, before internal expansion or any
   await. Capture source getters/policies and all needed target configurations
   synchronously. A public `populate: []` suppresses defaults under existing rules;
   omitted population with a configured default is still ordinary population.
2. **Capture before replacement.** For affected reads, execute the existing adapter
   find/findOne without the participating query-time population, retain source refs,
   then perform batch target work. The common seam is between the adapter's raw
   result and service snapshot/include/target-finalization work; reuse the same
   package-private capture/loading helper for post-save documents and templates.
   Keep the adapter's existing query-builder API usable; do not convert every
   `Model.find/findOne` into a different public result type. No second parent lookup.
   Capture each scope occurrence's own-property presence and deep-copied scalar or
   complete array before normalization/population can replace IDs. Read hydrated
   storage slots with document-aware access; do not reconstruct from target `_id`,
   `populated()` metadata, or `toObject({ depopulate: true })` after the fact.
   “Original” is the pre-populate value under the captured hydration mode (including
   its materialized defaults), not a promise that hydration reproduces absent raw
   BSON fields identically to lean.
3. **Separate four representations.** Own (a) original refs/presence, (b) raw batched
   target fetches, (c) original public projected/hook/related views, and (d) per-getter
   private projected maps. Use package-private execution records/WeakMaps, not
   enumerable/symbol data on returned DTOs or authorization handles. Before existing
   source snapshots, include correlation/joins and permission stages, reconstruct
   their ordinary view; dependency-only population never changes those inputs.
   Ordinary target DTOs may still finalize before parent getters for legacy input
   compatibility; retain private raw inputs independently. After computation, commit
   virtual results and apply the original public ref decision: original authorized
   public populated projection and match behavior, otherwise exact retained ref(s)
   only if originally selected/permitted, otherwise omit. Denied ordinary populate
   retains its existing skipped/fallback behavior. Public `-_id` remains effective.
4. **Union only compatible fetches.** Minimum grouping key: owning execution family,
   request/actor, runtime, actual model/connection, captured configuration/policy
   identity, effective target access, hydration, and prepared row/mandatory
   predicate semantics. A public request-mode read populate with equivalent row
   constraints can share a fetch with private read; union persisted public needs,
   declared private fields, identity and existing hook/target-virtual/join inputs.
   Distinct projection masks are not a reason for duplicate queries. A public match,
   list/custom access, non-equivalent row policy or target binding requires separate
   groups. Prove filter equality conservatively with BSON-aware structural comparison
   (preserving literal document key order), not path/ID equality or raw JSON strings.
   Union IDs across compatible source paths/rows, retaining each association's own
   original ID sequence. Never use an in-memory public match to define private rows.
5. **Cache raw work, not authority.** Request/runtime-owned pending raw-fetch caches
   include the group, actual ID set and fetched projection coverage; collect a batch
   before dispatch, or issue a new query if later requirements are not covered.
   Reuse neither an old configuration's cache entry nor a failure across calls.
   Finalized-public caches additionally bind the original public plan and document
   stage; private-only targets issue no output handles. Copies for separate public
   plans/rows and private getters remain isolated. Do not key authorization by target
   ID, model name or source path alone.
6. **Bounded, nonrecursive work.** Only active selected public virtual candidates
   produce dependency plans; definite denied/inapplicable/excluded candidates add
   no private query. Deferred candidates may fetch before document denial is known.
   Batch all available parent/embedded rows and getters by the compatible group;
   deduplicate IDs for fetch, not reconstruction. Use the existing request/runtime
   persistence scheduler and hook gate, releasing persistence permits before
   orchestration/getters; concurrency one must complete. Each ordinary output node
   may add one-hop **persisted-only terminal** private reads. Never finalize those
   private targets' virtuals or follow their dependency declarations. Ordinary
   populate/include/embedded traversal retains its existing finite depth/complexity
   and hook-chain bounds (related capture 32, hook-chain admission 64). Cyclic model
   refs/declarations therefore do not create a recursive private query graph.
7. **Writes/templates.** Capture post-save/post-`afterPersist` refs for create/update
   and each upsert branch, after existing change/snapshot hooks and before any
   response population. Batch bulk response work after persistence and lifecycle
   work; attach/populate only detached output copies. Do not change saved refs,
   `currentDocument`, modified paths, input admission, validation, snapshots, changes
   or retry behavior. For paths with a post-write visibility gate, load only visible
   rows; no getter for hidden output. `new` keeps ignoring `args.select`, uses
   create/create/create, and **does load present default refs** for applicable
   authorized virtuals under the target read policy. No insert/save or population
   into the template document; absent/default-null/default-array behavior is D3.
   Ordinary population inherits parent hydration today; private queries use that
   same captured receiving mode for compatibility/union (hydrated template/write,
   fixed lean visibility where already required). No client hydration control and
   no cross-mode byte-for-byte conversion promise.

### Supported output-path matrix

This table is a contract/handoff matrix, not a claim that feature tests already ran.
Every supported row uses the D2 reference/selection shapes and D3 absence rules.

| Output path                                                            | Required behavior / owning seam                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct/root/trusted list, read, readFilter                             | Shared service capture/load/finalize; preserve source access triples, read-to-list fallback and server defaults.                                                                                                       |
| Create, update, upsert-create/update responses                         | Post-lifecycle detached response loading; existing create/read/create or update/read/update; no changed write/visibility result.                                                                                       |
| `new` template                                                         | Materialized default refs load under target read; source create/create/create; original IDs/null/absence restored before create-field trim.                                                                            |
| Ordinary populated target outputs                                      | Target's selected virtuals may have their own terminal private dependencies; capture target refs before finalization. Target output/grants stay target-owned.                                                          |
| Legacy and correlated include targets                                  | Document-bearing read/list targets use the same service seams; preserve association values and detached include-source provenance even on path collisions. Include-count adds no private work.                         |
| Embedded object/nested object/document-array scopes                    | Scope-local ref field and getter; batch occurrences across rows; reuse parent-owned grants and original container visibility. Missing/null containers are not synthesized.                                             |
| Dedicated subdocument list/read                                        | `prepareSubdocumentOutput`/`finalizeSubdocumentRows` consume captured plans and visible children; preserve raw parent hook inputs and read population. Capture before the `findRawParentDoc` populated read branch.    |
| Dedicated subdocument create/update/bulkUpdate                         | The visible post-save child rows get the same dependency loader, even on branches without ordinary populate; hidden children execute no getter. Preserve existing owning-parent grants and fixed visibility hydration. |
| Count, distinct, exists, delete and subdocument-delete identity output | No dependency loading or getters. Helper-only field filtering/planning also performs no dependency I/O.                                                                                                                |

No D1-D4 behavioral decision is deferred to implementation. Unsupported reference
shapes have explicit configuration errors; the supported related/embedded/child
paths above are required, not optional follow-ups.

## Execution and verification

Priority meanings: **P1** is a correctness/policy prerequisite for this feature;
**P2** is release-readiness/documentation evidence after the core behavior. Every
task below is required to ship; these priorities do not imply an urgent existing
vulnerability.

Execute DPV-00 through DPV-06 sequentially. Shared hotspots include descriptor
resolution, service execution, target-policy snapshots, output finalization, and
consumer fixtures. The user subsequently authorized implementation sequentially
by sub-agents. Use a fresh implementation sub-agent for each task, with coordinator
review before the next handoff, and a separate independent final reviewer for
DPV-06. These are execution assignments, not completion evidence; record actual
results without session identifiers. Nested or concurrent delegation is not needed.

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
  ```

  Run `TMPDIR='<repo-root>/_tmp-dpv' pnpm build` with working directory
  `website/`, its separate workspace. DPV-05 records the correction from the
  planning command whose root `--filter website` matched no project.

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

Status: completed

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

#### DPV-00 execution evidence and handoff

Investigation owner/reviewer: DPV-00 agent (self-review, not an independent final
review). Scope: contract investigation and one Mongoose characterization suite;
feature implementation remains with DPV-01 onward. Blockers: none.

**Worktree/instructions:** read the complete task, root `AGENTS.md` and
`docs/tasks/README.md`; no additional applicable `AGENTS.md` was found. Initial
`git status --short` showed only this task modified by the coordinator (overall
status/delegation authorization). Preserved those edits, set DPV-00 `in_progress`
before investigation, and preserved the pending later task sections. Observed
HEAD `065a1f1`. Environment: Node `v26.12.1`, pnpm `11.18.0`, installed Mongoose
`9.9.2`, Vitest `4.1.11`. No dependency installation/update was needed.

**Bounded characterization:**

- Added `packages/access-router/test/virtuals-original-refs.characterization.test.ts`,
  using existing `test/setup.ts` / `useMongoTestDatabase` and document-copy helpers.
  Four cases cover query-time loss and two-phase capture for lean and hydrated rows.
  With original scalar `missingId` and array `[a, missingId, null, a, b]`, ordinary
  populate yields scalar null and array `[aDoc, aDoc, bDoc]`. Hydrated
  `populated(path)` still holds originals, but lean output has no such bookkeeping.
  Extracting target `_id` therefore cannot restore the original response universally.
- Capturing unpopulated rows and populating detached copies with public
  `match: { name: 'a' }` yields `[aDoc, aDoc]`, while saved originals restore all
  IDs/null slots/order/duplicates, scalar and array null, empty arrays and absent
  properties. The original hydrated/plain source rows remain unchanged. Collection
  spies observed **one parent find and two target finds (one per populated path)**
  across five parents. This proves a viable no-extra-parent-lookup seam, not the
  future feature's merged query count or concurrency/performance acceptance.
- The first fixture run had **1 pass / 3 failures**: reusing model/collection names
  while deleting models in a competing teardown left earlier rows visible. Replaced
  that probe teardown with unique per-case model names and the existing shared
  setup's cleanup. The next run passed all four; after adding an explicit null array
  slot, the final run also passed all four. No product/baseline failure was inferred.

**Type/config design review:** loaded `ai-friendly-ts-package` for the public type
boundary. Reviewed root/advanced exports, strict-consumer fixtures and actual
descriptor/projection types; compiled against the emitted declarations. The ignored
design-only fixture
`_tmp-dpv/private-getter-types.mts` checked proposed optional-fourth-argument
signatures, typed leaf/per-access assignment to the default virtual registry shape,
legacy three-argument assignments and calls, ObjectId scalar/array cardinality,
unknown-source cardinality, partial/readonly target views, the D3 example body, and
negative unknown-source/undeclared-target/persisted-ref-field cases. The fixture
imports existing declarations; it does **not** claim the new API is implemented or
packed-consumer verified. Initial probe failures were incorrect root-only imports
(these support types live in advanced), then a direct Mongoose declaration-file
import; corrected to the actual advanced surface and `import type { Types } from
'mongoose'`. The final strict NodeNext probe passed. Its temporary file was removed
after verification; `_tmp-dpv` remains the ignored test/cache location for later
tasks.

**Actual commands/results, serialized for builds and tests:**

1. Before creating `_tmp-dpv`, ran
   `ls -ld <repo-root> <repo-root>/node_modules <repo-root>/packages/access-router`
   and `git check-ignore -v _tmp-dpv/refs-characterization.mjs`; the root parent
   existed and `.gitignore:8:_tmp*` matched. Then ran
   `mkdir -p <repo-root>/_tmp-dpv`. Before the type fixture, rechecked
   `ls -ld <repo-root>/_tmp-dpv` and
   `git check-ignore -v _tmp-dpv/private-getter-types.mts`; same ignore rule.
   Actual commands substituted the checkout path for `<repo-root>`.
2. `pnpm --filter @web-ts-toolkit/access-router... build` — passed fresh before V1;
   all five selected/transitive packages built JS and declarations successfully.
3. `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-populate-include.integration.test.ts test/service-authorization-related.integration.test.ts`
   — **3 files / 52 tests passed**; `fileParallelism: false` serialized the files.
4. `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-original-refs.characterization.test.ts`
   — initial fixture-only failure and corrected runs detailed above; **final 1 file /
   4 tests passed**, including the explicit null array slot in both modes.
5. `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed, including its
   serial transitive rebuild and `tsc --noEmit -p tsconfig.typecheck.json`.
6. `node_modules/.bin/tsc --strict --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext _tmp-dpv/private-getter-types.mts`
   — final corrected design probe passed, including all expected negative cases.
7. `node_modules/.bin/eslint packages/access-router/test/virtuals-original-refs.characterization.test.ts`
   — passed. `node_modules/.bin/prettier --check docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md packages/access-router/test/virtuals-original-refs.characterization.test.ts`
   initially flagged the new Markdown table; corrected it with `apply_patch` and
   the check passed. The characterization file was already formatted.
8. `git diff --check` and
   `git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-original-refs.characterization.test.ts`
   — passed. Reviewed the task's four related-work links against existing files,
   repo-scoped evidence paths, all seven task statuses and unchanged later criteria.
   Vitest emitted its existing future Vite native-config compatibility notice;
   test runs completed successfully. V3/V4/V5 and new-feature integration/config/
   installed-consumer/performance gates were not run for DPV-00.

**Implementation handoffs backed by source inspection:**

- **DPV-01:** extend `interfaces/router-hooks.ts`, both runtime descriptor resolvers
  and `acl/virtual-projection.ts` consistently. Preserve `ModelVirtualDoc` and
  callback/direct-call compatibility using the optional fourth argument with an
  explicit typed map. Reuse `helpers/query.ts:normalizeSelect`'s `1`/`-1` grammar;
  validate the new declaration before normalization could discard invalid tokens.
  `runtime.ts:setModelOptions/setModelOption` already validate before assignment;
  add actual schema/registered-target checks there and coherent capture at operation
  entry. `captureModelAuthorizationConfiguration` and `captureRelatedTargets`
  currently capture ordinary related targets only: add a distinct terminal private
  target snapshot, never a synthetic `authorization.related` grant. Eager target
  registration and nonrecursive capture avoid a new registry/dependency framework.
- **DPV-02:** retain the original output plan in `planCatalogProjection`; private
  source-ref requirements and target union belong solely to fetch provenance.
  `Model.find/findOne` currently populate before service snapshots; use the raw
  adapter-result → capture → batch-population seam for affected operations.
  `createPrepared`, `updateOnePrepared`, `new`, populated-target finalization and
  `acl/subdocument-output.ts` need the same private helper, with batching before
  row getter workers. Use captured read operation/row hooks for private targets;
  do not reuse `genExecutionPopulate`'s source-field gate, caller match/access,
  related grants, or live `requestCore.isAllowed` lookup as private authority.
  `prepareModelQuery` already ANDs mandatory constraints after transforms.
- **DPV-02/03 boundary:** `PopulateTargetMeta`, `finalizeSinglePopulateTarget`,
  `finalizeDirectOutput`, `finalizeSingleDoc`, and `copyAuthorizedReference` own
  public projection/handles today. Strip private expansion **before** public hook/
  handle creation, pass separate maps only to opted-in getters, and restore from
  retained refs after computation. The existing target-DTO cache is keyed by public
  plan/raw-object identity; it is not a private input or authorization cache.
- **Later coverage handoff:** preserve `getIncludeSource`/association/correlation
  originals; target-private edges terminate without target virtuals; embedded
  scopes reuse owning-parent grants. Dedicated read currently populates inside
  `findRawParentDoc`, while list and post-save visibility paths finalize child rows
  separately. None may silently omit a valid scoped declaration. Existing related,
  embedded, mutation and hydration suites named in DPV-03/04 remain their regression
  gates; the four-case characterization is retained for original-ref behavior.

**Acceptance review:** D1 separates input fields from target operation/rows and
public related policies (A1/A4); D2 resolves selection before fetch union with
independent output eligibility (A2); D3 isolates declared getter inputs and fixes
missing/error behavior (A4); D4 and the characterization identify exact-ref capture
and post-computation public reconstruction (A3), defaults, lifecycle and bounded
scoped execution. The supported-path table includes related, embedded and dedicated
subdocument outputs. No unresolved product decision or behavioral blocker remains.

Changed paths: this task's decision/DPV-00 records and
`packages/access-router/test/virtuals-original-refs.characterization.test.ts` only.
Final `git status --short`/diff inspection confirmed those two paths and preservation
of the coordinator's existing overall status/delegation edits. DPV-00's criteria
and required gates pass; DPV-01 through DPV-06 remain pending.

### Task DPV-01: Add validated descriptor types and coherent dependency snapshots

Status: completed

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

#### DPV-01 implementation scope note

The descriptor/snapshot ownership includes new package-private
`src/acl/virtual-descriptor.ts` (shared live/snapshot resolution) and
`src/acl/virtual-populate-dependencies.ts` (schema validation, normalized selections,
terminal target capture), plus the private `AuthorizationConfiguration` token type
in `src/acl/service-authorization.ts`. A function-identity token survives the
existing configuration copier; its model/schema bindings remain in a module-owned
WeakMap. No ordinary related target or output grant is synthesized. The existing
nested-object schema walk in `runtime.ts` also needs to retain its schema-relative
prefix for multi-level `.sub` validation. These are DPV-01 configuration/snapshot
changes; executor/fetch-planner/finalizer integration remains with later owners.

#### DPV-01 execution evidence and DPV-02 handoff

Implementation owner: DPV-01 agent; acceptance self-review, with coordinator review
still separate. Blockers: none. Read the complete task/D1-D4/DPV-00 handoff, root
`AGENTS.md`, task conventions, and `ai-friendly-ts-package`; no additional applicable
`AGENTS.md` was found. Set DPV-01 `in_progress` before implementation. Preserved
DPV-00's task edits and original-ref characterization file. DPV-02 through DPV-06
remain pending; no target dependency I/O, agent delegation, staging, dependency
updates or manual generated-output edits occurred.

**Implemented:** server-only `ModelVirtualPopulateDependency` and independent
`dependsOnPopulate` inheritance/wholesale overrides, plus optional `TPopulated` and
`ModelVirtualPopulateInputs` on the existing getter/descriptor/access/leaf surface.
Known source keys/cardinality stay precise; target containers are readonly/partial,
native scalars retain their types, and legacy three-argument calls/callbacks remain
valid. Both new types are exported at root and advanced; the strict fixture uses
the actual differing support surfaces (`AccessRouterPermissions` at root;
`AccessRouterFieldKey`/`Projection`/`ModelRequest` in advanced). Inspected emitted
`.d.ts`/`.d.mts` exports and surviving JSDoc after building. Full installed packing
and prose remain DPV-05 work.

Eager validation precedes option-manager creation/commit for constructors and
bulk/dotted replacements. It validates shared and every access declaration, actual
source/embedded schemas, same-runtime target options and exact same-connection
model/ref binding, ObjectId identity/cardinality, static target leaf catalogs,
inclusion/exclusion/empty/identity masks, and excluded paths. Unsupported ref shapes,
ref traversal, dynamic/virtual/alias/internal/version/permission-metadata paths and
duplicates reject. Operation capture rechecks these bindings before hooks/writes.
Tests cover self-refs, cyclic model declarations terminating after one hop, nested
objects/document arrays, target schema/metadata replacement, atomic failures,
isolated declaration/native-policy snapshots and an exact getter without private
inputs overriding a default getter that declares them. Same-spelled business fields
retain their persisted catalog entry; private declarations create no related grant.

**Changed paths:** this task record and, under `packages/access-router/`:

- `src/interfaces/router-hooks.ts`, `src/index.ts`: typed server API/JSDoc/exports.
- `src/runtime.ts`: eager atomic validation, shared resolver, nested-scope schema prefix.
- `src/acl/virtual-descriptor.ts`, `src/acl/virtual-projection.ts`: one cloned
  live/snapshot descriptor resolver and retained planner compatibility exports.
- `src/acl/virtual-populate-dependencies.ts`: static selection normalization,
  registration/schema validation, terminal target capture and lookup.
- `src/acl/model-output-planning.ts`, `src/acl/service-authorization.ts`: owned
  operation configuration and private snapshot token typing.
- `test/virtuals-populate-dependencies.config.test.ts`,
  `test/virtuals-populate-dependencies.types.fixture.ts`,
  `test/strict-consumer-types.test.ts`: configuration/capture and strict declaration regressions.

**Actual checks/results (builds and tests serialized):**

1. Confirmed parents with `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv'` and
   `git check-ignore -v _tmp-dpv/dpv01-probe.mts` (`.gitignore:8:_tmp*`). Reused
   this existing ignored location for Vitest/consumer temporary work; fixtures clean
   their staged consumers. Executed commands substituted the real checkout path.
2. `pnpm --filter @web-ts-toolkit/access-router... build` — passed for baseline and
   implementation JS/declarations. After the fresh baseline build,
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.config.test.ts`
   failed its first positive case with unsupported `dependsOnPopulate`, proving the
   before-feature failure (also observed in the initial pre-build probe).
3. `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed on final source;
   includes a fresh serial transitive build followed by
   `tsc --noEmit -p tsconfig.typecheck.json`. Earlier direct source checking found a
   Mongoose declaration omission for `Schema.aliases`; the local schema-inspection
   type bridge was corrected. No generated files were hand-edited.
4. `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-config.contract.test.ts`
   — final **2 files / 92 tests passed** (84 new configuration/capture cases, 8
   existing). First implementation run was 80/81: corrected a fixture's assertion
   against the authorization error's generic message to its error class. Subsequent
   review added a focused failing exact-bare-getter/default-private-plan regression
   (`-t 'does not inherit a default leaf'`); fixed capture to retain an explicit
   empty plan for the exact getter. The final run includes that correction and
   rejection of schema-bearing ref containers masquerading as embedded scopes.
5. `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts -t 'DPV-01|accepts valid filters/projections/runtime calls'`
   — **4 passed / 22 intentionally unselected**: new Bundler/NodeNext ESM/CJS
   fixtures and existing legacy virtual/filter/projection fixture. Initial new
   fixture imports incorrectly requested `AccessRouterPermissions` from advanced;
   corrected to root, then all cases passed. The later final rebuild changed only
   private source-scope validation; public declarations are equivalent.
6. `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-projection-planner.unit.test.ts`
   — **1 file / 15 tests passed**, checking the shared resolver's legacy planner seam.
7. `node_modules/.bin/eslint packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/index.ts packages/access-router/src/runtime.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/acl/virtual-descriptor.ts packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts packages/access-router/test/virtuals-populate-dependencies.types.fixture.ts packages/access-router/test/strict-consumer-types.test.ts`
   — passed. Rechecked after the final source-scope change with
   `node_modules/.bin/eslint packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts`
   — passed.
   `node_modules/.bin/prettier --check docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/index.ts packages/access-router/src/runtime.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/acl/virtual-descriptor.ts packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts packages/access-router/test/virtuals-populate-dependencies.types.fixture.ts packages/access-router/test/strict-consumer-types.test.ts`
   — passed after `apply_patch` formatting corrections (including a caught/corrected
   fixture brace typo).
   `node_modules/.bin/prettier --check packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts`
   — passed after their final change.
8. `git diff --check` and `git diff --no-index --check -- /dev/null <new-file>` for
   each of the four new DPV-01 files — passed; rechecked the helper/config files
   after the final change. Reviewed status/diff and all task statuses. Vitest's
   existing future Vite native-config notice did not prevent passing runs. No broad
   V3/V4/V5, target-loading integration, packing or performance claim is made here.

**Concrete DPV-02 package-private API:**

- `captureModelAuthorizationConfiguration()` synchronously calls
  `captureVirtualPopulateSnapshot()`. `AuthorizationConfiguration.virtualPopulateSnapshot`
  is a `VirtualPopulateSnapshotToken` (function identity), retained by existing
  configuration copying. A module-owned WeakMap holds `VirtualPopulateSnapshot`;
  no Mongoose/runtime graph is copied into authorization values.
- Call `resolveVirtualPopulateDependencies(configuration, scopePath, virtualName,
virtualAccess)` for the planner's active candidates. Use the canonical captured
  configuration, and definition scopes such as `['children', 'sub']`. Resolution
  has no registry lookup, asynchronous work or target-graph recursion. Exact
  applicable getters without declarations resolve empty, rather than inheriting
  another getter's inputs. `[]` overrides and custom-access default fallback agree
  with the shared descriptor resolver.
- Each `CapturedVirtualPopulateDependency` has `path` (scope-local), `sourcePath`
  (absolute persisted path without `.sub`), `cardinality`, `selection` (sorted
  eligible target leaf mask), `fetchSelection` (positive mask plus association
  `_id`), `includeId`, and `target: VirtualPopulateTarget`. Containers are expanded
  to leaves: project by this mask, never copy a selected container wholesale.
- `target` binds the actual `runtime`, `modelName`, `model`, `schema` identity and
  owned terminal `configuration`. The latter contains a persisted catalog,
  `documentPermissionField`, resolved `operationAccess.read`/`baseFilter.read`/
  `overrideFilter.read`, and hydration metadata. Read-option resolution uses the
  existing exact → default → bare behavior, including exact model-default fallback.
  It contains no target virtual registry/private graph or public field/row grant.
  `getCapturedAuthorizationOption(target.configuration, '<option>.read')` reads it.
- `target.identity` is stable across resolutions/source paths/getters within one
  capture for the same target, and fresh for a new capture. Policy values are copied
  on resolution to detach native leaves while model/schema/identity bindings remain
  exact. This is a grouping input, not a request/actor/row/hydration cache key by
  itself. Preserve D4's other compatibility dimensions and mandatory source-ID scope.
- `src/acl/virtual-descriptor.ts` exports package-private
  `ResolvedVirtualDescriptor`, `getScopeVirtualsObject`, and
  `resolveSnapshotDescriptor`; `virtual-projection.ts` retains the existing helper
  re-exports and `PlanVirtualCandidate.descriptor` now carries the cloned optional
  declaration. Automatic source-ref fetch retention, target I/O/batching, per-getter
  private values/fourth-argument delivery and reconstruction are later-task work.
  Keep those raw/private values in separate execution-owned records, never in this
  configuration token, ordinary related authority, output DTOs or public handles.

DPV-01 criteria and required focused checks pass. The task status is completed;
the feature as a whole awaits DPV-02 onward and coordinator review of this handoff.

### Task DPV-02: Plan and batch private population with original-reference retention

Status: completed

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

#### DPV-02 implementation scope note

The shared seam is `src/acl/virtual-populate-execution.ts`: synchronous storage-slot
capture, one collected/bounded raw-fetch batch, independent source/public-target
hook masks, original-ref lookup and declaration-only private-view lookup. Read/list
service wiring exercises this seam before snapshots/includes/permission hooks. A
captured ordinary static ObjectId-ref shape flag lets compatible public paths join
the batch, including public paths not declared by a private getter. Exotic ordinary
population and configurations without active work retain their adapter path.

Minimal handoff wiring also recognizes a selected ordinary target's own dependency
plan: its auto refs are retained in raw target work and masked before the parent or
target hook view. The next-stage target transport is executable/tested, with no
automatic traversal of terminal private targets. Getter fourth-argument delivery,
unavailable-getter suppression, final cleanup/reconstruction, mutation/template
service orchestration, and broader target/embedded/dedicated-subdocument finalizer
integration remain DPV-03/04's assigned work. No D1-D4 decision or supported-path
requirement is narrowed.

#### DPV-02 execution evidence and DPV-03 handoff

Implementation owner: DPV-02 agent; acceptance self-review, with coordinator review
separate. Blockers: none. Read this complete task/D1-D4/DPV-01 handoff, actual source,
root `AGENTS.md` and task conventions; no additional applicable `AGENTS.md` exists.
Set DPV-02 `in_progress` before implementation and preserved the intentional
uncommitted DPV-00/01 work. No delegation, staging, commits, publishing, dependency
changes or manual generated-output edits occurred. DPV-03/04 still own the
integration identified in the scope note above.

**Implemented/observed behavior:**

- Canonical and legacy candidates resolve the DPV-01 captured dependencies. Their
  source refs enter fetch requirements/internal-only provenance, independently of
  `dependsOn` and original output eligibility. `publicPersistedFetchSelection` retains
  the pre-expansion persisted/local-dependency/identity/hook/join mask, including
  child plans. Definite denial/exclusion/inapplicability creates no private query;
  deferred candidates remain fetchable and can receive later document grants.
- Batch ownership fixes request/permissions, execution family, runtime and receiving
  hydration. Actual model/schema, captured effective terminal read policy and
  BSON-aware ordered predicate equivalence control sharing. Distinct public match,
  access or related-row semantics remain independent. Positive normalized projection
  unions compact ancestors/descendants; original public and per-getter masks remain
  separate. Source IDs are ANDed after transformations. Only raw work is cached in
  the closed batch; repeated execution shares its pending result, and later stages
  create a new collected batch rather than reusing incomplete projection coverage.
- Storage-aware capture precedes `toObject`/population. Tests preserve scalar/array
  IDs, missing IDs, own absence versus undefined, nulls, empty arrays, duplicates,
  original order and out-of-scope rows in lean and hydrated modes. Getter lookup
  produces declaration-only copies, including independent Date/Buffer/BSON leaves
  and repeated array slots. Private read denial/false scope performs no query, even
  for null/empty refs. Private-only hook/query failure returns unavailable with fixed
  structural logging; an actual shared-public query failure propagates.
- Driver observations: **one target find** covers five parent rows, multiple virtuals,
  source paths and embedded occurrences plus compatible ordinary population. A
  different public match/list access/row policy requires **two groups/finds**.
  Private targets run no target document-permission hooks or target virtuals.
  Service list/read tests observe **one parent read and one unioned target find**,
  private-only source refs absent from source snapshots, and private target fields
  absent from source/target permission hooks and output. Duplicate public targets
  preserve ordinary per-public-plan hook-cache behavior through data-free raw-work
  identities; that cache never supplies private input authority. All cases complete
  with request persistence/hook limits of one.

**Changed paths owned by DPV-02:**

- `packages/access-router/src/acl/output-projection.ts`,
  `packages/access-router/src/acl/virtual-projection.ts` — active requirements and
  independent original source/hook masks; retained DPV-01 resolver changes.
- `packages/access-router/src/acl/virtual-populate-execution.ts` — new capture,
  grouping, raw executor, original/public/private view transport and next-stage API.
- `packages/access-router/src/acl/populate-target.ts`,
  `packages/access-router/src/acl/related-execution.ts`,
  `packages/access-router/src/acl/service-authorization.ts` — captured ordinary
  raw-query binding/static-ref shape, preserving DPV-01's opaque snapshot token.
- `packages/access-router/src/acl/filter-resolution.ts` — reuse the request's
  existing version-aware base-filter cache, never its related-row grants.
- `packages/access-router/src/services/service.ts` — read/list raw-result seam,
  captured ordinary operation admission, and ordinary target raw-work cache identity.
- `packages/access-router/test/virtuals-populate-dependencies.planner.test.ts`,
  `packages/access-router/test/virtuals-populate-dependencies.integration.test.ts`
  — **14 planner + 33 executor/service-seam cases**. This task record is also updated.

**Actual checks/results:**

1. Rechecked existing parents with
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/packages/access-router/test'`
   and `git check-ignore -v _tmp-dpv/dpv02-probe.mts` — existing ignored location,
   `.gitignore:8:_tmp*`. Reused it for Vitest temporary work; no probe file creation
   was needed. All executed commands substituted the real checkout path.
2. Source-level before-feature regression:
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.planner.test.ts`
   — **1 failed**, because the selected authorized getter fetched only `_id` instead
   of retaining its denied `account` ref. The retained regression now passes.
3. Final `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed, including
   a fresh serial five-package transitive JS/declaration build and source
   `tsc --noEmit -p tsconfig.typecheck.json`. An earlier direct source check found
   BSON serialization's Uint8Array lacks `.equals`; Buffer comparison fixed it.
4. After that final fresh build:
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.planner.test.ts test/virtuals-populate-dependencies.integration.test.ts test/service-authorization-projection.unit.test.ts test/service-authorization-related.integration.test.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-populate-dependencies.config.test.ts`
   — **6 files / 241 tests passed**, including all **47 new cases**, both required
   authorization suites, the legacy planner and DPV-01 configuration/capture suite.
   An earlier 34-case iteration had 27 passes/7 failures: corrected fixture URL and
   global-versus-document-prefix assumptions, and normalized absent terminal row
   options before policy comparison so equivalent public/private scopes share.
   Subsequent closure review added duplicate-parent public-hook-cache assertions
   and target-only raw-capture coverage; the final 241-test run includes them.
5. `node_modules/.bin/eslint packages/access-router/src/acl/output-projection.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/acl/filter-resolution.ts packages/access-router/src/acl/populate-target.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/services/service.ts packages/access-router/test/virtuals-populate-dependencies.planner.test.ts packages/access-router/test/virtuals-populate-dependencies.integration.test.ts`
   — passed on final source/tests.
6. `node_modules/.bin/prettier --check packages/access-router/src/acl/output-projection.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/acl/filter-resolution.ts packages/access-router/src/acl/populate-target.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/services/service.ts packages/access-router/test/virtuals-populate-dependencies.planner.test.ts packages/access-router/test/virtuals-populate-dependencies.integration.test.ts docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md`
   — passed after `apply_patch` formatting corrections. `git diff --check` and
   `git diff --no-index --check -- /dev/null packages/access-router/src/acl/virtual-populate-execution.ts`,
   `git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-populate-dependencies.planner.test.ts`,
   `git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-populate-dependencies.integration.test.ts`
   — passed. Vitest's existing future native-config notice is nonblocking. No full
   package/workspace, installed-consumer or overall feature-completion claim is made.

**Concrete shared API and integration instructions (package-private):**

1. `planVirtualPopulateQuery(plan, publicPopulate)` returns `requiresCapture`,
   `queryPopulate` (remaining adapter population) and `publicPopulate` (detached
   ordinary target work). `findOnePrepared`/`findPrepared` already call it before the
   adapter, then `loadOutputPopulateDependencies` immediately after the raw result,
   before snapshots/includes/association capture. The adapter's builder API remains
   unchanged. The service result reports the original public query intent.
2. `createVirtualPopulateBatch({ request, runtime, family, permissions, hydration,
core? })` owns all execution/raw state in module WeakMaps. Then call
   `captureVirtualPopulateRows(batch, inputs, plan, publicPopulate?, sourceSelection?)`
   synchronously for **all known rows/scopes**, and only then
   `await executeVirtualPopulateBatch(batch)`. Capture is closed after dispatch.
   Rows may be raw adapter rows, visible post-save rows, materialized templates,
   target rows or dedicated child rows. Addresses are relative to the supplied
   output root, including array indices (`['children', 1]`); a dedicated child root
   starts at `[]`. Source masks default to `plan.publicPersistedFetchSelection`;
   reads also retain original admitted ordinary-populate source paths. Write/template
   integration must choose its captured receiving hydration (hydrated where D4 says
   so) and original hook mask, after lifecycle/visibility work, before population,
   batching bulk responses outside row getter workers. Never populate live saved
   documents or templates with dependency work.
3. `readVirtualPopulatePublicRow(row)` returns a detached **ordinary fetch/hook view**,
   with ordinary population's original match/null/array semantics. It is not the
   final authorized DTO. `getVirtualPopulateRow(intermediateSource)` retrieves its
   private row token; before include copies/finalizer isolation, retain that token
   explicitly, or resolve it through `getIncludeOriginal(doc)`. Pass the row token
   and occurrence address through private finalizer args/traversal, never context,
   DTO properties, permission metadata or authorization handles.
4. For each candidate call `readVirtualPopulateInputs(row, address, virtualName)`.
   `{ available: false }` means **skip the getter**, including denial/failure and
   absent/undefined source refs. `{ available: true, populated }` supplies the
   separate fourth argument; no declaration produces `{}`. Null targets/array null
   slots are available partial inputs, not unavailable. Every retrieval isolates
   its declared selections/native leaves. Keep the first argument on the existing
   pre-expansion/local-dependency/finalized-public-related view.
5. `readVirtualPopulateOriginalReference(row, address, path)` returns copied exact
   `{ present, value }` for captured private or ordinary refs. DPV-03 must run
   unconditional cleanup/restoration after success, undefined/throw, late denial or
   unavailable input: ordinary requested population uses its original target plan;
   otherwise restore these exact refs only when originally selected/permitted, or
   omit them. Then apply original field/identity rules before decorate/tasks. Never
   reconstruct IDs from targets or use the union fetch mask as output eligibility.
6. `readVirtualPopulatePublicTargets(row)` yields `{ address, plan, input }` work for
   the **next ordinary-output stage**, projected to that target's full original
   fetch plan including its own auto refs but excluding another getter's union.
   Collect these across all parents into the next batch before target finalization;
   its public hook view excludes those new refs. This two-stage seam has an actual
   cyclic-model persisted-only behavior test. Private targets never appear here.
   `getVirtualPopulatePublicIdentity(view)` returns only a data-free raw-work token
   for the existing per-`PopulateTargetMeta` public finalization cache; it survives
   this target transport, and must never authorize or supply private inputs.

DPV-02's criteria and required focused gates pass. Broader service-path execution
and final runtime fourth-argument delivery remain the next tasks' explicit ownership.

### Task DPV-03: Compute from private views and restore authorized direct output

Status: completed

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

#### DPV-03 implementation scope and execution evidence

Implementation owner: DPV-03 agent; acceptance self-review, with coordinator review
separate. Read the complete task/D1-D4 and prior evidence/handoffs, root `AGENTS.md`,
task conventions, actual helper signatures and `ai-friendly-ts-package`. No additional
applicable `AGENTS.md` exists. Set DPV-03 `in_progress` before implementation and
preserved the intentional DPV-00..02 work. Blockers: none for DPV-03. Builds/tests
were serialized; no delegation, staging, commits, publishing, dependency updates or
manual generated-output edits occurred.

**Implemented and covered:**

- The shared finalizer retains an execution-only row token before isolation, passes
  occurrence addresses through embedded traversal, and resolves declared private
  inputs independently for each getter. The gate runner always forwards the fourth
  argument; legacy getters receive `{}`. Unavailable dependencies skip invocation.
  The first argument retains the ordinary persisted/local-dependency/finalized-related
  view, including an existing local dependency on a denied ref, without another
  getter's private expansion. Only returned values are staged.
- Final trimming independently chooses admitted ordinary population or the exact
  captured original ref, subject to original source selection/authorization. Getter
  undefined/throw, late denial, absent sources and private operation/scope/query
  failure all reach the same reconstruction. Runtime cases cover scalar/array IDs,
  duplicates, missing/out-of-scope targets, null/empty/absence, public match, ordinary
  defaults and explicit `populate: []`, source/target exclusions and `-_id`, readable
  but unrequested inputs, both receiving hydration modes and read-to-list fallback.
- The central `account.balance`/`account.creditLimit` case computes despite denied
  source/target output fields. Ordinary `account.name` population fetches a union
  and returns only its original authorized projection/normal identity. Per-getter
  declarations, native mutable leaves and duplicate slots remain isolated. Runtime
  helper/handle checks and decorate/decorateAll/COPY-task observations see no private
  expansion. Tests explicitly await the mutating getter's result so an assertion
  swallowed by fail-closed getter handling cannot falsely satisfy this regression.
- Create collects all post-`afterPersist` rows/snapshots before dependency loading;
  update and both upsert branches load after existing snapshot/diff/changes work.
  Dependency-bearing population/finalization uses detached output copies. Tests
  verify post-hook ref capture, one unioned bulk target query, live document identity,
  saved refs, population state, modified paths and lifecycle snapshots. Private-only
  query failures preserve successful writes and cause exactly one driver write.
  Configurations without active dependency work retain ordinary document population.
- `new` loads present scalar/array defaults under captured target read policy, uses
  create/create/create with initiating `new`, and keeps ignoring `args.select` and
  `requireExplicitSelect` for template eligibility. Cases cover default-null,
  absent/empty arrays, target-read denial, private null slots and exact original array
  restoration, with no save/insert. Write/template target queries remain hydrated
  even when source read hydration is configured lean.
- A reusable orchestration helper collects the next ordinary populated-target stage
  across parent rows before finalization. A runtime cyclic-model case proves a
  target's own declared persisted-only dependency computes, without invoking the
  private target's virtuals. Embedded occurrence transport has a runtime array smoke
  case; broader path coverage and dedicated child loading remain DPV-04 ownership.

**Changed paths owned by DPV-03:** this task's DPV-03 status/evidence and, under
`packages/access-router/`:

- `src/acl/hook-runner.ts` — fourth-argument forwarding inside existing hook admission.
- `src/output/finalize-model-output.ts` — private row/address handoff, declaration-only
  getter delivery, unavailable-input suppression and unconditional original-ref choice.
- `src/acl/virtual-populate-execution.ts` — admitted-public-ref lookup and reusable
  collected source/ordinary-target output orchestration, retaining DPV-02's executor.
- `src/services/service.ts` — use the shared orchestration; retain tokens through
  source/target isolation and include provenance; detached post-lifecycle writes and
  templates. Preserved DPV-02's existing read/list and captured-populate changes.
- `test/virtuals-populate-dependencies.integration.test.ts` — **60 additional runtime
  cases**, expanding DPV-02's 33 to 93. The deferred-finalizer case now uses its actual
  captured public row rather than an unrelated `{ _id }` fixture.

**Actual commands/results:**

1. Rechecked existing parents with
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/packages/access-router/test'`
   and `git check-ignore -v _tmp-dpv/dpv03-probe.mts` — existing ignored location,
   `.gitignore:8:_tmp*`. Reused `_tmp-dpv` for all Vitest temporary work; no separate
   probe file was created. Executed commands substituted the real checkout path.
2. `pnpm --filter @web-ts-toolkit/access-router... build` — fresh baseline passed,
   including all five transitive JS/declaration builds. Before implementation,
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.integration.test.ts -t 'computes from denied ref/target'`
   — **2 failed / 33 unselected**: both hydration modes returned false because the
   getter received no fourth argument. These retained regressions now pass.
3. Integration iterations exposed fixture-only errors: a local-time `getFullYear()`
   expectation observed 2024 for midnight UTC 2025; corrected to `getUTCFullYear()`.
   A related operation-grant fixture omitted its required target `model`; corrected
   it. A later 85-case targeted iteration had **50 passed / 2 failed / 33 unselected**
   because a prototype `save` spy does not observe Mongoose's internal create save;
   switched to collection `insertOne`/`updateOne` observations. The ensuing complete
   integration run passed **88/88**. No unrelated/baseline failure was inferred.
4. `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed on final production
   source, including its fresh serialized five-package closure build and
   `tsc --noEmit -p tsconfig.typecheck.json`. An earlier direct source check using
   `node_modules/.bin/tsc --noEmit -p packages/access-router/tsconfig.typecheck.json`
   also passed. Subsequent changes added test cases/evidence only.
5. After that closure build:
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.planner.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/service-authorization-mutations.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/service-authorization-related.integration.test.ts test/include-source-provenance.integration.test.ts test/hydration-characterization.integration.test.ts`
   — **11 files / 319 tests passed**, including all four required existing suites,
   the 88-case integration version, planner and additional affected-path regressions.
6. Added five test-only write-denied-ref/default-array cases, then ran
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.integration.test.ts`
   — **final 1 file / 93 tests passed** on unchanged production source/build.
7. `node_modules/.bin/eslint packages/access-router/src/acl/hook-runner.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/services/service.ts packages/access-router/test/virtuals-populate-dependencies.integration.test.ts`
   — passed; final test-only additions were rechecked.
   `node_modules/.bin/prettier --check packages/access-router/src/acl/hook-runner.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/services/service.ts packages/access-router/test/virtuals-populate-dependencies.integration.test.ts docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md`
   — passed after `apply_patch` formatting corrections. `git diff --check` and
   `git diff --no-index --check -- /dev/null packages/access-router/src/acl/virtual-populate-execution.ts`
   and
   `git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-populate-dependencies.integration.test.ts`
   — passed. Inspected final status/diffs and preserved prior uncommitted paths.
   Vitest's existing future native-config notice is nonblocking. Full V3/V4/V5 and
   overall feature completion are not claimed by DPV-03.

#### DPV-04 concrete handoff and coverage boundaries

- `loadVirtualPopulateOutputRows(owner, inputs, plan, publicPopulate?, sourceSelection?)`
  in `acl/virtual-populate-execution.ts` is the package-private reusable loader. The
  owner is the same captured request/runtime/family/permissions/hydration/core record
  accepted by `createVirtualPopulateBatch`. It captures every supplied root/embedded
  occurrence before I/O, executes one collected batch, then collects ordinary public
  targets needing their own terminal dependencies into a second batch across rows
  and plans. Returned rows are detached ordinary hook views with WeakMap-only tokens;
  private terminal targets never enter the next stage. Existing low-level capture/
  execute/read APIs remain usable for a more specialized collected stage.
- Finalizer args `virtualPopulateRow`/`virtualPopulateAddress` are private execution
  handoffs, separate from `scopePath`, context, handles and DTOs. Root addresses are
  `[]`; embedded traversal extends with actual container names/array indices. Capture
  the token before copying; the service uses `getIncludeOriginal()` to recover it
  across include preparation. Source/target finalizers explicitly pass it when their
  input is a new snapshot. Getters never receive the token. An opted-in candidate
  without available transport is omitted fail-closed.
- Direct read/list/readFilter, write/upsert/template and ordinary static populated
  target/embedded smoke paths are integrated. Dedicated subdocument
  `prepareSubdocumentOutput`/`finalizeSubdocumentRows` still need the loader at their
  visible-child seam, including branches without ordinary population, and capture
  before `findRawParentDoc`'s query-time population. Preserve the raw parent hook view,
  owning grants, fixed receiving hydration and successful hidden-write behavior.
- Verify legacy/correlated include path collisions, deeper embedded scopes, target
  arrays/shared caches, whole-container output grants and alternate/root/trusted
  routes with declarations enabled. The shared source service seam should carry
  include targets, but DPV-03's include/hydration suites are existing regressions,
  not a feature-enabled full parity matrix.
- `planVirtualPopulateQuery` intentionally leaves exotic ordinary populate shapes
  on the adapter path. If such an ordinary target has its own supported private
  declaration, collect its full fetched input before public snapshots/isolation and
  feed the same target-stage loader; avoid per-target getter I/O. Likewise, callers
  using explicit finalizer `related`/traversal hooks must retain each target's own
  row token before cloning rather than inheriting the parent's occurrence. These
  are concrete DPV-04 cross-path audit/integration points, not narrowed D1-D4 scope.
- Driver observations in this task prove one compatible bulk target query and
  exact single write on private failure, not DPV-04's full performance/query-growth
  matrix. DPV-04 still owns that matrix, hidden-child getter suppression, broader
  runtime/config isolation and full package V3 verification.

DPV-03's direct-output acceptance criteria and required focused gates pass. The
task is completed; DPV-04 through DPV-06 remain pending, with no reduction of the
supported-path contract or claim of independent review/full feature completion.

### Task DPV-04: Cover related, embedded, and alternate routes with bounded work

Status: completed

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

#### DPV-04 implementation and acceptance evidence

Implementation owner/reviewer: DPV-04 agent, implementation self-review; coordinator
review and DPV-06's independent review remain separate. Read this complete task,
frozen D1-D4, prior evidence/handoffs, supported-path matrix, root `AGENTS.md`, and
task conventions. No additional applicable `AGENTS.md` exists. Set DPV-04
`in_progress` before implementation and preserved all intentional uncommitted
DPV-00..03 work. Builds/tests were serialized. No delegation, staging, commits,
reverts, publishing, dependency changes, or manual generated-output edits occurred.
Blockers: none. DPV-05 and DPV-06 remain pending.

**Runtime seams completed/fixed:**

- Dedicated child list/read/create/update/bulkUpdate now collect all visible child
  rows and nested occurrences through `loadVirtualPopulateOutputRows` before
  finalization, including paths without ordinary population. Child-relative
  descriptors retain their captured target metadata. Read decides capture before
  `findRawParentDoc` query-time population and keeps actual hydrated child storage
  slots until capture. Parent authorization still consumes its raw parent snapshot;
  children reuse owning-parent grants, while populated targets issue their own.
  The registered private subdocument executor retains the owning Core for existing
  request base-filter-cache rules; the request's mutable ambient Core is not used.
- The shared loader also collects adapter-populated ordinary targets (for example,
  an existing supported dotted String ref whose target declares an ObjectId private
  dependency). It captures their full fetched inputs across rows before public
  snapshots, then loads terminal private targets in one next-stage batch. Writes
  and child reads run adapter-only population on detached output copies **after**
  original storage-slot capture. Participating ordinary static refs still use the
  unioned raw batch. No source/target persistence document is populated privately.
- Legacy include association FKs, already fetched privately by the existing join
  transport, now survive the loader's original source mask until paired join-value
  capture. This fixes dependency-enabled legacy list attachments without exposing
  join keys or changing include-source collision/provenance semantics.
- `publicStructurePaths` distinguishes an empty embedded public hook view from a
  whole-container fetch mask. A nested object containing only a private ref now
  contributes shape, not its automatically retained ref, to the getter's first
  argument/public hooks. Independent local dependency/hook/join container masks
  preserve their ordinary view. Private values remain fourth-argument-only.
- Explicit finalizer `related` traversal resolves each original target's row token
  before cloning, including arrays/custom traversal callbacks. It never inherits a
  parent's token or occurrence address. Embedded addresses remain scope-local.
- Added successful/pending **raw-only** fetch reuse within a captured execution
  family. Compatibility binds request/runtime/family, target capture identity,
  actual model/schema, read policy/ordered BSON predicate, receiving hydration,
  actual ID coverage and positive projection coverage. Wider requirements dispatch
  a new query; failed entries are evicted; new captures/families/modes do not reuse
  old work. Each getter/output still receives its own view and authorization stage.
  This lets existing per-parent correlated output calls reuse covered private work
  without replacing their public query, match, pagination, or finalization scopes.

**Executable path-by-path acceptance matrix:** all rows passed on final source in
V3. `parity`, `performance`, and `traversal` below mean the three new
`test/virtuals-populate-dependencies.<name>.test.ts` suites. `integration` means the
retained 93-case dependency integration suite. Both configured source hydration
modes run in parity/performance; fixed receiving modes are explicitly characterized.

| Supported path / invariant                                            | Executable coverage and measured result                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct/root/trusted list, read, readFilter                            | Parity's five read/child entry-point cases compare actual output across all three entry families; integration covers defaults, fallback, hidden refs and private-only first-argument masks. Both modes pass.                                                                                                                                                                                                      |
| Direct/root create, update, both upsert branches                      | Root's eight mutation/template/child-operation cases compute with the correct create/update access; integration retains direct lifecycle, post-`afterPersist`, bulk batching, snapshot and successful-failure cases. Saved refs remain IDs; computed fields never persist.                                                                                                                                        |
| `new` template                                                        | Root template case plus integration's default scalar/array/null/absent/default-ref cases pass; source create/create/create and ignored `args.select` remain intact; no insert/save.                                                                                                                                                                                                                               |
| Ordinary populated targets                                            | Scalar/array targets, repeated targets with isolated copies, target-owned deferred grants, `-_id`, public match/access separation, and dotted adapter-populated targets pass. One and eight parent rows both issue one parent find, one ordinary target find, and one private find; repeated targets finalize once per public plan. Post-save adapter population and dedicated child target population also pass. |
| Legacy include read/list targets and collisions                       | Parity attaches targets over a private source-ref path and the source join-key path while source getters/hooks keep their original inputs. Legacy list's paired association mask is retained. Eight parents use one target list query and one private query; one target getter invocation, detached copies per attachment.                                                                                        |
| Correlated include read/list targets and collisions                   | Source `$parent` snapshots/provenance and target-owned grants pass. Eight parents retain eight ordinary correlated target queries/eight public getter stages, with **one** covered private query in their shared captured family. No public output handle or finalized DTO is reused as private authority.                                                                                                        |
| Embedded object, nested object, document arrays                       | Profile, plain nested `nested.inner`, children and children.notes occurrences batch together. Six getters across multiple scopes share one private find; original IDs/duplicate/null/missing/out-of-tenant array slots are preserved. No private ref enters first-argument views. Whole-container grants and exclusions pass; missing/null containers are never synthesized into objects.                         |
| Dedicated subdocument list/read                                       | Selected visible child rows plus nested notes batch into one private find. Ordinary scalar/array sub-population selecting only `name -_id` shares one target find with private inputs. One parent find, original parent-hook IDs/complete arrays, exact child ref reconstruction and unselected-ref omission pass. Dedicated read/list private receiving mode stays hydrated.                                     |
| Dedicated subdocument create/update/bulkUpdate                        | Visible post-save rows use one private target find, correct initiating getter access and fixed lean visibility receiving mode. Stored order/count, saved IDs, denied visibility `[]`/null, row-filtered hidden children and zero hidden-row getters pass. A private query failure leaves a successful visible update and exactly one driver write.                                                                |
| Getter/error/absence cleanup                                          | Dedicated throw/undefined, private-read denial/false scope, private query failure, null/missing refs and live replacement cases pass alongside integration's complete cleanup/isolation cases. Original scalar/array values survive; private inputs are never reconstructed from populated target IDs.                                                                                                            |
| Count/distinct/exists/delete/subdocument-delete/include-count/helpers | Parity observes **zero** private target finds/getters for all scalar/identity operations and for `genSelect`, `genQuerySelect`, `pickAllowedFields`, and `trimOutputFields`. Include-count adds no virtual work.                                                                                                                                                                                                  |
| Public control and ownership negatives                                | Wire, root and custom-service attempted dependency/`populated` controls do not activate loading. Persisted `dependsOnPopulate` business data remains writable/filterable/selectable. Metadata/skimming flags preserve private isolation. The same physical models registered in two runtimes keep independent read gates/cache authority.                                                                         |
| Captured configuration and unsupported shapes                         | Dedicated in-flight parent-row-hook replacement keeps the old getter/selection/target policy, then later calls observe denial and the new getter. Traversal tests bind cache coverage to capture/family/mode and evict failure. Existing 84-case configuration suite passes in V3, preserving explicit unsupported-ref/selection errors and eager atomic admission.                                               |

**Measured batching and bounds (driver/schema observations, not timing thresholds):**

`performance` exercises a public source list, two private target models, compatible
ordinary population, scalar/array/repeated refs, two declarations sharing a target,
and embedded getters. Each configuration compares one row against 24 rows.

| Receiving mode           | Persistence/hook limits | Rows | Getter calls | Parent finds | Target finds/groups | Deduplicated target IDs (A/B) | Observed persistence/getter peaks |
| ------------------------ | ----------------------- | ---- | ------------ | ------------ | ------------------- | ----------------------------- | --------------------------------- |
| Lean and hydrated (each) | 1 / 1                   | 1    | 4            | 1            | 2 / 2               | 2 / 1                         | 1 / 1                             |
| Lean and hydrated (each) | 1 / 1                   | 24   | 96           | 1            | 2 / 2               | 3 / 1                         | 1 / 1                             |
| Lean and hydrated (each) | 2 / 2                   | 1    | 4            | 1            | 2 / 2               | 2 / 1                         | 2 / 2                             |
| Lean and hydrated (each) | 2 / 2                   | 24   | 96           | 1            | 2 / 2               | 3 / 1                         | 2 / 2                             |

First-wave barriers hold admitted target query middleware/getter work until the
observer checks active counters and releases it; post-query/finally counters verify
zero remaining work. All runs complete at concurrency one. Every query has unique
IDs and the appropriate receiving hydration; public/private selections share the
positive persisted union but not output eligibility. Cyclic target declarations
back to the source execute **zero terminal-target virtual getters** and add no
recursive reads. Distinct public match/list-access scopes use three independent
target queries in parity; dedicated bulk/embedded compatible work uses one. The
traversal cache case observes one query for simultaneous identical batches, then
new queries for uncovered projection/IDs, another hydration/family/capture, and a
separate call after failure. Measurements do not claim a constant total for legacy
per-parent read includes or ordinary correlated public queries.

**Actual commands/results and corrected intermediate failures:**

1. Verified parents with
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/packages/access-router/test'`
   and `git check-ignore -v _tmp-dpv/dpv04-probe.mts` — existing ignored directory,
   `.gitignore:8:_tmp*`. Reused it for Vitest/consumer temporary work. Executed
   commands substituted the actual checkout path; no separate probe was created.
2. `pnpm --filter @web-ts-toolkit/access-router... build` — fresh baseline passed.
   Then
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.parity.test.ts`
   — initial before-fix **10/10 failed**, including meaningful list/read failures
   where the always-authorized `slots` computation was absent in both modes. The
   `total` assertions also had the permission-prefix fixture issue corrected in
   step 3; do not interpret all ten failures as isolated feature-failure evidence.
   The retained cases now pass for all five dedicated paths. The initial read
   fixture also tried `match` in `SubPopulate`; corrected it to the existing
   path/select-only grammar rather than broadening that API.
3. The same parity command was rerun during integration. An expanded 44-case
   iteration had 42 failures: corrected fixture model-permission prefix (`m::owns`),
   nested rather than literal-dotted row options, and the ordinary adapter example
   to its existing supported dotted String-ref path. Another iteration exposed the
   actual adapter-target and legacy association-mask defects. Null-container
   expectations were aligned with existing dotted-projection absence semantics;
   the regression asserts no object synthesis. The remaining two nested
   first-argument auto-ref failures drove `publicStructurePaths`. Later added
   cross-parent measurements found existing correlated public queries are per
   parent and include receiving hydration is fixed lean; corrected those fixture
   expectations and implemented covered private raw-work reuse. No environmental
   or preexisting product-failure claim is inferred from these iterations.
4. `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.traversal.test.ts`
   — initial two traversal failures preceded the token fix; a subsequent run still
   failed because the fixture had unrelated parent/target authorization provenance.
   Corrected it to a parent-derived target authorization. Final default/custom
   traversal and later cache-isolation case pass.
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.performance.test.ts --reporter=verbose --silent=false`
   — **6 passed** at that stage; emitted the exact one/24-row measurements above.
5. Fresh closure/source checks:
   `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed on final
   production source, including its serial five-package JS/declaration rebuild and
   `tsc --noEmit -p tsconfig.typecheck.json`.
   `node_modules/.bin/tsc --noEmit -p packages/access-router/tsconfig.typecheck.json`
   also passed during implementation. Subsequent changes were tests/evidence only.
6. Focused required-suite command:
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.parity.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.planner.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-route-parity.integration.test.ts test/include-source-provenance.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/hydration-characterization.integration.test.ts`
   — passed **11 files / 374 tests**, then **11 / 384** after added child/adapter/
   metadata cases. After the final raw-cache change, the same command plus
   `test/operation-access-boundaries.integration.test.ts` ran **12 files / 535 tests**:
   533 passed, with only two erroneous include-hydration expectations corrected as
   described above. The final new-suite command
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.parity.test.ts test/virtuals-populate-dependencies.performance.test.ts test/virtuals-populate-dependencies.traversal.test.ts`
   passed **3 files / 103 tests** (96 parity, 4 performance, 3 traversal/cache).
7. **V3:**
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router test`
   — first full run completed **124 files / 3,107 tests**, with **3,099 passed / 8
   failed**. All eight failures were old `Core.isAllowed` call-spy expectations in
   `operation-access-boundaries.integration.test.ts`; their public data/denial checks
   passed. DPV-02's frozen populate gate deliberately no longer consults live Core
   options. Updated those assertions to observe the configured guard, its original
   actor/permission argument, and zero route-variant guard invocations, retaining
   the data/denial/no-target-work checks. The focused operation suite then passed
   **142/142**. After final cache/source/test corrections, repeated V3 from a fresh
   script-managed closure build — **final 124 files / 3,116 tests passed**, Vitest
   duration 1,016.11 seconds. No baseline/environment failure remains. Existing
   consumer fixtures also ran as part of V3; feature-specific V4/docs remain DPV-05.
8. Final focused checks passed:
   `node_modules/.bin/eslint packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/src/acl/output-projection.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/services/service.ts packages/access-router/test/virtuals-populate-dependencies.parity.test.ts packages/access-router/test/virtuals-populate-dependencies.performance.test.ts packages/access-router/test/virtuals-populate-dependencies.traversal.test.ts packages/access-router/test/operation-access-boundaries.integration.test.ts`.
   `node_modules/.bin/prettier --check` with the same eleven TypeScript paths passed
   after `apply_patch` formatting corrections. `git diff --check` passed, as did
   `git diff --no-index --check -- /dev/null <new-file>` separately for the three new
   suites and the previously untracked shared executor. The task Markdown also
   passes its focused Prettier check. Vite's future native-config notice was
   nonblocking. No full-workspace gate was run; DPV-06 owns V5.

**Changed files owned by DPV-04:** this task record and, under
`packages/access-router/`, `src/acl/subdocument-output.ts`,
`src/services/model-subdocument-service.ts`, `src/acl/virtual-populate-execution.ts`,
`src/acl/output-projection.ts`, `src/acl/virtual-projection.ts`,
`src/output/finalize-model-output.ts`, `src/services/service.ts`, the three new
dependency parity/performance/traversal suites, and
`test/operation-access-boundaries.integration.test.ts`. Prior edits in shared files
were retained. Final status/diff review preserves all other DPV-00..03 paths.

**DPV-05 / final-review handoff:**

- Document measured grouping/coverage, not a blanket O(1) query promise across
  independent includes. Ordinary correlated public queries remain per parent;
  covered private reads can share only within their captured family. Getters and
  authorization stages still execute for each logical public output.
- Include targets retain fixed lean receiving mode; dedicated child read/list use
  hydrated parents, mutation visibility uses fixed lean, and ordinary writes/
  templates use hydrated output inputs. Dotted Mongo projection can omit a null
  container before finalization. Preserve these existing materialization/value
  distinctions; do not promise byte-for-byte equality across hydration modes.
- `SubPopulate` remains path/select-only. This feature does not add its own match,
  access, recursive private target population, client query authority or entrypoint.
  Ordinary populate's independent match/access behavior remains covered separately.
- Explain optional getter argument four with an explicit typed map/default `{}`;
  first-argument persisted/local/finalized-public-related behavior stays unchanged.
  Retain D1 base-read/tenant gates, D2 eager same-runtime registration and explicit
  unsupported-ref errors, declaration-only views, original-ID/array restoration,
  field/selection independence, missing/unavailable semantics, and no private
  handles/snapshots/tasks/metadata transport. New typed examples/packed consumers and
  website build are still DPV-05's required work.
- DPV-06 should independently audit family-cache capture/coverage/failure ownership,
  source/target occurrence token propagation and the final matrix against D1-D4.
  No known substantive runtime defect or required follow-up is left untracked by
  DPV-04; V4/V5 and independent final approval remain pending by their task scope.

### Task DPV-05: Publish accurate types, examples, and compatibility guidance

Status: completed

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

#### DPV-05 implementation, installed-surface evidence and handoff

Implementation owner/reviewer: DPV-05 agent, implementation self-review; coordinator
and DPV-06 independent review remain separate. Read this complete task, frozen
D1-D4, prior evidence including DPV-04's complete handoff, root `AGENTS.md`, task
conventions and `ai-friendly-ts-package`. No additional applicable `AGENTS.md`
exists. Set DPV-05 `in_progress` before changes. Preserved intentional uncommitted
DPV-00..04 work. Builds/tests/commands were serialized; no delegation, staging,
commits, reverts, publishing, dependency upgrades or manual generated-output edits
occurred. Blockers: none. DPV-06 remains pending.

**Implemented and inspected:**

- Public getter/doc/descriptor/dependency/input-map JSDoc explains the optional
  fourth argument with an explicit map/default `{}`, unchanged first argument,
  per-declaration isolation, native-value caveats, base-read/tenant gates and eager
  target registration. Configuration and router-setter hovers point to that API.
  Updated finalized-only internal comments to distinguish argument one from
  declared argument four, and broad privacy wording to **no implicit transport;
  only an authorized getter's deliberate return becomes output**. These source
  edits are comments/JSDoc, not changes to runtime execution or type algebra.
- Confirmed the DPV-01 root/advanced exports already expose both new names; no
  metadata/entrypoint change was needed. Inspected generated `.d.ts`/`.d.mts`
  exports and their shared declaration graph. TypeScript-checker tests resolve
  real exported symbols, fields, hover text and `@example` tags through both
  entries/formats, check all four three-generic declarations' empty defaults,
  optional fourth parameter, unchanged context, and hidden private executor names.
- Shipped README now independently documents registration order, full installed
  imports/models, a runnable Mongo/HTTP three-shape example, selection/private
  authority, defaults, inheritance, supported/rejected refs/target masks, absence/
  failure/write semantics, supported output paths, fixed hydration distinctions,
  native-value isolation, compatibility and DPV-04's measured grouping. It never
  promises constant work across independent public correlated queries. `llms.txt`
  indexes the README. Website configuration/hooks agree and their marked examples
  participate in the actual strict semantic documentation harness.
- Extended the existing strict fixture with empty-default/optional-parameter proofs,
  guarded/defaulted and three/four-argument direct calls, and negative service/wire/
  sub-populate controls. Its existing readonly/cardinality/native, local-dependency,
  persisted/write/filter/public-output and legacy callback tests remain intact.
  The same fixture now compiles from actual transformed packed installations in
  Bundler and NodeNext ESM/CJS, including full declaration checking on current peers.
- Packed runtime consumers execute the **exact installed README** in ESM and CJS,
  covering public `name -_id`, restored scalar ID, unselected/denied ref omission,
  readable-but-unrequested private fields and target-read denial. A new installed
  runtime fixture covers both hydration modes, ordinary default population versus
  explicit `populate: []`, exact arrays with duplicates/missing/out-of-tenant IDs/
  nulls/order, hidden refs, declaration masks/identity exclusions, no context map,
  getter suppression and unchanged saved refs. Expected virtual output and explicit
  call counts ensure getter assertions cannot pass merely by being swallowed.

**Concrete discrepancies and bounded scope adjustments:**

1. The initial README used `setOption('permissionSchema.account', false)`, a path
   absent from the actual emitted typed setter surface. The strict compile caught
   it. Switched to the existing typed `permissionSchema('account', false)` helper
   (and corresponding array helper), rather than broadening setter API/types.
   TypeScript exposes `@example` through JSDoc tags, separately from its main hover
   summary; the checker now verifies both, and the descriptor summary itself also
   explains defaulting argument four. No frozen behavior was weakened.
2. Planned `pnpm --filter website build` returned **no matching projects**, so it
   was not accepted as website evidence. `website/` has its own pnpm workspace and
   lockfile, outside root workspace membership. Installed its existing locked
   dependencies with `--frozen-lockfile` and ran its actual script there. No tracked
   manifest/lockfile/workspace configuration changed.
3. The real website build exposed three untouched OIDC Markdown paragraphs with
   unescaped `<=120000`, rejected as MDX JSX. Before editing, `git diff --` confirmed
   those files were unchanged. Replaced only those three comparisons with equivalent
   `≤120000` text; the complete website build then passed. This necessary V4 build
   unblock adds three documentation-only paths to DPV-05 ownership, with no OIDC
   behavior/content-policy change. Also normalized an existing configuration table
   and small example's formatting during that file's focused Prettier check.

**Actual commands/results (root unless a working directory is named):**

1. Rechecked parents using
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/packages/access-router/test'`
   and `git check-ignore -v _tmp-dpv/dpv05-probe.mts` — existing ignored directory,
   `.gitignore:8:_tmp*`. Used that location for consumer fixtures/logs. Tests clean
   their staged consumers; no standalone probe was created. Executed commands
   substituted the actual checkout path; evidence paths here remain repo-relative.
2. `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed twice, with the
   final run after the last JSDoc change. This script performs the fresh serialized
   **five-package closure JS/declaration build**, then
   `tsc --noEmit -p tsconfig.typecheck.json`; both passed. Final log:
   `_tmp-dpv/dpv05-typecheck.log`. Generated outputs came only from normal builds.
3. **V4:**
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts`
   — final **4 files / 129 tests passed**, duration **520.85 seconds**: strict 26,
   exports 45, documentation 48, packed compatibility 10. Final log:
   `_tmp-dpv/dpv05-v4-final.log`. The initial run was **121 passed / 8 failed**,
   limited to the new example's unsupported typed setter and the JSDoc-summary
   assertion described above; corrected both and reran the complete four suites.
   Initial log: `_tmp-dpv/dpv05-v4.log`. No runtime/baseline failure was inferred
   from compile-stage failures. Vite's future native-config notice is nonblocking.
4. Packed checks use the real `createPublishPackageJson` transform, tarballs and
   actual build-artifact tree, at sentinel `0.99.0-test`. Minimum Express/Mongoose
   **5.0.0/8.0.0** and current tested **5.2.1/9.8.0** both pass, in both layouts.
   Each of the four consumers runs the new README and array fixture as **ESM and
   CJS** (16 new workflow processes; each array process checks both modes), along
   with existing consumers. Existing artifact generation may build missing bin
   prerequisites serially; this is the required V4 harness, not a V5 workspace run.
5. Website: `pnpm --filter website build` — no match, not a build. After checking
   the `website/` parent, ran `pnpm install --frozen-lockfile` **in `website/`** —
   passed, resolution skipped, 1,181 locked packages installed; log
   `_tmp-dpv/dpv05-website-install.log`. Then
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm build` **in `website/`** initially failed only
   on the three MDX comparisons above. After the narrow fixes, the same command
   passed: Docusaurus client/server compiled and generated `website/build`.
   Passing log: `_tmp-dpv/dpv05-website-build-passing.log`. Node's localStorage
   experimental warning was nonblocking; no website build blocker remains.
6. `npm pack --dry-run` **in `packages/access-router/`** — passed: **17 files,
   544.9 kB packed / 2.7 MB unpacked**, containing README, llms, manifest, three
   ESM/CJS entry pairs and their full declaration graph; no source/tests/temp files.
   Log: `_tmp-dpv/dpv05-pack-dry-run.log`. This is inventory evidence only; actual
   transformed installation/runtime correctness is established by step 3/4.
7. Final focused ESLint passed:
   `node_modules/.bin/eslint packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/routers/model-router.ts packages/access-router/src/helpers/document.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/services/service.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/documentation-examples.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts packages/access-router/test/virtuals-populate-dependencies.types.fixture.ts packages/access-router/test/virtuals-populate-dependencies.consumer.runtime.fixture.ts`.
   `node_modules/.bin/prettier --check` with those twelve TypeScript paths plus
   this task, package README/llms and website configuration/hooks passed; a separate
   check of the three incidental OIDC Markdown paths also passed. Formatting was
   corrected with `apply_patch`. `git diff --check` passed, as did
   `git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-populate-dependencies.consumer.runtime.fixture.ts`
   and the same command for the updated, previously untracked types fixture.
   Reviewed final status/diffs, local Markdown anchors/website links and installed
   export/declaration inventory. No tracked dependency/generated files changed.

**Changed paths owned by DPV-05:** this task record; under
`packages/access-router/`, `README.md`, `llms.txt`,
`src/interfaces/router-hooks.ts`, `src/interfaces/root.ts`,
`src/routers/model-router.ts`, `src/helpers/document.ts`,
`src/acl/virtual-projection.ts`, `src/output/finalize-model-output.ts`,
`src/services/service.ts`, `test/documentation-examples.test.ts`,
`test/export-contract.test.ts`, `test/packed-consumer-compatibility.test.ts`,
`test/virtuals-populate-dependencies.types.fixture.ts`, and new
`test/virtuals-populate-dependencies.consumer.runtime.fixture.ts`; under
`website/docs/packages/`, `access-router/configuration.mdx`,
`access-router/hooks.mdx`, `express-oidc-vault.md`,
`express-oidc-vault-mongodb-store.md`, `express-oidc-vault-redis-store.md`.
Prior edits in shared/untracked files remain preserved. DPV-01's strict-consumer
harness/export changes were reused rather than replaced.

**Acceptance / DPV-06 independent-review handoff:** DPV-05 criteria and required
V2/V4 gates pass on the final package surface. No unresolved type/doc/runtime
discrepancy or required follow-up is left by this task. DPV-04's full package V3
evidence remains historical evidence from that task; DPV-05 did not repeat V3 or
run V5. The final independent reviewer still owns V5 and full A1-A4/D1-D4 approval.
Risk hotspots: captured-family raw-fetch cache binding/coverage/error eviction;
source/public-target hook masks versus private views; occurrence-token/address
transport across includes, adapter-only targets, embedded/dedicated children and
detached post-write output; ordinary-default/denied-populate reconstruction and
exact ID slots; private-only failure versus shared-public error behavior. Review
emitted types/docs together with those runtime seams, retaining fixed hydration
materialization and measured-compatible-group caveats. For website reruns use its
own workspace command above. Reuse current V4 evidence unless review changes
invalidate it; DPV-06 has not been started by this implementation agent.

### Task DPV-06: Verify the complete contract and release readiness

Status: completed — same independent reviewer accepted DPV-07/08/10/11 and final DPV-09 verification; no required finding remains open.

Kind: investigation

Priority: P1 — integrated evidence must prove private inputs never broaden public response semantics.

Dependencies: DPV-00, DPV-01, DPV-02, DPV-03, DPV-04, DPV-05.

Required review-discovered prerequisites: DPV-07, DPV-08, DPV-09, DPV-10, DPV-11 (below).

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

#### Final independent DPV-06 disposition

**Approved against the frozen contract and delivered worktree.** Reviewer: the
same independent DPV-06 final reviewer who reproduced the original and resumed
findings, independent of DPV-00..05 and DPV-07/08/10/11 production implementation.
The reviewer supplied regression probes and tiny README synchronization fixes,
not the runtime corrections. The full initial tracked/untracked delivery and each
subsequent corrective diff/new suite have received independent review. All **26**
retained reviewer cases remain active and pass in the final complete package run.

**Corrective acceptance:**

- DPV-07 owns effective args/options/defaults and implicit mutation selections
  before awaits, carrying them through source/target capture, prepared execution,
  public/direct/root/include and dedicated-child paths. Date/Buffer/RegExp/BSON
  values keep the existing native-copy semantics; no JSON clone or public type
  widening was introduced. The original eight intent regressions pass.
- DPV-08 captures the exact runtime operation fallback only for an undefined
  stored parent; defined-parent blocking, exact/default/bare precedence, explicit
  denial, trusted accesses and independent private request-read policy agree with
  the existing resolver. The original four guard regressions pass with/without
  private declarations in both hydration modes.
- DPV-10 consumes and clears the dispatch slot at Core entry, before running any
  trusted guard. The intended core/model/access receives its local captured rule
  and original permissions once; independent nested/awaited/late descendants have
  no reusable capture. Concurrent requests/cores and explicit nested includes own
  separate slots. Both original leakage cases, four ownership controls and the
  16 new dispatch tests pass, including success/throw/reject and limit-one cases.
- DPV-11 captures source list admission/permissions from read configuration before
  identifier or row suspension and invokes its deferred callback only on the
  existing nonterminal fallback branch. It uses the hook gate and one-shot Core
  dispatch; unrelated nested calls get fresh source policy. The eight original
  fallback cases and 154 new controls pass. Read/list access triples, hydration,
  target read/tenant scope, no-work terminal/success cases and default masks are
  preserved. The actual compatibility fix is the one-line empty-entry return in
  `Base.assertIncludeOutputPaths`, before unnecessary related-model authentication;
  nonempty include admission/preflight still authenticates its captured binding.
  Existing custom/fake adapter controls pass without assertion changes.

**Final acceptance/dependency audit:**

- **A1/D1:** server-only declarations give input fields, not operation/row/output
  authority. Source/target output denial does not block a permitted private input;
  captured target request-read operation and mandatory relationship/tenant rows
  remain required. Known-denied candidates add no private work; deferred grants
  still resolve normally. Public match/access/related grants never redefine input.
- **A2/A3:** compatible normalized ordinary/private masks share only persisted
  fetch work. Ordinary population returns only the original requested/authorized
  target fields, including exclusions/`-_id`; readability/fetching alone grants
  nothing. Without ordinary population, selected/permitted refs restore their
  exact captured IDs/arrays with misses, order, duplicates, null/absence/empty
  semantics; unselected/excluded/denied refs are omitted. Original intent includes
  server defaults. Reconstruction survives denial, undefined/throw and failure.
- **A4/D2-D4:** eager atomic validation and coherent source/target capture, per-getter
  fourth-argument isolation, unchanged first argument/hooks/snapshots/handles,
  raw-cache ownership/coverage/error eviction, captured policy/actor and ordered
  predicates remain intact. Only deliberate authorized getter return becomes
  computed output. Private reads remain terminal persisted-only; scheduler/hook
  bounds, finite cycles, no-retry private-only failure and ordinary shared-public
  failure behavior pass. Detached writes/templates preserve lifecycle and native
  receiving-hydration caveats; hidden rows do not compute.
- All supported direct/root/trusted read/list/readFilter, create/update/upsert/new,
  populated/include/embedded and dedicated-child paths have executable feature
  coverage. Existing no-feature, fake-adapter, include-provenance, operation,
  visibility, hydration and concurrency suites passed in the final **130-file /
  3,490-test** access-router run. DPV-04's actual group/ID/query/peak assertions
  remain active and passing, including 1/24 rows, two target groups and limits 1/2.
- Root/advanced/processors metadata, current `.d.ts`/`.d.mts` graph/JSDoc, explicit
  populated typing and unchanged persisted/write/public model surfaces agree with
  runtime and shipped docs. The final root run supplies fresh **129/129** V4
  consumer checks, including real transformed packed ESM/CJS runtime and strict
  Bundler/NodeNext compilation/emission. Collection/cache audit below verifies
  the exact four files/counts; historical pre-correction V4 was not substituted.
- Every DPV-00..11 requirement has implementation/test or frozen investigation
  evidence. DPV-07/08/10/11 findings and DPV-09 final prerequisites are closed;
  there is **no pending required corrective work or silently reduced support**.
  Unsupported shapes remain explicitly rejected under D2 rather than deferred.

The exact final gates, initial failed attempts, diagnostics, limitations and
worktree integrity are recorded in DPV-09 below. Earlier blocked dispositions
are historical checkpoints, superseded by this final approval.

#### Historical DPV-06 independent first-review execution

Reviewer: fresh DPV-06 final reviewer, independent of DPV-00..05 implementation.
Read root `AGENTS.md`, applicable task conventions, the complete frozen D1-D4 and
acceptance/evidence record, and `ai-friendly-ts-package`. Set `in_progress` before
review. Initial status contains the intentional DPV-00..05 changes (31 tracked
modified paths and 12 untracked source/test paths); all are preserved. The full
delivered diff, untracked contents, installed surface, and serialized V5 gates are
under review. No concurrent builds, nested agents, staging, commits, reverts,
publishing, dependency upgrades, or manual generated-output edits are authorized.

**Disposition: changes required; no final signoff.** Reviewed the full delivered
tracked diff and all twelve original untracked source/test files, including the
complete schema validator, descriptor resolvers, snapshot/copy tokens, source and
target projection planners, executor/raw cache, source/target/embedded/dedicated
row transport, finalizer, mutation/template seams, guard change and changed guard
assertions, public types and all new consumer/runtime/configuration suites. The
two findings below are reproduced against the normally built public ESM entry;
no production correction was made by this reviewer. The coordinator should assign
fresh corrective implementers sequentially, then resume this independent reviewer.

**Acceptance audit and limits:**

- A1/D1: schema declarations remain server-only; captured private targets use base
  request read operation/rows and mandatory IDs, independently of ordinary match,
  access, `authorization.related` and source/target output denial. Deferred output
  candidates, target tenant scopes, terminal denial and no private output handles
  have implementation and executable coverage. DPV-08 blocks equivalence of the
  changed **ordinary** target operation guard with its existing defaults resolver.
- A2/A3/D4.1: independent public/private masks, positive compacted fetch unions,
  exclusions/identity behavior, exact pre-populate scalar/array ref reconstruction,
  miss/order/duplicate/null/absence behavior and ordinary default population are
  implemented and tested across the path matrix. However, effective caller/service
  query intent is not owned before awaits. DPV-07 reproduces an originally hidden
  ref becoming output, and a readable but originally unrequested private target
  field joining ordinary populated output after argument mutation. This prevents
  approval of the controlling immutable-original-query requirement.
- A4/D2-D4: reviewed eager validation/target binding and atomic option assignment,
  independent inheritance and captured getter/target selections, deep native-value
  isolation, permission-hook/public structural masks, per-occurrence WeakMap
  transport across includes/clones, exact originals versus authorized public ref
  handles, detached writes, visibility-gated child output, unconditional cleanup,
  error categories/no retry and shared-public error propagation. Raw reuse binds
  captured family/request/runtime/model/schema/policy/ordered BSON predicate,
  receiving mode, ID/projection coverage; failures are evicted. Terminal reads do
  not finalize target virtuals. Existing bounded scheduler/hook and cyclic-model
  measurements are executable. These reviewed areas have no additional required
  finding; this is not an approval overriding DPV-07/08 or a claim to exhaustively
  characterize every application plugin/native materialization.
- All approved document-bearing paths have actual feature-enabled coverage in the
  delivered integration/parity/performance/traversal suites, and no-feature suites
  ran in the independent package run below. Fixed lean include/child-visibility
  and hydrated write/template/dedicated-read caveats are accurately documented.
  DPV-08 additionally proves the guard regression **with no feature configured**.
- Installed surface review followed `ai-friendly-ts-package`: package manifest,
  bundled tsup entries, root/advanced/processors exports and actual generated
  `.d.ts`/`.d.mts` graph, new dependency/input types, empty generic defaults,
  optional fourth argument, source cardinality/readonly partial native inputs,
  unchanged first argument/context and non-widened persisted/write/public models;
  README, llms and website examples agree with the declared API. Inspected that
  strict fixtures compile real copied declarations in Bundler/NodeNext ESM/CJS,
  and transformed packed fixtures include those sources in actual tsc inputs and
  emit/run the README/array workflows. Current peers check full declarations;
  minimum peers intentionally skip peer-internal declaration checking. No new
  entrypoint or client/OpenAPI authority was added. V4's exact DPV-05 **129/129**
  evidence remains applicable; all four consumer suites also passed independently
  within the **3,122-test** package run. Website V4 and 17-file dry-run inventory
  were inspected/reused; access-router source/docs were not modified during review.

**Tiny documentation correction within reviewer scope:** the three DPV-05 OIDC
website edits are exactly one `<=120000` → `≤120000` replacement each, needed for
MDX. The first independent root test run exposed strict README/website ticket
section equality in OIDC packed consumers. Confirmed the three package READMEs
had no existing worktree diff, then made the same one-comparison replacements in
`packages/express-oidc-vault/README.md`,
`packages/express-oidc-vault-mongodb-store/README.md`, and
`packages/express-oidc-vault-redis-store/README.md`. No semantics changed. All three
OIDC package suites subsequently passed in the second root run, including their
packed consumers. This was a delivered-doc mismatch, not an environmental or
unproven preexisting failure. No root CHANGELOG edit was made.

**Actual independent verification (serial builds/tests):**

1. Reused ignored `_tmp-dpv` after
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/packages/access-router/test'`
   and `git check-ignore -v` for every
   new log name (`.gitignore:8:_tmp*`). Commands substituted the checkout path;
   evidence here stays repo-relative. No dependency install/upgrade was performed.
2. `pnpm build` — **passed**, root scope **31 of 32 workspace projects**, including
   normal JS/declaration and downstream example builds. Log:
   `_tmp-dpv/dpv06-build.log`. Build warnings did not fail the command.
3. `TMPDIR='<repo-root>/_tmp-dpv' pnpm test` — initial run failed at
   `@web-ts-toolkit/express-oidc-vault/test/packed-consumer.test.ts:387` on the
   exact `<=`/`≤` README mismatch above. Completed Vitest summaries: **96 files,
   3,542 passed / 1 failed / 1 todo**. The access-router package was not reached.
   Log: `_tmp-dpv/dpv06-test.log`.
4. `pnpm lint` — **passed**. Log: `_tmp-dpv/dpv06-lint.log`. Later new reviewer
   test receives focused/final lint and formatting checks below.
5. After the three tiny README corrections, reran the exact root test command
   with a **3,600,000 ms** tool timeout. Before timeout, **30 completed Vitest
   runs / 520 passed file executions / 14,101 passed tests / 1 todo** were recorded,
   with **no failed or skipped test in those completed summaries**. These are
   lane totals, not a claim of whole-workspace completion. Access-router completed
   **124 files / 3,122 tests passed**, duration **1,028.36 seconds**, including the
   final V4 consumer cases and all delivered DPV suites. The tool then terminated
   the root run during access-router-react's `typecheck:test` command
   (`tsc --noEmit -p tsconfig.test-typecheck.json`); root reported SIGTERM. No
   TypeScript diagnostic establishes a source defect there. **V5 test is incomplete,
   not passed**, and no baseline/environment cause is asserted. Log:
   `_tmp-dpv/dpv06-test-final.log`. Process inspection confirmed no test/build
   worker remained before running the next probe. DPV-09 tracks completion.
6. Added meaningful independent regressions in
   `packages/access-router/test/virtuals-populate-dependencies.review.test.ts`, then
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts`
   — **1 file / 12 failed / 0 skipped or todo**, duration **3.84 seconds**. Eight
   failures reproduce DPV-07 and four reproduce DPV-08, in lean and hydrated modes.
   All reach the required output assertions after successful service results and
   (where configured) the expected private computed value; these are not swallowed
   getter assertions. Log: `_tmp-dpv/dpv06-review-probes.log`. Retained as active
   failing regressions for correction, not skipped or weakened. Subsequent edit
   to this test is formatting-only.
7. Focused ESLint passed for the new review test. The three README formatting
   checks passed; the test's initial formatting check required only a wrapped
   method chain, corrected with `apply_patch`. `git diff --check` and the new
   review test's `git diff --no-index --check -- /dev/null <path>` passed. Final
   formatting/integrity results are recorded after the handoff task definitions.
   No production source/type change invalidated the passing DPV-05 server
   typecheck; its exact source evidence and declaration builds remain applicable.

Reviewer-owned changed files: this task record, the new 12-case review suite, and
the three one-comparison OIDC README corrections. Prior DPV-00..05 changes are
preserved. No staging, commits, reverts, publishing, dependency upgrades or manual
dist edits occurred. DPV-00..05 retain their historical completed statuses;
DPV-06/overall completion is explicitly withheld for the requirements below.

#### Historical DPV-06 resumed correction review disposition

The **same independent reviewer** resumed after coordinator-reviewed DPV-07/08
implementation. Independently inspected the complete new `model-service-intent`
module and its 52-case suite; the 120-case guard suite; actual changes to service,
public-service, base include admission/preflight, related capture, dedicated child
admission, execution intent/derivation, Core and model-service-owner; and the small
DPV-08 snapshot fallback correction. Unchanged raw dependency/cache/mask/lifecycle
implementations retain the earlier full independent review; these corrective
changes were examined at their integration boundaries rather than duplicating that
source review.

- **Original DPV-07 finding accepted as corrected:** actual caller/default values
  are resolved and independently copied before source/identifier/target awaits;
  direct/prepared/public/branch/default/include/child paths carry owned intent.
  Mutation implicit keys/tasks and template select behavior are retained. Existing
  `deepIsolateValue` handles Date/RegExp/Buffer/BSON query leaves without JSON
  conversion, and authorization remains in its separate execution transport.
  Captured ordinary target configurations/defaults and target preflight metadata
  precede suspension. All **eight** original intent regressions pass unchanged.
- **Original DPV-08 finding accepted as corrected:** the operation-only default
  subtree is owned at capture only when the stored parent is undefined; the
  resolver supplies its exact access fallback while retaining stored exact →
  default → bare precedence, explicit denial and defined-parent blocking. No live
  target lookup was restored. All **four** original guard regressions pass
  unchanged, including no-feature configurations and both hydration modes.
- **New required findings prevent final acceptance:** include admission's new
  AsyncLocalStorage override is inherited by an independent nested Core check
  inside its guard (DPV-10); public read/readFilter fallback still admits against
  live source list policy after suspension (DPV-11). The original fixes are not
  silently downgraded or reverted; these separately owned corrections preserve
  the frozen authority/capture contract. Concurrency and explicitly captured nested
  include controls pass at persistence/hook limit one, isolating the first defect
  to the independent nested dispatch rather than an unproven scheduler failure.

**Disposition: changes required again; no signoff.** New meaningful regressions in
`test/virtuals-populate-dependencies.capture-boundaries.review.test.ts` reproduce
both issues against the normally built public ESM runtime. All assertions are
outside getter error suppression. The two include leakage cases report the actual
wrong grant, a second stale guard invocation, successful related output and one
virtual getter where the independent check should deny admission. The eight
fallback cases cover both rule replacement directions and verify a later call
does observe the changed rule. No production implementation was changed by this
reviewer. Assign fresh corrective implementers sequentially to DPV-10 then DPV-11,
with coordinator review, then resume this independent reviewer.

### Task DPV-07: Own effective public query intent before asynchronous work

Status: completed — corrective implementation and scoped checks passed; coordinator review and final independent DPV-06 acceptance completed.

Kind: defect

Priority: P1 — immutable original selection/population is a controlling A2/A3/D4 requirement.

Dependencies: DPV-05; discovered by DPV-06 (does not depend on DPV-06 completion).

Primary ownership: a fresh corrective implementation agent assigned by the
coordinator; service/public-service/defaults/prepared-execution argument ownership
and the retained independent review regressions. Preserve other DPV changes.

Finding/reproduction: `findOne` and `find` retain caller args until after
`prepareModelQuery` awaits. Pausing `baseFilter.read/list`, then adding `account`
to a previously `['eligible', '-_id']` selection causes its ID to be returned.
Mutating an ordinary populate select from `['name', '-_id']` to include `balance`
during that pause exposes `account.balance`, although it originally belonged only
to the private computation. Replacing assigned `service.defaults` during the
pause likewise changes response eligibility. All **eight** retained cases fail
at the output-shape assertion in both hydration modes; the private virtual still
computes the expected value. This violates captured intent, not target tenant or
field authorization; readable-but-unrequested fields must remain unrequested.

References: `src/services/service.ts` (`findOne` around 1309-1325,
`findOnePrepared` around 1341/1372, `find` around 1590-1605,
`findPrepared` around 1626-1667, `genExecutionPopulate` around 874/932);
`src/services/model-service-defaults.ts`; `src/acl/prepared-query.ts`;
A2/A3, D4.1 and D4.3.

Requirements:

1. Resolve and deep-own effective query/public selection/population intent,
   including server runtime/service defaults and effective populate access,
   synchronously before the first await. Retain that owned intent through the
   planner/fetch/finalizer instead of rereading caller bags or assigned defaults.
2. Capture ordinary descriptors/target configurations and selected source getter
   candidates against the same intent. Late mutation must not add a target path,
   widen a target mask, replace match/access or trigger live uncaptured policy.
3. Audit all approved direct/public/root/trusted read, mutation/implicit-returning,
   template, include and dedicated-child seams for this ownership requirement;
   preserve their default buckets, access matrix, `new` select behavior and
   successful-write semantics. Do not add caller authority or mutate caller args.
4. Later calls must observe intentionally replaced defaults/options; an in-flight
   call must retain its original output/authorization masks and exact ref decision.

Observable acceptance:

- All eight `DPV-06 frozen public intent` regressions pass: originally hidden refs
  stay absent, public `name -_id` stays name-only, and private computation is intact.
- Meaningful mutation/default/populate descriptor cases verify the remaining
  affected entry seams; private input union never widens original public output.
- No access/visibility/write admission or no-feature response semantics regression.

Verification: run the retained review suite (DPV-08 cases remain separately
required), focused affected defaults/direct/mutation/related/subdocument suites,
server typecheck, ESLint, formatting and patch checks. Record exact outcomes;
coordinator review precedes DPV-08 and final reviewer resumption.

#### DPV-07 corrective implementation evidence and handoff

Owner: fresh DPV-07 corrective implementer (self-review, not independent final
signoff). Read root `AGENTS.md`, task conventions, frozen D1-D4, the DPV-06 findings
and DPV-07/08/09 criteria; checked the TypeScript package guidance. Set DPV-07 and
overall status `in_progress` before production work. Initial worktree contained
**34 tracked modified / 13 untracked** intentional DPV-00..06 paths. Preserved
that work and the reviewer-owned 12-case suite without editing its assertions.
No concurrent build/test worker was observed; all builds/tests below ran serially.

**Architecture / per-call ownership:**

- Added package-private `src/services/model-service-intent.ts`. It resolves the
  existing args/options buckets synchronously, including the historical by-ID →
  one-method fallback, then owns the effective values with `deepIsolateValue`.
  Native Date/Buffer/RegExp/BSON query values and function semantics use the existing
  utilities; no JSON cloning, model cloning, or authorization-handle cloning.
- `withExecutionQueryIntent` retains that owned value with authenticated service
  execution state. Direct find/findOne/findById/create/updateOne/updateById and
  both trusted upsert branches capture it before identifier, parser, filter or
  persistence awaits. Prepared output consumes this value. Private helper dispatch
  without an attached intent resolves only against its already-captured defaults
  and permission posture, never a newly assigned service bag.
- Public list/read/readFilter capture the public → internal default chain before
  awaits. Fallback executions retain the intent while their existing access triple
  changes; readFilter also owns its predicate for the retry. Public create/update/
  upsert own public selection/tasks for their later decorators and picks. Implicit
  `returningAll: false` keys are captured once, rather than recomputed after awaited
  work. Root model dispatch reaches these same public entries. The existing
  create/read/create, update/read/update and read-to-list mappings are preserved.
- Ordinary descriptors (including nested select/match/access and descriptor-array
  additions/replacements) are owned before target capture. Includes recursively
  resolve and own target args/options/defaults with target configuration at source
  entry, including nested defaults; association symbols remain private. Explicit
  `populate: []` still suppresses defaults. Upsert captures both possible branch
  default target sets before lookup and executes only the taken branch's intent.
- Dedicated child admission owns its selection/populate options before parent
  gates/identifiers/rows await; list filters and create ordering are likewise owned.
  Existing pre-captured child output and visibility stages serve read/list/create/
  update/bulkUpdate. The raw-parent helper is not a finalized dependency-output
  stage. `new` already captures its plan/policies and permission option before its
  first await; the new regression verifies ignored `args.select`, captured private
  target read, materialized refs, replacement on the next call and no insert.

**Justified necessary scope expansion:** a service-only argument copy left include
admission and include-path preflight live after source suspension. Extended
`src/services/base.ts` to validate against captured source/nested target metadata
and to admit includes with their captured effective operation guard/permissions.
The private owner context in `src/acl/model-service-owner.ts` and a small
`src/core.ts` read retain the existing `Core.isAllowed(model, access)` dispatch
contract while binding that call to the captured guard, exact core/model/access
and actor. There is no public option or request-permission replacement. The
include gate is resolved with the existing runtime resolver synchronously during
descriptor capture. **The ordinary-populate `genExecutionPopulate` gate and
`getCapturedAuthorizationOption` fallback are not corrected here:** DPV-08 remains
required and its four regressions remain active failures.

**Owned changed paths** (paths below are relative to `packages/access-router`):

- New `src/services/model-service-intent.ts` and
  `test/virtuals-populate-dependencies.intent.test.ts`.
- `src/services/service.ts`, `src/services/public-service.ts`,
  `src/services/base.ts`, `src/services/model-subdocument-service.ts`, `src/core.ts`.
- `src/acl/model-output-planning.ts`, `src/acl/model-service-owner.ts`,
  `src/acl/related-execution.ts`, `src/acl/service-authorization.ts`,
  `src/acl/service-execution.ts`, `src/acl/subdocument-authorization.ts`.
- This task record. Public method/type signatures and package exports remain
  compatible; the emitted declarations and server typecheck pass.

**Regressions / corrections:** the new suite now has **52 tests**, in lean and
hydrated variants. It exercises direct/by-ID/public reads, identifier and source/
target-hook suspension, all mutation/upsert entry/branch forms, implicit returning
keys/tasks, mutable assigned and replaced runtime defaults, target masks/policies,
added/replaced descriptors, native Date/Buffer match values, read/list includes,
template configuration replacement, frozen caller bags and dedicated child
selection/filter/ordering. Assertions run on successful returned results, not
inside swallowed getters; writes are checked in persistence where relevant.

- Before production edits, the initial **28-case** expansion against the retained
  built public ESM had **2 passed / 26 failed**. **24 failures** reproduced intent
  widening; **2** exposed a fixture error (`children.sub: true` instead of explicit
  child field rules), not a product finding. Corrected that fixture to its actual
  scoped schema. Evidence: `_tmp-dpv/dpv07-expanded-before.log`. The reviewer's
  original eight before-fix failures remain recorded in DPV-06.
- First corrective focused run: **34 passed / 2 failed / 4 name-filtered**; the two
  failures were that child fixture. After its correction and scope expansion the
  then-current suite plus retained intent cases passed **56 / 4 name-filtered**.
- Initial affected run: **692 passed / 7 failed** in 16 files. Six assertions required
  the existing `Core.isAllowed` dispatch; one required the original one-argument
  helper invocation when no authorization was supplied. Corrected production
  dispatch and optional-argument forwarding; no existing test was weakened. The
  final affected rerun below passes all 751 tests. Intermediate logs reused the
  final log names; the counts here record the actual earlier outcomes.

**Exact verification commands/results** (repository root; `<repo-root>` was quoted
and replaced with the checkout path when executed):

1. Verified existing temp parents with
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/packages/access-router/test'`
   and `git check-ignore -v` for each new `dpv07-*.log` name; `.gitignore:8:_tmp*`
   matched. All logs/fixtures use the ignored repo-local directory.
2. Expanded before-fix command:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.intent.test.ts
   ```

   Result: initial 2/26 outcome above; retained before-fix log named above.

3. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed twice**, after
   successive production corrections; five selected/transitive packages built JS
   and declarations. Latest standalone log: `_tmp-dpv/dpv07-build.log`.
4. Intermediate focused command:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.intent.test.ts -t 'DPV-06 frozen public intent|DPV-07'
   ```

   Outcomes/corrections above. Latest intermediate log `_tmp-dpv/dpv07-tests.log`
   has **2 files / 56 passed / 4 name-filtered** (before the last four new cases).

5. Initial affected command (the seven dispatch-contract failures above):

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-defaults.integration.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.parity.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/operation-access-boundaries.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts
   ```

6. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed on final
   production source**, including a fresh serialized five-package closure build
   followed by `tsc --noEmit -p tsconfig.typecheck.json`. Log:
   `_tmp-dpv/dpv07-typecheck.log`. Final runtime checks below use this fresh output.
7. Final affected run, including the completed new suite:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-defaults.integration.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.parity.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/operation-access-boundaries.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/virtuals-populate-dependencies.intent.test.ts
   ```

   **17 files / 751 passed / 0 failed, skipped or todo**, duration **148.36 s**.
   Includes the 52 new cases and all 699 existing affected cases. Log:
   `_tmp-dpv/dpv07-affected.log`.

8. Final retained intent-only verification:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts -t 'DPV-06 frozen public intent'
   ```

   **1 file / 8 passed / 4 name-filtered**, duration **3.38 s**; those four are the
   separately owned DPV-08 cases, not test-source skips. Log:
   `_tmp-dpv/dpv07-final-intent.log`.

9. Full retained review suite, to establish the residual finding accurately:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts
   ```

   **1 file / 8 passed / 4 failed / 0 skipped or todo**, duration **3.72 s**. Exactly
   the four `DPV-06 captured ordinary guard equivalence` assertions still return an
   ID instead of requested name-only population, with/without private declarations
   in both hydration modes. This command is **not a pass**. Log:
   `_tmp-dpv/dpv07-review-full.log`.

10. Focused lint/formatting on all 13 owned TypeScript source/test files:

    ```sh
    node_modules/.bin/eslint packages/access-router/src/services/model-service-intent.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/services/base.ts packages/access-router/src/core.ts packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/subdocument-authorization.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/test/virtuals-populate-dependencies.intent.test.ts
    node_modules/.bin/prettier --check packages/access-router/src/services/model-service-intent.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/services/base.ts packages/access-router/src/core.ts packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/subdocument-authorization.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/test/virtuals-populate-dependencies.intent.test.ts docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md
    git diff --check
    git diff --no-index --check -- /dev/null packages/access-router/src/services/model-service-intent.ts
    git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-populate-dependencies.intent.test.ts
    ```

    Final checks **passed**; initial formatting-only findings were corrected with
    `apply_patch`. The Vite future-config-loader notice remains nonblocking.

**Handoff:** DPV-07 acceptance is satisfied: **759 distinct focused tests pass**
(751 affected + 8 retained intent), source/type/default/visibility behavior is
covered, and the full retained review suite isolates exactly DPV-08's four active
failures. DPV-08 should keep the ordinary-populate gate captured while restoring
exact runtime-default fallback; it may reuse the include-only captured-dispatch
pattern but must not replace the ordinary gate with a live Core lookup. Keep all
reviewer assertions and the new intent suite active. Coordinator review precedes
the fresh DPV-08 implementer; DPV-09/final reviewer owns the final workspace and
applicable installed-consumer gates after that correction. DPV-06 remains blocked
until those prerequisites and independent signoff complete; overall status remains
`in_progress`. No task completion or workspace passing claim is made for DPV-08/09.

Final worktree: **40 tracked modified / 15 untracked** intentional paths, with the
initial DPV changes preserved. No staging, commits, reverts, publishing, dependency
upgrades, or manual dist edits occurred. No full-workspace build/test/lint rerun was
needed for DPV-07; its final gate remains DPV-09.

### Task DPV-08: Preserve ordinary populate guard fallback in captured policy

Status: completed — corrective implementation and scoped verification passed; final independent DPV-06 acceptance completed.

Kind: defect

Priority: P1 — the public guard change alters existing no-feature output behavior.

Dependencies: DPV-07 (sequential corrective execution); discovered by DPV-06.

Primary ownership: a different fresh corrective implementation agent assigned by
the coordinator; captured model/related operation policy and public populate gate,
with focused operation-boundary/defaults regressions.

Finding/reproduction: set the runtime's exact `operationAccess.read` default to
true and clear the target's stored `operationAccess` to undefined using its public
setter. Existing `getModelOption(..., 'operationAccess.read')` and
`Core.isAllowed(target, 'read')` both return true. The new ordinary population gate
uses `getCapturedAuthorizationOption` on a configuration containing only the
undefined stored parent, without the runtime's exact-default fallback, so the
target is skipped and the response contains an ID instead of requested name-only
population. **Four** retained cases fail in lean/hydrated modes with the feature
both enabled and completely absent. When enabled, the separate private target
read correctly uses that fallback and computes, demonstrating the inconsistency.

References: `src/services/service.ts:913-920` changed frozen public guard;
`src/acl/model-output-planning.ts` capture/getCapturedAuthorizationOption;
`src/runtime.ts:955-969` existing resolver fallback;
`src/acl/virtual-populate-dependencies.ts:250-263` terminal read capture;
`test/operation-access-boundaries.integration.test.ts` changed guard assertions.

Requirements:

1. Capture the effective ordinary target operation guard with the same exact →
   default → bare and exact-runtime-model-default semantics as the existing Core
   resolver, before awaits. Do not restore live Core option lookup after capture.
2. Preserve explicit denial, custom access, related operation grants, request actor
   and permissions, route-variant non-involvement and hook admission bounds.
   The private request-read policy remains independent of ordinary related grants.
3. Keep snapshot coherence under in-flight default/target option replacement;
   later calls observe replacement. No synthetic public/private authority sharing.

Observable acceptance:

- All four `DPV-06 captured ordinary guard equivalence` regressions pass, with
  ordinary requested `name -_id` population both with/without private declarations.
- Focused exact/default/bare/undefined/false and live-replacement cases prove real
  semantic equivalence, rather than only changing call-spy assertions.
- Existing operation-boundary and related-authority suites retain their data,
  denial and zero-target-work assertions; configurations without this feature pass.

Verification: retained review cases, operation-access-boundaries and related/
defaults/configuration suites, server typecheck, ESLint, formatting and patch
checks. Then hand back to the coordinator and independent DPV-06 reviewer.

#### DPV-08 corrective implementation evidence and reviewer handoff

Owner: fresh DPV-08 corrective implementer, implementation self-review; independent
DPV-06 approval remains separate. Read the complete frozen D1-D4, DPV-06 findings,
DPV-07 correction/handoff, DPV-08/09 criteria, root `AGENTS.md` and task conventions.
Set DPV-08 `in_progress` before production work. Preserved the initial **40 tracked
modified / 15 untracked** intentional paths, including the reviewer-owned 12-case
suite and DPV-07 intent/owner/dispatch changes. Builds/tests ran serially in the
coordinator's exclusive window. Blockers: none for DPV-08.

**Small captured-option correction:** changed only
`packages/access-router/src/acl/model-output-planning.ts` in production. When the
stored `operationAccess` parent is undefined, configuration capture now owns that
runtime's operation-default subtree as `operationAccessDefaults`. The existing
configuration copier owns arrays/records and preserves guard-function identity.
`getCapturedAuthorizationOption` supplies the **exact access path** from that data
as the operation resolver's final fallback. All resolution uses captured values;
there is no post-await registry lookup. Other option families keep their resolver.

This preserves stored exact → stored default → stored bare precedence. A defined
parent, including `{}` or an unrelated sibling, blocks runtime fallback. A runtime
`default` or bare rule is not substituted for an absent exact runtime access.
Explicit false, string/array/function rules and trusted custom accesses retain
their data/denial behavior. The ordinary guard still runs in the existing hook
gate with captured permissions and the original request actor. Related operation
grants still apply only to ordinary output, independently of target row scope;
terminal private reads keep request-mode read operation/rows and no public grants.
DPV-07's include `Core.isAllowed` captured dispatch, `model-service-intent` and
`withExecutionQueryIntent` are preserved without edits. No public type or config
surface was widened, and no source-wide operation grant was introduced.

**Owned changed paths:** the production file above; new
`packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts`;
and this task's status/evidence. The reviewer-owned
`test/virtuals-populate-dependencies.review.test.ts` is unchanged.

**Meaningful regression coverage:** the new suite has **120 cases**, all through
the normally built public ESM runtime, with output/query/getter assertions outside
getters. Both hydration modes run with private dependencies enabled and absent:

- **76** table cases compare actual ordinary population to existing Core admission
  for exact/default/bare/undefined/false, permission strings/arrays, defined-parent
  blocking and custom accesses. Positive public/private read scopes share one find;
  denied targets do zero work unless the independent private read is admitted.
  Returned public targets remain exactly `name -_id`, with private fields stripped.
- **16** function-rule cases cover stored exact/default/bare and exact runtime
  fallback. They verify request `this`, permission arguments, expected ordinary/
  private guard counts, zero route-variant calls and completion at persistence/hook
  concurrency one.
- **16** suspended-source replacement cases cover allow → deny and deny → allow
  for runtime defaults and stored target options on the **same service instance**.
  In-flight population/private computation retain the captured rule; a later call
  observes replacement. A live Core check during suspension confirms the update
  is real while the earlier call remains frozen.
- **12** authority negatives cover source-only grants, related operation grants
  under request/scope/unrestricted public rows, terminal private base denial and
  different-tenant private scope. Public row replacement cannot admit private read
  or supply private rows. Query/getter counts prove no work on terminal denial and
  distinct public/private queries for incompatible tenant predicates.

**Exact commands/results** (repository root; `<repo-root>` was replaced with the
checkout path at execution):

1. Verified existing parents with
   `ls -ld '<repo-root>' '<repo-root>/_tmp-dpv' '<repo-root>/node_modules' '<repo-root>/packages/access-router'`
   and `git check-ignore -v` for each new `dpv08-*.log` path;
   `.gitignore:8:_tmp*` matched. Used the existing ignored `_tmp-dpv` for logs and
   `TMPDIR`; no standalone temporary fixture was created. Node `v26.12.1`, pnpm
   `11.18.0`; no dependency installation/change was needed.
2. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, fresh
   five-package transitive JS/declaration baseline. Log:
   `_tmp-dpv/dpv08-baseline-build.log`.
3. Before production edits:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts
   ```

   **2 files / 100 passed / 24 failed / 0 skipped or todo**, duration **18.30 s**.
   The unchanged review suite had **8 passed / exactly 4 guard failures**. The new
   suite's initial 112-case form had **92 passed / 20 failed**, all at expected
   ordinary populated-output assertions after successful service admission. This
   independently reproduces boolean/array/function/custom exact-default fallback
   failures while retaining passing denial/row-independence baselines. Log:
   `_tmp-dpv/dpv08-before.log`. Final tests split the two replacement directions
   into separate cases and explicitly reuse one service; no assertion was weakened.

4. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed** on final
   production source. Its script performed the fresh serialized **five-package
   closure JS/declaration build**, followed by
   `tsc --noEmit -p tsconfig.typecheck.json`. Log:
   `_tmp-dpv/dpv08-typecheck.log`. No production edit followed that build.
5. Final focused verification on that fresh output:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts test/virtuals-populate-dependencies.intent.test.ts test/operation-access-boundaries.integration.test.ts test/operation-access-baseline.contract.test.ts test/service-authorization-related.integration.test.ts test/service-defaults.integration.test.ts test/virtuals-populate-dependencies.config.test.ts test/virtuals-config.contract.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.planner.test.ts test/virtuals-populate-dependencies.parity.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-subdocument-policies.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-final-review.integration.test.ts
   ```

   **16 files / 803 passed / 0 failed, skipped or todo**, duration **182.09 s**.
   This includes all **12 retained independent review regressions**, **120 new
   guard cases**, DPV-07's **52 intent cases**, existing operation/default/related
   contracts, private capture/planning/integration/parity and dedicated-child
   authorization. Log: `_tmp-dpv/dpv08-focused.log`. Vite's existing future native
   config-loader notice is nonblocking.

6. Focused checks passed on final source/tests:

   ```sh
   node_modules/.bin/eslint packages/access-router/src/acl/model-output-planning.ts packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts
   node_modules/.bin/prettier --check packages/access-router/src/acl/model-output-planning.ts packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md
   git diff --check
   git ls-files --others --exclude-standard -z | xargs -0 -n1 git diff --no-index --check -- /dev/null
   ```

   Log: `_tmp-dpv/dpv08-checks.log`. Initial formatting-only findings were
   corrected with `apply_patch`. Whitespace checks cover all untracked work,
   including the new suite and preserved reviewer test. Final status/diff review
   confirms **40 tracked modified / 16 untracked** intentional paths, with the
   initial work preserved and `git diff --name-only --cached` empty. Task
   formatting/patch checks pass after this evidence update.

**Disposition / independent handoff:** DPV-08's observable acceptance and required
focused gates pass. No corrective blocker remains for this task. DPV-06 stays
**blocked** and the overall feature stays **in_progress** pending DPV-09's complete
V5 run, applicable final V2/V4 evidence and independent acceptance/signoff. The
reviewer should verify the operation-only exact-default snapshot seam and reuse
the commands/logs above for the retained regressions; DPV-07's captured include
dispatch and private/public policy separation remain intact. Final workspace
verification belongs to DPV-09 after coordinator review. No agents, staging,
commits, reverts, publishing, dependency changes or manual dist edits occurred.

### Task DPV-09: Complete final integrated verification after review corrections

Status: completed — exclusive final build, whole-workspace test, lint, source typecheck and current installed-surface evidence pass.

Kind: investigation

Priority: P1 — partial passing workspace output cannot satisfy final verification.

Dependencies: DPV-07, DPV-08, DPV-10, DPV-11.

Primary ownership: coordinator schedules an exclusive build/test window; the
independent DPV-06 reviewer executes/verifies the final gates on corrected source.

Finding: the independent exact root test rerun completed 14,101 passing tests and
one todo in 30 summarized lanes, including all 3,122 access-router tests, but the
3,600-second tool limit terminated it during access-router-react test typechecking.
The react lanes and any later scripts have no completion evidence in that run.
This is an interrupted verification, not a demonstrated product/environment defect.

Requirements / observable acceptance:

1. After corrective builds and focused tests pass, run final `pnpm build`,
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm test`, and `pnpm lint` serialized, with a
   timeout sufficient for the observed complete workspace (longer than 3,600,000 ms).
   Verify all scripts finish; no fail-fast or timeout output may be called a pass.
2. Run the final server typecheck and V4 where corrective changes invalidate their
   current evidence. Reuse other exact applicable successful gates rather than
   repeating unchanged documentation/website builds without cause.
3. Reconcile all active review regressions, exact passing/failed/skipped/todo counts,
   dependencies, full final diff and definition of done. Report real environment
   blockers with explicit prerequisite ownership; do not invent a baseline cause.

Verification: V5 and applicable V2/V4; record exact completed outcomes/log paths
and then resume independent DPV-06 acceptance/signoff. This task does not authorize
changes to downstream package behavior, test thresholds or dependency versions.

#### Historical DPV-09 first resumed independent execution

Reviewer: the same independent DPV-06 final reviewer, not a DPV-07/08 corrective
implementer. Reread actual corrective task evidence and current worktree state;
set DPV-09 `in_progress` before correction review/gates. Initial resumed status is
**40 tracked modified / 16 untracked** intentional paths. Root instructions and
task conventions still apply; no new applicable nested `AGENTS.md` exists. Reused
the already-loaded package-surface guidance. Confirmed `_tmp-dpv` parent and each
new ignored log path (`.gitignore:8:_tmp*`). The coordinator provides an exclusive
build/test window; DPV-06 remains blocked until correction acceptance and every
required final gate completes.

**Actual resumed checks and evidence:**

1. `pnpm build` — **passed, exit 0**, root scope **31 of 32 workspace projects**,
   including all normal package JS/declaration output and downstream examples.
   Log: `_tmp-dpv/dpv09-build.log`. No generated output was edited manually.
2. Added the independent 14-case capture-boundary suite, then ran:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts
   ```

   Initial run: **2 files / 16 passed / 10 failed / 0 skipped or todo**, duration
   **6.82 seconds**. Strengthened only the new failure observations to report
   guard/result/getter counts together and to assert the later fallback call
   before the in-flight result; reran that exact command. Final: **2 files /
   16 passed / 10 failed / 0 skipped or todo**, duration **7.40 seconds**. The
   original review file is unchanged and its **12/12** cases pass. The new suite
   is **4 passed / 10 failed**: four successful concurrent/explicit-nested-include
   controls, two DPV-10 failures, eight DPV-11 failures across both receiving
   hydration modes. Log: `_tmp-dpv/dpv09-review-probes.log`. These are required
   behavioral failures, not fixture, environment, or preexisting-failure claims.

3. After the test command ended, `pnpm lint` — **passed, exit 0**. Log:
   `_tmp-dpv/dpv09-lint.log`. Focused ESLint and Prettier for the new suite also
   passed. Build/test/lint were serialized; no other build/test worker was started.
4. `git diff --check` and
   `git ls-files --others --exclude-standard -z | xargs -0 -n1 git diff --no-index --check -- /dev/null`
   — passed for the corrected existing work and all **17** untracked files.
   Staging remains empty. Final status and focused task/new-suite Prettier/patch
   checks also passed after recording the new prerequisites. The task's sole
   formatting issue was a missing blank line in this evidence list, corrected
   with `apply_patch`.
5. **Final root `pnpm test`, independent server typecheck, and V4 were not run in
   this resumed pass:** the new required regressions block signoff and the user
   instructed return for fresh implementers on substantive findings. The earlier
   one-hour root run is still incomplete; it is not promoted to a pass. Final
   source typecheck and actual installed-consumer V4 evidence must be refreshed
   after the new corrections; DPV-05's pre-correction 129-test evidence is not
   final evidence for the corrected services. DPV-08's scoped 803-test/source-check
   record remains implementation evidence, not this reviewer's final V5/V4 run.
   The next exclusive root test must be allowed **at least 7,200,000 ms**, or a
   documented sequential foreground strategy that verifies every script's exit.
   No tool-timeout limitation was tested or claimed in this resumed pass.
6. Website inputs and the three OIDC README synchronization fixes are unchanged
   from their recorded passing verification. Reuse the exact DPV-05 website build
   evidence from its own workspace. Public API/declaration shape remains inspected,
   but actual final packed runtime/type workflows remain a required gate above.

Resumed reviewer-owned changes: this task's statuses/review/evidence and the new
`packages/access-router/test/virtuals-populate-dependencies.capture-boundaries.review.test.ts`
only. Initial **40 tracked modified / 16 untracked** paths are preserved; the new
suite yields **40 tracked modified / 17 untracked**. No source implementation,
dependency/lockfile, original review assertions, root CHANGELOG or tracked dist
change; no agents, staging, commits, reverts or publishing. DPV-09 and DPV-06 are
**blocked**, not completed.

#### DPV-09 final resumed verification window

The same independent DPV-06 reviewer resumed after fresh, coordinator-reviewed
DPV-10 and DPV-11 corrections. Set DPV-09 `in_progress` before reviewing the actual
one-shot dispatch, conditional fallback admission and empty-include compatibility
change. Initial final-window worktree: **40 tracked modified / 19 untracked**
intentional paths. Preserved all earlier work and both reviewer-owned regression
suites. Rechecked root instructions, applicable task evidence, temp parent and
new ignored `dpv09-final-*.log` paths (`.gitignore:8:_tmp*`). There are no additional
applicable nested instructions. This is the coordinator's exclusive verification
window; final disposition and actual gate evidence follow below.

**Final disposition: completed.** The final full root run finished all scripts
with **exit 0**, not a timeout/partial pass. The same independent reviewer accepted
DPV-10/11, reconciled the earlier DPV-07/08 findings and audited the complete
acceptance/dependency record. No production edit followed the final gates.

**Execution strategy / reproducibility:**

- Rechecked existing repository, package/test and ignored `_tmp-dpv` parents with
  `ls -ld`; `git check-ignore -v` confirmed `.gitignore:8:_tmp*` for every new log,
  supervisor, collection and exit-record path. Commands replaced quoted
  `<repo-root>` at execution; evidence here remains repository-scoped.
- Used a foreground Node supervisor in ignored
  `_tmp-dpv/dpv09-final-test-runner.mjs`. It spawns **exactly one** root
  `TMPDIR='<repo-root>/_tmp-dpv' pnpm test`, preserving the root script's
  `--workspace-concurrency=1` and every package's full test script. It observes
  child close code/signal, writes an exit JSON, and records the descendant process
  tree's elapsed/CPU/RSS/state and output progress every 120 seconds. It does not
  launch another build/test lane, filter tests, retry tests, or modify thresholds.
- The tool call allowed **10,860,000 ms**; the supervisor's explicit bound was
  **10,800,000 ms**. The final child finished in **3,854.300 seconds** with
  `code: 0`, `signal: null`, `deadlineExceeded: false`. Its last process snapshot
  contains no remaining build/test child. Actual invocation for the passing run:
  `node _tmp-dpv/dpv09-final-test-runner.mjs dpv09-final-retry2`.
- Build, root test attempts/diagnostics, lint and final server typecheck were
  serialized in the exclusive window. No concurrent coordinator worker, agent,
  source edit, dependency upgrade, staged change or manual dist edit was added.
  Runtime versions observed: Node **v26.12.1**, repository pnpm **11.18.0**.

**Actual gate results and exact counts:**

1. `pnpm build` — **passed, exit 0**, scope **31 of 32 workspace projects**.
   Normal JS/declaration outputs and downstream examples completed. Log:
   `_tmp-dpv/dpv09-final-build.log`.
2. First exact root test attempt — **failed, exit 1**, **245.022 s**, no timeout.
   Four completed Vitest summaries contained **113 passed / 1 failed file
   executions; 4,160 passed / 1 failed / 1 todo tests**. Failure:
   `packages/express-request-attestation/test/signer-discovery-http.test.ts`,
   Chromium native metadata response-close counters at lines 308/312: opened 5,
   closed/before-EOF 4 instead of 5. The root stopped before access-router.
   Logs: `_tmp-dpv/dpv09-final-test.log`,
   `_tmp-dpv/dpv09-final-process.log`, `_tmp-dpv/dpv09-final-exit.json`.
3. Bounded unchanged-source diagnostic:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-discovery-http.test.ts
   ```

   **1 file / 2 passed**, **2.72 s**. Log:
   `_tmp-dpv/dpv09-attestation-diagnostic.log`. `git diff` for that package was
   empty; no assertion, timeout, worker setting, dependency or source was changed.

4. Conditional full-root rerun — **failed, exit 1**, **241.062 s**, no timeout.
   Same completed-file/test totals and same Chromium test; this time its earlier
   response counter also observed opened 4 / closed 3 instead of 4. Logs:
   `_tmp-dpv/dpv09-final-rerun-test.log`,
   `_tmp-dpv/dpv09-final-rerun-process.log`,
   `_tmp-dpv/dpv09-final-rerun-exit.json`. These attempts remain **failed** evidence.
5. Broader bounded diagnostic:
   `TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/express-request-attestation test:node`
   — **18 files / 618 passed**, **6.25 s**, unchanged full Node lane/configuration.
   Log: `_tmp-dpv/dpv09-attestation-node-diagnostic.log`. This additional success
   established observed intermittency and justified one final full-root attempt;
   no environment, baseline or product cause is asserted.
6. **Final exact whole-workspace root test — passed, exit 0**, **3,854.300 s**.
   **34 completed Vitest lane runs / 573 passed file executions / 15,066 passed
   tests / 0 failed / 0 skipped / 1 todo** (**15,067 total test cases**). File and
   test totals count intentional repeated peer/browser lanes, not unique source
   files. Every root package script finished, including all attestation lanes,
   access-router-react's source/test/NodeNext/Bundler typechecks, React 19 and 18
   runtime lanes, nonruntime/packed lanes and the final react-vite app tests.
   The previous one-hour cutoff is not reused as completion evidence.
   Logs: `_tmp-dpv/dpv09-final-retry2-test.log`,
   `_tmp-dpv/dpv09-final-retry2-process.log`,
   `_tmp-dpv/dpv09-final-retry2-exit.json`.

   The access-router portion is **130 files / 3,490 passed / 0 failed, skipped or
   todo**, **1,154.38 s**. Both unchanged reviewer suites (**26 cases**), all new
   corrective suites, all original feature/no-feature suites and current consumer
   checks ran in that full package invocation. No separate redundant V3/V4
   runtime rerun was needed.

7. After root completion, `pnpm lint` — **passed, exit 0**. Log:
   `_tmp-dpv/dpv09-final-lint.log`.
8. Then `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed,
   exit 0**, including its fresh **five-package** JS/declaration closure build and
   `tsc --noEmit -p tsconfig.typecheck.json`. Log:
   `_tmp-dpv/dpv09-final-typecheck.log`. This is independently executed final
   source verification, in addition to the package's passing strict-typecheck test.

**Fresh installed-surface V4 audit:** root test uses the complete unfiltered
server Vitest include `test/**/*.test.ts`. Its passing run cache records all
**130** files with `failed: false`, including these four consumer suites:

| V4 suite                                | Tests   | Final full-run result | Recorded file duration |
| --------------------------------------- | ------- | --------------------- | ---------------------- |
| `strict-consumer-types.test.ts`         | 26      | passed                | 68,142.044858 ms       |
| `export-contract.test.ts`               | 45      | passed                | 19,063.540337 ms       |
| `documentation-examples.test.ts`        | 48      | passed                | 125,048.018576 ms      |
| `packed-consumer-compatibility.test.ts` | 10      | passed                | 312,301.668592 ms      |
| **Total**                               | **129** | **passed**            |                        |

To audit counts without executing those expensive suites again, ran the
collection-only command after the final typecheck:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest list --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts --json
```

It lists exactly **129** tests in the four files above. Checked the counts against
the successful full-run cache and absence of source skips/todos; collection is
not presented as runtime verification by itself. Evidence:
`_tmp-dpv/dpv09-final-v4-collection.json` and
`_tmp-dpv/dpv09-final-surface-audit.log`. The audit also confirms both reviewer
files' final passing results. The final generated root/advanced `.d.ts`/`.d.mts`
graph, public JSDoc, optional fourth input, explicit cardinality/readonly/partial
types, unchanged persisted/write/public/context types, bundled Node ESM imports
and processors entry were inspected. Tests compile and emit actual transformed
packed consumers in Bundler/NodeNext ESM/CJS and execute the exact README/array
workflows. Minimum peers are Express/Mongoose **5.0.0/8.0.0**; current tested peers
are **5.2.1/9.8.0**, in tarball and artifact-tree layouts. Current peers check full
declarations; minimum peers intentionally skip peer-internal declaration checking.
No public/private executor entrypoint or client dependency authority was added.

**Documentation, limitations and integrity:**

- Website inputs are unchanged since the actual separate-workspace
  `TMPDIR='<repo-root>/_tmp-dpv' pnpm build` in `website/` passed. Reused its exact
  DPV-05 evidence (`_tmp-dpv/dpv05-website-build-passing.log`), not the root filter
  that matched nothing. The shared V4 instructions above now name the correct
  working directory; the historical mistaken command/evidence is retained.
- The one workspace todo is
  `packages/asset-inliner/test/legacy-contract.test.ts:453`, its explicit ASSET-06
  image-replacement placeholder. It is outside DPV coverage; access-router has
  zero skipped/todo tests. Hydrated/lean/native materialization and explicitly
  rejected reference shapes retain their documented limits; there is no claim of
  exhaustive application-plugin or universal byte-for-byte hydration equivalence.
- The two initial Chromium close-counter failures are retained as an observed
  intermittent verification issue, with isolated/full-node/final-root passes on
  unchanged source. Their cause remains unestablished. No downstream test,
  threshold, dependency or source was weakened to obtain the final pass. The
  final full root result satisfies the gate; earlier failures are not relabeled
  as successes or unproven preexisting/environment defects.
- Final tracked/untracked whitespace checks and focused task formatting pass;
  cached/staging diff remains empty. Worktree stays **40 tracked modified /
  19 untracked** intentional paths, exactly the final-window starting paths.
  No source/test change by this reviewer in this final window invalidates gates.
  The only tracked reviewer edit this window is this task's status/evidence and
  corrected website-command guidance; supervisor/log/audit artifacts are ignored.
  Earlier reviewer regression suites and three tiny OIDC README fixes remain
  preserved, with no root CHANGELOG, tracked manifest/lockfile or manual dist edit.
- **No required blocker, corrective task or verification remains pending.**
  DPV-09 and independent DPV-06 are completed; historical incomplete/failed
  checkpoints above are superseded only by the actual final passing evidence.

### Task DPV-10: Confine captured include operation admission to its own dispatch

Status: completed — one-shot dispatch correction, scoped checks, coordinator review and final independent DPV-06 acceptance completed.

Kind: defect

Priority: P1 — an independent nested authorization check must not inherit another call's captured authority.

Dependencies: DPV-08; discovered by resumed DPV-06 (does not depend on DPV-06/09 completion).

Primary ownership: a fresh corrective implementation agent assigned by the
coordinator; `src/acl/model-service-owner.ts`, `src/core.ts`, captured include
admission in `src/services/base.ts`, and the new active review regressions.

Finding/reproduction: DPV-07's operationGuard AsyncLocalStorage remains active
while Core invokes the trusted captured guard. An independent `Core.isAllowed`
call made by that guard for the same core/model/access reads the outer capture
again instead of its own normal current policy. In both hydration modes, the
probe captures the old include guard, pauses source read, replaces the live read
rule with false, confirms an independent caller sees false, then releases. Inside
the captured guard, the nested check unexpectedly returns true, calls the stale
guard a second time and admits related output/private computation. A bounded
fixture reentry branch makes the wrong decision observable without stack overflow.
Actual observations: **nested true / guard calls 2 / success / getter calls 1**;
required: **nested false / guard calls 1 / unauthorized / getter calls 0**.

References: `src/acl/model-service-owner.ts:16-40`;
`src/core.ts:793-794`; `src/services/base.ts:770-778`;
`test/virtuals-populate-dependencies.capture-boundaries.review.test.ts`
(`DPV-06 include guard ownership`); A4/D4.1/D4.5 and DPV-07 ownership requirements.

Requirements:

1. Keep the include's existing Core.isAllowed dispatch seam and captured guard,
   actor/permissions, but confine the override to the one intended admission
   dispatch. Invoking trusted guard code must not implicitly lend its captured
   authority to new independent Core calls or async descendants.
2. Preserve exact core/model/access ownership, concurrent call isolation and
   explicitly nested include captures; do not restore live lookup for the outer
   captured include or change public Core method signatures.
3. Preserve related operation grants, source/target policy separation and the
   current hook/persistence bounds, including nested completion at limit one.

Observable acceptance:

- Both independent-nested-Core review cases deny the fresh nested call and invoke
  the old captured guard once; no target getter executes after its denial.
- All four passing concurrent/explicit-nested-include controls remain passing.
- Add focused different-core/model/access and async-boundary checks where needed
  to prove the override is dispatch-owned rather than ambient authority. Existing
  include/related/operation dispatch contracts and original 12 review cases pass.

Verification: retained capture-boundary/include tests, DPV-07 intent suite,
operation-boundary/related/provenance/hook-ownership suites, source typecheck,
ESLint/formatting/patch checks. Coordinator reviews the correction before a fresh
DPV-11 implementer and final reviewer resumption. Preserve failing assertions;
do not make independent Core calls inherit capture by changing the contract.

#### DPV-10 corrective implementation evidence and handoff

Owner: fresh DPV-10 corrective implementer (self-review, not independent final
signoff), resumed after the user renewed continuation following the tool-limit
interruption. Read root `AGENTS.md`, task conventions, frozen D1-D4, DPV-07's
owner/dispatch handoff and resumed reviewer evidence/DPV-10 criteria. Set DPV-10
`in_progress` before new tests or production work. Initial worktree contained
**40 tracked modified / 17 untracked** intentional paths; preserved all of them,
including both reviewer-owned suites. The user confirmed an exclusive build/test
window; all builds/tests below ran serially.

**Correction:** `src/acl/model-service-owner.ts` now carries the captured guard in
a one-shot dispatch slot. `consumeCapturedModelOperationGuard` clears that slot
at Core admission entry, before evaluating either the matching captured guard or
an unmatched dispatch's normal guard. Matching still requires the exact
core/model/access. Only that intended call retains the captured rule and original
permissions in its local evaluation; independent synchronous/awaited calls and
suspended descendants receive no reusable capture. Explicit nested includes create
their own AsyncLocalStorage slot and cannot restore an already-consumed outer
slot. `src/core.ts` calls this consumer before `evaluateRouteGuard`.

The production change is confined to those two files. The existing
`Core.isAllowed(model, access)` dispatch/API and `services/base.ts` include
admission/hook gate are retained. The model service's separate async owner and
option-dispatch capture remains intact. No live outer include lookup, new caller
authority, source/target policy global, or admission-semantics change was added.

**New focused regressions:**
`packages/access-router/test/virtuals-populate-dependencies.dispatch.test.ts`
contains **16 cases** across lean/hydrated receiving modes:

- Independent same-model/access checks before any await and after a full awaited
  event-loop turn observe live denial, while different-model/access checks also
  retain their normal decisions. The old captured guard runs once with the original
  request and permission set; denial executes no target getter.
- Two distinct guards suspended concurrently on the same core/model/access each
  retain only their intended call and deny their own independent nested check.
- An explicitly nested include establishes a different captured function under
  hook/persistence concurrency one. Its own fresh Core check and the resumed
  outer guard's fresh Core check both see live denial; both explicit captures
  still admit their intended output and compute only their authorized virtuals.
- Descendants suspended beyond successful return, synchronous throw or rejected
  promise cannot reuse capture. Failures propagate unchanged, a later include
  observes replacement, and getters run only for successful admissions.
- Concurrent reader/guest requests have distinct cores and original permission
  sets. Each suspended nested check sees live denial; only the reader's captured
  guard admits its own output, and a later request observes the replacement.

**Actual verification** (repository root; quoted `<repo-root>` was replaced with
the checkout path at execution; stdout/stderr retained in the named ignored logs):

1. Verified the existing repository/temp/package parents with `ls -ld`, then
   `git check-ignore -v` for every new `dpv10-*.log` path. The parent exists and
   `.gitignore:8:_tmp*` matches all logs; `TMPDIR` uses this repo-local directory.
2. Before changing production source, ran:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.dispatch.test.ts -t 'keeps independent same/different-model/access'
   ```

   **1 file / 4 failed / 12 name-filtered**, duration **3.01 s**. Both scheduling
   boundaries in both hydration modes observed `[false, false, true]` instead of
   `[false, false, false]`: the same-core/model/access check inherited stale
   admission. This is a meaningful before-fix product failure, consistent with
   the unchanged reviewer's original two failures. Log:
   `_tmp-dpv/dpv10-before.log`.

3. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, all five
   selected/transitive packages built JS and declarations. Log:
   `_tmp-dpv/dpv10-build.log`.
4. Retained DPV-10 cases and the complete new dispatch suite:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-populate-dependencies.dispatch.test.ts -t 'DPV-06 include guard ownership|DPV-10'
   ```

   **2 files / 22 passed / 8 name-filtered**, duration **7.14 s**. All six retained
   include ownership cases pass, including the two corrected nested checks and
   four concurrent/explicit-nested controls. The eight command-filtered cases
   belong to DPV-11; no test-source skip was added. Log:
   `_tmp-dpv/dpv10-focused.log`.

5. Original retained review suite:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts
   ```

   **1 file / 12 passed / 0 failed, skipped or todo**, duration **3.86 s**. Original
   intent and ordinary guard assertions are unchanged. Log:
   `_tmp-dpv/dpv10-original-review.log`.

6. Affected include/cross-resource/provenance/concurrency/intent/related suites:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-include.integration.test.ts test/cross-resource-authorization.integration.test.ts test/include-source-provenance.integration.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.resolver.test.ts test/correlated-includes.escape.integration.test.ts test/request-hook-ownership.test.ts test/request-hook-concurrency.test.ts test/request-persistence-concurrency.test.ts test/hook-concurrency.test.ts test/operation-access-boundaries.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts test/virtuals-populate-dependencies.integration.test.ts
   ```

   **16 files / 713 passed / 0 failed, skipped or todo**, duration **152.24 s**.
   Includes all 52 DPV-07 intent cases and 120 DPV-08 captured guard cases, existing
   include dispatch/related grants and no-feature paths, provenance, and independent
   request/runtime hook/persistence ownership. Log: `_tmp-dpv/dpv10-affected.log`.

7. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed**, including
   its fresh five-package closure build and source
   `tsc --noEmit -p tsconfig.typecheck.json`. Log:
   `_tmp-dpv/dpv10-typecheck.log`.
8. Full combined retained review run after that rebuild:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts
   ```

   **2 files / 18 passed / 8 failed / 0 skipped or todo**, duration **7.06 s**;
   **not a pass**. The original 12 and all six include ownership cases pass.
   Exactly the eight `DPV-06 fallback operation capture` cases remain failures:
   `_read`/`_readFilter`, false → true and true → false source list replacement,
   in lean/hydrated modes. DPV-11 owns that separate correction; no assertions or
   fallback source were changed. Log: `_tmp-dpv/dpv10-combined-review.log`.

9. Focused source/test ESLint, Prettier and patch checks all **passed**:

   ```sh
   node_modules/.bin/eslint packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/core.ts packages/access-router/test/virtuals-populate-dependencies.dispatch.test.ts
   node_modules/.bin/prettier --check packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/core.ts packages/access-router/test/virtuals-populate-dependencies.dispatch.test.ts docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md
   git diff --check
   git diff --no-index --check -- /dev/null packages/access-router/test/virtuals-populate-dependencies.dispatch.test.ts
   ```

   Lint/format logs: `_tmp-dpv/dpv10-eslint.log` and
   `_tmp-dpv/dpv10-prettier.log`. Final task formatting/patch checks were repeated
   after this evidence update. The existing Vite future-config-loader notice is
   nonblocking.

**Changed paths / handoff:** two production files named above, the new 16-case
dispatch suite, and this task record (DPV-10 evidence/status plus the factual
overall blocked summary). Final worktree: **40 tracked modified / 18 untracked**
intentional paths, with staging empty. No agents, commits, reverts, publishing,
dependency changes or manual generated-output edits occurred.

DPV-10 acceptance and scoped gates are satisfied: **747 distinct focused tests
pass across 19 files** (713 affected + 22 dispatch/retained include + 12 original
review). No DPV-10 corrective blocker remains. Coordinator review precedes the
separate fresh DPV-11 implementer. Preserve both active review suites and the new
dispatch regressions; DPV-11 must capture source list fallback admission coherently
without lending it to unrelated nested Core calls. The independent reviewer then
resumes DPV-09 V5/applicable V2/V4 and final DPV-06 acceptance. DPV-06/09 and overall
release readiness remain **blocked** by DPV-11 and final gates; this scoped result
does not supply final workspace or installed-consumer approval.

### Task DPV-11: Use captured source list admission for read-to-list fallback

Status: completed — captured conditional source admission, scoped checks, coordinator review and final independent DPV-06 acceptance completed.

Kind: defect

Priority: P1 — live fallback admission mixes captured source/target policies with a replacement operation rule.

Dependencies: DPV-10 (sequential corrective execution); discovered by resumed DPV-06.

Primary ownership: a different fresh corrective implementation agent assigned by
the coordinator; public read/readFilter fallback admission and captured source
policy/execution handoff, with the new active review regressions.

Finding/reproduction: `_read` and `_readFilter` retain captured configuration,
owned query intent and source/target getters but call live
`this.requestCore.isAllowed(this.modelName, 'list')` after the awaited read misses.
With a read scope excluding the existing row, pause read preparation and replace
source `operationAccess.list`. False → true makes the already captured call
succeed and compute its list virtual; true → false rejects the earlier admitted
capture. A later call correctly follows replacement. All **eight** cases fail
for both methods/directions in lean and hydrated modes. The initial call must
keep its captured source admission; only the later call observes replacement.

References: `src/services/public-service.ts:334-338` and `:448-452`;
`src/acl/model-output-planning.ts`; `src/acl/service-execution.ts` derivation;
`test/virtuals-populate-dependencies.capture-boundaries.review.test.ts`
(`DPV-06 fallback operation capture`); A4, D4.1, source fallback access matrix and
DPV-07's public/fallback capture requirements.

Requirements:

1. Resolve/own source list operation admission coherently with the source
   configuration before the first await. When fallback is actually needed,
   evaluate that captured rule with the original actor/permissions and proper
   admission bounds; do not reread live Core options.
2. Preserve the existing fallback trigger/error behavior, initiating `read` and
   effective list/list/list accesses, captured receiving hydration, original
   query/default masks, target base-read/row policy and ordinary populate access.
   Successful ordinary reads and terminal invalid/denied reads must not add an
   unnecessary list guard/getter/query.
3. Use existing exact/default/bare/runtime fallback semantics, preserve explicit
   denial and route-variant independence, and observe replacement on later calls.
   Do not use DPV-10's outer authority for an unrelated nested fallback call.

Observable acceptance:

- All eight fallback review cases pass, retaining the initial result and exactly
  one authorized getter across the initial/later pair.
- Focused function/string/array/default and nested/concurrent fallback checks
  prove original actor/policy ownership and limit-one completion as appropriate.
- Existing read-list-fallback, direct/root/trusted, related/virtual/hydration
  behavior and all original intent/guard regressions remain passing.

Verification: retained capture-boundary suite, read-list-fallback authorization,
DPV intent/guard/integration and affected route/operation suites, source typecheck,
ESLint/formatting/patch checks. After coordinator review, resume this independent
reviewer for complete DPV-09 V5/V2/V4 and final DPV-06 acceptance. No downstream
test weakening, dependency change or silent scope reduction is authorized.

#### DPV-11 corrective implementation evidence and handoff

Owner: fresh DPV-11 corrective implementer (self-review, not independent final
signoff). Read root `AGENTS.md`, task-file conventions, frozen D1-D4, the resumed
DPV-06/09 reviewer findings and DPV-10 handoff. Set DPV-11 `in_progress` before
tests or source changes. Initial worktree: **40 tracked modified / 18 untracked**
intentional paths. Preserved that work, including both reviewer-owned suites and
DPV-10's one-shot dispatch correction. The coordinator supplied an exclusive
build/test window; all builds and runtime test commands below were serialized.
Loaded the package guidance; this correction adds no public entrypoint or option.

**Correction and audit:**

- `src/services/public-service.ts` captures `operationAccess.list` through
  `getCapturedAuthorizationOption` from the existing read execution configuration,
  together with `getAuthorizationPermissions`, before either identifier resolution
  (`_read`) or query preparation (`_readFilter`) first awaits. The shared private
  `captureListFallbackAdmission` returns a deferred callback. Only the existing
  nonterminal-miss/`tryList` branch invokes it through the request/runtime hook gate.
  Successful reads, terminal false row/transform/identifier policy, invalid
  descriptors and disabled retries do not execute a list guard or list work.
- Reused DPV-10's **one-shot** `withCapturedModelOperationGuard` dispatch into the
  existing `Core.isAllowed` seam. Core consumes the exact core/model/list slot
  before invoking trusted code. Independent nested checks see current options;
  an explicit nested fallback gets its own source capture. Core's own dispatch
  owner also ensures a reused service called inside that guard captures fresh
  source options, rather than inheriting the outer service's options frame.
  This retains the observable Core spy seam; **no existing test assertions needed
  adjustment**, and neither reviewer-owned suite was edited.
- Audited public by-ID and filter/no-ID entry points, direct basic/advanced model
  routes and root routes: they converge on these two wrappers. Trusted
  `findOne`/`findById` continue to choose their supplied effective access without
  gaining an automatic retry; include reads already forward `tryList: false`.
  The existing fallback derivation retains initiating `read`, list row/virtual/
  output/document-permission accesses, receiving hydration, owned predicate and
  intent, public/underlying default buckets and ordinary populate access. Private
  targets retain their separately captured base-read operation/row admission.
  Exact/default/bare/runtime-exact resolution uses DPV-08's existing resolver;
  explicit denial and defined stored-parent blocking remain effective.
- Scoped source controls exposed an existing custom-adapter compatibility issue:
  `Base.assertIncludeOutputPaths` tried to authenticate a registry-derived model
  even for **zero include entries**. Its `relatedBinding().model` was undefined
  for the supported fake/custom adapter, unlike that execution's adapter model,
  so 18 ordinary trusted read/list controls returned a binding-mismatch error
  before persistence. A **one-line empty-include early return** in
  `src/services/base.ts` removes that unnecessary related-only lookup. Nonempty
  include authorization still authenticates its binding; no source policy is
  copied to a different caller, no registry identity is fabricated and no existing
  tests were weakened. All 18 original controls now pass.

**New retained coverage:**
`test/virtuals-populate-dependencies.fallback.test.ts` has **154 cases**:
both receiving hydration modes and both public read methods cover boolean,
string, array and exact/default/bare/runtime-exact guards; explicit denial and
runtime fallback blocking; function actor identity and frozen permissions;
permission refresh and source/runtime replacement across awaited reads; later
calls on the same service; concurrent old/new captures; actual queued independent
guards at hook limit one; independent nested Core checks; denied and explicitly
captured nested fallbacks on a reused service at persistence/hook limit one;
concurrent request/core isolation with native ObjectId/Date/Buffer actor values;
terminal/success/invalid/disabled-retry no-work controls; source/default/getter/
hydration/ordinary-populate/target replacement and later getter observance;
direct/root route parity; and capture before an awaited by-ID identifier hook.
Output and no-query assertions stay outside virtual getter error suppression.

**Actual commands/results** (repository root; quoted `<repo-root>` replaced with
the checkout path at execution; stdout/stderr retained in ignored repo-local logs):

1. Confirmed repository, package, node_modules and `_tmp-dpv` parents with `ls -ld`.
   Ran `git check-ignore -v` for each new `dpv11-*.log` and temporary config path;
   `.gitignore:8:_tmp*` matched. Temporary before-behavior config was created with
   `apply_patch` under `_tmp-dpv` and removed after its diagnostic run. Logs remain.
2. Before source changes, ran:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts
   ```

   **2 files / 18 passed / 8 failed / 0 skipped or todo**, **7.12 s**. Exactly the
   eight retained fallback cases failed; original 12 and all six include cases
   passed. Log: `_tmp-dpv/dpv11-before.log`.

3. Before source changes, ran the new suite:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.fallback.test.ts
   ```

   Initial **150 cases / 92 passed / 58 failed**, **19.37 s**, log
   `_tmp-dpv/dpv11-new-before.log`. Corrected two fixture assumptions: changing a
   header does not re-resolve a same-runtime permission field, so explicitly
   replaced that field before refreshing Core permissions; omitted populate access
   on a list fallback uses list, so the read-populate control now explicitly
   configures read access. The corrected before-fix run again had **92 passed /
   58 failed**, **18.70 s**, log `_tmp-dpv/dpv11-new-before-corrected.log`. These
   corrected failures observe wrong admission/output or wrong configured-guard
   counts across suspended function/permission/source/runtime/route/identifier
   cases, not fixture failures. Four hook-queue controls were added afterwards;
   the replacement control was also strengthened to observe the later new getter.

4. `pnpm --filter @web-ts-toolkit/access-router... build` — **passed**, all five
   selected/transitive packages built JS and declarations. Log:
   `_tmp-dpv/dpv11-build.log`.
5. First post-fix combined review/dispatch/new-suite run: **188 passed / 4 failed**
   across four files, **29.32 s**, log `_tmp-dpv/dpv11-focused.log`. All reviewer
   and DPV-10 cases passed. The four new direct-route controls incorrectly expected
   no metadata despite the route's own permission-output defaults; configured
   `stripPermissionsField: true` for those controls, retaining exact business-output
   assertions. After that fixture correction and the four new queue controls, the
   same four-file run passed **196/196**, **31.04 s**, log
   `_tmp-dpv/dpv11-focused-final.log`.
6. First 25-file affected run: **961 passed / 21 failed**, **221.60 s**, log
   `_tmp-dpv/dpv11-affected.log`. Three prototype-only public-wrapper controls
   exposed eager hook-gate initialization on successful reads; moved that lookup
   inside the conditional callback. The remaining 18 failures were the empty-include
   custom-adapter controls above. For causal evidence ran:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-dpv/dpv11-denial-baseline.config.mts test/service-denial-contract.test.ts test/service-authorization-boundary-admission.contract.test.ts
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-denial-contract.test.ts test/service-authorization-boundary-admission.contract.test.ts
   ```

   The ignored config replayed the original two live list dispatches **in memory**
   and logged the ordinary controls' returned error, retaining every original test
   assertion. No source or generated output was reverted/rewritten. Before-behavior
   replay: **123 passed / 18 failed**, **6.86 s**, log
   `_tmp-dpv/dpv11-denial-baseline.log`; corrected fallback with lazy gate but before
   the empty-include return: **123 passed / 18 failed**, **6.84 s**, log
   `_tmp-dpv/dpv11-source-controls.log`. The diagnostic is
   `Service authorization: request/runtime/model/scope binding mismatch`.
   After the one-line return, that exact standard two-file command passed
   **141/141**, **6.89 s**, log `_tmp-dpv/dpv11-source-controls-corrected.log`.

7. Final `pnpm --filter @web-ts-toolkit/access-router typecheck` — **passed**, with
   a fresh five-package closure build and `tsc --noEmit -p tsconfig.typecheck.json`.
   Log: `_tmp-dpv/dpv11-typecheck-final.log`. An earlier pre-compatibility-fix
   invocation also passed (`_tmp-dpv/dpv11-typecheck.log`); final evidence is the
   later run, followed serially by the two complete runtime groups below.
8. Final retained review and complete dispatch/fallback suites, against that fresh
   build:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/virtuals-populate-dependencies.review.test.ts test/virtuals-populate-dependencies.capture-boundaries.review.test.ts test/virtuals-populate-dependencies.dispatch.test.ts test/virtuals-populate-dependencies.fallback.test.ts
   ```

   **4 files / 196 passed / 0 failed, skipped or todo**, **31.14 s**. All **26**
   unchanged reviewer cases now pass, including the corrected **eight** fallback
   cases. DPV-10's **16** controls and the new **154** cases pass. Log:
   `_tmp-dpv/dpv11-review-final.log`.

9. Final affected source/direct/root/trusted/operation/default/intent/guard/
   integration/related/hydration/concurrency checks:

   ```sh
   TMPDIR='<repo-root>/_tmp-dpv' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/read-list-fallback-authorization.integration.test.ts test/model-router.routes.integration.test.ts test/root-router.integration.test.ts test/root-router.variants.integration.test.ts test/operation-access-boundaries.integration.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-variants.contract.test.ts test/virtuals-populate-dependencies.intent.test.ts test/virtuals-populate-dependencies.operation-guards.test.ts test/virtuals-populate-dependencies.integration.test.ts test/virtuals-populate-dependencies.parity.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-route-parity.integration.test.ts test/virtuals-populate-include.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-denial-contract.test.ts test/service-defaults.integration.test.ts test/hydration-configuration.test.ts test/hydration-characterization.integration.test.ts test/hydration-request-boundaries.integration.test.ts test/request-hook-ownership.test.ts test/request-hook-concurrency.test.ts test/request-persistence-concurrency.test.ts
   ```

   **25 files / 982 passed / 0 failed, skipped or todo**, **218.63 s**. Includes
   all 52 intent and 120 captured-operation-guard cases. Log:
   `_tmp-dpv/dpv11-affected-final.log`.

10. Focused ESLint, Prettier and patch checks **passed**:

    ```sh
    node_modules/.bin/eslint packages/access-router/src/services/public-service.ts packages/access-router/src/services/base.ts packages/access-router/test/virtuals-populate-dependencies.fallback.test.ts
    node_modules/.bin/prettier --check packages/access-router/src/services/public-service.ts packages/access-router/src/services/base.ts packages/access-router/test/virtuals-populate-dependencies.fallback.test.ts docs/tasks/20261024-234103-access-router-virtual-populate-dependencies.md
    git diff --check
    git ls-files --others --exclude-standard -z | xargs -0 -n1 git diff --no-index --check -- /dev/null
    ```

    Logs: `_tmp-dpv/dpv11-eslint.log`, `_tmp-dpv/dpv11-prettier.log`. Final task
    formatting and whole-worktree tracked/untracked whitespace checks were repeated
    after recording this evidence. Existing Vite future-loader notices did not
    prevent any completed check.

**Changed paths / final handoff:** this task record, the new 154-case fallback
suite, `src/services/public-service.ts` (conditional captured admission) and the
one-line empty-include return in `src/services/base.ts`. Existing review and
operation-boundary spy assertions were preserved; no test assertion relaxation
was needed. Final worktree: **40 tracked modified / 19 untracked** intentional
paths, staging empty. No agents, staging, commits, reverts, publishing, dependency
changes or manual generated-output edits occurred.

DPV-11's scoped acceptance and checks pass: **1,178 distinct tests across 29 files**
(196 + 982), fresh source typecheck/build, focused lint/format and whitespace.
There is no remaining scoped corrective blocker. Coordinator review precedes
resuming the same independent final reviewer for **DPV-09** exclusive root
build/test/lint, refreshed applicable V2/V4 installed-consumer checks, and final
**DPV-06** acceptance. The full root test remains postponed to that reviewer;
allow the documented **at least 7,200,000 ms** window. DPV-06/09 and overall release
readiness remain **blocked**, not completed by this corrective implementation.

#### Historical DPV-06 first-review handoff integrity checks

- Final `pnpm lint` passed after adding the review regressions. Focused Prettier
  checks passed for the review suite and all three tiny README corrections; the
  task record's only new formatting issue was its wrapped inline verification
  command, corrected without changing requirements/evidence.
- `git diff --check` and
  `git ls-files --others --exclude-standard -z | xargs -0 -n1 git diff --no-index --check -- /dev/null`
  passed, covering all **13** untracked files. Final
  `git status --short --untracked-files=all` contains **34 tracked modified / 13 untracked** paths:
  the initial intentional work plus the three README corrections and new review
  test. `git diff --name-only --cached` is empty. No root CHANGELOG, tracked
  dependency/lockfile or generated-dist changes were introduced.
- Review remains **blocked**, with DPV-07/08 required corrections and DPV-09
  verification pending. The definition of done is not satisfied; there is no
  release-readiness or complete-workspace passing claim.

## Definition of done and execution record

- [x] DPV-00..06 and corrective/verification DPV-07..11 are completed with actual
      evidence and all required decisions/findings resolved. The final DPV-06 approval
      is by the same independent reviewer, not a corrective implementer's self-review.
- [x] A1-A4 and frozen D1-D4 hold across the approved operation/reference matrix in
      both hydration modes, with explicit validation and documented materialization
      limits for unsupported/native cases.
- [x] Active driver/query/ID and hook/persistence measurements demonstrate batching,
      finite terminal reads and configured concurrency bounds.
- [x] Final whole-workspace build/test/lint and server typecheck pass serially;
      the final package run supplies current V3 and all 129 V4 consumer tests. Exact
      unchanged website evidence is reused from its separate workspace build.
- [x] All required review findings/prerequisites are closed. Historical failures,
      the observed intermittent downstream test behavior and the unrelated one todo
      remain accurately recorded; no silent scope reduction or pending required work.

Historical creation evidence (planning only):

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
- At creation, no feature task had started. The implementation, corrective and
  final independent completion evidence above supersedes that planning baseline.
