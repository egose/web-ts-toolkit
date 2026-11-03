> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09C — narrow runtime remediation and new scoped-gated candidate delivered

**OAR-09C implementation/evidence is ready for coordinator reconciliation.**
Eight runtime files and one new 16-case test file reduce demonstrated overhead.
Full scoped gates pass: **5,853 core / 181 files; 742 deco / 23 files; 44 benchmark
runner tests; zero failures/pending/skips**. The newly sealed correctness smoke
passes **180 jobs / 360 expected full-response fingerprints / eight preflights**.

**Performance acceptance remains OPEN. No OAR-09B `--run` campaign or OAR-10 ran.**
No tradeoffs were accepted, no gates/workloads/repeats changed, and no sign stability
is inferred from diagnostics. The original failed 464-job campaign stays intact.
Coordinator alone edits task/status; this child did not edit either task document.

## Exact delivery / before-after evidence

New evidence is exclusively **`_tmp-oar09c-ckrmwpy3/`**. Incoming HEAD remains
`58b22c0d6d3abd4ecce03533e3867d148ff21233`; work is uncommitted. No delegation,
commit/publish, dependency/lock edit, revert, old evidence/cache write or workspace-wide
build/lint/test occurred. All builds/tests/profiles/workers were foreground, serial,
awaited, with private TMP/XDG/pnpm index/store/cache paths. **No owned jobs remain.**

- `final-01/DELTA.{json,diff}` lists **exactly nine product paths** against entry,
  not HEAD's much larger incoming redesign. `originals/` preserves **421** incoming
  source/test/tool/docs byte streams; `incoming-files.json` records their hashes.
- Runtime: `src/acl/{authorization-snapshot,document-stage,field-catalog,
  model-output-planning,output-field-filter,output-field-policy,
  trusted-output-materialization}.ts` and `src/output/finalize-model-output.ts`
  under `packages/access-router/`.
- New test: `packages/access-router/test/owned-authorization-work.unit.test.ts`.
  No existing test or benchmark assertion was deleted/changed. No public types,
  shipped guide, mode/configuration API, selection policy or decorator code changed.
- `WORK-REPORT.md` explains every actual source-level culprit, ownership replacement,
  counted work, raw CPU profiles, failed intermediate variant and remaining limits.
  `final-01/audit-02/WORK-REDUCTION.json` contains eight full before/after cases;
  `final-01/VIRTUAL10-DIAGNOSTIC.json` adds the ninth confirmed case.

### Mechanisms and real reductions

1. Stage reads reuse only immutable **private within-stage** access/fact projections,
   while retaining every receiving/open/publication/owner/binding check and async
   generation check. New projections clear after drain. Sync memo entries no longer
   allocate unused promises; async/reentry still gets one shared pending promise.
2. Static output aggregates no longer duplicate request-key records. **Exact request
   key first-decision semantics across dotted/nested routes remain**, as do ordered
   ancestors, seeded settled decisions and dynamic aggregate identity. Plain-wide
   100-row field memo entries **5,000 -> 2,500**; binding assertions **42,853 -> 27,553**
   by eliminating duplicate reads, not bypassing receiving authentication.
3. Raw helpers capture a **fresh output-only** configuration and schema catalog on
   every call, without unrelated query/default/doc-hook/private-populate capture.
   H3-global/100 full query-config captures **101 -> 1**, PLUS **100 fresh output
   captures**. Snapshot-node visits **19,848 -> 5,351**. No cross-call caching or DTO
   identity authority; source remains ISOLATED, facts EMPTY, policy explicitly scoped.
4. Generated immutable primitive catalogs reuse owned preparation rather than
   traversing/copying it again, but charge the **same total slots/depth in the same
   capture budget**. Frozen lookalikes/native leaves do not qualify. No schema cache.
5. Selected primitives avoid graph closure/WeakSet construction while retaining
   exact budget/depth/prepaid/sticky-poison checks. Plain-wide observed specific
   WeakSet constructions **2,509 -> 9**; this is NOT a total allocation counter.
6. Omit unused working/doc-hook diagnostic shells. Virtual rows use independent
   sibling views with a still-private stable base taken by its final possible
   consumer: **300 -> 200** copies at 100 rows, **30 -> 20** at 10. Native sibling
   isolation and returned-value staging remain; getters stay **two per row**.

Raw helper/DTO repicks still perform all needed checks; no workload was replaced
with a presentation subset or hidden current-read. **H4 retains one read/one hook/
24 field callbacks**; no narrow guard projection. Separate rows/input/output/related/
operation authority, negative pre-write facts, both source modes, target-local policy,
READ retry origin, selected/native 20,000/depth-100 receiving budgets, before-serializer
admission, poison/close/drain/late-publication and readonly diagnostic allowlists remain.

### Before failures and retained correction

- `regression-before-01.log`: **7 failed / 3 passed** before runtime edits, observing
  unnecessary promises, full per-helper captures and three virtual views. The final
  request-key memo optimization retains one rather than zero static entries; final
  counted before/after evidence records the actual **2 -> 1** reduction.
- `catalog-regression-before.log`: separate owned-catalog identity/copy regression
  fails before its fix (**1 failed / 10 passed**). Final tests add equal exact/depleted
  capture-budget checks, unbranded lookalikes, native sibling isolation, sync reentry,
  frozen shared facts/24 callbacks, and awaiting-helper setter/next-call freshness.
- First full `v3-full-01` is preserved: **12 failed / 5,841 passed**, all in the existing
  field-policy cache suite (four primary assertions plus cascading unreleased-promise
  hook timeouts). It exposed an overaggressive removal of required first-key/aggregate
  memo behavior. Runtime corrected; the old assertions were NOT weakened. Focused
  correction **150 cases / three files** and final full V3 pass.
- Two initial diagnostic launches rejected a wrong private database-name format;
  preserved failures, then corrected the harness-only name. The first local audit
  assumed flattened layout for an artifact-tree cell; `audit-01` failure is preserved,
  and `audit-02` checks both real layouts. No accepted artifact/tool change resulted.

## Scoped verification actually executed (checkout root)

Every exact argv/environment/exit/timing is in this packet's named `.log` file.
External Vitest configs relocate caches and retain only newly created consumer scratch;
they do not change discovery/assertions. V3/V4 are full unfiltered **Vitest exec** runs,
not a claim that their literal package `test` script was invoked. Required scoped
transitive builds and separate typechecks did run, serially.

| Gate | Actual commands / result |
| --- | --- |
| V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` (`v1-final-02.log`): five necessary packages, pass. |
| V2 | Full new/retained ownership/native suites: **404 / seven files** (`v2-final-01`); after memo correction **150 / three complete files** (`v2-correction-01`), pass. Final V3 covers them all again. |
| V3 | `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar09c-ckrmwpy3/vitest-core.mjs --reporter=verbose --reporter=json --outputFile.json=../../_tmp-oar09c-ckrmwpy3/v3-full-02-results.json --no-file-parallelism --maxWorkers=1`: **5,853 / 181 files**, zero failed/pending. Then `pnpm --filter @web-ts-toolkit/access-router typecheck`, pass (includes its five-package scoped build). |
| V4 | Six-package `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build`; full unfiltered deco Vitest exec with `vitest-deco.mjs`, verbose/JSON, serial: **742 / 23 files**, zero failed/pending (`v4-full-01`). Separate `pnpm --filter @web-ts-toolkit/access-router-deco typecheck`, pass. |
| V5 | `pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks`, pass. Prettier checks all nine changed files; `git diff --check`, pass. |
| V6 | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs scripts/benchmarks/access-router-owned.test.mjs`, original baseline via `WTT_BENCH_LEGACY_ROOT`: **44/44**, zero skipped/cancelled/failed. |
| V7 | Included full core **175** consumer/doc/export cases and deco **27**, fresh offline actual installed minimum/current tarball and release-artifact-tree matrices. `final-01/audit-02/PACKED-CONSUMER-AUDIT.json` checks actual peer versions and copied/installed bytes/public surfaces. |
| Determinism | Snapshot after gates; serial six-package post-gate rebuild passes (`postgate-build-final.log`), **all 67 outputs identical**. New candidate sealed from those exact bytes. |
| Correctness smoke/probes | `node scripts/benchmarks/access-router-owned.mjs --smoke docs/task-artifacts/access-router/oar09c-ckrmwpy3/final-01/FINAL-PROTOCOL.json _tmp-oar09c-ckrmwpy3/smoke-final`: **180/180**, zero failures, eight successful preflights. Independent Python raw checks verify **360/360 expected full fingerprints** and every count/hydration/getter proof; no timing/retention acceptance. `--plan` also passes. |

### Installed and correctness details

- Actual minimum **Express 5.0.0 / Mongoose 8.0.0** and pinned current **5.2.1 / 9.8.0**
  in both layouts, TypeScript 6.0.3. Preserve minimum skipLibCheck:true versus current
  skipLibCheck:false (full declaration check). Five strict Bundler/Node16/NodeNext module
  forms and separate expected-failure sources execute through existing full suites.
- **20 exact guide executions / 60 HTTP responses / 80 reads and hooks**, statuses
  `[200,200,400]`. Presentation/raw helpers add zero; current authority adds +1 normal
  read/hook. Related/deco owned module conditions remain included in full V4.
- All **14 core outputs / eight declarations / README / MIGRATION / llms** match
  installed bytes. Actual tarball has **19 intended files**, no test/src/private leak.
  ESM/CJS root/advanced/processors export counts remain **46 / 48 / 6**; all necessary
  declarations are byte-identical to incoming OAR-09A, not just structurally similar.
- Smoke is exactly 45 cases × four profiles, one round, two samples/one warmup:
  primary 12, guards 48, READ 40, helpers 52, native 8, facts 8, retention 12 jobs.
  READ is actual ID/filter routing plus direct findById/findOne probes, one read.
  H2/H3 refresh adds one normal/batched read, not per-row queries. H1/raw helpers add
  zero reads/hooks/getters. Native cases are zero Mongo reads/one explicit adapter call.
  Expensive facts remain exactly rows × 10,000 iterations, once per hook, not per field.
- Candidate native overbound/wire probes return controlled 400/no partial output.
  Six-row/4–24–48-field probes retain six fact normalizations/identities and exactly
  **144 callbacks at 24 fields**, all **12** stages closed/cleared. New cached access/view
  pointers have additional clear assertions in private work instrumentation.

## New sealed inputs for the next owner

Use **only `final-01/FINAL-PROTOCOL.{json,md}`** and adjacent candidate metadata/artifact.
Do not reuse the old accepted final-02 candidate/config for new measurements.

- Candidate ESM: **`1d3b509cbe2f34cfba076bbc10779091aef1592001914b37a700165987eea54e`**.
- Candidate metadata SHA256: `4aedee50018253dd99c36bff1f3b166ac3d3519857a73033317755e8c76b91b4`.
- Protocol SHA256: `63482befc9e13b80685993ee7781ab53998f7553ffe4311b01bf0aebf44f29f7`.
- Baseline ESM remains `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- Node **v26.12.1**, pnpm **11.18.0**, Mongo **8.2.6** and their binary hashes pinned;
  lock remains `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- **620 copied candidate files / 573 source records / 67 dist outputs / 13 unchanged
  benchmark files**; **134 dependencies / 3,510 files**, **293 tool packages / 10,545
  files** verified unchanged. Candidate, metadata and protocol/runbook are read-only.
- `final-01/PRESERVATION.json` and final closure verify **1,044,719 prior paths**,
  including the original failed campaign, artifacts, caches and archived originals,
  unchanged by size/mtime/ctime/mode/link. No giant historical clone was made.

## Remaining limits / next action

`WORK-REPORT.md` and raw profiles cover all nine confirmed roots. They are bounded
instrumented diagnostics, **not interleaved acceptance pairs**. H3-global/100 still
must capture 100 fresh policies/catalogs, unlike old handle reuse. H4 retains all
24 required output callbacks versus old guard's zero. H4's diagnostic median did not
improve; residual costs are disclosed. No remaining gate is silently declared fixed.
The seven original sign instabilities cannot be resolved by one diagnostic or smoke.

After coordinator acceptance, a **fresh sequential OAR-09B measurement owner** must
execute the unchanged 360 initial jobs and exactly two further reversed pairs only
where triggered, with fresh exclusive evidence/cache directories and the new seal.
If fixed gates still fail, retain them and request explicit disposition; no sample
fishing, threshold revision, old handles, DTO authority, cross-call memo or narrowed
guard workload. No OAR-09/10 completion, performance acceptance, universal speedup,
total allocation count, Mongo CPU or blanket security-equivalence claim follows here.

`FINAL-SEAL.json`, `EVIDENCE-FILES.json` and `processes-final.json` close this packet.
**No owned build/test/worker/Mongo jobs remain.**
