# Access-router snapshot-validation CPU remediation

Created: 2026-10-28 12:12:31 (local time)

Execution outcome: SNAPCPU-01/02/03/06/05 completed through sequential
implementation/repair sessions and independent final review. SNAPCPU-04 is
deferred after its allocation-reduced comparator proved slower and was withdrawn.
Final 100-row wide median **309.08 to 55.32 ms (5.59 times faster)**; all required
correctness/type/downstream/lint/packed gates and thirty benchmark jobs pass.
Dynamic rules remain near phase before and far behind v0.51.0; this is mitigation,
not historical parity or verification of the user's application.

## Objective and context

Remove repeated whole-document snapshot validation from ordinary list-field
processing without weakening authorization or stale-document/output detection.
Execute through **sequential subagents**, followed by an independent reviewer.

This is a new measured phase following
[`20261028-005846-access-router-list-cpu-remediation.md`](20261028-005846-access-router-list-cpu-remediation.md).
That phase removed repeated configuration copying, but its operation-count tests
did not measure snapshot-validation amplification. The user subsequently ran the
interactive benchmark and reported the following 100-row medians (milliseconds):

| Scenario       | v0.51.0 | Current before this phase |  v0.52.0 |
| -------------- | ------: | ------------------------: | -------: |
| plain-narrow   |    3.36 |                     42.77 |   169.53 |
| plain-wide     |    6.13 |                    302.07 |   693.76 |
| hydrated       |    7.61 |                    313.74 |   677.03 |
| document-rules |    6.88 |                    342.42 |   644.79 |
| large-config   |    6.15 |                    308.53 | 1,330.55 |

All reported cases have one client and one DB read/request. Current wide-list CPU
is 307.97 ms/request versus 7.31 for v0.51.0. These numbers are **user-supplied**,
not a baseline measured by this phase. The original raw report/settings are not
present in the checkout, so do not claim exact reproduction of unknown settings.

Starting revision: `10b3c6d`. Existing uncommitted work is `package.json`,
`pnpm-lock.yaml`, and `scripts/benchmarks/`; preserve it. The benchmark harness is
available for real direct/public HTTP workloads and historical frozen-lock builds.

### Confirmed source evidence

Paths in this section are relative to `packages/access-router/`:

- `src/acl/document-authorization.ts:127` (`stageRecord`) invokes
  `matchesAuthorizationSnapshot` for every stage lookup.
- `documentRecord` calls `stageRecord`; readers/memo functions immediately call
  it again. `memoizeDocumentFieldDecision` also validates before/after evaluator
  awaits and on cached settlement.
- `src/acl/authorization-snapshot.ts:106` (`matchesAuthorizationSnapshot`) creates
  a complete normalized document copy, including native wire clones, then uses
  `isDeepStrictEqual`. This is not a cheap identity assertion.
- `src/acl/output-field-filter.ts` (`evaluateAuthorizedOutputField`,
  `evaluateRequestRule`) nests these readers/memos even for boolean field rules.
- `src/output/finalize-model-output.ts:757` evaluates eligible fields individually;
  public helpers have additional per-field loops. Work can therefore multiply by
  rows, fields and document size, independently of virtual getters or DB reads.

The primary candidate is confirmed repeated work, **not yet a measured CPU-profile
attribution**. SNAPCPU-01 must count it on real service paths before redesign.
No tests or timing baselines were run while creating this plan.

## Scope, invariants and non-goals

- Primary scope: private authorization/snapshot/field/finalizer modules and their
  actual Service/public/helper entry points. No OIDC, dependency, release or public
  API changes. Do not edit the benchmark workload to make a result look faster.
- Retain exact request/runtime/model/scope/access/call/stage ownership, independent
  same-ID rows, grants, metadata, source selection and output association graphs.
- Preserve rejection of mutated inputs/outputs, replacement identities, native
  Date/Buffer/BSON/Map/Set changes, forged handles and changed binding/access.
- Retain document-hook/field-callback ordering, memo semantics, original actor,
  hook concurrency, child ownership and nested-service reentry behavior.
- **No global validated flag, ambient async bypass, public trusted-mode option,
  cross-request config cache, shared mutable callback inputs, or disabled ACL.**
- A pure internal pass must not execute application functions/coercions/getters or
  yield while assuming previously validated input is unchanged. Validation remains
  at observable callbacks/awaits/public-handle boundaries. Cache hits alone never
  prove that a mutable stage is unchanged.
- Public plan flags (`fieldStates`, candidate states, field lists) are not authority.
  Any fast-path capability must be issued/authenticated privately, exact-owner bound,
  and unavailable through published runtime or declaration exports.
- BSON constructor fast clones remain deferred: prior review proved pre-import wire
  overrides make import-time prototype baselines unsafe. Any new comparator keeps
  the existing normalization/rejection fallback, not an ObjectId shortcut revival.

## Coordination and checks

The coordinator owns this file and reconciles each handoff before starting the next
fresh implementation session. Agents must not edit this shared plan, commit changes
or discard existing work. No simultaneous builds/tests: shared `dist/` races.
Suggested session aliases identify planned roles, not proof agents already ran.

All commands run from the repository root, with installed dependencies and a usable
MongoDB binary. Replace placeholders before execution.

- **V1 build:** `pnpm --filter @web-ts-toolkit/access-router... build`
- **V2 focused:**
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<affected>.test.ts`
  after a build if the suite imports `dist`. Core suites: authorization snapshot,
  service-authorization context/finalizer/reads, field-policy cache, finalizer
  preparation, service-list preparation, subdocument and virtual isolation.
- **V3 package:** `pnpm --filter @web-ts-toolkit/access-router test`
- **V4 types:** `pnpm --filter @web-ts-toolkit/access-router typecheck`
- **V5 downstream:** `pnpm --filter @web-ts-toolkit/access-router-deco test`
- **V6 lint:** `pnpm exec eslint packages/access-router/src packages/access-router/test`
- **V7 harness:** `node --test scripts/benchmarks/access-router.test.mjs`
- **V8 timing:** `pnpm bench:access-router` fetches tags and prompts interactively.
  See `scripts/benchmarks/README.md` for setup and prompts. The original phase used
  a separate, untracked deterministic driver with already available local tag
  commits; its raw reports and driver are not committed. Use the tracked interactive
  harness to run a new comparison, not to reproduce the original run exactly.
  Use separate archived tag trees, fresh Node workers/owned Mongo databases and
  serial jobs; do not change remotes or SSH configuration.

Timing matrix for this phase: current, v0.51.0, v0.52.0; plain-narrow/plain-wide/
hydrated/document-rules/large-config; 10/100 rows; 24 fields; 32 payload bytes;
one client; hook concurrency 10; warmup 5 plus preflight; 25 measured requests.
Record Node/Mongo/dependency/build hashes. These are explicit phase settings, not a
claim about the user's unknown field/sample settings. Capture original current
before changes and rebuild only current for after runs; historical trees may be
reused if their hashes match. Timing is diagnostic, never a flaky CI assertion.

Full-workspace tests are not required for private package changes. Required gates
that cannot run leave the affected task blocked with precise evidence.

## Ordered tasks

Priority P1 = remove confirmed amplification or gate correctness; P2 = further
allocation reduction after ownership/boundary work. Each fix owns its regressions.

### Task SNAPCPU-01: Measure snapshot amplification and define safe validation boundaries

Status: completed

Kind: investigation

Priority: P1 — establish the real remaining cost and a safe design before bypasses.

Suggested agent: SNAPCPU-01 characterization/design session

Dependencies: none

Primary ownership: new focused characterization test(s), ignored benchmark driver/
reports; inspect private snapshot/document/field modules and public/helper callers.
No production behavior changes in this task.

Finding/references: repeated snapshot cloning in the source evidence above;
previous config-read counts cannot detect it.

Requirements:

1. Count full snapshot validations/native serializations on real direct Service.find
   and public list paths for row/field-width changes and repeated field decisions.
   Keep passing baseline characterization tests; successors update their counts.
2. Audit mutable input ownership and every callback/yield/external handle boundary.
   Specify where cheap owner reads can replace validation, where validation cannot
   move, and a minimal pure-static pass design with no ambient async inheritance.
3. Identify memoized pending/settled decision and ancestor-callback semantics that
   a synchronous fast path must preserve. Native/coercible/function-backed policy
   must conservatively fall back unless proven safe.
4. Capture V8 before timings with the fixed phase matrix, raw reports and a reusable
   ignored driver. Preserve the workload for after comparison and document exact
   build/tag provenance. Do not infer source-only speedup across dependency changes.

Acceptance criteria:

- Measured count evidence distinguishes N/F/document-size costs from config reads.
- Concrete ownership/boundary design supports SNAPCPU-02/03 and identifies risks;
  no mutation guarantee is simply declared unnecessary.
- Before timing artifacts exist with passing output equality and dependency data,
  or the exact external blocker is recorded without invented timings.

Verification: V1/V2 new characterization plus context/cache suites; V7; V8 before.

Completion evidence:

- SNAPCPU-01 session added
  `packages/access-router/test/snapshot-validation-amplification.unit.test.ts`.
  Both real direct/public list paths perform `N × (14F + 32)` full validations;
  `N × (14F + 29)` walk the projected stage. At ten rows/twenty-four fields this
  is **3,680** full walks. One cold scalar output decision costs fourteen stage
  walks; a settled allow/deny memo hit costs five. Native leaves amplify wire
  copies independently: ten rows/twenty-four fields/twenty-four fetch-only BSON
  leaves cause **87,600** validation serializations. No production behavior changed.
- Nine focused suites: **340 tests passed**, including sixteen new characterization
  cases. V1 current/historical builds, V7 (**12 passed**), changed-test lint/format,
  driver syntax and `git diff --check` passed. Coordinator inspected tests/audit.
- The phase-specific driver verified original harness and historical dependency/
  dist hashes and rebuilt only current for the after comparison. Its design notes,
  raw reports and prepared tag trees are not committed; the measured results and
  approved boundary design are summarized below.
- All thirty before jobs passed output equality/fingerprints, with one DB read/
  request and zero getters. One-hundred-row medians (current/v0.51.0/v0.52.0):
  narrow **41.17/3.80/167.85**, wide **309.08/5.99/682.24**, hydrated
  **309.07/7.88/675.04**, document rules **318.67/6.91/625.33**, large config
  **300.93/6.01/1,270.38 ms**. Explicit phase settings above; Node 26.12.1,
  MongoDB 8.2.6. Selected Mongoose/Express/Zod versions match, but frozen lock/
  workspace-helper differences remain recorded; no source-only attribution.
- Automated verification used existing pinned local commits (not a remote fetch):
  v0.51.0 `89180d219783fbfad412d8dfe19beae614f45c68`; v0.52.0
  `97e36b0dcbd72d213c6bd1d01227e2b9455097b8`. Interactive CLI still fetches tags.
- Approved architecture: explicit private lookup vs validation; closed synchronous
  decision-only batches; no callback/serialization/await inside a pure body;
  private settled-decision metadata with pending/error fallback; ordinary external
  checks and callback/resume validation retained. Native validation itself may
  execute code, so duplicate removal needs proof or conservative fallback.

### Task SNAPCPU-02: Separate owner lookup from validation without weakening observations

Status: completed

Kind: improvement

Priority: P1 — duplicate synchronous lookups copy the same document immediately.

Suggested agent: SNAPCPU-02 document-owner implementation session

Dependencies: SNAPCPU-01

Primary ownership: `src/acl/document-authorization.ts`, necessary private callers
and focused stage/handle/memo tests (all under `packages/access-router/`).

Finding/references: `documentRecord` validates a stage, then readers/memos retrieve
and validate it again; cheap access reads currently have hidden full-document cost.

Requirements:

1. Apply the approved boundary design; use explicit private record lookup helpers
   whose return does not falsely certify unchanged state. Remove only validations
   duplicated within a safe uninterrupted internal section.
2. Keep standalone/public helper and cached/pending-result mutation detection, exact
   binding checks and callback pre/post validation. Do not expose stored grants.
3. Add failing-before operation-count regressions and negative native/mutation/
   changed-binding cases, including changes during asynchronous decisions.

Acceptance criteria:

- Owner lookup and validation are explicit. Coalesce observations only where
  passivity is proved; otherwise retain the original number of observations.
- Existing external stage/handle reuse and asynchronous tampering tests pass;
  forged/replaced/bad binding/access/stage owners remain rejected.

Verification: V1/V2 context, snapshot, reads, field-cache, prepared-query/finalizer
and new characterization tests; direct TypeScript and changed-file lint.

Completion evidence:

- SNAPCPU-02 session separated private identity-only lookups and explicit stage
  validation in `document-authorization.ts`. Adjacent walks coalesce only after a
  fresh descriptor-only live ordinary-data proof; only the private frozen snapshot
  shape is retained. Native/proxy-capable paths preserve both original checks.
  Coordinator reviewed the diff and new negative tests.
- Added `test/document-authorization-validation.unit.test.ts` and extended the
  characterization with ordinary/native variants. Eligible ordinary reader walks
  **2 to 1**, direct cold memo **4 to 3**, settled memo **3 to 2**, cold output field
  **14 to 9**, warm output decision **5 to 3**. Real ordinary lists now cost
  `N × (9F + 21)` total walks; ten/twenty-four case **3,680 to 2,370**. Native-bearing
  lists retain original counts, so this subtask alone does not fix the real Mongo
  ObjectId workload. No timing conclusion is drawn.
- Twelve failing-before count cases were demonstrated; final ten focused suites
  passed **371 tests**. V1, direct TypeScript, changed-file ESLint/Prettier and
  `git diff --check` passed. New cases cover proxy/wire reentry, pre-import override
  mutation, binding getters and queued/pending/settled/rejected decision changes.

Reopened after independent review:

- SNAPCPU-05 added `test/snapshot-review-regressions.unit.test.ts`; both cases
  **failed** because the reader did not throw after retained input changed during
  validation. An overridden BSON `Symbol.hasInstance` runs even for ordinary
  nested data; an inherited `Symbol.toStringTag` getter runs during Node-equality
  fallback. In each case the legacy oracle observes **true, then false**.
- Ordinary own-data descriptors therefore do not prove normalization/equality
  passive. No unrestricted HTTP bypass is demonstrated; these cases require
  application-installed overrides, but violate this plan's mutation contract.
- Withdraw shape-only owner-read coalescing rather than expand the optimization
  into a fragile live-intrinsic purity framework. Keep lookup separation and
  restore both legacy observations for every document-owner read. Revise the
  reader/count acceptance above accordingly: the bulk win belongs to SNAPCPU-03,
  not to fewer external-reader observations. Earlier counts remain historical
  evidence, not final expected budgets. Reverify batch counts and mutation cases.

Repair completion evidence:

- SNAPCPU-02 repair restored both checks unconditionally and removed the
  `ordinarySnapshot`/`hasOrdinaryDocumentData` proof. Coordinator inspected the
  repaired composition and count assertions. Explicit identity-only lookups,
  SNAPCPU-03 batching and SNAPCPU-04 comparison are retained.
- Both unchanged independent-review regressions now pass; five analogous
  Date/RegExp/Map/Set `Symbol.hasInstance` and `Buffer.isBuffer` mutation cases
  were added. Reported serial V1/focused verification: **821 tests in 23 suites**
  passed, including the forty-nine batch cases and differential coverage. Direct
  TypeScript, changed-file ESLint/Prettier and diff checks passed.
- Final ordinary/native reader budgets are identical: reader **2**, cold/warm
  direct memo **4/3**, cold/warm single output field **14/5**. Static lists remain
  width-independent at **40N** total (**37N** stage + **3N** output), helper aliases
  **19**, request metadata **6**. Ten twenty-four-field rows therefore cost **400**
  walks versus the original **3,680**. This supersedes the intermediate ordinary
  budgets recorded in SNAPCPU-02/03; native serialization budgets are unchanged.

### Task SNAPCPU-03: Amortize static field decisions in real list and helper paths

Status: completed

Kind: improvement

Priority: P1 — remove the row × fields × full-document validation multiplier.

Suggested agent: SNAPCPU-03 pure-field-pass implementation session

Dependencies: SNAPCPU-02

Primary ownership: private field/document authorization, finalizer trim, existing
output helper loops and relevant Service integration; focused regressions.

Finding/references: per-field `evaluateAuthorizedOutputField` nests output/request
memos/readers, causing full snapshot walks even for static `true` rules.

Requirements:

1. Introduce the smallest authenticated pure-field pass/decision path approved in
   SNAPCPU-01. Common boolean/static schemas should validate per row/pass/boundary,
   not per scalar field. Keep eligibility and decisions from captured call-owned
   policy, not mutable public plans or caller-provided booleans.
2. Respect existing output/request memo decisions (including pending promises),
   ancestor order, exact/dotted lookup differences, backend grants vs request-only
   metadata, known trimmed outputs and owning-parent stages. Do not skip earlier
   stateful callbacks because a later rule is statically false.
3. Leave validation around every actual application callback/await/handle reuse.
   Fast paths must not leak through nested hooks/services or reuse a capability
   after a yield. Conservative fallback is preferred for open native/coercible data.
4. Wire the actual Service.find/public list and helper call paths. Keep virtuals,
   embedded/related scopes, metadata, decorations and request concurrency unchanged.

Acceptance criteria:

- Real direct/public no-virtual lists show snapshot-validation counts bounded by
  rows/boundaries, not selected static field count (compare widths 4 and 24).
- Negative tests cover mutable field lists/plans, raw input/native/output changes,
  callbacks that queue mutation, pending/settled memos, nested reentry, wrong owners
  and equal-ID rows. No exported bypass or application-visible new option.
- Pure static decisions avoid per-field grant clones/await chains where possible;
  deferred callback counts/order and separate stage memo behavior are unchanged.

Verification: V1/V2 characterization and direct/public/helper/finalizer/field-cache/
subdocument/virtual/request-hook-concurrency suites; V4 and changed-file lint.

Completion evidence:

- SNAPCPU-03 session introduced a closed synchronous decision-only batch with a
  private planner-owned ordered field-set record and captured boolean-policy
  proof. No document values/serialization/callbacks/actor methods/awaits occur
  in the pure body; validation is outside it. There is no ambient validity state.
  Coordinator inspected owner/policy/planner/finalizer changes.
- Memo records now track the original promise's settlement. Pending/rejected
  decisions fall back; a speculative journal preserves request/output-key order
  and abandons writes if native-validation reentry created conflicting state.
  Existing single-field Promise and callback checks remain.
- Actual direct/public static list walks are now **25N ordinary / 40N native**,
  independent of widths four/twenty-four. At ten/twenty-four: ordinary **2,370 to
  250**, native **3,680 to 400**. Twenty-four native leaves now incur **8,880**
  validation wire copies instead of **87,600**. Handle helper aliases use eleven/
  nineteen validations per ordinary/native stage; request metadata three/six.
- Whole-batch fallback remains for mixed/dynamic/string/array/coercible policy,
  embedded ownership/traversal and non-primitive helper values. Ordinary BSON
  document leaves do not prevent pure boolean decisions. These limits are not
  claimed to remove dynamic callback costs.
- Changed private owner/field filter/planner/service-auth/finalizer modules;
  extracted `src/acl/output-field-policy.ts`, added
  `test/static-output-field-batch.unit.test.ts` (**49 safety cases**) and updated
  amplification counts. V1, direct TypeScript, eight-file ESLint/Prettier, export/
  declaration privacy checks and `git diff --check` passed. Twenty-two focused
  suites: **673 tests passed**, including direct/public/helper, native/pre-import
  overrides, snapshot, subdocuments, virtuals and request-hook concurrency.

### Task SNAPCPU-04: Compare ordinary snapshot structure without rebuilding it

Status: deferred

Kind: improvement

Priority: P2 — reduce allocations in validations which remain mandatory.

Suggested agent: SNAPCPU-04 snapshot-comparator implementation session

Dependencies: SNAPCPU-03

Primary ownership: `src/acl/authorization-snapshot.ts` and differential snapshot tests.

Finding/references: `matchesAuthorizationSnapshot` always allocates/freezes a full
normalized graph before comparing, even on ordinary plain records and arrays.

Requirements:

1. Implement a conservative allocation-reduced structural comparison for proven
   ordinary paths; retain the original normalization/equality fallback for tricky
   native or unsupported shapes. Never trust input identity/frozenness alone.
2. Differential-test against the existing
   `isDeepStrictEqual(copyAuthorizationValue(value, 'document'), snapshot)` oracle,
   including controlled errors, nodes/depth limits, unsafe/accessor/symbol keys,
   null prototypes, non-enumerable document data, sparse arrays and native leaves.
3. Preserve original native wire normalization/rejection (including pre-import
   overrides), graph identity checks, ordering/alias semantics and no callback
   input sharing. Do not revive deferred BSON constructor paths.
4. If equivalence cannot be proved for a category, retain fallback and document
   its cost. A broad unsafe comparator is not required to complete a narrower win.

Acceptance criteria:

- Differential cases and adversarial native tests agree with the previous oracle.
- Deterministic counts show ordinary validation no longer builds complete plain
  object/array copies; required native copying remains explicit and detached.
- Stale input/output, replacement/provenance and strict limits continue to reject.

Verification: V1/V2 snapshot differential/context/finalizer/field-cache/native
isolation suites; V4 and changed-file lint; review must scrutinize comparator fallback.

Completion evidence:

- SNAPCPU-04 session changed `src/acl/authorization-snapshot.ts`, added
  `test/authorization-snapshot-differential.unit.test.ts` and extended pre-import
  BSON cases in `test/authorization-snapshot.unit.test.ts`. The ownership copier
  remains unchanged as the independent differential oracle. Coordinator inspected
  the delivered comparator, differential cases and operation-count assertions.
- A private flat normalization tape finishes source normalization before inspecting
  the comparison target, preserving earlier values when a later wire hook mutates
  source/target data. One active set and structural budget cover the entire walk.
  Passive ordinary records/arrays and primitive-backed BSON leaves avoid rebuilding
  the plain graph; every BSON occurrence retains its original wire round-trip.
- Complex roots retain the old algorithm. Nested complex values, target key-order
  differences, proxy/accessor/unusual-prototype targets, Date/RegExp/Buffer, Map/Set
  and Buffer-backed BSON use materialization/Node-equality fallback. Fallback uses
  already normalized values rather than replaying wire hooks or resetting limits.
- Reported verification: V1, direct TypeScript, changed-file ESLint/Prettier and
  `git diff --check` passed; twenty-three focused suites passed **886 tests**.
  Differential coverage includes **159 cases**, **512 generated graphs**, native
  pre-import overrides and observation-order/limit checks; all forty-nine static
  batch safety cases passed. Final package-level gates remain SNAPCPU-05's work.
- Ordinary fixture property definitions **172 to 0**, freezes **52 to 0**;
  required BSON wire-clone counts are unchanged. Tape/descriptor allocations and
  complex fallback costs remain. No heap-byte or latency improvement is claimed
  from these operation counts.

Reopened after resumed independent review:

- The reviewer verified SNAPCPU-02's repair, then added
  `test/snapshot-review-comparator-regressions.unit.test.ts`: four new cases fail.
  Digit-only array properties such as `4294967295` are accepted by the ownership
  copier but are not array indices. Node equality checks these properties before
  indices; the fast comparator's early index mismatch can skip a target getter
  that changes the eventual result. This needs no global overrides and violates
  the arbitrary-target differential contract, not a demonstrated HTTP bypass.
- Narrow the fast path: materialize the already normalized tape and delegate
  numeric-non-index arrays to Node. Preserve ordering without normalizing source
  twice, resetting budgets or weakening the unchanged reviewer assertions.
- Focused run: **30 passed, 4 failed**; focused lint/format/diff checks passed.
  Raw review logs are not committed.

Repair completion evidence:

- SNAPCPU-04 repair added three conservative eligibility guards for numeric
  non-index array properties in source normalization, passive-leaf proof and
  target admission. These arrays now use tape materialization/Node equality
  before fast index comparison, including decimal keys rounding to Infinity.
  Coordinator inspected the guards; ownership copying is unchanged.
- All four unchanged reviewer regressions pass. Added **31** differential guards
  (suite now **190 tests**) for boundary/source-only/target-only/hidden/nested/
  sparse/large-key cases and native-hook ordering. Reported serial focused run:
  **928 tests across 25 files** passed, including all forty-nine batch cases.
  V1, direct TypeScript, changed-file ESLint/Prettier and diff checks passed.
- Ordinary fixture still uses **0** definitions/freezes versus **172/52** for the
  oracle; bounded dense/sparse arrays retain the fast path. Numeric-non-index
  fixture deliberately retains **2** definitions/**1** freeze. Wire-triggered
  fallback performs exactly **1** serialization/deserialization, not a replay.
  Static list budgets remain **40N** ordinary/native; latency remains unmeasured.

Final disposition after measured SNAPCPU-06 follow-up:

- **Withdrawn in full.** Paired unchanged-workload experiments proved the tape
  slower on relevant native-bearing dynamic, narrow and static lists despite its
  definition/freeze reductions. The original copier/Node matcher is restored;
  ordinary fixture cost is again **172 definitions/52 freezes**. Earlier allocation
  results describe the withdrawn implementation, not the final code.
- Allocation reduction is deferred pending a design with actual latency/CPU
  benefit. Residual full-normalization cost remains explicit; static-field batch
  amortization from SNAPCPU-03 is retained. Differential/reviewer regression
  coverage is retained with honest original-allocation expectations.

### Task SNAPCPU-06: Avoid a measured regression on dynamic-policy validation

Status: completed

Kind: investigation

Priority: P1 — do not leave a new measured slowdown behind a static-path win.

Suggested agent: SNAPCPU-06 bounded performance investigation/repair session

Dependencies: SNAPCPU-03

Dependency revision: SNAPCPU-04's delivered experiment motivated this task, but its
allocation fast path is not a prerequisite. Evidence from this investigation
withdrew that experiment; its final status is deferred.

Primary ownership: ignored paired benchmark variants/evidence; if causally
supported, a narrow private snapshot comparison repair and its focused regressions.
Do not broaden dynamic-policy batching, alter workloads or remove observations.

Finding/references: SNAPCPU-05's first complete after matrix passed all correctness
gates and showed static 100-row wide/hydrated/large-config improvements of
**5.06/4.80/4.60 times**, but document-rules median **318.67 to 378.08 ms** and CPU
**21.08% higher**. Mixed function/string policy deliberately retains per-field
validation. Secondary profiles show substantial matcher work, but do not establish
the exact cause of the regression. The first after-run results are summarized under
SNAPCPU-05; raw reports and profiles are not committed.

Requirements:

1. Compare the delivered matcher and unchanged copier/Node-equality oracle using
   isolated built variants of the same current implementation and the unchanged
   worker/settings, preserving static batching in both. Pair/repeat dynamic and
   static/narrow cases to distinguish comparator overhead from unrelated changes
   or timing noise. Preserve all source/build hashes, fingerprints and raw results.
2. If evidence implicates the new matcher, narrow or withdraw the affected fast
   path rather than weaken safety or expand callback batching. Retain required
   native normalization, two owner observations, budgets and fallback ordering.
   Record which allocation reduction is deliberately sacrificed, if applicable.
3. Keep the original before and first after evidence intact. No changes to tag
   trees, benchmark driver/core/worker, dependency locks, public API or workload.
   New wall-clock assertions do not belong in unit tests.

Acceptance criteria:

- Paired evidence identifies whether the comparator causes the regression.
- A reproducible introduced slowdown is addressed by a bounded safe repair or
  withdrawal, not dismissed using operation counts. If evidence cannot identify
  a safe repair, record the precise remaining uncertainty for independent review.
- Any production change passes focused differential/owner/batch/native/finalizer
  tests, direct TypeScript, lint/format and diff checks. Independent SNAPCPU-05
  revalidates full gates and reruns V8 after the final implementation.

Verification: paired unchanged-worker diagnostic runs, V1/V2 and focused checks;
V3–V8 remain the independent final integration gate. No source-only historical
attribution or application-parity guarantee.

Completion evidence:

- SNAPCPU-06 isolated exact built variants differing only in matcher body, with
  batching/dependencies/settings unchanged. Sixteen AB/BA pairs all favored the
  old oracle. Document-rules tape overhead: **17.67% median/21.94% CPU**. Raw
  variant hashes, jobs and results are not committed.
- Removed the tape/passive-equality machinery globally rather than add a shape
  selector or unsafe validity cache. `matchesAuthorizationSnapshot` again uses
  the unchanged copier plus Node equality; both owner observations, wire cloning,
  budgets and **40N** static-list work remain. Coordinator inspected this diff.
- Rebuilt-production paired 100-row medians (tape to repaired): document-rules
  **395.43 to 325.57**, narrow **38.42 to 25.12**, wide **66.02 to 57.41 ms**.
  CPU improved in each case; repaired document-rule p95 was worse/noisy, so no
  uniform tail improvement is claimed. All **56 diagnostic jobs** passed
  fingerprint/output equality, one read/request and zero getters. These are
  secondary paired diagnostics, not replacements for the final historical matrix.
- Changed only snapshot implementation and differential operation-count
  expectations/descriptions; all 190 differential cases/512 generated graphs and
  unchanged reviewer regressions remain. Serial V1/focused run: **1,014 tests in
  25 files** passed, including forty-nine batch cases. Direct TypeScript,
  changed-file ESLint/Prettier and diff checks passed. Detailed verification logs
  are not committed.
- Dynamic validation still performs per-field work and remains far from v0.51.0.
  Full package/downstream/packed gates and final thirty-job timing must rerun on
  this changed implementation before final completion.

### Task SNAPCPU-05: Independently review invariants and measure end-to-end improvement

Status: completed

Kind: investigation

Priority: P1 — performance evidence and security-contract completion gate.

Suggested agent: SNAPCPU-05 independent review session (not an implementer)

Dependencies: SNAPCPU-01, SNAPCPU-02, SNAPCPU-03, SNAPCPU-06

Dependency revision: SNAPCPU-04's fast matcher was withdrawn by completed
SNAPCPU-06. Its deferred allocation goal is not a final-integration prerequisite;
the original matcher contract and all mutation checks are retained instead.

Primary ownership: independently review all diffs; tests for discovered regressions;
final verification/benchmark artifacts. Coordinator alone updates shared tasks.

Requirements:

1. Audit every accepted boundary/fast-path capability; no external helper or
   descendant callback may inherit skipped snapshot validation. Test actual
   direct/public/root/related/embedded paths, not just standalone primitives.
2. Verify snapshot/comparator equivalence and malformed/native/callback cases;
   preserve public exports/declarations, hook semantics and original source grants.
3. Run V3–V7 serially and inspect packed artifacts/root/advanced/processors exports
   and declaration files for private issuer/capability leakage.
4. Rebuild current and rerun the V8 matrix with the preserved driver/settings.
   Compare against both this phase's before build and historical tags, report raw
   medians/p95/CPU/query counts/output equality/dependency hashes. Investigate a
   lack of material improvement rather than declaring success from passing tests.

Acceptance criteria:

- Required correctness, type, lint, packed/downstream gates pass; no unresolved
  in-scope authorization/mutation regression remains.
- Static validation amplification is demonstrably removed and real HTTP timing
  evidence shows the effect; remaining v0.51.0 gap is quantified, not explained away.
- Deferred work has rationale/residual cost. No invented profile attribution,
  absolute speed guarantee or claim of resolving the user's app without testing it.

Verification: V3–V8 and final diff/export review; timing is reported, not a flaky
wall-clock unit-test threshold. Keep blocked if a required gate cannot execute.

Review blocker and handoff:

- Independent SNAPCPU-05 review reproduced the two SNAPCPU-02 mutation regressions
  above. Focused regression run: **2 failed / 2 total**, missing expected
  `ServiceAuthorizationError`. Focused ESLint/Prettier and diff checks passed;
  raw review logs are not committed.
- Owner: SNAPCPU-02 repair session, followed by the independent reviewer. Package,
  type, downstream, full lint, packed-consumer and after-benchmark gates have not
  run; preserve historical trees/workload until repair and review pass. No after
  latency or completion claim is supported yet.
- Repair delivered and reconciled above. The independent reviewer is resuming the
  safety audit before executing final gates and the preserved after matrix.
- Resumed review confirmed that repair but found SNAPCPU-04's numeric-non-index
  array observation-order regression. Owner: SNAPCPU-04 repair session, followed
  by independent re-review. Final package/packed/timing gates remain unrun.
- Array fallback repair delivered and reconciled above; independent re-review
  resumes before final verification and timing.

First complete verification and timing evidence:

- Independent reviewer found no remaining in-scope correctness defect after the
  separate repairs. Serial V3: **4,745 tests/151 files**; V4 passed; V5:
  **650 tests/20 files**; V6 passed; V7: **12 tests**. Fourteen changed source/test
  files passed formatting, and diff checks passed. Detailed logs are not committed.
- Packed consumer verified six CJS/ESM root/advanced/processors loads, twelve deep
  import denials, actual runtime/declaration export graphs and both TypeScript
  conditions. All eight declarations equal phase before; no private capability
  or trust option is exposed. Packed dist equals the measured current build.
- Preserved after driver passed **30/30 jobs**, all fingerprints equal, one DB
  read/request, zero virtual getters. Raw reports and profiles are not committed.
  Current lock and non-access-router workspace builds match before; historical
  hashes matched the prepared manifest. Node/Mongo/selected dependency versions
  were unchanged.
- One-hundred-row before to after medians: narrow **41.17 to 38.17**, wide
  **309.08 to 61.02**, hydrated **309.07 to 64.38**, document-rules **318.67 to
  378.08**, large-config **300.93 to 65.48 ms**. Same-run v0.51.0 gaps remain
  **10.84/9.97/8.31/55.53/10.16 times**, respectively. These were partial gains,
  not historical parity; detailed raw comparisons are not committed.
- The dynamic case regressed **18.64% median/21.08% CPU**. A bounded follow-up,
  SNAPCPU-06, now owns paired causal comparison and a conservative repair if
  supported. Final integration is blocked on that task, not on correctness gate
  failures. Existing passing evidence remains historical if production changes.
- SNAPCPU-06 causally identified and withdrew the tape penalty. Its repair is
  reconciled; the independent reviewer now resumes full verification and a new
  preserved-driver matrix. The first after/profile data above remain historical.

Final completion evidence after tape withdrawal:

- The independent reviewer reran every required gate serially: V3 **4,745 tests/
  151 files**, V4 passed, V5 **650 tests/20 files**, V6 passed, V7 **12 passed**.
  Fourteen source/test files passed Prettier; diff checks passed. Both reviewer
  regression files remain unchanged and pass. No unresolved in-scope correctness
  finding remains in the bounded source/test/runtime review.
- Fresh packed consumers passed six CJS/ESM entrypoint loads, twelve deep-import
  denials, actual runtime/declaration graph checks and both TypeScript conditions.
  All eight declaration files equal before byte-for-byte; no private owner/policy/
  batch/capability or trust option is exposed. Packed dist equals final measured
  dist. The snapshot module equals starting HEAD except explanatory comments:
  full original normalization/Node equality, not tape allocation reduction.
- The raw final report, packed-consumer logs and detailed comparison are not
  committed. All **30 final jobs** pass with one DB read/request and zero virtual
  getters; per-case output fingerprints agree across **90** before/first-after/
  final jobs.
- Final medians, p95 and process CPU in milliseconds/request below. Speedup is
  before/final median; v51 ratio is final/same-final-run historical median.

| Scenario       | Rows | Before median | Final median | Final p95 | Final CPU | Speedup | Final/v51 |
| -------------- | ---: | ------------: | -----------: | --------: | --------: | ------: | --------: |
| plain-narrow   |   10 |          8.46 |         6.11 |      8.43 |     10.18 |    1.38 |      2.87 |
| plain-narrow   |  100 |         41.17 |        24.58 |     27.56 |     27.73 |    1.68 |      6.83 |
| plain-wide     |   10 |         35.81 |         9.58 |     14.00 |     13.50 |    3.74 |      3.63 |
| plain-wide     |  100 |        309.08 |        55.32 |     59.25 |     62.38 |    5.59 |      9.59 |
| hydrated       |   10 |         34.13 |         9.87 |     13.99 |     14.21 |    3.46 |      3.73 |
| hydrated       |  100 |        309.07 |        62.74 |     66.48 |     69.51 |    4.93 |      8.21 |
| document-rules |   10 |         36.59 |        36.37 |     50.70 |     41.37 |    1.01 |     14.21 |
| document-rules |  100 |        318.67 |       311.52 |    321.73 |    320.36 |    1.02 |     46.96 |
| large-config   |   10 |         34.55 |        11.44 |     15.89 |     15.49 |    3.02 |      4.47 |
| large-config   |  100 |        300.93 |        56.32 |     61.92 |     63.89 |    5.34 |      8.75 |

- Dynamic 100-row CPU is **332.83 to 320.36 ms**; ten-row dynamic p95
  worsened **40.62 to 50.70 ms**, CPU **39.96 to 41.37 ms**. No uniform tail win
  or completed dynamic-policy fix is claimed; callbacks/string-policy fallback
  still incurs per-field validation, and mandatory full/native copies remain.
- Driver/core/worker, current lock and four non-access-router workspace builds
  are unchanged. Preserved historical dist/dependency/lock hashes were rechecked.
  Final ESM SHA256:
  `063d47ac7fd3a59f7eadf9aec150e129581eca75fa88fbc864503514fc317d46`.
  Node **26.12.1**, MongoDB **8.2.6**; selected Mongoose/Express/Zod versions
  **9.9.2/5.2.1/4.4.3** match across targets. Historical frozen-lock/helper
  differences prevent source-only attribution. No supported-Node version matrix
  or real-user-application verification was performed.
- Coordinator reconciled implementation, final audit and verification artifacts.
  Historical trees were retained for the phase's reruns; they are not part of the
  repository. Existing user work is preserved; no commits or release/dependency
  changes were made by this phase.

## Definition of done / execution evidence

Each task has reconciled evidence, private authority and all mutation checks are
preserved at their required boundaries, the independent review passes, and before/
after benchmark artifacts quantify the improvement and remaining historical gap.
All builds and agent tasks run sequentially. Do not mark completion solely from
code edits or config-copy counts. Append actual execution evidence per task.

- At plan creation: inspected source/prior task and preserved benchmark work;
  tests/timings had not yet run. Actual baseline, repairs, deferral, paired
  diagnostics and final verification are recorded above. Final status: five
  completed tasks, one explicitly deferred allocation experiment, no active
  blocker. Remaining historical/dynamic gaps are quantified, not resolved.
