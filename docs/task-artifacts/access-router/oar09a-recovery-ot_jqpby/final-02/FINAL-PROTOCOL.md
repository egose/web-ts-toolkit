> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Accepted OAR-09A packet / OAR-09B runbook

**Only `final-02/FINAL-PROTOCOL.json` is the accepted configuration.** The recovery
directory's earlier root candidate/config and `smoke-sealed-all-01/` are preserved
failed-tooling evidence, not accepted inputs. Nothing below was run with `--run`
during OAR-09A. Coordinator acceptance and a fresh OAR-09B owner are prerequisites.

## Frozen inputs

- Config: `docs/task-artifacts/access-router/oar09a-recovery-ot_jqpby/final-02/FINAL-PROTOCOL.json`.
- Candidate: `_tmp-oar09a-recovery-ot_jqpby/final-02/candidate-artifact/`.
- Candidate seal: adjacent `candidate-metadata.json` (619 copied files, 572 source/
  documentation/tool hashes, 67 output hashes, all 13 benchmark files, 293 tool
  dependency records / 10,545 files; Node/pnpm/Mongo binary identities).
- Old baseline/seal/dependencies: original `_tmp-oar01-20261031-153820/` paths in
  the config; 552 baseline files and 134 dependency records / 3,510 files.
- Retention rules remain the original `PERFORMANCE-GATES.md` and
  `MEASUREMENT-PLAN.md` in that OAR-01 directory. Do not edit those files.
- Current-default/active are the SAME old bytes with all ten controls OFF/ON,
  respectively. Candidate isolated/trusted are actual shipped enum modes, never
  legacy aliases. Every worker verifies exact/bulk source AND target getters.

All package links intentionally resolve the sealed copies or identical external
dependencies in this checkout. This is a hash-audited local artifact, not a portable
standalone node_modules archive. Do not rebuild/install/change dependencies or tools
during the campaign. Changing any accepted input requires a new named packet/batch.

## Fresh, serial execution

Run from the checkout root. Replace the unique output placeholder before executing;
the directory must not already exist. Do not use this recovery's `run.py` for OAR-09B
because it deliberately writes into this packet. No root build/test/lint is needed.

```sh
PACKET='_tmp-oar09a-recovery-ot_jqpby/final-02'
NEXT='_tmp-oar09b-REPLACE-WITH-UNIQUE-NAME'
mkdir "$NEXT"
mkdir "$NEXT/tmp" "$NEXT/cache" "$NEXT/mongo-cache"
export TMPDIR="$PWD/$NEXT/tmp"
export WTT_BENCH_TMP="$TMPDIR"
export XDG_CACHE_HOME="$PWD/$NEXT/cache"
export MONGOMS_DOWNLOAD_DIR="$PWD/$NEXT/mongo-cache"
export MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY="$(node -p "JSON.parse(require('fs').readFileSync('$PACKET/candidate-metadata.json','utf8')).systemBinary.path")"
node scripts/benchmarks/access-router-owned.mjs --plan "$PACKET/FINAL-PROTOCOL.json" "$NEXT/plan"
# OAR-09B ONLY, after coordinator acceptance, foreground and awaited:
node scripts/benchmarks/access-router-owned.mjs --run "$PACKET/FINAL-PROTOCOL.json" "$NEXT/final-batch-01"
```

The runner creates each batch exclusively, audits seals/tools before AND after,
starts one disposable Mongo, awaits one child at a time and stops Mongo in finally.
SIGINT/SIGTERM retain partial reports. A failed job remains recorded while subsequent
jobs run; preflight/seal failure aborts. Nonzero exit or any failed comparison is not
acceptance. Do not delete failed/adverse samples or rerun into an existing directory.

## Workloads and fixed comparisons

`plan-final-01/plan.json` and the public benchmark README enumerate all 45 cases:
3 primary, 12 guards, 10 actual HTTP READ, 13 helper flows, 2 native adapter, 2 fact,
3 retained-heap widths. Full initial execution is 360 jobs: two reversed case/profile
rounds across four profiles. All use one client, hook concurrency 10, 24 fields and
32 bytes except explicitly fixed 4/24/48 retention widths. Primary/ordinary samples
100; guards 50; warmups five. A smoke's two samples/one warmup/one round is NOT a gate.

- Compare isolated/default and trusted/active within each round. Use median paired
  deltas, not request pooling; nearest-rank p95; actual Node CPU user+system totals.
- Primary isolated benefit: median paired improvement at least 10% AND 1 ms latency,
  10% AND 0.5 ms CPU. Both initial pairs must improve latency and CPU.
- Adverse: more than 10% AND 1 ms median; 15% AND 2 ms p95; 10% AND 0.5 ms CPU.
- Miss, sign disagreement or adverse trigger: exactly two additional affected
  comparison pairs at original settings, reversed again. Four-pair benefit requires
  three aligned median+CPU pairs plus median size thresholds; adverse confirmation
  requires the same metric in three pairs and the median delta. No substitutions,
  sample increases, moved gates or discarded rounds.
- H0 is presentation only. H1 helpers have zero reads/hooks and EMPTY facts, not
  current document authority (including the negative-predicate caveat).
- H2/H3 disclose old handle reuse versus a fresh normal operation: +1 read/+1 hook
  or +1 batched read/+rows hooks. The allowance is old flow plus matching OLD normal
  query component, then the fixed median/CPU allowance. Component sums are NOT p95
  distributions. The new workflow's directly observed p95 remains in raw data.
- Fact cost compares expensive work to each profile's OWN owner-only fixture:
  exactly 100 checksum computations/request, 10,000 iterations each, not per field.
- Native adapter cases have zero Mongo reads and exactly one adapter call/operation;
  do not call that Mongo timing. Real persisted native/bounds coverage is in V3/V7.
- Retention uses actual `--expose-gc`: both held and released observations, four
  cycles/five operations, three GCs/observation, exact extra work counters. Repeated
  >15% AND >1 MiB growth blocks. Inspect all field widths with structural closed-stage
  and copy counts; any demonstrated superlinear retained per-field graph is blocking
  even below that threshold. Heap noise alone is not proof of graph growth.

Every response is checked on BOTH artifacts in `checked-each-response-v1`. LIST
latency excludes its post-response deep check, but its process CPU includes it;
separate new workflow latencies include their checks. Never relabel the historical
row-count-only series or pool different APIs. Allocation counts and MongoDB CPU are
unavailable. No confidence intervals, significance, blanket security equivalence or
universal speedup are claimed.

## Required OAR-09B reconciliation

Retain every raw job/log/sample, initial and final comparisons, facts, held/released
observations, preflight responses and work counts. Independently recompute gates and
inspect field scaling. Audit exact baseline/candidate, source/dist/tool/dependency/
lock/Node/Mongo identities again; prove any post-gate rebuild matches the accepted
outputs. Check no owned workers/Mongo remain. Failed benefit, unstable signs,
confirmed regressions, security/count/fingerprint differences or superlinear graphs
keep OAR-09 open for explicit disposition. A CLI success alone does not replace this
artifact/raw-evidence reconciliation or independent OAR-10 review.
