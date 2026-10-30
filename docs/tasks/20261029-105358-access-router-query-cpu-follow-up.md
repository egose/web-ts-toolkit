# Access-router query CPU follow-up

Created: 2026-10-29 10:53:58 PDT
Status: completed

Initial outcome: QCPU-01–06 completed as bounded investigations. No runtime optimization
was retained: the blanket cache changed authorization behavior, and smaller
allocation experiments lacked repeatable relevant gains. The performance gap is
**not resolved**; further work needs a new justified design or a separately approved
contract change. Existing benchmark-runner work was preserved.

Continuation outcome: QCPU-07 retained a literal primitive catalog-path fast path,
and QCPU-06 passed the full retained-change gates. Paired 100-row wide LIST runs
with skips ON improved about 5%; embedded and document-rule ON costs are largely
unchanged. No flags, snapshot contracts or authorization boundaries changed. The
larger performance gap remains unresolved; historical investigation evidence below
is preserved separately from the continuation results.

Separate security-affecting feature planning now lives in
[`20261029-164234-access-router-initial-output-snapshot-copy-opt-outs.md`](20261029-164234-access-router-initial-output-snapshot-copy-opt-outs.md).
It proposes new READ/LIST output-copy flags, not an expansion of the six comparison
flags or a reopening of this completed security-preserving optimization phase.

The subsequent query-pipeline implementation phase is tracked separately in
[`20261029-211734-access-router-query-pipeline-overhead.md`](20261029-211734-access-router-query-pipeline-overhead.md).
It starts by proving the real service's output publication/copy boundary; earlier
rejected caches and the unresolved historical performance gap remain relevant.

## Objective and scope

Profile and reduce the remaining model-query CPU cost after the six temporary
unsafe snapshot-comparison opt-outs. Prioritize the existing 100-row plain-wide,
document-rules and embedded LIST workloads, in both strict mode and with all
opt-outs ON. Aim toward v0.51.0 performance without promising parity or weakening
the authorization guarantees of either existing mode.

This is a new measured phase after
`docs/tasks/20261028-005846-access-router-list-cpu-remediation.md` and
`docs/tasks/20261028-121231-access-router-snapshot-validation-cpu.md`. The latter
retained static-field batching but withdrew its allocation-reduced comparator after
paired tests found it slower; do not assume that experiment is a viable fast path.

**Non-goals:** Do not add benchmark scenarios, disable permission enforcement,
change dependency versions, introduce public APIs or add new unsafe flags by
default. Do not silently expand the existing flags. Any further weakening needs
explicit user approval and a separately documented contract, tests and warning.
Proceed only with evidence-backed changes within these boundaries.

## Evidence and limitations

User-reported 100-row, one-client median latency (milliseconds):

| Existing scenario | v0.51.0 | v0.61.0, skips OFF | v0.61.0, skips ON |
| ----------------- | ------: | -----------------: | ----------------: |
| plain-narrow      |    3.15 |              23.96 |             12.21 |
| plain-wide        |    5.95 |              54.69 |             24.54 |
| hydrated          |    7.63 |              54.63 |             25.78 |
| document-rules    |    6.40 |             327.00 |             28.81 |
| large-config      |    5.91 |              55.54 |             26.25 |

The recorded run used 24 fields, 32 payload bytes, 25 measured requests, five
warmups, one client and hook concurrency 10. Each case recorded one Mongoose
read/request. The 100-row document-rules case recorded 2,500 document-hook calls
per candidate; it also includes document-dependent string rules and field callbacks.
ON CPU was 36.32 ms/request versus 7.99 for v0.51.0. These are historical
observations, not a new baseline run.

The supplied table has no embedded results. Existing `embedded` and `document-rules`
are separate scenarios, not a combined embedded-plus-hook workload. CPU includes
the Node client and server, not MongoDB. Historical builds use their own
dependencies (the recorded Mongoose versions were 9.9.2 and 9.11.4). Fingerprints
alone do not prove authorization equivalence or callback ordering. No current
ON-mode CPU profile was collected during task creation; older pre-flag profiles
cannot establish current hotspots. Application-specific performance is unmeasured.

Source observations, not measured hotspot rankings:

- `packages/access-router/src/services/service.ts` (`find`, `finalizeDirectOutput`)
  creates per-row diagnostic copies, authorization stages and final output copies.
- `packages/access-router/src/output/finalize-model-output.ts` (`prepareFinalizer`,
  `finalizeSingleDoc`) prepares finalization and isolates output/metadata per row;
  `retainOutputMetadata` returns early for stripped metadata or child scopes.
- `packages/access-router/src/acl/document-authorization.ts`
  (`createDocumentAuthorizationStage`, `associateDocumentAuthorization`,
  `unchangedOutput`) still creates detached snapshots and walks output identities
  when comparisons are skipped. Copying also validates structure and may execute
  native serialization behavior.
- `packages/access-router/src/acl/output-field-filter.ts`
  (`authorizeEmbeddedOutputPlan`) derives child authorization per parent scope;
  existing field-policy caches and static boolean batches do not batch mixed
  string/function policy paths.

The working tree contained local benchmark-runner changes at task creation; preserve
them. The per-candidate OFF/ON/BOTH interface and integration test may not exist in
another checkout until integrated. No tests, new benchmark or profile were run
solely to create this task file.

## Required invariants

- Preserve all six independent server-only flags, literal-`true` enablement,
  default `false`, default-model precedence, effective-transition warnings,
  initiating-model descendant propagation and captured call/handle behavior.
  READ-to-list retries use READ settings; writes and fresh helpers remain strict.
  Requests, policies and per-call defaults cannot select these flags.
- LIST flags: `unsafeSkipListDocumentSnapshotChecks`,
  `unsafeSkipListOutputSnapshotChecks`, `unsafeSkipListNestedDocumentSnapshotChecks`.
  READ flags: `unsafeSkipReadDocumentSnapshotChecks`,
  `unsafeSkipReadOutputSnapshotChecks`, `unsafeSkipReadNestedDocumentSnapshotChecks`.
  Existing benchmarks exercise LIST only; verify READ and retries with tests.
- Preserve each mode's existing behavior separately. ON already permits stale-value
  decisions and is **not** security-equivalent to OFF. Keep operation/row/field
  permissions, exact request/runtime/model/scope/access/stage ownership, parent-child
  provenance, graph identities, structural limits and fail-closed admission in both.
- Keep detached callback inputs, grants and mutable native leaves; original actor,
  callback count/order/short-circuiting, exceptions, async boundaries, hook limits,
  reentry and retained contexts. `Object.freeze` does not make BSON, Date, Buffer,
  Map or Set immutable.
- No public-plan authority, cross-request policy cache or validation certificate
  across an await, callback, native serialization or possible reentry. Share only
  proven immutable data within the authenticated call/scope.
- Initial snapshot copying also enforces bounds, shape and native behavior. Do not
  simply delete it: getters, proxies, BSON wire hooks, cycles and unusual values can
  affect behavior or rejection. Preserve observations or defer the experiment.

## Commands and execution rules

Run commands from the repository root. Package scripts rebuild shared `dist/`;
run builds, package tests and benchmarks serially. Preserve unrelated work and do
not modify historical tag trees, existing workloads or response checks to improve
timings. Unprefixed `src/` and `test/` paths below are relative to
`packages/access-router/`.

- **B1 Build:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
- **B2 Focused:** after B1, use `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts <test files>`;
  replace the placeholder with actual package-relative paths. Relevant suites include
  `test/query-snapshot-work.unit.test.ts`, `test/query-snapshot-options.unit.test.ts`,
  `test/static-output-field-batch.unit.test.ts`, `test/document-authorization-validation.unit.test.ts`,
  `test/snapshot-review-regressions.unit.test.ts` and
  `test/authorization-snapshot-differential.unit.test.ts`.
- **B3 Package:** `pnpm --filter @web-ts-toolkit/access-router test` (includes packed
  consumer/export checks; Mongo integration needs a usable Mongo binary).
- **B4 Types:** `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- **B5 Downstream:** `pnpm --filter @web-ts-toolkit/access-router-deco test`.
- **B6 Lint/format:** `pnpm exec eslint packages/access-router/src packages/access-router/test`;
  lint `scripts/benchmarks` if changed, check formatting and run `git diff --check`.
- **B7 Runner:** `node --test scripts/benchmarks/access-router.test.mjs`; if present
  and built, also run `node --test scripts/benchmarks/access-router.integration.test.mjs`.
- **B8 Timing:** `pnpm bench:access-router`; see `scripts/benchmarks/README.md`.
  It fetches tags interactively and may download MongoDB. Select current OFF and ON,
  and v0.51.0 as historical context when available. Use existing scenarios only.

Starting matrix: 10/100 rows, 24 fields, 32 bytes, one client, hook concurrency 10,
five warmups and at least 25 measured requests. Repeat paired/alternating runs;
include plain-narrow, plain-wide, hydrated, document-rules, large-config and embedded,
plus populate when changing related graph paths. Record commits, hashes, dependency
versions, settings, median/p95, CPU, read counts, fingerprints and hook counts.
Profile measured work separately from uninstrumented timing; do not add flaky
wall-clock assertions. Keep shared evidence repo-scoped and sanitized, without
machine-local paths or ignored scratch references.

Priorities: P1 = measurement or correctness gate; P2 = conditional optimization.
Tasks 02–05 can complete with an evidence-backed no-change recommendation. Run
experiments serially because source ownership overlaps. No delegation or independent
review has been requested or performed.

## Ordered tasks

### Task QCPU-01: Attribute remaining ON-mode work

Status: completed
Kind: investigation
Priority: P1 — ON-mode costs are measured but not attributed.
Dependencies: none
Primary ownership: `scripts/benchmarks/`, diagnostic instrumentation, `src/acl/`, `src/output/`.

**Finding:** The 100-row wide/document-rule gap remains roughly 4× with skips ON;
neither the ON CPU distribution nor an embedded baseline has been established.

**Requirements:** Profile/count existing plain-wide, document-rules and embedded
in OFF and ON modes. Distinguish snapshot copy/validation, BSON cloning, identity
traversal, row/child preparation, field memo/callback work and GC where possible.
Count document hooks and field callbacks separately. Profile measured windows where
practical and run separate uninstrumented paired timings; do not attribute costs from
DB read counts or old pre-flag profiles.

**Acceptance:** Record reproducible settings, build/mode identities, ranked hotspots,
limitations and candidate recommendations. Verify fingerprints, denied fields,
ordering, read counts and hook behavior; disclose profiling and dependency confounds.

**Verification:** B1, relevant B2, B7 if runner code changed, paired B8 and a
separately collected profile. Record actual results and unrun checks.

Progress:

- B1 build passed before profiling.
- The first profiling attempt failed before measurement because a diagnostic-only
  helper shadowed the HTTP helper. Corrected the temporary driver and reran; this
  was not a package failure. Partial uninstrumented observations are not a baseline.

Completion evidence:

- Source revision `e5bea4f`, with the previously noted benchmark-runner changes;
  pre-change ESM SHA-256 `fdfb84a3c94df9d4bdd8c2120aecb2ff38ad1c467a535cf2f516c7f608dbe95f`.
  The unchanged benchmark worker ran 100 rows, 24 fields, 32 bytes, 25 samples,
  five warmups, one client and hook concurrency 10. Node 26.12.1, MongoDB 8.2.6,
  Mongoose 9.11.4 and Express 5.2.1. Two uninstrumented OFF and two ON runs per
  scenario were interleaved; the v0.51.0 user result was not rerun in this phase.
- Before median ranges (OFF → ON): plain-wide **53.87–54.64 → 23.35–23.60 ms**;
  document-rules **304.65–316.17 → 27.16–27.18 ms**; embedded
  **778.09–808.14 → 67.11–68.67 ms**. All returned the expected output and one
  read/request; document-rules ran 2,500 document hooks per measured job.
- Separate 0.5-ms sampled measured-window profiles, with diagnostic-only callback
  counters, found ON-mode inclusive samples under `copyAuthorizationValue` of
  about **12.6% / 22.2% / 29.3%** for wide/document/embedded, respectively;
  `deepIsolateValue` accounted for about **11.4% / 8.7% / 16.0%**. Embedded
  `authorizeEmbeddedOutputPlan` accounted for about **18.3%**, overlapping other
  categories. Profiles include Node client/transport, samples are not causal,
  category percentages overlap and instrumentation can perturb execution.
- Separate instrumented counts per 100-row request: ON wide/document/embedded
  made **1 / 1 / 101** `resolveServiceAuthorization` calls, **100 / 100 / 500**
  document stages and **100 / 100 / 200** finalizer preparations. Embedded
  derived a child plan 100 times, copied 74,546 snapshot nodes and
  walked output identities 1,700 times. Dynamic rules invoked 1,200 field callbacks
  and 100 document hooks per request in both modes. Count instrumentation changes
  timing, so it is not used as a performance result.
- B1 passed. Focused B2: **461 tests in 7 files** passed. B7: **18 tests passed**.
  The timing/profile used isolated jobs with the same existing worker/workload,
  rather than a new interactive B8 invocation. Prioritize QCPU-04, then re-evaluate
  QCPU-02/03/05 against measured impact and contract proof.

### Task QCPU-02: Investigate output and metadata copies

Status: completed
Kind: investigation
Priority: P2 — repeated cloning exists; its ON-mode cost is unmeasured.
Dependencies: QCPU-01
Primary ownership: `src/output/finalize-model-output.ts`, `src/acl/document-authorization.ts`,
`src/acl/authorization-snapshot.ts`, focused tests.

**Finding:** Output association saves a snapshot even when comparison is skipped;
finalization also copies metadata source before knowing if it will be retained.
These copies can validate or observe more than their eventual stored value.

**Requirements:** If material, consider narrowly proven copy elimination/fusion or
validation-preserving alternatives. Preserve current initial snapshot, structural,
native/side-effect and exact-identity behavior in each mode; fall back for unproven
inputs. Otherwise record the failed proof or lack of measured benefit.

**Acceptance:** A retained change has deterministic work-count evidence, repeatable
paired CPU/latency benefit and no relevant regression. Tests cover getters/proxies,
BSON wire hooks and mutable natives, cycles/limits, equal replacement, mutation
across awaits and stripped metadata; otherwise document a no-change recommendation.

**Verification:** B1/B2 and paired B8 OFF/ON; B3–B7 at integration.

Resolution: no production change retained.

- Separate compiled experiments preserved the original workload and tested
  primitive-recursion specialization in isolation and snapshot copying. Paired
  ON runs covered embedded, wide and document rules; the snapshot experiment also
  covered strict document rules. Outputs and reads matched in every job.
- Inline primitive isolation showed no consistent latency/CPU improvement.
  Snapshot-property specialization gave small wide/embedded gains but slower
  ON document rules; strict document-rule runs were mixed. These are not a
  repeatable broadly useful improvement, so neither experiment was shipped.
- Direct removal of initial output/metadata copying is not approved: copying can
  execute native/normalization behavior and enforce structure, even when its stored
  result is unused. Retain those contracts pending a separately justified design.

### Task QCPU-03: Investigate call-scoped finalizer preparation

Status: completed
Kind: investigation
Priority: P2 — repeated preparation could affect all ON workloads.
Dependencies: QCPU-01
Primary ownership: `src/services/service.ts`, `src/output/finalize-model-output.ts`,
`src/acl/service-authorization.ts`, focused tests.

**Finding:** LIST calls `finalizeDirectOutput` per row and `prepareFinalizer` reads
authorization configuration and prepares hook lookup. Some narrower reads and batch
preparation already exist.

**Requirements:** If material, share only proven immutable authenticated
call/scope preparation. Keep row-specific contexts, snapshots, grants, decisions
and output associations separate; preserve dynamic lookup timing, per-call schema
changes, callback ordering and bounded concurrency. No cross-request identity cache.

**Acceptance:** Demonstrate less repeated preparation and paired workload benefit,
or justify no change. Cover concurrent rows, same-ID stages, runtime changes,
in-flight capture, native/callback reentry and non-plain configuration fallback.

**Verification:** B1/B2 and paired B8; B3–B7 at integration.

Resolution: no production change; a more invasive hoist is not justified in this phase.

- ON profiles place about 4.5–5.6% of inclusive sampled work under finalizer
  preparation. Existing `finalizeModelOutputs` already shares pass preparation;
  service-level rows also have independently mutable contexts and output stages.
- `test/finalizer-preparation.unit.test.ts` explicitly protects dynamic bare-function
  hook properties and private prepared configuration from traversal callbacks.
  Native configuration copies and their observation timing are part of the current
  boundary. Sharing complete preparation lacks an equivalence proof; don't trade
  those guarantees for this smaller, unproven opportunity.
- Investigation conclusion only: no before/after gain is claimed and no new runtime
  implementation was produced.

### Task QCPU-04: Investigate embedded child planning and graph work

Status: completed
Kind: investigation
Priority: P2 — embedded amplification is plausible but not yet measured.
Dependencies: QCPU-01
Primary ownership: `src/acl/output-field-filter.ts`, `src/output/finalize-model-output.ts`,
`src/acl/document-authorization.ts`, focused tests.

**Finding:** `authorizeEmbeddedOutputPlan` derives child authorization during parent
finalization; copies and identity transfers traverse child graphs.

**Requirements:** If profiles justify it, reuse only proven call-scoped child
planning or combine safe graph work without sharing per-parent/child grants, stages,
inputs or decisions. Preserve provenance and validation boundaries; populated and
included targets have independent ownership and are not interchangeable with children.

**Acceptance:** Show repeatable paired improvement in the unchanged embedded
workload while preserving both modes, or justify no change. Cover multiple parents,
same-ID rows, mutation/equal replacement, nested/populated/included graphs and reentry.

**Verification:** B1/B2, paired B8 embedded and populate if graph transfer changes;
B3–B7 at integration.

Resolution: blanket child-call reuse rejected; no production change.

- The hotspot is real (100 child derivations and about 18.3% overlapping sampled
  work for 100 parents), but derivation performs observable normalization, not just
  pure planning.
- A bounded diagnostic compared a fresh derivation with naive reuse of the first
  child call. An allowed `Date[Symbol.hasInstance]` normalization hook ran 39 times
  on fresh derivation and zero times on reuse. A document-field callback depending
  on that observation changed from **denied to allowed** on reuse.
- This is a demonstrated behavioral/authorization regression, not proof that every
  narrower possible optimization is unsafe. It rules out the blanket cache and
  reinforces the existing snapshot-review tests; no graph checks or grants were
  disabled to get a better timing result.

### Task QCPU-05: Investigate mixed document-dependent field decisions

Status: completed
Kind: investigation
Priority: P2 — mixed-rule fallback may cause per-field overhead.
Dependencies: QCPU-01
Primary ownership: `src/acl/output-field-policy.ts`, `src/acl/output-field-filter.ts`,
`src/acl/document-authorization.ts`, focused tests.

**Finding:** Static batching accepts proven boolean rules; the document-rules fixture
mixes strings and functions and may take the dynamic path. Its ON-mode cost is unknown.

**Requirements:** If justified, prepare rules per call or batch only proven pure
segments. Dynamic callbacks remain per document and in the original order. Preserve
prefix/fallback semantics, memo keys, short-circuiting, exceptions and async checks;
never cache document-dependent decisions across rows or skip hooks.

**Acceptance:** Show reduced deterministic bookkeeping and repeatable paired
document-rules benefit without relevant strict regression, or justify no change.
Test callback counts/order, grants/denials, exceptions, pending/reentrant decisions
and separate actors/documents/scopes.

**Verification:** B1/B2 and paired B8 document-rules/plain-wide; B3–B7 at integration.

Resolution: no production change retained.

- Measured document rules still invoke 1,200 field callbacks and 100 document hooks
  per 100-row request in both modes. Keep those callbacks and their decisions.
- A separate lazy-validator-allocation experiment avoided constructing an unused
  validator for callback rules without caching decisions. Two paired ON
  document-rule jobs did not improve latency or CPU consistently; guard scenarios
  also showed run noise. The experiment was rejected rather than presented as a win.
- More aggressive batching/string-result reuse remains outside the demonstrated
  safe improvement; no such behavior was changed.

### Task QCPU-06: Integrate, verify and report remaining gap

Status: completed
Kind: investigation
Priority: P1 — correctness and measured evidence gate retained changes.
Dependencies: QCPU-01, QCPU-02, QCPU-03, QCPU-04, QCPU-05, QCPU-07
Primary ownership: combined changes, task evidence and package tests.

**Requirements:** Review completed candidates against diffs and criteria; run serial
correctness, type, downstream, packaging, lint and runner gates; repeat the unchanged
matrix with both modes and historical context. Record regressions, no-op findings and
residual risks; do not infer application performance or call unsafe mode secure.

**Acceptance:** B3–B8 pass as applicable, or record the exact blocker and unverified
criteria. Report before/after median/p95, CPU, reads, fingerprints, hook behavior,
build/dependency details and remaining gap. Retain only demonstrated improvements;
confirm no public surface changes unless separately approved.

**Verification:** B3–B8, formatting review and `git diff --check`.

Initial investigation completion evidence and scope revision (before reopening):

- No changes to `packages/access-router/` were retained. All experimental code was
  diagnostic-only; the public API, defaults, six flag meanings, copies, permissions
  and identity checks remain unchanged. The repository deliverable is this
  task/evidence document, not a runtime release or a claimed performance fix.
- B1 passed. Focused B2 runs passed **606 tests in 11 files**, covering snapshot
  modes/work, owner/normalization regressions, finalizer preparation, contexts,
  detached reads and embedded HTTP behavior. B7 passed **18 runner tests** and the
  real-worker integration test (OFF/ON for embedded and document-rule workloads).
  B6 source/test/runner ESLint passed; formatting and diff checks apply to the task.
- Measurement used preserved built variants, fresh worker/database jobs and the
  unchanged existing workloads: 12 primary uninstrumented jobs, six measured-window
  profiles, six operation-count jobs, and 40 paired candidate timing jobs. All
  completed jobs matched expected outputs, flags and read counts. Diagnostic
  callback counts agreed across modes. The failed initial profile was separately
  recorded and excluded.
- B3 full package, B4 declaration rebuild and B5 downstream suite were not rerun:
  after rejection of all prototypes there is no package source/test/public-surface
  diff to release-verify. The full historical interactive matrix was likewise not
  rerun as an after matrix because there is no retained after implementation.
  This explicitly narrows final integration to the completed investigation;
  reintroducing runtime changes reopens the affected tasks and restores those gates.
- Remaining gaps: no application reproduction, no ON-mode historical parity and no
  proof that every narrower optimization is impossible. Initial copy/normalization
  observations and per-document boundaries remain measured costs. A future task
  must preserve them or obtain explicit approval for a new unsafe contract; do not
  treat these results as authorization to skip them.

Continuation completion evidence:

- Retained only QCPU-07's five-line matcher fast path and its focused tests. All
  eight generated declaration files are byte-identical before/after; the final
  rebuilt ESM hash matches the measured after build. No public API, option,
  snapshot, graph, document-stage or application-hook implementation changed.
- Commands from the repository root passed serially: B1; B3
  `pnpm --filter @web-ts-toolkit/access-router test` (**5,544 tests, 167 files**,
  including package/consumer checks); B4
  `pnpm --filter @web-ts-toolkit/access-router typecheck`; and B5
  `pnpm --filter @web-ts-toolkit/access-router-deco test` (**691 tests, 22 files**,
  including its typecheck). The existing Vite CommonJS-config warning remains.
- B6 `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks`
  passed. B7
  `node --test scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`
  passed **19 tests**, including the real-worker OFF/ON integration. Formatting and
  `git diff --check` passed. No separate full-workspace test run or independent
  review was performed; the package and downstream gates above are the scoped gates.
- B8 used the unchanged benchmark worker and existing workloads, with isolated
  preserved builds, fresh processes/databases and serial paired jobs rather than
  another interactive tag-fetching run. QCPU-07 records the complete timing matrix,
  repeated noisy cases, deterministic work counts and limitations. No new v0.51.0
  build was measured; the user-supplied historical numbers remain context only.

### Task QCPU-07: Reduce repeated primitive catalog-path work

Status: completed
Kind: improvement
Priority: P2 — profile samples include path matching even with snapshot comparisons skipped.
Dependencies: QCPU-01
Primary ownership: `src/acl/field-catalog.ts`, proven static path preparation if
needed, focused unit tests. No changes to copying, hook evaluation or graph ownership.

Finding: catalog pattern matching currently splits both primitive paths on every
comparison, including literal protected/reference paths without map wildcards.
This repeats across selected fields, rows and embedded scopes.

Requirements:

- Remove demonstrably redundant primitive parsing/allocation, not authorization
  checks. Preserve wildcard segment, ancestor boundary, exclusion, reference and
  protected-field behavior; retain conservative handling of non-primitive inputs.
- Prove equivalence with a reference implementation across valid and malformed
  strings, map patterns, Unicode and boundary cases. Do not cache open configuration
  or document decisions or revive the rejected child-authorization cache.
- Benchmark isolated before/after builds using unchanged workloads in both modes.
  Retain a change only with repeatable relevant improvement and no measured
  relevant regression beyond run noise. Expand the implementation boundary only
  with a separately documented proof and tests.

Acceptance: deterministic eliminated parsing/allocation, differential and relevant
integration suites pass, paired CPU/latency evidence is recorded; QCPU-06 runs the
full gates for any retained runtime change.

Verification: B1/B2, paired B8; B3–B7 via QCPU-06.

Progress:

- Implemented a primitive literal-path fast path in `matchesCatalogPattern`; map
  patterns and non-primitive operands still use the original segment matcher.
  Added a reference-based differential suite plus catalog/input/output boundary
  tests in `test/field-catalog.unit.test.ts`. Literal comparisons eliminate both
  split arrays; wildcard and boxed-string comparisons retain both splits.
- Built and preserved fresh before/after variants from `368b671`, not the earlier
  investigation build. B1 and the first focused run (169 tests in three files)
  passed; initial isolated timings are small/mixed and require repetition before
  retention. No snapshot, callback, graph or option code has changed.
- The first temporary timing-driver invocation was rejected before measurement by
  the worker's owned-database-name guard. Corrected the diagnostic job name; the
  worker and its safety guard remain unchanged. Exclude that failed job.

Completion evidence:

- `src/acl/field-catalog.ts` now compares literal primitive strings without parsing
  segments, using equality or a dot-boundary descendant check. The original
  implementation remains the fallback for every pattern containing `$*` and every
  non-primitive operand. Empty/malformed segments retain their previous semantics;
  this does not replace safety/catalog eligibility checks.
- `test/field-catalog.unit.test.ts` adds **55 tests**, including **29,602**
  deterministic reference comparisons, literal/wildcard work-count assertions,
  Unicode/control/empty-segment cases, non-primitive split observations/errors,
  metadata/reference/map/virtual boundaries and protected/excluded opaque copies.
  The complete package run includes these tests. QCPU-06 records the full gates.
- Twelve separate instrumented jobs (five samples each, 100 rows, both modes)
  retained **18,365 / 3,365 / 4,240** catalog comparisons per wide/document/embedded
  request, respectively. Eliminated **36,730 / 6,730 / 8,480** split arrays without
  removing any comparison. Document rules still invoked **100 document hooks and
  1,200 field callbacks/request** in both variants and modes. Instrumented timings
  are excluded from performance evidence.

#### Build and measurement identities

- Base source: `368b67196e7f4e9842e518b350292ff71f7bbcd4` plus the recorded local
  matcher/test changes for after. Node **26.12.1**, MongoDB **8.2.6**, Mongoose
  **9.11.4**, Express **5.2.1**, Zod **4.4.3**; identical workspace dependencies.
- Before ESM SHA-256:
  `674e36e084474af01e1e641d1ca4a20bfd2bf5a2d407aaae2277e695b947b19b`.
  After:
  `724057ea85e7fb0a6e6ab75df350fda305357901374683af610ec2b9618e3e4e`.
- Unchanged `pnpm-lock.yaml` SHA-256:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
  Unchanged worker SHA-256:
  `1301a0ea9c9c9865cfaee542c805b1b0db15903543cd4eb0d2c6133e1beba994`.
- **196 uninstrumented jobs**: all nine existing scenarios at 10/100 rows, both
  OFF/ON modes, two jobs/build/case; another reversed-order ON batch for the three
  100-row priorities; and the longer repeats below. Per-candidate effective flags,
  declaration/build hashes, hydration and expected outputs were checked by the
  existing worker. Outputs matched across builds/modes/repeats; reads remained
  **1/request**, or **2/request** for populate. Virtuals retained two getters/row.
- Common settings: **24 fields, 32 bytes, five warmups, one client, hook concurrency
  10**. Main jobs used **25 samples**. Pairs alternated before/after/after/before or
  the reverse, with no concurrent build or test workload. CPU includes Node HTTP
  client/server but not MongoDB. Startup, seeding and warmup are outside timing.
- The 100-row output fingerprints remain:
  wide `165d378f09870e575203f9e2c8f012b0778715ecc0c2fdd9b03f4bd436536ea3`;
  document rules `1c6e7ecaf6f8e6c2f4d6b57530734750466ff5a9a96869ed3d05641979c070ae`;
  embedded `4a32e28713aa14dc5248f87eda344bb089958fc984d4c50598c278651f656f13`.

#### Paired timing matrix

Milliseconds, before → after. Values are **means of each job's median, p95 or CPU**,
not pooled percentiles. Runs/build indicates independent jobs per candidate; do not
interpret these small diagnostic samples as statistical confidence or application
latency guarantees.

| Rows | Scenario       | Mode | Runs/build | Median before → after | p95 before → after | CPU before → after |
| ---: | -------------- | ---- | ---------: | --------------------: | -----------------: | -----------------: |
|   10 | plain-narrow   | OFF  |          2 |           6.31 → 6.15 |        8.25 → 8.33 |       10.23 → 9.94 |
|   10 | plain-narrow   | ON   |          2 |           4.57 → 4.98 |        6.86 → 8.07 |        7.17 → 8.35 |
|   10 | plain-wide     | OFF  |          2 |         10.45 → 10.49 |      13.66 → 15.66 |      14.59 → 14.27 |
|   10 | plain-wide     | ON   |          2 |           6.80 → 6.44 |        9.43 → 9.03 |        9.72 → 9.51 |
|   10 | hydrated       | OFF  |          2 |          9.98 → 10.36 |      11.52 → 16.17 |      12.43 → 13.87 |
|   10 | hydrated       | ON   |          2 |           6.43 → 6.93 |        9.81 → 9.83 |        8.97 → 9.85 |
|   10 | document-rules | OFF  |          2 |         37.17 → 37.20 |      39.33 → 41.72 |      39.57 → 40.60 |
|   10 | document-rules | ON   |          2 |           6.90 → 6.84 |       10.42 → 9.20 |       10.06 → 9.86 |
|   10 | large-config   | OFF  |          2 |         10.69 → 10.35 |      14.65 → 14.01 |      14.69 → 14.01 |
|   10 | large-config   | ON   |          2 |           7.56 → 7.14 |        9.87 → 8.91 |       10.41 → 9.34 |
|   10 | embedded       | OFF  |          2 |         85.50 → 84.19 |      93.20 → 88.55 |      89.87 → 88.16 |
|   10 | embedded       | ON   |          2 |         11.24 → 10.90 |      16.65 → 16.03 |      14.39 → 14.11 |
|   10 | global-rules   | OFF  |          2 |         35.67 → 36.12 |      38.28 → 39.38 |      37.97 → 38.74 |
|   10 | global-rules   | ON   |          2 |           6.60 → 6.96 |        9.18 → 9.50 |       9.00 → 10.07 |
|   10 | populate       | OFF  |          2 |         13.68 → 13.76 |      19.60 → 18.52 |      18.90 → 18.20 |
|   10 | populate       | ON   |          2 |           9.41 → 9.53 |      12.61 → 12.03 |      12.50 → 12.60 |
|   10 | virtuals       | OFF  |          2 |         13.11 → 13.86 |      18.13 → 17.61 |      18.04 → 18.61 |
|   10 | virtuals       | ON   |          2 |           7.91 → 7.59 |      10.55 → 10.71 |      11.46 → 10.53 |
|  100 | plain-narrow   | OFF  |          2 |         24.28 → 24.47 |      26.22 → 26.63 |      27.33 → 27.71 |
|  100 | plain-narrow   | ON   |          2 |         12.44 → 12.06 |      14.39 → 14.22 |      16.06 → 16.02 |
|  100 | plain-wide     | OFF  |          2 |         50.96 → 51.30 |      54.77 → 55.41 |      57.33 → 57.07 |
|  100 | plain-wide     | ON   |          4 |         24.44 → 23.15 |      28.41 → 25.93 |      31.50 → 30.17 |
|  100 | hydrated       | OFF  |          2 |         57.94 → 56.39 |      62.93 → 60.29 |      65.77 → 63.39 |
|  100 | hydrated       | ON   |          2 |         26.28 → 25.69 |      31.21 → 30.49 |      33.71 → 34.00 |
|  100 | document-rules | OFF  |          2 |       316.39 → 303.48 |    339.84 → 315.39 |    328.91 → 314.59 |
|  100 | document-rules | ON   |          4 |         26.97 → 26.78 |      29.92 → 29.70 |      34.26 → 34.31 |
|  100 | large-config   | OFF  |          2 |         56.29 → 57.26 |      60.13 → 64.80 |      63.74 → 65.67 |
|  100 | large-config   | ON   |          2 |         25.59 → 24.48 |      28.27 → 30.86 |      32.94 → 32.33 |
|  100 | embedded       | OFF  |          2 |       786.17 → 783.53 |    820.63 → 793.72 |    821.96 → 817.05 |
|  100 | embedded       | ON   |          4 |         68.87 → 68.74 |      76.94 → 74.35 |      85.31 → 84.86 |
|  100 | global-rules   | OFF  |          2 |       318.99 → 307.97 |    348.92 → 316.92 |    329.86 → 317.87 |
|  100 | global-rules   | ON   |          2 |         26.87 → 26.05 |      30.42 → 29.17 |      34.13 → 33.92 |
|  100 | populate       | OFF  |          2 |         73.02 → 72.14 |      77.24 → 78.59 |      80.42 → 80.11 |
|  100 | populate       | ON   |          2 |         30.26 → 30.27 |      33.79 → 37.20 |      37.76 → 38.53 |
|  100 | virtuals       | OFF  |          2 |         85.79 → 87.42 |      90.19 → 91.26 |      93.15 → 94.41 |
|  100 | virtuals       | ON   |          2 |         32.27 → 31.87 |      36.82 → 35.37 |      40.29 → 39.52 |

#### Repeated noisy guard cases and retention decision

Some short jobs regressed in the first matrix. Repeated those cases with **75
samples**, unchanged warmups/workloads and two jobs/build/case; do not pool these
with the 25-sample jobs because JIT/GC amortization differs.

| Rows | Scenario     | Mode | Median before → after | p95 before → after | CPU before → after |
| ---: | ------------ | ---- | --------------------: | -----------------: | -----------------: |
|   10 | plain-narrow | OFF  |           5.03 → 5.05 |        7.18 → 6.86 |        6.70 → 6.72 |
|   10 | plain-narrow | ON   |           3.77 → 3.78 |        5.13 → 5.31 |        4.81 → 4.79 |
|   10 | hydrated     | OFF  |           8.82 → 8.74 |      11.94 → 11.75 |      11.20 → 11.11 |
|   10 | hydrated     | ON   |           5.53 → 5.37 |        8.14 → 7.80 |        7.39 → 7.06 |
|   10 | global-rules | OFF  |         35.28 → 34.11 |      38.94 → 36.29 |      37.13 → 35.78 |
|   10 | global-rules | ON   |           5.54 → 5.59 |        8.42 → 8.25 |        7.31 → 7.14 |
|   10 | virtuals     | OFF  |         11.94 → 11.63 |      16.14 → 15.79 |      14.46 → 13.96 |
|   10 | virtuals     | ON   |           6.50 → 6.15 |        8.98 → 8.66 |        8.18 → 8.12 |
|  100 | large-config | OFF  |         54.61 → 54.04 |      58.87 → 59.22 |      60.63 → 59.79 |
|  100 | virtuals     | OFF  |         81.79 → 79.74 |      86.83 → 83.95 |      88.07 → 86.07 |

- Retain the narrow change: wide ON improved in **both independent alternating
  batches** (mean median **−4.8% / −5.7%**), with lower mean CPU in each. The
  deterministic allocation reduction and reference tests support this bounded win.
- Do **not** claim a material embedded or document-rule ON improvement: their two
  batches were mixed/near-flat. Some strict jobs improved, but only the repeatable
  wide ON benefit is attributed here. Short-job regressions did not reproduce as a
  consistent latency/CPU penalty in the longer repeats; residual run noise remains.
- Initial snapshot copies, native normalization, validation, graph checks and all
  application callbacks remain. No initial-copy opt-out or other new flag was
  introduced. Neither ON security equivalence nor v0.51.0 parity is established.

## Definition of done

Profile the overhead; justify and verify or reject each candidate; pass applicable
gates; report remaining gaps and security limitations without unmeasured claims.
