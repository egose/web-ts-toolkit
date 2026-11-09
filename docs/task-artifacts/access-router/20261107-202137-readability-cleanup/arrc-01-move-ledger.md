# ARRC-01 — approved compatibility and move/name ledger

Baseline: `28f7266fc010b7e3f14664fcc452d50bdcae0fde`. This approves boundaries for
ARRC-02–05, **not their implementation or final acceptance**. Paths below are under
`packages/access-router/` unless qualified. No source/test changes were made here.

## Frozen seams and keep list

- Keep the entire package manifest, the `.`, `./advanced`, `./processors` export
  conditions and entrypoints. `Service` is indirectly public: `dist/index.d.ts:144–145`
  returns `Service`/`PublicService`; the complete classes live in the shared
  `parsers-fSBARZSn.d.ts`/`.d.mts` declaration chunks, not only `index`.
- **Every existing public, protected and declared-private class member is a keep**:
  exact ordered names, visibility and kinds are enumerated in
  [the exhaustive keep/caller inventory](arrc-01-callers-and-keep.json)
  (`classMembers`: Service 89, PublicService 29, Base 62, including fields,
  accessors, overloads, constructors and native-private brands). Keep method argument
  positions/types/default evaluation, class member order and all declaration bytes.
  Do not add a new class method to house an extraction.
- In particular, keep `Service.finalizeDirectOutput`, `finalizeSinglePopulateTarget`,
  `finalizePopulatePath`, `finalizePopulateForSingleDoc`, `beginOp`, `completeOp`,
  `asServiceHookContext`, `getFieldPermissionAccess`, `getAccessibleIdSet`,
  `registerPopulateRecipients`, `populateTargetIdentity`, `isScalarPopulateValue`;
  public `finalizePopulateForSubParent` and all CRUD/subdocument entries remain.
- Keep protected Service seams `model`, `options`, `baseFields`, `baseFieldsExt`,
  `createModelAdapter`, `getModelRouterOptions`, `resolveEffectiveSelect`,
  `captureRelated`, `isValidDistinctFieldName`, `authorizeDistinctField`.
  Keep Base owner fields and all inherited hooks/overrides, including `genFilter`,
  `decorate`, `decorateAll`, `prepare`, `transform`, `afterPersist`, `changes`,
  `processInclude`, `includeDocs`, `includeCorrelatedDocs`, `parseClientData` and
  `getCorrelatedExecState`. The inventory includes the remaining unchanged members.
- Keep finalizer module exports `VirtualFinalizeAccess`, `FinalizeSnapshot`,
  `FinalizeModelOutputArgs`, `FinalizeModelOutputsArgs`, `finalizeModelOutput`,
  `finalizeModelOutputs`; keep `PopulateTargetMeta` and `OpLogContext` unchanged.
  New helpers/types must not enter public barrels.

`Base` registers owner identity and invokes `bindModelOwnerMethods` during `super`
(`services/base.ts:551–559`), before Service fields/constructor work. The binding
walks subclass-first prototypes, captures each method and installs wrappers on the
**real instance** (`acl/model-service-owner.ts:134–159`). Nested non-query calls retain
dispatch; `find`, `findOne`, `findById`, `_list`, `_read`, `_readFilter` start fresh
dispatch even under reentry. Preserve options/permissions/populate-policy capture,
receiver lookup and WeakMap ownership. No prototype calls, early method binding,
replacement service objects, constructor moves or new import-time effects.

Declaration comments also affect the byte freeze. Put readability comments inside
method bodies; do not casually edit JSDoc copied into public declaration chunks.

## ARRC-02 — completion only, at the existing callback boundary

| Old implementation | Approved destination/name | Stays in Service |
| --- | --- | --- |
| `finalizeDirectOutput`'s `completeOutput` body, `service.ts:585–632` | Internal `services/model-output-metadata.ts`: `createModelOutputMetadataCompletion` returning the completion callback | `finalizeDirectOutput` itself; access/configuration capture; private association stage exclusion; all finalizer inputs; `onFinalized`/context capture; returned `{ data, context }` |

Exact helper surface: a private `ModelOutputMetadataInput` structural view of the
**original args reference** (`doc`, inclusion flags, private association path,
`budget`, `publication`), already-captured `binding`/metadata configuration, plus:

- `readFieldPermissionAccess: () => this.asServiceHookContext(context).fieldPermissionAccess`
- `queryFieldPermissionAccess: (ids, publication) => this.getFieldPermissionAccess(ids, publication)`

Those arrows are synchronous forwards and resolve the service methods when invoked,
not at factory construction. No Service value import, lifecycle-context parameter,
new service container or copied/early-destructured flags/source/IDs. Internal helper
types may describe the two ID sets; they are not authority or a new public type.

The factory is synchronous, reads no live input/stage data, and is called **at the
existing `completeOutput` property position**. Return its async callback directly;
do not use an async factory/trampoline or await a helper from another async wrapper.
This moves the existing async body rather than adding a promise/adoption hop.

Preserve this completion sequence, including repeated reads and short circuits:

1. `readDocumentStage` grants → `getIncludeSource(args.doc)` → private association
   output removal → `restoreIncludeOutput`.
2. Resolve metadata path; unset old metadata; remove generated alias; only then
   strip early-return. Compute exposed keys/depth and admit metadata root/path.
3. Debit each grant key even when not exposed, then define permitted keys.
4. Only when field maps are requested/enabled, read the context's current ID sets;
   on absence **only**, await the receiver's singleton field-access query. Preserve
   `source._id` reads before that call and after its await for `String(source._id)`.
5. Preserve the nested async map and `_view` then `_edit` awaits, field-path queries,
   empty-map debits/placeholders, disabled/unrequested behavior and final alias attach.

Do not move `getFieldPermissionAccess`/`getAccessibleIdSet`, batch bulk-CREATE reads,
change LIST's existing ID-set reuse, hoist stage reads or close the stage here.
Finalizer post-completion validation/closure remains `output/finalize-model-output.ts:458–464`.

**Approved smaller alternative:** name the same async completion block lexically
inside `finalizeDirectOutput` and pass that callback directly. Prefer this if the
factory's forwarding surface adds more coupling than clarity; retain its existing
closures and read/await sequence, and record that choice. A new module is optional,
not a reason to add wrappers or broaden scope.

## ARRC-03 — local roles, not a new traversal owner

Approve **parameter/local vocabulary plus argument-role comments**, retaining all
three method signatures' positional shape, types, defaults and dispatch calls.
This is the smaller allowed cleanup; no runtime grouping object/new collaborator
is needed merely to forward the same values.

| Scope | Approved old → new names |
| --- | --- |
| All three populate helpers | `meta` → `targetMeta`; `parentOperation` → `initiatingOperation`; `parentContext` → `parentHookContext`; `budget` → `receivingBudget`; `references` → `completedReferences` where present |
| `finalizeSinglePopulateTarget` | `rawTarget` → `targetValue`; `originalTarget` → `sourceTarget`; `outputDepth` → `receivingDepth`; `originalKey` → `sourceIdentity`; `owner` → `publicationOwner`; `cacheKey` → `targetIdentity`; `recipients` → `receivingOccurrences`; `selectedBudget` → `targetConstructionBudget`; cached `source` → `cachedTargetOutput`; `pending` → `pendingTargetOutput`; `finalized` → `finalizedTargetOutput` |
| `finalizePopulatePath` | `current` → `traversalValue`; `segments` → `pathSegments`; `segIdx` → `segmentIndex`; `original` → `originalNode`; `child` → `traversalChild`; `address` → `outputAddress`; lexical `finish` → `finalizeLeafValue`; `originalChild` remains explicitly original |
| `finalizePopulateForSingleDoc` | `doc` → `receivingDocument`; `segments` → `pathSegments` |

Apply role-group comments at the corresponding positional callsites: traversal
value/path position; target metadata and initiating execution; original provenance;
completed-reference/receiving-budget/publication; output address/depth. Keep operands
in their existing order. Rename default references mechanically (`sourceTarget =
targetValue`, `originalNode = traversalValue`); preserve `outputAddress = []` timing.
Keep `hookLimit`/`sharedGate` parameters and forwarding even though the target body
does not consume them—deleting them or skipping argument evaluation is not this task.

Required distinctions: path index does **not** advance through arrays, but output
address/depth does; original provenance is not the target value being finalized;
target mode/policy is independent of parent mode and initiating operation;
per-occurrence receiving budgets are not the combined target-construction budget.
Keep all four instance WeakMaps, exact identity lookup, preregistration, pending
promise cache insertion, cleanup callbacks, scalar/native paths and mandatory
write-source detachment in place. No context/data copies, extra caches or recursion
abstraction. Do not rename fields of `PopulateTargetMeta` or receiving occurrences.

## ARRC-04 — keep eager expressions local

**Approve no new logging module:** 32 cohesive lines already share logger mechanics
in `logger-helpers.ts`; another module would need a service model-name accessor to
avoid hoisting reads, adding indirection without separating a substantial policy.
Implement local type aliases such as `ServiceOperationStartExtras` and
`ServiceOperationCompletionExtras` for the existing `Omit<OpLogContext, ...>` types,
plus short body/section comments. Keep `beginOp`/`completeOp` and their object literals.
This permitted smaller implementation is still work for ARRC-04, not a no-change
decision silently satisfying its dependency.

- Begin: caller argument/extra evaluation → `Date.now()` → `this.modelName` →
  `summarizeFilter(filter).filterKeyValueCount` → `startedAt` → extra spread → debug.
- Complete: caller arguments → `this.modelName` → eager summary → `Date.now() -
  startedAt` → result code → extra spread → debug.
- Debug: resolve logger for level check (correct receiver/throw fallback); only if
  enabled, resolve logger **again**, resolve debug/fallback handler, build the
  cardinality-only message, safely apply with the existing receiver.

Keep disabled summaries, both clock positions, live logger/options reads, midcall
level changes, replacement/missing/throwing logger behavior and duration accounting.
No lazy contexts, memoized levels, captured model names, summary hoists, fresh log
events or changes to `logger-helpers.ts`/public `OpLogContext`.

## ARRC-05 — lexical finalizer names only

| Current module-local name | Approved name |
| --- | --- |
| `Preparation` | `FinalizerPreparation` |
| `prepare` | `prepareFinalizer` |
| `finalizeSingleDoc` | `finalizeOutputDocument` |
| parameter/local `prepared` | `preparation` (optional consistent local rename) |

Only `output/finalize-model-output.ts` uses these lexical symbols. Update its
embedded recursion and both exported entry bodies; do not rename Base's public
`prepare`, module exports or `Preparation.resolve`/configuration fields. Comments
may distinguish captured configuration, prepared resolver inputs, per-stage facts,
bounded materialization and publication settlement. Preserve preparation callsites,
all branches/checks/awaits, native/budget/reentry rationale and error/log text. No
preparation sharing or revived withdrawn optimization.

## Caller review and downstream gates

The read-only search covered 1,473 tracked code files repository-wide; no external
or test callsites name the twelve relevant private Service methods. All 68 calls
and their actual argument expressions are in the caller inventory:

- `finalizeDirectOutput`: `findOnePrepared`, `findPrepared`, `createPrepared`,
  `new`, `updateOnePrepared` (plus its existing indexed return-type reference).
- `finalizeSinglePopulateTarget`: two leaf paths; `finalizePopulatePath`: its two
  recursive paths and `finalizePopulateForSingleDoc`.
- `finalizePopulateForSingleDoc`/recipient registration: sub-parent entry, constructor
  subdocument executor, READ, LIST, CREATE and UPDATE prepared workers.
- `beginOp`: private single fetch, LIST, UPDATE, UPSERT, DELETE. `completeOp` also
  covers the private condition reader and all current error exits.
- Field-access/as-context/identity/scalar helper callers are individually enumerated;
  no cross-module private rename is needed. Existing finalizer imports in Service,
  subdocument output, Core/types and 13 test files stay unchanged, including the
  namespace spy in `output-publication-fusion-withdrawal.unit.test.ts`.

Before each later handoff: affected V1 families and scoped lint, unchanged test
assertions, byte/path comparison of **all eight declarations**, unchanged manifest,
and relevant per-ID work/trace comparison against
[the fresh baseline](arrc-01-work-baseline.json). Keep all 16 mode tuples, fallback,
both UPSERT branches, parent/target mixed modes and both write modes' detachment.
ARRC-06 still owns independent review and the one final full package run. No
performance campaign or speedup claim is part of these approvals.
