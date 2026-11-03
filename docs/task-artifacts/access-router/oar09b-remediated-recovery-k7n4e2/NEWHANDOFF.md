> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09B remediated recovery — campaign delivered, acceptance FAILED

**OAR-09 remains OPEN. Do not start OAR-10.** The fresh fixed campaign ran once to
completion against the accepted OAR-09C final-01 candidate. **81/90 gates pass**:
all **45 isolated/default** comparisons pass; **36/45 trusted/old-active** pass.
Three confirmed adverse comparisons and six unresolved-sign failures remain.
No waiver, further optimization, sampling, workload/threshold change or additional
campaign is inferred. Coordinator alone reconciles task/status.

## Exact packet and execution

All new evidence is **`_tmp-oar09b-remediated-recovery-k7n4e2/`**. Entry confirmed
`_tmp-oar09b-remediated-taoqwoom/` contains exactly eight empty setup directories,
no campaign report/handoff/scripts and no owned jobs. It was preserved read-only;
no completed remediated series was restarted. The original FAILED
`_tmp-oar09b-g28ar1zl/` 464-job/39,800-response campaign remains unchanged.

- Accepted ONLY `docs/task-artifacts/access-router/oar09c-ckrmwpy3/final-01/FINAL-PROTOCOL.{json,md}` and adjacent
  artifact/metadata. No OAR-09A old candidate was measured in this campaign.
- Actual checkout-root commands/environment/exit/elapsed are in `plan-01.log`,
  `campaign-01.log` and subsequent named logs; `run-command.py` owns fresh TMP,
  XDG/Mongo-download/pnpm/npm cache/store paths. No runtime download or install.
- One foreground serial `--plan` succeeds; ONE `--run` completes **444 jobs /
  38,200 measured responses**. **360 initial jobs + 84 repeat jobs**: exactly two
  more reversed pairs for **21 trusted comparisons**, no isolated repeat.
  Rounds **180/180/42/42**. All 45 scenarios/four profiles retained, no discarded
  observations or sample increases. CLI exit **1** is a real gate failure.
- UTC **2026-11-02 01:33:49.527–02:04:57.355**, wrapper **1,870.526 seconds**.
  One Mongo/one worker serially, cleanup awaited. Zero job/count/fingerprint failures.

## Quantitative outcome

Primary isolated/default median paired latency savings (both initial pairs improve
median AND CPU; all precommitted benefit thresholds pass):

| Primary LIST | Median latency delta | CPU/request delta |
|---|---|---|
| plain-wide | −64.23% / −21.6407 ms | −62.75% / −24.2415 ms |
| document-rules | −92.25% / −164.1976 ms | −91.50% / −171.4421 ms |
| embedded | −96.29% / −515.6044 ms | −95.78% / −536.4674 ms |

Confirmed trusted/old-active adverse comparisons after all four pairs:

| Case | Median delta | p95 delta | CPU delta | Confirmed metrics |
|---|---|---|---|---|
| H4 guard | +16.70% / +0.3811 ms | +22.03% / +0.7156 ms | +26.69% / +0.6207 ms | CPU, 3/4 adverse |
| H3-global / 10 | +20.67% / +1.1487 ms | +10.84% / +0.8018 ms | +23.86% / +1.6388 ms | median 3/4, CPU 4/4 |
| H3-global / 100 | +24.98% / +7.2173 ms | +24.14% / +7.4754 ms | +25.09% / +8.7260 ms | all three, 4/4 |

Each confirmed metric also exceeds BOTH its percent and absolute median-paired
threshold. H4 latency does not exceed the absolute gate; CPU does. No percent-only
failure is invented. H4 retains **one read/one hook/24 callbacks**, not narrowed output.

Six sign failures remain (all N=4, fewer than three aligned pairs in named metrics):

- `guard/plain-narrow/10`: CPU.
- `guard/global-rules/10`: CPU.
- `read/http-id/plain-wide/100`: p95.
- `read/http-filter/plain-wide/100`: median/p95/CPU.
- `read/http-filter/hydrated/100`: p95.
- `native-adapter/direct-read/100`: CPU.

Tiny absolute deltas are **not automatically waived**. `REPORT.md`, `ALL-GATES.md`,
`PAIR-DETAILS.md`, `INITIAL-REPEAT-FINAL.{json,md}` and `REPEAT-ONLY-SUMMARY.{json,md}`
retain every initial/repeat/final N, metric and outcome. Repeat-only N=2 is descriptive,
not a replacement gate. `ADVERSE-OBSERVATIONS.{json,md}` keeps all individual adverse
observations, including later unconfirmed ones.

`NEW-VS-OLD.{json,md}` compares ALL cases in separate campaign columns: old 75/90
passes, nine confirmed adverse/seven sign-unstable (one overlap), versus new 81/90,
three adverse/six unstable (no overlap). Six previously confirmed adverse cases now
pass: plain-wide, virtuals/10, hydrated/100, populate/100, virtuals/100 and H2-global.
H3-global/100 old +62.12%/+17.4852 ms median versus new +24.98%/+7.2173 ms is descriptive
context, NOT direct cross-time candidate pairing or pooled evidence.

## Independent audit, helpers, fact cost and heap

- NEW Python `recompute-raw.py` imports no benchmark code. Read-only AST extraction
  takes only six pure fixture/stat definitions from the old auditor; no old entrypoint
  or writing logic executes. New code checks catalog/settings/exact ordering/triggers,
  actual counts/hydration/exact+bulk getter proofs, **38,200/38,200 expected full
  fingerprints**, raw median/nearest-rank p95, user+system CPU and measured elapsed,
  per-pair percent AND milliseconds and median-of-pairs gates. All agree with CLI.
- Both frozen workers assert full responses before/warmup/after and every measured
  response on BOTH artifacts. `checked-each-response-v1` never pools OAR-01 historical
  row-count-only timings. Raw samples/CPU/job/log hashes are sealed.
- H0 presentation/raw H1/scoped add zero DB reads/hooks/getters. New raw helpers use
  fresh global/scoped output-only policy and frozen EMPTY document facts, not current
  document authority. H2 adds one normal read/hook; H3 adds one batched read/rows
  hooks, no per-row DB queries. All six extra-read cost allowances pass against old
  flow PLUS matching OLD query; direct observed new p95 shown, no synthetic p95.
- Native direct READ/LIST: zero Mongo reads/one explicit adapter call; full native
  output/counts preserved. Candidate untimed bounds/wire probes return controlled
  400/no partial output. Native direct READ sign failure remains blocking.
- Unused facts remain separate: exactly **100 × 10,000 iterations/request**, one
  computation/hook, compared only with OWN owner-only fixture. New trusted own-cost
  median +10.9369/+10.8151 ms; CPU +11.1138/+10.9088 ms in rounds 1/2. Never subtract
  these costs from primary gains; no new own-cost repeat campaign.
- All six held/released heap gates pass, no heap repeats; maximum positive-clamped
  candidate-minus-baseline own-start growth difference **0 bytes**. Actual GC/held
  arrays and four cycles × five operations observed. Not allocation counts.
- Six-row/4–24–48-field structural probes observe six raw normalizations/fact identities,
  24/144/288 callbacks, **12 root/embedded stages closed/cleared**, constant whole-root
  view copies (isolated 12; trusted 0), field memo calls 66/306/594. No demonstrated
  superlinear retained graph in these bounded probes, not universal proof.
- `STAGE-PROJECTION-CLEAR-AUDIT.json` adds actual untimed `access`/`view` creation and
  clear assertions on all 12 stages/operation, both modes/all widths. First local
  supplement had a `$&` string-replacement bug; failed log/generated instrumented
  bundle retained, corrected fresh-path supplement passes. Accepted campaign tools,
  artifact/seal and measurement never changed or reran.
- True allocation counts and Mongo CPU remain **unavailable**; no significance,
  confidence intervals, universal speedup or blanket security-equivalence claim.

## Final identity and closure

- Current/measured ESM **`1d3b509cbe2f34cfba076bbc10779091aef1592001914b37a700165987eea54e`**;
  original baseline **`33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`**.
- Accepted metadata SHA256 `4aedee50018253dd99c36bff1f3b166ac3d3519857a73033317755e8c76b91b4`;
  config `63482befc9e13b80685993ee7781ab53998f7553ffe4311b01bf0aebf44f29f7`.
- Input, pre/post-campaign seals, before/after-rebuild audits: **620 candidate files /
  552 baseline / 573 source / 13 tools / 67 outputs / 134 deps+3,510 files /
  293 tool deps+10,545 files** identical. **1,246,615 historical paths** preserve
  mode/size/mtime/ctime/link, with protected task/protocol/manifest byte hashes too.
- Sole necessary post-gate build:
  `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build`.
  Six affected/transitive packages serially, **all 67 output hashes and exact inventory
  equal accepted metadata**, no old artifact rebuilt. Fresh private pnpm cache.
- Reused unchanged-source OAR-09C full gates, actual logs/results hash-audited NOT rerun:
  **5,853 core/181 files, 742 deco/23 files, 44 runner tests**; zero failed/pending/skips.
  Actual installed V7 175 core/27 deco, 20 guide executions/60 responses/80 reads/hooks;
  all 14 core outputs/eight declarations rehashed inside actual installed trees and
  four tarballs. Minimum/current peer/module matrices preserved.
- HEAD `58b22c0d6d3abd4ecce03533e3867d148ff21233`, lock
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
  Node **26.12.1**, pnpm **11.18.0**, Mongo **8.2.6**/binary hashes pinned.
- `FINAL-SEAL.json`, `CAMPAIGN-FILES.json`, `COMMANDS.json` and `FINAL-CLOSURE.json`
  close this packet. **No owned worker/Mongo/build/test jobs remain.** No delegation,
  task/status edits, commit/publish, dependency/lock edit, revert, old evidence/cache
  write or workspace-wide verification. All work remains uncommitted/unpublished.

**Next:** coordinator must preserve the nine failed gates and obtain explicit
disposition. This is completed measurement/evidence delivery, NOT performance
acceptance or OAR-09 completion. No OAR-10, additional campaign or optimization started.
