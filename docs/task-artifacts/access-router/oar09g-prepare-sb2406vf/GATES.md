> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# G-A verification gates — preparation only

All commands were foreground/serial, awaited. `logs/*.json` records argv, actual
times and exit codes; `logs/*.log` retains stdout/stderr. From command 11 onward,
`attempt-tools/<label>/` also preserves the actual benchmark tool versions.

| Required scope | Current result / evidence |
| --- | --- |
| Original three runner files | **45/45**, included in command 20 |
| New B1 unit/protocol negatives | **9/9**, commands 12 and 20 |
| Combined runner checks | **54/54**, `logs/20-runner-tests.*` |
| Benchmark-only ESLint | pass, `logs/19-eslint.*` |
| Changed benchmark format / diff | final commands listed in `GATES.json` |
| Public batch declarations | both ESM/CJS declaration conditions pass, `batch-smoke/declarations.log`; actual Core/Base reachable methods/type signatures, no private exports |
| Original correctness smoke | **180/180 jobs**, all 45 cases/four profiles, **8/8 preflights**, `original-smoke/report.json`; one warmup/two samples only |
| B1 correctness smoke | **32/32 jobs**, all 16 comparison IDs/two sides, two copied-artifact preflights, `batch-smoke/report.json` |
| Independent smoke raw audit | pass, `SMOKE-CORRECTNESS.json`, command 18; independently reconstructed all expected response fingerprints/counts/hydration/CPU summaries |
| Independent copied-artifact counters | pass, `COUNTER-PROOFS.json`, command 23; 50 actual observations, no benchmark-module imports |
| Final original context compatibility | pass, command 25, `RUNPROTOCOL-CONTEXT.json`; actual original `verifyCandidateContext` plus all artifact/dependency hashes |
| Product/docs/tests/current outputs | unchanged F-V bytes, `READY-IDENTITIES.json`; no product rebuild/test repeat |
| Full dependencies/tool closure | all **134 / 3,510** original and **293 / 10,545** tool records match before/after; no dependency changes |
| Old evidence preservation | 191 focused direct files match; broader old closures are separately hash-bound, no universal cache-tree audit claimed |

## Product gate evidence reused, not rerun

F-V `FINAL-SEAL.json` and all 16 bindings reverified. All 595 non-task/non-benchmark
source records and 67 outputs are identical in checkout/candidate. F-V's 609-record
source set differs only in coordinator task notes and the explicitly extended
benchmark README; six additive benchmark tools are now additionally sealed. The
12 old benchmark code/test files are identical, the old README is an exact prefix.

This supports **6,046 core / 187 files** (including 76 Many unit cases), **742 deco /
23 files**, source/downstream types, **four real peer/layout matrices × five compiler
conditions**, 14 core JS/declaration outputs/eight DTS files and installed docs.
F-V's deterministic six-package rebuild reproduced all 67 files. No duplicate full
core/deco run, installation, pack, or unnecessary rebuild was performed here.

## Failed attempts — ours, not relabeled pre-existing failures

- Command 02: first combined runner attempt **50/54**. New test target fixture used
  mode values rather than the declared option-name capability array. The old three
  tests also needed the existing `WTT_BENCH_LEGACY_ROOT` environment; without it they
  correctly rejected the new build as historical/missed a retired source file.
- Commands 04/05: compiler-probe authoring mistakes: `ModelRequest` was imported
  from root instead of `/advanced`; then an imagined `./package.json` export was
  expected. Corrected to actual public root `AccessRouterRequest.macl`, advanced
  `ModelRequest` for `ModelRouter.getService`, and actual three export subpaths.
- Command 09: **53/54**; all 45 original tests passed, remaining new unit fixture
  still used mode values instead of option names. Corrected fixture, no product edit.
- Command 10: two unused error-handler arguments failed ESLint. Kept Express's
  required four-argument signature with explicit `void next`; no runtime workaround.
- Command 21: Python `which(node)` selected an executable shim rather than actual
  `process.execPath`; hash assertion correctly stopped binary alias sealing before
  metadata update. The failed aliases remain in `binary-links-failed-shim-attempt/`.
  Command 22 uses the actual Node executable and verifies all binary hashes.

Successful exploratory `probe-attempt-01*` is labeled as such, not a failed or
pre-existing probe. Every failed log remains. There was no product failure, seam
tolerance, expected-count/gate move or old evidence rewrite to make these pass.

Final metadata only changes binary path references to new repo-relative aliases
after the smokes; all source/tool/artifact/dependency/runtime/binary identities
remain identical. `METADATA-RECONCILIATION.json` links the actual smoke metadata
revision to the final context-reverified revision. No false final-seal chronology.

## Not gates satisfied by this packet

Original final performance/retention/sign acceptance: **NOT_MEASURED**.
B1: **REPORT ONLY**, no new acceptance rule. Historical 73/90 and its two confirmed
H3 failures/fifteen unstable comparisons remain historical/blocking. No final
campaign, acceptance, migration exception/recommendation or OAR-10 occurred.
