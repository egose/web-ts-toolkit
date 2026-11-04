# NOA-02 explicit entry contexts: implementation handoff

Related contract: [NOA-02](../../../tasks/20261103-082614-access-router-nested-operation-access.md).
Dependency: [accepted NOA-01 handoff](../20261103-noa01-nested-rules/handoff.md).

This is the NOA-02 implementer's summary-only evidence, migration ledger, and
continuation index, not independent review or full release acceptance. Work used
the current shared worktree after NOA-01. No other agents, commits, pushes, task
status edits, documentation migration, or historical-evidence edits were made.
All previously observed changes were preserved.

## Files changed by NOA-02

Package paths below are relative to `packages/access-router/`.

- `src/core.ts`: live context-free base resolution and explicit three-context entry
  resolution share the NOA-01 selection helper; captured guard consumption remains
  first and unchanged.
- `src/core-data.ts`: equivalent live base/entry selection without model defaults.
- `src/routers/model-router.ts`: generated route admission always uses entry
  selection, with a required basic/advanced argument.
- `src/routers/model-router-route-context.ts`: requires that argument at every
  generated model route call site.
- `src/routers/model-router-collection-routes.ts`: `new` explicitly selects basic.
- `src/routers/model-router-document-routes.ts`: `delete` explicitly selects basic.
- `src/routers/model-router-subdocument-routes.ts`: create/delete and both single
  and bulk updates explicitly select basic.
- `src/routers/root-router.ts`: every model/data operation explicitly selects root;
  `subUpdate` and `subBulkUpdate` both map to `subs.<field>.update`.
- `test/operation-access-variants.contract.test.ts`: migrated built-core contract
  matrix, retaining all 68 tests; removed-map assertions now test diagnostic-only
  retired-name/member-path helpers and explicit denial, not compatibility aliases.
- `test/operation-access-model-routes.integration.test.ts`: migrated all 68 tests.
- `test/operation-access-data-subdocument-routes.integration.test.ts`: migrated all
  75 tests.
- `test/nested-operation-access-entries.integration.test.ts`: 100 new database-free
  entry/base tests, plus real in-memory data responses and trusted model-template
  service calls. Most allow cases deliberately return a service sentinel (400) to
  distinguish successful entry dispatch from NOA-03's secondary-policy behavior.
- This handoff is the only new durable artifact.

`src/routers/data-router.ts` already supplied explicit basic/advanced dispatch; its
NOA-01 setter changes were preserved without further edits. No NOA-01 helper,
admission, type, runtime, or captured-policy implementation was rewritten.

## Wiring and NOA-03 continuation

- `Core.isAllowedRoute` / `DataCore.isAllowedRoute` now accept
  `OperationAccessContext` (`basic | advanced | root`), not just `RouteVariant`.
  Generated router metadata still uses `RouteVariant` because those routes are
  basic/advanced only. Every generated model call now provides it explicitly.
- Each core's private `resolveOperationAccess` calls
  `resolveRouteOperationAccess` with `createOperationAccessReaders(...)`.
  Model readers receive **complete effective live model options** and **the same
  runtime's model defaults** separately. Data supplies only its own live options.
  These are raw exact own-data readers; no generic fallback getter is passed.
- Live `isAllowed(name, access)` omits context. It resolves an operation scalar or
  nested default, preserving outer fallback/closed-field rules. It never chooses a
  transport member from the HTTP method, request body, or an earlier entry check.
  There is no request-global mutable context.
- Model entry/base calls set `subdocuments: true`. Absent fields use top-level
  operation/context; defined field objects stay closed. Runtime exact specificity,
  shallow replacement, live fresh reads, and construction snapshots are retained.
- All nine supported top-level model operations use the rule union. Unpaired
  `GET /new` (including HEAD), `DELETE /:id`, and subdocument mutations choose
  basic. Root dispatch uses root for all supported model/data operations and maps
  existing sub-operation names to their base field operations. No wire names or
  endpoints were added. Both subdocument updates choose the same update member.
- Root's own scalar outer guard, per-entry unauthorized wrapping, and direct 401
  handling are unchanged. Route registration/OpenAPI and request-schema names,
  including `requestSchemas.advancedRead`, were not changed.
- **Keep the captured seam**: `Core.isAllowed` still calls
  `consumeCapturedModelOperationGuard` first and evaluates the supplied guard with
  the supplied captured permissions. NOA-02 does not reinterpret a captured raw
  object or replace it with a live lookup. NOA-03 must select a scalar base guard
  from owned captured readers before/within that existing flow.
- Known unchanged consumers: `PublicService.captureListFallbackAdmission` captures
  `getCapturedAuthorizationOption(configuration, 'operationAccess.list')` and
  passes it through `withCapturedModelOperationGuard`; `subdocumentGateAllowed`
  passes captured operation objects directly to the scalar evaluator. Those paths
  explain the five transitional failures below.
- `captureModelAuthorizationConfiguration` currently retains operation defaults
  only when the whole model option is undefined. NOA-03 still needs sufficient
  same-owner exact default data for captured field specificity, selected with the
  NOA-01 raw readers, with no live rereads after awaits.
- Related/private target admission, nested target-selector boundaries, captured
  retry/output checks, and in-flight policy ownership remain NOA-03 work. The
  existing `operation-access-boundaries.integration.test.ts` remains unmigrated for
  that task; its old root/trusted assertions must be reconciled with the new
  explicit-root contract, not restored as flat aliases.

## Maintained coverage ledger

- Model matrix: all seven pairs, both advanced reads, scalar fallback, replacement
  grants/denials, custom id/query/mutation segments, HEAD, live dotted/fluent/runtime
  setters, undefined inheritance, shallow replacement, immutable construction
  snapshots, authorization-before-validation/service/persistence, route/OpenAPI
  stability, upsert branches, field/row/hooks, and error statuses remain covered.
- Data/subdocument matrix: list/read pairs, variant-only grants, exact field versus
  top-level rules, closed fields, scalar fields, absent-field/legacy subs behavior,
  custom segments/identifiers, HEAD, live setters/snapshots, runtime isolation,
  registration/OpenAPI, unpaired mutations, and response visibility remain covered.
- The five secondary-policy assertions were **not** weakened, removed, skipped, or
  marked expected-failure. Their nested configurations are ready for NOA-03.
- New entry matrix covers root versus direct in both directions for every supported
  operation, both root read shapes, exact service-method dispatch/no dispatch on
  denial, scalar/undefined/empty-array fallback, every unpaired mapping, root outer
  admission, exact runtime-root specificity, omission versus explicit undefined,
  closed fields, context-free base calls after explicit root/advanced calls, hook
  binding/one-guard evaluation, and unchanged trusted service/field behavior.
- Remaining flat-spelled values in migrated files are negative retired-selector
  diagnostics, unchanged request-schema names, or deliberately wrong-policy hook
  traps outside operationAccess. No flat authorization aliases were introduced.

## Verification

Working directory: repository root. All builds/tests were serialized. A fresh
`_tmp-noa02-LRgrZ94s` directory was created with `mktemp` and confirmed ignored with
`git check-ignore`. The commands below use a quoted placeholder; replace
`<repo-root>` before execution. JSON/log outputs are historical scratch locations,
not continuation prerequisites. No source changes followed the final build.

```sh
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/nested-operation-access-resolution.contract.test.ts test/nested-operation-access-admission.contract.test.ts test/nested-operation-access-consumer-types.test.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/nested-operation-access-entries.integration.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa02-LRgrZ94s/final-focused-results.json'
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa02-LRgrZ94s/final-migrated-results.json'
```

- Fresh transitive build: passed for five packages, including CJS/ESM/declarations.
- Direct source typecheck: passed.
- Final focused run: **6 files, 433 passed, 0 failed**. Resolution 180, admission 54,
  installed-declaration consumers 3, retained baseline 28, migrated core variants
  68, new entry/base integration 100. The consumer run is NOA-01's focused nested
  declaration fixture, not the legacy strict/packed suite.
- Final migrated route run: **2 files, 138 passed, 5 failed** out of 143 tests
  (model 66/2, data/subdocument 72/3); MongoDB-backed tests ran. This reconciles with
  the earlier characterization. Across both final runs: **571 passed, 5 failed**
  out of 576 tests; no tests were skipped.
- Targeted ESLint, Prettier, and `git diff --check` passed. Exact formatting/lint
  commands use the twelve source/test paths listed above (excluding this handoff):

```sh
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm exec eslint packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/src/routers/model-router.ts packages/access-router/src/routers/model-router-route-context.ts packages/access-router/src/routers/model-router-collection-routes.ts packages/access-router/src/routers/model-router-document-routes.ts packages/access-router/src/routers/model-router-subdocument-routes.ts packages/access-router/src/routers/root-router.ts packages/access-router/test/operation-access-variants.contract.test.ts packages/access-router/test/operation-access-model-routes.integration.test.ts packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts packages/access-router/test/nested-operation-access-entries.integration.test.ts
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm exec prettier --check packages/access-router/src/core.ts packages/access-router/src/core-data.ts packages/access-router/src/routers/model-router.ts packages/access-router/src/routers/model-router-route-context.ts packages/access-router/src/routers/model-router-collection-routes.ts packages/access-router/src/routers/model-router-document-routes.ts packages/access-router/src/routers/model-router-subdocument-routes.ts packages/access-router/src/routers/root-router.ts packages/access-router/test/operation-access-variants.contract.test.ts packages/access-router/test/operation-access-model-routes.integration.test.ts packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts packages/access-router/test/nested-operation-access-entries.integration.test.ts
git diff --check
TMPDIR='<repo-root>/_tmp-noa02-LRgrZ94s' pnpm exec prettier --check docs/task-artifacts/access-router/20261103-092402-noa02-entry-contexts/handoff.md
```

Earlier new-test fixture failures were fixed, not deferred: avoid same-runtime
model/data operationId collisions; use the public root factory overload; do not
import an unexported enum or expect internal result `kind` on root wire results.
Vitest's config-loader future-compatibility warning remains non-fatal.

## Unresolved failures and remaining gates

The following are demonstrated transitional failures in the migrated fixtures, not
claimed passing or called pre-existing baselines. They are within NOA-03's reviewed
ownership and do not block the scope-limited NOA-02 entry-dispatch acceptance:

1. Model `advanced read retries use only base list: false`: expected the nested
   list-default hook twice, observed zero calls. The captured raw operation object
   denies without evaluating its default.
2. Model `advanced read retries use only base list: true`: expected 200, received
   401 for the same captured raw-object path.
3. Subdocument response-visibility case for `create` (the test title starts with
   `read.basic denial leaves unpaired subdocument`): expected visible rows,
   received `[]`.
4. The corresponding `single` update: expected the visible child, received `null`.
5. The corresponding `bulk` update: expected the visible child array, received
   `[]`. These three pass entry/service admission but captured response visibility
   still treats the nested read/list objects as scalar denials.

NOA-03 must restore these assertions through captured context-free selection, not
through live rereads, entry-member fallback, or relaxed response expectations.
It also owns the full related/private/selectors/capture inventory, beyond these
five observed failures. NOA-04 owns shipped docs/JSDoc, legacy strict/packed and
migration consumers; they were not run or edited. Full V1/V2/V3 integration and
independent final review remain later gates. No other NOA-02 blocker was found.

## Preservation limits

Reviewed scratch material consists of build/typecheck logs, test logs/JSON,
formatting-only generated patches, and disposable compiler working files. Tests
cleaned their generated consumers/databases. This curated handoff preserves
results, coverage migration, unresolved
failures, and continuation details. Raw logs/JSON contain local paths and are not
copied; dependencies, dist output, generated consumers, caches, and database files
are omitted. Maintained tests plus the recorded commands are the reproducible
inputs; this summary alone is not a self-contained reproduction bundle. Originals
and other tasks' scratch/evidence were left unchanged.

The two new durable files are confirmed not ignored. Handoff links resolve; the
local-path/private-identifier scan, final artifact formatting check, and whitespace
check pass.
