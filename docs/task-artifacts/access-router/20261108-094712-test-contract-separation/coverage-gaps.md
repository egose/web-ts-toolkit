# Public behavior matrix and bounded ARTS-04 work

**ARTS-01 finding, not completed contract coverage.** All references below are at
`fe50475fd026d70aad52bc54b1c6d3d41dbc885b`. Test filenames are under
`packages/access-router/test/`; README/MIGRATION references are package-relative.
The [file ledger](classification.md) supplies each original's planned layer.
“Existing public” means eligible after the listed import/path-only repairs, not
that the current mixed suite already has an enforced public boundary.

## Surface and behavior inventory

The [surface inventory](public-surfaces.json) records **46 root, 48 advanced and
6 processors runtime exports**, and **200 / 336 / 17 explicitly named declaration
exports**, respectively. Declaration counts include runtime names and type-only
names; they are not counts of required runtime constructors. All three export-map
conditions and package-name resolution remain part of the contract.

| Surface / documented obligation | Existing public evidence to retain | Lower-layer evidence / remaining public gap | ARTS-04 action |
| --- | --- | --- | --- |
| Root default/named facade, `AccessRuntime`, isolated/default registries, instance/name router overloads, `combineRoutes`, plugin initialization | `runtime-isolation`, `runtime-permission-handoff`, `retained-model-service-ownership`, `side-effect-initialization`, `data-router`, `schema-mutation.regression`, `model-router` families; README 51–263, 2304–2401 | Some export assertions share `export-contract` with private serializers. No new runtime/API is needed. | EXPORT; retain installed/tree-shaking tests. |
| Global/model/default setters/getters, router fluent setters, live inheritance, exact undefined restoration, frozen construction snapshots, atomic failure | `options-ownership`, `hydration-configuration`, `virtuals-config`, public population binding/dependency suites; README 140–263, 338–345 | `default-model-options.integration` fixes warning order; `.unit` and nested-access admission suites also inspect private captures/readers. | CAPTURE + ADMISSION; retain complete originals below contracts. |
| Four independent READ/LIST/CREATE/UPDATE modes, correct executed UPSERT branch, no implicit input elevation | `query-snapshot-options.integration`, `read-snapshot-checks`, `list-snapshot-checks`, `authorization-fast-path-runtime.integration`, public input/virtual/write suites | Public query pair rows do not execute the 16 write tuples or prove borrowed-versus-disposable views. Private CRUD harness is not public evidence. | MODE, CAPTURE, FALLBACK, DETACH; explicit tables below. |
| Target-owned READ/LIST modes, source/target policy independence, ordinary population and legacy/correlated includes, write-origin target detachment | Public population Q/D/binding/nested-target/dependency/review, private-populate runtime/review, related/direct/provenance, virtual intent/parity suites | Existing mode fixtures often set target READ=LIST or use private mode observers; mixed write target/native tests use constructed stages. | TARGET + DETACH; target READ and LIST must vary independently. |
| Model query/direct/advanced/root CRUD, NEW, count, exists, distinct, grouped count, sorting, pagination, fixed routes | `model-router`, `model-router.routes`, `root-router`, `root-router.variants`, `root-distinct.authorization`, `service-exists`, public sort/basic-list/pagination/grouped-count suites | Whole-value composite DISTINCT file includes Permission-prototype fault injection; private pagination helper tests are not contracts. | DISTINCT only; existing real route pagination/count/sort coverage remains. |
| Terminal false/Forbidden, no retry or unauthorized reads/writes, mandatory rows/identifiers/transforms, READ-to-LIST fallback | `read-list-fallback-authorization`, `read-snapshot-checks`, `service-exists`, `service-authorization-baseline`, public input/direct/related/literal suites; README 1321–1428, 1791–1820, 3467–3491 | Private denial/prepared/filter truth tables and exact helper absence stay lower-layer. Fallback mode borrowing is not distinguished by equal DTOs. | FALLBACK + CONTROL; observe application models, not package helper dispatch. |
| Nested operation access: basic/advanced/root vs base policy, root admission, child field precedence, request receiver/defaults, custom routes and HEAD | `operation-access-baseline`, packed operation-access smoke, README/MIGRATION executable operation examples, public model/data/root/child suites; README 1828–2171; MIGRATION 13–245 | Full route matrices observe service construction/private dispatch; nested resolution/admission/capture files call private readers or construct permissions. | ENTRY + ADMISSION, a representative real-path panel, not all old route combinations again. |
| Request-acquired backend and public services: independent rows/input/output/related authority; ordinary select; dependencies; immutable diagnostics; no DTO authority | `service-authorization-baseline/direct/input/related/subdocuments`, `document-permissions-dependencies`, installed helper/README/MIGRATION workflows; README 597–918, 1035–1379 | Boundary/migration/final-review/rows files mix real behavior with private adapters/prepared calls. Invalid fulfilled facts and generic transport contamination need a public sample. | FACTS + CONTROL + DTO; no private constructors/capabilities. |
| Dedicated child list/read/create/update/bulkUpdate/delete: parent/child access, membership, hidden committed writes, visibility, IDs and limits | `model-subdocument-routes`, `service-authorization-subdocuments`, `subdocument-mutation-visibility`, `subdocument-populate-authorization`, virtual embedded/route-parity suites; README 919–1034, 2619–2696 | `service-authorization-subdocument-policies` spies on package `findRawParentDoc`; operation-access child files count helper constructions. | ENTRY/CONTROL samples; retain all policy originals unchanged in invariants. |
| Supported raw helpers, named options/scope paths, no document hooks/DB/virtual work, fresh normal checks vs presentation | Packed `field-helper-consumer.runtime`, `owned-authorization-helpers.runtime`, exact README/MIGRATION workflows, public query snapshots; README 735–811, 1520–1700 | `field-helper-removal/request-boundaries`, private helper/consumer units freeze internal dispatch/EMPTY identity. Those are not missing public zero-I/O evidence. | No duplicate wholesale helper suite. CALLBACK covers the data argument distinction; CONTROL adds only missing rejection samples. |
| Optional `pickAllowedFieldsMany`: one public capture, independent row values, order/nullish/native behavior, zero I/O, outer/resource admission, whole failure/drain | Packed collection recipe fixture and strict/packed conservative type consumers, including all public Core/service getters; README 1565–1650; MIGRATION 504–621 | Full bound/poison/drain/ledger/cache tests construct Core/Service and patch private budgets. Exact debits and cleanup records are invariants. Public whole-failure/drain remains incomplete. | COLLECTION: bounded genuine-input failure samples, no private-budget injection or runtime-speed claim. |
| Permission metadata, `_view`/`_edit`, exposure allowlist, strip/disable postures, configurable dotted alias and collision errors; single/list context alignment | `doc-permissions-exposure`, `field-permissions-*`, `permissions-posture`, `include-source-provenance`, `authorization-fast-path-runtime.integration`, shared public context assertions, hydration aliases; README 529–553, 725–818 | `model-output-metadata` directly tests completion factories, synchronous reads and promise identity; bulk trace fixes query choreography. | METADATA: values/alignment/alias and denied-field maps only, never helper names/turns. |
| Frozen normalized boolean facts; request-owned actor; output hooks vs mutable real lifecycle; callback receivers/arguments and child-before-parent observations | Public direct/input/runtime/virtual/handoff/dependency suites; README 658–818; MIGRATION M1/M2 | Rich/native/proxy fulfilled facts and internal EMPTY identity mostly use private fixtures; data two-argument field vs one-argument guard tests construct DataCore. | FACTS + CALLBACK, preserving lifecycle behavior rather than sandboxing it. |
| Data routers/services/Core helpers: request-only policy, query/filter/sort/count/page semantics, owned dataset versions/native values and mutable returned decorations | `data-router`, `basic-data-list`, `basic-list-sort`, `data-service-hot-path`, `options-ownership`, sort suites; README 1652–1789 | `data-value-ownership` mixes its full 20-value family with Map/Object.keys copy counts and package trim spies; scaling measures internal work. | DATA + CALLBACK. Retain full old value/admission matrix below contracts; bounded native bundle, not a second 20-value Cartesian suite. |
| Hydration five buckets, captures/default restoration, ignored stale controls, fixed target/child stages, raw parent helpers | `hydration-characterization`, `hydration-configuration`, packed hydration types/docs, retained-owner and virtual parity suites; README 404–528 | Request-boundary suite uses private root dispatcher; raw-helper zero-call instrumentation is lower-layer. | Existing public coverage + ENTRY; no new hydration Cartesian product. |
| Virtuals: configuration, actual DB/query exclusion, dependencies, computed selection, parent/child ordering, private fourth inputs, source refs, missing/null/errors and lifecycle | Public config/direct/hardening/embedded/populate/include/route parity and many population dependency suites; README 2697–3466 | Planner/traversal/finalizer/performance and mixed original integration preserve private representations and exact work. One mixed validation suite retains public grammar. | TARGET/DETACH + VALIDATION only; do not duplicate comprehensive public virtual behavior. |
| Advanced symbols/enums/types, request schemas, `parseBody*`, `parseQuery`, `parsePathParam`, selection/populate/include grammar; no private common-schema import | `data-router` advanced exports, packed/strict consumers/docs, advanced mutation bodies, public request complexity/includes/OpenAPI/validation routes | `correlated-includes.validation` and `virtuals-validation-openapi` mix exported parsers with `common` schemas/private normalizers. | VALIDATION: a small direct-public parser and real HTTP/root panel. |
| Validation adapters (AJV, ArkType, Zod, Standard Schema, Yup, Joi, Valibot, io-ts, Superstruct, Vine), sync/tagged async results, operational errors and safe paths | `data-router`, `validation-arc02/arh06/arh07`, `validation-error-boundary`, strict real AJV consumer fixtures; README 2223–2303 | No demonstrated missing adapter family. Do not broaden this architecture task into a validator redesign. | Retain originals in contracts; no new adapter matrix. |
| OpenAPI registry/generation/router/Swagger: collisions, ownership, live config and HTML/script safety | `openapi`, `openapi-collision`, public model/data route schemas, documentation examples | The virtual schema/OpenAPI mixed suite stays internal intact; public virtual grammar recipe supplies its narrow uncovered effects. | VALIDATION; no new OpenAPI implementation tests. |
| `guard`: string/array/function/model conditions, source facts, required private target inputs, missing ID, errors and no DTO-only work | Packed guard runtime, `owned-authorization-guard-consumer.integration`, public model-router and fallback suites; README 3467–3491; MIGRATION 795–845 | `guard.test` forges private readers; guard units inspect private slots. Missing-ID/params/query examples need a real acquisition recipe. | ENTRY/GUARD, at most two cases; never resurrect DTO-only guard interception. |
| Logger helpers/redaction, injected logger levels/failure containment and structural-only private failures | `logger-redaction`, public runtime/virtual failure suites; README/MIGRATION diagnostics | Service-logging tests freeze internal probes/debug multiplicity, query traces and Date.now handling. Exact warning order is incidental. | Existing public evidence; CAPTURE checks documented warning membership only. |
| Processors entry: `copyAndDepopulate`, `copyPaths`, `movePaths`, `sliceArrays`, `countPaths`, `maskPaths`, mutable/immutable options and unsafe paths | `processors`, `processors-path-hardening`, installed root/subpath consumers | Remaining five function groups share `tasks-processors` with constructed Core task dispatch. | PROCESSORS: five bounded public groups; original private dispatch stays internal. |
| Installed publication: actual transformed tarballs, scoped artifact tree, docs allowlist, ESM/CJS runtime, strict positive/negative Bundler/NodeNext/Node16 consumers, side effects | `packed-consumer-compatibility`, `strict-consumer-types`, `nested-operation-access-consumer-types`, `owned-authorization-types`, `documentation-examples`, `tree-shaking-smoke`; README 94–120, 2198–2222, 3616–3642 | Root/fixture reads are move-sensitive. Minimum peers intentionally skip peer-library declaration checking; current-peer and dedicated strict cases keep `skipLibCheck:false`. Same-build byte integrity is not a permanent private-chunk layout promise. | Retain every existing compiler/runtime case and diagnostic. EXPORT adds only semantic assertions otherwise stranded in the mixed export file. |

## Required 16-tuple source panel

I = `isolated`, T = `trusted`. Bit order is **READ, LIST, CREATE, UPDATE**.
Each row is a required new public MODE case; **none is marked complete** merely
because the private CRUD fixture or a public read/list-only test uses its labels.

| Mask | READ | LIST | CREATE | UPDATE | Existing public limitation | Required evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | I | I | I | I | Query-only pair 0; no joint branch/borrowing proof | MODE-00 |
| 1 | T | I | I | I | Query-only pair 1; no joint branch/borrowing proof | MODE-01 |
| 2 | I | T | I | I | Query-only pair 2; no joint branch/borrowing proof | MODE-02 |
| 3 | T | T | I | I | Query-only pair 3; no joint branch/borrowing proof | MODE-03 |
| 4 | I | I | T | I | No qualifying public six-operation tuple | MODE-04 |
| 5 | T | I | T | I | No qualifying public six-operation tuple | MODE-05 |
| 6 | I | T | T | I | No qualifying public six-operation tuple | MODE-06 |
| 7 | T | T | T | I | No qualifying public six-operation tuple | MODE-07 |
| 8 | I | I | I | T | No qualifying public six-operation tuple | MODE-08 |
| 9 | T | I | I | T | No qualifying public six-operation tuple | MODE-09 |
| 10 | I | T | I | T | No qualifying public six-operation tuple | MODE-10 |
| 11 | T | T | I | T | No qualifying public six-operation tuple | MODE-11 |
| 12 | I | I | T | T | No qualifying public six-operation tuple | MODE-12 |
| 13 | T | I | T | T | No qualifying public six-operation tuple | MODE-13 |
| 14 | I | T | T | T | No qualifying public six-operation tuple | MODE-14 |
| 15 | T | T | T | T | No qualifying public six-operation tuple | MODE-15 |

Grounding: `query-snapshot-options.integration.test.ts:154–234` builds **four**
masks from the four-key list: only bits READ/LIST vary and no writes run.
`read-snapshot-checks` likewise proves query authorization, not all write modes.
`access-router-crud-harness.unit.test.ts` covers all 16 using the private CRUD
fixture; its mode/work assertions remain mandatory internal evidence, not a public
completion claim.

MODE recipe: create a fresh isolated runtime, a real Mongo model/router and a
custom router probe after its real middleware. Acquire the service from
`req.macl.getService`. In each tuple execute READ, LIST, CREATE, UPDATE,
UPSERT-create and UPSERT-update with distinct persisted identifiers/values.
Use server document-permission hooks that mutate a selected plain output value to
`output-hook`; do not mutate hydrated pre-write UPDATE input. The response value
must remain the submitted/stored value in I, and become `output-hook` in T.
This expected distinction is already asserted by the retained
`authorization-fast-path-options.integration.test.ts:367–421` and
`write-output-modes.unit.test.ts:19–124,176–237`, not calculated by a private helper.

Assert literal requested fields and denied-field absence, fixed boolean facts,
initiating operation and branch-specific context accesses, plus actual Mongo
persisted values (output mutation never saves). The executed UPSERT branch uses
CREATE or UPDATE independently, not READ and not a fifth setting. Do not compare
private stage modes, `_doc`, helper counts or adapter choreography. This is
**16 cases / 96 primary operations**, not every transport × option × model.

## Orthogonal mode requirements

| ID | Required bounded variation | Existing evidence and exact gap | Public acceptance |
| --- | --- | --- | --- |
| TARGET | Four independent target (READ, LIST) pairs: II, TI, IT, TT, under two opposing source postures; **8 cases** | Public runtime/provenance/query tests retain target policy, but some use target READ=LIST. Private target-option/capture tests and logging panels cannot establish public mode selection. | Each case obtains actual registered target output at effective READ and LIST (populate plus include), then a genuine write-origin populated result. Mutating target doc-hook view distinguishes its own selected setting. Source/target denied fields stay denied, target facts remain independent, sibling/parent values stay isolated, stored source and target values do not change. Vary source CREATE/UPDATE oppositely across the two source postures; do not assume read=list on targets. |
| CAPTURE | READ, LIST, CREATE, UPDATE, both UPSERT branches held at a public filter/prepare hook; plus defaults/warnings and restoration: **at most 8 cases** | Mixed options integration observes private provenance/configuration; default-model integration also fixes warning order. Public intent/dependency/retained-owner cases cover other captured options, not a complete mode-distinguishing sample. | Start with different branch settings, flip all settings during the hold, release, and assert old/new value distinctions for pending vs fresh calls, including a nested independent query. Capture both possible UPSERT settings before await. Check default inheritance, explicit I override, undefined restoration, unchanged frozen router snapshot and once-per-effective-owner/access warning membership. Logger throw must not abort committed setting; no warning sequence promise. |
| FALLBACK | Four independent source READ/LIST pairs: **4 cases** | Existing public four-pair fallback/read suites test authorization and output, but do not distinguish which mode lends the hook view. | An admitted READ miss retries under captured base LIST admission but uses initiating READ mode with a fresh fact stage; hook value mutation distinguishes R from L. A genuine independent LIST uses L. READ false/Forbidden never retries; LIST denial cannot be bypassed. Keep existing row/field/target/HTTP/root cases rather than repeating their full Cartesian panel. |
| DETACH | I/T × CREATE/UPDATE/UPSERT-create/UPSERT-update: **8 cases**; TARGET covers write targets | Private write fixture asserts mutable native ownership and post-save source lifetimes. Public scalar write behavior alone is insufficient. | Use real persistence and consumer `afterPersist` capture. Mutate nested plain values, Date and binary values in the post-write document hook; mutate supported native target values in TARGET. Returned values differ by mode as documented, while caller payload, live lifecycle documents, lifecycle snapshots, persisted source and target state remain unchanged. Check output failure can follow a committed write using one fixed over-bound output sample, without retry/save/rollback assertions tied to private methods. Do not call private `_doc` conversion routines. |

README 264–345 and MIGRATION 846–987 ground these requirements. Embedded output
inherits its genuine owner; dedicated children, NEW, helpers, COUNT, DELETE and
DISTINCT do **not** acquire trusted write/query authority. Existing public
embedded/NEW/helper/count/distinct suites remain the evidence for those exclusions;
ENTRY adds only a small all-trusted smoke where original proof was private.

## Other additive companion recipes

Priorities are within ARTS-04, not new tasks. Case budgets limit scope; loops may
cover a small named public method/invalid-input table without duplicating every
transport. Shared fixtures must be public-only and own independent documented
literal data. Originals remain in their ledgered lower layer.

| ID / priority | Maximum new cases | Concrete recipe and fixed acceptance |
| --- | ---: | --- |
| ENTRY / P1 | 6 | One real model basic/advanced/root panel and one data panel with differing basic/advanced/default grants; a child parent/child field-precedence panel; live setters/default restoration and HEAD; genuine custom route request/service acquisition; all-trusted excluded-origin smoke. Assert errors/actual output, original request `this` and consumer guard-before-validation ordering, never service-construction count or private `processOp`. |
| GUARD / P1 | 2 | Real middleware plus exported guard: obtain model ID from params/query, reject missing ID before application model work; one original-request scalar/array/function permission example. Reuse packed/private-input guard evidence rather than duplicating its no-DTO matrix. |
| CONTROL / P1 | 4 | Backend options/helper/default/related/subdocument authority rejection using independent literal controls; actual HTTP/root envelope contamination rejected before application hooks/writes (whole sibling preflight); same-spelled business data remains inert; terminal false versus malformed-control distinction. Retain all 14 mode/retired-key rows in existing eligible HTTP controls tests. No forbidden `purpose`/handle/private stage is ever accepted as setup. |
| ADMISSION / P1 | 3 | Public nested operation setters reject removed whole/dotted/inherited/nonenumerable keys atomically; invalid mode/dependency/populate/virtual configuration leaves options/registry unchanged; successful exact undefined restoration and ordinary same-named business fields remain. Use getters and real route verdicts, no private selector/catalog reads. Existing exact MIGRATION JS rejection fixture already covers 40 retired-presence samples and six invalid modes; do not repeat it wholesale. |
| FACTS / P1 | 3 | A real doc hook returns boolean facts, attempts output-view mutation under I/T and demonstrates frozen normalized facts/metadata cannot grant a later raw helper/read; a rich nonboolean fulfilled map fails the public operation; thrown/rejected hook follows documented empty-facts/log behavior without leaking its sentinel. Private prototype/poison/own-slot matrices stay intact below contracts. |
| DISTINCT / P1 | 3 | Real direct/root whole-value distinct denies a composite with one restricted descendant, permits a fully granted composite and explicitly granted scalar child, and refuses dynamic/metadata/Mixed uncertainty without application distinct I/O. Retain complete old schema/discriminator/native/negative matrix below contracts; never patch Permission.prototype. |
| COLLECTION / P1 | 3 | Publicly acquired helper rejects an oversized/dense-outer/native row before predicates (choose bounded existing limits), rejects a whole cumulative payload operation without a partial result, and drains admitted callbacks before failed settlement/no late publication. For the latter start from the retained `owned-authorization-many-bounds.unit` two × 4 MiB payload overrun, with a held public `name` field predicate and gate 2; validate actual entry/release rather than count promise turns. Observe the public rejection/output and consumer callbacks only. Exact 200,000/16 MiB debit calibration and private-state clearing remain invariants. If a proposed input fails before callbacks enter, it does not prove draining: adjust the bounded real input, never inject a budget or mark the row complete from private evidence. |
| DATA / P1 | 4 | Bundle nested plain/Date/Buffer/Map/Set/typed-view values in a publicly configured dataset; caller mutation cannot change it, snapshot native reads detach, returned service rows detach independently; old service keeps old data version after replacement; malformed/native-proxy update is atomic; direct/root decorations mutate only returned copies. Use inferred service types, no private DataService import or trim/copy spy. Full 20-value matrix remains lower-layer. |
| CALLBACK / P1 | 5 | Three cases for initialized data Core/service/public-service helper aliases (small loop of named methods), one operation guard and one acquired permissions object. Field functions receive original request `this` plus permissions and frozen empty boolean facts; guards receive permissions only. Check empty facts by value/frozen status, not private singleton identity. Acquired permissions retain `keys`, `has/hasKey`, variadic/array `hasAny/hasAll` and reserved-looking permission keys; do not construct Permission. |
| METADATA / P1 | 2 | Two source modes, small list/single/write panel with dotted alias, `_view`/`_edit`, expose/strip/disable postures, index-aligned frozen contexts, real source-ID output and denied field absence. Compare request maps separately from backend grants, test mutation of one parent's metadata cannot affect another. Existing alias collision/child/related cases remain contracts. No private completion callback, ID reread choreography, Map identity or promise-turn count. |
| DTO / P1 | 2 | Actual model and root responses across success single/list/error shapes retain supported envelopes/permission fields but omit context/capabilities/provenance/raw private snapshots, including forbidden-control errors. Do not import/call wire serializers or fabricate an internal result to serialize. |
| EXPORT / P1 | 2 | Actual installed ESM and CJS imports cover root/advanced/processors runtime semantic names, default/callable identity, documented type presence/removed-name diagnostics and blocked private subpaths. Existing strict/packed consumers provide types; do not snapshot private declaration names/JSDoc or hashed chunk filenames. Narrow negative-import exceptions may only assert failure, never use private exports. |
| PROCESSORS / P2 | 5 | One standalone public operation/clone-or-noop/error group per `copyPaths`, `movePaths`, `sliceArrays`, `countPaths`, `maskPaths`; ground literals in `tasks-processors.test.ts:7–158`. Keep default mutation, immutable detachment, applicable array fanout/slice bounds and unsafe-path rejection. Existing copyAndDepopulate tests already belong to contracts; Core.runTasks dispatch stays internal. |
| VALIDATION / P2 | 6 | Public advanced parse helpers and exported direct/root schemas: safe correlated literal/parent markers plus malformed/op-exclusive input; string/array/object and exclusion virtual selection; real model/data/root/child HTTP parity and existing virtual OpenAPI no-getter behavior. Never import common.includeSchema/projectionSchema/private normalizeSelect. Preserve every original parser row lower-layer. |

The combined ceiling is **94 new cases** (44 orthogonal mode cases plus 50 other
cases), not a target to fill. Reuse or combine a recipe only when its named
assertions remain explicit; record final per-row executable IDs. No new adapter,
hydration, transport-wide or benchmark Cartesian campaign is requested.

## Boundary judgments and ambiguity resolutions

1. **Private implementation observations:** fixed helper/copy/Map/Object.keys counts,
   private method names, stage/token layout/identity, source association/GC records,
   exact promise identity and incidental microtask turns stay lower-layer. A public
   method being callable does not make spying on its use by another method a
   supported override seam. This resolves `findRawParentDoc` instrumentation: retain
   the full policy suite; use application-model effects in public companions.
2. **Consumer callback multiplicity:** retain exact assertions only where they protect
   documented effects: one resolved document-fact stage (README 773–775), page-only
   data decoration (1724–1731), raw helpers' zero hooks/I/O (802–811,1611–1616), and
   compatible shared target/getter work (3386–3434). For the latter the approved
   scope is the fixture's same actual fetched target/scope, not constant query work
   across independent includes or arbitrary input panels. Keep internal counting
   tests lower-layer even when they also observe such callbacks.
3. **External query assertions:** grouped count's one aggregate/no fallback is
   documented at README 2402–2506; child visibility's at-most-one-extra-query bound
   is documented at 2669–2695. No unauthorized DB work on rejected input is a public
   side-effect obligation. Exact service logging trace/cache query choreography is
   not. No timing or blanket query-count/performance claim follows from batching.
4. **Warnings:** once-per-effective-owner/access membership is documented (README
   342; MIGRATION 878–884); warning access/owner array order is not. Retain the
   exact original array/order lower-layer, add an unordered public membership test.
5. **Installed bytes vs types:** same-build tarball/artifact byte equality preserves
   publication integrity. One-off full declaration hashes preserve this phase's
   no-production-change rule. Neither makes private chunk paths/text permanent
   consumer API. Positive and negative actual installed compiles remain required.
6. **Support and literal inventories:** stable private CRUD fixture cannot enter
   contracts; stable Mongo/global setup is public support traversed by the checker.
   Source public-equivalent types map to recorded published names; independent
   literals copy all ten retired plus four mode names in the original order.
   Generated collection recipe imports map to exact MIGRATION blocks, not an
   unresolved-import exemption. No production export changes are authorized.
7. **COLLECTION failure/drain:** genuine oversized input/native publication is public;
   injecting depleted private ledgers and checking closed WeakMap records is not.
   The bounded public recipe above still needs executable verification in ARTS-04.
   If a public trigger cannot reach the claimed drain obligation, the coordinator
   must approve an explicit evidence-backed row revision before closing it; equal
   totals/private passing tests are not a substitute.
8. **Dormant legacy compiler source:** `service-authorization.types.fixture.ts` has
   no maintained caller/config inclusion, despite its stale “compiled by the
   context unit suite” header. Lines 8,163–170,240–248,283–289 use removed output
   handles as successful examples. Preserve the complete file as private-dormant
   support; it is neither a currently passing compile nor a new expected-failure
   test. Current `service-authorization-consumer`, `-boundary`, `-migration` and
   `owned-authorization-cutover.invalid` fixtures supply active replacement
   contracts. No activation, assertion rewrite or retirement is authorized here.

No ambiguity blocks ARTS-01's baseline/classification handoff. Public gap rows remain
open for ARTS-04 and final acceptance; none is silently accepted as private-only
coverage. Supported overrides are public configuration/hooks, runtime/router setters,
consumer schema/validators/models and initialized-request methods. Declaration
reachability alone does not authorize replacing package factories/adapters/readers.
