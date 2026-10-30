# Access-router query-pipeline overhead

Created: 2026-10-29 21:17:34 PDT
Status: completed

Outcome: PIPE-01–06 completed, including evidence-backed no-change/defer outcomes
for string evaluation and broader embedded reuse. Retained guarded record builders
and amortized captured primitive catalog preparation. Final package/type/downstream,
packed/export, lint/format and runner gates passed. No flags or public API changed;
the reported application/v0.51.0 gap is not declared fixed.

The separately authorized unsafe publication-fusion investigation is tracked in
[its own task file](20261030-082847-access-router-unsafe-output-publication-fusion.md).
Its unshipped prototype was withdrawn after the performance/guard retention gate
failed; this completed security-preserving phase and its retained evidence remain
unchanged.

## Objective and scope

Reduce the remaining READ/LIST CPU and allocation overhead of the newer
authorization pipeline. Start with the real service output copy/association chain,
then consider immutable preparation, field evaluation and embedded planning. A
completed opt-out feature is not a completed performance fix: the reported 2–5x
v0.51.0 gap remains the motivating problem, not a promised achievable speedup.

This is a new implementation phase after the completed
[query CPU investigation](20261029-105358-access-router-query-cpu-follow-up.md) and
[initial output-copy switches](20261029-164234-access-router-initial-output-snapshot-copy-opt-outs.md).
Do not repeat rejected blanket child-call caching, shape-only validation reuse,
constructor BSON cloning or the slower normalization-tape comparator.

Scope: private access-router service/finalizer/authorization code, focused tests,
and evidence from the existing benchmark worker. No new unsafe flags, changes to
the eight flags' meanings/defaults, new public exports, dependency changes,
historical-tag modifications, unrelated package edits, commits or publication.
Implement serially in this session; no delegation or independent review requested.
Unprefixed `src/` and `test/` paths refer to `packages/access-router/`.

Delivery sequence: PIPE-01/02 formed the first allocation-reduction milestone and
passed full retained-runtime gates before PIPE-03–05. Those follow-ups now have
reconciled outcomes, and PIPE-06 closes this bounded phase after final integration.
Completing these tasks does not mean the overall reported regression is resolved.

## Inspected evidence and constraints

Starting revision: `50491a7df502966b68a91330d98a5fb38c9a1c77`, clean worktree.
No new build, tests or timings have run at task creation.

- `packages/access-router/src/services/service.ts` (`finalizeDirectOutput`,
  `findPrepared`): each row enters an independent finalizer, receives an associated
  result, copies it for metadata/includes and transfers its authorization graph.
- `packages/access-router/src/output/finalize-model-output.ts`
  (`prepareFinalizer`, `finalizeSingleDoc`): source/metadata isolation, child
  finalization, field filtering and output association occur before service-level
  assembly. A private no-escape publication seam is a candidate, not yet proven safe.
- `packages/access-router/src/acl/document-authorization.ts`: stages own detached
  source snapshots; hooks/grants remain detached; output associations retain copied
  snapshots or explicitly opted-out bounded admission plus exact graph identities.
- `packages/access-router/src/acl/output-field-policy.ts`: boolean-only pure
  batches and call/path preparation already exist. String/function/owned-child
  routes fall back. Optimizing them must preserve memo, ancestor and callback order.
- `packages/access-router/src/acl/output-field-filter.ts`
  (`authorizeEmbeddedOutputPlan`): child derivation copies/normalizes the parent
  configuration per parent. Share only demonstrably immutable preparation, never
  per-parent authorization results.
- Existing tests in `test/service-list-preparation.unit.test.ts`,
  `test/finalizer-preparation.unit.test.ts`, `test/snapshot-review-regressions.unit.test.ts`
  and `test/initial-output-snapshot-copy.unit.test.ts` protect native observations,
  detached rows/grants, dynamic lookup, output handles and strict/unsafe modes.

**Security contract:** keep row/field/operation permissions, source snapshots,
detached callback/getter/grant inputs, captured live-option semantics, exact
request/runtime/model/scope/access/stage ownership, same-ID independence, output
identity/provenance, structural limits and fail-closed fallback. Never retain a
validation certificate across application work, native serialization or an await.
Native/BSON normalization may execute application code even on ordinary graphs;
fewer observations can change authorization. If a proposal cannot preserve that
contract, narrow/fall back or record a maintainer decision; do not silently amend
tests or add a hidden bypass. Counts of unused copies are not proof of removability.

## Verification and measurement

Commands run from the repository root. Build/test scripts write shared `dist/`;
run builds, package tests and benchmarks serially. Preserve unrelated user work.
Temporary fixtures use an ignored repo-local directory; evidence remains repo-scoped.

- **V1 Build:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
- **V2 Focused:** after V1 where dist is imported,
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts <files>`;
  replace `<files>` with actual package-relative files. Include new work-count and
  native/callback/ownership regressions with each implementation.
- **V3 Full:** `pnpm --filter @web-ts-toolkit/access-router test` and
  `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- **V4 Downstream:** `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- **V5 Lint/package:**
  `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks`;
  changed-file Prettier and `git diff --check`. Inspect all public runtime and
  declaration exports; existing packed-consumer tests must pass.
- **V6 Runner:**
  `node --test scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`.
- **V7 Performance:** use the unchanged `scripts/benchmarks/access-router-worker.mjs`
  and existing scenarios (interactive entry: `pnpm bench:access-router`). Preserve
  built before/after variants with identical dependencies, declaration/build/lock
  hashes and verified modes. Start with 100-row wide/document-rules/embedded:
  24 fields, 32 bytes, one client, hook concurrency 10, five warmups and at least
  25 samples. Alternate paired jobs and repeat promising/noisy cases. Cover strict
  defaults, six comparison skips ON/copy OFF, and all eight ON; test dormant copy
  mode and READ/retries for correctness. Expand 10/100-row guard workloads for any
  retained change affecting common paths.

Separate instrumented counts/profiles from uninstrumented latency/CPU. Verify
fingerprints, denied fields, row order, actual hydration, read counts and callback
counts. Report median/p95/CPU, settings and confounds; historical frozen dependency
differences prevent source-only v0.51.0 attribution. No wall-clock unit assertions.
Retain only relevant repeatable gains without a relevant reproducible regression.

## Tasks

### Task PIPE-01: Establish publication boundaries and a fresh baseline

Status: completed
Kind: investigation
Priority: P1 — avoid moving security-observable work on an assumption of ownership.
Dependencies: none
Primary ownership: service/finalizer/document-authorization callers and tests;
temporary measurement tooling using the unchanged benchmark worker.

Requirements:

1. Map copies, association/assertion/transfer operations, user/native callbacks and
   handle escape points on actual direct/public LIST and READ paths.
2. Preserve a fresh built baseline and characterize relevant copy/normalization
   counts, including strict and all selected unsafe modes.
3. Specify exactly which publication work can be fused without changing source,
   callback, native observation or external-handle behavior. Record fallback and
   any contract blocker before implementation.

Acceptance: baseline identities/results recorded; concrete eligible boundary or
evidence-backed rejection of fusion. No unsupported equivalence/performance claim.
Verification: V1, relevant V2, V7 baseline and source/test boundary review.

Completion evidence:

- V1 passed. Preserved baseline ESM SHA-256
  `e8b3e25b56a515bfadd0a16821104542e7f82f5fbad5eca2172d9a50fb2eac25`,
  lock SHA-256 `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`;
  Node 26.12.1. The unchanged worker verified both option groups and fingerprints.
- Eighteen baseline timing jobs (two/case/mode; V7 settings, 25 samples) yielded
  median ranges for wide/document-rules/embedded respectively: strict
  **55.49–55.79 / 322.00–335.37 / 799.46–804.10 ms**; six skips ON/copy OFF
  **23.98–24.28 / 27.02–27.57 / 67.61–70.25 ms**; all eight ON
  **22.76–23.26 / 26.54–26.93 / 66.45–68.23 ms**. All cases retained one read/request.
- Source review confirms the intermediate handle does not reach the service's
  decorator, but its association/check/copy passes can execute native application
  behavior before later rows/decisions. The existing initial-copy test
  `documents a possible denial-to-allowance change from omitted normalization observations`
  reproduces that risk; lack of a public handle alone is not a safe fusion proof.
  Do not remove those passes under the current contract.
- Focused V2 baseline: **393 passed, one expected failing-before work-count test**
  in six files. Existing service/finalizer preparation, source-validation budgets,
  native review regressions and copy-flag ownership/risk tests passed unchanged.
  The new independent-reference copier suite asks for fewer per-record property
  descriptor allocations, not fewer normalization visits (baseline 9 vs target 2
  explicit definitions in its small record/array fixture).
- PIPE-02 therefore starts with the expressly allowed smaller implementation:
  retain every copy/validation pass and native observation, change only the private
  ordinary-record construction. No publication fusion or security contract change
  is approved by this finding; larger ownership redesign remains an investigation.

### Task PIPE-02: Reduce service publication allocation without weakening checks

Status: completed
Kind: improvement
Priority: P1 — duplicate response construction affects ordinary queries.
Dependencies: PIPE-01
Primary ownership: `packages/access-router/src/services/service.ts`,
`src/output/finalize-model-output.ts`, `src/acl/document-authorization.ts`,
`src/acl/authorization-snapshot.ts`, `src/helpers/document.ts` and focused tests.

Requirements:

1. Prototype the proven PIPE-01 publication boundary first. Prefer one final DTO
   assembly/association where no intermediate output escapes; retain standalone
   finalizer and callback behavior and conservative fallback.
2. If fusion is blocked by observable native/validation work, record that finding.
   A smaller allocation implementation preserving those observations is acceptable
   only with its own differential, work-count and paired performance evidence.
3. Cover metadata stripped/exposed/dotted, includes/populate/embedded descendants,
   same-ID/concurrent rows, retained handles, callbacks, native reentry and all modes.

Acceptance: failing-before work-count tests, preserved behavior and repeatable V7
benefit for a retained change; otherwise withdraw the prototype and explicitly
defer the optimization rather than mark an unachieved speedup complete.
Verification: V1/V2/V7; V3–V6 at PIPE-06.

Progress (chronological; superseded by completion evidence):

- The null-prototype dictionary plus spread prototype passed observation tests but
  its first 36 paired jobs were slower in relevant strict/dynamic/embedded cases.
  Withdrawn, not treated as a speedup from descriptor counts. Preserved diagnostic
  build SHA-256 `732d5fce31dab233ee56b04557115468dc9dbb30f97fb10a84d9562550dba23d`.
- Revised the snapshot builder to assign only an absent key on a privately owned
  ordinary target, **after** recursively normalizing its value. Inherited keys and
  arrays keep descriptor definition. If fallback definition could expose the
  target, later keys re-prove its prototype before the closed absent-key operation.
  Added independent original copier and adversarial setter/proxy-target regressions.
- A source-builder variant (before the final defensive exposure guard) passed 72
  paired priority jobs in two alternating batches (25/50 samples): material strict
  improvements and smaller ON improvements. This is preliminary, not final-source
  acceptance. No source/output walks, native copies or permissions were removed.
- Applying the same construction principle to isolated plain records is being
  measured separately. Unlike snapshot construction, callers may supply its cycle
  map, so every key re-proves the target prototype after recursion; Maps/arrays,
  alias/cycle handling and native normalization stay unchanged. This extends the
  smaller-allocation ownership only to `src/helpers/document.ts`, not a new API or
  skipped copy boundary. Independent original-helper, cycle-map escape, native,
  prototype-key and alias/permission-metadata regressions were added.
- Focused V2 reached **699 passing tests in 11 files** before the last exposure-guard
  regression. Real direct/public LIST/READ tests compare the original and new
  snapshot copier through all four comparison/copy combinations: identical output,
  callbacks, copy/validation counts and Date/BSON observations, fewer definitions.
  Final repeat timings and full gates remain pending.
- Final defensive candidate passed **700 focused tests in 11 files**. Separate
  50-sample comparisons against the same candidate with only the old isolation
  helper restored support retaining the isolation change too (six-flag ON mean
  medians: wide **23.10 → 21.53**, document-rules **24.74 → 22.87**, embedded
  **63.57 → 58.34 ms**). These are not new benchmark workloads or source changes
  to historical trees; the diagnostic variant changes one compiled helper only.
- Completed final-source 10/100-row guard jobs and two alternating 50-sample
  priority batches in strict, six-flag ON and eight-flag ON modes. The source,
  declarations, workload/dependencies and requested/effective modes were verified.
  All outputs/hydration/read counts matched; raw latency/CPU summaries and caveats
  are recorded below. Full package verification is now running serially; type,
  downstream and final runner checks follow it.

Completion evidence:

- V3 full package passed **5,868 tests in 171 files**, including packed-consumer,
  export and executable documentation tests; access-router typecheck passed. V4
  passed **691 tests in 22 files**, including downstream typecheck. V5 ESLint,
  changed-file formatting/diff checks and V6 **21 runner/integration tests** passed.
- All eight declaration files remain byte-identical to the baseline; six CJS/ESM
  public entrypoint export sets are unchanged. The rebuilt ESM still equals the
  measured candidate hash, and the dependency lock is unchanged.
- Eight final narrow 10-row jobs at **300 samples** bring this milestone to **478
  timing jobs**. The residual six-ON penalty did not persist: median **3.70 → 3.49**,
  p95 **5.17 → 5.13**, CPU **4.00 → 3.86 ms/request**. Eight ON was approximately
  flat in median, lower in CPU and noisier/worse in p95; no universal tail win.
- Retained only the two guarded record-construction changes and their independent
  reference/work-count/safety regressions. No copy boundary, snapshot validation,
  native normalization, grant/callback evaluation or flag contract was removed.
  Remaining PIPE-03–05 now proceed; final integration must rerun after any further
  runtime changes. No v0.51.0 parity or completed overall regression fix is claimed.

### Task PIPE-03: Reuse only immutable service-row preparation

Status: completed
Kind: investigation
Priority: P2 — existing helper batching does not eliminate all real service-row setup.
Dependencies: PIPE-01, PIPE-02
Primary ownership: service/finalizer preparation, private authorization readers and
`src/acl/field-catalog.ts` for reusable captured string-path preparation.

Requirements: identify/prototype primitive-only captured preparation reusable across
real LIST rows; retain resolution-local mutable function/native lookup, diagnostic
contexts and row grants/stages. Do not merely repeat earlier full-reader narrowing.
Acceptance: retained reuse has deterministic counts and paired benefit; otherwise
record a bounded no-change/defer decision and the remaining cost.
Verification: V2 dynamic lookup/capture/concurrency suites, V7; final V3–V6.

Initial implementation boundary: full finalizer/configuration copy reuse still
cannot omit observable native normalization. Instead prototype bounded path
eligibility preparation on the private, captured, dense primitive catalog reused
by actual per-row static field passes. Cache no permissions or document values;
authenticate callers as before. Unregistered/open/sparse catalogs and non-primitive
paths must retain the original evaluator and observations. Record whether this
narrow immutable preparation yields a relevant improvement before retaining it.

Progress (chronological; superseded by completion evidence):

- The first eager catalog prototype passed **531 focused tests in nine files**,
  including a demonstrated failing-before repeated-path test, but added roughly
  3–5% to embedded ON latency despite a 6–7% wide ON gain. A lazy-first-lookup
  variant still paid index construction in short-lived child scopes; not retained.
- The current prototype registers only a counter and starts preparation after
  32 primitive lookups. Admission proves all six relevant arrays are frozen dense
  own-string arrays, with no inherited/missing optional slots. Lookup memoization
  is capped at 20,000 results per captured catalog; non-primitive paths and failed
  admission retain the original evaluator. No permissions, grants or stages cached.
- Current deterministic repeat test reduces **100 → 32 path splits**; inherited
  optional getters, sparse arrays, mutable/unregistered catalogs, source replacement,
  non-primitive observations and cache saturation remain covered. V2 **531 tests
  in nine files** and build passed. Initial 50-sample paired results favor wide ON
  by about 7%; a reverse-order repetition is running before retention/guard checks.

Completion evidence:

- Retained only amortized captured primitive catalog eligibility. Two 50-sample
  100-row alternating batches show wide median reductions of **2.2–2.3% strict**,
  **3.2–6.7% six ON** and **6.1–6.9% eight ON**, with lower CPU in both batches.
  Document-rules/embedded ON remain approximately flat; no new win claimed there.
- Added direct/public service-row work-count tests with preparation enabled and
  disabled. Increasing one row to 100 adds **over 100** relevant path splits with
  preparation disabled and **at most 32** with it enabled, with identical filtered
  results. This tests the actual service row loop, not just a reusable helper.
- Covered all existing guard scenarios at 100 rows/50 samples and 10 rows/75
  samples, then repeated narrow/global/embedded/virtual short cases at 250 samples.
  An initial short global strict outlier and narrow eight-ON penalty did not recur
  materially. Short cases/tails still have small mixed differences; see final
  evidence below. No uniform latency/tail improvement claimed.
- After withdrawing PIPE-04, V1 build and **606 focused tests in 12 files** passed.
  Final ESM matches the measured amortized variant:
  `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`.
  Eight declarations and lock hashes are unchanged. Final V3–V6 run in PIPE-06.

### Task PIPE-04: Bound pure field-evaluation overhead between callbacks

Status: completed
Kind: investigation
Priority: P2 — strings/functions still take nested per-field memo/async routes.
Dependencies: PIPE-01, PIPE-02
Primary ownership: private field-policy/filter/document-decision modules and tests.

Requirements: evaluate compiling proven primitive string expressions and eliminating
redundant internal promise/bookkeeping work. Preserve every actual callback, detached
grants, parent/ancestor short circuit, original actor, pending/error memo settlement,
native observations and resume boundaries. No document-result cross-row cache and
no batching across application/native work.
Acceptance: a narrowly proven implementation with count/performance evidence, or
an evidence-backed recommendation stating the unresolved proof/contract decision.
Verification: V2 field/memo/static-batch/reentry suites, document-rules V7; final V3–V6.

Completion evidence and recommendation:

- Prototyped lazy call-owned parsing for primitive strings up to 4,096 characters.
  Kept the exact `trim().split(' ')` grammar, ordered permission/grant lookups,
  errors, original function fallback and every existing await/memo/copy boundary.
  Arrays, functions, open/native prefixes and longer strings kept the evaluator.
- Differential grammar/error/short-circuit tests and an enabled/disabled-program
  work-count comparison passed: seven independent document decisions parsed
  **9 → 3 times**, with identical permission reads, alternating grants/results and
  **14 native grant-copy observations**. V2 **473 tests in nine files** passed,
  including pending/rejected settlement, reentry and native/callback boundaries.
- **36 uninstrumented paired jobs**, 100 rows, three modes, 75 samples initially
  and 100 in the reverse-order document repeat, did **not** show a repeatable gain.
  Six-ON document median means **22.93 → 23.26**, then **22.27 → 22.42 ms**;
  eight-ON **22.67 → 22.77**, then **21.98 → 22.59 ms**. Strict CPU/latency did
  not improve consistently either. No callback or hook counts changed.
- Withdrawn the runtime prototype and its implementation-specific tests. Diagnostic
  ESM SHA-256 `0917d808393da012175da8327a7c9b5c205377a17855e1bac110fa4f703c713f`.
  Do not retain parsing complexity from reduced operation counts alone.
- No promise/memo flattening retained: the cold start, evaluator await, retained
  promise settlement and hit-resume are observable validation/order boundaries
  (`test/document-authorization-validation.unit.test.ts` and
  `test/static-output-field-batch.unit.test.ts`). Omitting apparently unused grant
  copies would also omit native execution. Further batching across callbacks needs
  a separately proved closed segment or an explicit contract decision; neither is
  established here. The investigation is complete; that larger speedup is deferred.

### Task PIPE-05: Separate reusable embedded preparation from row ownership

Status: completed
Kind: investigation
Priority: P2 — per-parent derivation amplifies embedded costs.
Dependencies: PIPE-01, PIPE-02
Primary ownership: embedded output planning/finalization and captured policy.

Requirements: consider immutable path/rule preparation or authenticated scope views
without sharing resolved child calls, parent/child grants, contexts or stages. Keep
native normalization timing and independent target authority. Reproduce the earlier
cache counterexample before retaining a narrower alternative.
Acceptance: count/paired embedded benefit and native/ownership proof for a retained
change; otherwise explicitly defer, with reasons rather than a naive child cache.
Verification: V2 embedded/snapshot/native/populate/include tests, V7; final V3–V6.

Completion evidence and recommendation:

- Reproduced the earlier cache counterexample as a permanent regression in
  `test/embedded-preparation-boundary.unit.test.ts`, across all four comparison/
  initial-copy combinations. An ordinary configuration still executes an allowed
  `Date[Symbol.hasInstance]` observation during fresh child capture. A callback
  denies after those observations but allows if the previously resolved child is
  reused instead. Separate same-ID children retain independent grants/decisions
  and the original actor. All **five new tests** passed in the V2 run above.
- Revisited `authorizeEmbeddedOutputPlan`, `readServiceAuthorization`,
  `resolveServiceAuthorization` and the recursive catalog planner. Child projection
  structure is already prepared outside the row loop; the remaining per-parent
  derivation owns/copies/normalizes configuration, policy and permissions. A shared
  authenticated scope view cannot stand in for those observations merely because
  its final shape, primitive strings or parent provenance match.
- PIPE-03 tested the narrower reusable primitive catalog preparation without
  sharing child calls. Eager and lazy-first-lookup indexing added roughly 3–5% to
  embedded ON medians. The amortized variant avoids short-lived child indexes and
  leaves embedded roughly flat in two 50-sample 100-row batches. No independent
  embedded speedup from this follow-up is claimed.
- No broader embedded runtime cache or graph-pass fusion retained. Defer that
  optimization rather than weakening normalization, ownership or target authority.
  Remaining cost is the fresh per-parent capture and independently owned child
  stage/graph work, not an unimplemented blanket-cache task. Existing populated/
  included target tests and the final integration gates remain mandatory.

### Task PIPE-06: Verify retained changes and report the remaining regression

Status: completed
Kind: investigation
Priority: P1 — performance and authorization are both integration gates.
Dependencies: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
Primary ownership: combined diff, regression coverage, installed surface and this evidence.

Requirements: reconcile each prototype/withdrawal and revised dependency explicitly;
run serial full/type/downstream/packed/lint/runner gates for retained runtime changes;
repeat relevant performance/guard cases. Record strict and unsafe results separately,
unrun checks and remaining v0.51.0/application gaps. Preserve all flag defaults and
private exports. No independent-review claim without an actual independent review.
Acceptance: all retained changes satisfy correctness and measured-benefit gates;
deferred work has an honest residual-cost explanation. Do not declare historical
parity from passing tests or a small isolated allocation win.
Verification: V1–V7 as applicable and final diff/task review.

Progress (chronological; superseded by completion evidence):

- Final V1 build and V2 **606 tests in 12 files** passed. V5 ESLint, changed-file
  Prettier and diff checks passed; the preserved final artifact has eight unchanged
  declaration files, six unchanged CJS/ESM export sets and the unchanged lock.
- V6 passed **21 runner/integration tests**, including the real-worker four-mode
  comparison/initial-copy cross-product for embedded and document rules.
- Final V3 full package is running. V3 typecheck and V4 downstream tests/typecheck
  must run serially afterward, followed by a live rebuilt-artifact identity check.
  Earlier milestone passes do not substitute for these final-runtime gates.
- Serial implementer review only; no delegated or independent-review claim.

Completion evidence (2026-10-30):

- Final V3 passed **5,894 tests in 173 files** and access-router typecheck. The
  package run includes packed-consumer, export and executable-documentation gates.
  Final V4 passed **691 tests in 22 files** and downstream typecheck. All build/
  package/type/downstream commands ran serially; no further runtime edits followed.
- V5 scoped ESLint, changed-file Prettier and `git diff --check` passed. V6 passed
  **21 runner/integration tests**. V7 includes the 444 follow-up timing jobs, final
  original-baseline comparison and mode/workload audit recorded below.
- After the final downstream rebuild, **all 14 live dist files** are byte-identical
  to the measured final artifact. All **eight declaration files** are unchanged
  from the original baseline; all **six CJS/ESM public export sets** are unchanged.
  The final ESM hash is
  `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  the declaration manifest and dependency lock retain their recorded hashes.
- Reviewed the combined diff: retained only record construction and primitive
  catalog eligibility preparation, their independent references/count tests and
  safety regressions. All six comparison flags and both copy flags retain their
  existing independent, default-false, server-only contracts. No callback, native
  normalization, source/output check, binding, graph identity or target boundary
  was removed, and no new runtime surface/dependency was introduced.
- PIPE-04's string parser was withdrawn for lack of repeatable performance gain;
  PIPE-05's broader child reuse remains deferred for demonstrated observation/
  authorization differences. These completed investigations are not unfulfilled
  implementations or claimed speedups. No independent review, new v0.51.0 run,
  real-application reproduction or entire-workspace test/lint run was performed.
  The required scoped V1–V7 gates passed; no scoped verification blocker remains.
- Changes remain uncommitted and unpublished. Further application-gap work needs
  a representative application measurement/profile or a separately justified design,
  not revival of the rejected caches. Historical parity is not established.

## Execution evidence

- Planning: inspected the real service row loop, finalizer, authorization snapshots,
  field preparation/batches, existing native/ownership regressions and benchmark
  harness. Worktree clean at start. Implementation/verification begins with PIPE-01.

### First allocation milestone: implementation and measurement

The retained candidate changes **record construction**, not the number of source,
output, grant or callback copies. It still normalizes every original value and
performs the original validations/associations. Guarded assignment avoids building
a descriptor object and calling `Object.defineProperty` for absent ordinary record
keys. Inherited/special keys, changed target prototypes and snapshot arrays retain
definition fallback. The isolation helper keeps Map/array behavior and its existing
cycle/alias map. No validation state or row authority is cached by this change.

Independent original-copy implementations in tests prevent the optimized copier
from becoming its own oracle. Existing stale/native/normalization regressions are
retained. New checks cover source/proxy observation order, normalization-installed
setters, target prototype replacement, cycles/aliases, null-prototype and special
keys, permission aliases and direct/public READ/LIST in all four comparison/copy
combinations. The deterministic record/array fixture falls **9 → 2 explicit
definitions**, with the same frozen graphs; the larger differential fixture falls
**172 → 120 definitions**, retaining **52 freezes**, all array definitions and
all three wire clones in its three-BSON-occurrence fixture. These are operation
counts, not heap-byte measurements. The existing real-service source-validation
budgets also passed unchanged.

#### Reproducibility and limits

- Base revision `50491a7df502966b68a91330d98a5fb38c9a1c77` plus only the recorded
  local changes. Node **26.12.1**, MongoDB **8.2.6**, Mongoose **9.11.4**, Express
  **5.2.1**, Zod **4.4.3**; identical workspace peers and dependency lock throughout.
- Baseline ESM SHA-256:
  `e8b3e25b56a515bfadd0a16821104542e7f82f5fbad5eca2172d9a50fb2eac25`.
  Final candidate:
  `e74d8ca855358775d3e9fc772afb308c322aab64a73747cddbd2842dc0020430`.
  Shared declaration manifest SHA-256:
  `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e`.
  Lock SHA-256:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- **470 uninstrumented jobs** in the initial matrix: 18 initial baselines, 144 exploratory
  prototype jobs (including the withdrawn slower dictionary/spread builder),
  24 same-source isolation-helper attribution jobs and 284 final-candidate
  before/after jobs. The latter cover the existing nine scenarios at 10/100 rows,
  three explicit modes and longer priority/noisy-case repetitions.
- Existing worker/workloads were unchanged. Settings: **24 fields, 32 bytes,
  five warmups, one client, hook concurrency 10**. Main/guard jobs used 25 samples;
  final priority and attribution jobs used 50; longer guard repeats used 75.
  Pairs alternate before/after/after/before or the reverse in fresh worker/database
  jobs, without concurrent builds/tests during timings. Host load was not controlled.
- Every measured case matched the common expected output, denied-field/ordering
  checks, actual hydration and per-case fingerprint. Reads remained **1/request**,
  or **2/request** for populate. Document rules retained **100 hooks/request** and
  virtuals **200 getters/request** at 100 rows. Separate source tests retained
  callback order/count and Date/BSON observation counts. No sampled CPU profile was
  collected in this milestone; counts/controlled built variants support the bounded
  construction change, not a new ranking of all remaining pipeline costs.
- Tables show **means of independent jobs' medians/p95/CPU**, not pooled
  percentiles; units are milliseconds/request. CPU includes the Node client/server,
  not MongoDB. Strict = all unsafe flags false; six ON = comparison flags true,
  copy flags false; eight ON = both groups true. All modes retain their original,
  distinct security contracts. Small jobs and tails remain noisy; these are not
  statistical-confidence or application-latency guarantees.
- No new v0.51.0 run or real-application reproduction. The historical performance
  gap is not declared fixed, and source-only historical attribution remains invalid
  across frozen dependency differences. Full package/type/downstream verification
  subsequently passed; see PIPE-02 completion evidence above.

#### Final priority repetitions (50 samples/job)

Two jobs/build/case/batch; batch 2 reverses ordering. CPU and median improve in
both batches for the three priorities/modes. The second strict document batch
included a slower baseline job (419.25 ms median); strict embedded also varied
substantially between batches. Do not attribute that host variance to this change.

| Case                         | Mode     | Median before → after | p95 before → after | CPU before → after |
| ---------------------------- | -------- | --------------------: | -----------------: | -----------------: |
| plain-wide/100 · batch 1     | strict   |         55.76 → 38.71 |      59.46 → 43.72 |      61.14 → 44.78 |
| plain-wide/100 · batch 1     | six ON   |         25.43 → 21.48 |      29.94 → 25.13 |      29.62 → 26.01 |
| plain-wide/100 · batch 1     | eight ON |         21.97 → 19.67 |      25.52 → 23.26 |      27.53 → 24.88 |
| document-rules/100 · batch 1 | strict   |       320.82 → 190.54 |    341.45 → 213.46 |    329.66 → 204.70 |
| document-rules/100 · batch 1 | six ON   |         26.21 → 22.69 |      28.61 → 26.21 |      31.82 → 28.58 |
| document-rules/100 · batch 1 | eight ON |         25.63 → 22.15 |      29.47 → 25.54 |      31.38 → 27.86 |
| embedded/100 · batch 1       | strict   |       788.73 → 566.66 |    807.50 → 595.09 |    822.81 → 596.48 |
| embedded/100 · batch 1       | six ON   |         68.09 → 57.35 |      77.37 → 62.01 |      80.09 → 68.51 |
| embedded/100 · batch 1       | eight ON |         66.52 → 57.05 |      71.93 → 65.04 |      78.10 → 69.97 |
| plain-wide/100 · batch 2     | strict   |         58.89 → 41.17 |      63.64 → 48.26 |      64.62 → 47.34 |
| plain-wide/100 · batch 2     | six ON   |         24.87 → 21.88 |      29.75 → 25.15 |      30.99 → 27.53 |
| plain-wide/100 · batch 2     | eight ON |         23.49 → 20.95 |      27.31 → 24.77 |      29.43 → 26.95 |
| document-rules/100 · batch 2 | strict   |       383.80 → 213.95 |    490.59 → 230.85 |    405.91 → 224.23 |
| document-rules/100 · batch 2 | six ON   |         27.36 → 23.52 |      30.69 → 26.70 |      34.08 → 29.70 |
| document-rules/100 · batch 2 | eight ON |         26.52 → 23.05 |      30.35 → 26.10 |      32.56 → 29.06 |
| embedded/100 · batch 2       | strict   |       843.28 → 652.42 |    933.75 → 788.76 |    883.60 → 694.14 |
| embedded/100 · batch 2       | six ON   |         74.71 → 59.75 |      87.91 → 66.08 |      89.00 → 72.85 |
| embedded/100 · batch 2       | eight ON |         67.58 → 57.52 |      71.88 → 66.36 |      78.33 → 69.62 |

Priority median reductions across the two batches: strict wide **30.1–30.6%**,
document-rules **40.6–44.3%**, embedded **22.6–28.2%**; six ON wide **12.0–15.5%**,
document-rules **13.4–14.0%**, embedded **15.8–20.0%**; eight ON wide **10.4–10.8%**,
document-rules **13.1–13.6%**, embedded **14.2–14.9%**. These are incremental over
this phase's before implementation, not speedups relative to v0.51.0.

#### Other 100-row guards (25 samples/job)

| Case             | Mode     | Median before → after | p95 before → after | CPU before → after |
| ---------------- | -------- | --------------------: | -----------------: | -----------------: |
| plain-narrow/100 | strict   |         23.87 → 19.68 |      25.97 → 21.93 |      27.12 → 22.77 |
| plain-narrow/100 | six ON   |         12.31 → 12.57 |      13.77 → 14.68 |      15.99 → 16.42 |
| plain-narrow/100 | eight ON |         12.34 → 11.45 |      14.64 → 14.06 |      16.13 → 15.36 |
| hydrated/100     | strict   |         55.19 → 40.03 |      58.53 → 43.87 |      62.56 → 47.62 |
| hydrated/100     | six ON   |         25.67 → 22.90 |      29.28 → 24.84 |      33.03 → 30.08 |
| hydrated/100     | eight ON |         24.04 → 21.67 |      26.76 → 24.65 |      30.92 → 29.27 |
| global-rules/100 | strict   |       318.72 → 188.29 |    337.83 → 202.94 |    331.72 → 200.35 |
| global-rules/100 | six ON   |         26.83 → 23.06 |      30.01 → 25.24 |      33.75 → 30.14 |
| global-rules/100 | eight ON |         25.06 → 23.08 |      27.71 → 26.34 |      32.57 → 30.93 |
| large-config/100 | strict   |         54.93 → 39.93 |      59.67 → 44.73 |      62.03 → 46.63 |
| large-config/100 | six ON   |         25.43 → 21.83 |      29.21 → 24.75 |      32.67 → 29.03 |
| large-config/100 | eight ON |         23.24 → 21.09 |      26.13 → 24.15 |      30.21 → 28.25 |
| populate/100     | strict   |         73.24 → 53.92 |      76.08 → 56.63 |      79.99 → 61.57 |
| populate/100     | six ON   |         29.53 → 26.53 |      34.24 → 30.03 |      38.41 → 33.70 |
| populate/100     | eight ON |         28.80 → 26.25 |      33.80 → 29.07 |      36.71 → 33.40 |
| virtuals/100     | strict   |         84.75 → 58.39 |      94.58 → 64.69 |      93.43 → 65.74 |
| virtuals/100     | six ON   |         31.93 → 26.46 |      36.31 → 29.70 |      39.33 → 33.42 |
| virtuals/100     | eight ON |         30.11 → 24.88 |      33.79 → 27.74 |      36.99 → 32.21 |

#### 10-row guards (25 samples/job)

| Case              | Mode     | Median before → after | p95 before → after | CPU before → after |
| ----------------- | -------- | --------------------: | -----------------: | -----------------: |
| plain-narrow/10   | strict   |           6.51 → 5.88 |        8.20 → 7.49 |       10.60 → 9.27 |
| plain-narrow/10   | six ON   |           4.84 → 4.86 |        6.02 → 6.63 |        6.84 → 7.72 |
| plain-narrow/10   | eight ON |           4.51 → 4.23 |        6.34 → 6.14 |        7.23 → 6.27 |
| plain-wide/10     | strict   |          10.23 → 7.96 |      12.68 → 13.10 |      14.30 → 11.55 |
| plain-wide/10     | six ON   |           6.46 → 5.95 |        8.60 → 8.46 |        8.86 → 8.39 |
| plain-wide/10     | eight ON |           6.44 → 6.32 |        9.03 → 8.93 |        9.69 → 9.46 |
| hydrated/10       | strict   |          10.16 → 8.37 |      14.36 → 11.96 |      14.71 → 12.93 |
| hydrated/10       | six ON   |           7.37 → 7.09 |        9.58 → 9.51 |       9.69 → 10.40 |
| hydrated/10       | eight ON |           6.98 → 7.18 |        9.87 → 9.52 |      10.50 → 10.37 |
| global-rules/10   | strict   |         38.16 → 24.41 |      41.85 → 26.88 |      40.20 → 27.05 |
| global-rules/10   | six ON   |           7.48 → 6.70 |       12.06 → 9.77 |       11.02 → 9.94 |
| global-rules/10   | eight ON |           7.07 → 6.80 |       10.70 → 9.38 |       10.73 → 9.34 |
| document-rules/10 | strict   |         37.23 → 23.70 |      40.05 → 28.03 |      40.18 → 28.68 |
| document-rules/10 | six ON   |           6.78 → 6.49 |       10.18 → 8.76 |       10.11 → 8.87 |
| document-rules/10 | eight ON |           6.55 → 6.35 |        9.41 → 8.96 |        9.08 → 8.68 |
| large-config/10   | strict   |          10.50 → 8.92 |      14.03 → 12.02 |      13.69 → 12.93 |
| large-config/10   | six ON   |           7.38 → 6.58 |        9.39 → 8.65 |       10.57 → 8.80 |
| large-config/10   | eight ON |           7.05 → 6.64 |        9.48 → 9.08 |        9.87 → 8.86 |
| embedded/10       | strict   |         86.43 → 63.98 |      92.93 → 72.80 |      89.70 → 69.46 |
| embedded/10       | six ON   |         11.62 → 10.45 |      16.61 → 15.87 |      14.49 → 13.28 |
| embedded/10       | eight ON |          11.18 → 9.59 |      16.32 → 16.19 |      14.90 → 12.68 |
| populate/10       | strict   |         14.32 → 12.37 |      21.68 → 18.98 |      19.96 → 17.22 |
| populate/10       | six ON   |           9.14 → 9.06 |      11.97 → 12.00 |      12.30 → 12.42 |
| populate/10       | eight ON |           9.05 → 8.59 |      11.58 → 12.43 |      12.01 → 11.54 |
| virtuals/10       | strict   |         13.07 → 10.34 |      17.23 → 14.47 |      17.92 → 15.63 |
| virtuals/10       | six ON   |           7.60 → 7.20 |       10.09 → 9.75 |      11.30 → 10.42 |
| virtuals/10       | eight ON |           7.25 → 6.54 |       10.49 → 9.89 |      11.00 → 10.34 |

#### Longer noisy-case repeats (75 samples/job)

The initial narrow 100-row six-ON penalty did not persist. Hydrated/populate short
case medians also favored the candidate in the longer repeat. **Narrow 10-row six
ON still had a small CPU/p95 penalty despite a slightly lower median**, so do not
claim uniform improvement. A subsequent 300-sample repeat did not reproduce that
six-ON penalty; PIPE-02 completion evidence records its results. No test/build load
ran alongside those timings.

| Case             | Mode     | Median before → after | p95 before → after | CPU before → after |
| ---------------- | -------- | --------------------: | -----------------: | -----------------: |
| plain-narrow/100 | six ON   |         12.64 → 10.70 |      15.37 → 13.97 |      15.01 → 13.11 |
| plain-narrow/100 | eight ON |         11.51 → 10.47 |      13.70 → 12.70 |      14.02 → 12.83 |
| plain-narrow/10  | six ON   |           4.06 → 3.97 |        5.66 → 6.06 |        5.07 → 5.29 |
| plain-narrow/10  | eight ON |           4.12 → 3.83 |        5.95 → 5.82 |        5.11 → 4.79 |
| hydrated/10      | six ON   |           5.85 → 5.54 |        8.99 → 7.81 |        7.78 → 6.91 |
| hydrated/10      | eight ON |           6.64 → 5.90 |       10.85 → 8.15 |        8.80 → 7.35 |
| populate/10      | six ON   |           8.73 → 8.61 |      12.75 → 12.62 |      10.40 → 10.27 |
| populate/10      | eight ON |           8.44 → 8.18 |      12.96 → 11.56 |      10.36 → 10.19 |

### Remaining preparation/evaluation phase: retained result

The only additional runtime change after PIPE-02 is bounded primitive eligibility
preparation on the **private captured catalog**. It registers a counter, proves
dense frozen own-string slots after 32 uses, then retains a path Set and at most
20,000 boolean eligibility results. This is not a permission, document-result,
snapshot-validation or resolved-child cache. Open/sparse/unregistered catalogs and
non-primitive paths retain the original evaluator; callers still authenticate the
same bindings. All normalization/copy/callback/ownership passes remain in place.

The eager, lazy-first-use and primitive-string prototypes are withdrawn. PIPE-04
and PIPE-05 completed as investigations with explicit no-change/defer outcomes;
they do not represent an achieved string-rule or embedded speedup.

#### Evidence identity and coverage

- The final rebuild is byte-identical to the measured amortized-catalog runtime:
  ESM SHA-256 `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`.
  PIPE-02 incremental baseline remains
  `e74d8ca855358775d3e9fc772afb308c322aab64a73747cddbd2842dc0020430`;
  original phase baseline, declaration manifest and lock hashes are listed above.
- **444 additional uninstrumented jobs**, including rejected prototypes, bring
  this phase to **922 jobs**. Retention comparisons used two alternating 50-sample
  100-row priority batches, all six other existing 100-row guards at 50 samples,
  all nine 10-row guards at 75 samples, and four short-case repeats at 250 samples.
  A final original-baseline/final-source priority batch used 50 samples.
- Same worker, dependencies, MongoDB, Node, 24 fields, 32 bytes, five warmups, one
  client and hook concurrency 10. No builds/tests overlapped timing jobs. Host
  load was not controlled; there is no new sampled CPU profile or heap-byte claim.
- Audited all 444 results: requested/effective modes, hydration, fingerprints,
  order/denied-field checks and reads match. Document rules retained 100 hooks per
  100-row request; virtuals retained 200 getters. Populate retained two reads,
  everything else one. Instrumented work counts were separate from timings.
- Raw builds, metadata, paired results and full guard tables are in ignored
  `_tmp-query-pipeline/`; the committed reproducible workload remains
  `scripts/benchmarks/access-router-worker.mjs` / `pnpm bench:access-router`.
  Statistics below are again means of per-job statistics, not pooled percentiles.

#### Additional wide benefit over PIPE-02 (100 rows, 50 samples/job)

Document-rules/embedded ON were approximately flat, not the source of the retained
benefit. In particular, embedded six-ON median means were **57.18 → 57.61** and
**58.01 → 58.07 ms**; strict and eight-ON had mixed small CPU/tail differences.

| Batch | Mode     | Median before → after | p95 before → after | CPU before → after |
| ----- | -------- | --------------------: | -----------------: | -----------------: |
| 1     | strict   |         37.93 → 37.10 |      41.25 → 40.92 |      43.14 → 42.28 |
| 1     | six ON   |         20.29 → 18.92 |      22.63 → 22.34 |      25.17 → 24.50 |
| 1     | eight ON |         19.93 → 18.55 |      23.05 → 22.12 |      25.09 → 23.93 |
| 2     | strict   |         38.13 → 37.25 |      41.77 → 41.52 |      43.17 → 42.30 |
| 2     | six ON   |         20.32 → 19.67 |      22.82 → 23.06 |      25.72 → 25.05 |
| 2     | eight ON |         19.80 → 18.59 |      22.42 → 21.70 |      25.41 → 24.02 |

100-row guard median means also improved for hydrated, large-config, populate and
virtuals, while narrow/global rules were roughly flat to slightly lower. Short
cases are not uniform wins: initial narrow eight-ON median **3.82 → 3.99 ms** and
CPU **4.79 → 5.15** became **3.52 → 3.53** and **4.00 → 4.02** at 250 samples.
The short global strict outlier (**22.76 → 24.92 median**, **24.31 → 35.19 CPU**)
became **22.26 → 22.30** and **22.93 → 22.97**. Short embedded strict also returned
to approximately flat. Narrow six-ON p95 still changed **4.96 → 5.22 ms** in the
long repeat; small CPU/median/tail differences remain and no universal win or
confidence-interval claim is made.

#### Final complete phase vs original phase baseline

This final batch measures **PIPE-02 + PIPE-03 together**, not the catalog change
alone, and not v0.51.0. Two jobs/build/case/mode, 100 rows, 50 samples/job.

| Case               | Mode     | Median before → after | p95 before → after | CPU before → after |
| ------------------ | -------- | --------------------: | -----------------: | -----------------: |
| plain-wide/100     | strict   |         54.69 → 37.29 |      58.96 → 41.67 |      60.07 → 42.71 |
| plain-wide/100     | six ON   |         23.65 → 19.33 |      25.83 → 23.03 |      28.78 → 25.20 |
| plain-wide/100     | eight ON |         22.71 → 19.11 |      26.04 → 22.16 |      27.98 → 24.62 |
| document-rules/100 | strict   |       328.70 → 196.61 |    343.59 → 218.00 |    340.17 → 212.21 |
| document-rules/100 | six ON   |         27.13 → 23.45 |      30.08 → 26.67 |      32.56 → 28.95 |
| document-rules/100 | eight ON |         25.97 → 22.70 |      29.87 → 26.10 |      32.02 → 28.49 |
| embedded/100       | strict   |       799.89 → 565.64 |    813.80 → 578.34 |    829.98 → 592.62 |
| embedded/100       | six ON   |         68.77 → 58.51 |      73.94 → 62.39 |      80.82 → 69.17 |
| embedded/100       | eight ON |         65.61 → 57.23 |      70.90 → 62.44 |      77.65 → 70.24 |

The reported application/v0.51.0 gap remains **unresolved/unmeasured here**. Passing
authorization tests and matching workload outputs do not establish historical
parity, application latency or equivalence of strict and unsafe security contracts.
