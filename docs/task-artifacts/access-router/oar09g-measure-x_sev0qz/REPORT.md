> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09G-B: measured e131 — original acceptance NOT MET

**Original: 70/90 fixed gates pass; 20 fail. OAR-09 remains OPEN.** Three comparisons
have confirmed adverse metrics and eighteen have unresolved signs (one overlap).
All three isolated primary benefit gates pass. B1 is a separate descriptive supplement
with **zero acceptance gates**; it cannot replace old H3 or waive any result.

## Plain-language batch answer

The new batch API is **not generally faster than N current independent helpers** in
this fixed workload. At 100 rows, raw-only median latency is **+6.20% isolated /
+5.20% trusted**; query-plus-helper is **+5.52% / +5.39%**. CPU generally falls
(100-row raw **−5.23% / −6.46%**, query **−2.20% / −2.82%**). At 10 rows latency is
mixed/small except trusted raw **+10.19%**, and CPU is not uniformly lower.

Versus actual historical **raw** helpers, Many's median is roughly **76–84% lower**
in both modes. Versus the historical **initial LIST + issued handles** workflow,
isolated is **70.42% / 82.14% lower** at 10/100 rows, but trusted is **19.31% /
41.59% higher**. These are distinct one-entry, N-fresh-entry and retained-handle
authority contracts, under constant global permissions; not equivalent freshness,
universal speedup or a migration recommendation.

## Execution and scope

- ONE original campaign: **456 jobs / 39,200 measured responses**, 360 initial plus
  96 exact repeats for 24 triggered comparisons; rounds 180/180/48/48. Exit **1 is
  a valid performance-gate failure**, not infrastructure failure. Zero failed jobs,
  missing jobs, count/fingerprint/hydration/getter or identity failures.
- ONE separately predeclared B1: **124 jobs / 12,400 responses**, 64 initial plus 60
  repeats for 15 descriptive triggers; rounds 32/32/30/30, below the 128 cap. Exit 0
  means infrastructure/correctness completion, NOT B1 performance acceptance.
- Every original/raw job, response fingerprint, process user+system CPU total,
  elapsed window, count, direct query/normal DTO/preflight proof and worker log is
  preserved. `JOB-LAUNCH-INDEX.json` and exclusive LAUNCHED/RETURNED receipts prevent
  duplicate campaigns. Both commands ran foreground, serial and awaited.
- Fixed original primary: 100 rows, 24 fields, 32 bytes, one client, hook concurrency
  10, five warmups, 100 samples. Six guards at 10/100 rows retain 50 samples. READ,
  helper, native, facts and 4/24/48-field retention settings are unchanged. B1 uses
  10/100 rows, 24 fields/32 bytes, five warmups/100 samples; 16 exact comparisons.
- Two reversed initial pairs, exactly two further pairs only on fixed triggers.
  No discarded samples, larger samples, new workload, extra campaign or optimization.
- Independent **Python** reconstructs catalog/matrix/order/settings/seeds/full
  fingerprints, raw statistics and all original gates/B1 descriptive flags, importing
  no benchmark calculation modules. This is this owner's independent calculation,
  NOT a second-session acceptance or OAR-10 review.

## Original results, never replaced by B1

| Mode | Passed /45 | Failed | Confirmed adverse comparisons | Unstable comparisons |
|---|---|---|---|---|
| isolated | 44 | 1 | 0 | 1 |
| trusted | 26 | 19 | 3 | 17 |


Negative = candidate lower; percent AND ms deltas are computed within each pair,
then their medians taken separately, never request pooling. Nearest-rank p95 is
calculated from each job's samples; CPU = (actual user + system)/requests.
Primary benefit must reach ≥10% AND ≥1 ms median, ≥10% AND ≥0.5 ms CPU, with both
metrics improving in both initial pairs or at least three of four after a trigger.
Adverse is >10% AND >1 ms median, >15% AND >2 ms p95, >10% AND >0.5 ms CPU, confirmed
in ≥3/4 pairs AND median paired thresholds. Any fewer-than-three aligned signs after
repeats fails, **including tiny/zero changes**. No noise exemption was introduced.

### All six primary comparisons

| Case | Mode / old baseline | Pairs | Median delta | p95 delta | CPU delta | Original result |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated/default | 2 | -60.15% / -24.9587 ms | -65.27% / -39.7871 ms | -60.87% / -31.3123 ms | PASS |
| primary/plain-wide/100 | trusted/active | 4 | -3.90% / -0.5947 ms | -8.00% / -1.5261 ms | -14.10% / -2.8301 ms | PASS |
| primary/document-rules/100 | isolated/default | 2 | -91.59% / -197.5791 ms | -90.65% / -224.6214 ms | -90.79% / -212.9851 ms | PASS |
| primary/document-rules/100 | trusted/active | 2 | -19.13% / -3.4877 ms | -17.94% / -3.8868 ms | -23.00% / -5.1472 ms | PASS |
| primary/embedded/100 | isolated/default | 2 | -95.66% / -579.7827 ms | -95.34% / -610.2778 ms | -95.12% / -609.5320 ms | PASS |
| primary/embedded/100 | trusted/active | 2 | -17.17% / -4.8230 ms | -20.26% / -6.8885 ms | -21.73% / -7.6087 ms | PASS |


### All twenty actual failed original gates

| Case | Mode | Pairs | Confirmed adverse metrics | Unstable metrics | Final median delta | Final p95 delta | Final CPU delta |
|---|---|---|---|---|---|---|---|
| guard/plain-narrow/10 | trusted | 4 | none | p95Ms | +13.99% / +0.5351 ms | +6.12% / +0.3437 ms | +12.12% / +0.6313 ms |
| guard/hydrated/10 | trusted | 4 | none | medianMs, p95Ms, cpuMsPerRequest | +2.55% / +0.1267 ms | +7.38% / +0.5353 ms | +1.30% / +0.0463 ms |
| guard/large-config/10 | trusted | 4 | none | medianMs, p95Ms, cpuMsPerRequest | +0.87% / +0.0379 ms | -2.52% / -0.2070 ms | -1.44% / -0.1154 ms |
| guard/populate/10 | trusted | 4 | none | cpuMsPerRequest | -2.78% / -0.2090 ms | -11.93% / -1.4375 ms | -1.66% / -0.2254 ms |
| guard/virtuals/10 | trusted | 4 | none | medianMs, p95Ms, cpuMsPerRequest | -1.93% / -0.1297 ms | -4.58% / -0.4361 ms | -2.10% / -0.1831 ms |
| guard/hydrated/100 | trusted | 4 | none | p95Ms | -4.00% / -0.6694 ms | -2.83% / -0.6164 ms | -10.06% / -2.2910 ms |
| guard/large-config/100 | trusted | 4 | none | medianMs, p95Ms | +3.14% / +0.5123 ms | -0.74% / -0.0710 ms | -7.33% / -1.5548 ms |
| guard/virtuals/100 | trusted | 4 | medianMs, p95Ms | none | +15.87% / +2.7914 ms | +17.51% / +3.6618 ms | +5.61% / +1.3567 ms |
| read/http-id/plain-wide/100 | trusted | 4 | none | medianMs, p95Ms | +0.81% / +0.0143 ms | +1.94% / +0.1085 ms | +2.69% / +0.1082 ms |
| read/http-id/document-rules/100 | trusted | 4 | none | cpuMsPerRequest | +3.78% / +0.1460 ms | +8.35% / +0.4287 ms | +3.85% / +0.1511 ms |
| read/http-id/hydrated/100 | trusted | 4 | none | medianMs, cpuMsPerRequest | +2.24% / +0.0760 ms | +13.13% / +0.6288 ms | +1.49% / +0.0509 ms |
| read/http-filter/document-rules/100 | trusted | 4 | none | cpuMsPerRequest | -13.62% / -0.5684 ms | -8.42% / -0.4998 ms | -8.01% / -0.3557 ms |
| read/http-filter/embedded/100 | trusted | 4 | none | p95Ms | -1.28% / -0.0540 ms | +0.39% / +0.0279 ms | -1.16% / -0.0550 ms |
| read/http-filter/virtuals/100 | trusted | 4 | none | medianMs | -0.31% / -0.0140 ms | +12.59% / +0.6624 ms | +5.52% / +0.2422 ms |
| helper/H2-query/100 | trusted | 4 | none | medianMs | -2.39% / -0.0862 ms | +6.11% / +0.3164 ms | +0.18% / +0.0075 ms |
| helper/H2-global/100 | trusted | 4 | none | p95Ms, cpuMsPerRequest | -3.00% / -0.1198 ms | -0.63% / -0.0527 ms | -0.45% / -0.0234 ms |
| helper/H4/100 | isolated | 4 | none | cpuMsPerRequest | -8.95% / -0.3635 ms | -3.39% / -0.1756 ms | -5.85% / -0.2546 ms |
| helper/H4/100 | trusted | 4 | none | p95Ms | -0.69% / -0.0241 ms | -2.15% / -0.1002 ms | +4.21% / +0.1402 ms |
| helper/H3-global/10 | trusted | 4 | cpuMsPerRequest | p95Ms | +9.48% / +0.6967 ms | +4.41% / +0.3349 ms | +19.48% / +1.7608 ms |
| helper/H3-global/100 | trusted | 4 | medianMs, p95Ms, cpuMsPerRequest | none | +25.12% / +8.5167 ms | +27.41% / +10.6866 ms | +26.32% / +10.9531 ms |


The confirmed adverse comparisons are trusted virtuals/100 (median **+15.87% /
+2.7914 ms**, p95 **+17.51% / +3.6618 ms**), trusted H3-global/10 CPU **+19.48% /
+1.7608 ms**, and trusted H3-global/100 median **+25.12% / +8.5167 ms**, p95
**+27.41% / +10.6866 ms**, CPU **+26.32% / +10.9531 ms**. CPU/median not meeting BOTH
thresholds are not relabeled confirmed adverse. Every initial and repeat pair stays
in `ALL-GATES.md`, `PAIR-DETAILS.md` and `RAW-PAIRED-AUDIT.json`.

### H3 and accepted H4, explicitly separate from B1

| Case | Mode | Pairs | Median delta | p95 delta | CPU delta | Actual new result |
|---|---|---|---|---|---|---|
| helper/H4/100 | isolated | 4 | -8.95% / -0.3635 ms | -3.39% / -0.1756 ms | -5.85% / -0.2546 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H4/100 | trusted | 4 | -0.69% / -0.0241 ms | -2.15% / -0.1002 ms | +4.21% / +0.1402 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H3-global/10 | isolated | 2 | -73.58% / -25.3324 ms | -70.44% / -27.3254 ms | -67.96% / -24.9751 ms | PASS |
| helper/H3-global/10 | trusted | 4 | +9.48% / +0.6967 ms | +4.41% / +0.3349 ms | +19.48% / +1.7608 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/100 | isolated | 2 | -85.30% / -255.4788 ms | -85.02% / -280.5985 ms | -83.33% / -268.6191 ms | PASS |
| helper/H3-global/100 | trusted | 4 | +25.12% / +8.5167 ms | +27.41% / +10.6866 ms | +26.32% / +10.9531 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |


Original H3-global/100 still issues its initial LIST followed by **100 fresh current
single-row calls**, versus 100 actual historical issued handles. No Many substitution.
H4 remains **facts-only-v1 / checked-each-response-v2**, bound to actual e131 SHA:
one read + one hook, zero output callbacks; new actual normal DTO controls still
observe 24 callbacks and one decoration in lean/hydrated paths. Both modes' H4
failures above are sign-instability, not a reopened semantic contract or inferred
speedup. No old v1/24-callback candidate evidence is reinterpreted.

### Explicit fresh-authority read cost

| Explicit current-authority workflow | Mode | Pairs | Delta vs old flow + matching old fresh query (median) | Same CPU delta | Gate |
|---|---|---|---|---|---|
| helper/H2/100 | isolated | 2 | -56.74% / -8.5471 ms | -61.15% / -10.4191 ms | PASS |
| helper/H2/100 | trusted | 2 | -27.79% / -2.2183 ms | -34.24% / -3.0955 ms | PASS |
| helper/H3/10 | isolated | 2 | -82.74% / -50.8788 ms | -81.76% / -53.5170 ms | PASS |
| helper/H3/10 | trusted | 2 | -29.68% / -3.7840 ms | -36.96% / -5.7592 ms | PASS |
| helper/H3/100 | isolated | 2 | -92.92% / -482.0268 ms | -92.58% / -513.5847 ms | PASS |
| helper/H3/100 | trusted | 2 | -42.64% / -22.4419 ms | -47.51% / -30.3501 ms | PASS |


H2 current-authority flow has two reads/two hooks versus old flow's one/one; H3 has
two batched reads/two×rows hooks versus old one/rows. The matching old fresh query's
median/CPU adds only to the fixed cost-allowance comparator, then the unchanged
10% AND 1 ms / 0.5 ms allowance applies. Every extra read/hook is explicit; raw
helpers/presentation add zero. Direct full-workflow p95 remains in pair details;
**no component p95 is synthesized or query time subtracted**. All six allowances pass.

### Facts/native/retained state

Unused facts are compared with their **own** owner-only workload on matching
profile/round, never subtracted from any primary benefit. Actual checksum, exactly
100 hooks and 100×10,000 computations/request are independently verified.

| Profile | Round | Unused vs own owner-only median delta | CPU delta | Computations x iterations/request |
|---|---|---|---|---|
| current-default | 1 | +8.65% / +18.4663 ms | +7.04% / +16.0444 ms | 100 x 10,000 |
| current-default | 2 | +6.44% / +13.2237 ms | +3.83% / +8.4813 ms | 100 x 10,000 |
| current-active | 1 | +66.04% / +11.5081 ms | +52.47% / +11.0891 ms | 100 x 10,000 |
| current-active | 2 | +68.29% / +11.6130 ms | +54.62% / +11.3240 ms | 100 x 10,000 |
| isolated | 1 | +62.69% / +11.4774 ms | +59.40% / +12.7655 ms | 100 x 10,000 |
| isolated | 2 | +57.12% / +10.7152 ms | +47.43% / +10.3337 ms | 100 x 10,000 |
| trusted | 1 | +81.77% / +11.8256 ms | +72.38% / +11.8872 ms | 100 x 10,000 |
| trusted | 2 | +81.50% / +11.6455 ms | +74.21% / +11.9087 ms | 100 x 10,000 |


Native direct READ/LIST uses the real packed service APIs over an explicit adapter:
**zero MongoDB reads, one adapter call**, not Mongo performance. Every supported
native/wire/reference/selection response and callback count remains checked; native
overflow/denial probes run untimed, not a falsely faster timed rejection.

All six original held/released heap comparisons pass. Four cycles, five operations
per cycle and three forced GCs/observation are retained. Each phase requires repeated
>15% AND >1 MiB growth to block; no such candidate growth appears. Net retained heap
may be negative relative to warmed baseline. **Heap is NOT allocations or an RSS cap.**

| Profile | Round | Fields | Median held net bytes | Median released net bytes |
|---|---|---|---|---|
| current-default | 1 | 4 | 157600.0 | -363552.0 |
| current-default | 1 | 24 | 860392.0 | -379528.0 |
| current-default | 1 | 48 | 1742736.0 | -407100.0 |
| current-default | 2 | 4 | 153792.0 | -366568.0 |
| current-default | 2 | 24 | 853320.0 | -388264.0 |
| current-default | 2 | 48 | 1751524.0 | -391892.0 |
| isolated | 1 | 4 | -196084.0 | -306448.0 |
| isolated | 1 | 24 | -78008.0 | -321588.0 |
| isolated | 1 | 48 | 31612.0 | -323260.0 |
| isolated | 2 | 4 | -190292.0 | -307884.0 |
| isolated | 2 | 24 | -82088.0 | -321204.0 |
| isolated | 2 | 48 | 34632.0 | -321564.0 |
| current-active | 1 | 4 | 116124.0 | -373676.0 |
| current-active | 1 | 24 | 834080.0 | -388812.0 |
| current-active | 1 | 48 | 1686560.0 | -402464.0 |
| current-active | 2 | 4 | 114204.0 | -374988.0 |
| current-active | 2 | 24 | 824832.0 | -398588.0 |
| current-active | 2 | 48 | 1690668.0 | -400764.0 |
| trusted | 1 | 4 | -138188.0 | -247372.0 |
| trusted | 1 | 24 | -21896.0 | -226880.0 |
| trusted | 1 | 48 | 92456.0 | -246696.0 |
| trusted | 2 | 4 | -129772.0 | -244440.0 |
| trusted | 2 | 24 | -23956.0 | -227484.0 |
| trusted | 2 | 48 | 100052.0 | -243288.0 |


`RETAINED-HEAP-SCALING.json` retains every cycle and finite-difference field slope.
Actual 6-row structural probes show six raw fact normalizations, one catalog capture,
12 closed/cleared root/embedded stages at all widths, source views 12 isolated/0
trusted, memo seam calls 12×fields+18. No demonstrated superlinear retained-per-field
graph in this bounded fixture; this is not a universal asymptotic/allocation proof.
Mongo server CPU and true/implicit/engine allocation counts remain unavailable.

## Report-only B1: comparator distinctions and direct timing

`B1-DESCRIPTIVE-TABLES.md` gives separate raw-only and query-plus-helper tables for
both modes, 10/100 rows and both comparators, with initial/final metrics and exact
sign/absolute-material triggers. `B1-PAIR-DETAILS.md` gives every directly observed
comparator/Many median, p95 and CPU and paired percent/ms delta. The full tables are
included here unchanged:

# B1: report-only raw and full-query comparisons

No acceptance gates or pass/fail. Negative means Many lower; median of paired percent and ms deltas, not pooled. Query p95 directly observed. One vs N capture is NOT freshness equivalence.

## raw-only

| Rows | Mode | Comparator | Initial pairs | Initial median; p95; CPU delta | Exact repeat trigger | Final pairs | Final median; p95; CPU delta | Lower / higher / zero pairs (median;p95;CPU) |
|---:|---|---|---:|---|---|---:|---|---|
| 10 | isolated | current-independent (independent) | 2 | +6.71% / +0.2793 ms; +1.57% / +0.0896 ms; +4.48% / +0.2597 ms | {'materialAbsoluteDelta': True, 'signDisagreement': True} | 4 | +4.16% / +0.1648 ms; -8.16% / -0.5139 ms; -1.37% / -0.0809 ms | 1/3/0; 3/1/0; 3/1/0 |
| 10 | isolated | historical (old-raw) | 2 | -75.37% / -13.4684 ms; -66.59% / -13.1458 ms; -67.93% / -13.6021 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -75.84% / -13.7161 ms; -70.47% / -13.7737 ms; -69.21% / -13.7597 ms | 4/0/0; 4/0/0; 4/0/0 |
| 10 | trusted | current-independent (independent) | 2 | +11.85% / +0.4788 ms; +0.30% / +0.0248 ms; +7.56% / +0.4574 ms | {'materialAbsoluteDelta': True, 'signDisagreement': True} | 4 | +10.19% / +0.3958 ms; -8.77% / -0.5617 ms; +5.14% / +0.2952 ms | 0/4/0; 3/1/0; 0/4/0 |
| 10 | trusted | historical (old-raw) | 2 | -76.56% / -13.7811 ms; -71.61% / -14.1554 ms; -70.89% / -14.2735 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -75.81% / -13.3483 ms; -71.34% / -13.6748 ms; -70.89% / -13.8867 ms | 4/0/0; 4/0/0; 4/0/0 |
| 100 | isolated | current-independent (independent) | 2 | +6.20% / +1.5593 ms; -0.75% / -0.2241 ms; -5.23% / -1.7063 ms | {'materialAbsoluteDelta': False, 'signDisagreement': False} | 2 | +6.20% / +1.5593 ms; -0.75% / -0.2241 ms; -5.23% / -1.7063 ms | 0/2/0; 2/0/0; 2/0/0 |
| 100 | isolated | historical (old-raw) | 2 | -83.31% / -137.7238 ms; -84.33% / -160.8671 ms; -82.36% / -150.5478 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -83.51% / -139.2357 ms; -84.56% / -163.2539 ms; -82.86% / -152.5142 ms | 4/0/0; 4/0/0; 4/0/0 |
| 100 | trusted | current-independent (independent) | 2 | +0.97% / +0.2035 ms; -6.23% / -2.1371 ms; -10.11% / -3.5306 ms | {'materialAbsoluteDelta': True, 'signDisagreement': True} | 4 | +5.20% / +1.3292 ms; -0.22% / -0.0640 ms; -6.46% / -2.1234 ms | 1/3/0; 2/2/0; 3/1/0 |
| 100 | trusted | historical (old-raw) | 2 | -84.24% / -141.7397 ms; -85.33% / -168.2948 ms; -83.77% / -156.9816 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -83.88% / -140.3129 ms; -84.53% / -164.2754 ms; -83.25% / -154.0451 ms | 4/0/0; 4/0/0; 4/0/0 |

## query-plus-helper

| Rows | Mode | Comparator | Initial pairs | Initial median; p95; CPU delta | Exact repeat trigger | Final pairs | Final median; p95; CPU delta | Lower / higher / zero pairs (median;p95;CPU) |
|---:|---|---|---:|---|---|---:|---|---|
| 10 | isolated | current-independent (independent) | 2 | -2.83% / -0.2265 ms; -5.30% / -0.5812 ms; -6.88% / -0.7309 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | -0.44% / -0.0361 ms; -4.44% / -0.4748 ms; -5.78% / -0.5991 ms | 2/2/0; 2/2/0; 4/0/0 |
| 10 | isolated | historical (old-query-handles) | 2 | -70.48% / -18.8356 ms; -65.26% / -18.8673 ms; -65.50% / -18.7750 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -70.42% / -18.8356 ms; -66.90% / -19.3793 ms; -65.40% / -18.7599 ms | 4/0/0; 4/0/0; 4/0/0 |
| 10 | trusted | current-independent (independent) | 2 | +6.76% / +0.4924 ms; -3.26% / -0.3537 ms; +0.09% / +0.0026 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | +6.76% / +0.4924 ms; -3.26% / -0.3537 ms; -1.43% / -0.1445 ms | 1/3/0; 2/2/0; 3/1/0 |
| 10 | trusted | historical (old-query-handles) | 2 | +20.26% / +1.2594 ms; +6.23% / +0.5444 ms; +22.57% / +1.7333 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | +19.31% / +1.2205 ms; +8.44% / +0.7528 ms; +22.32% / +1.7355 ms | 0/4/0; 0/4/0; 0/4/0 |
| 100 | isolated | current-independent (independent) | 2 | +5.52% / +2.1470 ms; -0.12% / -0.0936 ms; -2.20% / -1.0765 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | +5.52% / +2.1470 ms; +0.78% / +0.3426 ms; -2.20% / -1.0765 ms | 0/4/0; 2/2/0; 3/1/0 |
| 100 | isolated | historical (old-query-handles) | 2 | -82.09% / -189.4804 ms; -82.02% / -210.0389 ms; -81.11% / -206.3558 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -82.14% / -188.7433 ms; -82.19% / -206.6653 ms; -81.04% / -203.0804 ms | 4/0/0; 4/0/0; 4/0/0 |
| 100 | trusted | current-independent (independent) | 2 | +3.93% / +1.4711 ms; -1.39% / -0.6198 ms; -3.40% / -1.5974 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | +5.39% / +2.0152 ms; -1.07% / -0.4955 ms; -2.82% / -1.3256 ms | 0/4/0; 2/2/0; 3/1/0 |
| 100 | trusted | historical (old-query-handles) | 2 | +41.59% / +11.4430 ms; +41.47% / +12.5714 ms; +37.48% / +12.3122 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | +41.59% / +11.4430 ms; +41.47% / +12.5714 ms; +37.48% / +12.3122 ms | 0/4/0; 0/4/0; 0/4/0 |


- Raw current comparator = N actual fresh raw calls; historical raw = N actual old
  global-only raw calls with **no configured document hook / zero DB**. There is no
  invented historical Many API. Query historical = actual initial LIST + N issued
  row handles. Query current = actual initial LIST + N fresh raw calls. Many = one
  explicit call plus the initial LIST only in query workflow.
- Same STRING/GLOBAL H3 business rules, 24×N business checks plus ordinal, zero
  function callbacks/hooks/getters/virtuals. Raw reads 0, full query reads 1. Actual
  call counters prove Many 1 versus independent/old-raw N versus historical handles N.
  Every HTTP sample uses a fresh original request/Core and exact fixture/wire order.
- New actual copied-artifact 50-record proofs reproduce G-A's same-byte records;
  real public method/compiler/getter preflights pass. Many config/catalog captures
  1 vs N, sources/stages/memos N vs N; all-source-first, original-request callbacks,
  frozen EMPTY facts, duplicate-reference independence, drain/poison/late rejection
  and actual cleared slots/owners/policy/catalog are observed in copied code, not
  inferred from empty JSON. Ordinary independent preparation clearing is NOT claimed.
- Separate 100-row async all-function control: **2,400 callbacks each; Permission
  maps 1 vs 1; explicit Promise constructors 4,800 vs 4,800; binding/receiver literals
  2 vs 200**. These seams are untimed work observations, not implicit allocation or
  a timing explanation. No automatic Promise/map reduction or migration recommendation.
- 200,000 work /16 MiB bounds cover router-controlled admission/staging/traversal/
  explicit copies only; opaque Mongoose/native internals, dependency allocations,
  engine enumeration and trusted effects remain excluded. Per-row 20,000/depth100
  owners remain. Batch EMPTY facts are never current-document authority.

## Historical comparisons: retained, not pooled

The four earlier campaigns remain **75/90, 81/90, 78/90, 73/90**, each on its own
artifact/interleaved baseline and host time. `HISTORICAL-COLUMNS.md` displays all 90
IDs in five separate columns (including new 70/90). No cross-time causal or pooled
claim. Both latest historical confirmed H3 failures and all fifteen old unstable
IDs remain visible; the new actual outcomes for all fifteen are:

| Former unstable ID | Mode | Old unresolved metrics | New median delta | New p95 delta | New CPU delta | New pairs | Actual new disposition |
|---|---|---|---|---|---|---|---|
| guard/plain-narrow/10 | trusted | p95Ms, cpuMsPerRequest | +13.99% / +0.5351 ms | +6.12% / +0.3437 ms | +12.12% / +0.6313 ms | 4 | FAIL: unresolved sign instability: p95Ms |
| guard/hydrated/10 | trusted | cpuMsPerRequest | +2.55% / +0.1267 ms | +7.38% / +0.5353 ms | +1.30% / +0.0463 ms | 4 | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/large-config/10 | trusted | p95Ms | +0.87% / +0.0379 ms | -2.52% / -0.2070 ms | -1.44% / -0.1154 ms | 4 | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/populate/10 | trusted | medianMs, p95Ms | -2.78% / -0.2090 ms | -11.93% / -1.4375 ms | -1.66% / -0.2254 ms | 4 | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/100 | trusted | p95Ms | -5.83% / -0.5043 ms | -15.16% / -1.9231 ms | -4.77% / -0.5341 ms | 2 | PASS |
| guard/populate/100 | trusted | p95Ms | -1.32% / -0.2415 ms | -3.48% / -0.7790 ms | -8.27% / -2.0045 ms | 2 | PASS |
| read/http-id/document-rules/100 | trusted | medianMs | +3.78% / +0.1460 ms | +8.35% / +0.4287 ms | +3.85% / +0.1511 ms | 4 | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | medianMs, p95Ms | +14.40% / +0.5368 ms | +10.26% / +0.6010 ms | +12.49% / +0.5079 ms | 4 | PASS |
| read/http-filter/document-rules/100 | trusted | medianMs, p95Ms | -13.62% / -0.5684 ms | -8.42% / -0.4998 ms | -8.01% / -0.3557 ms | 4 | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-filter/embedded/100 | trusted | medianMs, p95Ms | -1.28% / -0.0540 ms | +0.39% / +0.0279 ms | -1.16% / -0.0550 ms | 4 | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | trusted | medianMs, p95Ms | +7.27% / +0.3102 ms | +2.65% / +0.1548 ms | +3.29% / +0.1398 ms | 2 | PASS |
| read/http-filter/virtuals/100 | trusted | p95Ms | -0.31% / -0.0140 ms | +12.59% / +0.6624 ms | +5.52% / +0.2422 ms | 4 | FAIL: unresolved sign instability: medianMs |
| helper/H0/100 | trusted | medianMs, p95Ms | -8.38% / -0.3105 ms | -9.39% / -0.5051 ms | -15.51% / -0.6926 ms | 2 | PASS |
| helper/H2-query/100 | trusted | p95Ms | -2.39% / -0.0862 ms | +6.11% / +0.3164 ms | +0.18% / +0.0075 ms | 4 | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-read/100 | trusted | medianMs, p95Ms | -15.54% / -0.5732 ms | -25.20% / -2.1297 ms | -14.75% / -0.7856 ms | 2 | PASS |


New passing IDs do not rewrite old failures, and new failing IDs are not discarded.
Any disposition/gate revision is for the user/coordinator, not this measurement owner.

## Identity, post-gate rebuild and limits

- User HEAD `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`; all 69 incoming status paths,
  all 1,999 tracked/untracked source-file identities, protected incoming task SHA
  `73ae8becc22259ef6b5d78ce20300a5e59c87c2bc9209e0f5ad88de682013cb8` unchanged.
- Exact measured root ESM **e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e**;
  old same-byte ten-OFF/ten-ON **33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822**.
- Accepted metadata SHA **3d08714129ed5e0996628648a2cdf000681ac62805bb2675e131503b8cd8fb5c**.
  Both protocol JSON SHA **b7f12a2af8e409a9be5e65e1784fffd2bd9021859b7f54426cdd6f330adbef83**,
  identical config but different original/B1 CLIs. Source seal excludes ONLY the shared
  coordinator task; this owner separately protects its exact incoming bytes.
- Full verification before original, before B1, after both and after rebuild: 614
  source/19 tool pins, 681 readonly copied files/48 candidate links, 552 old baseline
  files/39 links, original **134 packages/3,510 files** (five workspace/129 external),
  **293 tool packages/10,545 files**, lock/binaries, 5,055 prep packet entries/39
  bindings and 191 focused protected old records unchanged. No old cache writes or
  dependency substitution. Original benchmark Mongoose was already **9.11.4**, not
  the separate historical 9.8.0 peer consumer. No universal old cache-tree audit claim.
- Actual Node **26.12.1**, pnpm **11.18.0**, TS **6.0.3**, Mongo **8.2.6**,
  Mongoose **9.11.4**, Express **5.2.1**. Full process.versions and exact node/pnpm/
  Mongo binary hashes remain in per-boundary runtime identity records.
- Only after BOTH timing campaigns: foreground filtered serial **six-package** build
  with fresh private pnpm cache/store reproduces **all 67 dist files exactly**, including
  all 14 core JS/declaration outputs/eight DTS. `POSTBUILD-DIST.json` and build logs
  record scope/output hashes. No source/tool/build/install change DURING timing.
- F-V **6,046 core/187 files, 742 deco/23 files, four real peer/layout matrices ×
  five compiler conditions** and docs/pack gates are **reused via unchanged exact
  bytes**, NOT claimed as fresh full-suite/install runs. G-A's 54 runner tests are
  likewise existing accepted evidence, not new timing acceptance. No workspace checks.
- Fresh TMP/XDG/pnpm/npm/Mongo runtime paths stay exclusively here; download false,
  pinned existing Mongo used readonly; no large cache clone, target chmod/deletion or
  old prep writing entrypoint. The only failed new audit was an auditor memo-count
  assumption (preserved attempt/log), corrected using actual source semantics; no
  product/tool/raw/threshold change and no campaign rerun. `OBSERVATIONS.json` records it.

## Disposition

**OAR-09 stays OPEN for explicit disposition.** No performance exception, gate waiver,
product fix, optimization, extra artifact campaign, sample fishing, task edit, OAR-10,
independent acceptance, reviewed-release-byte claim, commit or publication is made.
Coordinator review of this packet is next. Final seal/closure bind reports and raw
files and verify no owned Mongo/worker/build/test/server processes remain.
