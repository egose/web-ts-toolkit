> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Exact ready protocols — NOT EXECUTED AS FINAL CAMPAIGNS

Preparation complete; coordinator reconciliation is required before the fresh
sequential G-B owner starts. No parallel agents, builds, Mongo or workers. These
paths are repo-relative. Run from `<repo-root>`; replace that placeholder before
execution. Do not write outputs/caches into this now-sealed preparation packet or
any older packet. The commands below are a later-owner runbook, **not this owner's
execution record**.

## 1. Verify and establish a fresh exclusive measurement packet

Read `DESIGN/PERFORMANCE-SCOPE.md`, `OLD-WORKLOAD-AUDIT.md`, `GATES.md`,
`candidate-metadata.json`, both protocol JSONs, both plan JSONs and the original
OAR-01 gates/plan. Check `FINAL-SEAL.json`/`PACKET-SEAL.json` bindings. Do not
reinterpret the historical proposal checklist's unapproved migration/gate boxes.

```sh
python3 _tmp-oar09g-prepare-sb2406vf/verify-ready.py
MEASURE="$(mktemp -d "$PWD/_tmp-oar09g-measure-XXXXXXXX")"
mkdir "$MEASURE/tmp" "$MEASURE/cache" "$MEASURE/config" "$MEASURE/data" "$MEASURE/pnpm-home" "$MEASURE/npm-cache" "$MEASURE/mongo-runtime" "$MEASURE/pnpm-store"
export TMPDIR="$MEASURE/tmp" TMP="$MEASURE/tmp" TEMP="$MEASURE/tmp"
export XDG_CACHE_HOME="$MEASURE/cache" XDG_CONFIG_HOME="$MEASURE/config" XDG_DATA_HOME="$MEASURE/data"
export PNPM_HOME="$MEASURE/pnpm-home" npm_config_cache="$MEASURE/npm-cache" npm_config_store_dir="$MEASURE/pnpm-store"
export MONGOMS_DOWNLOAD_DIR="$MEASURE/mongo-runtime" MONGOMS_RUNTIME_DOWNLOAD=false
export MONGOMS_SYSTEM_BINARY="$PWD/_tmp-oar09g-prepare-sb2406vf/binary-links/mongod"
```

Record Node/process.versions/actual executable hash, pnpm/Mongo binary hashes,
host/process state and the accepted prep seal before starting. The read-only
binary aliases must still match; a new machine may relink **its own** aliases only
after explicit identity reconciliation, never edit this packet. No install or
dependency update is authorized. The source seal excludes only shared task notes.

## 2. ONE original campaign, foreground serial

```sh
node scripts/benchmarks/access-router-owned.mjs --run docs/task-artifacts/access-router/oar09g-prepare-sb2406vf/ORIGINAL-PROTOCOL.json "$MEASURE/original-campaign"
```

This is all 45 cases/four profiles/two reversed rounds: **360 initial jobs**.
Affected comparisons get exactly paired rounds 3/4 under the original triggers;
deduplicated case/profile/round tuples bound the entire campaign to 720 jobs.
No case subset, threshold/sample/sign relaxation or selective extra resampling.
All raw/failed outputs remain. Never restart the same campaign to seek a pass.

The CLI exits 1 for failed original comparison gates as well as correctness
failures. Inspect the preserved report: a gate failure is not permission to rerun.
Do not blindly use `set -e` to lose disposition evidence, or ignore a correctness,
identity, missing-job or child-process failure. Reconstruct expected full outputs,
fingerprints, DB/hooks/hydration/getters, CPU/statistics, pair signs/median deltas
and all 90 final gates independently of benchmark calculations. Preserve exactly
the original H2/H3 extra-read component allowance, never synthesize component p95.
Audit retention separately; allocation totals remain unavailable. Do not pool with
historical campaigns. Keep all 17 old failed comparisons historical and visible.

## 3. ONE separate predeclared B1 supplement, foreground serial

Only proceed when the original campaign's correctness/identities/jobs are intact;
original performance gate failures do not turn B1 into an acceptance substitute.
Recheck identities before the second campaign.

```sh
python3 _tmp-oar09g-prepare-sb2406vf/verify-ready.py
node scripts/benchmarks/access-router-owned-batch.mjs --run docs/task-artifacts/access-router/oar09g-prepare-sb2406vf/B1-PROTOCOL.json "$MEASURE/b1-campaign"
```

`batch-plan/plan.json` predeclares all 16 exact comparison IDs/strategies/sides and
64 initial jobs. Exactly two additional paired rounds on the predeclared sign or
absolute material-delta flags, at the same samples/settings; 128 total maximum.
Never infer a historical Many API. Report raw-only versus full query workflows,
freshness and comparators distinctly. Inspect full directly observed workflow
p95, CPU user/system/elapsed and every sample/fingerprint/count. Do not subtract
query cost or sum component p95. B1 has **no acceptance gates**, no `pass` result,
and cannot dispose of original H3/sign/retention failures.

Independently audit the complete pair/round matrix, repeat triggers/job cap, actual
read/hook/virtual/API-call counts, all expected response hashes and summaries. The
separate untimed copied-artifact/compiler preflights are not timed entries. Do not
claim a reduction in implicit Promises, Permission maps or total engine allocation
from the one-capture API. The fixed constant actor does not equate freshness.

## 4. Close and preserve

Rehash full artifact/source/tool/dependency/binary/link identities and old evidence
after both campaigns. Run only the necessary six-package filtered serial rebuild
at this final measurement boundary, preserving its logs and verifying all 67
dist-tree files against the F-V manifest/candidate. No duplicate full product suite
unless product bytes meaningfully change (not authorized here). Any mismatch is a
blocker, not an automatic product fix/reseal/retry.

```sh
pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build
python3 _tmp-oar09g-prepare-sb2406vf/verify-ready.py
```

The filter is the six-package core/deco closure; verify the actual package list
and outputs. Do not use root/workspace-wide build/test/lint. Preserve completed
F-V 6,046 core/742 deco/20 actual installed compiler conditions only by unchanged
byte evidence, not invented new full-suite or install claims. Finish with no owned
Mongo/Node/build/test jobs, exact raw reports/gates and unresolved dispositions.
Coordinator owns status. No acceptance, OAR-10, recommendation, exception, commit
or publication follows automatically.
