> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09E architecture: purpose-bound consumers of one owned-stage engine

Date: 2026-11-01. **Design only; no product, test, documentation or tool implementation.**

## Decision and execution boundary

Recommend two private consumer boundaries, not another authorization engine:

1. **Existing-value output consumer:** fresh helper policy/catalog/actor capture →
   existing isolated source admission → synchronous built-in EMPTY-fact admission →
   shared output-selection shape → shared stage evaluator/materializer → detached DTO.
   Do not generate a database fetch plan for an already-present value.
2. **Document-condition consumer:** the same public-read argument resolution, call
   capture, identifier/query/row admission, fetch projection, hydration and hook-source
   preparation → the same document stage/fact resolver → a private boolean condition →
   close/drain. No root or child DTO is published by this consumer.

The second item is an **explicit guard contract refinement**, not behavior-preserving
removal of 24 callbacks. Field/virtual/presentation output effects cease to be guard
work; source/fact/query admission does not. Sections G1–G5 below define the change.
The user's broader-boundary authorization permits proposing it; the coordinator must
record design acceptance and these refinements before the next fresh owner implements.
No timing gate, workload, repeat rule or historical result is amended here.

No public helper overload, batching API, token, configuration flag or output capability
is added. Normal READ/LIST/write/new/subdocument outputs retain field authorization.
`genSelect`/`genQuerySelect`/`genPopulate` retain their distinct planning purposes.

### Alternatives considered

| Alternative                                                                                          | Disposition                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| More catalog/memo micro-optimizations while retaining general helper query plans and full guard DTOs | Reject as the next architecture. OAR-09C/D already reduced those costs; required fresh capture and throwaway consumer work remain measurable.          |
| Reuse DTO authority or cache schema/policy/field decisions across helper calls                       | Reject: violates C2/C5, setter/actor freshness and same-ID/cross-owner isolation. A public batch replacement would also rewrite the measured workflow. |
| Separate consumer needs from shared authorization/source/selected-value primitives                   | **Choose.** Reduces work with an ownership reason; keeps one evaluator, source admission, fact admission, stage lifecycle and poison/drain owner.      |

## Inspected entry, evidence and limits

- Entry HEAD is **`a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`**. The sole incoming tracked
  modification is the coordinator's task document. OAR-09D and preceding product work
  are user-committed, not changes this owner may revert. `58b22c0…` is historic only.
- Read the full task, C1–C6, resolved OAR-01, M1–M5, OAR-09E, original
  `PERFORMANCE-GATES.md`/`MEASUREMENT-PLAN.md`, OAR-09D handoff/work report and accepted
  `final-01` protocol/metadata. Current root ESM is
  **`7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`**.
- References beginning `src/` or `test/` below are within `packages/access-router/`.
  Coverage is the helper/guard call chain, shared authorization/stage/publication,
  selection/rule/materialization primitives, relevant tests and benchmark definitions;
  not an exhaustive package or repository security audit.
- Existing full-gate results belong to OAR-09D: 5,869 core, 742 deco, 44 runner tests,
  real installed consumers and 67 deterministic outputs. **Not rerun here.** Latest
  fixed campaign is 78/90 passing, including all 45 isolated comparisons, with 12
  unresolved/failed trusted gates. Those failures remain blocking and separate from
  the earlier 75/90 and 81/90 campaigns. No timing acceptance claim follows here.
- Final seal reconciliation found one **pre-existing user-committed formatting-only
  test difference** from 09D's source seal: `test/service-authorization-subdocuments.integration.test.ts`
  wraps the same chained helper call differently. Entry and user HEAD hashes match;
  `COMMITTED-ENTRY-VS-09D-TEST.diff` preserves the inspected difference. All 622 archived
  candidate records and all runtime/declaration/tool outputs still match the seal;
  live source is not claimed universally byte-identical to that historical seal.

### Actual work, not profile-label inference

OAR-09D `WORK-REPORT.md:75–136` / `final-01/audit-02/WORK-REDUCTION.json` records:

| Exact fixture | Retained actual work after OAR-09D                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H3-global/100 | 1 full query capture + 100 fresh output-only captures/catalogs; 5,351 snapshot-node visits; 5,000 field-memo calls; 56,550 binding assertions; 3,737 full catalog walks; 1 actor-map reconstruction |
| H3-global/10  | 407 full catalog walks; 1 actor-map reconstruction                                                                                                                                                  |
| H4            | 1 read, 1 document hook, 24 output callbacks; 164 snapshot-node visits; 51 memo calls; 37 full catalog walks                                                                                        |

OAR-09C had reduced H3/100 snapshot-node visits 19,848→5,351 by output-only capture;
OAR-09D reduced full walks 11,819→3,737 and actor copies 101→1. Its sampled inclusive
H3 planner work remained 173,427 µs and helper capture 95,866 µs over its diagnostic
profile (not additive stopwatch contributions). These reductions are retained, not
recounted as new OAR-09E gains.

New bounded **current-artifact-only** probes in this packet:

- `probe-helper.mjs`, `HELPER-WORK.json`: 1/10/100 independent helpers, 24 global-string
  fields, no DB or source query. At 100: **100 fresh captures/catalogs, 100 stages,
  100 general projection calls, 200 projection compactions, 200 `copyDocumentView`
  calls, 2,400 field evaluations/memo calls**. Every output and ordered fields array
  is checked. Each helper builds fetch/public-fetch/identity/dependency/related-plan
  collections that `filterExistingOutput` never reads. No candidate code was tested.
- The second source copy is concrete: `filterModelOutputForHelper` calls
  `resolveDocumentStage(stage, () => EMPTY_DOCUMENT_GRANTS)` with `exposeSource=true`;
  `document-stage.ts:264` copies an isolated callback view although this built-in
  resolver never observes it. Source isolation and final selected-value copying are
  separate, still necessary boundaries.
- `probe-guard-v2.mjs`, `GUARD-OBSERVABLES.json`: five fake-adapter current-artifact
  cases. Ordinary guard: 1 adapter call/1 hook/24 field callbacks/1 decoration. A
  selected invalid virtual returns 400; a throwing decorator escapes as its original
  error. A denied row hook returns 401 without an adapter call. **No actual Mongo read
  or timing is claimed.** The first fixture incorrectly used scalar `baseFilter:false`
  as a terminal row hook; its failed assertion/log is preserved. V2 uses
  `baseFilter.read: () => false`; no product correction or discarded timing occurred.

## H. Fresh raw helpers: selected existing values, not fetch plans

### Current call path and required versus redundant work

`Base.{pickAllowedFields,trimOutputFields,genAllowedFields}` → `Core` counterparts →
`acl/output-field-filter.ts:filterModelOutputForHelper`:

1. `assertFieldHelperCall` and `normalizeOutputAuthorizationOptions` reject retired,
   server-only, positional, malformed, inherited/accessor/proxy controls before source
   work. Preserve this order and controlled errors.
2. `captureOutputHelperConfiguration` freshly reads exact options and schema, then
   `resolveServiceAuthorization(applicability:'output')` owns actor/policy/catalog and
   forces isolated source behavior. **Keep.** No schema-identity or cross-call cache.
3. `createDocumentStage` admits/detaches the source, including supported hydrated/native
   normalization. **Keep.** It is not safe to return the original DTO unchanged.
4. General promise-backed document resolution makes an unused full callback view of
   the source just to install EMPTY facts. **Remove that exposure/promise machinery for
   this built-in fact origin, not for a real document hook.**
5. `planAuthorizedModelProjection` builds selection **and** query fetch/dependency,
   identity/join, public-fetch, virtual-populate and related-plan bookkeeping.
   `filterExistingOutput` uses only selected shape/policy/scope, metadata and source ID
   eligibility. **Retain selection semantics; omit query expansion.**
6. `filterExistingOutput` evaluates actual fields, nested stages, copies approved values,
   preserves allowed metadata DATA, and closes through `runOutputPublication`. **Keep
   those protections**, with call-local prepared state and synchronous progress until
   actual async work is encountered.

### H1. Extract one shared output-selection kernel

Primary files: `acl/output-projection.ts`, new private
`acl/output-selection.ts`, `acl/virtual-projection.ts`, `acl/output-field-filter.ts`.

Introduce a minimal **private `OutputSelectionShape`**, structurally consumed by both
query finalization and existing-value filtering. It carries selected persisted/active
virtual names in canonical order, child shapes, exact field states, effective normalized
selection/exclusions, source-ID eligibility/exclusion and authenticated call/binding.
It is not a data-keyed authority record. Query plans extend it with fetch-only fields.

Move, rather than duplicate, `planCatalogProjection`'s selection/candidate grammar into
`selectCatalogOutputShape`. Preserve its universe construction from catalog, explicit
selection/grants, named dynamic paths and opaque rule paths; classification; ancestors;
recursive child selection; virtual activation and identity eligibility. The same
`extractOutputFieldRuleEntries`, classifier and `resolveSnapshotDescriptor` are used.
The latter still validates/copies active descriptor declarations: helper error behavior
must not silently change because query fetch expansion is gone.

`planCatalogProjection` then expands that shape for actual query consumers: dependencies,
private populate inputs, always-select/join/identity fetches, compaction, public fetch,
structure paths, provenance and related plans. Query callers and public planning
helpers keep that expansion. `planModelOutputForHelper` is a **planning** helper;
leave its full capture/`genSelect` results intact. `Core.genPopulate` likewise retains
its request-only source/target admission and private hook inputs.

For raw data filtering, `prepareExistingOutputShape` invokes the shared selection kernel
with exactly today's safe present-root selection:
`Object.keys(admittedSource).filter(noDot && isSafeOutputPath)`; no arbitrary stored
string becomes selection syntax. Do not enumerate arbitrary Map/Mixed keys to invent
new explicit selection. Do not prune source admission to these keys. No query expansion,
DB dependency lookup, hidden fields restoration, getter or document hook follows.

**Order/semantics that must survive extraction:**

- Catalog/plan order, not source key order; persisted fields then child roots then
  active stored virtual values, with current source-ID retention and ordered
  deduplicated `genAllowedFields` paths. Absent values remain absent; undefined/null,
  embedded primitives, empty arrays and declared versus undeclared embedded `_id`
  retain their current behavior.
- Exact dotted rule before nested lookup; ancestor conjunctions and original first
  `request:<access>:<path>` decisions, including two different lookup routes reaching
  that same key. No eager memo seeding or aggregate replacement.
- Boolean/string/nested-array/function rules, prefix/unprefixed fallback,
  short-circuit, original-request `this`, truthiness and callback error-denial remain
  the shared evaluator's responsibility. Functions are deferred by shape selection,
  not run by the planner. EMPTY facts do not make negative predicates document proof.
- Whole explicit backend grant versus descendant grant, scoped path validation,
  exclusions, protected/ref/virtual/dynamic/opaque paths and metadata remain separate
  from request permissions. A descendant grant does not authorize the whole ancestor.

Do not introduce a second flat-field classifier for the benchmark. The kernel must be
the canonical query selection implementation too; no helper-only policy DSL/fallback
engine. Characterize query fetch plans before extraction and compare them afterwards.

### H2. Synchronous EMPTY admission inside the existing stage state machine

Primary files: `acl/document-stage.ts`, `acl/service-authorization.ts`,
`acl/document-grants.ts`, `acl/output-field-filter.ts`.

Add a private, captured **fact origin** to `CallRecord` from actual resolver applicability
(`output-helper` for `applicability:'output'`, otherwise ordinary document resolution).
An authenticated embedded derivation may retain its helper fact origin; retries/targets
cannot invent it. It grants no permission and is not a public option/mode.

Add `resolveEmptyOutputHelperStage(stage, binding): void`, callable only for that exact
private origin in `created` (or idempotently already resolved EMPTY) state. It takes
**no supplied grant map or callback**. Extract the existing fact commit primitive from
`resolveDocumentStage`: assert open/generation/exact binding; use the one normalizer on
`EMPTY_DOCUMENT_GRANTS` with the configured metadata field; install frozen access/fact
view and enter ready. Reuse this primitive in normal sync/async resolution. Do not
replace fact validation with `true` or let this operation complete an in-flight hook.

Keep one resolution result: normal hook resolution still owns its genuine shared
promise; a later read of a synchronously completed built-in stage returns the same
facts (a promise may be created lazily only if its existing API needs one). Reentry,
pending failures and generation checks are unchanged. Normal document hooks still
go through `invokeDocumentPermissions`, the shared gate, genuine-Promise boxing and
controlled fulfilled-result validation outside the application-error catch.

No disposable document view is made for a built-in callback that does not exist.
The isolated source is still admitted once before any actual permission callback;
approved selected output is still detached/materialized. For genuine embedded helper
occurrences reuse the actual owned subtree and EMPTY facts, with distinct stages/memos,
not a certificate for a mutable application graph. Do not register raw helper inputs
for query reference provenance: source admission may omit `captureReferenceOrigins`
only for the private output-helper origin, because that consumer can only emit ref
IDs and never loads/recover targets. Keep the same source materializer/bounds.

### H3. A call-local prepared selected-value filter, including async continuation

Keep `evaluateAuthorizedOutputField`/`memoizeStageFieldDecision` as the only decision
engine. Prepare the shape and immutable policy slices once for the authenticated
helper call. Generalize `copyOutputValue`, `hasWholeOutputValueGrant` and the private
embedded-shape derivation to the minimal selection shape; query finalization continues
using them. Keep `copyAuthorizedReference`, `retainOutputMetadata`, safe definitions,
`trustedMapOutputScope` and the existing native materializer.

Make the existing-value walker return a value synchronously until an actual field
promise/async nested result appears; continue at that index without restarting earlier
fields or observing later values. Do not precompute permission decisions for later
fields. Register any actual pending work with the same publication owner. Entry,
embedded derivation, callback resumes and commit still check exact binding/open generation;
do not remove checks merely to achieve a lower counter. The public helpers remain
Promise-returning. There is no promise-free guarantee for arbitrary native/application
behavior, nor a promise of identical microtask scheduling for a built-in no-op stage.

The selected root row budget remains one owner across children/native/metadata. Charge
encountered selected keys **before** policy/value work, including denied/protected keys;
never invoke a denied property getter. Retain separate source/fact/callback-view owners
without replenishing selected output. Do not turn `genAllowedFields` into a schema-only
shortcut: it still validates the actual existing values/bounds and reports actual paths.

**Falsifiable work target:** for the 100-helper diagnostic, still 100 captures/catalogs,
100 stages and 2,400 field evaluations; **0 helper query-plan expansions/compactions**,
100 rather than 200 whole-source view copies; no resolver promise per synchronous
built-in EMPTY stage. These are proposed counts, not measured OAR-09E improvements.

## G. Document guards: fresh facts without output publication

### Current routing and observable semantics

`middleware.ts:guard(modelCondition)` resolves ID → `evaluateDocumentGuard` creates an
ALS record → `PublicService._read(id, undefined, quiet)` resolves public defaults,
captures normal read intent/authorization/hydration, binds one execution, resolves ID,
prepares row filter → `executePreparedFindOne` → `Service.findOnePrepared` does full
selection/populate/include/source/output processing →
`finalizeDirectOutput.completeOutput` consumes facts **after selected output/virtuals** →
stage closes → `_read` calls decoration/tasks → `evaluateDocumentGuard` discards DTO.

Current defaults are significant: `tryList` defaults true unless configured; public
read defaults supply select/populate/include/tasks; `captureModelServiceIntent('findOne')`
also resolves internal defaults. `hydration.publicRead` is independent of findOne/by-ID.
Private-populate loading may execute target queries and mask root hook inputs before
source admission. Include attachment rows are separate from `DocumentStage.source`;
root facts are **not** computed from decorated data or completed include/target DTOs.

**Operation distinction verified by the new probe:** direct `_read` is a request-only
service entry, not the generated HTTP READ route; it does not itself run the initial
`operationAccess.read` route guard. With `operationAccess.read:false`, an otherwise
visible row and matching condition still authorize today's model guard. Generated
routes separately apply operation admission; read→list fallback checks captured
`operationAccess.list`. Preserve those exact placements, row filters and condition
grammar in this packet; do not claim the model guard implies HTTP READ-route admission,
or invent unrestricted operation authority. Applications needing both checks must
compose the appropriate existing route/global guard. This is a caller-contract
distinction, not evidence of a newly introduced security bypass.

### G1. Private exact-receiver dispatch, no ambient output-suppression flag

Replace `document-guard.ts`'s ALS/`executions` decision side channel with a module-private
WeakMap registering a **fixed condition-read implementation** for each real PublicService
receiver. `evaluateDocumentGuard` looks up that exact receiver, captures the condition
as bounded detached data and invokes it; an unregistered/fake `_read`/DTO remains denied.
No fallback to metadata, user-provided callback or arbitrary result object.

`services/public-service.ts` registers a lexical reader after `super` construction and
extracts shared **private** by-ID orchestration used by `_read` and this reader. It
must run through a new private `model-service-owner.ts:runFreshModelServiceCall` wrapper
which uses the captured receiving runtime and a fresh dispatch record. Otherwise a
guard invoked inside a callback could accidentally reuse an in-flight options/actor
capture. This wrapper is not a method, request field or package export.

The private orchestration takes a closed discriminant (`dto` versus `condition`) and
captured condition data, not an application-supplied consumer function. Its DTO entry
keeps today's public signature/results/presentation. Its condition entry returns only
`boolean | ErrorResult`, no `SingleResult<T>` containing raw or placeholder document
data. Keep that return type private all the way through executor dispatch. No guard
source/stage/boolean capability is attached to the service result or request.

`acl/service-execution.ts` stores an immutable private purpose in the exact execution
record; a private setter/constructor can issue it only for this registered reader.
Ordinary calls default to DTO. Carry it only through an authenticated same-receiver
READ→LIST retry; independent calls and related services get their own purposes. Remove
`bindReadGuardExecution`, `inheritReadGuardExecution`, `consumeReadGuardStage` and the
call from `finalizeDirectOutput.completeOutput` after migrating their callers.

### G2. Shared query/fetch prefix; branch before any DTO construction

Primary files: `services/public-service.ts`, `services/service.ts`,
`acl/service-execution.ts`, `acl/prepared-query.ts`, `acl/document-guard.ts`.

1. Resolve the **same** public read defaults and fixed quiet options, capture original
   actor/model/policy/access/source mode/related preparation before ID hooks/awaits,
   and capture fallback operation admission. Keep initiating READ mode for a retry.
2. Run the same `resolveModelIdentifier`, `prepareModelQuery`, request parser,
   override/base/scope filters, exact prepared-query validation, sort/descriptor errors,
   query-selection planner and persistence scheduler. No existence shortcut, weaker
   row predicate, narrowed select or second hidden lookup.
3. Extract `Service.findOnePrepared`'s common **fetch/hook-input prefix**, not a second
   query engine. Retain `processInclude`/descriptor preflight, `genExecutionPopulate`,
   full `executionOutputPlan`, association DB projection and `planVirtualPopulateQuery`.
   Execute the same root query and any current ordinary/private dependency preparation
   in `loadOutputPopulateDependencies`; its hook mask must be identical. These target
   reads keep their own captured operation/rows/config/mode. Do not use an unfiltered
   related DTO as root facts or forward private argument-four values to root hooks.
4. At the output-purpose branch, create the root stage with
   `prepareQueryDocumentStage` directly; do not make an include working/output shell,
   selected output budget, target DTO, `finalizeModelOutput`, metadata or result context.
   Any private fetch-only association cleanup still precedes hook resolution exactly
   as in the ordinary finalizer. Use `prepareOutputDocumentStage` with the same source,
   access tuple and allowlisted query diagnostics to resolve the same root hook once.
5. `consumeDocumentCondition` uses the **same** `createValidator` string/array grammar
   and `permissions.has(key) || grants[key] === true` lookup (no field-prefix rewriting).
   Even a global-only matching condition still requires a visible row and fresh hook.
   Read/check stage before/after evaluation, close ready→closed and return the primitive
   decision only after publication-owner success/close/drain. Do not call
   `beginDocumentStageOutput` when no output is being built.
6. Add a private `executePreparedFindOneCondition`/registered executor sharing the same
   `outputOperation` lifetime and common fetch prefix; it accepts only an execution
   carrying the issued condition purpose. Public `executePreparedFindOne`, `_read`,
   `findOne` and `findById` remain DTO-only. No union result can accidentally escape a
   normal output path. Reuse current error mapping and read/list retry orchestration:
   BadRequest/Forbidden are terminal; admitted misses may retry once; missing/denied
   guard conditions map to Unauthorized. Do not use boolean false as a missing row.

### G3. Exact observable changes (require migration text and tests)

| Effect                                                                                                                         | Condition consumer contract                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root query/select/DB projection, row/ID/filter/sort admission, hydration, captured actor/modes and root doc hook input/context | Preserved; no field-count selection narrowing. Hook receives the same pre-output source and frozen empty diagnostic facts; normalized facts are stage-local.                                                                                                                                              |
| Root document hook                                                                                                             | Same once-per-successful-stage invocation, shared gate, `this`, genuine Promise handling, fulfilled-fact validation, missing/throwing empty-facts warning semantics. Conditions remain global-or-fact expressions.                                                                                        |
| Field permission callbacks and field metadata computation                                                                      | **Not run.** They authorize published fields; this consumer publishes none. H4's candidate count becomes **0**, not “still 24.” Field callback side effects/errors do not affect a guard.                                                                                                                 |
| Virtual getters, embedded output stages, ordinary populated-target DTO finalizers                                              | **Not run.** Their output/body/selected-return failures are no longer guard vetoes. Necessary pre-hook ordinary/private populate fetching/masking/admission remains as above.                                                                                                                             |
| Post-fetch `includeDocs`/correlated include attachment queries and output                                                      | **Not run.** Includes attach output, not root hook-source authority. Their target hooks/decorations/selected output failures cease to be guard effects. Preflight/captured descriptors remain validated. Actual target queries still performed for hook-source preparation retain all existing admission. |
| `decorate`, tasks, aliases, metadata stripping/exposure and final DTO construction/serialization                               | **Not run for guards.** Decorating/overriding `_read` to perform business effects no longer intercepts a model guard. Neither metadata nor post-filter mutation can authorize it. Normal service reads still run presentation.                                                                            |
| Source/fact structural/native errors                                                                                           | Still controlled 400 and sticky. Isolated full projected-source admission and disposable real hook views keep their budgets. Trusted borrowing remains its documented shallower source contract. Necessary hydrated normalization may still execute trusted native/plugin code.                           |
| Errors existing only in hypothetical selected output                                                                           | No DTO exists to select/materialize, so these errors are **not generated**. An invalid virtual return, native expansion used only for output, or throwing decorator cannot veto a condition. This is a contract change, not “equivalent validation” or caught-error suppression.                          |

Default include configurations may therefore perform fewer output-only queries during
a guard; default populate/private hook-input queries are deliberately retained. Promise
ordering relative to omitted output callbacks changes. Do not promise pure callbacks,
a JavaScript sandbox, transactional external freshness or identical side effects.

Migration: put business validation/effects in an explicit application boundary, and
compute guard security conditions in operation/row policy or the document-fact hook;
do not rely on field/getter/decorate/include work to deny a guard. A caller requiring
an actual DTO must perform a separate ordinary authorized read and handle its result.
Do not hide that added application read or make the library perform it automatically.

### G4. Lifetime, poison and no-publication proof obligations

- Exact receiving request/runtime/model/scope/access validation remains in executions,
  prepared queries and stages. New private record slots (purpose/condition/result)
  must be own data properties initialized before callbacks, not intercepted by an
  inherited setter. Freeze copied condition arrays; do not retain caller containers.
- Use the existing `OutputPublication` as a generic operation completion/failure owner
  despite its name: created→resolving→ready→closed is valid without building/publishing.
  No source/stage crosses the private registry or executor result boundary.
- A fact/source/dependency structural failure closes/poisons first; caught inner errors
  cannot return true. Track/drain all admitted library promises and clear stage/source/
  facts/access/view/memo/prepared resources after settling. Late hook/memo results
  cannot set a condition, publish DTOs or revive a generation.
- No new public cancellation API or new interpretation of normal HTTP completion.
  The inspected publication owner supports poison/close/drain; it is **not** evidence
  of an existing blanket HTTP disconnect-cancellation implementation. Propagate an
  actual scheduler/owner failure through this same path; test explicit close while a
  hook is pending and do not claim arbitrary DB/application work is cancellable.
- Related calls that actually publish data remain DTO consumers and retain every
  field/virtual/output budget check. Condition mode must never follow an ambient ALS
  flag into a callback's independent normal read. No output-shape/control in HTTP,
  root, include, populate or service options can request this private purpose.

### G5. Operation/target separation is not weakened

Keep actual route operation admission and request-only service semantics as described
above, including the captured LIST retry gate. Do not use field true, output grants,
global condition success, native admission or skipped DTO construction to bypass a row
filter or admit a queried target. Root and target hook-source preparation must remain
separate and target-local. Skipped include DTO work confers **no** target authority:
there is no accessed include row or returned include field. No write/persistence/
save/input or negative pre-write fact admission changes are in this packet.

## Verification matrix for the implementation owner

New focused tests may live in `test/owned-authorization-consumers.unit.test.ts` and
`test/owned-authorization-guard-consumer.unit.test.ts`; avoid test discovery exclusions.
Retain OAR-09C/D's two 16-case suites and their original proof purposes.

| Area / faults                    | Required observable proof; retained anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh helper boundaries          | Core/Base/PublicService, three helpers, omitted/undefined options; controls rejected before source/policy; zero DB/doc hooks/virtuals; next-call actor replacement and schema/option mutation observed, in-flight capture unchanged. `owned-authorization-helpers`, `owned-authorization-runtime-profiles`, `field-helper-removal.contract`                                                                                                                                                                                                |
| Grammar/memo/order               | Boolean/string/array/function, prefix/unprefixed, exact-dot versus nested, conflicting first-key routes both orders, async pending/reentry/error-denial; ancestor callback once, no later-key preseed; explicit whole/descendant/scoped/unrestricted output policy. `output-field-policy-cache`, `owned-authorization-work`                                                                                                                                                                                                                |
| Shape equivalence                | Byte/ordered-field equality for flat/embedded/array/Map/Mixed/refs/stored active/inactive virtual/metadata/custom scope/ID cases; absent trees/undefined/null/protected literal dotted source keys. Query fetch/select/exclusions/always/deps/private/public masks before/after extraction unchanged. `virtuals-projection-planner`, `field-catalog`, explicit-select integration                                                                                                                                                          |
| Source/native budgets            | Helper source still isolated in both configured modes; hydrated source not mutated; accessor/proxy rejection before traps; Date/Buffer/ObjectId/Code.scope/DBRef.fields/Map/nested/wire controls. Separate source/fact/view/selected budgets; exact 20,000 slots/depth 100 pass, +1/depleted/cyclic/unsupported fail; selected denied/protected keys charge before value; serializer count proves pre-wire admission; no child/native/metadata reset. `owned-authorization-publication`, existing native/adversarial fixtures              |
| Sync EMPTY engine                | Only privately issued helper-origin stages can use it; reject normal/foreign/closed/resolving stage and supplied-map attempts; same immutable EMPTY, distinct row/embedded memos; no disposable source view or resolver promise; async fields still share one pending decision and track/drain. Fact-map normalizer/19,999-key maximum remains unchanged for real hooks.                                                                                                                                                                   |
| Guard positive/negative          | New private reader invoked with exact receiving owner; fake `_read`/forged metadata/context/spread/JSON cannot pass. Same visible-row condition outcome/grammar with strip/expose/metadata toggles, actor/fact changes on next guard. H4 1 query/1 hook/0 field callbacks, zero DTO/decorate/task/getter work; ordinary `_read` on the same model still runs 24 callbacks. `guard.test`, `owned-authorization-stage`, `owned-authorization-helpers`                                                                                        |
| Guard prefix/target/retry        | Capture actual adapter query/hook arguments before/after; public+internal defaults, requireExplicitSelect, alwaysSelect, custom id/row false/override/sort errors, lean/hydrated, read→list miss/hit and terminal no retry; initial HTTP route operation denial separate from direct guard; fallback LIST denial; mixed source/target modes; private-populate argument-four-only data and source masks unchanged. Guard skips output includes but still validates descriptors; prove admitted target lookup controls where queries remain. |
| Explicit guard semantic changes  | Invalid virtual/output-only native return no longer causes guard 400; source or fulfilled invalid fact still 400. Throwing decorator/tasks not called. `_read` override no longer intercepts guard; default include output-only reads absent. Normal DTO routes retain old error/output behavior and field checks. Saved current probe is the before evidence, not a newly passing implementation test.                                                                                                                                    |
| Poison/async/ownership           | Hook in flight + setters/actor changes, foreign request/runtime/model/access/scope, close before resume, caught inner controlled source/fact failure, inherited setters for every new private slot; all tracked work settled and stage access/view/source/memo cleared. Nested independent normal read in guard hook remains DTO consumer and fresh call; nested guard remains distinct. Scheduler gate FIFO/reentry/depth/persistence permit semantics unchanged.                                                                         |
| Writes/alternate/public surfaces | Negative pre-write facts, post-save visibility poison (write may already persist; do not swallow or auto-retry), new/templates/dedicated subdocuments/data helpers unchanged; DTO no symbol/token/WeakMap authority. No private reader/purpose/fact-origin exports in ESM/CJS or either declaration; public types still compile strictly. `owned-authorization-alternate`, boundary/type/export/packed/deco suites                                                                                                                         |

Current `guard.test.ts` spies on `_read` and asserts its quiet arguments. Migrate that
mechanism assertion to the registered private read's actual query/hook/default inputs;
retain all ID/global/condition/forged/inherited-setter and error assertions. Existing
metadata/decoration anti-forgery tests should explicitly assert **no guard decoration**
and separately verify normal-read decoration. Do not merely delete their security purpose.

## Benchmark correctness amendment, not acceptance relief

Original OAR-01 `MEASUREMENT-PLAN.md:70` specifies H4 **one query and one hook**, not
24 field callbacks. `access-router-owned-core.mjs:153–160` and OAR-09C/D's local runbooks
later locked 24 to prove the full-DTO implementation was not silently skipping output
checks. That implementation proof cannot truthfully describe a new no-output consumer.

Before implementation timing, record a new **candidate-only mechanism contract**:

- H4 new candidate: same public `guard({modelName,id,condition})`, POST `/_guard` route,
  body/index, seed/row, fields/bytes, defaults/select/fetch/hook inputs/hydration,
  `reader owner`, response `{allowed:true}`, 1 source read/1 root hook; **0 output
  callbacks**. Root query projection must be instrumented and compared, not assumed.
- Old sealed baseline: unchanged metadata-derived guard and actual 0 callbacks.
  Previous OAR candidates: their sealed tools/reports still mean 24. Never rerun or
  relabel them with new expectations, and do not call new guard behavior historical
  full-output equivalence.
- H1/H2-global/H3-global: same independent helper invocations, all required callbacks,
  EMPTY facts, source isolation, explicit output policy, zero additional reads/hooks;
  same ordered DTO/fields/fingerprints. H2/H3 document refresh still adds one explicit
  normal read/list plus matching hooks. No batch API, presentation-only replacement,
  narrower field count or “already authorized” return shortcut.
- All primary LIST, six guard workloads (distinct from H4), READ/native/fact/retention
  workloads stay unchanged. Any DTO produced anywhere keeps its output checks.

The next implementation/tool owner must version the new counted-response mechanism
series (e.g. `checked-each-response-v2`, with H4 `facts-only-v1`) and seal **new tools**.
Do not infer the count from `isolated`/`trusted`: old and new owned artifacts have the
same public modes/declarations. Carry an explicit benchmark-only correctness-contract
revision keyed to each artifact hash in the new protocol/metadata, backed by an actual
outside-timing counted guard preflight and tests that reject a mismatched 24-callback
artifact. It is not a runtime/public feature selector or authorization certificate.
Worker workload/request/seed definitions remain byte-identical; only count-contract
validation/proof/version/report metadata and associated tests/docs should need edits.

Seal 0-callback evidence separately from timing, including ordinary DTO route controls
still producing 24, true/false/invalid facts, query/hook input equality, hydration and
closed/cleared stages. Preserve every full response fingerprint before/during/after
timing. Actual allocation counters and Mongo CPU remain unavailable unless measured.

**Unchanged fixed V8:** 45 cases × four profiles × two reversed rounds = 360 initial
jobs; primary 100 rows/24 fields/32 bytes/one client/hook concurrency 10/five warmups/
100 samples; six guards at 10/100 rows and 50 samples. Original benefit/adverse/heap/
fresh-read allowances, paired aggregation, sign rules and exactly two further reversed
pairs only for triggered comparisons remain verbatim. The 3-of-4 rule, absolute gates,
no extra unchanged-artifact resampling and all prior failed campaigns remain intact.
New implementation does not guarantee the remaining ten small sign-unstable comparisons
will align. Keep OAR-09 open if the fresh campaign fails; no timing success is asserted.

## Exact next implementation packet (one fresh owner, sequential)

Status: **pending coordinator design acceptance**; no new unresolved technical choice.
No additional public contract decision is requested beyond recording G1–G5 as the
explicit refinement covered by the user's broader redesign authorization.

1. **Save incoming bytes and characterize.** Fresh ignored packet, current committed
   HEAD/status, OAR-09D source/output/tool and dependency identities; preserve original
   guard tests/proof expectations. Add named before-failing consumer/work regressions,
   helper/query shape fixtures and guard source/query argument observations.
2. **Extract shared selection shape.** Implement H1 without changing query fetch
   semantics. Run complete planner/catalog/field-policy/helper files; preserve all
   OAR-09C/D memo/order/compaction/index tests. No helper timing yet.
3. **Implement helper consumer specialization.** H2/H3 within the same stage engine;
   no callback-view copy for built-in EMPTY, no helper query expansion/reference
   provenance, correct sync/async continuation. Show exact proposed work counts and
   actual field callbacks/captures/budgets. Do not optimize away fresh captures.
4. **Extract shared by-ID/fetch prefix and private condition consumer.** G1/G2, new
   execution-purpose ownership, registry/fresh-dispatch binding, same root query/hook
   inputs, no DTO/selected output/presentation. Migrate mechanism tests with a purpose
   ledger; implement G3/G4/G5 fault/retry/native/async/target checks. Remove old ALS seam,
   not its negative tests or lifetime protections.
5. **Ship contract text.** `packages/access-router/MIGRATION.md` M2/M3/M5, installed
   README/JSDoc (including `middleware.ts:guard`), relevant website guard guidance and
   CHANGELOG new breaking-entry paragraph. Explain guard effects/error/override/default
   include changes, direct-service versus HTTP operation gates, retry/read counts and
   normal-read replacement. Update executable installed fixtures and affected deco
   documentation/contract coverage; do not add private public types/exports or broad
   unrelated doc reformatting. `access-router-deco` has no direct consumer of the private
   guard seam; keep its hook/operation/fact typing unchanged.
6. **Update candidate-only count-contract tooling/proofs.** As above; preserve every
   previous tool seal. Run scoped V6 and full unchanged 180-job correctness smoke with
   versioned proofs. No full timing campaign until coordinator accepts the new seal.
7. **Full scoped V1–V7 and new deterministic artifact.** Run serial gates below, real
   minimum/current packed ESM/CJS/type/guide matrices, no private export leaks. Snapshot
   tested bytes, one necessary six-package rebuild, verify all expected 67 outputs
   deterministic and produce a newly named artifact/protocol/metadata. New output
   filenames, if any, require explicit manifest reconciliation, not selective hashing.
   Archive all initial failures and inventory changed source/tests/docs/tools.
8. **Handoff only.** Coordinator reconciles task/contract status; a separate fresh
   measurement owner runs one newly named fixed V8 campaign against the original
   `33662fae…` baseline, independently audits raw pairs and preservation. OAR-10 and
   performance/release acceptance remain later. No commits/publish/dependency changes.

### Proposed commands (NOT executed by this architecture owner)

Working directory: repo root; installed dependencies, approved offline binaries and
new exclusive cache/TMP/XDG/store paths are prerequisites. Build/test commands are
foreground, serial, awaited; never use root workspace-wide build/test/lint. Where test
fixtures create files, use a new packet-local Vitest config that changes only cache/
consumer scratch placement, following OAR-09D's method, not its old cache locations.

```sh
pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 test/owned-authorization-consumers.unit.test.ts test/owned-authorization-guard-consumer.unit.test.ts test/owned-authorization-helpers.unit.test.ts test/owned-authorization-work.unit.test.ts test/owned-authorization-projection-work.unit.test.ts test/output-field-policy-cache.unit.test.ts test/virtuals-projection-planner.unit.test.ts test/guard.test.ts
# Then full V3/V4 (adapt config paths solely to isolate the new packet's caches):
pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1
pnpm --filter @web-ts-toolkit/access-router-deco typecheck
pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs scripts/benchmarks/access-router-owned.test.mjs
git diff --check
```

Use the new tool seal/protocol for `node scripts/benchmarks/access-router-owned.mjs
--plan <new-protocol> <new-plan-dir>` and `--smoke <new-protocol> <new-smoke-dir>`.
Change-file Prettier, actual packed V7 fixtures and the necessary post-gate rebuild
must be recorded by the implementer. Later `--run` belongs only to the fresh accepted
measurement packet. Existing OAR-09D `final-01` is evidence/input, not the new candidate.

## Security argument and proof limits

There are still exactly three ownership boundaries. Operation entry captures current
authority; document stage owns normalized facts and per-stage decisions; publication
filters/builds every actual DTO. A raw helper specializes fixed empty facts but still
crosses source/selected-value boundaries. A guard terminates at a primitive private
condition and therefore never crosses DTO publication; it cannot export omitted-field
authority. The condition is not reusable after its call. Immutable built-in EMPTY and
exact immutable Permission DATA reuse do not certify arbitrary application objects.

The proposed structural savings are justified by absence of a consumer, not an ACL
bypass. Actual latency/CPU, sign stability, general application hooks and configured
dependency costs remain unproved. New probes observed only current fake-adapter/helper
behavior; no proposed engine ran, no full tests/builds/lint/bench campaign ran, no new
artifact was produced. Source/default/async/target equivalence and the changed guard
contract require the tests, installed documentation, seal and later independent review.
