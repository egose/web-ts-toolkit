> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-01 ownership contract and current-caller inventory

Scope: investigation only, current HEAD `58b22c0d6d3abd4ecce03533e3867d148ff21233`.
Paths below are repo-relative; `src/` means `packages/access-router/src/`.
These are recommendations for the authorized breaking redesign, not shipped APIs.
The accepted old fast-path differences are not new vulnerability findings.

## Exactly three boundaries: before/after map

| Authority/value | Current owner and observations | Replacement owner/boundary |
| --- | --- | --- |
| Receiving service | `model-service-owner.ts` retains request/core/runtime; `service-execution.ts` executor WeakMap authenticates actual receiver. `readServiceExecution` calls the receiving binding getter again. | KEEP receiver registration and actual receiving request/runtime/model/name/scope check at entry, execution dispatch and related/retry derivation. A parent identity/config cannot vouch for a foreign receiver. Never remove FP-07 guard because preparation is privately owned. |
| Actor | `resolveServiceAuthorization` reconstructs a `Permission` from keys/has, freezes JS fields; derived active calls share it, other derivations recapture it. `Permission`'s TS-private backing properties are ordinary JS properties. `Core.getPermissions` can reconstruct a map, whereas `getGlobalPermissions` reads initialized actor storage. | Boundary 1: capture initialized original actor grants once per independent operation, retain original-request `this`, own literal-boolean map plus frozen keys in actual JS-private storage. Keep `has/hasKey/hasAny/hasAll/keys`; no backing map exposure. All internal reads/children reuse that immutable view, never repeatedly reconstruct it. New callback service calls capture anew; no request actor substitution/elevation. |
| Access/policy | `CallRecord` owns primitive tuple, rows/input/output/related policy. Strict `readServiceAuthorization` recopies broad configuration/policy slices; active uses a private branded shared view. | Boundary 1: one privately owned immutable policy/catalog/grammar preparation per call. Access is projected strings, not caller extensions. Keep separate operation, rows, input, output and related dimensions. Readonly preparation needs no graph equality check on field reads. |
| Config/catalog | Runtime option containers are frozen but native leaves/functions retain identity (`options/manager.ts`). `captureModelAuthorizationConfiguration` snapshots catalog, hooks, virtuals, defaults, populate policies and ten flags. `getCapturedAuthorizationOption` can traverse a function's live `.default`/access slots. Strict slice readers normalize again. | Boundary 1: project/capture all actual lookup slots before first await, including fallback/metadata accesses; function is a callable leaf, never a live option container. Own ordinary grammar containers and catalog per call, not per schema identity. Capture detached private native filter/config values once; clone them when handing them to application hooks/DB consumers that can mutate them. Never leak them via diagnostics. Function closures/model schemas/external services are not immutable. |
| Query/identifier | `prepared-query.ts` exact execution/family tokens, input/mandatory-filter copies, parser/override/base scope, read copies. | Keep private authenticated query/identifier transport and separate mandatory predicates. Own captures at boundary 1 and copies at actual exposure boundaries; do not erase query limits, parse stages, false-denial behavior or transform execution in unrestricted rows mode. Not an output optimization bypass. |
| Source | Strict `StageRecord` copies projected source and repeats `matchesAuthorizationSnapshot`, which itself normalizes natives. Active admits a shallow ordinary root and borrows source; hydrated/unproven paths may copy before hook. `querySources/queryOriginals/referenceOriginals` carry conversion provenance. | Boundary 2: one admitted source and stage identity per row/occurrence. Isolated owns a bounded detached projection, hook gets disposable isolated view; trusted may borrow admitted ordinary projection/hook input. Branch ONLY here; no separate evaluator or output authority lifecycle. Preserve required raw-ref/private-input provenance, but not DTO-authority lookup. |
| Document grants | `DocumentRecord` rich `Record<string,unknown>`; strict resolution/read/field evaluations copy grants repeatedly. Active may retain application map/native leaves. Hook catch currently converts nonplain results to `{}`. | Boundary 2: one descriptor-only literal-boolean normalization into frozen null-prototype package record. All stage callbacks share identical immutable facts. Invalid fulfilled map is controlled 400 WHOLE-map failure outside hook catch. Missing hook -> empty without warning; throwing hook -> empty and fixed-category warning once. No rich leaf/freezing-Date workaround. |
| Field decisions | Two memo paths: strict promise wrappers plus repeated source/binding checks; active settled synchronous hits. Static bool batch has a validation/journal/fallback system to preserve old observations. | Boundary 2: one stage-local pending/settled/rejected memo with actual async only. Key includes request-rule access+full path or output full path. Keep original order/short-circuit, ancestor memo semantics, request metadata distinct from backend grants; no prepopulation past pending/failure. Reject wrong/closed stage with cheap private identity/binding checks, not source/grant graph comparisons. |
| Embedded | `authorizeEmbeddedOutputPlan` derives child call/scope; `owningDocuments` routes ancestor rules to owner; child gets own decisions, parent's grants. | Boundary 2: authenticated child scope and distinct memo/occurrence, shared immutable parent facts and preparation. Same-ID/equal objects are never stage keys. No extra embedded hook family; child reads don't impersonate root binding. Definition scope includes `sub`; private response binding scope does not. |
| Related targets | Captured actual target instance/config/policy and receiving guard; current unsafe capture is inherited from initiating root. Includes/populates have own hook facts. Private populate raw work is grouped/cached by execution family, not grant memo. | Boundaries 1/2: preserve captured target instance/operation/rows/selection/match/join/private policies; target chooses its OWN mode at effective access. Target facts/decision stage distinct. Share immutable actor only and permitted raw fetch work, never parent field/fact decisions. Related target cannot inherit parent's trusted setting. |
| Callback context | `ModelHookContext` combines raw snapshots, hydrated current doc, write data, rich grants, resolved query and live model; active shells borrow leaves. Virtual adds scope/access members. | Boundary 2/3: allowlisted readonly diagnostics below; no raw snapshot/model/config aliases. Mutation lifecycle retains its separate mutable context. Build a new diagnostic shell at each phase; do not freeze arbitrary application data. |
| Getter input/return | Stable base before candidate field callbacks; per-getter `deepIsolateValue`; argument four privately populated projection, per getter/slot; return staging then trimming. | KEEP isolation in BOTH modes; trusted only borrows source, not getter/private views or return containers. Bounded source-to-view copy and bounded selected return admission. Child public outputs before parent getter; no sibling virtual visibility; only returned value becomes output. |
| Publication | Strict finalizer associates DTO, service recopies metadata/includes, then transfers graph associations. Active member builders retain issued roots/spines. | Boundary 3: selected-safe builder, complete children/includes/virtuals/metadata; publish ordinary DTO once. Keep copies needed for callback/per-parent business isolation, NOT copies solely to transfer authority. No DTO WeakMap certificate, issued members, hidden authority properties or public stage handle. |
| Errors/late async | Grant/decision promises memoized, but stages have no terminal close lifecycle. `mapWithConcurrencyLimit` uses `Promise.all`: first rejection does NOT drain other worker promises. `SharedHookGate` DOES drain queued nested children on frame exit. | Private operation publication/failure owner, stage state and drain rules below. Stop admissions, poison whole operation on controlled structural error, drain already-admitted work through existing gates; no late resurrection. Do not claim current `Promise.all` already provides draining. |

### Native observations and copies that must be accounted for

- `authorization-snapshot.ts`: `instanceof` may invoke custom `Symbol.hasInstance`;
  Date `getTime`, Buffer copy, RegExp source/flags, BSON serialize/deserialize (including
  `toBSON`), config Map/Set iterators, Node `isDeepStrictEqual` observations. Source
  snapshot equality is NOT a passive proof across application/native execution.
- `helpers/document.ts`: hydrated `toObject({virtuals:false,flattenMaps:true})` and
  `_doc` fallback; `cloneIsolatedLeaf` Date/Buffer/RegExp/BSON wire copy, ObjectId-like
  clone/constructor/toHexString fallbacks; `deepIsolateValue` Map iteration and object
  descriptors. General helper passes unsupported class instances through: it is NOT
  the new bounded ownership primitive and must not be relabeled as one.
- `trusted-output-materialization.ts`: native brand checks, root descriptors;
  selected Date/Buffer/RegExp; builtin Map iteration; BSON native-family recognition,
  Code.scope/DBRef.fields preparation, byte-storage copy, hooks and wire expansion.
  Keep budget-before-serializer preparation, safe definitions, cycle/proxy/accessor
  rejection and supported min/current BSON families. No deny-value getter reads.
- `virtual-populate-execution.ts`: raw `_doc` ref capture before conversion; separate
  `row.source`, raw fetch groups and `projectVirtualPopulateView`; per-getter private
  arg-four projections. These isolation copies are not obsolete output certificates.
- After redesign a callback's own closure/native work is trusted application code.
  Library-initiated normalization/serialization must be bounded BEFORE it executes.
  `Object.freeze(new Date())` does not stop `setTime`, nor does freezing a Map stop
  `set`, or freezing a wrapper isolate Buffer/BSON bytes. Own leaves privately and
  copy at exposure; do not expose these values in new diagnostics.

## Exact new context contract (C6 amendment)

Retain the name `ModelHookContext` for legitimate MUTATION lifecycle (`validate`,
`prepare`, `transform`, `afterPersist`, `onChange`, `beforeDelete`, `afterDelete`).
It is not an output-context base. Add `ModelOutputContext` for doc-permission
authorization callbacks, virtuals, model decoration and result diagnostics:

```ts
interface ModelOutputContext {
  readonly modelName: string;
  readonly operation: string; // initiating operation, not retry visibility
  readonly receivingModelName: string;
  readonly scopePath: readonly string[]; // definition scope, e.g. ['contacts','sub']
  readonly virtualAccess: string;
  readonly outputAccess: string;
  readonly docPermissionsAccess: string;
  readonly docPermissions: DocumentGrants;
  readonly resolvedQuery?: Readonly<{
    select?: readonly string[];
    populate?: readonly string[]; // canonical requested/admitted path names ONLY
    sort?: readonly string[]; // canonical signed field tokens, not raw objects
    skip?: number;
    limit?: number;
  }>;
}
```

Use literal access narrowing in `ModelVirtualContext` as today. `ServiceOutputContext`
retains its meaningful name but extends ONLY `ModelOutputContext`, no capabilities.
All contained values are primitives, frozen arrays/records and owned frozen boolean
facts, so readonly really can be enforced without lying about mutable native leaves.
Doc-hook context has empty facts BEFORE resolution; later callbacks/result context
have that stage's normalized facts. Never mutate an exposed diagnostic shell in place.
`decorateAll` has empty facts (no single owning row), not a merged/last-row map.

| Every old member | Read/output disposition and replacement | Mutation lifecycle disposition |
| --- | --- | --- |
| `modelName` | KEEP readonly actual receiving name. | KEEP current purpose. |
| `mongooseModel` | REMOVE raw model reference; use captured `modelName`, application-owned model closure or an explicit fresh service operation. | KEEP hydrated business/model hook semantics. |
| `operation` | KEEP readonly initiating operation, always present. | KEEP initiating operation. |
| `originalDocumentSnapshot` | REMOVE, no renamed full-source alias. Doc hook gets its explicit arg-one view; getter gets explicit isolated arg-one dependencies. | KEEP original persisted snapshot used by changes/diff. |
| `finalDocumentSnapshot` | REMOVE, no DTO snapshot/certificate replacement. Use actual already-authorized result data for presentation. | KEEP post-persist/change snapshot. |
| `currentDocument` | REMOVE hydrated/raw backing doc. | KEEP legitimate mutable lifecycle/persistence document. |
| `originalData` | REMOVE from output contexts, including write-derived output. | KEEP original write input. |
| `allowedData` | REMOVE from output. | KEEP admission/validation/prepare data. |
| `preparedData` | REMOVE from output. | KEEP prepared persistence input. |
| `allowedFields` | REMOVE from output (not output authority). | KEEP mutation input paths. |
| `modifiedPaths` | REMOVE from output. | KEEP onChange bookkeeping. |
| `changes` | REMOVE from output. | KEEP onChange records and legitimate values (do not deep-freeze). |
| `docPermissions` | REPLACE rich mutable map with always-present `DocumentGrants`, shared immutable stage facts. | Same boolean fact type when populated; independently writable lifecycle shell, not mutable owned authority. Do not recopy facts per field. |
| `resolvedQuery.filter` | REMOVE; application captures its own intended filter. No raw native filter/policy in diagnostics. | KEEP actual mutation context filter purpose; detach at application exposure, not by freezing Date. |
| `resolvedQuery.select` | KEEP only frozen canonical string tokens. | KEEP original typed lifecycle query. |
| `resolvedQuery.populate` | REPLACE Populate objects/string with frozen canonical path-name array. No model/match/config objects. | KEEP original typed lifecycle query. |
| `resolvedQuery.sort` | REPLACE arbitrary sort value with frozen canonical signed field-token array. | KEEP original typed lifecycle query. |
| `resolvedQuery.skip`, `.limit` | KEEP bounded finite effective numeric primitives. | KEEP current query members. |
| virtual `receivingModelName` | KEEP readonly; now also on general output diagnostics. | Not a new mutation lifecycle field. |
| virtual `scopePath` | KEEP readonly definition scope (`sub` markers), never an owner token. | No change to legitimate lifecycle semantics. |
| virtual `virtualAccess`, `outputAccess`, `docPermissionsAccess` | KEEP readonly actual effective accesses. | Private access tuple not stored on lifecycle shells as authority. |
| `documentAuthorization` | REMOVE type/export/member/helper option; no replacement token. | No mutation-result handle either. |
| `getDocumentAuthorization(output)` | REMOVE child lookup and issued-member registries. Use returned child data, or a fresh target service operation for current document authority. | No write-result child handles. |
| internal `diff` | REMOVE from output shells; keep PRIVATE mutation bookkeeping closure. | KEEP current mutation computation; don't export it as new public authority. |
| internal `fieldPermissionAccess` (`readIds`,`updateIds` Sets) | REMOVE from all callback/result diagnostics; retain private operation metadata-row-gate state. | Private orchestration only, not a new public lifecycle field. |
| arbitrary extra properties/spreads | Do NOT spread lifecycle contexts into output diagnostics. Allowlist fields above. | Application-owned lifecycle state is not frozen/used as authority. |

`ModelDocPermissionsHook` always receives the diagnostic context above, INCLUDING its
pre-write invocation. Its explicit pre-write document argument retains existing hydrated
mutation behavior; output invocations use the selected source admission. Only doc-hook
context access changes; prepare/transform/change/delete contexts keep lifecycle data.
Use separate `ModelOutputHook`/`ModelOutputListHook` for decoration options/deco return
types; keep `ModelHook`/`ModelListHook` where used for mutation chains, not an alias
that keeps rich output contexts alive. Export new fact/field/context types at root
and advanced; processors remains unchanged.

## Public/runtime entry and migration inventory

| Entry/caller inspected | Required disposition |
| --- | --- |
| `Service.find`, `findOne`, `findById` -> private executors/prepared query | One captured call, stage per fetched row. Direct services retain current operation/row rules; do not invent a new blanket initiating operation gate where absent. |
| `Service.exists`, `count`, `distinct`, `countByFieldValues`, explicit `countTrusted`, `_count/_distinct/_delete` | Scalar/identity-only results do not get document-output stages or trusted source behavior. Preserve false-row denial, distinct's static request-only field proof (no field callbacks/doc/backend grants), grouped-count operand bounds and exact counts. `countTrusted` retains its explicitly server-complete-predicate purpose, no wire/prepared capability or new mode. Delete keeps hydrated before/after lifecycle hooks and ID response. |
| `PublicService._list`, `_read`, `_readFilter` | Same engine. Keep request-only option preflight and hydration. READ retry is a NEW document stage at effective LIST access with initiating READ mode and operation; BadRequest/Forbidden never trigger retry. Public decorators/tasks see filtered values and diagnostics, not handles. |
| ModelRouter basic/advanced collection/single/subdocument routes | Existing route variants still guard transport only, before service entry; parse/schema/request limits retained. New/retired modes/control attempts reject before sibling work. |
| `RootRouter.processOp` / all model/data operation maps | Whole-envelope preflight and positive argument forwarding retained. Each entry is independent operation/stage, target base guards remain, DTO serializer omits contexts/input/query. No root mode selector. |
| `Core` + `Base` `genSelect`, `genQuerySelect`, `genPopulate` | KEEP named planning and scope behavior; fetch dependency selection is not field authority. Output planning still defers functions; no doc hook or getters/DB. Ordinary population target request admission remains distinct from output grants/private policies. |
| `Core` + `Base` `pickAllowedFields`, `trimOutputFields`, `genAllowedFields` | Fresh global permissions + EMPTY facts, explicit outputFields policy, selected current values only. No hook, row check, virtual, DB I/O, known-output classification, handle overload or child lookup. `purpose:'output'` contract retained. Reject old option by presence, not truthiness. Metadata cannot supply facts. |
| `Core.genDocPermissions`, `Base.genDocPermissions`, `addDocPermissions`, `addEmptyPermissions`, `addFieldPermissions` | Keep useful explicitly named server utilities, but normalize every actual hook result to DocumentGrants. These do not issue reusable output authority. `addFieldPermissions` must use explicit current normalized facts supplied internally or freshly normalized metadata-as-DATA for its presentation purpose; never recover a stage/cert from metadata or call output helpers as a write allowlist. Utility metadata is not row/admission proof. |
| `Core.resolveFinalizerDocPermissions`; unbound finalizer fallback | Remove obsolete supplied-rich-grant/unbound authority lane as live finalizer design. All integrated callers use one private stage. Explicit generator above is a fresh utility, not a second engine. |
| `Service.captureVirtualSnapshot`, `getVirtualGlobalPermissions`, `getVirtualHookConcurrencyLimit`, `getServiceRequest`, `getServiceModelName`, `getServiceMongooseModel`, `getPermissionsPosture`, `getDocPermissions` | Keep useful non-authority utilities/accessors. Snapshot inspection must be bounded/detached from private call state; internal planning uses captured call preparation, not this inspection result as proof. Global permissions returns immutable fresh actor view, not backing map/per-field reconstruction. `getDocPermissions` remains a metadata DATA reader (including `_view/_edit`, therefore not typed as DocumentGrants), never a stage resolver. Private scheduler/model access stays server-side and cannot set new mode for an in-flight call. |
| `guard({modelName,id,condition})` in `middleware.ts` | IMPORTANT real caller currently `_read`s then interprets returned `_permissions` metadata! Keep document guard feature but evaluate condition inside a PRIVATE fresh read-stage consumer, before stage close, on captured actor + normalized request facts. No metadata recovery, result handle, public callback or extra hidden second read. Strip/expose/presentation cannot forge guard decision. String/function `guard` remains request-only one-arg GuardHook. |
| `create`, `updateOne`, `updateById`, both `upsert` branches | Preserve input policy, separate pre/post stages and operation/access matrix. Create output virtual/create, field/read, doc/create; update output virtual/update, field/read, doc/update. Post-write output uses isolated source in either model mode. No row/input/save/validation/prepare/transform relaxation. |
| Existing-document update input (`resolveInputDocumentGrants`, `requestInputFields`) | DOCUMENT-BEARING pre-write stage retains normalized boolean facts. Blanket empty facts is unsafe for existing negative predicates; see amendment below. Create input has empty facts as today. Post-write stages resolve independently, no reuse of pre-write decisions. |
| `new` / `_new` | Same isolated engine, create/create/create accesses; keep current ignored `args.select` behavior (not a new query-language change). Template doc hook facts normalized; no trust acquired from read-shaped result. |
| `listSub`, `readSub`, `createSub`, `updateSub`, `bulkUpdateSub`, `deleteSub` | Parent/child admission, rows and post-save visibility preserved; output owns parent read-fact stage and per-child scoped decisions, no new child hook family. Create input empty; existing-parent update input stage facts retained. Dedicated origins always isolated. |
| `Service.getSubParentGrants`, `finalizeSubRowsWithVirtuals`, `finalizeSingleSubRowWithVirtuals` | No product callers except each other's obsolete unbound chain; remove obsolete caller-supplied parentGrants/plan bypass rather than maintain third engine. Migrate permanent tests to authenticated dedicated APIs; document removal if reachable in service declarations. |
| `finalizePopulateForSubParent`, `copySubdocumentParent`, `findRawParentDoc`, `getParentDoc` | Keep necessary hydrated/raw parent business APIs and fixed hydration, separate row-scoped orchestration. Private output plans/context need new engine; raw-parent returns are explicitly not filtered DTOs. Do not indiscriminately delete still-used `findRawParentDoc` (four product callers + tests). |
| include/populate/correlated targets in `services/base.ts`, `service.ts`, `include-output.ts`, `populate-target.ts` | Keep mandatory ref/join/match, target operation/row/field/facts, hidden FK cleanup and target-first virtual order. Replace DTO association transfers with private builder handoffs. Copies needed to isolate one parent's finalized child from another are legitimate, not authority-copy savings. |
| private `dependsOnPopulate` (`virtual-populate-execution.ts`) | Keep target-owned read policy, rows, raw exact source refs, batching/family raw-query reuse, target masking and fresh isolated arg-four views. Public related grants cannot elevate this input channel. No public DTO authority cache. |
| `DataCore` `genAllowedFields`/`pickAllowedFields`/`genSelect` + `DataService` aliases and read/list/root routes | Add second frozen EMPTY-facts argument to all field-function invocations. Keep no-model-hooks/no-backend-elevation behavior, whole-container picks and empty selection intersection semantics. Data context `dataName/operation/resolvedQuery` remains its distinct request-only type; not freeze/migrate model lifecycle data into it. |
| `access-router-deco` `@DocPermissions`, `@Decorate`/`@DecorateAll`, `@Context`, `@RouteGuard`, `@ModelOption`/`@DefaultModelOption`, factory wrappers | Doc return -> DocumentGrants, decoration context -> new diagnostics; guard stays one arg. Factory `.apply(target,sparse)` intentionally binds decorated class instance; `@Request` receives original request (do not change to request `this` in class method). Two modes through existing model/default decorators, retired/global/root placement rejected atomically with bootstrap rollback. Prepare/transform/persist/delete decorator injection remains lifecycle context. |
| root/default exports, `advanced`, `processors`, barrels and generated declarations | Remove only DocumentAuthorization capability and obsolete unbound helpers; preserve useful names. Separate field validation from guard Validation (OperationAccess currently extends field access interface: decouple it). Add DocumentGrants/FieldPermissionHook/FieldValidation/ModelOutputContext and decoration hook types consistently. Verify all conditional declarations, not just source barrel. |
| `permissionsPlugin`, `_permissions`/custom dotted metadata, tasks/processors, serializers | Metadata is DATA/presentation only. Keep request-user boolean facts and `_view/_edit` maps, explicit exposure/strip behavior, safe alias construction, no backend grants in metadata. Tasks and presentation are trusted output construction, no stage revival. Public serializers still omit internal result envelopes. |
| Internal service result `query` / mutation result `input` (outside `context`) | Retain useful service diagnostics and checked-success/error shapes; public serializers continue omitting both. Detach native query/input values from private captured authority at this actual exposure boundary. A returned native query leaf is mutable application DATA, not a frozen policy reference; not another full document snapshot. |

### Mandatory C3 clarification: preserve document-bearing write admission

Replace C3's ambiguous “request-only data, input and standalone-helper” sentence with:

> Request-only data, create/raw-input schema helpers and standalone output helpers
> receive frozen empty facts. Existing-document update/upsert-update and dedicated
> existing-parent subdocument admission are document-bearing pre-write stages and
> retain their own normalized boolean document facts, including function AND string
> rules. They never borrow post-write/output facts or grant rows/input authority
> from a returned DTO. Output stages are independent. No other write admission,
> persistence or lifecycle behavior is relaxed.

Evidence: `service.ts:2525-2532`, `model-input-admission.ts:348-377`,
`model-subdocument-service.ts:104-124`, `select-resolution.ts:29-46`. Emptying these
facts could allow `!grants.suspended`; it is not necessarily a stricter denial.
No consumer decision is needed to preserve the plan's express no-relaxation scope.

## Installed documentation/type migration inventory

Inspected package metadata/tsup/entrypoints and README, not just the task prose:

- `packages/access-router/package.json` publishes README/llms/dist ONLY today. Add
  MIGRATION.md allowlist and installed README link; preserve bundled ESM/CJS and
  conditional root/advanced/processors declarations. New document is not shipped yet.
- README current old flag sections (snapshot/copy/fast groups), runnable old retained
  handle example, service-authority/helper/child-handle descriptions and virtual/
  private-populate examples must migrate to actual new APIs. Preserve historical
  task evidence; don't leave old live guidance as a deprecated compatibility path.
- `packages/access-router/llms.txt`, public JSDoc in base/access/root/router-hooks/
  service-authorization, source barrel + generated declaration consumer fixtures all
  need the same fact/context/helper/mode contract. Existing types cannot express the
  second field-hook arg; shipped new field type must be independently consumable.
- `packages/access-router-deco/README.md` currently promises rich DocPermissions and
  `@Context()` lifecycle currentDocument even for doc/output hooks. Replace hook table,
  context/native/isolation guidance, class-method return examples and mode properties;
  keep trusted class-instance binding/request injection and prepare lifecycle roles.
- Matching website pages (`website/docs/packages/access-router-runtime.md`,
  access-router-deco.md and related access-router guide directory) are SECONDARY,
  not substitutes for installed migration/README/declaration discoverability.
- OAR-08 executable M1–M5 examples need packed public imports, actual models/runtime/
  request setup and loadMembership implementation, checked success/error handling,
  bool callback + prefixed string rules, raw-helper empty facts/explicit output grants,
  fresh read counts, related/deco/mode rollback and post-save controlled error caveat.
  Old imports/options fail in separate negative fixtures; no any-casts, suppressed
  declaration errors or deep source/dist import migration recipes. New field facts
  and context types must exist before writing examples that purport to compile.
