# Access-router CRUD panel/window protocol v2

V2 is a separate timing protocol. **Original source/bundle seals, protocol settings
and evidence remain historical and unchanged.** The original v2 reused the v1
sealed factory without a fixture-source change. Current optional input shapes
extend that factory and require new matching fixture/source seals and calibration.
All 16 correctness tuples remain covered by
`packages/access-router/test/internal/access-router-crud-harness.unit.test.ts`.
V2 regressions live in `access-router-crud-v2.unit.test.ts` in that same directory.

## Commands

From the repository root, with existing built dependencies/dist and installed
Node >=24. Use a fresh ignored repo-local directory and an **absolute** `TMPDIR`.
Replace placeholders before running. No command builds/tests downstream packages.

```sh
export TMPDIR='<repo-root>/_tmp-arpc-01-v2-<fresh-id>'
mkdir "$TMPDIR"
git check-ignore "$TMPDIR"
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/internal/access-router-crud-v2.unit.test.ts test/internal/access-router-crud-harness.unit.test.ts
node scripts/benchmarks/access-router-crud-v2.mjs plan core
node scripts/benchmarks/access-router-crud-v2.mjs noise '<original-baseline-seal>' "$TMPDIR/core-noise-v2" core
```

Select exact panels or exact case IDs **before** calibration. Unknown, empty,
duplicate and overlapping selectors fail. A smaller attribution panel is useful
when only its paths are affected; never label a subset full-matrix acceptance:

```sh
node scripts/benchmarks/access-router-crud-v2.mjs plan scale-direct scale-public
node scripts/benchmarks/access-router-crud-v2.mjs noise '<original-baseline-seal>' "$TMPDIR/scale-noise-v2" scale-direct scale-public
node scripts/benchmarks/access-router-crud-v2.mjs noise '<original-baseline-seal>' "$TMPDIR/exact-noise-v2" iiii/direct/read-hit/hooks/1x4 tttt/direct/read-hit/hooks/1x4
```

No candidate code is loaded by `noise`: both sides use the original frozen bundle.
After a future production change and its package-local checks, create a **new**
candidate seal with the unchanged v1 freezer, then compare using the selected
noise directory. The original baseline must not be overwritten:

```sh
node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/candidate-02"
node scripts/benchmarks/access-router-crud-v2.mjs compare '<original-baseline-seal>' "$TMPDIR/candidate-02" "$TMPDIR/core-noise-v2" "$TMPDIR/comparison-02-v2"
```

Comparison uses exactly the calibrated panel/case selection and baseline-pilot
operation counts; it rejects changed protocol/tool hashes, host, source/bundle
selection, fixture, runtime/dependency identities and plan bytes. An identical
production source cannot masquerade as a real candidate. `smoke BASE NEW_OUTPUT
[PANEL_OR_CASE ...]` runs two-operation wiring checks only; it cannot calibrate
noise or establish performance acceptance.

## Focused panels and mode-axis rationale

The default `core` selection is **40 cases in 10 panels**, each containing at most
four fixtures. Each entry (`direct`, `public`) has:

| Panel family | Cases                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `read`       | Hook-active singleton READ in both modes; READ miss and empty LIST in isolated mode        |
| `control`    | Bare/no-hook narrow singleton READ in both modes; hook-active singleton LIST in both modes |
| `single`     | Hook-active single CREATE and UPDATE-by-ID in both modes                                   |
| `upsert`     | Actual create and update branches in both modes                                            |
| `scale`      | Hook-active 16-row/16-generated-field LIST and bulk CREATE in both modes                   |

Only the active operation's mode controls these ordinary, unrelated-model output
paths. The other three axes are therefore timing-deduplicated to homogeneous
`iiii` / `tttt`; all 16 tuples still have maintained real-worker correctness and
stage-mode checks. UPSERT's CREATE/UPDATE independence remains tested there.
Miss/empty controls reach no output row/stage, so their output-mode axis is also
deduplicated. If a later change introduces mode-dependent work before those
returns, add the affected mode controls and recalibrate a new selection.

Optional `rich-direct/public`, `metadata-direct/public`, `logging-direct/public`
and `fallback-direct/public` panels retain targeted payload/metadata/logging/retry
shapes without multiplying every orthogonal setting. `plan` prints all selected
IDs and configured modes. Related-model target products, dynamic field rules,
explicit sort-heavy/changing-log cases, lifetime/failure/limit performance and
heap allocation/retention remain separate gates, not implied coverage.

## Preregistered warmup and fixed windows

`protocol.json` is written **before** pilots or timing. V2 fixes these settings:

1. Each side/panel/pair starts a **fresh Node worker**, never a worker that has
   already visited hundreds of schemas. At most four fixtures run in one worker.
   No workers run concurrently. Each fixture gets its own warmup before sampling.
2. Warmup runs real CRUD in 64-operation blocks, at least 256 operations and 500ms
   elapsed. The last four blocks' per-operation wall and CPU medians are split
   into two halves; both half-to-half drifts must be <=10%, on two consecutive
   checks. Warmup stops at 2500ms if unsettled (checked after a block). This is a
   stabilization heuristic, not a relaxation of the statistical noise rule.
3. A **baseline-only pilot** records warmup evidence and chooses operations per
   measured batch: `ceil(75ms / pilot_wall_ms_per_op / 64) * 64`, bounded to
   64–8192. The resulting `plan.json` is fixed before any paired data or candidate
   inspection. Both sides use **identical** counts; a faster candidate does not
   get extra JIT-training operations through an adaptive timing stop condition.
4. Each measured worker/case executes **three batches**, targeting roughly 225ms
   summed service time (often hundreds/thousands of operations, not nine). At
   least 100ms actual service time is required for eligibility. All samples and
   outliers remain included. Warmup failure or a short window blocks claims; it
   never silently drops a worker/round or passes as neutral.
5. Every individual invocation resets equivalent documents and creates a new
   request/Core/services outside its timer. Actual CRUD, write/lifecycle,
   authorization, finalization and local adapter work remain inside. Full output,
   resolved modes, persisted state, denials and write detachment are checked and
   fingerprinted outside the timer **on every invocation**, including warmup.
6. Wall/CPU are summed only over actual invocation intervals. Per-worker means
   use total measured wall/CPU divided by total operations across all three
   batches. No profiler, spies, enabled counters, forced GC or database latency is
   in timing. Work/query/callback counts come from separate diagnostic workers.

There are seven alternating fresh-worker pairs per panel/case and two repeat runs.
The second repeat reverses panels and cases; side order alternates and starts in
the opposite order. The unchanged v1 rule uses per-case/per-metric
`max(3%, p95(abs(noise_pair_ratio - 1)))`, a **20% claim cap**, the same two-repeat
6/7 sign checks, and investigation of repeatable slowdowns even within noise.
An unsettled pilot is recorded; measured-worker warmup/window quality and the
noise cap still independently gate every cell. An unusable calibration cannot
become usable merely because the later comparison looks stable.

A complete `core` packet has 280 timing workers, plus 20 diagnostic and 10 pilot
workers. The batch has a **30-minute hard budget**, and each worker at most 120s.
Partial raw data survives failures/timeouts; without a complete `report.json`, a
packet is not a calibration. Do not retry endlessly or increase tolerance after
looking at results. If the host remains variable, preserve blocked cells and
report that limit. Source/bundle/dependency hashes are verified, with the same
deterministic-adapter and checkout-local seal limits documented for v1.

## Compact evidence

- `protocol.json`: selectors, protocol/rule, source/fixture/bundle/runtime/host and
  tool hashes, written before measurements.
- `plan.json`: baseline pilot counts and last warmup blocks, shared by both sides.
- `work.json`: separate diagnostics and stable result/state hashes.
- `raw.json`: per-panel paired worker source/bundle hashes, output fingerprint,
  last warmup blocks and each measured batch `[operations, wall_ms, cpu_ms]`.
- `report.json`: per-case wall/CPU, ratios, unchanged noise rule, warmup/window
  quality, eligibility and the fixed plan hash. These are worker-mean p95s, not
  individual-request latency p95s.

Keep one compact raw packet plus a concise supplemental report/manifest; there is
no reason to copy v1's megabyte evidence or repeat full package baseline gates
when only this harness has changed.

## Current input-focused panels and diagnostics

The original 40-case `core` IDs and the fixed v2 windows/noise rules are unchanged.
Optional panels below add no new authorization options or input trust:

| Panel family      | Cases per entry, in both active output modes                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `input-small`     | Absent-hook one-field single CREATE / UPDATE by ID                                                               |
| `input-native`    | Sync-hook 16-field Date/Buffer/BSON/Map/nested UPDATE by ID; direct UPDATE by filter or public single CREATE     |
| `input-nested`    | Absent-hook plain nested 16-field single CREATE / UPDATE                                                         |
| `input-async`     | Async-hook native/nested 16-field single CREATE / UPDATE                                                         |
| `input-markers`   | Sync-hook native/nested 16-field single CREATE / UPDATE with three real date markers                             |
| `input-functions` | Per-row mutable field functions, native/nested input, narrow output: eight-row/16-field CREATE / 16-field UPDATE |

The diagnostic-only `input-subqueries` shape runs actual authorized target READs
through an adapter Core, not a stubbed parser result. Its target mode is relevant;
do not deduplicate that mode axis for timing. All 16 mixed target/write tuples are
checked in the internal harness, but no subquery timing panel is implied here.

Separate work attribution (source instrumented **only in a disposable diagnostic
bundle**, exact source anchors checked, production files unchanged):

```sh
TMPDIR='<repo-root>/_tmp<fresh-short-id>' node scripts/benchmarks/access-router-input-work.mjs '<repo-root>/_tmp<fresh-short-id>/input-work'
```

This observes actual normalization node/record/array construction sites, selected
copy and scrub passes, marker/parser entries, rule/path preparation, lifecycle
conversion sites and stage source/view materialization. Adapter/query/hook traces
are separate. PROMISE async resources are counted with `async_hooks`; their first
matched synchronous parser/scheduler/stage owner is approximate, with unassigned
resources explicit. Counts are not memory bytes, CPU shares or allocation savings.
The regression compares instrumented and ordinary real-worker output/state hashes.

For separate CPU sampling, the v2 worker accepts `phase: 'profile'` with an exact
known panel and fixed `operations` counts. It uses 128 untimed warmup operations per
case and records `hrtime` invocation windows; counters remain disabled. Run it with
Node `--cpu-prof` **apart from** calibration/builds/tests. `summarizeInputProfile`
in the input-work driver curates overlap-clipped samples/stacks inside those windows,
excluding reset/Core/service construction/assertions. Async continuation/engine work
can remain unattributed; timer bookkeeping, sampling overhead, idle and GC limitations
must be stated. These profiled CPU values are not P timing acceptance.

The CWO-01 current baseline's preselected panels, provenance, exact raw calibration
and limits are recorded in
[its evidence bundle](../../docs/task-artifacts/access-router/20261112-084753-create-update-input-optimization/cwo-01/README.md).
