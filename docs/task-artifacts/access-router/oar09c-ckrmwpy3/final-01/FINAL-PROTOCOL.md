> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09C candidate / fresh OAR-09B measurement runbook

Use **only `docs/task-artifacts/access-router/oar09c-ckrmwpy3/final-01/FINAL-PROTOCOL.json`** for the new
candidate. Coordinator acceptance and a **fresh sequential measurement owner** are
required. OAR-09C has NOT run `--run`; diagnostics and the complete smoke are NOT
performance acceptance. The original failed `_tmp-oar09b-g28ar1zl/` campaign remains
sealed evidence, not replaced, waived or reinterpreted.

## Inputs and identities

- New read-only `candidate-artifact/` and adjacent `candidate-metadata.json`:
  **620 copied files, 573 source records, 67 deterministic rebuilt outputs**.
- New root ESM SHA256:
  `1d3b509cbe2f34cfba076bbc10779091aef1592001914b37a700165987eea54e`.
- All **13 benchmark tools are byte-identical** to OAR-09A final-02. Their 293 tool
  dependency records / 10,545 files and Node/pnpm/Mongo binary hashes remain pinned.
- Baseline is the original `_tmp-oar01-20261031-153820/baseline-artifact/`, ESM
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`;
  552 files, 134 dependency records / 3,510 files. Config points to the original seals.
- Original **PERFORMANCE-GATES.md and MEASUREMENT-PLAN.md** in that directory govern
  without amendment. OAR-09A's final-02 runbook describes the unchanged workload rules.
- Current-default/active use the SAME historical bytes, ten controls OFF/ON. New
  isolated/trusted are actual enum profiles, checked in declarations and both model
  getter paths. Compiler inspection is in a separate process, not the measured heap.

## Fresh execution (checkout root)

Replace the unique output placeholder. Never write into an earlier packet or use
this packet's `run.py`, which deliberately writes here. Isolate all caches/TMPDIR in
the fresh owner's packet, disable downloads, and use metadata.systemBinary.path.
No installs/builds/tool/source edits during timing; foreground serial and awaited.

```sh
PACKET='_tmp-oar09c-ckrmwpy3/final-01'
NEXT='_tmp-oar09b-REPLACE-WITH-NEW-UNIQUE-NAME'
node scripts/benchmarks/access-router-owned.mjs --plan "$PACKET/FINAL-PROTOCOL.json" "$NEXT/plan"
# Fresh measurement owner ONLY, after coordinator acceptance:
node scripts/benchmarks/access-router-owned.mjs --run "$PACKET/FINAL-PROTOCOL.json" "$NEXT/final-batch-01"
```

All **45 cases / four profiles / two reversed rounds = 360 initial jobs** are fixed.
Primary LIST: 100 rows, 24 fields, 32 bytes, one client, hook concurrency 10, five
warmups, 100 samples. Six guards at 10/100 rows: 50 samples. READ/helper/native/fact
and 4/24/48-field retention families remain separately labeled and unchanged.
On a miss/adverse/sign trigger run exactly two further reversed pairs at original
settings for that comparison, never larger samples/discards/substitutions. After
four pairs retain the fixed three-of-four alignment/confirmation rules.

Benefit: primary isolated/default must improve both initial pairs and median paired
savings must be >=10% AND 1 ms latency, >=10% AND 0.5 ms CPU. Adverse: >10% AND 1 ms
median, >15% AND 2 ms p95, >10% AND 0.5 ms CPU. Helpers remain zero-read/hook EMPTY
fact evaluation; fresh H2/H3 authority adds one explicit normal read/batched read,
compared to old flow PLUS matching OLD normal query with the same allowance. No
synthetic component p95. H4 still checks all 24 callbacks: no narrowed guard selection.

Retain every raw result/log/fingerprint/count and independently recompute paired
medians, nearest-rank p95, user+system process CPU and initial/repeat/final gates.
Check actual hydration/getters/hooks/read counts and every response on BOTH artifacts.
Retention still checks held and released GC growth (>15% AND >1 MiB) and field scaling;
heap noise is not allocation proof. Allocation counters and Mongo CPU remain unavailable.

Audit all artifact/source/dist/tool/dependency/lock/binary identities before and
after; any post-gate rebuild must match all 67 outputs. No owned Mongo/workers may
remain. Unstable signs, confirmed adverse results, count/security/fingerprint errors
or failed benefit keep OAR-09 open. This seal does not start OAR-10 or accept tradeoffs.
