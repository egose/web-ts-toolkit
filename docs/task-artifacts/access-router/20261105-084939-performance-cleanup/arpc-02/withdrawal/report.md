# ARPC-02 final disposition: withdraw the unaccepted production candidate

## Outcome

**The bounded implementation/measurement attempt is finished. No production
optimization is retained.** Only this task's edits to
`packages/access-router/src/acl/output-field-filter.ts`,
`packages/access-router/src/output/finalize-model-output.ts`, and
`packages/access-router/src/services/service.ts` were withdrawn using a patch.
Before withdrawal, their complete production diff was verified to be exactly the
owned candidate diff `99f8912173d021cf49bf091962d4b80732e03bafef0943757d8200b3bf93a317`.
No unrelated work, task status, baseline seal or historical evidence was reverted.

The current **151 source files, 15 compiled distribution files, source-selected
worker bundle and dependency identities match the original baseline exactly**.
The production diff is empty and there are no untracked production source files.
See [verified retained state](retained-state.json).

The original ARPC-02 improvement acceptance criteria are **not met**. The
coordinator should record the improvement as deferred/rejected with this no-change
disposition and explicitly reconcile dependent task scope; this is not a claim
that a both-mode improvement was delivered. The coordinator-owned task file was
not edited. No executor work remains queued for ARPC-02.

## Why work reduction does not suffice

The candidate genuinely reduced observed preparation work in both modes and
entries: at 16 rows/16 generated fields, finalizer preparation went from 16 to 1
and selected-copy policy construction from 272 to 1. Actual value copies and
meaningful application traces did not change. The candidate also passed its final
guard checks: **1,376 tests / 30 files**, package typecheck, scoped lint and 432
sealed diagnostic cells. Those results describe the preserved candidate source,
not a performance result or the current withdrawn tree.

However, there was **no measured allocated-byte or retained-heap improvement**.
Preparation counters and source-level removal of arrays/closures are not an
allocation measurement. They cannot establish the required CPU/allocation/latency
benefit in both modes, and cannot establish singleton/other-path non-regression.
The retained cache also added content/binding checks and longer-lived prepared
inputs; their costs cannot simply be assumed free.

The one bounded focused calibration already completed, rather than remaining
queued: exit 0 after **1,317.30s**, **140/140 timing workers**, **16 cases**,
**seven pairs in each of two repeats**, **155,904 measured invocations**. It
produced a genuine report but **0/16 usable cells**. All 16 cases had unsettled
warmups (154/448 worker/case records); wall noise exceeded the fixed 20% cap in
11 cells and CPU noise in 15. Zero windows were short. Even isolated direct bulk
CREATE, whose noise bounds were under the cap, had 22/28 unsettled warmups and
is not usable.

There are therefore **no usable existing focused panels for a v2 candidate
comparison**. No additional protocol, retry, tolerance increase, selective
discarding, allocator probe or acceptance-grade candidate comparison was run.
Tiny v1 smoke wiring samples are not substituted for paired performance evidence.
The exact archived [noise packet](../noise/report.json),
[raw workers](../noise/raw.json), [noise summary](../noise-summary.json),
[copy/hash manifest](../archive-manifest.json), and
[historical candidate report](../report.md) remain preserved. The report was
recalculated from raw workers with the unchanged maintained `panelSummary`.

Specialized related/native/embedded, public singleton and other required control
timing, failure/reentry/limits, database latency, and allocation/retained-heap
evidence remain absent for corresponding performance claims. No speedup,
non-regression or allocated-byte improvement is claimed. Withdrawal is an evidence
decision, not a newly demonstrated authorization defect or repeatable candidate
slowdown. Restoring byte-identical production avoids retaining an unproven trade.

## Safety tests and designs preserved

- The full final candidate production patch remains at
  [`../candidate-final.patch`](../candidate-final.patch); its source/bundle/fixture/
  dependency seals remain in [candidate provenance](../provenance.json).
- The exact **13-test candidate regression file**, including prepared-copy-specific
  setup scaling and cache binding/mutation guards, is preserved as
  [candidate-safety-tests.patch](candidate-safety-tests.patch), with its original
  source and patch hashes in [before-withdrawal.json](before-withdrawal.json).
  It adds the file to reviewed revision `6c3ceee`, where the file was absent.
  Reconcile explicitly with the retained version before replaying it on today's
  tree; do not overwrite that version accidentally.
- `packages/access-router/test/service-output-preparation.unit.test.ts` retains
  **13 runnable contract/characterization tests**. They exercise real LIST/bulk
  CREATE and READ/UPDATE controls, distinct row contexts/facts, negative/protected
  selection, changed plan/binding handling before selection reads, async selection
  mutation, prototype-input rejection, callable invocation/attached-selector
  lookup, in-flight hook capture, next-call option replacement and empty shapes.
  They now call the baseline copy seam and record actual preparation counts rather
  than referring to a withdrawn private API or requiring a nonexistent speedup.
- The [candidate design](../design.md) and current document-hook ownership proof
  are kept for a future bounded attempt. Virtual-name/native inspection was never
  hoisted across ordinary service rows. No source mode contract was relaxed.

The new retained [32 real-service work records](work.json) match original ARPC-01
preparation/copy counts and application counts/ordered traces. They are not
mislabelled as the earlier optimized work records at `../work.json`.

## Final retained-tree verification (actually executed)

Working directory: repository root. Fresh runtime scratch:
`TMPDIR='<repo-root>/_tmp-arpc-02-withdraw-PW5VIYmi'`, created with an explicit
repository-local template and confirmed ignored with `git check-ignore`.
All build/test/lint/seal executions were sequential. Exact argument lists, log
hashes, results and scratch environment are in [verification.json](verification.json).

| Command | Actual result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed, 33.30s; includes necessary package/transitive filtered build |
| Focused Vitest command below | **537 tests / 6 files passed**, 12.01s command wall / 10.47s Vitest |
| `pnpm exec eslint packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/services/service.ts packages/access-router/test/service-output-preparation.unit.test.ts` | Passed, 3.40s |
| `node scripts/benchmarks/access-router-crud.mjs freeze _tmp-arpc-02-withdraw-PW5VIYmi/retained-baseline` | Passed, 2.45s; exact original source/bundle/dist identities |

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/service-output-preparation.unit.test.ts \
  test/service-list-preparation.unit.test.ts \
  test/finalizer-preparation.unit.test.ts \
  test/access-router-crud-work.unit.test.ts \
  test/access-router-crud-harness.unit.test.ts \
  test/write-output-modes.unit.test.ts
```

The work-report execution additionally set
`ARPC_OUTPUT_PREPARATION_REPORT='<repo-root>/_tmp-arpc-02-withdraw-PW5VIYmi/work.json'`.
The Vite native-config-loader warning was informational. There were no failing or
interrupted checks in this continuation and no quota blocker.

**Not run:** the full package suite (reserved for the final integrated tree),
root/grouped/downstream suites, or the other owners' newly added
`no-work-output-scheduling.unit.test.ts` and
`bulk-create-metadata-filter-trace.integration.test.ts`. The two files, shared task
and existing benchmark README were hash-checked unchanged before and after this
work. Their later exclusive runner is outside this execution; no pass is claimed.

## Operational handoff and archive limits

- Original baseline: `_tmp-arpc-01-4d6agBQe/baseline/` — unchanged and reverified.
- Withdrawn, guarded candidate: `_tmp-arpc-02-ZaZbr4lD/candidate-final/` — unchanged
  and reverified; source `5223b96f9cfa7a9c70a39730aa94b06d0e12b427eca0eda814e63d517239a082`.
- Retained tree seal: `_tmp-arpc-02-withdraw-PW5VIYmi/retained-baseline/` — source
  `f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480`, bundle
  `c3eaa928d506f8023b92061db8244e20549ea9b91c17faefd6b73767a7f4125c`.
- Production source at handoff is revision `6c3ceee` with **no ARPC-02 production
  diff**, not the candidate source described in earlier candidate-era audits.

Seals are checkout-local and must not be overwritten. Full generated source/
dependency/bundle trees, MongoDB data and full logs are intentionally not copied
into the durable bundle. Useful designs, candidate patches, original safety tests,
one complete raw noise packet, exact command/log hashes, retained work records and
source identities are preserved. This is not a relocatable installed runtime.
The [final withdrawal audit](audit.json) checks original raw/archive hashes,
structured files, links, privacy-sensitive paths/identifiers, source/test hashes,
unchanged unrelated files, ignore status and whitespace. Prior candidate audits
are historical, not rewritten to imply they inspected the withdrawn tree.
