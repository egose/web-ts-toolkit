# ARPC-04 / ARPC-06 — supplemental runtime verification

Date: 2026-11-07. Task: [performance cleanup](../../../tasks/20261105-084939-access-router-performance-cleanup.md).

## Outcome and coordinator handoff

**The bounded no-production-change decisions are verified: 972 tests passed across
31 access-router files; both new test files passed scoped lint. No test repairs were
needed.** Recommend that the coordinator mark ARPC-04 and ARPC-06 **completed as
no-change investigations**, not implemented optimizations. Shared task statuses were
not edited by this executor.

This is new evidence supplementing [ARPC-04's report](arpc-04-report.md) and
[ARPC-06's report](arpc-06-report.md). Their historical **unrun** sections remain
unchanged; they are not descriptions of this later execution. Their references to
the then-present ARPC-02 candidate are historical: this run used the restored
baseline with only ARPC-05's existing lazy-logging production candidate.

- No ARPC-04/06 scheduler, fact-resolution, or metadata-query candidate is retained.
- No CPU, allocation, latency, throughput, or mode-specific performance improvement
  is claimed. Test-run durations below are runner diagnostics, not benchmarks.
- No runtime prerequisite or failing focused gate blocks these two investigations.
- Final package typecheck, the **single final full package suite**, integrated lint,
  ARPC-05 acceptance, and ARPC-07/08 work remain with the coordinator. They were not
  run or certified here. No root, grouped-workspace, or downstream tests were run.

## Runtime equivalence-rejection evidence

The new suites ran first, after the necessary filtered build, without changes to
production, tests, or fixtures. These are observed assertion outcomes on the actual
service/stage paths, not merely predicted traces or promise-count estimates.

### ARPC-04: no-work boundaries are observable

[`no-work-output-scheduling.unit.test.ts`](../../../../packages/access-router/test/no-work-output-scheduling.unit.test.ts)
contains 26 cases; all passed in the initial 50-test characterization run.

- At concurrency limits 1 and 3, the actual empty mapper returns a fresh empty
  array, invokes neither iteratee nor error callback, and completes after
  `queued:first → queued:second`.
- More importantly, the actual finalizer with **already-ready facts and no virtual
  candidates** observes a closure changed in the second queued microtask. In both
  modes and at both limits, the field rule then permits `value`, the result is
  `{ value: 'visible' }`, and the callback trace is
  `queued:change → field → finalized`. This demonstrates a callback-visible
  consequence, not just an extra Promise. Moving field evaluation ahead of this
  change is not equivalent to the observed output contract.
- Absent root hooks initially leave facts unreadable, then commit the frozen,
  null-prototype source-module EMPTY singleton before the caller's queued marker.
  Repeated direct resolution shares the underlying result Promise; no hook permit
  is acquired. The observed order is
  `queued:ready → queued:second → resolver`.
- EMPTY admission consumes the final inclusive work unit, from 199,999 to 200,000.
  Already-exhausted accounting rejects; closing a publication before queued commit
  rejects and drains pending work without reopening the stage. A depleted row
  budget cannot publish even an empty document. These reject bypassing accounting,
  lifetime, and publication checks simply because there are no grants or fields.
- Embedded child facts synchronously inherit the live parent's **nonempty** grants;
  they are not absent-root EMPTY. Closing the parent invalidates the child.
- Actual two-row LIST calls, including duplicate source identities and saturated
  request hook gates, finish without admission when hooks are absent. Present hooks
  returning `{}` wait for permits and then execute once per row. Returned contexts
  remain distinct. Thus hook presence cannot be inferred from the eventual EMPTY
  value, and the existing no-hook path already avoids hook admission.

### ARPC-06: singleton callbacks and database observation matter

[`bulk-create-metadata-filter-trace.integration.test.ts`](../../../../packages/access-router/test/bulk-create-metadata-filter-trace.integration.test.ts)
contains 24 cases; all passed in the same initial run. Both CREATE modes used real
Mongoose saves, query middleware, and MongoDB memory-server, through public
`_create` dispatch; persistence and private metadata helpers were not mocked.

- One- and three-row serial controls observed two singleton `genFilter`/override
  entries and two real `_id`-only lean visibility queries per emitted row. The
  fulfilled base scopes ran once per access, **not once per singleton query**.
  Saves preceded afterPersist callbacks, which preceded output callbacks; field
  rules preceded the row's metadata transforms, and all queries preceded decoration.
  CREATE had no onChange phase. Receivers/actor permissions, per-row grant maps, and
  post-publication detachment also passed.
- Stateful overrides read the current output hook's row state and accumulated
  field-rule side effects. Denying only the second row's update filter yielded
  four singleton filter entries but **three** DB reads and that row's placeholder
  edit map. The other row retained its grant.
- Replacing the live update base policy in the second output hook invoked the new
  callback with the original request receiver and changed only the later row's
  edit map. Repeated output IDs still caused four separate queries, distinct hook
  contexts, and differing grant maps; ID identity is not a reusable row decision.
- **Actual database mutation, without any base/override callbacks:** the second
  output hook deleted its stored row before that row's metadata reads. Both rows
  still appeared in successful CREATE output; the first had view/edit grants, the
  second had both placeholder maps, and MongoDB contained only one row afterward.
  Eager shared visibility would move this real observation before the deletion.
- Concurrency-2 gates forced two initial misses per base access; subsequent rows
  reused fulfilled scopes. Four rows still produced eight singleton filter,
  override, and real query occurrences. This is an explicitly gated schedule, not
  a universal base-callback multiplicity claim.
- Independent disabled, stripped, facts-only, and unrequested-map controls skipped
  all visibility/filter work without skipping saves/output hooks. A metadata read
  exception waited for the admitted update peer, suppressed later output and all
  decoration, propagated the original error, and left all three created rows stored.

These runtime counterexamples support rejecting cross-row coalescing under the
current contracts. They do not prove that every conceivable scheduling-preserving
optimization is impossible. No speculative production shortcut or batching mutant
was installed or timed. Residual metadata cost remains up to two visibility reads
per emitted CREATE row when maps are enabled and requested.

## Exact execution and results

Working directory for every command: repository root. `$PWD` supplies this checkout's
absolute path at runtime. Python `tempfile.mkdtemp(prefix='_tmp-arpc-046-', dir=Path.cwd())`
created fresh scratch directory `_tmp-arpc-046-t_kdm5cc`;
`git check-ignore _tmp-arpc-046-t_kdm5cc` exited 0. All runtime commands were foreground,
sequential, and used that ignored directory as TMPDIR. Each gate ran with Bash
`set -o pipefail`; all five command pipelines below exited **0**.

| Gate, in execution order | Result |
| --- | --- |
| Filtered package/transitive build | All 5 selected packages built, including declarations |
| Two new characterization suites first | 50 passed / 2 files; 6.71 s |
| Scheduling/facts/publication/mode/preparation/write checks | 662 passed / 17 files; 23.29 s |
| Metadata/filter/write checks | 260 passed / 12 files; 47.57 s |
| Lint only the two new tests | Passed, no diagnostics |

```sh
TMPDIR="$PWD/_tmp-arpc-046-t_kdm5cc" pnpm --filter @web-ts-toolkit/access-router... build 2>&1 | tee _tmp-arpc-046-t_kdm5cc/build.log

TMPDIR="$PWD/_tmp-arpc-046-t_kdm5cc" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/no-work-output-scheduling.unit.test.ts test/bulk-create-metadata-filter-trace.integration.test.ts 2>&1 | tee _tmp-arpc-046-t_kdm5cc/characterization-first.log

TMPDIR="$PWD/_tmp-arpc-046-t_kdm5cc" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/hook-concurrency.test.ts test/request-hook-concurrency.test.ts test/request-hook-ownership.test.ts test/request-persistence-concurrency.test.ts test/owned-authorization-facts.unit.test.ts test/owned-authorization-stage.unit.test.ts test/owned-authorization-consumers.unit.test.ts test/owned-authorization-publication.unit.test.ts test/owned-authorization-boundaries.unit.test.ts test/owned-authorization-many-bounds.unit.test.ts test/finalizer-preparation.unit.test.ts test/service-output-preparation.unit.test.ts test/service-list-preparation.unit.test.ts test/write-output-modes.unit.test.ts test/owned-authorization-modes.unit.test.ts test/owned-authorization-modes.integration.test.ts --reporter=default --reporter=json --outputFile="$PWD/_tmp-arpc-046-t_kdm5cc/scheduling-related.json" 2>&1 | tee _tmp-arpc-046-t_kdm5cc/scheduling-related.log

TMPDIR="$PWD/_tmp-arpc-046-t_kdm5cc" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/write-output-authorization.unit.test.ts test/write-output-origin-ownership.unit.test.ts test/write-output-source-lifetime.unit.test.ts test/write-output-populate.unit.test.ts test/permissions-posture.integration.test.ts test/include-permission-metadata.integration.test.ts test/field-permissions-placeholder.integration.test.ts test/field-permissions-opt-out.integration.test.ts test/filter-denial.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-mutations.integration.test.ts --reporter=default --reporter=json --outputFile="$PWD/_tmp-arpc-046-t_kdm5cc/metadata-related.json" 2>&1 | tee _tmp-arpc-046-t_kdm5cc/metadata-related.log

TMPDIR="$PWD/_tmp-arpc-046-t_kdm5cc" pnpm exec eslint packages/access-router/test/no-work-output-scheduling.unit.test.ts packages/access-router/test/bulk-create-metadata-filter-trace.integration.test.ts 2>&1 | tee _tmp-arpc-046-t_kdm5cc/new-test-lint.log
```

For a new execution, create and verify a **new** ignored scratch directory and
substitute it in these historical commands; the recorded scratch tree is disposable.
The existing Vite CommonJS/ESM native-config-loader warning appeared, nonblocking.
No failed or skipped/pending tests were reported. The related JSON reporters were
checked for every assertion being passed and matching the console totals.

## Provenance, ownership, and preserved evidence

- HEAD: `6c3ceee4433daf203d4625d70b0ef5c4b7009529`; Node `v26.12.1`, pnpm `11.18.0`,
  Vitest `4.1.11`; Linux `6.18.54.1-microsoft-standard-WSL2`, x86_64.
- A byte comparison of all **151 tracked access-router production files** against
  HEAD found only the pre-existing ARPC-05 differences in `src/logger-helpers.ts`
  and `src/services/service.ts`. Their inspected diff is limited to lazy debug
  logging. All ARPC-04 production modules remain exactly at HEAD; metadata helpers
  and their call sites have no candidate changes. No production/shared task edits,
  new test edits, commits, resets, other agents, or background jobs were made here.
- The withdrawn ARPC-02 candidate was not revived. The current reconciled
  `service-output-preparation.unit.test.ts` passed its 13 tests; it is not evidence
  that the historical candidate was retained.
- [Curated console excerpts](arpc-046-verification.log) preserve the build/test
  summaries and related per-file results. [Verification data](arpc-046-verification-data.json)
  preserves source/test/build/lockfile hashes, the production-diff hash, reporter
  per-file counts, and hashes of original scratch logs. Original absolute paths
  were omitted from excerpts. No credentials or private session IDs are included.
- Raw JSON assertion arrays, complete build output, dependencies, MongoDB files and
  binary, and scratch caches are deliberately not archived. This is a curated
  verification packet, not a standalone runtime installation or performance data
  set. The maintained tests, checkout/toolchain, and lockfile are needed to rerun.
- Evidence checks passed: all 27 recorded file hashes and the production patch
  hash still match; reporter per-file counts agree with the curated JSON; links
  resolve; destinations are not ignored; JSON parses; whitespace and local-path/
  private-session-ID checks are clean. Original reports and shared task bytes
  remain unchanged at their recorded hashes.

**Final scoped acceptance:** source-no-change ARPC-04 and ARPC-06 investigations
have passing runtime evidence for their rejection decisions. Whole-package and
integrated performance acceptance are neither implied nor waived.
