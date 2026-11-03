> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-05 final-artifact measurement results

All values are milliseconds: **median / p95 / worker CPU per request**.

Serial foreground runs of the unchanged live worker. Every job reparses the actual declarations in a short-lived compiler child before runtime/peers load. Fields 24; bytes 32; client concurrency 1; hook concurrency 10; warmup 5. Primary uses 100 samples; guards/initial strict/repeat use 50; final embedded dormant repeat uses 100. Each matrix has two rounds with reversed scenario/variant order. No selective pooling, latency assertions, instrumentation, workload changes or hidden flag activation.

Both getter paths on both models, actual supported flags, all declaration hashes, effective LIST/READ configuration, actual hydration, row ordering/denied fields/full pre/post expected outputs/fingerprints and measured read/hook/getter counts are checked. LIST is measured; READ runtime behavior is separately tested, not timed. `runtimeOmissionCounts: null` in timing jobs is intentional; configuration is not every-row borrowing proof.

## Primary (100 rows)

| Scenario / round | Official before (eight ON, new unsupported) | Same candidate eight ON / new OFF | Same candidate eight ON / new ON | Source-only v0.51.0 / current dependencies | ON vs same OFF median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| plain-wide / 1 | 18.678 / 21.595 / 23.355 | 18.705 / 22.789 / 23.798 | 13.920 / 17.094 / 17.487 | 5.795 / 8.765 / 6.350 | -25.6% / -25.0% / -26.5% |
| plain-wide / 2 | 18.638 / 23.195 / 23.462 | 18.463 / 21.916 / 23.533 | 14.218 / 18.198 / 17.547 | 6.055 / 8.235 / 5.889 | -23.0% / -17.0% / -25.4% |
| document-rules / 1 | 22.821 / 27.019 / 28.437 | 23.111 / 27.184 / 27.900 | 16.097 / 18.947 / 19.398 | 6.988 / 10.670 / 7.485 | -30.4% / -30.3% / -30.5% |
| document-rules / 2 | 23.351 / 28.426 / 28.589 | 22.695 / 27.465 / 27.706 | 15.784 / 18.501 / 19.068 | 6.547 / 9.626 / 7.165 | -30.5% / -32.6% / -31.2% |
| embedded / 1 | 57.585 / 66.052 / 69.673 | 58.421 / 64.103 / 69.221 | 26.654 / 30.855 / 31.405 | 9.360 / 11.864 / 9.801 | -54.4% / -51.9% / -54.6% |
| embedded / 2 | 57.631 / 65.330 / 68.557 | 58.105 / 64.654 / 68.554 | 27.170 / 31.317 / 31.922 | 9.050 / 11.615 / 9.675 | -53.2% / -51.6% / -53.4% |

Relevant median/CPU gains repeat in both alternating rounds; no active primary/guard refinement was needed. Absolute times differ from FP-03 pilot/FP-01 baselines, so only within-batch comparisons support this claim.

## Active guards

| Scenario / rows / round | Same candidate eight ON / new OFF | Same candidate eight ON / new ON | ON vs OFF median / p95 / CPU |
| --- | --- | --- | --- |
| plain-narrow / 10 / 1 | 4.791 / 6.903 / 6.219 | 3.624 / 5.283 / 4.827 | -24.4% / -23.5% / -22.4% |
| plain-narrow / 10 / 2 | 4.515 / 7.432 / 6.063 | 3.592 / 6.309 / 4.966 | -20.4% / -15.1% / -18.1% |
| plain-narrow / 100 / 1 | 10.975 / 13.916 / 14.345 | 7.737 / 11.650 / 9.823 | -29.5% / -16.3% / -31.5% |
| plain-narrow / 100 / 2 | 11.177 / 15.647 / 14.535 | 7.631 / 11.809 / 9.551 | -31.7% / -24.5% / -34.3% |
| hydrated / 10 / 1 | 6.809 / 16.053 / 10.159 | 5.225 / 8.263 / 6.961 | -23.3% / -48.5% / -31.5% |
| hydrated / 10 / 2 | 6.361 / 8.719 / 8.349 | 4.958 / 7.743 / 7.014 | -22.1% / -11.2% / -16.0% |
| hydrated / 100 / 1 | 20.840 / 26.316 / 26.943 | 16.390 / 19.380 / 20.583 | -21.4% / -26.4% / -23.6% |
| hydrated / 100 / 2 | 21.032 / 29.874 / 27.268 | 16.175 / 19.869 / 20.918 | -23.1% / -33.5% / -23.3% |
| global-rules / 10 / 1 | 6.057 / 8.658 / 8.100 | 4.910 / 8.390 / 6.669 | -18.9% / -3.1% / -17.7% |
| global-rules / 10 / 2 | 6.230 / 10.418 / 8.724 | 4.986 / 7.879 / 6.691 | -20.0% / -24.4% / -23.3% |
| global-rules / 100 / 1 | 23.313 / 27.663 / 28.417 | 16.940 / 21.076 / 20.343 | -27.3% / -23.8% / -28.4% |
| global-rules / 100 / 2 | 23.035 / 26.007 / 28.033 | 16.575 / 20.554 / 19.968 | -28.0% / -21.0% / -28.8% |
| large-config / 10 / 1 | 6.204 / 9.264 / 8.151 | 4.907 / 7.620 / 6.413 | -20.9% / -17.8% / -21.3% |
| large-config / 10 / 2 | 6.541 / 9.654 / 8.275 | 5.068 / 6.537 / 6.125 | -22.5% / -32.3% / -26.0% |
| large-config / 100 / 1 | 19.709 / 23.566 / 25.461 | 14.472 / 18.487 / 18.628 | -26.6% / -21.6% / -26.8% |
| large-config / 100 / 2 | 20.270 / 24.911 / 25.628 | 14.125 / 17.132 / 17.883 | -30.3% / -31.2% / -30.2% |
| populate / 10 / 1 | 8.726 / 12.277 / 10.540 | 6.636 / 9.069 / 7.880 | -23.9% / -26.1% / -25.2% |
| populate / 10 / 2 | 8.247 / 12.532 / 10.618 | 6.408 / 9.103 / 8.016 | -22.3% / -27.4% / -24.5% |
| populate / 100 / 1 | 25.864 / 31.692 / 31.804 | 16.523 / 20.397 / 21.096 | -36.1% / -35.6% / -33.7% |
| populate / 100 / 2 | 24.837 / 28.565 / 30.442 | 17.133 / 21.845 / 20.945 | -31.0% / -23.5% / -31.2% |
| virtuals / 10 / 1 | 6.175 / 10.079 / 8.671 | 5.000 / 8.427 / 6.970 | -19.0% / -16.4% / -19.6% |
| virtuals / 10 / 2 | 6.470 / 10.877 / 9.010 | 5.213 / 7.728 / 6.876 | -19.4% / -28.9% / -23.7% |
| virtuals / 100 / 1 | 24.656 / 28.957 / 30.197 | 17.064 / 19.884 / 22.231 | -30.8% / -31.3% / -26.4% |
| virtuals / 100 / 2 | 23.798 / 28.963 / 29.680 | 17.024 / 21.724 / 22.742 | -28.5% / -25.0% / -23.4% |

All 24 active guard pairs lowered median, p95 and CPU. Populate makes two reads/request; other scenarios one. Virtuals execute exactly 1,000 or 10,000 getters/job (10/100 rows, 50 samples). Document-rules remains separate from embedded.

## Default / strict and requested-ON dormant guards

All original eight flags are false, both copy skips are false, and neither new flag enables a prerequisite. Official-before new support is absent; candidate strict is new OFF; candidate dormant requests both new flags ON. These retain the original strict behavior, not the active borrowed path.

### v7-strict

| Scenario / rows / round | Official strict before | Candidate strict/new OFF | Candidate strict/requested new ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| document-rules / 10 / 1 | 23.980 / 27.538 / 25.853 | 23.541 / 27.312 / 25.529 | 24.048 / 26.364 / 25.700 | -1.8% / -0.8% / -1.3% | +0.3% / -4.3% / -0.6% |
| document-rules / 10 / 2 | 24.205 / 30.887 / 26.198 | 24.497 / 26.851 / 25.894 | 24.472 / 28.929 / 26.104 | +1.2% / -13.1% / -1.2% | +1.1% / -6.3% / -0.4% |
| document-rules / 100 / 1 | 197.907 / 222.909 / 214.311 | 202.820 / 209.282 / 209.586 | 201.409 / 205.464 / 207.991 | +2.5% / -6.1% / -2.2% | +1.8% / -7.8% / -2.9% |
| document-rules / 100 / 2 | 200.201 / 221.695 / 213.103 | 201.278 / 208.922 / 210.161 | 199.133 / 217.333 / 210.210 | +0.5% / -5.8% / -1.4% | -0.5% / -2.0% / -1.4% |
| embedded / 10 / 1 | 61.703 / 66.690 / 65.339 | 62.833 / 68.874 / 66.472 | 60.877 / 64.479 / 64.195 | +1.8% / +3.3% / +1.7% | -1.3% / -3.3% / -1.8% |
| embedded / 10 / 2 | 61.006 / 66.258 / 64.077 | 62.008 / 68.537 / 65.706 | 64.366 / 69.832 / 67.918 | +1.6% / +3.4% / +2.5% | +5.5% / +5.4% / +6.0% |
| embedded / 100 / 1 | 586.370 / 605.658 / 616.838 | 565.273 / 576.770 / 590.835 | 575.530 / 593.273 / 601.685 | -3.6% / -4.8% / -4.2% | -1.8% / -2.0% / -2.5% |
| embedded / 100 / 2 | 578.891 / 596.432 / 609.345 | 575.870 / 587.954 / 603.846 | 573.417 / 596.918 / 602.616 | -0.5% / -1.4% / -0.9% | -0.9% / +0.1% / -1.1% |
| plain-wide / 10 / 1 | 7.727 / 11.480 / 10.338 | 7.639 / 11.399 / 10.444 | 7.770 / 12.034 / 10.382 | -1.1% / -0.7% / +1.0% | +0.6% / +4.8% / +0.4% |
| plain-wide / 10 / 2 | 7.969 / 11.166 / 10.482 | 7.889 / 11.612 / 10.655 | 8.298 / 12.447 / 10.807 | -1.0% / +4.0% / +1.6% | +4.1% / +11.5% / +3.1% |
| plain-wide / 100 / 1 | 38.839 / 42.290 / 43.732 | 38.458 / 43.557 / 43.980 | 38.095 / 43.174 / 46.640 | -1.0% / +3.0% / +0.6% | -1.9% / +2.1% / +6.6% |
| plain-wide / 100 / 2 | 38.704 / 42.913 / 44.046 | 38.151 / 44.589 / 43.957 | 38.134 / 43.299 / 43.578 | -1.4% / +3.9% / -0.2% | -1.5% / +0.9% / -1.1% |

### v7-strict-noise-repeat

| Scenario / rows / round | Official strict before | Candidate strict/new OFF | Candidate strict/requested new ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| embedded / 10 / 1 | 63.402 / 67.405 / 66.393 | 63.407 / 70.528 / 67.267 | 62.782 / 66.671 / 66.003 | +0.0% / +4.6% / +1.3% | -1.0% / -1.1% / -0.6% |
| embedded / 10 / 2 | 60.404 / 64.954 / 63.965 | 59.989 / 64.593 / 63.832 | 64.184 / 69.903 / 67.459 | -0.7% / -0.6% / -0.2% | +6.3% / +7.6% / +5.5% |
| plain-wide / 10 / 1 | 7.564 / 11.939 / 10.219 | 7.825 / 12.876 / 10.568 | 8.096 / 12.891 / 10.563 | +3.5% / +7.8% / +3.4% | +7.0% / +8.0% / +3.4% |
| plain-wide / 10 / 2 | 7.846 / 10.887 / 10.472 | 7.701 / 13.010 / 10.450 | 7.968 / 11.602 / 10.368 | -1.8% / +19.5% / -0.2% | +1.6% / +6.6% / -1.0% |
| plain-wide / 100 / 1 | 38.243 / 43.064 / 43.726 | 37.186 / 41.578 / 42.640 | 38.036 / 42.985 / 43.460 | -2.8% / -3.4% / -2.5% | -0.5% / -0.2% / -0.6% |
| plain-wide / 100 / 2 | 37.731 / 41.558 / 43.187 | 38.301 / 43.138 / 43.886 | 38.004 / 42.643 / 43.300 | +1.5% / +3.8% / +1.6% | +0.7% / +2.6% / +0.3% |

### v7-dormant-embedded-final-repeat

| Scenario / rows / round | Official strict before | Candidate strict/new OFF | Candidate strict/requested new ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| embedded / 10 / 1 | 60.758 / 63.534 / 62.996 | 61.118 / 66.581 / 63.958 | 61.566 / 65.849 / 63.945 | +0.6% / +4.8% / +1.5% | +1.3% / +3.6% / +1.5% |
| embedded / 10 / 2 | 61.491 / 64.567 / 63.869 | 61.696 / 67.557 / 64.532 | 61.542 / 66.591 / 64.380 | +0.3% / +4.6% / +1.0% | +0.1% / +3.1% / +0.8% |

Bounded repeats targeted only adverse/noisy small strict/dormant cases and one CPU outlier. They were not used to replace earlier batches:

- Strict new-OFF vs official-before medians initially ranged about -3.6% to +2.5%. Requested-ON dormant initially reached +5.5% for 10-row embedded and +4.1% for 10-row wide; one 100-row-wide dormant CPU observation was about +6.6%.
- First bounded repeat: 10-row wide dormant +7.0% / +1.6% (about +0.532 / +0.122 ms); 10-row embedded dormant -1.0% / +6.3%. Preserve these adverse observations; do not claim an unconditional no-regression result.
- Final 100-sample embedded three-way repeat: strict median +0.6% / +0.3%; dormant +1.3% / +0.1%, CPU +1.5% / +0.8% vs official before. The prior 5–6% median effect did not repeat at 100 samples; final p95 still varied up to +4.8% for strict and +3.6% for dormant.
- 100-row-wide repeat CPU was -2.5% / +1.6% strict, -0.6% / +0.3% dormant; the earlier roughly +6.6% CPU observation did not repeat. Some 10-row-wide p95s remained adverse (up to roughly +19.5%). Small-workload tail/ordering noise or modest added overhead is not ruled out. No broad/default performance guarantee is made.

## Historical source-only comparison / limitations

The actual v0.51.0 source commit is `89180d219783fbfad412d8dfe19beae614f45c68`, built by FP-01 with CURRENT external dependencies/peers/tooling and copied modern workspace dependency dist, plus its ignored supplemental diagnostic tsconfig. Its original historical lockfile was NOT installed. This is NOT a frozen v0.51.0 environment or historical-performance/security/behavior equivalence. No new install/network was needed.

The current parser re-inspected the preserved actual declarations and hashes before these jobs; old prepare metadata was not assumed compatible. Source-only diagnostic fixtures use the unchanged non-skim document-rules workload: all 10,000 document hooks/job genuinely ran, just as in modern before/OFF/ON. All primary outputs/fingerprints agree for these fixtures only.

Active mode is closer to this diagnostic on each measured primary fixture but is still about 2.3–3.0 times its median latency. Retained modern mandatory hooks, captured policy/target gates, opaque-root authority, per-element memo/selected budgets and getter/private-input behavior differ; matching fixtures do not establish whole-library equivalence. Real-application reproduction is unavailable.

## Work counts (separate from timings)

`v2-runtime-work-authority-read.log` reruns all 44 new runtime unit tests, including actual READ/off/dormant/active behavior, mixed copied/trusted rows, wrong tuples/roots, helpers, native fallbacks and selected budgets. For six rows x 24 dynamic callbacks, with/without embedded children: stage copies, grant copies, deep contexts, whole-source normalizations, graph transfers, identity walks/admissions are all 0; one full resolution, one configuration copy, six contexts, six hooks, 144 rule bodies and one adapter read remain. Embedded scope derivation is one (zero without embedded). These are actual instrumented fixtures, not implied counts for every benchmark row.

**Total: 132 real timing jobs / 8100 raw measured requests**, plus V6 real-worker smoke. All timing worker omission counts remain null. Raw jobs/results/logs and progressive summaries are in the five same-named directories. No benchmark owned processes remain after each awaited driver returns.
