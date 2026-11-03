> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09B final-remediation measurement: acceptance FAILED; OAR-09 OPEN

The single fresh campaign completed **444 jobs / 38,800 measured responses**, zero job/count/fingerprint failures. **78/90 gates pass**: isolated **45/45**, trusted **33/45**. There are **3 confirmed-adverse comparisons** and **10 unresolved-sign comparisons**, with **1 overlap**. Full correctness, default benefits and heap passes do not waive these failures. No additional campaign, optimization, threshold change or OAR-10 was started.

## Exact fixed campaign / independent raw reconstruction

- New evidence ONLY `_tmp-oar09b-final-remediation-RJZ1phN3/`. Accepted ONLY `docs/task-artifacts/access-router/oar09d-hVF7iALN/final-01/FINAL-PROTOCOL.{json,md}` and adjacent candidate/metadata. The original OAR-01 sealed bytes are used twice: ten controls OFF for current-default and ON for current-active. No OAR-09A/09C older candidate was measured here.
- UTC **2026-11-02T03:27:59.977Z–2026-11-02T03:59:09.976Z**, foreground wrapper **1872.719 seconds**, exit **1**: valid gate failure, not infrastructure failure. One Mongo and one worker serially; finally cleanup awaited. `plan-LAUNCHED.json` and `run-LAUNCHED.json` guard against relaunch.
- 45 cases × four profiles × two reversed rounds = **360 initial jobs**. Exactly **two additional reversed pairs** for **21 triggered comparisons** ({'trusted': 20, 'isolated': 1}) add **84 jobs**. Round jobs **{'1': 180, '2': 180, '3': 42, '4': 42}**. No selective cases, samples increase, discarded observations, quieter rerun or unchanged-artifact rerun.
- Three unchanged primary LISTs: 100 rows/24 fields/32 bytes, one client, hook concurrency 10, five warmups/100 samples. Six guards each at 10/100 rows use 50 samples. Real READ ID/filter, H0–H4/global/matching-query, native adapters, owner/unused facts and 4/24/48-field retention remain separate.
- NEW standalone `recompute-raw.py` executes NO old entrypoint and imports NO benchmark module. It independently reconstructs all 45 cases, every setting/order/trigger, expected full response/cardinality/denials/order, actual hydration/exact+bulk getters on source AND target, all counts, raw median/nearest-rank p95/user+system CPU and elapsed, paired percent AND ms and median-of-pairs gates. **38,800/38,800 measured full fingerprints match**, and every raw metric/gate agrees with CLI.
- Both frozen workers validate full responses before, after warmup, after measurement and on every measured response. `checked-each-response-v1` is NOT the historical OAR-01 row-count-only timing series. Legacy LIST latency excludes deep checks while its process CPU includes them; owned workflow latency includes checks. Compiler inspection runs outside the measured heap. No historical samples pooled.
- `RAW-JOB-AUDIT.json` preserves raw user/system CPU, elapsed, counts/fingerprints and job/log hashes; `RAW-PAIRED-AUDIT.json` all pairs and decisions. `ALL-GATES.md`, `PAIR-DETAILS.md`, `INITIAL-REPEAT-FINAL.{json,md}` and `REPEAT-ONLY-SUMMARY.{json,md}` retain initial N=2/repeat N=0 or 2/final N=2 or 4, including every failure. Repeat-only is descriptive, never a replacement gate. `ADVERSE-OBSERVATIONS` keeps unconfirmed adverse pairs too.

## Coverage and primary protective-default benefit

| Family | Cases/profile | Isolated passed | Trusted passed | Jobs incl repeats |
|---|---|---|---|---|
| primary | 3 | 3/3 | 3/3 | 28 |
| guard | 12 | 12/12 | 11/12 | 112 |
| read | 10 | 10/10 | 5/10 | 112 |
| helper | 13 | 13/13 | 8/13 | 132 |
| native-adapter | 2 | 2/2 | 1/2 | 20 |
| facts | 2 | 2/2 | 2/2 | 16 |
| retention | 3 | 3/3 | 3/3 | 24 |

All three isolated/default primaries improve median AND CPU in BOTH initial pairs; median paired savings meet >=10% AND 1 ms latency and >=10% AND 0.5 ms CPU. No primary isolated repeats were needed. Trusted has no minimum gain requirement and gets no credit for copying old-active already omitted.

| Case | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | 2 | -63.75% / -21.8186 ms | -62.32% / -23.7348 ms | -62.70% / -24.8806 ms | PASS |
| primary/plain-wide/100 | trusted | 4 | -11.20% / -1.3671 ms | -12.75% / -1.8448 ms | -19.08% / -3.0237 ms | PASS |
| primary/document-rules/100 | isolated | 2 | -92.41% / -165.1150 ms | -91.90% / -180.0678 ms | -91.65% / -173.5365 ms | PASS |
| primary/document-rules/100 | trusted | 2 | -23.02% / -3.2645 ms | -27.16% / -4.6602 ms | -28.48% / -5.0247 ms | PASS |
| primary/embedded/100 | isolated | 2 | -96.21% / -508.2274 ms | -95.93% / -521.1703 ms | -95.78% / -531.5988 ms | PASS |
| primary/embedded/100 | trusted | 2 | -24.48% / -5.7953 ms | -22.73% / -6.1421 ms | -27.92% / -8.1394 ms | PASS |

| Isolated primary | Round | Old → new median ms | Old → new CPU ms/request | Δ median | Δ CPU |
|---|---|---|---|---|---|
| primary/plain-wide/100 | 1 | 33.6600 → 12.1475 | 38.9981 → 14.5610 | -63.91% / -21.5125 ms | -62.66% / -24.4371 ms |
| primary/plain-wide/100 | 2 | 34.7935 → 12.6688 | 40.3680 → 15.0439 | -63.59% / -22.1247 ms | -62.73% / -25.3241 ms |
| primary/document-rules/100 | 1 | 178.1751 → 13.7202 | 188.5711 → 15.8523 | -92.30% / -164.4549 ms | -91.59% / -172.7188 ms |
| primary/document-rules/100 | 2 | 179.1590 → 13.3839 | 190.1232 → 15.7690 | -92.53% / -165.7751 ms | -91.71% / -174.3541 ms |
| primary/embedded/100 | 1 | 524.2339 → 20.0165 | 551.7944 → 23.4665 | -96.18% / -504.2174 ms | -95.75% / -528.3279 ms |
| primary/embedded/100 | 2 | 532.2214 → 19.9841 | 558.2028 → 23.3330 | -96.25% / -512.2374 ms | -95.82% / -534.8698 ms |

## Every failed final comparison — trusted versus old-active

Adverse requires >10% AND >1 ms median; >15% AND >2 ms p95; >10% AND >0.5 ms CPU. Confirm SAME metric in >=3/4 pairs AND on median paired delta. Unresolved sign (<3 aligned pairs) fails independently, even near zero. No automatic noise waiver.

| Case | N | Δ median | Δ p95 | Δ CPU | Reasons / per-metric counts |
|---|---|---|---|---|---|
| guard/virtuals/10 | 4 | +1.90% / +0.0845 ms | -3.38% / -0.2095 ms | -1.03% / -0.0620 ms | unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| read/http-id/document-rules/100 | 4 | +2.05% / +0.0540 ms | +1.44% / +0.0488 ms | +1.48% / +0.0427 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| read/http-id/hydrated/100 | 4 | -0.36% / -0.0093 ms | -5.81% / -0.2233 ms | +0.03% / +0.0005 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| read/http-id/virtuals/100 | 4 | +0.65% / +0.0183 ms | -2.88% / -0.1219 ms | -0.86% / -0.0268 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| read/http-filter/document-rules/100 | 4 | -2.99% / -0.0823 ms | -2.15% / -0.0773 ms | +1.31% / +0.0372 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| read/http-filter/virtuals/100 | 4 | -1.37% / -0.0375 ms | +0.72% / +0.0175 ms | -3.18% / -0.1019 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| helper/H2-query/100 | 4 | -4.50% / -0.1209 ms | -2.08% / -0.0823 ms | -0.69% / -0.0205 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| helper/H2-global/100 | 4 | +1.07% / +0.0291 ms | -0.35% / -0.0146 ms | +7.83% / +0.2508 ms | unresolved sign instability: medianMs; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 1/4, aligned 4/4 |
| helper/H4/100 | 4 | +16.96% / +0.3770 ms | +10.94% / +0.3703 ms | +27.09% / +0.6161 ms | confirmed adverse: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 3/4, aligned 4/4 |
| helper/H3-global/10 | 4 | +11.49% / +0.6267 ms | +1.46% / +0.1213 ms | +19.04% / +1.2963 ms | confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| helper/H3-global/100 | 4 | +12.85% / +3.6926 ms | +13.90% / +4.3507 ms | +15.54% / +5.5210 ms | confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest; medianMs: adverse 3/4, aligned 4/4; p95Ms: adverse 1/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| native-adapter/direct-read/100 | 4 | -0.47% / -0.0092 ms | +5.00% / +0.1467 ms | +1.48% / +0.0428 ms | unresolved sign instability: medianMs; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |

H4 median +0.3770 ms is below its absolute gate; CPU +0.6161 ms is not. H3-global/10 median +0.6267 ms is below 1 ms, but CPU is confirmed and p95 is sign-unstable. H3-global/100 p95 +13.90% / +4.3507 ms misses the 15% threshold, so is NOT confirmed adverse; median and CPU ARE confirmed. No percent-only or ms-only regression is invented.

## Original, first-remediation and final-remediation artifacts — NOT pooled

`NEW-VS-OLD.{json,md}` lists ALL 90 comparisons with each campaign’s own initial/final N, deltas and reasons. Original **75/90**, first remediation **81/90**, current **78/90**. These are separate measurements against each own interleaved baseline, NOT direct cross-time candidate pairs, pooled statistics, a causal estimate, or reclassification of prior failures.

| Previously confirmed adverse in either old campaign | Original Δ median / CPU | OAR09C Δ median / CPU | OAR09D Δ median / CPU | Current outcome |
|---|---|---|---|---|
| primary/plain-wide/100 | +14.35% / +1.6983 ms; -2.11% / -0.3383 ms | -8.90% / -1.0776 ms; -18.09% / -2.8685 ms | -11.20% / -1.3671 ms; -19.08% / -3.0237 ms | PASS |
| guard/virtuals/10 | +13.92% / +0.6188 ms; +26.63% / +1.4311 ms | +5.48% / +0.2410 ms; +8.97% / +0.4769 ms | +1.90% / +0.0845 ms; -1.03% / -0.0620 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/100 | +11.05% / +1.5276 ms; -0.20% / -0.0356 ms | -8.15% / -1.1436 ms; -15.95% / -3.0772 ms | -10.89% / -1.5382 ms; -16.79% / -3.1943 ms | PASS |
| guard/populate/100 | +16.15% / +2.3490 ms; +4.27% / +0.8464 ms | -6.23% / -0.9347 ms; -12.26% / -2.4207 ms | -5.32% / -0.8048 ms; -13.43% / -2.6867 ms | PASS |
| guard/virtuals/100 | +32.40% / +4.8352 ms; +15.69% / +3.2121 ms | +6.89% / +1.0323 ms; -1.91% / -0.3897 ms | +7.86% / +1.1666 ms; -1.27% / -0.2666 ms | PASS |
| helper/H2-global/100 | +11.04% / +0.3153 ms; +19.18% / +0.6127 ms | +2.37% / +0.0680 ms; +7.51% / +0.2431 ms | +1.07% / +0.0291 ms; +7.83% / +0.2508 ms | FAIL: unresolved sign instability: medianMs |
| helper/H4/100 | +16.73% / +0.3839 ms; +30.56% / +0.7332 ms | +16.70% / +0.3811 ms; +26.69% / +0.6207 ms | +16.96% / +0.3770 ms; +27.09% / +0.6161 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | +41.47% / +2.1664 ms; +42.16% / +2.8204 ms | +20.67% / +1.1487 ms; +23.86% / +1.6388 ms | +11.49% / +0.6267 ms; +19.04% / +1.2963 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/100 | +62.12% / +17.4852 ms; +66.76% / +22.6764 ms | +24.98% / +7.2173 ms; +25.09% / +8.7260 ms | +12.85% / +3.6926 ms; +15.54% / +5.5210 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |

The same three helper comparisons remain confirmed adverse on this new artifact. Work reductions from OAR-09D diagnostics are not substituted for these end-to-end gates. All prior failed gates remain preserved regardless of the different signs/cases in this campaign.

## Real READ, raw helpers and disclosed current-authority refresh cost

HTTP ID/filter routes return one row from 100 persisted rows, not a relabeled LIST. Both packed direct findById/findOne probes also pass: one findOne read, doc-rule one hook/24 callbacks, virtuals two getters. Read gates: isolated 10/10; trusted 5/10. READ benefit never replaces LIST acceptance.
H0 presentation subset adds ZERO reads/hooks after its initial query. H1 fresh pick/trim/gen and scoped output authorization use ZERO DB reads/doc hooks/virtuals. Raw helpers capture fresh global/scoped output policy, ISOLATED output-only source and frozen EMPTY document facts; metadata/DTO/replay cannot recover authority. EMPTY is not current document authority; negative predicates may allow under EMPTY.
H2: old one query/one hook + handle reuse versus new TWO normal queries/TWO hooks. H3: old one batch/rows hooks versus new TWO batches/twice rows hooks; never rows individual reads. H2/H3-global stay global-only with zero helper extra reads. H4 retains one query/one doc hook and **24 output callbacks**, unchanged selection, no hidden second read. Candidate READ-origin retry performs two adapter reads/one hook; terminal 400/403 zero reads. Actual source/target, actor/freshness/denied getter/metadata probes passed.
All **6/6** extra-read allowances pass. Comparator = OLD initial-query+reuse median/CPU PLUS matching OLD normal query, then fixed >10% AND >1 ms median / >10% AND >0.5 ms CPU adverse allowance. Component medians/CPU are an explicit cost allowance, NOT a distribution or synthetic p95. New direct observed p95 is shown. Added normal read remains a breaking-contract cost, not a speedup.

| Recipe | Profile | Round | Old reuse median | Matching OLD query median | New median / observed p95 ms | New CPU ms | Δ allowance median | Δ allowance CPU |
|---|---|---|---|---|---|---|---|---|
| helper/H2/100 | isolated | 1 | 6.2112 | 4.9688 | 4.0975 / 5.5996 | 4.4007 | -63.35% / -7.0825 ms | -66.39% / -8.6929 ms |
| helper/H2/100 | isolated | 2 | 5.8298 | 4.9523 | 4.1439 / 5.6968 | 4.4276 | -61.57% / -6.6382 ms | -64.83% / -8.1602 ms |
| helper/H2/100 | trusted | 1 | 2.9594 | 2.7011 | 4.2852 / 5.8932 | 4.5307 | -24.30% / -1.3753 ms | -29.03% / -1.8533 ms |
| helper/H2/100 | trusted | 2 | 2.8228 | 2.6703 | 4.0556 / 5.6268 | 4.5786 | -26.17% / -1.4375 ms | -26.10% / -1.6174 ms |
| helper/H3/10 | isolated | 1 | 30.5610 | 21.6544 | 6.3501 / 8.5090 | 7.3509 | -87.84% / -45.8654 ms | -86.62% / -47.5695 ms |
| helper/H3/10 | isolated | 2 | 30.3458 | 21.6674 | 6.5360 / 9.2739 | 7.8012 | -87.43% / -45.4771 ms | -85.72% / -46.8214 ms |
| helper/H3/10 | trusted | 1 | 5.5610 | 4.2304 | 5.8273 / 7.8007 | 6.6411 | -40.49% / -3.9641 ms | -45.64% / -5.5759 ms |
| helper/H3/10 | trusted | 2 | 5.6584 | 4.1395 | 6.1188 / 8.6317 | 6.7998 | -37.55% / -3.6791 ms | -45.30% / -5.6323 ms |
| helper/H3/100 | isolated | 1 | 267.6282 | 180.9307 | 27.6833 / 29.2828 | 30.2245 | -93.83% / -420.8756 ms | -93.70% / -449.6212 ms |
| helper/H3/100 | isolated | 2 | 267.1900 | 177.6448 | 26.9142 / 28.7677 | 29.4918 | -93.95% / -417.9206 ms | -93.80% / -446.2977 ms |
| helper/H3/100 | trusted | 1 | 29.2950 | 15.7940 | 21.9499 / 23.8896 | 23.9280 | -51.32% / -23.1392 ms | -56.18% / -30.6805 ms |
| helper/H3/100 | trusted | 2 | 28.5700 | 15.5006 | 22.2101 / 23.9395 | 24.5691 | -49.60% / -21.8605 ms | -53.04% / -27.7537 ms |

| Helper/global/matching-query comparable case | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| helper/H0/100 | isolated | 2 | -46.90% / -2.3113 ms | -38.38% / -2.4655 ms | -49.04% / -2.8100 ms | PASS |
| helper/H0/100 | trusted | 4 | -4.59% / -0.1215 ms | -7.00% / -0.2736 ms | -4.65% / -0.1376 ms | PASS |
| helper/H1/100 | isolated | 2 | -53.88% / -1.8866 ms | -50.75% / -2.6481 ms | -50.56% / -2.1913 ms | PASS |
| helper/H1/100 | trusted | 2 | -53.09% / -1.8121 ms | -50.07% / -2.6524 ms | -49.89% / -2.1029 ms | PASS |
| helper/H1-scoped/100 | isolated | 4 | -24.90% / -0.3535 ms | -16.14% / -0.3252 ms | -26.30% / -0.4328 ms | PASS |
| helper/H1-scoped/100 | trusted | 2 | -22.43% / -0.3112 ms | -20.07% / -0.4323 ms | -19.61% / -0.3154 ms | PASS |
| helper/H2-query/100 | isolated | 2 | -48.58% / -2.4095 ms | -38.62% / -2.6065 ms | -49.02% / -2.8758 ms | PASS |
| helper/H2-query/100 | trusted | 4 | -4.50% / -0.1209 ms | -2.08% / -0.0823 ms | -0.69% / -0.0205 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-global/100 | isolated | 2 | -50.15% / -2.9060 ms | -43.02% / -3.2422 ms | -50.73% / -3.4698 ms | PASS |
| helper/H2-global/100 | trusted | 4 | +1.07% / +0.0291 ms | -0.35% / -0.0146 ms | +7.83% / +0.2508 ms | FAIL: unresolved sign instability: medianMs |
| helper/H4/100 | isolated | 2 | -7.19% / -0.2077 ms | -9.51% / -0.4080 ms | -8.37% / -0.2822 ms | PASS |
| helper/H4/100 | trusted | 4 | +16.96% / +0.3770 ms | +10.94% / +0.3703 ms | +27.09% / +0.6161 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-query/10 | isolated | 2 | -81.14% / -17.5766 ms | -75.03% / -17.4422 ms | -77.89% / -17.7268 ms | PASS |
| helper/H3-query/10 | trusted | 2 | -11.84% / -0.4972 ms | -10.70% / -0.6414 ms | -14.53% / -0.7633 ms | PASS |
| helper/H3-global/10 | isolated | 2 | -77.97% / -23.0110 ms | -72.78% / -22.8496 ms | -72.24% / -22.3889 ms | PASS |
| helper/H3-global/10 | trusted | 4 | +11.49% / +0.6267 ms | +1.46% / +0.1213 ms | +19.04% / +1.2963 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-query/100 | isolated | 2 | -91.69% / -164.3849 ms | -91.07% / -174.0387 ms | -91.01% / -174.2547 ms | PASS |
| helper/H3-query/100 | trusted | 2 | -22.08% / -3.4563 ms | -21.84% / -3.7974 ms | -25.57% / -4.7373 ms | PASS |
| helper/H3-global/100 | isolated | 2 | -87.04% / -221.7056 ms | -86.38% / -228.7520 ms | -84.79% / -229.5445 ms | PASS |
| helper/H3-global/100 | trusted | 4 | +12.85% / +3.6926 ms | +13.90% / +4.3507 ms | +15.54% / +5.5210 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |

## Native adapter and eager unused facts — separate families

Native direct READ/LIST have ZERO Mongo reads and ONE explicit Mongoose Query adapter call/operation. Full Date/Buffer/ObjectId/Code.scope/DBRef.fields/nested native output, selected/denied keys/order match. Candidate untimed overflow/depleted/wire controls return controlled 400/no partial output. Persisted native runtime/peer coverage is reused unchanged-source V3/V7; adapter timing is not Mongo timing.

| Comparable family | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| native-adapter/direct-read/100 | isolated | 2 | -80.63% / -8.3363 ms | -72.24% / -8.3150 ms | -74.12% / -8.2386 ms | PASS |
| native-adapter/direct-read/100 | trusted | 4 | -0.47% / -0.0092 ms | +5.00% / +0.1467 ms | +1.48% / +0.0428 ms | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-list/100 | isolated | 2 | -96.95% / -742.9544 ms | -96.72% / -754.9718 ms | -96.59% / -768.1966 ms | PASS |
| native-adapter/direct-list/100 | trusted | 2 | -20.94% / -3.9101 ms | -19.10% / -3.8717 ms | -23.72% / -5.5952 ms | PASS |
| facts/owner-only/100 | isolated | 2 | -92.54% / -165.1460 ms | -91.83% / -170.6674 ms | -91.70% / -170.8118 ms | PASS |
| facts/owner-only/100 | trusted | 2 | -23.66% / -3.3599 ms | -20.60% / -3.3946 ms | -27.64% / -4.6549 ms | PASS |
| facts/unused-checksum/100 | isolated | 2 | -87.23% / -165.3635 ms | -86.61% / -169.7796 ms | -86.54% / -169.6322 ms | PASS |
| facts/unused-checksum/100 | trusted | 2 | -14.07% / -3.5400 ms | -15.90% / -4.4249 ms | -16.77% / -4.6430 ms | PASS |

Unused fact = exactly 100 hooks and 100 expensive computations × 10,000 deterministic iterations/request, independent of 24 fields; non-elided checksum independently checked. Compare ONLY with each profile’s OWN owner-only fixture. Never subtract eager fact costs from primary LIST. No additional own-cost repeat campaign.

| Profile | Round | Own owner-only → unused Δ median | Own Δ CPU | Work/request |
|---|---|---|---|---|
| current-default | 1 | +4.08% / +7.3872 ms | +4.32% / +8.0862 ms | 100 × 10,000 |
| current-default | 2 | +8.45% / +14.8661 ms | +6.16% / +11.4167 ms | 100 × 10,000 |
| current-active | 1 | +77.66% / +11.1159 ms | +64.88% / +10.9780 ms | 100 × 10,000 |
| current-active | 2 | +76.65% / +10.7907 ms | +63.67% / +10.6716 ms | 100 × 10,000 |
| isolated | 1 | +84.80% / +11.0647 ms | +72.77% / +10.9250 ms | 100 × 10,000 |
| isolated | 2 | +79.26% / +10.7537 ms | +68.71% / +10.9371 ms | 100 × 10,000 |
| trusted | 1 | +100.21% / +10.8411 ms | +89.62% / +10.8422 ms | 100 × 10,000 |
| trusted | 2 | +98.65% / +10.7055 ms | +88.25% / +10.8312 ms | 100 × 10,000 |

## Held/released GC heap and actual stage/field scaling

All **six** held/released retained-heap gates pass; no heap trigger. Actual --expose-gc, three GCs/observation, four cycles × five operations, held row array checked and final observation released. Extra work 20 reads/2,000 hooks/2,000×fields callbacks per job. Maximum positive-clamped own-start candidate-minus-baseline growth **0 bytes**, below repeated >15% AND >1 MiB. These are retained bytes, NOT total allocations; starting heaps and signed growth follow.

| Profile | Fields | Rounds | Starting heap KiB | Median held growth KiB | Median released growth KiB |
|---|---|---|---|---|---|
| current-default | 4 | 1 / 2 | 38606.87 / 38610.66 | +145.86 / +152.38 | -363.80 / -356.42 |
| current-default | 24 | 1 / 2 | 35624.93 / 35593.80 | +861.44 / +852.45 | -357.69 / -364.48 |
| current-default | 48 | 1 / 2 | 35539.73 / 35684.65 | +1714.49 / +1683.77 | -369.25 / -409.70 |
| current-active | 4 | 1 / 2 | 38766.42 / 38747.71 | +95.26 / +111.66 | -383.09 / -370.84 |
| current-active | 24 | 1 / 2 | 39113.25 / 39119.69 | +807.78 / +814.85 | -387.23 / -379.52 |
| current-active | 48 | 1 / 2 | 39530.31 / 39559.74 | +1658.45 / +1643.87 | -388.46 / -393.42 |
| isolated | 4 | 1 / 2 | 37975.05 / 37977.39 | -172.47 / -175.50 | -280.23 / -279.04 |
| isolated | 24 | 1 / 2 | 38268.42 / 38261.34 | -66.66 / -63.54 | -283.43 / -280.16 |
| isolated | 48 | 1 / 2 | 38388.88 / 38393.49 | +50.99 / +49.74 | -283.78 / -285.87 |
| trusted | 4 | 1 / 2 | 37576.56 / 37531.84 | -133.30 / -150.36 | -218.23 / -241.88 |
| trusted | 24 | 1 / 2 | 37871.44 / 37883.94 | -6.19 / -9.35 | -200.93 / -204.45 |
| trusted | 48 | 1 / 2 | 38284.27 / 38253.32 | +96.90 / +121.18 | -209.35 / -197.26 |

Separate fresh campaign structure probes: six rows/one embedded child, one adapter call/ZERO Mongo reads, six hooks/six actual raw fact normalizations/six immutable fact identities. Callback counts 24/144/288 at 4/24/48 fields. All **12 actual resolved root+embedded stages close/clear**; 36 idempotent close calls do not mean 36 stages. Whole-root view copies stay isolated 12/12/12, trusted 0/0/0; seven general capture-copy entries/no grant-map copies. Memo invocations 66/306/594 naturally scale with selected fields, not whole-root graph copies.
NEW `STAGE-PROJECTION-CLEAR-AUDIT.json`: untimed private supplement after timing observes actual frozen access/view creation AND both pointers cleared on every one of 12 stages/operation, both modes/all widths; 36 creations/clears per mode. It asserts the same response, counters and original bundle fingerprint as the fresh campaign probes. Accepted tools/artifacts remain unchanged; no timed samples or extra campaign added. No demonstrated superlinear retained per-field graph here, not universal proof.

## Identity, reused scoped gates and explicit disposition

`IDENTITY-before-rebuild.json` / `IDENTITY-after-rebuild.json` PASS: **622 copied candidate / 552 baseline files, 575 source records, 13 tools, 67 outputs, 134 dependencies/3,510 files, 293 tool packages/10,545 files**, exact artifact/dist inventories, binaries and pre/post campaign seals. **1,420,736 historical paths** retain mode/size/mtime/ctime/link, including both complete failed campaigns and all original artifacts/caches. Protected task/protocol/manifests separately hash checked. Stat seal, not broad clone.
After ALL timing, sole authorized serial rebuild: `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build`, six necessary affected/transitive packages only. PASS; **all 67 output hashes AND exact inventory match** accepted metadata and prebuild output. Fresh private pnpm cache/store, downloads disabled, pinned Mongo binary read-only. No install/root/old-artifact/unrelated CLI build.
Reused (NOT rerun), actual metadata-pinned OAR-09D full logs/results: **5,869 core / 182 files, 742 deco / 23 files, 44 runner tests**, zero failed/pending/skipped/cancelled, plus actual types/lint/format/diff. This is the latest 5,869 suite, NOT the prior 5,853 suite; both 16-case remediation suites included. All 575 source-file identities unchanged.
Actual V7 installed/tarball bytes rehashed: **175 core / 27 deco** consumer/doc/export cases; **20 guide executions / 60 HTTP responses / 80 reads+hooks**. Minimum Express 5.0.0/Mongoose 8.0.0 uses skipLibCheck:true, current 5.2.1/9.8.0 full declarations; TS 6.0.3. Both tarball/artifact-tree layouts and strict module forms retained. All 14 core outputs/eight declarations and README/MIGRATION/llms rehashed in actual installations/four 19-file tarballs; no test/src/private leak; public root/advanced/processors ESM/CJS sets unchanged 46/48/6. Consumer peers are distinct from benchmark dependency Mongoose 9.11.4; versions not relabeled.
Current AND measured root ESM: **`7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`**. Original baseline ESM: `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`. Accepted metadata SHA256 `63c5ed2dbf4bdc2d47d06c0fb4216347d8bbd3f3eadc9bfb4b2de87cf08bc197`; config `c7a523f9cb79d8574a56d688794d8d1508c7ecf05e05e0e29cb45c9f97efd28f`. HEAD `58b22c0d6d3abd4ecce03533e3867d148ff21233`; lock `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
Pinned Node 26.12.1 / pnpm 11.18.0 / Mongo 8.2.6 and binary hashes match. True allocation counters and Mongo server CPU remain **unavailable**. Two/four pairs are a bounded reproducibility screen, not significance/CI, universal speedup, production representativeness or blanket security equivalence. Application callback closure/external freshness remains outside library ownership.
**Required disposition:** OAR-09B measurement/evidence is delivered, but **OAR-09 remains OPEN / NOT performance-accepted**. Preserve all **12 failed trusted gates**. The user authorized two bounded remediation attempts (OAR-09C/D), not waiver or unbounded optimization. Coordinator must obtain an explicit decision on the three persistent adverse helpers AND all unresolved-sign comparisons before claiming completion or independent acceptance. No automatic third fix/campaign, threshold/sample/workload change, unchanged-artifact rerun or OAR-10 is authorized. No task/status edits, delegation, commit/publish, dependencies/lock edits, reverts, old evidence/cache/artifact writes or workspace-wide gates occurred. No owned jobs remain.
