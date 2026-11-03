> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Reopened FP-05 — fixed-artifact measurements

**Affected packages/benchmark scripts only. No workspace-wide lint/build/tests.**

Milliseconds: **median / p95 / recorded worker CPU per request**. Fixed candidate ESM `a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f`; the old measured c26 and intermediate 55af artifacts are not relabeled fixed.

Unchanged live worker/workloads/response checks; serial foreground jobs. Each worker re-inspects actual declarations in a short-lived compiler child before runtime/peers load. Fields 24, bytes 32, one client, hook concurrency 10, five warmups. Primary uses 100 samples; six active guards and strict representatives 50; one bounded adverse-case repeat 100. Two rounds reverse scenarios/rows/variant order. These are not randomized or statistical-significance claims.

Both model single+bag getters, supported option/declaration manifests, configured off/dormant/active modes, actual hydration/read/hook/getter counts, order/denied fields/full pre-post response checks/fingerprints are verified. LIST is timed; READ runtime is separately tested, not latency. Timing omission counts remain null; they do not prove every row borrowed.

## Primary — 100 rows, 100 samples/job

| Scenario / round | Official before, eight ON | Fixed eight ON / new OFF | Fixed eight ON / new ON | Old c26 new ON (NOT FIXED) | v0.51 source-only/current deps | Fixed ON vs fixed OFF median / p95 / CPU |
| --- | --- | --- | --- | --- | --- | --- |
| plain-wide / 1 | 16.702 / 19.734 / 21.068 | 17.570 / 20.723 / 22.324 | 12.933 / 15.189 / 16.306 | 12.843 / 15.769 / 16.330 | 5.340 / 7.695 / 5.493 | -26.4% / -26.7% / -27.0% |
| plain-wide / 2 | 17.131 / 20.035 / 21.755 | 17.461 / 20.183 / 22.190 | 12.765 / 14.710 / 16.117 | 12.731 / 15.871 / 16.387 | 5.454 / 8.035 / 5.628 | -26.9% / -27.1% / -27.4% |
| document-rules / 1 | 21.561 / 23.510 / 26.192 | 21.405 / 24.078 / 26.045 | 15.135 / 17.361 / 17.972 | 15.795 / 18.008 / 18.012 | 6.067 / 8.541 / 6.688 | -29.3% / -27.9% / -31.0% |
| document-rules / 2 | 21.555 / 24.143 / 26.457 | 21.719 / 24.360 / 26.056 | 14.917 / 17.580 / 17.777 | 15.039 / 17.520 / 17.796 | 6.038 / 8.043 / 6.191 | -31.3% / -27.8% / -31.8% |
| embedded / 1 | 54.263 / 58.905 / 63.677 | 54.183 / 59.809 / 65.064 | 24.662 / 27.867 / 29.301 | 24.712 / 28.289 / 29.567 | 8.279 / 9.863 / 9.001 | -54.5% / -53.4% / -55.0% |
| embedded / 2 | 54.064 / 58.592 / 64.159 | 54.653 / 58.459 / 64.517 | 24.832 / 28.717 / 29.476 | 24.812 / 29.867 / 29.661 | 8.452 / 9.906 / 9.061 | -54.6% / -50.9% / -54.3% |

### Correction cost in these unchanged ordinary workloads

| Scenario / round | Fixed ON vs preserved old c26 ON median / p95 / CPU |
| --- | --- |
| plain-wide / 1 | +0.7% / -3.7% / -0.1% |
| plain-wide / 2 | +0.3% / -7.3% / -1.7% |
| document-rules / 1 | -4.2% / -3.6% / -0.2% |
| document-rules / 2 | -0.8% / +0.3% / -0.1% |
| embedded / 1 | -0.2% / -1.5% / -0.9% |
| embedded / 2 | +0.1% / -3.9% / -0.6% |

No broad primary slowdown from the corrections is established: fixed-vs-old primary medians range approximately -4.2% to +0.7%, CPU is similar/lower. This does NOT measure arbitrary selected BSON Code/DBRef/wire graphs, imply native preparation is free, or accept the old defective runtime. Before-wide fixed-OFF itself varied about +1.9–5.2% vs official before; direct fixed-ON vs official-before gains remain about 22.6–54.6%. All batches remain separate; earlier absolute timings are not pooled.

## Active guards — 50 samples/job, both sizes/rounds

| Scenario / rows / round | Fixed eight ON / new OFF | Fixed eight ON / new ON | ON vs OFF median / p95 / CPU |
| --- | --- | --- | --- |
| plain-narrow / 10 / 1 | 4.132 / 5.803 / 4.976 | 3.242 / 4.666 / 4.537 | -21.5% / -19.6% / -8.8% |
| plain-narrow / 10 / 2 | 4.181 / 6.154 / 5.587 | 3.172 / 4.729 / 4.447 | -24.1% / -23.2% / -20.4% |
| plain-narrow / 100 / 1 | 10.210 / 13.072 / 13.416 | 7.019 / 9.031 / 9.072 | -31.2% / -30.9% / -32.4% |
| plain-narrow / 100 / 2 | 10.484 / 12.444 / 13.588 | 6.997 / 9.998 / 9.022 | -33.3% / -19.7% / -33.6% |
| hydrated / 10 / 1 | 5.341 / 7.923 / 7.486 | 4.340 / 6.237 / 6.107 | -18.7% / -21.3% / -18.4% |
| hydrated / 10 / 2 | 5.370 / 7.568 / 7.575 | 4.540 / 6.038 / 6.218 | -15.5% / -20.2% / -17.9% |
| hydrated / 100 / 1 | 19.592 / 22.288 / 24.948 | 14.552 / 18.619 / 18.975 | -25.7% / -16.5% / -23.9% |
| hydrated / 100 / 2 | 19.578 / 23.096 / 24.976 | 14.796 / 19.922 / 19.456 | -24.4% / -13.7% / -22.1% |
| global-rules / 10 / 1 | 5.392 / 8.254 / 7.514 | 4.577 / 6.361 / 6.314 | -15.1% / -22.9% / -16.0% |
| global-rules / 10 / 2 | 5.439 / 8.104 / 7.512 | 4.523 / 6.242 / 6.158 | -16.8% / -23.0% / -18.0% |
| global-rules / 100 / 1 | 21.620 / 25.072 / 28.331 | 15.715 / 18.215 / 19.165 | -27.3% / -27.3% / -32.4% |
| global-rules / 100 / 2 | 21.447 / 23.887 / 26.435 | 15.708 / 18.004 / 18.711 | -26.8% / -24.6% / -29.2% |
| large-config / 10 / 1 | 5.770 / 8.796 / 7.032 | 4.401 / 7.307 / 5.990 | -23.7% / -16.9% / -14.8% |
| large-config / 10 / 2 | 5.518 / 8.377 / 6.803 | 4.615 / 6.140 / 5.964 | -16.4% / -26.7% / -12.3% |
| large-config / 100 / 1 | 18.816 / 21.390 / 24.089 | 13.347 / 15.770 / 17.200 | -29.1% / -26.3% / -28.6% |
| large-config / 100 / 2 | 18.396 / 21.473 / 23.652 | 13.457 / 15.638 / 17.010 | -26.8% / -27.2% / -28.1% |
| populate / 10 / 1 | 7.685 / 10.739 / 9.165 | 5.746 / 8.191 / 7.378 | -25.2% / -23.7% / -19.5% |
| populate / 10 / 2 | 7.698 / 10.578 / 9.826 | 5.913 / 8.080 / 7.486 | -23.2% / -23.6% / -23.8% |
| populate / 100 / 1 | 23.496 / 25.833 / 28.904 | 15.770 / 18.159 / 19.964 | -32.9% / -29.7% / -30.9% |
| populate / 100 / 2 | 23.088 / 26.038 / 28.380 | 16.255 / 19.321 / 20.014 | -29.6% / -25.8% / -29.5% |
| virtuals / 10 / 1 | 5.640 / 9.031 / 7.581 | 4.562 / 7.463 / 6.305 | -19.1% / -17.4% / -16.8% |
| virtuals / 10 / 2 | 5.717 / 8.579 / 8.213 | 4.538 / 6.876 / 6.252 | -20.6% / -19.9% / -23.9% |
| virtuals / 100 / 1 | 22.548 / 24.614 / 27.396 | 16.460 / 19.176 / 21.477 | -27.0% / -22.1% / -21.6% |
| virtuals / 100 / 2 | 22.817 / 26.566 / 28.164 | 16.319 / 19.251 / 21.192 | -28.5% / -27.5% / -24.8% |

All 24 fixed active guard pairs lower median/p95/recorded CPU. Public populate retains two reads/request; all other scenarios one. Virtuals execute exactly 1,000/10,000 getters/job at 10/100 rows. Primary document-rules runs 10,000 hooks/job; embedded remains a separate scenario.

## Strict / requested-ON dormant — original eight OFF

All original eight prerequisites remain false on both models; neither new flag enables any prerequisite. Compare official strict before, fixed strict/new OFF and fixed strict/requested new ON dormant. No active omission is inferred in these jobs.

### v7-strict (50 samples/job)

| Scenario / rows / round | Official strict before | Fixed strict/new OFF | Fixed strict/requested new ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| document-rules / 10 / 1 | 22.393 / 24.147 / 24.004 | 22.502 / 23.868 / 23.832 | 22.278 / 24.162 / 23.632 | +0.5% / -1.2% / -0.7% | -0.5% / +0.1% / -1.6% |
| document-rules / 10 / 2 | 22.342 / 25.977 / 23.816 | 22.245 / 23.659 / 23.694 | 22.412 / 24.265 / 23.995 | -0.4% / -8.9% / -0.5% | +0.3% / -6.6% / +0.8% |
| document-rules / 100 / 1 | 185.821 / 191.331 / 193.184 | 185.228 / 190.414 / 190.963 | 187.416 / 191.865 / 192.332 | -0.3% / -0.5% / -1.1% | +0.9% / +0.3% / -0.4% |
| document-rules / 100 / 2 | 186.674 / 191.438 / 192.492 | 185.774 / 190.826 / 191.593 | 186.904 / 190.218 / 194.641 | -0.5% / -0.3% / -0.5% | +0.1% / -0.6% / +1.1% |
| embedded / 10 / 1 | 58.019 / 60.583 / 60.755 | 57.972 / 61.698 / 61.537 | 58.127 / 61.639 / 61.701 | -0.1% / +1.8% / +1.3% | +0.2% / +1.7% / +1.6% |
| embedded / 10 / 2 | 61.848 / 65.392 / 65.253 | 57.677 / 60.950 / 61.049 | 58.701 / 61.273 / 61.886 | -6.7% / -6.8% / -6.4% | -5.1% / -6.3% / -5.2% |
| embedded / 100 / 1 | 538.049 / 550.300 / 564.627 | 562.355 / 579.180 / 592.131 | 547.949 / 561.821 / 574.022 | +4.5% / +5.2% / +4.9% | +1.8% / +2.1% / +1.7% |
| embedded / 100 / 2 | 543.478 / 553.604 / 569.414 | 547.868 / 569.200 / 574.157 | 546.559 / 571.283 / 575.833 | +0.8% / +2.8% / +0.8% | +0.6% / +3.2% / +1.1% |
| plain-wide / 10 / 1 | 6.931 / 10.153 / 9.592 | 7.261 / 11.254 / 10.058 | 7.177 / 10.886 / 9.818 | +4.8% / +10.9% / +4.9% | +3.5% / +7.2% / +2.4% |
| plain-wide / 10 / 2 | 6.860 / 10.088 / 9.495 | 7.003 / 9.865 / 9.648 | 7.253 / 10.221 / 9.617 | +2.1% / -2.2% / +1.6% | +5.7% / +1.3% / +1.3% |
| plain-wide / 100 / 1 | 35.546 / 38.027 / 40.531 | 35.812 / 40.055 / 41.106 | 35.663 / 38.804 / 41.060 | +0.7% / +5.3% / +1.4% | +0.3% / +2.0% / +1.3% |
| plain-wide / 100 / 2 | 34.717 / 37.915 / 39.920 | 35.416 / 38.449 / 40.577 | 35.450 / 38.711 / 40.523 | +2.0% / +1.4% / +1.6% | +2.1% / +2.1% / +1.5% |

### v7-strict-noise-repeat (100 samples/job)

| Scenario / rows / round | Official strict before | Fixed strict/new OFF | Fixed strict/requested new ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| embedded / 100 / 1 | 538.503 / 546.827 / 563.910 | 538.762 / 550.309 / 565.492 | — | +0.0% / +0.6% / +0.3% | — |
| embedded / 100 / 2 | 545.739 / 558.832 / 570.605 | 549.275 / 561.923 / 574.486 | — | +0.6% / +0.6% / +0.7% | — |
| plain-wide / 10 / 1 | 6.496 / 8.881 / 8.132 | 6.609 / 9.128 / 8.309 | 6.557 / 8.922 / 8.267 | +1.7% / +2.8% / +2.2% | +0.9% / +0.5% / +1.7% |
| plain-wide / 10 / 2 | 6.752 / 8.619 / 8.336 | 6.596 / 8.480 / 8.363 | 6.544 / 9.040 / 8.284 | -2.3% / -1.6% / +0.3% | -3.1% / +4.9% / -0.6% |

Initial fixed strict medians vs before ranged roughly -6.7% to +4.8%; dormant -5.1% to +5.7%. These mixed signs are not an unconditional no-regression proof. Only two adverse cases were repeated, with 100 samples and reversed order:

- 10-row wide: initial strict +4.8% / +2.1%, dormant +3.5% / +5.7%. Repeat strict +1.7% / -2.3%, dormant +0.9% / -3.1%; repeated CPU within about -0.6% to +2.2%.
- 100-row embedded strict: initial +4.5% / +0.8%; repeat +0.05% / +0.65% median and +0.28% / +0.68% CPU. No larger repeated penalty established; no default path refinement was justified.
- Initial small-wide p95 was about +11% strict in one round. Repeated p95 has mixed signs. All earlier old-runtime adverse observations up to +7% median / +19.5% p95 remain historical evidence, not erased by this new run. Modest overhead, sequential-order or tail noise is not ruled out. No universal gain/no-regression guarantee.

## Historical reference — freshly paired with fixed bytes

Actual v0.51.0 source commit `89180d219783fbfad412d8dfe19beae614f45c68`, FP-01 rebuild with CURRENT dependencies/peers/tooling and copied modern workspace dependency dist, plus ignored supplemental tsconfig. Original historical lockfile was NOT installed. No new historical install/build/network. Current inspector re-reads actual preserved declarations/manifests before runtime. This is SOURCE-ONLY/CURRENT-DEPS, NOT a frozen v0.51.0 environment/performance or behavior/security equivalence.

Fresh fixed-ON / diagnostic median ratios are approximately 2.34–2.98x (wide 2.34–2.42x; document-rules 2.47–2.49x; embedded 2.94–2.98x). Fixed active moves closer than modern before but does not reach parity. All 10,000 document hooks/job genuinely run in the unchanged non-skim fixture on both historical and modern builds. Modern mandatory hooks, captured policy/target gates, opaque root ownership, selected budgets/memo and private-input behavior differ. Matching ordinary fixture outputs do not establish whole-library equivalence.

## Separate state / correction evidence

Full package includes 80 native and 50 owner regressions; focused 174-test rerun and all nine original reviewer fixtures pass. Wire expansion getter reads are 0. Separate six-row work proofs retain zero active stage/grant/deep-context/whole-source/transfer/identity/admission passes, one full resolution/configuration copy, six contexts/hooks, 144 callback bodies and one adapter read; one embedded derivation. These instrumented tests are outside timing workers. READ is runtime-tested, not timed. Real-application reproduction and arbitrary BSON-container performance are unavailable.

**124 real timing jobs / 8200 raw requests / 18 matching fixture cases.** Latency statistics independently recomputed from samples. CPU is audited as recorded worker statistics; raw user/system CPU counters are not emitted by the unchanged worker. No invented timing omission counts. Raw jobs/results/worker logs and summaries remain under the four named directories.
