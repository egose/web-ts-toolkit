# ARPC-04 — no-work scheduling investigation

Date: 2026-11-07. Related task: [ARPC-04](../../../tasks/20261105-084939-access-router-performance-cleanup.md).

## Decision

**Keep production behavior unchanged.** Skipping the empty map or synchronously
committing absent-root-hook facts changes observable scheduling. Neither shortcut
has an equivalence proof or measured real-service benefit in both modes. No
prototype is retained and no speedup, allocation saving, or passing runtime check
is claimed. A scheduling-preserving implementation might be possible, but is not
justified by this bounded investigation.

The source-backed no-change decision is delivered. A maintained characterization
suite is also written; **its execution and acceptance remain pending the exclusive
runtime coordinator**. This report does not mark upstream ARPC-01/02 complete or
change the shared task's status/dependencies.

## Scope and provenance

- Reviewed HEAD `6c3ceee` with the existing uncommitted ARPC-02 candidate: lazy
  selected-copy preparation and call-local shared finalizer preparation in
  `output-field-filter.ts`, `finalize-model-output.ts`, and `service.ts`.
  Those changes are preserved, not rewritten. References below describe that
  working tree, not a separately built frozen baseline; symbols are the durable
  anchors if line numbers move.
- Inspected the actual empty map, output-stage resolver, fact admission, stage
  lifetime, publication, selected-work accounting, LIST wiring, and focused tests.
  This is not a broader scheduler, write-pipeline, or performance review.
- No build, test, benchmark, profile, or executable probe was run. No temporary
  runtime data or generated artifact was created. There are no omitted raw timing
  observations: none were collected. Runtime reproduction requires the installed
  workspace dependencies/toolchain; this report is source evidence, not a timing
  packet or a runtime certification.
- Only this new report and
  [the new package test](../../../../packages/access-router/test/no-work-output-scheduling.unit.test.ts)
  are this investigation's changes. Production, shared task/index files, and
  historical evidence remain untouched.

## Exact current semantics

### 1. Empty orchestration is asynchronous but invokes no application work

`packages/access-router/src/helpers/concurrency.ts:9–50`
(`mapWithConcurrencyLimit`):

- For empty `items` and an ordinary normalized positive limit, `results` is a fresh
  length-zero array and `workerCount` is **one**, due to `items.length || 1`.
- The async worker's loop executes zero times. Neither `iteratee` nor `onError`
  executes. The worker acquires **no hook or persistence permit**; this helper is
  orchestration, not `SharedHookGate.run` or `scheduler.work`.
- `Promise.allSettled([already-fulfilled worker])` still schedules its settlement
  reaction; the map awaits that result before returning the array. If a caller
  attaches a completion observer and then queues a Promise reaction which queues
  another reaction, the observable order is:

  ```text
  queued:first → queued:second → map completion observer
  ```

  An immediate `return []` moves completion before the first marker. Even replacing
  the empty-worker aggregate with already-fulfilled `Promise.allSettled([])` moves
  completion ahead of the second marker. These statements follow the actual await
  chain and FIFO Promise jobs; the written test has not yet been executed.
- For nonempty input, the first iteratee failure records the original error and
  calls `onError` once, prevents further loop admission, and awaits already-started
  workers via `allSettled` before rejecting. This failure-draining behavior is not
  a candidate for modification.

`RequestConcurrencyScheduler.map` (`concurrency.ts:85–97`) delegates to this helper;
neither recursive orchestration nor an empty map holds a shared persistence permit.
Hook root/child FIFO, reentry, and draining are separately implemented at
`concurrency.ts:52–73,105–179`. No hook-gate shortcut is necessary for an empty map.

### 2. A genuinely absent root hook already avoids hook admission and hook views

`packages/access-router/src/acl/output-field-filter.ts:105–158`
(`prepareOutputDocumentStage`, `resolveOutputDocumentStage`) and
`packages/access-router/src/acl/document-grants.ts:71–106`
(`invokeDocumentPermissions`):

- The captured access selects an exact/default document hook. A function that
  exists but returns `{}` is **present**, not absent.
- With no hook and no owner, no document-hook diagnostic context is created and
  `exposeSource` is false. The resolver performs no disposable document-hook-view
  copy. Initial source admission/isolation is separate and is **not** skipped.
- The wrapper still reads request/runtime work state and output metadata, then
  calls the async `invokeDocumentPermissions` with `invoke: undefined`. That helper
  immediately returns `EMPTY_DOCUMENT_GRANTS` through a fulfilled Promise, **without
  calling `gate.run`**. There is already no absent-hook permit to eliminate.
- `getRequestWorkState` captures both concurrency limits once per request/runtime
  (`packages/access-router/src/helpers/request-work.ts:15–33`); removing that lookup
  casually can also move the capture boundary for consumers which have not yet
  initialized work state. Normal service construction already initializes it.
- Present hooks still execute, retain their receiver/arguments and admission, and
  validate results even when the final facts are empty. Application throws/rejections
  use the existing warning/empty fallback; invalid fulfilled facts remain controlled
  failures. An empty result is not evidence that the invocation can be omitted.

### 3. Empty facts still have a real resolution, accounting, and lifetime boundary

`packages/access-router/src/acl/document-stage.ts:237–318,320–343,424–443`
(`commitDocumentStageFacts`, `resolveDocumentStage`, readers, closure):

1. Resolution publishes one shared underlying result Promise **before** invoking
   the resolver and sets the stage to `resolving`. Repeated direct
   `resolveDocumentStage` calls return that Promise; an outer async resolver wrapper
   need not have the same Promise identity.
2. The absent-hook invocation returns an actual Promise. Consequently, immediately
   after `resolveOutputDocumentStage` returns, stage facts are **not ready**.
   Its queued fulfillment handler commits facts. A Promise marker queued by the
   caller after the invocation sees ready facts, while a second nested marker still
   precedes the outer resolver's completion observer.
3. Commit checks open state/generation, publication, and binding, normalizes facts,
   checks again, then installs the immutable stage view and changes state to `ready`.
   `beginDocumentStageOutput` later changes it to `building`. There is no separate
   readable `failed` state: failures poison the publication and close stages.
4. `normalizeDocumentGrants` (`document-grants.ts:21–52`) debits one work unit **before**
   its owned-singleton return. Thus absent-root resolution still consumes one unit
   when an aggregate ledger is installed, accepts the inclusive 200,000th work unit,
   and fails if the ledger is already exhausted. Metadata-field checks still apply.
   EMPTY is a frozen null-prototype singleton; sharing it does not share row stages,
   diagnostic contexts, field memo containers, or budgets.
5. Pending resolution is tracked publication work. Closing/poisoning before the
   queued commit closes stages immediately; late commit cannot revive them, and
   publication settlement drains the tracked result before clearing retained state.
   See `packages/access-router/src/acl/output-publication.ts:83–88,104–167`.

Returning EMPTY synchronously from the resolver would commit facts synchronously,
unlike the existing absent-root path. Directly assigning EMPTY would additionally
bypass the commit checks/accounting. The existing synchronous
`resolveEmptyOutputHelperStage` is explicitly restricted to captured raw-helper
provenance (`document-stage.ts:252–268`); ordinary query stages cannot reuse it.

**Embedded ownership is different:** the owning branch returns the live parent's
normalized grants synchronously, so its child facts can already be ready when the
outer async resolver returns. Those grants can be nonempty despite the lack of any
child hook invocation. Child reads/commit also authenticate the live owning stage.
Treating this branch as absent-root EMPTY would change authorization.

### 4. The finalizer's empty-candidate yield precedes observable field policy work

`packages/access-router/src/output/finalize-model-output.ts:199–249,348–434,435–498`
(`finalizeSingleDoc`):

- Source/stage admission, lineage checks, and the selected-row root charge precede
  document resolution, even with no fields or virtuals. Selected node/depth and
  aggregate work/payload limits remain enforced by the existing builders/budget.
- With no candidates, the full-source working-shell population and getter view are
  skipped, and there is no per-candidate budget charge, virtual field rule, getter
  invocation, or hook permit. Child/reference/include work still occurs where
  requested. Nevertheless the finalizer **awaits the actual empty map** before
  persisted-field rules, copies, metadata/completion, and finalization callbacks.
- The new test supplies an already-ready document stage to isolate this later yield
  from absent-hook resolution. A closure initially denies a persisted field; a
  second queued Promise marker changes it to allow. Current ordering admits the
  field and yields `queued:change → field → finalized`. Simply skipping the awaited
  empty map evaluates that same supported callback before the change and omits the
  field. Equal final array shapes/promises alone therefore do not prove equivalence.
- After completion, the finalizer still reads the live stage and checks budget and
  publication, closes the stage, then invokes `onFinalized`. An empty document cannot
  publish from an already-depleted receiving budget. Zero candidates are not a
  certificate that these checks may be skipped.
- The actual LIST row loop uses this finalizer after each row's populate handoff
  (`packages/access-router/src/services/service.ts:2121–2168`), with a distinct stage
  and receiving budget per row. ARPC-02's lazy preparation does not remove the
  empty-map or absent-hook stage boundaries discussed here.

## Maintained characterization and existing coverage

New file: `packages/access-router/test/no-work-output-scheduling.unit.test.ts`.
It contains 26 parameterized cases, **written but not run**, covering:

- Empty-map result freshness, no iteratee/error callback, and nested microtask order
  at limits 1 and 3.
- Both source modes and limits 1/3: absent-root pending/ready ordering, underlying
  Promise reuse, no gate admission, immutable EMPTY, and the inclusive accounting
  boundary; separate exhausted-ledger and close-before-commit controls.
- Both modes and limits 1/3: actual finalizer empty-candidate yield affecting a
  persisted-field callback; terminal stage closure. Separate empty-document row
  budget exhaustion controls and synchronous nonempty inherited-facts controls.
- Actual service LIST in both modes and limits 1/3, with all root hook permits held:
  absent hooks finish without admission; present hooks returning `{}` wait, then
  execute once per row. Duplicate source identities still produce two contexts.
  Barriers are released in `finally`; the check uses an event-loop boundary rather
  than elapsed-time thresholds. No Promise-count or allocation-count assertion is
  used as a claimed public contract.

Inspected existing coverage already asserts shared stage resolution and terminal
closure (`owned-authorization-stage.unit.test.ts`), invalid/missing/throwing facts
(`owned-authorization-facts.unit.test.ts`), helper-only synchronous EMPTY eligibility
(`owned-authorization-consumers.unit.test.ts`), finalizer no-getter controls and
inherited child ordering (`finalizer-preparation.unit.test.ts`), and gate FIFO,
limits 1/2, reentry and draining (`hook-concurrency.test.ts`). Actual request-owned
hook coverage also exists in `request-hook-concurrency.test.ts`. These are source
observations, not new pass results. They did not explicitly characterize the two
nested-microtask/no-work boundaries above; the new suite targets that gap.

## Pending verification / coordinator handoff

All commands below are **not run**. Working directory: repository root. Run only
after calibration/other runtime work has released exclusive use of this checkout;
do not overlap even the transitive build. Use the coordinator's fresh ignored
repository-local scratch directory, confirm it with `git check-ignore`, and export
`TMPDIR` to its absolute path before execution. Node must satisfy package `>=24`.

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/no-work-output-scheduling.unit.test.ts
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/concurrency.test.ts test/hook-concurrency.test.ts test/request-hook-concurrency.test.ts test/request-hook-ownership.test.ts test/request-persistence-concurrency.test.ts test/owned-authorization-facts.unit.test.ts test/owned-authorization-stage.unit.test.ts test/owned-authorization-consumers.unit.test.ts test/owned-authorization-publication.unit.test.ts test/finalizer-preparation.unit.test.ts test/service-output-preparation.unit.test.ts test/write-output-modes.unit.test.ts
pnpm exec eslint packages/access-router/test/no-work-output-scheduling.unit.test.ts
```

The `service-output-preparation` suite describes the current ARPC-02 candidate; if
that candidate is withdrawn, reconcile its own suite rather than attributing its
expectations to ARPC-04. No benchmark is needed to assert a no-change decision, and
no ARPC-04 gain should appear in integrated performance conclusions. Final package
acceptance remains the coordinator's existing V2/V3 responsibility.

Static delivery checks performed, separately from the pending runtime gates:

- Manual source/test/reference/privacy review; the linked task/new test and all 13
  proposed test-file paths resolve.
- `git check-ignore --no-index` for the two new files: no matches (exit 1), so
  neither destination is ignored.
- `git diff --no-index --check /dev/null <new-file>` for each new file: no whitespace
  diagnostics (exit 1 for the file addition).

There is no runtime pass count for this investigation.
