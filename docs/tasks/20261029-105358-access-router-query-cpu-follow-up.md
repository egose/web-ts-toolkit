# Access-router query CPU follow-up

Created: 2026-10-29 10:53:58 PDT
Status: completed

Outcome: QCPU-01–06 completed as bounded investigations. No runtime optimization
was retained: the blanket cache changed authorization behavior, and smaller
allocation experiments lacked repeatable relevant gains. The performance gap is
**not resolved**; further work needs a new justified design or a separately approved
contract change. Existing benchmark-runner work was preserved.

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
Dependencies: QCPU-01, QCPU-02, QCPU-03, QCPU-04, QCPU-05
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

Completion evidence and scope revision:

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

## Definition of done

Profile the overhead; justify and verify or reject each candidate; pass applicable
gates; report remaining gaps and security limitations without unmeasured claims.
