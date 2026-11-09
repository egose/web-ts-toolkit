# ARPC-05 outcome: candidate implemented, performance acceptance unverified

## Disposition

The minimal production candidate and regression tests remain in the working tree
for the coordinator's retain/withdraw decision. **Original ARPC-05 criteria are not
fully met:** behavior/work reduction is verified, but valid measured benefit in
both modes and required per-path non-regression are absent. No speedup, allocated-
byte gain, retained-heap gain, universal equivalence or task completion is claimed.
The shared task file was not edited; no commits, resets or withdrawals were made.
No builds, tests or benchmarks remain queued.

## Exact owned source/test paths

- `packages/access-router/src/logger-helpers.ts`: the existing internal debug helper
  accepts a context factory, evaluating it only after its single level check. It
  remains absent from package exports. No new level cache or service-side level
  check is introduced; logger resolution, receiver and exception handling remain
  at their existing boundary.
- `packages/access-router/src/services/service.ts`: only `beginOp`/`completeOp`
  use lazy context construction. Start and completion timing are captured outside
  lazy logging, including disabled starts followed by enabled completions. The
  completion-level probe does not inflate the captured duration. CREATE gets no
  invented summary; READ/LIST/UPDATE/direct UPSERT/DELETE share the same boundary.
- `packages/access-router/test/service-lazy-logging.unit.test.ts`: **58 tests**.
- `packages/access-router/test/service-lazy-logging.integration.test.ts`: **32 tests**.
- New evidence files are exclusively under this `arpc-05/` directory; the precise
  inventory/hashes are in [audit.json](audit.json). [candidate.patch](candidate.patch)
  preserves just the two production-file edits against revision `6c3ceee`.

## Behavioral and deterministic work evidence

Real direct/public CRUD regressions cover both active modes, READ hit/miss and
public READ-to-LIST retry, empty/single/many LIST, single/bulk CREATE, UPDATE by
ID/filter, both UPSERT branches and DELETE success/miss/denial. Enabled, missing-
level, throwing-level and throwing-debug logger postures keep structured messages,
receivers, output, persistence and ordered non-log callback/query traces stable.
Tests pin one level check per existing event, conservative fallback behavior,
replacement logger resolution, default-handler/custom-receiver fallback, and
false-to-true/true-to-false levels with controlled timestamps.

The logical/native filter regression admits `$and`/24-branch `$or`, `$in`, RegExp,
Date, Buffer and ObjectId values through actual service query preparation. It
observes **zero summary calls and zero summary enumerations** while disabled,
unchanged admitted adapter filters, and exact enabled cardinality-only messages
(`filterKeyValueCount: 29`) with no raw values. Traversal instrumentation is only
in that separate correctness test, never timing.

Database-backed related-scope tests cover isolated/trusted parent × target,
parent READ/LIST × correlated target READ/LIST, both direct/public entries and
embedded selected children. Disabled logs skip all existing events' summaries;
enabled output, query traces and hooks agree, including independently active
target modes. No authorization/finalization shortcut is introduced.

[96 final CRUD diagnostic cells](crud-work.json), compared with the original
[ARPC-01 work observations](../arpc-01-work-observations.json), show:

- Disabled summaries: **144 → 0** total. READ/LIST/UPDATE: two → zero each;
  CREATE remains zero. Both modes/entries and bare/hook/metadata, singleton/16-row
  shapes are included.
- Every other preparation/copy/scheduler/sort/adapter/hook/filter count and ordered
  trace matches the baseline exactly. See [comparison](work-comparison.json).
- [184 logger-posture records](logging-work.json) additionally preserve all 46
  compact CRUD cases × four postures, including UPSERT logs. Enabled
  structured messages were also compared **across the sealed baseline/candidate**
  in [separate timing diagnostics](timing-work.json), not just helper-only tests.

These are skipped-work observations, **not measured allocated-byte savings**.

## Bounded real-service measurement

The [preregistered protocol](protocol.md) was fixed before candidate measurement
and not revised. The one bounded packet completed in **82.673s** (300s hard cap):
**56 fresh timing workers**, plus two diagnostic workers; noise and comparison
each used seven alternating pairs × two repeats, 16 warmups and 32 measured calls
per case/worker. Each phase contains **7,168 measured invocations**. Reset/new
requests, full output/state/mode checks and hashes are outside each interval;
real service authorization/finalization/local persistence-adapter work is inside.
No timed spies, counters, profiler, forced GC or concurrent build/test ran.

Original baseline source/bundle and candidate source/bundle were separately sealed
and reverified. Node `v26.12.1`, pnpm `11.18.0`, dependencies, toolchain and host
identities are recorded in [provenance](provenance.json) and
[measurement protocol](timing-protocol.json). The timing fixture uses **24 `$and`
branches**, not `$or`; the latter is separate correctness coverage.

**0/8 cells satisfy the fixed 20% noise cap** (both wall and CPU exceed it in
every cell). These short exploratory samples also do not establish v2 warmup
convergence/window quality. All results are claim-blocked; no tolerance was
increased and no retry, allocation substitute or sample deletion was attempted.

Exploratory values below are **not accepted speedups or non-regression results**.
Wall medians are milliseconds per actual service invocation; ratios are paired
candidate/baseline repeat medians, not ratios of the separately pooled medians.
`iiii`/`tttt` specify READ/LIST/CREATE/UPDATE modes; each row remains separate.

| Cell | Wall median baseline / candidate | Noise wall / CPU | Paired wall repeat ratios |
| --- | --- | --- | --- |
| `iiii/direct/list-single/hooks/1x4` | 1.056 / 0.990 | 56.9% / 204.0% | 0.991, 0.879 |
| `tttt/direct/list-single/hooks/1x4` | 0.654 / 0.697 | 39.8% / 76.9% | 0.993, 0.987 |
| `iiii/direct/list-many/logging/16x16` | 2.448 / 2.394 | 20.1% / 21.8% | 1.056, 0.981 |
| `tttt/direct/list-many/logging/16x16` | 2.006 / 2.107 | 26.2% / 30.0% | 1.152, 0.963 |
| `iiii/public/list-single/hooks/1x4` | 0.667 / 0.726 | 36.0% / 43.5% | 1.171, 1.137 |
| `tttt/public/list-single/hooks/1x4` | 0.774 / 0.737 | 59.5% / 88.8% | 1.032, 0.928 |
| `iiii/public/list-many/logging/16x16` | 2.486 / 2.485 | 24.8% / 20.8% | 1.140, 0.996 |
| `tttt/public/list-many/logging/16x16` | 2.556 / 2.520 | 22.7% / 71.9% | 1.018, 0.993 |

No metric meets the preregistered repeatable-slowdown sign threshold (6/7 slower
pairs in **each** repeat), but that is not non-regression proof. In particular,
isolated public singleton LIST was slower in 5/7 then 7/7 wall/CPU pairs and has
above-one medians in both repeats. That uncertain control cannot be averaged away
or accepted as neutral. Raw pairs and all CPU results remain preserved.

READ/UPDATE/UPSERT/DELETE and enabled/changing-log/related-scope timing,
allocation/retained heap, and database-backed latency are **not measured here**.
No helper-only timing is used. This deliberately bounded, unusable packet does not
replace original P or certify either the missing paths or an integrated result.

## Verification actually executed

All runtime checks were foreground and sequential, repository-root working
directory, with ignored `TMPDIR='<repo-root>/_tmp-arpc-05-OUTp1l6f'` confirmed by
`git check-ignore`. [verification.json](verification.json) records exact arguments,
results and log hashes.

| Check | Result |
| --- | --- |
| Baseline red test, new native/logical-filter cases only | Expected failure: both modes called `summarizeFilter` twice while disabled |
| `pnpm --filter @web-ts-toolkit/access-router... build` | Passed; only package and necessary transitive build outputs |
| Final focused Vitest command below | **704 tests / 11 files passed**, 24.02s command wall / 22.51s Vitest |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed, 33.65s, including required filtered rebuild |
| Scoped ESLint on the two production and two new test files | Passed, 3.30s |
| Public declaration comparison | All **eight `.d.ts`/`.d.mts` files byte-identical** to original baseline |
| Seal/data/privacy/link/whitespace review | See [audit](audit.json) |

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/service-lazy-logging.unit.test.ts \
  test/service-lazy-logging.integration.test.ts \
  test/logger-redaction.test.ts \
  test/filter-denial.integration.test.ts \
  test/read-list-fallback-authorization.integration.test.ts \
  test/write-output-modes.unit.test.ts \
  test/write-output-authorization.unit.test.ts \
  test/write-output-origin-ownership.unit.test.ts \
  test/write-output-populate.unit.test.ts \
  test/access-router-crud-harness.unit.test.ts \
  test/access-router-crud-work.unit.test.ts
```

The harness includes all 16 tuples and 432 individual real-worker fixture checks.
The Vite native-config-loader warning was informational. Initial new-test failures
were corrected test assumptions about frozen logger options, normalized filters,
selection counts and when delete policy is captured; final checks have no failure.

**Intentionally not run:** the full package suite (reserved for the coordinator's
final tree once), root/grouped/downstream suites, or the other owners' newly added
`no-work-output-scheduling.unit.test.ts` and
`bulk-create-metadata-filter-trace.integration.test.ts`. Neither file was edited.

## Reproduction and preservation limits

Historical runtime commands (checkout-local seals, **not runnable from archive
alone**):

```sh
TMPDIR='<repo-root>/_tmp-arpc-05-OUTp1l6f' \
  node scripts/benchmarks/access-router-crud.mjs freeze \
  _tmp-arpc-05-OUTp1l6f/candidate
TMPDIR='<repo-root>/_tmp-arpc-05-OUTp1l6f' \
  node docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-05/bounded-measure.mjs \
  _tmp-arpc-01-4d6agBQe/baseline _tmp-arpc-05-OUTp1l6f/candidate \
  _tmp-arpc-05-OUTp1l6f/timing
```

The output/seal destinations must be **fresh**, not overwritten. Replace quoted
`<repo-root>` with the checkout root. To reconstruct elsewhere, use the preserved
baseline revision/source and candidate patch, identical fixture/dependencies and
new original/candidate seals; do not transfer old calibration or identity claims.
The actual run used the identical script in ignored scratch; its archived copy is
hash-checked. All original baseline/ARPC-02 seals and earlier artifacts are left
unchanged. Generated bundles/source trees, dependencies, MongoDB files and redundant
development logs are omitted; useful raw observations, commands and final log are
preserved. The archived JSON remains sufficient to recalculate the reported
statistics using the existing maintained `summarize` function.
