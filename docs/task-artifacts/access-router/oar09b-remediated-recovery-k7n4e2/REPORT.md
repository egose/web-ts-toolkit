> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09B remediated recovery: performance acceptance FAILED; OAR-09 OPEN

The single fresh campaign completed: **444 jobs / 38,200 measured responses**, zero job/count/fingerprint failures. **81/90 gates pass**: isolated **45/45**, trusted **36/45**. Three trusted comparisons remain confirmed adverse and six have unresolved signs. Full correctness/scoped gates and heap gates passing do not waive these performance failures. No OAR-10, further optimization, sampling or new campaign is authorized by this packet.

## Exact campaign / independent reconciliation

- Entry confirmed `_tmp-oar09b-remediated-taoqwoom/` had exactly eight EMPTY setup directories and no campaign report/scripts/handoff; no owned jobs. No completed new series was restarted. The original `_tmp-oar09b-g28ar1zl/` 464-job failed campaign remains untouched.
- Accepted inputs: `docs/task-artifacts/access-router/oar09c-ckrmwpy3/final-01/FINAL-PROTOCOL.{json,md}` and adjacent candidate metadata/artifact ONLY. Current-default/active use the same original sealed OAR-01 bytes with ten controls OFF/ON. Isolated/trusted use actual shipped enum profiles, verified in declarations and exact/bulk getters on source AND target.
- UTC 2026-11-02T01:33:49.527Z–2026-11-02T02:04:57.355Z; foreground wrapper 1870.526 seconds; CLI exit **1**, a valid fixed-gate failure, not infrastructure failure.
- 45 cases × four profiles × two reversed rounds = **360 initial jobs**. Exactly two more reversed pairs at original settings for **21 triggered comparisons** ({'trusted': 21}): **84 extra jobs**, round job counts {'1': 180, '2': 180, '3': 42, '4': 42}. No discards, subsets, increased samples, quieter reruns or unchanged-artifact campaign repeats.
- Primary LIST: three unchanged workloads, 100 rows/24 fields/32 bytes, one client, hook concurrency 10, five warmups/100 samples. All six guards at 10/100 rows use 50 samples. Real READ ID/filter, H0–H4/matching-query, native adapters, owner/unused-fact and 4/24/48-field retention stay separate.
- New `recompute-raw.py` imports NO benchmark modules. Read-only AST extraction reuses only six pure Python fixture/stat definitions from the prior auditor; its entrypoint/output logic NEVER runs. New Python code reconstructs catalog, full expected responses/canonical fingerprints, settings/counts/hydration/getter proofs, raw medians/nearest-rank p95 and user+system CPU/request, exact ordering/triggers and all fixed gates. **38,200/38,200 expected measured fingerprints match**; every raw metric and paired gate matches the CLI report. Positive elapsed intervals and serial job-file chronology checked.
- Frozen workers assert full expected responses before/warmup/after AND every measured response on BOTH artifacts. Preflight probe/count/structure heaps finish before timing. `checked-each-response-v1` is distinct from OAR-01 row-count-only timing: LIST latency excludes deep check while CPU includes it; owned workflows include checks in latency. No historical timing series is pooled.
- `RAW-JOB-AUDIT.json` retains raw CPU totals/elapsed, fingerprints/counts and file hashes; `RAW-PAIRED-AUDIT.json` retains every pair and initial/final outcomes. `ALL-GATES.md` covers all 90 initial/final gates; `PAIR-DETAILS.md` every initial/repeat pair; `REPEAT-ONLY-SUMMARY.md` separately shows initial N=2, repeat-only N=2 and final N=4 for every trigger. Median OF paired percent AND ms deltas, never pooled samples.

## Coverage and primary protective-default benefit

| Family | Cases/profile | Isolated passed | Trusted passed | Jobs with repeats |
|---|---|---|---|---|
| primary | 3 | 3/3 | 3/3 | 24 |
| guard | 12 | 12/12 | 10/12 | 124 |
| read | 10 | 10/10 | 7/10 | 112 |
| helper | 13 | 13/13 | 10/13 | 124 |
| native-adapter | 2 | 2/2 | 1/2 | 20 |
| facts | 2 | 2/2 | 2/2 | 16 |
| retention | 3 | 3/3 | 3/3 | 24 |

All three primary isolated/default workloads improve median AND CPU in both initial pairs and meet >=10% AND 1 ms latency / >=10% AND 0.5 ms CPU savings. No primary benefit repeats needed. Trusted has no minimum required gain and receives no credit for copying old-active already omitted.

| Case | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | 2 | -64.23% / -21.6407 ms | -63.08% / -23.1829 ms | -62.75% / -24.2415 ms | PASS |
| primary/plain-wide/100 | trusted | 2 | -8.90% / -1.0776 ms | -8.38% / -1.1729 ms | -18.09% / -2.8685 ms | PASS |
| primary/document-rules/100 | isolated | 2 | -92.25% / -164.1976 ms | -91.78% / -171.5864 ms | -91.50% / -171.4421 ms | PASS |
| primary/document-rules/100 | trusted | 2 | -19.86% / -2.7875 ms | -20.31% / -3.3082 ms | -24.31% / -4.1835 ms | PASS |
| primary/embedded/100 | isolated | 2 | -96.29% / -515.6044 ms | -95.95% / -524.6549 ms | -95.78% / -536.4674 ms | PASS |
| primary/embedded/100 | trusted | 2 | -23.60% / -5.5499 ms | -23.86% / -6.3685 ms | -26.17% / -7.4847 ms | PASS |

| Primary isolated workload | Round | Old → new median ms | Old → new CPU/request ms | Δ median | Δ CPU |
|---|---|---|---|---|---|
| primary/plain-wide/100 | 1 | 33.9195 → 12.1900 | 38.7546 → 14.4013 | -64.06% / -21.7294 ms | -62.84% / -24.3533 ms |
| primary/plain-wide/100 | 2 | 33.4688 → 11.9168 | 38.5079 → 14.3783 | -64.39% / -21.5520 ms | -62.66% / -24.1297 ms |
| primary/document-rules/100 | 1 | 178.3579 → 13.8436 | 187.4834 → 15.8696 | -92.24% / -164.5143 ms | -91.54% / -171.6138 ms |
| primary/document-rules/100 | 2 | 177.6403 → 13.7594 | 187.2631 → 15.9928 | -92.25% / -163.8809 ms | -91.46% / -171.2703 ms |
| primary/embedded/100 | 1 | 532.1482 → 19.7143 | 556.3088 → 23.4720 | -96.30% / -512.4339 ms | -95.78% / -532.8368 ms |
| primary/embedded/100 | 2 | 538.8134 → 20.0384 | 563.8424 → 23.7444 | -96.28% / -518.7750 ms | -95.79% / -540.0980 ms |

## Every failed final comparison (trusted / old-active)

Adverse: >10% AND >1 ms median, >15% AND >2 ms p95, >10% AND >0.5 ms CPU. Confirm the SAME metric in >=3/4 pairs AND its median paired delta. Sign alignment requires >=3/4, including tiny absolute differences; no automatic noise waiver.

| Case | N | Δ median | Δ p95 | Δ CPU | Failed reasons / counts |
|---|---|---|---|---|---|
| guard/plain-narrow/10 | 4 | -2.58% / -0.0784 ms | -7.69% / -0.3557 ms | -0.04% / -0.0049 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| guard/global-rules/10 | 4 | -6.75% / -0.2795 ms | -13.35% / -0.8125 ms | -2.96% / -0.1857 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| read/http-id/plain-wide/100 | 4 | +4.15% / +0.1060 ms | -0.56% / -0.0213 ms | +2.14% / +0.0645 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| read/http-filter/plain-wide/100 | 4 | +0.29% / +0.0078 ms | +0.76% / +0.0281 ms | -2.15% / -0.0737 ms | unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| read/http-filter/hydrated/100 | 4 | +1.58% / +0.0421 ms | +0.41% / +0.0173 ms | +3.14% / +0.0966 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| helper/H4/100 | 4 | +16.70% / +0.3811 ms | +22.03% / +0.7156 ms | +26.69% / +0.6207 ms | confirmed adverse: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 3/4, aligned 4/4 |
| helper/H3-global/10 | 4 | +20.67% / +1.1487 ms | +10.84% / +0.8018 ms | +23.86% / +1.6388 ms | confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest; medianMs: adverse 3/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| helper/H3-global/100 | 4 | +24.98% / +7.2173 ms | +24.14% / +7.4754 ms | +25.09% / +8.7260 ms | confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest; medianMs: adverse 4/4, aligned 4/4; p95Ms: adverse 4/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| native-adapter/direct-read/100 | 4 | -0.90% / -0.0180 ms | +1.01% / +0.0308 ms | -0.49% / -0.0146 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |

## Original FAILED campaign versus new artifact — NOT pooled

`NEW-VS-OLD.{json,md}` lists ALL 90 cases, each old/new N, metrics and outcome separately. Original: 75/90 pass, nine confirmed-adverse and seven sign-unstable comparisons (one overlap). New: 81/90 pass, three confirmed-adverse and six sign-unstable (no overlap). These are each candidate’s delta against its own interleaved baseline, NOT a causal cross-time paired artifact comparison.

| Previously confirmed adverse case | Old Δ median | Old Δ CPU | New Δ median | New Δ CPU | New outcome |
|---|---|---|---|---|---|
| primary/plain-wide/100 | +14.35% / +1.6983 ms | -2.11% / -0.3383 ms | -8.90% / -1.0776 ms | -18.09% / -2.8685 ms | PASS |
| guard/virtuals/10 | +13.92% / +0.6188 ms | +26.63% / +1.4311 ms | +5.48% / +0.2410 ms | +8.97% / +0.4769 ms | PASS |
| guard/hydrated/100 | +11.05% / +1.5276 ms | -0.20% / -0.0356 ms | -8.15% / -1.1436 ms | -15.95% / -3.0772 ms | PASS |
| guard/populate/100 | +16.15% / +2.3490 ms | +4.27% / +0.8464 ms | -6.23% / -0.9347 ms | -12.26% / -2.4207 ms | PASS |
| guard/virtuals/100 | +32.40% / +4.8352 ms | +15.69% / +3.2121 ms | +6.89% / +1.0323 ms | -1.91% / -0.3897 ms | PASS |
| helper/H2-global/100 | +11.04% / +0.3153 ms | +19.18% / +0.6127 ms | +2.37% / +0.0680 ms | +7.51% / +0.2431 ms | PASS |
| helper/H4/100 | +16.73% / +0.3839 ms | +30.56% / +0.7332 ms | +16.70% / +0.3811 ms | +26.69% / +0.6207 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | +41.47% / +2.1664 ms | +42.16% / +2.8204 ms | +20.67% / +1.1487 ms | +23.86% / +1.6388 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | +62.12% / +17.4852 ms | +66.76% / +22.6764 ms | +24.98% / +7.2173 ms | +25.09% / +8.7260 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |

Six of the nine previously confirmed-adverse cases now pass: primary plain-wide; virtuals/10; hydrated/100; populate/100; virtuals/100; H2-global. H3-global/10, H3-global/100 and H4 still fail. New sign failures, including native direct READ, remain failures even when their absolute deltas are small. See all old sign-instability cases in NEW-VS-OLD rather than extrapolating resolution from an average.

## Real READ, helpers and explicit fresh-authority cost

Both real HTTP READ ID/filter paths run three ordinary scenarios plus hydrated/virtual controls, one row from 100 persisted rows. Each success has one findOne read; doc-rule case one hook/24 callbacks, virtuals two getters. Separate packed public findById/findOne probes observe the same counts. Isolated passes 10/10, trusted 7/10. READ benefits never replace LIST gates.
H0 presentation subset adds zero reads/hooks after one initial query. H1 pick/trim/gen/scoped use ZERO DB reads/hooks/getters; predicates see frozen EMPTY facts and fresh captured global/scoped output policy. EMPTY is not current document authority: negative predicates may allow under EMPTY. Metadata/DTO/replay cannot restore a document capability; helpers perform no hidden row query or virtual work.
H2: old one read/hook + handle reuse versus new TWO normal reads/TWO hooks. H3: old one batched read/rows hooks versus new TWO batched reads/twice rows hooks, never rows individual queries. H4 remains one read/one doc hook and candidate **24 field callbacks**; no narrowed guard output. Source/target own-mode, READ-origin retry, actor/freshness/metadata/denied getter probes passed. Retry 2 adapter reads/1 hook; terminal 400/403 zero reads.
All six H2/H3 cost-allowance comparisons pass: compare candidate workflow with OLD initial-query+reuse PLUS matching OLD normal query, then fixed 10% AND 1 ms median / 10% AND 0.5 ms CPU allowance. Added reads are a disclosed breaking-contract cost, not a speedup. Component medians/CPU are an allowance only; no synthetic component p95. Direct new workflow p95 is retained below. H2/H3-global keep global-only work and no extra query; H3-global trusted regressions remain blocking.

| Recipe | Profile | Round | Old reuse median | Matching OLD query median | New median / observed p95 ms | New CPU ms | Δ median allowance | Δ CPU allowance |
|---|---|---|---|---|---|---|---|---|
| helper/H2/100 | isolated | 1 | 6.1591 | 5.0970 | 4.4515 / 5.6076 | 4.6253 | -60.45% / -6.8046 ms | -65.61% / -8.8240 ms |
| helper/H2/100 | isolated | 2 | 5.9409 | 4.8501 | 4.0706 / 5.6304 | 4.3807 | -62.28% / -6.7205 ms | -65.54% / -8.3328 ms |
| helper/H2/100 | trusted | 1 | 2.7713 | 2.6585 | 4.6891 / 6.1184 | 4.6298 | -13.64% / -0.7407 ms | -26.02% / -1.6284 ms |
| helper/H2/100 | trusted | 2 | 2.7618 | 2.6049 | 4.2185 / 5.1313 | 4.3977 | -21.40% / -1.1483 ms | -28.04% / -1.7135 ms |
| helper/H3/10 | isolated | 1 | 30.3640 | 21.7503 | 6.3519 / 9.3421 | 7.4924 | -87.81% / -45.7624 ms | -86.27% / -47.0832 ms |
| helper/H3/10 | isolated | 2 | 29.8003 | 21.4718 | 6.3547 / 8.3079 | 7.3520 | -87.61% / -44.9174 ms | -86.34% / -46.4518 ms |
| helper/H3/10 | trusted | 1 | 5.5205 | 4.0963 | 6.0354 / 8.1822 | 6.8769 | -37.24% / -3.5815 ms | -43.95% / -5.3927 ms |
| helper/H3/10 | trusted | 2 | 5.5229 | 3.9115 | 5.8722 / 7.8320 | 6.6533 | -37.76% / -3.5622 ms | -44.22% / -5.2743 ms |
| helper/H3/100 | isolated | 1 | 267.6016 | 181.9937 | 27.9643 / 29.8657 | 30.7179 | -93.78% / -421.6309 ms | -93.55% / -445.6975 ms |
| helper/H3/100 | isolated | 2 | 263.0058 | 180.1591 | 27.9722 / 30.4542 | 30.6320 | -93.69% / -415.1927 ms | -93.49% / -439.6612 ms |
| helper/H3/100 | trusted | 1 | 29.1753 | 16.0031 | 22.5173 / 24.2893 | 25.1551 | -50.16% / -22.6612 ms | -54.22% / -29.7977 ms |
| helper/H3/100 | trusted | 2 | 28.1866 | 15.4755 | 22.8687 / 24.3899 | 25.1672 | -47.62% / -20.7934 ms | -51.71% / -26.9442 ms |

## Native adapter and unused facts — separately labeled

Supported native direct READ/LIST: ZERO Mongo reads/ONE explicit Mongoose Query adapter call per operation, not Mongo timing. Full Date/Buffer/ObjectId/Code.scope/DBRef.fields/nested native values/cardinality/order/denials match. Candidate untimed overflowing/depleted/wire controls give controlled 400/no partial output. Persisted minimum/current native gates are reused unchanged-source V3/V7, not invented adapter DB timings.

| Comparable case | Profile | N | Δ median | Δ p95 | Δ CPU | Outcome |
|---|---|---|---|---|---|---|
| native-adapter/direct-read/100 | isolated | 2 | -79.65% / -8.3195 ms | -71.15% / -8.5054 ms | -74.18% / -8.3665 ms | PASS |
| native-adapter/direct-read/100 | trusted | 4 | -0.90% / -0.0180 ms | +1.01% / +0.0308 ms | -0.49% / -0.0146 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| native-adapter/direct-list/100 | isolated | 2 | -96.94% / -747.8916 ms | -96.75% / -762.7758 ms | -96.63% / -774.3657 ms | PASS |
| native-adapter/direct-list/100 | trusted | 2 | -19.95% / -3.7121 ms | -22.10% / -4.6029 ms | -23.14% / -5.4616 ms | PASS |
| facts/owner-only/100 | isolated | 2 | -92.58% / -166.1743 ms | -92.17% / -173.1871 ms | -91.93% / -173.1233 ms | PASS |
| facts/owner-only/100 | trusted | 2 | -25.12% / -3.5473 ms | -24.36% / -3.9212 ms | -28.65% / -4.7781 ms | PASS |
| facts/unused-checksum/100 | isolated | 2 | -87.16% / -165.7424 ms | -86.78% / -173.8253 ms | -86.67% / -172.1826 ms | PASS |
| facts/unused-checksum/100 | trusted | 2 | -14.00% / -3.4923 ms | -13.76% / -3.7142 ms | -16.34% / -4.4744 ms | PASS |

Unused facts perform exactly 100 hooks and 100 checksum computations × 10,000 iterations/request, independent of 24 fields. Checksum verified outside timing. Compare ONLY with each profile’s own owner-only fixture; never subtract this cost from primary LIST. Keep both signs/all rounds; no extra own-cost campaign.

| Profile | Round | Own owner-only → unused Δ median | Own Δ CPU | Work/request |
|---|---|---|---|---|
| current-default | 1 | +7.57% / +13.3746 ms | +6.03% / +11.1649 ms | 100 × 10,000 |
| current-default | 2 | +4.38% / +7.9767 ms | +4.98% / +9.5308 ms | 100 × 10,000 |
| current-active | 1 | +78.20% / +10.8652 ms | +66.11% / +10.8250 ms | 100 × 10,000 |
| current-active | 2 | +75.16% / +10.7767 ms | +62.40% / +10.5901 ms | 100 × 10,000 |
| isolated | 1 | +80.21% / +10.8066 ms | +72.46% / +11.0819 ms | 100 × 10,000 |
| isolated | 2 | +86.65% / +11.4087 ms | +76.19% / +11.4952 ms | 100 × 10,000 |
| trusted | 1 | +104.13% / +10.9369 ms | +94.84% / +11.1138 ms | 100 × 10,000 |
| trusted | 2 | +101.70% / +10.8151 ms | +90.36% / +10.9088 ms | 100 × 10,000 |

## Held/released heap and actual field-scaling lifetimes

All six retained-heap gates pass; no retained-heap trigger. Both held AND released phases: actual --expose-gc, four cycles × five operations and three GCs/observation; 20 extra reads/2,000 hooks/2,000×fields callbacks. Actual held row array checked, final observation released. Maximum candidate-minus-baseline positive-clamped own-start growth difference: **0 bytes**, below blocking repeated >15% AND >1 MiB. Starting heaps and signed growth follow; JIT/GC variation is not allocation evidence.

| Profile | Fields | Rounds | Start heap KiB | Median held growth KiB | Median released growth KiB |
|---|---|---|---|---|---|
| current-default | 4 | 1 / 2 | 38597.08 / 38608.59 | +134.91 / +153.85 | -371.11 / -354.45 |
| current-default | 24 | 1 / 2 | 35591.48 / 36090.77 | +853.46 / +856.77 | -363.38 / -362.08 |
| current-default | 48 | 1 / 2 | 35868.48 / 35900.66 | +1697.69 / +1697.65 | -396.32 / -389.94 |
| current-active | 4 | 1 / 2 | 38712.76 / 38739.19 | +112.62 / +103.51 | -364.77 / -372.23 |
| current-active | 24 | 1 / 2 | 39099.11 / 39103.98 | +806.89 / +807.24 | -388.54 / -387.48 |
| current-active | 48 | 1 / 2 | 39483.48 / 39540.38 | +1641.09 / +1635.87 | -388.82 / -381.22 |
| isolated | 4 | 1 / 2 | 37948.27 / 37945.82 | -183.28 / -174.96 | -287.44 / -279.12 |
| isolated | 24 | 1 / 2 | 38339.80 / 38287.84 | -72.97 / -67.64 | -289.10 / -283.66 |
| isolated | 48 | 1 / 2 | 38740.23 / 38681.12 | +32.33 / +53.37 | -317.77 / -287.32 |
| trusted | 4 | 1 / 2 | 37501.98 / 37504.43 | -131.98 / -132.35 | -217.07 / -217.46 |
| trusted | 24 | 1 / 2 | 37867.82 / 37827.83 | -12.84 / -10.87 | -208.21 / -205.95 |
| trusted | 48 | 1 / 2 | 38250.13 / 38348.14 | +109.26 / +116.62 | -199.28 / -204.59 |

Separate actual six-row/one-embedded-child instrumentation: six hooks/one adapter call and 24/144/288 callbacks at 4/24/48 fields; six raw fact normalizations/six immutable fact identities. Each mode has all 12 resolved root/embedded stages closed/cleared; 36 close-function calls are idempotent invocations, not 36 stages. Candidate whole-root view copies stay 12/12/12 isolated, 0/0/0 trusted; general copy entry calls seven, no grant-map copies. Field memo invocations 66/306/594 naturally scale with selected fields, not whole-graph copies.
`STAGE-PROJECTION-CLEAR-AUDIT.json` supplements the unchanged campaign probe after measurement: an untimed private instrumentation copy observes actual immutable `access`/`view` projection creation AND asserts both pointers cleared on all 12 stages per operation, both modes/three widths (36 creations/clears per mode). It uses zero Mongo reads/one explicit adapter call per operation, adds no timings or campaign data and changes no accepted tool. First supplement failed because JavaScript replacement expanded `$&` too early; failed generated copy/log remain. Corrected supplement uses functional replacement/fresh paths and passes. This was a local untimed audit-code error, not an accepted harness/campaign bug.
Old-default per-field source/grant copying and fact identities remain separately observable; old-active already omitted much copying. Held/released GC, constant candidate root copies and actual cleared pointers show no demonstrated superlinear retained per-field graph here. They do NOT prove total allocations or universally absent graph growth.

## Identities, reused scoped gates and disposition

`IDENTITY-before-rebuild.json` / `IDENTITY-after-rebuild.json`: exact inventories/hashes of **620 candidate / 552 baseline files, 573 source records, 13 tools, 67 dist outputs, 134 dependency records/3,510 files, 293 tool packages/10,545 files**; lock/Node/pnpm/Mongo binaries and before/after campaign seals match. All **1,246,615 incoming historical paths** retain size/mtime/ctime/mode/link identity. Includes old failed campaign, interrupted setup, accepted OAR-09C evidence/caches/artifacts; no broad clone.
After campaign/raw audit, the sole serial scoped post-gate build was `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build`: utils, http-errors, express-response-handler, express-json-router, access-router and deco. PASS; exact all-67 inventory and hashes equal accepted metadata. Fresh private pnpm/XDG/TMP/Mongo-download paths; downloads disabled, pinned system binary read-only. No install or old artifact build.
Reused, NOT rerun, OAR-09C final full gates: **5,853 core / 181 files; 742 deco / 23 files; 44 benchmark tests** with no failures/pending/skipped/cancelled, plus source/deco types/lint/format/diff. Actual metadata-pinned log/results hashes and all assertions rechecked; source bytes unchanged. Actual installed V7: 175 core and 27 deco consumer cases; 20 guide executions/60 HTTP responses/80 reads/hooks; minimum Express 5.0.0/Mongoose 8.0.0 (skipLibCheck true) and current 5.2.1/9.8.0 (full declaration check), both tarball/artifact-tree; TS 6.0.3. Rehashed actual installed outputs and all 14 core outputs/eight declarations inside tarballs, no tests/src leaked, 19 packed files. Surface counts ESM/CJS root/advanced/processors 46/48/6 unchanged.
Measured/current root ESM: `1d3b509cbe2f34cfba076bbc10779091aef1592001914b37a700165987eea54e`. Original baseline ESM: `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`. Metadata SHA256 `4aedee50018253dd99c36bff1f3b166ac3d3519857a73033317755e8c76b91b4`; config `63482befc9e13b80685993ee7781ab53998f7553ffe4311b01bf0aebf44f29f7`. HEAD `58b22c0d6d3abd4ecce03533e3867d148ff21233` / lock `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
Node v26.12.1, pnpm 11.18.0, MongoDB 8.2.6 with pinned binary hashes. Mongo server CPU and true allocation counters unavailable; heap bytes are not allocations. Two/four pairs are a bounded reproducibility screen, not statistical significance, confidence intervals, universal speedup, production representativeness or blanket security equivalence. Callback closure/external freshness and unused facts remain application concerns.
**Disposition required:** preserve all nine failed trusted gates. OAR-09B measurement/evidence is delivered, but OAR-09 is NOT performance-accepted/completed and OAR-10 must NOT start. No further optimization, threshold/workload/sample changes, waiver or additional campaign inferred. Coordinator alone edits task/status. No delegation, task edit, commit/publish/dependency/lock change/revert/workspace-wide verification occurred. No owned jobs remain; all changes in this child are new ignored evidence except the authorized byte-identical six-package rebuild.
