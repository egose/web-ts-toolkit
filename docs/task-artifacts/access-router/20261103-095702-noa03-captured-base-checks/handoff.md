# NOA-03 captured base checks and selector boundaries

Related contract: [NOA-03](../../../tasks/20261103-082614-access-router-nested-operation-access.md).
Dependencies: [accepted NOA-01 handoff](../20261103-noa01-nested-rules/handoff.md)
and [accepted NOA-02 handoff](../20261103-092402-noa02-entry-contexts/handoff.md).

This is the third implementer's scoped handoff, not independent review or release
approval. Work used the existing shared worktree sequentially after NOA-02. No
agents, commits, pushes, task-status edits, documentation migration, or changes to
earlier artifacts were made. Existing work was retained.

## Outcome

- All five demonstrated NOA-02 transitional failures now pass with their assertions
  intact: both READ-to-LIST retries and create/single/bulk subdocument visibility.
- Every located live/captured base-operation guard consumer now selects one scalar
  or operation `default`, with applicable existing outer fallback. No secondary
  check selects `basic`, `advanced`, or `root`, and no selected context is ambient.
- Captured model policy retains raw same-owner operation defaults even when the
  stored parent is defined. Exact field specificity uses those separate snapshots;
  no independent runtime `read.default` lookup behind model `read: {}`, recursive
  merge, cross-runtime lookup, or post-await live reread was added.
- Reserved nested member selectors and retired names reject at the shared populate
  boundary, including forwarded include/subquery accesses and subdocument slots.
  Wire selectors remain list/read. Unrelated trusted custom accesses still work.
- Final serialized checks: fresh transitive build, source typecheck, **863/863**
  operation tests and **2,587/2,587** target/capture tests. **60 files, 3,450 passed,
  zero failed/skipped** in these final scoped runs. Full package/repository gates
  remain later tasks.

## Caller inventory and implementation

Paths below are relative to `packages/access-router/`. Inventory used source-wide
searches for operationAccess reads, `isAllowed`, `canActivate`,
`evaluateRouteGuard`, captured readers, and captured-guard producers/consumers.

- `src/core.ts:Core.isAllowed`: existing NOA-02 live raw model/default readers omit
  context. Captured dispatch still consumes `consumeCapturedModelOperationGuard`
  first and evaluates its scalar with captured permissions.
- `src/core-data.ts:DataCore.isAllowed`: existing NOA-02 live raw data readers omit
  context; no model defaults. No NOA-03 edit needed.
- `src/core.ts:Core.genPopulate`: selects target base guard from captured
  configuration before supplying the existing `withCapturedModelOperationGuard` →
  `isAllowed` seam. Source/target field, row, actor, model-binding and Q flag checks
  remain.
- `src/services/service.ts:genExecutionPopulate`: selects captured target base
  guard; evaluates with child authorization permissions. Existing Q flag and
  explicit related-operation grant bypasses remain.
- `src/acl/related-execution.ts:captureRelatedTargets`: captures selected
  list/read/count scalar as `operationGuard` synchronously with the actual target
  and its effective intent.
- `src/services/base.ts:getAuthorizedTargetService`: existing legacy/correlated
  include and subquery dispatch consumes that scalar through the captured seam.
  Without retained target configuration, the existing live `Core.isAllowed` path
  remains. No new service entry guard. No edit needed.
- `src/services/public-service.ts:captureListFallbackAdmission`: selects captured
  base list scalar before READ awaits/identifier hooks; conditional retry retains
  the guard, permissions and existing seam.
- `src/acl/subdocument-authorization.ts:subdocumentGateAllowed`: shared captured
  selector handles parent/child mutation gates and parent-read/child-read/create-list
  visibility. Defined fields stay closed; absent fields may use top-level policy.
  Explicit operation grants remain bypasses.
- `src/acl/virtual-populate-dependencies.ts:captureVirtualPopulateDependencies`:
  selects terminal private base read scalar using NOA-01 raw readers over effective
  target options and same-owner/proposed defaults, synchronously before execution.
  No generic operation fallback getter.
- `src/acl/virtual-populate-execution.ts:targetReadAllowed`: evaluates only captured
  base read with owned batch actor; D flag, controlled unavailable behavior and
  operation-error handling remain.
- `src/acl/virtual-populate-execution.ts:readPolicy`: batch compatibility compares
  selected context-free scalar rather than raw transport-rule objects.
  Runtime/actual-model/schema/row-policy/flag comparisons remain.

Other scalar evaluators are not operation-policy lookups: `Core.canActivate`,
`DataCore.canActivate`, `src/acl/request-context.ts:canActivateRequest`, and the root
router's independent outer batch guard retain explicit scalar guard semantics.
Generated direct/root entry checks remain NOA-02's explicit-context path. Generic
captured option reads in row/filter resolution remain non-operation readers.

### Shared helper and small integration adjustment

- `src/acl/model-output-planning.ts:selectCapturedOperationAccessGuard` is an internal
  adapter over NOA-01 `createOperationAccessReaders` / `selectOperationAccessGuard`,
  with no context and `subdocuments: true`. It reads only owned captured containers.
- `captureModelAuthorizationConfiguration` always captures `operationAccessDefaults`
  separately. The old generic `getCapturedAuthorizationOption` retains its previous
  whole-parent-undefined default behavior, preventing that generic reader from
  accidentally acquiring recursive operation-default inheritance.
- `src/acl/populate-access.ts:assertPopulateAccess` reuses NOA-01 diagnostic helpers
  and also rejects retired names in a `subs.<field>.<operation>` slot. Neither this
  denylist nor nested member paths are aliases, wire operations or privileges.
- One narrow adjustment outside the primary ACL files: in `src/runtime.ts`, put
  the existing proxy-safe `assertAuthorizationModeOptions` before the new operation
  option inspection at five bulk/restore admission sites. The broad affected suite
  demonstrated proxy traps running first after NOA-01. Reordering restores the
  existing no-trap/atomic TypeError behavior without new validation machinery,
  changing valid rules, or weakening any test. Coordinator should review this
  integration adjustment with the captured changes.

No public exports, field-permission grammar, request-schema names, method names,
service trust, wire operations, hooks' base operation names or upsert branch entry
requirements were changed.

## Maintained tests and migration ledger

- New `test/nested-operation-access-capture.contract.test.ts`: **18** tests cover
  actual frozen captures, model `read: {}`, outer versus exact runtime defaults,
  closed/absent/scalar fields, runtime field specificity, no live reads, one-shot
  captured seam consumption, hook actor, permission replacement, fresh gates and
  same-name/same-model cross-runtime isolation.
- `test/operation-access-boundaries.integration.test.ts`: migrated all prior **142**
  cases to nested rules; **269** now pass. Added **127** cases: 70 shared reserved
  selectors, 21 trusted-default selector cases, 24 forwarded include/subquery
  selector cases, 8 extra hydration visibility cases and 4 paused-write cases.
  Retained target list/read/count admission, root/direct distinctions, both advanced
  reads, row/field masks, custom accesses/document grants, validation before target
  work, operational errors, READ retry, trusted services across HTTP methods and
  both upsert branches. Root tests now assert independent root rules explicitly.
- `test/populate-operation-policy.dependencies.test.ts`: all **320** cases retained;
  base-denied nested read has granted transport members across all four Q/D flag
  combinations and both hydration modes. The existing direct/root denial test sets
  `read.root: false` explicitly; its unauthorized/no-I/O assertions remain intact.
- `test/populate-operation-policy.binding.test.ts`: all **136** actual-model binding
  cases retained, now with nested operation defaults and denied entry members.
- `test/virtuals-populate-dependencies.operation-guards.test.ts`: **228** cases;
  migrated old flat guard traps, added eight nested guard/default/malformed cases
  across six execution modes plus nested hook placement. Paused model/runtime
  default updates now use nested defaults, retaining fresh-call observations.
- `test/virtuals-populate-dependencies.capture-boundaries.review.test.ts`: all **14**
  cases retained; include hooks use nested defaults, and suspended retry admission
  uses explicitly undefined model policy plus owned nested runtime defaults.
- `test/virtuals-populate-dependencies.fallback.test.ts`: **170** cases; migrated its
  flat fixture and added four nested fallback rules across both readers/hydration
  modes. Existing actor, reentrant, concurrent, source/private capture and retry
  assertions remain.
- `test/virtuals-populate-dependencies.config.test.ts`: **86** cases; its raw generic
  operation-object comparison now asserts the required selected scalar explicitly,
  including two new nested cases. Row-hook capture comparisons remain unchanged.

The existing 68 model and 75 data/subdocument route tests were not edited by NOA-03;
all pass, including the five previous failures. No assertions were skipped or made
expected failures.

## Exact verification

Working directory: repository root. `_tmp-noa03-6Nw2doxu` was created fresh with
`mktemp -d -p "$PWD" _tmp-noa03-XXXXXXXX` and confirmed ignored with
`git check-ignore _tmp-noa03-6Nw2doxu`. Replace `<repo-root>` in the commands below
with the checkout path. All build/test invocations were serialized, with absolute
repository-local TMPDIR. No source edits followed the final build.

```sh
TMPDIR='<repo-root>/_tmp-noa03-6Nw2doxu' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa03-6Nw2doxu' pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
TMPDIR='<repo-root>/_tmp-noa03-6Nw2doxu' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/nested-operation-access-resolution.contract.test.ts test/nested-operation-access-admission.contract.test.ts test/nested-operation-access-consumer-types.test.ts test/nested-operation-access-entries.integration.test.ts test/nested-operation-access-capture.contract.test.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa03-6Nw2doxu/final-matrices.json'
TMPDIR='<repo-root>/_tmp-noa03-6Nw2doxu' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy test/private-populate-read-policy test/virtuals-populate-dependencies test/owned-authorization test/model-authorization-capture.unit.test.ts test/captured-catalog-preparation.unit.test.ts test/service-execution-capture.unit.test.ts test/related-execution.binding.unit.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-related.integration.test.ts test/correlated-includes.execution.test.ts test/virtuals-populate-include.integration.test.ts --exclude test/owned-authorization-types.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa03-6Nw2doxu/final-target-capture.json'
```

Results:

- Build: passed, five transitive packages, CJS/ESM/declarations.
- Direct source typecheck: passed.
- Operation matrix: **10 files, 863 passed**. Resolution 180, admission 54, nested
  declaration consumers 3, new entries 100, new capture 18, baseline 28, variants
  68, model routes 68, data/subdocument routes 75, boundaries 269.
- Affected target/capture filters select **50 files, 2,587 passed**, including every
  populate-operation-policy/private-populate-read-policy/virtuals-populate-dependencies
  runtime suite, owned-authorization runtime/helper suites and the explicit extra
  related/capture/integration files above. No failed/skipped tests in either final run.
- Targeted ESLint and Prettier passed on all 18 changed source/test files using the
  following exact commands. Whitespace, artifact formatting, links, ignore status
  and local-path/private-identifier checks are covered by final artifact review.
- Vitest's existing config-loader future-compatibility warning is non-fatal.

```sh
TMPDIR='<repo-root>/_tmp-noa03-6Nw2doxu' pnpm exec eslint packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/subdocument-authorization.ts packages/access-router/src/acl/populate-access.ts packages/access-router/src/core.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/runtime.ts packages/access-router/test/operation-access-boundaries.integration.test.ts packages/access-router/test/nested-operation-access-capture.contract.test.ts packages/access-router/test/populate-operation-policy.dependencies.test.ts packages/access-router/test/populate-operation-policy.binding.test.ts packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts packages/access-router/test/virtuals-populate-dependencies.capture-boundaries.review.test.ts packages/access-router/test/virtuals-populate-dependencies.fallback.test.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts
TMPDIR='<repo-root>/_tmp-noa03-6Nw2doxu' pnpm exec prettier --check packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/subdocument-authorization.ts packages/access-router/src/acl/populate-access.ts packages/access-router/src/core.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/acl/virtual-populate-dependencies.ts packages/access-router/src/acl/virtual-populate-execution.ts packages/access-router/src/runtime.ts packages/access-router/test/operation-access-boundaries.integration.test.ts packages/access-router/test/nested-operation-access-capture.contract.test.ts packages/access-router/test/populate-operation-policy.dependencies.test.ts packages/access-router/test/populate-operation-policy.binding.test.ts packages/access-router/test/virtuals-populate-dependencies.operation-guards.test.ts packages/access-router/test/virtuals-populate-dependencies.capture-boundaries.review.test.ts packages/access-router/test/virtuals-populate-dependencies.fallback.test.ts packages/access-router/test/virtuals-populate-dependencies.config.test.ts
```

### Failure history, exclusion and remaining gates

Earlier checks are not claimed passing baselines:

1. First migrated matrices: **386 passed** across three files, including the five
   NOA-02 failures restored by captured scalar selection.
2. Expanded six-file run: **959 passed / 8 failed**. All eight were the dependency
   fixture's formerly implicit root denial after the fixture deliberately granted
   `read.root`. Explicit independent root denial restored all assertions.
3. First broader run, without the exclusion above: **51 files, 2,582 passed /
   5 failed**. One private configuration assertion expected an unevaluable object;
   two server-mode tests exposed the admission-order regression described above.
   All three now pass in the final scoped run.
4. The other **two** failures are intentionally not fixed by this task:
   `test/owned-authorization-types.test.ts`, installed `.mts` and `.cts` consumers.
   Their positive fixture `test/owned-authorization-hooks.types.fixture.ts:51`
   still configures `basicRead: guard`, producing TS2322 (`GuardHook` is not
   assignable to `undefined`). The final broad command explicitly excludes this
   one legacy consumer suite. NOA-04 owns its migration along with strict/packed
   consumers; it is not a runtime failure or a passing consumer baseline. To
   reproduce that broader failure, remove the explicit `--exclude` argument.

No remaining scoped NOA-03 blocker was identified. NOA-04 still owns shipped
documentation/JSDoc and legacy installed-consumer migrations. Full package V2,
repository V3, strict/packed legacy checks and independent NOA-05 review are not
claimed passing. Final acceptance should review the shared resolver, all retained
capture seams and the small admission-order adjustment rather than relying on
this implementer's summary alone.

## Preservation limits

Scratch review covered build/typecheck logs, Vitest logs/JSON, formatting-only
generated patches/text, temporary declaration consumers and compiler/cache output.
This summary preserves commands, results, inventory, migration rationale and known
consumer failures. Raw logs contain local paths and are omitted, as are generated
consumers/dependencies/caches/database/build output and redundant formatting data.
Scratch locations above are historical outputs, not continuation prerequisites.
Maintained tests/current fixtures are the reproducible evidence; this summary-only
artifact is not a self-contained execution bundle. Other tasks' scratch and earlier
artifacts remain unchanged.

Final artifact review passed: local Markdown links resolve, this handoff and the
new capture test are not ignored, the machine-local-path/private-identifier scan is
clean, `pnpm exec prettier --check` on this handoff passes, and `git diff --check`
passes. The task file, legacy consumer fixtures and earlier evidence were not edited.
