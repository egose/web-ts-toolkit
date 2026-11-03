> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-05 integration / performance evidence

Sequential FP-05 only, after FP-01–04. The coordinator owns task documents/status;
none are edited here. No agents, commits, publication, installs, dependency/lock or
historical changes. All builds/tests/benchmarks are serial, foreground and awaited.
Incoming work and earlier evidence are sealed in `incoming-identities.json`.

Authority: resolved FP-01 matrix in
`docs/tasks/20261030-142406-access-router-unsafe-authorization-fast-path.md`.
This is the performance-first borrowed-state mode, not publication fusion or full
ACL bypass. Preserve the authorized weaker contract and actual permission work.

## Outcome / disposition

FP-05 integrated gates and final-artifact performance evidence are delivered.
**Recommend retaining the experimental opt-in:** relevant within-build median/p95/
CPU improvements repeat in both alternating rounds and all 24 active guard pairs.
This is a performance-first borrowed pipeline, not fusion or a complete ACL bypass.
No runtime refinement or weaker additional bypass was necessary. The coordinator
owns acceptance/status and FP-06 must independently review the result.

Strict/dormant small-case adverse variations are preserved below, not silently
declared harmless or omitted. This is **not** an unconditional no-regression,
whole-workspace, READ-latency, real-application, historical-parity or security-
equivalence claim. No task document/status was edited.

## Actual changes / integrated failure

Only product-tree change by FP-05:
`packages/access-router/test/authorization-fast-path-runtime.integration.test.ts`.
Added explicit `sort: 'name'` to the new FP-03 target include fixture and a two-line
explanation. Expectations/security/rule/handle checks are unchanged. `Target.create`
saves rows concurrently; natural MongoDB insertion order was never a requested
ordering contract. Full V3 observed `unowned` before `owned`, causing both lean and
hydrated cases to fail. It was not called a baseline or runtime failure without proof.

- First **full** V3: **6,294 passed / 2 failed / 178 files**, preserved in
  `v3-full-package.log`. Both failures were that order assumption.
- Fixture correction: focused **8/8** passed, then full **6,296/6,296 in 178 files**
  passed. `fp05-only.diff` is the exact three-added/one-removed-line change.
- All **139 incoming runtime source files**, all **192 incoming original tracked
  test versions** (including FP-04's four consumer updates), all other new FP-02/03/04
  tests and all six JS runtime outputs are preserved. README experimental wording
  remains accurate, so no package benchmark table or unsupported parity wording added.

An initial ignored evidence setup attempted to seal an obsolete generated FP-03
declaration chunk filename from FP-04's incoming map and hit ENOENT before any gate.
The setup now seals actual live dist filenames; no source or earlier evidence was
changed. This was an ignored tooling setup error, not a product failure.

## Mandatory gates (repo root, serial / foreground / awaited)

Each gate has `<name>.command.json`, `<name>.log` and `<name>.result.json` here.

| Gate | Command / result | Evidence prefix |
| --- | --- | --- |
| V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` passed initially and again after timings | `v1-build`, `v1-final-rebuild` |
| V2 | prescribed Vitest prefix, verbose, `test/authorization-fast-path-runtime.integration.test.ts`: **8 passed** | `v2-runtime-integration` |
| V2 state/READ/work | prescribed prefix, verbose, `test/authorization-fast-path-runtime.unit.test.ts`: **44 passed** | `v2-runtime-work-authority-read` |
| V3 FULL | `pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1`: **6,296 passed / 178 files**; no file/name filters | `v3-full-package-final` |
| V3 types | `pnpm --filter @web-ts-toolkit/access-router typecheck` passed (including its rebuild) | `v3-typecheck` |
| V4 | `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1`: **691 passed / 22 files**, downstream typecheck included | `v4-downstream` |
| V5 | `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks` passed | `v5-eslint` |
| V5 format | Changed-file Prettier, explicit Markdown parser for llms, extracted new CHANGELOG entry and `git diff --check` passed | `v5-prettier-changed`, `v5-llms`, `v5-changelog-new-entry`, `v5-diff-check` |
| V6 | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`: **29 passed**, including real 16-worker cross-product smoke | `v6-runner` |
| V7 | five serial measurement batches: **132 timing jobs / 8,100 raw requests**; all config/output/count/hash checks passed | `v7-*` below |

V2 prefix is
`pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1`.

**Full V3 includes all 11 packed tests**, including the three checks excluded in
FP-04: artifact assembly plus minimum/current actual build-artifact package-tree
consumers. Public export, declaration, strict consumer, executable docs, installed
Bundler/NodeNext/Node16, CJS/ESM examples and unchanged strict/runtime suites all ran.
The final verifier checks those 11 verbose log entries and all three artifact checks.

Whole historical CHANGELOG formatting remains the proven FP-04 exception; FP-05
did not reformat old entries. Earlier failure-proof logs and the entire incoming
CHANGELOG are byte-preserved. Only the extracted new entry was checked here.

## Primary paired timings

Milliseconds **median / p95 / worker CPU per request**. Same final bytes; original
eight ON in both columns; new flags OFF versus ON. 100 rows, 24 fields, 32 bytes,
one client, hook concurrency 10, five warmups, **100 samples/job**. Two alternating
rounds reverse scenario/variant order. Before and historical diagnostic were also
measured in each round; full table is `measurements.md`.

| Scenario / round | Same candidate new OFF | Same candidate new ON |
| --- | --- | --- |
| wide / 1 | 18.705 / 22.789 / 23.798 | **13.920 / 17.094 / 17.487** |
| wide / 2 | 18.463 / 21.916 / 23.533 | **14.218 / 18.198 / 17.547** |
| document-rules / 1 | 23.111 / 27.184 / 27.900 | **16.097 / 18.947 / 19.398** |
| document-rules / 2 | 22.695 / 27.465 / 27.706 | **15.784 / 18.501 / 19.068** |
| embedded / 1 | 58.421 / 64.103 / 69.221 | **26.654 / 30.855 / 31.405** |
| embedded / 2 | 58.105 / 64.654 / 68.554 | **27.170 / 31.317 / 31.922** |

Median reduction **23.0–25.6% / 30.4–30.5% / 53.2–54.4%**; CPU reduction
**25.4–26.5% / 30.5–31.2% / 53.4–54.6%**. All six primary p95s improved.
Official-before primary medians were **18.678/18.638**, **22.821/23.351**,
**57.585/57.631**. Same-build OFF is close to this before, not a manipulated baseline.
Absolute times drift relative to earlier agents; no cross-session pooling or causal
claim from those absolute differences.

### Guards / noise / bounded repeats

- All six active guards (`plain-narrow`, `hydrated`, `global-rules`, `large-config`,
  `populate`, `virtuals`) at **10 and 100 rows**, 50 samples, two alternating rounds:
  **all 24 pairs lower median, p95 and CPU**. Median improvements about **19–36%**.
- Strict original-eight-OFF/new-OFF and strict/requested-new-ON **dormant** were
  compared to official strict before on wide/document-rules/embedded at both sizes
  for two rounds. Both real models/getter paths confirm prerequisites remain false.
  Original strict candidate median changes were roughly **-3.6% to +2.5%**.
- Small dormant adverse observations are **not erased**: 10-row wide reached
  **+7.0% (+0.532 ms)** in the first bounded repeat and **+1.6%** in its reverse
  round. Some small strict p95s were up to **+19.5% (~2.12 ms)**. Tail/ordering noise
  or modest added overhead is not ruled out; do not claim unconditional no regression.
- 10-row dormant embedded reached **+5.5% / +6.3%** in reverse-order 50-sample runs.
  A final bounded **100-sample** three-way repeat yielded dormant **+1.3% / +0.1%**
  median and **+1.5% / +0.8%** CPU vs before, strict **+0.6% / +0.3%** median.
  Earlier larger median effects did not repeat there; p95 still varies.
- One 100-row-wide dormant CPU result about **+6.6%** did not repeat (**-0.6% /
  +0.3%**). Only these adverse/noisy guard cases were repeated: 18 jobs then six
  final embedded jobs. No aimless primary repeats, cherry-picked replacement table,
  latency assertions or instrumentation in timing jobs.

All jobs preserve raw samples, declaration manifests, actual single+bag getters on
both models, requested/effective modes, dependencies, actual hydration/read counts,
hooks/getters and order/denied-field/full pre/post fixture checks/fingerprints.
Public populate has two reads/request; other scenarios one. Document-rules primary
jobs each ran **10,000 hooks**; virtual guards **1,000/10,000 getters** at 10/100 rows.
Runtime omission counts remain **null**, never inferred for every row.

The separate 44-test instrumented state run emits real work counts: six rows x 24
callbacks, with/without embedded: stage/grant/context/source/transfer/identity work
all **0**, full resolution **1**, configuration copy **1**, contexts **6**, actual
hooks **6**, field callbacks **144**, adapter reads **1**. Embedded scope derivation
**1**. It covers actual READ plus off/dormant/active, cross-root/tuple/helper/mixed
states, native fallbacks and selected budgets. This is not READ latency evidence.

### Historical same-current-dependencies diagnostic

Two alternating primary batches used the actual preserved v0.51.0 source-only build
at `89180d219783fbfad412d8dfe19beae614f45c68`. Current parser re-inspected its actual
declarations/manifests before runtime; old FP-01 preparation format was not assumed.
Diagnostic medians by round: wide **5.795 / 6.055**, document **6.988 / 6.547**,
embedded **9.360 / 9.050**. Full p95/CPU in `measurements.md` and raw result files.

Active is closer than modern before on these fixtures but remains **about 2.3–3.0x**
the diagnostic median. This is **v0.51.0 SOURCE ONLY with CURRENT dependencies,
peers/tooling and workspace dependency dist**, not a frozen historical installation,
historical performance or whole behavior/security equivalence. The unchanged
document-rules fixture forces non-skim; all historical and modern mandatory hooks
actually run. Modern captured target gates, handles, memo/budgets and private-input
behavior remain different. No frozen install/network was performed for this work.

Actual timing dependencies: Node **v26.12.1**, MongoDB **8.2.6**, Mongoose **9.11.4**,
Express **5.2.1**, Zod **4.4.3**; copied workspace packages keep placeholder versions
with exact dist/file manifests. All **134 pinned dependencies / 3,500 files** rehashed.
Packed peer fixture versions are separate from these resolved timing versions.

## Sealed artifacts / final identities

- `final-before/`, `final-before-metadata.json`: new exclusive copy of the FP-01
  official-before tree; **all 542 files** match its original manifest.
- `final-candidate/`, `final-candidate-metadata.json`: new final-source artifact,
  including all **14 dist / 8 declarations**, captured dependency links/lock and
  exact public CJS/ESM/type name sets. Measured OFF and ON share these exact bytes.
- Runtime export exact sets remain **46 / 48 / 6**, declaration sets **186 / 322 / 17**
  in both conditions; no private issuer/budget/helper/marker additions.
- After full V3, downstream rebuild and an additional post-timing V1 rebuild,
  **all 14 live dist files match the measured candidate byte-for-byte**.
- Root candidate ESM:
  `c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`.
  Root CJS: `3b9edf18c7132c495036802d92d4923cf7b4b1559b0b48872f306c1bc60f5b2f`.
  Current declaration-manifest hash:
  `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468`.
- Official before ESM:
  `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  current-parser declaration hash
  `23814a72c0423ab608b2613492bf70101e0eb0486f6a366e1e6d63383105d130`.
- Historical source-only ESM:
  `9ab523a462b3abb8dd67b6c5dc41e76e0f6bd2670b2891aaa641bab1ac0c6f89`;
  current-parser declaration hash
  `6bed522eeba367a236a0919efee510551bffa263f8d8c5849870ec52ee102e6b`.
  New hashes reflect the current inspector's ordering/format, not changed declarations.
- Lock unchanged:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.

`final-verification.json` / `final-verification.log` pass: **6,021 preserved incoming
files**, **3,830 earlier evidence files**, 139 runtime source files, all 192 incoming
original test versions, prior task docs/user work, lock/metadata/history. Rechecked
all sealed artifacts and pinned dependencies, exact runtime/declaration exports,
**all 30 unchanged worker/workload/check blocks**, full packed/artifact gates and
git status/diff/ignored evidence. No accidental shipping/test-artifact additions.

## Raw evidence / reproduction pointers

All paths here are relative to this evidence directory unless shown from repo root.
Commands were executed from the repo root. No session identifiers or host paths are
part of these shared notes; disposable Mongo URI/database identifiers are scrubbed.

- `measure.mjs primary` → `v7-primary/`: **24 jobs / 2,400 samples**, before/OFF/ON/
  source-only historical in each alternating round, 100 rows/100 samples.
- `measure.mjs guards` → `v7-guards/`: **48 / 2,400**, six scenarios x sizes x modes
  x two rounds, 50 samples.
- `measure.mjs strict` → `v7-strict/`: **36 / 1,800**, three representative scenarios
  x sizes x three strict/dormant/before modes x two rounds, 50 samples.
- `v7-strict-noise-repeat/`: **18 / 900**, exact selection preserved in
  `v7-strict-noise-repeat.command.json`.
- `v7-dormant-embedded-final-repeat/`: **6 / 600**, exact selection preserved in
  `v7-dormant-embedded-final-repeat.command.json`.
- Each has `*-job.json`, `*-result.json`, `*-worker.log`, `summary.json`.
- `measurements.md`: complete unpooled median/p95/CPU tables and caveats;
  `measurement-verification.json`: all raw latency statistics recomputed, 18 matching
  fixture fingerprints, dependencies and summary identity checks.
- `seal-artifacts.mjs`, `artifact-seal.log`, `historical-current-inspection.json`:
  actual new manifests and current-parser support checks.
- `node _tmp-fp05-integration-20261030-190227/verify-final.mjs` rechecks preservation,
  artifacts/gates/exports/workload and zero active processes without altering old evidence.

## Accepted risk / remaining gap / FP-06 handoff

The authorized risk is unchanged and still documented/tested: active lean source/
hook input and grants/context leaves can alias; source/native/configuration mutation
and stale memo can turn denial into allowance; trusted roots keep authority after
descendant mutation; issued membership is not reachability. Full unvisited source/
grant/context bounds/native observations are gone. Selected materialization limits,
safe writes/cycles, cheap exact root/call/stage/request/runtime/model/access/scope,
actual evaluators/hooks/actor/target admission and finite concurrency remain.
Default/off/dormant/write/dedicated-subdocument/fresh-raw-helper behavior remains;
no full ACL bypass or extra permission relaxation was introduced here.

No real-application reproduction is available. READ is verified through actual
runtime state tests, **not benchmarked for latency**. Small default/dormant tail
variations are not proven harmless. Historical diagnostic is not a historical
environment/parity promise. These limits remain explicit while the relevant
repeatable active benefit supports retention.

FP-06 independent review is next; do not run another implementation session in
parallel or treat FP-05 as that review. All owned foreground commands returned;
final verifier reports **zero active build/test/benchmark/Mongo processes**. No
agents, commits, releases, dependency/lock/history or task-document edits. Stop FP-05.
