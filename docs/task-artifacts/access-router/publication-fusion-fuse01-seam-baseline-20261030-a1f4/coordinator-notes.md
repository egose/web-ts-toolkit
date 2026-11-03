> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Suggested FUSE-01 completion evidence (coordinator-owned task edits only)

Suggested disposition: **completed investigation**, with the conservative seam
refinement below. No runtime/configuration fusion or measured fusion speedup in
this task. No remaining FUSE-01 blocker; later-task gates remain unrun.

Evidence root: `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/`.
Detailed source/architecture/fallback handoff: `seam-findings.md` in this directory.
All paths here are repo-relative; commands run from the repo root.

## Seam / contract

- Confirm independent default-false server-literal-true flags and **all FOUR**
  initiating LIST/READ prerequisites. Inherit only real authenticated edges;
  READ-to-list retains READ origin. Mode applicability does not prove publication
  eligibility. No public bit/marker/certificate/issuer or child-call cache.
- Use a separate private finalizer-to-service root completion, never an option on
  public finalizer/traversal args. Initially restrict to stripped metadata with a
  primitive top-level field, no produced includes/custom traversal, ordinary binding
  and current bounded admitted graph. This covers primary plain/document/embedded
  workloads. Standalone finalizers, writes, dedicated subdocuments, populate-target
  publication, metadata/include/open/exotic/unproven cases stay original/fallback.
- Omit the root intermediate association/context and post-finalizer whole-root copy/
  duplicate root transfer. Retain source, hook/getter/grant/return isolation,
  permissions, early metadata-source copy/retention, child-before-getter associations
  and scope contexts, **late child ownership validation**, final structural limits
  and exact final root/descendant bindings/identities/provenance. Recursive children
  already create zero ServiceOutputContexts because `onFinalized` is cleared.
- The ignored real-service native fixture establishes the lost observation:
  detached getter-return staging + selected value copy + private service copy =
  **3 Date observations**. The third denies a later same-ID row via its actual
  document hook. Future active fusion should retain two observations but allow that
  row, while retaining two document hooks/two name and two virtual-rule callbacks/
  one getter. This is intentional risk, not security equivalence.

## Fresh preserved artifact / identities

Official artifact: `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/before-v1/`.
Manifest: `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/before-metadata.json`.
It preserves all five workspace package directories, root package/workspace/lock/
version files, full access-router dist/package, and independent package dependency
links/node_modules links. External dependencies remain linked and hashed.

| Identity | SHA-256 |
| --- | --- |
| ESM `packages/access-router/dist/index.mjs` | `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca` |
| CJS `packages/access-router/dist/index.js` | `64a2b78480a8c22f8ddfe1fe6c7c2b49404f324bd26a37286125ee97eb1ab52d` |
| All preserved files manifest | `4ffa551cefdbbdfd0684431557a2ea6f6cc8bc5681d3ef2e31c6098fc92511ba` |
| All access-router dist files manifest | `10c84461e9ea6223a4363ecfb38c3b8692dd6fbb8ba9e6e37bf3e45d2858b908` |
| All eight declarations manifest | `18eabe7f219c28f98958c71268a9adf867771b0667a481a4940801678cd5ffb0` |
| Runner's CJS declaration-content hash | `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e` |
| Lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| Dependency identities JSON | `542aa784aa03bc49f8976cb9c4e088b015e88b950863734373c8808f2aa47461` |
| Unchanged worker | `02b75c8d0cba02afe0b23639d2736677511d2e6f5ac9d54642dadcf03fbe8c06` |

Final verification: **540 preserved regular files**, **14 current dist files**,
**8 declaration files**, **134 runtime dependency packages / 3,498 regular files**,
and **33 package dependency links** verified. CJS/ESM runtime export names saved
in `exports-before.json` (root 46 each, advanced 48 each, processors 6 each).

HEAD: `46d85e87743b49f5891d5844233f5b7bdf6d31f0`; VERSION `0.62.0`;
Node `26.12.1`, pnpm `11.18.0`, Vitest `4.1.11`. Actual worker dependencies:
Mongoose **9.11.4**, Express **5.2.1**, Zod **4.4.3**, MongoDB **8.2.6**.
Do not mistake package.json ranges for installed dependency versions.

## Initial timings (before only)

Command: `node _tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/driver.mjs timings`.
Worker/workloads unchanged. **100 rows, 24 fields, 32 bytes, 1 client,
hook concurrency 10, 5 warmups, 50 measured requests/job, 2 jobs/scenario**.
Order: wide/doc/embedded, then embedded/doc/wide. No added timing instrumentation.
Six comparison flags ON, two copy flags requested/effective ON; **fusion absent/OFF**
(no fusion declarations/runtime yet), not a falsely verified new selector.

| Scenario / round | Median ms | p95 ms | Worker CPU ms/request |
| --- | ---: | ---: | ---: |
| plain-wide / 1 | 17.505 | 21.625 | 23.431 |
| plain-wide / 2 | 18.248 | 20.705 | 23.231 |
| document-rules / 1 | 21.296 | 25.149 | 29.725 |
| document-rules / 2 | 21.997 | 24.582 | 27.573 |
| embedded / 1 | 52.514 | 58.041 | 62.910 |
| embedded / 2 | 54.203 | 59.790 | 67.424 |

Every job: actual **lean**, **50 measured reads = 1/read per request**, zero getters.
Document-rules: **5,000 measured document hooks = 100/request**; others zero.
The unchanged worker does not count individual field-rule callbacks in timings;
separate native/work-count fixtures do. CPU is worker server+client, excluding
MongoDB; HTTP latency includes loopback/serialization/parsing. These are two
before samples, not paired fusion benefit or historical-version comparisons.

Fingerprints (identical within each scenario's two jobs):

- Plain-wide: `165d378f09870e575203f9e2c8f012b0778715ecc0c2fdd9b03f4bd436536ea3`
- Document-rules: `1c6e7ecaf6f8e6c2f4d6b57530734750466ff5a9a96869ed3d05641979c070ae`
- Embedded: `4a32e28713aa14dc5248f87eda344bb089958fc984d4c50598c278651f656f13`

The worker verified first/final exact output, ordinal order, hidden-field denial,
document-rule owner denial (24 fields absent on 50 non-owner rows), and embedded
four-child output with hidden child fields absent. Raw samples/settings/results:
`_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/timings/summary.json`
and the six `*-job.json` / `*-result.json` pairs.

## Commands / test evidence

V1 passed: `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
Log: `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/v1-build.log`.

V2 baseline passed **902 tests in 16 files**, command:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/service-list-preparation.unit.test.ts test/finalizer-preparation.unit.test.ts \
  test/initial-output-snapshot-copy.unit.test.ts test/embedded-preparation-boundary.unit.test.ts \
  test/service-authorization-finalizer.unit.test.ts test/service-authorization-context.unit.test.ts \
  test/service-authorization-boundary-admission.contract.test.ts \
  test/service-authorization-public-boundaries.integration.test.ts \
  test/query-snapshot-work.unit.test.ts test/query-snapshot-options.unit.test.ts \
  test/query-snapshot-options.integration.test.ts test/document-authorization-validation.unit.test.ts \
  test/snapshot-review-regressions.unit.test.ts test/snapshot-review-comparator-regressions.unit.test.ts \
  test/authorization-snapshot.unit.test.ts test/read-list-fallback-authorization.integration.test.ts
```

Log: `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/v2-baseline-focused.log`.

Ignored fixture passed **8 tests + 2 expected failing-before tests**, command:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run \
  --config ../../_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/vitest.config.ts
```

Counts: `fixture-counts.json`; log: `v2-boundary-fixtures-final.log` in the evidence
directory. One/six-row direct/public lists: root contexts **2/12**, initial root
admissions **2/12**, private finalized-root copies **1/6**, hooks **1/6**, one
adapter read. Direct/public reads have the one-row counts. FUSE-03's deterministic
target is six contexts/zero post-finalizer root copies for six eligible active rows.
No wall-clock assertions. Promote both `it.fails` targets only with runtime fusion.

Also passed: `git diff --check`; artifact/dependency/export/earlier-evidence
verification via the new ignored scripts. All this task's jobs were serial;
no active build/test/benchmark process remained at the final process check.

## Changes, confounds and gaps

- Changed only the new ignored `_tmp-publication-fusion-fuse01-seam-baseline-20261030-a1f4/`
  artifacts/fixtures. Shared task documents/source/dependencies/worker/lock were not
  edited; no commits/releases. Git status path set stayed unchanged.
- All **2,051 earlier `_tmp-query-pipeline/` regular evidence files** verified unchanged.
  Unrelated OIDC work continued: three captured OIDC/example files changed externally,
  recorded in `final-verification.json`; none was restored/overwritten by FUSE-01.
- An unrelated browser test was observed initially; this task's build/test/timing work
  was held until it ended. Startup fixture dependency-link failures and an initial
  builtin-punycode preservation-hash failure were fixed only inside the new ignored
  artifact setup. `before/` is incomplete; use `before-v1/`.
- Not run by design: new-mode config/runtime tests, full package/types/downstream,
  packed/docs/export gates, ESLint/format, runner integration, strict/dormant/fusion-ON
  timings and 10/100-row guard scenarios. Those belong to subsequent tasks.
- No full security, ordinary-fixture security equivalence, application-hook parity,
  universal tail benefit or v0.51.0 performance parity claim.
