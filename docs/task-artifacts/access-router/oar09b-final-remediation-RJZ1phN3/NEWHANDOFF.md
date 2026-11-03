> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09B final-remediation remeasurement — delivered; acceptance FAILED

**OAR-09 remains OPEN. Do not start OAR-10.** The accepted OAR-09D artifact was
measured once using the unchanged fixed protocol. **78/90 comparisons pass**:
**45/45 isolated/default**, **33/45 trusted/old-active**. Three confirmed-adverse
helper comparisons and ten sign-unstable comparisons remain, with one overlap:
**12 failed final gates**. No noise waiver, automatic third fix, new campaign,
sample/workload/threshold change or performance acceptance follows.

## Exact delivery / execution

- All new evidence: **`_tmp-oar09b-final-remediation-RJZ1phN3/`** only. No source,
  task/status, dependency/lock, accepted artifact/tool or old-evidence edits.
  Coordinator alone reconciles shared task/status.
- Accepted ONLY `docs/task-artifacts/access-router/oar09d-hVF7iALN/final-01/FINAL-PROTOCOL.{json,md}` and
  adjacent candidate artifact/metadata. Original OAR-01 baseline remains the
  comparator, with identical bytes and ten old controls OFF/ON. OAR-09A/09C older
  candidates were NOT measured in this campaign.
- One `--plan` passed; **ONE `--run` completed 444 jobs / 38,800 measured responses**:
  **360 initial jobs**, then **84 jobs** for exactly two additional reversed pairs
  on **21 triggered comparisons** (20 trusted, one isolated H1-scoped). Rounds
  **180/180/42/42**. No discards, selective cases, increased samples or reruns.
- UTC **2026-11-02 03:27:59.977–03:59:09.976**, foreground wrapper **1,872.719 s**.
  CLI **exit 1 is a valid gate failure**, not infrastructure failure. Zero job,
  response/count/fingerprint failures. Eight preflights pass. One Mongo/one worker,
  serial foreground and awaited cleanup; no owned jobs remain.
- `run-command.py` logs exact argv/environment/exit/elapsed, owns NEW TMPDIR,
  WTT_BENCH_TMP, XDG/Mongo-download/npm/pnpm caches/store. Runtime download disabled;
  metadata-pinned Mongo binary read-only. `run-LAUNCHED.json` prevents relaunch.

## Quantitative result

All three isolated/default primary LISTs improve median AND CPU in both initial
pairs and meet the fixed >=10% AND 1 ms latency / >=10% AND 0.5 ms CPU benefit gates.

| Primary LIST | Median paired latency delta | CPU/request delta |
|---|---|---|
| plain-wide | −63.75% / −21.8186 ms | −62.70% / −24.8806 ms |
| document-rules | −92.41% / −165.1150 ms | −91.65% / −173.5365 ms |
| embedded | −96.21% / −508.2274 ms | −95.78% / −531.5988 ms |

Trusted primary LISTs all pass (plain-wide uses the required N=4 after a sign
trigger). This does not waive the following helper regressions:

| Trusted case, all N=4 | Median delta | p95 delta | CPU delta | Confirmed adverse metric/count |
|---|---|---|---|---|
| H4 guard | +16.96% / +0.3770 ms | +10.94% / +0.3703 ms | +27.09% / +0.6161 ms | CPU 3/4 |
| H3-global/10 | +11.49% / +0.6267 ms | +1.46% / +0.1213 ms | +19.04% / +1.2963 ms | CPU 4/4; p95 also sign-unstable |
| H3-global/100 | +12.85% / +3.6926 ms | +13.90% / +4.3507 ms | +15.54% / +5.5210 ms | median 3/4, CPU 4/4 |

Confirmed metrics cross BOTH percent and ms thresholds on the median paired delta
and the SAME metric in >=3/4 pairs. H4 and H3/10 median do **not** cross the 1 ms
absolute gate; H3/100 p95 does **not** cross 15%. They are not mislabeled adverse.

All ten unresolved-sign comparisons (N=4, named metrics only 2/4 aligned):

1. `guard/virtuals/10`: p95, CPU.
2. `read/http-id/document-rules/100`: p95.
3. `read/http-id/hydrated/100`: CPU (+0.0005 ms aggregate is still not waived).
4. `read/http-id/virtuals/100`: median, p95, CPU.
5. `read/http-filter/document-rules/100`: median, p95.
6. `read/http-filter/virtuals/100`: p95.
7. `helper/H2-query/100`: CPU.
8. `helper/H2-global/100`: median.
9. `helper/H3-global/10`: p95 (overlaps the confirmed CPU regression above).
10. `native-adapter/direct-read/100`: median.

`ALL-GATES.md`, `PAIR-DETAILS.md`, `INITIAL-REPEAT-FINAL.{json,md}` and
`REPEAT-ONLY-SUMMARY.{json,md}` retain every initial/repeat/final N, delta and failure.
`ADVERSE-OBSERVATIONS` preserves all 19 individual adverse pair/metric observations,
including unconfirmed ones. No repeat-only N=2 substitutes for the all-four gate.

## Independent raw audit and family limits

- NEW standalone Python `recompute-raw.py` imports NO benchmark modules and executes
  NO prior entrypoint. It reconstructs every setting/order/repeat trigger, expected
  full response/cardinality/denial/order, hydration and source/target exact+bulk
  getters, raw median/nearest-rank p95/user+system CPU/elapsed, per-pair percent AND ms,
  and median-of-pairs gates. **38,800/38,800 expected measured fingerprints match**;
  all statistics and gates agree with CLI. `RAW-JOB-AUDIT.json` preserves raw CPU and
  job/log hashes; `RAW-PAIRED-AUDIT.json` all decisions. No request pooling.
- Workers deep-check before/after and every measured response on BOTH artifacts.
  `checked-each-response-v1` stays separate from historical OAR-01 row-count-only
  timing. Legacy LIST deep checks excluded from latency but included in process CPU;
  owned workflow latency includes checks. Compiler inspection outside measured heap.
- H0 presentation and H1 raw/scoped helpers add ZERO reads/doc hooks/virtuals. Raw
  helpers retain fresh global/scoped policy, ISOLATED output-only source and frozen
  EMPTY facts, not current document authority or recovered DTO metadata/handles.
- H2 current authority adds one normal read/hook; H3 adds ONE batched read/rows hooks,
  not per-row queries. All **six refresh allowances pass**, against OLD query+reuse
  PLUS matching OLD query, with the unchanged allowance. Direct new p95 reported;
  component medians/CPU are an allowance, never a synthetic p95 distribution.
- H4 still has **one read / one hook / 24 field callbacks** and unchanged selection.
  Real HTTP ID/filter READ plus direct findById/findOne probes retain exact counts.
  Native adapter READ/LIST is explicitly **ZERO Mongo reads / ONE adapter call**;
  overflow/wire/budget probes are untimed controlled failures, not faster workloads.
- Unused facts cost exactly **100 × 10,000 iterations/request**, one computation/hook.
  Trusted OWN owner-only→unused median costs +10.8411/+10.7055 ms and CPU
  +10.8422/+10.8312 ms in rounds 1/2. Never subtracted from ordinary primary gains.
- All **six held/released GC heap gates pass**, no heap repeats. Four cycles × five
  operations, three GCs/observation, actual held/released arrays. Maximum candidate
  minus baseline positive-clamped own-start growth is **0 bytes**. Retained heap is
  not allocation counts. Actual six-row probes observe six fact normalizations,
  24/144/288 callbacks at 4/24/48 fields and **12 closed/cleared root+embedded stages**.
- NEW untimed `STAGE-PROJECTION-CLEAR-AUDIT.json` additionally observes actual frozen
  private `access`/`view` creation AND clearing on all 12 stages/operation, both modes
  and all widths (36 creations/clears per mode). Same campaign counters/fingerprints;
  fresh private copies only, not a new acceptance measurement or tool/artifact edit.
- True allocation counts and Mongo server CPU remain **unavailable**. No significance,
  confidence interval, universal speedup or blanket security-equivalence claim.

## Three campaigns remain separate

`NEW-VS-OLD.{json,md}` compares ALL 90 cases in **three separate artifact columns**:
original **75/90** (464 jobs/39,800 responses); OAR-09C **81/90** (444/38,200);
current OAR-09D **78/90** (444/38,800). Each delta uses its OWN interleaved old
baseline. Descriptive only: NO direct cross-time candidate pairing, pooling, causal
estimate, rerun or reclassification of either prior failed campaign. OAR-09D work
diagnostics are not acceptance evidence.

## Final identities, reused gates and preservation

- Current AND measured ESM:
  **`7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`**.
  Original baseline `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- Metadata `63c5ed2dbf4bdc2d47d06c0fb4216347d8bbd3f3eadc9bfb4b2de87cf08bc197`;
  config `c7a523f9cb79d8574a56d688794d8d1508c7ecf05e05e0e29cb45c9f97efd28f`.
- Before/after campaign seals and independent before/after-rebuild checks preserve
  **622 candidate / 552 baseline files, 575 source records, 13 benchmark tools,
  67 outputs, 134 dependency packages/3,510 files, 293 tool packages/10,545 files**.
- The ONLY post-timing build was
  `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build`:
  six necessary affected/transitive packages, fresh private pnpm cache/store.
  **All 67 hashes AND exact inventory identical**. No root/old-artifact/unrelated build.
- Reused, NOT rerun, unchanged-source latest OAR-09D gates: **5,869 core/182 files,
  742 deco/23 files, 44 runner tests**, no failures/skips/pending/cancelled. Actual
  metadata-pinned logs/results and assertions rehashed; NOT the older 5,853 suite.
  Both 16-case remediation suites, types/lint/format/diff evidence retained.
- Actual V7 **175 core/27 deco** cases; rehashed installed/tarball 14 core outputs/eight
  declarations, guide/README/llms, four 19-file tarballs, numeric minimum/current
  peer/module matrices. **20 guide executions/60 responses/80 reads+hooks**. Minimum
  skipLibCheck distinction retained; public ESM/CJS export sets 46/48/6 unchanged.
- **1,420,736 prior paths** retain mode/size/mtime/ctime/link via lstat snapshot,
  NOT cloned fixtures; protected task/protocol/manifests hash unchanged. Includes
  both entire failed campaigns, all accepted artifacts, caches and originals.
- HEAD `58b22c0d6d3abd4ecce03533e3867d148ff21233`; lock
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
  Node **26.12.1**, pnpm **11.18.0**, Mongo **8.2.6** and binary hashes pinned.
- `FINAL-SEAL.json`, `CAMPAIGN-FILES.json`, `EVIDENCE-FILES.json`, `COMMANDS.json` and
  `FINAL-CLOSURE.json` close this packet. **No owned jobs remain**, no delegation,
  commit/publish, dependencies/lock changes, reverts or workspace-wide gates.

**Next decision:** coordinator preserves these 12 failures and obtains explicit user
disposition of the three persistent adverse helpers AND all unresolved-sign gates.
Two bounded remediations were authorized, not a waiver or unlimited third attempt.
Measurement/evidence delivery is complete, but OAR-09 is **not** performance accepted
or completed. No automatic further fix/campaign or OAR-10 is started or authorized.
