# Access-router CREATE/UPDATE input-path optimization

Created: 2026-11-12 08:47:53 PST (`20261112-084753`, generated with `date`).

Status: completed for the bounded investigations, characterization tests and diagnostic
tooling scope. CWO-01–07 are reconciled and independently accepted. **The measured
runtime-performance objective was not achieved:** production is unchanged and all
40 current calibrated timing cells are unusable, blocking future performance retention.

## Objective, scope and authorization

Investigate and, when separately authorized, optimize redundant CREATE/UPDATE
processing without relaxing write-input authorization. Prioritize avoidable copies,
input traversals, parser orchestration and structural path preparation. Retain a
performance change only with demonstrated benefit and non-regression evidence;
fewer internal calls do not by themselves establish faster requests.

The user requested this task file first. It does not authorize implementation,
subagent execution, commits, dependency changes, publication or release operations.
No new authorization settings or broader meaning of `'trusted'` are proposed.

Execution authorization: the user subsequently requested implementation by
subagents. Execute CWO-01–07 sequentially, one child session at a time; the final
reviewer must not be an implementer. The coordinator owns task status and reconciles
each delivered outcome/check before the next handoff. Execution starts at `23848c6`
with only this task file untracked. No commits, dependency changes, publication or
release operations requested; preserve unrelated work and historical evidence.

Primary scope: `packages/access-router` private input/parser/write workers, its
maintained tests and access-router CRUD benchmark drivers. Preserve the installed
root, `/advanced` and `/processors` API/types. Verification is package-scoped,
including its existing installed/packed consumers; shared helpers require READ/LIST,
UPSERT and dedicated-subdocument controls within this package. Do not make unrelated
workspace/application fixes or import historical root-test failures as new blockers.
Expand scope explicitly if implementation reveals a cross-package dependency.

## Reviewed evidence and previous work

Reviewed HEAD: `23848c6`; worktree clean before task creation. Source inspection
covered public/direct CREATE/UPDATE and UPSERT workers, input admission, parsing,
facts/stages, captured catalogs, lifecycle serialization, persistence scheduling,
populate, metadata and current layered tests. No fresh build, runtime probe, test,
profile or timing baseline was run. Findings are optimization candidates, not
confirmed permission defects or measured speedups.

Unless explicitly prefixed with `packages/`, `scripts/` or `docs/`, source/test
paths below are relative to `packages/access-router/`. Symbols are durable lookup
anchors; line numbers describe the reviewed revision.

- **UPDATE unused view:** `src/acl/model-input-admission.ts:363–401`
  (`resolveInputDocumentGrants`) creates a stage and resolves it with a callback
  ignoring the supplied source, instead invoking the hook with hydrated `args.doc`.
  `src/acl/document-stage.ts:299` still constructs a disposable view. Omitting that
  view is the first candidate; initial bounded source admission remains separate.
- **Repeated traversal:** `src/acl/model-input-admission.ts:70–121,199–225,252–331`
  (`boundedInputValue`, `assertModelInputComplexity`, `sanitizePreparedInput`,
  `admitModelInput`) constructs normalized intermediate graphs and further selected/
  scrubbed graphs. Public admission also preflights data at
  `src/services/public-service.ts:756–767`; workers preflight again before parsing.
  Repetition across callbacks/awaits is not proof that either check is removable.
- **Parser promises:** `src/helpers/index.ts:88–126` (`iterateQuery`) uses async
  mapping/aggregation for ordinary fields as well as markers.
  `src/services/base.ts:1793–1816` (`parseClientData`) retains public-control
  admission and request scheduling before dispatching subqueries/dates.
- **Input-path preparation:** `src/acl/model-input-admission.ts:123–225,252–331`,
  `src/acl/field-catalog.ts:145–181` and `src/helpers/apply-update.ts:13–29`
  repeatedly split/build/check paths. `createPrepared` calls `requestInputFields`
  per item (`src/services/service.ts:2314–2319`);
  `src/core-shared.ts:310–345` enumerates rules and invokes field functions per call.
- **UPDATE conversion work:** the ordinary dependency-free success path has seven
  explicit library `toObject()` sites across original snapshot, pre-write source,
  virtual cleanup, final snapshot, diff, change input and output source. See
  `src/services/service.ts:2648–2711`, `resolveInputDocumentGrants`,
  `prepareQueryOutputSource` and `stripDocumentInputVirtuals`. This is a source trace,
  not a universal runtime count; hooks/dependencies can add work or change the path.

Related tasks and consequential exclusions:

- [Performance cleanup](20261105-084939-access-router-performance-cleanup.md):
  this is a new input-focused objective, not a reopening of ARPC-02/05's withdrawn
  finalizer/logging candidates. Their insufficient/noisy timing evidence is not a
  baseline or permission to lower measurement gates. ARPC-04 characterized observable
  empty/absent-hook scheduling; ARPC-06 rejected blind CREATE metadata batching.
- [Four authorization modes](20261103-172737-access-router-output-authorization-modes.md):
  preserve input/output separation, mandatory detached write output, private owned
  provenance and publication-scoped cleanup. Do not revive its fixed lifetime or
  inherited-origin defects through a new cache/fast path.
- [Test layers](20261108-094712-access-router-test-contract-separation.md): keep
  public contracts, adversarial invariants and internal work probes in their current
  layers; do not reference historical flat test paths as runnable commands.

No existing task delivering these input-specific changes was found in focused
searches. Existing historical designs, seals and results stay unchanged.

## Shared contract and retention gates

1. Keep all four `*AuthorizationMode` options, values/defaults/inheritance unchanged.
   New work benefits both CREATE/UPDATE output modes without granting new input trust.
2. Preserve operation/row/input/output/target authorization, original actor, captured
   policy, literal frozen document facts, and separate pre/post-write resolution.
   CREATE has no invented existing-document input facts. UPDATE hooks retain the
   hydrated argument, receiver, definition/dependencies and invocation semantics.
3. Preserve pre-parser whole-input limits and re-admission after expansion or
   validation/preparation. All supplied nodes, including discarded/protected data,
   must remain bounded. Retain cycles/sparse arrays/Maps/Mixed/BSON handling, safe
   keys, virtual/metadata exclusion, input ID restrictions and descendant-array
   replacement-versus-patch behavior. Native normalization returns are not certificates.
4. Reuse only private, demonstrably owned immutable preparation. No caller flag,
   mutable object identity, ID, function identity or `Object.freeze` alone proves
   admission/purity. Never share exposed field arrays, mutable values or row facts.
   Keep optional provenance own-owned and release call/publication resources.
5. Preserve application/native callback observations, live hook lookup and supported
   service overrides, first-error ordering, request-wide permits/FIFO/reentry and
   failure draining. An existing callback returning empty data is not an absent hook.
   Characterize any changed native observation; do not hide it by deleting tests.
6. Preserve validation, prepare/transform/save middleware, lifecycle snapshots/diff/
   onChange, response selection/population, private getter inputs, write-output
   detachment and nontransactional output failures. No implicit extra reads/saves.
7. Public declarations and imports remain unchanged. A required external behavior
   change blocks that candidate for a maintainer decision; it is not silently
   authorized by calling the code an optimization.

### Measurement protocol P

- Reuse `scripts/benchmarks/access-router-crud-v2.mjs` and its documented paired
  window/panel protocol; consult `access-router-crud-v2.md` and `access-router-crud.md`.
  Establish **new** baseline/fixture/tool/runtime identities and noise calibration
  for current inputs before candidate timing. Never overwrite old seals or reuse
  old noisy calibration as new acceptance. Add missing input-focused fixture shapes
  before freezing matching baseline/candidate inputs.
- Measure actual CREATE/save and authorization/output inside the operation interval;
  seed/reset outside it. Separate deterministic-adapter CPU/work/allocation from
  real MongoDB/query latency. Source construction/registration scope must be stated.
- Cover single/bulk CREATE, UPDATE by ID/filter, both public/direct paths and UPSERT
  branches. Include small controls, increasing fields/nesting/native payloads, absent/
  sync/async hooks, static/function rules and narrow/wide selection in both modes.
  Keep all 16 mode tuples in correctness coverage; time-deduplicate only with an
  explicit unaffected-axis rationale, never average away an operation/mode slowdown.
- Count copies, traversals, conversions, callback/query traces and admitted work in
  separate diagnostic runs. Timing has no spies, counters, profiler or forced GC.
  Retain the documented seven alternating pairs/two repeats and predeclared noise/
  non-regression rules; select panels before data, not after seeing candidate ratios.
- Retention needs reduced relevant work **and** measured CPU, allocation or latency
  benefit in both affected modes, with no repeatable adverse control. Allocation
  benefit is not a latency claim; fewer calls are not measured allocation savings.
  If calibration is unusable or safety fails, record a bounded no-change/defer
  conclusion and do not retain an unverified speedup or widen tolerances.

## Executable items

Priorities: P1 = prerequisite or high-confidence redundant work; P2 = deeper,
measurement/contract-sensitive investigation. Execute numerically after separate
authorization: shared helpers/fixtures and generated `dist` outputs overlap.
Sequential subagent execution is now authorized. Each item is a bounded investigation
with a conditional implementation gate: completion may be an evidenced no-change
decision, or a tested/measured retained change. A deferred item does not satisfy a
dependency; update dependent scope explicitly before proceeding.

### Task CWO-01: Establish current write-input baseline and cost attribution

Status: completed
Assigned: BASELINE-01 subagent (new session; coordinator owns task status).
Kind: investigation
Priority: P1 — identifies real costs and prevents another unmeasured optimization.
Dependencies: none

Primary ownership: `test/access-router-crud-fixture.ts`, internal CRUD harness/work
tests, affected invariant fixtures, `scripts/benchmarks/access-router-crud*.mjs`.

Finding/references: the evidence above establishes repeated work, but no fresh
input-path cost partition; the existing CRUD panel protocol has specialized gaps.

Requirements:

1. Trace CREATE/UPDATE phases and callback/native exposures; attribute source/view,
   normalization/sanitization, parser, rule/path and serialization costs separately.
2. Establish package baseline, isolated/trusted work traces and protocol P. Add
   plain/native/nested/bulk and mutable-hook/marker controls only where missing.
3. Record which CWO-02–06 candidates have enough evidence to prototype, their
   expected work reductions and exact behavior gates. Bound investigations rather
   than starting a broad rewrite or duplicating the prior ARPC study.

Acceptance: current baseline/trace and fixed benchmark protocol exist; all mode/
branch controls resolve correctly; unavailable/noisy cells and unrun checks are
explicit. No historical speedup is treated as current evidence.

Verification: V1/V2 baseline and P calibration; preserve curated provenance/results.

Completion evidence (BASELINE-01; coordinator reconciled):

- [Baseline index](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-01/README.md),
  [handoff](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-01/handoff.md)
  and verification/data records preserve exact changed tests/tooling, source/fixture/
  bundle identities, commands and reconstructable work/native/CPU/calibration evidence.
  Production source remained unchanged at `23848c6`; no optimization or new trust.
- Filtered build/typecheck passed; final V1 **1,199 tests / 17 files**; one
  unfiltered V2 **8,119 tests / 222 files**, including exact layer union and installed/
  packed/documentation consumers, with zero reported failed/skipped/pending cases.
- Added bounded input-focused fixtures, private diagnostic instrumentation and
  native/lifecycle/parser characterizations. Preserved **232 work records**, **46
  native observations** and **4,965 sampled in-window CPU rows**; these are not
  allocation totals, exclusive CPU shares or measured optimization benefits.
- Fixed calibration packets completed **280 timing workers / 333,312 measured
  operations**: **0/40 usable cells**, with retained warmup/noise failures and no
  retries or widened 20% cap. These are current baseline-vs-baseline data; none
  authorizes candidate retention. Bounded investigations can conclude no change.
- Actual pnpm **11.18.0** matches root packageManager. An initial report conflated
  `.tool-versions`' **11.24.0** with that pin; only new report annotations corrected.
  Actual runtime/sealed packets already used 11.18.0 and remained byte-identical.
- Final source/seal/recalculation/curation/format/lint/link/privacy/ignore/whitespace
  checks passed. No active jobs remain. No root/grouped/downstream test or MongoDB/
  HTTP latency/heap measurement is claimed.

Material new constraints for subsequent items:

- BSON `Code.prototype.toBSON` runs during the discarded pre-write view; a second-
  invocation error rejects before hook/save. CWO-02 cannot unconditionally omit it.
- A native Date callback can change raw input during public preflight; worker
  re-admission detects the added overflow. CWO-03 must not cache raw admission.
- Marker-free parser scheduling changes whether a queued sibling mutation is seen;
  CWO-04 cannot simply become synchronous. CWO-05 callbacks remain per row and
  CWO-06's independent native conversions/mutable snapshots are real observations.

### Task CWO-02: Remove unnecessary pre-write UPDATE hook-view preparation

Status: completed
Assigned: INPUT-02 subagent (new session; coordinator owns task status).
Kind: investigation
Priority: P1 — a concrete unused argument view, shared by both output modes.
Dependencies: CWO-01

Primary ownership: `src/acl/model-input-admission.ts`, narrowly affected stage
resolution, write-output/input invariants and new internal copy-count regression.

Finding/references: `resolveInputDocumentGrants:378–398` ignores the staged source;
`resolveDocumentStage:299` still prepares an extra view.

Requirements:

1. Characterize the extra copy, native/error observations and synchronous/await
   boundaries with and without an UPDATE hook, including UPSERT/dedicated consumers.
2. If equivalent, use the smallest existing private resolution seam to avoid the
   unused disposable view. Retain initial bounded source admission, hydrated hook
   input, fact commit, actor/binding, publication tracking and lifetime. Do not
   remove the whole pre-write stage or make the input execution trusted.
3. If dropping the view changes supported observable behavior, record that exact
   case/no-change recommendation instead of silently altering the input contract.

Acceptance: a precise decision is recorded. A retained change shows one fewer
unnecessary view preparation in both modes while all input/facts/error/ownership
checks hold, including mutable native and in-flight configuration cases; P passes.

Verification: V1 write/input/stage/native/lifetime tests, V2 and isolated/trusted
UPDATE/UPSERT P panels with CREATE/unaffected controls.

Completion evidence (INPUT-02; no-change decision):

- [CWO-02 report](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-02/README.md)
  preserves exact native/error/ownership decisions and **122** new asserted records.
  Unconditional/absent-hook view removal changes native error/persistence behavior;
  no primitive-only eligibility proof justifies a retained narrower shortcut.
- Added dedicated-parent and view/stage invariants/private support (**84 + 38
  cases**). Initial new dependency fixtures corrected to supported top-level names;
  no production, public contract, previous fixture/tool or seal changes.
- Filtered build/typecheck and V1 **999 tests / 25 files** passed, including all
  new cases, with zero reported failure/skip/pending. Layer/lint/format/identity/
  evidence checks passed; all rebuilt source/declaration identities match baseline.
- No optimization prototype was created/retained/timed; P remains **0/40 usable**.
  This is a completed bounded investigation, not a speedup or waived gate. Full
  integrated V2 belongs to CWO-07; no active commands remain.

### Task CWO-03: Reduce intermediate input graphs within admission stages

Status: completed
Assigned: INPUT-03 subagent (new session; coordinator owns task status).
Kind: investigation
Priority: P2 — broad shared savings, but normalization and bounds are security boundaries.
Dependencies: CWO-02

Primary ownership: `src/acl/model-input-admission.ts`, input/complexity contracts,
private admitted-value regression fixtures and input-focused benchmark cases.

Finding/references: `boundedInputValue`, `assertModelInputComplexity`,
`admitModelInput` and `sanitizePreparedInput` build then traverse intermediate data.

Requirements:

1. Evaluate same-stage normalization/counting/construction fusion, especially
   bounded prepared-data normalization followed by scrubbing. Preserve validation
   of discarded subtrees and normalized native/Map/class semantics.
2. Treat public-to-worker preflight reuse as a separate ownership question: native
   option work/awaits can mutate original inputs. Do not cache “already checked” by
   raw identity or drop post-parser/validation/prepare admission.
3. Prototype only the bounded equivalent subchange, with phase-local private
   ownership and no public admitted-input token; measure both modes under P.

Acceptance: retained work removes identified intermediate graphs without new aliases,
limit/pointer/error changes or virtual/protected writes. Cycles, sparse arrays,
subquery expansion and hooks injecting oversized/unsafe values still fail before
persistence. Otherwise deliver an evidence-backed no-change/defer recommendation.

Verification: V1 input/complexity/array-integrity/native contracts, V2 and P.

Completion evidence (INPUT-03; no-change decision):

- [CWO-03 report](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-03/README.md)
  establishes normalization-before-validation/scrub ordering, discarded-subtree
  bounds, selected-native re-copy values and intermediate shell/array exposure.
  Unconditional fusion or in-place reuse changes first errors/callbacks/aliases.
  A narrower closed structural scope is not proved or measurable under current P.
- Added **31 prepared-input invariants + 3 private construction cases**; **14**
  diagnostic worker records match baseline work/traces/fingerprints. No source
  candidate created, retained, timed or withdrawn; earlier source/evidence/seals intact.
- Filtered build/typecheck and V1 **1,074 tests / 30 files** passed; layer/lint/
  formatting/identity/curated-evidence checks passed. One read-only formatting proposal
  overlapped the initial typecheck, wrote only scratch, and is explicitly reported;
  source-only typecheck repeated serially. No active jobs remain.
- P remains **0/40 usable**; no performance/allocation/heap benefit asserted. This
  completed investigation does not waive retention or final CWO-07 V2 gates.

### Task CWO-04: Reduce parser overhead for marker-free input

Status: completed
Assigned: PARSER-04 subagent (new session; coordinator owns task status).
Kind: investigation
Priority: P2 — ordinary fields currently incur per-entry async orchestration.
Dependencies: CWO-03

Primary ownership: `src/helpers/index.ts` (`iterateQuery`),
`src/services/base.ts` (`parseClientData`), parser/concurrency tests and P fixtures.

Finding/references: `iterateQuery:88–126` recursively aggregates promises even when
there is no `$$sq`/`$$date`; callers also include READ/LIST filter parsing.

Requirements:

1. Separate ordinary traversal/allocation from genuinely asynchronous marker work;
   avoid adding a second whole-tree scan merely to discover a fast-path eligibility bit.
2. Preserve marker truthiness/interpretation, arrays/holes/order, nested public
   control rejection, errors, mutation exposure and current scheduler/reentry behavior.
   Use ARPC-04's scheduling characterizations as constraints, not an optimization to redo.
3. Prove the candidate on real CREATE/UPDATE and shared READ/LIST/subquery controls
   before retaining it. No unsupported immediate-completion or skip-parser flag.

Acceptance: fewer parser-owned promises/work for ordinary payloads is observed, P
shows benefit/non-regression in both modes, and marker/await/FIFO/failure traces remain
valid. If scheduling equivalence fails, deliver the exact no-change conclusion.

Verification: V1 parser/complexity/scheduler contracts, V2 and P.

Completion evidence (PARSER-04; no-change decision):

- [CWO-04 report](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-04/README.md)
  records launch/error/draining, live date handlers, marker-free native promise
  adoption, lazy sparse-array capture and own-slot behavior. Whole-parser sync
  traversal and blanket async-wrapper removal change actual shared/write observations.
  A narrower primitive leaf route lacks equivalence/benefit proof, not deemed impossible.
- Added **60 internal characterization cases**; filtered build/typecheck and V1
  **1,510 tests / 30 files** passed, including prior all-mode/target/subquery/native/
  input contracts. Layer/lint/format and protected source/seal/evidence checks passed.
- No runtime candidate created/retained/timed/withdrawn; source/declarations remain
  baseline-identical. P **0/40 usable** remains a retention blocker; no allocation/
  CPU/latency improvement or final V2 pass claimed here. No active jobs remain.

### Task CWO-05: Reuse bounded structural input-path preparation

Status: completed
Assigned: PATHS-05 subagent (new session; coordinator owns task status).
Kind: investigation
Priority: P2 — repeated path grammar/catalog scans scale with fields and bulk rows.
Dependencies: CWO-04

Primary ownership: `src/acl/model-input-admission.ts`, `src/acl/field-catalog.ts`,
`src/acl/select-resolution.ts`, `src/helpers/apply-update.ts`, input-rule/patch tests.

Finding/references: request boundaries, grant expansion, path eligibility and update
boundaries are rebuilt; bulk CREATE repeatedly enumerates schema rules per item.

Requirements:

1. Evaluate lazy call/catalog-local path/prefix preparation, including fixed safe/
   protected/virtual memberships and grammar tokens. Keep Map `$*`, Mixed, scoped
   virtuals and existing-index descendant grants exact; bound arbitrary-key storage.
2. Separate structural/static preparation from permission decisions. Field functions
   still run per row in existing order with original actor/facts; static CREATE
   rules may reuse only privately proven immutable results with fresh exposed arrays.
3. Do not revive rejected eager string-rule compilation or schema/source/ID caches.
   Preserve public overrides, captured ownership/undefined slots and cleanup. Measure
   cold/small workloads as well as wide/bulk paths so setup cost cannot hide regressions.

Acceptance: any retained index has bounded lifetime/size and reduces actual path work
without sharing callback results or mutable per-item values. Nested patch/replacement,
field-function counts, protected/virtual denial, native/capture and inherited-marker
regressions pass; both modes satisfy P. Otherwise record a bounded no-change decision.

Verification: V1 input/patch/rule/catalog/ownership invariants, V2 and P.

Completion evidence (PATHS-05R; no-change decision):

- The first child launch failed with an encrypted-context tool error before any
  delivered handoff; fresh PATHS-05R completed the actual investigation. No outcome
  or verification is attributed to the failed session.
- [CWO-05 report](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-05/README.md)
  establishes repeated native grammar/static-rule observations, distinct input/output
  optional catalog slots, row-specific index expansion and prepare-mutated exposed
  UPDATE fields. Unconditional cached grammar/static decisions/patch sets are not
  equivalent; narrower private structural indexing lacks proof/measured benefit.
- Added **17 cases**; **16** fresh diagnostic work/traces/fingerprints match baseline.
  Filtered build/typecheck, V1 **2,103 tests / 42 files**, layers/lint/format and
  identity/evidence checks passed. Production/previous fixtures/tools/seals intact.
- No runtime prototype created/retained/timed/withdrawn. P stays **0/40 usable**;
  no cold-control/non-regression or allocated-byte benefit claimed. Final V2 is
  CWO-07's gate; no active jobs remain.

### Task CWO-06: Assess UPDATE serialization and virtual-cleanup narrowing

Status: completed
Assigned: SERIALIZE-06 subagent (new session; coordinator owns task status).
Kind: investigation
Priority: P2 — repeated whole-document conversions have observable lifecycle edges.
Dependencies: CWO-05

Primary ownership: `src/services/service.ts` (`updateOnePrepared`),
`src/acl/model-input-admission.ts` (`stripDocumentInputVirtuals`), lifecycle tests.

Finding/references: the seven-site trace above includes full conversion for virtual
cleanup and separate final snapshot/diff/change/output preparation.

Requirements:

1. Characterize conversions and their inputs/options/order under hooks, native
   transforms, schema virtuals and retained/mutated contexts. Verify real counts;
   do not assume every write follows the seven-site path.
2. Assess an empty captured excluded-virtual-set guard or narrower modified-path
   cleanup. Native/schema virtuals, including default `id`, count; registered virtuals
   being empty is not sufficient. Preserve historical unmodified virtual siblings.
3. Assess same-boundary conversion reuse separately, without lending lifecycle
   snapshots or skipping onChange/diff/overridable hooks. A copied snapshot is not
   proof of immutable storage. Implement only proven equivalent scope; otherwise
   recommend no change and retain useful characterization.

Acceptance: exact implement/no-change decisions for cleanup and conversion reuse,
with callback/context/native/error evidence. Any retained change reduces real work
in both modes and passes P without losing snapshots, dirty tracking, virtual exclusion
or mandatory post-write source ownership.

Verification: V1 lifecycle/input/native/virtual/UPSERT tests, V2 and P.

Completion evidence (SERIALIZE-06; three no-change decisions):

- [CWO-06 report](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-06/README.md)
  separately rejects (A) blanket empty-catalog guards before/after native conversion,
  (B) dirty-only traversal replacing serialized order/live native checks and (C)
  final/diff/change/output conversion reuse. Real empty captured catalogs still
  have conversion-created effects/errors; mutable snapshots/overrides remain distinct.
- Added **42 serialization invariants + 4 private cleanup cases**. Filtered build/
  typecheck and V1 **2,190 tests / 43 files** passed with zero reported failure/skip/
  pending; layer/lint/format and source/seal/curated-record checks passed.
- No runtime candidate created/retained/timed/withdrawn; source and declarations stay
  baseline-identical. A still-narrower exposure-free design is unproved/unmeasured,
  not declared impossible. P stays **0/40 usable**, no performance/heap claim.
  No active jobs remain; final unfiltered V2 and scope acceptance are CWO-07's work.

### Task CWO-07: Review integrated correctness and measured claims

Status: completed
Assigned: REVIEW-07 independent subagent (new session; not a preceding executor;
coordinator owns task status).
Kind: investigation
Priority: P1 — final acceptance for shared input/persistence-adjacent optimization.
Dependencies: CWO-06

Primary ownership: acceptance/evidence review, installed-surface comparison and this
task record. Prefer a separate reviewer if delegation is later authorized; do not
claim independence or run agents solely because this plan exists.

Finding/references: single candidate counts or green internal tests cannot establish
integrated input/output safety, installed compatibility or all-mode performance.

Requirements:

1. Reconcile every decision against delivered code/tests and current input hashes;
   verify CWO-02–06 retained changes and explicit no-change/defer scope. Rerun final
   V2, review shared entry paths and compare installed exports/declarations.
2. Compare integrated candidates to current baseline and attributable prior retained
   step under P. Preserve unchanged native/callback/error contracts and independent
   rows/stages/targets; reject repeatable adverse controls instead of averaging them.
3. Preserve curated work/measurement/design/review evidence with reproducibility
   limits and no private identifiers/local paths. Record exact blocked prerequisites;
   no release, root-suite pass or universal-speedup certification is implied.

Acceptance: all active dependencies/criteria are reconciled, final package/consumer
checks pass, and every retained performance claim has valid attributable evidence.
No retained candidate whose safety/non-regression is unresolved. An all-no-change
outcome is valid only when conclusions/limits are explicit, not called a speedup.

Verification: final V2, P, declaration/export comparison and evidence/hygiene review.

Completion evidence (REVIEW-07; independent scoped acceptance):

- [Independent review](../task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-07/README.md)
  and curated verification map all item/contract gates to actual source, tests,
  records and fresh checks. No material retained-scope finding remains. Reviewer
  did not implement/fix source/tests/tooling or edit coordinator task status.
- Fresh filtered build/typecheck and full unfiltered V2 passed **8,398 tests / 232
  files**, zero failed/skipped/pending/todo assertions. Exact layers **103 contracts /
  71 invariants / 58 internal**; installed documentation/packed/strict/tree-shaking
  consumers all passed. Explicit maintained code/guide lint and formatting passed.
- All **153 production source files** and **15 rebuilt dist files / 8 declarations**
  remain baseline-identical. Public root/advanced/processors entries unchanged;
  no runtime candidate exists and no input authorization/isolation is relaxed.
- Independent reconstruction verified **232 work / 46 baseline native / 4,965
  in-window sampled CPU records**, fresh CWO-02–06 behavior records and unchanged
  original catalog/panel/protocol semantics. Full calibration recalculation retains
  **0/40 usable cells / 280 workers / 333,312 measured operations** with no retries,
  omitted samples or weakened gates. No candidate comparison is applicable.
- Protected preceding reports/seals/inputs stayed unchanged; new report JSON,
  reference/privacy/hash/ignore/whitespace checks passed. No active jobs remain.
  This accepts bounded no-change investigations and useful testing/tooling, **not**
  a speedup, allocated-byte/heap improvement or universal equivalence certificate.
- Coordinator final reconciliation checked the actual full-suite JSON/hash (**8,398 /
  232**, zero failed/pending), all 153 source and eight declaration hashes, task
  statuses and **39** task/evidence documents with **122** local links. Task formatting
  and tracked whitespace passed. A draft validator incorrectly required newlines on
  byte-preserved compact JSON; corrected validation accepts their original conventions
  without changing sealed data. Production/package metadata/lock files are HEAD-identical.

## Delivered outcome and remaining optimization limits

The requested items ran through sequential child sessions, with coordinator
reconciliation and an independent final reviewer. Retained additions are input-work
diagnostics/profile support, optional fixture/panel coverage and 14 new maintained
characterization test files plus private fixture support. Existing production/API/
trust/persistence behavior remains unchanged; no commits or dependency changes.

Unconditional copy removal, eager normalization/scrub fusion, whole-parser sync/
wrapper removal, cached grammar/static decisions/patch boundaries, empty-virtual
guards and snapshot/conversion reuse all have specific observation or ownership
barriers. Narrower private exposure-free designs are not declared impossible, but
were neither proved nor measured sufficiently for retention in this run.

Further runtime optimization is separate work: establish a suitable host or
separately named **preregistered** warmup/window protocol with new matching usable
baseline calibration, then prove the narrowed candidate against the preserved
native/callback/ownership controls. Do not widen noise tolerances or retry old cells
until they pass. No measured benefit follows from source-level repetitions alone.

## Verification, deferred work and definition of done

Prerequisites: installed dependencies/Node/pnpm per package metadata and MongoDB
memory-server support. Run commands from repository root. Use a fresh **short**
ignored root `_tmp*` directory, confirm `git check-ignore`, and set its absolute path
as `TMPDIR`; replace quoted placeholders before executing commands. Keep long run
IDs in log filenames, not unchecked Unix-socket paths. Git ignore is not tool exclusion.

**V1:** build required dependencies once, then run focused current-layer cases and
new regressions. This starting selection is not a substitute for item-specific tests:

```sh
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/invariants/write-output-modes.unit.test.ts test/invariants/write-output-origin-ownership.unit.test.ts test/invariants/write-output-source-lifetime.unit.test.ts test/contracts/service-authorization-input.integration.test.ts test/contracts/request-complexity.integration.test.ts test/contracts/nested-update-integrity.integration.test.ts test/contracts/arts04-parsers-processors.integration.test.ts
```

**V2:** after retained steps and final integration, run these serially; lint includes
only affected maintained package/tooling files, not scratch. The exhaustive test
script includes the test-layer checker and installed/packed/documentation consumers.

```sh
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router test
pnpm exec prettier --check <explicit-changed-files>
pnpm exec eslint <explicit-changed-code-files>
git diff --check
```

Build/test/typecheck/benchmark commands must not overlap. Preserve root serialized
testing if separately requested; do not run separate CI test groups concurrently.
This task does not change grouped-test dependencies. If cross-package test/build
access changes, review `scripts/test-groups.mjs` overrides and run
`pnpm test:groups:check` before expanding verification scope.

**Deferred, not duplicate implementation items:** blind CREATE metadata/populate
query batching; blanket finalizer/logging shortcuts; removing an entire pre-write
stage; skipping normalizers/grant checks; replacing document saves with `insertMany`
or `findOneAndUpdate`; reusing pre/post-write facts or UPSERT's lookup document as a
shortcut. Query/middleware/lifecycle/race observations need separate concrete design
evidence; neither output mode makes these behavior changes automatically acceptable.
Repeated fact normalization already has an owned-facts constant-time path and is
not presumed to be repeated whole-map copying.

Before any handoff, curate useful designs, result/trace summaries and necessary raw
measurement support into `docs/task-artifacts/access-router/<task-or-run-id>/`
following [the preservation workflow](../task-artifacts/README.md). Keep maintained
tests/benchmarks in normal locations, original historical seals untouched, and record
omitted inputs/host/noise limits. Never preserve entire scratch/dependency trees.

Done means each item has a verified retained outcome or bounded evidenced decision,
dependencies/dispositions are explicit, final V2 passes and claimed gains satisfy P.
No promise of a faster request or fixed percentage follows from this plan. Baseline
or performance prerequisites that cannot run remain blocked, not waived as noise.

Historical planning verification (repository root, task-only change then): Prettier passed; all
4 local links and 24 explicit path references resolved; seven item field sets and
ordered dependencies checked; privacy/ignore status and tracked/new-file whitespace
checks passed. No scratch artifact or runtime file was created during task creation.
Runtime/build/type/packed/performance checks had not run at that point; subsequent
execution and acceptance evidence above supersede those planning-only limits.
