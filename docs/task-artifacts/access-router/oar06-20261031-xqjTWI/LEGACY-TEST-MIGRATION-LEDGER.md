> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-06 semantic migration and regression ledger

This is configuration/admission completion, not a full V3/V4/V7 pass. The
permanent package test configurations were not changed. No permanent test file
was deleted, renamed, broadly skipped or excluded. All 23 core and four deco
files in the final focused gates run in full, with zero failed/skipped cases.
The separate packed run deliberately selects the two existing OAR-04/05 gates;
its eleven broader, later-owned cases remain unselected, not accepted.

## Actual test-file changes

Six existing core option suites and the existing deco default-option suite were
semantically migrated. Four permanent files were added:

- `packages/access-router/test/owned-authorization-modes.unit.test.ts` — 142 cases.
- `packages/access-router/test/owned-authorization-modes.integration.test.ts` — 25 cases.
- `packages/access-router/test/owned-authorization-runtime-profiles.unit.test.ts` — 10 cases.
- `packages/access-router-deco/test/owned-authorization-modes.test.ts` — 43 cases.

The two large private-option unit files were replaced in place, not removed
from test discovery. Their exact incoming bytes are retained under `before/`;
`archived-original-identities.json` verifies each against `product-before.json`.
The remaining five existing test-file changes are ordinary in-place migrations.
No claim is made that a lower case/file/line count itself proves equivalence.

## Retired option inventory

The ten names exist in live source only in the core/deco private rejection
inventories, never defaults, public declarations, warnings or engine selection:

1. `unsafeSkipListDocumentSnapshotChecks`
2. `unsafeSkipReadDocumentSnapshotChecks`
3. `unsafeSkipListOutputSnapshotChecks`
4. `unsafeSkipReadOutputSnapshotChecks`
5. `unsafeSkipListNestedDocumentSnapshotChecks`
6. `unsafeSkipReadNestedDocumentSnapshotChecks`
7. `unsafeSkipListInitialOutputSnapshotCopy`
8. `unsafeSkipReadInitialOutputSnapshotCopy`
9. `unsafeUseListAuthorizationFastPath`
10. `unsafeUseReadAuthorizationFastPath`

Every retired control errors by presence, including false/undefined, inherited,
non-enumerable, accessor and dotted forms. New mode controls reject outside
model/default-model settings. Literal `isolated`/`trusted` and undefined
restoration replace coercion, prerequisite combinations and dormant states.
Business field/permission-schema/predicate names are not renamed or removed.

## Explicit removal/consolidation map

| Incoming suite / old premise | Retained proof and deliberately changed expectation |
| --- | --- |
| `authorization-fast-path-options.unit.test.ts`: six/two/eight plus two/ten inventories and 256 old masks × four new pairs. | The 64-case file now checks two mode keys/ten rejection-only names, all four READ/LIST pairs, own target access modes, embedded inheritance and READ retry. The 26-case query option file adds the full 16 source/target mode pairs with actual source-view mutations at multiple target/embedded/retry edges. Old masks/prerequisites have no supported state and are replaced by explicit ten-key rejection, not ignored flags. |
| Same file: literal true/truthy normalization, native prerequisite coercion and off/dormant/active reads. | Exact literal enums and undefined restoration; invalid scalar/object/native-like/coercible values reject before observation/publication. Both modes authenticate repeated request/runtime/model/name/scope reads and forged calls. No prerequisite/missing-mask reader or warning survives. |
| Same file: invalid related paths/models/scopes/accesses silently fell back to strict mode. | Actual target model identity, path, embedded membership/access and parent/receiver bindings reject with controlled errors. A model is the actual Mongoose function, not a copied `{}` stand-in. Positive exact targets remain. |
| Same file: issued handles retain native/rich grants, graph association/child lookup and output-copy choices. | One private stage receives source-mode-specific input; both modes own normalized boolean facts, return diagnostics only and reject removed handle options. Closed stages reject. Raw helpers are always isolated, fresh, empty-fact evaluation; no DTO-based memo/authority recovery. Native source mutation and selection positives remain. |
| Same file: missing-mask transition warnings, truthy prerequisite changes and reentrant warning signatures. | Fixed `trustedAuthorizationSource` owner/access warnings only on effective transitions into trusted. Defaults and all inheriting models commit before any warning; explicit isolated overrides remain, lazy model owners warn once, same assignment/calls/isolated restoration do not warn. Reentry observes the already-captured transition; logger throws do not affect committed state. |
| Same file: only the two fast flags were covered in defaults/control/Object.prototype lanes. | All twelve new/retired names cover public/direct service/helper/policy/default/include/populate/subquery lanes, inherited/non-enumerable/accessor forms, dotted bulk paths, proxy prototypes, and zero work before rejection. Existing cycles, depth/array limits, business predicates, selection and backend scoped/unrestricted policy positives remain. |
| `query-snapshot-options.unit.test.ts`: 64 independent six-flag source/output/nested masks and origin-wide target inheritance. | Source-only modes replace the separate lifecycle switches. Related targets select their own captured model mode at effective access; genuine embedded scopes inherit. Multi-hop targets, READ retries and nonquery read-shaped output remain explicit. Actor identity is retained across target edges; facts are owning-stage-local or genuinely embedded, not same-ID/target shared. |
| Same file: graph/context/transfer membership and rich detached grant mutation assertions. | Removed capability mechanisms have no replacement alias. Private stage facts, immutable actor, authentic child-plan membership, exact receiving owner rejection and fresh helper behavior preserve the security purposes. Rich fulfilled facts reject; raw helpers and normal current-document queries remain different contracts. |
| Same file: late setters refreshed origin-wide child flags or a same-spelled global option was ignored. | In-flight source and target captures persist independently; new calls capture new model/default values. Global/data/root mode/control settings reject instead of being ignored. Source business names remain inert. |
| `authorization-fast-path-options.integration.test.ts`: old four flag pairs and source-wide target profiles. | All four mode pairs run direct find/findOne/findById, public list/read/readFilter, READ retry, generated HTTP and root batches with target-local modes, embedded scopes, row/field/selection denial and target guards. Same-receiver reentry across all six query entries is a fresh call; independent READ inside a write hook is fresh, while actual writes/new/dedicated output stay isolated. BadRequest and Forbidden READ results never retry as LIST. |
| Same file: retained handles after awaited rollback and only two wire flags. | Source/target captures survive await independently; contexts have no handles; helper work does not run doc hooks. All twelve controls reject on wire/root/JS entry paths before sibling dispatch; stored Boolean fields of the same names remain queryable and never select a mode. |
| `query-snapshot-options.integration.test.ts`: 16 four-flag masks plus four initial-copy masks/child handles. | Four source mode pairs and two uniform publication profiles preserve source/target tenant filters, owned/unowned target denial, selected embedded fields, target operation denial, root responses and mutable ordinary DTOs. Same/spread/replaced DTO children supply no facts; fresh target helpers omit doc-dependent secret fields, while explicit scoped output grants remain supported without hooks. Initial-copy flags now reject; neither mode exports a copy/certificate option. |
| `default-model-options.unit.test.ts`: eight skip options treated as booleans. | The four unchanged posture/selection/sort booleans remain fully exercised. Ten retired keys reject atomically; the two new modes use every getter form, inherited updates, explicit isolation and independent undefined restoration. Nonboolean defaults, shallow replacement, permission metadata classification, operation fallback, snapshot inheritance provenance, virtual clearing and whole proposed private-populate validation are retained. |
| Same file: handle reuse and source/output mutation comparisons after default changes. | Actual isolated/borrowed hook input determines captured Boolean facts across the await. Later default changes affect new captures, not the old stage; closure rejects. No output handle is reconstructed. |
| `default-model-options.integration.test.ts`: eight unsafe warning categories. | Existing generated route/selection/sort/metadata/posture positives and denials remain. Two independent trusted default modes warn for default owner and inheriting model only; explicit isolated/false overrides and router construction snapshots remain intact. |
| Deco `default-model-options.test.ts`: six skip flags inherited while explicit false won. | Four existing boolean settings remain; two modes inherit with explicit isolation/undefined restoration, and all ten old keys reject before bootstrap publication. Class mode getters, invalid/scalar/dotted/inherited/non-enumerable/proxy options, global/default scope, rollback, class `this`, original request injection and readonly contexts are separately checked by the new 43-case file. |
| `authorization-fast-path-runtime.unit.test.ts` profile groups: active-only omissions and mutable Date grants could change denial/retained decisions. | Profile premises are ported into the new ten-case runtime profile file: six rows/24 fields, one hook per row, exactly one raw fact admission, original actor, distinct same-ID facts, embedded denial/selection, 12 isolated vs zero trusted whole-source materializations, ordered async predicates, immutable facts and fresh helper decisions. Rich/native fulfilled grants reject instead of changing later predicates. Fetch-only Date/BSON normalization still has an explicit source-only difference in facts computed by the hook. The original mixed mechanism file is NOT called migrated/passing. |
| READ/LIST snapshot config and initial-copy config portions of mixed mechanism suites. | Their old scalar opt-in/coercion/inheritance/warning/await/output-handle premises are covered by exact modes/default restoration/owner warnings/getter/native capture and explicit all-ten rejection in the new modes/default/option suites. There is no supported initial-output-copy selector. Their remaining source equality, transfer/membership, owner, native and memo mechanisms require OAR-07 semantic migration below; these whole files have not been run or deleted. |

## Regressions first and retained failures

| Evidence | Actual result / disposition |
| --- | --- |
| `regression-before-01.log` | 112 loaded cases: 54 failed / 58 passed. Dotted bulk/public controls accepted; proxy prototypes executed traps; service defaults accepted controls; function-attached hook slots were scanned; native configuration replaced the actor before capture; HTTP dotted requests succeeded. Same-named persisted field and basic in-flight source positives passed. |
| `source-types-01.log` | One TS2345 after the first implementation, from narrowing through a local rejection closure. Direct shape throw fixes it; final source compilation passes. Not relabeled as an incoming failure. |
| `regression-after-01.log` | 100 passed / 12 failed, all a new fixture's empty-defaults `toBe` identity assumption. The getter legitimately creates an empty fallback each time. The fixture now first installs a real valid defaults bag and proves its identity survives rejection. |
| `deco-regression-before-01.log` | 28 loaded: 26 failed / 2 passed. Mode getters were invoked, invalid later values permitted earlier global attempts/warnings, and inherited/non-enumerable metadata could disappear before validation. Preflight validates/captures every property/metadata option before setters and never invokes a mode getter. |
| `data-regression-before-01.log` | Twelve selected DataService cases failed (105 unrelated cases unselected for diagnosis). find/findOne/findById discarded controls and ran request work. Direct call preflight now returns controlled 400 before identifiers/filter/field work; stored datasets remain a separate business-data lane. |
| `sub-snapshot-regression-before-01.log` | Thirteen selected cases failed (117 unselected): nested bootstrap defaults restored and changed globals, and dedicated proxy options executed a trap. Whole snapshot preflight and dedicated policy admission now run before restore/copy/reflection/native work. |
| `raw-parent-regression-before-01.log` | Twelve selected cases failed (130 unselected). Raw parent query args discarded controls and reached the adapter. The retained explicit raw business API now rejects controls before I/O while allowing same-named predicates; no hidden output-helper query was introduced. |
| `focused-01.log` | 961 passed / 33 failed, from migrated fixtures: a fake plain target model was copied, a fabricated embedded plan was correctly rejected, and controlled BadRequest detail was incorrectly asserted against `error.message`. Actual model functions/genuine admitted plans and exact error results fix these fixtures without a runtime workaround. |
| `migrations-02.log` | 104 passed / four failed. Synthetic nonquery operations used unrecognized upsert/new/subRead/subList output accesses and consequently had no admitted child plan. Their read-shaped-output test now uses the intended effective READ access, retaining initiating nonquery operation. |
| `deco-03.log` | 135 passed / six failed from the still-old deco default flag expectations. All six are explicit breaking migrations, now included in the sixteen-case default file's mode/retired-key assertions. |
| Final gates | 1,016 core / 23 full files; 147 deco / four full files; two packed gates / sixty actual HTTP requests all pass. No failures were discarded or permanent suites skipped to get these results. |

## Precisely remaining later migration

`remaining-deleted-module-imports.json` enumerates eighteen current runtime test
files that still import deleted private modules. They remain untouched by this
task, are not accepted as passing, and must be migrated or consolidated with
precisely retained proof in **OAR-07 before full OAR-09 V3**. Do not restore the
deleted adapters to make them load:

1. `authorization-fast-path-owner.unit.test.ts`
2. `authorization-fast-path-runtime.unit.test.ts`
3. `authorization-fast-path-runtime.integration.test.ts`
4. `document-authorization-validation.unit.test.ts`
5. `embedded-preparation-boundary.unit.test.ts`
6. `finalizer-preparation.unit.test.ts`
7. `initial-output-snapshot-copy.unit.test.ts`
8. `list-snapshot-checks.unit.test.ts`
9. `output-field-policy-cache.unit.test.ts`
10. `output-publication-fusion-withdrawal.unit.test.ts`
11. `read-snapshot-checks.unit.test.ts`
12. `service-authorization-context.unit.test.ts`
13. `service-authorization-reads.unit.test.ts`
14. `service-list-preparation.unit.test.ts`
15. `service-snapshot-builder.unit.test.ts`
16. `snapshot-review-regressions.unit.test.ts`
17. `snapshot-validation-amplification.unit.test.ts`
18. `static-output-field-batch.unit.test.ts`

These paths are relative to `packages/access-router/test/`. The unchanged
`list-snapshot-checks.integration.test.ts` and
`read-snapshot-checks.integration.test.ts` also still configure old flags and
need their authenticated DB/owner/selection/native concerns ported. Preserve
unique same-ID/memo/pending-failure/binding/hydration/metadata/write/target and
concurrency assertions; a matching new profile label alone is not their proof.
Configuration premises are mapped above, not silently treated as supported old
behavior. Other old snapshot comparator/builder tests need their own actual
mechanism review, not blanket deletion.

OAR-08 still owns README/llms/MIGRATION/deco/website guidance and old installed
consumer examples: `authorization-fast-path-consumer.types.fixture.ts`,
`service-authorization-consumer.types.fixture.ts`,
`output-publication-fusion-withdrawal.types.fixture.ts`,
`documentation-examples.test.ts`, broader export/packed/guide tests. Strings in
negative export assertions and the owned removed-API fixtures are intentional
absence/rejection checks, not requests to restore old controls. The original
`authorization-fast-path-runtime.unit.test.ts` is a mixed mechanism suite with
profile premises ported separately, not a newly passing complete file.

`service-authorization-finalizer.unit.test.ts` remains the already-migrated
45-case OAR-05 file and passes; do not list it as entirely unmigrated. OAR-09/10
own full allowed-package integration/peer/performance gates and independent
acceptance. No candidate latency/CPU/allocation measurement was made here.
