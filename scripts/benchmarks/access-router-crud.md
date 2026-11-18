# Access-router CRUD v1 (separate maintained driver)

This catalog does **not** rename or extend the historical LIST/owned catalogs.
It runs actual `Service` / `PublicService` workers, authorization, lifecycle and
output finalization using real Mongoose models/documents with deterministic
in-process persistence adapters. **These are service + local adapter CPU timings,
not database latency, HTTP latency or a substitute for MongoDB integration tests.**

## Commands

Run from the repository root with installed dependencies. Node >=24 is required.
Only the access-router build/dependencies and access-router-owned tests are needed:

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/internal/access-router-crud-harness.unit.test.ts test/internal/access-router-crud-driver.unit.test.ts test/internal/access-router-crud-work.unit.test.ts
```

Use a fresh ignored repository-local directory. Replace angle-bracket placeholders
before execution; `TMPDIR` must be absolute and `git check-ignore` must accept it.
No command below installs/builds/tests anything, overwrites a seal, or modifies
production code. Do not run builds, tests, profilers, forced GC or other benchmark
workers concurrently with measurements.

```sh
export TMPDIR='<repo-root>/_tmp-arpc-01-<fresh-id>'
mkdir "$TMPDIR"
git check-ignore "$TMPDIR"
node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/baseline"
node scripts/benchmarks/access-router-crud.mjs noise "$TMPDIR/baseline" "$TMPDIR/noise"
# After an independently attributable production change (baseline stays untouched):
node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/candidate-02"
node scripts/benchmarks/access-router-crud.mjs compare "$TMPDIR/baseline" "$TMPDIR/candidate-02" "$TMPDIR/noise/report.json" "$TMPDIR/comparison-02"
# A quick wiring check only, explicitly NOT timing acceptance:
node scripts/benchmarks/access-router-crud.mjs smoke "$TMPDIR/baseline" "$TMPDIR/candidate-02" "$TMPDIR/smoke-02"
```

`freeze NEW_SEAL [SOURCE_ROOT]` preserves the entire current access-router source,
the fixture source, current `dist` (provenance only), and a CJS source-selected
service/fixture bundle. `SOURCE_ROOT` optionally selects a preserved source tree
sharing this checkout's installed dependencies; it must contain the normal package
layout, fixture, package.json, lock and dist. Source bytes are checked before/after
bundling. Dependency package trees, lock, runtime binary, Node/pnpm/esbuild versions,
revision and production diff hash are sealed. Runtime dependencies are **not copied**:
their bytes and original locations must remain available and unchanged. A seal is
not relocatable; recreate it on another checkout. Never edit an existing seal.

Workers verify the sealed source/fixture/dist/bundle before loading the bundle;
the bundle exports its selected production source hash. The parent verifies all
external dependency files before and after a batch. Workers report both source
and bundle hashes. A real comparison rejects identical source/bundle, changed
fixture, dependency, lock, recorded toolchain versions, Node binary or case IDs. The driver regression test
builds two distinct real-source bundles, checks a candidate-only marker actually
loads from the candidate, runs matching CRUD output, and rejects tampered bytes.

If a later task needs an additional shape, extend the maintained fixture/tests,
then make **new** baseline/candidate seals with that same fixture. Reconstruct the
baseline's normal source layout from the original preserved `src` (or the original
revision) and current fixture; preserve the old seal/noise packet and recalibrate.
Do not silently reuse old noise or overwrite baseline source with candidate code.

## Catalog and correctness

- All 16 tuples in fixed READ, LIST, CREATE, UPDATE order (`i`/`t` in IDs).
- Each tuple: direct/public READ hit/miss, READ-with-LIST-access control and public
  actual READ-to-LIST retry; LIST empty/single/four; CREATE single/four;
  UPDATE by ID, direct UPDATE by filter; direct/public UPSERT create/update.
  There is no public filter-update API, so no fictitious public cell is generated.
- 368 compact hook-active cells, plus 64 targeted all-isolated/all-trusted cells:
  bare 1-row/1-field controls; rich hydrated 16-row/16-field async hooks, virtual,
  embedded arrays, native Date/Buffer payload; 16-row field metadata; large-filter
  LIST with debug disabled. Total **432** individually reported cases.
- Each invocation checks exact **and** bulk resolved mode getters, output values
  that distinguish isolated/trusted behavior, selection, denials, output counts,
  metadata, native/embedded fields, branch-specific saved state and detachment from
  post-publication live write mutation. The package test additionally observes
  actual stage modes and query/hook/filter traces and repeats equivalent state.
- Fresh request/Core/services and seed/reset are outside **each** timed invocation:
  request-level filter caches and work budgets cannot accumulate across samples.
  Input construction, the actual create/save, lifecycle, output authorization and
  publication remain inside timing. Model registration and service construction
  are not timed. Adapter filter support is deliberately limited and rejects
  unsupported operators rather than pretending to implement MongoDB.

In IDs such as `4x4` / `16x16`, the first number is seed/bulk scale (READ still
returns one row; empty/single branches override LIST count). The second is the
generated `f0...` scalar-field width, **in addition to** common `value`/owner/denied
fields and rich-shape native/embedded/virtual fields. It is not a claim that the
entire schema or final projection contains only that many fields.

Richer controls do not repeat irrelevant sibling modes: a normal CREATE output
uses CREATE mode, UPDATE uses UPDATE, READ uses READ and LIST uses LIST; the
all-tuple compact cells already establish independent origin selection, including
opposite CREATE/UPDATE modes for upserts and READ/LIST for fallback.

## Preregistered measurement and noise rule

`protocol.json` is written **before** diagnostics/timing. Normal batches use three
warmups and nine measured operations per case/worker, **seven alternating fresh
baseline/candidate worker pairs**, and **two separate repeat runs** (28 measured
workers). A worker reports every case separately. Case traversal reverses for the
second run; pair admission alternates and starts in the opposite order. Only one
child executes at a time. No spies, profiler, enabled counters, forced GC or database run
inside timing. Adapter/callback counters/traces are enabled only in separate
diagnostic workers; deeper Vitest spy probes are a separate suite.

Wall time uses `performance.now`; CPU uses `process.cpuUsage` (user + system).
Raw data stores per-worker per-case mean wall/CPU milliseconds; reports give
medians, p95 worker means, throughput and each repeat's median paired ratios.
These p95s are **not** individual-request p95 latency. Output/state hashes are
checked for every warmup/sample against preflight and across both code selections.

Before candidate inspection, `noise` runs the exact protocol baseline versus
itself. For each case and wall/CPU metric, the fixed noise bound is
`max(0.03, p95(abs(paired_noise_ratio - 1)))`. Bounds above 20% block performance
claims for that cell; do not widen tolerances afterward. Candidate benefit needs
both repeat medians below `1 - bound`, at least 6/7 faster pairs in **each** repeat,
and an independently demonstrated reduction in meaningful work. Both repeat
medians above 1 with at least 6/7 slower pairs in **each** repeat demand
investigation **even inside the noise bound**. Everything else is uncertain/no
detectable change, not proof of equivalence. No cross-operation/mode averaging.

Timing output is compact JSON: `protocol.json`, `work.json`, `raw.json`,
`report.json`. It contains no cwd, usernames, timestamps, process/session IDs or
absolute paths. The operational seal's compiled external import locations are
absolute; do not publish its bundle/dependency tree as raw documentation.

## Separate real-service work probes

```sh
ARPC_CRUD_WORK_REPORT="$TMPDIR/work-probes.json" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/internal/access-router-crud-work.unit.test.ts
```

This writes 96 cells (both modes, both entries, READ/LIST/bulk CREATE/UPDATE,
bare/hook/metadata, 1/16 rows and 4/16 selected fields): finalizer wrapper
preparations, selected-value copy calls, policy reads, total/empty schedulers,
disabled-debug filter summaries, sort captures, queries, hook/filter callbacks and
their trace. These observations are not instrumented timings. Callback/query
multiplicity must be reviewed before retaining any optimization.

## Coverage limits (must gate later claims)

The compact timing driver does not yet measure related-target READ/LIST mode
cross-products, populate/correlated includes, nested/virtual/denied-sort workloads,
enabled/changing logging levels, dynamic field functions, duplicate IDs, reentry,
in-flight option changes, failure/draining/limit behavior or unaffected operations.
Existing package-local regression suites cover many of those contracts; consult
the ARPC-01 artifact coverage ledger for actual evidence. Their existence is **not**
timing evidence. Add targeted real-service timing cases before a claim affecting
those paths. No allocation/retained-heap probe is included, and no real MongoDB
latency claim is possible from these adapters. No universal all-workload speedup
or final ARPC-02–06 acceptance follows from this driver alone.

## Current input extension (CWO-01, not historical timing acceptance)

The private factory now also exports `inputCatalog()` with 180 small/wide input
cases: ordinary nesting, Date/Buffer/BSON/Map values, absent/sync/async document
hooks, function-valued input rules with narrow output, date markers and real
authorized subquery targets. New native/nested bulk cases use eight rows and 16
generated fields to stay within the unchanged default 500-node input limit.
The original `crudCatalog()` remains 432 cases with its original IDs/behavior;
the all-mode harness additionally checks 64 mixed write/target-READ subquery cells.

These fixture bytes differ from the historical ARPC baseline. Recreate matching
source/fixture seals and recalibrate; old seals/results are historical, not current
retention evidence. The current optional panels and separate input work/CPU probes
are described in [the v2 guide](access-router-crud-v2.md#current-input-focused-panels-and-diagnostics).
