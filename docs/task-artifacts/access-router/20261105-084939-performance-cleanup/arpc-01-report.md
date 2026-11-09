# ARPC-01 baseline and maintained CRUD harness

## Outcome / status

**Partial task delivery; do not mark the entire ARPC-01 matrix complete.** A
maintained, executable 16-tuple real-service CRUD baseline and package-local harness
regressions are delivered. Current package gates pass. Production source and the
coordinator-owned task file are unchanged. No optimization, speedup, allocation or
database-latency claim is made.

The frozen baseline and full noise calibration are preserved. **Most timing cells
are too noisy for performance acceptance under the preregistered rule**: 400/432
wall and 417/432 CPU cells exceed the fixed 20% cap; only 15 satisfy both caps.
Do not increase tolerance or call these cells neutral. Better stabilized/longer
measurement windows need a newly named protocol/noise packet. Missing related-target
and specialized timing cells also remain claim gates; see [coverage](arpc-01-coverage.md).

## Changes and behavioral evidence

- Added the separate maintained `scripts/benchmarks/access-router-crud.mjs` driver,
  worker and protocol guide. Older benchmark catalogs retain their identities and
  do not acquire write coverage by implication.
- Added a spy-free portable fixture under `packages/access-router/test/`, following
  the actual receivers/lifecycle of the inspected `owned-stage-test-fixture.ts` and
  `write-output-test-fixture.ts`, without importing their Vitest spies into timing.
- 432 named cells: 368 compact all-tuple direct/public branch cells and 64 targeted
  active-mode controls. All actual CREATE/UPDATE/UPSERT work is inside timing.
  No fictitious public filter-update API is generated. The direct LIST-access READ
  control is distinguished from the public wrapper's actual retry.
- Harness tests reject bad mode/fixture labels, unresolved settings, wrong output,
  denied-field leaks, skipped persistence, changed fixture/dependency/source code
  selections, corrupt bundles and invalid timings. Assertions include allowed and
  denied persisted input, complete persisted-state fingerprints, unaffected rows,
  branch-specific create/save counts and post-publication live-source mutation.
- The two-bundle regression uses actual production sources, adds a marker **only
  in an ignored copied candidate source tree**, proves the candidate marker loads
  while the baseline marker does not, and runs matching 432-cell CRUD output on
  two fresh workers. This is code-selection evidence, not a production candidate
  or a speedup comparison. [Source-selection proof](arpc-01-source-selection.json)
  records baseline source `f2d472...` versus marker candidate `60475b...`, distinct
  actually loaded bundle hashes and identical full output/state hashes. These test
  bundles use a copied source layout; their bundle hashes need not equal the
  separate operational baseline bundle hash.
- Separate 96-cell spied real-service work probes are preserved in
  [work observations](arpc-01-work-observations.json), with the
  [prioritized ARPC-02–06 findings](arpc-01-work-findings.md).

## Executed checks

Working directory: repository root. Every build/test/benchmark execution used
`TMPDIR='<repo-root>/_tmp-arpc-01-4d6agBQe'`; that fresh directory was created with
`mktemp -d` and accepted by `git check-ignore`. The driver regression creates its
own nested ignored scratch directory and restores `TMPDIR` afterward.

| Exact command | Result | Wall seconds |
| --- | --- | ---: |
| `pnpm --filter @web-ts-toolkit/access-router... build` | Pass; initial required package/transitive build | 15.96 |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass | 20.74 |
| `pnpm --filter @web-ts-toolkit/access-router test` | Pass: 204 files, 7,403 tests; Vitest 1266.07 s | 1282.16 |
| `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks/access-router-crud.mjs scripts/benchmarks/access-router-crud-worker.mjs` | Pass | 6.00 |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/access-router-crud-harness.unit.test.ts test/access-router-crud-driver.unit.test.ts test/access-router-crud-work.unit.test.ts test/write-output-modes.unit.test.ts` | Final harness pass: 4 files, 486 tests; work report exported using `ARPC_CRUD_WORK_REPORT="$TMPDIR/work-probes-final.json"` | 16.99 |
| `pnpm exec eslint packages/access-router/test/access-router-crud-fixture.ts packages/access-router/test/access-router-crud-harness.unit.test.ts packages/access-router/test/access-router-crud-driver.unit.test.ts packages/access-router/test/access-router-crud-work.unit.test.ts scripts/benchmarks/access-router-crud.mjs scripts/benchmarks/access-router-crud-worker.mjs` | Final harness/tooling pass | 1.30 |
| `node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/baseline"` | Pass; exclusive new destination, source/fixture/bundle/dependency verification | 1.56 |
| `node scripts/benchmarks/access-router-crud.mjs noise "$TMPDIR/baseline" "$TMPDIR/baseline-noise-v1"` | Execution pass: 432 cases, 28 fresh timing workers; noisy acceptance cells blocked as reported below | 190.87 |

Typecheck, full package test and scoped lint ran **sequentially**. The full package
baseline ran once. Later edits strengthened only the new harness, its diagnostics
and documentation; the final focused/lint commands above verify those edits.
Production baseline was unchanged throughout. No root/grouped/downstream suite or
repository-wide build/lint sweep was run. Only necessary transitive builds from
the package scripts were allowed. No build/test/lint overlaps the timing batch.

There is **no demonstrated current baseline package failure**. Initial authoring
checks found/fixed fixture bugs (reused request filter caches, per-item persistence
submission counts, preserving denied UPDATE input, public nested presentation
selection) and seal dependency discovery bugs (`@types` package-only entries and
Node built-ins such as `punycode`). They were not labelled historical production
failures. Final focused checks pass. A Vite native-config-loader warning was
observed; it did not fail a gate. Original command records and log hashes are in
[verification](arpc-01-verification.json); full raw logs remain operational scratch.

## Frozen baseline provenance

See [curated provenance](arpc-01-provenance.json) for the complete production-source
and `dist` file inventories, 127 dependency package identities/aggregate hashes,
maintained harness hashes and original operational manifest hash.

- Revision: `6c3ceee4433daf203d4625d70b0ef5c4b7009529`; production diff empty.
- Production source SHA-256: `f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480`.
- Compiled worker SHA-256: `c3eaa928d506f8023b92061db8244e20549ea9b91c17faefd6b73767a7f4125c`.
- Fixture SHA-256: `f63cb41394ec473abe463794f720247b00644f0238b9d0016e6b3d8ed2bd7e4d`.
- Node `v26.12.1`, pnpm `11.18.0`, esbuild `0.28.2`, Mongoose `9.11.4`,
  MongoDB Node driver `7.7.0`; workspace runtime dependencies from the same checkout.
- Linux x64 / WSL2 kernel `6.18.54.1-microsoft-standard-WSL2`, Intel i9-13950HX,
  16 logical CPUs. One measured client; fixture hook/bulk/persistence concurrency 2.
- Actual entry: `baseline/worker.cjs`, source-selected and self-identifying.
  `baseline/dist/` is preserved provenance, not a mutable runtime entry.

Preserved operational directory: `_tmp-arpc-01-4d6agBQe/baseline/` contains original
`src/`, `fixture.ts`, `dist/`, `worker.cjs` and `manifest.json`. **Do not modify or
overwrite it.** External dependencies are hash-checked, not copied; changing their
bytes invalidates the packet. Worker absolute external import locations make this
operational bundle checkout-local, not portable.

The archive deliberately omits generated bundles/source copies, complete external
dependency trees, MongoDB binaries/data, temporary consumer projects and full raw
test logs. Recalculation of preserved numeric observations does not need those;
rerunning services does. This is not a self-contained runnable installation. For
another checkout, recreate from the recorded production revision, maintained
fixture, lock/toolchain and dependencies, using new named seals/noise. Do not
pretend a relocated bundle or changed runtime is the original baseline.

## Calibration result and interpretation

The exact [preregistered protocol](arpc-01-noise-protocol.json),
[per-case report](arpc-01-noise-report.json),
[raw worker means](arpc-01-noise-raw.json),
[diagnostic queries/hooks/resolved modes](arpc-01-noise-work.json) and
[compact noise summary](arpc-01-noise-summary.json) are preserved byte-for-byte
where applicable; [archive manifest](arpc-01-archive-manifest.json) records original
and archived locations/hashes. The four raw/protocol/work/report files total
1,132,862 bytes, not a directory dump.

- Two repeat runs, seven alternating fresh-worker pairs each: 28 timing workers,
  108,864 timed real-worker invocations and 36,288 warmups. Separate diagnostic
  workers establish stable output/state hashes and work counts. All checks pass.
- Per-case noise is fixed before any production candidate: the bound is
  `max(3%, p95(abs(noise-pair-ratio - 1)))`, with claims blocked above 20%.
- Wall: 400 cells blocked; 32 within cap; median bound **47.34%**.
- CPU: 417 cells blocked; 15 within cap; median bound **104.66%**.
- Only 15 cells meet both caps (listed individually in the summary). Some rich
  LIST/bulk-CREATE paths are usable, but most singleton/small controls are not.
  This is not sufficient for all-operation non-regression acceptance.

Selected current-baseline observations below are medians of per-worker means,
milliseconds per operation. They are **not optimization comparisons**, and the
large noise bounds make most of them descriptive only. Every one of the 432
individual tuple/entry/operation/shape results remains in the report; no combined
CRUD or cross-mode average is used for acceptance.

| Tuple / direct operation (hooks, seed scale 4 / generated width 4) | Wall ms | CPU ms | Wall / CPU noise bound |
| --- | ---: | ---: | ---: |
| `iiii` READ hit | 1.1619 | 1.6754 | 68.7% / 175.9% |
| `iiii` LIST many | 0.7594 | 1.3458 | 47.4% / 123.7% |
| `iiii` bulk CREATE | 1.0897 | 1.8496 | 38.9% / 111.3% |
| `iiii` UPDATE ID | 0.8177 | 1.0893 | 52.3% / 118.6% |
| `iiii` UPSERT create | 0.8658 | 1.0083 | 51.6% / 80.2% |
| `iiii` UPSERT update | 0.6913 | 0.8741 | 52.7% / 145.4% |
| `tttt` READ hit | 0.3528 | 0.3561 | 49.9% / 73.6% |
| `tttt` LIST many | 0.4187 | 0.4224 | 44.0% / 128.1% |
| `tttt` bulk CREATE | 0.6675 | 0.6720 | 31.6% / 89.9% |
| `tttt` UPDATE ID | 0.5249 | 0.5480 | 54.3% / 133.9% |
| `tttt` UPSERT create | 0.4823 | 0.5118 | 13.0% / 20.9% |
| `tttt` UPSERT update | 0.6030 | 0.6240 | 54.2% / 88.8% |

Do not infer an isolated/trusted speedup from differently ordered cases in this
baseline-only packet. The next bounded measurement step should stabilize warmup
and lengthen worker-case windows in a **new** named protocol, retain the 20% cap
and slowdown sign rule, and recalibrate before looking at a production candidate.
Possible GC/JIT/host effects are unprofiled; the observed noise is the evidence,
not a demonstrated diagnosis of its cause. Do not silently repurpose v1 or broaden
its tolerance after seeing these results.

## Follow-up commands (current shared checkout)

The following comparison is executable after the next production change and its
package-local checks, but **cannot establish acceptance for noise-blocked cells**.
Use new candidate/output names. Run from repository root; no concurrent builds or tests:

```sh
export TMPDIR="$PWD/_tmp-arpc-01-4d6agBQe"
git check-ignore "$TMPDIR"
node scripts/benchmarks/access-router-crud.mjs freeze "$TMPDIR/candidate-arpc-02"
node scripts/benchmarks/access-router-crud.mjs compare "$TMPDIR/baseline" "$TMPDIR/candidate-arpc-02" "$TMPDIR/baseline-noise-v1/report.json" "$TMPDIR/comparison-arpc-02"
```

Replace `02` with a fresh task/attempt suffix when needed. The driver rejects an
identical production source/bundle as a real comparison; baseline-vs-baseline is
the explicit `noise` command. It verifies actual worker source/bundle hashes and
identical fixture/toolchain/dependency/case selection, not just directory labels.
Existing directories fail rather than being overwritten. Extending shapes or
changing timing code requires **new matching fixture seals and noise**, keeping
the original baseline production source; see the maintained protocol's optional
`SOURCE_ROOT` workflow.

## Remaining task-level acceptance / blockers

- **Measurement blocker:** baseline-vs-baseline noise exceeds the preregistered cap
  in most short-operation cells. Preserve v1 unchanged, stabilize/lengthen measured
  work in a newly named protocol, and preregister/recalibrate before inspecting a
  production candidate. Do not widen the noise cap or interpret high noise as
  non-regression. Both affected and unaffected controls still need useful evidence.
- Missing targeted real-service timing for parent × related target READ/LIST,
  populate/correlated includes, sort-heavy/dynamic-rule/enabled-changing-log cases,
  relevant failure/reentry/limit/duplicate-identity controls and retained heap.
  Existing package correctness coverage is mapped, not misrepresented as timing.
- Work counts do not partition CPU by helper. Each later optimization still needs
  attributable reduced-work and candidate evidence in both modes, with every
  affected/unaffected required cell individually considered.
- No DB-latency claim is possible from deterministic adapters. ARPC-06 still needs
  database-backed incoming-filter/callback/query equivalence evidence.
- The complete task matrix therefore remains **not fully satisfied**. These
  explicit gaps block corresponding claims, not package-only implementation of
  the baseline prerequisite; they do not authorize root/downstream test sweeps.

## Final evidence review

- Archived noise cases exactly recalculate from the preserved raw worker means
  using the maintained `summarize` function (432 cases, deep equality).
- Original/archive copied hashes match, the frozen baseline's entire seal verifies,
  and the curated maintained source/test/tool hashes still match the delivered tree.
- Artifact JSON parses; Markdown links resolve; manual path/session-identifier and
  trailing-whitespace scans pass; the artifact destination is not ignored;
  `git diff --check` passes. No production source changes, commits, resets or deletions were made.
