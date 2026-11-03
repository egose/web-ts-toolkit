> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09D — bounded remediation, full scoped gates and new candidate delivered

**Implementation/evidence is ready for coordinator reconciliation.** Five runtime
paths and one new **16-case** test file remove demonstrated catalog/compaction/actor
work without changing public declarations, existing tests, helpers' fresh capture,
guard selection/callbacks, benchmark tools or fixed gates.

**Performance acceptance remains OPEN.** No OAR-09B `--run`, OAR-10, gate waiver or
unchanged-artifact campaign ran. H4 diagnostic timings still do not establish an
improvement. The coordinator alone edits task/status; neither task document changed.

## Exact delta and ownership

New evidence is exclusively **`_tmp-oar09d-hVF7iALN/`**. Entry HEAD remains
`58b22c0d6d3abd4ecce03533e3867d148ff21233`. Incoming source/dist were OAR-09C final-01,
ESM `1d3b509c…`; all its eight runtime changes and 16 tests remain intact.

`final-01/DELTA.{json,diff}` compares this packet against ENTRY, not the broad redesign
relative to HEAD. `originals/` preserves **422 incoming byte streams**, with hashes in
`incoming-files.json`. Exactly these six product paths changed:

- `packages/access-router/src/acl/field-catalog.ts`: one idempotent structural index
  for a fresh privately owned primitive catalog; no second density proof/reset.
- `packages/access-router/src/acl/service-authorization.ts`: share that fresh catalog
  between planning/evaluation; raw-helper-only exact immutable actor-data reuse.
- `packages/access-router/src/acl/output-projection.ts`: actual ancestor membership,
  not all-pairs sibling prefix scans, with unchanged deterministic order/selection.
- `packages/access-router/src/permission.ts` and new private
  `packages/access-router/src/acl/owned-permissions.ts`: exact-constructor private
  boolean/key-list ownership brand. No public reader/API/capability is exported.
- New `packages/access-router/test/owned-authorization-projection-work.unit.test.ts`:
  **16 tests**; no existing test, assertion, registration, fixture or guide changed.

`WORK-REPORT.md` records actual hotspots, ownership proof, before-failing tests,
retained intermediate failures, counted work and residual uncertainty. No DTO
authority, application-identity/configuration cache, cross-call field decisions,
third engine, unsafe public control or client selector was introduced.

## Demonstrated work reduction (NOT performance acceptance)

`final-01/audit-02/WORK-REDUCTION.json` reconciles **nine exact fixture cases**. H3/100
full catalog walks **11,819→3,737**, actor-map copies **101→1**. H3/10 **1,289→407**
walks / **11→1** actor copies. H4 full walks **72→37**. Shared tiny guards/READ/native
paths also reduce their full catalog walks while retaining every eligibility entry.
Compaction's direct 240-field regression observes **57,600→240** prefix calls; repeated
owned-index density observations **86→0**. Raw CPU profiles and summaries are retained.

H3/100 STILL captures **100 fresh output policies/catalogs** plus one full query
capture: snapshot work 5,351, field memo calls 5,000, binding assertions 56,550 all
unchanged. Actor reuse is proven immutable DATA only, freshly looked up per helper;
subclasses/proxies/lookalikes do not qualify. Normal query actor copies and existing
internal-child behavior remain unchanged after two old tests caught a broader variant.

**H4 still performs one query / one document hook / 24 field callbacks**, with exactly
the old benchmark selection. Source/native/selected 20,000-slot/depth-100 ownership,
denied-value non-observation, sticky failure, async capture-before-await, stage
binding/generation/close/drain, target-own modes, negative pre-write facts and READ
retry semantics remain. Raw helpers are ISOLATED output-only source evaluation with
frozen EMPTY facts and explicit scoped outputFields; zero DB/doc hooks/virtuals/rows.
Fresh current authority still adds one explicit normal read/hook or batched read.

Final diagnostic medians/CPU do NOT establish fixed gates: H3/100 median
36.4480→35.5105 ms but CPU 47.0964→48.4617; H4 median 3.2016→3.2590, CPU
3.7664→3.9277. These are instrumented cross-time diagnostics, not V8 paired results.
No sign stability or universal/irreducible-cost claim follows. Required fresh helper
and full guard work remain; they were not silently dropped to improve a timing.

## Full scoped verification actually run, checkout root

Every exact argv/environment/exit/elapsed appears in this packet's named log.
V3/V4 are full unfiltered **Vitest exec** equivalents using external configs solely
for private cache placement and retention of NEW scratch trees. No assertion or
test discovery changed. Required transitive builds and separate typechecks ran.

| Gate        | Actual final command/result                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1          | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` (`v1-final-02.log`): five necessary packages, pass.                                                                                                                                                                                                                                                                              |
| V2          | Vitest exec / serial / eight complete named ownership/fact/helper/catalog/work files: **244 tests**, pass (`v2-final-02.log`). All rerun in full V3.                                                                                                                                                                                                                                                              |
| V3          | `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar09d-hVF7iALN/vitest-core.mjs --reporter=verbose --reporter=json --outputFile.json=../../_tmp-oar09d-hVF7iALN/v3-full-01-results.json --no-file-parallelism --maxWorkers=1`: **5,869 / 182 files**, zero failed/pending/skips. Then `pnpm --filter @web-ts-toolkit/access-router typecheck`, pass (includes its scoped build). |
| V4          | Six-package scoped deco/transitive build; `pnpm --filter @web-ts-toolkit/access-router-deco typecheck`; full unfiltered deco Vitest exec with `vitest-deco.mjs`, verbose+JSON, no file parallelism/maxWorkers=1: **742 / 23 files**, zero failed/pending/skips.                                                                                                                                                   |
| V5          | `pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks`, pass. Prettier check all six changed paths; `git diff --check`, pass.                                                                                                                                                                   |
| V6          | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs scripts/benchmarks/access-router-owned.test.mjs`, original baseline via `WTT_BENCH_LEGACY_ROOT`: **44/44**, no failed/skipped/cancelled.                                                                                                                                        |
| V7          | Fresh actual offline installed matrices from full V3/V4: **175 core / 27 deco** consumer/doc/export cases. `final-01/audit-02/PACKED-CONSUMER-AUDIT.json` rehashes actual installed/tarball bytes, numeric peers, guide counts and public exports.                                                                                                                                                                |
| Determinism | Snapshot after gates; one serial necessary six-package post-gate rebuild (`postgate-build-final.log`): **67/67 outputs identical**. Seal copied those tested bytes.                                                                                                                                                                                                                                               |
| Smoke ONLY  | Exact unchanged CLI `--plan`, then `--smoke` with the NEW final protocol: **180 jobs / zero failures / eight preflights**. Independent Python verifies **360/360 expected full fingerprints**, settings, ordering, actual counters/getters/hydration. This is NOT V8 or retention acceptance.                                                                                                                     |

### Installed and private-stage evidence

- Actual minimum **Express 5.0.0 / Mongoose 8.0.0** and numeric current **5.2.1 / 9.8.0**
  in flattened tarball AND artifact-tree layouts; TypeScript 6.0.3, five strict module
  forms, separate negatives. Minimum skipLibCheck:true / current:false preserved.
  These consumer peer cells are distinct from the benchmark's unchanged sealed
  dependency closure (worker reports Mongoose 9.11.4); no version is relabeled.
- **20 exact guide executions / 60 HTTP responses / 80 reads+hooks**; statuses
  `[200,200,400]`. Presentation/raw helper +0; current-authority refresh +1 normal
  read/+1 hook. Actual full affected deco workflows include both module conditions.
- **14 core outputs / eight core declarations / README / MIGRATION / llms** match
  actual installed and tarball bytes. Four tarballs each have **19 intended files**,
  104 local links resolve, no test/src/private leak. Root/advanced/processors ESM+CJS
  export sets are exactly unchanged **46/48/6**, not just equal in count. All necessary
  declarations across the six packages remain byte-identical to incoming OAR-09C.
- Smoke is 45 cases × four profiles, one round/two samples/one warmup: primary 12,
  guards 48, READ 40, helpers 52, native 8, facts 8, retention 12. All expected reads/
  hooks/getters/callbacks/fingerprints hold; native is 0 Mongo reads/1 adapter call,
  expensive facts remain exactly rows×10,000 iterations. No synthetic Mongo CPU or
  total allocation count. Candidate overflow/wire correctness remains controlled 400.
- Six-row structural probes: six raw fact normalizations/identities and 24/144/288
  callbacks at 4/24/48 fields; all **12 root+embedded stages close/clear**. Separate
  `STAGE-PROJECTION-CLEAR-AUDIT.json` additionally observes the actual frozen access/
  view projections being created and cleared (36 per mode), not inferred from labels.

## New sealed inputs and preservation

Use **only `final-01/FINAL-PROTOCOL.{json,md}`** and adjacent candidate metadata/artifact
for the fresh measurement owner. These are read-only, newly named inputs:

- New candidate ESM **`7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`**.
- Metadata SHA256 `63c5ed2dbf4bdc2d47d06c0fb4216347d8bbd3f3eadc9bfb4b2de87cf08bc197`.
- Protocol SHA256 `c7a523f9cb79d8574a56d688794d8d1508c7ecf05e05e0e29cb45c9f97efd28f`.
- Old baseline ESM remains **`33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`**;
  Node **26.12.1**, pnpm **11.18.0**, Mongo **8.2.6**, exact binary hashes and lock
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
- **622 copied files / 575 source records / 67 outputs / 13 unchanged benchmark
  files / 134 dependencies+3,510 files / 293 tool packages+10,545 files** verified.
- `final-01/PRESERVATION.json`: **1,247,280 historical paths**, including both failed
  campaigns, all earlier artifacts/originals/caches, unchanged by size/mtime/ctime/
  mode/link. 422 archived incoming streams and both task documents hash-identical.
  No giant fixture clone was made; only necessary new pnpm indexes/store files and
  actual fresh consumer installs were created in this packet.

No delegation, task/status edit, commit/publish, dependency/lock edit, user-change
discard, old evidence/cache write or workspace-wide verification occurred. All owned
commands were foreground, serial and awaited with exclusive cache/TMP/XDG/store paths.
`FINAL-SEAL.json`, `EVIDENCE-FILES.json`, `COMMANDS.json` and `processes-final.json`
close the packet. **No owned build/test/Mongo/worker jobs remain.**

## Next action / remaining risk

After coordinator reconciliation, a **fresh sequential OAR-09B owner** must compare
this candidate against the original old sealed baseline in the fixed **360 initial
jobs**, plus exactly two reversed pairs only for triggered comparisons. Preserve all
old/new failures and apply the unchanged three-of-four rule, including six small
sign-unstable cases. Do not pool cross-time campaigns or count diagnostic savings as
fixed performance gates. If adverse/sign gates remain, keep OAR-09 open for explicit
disposition. No OAR-10, performance acceptance or broader engine rewrite is authorized
by this delivery.
