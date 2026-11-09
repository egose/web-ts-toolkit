# ARPC-01 v2: bounded panels and stabilized fixed windows

**Outcome: bounded investigation finished with no performance claim.** V2's core
calibration hit its aggregate 30-minute deadline after **1800.78s**, exited 1, and
did not produce `report.json`. It is **not usable for comparison acceptance**.
No timing retry, candidate measurement or production change was made to finish
this report. V1 evidence and the original production seal remain unchanged.

## Scope and delivered changes

This is a new maintained **`access-router-crud-panels-v2`** timing protocol, not a
production optimization or reinterpretation of v1 evidence. V1 code, seals and
archived results are unchanged. The accepted package baseline (7,403 passing
tests, typecheck and scoped lint) is reused; **no full suite, typecheck or build is
rerun** for this harness-only continuation.

- `scripts/benchmarks/access-router-crud-v2.mjs`: exact panel/case selection,
  baseline-only pilot, paired fresh workers, compact batch results and quality gates.
- `scripts/benchmarks/access-router-crud-v2-worker.mjs`: at most four real-service
  fixtures per worker, actual wall/CPU warmup convergence, fixed batched work and
  full per-invocation state/output assertions outside the timer.
- `packages/access-router/test/access-router-crud-v2.unit.test.ts`: real workers,
  mode selection, stable writes, bounded/malformed selection, warmup/JIT drift,
  fixed pilot counts, unchanged noise/slowdown rule and multi-operation write windows.
- Maintained [protocol and commands](../../../../../scripts/benchmarks/access-router-crud-v2.md).

The original sealed factory supports these selected shapes without modification,
so no new source/fixture bundle is necessary. Baseline runtime entry remains
`_tmp-arpc-01-4d6agBQe/baseline/worker.cjs`, verified against original production
`_tmp-arpc-01-4d6agBQe/baseline/src`. Full source/fixture/bundle/dependency/tool and
protocol hashes are in [provenance](provenance.json). No candidate is inspected.

## Preregistered protocol and coverage

The exact [protocol](protocol.json) was written before the baseline pilot. Core
selects 40 cases in 10 direct/public panels; each worker sees at most four fixtures,
not 432. It selects every active READ/LIST/CREATE/UPDATE and UPSERT branch in
isolated and trusted. There are singleton/no-hook/small and hook-active 16-row
LIST/bulk-CREATE controls. Only mode-irrelevant sibling axes and no-output miss/
empty controls are deduplicated. All 16 correctness tuples are still tested;
the guide gives the rationale and limits. Optional targeted rich/metadata/logging/
fallback panels and exact IDs avoid a universal Cartesian product.

Warmup: 64-operation blocks; at least 256 calls and 500ms; wall **and** CPU drift
<=10% in successive four-block windows on two consecutive checks; capped at
2500ms (checked after a block). Unsettled warmups are recorded and block claims.
A baseline-only pilot fixes 64–8192 operations per batch to target 75ms service
time. Both sides use the same counts, three batches per case, with a 100ms actual
total-service-time eligibility floor. Every reset/request build, assertion and
hash is outside its individual invocation timer; actual writes and finalization
are inside. No spies, enabled work counters, forced GC or profiler in timing.

Seven alternating fresh-worker pairs per case, two repeats; reverse panels/cases
in the second repeat. A full core packet has 280 timing workers, 20 separate
diagnostic workers and 10 baseline pilots. Runtime cap: 30 minutes total, 120s per
worker; partial packets cannot calibrate comparison. **The v1 20% noise cap,
3% floor, two-repeat sign rule and repeatable-slowdown investigation rule are
unchanged.** No measured samples/outliers are discarded.

## Executed focused checks

Working directory: repository root. Runtime scratch/TMPDIR:
`'<repo-root>/_tmp-arpc-01-v2-2rvJTj9O'`, fresh and confirmed ignored.

| Command | Result | Wall seconds |
| --- | --- | ---: |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/access-router-crud-v2.unit.test.ts test/access-router-crud-harness.unit.test.ts` | 502 tests / 2 files passed, including all 16 correctness tuples and real batched CREATE/UPDATE worker smoke | 9.52 |
| `pnpm exec eslint scripts/benchmarks/access-router-crud-v2.mjs scripts/benchmarks/access-router-crud-v2-worker.mjs packages/access-router/test/access-router-crud-v2.unit.test.ts` | Passed | 1.83 |

[Verification records](verification.json) preserve commands and original log hashes.
These checks ran before timing; no concurrent test/build/lint run overlaps it.
No current production package failure is inferred from the old v1 noise result.

## Calibration execution

```sh
export TMPDIR="$PWD/_tmp-arpc-01-v2-2rvJTj9O"
node scripts/benchmarks/access-router-crud-v2.mjs noise "$PWD/_tmp-arpc-01-4d6agBQe/baseline" "$TMPDIR/core-noise-v2" core
```

Actual result: **exit 1 after 1800.78s**. The controller exhausted its 1800-second
aggregate budget while running `single-public` in repeat 2, round 7; the active
worker was killed with `SIGKILL`. This is the aggregate deadline, not an invented
test failure or an assumption that the worker independently took 120 seconds.
See [command result](calibration-result.json), [terminal failure](failure.json)
and [scrubbed timeout excerpt](timeout-excerpt.log).

The saved [partial raw data](raw-partial.json), [fixed pilot plan](plan.json) and
[separate diagnostics](work.json) contain:

- **132/140 complete panel pairs**, or **264/280 timing-worker results**. Both
  repeat arrays have seven round slots, but the last slot of repeat 2 contains
  only `scale-public` and `upsert-public`; array length alone is not completion.
- Eight panels have **7 + 6** paired rounds; two panels have **7 + 7**. No missing
  worker/round is imputed, no bad warmup is discarded, and no partially completed
  in-memory pair is represented as saved data.
- **634,752 measured invocations** and **1,259,072 warmup invocations** in the saved
  complete pairs. These counts exclude killed/unpersisted work. All 20 diagnostic
  and 10 baseline pilot results were saved before paired measurement began.
- **1,056 worker/case records**, with **47 unsettled warmups** and **zero short
  measurement windows**. Observed summed service time per worker/case was
  **189.66–829.41ms**, above the unchanged 100ms floor. Thus v2 did materially
  lengthen measurement, but did not establish universal stabilization.
- Every saved worker selected the original source/bundle hashes; output/state
  fingerprints match diagnostics, and all three batches used the pilot's fixed
  operation count. Both side labels refer to the same baseline, not a candidate.

[Quality/coverage summary](quality-summary.json) preserves all 40 cases and the
statistics for **all eight fully paired cases**, not just favorable observations:

| Complete panel / case | Wall noise | CPU noise | Unsettled warmups / 28 workers | Eligible |
| --- | ---: | ---: | ---: | --- |
| Public UPSERT create, isolated | 9.32% | 24.05% | 0 | No: CPU noise |
| Public UPSERT create, trusted | 22.85% | 37.33% | 0 | No: wall/CPU noise |
| Public UPSERT update, isolated | 12.43% | 29.40% | 0 | No: CPU noise |
| Public UPSERT update, trusted | 19.32% | 24.10% | 1 | No: CPU noise/warmup |
| Public 16-row LIST, isolated | 13.41% | 16.48% | 1 | No: warmup |
| Public 16-row LIST, trusted | 10.30% | 21.12% | 0 | No: CPU noise |
| Public 16-row CREATE, isolated | 6.23% | 9.70% | 10 | No: warmup |
| Public 16-row CREATE, trusted | 15.76% | 16.79% | 16 | No: warmup |

**Accepted cells: 0/40.** Eight fully paired cases fail the existing warmup/noise
gates; 32 cases lack the required final pair in repeat 2 regardless of any nice
partial ratios. These descriptive statistics are **not** a reconstructed noise
packet: no `report.json` is manufactured for the timed-out directory, and the
comparison driver correctly cannot consume it as calibration. The persisted
warmup evidence contains last blocks, not every warmup block; the unchanged worker
code enforces the consecutive convergence checks. CPU/host/GC/JIT causes remain
unprofiled; the observed variability and warmup failures are the evidence.

There is no retained performance change, speedup, allocation or non-regression
claim. This investigation stops here; no tolerance, round count or cap was relaxed
and no further timing attempt was run.

## Follow-up commands

**Do not pass the failed `core-noise-v2` directory to `compare`.** A later task
that needs a claim must first preregister and complete a *bounded, claim-specific*
baseline panel packet. The following is a future command example, **not executed
as a retry here**. Run from repository root; choose a fresh directory name and
retain both modes and relevant controls. No concurrent builds/tests:

```sh
export TMPDIR="$PWD/_tmp-arpc-01-v2-focused-next"
mkdir "$TMPDIR"
git check-ignore "$TMPDIR"
node scripts/benchmarks/access-router-crud-v2.mjs noise "$PWD/_tmp-arpc-01-4d6agBQe/baseline" "$TMPDIR/scale-noise-v2" scale-direct scale-public
# Only after report.json exists and every claimed cell is usable; then apply/check
# one attributable production change and create a new, distinct candidate seal:
node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/candidate-02"
node scripts/benchmarks/access-router-crud-v2.mjs compare "$PWD/_tmp-arpc-01-4d6agBQe/baseline" "$TMPDIR/candidate-02" "$TMPDIR/scale-noise-v2" "$TMPDIR/comparison-02-v2"
```

The original baseline is never overwritten. Comparison requires exactly the
calibrated panels, fixed counts and tool/protocol/host/fixture/dependency identities.
An unusable baseline calibration remains blocked even if candidate data looks
stable; benefit still needs reduced-work proof and individually acceptable controls.
The scale panel alone does not cover singleton/READ/UPDATE/upsert controls; use
additional matching panels (or exact case IDs) required by the affected change.
If focused calibration remains unusable, record a no-change/defer decision instead
of repeatedly rerunning noise or relaxing its rule.

## Preserved evidence and remaining scope limits

This supplement references, rather than duplicates, v1 inventories/raw reports.
It preserves one compact **partial** v2 protocol/plan/raw/quality packet with hashes.
The raw copy is 464,963 bytes; no second megabyte report or duplicate v1 data is
added. [Archive manifest](archive-manifest.json) records original/copy hashes and
the timeout-excerpt scrubbing. Generated
source/bundles/dependency trees, DB/consumer scratch and full logs are omitted;
rerunning still requires the original operational seal and unchanged installed
dependencies/Node bytes. The seal is checkout-local, not relocatable.

No database latency, allocation/retained-heap, related-target cross-product,
dynamic-rule, explicit sort-heavy/changing-log or failure/reentry/limit timing
claim is established here. The original coverage ledger remains applicable.

## Baseline deliverable versus later acceptance gates

The **bounded ARPC-01 baseline/harness investigation is delivered**, including a
negative calibration conclusion: all 16 correctness tuples and real write workers,
immutable baseline, maintained comparison tooling, real work counts, preregistered
noise attempts and explicit missing evidence. The accepted package baseline is
unchanged. This can satisfy the baseline-investigation handoff **if the coordinator
explicitly records this no-claim scope and keeps the following gates with the
corresponding tasks**; it does not satisfy whole-matrix performance acceptance.

- **ARPC-02:** attributable reduced preparation/copy work and usable per-mode
  scale plus READ/UPDATE/singleton controls; add related/native/embedded timing
  where a retained change reaches those paths.
- **ARPC-03:** explicit sort-heavy/nested/virtual/denied-sort timing and observation
  equivalence. Core timings do not supply it.
- **ARPC-04:** relevant no-hook/empty-work timing and scheduling/lifetime controls;
  do not infer gains from promise/work counts alone.
- **ARPC-05:** disabled/enabled/changing-level and relevant filter/CRUD cases.
- **ARPC-06:** metadata-specific timing plus database-backed callback/query and
  incoming-ID-filter equivalence. Local-adapter counts are not DB latency proof.
- **ARPC-08:** integrated retained changes still need their complete applicable
  operation/mode/related-target controls, heap evidence where relevant and final
  package checks. No unmeasured cell inherits acceptance from this report.

If the task definition instead requires a *usable all-core calibration* before
closing ARPC-01, that requirement remains **blocked**, not passed. Task statuses
and any dependency/scope revision remain coordinator-owned; the shared task file
was not edited.

## Evidence review on resumption

No service benchmark, test suite, typecheck or build was rerun to finish this
report. A read-only audit verified all saved source/bundle/output fingerprints,
fixed counts, coverage and quality; recomputed the eight complete-panel statistics
with maintained `panelSummary`; reverified the original baseline seal and installed
dependency bytes; and confirmed all recorded v1 evidence/tool/source hashes and
v2 maintained-code hashes remain unchanged. Copies and summary preserve the failed
outcome rather than altering historical seals or manufacturing completion.
