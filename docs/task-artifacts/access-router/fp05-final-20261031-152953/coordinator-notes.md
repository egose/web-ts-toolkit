> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Final FP-05 — independently prechecked residual-fix artifact

## Outcome and disposition

**Final affected-package integration and performance verification passed on the
current `33662fae…` bytes. Recommend retaining the experimental opt-in under the
agreed weaker contract, with the adverse/default-overhead caveats below.** Relevant
primary median/p95/CPU benefits repeat in both reversed rounds. No new product gate
failure, runtime correction, additional bypass or performance feature was needed.

This is FP-05 integration evidence, **not independent final acceptance**. The fresh
FP-06 residual precheck already confirmed R1/R2/residual fixes; the coordinator should
return these final logs/identities to that reviewer for independent evidence closure.
The coordinator owns task documents/status; none were edited here.

No agents/delegation, product/source/test/docs edits, commits, publication, dependency
or lock changes, reverts or unrelated formatting. All commands were serial,
foreground and awaited. **No workspace-wide build/lint/tests ran or are recommended.**
Required full consumer tests freshly assemble packages from existing compiled outputs;
they are not an unfiltered workspace build. Earlier `_tmp*` artifacts, evidence and
review caches were preserved, not overwritten or relabeled. New owned drivers,
configs, review caches, evidence and sealed candidate live in this exclusive directory.
Normal affected-package dist regeneration was required by the package gates.

The resolved FP-01 contract remains authority: borrowed source/grants/context/config
leaves, stale memo and issued-member rather than reachability semantics are accepted.
No full source/grant/descendant graph checks were restored. Actual permissions,
document hooks/getters, actor/target admission, cheap root authority, finite concurrency
and selected 20,000-slot/depth-100 bounds remain. Default/off/dormant, writes,
dedicated operations, raw helpers and original six/two/eight groups remain covered.

## Gates actually run

Commands ran from repo root through
`node _tmp-fp05-final-20261031-152953/run-gate.mjs <prefix> <command...>`.
Each prefix has `.command.json`, `.result.json` and `.log` here, containing actual
argv, exit status and elapsed duration. The recorder sets `TMPDIR=<system-tmp-path>`,
`npm_config_workspace_concurrency=1` and
`WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR=_tmp-fp05-final-20261031-152953/packed-evidence`.
No file/name filters or exclusions were used for full V3/V4.

| Gate | Exact command / actual result | Evidence prefix |
| --- | --- | --- |
| V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` — passed initially and after all timing | `v1-build`, `v1-final-rebuild` |
| V3 full | `pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1` — **6,449 tests / 180 files passed**, all **12 packed cases** | `v3-full-package` |
| V3 types | `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed, transitive/package build included | `v3-typecheck` |
| V4 full | `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1` — **691 tests / 22 files passed**, downstream typecheck included | `v4-downstream` |
| V2 focused | Package Vitest prefix below, native/owner/runtime unit files — **196 tests / 3 files passed** (102/50/44) | `v2-owner-native-work` |
| V2 reviewer fixtures | Root Vitest prefix below with the three new configs — **9 original + 8 residual + 8 adjacent = 25 passed** | `v2-review-nine`, `v2-review-residual`, `v2-review-adjacent` |
| V5 lint | `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks` — passed | `v5-eslint` |
| V5 format/diff | `pnpm exec prettier --check` over **45 changed scoped files**, llms with explicit Markdown parser, extracted new CHANGELOG entry; `git diff --check` — all passed, no writes | `v5-prettier-changed`, `v5-llms`, `v5-changelog-new-entry`, `v5-diff-check` |
| V6 | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs` — **29 passed**, real 16-worker cross-product included | `v6-runner` |
| V7 | Four new timing batches — **128 jobs / 8,600 measured requests**, unchanged worker/workloads/response checks; all configuration/result checks passed | `v7-primary`, `v7-guards`, `v7-strict`, `v7-adverse-repeat` |
| Seal/audit | New seal and final verification — passed | `artifact-seal`, `final-verification` |

Package V2 command:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-fp05-final-20261031-152953/vitest.package.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose test/authorization-fast-path-owner.unit.test.ts test/authorization-fast-path-native.unit.test.ts test/authorization-fast-path-runtime.unit.test.ts
```

Reviewer commands each use
`pnpm exec vitest run --config _tmp-fp05-final-20261031-152953/vitest.<name>.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose`,
where `<name>` is `original`, `residual`, or `adjacent`. They read the unchanged
review fixtures in their original locations, but write only new caches here. These
reruns do not purport to be a new independent review.

The whole historical CHANGELOG formatting exception is unchanged; its old proof logs
and incoming bytes were preserved. Only the new entry was extracted/checked. No task
document or unrelated file was formatted. Vite's existing advisory about its future
native config loader was non-failing; no check was suppressed.

### Fresh packed / actual minimum-peer proof

Full V3 freshly packs the current transformed package and assembles the actual
build-artifact package tree. All 12 packed cases pass, including the native case,
artifact-current-bytes check and **four real installed workflows**:

- Tarball + actual minimum **Express 5.0.0 / Mongoose 8.0.0**.
- Tarball + current pinned fixture peers **Express 5.2.1 / Mongoose 9.8.0**.
- Actual artifact tree + the same actual minimum peers.
- Actual artifact tree + the same current pinned peers.

Each passes strict Bundler/Node16/NodeNext compilation, actual CJS/ESM, emitted README
examples and bundled README execution. Current-peer declarations use
`skipLibCheck:false`; minimum-peer consumers retain the established `skipLibCheck`
compatibility setting while application checking is strict. Node16 denotes TS
resolution, not Node 16 runtime support (package runtime remains Node >=22).

**The current native fixture is a direct unconditional awaited statement inside
`runConsumerSmokeTests`, before optional evidence export.** Both parameterized
tarball/artifact callbacks await that function. The final audit verifies that wiring
using the AST, the current fixture hash/assertions and all four passing workflows;
there is no conditional missing fixture and no separate BSON-6 diagnostic substituted
for actual minimum-peer installation. The permanent fixture unconditionally tests
the new 21,000 denied-wire-key LIST/READ case and exact eight document/two wire hooks.

Whole-workflow proofs are the four
`packed-evidence/packed-consumer-*/verification.json` files. Final audit handles BOTH
installed layouts (flat tarballs and artifact `dist/` subdirectory), explicitly
hashing **all 14 installed outputs in each**. Strict configs, emitted/example/bundle
hashes, all current docs, real tarballs and no source/test/scratch shipping are checked.

Fresh focused proof: `packed-evidence/native-budget-4jA1UQ/result.json` and
`v3-full-package.log` show ordinary Code+nested DBRef LIST/READ **200** with checked
shape; oversized Code/DBRef and denied-key wire LIST/READ **400**, controlled and no
partial data. **8 document hooks / 2 wire hooks**. Actual resolved Mongoose **9.11.4**
for this focused linked-peer case, distinct from the four pinned installations.

The newly generated deterministic access-router tarball is
`packed-evidence/native-budget-4jA1UQ/web-ts-toolkit-access-router-0.99.0-test.tgz`:
SHA-256 **`7e768d4fd3462ca0abc24bd140cd44e7c5a7c92c278e8694d8ab8b286ad49fa4`**.
It equals the independently reviewed current tarball hash because the input bytes
are unchanged, **not because an earlier tarball was reused for the full gates**.
The audit directly reads all 14 emitted files from each newly preserved tarball.

## Final current-artifact primary timings

Milliseconds **median / p95 / recorded worker CPU per request**. Same `33662fae…`
artifact, original eight ON, new OFF vs ON. **100 rows, 24 fields, 32 bytes, one client,
hook concurrency 10, five warmups, 100 samples/job, two reversed paired rounds.**

| Scenario / round | Current eight ON / new OFF | Current eight ON / new ON |
| --- | --- | --- |
| wide / 1 | 20.381 / 24.684 / 24.096 | **14.785 / 19.591 / 17.559** |
| wide / 2 | 20.124 / 24.598 / 23.884 | **14.694 / 17.929 / 17.517** |
| document-rules / 1 | 24.731 / 28.513 / 27.866 | **17.859 / 22.024 / 20.200** |
| document-rules / 2 | 24.276 / 28.109 / 27.675 | **17.143 / 20.697 / 19.448** |
| embedded / 1 | 63.969 / 72.432 / 70.141 | **29.124 / 34.678 / 32.212** |
| embedded / 2 | 63.065 / 69.144 / 68.637 | **28.918 / 34.238 / 31.788** |

Median gains **27.0–27.5% / 27.8–29.4% / 54.1–54.5%**; p95 and CPU improve in every
primary pair. Recorded CPU gains **26.7–27.1% / 27.5–29.7% / 53.7–54.1%**. Official
before medians were **19.924/20.241**, **25.304/25.947**, **62.490/63.685 ms** in these
same reversed rounds, not a cherry-picked absolute baseline. Current OFF vs official
before median varies **-6.4% to +2.4%** across primary cases; this is not zero overhead.

### Guards, correction cost and honest adverse evidence

- All six active guards (narrow/hydrated/global/large-config/populate/virtuals), both
  10/100 rows, 50 samples and two reversed rounds were run. **23/24** initial pairs
  lower median, **23/24** lower p95 and **23/24** lower CPU; **22/24** lower all three.
  The initial narrow 10-row first pair is **+4.3% median / +3.8% CPU**, while the reverse
  gains 35.1%; virtual 10-row second-round p95 is **+4.3%** despite lower median/CPU.
  These observations are preserved; this is not the previous artifact's all-gain claim.
- ONE bounded adverse-case repeat batch, 100 samples, retained all initial logs:
  narrow 10-row active, wide 10-row strict/dormant, embedded 10-row strict. Narrow
  repeat improves median **30.1% / 18.1%** with lower p95/CPU in both rounds. No extra
  primary repeats, follow-up repetitions, selective pooling or win hunting.
- Strict/new OFF and requested-ON dormant use all eight OFF, wide/doc/embedded at
  10/100 rows in both reversed rounds. Initial strict median ranges about **-3.9%
  to +4.4%**; dormant **-3.2% to +5.0%**. Actual getter/configuration checks verify
  absent prerequisites, not implicit active mode.
- **Residual strict/default cost is not dismissed:** embedded 10-row strict repeat
  median **+2.4% / +2.8%** (~1.6/1.9 ms), recorded CPU **+2.3% / +3.7%**. Wide dormant
  repeat is **+10.3% / +0.820 ms median**, **+11.7% p95**, **+6.5% CPU** in round 1,
  then **+0.9% / -4.3% / +0.6%** reversed. Wide strict repeat median **-0.1% / +4.2%**.
  Initial strict document-100 second-round CPU also reaches about **+5.7%**.
  Sequential order/tail noise and modest default overhead are not ruled out; there
  is no universal no-regression/default-free claim. No new refinement was authorized
  or justified as necessary to retain the large relevant active benefits.
- Earlier c26 **+7% median / +19.5% p95** observations and a0 adverse/repeat results
  remain historical evidence at their original paths. New results do not erase them.
- Six optional preserved **a0 ON** correction-cost controls are explicitly marked
  **known residual / NOT accepted**. Current-vs-a0 medians range **-3.8% to +0.8%**,
  CPU **-1.8% to +0.9%**, p95 **-1.5% to +11.4%**. No broad ordinary-primary
  correction slowdown is established; individual tails vary. This does not measure
  arbitrary selected BSON-heavy latency or imply native preparation is free.

Every job checks actual declarations/manifests, both source/target model single+bag
getters, supported/requested/effective modes, actual hydration, reads/hooks/getters,
denials/order and full pre/post fixture checks/fingerprints. Populate keeps two
reads/request; others one. Virtual guards run 1,000/10,000 getters/job. Primary
document-rules runs 10,000 hooks/job in all five compared builds. Compiler validation
is outside the measured heap. Timing omission counts remain **null**, not fabricated
or per-row borrowing proof. Latency is independently recomputed from raw samples;
CPU is checked **as recorded**, not falsely recomputed from unavailable raw counters.

### Fresh historical source-only/current-dependencies comparison

Fresh paired diagnostic medians: wide **6.740 / 7.045**, document-rules **7.486 / 7.950**,
embedded **10.257 / 10.134 ms**. Current active remains **2.09–2.85x slower** than this
diagnostic, closer than before but not parity. Full p95/CPU are in `measurements.md`.

This uses actual v0.51.0 source commit
`89180d219783fbfad412d8dfe19beae614f45c68`, preserved FP-01 rebuild with CURRENT
dependencies/peers/tooling/workspace dist plus ignored supplemental tsconfig. No
historical lock installation, new historical build/install/network or historical
artifact mutation. The current inspector re-reads the real declarations/manifests.
This is **SOURCE ONLY / CURRENT DEPS**, not frozen v0.51.0 performance/environment or
behavior/security equivalence. Modern mandatory hooks, captured policy/target gates,
opaque ownership, memo/selected budgets/private inputs differ. Matching ordinary
outputs do not establish historical or security equivalence.

Actual timing dependencies: **Node v26.12.1, MongoDB 8.2.6, Mongoose 9.11.4, Express
5.2.1, Zod 4.4.3** and pinned workspace dependency artifacts. These differ from the
separate current installed-consumer fixture pins (Mongoose 9.8.0).

### Separate instrumented work proof

Original unchanged reviewer fixtures retain six-row embedded work:
**36 stage / 384 grant / 24 deep-context / 24 whole-source / 390 transfer → 0**;
full resolution **7→1**, identity/admission **30/36→0/0**, configuration copies **77→1**,
contexts **12→6**. **Six actual hooks, 144 field callback bodies, one read**, one
embedded scope derivation remain. These are instrumented state proofs, not timings.
Reviewer wire-expansion reads are **0**. Denied Code/DBRef/wire policy calls stop at
**19,998 / 19,997 / 19,998**; depleted native control stops before any policy call.
New-cache adjacent controls pass. Full V3 includes all 102 permanent native cases.

## Final identities / preservation

New `final-candidate/` and `final-candidate-metadata.json` seal **552 files**, all
**14 dist / 8 declarations**, dependency links, **134 pinned dependency identities /
3,500 files**, lock and exact public surfaces. Current docs/tests are included in
the private seal (not shipped); actual packed allowlists exclude private/test files.
Original FP-01 before is freshly inspected and rehashed, **not rebuilt/overwritten**,
in `final-before-metadata.json`; old a0/historical descriptors likewise reference and
reinspect preserved artifacts without relabeling them current.

After full package/type/deco rebuilds, timing, and another V1, **all 14 live outputs
equal the measured candidate**. All eight declarations still equal incoming/old
declaration bytes. Exact runtime exports **46 / 48 / 6**, declared export names
**186 / 322 / 17**, root/advanced/processors, BOTH import/require conditions. Default
and named `acl` binding identity is preserved. No private issuer/budget/materializer/
builder/capture API or test artifact ships.

| Identity | SHA-256 |
| --- | --- |
| Root ESM | `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822` |
| Root CJS | `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea` |
| Declaration manifest | `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468` |
| Lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| Latest selected materializer source | `7c5085e7f4bcff25b9693ade9b49332d887f9006e216988ed2a56717dd964ed2` |
| Parent ownership source | `027558e30bd19bea66e2d5688cd553582ad24f2bf9b3e72bcc4174b41a839e57` |
| Current native runtime fixture | `c3e14be4efd8508db34fdf8121f16f59e2832ce4073c16b5ebdf70857debf30e` |

`final-verification.json` passes **37,640 captured incoming identities**, including
**35,445 earlier evidence files**, all **139 runtime source files**, incoming tests,
task docs/user work, previous artifacts/logs/review caches, HEAD/status, lock and
pinned dependencies. All **30 unchanged workload/scenario/check blocks** are checked
against the prior official proof. No product diff was added. This final audit also
verifies actual new installed/package bytes, all gates and the raw timing summary.

## Reproduction and raw pointers

Paths below are relative to this directory. Shared notes/logs use repo-relative
paths and scrub full host paths/session identifiers. Disposable job URIs/database
names are scrubbed after awaited execution.

- `measure.mjs primary` → `v7-primary/`: **30 jobs / 3,000 samples**; before/current
  OFF/current ON/old a0 ON/source-only historical, two reversed rounds.
- `measure.mjs guards` → `v7-guards/`: **48 / 2,400**, six scenarios/both sizes/rounds.
- `measure.mjs strict` → `v7-strict/`: **36 / 1,800**, before/current strict/dormant.
- `v7-adverse-repeat.command.json` records the ONE 100-sample bounded batch selection:
  **14 / 1,400**, with all earlier observations preserved.
- Every batch preserves `*-job.json`, `*-result.json`, `*-worker.log`, `summary.json`.
  `measurements.md` has all unpooled median/p95/CPU tables; `measurement-verification.json`
  audits **128 jobs / 8,600 requests / 18 matching fixture fingerprints**.
- `packed-evidence/`: freshly generated tarballs, all four installed workflows,
  configs, emitted/bundled examples and focused 8-query native proof.
- `incoming-identities.json`, artifact metadata, `artifact-seal.log`,
  `final-verification.json` / `.log`: preservation, public surfaces, workload and final
  measured/rebuilt identity checks. Read-only recheck (writes no summary):
  `node _tmp-fp05-final-20261031-152953/verify-final.mjs --check`.

No READ latency (only LIST timed), real-application reproduction or arbitrary BSON-heavy
latency is available. Accepted mutable source/grant/context/config/native/stale-memo/
issued-member risks remain, including denial becoming allowance; arbitrary hook
computation is not bounded by selected library traversal. No security/historical/
zero-default-overhead equivalence claim. No fresh security audit/refactor started.

**Final audit: zero active build/test/benchmark/compiler/Mongo processes.** All owned
servers/Mongo/jobs were awaited and finished. No pending FP-05 gate remains. Return
to the coordinator for task reconciliation and independent FP-06 evidence closure;
do not claim that closure here or run workspace-wide checks later.
