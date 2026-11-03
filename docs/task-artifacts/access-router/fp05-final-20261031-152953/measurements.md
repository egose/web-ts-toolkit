> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Final FP-05 — residual-reviewed artifact measurements

**Affected packages/benchmark scripts only. No workspace-wide lint/build/tests.**

Milliseconds: **median / p95 / recorded worker CPU per request**. Current ESM `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`. Earlier c26/a0 timings remain tied to their own bytes; a0 controls below have a known residual and are NOT accepted current bytes.

Unchanged live worker/workloads/response checks; serial foreground jobs. The declaration compiler runs in a short-lived child outside the measured runtime heap before peers load. Fields 24, bytes 32, one client, hook concurrency 10, five warmups. Primary 100 samples/job; active guards and strict representatives 50; ONE bounded adverse-case repeat batch 100. Two rounds reverse scenario/row/variant order. No randomization, significance claim or selective pooling.

Both model single+bag getters, actual declaration manifests/hash, supported options, configured off/dormant/active modes, actual hydration/read/hook/getter counts, order/denied fields/full pre-post response checks/fingerprints are verified. LIST is timed; READ runtime is tested, not READ latency. Timing omission counts stay null, not a per-row borrowing claim.

## Primary — 100 rows, 100 samples/job

| Scenario / round | Official before, eight ON | Current eight ON / new OFF | Current eight ON / new ON | Old a0 ON (known residual; not accepted) | v0.51 source-only/current deps | Current ON vs OFF median / p95 / CPU |
| --- | --- | --- | --- | --- | --- | --- |
| plain-wide / 1 | 19.924 / 23.618 / 23.057 | 20.381 / 24.684 / 24.096 | 14.785 / 19.591 / 17.559 | 15.374 / 17.589 / 17.716 | 6.740 / 9.905 / 6.472 | -27.5% / -20.6% / -27.1% |
| plain-wide / 2 | 20.241 / 23.316 / 23.832 | 20.124 / 24.598 / 23.884 | 14.694 / 17.929 / 17.517 | 14.900 / 18.194 / 17.630 | 7.045 / 9.128 / 6.062 | -27.0% / -27.1% / -26.7% |
| document-rules / 1 | 25.304 / 29.189 / 28.709 | 24.731 / 28.513 / 27.866 | 17.859 / 22.024 / 20.200 | 18.304 / 21.564 / 20.190 | 7.486 / 11.960 / 7.577 | -27.8% / -22.8% / -27.5% |
| document-rules / 2 | 25.947 / 30.924 / 28.530 | 24.276 / 28.109 / 27.675 | 17.143 / 20.697 / 19.448 | 17.524 / 20.408 / 19.796 | 7.950 / 9.990 / 7.658 | -29.4% / -26.4% / -29.7% |
| embedded / 1 | 62.490 / 70.440 / 69.537 | 63.969 / 72.432 / 70.141 | 29.124 / 34.678 / 32.212 | 28.886 / 34.320 / 31.919 | 10.257 / 12.928 / 10.084 | -54.5% / -52.1% / -54.1% |
| embedded / 2 | 63.685 / 70.209 / 69.687 | 63.065 / 69.144 / 68.637 | 28.918 / 34.238 / 31.788 | 29.170 / 34.004 / 32.079 | 10.134 / 12.311 / 9.732 | -54.1% / -50.5% / -53.7% |

All six primary pairs improve median/p95/CPU. Same-current-build median changes: -54.47 to -26.99%; recorded CPU -54.07 to -26.66%.

### Bounded correction-cost control

| Scenario / round | Current ON vs preserved old a0 ON median / p95 / CPU |
| --- | --- |
| plain-wide / 1 | -3.8% / +11.4% / -0.9% |
| plain-wide / 2 | -1.4% / -1.5% / -0.6% |
| document-rules / 1 | -2.4% / +2.1% / +0.0% |
| document-rules / 2 | -2.2% / +1.4% / -1.8% |
| embedded / 1 | +0.8% / +1.0% / +0.9% |
| embedded / 2 | -0.9% / +0.7% / -0.9% |

Correction-control median changes -3.83 to 0.82%, CPU -1.76 to 0.92%; p95 -1.46 to 11.39%. No broad ordinary-primary slowdown is established; individual tails vary. This does NOT benchmark arbitrary BSON Code/DBRef/wire graphs, imply native preparation is free, or accept a0's known residual. Current OFF vs official-before median changes -6.44 to 2.37%; no zero default-overhead claim. Earlier absolute timings are not pooled.

## Active guards — 50 samples/job, both sizes/rounds

| Scenario / rows / round | Current eight ON / new OFF | Current eight ON / new ON | ON vs OFF median / p95 / CPU |
| --- | --- | --- | --- |
| plain-narrow / 10 / 1 | 4.211 / 7.962 / 5.057 | 4.394 / 6.743 / 5.250 | +4.3% / -15.3% / +3.8% |
| plain-narrow / 10 / 2 | 6.134 / 8.633 / 7.313 | 3.981 / 5.660 / 5.094 | -35.1% / -34.4% / -30.3% |
| plain-narrow / 100 / 1 | 12.060 / 14.617 / 14.390 | 8.736 / 14.308 / 10.120 | -27.6% / -2.1% / -29.7% |
| plain-narrow / 100 / 2 | 11.811 / 14.158 / 14.304 | 8.682 / 12.343 / 9.916 | -26.5% / -12.8% / -30.7% |
| hydrated / 10 / 1 | 7.109 / 10.004 / 8.554 | 5.610 / 7.831 / 6.228 | -21.1% / -21.7% / -27.2% |
| hydrated / 10 / 2 | 6.469 / 11.025 / 8.460 | 6.143 / 8.307 / 7.403 | -5.0% / -24.7% / -12.5% |
| hydrated / 100 / 1 | 22.122 / 25.927 / 26.221 | 16.768 / 20.749 / 20.075 | -24.2% / -20.0% / -23.4% |
| hydrated / 100 / 2 | 23.152 / 27.165 / 26.743 | 17.209 / 21.696 / 20.370 | -25.7% / -20.1% / -23.8% |
| global-rules / 10 / 1 | 6.982 / 10.196 / 8.564 | 5.161 / 8.557 / 5.950 | -26.1% / -16.1% / -30.5% |
| global-rules / 10 / 2 | 6.824 / 9.587 / 8.045 | 6.172 / 9.251 / 7.259 | -9.5% / -3.5% / -9.8% |
| global-rules / 100 / 1 | 25.259 / 28.702 / 28.485 | 18.168 / 20.651 / 20.299 | -28.1% / -28.1% / -28.7% |
| global-rules / 100 / 2 | 25.673 / 31.147 / 28.463 | 18.083 / 22.056 / 20.256 | -29.6% / -29.2% / -28.8% |
| large-config / 10 / 1 | 7.806 / 11.381 / 9.156 | 5.394 / 7.232 / 5.572 | -30.9% / -36.5% / -39.1% |
| large-config / 10 / 2 | 7.324 / 11.212 / 8.070 | 5.591 / 8.076 / 5.698 | -23.7% / -28.0% / -29.4% |
| large-config / 100 / 1 | 21.421 / 28.540 / 25.835 | 15.339 / 18.432 / 18.535 | -28.4% / -35.4% / -28.3% |
| large-config / 100 / 2 | 21.900 / 24.746 / 26.957 | 15.735 / 18.723 / 19.065 | -28.1% / -24.3% / -29.3% |
| populate / 10 / 1 | 9.780 / 12.844 / 11.209 | 7.549 / 11.430 / 8.401 | -22.8% / -11.0% / -25.0% |
| populate / 10 / 2 | 9.564 / 14.539 / 11.421 | 7.125 / 10.522 / 8.015 | -25.5% / -27.6% / -29.8% |
| populate / 100 / 1 | 27.406 / 31.329 / 30.966 | 18.829 / 21.540 / 20.765 | -31.3% / -31.2% / -32.9% |
| populate / 100 / 2 | 27.266 / 32.439 / 31.184 | 18.956 / 25.122 / 21.735 | -30.5% / -22.6% / -30.3% |
| virtuals / 10 / 1 | 7.116 / 10.990 / 9.246 | 5.612 / 8.549 / 6.778 | -21.1% / -22.2% / -26.7% |
| virtuals / 10 / 2 | 7.147 / 10.938 / 9.142 | 5.990 / 11.413 / 7.650 | -16.2% / +4.3% / -16.3% |
| virtuals / 100 / 1 | 26.520 / 31.137 / 30.524 | 18.850 / 22.106 / 22.845 | -28.9% / -29.0% / -25.2% |
| virtuals / 100 / 2 | 26.751 / 29.655 / 31.019 | 18.963 / 23.720 / 23.205 | -29.1% / -20.0% / -25.2% |

Initial guards: 23/24 lower medians, 23/24 lower p95, 23/24 lower CPU; 22/24 lower all three. Not all pairs improved. The 10-row narrow first pair has worse median/CPU; 10-row virtual second-round p95 is adverse. Both raw observations remain. Populate retains two reads/request; all others one. Virtuals execute 1,000/10,000 getters/job. Primary document-rules runs 10,000 actual hooks/job; embedded stays separate.

## Strict / requested-ON dormant — original eight OFF

All eight original flags remain false on both models; neither new flag enables a prerequisite. Compare official strict before, current strict/new OFF and requested-ON dormant. No active omission is inferred.

### v7-strict (50 samples/job)

| Scenario / rows / round | Official strict before | Current strict/new OFF | Current requested-ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| document-rules / 10 / 1 | 25.843 / 30.622 / 26.283 | 25.931 / 29.319 / 26.319 | 26.246 / 29.083 / 25.866 | +0.3% / -4.3% / +0.1% | +1.6% / -5.0% / -1.6% |
| document-rules / 10 / 2 | 27.290 / 30.076 / 27.200 | 26.230 / 28.845 / 26.000 | 26.410 / 31.137 / 26.401 | -3.9% / -4.1% / -4.4% | -3.2% / +3.5% / -2.9% |
| document-rules / 100 / 1 | 213.574 / 231.719 / 213.589 | 216.315 / 235.669 / 217.407 | 217.183 / 235.530 / 218.107 | +1.3% / +1.7% / +1.8% | +1.7% / +1.6% / +2.1% |
| document-rules / 100 / 2 | 216.473 / 225.210 / 210.419 | 219.749 / 238.297 / 222.358 | 218.621 / 229.250 / 211.936 | +1.5% / +5.8% / +5.7% | +1.0% / +1.8% / +0.7% |
| embedded / 10 / 1 | 67.916 / 74.362 / 66.930 | 68.430 / 72.785 / 67.138 | 69.155 / 73.887 / 68.566 | +0.8% / -2.1% / +0.3% | +1.8% / -0.6% / +2.4% |
| embedded / 10 / 2 | 67.321 / 72.406 / 66.668 | 70.304 / 77.188 / 70.221 | 67.660 / 74.977 / 67.494 | +4.4% / +6.6% / +5.3% | +0.5% / +3.6% / +1.2% |
| embedded / 100 / 1 | 621.717 / 643.573 / 618.347 | 623.476 / 648.474 / 615.887 | 636.337 / 655.455 / 631.523 | +0.3% / +0.8% / -0.4% | +2.4% / +1.8% / +2.1% |
| embedded / 100 / 2 | 623.948 / 642.279 / 618.459 | 638.031 / 653.405 / 627.990 | 627.988 / 644.550 / 622.332 | +2.3% / +1.7% / +1.5% | +0.6% / +0.4% / +0.6% |
| plain-wide / 10 / 1 | 8.865 / 11.763 / 10.860 | 8.641 / 12.320 / 10.673 | 9.311 / 13.155 / 11.073 | -2.5% / +4.7% / -1.7% | +5.0% / +11.8% / +2.0% |
| plain-wide / 10 / 2 | 8.992 / 12.510 / 10.900 | 8.997 / 11.798 / 10.171 | 8.906 / 13.165 / 11.106 | +0.1% / -5.7% / -6.7% | -1.0% / +5.2% / +1.9% |
| plain-wide / 100 / 1 | 41.995 / 48.589 / 43.848 | 41.672 / 46.260 / 44.646 | 41.817 / 46.852 / 44.793 | -0.8% / -4.8% / +1.8% | -0.4% / -3.6% / +2.2% |
| plain-wide / 100 / 2 | 41.641 / 47.584 / 44.226 | 40.821 / 45.392 / 43.909 | 40.914 / 46.544 / 44.907 | -2.0% / -4.6% / -0.7% | -1.7% / -2.2% / +1.5% |

### v7-adverse-repeat (100 samples/job)

| Scenario / rows / round | Official strict before | Current strict/new OFF | Current requested-ON dormant | OFF vs before median / p95 / CPU | Dormant vs before median / p95 / CPU |
| --- | --- | --- | --- | --- | --- |
| embedded / 10 / 1 | 66.264 / 74.118 / 65.038 | 67.849 / 72.430 / 66.515 | — | +2.4% / -2.3% / +2.3% | — |
| embedded / 10 / 2 | 66.573 / 70.782 / 65.015 | 68.442 / 72.650 / 67.393 | — | +2.8% / +2.6% / +3.7% | — |
| plain-wide / 10 / 1 | 7.943 / 10.410 / 8.868 | 7.932 / 10.878 / 9.134 | 8.763 / 11.631 / 9.446 | -0.1% / +4.5% / +3.0% | +10.3% / +11.7% / +6.5% |
| plain-wide / 10 / 2 | 8.134 / 11.615 / 9.415 | 8.478 / 11.649 / 9.560 | 8.211 / 11.113 / 9.470 | +4.2% / +0.3% / +1.5% | +0.9% / -4.3% / +0.6% |

### Same bounded repeat: active narrow 10-row guard

| Round | Current eight ON / new OFF | Current eight ON / new ON | ON vs OFF median / p95 / CPU |
| --- | --- | --- | --- |
| 1 | 4.936 / 6.462 / 5.277 | 3.448 / 5.483 / 3.947 | -30.1% / -15.1% / -25.2% |
| 2 | 4.960 / 7.048 / 5.466 | 4.063 / 6.305 / 4.364 | -18.1% / -10.5% / -20.2% |

The single repeat batch was chosen AFTER the initial adverse observations, not to replace them: narrow 10-row active, wide 10-row strict/dormant, embedded 10-row strict. No primary reruns or further repeats. Narrow repeat improves all three in both rounds; its initial loss and large reverse-round gain still show small-case variability.

Strict/default overhead is NOT zero: the embedded 10-row strict median remains about +2.4/+2.8% in the repeat, with about +2.3/+3.7% CPU. Wide dormant repeat is about +10.3% / +0.820 ms median and +11.7% p95 in round 1, then about +0.9% median / -4.3% p95 reversed; strict wide repeat about -0.1/+4.2% median. Modest overhead and sequential-order/tail noise are not ruled out. No gate or universal no-regression threshold was invented.

Earlier historical c26 adverse observations up to +7% median / +19.5% p95, and a0 strict/dormant caveats, remain at their original evidence paths. These new runs do not erase them. No extra repetitions hunted a win.

## Historical reference — freshly paired with current bytes

Actual v0.51.0 source commit `89180d219783fbfad412d8dfe19beae614f45c68`, FP-01 rebuild with CURRENT peers/dependencies/tooling/workspace dist and ignored supplemental tsconfig. The original historical lock was NOT installed; no new historical install/build/network. Current inspector re-reads actual preserved declarations/manifests before runtime. This is SOURCE-ONLY/CURRENT-DEPS, NOT frozen historical environment/performance or behavior/security equivalence.

Current ON / diagnostic median ratios 2.09–2.85x. Closer than modern before but not parity. All 10,000 hooks/job genuinely execute in the unchanged non-skim document-rules fixture on both builds. Modern mandatory hooks, captured policy/target gates, opaque root ownership, memo/selected bounds/private inputs differ. Matching ordinary outputs do not establish whole-library/security equivalence.

## Separate state / retained-contract evidence

Full access-router 6,449 tests/180 files includes 102 native and 50 owner regressions; focused 196-product + 25-review cases pass. Original reviewer wire expansion getter reads 0; denied Code/DBRef/wire policy work stops within shared remaining slots. Separate six-row embedded proof: 36 stage, 384 grant, 24 deep-context, 24 whole-source and 390 transfer work becomes 0; full resolution 7→1; six hooks, 144 callback bodies, one read retained. Identity/admission 30/36→0/0; one configuration copy and embedded derivation remain. Instrumented proofs are OUTSIDE timing workers. READ runtime is covered, not latency. No real-application reproduction or arbitrary BSON-heavy latency evidence.

**128 real timing jobs / 8600 raw requests / 18 matching fixture cases.** Latency independently recomputed from raw samples. CPU is audited as recorded worker stats; unchanged worker emits no raw user/system counters, so CPU is not falsely recomputed. No invented timing omission counts. All raw jobs/results/worker logs/summaries remain under the four named directories.

Actual timing Node v26.12.1; MongoDB 8.2.6; dependencies {"mongoose":"9.11.4","express":"5.2.1","zod":"4.4.3","@web-ts-toolkit/utils":"0.0.0-PLACEHOLDER","@web-ts-toolkit/express-json-router":"0.0.0-PLACEHOLDER"}. Timed Mongoose 9.11.4 differs from separately pinned installed-consumer Mongoose 9.8.0 / minimum 8.0.0.
