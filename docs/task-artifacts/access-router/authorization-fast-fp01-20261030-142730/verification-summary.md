> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-01 executed evidence

All paths below are relative to
`_tmp-authorization-fast-fp01-20261030-142730/` unless a repo-root command is shown.
Run commands from the repository root. No build/test/benchmark jobs overlapped.
No source implementation, task documents, dependencies, lockfiles or tracked
historical files were edited. No commits, installs completed, publication or delegation.

## Fresh official before (V1)

Command: `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
Result: **passed**, all five transitive workspace packages built serially. Log:
`v1-build.log`. `preserve-before.mjs` then copied all five packages' sources, tests,
package metadata and dist outputs into **`official-before/`**, including every one
of access-router's **14 dist files / 8 declaration files**. Workspace dependency
links point into the preserved copies, not mutable current workspace dist; external
dependencies/peers are linked and content-hash pinned. No older artifact overwritten.

Starting/current HEAD: `8fb1fe7f148d5115d7bc0caa3aa0cddc31ad30b3`.
VERSION `0.62.0`; package.json keeps workspace placeholder version. Entry:
`official-before/packages/access-router/dist/index.mjs`.

| Identity | SHA-256 |
| --- | --- |
| ESM root entry | `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca` |
| CJS root entry | `64a2b78480a8c22f8ddfe1fe6c7c2b49404f324bd26a37286125ee97eb1ab52d` |
| all-14-dist manifest | `10c84461e9ea6223a4363ecfb38c3b8692dd6fbb8ba9e6e37bf3e45d2858b908` |
| all-8-declarations manifest | `18eabe7f219c28f98958c71268a9adf867771b0667a481a4940801678cd5ffb0` |
| worker declaration hash | `85a7fa10ea3fb85b55523f746015f99944aebc753548a6c710d42d562fd8f65e` |
| access-router package.json | `e2696196378391670e17967d71e1ff735f20c7b92dddacc93c3907fe767d5fcb` |
| current lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| actual deps/peers identity file | `2fec52e4587189c5d3ce1e612e4e83bc494707b9f15f36cb68f45a2c026db617` |
| public export identity file | `819a963309ab6d6f7664682f029bf70bb7b9ba915d14683929322d999a5c342f` |
| unchanged benchmark worker | `02b75c8d0cba02afe0b23639d2736677511d2e6f5ac9d54642dadcf03fbe8c06` |
| unchanged benchmark core | `d233660b2e04d94c3adea9bf707a0b4bd8417d4ec023bd642c3f3b56f0ce3c09` |

Full per-file hashes: `before-metadata.json`; actual runtime dependency/peer closure
**134 packages / 3500 files**: `dependency-identities.json`. Preservation covers
**542 files** (before runtime closure duplicate counting). Export maps and exact name
sets: `public-exports-before.json`: root/advanced/processors runtime CJS and ESM
counts **46 / 48 / 6** respectively; declared import/require name sets
**186 / 322 / 17**. Compiler-resolved declaration exports include types, not just
runtime values. No private helpers/new flags exported; former fusion absent.

Tools: Node `v26.12.1`, pnpm `11.18.0`, tsup `8.5.1`, TypeScript `6.0.3`, Vitest
`4.1.11`. Measured runtime versions resolved **beside preserved candidate**, not
from version strings in package.json: Mongoose **9.11.4**, Express **5.2.1**, Zod
**4.4.3**; workspace utils/router versions are placeholders with real content hashes.
MongoDB **8.2.6**. Root build target remains Node 22.

## Focused baseline (V2)

Command prefix:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1
```

Actual appended package-relative files (full command also in log):

```text
test/query-snapshot-options.unit.test.ts
test/query-snapshot-options.integration.test.ts
test/query-snapshot-work.unit.test.ts
test/list-snapshot-checks.unit.test.ts
test/list-snapshot-checks.integration.test.ts
test/read-snapshot-checks.unit.test.ts
test/read-snapshot-checks.integration.test.ts
test/initial-output-snapshot-copy.unit.test.ts
test/document-authorization-validation.unit.test.ts
test/service-authorization-context.unit.test.ts
test/service-authorization-finalizer.unit.test.ts
test/service-authorization-reads.unit.test.ts
test/finalizer-preparation.unit.test.ts
test/virtuals-finalizer.unit.test.ts
test/snapshot-review-regressions.unit.test.ts
test/snapshot-review-comparator-regressions.unit.test.ts
test/service-authorization-direct.integration.test.ts
test/service-authorization-related.integration.test.ts
test/include-source-provenance.integration.test.ts
test/retained-model-service-ownership.integration.test.ts
test/read-list-fallback-authorization.integration.test.ts
test/output-publication-fusion-withdrawal.unit.test.ts
```

Result: **22 files, 992 tests passed**, 54.43s. Log: `v2-baseline-focused.log`.
Strict/native/copy/graph owner behavior, original flag cross-products, public/direct
services, finalizers/getters, includes/targets, retained runtime/model ownership,
READ fallback and fusion-absence baseline were exercised. This is focused coverage,
not the full access-router/downstream/workspace suite.

Ignored real-service fixture command:

```sh
pnpm exec vitest run --config _tmp-authorization-fast-fp01-20261030-142730/vitest.config.ts --no-file-parallelism --maxWorkers=1
```

Initial run: **9 tests passed** (`v2-work-risk-fixtures.log`). Added exact deterministic
count assertions and cheap tuple rejection fixture, reran: **10 tests passed**, 1.74s
(`v2-work-risk-fixtures-final.log`). All six original count cases reproduced exactly.
Machine-readable excerpts: `fixture-evidence.json`. Counts and proposed active risk
expectations are explained in `coordinator-notes.md`; no active-mode result is
claimed because runtime implementation is intentionally absent in FP-01.

## Initial unchanged-worker current timings (V7)

Command: `node _tmp-authorization-fast-fp01-20261030-142730/driver.mjs`.
The ignored driver only orchestrates fresh child processes; it imports/invokes
**unchanged** repository worker/core and passes manifest/hash-verified preserved
entry/declarations. Settings: **100 rows, 24 fields, 32 payload bytes, one client,
hook concurrency 10, five warmups, 50 measured requests per job**. Separate wide,
document-rules and embedded scenarios; two jobs each, reversed scenario order in
round two. Each job gets a fresh Node worker and independent seeded database on one
owned disposable MongoDB process. Build/setup/preflight/warmup/final validation
outside timed samples. No instrumented fixture code used for timings.

Current settings are **original six ON + original two ON**, new flags absent/OFF.
Worker verifies both getter APIs for every supported flag on both actual models,
declaration and entry hashes, LIST effective copy mode ON, actual lean Mongoose
queries, selected/denied data and order before/after timing. Every job: **50 measured
DB reads (1/request), 0 getters**. Document-rules separately: **5000 actual document
hooks**; wide/embedded: zero (no hook configured). READ flags are configured and
getter-verified but not measured by this LIST workload. Embedded has four children
per row and no document-rule hook; it is not a combined embedded/doc-hook workload.

| Scenario / round | Median ms | p95 ms | CPU ms/request | Max ms |
| --- | ---: | ---: | ---: | ---: |
| plain-wide / 1 | 22.271 | 28.653 | 29.727 | 35.477 |
| document-rules / 1 | 28.242 | 36.923 | 35.556 | 45.382 |
| embedded / 1 | 67.015 | 95.089 | 84.951 | 133.122 |
| embedded / 2 | 69.449 | 92.351 | 84.500 | 109.369 |
| document-rules / 2 | 25.599 | 30.843 | 32.188 | 34.191 |
| plain-wide / 2 | 21.712 | 26.922 | 29.483 | 31.782 |

Raw job inputs, logs, per-request samples and summary: `v7-before/`, driver log:
`v7-before-driver.log`. Fingerprints match across both rounds:

- Wide: `165d378f09870e575203f9e2c8f012b0778715ecc0c2fdd9b03f4bd436536ea3`
- Document rules: `1c6e7ecaf6f8e6c2f4d6b57530734750466ff5a9a96869ed3d05641979c070ae`
- Embedded: `4a32e28713aa14dc5248f87eda344bb089958fc984d4c50598c278651f656f13`

No wall-clock assertions or speedup claim. Samples show tail noise, notably embedded
max 133ms and document-rules median variation ~28.2→25.6ms. CPU includes server/client
worker work, excludes MongoDB; latency includes loopback HTTP/JSON parsing.

## Historical source and diagnostic timing disposition

Tag **v0.51.0** resolves to **89180d219783fbfad412d8dfe19beae614f45c68**. Actual
Git source was read, not inferred from modern comments. Key file excerpts, blob IDs
and content hashes: `historical-source/`; findings/symbol refs/matrix:
`coordinator-notes.md`. Historical finalizer still isolated output/getter document
views and ran field rules, but reused supplied grant maps and shallow contexts.
Service skim could skip grants and pass `{}`; modern mandatory hooks stay active in
the proposed path. Therefore no historical behavioral/security equivalence promise.

Searched existing ignored query/fusion scratch plus `.wip/benchmarks` reports. All
ten older v0.51.0 report targets referenced removed temporary build trees; the separately
preserved phase-2 `prepared.json` build was also gone. `historical-build-discovery.json`
records the phase-2 check; `historical-report-build-discovery.json` records all ten
report targets. Old report timings were **not reused as measurements**.

A new read-only Git archive was exported to `historical-same-dependencies/`:
`historical-v051-source.tar`. Historical dependencies were **not installed** and
the tag/lock/current deps were not changed. Diagnostic build details/limits:

1. An initial `pnpm --dir ... exec tsup` unexpectedly triggered pnpm 11's automatic
   dependency-status installer. It **aborted before removal/install** with
   `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; do not repeat it with CI/purge enabled.
   Log: `historical-same-deps-build.log`. Actual runtime/peer contents were rehashed
   afterward and matched the official-before identities exactly.
2. Invoking the current tsup CLI directly avoided that installer. Original historical
   tsconfig workspace-source aliases made declaration build fail on a missing
   `express-serve-static-core` type in an archived sibling source. JS emitted, but this
   failed attempt was **not** timed. Log: `historical-same-deps-direct-build.log`.
3. Added only a supplemental ignored `tsconfig.fp01-diagnostic.json` with `paths: {}`;
   original historical source/config/package/lock files remain byte-identical.
   Direct current tsup CLI + supplemental config then built all **14 dist files**,
   including declarations. Log: `historical-same-deps-overlay-build.log`. This uses
   **current actual external dependencies/peers/tooling and copied modern workspace
   dependency dist**, not frozen historical dependencies. No install/network needed.
4. `capture-historical-diagnostic.mjs` verified **106 source/config/package/lock files**
   against actual Git blob identities and pinned every dist file. Metadata:
   `historical-diagnostic-metadata.json`; inherited 133 non-access-router runtime/peer
   packages: `historical-inherited-dependency-identities.json`. Archived lock hash:
   `485bd859b48915f013b662d9b286a699326b17c0bc40d5d7ec33e4f8f7190ff3`;
   actual dependency identity is the **current** lock/hash listed above. Supplemental
   tsconfig hash: `768ad93bd28f6de5a34d7120092c3051d0b97374722a088bc72ad0282a736ea0`.
5. Resulting historical-source-only ESM hash is
   `9ab523a462b3abb8dd67b6c5dc41e76e0f6bd2670b2891aaa641bab1ac0c6f89`, CJS
   `845d5b24a2ad0db0a83477b7464707a26f3e960c976dd96bc042984fee1c490d`.
   Its declaration support is **0/6 and 0/2 (N/A, not strict-enforced/OFF)**.

Actual source-only diagnostic run (same settings/unchanged worker):

```sh
node _tmp-authorization-fast-fp01-20261030-142730/driver.mjs v7-historical-same-deps historical-diagnostic-metadata.json
```

| Source-only diagnostic scenario / round | Median ms | p95 ms | CPU ms/request | Max ms |
| --- | ---: | ---: | ---: | ---: |
| plain-wide / 1 | 9.330 | 16.639 | 11.229 | 21.016 |
| document-rules / 1 | 10.685 | 19.180 | 13.310 | 27.343 |
| embedded / 1 | 14.269 | 19.940 | 17.175 | 21.610 |
| embedded / 2 | 13.270 | 15.947 | 15.160 | 24.424 |
| document-rules / 2 | 8.251 | 16.469 | 11.628 | 27.282 |
| plain-wide / 2 | 8.527 | 13.788 | 10.517 | 20.942 |

All six jobs passed full fixture output checks, actual lean hydration, 50 reads/job,
0 getters, 5000 hooks for document-rules and zero hooks otherwise. Actual dependency
versions and the three fingerprints match the current fixture results. Historical
document-rules explicitly uses non-skim to ensure grant hooks really execute.
Results: `v7-historical-same-deps/`, log `v7-historical-same-deps-driver.log`.

**Interpretation limit:** these are measured timings of unmodified v0.51.0
access-router source against **current** dependencies/peers/tooling/workspace deps.
They are not measured frozen v0.51.0 environment performance. Current and diagnostic
batches were sequential, **not alternating paired current/historical candidates**;
do not publish a causal speed ratio or parity claim from them. Matching common
fixtures proves neither security equivalence nor compatibility outside those fixtures.
The rebuilt artifact is available for later same-dependency diagnostic pairing.
A frozen historical-lock comparison requires separately authorized dependency setup;
it is not an FP-01 blocker and is not claimed here.

## Remaining verification boundaries and handoff

- FP-02: use selection/origin/warnings/admission decisions in `coordinator-notes.md`;
  implement config capture only; inspect emitted JSDoc/declarations; keep original
  arrays and fusion-withdrawal tests unchanged.
- FP-03: implement discriminated trusted state and material removals, shared evaluators,
  cheap root/membership contract, source/grant/native/graph-risk regressions and bounded
  output reconstruction. Port before work fixtures into active-vs-ON8 comparisons;
  do not mistake context 2→1 alone for the required optimization.
- FP-04: installed handle/context/option docs must describe actual weaker alias/membership
  semantics, not the current strict unchanged-graph promise. Add independent third
  benchmark group, without altering existing workloads or six/two meanings.
- FP-05: full V1–V6 and active/same-build ON8-OFF/before paired V7, strict/dormant guards
  and narrow/hydrated/global/large-config/populate/virtual 10/100-row guards remain.
  No new fast-mode timings are possible until implementation exists. No full package
  test/typecheck/downstream/packed/full-workspace gate was required or run for FP-01.
- Final identity/process verification: `final-verification.json` (created after all
  owned gates). It checks current + preserved all14dist, lock, 542 preserved files,
  3500 runtime/peer files, worker/core/export/declaration manifests, HEAD and empty
  tracked runtime/package/scripts/lock diff; reports owned job cleanup.
- Resolved contract questions: borrowed source/grants/context accepted; historical
  getter document views retained for business semantics; current mandatory hooks
  retained despite historical skim; exact root checks retained; issuance membership
  replaces current reachability; copied/value fallbacks do not fabricate strictness;
  unvisited full-document limits lost, introduced algorithms bounded. No user decision
  or implementation-blocking question remains. Performance retention is unmeasured
  until FP-03/05, not assumed solved by this investigation.
