> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-06 — fresh independent final evidence closure

## Outcome

**PASS. Recommend marking FP-06 and the authorization-fast-path feature/task
completed. No unresolved blocking finding or invalidated required gate remains.**
R1, original R2 and the denied-key residual remain resolved on the exact independently
code-reviewed `33662fae…` runtime. Final FP-05 supplies the required new affected-package,
installed-peer and timing evidence for those bytes. This review independently closes
that evidence; it is not implementation, a new broad security audit or a parity claim.

The coordinator still owns task/status reconciliation. This reviewer made **no
product, source, test, docs or task edits**, builds, installs, dependency/lock changes,
commits, publication, reverts or delegation. Every command was serial, foreground and
awaited. No workspace-wide build/lint/test command ran. No product test or benchmark
was unnecessarily replayed; the new executions are evidence audits, not additional
product-test counts. Only this exclusive ignored directory was written.

## Independent audits actually executed

Working directory: repository root. Recorder:
`python3 _tmp-fp06-final-20261031-143300/run.py <prefix> <command...>`.
Each prefix preserves exact argv, exit status, elapsed time and output in
`.command.json`, `.result.json` and `.log`.

| Successful final prefix | Command after the recorder prefix | Result/output |
| --- | --- | --- |
| `baseline` | `python3 _tmp-fp06-final-20261031-143300/preserve.py baseline` | 38,863 incoming file identities; explicit task-only exception |
| `gates` | `python3 _tmp-fp06-final-20261031-143300/audit-evidence.py gates` | 21 actual command/result/log triplets; `gate-audit.json` |
| `artifacts-dependencies-final` | `python3 _tmp-fp06-final-20261031-143300/audit-evidence.py artifacts` | Installed/tarball/live/sealed/source/dependency identities; `artifact-audit.json` |
| `measurements-targets-final` | `python3 _tmp-fp06-final-20261031-143300/audit-evidence.py measurements` | All 128 jobs / 8,600 samples; `measurement-audit.json` |
| `structure` | `node _tmp-fp06-final-20261031-143300/audit-structure.mjs` | 30 original workload/check blocks, awaited fixture/callers, four fresh declaration inspections, live exports; `structure-audit.json` |
| `final-diff` | `git diff --check` | Fresh check including the authorized task-only delta; exit 0 |
| `preservation-final` | `python3 _tmp-fp06-final-20261031-143300/preserve.py check` | All incoming identities/Git state preserved; `preservation.json` |
| `processes-final` | `python3 _tmp-fp06-final-20261031-143300/finish.py` | Zero active build/test/benchmark/compiler/Mongo processes; `process-audit.json` |

These are **four substantive independent evidence audits**, plus baseline/preservation/
process checks. They are not falsely added to the product test totals below.
Read-only compiler inspections ran in short-lived children and exited normally.

## Actual final FP-05 gates audited, not merely handoff prose

All following evidence is under `_tmp-fp05-final-20261031-152953/`. Every listed gate
has actual recorded exit **0**. Exact argv and hashes for every command/result/log
are in this review's `gate-audit.json`.

| FP-05 evidence prefix | Actual command/result independently checked |
| --- | --- |
| `v1-build`, `v1-final-rebuild` | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`; both build only utils/http-errors/express-response-handler/express-json-router/access-router, with all five DTS builds successful |
| `v3-full-package` | `pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1`; **6,449 individual passing lines, 180 distinct test files**, matching actual footer; **12 packed cases** |
| `v3-typecheck` | `pnpm --filter @web-ts-toolkit/access-router typecheck`; transitive/package build and actual `tsc --noEmit -p tsconfig.typecheck.json` |
| `v4-downstream` | `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1`; actual log **691 tests / 22 files**, downstream typecheck included |
| `v2-owner-native-work` | Package Vitest, three explicit owner/native/runtime unit files; **196 individual passes / 3 files**, native 102 + owner 50 + runtime 44 |
| `v2-review-nine`, `v2-review-residual`, `v2-review-adjacent` | Three exclusive FP-05 configs; **9 + 8 + 8 = 25 individual passes**, original reviewer fixtures unchanged, new caches only |
| `v5-eslint` | `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks`; no diagnostics |
| `v5-prettier-changed` | **45 distinct scoped files**, exact list checked; no task files/unrelated formatting |
| `v5-llms`, `v5-changelog-new-entry`, `v5-diff-check` | Explicit Markdown parser for llms; exact extracted current new CHANGELOG entry; `git diff --check`; successful actual logs |
| `v6-runner` | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`; **29 individual successes**, 29 pass / 0 fail/cancel/skip; real-worker cross-product case included |

Full V3/V4 argv have no test-file/name filters or exclusions; actual package scripts
and config agree. V4 uses the nonverbose reporter, so its actual summary, not invented
individual test lines, supplies its counts. No unfiltered workspace verification.

The historical whole-CHANGELOG formatting exception is still proven by the earlier
forced baseline/current warning logs; unchanged historical entry bytes and the
current extracted new entry were independently checked. It was not suppressed,
reformatted or incorrectly declared a whole-file formatting pass.

## All four fresh installed workflows / public contract

Each `verification.json` is exported **after** its entire real installed workflow
succeeds. Source review and AST checks establish direct unconditional
`await runMongoConsumer('authorization-fast-path-native.runtime.mjs', consumerDir)`
inside `runConsumerSmokeTests`, before optional evidence export; **both** parameterized
tarball/artifact callbacks await that function. The harness freshly stages current
dist/docs and invokes `pnpm pack`; the artifact workflow freshly assembles the actual
artifact tree. There is no earlier-tarball substitution in those successful gates.

All paths below are under FP-05 `packed-evidence/`:

| Actual preserved installation | Layout | Express / Mongoose | Strict app checking / skipLibCheck |
| --- | --- | --- | --- |
| `packed-consumer-ffIYyB` | Flat tarball | **5.0.0 / 8.0.0** | true / **true** (established minimum-peer compatibility) |
| `packed-consumer-jJYlyo` | Flat tarball | **5.2.1 / 9.8.0** | true / **false** |
| `packed-consumer-xcMTY5` | Artifact `dist/` | **5.0.0 / 8.0.0** | true / **true** |
| `packed-consumer-cL4j2Q` | Artifact `dist/` | **5.2.1 / 9.8.0** | true / **false** |

All four passing workflows compile strict **Bundler, Node16 and NodeNext**, execute
CJS/ESM and emitted README paths plus the bundled README. Config/fixture/emitted/
bundle hashes are checked directly. Node16 is TypeScript resolution, not Node 16
runtime support; package runtime remains Node >=22.

Independently hashed **all 14 installed outputs in every layout** against both the
measured candidate and latest live outputs; also read all 14 outputs from every
preserved access-router tarball. README/llms equal current docs; only the three
intended public entrypoints ship, no source/tests/scratch/private issuer/materializer/
budget API. The test staging includes its known matching `.tool-versions` seed.

The current permanent native fixture asserts ordinary Code+nested DBRef **LIST/READ
200**, oversized Code/DBRef and **21,000 denied-wire-key LIST/READ 400**, controlled
authorization failure and no partial output, exactly **8 document / 2 wire hooks**.
The new focused packed result agrees. Its Mongoose **9.11.4** linked-peer execution
is distinct from the four actual pinned installations, not substituted for minimum
peers. Reused the earlier **independent actual public probe** only after matching its
exact tarball, all 14 extracted outputs and fixture hashes to the new evidence.
No unnecessary Mongo/public replay was needed.

Fresh live runtime CJS/ESM name sets are exactly **46 / 48 / 6** (root/advanced/
processors); default and named `acl` identity holds. Actual earlier independent
compiler symbol sets are reused only after exact declaration/extraction identity:
**186 / 322 / 17**, BOTH import/require conditions. No new full consumer compilation
is claimed by this reviewer.

## Independently recomputed timing evidence

**128 raw job/result/log triples / 8,600 measured samples**, with exact summary-to-raw
identity, raw file hashes, genuine target entries/manifests and reversed sequences:

| Batch | Jobs | Samples |
| --- | ---: | ---: |
| `v7-primary` | 30 | 3,000 |
| `v7-guards` | 48 | 2,400 |
| `v7-strict` | 36 | 1,800 |
| **ONE** `v7-adverse-repeat` | 14 | 1,400 |

Independent Python calculation, **not the benchmark summarizer**, recomputes every
median, nearest-rank p95, mean, min/max and throughput. **CPU is audited as recorded
only**: the unchanged worker does not preserve raw user/system counters. All 18
fixture fingerprints were independently regenerated from the actual expected fixture
construction, retaining denial, field content and row/array order. Actual worker
preflight/postflight full-response/hydration checks and all **30 original workload/
scenario/check blocks** match the preserved original proof.

Primary: 100 rows, 24 fields, 32 bytes, one client, hook concurrency 10, five warmups,
100 samples/job, two reversed rounds. Same current `33662fae…` artifact, eight ON:

| Scenario / round | New OFF median / p95 / recorded CPU ms | New ON median / p95 / recorded CPU ms |
| --- | --- | --- |
| wide / 1 | 20.381 / 24.684 / 24.096 | 14.785 / 19.591 / 17.559 |
| wide / 2 | 20.124 / 24.598 / 23.884 | 14.694 / 17.929 / 17.517 |
| document-rules / 1 | 24.731 / 28.513 / 27.866 | 17.859 / 22.024 / 20.200 |
| document-rules / 2 | 24.276 / 28.109 / 27.675 | 17.143 / 20.697 / 19.448 |
| embedded / 1 | 63.969 / 72.432 / 70.141 | 29.124 / 34.678 / 32.212 |
| embedded / 2 | 63.065 / 69.144 / 68.637 | 28.918 / 34.238 / 31.788 |

Confirmed primary median gains **27.0–27.5% / 27.8–29.4% / 54.1–54.5%**, with every
primary p95/CPU lower. Current OFF vs official-before median **-6.4% to +2.4%**.
Both models' single+bag getters, requested/supported/configured/effective modes,
hydration, reads/hooks/getters/dependencies and declaration manifests check out on
every job. Populate retains two reads/request, others one; virtual guards retain
1,000/10,000 getters/job, document primary 10,000 hooks/job across all builds.
Compiler validation exits before peers/runtime and outside the measured heap.
Timing omission counters remain **null**; **LIST is timed, not READ**.

Adverse results are **not erased or dismissed**:

- Initial active guards: **23/24 lower median, 23/24 lower p95, 23/24 lower CPU;
  22/24 lower all three**, NOT all-24 gains. Narrow-10 round 1 **+4.34% median /
  +3.81% CPU**; virtual-10 round 2 **+4.34% p95**.
- ONE bounded repeat: narrow gains **30.14% / 18.09% median**, p95/CPU lower in both
  rounds; original adverse observations remain. No added primary runs or pooling.
- Strict embedded-10 repeat **+2.39% / +2.81% median**, CPU **+2.27% / +3.66%**.
  Wide dormant-10 repeat **+10.32% / +0.819607 ms median**, **+11.72% p95 /
  +6.52% CPU**, then reversed **+0.94% median / -4.32% p95 / +0.58% CPU**.
- Modest default overhead and sequential order/tail noise remain plausible, not a
  universal no-regression/default-free claim. Earlier c26 **+7% median / +19.5% p95**
  and a0 adverse/repeat evidence is preserved, not replaced by these tables.
- a0 ON correction controls explicitly remain **known residual / NOT accepted**.
  Current-vs-a0 median **-3.83% to +0.82%**, CPU **-1.76% to +0.92%**, p95
  **-1.46% to +11.39%**: no broad ordinary-primary slowdown, not free native work.

Dependency audit rehashes **134 identities / 3,500 files**, verifies 25 external links,
and matches 52 modern workspace dependency files between before/current/old clones.
Historical links use that same verified modern before dependency closure. Authentic
Git source comparison verifies **138 official-before files** against HEAD and **106
historical files** against v0.51.0 commit `89180d219783fbfad412d8dfe19beae614f45c68`.
The fresh historical diagnostic is **SOURCE ONLY / CURRENT DEPS**; current ON is
**2.09–2.85x slower**, NOT frozen-v0.51.0 environment, performance or security/behavior
parity. Timing peers are Mongoose 9.11.4 / Express 5.2.1 / Zod 4.4.3, Node v26.12.1,
MongoDB 8.2.6, distinct from installed-consumer fixture pins.

Separate unchanged instrumented reviewer work proof retains **zero** active stage/
grant/deep-context/whole-source/transfer/identity/admission work; full resolution
**7→1**, configuration copies **77→1**, six contexts, **6 actual hooks / 144 callbacks /
1 read**, one embedded scope derivation. Wire expansion reads remain zero. These
proofs are not latency measurements or per-row borrowing claims inferred from modes.

## Identity / preservation / limits

| Identity | SHA-256 |
| --- | --- |
| Measured / rebuilt / installed root ESM | `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822` |
| Root CJS | `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea` |
| Fresh tarball, equal to earlier independent reviewed bytes | `7e768d4fd3462ca0abc24bd140cd44e7c5a7c92c278e8694d8ab8b286ad49fa4` |
| Eight-file declaration manifest | `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468` |
| Lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| Native fixture | `c3e14be4efd8508db34fdf8121f16f59e2832ce4073c16b5ebdf70857debf30e` |
| This review's task baseline | `8b7153517b4c08b3edde392cea8a103ea11d6328f2cff58a815212f7bf417386` |

All **14** latest live outputs equal measured/sealed bytes; all **8** declarations
remain unchanged. All 1,953 independent code-precheck product identities match except
the authorized task update. All 37,640 FP-05 incoming identities likewise match with
that **one explicitly allowed path**. This is not corruption; old `verify-final.mjs`
was not run or changed. The reviewer captured the current task before auditing and
preserved it. Source has not changed since the independent code review.

Final preservation verifies **38,863 files**, including **36,668 earlier evidence
files**, 139 current runtime source files, old artifacts/caches and the interrupted
`_tmp-fp06-closure-20261031-091145/` baseline. HEAD remains
`8fb1fe7f148d5115d7bc0caa3aa0cddc31ad30b3`; status/binary diff unchanged (diff SHA-256
`891d65948f672512447aa803f45092fcee96c9925570674c152431b964fc2bb0`).

Scratch audit setup assumptions were corrected only here: the harness's `.tool-versions`
pack seed, the earlier review's nested extraction path, the framed declaration-hash
format, and historical dependencies being links rather than duplicated package trees.
The initial failed audit logs are retained; successful final runs above resolve them.
These were audit-fixture assumptions, **not failing product gates or product bugs**.

Accepted borrowed source/grants/context/config leaves, stale memo/authority and issued
membership rather than reachability remain, including possible denial-to-allowance
changes. Actual permission rules/hooks/getters, actor/target admission, cheap root
request/runtime/call ownership and selected 20,000-slot/depth-100 bounds retain the
previous independent review's exact source/tests. No waived snapshots/deep graph
checks are demanded. No arbitrary BSON-heavy/real-application/READ latency, exhaustive
security audit, statistical significance, frozen historical or security equivalence
claim is made. **No owned process remains; no further gate is required for closure.**
