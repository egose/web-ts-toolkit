> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-01: resolved omission contract and implementation handoff

Scope: investigation only at `8fb1fe7f148d5115d7bc0caa3aa0cddc31ad30b3`.
No runtime, options, public types, package, lock, historical tracked file, or task
document was edited. All new files are under this ignored directory. The two task
document changes shown by `git status` already existed on entry and belong to the
coordinator. No delegation or commits. Relative paths below are from the repo root.

## Decision

Implement a **borrowed/trusted query path**, not renamed publication fusion.
It may pass a live projected source to the document hook, retain the hook's grant
map, share diagnostic context leaves, and trust originally issued output roots
after descendant replacement. Losing these protections, including a denial becoming
an allowance, is intentional **only on the new actually active path**.

Keep existing shared operation/row/field evaluators, planning and request work gates.
Do not fork the v0.51.0 service. Do not require another whole-document eligibility
or final-graph walk in order to omit the old walks. No implementation-blocking user
decision remains. The decisions below are the authorized contract, not a claim that
the current source already implements it.

## Selection and origin boundaries (FP-02)

- Add a separate two-element group: `unsafeUseListAuthorizationFastPath` and
  `unsafeUseReadAuthorizationFastPath`. Both default false and normalize with
  `value === true`. **Do not append to/change** the existing six/two/eight arrays in
  `src/acl/unsafe-snapshot-options.ts:2-16` (all `src/` paths in this document mean
  `packages/access-router/src/`). Use a new combined server-control list where needed.
- Per operation: requested false/omitted = off; literal true plus **all four matching**
  DocumentSnapshotChecks, OutputSnapshotChecks, NestedDocumentSnapshotChecks and
  InitialOutputSnapshotCopy skips = active; otherwise dormant. Never set prerequisites.
  Missing-mask changes in a requested dormant state are diagnostic changes too.
- Normalize inheritance/explicit false/undefined restoration with the existing model
  option machinery. Compare coherent before/after effective signatures after
  `AccessRuntime.deferSnapshotWarnings` publication, including default changes and any
  prerequisite change. Warn distinctly for active and dormant/missing prerequisites;
  include source/grant mutation, stale decisions, omitted native observations,
  descendant replacement and restore-false guidance. Logger failures do not affect
  publication. An off state needs no unsafe warning.
- Capture a private `origin: read|list` and `fastPath: off|dormant|active` before any hook
  or await. Retain the originating four-bit prerequisite decision, not child flags.
  Genuine registered related/embedded edges and same-binding read retries inherit it.
  READ with effective list visibility remains READ-origin and requires READ settings.
- Use the existing explicit `listResponse`, `readResponse`, `snapshotDerivation`
  admission in `service-authorization.ts:397-573`, `service-execution.ts:150-190,242-281`
  and `related-execution.ts:143-174`. A `parent` or shared provenance alone is not an
  origin. Do not infer fast authority in helper/new/create/mutation applicability.
- Add both names by **presence** to server-only control admission, including inherited,
  non-enumerable and undefined JS slots: `Service.admitServiceCall` (`service.ts:315-341`),
  `assertPublicAdmission`/`assertPublicDefaults` (`validation/public-admission.ts:15-137`),
  raw authorization key validation and named helper controls. Nested include/populate/
  subquery args/options also reject. Same-named stored data/predicate/projection values
  outside control slots remain inert ordinary business data.
- Independent service calls inside hooks capture their own origin/settings. Rollback
  changes new calls only; suspended calls, genuine descendants, retries and issued
  retained handles use their captured mode. There is no public mode/certificate issuer.
- FP-02 is config/capture-only: no omissions yet. All-off/dormant and original flag
  behavior must still pass unchanged tests, including fusion-absence regressions.

## Exact historical / current / proposed matrix

`current ON8` below means all original eight flags true, **new flags absent/OFF**.
Strict/default additionally performs the original source/output comparisons and
initial output copies. `proposed` means a genuine active ordinary query row.

| Work / guarantee | v0.51.0 actual source | Current / ON8 | Proposed active contract |
| --- | --- | --- | --- |
| Origin configuration | `Service.captureVirtualSnapshot` constructs a limited object of references from the service's options (no deep clone in that method); other core lookups still consult options | Root capture copies configuration; resolver copies it again; readers detach open slices; embedded derivation rereads/re-resolves full configuration | Keep one coherent detached origin capture, validated policy/catalog and captured target configuration. Brand package-owned captures in private WeakMaps/WeakSets; reuse internally without resolver/read/child recopy. Setters after capture cannot replace it. Mutable native/function-backed configuration observations are not isolated per row. |
| Request actor / permissions | Original request receiver; core global permission view | Captured immutable request permission view; original request receiver | Keep modern original receiver and one captured permission view; share with genuine children, never reconstruct per child. No actor/result cache across requests. |
| Operation / rows / query grammar | Operation/row filters, parsing, sorting, pagination and projection planning exist | Modern explicit rows/output/related policy normalization, operation gates and prepared query tokens | **Keep** modern gates, row filters, target admission, parsing/grammar/limits and prepared query authentication. This is not authorization bypass. |
| Correlated source / diagnostics | Clone correlated rows; `originalDocumentSnapshot` can alias lean input; shallow scope context | Correlated source clone even with no correlations; then diagnostic context deep-copied in finalizer and repeatedly in children/getters | Skip unconditional correlated clone when unused. For actual correlated joins, capture only necessary original join/reference inputs before attachment. Diagnostic `originalDocumentSnapshot` is a borrowed view, not an immutable snapshot promise in active mode. Shallow context shells only. |
| Lean source normalization | Hook can receive raw service document; finalizer calls `isolateDocForOutput` once | Service isolates; stage copies; hook input copies; finalizer isolates again; metadata source deep-copy | Borrow ordinary lean projected source for stage/hook; **zero whole-source isolate/normalize/copy passes** solely for authorization. Use a new safe shallow working shell to remove virtual keys/replace children; reconstruct selected output. Source aliases/mutation are accepted. |
| Hydrated source | `toObject({virtuals:false})` then deep isolation in finalizer | Additional `toObject`/deep isolation across service/finalizer/source/diagnostics | One `toObject({virtuals:false,flattenMaps:true})` normalization to retain actual hydration/map/schema behavior; no extra deep source copy. On throwing/unproven normalization use existing compatibility path before hooks, not a borrowed `_doc` masquerading as a plain snapshot. |
| Stage record | No modern opaque document stage system | Always detached copied stage + detached hook input, even when source comparisons off | Discriminated private **trusted source** record: exact input object/root + call/binding/access/stage identities, no `snapshot` member. Never issue strict `snapshot` pointing at an alias. |
| Document hook invocation | Service skim/metadata/candidate conditions can skip hook and supply `{}` | Hook resolves once for every relevant source row independent of skim/metadata; errors log and use empty grants; gate bounds hook work | Keep modern mandatory hook behavior, once per source/target row; embedded children reuse owner grants. Same receiver, access, fallback/error handling and finite hook gate. Do **not** reintroduce historical skim skipping. |
| Returned grant map | Supplied grants reused as-is; same object put in scope/getter context | Copied at resolution, every full owner read and each memo evaluator | Borrow ordinary hook map once. Full reads and every field decision get the same map; embedded children share it too. No per-read/per-field grant clone/freeze. Preserve current invalid hook result normalization; exotic shallow grant shape may retain a copied-grants fallback without rerunning hook. |
| Field grammar / rule ordering | Shared scoped evaluator handles booleans/strings/arrays/functions; no modern stage memo | Modern shared extractor, ancestor request memo, classifiers and short-circuiting | Keep modern extraction/grammar/classifiers/backend grants/request-only metadata. Preserve callback/ancestor order and short-circuiting. No speculative later callback evaluation. |
| Per-field result memo / async | Per-field async evaluator; no modern grant/result owner promise stack | Promise queue per cold field, observation handlers, validation on lookup/start/resume/cache hit; pure boolean batch already exists | Keep per-stage/per-scope memo and shared in-flight failures/results. Use direct/settled/pending variants; remove defensive `Promise.resolve().then`, observer bookkeeping and hit `.then` validation wrappers. Keep awaits required by actual async rules/hooks; existing shared evaluator can gain a sync result core with unchanged legacy wrapper, not a divergent permission grammar. No cross-row/ID/request result cache. Scheduling vs mutable data may change. |
| Cheap authority | No modern public opaque output handles | WeakMap-issued call/stage/document handles + tuple checks | **Keep** unforgeable WeakMap issuance, exact request/runtime/model/model-name/scope/access/call/stage identity checks and root output-to-handle association. Matching IDs/values/spreads grant nothing. Recheck tuple at public/private entry/async result use; no document walks. |
| Source integrity | No modern repeated snapshot matching | Strict compares repeatedly; ON8 omits comparisons but still copies inputs/grants | No source value integrity/normalization promise in trusted state. Later/retained decisions can be stale. Native/hook mutations can change later decisions/values without an authorization error. |
| Embedded configuration | Same snapshot/accesses and supplied parent grants; per-element finalization | Each parent/container calls `authorizeEmbeddedOutputPlan`: full policy/config read/resolve/copy, permission recreation; per-child stage/grant/context copies | Cheap private scoped call view shares captured configuration/policy/catalog/permissions. Prepare reusable scope descriptors once per parent plan/scope, not row. Every element still has its own source/stage/leaf-decision owner; parent ancestor memo delegation retains its identity, not repeated owner-graph revalidation. |
| Related rows / populate | Target plans/hooks/grants and filtering are separate; copied target output | Captured target guards/plans, target own grants, per-actual-object populate memo; clones/graph transfers at cache use/finalization/reference copying | Keep modern target operation/row/selection admission and separate target hooks/decisions. Reuse captured target config, not origin model's policy/grants. Same actual fetched object reuse is allowed as today; **no same-ID different-row sharing**. Reuse authenticated finalized target DTO by identity instead of recursively copying/transferring it for every occurrence. |
| Include source vs attachment | Saved include values copied/unset/restored around source finalization | Source clone + working clone + attachment copy + restore copy + graph transfer | Keep separate private **source lane** and produced **attachment lane**. A shallow working shell and attachment list are enough; materialize safe dotted attachment spines, attach already-finalized target DTOs directly, do not use them as source hook inputs. Source/ref/join substitutions cannot confer target authority. No whole-row/whole-target include copies. |
| Virtual getter input semantics | Finalize children first; remove stale virtuals; stable base + per-getter deep view; staged returned values copied | Same core behavior plus grant/context deep copies, private populate input channel | Retain child-before-parent ordering, missing-dependency behavior, stale-key removal, **historical stable document base + separate per-getter document views when getters can run**, returned-value staging, fail-closed getter errors and finite gate. These copies enforce useful business semantics (sibling virtuals never visible; getter argument-one mutation is not an implicit output write). Share grant/context leaves instead of copying them. |
| Private populated getter inputs | Feature not present | Separate captured raw reference/selection/admission channel, isolated getter argument four | Retain existing private-input selection/admission/isolation code. It is not public output/related grant authority. Do not implement private-fetch caching changes in this task. Extra copies on this specialized path remain a disclosed modern difference. |
| Selected ordinary values | Trimmed root uses values from isolated output | `copyOutputValue` safely reconstructs selected/catalog/opaque values; then response copies again | Keep safe selected reconstruction and exclusions/protected keys. Primitive/scalar assignment is direct; materialize selected container/native values once as required, not a whole input snapshot. Already-finalized related/embedded DTOs need no new defensive clone. No implicit restoration of denied or internal-only fields. |
| Metadata OFF | Still may attach/strip maps; supplied grants can be empty from skim | Authorization still uses full copied grants; metadata-source clone and later response copy remain even stripped | Hook/grants still run, but **no metadata-source snapshot**, no exposed-map construction/copy when stripped, no later whole-response copy. |
| Metadata ON / dotted | Grant object on output, shallow contexts; field maps and key exposure at caller boundary | Finalizer metadata copy then caller deletes/rebuilds metadata on a fresh response, with association transfers | Build final metadata once after data filtering, before association; exposed-key subset + `_view`/`_edit` request-only semantics and alias stay. Fresh metadata map/spines protect metadata-vs-enforcement separation; nested grant values may alias borrowed grants. Do not deep-copy grants just to serialize metadata or re-copy the whole output. |
| Output association / handles | No modern exact-output graph owner or snapshot | ON8 still bounded identity admission at association, repeated `outputIdentities`, graph transfers and context membership rechecks; two root contexts | Trusted output record owns exact **root** association only, no snapshot/identity array. Associate/publish once after metadata/includes; no graph transfer or descendant revalidation. Cheap root tuple checks survive; altered descendant graphs are intentionally accepted. |
| Descendant membership / retained lookup | No modern API | Context captures every graph identity and repeatedly verifies root+child graphs | Capture **issued document-output membership only** during construction/attachment, not arbitrary object/native graph identities. See explicit membership rule below. Originally issued detached children may remain discoverable; newly inserted objects do not acquire child handles. |
| Shape/native observations / limits | General deep clone helpers, no modern 20k-node/100-depth snapshot limits | Copies/identity admission observe native methods, validate shape and bound document snapshots even ON8 | Omit whole-document source/grant/output snapshot validation and native wire/equality passes. **Lose full per-document 20k-node/depth-100 guarantees for unvisited input/grants/context**. Retain request/filter/query limits. Budget newly introduced selected materialization/child/member algorithms (20k visited slots/issued roots, depth 100); no hidden full graph scan. Concrete fallback below. |
| Public retained helper | No modern issued-handle API | Public document-handle overload retains captured original skip settings; raw-policy helper creates strict fresh call | Trusted issued handle retains its weaker mode even after rollback. Helper source must be an exact package-associated root for that handle and correct receiving service/access; filtering reuses stale decisions/shared grants and safely reconstructs current existing values. Raw-policy/fresh helper remains strict even for known fast DTO; never upgrade a borrowed object into strict authority by reassociation. |
| Writes / nonquery paths | Different historical mutation APIs | Modern create/update/upsert/delete/new/dedicated-subdocument authority/lifecycle handling | **No changes** to writes, write-derived read-like output, create/new/delete/upsert, dedicated subdocument methods, fresh raw-policy helpers, input authority or persistence lifecycle snapshots. A real independent READ/LIST invoked by a write hook may capture its own query options; inherited write provenance alone never activates it. |

### Exact retained-handle membership rule (no final graph contract)

1. A trusted `OutputRecord` maps each package-created output **root object** to its
   issued document handle and actual trusted state. Association cannot change owner,
   captured mode, originating call or stage. Other rows, same-ID objects, spreads,
   other requests/runtimes/model instances/accesses/scopes reject with cheap lookups.
2. Every builder knows which authenticated child DTO roots it actually emits. Collect
   those roots (and their already-recorded child-root members) in a private member
   registry as construction/attachment occurs. Do not enumerate their business data,
   raw arrays, native leaves or arbitrary properties. Bounded union of already-issued
   member registries at an attachment is acceptable; no repeated data-graph walk or
   equality check. Count registry construction/merges separately in work tests. Keep
   registry growth/merges bounded; avoid quadratic repeated union when a single
   invocation can forward a shared construction collector.
3. `context.getDocumentAuthorization(value)` checks its fixed issued-member registry,
   associated root record and cheap provenance/binding. **It is an issuance-membership
   lookup, not a reachability/current-graph assertion.** A removed originally issued
   child may still return its handle. A replacement/new object returns undefined even
   if equal, same ID or in the same query family. A different row's child is not added
   merely because provenance matches. A genuinely shared fetched target may have been
   intentionally emitted in both rows and be recorded for both.
4. A trusted root handle's filtering helper still accepts that exact root after child
   replacement. Its ordinary field policy filters current values. An unknown embedded
   replacement can get a new package-created **trusted embedded stage** using that
   root's owning grants, scoped rules and budgets, not a public certificate. An
   already-associated embedded object moved from another row is not a memo-sharing
   shortcut: reuse its embedded handle only when issued membership and owning-parent
   handle match this parent; otherwise resolve a new scoped stage with this parent's
   grants. Same-ID or shared call provenance is insufficient for that reuse. An
   unrecognized populated target object is not trusted as an authenticated target DTO:
   use existing ID fallback/omission, never parent's grants for target fields.
5. Strict/copy-fallback handles keep their existing graph validation. A trusted object
   cannot be passed through a strict association refresh or copied-graph transfer to
   establish stronger authority. Raw-policy helpers recognize known trimmed outputs
   and retain current unresolved-rule fail-closed behavior without rerunning hooks.

### Shape, native, bounded fallback decisions

- Cheap root admission only: reject/fall back on a proxy, unsupported root prototype,
  accessors/symbol/non-enumerable non-generated root slots, or unsafe root keys, before
  invoking a document hook. Ordinary own-data plain/null-prototype projected roots
  are borrowable. Ignore only package-generated known metadata aliases explicitly;
  do not invoke their getters just to classify the row. No recursive preflight.
- A shallow-ineligible row uses **current compatible source/grant/output copying
  and graph handling with the original captured eight-flag behavior**, not a silently
  fabricated strict snapshot alias. It does not restore omitted per-context/config
  isolation elsewhere in the still-active query. Do not rerun its hook after falling
  back. A fast-permitted call can contain copied and trusted rows: handle/stage/output
  records encode the actual row state, not just the call's permission to borrow.
- Ordinary native leaves (`Date`, `Buffer`, `RegExp`, actual BSON family) in borrowed
  source/grants cause **no snapshot clone or wire/equality observation**. Do not reject
  an entire otherwise ordinary row because it contains them. Selected native values,
  Mongoose hydration, retained getter document views, private getter inputs and JSON
  serialization may still normalize/execute code. This is fewer/different native
  observations, not zero observations or identical exception behavior.
- A selected Map retains flattening semantics with validated string keys. Known
  supported but shallow-unproven native subclasses/containers use compatible copying
  once for **that value** under a copied-value fallback and the new traversal budget.
  Unknown custom object/proxy/function/symbol/cyclic selected values return controlled
  `ServiceAuthorizationError` rather than being emitted or starting a second row/hook
  pass. If the value is a virtual getter return, keep the getter channel's fail-closed
  omission instead. New reconstruction drops protected/unsafe property keys just as
  current selected-value filtering does, never assigning them. This restores neither
  full-source validation nor whole-stage strictness. No hook rerun.
- All **new** recursive/materializing/registry algorithms have an explicit shared
  visit/depth budget, cycle handling and safe CreateDataProperty/descriptor writes;
  existing HTTP/filter/related-depth/query/work budgets remain. Budget exceeded while
  producing output returns a controlled authorization error, never partial publication.
  A copied compatibility-value path retains its existing observations; if wrapping
  it in new traversal, budget before traversal rather than adding an unbounded walk.
- Because there is no full scan, hidden/unselected giant graphs, malformed native
  leaves, nested accessors/unsafe keys and aliases can go unobserved. Do not describe
  root identity checks as structural validation. Application getters/native methods
  can still cause arbitrary side effects; no promise of in-memory adapter source
  isolation, grant immutability, per-row context/native configuration isolation or
  current descendant integrity survives in trusted state.

## Minimal architecture (FP-03)

1. Keep `ResolvedServiceAuthorization` and execution WeakMaps. Add private captured
   origin/effective mode and branded captured configuration. Use private internal
   read/derive views that share captured references only when actually active;
   `readServiceAuthorization` and slice readers keep current copies for all other
   callers/modes. Root raw authorization is still parsed/normalized once. Cheap
   embedded/related/retry derivations validate edge and receiving tuple, then share
   existing captured config/policy/catalog/permissions; do not call a full copying
   resolver to recreate every child scope.
2. Make stage/document/output records explicit discriminated unions, e.g. copied
   stage with real snapshot versus trusted stage with borrowed source; copied grants
   versus trusted borrowed grants; current copied/omitted-snapshot graph output
   versus trusted root association/member registry. TypeScript narrowing must make
   it impossible to feed the live source to `matchesAuthorizationSnapshot` as a fake
   owned snapshot. Handle objects remain frozen empty opaque objects.
3. Thread actual state through current `createDocumentAuthorizationStage`,
   `resolveDocumentAuthorization`, `memoizeDocumentFieldDecision` and
   `evaluateAuthorizedOutputField`. Keep one result/failed promise per stage and
   request/output key; never cache grants or permission decisions by ID. Keep
   current `evaluateScopedAccessRule`, rule extraction and ancestor delegation.
   Remove graph/source validation and clone wrappers in the trusted branch, not
   the evaluator's operation/row/field decisions or error/short-circuit semantics.
4. `Service.finalizeDirectOutput` + `finalizeSingleDoc`: borrow lean source / normalize
   hydrated once; shallow working shell; one hook/grant handle; shallow context;
   finalize children using shared config and own per-element decision stage; retain
   historical stable/per-getter document views only if getters can run; safe selected
   reconstruction once; restore produced include attachments and build final metadata
   once; associate once; create one final service context. No whole finalized-response
   clone, no `transferDocumentAuthorizationGraph`, no `outputIdentities`/clone-free
   identity admission in eligible trusted paths. Context-count reduction alone is
   insufficient: stage, grant, context and child-config removals are mandatory.
5. `copyAuthorizedReference`, populate cache reuse and include `copyAuthorizedOutput`:
   retain authenticated target DTO roots directly with recorded issuance membership;
   preserve reference scalar/ID fallback and target gates. Do not fork include planners
   or lose source/attachment separation. Metadata on/off/dotted and registered scopes
   use the same fast builder, not an optimization limited to stripped simple roots.
6. Public handle helper admission should authenticate options/handle/receiving tuple
   **before** unnecessarily recapturing runtime configuration (currently
   `filterModelOutputForHelper:525-534` captures even for retained handles). Raw helpers
   keep fresh capture/strict path. A fast helper output can be newly associated with
   the same fast handle; a caller spread never gets an association automatically.
7. Diagnostic context mutation cannot change private authority. Keep binding scope,
   captured activation/access, prepared row predicates and request work counters/
   concurrency limits in private records, not in shared `scopeContext` or
   `resolvedQuery`. Context arrays/objects may alias one another but never become a
   source of operation/row authority or work-limit configuration.
8. Do not touch `subdocument-output.ts`/dedicated-subdocument/write execution except
   a negative regression if necessary. Shared helper branches must select from issued
   record state, never an ambient option or a generic clone-disable parameter.

## Deterministic tests and intentional risk fixtures

Run baseline fixture file:

```sh
pnpm exec vitest run --config _tmp-authorization-fast-fp01-20261030-142730/vitest.config.ts --no-file-parallelism --maxWorkers=1
```

`baseline-work-risk.test.ts` uses real `Service`/`PublicService`, mocked persistence
adapters (no Mongo timing), real capture/planning/finalizer/ACL/hooks/handle helpers.
It does **not** emulate the new path or supply the withdrawn fusion names. Existing
eight ON and strict cases assert source/grant/normalization/context/config/graph
work, distinct per-row handles despite identical IDs, output selection/denial, hook
counts, metadata and embedded grants. Measurements instrument external function
boundaries; recursive/internal lexical calls are not all intercepted. In particular
`matchesAuthorizationSnapshot` performs lexical copies separately: count comparisons
as additional full normalization passes, not as intercepted stage-copy calls.

Before counts (`width` excludes `name`; embedded has two children per row):

| Case | Stages / stage copies | Grant copies | Config copies | Context deep copies | Full source normalization calls | Graph transfer calls | Identity walks / clone-free admissions | Full call resolutions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 row, 4 bool fields, ON8 | 1 / 2 | 3 | 15 | 1 | 2 | 17 | 3 / 2 | 1 |
| 6 rows, 24 bool fields, ON8 | 6 / 12 | 18 | 35 | 6 | 12 | 342 | 18 / 12 | 1 |
| 6 rows, 24 dynamic fields, public ON8 | 6 / 12 | **318** | 36 | 6 | 12 | 342 | 18 / 12 | 1 |
| 6 rows + embedded, 24 dynamic fields, ON8 | 18 / **36** | **384** | **77** | **24** | **24** | **390** | 30 / 36 | **7** |
| 1 row + embedded, 4 dynamic, dotted metadata ON8 | 3 / 6 | 24 | 22 | 4 | 4 | 25 | 5 / 6 | 2 |
| 1 row, 4 bool, strict | 1 / 2 | 3 | 15 | 1 | 2 | 17 | 5 / 0 | 1 |

Strict simple case additionally performs **40** source/output comparison calls;
all ON8 cases zero. Two service contexts per root still exist; this is secondary.
Dynamic 6-row cases execute 6 document hooks and **144 actual field callback bodies**
(no same-ID result sharing), one adapter read. Embedded still resolves only 6 owning
document hooks. The simple borrowed target should have stage copies 0, grant copies
0, context deep copies 0, whole-source normalizations 0 for lean, graph transfers 0,
identity passes 0; configuration copies become origin/scope setup rather than row/
element work. Stage/handle issuance and the actual hooks/rules remain. Do not assert
zero getter-view/private-input/selected-value copies when their semantics require them.

Risk baseline fixtures, with explicit future active targets (future targets are
design expectations, **not measured candidate results**):

1. **Grant/source mutation**: first field callback mutates shared grant Date from 0
   to 1; later field allows only at 1. Current ON8 copies each grant: later field is
   denied and original grant/source remain unchanged. Trusted map alias permits
   later field, despite invoking the same rules in order. Document hook also changes
   a borrowed source Date; in active mode that source change may persist/be observed.
2. **Native denial → allowance**: fetch-only source Date `getTime` sets external
   state; doc hook grants only if no observation preceded it. Current ON8: hook sees
   4 observations, total 7, name denied. Proposed no-source-copy lean path: hook sees
   0 and name may be allowed. Actual hook still runs once and field rule still runs.
   Do not adjust to a publication-only 3→2 observation fixture; this targets omitted
   stage/source work. A BSON `toBSON`/Long wire-hook variant should also be added.
3. **Descendant replacement**: after publication replace an embedded child, keeping
   exact root. Current ON8 rejects root handle and detaches all child lookup results.
   Proposed root handle remains usable; issued original detached child remains a
   member, replacement has no public child handle. Rules still filter current data.
   Wrong root/same-ID other row/spread remains rejected in both modes.
   A separate cheap-authority fixture proves ten forged/wrong tuple/root cases reject
   with **zero output identity walks and zero snapshot comparisons already today**;
   dropping graph revalidation need not drop those checks.
4. Add active/default/dormant counterparts for source/grant mutation across await,
   stale memo allow and deny, exception/wire omission, nested unsafe/unvisited shape
   limits and copied fallback, same-ID concurrent rows/actors, target own hooks,
   rollback/in-flight descendants, READ retry with opposite LIST flags and vice versa.
5. Cover metadata stripped/on/dotted, embedded/opaque descendant selection, populate
   and include source collisions/nested attachments, registered virtual stable views,
   private populated getter inputs and retained raw/handle helper separation. Keep
   existing strict/original-flag assertions untouched; add new expected-risk tests.

## Exact inspected source references

Historical references resolve through Git `v0.51.0` at
`89180d219783fbfad412d8dfe19beae614f45c68`. Read-only copies + Git blob IDs/content
hashes are in `historical-source/manifest.json` under this ignored directory.
Current source references are at the starting HEAD above.

- **H1** `v0.51.0:packages/access-router/src/services/service.ts`:
  `captureVirtualSnapshot` (291+), `findOne` (1027-1308), `find` (1338-1657).
  Hooks/skim: 1186-1200 and 1556-1566; finalizer always supplied a grant object
  (1242-1266,1592-1609), even empty when skim skipped resolution. Correlated clone
  1168/1527, contexts 1155-1163/1517-1523, include saved copies 1230-1283/1580-1618,
  decorate/metadata 1631-1635. This is **not** raw unauthenticated querying, and new
  mandatory hooks intentionally differ from historical skim behavior.
- **H2** `v0.51.0:packages/access-router/src/output/finalize-model-output.ts`:
  `resolveDocPermissions` (217-293, supplied object reused at 222-225),
  `finalizeSingleDoc` (304-570), input isolate 314-316, shallow context 318-330,
  shared grants/embedded snapshot 333-378, target own grants 400-423, stable/per-getter
  views 441-501, shared field evaluator 463-472/528-553, value-reference trim 562-565.
- **H3** `v0.51.0:packages/access-router/src/helpers/document.ts`:
  `cloneIsolatedLeaf` 71-125 (older BSON clone-or-pass-through, not current universal
  BSON roundtrip), `deepIsolateValue` 135-166, `isolateDocForOutput` 176-187,
  `retainRawAssociation` 204-212. Historical finalizer did isolate input and getter
  document views; saying historical code had no cloning would be false.
- **H4** `v0.51.0:packages/access-router/src/core.ts`:
  `genDocPermissions` 541-562 (original actor/error fallback),
  `resolveFinalizerDocPermissions` 577-592 (supplied alias), `addDocPermissions`
  606-615 (attaches returned map), `addFieldPermissions` 618-681 (read/update row checks
  and request maps). No `document-authorization.ts`/modern output owner modules in
  historical `src/acl` tree (`git ls-tree` verified).
- **C1** `src/acl/document-authorization.ts`: `StageRecord`/`OutputRecord` 53-85,
  `createDocumentAuthorizationStage` 211-229, `resolveDocumentAuthorization` 251-275,
  `readDocumentAuthorization` 277-286, `memoizeDocumentFieldDecision` 299-348,
  `unchangedOutput`/assert/associate 537-603, graph transfer 635-678,
  `createServiceOutputContext` 681-715. These contain repeated stage/grant copies,
  promise wrappers, graph checks and public lookup reachability semantics to omit.
- **C2** `src/acl/service-authorization.ts`: origin/edge authentication 419-573,
  initial config/targets/permission capture 472-497, repeated read slices 576-690.
  `model-output-planning.ts:captureModelAuthorizationConfiguration` 31-87 is the
  retained initial origin boundary. `output-field-policy.ts:callFieldPolicy` 48-73,
  `prepareOutputPath` 107-143, boolean batch eligibility 145-224 already share proven
  policy work; preserve these optimizations for strict/original modes.
- **C3** `src/acl/output-field-filter.ts`: owner chain 66-72, document resolver
  89-155, request/field evaluator 158-247, metadata request decisions 249-280,
  `authorizeEmbeddedOutputPlan` 282-301, `copyOutputValue` 313-343,
  `copyAuthorizedReference` 345-357, metadata 359-389, helper 417-560.
- **C4** `src/services/service.ts`: `finalizeDirectOutput` 468-564 (source isolate,
  copied grants/context, finalizer intermediate, whole response clone, metadata
  rebuild, graph transfer, second context); `finalizeSinglePopulateTarget` 996-1077
  (actual-object memo + copies); `findOnePrepared` 1363-1566; `findPrepared` 1655-1916
  (correlated copies 1791; contexts 1845; bounded row work 1864).
- **C5** `src/output/finalize-model-output.ts`: `prepareFinalizer` 391-412,
  `finalizeSingleDoc` 414-879; isolate/source graph transfer 433-441; context/metadata/
  grants copies 446-487; child preparation 517-565; stable/per-getter views 660-733;
  safe selected reconstruction 818-840; metadata + association + context 841-868.
- **C6** `src/output/include-output.ts` 17-60; `src/services/base.ts:copyAuthorizedOutput`
  58-62; `src/acl/related-execution.ts:captureRelatedTargets` 50-132 and
  `createRelatedExecution` 143-174. Preserve source/attachment and target admission;
  omit defensive row/target copies only in actual trusted query mode.
- **C7** `src/acl/authorization-snapshot.ts:copyAuthorizationValue` 42-117,
  `matchesAuthorizationSnapshot` 119-128, `outputIdentities` 130-157,
  `tryOutputIdentitiesWithoutSnapshot` 165-236. Full snapshot limits 46/81,
  descriptor/key guards 85-111; ON8 clone-free admission still walks/bounds the graph.
  `src/helpers/document.ts:isolateDocForOutput` 221-235 and BSON roundtrip 85-89 are
  newer observations as well as copies. Retain strict/default behavior unchanged.
- **C8** `src/acl/field-authorization.ts`: rule extraction 8-46, classification
  63-114, `evaluateScopedAccessRule` 117-148 (original receiver, Boolean/catch, full
  grammar), `evaluateEffectiveFieldAuthorization` 150-167. Preserve shared evaluators.
  `src/acl/hook-runner.ts:runVirtualGetter` 68-107 and request hook gate retain current
  bounds/errors. `virtual-populate-execution.ts` source capture, positive raw projection
  126-154 and `readVirtualPopulateInputs` 537+ stay distinct from output authority.

## Verification / timings / identities

Fresh V1, official-before hashes, V2 and initial V7 are recorded in this directory.
Detailed executed results and historical diagnostic disposition are summarized in
`verification-summary.md`; raw result JSON and logs are authoritative. No candidate
speedup, historical security equivalence, historical dependency parity, or whole-
workspace verification is claimed. FP-03/05 must measure active vs same-build ON8/OFF
with unchanged worker workload and validate actual flags/getters/hydration/hooks,
not rely on these before-only times or work counters as a speedup claim.
