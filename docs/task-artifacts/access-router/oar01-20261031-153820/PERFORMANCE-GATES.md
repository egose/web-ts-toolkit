> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Precommitted OAR retention gates

Written before any OAR candidate exists or is measured. Current-default means all ten
old controls OFF; current-active means all ten ON on the same freshly rebuilt bytes.
They are not two package versions. No guaranteed benefit is claimed. In particular,
current-active already removes source/grant/graph copying on admitted rows.

## Protocol (OAR-09 must retain all batches)

- Primary: unchanged plain-wide, document-rules, embedded LIST workloads; 100 rows,
  24 fields, 32 bytes, one client, hook concurrency 10, 5 warmups, 100 measured requests
  per job. Two paired rounds; reverse scenario/profile order in round two. CPU is
  actual worker process CPU/request. Keep every latency sample/fingerprint/count.
- Baseline preserved here: default/active, 12 jobs, 1,200 measured requests. Candidate
  comparison must rerun sealed baseline profiles interleaved with isolated/trusted on
  identical dependencies/tooling/host conditions, not compare today's quiet run with
  a later busy host. At most one owned Mongo and one worker active; serial foreground.
- Six guards: plain-narrow, hydrated, global-rules, large-config, populate, virtuals;
  10 and 100 rows, 50 samples, two reversed paired rounds. Include both candidate
  profiles and corresponding old baselines. READ, helper, native/fact costs are
  separate families with explicit APIs/read counts, not relabeled LIST results.
- Within a pair use (candidate-baseline)/baseline and the absolute ms/request delta;
  aggregate by median of paired deltas, never request-pool pseudo-replication. Show
  both round results as well as aggregates. p95 is nearest-rank per job as in worker.
  No significance/confidence-interval claim: two rounds are a reproducibility screen,
  not a statistical power study. Retain CPU user/system totals and measured elapsed.

## Fixed benefit/regression rules

- Protective-default primary benefit: isolated versus current-default must improve
  both median and CPU/request in all three workloads in each initial/repeat paired
  round. Median-of-paired improvement must reach **10% AND 1.0 ms/request** for latency
  and **10% AND 0.5 ms/request** for CPU in every workload. These are meaningful
  end-to-end savings for a breaking redesign, beyond tiny sub-millisecond noise.
- Material adverse latency: **>10% AND >1.0 ms/request** median, or **>15% AND >2.0 ms**
  p95. Material CPU: **>10% AND >0.5 ms/request**. Applied to primary isolated/default,
  trusted/old-active and every 10/100 guard in its matching comparison. No minimum
  trusted gain required: it must not repeatedly regress materially against old-active;
  do not count already-omitted work as a new gain.
- READ ordinary cases use the same adverse gates and require no material regression;
  READ benefit is reported, not substituted for failing primary LIST benefit.
- Standalone fresh helper: **zero DB reads, zero doc hooks**; compare new raw helper
  with old raw helper on boolean/global-only policy. Same adverse thresholds apply.
  Presentation subset from an already-authorized DTO also requires zero new reads.
- Helper migration needing CURRENT document authority must issue exactly one new
  findOne/read per old single handle reuse (or one batched find/list for an explicitly
  batched recipe); count DB reads/hooks. Total query+helper median must be no more than
  **old initial-query+handle flow + one matching fresh normal query + 10% AND 1.0 ms**
  (CPU allowance **10% AND 0.5 ms**) of that summed comparator. Extra hidden reads,
  repeated doc hooks per row, or exceeding that allowance are blockers, not noise.
  The added normal read itself is a disclosed breaking-contract cost, not a speedup.
- Native-heavy/fact-heavy: preserve responses, denial/bounds and hook/read counts;
  use the same material-adverse gates for comparable work. Eager unused fact cost
  must be reported against its own boolean-fact workload, never ordinary LIST.
  Instrumented heap/retained state is supplementary: repeated >15% AND >1 MiB
  retained heap after GC at fixed rows, or any superlinear retained per-field graph
  growth, is a blocker. Label unsupported allocation counters unavailable; do not
  infer allocation counts from heap deltas.

## Bounded repeats/disposition

If a benefit gate misses, rounds disagree in sign, or any material-adverse metric
triggers, run exactly **two additional paired rounds** for the affected case/profile
comparison at the original settings, reversing order again. No larger sample counts,
selective discards, or new workload substitutions. All original and repeated data stay.
After four total pairs, benefit must meet its size thresholds on the median paired
delta and improve median+CPU in at least three of four pairs; a material regression is
confirmed if it triggers in at least three of four pairs and on median paired delta.
Unresolved sign instability (fewer than three aligned pairs), confirmed adverse results,
security/count/fingerprint differences or failed primary benefit keep OAR-09 open for
explicit disposition. At most one repeat batch per unchanged artifact/case; a fixed
artifact gets a new named batch, not overwritten evidence. No gate movement after
candidate measurement. These pragmatic noise bounds do not establish universal gains.
