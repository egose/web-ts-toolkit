> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09B fixed campaign: acceptance FAILED; OAR-09 stays OPEN

The investigation ran to completion once. Protective isolated/default passes all three primary benefit gates and all 45 comparisons. Trusted/old-active passes 30/45: **nine confirmed adverse comparisons and seven unresolved sign-instability comparisons**, overlapping in one case, leave **15 failed final gates**. Retained-heap gates pass. These results do not authorize OAR-09 completion, OAR-10, a waiver, performance optimization, a new measurement campaign, or restoration of the legacy engine.

## Campaign and independent reconciliation

- Accepted configuration and runbook: `docs/task-artifacts/access-router/oar09a-recovery-ot_jqpby/final-02/FINAL-PROTOCOL.{json,md}` only. Baseline is the SAME sealed old artifact, all ten controls OFF (`current-default`) / ON (`current-active`), not two versions. New modes are actual shipped isolated/trusted enums.
- Campaign UTC: **2026-11-01 21:35:40.393–22:07:47.748**, wrapper elapsed **1,930.013 seconds**; CLI exit **1**, correctly reflecting failed performance gates, not an infrastructure failure. No campaign job failed.
- **45 cases × four profiles × two reversed rounds = 360 initial jobs**. The runner triggered exactly two further reversed pairs for **26 affected comparisons** (one isolated, 25 trusted): **104 extra jobs**, **464 total**, rounds **180/180/52/52**, **39,800 measured requests**. No selective final run, discarded observations, substituted cases, increased samples or campaign restart.
- Fixed ordinary/primary settings: 100 rows, 24 fields, 32 bytes, one client, hook concurrency 10, five warmups, 100 samples/job. All six guards at 10/100 rows use 50 samples. READ returns one row from 100 persisted rows; retention widths are exactly 4/24/48 fields.
- `recompute-raw.py` imports no benchmark code. It reconstructs the frozen catalog, every expected full response and canonical SHA256, actual read/hook/getter/callback/expensive-work counts, real getter proofs, settings, every raw job summary, exact initial/repeat order and paired gates. **All 39,800 expected fingerprints match**; job/result/log inventories and positive measured elapsed times are checked. CPU = actual Node process user+system microseconds / 1,000 / samples. p95 = nearest-rank per job. Every raw metric and recomputed gate agrees with the report.
- `RAW-JOB-AUDIT.json` preserves per-job raw CPU/elapsed and inventories; `RAW-PAIRED-AUDIT.json` preserves every pair and separate initial/final aggregates. **`ALL-GATES.md` lists all 90 final gates, including failed ones, with initial N=2 and final N=2/4 separately. `PAIR-DETAILS.md` lists every original/repeat pair.** No request pooling or ratio of pooled medians.
- Both artifacts use `checked-each-response-v1`; historical row-count-only timing is not pooled or relabeled. Sealed workers assert complete expected responses before and after measurement as well as on every measured response. LIST latency excludes the deep post-response check while its process CPU includes it; separately labeled owned workflows include their checks in latency.

## All-family final-gate coverage

| Family | Cases/profile | Isolated/default passed | Trusted/active passed | Jobs including repeats |
|---|---|---|---|---|
| primary | 3 | 3/3 | 1/3 | 32 |
| guard | 12 | 12/12 | 6/12 | 132 |
| read | 10 | 10/10 | 8/10 | 112 |
| helper | 13 | 13/13 | 8/13 | 132 |
| native-adapter | 2 | 2/2 | 2/2 | 16 |
| facts | 2 | 2/2 | 2/2 | 16 |
| retention | 3 | 3/3 | 3/3 | 24 |

## Primary LIST: matched paired deltas

Negative means candidate lower/faster. Values are median-of-paired percent AND absolute differences. Benefit requires at least 10% AND 1 ms median, 10% AND 0.5 ms CPU, with both initial pairs improving both. All three isolated primary workloads pass in both initial rounds; no benefit repeats were needed. Trusted gets no credit for work old-active already omitted.

| Case | Comparison | N | Δ median | Δ p95 | Δ CPU/request | Gate |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated / default | 2 | -54.01% / -17.5673 ms | -52.74% / -18.5811 ms | -53.30% / -19.8105 ms | PASS |
| primary/plain-wide/100 | trusted / active | 4 | +14.35% / +1.6983 ms | +5.90% / +0.8425 ms | -2.11% / -0.3383 ms | FAIL: confirmed adverse: medianMs |
| primary/document-rules/100 | isolated / default | 2 | -91.40% / -161.6874 ms | -90.64% / -172.5821 ms | -90.28% / -167.6237 ms | PASS |
| primary/document-rules/100 | trusted / active | 2 | -7.79% / -1.0722 ms | -8.05% / -1.2756 ms | -14.03% / -2.3675 ms | PASS |
| primary/embedded/100 | isolated / default | 2 | -95.09% / -483.5958 ms | -94.73% / -499.8746 ms | -94.45% / -502.9789 ms | PASS |
| primary/embedded/100 | trusted / active | 4 | +1.29% / +0.3111 ms | -0.49% / -0.1357 ms | -4.29% / -1.2152 ms | FAIL: unresolved sign instability: p95Ms |

| Protective workload | Round | Old → new median ms | Old → new CPU ms/request | Δ median | Δ CPU |
|---|---|---|---|---|---|
| primary/plain-wide/100 | 1 | 32.3570 → 15.3077 | 36.8719 → 17.6439 | -52.69% / -17.0494 ms | -52.15% / -19.2279 ms |
| primary/plain-wide/100 | 2 | 32.6908 → 14.6056 | 37.4550 → 17.0620 | -55.32% / -18.0852 ms | -54.45% / -20.3930 ms |
| primary/document-rules/100 | 1 | 179.8019 → 15.1310 | 187.7389 → 17.8735 | -91.58% / -164.6709 ms | -90.48% / -169.8654 ms |
| primary/document-rules/100 | 2 | 173.9726 → 15.2687 | 183.5935 → 18.2114 | -91.22% / -158.7039 ms | -90.08% / -165.3820 ms |
| primary/embedded/100 | 1 | 502.8230 → 24.4138 | 528.9079 → 28.6551 | -95.14% / -478.4092 ms | -94.58% / -500.2528 ms |
| primary/embedded/100 | 2 | 514.3344 → 25.5520 | 536.1169 → 30.4120 | -95.03% / -488.7824 ms | -94.33% / -505.7050 ms |

## Every failed final comparison (all trusted versus old-active)

Material adverse is >10% AND >1 ms median, >15% AND >2 ms p95, or >10% AND >0.5 ms CPU. Confirmation needs the SAME metric adverse in at least three of four pairs and on its median paired delta. Final signs must align in at least three of four pairs, even when an unstable delta is small. Failures are not excused as noise or silently waived.

| Case | N | Δ median | Δ p95 | Δ CPU | Failed gate; adverse-pair counts / aligned-pair counts |
|---|---|---|---|---|---|
| primary/plain-wide/100 | 4 | +14.35% / +1.6983 ms | +5.90% / +0.8425 ms | -2.11% / -0.3383 ms | confirmed adverse: medianMs; medianMs: adverse 3/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| primary/embedded/100 | 4 | +1.29% / +0.3111 ms | -0.49% / -0.1357 ms | -4.29% / -1.2152 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| guard/large-config/10 | 4 | +2.21% / +0.0858 ms | +7.98% / +0.4566 ms | +6.55% / +0.3616 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 1/4, aligned 3/4 |
| guard/virtuals/10 | 4 | +13.92% / +0.6188 ms | +9.66% / +0.5797 ms | +26.63% / +1.4311 ms | confirmed adverse: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 3/4, aligned 3/4 |
| guard/plain-narrow/100 | 4 | +3.92% / +0.2471 ms | +11.46% / +0.9306 ms | -0.37% / -0.0313 ms | unresolved sign instability: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| guard/hydrated/100 | 4 | +11.05% / +1.5276 ms | +5.32% / +0.9124 ms | -0.20% / -0.0356 ms | confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest; medianMs: adverse 3/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 0/4, aligned 2/4 |
| guard/populate/100 | 4 | +16.15% / +2.3490 ms | +13.17% / +2.2966 ms | +4.27% / +0.8464 ms | confirmed adverse: medianMs; medianMs: adverse 4/4, aligned 4/4; p95Ms: adverse 1/4, aligned 4/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| guard/virtuals/100 | 4 | +32.40% / +4.8352 ms | +27.15% / +4.6963 ms | +15.69% / +3.2121 ms | confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest; medianMs: adverse 4/4, aligned 4/4; p95Ms: adverse 4/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| read/http-filter/embedded/100 | 4 | +0.76% / +0.0201 ms | +5.15% / +0.2164 ms | +2.46% / +0.0836 ms | unresolved sign instability: medianMs; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 0/4, aligned 4/4 |
| read/http-filter/hydrated/100 | 4 | +4.83% / +0.1301 ms | +4.30% / +0.1644 ms | +5.35% / +0.1628 ms | unresolved sign instability: medianMs; medianMs: adverse 0/4, aligned 2/4; p95Ms: adverse 0/4, aligned 3/4; cpuMsPerRequest: adverse 1/4, aligned 3/4 |
| helper/H0/100 | 4 | +1.83% / +0.0469 ms | +0.12% / +0.0026 ms | +2.84% / +0.0849 ms | unresolved sign instability: p95Ms; medianMs: adverse 0/4, aligned 3/4; p95Ms: adverse 0/4, aligned 2/4; cpuMsPerRequest: adverse 0/4, aligned 3/4 |
| helper/H2-global/100 | 4 | +11.04% / +0.3153 ms | +14.46% / +0.5403 ms | +19.18% / +0.6127 ms | confirmed adverse: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 3/4, aligned 4/4 |
| helper/H4/100 | 4 | +16.73% / +0.3839 ms | +21.70% / +0.7160 ms | +30.56% / +0.7332 ms | confirmed adverse: cpuMsPerRequest; medianMs: adverse 0/4, aligned 4/4; p95Ms: adverse 0/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| helper/H3-global/10 | 4 | +41.47% / +2.1664 ms | +22.87% / +1.6534 ms | +42.16% / +2.8204 ms | confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest; medianMs: adverse 4/4, aligned 4/4; p95Ms: adverse 2/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |
| helper/H3-global/100 | 4 | +62.12% / +17.4852 ms | +63.34% / +20.0334 ms | +66.76% / +22.6764 ms | confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest; medianMs: adverse 4/4, aligned 4/4; p95Ms: adverse 4/4, aligned 4/4; cpuMsPerRequest: adverse 4/4, aligned 4/4 |

## READ, helper semantics and explicit refresh costs

Both real generated HTTP READ-by-ID and READ-by-filter run plain-wide/document-rules/embedded plus hydrated/virtual controls. Every successful operation has exactly one actual findOne read; document rules have one hook and 24 callbacks; virtuals have two getters. Separate public findById/findOne probes also each observe one read and the correct hooks. Hydration is observed, not inferred. READ has no required benefit: isolated passes 10/10; trusted passes 8/10, failing only unresolved median signs in filter embedded/hydrated above. No READ improvement substitutes for a LIST gate.

H0 is a presentation subset: one initial read, zero extra subset reads/hooks. H1 pick/trim/gen and scoped H1 have **zero reads/hooks/getters**. New raw helpers have frozen EMPTY document facts; a negative predicate may permit a field under EMPTY, so EMPTY is emphatically NOT proof of current document authority. Already-filtered DTOs, copies/serialization and permission metadata cannot restore document authority; no new public handle exists.

H2 refresh is old one read/one hook versus new **two reads/two hooks**. H3 is old one batched read/rows hooks versus new **two batched reads/twice rows hooks**, never per-row queries. H4 private guard remains exactly one read/one hook; candidate field evaluation performs 24 callbacks. Untimed freshness/actor/source-target/READ-LIST mutation and retry probes pass; retry is two adapter reads/one hook and terminal 400/403 zero reads. No claim is made that closures or external permissions are immutable.

For H2/H3 the gate comparator is **old initial-query+handle workflow PLUS a matching OLD normal query**, then the same fixed median/CPU allowance. Component medians/CPU are a cost allowance, not a distribution. The directly observed NEW workflow p95 is below, and no component p95 is invented. All six refresh comparisons pass this allowance, despite the disclosed extra read. H2-global/H3-global keep global-only work and no extra read; their trusted CPU/latency regressions above remain blockers. H1/scoped raw cases themselves pass both matched profiles.

| Recipe | New profile | Round | Old reuse median ms | Matching OLD query median ms | New workflow median / observed p95 ms | New CPU ms/request | Δ allowance median | Δ allowance CPU |
|---|---|---|---|---|---|---|---|---|
| helper/H2/100 | isolated | 1 | 5.5613 | 5.0834 | 4.5274 / 5.5943 | 5.1221 | -57.47% / -6.1174 ms | -60.07% / -7.7061 ms |
| helper/H2/100 | isolated | 2 | 5.7198 | 4.7035 | 4.2955 / 5.7537 | 4.5811 | -58.79% / -6.1277 ms | -62.61% / -7.6711 ms |
| helper/H2/100 | trusted | 1 | 2.9368 | 2.3246 | 4.3289 / 5.8729 | 4.7695 | -17.72% / -0.9325 ms | -23.24% / -1.4444 ms |
| helper/H2/100 | trusted | 2 | 2.8163 | 2.4874 | 3.9968 / 5.3288 | 4.3325 | -24.64% / -1.3069 ms | -28.00% / -1.6850 ms |
| helper/H3/10 | isolated | 1 | 30.4897 | 20.8799 | 7.3414 / 9.6189 | 8.3076 | -85.71% / -44.0282 ms | -84.61% / -45.6881 ms |
| helper/H3/10 | isolated | 2 | 28.8699 | 20.7717 | 6.6221 / 8.4941 | 7.6806 | -86.66% / -43.0195 ms | -85.26% / -44.4116 ms |
| helper/H3/10 | trusted | 1 | 5.2802 | 3.8023 | 6.8510 / 9.6688 | 7.7182 | -24.57% / -2.2315 ms | -32.62% / -3.7358 ms |
| helper/H3/10 | trusted | 2 | 5.2818 | 3.7248 | 6.3173 / 7.4099 | 7.1711 | -29.86% / -2.6893 ms | -37.51% / -4.3042 ms |
| helper/H3/100 | isolated | 1 | 258.2467 | 181.5234 | 30.1192 / 33.3947 | 33.4755 | -93.15% / -409.6509 ms | -92.76% / -428.6401 ms |
| helper/H3/100 | isolated | 2 | 255.2956 | 173.7484 | 30.4080 / 32.4586 | 33.7546 | -92.91% / -398.6360 ms | -92.58% / -421.2372 ms |
| helper/H3/100 | trusted | 1 | 26.9458 | 14.8508 | 25.7482 / 28.5107 | 28.6145 | -38.40% / -16.0484 ms | -42.60% / -21.2339 ms |
| helper/H3/100 | trusted | 2 | 27.4972 | 14.8216 | 25.6498 / 27.6805 | 28.5654 | -39.39% / -16.6690 ms | -44.36% / -22.7756 ms |

## Native adapter and expensive unused facts: separate costs

Native supported direct READ/LIST have **ZERO Mongo reads and exactly ONE explicit Mongoose Query adapter call** per operation. Full bounded values, LIST cardinality/order, denied fields, Buffer/Date/ObjectId/Code/DBRef/nested Map outputs match. Untimed candidate oversized/wire fixtures return controlled 400 without partial output; historical admission differences are retained observations, not a claimed new-contract baseline guarantee. Actual persisted native/minimum/current peer coverage is reused from unchanged V3/V7, not represented as measured adapter Mongo timing.

| Native/fact comparable case | New profile | N | Δ median | Δ p95 | Δ CPU | Gate |
|---|---|---|---|---|---|---|
| native-adapter/direct-read/100 | isolated | 2 | -78.78% / -7.6718 ms | -71.71% / -8.0163 ms | -71.53% / -7.5489 ms | PASS |
| native-adapter/direct-read/100 | trusted | 2 | -1.86% / -0.0365 ms | +9.03% / +0.2505 ms | +8.23% / +0.2054 ms | PASS |
| native-adapter/direct-list/100 | isolated | 2 | -96.64% / -723.7263 ms | -96.48% / -763.1295 ms | -96.29% / -749.7157 ms | PASS |
| native-adapter/direct-list/100 | trusted | 2 | -12.86% / -2.5281 ms | -15.21% / -3.4844 ms | -17.46% / -4.3908 ms | PASS |
| facts/owner-only/100 | isolated | 2 | -91.74% / -168.2487 ms | -91.68% / -193.5061 ms | -91.11% / -178.4626 ms | PASS |
| facts/owner-only/100 | trusted | 2 | -10.48% / -1.4703 ms | -7.81% / -1.2508 ms | -14.72% / -2.4304 ms | PASS |
| facts/unused-checksum/100 | isolated | 2 | -86.03% / -157.7686 ms | -85.68% / -167.9492 ms | -85.47% / -163.6818 ms | PASS |
| facts/unused-checksum/100 | trusted | 2 | -7.24% / -1.8395 ms | -10.05% / -2.9102 ms | -10.96% / -3.1107 ms | PASS |

Expensive facts perform exactly **100 document hooks and 100 checksum computations × 10,000 iterations per request**, not per field. The deliberately unused fact is compared against each profile’s OWN owner-only fixture; it is never subtracted from ordinary primary benefit. Every measured checksum matches the deterministic computation. The old-default own-cost rounds differ in sign; report both, do not interpret the negative round as proof the checksum is free or beneficial. These own-cost observations do not authorize an extra repeat batch.

| Profile | Round | Own owner-only → unused Δ median | Own Δ CPU | Computations/request |
|---|---|---|---|---|
| current-default | 1 | -3.01% / -5.6234 ms | -4.75% / -9.5141 ms | 100 × 10,000 |
| current-default | 2 | +3.14% / +5.6369 ms | +0.45% / +0.8582 ms | 100 × 10,000 |
| current-active | 1 | +78.72% / +10.7549 ms | +67.35% / +10.7300 ms | 100 × 10,000 |
| current-active | 2 | +82.26% / +11.7185 ms | +74.05% / +12.5079 ms | 100 × 10,000 |
| isolated | 1 | +68.34% / +10.2198 ms | +61.05% / +10.3305 ms | 100 × 10,000 |
| isolated | 2 | +70.24% / +10.7538 ms | +59.25% / +10.5750 ms | 100 × 10,000 |
| trusted | 1 | +83.55% / +10.5400 ms | +73.77% / +10.3931 ms | 100 × 10,000 |
| trusted | 2 | +90.63% / +11.1949 ms | +82.77% / +11.4841 ms | 100 × 10,000 |

## Retained heap and structural lifetimes

All six paired retained-heap comparisons pass, N=2 each; no retention-trigger repeats. Both held AND released observations use actual --expose-gc, four cycles × five extra operations and three GCs per observation; exactly 20 extra reads / 2,000 hooks / 2,000×fields callbacks. The held row array really exists; the last observation is released. Every candidate-minus-baseline positive-clamped own-start growth difference is <=0 bytes, well below >15% AND >1 MiB. Absolute starting heaps and signed own-start growth are shown rather than hiding negative growth. These heap numbers include runtime/JIT/GC variation and are NOT true allocation counts.

| Profile | Fields | Round 1 / 2 start heap KiB | Round 1 / 2 median held growth KiB | Round 1 / 2 median released growth KiB |
|---|---|---|---|---|
| current-default | 4 | 38594.21 / 38606.62 | +151.43 / +145.91 | -356.73 / -364.02 |
| current-default | 24 | 35602.90 / 36165.67 | +856.99 / +803.06 | -360.06 / -415.39 |
| current-default | 48 | 35793.25 / 35818.84 | +1707.86 / +1702.53 | -382.76 / -380.60 |
| current-active | 4 | 38741.14 / 38758.20 | +107.33 / +99.45 | -371.40 / -378.96 |
| current-active | 24 | 39107.32 / 39097.09 | +806.30 / +806.24 | -388.24 / -388.47 |
| current-active | 48 | 39534.88 / 39545.88 | +1648.94 / +1633.16 | -387.99 / -388.99 |
| isolated | 4 | 37947.28 / 37894.36 | -182.67 / -173.09 | -285.70 / -274.79 |
| isolated | 24 | 38227.73 / 38303.84 | -93.15 / -70.57 | -286.12 / -268.47 |
| isolated | 48 | 38795.91 / 38655.88 | +55.17 / +48.30 | -273.35 / -283.51 |
| trusted | 4 | 37505.53 / 37553.84 | -136.83 / -104.05 | -224.52 / -209.35 |
| trusted | 24 | 37827.91 / 37834.84 | +4.43 / +0.75 | -196.12 / -197.57 |
| trusted | 48 | 38310.10 / 38509.44 | +113.54 / +104.47 | -214.84 / -217.93 |

The separate instrumented six-row/one-embedded-child probe observes one adapter call, six hooks and 24/144/288 field callbacks at 4/24/48 fields. Candidate raw fact normalizations = six, fact identities = six. All **12 root/embedded resolved stages close and clear**; cleared records have no source/grants/call/binding/publication/owning/result and empty decisions. There are 36 idempotent close-function invocations, NOT 36 distinct stages. Normalizer entry calls total 24 but only six normalize raw maps; owned fast-return calls are not new map traversals. Isolated whole-root callback-view copies remain **12/12/12**; trusted **0/0/0**. Both have constant seven general copy-function invocations and no copied grant maps/DTO association or graph-transfer engine. Memo work naturally scales with selected fields (78/318/606).

For comparison, instrumented old-default source copy calls grow 741/2,421/4,437, raw grant copy calls 114/354/642 and distinct callback fact identities 24/144/288. Old-active already has zero such source/grant copies and six fact identities; those omissions are not credited as a new trusted gain. These are observations of specific real function seams, not inferred mode-label work counts or byte-allocation measurements. Across every width, constant candidate root copies, cleared stage pointers and actual held/released observations show **no demonstrated superlinear retained per-field graph** here. Heap noise alone proves neither graph growth nor its universal absence.

## Artifact integrity, reused full gates, limits and disposition

`IDENTITY-before-rebuild.json` and `IDENTITY-after-rebuild.json` independently verify: 552 baseline copied files, 619 candidate copied files, 572 source records, all 13 tool records, all 67 necessary dist files, 134 dependency records/3,510 files and 293 tool dependency records/10,545 files, lock/Node/pnpm/Mongo hashes, campaign seals and all 1,392 raw job/result/log streams. All **1,044,052 incoming historical paths** retain size/mtime/ctime/mode/link identity; protected gate/runbook/task/manifest byte hashes also match. No old evidence/cache/artifact was rebuilt, cloned broadly or modified.

After the campaign and raw audit finished, the foreground serial `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build` rebuilt only utils, http-errors, express-response-handler, express-json-router, access-router and access-router-deco. It passes; every accepted output hash matches. Fresh isolated offline pnpm/cache/TMPDIR infrastructure was used. No installs/dependency changes, source/tool edits during timing, workspace-wide verification, task/status edits, delegation, commit/publish, revert or OAR-10.

Unchanged source/product bytes preserve OAR-09A full-gate validity: 5,837 core cases/180 files, 742 deco/23 files, zero failures/pending; source/deco types and actual packed ESM/CJS/Bundler/Node16/NodeNext minimum/current peer/doc matrices; final 44 benchmark tests with zero skipped/cancelled; scoped lint/format/diff. Their actual logs/results were hash-audited, not rerun or mislabeled as newly executed here. The earlier failed root/smoke packet is never substituted for final-02.

Runtime: Node v26.12.1; pnpm 11.18.0; actual MongoDB 8.2.6. MongoDB server CPU and true allocation counters are unavailable. Two/four pairs are a bounded reproducibility screen, not confidence intervals, significance, production representativeness, blanket security equivalence, a universal speedup or historical v0.51 parity. Native adapters and real Mongo workflows remain distinct; application external freshness and expensive unused facts are application costs.

**Disposition:** OAR-09B investigation evidence is delivered, but OAR-09 completion is NOT accepted. The coordinator must retain the failed trusted adverse/sign gates and explicitly disposition the performance tradeoffs before completion. No fixed retention gate failed, so this packet requests no user retention-gate decision. Do not optimize, move thresholds, fish with additional samples/batches or start OAR-10 from this handoff. No owned benchmark/build/test/Mongo jobs remain; all work is uncommitted and unpublished.
