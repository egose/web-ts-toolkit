> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09B H+G redesign measurement — acceptance FAILED; OAR-09 OPEN

One fresh campaign completed **440 jobs / 37,800 measured responses**, with zero job/count/fingerprint failures. **73/90 gates pass**: isolated **45/45**, trusted **28/45**. **2 confirmed-adverse comparisons** and **15 unresolved-sign comparisons** remain (0 overlap). No further optimization/campaign, gate waiver or OAR-10 follows.

## Single fixed campaign and raw reconstruction

- New exclusive evidence/cache/scripts: `_tmp-oar09b-redesigned-d9T17kFx/` only. Accepted ONLY `docs/task-artifacts/access-router/oar09e-guard-final-ncHxXYjL/final-01/FINAL-PROTOCOL.{json,md}` and adjacent read-only artifact/metadata. Comparator remains the ORIGINAL OAR-01 artifact, same bytes with ten old controls OFF/current-default and ON/current-active. No historical owned artifact was executed with new tools.
- UTC **2026-11-02T10:35:20.020Z–2026-11-02T11:06:09.319Z**, foreground wrapper **1852.005 seconds**, CLI exit **1**. Exit 1 is the valid performance gate failure, NOT infrastructure failure. One Mongo/one worker serially with awaited finally cleanup. Exclusive `run-LAUNCHED.json` prevents duplicate launch.
- **360 initial jobs** (45 cases × four profiles × two reversed rounds), then exactly two additional reversed pairs for **20 triggered comparisons** ({'trusted': 20}), adding **80 jobs**. Jobs by round **{'1': 180, '2': 180, '3': 40, '4': 40}**. No increased samples, selective final batch, discarded adverse observations, quiet restart or unchanged-artifact rerun.
- Unchanged primary LIST: 100 rows/24 fields/32 bytes/one client/hook concurrency 10/five warmups/100 samples. Six LIST guard workloads at 10/100 rows use 50 samples; they are distinct from H4. Real HTTP READ ID/filter, H0–H4/global/matching-query, native adapter, own unused-fact cost and 4/24/48 retention remain separate.
- NEW Python `recompute-raw.py` imports NO benchmark module and executes NO old entrypoint. It reconstructs every frozen setting/case/order/repeat trigger, complete expected response/cardinality/denied keys/order, exact+bulk getters on SOURCE and TARGET, hydration/counts, raw median/nearest-rank p95/user+system CPU/request and elapsed, per-pair percent AND ms, and median-of-pairs gates. **37,800/37,800** expected measured fingerprints match; every raw statistic/CLI gate agrees.
- Both artifacts check each response in the new **checked-each-response-v2** series. Historical v1/OAR-01 samples are neither compared directly nor pooled. Legacy LIST latency excludes deep checks but process CPU includes them; owned-workflow latency includes deep checks. Both retain their intended consistent checking overhead per family. Compiler inspection exits before measured heaps.
- `TOOL-WORKLOAD-AUDIT.json` independently compares actual AST gates/catalog/pair/sign/repeat definitions and full worker bodies: identical seeds/routes/requests/selection/checks/retention except explicit count proof metadata and series admission. This is NOT workload/sample/gate relief.
- `RAW-JOB-AUDIT.json` preserves raw user/system CPU, elapsed/counts and hashes of every job/result/log; `RAW-PAIRED-AUDIT.json` all decisions. `ALL-GATES.md`, `PAIR-DETAILS.md`, `INITIAL-REPEAT-FINAL` and `REPEAT-ONLY-SUMMARY` retain every initial N=2, repeat N=0/2, final N=2/4 and failure. Repeat-only never replaces all-four acceptance. `ADVERSE-OBSERVATIONS` preserves all adverse pairs, confirmed or not.

## Protective-default benefit and family coverage

| Family | Cases/profile | Isolated passed | Trusted passed | Jobs including repeats |
|---|---|---|---|---|
| primary | 3 | 3/3 | 3/3 | 24 |
| guard | 12 | 12/12 | 6/12 | 124 |
| read | 10 | 10/10 | 4/10 | 108 |
| helper | 13 | 13/13 | 9/13 | 124 |
| native-adapter | 2 | 2/2 | 1/2 | 20 |
| facts | 2 | 2/2 | 2/2 | 16 |
| retention | 3 | 3/3 | 3/3 | 24 |

All isolated/default primaries improve median AND CPU in BOTH initial pairs, and median paired savings reach >=10% AND 1 ms latency / >=10% AND 0.5 ms CPU. All six primary comparisons pass without repeats. Trusted has no minimum gain requirement; already omitted old-active work is not counted again.

| Case | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | 2 | -63.67% / -21.2938 ms | -61.16% / -22.5626 ms | -62.15% / -23.9463 ms | PASS |
| primary/plain-wide/100 | trusted | 2 | -8.81% / -1.0504 ms | -10.65% / -1.5316 ms | -17.24% / -2.7085 ms | PASS |
| primary/document-rules/100 | isolated | 2 | -92.35% / -164.6736 ms | -91.43% / -170.3394 ms | -91.43% / -170.0425 ms | PASS |
| primary/document-rules/100 | trusted | 2 | -20.12% / -2.7831 ms | -19.92% / -3.2732 ms | -24.93% / -4.2560 ms | PASS |
| primary/embedded/100 | isolated | 2 | -96.20% / -503.4358 ms | -95.86% / -517.5210 ms | -95.68% / -525.2513 ms | PASS |
| primary/embedded/100 | trusted | 2 | -23.38% / -5.4850 ms | -22.09% / -5.9173 ms | -26.18% / -7.4844 ms | PASS |

| Isolated primary | Round | Old → new median ms | Old → new CPU ms/request | Δ median | Δ CPU |
|---|---|---|---|---|---|
| primary/plain-wide/100 | 1 | 33.3912 → 12.1511 | 38.5957 → 14.5351 | -63.61% / -21.2401 ms | -62.34% / -24.0605 ms |
| primary/plain-wide/100 | 2 | 33.4990 → 12.1516 | 38.4658 → 14.6336 | -63.73% / -21.3475 ms | -61.96% / -23.8321 ms |
| primary/document-rules/100 | 1 | 179.6674 → 13.5499 | 186.7210 → 15.8467 | -92.46% / -166.1174 ms | -91.51% / -170.8744 ms |
| primary/document-rules/100 | 2 | 176.9773 → 13.7476 | 185.2299 → 16.0194 | -92.23% / -163.2297 ms | -91.35% / -169.2105 ms |
| primary/embedded/100 | 1 | 521.9265 → 19.8129 | 546.1822 → 23.6398 | -96.20% / -502.1136 ms | -95.67% / -522.5424 ms |
| primary/embedded/100 | 2 | 524.7636 → 20.0056 | 551.7166 → 23.7565 | -96.19% / -504.7580 ms | -95.69% / -527.9602 ms |

## Every failed final gate

Adverse: >10% AND >1 ms median; >15% AND >2 ms p95; >10% AND >0.5 ms CPU. Confirm the SAME metric in >=3/4 pairs AND on its median paired delta. Unresolved sign means fewer than three aligned pairs and fails EVEN near zero. No noise exception.

| Case | Profile | N | Δ median | Δ p95 | Δ CPU | Reasons / per-metric counts |
|---|---|---|---|---|---|---|
| guard/plain-narrow/10 | trusted | 4 | -7.72% / -0.2332 ms | +0.49% / +0.0220 ms | +0.80% / +0.0277 ms | unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| guard/hydrated/10 | trusted | 4 | -2.43% / -0.0966 ms | -3.81% / -0.2196 ms | -1.06% / -0.1075 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 2/4, aligned 2/4 |
| guard/large-config/10 | trusted | 4 | -6.68% / -0.2697 ms | -0.89% / -0.0697 ms | -2.09% / -0.1141 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| guard/populate/10 | trusted | 4 | -0.02% / -0.0012 ms | +0.25% / +0.0181 ms | +8.72% / +0.5388 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| guard/plain-narrow/100 | trusted | 4 | -10.25% / -0.6616 ms | +3.59% / +0.2959 ms | -10.96% / -0.9388 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| guard/populate/100 | trusted | 4 | -5.08% / -0.7587 ms | -1.87% / -0.3260 ms | -13.76% / -2.7805 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| read/http-id/document-rules/100 | trusted | 4 | +0.59% / +0.0143 ms | -1.30% / -0.0488 ms | +2.58% / +0.0724 ms | unresolved sign instability: medianMs; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| read/http-id/virtuals/100 | trusted | 4 | +2.18% / +0.0563 ms | -0.57% / -0.0235 ms | -2.18% / -0.0708 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| read/http-filter/document-rules/100 | trusted | 4 | +0.11% / +0.0031 ms | +3.34% / +0.1278 ms | +2.69% / +0.0773 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| read/http-filter/embedded/100 | trusted | 4 | +2.15% / +0.0588 ms | -0.61% / -0.0255 ms | -3.53% / -0.1192 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| read/http-filter/hydrated/100 | trusted | 4 | +0.24% / +0.0065 ms | +0.25% / +0.0101 ms | +5.48% / +0.1615 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| read/http-filter/virtuals/100 | trusted | 4 | +2.13% / +0.0575 ms | -0.11% / -0.0043 ms | -1.85% / -0.0583 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| helper/H0/100 | trusted | 4 | +0.41% / +0.0087 ms | -0.19% / -0.0063 ms | -3.50% / -0.1008 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| helper/H2-query/100 | trusted | 4 | -4.31% / -0.1118 ms | -1.45% / -0.0542 ms | -2.82% / -0.0865 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| helper/H3-global/10 | trusted | 4 | +12.57% / +0.6701 ms | +7.16% / +0.5174 ms | +18.01% / +1.2266 ms | confirmed adverse: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| helper/H3-global/100 | trusted | 4 | +14.25% / +3.9816 ms | +14.28% / +4.4523 ms | +15.82% / +5.3927 ms | confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest; medianMs: adverse 4/4, aligned 4/4; p95Ms: adverse 2/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| native-adapter/direct-read/100 | trusted | 4 | -1.96% / -0.0409 ms | -5.01% / -0.2009 ms | -7.20% / -0.2112 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |

Trusted H3-global/10 CPU is confirmed in **4/4** pairs; median **+0.6701 ms** is below the 1 ms absolute gate and is NOT confirmed adverse. H3-global/100 median and CPU are confirmed in **4/4**; p95 **+14.28% / +4.4523 ms** misses 15% and crosses both thresholds only 2/4, so is NOT confirmed adverse. All 15 sign-unstable comparisons remain blocking, without a tiny-effect exemption. Architecture/work-count reductions did not guarantee gate success.

## Four artifact campaigns — descriptive separate columns ONLY

`NEW-VS-OLD.{json,md}` lists all 90 comparisons in FOUR separate artifact columns: original **75/90**, OAR-09C **81/90**, OAR-09D **78/90**, H+G **73/90**. Each uses its OWN interleaved matching old baseline. No direct cross-time candidate pairing, pooling, causal attribution, historical gate reinterpretation or blanket performance parity.
**Version/semantic difference:** previous owned candidates used checked-each-response-v1 and 24 H4 field callbacks/full DTO processing. This new campaign uses checked-each-response-v2 and explicit hash-bound facts-only-v1: ZERO H4 output callbacks because it publishes NO DTO. Original old baseline actual H4 remains zero. Guard output-only effects/errors are no longer generated; these measurements are not full-output behavior equivalence.

| Historical confirmed-adverse helper | Profile | Original Δ median / CPU | 09C Δ median / CPU | 09D Δ median / CPU | H+G Δ median / CPU | H+G outcome |
|---|---|---|---|---|---|---|
| helper/H4/100 | trusted | +16.73% / +0.3839 ms; +30.56% / +0.7332 ms | +16.70% / +0.3811 ms; +26.69% / +0.6207 ms | +16.96% / +0.3770 ms; +27.09% / +0.6161 ms | +2.98% / +0.0645 ms; +6.21% / +0.1409 ms | PASS |
| helper/H3-global/10 | trusted | +41.47% / +2.1664 ms; +42.16% / +2.8204 ms | +20.67% / +1.1487 ms; +23.86% / +1.6388 ms | +11.49% / +0.6267 ms; +19.04% / +1.2963 ms | +12.57% / +0.6701 ms; +18.01% / +1.2266 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | +62.12% / +17.4852 ms; +66.76% / +22.6764 ms | +24.98% / +7.2173 ms; +25.09% / +8.7260 ms | +12.85% / +3.6926 ms; +15.54% / +5.5210 ms | +14.25% / +3.9816 ms; +15.82% / +5.3927 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |

## Accepted no-DTO guard proof and its breaking tradeoff

Candidate-only count contract is EXACT `{revision:"facts-only-v1", artifactSha256:"8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e"}`. It is benchmark correctness metadata, not inferred from modes/DTS or a runtime selector. `NEW-COUNTER-PROOF.json` rechecks fresh actual untimed lean/hydrated query/hook-input equivalence, one guard read/hook, ZERO field callbacks/decorations, normal DTO controls **24 callbacks/one decoration**, false→401 and invalid facts→400. Instrumented guards actually close/clear without any output begin. Authentic earlier 24-callback artifact rejection is hash-verified historical proof, not rerun here.
H4 still uses the same HTTP route/body/index/seed/row/selection/fetch/hook/condition/response and one query/one hook. It now omits field/virtual/embedded/target DTO work, output-only postfetch includes, field metadata, decorate/tasks and `_read` overrides, including effects/errors solely there. Source/fact/query/dependency errors and target pre-hook admission remain sticky/controlled. Normal DTO reads keep all output checks. Installed guidance documents the change and the direct service versus generated HTTP operation gate distinction. A separate requested business/DTO read is an explicit extra application operation, never hidden.

| H4 profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|
| isolated | 2 | -18.56% / -0.5443 ms | -15.76% / -0.6489 ms | -15.94% / -0.5033 ms | PASS |
| trusted | 2 | +2.98% / +0.0645 ms | -2.05% / -0.0668 ms | +6.21% / +0.1409 ms | PASS |

## Real READ, fresh helpers and explicit refresh costs

HTTP ID/filter READ returns one row from 100 persisted rows, not relabeled LIST. Direct packed findById/findOne probes retain one findOne read; document rule one hook/24 callbacks, virtuals two getters. READ benefit does not substitute for primary LIST benefit.
H0 presentation subset adds ZERO reads/hooks after its initial read. H1 raw pick/trim/gen/scoped checks use ZERO DB/doc hooks/virtuals; fresh captured global/scoped policy, isolated existing source and immutable EMPTY facts remain. Metadata/DTO/replay never restores document authority. At 100 independent raw helpers, fresh probes retain **100 captures/catalogs/stages, 2,400 field checks, 100 isolated source copies**, zero query expansions/compactions/reference origins/unused callback views/resolver promises. Shared evaluator/selection/materializer remain.
H2 document freshness adds **one normal read/one hook**: two total. H3 adds **one batched read/rows hooks**, not per-row lookups: two total batches/twice rows hooks. H2/H3-global remain global-only, with zero additional helper DB/hooks. EMPTY predicates are not current document authority; selected-value checks still run.
All **6/6** extra-read allowances pass. Comparator = OLD initial query+reuse PLUS matching OLD fresh query medians/CPU, then fixed 10% AND 1 ms median / 10% AND 0.5 ms CPU allowance. Component sums are an allowance, NOT a latency distribution or synthetic p95; directly observed new p95 is below. Added reads remain a breaking-contract cost, not a claimed speedup.

| Recipe | Profile | Round | Old flow median | Matching OLD query median | New median / observed p95 | New CPU | Δ allowance median | Δ allowance CPU |
|---|---|---|---|---|---|---|---|---|
| helper/H2/100 | isolated | 1 | 5.7320 | 4.9343 | 3.9801 / 5.1187 | 4.4877 | -62.69% / -6.6862 ms | -63.96% / -7.9630 ms |
| helper/H2/100 | isolated | 2 | 5.7191 | 4.7406 | 4.0162 / 5.3217 | 4.3038 | -61.60% / -6.4435 ms | -66.01% / -8.3577 ms |
| helper/H2/100 | trusted | 1 | 2.6793 | 2.5729 | 3.8708 / 5.4374 | 4.2617 | -26.30% / -1.3814 ms | -29.80% / -1.8094 ms |
| helper/H2/100 | trusted | 2 | 2.6267 | 2.6272 | 3.8613 / 5.4514 | 4.3936 | -26.51% / -1.3927 ms | -30.89% / -1.9639 ms |
| helper/H3/10 | isolated | 1 | 29.5786 | 21.6513 | 6.1153 / 8.4486 | 7.2462 | -88.06% / -45.1145 ms | -86.62% / -46.9028 ms |
| helper/H3/10 | isolated | 2 | 29.8922 | 21.3396 | 6.3439 / 8.3791 | 7.3116 | -87.62% / -44.8879 ms | -86.53% / -46.9757 ms |
| helper/H3/10 | trusted | 1 | 5.4823 | 4.0366 | 5.6190 / 8.0669 | 6.5729 | -40.97% / -3.8999 ms | -46.96% / -5.8199 ms |
| helper/H3/10 | trusted | 2 | 5.3903 | 3.7543 | 5.6179 / 7.9964 | 6.5380 | -38.57% / -3.5267 ms | -43.55% / -5.0432 ms |
| helper/H3/100 | isolated | 1 | 265.6505 | 179.3686 | 28.0964 / 30.9083 | 30.9657 | -93.69% / -416.9228 ms | -93.48% / -443.6080 ms |
| helper/H3/100 | isolated | 2 | 261.9090 | 181.6440 | 27.1379 / 29.7965 | 30.2190 | -93.88% / -416.4151 ms | -93.64% / -444.8274 ms |
| helper/H3/100 | trusted | 1 | 28.5744 | 15.2922 | 22.5059 / 25.0753 | 24.4849 | -48.69% / -21.3607 ms | -53.78% / -28.4927 ms |
| helper/H3/100 | trusted | 2 | 28.3882 | 15.6072 | 22.3434 / 24.7646 | 24.3361 | -49.21% / -21.6521 ms | -54.95% / -29.6880 ms |

| Helper comparable case | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| helper/H0/100 | isolated | 2 | -47.37% / -2.2548 ms | -40.24% / -2.4067 ms | -46.57% / -2.6061 ms | PASS |
| helper/H0/100 | trusted | 4 | +0.41% / +0.0087 ms | -0.19% / -0.0063 ms | -3.50% / -0.1008 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| helper/H1/100 | isolated | 2 | -50.46% / -1.6414 ms | -45.61% / -2.2467 ms | -48.17% / -1.9673 ms | PASS |
| helper/H1/100 | trusted | 2 | -52.24% / -1.7663 ms | -51.57% / -2.6922 ms | -49.77% / -2.0610 ms | PASS |
| helper/H1-scoped/100 | isolated | 2 | -19.83% / -0.2700 ms | -17.87% / -0.3654 ms | -20.95% / -0.3544 ms | PASS |
| helper/H1-scoped/100 | trusted | 2 | -22.42% / -0.3182 ms | -31.46% / -0.6535 ms | -27.34% / -0.4455 ms | PASS |
| helper/H2-query/100 | isolated | 2 | -47.27% / -2.2879 ms | -38.67% / -2.4064 ms | -50.15% / -2.9326 ms | PASS |
| helper/H2-query/100 | trusted | 4 | -4.31% / -0.1118 ms | -1.45% / -0.0542 ms | -2.82% / -0.0865 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H2-global/100 | isolated | 2 | -50.99% / -2.9213 ms | -44.99% / -3.3436 ms | -51.26% / -3.4721 ms | PASS |
| helper/H2-global/100 | trusted | 4 | +6.35% / +0.1688 ms | +5.19% / +0.2007 ms | +6.76% / +0.2109 ms | PASS |
| helper/H4/100 | isolated | 2 | -18.56% / -0.5443 ms | -15.76% / -0.6489 ms | -15.94% / -0.5033 ms | PASS |
| helper/H4/100 | trusted | 2 | +2.98% / +0.0645 ms | -2.05% / -0.0668 ms | +6.21% / +0.1409 ms | PASS |
| helper/H3-query/10 | isolated | 2 | -81.99% / -17.6235 ms | -76.27% / -17.8255 ms | -78.39% / -17.8733 ms | PASS |
| helper/H3-query/10 | trusted | 2 | -12.32% / -0.4828 ms | -11.62% / -0.6737 ms | -16.10% / -0.8354 ms | PASS |
| helper/H3-global/10 | isolated | 2 | -79.08% / -22.8037 ms | -74.22% / -23.0292 ms | -73.14% / -22.1960 ms | PASS |
| helper/H3-global/10 | trusted | 4 | +12.57% / +0.6701 ms | +7.16% / +0.5174 ms | +18.01% / +1.2266 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-query/100 | isolated | 2 | -91.67% / -165.4725 ms | -91.32% / -176.5167 ms | -90.99% / -175.3726 ms | PASS |
| helper/H3-query/100 | trusted | 2 | -20.69% / -3.1980 ms | -18.13% / -3.2337 ms | -24.88% / -4.6223 ms | PASS |
| helper/H3-global/100 | isolated | 2 | -87.09% / -222.8993 ms | -86.39% / -232.6249 ms | -84.96% / -231.7025 ms | PASS |
| helper/H3-global/100 | trusted | 4 | +14.25% / +3.9816 ms | +14.28% / +4.4523 ms | +15.82% / +5.3927 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |

## Native adapter and eager unused facts — explicit limits

Native READ/LIST: **ZERO Mongo reads / ONE explicit Mongoose Query adapter call**. Actual native hook counts are one/100 respectively. Full Date/Buffer/ObjectId/Code.scope/DBRef.fields/nested Map/array values, selected/denied keys/cardinality/order match. Untimed bounded/native/wire/depleted failures remain controlled 400/no partial output; no overflowing traversal is timed. Adapter numbers are not real Mongo latency. Persisted native/minimum-current peer coverage belongs to unchanged latest V3/V7 evidence.

| Family | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| native-adapter/direct-read/100 | isolated | 2 | -80.44% / -8.2265 ms | -72.68% / -8.6498 ms | -73.77% / -8.1432 ms | PASS |
| native-adapter/direct-read/100 | trusted | 4 | -1.96% / -0.0409 ms | -5.01% / -0.2009 ms | -7.20% / -0.2112 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| native-adapter/direct-list/100 | isolated | 2 | -96.98% / -742.9511 ms | -96.71% / -762.2448 ms | -96.65% / -771.2825 ms | PASS |
| native-adapter/direct-list/100 | trusted | 2 | -18.90% / -3.4774 ms | -18.89% / -4.0423 ms | -19.73% / -4.5019 ms | PASS |
| facts/owner-only/100 | isolated | 2 | -92.48% / -163.0286 ms | -92.09% / -177.7618 ms | -91.76% / -173.2804 ms | PASS |
| facts/owner-only/100 | trusted | 2 | -24.94% / -3.5095 ms | -23.49% / -3.8688 ms | -27.13% / -4.4807 ms | PASS |
| facts/unused-checksum/100 | isolated | 2 | -87.19% / -163.9235 ms | -86.72% / -173.3179 ms | -86.66% / -170.6808 ms | PASS |
| facts/unused-checksum/100 | trusted | 2 | -12.14% / -3.0096 ms | -10.96% / -2.9908 ms | -13.75% / -3.7368 ms | PASS |

Unused fact computes exactly **100 × 10,000 deterministic iterations/request**, one computation per hook, independent of 24 fields. Raw checksum is independently verified. OWN owner-only→unused deltas, not primary-LIST subtraction; eager external/freshness costs remain application-specific.

| Profile | Round | Own Δ median | Own Δ CPU | Work/request |
|---|---|---|---|---|
| current-default | 1 | +5.22% / +9.2341 ms | +2.15% / +4.0739 ms | 100 × 10,000 |
| current-default | 2 | +8.07% / +14.1960 ms | +6.45% / +12.1264 ms | 100 × 10,000 |
| current-active | 1 | +75.43% / +10.6967 ms | +64.17% / +10.7058 ms | 100 × 10,000 |
| current-active | 2 | +76.95% / +10.7392 ms | +64.92% / +10.6043 ms | 100 × 10,000 |
| isolated | 1 | +80.21% / +10.7769 ms | +63.01% / +10.1441 ms | 100 × 10,000 |
| isolated | 2 | +83.01% / +10.8634 ms | +74.93% / +11.2554 ms | 100 × 10,000 |
| trusted | 1 | +106.40% / +11.1755 ms | +94.30% / +11.3045 ms | 100 × 10,000 |
| trusted | 2 | +106.06% / +11.2601 ms | +95.22% / +11.4934 ms | 100 × 10,000 |

## Retained heap and actual lifecycle/work observations

All **six held/released heap gates pass**, no heap repeats. Fixed 100 rows/4,24,48 fields, --expose-gc, three GCs/observation, four cycles × five operations, actually held DTO rows and final released observation. Maximum candidate-minus-baseline positive-clamped own-start growth **0 bytes**. Repeated >15% AND >1 MiB would block; it is not waived. Retained bytes are NOT allocation counts.

| Profile | Fields | Rounds | Starting heap KiB | Median held growth KiB | Median released growth KiB |
|---|---|---|---|---|---|
| current-default | 4 | 1 / 2 | 38594.48 / 38611.16 | +145.76 / +144.62 | -362.52 / -364.82 |
| current-default | 24 | 1 / 2 | 35601.23 / 35837.45 | +860.37 / +859.05 | -356.43 / -357.16 |
| current-default | 48 | 1 / 2 | 35551.48 / 35808.16 | +1702.01 / +1704.55 | -381.18 / -391.14 |
| current-active | 4 | 1 / 2 | 38761.79 / 38765.11 | +99.30 / +99.93 | -378.59 / -378.49 |
| current-active | 24 | 1 / 2 | 39101.71 / 39110.03 | +800.32 / +806.68 | -389.60 / -387.71 |
| current-active | 48 | 1 / 2 | 39486.55 / 39584.00 | +1642.89 / +1648.98 | -391.34 / -393.71 |
| isolated | 4 | 1 / 2 | 38068.14 / 38056.67 | -178.01 / -176.81 | -282.65 / -281.57 |
| isolated | 24 | 1 / 2 | 38365.91 / 38362.70 | -59.29 / -57.52 | -279.60 / -277.21 |
| isolated | 48 | 1 / 2 | 38773.39 / 38734.91 | +52.17 / +51.79 | -280.25 / -278.45 |
| trusted | 4 | 1 / 2 | 37577.55 / 37631.61 | -106.09 / -122.06 | -208.80 / -208.14 |
| trusted | 24 | 1 / 2 | 37944.95 / 37948.84 | +0.28 / -2.68 | -194.97 / -197.75 |
| trusted | 48 | 1 / 2 | 38323.26 / 38680.88 | +92.49 / +110.68 | -204.35 / -204.08 |

Fresh instrumented 6-row/one-embedded-child probes observe six raw fact normalizations, 24/144/288 actual field callbacks and **12 resolved/closed/cleared stages** per ordinary operation. Whole-source views stay isolated 12/12/12, trusted 0/0/0; no per-field whole-fact/source graph copy is observed. Memo evaluation scales with selected fields (66/306/594 calls), not retained field-times-root graphs. This bounded observation is not universal superlinearity proof.
NEW untimed private-copy `STAGE-PROJECTION-CLEAR-AUDIT.json` observes actual frozen access/view creation AND clearing: per mode **153 installed projections / 155 actual stage clears** across ordinary widths, 1/10/100 fresh helpers and guard/DTO/negative/invalid controls. The two invalid-fact stages close before projection creation. Every actual cleared record is closed with empty memo and undefined source/facts/access/view/call/binding/publication/owning/result; positive guards have no DTO output begin. Same response/counter fingerprints as campaign, no new performance samples or accepted tool/artifact changes.

## Identity, scoped gate reuse and preservation

Before/after campaign seals and `IDENTITY-entry/before-rebuild/after-rebuild.json` match **626 candidate / 552 baseline files, 579 source records, 13 sealed tools, all 67 exact dist paths/hashes, 134 external packages/3,510 files, 293 tool packages/10,545 files**, Node/pnpm/Mongo binaries and lock. **1,627,782 earlier paths** retain mode/size/mtime/ctime/link; all **1,984 incoming file hashes** and user committed test formatting remain unchanged. Three complete failed campaigns/old candidates/caches/old tool seals are preserved; 1,861 earlier candidate file records and historical raw stream manifests rehashed. Efficient stat snapshot, no giant cache clone.
The ONLY build after timing: `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build` using fresh private pnpm cache/store. Six necessary packages serially; **all 67 outputs match exact NEW metadata**, including parsers-C-l2rHq-.d.ts/.d.mts. No old artifact, root-wide build/lint/tests, install or unrelated build.
Reused, NOT rerun, actual metadata-pinned completed latest gates: **5,957 core / 185 files, 742 deco / 23 files, 45 runner tests**, zero failures/pending/skips/cancellations; types/scoped lint/format/diff logs and source chronology/hash equality rechecked. NOT the older 5,869/44 results. Both unchanged 16-case remediation suites plus new 27 helper/46 guard unit/14 Mongo cases remain. Accepted correctness smoke **180 jobs/eight preflights/360 expected full fingerprints** is hash-verified, not substituted for this performance campaign.
Actual V7 installed/tarball bytes rehashed: **176 core/27 deco consumer/doc/export cases**; 20 guide executions/60 HTTP/80 reads+hooks and 40 expected-failure compiles. All **seven exact TypeScript guide blocks** and new guard/business-read example checked. Actual minimum Express 5.0.0/Mongoose 8.0.0 keeps skipLibCheck:true; current 5.2.1/9.8.0 uses false, TS 6.0.3, five strict module forms/tarball and artifact-tree layouts. All 14 core outputs/eight declarations, NEW shared chunks, README/MIGRATION/llms match installed/four 19-file tarballs; no src/test/private exports leak. Runtime ESM/CJS export sets exactly **46/48/6**.
Current AND measured ESM **`8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e`**; original baseline `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`. Metadata **`7cdfae3120228645865dffad8894a15d8cbc3a67a7a4c77db358ae3b6be45f43`**, protocol **`052386cd6a0f1e8ab5461e64dc7302daefc7b86dc4f24cf1088d6af4f21a4ad8`**. HEAD `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca` and lock `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged. Pinned Node 26.12.1 / pnpm 11.18.0 / Mongo 8.2.6 identities match.
Preserved audit-only failure: identity-before-01 initially treated copied dist documentation/metadata as executable outputs when expecting 14 core runtime/declaration files. The corrected suffix-filter auditor (failed original saved) checks all 67 dist records separately and all 14 executable/declaration files. No product, artifact, timing or gate changed; identity-before-02 and identity-after-01 pass. Untimed expected invalid-fact 400 controls print terminal error stacks; their asserted statuses and stage cleanup pass.
**Unavailable:** true allocation counts and Mongo server CPU. Two/four pairs are a bounded reproducibility screen, not statistical significance/CI, universal speedup, production representativeness, historical security equivalence or blanket parity. Callback closures/native plugin behavior and external transactional freshness remain outside library ownership.

## Disposition

**Measurement/evidence delivered; OAR-09 remains OPEN / NOT performance-accepted.** Preserve all **17 failed trusted gates**: two confirmed helper-adverse comparisons and all fifteen sign-unstable comparisons. The broader redesign is authorized, not a gate waiver or guarantee; no automatic optimization, further unchanged-artifact campaign, sample/gate change or OAR-10 is authorized by this packet. Coordinator owns task/status reconciliation and explicit next disposition. No task edits, delegation, commit/publish, dependency/lock changes, reverts, old artifact/evidence/cache writes or workspace-wide checks occurred. No owned jobs remain.
