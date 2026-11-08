# ARPC-05 preregistration (before candidate measurements)

## Implementation boundary

Keep the one per-event debug-level check in the internal logger helper. Permit a
private context factory, used by `Service.beginOp` and `completeOp`, rather than
adding a service-side check followed by another helper check. No public export,
global level cache, query/authorization change or CREATE summary is intended.
Capture start and completion timing outside lazy materialization so a disabled
begin can still supply a later enabled completion's duration, without charging
completion-level probe time to the operation. Resolve the emitting logger after
the level check, retaining the current replacement/fallback receiver behavior.

## Bounded measurement, not a replacement acceptance protocol

Prior v2 calibration was unusable (ARPC-02: 0/16 usable cells). Do not retry a
half-hour calibration here. Run a **single bounded exploratory packet**, with
separate baseline/baseline noise and baseline/candidate phases, using the original
sealed real-service factory and unchanged fixtures. Select both homogeneous modes
and both direct/public entries for:

- large-filter LIST: `list-many/logging/16x16`;
- small-filter LIST control: `list-single/hooks/1x4`.

That is eight individually reported cells. The logging fixture currently uses 24
`$and` branches, not `$or`; the regression test separately admits a large `$or`
with native predicate values. Do not relabel the timing fixture.

Fix **16 warmup and 32 measured invocations per case/worker, seven alternating
fresh-worker pairs, two repeats** per phase; reverse case traversal and initial
side order in repeat two. One worker at a time. Hard whole-packet budget: **300s**;
per-worker timeout is the smaller of 30s and the remaining budget. No retries or
sample/outlier deletion. Preserve partial data on timeout; incomplete data cannot
support a claim. Reset documents/new requests and verify full output, persisted
state and resolved modes outside every interval; time the actual service call,
including authorization/finalization/local adapter work. Measure wall and CPU;
no spies, profiling, counters, forced GC or concurrent builds/tests in timing.
Work counts are collected separately with real-service package regressions.

Keep the existing v1 rule, unchanged: per case/metric,
`noise = max(0.03, p95(abs(baseline/baseline paired ratio - 1)))`; bounds over 20%
block claims. Benefit would need both repeat medians below `1 - noise` and at
least 6/7 faster pairs in each repeat, plus independent reduced work. Both medians
above one and at least 6/7 slower pairs in each repeat require investigation even
inside noise. Other results are uncertainty, not equivalence. Report all cells.

These deliberately short fixed samples do **not** establish v2 warmup convergence
or minimum timing windows. Even apparently favorable ratios are exploratory, not
acceptance-grade speedup/non-regression evidence. Do not substitute the packet for
original P or claim full ARPC-05 acceptance: READ/UPDATE/UPSERT/DELETE, changing or
enabled logs, related scopes, allocation and retained heap remain unmeasured.
No allocated-byte gain is inferred from skipped calls or closure/array removal.
If no valid both-mode benefit and required non-regression evidence exists, deliver
the guarded code as **candidate/unverified** for coordinator retention/withdrawal.

The protocol and noise rule will not be changed after seeing candidate data.
