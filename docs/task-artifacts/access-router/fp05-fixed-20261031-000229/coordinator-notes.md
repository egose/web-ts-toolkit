> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Reopened FP-05 — fixed-artifact integration / performance

Sequential revalidation after completed FP-07/FP-08. The coordinator owns task
documents/status. No task edits, agents, commits, publication, dependency/lock,
historical or incoming user-work changes are authorized.

**No workspace-wide lint/build/tests, now or later.** Every check is restricted to
access-router/deco, necessary transitive builds, or benchmark scripts. Full package
packed/artifact workflows are required; they assemble existing outputs, not a root
workspace build. All commands are serial, foreground and awaited.

Old measured `c26c217…` and intermediate `55af08e…` artifacts remain historical;
they cannot be relabeled as the fixed candidate. Incoming fixed root ESM is
`a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f`.

## Outcome / disposition

Reopened FP-05 full **affected-package** integration and final fixed-artifact
performance revalidation are delivered. **Recommend retaining the experimental
opt-in with the agreed weaker contract.** The fixes preserve relevant repeatable
median/p95/CPU gains; no additional runtime refinement/bypass was necessary.
All known review-defect product regressions and the original nine review fixtures
pass. FP-06 must independently recheck the fixes and these new identities/results;
this session does **not** claim independent acceptance or change task status.

**No product source/test/docs changes by this reopened session.** All incoming
FP-07/08 changes and user work are byte-preserved. No current gate failed; no prior
result was relabeled as fixed. New evidence only, under this exclusive ignored path.

Resolved FP-01 omission matrix remains authority: no full source/grant/graph checks
restored. FP-07's exact parent request/runtime comparison and FP-08's selected-native
container budget/pre-serialization preparation remain intact. Active rules/hooks,
actor/target/query admission and finite concurrency remain; accepted mutable-input/
grant/stale-memo/issued-membership/native-observation risks are not waived further.

## Gates actually run (repo root; serial, foreground, awaited)

Every prefix has `.command.json`, `.result.json`, `.log` here. No root `pnpm build`,
`pnpm test`, `pnpm lint` or equivalent recursive workspace verification was run.
The mandatory packed artifact tests use the packaging pipeline with existing bin
outputs, not a workspace-wide compilation/test/lint. All other builds are only
access-router/deco and their required transitive closure.

| Gate | Exact command / result | Evidence prefix |
| --- | --- | --- |
| V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` — passed initially and after timing | `v1-build`, `v1-final-rebuild` |
| V3 FULL | `pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1` — **6,427 passed / 180 files**, no file/name filters | `v3-full-package` |
| V3 types | `pnpm --filter @web-ts-toolkit/access-router typecheck` — passed, package/transitive rebuild included | `v3-typecheck` |
| V4 FULL | `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1` — **691 passed / 22 files**, downstream typecheck included | `v4-downstream` |
| V2 product fixes/state | V2 prefix below + three files below, `--reporter=verbose` — **174 passed / 3 files** (50 owner, 80 native, 44 original fast-runtime cases) | `v2-owner-native-work` |
| V2 original reviewer | `pnpm exec vitest run --config _tmp-fp05-fixed-20261031-000229/vitest.review.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose` — **all 9 passed** | `v2-review-nine` |
| V5 | `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks` — passed | `v5-eslint` |
| V5 formatting | `pnpm exec prettier --check` over **45 changed scoped files**, llms via explicit Markdown parser, extracted new CHANGELOG entry, `git diff --check` — all passed, no writes | `v5-prettier-changed`, `v5-llms`, `v5-changelog-new-entry`, `v5-diff-check` |
| V6 | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs` — **29 passed**, real 16-worker cross-product smoke included | `v6-runner` |
| V7 | four unchanged-workload timing batches, **124 jobs / 8,200 measured requests**, all checks passed | `v7-primary`, `v7-guards`, `v7-strict`, `v7-strict-noise-repeat` |

V2 prefix:
`pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1`.
Three product files:
`test/authorization-fast-path-owner.unit.test.ts`,
`test/authorization-fast-path-native.unit.test.ts`,
`test/authorization-fast-path-runtime.unit.test.ts`.

The reviewer rerun reads the original unmodified fixture but uses **this new
directory's cache**, preserving prior review/FP-07/08 evidence/caches. Reviewer
wire-expansion getter reads are **0**; Code overbound/depleted/deep LIST/READ and
foreign parent request/runtime cases pass. These reruns are evidence of fixes,
not a new independent review session.

Whole historical CHANGELOG formatting remains the previously demonstrated exception.
Its entire incoming bytes and original failure-proof logs are preserved. Only the
new entry was checked here. Task documents were neither formatted nor edited.

### Full packed/native/minimum-peer proof

Full V3 passes **all 12 packed tests**, including the new FP-08 native case and all
three artifact assembly/package-tree checks. Actual minimum peers **Express 5.0.0 /
Mongoose 8.0.0** and current fixture peers **5.2.1 / 9.8.0** pass real tarball and
actual build-artifact-tree workflows, strict Bundler/Node16/NodeNext compiles,
CJS/ESM and emitted/bundled README executions. Current peers retain
`skipLibCheck:false`. Node16 means TypeScript resolution, not Node 16 runtime support.

`runConsumerSmokeTests` unconditionally copies and **awaits the permanent native
fixture in each of those four real installed workflows**, before optional passing
evidence is exported. Thus actual minimum-peer native behavior passed, not just
FP-08's earlier BSON-6 diagnostic. Final verifier checks all four evidence exports,
their exact peer pins/compiled configs, installed 14 dist bytes/shipped docs, tarball
hashes, no source/test/scratch shipping and the unchanged awaited native wiring.

Focused actual packed native result (current resolved Mongoose 9.11.4): ordinary
Code+nested DBRef **200** for LIST/READ; 20,001-slot Code and DBRef **400**, controlled
and no partial data; **six document hooks**. ESM equals the new fixed candidate.
Actual tarball SHA-256:
`a94ea725cbe74b217d947d298374f677c495fc351092d58f52dc16e756728c67`.
Evidence: `packed-evidence/native-budget-JdjiiU/result.json`; four
`packed-evidence/packed-consumer-*/verification.json` files preserve whole workflows.
The detailed statuses from the focused gate are in `v3-full-package.log`; installed
smoke success proves the same assertions ran with each actual peer installation.

## Final fixed primary timings

Milliseconds **median / p95 / recorded worker CPU per request**. Same fixed bytes,
original eight ON, new OFF vs ON. 100 rows, 24 fields, 32 bytes, one client, hook
concurrency 10, five warmups, **100 samples/job**. Two alternating reversed rounds.

| Scenario / round | Fixed eight ON / new OFF | Fixed eight ON / new ON |
| --- | --- | --- |
| wide / 1 | 17.570 / 20.723 / 22.324 | **12.933 / 15.189 / 16.306** |
| wide / 2 | 17.461 / 20.183 / 22.190 | **12.765 / 14.710 / 16.117** |
| document-rules / 1 | 21.405 / 24.078 / 26.045 | **15.135 / 17.361 / 17.972** |
| document-rules / 2 | 21.719 / 24.360 / 26.056 | **14.917 / 17.580 / 17.777** |
| embedded / 1 | 54.183 / 59.809 / 65.064 | **24.662 / 27.867 / 29.301** |
| embedded / 2 | 54.653 / 58.459 / 64.517 | **24.832 / 28.717 / 29.476** |

Same-fixed-build median reductions **26.4–26.9% / 29.3–31.3% / 54.5–54.6%**;
CPU reductions **27.0–27.4% / 31.0–31.8% / 54.3–55.0%**. All primary p95s improve.
Official-before medians in the same rounds were **16.702/17.131**, **21.561/21.555**,
**54.263/54.064**. Fixed ON directly improves before medians **22.6–54.6%**; wide
fixed OFF itself varies +1.9–5.2% vs before, so do not imply all defaults are free.

### Correction cost, active guards and default/dormant caveats

- Added six paired **preserved c26 new-ON** jobs to primary rounds (explicitly NOT
  fixed/accepted). Fixed-vs-old ON median changes are **+0.7/+0.3% wide**,
  **-4.2/-0.8% document**, **-0.2/+0.1% embedded**; recorded CPU is similar/lower
  in all six pairs. No broad ordinary-primary correction slowdown is established.
  This does not mean arbitrary selected native-container preparation is free or
  benchmark BSON-heavy applications; those are not these unchanged scenarios.
- All six active guards (narrow/hydrated/global-rules/large-config/populate/virtuals),
  **10 and 100 rows**, 50 samples, two reversed rounds: **all 24 pairs improve
  median, p95 and CPU**. Median gains about **15–33%**. Populate has two reads/request;
  others one. Virtuals execute **1,000 / 10,000 getters/job** at 10/100 rows.
- Strict/new-OFF and requested-ON dormant, all original eight OFF: three
  representative scenarios at both sizes/two rounds. Initial strict median changes
  vs before approximately **-6.7% to +4.8%**; dormant **-5.1% to +5.7%**. No implicit
  flags/active omissions; both models/getter paths verify false prerequisites.
- One bounded **100-sample** repeat targeted only adverse small-wide and 100-row
  embedded-strict observations (10 jobs): small-wide strict median **+1.7/-2.3%**,
  dormant **+0.9/-3.1%**; embedded-strict **+0.05/+0.65%**, CPU **+0.28/+0.68%**.
  The larger initial effects did not repeat, but modest overhead/order/tail noise
  is not ruled out. Small-wide initial strict p95 reached **about +11%**.
- Earlier old-runtime **+7% median / +19.5% p95** adverse evidence is preserved and
  remains explicitly historical; new repeats do not erase it or promise universal
  no regression. No aimless repetitions, selective pooling, latency assertions,
  instrumentation inside timing workers or workload/response-check changes.

Every timing job checks actual declarations/manifests/hash, both model single+bag
getters and configured off/dormant/active state, hydration, measured reads/hooks/
getters, denied fields/order/full pre/post fixture checks/fingerprints. Primary
document-rules executes **10,000 hooks/job** in all compared builds. Timing
`runtimeOmissionCounts` remains **null**, not per-row borrowing proof. Latency stats
are independently recomputed from raw samples; CPU is verified **as recorded worker
statistics**, not falsely recomputed from unavailable raw user/system CPU counters.

Separate instrumented product/reviewer tests retain zero active stage/grant/deep-
context/whole-source/transfer/identity/admission work, **one resolution/configuration
copy**, six contexts/hooks, **144 field callbacks**, one adapter read; embedded
derivation remains one. READ runtime selection/behavior is tested, **not READ latency**.

### Fresh historical source-only/current-dependencies pairing

Fresh two-round diagnostic medians: wide **5.340 / 5.454**, document **6.067 / 6.038**,
embedded **8.279 / 8.452 ms**. Fixed ON remains **2.34–2.98x** that diagnostic median,
closer than modern before but not parity. Full p95/CPU/raw values are in
`measurements.md` / `v7-primary/`.

This uses actual v0.51.0 source commit
`89180d219783fbfad412d8dfe19beae614f45c68`, FP-01's CURRENT-dependencies/peers/tooling/
workspace-dist rebuild and ignored supplemental tsconfig. Original historical lock
was **not installed**; no new historical install/build/network. Current inspector
re-read its actual manifests before runtime. It is **SOURCE ONLY / CURRENT DEPS**,
not frozen historical environment/performance or behavior/security equivalence.
Unchanged non-skim document-rules fixtures genuinely run all 10,000 hooks in both
historical and modern jobs. Modern mandatory hooks, captured policy/target gates,
opaque ownership/memo/selected budgets/private inputs differ. Matching ordinary
fingerprints do not establish whole-library equivalence.

Actual timed dependencies: Node **v26.12.1**, MongoDB **8.2.6**, Mongoose **9.11.4**,
Express **5.2.1**, Zod **4.4.3**. Workspace versions remain placeholders with exact
artifact manifests. These differ from the separately pinned packed-peer fixtures.

## New sealed artifact / preservation / hashes

- `final-fixed-candidate/` + `final-fixed-candidate-metadata.json`: **552 files**, all
  **14 dist / 8 declarations**, exact dependency links, 134 pinned identities / 3,500
  dependency files and unchanged lock/package/public metadata.
- `final-before-metadata.json` freshly re-inspects/references original FP-01
  official-before; its **542 files** are rehashed, **not rebuilt or overwritten**.
- `old-measured-candidate-metadata.json` re-inspects/references the preserved old
  c26 artifact (**549 files**); `historical-current-inspection.json` re-inspects the
  actual source-only diagnostic. Old tables/artifacts/logs are never overwritten.
- After full package/type/deco rebuilds and an additional post-timing V1, **all 14
  live outputs byte-match the newly measured fixed candidate**. Eight declarations
  still equal old incoming declaration bytes. Public exact runtime exports remain
  **46 / 48 / 6**, types **186 / 322 / 17**, both CJS/ESM conditions. No new helpers,
  markers, budgets or test/scratch artifacts ship publicly.
- Fixed root ESM:
  `a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f`.
  Root CJS:
  `c069cae63c91810d8e65c473677c21377f596b0db2cf12de28320fd57f15fa56`.
  Declaration manifest:
  `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468`.
  Lock:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Minimal fix source hashes: service authorization
  `027558e30bd19bea66e2d5688cd553582ad24f2bf9b3e72bcc4174b41a839e57`;
  selected materializer
  `a748fd5b010ed6564563f4f10a08b6b3599e3fd341f43528064d75bc28dec1cd`.
  Other FP-08 source/test/docs hashes are in `final-verification.json`.

Final audit passes **all 8,090 incoming identities**, including **5,895 earlier
evidence files**, all 139 runtime source files, original/new tests/task documents,
FP-07/08/reviewer/old measured evidence, user work, HEAD/status, lock/dependencies.
It also rechecks exact CJS/ESM/type export sets, **all 30 unchanged workload/check
blocks**, all gates and actual packed output/peer evidence. No product diff was added.

## Reproduction / raw pointers / handoff

Paths below are relative to this directory unless shown repo-relative. Commands ran
from repo root; no session identifiers or host paths are in shared notes. Disposable
job URIs/database identifiers are scrubbed after awaited execution.

- `measure.mjs primary` → `v7-primary/`: **30 jobs / 3,000 samples**, official before,
  same fixed OFF/ON, old c26 ON and source-only historical, both reversed rounds.
- `measure.mjs guards` → `v7-guards/`: **48 / 2,400**, all six scenarios/both sizes.
- `measure.mjs strict` → `v7-strict/`: **36 / 1,800**, before/strict/dormant.
- `v7-strict-noise-repeat/`: **10 / 1,000**, exact two-case selection in
  `v7-strict-noise-repeat.command.json`; one bounded 100-sample repeat, no replacements.
- Each batch retains every `*-job.json`, `*-result.json`, `*-worker.log`, `summary.json`.
  `measurements.md` has all unpooled median/p95/CPU tables and limitations;
  `measurement-verification.json` verifies **124 jobs / 8,200 samples / 18 fingerprints**.
- `packed-evidence/`: new real transformed tarballs, installed output/configs and
  native/peer proof; full command logs retain actual packed/artifact tests.
- `final-verification.json` / `final-verification.log`: preservation/export/workload/
  gates/package/measurement/process audit; `artifact-seal.log` and metadata hold every
  final file/dependency/public-surface identity.
- Read-only recheck:
  `node _tmp-fp05-fixed-20261031-000229/verify-final.mjs`.

No real-application reproduction or arbitrary BSON-heavy latency evidence is
available. Active selected native fallbacks remain bounded/fail-closed under the
documented FP-08 caveats; arbitrary application hook computation is not bounded by
that traversal promise. The agreed mutable source/grant/context/native/stale-memo/
issued-membership risks remain, including denial becoming allowance; matching these
fixtures is not security equivalence. Default/write/fresh-helper and cheap ownership
contracts remain covered, not waived.

**FP-06 sequential independent re-review is next.** Do not call this independent
acceptance or launch workspace-wide checks later. All owned foreground commands
returned; final audit reports **zero active build/test/benchmark/Mongo processes**.
No agents, task edits, dependency/lock/history changes, commits or publication.
