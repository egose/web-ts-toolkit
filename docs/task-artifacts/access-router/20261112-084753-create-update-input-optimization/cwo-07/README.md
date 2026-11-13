# CWO-07 independent review

Reviewer: **REVIEW-07**, a new independent review session, not a preceding executor.
Related [task](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md):
CWO-07 only. The coordinator alone owns task/status reconciliation.

**ACCEPT the bounded investigations, characterization tests and diagnostic tooling.**
No material retained-scope finding remains. Fresh serial source typecheck and the
**full unfiltered package V2 passed: 8,398 tests / 232 files**, with no failed,
skipped, pending or todo assertion. Scoped maintained-code lint/format checks passed.

**The measured runtime-performance objective was NOT achieved.** No production
candidate is retained; production remains `23848c60ab172e5d421ee651c26dce41fd9410b0`.
Recalculation still yields **0/40 usable calibration cells**, blocking performance
retention. This is not a speedup, allocation/heap saving, universal compatibility
certification, or proof that every narrower future design is impossible.

[verification.json](verification.json) records actual commands, working directories,
fresh results/input hashes, installed-surface identities and bounded conclusions.

## Coverage and decision reconciliation

Read the entire current task, root `AGENTS.md`, artifact/task-file workflow, current
`packages/access-router/test/README.md` and checker policy, and every CWO-01–06
README/handoff/verification/actual-data file. Reviewed all six tracked diffs, all
14 new maintained test files, the new private fixture, and diagnostic/profiling/
calibration tooling. Complete structured data was parsed and compared, not inferred
from earlier human summaries.

Source/test anchors in the following tables are relative to `packages/access-router/`.
Each decision is accepted **only for the named inspected variants**; no runtime
prototype/comparison is required when no production candidate exists.

| Item and disposition                                                            | Inspected source and maintained tests                                                                                                                                                                                                                                                                                            | Actual evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CWO-01: accept bounded baseline study**                                       | `test/access-router-crud-fixture.ts`; `test/internal/access-router-crud-harness.unit.test.ts`; `test/internal/access-router-input-work.unit.test.ts`; native/lifecycle/parser additions; three benchmark drivers                                                                                                                 | [Index](../cwo-01/README.md), [handoff](../cwo-01/handoff.md), [source](../cwo-01/data/source.json), [work](../cwo-01/data/work.json), [CPU](../cwo-01/data/cpu.json), [manifest](../cwo-01/data/manifest.json). Reconstructed 232 work, 46 native and 4,965 in-window CPU records; original V1 1,199/17 and V2 8,119/222 verified against available actual logs. Complete calibration is unusable for retention, not an incomplete bounded study.                                                                                                   |
| **CWO-02: no unconditional/absent-hook view omission**                          | `src/acl/model-input-admission.ts:363–401` (`resolveInputDocumentGrants`); `src/acl/document-stage.ts:270–318,543–615`; native BSON admission; `test/invariants/write-input-dedicated-observations.unit.test.ts`, `write-input-view-boundaries.unit.test.ts`; delegating `test/support/private/write-input-view-test-fixture.ts` | [122 records](../cwo-02/observations.json) freshly reproduced. The second inherited Code native observation/error survives in the discarded view before hydrated hook/save, including absent hooks. Dedicated parent/input/output facts, capture, ownership and draining remain separate. A privately proved exposure-free primitive graph is unproved, not impossible.                                                                                                                                                                              |
| **CWO-03: no eager fusion/branch skipping/in-place graph reuse**                | `src/acl/model-input-admission.ts:70–225,252–331`; `test/invariants/write-input-prepared-normalization.unit.test.ts`; `test/internal/write-input-prepared-construction.unit.test.ts`                                                                                                                                             | [34 records](../cwo-03/observations.json) freshly reproduced; [14 work rows](../cwo-03/work.json) match corresponding baseline counters/adapters/fingerprints. Whole normalization precedes validation/scrub; discarded/native returns are bounded; selected natives re-copy; retained intermediate shells differ from output. Deferred decisions or a closed structural region still need proof and measurement.                                                                                                                                    |
| **CWO-04: no whole-parser sync or blanket async-wrapper removal**               | `src/helpers/index.ts:88–126` (`iterateQuery`); `src/services/base.ts:1793–1816`; concurrency helper; CREATE scheduled versus UPDATE unscheduled dispatch; `test/internal/write-input-parser-{scheduling,observations,boundaries}.unit.test.ts`                                                                                  | [60 records](../cwo-04/observations.json) freshly reproduced: shared READ/LIST capture, live handlers, native adoption, lazy sparse arrays, first errors, launch/draining and own slots. Definite primitive leaf/child routes are unproved; fewer explicit wrappers do not prove fewer total promises or allocated bytes.                                                                                                                                                                                                                            |
| **CWO-05: no unconditional grammar/static-decision/admission-to-patch caching** | `src/acl/model-input-admission.ts:123–225,252–359`; `src/acl/field-catalog.ts`, `src/acl/service-authorization.ts` input/output catalog projection, `src/core-shared.ts:310–345`, `src/helpers/apply-update.ts:13–45`; structural-boundary invariants and private path tests                                                     | [17 records / 16 work rows](../cwo-05/observations.json) reconciled. Native grammar changes per repeated key/row, fresh fields/data, own-undefined versus omitted catalog slots and row-specific index expansion are real. Prepare-mutated UPDATE fields must be read at patch time. Narrower private structural indexing remains unproved; cold/small setup benefit is unmeasured.                                                                                                                                                                  |
| **CWO-06 A/B/C: three separate no-change decisions**                            | `src/acl/model-input-admission.ts:228–245`; `src/services/service.ts:2648–2711`; `Base` service hooks and `Core.changes`; serialization-boundary invariants and private cleanup tests                                                                                                                                            | [46 records](../cwo-06/observations.json) freshly reproduced. **A:** genuinely empty captured virtual arrays still have conversion/traversal effects/errors, before/after-conversion blanket guards fail equivalence. **B:** direct/native dirty decisions and serialized/live checks are not ancestor membership. **C:** exposed final/diff/change/output conversions and retained overrides are distinct. Eight versus nine fixture root conversions defeats a universal seven-site count. Still-narrower exposure-free designs are not ruled out. |

The original normalization-before-validation, public-to-worker Date mutation,
native/lifecycle and absent-versus-present-empty hook controls remain intact.
Earlier rejected shortcuts were not reintroduced to rescue another item.

## Shared contract gates

| Task gate                             | Review result and concrete anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — modes/defaults/inheritance**    | Unchanged source/package metadata and fresh `test/invariants/write-output-modes.unit.test.ts`, `test/contracts/arts04-modes.integration.test.ts` and CRUD controls. `src/acl/authorization-modes.ts`, `src/acl/service-authorization.ts` (`modeFor`, `deriveWriteOutputAuthorization`) keep canonical input isolated and separately select post-write output mode. No broader input trust.                                                                                                   |
| **2 — authority/actor/facts/hooks**   | Canonical/dedicated worker inspection and CWO-02 native/view/in-flight controls preserve hydrated receiver/argument, captured definition/dependencies/actor, literal detached frozen facts and separate pre/post-write resolution. CREATE has no invented existing-document facts. Real public `test/contracts/service-authorization-input.integration.test.ts` remains unchanged.                                                                                                           |
| **3 — all-node limits/re-admission**  | Public admission and CREATE/UPDATE preflight remain; CWO-01 native mutation and CWO-03 discarded dense/sparse/Map/native-return/prepare cases reject before persistence. Existing complexity, nested-update, parser/target and input contracts passed. No raw-identity/freeze/normalization-return certificate, branch skipping or budget waiver.                                                                                                                                            |
| **4 — ownership/lifetime/provenance** | `src/acl/document-stage.ts` generation checks/resource cleanup, CWO-02 closed-before-binding/native-read and drained late-commit cases, CWO-03 aliases, CWO-05 own catalog slots/constructor brand, and existing write-origin/source-lifetime invariants. No new cache/token/exposed sharing, work refunds, fixed-lifetime revival or inherited provenance.                                                                                                                                  |
| **5 — observations/scheduling**       | CWO-04 real/private lanes and unchanged concurrency/FIFO/reentry/failure/no-work tests preserve current observations. Present-empty callbacks remain distinct from absence. Mechanism/scheduling/count assertions stay in `internal/`; safety/authority/lifetime assertions stay below contracts. They are not new public microtask or copy-count promises.                                                                                                                                  |
| **6 — lifecycle/persistence/output**  | Unchanged `createPrepared`, `updateOnePrepared`, UPSERT branches and dedicated parent worker; CWO-06 plus prior lifecycle/native/output tests. Validation/prepare/transform/save, snapshots/diff/changes/onChange, private getters/targets, mandatory detached write sources in both modes and nontransactional post-save failures are preserved. No extra read/save, atomic-write substitution or lookup/snapshot reuse. Dedicated writes do not inherit canonical seven-site choreography. |
| **7 — installed API/types**           | All 153 source files and 15 rebuilt dist files, including all eight declarations, byte-match CWO-01. Root, `/advanced`, `/processors` CJS/ESM metadata remains 46/48/6 exports respectively; root default is callable. Export-map/package metadata is HEAD-identical. Fresh installed/packed/documentation positive and negative consumers passed. This-study declaration byte/chunk identity is evidence, not a permanent public promise.                                                   |

The exhaustive checker found the exact disjoint union **103 contracts / 71
invariants / 58 internal**, with unchanged public graph **137 files / 238 modules**.
Public contracts/fixtures were not rewritten or moved. Manual closure/assertion
review accompanies the checker; a passing static guard is not a sandbox or universal
semantic proof. New tests/tools add no cross-package build/read access requiring a
`scripts/test-groups.mjs` override; its existing read-only CLI fixture rule remains.

## Tooling and measurement audit

- Independently compared original catalog declarations against HEAD: all **432**
  original CRUD cases and **18** pre-existing v2 panels remain exact; default `core`
  remains **10 panels / 40 cells**. Optional input cases remain **180**, with **64**
  mixed target-READ/write controls. Target mode is relevant; no subquery timing claim.
- Compared the complete v2 protocol against HEAD: warmup/windows, seven alternating
  pairs/two repeats, fixed pilot counts, slowdown/sign rules and **20%** cap unchanged.
  Finite worker/packet budgets and one preregistered attempt/cell remain; no post-hoc
  cell dropping, retries, averaging away controls or new protocol.
- `scripts/benchmarks/access-router-input-work.mjs` instruments esbuild onLoad
  strings only. **45 exact anchors / 11 modules** and transformed hashes match the
  archived manifest. Missing/duplicate anchors or modules fail closed; replacement
  callbacks retain literal `$$` markers. Output/state comparison uses real workers.
  No source writes, production imports of the probe or instrumentation in timing.
- Frozen timing uses the original source-selected `worker.cjs`; registration,
  seed/reset/request construction/checks are outside operation timing, while actual
  input construction, CREATE/save, authorization/lifecycle/output remain inside.
  Diagnostic bundles/counters and CPU sampling are separate. Visits/constructions/
  conversions/PROMISE resources are **not allocated bytes, heap or benefit**;
  synchronous owner attribution can be `other`, the later preflight validator walk
  is uninstrumented, and selected construction excludes the `allowedData` root.
- CPU clipping was independently recalculated from available original profiles/
  invocation windows, matching all **4,965** curated rows. Timer bookkeeping,
  inclusive synchronous stack attribution, bundled positions, native/async/engine
  ambiguity, sampling overhead, GC and unattributed work remain limitations—not
  exclusive CPU shares, allocation measurements or P acceptance comparisons.

[Archived calibration](../cwo-01/data/calibration-summary.json) was recomputed using
maintained `panelSummary` from both complete raw/plan packets, with matching frozen
source/fixture/tool/runtime/dependency identities:

| Packet                                      | Cells / usable | Workers | Measured operations | Failed measured warmups | Unsettled pilot cells |
| ------------------------------------------- | -------------- | ------- | ------------------- | ----------------------- | --------------------- |
| [Writes](../cwo-01/data/writes/report.json) | 20 / 0         | 140     | 177,408             | 183                     | 6                     |
| [Inputs](../cwo-01/data/inputs/report.json) | 20 / 0         | 140     | 155,904             | 171                     | 10                    |
| Total                                       | **40 / 0**     | **280** | **333,312**         | **354**                 | **16**                |

All 3,360 measured batches remain, with zero short windows. Four cells meet both
noise caps but still fail warmup quality. Wide-fixture history limits (56 failed
write warmups with fewer than four blocks; 85 with fewer than five) are not simply
explained away as host noise. No new noise campaign or CPU profiling was run.
Required full-suite smoke/profile-mode wiring used only fresh disposable seals,
without `--cpu-prof`; it is not a calibration retry or performance evidence.

No candidate comparison/non-regression packet is applicable: **no runtime candidate
exists**. Bounded baseline/no-change studies can complete, but the measured runtime
performance goal remains unachieved. Future retention needs an authorized equivalent
design and new matching usable calibration; no gate is waived here.

## Fresh verification and preservation

All commands ran from repository root; package scripts run in
`packages/access-router`. Fresh short `_tmp07.MKd0` was confirmed ignored with
`git check-ignore`; its **actual absolute path** was `TMPDIR` for every runtime/
build/type/test/lint/format command. ESLint ignore queries, source-only tsc include,
explicit tsup entries, package test globs, layer walker and workspace globs establish
scratch exclusion. Every command was serialized, including formatting and audits;
the background full suite completed before subsequent commands or handoff.

Executed, in order:

1. Read-only identity/protection/reconstruction audit before builds.
2. `pnpm --filter @web-ts-toolkit/access-router typecheck`: passed; five-package
   filtered build then source-only tsc.
3. `pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile='<repo-root>/_tmp07.MKd0/v2-results.json'`:
   **8,398/232 passed**, 2,385.69 seconds, no file selectors. JSON's 818 describe
   suites are not the file count. Installed checks include documentation **93**,
   packed **13**, strict consumers **49**, tree-shaking **3** cases, all passed.
4. Explicit **21** affected code files through ESLint (including the existing
   evidence generator), then those files plus two benchmark guides through Prettier:
   passed. Compact/byte-preserved packets were never formatter inputs.
5. `git diff --check`, post-build full seal/identity/protection, backward-ID/protocol/
   anchor and actual-result reconciliation: passed. All **37** preceding artifact
   files and **2,727** protected pre-existing files remain byte-identical. Fresh
   native/CWO-02–06 records reproduce archived values: **46/122/34/60/17/46**.
6. This new report/JSON formatting, reference/anchor/JSON/privacy/ignore/whitespace
   review and final protected-byte/scope/process check: recorded in verification.

An initial review-only import of frozen provenance dist could not resolve a
workspace link; its documented non-relocatable status is not a product blocker.
Verification used sealed byte/dependency equality plus actual current imports.
A scratch-only protocol extraction initially referenced an exported variable as a
local; corrected audit wiring passed. No maintained file/test expectation changed.
Actual pnpm **11.18.0** matches current/HEAD root `packageManager` and every seal;
the different `.tool-versions` **11.24.0** annotation correction remains historical,
with original data untouched. First PATHS-05's reported encrypted-context failure
has no delivered outcome; PATHS-05R owns the actual CWO-05 records. CWO-03's documented
read-only formatter/typecheck overlap and serial repeat are retained history, not
this review's execution or a waived gate. Existing Vite warnings were not suppressed.

Only this README and small curated verification JSON are preserved. No duplicate
packets, dependency/build/consumer/tarball/database trees, fresh raw logs/reports,
broad protection inventory or disposable audit scripts are copied. Omitted fresh
data is identified by hashes, not a claimed self-contained replay bundle. Existing
archived observations/P packets remain the evidence for reconstruction; fresh
behavioral replay needs maintained tests/tools and normal dependencies/Mongo plus
the existing prebuilt read-only CLI fixture, with a new short ignored TMPDIR.
Old `_tmpcwo.AvIq/b` remained read-only; no old seal was frozen/rebuilt/overwritten.

No task/status edit, subagent, product/test/tool/doc fix, commit, workspace dependency
or host change, root/grouped/downstream test, release operation or new performance
claim was made. Narrower future scopes remain **unproved/unmeasured, not impossible**.
Coordinator reconciliation—not this report—determines task status.
