> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-06 independent withdrawal review

**Disposition: accept withdrawal; no runtime/API or required-verification blocker found.**
FUSE-06 only, separate fresh child from the FUSE-02/03/04 implementers. No delegation,
product/test/doc/task edits, commits, publishing, dependency/lock changes or user-work
restoration. Only new ignored review artifacts were added. Shared builds/tests and
review commands were foreground, awaited and serial.

## Findings and acceptance impact

### P3 — optional packed Node16 regression coverage

`packages/access-router/test/packed-consumer-compatibility.test.ts:909-928` writes a
Node16 config with a fixed four-file list. The new withdrawal fixture is added to
`authorizationFixtures` at line 446, but only NodeNext and Bundler consume that list.
Consequently the actual packed/release-shaped Node16 command does **not** compile
the new withdrawal fixture. The separate installed-type matrix really does compile
it in all five Bundler/NodeNext/Node16 forms with `skipLibCheck: false`; those five
tests independently passed. This is a regression-coverage gap, not an absent-API
or withdrawal acceptance blocker.

Optional resolution: add the withdrawal `.mts`/`.cts` files to the packed Node16
config, or explicitly distinguish packed Bundler/NodeNext coverage from the separate
installed Node16 coverage. If edited, rerun the selected packed current-major gate
and scoped lint/format serially. Do not attribute all packed Node16 fixtures to this
new matrix merely because the generic Node16 command ran.

### Evidence wording — observed guard slowdowns, not proven causal regressions

`docs/tasks/20261030-082847-access-router-unsafe-output-publication-fusion.md:534-546`
correctly preserves the small embedded gains, noisy controls and absence of a
significance/application/historical-parity claim. On completion, prefer **repeated
observed populate slowdowns / acceptable benefit not established** to language that
could imply an independently proven causal populate regression. The sign/magnitude
of those jobs is real; uncontrolled host/order/JIT variation and large
artifact-identical outliers prevent precise attribution. This does not invalidate
withdrawal: insufficient acceptable demonstrated benefit versus added complexity
and intentional native/authorization risk is enough to reject retention.

No universal no-gain claim, delivered speedup, retained prototype security-equivalence
claim or permanently dormant fusion API should be added.

## Restoration and public contract independently confirmed

- Replayed all four saved inverse patches **in memory** against FUSE-05's frozen
  start surface: exactly **25 original files restored + 10 known prototype fixtures
  removed**, the same 35 paths as `withdrawal-plan.json`. Every result matches its
  recorded authoritative original hash; every removed file remains preserved in
  start-surface and candidate-current-v1. No patch path reaches OIDC/example/client/
  root ESLint/task/dependency work.
- All **137 current source files** and **14 dist files**, including **8 declarations**,
  equal official FUSE-01 `before-v1` and `withdrawn-final-v1`, including path inventories.
  All candidate-current-v1 runtime/source bytes equal the FUSE-03 candidate-v3.
  Independently verified official/candidate/withdrawn complete regular manifests:
  **540 / 550 / 542 files**, plus **8,204 protected earlier evidence/dependency/metadata files**.
- CJS/ESM runtime export sets remain root **46**, advanced **48**, processors **6**;
  type export-name counts remain **186 / 322 / 17**. TypeScript checker inspection
  independently confirmed **128** original optional-boolean/hover checks across
  root/advanced Model/Default/Extended types and both declaration formats; former
  properties are absent. No new selectors/helpers remain anywhere in source/dist,
  original docs, CLI/core/worker or advertised package entries.
- A fresh production-transformed actual tarball contains exactly **18 files**:
  original 14 dist/declaration files, package metadata, README, llms and LICENSE.
  Only root/advanced/processors exports; no source, test, fixture, review artifact,
  dev dependency or scripts ship. Actual packed current-major gates separately pass.
- Inspected original service tail, child-before-getter finalization, grant/source/
  getter isolation, actual-actor callbacks, association refresh rejection, final
  graph ownership/bounds, include transfers and public/default forwarding. Byte
  restoration covers all entry paths; focused execution additionally covered
  direct/public/root READ/LIST, retry, standalone finalization, writes, dedicated
  subdocuments, native mutation, owners and original unsafe cross-products.
- New runtime regressions are meaningful: direct/public three-row LIST still makes
  **6 contexts / 3 private copies / 3 hooks / 1 read**; READ **2 / 1 / 1 / 1**.
  The native test retains **3 Date observations**, two actual document hooks, one
  getter, two row decisions per field-rule kind, and later same-ID name denial,
  whether or not JavaScript supplies the former names. Unknown server-option data
  is inert as before, not an API selector or authority.
- The original eight unsafe switches retain their prior documented risks; this
  review establishes restored bytes/behavior, not general security equivalence.
- CHANGELOG equals the captured original exactly, has no fusion entry, and original
  and current whole-file `prettier.check` both return false. The documented formatter
  exception is unchanged, not a new failed changed-file formatting gate.

Final identities:

```text
ESM ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca
CJS 64a2b78480a8c22f8ddfe1fe6c7c2b49404f324bd26a37286125ee97eb1ab52d
lock ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314
declaration hash 85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e
frozen worker 66ef54819cca683134f8c70f46a85f0dc90a1d70b701d79c2a77e61c3ca602e0
frozen core 837ce5a9431f7aeaabd2ddf552b2e863f70c71b771e55e1a45fab558788cf113
restored worker 02b75c8d0cba02afe0b23639d2736677511d2e6f5ac9d54642dadcf03fbe8c06
restored core d233660b2e04d94c3adea9bf707a0b4bd8417d4ec023bd642c3f3b56f0ce3c09
```

## Raw performance evidence independently checked

All **168 jobs / 12,300 measured requests**, including **144 prototype decision
jobs / 9,900 requests**, agree across raw jobs, raw result files and summaries.
Recomputed mean/median/p95/min/max/throughput from every raw latency sample, rather
than trusting overview statistics. Primary/bounded repeats have 100 samples;
guards/strict/dormant 50. Every round-two order exactly reverses round one. Identical
lock, actual peer links, **134 dependency records / 3,498 hashed files**, workload
settings and per-scenario fingerprints confirmed. Both actual getter paths on
Source/Target, requested/effective modes, true hydration, hook/getter/read counts and
first/final expected DTO fingerprints agree for every job. Before/withdrawn apply
no invented fusion flags.

Final bounded ON/OFF changes (percent; round 1 / round 2):

| Scenario | Median | p95 | Node CPU/request |
| --- | --- | --- | --- |
| wide | −0.43 / +0.53 | +0.16 / −6.50 | −1.28 / −1.03 |
| document rules | −0.86 / +3.64 | −11.05 / +7.05 | −3.33 / +3.21 |
| embedded | −1.90 / −2.00 | +5.83 / −5.82 | −3.25 / −5.63 |
| populate | +10.57 / +3.11 | +29.33 / +13.36 | +12.81 / +7.23 |

Earlier 100-row populate guards also show +3.47 / +10.11% median slowdowns. Narrow
apparent gains did not repeat. Small embedded wins exist and must not be erased.
Artifact-identical withdrawal controls include wide 22.865 vs 30.160 ms and embedded
95.425 vs 85.409 ms; those outliers and raw samples are preserved. No causal host
diagnosis or statistical significance is established.

Frozen worker/core hashes match the measured diagnostic runner. Its nine scenario
definitions and full seeding/query/warmup/measured/response-check block agree with
the restored original, apart from three explicitly identified pre-measurement
getter-diagnostic statements. The complete trial/check block is byte-identical.
Measured diagnostic workload hash remains `a0c6eac5cb4401527f7ca6c6c5fec9a8723659c449fed13cc26ca2e4f5c8a043`;
scenario hash `0bf8dd1fa8f1894b9c2f3f21918f85ef14879348c9fee4ec257ba5a7c084b146`.
The preserved replay driver uses this same frozen runner, without restoring a live
third group.

Limitations: LIST latency only, not READ. No real application or v0.51.0 run. CPU
includes Node HTTP server/client, not MongoDB; raw CPU counters were not persisted,
so CPU ratios use raw job statistics, not an independently recomputed CPU counter.
The unchanged worker fully validates first/final DTOs and checks only row count on
timed requests; matching fingerprints do not prove per-request security equivalence.
Reversed sequential order is not randomized execution.

## Independent checks actually executed

Working directory: repo root. These are the child commands actually executed via
the review's foreground logging wrapper; command JSON/logs preserve exact argv.
Use a new ignored results alias if rerunning to preserve review evidence.

### V1 — passed (5-package closure, concurrency one)

```sh
pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build
```

### V2 — 933 passed, 19 files, no skipped/failed tests

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=../../_tmp-review-fuse06-withdrawal-20261030-125920-c19a/v2-independent-boundaries-results.json \
  test/output-publication-fusion-withdrawal.unit.test.ts \
  test/strict-consumer-types.test.ts \
  test/initial-output-snapshot-copy.unit.test.ts \
  test/query-snapshot-options.unit.test.ts \
  test/query-snapshot-options.integration.test.ts \
  test/query-snapshot-work.unit.test.ts \
  test/snapshot-review-regressions.unit.test.ts \
  test/snapshot-review-comparator-regressions.unit.test.ts \
  test/document-authorization-validation.unit.test.ts \
  test/embedded-preparation-boundary.unit.test.ts \
  test/service-authorization-context.unit.test.ts \
  test/service-authorization-public-boundaries.integration.test.ts \
  test/retained-model-service-ownership.integration.test.ts \
  test/service-authorization-finalizer.unit.test.ts \
  test/service-authorization-mutations.integration.test.ts \
  test/service-authorization-subdocuments.integration.test.ts \
  test/read-list-fallback-authorization.integration.test.ts \
  test/virtuals-finalizer.unit.test.ts \
  test/authorization-snapshot.unit.test.ts
```

Includes all seven new withdrawal runtime/surface tests and five new strict installed
consumer matrix tests, all ordinary passes. Vite's future native config-loader
warning is nonfatal; no expectation or source was changed to make tests pass.

### V2 packed — 3 passed, 1 file, 7 deliberately unselected

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=../../_tmp-review-fuse06-withdrawal-20261030-125920-c19a/v2-independent-packed-results.json test/packed-consumer-compatibility.test.ts -t 'applies the real|packs the current|supports current majors from release-artifact tarballs'
```

Actual transformed tarball, emitted JS/declarations/docs and current-major installed
runtime/strict compiler workflow pass. No build-artifact pipeline or release was
invoked by this selection. Separate `packed-shape.mjs` uses the real manifest
transformer plus local `pnpm pack`/`tar` to verify the complete 18-file inventory.

### V6 — 21 passed, including 8 real worker jobs

```sh
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs
```

### V5 — all passed

```sh
pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks
pnpm exec prettier --check packages/access-router/README.md packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts packages/access-router/test/output-publication-fusion-withdrawal.types.fixture.ts packages/access-router/test/output-publication-fusion-withdrawal.unit.test.ts scripts/benchmarks/README.md scripts/benchmarks/access-router.test.mjs
git diff --check
```

Independently inspected FUSE-05 exact commands, successful logs and raw assertion
results for **5,906 / 174 full access-router**, typecheck, **691 / 22 serialized
downstream**, **799 / 17 focused**, and **21 runner tests**. No full package or
downstream rerun was needed because source/artifact identity and focused checks
revealed no invalidated gate. Whole-workspace checks were **not** run or claimed.

## Preservation, closure and coordinator reconciliation

An initial final audit rejected the broad "all starting changed files identical"
assertion because the unrelated OIDC task document changed concurrently. It was
not touched or restored. The failed guard remains in `artifact-final-check.log` /
JSON. A subsequent scoped audit passes: every product, phase doc, client/example
source, root ESLint, lock and protected artifact hash remains unchanged, with that
one unrelated task-document delta explicitly recorded. Earlier coordinator edits
to the FUSE/pipeline task records are also distinguished from implementer work.

Recommend coordinator completion of FUSE-06/the investigation with **withdrawal**,
keeping FUSE-02/03/04 cancelled as retained features and their actual historical
implemented/verified evidence intact. Mark the original "Introduce" objective as
historical when closing, preserve native counterexample/raw timing pointers, keep
the original eight flags and unresolved application/v0.51.0 concern explicit.
There is no delivered optimization and no retained prototype risk equivalence claim.

Detailed independent evidence: `artifact-initial.json`, `artifact-final.json`,
`evidence-independent.json`, `packed-shape-independent.json`, the exact check
JSON/logs/results and `finish.json` in this ignored directory. Final closure check
records **zero active relevant build/test/benchmark/Mongo/lint/format jobs**, all
owned commands awaited and no owned background jobs started.
