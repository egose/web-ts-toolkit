# CWO-06: retain UPDATE serialization and virtual-cleanup boundaries

Owner: SERIALIZE-06, the new sequential executor. Related task:
[CREATE/UPDATE input optimization](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md),
CWO-06 only. The coordinator alone owns task/status edits; this executor did not edit it.

**Completed bounded investigation: no production change.** A/B/C below each have a
no-change decision. No runtime candidate was created, retained, timed or withdrawn.
There is no speedup, CPU, allocation or heap benefit claim.

Filtered dependency build/source typecheck and focused V1 passed: **2,190 tests /
43 files**, including **46 new cases**. Exact layer checker and scoped lint/format
passed. All 153 production source files and 15 rebuilt dist files/eight declarations
remain CWO-01-identical at `23848c60ab172e5d421ee651c26dce41fd9410b0`. P remains
**0/40 usable cells**; no retry, gate widening or new protocol was approved or attempted.
Final integrated V2 belongs to the independent CWO-07 reviewer.

## Retained scope

Only two maintained additions and this three-file bundle are retained:

- [Serialization invariants](../../../../../packages/access-router/test/invariants/write-input-serialization-boundaries.unit.test.ts):
  42 cases for genuinely empty captured virtual catalogs, conversion/traversal
  observations and failures, post-save conversion failures, retained snapshots and
  service `afterPersist`/diff/`changes` plus `onChange` observations in both modes.
- [Private virtual-cleanup characterization](../../../../../packages/access-router/test/internal/write-input-virtual-cleanup.unit.test.ts):
  four cases for concrete dirty-path decisions, single/array/Map schema virtuals,
  Mixed fields, historical siblings, array atomic changes and a live `isModified` override.
- This README, [observations.json](observations.json) and
  [verification.json](verification.json).

Withdrawn files/source changes: **none**. Production, previous fixtures/tests/tools,
coordinator task, CWO-01–05 evidence and baseline/historical seals stayed read-only.
No agents, commits, dependency/host/configuration/public-API changes or root/grouped/
downstream changes/tests were made. These are current-layer characterizations, not
new public micro-observation promises.

## Source evidence and separate decisions

These are assessments of unchanged source, **not executed optimization prototypes**.
Source paths below are relative to `packages/access-router/`.

### A — genuinely empty captured excluded-virtual set: no change

[`stripDocumentInputVirtuals`](../../../../../packages/access-router/src/acl/model-input-admission.ts),
lines 228–245, captures both registered and schema virtual paths, then always calls
`toObject({ virtuals: false, flattenMaps: true })` and traverses its result. Default
Mongoose `id` is a schema virtual: `captureAuthorizationFieldCatalog` in
[`field-catalog.ts`](../../../../../packages/access-router/src/acl/field-catalog.ts)
(298–305, 352–365) captures native virtuals in root, child and Map scopes. An empty
registered registry alone cannot select an empty-set guard.

The new empty-catalog cases configure every fresh fixture schema with `id:false`
and remove an existing `id` virtual only when present, **before the write capture**.
They assert the actual cleanup catalog's own frozen empty registered/schema arrays,
not the fixture's earlier read-stage capture or a live registry guess.

- Ten direct ID/filter/UPSERT-update and public UPDATE/UPSERT-update cases confirm
  **eight root conversions including the fixture adapter**, seven library sites.
  A real schema `toObject` transform at cleanup `@3` changes the live value; the
  saved value is `cleanup-observed@4`, output is `cleanup-observed@8` in both modes.
- Four cleanup conversion errors preserve the original Error identity before save.
  The hydrated document is already patched, but no adapter saved state exists.
  A guard before conversion would remove that callback/error, not merely a copy.
- Eight further cases make only cleanup's schema conversion return an enumerable
  getter. Current traversal invokes it once: either its original Error rejects
  before save, or its live mutation is saved and output. A blanket guard **after**
  conversion would also change behavior. This is conversion-created data, not an
  accessor admitted from caller input.

Smallest potential future scope: a privately proved, exposure-free ordinary result
region while retaining conversion and all current callback observations. The current
conversion/materialization result supplies no such certificate; adding a second scan
or changing shared admission to manufacture one was not justified or measurable.
Both before- and after-conversion blanket empty guards are therefore rejected here.

### B — narrower modified-path cleanup: no change

The same helper keeps a logical catalog path separate from concrete numeric array
indices, flattens Maps through the native conversion, stops at a matched virtual
ancestor, and calls **current** `doc.isModified(concrete)` before `doc.set`.
[`updateOnePrepared`](../../../../../packages/access-router/src/services/service.ts)
(2684–2689) captures `context.modifiedPaths` **before** the awaited transform; the
transform can add paths or return another hydrated document. That earlier list is
not the cleanup target's dirty-state certificate.

Actual private characterization establishes:

- The leaf, explicitly dirty-container and array-`push` cases have the **same public
  `modifiedPaths()` list**, including `rows`, `profile`, `labels` and `mixed`, but
  different direct modifications and cleanup decisions. Treating listed ancestors
  as whole-container changes would erase historical siblings in the leaf case.
- A descendant leaf clears the newly written first-row badge, preserving the
  historical root, second-row badge and other virtual siblings. Explicit container
  dirtiness and array atomics retain their different native `isModified` semantics;
  an array push makes second-row virtual paths modified under the current API.
- Child schema transforms introduce `nativeAlias` in serialized single/array/Map
  scopes even though it is absent from hydrated `_doc`. Map catalog paths use `$*`;
  array catalog paths omit concrete indices. Hydrated `get`/raw storage is not the
  same traversal source. Concrete root `doc.set` calls are preserved exactly; native
  alias setters execute for array children in this fixture, not uniformly for every
  single/Map scope. No unrelated setter behavior was “fixed.”
- On an initially clean document, an `isModified` override for the first historical
  virtual introduces a later virtual write. Current serialized-order visitation
  preserves the first field and removes the second. A precomputed dirty-only visit
  would skip the first observation and change the later result.

Cleanup itself makes zero **public** `modifiedPaths()` calls in these cases; native
`isModified` can use Mongoose's internal symbol-bound implementation. Adding a new
public method observation or replacing `isModified` with ancestor membership is not
equivalent. A narrower traversal retaining full conversion, serialized observations,
exact live checks and native scopes is not ruled out, but no such closed proof or
usable measured benefit was established. No broad worker rewrite was warranted.

### C — same-boundary final/diff/change reuse: no change

`updateOnePrepared` (2648–2711) retains independently exposed original/final snapshots,
installs an overridable diff callback before `afterPersist`, invokes it after final
snapshot conversion, converts again before `this.changes`, then prepares output.
[`Base`](../../../../../packages/access-router/src/services/base.ts) (731–748) keeps
service overrides; [`Core.changes`](../../../../../packages/access-router/src/core.ts)
(586–601) reads retained original/current change data and awaits live `onChange` hooks.

The unchanged [CWO-01 lifecycle case](../../../../../packages/access-router/test/invariants/write-input-lifecycle-observations.unit.test.ts)
was rerun. Its ordinary labels remain original `@1`, pre-write source `@2`, cleanup
`@3`, adapter `@4`, final `@5`, diff `@6`, change input `@7`, output source `@8`.
Equal options are not conversion purity; retained original/final contexts and native
overrides can alter values independently, and `onChange` can mutate later live output.

New cases add the missing boundaries:

- Sixteen direct UPDATE/public UPSERT-update errors distinguish final `@5`, diff
  `@6`, change-input `@7` and output `@8`. All follow exactly one saved write;
  final/diff/change failures reject the original Error before `changes`/`onChange`.
  Output conversion failure returns controlled `bad_request`, with detail
  `write output conversion failed`, after `onChange`'s live mutation, with no data/fallback/retry/save.
- Four supported service-override cases call diff early during `afterPersist`, then
  replace the callback to mutate the exposed final snapshot before the normal diff.
  There are **nine root conversions including the adapter**, not a universal eight.
  The early diff is `@5`, final snapshot `@6`, later diff `@7`, change input `@8` and
  output `@9`. `changes` receives a distinct mutable object, delegates to real
  `onChange`, and retains/mutates it without changing original/final/output objects.
  Live `onChange` effects reach output; later live mutation does not alter published output.

Reusing an exposed final snapshot, skipping `changes` because a hook registry looks
empty, or lending any earlier conversion as output source changes these observations.
Even a newly copied final snapshot is not proof of immutable live storage or future
native purity. [`prepareQueryOutputSource`](../../../../../packages/access-router/src/acl/document-stage.ts)
(543–615) requires a fresh full conversion and privately owned ordinary write source
in **both** modes, with whole-result admission and publication-owned provenance.
Output/private-getter/target cleanup must not be replaced by a lifecycle cache.

### Actual shared consumers and unchanged guards

Canonical direct/public UPDATE and UPSERT's existing-row branch reach the same worker.
UPSERT CREATE remains a separate create worker, not a reuse of its lookup document.
[`model-subdocument-service.ts`](../../../../../packages/access-router/src/services/model-subdocument-service.ts)
(116–157, 258–327) uses the owning parent's pre-write grants and saves it, but does
**not** call canonical cleanup/final/diff/changes or inherit a seven-site count.
Existing dedicated cases, both UPSERT branches and READ/LIST/target controls were
rerun, not replaced with atomic `findOneAndUpdate`/`insertMany` shortcuts.

All-node preflight and parser/validate/prepare re-admission, discarded-source/native
return bounds, captured input policy/actor/facts, row/operation guards, hydrated hook
arguments, save middleware semantics, private getter inputs, output detachment and
publication/target lifetime remain unchanged. CWO-02–05 rejected view, normalization,
parser and path shortcuts were not retried to rescue this task.

## Actual verification and preservation

All commands ran serially from repository root; pnpm executes Vitest in
`packages/access-router`. Fresh short ignored `_tmpc06VJI9` was created with
`mktemp -d "$PWD/_tmpc06XXXX"` and accepted by `git check-ignore -v _tmpc06VJI9`.
Runtime `TMPDIR` was its absolute checkout-local path. Exact commands, selections,
results and hashes are in [verification.json](verification.json).

- Filtered `pnpm --filter @web-ts-toolkit/access-router typecheck` passed, including
  the five-package transitive build and source-only `tsc`.
- Initial two-file wiring: **22 failed / 24 passed**, because the new fixture tried
  to remove already-absent child `id` virtuals. Only that new setup was corrected;
  both captured empty-array assertions remained mandatory. Corrected **46 / 2**
  and final V1 **2,190 / 43** passed, zero reported failed/skipped/pending cases.
- Exact layers: **103 contracts / 71 invariants / 58 internal**, public graph
  unchanged at **137 files / 238 modules**. Scoped ESLint and Prettier passed after
  patch-based formatting of the new files only. A scratch diff-helper import failed
  because `diff` was not installed; standard read-only `diff -u` replaced it, without
  installing a dependency or touching old files.
- New/final observation data deep-equal corrected cases; all **46** unchanged CWO-01
  native records also replay byte-identically. Current V1 includes prior lifecycle,
  native/input/virtual/array/UPSERT, dedicated-parent, READ/LIST/target, private getter,
  publication/owner/draining and scheduling controls, plus the existing work-probe
  wiring. That wiring's disposable diagnostic/smoke bundle is not candidate timing.
- Read-only protection checked **2,508 pre-existing unignored files**, all 153 source
  files, 15 dist/eight declarations, 11 sealed tool/test identities, 14 archived
  payloads, 12 original CWO-01 payloads and its baseline seal/127 dependency packages.
  Source/fixture/bundle identities remain unchanged; no old seal/evidence was recertified.

[observations.json](observations.json) losslessly factors **46 asserted records** into
five tables and one singleton. It records maintained test hashes and original report
hashes; conversion options/order were asserted in the tests. Final JSON/link/privacy/
ignore/whitespace and identity review is recorded in `verification.json`. Actual
runtime was Node **v26.12.1**, pnpm **11.18.0**, matching root `pnpm@11.18.0`.
The existing Vite native-config warning was not suppressed.

Following the [preservation workflow](../../../README.md), only these useful reports
and actual observations are preserved. Raw terminal/Vitest reports, initial standalone
Mongoose probes, scratch protection/curation/formatting runners, broad inventories,
diagnostic bundles/seals, dependencies, builds, consumers/tarballs/databases are omitted.
Hashes identify disposable originals, not continuation prerequisites. Curated records
reconstruct, but omitted raw reports or timing do not. Historical scratch commands in
verification are **not runnable from this archive**. Reproduction uses the maintained
tests/source, normal dependencies/Mongo test prerequisites and fresh short scratch.

To replay only the new cases, replace placeholders and run serially from repository root:

```sh
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/invariants/write-input-serialization-boundaries.unit.test.ts test/internal/write-input-virtual-cleanup.unit.test.ts
TMPDIR='<repo-root>/_tmp<fresh-short-id>' pnpm --filter @web-ts-toolkit/access-router test:layers:check
```

Optional `CWO06_SERIALIZATION_REPORT`/`CWO06_CLEANUP_REPORT` destinations must be
inside that fresh absolute `TMPDIR`; they record asserted observations, not runtime
admission flags. No active task-local background command or serialization deviation remains.

## Measurement limit and independent CWO-07 handoff

[Current P calibration](../cwo-01/data/calibration-summary.json) remains **0/40 usable**,
with one fixed attempt per cell, seven alternating pairs/two repeats and the unchanged
20% cap. Warmup/noise failures block candidate retention, not this bounded investigation.
No candidate comparison, recalibration, new protocol, CPU profile, allocation/heap or
MongoDB/HTTP performance measurement was run. Conversion counts cannot establish benefit
or non-regression; no “optimization” is left for CWO-07 to certify without measurement.

The coordinator should reconcile **CWO-06 completed bounded no change** for each of
A/B/C, then assign CWO-07 to an independent final reviewer, not this executor. Review
all CWO-01–06 test/tool additions and explicit no-change limits, rerun final unfiltered
V2 (including exact layers and installed/packed/documentation consumers), and compare
installed exports/declarations. No production candidate exists; no performance claim
has been measured or approved. Prior full V2 is historical, not a CWO-06 full-suite pass.
No further step depends on this run's scratch, and no agents or CWO-07 work were started here.
