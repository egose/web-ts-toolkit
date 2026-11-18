# CWO-04: retain observable parser dispatch boundaries

Owner: PARSER-04, a new sequential child session. Related task:
[CREATE/UPDATE input optimization](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md),
CWO-04 only. The coordinator owns task/status; this executor did not edit it.

**Completed bounded investigation: no production change.** The whole-parser
synchronous shortcut and blanket async-entry-wrapper removal are not equivalent
at the inspected seam. A narrower primitive-only scheduler path is not ruled out,
but equivalence and actual benefit were not established. No runtime candidate was
created, retained, timed or withdrawn. No promise/work reduction, speedup or
CPU/allocation/heap benefit is claimed.

Filtered build/source typecheck and focused V1 passed: **1,510 tests / 30 files**,
including **60 new cases**. Exact layer checker and scoped maintained lint/format
passed. Production remains `23848c60ab172e5d421ee651c26dce41fd9410b0`; all 153 source
files and 15 rebuilt dist files/eight declarations match CWO-01. Current P remains
**0/40 usable cells**. Full integrated V2 belongs to CWO-07, not this no-change item.

## Retained scope

Only these maintained additions and this three-file bundle are retained:

- [Real parser/worker observations](../../../../../packages/access-router/test/internal/write-input-parser-observations.unit.test.ts):
  48 cases for shared ordinary READ/LIST capture, real direct/public CREATE/UPDATE
  live handler lookup, callback-installed marker errors and marker-free native
  promise-adoption observations, in both affected modes.
- [Private dispatch/array observations](../../../../../packages/access-router/test/internal/write-input-parser-boundaries.unit.test.ts):
  12 cases for launch/error/draining, lazy sparse element capture, native/nested-array
  identity, entry order and own output slots.
- This README, [verification.json](verification.json) and
  [observations.json](observations.json).

Withdrawn files/source changes: **none**. Existing production, public contracts,
CWO-01–03 fixtures/tests/tooling/evidence and baseline/historical seals were not edited.
These observations stay in the internal layer, not new public microtask promises.
No subagents, commits, dependencies, host/configuration changes, public flags or
root/grouped/downstream tests were introduced/run.

## Source proof and smallest-path assessment

The alternatives below are source-level assessments, **not executed candidates**.
The new records establish the current observations, not comparative speed or proof
that every conceivable narrower implementation is impossible.

1. [`iterateQuery`](../../../../../packages/access-router/src/helpers/index.ts),
   lines 88–126, captures `Object.entries` once per plain-object invocation. Its
   `async mapEntry` performs live truthy `$$sq`/`$$date` lookup, recursively dispatches
   ordinary objects and arrays, and assimilates returned leaves/handler results.
   Returning non-plain roots or having no handler still returns through the outer
   async function. Marker absence is not a purity or immediate-completion certificate.
2. **Make the entire ordinary traversal synchronous:** rejected. The unchanged
   [CWO-01 scheduling regression](../../../../../packages/access-router/test/internal/write-input-parser-scheduling.unit.test.ts)
   still sees a queued later nested sibling on concurrency-1 UPDATE, but not CREATE
   or concurrency-3 UPDATE. New direct/public READ/LIST cases similarly see the
   parser-owned sibling change at limit 1, not 3; their original filter stays detached.
   Another whole-tree eligibility scan, parser skip or caller flag was not added.
3. **Remove `async` from every entry and let the outer aggregation adopt results:**
   rejected as an unconditional rewrite. Async entry invocation currently converts a
   synchronous marker-read failure into a rejection, allowing already-scheduled sibling
   callbacks to launch. On real CREATE, a preceding date callback installs the failing
   getter after preflight, and the later date callback still runs before rejection;
   limit-1 UPDATE stops before that sibling. A bare throwing callback would interrupt
   `entries.map` instead. No unsupported accessor input was admitted to manufacture this
   real-write case: the getter is installed by a callback after existing admission.
4. **Treat native leaves as unobserved synchronous values:** rejected generally.
   Eight real marker-free writes install an inherited Date `then` getter scoped to
   the original native. The async leaf return reads it during entry launch, before
   traversing a later ordinary sibling; the adopted string and changed sibling both
   persist. Deferring native adoption until after collecting entries can move that
   observation. Normal Date/Buffer/BSON Code/Map leaves retain parser identity when
   not thenable; that identity does not authorize copying/admission reuse.
5. **Return only definite primitive leaves directly to the unscheduled entry mapper:**
   potentially narrower, **not proved or implemented**. It must preserve the current
   classifier/error/adoption and surrounding await observations without casts pretending
   primitives satisfy the existing promise-only mapper callback, a replacement scheduler
   or a second graph scan. In the already-scheduled CREATE lane, `Promise.all` itself
   still adopts each scalar; deleting the explicit wrapper alone does not establish
   fewer total promises or allocated bytes. There is no measured benefit under usable P.
6. **Return child promises directly or drop the Base handler's async wrapper:** no
   retained scope. Direct child return removes an adoption boundary whose observation
   windows were not proved equivalent. The Base callback is invoked for genuine markers,
   not ordinary fields, so removing it does not address ordinary per-field work. Its
   live `this.handleDate`/`this.handleSubQuery` lookup and original service receiver stay.
   A suspended first date handler makes a later replacement visible on limit-1 UPDATE,
   but not already-launched CREATE/concurrency-3 UPDATE.
7. **Replace array aggregation/output construction:** no proven equivalent saving.
   Array elements are captured lazily in entry-mapped limit-1 traversal and synchronously
   in already-scheduled/no-scheduler aggregation. Holes densify to own `undefined` slots;
   a nested array-valued element and non-plain roots remain native leaves. Numeric entry
   order and `Object.fromEntries` own-data-slot semantics survive an inherited setter
   installed by a handler. No in-place reuse, eager leaf copying or array bypass was added.

[`parseClientData`](../../../../../packages/access-router/src/services/base.ts),
lines 1793–1816, retains synchronous whole-input public-control admission and the
existing scheduler before parsing. CREATE calls it with `scheduled: true` per row
(`service.ts:2252–2285`); UPDATE calls it unscheduled (`2637–2646`); READ/LIST uses the
registered parser and request-owned scheduler (`1439`). Public/worker input preflight
(`public-service.ts:756–767`, `service.ts:2229,2580`), expanded-result validation/
admission and validate/prepare re-admission remain intact. CWO-03 normalized snapshots,
native returns and intermediate aliases were not repurposed as parser/admission certificates.

[`mapWithConcurrencyLimit` / `RequestConcurrencyScheduler`](../../../../../packages/access-router/src/helpers/concurrency.ts)
retain own indexed result slots, first-error selection and active-worker draining;
recursive orchestration is separate from request persistence/FIFO/reentrant hook
permits. The new error controls distinguish early `Promise.all` rejection from an
entry scheduler awaiting already-active siblings. Existing FIFO/reentry/failure and
ARPC-04 absent-hook/no-work regressions were rerun unchanged, not optimized again.

## Actual records and verification

[observations.json](observations.json) losslessly encodes the final V1's **60 asserted
records** in seven tables: 16 shared-filter captures, 16 live date-handler cases,
eight real write errors, eight ordinary native-adoption cases, four launch/drain
cases, four array/native captures and four own-slot cases. Each row reconstructs
using its table's `kind`/`columns`; source/test/report hashes identify provenance.
Corrected/new-case and final records were compared, not inferred from counts.

The unchanged CWO-01 native invariant also freshly reproduced all **46 archived
records**, including public/worker mutation rejection. The final selection additionally
passed all 16 ordinary mode tuples, 64 real write/target-READ subquery controls,
READ/LIST target authorization/hydration, genuine date markers, falsy markers,
unsupported controls before sibling dispatch, complete input/expanded budgets,
native/prototype/array behavior and request concurrency/draining. These are behavior
checks, not MongoDB/HTTP performance or a new full-suite certification.

All commands ran from repository root. Fresh short `_tmpc04XXzP` was created with
`mktemp -d "$PWD/_tmpc04XXXX"` and accepted by `git check-ignore -v _tmpc04XXzP`.
Runtime `TMPDIR` was its absolute checkout-local path. Build/typecheck/test/format/
lint/evidence commands were serialized; no background job was started or remains.
Exact commands, expanded V1 paths/results and final hygiene are in
[verification.json](verification.json).

The first new 52-case wiring run had eight READ fixture failures: the existing
deterministic adapter's scalar matcher did not match a Mongoose subdocument object.
Only the new observation's later sibling moved to the existing Mixed `payload` field;
no production matcher, baseline fixture or public behavior changed. Corrected 52-case
and subsequently expanded 60-case runs passed, then final V1 passed **1,510 / 30**.

To replay only the additions, choose fresh short ignored scratch, set its absolute
`TMPDIR`, build/typecheck the filtered closure, then run:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/internal/write-input-parser-observations.unit.test.ts test/internal/write-input-parser-boundaries.unit.test.ts
pnpm --filter @web-ts-toolkit/access-router test:layers:check
```

Optional `CWO04_PARSER_REPORT` and `CWO04_BOUNDARIES_REPORT` paths must be inside
that fresh `TMPDIR`; they write asserted observation JSON only. They are test-private
reporting switches, not runtime parser/admission flags. The maintained tests and normal
dependency/Mongo test prerequisites support fresh replay; omitted scratch runners and
raw Vitest reports are not continuation prerequisites.

## Measurement limits, preservation and CWO-05 handoff

[Current calibration](../cwo-01/data/calibration-summary.json) remains **0/40 usable**.
The fixed one attempt/cell, seven alternating pairs, two repeats and 20% noise cap
were not retried, widened or replaced. No new protocol is approved/preregistered;
no candidate timing, CPU profile, promise counter, allocated-byte/heap measurement
or new performance claim was made. Counts/profiles alone cannot authorize retention.

Before and after runtime verification, read-only comparison protected 2,498 pre-existing
unignored files, all source/dist/declarations and CWO-01's 14 archived payloads/12 recorded
scratch originals. The existing baseline seal, frozen source/fixture/bundle/dist and
127 dependency identities verified unchanged. Prior evidence/seals were neither overwritten
nor recertified. Own scratch reports/proposals/runners, raw terminal logs, dependency/
build/consumer/database trees are omitted. The curated records are reconstructable;
omitted raw Vitest reports or timing data are not. Preservation follows the
[artifact workflow](../../../README.md), using repo-relative paths/task-local names.

**Next CWO-05:** the coordinator should reconcile this as a completed bounded no-change
investigation, not a speedup or waived gate. Continue only bounded structural path/rule
preparation. Field functions still run per row in order with original actor/frozen facts
and fresh exposed allowed-field arrays. Preserve Map/Mixed/scoped virtual grammar,
protected/ID/descendant-array rules, ownership and callback/native ordering from
[CWO-03](../cwo-03/README.md) and [CWO-01's handoff](../cwo-01/handoff.md). No raw-input,
source/ID/function/freeze/caller cache or parser shortcut is authorized by this result.
P still prevents retaining runtime candidates; final integrated V2/installed consumers
remain CWO-07's responsibility.
